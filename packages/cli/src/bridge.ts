/**
 * A local Unix socket that forwards pi's protocol frames to a cell's
 * WebSocket, so an unmodified `pi client --connect unix://…` reaches a
 * cell. The Unix side is a byte stream of length-prefixed frames; the
 * WebSocket side is one frame per binary message. The bridge re-frames in
 * one direction and passes frames through in the other.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FRAME_PREFIX_BYTES = 4;

export interface Bridge {
  /** The socket path, named `<serverId>.sock` as pi's client expects. */
  readonly path: string;
  close(): Promise<void>;
}

/** Splits a byte stream into complete length-prefixed frames, prefix included. */
export class FrameSplitter {
  #buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
    const frames: Buffer[] = [];
    for (;;) {
      if (this.#buffer.length < FRAME_PREFIX_BYTES) break;
      const length = this.#buffer.readUInt32BE(0) + FRAME_PREFIX_BYTES;
      if (this.#buffer.length < length) break;
      frames.push(this.#buffer.subarray(0, length));
      this.#buffer = this.#buffer.subarray(length);
    }
    return frames;
  }
}

function connectPeer(socket: Socket, socketUrl: string, onError: (error: Error) => void): void {
  const ws = new WebSocket(socketUrl);
  ws.binaryType = "arraybuffer";
  const splitter = new FrameSplitter();
  const pending: Buffer[] = [];
  let open = false;
  let closed = false;

  const shutdown = (): void => {
    if (closed) return;
    closed = true;
    socket.destroy();
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000, "bridge closed");
  };

  socket.on("data", (chunk: Buffer) => {
    for (const frame of splitter.push(chunk)) {
      if (open) ws.send(frame);
      else pending.push(frame);
    }
  });
  socket.on("close", shutdown);
  socket.on("error", (error) => {
    onError(error);
    shutdown();
  });

  ws.addEventListener("open", () => {
    open = true;
    for (const frame of pending.splice(0)) ws.send(frame);
  });
  ws.addEventListener("message", (event) => {
    const data = event.data;
    if (data instanceof ArrayBuffer) socket.write(Buffer.from(data));
    else if (typeof data === "string") socket.write(Buffer.from(data, "utf8"));
    else void (data as Blob).arrayBuffer().then((buffer) => socket.write(Buffer.from(buffer)));
  });
  ws.addEventListener("close", shutdown);
  ws.addEventListener("error", () => {
    onError(new Error(`WebSocket to ${socketUrl.replace(/token=[^&]+/, "token=…")} failed`));
    shutdown();
  });
}

/** Starts a bridge for one cell. Every connection to the socket becomes one WebSocket to the cell. */
export async function startBridge(options: { socketUrl: string; serverId: string; onError?: (error: Error) => void }): Promise<Bridge> {
  const dir = await mkdtemp(join(tmpdir(), "sheep-"));
  const path = join(dir, `${options.serverId}.sock`);
  const onError = options.onError ?? (() => {});
  const server: Server = createServer((socket) => connectPeer(socket, options.socketUrl, onError));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => resolve());
  });
  return {
    path,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}
