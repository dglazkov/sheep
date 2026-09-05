/**
 * The fake container every pen test talks to: the real agent handler from
 * `@lamb/pen/agent`, served over one end of a `WebSocketPair` in workerd,
 * with its checkout in a `Map`. Not a second agent; the agent over a
 * different disk. The test holds the other end, which is what the cell
 * will hold, and `stop()` is the shepherd's hand: the container going away
 * mid-anything.
 */
import { type Disk, type DiskEntry, serveAgent } from "@lamb/pen/agent";
import { type CellFrame, type ContainerFrame, decodeFrame, encodeFrame } from "@lamb/pen/protocol";

export interface MemoryDisk extends Disk {
  readonly files: Map<string, Uint8Array>;
  readonly modes: Map<string, number>;
}

export function memoryDisk(): MemoryDisk {
  const files = new Map<string, Uint8Array>();
  const modes = new Map<string, number>();
  return {
    files,
    modes,
    async read(path) {
      const bytes = files.get(path);
      if (bytes === undefined) throw new Error(`ENOENT: ${path}`);
      return bytes;
    },
    async write(path, bytes, options) {
      files.set(path, bytes);
      if (options?.mode !== undefined) modes.set(path, options.mode);
    },
    async list() {
      const seen = new Map<string, DiskEntry>();
      for (const path of files.keys()) {
        const parts = path.split("/");
        for (let depth = 1; depth < parts.length; depth++) {
          const dir = parts.slice(0, depth).join("/");
          seen.set(dir, { path: dir, kind: "directory", mode: 0o755 });
        }
        seen.set(path, { path, kind: "file", mode: modes.get(path) ?? 0o644 });
      }
      return [...seen.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },
    async remove(path) {
      files.delete(path);
      modes.delete(path);
      for (const key of [...files.keys()]) if (key.startsWith(`${path}/`)) files.delete(key);
    },
  };
}

export interface FakeContainer {
  /** The cell's end of the socket. */
  socket: WebSocket;
  disk: MemoryDisk;
  /** The container dies: its end closes with `reason`, and nothing more is answered. */
  stop(reason?: string): void;
  /** Resolves once the agent has seen its socket close. */
  closed: Promise<void>;
}

export function startFakeContainer(disk: MemoryDisk = memoryDisk()): FakeContainer {
  const pair = new WebSocketPair();
  const cellEnd = pair[0];
  const agentEnd = pair[1];
  cellEnd.accept();
  agentEnd.accept();
  const served = serveAgent(agentEnd, disk);
  return {
    socket: cellEnd,
    disk,
    stop(reason = "container stopped") {
      agentEnd.close(1012, reason);
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
