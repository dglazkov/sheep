/**
 * One session's home. Holds pi's storage, harness, lane, and model
 * runtime, plus the workspace and the shell, and drives operations on its
 * own event loop with an alarm as the heartbeat of anything left open.
 *
 * Mirrors `experimental/mini/worker/run.ts` in pi: open the session, build
 * an env, create the harness with the four tools, take the `main` lane,
 * resume whatever the previous incarnation left open.
 */
import {
  type AgentHarness as AgentHarnessInstance,
  type AgentHarnessTool,
  type AgentLane,
  AgentHarness,
  BACKGROUND_CONTEXT,
  type Context,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type Entry,
  type LaneSnapshot,
  type Session,
  withCancel,
} from "@earendil-works/pi-agent-core";
import { Server } from "@earendil-works/pi-server";
import type { SqliteSessionRepo } from "@earendil-works/pi-session-backend-sqlite-node/sqlite";
import { DurableObject } from "cloudflare:workers";
import { CellExecutionEnv } from "./env/execution-env.ts";
import { SHELL_SYSTEM_PROMPT_LINE } from "./env/shell-notice.ts";
import { type CellModels, createCellModels } from "./models.ts";
import { createCellSessionRepo } from "./storage/sqlite.ts";
import { createCellHost } from "./wire/host.ts";
import { WebSocketListener } from "./wire/listener.ts";
import { TEMP_ROOT } from "./workspace/files.ts";

/** How far ahead the heartbeat is armed while an operation is open. */
export const HEARTBEAT_MS = 5_000;

interface Runtime {
  repo: SqliteSessionRepo;
  session: Session;
  env: CellExecutionEnv;
  models: CellModels;
  harness: AgentHarnessInstance;
  lane: AgentLane;
  /** Cancels every detached drive this incarnation started. */
  drives: Set<() => void>;
  /** pi's protocol server over this cell's WebSockets. */
  server: Server;
  listener: WebSocketListener;
  serverId: string;
}

export interface CellState {
  id: string;
  tipId: string | null;
  operation: LaneSnapshot["operation"];
  model: { provider: string; modelId: string };
  serverId: string;
}

export interface TranscriptView extends CellState {
  entries: Entry[];
}

/** Test seam: the cell increments `step` at each transition and evicts itself when it equals `killAt`. */
export interface EvictionTestHooks {
  step: number;
  killAt: number;
  /** Tool effects observed, by tool name. */
  effects: Record<string, number>;
}

function systemPrompt(): string {
  return [
    "You are a coding agent working in a session that lives in a cell, not on a machine.",
    "Working directory: /workspace",
    "Use the read, write, edit, and bash tools to inspect and change files.",
    SHELL_SYSTEM_PROMPT_LINE,
    "Keep answers short and technical.",
  ].join("\n");
}

export class SessionCell extends DurableObject<Env> {
  #runtime: Promise<Runtime> | undefined;
  readonly test: EvictionTestHooks = { step: 0, killAt: -1, effects: {} };

  get sessionId(): string {
    const name = this.ctx.id.name;
    if (name === undefined) throw new Error("SessionCell must be addressed by name");
    return name;
  }

  /** The live runtime, booting it on first use and after every wake. */
  runtime(): Promise<Runtime> {
    this.#runtime ??= this.boot().catch((error: unknown) => {
      this.#runtime = undefined;
      throw error;
    });
    return this.#runtime;
  }

  private async boot(): Promise<Runtime> {
    const context = BACKGROUND_CONTEXT;
    const repo = await createCellSessionRepo(this.ctx.storage);
    const existing = (await repo.list(undefined, context)).find((metadata) => metadata.id === this.sessionId);
    const session = existing === undefined ? await repo.create({ id: this.sessionId }, context) : await repo.open(existing, context);
    const env = new CellExecutionEnv(this.ctx.storage.sql, {
      git: {
        ...(this.env.LAMB_GITHUB_TOKEN === undefined ? {} : { token: this.env.LAMB_GITHUB_TOKEN }),
        author: { name: this.env.LAMB_GIT_AUTHOR_NAME ?? "lamb", email: this.env.LAMB_GIT_AUTHOR_EMAIL ?? "lamb@localhost" },
      },
    });
    const models = createCellModels(this.env, { onProviderCall: () => this.transition() });
    const runtime: Partial<Runtime> = { repo, session, env, models, drives: new Set() };
    const { harness, open } = await AgentHarness.create(
      {
        session,
        models: models.models,
        model: models.model,
        tools: [createReadTool(), createWriteTool(), createEditTool(), createBashTool()].map((tool) => this.observe(tool)),
        toolContext: { env },
        systemPrompt: systemPrompt(),
      },
      context,
    );
    runtime.harness = harness;
    runtime.lane = await harness.lane("main", context);
    const directory = this.env.DIRECTORY.getByName("home");
    const serverId = await directory.serverId();
    const { host } = await createCellHost({
      serverId,
      sessionId: this.sessionId,
      metadata: session.metadata,
      lane: runtime.lane,
      directory: { list: () => directory.list(), create: (name) => directory.create(name) },
    });
    const listener = new WebSocketListener();
    const server = new Server(host, {
      listeners: [listener],
      serverId,
      onError: (error) => console.error(`[cell ${this.sessionId}] protocol server error:`, error.message),
    });
    await server.start();
    runtime.server = server;
    runtime.listener = listener;
    runtime.serverId = serverId;
    const ready = runtime as Runtime;
    // Whatever the last incarnation left open continues now, unasked.
    for (const operation of open) {
      const lane = operation.lane === "main" ? ready.lane : await harness.lane(operation.lane, context);
      this.detach(ready, (driveContext) => lane.resume(driveContext));
    }
    return ready;
  }

  /** Wraps a tool so the eviction test can count effects and pick a kill point after each one. */
  private observe<T extends AgentHarnessTool<{ env: CellExecutionEnv }>>(tool: T): T {
    const execute = tool.execute.bind(tool) as (...args: unknown[]) => Promise<unknown>;
    const observed = async (...args: unknown[]): Promise<unknown> => {
      const result = await execute(...args);
      this.test.effects[tool.name] = (this.test.effects[tool.name] ?? 0) + 1;
      await this.transition();
      return result;
    };
    return { ...tool, execute: observed as unknown as T["execute"] } as T;
  }

  /**
   * One point where a real cell might be evicted. If the test says so, this
   * incarnation is forgotten and the caller never returns: an evicted
   * isolate makes no further progress, and neither does this one.
   */
  private transition(): Promise<void> {
    this.test.step++;
    if (this.test.step !== this.test.killAt) return Promise.resolve();
    this.test.killAt = -1;
    void this.evict();
    return new Promise(() => {});
  }

  /**
   * What the platform does to a cell mid-turn: every in-flight drive is
   * abandoned without settling, the runtime is forgotten, and the next
   * touch boots a new one from storage. Test-only; production eviction is
   * the platform's.
   */
  async evict(): Promise<void> {
    const runtime = this.#runtime;
    this.#runtime = undefined;
    if (runtime === undefined) return;
    const live = await runtime.catch(() => undefined);
    if (live === undefined) return;
    for (const cancel of live.drives) cancel();
    live.drives.clear();
  }

  private detach(runtime: Runtime, run: (context: Context) => Promise<unknown>): void {
    const { context, cancel } = withCancel(BACKGROUND_CONTEXT);
    runtime.drives.add(cancel);
    void run(context)
      .catch(() => undefined)
      .finally(async () => {
        runtime.drives.delete(cancel);
        if (this.#runtime !== undefined && (await this.#runtime) === runtime) await this.settleAlarm(runtime);
      });
    void this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
  }

  /** Arms the heartbeat while an operation is open; clears it and `/tmp` when the lane idles. */
  private async settleAlarm(runtime: Runtime): Promise<void> {
    const execution = await runtime.lane.inspectExecution(BACKGROUND_CONTEXT);
    if (execution.current === null) {
      await this.ctx.storage.deleteAlarm();
      runtime.env.files.truncate(TEMP_ROOT);
    } else {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
    }
  }

  override async alarm(): Promise<void> {
    const runtime = await this.runtime();
    await this.settleAlarm(runtime);
  }

  async state(): Promise<CellState> {
    const runtime = await this.runtime();
    const handle = await runtime.lane.watch(BACKGROUND_CONTEXT);
    try {
      const { tipId, operation, configuration } = handle.snapshot;
      return { id: this.sessionId, tipId, operation, model: configuration.model, serverId: runtime.serverId };
    } finally {
      handle.unsubscribe();
    }
  }

  async transcript(): Promise<TranscriptView> {
    const runtime = await this.runtime();
    const handle = await runtime.lane.watch(BACKGROUND_CONTEXT);
    try {
      const { tipId, operation, configuration, transcript } = handle.snapshot;
      return { id: this.sessionId, tipId, operation, model: configuration.model, serverId: runtime.serverId, entries: transcript };
    } finally {
      handle.unsubscribe();
    }
  }

  /** Accepts a prompt and drives it detached; returns once the operation is durable. */
  async prompt(text: string): Promise<{ operationId: string }> {
    const runtime = await this.runtime();
    const admission = await runtime.lane.accept({ kind: "prompt", prompt: text }, BACKGROUND_CONTEXT);
    if (!admission.ok) throw new Error(`Prompt refused: ${admission.error._tag}`);
    const { operationId } = admission.value;
    this.detach(runtime, (context) => runtime.lane.drive({ operationId, waitForRetry: true, pollDeferred: true }, context));
    return { operationId };
  }

  async abort(): Promise<{ aborted: boolean }> {
    const runtime = await this.runtime();
    const result = await runtime.lane.abort(BACKGROUND_CONTEXT);
    return { aborted: result.ok };
  }

  /** Waits until the lane has no operation, or `timeoutMs` passes. */
  async waitForIdle(timeoutMs: number): Promise<CellState> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const state = await this.state();
      if (state.operation === null || Date.now() >= deadline) return state;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Every row pi's schema holds for this session, as JSON. A Durable Object
   * exposes no database file; `lamb export` rebuilds one from these rows.
   */
  async exportRows(): Promise<Record<string, Record<string, unknown>[]>> {
    await this.runtime();
    const tables = ["sessions", "entries", "scalar_values", "list_values", "usage_ledger", "branch_entries", "branch_meta"];
    const dump: Record<string, Record<string, unknown>[]> = {};
    for (const table of tables) {
      dump[table] = this.ctx.storage.sql
        .exec(`SELECT * FROM ${table} WHERE ${table === "sessions" ? "id" : "session_id"} = ?`, this.sessionId)
        .toArray() as Record<string, unknown>[];
    }
    return dump;
  }

  async readFile(path: string): Promise<string> {
    const runtime = await this.runtime();
    return runtime.env.files.readText(path);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    try {
      if (url.pathname === "/ws") {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected a WebSocket upgrade", { status: 426 });
        const runtime = await this.runtime();
        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];
        server.accept();
        runtime.listener.attach(server);
        return new Response(null, { status: 101, webSocket: client });
      }
      if (route === "GET /") return Response.json(await this.state());
      if (route === "GET /transcript") {
        const wait = Number(url.searchParams.get("wait") ?? "0");
        const since = url.searchParams.get("tip");
        const deadline = Date.now() + Math.min(wait, 25_000);
        for (;;) {
          const view = await this.transcript();
          const changed = view.tipId !== since || view.operation === null;
          if (changed || Date.now() >= deadline) return Response.json(view);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      if (route === "POST /prompt") {
        const body = (await request.json()) as { text?: unknown };
        if (typeof body.text !== "string" || body.text.length === 0) return new Response("text required", { status: 400 });
        return Response.json(await this.prompt(body.text));
      }
      if (route === "POST /abort") return Response.json(await this.abort());
      if (route === "GET /export") return Response.json(await this.exportRows());
      if (route === "GET /file") {
        const path = url.searchParams.get("path");
        if (!path) return new Response("path required", { status: 400 });
        return new Response(await this.readFile(path));
      }
      return new Response("not found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(message, { status: 500 });
    }
  }
}
