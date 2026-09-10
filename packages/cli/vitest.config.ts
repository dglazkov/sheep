import { defineConfig } from "vitest/config";
import { ringConfig } from "../../scripts/rings.mjs";

/**
 * The CLI's suite spans all three inner rings, which is why the ceiling here
 * is not vitest's. Four of its files are the whole of the home ring: they
 * start a real `wrangler dev`. Six more are the command ring: `world()`
 * mkdtemps a HOME and `w.sheep(…)` spawns the built CLI as a real process,
 * under `script` when the case needs a terminal, against a fake account, a
 * fake station, or a real Docker — so a case reading six lines of output has
 * paid for six process starts before it asserts anything. Only
 * `name.test.ts`, `bridge.test.ts`, `release-manifest.test.ts`, and the ring
 * guard run in this process, in tens of milliseconds. `scripts/rings.mjs`
 * says which is which.
 *
 * Five seconds measured the runner, not the code. Thirteen cases had been
 * annotated one at a time as they were noticed, and the ones nobody had
 * noticed yet drifted up with every phase that gave the CLI more to do:
 * `sheep home` went 2.5 s, 3.1 s, 4.4 s, 4.6 s across four commits on CI and
 * then timed out, having never changed. Thirty seconds is the ceiling for
 * the category — long enough that spawn counts and a slow runner never flake
 * it, short enough that something genuinely hung still fails in half a
 * minute. A case that needs longer says so, as several do.
 */
export default defineConfig({
  // `SHEEP_RING` narrows this to one ring's files; unset, everything here runs.
  test: { testTimeout: 30_000, ...ringConfig("packages/cli") },
});
