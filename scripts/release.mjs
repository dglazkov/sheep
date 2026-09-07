#!/usr/bin/env node
/**
 * Make the `release` branch: the tree an install gets, built from `HEAD`
 * and committed with plumbing, never checked out. Collar phase 0; isocan's
 * `scripts/release.mjs` with the build swapped.
 *
 * Why a branch. npm's git installer (pacote) reads a manifest with any of
 * `workspaces`, `prepare`, `build`, `preinstall`, `install`, `postinstall`
 * or `prepack` as "needs preparation" and runs a nested `npm install` in
 * its staging clone; under `npm i -g` that nested install inherits the
 * global flag and leaves the package directory EMPTY with a dangling
 * binary on PATH (isocan #47). So the branch an install comes from
 * carries none of those keys, and carries the built files instead of a
 * script that builds them. `main` stays sources only.
 *
 * The tree (design.md, "The release"):
 *
 *   package.json         name sheep, bin, the dependencies below, engines, the build stamp under `sheep`; no scripts, no workspaces
 *   bin/sheep.js         #!/usr/bin/env node; imports ../dist/sheep.mjs
 *   dist/                the two bundles, the guide, and what they read beside them (scripts/bundle.mjs)
 *   home/                the Worker and its config (scripts/bundle.mjs)
 *   SKILL.md             the skill, at the root so `npx skills add dglazkov/sheep` offers it alone: the doorway `sheep setup` copies into a directory
 *   README.md, LICENSE   from HEAD
 *
 * Nothing of `packages/`, `vendor/`, `docs/`, or `.github/` ships.
 *
 *   pnpm release             build, commit, walk the package ring against the commit, move refs/heads/release, push
 *   pnpm release --no-push   the same, stopping before the push; prints the ref
 *   --force                  skip the clean-tree and pushed-HEAD guards; never the ring
 *
 * The commit is made in a temporary index assembled from HEAD, so the
 * working tree is never touched. It gets two parents, the previous release
 * tip and the `main` commit it was built from, so the branch fast-forwards
 * (no force pushes) and `git log release` answers which commit any install
 * is. The commit's date is the build stamp, so the manifest, `sheep
 * --version`, and `git log` agree.
 *
 * The guard (collar phase 3). The commit goes onto `refs/sheep/candidate`
 * first, and `scripts/hermetic.mjs --ring package` installs it from this
 * repository through npm's git installer into a fresh prefix, cache, and
 * HOME and walks journey 1 with the faux provider. Only a walk that held
 * moves `refs/heads/release`, and only then is it pushed, never with
 * `--force`. A refused candidate leaves `release` where it was, and the
 * ring's output says which step failed. CI runs this on every push to
 * `main` (`.github/workflows/release.yml`); by hand, the same script.
 */
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The keys pacote reads as "this package must be built before it can be used". */
export const PREPARATION_KEYS = ["workspaces", "scripts.prepare", "scripts.build", "scripts.preinstall", "scripts.install", "scripts.postinstall", "scripts.prepack"];

/**
 * The release manifest's dependencies: exactly the packages pi's own bundle
 * keeps external, at the fork's pins (`scripts/bundle.mjs` checks them
 * against `vendor/pi/packages/coding-agent/package.json`). Chord goes
 * inside the bundles. A test holds these as a literal, so a bundle that
 * starts leaking an import is a red test and not `ERR_MODULE_NOT_FOUND`
 * on a user's laptop.
 */
export const RELEASE_DEPENDENCIES = {
  // A wasm package: its CJS entry reads `photon_rs_bg.wasm` beside itself, so it has to be a real package on disk.
  "@silvia-odwyer/photon-node": "0.3.4",
  // Loaded lazily by pi's extension loader when an extension is imported.
  jiti: "2.7.0",
};

/** Optional accelerators and natives; their callers fall back to JavaScript when absent. */
export const RELEASE_OPTIONAL_DEPENDENCIES = {
  bufferutil: "^4.0.1",
  "utf-8-validate": ">=5.0.2",
  "supports-color": "^10.0.0",
  "@mariozechner/clipboard": "0.3.9",
};

/** What ships from HEAD's tree unchanged; everything else at the top level is removed from the release index. */
export const SHIPPED_FROM_HEAD = ["README.md", "LICENSE"];

/** The skill, at the root: added back after the top level is cleared, from the tree like the built files. */
export const SKILL_FILE = "SKILL.md";

/** The branch installs come from, and the ref a candidate waits on while the package ring walks it (collar phase 3). */
export const RELEASE_REF = "refs/heads/release";
export const CANDIDATE_REF = "refs/sheep/candidate";

/** The Node floor: `node:sqlite` in the CLI's export needs >=22.13, and the fork's own floor is 22.19. */
export const ENGINES = { node: ">=22.19" };

/**
 * The manifest the release branch ships, from HEAD's root `package.json`.
 * Only `name` and `type` survive from it; `private`, `packageManager`,
 * `scripts`, `devDependencies`, and any `workspaces` go. The build stamp
 * sits under a `sheep` key rather than at the top level, where npm owns
 * the names and a `commit` key would one day collide.
 */
export function releaseManifest(pkg, stamp) {
  for (const key of ["commit", "builtAt", "wrangler"]) {
    if (typeof stamp?.[key] !== "string" || stamp[key] === "") throw new Error(`the build stamp needs a ${key}`);
  }
  const manifest = {
    name: pkg.name,
    version: "0.0.0",
    description: "sheep: the command a coding agent runs to herd coding agents; pi, running in a cell",
    type: pkg.type ?? "module",
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/dglazkov/sheep.git" },
    bin: { sheep: "bin/sheep.js" },
    engines: ENGINES,
    dependencies: { ...RELEASE_DEPENDENCIES },
    optionalDependencies: { ...RELEASE_OPTIONAL_DEPENDENCIES },
    sheep: { commit: stamp.commit, builtAt: stamp.builtAt, wrangler: stamp.wrangler },
    "//": `GENERATED BRANCH: \`pnpm release\` builds it from ${stamp.commit} on main; develop there, not here. No \`workspaces\` and no scripts, deliberately: npm's git installer treats either as "needs preparation" and then installs this package into an empty directory (isocan #47). The bundles and the Worker are committed here for the same reason: there is no install-time build to make them.`,
  };
  for (const key of PREPARATION_KEYS) {
    const [top, sub] = key.split(".");
    const present = sub === undefined ? top in manifest : top in manifest && sub in manifest[top];
    if (present) throw new Error(`the release manifest carries ${key}, which npm's git installer reads as "needs preparation"`);
  }
  return manifest;
}

/** The release's `bin/sheep.js`: the checkout's `packages/cli/bin/sheep.js`, aimed at the bundle. */
export const BIN_SHEEP_JS = `#!/usr/bin/env node
import { main } from "../dist/sheep.mjs";

process.exitCode = await main(process.argv.slice(2));
`;

const git = (...args) => {
  const opts = typeof args.at(-1) === "object" ? args.pop() : {};
  const done = spawnSync("git", args, { cwd: root, encoding: "utf8", ...opts });
  if (done.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(done.stderr || "").trim()}`);
  return (done.stdout || "").trim();
};

function tryGit(...args) {
  const done = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return done.status === 0 ? (done.stdout || "").trim() : "";
}

/** The files the design lists: the manifest, the bin, what the bundle build wrote (the guide among them), the skill, and the two from HEAD. */
export function expectedReleaseFiles(built, skill) {
  if (!built.some((file) => file.file === "dist/agent-guide.md")) throw new Error("the bundle build did not write dist/agent-guide.md");
  if (!skill.includes(SKILL_FILE)) throw new Error(`the tree carries no ${SKILL_FILE}`);
  return [
    "package.json",
    "bin/sheep.js",
    ...built.map((file) => file.file),
    ...skill,
    ...SHIPPED_FROM_HEAD,
  ].sort();
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const push = !args.includes("--no-push");
  for (const arg of args) {
    if (!["--force", "--no-push"].includes(arg)) throw new Error(`unknown argument ${arg}; --no-push and --force are the two, and nothing skips the ring`);
  }

  // A release names the commit it was built from, so that commit has to be real: not unsaved edits, and not a commit only this laptop has.
  if (!force) {
    const dirty = git("status", "--porcelain");
    if (dirty && !process.env.CI) throw new Error(`working tree is dirty; commit or stash first (--force to override):\n${dirty}`);
    if (dirty) console.error(`release: ignoring a dirty tree on CI:\n${dirty}`);
    if (!git("branch", "-r", "--contains", "HEAD")) throw new Error("HEAD is not on any remote; push it first (--force to override)");
  }

  const head = git("rev-parse", "HEAD");
  const subject = git("log", "-1", "--pretty=%s");
  const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // The one thing the release branch has that main doesn't.
  const { buildRelease } = await import("./bundle.mjs");
  const built = await buildRelease();
  const stamp = { commit: head.slice(0, 7), builtAt, wrangler: built.wrangler };

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sheep-release-"));
  try {
    // A temporary index: HEAD's tree with everything but README and LICENSE removed, then the built files (gitignored, hence -f),
    // bin/sheep.js, and the manifest, which exist only on this branch.
    const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, "index") };
    git("read-tree", head, { env });
    for (const entry of git("ls-tree", "--name-only", head).split("\n").filter(Boolean)) {
      if (SHIPPED_FROM_HEAD.includes(entry)) continue;
      git("rm", "-r", "--cached", "--ignore-unmatch", "-q", entry, { env });
    }
    git("add", "-f", "dist", "home", { env });

    // The skill, from the working tree like the bundles it goes with; on a clean tree, which the guard demands, that is HEAD's.
    git("add", "-f", "--", SKILL_FILE, { env });
    const skill = git("ls-files", "--cached", "--", SKILL_FILE, { env }).split("\n").filter(Boolean);

    const bin = path.join(tmp, "sheep.js");
    await fs.writeFile(bin, BIN_SHEEP_JS);
    const binBlob = git("hash-object", "-w", "--path", "bin/sheep.js", bin, { env });
    git("update-index", "--add", "--cacheinfo", `100755,${binBlob},bin/sheep.js`, { env });

    // From HEAD, not from disk: a release is of a commit.
    const pkg = JSON.parse(git("show", `${head}:package.json`));
    const manifestPath = path.join(tmp, "package.json");
    await fs.writeFile(manifestPath, JSON.stringify(releaseManifest(pkg, stamp), null, 2) + "\n");
    const manifestBlob = git("hash-object", "-w", "--path", "package.json", manifestPath, { env });
    git("update-index", "--add", "--cacheinfo", `100644,${manifestBlob},package.json`, { env });
    const tree = git("write-tree", { env });

    // The tree is exactly the files the design lists; anything else, in either direction, is a bug here.
    const files = git("ls-tree", "-r", "--name-only", tree).split("\n").filter(Boolean).sort();
    const expected = expectedReleaseFiles(built.files, skill);
    if (JSON.stringify(files) !== JSON.stringify(expected)) {
      const extra = files.filter((file) => !expected.includes(file));
      const missing = expected.filter((file) => !files.includes(file));
      throw new Error(`the release tree is not the design's: extra [${extra.join(", ")}], missing [${missing.join(", ")}]`);
    }

    // First parent: where the branch was. Second: the commit this build is of.
    const previous = tryGit("rev-parse", "--verify", "--quiet", "refs/remotes/origin/release") || tryGit("rev-parse", "--verify", "--quiet", "refs/heads/release");
    const parents = [...(previous ? ["-p", previous] : []), "-p", head];
    const message = `release ${stamp.commit}: ${subject}\n\nBuilt ${builtAt} with wrangler ${built.wrangler}. Two bundles, the guide, the skill, and the Worker included; no prepare script, no workspaces (isocan #47).\n`;
    const dated = { ...env, GIT_AUTHOR_DATE: builtAt, GIT_COMMITTER_DATE: builtAt };
    const commit = git("commit-tree", tree, ...parents, "-m", message, { env: dated });
    console.error(`release: candidate ${commit.slice(0, 7)} built from ${stamp.commit} (${subject}) at ${builtAt}; ${files.length} files`);

    // The guard. The commit goes onto a candidate ref, the package ring walks it from this repository through npm's git
    // installer, and only a walk that held moves refs/heads/release. Neither --no-push nor --force skips this: the ring is
    // what decides a release; --no-push only skips the push. A refused candidate stays at refs/sheep/candidate to be looked at.
    git("update-ref", CANDIDATE_REF, commit, "-m", `release candidate from ${stamp.commit}`);
    console.error(`release: walking ${CANDIDATE_REF} in the package ring before ${RELEASE_REF} moves`);
    const ring = spawnSync(process.execPath, [path.join(root, "scripts", "hermetic.mjs"), "--ring", "package", CANDIDATE_REF], { cwd: root, stdio: "inherit" });
    if (ring.status !== 0) {
      const at = previous ? `stays at ${previous.slice(0, 7)}` : "does not exist yet";
      throw new Error(`the package ring refused the candidate ${commit.slice(0, 7)} (exit ${ring.status ?? "signal"}); ${RELEASE_REF} ${at}; the candidate is at ${CANDIDATE_REF} for \`pnpm hermetic --ring package ${CANDIDATE_REF}\``);
    }
    git("update-ref", RELEASE_REF, commit, "-m", `release from ${stamp.commit}`);
    git("update-ref", "-d", CANDIDATE_REF);
    console.error(`release: the ring held; ${RELEASE_REF} is ${commit.slice(0, 7)}`);

    if (push) {
      // Never --force: the branch fast-forwards from its previous tip, which is the commit's first parent.
      git("push", "origin", `${RELEASE_REF}:${RELEASE_REF}`, { stdio: ["ignore", "inherit", "inherit"] });
      console.error(`release: pushed; \`npm install -g github:dglazkov/sheep#release\` installs it`);
    } else console.error(`release: not pushed (--no-push); \`git push origin ${RELEASE_REF}:${RELEASE_REF}\` when ready`);
    console.log(`${RELEASE_REF} ${commit}`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`release: ${error.message}`);
    process.exit(1);
  });
}
