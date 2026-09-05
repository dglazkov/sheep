/**
 * The process test: the real `pen-agent` entry, spawned with plain node,
 * against a WebSocket server this test opens. Node on purpose: the agent
 * runs in Node inside the container, so Node is where it is proved.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type WebSocket, WebSocketServer } from "ws";
import { CELL_URL_ENV, decodeFrame, encodeFrame, type Frame, TOKEN_ENV, TOKEN_PARAM } from "../src/protocol.ts";

const entry = new URL("../bin/pen-agent.mjs", import.meta.url).pathname;

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

describe("pen-agent, the process", () => {
  it("connects to PEN_CELL_URL with the token, answers ping, and exits when the socket closes", async () => {
    const server = new WebSocketServer({ port: 0 });
    const connection = new Promise<{ socket: WebSocket; url: string }>((resolve) => {
      server.once("connection", (socket, request) => resolve({ socket, url: request.url ?? "" }));
    });
    const port = (server.address() as { port: number }).port;
    const stderr: string[] = [];
    const child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        [CELL_URL_ENV]: `ws://127.0.0.1:${port}/pen`,
        [TOKEN_ENV]: "minted-for-this-container",
        PEN_WORKSPACE: await mkdtemp(join(tmpdir(), "pen-")),
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));

    const { socket, url } = await connection;
    const address = new URL(url, "ws://127.0.0.1");
    expect(address.pathname).toBe("/pen");
    expect(address.searchParams.get(TOKEN_PARAM)).toBe("minted-for-this-container");

    const answer = new Promise<Frame>((resolve) => socket.once("message", (data) => resolve(decodeFrame(data.toString()))));
    socket.send(encodeFrame({ type: "ping", id: "1" }));
    expect(await answer).toEqual({ type: "pong", id: "1" });

    const notYet = new Promise<Frame>((resolve) => socket.once("message", (data) => resolve(decodeFrame(data.toString()))));
    socket.send(encodeFrame({ type: "synced", id: "1" }));
    expect(await notYet).toMatchObject({ type: "error", code: "unsupported", of: "synced" });

    socket.close(1000, "cell done");
    expect(await exited(child)).toBe(0);
    expect(stderr.join("")).toBe("");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("refuses to start without its environment", async () => {
    const env = { ...process.env };
    delete env[CELL_URL_ENV];
    delete env[TOKEN_ENV];
    const child = spawn(process.execPath, [entry], { env, stdio: ["ignore", "ignore", "pipe"] });
    const stderr: string[] = [];
    child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
    expect(await exited(child)).toBe(2);
    expect(stderr.join("")).toContain(CELL_URL_ENV);
  });
});
