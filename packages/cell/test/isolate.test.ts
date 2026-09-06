/**
 * pen phase 5: the fresh isolate, in workerd, through the pool's Worker
 * Loader binding. The rule for `node` in the table; journey 4 steps 1
 * and 2 through pi's real bash tool, a script over the rows in a
 * dynamic worker, its stdout the tool result; step 3's `fetch`, refused
 * with the sentence; what the isolate cannot see, which is everything
 * of the cell's; and a `node` line while a fake container is up, which
 * goes to the container.
 *
 * Two things are not here. A script that loops without yielding: the
 * local runtime does not enforce `limits.cpuMs`, and such a script
 * freezes workerd whole, this suite included, so that proof is the
 * deployed walk's. And a file written back: tier 1's workspace is
 * read-only, which `the workspace is modules` below is the test of.
 */
import { BACKGROUND_CONTEXT, createBashTool, getOrThrow } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CellExecutionEnv, type ContainerLease } from "../src/env/execution-env.ts";
import {
  classify,
  fetchRefused,
  type Home,
  ISOLATE_TAKES,
  isolateReadOnly,
  isolateRefusal,
  isolateScopeRefused,
  NO_CONTAINER,
  refusalSentence,
  SHELL_NOTICE,
  shellNotice,
  shellSystemPromptLine,
} from "../src/env/programs.ts";
import { ENTRY_MODULE, ISOLATE_WORKSPACE } from "../src/pen/isolate-entry.ts";
import { Isolate, modulesFor, moduleKind } from "../src/pen/isolate.ts";
import { type FakeContainer, type ScriptFor, startFakeContainer } from "./fake-container.ts";

const context = BACKGROUND_CONTEXT;
const bashTool = createBashTool();
const invocation = {
  invocationId: "inv",
  operationId: "op",
  turnId: "turn",
  async getMemo() {
    return undefined;
  },
  async setMemo() {},
};
const capture = { capture: { limits: { maxBytes: 65536, maxLines: 1000 } } };

const LAMB: Home = { container: false, isolate: true };
const PEN_DOWN: Home = { container: true, isolate: true, containerUp: false };
const PEN_UP: Home = { container: true, isolate: true, containerUp: true };

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/** A cell with tier 1, and tier 2 when given a lease; the pool's `PEN_ISOLATE_CPU_MS` is 2000. */
function inCell<T>(name: string, body: (cell: CellExecutionEnv) => Promise<T>, lease?: { container: ContainerLease; containerUp: () => boolean }): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`isolate:${name}`), (_instance, state) => {
    state.storage.sql.exec("DROP TABLE IF EXISTS files");
    state.storage.sql.exec("DROP TABLE IF EXISTS file_chunks");
    const isolate = new Isolate(env.LOADER!, { cpuMs: Number(env.PEN_ISOLATE_CPU_MS) });
    return body(new CellExecutionEnv(state.storage.sql, { isolate, ...(lease ?? {}) }));
  });
}

/** pi's bash tool over the cell, as the harness calls it. */
async function bash(cell: CellExecutionEnv, command: string, options: { timeout?: number } = {}) {
  const updates: string[] = [];
  const result = await bashTool.execute(
    "call",
    { command, ...(options.timeout === undefined ? {} : { timeout: options.timeout }) },
    (update) => updates.push(text(update as { content: Array<{ type: string; text?: string }> })),
    { env: cell },
    invocation,
    context,
  );
  return { result, text: text(result), updates };
}

async function thrown(cell: CellExecutionEnv, command: string, options: { timeout?: number } = {}): Promise<string> {
  try {
    await bash(cell, command, options);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`${command} did not throw`);
}

async function write(cell: CellExecutionEnv, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) getOrThrow(await cell.writeFile(path, content, context));
}

const encoded = (entries: Record<string, string>) => Object.fromEntries(Object.entries(entries).map(([path, content]) => [path, new TextEncoder().encode(content)]));
const decision = (route: ReturnType<typeof classify>) => ("refused" in route ? `refused ${route.refused}` : String(route.tier));

describe("the rule for node", () => {
  it("tier 1 is the one line, on a home with the loader, while no container can be chosen; tier 2 when one is up; lamb's refusal without the loader", () => {
    const one = classify("node compute.mjs", LAMB);
    expect(one).toEqual({ tier: 1, file: "compute.mjs", args: [], programs: ["node"] });
    expect(classify("node compute.mjs one 'two words' three", LAMB)).toMatchObject({ tier: 1, file: "compute.mjs", args: ["one", "two words", "three"] });
    expect(classify("node ./scripts/compute.js", PEN_DOWN)).toMatchObject({ tier: 1, file: "./scripts/compute.js" });
    expect(classify("node compute.cjs", PEN_DOWN)).toMatchObject({ tier: 1 });
    // A container up takes it; a container whose budget is spent cannot be chosen, so the isolate is the lowest tier that has node.
    expect(classify("node compute.mjs", PEN_UP)).toMatchObject({ tier: 2 });
    expect(classify("node compute.mjs", { ...PEN_UP, budgetSpent: true })).toMatchObject({ tier: 1 });
    // Without the loader: the container's, or lamb's refusal, unchanged.
    expect(classify("node compute.mjs", { container: true })).toMatchObject({ tier: 2 });
    expect(classify("node compute.mjs", NO_CONTAINER)).toMatchObject({ refused: "node", sentence: SHELL_NOTICE });
    // The file must exist when the caller can say.
    expect(classify("node compute.mjs", LAMB, () => false)).toMatchObject({ refused: "node", sentence: isolateRefusal() });
    expect(classify("node compute.mjs", PEN_DOWN, () => false)).toMatchObject({ tier: 2 });
    expect(classify("node compute.mjs", LAMB, (file) => file === "compute.mjs")).toMatchObject({ tier: 1 });
  });

  it("every other node line is the container's, or refused with the sentence that says what tier 1 takes", () => {
    const others = [
      "node -e 1",
      "node --version",
      "node",
      "node compute.mjs | tee out.txt",
      "node compute.mjs > out.txt",
      "node compute.mjs && ls",
      "node compute.mjs; echo hi",
      "echo hi; node compute.mjs",
      "X=1 node compute.mjs",
      "node $F",
      "node compute.mjs $ARG",
      "node compute.ts",
      "node compute",
      "time node compute.mjs",
      "! node compute.mjs",
      "node compute.mjs &",
      "node compute.mjs 2>&1",
    ];
    for (const line of others) {
      expect(`${line} -> ${decision(classify(line, LAMB))}`).toBe(`${line} -> refused node`);
      expect(`${line} -> ${decision(classify(line, PEN_DOWN))}`).toBe(`${line} -> 2`);
      const refused = classify(line, LAMB);
      if ("refused" in refused) expect(refused.sentence).toBe(isolateRefusal());
    }
    // Tier 0 is untouched by the loader.
    expect(classify("ls | wc -l", LAMB)).toMatchObject({ tier: 0 });
    expect(classify("echo node compute.mjs", LAMB)).toMatchObject({ tier: 0 });
  });

  it("the sentences: the refusal, the prompt, and the fetch sentence name tier 1 when the home has it, and lamb's strings did not move", () => {
    expect(refusalSentence("node", LAMB)).toBe(isolateRefusal());
    expect(isolateRefusal()).toContain(ISOLATE_TAKES);
    expect(isolateRefusal()).toContain("no network");
    // Other programs on the same home get lamb's sentence with the one exception said.
    expect(refusalSentence("npm", LAMB)).toBe(shellNotice(LAMB));
    expect(shellNotice(LAMB)).toContain(SHELL_NOTICE);
    expect(shellNotice(LAMB)).toContain("fresh isolate");
    // Lamb's, untouched.
    expect(shellNotice(NO_CONTAINER)).toBe(SHELL_NOTICE);
    expect(refusalSentence("node", NO_CONTAINER)).toBe(SHELL_NOTICE);
    expect(shellSystemPromptLine(NO_CONTAINER)).not.toContain("isolate");
    expect(shellSystemPromptLine({ container: true })).not.toContain("isolate");
    // The prompt says it once, for either kind of home.
    for (const home of [LAMB, PEN_DOWN, PEN_UP]) {
      const line = shellSystemPromptLine(home);
      expect(line).toContain(ISOLATE_TAKES);
      expect(line).toContain("cannot write to it");
      expect(line).toContain("fetch there fails");
    }
    expect(shellSystemPromptLine(PEN_DOWN)).toContain("while no container is up");
    expect(shellSystemPromptLine(LAMB)).toContain(SHELL_NOTICE);
    // The sentences for what tier 1 lacks name the tier and what would have it.
    expect(fetchRefused(PEN_DOWN)).toBe("fetch is not available in tier 1, the fresh isolate; run the script in the container with a line that names another program too, or when a container is up");
    expect(fetchRefused(LAMB)).toContain("fetch is not available in tier 1, the fresh isolate");
    expect(fetchRefused(LAMB)).toContain("no container");
    expect(isolateScopeRefused(LAMB)).toContain("timers");
    expect(isolateReadOnly(LAMB)).toContain("read-only");
    expect(isolateReadOnly(PEN_DOWN)).toContain("container");
  });
});

describe("a lamb home has no tier 1", () => {
  it("a cell built without an isolate says so, node is refused with lamb's sentence, and the loader is the test pool's own binding, not the top-level config's", async () => {
    await runInDurableObject(env.SESSION_CELL.getByName("isolate:lamb"), async (_instance, state) => {
      state.storage.sql.exec("DROP TABLE IF EXISTS files");
      state.storage.sql.exec("DROP TABLE IF EXISTS file_chunks");
      const cell = new CellExecutionEnv(state.storage.sql);
      expect(cell.home.isolate).toBeFalsy();
      expect(cell.home).toEqual({ container: false, isolate: false, containerUp: false });
      await write(cell, { "compute.mjs": 'console.log("never");' });
      expect(classify("node compute.mjs", cell.home)).toMatchObject({ refused: "node", sentence: SHELL_NOTICE });
      expect(classify("node compute.mjs", await cell.homeNow())).not.toMatchObject({ tier: 1 });
      // Through the shell: lamb's line, byte for byte, and no isolate ran.
      expect(await thrown(cell, "node compute.mjs")).toBe(`bash: node: command not found (${SHELL_NOTICE})\n\n\nCommand exited with code 127`);
      expect(shellSystemPromptLine(cell.home)).toBe(shellSystemPromptLine(NO_CONTAINER));
      expect(shellSystemPromptLine(cell.home)).not.toContain("isolate");
      expect(shellNotice(cell.home)).toBe(SHELL_NOTICE);
    });
  });
});

describe("what the isolate is loaded with", () => {
  it("the workspace is modules: the script and what it reaches by relative import as code, every other file as bytes, so a broken file elsewhere costs nothing", () => {
    const workspace = encoded({
      "compute.mjs": 'import { a } from "./lib/a.js";\nimport data from "./data.json";\nexport {};',
      "lib/a.js": 'export const a = 1;\nimport "../unreached.mjs";',
      "unreached.mjs": "export {};",
      "data.json": '{"x":1}',
      "broken.js": "this is not javascript (((",
      "other.mjs": "export const other = 1;",
      "notes.txt": "hello",
    });
    const modules = modulesFor("compute.mjs", workspace);
    expect(Object.keys(modules).sort()).toEqual([ENTRY_MODULE, ...Object.keys(workspace)].sort());
    const kind = (name: string) => Object.keys(modules[name]!)[0];
    expect(["compute.mjs", "lib/a.js", "unreached.mjs"].map(kind)).toEqual(["js", "js", "js"]);
    expect(kind("data.json")).toBe("json");
    expect(modules["data.json"]).toEqual({ json: { x: 1 } });
    expect(["broken.js", "other.mjs", "notes.txt"].map(kind)).toEqual(["data", "data", "data"]);
    expect(new TextDecoder().decode(new Uint8Array((modules["notes.txt"] as { data: ArrayBuffer }).data))).toBe("hello");
  });

  it("a .js file is an ES module by the nearest package.json, else by its own syntax, as node decides", () => {
    const esm = 'import fs from "node:fs";\nconsole.log(1);';
    const cjs = 'const fs = require("node:fs");\nconsole.log(1);';
    expect(moduleKind("a.mjs", cjs, {})).toBe("js");
    expect(moduleKind("a.cjs", esm, {})).toBe("cjs");
    expect(moduleKind("a.js", esm, {})).toBe("js");
    expect(moduleKind("a.js", cjs, {})).toBe("cjs");
    expect(moduleKind("src/a.js", cjs, encoded({ "package.json": '{"type":"module"}' }))).toBe("js");
    expect(moduleKind("src/a.js", esm, encoded({ "package.json": '{"type":"commonjs"}' }))).toBe("cjs");
    expect(moduleKind("src/a.js", esm, encoded({ "src/package.json": '{"type":"commonjs"}', "package.json": '{"type":"module"}' }))).toBe("cjs");
  });

  it("the code holds no binding at all, no outbound, and the limits; nothing of the cell's is in it", () => {
    const isolate = new Isolate(env.LOADER!, { cpuMs: 1234 });
    const code = isolate.code({ file: "x.mjs", files: encoded({ "x.mjs": "export {};" }) });
    expect(code.env).toEqual({});
    expect(code.globalOutbound).toBeNull();
    expect(code.limits).toEqual({ cpuMs: 1234, subRequests: 0 });
    expect(code.mainModule).toBe(ENTRY_MODULE);
    const dumped = JSON.stringify(code);
    for (const secret of [env.LAMB_TOKEN, env.PEN_GIT_TOKEN, "LAMB_TOKEN", "PEN_GIT_TOKEN", "SESSION_CELL", "DIRECTORY"]) expect(dumped).not.toContain(secret);
  });
});

describe("pen journey 4 steps 1 and 2: a script in the fresh isolate, through pi's bash tool", () => {
  it("node compute.mjs reads the rows by relative path and its stdout is the tool result; every run is fresh; the workspace is read-only and says so", async () => {
    await inCell("j4", async (cell) => {
      await write(cell, {
        "data/a.txt": "one\ntwo\nthree\n",
        "data/b.txt": "four\n",
        "data/keep.md": "# keep\n",
        "data/bytes.bin": " ",
        "compute.mjs": [
          'import fs from "node:fs";',
          'import path from "node:path";',
          "let lines = 0;",
          'for (const name of fs.readdirSync("data").sort()) {',
          '  if (!name.endsWith(".txt")) continue;',
          '  lines += fs.readFileSync(path.join("data", name), "utf8").split("\\n").filter(Boolean).length;',
          "}",
          'console.log("lines:", lines, "bytes:", [...fs.readFileSync("data/bytes.bin")].join(","), "dir:", fs.statSync("data").isDirectory());',
          "process.stdout.write(\"done\\n\");",
        ].join("\n"),
      });
      const started = Date.now();
      const ran = await bash(cell, "node compute.mjs");
      const took = Date.now() - started;
      expect(ran.text).toBe("lines: 4 bytes: 0,1,2 dir: true\ndone\n");
      console.info(`pen phase 5: a nine-line script over 5 files ran start to result in ${took} ms`);
      // The rows are what they were: tier 1 changes nothing.
      expect((await bash(cell, "ls data")).text).toBe("a.txt\nb.txt\nbytes.bin\nkeep.md\n");
      // A write is refused by the runtime, and the sentence beside it says why and what to do.
      await write(cell, { "writes.mjs": 'import fs from "node:fs";\nfs.writeFileSync("out.txt", "x");' });
      const wrote = await thrown(cell, "node writes.mjs");
      expect(wrote).toContain(`Error: operation not permitted (${isolateReadOnly(cell.home)})`);
      expect(wrote).toContain("writes.mjs");
      expect(getOrThrow(await cell.exists("out.txt", context))).toBe(false);
      // Every run is fresh: nothing a script did is there for the next.
      await write(cell, { "marks.mjs": 'import fs from "node:fs";\nconsole.log(fs.existsSync("/tmp/mark"));\nfs.writeFileSync("/tmp/mark", "x");' });
      expect((await bash(cell, "node marks.mjs")).text).toBe("false\n");
      expect((await bash(cell, "node marks.mjs")).text).toBe("false\n");
    });
  });

  it("relative imports, .cjs with require, .js by package.json or syntax, argv, cwd, exit codes, a thrown error, a syntax error, stderr in order", async () => {
    await inCell("modules", async (cell) => {
      await write(cell, {
        "lib.mjs": "export const value = 'from lib';",
        "uses-lib.mjs": 'import { value } from "./lib.mjs";\nconsole.log(value);',
        "helper.cjs": "module.exports = { twice: (n) => n * 2 };",
        "uses-require.cjs": 'const fs = require("node:fs");\nconst { twice } = require("./helper.cjs");\nconsole.log(twice(21), typeof fs.readFileSync);',
        "plain.js": 'const os = require("node:os");\nconsole.log("cjs by syntax", typeof os.EOL);',
        "esm.js": 'import { value } from "./lib.mjs";\nconsole.log("esm by syntax", value);',
        "pkg/package.json": '{"type":"module"}',
        "pkg/index.js": 'import { value } from "../lib.mjs";\nconsole.log("esm by package.json", value);',
        // A plain JSON import; `with { type: "json" }` is a fatal crash of local workerd in a dynamic worker, not an error.
        "uses-json.mjs": 'import pkg from "./pkg/package.json";\nconsole.log(pkg.type);',
        "args.mjs": "console.log(JSON.stringify(process.argv), process.cwd());",
        "code.mjs": "process.exitCode = 3;\nconsole.log('setting 3');",
        "exit.mjs": "console.log('before');\nprocess.exit(4);\nconsole.log('after');",
        "throws.mjs": "console.log('before the throw');\nthrow new Error('boom from the script');",
        "broken.mjs": "this is not javascript (((",
        "missing-import.mjs": 'import "./nowhere.mjs";',
        "bare.mjs": 'import "left-pad";',
        "warns.mjs": "console.error('to stderr');\nconsole.log('to stdout');\nprocess.stderr.write('also stderr\\n');",
      });
      expect((await bash(cell, "node uses-lib.mjs")).text).toBe("from lib\n");
      expect((await bash(cell, "node uses-require.cjs")).text).toBe("42 function\n");
      expect((await bash(cell, "node plain.js")).text).toBe("cjs by syntax string\n");
      expect((await bash(cell, "node esm.js")).text).toBe("esm by syntax from lib\n");
      expect((await bash(cell, "node pkg/index.js")).text).toBe("esm by package.json from lib\n");
      expect((await bash(cell, "node uses-json.mjs")).text).toBe("module\n");
      expect((await bash(cell, "node args.mjs one two")).text).toBe(`["node","${ISOLATE_WORKSPACE}/args.mjs","one","two"] ${ISOLATE_WORKSPACE}\n`);
      // Exit codes: process.exitCode, process.exit, a throw, a syntax error, a missing module, a bare specifier.
      expect(await thrown(cell, "node code.mjs")).toBe("setting 3\n\n\nCommand exited with code 3");
      expect(await thrown(cell, "node exit.mjs")).toBe("before\n\n\nCommand exited with code 4");
      const threw = await thrown(cell, "node throws.mjs");
      expect(threw.startsWith("before the throw\nError: boom from the script\n")).toBe(true);
      expect(threw).toContain("throws.mjs");
      expect(threw.endsWith("Command exited with code 1")).toBe(true);
      const broken = await thrown(cell, "node broken.mjs");
      expect(broken).toContain("SyntaxError");
      expect(broken).toContain("broken.mjs");
      expect(broken.endsWith("Command exited with code 1")).toBe(true);
      expect(await thrown(cell, "node missing-import.mjs")).toContain("nowhere.mjs");
      expect(await thrown(cell, "node bare.mjs")).toContain("left-pad");
      // stderr and stdout, in the order written.
      expect((await bash(cell, "node warns.mjs")).text).toBe("to stderr\nto stdout\nalso stderr\n");
      // A broken file elsewhere in the workspace costs a script nothing.
      expect((await bash(cell, "node uses-lib.mjs")).text).toBe("from lib\n");
      // From a directory other than the root the line is not tier 1: the isolate's cwd is the root whatever the shell's.
      getOrThrow(await cell.createDir("sub", undefined, context));
      const elsewhere = await cell.exec("node ../uses-lib.mjs", { cwd: "/workspace/sub", ...capture }, context);
      expect(elsewhere.ok && elsewhere.value.exitCode).toBe(127);
    });
  });

  it("a workspace of a hundred files goes in whole, and the script sees all of it", async () => {
    await inCell("hundred", async (cell) => {
      const hundred: Record<string, string> = {};
      for (let index = 0; index < 100; index++) hundred[`src/file-${String(index).padStart(3, "0")}.txt`] = `file ${index}\n`.repeat(20);
      await write(cell, {
        ...hundred,
        "count.mjs": [
          'import fs from "node:fs";',
          'const names = fs.readdirSync("src").sort();',
          'let bytes = 0;',
          'for (const name of names) bytes += fs.statSync("src/" + name).size;',
          'console.log(names.length, "files", bytes, "bytes", fs.readFileSync("src/" + names.at(-1), "utf8").split("\\n")[0]);',
        ].join("\n"),
      });
      const started = Date.now();
      const ran = await bash(cell, "node count.mjs");
      const took = Date.now() - started;
      expect(ran.text).toBe("100 files 15800 bytes file 99\n");
      console.info(`pen phase 5: a script over a workspace of 101 files ran start to result in ${took} ms`);
    });
  });
});

describe("pen journey 4 step 3 and the acceptance criteria: what the isolate lacks", () => {
  it("fetch is refused with the sentence that names tier 1, from the top level and from a function; connect too; and the cell's environment is not there", async () => {
    await inCell("lacks", async (cell) => {
      await write(cell, {
        "fetches.mjs": 'console.log("fetching");\nconst response = await fetch("https://example.com/");\nconsole.log(response.status);',
        "fetches-later.mjs": 'console.log("fetching later");\nawait Promise.resolve().then(() => fetch("https://example.com/"));\nconsole.log("got it");',
        "connects.mjs": 'const { connect } = await import("cloudflare:sockets");\nconst socket = connect("example.com:80");\nawait socket.opened;\nconsole.log("connected");',
        "times.mjs": 'setTimeout(() => console.log("later"), 1);\nconsole.log("set");',
        "looks.mjs": [
          'import { env } from "cloudflare:workers";',
          "const seen = {",
          "  globalToken: globalThis.LAMB_TOKEN,",
          "  processToken: process.env.LAMB_TOKEN,",
          "  gitToken: process.env.PEN_GIT_TOKEN,",
          "  processEnv: Object.keys(process.env),",
          "  bindings: Object.keys(env),",
          "  cell: typeof globalThis.SESSION_CELL,",
          "  loader: typeof globalThis.LOADER,",
          "};",
          "console.log(JSON.stringify(seen));",
        ].join("\n"),
      });
      const fetched = await thrown(cell, "node fetches.mjs");
      expect(fetched.startsWith(`fetching\nError: ${isolateScopeRefused(cell.home)}\n`)).toBe(true);
      expect(fetched).not.toContain("global scope");
      expect(fetched.endsWith("Command exited with code 1")).toBe(true);
      const later = await thrown(cell, "node fetches-later.mjs");
      expect(later).toContain("tier 1, the fresh isolate");
      expect(later).not.toContain("got it");
      const connected = await thrown(cell, "node connects.mjs");
      expect(connected).toContain("tier 1, the fresh isolate");
      expect(connected).not.toContain("connected");
      const timed = await thrown(cell, "node times.mjs");
      expect(timed.startsWith(`Error: ${isolateScopeRefused(cell.home)}\n`)).toBe(true);
      const looked = JSON.parse((await bash(cell, "node looks.mjs")).text) as Record<string, unknown>;
      expect(looked).toEqual({ processEnv: [], bindings: [], cell: "undefined", loader: "undefined" });
      for (const secret of [env.LAMB_TOKEN, env.PEN_GIT_TOKEN]) expect(JSON.stringify(looked)).not.toContain(secret);
    });
  });

  it.skip("a script that loops without yielding ends at the CPU limit with an error, not a hang: the local runtime does not enforce limits.cpuMs and freezes whole, so this is the deployed walk's", () => {});
});

describe("a node line while a container is up goes to the container, and to the isolate when none is", () => {
  it("the first node run rents nothing; after a container is rented the same line runs there", async () => {
    const script: ScriptFor = (request) => {
      if (request.command === "pnpm test") return { steps: [{ stdout: "1 passed\n" }], exit: 0 };
      if (request.command === "node compute.mjs") return { steps: [{ stdout: "from the container\n" }], exit: 0 };
      return undefined;
    };
    const containers: FakeContainer[] = [];
    let rents = 0;
    const lease: ContainerLease = {
      async rent() {
        rents++;
        const last = containers.at(-1);
        if (last !== undefined) return last.socket;
        const container = startFakeContainer({ script });
        containers.push(container);
        return container.socket;
      },
      idle() {},
    };
    await inCell(
      "up",
      async (cell) => {
        await write(cell, { "compute.mjs": 'console.log("from the isolate");' });
        expect(cell.home).toEqual({ container: true, isolate: true, containerUp: false });
        expect((await bash(cell, "node compute.mjs")).text).toBe("from the isolate\n");
        expect(rents).toBe(0);
        expect((await bash(cell, "pnpm test")).text).toBe("1 passed\n");
        expect(rents).toBe(1);
        expect(cell.home).toEqual({ container: true, isolate: true, containerUp: true });
        expect((await bash(cell, "node compute.mjs")).text).toBe("from the container\n");
        expect(rents).toBe(2);
        await new Promise((resolve) => setTimeout(resolve, 25));
        const runs = containers[0]!.transcript.filter((entry) => "frame" in entry && entry.frame.type === "run").map((entry) => ("frame" in entry ? (entry.frame as { command: string }).command : ""));
        expect(runs).toEqual(["pnpm test", "node compute.mjs"]);
        containers[0]!.stop();
      },
      { container: lease, containerUp: () => containers.length > 0 },
    );
  });
});
