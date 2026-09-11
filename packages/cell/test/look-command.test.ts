/**
 * eyes phase 1: the `look` program in workerd. Journey 4 step 2, and the
 * program's half of journeys 1 and 2: the spike's four files, and a built
 * site beside them, are written into a cell's files table and looked at
 * through the shell — pi's bash tool, just-bash, the custom command, the
 * eyes — so the whole path the walk takes is the path proved here.
 *
 * What the program must do: each flag as the design shapes it; the report
 * on stdout equal to `report.ts`'s for the same look; the PNG written
 * through the files table, read back as the bytes of a PNG at the size the
 * closing line says; a missing path as one line on stderr, nothing on
 * stdout, exit 1, and no browser asked for; the usage line and exit 2 for
 * what it cannot parse. Then the negative space: a cell without eyes has no
 * `look`, only just-bash's not-found line annotated with the eyes'
 * sentence, and its prompt is the literal it always was; `/home` says
 * `eyes: true` here and `false` for an env without the binding; the router
 * keeps a `look` line in tier 0 on a home with a container, and never sends
 * one to the container on a home without eyes.
 *
 * The pool always binds `BROWSER`, so the cell without eyes is built here,
 * from an env made without them, not hoped for.
 */
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import type { SessionSummary } from "../src/directory.ts";
import { CellExecutionEnv, type ContainerLease } from "../src/env/execution-env.ts";
import { LOOK_PROGRAM, LOOK_PROGRAMS, parseLookArgs, parseViewport, resolvePagePath, USAGE } from "../src/env/look-command.ts";
import { classify, NO_EYES_NOTICE, refusalLine, refusalSentence, SHELL_SYSTEM_PROMPT_LINE } from "../src/env/programs.ts";
import { DEFAULT_OUT, DEFAULT_VIEWPORT, eyesFor } from "../src/eyes/eyes.ts";
import { pngSize } from "../src/eyes/report.ts";
import { homeReport } from "../src/index.ts";
import { EYES_PARAGRAPH, systemPrompt } from "../src/prompt.ts";

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

/** Long enough for the first look on a machine whose wrangler cache is empty: the Chrome is fetched then. */
const LOOK_TIMEOUT_MS = 600_000;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** The spike's fake workspace, bug and all, plus a text input for `--fill` to type into. */
const FIXTURE: Record<string, string> = {
  "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>counter</title>
<link rel="stylesheet" href="style.css"><script type="module" src="app.js"></script></head>
<body><main><h1>Counter</h1><button id="inc">+1</button><output id="n">0</output>
<input id="name" aria-label="name"><ul id="items"></ul></main></body></html>`,
  "style.css": `body{font-family:system-ui,sans-serif;background:#0b1020;color:#e8ecff;margin:0}
main{max-width:480px;margin:40px auto;padding:24px;border:1px solid #334;border-radius:12px}
button{font-size:20px;padding:8px 16px;border-radius:8px;border:0;background:#5b7cff;color:#fff}
output{margin-left:16px;font-size:28px;font-variant-numeric:tabular-nums}
li{padding:4px 0;border-bottom:1px dashed #334}`,
  "app.js": `const n = document.getElementById("n"); let count = 0;
document.getElementById("inc").addEventListener("click", () => { n.textContent = String(++count); });
const items = await (await fetch("./items.json")).json();
for (const item of items) { const li = document.createElement("li"); li.textContent = item; document.getElementById("items").append(li); }
console.log("app ready, items:", items.length);
console.warn("a warning the sheep should see");
undefinedFunction(); // a bug the sheep should see`,
  "items.json": JSON.stringify(["wool", "grass", "fence"]),
};

/**
 * A built site, as `vite build --outDir site` leaves one: the page at the root of its own directory, the asset hashed
 * under it, and tall. Its icon is inline, so the browser never asks for `/favicon.ico`: a browser asks for that once
 * per session, so two looks at a page without one differ by its 404, and the report-equality test needs a page whose
 * two looks say the same thing.
 */
const SITE: Record<string, string> = {
  "site/index.html": `<!doctype html><html><head><meta charset="utf-8"><title>built</title><link rel="icon" href="data:,">
<script type="module" src="/assets/app-a1b2c3d4.js"></script><style>body{margin:0}#tall{height:3000px}</style></head>
<body><h1>Built</h1><div id="tall"></div></body></html>`,
  "site/assets/app-a1b2c3d4.js": `console.log("the hashed asset ran");`,
};

function home(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function born(name: string): Promise<SessionSummary> {
  const response = await home("/sessions", { method: "POST", body: JSON.stringify({ name }) });
  expect(response.status).toBe(201);
  return (await response.json()) as SessionSummary;
}

/** A cell as the home boots it — with eyes, since the pool binds `BROWSER` — with the given files under `/workspace`. */
async function sighted<T>(name: string, files: Record<string, string>, body: (cell: CellExecutionEnv) => Promise<T>): Promise<T> {
  const session = await born(name);
  return runInDurableObject(env.SESSION_CELL.getByName(session.id), async (cell: SessionCell) => {
    const { env: runtime } = await cell.runtime();
    for (const [path, content] of Object.entries(files)) runtime.files.writeFile(`/workspace/${path}`, content, { createParents: true });
    expect(runtime.eyes).toBeDefined();
    return body(runtime);
  });
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
  const plain = (out: string): string => (out === "(no output)" ? "" : out).replace(/\n$/, "");
  try {
    return { out: plain(await bash(cell, command)), exitCode: 0 };
  } catch (error) {
    const match = /^([\s\S]*?)\n\n\nCommand exited with code (\d+)$/.exec(error instanceof Error ? error.message : String(error));
    if (match === null) throw error;
    return { out: plain(match[1]!), exitCode: Number(match[2]) };
  }
}

/** The closing line of a report, taken apart: `wrote <out> <w>x<h> in <s>s`. */
function closingOf(out: string): { out: string; width: number; height: number; seconds: string } {
  const last = out.trimEnd().split("\n").at(-1) ?? "";
  const match = /^wrote (\S+) (\d+)x(\d+) in (\d+\.\d)s$/.exec(last);
  expect(match, `not a closing line: ${last}`).not.toBeNull();
  return { out: match![1]!, width: Number(match![2]), height: Number(match![3]), seconds: match![4]! };
}

/** The one thing that differs between two looks at the same page: the wall time in the closing line. */
const SECONDS = / in \d+\.\ds$/m;

describe("the flags, parsed without a browser", () => {
  it("maps the flags onto a LookRequest one for one, keeping --click and --fill in the order given", () => {
    const parsed = parseLookArgs(["index.html", "--click", "#a", "--fill", "#b", "two words", "--click", "#c", "--viewport", "640x480", "--full", "--out", "shots/a.png"], "/workspace");
    expect(parsed).toEqual({
      request: {
        path: "/workspace/index.html",
        actions: [
          { kind: "click", selector: "#a" },
          { kind: "fill", selector: "#b", text: "two words" },
          { kind: "click", selector: "#c" },
        ],
        viewport: { width: 640, height: 480 },
        full: true,
        out: "shots/a.png",
      },
      outPath: "/workspace/shots/a.png",
    });
    // Nothing said: the defaults, and the file named as the closing line will name it.
    expect(parseLookArgs(["index.html"], "/workspace/sub")).toEqual({ request: { path: "/workspace/sub/index.html", out: DEFAULT_OUT }, outPath: "/workspace/sub/look.png" });
    expect(parseLookArgs(["/workspace/index.html", "--out", "/workspace/shots/b.png"], "/workspace/sub")).toEqual({
      request: { path: "/workspace/index.html", out: "/workspace/shots/b.png" },
      outPath: "/workspace/shots/b.png",
    });
    expect(DEFAULT_OUT).toBe("look.png");
  });

  it("resolves a relative path against the working directory, and under the root when that reading falls outside it", () => {
    // The design's own example, `look --root site index.html`, and the workspace-relative spelling of the same page.
    expect(parseLookArgs(["--root", "site", "index.html"], "/workspace")).toMatchObject({ request: { path: "/workspace/site/index.html", root: "/workspace/site" } });
    expect(parseLookArgs(["--root", "site", "site/index.html"], "/workspace")).toMatchObject({ request: { path: "/workspace/site/index.html", root: "/workspace/site" } });
    expect(parseLookArgs(["--root", "/workspace/site", "index.html"], "/workspace/site")).toMatchObject({ request: { path: "/workspace/site/index.html" } });
    // An absolute path is taken as it is; the eyes are what refuse one outside the root.
    expect(parseLookArgs(["--root", "site", "/workspace/index.html"], "/workspace")).toMatchObject({ request: { path: "/workspace/index.html", root: "/workspace/site" } });
    expect(resolvePagePath("a/b.html", "/workspace", undefined)).toBe("/workspace/a/b.html");
    expect(resolvePagePath("b.html", "/workspace/site/a", "/workspace/site")).toBe("/workspace/site/a/b.html");
    expect(resolvePagePath("../index.html", "/workspace/sub", "/workspace")).toBe("/workspace/index.html");
  });

  it("refuses what the usage line says it refuses, and a viewport that is not <w>x<h> of positive integers", () => {
    for (const args of [[], ["a.html", "b.html"], ["a.html", "--bogus"], ["a.html", "-x"], ["--root"], ["a.html", "--click"], ["a.html", "--fill", "#a"], ["a.html", "--viewport"], ["a.html", "--out"]]) {
      expect(parseLookArgs(args, "/workspace"), args.join(" ")).toBeUndefined();
    }
    expect(parseViewport("640x480")).toEqual({ width: 640, height: 480 });
    for (const bad of ["640", "0x480", "640x0", "640x480x2", "ax480", "640 480", "-640x480", ""]) {
      expect(parseViewport(bad), bad).toBeUndefined();
      expect(parseLookArgs(["a.html", "--viewport", bad], "/workspace"), bad).toBeUndefined();
    }
  });
});

describe("the look program in workerd", () => {
  it(
    "journey 1 steps 2 and 3, through pi's bash tool: a page with a runtime error looks, the error is under errors, and the exit is 0",
    async () => {
      await sighted("look-bug", FIXTURE, async (cell) => {
        // Not thrown: the tool throws on a nonzero exit, and a broken page is a look that happened.
        const out = await bash(cell, "look index.html");
        expect(out.startsWith("errors:\n")).toBe(true);
        expect(out).toContain("ReferenceError");
        expect(out).toContain("undefinedFunction");
        expect(out).toContain("  404 /favicon.ico");
        // The page's own two lines, adjacent and in that order. Not anchored to `console:` itself: Chrome reports the
        // favicon 404 as a console error of its own, and whether that lands before or after the module's log is a race
        // the page does not decide. CI lost it on 10 Sep 2026 (run 34543282212) with both lines present, one line lower.
        expect(out).toContain("  log: app ready, items: 3\n  warn: a warning the sheep should see\n");
        expect(out).toContain(`heading "Counter"`);
        expect(out).toContain(`button "+1"`);
        expect(out).toContain("wool");
        expect(closingOf(out)).toMatchObject({ out: "look.png", ...DEFAULT_VIEWPORT });
        // The report is stdout and nothing else: the shell's own tools take it on.
        expect((await run(cell, "look index.html 2>/tmp/err | head -1")).out).toBe("errors:");
        // A second look within the ten minutes connects to the same session; the row holds one id across the two.
        const kept = cell.eyes?.session.id();
        expect(kept).toBeTypeOf("string");
        await bash(cell, "look index.html");
        expect(cell.eyes?.session.id()).toBe(kept);
      });
    },
    LOOK_TIMEOUT_MS,
  );

  it(
    "each flag: --click twice, --fill, --viewport, --root with --full, --out with parents made, and the working directory",
    async () => {
      await sighted("look-flags", { ...FIXTURE, ...SITE }, async (cell) => {
        // Journey 1 step 4: two clicks, the counter at 2 in the tree.
        const clicked = await run(cell, `look index.html --click "#inc" --click "#inc"`);
        expect(clicked.exitCode).toBe(0);
        expect(clicked.out).toContain(`"2"`);
        // --fill types into the first match; the tree shows the textbox's value.
        const filled = await run(cell, `look index.html --fill "#name" Dolly`);
        expect(filled.exitCode).toBe(0);
        expect(filled.out).toMatch(/textbox "name" "Dolly"/);
        // --viewport: the PNG's own header says so, and so does the closing line.
        const small = await run(cell, "look index.html --viewport 640x480");
        expect(closingOf(small.out)).toMatchObject({ out: "look.png", width: 640, height: 480 });
        expect(pngSize(cell.files.readFile("/workspace/look.png"))).toEqual({ width: 640, height: 480 });
        // Journey 2 step 2: --root mounts the built site at /, so the hashed asset resolves; --full is the whole scroll height.
        const full = await run(cell, "look --root site index.html --full");
        expect(full.exitCode).toBe(0);
        expect(full.out).toContain("log: the hashed asset ran");
        // The site has nothing focusable; its heading is in the tree all the same, since the eyes cut the snapshot themselves.
        expect(full.out).toContain(`tree:\n  RootWebArea "built"\n    heading "Built"\n`);
        expect(full.out).not.toContain("404 /assets/");
        const tall = closingOf(full.out);
        expect(tall.width).toBe(DEFAULT_VIEWPORT.width);
        expect(tall.height).toBeGreaterThan(3000);
        expect(pngSize(cell.files.readFile("/workspace/look.png"))).toEqual({ width: tall.width, height: tall.height });
        // The same page by its workspace path under the same root, and without the root, where /assets/… is nowhere.
        expect((await run(cell, "look --root site site/index.html")).out).toContain("log: the hashed asset ran");
        expect((await run(cell, "look site/index.html")).out).toContain("  404 /assets/app-a1b2c3d4.js");
        // --out: the file lands there, its parents made, and the closing line names it as the sheep gave it.
        const shot = await run(cell, "look index.html --out shots/a.png");
        expect(shot.exitCode).toBe(0);
        expect(closingOf(shot.out)).toMatchObject({ out: "shots/a.png", ...DEFAULT_VIEWPORT });
        expect(cell.files.stat("/workspace/shots").kind).toBe("directory");
        expect([...cell.files.readFile("/workspace/shots/a.png").subarray(0, 4)]).toEqual(PNG_MAGIC);
        // The working directory: the path and the default --out both resolve against it.
        const nested = await run(cell, "mkdir -p sub && cd sub && look ../index.html && ls");
        expect(nested.exitCode).toBe(0);
        expect(nested.out.trimEnd().split("\n").at(-1)).toBe("look.png");
        expect([...cell.files.readFile("/workspace/sub/look.png").subarray(0, 4)]).toEqual(PNG_MAGIC);
        // Overwritten, not appended: the second write is one PNG at the new size.
        await run(cell, "look index.html --viewport 320x240");
        expect(pngSize(cell.files.readFile("/workspace/look.png"))).toEqual({ width: 320, height: 240 });
      });
    },
    LOOK_TIMEOUT_MS,
  );

  it(
    "journey 4 step 2: stdout equals report.ts's for the same look, and the PNG read back from the table is the bytes at the closing line's size",
    async () => {
      await sighted("look-report", SITE, async (cell) => {
        const eyes = cell.eyes!;
        const shell = await run(cell, "look --root site site/index.html");
        expect(shell.exitCode).toBe(0);
        const direct = await eyes.look({ path: "/workspace/site/index.html", root: "/workspace/site" });
        // Equal with the seconds replaced: the wall time is the one thing two looks at the same page do not share.
        // The site's page asks for no favicon, throws nothing, logs one line, and has a small tree, so the sections are
        // the same text in the same order; `run` took the report's last newline off, put back here.
        expect(`${shell.out}\n`.replace(SECONDS, " in N.Ns")).toBe(direct.report.replace(SECONDS, " in N.Ns"));
        expect(shell.out).toContain("errors:\n  none\n\nconsole:\n  log: the hashed asset ran\n");
        // The bytes in the table: a PNG, at the size the closing line says, which is the viewport's.
        const closing = closingOf(shell.out);
        const png = cell.files.readFile("/workspace/look.png");
        expect([...png.subarray(0, 4)]).toEqual(PNG_MAGIC);
        expect(pngSize(png)).toEqual({ width: closing.width, height: closing.height });
        expect(pngSize(png)).toEqual({ ...DEFAULT_VIEWPORT });
        expect(png.byteLength).toBe(cell.files.stat("/workspace/look.png").size);
      });
    },
    LOOK_TIMEOUT_MS,
  );

  it("a missing path is one line on stderr, nothing on stdout, exit 1, and no browser asked for; usage faults are the usage line and exit 2", async () => {
    await sighted("look-missing", { ...FIXTURE, ...SITE }, async (cell) => {
      expect(await run(cell, "look nowhere.html")).toEqual({ out: "look: no such path in the workspace: /workspace/nowhere.html", exitCode: 1 });
      // Streams apart: stdout is empty, stderr is exactly one line.
      const apart = await run(cell, 'look nowhere.html >/tmp/out 2>/tmp/err; echo "exit $?"; cat /tmp/out | wc -c; cat /tmp/err | wc -l');
      expect(apart.out.split("\n").map((line) => line.trim())).toEqual(["exit 1", "0", "1"]);
      // Outside the root: the eyes' line, and the program does not check it twice.
      expect(await run(cell, "look --root site /workspace/index.html")).toEqual({ out: "look: /workspace/index.html is not under the root /workspace/site", exitCode: 1 });
      // None of that opened a session: the row is empty.
      expect(cell.eyes?.session.id()).toBeUndefined();
      expect(cell.files.exists("/workspace/look.png")).toBe(false);
      for (const line of [
        "look",
        "look index.html extra.html",
        "look index.html --bogus",
        "look index.html --viewport 12",
        "look index.html --viewport 0x480",
        "look index.html --viewport 640x",
        `look index.html --fill "#name"`,
        "look index.html --click",
        "look --root",
        "look index.html --out",
      ]) {
        expect(await run(cell, line), line).toEqual({ out: USAGE, exitCode: 2 });
      }
      expect(cell.eyes?.session.id()).toBeUndefined();
    });
  });
});

describe("a home without eyes, and the router", () => {
  it("journey 4 step 3: a cell without eyes has no look, only the not-found line with the eyes' sentence, and never sends one to a container", async () => {
    expect(NO_EYES_NOTICE).toBe("this home has no eyes; a station upgraded from this release has them");
    expect(LOOK_PROGRAM).toBe("look");
    // A lease that would say so if the router ever chose the container.
    const neverRent: ContainerLease = {
      rent: () => Promise.reject(new Error("the router sent look to the container")),
      idle() {},
    };
    await runInDurableObject(env.SESSION_CELL.getByName("look:blind"), async (_instance, state) => {
      const sql = state.storage.sql;
      // Built without the option: what a home whose Worker has no BROWSER builds.
      const blind = new CellExecutionEnv(sql);
      blind.files.writeFile("/workspace/index.html", FIXTURE["index.html"]!, { createParents: true });
      expect(blind.eyes).toBeUndefined();
      expect(blind.home).toEqual({ container: false, isolate: false, containerUp: false, eyes: false });
      // just-bash's not-found line, annotated; its not-found exit is 127.
      expect(await run(blind, "look index.html")).toEqual({ out: `bash: look: command not found (${NO_EYES_NOTICE})`, exitCode: 127 });
      await expect(bash(blind, "look index.html --click '#inc'")).rejects.toThrow(`bash: look: command not found (${NO_EYES_NOTICE})`);
      expect(await bash(blind, "help | grep -c '^look' || true")).toMatch(/^0\n?$/);
      expect(blind.files.exists("/workspace/look.png")).toBe(false);

      // With a container and no eyes: refused up front with the same sentence, and the container is never rented.
      const blindWithContainer = new CellExecutionEnv(sql, { container: neverRent });
      expect(blindWithContainer.home).toEqual({ container: true, isolate: false, containerUp: false, eyes: false });
      expect(await run(blindWithContainer, "look index.html")).toEqual({ out: `bash: look: command not found (${NO_EYES_NOTICE})`, exitCode: 127 });

      // With a container and eyes: `look` stays in just-bash — the program answers, and the container is never rented.
      const sightedWithContainer = new CellExecutionEnv(sql, { container: neverRent, eyes: (files) => eyesFor(env, files, sql) });
      expect(sightedWithContainer.home).toEqual({ container: true, isolate: false, containerUp: false, eyes: true });
      expect(await run(sightedWithContainer, "look nowhere.html")).toEqual({ out: "look: no such path in the workspace: /workspace/nowhere.html", exitCode: 1 });
      expect(await run(sightedWithContainer, "look nowhere.html && ls")).toEqual({ out: "look: no such path in the workspace: /workspace/nowhere.html", exitCode: 1 });
      expect(await run(sightedWithContainer, "look")).toEqual({ out: USAGE, exitCode: 2 });
      // The eyes option is asked, and answers nothing, for an env without the binding: the one place that decides.
      const askedAndRefused = new CellExecutionEnv(sql, { eyes: (files) => eyesFor({ ...env, BROWSER: undefined }, files, sql) });
      expect(askedAndRefused.eyes).toBeUndefined();
      expect(askedAndRefused.home.eyes).toBe(false);
    });
    // The sentence, in both places it is said from.
    expect(refusalSentence("look", { container: false })).toBe(NO_EYES_NOTICE);
    expect(refusalSentence("look", { container: true })).toBe(NO_EYES_NOTICE);
    expect(refusalSentence("look", { container: true, budgetSpent: true })).toBe(NO_EYES_NOTICE);
    expect(refusalLine("look", { container: true })).toBe(`bash: look: command not found (${NO_EYES_NOTICE})\n`);
    // With eyes, `look` has no sentence of its own: it is in the shell, and the table is not asked about it.
    expect(refusalSentence("look", { container: false, eyes: true })).not.toBe(NO_EYES_NOTICE);
  });

  it("the router: a look line is tier 0 with the set on a home with a container, and not tier 0 without it", () => {
    const container = { container: true, eyes: true };
    expect(classify("look index.html", container, undefined, LOOK_PROGRAMS)).toEqual({ tier: 0, programs: ["look"] });
    expect(classify("look index.html && ls", container, undefined, LOOK_PROGRAMS)).toEqual({ tier: 0, programs: ["look", "ls"] });
    expect(classify(`look --root site index.html --click "#inc" | head -20`, container, undefined, LOOK_PROGRAMS)).toEqual({ tier: 0, programs: ["look", "head"] });
    // Without the set, the same line is not tier 0: the container's when the home has eyes it did not hand the shell...
    expect(classify("look index.html", container)).toEqual({ tier: 2, programs: ["look"] });
    // ...and refused with the eyes' sentence when the home has none, container or not.
    expect(classify("look index.html", { container: true })).toEqual({ refused: "look", sentence: NO_EYES_NOTICE, programs: ["look"] });
    expect(classify("look index.html", { container: false })).toEqual({ refused: "look", sentence: NO_EYES_NOTICE, programs: ["look"] });
    expect(classify("look index.html", { container: false }, undefined, LOOK_PROGRAMS)).toEqual({ tier: 0, programs: ["look"] });
    // A line that also names a container program runs whole in the container, as every line does.
    expect(classify("pnpm build && look --root site index.html", container, undefined, LOOK_PROGRAMS)).toEqual({ tier: 2, programs: ["pnpm", "look"] });
    // The set beside the pasture's, as a pastured cell with eyes has both.
    expect(classify("pasture put x.md look.png && look index.html", container, undefined, new Set([...LOOK_PROGRAMS, "pasture"]))).toEqual({ tier: 0, programs: ["pasture", "look"] });
  });

  it("the prompt: no paragraph and the literal for a home without eyes, the paragraph after the shell's line for one with", () => {
    const literal = [
      "You are a coding agent working in a session that lives in a cell, not on a machine.",
      "Working directory: /workspace",
      "Use the read, write, edit, and bash tools to inspect and change files.",
      SHELL_SYSTEM_PROMPT_LINE,
      "Keep answers short and technical.",
    ].join("\n");
    expect(systemPrompt({ container: false })).toBe(literal);
    expect(systemPrompt({ container: false, eyes: false })).toBe(literal);
    expect(literal).not.toContain("look");
    expect(literal).not.toContain("eyes");
    const withEyes = systemPrompt({ container: false, eyes: true });
    expect(withEyes).toBe(literal.replace(`${SHELL_SYSTEM_PROMPT_LINE}\n`, `${SHELL_SYSTEM_PROMPT_LINE}\n${EYES_PARAGRAPH}\n`));
    expect(withEyes.split("\n")).toHaveLength(6);
    expect(withEyes.split("\n")[4]).toBe(EYES_PARAGRAPH);
    // One paragraph that says the program, its flags, the read tool, the dist rule with --outDir, and that there is no --script.
    expect(EYES_PARAGRAPH).not.toContain("\n");
    for (const said of ["`look <path>`", "--root", "--click", "--fill", "--viewport", "--full", "--out", "read tool", "look.png", "dist", "build", "node_modules", "vite build --outDir site", "look --root site index.html", "no --script"]) {
      expect(EYES_PARAGRAPH, said).toContain(said);
    }
  });

  it("`/home` says eyes: true in the pool, and false for an env without BROWSER", async () => {
    const response = await home("/home");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { eyes: unknown; container: unknown; serverId: unknown };
    expect(body.eyes).toBe(true);
    expect(body.container).toBe(false);
    expect(body.serverId).toBeTypeOf("string");
    expect(await homeReport(env)).toMatchObject({ eyes: true });
    expect(await homeReport({ ...env, BROWSER: undefined })).toMatchObject({ eyes: false, container: false });
  });
});
