/**
 * The name of a station, kennel phase 1: `mintName` is a pure rule and
 * this is its proof. Station phase 1 walks it on the account; nothing
 * here deploys, and nothing here reads the machine's `~/.sheep`.
 */
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sheepDir } from "../src/config.js";
import { kennelName, mintName } from "../src/name.js";

const none = new Set<string>();

describe("mintName", () => {
  it("lowercases", () => {
    expect(mintName("Blog", none)).toBe("blog");
    expect(mintName("MyPI", none)).toBe("mypi");
  });

  it("makes every run of characters outside [a-z0-9] one hyphen", () => {
    expect(mintName("my blog", none)).toBe("my-blog");
    expect(mintName("my   blog", none)).toBe("my-blog");
    expect(mintName("my_blog.2026 (draft)", none)).toBe("my-blog-2026-draft");
    expect(mintName("café", none)).toBe("caf");
    expect(mintName("a--b", none)).toBe("a-b");
  });

  it("trims hyphens from both ends", () => {
    expect(mintName("-blog-", none)).toBe("blog");
    expect(mintName("  blog  ", none)).toBe("blog");
    expect(mintName("__blog__", none)).toBe("blog");
    expect(mintName(".sheep", none)).toBe("sheep");
  });

  it("truncates to fifty characters and leaves no hyphen trailing", () => {
    const long = "a".repeat(60);
    expect(mintName(long, none)).toBe("a".repeat(50));
    // The cut lands on a hyphen: 49 letters, a hyphen, then more; the hyphen goes with the rest.
    const cut = `${"b".repeat(49)}-${"c".repeat(20)}`;
    expect(mintName(cut, none)).toBe("b".repeat(49));
    expect(mintName(cut, none)).not.toMatch(/-$/);
    // Fifty exactly stays whole.
    expect(mintName("d".repeat(50), none)).toBe("d".repeat(50));
  });

  it("is sheep when nothing is left", () => {
    expect(mintName("", none)).toBe("sheep");
    expect(mintName("---", none)).toBe("sheep");
    expect(mintName("!!!", none)).toBe("sheep");
    expect(mintName("日本語", none)).toBe("sheep");
  });

  it("counts from -2 against a set holding Workers and container applications alike", () => {
    // A Worker named blog, and a container application named blog-2 that a failed delete left behind.
    expect(mintName("blog", new Set(["blog", "blog-2"]))).toBe("blog-3");
    expect(mintName("blog", new Set(["blog"]))).toBe("blog-2");
    expect(mintName("blog", new Set(["blog-2"]))).toBe("blog");
    expect(mintName("blog", new Set(["blog", "blog-2", "blog-3", "blog-4"]))).toBe("blog-5");
    expect(mintName("", new Set(["sheep"]))).toBe("sheep-2");
    // The counter is unaffected by the cut: a fifty-character base takes -2 past the fifty.
    const long = "a".repeat(50);
    expect(mintName("a".repeat(70), new Set([long]))).toBe(`${long}-2`);
  });

  it("takes wanted verbatim, even when it is taken or breaks every rule", () => {
    expect(mintName("blog", none, "other")).toBe("other");
    expect(mintName("blog", new Set(["other"]), "other")).toBe("other");
    expect(mintName("blog", new Set(["Other-"]), "Other-")).toBe("Other-");
    expect(mintName("", none, "")).toBe("");
  });

  it("never puts a hash of anything in the name: the same basename mints the same name", () => {
    expect(mintName("blog", none)).toBe(mintName("blog", none));
    expect(mintName("/Users/someone/code/blog".split("/").pop()!, none)).toBe("blog");
  });
});

describe("kennelName", () => {
  const made: string[] = [];
  afterAll(async () => {
    for (const dir of made) await rm(dir, { recursive: true, force: true });
  });

  it("is the kennel directory's basename, found by walking up", async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), "sheep-name-")));
    made.push(root);
    await mkdir(join(root, "My Blog", ".sheep"), { recursive: true });
    await mkdir(join(root, "My Blog", "posts", "2026"), { recursive: true });
    // The basename is handed over as it is; mintName does the lowering and the hyphens.
    expect(kennelName(join(root, "My Blog"))).toBe("My Blog");
    expect(kennelName(join(root, "My Blog", "posts", "2026"))).toBe("My Blog");
    expect(mintName(kennelName(join(root, "My Blog", "posts", "2026")), none)).toBe("my-blog");
  });

  it("is sheep for the fallback kennel, ~/.sheep, whether or not it exists", async () => {
    // A directory with no kennel above it inside the temp tree; the walk falls back to ~/.sheep.
    // (tmpdir is not under the home directory on macOS or Linux CI; when it is, the fallback is still what a
    // kennel-less walk reaches, and the answer is the same.)
    const root = realpathSync(await mkdtemp(join(tmpdir(), "sheep-name-")));
    made.push(root);
    await mkdir(join(root, "plain", "deep"), { recursive: true });
    const from = join(root, "plain", "deep");
    // If some kennel sits above tmpdir, the walk finds it and the fixture is moot; say so rather than fail on a machine's layout.
    if (sheepDir(from) !== join(homedir(), ".sheep")) return;
    expect(kennelName(from)).toBe("sheep");
  });
});
