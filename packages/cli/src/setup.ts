/**
 * `sheep setup [--json] [--no-install]`: one idempotent command from any
 * directory, isocan's shape. Collar phase 2. Three things, each reported
 * with its state, then the one sentence to run next:
 *
 * 1. The command on PATH. Not there: `npm install -g <spec>`, unless
 *    `--no-install`. There already, from a release or a checkout: left
 *    alone. `which` is not trusted (`onpath.ts`).
 * 2. The skill in this directory: `.agents/skills/sheep/SKILL.md`, copied
 *    from the package root's `SKILL.md`, and a relative symlink at
 *    `.claude/skills/sheep`, never over a real directory. Inside a checkout
 *    of sheep itself: nothing, and the report says why.
 * 3. The kennel: `.sheep/` here, empty, so the directory is a dog's from
 *    then on and nothing later has to guess (kennel phase 0) — but only
 *    when no kennel at or above this directory already names a home, since
 *    one here would shadow that with an empty one (stile phase 0). In a git
 *    work tree the `.gitignore` here gains `.sheep/`, because the config
 *    will hold a token and the local home a model key, and the entry has
 *    to travel with a clone so a teammate's dog does not commit theirs
 *    either. Outside git, nothing, and the report says so. A `.sheep`
 *    already tracked means a token is in the repository: one line on
 *    stderr, and setup goes on. The kennel is made before the home is
 *    resolved, so the home reported is this kennel's and not the
 *    machine's.
 * 4. The home: reported, not made. None configured, the local home and
 *    whether it runs, or another address and whether it answers. `sheep
 *    home local` is the next sentence when there is none.
 *
 * `INSTALL_SPEC` is the one string a dog needs, and lives here. A ring
 * overrides it with `SHEEP_INSTALL_SPEC` to install from `git+file://…`,
 * since the GitHub branch is collar phase 3's.
 *
 * The guide, `sheep --agent-help`, is a file beside the code: `dist/
 * agent-guide.md` in a release (copied there by `scripts/bundle.mjs`) and
 * `packages/cli/agent-guide.md` in a checkout. Upgrading the command
 * upgrades the words; the skill is a doorway that says to read them.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, samePath, type SheepConfig, sheepDir } from "./config.js";
import { localStatus, readStamp, whoAnswers } from "./local.js";
import { findOnPath, globalBinDir } from "./onpath.js";

/** The install spec: what `npm install -g` and `npx` take. The one string a dog needs. */
export const INSTALL_SPEC = "github:dglazkov/sheep#release";

/** The spec setup installs with: `SHEEP_INSTALL_SPEC` overrides it for a ring, which installs the ref it just built. */
export function installSpec(): string {
  return process.env.SHEEP_INSTALL_SPEC || INSTALL_SPEC;
}

export const SKILL_NAME = "sheep";

/** Beside the code: `dist/` in a release, `packages/cli/dist/` in a checkout. */
const codeDir = dirname(fileURLToPath(import.meta.url));

/** The guide this build ships: `dist/agent-guide.md` beside the bundle, or `packages/cli/agent-guide.md` above a checkout's `dist/`. */
export function guidePath(): string {
  return readStamp() === undefined ? join(codeDir, "..", "agent-guide.md") : join(codeDir, "agent-guide.md");
}

export function readGuide(): string {
  return readFileSync(guidePath(), "utf8");
}

/**
 * The skill this build ships: `SKILL.md` at the package root, beside
 * `package.json`, which is the repository root in a checkout. At the root
 * rather than under `.agents/skills/`, because `npx skills add
 * dglazkov/sheep` stops at a root `SKILL.md` and offers that one skill; the
 * repository's own `.claude/skills/` are its workflow, not a dog's.
 */
export function skillSource(): string {
  const packageRoot = readStamp() === undefined ? join(codeDir, "..", "..", "..") : join(codeDir, "..");
  return join(packageRoot, "SKILL.md");
}

/**
 * The root of a checkout of sheep itself at or above `dir`, or undefined:
 * a `package.json` named `sheep` with a workspace beside a `packages/`
 * directory. A release install is also named `sheep`, and has neither.
 */
export function checkoutRoot(dir: string): string | undefined {
  let current = resolve(dir);
  for (;;) {
    const manifest = join(current, "package.json");
    if (existsSync(manifest) && existsSync(join(current, "packages"))) {
      try {
        const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { name?: unknown; workspaces?: unknown };
        const workspace = pkg.workspaces !== undefined || existsSync(join(current, "pnpm-workspace.yaml"));
        if (pkg.name === "sheep" && workspace) return current;
      } catch {
        // not a manifest
      }
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export type SkillState = "installed" | "refreshed" | "current";
export type DoorwayState = "linked" | "current" | "kept" | "failed";

export interface SkillReport {
  /** `<dir>/.agents/skills/sheep` */
  path: string;
  state: SkillState;
  doorway: { path: string; state: DoorwayState };
}

/** `dest` is a directory holding exactly one file, `SKILL.md`, with `source`'s bytes. */
function sameSkill(source: string, dest: string): boolean {
  if (!existsSync(dest) || !statSync(dest).isDirectory()) return false;
  if (JSON.stringify(readdirSync(dest)) !== JSON.stringify(["SKILL.md"])) return false;
  const copy = join(dest, "SKILL.md");
  return statSync(copy).isFile() && readFileSync(copy).equals(readFileSync(source));
}

/**
 * Put the skill where agents look. `.agents/skills/<name>/` is the
 * convention pi, Codex, Cursor, Gemini CLI, and OpenCode discover on their
 * own; Claude Code reads the same directory through a relative symlink at
 * `.claude/skills/<name>`, which survives a move or a clone. One copy per
 * directory, two doorways to it. A copy that differs from this build's is
 * refreshed, so upgrading the command upgrades the doorway; a real
 * directory at the symlink's place is never touched.
 */
export function installSkill(dir: string, source: string = skillSource()): SkillReport {
  if (!existsSync(source)) throw new Error(`this build carries no skill at ${source}`);
  const dest = join(dir, ".agents", "skills", SKILL_NAME);
  let state: SkillState;
  if (sameSkill(source, dest)) state = "current";
  else {
    state = existsSync(dest) ? "refreshed" : "installed";
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    copyFileSync(source, join(dest, "SKILL.md"));
  }

  const doorway = join(dir, ".claude", "skills", SKILL_NAME);
  const target = join("..", "..", ".agents", "skills", SKILL_NAME);
  let doorwayState: DoorwayState;
  let link: ReturnType<typeof lstatSync> | undefined;
  try {
    link = lstatSync(doorway);
  } catch {
    link = undefined;
  }
  if (link === undefined) {
    try {
      mkdirSync(dirname(doorway), { recursive: true });
      symlinkSync(target, doorway);
      doorwayState = "linked";
    } catch {
      // Windows without developer mode: the .agents copy stands.
      doorwayState = "failed";
    }
  } else if (link.isSymbolicLink() && readlinkSync(doorway) === target) doorwayState = "current";
  else doorwayState = "kept";
  return { path: dest, state, doorway: { path: doorway, state: doorwayState } };
}

/** `none`: no kennel was made here, because one at or above this directory already names a home (stile phase 0). */
export type KennelState = "made" | "present" | "none";
/** The entry: appended, already there, or no git work tree here at all, which needs none. */
export type IgnoreState = "added" | "present" | "not-git";

export interface KennelReport {
  /** `<dir>/.sheep` */
  path: string;
  state: KennelState;
  /** The `.gitignore` beside the kennel; `path` is null outside a git work tree, where none is written. */
  gitignore: { path: string | null; state: IgnoreState };
  /** `git ls-files .sheep` named something: a token is in the repository already, and only a person can decide about that. */
  tracked: boolean;
  /** With `none`: the kennel this directory falls through to and the home its config names, which a kennel here would shadow. */
  reachable?: { kennel: string; home: string };
}

/** Is `dir` in a git work tree? A git that is not installed, or a directory that is not in one, answer the same. */
function inGitWorkTree(dir: string): boolean {
  const done = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" });
  return done.status === 0 && done.stdout.trim() !== "";
}

/** `git ls-files .sheep` from `dir`: non-empty means the kennel, and so a token, is in the repository. */
export function kennelTracked(dir: string): boolean {
  const done = spawnSync("git", ["ls-files", ".sheep"], { cwd: dir, encoding: "utf8" });
  return done.status === 0 && done.stdout.trim() !== "";
}

/**
 * Make `<dir>/.sheep`, and in a git work tree append `.sheep/` to the
 * `.gitignore` beside it, creating that file if there is none. Idempotent:
 * a kennel that is there is `present`, and an entry that is there (as
 * `.sheep/` or `.sheep`) adds no second line.
 */
export function makeKennel(dir: string): KennelReport {
  const path = join(dir, ".sheep");
  const there = existsSync(path);
  if (there && !statSync(path).isDirectory()) throw new Error(`${path} is not a directory; a kennel is`);
  if (!there) mkdirSync(path, { recursive: true });
  const state: KennelState = there ? "present" : "made";

  let gitignore: KennelReport["gitignore"] = { path: null, state: "not-git" };
  if (inGitWorkTree(dir)) {
    const ignorePath = join(dir, ".gitignore");
    const before = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8") : "";
    if (before.split("\n").some((line) => line.trim() === ".sheep/" || line.trim() === ".sheep")) gitignore = { path: ignorePath, state: "present" };
    else {
      writeFileSync(ignorePath, `${before === "" || before.endsWith("\n") ? before : `${before}\n`}.sheep/\n`);
      gitignore = { path: ignorePath, state: "added" };
    }
  }
  return { path, state, gitignore, tracked: kennelTracked(dir) };
}

/** The one line said when a kennel is already in a repository; the person decides what to do about it. */
export function trackedWarning(dir: string): string {
  return `sheep: git tracks .sheep in ${dir}, so a token is in the repository; nothing here changes that (git rm -r --cached .sheep does)\n`;
}

export type CliState = "on-path" | "installed" | "checkout" | "not-installed" | "failed";

export interface SetupReport {
  cli: { state: CliState; path: string | null; version: string | null; spec: string; bin?: string };
  skill: (SkillReport & { checkout?: undefined }) | { checkout: string; path: null; state: "checkout"; doorway: null };
  /** The directory this dog holds: made here, with the ignore entry it needs. */
  kennel: KennelReport;
  home: { state: "none"; home: null } | { state: "local"; home: string | null; running: boolean; pid: number | null } | { state: "other"; home: string; answers: boolean };
  /** The checkout of sheep this command runs from, or runs in; null for an install in some other directory. */
  checkout: string | null;
  /** The one sentence to run next. */
  next: string;
}

/** The version string of the copy of sheep behind a bin: the stamp in the manifest two levels up, or the checkout's. */
function versionOfBin(bin: string): string | null {
  try {
    const manifest = JSON.parse(readFileSync(join(dirname(realpathSync(bin)), "..", "package.json"), "utf8")) as { name?: unknown; sheep?: { commit?: unknown; builtAt?: unknown } };
    if (manifest.name !== "sheep" && manifest.name !== "@sheep/cli") return null;
    const stamp = manifest.sheep;
    return stamp && typeof stamp.commit === "string" && typeof stamp.builtAt === "string" ? `sheep ${stamp.commit} (${stamp.builtAt})` : "sheep 0.0.0-checkout";
  } catch {
    return null;
  }
}

/**
 * `npm install -g <spec>`, awaited rather than blocked on: the stile's screen draws on a timer while it runs (stile phase 1,
 * second cut), and the dog's report is the same either way. Its status, and what it wrote, for the line said when it fails.
 */
function npmInstall(spec: string): Promise<{ status: number | null; output: string }> {
  return new Promise((resolveInstall) => {
    const child = spawn("npm", ["install", "-g", spec], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false" } });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", (error) => resolveInstall({ status: null, output: error.message }));
    child.once("close", (status) => resolveInstall({ status, output: (Buffer.concat(err).toString("utf8") || Buffer.concat(out).toString("utf8")).trim() }));
  });
}

/** The command on PATH: found, installed, or left to the next sentence. The stile's first step is this one (stile phase 1). */
export async function setupCli(options: { install: boolean; say: (text: string) => void }): Promise<SetupReport["cli"]> {
  const spec = installSpec();
  const found = findOnPath("sheep");
  if (found !== undefined) return { state: "on-path", path: found, version: versionOfBin(found), spec };
  // `SHEEP_TEST_INSTALL=1` makes a checkout's command act as an installed one here, so the command ring can drive the
  // install with a fake npm on PATH; every ring strips it, and nothing else reads it.
  if (readStamp() === undefined && process.env.SHEEP_TEST_INSTALL !== "1") {
    // This copy is a checkout: `packages/cli/bin/sheep.js`, run by path. Nothing is installed over a developer's tree.
    return { state: "checkout", path: join(codeDir, "..", "bin", "sheep.js"), version: "sheep 0.0.0-checkout", spec };
  }
  if (!options.install) return { state: "not-installed", path: null, version: null, spec };
  options.say(`sheep: installing sheep (npm install -g ${spec})\n`);
  const done = await npmInstall(spec);
  if (done.status !== 0) {
    options.say(`sheep: npm install -g ${spec} exited ${done.status}:\n${done.output}\n`);
    return { state: "failed", path: null, version: null, spec };
  }
  const installed = findOnPath("sheep");
  if (installed !== undefined) return { state: "installed", path: installed, version: versionOfBin(installed), spec };
  // Installed into a directory this shell cannot see: nvm, fnm, asdf, and volta put binaries under a version a login shell exports.
  const bin = globalBinDir();
  if (bin !== undefined && existsSync(join(bin, "sheep"))) return { state: "installed", path: join(bin, "sheep"), version: versionOfBin(join(bin, "sheep")), spec, bin };
  return { state: "failed", path: null, version: null, spec };
}

/** The home the config names, reported and never started. */
async function setupHome(config: SheepConfig): Promise<SetupReport["home"]> {
  if (config.local === true) {
    const status = await localStatus();
    return { state: "local", home: status.record?.url ?? config.home ?? null, running: status.running, pid: status.running ? status.record!.pid : null };
  }
  if (config.home === undefined) return { state: "none", home: null };
  return { state: "other", home: config.home, answers: (await whoAnswers(config.home)) === "sheep" };
}

export interface SetupOptions {
  /** Where the skill and the kennel go: the current working directory. */
  dir: string;
  install: boolean;
  say: (text: string) => void;
  /** `--home <url>`, when one was typed: the home to report instead of the kennel's. */
  home?: string;
}

/**
 * The home a kennel at or above this directory already names, if any: what
 * decides whether a kennel is made here (stile phase 0). The walk-up is
 * `sheepDir()`'s, the same one every command does, and only the file counts
 * — an address in the environment is one command's, not this directory's.
 */
function reachableHome(dir: string): { kennel: string; home: string } | undefined {
  const kennel = sheepDir(dir);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(kennel, "config"), "utf8"));
  } catch {
    return undefined;
  }
  const home = (parsed as { home?: unknown } | null)?.home;
  return typeof home === "string" && home !== "" ? { kennel, home } : undefined;
}

/**
 * The home is resolved here, after the kennel is settled, and never handed
 * in: `sheep setup` in a fresh directory must report that directory's
 * home (none), not whatever the machine's `~/.sheep/config` names.
 *
 * The kennel is made only when no home is reachable from here (stile phase
 * 0): a kennel in this directory shadows the one above it with an empty
 * one, so a dog that runs `sheep setup` in some subdirectory would lose the
 * station the shepherd put everywhere. Found, the report names that home
 * and says nothing was made; not found, the kennel is made as it always was.
 */
export async function setup(options: SetupOptions): Promise<SetupReport> {
  const cli = await setupCli(options);
  const checkout = checkoutRoot(options.dir) ?? (cli.state === "checkout" ? checkoutRoot(cli.path!) ?? null : null);
  const skill: SetupReport["skill"] =
    checkoutRoot(options.dir) !== undefined
      ? { checkout: checkoutRoot(options.dir)!, path: null, state: "checkout", doorway: null }
      : installSkill(options.dir);
  // This directory's own kennel is never "shadowed" by itself: only one found above it stops the making.
  const found = reachableHome(options.dir);
  const reachable = found === undefined || samePath(found.kennel, join(options.dir, ".sheep")) ? undefined : found;
  const kennel: KennelReport =
    reachable === undefined ? makeKennel(options.dir) : { path: join(options.dir, ".sheep"), state: "none", gitignore: { path: null, state: "not-git" }, tracked: kennelTracked(options.dir), reachable };
  if (kennel.tracked) options.say(trackedWarning(options.dir));
  const home = await setupHome(await loadConfig(options.home === undefined ? {} : { home: options.home }));
  const next =
    cli.state === "not-installed" || cli.state === "failed"
      ? `npm install -g ${cli.spec}`
      : cli.bin !== undefined
        ? `export PATH="${cli.bin}:$PATH"`
        : // Stile phase 1: a dog with no home makes none. The guide is what it reads, and the guide tells it to ask the
          // shepherd for one sitting at their own terminal; the home line below says as much in the report itself.
          "sheep --agent-help";
  return { cli, skill, kennel, home, checkout, next };
}

/** The report as prose: one line per thing, its state and where, then the next sentence. */
export function formatSetup(report: SetupReport, dir: string): string {
  const { cli, skill, kennel, home } = report;
  const version = cli.version === null ? "" : ` (${cli.version})`;
  const cliLine =
    cli.state === "on-path"
      ? `sheep: on PATH at ${cli.path}${version}`
      : cli.state === "installed"
        ? cli.bin === undefined
          ? `sheep: installed at ${cli.path}${version}`
          : `sheep: installed at ${cli.path}${version}; not on this PATH`
        : cli.state === "checkout"
          ? `sheep: running from a checkout, ${cli.path}; nothing installed`
          : cli.state === "not-installed"
            ? `sheep: not on PATH; --no-install, so nothing installed`
            : `sheep: not on PATH; npm install -g ${cli.spec} failed`;
  const rel = (path: string) => relative(dir, path) || ".";
  const skillLine =
    skill.state === "checkout"
      ? `skill: none installed; ${dir} is inside a checkout of sheep (${skill.checkout}), which carries its own`
      : `skill: ${rel(skill.path)} ${skill.state}; ${rel(skill.doorway.path)} ${
          skill.doorway.state === "linked"
            ? "linked to it"
            : skill.doorway.state === "current"
              ? "already links to it"
              : skill.doorway.state === "kept"
                ? "is something else and was left alone"
                : "could not be linked; the .agents copy stands"
        }`;
  // The kennel that was not made (stile phase 0): the home this directory already reaches, and why nothing was made here.
  const kennelLine =
    kennel.state === "none"
      ? `kennel: none made here; ${kennel.reachable!.kennel} already names ${kennel.reachable!.home}, and a kennel here would shadow it with an empty one`
      : `kennel: ${rel(kennel.path)}/ ${kennel.state === "made" ? "made" : "already here"}; ${
          kennel.gitignore.state === "added"
            ? `${rel(kennel.gitignore.path!)} gained .sheep/`
            : kennel.gitignore.state === "present"
              ? `${rel(kennel.gitignore.path!)} already ignores it`
              : "not a git work tree, so no .gitignore"
        }${kennel.tracked ? "; git tracks it, so a token is in the repository" : ""}`;
  const homeLine =
    home.state === "none"
      ? "home: none configured; one sitting at the shepherd's own terminal, `sheep setup`, makes one"
      : home.state === "local"
        ? `home: ${home.home ?? "(none)"} (local, ${home.running ? `running, pid ${home.pid}` : "stopped; started on demand"})`
        : `home: ${home.home} (${home.answers ? "answers" : "does not answer"})`;
  return `${cliLine}\n${skillLine}\n${kennelLine}\n${homeLine}\nnext: ${report.next}\n`;
}
