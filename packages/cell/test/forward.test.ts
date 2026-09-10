/**
 * serve phase 0: the forward in workerd. Journey 4 steps 1 and 3.
 *
 * Nothing here listens on a port, and nothing could: workerd has none.
 * The fake container stands a table of responses behind one instead, the
 * agent's fetcher reads the table, and everything between the browser and
 * that table is the real thing — puppeteer's interception, the eyes'
 * origin, the `Forward`, the two frames, the real agent. A page is
 * rendered from the table: its module and the module that one imports,
 * its stylesheet, its PNG, a `fetch` of JSON, a POST with a body, a `302`
 * the browser follows, a stylesheet the table 404s, and fifty requests at
 * once. Each status and content type reaches the page as the table said
 * it, which is what says the forward carried them rather than the eyes
 * inventing them.
 *
 * Then the parts the page cannot show: fifty fetches held open at the
 * same instant, so a queue would deadlock rather than merely be slow; a
 * port nothing is behind, answered with status `0`; and a binary message
 * with two announcers, which throws on the cell's side and on the
 * container's.
 *
 * Journey 4 step 3 is proved by `test/eyes.test.ts` passing unedited: the
 * rows are an origin now, and they render what they always did.
 */
import { encodeFrame } from "@sheep/pen/protocol";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import type { SessionSummary } from "../src/directory.ts";
import type { CellExecutionEnv } from "../src/env/execution-env.ts";
import { type Eyes, eyesFor } from "../src/eyes/eyes.ts";
import { ForwardOrigin, NOT_REACHED_STATUS, RowsOrigin, served } from "../src/eyes/origin.ts";
import { Checkout } from "../src/pen/checkout.ts";
import { Forward } from "../src/pen/forward.ts";
import { hashBytes } from "../src/workspace/files.ts";
import { type FakeContainer, type FakeOrigin, type FakeResponse, nextFrame, startFakeContainer } from "./fake-container.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

/** Long enough for the first look on a machine whose wrangler cache is empty: the Chrome is fetched then. */
const LOOK_TIMEOUT_MS = 600_000;

/** The port the table stands behind, as a dev server's would be. */
const PORT = 5173;

/** A one-pixel PNG, so the page has real bytes to render and the test has a byte count to check. */
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0));

/** How many of `/many/<n>` the page asks for at once. */
const MANY = 50;

const decoder = new TextDecoder();

/**
 * The table journey 4 step 1 describes, as a dev server would answer it.
 * Every entry says its own status and content type, and the test's whole
 * claim is that those, and not the eyes' guesses, are what the page sees.
 */
const TABLE: Record<string, FakeResponse> = {
  "/": {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<!doctype html><html><head><meta charset="utf-8"><title>served</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/gone.css">
<script type="module" src="/main.js"></script></head>
<body><h1>Served</h1><img id="logo" src="/logo.png" alt="logo"><output id="n">0</output></body></html>`,
  },
  "/style.css": { status: 200, headers: { "content-type": "text/css; charset=utf-8" }, body: "body{background:rgb(1,2,3)}" },
  "/lib.js": { status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: `export const say = (line) => console.log(line);` },
  "/main.js": {
    status: 200,
    headers: { "content-type": "text/javascript; charset=utf-8" },
    body: `import { say } from "./lib.js";
const seen = async (label, response) => { say(\`\${label} \${response.status} \${response.headers.get("content-type")}\`); return response; };

const data = await seen("data", await fetch("/data.json"));
say(\`items \${(await data.json()).join(",")}\`);

const echoed = await seen("echo", await fetch("/echo", { method: "POST", headers: { "content-type": "text/plain" }, body: "wool and grass" }));
say(\`echoed \${await echoed.text()}\`);

// The browser follows the 302 itself; the eyes see both requests, and this sees only the end of it.
const moved = await seen("moved", await fetch("/redirect"));
say(\`landed \${new URL(moved.url).pathname} \${(await moved.json()).where}\`);

const png = await seen("logo", await fetch("/logo.png"));
say(\`logo bytes \${(await png.arrayBuffer()).byteLength}\`);

const many = await Promise.all(Array.from({ length: ${MANY} }, (_, index) => fetch(\`/many/\${index}\`)));
const texts = await Promise.all(many.map((response) => response.text()));
say(\`many \${many.filter((response) => response.status === 200).length} sum \${texts.map(Number).reduce((a, b) => a + b, 0)}\`);

say(\`style \${getComputedStyle(document.body).backgroundColor}\`);
document.getElementById("n").textContent = String(many.length);`,
  },
  "/data.json": { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(["wool", "grass", "fence"]) },
  "/logo.png": { status: 200, headers: { "content-type": "image/png" }, body: PNG },
  "/redirect": { status: 302, headers: { location: "/moved.json", "content-type": "text/plain; charset=utf-8" }, body: "moved" },
  "/moved.json": { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ where: "here" }) },
  "/gone.css": { status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: "no such file" },
};

/** The table as a served origin: the fixed rows, `/many/<n>`, the POST echo, and a 404 for anything else. */
function tableOrigin(starts?: string): FakeOrigin {
  return {
    ...(starts === undefined ? {} : { starts }),
    respond(request) {
      const path = request.url.split("?")[0]!;
      if (path === "/echo" && request.method === "POST") {
        const body = request.body === undefined ? "" : decoder.decode(request.body);
        return { status: 201, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ got: body }) };
      }
      const many = /^\/many\/(\d+)$/.exec(path);
      if (many !== null) return { status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: many[1]! };
      return TABLE[path];
    },
  };
}

function home(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function born(name: string): Promise<SessionSummary> {
  const response = await home("/sessions", { method: "POST", body: JSON.stringify({ name }) });
  expect(response.status).toBe(201);
  return (await response.json()) as SessionSummary;
}

/** Runs `body` inside the session's cell, over its own files table and its own SQLite, as the cell would build its eyes. */
function inCell<T>(id: string, body: (cell: CellExecutionEnv, sql: SqlStorage) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell, state) => body((await cell.runtime()).env, state.storage.sql));
}

/** A cell with eyes and a fake container beside it, the way a served look will have both. */
async function looker<T>(name: string, body: (eyes: Eyes, container: FakeContainer, forward: Forward) => Promise<T>): Promise<T> {
  const session = await born(name);
  return inCell(session.id, async (cell, sql) => {
    const eyes = eyesFor(env, cell.files, sql);
    expect(eyes).toBeDefined();
    const container = startFakeContainer();
    try {
      return await body(eyes as Eyes, container, new Forward(container.socket));
    } finally {
      container.stop("the test is over");
    }
  });
}

/** The console line beginning with `label`, so a test names what it wants rather than an index. */
function said(lines: Array<{ level: string; text: string }>, label: string): string | undefined {
  return lines.find((line) => line.text.startsWith(`${label} `))?.text;
}

describe("the forward, without a browser", () => {
  it("carries a request and its answer, bytes and all, with many in flight at once", async () => {
    const container = startFakeContainer();
    const forward = new Forward(container.socket);
    container.serve(PORT, tableOrigin());

    const page = await forward.fetch({ port: PORT, method: "GET", url: "/", headers: { accept: "text/html" } });
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(decoder.decode(page.body)).toContain("<title>served</title>");

    // A body out and a body back, neither of them through the shell and neither base64.
    const posted = await forward.fetch({
      port: PORT,
      method: "POST",
      url: "/echo",
      headers: { "content-type": "text/plain" },
      body: new TextEncoder().encode("wool and grass"),
    });
    expect(posted.status).toBe(201);
    expect(JSON.parse(decoder.decode(posted.body))).toEqual({ got: "wool and grass" });

    // The bytes of a PNG survive the socket exactly.
    const png = await forward.fetch({ port: PORT, method: "GET", url: "/logo.png", headers: {} });
    expect([...png.body]).toEqual([...PNG]);

    // A response with no body at all: the frame settles it, and no binary message follows.
    const empty = await forward.fetch({ port: PORT, method: "GET", url: "/nothing?x=1", headers: {} });
    expect(empty.status).toBe(404);

    container.stop("the test is over");
  });

  it(`holds ${MANY} fetches open at the same instant, so a queue would deadlock and not merely be slow`, async () => {
    const container = startFakeContainer();
    const forward = new Forward(container.socket);
    let arrived = 0;
    let allArrived!: () => void;
    const barrier = new Promise<void>((resolve) => {
      allArrived = resolve;
    });
    container.serve(PORT, {
      async respond(request) {
        arrived += 1;
        if (arrived === MANY) allArrived();
        // Nothing is answered until every one of them is in: an agent that handled fetches on its frame chain never gets here.
        await barrier;
        return { status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: request.url.slice(1) };
      },
    });
    const answers = await Promise.all(
      Array.from({ length: MANY }, (_, index) => forward.fetch({ port: PORT, method: "GET", url: `/${index}`, headers: {} })),
    );
    expect(answers.map((answer) => answer.status)).toEqual(Array.from({ length: MANY }, () => 200));
    expect(answers.map((answer) => decoder.decode(answer.body))).toEqual(Array.from({ length: MANY }, (_, index) => String(index)));
    container.stop("the test is over");
  });

  it("answers a port nothing is listening on with status 0, which the eyes read as a gateway that could not reach one", async () => {
    const container = startFakeContainer();
    const forward = new Forward(container.socket);
    const answer = await forward.fetch({ port: PORT, method: "GET", url: "/", headers: {} });
    expect(answer.status).toBe(0);
    expect(decoder.decode(answer.body)).toContain(`127.0.0.1:${PORT}`);
    // Not a rejection: the socket is fine, the server is not there, and the look says so as a failed request.
    expect(served(answer).status).toBe(NOT_REACHED_STATUS);
    container.stop("the test is over");
  });

  it("stands a port up when a run names it and takes it down when that run ends", async () => {
    const container = startFakeContainer({ script: () => ({ steps: [{ wait: 5 }, { stdout: "ready\n" }, { wait: 5_000 }], exit: 0 }) });
    const forward = new Forward(container.socket);
    container.serve(PORT, tableOrigin("dev --port"));

    // Nothing has named it yet.
    expect((await forward.fetch({ port: PORT, method: "GET", url: "/", headers: {} })).status).toBe(0);

    container.socket.send(encodeFrame({ type: "run", id: "run-serve", command: "npm run dev --port 5173", cwd: "/workspace", env: {} }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.servers).toEqual([{ port: PORT, event: "started", by: "npm run dev --port 5173" }]);
    expect((await forward.fetch({ port: PORT, method: "GET", url: "/", headers: {} })).status).toBe(200);

    container.socket.send(encodeFrame({ type: "kill", id: "run-serve", reason: "the look is over" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.servers).toEqual([
      { port: PORT, event: "started", by: "npm run dev --port 5173" },
      { port: PORT, event: "stopped", by: "the look is over" },
    ]);
    expect((await forward.fetch({ port: PORT, method: "GET", url: "/", headers: {} })).status).toBe(0);
    container.stop("the test is over");
  });

  it("throws on the container's side when a binary message has two announcers", async () => {
    const container = startFakeContainer();
    const errored = nextFrame(container.socket);
    // A fetch whose body is still on its way, and then a frame that announces bytes of its own.
    container.socket.send(encodeFrame({ type: "fetch", id: "f-1", port: PORT, method: "POST", url: "/echo", headers: {}, size: 4 }));
    container.socket.send(encodeFrame({ type: "blob", hash: hashBytes(new Uint8Array([1, 2])), size: 2 }));
    const frame = (await errored) as { type: string; code: string; of: string; message: string };
    expect(frame.type).toBe("error");
    expect(frame.code).toBe("malformed");
    expect(frame.message).toContain("expected the bytes of fetch f-1");
    container.stop("the test is over");
  });

  it("throws on the cell's side when a binary message has two announcers, whichever announced first", async () => {
    const session = await born("two-announcers");
    await inCell(session.id, async (cell) => {
      const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
      /** A sync-out of one file the rows do not have yet, so its blob is really asked for. */
      const changing = (path: string, content: string) => {
        const bytes = new TextEncoder().encode(content);
        const hash = hashBytes(bytes);
        return {
          bytes,
          hash,
          changed: encodeFrame({ type: "changed", id: "out-1", entries: [{ path, kind: "file", mode: 0o644, hash, size: bytes.byteLength }], deleted: [] }),
        };
      };

      /** A cell's two readers over one socket, and the far end the test speaks the container's part on. */
      const wired = () => {
        const pair = new WebSocketPair();
        const cellEnd = pair[0];
        const containerEnd = pair[1];
        cellEnd.accept();
        containerEnd.accept();
        return { containerEnd, checkout: new Checkout(cellEnd, cell.files), forward: new Forward(cellEnd) };
      };

      // The sync announced first: the `response` that follows is the second announcer, and it is the fetch that is refused.
      {
        const { bytes, hash, changed } = changing("a.txt", "hi");
        const { containerEnd, checkout, forward } = wired();
        const syncing = checkout.syncOut("out-1");
        const fetching = forward.fetch({ port: PORT, method: "GET", url: "/", headers: {} });
        containerEnd.send(changed);
        await settle();
        containerEnd.send(encodeFrame({ type: "blob", hash, size: bytes.byteLength }));
        await settle();
        containerEnd.send(encodeFrame({ type: "response", id: "fetch-1", status: 200, headers: {}, size: 5 }));
        await expect(fetching).rejects.toThrow(/response fetch-1 announced a binary message while blob .* is still waiting/);
        // The sync itself is untouched: the bytes on the way are still its own, and it takes them.
        containerEnd.send(bytes);
        await expect(syncing).resolves.toEqual([]);
        containerEnd.close(1000, "done");
      }

      // The look announced first: the sync's own `blob` is the second announcer, and the guard is what refuses it.
      {
        const { bytes, hash, changed } = changing("b.txt", "yo");
        const { containerEnd, checkout, forward } = wired();
        const syncing = checkout.syncOut("out-1");
        const fetching = forward.fetch({ port: PORT, method: "GET", url: "/", headers: {} });
        fetching.catch(() => {});
        containerEnd.send(changed);
        await settle();
        containerEnd.send(encodeFrame({ type: "response", id: "fetch-1", status: 200, headers: {}, size: 5 }));
        await settle();
        containerEnd.send(encodeFrame({ type: "blob", hash, size: bytes.byteLength }));
        await expect(syncing).rejects.toThrow(/blob .* announced a binary message while response fetch-1 is still waiting/);
        expect(cell.files.exists("/workspace/b.txt")).toBe(false);
        containerEnd.close(1000, "done");
      }
    });
  });
});

describe("a page served from a port, in workerd", () => {
  it(
    "journey 4 step 1: the table's page renders through the forward, each status and content type as the table said it",
    async () => {
      // One cell, one browser session, two looks: the eyes keep a browser warm, and a second session here would be a third Chrome for nothing.
      await looker("served", async (eyes, container, forward) => {
        container.serve(PORT, tableOrigin());
        const look = await eyes.look({ path: "/" }, new ForwardOrigin(forward, PORT));
        const lines = look.seen.console;

        // Every status and content type the table said, as the page itself read them off the response.
        expect(said(lines, "data")).toBe("data 200 application/json; charset=utf-8");
        expect(said(lines, "items")).toBe("items wool,grass,fence");
        expect(said(lines, "echo")).toBe("echo 201 application/json; charset=utf-8");
        expect(said(lines, "echoed")).toBe(`echoed {"got":"wool and grass"}`);

        // The 302 was the browser's to follow: the page ended up at the target, and the eyes saw both requests.
        expect(said(lines, "moved")).toBe("moved 200 application/json; charset=utf-8");
        expect(said(lines, "landed")).toBe("landed /moved.json here");
        const asked = new Map(look.seen.requests.map((line) => [new URL(line.url).pathname, line]));
        expect(asked.get("/redirect")?.status).toBe(302);
        expect(asked.get("/moved.json")?.status).toBe(200);

        // The module imported a module, the stylesheet applied, and the PNG's bytes came through whole.
        expect(said(lines, "style")).toBe("style rgb(1, 2, 3)");
        expect(said(lines, "logo")).toBe("logo 200 image/png");
        expect(said(lines, "logo bytes")).toBe(`logo bytes ${PNG.byteLength}`);

        // Fifty at once, every one of them answered, and the sum says each got its own body.
        expect(said(lines, "many")).toBe(`many ${MANY} sum ${(MANY * (MANY - 1)) / 2}`);
        expect(look.seen.requests.filter((line) => new URL(line.url).pathname.startsWith("/many/")).length).toBe(MANY);

        // The 404 the table gave is one error line, not two: the browser abandons the stylesheet and says so a second time.
        expect(look.seen.errors.filter((line) => line.includes("gone.css"))).toEqual(["404 /gone.css"]);
        expect(look.seen.errors.filter((line) => line.includes("favicon"))).toEqual([]);

        // A page, rendered: the picture is a PNG at the viewport, and the tree has what the table wrote.
        expect([...look.png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
        expect(look.report).toContain(`heading "Served"`);

        // And a look at a port with nothing behind it, in the same session: every request is a failed one, and the browser survives it.
        const kept = eyes.session.id();
        const blind = await eyes.look({ path: "/" }, new ForwardOrigin(forward, PORT + 1));
        expect(blind.seen.errors.some((line) => line.startsWith(`${NOT_REACHED_STATUS} /`))).toBe(true);
        expect(blind.seen.requests[0]?.status).toBe(NOT_REACHED_STATUS);
        expect(eyes.session.id()).toBe(kept);
      });
    },
    LOOK_TIMEOUT_MS,
  );
});

describe("the rows as an origin", () => {
  it("says where a look starts, and keeps the eyes' two messages byte for byte", async () => {
    const session = await born("rows-origin");
    await inCell(session.id, async (cell) => {
      cell.files.writeFile("/workspace/site/index.html", "<h1>hi</h1>", { createParents: true });
      const origin = new RowsOrigin(cell.files, "/workspace");
      expect(origin.start("/workspace/site")).toBe("/site/index.html");
      expect(origin.start("/workspace/site/index.html")).toBe("/site/index.html");
      expect(() => origin.start("/workspace/nowhere.html")).toThrow("no such path in the workspace: /workspace/nowhere.html");
      expect(() => origin.start("/elsewhere")).toThrow("/elsewhere is not under the root /workspace");

      // What it answers with, and the 404 it leaves to the eyes.
      const answer = await origin.answer({ method: "GET", url: "/site/index.html?v=2", headers: {} });
      expect(answer?.status).toBe(200);
      expect(answer?.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(await origin.answer({ method: "GET", url: "/site/gone.css", headers: {} })).toBeUndefined();
      // A `..` that climbs out of the root reads nothing.
      expect(await origin.answer({ method: "GET", url: "/../etc/passwd", headers: {} })).toBeUndefined();
    });
  });
});
