/**
 * The process test: the real `pen-agent` entry, spawned with plain node,
 * against a WebSocket server this test opens. Node on purpose: the agent
 * runs in Node inside the container, so Node is where it is proved. The
 * test acts as the cell: a manifest in, blobs down, an edit to the
 * directory, a sync out; then one real `run` through a real process,
 * its frames in order, and a `kill` of a `sleep 30` answered by `killed`.
 *
 * Serve phase 0 adds the forward, and for the same reason: the fetcher
 * runs in Node inside the container, so Node against a real port is where
 * it is proved. A `fetch` frame reaches a `node:http` server on the
 * loopback and comes back as `response` and its bytes, with the host
 * rewritten, the encoding pinned so nothing is compressed, the redirect
 * left for the browser, a body carried each way, and a port with nothing
 * on it answered with status `0` rather than an error frame.
 *
 * Serve phase 1 adds the second half of that: which loopback the server is
 * on is not the agent's to assume. Real servers are stood up on `::1` and
 * on `127.0.0.1`, at the same port and at different ones, and the case
 * reads off them which address was dialled, in which order, what `host`
 * the server saw, and that the agent's memory of a port dies with the
 * server it remembered.
 *
 * Fold phase 2 adds the two disks the image gives the agent, `~` and
 * `/cache`, and proves them where they run: real directories written by a
 * real `bash` with `HOME` and npm's prefix pointed at them, as the image
 * points them. `~` comes in from a manifest and goes back out under the
 * home rule; `/cache`, an executable, a symlink, a binary larger than a
 * chunk, and a `0555` directory among it, is described as a record and
 * put back into a second agent's empty disks one chunk per `need`, where
 * the tool runs from `PATH`; and a put-back cut off empties a real
 * `/cache`, read-only directory and all.
 *
 * Fold phase 2's second pass, after the walk: the agent dials with `ws`
 * and its upgrade offers no `Sec-WebSocket-Extensions`, so nothing it is
 * sent is deflated; a hard-linked pair under `/cache` is one file's bytes in
 * the record and one inode with two names after the put-back; and a
 * description asked for over an untouched put-back answers with the record
 * put back and writes nothing to the scratch, while one file touched brings
 * the whole description back.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type WebSocket, WebSocketServer } from "ws";
import { CELL_URL_ENV, decodeFrame, encodeFrame, FETCH_FAILED_STATUS, type Frame, type ManifestEntry, TOKEN_ENV, TOKEN_PARAM } from "../src/protocol.ts";

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
    const connection = new Promise<{ socket: WebSocket; url: string; extensions: string | undefined }>((resolve) => {
      server.once("connection", (socket, request) => resolve({ socket, url: request.url ?? "", extensions: request.headers["sec-websocket-extensions"] }));
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

    const { socket, url, extensions } = await connection;
    const next = inbox(socket);
    const address = new URL(url, "ws://127.0.0.1");
    expect(address.pathname).toBe("/pen");
    expect(address.searchParams.get(TOKEN_PARAM)).toBe("minted-for-this-container");
    // Fold phase 2: the upgrade offers no extension, so the cell has nothing to deflate with (Node's own WebSocket always offers one).
    expect(extensions).toBeUndefined();

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

  it("forwards a fetch to a real port, and answers one with nothing on it with status 0", async () => {
    // A server of the kind a sheep would have started: it says back what it was asked, so the test can read the agent's three changes off it.
    const origin: Server = createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "/moved" });
        response.end();
        return;
      }
      if (request.url === "/bytes") {
        response.writeHead(200, { "content-type": "image/png" });
        response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x7f, 0x80]));
        return;
      }
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ url: request.url, method: request.method, headers: request.headers, body: Buffer.concat(chunks).toString("utf8") }));
      });
    });
    await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
    const originPort = (origin.address() as { port: number }).port;

    const server = new WebSocketServer({ port: 0 });
    const connection = new Promise<WebSocket>((resolve) => server.once("connection", (socket) => resolve(socket)));
    const port = (server.address() as { port: number }).port;
    const workspace = await mkdtemp(join(tmpdir(), "pen-"));
    const stderr: string[] = [];
    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, [CELL_URL_ENV]: `ws://127.0.0.1:${port}/pen`, [TOKEN_ENV]: "minted", PEN_WORKSPACE: workspace },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
    const socket = await connection;
    const next = inbox(socket);

    /** One request out and its answer back: the frame, and the bytes when the frame says there are any. */
    const ask = async (frame: Record<string, unknown>, body?: Uint8Array): Promise<{ frame: { status: number; headers: Record<string, string>; size: number }; body: Uint8Array }> => {
      socket.send(encodeFrame({ ...frame, type: "fetch", size: body === undefined ? 0 : body.byteLength } as unknown as Frame));
      if (body !== undefined) socket.send(body);
      const answered = (await next()) as { type: string; id: string; status: number; headers: Record<string, string>; size: number };
      expect(answered.type).toBe("response");
      expect(answered.id).toBe(frame.id);
      const bytes = answered.size === 0 ? new Uint8Array(0) : ((await next()) as Uint8Array);
      expect(bytes.byteLength).toBe(answered.size);
      return { frame: answered, body: bytes };
    };
    const said = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as { url: string; method: string; headers: Record<string, string>; body: string };

    // The browser's own request, as the eyes would forward it: its host is `sheep.invalid`, and it asks for three compressions.
    const asked = await ask({
      id: "f-1",
      port: originPort,
      method: "GET",
      url: "/page?x=1",
      headers: { host: "sheep.invalid", "accept-encoding": "gzip, deflate, br, zstd", "user-agent": "the shepherd's chrome", accept: "text/html" },
    });
    expect(asked.frame.status).toBe(200);
    expect(asked.frame.headers["content-type"]).toBe("application/json; charset=utf-8");
    const echo = said(asked.body);
    expect(echo.url).toBe("/page?x=1");
    // The host is the loopback and the port, so a server that checks it — as Vite has since 6.0.9 — answers.
    expect(echo.headers.host).toBe(`127.0.0.1:${originPort}`);
    // Nothing the browser asked to have compressed is compressed: the bytes are the bytes.
    expect(echo.headers["accept-encoding"]).toBe("identity");
    // Everything else is the browser's own.
    expect(echo.headers["user-agent"]).toBe("the shepherd's chrome");
    expect(echo.headers.accept).toBe("text/html");

    // A body each way, and no byte of it through the shell.
    const posted = await ask({ id: "f-2", port: originPort, method: "POST", url: "/form", headers: { "content-type": "text/plain" } }, encoder.encode("wool and grass"));
    expect(said(posted.body)).toMatchObject({ method: "POST", body: "wool and grass" });

    // The redirect is the browser's to follow: the agent hands back the 302 itself, with no body and so no binary message.
    const moved = await ask({ id: "f-3", port: originPort, method: "GET", url: "/redirect", headers: {} });
    expect(moved.frame.status).toBe(302);
    expect(moved.frame.headers.location).toBe("/moved");
    expect(moved.frame.size).toBe(0);

    // Bytes that are not text survive whole.
    const png = await ask({ id: "f-4", port: originPort, method: "GET", url: "/bytes", headers: {} });
    expect([...png.body]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x7f, 0x80]);

    // A port with nothing on it — one the kernel handed out and took back — is a response, not an error frame:
    // the socket stays usable and the cell reads the status.
    const vacated = createServer();
    await new Promise<void>((resolve) => vacated.listen(0, "127.0.0.1", resolve));
    const deadPort = (vacated.address() as { port: number }).port;
    await new Promise<void>((resolve) => vacated.close(() => resolve()));
    const dead = await ask({ id: "f-5", port: deadPort, method: "GET", url: "/", headers: {} });
    expect(dead.frame.status).toBe(FETCH_FAILED_STATUS);
    expect(new TextDecoder().decode(dead.body).length).toBeGreaterThan(0);

    // And the socket is still the socket.
    socket.send(encodeFrame({ type: "ping", id: "after-fetches" }));
    expect(await next()).toEqual({ type: "pong", id: "after-fetches" });

    socket.close(1000, "cell done");
    expect(await exited(child)).toBe(0);
    expect(stderr.join("")).toBe("");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => origin.close(() => resolve()));
    await rm(workspace, { recursive: true, force: true });
  });

  it("reaches a server on either loopback, tries 127.0.0.1 first, and never lets a remembered address outlive its server", async () => {
    /** A server that says which address it was bound to and what `host` it was asked with: the two facts this case is about. */
    const speaking = (who: string): Server =>
      createServer((request, response) => {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ who, host: request.headers.host }));
      });
    const listen = (server: Server, address: string, port = 0): Promise<number> =>
      new Promise((resolve) => server.listen(port, address, () => resolve((server.address() as { port: number }).port)));
    /** Closed with its connections: the agent's fetch keeps them alive, and a port must be free the moment this returns. */
    const close = async (server: Server): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    };

    // A server told to listen on `localhost` inside the image binds this and refuses 127.0.0.1 — which is Vite's default.
    const six = speaking("::1");
    const sixPort = await listen(six, "::1");

    const server = new WebSocketServer({ port: 0 });
    const connection = new Promise<WebSocket>((resolve) => server.once("connection", (socket) => resolve(socket)));
    const port = (server.address() as { port: number }).port;
    const workspace = await mkdtemp(join(tmpdir(), "pen-"));
    const stderr: string[] = [];
    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, [CELL_URL_ENV]: `ws://127.0.0.1:${port}/pen`, [TOKEN_ENV]: "minted", PEN_WORKSPACE: workspace },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
    const socket = await connection;
    const next = inbox(socket);

    let asked = 0;
    /** One `GET /` at a port, answered: the status, and what the server said about itself when there was a server. */
    const get = async (at: number): Promise<{ status: number; who?: string; host?: string }> => {
      const id = `l-${++asked}`;
      socket.send(encodeFrame({ type: "fetch", id, port: at, method: "GET", url: "/", headers: { host: "sheep.invalid" }, size: 0 } as unknown as Frame));
      const answered = (await next()) as { type: string; id: string; status: number; size: number };
      expect(answered.type).toBe("response");
      expect(answered.id).toBe(id);
      const bytes = answered.size === 0 ? new Uint8Array(0) : ((await next()) as Uint8Array);
      if (answered.status !== 200) return { status: answered.status };
      return { status: answered.status, ...(JSON.parse(new TextDecoder().decode(bytes)) as { who: string; host: string }) };
    };

    // The one the walk found: a port listening only on `::1` is reached, and the `host` it sees is the address that was dialled,
    // since that is what makes Vite's host check pass.
    expect(await get(sixPort)).toEqual({ status: 200, who: "::1", host: `[::1]:${sixPort}` });

    // A server on 127.0.0.1 is reached, and is first: with one on each stack at the same port, it is the one that answers.
    const four = speaking("127.0.0.1");
    const fourPort = await listen(four, "127.0.0.1");
    const shadow = speaking("shadow");
    await listen(shadow, "::1", fourPort);
    expect(await get(fourPort)).toEqual({ status: 200, who: "127.0.0.1", host: `127.0.0.1:${fourPort}` });

    // The memory is per port and is consulted first: a 127.0.0.1 server stood up at the port already answered on `::1` is not
    // reached, because the address that answered there is the address tried first. A page's fifty requests pay no refused connect.
    const late = speaking("late");
    await listen(late, "127.0.0.1", sixPort);
    expect(await get(sixPort)).toEqual({ status: 200, who: "::1", host: `[::1]:${sixPort}` });

    // And the memory is a hint and never a verdict: the server that was remembered goes away, and the next fetch finds the other stack.
    await close(six);
    expect(await get(sixPort)).toEqual({ status: 200, who: "late", host: `127.0.0.1:${sixPort}` });

    // A port with nothing on either stack is still status 0 — the cell's "not listening" — and not an error frame.
    const vacant = createServer();
    await new Promise<void>((resolve) => vacant.listen(0, "::", resolve));
    const deadPort = (vacant.address() as { port: number }).port;
    await close(vacant);
    expect((await get(deadPort)).status).toBe(FETCH_FAILED_STATUS);

    socket.close(1000, "cell done");
    expect(await exited(child)).toBe(0);
    expect(stderr.join("")).toBe("");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const one of [four, shadow, late]) await close(one);
    await rm(workspace, { recursive: true, force: true });
  });

  it("fold phase 2: syncs `~` both ways, and describes `/cache` and puts it back as a record, over real disks that real bash wrote", { timeout: 60_000 }, async () => {
    const server = new WebSocketServer({ port: 0 });
    const port = (server.address() as { port: number }).port;
    const made: string[] = [];
    const dir = async (prefix: string) => {
      const path = await mkdtemp(join(tmpdir(), prefix));
      made.push(path);
      return path;
    };
    const stderr: string[] = [];
    /** One container: the agent over its own workspace, `~`, and `/cache`, with `HOME`, npm's prefix, and `PATH` as the image sets them. */
    /** The one scratch the agent made under the `TMPDIR` a container was given, and what is in it. */
    const scratchOf = async (tmp: string): Promise<string[]> => {
      const made = await readdir(tmp);
      expect(made).toHaveLength(1);
      return readdir(join(tmp, made[0]!));
    };
    const container = async (): Promise<{ socket: WebSocket; next: () => Promise<Frame | Uint8Array>; child: ChildProcess; home: string; cache: string; tmp: string }> => {
      const [workspace, home, cache, tmp] = [await dir("pen-ws-"), await dir("pen-home-"), await dir("pen-cache-"), await dir("pen-tmp-")];
      const connection = new Promise<WebSocket>((resolve) => server.once("connection", (socket) => resolve(socket)));
      const child = spawn(process.execPath, [entry], {
        env: {
          ...process.env,
          [CELL_URL_ENV]: `ws://127.0.0.1:${port}/pen`,
          [TOKEN_ENV]: "minted",
          PEN_WORKSPACE: workspace,
          PEN_HOME: home,
          PEN_CACHE: cache,
          HOME: home,
          TMPDIR: tmp,
          NPM_CONFIG_PREFIX: cache,
          PATH: `${cache}/bin:${process.env.PATH ?? ""}`,
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
      const socket = await connection;
      return { socket, next: inbox(socket), child, home, cache, tmp };
    };
    const blob = (socket: WebSocket, bytes: Uint8Array) => {
      socket.send(encodeFrame({ type: "blob", hash: sha256(bytes), size: bytes.byteLength }));
      socket.send(bytes);
    };

    // The first container: `~` arrives from the rows with a `.gitconfig` in it.
    const first = await container();
    const gitconfig = encoder.encode("[user]\n\tname = Walker\n");
    const homeManifest: ManifestEntry[] = [{ path: ".gitconfig", kind: "file", mode: 0o644, hash: sha256(gitconfig) }];
    first.socket.send(encodeFrame({ type: "manifest", id: "in-1", entries: [], home: homeManifest }));
    expect(await first.next()).toEqual({ type: "need", id: "in-1", hashes: [sha256(gitconfig)] });
    blob(first.socket, gitconfig);
    expect(await first.next()).toEqual({ type: "checkout", id: "in-1" });
    expect(await readFile(join(first.home, ".gitconfig"), "utf8")).toBe("[user]\n\tname = Walker\n");

    // A real bash, as setup would be: a tool's state under `~`, what the home rule keeps in the container, and an install under
    // npm's prefix: an executable, a symlink onto `bin`, a binary larger than a chunk, and a `0555` directory with a file in it.
    const state = encoder.encode("who = walker\n");
    const install = [
      "set -e",
      "umask 022",
      "mkdir -p ~/.config/tool ~/.cache ~/.npm",
      "printf 'who = walker\\n' > ~/.config/tool/state",
      "echo scratch > ~/.cache/junk && echo scratch > ~/.npm/junk",
      'mkdir -p "$NPM_CONFIG_PREFIX/bin" "$NPM_CONFIG_PREFIX/lib/node_modules/tool/bin" "$NPM_CONFIG_PREFIX/share/ro/inner"',
      "printf '#!/bin/sh\\necho tool 1.0\\n' > \"$NPM_CONFIG_PREFIX/lib/node_modules/tool/bin/tool.sh\"",
      'chmod 755 "$NPM_CONFIG_PREFIX/lib/node_modules/tool/bin/tool.sh"',
      'ln -s ../lib/node_modules/tool/bin/tool.sh "$NPM_CONFIG_PREFIX/bin/tool"',
      'head -c 9437184 /dev/urandom > "$NPM_CONFIG_PREFIX/lib/node_modules/tool/bin/blob.bin"',
      // A second name for the binary, as npm gives wrangler's `workerd`: earlier in path order, so it is the name that carries the bytes.
      'mkdir -p "$NPM_CONFIG_PREFIX/lib/node_modules/other" && ln "$NPM_CONFIG_PREFIX/lib/node_modules/tool/bin/blob.bin" "$NPM_CONFIG_PREFIX/lib/node_modules/other/blob.bin"',
      'printf data > "$NPM_CONFIG_PREFIX/share/ro/inner/file" && chmod 555 "$NPM_CONFIG_PREFIX/share/ro"',
      "tool",
    ].join("\n");
    first.socket.send(encodeFrame({ type: "run", id: "setup", command: install, cwd: "/workspace", env: {} }));
    expect(await first.next()).toEqual({ type: "stdout", id: "setup", data: "tool 1.0\n" });
    expect(await first.next()).toEqual({ type: "exit", id: "setup", code: 0 });
    // The sync-out walks `~` beside the checkout under the home rule: the tool's state comes back, `.cache` and `.npm` do not.
    expect(await first.next()).toEqual({
      type: "changed",
      id: "setup",
      entries: [],
      deleted: [],
      home: {
        entries: [
          { path: ".config", kind: "directory", mode: 0o755, hash: null, size: 0 },
          { path: ".config/tool", kind: "directory", mode: 0o755, hash: null, size: 0 },
          { path: ".config/tool/state", kind: "file", mode: 0o644, hash: sha256(state), size: state.byteLength },
        ],
        deleted: [],
      },
    });
    first.socket.send(encodeFrame({ type: "need", id: "setup", hashes: [sha256(state)] }));
    expect(await first.next()).toEqual({ type: "blob", hash: sha256(state), size: state.byteLength });
    expect(await first.next()).toEqual(state);
    first.socket.send(encodeFrame({ type: "synced", id: "setup", refused: [], home: [] }));

    // Kept: `/cache` described as a record in chunks on the scratch, then each chunk asked for alone. The binary's two names are
    // four file entries' worth of names and one file's worth of bytes: two chunks, where two copies would be three.
    first.socket.send(encodeFrame({ type: "cache", id: "save" }));
    const described = (await first.next()) as { type: string; id: string; hash: string; chunks: string[]; files: number; bytes: number };
    expect(described).toMatchObject({ type: "cache", id: "save", files: 4 });
    expect(described.chunks).toHaveLength(2);
    expect(await scratchOf(first.tmp)).toHaveLength(2);
    expect(described.hash).toBe(sha256(encoder.encode(described.chunks.join("\n"))));
    expect(described.bytes).toBeGreaterThan(9437184);
    expect(described.bytes).toBeLessThan(9437184 + 4096);
    const chunks = new Map<string, Uint8Array>();
    for (const hash of described.chunks) {
      first.socket.send(encodeFrame({ type: "need", id: "save", hashes: [hash] }));
      const announced = (await first.next()) as { type: string; hash: string; size: number };
      expect(announced).toMatchObject({ type: "blob", hash });
      const bytes = (await first.next()) as Uint8Array;
      expect(bytes.byteLength).toBe(announced.size);
      expect(sha256(bytes)).toBe(hash);
      chunks.set(hash, bytes);
    }
    expect(chunks.get(described.chunks[0]!)!.byteLength).toBe(8 * 1024 * 1024);
    // The later name is a `link` entry to the earlier one, by path; its bytes are that path.
    const linkLine = `${JSON.stringify({ path: "lib/node_modules/tool/bin/blob.bin", kind: "link", mode: 0o644, size: "lib/node_modules/other/blob.bin".length })}\nlib/node_modules/other/blob.bin`;
    expect(new TextDecoder("latin1").decode(chunks.get(described.chunks[1]!)!)).toContain(linkLine);
    first.socket.send(encodeFrame({ type: "synced", id: "save", refused: [] }));
    first.socket.send(encodeFrame({ type: "ping", id: "after-save" }));
    expect(await first.next()).toEqual({ type: "pong", id: "after-save" });
    const binary = await readFile(join(first.cache, "lib/node_modules/tool/bin/blob.bin"));
    first.socket.close(1000, "the container is forgotten");
    expect(await exited(first.child)).toBe(0);

    // A fresh container: empty disks. `~` from the rows, and the cache put back before `checkout`, one chunk per `need`.
    const fresh = await container();
    const keptHome: ManifestEntry[] = [
      { path: ".config", kind: "directory", mode: 0o755, hash: null },
      { path: ".config/tool", kind: "directory", mode: 0o755, hash: null },
      { path: ".config/tool/state", kind: "file", mode: 0o644, hash: sha256(state) },
      ...homeManifest,
    ];
    const ref = { hash: described.hash, chunks: described.chunks };
    fresh.socket.send(encodeFrame({ type: "manifest", id: "in-2", entries: [], home: keptHome, cache: ref }));
    expect(await fresh.next()).toEqual({ type: "need", id: "in-2", hashes: [sha256(state), sha256(gitconfig)] });
    blob(fresh.socket, state);
    blob(fresh.socket, gitconfig);
    for (const hash of described.chunks) {
      expect(await fresh.next()).toEqual({ type: "need", id: "in-2", hashes: [hash] });
      blob(fresh.socket, chunks.get(hash)!);
    }
    expect(await fresh.next()).toEqual({ type: "checkout", id: "in-2" });
    expect(await readFile(join(fresh.home, ".config/tool/state"), "utf8")).toBe("who = walker\n");
    await expect(lstat(join(fresh.home, ".cache"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readlink(join(fresh.cache, "bin/tool"))).toBe("../lib/node_modules/tool/bin/tool.sh");
    expect((await lstat(join(fresh.cache, "lib/node_modules/tool/bin/tool.sh"))).mode & 0o7777).toBe(0o755);
    expect((await lstat(join(fresh.cache, "share/ro"))).mode & 0o7777).toBe(0o555);
    expect(await readFile(join(fresh.cache, "share/ro/inner/file"), "utf8")).toBe("data");
    expect(sha256(await readFile(join(fresh.cache, "lib/node_modules/tool/bin/blob.bin")))).toBe(sha256(binary));
    // One file with two names, as it was: the same inode, two links.
    const [one, two] = [await lstat(join(fresh.cache, "lib/node_modules/other/blob.bin")), await lstat(join(fresh.cache, "lib/node_modules/tool/bin/blob.bin"))];
    expect(one.ino).toBe(two.ino);
    expect(one.nlink).toBe(2);

    // Setup left `/cache` as the put-back wrote it: the description is the record that was put back, and the scratch stays empty.
    fresh.socket.send(encodeFrame({ type: "cache", id: "warm-save" }));
    expect(await fresh.next()).toEqual({ type: "cache", id: "warm-save", hash: described.hash, chunks: described.chunks, files: 4, bytes: described.bytes });
    expect(await scratchOf(fresh.tmp)).toEqual([]);
    fresh.socket.send(encodeFrame({ type: "synced", id: "warm-save", refused: [] }));

    // The tool runs from `PATH` in the fresh container, and `~` reads as it was left; nothing changed, so nothing comes back.
    fresh.socket.send(encodeFrame({ type: "run", id: "warm", command: "tool && cat ~/.config/tool/state", cwd: "/workspace", env: {} }));
    expect(await fresh.next()).toEqual({ type: "stdout", id: "warm", data: "tool 1.0\n" });
    const rest = await fresh.next();
    if ((rest as { type: string }).type === "stdout") {
      expect(rest).toEqual({ type: "stdout", id: "warm", data: "who = walker\n" });
      expect(await fresh.next()).toEqual({ type: "exit", id: "warm", code: 0 });
    } else expect(rest).toEqual({ type: "exit", id: "warm", code: 0 });
    expect(await fresh.next()).toEqual({ type: "changed", id: "warm", entries: [], deleted: [], home: { entries: [], deleted: [] } });
    fresh.socket.send(encodeFrame({ type: "need", id: "warm", hashes: [] }));
    fresh.socket.send(encodeFrame({ type: "synced", id: "warm", refused: [], home: [] }));

    // One file touched, its bytes the same: the walk no longer matches, so the record is written again, and it is the same record.
    fresh.socket.send(encodeFrame({ type: "run", id: "touch", command: 'touch "$NPM_CONFIG_PREFIX/share/ro/inner/file"', cwd: "/workspace", env: {} }));
    expect(await fresh.next()).toEqual({ type: "exit", id: "touch", code: 0 });
    expect(await fresh.next()).toEqual({ type: "changed", id: "touch", entries: [], deleted: [], home: { entries: [], deleted: [] } });
    fresh.socket.send(encodeFrame({ type: "need", id: "touch", hashes: [] }));
    fresh.socket.send(encodeFrame({ type: "synced", id: "touch", refused: [], home: [] }));
    fresh.socket.send(encodeFrame({ type: "cache", id: "touched" }));
    expect(await fresh.next()).toEqual({ type: "cache", id: "touched", hash: described.hash, chunks: described.chunks, files: 4, bytes: described.bytes });
    expect(await scratchOf(fresh.tmp)).toHaveLength(2);
    fresh.socket.send(encodeFrame({ type: "synced", id: "touched", refused: [] }));

    // A put-back whose chunk the cell no longer has: `/cache` emptied on a real disk, its `0555` directory and all, and the
    // sync-in ends whole, cold.
    fresh.socket.send(encodeFrame({ type: "manifest", id: "in-3", entries: [], home: keptHome, cache: ref }));
    expect(await fresh.next()).toEqual({ type: "need", id: "in-3", hashes: [] });
    expect(await fresh.next()).toEqual({ type: "need", id: "in-3", hashes: [described.chunks[0]] });
    fresh.socket.send(encodeFrame({ type: "error", code: "refused", of: "need", id: "in-3", message: "the chunk is gone" }));
    expect(await fresh.next()).toEqual({ type: "checkout", id: "in-3" });
    expect(await readdir(fresh.cache)).toEqual([]);

    fresh.socket.close(1000, "cell done");
    expect(await exited(fresh.child)).toBe(0);
    expect(stderr.join("")).toBe("");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // The first container's `/cache` still has its `0555` directory; the owner may write it again before it goes.
    for (const path of made) {
      spawnSync("chmod", ["-R", "u+w", path]);
      await rm(path, { recursive: true, force: true });
    }
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
