/**
 * pasture phase 1: the mount, and the prompt, in workerd, with the object
 * and a cell in the same test. A file put through the object is read by
 * `read`, by `cat`, and by `find` with no restart; changed, and read as
 * changed on the next call; removed, and gone. `write`, `edit`, `sed -i`,
 * and a redirect are refused with `EROFS` and the sentence, held here as a
 * literal. The prompt carries the pasture paragraph, the brief, a skill at
 * its `/pasture` path, and the fault line for a `SKILL.md` with no name,
 * and re-reads the brief at the next call. A pastureless cell's prompt is
 * the literal the cell built at commit 1b4a42d, and its `CellFs` has no
 * second backing.
 */
import { BACKGROUND_CONTEXT, createBashTool, createEditTool, createReadTool, createWriteTool, getOrThrow } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import type { SessionSummary } from "../src/directory.ts";
import type { CellExecutionEnv } from "../src/env/execution-env.ts";
import { shellNotice } from "../src/env/programs.ts";
import { setFauxScript } from "../src/models.ts";
import { parseSkill, pastureParagraph, skillFault, systemPrompt } from "../src/prompt.ts";
// pi's own formatter, from the leaf pasture phase 4's fork commit made of it, which is the module the cell imports.
import { formatSkillsForPrompt } from "../../../vendor/pi/packages/coding-agent/dist/core/skills-prompt.js";
import { PASTURE_READ_ONLY, PASTURE_ROOT } from "../src/workspace/mount.ts";

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
const tools = { read: createReadTool(), write: createWriteTool(), edit: createEditTool(), bash: createBashTool() };
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function home(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function pasture(name: string, meta: { repo?: string; branch?: string } = {}): Promise<void> {
  expect((await home("/pastures", { method: "POST", body: JSON.stringify({ name, ...meta }) })).status).toBe(201);
}

async function born(name: string, pastureName?: string): Promise<SessionSummary> {
  const response = await home("/sessions", { method: "POST", body: JSON.stringify({ name, pasture: pastureName }) });
  expect(response.status).toBe(201);
  return (await response.json()) as SessionSummary;
}

/** Runs `body` inside the session's cell, over the env its runtime built at boot. */
function inCell<T>(id: string, body: (cell: CellExecutionEnv) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => body((await cell.runtime()).env));
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

async function read(cell: CellExecutionEnv, path: string): Promise<string> {
  return text(await tools.read.execute("r", { path }, noUpdate, { env: cell }, invocation, context));
}

async function bash(cell: CellExecutionEnv, command: string): Promise<string> {
  return text(await tools.bash.execute("b", { command }, noUpdate, { env: cell }, invocation, context));
}

/** One turn with the faux provider, and the system prompt the cell built for its model call. */
async function promptOf(id: string, prompt: string): Promise<string> {
  let captured: string | undefined;
  setFauxScript((conversation) => {
    captured = conversation.systemPrompt;
    return fauxAssistantMessage("ok");
  });
  expect((await home(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: prompt }) })).status).toBe(200);
  const settled = await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => cell.waitForIdle(10_000));
  expect(settled.operation).toBeNull();
  expect(captured).toBeDefined();
  return captured!;
}

/** The design's sentence, as a literal: what `write`, `edit`, `sed -i`, and a redirect all say. */
const SENTENCE = "the pasture is read-only; `pasture put <path>` writes to it";

// The prompt the cell built at commit 1b4a42d, for each shape of home, as literals: a word changed here fails.
const OPENING =
  "You are a coding agent working in a session that lives in a cell, not on a machine.\n" +
  "Working directory: /workspace\n" +
  "Use the read, write, edit, and bash tools to inspect and change files.\n";
const CLOSING = "\nKeep answers short and technical.";
const TOOLS = "The bash tool runs a shell interpreter inside the session with the usual text tools (ls, cat, grep, sed, awk, find, sort, jq, diff, tar) over the workspace at /workspace. ";
const ISOLATE_DESCRIBED =
  "the isolate is fresh for each run: the script reads the workspace with node:fs by paths relative to the workspace root and cannot write to it, so it prints what it computes; its stdout and stderr are the tool result; it has no node_modules and no network, so fetch there fails and says so";
const PROMPT_NO_CONTAINER =
  OPENING +
  TOOLS +
  "There are no interpreters (no python, node) and no package managers (no npm, pip, cargo): this shell runs inside the session; no interpreters or package managers are installed. " +
  "Say so plainly when asked for something the shell cannot do, rather than pretending it ran." +
  CLOSING;
const PROMPT_NO_CONTAINER_WITH_ISOLATE =
  OPENING +
  TOOLS +
  "There are no interpreters (no python, node) and no package managers (no npm, pip, cargo): this shell runs inside the session; no interpreters or package managers are installed, " +
  "except that a line of exactly `node <file> [args…]`, the file a workspace script ending in .mjs, .js, or .cjs runs in a fresh isolate with no network. " +
  `One thing runs outside the shell: a line of exactly \`node <file> [args…]\`, the file a workspace script ending in .mjs, .js, or .cjs; ${ISOLATE_DESCRIBED}. ` +
  "Say so plainly when asked for something the shell cannot do, rather than pretending it ran." +
  CLOSING;
const PROMPT_CONTAINER =
  OPENING +
  TOOLS +
  "A container is rented beside the session for the programs the shell lacks: python, python3, node, npm, pnpm, npx, pip, pip3, git, and anything else in its image. " +
  "A command line runs whole in one place: in the shell when every program in it is a text tool, otherwise in the container over a checkout of the same workspace. " +
  "Output streams back, and the files a command changed sync back to the workspace, except node_modules, build output, and anything in .gitignore, which stay in the container and go when it does. " +
  "There is no cargo in either. Say so plainly when asked for something neither can do, rather than pretending it ran." +
  CLOSING;
const PROMPT_CONTAINER_WITH_ISOLATE =
  OPENING +
  TOOLS +
  "A container is rented beside the session for the programs the shell lacks: python, python3, node, npm, pnpm, npx, pip, pip3, git, and anything else in its image. " +
  "A command line runs whole in one place: in the shell when every program in it is a text tool, otherwise in the container over a checkout of the same workspace. " +
  "Output streams back, and the files a command changed sync back to the workspace, except node_modules, build output, and anything in .gitignore, which stay in the container and go when it does. " +
  `One exception: a line of exactly \`node <file> [args…]\`, the file a workspace script ending in .mjs, .js, or .cjs, runs in a fresh isolate instead of the container while no container is up; ${ISOLATE_DESCRIBED}; while a container is up, or when the line has more in it, node runs in the container. ` +
  "There is no cargo in either. Say so plainly when asked for something neither can do, rather than pretending it ran." +
  CLOSING;

describe("pasture phase 1: the mount", () => {
  it("journey 2 steps 2, 4, 5 as read paths: a file put through the object is read by read, cat, and find, changed, and gone, with no restart", async () => {
    // No repository: this home has no container, and pasture phase 0's directory refuses a birth into a pasture that has one.
    await pasture("docs");
    await env.PASTURE.getByName("docs").put("notes/fixtures.md", encode("# Fixtures\n\nWatch the clock.\n"));
    await env.PASTURE.getByName("docs").put("BRIEF.md", encode("Be brief.\n"));
    const { id } = await born("fixtures", "docs");

    await inCell(id, async (cell) => {
      // The object's stub, made here: workerd lets a Durable Object use only the stubs its own context made.
      const object = env.PASTURE.getByName("docs");
      expect(cell.pasture).toBeDefined();
      // pi's read tool, over the env.
      expect(await read(cell, "/pasture/notes/fixtures.md")).toContain("Watch the clock.");
      expect(getOrThrow(await cell.readTextFile("/pasture/notes/fixtures.md", context))).toBe("# Fixtures\n\nWatch the clock.\n");
      expect(getOrThrow(await cell.readTextLines("/pasture/notes/fixtures.md", { maxLines: 1 }, context))).toEqual(["# Fixtures"]);
      expect(getOrThrow(await cell.fileInfo("/pasture/notes/fixtures.md", context))).toMatchObject({ kind: "file", size: 29, path: "/pasture/notes/fixtures.md" });
      expect(getOrThrow(await cell.fileInfo("/pasture", context))).toMatchObject({ kind: "directory", name: "pasture" });
      expect(getOrThrow(await cell.listDir("/pasture", context)).map((info) => info.name)).toEqual(["BRIEF.md", "notes"]);
      expect(getOrThrow(await cell.listDir("/", context)).map((info) => info.name)).toEqual(["pasture", "tmp", "workspace"]);
      expect(getOrThrow(await cell.exists("/pasture/notes/nothing.md", context))).toBe(false);
      expect(getOrThrow(await cell.canonicalPath("/pasture/notes/../notes/fixtures.md", context))).toBe("/pasture/notes/fixtures.md");
      // The shell: cat, find, ls, grep, cp out of the tree, and a glob after a look.
      expect(await bash(cell, "cat /pasture/notes/fixtures.md")).toBe("# Fixtures\n\nWatch the clock.\n");
      expect((await bash(cell, "find /pasture -type f | sort")).trim()).toBe("/pasture/BRIEF.md\n/pasture/notes/fixtures.md");
      expect((await bash(cell, "ls /")).trim().split("\n")).toEqual(["pasture", "tmp", "workspace"]);
      expect((await bash(cell, "ls -l /pasture/notes")).trim().split("\n").at(-1)).toMatch(/^-rw-r--r--.* 29 .*fixtures\.md$/);
      expect((await bash(cell, "grep -rl clock /pasture")).trim()).toBe("/pasture/notes/fixtures.md");
      expect((await bash(cell, "cd /pasture/notes && pwd && cat fixtures.md | head -1")).trim()).toBe("/pasture/notes\n# Fixtures");
      expect((await bash(cell, "cp /pasture/notes/fixtures.md /workspace/copy.md && cat copy.md | wc -l")).trim()).toBe("3");
      expect((await bash(cell, "ls /pasture > /tmp/seen; echo /pasture/**/*.md")).trim()).toBe("/pasture/notes/fixtures.md");

      // Changed through the object: the next call, in the same runtime, reads it as changed.
      await object.put("notes/fixtures.md", encode("# Fixtures\n\nWatch the calendar.\n"));
      expect(await read(cell, "/pasture/notes/fixtures.md")).toContain("Watch the calendar.");
      expect(await bash(cell, "cat /pasture/notes/fixtures.md")).toBe("# Fixtures\n\nWatch the calendar.\n");

      // Removed: gone from ls, read, and find on the next command.
      expect(await object.rm("notes/fixtures.md")).toBe(true);
      expect((await bash(cell, "ls /pasture/notes")).trim()).toBe("(no output)");
      await expect(read(cell, "/pasture/notes/fixtures.md")).rejects.toThrow(/ENOENT|not found|no such file/i);
      expect((await bash(cell, "find /pasture -type f")).trim()).toBe("/pasture/BRIEF.md");
      expect(getOrThrow(await cell.exists("/pasture/notes/fixtures.md", context))).toBe(false);
    });
  });

  it("journey 2 step 3: write, edit, sed -i, and a redirect are refused with EROFS and the sentence, and the tree is unchanged", async () => {
    expect(PASTURE_READ_ONLY).toBe(SENTENCE);
    await pasture("ro");
    const object = env.PASTURE.getByName("ro");
    await object.put("notes/a.md", encode("alpha\n"));
    const before = await object.manifest();
    const { id } = await born("editor", "ro");

    await inCell(id, async (cell) => {
      // The three tools.
      await expect(tools.write.execute("w", { path: "/pasture/notes/a.md", content: "beta\n" }, noUpdate, { env: cell }, invocation, context)).rejects.toThrow(SENTENCE);
      await expect(tools.write.execute("w", { path: "/pasture/new.md", content: "new\n" }, noUpdate, { env: cell }, invocation, context)).rejects.toThrow(SENTENCE);
      await expect(
        tools.edit.execute("e", { path: "/pasture/notes/a.md", edits: [{ oldText: "alpha", newText: "beta" }] }, noUpdate, { env: cell }, invocation, context),
      ).rejects.toThrow(SENTENCE);
      await expect(bash(cell, "sed -i s/alpha/beta/ /pasture/notes/a.md")).rejects.toThrow(SENTENCE);
      // Every tier-0 way of writing: a redirect, an append, mkdir, rm, mv, cp into, touch, chmod, ln. Each fails, and
      // says the sentence; `rm -f`, which just-bash lets fail silently, says it in the output the mount adds.
      for (const command of [
        "echo x > /pasture/x",
        "echo x >> /pasture/notes/a.md",
        "cd /pasture && echo z > z",
        "mkdir /pasture/dir",
        "rm /pasture/notes/a.md",
        "mv /pasture/notes/a.md /workspace/a.md",
        "mv /pasture/notes/a.md /pasture/b.md",
        "echo y > /workspace/y && cp /workspace/y /pasture/y",
        "touch /pasture/notes/a.md",
        "chmod 600 /pasture/notes/a.md",
        "ln -s /workspace/y /pasture/link",
        "ln /workspace/y /pasture/hard",
      ]) {
        await expect(bash(cell, command), command).rejects.toThrow(SENTENCE);
      }
      expect(await bash(cell, "rm -rf /pasture/notes")).toContain(SENTENCE);
      // Reading out of the tree into the workspace is not a write to it.
      expect((await bash(cell, "cp -r /pasture /workspace/copy && cat /workspace/copy/notes/a.md")).trim()).toBe("alpha");
      // The env's own writing methods, as pi's tools reach them: thrown, with the code and the sentence.
      for (const attempt of [
        () => cell.writeFile("/pasture/notes/a.md", "beta\n", context),
        () => cell.appendFile("/pasture/notes/a.md", "beta\n", context),
        () => cell.renameFile("/pasture/notes/a.md", "/workspace/a.md", context),
        () => cell.renameFile("/workspace/y", "/pasture/y", context),
        () => cell.createDir("/pasture/dir", { recursive: true }, context),
        () => cell.remove("/pasture/notes/a.md", { recursive: true }, context),
      ]) {
        await expect(attempt()).rejects.toMatchObject({ code: "EROFS", message: expect.stringContaining(SENTENCE) });
      }
      // The tree is unchanged, and still readable.
      expect(await bash(cell, "cat /pasture/notes/a.md")).toBe("alpha\n");
    });
    expect(await object.manifest()).toEqual(before);
  });

  it("the prompt: the paragraph, the brief, a skill at its /pasture path, the fault line for a nameless SKILL.md, and the brief re-read at the next call", async () => {
    await pasture("skilled");
    const object = env.PASTURE.getByName("skilled");
    await object.put("BRIEF.md", encode("# The brief\n\nRun the fixtures before anything else.\n"));
    await object.put("skills/review/SKILL.md", encode("---\nname: review\ndescription: How to review a change in this repository.\n---\n\n# Review\n\nRead the diff twice.\n"));
    await object.put("skills/nameless/SKILL.md", encode("---\ndescription: A skill with no name.\n---\n\nNothing.\n"));
    await object.put("skills/loud/SKILL.md", encode("---\nname: Loud Name\ndescription: A name pi's rules refuse.\n---\n"));
    await object.put("skills/mute/SKILL.md", encode("---\nname: mute\n---\n\nNo description.\n"));
    await object.put("skills/broken/SKILL.md", encode("---\nname: [\n---\n"));
    await object.put("skills/hidden/SKILL.md", encode("---\nname: hidden\ndescription: Not for the model.\ndisable-model-invocation: true\n---\n"));
    await object.put("skills/notes.md", encode("not a skill: not at skills/<name>/SKILL.md\n"));
    const { id } = await born("reader", "skilled");

    const prompt = await promptOf(id, "what do you know?");
    // The cell's own lines first, as they are for a pastureless sheep on this home, which has the loader.
    expect(prompt.startsWith(`${PROMPT_NO_CONTAINER_WITH_ISOLATE}\n`)).toBe(true);
    const paragraph = pastureParagraph("skilled", null, "main");
    expect(paragraph).toContain("`pasture`");
    expect(paragraph).toContain("`pasture put <path> [file]`");
    expect(paragraph).toContain("`pasture rm <path>`");
    expect(paragraph).toContain("/pasture");
    expect(paragraph).toContain("read-only");
    expect(paragraph).toContain("which has no repository");
    // With a repository (a pasture this home cannot birth into, but a pen home can): the URL and the branch are named.
    expect(pastureParagraph("src", "https://github.com/example/src.git", "trunk")).toContain("whose repository is https://github.com/example/src.git on branch trunk");
    expect(prompt).toContain(`\n${paragraph}\n\n# The brief\n\nRun the fixtures before anything else.\n`);
    // pi's own skills block, with the /pasture path, as pi's read tool will be told to read it.
    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("  <skill>\n    <name>review</name>\n    <description>How to review a change in this repository.</description>\n    <location>/pasture/skills/review/SKILL.md</location>\n  </skill>");
    expect(prompt).not.toContain("hidden");
    // The faults: one line each, naming the file and the fault.
    expect(prompt).toContain(skillFault("/pasture/skills/nameless/SKILL.md", "its frontmatter has no name"));
    expect(prompt).toContain("The skill at /pasture/skills/nameless/SKILL.md is not listed: its frontmatter has no name.");
    expect(prompt).toContain("The skill at /pasture/skills/loud/SKILL.md is not listed: name contains invalid characters (must be lowercase a-z, 0-9, hyphens only).");
    expect(prompt).toContain("The skill at /pasture/skills/mute/SKILL.md is not listed: its frontmatter has no description.");
    expect(prompt).toMatch(/The skill at \/pasture\/skills\/broken\/SKILL\.md is not listed: its frontmatter does not parse \(.+\)\./);
    expect(prompt).not.toContain("notes.md");
    // The block is pi's `formatSkillsForPrompt`, whole, for a sample with every character it escapes and one it hides: the
    // prompt built for a pasture holding the sample contains pi's own output for it, byte for byte.
    const sample = [
      "---\nname: review\ndescription: How to review a change in this repository.\n---\n",
      "---\nname: odd-chars\ndescription: '\"Quotes\", <tags>, & ''apostrophes'''\n---\n",
      "---\nname: hidden\ndescription: Not for the model.\ndisable-model-invocation: true\n---\n",
    ];
    const skills = sample.map((text, index) => {
      const parsed = parseSkill(text, `/pasture/skills/s${index}/SKILL.md`);
      if (!("skill" in parsed)) throw new Error(parsed.fault);
      return parsed.skill;
    });
    await pasture("sampled");
    for (const [index, text] of sample.entries()) await env.PASTURE.getByName("sampled").put(`skills/s${index}/SKILL.md`, encode(text));
    const sampled = await promptOf((await born("sampler", "sampled")).id, "what skills?");
    const block = formatSkillsForPrompt(skills, "read");
    expect(block).toContain("&quot;Quotes&quot;, &lt;tags&gt;, &amp; &apos;apostrophes&apos;");
    expect(block).not.toContain("hidden");
    expect(sampled).toBe(`${PROMPT_NO_CONTAINER_WITH_ISOLATE}\n${pastureParagraph("sampled", null, "main")}${block}`);

    // Journey 2 step 4: the brief changes while the sheep lives; its next turn has the new one.
    await object.put("BRIEF.md", encode("# The brief, second edition\n\nRun nothing.\n"));
    const next = await promptOf(id, "and now?");
    expect(next).toContain("\n\n# The brief, second edition\n\nRun nothing.\n");
    expect(next).not.toContain("Run the fixtures");
    // A pasture with no brief and no skills: the paragraph, and nothing after it.
    await pasture("bare");
    const bare = await promptOf((await born("bare-reader", "bare")).id, "hello");
    expect(bare).toBe(`${PROMPT_NO_CONTAINER_WITH_ISOLATE}\n${pastureParagraph("bare", null, "main")}`);
  });

  it("journey 4 steps 1 and 2 criteria: a pastureless sheep's prompt is the literal, its CellFs has no second backing, and its shell has no /pasture", async () => {
    expect(systemPrompt({ container: false })).toBe(PROMPT_NO_CONTAINER);
    expect(systemPrompt({ container: false, isolate: true, containerUp: false })).toBe(PROMPT_NO_CONTAINER_WITH_ISOLATE);
    expect(systemPrompt({ container: true, isolate: false, containerUp: false })).toBe(PROMPT_CONTAINER);
    expect(systemPrompt({ container: true, isolate: true, containerUp: false })).toBe(PROMPT_CONTAINER_WITH_ISOLATE);

    const { id, pasture: none } = await born("lamb");
    expect(none).toBeNull();
    // The prompt the cell built for its model call is the literal, whole.
    expect(await promptOf(id, "list the workspace")).toBe(PROMPT_NO_CONTAINER_WITH_ISOLATE);
    await inCell(id, async (cell) => {
      expect(cell.pasture).toBeUndefined();
      expect(cell.fs.pasture).toBeUndefined();
      expect((await bash(cell, "ls /")).trim().split("\n")).toEqual(["tmp", "workspace"]);
      expect(getOrThrow(await cell.listDir("/", context)).map((info) => info.name)).toEqual(["tmp", "workspace"]);
      await expect(bash(cell, "cat /pasture/BRIEF.md")).rejects.toThrow(/No such file or directory/);
      // just-bash's own not-found line, annotated with this home's notice, as before this project.
      await expect(bash(cell, "pasture")).rejects.toThrow(`bash: pasture: command not found (${shellNotice(cell.home)})`);
      const outside = await cell.readTextFile(`${PASTURE_ROOT}/BRIEF.md`, context);
      expect(outside.ok).toBe(false);
      if (!outside.ok) expect(outside.error.code).toBe("permission_denied");
      // A write there is the fence's refusal, as before: returned, not thrown, and not the pasture's sentence.
      const write = await cell.writeFile(`${PASTURE_ROOT}/x`, "x", context);
      expect(write.ok).toBe(false);
      if (!write.ok) expect(write.error.message).not.toContain(SENTENCE);
    });
  });
});
