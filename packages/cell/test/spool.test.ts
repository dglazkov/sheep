/**
 * Spool phase 0: the record in slices, both ways. Journey 1 steps 1 to 4 and
 * journey 2 steps 1 to 4 in the cell's terms, in workerd, against the fake
 * container, whose `/cache` is the memory disk with the handles the agent's
 * `Disk` now names.
 *
 * The peak is the proof, and no test in workerd can read the agent's memory,
 * so what stands in for it here is a disk that will not pass a whole file:
 * `read` and `write` throw for anything over a chunk, and the handles are
 * the only way in or out. A record whose largest file is many chunks is made
 * and put back over that disk — every path the record has, the later name of
 * a hard-linked pair included — which fails the moment one of them holds a
 * file whole. Beside it, the same tree through a disk with no handles at all
 * makes the same record, chunk hash for chunk hash, so nothing about a
 * record's identity depends on how it was carried.
 *
 * Journey 2 is the other half: the cap is asked of the listing's size before
 * anything is opened, so a `/cache` that cannot be kept costs no reading at
 * all. The memory disk counts what it was asked for (`reads`, `bytesRead`),
 * and the count after the refusal is zero; setup's result is unchanged, the
 * pasture keeps the cache it had, and the container answers the next frame.
 * A file that changes length under the writer is a `RecordError`, which
 * `keep()` settles as a refusal with the turn unharmed.
 *
 * And a put-back that is dropped closes what it opened: the disk says how
 * many handles are open on it (`openHandles`), and after each of the three
 * ways a put-back can be dropped mid-file — a chunk the container cannot
 * use, a chunk the pasture no longer has, and a frame the sync cannot take
 * — the count is zero and `/cache` is empty. On a `Map` an unclosed handle
 * is nothing; on the real disk spool phase 1 gives it, it is the file's
 * blocks held behind a descriptor in a process that is PID 1.
 */
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { Chunker, type Disk, gzipBytes, RecordReader, writeRecord } from "@sheep/pen/agent";
import { CACHE_CHUNK_BYTES, type ContainerFrame, encodeFrame, type Frame, recordHashInput } from "@sheep/pen/protocol";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pastureSourceFor } from "../src/cell.ts";
import { CellExecutionEnv, type ContainerLease, SETUP_COMMAND, SETUP_PATH } from "../src/env/execution-env.ts";
import type { Pasture } from "../src/pasture.ts";
import { overCapRefusal, setupName } from "../src/pen/cache.ts";
import { hashBytes } from "../src/workspace/files.ts";
import { type FakeContainer, type MemoryDisk, memoryDisk, type ScriptFor, startFakeContainer, type TranscriptEntry } from "./fake-container.ts";

const context = BACKGROUND_CONTEXT;
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
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
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const encode = (text: string): Uint8Array => encoder.encode(text);

/** Bytes that repeat, so gzip takes a chunk of them to almost nothing and a record of several fits a test isolate. */
function repeating(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index++) bytes[index] = index % 251;
  return bytes;
}

/**
 * A binary of several chunks, as a browser bundle or a toolchain's largest
 * file is: the thing this project is about, and larger than any buffer the
 * record is allowed to allocate. `SMALLER` is one chunk and a bit, for the
 * cases that make the same tree three times over and must fit beside it.
 */
const ENGINE = repeating(2 * CACHE_CHUNK_BYTES + 4096);
const SMALLER = repeating(CACHE_CHUNK_BYTES + 4096);
const CLI = '#!/usr/bin/env node\nconsole.log("tool 1.2.3");\n';
/** The cap as the station has it, for the cases that are not about the cap. */
const CACHE_MAX = 1024 * 1024 * 1024;

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The disks a proof needs: one that refuses a whole file, one with no handles
// at all, one whose listing says no size, and one whose file moves underfoot.

/**
 * A disk that will not pass a whole file: `read` and `write` throw for
 * anything over a chunk, and the handles are the only way in or out. This is
 * the peak as far as a test in workerd can see it — a record that still takes
 * a file whole anywhere cannot be made or put back over this disk.
 */
function slicesOnly(disk: MemoryDisk): Disk {
  return {
    ...disk,
    async read(path) {
      const entry = disk.entries.get(path);
      if (entry?.kind === "file" && entry.bytes.byteLength > CACHE_CHUNK_BYTES) {
        throw new Error(`read of ${path} took a whole file: ${entry.bytes.byteLength} bytes`);
      }
      return disk.read(path);
    },
    async write(path, bytes, options) {
      if (bytes.byteLength > CACHE_CHUNK_BYTES) throw new Error(`write of ${path} took a whole file: ${bytes.byteLength} bytes`);
      return disk.write(path, bytes, options);
    },
  };
}

/** The same disk with neither handle: what `record.ts` falls back to, and the shape fold shipped. */
function withoutHandles(disk: Disk): Disk {
  const { openRead: _openRead, openWrite: _openWrite, ...rest } = disk;
  return rest;
}

/** A disk that says two paths are one file, as an inode does on a real one. */
function sharing(disk: Disk, paths: string[], id = "7:4242"): Disk {
  return {
    ...disk,
    async list() {
      return (await disk.list()).map((entry) => (paths.includes(entry.path) ? { ...entry, file: id } : entry));
    },
  };
}

/** A disk whose listing gives no size, as one that cannot stat would: the record counts the file as its slices arrive. */
function withoutSizes(disk: Disk): Disk {
  return {
    ...disk,
    async list() {
      return (await disk.list()).map(({ size: _size, ...rest }) => rest);
    },
  };
}

/** A `/cache` whose largest file is cut short the moment the record starts reading it: setup still writing when the save began. */
function shrinking(disk: MemoryDisk): MemoryDisk {
  return {
    ...disk,
    get entries() {
      return disk.entries;
    },
    get writes() {
      return disk.writes;
    },
    get reads() {
      return disk.reads;
    },
    get bytesRead() {
      return disk.bytesRead;
    },
    get openHandles() {
      return disk.openHandles;
    },
    async openRead(path) {
      const handle = await disk.openRead!(path);
      let cut = false;
      return {
        async read(length) {
          const slice = await handle.read(length);
          if (!cut && slice.byteLength >= CACHE_CHUNK_BYTES) {
            cut = true;
            disk.putFile(path, ENGINE.subarray(0, 4096), 0o755);
          }
          return slice;
        },
        close: () => handle.close(),
      };
    },
  };
}

/** A disk's entries as a comparison reads them: kind, mode, and the bytes or the target. */
function entriesOf(disk: MemoryDisk): string[] {
  return [...disk.entries]
    .map(([path, entry]) => `${path} ${entry.kind} ${entry.mode.toString(8)} ${entry.kind === "file" ? hashBytes(entry.bytes) : entry.kind === "symlink" ? entry.target : "-"}`)
    .sort();
}

/**
 * The tree a record is made of here: a binary of several chunks under two
 * names (one file, as npm leaves an install's largest), an executable, a
 * read-only directory, a file nobody else may read, an empty file, and a
 * symlink.
 */
const SHARED = ["lib/engine/bin/engine", "lib/tool/vendor/engine.bin"];

function installTree(disk: MemoryDisk, engine: Uint8Array = ENGINE): void {
  disk.putFile("lib/engine/bin/engine", engine, 0o755);
  disk.putFile("lib/tool/vendor/engine.bin", engine, 0o755);
  disk.putFile("lib/tool/cli.js", CLI, 0o755);
  disk.putFile("lib/tool/package.json", '{"name":"tool","version":"1.2.3"}\n');
  disk.putFile("lib/tool/.keep", "");
  disk.putDirectory("etc", 0o555);
  disk.putFile("etc/npmrc", "fund=false\n", 0o600);
  disk.putDirectory("share/man", 0o750);
  disk.putSymlink("bin/tool", "../lib/tool/cli.js");
}

/**
 * The disk as a record and straight back onto another, holding one chunk: the
 * record never exists whole on either side, or in the test. What comes back is
 * the chunk hashes it was cut into and what each side counted.
 */
async function through(from: Disk, to: Disk): Promise<{ chunks: string[]; files: number; bytes: number; written: { files: number; bytes: number } }> {
  const reader = new RecordReader(to);
  const chunks: string[] = [];
  const chunker = new Chunker(CACHE_CHUNK_BYTES, async (chunk) => {
    chunks.push(hashBytes(chunk));
    await reader.push(chunk);
  });
  const count = await writeRecord(from, (bytes) => chunker.push(bytes));
  await chunker.end();
  const written = await reader.end();
  return { chunks, files: count.files, bytes: count.bytes, written };
}

describe("spool phase 0: the record in slices", () => {
  it("journey 1: a record whose largest file is many chunks, made and put back through a disk that refuses a whole file, modes and links and all", async () => {
    const tree = memoryDisk();
    installTree(tree);
    const onto = memoryDisk();
    // Both sides refuse a whole file: the record's only way through is a slice at a time.
    const made = await through(sharing(slicesOnly(tree), SHARED), slicesOnly(onto));

    // The largest file is many chunks, and the record is larger still.
    expect(ENGINE.byteLength).toBeGreaterThan(2 * CACHE_CHUNK_BYTES);
    expect(made.chunks.length).toBeGreaterThanOrEqual(3);
    expect(made.bytes).toBeGreaterThan(ENGINE.byteLength);
    // The bytes once: the second name is a link, so the record carries the binary a single time.
    expect(made.bytes).toBeLessThan(2 * ENGINE.byteLength);
    expect(made.files).toBe(6);
    expect(made.written).toEqual({ files: made.files, bytes: made.bytes });

    // The tree came back whole: every path, every mode, the symlink's target, and the binary under both its names.
    expect(entriesOf(onto)).toEqual(entriesOf(tree));
    expect(onto.entries.get("etc")?.mode).toBe(0o555);
    expect(onto.entries.get("etc/npmrc")?.mode).toBe(0o600);
    expect(onto.entries.get("share/man")?.mode).toBe(0o750);
    expect(onto.entries.get("bin/tool")).toEqual({ kind: "symlink", target: "../lib/tool/cli.js", mode: 0o777 });
    for (const path of SHARED) {
      const landed = onto.entries.get(path) as { kind: string; bytes: Uint8Array; mode: number };
      expect(landed.kind).toBe("file");
      // An executable is executable, and a file with two names is the same file under both.
      expect(landed.mode).toBe(0o755);
      expect(hashBytes(landed.bytes)).toBe(hashBytes(ENGINE));
    }
    expect((onto.entries.get("lib/tool/cli.js") as { mode: number }).mode).toBe(0o755);
    expect((onto.entries.get("lib/tool/.keep") as { bytes: Uint8Array }).bytes.byteLength).toBe(0);
  });

  it("journey 1: a disk with no handles at all makes the same record, chunk for chunk, and puts back the same tree", async () => {
    const tree = memoryDisk();
    installTree(tree, SMALLER);
    const streamed = await through(sharing(slicesOnly(tree), SHARED), slicesOnly(memoryDisk()));
    expect(streamed.chunks.length).toBeGreaterThanOrEqual(2);

    // The same tree over a disk that can only take a file whole: the fallback `read` and `write`, as fold shipped them.
    const onto = memoryDisk();
    const fallback = await through(withoutHandles(sharing(tree, SHARED)), withoutHandles(onto));
    expect(fallback.chunks).toEqual(streamed.chunks);
    expect(fallback.bytes).toBe(streamed.bytes);
    expect(fallback.files).toBe(streamed.files);
    expect(entriesOf(onto)).toEqual(entriesOf(tree));

    // And a record made the old way is put back the new: the carrying is not in the bytes.
    const crossed = memoryDisk();
    const reader = new RecordReader(slicesOnly(crossed));
    const chunker = new Chunker(CACHE_CHUNK_BYTES, (chunk) => reader.push(chunk));
    await writeRecord(withoutHandles(sharing(tree, SHARED)), (bytes) => chunker.push(bytes));
    await chunker.end();
    expect(await reader.end()).toEqual({ files: streamed.files, bytes: streamed.bytes });
    expect(entriesOf(crossed)).toEqual(entriesOf(tree));
  });

  it("journey 2: the cap is asked of the listing before anything is opened, and of the slices when the listing says no size", async () => {
    const sink = async () => {};
    const cache = memoryDisk();
    cache.putFile("lib/engine.bin", ENGINE, 0o755);
    cache.putSymlink("bin/tool", "../lib/engine.bin");

    // Under the cap: the whole record is written, and the file was read in slices rather than taken whole.
    const whole = await writeRecord(cache, sink, { max: CACHE_MAX });
    expect(whole.over).toBe(false);
    expect(cache.bytesRead).toBe(ENGINE.byteLength);

    // Over it: refused at the file's header, with not one byte of it read. `bin/tool` before it is a symlink, whose target
    // is read with `readlink`, so this count is the whole of what the writer asked the disk for.
    const capped = memoryDisk();
    capped.putFile("lib/engine.bin", ENGINE, 0o755);
    capped.putSymlink("bin/tool", "../lib/engine.bin");
    const over = await writeRecord(capped, sink, { max: CACHE_CHUNK_BYTES });
    expect(over.over).toBe(true);
    expect(over.bytes).toBeGreaterThan(CACHE_CHUNK_BYTES);
    expect(capped.reads).toBe(0);
    expect(capped.bytesRead).toBe(0);

    // A listing that says no size: the file is counted as its slices arrive, and the refusal comes at the slice that
    // crosses, so what was read is the slices up to it and never the file.
    const unsized = memoryDisk();
    unsized.putFile("lib/engine.bin", ENGINE, 0o755);
    const counted = await writeRecord(withoutSizes(unsized), sink, { max: CACHE_CHUNK_BYTES + 1024 });
    expect(counted.over).toBe(true);
    expect(unsized.bytesRead).toBe(2 * CACHE_CHUNK_BYTES);
    expect(unsized.bytesRead).toBeLessThan(ENGINE.byteLength);

    // Under the cap, that listing makes the same record as one that gives a size: counting it changed nothing.
    const sized = memoryDisk();
    sized.putFile("lib/engine.bin", SMALLER, 0o755);
    expect(await through(withoutSizes(sized), memoryDisk())).toEqual(await through(sized, memoryDisk()));
  });

  it("a file that changes length under the writer is a RecordError, whichever way it changed", async () => {
    // Shorter: the reading handle runs out before the header's size, and the save is refused rather than committed.
    const shrank = memoryDisk();
    shrank.putFile("lib/engine.bin", ENGINE, 0o755);
    let cut = false;
    await expect(
      writeRecord(shrank, async (bytes) => {
        if (cut || bytes.byteLength < CACHE_CHUNK_BYTES) return;
        cut = true;
        shrank.putFile("lib/engine.bin", ENGINE.subarray(0, 4096), 0o755);
      }),
    ).rejects.toThrow(`a record's file lib/engine.bin is ${CACHE_CHUNK_BYTES} bytes, not the ${ENGINE.byteLength} bytes its listing said`);

    // Longer: the file ends where its header said and there is more of it, which is the same lie the other way round.
    const grew = memoryDisk();
    grew.putFile("etc/npmrc", "fund=false\n", 0o600);
    let grown = false;
    await expect(
      writeRecord(grew, async (bytes) => {
        if (grown || !decoder.decode(bytes).startsWith("fund=false")) return;
        grown = true;
        grew.putFile("etc/npmrc", "fund=false\nregistry=elsewhere\n", 0o600);
      }),
    ).rejects.toThrow("a record's file etc/npmrc is longer, not the 11 bytes its listing said");
  });
});

// ---------------------------------------------------------------------------
// The cell over the fake container: an env over a lease the test holds, as
// fold's cap case has it.

const TOOL = "tool --version";
const SETUP_SCRIPT = "#!/bin/sh\nset -e\ncommand -v tool >/dev/null || install-the-tool\n";

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function pasture(name: string): Promise<DurableObjectStub<Pasture>> {
  expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name }) })).status).toBe(201);
  return env.PASTURE.getByName(name);
}

/** Every line written to the console from here to the test's end; the cells log into this isolate. */
function logLines(): () => string[] {
  const spies = (["debug", "log", "info", "warn", "error"] as const).map((level) => vi.spyOn(console, level));
  return () => spies.flatMap((spy) => spy.mock.calls.map((args) => args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" ")));
}

/** The issue's `setup.sh` as the fake plays it: a tool whose largest file is several chunks, installed into `/cache` when it is not there. */
function toolScript(): ScriptFor {
  return (request) => {
    const command = request.command.trim();
    if (command === SETUP_COMMAND) {
      return {
        steps: [
          {
            act: (_disk, _home, cache) => {
              if (cache.entries.get("lib/tool/cli.js") !== undefined) return;
              cache.putFile("lib/engine.bin", ENGINE, 0o755);
              cache.putFile("lib/tool/cli.js", CLI, 0o755);
              cache.putSymlink("bin/tool", "../lib/tool/cli.js");
            },
          },
        ],
        exit: 0,
      };
    }
    if (command === TOOL) return { steps: [{ stdout: "tool 1.2.3\n" }], exit: 0 };
    return undefined;
  };
}

interface Rig {
  lease: ContainerLease;
  containers: FakeContainer[];
}

/** A home with one container, which every `rent()` gives back. */
function rig(options: { cache?: MemoryDisk } = {}): Rig {
  const r: Rig = {
    containers: [],
    lease: {
      async rent() {
        const last = r.containers.at(-1);
        if (last !== undefined) return last.socket;
        const container = startFakeContainer({ script: toolScript(), ...(options.cache === undefined ? {} : { cache: options.cache }) });
        r.containers.push(container);
        return container.socket;
      },
      idle() {},
    },
  };
  return r;
}

/** A cell's env over the rig, with the pasture as boot builds it. */
function inEnv<T>(name: string, r: Rig, body: (cell: CellExecutionEnv) => Promise<T>, options: { cacheMaxBytes?: number } = {}): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`spool:${name}`), (_instance, state) => {
    state.storage.sql.exec("DROP TABLE IF EXISTS files");
    state.storage.sql.exec("DROP TABLE IF EXISTS file_chunks");
    // A stub made outside a Durable Object cannot be used inside it: the object is reached through one made here.
    const object = env.PASTURE.getByName(name);
    const cell = new CellExecutionEnv(state.storage.sql, {
      container: r.lease,
      pasture: pastureSourceFor(object, { secrets: async () => ({}) }, `sheep-${name}`),
      ...(options.cacheMaxBytes === undefined ? {} : { cacheMaxBytes: options.cacheMaxBytes }),
    });
    return body(cell);
  });
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

async function run(cell: CellExecutionEnv, command: string): Promise<string> {
  return text(await bashTool.execute("b", { command }, () => {}, { env: cell }, invocation, context));
}

function ofType<T extends Frame["type"]>(transcript: TranscriptEntry[], type: T, from?: "cell" | "container"): Array<Extract<Frame, { type: T }>> {
  return transcript
    .filter((entry): entry is Extract<TranscriptEntry, { frame: unknown }> => "frame" in entry)
    .filter((entry) => entry.frame.type === type && (from === undefined || entry.from === from))
    .map((entry) => entry.frame as Extract<Frame, { type: T }>);
}

/** The container's descriptions of `/cache`, which are the `cache` frames it sent. */
function descriptions(transcript: TranscriptEntry[]): Array<Extract<ContainerFrame, { type: "cache" }>> {
  return ofType(transcript, "cache", "container") as Array<Extract<ContainerFrame, { type: "cache" }>>;
}

/** The object's chunk rows, by a `SELECT` of the test's own. */
function chunkHashes(name: string): Promise<string[]> {
  return runInDurableObject(env.PASTURE.getByName(name), (_object, state) => state.storage.sql.exec<{ hash: string }>("SELECT hash FROM cache_sizes ORDER BY hash").toArray().map((row) => row.hash));
}

/** Waits for something the agent does on its own chain; the fake's transcript is what a test watches it through. */
async function until(ready: () => boolean, what: string, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`waited ${ms} ms for ${what}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

/** The record a put-back is cut off in the middle of: one file of more than a chunk, so its second chunk lands mid-file. */
let record: { chunks: Uint8Array[]; hashes: string[]; ref: { hash: string; chunks: string[] } } | undefined;

async function recordOfOneBigFile(): Promise<NonNullable<typeof record>> {
  if (record !== undefined) return record;
  const source = memoryDisk();
  source.putFile("lib/engine.bin", SMALLER, 0o755);
  const chunks: Uint8Array[] = [];
  const chunker = new Chunker(CACHE_CHUNK_BYTES, async (chunk) => {
    chunks.push(chunk);
  });
  await writeRecord(source, (bytes) => chunker.push(bytes));
  await chunker.end();
  const hashes = chunks.map(hashBytes);
  record = { chunks, hashes, ref: { hash: hashBytes(encode(recordHashInput(hashes))), chunks: hashes } };
  return record;
}

/**
 * A fake container in the middle of a put-back: the manifest carries the
 * cache, the first chunk has landed, and the file the record is writing is
 * open on `/cache`. What each case does next is drop the put-back a
 * different way.
 */
async function midFile(): Promise<{ fake: FakeContainer; socket: WebSocket; hashes: string[] }> {
  const { chunks, hashes, ref } = await recordOfOneBigFile();
  expect(hashes.length).toBe(2);
  const fake = startFakeContainer();
  const socket = fake.socket;
  // A sync-in carrying the cache and no files: the put-back begins as soon as the manifest is answered.
  socket.send(encodeFrame({ type: "manifest", id: "sync-1", entries: [], cache: ref }));
  await until(() => ofType(fake.transcript, "need", "container").length >= 2, "the put-back's need");
  expect(ofType(fake.transcript, "need", "container")[1]!.hashes).toEqual(hashes);
  const first = await gzipBytes(chunks[0]!);
  socket.send(encodeFrame({ type: "blob", hash: hashes[0]!, size: first.byteLength }));
  socket.send(first);
  await until(() => fake.cache.entries.has("lib/engine.bin"), "the file the record is writing");
  // The record is in the middle of the file, and the disk is holding a handle on it.
  expect(fake.cache.openHandles).toBe(1);
  return { fake, socket, hashes };
}

/** What every one of these cases ends with, once the container has said its piece: `/cache` empty and meaning it, with no descriptor left on what was unlinked. */
async function emptyAndClosed(fake: FakeContainer, said: () => boolean, what: string): Promise<void> {
  await until(said, what);
  expect(fake.cache.openHandles).toBe(0);
  expect([...fake.cache.entries.keys()]).toEqual([]);
  fake.stop("the test is over");
}

/** The container said the sync-in is over, whole: a `checkout` frame under its id. */
const ended = (fake: FakeContainer) => () => ofType(fake.transcript, "checkout", "container").length >= 1;
/** The container reported instead: the catch that ends a sync-in and the put-back inside it. */
const reported = (fake: FakeContainer) => () => ofType(fake.transcript, "error", "container").length >= 1;

describe("spool phase 0: a put-back that is dropped closes what it opened", () => {
  it("a chunk the container cannot use ends the put-back mid-file, and the handle on the file is closed before /cache is emptied", { timeout: 60_000 }, async () => {
    const { fake, socket, hashes } = await midFile();
    // The second chunk is a gzip stream of something else, under the name the record asked for: the put-back ends cold.
    const wrong = await gzipBytes(encode("a chunk the container cannot use"));
    socket.send(encodeFrame({ type: "blob", hash: hashes[1]!, size: wrong.byteLength }));
    socket.send(wrong);
    await emptyAndClosed(fake, ended(fake), "the sync-in ending");
    const told = ofType(fake.transcript, "error", "container")[0]!;
    expect(told).toMatchObject({ code: "mismatch", of: "cache", id: "sync-1" });
    expect(told.message).toContain("inflates to bytes that hash to");
  });

  it("a chunk the pasture no longer has ends it the same way, mid-file, and closes the handle too", { timeout: 60_000 }, async () => {
    const { fake, socket } = await midFile();
    // The cache moved under the put-back: the cell refuses the `need` it is answering, which fold's racing case drives.
    socket.send(encodeFrame({ type: "error", code: "refused", of: "need", id: "sync-1", message: "the pasture no longer has chunk ..." }));
    await emptyAndClosed(fake, ended(fake), "the sync-in ending");
  });

  it("a frame the sync cannot take drops the put-back, and that path closes the handle as well", { timeout: 60_000 }, async () => {
    const { fake, socket } = await midFile();
    // Bytes nobody is waiting for: the agent's own catch ends the sync-in, and the put-back goes with it.
    socket.send(encodeFrame({ type: "blob", hash: "a".repeat(64), size: 4 }));
    await emptyAndClosed(fake, reported(fake), "the container reporting it");
    expect(ofType(fake.transcript, "error", "container")[0]!.message).toContain("no sync-in is waiting for blob");
  });
});

describe("spool phase 0: journey 2 in the cell's terms", () => {
  it("steps 1 to 3: a /cache over the cap is refused before a byte of it is read, setup's result stands, and the container answers the next frame", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const object = await pasture("spool-capped");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    const r = rig();
    await inEnv(
      "spool-capped",
      r,
      async (cell) => {
        // Step 1: setup runs before the command, installs, and exits 0; the command runs as if nothing were refused.
        expect(await run(cell, TOOL)).toBe("tool 1.2.3\n");
        // Step 2: the same container answers the next frame, and the socket never closed.
        expect(await run(cell, TOOL)).toBe("tool 1.2.3\n");
      },
      { cacheMaxBytes: CACHE_CHUNK_BYTES },
    );
    const container = r.containers[0]!;
    expect(container.runs.map((request) => request.command)).toEqual([SETUP_COMMAND, TOOL, TOOL]);

    // Step 3: the refusal happened without reading the file that would have crossed the cap. `/cache` holds the binary,
    // and the entries before it in path order are a directory and a symlink; the disk was asked for nothing at all.
    expect(container.cache.entries.get("lib/engine.bin")).toBeDefined();
    expect(container.cache.reads).toBe(0);
    expect(container.cache.bytesRead).toBe(0);

    // Nothing was offered: the description said it was over, named no chunk, and no blob left the container.
    const described = descriptions(container.transcript)[0]!;
    expect(described.bytes).toBeGreaterThan(CACHE_CHUNK_BYTES);
    expect(described.chunks).toEqual([]);
    expect(ofType(container.transcript, "blob", "container")).toEqual([]);
    expect(container.scratch.entries.size).toBe(0);
    expect(container.scratch.writes).toBe(0);

    // The log says the cap, as fold phase 1 wrote it, and the pasture's cache is what it was.
    expect(logs()).toContain(`[pen] cache not kept for ${setupName(key)}: ${overCapRefusal(CACHE_CHUNK_BYTES)}`);
    expect(await object.cacheFor(key)).toBeUndefined();
    expect(await chunkHashes("spool-capped")).toEqual([]);
  });

  it("a file that changes length under the writer refuses the save and leaves the turn unharmed", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const object = await pasture("spool-moved");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    // The cap is the real one: this `/cache` is well inside it, and what refuses the save is the file moving underfoot.
    const r = rig({ cache: shrinking(memoryDisk()) });
    await inEnv("spool-moved", r, async (cell) => {
      expect(await run(cell, TOOL)).toBe("tool 1.2.3\n");
      expect(await run(cell, TOOL)).toBe("tool 1.2.3\n");
    });
    const container = r.containers[0]!;
    expect(container.runs.map((request) => request.command)).toEqual([SETUP_COMMAND, TOOL, TOOL]);
    // The save failed, the cell said why, and nothing was committed.
    const refusals = logs().filter((line) => line.startsWith(`[pen] cache not kept for ${setupName(key)}: the save failed`));
    expect(refusals.length).toBe(1);
    expect(refusals[0]).toContain("its listing said");
    expect(await object.cacheFor(key)).toBeUndefined();
    expect(await chunkHashes("spool-moved")).toEqual([]);
  });
});
