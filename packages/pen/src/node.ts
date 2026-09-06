/**
 * The agent as a process: what `node bin/pen-agent.mjs` runs in the
 * image. Reads the cell's URL and token from the environment, opens one
 * WebSocket to the cell, and serves the agent over a disk rooted at
 * `/workspace` (or `PEN_WORKSPACE`, for a test on a machine without one),
 * with a runner that spawns `bash -c` under the same root. Listens on a
 * Unix socket for the git credential helper (`bin/git-credential-pen.mjs`),
 * a process git spawns inside a run, and carries each request through
 * `askCredential`: one JSON line in, one out, nothing kept. Exits when the
 * WebSocket closes, so a container that loses its cell is a container that
 * is gone.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { chmod, lstat, mkdir, readdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { constants as osConstants } from "node:os";
import { dirname, join, posix, relative } from "node:path";
import { type AgentSocket, type Disk, type DiskEntry, type RunHandle, type RunOutcome, type Runner, type RunRequest, serveAgent, type ServedAgent } from "./agent.ts";
import { CELL_URL_ENV, DEFAULT_HELPER_SOCKET, HELPER_SOCKET_ENV, type HelperAnswer, type HelperRequest, TOKEN_ENV, TOKEN_PARAM } from "./protocol.ts";

export const WORKSPACE_ENV = "PEN_WORKSPACE";
export const DEFAULT_WORKSPACE = "/workspace";
/** Pasture phase 3: where the pasture's tree is written, read-only, beside the checkout (or `PEN_PASTURE`, for a test on a machine without one). */
export const PASTURE_ENV = "PEN_PASTURE";
export const DEFAULT_PASTURE = "/pasture";
/**
 * The one port the image exposes: a health answer, `ok`, for the platform
 * that started the container to see it is up. Cloudflare's local dev
 * refuses an image with no exposed port, and the Container class waits
 * for one to listen before it calls the container started. Nothing else
 * ever connects to it: the container is a client of the cell.
 */
export const HEALTH_PORT_ENV = "PEN_HEALTH_PORT";
export const DEFAULT_HEALTH_PORT = 8080;

/**
 * Node 24's global `WebSocket`, in the shape this process uses. `@types/node`
 * 22 does not declare the global (the repo pins 22 so one `@types/node`
 * serves every package), so the constructor is read off `globalThis`.
 */
interface NodeWebSocket extends AgentSocket {
  binaryType: "blob" | "arraybuffer";
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: unknown) => void): void;
  addEventListener(type: "open" | "error", listener: (event: unknown) => void, options?: { once?: boolean }): void;
}
const NodeWebSocket = (globalThis as unknown as { WebSocket: new (url: string) => NodeWebSocket }).WebSocket;

/** A disk over `node:fs` rooted at `root`. Modes are set explicitly so the umask never has a say. */
export function nodeDisk(root: string): Disk {
  const at = (path: string) => join(root, path);
  return {
    async read(path) {
      return new Uint8Array(await readFile(at(path)));
    },
    async write(path, bytes, options) {
      await mkdir(dirname(at(path)), { recursive: true });
      // Replace, never write through: a read-only file (git's objects are 0444) or a symlink at the path would refuse or redirect the bytes.
      await rm(at(path), { force: true });
      await writeFile(at(path), bytes);
      if (options?.mode !== undefined) await chmod(at(path), options.mode);
    },
    async mkdir(path, mode) {
      await mkdir(at(path), { recursive: true });
      await chmod(at(path), mode);
    },
    async symlink(target, path) {
      await mkdir(dirname(at(path)), { recursive: true });
      await rm(at(path), { recursive: true, force: true });
      await symlink(target, at(path));
    },
    async readlink(path) {
      return readlink(at(path));
    },
    async chmod(path, mode) {
      await chmod(at(path), mode);
    },
    async list() {
      const entries: DiskEntry[] = [];
      let listed: Dirent[];
      try {
        listed = await readdir(root, { recursive: true, withFileTypes: true });
      } catch (error) {
        // A root not yet made (the pasture's, before its first manifest) is an empty tree, not a failed sync.
        if ((error as { code?: string }).code === "ENOENT") return entries;
        throw error;
      }
      for (const dirent of listed) {
        const absolute = join(dirent.parentPath, dirent.name);
        const path = relative(root, absolute).split("\\").join(posix.sep);
        const kind = dirent.isSymbolicLink() ? "symlink" : dirent.isDirectory() ? "directory" : "file";
        const { mode } = await lstat(absolute);
        entries.push({ path, kind, mode: mode & 0o7777 });
      }
      return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },
    async remove(path) {
      await rm(at(path), { recursive: true, force: true });
    },
    async digest(bytes) {
      return createHash("sha256").update(bytes).digest("hex");
    },
  };
}

/**
 * A runner over `child_process`: `bash -c command` in its own process
 * group under the checkout root, both streams decoded and forwarded as
 * they arrive, `SIGKILL` to the whole group on kill, and a timer of the
 * runner's own as the backstop for the cell's. The request's `cwd` is
 * under `/workspace`; when the root is elsewhere (a test on a machine
 * without one) the same relative place under the root is used. `env` is
 * the process's own with `extra` laid over it and the request's over that,
 * so the helper socket's path reaches git wherever the agent put it.
 */
export function nodeRunner(root: string, extra: Record<string, string> = {}): Runner {
  return {
    run(request: RunRequest, output): RunHandle {
      const cwd = request.cwd === DEFAULT_WORKSPACE || request.cwd.startsWith(`${DEFAULT_WORKSPACE}/`)
        ? join(root, request.cwd.slice(DEFAULT_WORKSPACE.length))
        : request.cwd;
      const child = spawn("bash", ["-c", request.command], {
        cwd,
        env: { ...process.env, ...extra, ...request.env },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
      child.stdout.on("data", (chunk: Uint8Array) => output.stdout(decoders.stdout.decode(chunk, { stream: true })));
      child.stderr.on("data", (chunk: Uint8Array) => output.stderr(decoders.stderr.decode(chunk, { stream: true })));

      let killedFor: string | null = null;
      let ended = false;
      const kill = (reason: string) => {
        if (ended || killedFor !== null) return;
        killedFor = reason;
        try {
          if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      };
      const backstop = request.timeout === undefined ? undefined : setTimeout(() => kill("timeout"), request.timeout * 1000);

      const outcome = new Promise<RunOutcome>((resolve, reject) => {
        child.once("error", (error) => {
          ended = true;
          if (backstop !== undefined) clearTimeout(backstop);
          reject(error);
        });
        child.once("close", (code, signal) => {
          ended = true;
          if (backstop !== undefined) clearTimeout(backstop);
          const tail = { stdout: decoders.stdout.decode(), stderr: decoders.stderr.decode() };
          if (tail.stdout !== "") output.stdout(tail.stdout);
          if (tail.stderr !== "") output.stderr(tail.stderr);
          if (killedFor !== null) resolve({ killed: killedFor });
          else if (code !== null) resolve({ exit: code });
          else resolve({ exit: 128 + (signal === null ? 0 : (osConstants.signals[signal] ?? 0)) });
        });
      });
      return { outcome, kill };
    },
  };
}

/**
 * The helper's door: a Unix socket the agent listens on. Each connection is
 * one request, a JSON line, answered with one JSON line and closed. The
 * answer is written to the helper's socket and to nothing else; a request
 * the cell refuses, or one that is not git's, gets `{}`.
 */
export async function serveHelper(path: string, agent: Pick<ServedAgent, "askCredential">): Promise<() => Promise<void>> {
  const server = createSocketServer((connection) => {
    let buffered = "";
    let answered = false;
    const answer = (reply: HelperAnswer) => {
      if (answered) return;
      answered = true;
      connection.end(`${JSON.stringify(reply)}\n`);
    };
    connection.setEncoding("utf8");
    connection.on("error", () => {
      // The helper went away; nothing to answer.
    });
    connection.on("data", (chunk: string) => {
      if (answered) return;
      buffered += chunk;
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      let request: HelperRequest;
      try {
        request = JSON.parse(buffered.slice(0, newline)) as HelperRequest;
      } catch {
        answer({});
        return;
      }
      if (request.kind !== "git" || typeof request.host !== "string" || typeof request.protocol !== "string") {
        answer({});
        return;
      }
      const scope = `${request.protocol}://${request.host}${request.path ? `/${request.path}` : ""}`;
      void agent.askCredential({ kind: "git", scope }).then(
        (minted) => answer(minted === undefined ? {} : { ...(minted.username === undefined ? {} : { username: minted.username }), value: minted.value }),
        () => answer({}),
      );
    });
  });
  // A path left by an earlier process would refuse the listen; nothing is listening there now.
  await rm(path, { force: true });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
  // The helper's door does not keep the process alive: the WebSocket closing is the end.
  server.unref();
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(path, { force: true });
  };
}

/** The socket address: the cell's URL with the token as a query parameter. */
export function cellAddress(cellUrl: string, token: string): string {
  const url = new URL(cellUrl);
  url.searchParams.set(TOKEN_PARAM, token);
  return url.toString();
}

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const cellUrl = env[CELL_URL_ENV];
  const token = env[TOKEN_ENV];
  if (!cellUrl || !token) {
    process.stderr.write(`pen-agent: ${CELL_URL_ENV} and ${TOKEN_ENV} must be set\n`);
    return 2;
  }
  // The health port, unref'd so the process still ends with its socket; `0` turns it off.
  const healthPort = env[HEALTH_PORT_ENV] === undefined || env[HEALTH_PORT_ENV] === "" ? DEFAULT_HEALTH_PORT : Number(env[HEALTH_PORT_ENV]);
  if (healthPort > 0) {
    const health = createServer((_request, response) => response.end("ok\n"));
    health.on("error", (error) => process.stderr.write(`pen-agent: health port ${healthPort} not listening: ${error.message}\n`));
    health.listen(healthPort);
    health.unref();
  }
  const socket = new NodeWebSocket(cellAddress(cellUrl, token));
  socket.binaryType = "arraybuffer";
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`pen-agent: could not connect to ${cellUrl}`)), { once: true });
  });
  const root = env[WORKSPACE_ENV] || DEFAULT_WORKSPACE;
  const pastureRoot = env[PASTURE_ENV] || DEFAULT_PASTURE;
  const helperSocket = env[HELPER_SOCKET_ENV] || DEFAULT_HELPER_SOCKET;
  // The second root (pasture phase 3): a disk of its own beside the checkout, so the sync-out's walk cannot reach it.
  const served = serveAgent(socket, nodeDisk(root), nodeRunner(root, { [HELPER_SOCKET_ENV]: helperSocket }), { pasture: nodeDisk(pastureRoot) });
  let closeHelper: (() => Promise<void>) | undefined;
  try {
    closeHelper = await serveHelper(helperSocket, served);
  } catch (error) {
    process.stderr.write(`pen-agent: helper socket ${helperSocket} not listening: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  // The process is PID 1 in the image, which ignores SIGTERM unless it listens; the platform's idle
  // stop is a SIGTERM. Close the socket (1000: a client may send only that or 3000-4999) so the cell
  // sees the close, and exit within a second whatever the socket does, since PID 1 leaving ends
  // the container and everything running in it.
  const stopped = new Promise<void>((resolve) => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.on(signal, () => {
        process.stderr.write(`pen-agent: ${signal}, exiting\n`);
        try {
          (socket as unknown as { close(code?: number, reason?: string): void }).close(1000, signal);
        } catch {
          // Not open; nothing to close.
        }
        setTimeout(() => process.exit(0), 1_000).unref();
        resolve();
      });
    }
  });
  try {
    await opened;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  await Promise.race([served.closed, stopped]);
  await closeHelper?.();
  return 0;
}
