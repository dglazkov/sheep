/**
 * eyes phase 0: the eyes in workerd. The spike's four files — a page, a
 * stylesheet, a module that fetches its own JSON and then calls a
 * function that is not there, and the JSON — are written into a cell's
 * files table, and looked at. Nothing listens on a port: the browser asks
 * `http://sheep.invalid` and the eyes answer out of the rows.
 *
 * What the look must come back with: a PNG at the viewport's size, the
 * `ReferenceError` under errors, the 404 for `favicon.ico` that the
 * browser asks for and the sheep never wrote, the console's log and its
 * warn, the accessibility tree with the heading and the button, and the
 * counter at `2` after two clicks. Then `--root` mounting a built site's
 * subdirectory so an absolute `/assets/<hash>.js` resolves, a path that
 * is not in the workspace as one error and no browser asked for, and the
 * session id kept across two looks. Last, that a cell whose env has no
 * `BROWSER` builds no eyes.
 *
 * The report is a pure function, so its shape is asserted without a
 * browser at all.
 */
import puppeteer from "@cloudflare/puppeteer";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import type { SessionSummary } from "../src/directory.ts";
import type { CellExecutionEnv } from "../src/env/execution-env.ts";
import { contentTypeOf, DEFAULT_VIEWPORT, Eyes, eyesFor, LookError, ORIGIN } from "../src/eyes/eyes.ts";
import { type AxNode, closing, pngSize, PRUNED_ROLES, pruneTree, report, type Seen, TREE_LINES, treeLines } from "../src/eyes/report.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

/** Long enough for the first look on a machine whose wrangler cache is empty: the Chrome is fetched then. */
const LOOK_TIMEOUT_MS = 600_000;

/** The spike's fake workspace: what a sheep might have written, bug and all. */
const FIXTURE: Record<string, string> = {
  "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>counter</title>
<link rel="stylesheet" href="style.css"><script type="module" src="app.js"></script></head>
<body><main><h1>Counter</h1><button id="inc">+1</button><output id="n">0</output>
<ul id="items"></ul></main></body></html>`,
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

/** A built site, as `vite build --outDir site` leaves one: the page at the root of its own directory, the asset hashed under it. */
const SITE: Record<string, string> = {
  "site/index.html": `<!doctype html><html><head><meta charset="utf-8"><title>built</title>
<script type="module" src="/assets/app-a1b2c3d4.js"></script><style>body{margin:0}#tall{height:3000px}</style></head>
<body><h1>Built</h1><div id="tall"></div></body></html>`,
  "site/assets/app-a1b2c3d4.js": `console.log("the hashed asset ran");`,
};

/** A page as a Vite build might leave one: a heading and a table of cells, and nothing focusable — no button, link, input, or tabindex. */
const SIMPLE: Record<string, string> = {
  "simple/index.html": `<!doctype html><html><head><meta charset="utf-8"><title>app</title><link rel="icon" href="data:,"></head>
<body><div id="app"><h1>People</h1><table><thead><tr><th>ID</th><th>Name</th></tr></thead>
<tbody><tr><td>1</td><td>Dolly</td></tr><tr><td>2</td><td>Shaun</td></tr><tr><td>3</td><td>Blackie</td></tr></tbody></table></div></body></html>`,
};

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

/** A cell with the given files under `/workspace`, and its eyes. */
async function looker<T>(name: string, files: Record<string, string>, body: (eyes: Eyes, cell: CellExecutionEnv) => Promise<T>): Promise<T> {
  const session = await born(name);
  return inCell(session.id, async (cell, sql) => {
    for (const [path, content] of Object.entries(files)) cell.files.writeFile(`/workspace/${path}`, content, { createParents: true });
    const eyes = eyesFor(env, cell.files, sql);
    expect(eyes).toBeDefined();
    return body(eyes as Eyes, cell);
  });
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

describe("the report, without a browser", () => {
  const bare: Seen = { errors: [], console: [], requests: [], tree: null, width: 1024, height: 768, ms: 2340, out: "look.png" };

  it("is four sections in the order a sheep reads them, and says `none` for an empty one", () => {
    const text = report(bare);
    expect(text).toBe(["errors:", "  none", "", "console:", "  none", "", "tree:", "  none", "", "wrote look.png 1024x768 in 2.3s", ""].join("\n"));
    expect(text.indexOf("errors:")).toBeLessThan(text.indexOf("console:"));
    expect(text.indexOf("console:")).toBeLessThan(text.indexOf("tree:"));
  });

  it("names the file, its size, and the seconds in the closing line", () => {
    expect(closing({ ...bare, out: "shot.png", width: 800, height: 4200, ms: 12_050 })).toBe("wrote shot.png 800x4200 in 12.1s");
  });

  it("indents the tree one level per depth, with roles, names, and values", () => {
    const tree = { role: "RootWebArea", name: "counter", children: [{ role: "heading", name: "Counter" }, { role: "button", name: "+1" }, { role: "StaticText", value: 2 }] };
    expect(treeLines(tree)).toEqual([`RootWebArea "counter"`, `  heading "Counter"`, `  button "+1"`, `  StaticText "2"`]);
  });

  it("cuts the tree at two hundred lines and says so, and truncates nothing else", () => {
    const deep = { role: "root", children: Array.from({ length: 400 }, (_, index) => ({ role: `n${index}` })) };
    const text = report({ ...bare, tree: deep, errors: Array.from({ length: 300 }, (_, index) => `error ${index}`) });
    const lines = text.split("\n");
    expect(lines.filter((line) => /^ {4}n\d+$/.test(line)).length).toBe(TREE_LINES - 1);
    expect(text).toContain(`… ${401 - TREE_LINES} more lines of tree, not shown`);
    expect(lines.filter((line) => line.startsWith("  error ")).length).toBe(300);
  });

  it("cuts the whole snapshot to the nodes that say something: no none, generic, or InlineTextBox, children hoisted, and no text that only repeats its parent", () => {
    // The simple page's whole snapshot, as puppeteer returns it with `interestingOnly: false`.
    const whole: AxNode = {
      role: "RootWebArea",
      name: "app",
      children: [
        {
          role: "none",
          children: [
            {
              role: "none",
              children: [
                { role: "heading", name: "People", children: [{ role: "StaticText", name: "People", children: [{ role: "InlineTextBox", name: "People" }] }] },
                {
                  role: "table",
                  children: [
                    {
                      role: "none",
                      children: [
                        { role: "row", children: [{ role: "columnheader", name: "ID", children: [{ role: "StaticText", name: "ID", children: [{ role: "InlineTextBox", name: "ID" }] }] }] },
                        { role: "row", children: [{ role: "gridcell", name: "1", children: [{ role: "StaticText", name: "1", children: [{ role: "InlineTextBox", name: "1" }] }] }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(treeLines(pruneTree(whole))).toEqual([`RootWebArea "app"`, `  heading "People"`, `  table`, `    row`, `      columnheader "ID"`, `    row`, `      gridcell "1"`]);
    // Text that says more than its parent stays; a text that only repeats a textbox's value goes, as one that repeats a
    // heading's name does; a generic wrapper is hoisted through, not lost.
    const said: AxNode = {
      role: "RootWebArea",
      name: "notes",
      children: [
        { role: "generic", children: [{ role: "paragraph", children: [{ role: "StaticText", name: "Hello, world." }] }] },
        { role: "textbox", name: "name", value: "Dolly", children: [{ role: "generic", children: [{ role: "StaticText", name: "Dolly" }] }] },
        { role: "StaticText", name: "notes" },
        { role: "InlineTextBox", name: "stray" },
      ],
    };
    expect(treeLines(pruneTree(said))).toEqual([`RootWebArea "notes"`, `  paragraph`, `    StaticText "Hello, world."`, `  textbox "name" "Dolly"`]);
    // A number's value is compared as the text it prints as.
    expect(treeLines(pruneTree({ role: "spinbutton", name: "count", value: 2, children: [{ role: "StaticText", name: "2" }] }))).toEqual([`spinbutton "count" "2"`]);
    // The root is never dropped, nothing is a `none`, and `null` stays `null`.
    expect(pruneTree({ role: "none", children: [{ role: "heading", name: "x" }] })).toEqual({ role: "none", children: [{ role: "heading", name: "x" }] });
    expect(pruneTree(null)).toBeNull();
    expect([...PRUNED_ROLES].sort()).toEqual(["InlineTextBox", "generic", "none"]);
  });

  it("reads a PNG's size out of its header", () => {
    const png = new Uint8Array(24);
    png.set(PNG_MAGIC, 0);
    new DataView(png.buffer).setUint32(16, 1024);
    new DataView(png.buffer).setUint32(20, 768);
    expect(pngSize(png)).toEqual({ width: 1024, height: 768 });
  });

  it("gives a browser the content type it needs, by extension", () => {
    expect(contentTypeOf("/workspace/app.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeOf("/workspace/style.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeOf("/workspace/items.json")).toBe("application/json; charset=utf-8");
    expect(contentTypeOf("/workspace/logo.png")).toBe("image/png");
    expect(contentTypeOf("/workspace/notes")).toBe("application/octet-stream");
  });
});

describe("the eyes in workerd", () => {
  it(
    "renders the spike's fixture from the rows, sees the bug, and keeps its session",
    async () => {
      await looker("looks", FIXTURE, async (eyes) => {
        const first = await eyes.look({
          path: "/workspace/index.html",
          actions: [
            { kind: "click", selector: "#inc" },
            { kind: "click", selector: "#inc" },
          ],
        });
        const kept = eyes.session.id();
        expect(kept).toBeTypeOf("string");

        // A PNG, at the viewport's size, with the header a PNG opens with.
        expect([...first.png.subarray(0, 4)]).toEqual(PNG_MAGIC);
        expect(pngSize(first.png)).toEqual({ ...DEFAULT_VIEWPORT });

        // The bug the sheep wrote, and the file it never wrote.
        expect(first.seen.errors.join("\n")).toContain("undefinedFunction");
        expect(first.seen.errors.some((line) => line.startsWith("ReferenceError"))).toBe(true);
        expect(first.seen.errors).toContain("404 /favicon.ico");

        // The console, each message with its level.
        expect(first.seen.console).toContainEqual({ level: "log", text: "app ready, items: 3" });
        expect(first.seen.console).toContainEqual({ level: "warn", text: "a warning the sheep should see" });

        // The tree: the heading, the button, the list the module built, and the counter after two clicks.
        const tree = treeLines(first.seen.tree);
        expect(tree.join("\n")).toContain(`heading "Counter"`);
        expect(tree.join("\n")).toContain(`button "+1"`);
        expect(tree.join("\n")).toContain("wool");
        expect(tree.some((line) => line.includes(`"2"`))).toBe(true);

        // The report is the text of all of it, and the closing line names the file.
        expect(first.report).toContain("errors:");
        expect(first.report).toContain("console:");
        expect(first.report).toContain("tree:");
        expect(first.report.trimEnd().split("\n").at(-1)).toMatch(/^wrote look\.png 1024x768 in \d+\.\ds$/);

        // A second look connects to the session the first left warm; the row still names it.
        const second = await eyes.look({ path: "/workspace", out: "again.png" });
        expect(eyes.session.id()).toBe(kept);
        expect(second.report.trimEnd().split("\n").at(-1)).toContain("wrote again.png 1024x768");
        // The directory meant its `index.html`, so the same page rendered.
        expect(treeLines(second.seen.tree).join("\n")).toContain(`heading "Counter"`);
        // Not clicked this time: the counter is back at zero.
        expect(second.seen.requests.some((request) => request.url === `${ORIGIN}/items.json`)).toBe(true);
      });
    },
    LOOK_TIMEOUT_MS,
  );

  it(
    "mounts a subdirectory with --root, so an absolute asset path resolves from it",
    async () => {
      await looker("rooted", SITE, async (eyes) => {
        const seen = await eyes.look({ path: "/workspace/site/index.html", root: "/workspace/site" });
        expect(seen.seen.console).toContainEqual({ level: "log", text: "the hashed asset ran" });
        expect(seen.seen.requests.some((request) => request.url === `${ORIGIN}/assets/app-a1b2c3d4.js` && request.status === 200)).toBe(true);
        expect(seen.seen.errors.filter((line) => line.includes("app-a1b2c3d4"))).toEqual([]);
        // The same page without the root: `/assets/…` resolves from the workspace, where nothing is.
        const unrooted = await eyes.look({ path: "/workspace/site/index.html" });
        expect(unrooted.seen.errors).toContain("404 /assets/app-a1b2c3d4.js");
        // `--full` captures the whole scroll height, and the closing line reports what was written, not the viewport.
        expect(pngSize(seen.png)).toEqual({ ...DEFAULT_VIEWPORT });
        const full = await eyes.look({ path: "/workspace/site/index.html", root: "/workspace/site", full: true });
        expect(pngSize(full.png).width).toBe(DEFAULT_VIEWPORT.width);
        expect(pngSize(full.png).height).toBeGreaterThan(3000);
        expect(full.report.trimEnd().split("\n").at(-1)).toBe(`wrote look.png 1024x${pngSize(full.png).height} in ${(full.seen.ms / 1000).toFixed(1)}s`);
      });
    },
    LOOK_TIMEOUT_MS,
  );

  it(
    "journey 2 step 2: a page with nothing focusable still has its heading and every cell in the tree, and no layout node",
    async () => {
      await looker("simple", SIMPLE, async (eyes) => {
        const seen = await eyes.look({ path: "/workspace/simple/index.html", root: "/workspace/simple" });
        const tree = treeLines(seen.seen.tree);
        expect(tree.length).toBeGreaterThan(1);
        expect(tree[0]).toBe(`RootWebArea "app"`);
        expect(tree).toContain(`  heading "People"`);
        expect(tree.join("\n")).toContain("table");
        for (const cell of ["ID", "Name", "1", "Dolly", "2", "Shaun", "3", "Blackie"]) expect(tree.some((line) => line.endsWith(` "${cell}"`)), cell).toBe(true);
        for (const line of tree) expect(line.trim().split(" ")[0], line).not.toMatch(/^(none|generic|InlineTextBox)$/);
        // The heading's text is said once: the heading, and no StaticText that only repeats it.
        expect(tree.filter((line) => line.includes(`"People"`))).toEqual([`  heading "People"`]);
        expect(seen.report).toContain(`gridcell "Blackie"`);
      });
    },
    LOOK_TIMEOUT_MS,
  );

  it(
    "reports a path that is not in the workspace as one line, and a missing asset as one error",
    async () => {
      await looker("missing", { "index.html": `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="gone.css"><h1>Bare</h1>` }, async (eyes) => {
        const failed = await eyes.look({ path: "/workspace/nowhere.html" }).catch((error: unknown) => error);
        expect(failed).toBeInstanceOf(LookError);
        expect((failed as LookError).message).toBe("no such path in the workspace: /workspace/nowhere.html");
        expect((failed as LookError).message.split("\n")).toHaveLength(1);
        // It never asked for a browser: the path is checked before the session is opened.
        expect(eyes.session.id()).toBeUndefined();

        const seen = await eyes.look({ path: "/workspace/index.html" });
        expect(seen.seen.errors.filter((line) => line.includes("gone.css"))).toEqual(["404 /gone.css"]);
      });
    },
    LOOK_TIMEOUT_MS,
  );
});

describe("end phase 0: the session's close", () => {
  it(
    "close() closes the kept browser by its id and forgets the row, so a connect by that id is refused after; a close with no row is a no-op; the next look launches anew",
    async () => {
      await looker("closing", FIXTURE, async (eyes) => {
        // No row yet: nothing to close, nothing launched.
        await eyes.session.close();
        expect(eyes.session.id()).toBeUndefined();

        await eyes.look({ path: "/workspace/index.html" });
        const kept = eyes.session.id();
        expect(kept).toBeTypeOf("string");
        // Warm: the kept id answers a connect.
        await (await puppeteer.connect(env.BROWSER!, kept!)).disconnect();

        await eyes.session.close();
        expect(eyes.session.id()).toBeUndefined();
        await expect(puppeteer.connect(env.BROWSER!, kept!)).rejects.toThrow();
        // Again, with no row: a no-op.
        await eyes.session.close();
        expect(eyes.session.id()).toBeUndefined();

        // A look after the close has no session to connect to and launches another, which the row then names.
        await eyes.look({ path: "/workspace/index.html" });
        expect(eyes.session.id()).toBeTypeOf("string");
        expect(eyes.session.id()).not.toBe(kept);
      });
    },
    LOOK_TIMEOUT_MS,
  );
});

describe("a home with no eyes", () => {
  it("builds no Eyes, in the one place that decides", async () => {
    const session = await born("blind");
    await inCell(session.id, async (cell, sql) => {
      expect(eyesFor(env, cell.files, sql)).toBeInstanceOf(Eyes);
      expect(eyesFor({ ...env, BROWSER: undefined }, cell.files, sql)).toBeUndefined();
    });
  });
});
