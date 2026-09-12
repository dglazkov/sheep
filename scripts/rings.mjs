/**
 * The inner rings: which environment a test needs, named the way the outer
 * rings are named in `hermetic.mjs`. The rule there is the rule here — the
 * ring chooses the environment, never the steps — and the two halves make
 * one ladder, running outward from the sources to the shepherd's account:
 *
 *   checkout   this process. Node, and workerd through the vitest pool.
 *              `pnpm install` is the whole of what it needs.
 *   command    the built `sheep` and the built pen agent, spawned as real
 *              processes against fakes: a fake account, a fake station, a
 *              fake container. Needs `pnpm build` as well.
 *   home       a real `wrangler dev` home on a free port, with the built
 *              command driven against it (`test/local-home.ts`).
 *   package    installed from a ref into a fresh prefix          (hermetic)
 *   machine    the package ring inside a container               (hermetic)
 *   dog        the machine ring with a real coding agent in it   (hermetic)
 *   account    a station on the shepherd's Cloudflare account    (hermetic)
 *
 * The first three are `pnpm test`; the last four are `pnpm hermetic`. The
 * split exists because the middle of that ladder was invisible: every test
 * under a package's `test` directory looked alike and ran alike, so four cases that each
 * start a `wrangler dev` sat beside a case that formats a string, under one
 * five-second timeout meant for the latter. Naming the rings lets a ring be
 * run alone, and makes what a case costs a fact about it rather than a
 * surprise on a slow runner.
 *
 * **The lists below are the truth, and `audit()` keeps them true.** A ring
 * could be derived by reading each file, and `evidence()` does exactly that,
 * but a derived rule is a rule nobody can read. So the membership is written
 * out, and a guard (`packages/cli/test/rings.test.ts`) fails when the two
 * disagree: a file added to the wrong ring, a file in no ring, a case that
 * grows a `startHome` without moving. Neither half can drift alone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The rings this file governs, innermost first. The outer four are `hermetic.mjs`'s. */
export const RING_NAMES = ["checkout", "command", "home"];

/** What each ring needs, for the help text and the report. */
export const RING_NEEDS = {
  checkout: "this process alone: node and workerd, after `pnpm install`",
  command: "the built command, spawned against fakes; needs `pnpm build`",
  home: "a real `wrangler dev` home on a free port",
};

/**
 * Which rings CI runs. The home ring does not: it starts a real `wrangler
 * dev` per file, which on a shared runner is the slowest and least steady
 * thing in the repository, and a walk that flakes on a runner teaches a
 * reader to ignore red. It is a walk, and walks are conducted here, on a
 * machine with a person or an agent watching — the same rule the conduct
 * skill already applies to a phase's walk, which is not CI's to sign off.
 *
 * So a green CI means the checkout and command rings held, and nothing
 * about the home ring. `pnpm test` runs all three, so an agent working in
 * a checkout walks it by doing the ordinary thing; CI asks for the two by
 * name. A ring added later must say which it is, and the guard makes sure
 * it does rather than letting silence mean "not on CI".
 */
export const RING_ON_CI = {
  checkout: true,
  command: true,
  home: false,
};

/** The rings CI runs, in order, for `pnpm test --ci` and the workflow. */
export const CI_RINGS = RING_NAMES.filter((ring) => RING_ON_CI[ring]);

/**
 * Every test file in the repository, by ring. Paths are relative to the
 * repository root. A new test file belongs in one of these lists, and the
 * guard says so on the first run if it is not.
 */
export const RINGS = {
  checkout: [
    "packages/cell/test/birth.test.ts",
    "packages/cell/test/bleat.test.ts",
    "packages/cell/test/broker.test.ts",
    "packages/cell/test/build.test.ts",
    "packages/cell/test/cell.test.ts",
    "packages/cell/test/checkout.test.ts",
    "packages/cell/test/earmark.test.ts",
    "packages/cell/test/end.test.ts",
    "packages/cell/test/eviction.test.ts",
    "packages/cell/test/execution-env.test.ts",
    "packages/cell/test/eyes.test.ts",
    "packages/cell/test/flock.test.ts",
    "packages/cell/test/fold-cache.test.ts",
    "packages/cell/test/fold-home.test.ts",
    "packages/cell/test/forward.test.ts",
    "packages/cell/test/isolate.test.ts",
    "packages/cell/test/lease.test.ts",
    "packages/cell/test/look-command.test.ts",
    "packages/cell/test/mint.test.ts",
    "packages/cell/test/mount.test.ts",
    "packages/cell/test/pasture-command.test.ts",
    "packages/cell/test/pasture.test.ts",
    "packages/cell/test/pen.test.ts",
    "packages/cell/test/repo-conformance.test.ts",
    "packages/cell/test/router.test.ts",
    "packages/cell/test/serve.test.ts",
    "packages/cell/test/setup.test.ts",
    "packages/cell/test/spool.test.ts",
    "packages/cell/test/storage-conformance.test.ts",
    "packages/cell/test/storage-timing.test.ts",
    "packages/cell/test/wire.test.ts",
    "packages/cli/test/bridge.test.ts",
    "packages/cli/test/name.test.ts",
    "packages/cli/test/release-manifest.test.ts",
    "packages/cli/test/rings.test.ts",
    "packages/cli/test/settle.test.ts",
  ],
  command: [
    "packages/cli/test/bleat.test.ts",
    "packages/cli/test/cli.test.ts",
    "packages/cli/test/deploy.test.ts",
    "packages/cli/test/earmark.test.ts",
    "packages/cli/test/join.test.ts",
    "packages/cli/test/kennel.test.ts",
    "packages/cli/test/local.test.ts",
    "packages/cli/test/setup.test.ts",
    "packages/pen/test/agent.test.ts",
    "packages/pen/test/birth.test.ts",
    "packages/pen/test/git.test.ts",
  ],
  home: ["packages/cli/test/bell.test.ts", "packages/cli/test/journey5.test.ts", "packages/cli/test/pasture-herd.test.ts", "packages/cli/test/pasture.test.ts"],
};

/** The ring a file is declared to be in, or `undefined` when it is in none. */
export function ringOf(repoPath) {
  return RING_NAMES.find((ring) => RINGS[ring].includes(repoPath));
}

/**
 * The ring a file's own source says it needs, read rather than declared.
 * `startHome` starts a `wrangler dev`, so the file is the home ring's
 * whatever else it does; spawning a process at all makes it the command
 * ring's; anything else runs in this one.
 */
export function evidence(source) {
  const code = withoutProse(source);
  if (/\bstartHome\b/.test(code)) return "home";
  if (/\bspawn\(|\bspawnSync\(|\bexecFile\b|from "\.\/local-home/.test(code)) return "command";
  return "checkout";
}

/**
 * The source with its comments taken out, so that writing *about* a home in a
 * header — as this file's own guard does — is not read as starting one. Block
 * comments go whole; of line comments only those that are the whole line, so
 * that a `https://…` inside a string survives.
 */
function withoutProse(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

/** The declared ring and the evidenced ring for every file, so a guard can compare them. */
export function audit(root, files) {
  return files.map((repoPath) => ({
    file: repoPath,
    declared: ringOf(repoPath),
    evidenced: evidence(readFileSync(join(root, repoPath), "utf8")),
  }));
}

/**
 * The ring's files inside one package, as vitest `include` globs relative to
 * that package. Empty when the ring has nothing there, which is why the
 * configs pass `passWithNoTests`.
 */
export function includeFor(ring, packageDir) {
  const prefix = `${packageDir}/`;
  return RINGS[ring].filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length));
}

/**
 * What a package's vitest config merges in: nothing at all unless `SHEEP_RING`
 * names a ring, so `pnpm test` and a bare `vitest` still run everything.
 */
export function ringConfig(packageDir, env = process.env) {
  const named = env.SHEEP_RING;
  if (!named) return {};
  // One ring or several: `SHEEP_RING=checkout,command` is what CI sets.
  const rings = named.split(",").map((ring) => ring.trim()).filter(Boolean);
  for (const ring of rings) if (!RING_NAMES.includes(ring)) throw new Error(`SHEEP_RING names ${ring}, which is not a ring: ${RING_NAMES.join(", ")}`);
  return { include: rings.flatMap((ring) => includeFor(ring, packageDir)), passWithNoTests: true };
}
