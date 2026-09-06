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
 */
import { uuidv7 } from "@earendil-works/pi-ai";
import { DurableObject } from "cloudflare:workers";
import type { FauxProgram } from "./models.ts";

/** What a cell last told the Directory its lane was doing. A cell that never reported is `idle`. */
export type LaneState = "idle" | "running" | "waiting";

export interface SessionSummary {
  id: string;
  name: string | null;
  createdAt: number;
  state: LaneState;
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

  create(name: string | null): SessionSummary {
    const createdAt = Date.now();
    const id = uuidv7(createdAt);
    this.ctx.storage.sql.exec("INSERT INTO sessions (id, name, created_at, state) VALUES (?, ?, ?, 'idle')", id, name, createdAt);
    return { id, name, createdAt, state: "idle" };
  }

  list(): SessionSummary[] {
    return this.ctx.storage.sql
      .exec<{ id: string; name: string | null; created_at: number; state: string | null }>("SELECT * FROM sessions ORDER BY created_at DESC")
      .toArray()
      .map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, state: toLaneState(row.state) }));
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

function toLaneState(value: string | null): LaneState {
  return LANE_STATES.includes(value as LaneState) ? (value as LaneState) : "idle";
}
