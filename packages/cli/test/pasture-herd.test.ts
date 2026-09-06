/**
 * pasture phase 2 through the built CLI against a local home with the
 * faux provider, which has no container: journey 1 step 6, the herd from
 * `sheep pasture <name>` with the task each sheep was given and `sheep ls
 * --pasture` listing the same two; step 7, a sheep running `pasture` in
 * its shell while the dog runs `sheep pasture <name>`, the two views
 * compared byte for byte once the program's mark on the sheep's own line
 * is taken off; and journey 2 step 1, a note put from a file the sheep
 * wrote in `/workspace` and from stdin, read by `sheep pasture cat` at
 * once, and journey 2 step 5 from the sheep's side. Skips, with a
 * message, when the home cannot be started here.
 */
import { afterAll, describe, expect, it } from "vitest";
import { type Result, type RunOptions, runSheep, scriptFaux, startHome, stopHome } from "./local-home.js";

const TOKEN = "pasture-2-token";

const home = await startHome(TOKEN);
if (typeof home === "string") process.stderr.write(`pasture phase 2 skipped: ${home}\n`);

async function sheep(args: string[], options: RunOptions = {}): Promise<Result> {
  if (typeof home === "string") throw new Error(home);
  return runSheep(home, args, options);
}

async function script(path: string, program: unknown): Promise<void> {
  if (typeof home === "string") throw new Error(home);
  expect(await scriptFaux(home, path, program)).toBe(200);
}

const ID = /^[0-9a-f-]{36}$/;

interface Entry {
  type: string;
  message?: { role: string; content: string | Array<{ type: string; text?: string }> };
}

function entriesOf(stdout: string): Entry[] {
  return stdout
    .trimEnd()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Entry);
}

function textOf(entry: Entry): string {
  const content = entry.message?.content;
  if (typeof content === "string") return content;
  return (content ?? []).flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("");
}

/** The tool results in a sheep's transcript so far, oldest first. */
async function toolResults(id: string): Promise<string[]> {
  const entries = entriesOf((await sheep(["log", id, "--json"])).stdout);
  return entries.filter((entry) => entry.type === "message" && entry.message?.role === "toolResult").map(textOf);
}

/** Polls the transcript until it has `count` tool results, or the deadline passes. */
async function untilToolResults(id: string, count: number, timeoutMs = 30_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const results = await toolResults(id);
    if (results.length >= count || Date.now() >= deadline) return results;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** Rows of a herd view: the four meta lines, then the sheep. */
function rowsOf(stdout: string): string[] {
  return stdout.replace(/\n$/, "").split("\n");
}

describe.skipIf(typeof home === "string")("pasture phase 2: the program, and the herd, through sheep against a local home", () => {
  afterAll(async () => {
    if (typeof home === "string") return;
    await stopHome(home);
  });

  it("journey 1 steps 6 and 7 and journey 2 steps 1 and 5: the two views are the same rows, and a sheep's note is the dog's at once", { timeout: 180_000 }, async () => {
    expect((await sheep(["pasture", "new", "docs"])).code).toBe(0);
    const brief = "# docs\n\nName your branch in /pasture/notes/<your name>.md before you push.\n";
    expect((await sheep(["pasture", "put", "docs", "BRIEF.md"], { stdin: brief })).code).toBe(0);

    // Step 4's births, each with a task, detached; the faux answers each with a word and the turn ends.
    const typoTask = "Fix the typo in README.md on a branch, commit, push.";
    const linksTask = "Fix the dead links in docs/ on a branch, commit, push.";
    const typoBorn = await sheep(["new", "--pasture", "docs", "--name", "typo", "--detach", "--", `${typoTask}\nThe second line is not the task.`]);
    expect(typoBorn.code).toBe(0);
    const typo = typoBorn.stdout.trim();
    expect(ID.test(typo)).toBe(true);
    const linksBorn = await sheep(["new", "--pasture", "docs", "--name", "links", "--detach", "--", linksTask]);
    expect(linksBorn.code).toBe(0);
    const links = linksBorn.stdout.trim();
    expect((await sheep(["wait", "--timeout", "60", typo, links])).code).toBe(0);

    // Step 6: the herd, both sheep, their state, when each was born, and the task each was given, newest first.
    const view = await sheep(["pasture", "docs"]);
    expect(view.code).toBe(0);
    const rows = rowsOf(view.stdout);
    expect(rows.slice(0, 3)).toEqual(["name: docs", "repo: (none)", "branch: main"]);
    expect(rows[3]).toMatch(/^created: \d{4}-\d{2}-\d{2}T.*Z$/);
    expect(rows.slice(4).map((row) => row.split("\t"))).toEqual([
      [links, "links", "idle", expect.stringMatching(/^\d{4}-.*Z$/), linksTask],
      [typo, "typo", "idle", expect.stringMatching(/^\d{4}-.*Z$/), typoTask],
    ]);
    const ls = await sheep(["ls", "--pasture", "docs"]);
    expect(ls.stdout.replace(/\n$/, "").split("\n").map((row) => row.split("\t")[0])).toEqual([links, typo]);
    const all = await sheep(["ls"]);
    for (const id of [typo, links]) expect(all.stdout).toMatch(new RegExp(`^${id}\t.*\tdocs$`, "m"));
    const json = JSON.parse((await sheep(["ls", "--json"])).stdout) as Array<{ id: string; task: string | null; pasture: string | null }>;
    expect(json.find((row) => row.id === typo)).toMatchObject({ pasture: "docs", task: typoTask });

    // Step 7: typo runs `pasture` and answers from its output. The dog runs `sheep pasture docs` while typo is still in its
    // turn, so the two views are of the same moment: the same rows in the same order, the program's mark on typo's line
    // the one difference.
    await script(`/s/${typo}/faux`, { steps: [{ tool: { name: "bash", args: { command: "pasture" } } }, { text: "links is here too, fixing the dead links in docs/.", delayMs: 15_000 }] });
    const asked = await sheep(["attach", typo, "--detach", "--", "Who else is in this pasture, and what are they doing?"]);
    expect(asked.code).toBe(0);
    const [fromSheep] = await untilToolResults(typo, 1);
    expect(fromSheep).toBeDefined();
    const fromDog = await sheep(["pasture", "docs"]);
    expect(fromDog.code).toBe(0);
    expect(fromSheep).toContain(`\n*${typo}\t`);
    expect(fromDog.stdout).not.toContain("*");
    expect(fromSheep!.replace(`\n*${typo}\t`, `\n${typo}\t`)).toBe(fromDog.stdout);
    expect(rowsOf(fromDog.stdout).slice(4).map((row) => row.split("\t"))).toEqual([
      [links, "links", "idle", expect.stringMatching(/^\d{4}-.*Z$/), linksTask],
      [typo, "typo", "running", expect.stringMatching(/^\d{4}-.*Z$/), typoTask],
    ]);
    // The tool result names the other sheep and its task, which neither sheep wrote anywhere.
    expect(fromSheep).toContain(`${links}\tlinks\tidle\t`);
    expect(fromSheep).toContain(linksTask);
    expect((await sheep(["abort", typo])).code).toBe(0);
    expect((await sheep(["wait", "--timeout", "30", typo])).code).toBe(0);
    // The second prompt did not change the task.
    expect(rowsOf((await sheep(["pasture", "docs"])).stdout).at(-1)!.split("\t")[4]).toBe(typoTask);

    // Journey 2 step 1: links writes a note in /workspace and puts it, and puts another from stdin; the dog reads each at once.
    const note = "# Fixtures\n\nThe fixtures read the clock: freeze it before asserting on dates.\n";
    await script(`/s/${links}/faux`, {
      steps: [
        { tool: { name: "write", args: { path: "/workspace/fixtures.md", content: note } } },
        { tool: { name: "bash", args: { command: "pasture put notes/fixtures.md fixtures.md" } } },
        { tool: { name: "bash", args: { command: "printf 'from stdin\\n' | pasture put notes/stdin.md" } } },
        { text: "Written to /pasture/notes/fixtures.md." },
      ],
    });
    const told = await sheep(["attach", links, "--", "Write what you learned about the test fixtures to the pasture, under notes/fixtures.md."]);
    expect(told.code).toBe(0);
    expect(told.stdout).toBe("Written to /pasture/notes/fixtures.md.\n");
    const cat = await sheep(["pasture", "cat", "docs", "notes/fixtures.md"]);
    expect(cat.code).toBe(0);
    expect(cat.stdout).toBe(note);
    expect((await sheep(["pasture", "cat", "docs", "notes/stdin.md"])).stdout).toBe("from stdin\n");
    expect((await sheep(["pasture", "ls", "docs", "notes"])).stdout).toBe("notes/fixtures.md\nnotes/stdin.md\n");
    const results = await toolResults(links);
    expect(results.at(-2)).toBe(`/pasture/notes/fixtures.md\t${Buffer.byteLength(note)}\n`);
    expect(results.at(-1)).toBe("/pasture/notes/stdin.md\t11\n");
    // The same file, read back from the sheep's side and the dog's side, is the same bytes.
    expect((await sheep(["pasture", "cat", "docs", "notes/fixtures.md", "--json"])).stdout).toBe(note);

    // Journey 2 step 5, from the sheep's side: `pasture rm`, and the dog's next `ls` no longer has it.
    await script(`/s/${links}/faux`, { steps: [{ tool: { name: "bash", args: { command: "pasture rm notes/stdin.md && ls /pasture/notes" } } }, { text: "removed" }] });
    expect((await sheep(["attach", links, "--", "Remove notes/stdin.md from the pasture."])).stdout).toBe("removed\n");
    expect((await toolResults(links)).at(-1)).toBe("fixtures.md\n");
    expect((await sheep(["pasture", "ls", "docs", "notes"])).stdout).toBe("notes/fixtures.md\n");
    const gone = await sheep(["pasture", "cat", "docs", "notes/stdin.md"]);
    expect(gone.code).toBe(2);
    expect(gone.stderr).toBe("sheep: no notes/stdin.md in pasture docs\n");

    // Journey 4 step 2: a pastureless sheep's `pasture` is the not-found line, annotated as before; a herd of one prints one row.
    const lamb = (await sheep(["new", "--name", "lamb", "--detach"])).stdout.trim();
    await script(`/s/${lamb}/faux`, { steps: [{ tool: { name: "bash", args: { command: "pasture" } } }, { text: "no such program" }] });
    expect((await sheep(["attach", lamb, "--", "run pasture"])).stdout).toBe("no such program\n");
    expect((await toolResults(lamb)).at(-1)).toMatch(/^bash: pasture: command not found \(this shell runs inside the session; no interpreters or package managers are installed\)\n/);
    expect((await sheep(["pasture", "new", "solo"])).code).toBe(0);
    const solo = (await sheep(["new", "--pasture", "solo", "--name", "one", "--detach", "--", "What does the brief say?"])).stdout.trim();
    await sheep(["wait", "--timeout", "30", solo]);
    await script(`/s/${solo}/faux`, { steps: [{ tool: { name: "bash", args: { command: "pasture" } } }, { text: "just me" }] });
    expect((await sheep(["attach", solo, "--", "who is here?"])).stdout).toBe("just me\n");
    const one = rowsOf((await toolResults(solo)).at(-1)!);
    expect(one.slice(0, 3)).toEqual(["name: solo", "repo: (none)", "branch: main"]);
    expect(one.slice(4)).toEqual([expect.stringMatching(new RegExp(`^\\*${solo}\tone\trunning\t\\d{4}-.*Z\tWhat does the brief say\\?$`))]);
  });
});
