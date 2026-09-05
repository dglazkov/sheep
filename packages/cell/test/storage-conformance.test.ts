import { BACKGROUND_CONTEXT } from "@earendil-works/pi-agent-core";
import { createStorageConformance, type StorageFixture } from "@earendil-works/pi-agent-core/harness/session/testing";
import {
  applyInitialSchema,
  SQLITE_STORAGE_VERSION,
  SqliteStorage,
  sql,
} from "@earendil-works/pi-session-backend-sqlite-node/sqlite";
import { CellSqliteDatabase } from "../src/storage/sqlite.ts";
import { registerConformance, requireState } from "./conformance.ts";

const SESSION_ID = "session";
const NOW = 1_700_000_000_000;
const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

registerConformance(
  "SqliteStorage over the cell's SQLite",
  createStorageConformance(async () => {
    const db = new CellSqliteDatabase(requireState().storage);
    await applyInitialSchema(db);
    sql`INSERT INTO sessions
      (id, created_at, parent_session_id, storage_version, metadata, message_count, usage_payload, next_seq)
      VALUES (${SESSION_ID}, ${NOW}, ${null}, ${SQLITE_STORAGE_VERSION}, ${null}, ${0}, ${JSON.stringify(EMPTY_USAGE)}, ${1})`.run(
      db,
    );
    const storage = new SqliteStorage(db, { sessionId: SESSION_ID, now: () => NOW });
    return {
      storage,
      async [Symbol.asyncDispose]() {
        await storage.close(BACKGROUND_CONTEXT);
        db.close();
      },
    } satisfies StorageFixture;
  }),
);
