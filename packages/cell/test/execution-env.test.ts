import {
  BACKGROUND_CONTEXT,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  getOrThrow,
  withAbortSignal,
} from "@earendil-works/pi-agent-core";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CellExecutionEnv, MAX_FILE_BYTES } from "../src/env/execution-env.ts";
import { annotateCommandNotFound, NO_CONTAINER, SHELL_NOTICE, SHELL_SYSTEM_PROMPT_LINE, shellNotice, shellSystemPromptLine } from "../src/env/programs.ts";

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

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/** Runs `body` inside a fresh cell with an env over its storage. */
function inCell<T>(name: string, body: (cell: CellExecutionEnv) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`env:${name}`), (_instance, state) =>
    body(new CellExecutionEnv(state.storage.sql)),
  );
}

const tools = {
  read: createReadTool(),
  write: createWriteTool(),
  edit: createEditTool(),
  bash: createBashTool(),
};

async function bash(cell: CellExecutionEnv, command: string, timeout?: number) {
  return tools.bash.execute("call", { command, ...(timeout === undefined ? {} : { timeout }) }, noUpdate, { env: cell }, invocation, context);
}

describe("CellExecutionEnv: the four tools over the workspace table", () => {
  it("write, read, and edit see one set of rows", async () => {
    await inCell("tools", async (cell) => {
      await tools.write.execute("w", { path: "src/a.txt", content: "alpha\nbeta\n" }, noUpdate, { env: cell }, invocation, context);
      const read = await tools.read.execute("r", { path: "src/a.txt" }, noUpdate, { env: cell }, invocation, context);
      expect(text(read)).toContain("alpha");
      await tools.edit.execute("e", { path: "src/a.txt", edits: [{ oldText: "beta", newText: "gamma" }] }, noUpdate, { env: cell }, invocation, context);
      expect(getOrThrow(await cell.readTextFile("/workspace/src/a.txt", context))).toBe("alpha\ngamma\n");
      expect(getOrThrow(await cell.listDir("/workspace", context)).map((info) => info.name)).toEqual(["src"]);
      expect(getOrThrow(await cell.fileInfo("src/a.txt", context))).toMatchObject({ kind: "file", size: 12, path: "/workspace/src/a.txt" });
    });
  });

  it("journey 4 steps 1 to 3: wc | sort, sed -i in a loop, jq", async () => {
    await inCell("j4", async (cell) => {
      for (const [name, lines] of [["one.txt", 1], ["three.txt", 3], ["two.txt", 2]] as const) {
        getOrThrow(await cell.writeFile(`src/${name}`, "line\n".repeat(lines), context));
      }
      const counted = await bash(cell, "wc -l src/* | sort -n");
      expect(text(counted)).toContain("1 src/one.txt");
      expect(text(counted).trim().split("\n").at(-1)).toMatch(/total$/);

      await bash(cell, 'for f in src/*.txt; do sed -i "s/line/row/g" "$f"; done');
      expect(getOrThrow(await cell.readTextFile("src/two.txt", context))).toBe("row\nrow\n");

      getOrThrow(await cell.writeFile("data.json", '{"b":1,"a":[1,2]}', context));
      const pretty = await bash(cell, "jq . data.json");
      expect(text(pretty).trim()).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');

      const found = await bash(cell, "find src -name '*.txt' | sort | xargs grep -l row");
      expect(text(found).trim()).toBe("src/one.txt\nsrc/three.txt\nsrc/two.txt");
    });
  });

  it("journey 4 step 4: a missing interpreter is refused with the notice, and the prompt carries the same words", async () => {
    await inCell("notice", async (cell) => {
      await expect(bash(cell, "npm test")).rejects.toThrow(`npm: command not found (${SHELL_NOTICE})`);
      await expect(bash(cell, "python3 -c 'print(1)'")).rejects.toThrow(new RegExp(`python3: command not (?:found|available)[^\\n]*\\(${SHELL_NOTICE}\\)`));
      expect(SHELL_SYSTEM_PROMPT_LINE).toContain(SHELL_NOTICE);
      expect(annotateCommandNotFound("bash: cargo: command not found\n")).toBe(`bash: cargo: command not found (${SHELL_NOTICE})\n`);
    });
  });

  it("pen journey 6: with no container the table generates lamb's two sentences byte for byte", () => {
    // Lamb's strings as they were in shell-notice.ts the day it became the table; literals here, never imported.
    const lambNotice = "this shell runs inside the session; no interpreters or package managers are installed";
    const lambLine =
      "The bash tool runs a shell interpreter inside the session with the usual text tools (ls, cat, grep, sed, awk, find, sort, jq, diff, tar) over the workspace at /workspace. " +
      "There are no interpreters (no python, node) and no package managers (no npm, pip, cargo): this shell runs inside the session; no interpreters or package managers are installed. " +
      "Say so plainly when asked for something the shell cannot do, rather than pretending it ran.";
    expect(shellNotice(NO_CONTAINER)).toBe(lambNotice);
    expect(shellSystemPromptLine(NO_CONTAINER)).toBe(lambLine);
    expect(SHELL_NOTICE).toBe(lambNotice);
    expect(SHELL_SYSTEM_PROMPT_LINE).toBe(lambLine);
  });

  it("journey 4 step 5: a runaway loop stops at the shell's own bound, and a timeout stops a slow one", async () => {
    await inCell("runaway", async (cell) => {
      const started = Date.now();
      await expect(bash(cell, "while true; do :; done")).rejects.toThrow(/exited with code|limit|iterations/i);
      expect(Date.now() - started).toBeLessThan(30_000);
      const result = await cell.exec("sleep 5", { timeout: 0.2 }, context);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("timeout");
    });
  });

  it("journey 4 step 6: a write over the per-file cap is refused naming the limit", async () => {
    await inCell("cap", async (cell) => {
      const big = "x".repeat(MAX_FILE_BYTES + 1);
      await expect(
        tools.write.execute("w", { path: "big.bin", content: big }, noUpdate, { env: cell }, invocation, context),
      ).rejects.toThrow(String(MAX_FILE_BYTES));
      expect(getOrThrow(await cell.exists("big.bin", context))).toBe(false);
    });
  });

  it("truncates long output and spills the whole of it to /tmp, as pi's bash renderer expects", async () => {
    await inCell("spill", async (cell) => {
      const result = await bash(cell, "seq 1 5000");
      expect(text(result)).toMatch(/\[Showing lines \d+-5000 of 5000\. Full output: \/tmp\/tmp-[^\]]+\]/);
      expect(result.details?.truncation?.truncated).toBe(true);
      const spilled = getOrThrow(await cell.readTextLines(result.details!.fullOutputPath!, undefined, context));
      expect(spilled).toHaveLength(5000);
    });
  });

  it("fences the workspace: nothing outside /workspace and /tmp, and no leaving by ..", async () => {
    await inCell("fence", async (cell) => {
      const outside = await cell.writeFile("/etc/passwd", "no", context);
      expect(outside.ok).toBe(false);
      if (!outside.ok) expect(outside.error.code).toBe("permission_denied");
      const escaped = await cell.readTextFile("../../etc/passwd", context);
      expect(escaped.ok).toBe(false);
      expect(getOrThrow(await cell.listDir("/", context)).map((info) => info.name)).toEqual(["tmp", "workspace"]);
      expect(getOrThrow(await cell.absolutePath("~/notes.md", context))).toBe("/workspace/notes.md");
    });
  });

  it("renames directories, follows symlinks, and honours abort", async () => {
    await inCell("rename", async (cell) => {
      getOrThrow(await cell.writeFile("a/b/c.txt", "c", context));
      getOrThrow(await cell.renameFile("a", "z", context));
      expect(getOrThrow(await cell.readTextFile("z/b/c.txt", context))).toBe("c");
      expect(getOrThrow(await cell.exists("a", context))).toBe(false);
      await bash(cell, "ln -s z/b/c.txt link.txt");
      expect(getOrThrow(await cell.canonicalPath("link.txt", context))).toBe("/workspace/z/b/c.txt");
      expect(getOrThrow(await cell.fileInfo("link.txt", context)).kind).toBe("symlink");
      const controller = new AbortController();
      controller.abort();
      const aborted = await cell.readTextFile("z/b/c.txt", withAbortSignal(controller.signal, context));
      expect(aborted.ok).toBe(false);
      if (!aborted.ok) expect(aborted.error.code).toBe("aborted");
    });
  });
});
