/**
 * pen phase 2: the router and the sentence, against the fake container in
 * workerd. The table's decisions for a dozen lines; journey 6, a home
 * with no container, which is lamb; journey 1 steps 1 to 4 through pi's
 * real bash tool, output streaming as the fake prints it; journey 3 step
 * 3, the fake stopped mid-run and the tool error honest about it; and
 * the timeout, the abort, and a run's edits coming back to the rows.
 */
import { BACKGROUND_CONTEXT, createBashTool, getOrThrow, withAbortSignal } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject } from "cloudflare:test";
import { Bash, parse } from "just-bash/browser";
import { describe, expect, it } from "vitest";
import { CellExecutionEnv, type ContainerLease } from "../src/env/execution-env.ts";
import {
  BUDGET_SPENT_NOTICE,
  classify,
  containerPrograms,
  hasContainer,
  INTERRUPTED_DURING_RUN,
  interruptedDuringSyncOut,
  NO_CONTAINER,
  PROGRAMS,
  programsOf,
  refusalLine,
  refusalSentence,
  SHELL_NOTICE,
  shellNotice,
  shellSystemPromptLine,
  TEXT_TOOLS_SHOWN,
  TIER0_BUILTINS,
  tier0Programs,
} from "../src/env/programs.ts";
import { MAX_FILE_BYTES } from "../src/workspace/files.ts";
import { type FakeContainer, type ScriptFor, startFakeContainer, type TranscriptEntry } from "./fake-container.ts";

const context = BACKGROUND_CONTEXT;
const WITH_CONTAINER = { container: true };
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

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/** A home with a container: every `rent()` starts a fresh fake, and counts. */
interface Home {
  lease: ContainerLease;
  containers: FakeContainer[];
  rents: number;
  idles: number;
  /** The frames of every container so far, in order. */
  transcript(): TranscriptEntry[];
  runs(): Array<Extract<TranscriptEntry, { frame: unknown }>>;
}

function homeWith(script: ScriptFor, options: { stopAfter?: number; reuse?: boolean } = {}): Home {
  const home: Home = {
    containers: [],
    rents: 0,
    idles: 0,
    lease: {
      async rent() {
        home.rents++;
        const last = home.containers.at(-1);
        if (options.reuse && last !== undefined) return last.socket;
        const container = startFakeContainer({ script, ...(options.stopAfter === undefined ? {} : { stopAfter: options.stopAfter }) });
        home.containers.push(container);
        return container.socket;
      },
      idle() {
        home.idles++;
      },
    },
    transcript: () => home.containers.flatMap((container) => container.transcript),
    runs: () => home.transcript().filter((entry): entry is Extract<TranscriptEntry, { frame: unknown }> => "frame" in entry && entry.frame.type === "run"),
  };
  return home;
}

function inCell<T>(name: string, lease: ContainerLease | undefined, body: (cell: CellExecutionEnv) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`router:${name}`), (_instance, state) => {
    state.storage.sql.exec("DROP TABLE IF EXISTS files");
    state.storage.sql.exec("DROP TABLE IF EXISTS file_chunks");
    return body(new CellExecutionEnv(state.storage.sql, lease === undefined ? {} : { container: lease }));
  });
}

/** pi's bash tool over the cell, with every update's text kept. */
async function bash(cell: CellExecutionEnv, command: string, options: { timeout?: number; signal?: AbortSignal } = {}) {
  const updates: string[] = [];
  const result = await bashTool.execute(
    "call",
    { command, ...(options.timeout === undefined ? {} : { timeout: options.timeout }) },
    (update) => updates.push(text(update as { content: Array<{ type: string; text?: string }> })),
    { env: cell },
    invocation,
    options.signal === undefined ? context : withAbortSignal(options.signal, context),
  );
  return { result, text: text(result), updates };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** The fake records a frame from the cell when the agent receives it, a tick after the cell sent it and moved on. */
const settled = () => sleep(25);

// ---------------------------------------------------------------------------
// The scripts: what the fake does for the commands the journeys run.

const INSTALL_LINES = ["Progress: resolved 12, reused 0, downloaded 12, added 12\n", "Packages: +12\n", "Done in 1.3s\n"];
const TEST_LINES = ["> vitest run\n", " ✓ src/a.test.ts (2 tests) 4ms\n", " Tests  2 passed (2)\n"];

/** The project's scripts, with each line a tick apart so the output streams. */
const projectScript: ScriptFor = (request) => {
  const command = request.command.trim();
  if (command === "pnpm install") {
    return {
      steps: [
        { wait: 120, stdout: INSTALL_LINES[0] },
        { wait: 120, stdout: INSTALL_LINES[1], act: (disk) => disk.putFile("node_modules/left-pad/index.js", "module.exports = (s) => s;\n") },
        { wait: 120, stdout: INSTALL_LINES[2], act: (disk) => disk.putFile("pnpm-lock.yaml", "lockfileVersion: '9.0'\n") },
      ],
      exit: 0,
    };
  }
  if (command === "pnpm test") {
    return { steps: TEST_LINES.map((line) => ({ wait: 120, stdout: line })), exit: 0 };
  }
  if (command === "pnpm run chatty") {
    return { steps: Array.from({ length: 50 }, (_unused, index) => ({ wait: 5, stdout: `line ${index}\n` })), exit: 0 };
  }
  if (command === "pnpm ls --depth 0") {
    return {
      steps: [{ stdout: "dependencies:\nleft-pad 1.3.0\n" }],
      exit: 0,
    };
  }
  return undefined;
};

// ---------------------------------------------------------------------------

describe("the table", () => {
  it("tier 0 is what just-bash has: its registry, and the builtins its help lists", async () => {
    const help = await new Bash().exec("help");
    const listed = help.stdout
      .split("\n")
      .slice(3)
      .flatMap((line) => line.trim().split(/\s+/))
      .filter((name) => name !== "")
      .sort();
    expect([...TIER0_BUILTINS].sort()).toEqual(listed);
    const tier0 = tier0Programs();
    for (const name of ["ls", "cat", "grep", "sed", "awk", "find", "sort", "jq", "diff", "xargs", "cd", "echo", "[", "test", "export"]) expect(tier0.has(name)).toBe(true);
    for (const program of PROGRAMS) for (const name of [program.name, ...(program.also ?? [])]) expect(tier0.has(name)).toBe(false);
  });

  it("classifies a dozen lines by the rule, with and without a container", () => {
    const cases: Array<[string, ReturnType<typeof classify>["programs"] | null, string, string]> = [
      // line, programs found (null: skip), decision without a container, decision with one
      ["ls -la | wc -l", ["ls", "wc"], "0", "0"],
      ["grep -r foo src && sed -i s/a/b/ src/x.txt", ["grep", "sed"], "0", "0"],
      ["if [ -d x ]; then ls; fi", ["[", "ls"], "0", "0"],
      ["pnpm install", ["pnpm"], "refused pnpm", "2"],
      ["pnpm test | tee out.txt", ["pnpm", "tee"], "refused pnpm", "2"],
      ["echo start; git status", ["echo", "git"], "refused git", "2"],
      ["for f in $(git ls-files); do cat \"$f\"; done", ["git", "cat"], "refused git", "2"],
      ["x=1; y=$(python3 -c 1); echo $y", ["python3", "echo"], "refused python3", "2"],
      ["cat <(git diff)", ["cat", "git"], "refused git", "2"],
      ["f() { npm ls; }; f", ["npm"], "refused npm", "2"],
      ["g() { ls; }; g", ["ls"], "0", "0"],
      ["time pnpm test", ["pnpm"], "refused pnpm", "2"],
      ["\"$RUNNER\" --version", [], "0", "2"],
      ["./run.sh", [], "0", "2"],
      ["cargo build", ["cargo"], "refused cargo", "refused cargo"],
      ["echo $(( 1 + 2 ))", ["echo"], "0", "0"],
      ["if then", null, "0", "0"],
    ];
    const decision = (route: ReturnType<typeof classify>) => ("refused" in route ? `refused ${route.refused}` : String(route.tier));
    for (const [line, programs, without, withOne] of cases) {
      const a = classify(line, NO_CONTAINER);
      const b = classify(line, WITH_CONTAINER);
      expect(`${line} -> ${decision(a)}`).toBe(`${line} -> ${without}`);
      expect(`${line} -> ${decision(b)}`).toBe(`${line} -> ${withOne}`);
      if (programs !== null) expect(a.programs, line).toEqual(programs);
    }
    // A name the shell would expand is `null` to the walk; a path too.
    expect(programsOf(parse("\"$RUNNER\" x; ./run.sh; ls"))).toEqual([null, null, "ls"]);
  });

  it("the refusal, the prompt, and the table agree on every program, with and without a container", () => {
    for (const program of PROGRAMS) {
      for (const name of [program.name, ...(program.also ?? [])]) {
        // No container: nothing outside tier 0 runs, and the sentence is lamb's for every one of them.
        const without = classify(`${name} --version`, NO_CONTAINER);
        expect(without).toMatchObject({ refused: name, sentence: SHELL_NOTICE });
        expect(refusalSentence(name, NO_CONTAINER)).toBe(SHELL_NOTICE);
        // With one: the container has it, or the table says the image lacks it and the refusal says so.
        const withOne = classify(`${name} --version`, WITH_CONTAINER);
        if (program.container) {
          expect(withOne).toMatchObject({ tier: 2 });
          expect(containerPrograms()).toContain(name);
          expect(shellSystemPromptLine(WITH_CONTAINER)).toContain(name);
        } else {
          expect(withOne).toMatchObject({ refused: name });
          if ("refused" in withOne) {
            expect(withOne.sentence).toContain(name);
            expect(withOne.sentence).toContain("container's image");
          }
          expect(shellSystemPromptLine(WITH_CONTAINER)).toContain(`no ${name}`);
        }
      }
      // The prompt without a container names the spoken name of every interpreter and package manager as missing.
      if (program.class !== "version control") expect(shellSystemPromptLine(NO_CONTAINER)).toContain(program.name);
    }
    expect(shellSystemPromptLine(NO_CONTAINER)).toContain(shellNotice(NO_CONTAINER));
    expect(shellSystemPromptLine(WITH_CONTAINER)).not.toBe(shellSystemPromptLine(NO_CONTAINER));
    for (const tool of TEXT_TOOLS_SHOWN) expect(shellSystemPromptLine(WITH_CONTAINER)).toContain(tool);
  });

  it("a spent budget empties the tier-2 column: every container program is refused with the budget's sentence, and the prompt says the same words", () => {
    const spent = { container: true, budgetSpent: true };
    expect(hasContainer(spent)).toBe(false);
    expect(hasContainer(WITH_CONTAINER)).toBe(true);
    expect(hasContainer({ container: true, budgetSpent: false })).toBe(true);
    expect(shellNotice(spent)).toBe(BUDGET_SPENT_NOTICE);
    for (const program of PROGRAMS) {
      for (const name of [program.name, ...(program.also ?? [])]) {
        expect(classify(`${name} --version`, spent)).toMatchObject({ refused: name, sentence: BUDGET_SPENT_NOTICE });
        expect(refusalLine(name, spent)).toBe(`bash: ${name}: command not found (${BUDGET_SPENT_NOTICE})\n`);
      }
    }
    // A name the shell would expand is the shell's again, as with no container.
    expect(classify("\"$RUNNER\" --version", spent)).toMatchObject({ tier: 0 });
    expect(classify("ls | wc -l", spent)).toMatchObject({ tier: 0 });
    const line = shellSystemPromptLine(spent);
    expect(line).toContain(BUDGET_SPENT_NOTICE);
    expect(line).toContain("budget");
    for (const tool of TEXT_TOOLS_SHOWN) expect(line).toContain(tool);
    expect(line).not.toBe(shellSystemPromptLine(WITH_CONTAINER));
    expect(line).not.toBe(shellSystemPromptLine(NO_CONTAINER));
    // Lamb's strings did not move.
    expect(shellNotice(NO_CONTAINER)).toBe(SHELL_NOTICE);
    expect(refusalSentence("pnpm", { container: true, budgetSpent: false })).toBe(shellNotice(WITH_CONTAINER));
  });
});

describe("pen journey 6: a home with no container is lamb", () => {
  it("does not route: four lines through pi's bash tool give lamb's exact output, hi before the not-found and exit 0 after echo b", async () => {
    await inCell("j6", undefined, async (cell) => {
      expect(cell.home).toEqual({ container: false });
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      // Lamb's outputs, taken from lamb's tree with pen's changes stashed; the notice is the one part the table generates.
      const thrown = async (command: string) => {
        try {
          await bash(cell, command);
        } catch (error) {
          return (error as Error).message;
        }
        throw new Error(`${command} did not throw`);
      };
      expect(await thrown("echo hi; npm test")).toBe(`hi\nbash: npm: command not found (${SHELL_NOTICE})\n\n\nCommand exited with code 127`);
      expect(await thrown("python3 -c 1")).toBe(
        `bash: python3: command not available in browser environments. Exclude 'python3' from your commands or use the Node.js bundle. (${SHELL_NOTICE})\n\n\nCommand exited with code 127`,
      );
      expect(await thrown("npm test")).toBe(`bash: npm: command not found (${SHELL_NOTICE})\n\n\nCommand exited with code 127`);
      const mixed = await bash(cell, "echo a && git status; echo b");
      expect(mixed.text).toBe(`a\nb\nbash: git: command not found (${SHELL_NOTICE})\n`);
      const ok = await cell.exec("echo a && git status; echo b", { capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, context);
      expect(ok.ok && ok.value.exitCode).toBe(0);
      await expect(bash(cell, "pnpm install && pnpm test")).rejects.toThrow(`bash: pnpm: command not found (${SHELL_NOTICE})`);
      const raw = await cell.exec("git status", { capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, context);
      expect(raw.ok && raw.value.exitCode).toBe(127);
      const listed = await bash(cell, "ls");
      expect(listed.text.trim()).toBe("package.json");
    });
  });
});

describe("pen journey 1: a command that needs a machine, against the fake", () => {
  it("steps 1 and 2: pnpm install and pnpm test run in the container, and their output streams through pi's bash tool", async () => {
    const home = homeWith(projectScript, { reuse: true });
    await inCell("j1-run", home.lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p","scripts":{"test":"vitest run"}}\n', context));
      getOrThrow(await cell.writeFile("src/a.test.ts", "test('a', () => {});\n", context));

      const install = await bash(cell, "pnpm install");
      expect(install.text).toBe(INSTALL_LINES.join(""));
      // Streaming: more than one update carrying text, each a growth of the last, the last the whole.
      const seen = install.updates.filter((update) => update !== "");
      expect(seen.length).toBeGreaterThan(1);
      for (let index = 1; index < seen.length; index++) expect(seen[index]!.startsWith(seen[index - 1]!)).toBe(true);
      expect(seen.at(-1)).toBe(INSTALL_LINES.join(""));
      console.info(`pen phase 2: pnpm install streamed ${INSTALL_LINES.length} frames 120 ms apart as ${seen.length} bash-tool updates`);

      // The rows: the lockfile came back, node_modules stayed in the container.
      expect(getOrThrow(await cell.readTextFile("pnpm-lock.yaml", context))).toBe("lockfileVersion: '9.0'\n");
      expect(getOrThrow(await cell.exists("node_modules", context))).toBe(false);
      expect(home.containers[0]!.disk.entries.has("node_modules/left-pad/index.js")).toBe(true);
      expect(home.rents).toBe(1);
      expect(home.idles).toBe(1);

      const tests = await bash(cell, "pnpm test");
      expect(tests.text).toBe(TEST_LINES.join(""));
      expect(tests.updates.filter((update) => update !== "").length).toBeGreaterThan(1);
      expect(home.rents).toBe(2);
      expect(home.containers.length).toBe(1);

      // What a streamed run costs in updates: fifty frames 5 ms apart, collapsed by pi's publisher.
      const chatty = await bash(cell, "pnpm run chatty");
      const chattyUpdates = chatty.updates.filter((update) => update !== "").length;
      expect(chatty.text.split("\n").length).toBe(51);
      expect(chattyUpdates).toBeGreaterThan(1);
      expect(chattyUpdates).toBeLessThan(50);
      console.info(`pen phase 2: pnpm run chatty streamed 50 frames 5 ms apart as ${chattyUpdates} bash-tool updates`);

      // The transcript: one container, three runs, each synced in before and out after.
      await settled();
      const frames = home.transcript().filter((entry): entry is Extract<TranscriptEntry, { frame: unknown }> => "frame" in entry).map((entry) => `${entry.from}:${entry.frame.type}`);
      expect(home.runs().map((entry) => (entry.frame as { command: string }).command)).toEqual(["pnpm install", "pnpm test", "pnpm run chatty"]);
      const first = frames.indexOf("cell:run");
      expect(frames.slice(0, first)).toEqual(["cell:manifest", "container:need", "cell:blob", "cell:blob", "container:checkout"]);
      expect(frames.slice(first, first + 6)).toEqual(["cell:run", "container:stdout", "container:stdout", "container:stdout", "container:exit", "container:changed"]);
      expect(frames.filter((frame) => frame === "cell:synced").length).toBe(3);
    });
  });

  it("step 3: find runs in tier 0 and shows no node_modules; pnpm ls goes to the container", async () => {
    const home = homeWith(projectScript, { reuse: true });
    await inCell("j1-step3", home.lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      getOrThrow(await cell.writeFile("src/index.ts", "export {};\n", context));
      await bash(cell, "pnpm install");
      await settled();
      const runsBefore = home.runs().length;
      const framesBefore = home.transcript().length;

      const found = await bash(cell, "find . -maxdepth 1 | sort");
      expect(found.text.trim().split("\n")).toEqual([".", "./package.json", "./pnpm-lock.yaml", "./src"]);
      await settled();
      expect(home.runs().length).toBe(runsBefore);
      expect(home.transcript().length).toBe(framesBefore);
      expect(home.rents).toBe(1);

      const installed = await bash(cell, "pnpm ls --depth 0");
      expect(installed.text).toContain("left-pad 1.3.0");
      await settled();
      expect(home.runs().length).toBe(runsBefore + 1);
    });
  });

  it("step 4: the prompt with a container names it and what runs there, and a program the image lacks is refused saying so", async () => {
    const home = homeWith(projectScript);
    await inCell("j1-step4", home.lease, async (cell) => {
      expect(cell.home).toEqual({ container: true });
      const line = shellSystemPromptLine(cell.home);
      expect(line).toContain("container");
      for (const name of ["git", "node", "pnpm", "npm", "npx", "python", "pip"]) expect(line).toContain(name);
      expect(line).toContain("node_modules");
      expect(line).not.toContain(SHELL_NOTICE);

      await expect(bash(cell, "cargo build")).rejects.toThrow("bash: cargo: command not found (cargo is installed nowhere this session can reach: not in the shell and not in the container's image)");
      expect(home.rents).toBe(0);

      // A program the table does not list goes to the container, and the container's bash answers for it.
      await expect(bash(cell, "rustc --version")).rejects.toThrow("bash: rustc: command not found\n\n\nCommand exited with code 127");
      expect(home.rents).toBe(1);
      await settled();
      expect(home.runs().map((entry) => (entry.frame as { command: string }).command)).toEqual(["rustc --version"]);
    });
  });
});

describe("pen journey 3 step 3: the container dies", () => {
  it("stopped mid-run, the tool error carries the output so far and the sentence, and no exit code; the next command rents anew", async () => {
    let current: FakeContainer | undefined;
    let stops = 0;
    const script: ScriptFor = (request) => {
      if (request.command !== "pnpm test") return undefined;
      if (stops === 0) {
        return {
          steps: [
            { wait: 30, stdout: "running 1\n" },
            { wait: 30, stdout: "running 2\n" },
            {
              wait: 30,
              act: () => {
                stops++;
                current!.stop("killed by the shepherd");
              },
            },
            { wait: 30, stdout: "never printed\n" },
          ],
          exit: 0,
        };
      }
      return { steps: [{ wait: 30, stdout: "running 1\n" }, { wait: 30, stdout: "all passed\n" }], exit: 0 };
    };
    const home = homeWith(script);
    const lease: ContainerLease = {
      rent: async () => {
        const socket = await home.lease.rent();
        current = home.containers.at(-1);
        return socket;
      },
      idle: () => home.lease.idle(),
    };
    await inCell("j3", lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      let thrown: unknown;
      try {
        await bash(cell, "pnpm test");
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      // pi's bash tool joins the output and the status with a blank line; the output ends in one of its own.
      expect(message).toBe(`running 1\nrunning 2\n\n\n${INTERRUPTED_DURING_RUN}`);
      expect(message).not.toContain("exited with code");
      expect(message).not.toContain("never printed");
      expect((thrown as Error).cause).toMatchObject({ code: "shell_unavailable" });
      expect(home.rents).toBe(1);
      expect(stops).toBe(1);

      // The next command rents a new container, and runs.
      const raw = await cell.exec("pnpm test", { capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, context);
      expect(raw.ok && raw.value.exitCode).toBe(0);
      expect(home.rents).toBe(2);
      expect(home.containers.length).toBe(2);
      const second = await bash(cell, "pnpm test");
      expect(second.text).toBe("running 1\nall passed\n");
      expect(home.rents).toBe(3);
    });
  });

  it("stopped during the sync-in, the error is the sync's; stopped during the sync-out, it names the exit code and the half-synced change", async () => {
    const script: ScriptFor = (request) =>
      request.command === "node build.mjs"
        ? { steps: [{ stdout: "built\n", act: (disk) => disk.putFile("dist-notes.txt", "notes\n") }], exit: 0 }
        : undefined;

    // The manifest is the first frame the container sees; die on it.
    const early = homeWith(script, { stopAfter: 1 });
    await inCell("j3-syncin", early.lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      const result = await cell.exec("node build.mjs", { capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, context);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shell_unavailable");
        expect(result.error.message).toContain("went away during a sync");
        expect(result.error.message).toContain("stopped by the test");
      }
      expect(early.runs().length).toBe(0);
    });

    // Find where the sync-out asks for the new file's bytes, then die there.
    const whole = homeWith(script);
    const needAt = await inCell("j3-syncout-probe", whole.lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      const result = await cell.exec("node build.mjs", { capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, context);
      expect(result.ok && result.value.exitCode).toBe(0);
      expect(getOrThrow(await cell.readTextFile("dist-notes.txt", context))).toBe("notes\n");
      const transcript = whole.transcript();
      const index = transcript.findIndex((entry) => "frame" in entry && entry.from === "cell" && entry.frame.type === "need");
      expect(index).toBeGreaterThan(0);
      return index + 1;
    });
    const late = homeWith(script, { stopAfter: needAt });
    await inCell("j3-syncout", late.lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      const result = await cell.exec("node build.mjs", { capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, context);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shell_unavailable");
        expect(result.error.message).toBe(interruptedDuringSyncOut({ exit: 0 }));
        expect(result.error.message).toContain("ran to exit 0");
      }
      // The rows never got the file: whole or not at all.
      expect(getOrThrow(await cell.exists("dist-notes.txt", context))).toBe(false);
      expect(getOrThrow(await cell.readTextFile("package.json", context))).toBe('{"name":"p"}\n');
    });
  });
});

describe("timeout, abort, and the edits that come back", () => {
  const slowScript: ScriptFor = (request) =>
    request.command === "pnpm run slow"
      ? { steps: [{ stdout: "slow start\n" }, { wait: 30_000, stdout: "never\n" }], exit: 0 }
      : undefined;

  it("pi's timeout sends kill, killed comes back, the sync-out still runs, and the error is pi's timeout", async () => {
    const home = homeWith(slowScript);
    await inCell("timeout", home.lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      const started = Date.now();
      await expect(bash(cell, "pnpm run slow", { timeout: 0.3 })).rejects.toThrow("slow start\n\n\nCommand timed out after 0.3 seconds");
      expect(Date.now() - started).toBeLessThan(5_000);
      await settled();
      const frames = home.transcript().filter((entry): entry is Extract<TranscriptEntry, { frame: unknown }> => "frame" in entry).map((entry) => `${entry.from}:${entry.frame.type}`);
      const kill = frames.indexOf("cell:kill");
      const killed = frames.indexOf("container:killed");
      expect(kill).toBeGreaterThan(0);
      expect(killed).toBeGreaterThan(kill);
      expect(frames.slice(killed)).toEqual(["container:killed", "container:changed", "cell:need", "cell:synced"]);
      expect(frames).not.toContain("container:exit");
      const killFrame = home.transcript().find((entry) => "frame" in entry && entry.frame.type === "kill");
      expect(killFrame).toMatchObject({ from: "cell", frame: { type: "kill", reason: "timeout" } });
      expect(home.transcript().find((entry) => "frame" in entry && entry.frame.type === "killed")).toMatchObject({ frame: { reason: "timeout" } });
      expect(home.idles).toBe(1);

      const raw = await cell.exec("pnpm run slow", { timeout: 0.2, capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, context);
      expect(raw.ok).toBe(false);
      if (!raw.ok) expect(raw.error.code).toBe("timeout");
    });
  });

  it("an abort of the turn sends kill with reason aborted, and the error is pi's aborted", async () => {
    const home = homeWith(slowScript);
    await inCell("abort", home.lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      const controller = new AbortController();
      const pending = bash(cell, "pnpm run slow", { signal: controller.signal });
      await sleep(100);
      controller.abort();
      await expect(pending).rejects.toThrow("slow start\n\n\nCommand aborted");
      await settled();
      expect(home.transcript().find((entry) => "frame" in entry && entry.frame.type === "kill")).toMatchObject({ frame: { reason: "aborted" } });
      expect(home.transcript().find((entry) => "frame" in entry && entry.frame.type === "killed")).toMatchObject({ frame: { reason: "aborted" } });
      expect(home.transcript().some((entry) => "frame" in entry && entry.frame.type === "synced")).toBe(true);

      const raw = await cell.exec("pnpm run slow", { capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, withAbortSignal(AbortSignal.abort(), context));
      expect(raw.ok).toBe(false);
      if (!raw.ok) expect(raw.error.code).toBe("aborted");
    });
  });

  it("a run's edits come back to the rows, a deletion too, and a file over the cap is named in the tool output", async () => {
    const huge = new Uint8Array(MAX_FILE_BYTES + 1);
    const script: ScriptFor = (request) =>
      request.command === "node build.mjs"
        ? {
            steps: [
              { stdout: "building\n" },
              {
                act: (disk) => {
                  disk.putFile("src/a.txt", "edited in the container\n");
                  disk.delete("src/b.txt");
                  disk.putFile("out/bundle.bin", huge);
                  disk.putFile("dist/index.js", "built\n");
                },
                stdout: "done\n",
              },
            ],
            exit: 0,
          }
        : undefined;
    const home = homeWith(script);
    await inCell("edits", home.lease, async (cell) => {
      getOrThrow(await cell.writeFile("src/a.txt", "original\n", context));
      getOrThrow(await cell.writeFile("src/b.txt", "to be deleted\n", context));
      getOrThrow(await cell.writeFile("build.mjs", "// build\n", context));
      const built = await bash(cell, "node build.mjs");
      expect(built.text).toBe(`building\ndone\npen: out/bundle.bin (${MAX_FILE_BYTES + 1} bytes) is over the per-file limit and was not synced\n`);
      expect(getOrThrow(await cell.readTextFile("src/a.txt", context))).toBe("edited in the container\n");
      expect(getOrThrow(await cell.exists("src/b.txt", context))).toBe(false);
      expect(getOrThrow(await cell.exists("out/bundle.bin", context))).toBe(false);
      expect(getOrThrow(await cell.exists("dist", context))).toBe(false);
      expect(getOrThrow(await cell.exists("out", context))).toBe(true);
      // The run got the env the shell would have, minus the stand-ins the container's own values replace.
      const run = home.runs()[0]!.frame as { env: Record<string, string>; cwd: string };
      expect(run.cwd).toBe("/workspace");
      expect(run.env).toMatchObject({ LAMB: "1", TMPDIR: "/tmp", PWD: "/workspace" });
      expect(run.env).not.toHaveProperty("PATH");
      expect(run.env).not.toHaveProperty("HOME");
    });
  });

  it("a second container in the same cell starts from the rows, not from the first container's disk", async () => {
    const home = homeWith(projectScript);
    await inCell("fresh", home.lease, async (cell) => {
      getOrThrow(await cell.writeFile("package.json", '{"name":"p"}\n', context));
      await bash(cell, "pnpm install");
      await bash(cell, "pnpm test");
      expect(home.containers.length).toBe(2);
      // The second container was synced from the rows: the lockfile came, node_modules did not.
      expect(home.containers[1]!.disk.entries.has("pnpm-lock.yaml")).toBe(true);
      expect(home.containers[1]!.disk.entries.has("node_modules/left-pad/index.js")).toBe(false);
    });
  });
});
