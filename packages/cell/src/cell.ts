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
  type MessageEntry,
  type Session,
  type WatchHandle,
  withCancel,
} from "@earendil-works/pi-agent-core";
import { Server } from "@earendil-works/pi-server";
import type { SqliteSessionRepo } from "@earendil-works/pi-session-backend-sqlite-node/sqlite";
import { DurableObject } from "cloudflare:workers";
import { BIRTH_ENTRY, BIRTH_TAIL_BYTES, BIRTH_TAIL_LINES, BIRTH_TIMEOUT_S, type BirthData, type BirthRecord, birthCommand, birthProjector } from "./birth.ts";
import { SETUP_KEPT, SETUP_KEY_PREFIX, type SetupRecord, setupRecordKey, setupTail } from "./bleat.ts";
import { type LaneState, taskOf } from "./directory.ts";
import { CellExecutionEnv, type ContainerLineResult, type SetupEnd, type SetupEvent, type SetupSecrets } from "./env/execution-env.ts";
import { eyesFor, sessionFor } from "./eyes/eyes.ts";
import { type CellModels, createCellModels, type FauxProgram, isFauxProgram } from "./models.ts";
import type { CacheCommit, Pasture } from "./pasture.ts";
import { CredentialBroker, PASTURE_GIT_TOKEN, pastureMinter, type PastureSecrets, type SheepSecrets, sheepMinter } from "./pen/broker.ts";
import type { CacheStore } from "./pen/cache.ts";
import type { PastureSource } from "./workspace/mount.ts";
import { DEFAULT_IDLE } from "./pen/container.ts";
import { DEFAULT_CPU_MS, Isolate } from "./pen/isolate.ts";
import { type ContainerStarter, parseDuration, PenLease } from "./pen/lease.ts";
import { type CellPasture, cellSystemPrompt } from "./prompt.ts";
import { createCellSessionRepo } from "./storage/sqlite.ts";
import { createCellHost } from "./wire/host.ts";
import { ENDED_CLOSE_CODE, ENDED_REASON, WebSocketListener } from "./wire/listener.ts";
import { HOME_ROOT, TEMP_ROOT, WORKSPACE_ROOT } from "./workspace/files.ts";

/** How far ahead the heartbeat is armed while an operation is open. */
export const HEARTBEAT_MS = 5_000;

/**
 * How much longer than the kill timeout the end waits for an aborted lane
 * to settle (end phase 0): the kill's deadline, then the sync-out and the
 * tool result behind it, then the turn's own settling. Past it the end goes
 * on; the drive is cancelled in the next step either way.
 */
export const END_SETTLE_MARGIN_MS = 2_000;

/** The end's answer: `aborted` is whether step 1 found a turn to stop. */
export interface EndReport {
  ended: true;
  aborted: boolean;
}

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
  /** Whether this incarnation has told the Directory the task, so the first prompt is reported once. */
  taskReported: boolean;
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
  /**
   * Bleat phase 0: this sheep's last setups, oldest first, beside the
   * entries and not among them. `sheep log` merges them into what it prints
   * by time; no model reads them.
   */
  setups: SetupRecord[];
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

/** The text of a user entry's message: the string it was, or its text parts, an image being no words. */
function promptText(entry: MessageEntry): string {
  const content = (entry.message as { content: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part: { type?: unknown; text?: unknown }) => (part.type === "text" && typeof part.text === "string" ? [part.text] : [])).join("\n");
}

/**
 * Setup's environment for one sheep (earmark phase 0): the pasture's
 * secrets, then the sheep's own laid over them by name, `GIT_TOKEN` out of
 * both, each read at the moment setup runs and kept nowhere. The env asks
 * at each setup run; this is what it asks. Fold phase 1: the answer says
 * which names were the sheep's own, from the same read, so a setup whose
 * environment held one never keeps the pasture's cache; no second read of
 * the Directory decides it.
 */
export function laidOver(pasture: { secrets(): Promise<Record<string, string>> }, sheep: SheepSecrets): SetupSecrets {
  return {
    async setupEnvironment() {
      const [herds, own] = await Promise.all([pasture.secrets(), sheep.secrets()]);
      const { [PASTURE_GIT_TOKEN]: _pastureToken, ...shared } = herds;
      const { [PASTURE_GIT_TOKEN]: _sheepToken, ...mine } = own;
      return { environment: { ...shared, ...mine }, own: Object.keys(mine).sort() };
    },
  };
}

/** The pasture's object as the cell's env reaches it: the stub's RPCs, by name. */
type PastureObject = Pick<
  DurableObjectStub<Pasture>,
  "snapshot" | "readByHash" | "read" | "secrets" | "cacheFor" | "cacheChunk" | "cacheMissing" | "cachePut" | "cacheCommit"
>;

/**
 * Everything a pastured cell's env asks of its pasture, over one stub: the
 * mount's reads, setup's environment with the sheep's secrets laid over
 * (earmark), and the cache's store (fold phase 1), whose commits this cell
 * signs as `by`. Boot builds it; a test builds the same one.
 */
export function pastureSourceFor(object: PastureObject, sheep: SheepSecrets, sessionId: string): PastureSource & SetupSecrets & CacheStore {
  return {
    snapshot: () => object.snapshot(),
    readByHash: (hash: string) => object.readByHash(hash),
    read: (path: string) => object.read(path),
    ...laidOver(object, sheep),
    cacheFor: (key: string) => object.cacheFor(key),
    cacheChunk: (hash: string) => object.cacheChunk(hash),
    cacheMissing: (save: string, hashes: string[]) => object.cacheMissing(save, hashes),
    cachePut: (save: string, hash: string, bytes: Uint8Array) => object.cachePut(save, hash, bytes),
    cacheCommit: (save: string, commit: Omit<CacheCommit, "by">) => object.cacheCommit(save, { ...commit, by: sessionId }),
  };
}

function seconds(value: string | undefined, fallback: number): number {
  const parsed = value === undefined || value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class SessionCell extends DurableObject<Env> {
  #runtime: Promise<Runtime> | undefined;
  /**
   * The lease of the incarnation booting or booted, set before the birth
   * runs: the container's `/pen` door admits through it without waiting
   * for the boot, since the birth's own container dials in while the boot
   * holds (pasture phase 3).
   */
  #lease: PenLease | undefined;
  /**
   * Bleat phase 0: the record each setup running now is being kept under,
   * by the millisecond it started, so the sink's end writes the record its
   * start minted. Per incarnation: a setup whose end never comes is the
   * next boot's stale `running` to clear, not this map's.
   */
  #setups = new Map<number, string>();
  /**
   * Whoever starts this cell's container, made once (end phase 0): the
   * lease rents through it, and the end asks it for the destroy whether or
   * not a lease is live, so an ended sheep's container goes even when the
   * incarnation that rented it was evicted.
   */
  #starter: ContainerStarter | undefined;
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
      this.#lease = undefined;
      throw error;
    });
    return this.#runtime;
  }

  private async boot(): Promise<Runtime> {
    const context = BACKGROUND_CONTEXT;
    const repo = await createCellSessionRepo(this.ctx.storage);
    const existing = (await repo.list(undefined, context)).find((metadata) => metadata.id === this.sessionId);
    const session = existing === undefined ? await repo.create({ id: this.sessionId }, context) : await repo.open(existing, context);
    const directory = this.env.DIRECTORY.getByName("home");
    // The cell learns its pasture from the directory's row, once, at boot: a row that names none, or no row, is lamb's sheep.
    const summary = await directory.get(this.sessionId);
    const pastureName = summary?.pasture ?? null;
    // Bleat phase 0: a row still saying `running` is an incarnation evicted mid-setup, whose socket went with it. It is
    // ended here, from the summary this boot already read, before the birth below can start a setup of its own.
    if (summary?.setup?.state === "running") {
      await directory.setupInterrupted(this.sessionId).catch((error: unknown) => console.error(`[cell ${this.sessionId}] could not end the interrupted setup:`, error instanceof Error ? error.message : error));
    }
    // One stub for the pasture's object: the prompt builder and the mount read through it, the program writes through it,
    // the checkout sends its tree as the second root, and the broker reads its `GIT_TOKEN` through it.
    const object = pastureName === null ? undefined : this.env.PASTURE.getByName(pastureName);
    const pasture: CellPasture | undefined = pastureName === null || object === undefined ? undefined : { name: pastureName, source: object };
    // The sheep's own secrets (earmark phase 0), from the Directory, at the moment of each use: setup's run and the broker.
    const sheep: SheepSecrets = { secrets: () => directory.secrets(this.sessionId) };
    const lease = this.leaseFor(pasture === undefined || object === undefined ? undefined : { name: pasture.name, object }, sheep);
    this.#lease = lease;
    // Tier 1 belongs to any home with the loader, container or not; `lease.socket` is whether a container is up.
    const loader = this.env.LOADER;
    const env = new CellExecutionEnv(this.ctx.storage.sql, {
      ...(lease === undefined ? {} : { container: lease, containerUp: () => lease.socket !== undefined, killTimeoutMs: seconds(this.env.PEN_KILL_TIMEOUT, 10) * 1000 }),
      ...(loader === undefined ? {} : { isolate: new Isolate(loader, { cpuMs: seconds(this.env.PEN_ISOLATE_CPU_MS, DEFAULT_CPU_MS) }) }),
      // The eyes (eyes phase 1), over the env's own files table and this cell's SQLite for the session row; `eyesFor` decides
      // whether this home has any, and a home without the binding gets none and no `look`.
      eyes: (files) => eyesFor(this.env, files, this.ctx.storage.sql),
      // Bleat phase 0: the sink, closing over the Directory stub and this cell's storage and nothing else — the lane is
      // not made yet when the birth's setup runs through it, and is not what a setup has anything to say to.
      onSetup: (event) => this.recordSetup(directory, event),
      // The mount and the program, both over the one stub: what the program puts, the mount's next call reads. Setup's
      // secrets are the pasture's with the sheep's laid over them (earmark phase 0), both read when setup runs.
      ...(pasture === undefined || object === undefined
        ? {}
        : {
            // The cache's store too (fold phase 1): what this cell's setups keep, signed with its id.
            pasture: pastureSourceFor(object, sheep, this.sessionId),
            pastureProgram: { name: pasture.name, sessionId: this.sessionId, object, herd: () => directory.herd(pasture.name), cache: () => object.cacheSummary() },
          }),
    });
    const models = createCellModels(this.env, { onProviderCall: () => this.transition(), program: () => this.fauxProgram() });
    const runtime: Partial<Runtime> = { repo, session, env, lease, models, drives: new Set(), reported: undefined, taskReported: false };
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
        // The birth's entry is context: the model reads it as a message before the first prompt (pasture phase 3).
        entryProjectors: { [BIRTH_ENTRY]: birthProjector },
      },
      context,
    );
    runtime.harness = harness;
    runtime.lane = await harness.lane("main", context);
    runtime.watch = await runtime.lane.watch(context);
    // The birth, before the server starts and before this incarnation is anyone's to prompt: the boot holds until it
    // settles, so the first prompt, over HTTP or the wire, is taken after the entry is on the lane. Only the container's
    // door (`/pen`) is answered meanwhile, through `#lease`, since the birth's own container dials in now.
    if (pasture !== undefined && object !== undefined) await this.birth(runtime.lane, env, pasture, object, directory);
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
      case "entry_added":
        // The prompt, as the lane took it: over the wire, over HTTP, or as a queued follow-up, it is an entry here.
        if (event.entry.type === "message" && event.entry.message.role === "user") this.reportTask(runtime, event.entry);
        return;
      default:
        return;
    }
  }

  /**
   * Tells the Directory what this sheep was asked, the way `report` tells
   * it the lane's state: the first line of the first prompt, once. An
   * incarnation booted later in the sheep's life sees a later prompt
   * first and says nothing, since the first is in the transcript before
   * it; the Directory keeps the first report either way.
   */
  private reportTask(runtime: Runtime, entry: MessageEntry): void {
    if (runtime.taskReported) return;
    runtime.taskReported = true;
    const first = runtime.watch.snapshot.transcript.find((candidate) => candidate.type === "message" && candidate.message.role === "user");
    if (first !== undefined && first.id !== entry.id) return;
    const task = taskOf(promptText(entry));
    this.env.DIRECTORY.getByName("home")
      .setTask(this.sessionId, task)
      .catch((error: unknown) => console.error(`[cell ${this.sessionId}] could not report the task:`, error instanceof Error ? error.message : error));
  }

  /**
   * The birth (pasture phase 3): once, on the first boot of a cell born
   * into a pasture with a repository, with an empty workspace, `git clone
   * --branch <branch> <repo> .` in `/workspace` through the container path,
   * its tail appended as the `birth` entry, success or failure, and the
   * fact that it ran recorded so no later boot clones again; from pasture
   * phase 4, `setup.sh` follows a clone that exited 0. Nothing here
   * throws: a birth that cannot run is an entry that says why, and the
   * sheep is alive after it either way. The directory sees `running` for
   * its length, so `sheep ls` says what the sheep is doing.
   */
  private async birth(
    lane: AgentLane,
    env: CellExecutionEnv,
    pasture: CellPasture,
    object: Pick<PastureSecrets, "meta">,
    directory: { setState(id: string, state: LaneState): Promise<void> },
  ): Promise<void> {
    if ((await this.ctx.storage.get<BirthRecord>(BIRTH_ENTRY)) !== undefined) return;
    let meta: Awaited<ReturnType<PastureSecrets["meta"]>>;
    try {
      meta = await object.meta();
    } catch (error) {
      console.error(`[cell ${this.sessionId}] could not read the pasture's meta for the birth:`, error instanceof Error ? error.message : error);
      return;
    }
    // A pasture with no repository has no birth; a workspace that is not empty is not born into.
    if (meta === undefined || meta.repo === null) return;
    if (env.files.manifest().length !== 0) return;
    const command = birthCommand(meta.repo, meta.branch);
    const log = (line: string) => console.info(`[cell ${this.sessionId}] birth: ${line}`);
    const tell = (state: LaneState) => directory.setState(this.sessionId, state).catch((error: unknown) => console.error(`[cell ${this.sessionId}] could not report ${state}:`, error instanceof Error ? error.message : error));
    log(`${command} in ${WORKSPACE_ROOT}`);
    await tell("running");
    const started = Date.now();
    let ran: ContainerLineResult;
    try {
      // Setup after the clone (pasture phase 4): `/pasture/setup.sh`, when the tree has one, runs on the clone in the same
      // container through the same path a tool's line takes, and its output joins this entry's when it fails.
      ran = await env.containerLine(command, { cwd: WORKSPACE_ROOT, timeout: BIRTH_TIMEOUT_S, maxLines: BIRTH_TAIL_LINES, maxBytes: BIRTH_TAIL_BYTES, setup: "after" });
    } catch (error) {
      ran = { output: "", truncated: false, end: { error: error instanceof Error ? error.message : String(error) } };
    }
    const data: BirthData = {
      pasture: pasture.name,
      repo: meta.repo,
      branch: meta.branch,
      command,
      cwd: WORKSPACE_ROOT,
      ...("exit" in ran.end ? { exit: ran.end.exit } : { error: ran.end.error }),
      output: ran.output,
      truncated: ran.truncated,
      ...(ran.setup === undefined ? {} : { setup: ran.setup }),
      // Fold phase 1: `~` where it is kept, on a home that keeps it; and what the pasture's cache came to around setup.
      ...(env.homeDir === HOME_ROOT ? { home: HOME_ROOT } : {}),
      ...(ran.cache === undefined ? {} : { cache: ran.cache }),
    };
    const cacheEnded = ran.cache === undefined ? "" : `, cache ${ran.cache.found}${ran.cache.kept ? " and kept" : ran.cache.refused === undefined ? "" : " and not kept"}`;
    const setupEnded = ran.setup === undefined ? "" : `, setup ${"exit" in ran.setup ? `exit ${ran.setup.exit}` : `could not run: ${ran.setup.error}`}${cacheEnded}`;
    log(`${"exit" in ran.end ? `exit ${ran.end.exit}` : `could not run: ${ran.end.error}`}${setupEnded} after ${Date.now() - started} ms, ${env.files.manifest().length} rows`);
    try {
      // The entry first, then the record: a cell evicted between the two clones again only into a workspace still empty.
      await lane.appendCustomEntry(BIRTH_ENTRY, { ...data }, BACKGROUND_CONTEXT);
      await this.ctx.storage.put<BirthRecord>(BIRTH_ENTRY, { at: started, ...ran.end });
    } catch (error) {
      console.error(`[cell ${this.sessionId}] could not record the birth:`, error instanceof Error ? error.message : error);
    }
    await tell("idle");
  }

  /**
   * The sink (bleat phase 0), wired at boot and called by the env at the
   * start of every setup and at its end. Two things happen at each call and
   * in this order: the cell's own record, which `sheep log` prints as the
   * block, and the Directory's row, which every dog asking what this sheep
   * is doing reads. The record is minted at the start so a dog holding a
   * prompt sees the block exist while setup runs, and replaced at the end
   * with the output's tail and how it ended.
   *
   * The key is the millisecond the setup started, so the keys sort in the
   * order the setups ran and the oldest beyond `SETUP_KEPT` are the ones
   * deleted. Two setups in one millisecond would otherwise be one record,
   * so a taken key moves the next one on; the record's `at` is the setup's
   * own either way, which is what the sink's end is found by.
   */
  private async recordSetup(
    directory: {
      setupStarted(id: string, at: number): Promise<void>;
      setupEnded(id: string, at: number, ms: number, end: SetupEnd): Promise<void>;
    },
    event: SetupEvent,
  ): Promise<void> {
    if (event.phase === "start") {
      let key = event.at;
      while ((await this.ctx.storage.get(setupRecordKey(key))) !== undefined) key++;
      const id = setupRecordKey(key);
      this.#setups.set(event.at, id);
      await this.ctx.storage.put<SetupRecord>(id, { id, at: event.at, command: event.command, output: "", truncated: false });
      await directory.setupStarted(this.sessionId, event.at);
      return;
    }
    const id = this.#setups.get(event.at) ?? setupRecordKey(event.at);
    this.#setups.delete(event.at);
    const tail = setupTail(event.output);
    await this.ctx.storage.put<SetupRecord>(id, {
      id,
      at: event.at,
      ms: event.ms,
      command: event.command,
      ...("exit" in event.end ? { exit: event.end.exit } : { error: event.end.error }),
      output: tail.output,
      truncated: tail.truncated,
      ...(event.cache === undefined ? {} : { cache: event.cache }),
    });
    await directory.setupEnded(this.sessionId, event.at, event.ms, event.end);
    // The last twenty: a sheep that has rented fifty containers has its last twenty setups, and a log that wants more
    // than that wants the home's own logs.
    const keys = [...(await this.ctx.storage.list({ prefix: SETUP_KEY_PREFIX })).keys()];
    if (keys.length > SETUP_KEPT) await this.ctx.storage.delete(keys.slice(0, keys.length - SETUP_KEPT));
  }

  /** This sheep's last setups, oldest first, as the keys sort: the transcript view's `setups`. */
  private async setups(): Promise<SetupRecord[]> {
    return [...(await this.ctx.storage.list<SetupRecord>({ prefix: SETUP_KEY_PREFIX })).values()];
  }

  private async settleWhenCurrent(runtime: Runtime): Promise<void> {
    if (this.#runtime === undefined || (await this.#runtime) !== runtime) return;
    await this.settleAlarm(runtime);
  }

  /**
   * Whoever starts this cell's container, when the home has one: the
   * `PEN_CONTAINER` binding when bound, else a starter the test set before
   * the first boot; `undefined` on a home with neither. Made once and kept,
   * so the lease and the end (end phase 0) ask the same one. Configuration,
   * never the platform: nothing here asks where it runs.
   */
  private starterFor(): ContainerStarter | undefined {
    if (this.#starter !== undefined) return this.#starter;
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
    this.#starter = starter;
    return starter;
  }

  /**
   * Tier 2 for this cell, when the home has it: a lease over the starter.
   * A home with none has no tier 2, and the shell does not route.
   */
  private leaseFor(pasture: { name: string; object: PastureSecrets } | undefined, sheep: SheepSecrets): PenLease | undefined {
    const starter = this.starterFor();
    if (starter === undefined) return undefined;
    const directory = this.env.DIRECTORY.getByName("home");
    const origin = this.env.PEN_CELL_ORIGIN;
    const idleSeconds = parseDuration(this.env.PEN_IDLE, DEFAULT_IDLE);
    const log = (line: string) => console.info(`[cell ${this.sessionId}] pen: ${line}`);
    // The broker answers the container's credential requests from the home's secrets, read at each request; the cell keeps none.
    // For a sheep in a pasture, the pasture's `GIT_TOKEN` is read before the home's, over RPC, at each request too (pasture
    // phase 3); the sheep's own, from the Directory, is read before either (earmark phase 0).
    const env = this.env;
    const home = {
      get gitToken() {
        return env.PEN_GIT_TOKEN;
      },
      get gitHost() {
        return env.PEN_GIT_HOST;
      },
    };
    const broker = new CredentialBroker(pasture === undefined ? sheepMinter(sheep, home) : pastureMinter(pasture.name, pasture.object, home, Date.now, sheep), log);
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
    // The door follows the runtime: a container dialing in after the eviction meets the next incarnation's lease, as before.
    this.#lease = undefined;
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
      // Bleat phase 0: the setups beside the entries, never among them — they are sheep's own rows, and no model reads them.
      return { id: this.sessionId, tipId, operation, model: configuration.model, serverId: runtime.serverId, entries: transcript, setups: await this.setups() };
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

  /**
   * The cell's end (end phase 0): everything minting and working gave this
   * sheep, released in the order that costs least if the end is cut short.
   * Each step goes on if the one before failed, so an end interrupted by an
   * eviction can be asked again and finishes; a step that failed makes the
   * whole end fail after the rest ran, so the Worker keeps the row and the
   * dog asks again. Idempotent: a second end finds nothing at every step.
   *
   * 1. The open turn is aborted, as `abort()` aborts it: pi cancels the
   *    tool, the env's kill path ends the command in the container and
   *    records it on the container's ledger, and the end waits for the lane
   *    to settle, bounded by the kill timeout plus a margin. A runtime that
   *    is not live has no turn running anywhere: the platform evicted it,
   *    and the alarm that would resume it goes in step 5 before it fires.
   * 2. The terminals are disconnected: every WebSocket the listener holds
   *    is closed with `ended`, the drives are cancelled and the watch
   *    unsubscribed, as `evict()` does, and the runtime and the door are
   *    forgotten so nothing dials into an ended cell.
   * 3. The container is destroyed, through the starter, whether or not a
   *    lease is live and whether or not a container was ever started. The
   *    lease, if live, lets go first so its socket closes and its
   *    keep-alive stops.
   * 4. The browser is closed, by its kept id, never launched.
   * 5. The storage is emptied: the alarm, then every table and key.
   */
  async end(): Promise<EndReport> {
    const id = this.sessionId;
    const log = (line: string) => console.info(`[cell ${id}] end: ${line}`);
    const failures: string[] = [];
    const attempt = async (step: string, run: () => Promise<void>): Promise<void> => {
      try {
        await run();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`${step} failed: ${message}`);
        failures.push(`${step}: ${message}`);
      }
    };
    const booted = this.#runtime;
    // A boot that failed, or one still failing, is no runtime: there is nothing live to abort or disconnect.
    const runtime = booted === undefined ? undefined : await booted.catch(() => undefined);

    // 1. The open turn.
    let aborted = false;
    if (runtime !== undefined) {
      await attempt("abort", async () => {
        const result = await runtime.lane.abort(BACKGROUND_CONTEXT);
        aborted = result.ok;
        if (!aborted) return;
        const bound = seconds(this.env.PEN_KILL_TIMEOUT, 10) * 1000 + END_SETTLE_MARGIN_MS;
        const deadline = Date.now() + bound;
        while ((await runtime.lane.inspectExecution(BACKGROUND_CONTEXT)).current !== null) {
          if (Date.now() >= deadline) {
            log(`the aborted turn did not settle within ${bound} ms; going on`);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        log("the open turn was aborted and settled");
      });
    }

    // 2. The terminals, the drives, the watch; and the runtime and the door forgotten, as `evict()` forgets them.
    this.#runtime = undefined;
    this.#lease = undefined;
    if (runtime !== undefined) {
      await attempt("disconnect", async () => {
        for (const cancel of runtime.drives) cancel();
        runtime.drives.clear();
        runtime.watch.unsubscribe();
        const terminals = runtime.listener.connectionCount;
        await runtime.listener.close(ENDED_CLOSE_CODE, ENDED_REASON);
        log(`${terminals} terminal${terminals === 1 ? "" : "s"} disconnected`);
        // The protocol server behind them, best effort: its sockets are already closed, and nothing routes here again.
        await runtime.server.close().catch((error: unknown) => log(`the protocol server did not close cleanly: ${error instanceof Error ? error.message : String(error)}`));
      });
    }

    // 3. The container.
    await attempt("destroy", async () => {
      runtime?.lease?.close(ENDED_REASON);
      const starter = this.starterFor();
      if (starter === undefined) return;
      await starter.destroy();
      log("the container was destroyed");
    });

    // 4. The browser.
    await attempt("close the browser", async () => {
      const session = runtime?.env.eyes?.session ?? sessionFor(this.env, this.ctx.storage.sql);
      if (session === undefined) return;
      const kept = session.id();
      await session.close();
      if (kept !== undefined) log(`the browser session ${kept} was closed`);
    });

    // 5. The storage.
    await attempt("empty the storage", async () => {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      log("the storage was emptied");
    });

    if (failures.length > 0) throw new Error(`the end of ${id} did not finish: ${failures.join("; ")}`);
    return { ended: true, aborted };
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
        // Answered through the lease of the incarnation booting or booted, not the runtime: during the birth the boot
        // holds, and the container it rented is the one dialing in (pasture phase 3).
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected a WebSocket upgrade", { status: 426 });
        let lease = this.#lease;
        if (lease === undefined) {
          await this.runtime();
          lease = this.#lease;
        }
        const client = lease?.admit(url.searchParams.get("token") ?? "");
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
      if (route === "DELETE /") return Response.json(await this.end());
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
