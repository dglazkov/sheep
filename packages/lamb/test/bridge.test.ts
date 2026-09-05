import { connect } from "node:net";
import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { FrameSplitter, startBridge } from "../src/bridge.js";

function frame(payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(body.length, 0);
  return Buffer.concat([prefix, body]);
}

describe("the bridge between a Unix socket and a cell's WebSocket", () => {
  it("re-frames a coalesced and split byte stream into whole frames", () => {
    const splitter = new FrameSplitter();
    const a = frame("alpha");
    const b = frame("beta");
    const joined = Buffer.concat([a, b, frame("gamma").subarray(0, 6)]);
    expect(splitter.push(joined).map((f) => f.subarray(4).toString())).toEqual(["alpha", "beta"]);
    expect(splitter.push(frame("gamma").subarray(6)).map((f) => f.subarray(4).toString())).toEqual(["gamma"]);
  });

  it("forwards frames both ways, one WebSocket message per frame", async () => {
    const received: string[] = [];
    const server = new WebSocketServer({ port: 0 });
    server.on("connection", (socket) => {
      socket.on("message", (data) => {
        const bytes = Buffer.from(data as Buffer);
        received.push(bytes.subarray(4).toString());
        socket.send(frame(`echo:${bytes.subarray(4).toString()}`));
      });
    });
    const port = (server.address() as { port: number }).port;
    const bridge = await startBridge({ socketUrl: `ws://127.0.0.1:${port}/`, serverId: "0b7f2d3e-4c5a-4b6c-8d7e-9f0a1b2c3d4e" });
    expect(bridge.path.endsWith("/0b7f2d3e-4c5a-4b6c-8d7e-9f0a1b2c3d4e.sock")).toBe(true);

    const client = connect(bridge.path);
    const echoed: string[] = [];
    const splitter = new FrameSplitter();
    client.on("data", (chunk: Buffer) => {
      for (const f of splitter.push(chunk)) echoed.push(f.subarray(4).toString());
    });
    await new Promise<void>((resolve) => client.once("connect", () => resolve()));
    // Two frames in one write, then one frame across two writes.
    client.write(Buffer.concat([frame("one"), frame("two")]));
    const three = frame("three");
    client.write(three.subarray(0, 5));
    client.write(three.subarray(5));
    await new Promise<void>((resolve) => {
      const check = () => (echoed.length === 3 ? resolve() : setTimeout(check, 10));
      check();
    });
    expect(received).toEqual(["one", "two", "three"]);
    expect(echoed).toEqual(["echo:one", "echo:two", "echo:three"]);
    client.destroy();
    await bridge.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
