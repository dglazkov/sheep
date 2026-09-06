/**
 * The home's list of sessions: id, name, when it was made, and what its
 * lane was last seen doing. One singleton object per deployment.
 * Everything about a session other than this row lives in its cell; the
 * lane state is the cell's report, kept here so `sheep ls` never wakes a
 * hibernated cell to ask.
 *
 * Pen phase 3 adds the home's container minutes: a running total of the
 * containers that have stopped, plus a row per container still running,
 * reported by whoever starts and stops them. `PEN_BUDGET_MINUTES` is the
 * budget; when the minutes reach it, the cells' tier-2 column empties.
 *
 * Pasture phase 0 adds the pastures' names, so `sheep pasture ls` never
 * has to guess a Durable Object's name, and two columns on `sessions`:
 * the pasture a sheep was born into, and the task it was asked (the first
 * line of its first prompt; the cell reports it from pasture phase 2).
 * The herd of a pasture is a query here, and the refusal of a birth that
 * cannot happen is here too, before any cell exists.
 */
import { uuidv7 } from "@earendil-works/pi-ai";
import { DurableObject } from "cloudflare:workers";
import type { FauxProgram } from "./models.ts";
import { badPastureName, isPastureName } from "./pasture.ts";

/** What a cell last told the Directory its lane was doing. A cell that never reported is `idle`. */
export type LaneState = "idle" | "running" | "waiting";

export interface SessionSummary {
  id: string;
  name: string | null;
  createdAt: number;
  state: LaneState;
  /** The pasture this sheep was born into; `null` for lamb's sheep. */
  pasture: string | null;
  /** The first line of the first prompt, trimmed, as the cell reported it; `null` until it does. */
  task: string | null;
}

export interface PastureSummary {
  name: string;
  createdAt: number;
}

/** The directory's refusal of a birth into a name it does not know. */
export function unknownPasture(name: string): string {
  return `no pasture named ${name} at this home; \`sheep pasture ls\` lists the ones there are`;
}

/** The directory's refusal of a birth into a pasture with a repository, on a home that cannot clone it. */
export function noContainerForRepository(name: string): string {
  return `pasture ${name} has a repository, and this home has no container to clone it with; a pasture with no repository would work here`;
}



/** The home's container minutes against its budget; `budgetMinutes` is `null` when the home has none. */
export interface Budget {
  containerMinutes: number;
  budgetMinutes: number | null;
  spent: boolean;
}

const LANE_STATES: readonly LaneState[] = ["idle", "running", "waiting"];

export class Directory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)",
    );
    // Homes deployed before lamb phase 5 have the table without the state column.
    const columns = ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(sessions)").toArray();
    if (!columns.some((column) => column.name === "state")) ctx.storage.sql.exec("ALTER TABLE sessions ADD COLUMN state TEXT");
    // Homes deployed before pasture phase 0 have neither the pasture nor the task column.
    if (!columns.some((column) => column.name === "pasture")) ctx.storage.sql.exec("ALTER TABLE sessions ADD COLUMN pasture TEXT");
    if (!columns.some((column) => column.name === "task")) ctx.storage.sql.exec("ALTER TABLE sessions ADD COLUMN task TEXT");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS pastures (name TEXT PRIMARY KEY, created_at INTEGER NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    // The containers running now, one per session at most; the ones that stopped are summed into meta.
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS containers (session_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL)");
  }

  /** A container started for a session. A start the Directory never saw stop is closed now, so a lost stop cannot count forever. */
  containerOpened(id: string, at: number): void {
    this.containerClosed(id, at);
    this.ctx.storage.sql.exec("INSERT INTO containers (session_id, started_at) VALUES (?, ?)", id, at);
  }

  /** A session's container stopped: its time joins the total. Nothing to close is nothing. */
  containerClosed(id: string, at: number): void {
    const row = this.ctx.storage.sql.exec<{ started_at: number }>("SELECT started_at FROM containers WHERE session_id = ?", id).toArray()[0];
    if (row === undefined) return;
    const total = this.closedMs() + Math.max(0, at - row.started_at);
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('containerMs', ?)", String(total));
    this.ctx.storage.sql.exec("DELETE FROM containers WHERE session_id = ?", id);
  }

  private closedMs(): number {
    const row = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'containerMs'").toArray()[0];
    return row === undefined ? 0 : Number(row.value);
  }

  /** The minutes so far: the stopped containers' total plus each running one's time up to `now`. */
  containerMinutes(now: number = Date.now()): number {
    const running = this.ctx.storage.sql
      .exec<{ started_at: number }>("SELECT started_at FROM containers")
      .toArray()
      .reduce((sum, row) => sum + Math.max(0, now - row.started_at), 0);
    return (this.closedMs() + running) / 60_000;
  }

  /** The minutes against the home's `PEN_BUDGET_MINUTES`, if it has one. */
  budget(now: number = Date.now()): Budget {
    const configured = this.env.PEN_BUDGET_MINUTES;
    const budgetMinutes = configured === undefined || configured.trim() === "" || !Number.isFinite(Number(configured)) ? null : Number(configured);
    const containerMinutes = this.containerMinutes(now);
    return { containerMinutes, budgetMinutes, spent: budgetMinutes !== null && containerMinutes >= budgetMinutes };
  }

  /** The home's logical server id for pi's protocol: a UUIDv4, minted once and kept. */
  serverId(): string {
    const row = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'serverId'").toArray()[0];
    if (row !== undefined) return row.value;
    const minted = crypto.randomUUID();
    this.ctx.storage.sql.exec("INSERT INTO meta (key, value) VALUES ('serverId', ?)", minted);
    return minted;
  }

  /**
   * A session, born into a pasture or into none. The refusal is the directory's, before any cell exists: `refusal`
   * says why, and the Worker asks it before this; a name the directory does not know is refused here too, since that
   * needs no hop. Whether this home has a container is `PEN_CONTAINER` being bound, the same test the cell makes.
   */
  create(name: string | null, pasture: string | null = null): SessionSummary {
    if (pasture !== null && !this.hasPasture(pasture)) throw new Error(unknownPasture(pasture));
    const createdAt = Date.now();
    const id = uuidv7(createdAt);
    this.ctx.storage.sql.exec("INSERT INTO sessions (id, name, created_at, state, pasture) VALUES (?, ?, ?, 'idle', ?)", id, name, createdAt, pasture);
    return { id, name, createdAt, state: "idle", pasture, task: null };
  }

  /** Why a birth into `pasture` would be refused here, or `undefined` when it would not. */
  async refusal(pasture: string): Promise<string | undefined> {
    if (!this.hasPasture(pasture)) return unknownPasture(pasture);
    const meta = await this.env.PASTURE.getByName(pasture).meta();
    if (meta?.repo != null && this.env.PEN_CONTAINER === undefined) return noContainerForRepository(pasture);
    return undefined;
  }

  list(): SessionSummary[] {
    return this.ctx.storage.sql
      .exec<SessionRow>("SELECT * FROM sessions ORDER BY created_at DESC")
      .toArray()
      .map(toSummary);
  }

  /** The herd: every sheep born into a pasture, newest first as `list` is, with what each was asked. */
  herd(pasture: string): SessionSummary[] {
    return this.ctx.storage.sql
      .exec<SessionRow>("SELECT * FROM sessions WHERE pasture = ? ORDER BY created_at DESC", pasture)
      .toArray()
      .map(toSummary);
  }

  /** The cell's report of what its sheep was asked: the first line of the first prompt, trimmed. */
  setTask(id: string, task: string): void {
    this.ctx.storage.sql.exec("UPDATE sessions SET task = ? WHERE id = ?", task, id);
  }

  /** Registers a pasture's name; `false` when the name is taken. The object itself is the Worker's to initialise. */
  registerPasture(name: string, createdAt: number = Date.now()): boolean {
    if (!isPastureName(name)) throw new Error(badPastureName(name));
    if (this.hasPasture(name)) return false;
    this.ctx.storage.sql.exec("INSERT INTO pastures (name, created_at) VALUES (?, ?)", name, createdAt);
    return true;
  }

  hasPasture(name: string): boolean {
    return this.ctx.storage.sql.exec("SELECT 1 FROM pastures WHERE name = ?", name).toArray().length > 0;
  }

  pastures(): PastureSummary[] {
    return this.ctx.storage.sql
      .exec<{ name: string; created_at: number }>("SELECT name, created_at FROM pastures ORDER BY created_at DESC, name")
      .toArray()
      .map((row) => ({ name: row.name, createdAt: row.created_at }));
  }

  get(id: string): SessionSummary | undefined {
    return this.list().find((session) => session.id === id);
  }

  /** A cell's report of its lane, at each transition it drives or observes. */
  setState(id: string, state: LaneState): void {
    this.ctx.storage.sql.exec("UPDATE sessions SET state = ? WHERE id = ?", state, id);
  }

  /** Test-only, with the faux provider: the program every cell without one of its own answers from. */
  setFauxProgram(program: FauxProgram | null): void {
    if (program === null) this.ctx.storage.sql.exec("DELETE FROM meta WHERE key = 'fauxProgram'");
    else this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('fauxProgram', ?)", JSON.stringify(program));
  }

  fauxProgram(): FauxProgram | undefined {
    const row = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'fauxProgram'").toArray()[0];
    return row === undefined ? undefined : (JSON.parse(row.value) as FauxProgram);
  }
}

type SessionRow = { id: string; name: string | null; created_at: number; state: string | null; pasture: string | null; task: string | null };

function toSummary(row: SessionRow): SessionSummary {
  return { id: row.id, name: row.name, createdAt: row.created_at, state: toLaneState(row.state), pasture: row.pasture ?? null, task: row.task ?? null };
}

function toLaneState(value: string | null): LaneState {
  return LANE_STATES.includes(value as LaneState) ? (value as LaneState) : "idle";
}
