/**
 * A pi-client ByteTransportFactory over a WebSocket the test already
 * opened with `SELF.fetch`. One protocol frame per binary message; frames
 * may arrive as ArrayBuffer or Blob and are delivered in order.
 */
import type { ByteTransport, ByteTransportFactory, ByteTransportHandlers } from "@earendil-works/pi-client";

async function toBytes(data: unknown): Promise<Uint8Array | undefined> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const tag = Object.prototype.toString.call(data);
  if (tag === "[object ArrayBuffer]") return new Uint8Array(data as ArrayBuffer);
  if (tag === "[object Blob]") return new Uint8Array(await (data as Blob).arrayBuffer());
  return undefined;
}

export function adoptedSocketTransport(socket: WebSocket): ByteTransportFactory {
  return async (handlers: ByteTransportHandlers): Promise<ByteTransport> => {
    let closed = false;
    let tail = Promise.resolve();
    socket.addEventListener("message", (event) => {
      tail = tail
        .then(async () => {
          const bytes = await toBytes(event.data);
          if (bytes === undefined) throw new Error("non-binary frame");
          if (!closed) handlers.onData(bytes);
        })
        .catch((error: unknown) => handlers.onError(error instanceof Error ? error : new Error(String(error))));
    });
    socket.addEventListener("close", () => {
      if (closed) return;
      closed = true;
      handlers.onClose();
    });
    socket.addEventListener("error", () => handlers.onError(new Error("WebSocket error")));
    return {
      async send(chunk) {
        if (closed) throw new Error("transport closed");
        socket.send(chunk);
      },
      close() {
        if (closed) return;
        closed = true;
        socket.close(1000, "client closed");
      },
    };
  };
}
