import { INITIAL_SCHEMA_SQL } from "@earendil-works/pi-session-backend-sqlite-node/sqlite";

/**
 * Rebuilds a pi SQLite session file from the rows a cell exports. The cell
 * has no file to hand out, only rows; pi's schema is the same on both
 * sides, so the file pi's Node backend opens is these rows under that
 * schema.
 *
 * `node:sqlite` is imported here and not at load: on Node 24 the module
 * prints `ExperimentalWarning: SQLite` the moment it is imported, and only
 * `sheep export` needs it. Every other verb prints nothing on stderr it
 * did not mean to (collar phase 0's debt, paid in collar phase 2).
 */
export async function writeSessionFile(path: string, rows: Record<string, Record<string, unknown>[]>): Promise<{ tables: Record<string, number> }> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  const counts: Record<string, number> = {};
  try {
    db.exec(INITIAL_SCHEMA_SQL);
    db.exec("BEGIN");
    for (const [table, list] of Object.entries(rows)) {
      counts[table] = 0;
      for (const row of list) {
        const columns = Object.keys(row);
        const statement = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`);
        statement.run(...columns.map((column) => toSqlValue(row[column])));
        counts[table]++;
      }
    }
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  return { tables: counts };
}

function toSqlValue(value: unknown): string | number | bigint | Uint8Array | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}
