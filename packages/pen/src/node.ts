/**
 * The agent as a process: what `node bin/pen-agent.mjs` runs in the
 * image. Reads the cell's URL and token from the environment, opens one
 * WebSocket to the cell, and serves the agent over a disk rooted at
 * `/workspace` (or `PEN_WORKSPACE`, for a test on a machine without one),
 * with a runner that spawns `bash -c` under the same root. Listens on a
 * Unix socket for the git credential helper (`bin/git-credential-pen.mjs`),
 * a process git spawns inside a run, and carries each request through
 * `askCredential`: one JSON line in, one out, nothing kept. Serve phase 0
 * adds the fetcher: the browser's requests during a look, arriving as
 * `fetch` frames, asked of a server on the container's own loopback. Exits when the
 * WebSocket closes, so a container that loses its cell is a container that
 * is gone.
 *
 * Fold phase 2 gives the process the two disks fold's agent takes: a
 * sheep's `~` at `/home/sheep` (or `PEN_HOME`), synced both ways beside the
 * checkout, and the pasture's cache at `/cache` (or `PEN_CACHE`), put back
 * and described as a record, with the description's chunks on a scratch
 * directory of the process's own under the system's temporary directory,
 * removed when the process ends. `HOME`, npm's prefix, and `PATH` are the
 * image's (`Dockerfile`); a test that moves the disks sets those to match.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { chmod, link, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { constants as osConstants, tmpdir } from "node:os";
import { dirname, join, posix, relative } from "node:path";
import WebSocket from "ws";
import { type Disk, type DiskEntry, type Fetcher, type RunHandle, type RunOutcome, type Runner, type RunRequest, serveAgent, type ServedAgent } from "./agent.ts";
import { CACHE_ROOT, CELL_URL_ENV, DEFAULT_HELPER_SOCKET, HELPER_SOCKET_ENV, type HelperAnswer, type HelperRequest, TOKEN_ENV, TOKEN_PARAM } from "./protocol.ts";

export const WORKSPACE_ENV = "PEN_WORKSPACE";
export const DEFAULT_WORKSPACE = "/workspace";
/** Pasture phase 3: where the pasture's tree is written, read-only, beside the checkout (or `PEN_PASTURE`, for a test on a machine without one). */
export const PASTURE_ENV = "PEN_PASTURE";
export const DEFAULT_PASTURE = "/pasture";
/** Fold phase 2: a sheep's `~`, `HOME` in the image, synced both ways (or `PEN_HOME`, for a test on a machine without one). */
export const HOME_ENV = "PEN_HOME";
export const DEFAULT_HOME = "/home/sheep";
/** Fold phase 2: the pasture's cache, npm's global prefix in the image (or `PEN_CACHE`, for a test on a machine without one). */
export const CACHE_ENV = "PEN_CACHE";
export const DEFAULT_CACHE = CACHE_ROOT;
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
 * The socket to the cell (fold phase 2): `ws`, pinned exactly in
 * `package.json`, with `permessage-deflate` never offered. Node's built-in
 * WebSocket offers it and cannot be told not to, and workerd accepts it and
 * deflates every message it sends, an 8 MiB chunk of the pasture's cache
 * included: 6.7 s of a warm put-back's 8.6 s on the laptop, CPU spent in
 * the cell (fold phase 2's walk). Binary messages arrive as `ArrayBuffer`s;
 * the shape the agent uses is `AgentSocket`'s.
 */
export function dialCell(address: string): WebSocket {
  const socket = new WebSocket(address, { perMessageDeflate: false });
  socket.binaryType = "arraybuffer";
  return socket;
}

/**
 * A disk over `node:fs` rooted at `root`. Modes are set explicitly so the
 * umask never has a say. Fold phase 2: `list` says each entry's size and
 * mtime, and, for a file with more than one name, its device and inode as
 * the identity its names share; `link` makes a hard link.
 */
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
    async link(existing, path) {
      await mkdir(dirname(at(path)), { recursive: true });
      await rm(at(path), { recursive: true, force: true });
      await link(at(existing), at(path));
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
        const stat = await lstat(absolute);
        entries.push({
          path,
          kind,
          mode: stat.mode & 0o7777,
          size: stat.size,
          mtime: stat.mtimeMs,
          ...(kind === "file" && stat.nlink > 1 ? { file: `${stat.dev}:${stat.ino}` } : {}),
        });
      }
      return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },
    async remove(path) {
      try {
        await rm(at(path), { recursive: true, force: true });
      } catch (error) {
        // A read-only directory (a record may put back a `0555` one) refuses the removal of what is in it to anyone but
        // root; the agent is root in the image, but a disk is a disk wherever it runs, so the subtree is made writable first.
        const code = (error as { code?: string }).code;
        if (code !== "EACCES" && code !== "EPERM") throw error;
        await writable(at(path));
        await rm(at(path), { recursive: true, force: true });
      }
    },
    async digest(bytes) {
      return createHash("sha256").update(bytes).digest("hex");
    },
  };
}

/** Every directory under `absolute`, itself included, made writable by its owner, so the subtree can be removed. */
async function writable(absolute: string): Promise<void> {
  const stat = await lstat(absolute).catch(() => undefined);
  if (stat === undefined || !stat.isDirectory()) return;
  await chmod(absolute, (stat.mode & 0o7777) | 0o700);
  for (const name of await readdir(absolute)) await writable(join(absolute, name));
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

/** Headers the browser's request carries that belong to the browser's own hop, and never to the agent's. */
const HOP_BY_HOP = new Set(["host", "connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "content-length"]);

/** What the agent puts in front of a `fetch` frame's `url`: the server is the container's own, on the loopback. */
export const LOOPBACK = "127.0.0.1";
/** The other loopback, in the form a URL and a `host` header take it. A server told to listen on `localhost` in this image binds here. */
export const LOOPBACK6 = "[::1]";
/**
 * The two loopbacks, in the order they are tried. Which one the server is
 * on is not the cell's to assume and not the agent's either: a server told
 * to listen on `localhost` inside the image binds `::1` and refuses
 * `127.0.0.1` — which is Vite's default, and so the first line a sheep is
 * asked to type. `127.0.0.1` is first because it is the commoner bind and
 * the one a served port answers on when the sheep passed `--host`.
 */
export const LOOPBACKS: readonly string[] = [LOOPBACK, LOOPBACK6];

/**
 * The fetcher the image uses: Node's own `fetch` at the container's own
 * loopback, with three things changed about the browser's request.
 *
 * `host` becomes the address actually dialled and the port, so a server
 * that checks its host — as Vite has since 6.0.9 — answers instead of
 * refusing the browser's `sheep.invalid`. Redirects are not followed, so
 * the browser sees the `302` and follows it itself, which is what keeps
 * the page's own URL and its relative links right. And `accept-encoding`
 * is pinned to `identity` rather than merely dropped: Node's fetch puts
 * `gzip, deflate` back when nothing says otherwise, and then decompresses
 * the body while leaving `content-encoding: gzip` on it, so a body
 * forwarded as it came would say gzip and not be. Asking for `identity`
 * is how the design's "bodies arrive as bytes the browser can take as
 * they are" holds in this runtime.
 *
 * The address is tried rather than assumed: `127.0.0.1` first, `[::1]`
 * second, and only a port that answers on neither is a port that is not
 * listening — which is the rejection the agent turns into status `0` and
 * the cell reads as "not yet". Whichever answered is remembered for that
 * port, so a page's fifty requests do not each pay a refused connect on
 * the wrong stack. The memory is a hint and never a verdict: a remembered
 * address that refuses puts the other one back in the order, and a port
 * that answers on neither forgets what it knew — a server can restart
 * between looks on the same container, and a stale memory that hardened
 * into a permanent failure would be worse than the bug it was fixing.
 */
export function nodeFetcher(): Fetcher {
  /** Per port, the loopback that last answered on it. */
  const answered = new Map<number, string>();
  return {
    async fetch(request) {
      const remembered = answered.get(request.port);
      const order = remembered === undefined ? LOOPBACKS : [remembered, ...LOOPBACKS.filter((one) => one !== remembered)];
      let refused: unknown;
      for (const loopback of order) {
        const address = `${loopback}:${request.port}`;
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
        }
        headers.set("host", address);
        headers.set("accept-encoding", "identity");
        let answer: Response;
        try {
          answer = await globalThis.fetch(`http://${address}${request.url}`, {
            method: request.method,
            headers,
            ...(request.body === undefined ? {} : { body: request.body as Uint8Array<ArrayBuffer> }),
            redirect: "manual",
          });
        } catch (error) {
          refused = error;
          continue;
        }
        answered.set(request.port, loopback);
        const said: Record<string, string> = {};
        answer.headers.forEach((value, name) => {
          said[name] = value;
        });
        return { status: answer.status, headers: said, body: new Uint8Array(await answer.arrayBuffer()) };
      }
      // Neither stack answered: the port is not listening, and what it knew about the port was wrong.
      answered.delete(request.port);
      throw refused;
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
  const root = env[WORKSPACE_ENV] || DEFAULT_WORKSPACE;
  const pastureRoot = env[PASTURE_ENV] || DEFAULT_PASTURE;
  const homeRoot = env[HOME_ENV] || DEFAULT_HOME;
  const cacheRoot = env[CACHE_ENV] || DEFAULT_CACHE;
  const helperSocket = env[HELPER_SOCKET_ENV] || DEFAULT_HELPER_SOCKET;
  // Fold phase 2: where a description of `/cache` waits for the cell's `need`s, the process's own and never a root the sync walks.
  // Made before the socket is dialled: nothing may be awaited between the dial and `serveAgent`, or a manifest the cell sends
  // the moment the socket opens arrives before anything listens for it, and the sync-in never starts.
  const scratchRoot = await mkdtemp(join(tmpdir(), "pen-cache-"));
  const socket = dialCell(cellAddress(cellUrl, token));
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`pen-agent: could not connect to ${cellUrl}`)), { once: true });
  });
  // The second root (pasture phase 3): a disk of its own beside the checkout, so the sync-out's walk cannot reach it.
  // The third and fourth (fold phase 2): `~`, synced both ways, and `/cache`, put back and described whole, each its own disk.
  const served = serveAgent(socket, nodeDisk(root), nodeRunner(root, { [HELPER_SOCKET_ENV]: helperSocket }), nodeFetcher(), {
    pasture: nodeDisk(pastureRoot),
    home: nodeDisk(homeRoot),
    cache: nodeDisk(cacheRoot),
    scratch: nodeDisk(scratchRoot),
  });
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
          socket.close(1000, signal);
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
    await rm(scratchRoot, { recursive: true, force: true });
    return 1;
  }
  await Promise.race([served.closed, stopped]);
  await closeHelper?.();
  await rm(scratchRoot, { recursive: true, force: true });
  return 0;
}
