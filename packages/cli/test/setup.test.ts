/**
 * `sheep setup`, the skill, the kennel, and the guide in the checkout:
 * what no ring walks. The PATH lookup that distrusts npx's cache (isocan
 * #48); the skill copied once with its relative doorway, never over a real
 * directory; the kennel made with its ignore entry, in a git work tree and
 * outside one; a checkout of sheep left alone; and `--agent-help` printing
 * the file beside the code, with nothing on stderr. Collar phase 2, kennel
 * phase 0. The ring proves the same command from an install, where it
 * installs.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readlinkSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findOnPath, transientDir } from "../src/onpath.js";
import { checkoutRoot, installSkill, SKILL_NAME } from "../src/setup.js";
import { bin, type Result } from "./local-home.js";

const repoRoot = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
const guide = new URL("../agent-guide.md", import.meta.url).pathname;
const skill = join(repoRoot, "SKILL.md");

/** An empty HOME for every run here: the fallback kennel is under it, so nothing of this machine's `~/.sheep` is read. */
const isolatedHome = realpathSync(mkdtempSync(join(tmpdir(), "sheep-setup-home-")));

/** A directory that is a git work tree, with nothing committed: enough for `git rev-parse` and `git ls-files`. */
async function gitDir(): Promise<string> {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-setup-git-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

/** The checkout's CLI, run in `cwd` with an empty HOME and no home in the environment. */
function sheep(cwd: string, args: string[], extra: Record<string, string> = {}): Promise<Result> {
  const env = { ...process.env, HOME: isolatedHome, ...extra };
  delete env.SHEEP_HOME;
  delete env.SHEEP_TOKEN;
  delete env.NODE_NO_WARNINGS;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
  });
}

describe("the PATH lookup", () => {
  it("skips npx's cache and a project's bin, and a link that leads back into them", () => {
    const files = new Set(["/tmp/npm-cache/_npx/abc123/node_modules/.bin/sheep", "/work/node_modules/.bin/sheep", "/usr/local/bin/sheep"]);
    const path = ["/tmp/npm-cache/_npx/abc123/node_modules/.bin", "/work/node_modules/.bin", "", "/usr/local/bin"].join(":");
    expect(findOnPath("sheep", path, (file) => files.has(file))).toBe("/usr/local/bin/sheep");
    expect(findOnPath("sheep", "/tmp/npm-cache/_npx/abc123/node_modules/.bin:/work/node_modules/.bin", (file) => files.has(file))).toBeUndefined();
    expect(findOnPath("sheep", "/nowhere", () => false)).toBeUndefined();
    expect(transientDir("/home/me/.npm/_npx/1f2e/node_modules/.bin")).toBe(true);
    expect(transientDir("/home/me/project/node_modules/.bin")).toBe(true);
    expect(transientDir("/home/me/.nvm/versions/node/v24.11.0/bin")).toBe(false);
  });
});

describe("a checkout of sheep", () => {
  it("is told from its root and from inside it, and not from a stranger's directory", async () => {
    expect(checkoutRoot(repoRoot)).toBe(repoRoot);
    expect(checkoutRoot(join(repoRoot, "packages", "cli", "src"))).toBe(repoRoot);
    const dir = await mkdtemp(join(tmpdir(), "sheep-setup-"));
    try {
      expect(checkoutRoot(dir)).toBeUndefined();
      // A release install is named sheep too, and has neither a workspace nor packages/.
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "sheep", version: "0.0.0", sheep: { commit: "abc1234" } }));
      expect(checkoutRoot(dir)).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("gets no skill and no doorway from setup, which says it is a checkout, installs nothing, and still makes the kennel", async () => {
    const before = existsSync(join(repoRoot, ".claude", "skills", SKILL_NAME));
    const json = await sheep(repoRoot, ["setup", "--json"]);
    expect(json.code).toBe(0);
    const report = JSON.parse(json.stdout);
    expect(report.checkout).toBe(repoRoot);
    expect(report.cli).toMatchObject({ state: "checkout", version: "sheep 0.0.0-checkout", spec: "github:dglazkov/sheep#release" });
    expect(report.skill).toEqual({ checkout: repoRoot, path: null, state: "checkout", doorway: null });
    // The kennel is made even here, and this repository's own .gitignore already ignores it, so nothing is appended.
    expect(report.kennel).toMatchObject({ path: join(repoRoot, ".sheep"), gitignore: { path: join(repoRoot, ".gitignore"), state: "present" }, tracked: false });
    expect(existsSync(join(repoRoot, ".sheep"))).toBe(true);
    expect(report.home).toEqual({ state: "none", home: null });
    expect(report.next).toBe("sheep home local");
    expect(existsSync(join(repoRoot, ".claude", "skills", SKILL_NAME))).toBe(before);
    expect(json.stderr).toBe("");

    // The prose, from inside a checkout that is not this one, so no directory of this repository is written to.
    const fake = realpathSync(await mkdtemp(join(tmpdir(), "sheep-setup-checkout-")));
    try {
      await writeFile(join(fake, "package.json"), JSON.stringify({ name: "sheep", workspaces: ["packages/*"] }));
      await mkdir(join(fake, "packages", "cli"), { recursive: true });
      const prose = await sheep(join(fake, "packages", "cli"), ["setup"]);
      expect(prose.code).toBe(0);
      expect(prose.stdout).toContain("running from a checkout");
      expect(prose.stdout).toContain(`inside a checkout of sheep (${fake})`);
      expect(prose.stdout).toContain("kennel: .sheep/ made; not a git work tree, so no .gitignore\n");
      expect(prose.stdout).toContain("home: none configured\nnext: sheep home local\n");
      // The kennel is the directory setup ran in, not the checkout's root: setup readies where it stands.
      expect(existsSync(join(fake, "packages", "cli", ".sheep"))).toBe(true);
      expect(existsSync(join(fake, ".sheep"))).toBe(false);
    } finally {
      await rm(fake, { recursive: true, force: true });
    }
  });
});

describe("the skill", () => {
  it("is copied once with a relative doorway, current after, refreshed when it differs, and never over a real directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sheep-setup-"));
    try {
      const first = installSkill(dir, skill);
      expect(first).toEqual({ path: join(dir, ".agents", "skills", SKILL_NAME), state: "installed", doorway: { path: join(dir, ".claude", "skills", SKILL_NAME), state: "linked" } });
      expect(await readFile(join(first.path, "SKILL.md"), "utf8")).toBe(await readFile(skill, "utf8"));
      expect(lstatSync(first.doorway.path).isSymbolicLink()).toBe(true);
      expect(readlinkSync(first.doorway.path)).toBe(join("..", "..", ".agents", "skills", SKILL_NAME));
      expect(await readFile(join(first.doorway.path, "SKILL.md"), "utf8")).toBe(await readFile(skill, "utf8"));

      expect(installSkill(dir, skill)).toMatchObject({ state: "current", doorway: { state: "current" } });

      await writeFile(join(first.path, "SKILL.md"), "an older doorway\n");
      expect(installSkill(dir, skill)).toMatchObject({ state: "refreshed", doorway: { state: "current" } });
      expect(await readFile(join(first.path, "SKILL.md"), "utf8")).toBe(await readFile(skill, "utf8"));

      // Somebody's real directory at the doorway's place: left alone, and said so.
      const other = await mkdtemp(join(tmpdir(), "sheep-setup-"));
      await mkdir(join(other, ".claude", "skills", SKILL_NAME), { recursive: true });
      await writeFile(join(other, ".claude", "skills", SKILL_NAME, "SKILL.md"), "theirs\n");
      expect(installSkill(other, skill)).toMatchObject({ state: "installed", doorway: { state: "kept" } });
      expect(await readFile(join(other, ".claude", "skills", SKILL_NAME, "SKILL.md"), "utf8")).toBe("theirs\n");
      expect(lstatSync(join(other, ".claude", "skills", SKILL_NAME)).isSymbolicLink()).toBe(false);
      // A symlink to somewhere else is kept too.
      const linked = await mkdtemp(join(tmpdir(), "sheep-setup-"));
      await mkdir(join(linked, ".claude", "skills"), { recursive: true });
      await symlink("/elsewhere", join(linked, ".claude", "skills", SKILL_NAME));
      expect(installSkill(linked, skill)).toMatchObject({ doorway: { state: "kept" } });
      expect(readlinkSync(join(linked, ".claude", "skills", SKILL_NAME))).toBe("/elsewhere");
      await rm(other, { recursive: true, force: true });
      await rm(linked, { recursive: true, force: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("is installed by setup into a directory that is not a checkout, with the home reported and never started", async () => {
    const dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-setup-")));
    try {
      const first = await sheep(dir, ["setup", "--json", "--no-install"]);
      expect(first.code).toBe(0);
      const report = JSON.parse(first.stdout);
      expect(report.cli.state).toBe("checkout");
      expect(report.skill).toMatchObject({ state: "installed", doorway: { state: "linked" } });
      expect(report.home).toEqual({ state: "none", home: null });
      expect(report.next).toBe("sheep home local");
      expect(existsSync(join(dir, ".agents", "skills", SKILL_NAME, "SKILL.md"))).toBe(true);
      expect(readlinkSync(join(dir, ".claude", "skills", SKILL_NAME))).toBe("../../.agents/skills/sheep");

      // The kennel was made here, empty, and this directory is in no git work tree, so it gets no .gitignore.
      expect(report.kennel).toEqual({ path: join(dir, ".sheep"), state: "made", gitignore: { path: null, state: "not-git" }, tracked: false });
      expect(existsSync(join(dir, ".gitignore"))).toBe(false);

      // Another home in that kennel's config, answering nobody: reported as such, nothing started, and the next sentence is the guide.
      await writeFile(join(dir, ".sheep", "config"), JSON.stringify({ home: "http://127.0.0.1:9", token: "t" }));
      const again = await sheep(dir, ["setup", "--no-install"]);
      expect(again.code).toBe(0);
      expect(again.stdout).toBe(
        `sheep: running from a checkout, ${bin}; nothing installed\n` +
          `skill: .agents/skills/sheep current; .claude/skills/sheep already links to it\n` +
          `kennel: .sheep/ already here; not a git work tree, so no .gitignore\n` +
          `home: http://127.0.0.1:9 (does not answer)\n` +
          `next: sheep --agent-help\n`,
      );
      expect(existsSync(join(dir, ".sheep", "local"))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the kennel", () => {
  it("is made with the ignore entry in a git work tree, adds no second line, and leaves nothing under .sheep for git to see", async () => {
    const dir = await gitDir();
    try {
      const first = JSON.parse((await sheep(dir, ["setup", "--json", "--no-install"])).stdout);
      expect(first.kennel).toEqual({ path: join(dir, ".sheep"), state: "made", gitignore: { path: join(dir, ".gitignore"), state: "added" }, tracked: false });
      expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(".sheep/\n");

      // Journey 2 step 1: the one line changed, and nothing under .sheep is untracked, once there is something under it to see.
      await writeFile(join(dir, ".sheep", "config"), JSON.stringify({ home: "http://127.0.0.1:9", token: "a-token" }));
      const status = spawnSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }).stdout;
      expect(status).toContain("?? .gitignore\n");
      expect(status).not.toContain(".sheep");
      expect(spawnSync("git", ["status", "--porcelain", "--ignored"], { cwd: dir, encoding: "utf8" }).stdout).toContain("!! .sheep/\n");

      // Idempotent: the kennel is there, the entry is there, and the file is untouched.
      const again = JSON.parse((await sheep(dir, ["setup", "--json", "--no-install"])).stdout);
      expect(again.kennel).toMatchObject({ state: "present", gitignore: { state: "present" } });
      expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(".sheep/\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("appends the entry on its own line to a .gitignore that has one already, whether or not it ends in a newline", async () => {
    const dir = await gitDir();
    try {
      await writeFile(join(dir, ".gitignore"), "node_modules/\n*.log");
      const report = JSON.parse((await sheep(dir, ["setup", "--json", "--no-install"])).stdout);
      expect(report.kennel.gitignore.state).toBe("added");
      expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe("node_modules/\n*.log\n.sheep/\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("says in one line on stderr, from setup and from sheep home, that a tracked .sheep puts a token in the repository, and goes on", async () => {
    const dir = await gitDir();
    try {
      await mkdir(join(dir, ".sheep"));
      await writeFile(join(dir, ".sheep", "config"), JSON.stringify({ home: "http://127.0.0.1:9", token: "t" }));
      // The shepherd committed it once: staged is enough for `git ls-files .sheep` to name it.
      expect(spawnSync("git", ["add", "-f", ".sheep"], { cwd: dir, encoding: "utf8" }).status).toBe(0);

      const setup = await sheep(dir, ["setup", "--json", "--no-install"]);
      expect(setup.code).toBe(0);
      expect(setup.stderr.trimEnd().split("\n")).toHaveLength(1);
      expect(setup.stderr).toContain(`git tracks .sheep in ${dir}`);
      expect(setup.stderr).toContain("a token is in the repository");
      expect(JSON.parse(setup.stdout).kennel).toMatchObject({ state: "present", tracked: true });

      // Nothing was fixed: the file is still tracked, and `sheep home` says the same line and answers all the same.
      expect(spawnSync("git", ["ls-files", ".sheep"], { cwd: dir, encoding: "utf8" }).stdout.trim()).toBe(".sheep/config");
      const home = await sheep(dir, ["home"]);
      expect(home.code).toBe(0);
      expect(home.stderr.trimEnd().split("\n")).toHaveLength(1);
      expect(home.stderr).toContain("a token is in the repository");
      expect(home.stdout).toBe(`home: http://127.0.0.1:9 (does not answer)\nkennel: ${join(dir, ".sheep")}\n`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the guide", () => {
  it("is what --agent-help prints, from beside the code, wherever the flag is before a prompt, with nothing on stderr", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sheep-setup-"));
    try {
      const text = await readFile(guide, "utf8");
      // The guide is read whole, by an agent, before it does anything, and this bound is what keeps it holdable. It does
      // not move: bleat phase 1's section on a sheep that is slow was paid for by cutting the guide, as mint phase 1's
      // bullet was, not by raising the cap.
      expect(text.split(/\s+/).length).toBeLessThan(1500);
      for (const said of ["sheep home local", "ANTHROPIC_API_KEY", "sheep wait", "--detach", "sheep pasture new", "A hand at a terminal", "npm install -g github:dglazkov/sheep#release"]) {
        expect(text).toContain(said);
      }
      const printed = await sheep(dir, ["--agent-help"]);
      expect(printed).toEqual({ stdout: text, stderr: "", code: 0 });
      const anywhere = await sheep(dir, ["ls", "--agent-help"]);
      expect(anywhere).toEqual({ stdout: text, stderr: "", code: 0 });
      // node:sqlite is imported by export alone, so --version on Node 24 prints no ExperimentalWarning.
      const version = await sheep(dir, ["--version"]);
      expect(version).toEqual({ stdout: "sheep 0.0.0-checkout\n", stderr: "", code: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
