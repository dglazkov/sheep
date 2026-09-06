/**
 * pen phase 1: a workspace of a hundred files round-trips through the
 * fake container, and the rows stay whole at every point the container
 * could die. Every expected value is the test's own arithmetic over a
 * generated fixture; nothing is a snapshot of what the code produced.
 */
import type { ManifestEntry } from "@sheep/pen/protocol";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Checkout, CheckoutInterrupted } from "../src/pen/checkout.ts";
import { CHUNK_BYTES, FilesTable, MAX_FILE_BYTES, WORKSPACE_ROOT } from "../src/workspace/files.ts";
import { type FakeContainer, type MemoryDisk, memoryDisk, startFakeContainer, type TranscriptEntry } from "./fake-container.ts";

// ---------------------------------------------------------------------------
// The fixture: a hundred files, made the same way every time.

type Entry =
  | { kind: "file"; bytes: Uint8Array; mode: number }
  | { kind: "directory"; mode: number }
  | { kind: "symlink"; target: string };

type Tree = Map<string, Entry>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function textOf(random: () => number, lines: number, tag: string): Uint8Array {
  const words = ["sheep", "pen", "cell", "row", "hash", "blob", "sync", "container", "checkout", "manifest"];
  let text = `// ${tag}\n`;
  for (let line = 0; line < lines; line++) {
    const count = 3 + Math.floor(random() * 8);
    const chosen: string[] = [];
    for (let index = 0; index < count; index++) chosen.push(words[Math.floor(random() * words.length)]!);
    text += `${chosen.join(" ")}\n`;
  }
  return encoder.encode(text);
}

function bytesOf(random: () => number, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) bytes[index] = Math.floor(random() * 256);
  return bytes;
}

/** Fills a big buffer from a cheap generator so an 8 MiB file does not cost 8 million PRNG calls. */
function patternOf(seed: number, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let value = seed;
  for (let index = 0; index < length; index++) {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    bytes[index] = value >>> 16;
  }
  return bytes;
}

/** The two big files, made once: the walk runs the script a few hundred times. */
const BIG_AFTER = patternOf(11, CHUNK_BYTES * 2 + 1);
const HUGE = patternOf(3, MAX_FILE_BYTES + 1);

function addDirectories(tree: Tree, path: string): void {
  const parts = path.split("/");
  for (let depth = 1; depth < parts.length; depth++) {
    const dir = parts.slice(0, depth).join("/");
    if (!tree.has(dir)) tree.set(dir, { kind: "directory", mode: 0o755 });
  }
}

function putFile(tree: Tree, path: string, bytes: Uint8Array, mode = 0o644): void {
  addDirectories(tree, path);
  tree.set(path, { kind: "file", bytes, mode });
}

/** A hundred files in nested directories, two symlinks, one file over a chunk, one executable, and a `.gitignore`. */
function generateWorkspace(): Tree {
  const random = mulberry32(20260905);
  const tree: Tree = new Map();
  const plan: Array<[string, number]> = [
    ["src", 27],
    ["src/lib", 20],
    ["src/lib/deep", 10],
    ["docs", 15],
    ["docs/old", 2],
    ["test", 15],
    ["assets", 8],
  ];
  for (const [dir, count] of plan) {
    for (let index = 0; index < count; index++) {
      const name = `${dir}/${dir === "assets" ? `image${index}.bin` : `file${String(index).padStart(2, "0")}.${dir.startsWith("src") ? "ts" : dir.startsWith("test") ? "test.ts" : "md"}`}`;
      const content = dir === "assets" ? bytesOf(random, 64 + Math.floor(random() * 512)) : textOf(random, 2 + Math.floor(random() * 40), name);
      putFile(tree, name, content);
    }
  }
  putFile(tree, "bin/run.sh", encoder.encode("#!/bin/sh\necho run\n"), 0o755);
  putFile(tree, "big.bin", patternOf(7, CHUNK_BYTES + 4096));
  putFile(tree, ".gitignore", encoder.encode("dist/\n*.log\n"));
  tree.set("empty", { kind: "directory", mode: 0o700 });
  tree.set("src/index.ts", { kind: "symlink", target: "file00.ts" });
  tree.set("docs/latest", { kind: "symlink", target: "../docs/file00.md" });
  return tree;
}

/** The container's edits: ten files changed, eleven added, ten deleted, and a mode and a link retargeted. */
function applyScript(tree: Tree, disk: MemoryDisk): void {
  const random = mulberry32(42);
  const files = [...tree.keys()].filter((path) => tree.get(path)!.kind === "file" && path !== ".gitignore" && path !== "big.bin").sort();
  const edited = files.filter((_path, index) => index % 9 === 0).slice(0, 9);
  edited.push("big.bin");
  for (const path of edited) {
    const entry = tree.get(path) as Extract<Entry, { kind: "file" }>;
    const bytes = path === "big.bin" ? BIG_AFTER : new Uint8Array([...entry.bytes, ...encoder.encode(`// edited ${path}\n`)]);
    tree.set(path, { kind: "file", bytes, mode: entry.mode });
    disk.putFile(path, bytes, entry.mode);
  }
  const deleted = ["docs/old/file00.md", "docs/old/file01.md", ...files.filter((path) => path.startsWith("test/")).slice(0, 8)];
  for (const path of deleted) {
    tree.delete(path);
    disk.delete(path);
  }
  tree.delete("docs/old");
  disk.delete("docs/old");
  const added: Array<[string, Uint8Array]> = [];
  for (let index = 0; index < 6; index++) added.push([`src/new${index}.ts`, textOf(random, 5, `new${index}`)]);
  added.push(["newdir/nested/deep.txt", encoder.encode("deep\n")]);
  for (const [path, bytes] of added) {
    putFile(tree, path, bytes);
    disk.putFile(path, bytes);
  }
  // Over the cap: refused by name, never in the rows.
  disk.putFile("huge.bin", HUGE);
  // The cache rule: built-in, `.gitignore`'s `dist/`, and `*.log`.
  disk.putFile("node_modules/pkg/index.js", encoder.encode("module.exports = 1;\n"));
  disk.putFile("dist/out.js", encoder.encode("built\n"));
  disk.putFile("debug.log", encoder.encode("noise\n"));
  // A mode-only change and a retargeted symlink.
  const script = tree.get("bin/run.sh") as Extract<Entry, { kind: "file" }>;
  tree.set("bin/run.sh", { ...script, mode: 0o644 });
  disk.putFile("bin/run.sh", script.bytes, 0o644);
  tree.set("docs/latest", { kind: "symlink", target: "file01.md" });
  disk.putSymlink("docs/latest", "file01.md");
}

// ---------------------------------------------------------------------------
// Reading the rows and the disk in one shape.

interface Item {
  kind: string;
  mode: number;
  bytes?: Uint8Array;
  target?: string;
}
type Snapshot = Map<string, Item>;

function snapshotTree(tree: Tree): Snapshot {
  const out: Snapshot = new Map();
  for (const [path, entry] of tree) {
    if (entry.kind === "file") out.set(path, { kind: "file", mode: entry.mode, bytes: entry.bytes });
    else if (entry.kind === "directory") out.set(path, { kind: "directory", mode: entry.mode });
    else out.set(path, { kind: "symlink", mode: 0o777, target: entry.target });
  }
  return out;
}

function snapshotRows(files: FilesTable): Snapshot {
  const out: Snapshot = new Map();
  for (const entry of files.manifest()) {
    const absolute = `${WORKSPACE_ROOT}/${entry.path}`;
    if (entry.kind === "file") out.set(entry.path, { kind: "file", mode: entry.mode, bytes: files.readFile(absolute) });
    else if (entry.kind === "directory") out.set(entry.path, { kind: "directory", mode: entry.mode });
    else out.set(entry.path, { kind: "symlink", mode: entry.mode, target: files.readlink(absolute) });
  }
  return out;
}

function snapshotDisk(disk: MemoryDisk): Snapshot {
  const out: Snapshot = new Map();
  for (const [path, entry] of disk.entries) {
    if (entry.kind === "file") out.set(path, { kind: "file", mode: entry.mode, bytes: entry.bytes });
    else if (entry.kind === "directory") out.set(path, { kind: "directory", mode: entry.mode });
    else out.set(path, { kind: "symlink", mode: 0o777, target: entry.target });
  }
  return out;
}

function sameEntry(a: Item, b: Item): boolean {
  if (a.kind !== b.kind || a.mode !== b.mode || a.target !== b.target) return false;
  if (a.bytes === undefined || b.bytes === undefined) return a.bytes === b.bytes;
  if (a.bytes.byteLength !== b.bytes.byteLength) return false;
  for (let index = 0; index < a.bytes.byteLength; index++) if (a.bytes[index] !== b.bytes[index]) return false;
  return true;
}

/** The paths on which two snapshots differ, with a word on how; empty when they are the same tree. */
function differences(actual: Snapshot, expected: Snapshot): string[] {
  const out: string[] = [];
  for (const path of [...new Set([...actual.keys(), ...expected.keys()])].sort()) {
    const a = actual.get(path);
    const e = expected.get(path);
    if (a === undefined) out.push(`${path}: missing`);
    else if (e === undefined) out.push(`${path}: unexpected`);
    else if (!sameEntry(a, e)) out.push(`${path}: ${a.kind} ${a.mode.toString(8)} ${a.bytes?.byteLength ?? a.target} != ${e.kind} ${e.mode.toString(8)} ${e.bytes?.byteLength ?? e.target}`);
  }
  return out;
}

/** An independent SHA-256 over WebCrypto, so hashes are checked against something that is not the code under test. */
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function seedRows(files: FilesTable, tree: Tree): void {
  for (const path of [...tree.keys()].sort()) {
    const entry = tree.get(path)!;
    const absolute = `${WORKSPACE_ROOT}/${path}`;
    if (entry.kind === "directory") files.mkdir(absolute, { recursive: true, mode: entry.mode });
    else if (entry.kind === "file") files.writeFile(absolute, entry.bytes, { createParents: true, mode: entry.mode });
    else files.symlink(entry.target, absolute);
  }
}

// ---------------------------------------------------------------------------
// The script: seed, sync in, edit, sync out.

interface Run {
  transcript: TranscriptEntry[];
  rows: Snapshot;
  disk: Snapshot;
  syncIn: PromiseSettledResult<ManifestEntry[] | undefined>;
  syncOut: PromiseSettledResult<unknown>;
  agentSyncOut: PromiseSettledResult<unknown>;
  timing: { syncInMs: number; syncOutMs: number };
}

const SETTLE_MS = 5_000;

function settle<T>(promise: Promise<T>, what: string): Promise<PromiseSettledResult<T>> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} hung for ${SETTLE_MS} ms`)), SETTLE_MS);
  });
  return Promise.race([promise, timeout])
    .then((value): PromiseSettledResult<T> => ({ status: "fulfilled", value }))
    .catch((reason: unknown): PromiseSettledResult<T> => ({ status: "rejected", reason }))
    .finally(() => clearTimeout(timer));
}

/**
 * Runs the script in the named cell. The cell's tables are dropped first,
 * so a name reused across the kill walk is a fresh set of rows each time
 * without a few hundred Durable Objects' worth of storage staying behind.
 */
async function runScript(name: string, original: Tree, stopAfter?: number): Promise<Run> {
  return runInDurableObject(env.SESSION_CELL.getByName(`checkout:${name}`), async (_instance, state) => {
    state.storage.sql.exec("DROP TABLE IF EXISTS files");
    state.storage.sql.exec("DROP TABLE IF EXISTS file_chunks");
    const files = new FilesTable(state.storage.sql);
    files.init();
    seedRows(files, original);
    const tree: Tree = new Map(original);
    const container: FakeContainer = startFakeContainer({ stopAfter });
    const checkout = new Checkout(container.socket, files);

    const startedIn = performance.now();
    const syncIn = await settle(checkout.syncIn(), "syncIn");
    const syncInMs = performance.now() - startedIn;

    applyScript(tree, container.disk);

    const startedOut = performance.now();
    const cellSide = settle(checkout.syncOut("run-1"), "syncOut");
    const agentSide = settle(container.syncOut("run-1"), "agent syncOut");
    const [syncOut, agentSyncOut] = await Promise.all([cellSide, agentSide]);
    const syncOutMs = performance.now() - startedOut;

    container.stop();
    return {
      transcript: container.transcript,
      rows: snapshotRows(files),
      disk: snapshotDisk(container.disk),
      syncIn,
      syncOut,
      agentSyncOut,
      timing: { syncInMs, syncOutMs },
    };
  });
}

/** What the rows must hold after a full round trip: the script, minus the over-cap file, minus what the cache rule keeps. */
function expectedAfter(original: Tree): Tree {
  const tree: Tree = new Map(original);
  applyScript(tree, memoryDisk());
  return tree;
}

const CACHED = ["node_modules", "node_modules/pkg", "node_modules/pkg/index.js", "dist", "dist/out.js", "debug.log", "huge.bin"];

// ---------------------------------------------------------------------------

describe("the checkout: a hundred files through the fake container", () => {
  const original = generateWorkspace();
  const before = snapshotTree(original);
  const after = snapshotTree(expectedAfter(original));

  it("the fixture is what the phase asks for", () => {
    const files = [...original.values()].filter((entry) => entry.kind === "file");
    expect(files.length).toBe(100);
    expect(files.some((entry) => entry.kind === "file" && entry.bytes.byteLength > CHUNK_BYTES)).toBe(true);
    expect(files.some((entry) => entry.kind === "file" && entry.mode === 0o755)).toBe(true);
    expect([...original.values()].filter((entry) => entry.kind === "symlink").length).toBe(2);
    expect(decoder.decode((original.get(".gitignore") as Extract<Entry, { kind: "file" }>).bytes)).toContain("dist/");
    expect(Math.max(...[...original.keys()].map((path) => path.split("/").length))).toBeGreaterThanOrEqual(4);
  });

  it("syncs in, the fake edits, syncs out: the rows equal the test's own arithmetic, and the cap is refused by name", async () => {
    const run = await runScript("full", original);
    expect(run.syncIn).toEqual({ status: "fulfilled", value: undefined });

    // After sync-in the fake's disk was the rows; the script then changed it. Undo the script's view: compare what sync-out left.
    expect(run.syncOut.status).toBe("fulfilled");
    expect(run.agentSyncOut.status).toBe("fulfilled");
    const refused = (run.syncOut as PromiseFulfilledResult<unknown>).value;
    expect(refused).toEqual([{ path: "huge.bin", size: MAX_FILE_BYTES + 1 }]);
    expect((run.agentSyncOut as PromiseFulfilledResult<unknown>).value).toEqual(refused);

    expect(differences(run.rows, after)).toEqual([]);
    for (const path of CACHED) expect(run.rows.has(path)).toBe(false);
    // The disk still has what the rule keeps and what was refused.
    for (const path of CACHED) expect(run.disk.has(path)).toBe(true);

    // The transcript is the dance as designed: manifest, need, blobs down, checkout; changed, need, blobs up, synced.
    const types = run.transcript.map((entry) => ("frame" in entry ? `${entry.from}:${entry.frame.type}` : `${entry.from}:bytes`));
    expect(types.slice(0, 2)).toEqual(["cell:manifest", "container:need"]);
    expect(types[types.length - 1]).toBe("cell:synced");
    const checkoutAt = types.indexOf("container:checkout");
    expect(types.slice(checkoutAt + 1, checkoutAt + 3)).toEqual(["container:changed", "cell:need"]);
    // Every blob is a frame followed by bytes whose hash is the frame's.
    for (let index = 0; index < run.transcript.length; index++) {
      const entry = run.transcript[index]!;
      if ("frame" in entry && entry.frame.type === "blob") {
        const next = run.transcript[index + 1]!;
        expect("binary" in next && next.binary === entry.frame.hash && next.size === entry.frame.size && next.from === entry.from).toBe(true);
      }
    }
    // Over-cap bytes never moved.
    expect(run.transcript.some((entry) => "binary" in entry && entry.size > MAX_FILE_BYTES)).toBe(false);
    console.log(`checkout timing: sync-in ${run.timing.syncInMs.toFixed(1)} ms, sync-out ${run.timing.syncOutMs.toFixed(1)} ms, ${run.transcript.length} frames`);
  });

  it("after sync-in the fake's disk equals the rows, hashes checked against WebCrypto; a second sync-in needs nothing", async () => {
    await runInDurableObject(env.SESSION_CELL.getByName("checkout:sync-in"), async (_instance, state) => {
      const files = new FilesTable(state.storage.sql);
      files.init();
      seedRows(files, original);
      for (const entry of files.manifest()) {
        if (entry.kind === "directory") continue;
        const absolute = `${WORKSPACE_ROOT}/${entry.path}`;
        const bytes = entry.kind === "file" ? files.readFile(absolute) : encoder.encode(files.readlink(absolute));
        expect(entry.hash).toBe(await sha256(bytes));
      }
      const container = startFakeContainer();
      // Something already on the disk that the manifest does not name goes; the cache stays.
      container.disk.putFile("stale.txt", "gone after sync-in\n");
      container.disk.putFile("node_modules/left/index.js", "kept\n");
      container.disk.putFile("dist/kept.js", "kept by .gitignore once it lands\n");
      const checkout = new Checkout(container.socket, files);
      await checkout.syncIn();
      const disk = snapshotDisk(container.disk);
      expect(disk.has("stale.txt")).toBe(false);
      expect(disk.has("node_modules/left/index.js")).toBe(true);
      expect(disk.has("dist/kept.js")).toBe(true);
      for (const path of ["node_modules", "node_modules/left", "node_modules/left/index.js", "dist", "dist/kept.js"]) disk.delete(path);
      expect(differences(disk, before)).toEqual([]);

      // Nothing changed: the second manifest costs one frame each way and one `checkout`.
      const frames = container.transcript.length;
      await checkout.syncIn();
      const second = container.transcript.slice(frames);
      expect(second.map((entry) => ("frame" in entry ? `${entry.from}:${entry.frame.type}` : "bytes"))).toEqual(["cell:manifest", "container:need", "container:checkout"]);
      expect("frame" in second[1]! && second[1].frame.type === "need" ? second[1].frame.hashes : null).toEqual([]);

      // A deletion and an edit in the rows reach the disk; a mode change too.
      files.rm(`${WORKSPACE_ROOT}/docs/file03.md`);
      files.writeFile(`${WORKSPACE_ROOT}/src/file01.ts`, "rewritten\n");
      files.chmod(`${WORKSPACE_ROOT}/src/file02.ts`, 0o755);
      await checkout.syncIn();
      expect(snapshotDisk(container.disk).get("docs/file03.md")).toBeUndefined();
      expect(decoder.decode(container.disk.entries.get("src/file01.ts")!.kind === "file" ? (container.disk.entries.get("src/file01.ts") as { bytes: Uint8Array }).bytes : new Uint8Array())).toBe("rewritten\n");
      expect(container.disk.entries.get("src/file02.ts")!.mode).toBe(0o755);
      container.stop();
    });
  });

  it("a blob whose bytes are not its hash fails the sync and writes no row", async () => {
    await runInDurableObject(env.SESSION_CELL.getByName("checkout:mismatch"), async (_instance, state) => {
      const files = new FilesTable(state.storage.sql);
      files.init();
      files.writeFile(`${WORKSPACE_ROOT}/a.txt`, "before\n");
      const container = startFakeContainer();
      const checkout = new Checkout(container.socket, files);
      await checkout.syncIn();
      // A liar in the container's place: announces a hash and sends other bytes.
      const lying = new WebSocketPair();
      lying[0].accept();
      lying[1].accept();
      const liarCheckout = new Checkout(lying[0], files);
      const outcome = liarCheckout.syncOut("lie");
      const wrongHash = await sha256(encoder.encode("what it claims\n"));
      lying[1].send(JSON.stringify({ type: "changed", id: "lie", entries: [{ path: "a.txt", kind: "file", mode: 0o644, hash: wrongHash, size: 15 }], deleted: [] }));
      lying[1].send(JSON.stringify({ type: "blob", hash: wrongHash, size: 15 }));
      lying[1].send(encoder.encode("what it sends!\n"));
      await expect(outcome).rejects.toThrow(/hashes to/);
      expect(files.readText(`${WORKSPACE_ROOT}/a.txt`)).toBe("before\n");
      container.stop();
    });
  });

  it("the kill walk: at every frame of the round trip, the rows are whole and the transcript is the same prefix", async () => {
    const full = await runScript("walk-full", original);
    expect(full.syncOut.status).toBe("fulfilled");
    const positions = full.transcript.length;
    const started = performance.now();
    let interruptedIn = 0;
    let interruptedOut = 0;
    for (let position = 1; position <= positions; position++) {
      if (position % 50 === 0) console.log(`kill walk: position ${position} of ${positions} at ${((performance.now() - started) / 1000).toFixed(1)} s`);
      const run = await runScript("walk", original, position);
      // (c) the transcript up to the kill is the full run's prefix.
      expect(run.transcript.length, `position ${position}`).toBe(position);
      expect(run.transcript).toEqual(full.transcript.slice(0, position));
      // (a) nothing hangs: every promise settled, as success or as an interruption.
      for (const [what, outcome] of [["syncIn", run.syncIn], ["syncOut", run.syncOut], ["agent syncOut", run.agentSyncOut]] as const) {
        if (outcome.status === "rejected") {
          expect(String((outcome.reason as Error).message), `${what} at ${position}`).not.toMatch(/hung/);
        }
      }
      if (run.syncIn.status === "rejected") {
        expect(run.syncIn.reason, `syncIn at ${position}`).toBeInstanceOf(CheckoutInterrupted);
        interruptedIn++;
      }
      if (run.syncOut.status === "rejected") {
        expect(run.syncOut.reason, `syncOut at ${position}`).toBeInstanceOf(CheckoutInterrupted);
        interruptedOut++;
      } else {
        expect(run.syncOut.value, `syncOut at ${position}`).toEqual([{ path: "huge.bin", size: MAX_FILE_BYTES + 1 }]);
        expect(differences(run.rows, after), `rows after a completed sync-out at ${position}`).toEqual([]);
      }
      if (run.syncIn.status === "rejected") expect(differences(run.rows, before), `rows after an interrupted sync-in at ${position}`).toEqual([]);
      // (b) every row is its before or its after, never a mix, and nothing else is there.
      const paths = new Set([...before.keys(), ...after.keys(), ...run.rows.keys()]);
      for (const path of paths) {
        const row = run.rows.get(path);
        const was = before.get(path);
        const will = after.get(path);
        if (row === undefined) {
          expect(was === undefined || will === undefined, `${path} vanished at ${position}`).toBe(true);
          continue;
        }
        const isBefore = was !== undefined && sameEntry(row, was);
        const isAfter = will !== undefined && sameEntry(row, will);
        expect(isBefore || isAfter, `${path} at ${position} is neither before nor after`).toBe(true);
      }
    }
    const elapsed = performance.now() - started;
    console.log(`kill walk: ${positions} positions in ${(elapsed / 1000).toFixed(1)} s; sync-in interrupted at ${interruptedIn}, sync-out at ${interruptedOut}`);
    expect(interruptedIn).toBeGreaterThan(0);
    expect(interruptedOut).toBeGreaterThan(0);
  }, 600_000);
});
