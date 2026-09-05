import { createSessionRepoConformance } from "@earendil-works/pi-agent-core/harness/session/testing";
import { createCellSessionRepo } from "../src/storage/sqlite.ts";
import { registerConformance, requireState } from "./conformance.ts";

const NOW = 1_700_000_000_000;

registerConformance(
  "SqliteSessionRepo (shared container) over the cell's SQLite",
  createSessionRepoConformance(() => createCellSessionRepo(requireState().storage, { now: () => NOW })),
);
