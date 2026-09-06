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
  type HarnessEvent,
  type LaneSnapshot,
  type Session,
  type WatchHandle,
  withCancel,
} from "@earendil-works/pi-agent-core";
import { Server } from "@earendil-works/pi-server";
import type { SqliteSessionRepo } from "@earendil-works/pi-session-backend-sqlite-node/sqlite";
import { DurableObject } from "cloudflare:workers";
import type { LaneState } from "./directory.ts";
import { CellExecutionEnv } from "./env/execution-env.ts";
import { type CellModels, createCellModels, type FauxProgram, isFauxProgram } from "./models.ts";
import { CredentialBroker, homeMinter } from "./pen/broker.ts";
import { DEFAULT_IDLE } from "./pen/container.ts";
import { DEFAULT_CPU_MS, Isolate } from "./pen/isolate.ts";
import { type ContainerStarter, parseDuration, PenLease } from "./pen/lease.ts";
import { type CellPasture, cellSystemPrompt } from "./prompt.ts";
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
  /** Tier 2, when this home has a container: the lease the shell rents from and the `/pen` door admits into. */
  lease: PenLease | undefined;
  models: CellModels;
  harness: AgentHarnessInstance;
  lane: AgentLane;
  /** Cancels every detached drive this incarnation started. */
  drives: Set<() => void>;
  /** The lane's events, whoever drives it: the wire, the HTTP face, or a resume. */
  watch: WatchHandle<LaneSnapshot>;
  /** The lane state last told to the Directory, so a transition is reported once. */
  reported: LaneState | undefined;
  /** pi's protocol server over this cell's WebSockets. */
  server: Server;
  listener: WebSocketListener;
  serverId: string;
}

/**
 * The cell's HTTP answer to a prompt: pi's `AgentOperationResponse` when
 * the lane took it as an operation, pi's `AgentQueueResponse` when the lane
 * was busy and the prompt was queued as a follow-up.
 */
export type PromptResponse = { accepted: true; operationId: string; error: null } | { accepted: true; entryId: string; error: null };

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

/**
 * Test seams. The cell increments `step` at each transition and evicts
 * itself when it equals `killAt`. A `starter` set before the first boot
 * gives the cell a container it can rent without the Containers binding:
 * the pool cannot bind a `PenContainer`, so the tests start the fake
 * through the same lease and the same `/pen` door.
 */
export interface EvictionTestHooks {
  step: number;
  killAt: number;
  /** Tool effects observed, by tool name. */
  effects: Record<string, number>;
  starter?: ContainerStarter;
}

function seconds(value: string | undefined, fallback: number): number {
  const parsed = value === undefined || value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    const lease = this.leaseFor();
    const directory = this.env.DIRECTORY.getByName("home");
    // The cell learns its pasture from the directory's row, once, at boot: a row that names none, or no row, is lamb's sheep.
    const pastureName = (await directory.get(this.sessionId))?.pasture ?? null;
    const pasture: CellPasture | undefined = pastureName === null ? undefined : { name: pastureName, source: this.env.PASTURE.getByName(pastureName) };
    // Tier 1 belongs to any home with the loader, container or not; `lease.socket` is whether a container is up.
    const loader = this.env.LOADER;
    const env = new CellExecutionEnv(this.ctx.storage.sql, {
      ...(lease === undefined ? {} : { container: lease, containerUp: () => lease.socket !== undefined, killTimeoutMs: seconds(this.env.PEN_KILL_TIMEOUT, 10) * 1000 }),
      ...(loader === undefined ? {} : { isolate: new Isolate(loader, { cpuMs: seconds(this.env.PEN_ISOLATE_CPU_MS, DEFAULT_CPU_MS) }) }),
      ...(pasture === undefined ? {} : { pasture: pasture.source }),
    });
    const models = createCellModels(this.env, { onProviderCall: () => this.transition(), program: () => this.fauxProgram() });
    const runtime: Partial<Runtime> = { repo, session, env, lease, models, drives: new Set(), reported: undefined };
    const { harness, open } = await AgentHarness.create(
      {
        session,
        models: models.models,
        model: models.model,
        tools: [createReadTool(), createWriteTool(), createEditTool(), createBashTool()].map((tool) => this.observe(tool)),
        toolContext: { env },
        // Resolved at every model call, so the line says what this home has now: the container, or the budget spent;
        // and, with a pasture, the brief and the skills as the tree has them now.
        systemPrompt: async () => cellSystemPrompt(await env.homeNow(), pasture),
      },
      context,
    );
    runtime.harness = harness;
    runtime.lane = await harness.lane("main", context);
    runtime.watch = await runtime.lane.watch(context);
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
    // The lane's transitions are the Directory's state column and the heartbeat, whoever drives.
    ready.watch.start((event) => this.observeLane(ready, event));
    // Whatever the last incarnation left open continues now, unasked.
    for (const operation of open) {
      const lane = operation.lane === "main" ? ready.lane : await harness.lane(operation.lane, context);
      this.detach(ready, (driveContext) => lane.resume(driveContext));
    }
    return ready;
  }

  /**
   * One listener on the lane, so a turn started over the wire, over HTTP, or
   * by a resume reports the same way. Nothing here awaits the lane: the
   * event is delivered from inside its commit.
   */
  private observeLane(runtime: Runtime, event: HarnessEvent): void {
    switch (event.type) {
      case "run_start":
      case "run_resume":
      case "retry_start":
      case "compaction_start":
      case "navigation_start":
        this.report(runtime, "running");
        void this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
        return;
      case "retry_scheduled":
      case "run_suspend":
        this.report(runtime, "waiting");
        return;
      case "run_end":
      case "compaction_end":
      case "navigation_end":
        void this.settleWhenCurrent(runtime);
        return;
      default:
        return;
    }
  }

  private async settleWhenCurrent(runtime: Runtime): Promise<void> {
    if (this.#runtime === undefined || (await this.#runtime) !== runtime) return;
    await this.settleAlarm(runtime);
  }

  /**
   * Tier 2 for this cell, when the home has it: the `PEN_CONTAINER`
   * binding when bound, else a starter the test set before the first boot.
   * Configuration, never the platform: nothing here asks where it runs. A
   * home with none has no tier 2, and the shell does not route.
   */
  private leaseFor(): PenLease | undefined {
    const binding = this.env.PEN_CONTAINER;
    const starter: ContainerStarter | undefined =
      this.test.starter ??
      (binding !== undefined
        ? (() => {
            const stub = binding.getByName(this.sessionId);
            return {
              ensure: (args) => stub.ensure(args),
              renew: () => stub.renew(),
              destroy: () => stub.destroy(),
            };
          })()
        : undefined);
    if (starter === undefined) return undefined;
    const directory = this.env.DIRECTORY.getByName("home");
    const origin = this.env.PEN_CELL_ORIGIN;
    const idleSeconds = parseDuration(this.env.PEN_IDLE, DEFAULT_IDLE);
    const log = (line: string) => console.info(`[cell ${this.sessionId}] pen: ${line}`);
    // The broker answers the container's credential requests from the home's secrets, read at each request; the cell keeps none.
    const env = this.env;
    const broker = new CredentialBroker(
      homeMinter({
        get gitToken() {
          return env.PEN_GIT_TOKEN;
        },
        get gitHost() {
          return env.PEN_GIT_HOST;
        },
      }),
      log,
    );
    return new PenLease({
      sessionId: this.sessionId,
      cellUrl: origin === undefined || origin === "" ? undefined : `${origin.replace(/\/$/, "")}/s/${encodeURIComponent(this.sessionId)}/pen`,
      starter,
      ledger: { spent: async () => (await directory.budget()).spent },
      startTimeoutMs: seconds(this.env.PEN_START_TIMEOUT, 90) * 1000,
      renewEveryMs: Math.max(1_000, Math.min((idleSeconds * 1000) / 2, 60_000)),
      broker,
      log,
    });
  }

  /** Tells the Directory the lane's state, once per change. */
  private report(runtime: Runtime, state: LaneState): void {
    if (runtime.reported === state) return;
    runtime.reported = state;
    this.env.DIRECTORY.getByName("home")
      .setState(this.sessionId, state)
      .catch((error: unknown) => console.error(`[cell ${this.sessionId}] could not report ${state}:`, error instanceof Error ? error.message : error));
  }

  /** With the faux provider: this cell's own program, else the home's default, else none. */
  private async fauxProgram(): Promise<FauxProgram | undefined> {
    if (this.env.SHEEP_PROVIDER !== "faux") return undefined;
    const own = await this.ctx.storage.get<FauxProgram>("faux-program");
    return own ?? (await this.env.DIRECTORY.getByName("home").fauxProgram());
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
    live.watch.unsubscribe();
  }

  private detach(runtime: Runtime, run: (context: Context) => Promise<unknown>): void {
    const { context, cancel } = withCancel(BACKGROUND_CONTEXT);
    runtime.drives.add(cancel);
    // The drive outlives the request that started it, so the platform is told: work no request and no
    // `waitUntil` covers is the platform's to keep or drop, and this must be kept.
    this.ctx.waitUntil(
      run(context)
        .catch(() => undefined)
        .finally(async () => {
          runtime.drives.delete(cancel);
          if (this.#runtime !== undefined && (await this.#runtime) === runtime) await this.settleAlarm(runtime);
        }),
    );
    void this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
  }

  /** Arms the heartbeat while an operation is open; clears it and `/tmp` when the lane idles. Reports either way. */
  private async settleAlarm(runtime: Runtime): Promise<void> {
    const execution = await runtime.lane.inspectExecution(BACKGROUND_CONTEXT);
    if (execution.current === null) {
      await this.ctx.storage.deleteAlarm();
      runtime.env.files.truncate(TEMP_ROOT);
      this.report(runtime, "idle");
    } else {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
      if (runtime.reported !== "waiting") this.report(runtime, "running");
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

  /**
   * Accepts a prompt and drives it detached; returns once the operation is
   * durable. A busy lane queues it as pi's follow-up instead, taken up when
   * the running turn ends, and the answer says which happened.
   */
  async prompt(text: string): Promise<PromptResponse> {
    const runtime = await this.runtime();
    const admission = await runtime.lane.accept({ kind: "prompt", prompt: text }, BACKGROUND_CONTEXT);
    if (!admission.ok) {
      if (admission.error._tag !== "LaneBusy") throw new Error(`Prompt refused: ${admission.error._tag}`);
      const queued = await runtime.lane.followUp(text, undefined, BACKGROUND_CONTEXT);
      if (!queued.ok) throw new Error(`Prompt not queued: ${queued.error._tag}`);
      return { accepted: true, entryId: queued.value.entryId, error: null };
    }
    const { operationId } = admission.value;
    this.detach(runtime, (context) => runtime.lane.drive({ operationId, waitForRetry: true, pollDeferred: true }, context));
    return { accepted: true, operationId, error: null };
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
   * exposes no database file; `sheep export` rebuilds one from these rows.
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
      if (url.pathname === "/pen") {
        // The container's door: the token is the one the lease minted for it, never the home's, and it is spent on use.
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected a WebSocket upgrade", { status: 426 });
        const runtime = await this.runtime();
        const client = runtime.lease?.admit(url.searchParams.get("token") ?? "");
        if (client === undefined) return new Response("no container is expected with this token", { status: 403 });
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
      if (route === "POST /faux" && this.env.SHEEP_PROVIDER === "faux") {
        // Test-only: the program this cell's faux model answers from.
        const program: unknown = await request.json();
        if (!isFauxProgram(program)) return new Response("a faux program is { steps: [{ text | tool: { name, args }, delayMs? }, …] }", { status: 400 });
        await this.ctx.storage.put("faux-program", program);
        return Response.json({ steps: program.steps.length });
      }
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
