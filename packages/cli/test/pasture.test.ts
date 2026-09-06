/**
 * pasture phase 0 through the built CLI against a local home, which has no
 * container: journey 1 steps 1 to 3 with a scratch repository as `--repo .`
 * and with a URL; `secret ls` printing the name only; `sheep new --pasture`
 * then `sheep ls` showing the last column and `--json` the field; and
 * journey 4 step 3's refusal, verbatim. Skips, with a message, when the
 * home cannot be started here.
 */
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { NO_ORIGIN, VALUE_NOT_AN_ARGUMENT } from "../src/pasture.js";
import { type Result, type RunOptions, runSheep, startHome, stopHome } from "./local-home.js";

const TOKEN = "pasture-0-token";
const run = promisify(execFile);

const home = await startHome(TOKEN);
if (typeof home === "string") process.stderr.write(`pasture phase 0 skipped: ${home}\n`);

async function sheep(args: string[], options: RunOptions = {}): Promise<Result> {
  if (typeof home === "string") throw new Error(home);
  return runSheep(home, args, options);
}

/** A checkout with an `origin`, or without one. Nothing in it is ever uploaded. */
async function scratchRepo(origin: string | undefined): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sheep-scratch-"));
  await run("git", ["init", "-q"], { cwd: dir });
  if (origin !== undefined) await run("git", ["remote", "add", "origin", origin], { cwd: dir });
  return dir;
}

const ID = /^[0-9a-f-]{36}$/;

/** Rows of `sheep ls`: the trailing newline off, never the trailing tab of an empty last column. */
function rowsOf(stdout: string): string[][] {
  return stdout.replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
}
const SECRET = "ghp-fixture-1d4e7a2c9b6f0835-never-printed";

describe.skipIf(typeof home === "string")("pasture phase 0: the object, and the verbs, through sheep against a local home", () => {
  afterAll(async () => {
    if (typeof home === "string") return;
    await stopHome(home);
  });

  it("journey 1 steps 1 to 3: a pasture with a repository, its secret, and its brief", { timeout: 120_000 }, async () => {
    // Step 1: `--repo .` reads the checkout's origin and prints name, repository, branch. `sheep pasture ls` lists it.
    const checkout = await scratchRepo("https://github.com/example/scratch.git");
    const made = await sheep(["pasture", "new", "docs", "--repo", "."], { cwd: checkout });
    expect(made.stderr).toBe("");
    expect(made.code).toBe(0);
    expect(made.stdout).toBe("docs\thttps://github.com/example/scratch.git\tmain\n");
    // No remote is a sentence, not a guess; and no pasture.
    const bare = await scratchRepo(undefined);
    const noOrigin = await sheep(["pasture", "new", "bare", "--repo", "."], { cwd: bare });
    expect(noOrigin.code).toBe(2);
    expect(noOrigin.stderr).toBe(`sheep: ${NO_ORIGIN}\n`);
    expect(NO_ORIGIN).toBe("no `origin` remote here, so --repo . names no repository; pass --repo <url>, or run this in a checkout that has one");
    const notARepo = await sheep(["pasture", "new", "bare", "--repo", "."], { cwd: tmpdir() });
    expect(notARepo.code).toBe(2);
    expect(notARepo.stderr).toBe(`sheep: ${NO_ORIGIN}\n`);
    // A URL, and a branch.
    const url = await sheep(["pasture", "new", "src", "--repo", "https://github.com/example/src", "--branch", "dev"]);
    expect(url.code).toBe(0);
    expect(url.stdout).toBe("src\thttps://github.com/example/src\tdev\n");
    // A pasture with no repository.
    const notes = await sheep(["pasture", "new", "notes"]);
    expect(notes.code).toBe(0);
    expect(notes.stdout).toBe("notes\t\tmain\n");
    expect(JSON.parse((await sheep(["pasture", "new", "json", "--json"])).stdout)).toMatchObject({ name: "json", repo: null, branch: "main" });
    // Names are [a-z0-9-]+, and taken once.
    expect((await sheep(["pasture", "new", "Docs"])).code).toBe(2);
    const taken = await sheep(["pasture", "new", "docs"]);
    expect(taken.code).toBe(2);
    expect(taken.stderr).toBe("sheep: a pasture named docs is already at this home\n");
    const ls = await sheep(["pasture", "ls"]);
    expect(ls.code).toBe(0);
    const rows = ls.stdout.trimEnd().split("\n").map((line) => line.split("\t"));
    expect(rows.map((row) => row[0]).sort()).toEqual(["docs", "json", "notes", "src"]);
    for (const row of rows) expect(Number.isNaN(Date.parse(row[1]!))).toBe(false);
    expect((await sheep(["pasture", "ls"])).stdout).not.toContain("bare");

    // Step 2: the token piped in; `secret ls` prints the name and nothing of the value.
    const set = await sheep(["pasture", "secret", "set", "docs", "GIT_TOKEN"], { stdin: `${SECRET}\n` });
    expect(set.code).toBe(0);
    expect(set.stdout).toBe("docs\tGIT_TOKEN\n");
    expect(set.stderr).toBe("");
    const asArgument = await sheep(["pasture", "secret", "set", "docs", "NPM_TOKEN", "not-like-this"], { stdin: "" });
    expect(asArgument.code).toBe(2);
    expect(asArgument.stderr).toBe(`sheep: ${VALUE_NOT_AN_ARGUMENT}\n`);
    expect((await sheep(["pasture", "secret", "set", "docs", "EMPTY"], { stdin: "" })).code).toBe(2);
    const names = await sheep(["pasture", "secret", "ls", "docs"]);
    expect(names.code).toBe(0);
    expect(names.stdout).toBe("GIT_TOKEN\n");
    expect(`${names.stdout}${names.stderr}${set.stdout}${set.stderr}`).not.toContain(SECRET);
    expect(JSON.parse((await sheep(["pasture", "secret", "ls", "docs", "--json"])).stdout)).toEqual(["GIT_TOKEN"]);
    const view = await sheep(["pasture", "docs", "--json"]);
    expect(view.stdout).not.toContain(SECRET);

    // Step 3: the brief on stdin; a file by name; cat, ls, rm.
    const brief = "# scratch\n\nsrc/ is the library, test/ its tests, docs/ the site.\nName your branch in /pasture/notes/<your name>.md before you push.\n";
    const put = await sheep(["pasture", "put", "docs", "BRIEF.md"], { stdin: brief });
    expect(put.code).toBe(0);
    expect(put.stdout).toBe(`docs\tBRIEF.md\t${Buffer.byteLength(brief)}\n`);
    const file = join(checkout, "typo.md");
    await writeFile(file, "branch: fix-typo\n");
    expect((await sheep(["pasture", "put", "docs", "notes/typo.md", file])).code).toBe(0);
    const cat = await sheep(["pasture", "cat", "docs", "BRIEF.md"]);
    expect(cat.code).toBe(0);
    expect(cat.stdout).toBe(brief);
    expect((await sheep(["pasture", "cat", "docs", "notes/typo.md"])).stdout).toBe("branch: fix-typo\n");
    expect((await sheep(["pasture", "ls", "docs"])).stdout).toBe("BRIEF.md\nnotes/\nnotes/typo.md\n");
    expect((await sheep(["pasture", "ls", "docs", "notes"])).stdout).toBe("notes/typo.md\n");
    expect((await sheep(["pasture", "rm", "docs", "notes/typo.md"])).code).toBe(0);
    const gone = await sheep(["pasture", "cat", "docs", "notes/typo.md"]);
    expect(gone.code).toBe(2);
    expect(gone.stderr).toBe("sheep: no notes/typo.md in pasture docs\n");
    const missing = await sheep(["pasture", "cat", "meadow", "BRIEF.md"]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toBe("sheep: no pasture named meadow at this home; `sheep pasture ls` lists the ones there are\n");
  });

  it("journey 4 steps 3 and 4, and the column of journey 1 step 6: a birth into a pasture is a row with a column", { timeout: 120_000 }, async () => {
    expect((await sheep(["pasture", "new", "meadow"])).code).toBe(0);
    expect((await sheep(["pasture", "new", "cloned", "--repo", "https://github.com/example/cloned"])).code).toBe(0);

    // Step 4 first, on the home before any birth: the same columns as before, plus an empty last one; --json has pasture: null.
    const lamb = await sheep(["new", "--name", "lamb", "--detach"]);
    expect(lamb.code).toBe(0);
    expect(lamb.stdout).toMatch(/^[0-9a-f-]{36}\n$/);
    const lambId = lamb.stdout.trim();
    const lsBefore = await sheep(["ls"]);
    const lambRow = rowsOf(lsBefore.stdout).find((row) => row[0] === lambId);
    expect(lambRow).toEqual([lambId, "lamb", lambRow![2], "idle", ""]);
    expect(Number.isNaN(Date.parse(lambRow![2]!))).toBe(false);
    const lambJson = (JSON.parse((await sheep(["ls", "--json"])).stdout) as Array<Record<string, unknown>>).find((row) => row.id === lambId);
    expect(lambJson).toMatchObject({ id: lambId, name: "lamb", state: "idle", pasture: null, task: null });

    // Journey 1 step 6's column: a sheep born into a pasture shows it, last.
    const born = await sheep(["new", "--pasture", "meadow", "--name", "grazer", "--detach"]);
    expect(born.code).toBe(0);
    expect(born.stdout).toMatch(/^[0-9a-f-]{36}\n$/);
    const grazer = born.stdout.trim();
    const ls = await sheep(["ls"]);
    const rows = rowsOf(ls.stdout);
    expect(rows.find((row) => row[0] === grazer)).toEqual([grazer, "grazer", rows.find((row) => row[0] === grazer)![2], "idle", "meadow"]);
    expect(rows.find((row) => row[0] === lambId)![4]).toBe("");
    for (const row of rows) expect(row).toHaveLength(5);
    const json = JSON.parse((await sheep(["ls", "--json"])).stdout) as Array<{ id: string; pasture: string | null; task: string | null }>;
    expect(json.find((row) => row.id === grazer)).toMatchObject({ pasture: "meadow", task: null });
    expect(json.find((row) => row.id === lambId)).toMatchObject({ pasture: null, task: null });
    // `sheep ls --pasture` is that herd, and `sheep pasture <name>` prints the same rows.
    const herd = await sheep(["ls", "--pasture", "meadow"]);
    expect(herd.code).toBe(0);
    expect(herd.stdout).toBe(`${rows.find((row) => row[0] === grazer)!.join("\t")}\n`);
    const view = await sheep(["pasture", "meadow"]);
    expect(view.code).toBe(0);
    expect(view.stdout).toMatch(/^name: meadow\nrepo: \(none\)\nbranch: main\ncreated: \d{4}-.*\n/);
    expect(view.stdout.replace(/\n$/, "").split("\n").at(-1)).toBe(`${grazer}\tgrazer\tidle\t${rows.find((row) => row[0] === grazer)![2]}\t`);
    const viewJson = JSON.parse((await sheep(["pasture", "meadow", "--json"])).stdout) as { herd: Array<{ id: string }> };
    expect(viewJson.herd.map((session) => session.id)).toEqual([grazer]);
    expect(viewJson.herd).toEqual(JSON.parse(herd.stdout === "" ? "[]" : (await sheep(["ls", "--pasture", "meadow", "--json"])).stdout));

    // Journey 4 step 3: the refusal, one sentence, the directory's; no session was made and `sheep ls` is unchanged.
    const before = await sheep(["ls"]);
    const refused = await sheep(["new", "--pasture", "cloned", "--detach"]);
    expect(refused.code).toBe(2);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toBe("sheep: pasture cloned has a repository, and this home has no container to clone it with; a pasture with no repository would work here\n");
    expect((await sheep(["ls"])).stdout).toBe(before.stdout);
    const unknown = await sheep(["new", "--pasture", "nowhere", "--detach", "--", "hello"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toBe("sheep: no pasture named nowhere at this home; `sheep pasture ls` lists the ones there are\n");
    expect((await sheep(["ls"])).stdout).toBe(before.stdout);
    expect((await sheep(["new", "--pasture", "Not-Valid"])).code).toBe(2);
    expect((await sheep(["ls"])).stdout).toBe(before.stdout);
    expect(ID.test(grazer)).toBe(true);
  });
});
