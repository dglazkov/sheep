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
 * 3. The home: reported, not made. None configured, the local home and
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
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SheepConfig } from "./config.js";
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

export type CliState = "on-path" | "installed" | "checkout" | "not-installed" | "failed";

export interface SetupReport {
  cli: { state: CliState; path: string | null; version: string | null; spec: string; bin?: string };
  skill: (SkillReport & { checkout?: undefined }) | { checkout: string; path: null; state: "checkout"; doorway: null };
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

/** The command on PATH: found, installed, or left to the next sentence. */
function setupCli(options: { install: boolean; say: (text: string) => void }): SetupReport["cli"] {
  const spec = installSpec();
  const found = findOnPath("sheep");
  if (found !== undefined) return { state: "on-path", path: found, version: versionOfBin(found), spec };
  if (readStamp() === undefined) {
    // This copy is a checkout: `packages/cli/bin/sheep.js`, run by path. Nothing is installed over a developer's tree.
    return { state: "checkout", path: join(codeDir, "..", "bin", "sheep.js"), version: "sheep 0.0.0-checkout", spec };
  }
  if (!options.install) return { state: "not-installed", path: null, version: null, spec };
  options.say(`sheep: installing the command (npm install -g ${spec})\n`);
  const done = spawnSync("npm", ["install", "-g", spec], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false" } });
  if (done.status !== 0) {
    options.say(`sheep: npm install -g ${spec} exited ${done.status}:\n${(done.stderr || done.stdout || "").trim()}\n`);
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
  /** Where the skill goes: the current working directory. */
  dir: string;
  install: boolean;
  say: (text: string) => void;
}

export async function setup(config: SheepConfig, options: SetupOptions): Promise<SetupReport> {
  const cli = setupCli(options);
  const checkout = checkoutRoot(options.dir) ?? (cli.state === "checkout" ? checkoutRoot(cli.path!) ?? null : null);
  const skill: SetupReport["skill"] =
    checkoutRoot(options.dir) !== undefined
      ? { checkout: checkoutRoot(options.dir)!, path: null, state: "checkout", doorway: null }
      : installSkill(options.dir);
  const home = await setupHome(config);
  const next =
    cli.state === "not-installed" || cli.state === "failed"
      ? `npm install -g ${cli.spec}`
      : cli.bin !== undefined
        ? `export PATH="${cli.bin}:$PATH"`
        : home.state === "none"
          ? "sheep home local"
          : "sheep --agent-help";
  return { cli, skill, home, checkout, next };
}

/** The report as prose: one line per thing, its state and where, then the next sentence. */
export function formatSetup(report: SetupReport, dir: string): string {
  const { cli, skill, home } = report;
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
  const homeLine =
    home.state === "none"
      ? "home: none configured"
      : home.state === "local"
        ? `home: ${home.home ?? "(none)"} (local, ${home.running ? `running, pid ${home.pid}` : "stopped; started on demand"})`
        : `home: ${home.home} (${home.answers ? "answers" : "does not answer"})`;
  return `${cliLine}\n${skillLine}\n${homeLine}\nnext: ${report.next}\n`;
}
