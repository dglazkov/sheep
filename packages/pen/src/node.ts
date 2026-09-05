/**
 * The agent as a process: what `node bin/pen-agent.mjs` runs in the
 * image. Reads the cell's URL and token from the environment, opens one
 * WebSocket to the cell, and serves the agent over a disk rooted at
 * `/workspace` (or `PEN_WORKSPACE`, for a test on a machine without one),
 * with a runner that spawns `bash -c` under the same root. Exits when the
 * socket closes, so a container that loses its cell is a container that
 * is gone.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { constants as osConstants } from "node:os";
import { dirname, join, posix, relative } from "node:path";
import { type AgentSocket, type Disk, type DiskEntry, type RunHandle, type RunOutcome, type Runner, type RunRequest, serveAgent } from "./agent.ts";
import { CELL_URL_ENV, TOKEN_ENV, TOKEN_PARAM } from "./protocol.ts";

export const WORKSPACE_ENV = "PEN_WORKSPACE";
export const DEFAULT_WORKSPACE = "/workspace";

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
      for (const dirent of await readdir(root, { recursive: true, withFileTypes: true })) {
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
 * without one) the same relative place under the root is used.
 */
export function nodeRunner(root: string): Runner {
  return {
    run(request: RunRequest, output): RunHandle {
      const cwd = request.cwd === DEFAULT_WORKSPACE || request.cwd.startsWith(`${DEFAULT_WORKSPACE}/`)
        ? join(root, request.cwd.slice(DEFAULT_WORKSPACE.length))
        : request.cwd;
      const child = spawn("bash", ["-c", request.command], {
        cwd,
        env: { ...process.env, ...request.env },
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
  const socket = new NodeWebSocket(cellAddress(cellUrl, token));
  socket.binaryType = "arraybuffer";
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`pen-agent: could not connect to ${cellUrl}`)), { once: true });
  });
  const root = env[WORKSPACE_ENV] || DEFAULT_WORKSPACE;
  const served = serveAgent(socket, nodeDisk(root), nodeRunner(root));
  try {
    await opened;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  await served.closed;
  return 0;
}
