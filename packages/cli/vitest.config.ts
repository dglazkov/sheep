import { defineConfig } from "vitest/config";

/**
 * The CLI's suite is mostly end to end, whatever the directory looks like.
 * A test here calls `world()`, which mkdtemps a HOME, and then `w.sheep(…)`,
 * which spawns the built CLI as a real process — under `script` when the
 * case needs a terminal — against a fake account, a fake station, a real
 * `wrangler`, or a real Docker. A case that reads six lines of output has
 * paid for six process starts before it asserts anything. `name.test.ts`
 * and `release-manifest.test.ts` are the only real unit tests in here, and
 * they finish in tens of milliseconds.
 *
 * So vitest's five-second default is the wrong ceiling for this package: it
 * measures a runner's machine, not the code. Thirteen cases had already been
 * annotated one at a time as they were noticed, and the ones nobody had
 * noticed yet drifted up with every phase that gave the CLI more to do —
 * `sheep home` went 2.5 s, 3.1 s, 4.4 s, 4.6 s across four commits on CI and
 * then timed out, having never changed. Thirty seconds is the ceiling for
 * the category: long enough that spawn counts and a slow runner never flake,
 * short enough that something genuinely hung still fails in half a minute.
 * A case that needs longer says so, as several do.
 */
export default defineConfig({
  test: { testTimeout: 30_000 },
});
