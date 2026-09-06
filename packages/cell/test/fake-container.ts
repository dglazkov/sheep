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
 */
import { type Disk, type DiskEntry, type Runner, type RunOutcome, type RunRequest, serveAgent } from "@sheep/pen/agent";
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

export function memoryDisk(): MemoryDisk {
  const entries = new Map<string, MemoryEntry>();
  const ensureParents = (path: string) => {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join("/");
      if (entries.get(dir)?.kind !== "directory") entries.set(dir, { kind: "directory", mode: 0o755 });
    }
  };
  const removeTree = (path: string) => {
    entries.delete(path);
    for (const key of [...entries.keys()]) if (key.startsWith(`${path}/`)) entries.delete(key);
  };
  const disk: MemoryDisk = {
    entries,
    putFile(path, content, mode = 0o644) {
      ensureParents(path);
      entries.set(path, { kind: "file", bytes: typeof content === "string" ? encoder.encode(content) : content, mode });
    },
    putDirectory(path, mode = 0o755) {
      ensureParents(path);
      entries.set(path, { kind: "directory", mode });
    },
    putSymlink(path, target) {
      ensureParents(path);
      entries.set(path, { kind: "symlink", target, mode: 0o777 });
    },
    delete: removeTree,
    async read(path) {
      const entry = entries.get(path);
      if (entry?.kind !== "file") throw new Error(`ENOENT: ${path}`);
      return entry.bytes;
    },
    async write(path, bytes, options) {
      const existing = entries.get(path);
      disk.putFile(path, bytes, options?.mode ?? (existing?.kind === "file" ? existing.mode : 0o644));
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
      const listed: DiskEntry[] = [...entries].map(([path, entry]) => ({ path, kind: entry.kind as EntryKind, mode: entry.mode }));
      return listed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },
    async remove(path) {
      removeTree(path);
    },
    digest: webCryptoSha256,
  };
  return disk;
}

/** One step of a scripted run: wait, then act on the disk, then print. An `act` may be asynchronous, as a program asking the helper is. */
export interface ScriptStep {
  /** Milliseconds before this step, so a run takes time and its output streams. */
  wait?: number;
  act?: (disk: MemoryDisk) => void | Promise<void>;
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
export function scriptRunner(disk: MemoryDisk, scriptFor: ScriptFor, options: { deaf?: boolean; runs?: RunRequest[] } = {}): Runner {
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
          await step.act?.(disk);
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
  /** Every frame the agent received or sent, in order, as it saw them. */
  transcript: TranscriptEntry[];
  /** Pasture phase 4: every `run` the runner was handed, in order, with the environment each carried; a test counts setup's and reads the secrets off it. */
  runs: RunRequest[];
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
  const transcript: TranscriptEntry[] = [];
  const runs: RunRequest[] = [];

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
  const served = serveAgent(wrapped, disk, scriptRunner(disk, options.script ?? (() => undefined), { deaf: options.deaf ?? false, runs }), { pasture });
  return {
    disk,
    pasture,
    transcript,
    runs,
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
