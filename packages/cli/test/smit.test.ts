/**
 * The smit (smit phase 0): `checkoutStamp(root, now)`, the mark a
 * checkout's deploy gives its station, over scratch repositories made in a
 * temp directory with real git. The seven-character HEAD; `-dirty` when
 * `git status --porcelain` prints anything, which an untracked file, a
 * modified tracked file, and a submodule at another commit each make it
 * do; the given time in the manifest's shape; and undefined wherever git
 * cannot answer for the root. It spawns git and never the command.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkoutStamp } from "../src/local.js";

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const NOW = new Date("2026-09-13T12:34:56.789Z");

/** A fresh directory outside any repository. */
function scratch(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sheep-smit-")));
  made.push(dir);
  return dir;
}

/** Git in `cwd`, with no machine's config in the way and an author for commits; its stdout, or a throw naming what failed. */
function git(cwd: string, ...args: string[]): string {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "smit", GIT_AUTHOR_EMAIL: "smit@example.com", GIT_COMMITTER_NAME: "smit", GIT_COMMITTER_EMAIL: "smit@example.com" };
  const done = spawnSync("git", ["-c", "init.defaultBranch=main", "-c", "protocol.file.allow=always", ...args], { cwd, env, encoding: "utf8" });
  if (done.status !== 0) throw new Error(`git ${args.join(" ")} in ${cwd} exited ${done.status}: ${done.stderr}`);
  return done.stdout;
}

/** A repository with one commit of one file; its root and its full HEAD. */
function repository(): { root: string; head: string } {
  const root = scratch();
  git(root, "init", "-q");
  writeFileSync(join(root, "README.md"), "one\n");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "one");
  return { root, head: git(root, "rev-parse", "HEAD").trim() };
}

describe("checkoutStamp", () => {
  it("is the seven-character HEAD with no marker for a clean tree, and carries the given time in ISO seconds", () => {
    const { root, head } = repository();
    expect(checkoutStamp(root, NOW)).toEqual({ commit: head.slice(0, 7), builtAt: "2026-09-13T12:34:56Z" });
    expect(checkoutStamp(root, new Date("2027-01-02T03:04:05.000Z"))?.builtAt).toBe("2027-01-02T03:04:05Z");
  });

  it("marks an untracked file dirty", () => {
    const { root, head } = repository();
    writeFileSync(join(root, "new.txt"), "untracked\n");
    expect(checkoutStamp(root, NOW)).toEqual({ commit: `${head.slice(0, 7)}-dirty`, builtAt: "2026-09-13T12:34:56Z" });
  });

  it("marks a modified tracked file dirty, and not an ignored one", () => {
    const ignored = repository();
    writeFileSync(join(ignored.root, ".gitignore"), "dist/\n");
    git(ignored.root, "add", ".gitignore");
    git(ignored.root, "commit", "-q", "-m", "ignore");
    mkdirSync(join(ignored.root, "dist"));
    writeFileSync(join(ignored.root, "dist", "built.js"), "ignored\n");
    expect(checkoutStamp(ignored.root, NOW)?.commit).toBe(git(ignored.root, "rev-parse", "--short=7", "HEAD").trim());

    const { root, head } = repository();
    writeFileSync(join(root, "README.md"), "two\n");
    expect(checkoutStamp(root, NOW)?.commit).toBe(`${head.slice(0, 7)}-dirty`);
  });

  it("marks a submodule moved to another commit dirty", () => {
    const sub = repository();
    writeFileSync(join(sub.root, "README.md"), "two\n");
    git(sub.root, "commit", "-q", "-am", "two");
    const { root } = repository();
    git(root, "submodule", "add", "-q", sub.root, "vendor");
    git(root, "commit", "-q", "-m", "vendor");
    const head = git(root, "rev-parse", "HEAD").trim();
    expect(checkoutStamp(root, NOW)?.commit).toBe(head.slice(0, 7));
    git(join(root, "vendor"), "checkout", "-q", "HEAD~1");
    expect(checkoutStamp(root, NOW)?.commit).toBe(`${head.slice(0, 7)}-dirty`);
  });

  it("is undefined where git cannot answer for the root: no repository, no commit, or a directory inside another repository", () => {
    expect(checkoutStamp(scratch(), NOW)).toBeUndefined();
    const empty = scratch();
    git(empty, "init", "-q");
    expect(checkoutStamp(empty, NOW)).toBeUndefined();
    const { root } = repository();
    mkdirSync(join(root, "packages"));
    expect(checkoutStamp(join(root, "packages"), NOW)).toBeUndefined();
    expect(checkoutStamp(join(scratch(), "not-there"), NOW)).toBeUndefined();
  });
});
