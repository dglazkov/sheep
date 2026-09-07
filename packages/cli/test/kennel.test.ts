/**
 * Finding the kennel: the walk up from the working directory to the first
 * `.sheep/`, and `~/.sheep` when there is none. Kennel phase 0. The rule
 * is `sheepDir()`, which `configPath()` and `localDir()` are both built
 * from, so what it answers decides which config a command reads and which
 * home it starts. Proved twice: as the function, over a fixture tree, and
 * through `bin/sheep.js`, whose only knobs are its working directory and
 * `HOME` — there is no variable that moves either any more.
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { kennelDir, sheepDir } from "../src/config.js";
import { bin, type Result } from "./local-home.js";

const made: string[] = [];
afterAll(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true });
});

/**
 * A tree:
 *
 *   <root>/.sheep/            the outer kennel
 *   <root>/blog/.sheep/       the nearer one
 *   <root>/blog/posts/2026/   a working directory under it, with none of its own
 *   <root>/plain/deep/        no kennel at or above it inside the tree
 */
async function tree(): Promise<string> {
  const root = realpathSync(await mkdtemp(join(tmpdir(), "sheep-kennel-")));
  made.push(root);
  await mkdir(join(root, ".sheep"));
  await mkdir(join(root, "blog", ".sheep"), { recursive: true });
  await mkdir(join(root, "blog", "posts", "2026"), { recursive: true });
  await mkdir(join(root, "plain", "deep"), { recursive: true });
  return root;
}

/** The CLI in `cwd` with `HOME` its own empty directory and no home in the environment. */
function sheep(cwd: string, home: string, args: string[]): Promise<Result> {
  const env = { ...process.env, HOME: home, NODE_NO_WARNINGS: "1" };
  delete env.SHEEP_HOME;
  delete env.SHEEP_TOKEN;
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

/** The `kennel:` line of `sheep config`, which is the discovery the command actually did. */
const kennelOf = (result: Result): string | undefined => /^kennel: (.+)$/m.exec(result.stdout)?.[1];

describe("the walk up to the kennel", () => {
  it("takes the nearest, finds a parent's from a subdirectory, and falls back to ~/.sheep when there is none", async () => {
    const root = await tree();

    // The directory's own wins over the one above it.
    expect(sheepDir(join(root, "blog"))).toBe(join(root, "blog", ".sheep"));
    expect(sheepDir(root)).toBe(join(root, ".sheep"));

    // A subdirectory finds its parent's, however deep, as git finds .git.
    expect(sheepDir(join(root, "blog", "posts", "2026"))).toBe(join(root, "blog", ".sheep"));
    // Past blog's, the next one up is the root's.
    expect(sheepDir(join(root, "plain", "deep"))).toBe(join(root, ".sheep"));

    // None at or above: the home directory's, whether or not it exists.
    expect(sheepDir(tmpdir())).toBe(join(homedir(), ".sheep"));

    // The kennel directory is what holds it: where the ignore entry goes and where git is asked.
    expect(kennelDir(join(root, "blog", "posts", "2026"))).toBe(join(root, "blog"));
  });

  it("is the same walk the command does, with nothing but a working directory and HOME to move it", async () => {
    const root = await tree();
    const home = realpathSync(await mkdtemp(join(tmpdir(), "sheep-kennel-home-")));
    made.push(home);
    await mkdir(join(home, ".sheep"));
    await writeFile(join(root, "blog", ".sheep", "config"), JSON.stringify({ home: "https://blog.example", token: "b" }));
    await writeFile(join(home, ".sheep", "config"), JSON.stringify({ home: "https://fallback.example", token: "f" }));

    // In the kennel, and in a subdirectory of it: blog's, and blog's config.
    const inBlog = await sheep(join(root, "blog"), home, ["config"]);
    expect(inBlog.code).toBe(0);
    expect(kennelOf(inBlog)).toBe(join(root, "blog", ".sheep"));
    expect(inBlog.stdout).toContain("home: https://blog.example\n");

    const deep = await sheep(join(root, "blog", "posts", "2026"), home, ["config"]);
    expect(kennelOf(deep)).toBe(join(root, "blog", ".sheep"));
    expect(deep.stdout).toContain("home: https://blog.example\n");

    // Outside any kennel of the tree: the root's, which holds no config.
    const atRoot = await sheep(join(root, "plain", "deep"), home, ["config"]);
    expect(kennelOf(atRoot)).toBe(join(root, ".sheep"));
    expect(atRoot.stdout).toContain("home: (none)\n");

    // Nowhere near one: HOME's, and the config a dog once put there.
    const away = await sheep(tmpdir(), home, ["config"]);
    expect(kennelOf(away)).toBe(join(home, ".sheep"));
    expect(away.stdout).toContain("home: https://fallback.example\n");
  });
});
