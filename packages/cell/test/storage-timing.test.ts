import { BACKGROUND_CONTEXT, type Storage } from "@earendil-works/pi-agent-core";
import {
  seedStorageBenchmark,
  STORAGE_BENCHMARK_DATASETS,
  STORAGE_READ_BENCHMARK_SCENARIOS,
  STORAGE_WRITE_BENCHMARK_SCENARIOS,
} from "@earendil-works/pi-agent-core/harness/session/testing";
import { env, runInDurableObject } from "cloudflare:test";
import { applyInitialSchema, SQLITE_STORAGE_VERSION, SqliteStorage, sql } from "@earendil-works/pi-session-backend-sqlite-node/sqlite";
import { expect, it } from "vitest";
import { CellSqliteDatabase } from "../src/storage/sqlite.ts";

const NOW = 1_700_000_000_000;
const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

async function freshStorage(state: DurableObjectState, sessionId: string): Promise<Storage> {
  const db = new CellSqliteDatabase(state.storage);
  await applyInitialSchema(db);
  sql`INSERT INTO sessions (id, created_at, parent_session_id, storage_version, metadata, message_count, usage_payload, next_seq)
    VALUES (${sessionId}, ${NOW}, ${null}, ${SQLITE_STORAGE_VERSION}, ${null}, ${0}, ${JSON.stringify(EMPTY_USAGE)}, ${1})`.run(db);
  return new SqliteStorage(db, { sessionId, now: () => NOW });
}

/** Not a benchmark: one timed pass over pi's storage scenarios, printed for the phase's Findings. */
it("times pi's storage scenarios once in the cell (1k entries)", async () => {
  const dataset = STORAGE_BENCHMARK_DATASETS[0]!;
  const lines: string[] = [];
  await runInDurableObject(env.SESSION_CELL.getByName("timing"), async (_instance, state) => {
    const storage = await freshStorage(state, "reads");
    let start = performance.now();
    await seedStorageBenchmark(storage, dataset);
    lines.push(`seed ${dataset.name}: ${(performance.now() - start).toFixed(1)} ms`);
    for (const scenario of STORAGE_READ_BENCHMARK_SCENARIOS) {
      start = performance.now();
      const result = await scenario.run(storage, dataset);
      const elapsed = performance.now() - start;
      expect(result).toBe(scenario.expectedResult(dataset));
      lines.push(`${scenario.name}: ${elapsed.toFixed(2)} ms`);
    }
    await storage.close(BACKGROUND_CONTEXT);
    let n = 0;
    for (const scenario of STORAGE_WRITE_BENCHMARK_SCENARIOS) {
      const target = await freshStorage(state, `write-${n++}`);
      await scenario.prepare?.(target);
      start = performance.now();
      const result = await scenario.run(target);
      const elapsed = performance.now() - start;
      expect(result).toBe(scenario.writeCount);
      lines.push(`${scenario.name}: ${elapsed.toFixed(2)} ms`);
      await target.close(BACKGROUND_CONTEXT);
    }
  });
  expect(lines).toHaveLength(7);
});
