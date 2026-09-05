/**
 * The home's list of sessions: id, name, when it was made. One singleton
 * object per deployment. Everything about a session other than this row
 * lives in its cell.
 */
import { uuidv7 } from "@earendil-works/pi-ai";
import { DurableObject } from "cloudflare:workers";

export interface SessionSummary {
  id: string;
  name: string | null;
  createdAt: number;
}

export class Directory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL)",
    );
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
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
    this.ctx.storage.sql.exec("INSERT INTO sessions (id, name, created_at) VALUES (?, ?, ?)", id, name, createdAt);
    return { id, name, createdAt };
  }

  list(): SessionSummary[] {
    return this.ctx.storage.sql
      .exec<{ id: string; name: string | null; created_at: number }>("SELECT * FROM sessions ORDER BY created_at DESC")
      .toArray()
      .map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
  }

  get(id: string): SessionSummary | undefined {
    return this.list().find((session) => session.id === id);
  }
}
