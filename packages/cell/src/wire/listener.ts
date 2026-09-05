/**
 * pi-server's `ServerListener` whose connections are the cell's WebSockets.
 * One protocol frame per binary message; the byte stream is the frames in
 * order, which is exactly the Unix transport's contract with the framing
 * moved into the message boundary.
 */
import type { ByteConnection, ByteConnectionAcceptor, ByteConnectionHandler, ServerListener } from "@earendil-works/pi-server";

async function toBytes(data: unknown): Promise<Uint8Array | undefined> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  const tag = Object.prototype.toString.call(data);
  if (tag === "[object ArrayBuffer]") return new Uint8Array(data as ArrayBuffer);
  if (tag === "[object Blob]") return new Uint8Array(await (data as Blob).arrayBuffer());
  return undefined;
}

class WebSocketByteConnection implements ByteConnection {
  closed = false;

  constructor(private readonly socket: WebSocket) {}

  async send(chunk: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("WebSocket connection is closed");
    this.socket.send(chunk);
  }

  async close(finalChunk?: Uint8Array): Promise<void> {
    if (this.closed) return;
    if (finalChunk !== undefined && finalChunk.byteLength > 0) this.socket.send(finalChunk);
    this.closed = true;
    this.socket.close(1000, "server closed");
  }
}

export class WebSocketListener implements ServerListener {
  #accept: ByteConnectionAcceptor | undefined;
  readonly #handlers = new Map<WebSocket, ByteConnectionHandler>();

  async start(accept: ByteConnectionAcceptor): Promise<void> {
    this.#accept = accept;
  }

  async close(): Promise<void> {
    for (const [socket, handler] of this.#handlers) {
      handler.onClose();
      socket.close(1001, "server closing");
    }
    this.#handlers.clear();
    this.#accept = undefined;
  }

  get connectionCount(): number {
    return this.#handlers.size;
  }

  /** Hands an accepted socket to the server. Call after `socket.accept()`. */
  attach(socket: WebSocket): void {
    const accept = this.#accept;
    if (accept === undefined) throw new Error("Listener has not started");
    const connection = new WebSocketByteConnection(socket);
    const handler = accept(connection);
    this.#handlers.set(socket, handler);
    // Frames arrive as ArrayBuffer or Blob depending on the peer; read them in order.
    let tail = Promise.resolve();
    socket.addEventListener("message", (event) => {
      const data = event.data;
      tail = tail
        .then(async () => {
          const bytes = await toBytes(data);
          if (bytes === undefined) throw new Error("Text frames are not part of the pi protocol");
          handler.onData(bytes);
        })
        .catch((error: unknown) => handler.onError(error instanceof Error ? error : new Error(String(error))));
    });
    const finish = (): void => {
      if (!this.#handlers.delete(socket)) return;
      connection.closed = true;
      handler.onClose();
    };
    socket.addEventListener("close", finish);
    socket.addEventListener("error", (event) => {
      // A peer that vanishes mid-connection surfaces here; that is a close, not a protocol fault.
      const message = String((event as { message?: string }).message ?? "unknown");
      if (!/connection lost|reset|closed/i.test(message)) {
        handler.onError(new Error(`WebSocket error: ${message}`));
      }
      finish();
    });
  }
}
