/**
 * The agent: the container's side of the protocol, as code that runs
 * anywhere. Given a socket and a disk it answers the cell's frames. The
 * process in the image (`node.ts`) hands it Node's WebSocket and a disk
 * over `node:fs` under `/workspace`; the cell's tests hand it one end of
 * a `WebSocketPair` and a disk in memory. There is one agent, not a real
 * one and a fake one: the fake is this file over a different disk.
 *
 * Phase 0 answers `ping`. Every other frame gets a typed `error` so a
 * later phase fills the case in rather than discovering it was silently
 * dropped.
 */
import { type CellFrame, type ContainerFrame, decodeFrame, encodeFrame } from "./protocol.ts";

export interface DiskEntry {
  /** Relative to the checkout root, no leading slash. */
  path: string;
  kind: "file" | "directory" | "symlink";
  mode: number;
}

/** What the agent needs of a filesystem. The checkout root is the disk's own business. */
export interface Disk {
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array, options?: { mode?: number }): Promise<void>;
  /** Every entry under the root, the root excluded, sorted by path. */
  list(): Promise<DiskEntry[]>;
  remove(path: string): Promise<void>;
}

/**
 * The part of a WebSocket the agent uses, so the same code takes workerd's
 * and Node's without either's types.
 */
export interface AgentSocket {
  send(data: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: unknown) => void): void;
}

/** Answers one frame. Pure over the disk; the socket is the caller's. */
export async function handleFrame(frame: CellFrame, _disk: Disk): Promise<ContainerFrame[]> {
  switch (frame.type) {
    case "ping":
      return [frame.id === undefined ? { type: "pong" } : { type: "pong", id: frame.id }];
    default:
      return [{ type: "error", code: "unsupported", of: frame.type, message: `the agent does not handle ${frame.type} yet` }];
  }
}

export interface ServedAgent {
  /** Resolves when the socket closes; the agent sends nothing after. */
  closed: Promise<void>;
}

/** Wires the handler to a socket. Frames are answered in the order they arrive. */
export function serveAgent(socket: AgentSocket, disk: Disk): ServedAgent {
  let closed = false;
  let tail = Promise.resolve();
  const send = (frames: ContainerFrame[]) => {
    if (closed) return;
    for (const frame of frames) socket.send(encodeFrame(frame));
  };
  socket.addEventListener("message", (event) => {
    tail = tail.then(async () => {
      if (typeof event.data !== "string") {
        send([{ type: "error", code: "malformed", of: "binary", message: "frames are text messages" }]);
        return;
      }
      let frame: CellFrame;
      try {
        frame = decodeFrame(event.data) as CellFrame;
      } catch (error) {
        send([{ type: "error", code: "malformed", of: "?", message: error instanceof Error ? error.message : String(error) }]);
        return;
      }
      send(await handleFrame(frame, disk));
    });
  });
  const closedPromise = new Promise<void>((resolve) => {
    socket.addEventListener("close", () => {
      closed = true;
      resolve();
    });
  });
  return { closed: closedPromise };
}
