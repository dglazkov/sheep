/**
 * The body (collie phase 1; design.md, "The body: an object that never
 * sleeps"): one Durable Object, `Collie`, named `collie`, that runs isocan's
 * rc room for every canvas it was handed, awake, and keeps what the room
 * needs in its own SQLite.
 *
 *   badges     one per isocan home: the badge the door handed this object there, and its secret; never leaves the object
 *   rooms      one per canvas: its id, title, home, and the person whose pass opened it (whose word it takes)
 *   agents     the rc rows, `RcAgentRow` as JSON, with how the agent came: born here, or handed over
 *   state      the room's key-value (`rc:`), and the collie's own (`collie:`): the agent-key secret, the switch, since when,
 *              each agent's turn times, and the resume rule's marks
 *   narration  the rc's lines, seq and time and room, the last 5,000
 *
 * The brain is isocan's (`isocan/rc`): what a summons is, whom an agent
 * answers, and every line the room says are the module's. What is written
 * here is what the module asks a host for, in `RoomDeps`, and the four acts
 * around it: a pass redeemed into a room, the switch, the end, and the
 * report. A pass is spent at once and kept nowhere: not in a row, not in
 * `state`, not in a line.
 */
import { DurableObject } from "cloudflare:workers";
import { ApiError, canvasUrlWithPass, DaemonRoutes, endSheep, isLoopbackBase, parseCanvasAddress, runRoom, SHEEP_HARNESS, SheepAgent, type BadgeStore, type RcAgentRow, type Room, type RoomAdapter, type RoomDeps, type RoomHarness, type RoomRows, type RoomState, type StoredBadge } from "isocan/rc";
import { StationClient, StationSentence, stationCommands, type Station } from "./sheep.ts";

type Actor = RoomDeps["owner"];
type RcAsk = Parameters<RoomDeps["enrol"]>[0];

/** The limits a laptop's rc runs with when `config.json` says nothing: twelve turns an agent an hour, three agent-to-agent turns in a row. */
export const LIMITS = { turnsPerHour: 12, agentChain: 3 } as const;
/** How many narration rows are kept. */
export const NARRATION_KEPT = 5_000;
/** The directory an agent's row names: there is none at a collie, so the constant names the object. */
export const COLLIE_CWD = "collie:object";
/** A lap: how far ahead the alarm is armed while on. */
const DEFAULT_LAP_MS = 30_000;

/** One canvas the collie stands by on, as the wire names it. */
export interface RoomView {
  canvasId: string;
  title: string;
  origin: string;
  address: string;
}

export interface AgentView {
  name: string;
  actorId: string;
  sheep: string | null;
  lane: "idle" | "running" | "waiting" | null;
  pasture: string | null;
  came: "born here" | "handed over";
  turnsLastHour: number;
}

/** What an RPC answers: the value, or a refusal with the status the router answers it with. */
export type Answer<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export type PassAnswer = { kind: "room"; room: RoomView; owner: string; already: boolean } | { kind: "agent"; agent: string; room: RoomView };

/**
 * A canvas's address with no pass: isocan's `canvasUrlWithPass` with the fragment it adds taken off, since `isocan/rc`
 * exports no `canvasUrl`. The fragment is the pass by isocan's rule (a pass rides after the first `#`).
 */
export function canvasAddress(origin: string, canvasId: string): string {
  const withPass = canvasUrlWithPass(origin, canvasId, "");
  return withPass.slice(0, withPass.lastIndexOf("#"));
}

/**
 * A pass's address for a sheep's cell, composed by isocan's `canvasUrlWithPass`. The host's one choice: a loopback home
 * (isocan's `isLoopbackBase`) is said the way a container reaches this machine, `host.docker.internal`, as the laptop's
 * `homeAddressForCell` says it with no `loopbackFromCell` configured (the rig's case: a sheep's container dials the
 * developer's daemon).
 */
export function cellPassAddress(origin: string, canvasId: string, token: string): string {
  if (!isLoopbackBase(origin)) return canvasUrlWithPass(origin, canvasId, token);
  const url = new URL(origin);
  url.hostname = "host.docker.internal";
  return canvasUrlWithPass(url.toString().replace(/\/$/, ""), canvasId, token);
}

/**
 * The session key a collie claims `name`'s actor under, in the format the laptop's `machineAgentKey` writes: `agent:`
 * then an HMAC-SHA-256 over `isocan agent key\n<name>`, keyed by a secret this object minted once, its first 24 bytes as
 * base64url.
 */
export async function agentKeyFor(secret: Uint8Array, name: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`isocan agent key\n${name}`))).subarray(0, 24);
  return `agent:${base64url(mac)}`;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Resolves after `ms`, or as soon as `signal` aborts; never rejects. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

interface RoomRecord {
  canvasId: string;
  title: string;
  origin: string;
  owner: Actor;
}

interface Loop {
  room: Room;
  settled: boolean;
}

export class Collie extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  private readonly loops = new Map<string, Loop>();
  private readonly routesByOrigin = new Map<string, DaemonRoutes>();
  private readonly pendingBadges = new Map<string, StoredBadge>();
  private stationClient: StationClient | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS badges (origin TEXT PRIMARY KEY, badge_id TEXT NOT NULL, secret TEXT NOT NULL, at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (canvas_id TEXT PRIMARY KEY, title TEXT NOT NULL, origin TEXT NOT NULL, owner TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS agents (canvas_id TEXT NOT NULL, actor_id TEXT NOT NULL, row TEXT NOT NULL, came TEXT NOT NULL, PRIMARY KEY (canvas_id, actor_id))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS narration (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, canvas_id TEXT, line TEXT NOT NULL)`);
  }

  // ---- the small stores ----

  private stateGet(key: string): unknown {
    const row = this.sql.exec<{ value: string }>(`SELECT value FROM state WHERE key = ?`, key).toArray()[0];
    return row === undefined ? undefined : JSON.parse(row.value);
  }

  private stateSet(key: string, value: unknown): void {
    if (value === undefined) return this.stateDelete(key);
    this.sql.exec(`INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, key, JSON.stringify(value));
  }

  private stateDelete(key: string): void {
    this.sql.exec(`DELETE FROM state WHERE key = ?`, key);
  }

  /** A key-value under a prefix, as the room and the follow want one. */
  private prefixed(prefix: string): RoomState {
    return {
      get: async (key) => this.stateGet(`${prefix}${key}`),
      set: async (key, value) => this.stateSet(`${prefix}${key}`, value),
      delete: async (key) => this.stateDelete(`${prefix}${key}`),
    };
  }

  private get isOn(): boolean {
    return this.stateGet("collie:on") !== false;
  }

  private get since(): string | null {
    return (this.stateGet("collie:since") as string | undefined) ?? null;
  }

  private narrate(canvasId: string | null, line: string): void {
    this.sql.exec(`INSERT INTO narration (at, canvas_id, line) VALUES (?, ?, ?)`, new Date().toISOString(), canvasId, line);
    this.sql.exec(`DELETE FROM narration WHERE seq <= (SELECT MAX(seq) FROM narration) - ?`, NARRATION_KEPT);
  }

  /**
   * The badge this object keeps at one isocan home. A badge the door hands over before any pass there has been redeemed
   * is held in memory until one is, so a refused pass leaves no badge behind; after that, every badge is a row.
   */
  private badgeStore(origin: string): BadgeStore {
    return {
      read: async () => this.storedBadge(origin) ?? this.pendingBadges.get(origin) ?? null,
      keep: async (badge: StoredBadge) => {
        if (this.storedBadge(origin) === undefined) this.pendingBadges.set(origin, badge);
        else this.writeBadge(origin, badge);
      },
    };
  }

  private storedBadge(origin: string): StoredBadge | undefined {
    const row = this.sql.exec<{ badge_id: string; secret: string; at: string }>(`SELECT badge_id, secret, at FROM badges WHERE origin = ?`, origin).toArray()[0];
    return row === undefined ? undefined : { badgeId: row.badge_id, secret: row.secret, at: row.at };
  }

  private writeBadge(origin: string, badge: StoredBadge): void {
    this.sql.exec(
      `INSERT INTO badges (origin, badge_id, secret, at) VALUES (?, ?, ?, ?) ON CONFLICT (origin) DO UPDATE SET badge_id = excluded.badge_id, secret = excluded.secret, at = excluded.at`,
      origin,
      badge.badgeId,
      badge.secret,
      badge.at,
    );
  }

  /** Isocan's own route client for one isocan home, over the badge this object keeps there. */
  private routes(origin: string): DaemonRoutes {
    let routes = this.routesByOrigin.get(origin);
    if (routes === undefined) {
      routes = new DaemonRoutes(origin, this.badgeStore(origin));
      this.routesByOrigin.set(origin, routes);
    }
    return routes;
  }

  private station(): Station | undefined {
    const home = this.env.COLLIE_SHEEP_HOME;
    const token = this.env.COLLIE_SHEEP_TOKEN;
    return home && token ? { home, token } : undefined;
  }

  private client(): StationClient {
    const station = this.station();
    if (station === undefined) throw new Error("this collie was deployed without COLLIE_SHEEP_HOME and COLLIE_SHEEP_TOKEN, so it has no station to prompt sheep at; `collie deploy` sets them");
    this.stationClient ??= new StationClient(station);
    return this.stationClient;
  }

  private lapMs(): number {
    const lap = Number(this.env.COLLIE_LAP_MS);
    return Number.isFinite(lap) && lap > 0 ? lap : DEFAULT_LAP_MS;
  }

  private roomRecords(): RoomRecord[] {
    return this.sql
      .exec<{ canvas_id: string; title: string; origin: string; owner: string }>(`SELECT canvas_id, title, origin, owner FROM rooms ORDER BY rowid`)
      .toArray()
      .map((row) => ({ canvasId: row.canvas_id, title: row.title, origin: row.origin, owner: JSON.parse(row.owner) as Actor }));
  }

  private roomView(record: RoomRecord): RoomView {
    return { canvasId: record.canvasId, title: record.title, origin: record.origin, address: canvasAddress(record.origin, record.canvasId) };
  }

  // ---- the rows ----

  private rowsOf(): { row: RcAgentRow; came: "born here" | "handed over" }[] {
    return this.sql
      .exec<{ row: string; came: string }>(`SELECT row, came FROM agents ORDER BY rowid`)
      .toArray()
      .map((record) => ({ row: JSON.parse(record.row) as RcAgentRow, came: record.came === "born here" ? "born here" : "handed over" }));
  }

  private writeRow(row: RcAgentRow, came: "born here" | "handed over"): void {
    this.sql.exec(
      `INSERT INTO agents (canvas_id, actor_id, row, came) VALUES (?, ?, ?, ?) ON CONFLICT (canvas_id, actor_id) DO UPDATE SET row = excluded.row`,
      row.canvasId,
      row.actorId,
      JSON.stringify(row),
      came,
    );
  }

  /** The rc half of the enrolment record, over `agents`. The harness is always sheep and the directory the object's. */
  private rows(): RoomRows {
    return {
      list: async () => this.rowsOf().map((record) => record.row),
      adopt: async (row) => {
        const exists = this.sql.exec(`SELECT 1 FROM agents WHERE canvas_id = ? AND actor_id = ?`, row.canvasId, row.actorId).toArray().length > 0;
        if (exists) return false;
        this.writeRow({ ...row, harness: SHEEP_HARNESS, cwd: COLLIE_CWD }, "handed over");
        return true;
      },
      remove: async (canvasId, actorId) => {
        this.sql.exec(`DELETE FROM agents WHERE canvas_id = ? AND actor_id = ?`, canvasId, actorId);
      },
      setSessionId: async (canvasId, actorId, sessionId, place, cellPass) => {
        const found = this.sql.exec<{ row: string; came: string }>(`SELECT row, came FROM agents WHERE canvas_id = ? AND actor_id = ?`, canvasId, actorId).toArray()[0];
        if (found === undefined) return false;
        const row = JSON.parse(found.row) as RcAgentRow;
        const { cellPass: previousPass, ...rest } = row;
        const keepPass = cellPass ?? (row.sessionId === sessionId ? previousPass : undefined);
        const next: RcAgentRow = { ...rest, sessionId, ...(place ? { sheep: place } : {}), ...(keepPass ? { cellPass: keepPass } : {}) };
        this.writeRow(next, found.came === "born here" ? "born here" : "handed over");
        return true;
      },
    };
  }

  private async agentKey(name: string): Promise<string> {
    let secret = this.stateGet("collie:agent-secret") as string | undefined;
    if (secret === undefined) {
      secret = base64url(crypto.getRandomValues(new Uint8Array(32)));
      this.stateSet("collie:agent-secret", secret);
    }
    return agentKeyFor(fromBase64url(secret), name);
  }

  private recordTurn(actorId: string): void {
    const hourAgo = Date.now() - 3_600_000;
    const times = ((this.stateGet(`collie:turns:${actorId}`) as number[] | undefined) ?? []).filter((at) => at > hourAgo);
    times.push(Date.now());
    this.stateSet(`collie:turns:${actorId}`, times);
  }

  private turnsLastHour(actorId: string): number {
    const hourAgo = Date.now() - 3_600_000;
    return ((this.stateGet(`collie:turns:${actorId}`) as number[] | undefined) ?? []).filter((at) => at > hourAgo).length;
  }

  // ---- the room's deps ----

  private deps(record: RoomRecord): RoomDeps {
    const routes = this.routes(record.origin);
    const canvas = { id: record.canvasId, title: record.title };
    const narrate = (line: string) => this.narrate(record.canvasId, line);
    const stationWhere = () => {
      const station = this.station();
      return station === undefined ? "no station" : new URL(station.home).origin;
    };
    const commandsFor = (say: (line: string) => void) => stationCommands(this.client(), this.prefixed("collie:"), say);
    return {
      routes,
      canvas,
      owner: record.owner,
      origin: record.origin,
      cwd: COLLIE_CWD,
      rows: this.rows(),
      adapterFor: async (row): Promise<RoomHarness> => ({
        harness: SHEEP_HARNESS,
        open: async (turn): Promise<RoomAdapter> => {
          const agent = new SheepAgent({
            commands: commandsFor(turn.narrate),
            name: row.name,
            place: { kennel: "collie", home: this.station()?.home ?? "" },
            where: stationWhere(),
            narrate: turn.narrate,
            birth: {
              canvasTitle: record.title,
              pass: async () => {
                const { pass, token } = await routes.mintPass(record.canvasId, row.actorId);
                return { address: cellPassAddress(record.origin, record.canvasId, token), passId: pass.id };
              },
            },
          });
          return {
            ensureSession: (cwd, stored) => agent.ensureSession(cwd, stored),
            prompt: (sessionId, text, onEvent) => {
              this.recordTurn(row.actorId);
              return agent.prompt(sessionId, text, onEvent);
            },
            close: () => agent.close(),
            get place() {
              return agent.place;
            },
            get where() {
              return `at ${agent.where}`;
            },
            get bornPass() {
              return agent.bornPass;
            },
          };
        },
      }),
      endSession: async (row, say) => {
        if (row.harness !== SHEEP_HARNESS || !row.sessionId) return;
        // One sheep can stand behind this agent's rows on several canvases: while another row names it, it is not ended.
        const others = this.rowsOf().filter(({ row: other }) => other.actorId === row.actorId && other.canvasId !== row.canvasId && other.sessionId === row.sessionId);
        if (others.length > 0) return;
        await endSheep(commandsFor(say), { name: row.name, sessionId: row.sessionId, where: stationWhere() }, say);
      },
      whereOf: async (row) => `${row.name}'s sheep ${row.sessionId ? "live" : "will live"} at ${stationWhere()}`,
      enrol: (ask) => this.enrol(record, ask),
      agentKey: (name) => this.agentKey(name),
      narrate,
      state: this.prefixed("rc:"),
      limits: { ...LIMITS },
      clock: { now: () => Date.now() },
      sleep: abortableSleep,
    };
  }

  /** The last hop of the tray's "add an agent", as the laptop's `mintAndEnrol`: claim under the agent key, the row, the enroll op, the cursor seeded. */
  private async enrol(record: RoomRecord, ask: RcAsk): Promise<void> {
    if (ask.template !== undefined) throw new Error(`a collie prepares no template's directory, so ${ask.name} was not enrolled from ${ask.template}`);
    const routes = this.routes(record.origin);
    const claimed = await routes.claimActor({ type: "actor.claim", sessionKey: await this.agentKey(ask.name), name: ask.name });
    const agent = claimed.envelope.actor;
    const previous = this.sql.exec<{ row: string; came: string }>(`SELECT row, came FROM agents WHERE canvas_id = ? AND actor_id = ?`, record.canvasId, agent.id).toArray()[0];
    this.writeRow({ canvasId: record.canvasId, actorId: agent.id, name: agent.name, harness: SHEEP_HARNESS, cwd: COLLIE_CWD, sessionId: null }, "born here");
    let enrolled: { seq: number };
    try {
      enrolled = await routes.sendOp(record.canvasId, record.owner, { type: "agent.enroll", agent } as Parameters<DaemonRoutes["sendOp"]>[2]);
    } catch (error) {
      // A definitive refusal takes the row back; anything else may have landed, and the row stays for the op to find.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 409) {
        if (previous === undefined) this.sql.exec(`DELETE FROM agents WHERE canvas_id = ? AND actor_id = ?`, record.canvasId, agent.id);
        else this.sql.exec(`UPDATE agents SET row = ?, came = ? WHERE canvas_id = ? AND actor_id = ?`, previous.row, previous.came, record.canvasId, agent.id);
      }
      throw error;
    }
    await routes.parkClaim({ canvasId: record.canvasId, actorId: agent.id, seedAt: enrolled.seq }).catch(() => {});
  }

  // ---- the loops ----

  /** Starts the room's loop unless one is running; its end is said once, in the collie's voice, and the alarm starts it again. */
  private startLoop(record: RoomRecord): void {
    const running = this.loops.get(record.canvasId);
    if (running !== undefined && !running.settled) return;
    const room = runRoom(this.deps(record));
    const loop: Loop = { room, settled: false };
    this.loops.set(record.canvasId, loop);
    this.ctx.waitUntil(
      room.done.then(
        () => {
          loop.settled = true;
        },
        (error: unknown) => {
          loop.settled = true;
          const message = error instanceof Error ? error.message : String(error);
          const key = `collie:stopped:${record.canvasId}`;
          if (this.stateGet(key) === message) return;
          this.stateSet(key, message);
          this.narrate(record.canvasId, `collie: the room on "${record.title}" stopped: ${message}; it is started again within a lap`);
        },
      ),
    );
  }

  private startLoops(): void {
    for (const record of this.roomRecords()) this.startLoop(record);
  }

  private async stopLoops(): Promise<void> {
    const loops = [...this.loops.values()];
    this.loops.clear();
    await Promise.all(loops.map((loop) => loop.room.stop()));
  }

  private async armAlarm(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + this.lapMs());
  }

  /** The heartbeat: every room's loop running, and the next lap armed, while on. */
  override async alarm(): Promise<void> {
    if (!this.isOn) return;
    this.startLoops();
    await this.armAlarm();
  }

  // ---- the acts ----

  async home(build: { commit: string; builtAt: string | null }): Promise<{ build: { commit: string; builtAt: string | null }; on: boolean; since: string | null; rooms: number }> {
    return { build, on: this.isOn, since: this.since, rooms: this.roomRecords().length };
  }

  /**
   * `POST /passes`: the station's floor first, so a pass for a collie that could not prompt a sheep is never spent; then the
   * pass redeemed with isocan's own route at its home, and what it admitted: a canvas becomes a room (or already was one),
   * an agent's claim is said as the agent's. Isocan's refusal is its own sentence, and nothing here changes.
   */
  async passes(address: string): Promise<Answer<PassAnswer>> {
    const read = parseCanvasAddress(address);
    const parsed = read === null || read.pass === undefined || read.pass === "" ? null : { origin: read.origin, canvasId: read.canvasId, pass: read.pass };
    if (parsed === null) return { ok: false, status: 400, error: "that is not a pass's address; isocan prints one as <home>/p/<canvas>#<pass>" };
    let client: StationClient;
    try {
      client = this.client();
      await client.request(`/sessions/${encodeURIComponent("collie-floor")}`);
    } catch (error) {
      if (error instanceof StationSentence && error.floor) return { ok: false, status: 409, error: error.message };
      if (!(error instanceof StationSentence)) {
        const station = this.station();
        const cause = error instanceof Error ? error.message : String(error);
        return { ok: false, status: 502, error: station === undefined ? cause : `the station at ${new URL(station.home).origin} does not answer the collie (${cause}), so no pass from ${parsed.origin} was spent` };
      }
    }
    const routes = this.routes(parsed.origin);
    let owner: Actor | undefined;
    let canvasId: string;
    try {
      const redeemed = await routes.redeemPass(parsed.pass);
      owner = redeemed.actor;
      canvasId = redeemed.canvasId;
    } catch (error) {
      // Nothing changes: a badge the door handed over for this refused pass is dropped with the client that holds it.
      if (this.storedBadge(parsed.origin) === undefined) {
        this.pendingBadges.delete(parsed.origin);
        this.routesByOrigin.delete(parsed.origin);
      }
      if (error instanceof ApiError) return { ok: false, status: error.status >= 400 && error.status < 500 ? error.status : 502, error: error.message };
      return { ok: false, status: 502, error: `the isocan home at ${parsed.origin} does not answer the collie (${error instanceof Error ? error.message : String(error)})` };
    }
    const pending = this.pendingBadges.get(parsed.origin);
    if (pending !== undefined) {
      this.writeBadge(parsed.origin, pending);
      this.pendingBadges.delete(parsed.origin);
    }
    if (owner === undefined) return { ok: false, status: 400, error: `that pass admits the collie to ${canvasAddress(parsed.origin, canvasId)} as nobody; mint one as yourself, and the collie arrives as you` };
    let snapshot: Awaited<ReturnType<DaemonRoutes["snapshot"]>>;
    try {
      snapshot = await routes.snapshot(canvasId);
    } catch (error) {
      return { ok: false, status: 502, error: `the pass was spent, and ${parsed.origin} did not answer for the canvas (${error instanceof Error ? error.message : String(error)}); a new pass hands it over again` };
    }
    const existing = this.roomRecords().find((room) => room.canvasId === canvasId);
    if (snapshot.canvas.agents?.[owner.id] !== undefined) {
      if (existing === undefined) return { ok: false, status: 409, error: `that pass hands over ${owner.name}, an agent on "${snapshot.project.title}", which the collie does not stand by on; a pass minted as yourself for the canvas comes first` };
      return { ok: true, value: { kind: "agent", agent: owner.name, room: this.roomView(existing) } };
    }
    if (existing !== undefined) return { ok: true, value: { kind: "room", room: this.roomView(existing), owner: existing.owner.name, already: true } };
    const record: RoomRecord = { canvasId, title: snapshot.project.title, origin: parsed.origin, owner: { id: owner.id, name: owner.name } };
    this.sql.exec(`INSERT INTO rooms (canvas_id, title, origin, owner) VALUES (?, ?, ?, ?)`, record.canvasId, record.title, record.origin, JSON.stringify(record.owner));
    if (this.since === null) this.stateSet("collie:since", new Date().toISOString());
    if (this.isOn) {
      this.startLoop(record);
      await this.armAlarm();
    }
    return { ok: true, value: { kind: "room", room: this.roomView(record), owner: record.owner.name, already: false } };
  }

  async report(): Promise<{ on: boolean; since: string | null; limits: { turnsPerHour: number; chain: number }; rooms: (RoomView & { owner: string; agents: AgentView[] })[] }> {
    let listed: { id: string; state?: string; pasture?: string | null }[] | undefined;
    const rows = this.rowsOf();
    if (rows.some(({ row }) => row.sessionId)) {
      try {
        listed = await this.client().json<{ id: string; state?: string; pasture?: string | null }[]>("/sessions");
      } catch {
        listed = undefined;
      }
    }
    const lane = (state: string | undefined): AgentView["lane"] => (state === "idle" || state === "running" || state === "waiting" ? state : null);
    return {
      on: this.isOn,
      since: this.since,
      limits: { turnsPerHour: LIMITS.turnsPerHour, chain: LIMITS.agentChain },
      rooms: this.roomRecords().map((record) => ({
        ...this.roomView(record),
        owner: record.owner.name,
        agents: rows
          .filter(({ row }) => row.canvasId === record.canvasId)
          .map(({ row, came }) => {
            const sheep = listed?.find((session) => session.id === row.sessionId);
            return {
              name: row.name,
              actorId: row.actorId,
              sheep: row.sessionId,
              lane: sheep === undefined ? null : lane(sheep.state),
              pasture: sheep?.pasture ?? null,
              came,
              turnsLastHour: this.turnsLastHour(row.actorId),
            };
          }),
      })),
    };
  }

  async log(since: number | undefined, last: number | undefined): Promise<{ lines: { seq: number; at: string; canvasId: string | null; title: string | null; line: string }[]; last: number }> {
    type Row = { seq: number; at: string; canvas_id: string | null; title: string | null; line: string };
    const select = `SELECT n.seq AS seq, n.at AS at, n.canvas_id AS canvas_id, r.title AS title, n.line AS line FROM narration n LEFT JOIN rooms r ON r.canvas_id = n.canvas_id`;
    let rows: Row[];
    if (since !== undefined && last === undefined) rows = this.sql.exec<Row>(`${select} WHERE n.seq > ? ORDER BY n.seq ASC`, since).toArray();
    else if (since !== undefined) rows = this.sql.exec<Row>(`${select} WHERE n.seq > ? ORDER BY n.seq DESC LIMIT ?`, since, last!).toArray().reverse();
    else rows = this.sql.exec<Row>(`${select} ORDER BY n.seq DESC LIMIT ?`, last ?? 100).toArray().reverse();
    const newest = (this.sql.exec<{ seq: number | null }>(`SELECT MAX(seq) AS seq FROM narration`).toArray()[0]?.seq ?? 0) as number;
    return {
      lines: rows.map((row) => ({ seq: row.seq, at: row.at, canvasId: row.canvas_id, title: row.title, line: row.line })),
      last: rows.at(-1)?.seq ?? (since !== undefined ? since : newest),
    };
  }

  /** Off: every room's hold released and its loop stopped before this returns, and the alarm cleared. */
  async off(): Promise<{ on: false; rooms: RoomView[] }> {
    this.stateSet("collie:on", false);
    this.stateSet("collie:since", new Date().toISOString());
    await this.stopLoops();
    await this.ctx.storage.deleteAlarm();
    return { on: false, rooms: this.roomRecords().map((record) => this.roomView(record)) };
  }

  /** On: every room's loop started and the alarm armed. */
  async on(): Promise<{ on: true; rooms: RoomView[] }> {
    const was = this.isOn;
    this.stateSet("collie:on", true);
    if (!was || this.since === null) this.stateSet("collie:since", new Date().toISOString());
    this.startLoops();
    await this.armAlarm();
    return { on: true, rooms: this.roomRecords().map((record) => this.roomView(record)) };
  }

  /** The end: every room stopped, the badge ended at each isocan home with isocan's own route, then the rows dropped. */
  async end(): Promise<Answer<{ ended: { origin: string; badge: string }[] }>> {
    await this.stopLoops();
    await this.ctx.storage.deleteAlarm();
    const ended: { origin: string; badge: string }[] = [];
    const badges = this.sql.exec<{ origin: string; badge_id: string }>(`SELECT origin, badge_id FROM badges ORDER BY rowid`).toArray();
    for (const badge of badges) {
      try {
        await this.routes(badge.origin).killBadge(badge.badge_id);
      } catch (error) {
        // A badge the home no longer lists is already ended; anything else is said, and nothing is dropped.
        if (!(error instanceof ApiError && (error.code === "unknown-badge" || error.code === "not-your-badge" || error.status === 401))) {
          return { ok: false, status: 502, error: `the badge at ${badge.origin} was not ended (${error instanceof Error ? error.message : String(error)}); nothing was dropped, and the end can be asked again` };
        }
      }
      ended.push({ origin: badge.origin, badge: badge.badge_id });
    }
    this.sql.exec(`DELETE FROM badges`);
    this.sql.exec(`DELETE FROM rooms`);
    this.sql.exec(`DELETE FROM agents`);
    this.sql.exec(`DELETE FROM state`);
    this.routesByOrigin.clear();
    return { ok: true, value: { ended } };
  }
}
