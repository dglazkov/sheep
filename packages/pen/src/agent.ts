/**
 * The agent: the container's side of the protocol, as code that runs
 * anywhere. Given a socket and a disk it answers the cell's frames. The
 * process in the image (`node.ts`) hands it Node's WebSocket and a disk
 * over `node:fs` under `/workspace`; the cell's tests hand it one end of
 * a `WebSocketPair` and a disk in memory. There is one agent, not a real
 * one and a fake one: the fake is this file over a different disk.
 *
 * Phase 1 speaks the checkout: `manifest` in, `changed` out, blobs by
 * hash both ways, the cache rule applied on this side to what it reports
 * and to what a sync-in may delete. Phase 2 speaks `run`: the command
 * goes to a `Runner`, the second thing injected beside the disk, its
 * output is sent as it comes, and when it ends the agent describes what
 * it changed without being asked. A run has its own lane: the frames
 * that arrive while it runs (`ping`, `kill`) are answered at once, not
 * queued behind it. Phase 4 carries a credential: `askCredential` is the
 * helper's path in, called by the Unix socket server in `node.ts` and by
 * a test directly; the agent sends `credential` up, and the cell's
 * `credential` or `error` under the same id settles it. The value goes
 * back to the caller and is held nowhere else: not logged, not kept, and
 * never part of a `stdout` or `stderr` frame.
 *
 * Serve phase 0 gives it a third thing to be handed, a `Fetcher`, and the
 * forward: a `fetch` frame is answered by asking the fetcher for a server
 * in the container and sending `response` and its bytes back to back. It
 * is handled off the frame chain for the same reason a run is — a page
 * makes its requests all at once, and one waiting on another is a page
 * that renders in series — and a fetch the fetcher could not make is a
 * `response` with status `0` and the error's text, which the cell reads
 * as the server not being there.
 *
 * Pasture phase 3 gives the agent a second disk, the pasture's, rooted at
 * `/pasture` beside the checkout. A `manifest` that carries `pasture` is
 * applied to it after the workspace: files `0444`, directories `0555`,
 * blobs asked for in the one `need`, and what the manifest no longer
 * names removed. The sync-out walks the checkout's disk alone, so nothing
 * written under `/pasture` is ever reported: the two disks are two trees,
 * as `/workspace` and `/pasture` are in the image.
 *
 * Fold phase 0 gives it a third disk, a sheep's `~`, rooted at
 * `/home/sheep`, and this one syncs both ways. A `manifest` that carries
 * `home` is applied to it after the workspace, under the home rule: what
 * the manifest names is written, and what it does not name is deleted
 * unless the rule keeps it. The sync-out after such a manifest walks `~`
 * beside the checkout, under the same rule, and reports it as
 * `changed.home`; `synced.home` says what the cell refused there. What the
 * agent knows is kept per root, so the two trees are compared each with
 * its own last sync; a manifest without `home` leaves `~` as it is, and
 * the agent forgets it until one carries it again.
 *
 * Fold phase 3: a chunk of a put-back the container cannot use — one that
 * does not inflate, or whose inflated bytes are not the hash it was asked
 * for, which is what a cache kept before the chunks were deflated looks
 * like — ends the put-back the way a chunk the object no longer has does:
 * `/cache` empty, `checkout` said, setup cold, and the cell told why. The
 * sync-in completes and the container stays usable; a sheep's command is
 * not where a bad cache is reported.
 *
 * Fold phase 3: a chunk is gzipped where it is made and inflated where it
 * lands, and its hash stays over its plain bytes, so the scratch, the
 * socket, and the pasture's object all hold the deflated form and nothing
 * about a record's identity depends on a zlib. A `need` for the cache may
 * name up to three chunks, answered in the order asked, in both
 * directions.
 *
 * Fold phase 1 gives it a fourth disk, the pasture's cache, rooted at
 * `/cache`, and a scratch for the chunks a description made. Neither is
 * ever walked by a sync-out. A `manifest` that carries `cache` is put back
 * after the files land: `/cache` emptied, then one chunk asked for per
 * `need`, each written through the record's reader as it arrives, and
 * `checkout` said only when the last is written. A `cache` frame is
 * answered by writing `/cache` as a record to the scratch, in chunks, and
 * describing it; the cell asks for what it lacks, one chunk per `need`,
 * and its `synced` lets the scratch go. A chunk the cell refuses during a
 * put-back empties `/cache` and ends the sync-in whole, cold.
 *
 * Fold phase 2: the put-back's walk of what it wrote under `/cache` is
 * kept (each path's kind, mode, size, and mtime), and a `cache` frame whose
 * walk of `/cache` finds exactly that, no more and no fewer, is answered
 * with the record that was put back, and nothing is written to the
 * scratch: setup changed nothing, and a warm container learns so from a
 * stat walk rather than a record.
 */
import ignore from "ignore";
import { Chunker, emptyDisk, gunzipBytes, gzipBytes, RecordReader, writeRecord } from "./record.ts";
import {
  BUILT_IN_IGNORES,
  CACHE_CHUNK_BYTES,
  CACHE_NEED_CHUNKS,
  type CacheRef,
  type CellFrame,
  type ChangedEntry,
  type ContainerFrame,
  type CredentialAnswer,
  type CredentialRequest,
  decodeFrame,
  encodeFrame,
  type EntryKind,
  FETCH_FAILED_STATUS,
  type FetchFrame,
  HOME_IGNORES,
  type HomeChanged,
  homePath,
  type ManifestEntry,
  messageBytes,
  PASTURE_DIR_MODE,
  PASTURE_FILE_MODE,
  recordHashInput,
  type Refused,
} from "./protocol.ts";

export { Chunker, emptyDisk, gunzipBytes, gzipBytes, RecordError, RecordReader, writeRecord } from "./record.ts";

export interface DiskEntry {
  /** Relative to the checkout root, no leading slash. */
  path: string;
  kind: EntryKind;
  mode: number;
  /**
   * Fold phase 2, what a disk may say beside the three, each optional so a
   * disk that cannot say leaves it out. `size`: a file's bytes, a symlink's
   * target's. `mtime`: when its content was last written, in milliseconds;
   * with `size`, what the put-back's stat of `/cache` keeps. `file`: an
   * identity the entries share when they are one file under two names (a
   * hard link), absent for a file with one name; the record writes such a
   * file's bytes once.
   */
  size?: number;
  mtime?: number;
  file?: string;
}

/**
 * What the agent needs of a filesystem. The checkout root is the disk's
 * own business; every path here is relative to it. Writes create parents;
 * `remove` is recursive and quiet about a path that is not there.
 */
export interface Disk {
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array, options?: { mode?: number }): Promise<void>;
  mkdir(path: string, mode: number): Promise<void>;
  /** Replaces whatever is at `path`. */
  symlink(target: string, path: string): Promise<void>;
  /**
   * Fold phase 2: replaces whatever is at `path` with a second name for the
   * file at `existing`, a hard link. Optional: a record read onto a disk
   * without it writes the later name as a copy of the earlier one.
   */
  link?(existing: string, path: string): Promise<void>;
  readlink(path: string): Promise<string>;
  chmod(path: string, mode: number): Promise<void>;
  /** Every entry under the root, the root excluded, sorted by path. Applies no rule; the agent does. */
  list(): Promise<DiskEntry[]>;
  remove(path: string): Promise<void>;
  /** SHA-256, lowercase hex. On the disk so Node can use `node:crypto` and a test WebCrypto. */
  digest(bytes: Uint8Array): Promise<string>;
}

/** One command to run, as the cell asked for it. */
export interface RunRequest {
  id: string;
  command: string;
  /** Absolute, under the checkout root's mount (`/workspace/...`). */
  cwd: string;
  /** Laid over the process's own environment; the container's `PATH` and `HOME` win by not being here. */
  env: Record<string, string>;
  /** Seconds; absent for no limit. The runner's own backstop, beside the cell's timer. */
  timeout?: number;
}

/** Where a run's output goes as it happens. Chunks are text; the runner decodes. */
export interface RunOutput {
  stdout(data: string): void;
  stderr(data: string): void;
}

/** How a run ended: on its own with a code, or early for a reason, in which case no code exists. */
export type RunOutcome = { exit: number } | { killed: string };

/** A run in progress: its end, and a way to end it early. `kill` after the end is a no-op. */
export interface RunHandle {
  outcome: Promise<RunOutcome>;
  kill(reason: string): void;
}

/**
 * What the agent needs of a process runner. The image runs `bash -c`
 * under `/workspace`; the cell's tests run a script the test wrote, since
 * workerd has no processes. That is the one place the fake is not the
 * thing; the protocol around it is the agent's own in both.
 */
export interface Runner {
  run(request: RunRequest, output: RunOutput): RunHandle;
}

/** One request the cell forwarded from the browser, for a server the container is running. */
export interface FetchRequest {
  /** The loopback port the server listens on. */
  port: number;
  method: string;
  /** The path and query alone; the fetcher puts the loopback address in front of it. */
  url: string;
  headers: Record<string, string>;
  /** The request's body, when it has one. */
  body?: Uint8Array;
}

/** What the server answered: its status, its headers, and its bytes, which may be empty. */
export interface FetchResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/**
 * What the agent needs to reach a server inside the container. `node.ts`
 * builds one over Node's `fetch` at the loopback address; the cell's tests
 * hand over a table of responses, since workerd has no ports and the fake
 * container cannot answer one. A fetcher that rejects is a server that is
 * not there, and the agent says so with status `0` rather than an error
 * frame: the cell reads it as not ready during a poll and as a failed
 * request during a look.
 */
export interface Fetcher {
  fetch(request: FetchRequest): Promise<FetchResponse>;
}

/**
 * The part of a WebSocket the agent uses, so the same code takes workerd's
 * and Node's without either's types. Binary messages go out as views.
 */
export interface AgentSocket {
  send(data: string | Uint8Array): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: unknown) => void): void;
}

/** A symlink's permission bits are not its own; the cell's rows say 0o777 and so does the agent. */
const SYMLINK_MODE = 0o777;
const GITIGNORE = ".gitignore";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** What the agent knows to be at a path: written at a sync-in or accepted at a sync-out. */
interface Known {
  kind: EntryKind;
  mode: number;
  hash: string | null;
}

interface Scanned extends Known {
  size: number;
}

/**
 * The cache rule: the built-in list at any depth, then the checkout's own
 * `.gitignore` at the root. Directories are tested with a trailing slash,
 * as git does, so `dist/` in the file keeps `dist` and everything under it.
 */
export function cacheRule(gitignore: string | undefined): (path: string, kind: EntryKind) => boolean {
  const rules = ignore().add([...BUILT_IN_IGNORES]);
  if (gitignore !== undefined) rules.add(gitignore);
  return (path, kind) => rules.ignores(kind === "directory" ? `${path}/` : path);
}

/**
 * The home rule (fold phase 0): what stays in the container under `~`.
 * `HOME_IGNORES` at the root of `~` only, anchored as a leading slash
 * anchors a `.gitignore` line, and `BUILT_IN_IGNORES` at any depth. No
 * file is read: `~` is not a repository.
 */
export function homeRule(): (path: string, kind: EntryKind) => boolean {
  const rules = ignore().add([...HOME_IGNORES.map((name) => `/${name}`), ...BUILT_IN_IGNORES]);
  return (path, kind) => rules.ignores(kind === "directory" ? `${path}/` : path);
}

/** The entries of a disk with their hashes and sizes, as a sync compares them. */
async function hashed(disk: Disk, entries: DiskEntry[]): Promise<Map<string, Scanned>> {
  const state = new Map<string, Scanned>();
  for (const entry of entries) {
    if (entry.kind === "directory") {
      state.set(entry.path, { kind: "directory", mode: entry.mode, hash: null, size: 0 });
    } else if (entry.kind === "symlink") {
      const target = encoder.encode(await disk.readlink(entry.path));
      state.set(entry.path, { kind: "symlink", mode: SYMLINK_MODE, hash: await disk.digest(target), size: target.byteLength });
    } else {
      const bytes = await disk.read(entry.path);
      state.set(entry.path, { kind: "file", mode: entry.mode, hash: await disk.digest(bytes), size: bytes.byteLength });
    }
  }
  return state;
}

/**
 * What a sync-out reports for one root: every entry the walk found that is
 * not what the agent knows of it, and every known path no longer on disk
 * at all. A path the rule now hides but that is still there is neither.
 */
function diffed(state: Map<string, Scanned>, present: Set<string>, known: Map<string, Known>): { entries: ChangedEntry[]; deleted: string[] } {
  const entries: ChangedEntry[] = [];
  for (const [path, now] of state) {
    const was = known.get(path);
    if (was !== undefined && was.kind === now.kind && was.mode === now.mode && was.hash === now.hash) continue;
    entries.push({ path, kind: now.kind, mode: now.mode, hash: now.hash, size: now.size });
  }
  const deleted = [...known.keys()].filter((path) => !present.has(path)).sort();
  return { entries, deleted };
}

/** After a sync-out, what the agent knows of one root: what the cell took, and nothing it refused or that was deleted. */
function accepted(known: Map<string, Known>, entries: ChangedEntry[], deleted: string[], refused: Refused[]): void {
  const refusedPaths = new Set(refused.map((entry) => entry.path));
  for (const entry of entries) {
    if (refusedPaths.has(entry.path)) continue;
    known.set(entry.path, { kind: entry.kind, mode: entry.mode, hash: entry.hash });
  }
  for (const path of deleted) known.delete(path);
}

class ProtocolError extends Error {
  readonly code: "malformed" | "mismatch" | "failed";
  /** The frame type the error is about. */
  readonly of: string;
  constructor(code: "malformed" | "mismatch" | "failed", of: string, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
    this.of = of;
  }
}

export interface ServedAgent {
  /** Resolves when the socket closes; the agent sends nothing after. */
  closed: Promise<void>;
  /**
   * Describes what changed since the last sync under `id` and sends the
   * bytes the cell asks for. Resolves with what the cell refused once it
   * says `synced`. A later phase calls this after every `run`; a test
   * calls it in place of one.
   */
  syncOut(id: string): Promise<Refused[]>;
  /**
   * The helper's path: asks the cell for a credential and resolves with the
   * home's answer, or with `undefined` when the cell refused it, the wait
   * ran out, or the socket is gone. The answer is the caller's to hand on
   * and forget.
   */
  askCredential(request: CredentialRequest, options?: { timeoutMs?: number }): Promise<CredentialAnswer | undefined>;
}

/** How long the helper waits for the cell's answer before git is told there is none. */
export const CREDENTIAL_TIMEOUT_MS = 10_000;

export interface ServeAgentOptions {
  /** Pasture phase 3: the disk rooted at `/pasture`, written read-only from a manifest's second root. Absent, a manifest's `pasture` is ignored. */
  pasture?: Disk;
  /** Fold phase 0: the disk rooted at `/home/sheep`, a sheep's `~`, synced both ways from a manifest's third root. Absent, a manifest's `home` is ignored and no sync-out reports `~`. */
  home?: Disk;
  /** Fold phase 1: the disk rooted at `/cache`, the pasture's cache, put back from a manifest's `cache` and described on a `cache` frame. Absent, a manifest's `cache` is ignored and a `cache` frame is unsupported. */
  cache?: Disk;
  /** Fold phase 1: where a description's chunks wait for the cell's `need`s, emptied before each description and after its `synced`. Needed with `cache`. */
  scratch?: Disk;
}

/** Wires the agent to a socket. Frames are handled in the order they arrive, one at a time; a run's work, and a fetch's, are not on that chain. */
export function serveAgent(socket: AgentSocket, disk: Disk, runner: Runner, fetcher: Fetcher, options: ServeAgentOptions = {}): ServedAgent {
  const agent = new Agent(socket, disk, runner, fetcher, options);
  return { closed: agent.closed, syncOut: (id) => agent.syncOut(id), askCredential: (request, options) => agent.askCredential(request, options) };
}

/** A sync-in's second or third root: that root's manifest and what its disk had before. */
interface RootCheckout {
  entries: ManifestEntry[];
  have: Map<string, Scanned>;
}

class Agent {
  private readonly socket: AgentSocket;
  private readonly disk: Disk;
  private readonly pasture: Disk | undefined;
  private readonly home: Disk | undefined;
  /** Fold phase 1: `/cache`, and the scratch its descriptions are written to; both or neither. */
  private readonly cacheDisk: Disk | undefined;
  private readonly scratch: Disk | undefined;
  private readonly runner: Runner;
  private readonly fetcher: Fetcher;
  readonly closed: Promise<void>;
  private isClosed = false;
  private tail = Promise.resolve();
  /** The run in progress, at most one. */
  private running: { id: string; handle: RunHandle } | null = null;
  /** What is on the checkout's disk as far as the last sync said. */
  private known = new Map<string, Known>();
  /** What is on `~`'s disk as far as the last sync said; `null` while no manifest has carried `home`, and then no sync-out walks it. */
  private knownHome: Map<string, Known> | null = null;
  /** A sync-in in progress: the manifest and the blobs still to come; `pasture` and `home` when the manifest carried those roots and this agent has their disks. */
  private checkout: {
    id: string;
    entries: ManifestEntry[];
    have: Map<string, Scanned>;
    needed: Set<string>;
    blobs: Map<string, Uint8Array>;
    pasture: RootCheckout | null;
    home: RootCheckout | null;
    /** The cache to put back once the files are written, when the manifest carried one and this agent has `/cache`. */
    cache: CacheRef | null;
  } | null = null;
  /**
   * A put-back in progress (fold phase 1): the sync-in it belongs to, the
   * chunks in order, the one to land next, how many have been asked for
   * (fold phase 3: up to three at a time), and the reader writing them onto
   * `/cache`. `checkout` waits for it.
   */
  private restoring: { id: string; ref: CacheRef; next: number; asked: number; reader: RecordReader } | null = null;
  /**
   * Fold phase 2: the last put-back, whole: the record it was, its counts,
   * and `/cache` as the walk after its last write found it, path by path.
   * `null` before any, from the moment another begins, when one is cut
   * off, or when the disk cannot say a size and an mtime.
   */
  private putBack: { ref: CacheRef; files: number; bytes: number; stat: Map<string, string> } | null = null;
  /**
   * A description the cell has not said `synced` to: its id, and by the
   * chunk's own hash what lies on the scratch for it (fold phase 3: the
   * deflated bytes, their own digest, and their length).
   */
  private describing: { id: string; chunks: Map<string, { stored: string; size: number }> } | null = null;
  /**
   * The frame whose binary message is next, and whose it is: a `blob`'s
   * bytes during a sync-in, a `fetch`'s body during a look. There is at
   * most one, which is the guard: a second announcer arriving before the
   * first one's bytes is a socket whose two lanes have collided, and
   * `handle` throws on any frame at all while this is set.
   */
  private expecting: { of: "blob"; hash: string; size: number; drop?: true } | { of: "fetch"; frame: FetchFrame } | null = null;
  /**
   * Chunks of a put-back this agent ended early: the rest of the `need` it
   * had asked for, already on their way. Their `blob`s and bytes are read
   * off the socket and dropped, so the frames stay in step and the socket
   * lives on.
   */
  private dropping = new Set<string>();
  /** A sync-out in progress; `home` when it reported `~`. */
  private out: {
    id: string;
    entries: ChangedEntry[];
    deleted: string[];
    home: HomeChanged | undefined;
    resolve: (refused: Refused[]) => void;
    reject: (error: Error) => void;
  } | null = null;
  /** Credential requests waiting on the cell, by id. */
  private credentials = new Map<string, { settle: (answer: CredentialAnswer | undefined) => void }>();
  private credentialCount = 0;

  constructor(socket: AgentSocket, disk: Disk, runner: Runner, fetcher: Fetcher, options: ServeAgentOptions) {
    this.socket = socket;
    this.disk = disk;
    this.pasture = options.pasture;
    this.home = options.home;
    this.cacheDisk = options.cache !== undefined && options.scratch !== undefined ? options.cache : undefined;
    this.scratch = this.cacheDisk === undefined ? undefined : options.scratch;
    this.runner = runner;
    this.fetcher = fetcher;
    socket.addEventListener("message", (event) => {
      this.tail = this.tail.then(() => this.receive(event.data));
    });
    this.closed = new Promise<void>((resolve) => {
      socket.addEventListener("close", () => {
        this.isClosed = true;
        this.out?.reject(new Error("the socket closed during a sync-out"));
        this.out = null;
        // A container that loses its socket stops its command.
        this.running?.handle.kill("the socket closed");
        for (const pending of this.credentials.values()) pending.settle(undefined);
        this.credentials.clear();
        resolve();
      });
    });
  }

  private send(frame: ContainerFrame): void {
    if (this.isClosed) return;
    this.socket.send(encodeFrame(frame));
  }

  private sendBytes(bytes: Uint8Array): void {
    if (this.isClosed) return;
    this.socket.send(bytes);
  }

  private async receive(data: unknown): Promise<void> {
    let of = "binary";
    try {
      if (typeof data === "string") {
        let frame: CellFrame;
        try {
          frame = decodeFrame(data) as CellFrame;
        } catch (error) {
          throw new ProtocolError("malformed", "?", error instanceof Error ? error.message : String(error));
        }
        of = frame.type;
        await this.handle(frame);
      } else {
        const bytes = await messageBytes(data);
        if (bytes === undefined) throw new ProtocolError("malformed", of, "a binary message the agent cannot read");
        await this.handleBytes(bytes);
      }
    } catch (error) {
      // Whatever failed, the sync it was part of is over, and the cell is told.
      this.checkout = null;
      this.expecting = null;
      // A put-back cut off leaves no half of a cache behind: `/cache` goes empty, and the next setup runs cold.
      if (this.restoring !== null && this.cacheDisk !== undefined) {
        this.restoring = null;
        this.putBack = null;
        await emptyDisk(this.cacheDisk).catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof ProtocolError) this.send({ type: "error", code: error.code, of: error.of, message });
      else this.send({ type: "error", code: "failed", of, message });
    }
  }

  private async handle(frame: CellFrame): Promise<void> {
    if (this.expecting !== null) {
      // Two announcers, one binary message: whichever frame this is, the bytes on the way now belong to nobody.
      const announced = this.expecting.of === "blob" ? `blob ${this.expecting.hash}` : `fetch ${this.expecting.frame.id}`;
      throw new ProtocolError("malformed", frame.type, `expected the bytes of ${announced}, got a ${frame.type} frame`);
    }
    switch (frame.type) {
      case "ping":
        this.send(frame.id === undefined ? { type: "pong" } : { type: "pong", id: frame.id });
        return;
      case "manifest":
        await this.receiveManifest(frame.id, frame.entries, frame.pasture, frame.home, frame.cache);
        return;
      case "blob": {
        const restoring = this.restoring;
        // A chunk of a put-back this agent has given up on: read off the socket and dropped.
        if (this.dropping.has(frame.hash)) {
          this.expecting = { of: "blob", hash: frame.hash, size: frame.size, drop: true };
          return;
        }
        // The chunks land in the order they were asked for: the next one is the one this `blob` must name.
        const chunk = restoring !== null && restoring.next < restoring.asked && restoring.ref.chunks[restoring.next] === frame.hash;
        if (!chunk && (this.checkout === null || !this.checkout.needed.has(frame.hash))) {
          throw new ProtocolError("malformed", "blob", `no sync-in is waiting for blob ${frame.hash}`);
        }
        this.expecting = { of: "blob", hash: frame.hash, size: frame.size };
        return;
      }
      case "cache":
        await this.describe(frame.id, frame.max);
        return;
      case "fetch":
        // A body's bytes are the next message; without one there is nothing to wait for and the fetch goes at once.
        if (frame.size > 0) this.expecting = { of: "fetch", frame };
        else this.forward(frame, undefined);
        return;
      case "need":
        await this.answerNeed(frame.id, frame.hashes);
        return;
      case "sync":
        // Not awaited: the answer is `changed`, and the dance runs on frames that arrive behind this one.
        this.syncOut(frame.id).catch((error: unknown) => {
          this.send({ type: "error", code: "failed", of: "sync", message: error instanceof Error ? error.message : String(error) });
        });
        return;
      case "synced":
        if (this.describing !== null && this.describing.id === frame.id) {
          // The cell is done with the description, whatever it kept: the chunks on the scratch go.
          this.describing = null;
          if (this.scratch !== undefined) await emptyDisk(this.scratch);
          return;
        }
        this.finishSyncOut(frame.id, frame.refused, frame.home ?? []);
        return;
      case "run":
        // Not awaited: the run has its own lane, so `ping` and `kill` are answered while it runs.
        this.startRun(frame);
        return;
      case "kill":
        // A kill for a run that already ended is ignored: `exit` is on its way, and the cell takes either.
        if (this.running !== null && this.running.id === frame.id) this.running.handle.kill(frame.reason);
        return;
      case "credential": {
        // An answer no one is waiting for (the wait ran out first) is dropped, value and all; nothing is said, since the value must not be repeated.
        const { id, ...answer } = frame;
        this.settleCredential(id, answer.value === undefined ? undefined : { ...(answer.username === undefined ? {} : { username: answer.username }), value: answer.value, expires: answer.expires });
        return;
      }
      case "error":
        if (frame.of === "credential" && frame.id !== undefined) this.settleCredential(frame.id, undefined);
        // The cell could not give a chunk of the cache it is putting back: the cache moved under the put-back. `/cache` goes
        // empty, the files are already written, and the sync-in ends whole; setup runs cold.
        if (frame.of === "need" && this.restoring !== null && frame.id === this.restoring.id && this.cacheDisk !== undefined) {
          const { id } = this.restoring;
          this.restoring = null;
          await emptyDisk(this.cacheDisk);
          this.send({ type: "checkout", id });
        }
        return;
      default: {
        // Every frame the protocol names is handled above; one it does not is answered, not dropped.
        const { type } = frame as { type: string };
        this.send({ type: "error", code: "unsupported", of: type, message: `the agent does not handle ${type}` });
      }
    }
  }

  /** Starts the runner, streams its output, and when it ends says how and then what changed. */
  private startRun(frame: Extract<CellFrame, { type: "run" }>): void {
    if (this.running !== null) {
      this.send({ type: "error", code: "failed", of: "run", message: `a run (${this.running.id}) is already in progress` });
      return;
    }
    const id = frame.id;
    let handle: RunHandle;
    try {
      handle = this.runner.run(
        { id, command: frame.command, cwd: frame.cwd, env: frame.env, ...(frame.timeout === undefined ? {} : { timeout: frame.timeout }) },
        {
          stdout: (data) => this.send({ type: "stdout", id, data }),
          stderr: (data) => this.send({ type: "stderr", id, data }),
        },
      );
    } catch (error) {
      this.send({ type: "error", code: "failed", of: "run", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    this.running = { id, handle };
    handle.outcome
      .then((outcome) => {
        this.running = null;
        if ("exit" in outcome) this.send({ type: "exit", id, code: outcome.exit });
        else this.send({ type: "killed", id, reason: outcome.killed });
        if (this.isClosed) return;
        return this.syncOut(id).then(
          () => undefined,
          (error: unknown) => {
            this.send({ type: "error", code: "failed", of: "run", message: error instanceof Error ? error.message : String(error) });
          },
        );
      })
      .catch((error: unknown) => {
        this.running = null;
        this.send({ type: "error", code: "failed", of: "run", message: error instanceof Error ? error.message : String(error) });
      });
  }

  /**
   * One request the browser made, asked of the server the container is
   * running and answered back to back: the `response` frame and then its
   * bytes, with nothing awaited between the two, so the bytes are the
   * next message after their frame and the cell never has to guess whose
   * they are. Nothing here is on the frame chain, so the fifty requests a
   * page makes at once are fifty fetches at once. A fetcher that rejects
   * is a server that is not there: status `0` and the error's text, which
   * is an answer, not a protocol error, and leaves the socket usable.
   */
  private forward(frame: FetchFrame, body: Uint8Array | undefined): void {
    const { id, port, method, url, headers } = frame;
    void this.fetcher
      .fetch({ port, method, url, headers, ...(body === undefined ? {} : { body }) })
      .catch((error: unknown) => ({
        status: FETCH_FAILED_STATUS,
        headers: {},
        body: encoder.encode(error instanceof Error ? error.message : String(error)),
      }))
      .then((answer) => {
        if (this.isClosed) return;
        this.send({ type: "response", id, status: answer.status, headers: answer.headers, size: answer.body.byteLength });
        if (answer.body.byteLength > 0) this.sendBytes(answer.body);
      });
  }

  askCredential(request: CredentialRequest, options: { timeoutMs?: number } = {}): Promise<CredentialAnswer | undefined> {
    if (this.isClosed) return Promise.resolve(undefined);
    const id = `cred-${++this.credentialCount}`;
    return new Promise<CredentialAnswer | undefined>((resolve) => {
      const timer = setTimeout(() => this.settleCredential(id, undefined), options.timeoutMs ?? CREDENTIAL_TIMEOUT_MS);
      this.credentials.set(id, {
        settle: (answer) => {
          clearTimeout(timer);
          resolve(answer);
        },
      });
      this.send({ type: "credential", id, kind: request.kind, scope: request.scope });
    });
  }

  private settleCredential(id: string, answer: CredentialAnswer | undefined): void {
    const pending = this.credentials.get(id);
    if (pending === undefined) return;
    this.credentials.delete(id);
    pending.settle(answer);
  }

  private async handleBytes(bytes: Uint8Array): Promise<void> {
    const expecting = this.expecting;
    if (expecting === null) throw new ProtocolError("malformed", "binary", "bytes with no frame to announce them");
    this.expecting = null;
    // A chunk of a put-back that is over: its bytes are read and let go, and the socket is where it was.
    if (expecting.of === "blob" && expecting.drop === true) {
      this.dropping.delete(expecting.hash);
      return;
    }
    if (expecting.of === "fetch") {
      const { frame } = expecting;
      if (bytes.byteLength !== frame.size) {
        throw new ProtocolError("mismatch", "fetch", `fetch ${frame.id} announced ${frame.size} bytes of body and carried ${bytes.byteLength}`);
      }
      this.forward(frame, bytes);
      return;
    }
    const restoring = this.restoring;
    if (restoring !== null && restoring.ref.chunks[restoring.next] === expecting.hash) {
      await this.restoreChunk(restoring, expecting, bytes);
      return;
    }
    if (this.checkout === null) throw new ProtocolError("malformed", "binary", "bytes with no sync-in to take them");
    if (bytes.byteLength !== expecting.size) {
      throw new ProtocolError("mismatch", "blob", `blob ${expecting.hash} announced ${expecting.size} bytes and carried ${bytes.byteLength}`);
    }
    const hash = await this.disk.digest(bytes);
    if (hash !== expecting.hash) throw new ProtocolError("mismatch", "blob", `blob ${expecting.hash} hashes to ${hash}`);
    this.checkout.blobs.set(hash, bytes);
    this.checkout.needed.delete(hash);
    if (this.checkout.needed.size === 0) await this.applyCheckout();
  }

  /**
   * Walks the disk under the cache rule: every entry not kept by it, with
   * its hash. `present` is every path on disk, kept or not, so a sync-out
   * can tell a deleted file from one the rule now hides.
   */
  private async scan(): Promise<{ state: Map<string, Scanned>; present: Set<string> }> {
    const { kept, present } = await this.listKept();
    return { state: await hashed(this.disk, kept), present };
  }

  /** The pasture's disk, whole and hashed: no cache rule applies there, since nothing is ever built under it. */
  private async scanPasture(pasture: Disk): Promise<Map<string, Scanned>> {
    return hashed(pasture, await pasture.list());
  }

  /** `~`'s disk under the home rule, hashed, and every path that is there, as `scan` has the checkout's. */
  private async scanHome(home: Disk): Promise<{ state: Map<string, Scanned>; present: Set<string> }> {
    const { kept, present } = await this.listHome(home);
    return { state: await hashed(home, kept), present };
  }

  /** The disk under the cache rule, unhashed: what the rule keeps out of `list()`, and every path that is there. */
  private async listKept(): Promise<{ kept: DiskEntry[]; present: Set<string> }> {
    const listed = await this.disk.list();
    const present = new Set(listed.map((entry) => entry.path));
    const gitignore = listed.some((entry) => entry.path === GITIGNORE && entry.kind === "file") ? decoder.decode(await this.disk.read(GITIGNORE)) : undefined;
    const cached = cacheRule(gitignore);
    return { kept: listed.filter((entry) => !cached(entry.path, entry.kind)), present };
  }

  /** `~`'s disk under the home rule, unhashed. The rule is fixed: there is no file under `~` that changes it. */
  private async listHome(home: Disk): Promise<{ kept: DiskEntry[]; present: Set<string> }> {
    const listed = await home.list();
    const cached = homeRule();
    return { kept: listed.filter((entry) => !cached(entry.path, entry.kind)), present: new Set(listed.map((entry) => entry.path)) };
  }

  private async receiveManifest(
    id: string,
    entries: ManifestEntry[],
    pastureEntries: ManifestEntry[] | undefined,
    homeEntries: ManifestEntry[] | undefined,
    cache: CacheRef | undefined,
  ): Promise<void> {
    const { state } = await this.scan();
    const needed = new Set<string>();
    const missing = (manifest: ManifestEntry[], have: Map<string, Scanned>) => {
      for (const entry of manifest) {
        if (entry.kind === "directory" || entry.hash === null) continue;
        const had = have.get(entry.path);
        if (had !== undefined && had.kind === entry.kind && had.hash === entry.hash) continue;
        needed.add(entry.hash);
      }
    };
    missing(entries, state);
    // The second root, when the manifest carries it and this agent has a pasture disk: its blobs join the one `need`.
    let pasture: RootCheckout | null = null;
    if (pastureEntries !== undefined && this.pasture !== undefined) {
      pasture = { entries: pastureEntries, have: await this.scanPasture(this.pasture) };
      missing(pastureEntries, pasture.have);
    }
    // The third root, `~`, the same way: compared under the home rule, so what the rule keeps is never asked for or replaced.
    let home: RootCheckout | null = null;
    if (homeEntries !== undefined && this.home !== undefined) {
      home = { entries: homeEntries, have: (await this.scanHome(this.home)).state };
      missing(homeEntries, home.have);
    }
    // The cache is not in this `need`: its chunks are asked for one at a time, after the files are written.
    this.checkout = { id, entries, have: state, needed, blobs: new Map(), pasture, home, cache: cache !== undefined && this.cacheDisk !== undefined ? cache : null };
    this.send({ type: "need", id, hashes: [...needed] });
    if (needed.size === 0) await this.applyCheckout();
  }

  /**
   * The pasture's tree onto its disk, read-only. Directories are made
   * writable first, so the agent, which need not be root, can write into
   * them; then every entry the manifest names lands (files `0444`, symlinks
   * as they are), what it does not name is removed, and every directory,
   * the root included, is set `0555`, deepest first.
   */
  private async applyPasture(disk: Disk, checkout: RootCheckout, blobs: Map<string, Uint8Array>): Promise<void> {
    const { entries, have } = checkout;
    await disk.mkdir("", 0o755);
    for (const [path, was] of have) if (was.kind === "directory") await disk.chmod(path, 0o755);
    const named = new Set<string>();
    for (const entry of entries) {
      named.add(entry.path);
      const had = have.get(entry.path);
      if (entry.kind === "directory") {
        if (had?.kind === "directory") continue;
        if (had !== undefined) await disk.remove(entry.path);
        await disk.mkdir(entry.path, 0o755);
        continue;
      }
      if (had !== undefined && had.kind === entry.kind && had.hash === entry.hash) {
        if (entry.kind === "file" && had.mode !== PASTURE_FILE_MODE) await disk.chmod(entry.path, PASTURE_FILE_MODE);
        continue;
      }
      const bytes = entry.hash === null ? undefined : blobs.get(entry.hash);
      if (bytes === undefined) throw new ProtocolError("malformed", "manifest", `no blob for /pasture/${entry.path}`);
      if (had !== undefined && had.kind !== entry.kind) await disk.remove(entry.path);
      if (entry.kind === "symlink") await disk.symlink(decoder.decode(bytes), entry.path);
      else await disk.write(entry.path, bytes, { mode: PASTURE_FILE_MODE });
    }
    // What the manifest no longer names goes; what it still names stays, whole.
    let removed: string | null = null;
    for (const path of [...have.keys()].sort()) {
      if (named.has(path)) continue;
      if (removed !== null && path.startsWith(`${removed}/`)) continue;
      await disk.remove(path);
      removed = path;
    }
    const directories = entries.filter((entry) => entry.kind === "directory").map((entry) => entry.path);
    for (const path of directories.sort((a, b) => b.length - a.length)) await disk.chmod(path, PASTURE_DIR_MODE);
    await disk.chmod("", PASTURE_DIR_MODE);
  }

  /**
   * One root's manifest onto its disk, with the modes the manifest says:
   * the checkout's and `~`'s. `have` is what the disk held under that
   * root's rule before; `named` is how a path is spoken in an error.
   * Returns what the agent now knows of the root. Deleting what the
   * manifest does not name is the caller's, since each root's rule is its
   * own.
   */
  private async writeRoot(disk: Disk, entries: ManifestEntry[], have: Map<string, Scanned>, blobs: Map<string, Uint8Array>, named: (path: string) => string): Promise<Map<string, Known>> {
    const known = new Map<string, Known>();
    for (const entry of entries) {
      const had = have.get(entry.path);
      known.set(entry.path, { kind: entry.kind, mode: entry.kind === "symlink" ? SYMLINK_MODE : entry.mode, hash: entry.hash });
      if (entry.kind === "directory") {
        if (had?.kind === "directory") {
          if (had.mode !== entry.mode) await disk.chmod(entry.path, entry.mode);
          continue;
        }
        if (had !== undefined) await disk.remove(entry.path);
        await disk.mkdir(entry.path, entry.mode);
        continue;
      }
      if (had !== undefined && had.kind === entry.kind && had.hash === entry.hash) {
        if (entry.kind === "file" && had.mode !== entry.mode) await disk.chmod(entry.path, entry.mode);
        continue;
      }
      const bytes = entry.hash === null ? undefined : blobs.get(entry.hash);
      if (bytes === undefined) throw new ProtocolError("malformed", "manifest", `no blob for ${named(entry.path)}`);
      if (had !== undefined && had.kind !== entry.kind) await disk.remove(entry.path);
      if (entry.kind === "symlink") await disk.symlink(decoder.decode(bytes), entry.path);
      else await disk.write(entry.path, bytes, { mode: entry.mode });
    }
    return known;
  }

  /** What a root's rule does not keep and its manifest does not name goes, a directory whole. `kept` is sorted by path. */
  private static async removeUnnamed(disk: Disk, kept: DiskEntry[], known: Map<string, Known>): Promise<void> {
    let removed: string | null = null;
    for (const { path } of kept) {
      if (known.has(path)) continue;
      if (removed !== null && path.startsWith(`${removed}/`)) continue;
      await disk.remove(path);
      removed = path;
    }
  }

  /** Every blob is here: write the manifest to disk, then delete what it does not name and the rule does not keep; the same for `~` when it came. */
  private async applyCheckout(): Promise<void> {
    const checkout = this.checkout;
    if (checkout === null) return;
    this.checkout = null;
    // The second root first, so a workspace command that follows finds `/pasture` in place; its failure ends the sync like any other.
    if (checkout.pasture !== null && this.pasture !== undefined) await this.applyPasture(this.pasture, checkout.pasture, checkout.blobs);
    const known = await this.writeRoot(this.disk, checkout.entries, checkout.have, checkout.blobs, (path) => path);
    // The rule is read again: the manifest may have brought a new `.gitignore`.
    await Agent.removeUnnamed(this.disk, (await this.listKept()).kept, known);
    this.known = known;
    // The third root, under the home rule; a manifest without it leaves `~` as it is, and the agent forgets it until one carries it.
    if (checkout.home !== null && this.home !== undefined) {
      const knownHome = await this.writeRoot(this.home, checkout.home.entries, checkout.home.have, checkout.blobs, homePath);
      await Agent.removeUnnamed(this.home, (await this.listHome(this.home)).kept, knownHome);
      this.knownHome = knownHome;
    } else {
      this.knownHome = null;
    }
    // The cache last, once the files are down and their blobs let go: `checkout` waits for its last chunk.
    if (checkout.cache !== null && this.cacheDisk !== undefined) {
      await this.beginRestore(checkout.id, checkout.cache, this.cacheDisk);
      return;
    }
    this.send({ type: "checkout", id: checkout.id });
  }

  /**
   * The put-back's first step: `/cache` emptied, whatever was there, so
   * what lands is the record and nothing beside it; then the first chunks
   * asked for, up to three (fold phase 3). A record of no chunks is an
   * empty `/cache`.
   */
  private async beginRestore(id: string, ref: CacheRef, disk: Disk): Promise<void> {
    this.putBack = null;
    await emptyDisk(disk);
    const expected = await disk.digest(encoder.encode(recordHashInput(ref.chunks)));
    if (expected !== ref.hash) throw new ProtocolError("mismatch", "manifest", `the cache ${ref.hash} is not the record of its chunks (${expected})`);
    const reader = new RecordReader(disk);
    if (ref.chunks.length === 0) {
      this.putBack = await Agent.keptStat(disk, ref, await reader.end());
      this.send({ type: "checkout", id });
      return;
    }
    this.restoring = { id, ref, next: 0, asked: 0, reader };
    this.askForChunks(this.restoring);
  }

  /** The next chunks of a put-back, up to three, in the order they are to land; the receiver writes the last while the link carries the next. */
  private askForChunks(restoring: NonNullable<Agent["restoring"]>): void {
    const hashes = restoring.ref.chunks.slice(restoring.next, restoring.next + CACHE_NEED_CHUNKS);
    restoring.asked = restoring.next + hashes.length;
    this.send({ type: "need", id: restoring.id, hashes });
  }

  /**
   * One chunk of the put-back: inflated, then checked against its hash,
   * which is over those plain bytes and not the deflated form it travelled
   * as (fold phase 3), and written through the reader. When the chunks
   * asked for have all landed, the next three are asked for; when the
   * record's last has, the sync-in is done.
   */
  private async restoreChunk(restoring: NonNullable<Agent["restoring"]>, expecting: { hash: string; size: number }, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength !== expecting.size) {
      throw new ProtocolError("mismatch", "blob", `chunk ${expecting.hash} announced ${expecting.size} bytes and carried ${bytes.byteLength}`);
    }
    let plain: Uint8Array;
    try {
      plain = await gunzipBytes(bytes);
    } catch (error) {
      await this.endRestoreCold(restoring, `chunk ${expecting.hash.slice(0, 12)} is not a gzip stream: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const hash = await this.cacheDisk!.digest(plain);
    if (hash !== expecting.hash) {
      await this.endRestoreCold(restoring, `chunk ${expecting.hash.slice(0, 12)} inflates to bytes that hash to ${hash.slice(0, 12)}`);
      return;
    }
    await restoring.reader.push(plain);
    restoring.next++;
    if (restoring.next < restoring.ref.chunks.length) {
      if (restoring.next === restoring.asked) this.askForChunks(restoring);
      return;
    }
    const count = await restoring.reader.end();
    this.restoring = null;
    this.putBack = await Agent.keptStat(this.cacheDisk!, restoring.ref, count);
    this.send({ type: "checkout", id: restoring.id });
  }

  /**
   * A chunk the container cannot use ends the put-back and not the sync-in
   * (fold phase 3), the way a chunk the object no longer has does:
   * `/cache` goes empty, the cell is told why under the sync-in's id, and
   * `checkout` completes the sync-in, so setup runs cold, the description
   * after it writes a record, and the sheep's command never sees this. The
   * chunks already on their way, the rest of the `need`, are dropped as
   * they arrive.
   */
  private async endRestoreCold(restoring: NonNullable<Agent["restoring"]>, reason: string): Promise<void> {
    const { id } = restoring;
    for (const hash of restoring.ref.chunks.slice(restoring.next + 1, restoring.asked)) this.dropping.add(hash);
    this.restoring = null;
    this.putBack = null;
    await emptyDisk(this.cacheDisk!);
    this.send({ type: "error", code: "mismatch", of: "cache", id, message: reason });
    this.send({ type: "checkout", id });
  }

  /**
   * `/cache` as a walk finds it, one line per path: kind, mode, size, and
   * mtime. `undefined` when the disk leaves out a size or an mtime, and then
   * no walk can say that nothing changed.
   */
  private static async statOf(disk: Disk): Promise<Map<string, string> | undefined> {
    const stat = new Map<string, string>();
    for (const entry of await disk.list()) {
      if (entry.size === undefined || entry.mtime === undefined) return undefined;
      stat.set(entry.path, `${entry.kind} ${entry.mode} ${entry.size} ${entry.mtime}`);
    }
    return stat;
  }

  /** What a finished put-back leaves for the description after setup: the record, its counts, and the walk after its last write. */
  private static async keptStat(disk: Disk, ref: CacheRef, count: { files: number; bytes: number }): Promise<Agent["putBack"]> {
    const stat = await Agent.statOf(disk);
    return stat === undefined ? null : { ref, files: count.files, bytes: count.bytes, stat };
  }

  /** Whether `/cache` is exactly what the put-back left: the same paths, no more and no fewer, each with the same line. */
  private static async untouched(disk: Disk, kept: Map<string, string>): Promise<boolean> {
    const now = await Agent.statOf(disk);
    if (now === undefined || now.size !== kept.size) return false;
    for (const [path, line] of now) if (kept.get(path) !== line) return false;
    return true;
  }

  /**
   * The description (fold phase 1): `/cache` as a record, onto the
   * scratch in chunks named by their hashes, and then `cache` with the
   * record's hash, the chunks', and its counts. Past `max` the writer
   * stops, the scratch is emptied, and `bytes` says it was over; nothing
   * is offered. The chunks stay until the cell's `synced`.
   */
  private async describe(id: string, max: number | undefined): Promise<void> {
    const cache = this.cacheDisk;
    const scratch = this.scratch;
    if (cache === undefined || scratch === undefined) {
      this.send({ type: "error", code: "unsupported", of: "cache", message: "this container has no /cache" });
      return;
    }
    this.describing = null;
    // Nothing touched since the put-back: its record is the answer, and not a byte is written to learn it.
    const putBack = this.putBack;
    if (putBack !== null && (max === undefined || putBack.bytes <= max) && (await Agent.untouched(cache, putBack.stat))) {
      this.describing = { id, chunks: new Map() };
      this.send({ type: "cache", id, hash: putBack.ref.hash, chunks: putBack.ref.chunks, files: putBack.files, bytes: putBack.bytes });
      return;
    }
    await emptyDisk(scratch);
    const chunks: string[] = [];
    const written = new Map<string, { stored: string; size: number }>();
    const chunker = new Chunker(CACHE_CHUNK_BYTES, async (chunk) => {
      // The hash is the chunk's plain bytes'; what lies on the scratch, travels, and is kept is that chunk gzipped.
      const hash = await scratch.digest(chunk);
      if (!written.has(hash)) {
        const stored = await gzipBytes(chunk);
        await scratch.write(hash, stored, { mode: 0o600 });
        written.set(hash, { stored: await scratch.digest(stored), size: stored.byteLength });
      }
      chunks.push(hash);
    });
    const count = await writeRecord(cache, (bytes) => chunker.push(bytes), max === undefined ? {} : { max });
    if (count.over) {
      await emptyDisk(scratch);
      this.describing = { id, chunks: new Map() };
      this.send({ type: "cache", id, hash: "", chunks: [], files: count.files, bytes: count.bytes });
      return;
    }
    await chunker.end();
    const hash = await scratch.digest(encoder.encode(recordHashInput(chunks)));
    this.describing = { id, chunks: written };
    this.send({ type: "cache", id, hash, chunks, files: count.files, bytes: count.bytes });
  }

  /**
   * The cell's `need` for a description's chunks: up to three hashes, each
   * read off the scratch in the order asked and sent as it lies there, the
   * deflated form (fold phase 3). What is checked is that deflated form's
   * own digest, taken when it was written: the plain hash is the cell's to
   * check when the chunk comes back, and inflating to check it here would
   * be work the sender has no reason to do.
   */
  private async answerChunkNeed(id: string, hashes: string[]): Promise<void> {
    const describing = this.describing!;
    if (hashes.length === 0 || hashes.length > CACHE_NEED_CHUNKS) {
      throw new ProtocolError("malformed", "need", `a need for the cache ${id} names one to ${CACHE_NEED_CHUNKS} chunks, not ${hashes.length}`);
    }
    for (const hash of hashes) {
      const offered = describing.chunks.get(hash);
      if (offered === undefined) throw new ProtocolError("malformed", "need", `the cache ${id} did not offer ${hash}`);
      const bytes = await this.scratch!.read(hash);
      const now = await this.scratch!.digest(bytes);
      if (now !== offered.stored) throw new ProtocolError("mismatch", "need", `chunk ${hash} changed on the scratch: ${now}`);
      this.send({ type: "blob", hash, size: bytes.byteLength });
      this.sendBytes(bytes);
    }
  }

  syncOut(id: string): Promise<Refused[]> {
    return new Promise<Refused[]>((resolve, reject) => {
      this.tail = this.tail
        .then(async () => {
          if (this.isClosed) throw new Error("the socket is closed");
          if (this.out !== null) throw new Error(`a sync-out (${this.out.id}) is already in progress`);
          const { state, present } = await this.scan();
          const { entries, deleted } = diffed(state, present, this.known);
          // `~` beside the checkout, when the last manifest carried it: walked under its own rule, compared with its own last sync.
          let home: HomeChanged | undefined;
          if (this.home !== undefined && this.knownHome !== null) {
            const scanned = await this.scanHome(this.home);
            home = diffed(scanned.state, scanned.present, this.knownHome);
          }
          if (this.isClosed) throw new Error("the socket closed");
          this.out = { id, entries, deleted, home, resolve, reject };
          this.send(home === undefined ? { type: "changed", id, entries, deleted } : { type: "changed", id, entries, deleted, home });
        })
        .catch((error: unknown) => {
          this.out = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private async answerNeed(id: string, hashes: string[]): Promise<void> {
    if (this.describing !== null && this.describing.id === id) {
      await this.answerChunkNeed(id, hashes);
      return;
    }
    const out = this.out;
    if (out === null || out.id !== id) throw new ProtocolError("malformed", "need", `no sync-out ${id} is in progress`);
    // One `need` for both roots: a hash is read from whichever root offered it first, the checkout before `~`.
    const byHash = new Map<string, { disk: Disk; entry: ChangedEntry; named: string }>();
    const offer = (disk: Disk, entries: ChangedEntry[], named: (path: string) => string) => {
      for (const entry of entries) if (entry.hash !== null && !byHash.has(entry.hash)) byHash.set(entry.hash, { disk, entry, named: named(entry.path) });
    };
    offer(this.disk, out.entries, (path) => path);
    if (out.home !== undefined && this.home !== undefined) offer(this.home, out.home.entries, homePath);
    for (const hash of hashes) {
      const offered = byHash.get(hash);
      if (offered === undefined) throw new ProtocolError("malformed", "need", `the sync-out ${id} did not offer ${hash}`);
      const { disk, entry } = offered;
      const bytes = entry.kind === "symlink" ? encoder.encode(await disk.readlink(entry.path)) : await disk.read(entry.path);
      const now = await disk.digest(bytes);
      if (now !== hash) throw new ProtocolError("mismatch", "need", `${offered.named} changed while syncing: ${now}`);
      this.send({ type: "blob", hash, size: bytes.byteLength });
      this.sendBytes(bytes);
    }
  }

  private finishSyncOut(id: string, refused: Refused[], homeRefused: Refused[]): void {
    const out = this.out;
    if (out === null || out.id !== id) throw new ProtocolError("malformed", "synced", `no sync-out ${id} is in progress`);
    this.out = null;
    accepted(this.known, out.entries, out.deleted, refused);
    if (out.home !== undefined && this.knownHome !== null) accepted(this.knownHome, out.home.entries, out.home.deleted, homeRefused);
    // What the cell refused, as the tool result names it: `~`'s with `~/` in front.
    out.resolve(out.home === undefined ? refused : [...refused, ...homeRefused.map((entry) => ({ path: homePath(entry.path), size: entry.size }))]);
  }
}
