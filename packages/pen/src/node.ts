/**
 * The agent as a process: what `node bin/pen-agent.mjs` runs in the
 * image. Reads the cell's URL and token from the environment, opens one
 * WebSocket to the cell, and serves the agent over a disk rooted at
 * `/workspace` (or `PEN_WORKSPACE`, for a test on a machine without one).
 * Exits when the socket closes, so a container that loses its cell is a
 * container that is gone.
 */
import { mkdir, readdir, readFile, rm, writeFile, chmod, lstat } from "node:fs/promises";
import { dirname, join, posix, relative } from "node:path";
import { type AgentSocket, type Disk, type DiskEntry, serveAgent } from "./agent.ts";
import { CELL_URL_ENV, TOKEN_ENV, TOKEN_PARAM } from "./protocol.ts";

export const WORKSPACE_ENV = "PEN_WORKSPACE";
export const DEFAULT_WORKSPACE = "/workspace";

/**
 * Node 24's global `WebSocket`, in the shape this process uses. `@types/node`
 * 22 does not declare the global (the repo pins 22 so one `@types/node`
 * serves every package), so the constructor is read off `globalThis`.
 */
interface NodeWebSocket extends AgentSocket {
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: unknown) => void): void;
  addEventListener(type: "open" | "error", listener: (event: unknown) => void, options?: { once?: boolean }): void;
}
const NodeWebSocket = (globalThis as unknown as { WebSocket: new (url: string) => NodeWebSocket }).WebSocket;

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
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`pen-agent: could not connect to ${cellUrl}`)), { once: true });
  });
  const served = serveAgent(socket, nodeDisk(env[WORKSPACE_ENV] || DEFAULT_WORKSPACE));
  try {
    await opened;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  await served.closed;
  return 0;
}
