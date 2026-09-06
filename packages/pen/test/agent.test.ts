/**
 * The process test: the real `pen-agent` entry, spawned with plain node,
 * against a WebSocket server this test opens. Node on purpose: the agent
 * runs in Node inside the container, so Node is where it is proved. The
 * test acts as the cell: a manifest in, blobs down, an edit to the
 * directory, a sync out; then one real `run` through a real process,
 * its frames in order, and a `kill` of a `sleep 30` answered by `killed`.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type WebSocket, WebSocketServer } from "ws";
import { CELL_URL_ENV, decodeFrame, encodeFrame, type Frame, type ManifestEntry, TOKEN_ENV, TOKEN_PARAM } from "../src/protocol.ts";

const entry = new URL("../bin/pen-agent.mjs", import.meta.url).pathname;
const encoder = new TextEncoder();

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Messages from the agent, in order: frames decoded, bytes as they are. */
function inbox(socket: WebSocket): () => Promise<Frame | Uint8Array> {
  const queue: Array<Frame | Uint8Array> = [];
  const waiting: Array<(message: Frame | Uint8Array) => void> = [];
  socket.on("message", (data: Buffer, isBinary: boolean) => {
    const message = isBinary ? new Uint8Array(data) : decodeFrame(data.toString());
    const next = waiting.shift();
    if (next) next(message);
    else queue.push(message);
  });
  return () =>
    new Promise((resolve) => {
      const queued = queue.shift();
      if (queued !== undefined) resolve(queued);
      else waiting.push(resolve);
    });
}

describe("pen-agent, the process", () => {
  it("connects with the token, checks out a manifest, reports an edit, and exits when the socket closes", async () => {
    const server = new WebSocketServer({ port: 0 });
    const connection = new Promise<{ socket: WebSocket; url: string }>((resolve) => {
      server.once("connection", (socket, request) => resolve({ socket, url: request.url ?? "" }));
    });
    const port = (server.address() as { port: number }).port;
    const workspace = await mkdtemp(join(tmpdir(), "pen-"));
    const stderr: string[] = [];
    const child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        [CELL_URL_ENV]: `ws://127.0.0.1:${port}/pen`,
        [TOKEN_ENV]: "minted-for-this-container",
        PEN_WORKSPACE: workspace,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));

    const { socket, url } = await connection;
    const next = inbox(socket);
    const address = new URL(url, "ws://127.0.0.1");
    expect(address.pathname).toBe("/pen");
    expect(address.searchParams.get(TOKEN_PARAM)).toBe("minted-for-this-container");

    socket.send(encodeFrame({ type: "ping", id: "1" }));
    expect(await next()).toEqual({ type: "pong", id: "1" });

    // A credential answer no helper asked for is dropped without a word, since its value must not be repeated; the agent goes on.
    socket.send(encodeFrame({ type: "credential", id: "cred-none", value: "x", expires: 0 }));
    socket.send(encodeFrame({ type: "ping", id: "after-stray" }));
    expect(await next()).toEqual({ type: "pong", id: "after-stray" });

    // Sync in: two files, one executable, and a symlink, under a directory.
    const hello = encoder.encode("hello from the rows\n");
    const script = encoder.encode("#!/bin/sh\necho ok\n");
    const target = encoder.encode("hello.txt");
    const manifest: ManifestEntry[] = [
      { path: "src", kind: "directory", mode: 0o755, hash: null },
      { path: "src/hello.txt", kind: "file", mode: 0o644, hash: sha256(hello) },
      { path: "src/link", kind: "symlink", mode: 0o777, hash: sha256(target) },
      { path: "src/run.sh", kind: "file", mode: 0o755, hash: sha256(script) },
    ];
    socket.send(encodeFrame({ type: "manifest", id: "in-1", entries: manifest }));
    const need = await next();
    expect(need).toEqual({ type: "need", id: "in-1", hashes: [sha256(hello), sha256(target), sha256(script)] });
    for (const bytes of [hello, target, script]) {
      socket.send(encodeFrame({ type: "blob", hash: sha256(bytes), size: bytes.byteLength }));
      socket.send(bytes);
    }
    expect(await next()).toEqual({ type: "checkout", id: "in-1" });
    expect(await readFile(join(workspace, "src/hello.txt"), "utf8")).toBe("hello from the rows\n");
    expect(await readlink(join(workspace, "src/link"))).toBe("hello.txt");
    expect((await lstat(join(workspace, "src/run.sh"))).mode & 0o777).toBe(0o755);
    expect((await lstat(join(workspace, "src/hello.txt"))).mode & 0o777).toBe(0o644);

    // The command's work: an edit, an add, a delete, a mode, and a cache the rule keeps.
    await writeFile(join(workspace, "src/hello.txt"), "edited in the container\n");
    await writeFile(join(workspace, "src/new.txt"), "new\n");
    await rm(join(workspace, "src/run.sh"));
    await chmod(join(workspace, "src/hello.txt"), 0o600);
    await writeFile(join(workspace, ".gitignore"), "*.log\n");
    await writeFile(join(workspace, "debug.log"), "noise\n");
    await mkdir(join(workspace, "node_modules/pkg"), { recursive: true });
    await writeFile(join(workspace, "node_modules/pkg/index.js"), "cached\n");
    await rm(join(workspace, "src/link"));
    await symlink("new.txt", join(workspace, "src/link"));

    socket.send(encodeFrame({ type: "sync", id: "out-1" }));
    const edited = encoder.encode("edited in the container\n");
    const added = encoder.encode("new\n");
    const gitignore = encoder.encode("*.log\n");
    const retarget = encoder.encode("new.txt");
    expect(await next()).toEqual({
      type: "changed",
      id: "out-1",
      entries: [
        { path: ".gitignore", kind: "file", mode: 0o644, hash: sha256(gitignore), size: gitignore.byteLength },
        { path: "src/hello.txt", kind: "file", mode: 0o600, hash: sha256(edited), size: edited.byteLength },
        { path: "src/link", kind: "symlink", mode: 0o777, hash: sha256(retarget), size: retarget.byteLength },
        { path: "src/new.txt", kind: "file", mode: 0o644, hash: sha256(added), size: added.byteLength },
      ],
      deleted: ["src/run.sh"],
    });
    socket.send(encodeFrame({ type: "need", id: "out-1", hashes: [sha256(edited), sha256(retarget)] }));
    expect(await next()).toEqual({ type: "blob", hash: sha256(edited), size: edited.byteLength });
    expect(await next()).toEqual(edited);
    expect(await next()).toEqual({ type: "blob", hash: sha256(retarget), size: retarget.byteLength });
    expect(await next()).toEqual(retarget);
    socket.send(encodeFrame({ type: "synced", id: "out-1", refused: [] }));

    // A second manifest that drops the new file and keeps the rest: the agent needs nothing and deletes it, not the cache.
    const second: ManifestEntry[] = [
      { path: ".gitignore", kind: "file", mode: 0o644, hash: sha256(gitignore) },
      { path: "src", kind: "directory", mode: 0o755, hash: null },
      { path: "src/hello.txt", kind: "file", mode: 0o600, hash: sha256(edited) },
      { path: "src/link", kind: "symlink", mode: 0o777, hash: sha256(retarget) },
    ];
    socket.send(encodeFrame({ type: "manifest", id: "in-2", entries: second }));
    expect(await next()).toEqual({ type: "need", id: "in-2", hashes: [] });
    expect(await next()).toEqual({ type: "checkout", id: "in-2" });
    await expect(lstat(join(workspace, "src/new.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(workspace, "debug.log"), "utf8")).toBe("noise\n");
    expect(await readFile(join(workspace, "node_modules/pkg/index.js"), "utf8")).toBe("cached\n");

    // A run through the real process: both streams as they happen, the exit code, then `changed` unasked.
    socket.send(encodeFrame({ type: "run", id: "run-1", command: "echo hi; echo err >&2; exit 3", cwd: "/workspace", env: { PEN_TEST: "1" } }));
    // Two pipes, so the two chunks may arrive in either order; the exit comes after both.
    const chunks = [await next(), await next()] as Array<{ type: string }>;
    expect(chunks.sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { type: "stderr", id: "run-1", data: "err\n" },
      { type: "stdout", id: "run-1", data: "hi\n" },
    ]);
    expect(await next()).toEqual({ type: "exit", id: "run-1", code: 3 });
    expect(await next()).toEqual({ type: "changed", id: "run-1", entries: [], deleted: [] });
    socket.send(encodeFrame({ type: "need", id: "run-1", hashes: [] }));
    socket.send(encodeFrame({ type: "synced", id: "run-1", refused: [] }));

    // The run sees the request's env over the process's own, runs under the root, and its files come back.
    socket.send(encodeFrame({ type: "run", id: "run-2", command: "pwd; printf %s \"$PEN_TEST\" > out.txt", cwd: "/workspace/src", env: { PEN_TEST: "two" } }));
    expect(await next()).toEqual({ type: "stdout", id: "run-2", data: `${await realpath(join(workspace, "src"))}\n` });
    expect(await next()).toEqual({ type: "exit", id: "run-2", code: 0 });
    const out = encoder.encode("two");
    expect(await next()).toEqual({ type: "changed", id: "run-2", entries: [{ path: "src/out.txt", kind: "file", mode: 0o644, hash: sha256(out), size: 3 }], deleted: [] });
    socket.send(encodeFrame({ type: "need", id: "run-2", hashes: [sha256(out)] }));
    expect(await next()).toEqual({ type: "blob", hash: sha256(out), size: 3 });
    expect(await next()).toEqual(out);
    socket.send(encodeFrame({ type: "synced", id: "run-2", refused: [] }));

    // A kill: `sleep 30` ends at once, `killed` names the reason, no exit code is claimed, and `changed` still follows.
    socket.send(encodeFrame({ type: "run", id: "run-3", command: "echo started; sleep 30; echo never", cwd: "/workspace", env: {} }));
    expect(await next()).toEqual({ type: "stdout", id: "run-3", data: "started\n" });
    socket.send(encodeFrame({ type: "ping", id: "while-running" }));
    expect(await next()).toEqual({ type: "pong", id: "while-running" });
    const killedAt = Date.now();
    socket.send(encodeFrame({ type: "kill", id: "run-3", reason: "timeout" }));
    expect(await next()).toEqual({ type: "killed", id: "run-3", reason: "timeout" });
    expect(Date.now() - killedAt).toBeLessThan(5_000);
    expect(await next()).toEqual({ type: "changed", id: "run-3", entries: [], deleted: [] });
    socket.send(encodeFrame({ type: "need", id: "run-3", hashes: [] }));
    socket.send(encodeFrame({ type: "synced", id: "run-3", refused: [] }));

    // The runner's own backstop: a timeout the cell never enforced still ends the run.
    socket.send(encodeFrame({ type: "run", id: "run-4", command: "sleep 30", cwd: "/workspace", env: {}, timeout: 0.2 }));
    expect(await next()).toEqual({ type: "killed", id: "run-4", reason: "timeout" });
    expect(await next()).toEqual({ type: "changed", id: "run-4", entries: [], deleted: [] });
    socket.send(encodeFrame({ type: "need", id: "run-4", hashes: [] }));
    socket.send(encodeFrame({ type: "synced", id: "run-4", refused: [] }));

    socket.close(1000, "cell done");
    expect(await exited(child)).toBe(0);
    expect(stderr.join("")).toBe("");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(workspace, { recursive: true, force: true });
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
