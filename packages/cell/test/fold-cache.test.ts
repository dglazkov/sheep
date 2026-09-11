/**
 * fold phase 1: the pasture's cache. Journey 1 steps 1 to 7 in the cell's
 * terms, in workerd, against the fake container, whose `/cache` is a disk
 * in memory under the agent's own code and whose scratch holds the chunks a
 * description made. A pasture's `setup.sh` is played by the fake's runner
 * as the issue's line: when `/cache` has the tool it says so, and when it
 * does not it installs it there. The first sheep's birth is cold and kept;
 * the second's is warm and its setup finds the tool; a fresh container of
 * the first is warm; a changed `setup.sh` is cold and kept anew; what the
 * model installs into `/cache` goes with its container; an earmarked
 * sheep's setup is never kept, and the log names why and no value. Then the
 * rules a cache is whole by: one chunk between two `need`s, the cap, a save
 * cut off, a restore racing a commit, and a sheep with no pasture or no
 * `setup.sh` sent nothing. The record itself is proved first, over the
 * fake's memory disk.
 *
 * Fold phase 3: a chunk travels and is kept gzipped, and its hash stays
 * over its plain bytes, so a chunk packed another way is the same chunk and
 * the record's identity does not move; a `need` for the cache may name up
 * to three chunks, answered in the order asked, and never a fourth blob
 * comes between two `need`s. The birth's entry carries the chunk count, the
 * deflated bytes that travelled, and the part of the put-back the cell
 * spent reading the object.
 *
 * Fold phase 2's second pass: the memory disk never says two entries are
 * one file, so its records have no links, and a disk that does say so gets
 * a record with the later name a `link`; a warm container whose setup left
 * `/cache` alone answers the description with the record put back and
 * writes nothing to its scratch, and one whose setup touched a file writes
 * the record again, the same record, and nothing moves.
 */
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { Chunker, type Disk, gunzipBytes, gzipBytes, RecordReader, writeRecord } from "@sheep/pen/agent";
import { CACHE_CHUNK_BYTES, CACHE_NEED_CHUNKS, type CacheRef, type CellFrame, type ContainerFrame, type Frame } from "@sheep/pen/protocol";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BIRTH_ENTRY, type BirthData, birthCommand, birthData, birthText, cacheSentence, homeSentence, setupSentence } from "../src/birth.ts";
import { pastureSourceFor, type SessionCell } from "../src/cell.ts";
import { type CacheOutcome, CellExecutionEnv, type ContainerLease, SETUP_COMMAND, SETUP_PATH } from "../src/env/execution-env.ts";
import type { KeptCache, Pasture } from "../src/pasture.ts";
import { cacheSize, EMPTY_REFUSAL, OWN_SECRET_REFUSAL, overCapRefusal, setupName } from "../src/pen/cache.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { hashBytes, HOME_ROOT, WORKSPACE_ROOT } from "../src/workspace/files.ts";
import { type FakeContainer, type MemoryDisk, memoryDisk, type ScriptFor, serveFakeOn, startFakeContainer, type TranscriptEntry } from "./fake-container.ts";

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
const REPO = "https://github.com/org/tools";
/** The issue's line, as the dog would put it. */
const SETUP_SCRIPT = "#!/bin/sh\nset -e\ncommand -v tool >/dev/null || npm install -g tool@1.2.3\n";
const SETUP_CHANGED = "#!/bin/sh\nset -e\ncommand -v tool >/dev/null || npm install -g tool@2.0.0\n";
/** A string in the tool's own file and nowhere else, so a search for the cache's bytes is exact. */
const TOOL_MARK = "tool-cli-3e8a1f5c9d2b4760-in-the-cache-only";
const PROBE = "probe-7d2e9b4a1c6f4083-earmarked-for-one";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const encode = (text: string): Uint8Array => encoder.encode(text);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Bytes that look like nothing else and are not one byte repeated, so two chunks of them are two hashes. */
function patterned(size: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let state = seed >>> 0;
  for (let index = 0; index < size; index++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes;
}
/** Bytes that repeat, so gzip takes them to a thousandth: a record of four chunks that costs the object and the scratch almost nothing. */
function repeating(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index++) bytes[index] = index % 251;
  return bytes;
}

/** A tool binary over a chunk, as wrangler's `workerd` is: the record it lands in is two chunks. */
const ENGINE = patterned(CACHE_CHUNK_BYTES + 4096, 7);
const ENGINE_2 = patterned(CACHE_CHUNK_BYTES + 8192, 11);
/** A binary of four chunks that gzip takes to almost nothing, so a record of four fits a test isolate's memory (fold phase 3). */
const ENGINE_4 = repeating(3 * CACHE_CHUNK_BYTES + 4096);

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function pasture(name: string, meta: { repo?: string } = {}): Promise<DurableObjectStub<Pasture>> {
  expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name, ...meta }) })).status).toBe(201);
  return env.PASTURE.getByName(name);
}

/** Every line written to the console from here to the test's end; the cells log into this isolate. */
function logLines(): () => string[] {
  const spies = (["debug", "log", "info", "warn", "error"] as const).map((level) => vi.spyOn(console, level));
  return () => spies.flatMap((spy) => spy.mock.calls.map((args) => args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack ?? ""}` : String(arg))).join(" ")));
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The tool, as the fake plays it.

/** What `npm install -g tool` leaves under the prefix: the package, its bin link, and with `engine`, a binary over a chunk. */
function installTool(cache: MemoryDisk, options: { version?: string; engine?: Uint8Array } = {}): void {
  const version = options.version ?? "1.2.3";
  cache.putFile("lib/node_modules/tool/package.json", `{"name":"tool","version":"${version}","bin":{"tool":"cli.js"}}\n`);
  cache.putFile("lib/node_modules/tool/cli.js", `#!/usr/bin/env node\n// ${TOOL_MARK}\nconsole.log("tool ${version}");\n`, 0o755);
  cache.putSymlink("bin/tool", "../lib/node_modules/tool/cli.js");
  if (options.engine !== undefined) cache.putFile("lib/node_modules/tool/vendor/engine.bin", options.engine, 0o755);
}

/** The version the tool under a `/cache` says, or `undefined` when `command -v tool` would find nothing. */
function toolIn(cache: MemoryDisk): string | undefined {
  if (cache.entries.get("bin/tool")?.kind !== "symlink") return undefined;
  const cli = cache.entries.get("lib/node_modules/tool/cli.js");
  return cli?.kind === "file" ? /console\.log\("tool ([^"]+)"\)/.exec(decoder.decode(cli.bytes))?.[1] : undefined;
}

/** What each setup found when it ran, in order: the tool's version already there, or `installed`. And what `/cache` held at that moment. */
interface SetupSeen {
  found: string | "installed";
  paths: string[];
}

/**
 * The clone, the issue's `setup.sh` over `/cache`, the tool, and the model's own `npm install -g other`, over whichever
 * container `current()` says runs the line. `engine` makes the install a record of two chunks; `earmark` has setup write
 * an npmrc with the environment's PROBE into `/cache`, which is the leak the rule is for.
 */
function toolScript(current: () => FakeContainer | Omit<FakeContainer, "socket">, seen: SetupSeen[], options: { engine?: Uint8Array; earmark?: boolean; empty?: boolean; touch?: boolean } = {}): ScriptFor {
  return (request) => {
    const command = request.command.trim();
    if (command === birthCommand(REPO, "main")) {
      return { steps: [{ stderr: "Cloning into '.'...\n" }, { act: (disk) => disk.putFile("README.md", "# tools\n") }], exit: 0 };
    }
    if (command === SETUP_COMMAND) {
      return {
        steps: [
          {
            act: (_disk, _home, cache) => {
              const found = toolIn(cache);
              seen.push({ found: found ?? "installed", paths: [...cache.entries.keys()].sort() });
              // `setup.sh` is read off the tree the container has: the changed script installs the new version.
              const script = current().pasture.entries.get(SETUP_PATH);
              const version = script?.kind === "file" && decoder.decode(script.bytes).includes("tool@2.0.0") ? "2.0.0" : "1.2.3";
              // `empty`: a setup that uses no prefix at all, and leaves `/cache` as it found it.
              if (found === undefined && !options.empty) installTool(cache, { version, ...(options.engine === undefined ? {} : { engine: options.engine }) });
              if (options.earmark) cache.putFile("etc/npmrc", `//registry.npmjs.org/:_authToken=${request.env.PROBE ?? ""}\n`, 0o600);
              // `touch`: a setup that finds the tool and rewrites one of its files with the bytes it had, as `touch` would leave it.
              if (options.touch && found !== undefined) {
                const manifest = cache.entries.get("lib/node_modules/tool/package.json");
                if (manifest?.kind === "file") cache.putFile("lib/node_modules/tool/package.json", manifest.bytes, manifest.mode);
              }
            },
          },
        ],
        exit: 0,
      };
    }
    if (command === "tool --version") {
      const version = toolIn(current().cache);
      return version === undefined ? { steps: [{ stderr: "bash: tool: command not found\n" }], exit: 127 } : { steps: [{ stdout: `tool ${version}\n` }], exit: 0 };
    }
    if (command === "npm install -g other") {
      return { steps: [{ act: (_disk, _home, cache) => cache.putFile("lib/node_modules/other/index.js", "module.exports = 'other';\n"), stdout: "added 1 package\n" }], exit: 0 };
    }
    if (command === "other --version") {
      const there = current().cache.entries.get("lib/node_modules/other/index.js") !== undefined;
      return there ? { steps: [{ stdout: "other 0.1.0\n" }], exit: 0 } : { steps: [{ stderr: "bash: other: command not found\n" }], exit: 127 };
    }
    if (command === "true && node -e 0") return { steps: [], exit: 0 };
    return undefined;
  };
}

// ---------------------------------------------------------------------------
// Whole cells: the Directory's mint, the stub starter, the real door.

interface Stub {
  starter: ContainerStarter;
  fakes: Array<Omit<FakeContainer, "socket">>;
  ensures: number;
}

/** The container's half without a container, as `setup.test.ts` has it: dial the real door on `ensure`, serve the fake on what comes back. */
function stubStarter(sessionId: string, script: (stub: Stub) => ScriptFor): Stub {
  const directory = () => env.DIRECTORY.getByName("home");
  const stub: Stub = {
    fakes: [],
    ensures: 0,
    starter: {
      async ensure(args) {
        stub.ensures++;
        void (async () => {
          await sleep(10);
          const response = await SELF.fetch(`${args.cellUrl}?token=${encodeURIComponent(args.token)}`, { headers: { upgrade: "websocket" } });
          if (response.status !== 101) return;
          const socket = response.webSocket!;
          socket.accept();
          const fake = serveFakeOn(socket, { script: script(stub) });
          stub.fakes.push(fake);
          await directory().containerOpened(sessionId, Date.now());
          void fake.closed.then(() => directory().containerClosed(sessionId, Date.now()));
        })();
        return { started: true };
      },
      async renew() {
        return { running: stub.fakes.length > 0 };
      },
      async destroy() {
        stub.fakes.at(-1)?.stop("destroyed");
      },
    },
  };
  return stub;
}

interface Sheep {
  id: string;
  stub: Stub;
  seen: SetupSeen[];
}

/** A sheep minted by the Directory's `create`, as `earmark.test.ts` mints, with its starter set before anything boots it. */
async function mintedInto(name: string, pastureName: string, options: { secrets?: Record<string, string>; engine?: Uint8Array; earmark?: boolean; touch?: boolean } = {}): Promise<Sheep> {
  const { id } = await env.DIRECTORY.getByName("home").create(name, pastureName, options.secrets);
  // The mint's one rule: the Directory, and nothing in the cell.
  expect(await tablesOf(id)).toEqual([]);
  const seen: SetupSeen[] = [];
  const stub = stubStarter(id, (stub) => toolScript(() => stub.fakes.at(-1)!, seen, options));
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.starter = stub.starter;
  });
  return { id, stub, seen };
}

function inCell<T>(id: string, body: (cell: SessionCell) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => body(cell));
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

async function bash(cell: SessionCell, command: string): Promise<string> {
  const runtime = await cell.runtime();
  return text(await bashTool.execute("call", { command }, () => {}, { env: runtime.env }, invocation, context));
}

async function births(id: string): Promise<BirthData[]> {
  const view = (await (await api(`/s/${id}/transcript`)).json()) as { entries: Array<{ type: string; customType?: string; data?: unknown }> };
  return view.entries.filter((entry) => entry.type === "custom" && entry.customType === BIRTH_ENTRY).map((entry) => entry.data as BirthData);
}

/** The container goes past its idle period; the next command rents a fresh one. */
async function forget(sheep: Sheep): Promise<void> {
  await inCell(sheep.id, async (cell) => {
    (await cell.runtime()).lease!.idle();
    sheep.stub.fakes.at(-1)!.stop("idle");
  });
  await sleep(50);
}

/** Every object in the cell's own SQLite that is not the platform's. */
function tablesOf(id: string): Promise<string[]> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) =>
    state.storage.sql
      .exec<{ name: string; type: string }>("SELECT name, type FROM sqlite_master")
      .toArray()
      .filter((row) => !row.name.startsWith("_cf_"))
      .map((row) => `${row.type} ${row.name}`),
  );
}

type FrameEntry = Extract<TranscriptEntry, { frame: unknown }>;

function framesOf(transcript: TranscriptEntry[]): FrameEntry[] {
  return transcript.filter((entry): entry is FrameEntry => "frame" in entry);
}

function ofType<T extends Frame["type"]>(transcript: TranscriptEntry[], type: T, from?: "cell" | "container"): Array<Extract<Frame, { type: T }>> {
  return framesOf(transcript)
    .filter((entry) => entry.frame.type === type && (from === undefined || entry.from === from))
    .map((entry) => entry.frame as Extract<Frame, { type: T }>);
}

/** The container's description of `/cache`, and the cell's asking for one: the two `cache` frames. */
type Described = Extract<ContainerFrame, { type: "cache" }>;
type Asked = Extract<CellFrame, { type: "cache" }>;
function descriptions(transcript: TranscriptEntry[]): Described[] {
  return ofType(transcript, "cache", "container") as Described[];
}

/** How many of `chunks` went as blobs between each two `need`s, in either direction, as the agent saw the socket. */
function chunksBetweenNeeds(transcript: TranscriptEntry[], chunks: Set<string>): number[] {
  const counts: number[] = [];
  let current = 0;
  for (const entry of framesOf(transcript)) {
    if (entry.frame.type === "need") {
      counts.push(current);
      current = 0;
    } else if (entry.frame.type === "blob" && chunks.has(entry.frame.hash)) {
      current++;
    }
  }
  counts.push(current);
  return counts;
}

/** Everything a cell holds that a person or the model could read: its rows, its transcript, its export. */
async function cellSays(id: string): Promise<string> {
  const rows = await runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) =>
    state.storage.sql
      .exec<{ path: string; content: ArrayBuffer | null }>("SELECT path, content FROM files")
      .toArray()
      .map((row) => `${row.path}\n${row.content === null ? "" : new TextDecoder("latin1").decode(row.content)}`)
      .join("\n"),
  );
  const chunks = await runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) =>
    state.storage.sql.exec<{ content: ArrayBuffer }>("SELECT content FROM file_chunks").toArray().map((row) => new TextDecoder("latin1").decode(row.content)).join("\n"),
  );
  return [rows, chunks, await (await api(`/s/${id}/transcript`)).text(), await (await api(`/s/${id}/export`)).text()].join("\n");
}

interface RouteCache {
  bytes: number;
  files: number;
  setup: string;
  keptAt: number;
  by: string;
  current: boolean;
}

async function routeCache(name: string): Promise<{ cache: RouteCache | null; body: string }> {
  const response = await api(`/p/${name}/`);
  expect(response.status).toBe(200);
  const body = await response.text();
  return { cache: (JSON.parse(body) as { cache: RouteCache | null }).cache, body };
}

// ---------------------------------------------------------------------------
// Direct cells: an env over a lease the test holds, for the cases that need a hand on the store or the cap.

interface Rig {
  lease: ContainerLease;
  containers: FakeContainer[];
  seen: SetupSeen[];
  forget(): void;
}

/** A home with a container: `rent()` gives the same fake until `forget()`, then a fresh one, as the idle period does. */
function rig(options: { engine?: Uint8Array; empty?: boolean } = {}): Rig {
  let gone = true;
  const r: Rig = {
    containers: [],
    seen: [],
    lease: {
      async rent() {
        const last = r.containers.at(-1);
        if (last !== undefined && !gone) return last.socket;
        const container = startFakeContainer({ script: toolScript(() => r.containers.at(-1)!, r.seen, options) });
        r.containers.push(container);
        gone = false;
        return container.socket;
      },
      idle() {},
    },
    forget() {
      r.containers.at(-1)?.stop("idle");
      gone = true;
    },
  };
  return r;
}

type Source = ReturnType<typeof pastureSourceFor>;

/** A cell's env over the rig, with the pasture as boot builds it; `wrap` may lay a hand over the store. */
function inEnv<T>(
  name: string,
  pastureName: string,
  r: Rig,
  body: (cell: CellExecutionEnv, object: DurableObjectStub<Pasture>) => Promise<T>,
  options: { cacheMaxBytes?: number; wrap?: (source: Source, object: DurableObjectStub<Pasture>) => Source } = {},
): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`cache:${name}`), (_instance, state) => {
    state.storage.sql.exec("DROP TABLE IF EXISTS files");
    state.storage.sql.exec("DROP TABLE IF EXISTS file_chunks");
    // A stub made outside a Durable Object cannot be used inside it: the object is reached through one made here.
    const object = env.PASTURE.getByName(pastureName);
    const source = pastureSourceFor(object, { secrets: async () => ({}) }, `sheep-${name}`);
    const cell = new CellExecutionEnv(state.storage.sql, {
      container: r.lease,
      pasture: options.wrap === undefined ? source : options.wrap(source, object),
      ...(options.cacheMaxBytes === undefined ? {} : { cacheMaxBytes: options.cacheMaxBytes }),
    });
    return body(cell, object);
  });
}

async function run(cell: CellExecutionEnv, command: string): Promise<string> {
  return text(await bashTool.execute("b", { command }, () => {}, { env: cell }, invocation, context));
}

/** The object's chunk rows, by a `SELECT` of the test's own. */
function chunkHashes(name: string): Promise<string[]> {
  return runInDurableObject(env.PASTURE.getByName(name), (_object, state) => state.storage.sql.exec<{ hash: string }>("SELECT hash FROM cache_sizes ORDER BY hash").toArray().map((row) => row.hash));
}

// ---------------------------------------------------------------------------

/**
 * The same gzip stream under another zlib's header (fold phase 3): its
 * time and operating system set, and the name of a file it came from
 * added, which an inflater skips. The bytes differ; what they mean does
 * not, and neither does the chunk's hash, which is over the plain bytes.
 */
function repackGzip(gzipped: Uint8Array): Uint8Array {
  const name = encode("engine.bin\0");
  const out = new Uint8Array(gzipped.byteLength + name.byteLength);
  out.set(gzipped.subarray(0, 10), 0);
  out[3] = (gzipped[3]! | 0x08) & 0xff; // FNAME: a name follows the header
  out.set([0x21, 0x43, 0x65, 0x87], 4); // MTIME: a time, where the agent's zlib writes none
  out[9] = 0x03; // OS: unix, where another zlib may say something else
  out.set(name, 10);
  out.set(gzipped.subarray(10), 10 + name.byteLength);
  return out;
}

/** A disk's entries as a comparison reads them: kind, mode, and the bytes or the target. */
function entriesOf(disk: MemoryDisk): string[] {
  return [...disk.entries]
    .map(([path, entry]) => `${path} ${entry.kind} ${entry.mode.toString(8)} ${entry.kind === "file" ? hashBytes(entry.bytes) : entry.kind === "symlink" ? entry.target : "-"}`)
    .sort();
}

/** A disk as a record's chunks, as the agent's description cuts them. */
async function recordOf(disk: Disk): Promise<{ chunks: Uint8Array[]; files: number; bytes: number }> {
  const chunks: Uint8Array[] = [];
  const chunker = new Chunker(CACHE_CHUNK_BYTES, async (chunk) => {
    chunks.push(chunk);
  });
  const count = await writeRecord(disk, (bytes) => chunker.push(bytes));
  await chunker.end();
  return { chunks, files: count.files, bytes: count.bytes };
}

function joined(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

describe("fold phase 1: the record", () => {
  it("a round trip over the memory disk: a symlink, directories, modes, an empty file, and a file larger than a chunk come back as they were", async () => {
    const disk = memoryDisk();
    installTool(disk, { engine: ENGINE });
    disk.putDirectory("etc", 0o555);
    disk.putFile("etc/npmrc", "fund=false\n", 0o600);
    disk.putDirectory("share/man", 0o750);
    disk.putFile("lib/node_modules/tool/.keep", "");
    disk.putSymlink("bin/dangling", "../nowhere");
    const record = await recordOf(disk);
    // Over a chunk: two of them, the first exactly a chunk.
    expect(record.chunks.length).toBe(2);
    expect(record.chunks[0]!.byteLength).toBe(CACHE_CHUNK_BYTES);
    expect(record.files).toBe(5);
    expect(record.bytes).toBe(record.chunks[0]!.byteLength + record.chunks[1]!.byteLength);
    // The first line is the first entry by path, and says no mtime and no owner.
    const firstLine = decoder.decode(record.chunks[0]!.subarray(0, record.chunks[0]!.indexOf(10)));
    expect(JSON.parse(firstLine)).toEqual({ path: "bin", kind: "directory", mode: 0o755, size: 0 });
    // The memory disk never says two entries are one file (fold phase 2), so nothing in its record is a link.
    expect(new TextDecoder("latin1").decode(joined(record.chunks))).not.toContain('"kind":"link"');

    const onto = memoryDisk();
    const reader = new RecordReader(onto);
    for (const chunk of record.chunks) await reader.push(chunk);
    expect(await reader.end()).toEqual({ files: 5, bytes: record.bytes });
    expect(entriesOf(onto)).toEqual(entriesOf(disk));
    expect(onto.entries.get("etc")?.mode).toBe(0o555);
    expect(onto.entries.get("bin/tool")).toEqual({ kind: "symlink", target: "../lib/node_modules/tool/cli.js", mode: 0o777 });
    expect(hashBytes((onto.entries.get("lib/node_modules/tool/vendor/engine.bin") as { bytes: Uint8Array }).bytes)).toBe(hashBytes(ENGINE));

    // Read in pieces that cut headers and bodies anywhere, the reader writes the same tree.
    const small = memoryDisk();
    installTool(small);
    small.putDirectory("etc", 0o555);
    small.putFile("etc/npmrc", "fund=false\n", 0o600);
    const whole = joined((await recordOf(small)).chunks);
    const pieces = memoryDisk();
    const pieced = new RecordReader(pieces);
    for (let offset = 0; offset < whole.byteLength; offset += 7) await pieced.push(whole.subarray(offset, offset + 7));
    await pieced.end();
    expect(entriesOf(pieces)).toEqual(entriesOf(small));
    // A stream cut inside an entry is not a record.
    const cut = new RecordReader(memoryDisk());
    await cut.push(whole.subarray(0, whole.byteLength - 3));
    await expect(cut.end()).rejects.toThrow("the record ended inside an entry");
    // Nor is a path that would leave the disk.
    const escaping = new RecordReader(memoryDisk());
    await expect(escaping.push(encode(`${JSON.stringify({ path: "../etc/passwd", kind: "file", mode: 0o644, size: 0 })}\n`))).rejects.toThrow("a record names a path it may not");
  });

  it("the same tree written twice is the same bytes, whatever order it was made in", async () => {
    const a = memoryDisk();
    installTool(a, { engine: ENGINE });
    a.putFile("etc/npmrc", "fund=false\n", 0o600);
    const b = memoryDisk();
    b.putFile("etc/npmrc", "fund=false\n", 0o600);
    b.putFile("lib/node_modules/tool/vendor/engine.bin", ENGINE, 0o755);
    b.putSymlink("bin/tool", "../lib/node_modules/tool/cli.js");
    b.putFile("lib/node_modules/tool/cli.js", `#!/usr/bin/env node\n// ${TOOL_MARK}\nconsole.log("tool 1.2.3");\n`, 0o755);
    b.putFile("lib/node_modules/tool/package.json", '{"name":"tool","version":"1.2.3","bin":{"tool":"cli.js"}}\n');
    const first = await recordOf(a);
    const again = await recordOf(a);
    const other = await recordOf(b);
    expect(first.chunks.map(hashBytes)).toEqual(again.chunks.map(hashBytes));
    expect(first.chunks.map(hashBytes)).toEqual(other.chunks.map(hashBytes));
    expect(hashBytes(joined(first.chunks))).toBe(hashBytes(joined(other.chunks)));
    // A mode is part of the tree: the same bytes with another mode is another record.
    b.putFile("etc/npmrc", "fund=false\n", 0o644);
    expect((await recordOf(b)).chunks.map(hashBytes)).not.toEqual(first.chunks.map(hashBytes));
  });

  it("fold phase 2: a file the disk says has two names is written once, the later name a link; read back as a link, or as a copy on a disk with none", async () => {
    const tree = memoryDisk();
    installTool(tree);
    tree.putFile("lib/node_modules/tool/vendor/engine.bin", ENGINE, 0o755);
    tree.putFile("lib/node_modules/engine/bin/engine", ENGINE, 0o755);
    /** The same tree on a disk that says the two engines are one file, as `lstat`'s inode says on a real one. */
    const sharing = (disk: MemoryDisk): Disk => ({
      ...disk,
      async list() {
        return (await disk.list()).map((entry) => (entry.path.endsWith("engine.bin") || entry.path.endsWith("bin/engine") ? { ...entry, file: "7:4242" } : entry));
      },
    });
    const once = await recordOf(sharing(tree));
    const twice = await recordOf(tree);
    // The bytes once: the linked record is short of the plain one by one engine, less the link's own path.
    expect(twice.bytes - once.bytes).toBeGreaterThan(ENGINE.byteLength - 100);
    expect(once.files).toBe(twice.files);
    // The first name in path order carries the bytes; the later one is a link to it, by path.
    const text = new TextDecoder("latin1").decode(joined(once.chunks));
    expect(text).toContain(`${JSON.stringify({ path: "lib/node_modules/tool/vendor/engine.bin", kind: "link", mode: 0o755, size: "lib/node_modules/engine/bin/engine".length })}\nlib/node_modules/engine/bin/engine`);
    // The same tree is the same record, whatever identity the disk gives the file.
    const renamed = (disk: MemoryDisk): Disk => ({ ...disk, async list() { return (await disk.list()).map((entry) => (entry.path.endsWith("engine.bin") || entry.path.endsWith("bin/engine") ? { ...entry, file: "9:1" } : entry)); } });
    expect((await recordOf(renamed(tree))).chunks.map(hashBytes)).toEqual(once.chunks.map(hashBytes));

    // Read onto a disk that can link: the later name is made a link to the earlier.
    const linked: Array<[string, string]> = [];
    const target = memoryDisk();
    const reader = new RecordReader({
      ...target,
      async link(existing, path) {
        linked.push([existing, path]);
        target.putFile(path, (target.entries.get(existing) as { bytes: Uint8Array }).bytes, target.entries.get(existing)!.mode);
      },
    });
    for (const chunk of once.chunks) await reader.push(chunk);
    expect(await reader.end()).toEqual({ files: once.files, bytes: once.bytes });
    expect(linked).toEqual([["lib/node_modules/engine/bin/engine", "lib/node_modules/tool/vendor/engine.bin"]]);
    // Read onto the memory disk, which has no link: a copy, byte for byte and mode for mode, and the tree as it was.
    const copied = memoryDisk();
    const plain = new RecordReader(copied);
    for (const chunk of once.chunks) await plain.push(chunk);
    await plain.end();
    expect(entriesOf(copied)).toEqual(entriesOf(tree));
    // A link to a name the record has not written is not a record: it could reach outside it.
    const stray = new RecordReader(memoryDisk());
    await expect(stray.push(encode(`${JSON.stringify({ path: "bin/x", kind: "link", mode: 0o644, size: 11 })}\n../../etc/x`))).rejects.toThrow("names a file it has not written");
  });
});

describe("fold phase 1: journey 1 in the cell's terms", () => {
  it("steps 1 to 4: the first sheep cold and kept, the route's cache, the second sheep warm, a fresh container of the first warm; no byte of the cache in a cell", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const object = await pasture("tools", { repo: REPO });
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    // Nothing kept yet: the route says so.
    expect((await routeCache("tools")).cache).toBeNull();

    // Step 1: the birth clones, finds no cache, and setup installs the tool into `/cache`; the tool runs; the entry says cold and kept.
    const first = await mintedInto("first", "tools");
    const [born] = await births(first.id);
    expect(first.seen.map((one) => one.found)).toEqual(["installed"]);
    expect(first.seen[0]!.paths).toEqual([]);
    const kept = (await object.cacheFor(key))!;
    expect(kept).toMatchObject({ key, files: 2, by: first.id, chunks: [expect.any(String)] });
    expect(born!.cache).toEqual({ found: "cold", bytes: kept.bytes, files: 2, ms: 0, chunks: 1, stored: kept.stored, kept: true });
    // Fold phase 3: what the object holds is the record deflated, and it is smaller than the record.
    expect(kept.stored).toBeLessThan(kept.bytes);
    expect(born!.home).toBe(HOME_ROOT);
    expect(birthText(born!)).toContain(`${setupSentence({ exit: 0 })} ${homeSentence(HOME_ROOT)} ${cacheSentence(born!.cache!)}`);
    expect(cacheSentence(born!.cache!)).toBe(`The pasture had no cache for this setup.sh, so setup ran cold, and what it left in /cache was kept, ${cacheSize(kept.bytes)}.`);
    // The save: `cache` asked after setup's own sync-out, described, the one chunk asked for alone, and `synced`.
    const firstFake = first.stub.fakes[0]!;
    const described = descriptions(firstFake.transcript)[0]!;
    expect(described).toMatchObject({ hash: kept.hash, chunks: kept.chunks, files: 2, bytes: kept.bytes });
    const saveId = described.id;
    const saveNeeds = ofType(firstFake.transcript, "need", "cell").filter((need) => need.id === saveId);
    expect(saveNeeds.map((need) => need.hashes)).toEqual([[kept.chunks[0]]]);
    expect(ofType(firstFake.transcript, "synced", "cell").some((synced) => synced.id === saveId)).toBe(true);
    // The scratch let go of the chunks once the cell said `synced`.
    await sleep(25);
    expect(firstFake.scratch.entries.size).toBe(0);
    expect(firstFake.scratch.writes).toBeGreaterThan(0);
    await inCell(first.id, async (cell) => {
      expect(await bash(cell, "tool --version")).toBe("tool 1.2.3\n");
    });

    // Step 2: the route has the cache: size, files, the setup.sh it is for, when, and by which sheep; no chunk in its body.
    const route = await routeCache("tools");
    expect(route.cache).toEqual({ bytes: kept.bytes, files: 2, setup: key, keptAt: kept.keptAt, by: first.id, current: true });
    expect(route.body).not.toContain(TOOL_MARK);
    expect(route.body).not.toContain(kept.chunks[0]);

    // Step 3: a second sheep: its birth is warm, put back before setup, and its setup did not install; the tool runs.
    const second = await mintedInto("second", "tools");
    const [warm] = await births(second.id);
    expect(second.seen.map((one) => one.found)).toEqual(["1.2.3"]);
    expect(warm!.cache).toEqual({ found: "warm", bytes: kept.bytes, files: 2, ms: expect.any(Number), chunks: 1, stored: kept.stored, read: expect.any(Number) });
    expect(cacheSentence(warm!.cache!)).toMatch(new RegExp(`^The pasture's cache for this setup\\.sh was put back into /cache first, ${cacheSize(kept.bytes).replace(".", "\\.")} in \\d+(\\.\\d)? s\\.$`));
    expect(birthText(warm!)).toContain(cacheSentence(warm!.cache!));
    const secondFake = second.stub.fakes[0]!;
    const manifest = ofType(secondFake.transcript, "manifest", "cell")[0]!;
    expect(manifest.cache).toEqual({ hash: kept.hash, chunks: kept.chunks } satisfies CacheRef);
    // The order: the manifest, the files' `need` and `setup.sh`'s blob, the chunk's `need` alone and its blob, `checkout`, and only then the clone.
    const order = framesOf(secondFake.transcript).map((entry) => `${entry.from}:${entry.frame.type}`);
    expect(order.slice(0, 7)).toEqual(["cell:manifest", "container:need", "cell:blob", "container:need", "cell:blob", "container:checkout", "cell:run"]);
    expect(ofType(secondFake.transcript, "need", "container")[1]!.hashes).toEqual(kept.chunks);
    // Setup changed nothing: the same record, and nothing moved but the description and `synced`. Fold phase 2: the agent learned
    // that from its walk of `/cache` against the put-back's, and wrote no record to its scratch to learn it.
    const warmSave = descriptions(secondFake.transcript)[0]!;
    expect(warmSave.hash).toBe(kept.hash);
    expect(warmSave).toMatchObject({ chunks: kept.chunks, files: kept.files, bytes: kept.bytes });
    expect(secondFake.scratch.writes).toBe(0);
    expect(ofType(secondFake.transcript, "need", "cell").filter((need) => need.id === warmSave.id)).toEqual([]);
    // The one blob the container sent is the clone's README, from the clone's sync-out: no chunk left it.
    expect(ofType(secondFake.transcript, "blob", "container").map((blob) => blob.hash)).toEqual([hashBytes(encode("# tools\n"))]);
    await inCell(second.id, async (cell) => {
      expect(await bash(cell, "tool --version")).toBe("tool 1.2.3\n");
      (await cell.runtime()).lease!.idle();
    });
    // The route is unchanged: still the first sheep's save.
    expect((await routeCache("tools")).cache).toEqual(route.cache);

    // Step 4: the first sheep's container goes; its next command rents a fresh one, the cache is put back before setup, setup finds the tool.
    await forget(first);
    await inCell(first.id, async (cell) => {
      expect(await bash(cell, "tool --version")).toBe("tool 1.2.3\n");
      (await cell.runtime()).lease!.idle();
    });
    expect(first.stub.fakes.length).toBe(2);
    expect(first.seen.map((one) => one.found)).toEqual(["installed", "1.2.3"]);
    expect(first.stub.fakes[1]!.runs.map((request) => request.command)).toEqual([SETUP_COMMAND, "tool --version"]);
    expect(ofType(first.stub.fakes[1]!.transcript, "manifest", "cell")[0]!.cache).toEqual({ hash: kept.hash, chunks: kept.chunks });
    expect(first.stub.fakes[1]!.scratch.writes).toBe(0);
    const lines = logs();
    expect(lines.filter((line) => line.startsWith("[pen] cache warm, ")).length).toBe(2);
    expect(lines).toContain(`[pen] cache cold, none for ${setupName(key)}`);

    // The acceptance: the cache's bytes are in the object and the containers, and in no cell's rows, transcript, or export.
    for (const sheep of [first, second]) expect(await cellSays(sheep.id)).not.toContain(TOOL_MARK);
    expect(await cellSays(first.id)).toContain("# tools");
    for (const line of lines) expect(line).not.toContain(TOOL_MARK);
  });

  it("step 5: a changed setup.sh finds no cache for itself, runs cold, and the cache kept after it is for the new script; the route names it", { timeout: 60_000 }, async () => {
    const object = await pasture("changed", { repo: REPO });
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const before = hashBytes(encode(SETUP_SCRIPT));
    const after = hashBytes(encode(SETUP_CHANGED));
    const sheep = await mintedInto("changer", "changed");
    const [born] = await births(sheep.id);
    expect(born!.cache).toMatchObject({ found: "cold", kept: true });
    const old = (await object.cacheFor(before))!;
    expect((await routeCache("changed")).cache).toMatchObject({ setup: before, current: true });

    // The dog puts a changed script: the route still names the old one's cache, and says it is not the tree's now.
    await object.put(SETUP_PATH, encode(SETUP_CHANGED));
    expect((await routeCache("changed")).cache).toMatchObject({ setup: before, current: false });
    expect(await object.cacheFor(after)).toBeUndefined();

    await forget(sheep);
    await inCell(sheep.id, async (cell) => {
      expect(await bash(cell, "tool --version")).toBe("tool 2.0.0\n");
      (await cell.runtime()).lease!.idle();
    });
    // The fresh container was sent no cache, setup found `/cache` empty and installed the new version, and that was kept.
    const fresh = sheep.stub.fakes[1]!;
    expect(ofType(fresh.transcript, "manifest", "cell")[0]!.cache).toBeUndefined();
    expect(sheep.seen.map((one) => one.found)).toEqual(["installed", "installed"]);
    expect(sheep.seen[1]!.paths).toEqual([]);
    const route = await routeCache("changed");
    expect(route.cache).toMatchObject({ setup: after, current: true, by: sheep.id });
    // A new record, for the new script; the old one's is no cache for anything now.
    expect((await object.cacheFor(after))!.hash).not.toBe(old.hash);
    expect(await object.cacheFor(before)).toBeUndefined();
  });

  it("step 6: the model's own npm install -g lands in /cache and runs in that container; the next fresh container does not have it", { timeout: 60_000 }, async () => {
    const object = await pasture("model", { repo: REPO });
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    const sheep = await mintedInto("tinkerer", "model");
    await births(sheep.id);
    const kept = (await object.cacheFor(key))!;
    await inCell(sheep.id, async (cell) => {
      expect(await bash(cell, "npm install -g other")).toBe("added 1 package\n");
      expect(await bash(cell, "other --version")).toBe("other 0.1.0\n");
      (await cell.runtime()).lease!.idle();
    });
    expect(sheep.stub.fakes[0]!.cache.entries.has("lib/node_modules/other/index.js")).toBe(true);
    // Nothing was kept after the model's commands: the pasture's cache is setup's, as it was.
    expect(await object.cacheFor(key)).toEqual(kept);
    expect(ofType(sheep.stub.fakes[0]!.transcript, "cache", "cell").length).toBe(1);

    await forget(sheep);
    await inCell(sheep.id, async (cell) => {
      const refused = await bash(cell, "other --version").catch((error: Error) => error.message);
      expect(refused).toContain("bash: other: command not found");
      expect(await bash(cell, "tool --version")).toBe("tool 1.2.3\n");
      (await cell.runtime()).lease!.idle();
    });
    const fresh = sheep.stub.fakes[1]!;
    expect(fresh.cache.entries.has("lib/node_modules/other/index.js")).toBe(false);
    expect(toolIn(fresh.cache)).toBe("1.2.3");
  });

  it("step 7: a sheep with its own secret gets the cache put back, and its setup's /cache is never kept; the log names the reason and no value", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const object = await pasture("earmarked", { repo: REPO });
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    await object.setSecret("PROBE", "the-herds-probe-5a1c");
    const key = hashBytes(encode(SETUP_SCRIPT));
    // A sibling keeps the cache first, its setup writing the pasture's PROBE, which is every sheep's already.
    const sibling = await mintedInto("sibling", "earmarked");
    await births(sibling.id);
    const kept = (await object.cacheFor(key))!;

    // The earmarked sheep: minted with its own PROBE; the mint is still the Directory's alone.
    const own = await mintedInto("own", "earmarked", { secrets: { PROBE }, earmark: true });
    const [born] = await births(own.id);
    // The cache was put back: setup found the tool, and wrote the sheep's own value into `/cache/etc/npmrc`.
    expect(own.seen.map((one) => one.found)).toEqual(["1.2.3"]);
    expect(own.stub.fakes[0]!.runs[1]!.env).toMatchObject({ PROBE });
    expect(decoder.decode((own.stub.fakes[0]!.cache.entries.get("etc/npmrc") as { bytes: Uint8Array }).bytes)).toContain(PROBE);
    expect(born!.cache).toEqual({
      found: "warm",
      bytes: kept.bytes,
      files: 2,
      ms: expect.any(Number),
      chunks: kept.chunks.length,
      stored: kept.stored,
      read: expect.any(Number),
      refused: OWN_SECRET_REFUSAL,
    });
    expect(cacheSentence(born!.cache!)).toContain(`what setup left in /cache was not kept: ${OWN_SECRET_REFUSAL}.`);
    // Never kept: the container was never asked to describe `/cache`, no chunk left it, and the pasture's cache is the sibling's.
    expect(ofType(own.stub.fakes[0]!.transcript, "cache")).toEqual([]);
    expect(ofType(own.stub.fakes[0]!.transcript, "blob", "container").map((blob) => blob.hash)).toEqual([hashBytes(encode("# tools\n"))]);
    expect(await object.cacheFor(key)).toEqual(kept);
    expect((await routeCache("earmarked")).cache).toMatchObject({ by: sibling.id, keptAt: kept.keptAt });
    // The log names the reason and the name, never the value.
    const lines = logs();
    expect(lines).toContain(`[pen] cache not kept for ${setupName(key)}: setup's environment held this sheep's own PROBE`);
    for (const line of lines) expect(line).not.toContain(PROBE);
    // The sibling's next fresh container gets the cache without the earmarked sheep's npmrc.
    await forget(sibling);
    await inCell(sibling.id, async (cell) => {
      expect(await bash(cell, "tool --version")).toBe("tool 1.2.3\n");
      (await cell.runtime()).lease!.idle();
    });
    expect(sibling.stub.fakes[1]!.cache.entries.has("etc/npmrc")).toBe(false);
    for (const fake of sibling.stub.fakes) expect(JSON.stringify(fake.transcript)).not.toContain(PROBE);
    await inCell(own.id, async (cell) => (await cell.runtime()).lease!.idle());

    // In a pasture with no cache yet, the earmarked sheep's cold setup is not kept either: the pasture still has none.
    const empty = await pasture("earmarked-cold", { repo: REPO });
    await empty.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const cold = await mintedInto("own-cold", "earmarked-cold", { secrets: { PROBE }, earmark: true });
    const [coldBorn] = await births(cold.id);
    expect(coldBorn!.cache).toEqual({ found: "cold", bytes: 0, files: 0, ms: 0, refused: OWN_SECRET_REFUSAL });
    expect(cacheSentence(coldBorn!.cache!)).toBe(`The pasture had no cache for this setup.sh, so setup ran cold, and what it left in /cache was not kept: ${OWN_SECRET_REFUSAL}.`);
    expect((await routeCache("earmarked-cold")).cache).toBeNull();
    expect(await chunkHashes("earmarked-cold")).toEqual([]);
    await inCell(cold.id, async (cell) => (await cell.runtime()).lease!.idle());
  });
});

describe("fold phase 3: the chunks are deflated", () => {
  it("a chunk's hash is over its plain bytes, so a chunk packed another way is the same chunk, and the object keeps and sends the deflated form", { timeout: 60_000 }, async () => {
    const object = await pasture("packed", { repo: REPO });
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    const cold = await mintedInto("packed-cold", "packed", { engine: ENGINE });
    const [born] = await births(cold.id);
    const kept = (await object.cacheFor(key))!;
    expect(kept.chunks.length).toBe(2);

    // The chunks are named by the plain record's own hashes: the same tree, cut the same way, hashed with no zlib in between.
    const plain = await recordOf(cold.stub.fakes[0]!.cache);
    expect(kept.chunks).toEqual(plain.chunks.map(hashBytes));
    expect(born!.cache).toMatchObject({ chunks: 2, stored: kept.stored, bytes: plain.bytes });
    // What the object holds under each of those names is that chunk gzipped: inflating it gives the plain bytes back.
    for (const [index, hash] of kept.chunks.entries()) {
      const stored = (await object.cacheChunk(hash))!;
      expect(hashBytes(stored)).not.toBe(hash);
      expect(hashBytes(await gunzipBytes(stored))).toBe(hash);
      expect(stored.byteLength).toBe((await gzipBytes(plain.chunks[index]!)).byteLength);
    }

    // A chunk packed another way — the same deflate stream under a header another zlib wrote: a time, an operating system,
    // and the name of the file it came from — is the same chunk. The put-back inflates before it hashes, so the record's
    // identity has not moved and a second sheep is warm.
    const first = kept.chunks[0]!;
    const was = (await object.cacheChunk(first))!;
    const repacked = repackGzip(was);
    expect(hashBytes(repacked)).not.toBe(hashBytes(was));
    expect(hashBytes(await gunzipBytes(repacked))).toBe(first);
    await runInDurableObject(env.PASTURE.getByName("packed"), (_instance: Pasture, state) => {
      state.storage.sql.exec("DELETE FROM cache_chunks WHERE hash = ?", first);
      state.storage.sql.exec("DELETE FROM cache_sizes WHERE hash = ?", first);
    });
    await object.cachePut("repacked-by-another-zlib", first, repacked);

    const warm = await mintedInto("packed-warm", "packed", { engine: ENGINE });
    const [entry] = await births(warm.id);
    expect(warm.seen.map((one) => one.found)).toEqual(["1.2.3"]);
    expect(entry!.cache).toMatchObject({ found: "warm", bytes: kept.bytes, chunks: 2 });
    expect((await object.cacheFor(key))!.hash).toBe(kept.hash);
    expect(hashBytes((warm.stub.fakes[0]!.cache.entries.get("lib/node_modules/tool/vendor/engine.bin") as { bytes: Uint8Array }).bytes)).toBe(hashBytes(ENGINE));
    for (const sheep of [cold, warm]) await inCell(sheep.id, async (cell) => (await cell.runtime()).lease!.idle());
  });
});

describe("fold phase 3: a chunk the container cannot use", () => {
  /** The object's chunks as a home that kept them before fold phase 3 has them: the plain bytes, under the plain bytes' name. */
  async function keepPlain(name: string, chunks: readonly string[], change: (plain: Uint8Array) => Promise<Uint8Array> | Uint8Array = (plain) => plain): Promise<void> {
    const object = env.PASTURE.getByName(name);
    for (const hash of chunks) {
      const plain = await gunzipBytes((await object.cacheChunk(hash))!);
      await runInDurableObject(env.PASTURE.getByName(name), (_instance: Pasture, state) => {
        state.storage.sql.exec("DELETE FROM cache_chunks WHERE hash = ?", hash);
        state.storage.sql.exec("DELETE FROM cache_sizes WHERE hash = ?", hash);
      });
      await object.cachePut(`kept-before-the-deflate-${hash.slice(0, 8)}`, hash, await change(plain));
      // As an object upgraded across this phase has it: a chunk that was never deflated.
      await runInDurableObject(env.PASTURE.getByName(name), (_instance: Pasture, state) => {
        state.storage.sql.exec("UPDATE cache_sizes SET deflated = 0 WHERE hash = ?", hash);
      });
    }
  }

  /** A cold birth into a fresh pasture, and the cache it kept. */
  async function keptFor(name: string, sheep: string): Promise<{ object: DurableObjectStub<Pasture>; kept: KeptCache; key: string }> {
    const object = await pasture(name, { repo: REPO });
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    const cold = await mintedInto(sheep, name);
    await births(cold.id);
    await inCell(cold.id, async (cell) => (await cell.runtime()).lease!.idle());
    return { object, kept: (await object.cacheFor(key))!, key };
  }

  it("a cache kept before the chunks were deflated puts back cold: /cache is empty for setup, the sheep's command runs, and what is kept after is deflated", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const { object, kept, key } = await keptFor("upgraded", "upgraded-cold");
    expect(kept.stored).toBeLessThan(kept.bytes);
    await keepPlain("upgraded", kept.chunks);

    // The next fresh container is given that cache: it cannot inflate a chunk of it, so the put-back ends and setup runs cold.
    const after = await mintedInto("upgraded-after", "upgraded");
    const [born] = await births(after.id);
    expect(after.seen.map((one) => one.found)).toEqual(["installed"]);
    // `/cache` was empty when setup ran: nothing of the half-written record was left for it to find.
    expect(after.seen[0]!.paths).toEqual([]);
    expect(born!.cache).toMatchObject({ found: "cold", kept: true });
    expect(born!.exit).toBe(0);
    expect(born!.setup).toEqual({ exit: 0 });
    // The sheep's command runs in that container, and nothing about the sync-in reached it.
    await inCell(after.id, async (cell) => {
      const said = await bash(cell, "tool --version");
      expect(said).toBe("tool 1.2.3\n");
      expect(said).not.toContain("sync-in");
      (await cell.runtime()).lease!.idle();
    });
    // What is kept now is this phase's: deflated, and each chunk inflates to the name it is under.
    const now = (await object.cacheFor(key))!;
    expect(now.keptAt).toBeGreaterThan(kept.keptAt);
    expect(now.stored).toBeLessThan(now.bytes);
    for (const hash of now.chunks) expect(hashBytes(await gunzipBytes((await object.cacheChunk(hash))!))).toBe(hash);
    // The cell's log says why it went cold; the birth's own words say cold and kept, and name no error.
    const cold = logs().filter((line) => line.startsWith("[pen] cache cold: the container could not use the cache it was given"));
    expect(cold.length).toBe(1);
    expect(cold[0]).toContain("is not a gzip stream");
    expect(cold[0]).toContain("/cache was emptied and setup runs cold");
    expect(birthText(born!)).toContain("so setup ran cold");
    expect(birthText(born!)).not.toContain("sync-in");
  });

  it("a chunk that inflates to other bytes is the same: the put-back ends cold and the sheep's command runs", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const { object, kept, key } = await keptFor("swapped", "swapped-cold");
    // The chunk is a gzip stream, and of something else: what a chunk swapped under its name looks like.
    await keepPlain("swapped", kept.chunks.slice(0, 1), async (plain) => gzipBytes(new Uint8Array([...plain.subarray(0, plain.byteLength - 1), plain[0]! ^ 0xff])));
    await runInDurableObject(env.PASTURE.getByName("swapped"), (_instance: Pasture, state) => {
      state.storage.sql.exec("UPDATE cache_sizes SET deflated = 1");
    });

    const after = await mintedInto("swapped-after", "swapped");
    const [born] = await births(after.id);
    expect(after.seen.map((one) => one.found)).toEqual(["installed"]);
    expect(after.seen[0]!.paths).toEqual([]);
    expect(born!.cache).toMatchObject({ found: "cold", kept: true });
    await inCell(after.id, async (cell) => {
      expect(await bash(cell, "tool --version")).toBe("tool 1.2.3\n");
      (await cell.runtime()).lease!.idle();
    });
    expect((await object.cacheFor(key))!.keptAt).toBeGreaterThan(kept.keptAt);
    const cold = logs().filter((line) => line.startsWith("[pen] cache cold: the container could not use the cache it was given"));
    expect(cold.length).toBe(1);
    expect(cold[0]).toContain("inflates to bytes that hash to");
  });
});

describe("fold phase 2: a warm container's description", () => {
  it("a warm setup that touched one file writes the record again, the same record, and nothing moves; the committed cache is the cold one's", { timeout: 60_000 }, async () => {
    const object = await pasture("touched", { repo: REPO });
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    const cold = await mintedInto("cold", "touched");
    await births(cold.id);
    const kept = (await object.cacheFor(key))!;
    expect(cold.stub.fakes[0]!.scratch.writes).toBeGreaterThan(0);

    const toucher = await mintedInto("toucher", "touched", { touch: true });
    const [warm] = await births(toucher.id);
    expect(toucher.seen.map((one) => one.found)).toEqual(["1.2.3"]);
    const fake = toucher.stub.fakes[0]!;
    // The walk after setup found one mtime moved, so the agent wrote the record to its scratch; its bytes are the bytes put back.
    expect(fake.scratch.writes).toBeGreaterThan(0);
    const described = descriptions(fake.transcript)[0]!;
    expect(described).toMatchObject({ hash: kept.hash, chunks: kept.chunks, files: kept.files, bytes: kept.bytes });
    // The cell had it already: no chunk asked for, nothing committed, the entry warm and neither kept nor refused.
    expect(ofType(fake.transcript, "need", "cell").filter((need) => need.id === described.id)).toEqual([]);
    expect(warm!.cache).toEqual({ found: "warm", bytes: kept.bytes, files: kept.files, ms: expect.any(Number), chunks: kept.chunks.length, stored: kept.stored, read: expect.any(Number) });
    expect((await object.cacheFor(key))!.keptAt).toBe(kept.keptAt);
  });
});

describe("fold phase 1: a cache is whole", () => {
  it("a need for the cache names up to three chunks, answered in the order asked, and no fourth blob comes between two needs", { timeout: 60_000 }, async () => {
    const object = await pasture("big", { repo: REPO });
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    const first = await mintedInto("big-first", "big", { engine: ENGINE_4 });
    const [born] = await births(first.id);
    const kept = (await object.cacheFor(key))!;
    expect(kept.chunks.length).toBe(4);
    expect(born!.cache).toEqual({ found: "cold", bytes: kept.bytes, files: 3, ms: 0, chunks: 4, stored: kept.stored, kept: true });
    // What the object holds is the record deflated: these bytes repeat, so it holds a fraction of the tree.
    expect(kept.stored).toBeLessThan(kept.bytes / 10);
    const chunks = new Set(kept.chunks);

    // Kept: the cell asked for the chunks it lacked in one `need` of two, under the window of three, and the container sent
    // them as blobs in the order asked, no fourth between two `need`s.
    const saving = first.stub.fakes[0]!.transcript;
    expect(Math.max(...chunksBetweenNeeds(saving, chunks))).toBeLessThanOrEqual(CACHE_NEED_CHUNKS);
    const saveNeeds = ofType(saving, "need", "cell").filter((need) => need.hashes.some((hash) => chunks.has(hash)));
    expect(saveNeeds.map((need) => need.hashes)).toEqual([kept.chunks.slice(0, CACHE_NEED_CHUNKS), kept.chunks.slice(CACHE_NEED_CHUNKS)]);
    expect(ofType(saving, "blob", "container").map((blob) => blob.hash).filter((hash) => chunks.has(hash))).toEqual(kept.chunks);

    // Put back: the agent asked for both in one `need`, and the cell sent them in that order.
    const second = await mintedInto("big-second", "big", { engine: ENGINE_4 });
    const [warm] = await births(second.id);
    expect(warm!.cache).toMatchObject({ found: "warm", bytes: kept.bytes, files: 3, chunks: 4, stored: kept.stored, read: expect.any(Number) });
    expect(second.seen.map((one) => one.found)).toEqual(["1.2.3"]);
    const restoring = second.stub.fakes[0]!.transcript;
    expect(Math.max(...chunksBetweenNeeds(restoring, chunks))).toBeLessThanOrEqual(CACHE_NEED_CHUNKS);
    const restoreNeeds = ofType(restoring, "need", "container").filter((need) => need.hashes.some((hash) => chunks.has(hash)));
    expect(restoreNeeds.map((need) => need.hashes)).toEqual([kept.chunks.slice(0, CACHE_NEED_CHUNKS), kept.chunks.slice(CACHE_NEED_CHUNKS)]);
    expect(ofType(restoring, "blob", "cell").map((blob) => blob.hash).filter((hash) => chunks.has(hash))).toEqual(kept.chunks);
    // What travelled is the deflated form: each blob's size is the chunk's deflated length, and the cell never held a plain one.
    const sent = ofType(restoring, "blob", "cell").filter((blob) => chunks.has(blob.hash));
    expect(sent.reduce((total, blob) => total + blob.size, 0)).toBe(kept.stored);
    // What landed is the tool, the binary of four chunks whole.
    const engine = second.stub.fakes[0]!.cache.entries.get("lib/node_modules/tool/vendor/engine.bin") as { bytes: Uint8Array; mode: number };
    expect(hashBytes(engine.bytes)).toBe(hashBytes(ENGINE_4));
    expect(engine.mode).toBe(0o755);
    for (const sheep of [first, second]) await inCell(sheep.id, async (cell) => (await cell.runtime()).lease!.idle());
  });

  it("a record over the cap is not kept, the log says so, and setup's result is unchanged", { timeout: 30_000 }, async () => {
    const logs = logLines();
    const object = await pasture("capped");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    const r = rig();
    await inEnv(
      "capped",
      "capped",
      r,
      async (cell) => {
        // Setup runs before the command, installs, and exits 0; the command runs as if nothing were refused.
        expect(await run(cell, "tool --version")).toBe("tool 1.2.3\n");
      },
      { cacheMaxBytes: 64 },
    );
    const container = r.containers[0]!;
    expect(container.runs.map((request) => request.command)).toEqual([SETUP_COMMAND, "tool --version"]);
    const asked = ofType(container.transcript, "cache", "cell")[0] as Asked;
    expect(asked.max).toBe(64);
    const described = descriptions(container.transcript)[0]!;
    expect(described.bytes).toBeGreaterThan(64);
    expect(described.chunks).toEqual([]);
    expect(ofType(container.transcript, "blob", "container")).toEqual([]);
    expect(container.scratch.entries.size).toBe(0);
    expect(logs()).toContain(`[pen] cache not kept for ${setupName(key)}: ${overCapRefusal(64)}`);
    expect(overCapRefusal(64)).toBe("it was over the cap of 64 B");
    expect(await object.cacheFor(key)).toBeUndefined();
    expect((await routeCache("capped")).cache).toBeNull();

    // An empty `/cache` is not kept either: nothing to put back.
    const blank = await pasture("blank");
    await blank.put(SETUP_PATH, encode("#!/bin/sh\ntrue\n"));
    const b = rig({ empty: true });
    await inEnv("blank", "blank", b, async (cell) => {
      expect(await run(cell, "true && node -e 0")).toBe("(no output)");
    });
    expect(descriptions(b.containers[0]!.transcript)[0]).toMatchObject({ chunks: [], bytes: 0, files: 0 });
    expect(logs().some((line) => line.endsWith(`: ${EMPTY_REFUSAL}`))).toBe(true);
    expect((await routeCache("blank")).cache).toBeNull();
  });

  it("a save cut off between two needs leaves the committed cache; its chunks go at the first commit past the hour", { timeout: 60_000 }, async () => {
    const object = await pasture("cutoff");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const before = hashBytes(encode(SETUP_SCRIPT));
    // The committed cache: two chunks, for the first script.
    const r = rig({ engine: ENGINE });
    await inEnv("cutoff-1", "cutoff", r, async (cell) => {
      expect(await run(cell, "tool --version")).toBe("tool 1.2.3\n");
    });
    const committed = (await object.cacheFor(before))!;
    expect(committed.chunks.length).toBe(2);

    // A changed script installs a new version: a save of four new chunks, cut off after the first reaches the object. Four,
    // because a `need` names three (fold phase 3): the chunks already in flight land, and the `need` for the fourth is never
    // answered, so the save never commits.
    await object.put(SETUP_PATH, encode(SETUP_CHANGED));
    const after = hashBytes(encode(SETUP_CHANGED));
    const cut = rig({ engine: ENGINE_4 });
    let puts = 0;
    await inEnv(
      "cutoff-2",
      "cutoff",
      cut,
      async (cell) => {
        const said = await run(cell, "tool --version").catch((error: Error) => error.message);
        // The container went away mid-save; setup had exited 0, and what came after is the socket's end.
        expect(said).toContain("the container");
      },
      {
        wrap: (source) => ({
          ...source,
          cachePut: async (save, hash, bytes) => {
            await source.cachePut(save, hash, bytes);
            if (++puts === 1) cut.containers.at(-1)!.stop("cut between chunks");
          },
        }),
      },
    );
    // The first put cut the container; the two behind it in the same `need` still landed, and the fourth never was asked for again.
    expect(puts).toBeGreaterThanOrEqual(1);
    expect(puts).toBeLessThan(4);
    // The committed cache is as it was, for the first script; nothing is kept for the second.
    expect((await routeCache("cutoff")).cache).toMatchObject({ setup: before, keptAt: committed.keptAt, current: false });
    expect(await object.cacheFor(after)).toBeUndefined();
    expect(await object.cacheFor(before)).toEqual(committed);
    // The cut save's chunks are in the object, claimed and not named: as many as were put, no more.
    const orphans = (await chunkHashes("cutoff")).filter((hash) => !committed.chunks.includes(hash));
    expect(orphans.length).toBe(puts);

    // The committed one still puts back whole: the first script again, a fresh container, warm, the binary whole.
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const again = rig({ engine: ENGINE });
    await inEnv("cutoff-3", "cutoff", again, async (cell) => {
      expect(await run(cell, "tool --version")).toBe("tool 1.2.3\n");
    });
    expect(again.seen.map((one) => one.found)).toEqual(["1.2.3"]);
    expect(hashBytes((again.containers[0]!.cache.entries.get("lib/node_modules/tool/vendor/engine.bin") as { bytes: Uint8Array }).bytes)).toBe(hashBytes(ENGINE));

    // Within the hour a commit leaves the cut save's chunk; past it, the next commit takes it.
    const synthetic = async (label: string) => {
      const bytes = encode(`synthetic chunk ${label}`);
      const hash = hashBytes(bytes);
      const save = `synthetic-${label}`;
      expect(await object.cacheMissing(save, [hash])).toEqual([hash]);
      await object.cachePut(save, hash, bytes);
      return object.cacheCommit(save, { key: `key-${label}`, hash: hashBytes(encode(hash)), chunks: [hash], files: 1, bytes: bytes.byteLength, by: "the test" });
    };
    const within = await synthetic("within");
    for (const orphan of orphans) expect(await chunkHashes("cutoff")).toContain(orphan);
    await runInDurableObject(env.PASTURE.getByName("cutoff"), (instance: Pasture) => {
      instance.clock = () => Date.now() + 2 * 60 * 60 * 1000;
    });
    const last = await synthetic("past");
    const left = await chunkHashes("cutoff");
    for (const orphan of orphans) expect(left).not.toContain(orphan);
    // What is left is what the two kept saves name, the last commit's and the one before it; the first script's went with its generation.
    expect(left).toEqual([last.chunks[0]!, within.chunks[0]!].sort());
  });

  it("a restore racing one commit still finds its chunks and puts back whole; racing two it runs cold, with /cache emptied and the log saying so", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const object = await pasture("race");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const key = hashBytes(encode(SETUP_SCRIPT));
    const r = rig({ engine: ENGINE });
    await inEnv("race-1", "race", r, async (cell) => {
      expect(await run(cell, "tool --version")).toBe("tool 1.2.3\n");
    });
    const kept = (await object.cacheFor(key))!;
    expect(kept.chunks.length).toBe(2);

    let label = 0;
    /** Another sheep's commit, landing between two chunks of the put-back; through the stub the cell's own object made. */
    const commitAnother = async (object: DurableObjectStub<Pasture>) => {
      label++;
      const bytes = encode(`another sheep's chunk ${label}`);
      const hash = hashBytes(bytes);
      await object.cacheMissing(`another-${label}`, [hash]);
      await object.cachePut(`another-${label}`, hash, bytes);
      await object.cacheCommit(`another-${label}`, { key: `another-key-${label}`, hash: hashBytes(encode(hash)), chunks: [hash], files: 1, bytes: bytes.byteLength, by: "another sheep" });
    };

    // One commit between the first chunk and the second: the save being put back is the one before now, and still whole.
    const once = rig({ engine: ENGINE });
    let reads = 0;
    await inEnv(
      "race-2",
      "race",
      once,
      async (cell) => {
        expect(await run(cell, "tool --version")).toBe("tool 1.2.3\n");
      },
      {
        wrap: (source, inside) => ({
          ...source,
          cacheChunk: async (hash) => {
            const bytes = await source.cacheChunk(hash);
            if (++reads === 1) await commitAnother(inside);
            return bytes;
          },
        }),
      },
    );
    expect(reads).toBe(2);
    expect(once.seen.map((one) => one.found)).toEqual(["1.2.3"]);
    const whole = once.containers[0]!.cache;
    expect(hashBytes((whole.entries.get("lib/node_modules/tool/vendor/engine.bin") as { bytes: Uint8Array }).bytes)).toBe(hashBytes(ENGINE));
    expect(toolIn(whole)).toBe("1.2.3");

    // Put the script's cache back as the committed one, then race two commits: the put-back's save is gone, and it runs cold.
    const r3 = rig({ engine: ENGINE });
    await object.put(SETUP_PATH, encode(`${SETUP_SCRIPT}# again\n`));
    const againKey = hashBytes(encode(`${SETUP_SCRIPT}# again\n`));
    await inEnv("race-3", "race", r3, async (cell) => {
      expect(await run(cell, "tool --version")).toBe("tool 1.2.3\n");
    });
    const againKept = (await object.cacheFor(againKey))!;
    const twice = rig({ engine: ENGINE });
    let twiceReads = 0;
    await inEnv(
      "race-4",
      "race",
      twice,
      async (cell) => {
        expect(await run(cell, "tool --version")).toBe("tool 1.2.3\n");
      },
      {
        wrap: (source, inside) => ({
          ...source,
          cacheChunk: async (hash) => {
            const bytes = await source.cacheChunk(hash);
            if (++twiceReads === 1) {
              await commitAnother(inside);
              await commitAnother(inside);
            }
            return bytes;
          },
        }),
      },
    );
    // The second chunk was gone: the agent emptied `/cache`, setup found it empty, installed, and the sync-in was whole.
    expect(twiceReads).toBe(2);
    expect(twice.seen.map((one) => one.found)).toEqual(["installed"]);
    expect(twice.seen[0]!.paths).toEqual([]);
    const refusal = ofType(twice.containers[0]!.transcript, "error", "cell").find((frame) => frame.of === "need");
    expect(refusal).toMatchObject({ code: "refused", of: "need", id: ofType(twice.containers[0]!.transcript, "manifest", "cell")[0]!.id });
    expect(ofType(twice.containers[0]!.transcript, "checkout", "container").length).toBeGreaterThan(0);
    expect(logs().some((line) => line.startsWith("[pen] cache cold: the pasture no longer has chunk ") && line.includes(againKept.chunks[1]!.slice(0, 12)))).toBe(true);
    // And what it left was kept anew, whole, for its script.
    expect((await object.cacheFor(againKey))!.hash).toBe(againKept.hash);
  });

  it("a sheep in no pasture, and a pasture with no setup.sh, are sent no cache and asked for none", { timeout: 30_000 }, async () => {
    // No pasture: the env has none, and nothing about a cache crosses the socket.
    let loner: FakeContainer | undefined;
    await runInDurableObject(env.SESSION_CELL.getByName("cache:loner"), async (_instance, state) => {
      // Made inside the object whose socket it is: I/O made in one Durable Object cannot be used from another.
      loner = startFakeContainer({ script: () => ({ steps: [{ stdout: "ok\n" }], exit: 0 }) });
      const socket = loner.socket;
      state.storage.sql.exec("DROP TABLE IF EXISTS files");
      state.storage.sql.exec("DROP TABLE IF EXISTS file_chunks");
      const cell = new CellExecutionEnv(state.storage.sql, { container: { rent: async () => socket, idle() {} } });
      expect(await run(cell, "node -e 0")).toBe("ok\n");
      loner.stop("the test is over");
    });
    expect(ofType(loner!.transcript, "manifest", "cell")[0]!.cache).toBeUndefined();
    expect(ofType(loner!.transcript, "cache")).toEqual([]);

    // A pasture without `setup.sh`: its tree is sent, its cache is not looked for, and no description is asked.
    const object = await pasture("plain");
    await object.put("BRIEF.md", encode("Be brief.\n"));
    const r = rig();
    await inEnv("plain", "plain", r, async (cell) => {
      expect(await run(cell, "tool --version").catch((error: Error) => error.message)).toContain("bash: tool: command not found");
    });
    const manifest = ofType(r.containers[0]!.transcript, "manifest", "cell")[0]!;
    expect(manifest.pasture?.map((entry) => entry.path)).toEqual(["BRIEF.md"]);
    expect(manifest.cache).toBeUndefined();
    expect(ofType(r.containers[0]!.transcript, "cache")).toEqual([]);
    expect(r.seen).toEqual([]);
    expect((await routeCache("plain")).cache).toBeNull();
  });
});

describe("fold phase 1: the birth's words", () => {
  it("the sentences for ~ and the cache, and an entry from before them projects as it did", () => {
    const base: BirthData = { pasture: "tools", repo: REPO, branch: "main", command: birthCommand(REPO, "main"), cwd: WORKSPACE_ROOT, exit: 0, output: "", truncated: false, setup: { exit: 0 } };
    const old = birthText(base);
    expect(old).toBe(`This session was born into the pasture tools: \`${base.command}\` ran in /workspace in a container, before the first prompt and exited 0, so /workspace is a clone of ${REPO} on branch main. ${setupSentence({ exit: 0 })}`);
    const cases: Array<[CacheOutcome, string]> = [
      [{ found: "warm", bytes: 148_000_000, files: 5210, ms: 3100 }, "The pasture's cache for this setup.sh was put back into /cache first, 148 MB in 3.1 s."],
      [{ found: "warm", bytes: 148_000_000, files: 5210, ms: 3100, kept: true }, "The pasture's cache for this setup.sh was put back into /cache first, 148 MB in 3.1 s; setup changed it, and what it left was kept."],
      [{ found: "warm", bytes: 1_500_000, files: 3, ms: 250, refused: OWN_SECRET_REFUSAL }, `The pasture's cache for this setup.sh was put back into /cache first, 1.5 MB in 0.3 s; what setup left in /cache was not kept: ${OWN_SECRET_REFUSAL}.`],
      [{ found: "cold", bytes: 148_000_000, files: 5210, ms: 0, kept: true }, "The pasture had no cache for this setup.sh, so setup ran cold, and what it left in /cache was kept, 148 MB."],
      [{ found: "cold", bytes: 2_000_000_000, files: 9, ms: 0, refused: overCapRefusal(1024 * 1024 * 1024) }, "The pasture had no cache for this setup.sh, so setup ran cold, and what it left in /cache was not kept: it was over the cap of 1.1 GB."],
      [{ found: "cold", bytes: 0, files: 0, ms: 0 }, "The pasture had no cache for this setup.sh, so setup ran cold."],
    ];
    for (const [cache, sentence] of cases) {
      expect(cacheSentence(cache)).toBe(sentence);
      const data: BirthData = { ...base, home: HOME_ROOT, cache };
      expect(birthText(data)).toBe(`${old} Its home directory, ~, is ${HOME_ROOT}, and is kept with the session. ${sentence}`);
      // Read back off the entry as `sheep log --json` has it.
      const entry = { type: "custom", customType: BIRTH_ENTRY, data: JSON.parse(JSON.stringify(data)), id: "e", parentId: null, timestamp: 1 } as unknown as Parameters<typeof birthData>[0];
      expect(birthData(entry)).toEqual(data);
    }
    // An entry written before fold: no `~`, no cache, the text it always had.
    const before = { type: "custom", customType: BIRTH_ENTRY, data: JSON.parse(JSON.stringify(base)), id: "e", parentId: null, timestamp: 1 } as unknown as Parameters<typeof birthData>[0];
    expect(birthData(before)).toEqual(base);
    expect(birthText(birthData(before)!)).toBe(old);
  });
});
