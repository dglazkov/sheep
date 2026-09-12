/**
 * The fake container every pen test talks to: the real agent from
 * `@sheep/pen/agent`, served over one end of a `WebSocketPair` in workerd,
 * with its checkout in a `Map`. Not a second agent; the agent over a
 * different disk. The test holds the other end, which is what the cell
 * holds, and `stop()` is the shepherd's hand: the container going away
 * mid-anything.
 *
 * The fake keeps a transcript, every frame in both directions in the
 * order the agent saw them, and can be told to die after the n-th, so a
 * kill test can walk every point of a sync.
 *
 * Its runner is the one place the fake is not the thing: workerd has no
 * processes, so a `run` plays a script the test wrote for that command,
 * chunks over ticks, edits to the disk, an exit code. The protocol around
 * the run is the agent's own. A command with no script is answered as the
 * container's bash would answer a program the image lacks.
 *
 * Serve phase 0 gives it a second such place, and for the same reason:
 * workerd has no ports, so `serve(port, origin)` stands a table of
 * responses behind one and the fake's fetcher reads the table instead of
 * connecting. A port nothing was stood behind refuses, which is what the
 * agent turns into status `0`. An origin with a `starts` is not listening
 * until a `run` names it and stops when that run ends, and both are
 * recorded, so a served look's every step — the server started, the page
 * rendered, the server killed — runs in workerd against the protocol.
 *
 * Fold phase 0 gives it a third disk in memory, a sheep's `~`, handed to
 * the agent as its `home`, so what a test syncs `~` against is the agent's
 * own code under the home rule. A script's step reaches it as the second
 * argument of `act`, as a command in the container reaches `/home/sheep`
 * beside `/workspace`.
 *
 * Fold phase 1 gives it a fourth, `/cache`, and a scratch for the chunks a
 * description makes, both handed to the agent, so a put-back and a save
 * run the agent's own record over them. A script's step reaches `/cache`
 * as the third argument of `act`. A fresh fake has both empty, as a fresh
 * container's are.
 *
 * Fold phase 2: the memory disk says a size and an mtime for each entry,
 * the mtime a counter that moves on every write of an entry's content, so
 * the agent's walk after a put-back can tell a `/cache` setup left alone
 * from one it touched, as `lstat` does on a real disk. It never says two
 * entries are one file, so a record over it has no links. `writes` counts
 * the writes a disk took, which is how a test sees a scratch left alone.
 *
 * Spool phase 0: the memory disk has the record's two handles, `openRead`
 * and `openWrite`, so the cell's tests exercise the streaming path and not
 * the fallback, and it counts what a `Map` would otherwise hide: `reads` and
 * `bytesRead`, which say a cap refused before it read anything, and
 * `openHandles`, which says a put-back that was dropped closed the file it
 * was in the middle of before `/cache` was emptied.
 */
import { type Disk, type DiskEntry, type Fetcher, type FetchRequest, type FetchResponse, type Runner, type RunOutcome, type RunRequest, serveAgent } from "@sheep/pen/agent";
import {
  type CellFrame,
  type ContainerFrame,
  type CredentialAnswer,
  type CredentialRequest,
  decodeFrame,
  encodeFrame,
  type EntryKind,
  type Frame,
  messageBytes,
  type Refused,
} from "@sheep/pen/protocol";
import { hashBytes } from "../src/workspace/files.ts";

export type MemoryEntry =
  | { kind: "file"; bytes: Uint8Array; mode: number }
  | { kind: "directory"; mode: number }
  | { kind: "symlink"; target: string; mode: number };

/** A disk in a `Map`, every kind of entry first-class. Parents are created on write, as `node:fs` does for the agent. */
export interface MemoryDisk extends Disk {
  readonly entries: Map<string, MemoryEntry>;
  /** How many times `write` was called on this disk, the whole-file way; a file written through a handle is not one of these. */
  readonly writes: number;
  /**
   * Spool phase 0, the counter journey 2 step 3 is proved with: how many
   * times this disk was asked for a file's bytes at all — a `read`, an
   * `openRead`, or one slice from a handle — and how many bytes it handed
   * over. A cap that refuses before it opens anything leaves both where they
   * were.
   */
  readonly reads: number;
  readonly bytesRead: number;
  /**
   * Spool phase 0: how many handles are open on this disk right now — a
   * descriptor a real disk would still be holding. A put-back that was
   * dropped and left one open is a file whose blocks survive `emptyDisk`,
   * which a `Map` cannot show and a container cannot afford.
   */
  readonly openHandles: number;
  /** Writes a file, creating parents. A string is UTF-8. */
  putFile(path: string, content: string | Uint8Array, mode?: number): void;
  putDirectory(path: string, mode?: number): void;
  putSymlink(path: string, target: string): void;
  /** Removes an entry and everything under it. */
  delete(path: string): void;
}

const encoder = new TextEncoder();

async function webCryptoSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The memory disks' one clock: every content write anywhere takes the next tick, so no two writes share an mtime. */
let tick = 0;

export function memoryDisk(): MemoryDisk {
  const entries = new Map<string, MemoryEntry>();
  /** Each path's mtime, beside the entries so an entry compares as it did before fold phase 2. */
  const mtimes = new Map<string, number>();
  let writes = 0;
  let reads = 0;
  let bytesRead = 0;
  let openHandles = 0;
  const ensureParents = (path: string) => {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join("/");
      if (entries.get(dir)?.kind !== "directory") {
        entries.set(dir, { kind: "directory", mode: 0o755 });
        mtimes.set(dir, ++tick);
      }
    }
  };
  const removeTree = (path: string) => {
    entries.delete(path);
    mtimes.delete(path);
    for (const key of [...entries.keys()]) {
      if (key.startsWith(`${path}/`)) {
        entries.delete(key);
        mtimes.delete(key);
      }
    }
  };
  const disk: MemoryDisk = {
    entries,
    get writes() {
      return writes;
    },
    get reads() {
      return reads;
    },
    get bytesRead() {
      return bytesRead;
    },
    get openHandles() {
      return openHandles;
    },
    putFile(path, content, mode = 0o644) {
      ensureParents(path);
      entries.set(path, { kind: "file", bytes: typeof content === "string" ? encoder.encode(content) : content, mode });
      mtimes.set(path, ++tick);
    },
    putDirectory(path, mode = 0o755) {
      ensureParents(path);
      entries.set(path, { kind: "directory", mode });
      mtimes.set(path, ++tick);
    },
    putSymlink(path, target) {
      ensureParents(path);
      entries.set(path, { kind: "symlink", target, mode: 0o777 });
      mtimes.set(path, ++tick);
    },
    delete: removeTree,
    async read(path) {
      const entry = entries.get(path);
      if (entry?.kind !== "file") throw new Error(`ENOENT: ${path}`);
      reads++;
      bytesRead += entry.bytes.byteLength;
      return entry.bytes;
    },
    async write(path, bytes, options) {
      writes++;
      const existing = entries.get(path);
      disk.putFile(path, bytes, options?.mode ?? (existing?.kind === "file" ? existing.mode : 0o644));
    },
    /**
     * Spool phase 0: the file read in slices, over the `Map`. The entry is
     * looked up at each slice rather than held, as a file descriptor reads
     * the file and not a copy of it, so a file that changes under the reader
     * is seen to change.
     */
    async openRead(path) {
      if (entries.get(path)?.kind !== "file") throw new Error(`ENOENT: ${path}`);
      reads++;
      openHandles++;
      let offset = 0;
      let open = true;
      return {
        async read(length) {
          const entry = entries.get(path);
          if (entry?.kind !== "file") throw new Error(`ENOENT: ${path}`);
          reads++;
          const slice = entry.bytes.slice(offset, offset + length);
          offset += slice.byteLength;
          bytesRead += slice.byteLength;
          return slice;
        },
        async close() {
          if (!open) return;
          open = false;
          openHandles--;
        },
      };
    },
    /** Spool phase 0: the file written in slices, with its mode from the open; what was at the path is gone from the first byte, as `O_TRUNC` leaves it. */
    async openWrite(path, mode) {
      const parts: Uint8Array[] = [];
      let length = 0;
      let open = true;
      openHandles++;
      disk.putFile(path, new Uint8Array(0), mode);
      return {
        async append(bytes) {
          // A slice is a view into the caller's chunk; the disk keeps a copy of its own, as a write to a file would.
          parts.push(bytes.slice());
          length += bytes.byteLength;
        },
        async close() {
          if (!open) return;
          open = false;
          openHandles--;
          // A handle closed on a path that is gone wrote nothing that survives, as a descriptor on an unlinked file does not.
          if (entries.get(path) === undefined) return;
          const whole = new Uint8Array(length);
          let offset = 0;
          for (const part of parts) {
            whole.set(part, offset);
            offset += part.byteLength;
          }
          disk.putFile(path, whole, mode);
        },
      };
    },
    async mkdir(path, mode) {
      // The root itself (`""`, as the agent names it for the pasture's disk) is always there and has no entry.
      if (path === "") return;
      const existing = entries.get(path);
      if (existing?.kind === "directory") existing.mode = mode;
      else disk.putDirectory(path, mode);
    },
    async symlink(target, path) {
      removeTree(path);
      disk.putSymlink(path, target);
    },
    async readlink(path) {
      const entry = entries.get(path);
      if (entry?.kind !== "symlink") throw new Error(`EINVAL: ${path}`);
      return entry.target;
    },
    async chmod(path, mode) {
      if (path === "") return;
      const entry = entries.get(path);
      if (entry === undefined) throw new Error(`ENOENT: ${path}`);
      entry.mode = mode;
    },
    async list() {
      // A size and an mtime when the disk knows one; an entry a test set straight into `entries` has no mtime, and says none.
      const listed: DiskEntry[] = [...entries].map(([path, entry]) => {
        const size = entry.kind === "file" ? entry.bytes.byteLength : entry.kind === "symlink" ? encoder.encode(entry.target).byteLength : 0;
        const mtime = mtimes.get(path);
        return { path, kind: entry.kind as EntryKind, mode: entry.mode, size, ...(mtime === undefined ? {} : { mtime }) };
      });
      return listed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },
    async remove(path) {
      removeTree(path);
    },
    digest: webCryptoSha256,
  };
  return disk;
}

/** One step of a scripted run: wait, then act on the disks, then print. An `act` may be asynchronous, as a program asking the helper is. */
export interface ScriptStep {
  /** Milliseconds before this step, so a run takes time and its output streams. */
  wait?: number;
  /** `disk` is the checkout, `/workspace`; `home` is `~`, `/home/sheep` (fold phase 0); `cache` is `/cache` (fold phase 1). */
  act?: (disk: MemoryDisk, home: MemoryDisk, cache: MemoryDisk) => void | Promise<void>;
  stdout?: string;
  stderr?: string;
}

export interface Script {
  steps: ScriptStep[];
  exit: number;
}

/** What the fake does for a command; `undefined` for a program the image would not have. */
export type ScriptFor = (request: RunRequest) => Script | undefined;

function notFound(request: RunRequest): Script {
  const program = request.command.trim().split(/\s+/)[0] ?? "";
  return { steps: [{ stderr: `bash: ${program}: command not found\n` }], exit: 127 };
}

/**
 * A runner that plays scripts. A kill ends the run at the next step, as
 * SIGKILL ends a process between writes; a `deaf` runner ignores it, as a
 * stuck container would, which is what pen phase 3's kill deadline is for.
 */
export function scriptRunner(disk: MemoryDisk, scriptFor: ScriptFor, options: { deaf?: boolean; runs?: RunRequest[]; home?: MemoryDisk; cache?: MemoryDisk } = {}): Runner {
  const home = options.home ?? memoryDisk();
  const cache = options.cache ?? memoryDisk();
  return {
    run(request, output) {
      options.runs?.push(request);
      const script = scriptFor(request) ?? notFound(request);
      let killed: string | null = null;
      let wake: (() => void) | null = null;
      const kill = (reason: string) => {
        if (killed !== null || options.deaf) return;
        killed = reason;
        wake?.();
      };
      const backstop = request.timeout === undefined ? undefined : setTimeout(() => kill("timeout"), request.timeout * 1000);
      const outcome = (async (): Promise<RunOutcome> => {
        // The runner starts after the agent has recorded the run; a process would too.
        await Promise.resolve();
        for (const step of script.steps) {
          if (step.wait !== undefined) {
            await new Promise<void>((resolve) => {
              wake = resolve;
              setTimeout(resolve, step.wait);
            });
            wake = null;
          }
          if (killed !== null) return { killed };
          await step.act?.(disk, home, cache);
          if (step.stdout !== undefined) output.stdout(step.stdout);
          if (step.stderr !== undefined) output.stderr(step.stderr);
        }
        if (killed !== null) return { killed };
        return { exit: script.exit };
      })().finally(() => {
        if (backstop !== undefined) clearTimeout(backstop);
      });
      return { outcome, kill };
    },
  };
}

/** What a served port answers with. A missing status is `200`, and a string body is UTF-8. */
export interface FakeResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

/**
 * A table of responses standing behind a port. `respond` may wait, so a
 * test can hold requests open and see how many the forward has in flight
 * at once; `undefined` is the server's own 404, not a port that refused.
 */
export interface FakeOrigin {
  /**
   * The command that starts it: a `run` whose command contains this text
   * makes the port listen, and the end of that run — a kill included —
   * makes it stop. Without it the port listens from the moment `serve` is
   * called, which is what a test about the forward rather than the rental
   * wants.
   */
  starts?: string;
  respond(request: FetchRequest): FakeResponse | undefined | Promise<FakeResponse | undefined>;
}

/** One thing that happened to a served port: the fake's record of a server's life. */
export interface ServerEvent {
  port: number;
  event: "started" | "stopped";
  /** The command that started it, or how the run that held it ended. */
  by: string;
}

/** One line of the transcript: a frame, or the bytes of a blob by their hash. */
export type TranscriptEntry =
  | { from: "cell" | "container"; frame: Frame }
  | { from: "cell" | "container"; binary: string; size: number };

export interface FakeContainer {
  /** The cell's end of the socket. */
  socket: WebSocket;
  disk: MemoryDisk;
  /** Pasture phase 3: the second disk, `/pasture`, written read-only from a manifest's second root and never walked by a sync-out. */
  pasture: MemoryDisk;
  /** Fold phase 0: the third disk, `~`, written from a manifest's third root under the home rule and walked by every sync-out after it. */
  home: MemoryDisk;
  /** Fold phase 1: the fourth disk, `/cache`, put back from a manifest's `cache` and described on a `cache` frame; never walked by a sync-out. */
  cache: MemoryDisk;
  /** Fold phase 1: where a description's chunks wait for the cell's `need`s. */
  scratch: MemoryDisk;
  /** Every frame the agent received or sent, in order, as it saw them. */
  transcript: TranscriptEntry[];
  /** Pasture phase 4: every `run` the runner was handed, in order, with the environment each carried; a test counts setup's and reads the secrets off it. */
  runs: RunRequest[];
  /** Stands a table of responses behind a port, in place of a server the container would be running. */
  serve(port: number, origin: FakeOrigin): void;
  /** Every start and stop of a served port the runner drove, in order. */
  servers: ServerEvent[];
  /** The agent's sync-out, in place of the `run` a later phase ends with one. */
  syncOut(id: string): Promise<Refused[]>;
  /** The helper's path, called as the helper's socket would call it: workerd has no processes, so the request comes from the test. */
  askCredential(request: CredentialRequest, options?: { timeoutMs?: number }): Promise<CredentialAnswer | undefined>;
  /** The container dies: its end closes with `reason`, and nothing more is answered. */
  stop(reason?: string): void;
  /** Resolves once the agent has seen its socket close. */
  closed: Promise<void>;
}

export interface FakeContainerOptions {
  disk?: MemoryDisk;
  /** The pasture's disk; a fresh one when absent. */
  pasture?: MemoryDisk;
  /** `~`'s disk; a fresh one when absent, which is what a fresh container's `/home/sheep` is. */
  home?: MemoryDisk;
  /** `/cache`'s disk and the scratch; fresh ones when absent, empty as in a fresh container. */
  cache?: MemoryDisk;
  scratch?: MemoryDisk;
  /** Die right after the n-th transcript entry, sent or received. */
  stopAfter?: number;
  /** What a `run` does. Without one, every program is one the image lacks. */
  script?: ScriptFor;
  /** Ignore `kill`, as a stuck container would. */
  deaf?: boolean;
}

/** The fake over a socket pair made here; the cell's end is returned. */
export function startFakeContainer(options: FakeContainerOptions = {}): FakeContainer {
  const pair = new WebSocketPair();
  const cellEnd = pair[0];
  const agentEnd = pair[1];
  cellEnd.accept();
  agentEnd.accept();
  return { ...serveFakeOn(agentEnd, options), socket: cellEnd };
}

/**
 * The fake over a socket the test already holds: the client end a real
 * `GET /s/<id>/pen?token=…` upgrade returned, accepted. This is what pen
 * phase 3's stub starter does in place of starting a container: the
 * container's half of the dial-in is the agent over that socket.
 */
export function serveFakeOn(agentEnd: WebSocket, options: FakeContainerOptions = {}): Omit<FakeContainer, "socket"> {
  const disk = options.disk ?? memoryDisk();
  const pasture = options.pasture ?? memoryDisk();
  const home = options.home ?? memoryDisk();
  const cache = options.cache ?? memoryDisk();
  const scratch = options.scratch ?? memoryDisk();
  const transcript: TranscriptEntry[] = [];
  const runs: RunRequest[] = [];
  /** What has been stood behind each port, and whether it is listening now. */
  const stood = new Map<number, { origin: FakeOrigin; listening: boolean }>();
  const servers: ServerEvent[] = [];

  /**
   * The fake's fetcher: the table behind the port, or a refusal. Nothing
   * connects to anything — workerd has no ports — but everything on either
   * side of this call is the real thing, which is what the proof needs.
   */
  const fetcher: Fetcher = {
    async fetch(request: FetchRequest): Promise<FetchResponse> {
      const server = stood.get(request.port);
      if (server === undefined || !server.listening) throw new Error(`connect ECONNREFUSED 127.0.0.1:${request.port}`);
      const answered = await server.origin.respond(request);
      if (answered === undefined) {
        return { status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: encoder.encode(`no such path: ${request.url}`) };
      }
      const body = answered.body === undefined ? new Uint8Array(0) : typeof answered.body === "string" ? encoder.encode(answered.body) : answered.body;
      return { status: answered.status ?? 200, headers: { ...answered.headers }, body };
    },
  };

  /**
   * The scripted runner, with the served ports hung off it: a command that
   * names an origin makes its port listen for as long as the run lasts,
   * and the end of the run — an exit, a kill, a timeout — stops it. That
   * is the one rule this project has, proved from the outside.
   */
  const scripted = scriptRunner(disk, options.script ?? (() => undefined), { deaf: options.deaf ?? false, runs, home, cache });
  const runner: Runner = {
    run(request, output) {
      const held = [...stood].filter(([, server]) => server.origin.starts !== undefined && request.command.includes(server.origin.starts));
      for (const [port, server] of held) {
        server.listening = true;
        servers.push({ port, event: "started", by: request.command });
      }
      const handle = scripted.run(request, output);
      const stopHeld = (by: string) => {
        for (const [port, server] of held) {
          if (!server.listening) continue;
          server.listening = false;
          servers.push({ port, event: "stopped", by });
        }
      };
      return {
        outcome: handle.outcome.then(
          (outcome) => {
            stopHeld("exit" in outcome ? `exit ${outcome.exit}` : outcome.killed);
            return outcome;
          },
          (error: unknown) => {
            stopHeld(error instanceof Error ? error.message : String(error));
            throw error;
          },
        ),
        kill: (reason) => handle.kill(reason),
      };
    },
  };

  let stopped = false;
  const closeListeners: Array<(event: unknown) => void> = [];
  const stop = (reason: string) => {
    if (stopped) return;
    stopped = true;
    agentEnd.close(1012, reason);
    for (const listener of closeListeners) listener({ code: 1012, reason });
  };
  const record = (entry: TranscriptEntry) => {
    transcript.push(entry);
    if (options.stopAfter !== undefined && transcript.length === options.stopAfter) stop("stopped by the test");
  };

  // The agent's socket: the pair's far end, seen through the transcript and the stop.
  let tail = Promise.resolve();
  const wrapped = {
    send(data: string | Uint8Array) {
      if (stopped) return;
      agentEnd.send(data);
      if (typeof data === "string") record({ from: "container", frame: decodeFrame(data) });
      else record({ from: "container", binary: hashBytes(data), size: data.byteLength });
    },
    addEventListener(type: "message" | "close", listener: (event: { data: unknown }) => void) {
      if (type === "close") {
        closeListeners.push(listener as (event: unknown) => void);
        return;
      }
      agentEnd.addEventListener("message", (event) => {
        // Record in arrival order even when the bytes come as a Blob.
        tail = tail.then(async () => {
          if (stopped) return;
          const data = event.data;
          if (typeof data === "string") record({ from: "cell", frame: decodeFrame(data) });
          else {
            const bytes = await messageBytes(data);
            record({ from: "cell", binary: bytes === undefined ? "?" : hashBytes(bytes), size: bytes?.byteLength ?? 0 });
          }
          listener({ data });
        });
      });
    },
  };
  agentEnd.addEventListener("close", (event) => stop(event.reason));
  const served = serveAgent(wrapped, disk, runner, fetcher, { pasture, home, cache, scratch });
  return {
    disk,
    pasture,
    home,
    cache,
    scratch,
    transcript,
    runs,
    servers,
    serve(port, origin) {
      stood.set(port, { origin, listening: origin.starts === undefined });
    },
    syncOut: (id) => served.syncOut(id),
    askCredential: (request, options) => served.askCredential(request, options),
    stop(reason = "container stopped") {
      stop(reason);
    },
    closed: served.closed,
  };
}

/** The next frame the container sends. Register before sending what should provoke it. */
export function nextFrame(socket: WebSocket): Promise<ContainerFrame> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      socket.removeEventListener("message", onMessage);
      if (typeof event.data !== "string") reject(new Error("binary frame"));
      else resolve(decodeFrame(event.data) as ContainerFrame);
    };
    socket.addEventListener("message", onMessage);
  });
}

/** Sends one frame and returns the container's next one. */
export function ask(socket: WebSocket, frame: CellFrame): Promise<ContainerFrame> {
  const answer = nextFrame(socket);
  socket.send(encodeFrame(frame));
  return answer;
}
