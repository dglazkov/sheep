/**
 * pasture phase 2: the program, and the herd, in workerd. `pasture` in a
 * pastured cell prints the meta and the directory's rows with this
 * sheep's line marked and the `task` a prompt reported; `pasture put`
 * from stdin, from a workspace file, from a redirect, and from a heredoc
 * lands in the object whole, and a concurrent pair of puts, through two
 * cells' shells and on the object itself, leaves one of the two and never
 * a splice; `pasture rm` removes; a put in one command line is read by the
 * `cat` after it. The `task` column is the first line of the first prompt,
 * trimmed to 120 characters, reported once. A pastureless cell's shell
 * has no `pasture`, held as the annotated not-found line, and the table's
 * paragraph is the literal from before the project.
 */
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import { type SessionSummary, TASK_LENGTH, taskOf } from "../src/directory.ts";
import type { CellExecutionEnv } from "../src/env/execution-env.ts";
import { herdLine, herdView, PASTURE_PROGRAMS, pathArgument, USAGE } from "../src/env/pasture-command.ts";
import { classify, SHELL_SYSTEM_PROMPT_LINE, shellNotice } from "../src/env/programs.ts";
import { setFauxScript } from "../src/models.ts";
import { pastureParagraph } from "../src/prompt.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const context = BACKGROUND_CONTEXT;
const noUpdate = () => {};
const invocation = {
  invocationId: "inv",
  operationId: "op",
  turnId: "turn",
  async getMemo() {
    return undefined;
  },
  async setMemo() {},
};
const bashTool = createBashTool();
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array | undefined): string | undefined => (bytes === undefined ? undefined : new TextDecoder().decode(bytes));

function home(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function pasture(name: string): Promise<void> {
  expect((await home("/pastures", { method: "POST", body: JSON.stringify({ name }) })).status).toBe(201);
}

async function born(name: string, pastureName?: string): Promise<SessionSummary> {
  const response = await home("/sessions", { method: "POST", body: JSON.stringify({ name, pasture: pastureName }) });
  expect(response.status).toBe(201);
  return (await response.json()) as SessionSummary;
}

function inCell<T>(id: string, body: (cell: CellExecutionEnv) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => body((await cell.runtime()).env));
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/** pi's bash tool over the cell's env; the output, or the tool's error with the output in it. */
async function bash(cell: CellExecutionEnv, command: string): Promise<string> {
  return text(await bashTool.execute("b", { command }, noUpdate, { env: cell }, invocation, context));
}

/** A whole shell run through pi's bash tool: the output and the exit code, which the tool throws on a nonzero exit and prints as `(no output)` when there is none. */
async function run(cell: CellExecutionEnv, command: string): Promise<{ out: string; exitCode: number }> {
  // The tool renders no output as `(no output)` and trims the trailing newline before its exit line; both are taken off here.
  const plain = (out: string): string => (out === "(no output)" ? "" : out).replace(/\n$/, "");
  try {
    return { out: plain(await bash(cell, command)), exitCode: 0 };
  } catch (error) {
    const match = /^([\s\S]*?)\n\n\nCommand exited with code (\d+)$/.exec(error instanceof Error ? error.message : String(error));
    if (match === null) throw error;
    return { out: plain(match[1]!), exitCode: Number(match[2]) };
  }
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  return a !== undefined && a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** One HTTP prompt, driven to idle; the faux script decides the turn. */
async function prompt(id: string, message: string): Promise<void> {
  expect((await home(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: message }) })).status).toBe(200);
  const settled = await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => cell.waitForIdle(20_000));
  expect(settled.operation).toBeNull();
}

/** A faux turn that runs the prompt's text as a bash command, then says "ok": two sheep can be driven at once this way. */
function runPromptsAsCommands(): void {
  setFauxScript((conversation) => {
    const last = conversation.messages.at(-1);
    if (last?.role !== "user") return fauxAssistantMessage("ok");
    const command = typeof last.content === "string" ? last.content : last.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
    return fauxAssistantMessage([fauxToolCall("bash", { command })], { stopReason: "toolUse" });
  });
}

async function directoryRow(id: string): Promise<SessionSummary | undefined> {
  return env.DIRECTORY.getByName("home").get(id);
}

describe("pasture phase 2: the program, and the herd", () => {
  it("journey 1 steps 6 and 7 and journey 4 step 2: `pasture` prints the meta and the herd from the directory, this sheep's line marked, with the task each was asked", async () => {
    setFauxScript(() => fauxAssistantMessage("ok"));
    await pasture("docs");
    await env.PASTURE.getByName("docs").put("BRIEF.md", encode("Be brief.\n"));
    const typo = await born("typo", "docs");
    // A herd of one, before any prompt: the row with no task.
    await inCell(typo.id, async (cell) => {
      const view = await bash(cell, "pasture");
      expect(view).toMatch(/^name: docs\nrepo: \(none\)\nbranch: main\ncreated: \d{4}-\d{2}-\d{2}T.*Z\n/);
      expect(view.replace(/\n$/, "").split("\n").slice(4)).toEqual([`*${typo.id}\ttypo\tidle\t${new Date(typo.createdAt).toISOString()}\t`]);
    });
    // Journey 1 step 4's births, each with a task: the first line of the first prompt, as the cell reports it.
    await prompt(typo.id, "Fix the typo in README.md on a branch, commit, push.\nThe second line is not the task.");
    const links = await born("links", "docs");
    await prompt(links.id, "  Fix the links in docs/, on a branch; commit and push.  ");
    expect((await directoryRow(typo.id))?.task).toBe("Fix the typo in README.md on a branch, commit, push.");
    expect((await directoryRow(links.id))?.task).toBe("Fix the links in docs/, on a branch; commit and push.");
    // A later prompt does not change it.
    await prompt(typo.id, "Who else is in this pasture, and what are they doing?");
    expect((await directoryRow(typo.id))?.task).toBe("Fix the typo in README.md on a branch, commit, push.");

    // Step 7: either sheep runs `pasture` and has the other's task, without either having written anything about the other.
    const herd = await env.DIRECTORY.getByName("home").herd("docs");
    expect(herd.map((session) => session.id)).toEqual([links.id, typo.id]);
    const meta = await env.PASTURE.getByName("docs").meta();
    await inCell(typo.id, async (cell) => {
      const view = await bash(cell, "pasture");
      const rows = view.replace(/\n$/, "").split("\n");
      expect(rows.slice(0, 4)).toEqual(["name: docs", "repo: (none)", "branch: main", `created: ${new Date(meta!.createdAt).toISOString()}`]);
      // The directory's rows in the directory's order, in the one format; this sheep's marked.
      expect(rows.slice(4)).toEqual([herdLine(herd[0]!), `*${herdLine(herd[1]!)}`]);
      expect(rows[4]).toBe(`${links.id}\tlinks\tidle\t${new Date(links.createdAt).toISOString()}\tFix the links in docs/, on a branch; commit and push.`);
      expect(rows[5]).toBe(`*${typo.id}\ttypo\tidle\t${new Date(typo.createdAt).toISOString()}\tFix the typo in README.md on a branch, commit, push.`);
      expect(view).toBe(herdView("docs", meta, herd, typo.id));
      // `herd` is the same view; the shell's own tools take the output on.
      expect(await bash(cell, "pasture herd")).toBe(view);
      expect((await bash(cell, "pasture | grep -c links")).trim()).toBe("1");
      expect((await bash(cell, "pasture | tail -n +5 | cut -f2 | sort")).trim()).toBe("links\ntypo");
    });
    await inCell(links.id, async (cell) => {
      const rows = (await bash(cell, "pasture")).replace(/\n$/, "").split("\n").slice(4);
      expect(rows).toEqual([`*${herdLine(herd[0]!)}`, herdLine(herd[1]!)]);
    });
    // A pastured sheep's prompt names the three verbs in one sentence; a pastureless one's shell line is the literal from before the project.
    const paragraph = pastureParagraph("docs", null, "main");
    const sentence = paragraph.split(". ").find((candidate) => candidate.includes("three verbs"));
    expect(sentence).toBeDefined();
    for (const verb of ["`pasture`", "`pasture put <path> [file]`", "`pasture rm <path>`"]) expect(sentence).toContain(verb);
    expect(SHELL_SYSTEM_PROMPT_LINE).toBe(
      "The bash tool runs a shell interpreter inside the session with the usual text tools (ls, cat, grep, sed, awk, find, sort, jq, diff, tar) over the workspace at /workspace. " +
        "There are no interpreters (no python, node) and no package managers (no npm, pip, cargo): this shell runs inside the session; no interpreters or package managers are installed. " +
        "Say so plainly when asked for something the shell cannot do, rather than pretending it ran.",
    );
    expect(SHELL_SYSTEM_PROMPT_LINE).not.toContain("pasture");
  });

  it("the task column: the first line that says anything, trimmed to 120 characters, once", async () => {
    expect(TASK_LENGTH).toBe(120);
    expect(taskOf("Fix the typo.\nMore.")).toBe("Fix the typo.");
    expect(taskOf("\n\n   Fix the typo.   \n")).toBe("Fix the typo.");
    expect(taskOf("a".repeat(200))).toBe("a".repeat(120));
    expect(taskOf(`${"word ".repeat(30)}end`).length).toBeLessThanOrEqual(120);
    expect(taskOf("")).toBe("");
    // Through the cell: a long prompt, reported trimmed, and a pastureless sheep reports too, since the column is every sheep's.
    setFauxScript(() => fauxAssistantMessage("ok"));
    const lamb = await born("lamb");
    const long = `${"x".repeat(150)}\nsecond`;
    await prompt(lamb.id, long);
    expect((await directoryRow(lamb.id))?.task).toBe("x".repeat(120));
    // Only the first, in the directory too: a second report is nothing.
    await env.DIRECTORY.getByName("home").setTask(lamb.id, "something else");
    expect((await directoryRow(lamb.id))?.task).toBe("x".repeat(120));
  });

  it("journey 2 step 1 and its third criterion: put from stdin, a file, a redirect, and a heredoc lands whole, rm removes, and a concurrent pair leaves one of the two", async () => {
    await pasture("notes");
    const writer = await born("writer", "notes");
    await inCell(writer.id, async (cell) => {
      // The object's stub, made here: workerd lets a Durable Object use only the stubs its own context made.
      const object = env.PASTURE.getByName("notes");
      // From stdin, bytes intact: a multibyte character arrives as its UTF-8, not as latin1.
      expect(await run(cell, "printf '# Fixtures\\n\\nWatch the clock, café.\\n' | pasture put notes/fixtures.md")).toEqual({ out: "/pasture/notes/fixtures.md\t36", exitCode: 0 });
      expect(decode(await object.read("notes/fixtures.md"))).toBe("# Fixtures\n\nWatch the clock, café.\n");
      expect(await object.read("notes/fixtures.md")).toEqual(encode("# Fixtures\n\nWatch the clock, café.\n"));
      // From a file the sheep wrote in /workspace, by a relative path from the cwd and by an absolute one.
      expect((await run(cell, "printf 'from a file\\n' > fixtures.md && pasture put notes/from-file.md fixtures.md")).exitCode).toBe(0);
      expect(decode(await object.read("notes/from-file.md"))).toBe("from a file\n");
      expect((await run(cell, "mkdir -p sub && cd sub && printf 'nested\\n' > n.md && pasture put notes/nested.md n.md")).exitCode).toBe(0);
      expect(decode(await object.read("notes/nested.md"))).toBe("nested\n");
      expect((await run(cell, "pasture put notes/absolute.md /workspace/fixtures.md")).exitCode).toBe(0);
      expect(decode(await object.read("notes/absolute.md"))).toBe("from a file\n");
      // From a redirect and a heredoc.
      expect((await run(cell, "pasture put notes/redirect.md < /workspace/fixtures.md")).exitCode).toBe(0);
      expect(decode(await object.read("notes/redirect.md"))).toBe("from a file\n");
      expect((await run(cell, "pasture put notes/heredoc.md <<'EOF'\nline one\nline two\nEOF")).exitCode).toBe(0);
      expect(decode(await object.read("notes/heredoc.md"))).toBe("line one\nline two\n");
      // A leading /pasture/ is the same path; a path that would leave the tree is refused, and nothing is written.
      expect((await run(cell, "echo abs | pasture put /pasture/notes/abs.md")).exitCode).toBe(0);
      expect(decode(await object.read("notes/abs.md"))).toBe("abs\n");
      const before = await object.manifest();
      expect(await run(cell, "echo x | pasture put ../escape.md")).toEqual({ out: "pasture put: ../escape.md is outside the pasture's tree", exitCode: 2 });
      expect(await run(cell, "echo x | pasture put /workspace/x")).toEqual({ out: "pasture put: /workspace/x is outside the pasture's tree", exitCode: 2 });
      expect(await object.manifest()).toEqual(before);
      expect(pathArgument("/pasture/a/b")).toBe("a/b");
      expect(pathArgument("a/./b")).toBe("a/b");
      expect(pathArgument("../a")).toBeUndefined();
      expect(pathArgument("/workspace/a")).toBeUndefined();
      // A file that is not there, and the usage line for anything else.
      const missing = await run(cell, "pasture put notes/none.md nothing.md");
      expect(missing.exitCode).toBe(1);
      expect(missing.out).toMatch(/^pasture put: nothing\.md: ENOENT/);
      for (const line of ["pasture put", "pasture put a b c", "pasture rm", "pasture rm a b", "pasture frobnicate", "pasture herd extra"]) {
        expect(await run(cell, line), line).toEqual({ out: USAGE, exitCode: 2 });
      }
      // Whole, last write wins: the same path put twice reads as the second, and the object has one row for it.
      await run(cell, "printf 'first\\n' | pasture put same.md && printf 'second\\n' | pasture put same.md");
      expect(decode(await object.read("same.md"))).toBe("second\n");
      // A put in one command line is read by the cat after it, and listed by the ls after it, in the same call.
      expect((await run(cell, "printf 'now\\n' | pasture put notes/now.md && cat /pasture/notes/now.md && ls /pasture/notes | grep -c now")).out).toBe("/pasture/notes/now.md\t4\nnow\n1");
      // The mount's next call reads what was put, as journey 2 step 1 wants within a second; pi's read tool too.
      expect(await bash(cell, "cat /pasture/notes/fixtures.md")).toBe("# Fixtures\n\nWatch the clock, café.\n");
      // Journey 2 step 5 from the sheep's side: rm removes, and a second rm says there is nothing there.
      expect(await run(cell, "pasture rm notes/heredoc.md")).toEqual({ out: "", exitCode: 0 });
      expect(await object.read("notes/heredoc.md")).toBeUndefined();
      expect((await run(cell, "ls /pasture/notes")).out).not.toContain("heredoc");
      expect(await run(cell, "pasture rm notes/heredoc.md")).toEqual({ out: "pasture rm: no notes/heredoc.md in pasture notes", exitCode: 1 });
      expect(await run(cell, "pasture rm ../x")).toEqual({ out: "pasture rm: ../x is outside the pasture's tree", exitCode: 2 });
      expect((await run(cell, "pasture rm notes && ls /pasture")).out).not.toContain("notes");
      // The program has no cat and no ls: the shell has them.
      expect(await run(cell, "pasture cat same.md")).toEqual({ out: USAGE, exitCode: 2 });
      // The output is the program's own, so a redirect of it works as for any command, and the exit code is the program's.
      expect((await run(cell, "pasture put x.md nothing.md 2>/tmp/err; echo $?; cat /tmp/err")).out).toMatch(/^1\npasture put: nothing\.md: ENOENT/);
    });

    // A concurrent pair, through two cells' shells at once: the object has one of the two, whole, never a splice.
    const object = env.PASTURE.getByName("notes");
    runPromptsAsCommands();
    const [a, b] = await Promise.all([born("a", "notes"), born("b", "notes")]);
    const lineA = "A".repeat(40);
    const lineB = "B".repeat(40);
    const putA = `seq 1 4000 | sed 's/.*/${lineA}/' | pasture put race.md`;
    const putB = `seq 1 4000 | sed 's/.*/${lineB}/' | pasture put race.md`;
    await Promise.all([prompt(a.id, putA), prompt(b.id, putB)]);
    const raced = decode(await object.read("race.md"))!;
    expect(raced.length).toBe(4000 * 41);
    const distinct = new Set(raced.replace(/\n/g, ""));
    expect(distinct.size).toBe(1);
    expect(raced).toBe(`${[...distinct][0] === "A" ? lineA : lineB}\n`.repeat(4000));
    // Both puts landed and said so; the transcripts have the result of each.
    for (const id of [a.id, b.id]) {
      const view = await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => cell.transcript());
      const results = view.entries.filter((entry) => entry.type === "message" && entry.message.role === "toolResult");
      expect(results).toHaveLength(1);
      expect(text((results[0] as { message: { content: Array<{ type: string; text?: string }> } }).message)).toBe("/pasture/race.md\t164000\n");
    }
    // And on the object itself, from one context: a pair in flight together leaves one of the two.
    const contentA = encode(`${lineA}\n`.repeat(2000));
    const contentB = encode(`${lineB}\n`.repeat(2000));
    for (let round = 0; round < 5; round++) {
      await Promise.all([object.put("pair.md", contentA), object.put("pair.md", contentB)]);
      const read = await object.read("pair.md");
      expect(sameBytes(read, contentA) || sameBytes(read, contentB)).toBe(true);
    }
    setFauxScript(() => fauxAssistantMessage("ok"));
  });

  it("journey 4 step 1: a pastureless cell's shell has no pasture command, and the router counts the program as tier 0 only for a pastured cell", async () => {
    setFauxScript(() => fauxAssistantMessage("ok"));
    const lamb = await born("lamb-2");
    await inCell(lamb.id, async (cell) => {
      expect(cell.pastureProgram).toBeUndefined();
      await expect(bash(cell, "pasture")).rejects.toThrow(`bash: pasture: command not found (${shellNotice(cell.home)})`);
      await expect(bash(cell, "echo x | pasture put notes/x.md")).rejects.toThrow("bash: pasture: command not found");
      // just-bash's own `help` does not list it either: the registry is the registry.
      expect(await bash(cell, "help | grep -c '^pasture' || true")).toMatch(/^0\n?$/);
    });
    // The table has no row for it: in a pastured cell it is tier 0 because just-bash has it, and on a home with a container a
    // `pasture put` line stays in the shell; the same line in a pastureless cell is what it was, and a line that also names
    // a container program runs whole in the container.
    const container = { container: true };
    expect(classify("pasture put notes/x.md", container, undefined, PASTURE_PROGRAMS)).toEqual({ tier: 0, programs: ["pasture"] });
    expect(classify("echo x | pasture put notes/x.md", container, undefined, PASTURE_PROGRAMS)).toEqual({ tier: 0, programs: ["echo", "pasture"] });
    expect(classify("pasture put notes/x.md", container)).toEqual({ tier: 2, programs: ["pasture"] });
    expect(classify("git log | pasture put notes/log.md", container, undefined, PASTURE_PROGRAMS)).toEqual({ tier: 2, programs: ["git", "pasture"] });
    expect(classify("pasture", { container: false }, undefined, PASTURE_PROGRAMS)).toEqual({ tier: 0, programs: ["pasture"] });
    expect(classify("pasture", { container: false })).toMatchObject({ refused: "pasture" });
  });
});
