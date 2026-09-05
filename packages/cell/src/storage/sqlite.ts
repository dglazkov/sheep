/**
 * pi's SQLite session backend over a Durable Object's SQLite.
 *
 * pi's backend talks to a database through a four-method `SqliteDatabase`
 * capability whose `transaction` is synchronous by contract. A Durable
 * Object's `ctx.storage.sql` is synchronous too, so the adapter is thin:
 * bind positional parameters, read the cursor, and run `transaction`
 * through `transactionSync`. The backend's repo also wants a filesystem
 * path that exists, which the cell provides as a marker file in workerd's
 * in-memory `node:fs`; every path the factory is asked for is the one
 * database the cell holds.
 */
import type {
  SqliteDatabase,
  SqliteDatabaseFactory,
  SqliteRunResult,
  SqliteStatement,
} from "@earendil-works/pi-session-backend-sqlite-node/sqlite";
import { SqliteSessionRepo } from "@earendil-works/pi-session-backend-sqlite-node/sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Where the cell tells pi its one database lives. A marker, not a file. */
export const CELL_DATABASE_PATH = "/tmp/lamb/sessions.sqlite";

/**
 * Statements pi's backend issues for a file-backed connection that the
 * cell's SQLite does not take and does not need: the journal mode and busy
 * timeout are the platform's business, and an explicit transaction around
 * synchronous reads is redundant in a single-threaded object.
 */
const IGNORED_STATEMENT = /^\s*(?:PRAGMA\s+(?:journal_mode|busy_timeout)\b[^;]*|BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i;

function stripIgnoredStatements(text: string): string {
  return text
    .split(/;(?=\s*(?:PRAGMA|BEGIN|COMMIT|ROLLBACK|$))/i)
    .map((statement) => (IGNORED_STATEMENT.test(statement) ? "" : statement))
    .filter((statement) => statement.trim().length > 0)
    .join(";");
}

type Binding = string | number | bigint | null | ArrayBuffer | ArrayBufferView;

function toBinding(value: unknown): Binding {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  throw new TypeError(`Unsupported SQLite binding: ${typeof value}`);
}

class CellSqliteStatement implements SqliteStatement {
  constructor(
    private readonly sql: SqlStorage,
    private readonly text: string,
  ) {}

  run(...params: unknown[]): SqliteRunResult {
    this.sql.exec(this.text, ...params.map(toBinding)).toArray();
    // `rowsWritten` on the cursor counts index rows too; pi wants SQLite's own
    // `changes()`, the rows the statement itself touched.
    const after = this.sql
      .exec<{ changes: number; id: number }>("SELECT changes() AS changes, last_insert_rowid() AS id")
      .one();
    return { changes: after.changes, lastInsertRowid: after.id };
  }

  get<TRow extends object>(...params: unknown[]): TRow | undefined {
    return this.all<TRow>(...params)[0];
  }

  all<TRow extends object>(...params: unknown[]): TRow[] {
    return this.sql.exec(this.text, ...params.map(toBinding)).toArray() as unknown as TRow[];
  }

  iterate<TRow extends object>(...params: unknown[]): Iterable<TRow> {
    // Materialized: a cursor left open across another exec is not a contract
    // the cell's SQLite offers, and pi's callers are small scans.
    return this.all<TRow>(...params);
  }
}

export class CellSqliteDatabase implements SqliteDatabase {
  private depth = 0;

  constructor(private readonly storage: DurableObjectStorage) {}

  get sql(): SqlStorage {
    return this.storage.sql;
  }

  exec(text: string): void {
    const kept = stripIgnoredStatements(text);
    if (kept.trim().length === 0) return;
    this.storage.sql.exec(kept);
  }

  prepare(text: string): SqliteStatement {
    return new CellSqliteStatement(this.storage.sql, text);
  }

  transaction<T>(callback: () => T): T {
    if (this.depth > 0) return callback();
    this.depth++;
    try {
      return this.storage.transactionSync(callback);
    } finally {
      this.depth--;
    }
  }

  close(): void {
    // The database is the cell. It closes when the cell does.
  }
}

/**
 * Hands pi's repo the one database for every path it asks about, and keeps
 * the marker file the repo's `realpath` calls need present in the isolate's
 * in-memory filesystem. Call `prepare()` once per isolate before opening.
 */
export class CellSqliteDatabaseFactory implements SqliteDatabaseFactory {
  readonly db: CellSqliteDatabase;

  constructor(storage: DurableObjectStorage) {
    this.db = new CellSqliteDatabase(storage);
  }

  /** Ensures the marker path exists. Idempotent; needed again after every wake. */
  async prepare(): Promise<void> {
    await mkdir(dirname(CELL_DATABASE_PATH), { recursive: true });
    await writeFile(CELL_DATABASE_PATH, "");
  }

  async open(_path: string): Promise<SqliteDatabase> {
    await this.prepare();
    return this.db;
  }

  async openExisting(_path: string): Promise<SqliteDatabase> {
    await this.prepare();
    return this.db;
  }

  async openReadOnly(_path: string): Promise<SqliteDatabase> {
    await this.prepare();
    return this.db;
  }
}

export interface CellSessionRepoOptions {
  now?: () => number;
}

/** pi's SQLite session repo, shared-container mode, over the cell's storage. */
export async function createCellSessionRepo(
  storage: DurableObjectStorage,
  options: CellSessionRepoOptions = {},
): Promise<SqliteSessionRepo> {
  const factory = new CellSqliteDatabaseFactory(storage);
  await factory.prepare();
  return new SqliteSessionRepo({
    directory: dirname(CELL_DATABASE_PATH),
    databasePath: CELL_DATABASE_PATH,
    databaseFactory: factory,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}
