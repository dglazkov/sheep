/**
 * Pasture phase 3 in Node: real git through the real `pen-agent` process,
 * with this test as the cell and `git-server.ts` as the repository, pen
 * phase 4's pattern. The manifest carries the second root: `/pasture`
 * (`PEN_PASTURE` here, a directory the test owns) is written with files
 * `0444` and directories `0555`, before any command. Then the birth: `git
 * clone --branch main <repo> .` in `/workspace`, whose sync-out brings the
 * clone into the rows, `.git` and the seeded files alike. A run that
 * writes under the pasture, allowed or not, is a sync-out that reports
 * nothing of it; a second sync-in leaves the tree whole; a manifest that
 * drops one file and adds another lands exactly that.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type WebSocket, WebSocketServer } from "ws";
import {
  CELL_URL_ENV,
  type CellFrame,
  type ContainerFrame,
  decodeFrame,
  encodeFrame,
  type Frame,
  HELPER_SOCKET_ENV,
  type ManifestEntry,
  PASTURE_DIR_MODE,
  PASTURE_FILE_MODE,
  TOKEN_ENV,
} from "../src/protocol.ts";
import { PASTURE_ENV } from "../src/node.ts";
import { type GitServer, SEEDED, startGitServer } from "./git-server.ts";

const entry = new URL("../bin/pen-agent.mjs", import.meta.url).pathname;
const helper = new URL("../bin/git-credential-pen.mjs", import.meta.url).pathname;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

interface Row {
  kind: ManifestEntry["kind"];
  mode: number;
  hash: string | null;
  bytes: Uint8Array;
}

/** A tree as this test keeps one: rows by path, the workspace's or the pasture's. */
function tree(files: Record<string, string>, fileMode = 0o644, dirMode = 0o755): Map<string, Row> {
  const rows = new Map<string, Row>();
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join("/");
      if (!rows.has(dir)) rows.set(dir, { kind: "directory", mode: dirMode, hash: null, bytes: new Uint8Array() });
    }
    const bytes = encoder.encode(content);
    rows.set(path, { kind: "file", mode: fileMode, hash: sha256(bytes), bytes });
  }
  return rows;
}

function manifestOf(rows: Map<string, Row>): ManifestEntry[] {
  return [...rows]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, row]) => ({ path, kind: row.kind, mode: row.mode, hash: row.hash }));
}

/**
 * The cell, as this test plays it: the workspace's rows, the pasture's
 * rows, one socket, and the two dances, the sync-in with both roots.
 */
class Cell {
  readonly rows = new Map<string, Row>();
  readonly transcript: Array<{ from: "cell" | "container"; frame: Frame } | { from: "cell" | "container"; bytes: Uint8Array }> = [];
  private socket!: WebSocket;
  private queue: Array<Frame | Uint8Array> = [];
  private waiting: Array<{ resolve: (message: Frame | Uint8Array) => void; reject: (error: Error) => void }> = [];
  private syncs = 0;
  private closed: Error | undefined;

  attach(socket: WebSocket): void {
    this.socket = socket;
    socket.on("message", (data: Buffer, isBinary: boolean) => {
      const message = isBinary ? new Uint8Array(data) : decodeFrame(data.toString());
      this.transcript.push(isBinary ? { from: "container", bytes: message as Uint8Array } : { from: "container", frame: message as Frame });
      const next = this.waiting.shift();
      if (next) next.resolve(message);
      else this.queue.push(message);
    });
    socket.on("close", (code: number, reason: Buffer) => {
      this.closed = new Error(`the container's socket closed (${code}: ${reason.toString()})`);
      for (const pending of this.waiting) pending.reject(this.closed);
      this.waiting = [];
    });
  }

  private next(): Promise<Frame | Uint8Array> {
    return new Promise((resolve, reject) => {
      const queued = this.queue.shift();
      if (queued !== undefined) resolve(queued);
      else if (this.closed !== undefined) reject(this.closed);
      else this.waiting.push({ resolve, reject });
    });
  }

  private async nextFrame(): Promise<ContainerFrame> {
    const message = await this.next();
    if (message instanceof Uint8Array) throw new Error("bytes where a frame was expected");
    return message as ContainerFrame;
  }

  private async nextBytes(): Promise<Uint8Array> {
    const message = await this.next();
    if (!(message instanceof Uint8Array)) throw new Error(`a ${(message as Frame).type} frame where bytes were expected`);
    return message;
  }

  send(frame: CellFrame): void {
    this.transcript.push({ from: "cell", frame });
    this.socket.send(encodeFrame(frame));
  }

  text(path: string): string {
    const row = this.rows.get(path);
    if (row === undefined) throw new Error(`no row ${path}`);
    return decoder.decode(row.bytes);
  }

  /** The manifest down with the second root, the blobs of either root the agent lacks, and `checkout`. Returns the hashes asked for. */
  async syncIn(pasture: Map<string, Row>): Promise<string[]> {
    const id = `in-${++this.syncs}`;
    this.send({ type: "manifest", id, entries: manifestOf(this.rows), pasture: manifestOf(pasture) });
    const need = await this.nextFrame();
    if (need.type !== "need" || need.id !== id) throw new Error(`expected need ${id}, got ${need.type}`);
    const byHash = new Map<string, Row>();
    for (const row of [...this.rows.values(), ...pasture.values()]) if (row.hash !== null) byHash.set(row.hash, row);
    for (const hash of need.hashes) {
      const row = byHash.get(hash);
      if (row === undefined) throw new Error(`the agent asked for ${hash}, which no row of either root has`);
      this.send({ type: "blob", hash, size: row.bytes.byteLength });
      this.transcript.push({ from: "cell", bytes: row.bytes });
      this.socket.send(row.bytes);
    }
    const checkout = await this.nextFrame();
    if (checkout.type !== "checkout" || checkout.id !== id) throw new Error(`expected checkout ${id}, got ${checkout.type}`);
    return need.hashes;
  }

  /** `changed` under `id`, `need` for every hash, the blobs into the rows, `synced`. Returns what the container reported. */
  private async syncOut(id: string): Promise<{ entries: string[]; deleted: string[] }> {
    const changed = await this.nextFrame();
    if (changed.type !== "changed" || changed.id !== id) throw new Error(`expected changed ${id}, got ${changed.type}`);
    const hashes = [...new Set(changed.entries.flatMap((entry) => (entry.hash === null ? [] : [entry.hash])))];
    this.send({ type: "need", id, hashes });
    const blobs = new Map<string, Uint8Array>();
    for (const hash of hashes) {
      const blob = await this.nextFrame();
      if (blob.type !== "blob" || blob.hash !== hash) throw new Error(`expected blob ${hash}, got ${blob.type}`);
      const bytes = await this.nextBytes();
      if (sha256(bytes) !== hash || bytes.byteLength !== blob.size) throw new Error(`blob ${hash} is not its hash`);
      blobs.set(hash, bytes);
    }
    for (const path of changed.deleted) {
      this.rows.delete(path);
      for (const key of [...this.rows.keys()]) if (key.startsWith(`${path}/`)) this.rows.delete(key);
    }
    for (const entry of changed.entries) {
      this.rows.set(entry.path, { kind: entry.kind, mode: entry.mode, hash: entry.hash, bytes: entry.hash === null ? new Uint8Array() : blobs.get(entry.hash)! });
    }
    this.send({ type: "synced", id, refused: [] });
    return { entries: changed.entries.map((entry) => entry.path), deleted: changed.deleted };
  }

  /** One `run`, its output, its end, and the sync-out that follows. A credential frame is refused: nothing here pushes. */
  async run(command: string, cwd = "/workspace"): Promise<{ stdout: string; stderr: string; end: { exit: number } | { killed: string }; changed: { entries: string[]; deleted: string[] } }> {
    const id = `run-${++this.syncs}`;
    this.send({ type: "run", id, command, cwd, env: {} });
    const result = { stdout: "", stderr: "", end: { exit: -1 } as { exit: number } | { killed: string } };
    for (;;) {
      const frame = await this.nextFrame();
      if (frame.type === "stdout" && frame.id === id) result.stdout += frame.data;
      else if (frame.type === "stderr" && frame.id === id) result.stderr += frame.data;
      else if (frame.type === "exit" && frame.id === id) {
        result.end = { exit: frame.code };
        break;
      } else if (frame.type === "killed" && frame.id === id) {
        result.end = { killed: frame.reason };
        break;
      } else if (frame.type === "credential") {
        this.send({ type: "error", code: "refused", of: "credential", id: frame.id, message: "the test has nothing for this scope" });
      } else throw new Error(`unexpected ${frame.type} during ${id}: ${JSON.stringify(frame)}`);
    }
    const changed = await this.syncOut(id);
    return { ...result, changed };
  }
}

interface Container {
  cell: Cell;
  child: ChildProcess;
  workspace: string;
  pasture: string;
  stderr: string[];
  close(): Promise<number | null>;
}

/** The rig: a socket server, an agent process on a fresh workspace and a fresh pasture root, and the cell attached. */
async function startContainer(cell: Cell, root: string, name: string): Promise<Container> {
  const server = new WebSocketServer({ port: 0 });
  const connection = new Promise<WebSocket>((resolve) => server.once("connection", (socket) => resolve(socket)));
  const port = (server.address() as { port: number }).port;
  const workspace = join(root, `${name}-workspace`);
  // The pasture root is not made here: the agent makes it at the first manifest, as the image has `/pasture` made or not.
  const pasture = join(root, `${name}-pasture`);
  const home = join(root, `${name}-home`);
  await Promise.all([mkdir(workspace, { recursive: true }), mkdir(home, { recursive: true })]);
  const gitconfig = join(root, `${name}-gitconfig`);
  await writeFile(gitconfig, `[credential]\n\thelper =\n\thelper = ${helper}\n`);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ["GIT_EDITOR", "EDITOR", "VISUAL", "GIT_SEQUENCE_EDITOR", "TERM", "GIT_ASKPASS", "SSH_ASKPASS"]) delete env[name];
  Object.assign(env, {
    [CELL_URL_ENV]: `ws://127.0.0.1:${port}/pen`,
    [TOKEN_ENV]: `minted-for-${name}`,
    PEN_WORKSPACE: workspace,
    [PASTURE_ENV]: pasture,
    [HELPER_SOCKET_ENV]: join(root, `${name}.sock`),
    PEN_HEALTH_PORT: "0",
    HOME: home,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Pen Home",
    GIT_AUTHOR_EMAIL: "pen@example.invalid",
    GIT_COMMITTER_NAME: "Pen Home",
    GIT_COMMITTER_EMAIL: "pen@example.invalid",
  });
  const stderr: string[] = [];
  const child = spawn(process.execPath, [entry], { env, stdio: ["ignore", "ignore", "pipe"] });
  child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  cell.attach(await connection);
  return {
    cell,
    child,
    workspace,
    pasture,
    stderr,
    async close() {
      for (const client of server.clients) client.close(1000, "cell done");
      const code = await exited(child);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      return code;
    },
  };
}

async function modeOf(path: string): Promise<number> {
  return (await lstat(path)).mode & 0o777;
}

describe("pasture phase 3: the birth and the second root, real git through the real pen-agent", () => {
  let fixture: GitServer;
  let root: string;

  beforeAll(async () => {
    fixture = await startGitServer();
    root = await mkdtemp(join(tmpdir(), "pasture-birth-"));
  });

  afterAll(async () => {
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  });

  it("writes /pasture read-only from the manifest's second root, clones at birth into rows with .git, reports nothing a run wrote under /pasture, and keeps the tree whole across sync-ins", { timeout: 90_000 }, async () => {
    const cell = new Cell();
    const container = await startContainer(cell, root, "born");
    const brief = "# Brief\n\nName your branch in /pasture/notes/<name>.md before you push.\n";
    let pasture = tree({ "BRIEF.md": brief, "notes/typo.md": "branch: fix-typo\n" }, PASTURE_FILE_MODE, PASTURE_DIR_MODE);

    // The first sync-in: an empty workspace and the pasture's tree. The agent asks for the pasture's two blobs and writes them read-only.
    const asked = await cell.syncIn(pasture);
    expect(asked.sort()).toEqual([pasture.get("BRIEF.md")!.hash, pasture.get("notes/typo.md")!.hash].sort());
    expect(await readFile(join(container.pasture, "BRIEF.md"), "utf8")).toBe(brief);
    expect(await readFile(join(container.pasture, "notes/typo.md"), "utf8")).toBe("branch: fix-typo\n");
    expect(await modeOf(join(container.pasture, "BRIEF.md"))).toBe(PASTURE_FILE_MODE);
    expect(await modeOf(join(container.pasture, "notes/typo.md"))).toBe(PASTURE_FILE_MODE);
    expect(await modeOf(join(container.pasture, "notes"))).toBe(PASTURE_DIR_MODE);
    expect(await modeOf(container.pasture)).toBe(PASTURE_DIR_MODE);

    // The birth: the clone into /workspace itself, whose sync-out is the clone as rows.
    const birth = await cell.run(`git clone --branch main ${fixture.url} .`);
    expect(birth.end).toEqual({ exit: 0 });
    expect(birth.stderr).toContain("Cloning into '.'...");
    expect(birth.changed.deleted).toEqual([]);
    for (const [path, content] of Object.entries(SEEDED)) expect(cell.text(path), path).toBe(content);
    expect(cell.text(".git/HEAD")).toBe("ref: refs/heads/main\n");
    expect([...cell.rows.keys()].some((path) => path.startsWith(".git/objects/"))).toBe(true);
    expect(birth.changed.entries.some((path) => path.includes("BRIEF") || path.includes("notes/typo"))).toBe(false);
    console.info(`pasture phase 3: the birth came back as ${cell.rows.size} rows, ${[...cell.rows.keys()].filter((path) => path.startsWith(".git/")).length} of them under .git`);

    // The tree is there for the command, by the path the agent was given for it.
    const read = await cell.run(`cat "$${PASTURE_ENV}/BRIEF.md"`);
    expect(read.end).toEqual({ exit: 0 });
    expect(read.stdout).toBe(brief);
    expect(read.changed).toEqual({ entries: [], deleted: [] });

    // A run that writes under the pasture, whether the disk lets it or not, reports nothing of it: the sync-out is the workspace's alone.
    const scribble = await cell.run(`echo overwritten > "$${PASTURE_ENV}/BRIEF.md"; echo stray > "$${PASTURE_ENV}/notes/stray.md"; echo out > out.txt; true`);
    expect(scribble.end).toEqual({ exit: 0 });
    expect(scribble.changed).toEqual({ entries: ["out.txt"], deleted: [] });
    expect(cell.text("out.txt")).toBe("out\n");
    expect([...cell.rows.keys()].some((path) => path.includes("BRIEF") || path.includes("stray"))).toBe(false);

    // The next sync-in leaves the tree whole: the same manifest lands the same bytes and modes, and takes a stray with it.
    const again = await cell.syncIn(pasture);
    expect(again.length).toBeLessThanOrEqual(1);
    expect(await readFile(join(container.pasture, "BRIEF.md"), "utf8")).toBe(brief);
    expect(await readFile(join(container.pasture, "notes/typo.md"), "utf8")).toBe("branch: fix-typo\n");
    expect(await modeOf(join(container.pasture, "BRIEF.md"))).toBe(PASTURE_FILE_MODE);
    expect(await modeOf(join(container.pasture, "notes"))).toBe(PASTURE_DIR_MODE);
    await expect(lstat(join(container.pasture, "notes/stray.md"))).rejects.toMatchObject({ code: "ENOENT" });
    // The workspace was untouched by that sync-in: the clone is still there for git.
    const status = await cell.run("git status --short && git branch --show-current");
    expect(status.end).toEqual({ exit: 0 });
    expect(status.stdout).toBe("?? out.txt\nmain\n");

    // The object changes: one file dropped, one added, the brief edited. Exactly that lands; the rest is whole.
    pasture = tree({ "BRIEF.md": `${brief}Be quick.\n`, "notes/links.md": "branch: fix-links\n" }, PASTURE_FILE_MODE, PASTURE_DIR_MODE);
    const third = await cell.syncIn(pasture);
    expect(third.sort()).toEqual([pasture.get("BRIEF.md")!.hash, pasture.get("notes/links.md")!.hash].sort());
    expect(await readFile(join(container.pasture, "BRIEF.md"), "utf8")).toBe(`${brief}Be quick.\n`);
    expect(await readFile(join(container.pasture, "notes/links.md"), "utf8")).toBe("branch: fix-links\n");
    await expect(lstat(join(container.pasture, "notes/typo.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await modeOf(join(container.pasture, "BRIEF.md"))).toBe(PASTURE_FILE_MODE);
    expect(await modeOf(join(container.pasture, "notes/links.md"))).toBe(PASTURE_FILE_MODE);
    expect(await modeOf(join(container.pasture, "notes"))).toBe(PASTURE_DIR_MODE);
    expect(await modeOf(container.pasture)).toBe(PASTURE_DIR_MODE);

    // An empty second root empties the tree; a manifest with none leaves it alone.
    expect(await cell.syncIn(new Map())).toEqual([]);
    await expect(lstat(join(container.pasture, "BRIEF.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(join(container.pasture, "notes"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await modeOf(container.pasture)).toBe(PASTURE_DIR_MODE);

    expect(await container.close()).toBe(0);
    expect(container.stderr.join("")).toBe("");
  });
});
