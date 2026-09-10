/**
 * serve phase 1: the served look, in workerd. Journey 4 step 2, and the
 * cell's half of journey 1.
 *
 * Nothing listens on a port here and nothing could. The fake container
 * stands a table of responses behind one, its runner makes that port
 * listen only while a run whose command names it is alive, and it records
 * every start and stop; so the sentence this project is built on — a
 * server lives for one look and no longer — is asserted from outside the
 * cell, on the container's own record, rather than by reading the cell's
 * mind. Everything between the browser and that table is the real thing:
 * pi's bash tool, just-bash, the `look` program, the rental, the `run`
 * frames, the forward, the real agent.
 *
 * The one rule is the reason for the shape of this file. Every path out
 * of a rental kills the run, so there is a case for each: the look that
 * worked, the command that exited before its port answered, the command
 * that ran on and never answered, the abort, the `LookError` a selector
 * that matched nothing raises, and a `during` that throws for no reason
 * at all. Each one ends with the container's record saying the port
 * stopped, and saying why.
 */
import { BACKGROUND_CONTEXT, createBashTool, withAbortSignal } from "@earendil-works/pi-agent-core";
import type { RunRequest } from "@sheep/pen/agent";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  CellExecutionEnv,
  type ContainerLease,
  SERVE_KILL_REASON,
  SERVE_POLL_MS,
  SERVE_READY_MS,
  SERVE_UNREADY_KILL_REASON,
  serverEndedFirst,
  serverNeverAnswered,
} from "../src/env/execution-env.ts";
import { DEFAULT_PORT, parseLookArgs, parsePort, SERVE_NEEDS_CONTAINER, serverPath, USAGE } from "../src/env/look-command.ts";
import { DEFAULT_OUT, eyesFor, type Origin } from "../src/eyes/eyes.ts";
import { pngSize, SERVER_LINES } from "../src/eyes/report.ts";
import { EYES_PARAGRAPH, SERVE_SENTENCES, systemPrompt } from "../src/prompt.ts";
import { type FakeContainer, type FakeOrigin, startFakeContainer } from "./fake-container.ts";

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

/** The wait a test gives a port before it gives the server up. Two seconds, so the case that proves the give-up costs two. */
const READY_MS = 2_000;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** The port the dev server's table stands behind, which is `--port`'s default and so never said on the line. */
const PORT = DEFAULT_PORT;

/** The line a sheep types, verbatim: `$PORT` unexpanded, since just-bash hands the program the string and the container's bash expands it. */
const VITE = "npx vite --port $PORT --strictPort";

/** What Vite prints as it comes up, which is what the report's `server` section is for. */
const VITE_LINES = "\n  VITE v5.4.0  ready in 812 ms\n\n  ➜  Local:   http://localhost:5173/\n";

/** The page the table serves at `/`: journey 1's table of three rows, with an inline icon so no `/favicon.ico` 404 is listed. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>rows</title><link rel="icon" href="data:,">
<link rel="stylesheet" href="/style.css"><script type="module" src="/@vite/client"></script>
<script type="module" src="/src/main.ts"></script></head>
<body><h1>Rows</h1><table><tbody><tr><td>wool</td></tr><tr><td>grass</td></tr><tr><td>fence</td></tr></tbody></table>
<button id="more">more</button><output id="n">3</output></body></html>`;

/** The same page under another path, so a `<path>` with no leading slash can be seen arriving with one. */
const ROWS = PAGE.replace("<title>rows</title>", "<title>rows again</title>");

/** A page whose script throws, for journey 1's criterion that a runtime error is listed and the look still exits 0. */
const BROKEN = `<!doctype html><html><head><meta charset="utf-8"><title>broken</title><link rel="icon" href="data:,"></head>
<body><h1>Broken</h1><script>undefinedFunction();</script></body></html>`;

const MAIN = `document.getElementById("more").addEventListener("click", () => { document.getElementById("n").textContent = "4"; });
console.log("app ready");`;

/** Vite's client, which fails to open its hot-reload socket through the interception and says so once. The eyes keep the line. */
const CLIENT = `console.log("[vite] failed to connect to websocket");`;

const html = (body: string) => ({ headers: { "content-type": "text/html; charset=utf-8" }, body });
const js = (body: string) => ({ headers: { "content-type": "text/javascript; charset=utf-8" }, body });

/**
 * The dev server's table. `refusals` is how many requests it throws on
 * before it answers anything, which is a server still starting: the
 * agent turns a fetcher that threw into status `0`, and the cell reads
 * that as "not yet". So a table with two refusals in it is what makes the
 * readiness poll do more than one round, and makes `ready in …` a number
 * rather than zero.
 */
function devServer(starts: string, options: { refusals?: number; seen?: string[] } = {}): FakeOrigin {
  let refusals = options.refusals ?? 0;
  return {
    starts,
    respond(request) {
      if (refusals > 0) {
        refusals -= 1;
        throw new Error(`connect ECONNREFUSED 127.0.0.1:${PORT}`);
      }
      options.seen?.push(`${request.method} ${request.url}`);
      const path = request.url.split("?")[0]!;
      switch (path) {
        case "/":
          return html(PAGE);
        case "/rows":
          return html(ROWS);
        case "/broken":
          return html(BROKEN);
        case "/style.css":
          return { headers: { "content-type": "text/css; charset=utf-8" }, body: "body{font-family:system-ui}" };
        case "/src/main.ts":
          return js(MAIN);
        case "/@vite/client":
          return js(CLIENT);
        default:
          // The server's own 404, not a port that refused: journey 1's second criterion.
          return undefined;
      }
    },
  };
}

/** A home whose every `rent()` is the one fake container, so its record of what listened spans every look in a case. */
function homeOf(container: FakeContainer): { lease: ContainerLease; idles: number } {
  const home = {
    idles: 0,
    lease: {
      async rent() {
        return container.socket;
      },
      idle() {
        home.idles += 1;
      },
    },
  };
  return home;
}

/** A cell with eyes and one fake container beside it: the pair a served look needs, built here rather than hoped for. */
async function serving<T>(
  name: string,
  options: {
    script?: (request: RunRequest) => { steps: Array<{ wait?: number; stdout?: string; stderr?: string; act?: (disk: never) => void }>; exit: number } | undefined;
    /** How long this cell waits for the port; `READY_MS` unless a case needs room for a long wait it is measuring. */
    readyMs?: number;
  },
  body: (cell: CellExecutionEnv, container: FakeContainer, idles: () => number) => Promise<T>,
): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`serve:${name}`), async (_instance, state) => {
    const sql = state.storage.sql;
    sql.exec("DROP TABLE IF EXISTS files");
    sql.exec("DROP TABLE IF EXISTS file_chunks");
    const container = startFakeContainer(options.script === undefined ? {} : { script: options.script as never });
    const home = homeOf(container);
    const cell = new CellExecutionEnv(sql, {
      container: home.lease,
      serveReadyMs: options.readyMs ?? READY_MS,
      eyes: (files) => eyesFor(env, files, sql),
    });
    expect(cell.eyes).toBeDefined();
    try {
      return await body(cell, container, () => home.idles);
    } finally {
      container.stop("the test is over");
    }
  });
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/** A whole shell line through pi's bash tool: the output and the exit code, which the tool throws on a nonzero exit. */
async function run(cell: CellExecutionEnv, command: string, options: { signal?: AbortSignal } = {}): Promise<{ out: string; exitCode: number }> {
  const plain = (out: string): string => (out === "(no output)" ? "" : out).replace(/\n$/, "");
  const ctx = options.signal === undefined ? context : withAbortSignal(options.signal, context);
  try {
    const result = await bashTool.execute("b", { command }, noUpdate, { env: cell }, invocation, ctx);
    return { out: plain(text(result)), exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = /^([\s\S]*?)\n\n\nCommand exited with code (\d+)$/.exec(message);
    if (match === null) throw error;
    return { out: plain(match[1]!), exitCode: Number(match[2]) };
  }
}

/**
 * The closing line of a served look, taken apart: `wrote <out> <w>x<h> in
 * <s>s, served by \`<command>\` on <port>, ready in <s>s`. `whole` is the
 * first number and `ready` the second, kept apart here so a case can hold
 * them against each other: they are one clock's, and the whole contains
 * the wait.
 */
function servedClosing(out: string): { out: string; width: number; height: number; command: string; port: number; whole: number; ready: number } {
  const last = out.trimEnd().split("\n").at(-1) ?? "";
  const match = /^wrote (\S+) (\d+)x(\d+) in (\d+\.\d)s, served by `(.+)` on (\d+), ready in (\d+\.\d)s$/.exec(last);
  expect(match, `not a served closing line: ${last}`).not.toBeNull();
  return {
    out: match![1]!,
    width: Number(match![2]),
    height: Number(match![3]),
    whole: Number(match![4]),
    command: match![5]!,
    port: Number(match![6]),
    ready: Number(match![7]),
  };
}

/** The `run` the fake was handed for a command, so the environment and the working directory it carried can be read. */
function runFor(container: FakeContainer, contains: string): RunRequest {
  const found = container.runs.find((request) => request.command.includes(contains));
  expect(found, `no run for ${contains}`).toBeDefined();
  return found!;
}

describe("the flags of a served look, parsed without a browser", () => {
  it("takes --serve and --port as the design shapes them, and <path> as a path on the server", () => {
    expect(parseLookArgs(["--serve", VITE, "/"], "/workspace/app")).toEqual({
      request: { path: "/", out: DEFAULT_OUT },
      outPath: "/workspace/app/look.png",
      serve: { command: VITE, port: DEFAULT_PORT },
    });
    // `/` unless said, and a leading slash added to anything else; the command reaches the container as one word, `$PORT` and all.
    expect(parseLookArgs(["--serve", VITE], "/workspace")).toMatchObject({ request: { path: "/" }, serve: { command: VITE, port: 5173 } });
    expect(parseLookArgs(["--serve", "x", "about"], "/workspace")).toMatchObject({ request: { path: "/about" } });
    expect(parseLookArgs(["--serve", "x", "/about?q=1"], "/workspace")).toMatchObject({ request: { path: "/about?q=1" } });
    expect(serverPath(undefined)).toBe("/");
    expect(serverPath("")).toBe("/");
    expect(serverPath("a/b")).toBe("/a/b");
    expect(serverPath("/a/b")).toBe("/a/b");
    // `--port` is the number the command listens on and the number PORT carries: the two lines below mean the same thing.
    expect(parseLookArgs(["--serve", "npx vite --port 4000 --strictPort", "--port", "4000", "/"], "/workspace")).toMatchObject({ serve: { port: 4000 } });
    expect(parsePort("4000")).toBe(4000);
    for (const bad of ["", "0", "65536", "-1", "80.5", "eighty", "8080x"]) expect(parsePort(bad), bad).toBeUndefined();
    // The other flags act as they do on a look at the rows, and no root is resolved: there is nothing on a server a root could mean.
    expect(parseLookArgs(["--serve", "x", "/", "--click", "#a", "--viewport", "640x480", "--full", "--out", "shots/a.png"], "/workspace")).toEqual({
      request: { path: "/", actions: [{ kind: "click", selector: "#a" }], viewport: { width: 640, height: 480 }, full: true, out: "shots/a.png" },
      outPath: "/workspace/shots/a.png",
      serve: { command: "x", port: DEFAULT_PORT },
    });
  });

  it("refuses --root with --serve, --port without one, and a port that is not a port", () => {
    for (const args of [
      ["--root", "site", "--serve", "x", "/"],
      ["--serve", "x", "--root", "site", "/"],
      ["index.html", "--port", "4000"],
      ["--serve", "x", "--port", "0"],
      ["--serve", "x", "--port", "nope"],
      ["--serve", "x", "--port"],
      ["--serve"],
      ["--serve", "x", "/", "extra"],
    ]) {
      expect(parseLookArgs(args, "/workspace"), args.join(" ")).toBeUndefined();
    }
    // The usage line says both shapes, since a sheep that got one wrong is choosing between them.
    expect(USAGE).toContain("look <path> [--root <dir>]");
    expect(USAGE).toContain("look --serve '<command>' [--port <n>] [<path>]");
  });
});

describe("journey 4 step 2: a served look through the shell, against the fake", () => {
  it(
    "runs the command, renders the page from its port, reports what the server said, and stops it",
    async () => {
      const seen: string[] = [];
      await serving(
        "look",
        {
          script: (request) => {
            if (request.command.includes("vite")) {
              // Prints as it comes up, writes to the checkout, and then runs on: a dev server ends when it is killed and not before.
              return { steps: [{ stdout: VITE_LINES, act: ((disk: { putFile: (path: string, content: string) => void }) => disk.putFile("app/.vite-note", "warm\n")) as never }, { wait: 60_000 }], exit: 0 };
            }
            if (request.command.startsWith("pnpm")) return { steps: [{ stdout: "9.12.0\n" }], exit: 0 };
            return undefined;
          },
        },
        async (cell, container) => {
          // Two refusals before the first answer, so the poll goes round more than once and `ready in …` is a real number.
          container.serve(PORT, devServer("vite", { refusals: 2, seen }));
          cell.files.writeFile("/workspace/app/src/main.ts", MAIN, { createParents: true });

          // Journey 1 step 2: the look from the app's directory, the line as the sheep types it.
          const look = await run(cell, `mkdir -p app && cd app && look --serve '${VITE}' /`);
          expect(look.exitCode).toBe(0);

          // The report: `server` between `errors` and `console`, carrying what the command printed to its own streams.
          expect(look.out).toContain("errors:\n  none\n\nserver:\n");
          expect(look.out).toContain("  VITE v5.4.0  ready in 812 ms\n");
          expect(look.out).toContain("  ➜  Local:   http://localhost:5173/\n");
          expect(look.out.indexOf("server:")).toBeGreaterThan(look.out.indexOf("errors:"));
          expect(look.out.indexOf("server:")).toBeLessThan(look.out.indexOf("console:"));
          // The websocket line is the page's, and the eyes keep it: the report is what the page said.
          expect(look.out).toContain("  log: [vite] failed to connect to websocket\n");
          expect(look.out).toContain("  log: app ready\n");
          // The page rendered from the port: the stylesheet applied, the table is in the tree.
          expect(look.out).toContain(`RootWebArea "rows"`);
          expect(look.out).toContain("wool");
          expect(look.out).toContain("fence");

          // The closing line says what served, on which port, and how long the port took.
          const closing = servedClosing(look.out);
          expect(closing).toMatchObject({ out: DEFAULT_OUT, width: 1024, height: 768, command: VITE, port: PORT });
          expect(closing.ready).toBeGreaterThanOrEqual((2 * SERVE_POLL_MS) / 1000 - 0.1);
          expect(closing.ready).toBeLessThan(READY_MS / 1000);
          // One clock: the whole served look contains the wait for the port, so the first number is never the smaller one.
          expect(closing.whole).toBeGreaterThanOrEqual(closing.ready);

          // The PNG went through the files table, beside the working directory the look ran from.
          expect([...cell.files.readFile("/workspace/app/look.png").subarray(0, 4)]).toEqual(PNG_MAGIC);
          expect(pngSize(cell.files.readFile("/workspace/app/look.png"))).toEqual({ width: 1024, height: 768 });

          // The run: the command verbatim, `$PORT` unexpanded, PORT laid over the shell's environment, under the look's working directory.
          const request = runFor(container, "vite");
          expect(request.command).toBe(VITE);
          expect(request.command).toContain("$PORT");
          expect(request.cwd).toBe("/workspace/app");
          expect(request.env.PORT).toBe(String(PORT));
          expect(request.env.SHEEP).toBe("1");
          expect(request.id).toMatch(/^run-\d+$/);
          // Synced in before the server started, and out after it stopped: what the command wrote is a row.
          expect(container.disk.entries.has("app/src/main.ts")).toBe(true);
          expect(cell.files.readText("/workspace/app/.vite-note")).toBe("warm\n");

          // The one rule, on the container's own record: the port listened for this run and stopped when the look was over.
          expect(container.servers).toEqual([
            { port: PORT, event: "started", by: VITE },
            { port: PORT, event: "stopped", by: SERVE_KILL_REASON },
          ]);

          // Journey 1 step 5: the lane is free between looks. A second look is a second run, and a container line runs between them.
          expect((await run(cell, "pnpm -v")).out).toBe("9.12.0");

          // A `<path>` with no leading slash arrives at the server with one; the flags act as they do at the rows.
          const again = await run(cell, `cd app && look --serve '${VITE}' rows --click "#more" --viewport 640x480 --out shots/a.png`);
          expect(again.exitCode).toBe(0);
          expect(seen).toContain("GET /rows");
          expect(again.out).toContain(`RootWebArea "rows again"`);
          expect(again.out).toContain(`"4"`);
          expect(servedClosing(again.out)).toMatchObject({ out: "shots/a.png", width: 640, height: 480, command: VITE, port: PORT });
          expect(pngSize(cell.files.readFile("/workspace/app/shots/a.png"))).toEqual({ width: 640, height: 480 });
          expect(container.runs.filter((one) => one.command === VITE)).toHaveLength(2);
          expect(container.servers.filter((one) => one.event === "started")).toHaveLength(2);
          expect(container.servers.at(-1)).toEqual({ port: PORT, event: "stopped", by: SERVE_KILL_REASON });

          // Journey 1's criteria: a path the server 404s, and a page that throws, are each listed and each exit 0.
          const missing = await run(cell, `cd app && look --serve '${VITE}' /nowhere`);
          expect(missing.exitCode).toBe(0);
          expect(missing.out).toContain("errors:\n  404 /nowhere\n");
          const broken = await run(cell, `cd app && look --serve '${VITE}' /broken`);
          expect(broken.exitCode).toBe(0);
          expect(broken.out).toContain("ReferenceError");
          expect(broken.out).toContain("undefinedFunction");

          // A selector that matched nothing is a LookError from the eyes — and the server is stopped all the same.
          const nothing = await run(cell, `cd app && look --serve '${VITE}' / --click "#nope"`);
          expect(nothing.exitCode).toBe(1);
          expect(nothing.out.split("\n")[0]).toMatch(/^look: --click #nope: /);
          expect(container.servers.at(-1)).toEqual({ port: PORT, event: "stopped", by: SERVE_KILL_REASON });

          // Five servers started, five stopped, none of them still listening: no look left one behind.
          expect(container.servers.filter((one) => one.event === "started")).toHaveLength(5);
          expect(container.servers.filter((one) => one.event === "stopped")).toHaveLength(5);
        },
      );
    },
    LOOK_TIMEOUT_MS,
  );
});

describe("the closing line's two numbers, on one clock", () => {
  it(
    "says the whole served look first and the wait for the port inside it second",
    async () => {
      // Eight refusals before the first answer: two seconds of waiting, longer than the look itself, so a line that
      // reported the eyes' own duration would say the look took less time than the wait in it — which is what the walk read.
      const refusals = 8;
      await serving(
        "clock",
        {
          readyMs: 20_000,
          script: (request) => (request.command.includes("slow") ? { steps: [{ stdout: "starting up\n" }, { wait: 60_000 }], exit: 0 } : undefined),
        },
        async (cell, container) => {
          container.serve(PORT, devServer("slow", { refusals }));
          const started = Date.now();
          const look = await run(cell, "look --serve 'node slow.js' /");
          const elapsed = Date.now() - started;
          expect(look.exitCode).toBe(0);
          const closing = servedClosing(look.out);

          // The wait really was the wait: eight polls of a quarter second, at least.
          expect(closing.ready).toBeGreaterThanOrEqual((refusals * SERVE_POLL_MS) / 1000 - 0.1);
          // The whole contains it and is more than it — the look itself is in there too — so neither number stands in for the other.
          expect(closing.whole).toBeGreaterThan(closing.ready);
          // And the whole is a measurement rather than a guess: it fits inside the wall time this test took, to the tenth the line rounds to.
          expect(closing.whole * 1000).toBeLessThanOrEqual(elapsed + 50);
          expect(container.servers.at(-1)).toEqual({ port: PORT, event: "stopped", by: SERVE_KILL_REASON });
        },
      );
    },
    LOOK_TIMEOUT_MS,
  );
});

describe("a served look that never got a page, and the kill in every one of those paths", () => {
  it("a command that exits before its port answers is one line, exit 1, the tail after it, and the run over", async () => {
    await serving(
      "exits",
      {
        script: (request) =>
          request.command.includes("dies")
            ? { steps: [{ stderr: "failed to load config from /workspace/app/vite.config.ts\nError: Cannot find module 'vite'\n" }], exit: 1 }
            : undefined,
      },
      async (cell, container, idles) => {
        container.serve(PORT, devServer("dies"));
        const failed = await run(cell, "look --serve 'node dies.js' /");
        expect(failed.exitCode).toBe(1);
        const lines = failed.out.split("\n");
        expect(lines[0]).toBe(`look: ${serverEndedFirst({ exit: 1 }, PORT)}`);
        expect(lines[0]).toBe("look: the server exited 1 before answering on 5173");
        // The last lines the command printed, after the error line, which is where a sheep reads why.
        expect(lines.slice(1)).toEqual(["failed to load config from /workspace/app/vite.config.ts", "Error: Cannot find module 'vite'"]);
        // No page, so no PNG and no report.
        expect(cell.files.exists("/workspace/look.png")).toBe(false);
        expect(failed.out).not.toContain("tree:");
        // The container's record: the port listened for that run and stopped when the run ended, which is the exit itself.
        expect(container.servers).toEqual([
          { port: PORT, event: "started", by: "node dies.js" },
          { port: PORT, event: "stopped", by: "exit 1" },
        ]);
        // The lane is free at once: the next line runs.
        expect(idles()).toBeGreaterThan(0);
      },
    );
  });

  it("a command that never answers is one line after the wait, the run killed, and the lane free", async () => {
    await serving(
      "silent",
      { script: (request) => (request.command.includes("silent") ? { steps: [{ stdout: "starting up\n" }, { wait: 60_000 }], exit: 0 } : undefined) },
      async (cell, container) => {
        // A port that is stood up by the run and refuses every request: the agent answers status `0`, and the cell reads it as "not yet".
        container.serve(PORT, { starts: "silent", respond: () => { throw new Error(`connect ECONNREFUSED 127.0.0.1:${PORT}`); } });
        const started = Date.now();
        const failed = await run(cell, "look --serve 'node silent.js' /");
        expect(failed.exitCode).toBe(1);
        expect(Date.now() - started).toBeGreaterThanOrEqual(READY_MS - SERVE_POLL_MS);
        const lines = failed.out.split("\n");
        expect(lines[0]).toBe(`look: ${serverNeverAnswered(PORT, READY_MS)}`);
        expect(lines[0]).toBe("look: the server did not answer on 5173 within 2 s");
        expect(lines.slice(1)).toEqual(["starting up"]);
        // It ran on, so it was killed: the record says which of the two endings this was.
        expect(container.servers).toEqual([
          { port: PORT, event: "started", by: "node silent.js" },
          { port: PORT, event: "stopped", by: SERVE_UNREADY_KILL_REASON },
        ]);
      },
    );
  });

  it("an abort while the port is still being waited for kills the run", async () => {
    await serving(
      "aborted",
      { script: (request) => (request.command.includes("silent") ? { steps: [{ stdout: "starting up\n" }, { wait: 60_000 }], exit: 0 } : undefined) },
      async (cell, container) => {
        container.serve(PORT, { starts: "silent", respond: () => { throw new Error(`connect ECONNREFUSED 127.0.0.1:${PORT}`); } });
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 400);
        await run(cell, "look --serve 'node silent.js' /", { signal: controller.signal }).catch(() => undefined);
        expect(container.servers).toEqual([
          { port: PORT, event: "started", by: "node silent.js" },
          { port: PORT, event: "stopped", by: "aborted" },
        ]);
      },
    );
  });

  it("a `during` that throws for any reason at all still kills the run, and the tail is bounded at forty lines", async () => {
    await serving(
      "throws",
      {
        script: (request) =>
          request.command.includes("chatty")
            ? { steps: [{ stdout: Array.from({ length: 60 }, (_, index) => `line ${index}`).join("\n") + "\n" }, { wait: 60_000 }], exit: 0 }
            : undefined,
      },
      async (cell, container) => {
        container.serve(PORT, devServer("chatty"));
        // Not through the shell: this is the rental's own promise that nothing leaves it with a server still running.
        const boom = new Error("the browser could not be had");
        await expect(
          cell.rentServer("node chatty.js", PORT, "/workspace", (_origin: Origin) => Promise.reject(boom)),
        ).rejects.toBe(boom);
        expect(container.servers).toEqual([
          { port: PORT, event: "started", by: "node chatty.js" },
          { port: PORT, event: "stopped", by: SERVE_KILL_REASON },
        ]);

        // And the tail the report would carry is the last forty lines, not the sixty the server printed.
        const served = await cell.rentServer("node chatty.js", PORT, "/workspace", () => Promise.resolve("looked"));
        expect(served.value).toBe("looked");
        expect(served.readyMs).toBeTypeOf("number");
        // The rental's own clock, which the closing line's `in …` is: the whole of the rental, the wait for the port inside it.
        expect(served.totalMs).toBeTypeOf("number");
        expect(served.totalMs ?? -1).toBeGreaterThanOrEqual(served.readyMs ?? 0);
        expect(served.output).toHaveLength(SERVER_LINES);
        expect(served.output.at(0)).toBe("line 20");
        expect(served.output.at(-1)).toBe("line 59");
        expect(container.servers.at(-1)).toEqual({ port: PORT, event: "stopped", by: SERVE_KILL_REASON });
      },
    );
  });
});

describe("a home with eyes and no container", () => {
  it("refuses --serve by the design's sentence, without opening a browser", async () => {
    await runInDurableObject(env.SESSION_CELL.getByName("serve:blind"), async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec("DROP TABLE IF EXISTS files");
      sql.exec("DROP TABLE IF EXISTS file_chunks");
      const cell = new CellExecutionEnv(sql, { eyes: (files) => eyesFor(env, files, sql) });
      expect(cell.home).toEqual({ container: false, isolate: false, containerUp: false, eyes: true });
      expect(SERVE_NEEDS_CONTAINER).toBe("--serve needs a container; this home has none");
      expect(await run(cell, `look --serve '${VITE}' /`)).toEqual({ out: `look: ${SERVE_NEEDS_CONTAINER}`, exitCode: 1 });
      // The usage faults are still the usage line: what cannot be parsed is refused before the home is asked about.
      expect(await run(cell, `look --serve '${VITE}' --root site /`)).toEqual({ out: USAGE, exitCode: 2 });
      // No session was opened for any of it.
      expect(cell.eyes?.session.id()).toBeUndefined();
      expect(cell.files.exists("/workspace/look.png")).toBe(false);
    });
  });
});

describe("what the sheep is told", () => {
  it("the eyes' paragraph gains the served look's sentences when the home has a container too, and not otherwise", () => {
    const blind = systemPrompt({ container: false, eyes: true });
    expect(blind).toContain(EYES_PARAGRAPH);
    expect(blind).not.toContain(SERVE_SENTENCES);
    expect(blind).not.toContain("--serve");
    // One paragraph either way, on one line, the eyes' words first.
    const sighted = systemPrompt({ container: true, eyes: true });
    expect(sighted).toContain(`${EYES_PARAGRAPH} ${SERVE_SENTENCES}`);
    expect(sighted.split("\n")).toHaveLength(6);
    expect(SERVE_SENTENCES).not.toContain("\n");
    // A home with a container and no eyes says nothing of either.
    expect(systemPrompt({ container: true })).not.toContain("--serve");
    // The design's list of what has to be in it.
    for (const said of [
      "--serve",
      "--port",
      "PORT is set",
      "npx vite --port $PORT --strictPort",
      "5173",
      "path on the server",
      "--root does not combine with it",
      "killed when the report is printed",
      "[vite] failed to connect to websocket",
      "server section",
    ]) {
      expect(SERVE_SENTENCES, said).toContain(said);
    }
  });

  it("the wait is thirty seconds and the poll a quarter of one, as the design says", () => {
    expect(SERVE_READY_MS).toBe(30_000);
    expect(SERVE_POLL_MS).toBe(250);
    expect(SERVER_LINES).toBe(40);
    expect(DEFAULT_PORT).toBe(5173);
  });
});
