/**
 * Pen journey 2 in Node: real git, through the real `pen-agent` process,
 * with this test as the cell and `git-server.ts` as the repository. Node
 * on purpose: the helper is a process git spawns and the agent's Unix
 * socket is a real one, so the Mac is where they are proved before the
 * image is. The test walks steps 1 to 3 as `run` frames (clone, branch,
 * an edit synced in as the edit tool's row would be, status, diff, add,
 * commit, push), answers the one `credential` frame with the fixture's
 * token, and then greps: every frame both ways but that answer, every
 * blob, every row, the checkout on disk, `env`, `git config --list
 * --show-origin`, and `~/.git-credentials` carry no token. Then the
 * container dies and a new process gets the rows back, `.git` included,
 * and `git status` is clean. Then step 5, `git rebase -i`, and real
 * git's own words about the terminal it lacks.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
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
  TOKEN_ENV,
} from "../src/protocol.ts";
import { type GitServer, SEEDED, startGitServer, TYPO } from "./git-server.ts";

const entry = new URL("../bin/pen-agent.mjs", import.meta.url).pathname;
const helper = new URL("../bin/git-credential-pen.mjs", import.meta.url).pathname;
const encoder = new TextEncoder();
const latin1 = new TextDecoder("latin1");
const AUTHOR = { name: "Pen Home", email: "pen@example.invalid" };

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

/** A row of the cell's workspace, as this test keeps them. */
interface Row {
  kind: ManifestEntry["kind"];
  mode: number;
  hash: string | null;
  bytes: Uint8Array;
}

type Transcript = Array<{ from: "cell" | "container"; frame: Frame } | { from: "cell" | "container"; bytes: Uint8Array }>;

interface RunResult {
  stdout: string;
  stderr: string;
  end: { exit: number } | { killed: string };
  /** The `credential` frames the run provoked. */
  credentials: Array<Extract<ContainerFrame, { type: "credential" }>>;
}

/**
 * The cell, as this test plays it: rows in a `Map`, one socket, and the
 * two dances. Every frame in both directions and every blob's bytes are
 * kept in `transcript`, so the grep at the end sees what the wire saw.
 */
class Cell {
  readonly rows = new Map<string, Row>();
  readonly transcript: Transcript = [];
  private socket!: WebSocket;
  private queue: Array<Frame | Uint8Array> = [];
  private waiting: Array<(message: Frame | Uint8Array) => void> = [];
  private syncs = 0;

  private closed: Error | undefined;
  private failWaiting: Array<(error: Error) => void> = [];

  attach(socket: WebSocket): void {
    this.socket = socket;
    this.closed = undefined;
    socket.on("message", (data: Buffer, isBinary: boolean) => {
      const message = isBinary ? new Uint8Array(data) : decodeFrame(data.toString());
      this.transcript.push(isBinary ? { from: "container", bytes: message as Uint8Array } : { from: "container", frame: message as Frame });
      const next = this.waiting.shift();
      if (next) {
        this.failWaiting.shift();
        next(message);
      } else this.queue.push(message);
    });
    // A container gone mid-wait fails the wait, so a test says so instead of timing out.
    socket.on("close", (code: number, reason: Buffer) => {
      this.closed = new Error(`the container's socket closed (${code}: ${reason.toString()})`);
      for (const fail of this.failWaiting) fail(this.closed);
      this.waiting = [];
      this.failWaiting = [];
    });
  }

  private next(): Promise<Frame | Uint8Array> {
    return new Promise((resolve, reject) => {
      const queued = this.queue.shift();
      if (queued !== undefined) resolve(queued);
      else if (this.closed !== undefined) reject(this.closed);
      else {
        this.waiting.push(resolve);
        this.failWaiting.push(reject);
      }
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

  private sendBytes(bytes: Uint8Array): void {
    this.transcript.push({ from: "cell", bytes });
    this.socket.send(bytes);
  }

  /** Writes a file row, as pi's edit tool would. */
  put(path: string, content: string, mode = 0o644): void {
    const bytes = encoder.encode(content);
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join("/");
      if (!this.rows.has(dir)) this.rows.set(dir, { kind: "directory", mode: 0o755, hash: null, bytes: new Uint8Array() });
    }
    this.rows.set(path, { kind: "file", mode, hash: sha256(bytes), bytes });
  }

  text(path: string): string {
    const row = this.rows.get(path);
    if (row === undefined) throw new Error(`no row ${path}`);
    return new TextDecoder().decode(row.bytes);
  }

  manifest(): ManifestEntry[] {
    return [...this.rows]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, row]) => ({ path, kind: row.kind, mode: row.mode, hash: row.hash }));
  }

  /** The manifest down, the blobs the agent lacks, and `checkout`. */
  async syncIn(): Promise<void> {
    const id = `in-${++this.syncs}`;
    this.send({ type: "manifest", id, entries: this.manifest() });
    const need = await this.nextFrame();
    if (need.type !== "need" || need.id !== id) throw new Error(`expected need ${id}, got ${need.type}`);
    const byHash = new Map<string, Row>();
    for (const row of this.rows.values()) if (row.hash !== null) byHash.set(row.hash, row);
    for (const hash of need.hashes) {
      const row = byHash.get(hash);
      if (row === undefined) throw new Error(`the agent asked for ${hash}, which no row has`);
      this.send({ type: "blob", hash, size: row.bytes.byteLength });
      this.sendBytes(row.bytes);
    }
    const checkout = await this.nextFrame();
    if (checkout.type !== "checkout" || checkout.id !== id) throw new Error(`expected checkout ${id}, got ${checkout.type}`);
  }

  /** `changed` under `id`, `need` for every hash, the blobs into the rows, `synced`. */
  private async syncOut(id: string): Promise<void> {
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
  }

  /** One `run`, its output, its end, and the sync-out that follows; `credential` frames are answered by `answer`. */
  async run(
    command: string,
    options: { cwd?: string; timeout?: number; answer?: (request: Extract<ContainerFrame, { type: "credential" }>) => CellFrame } = {},
  ): Promise<RunResult> {
    const id = `run-${++this.syncs}`;
    this.send({ type: "run", id, command, cwd: options.cwd ?? "/workspace", env: {}, ...(options.timeout === undefined ? {} : { timeout: options.timeout }) });
    const result: RunResult = { stdout: "", stderr: "", end: { exit: -1 }, credentials: [] };
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
        result.credentials.push(frame);
        if (options.answer === undefined) this.send({ type: "error", code: "refused", of: "credential", id: frame.id, message: "the test has nothing for this scope" });
        else this.send(options.answer(frame));
      } else throw new Error(`unexpected ${frame.type} during ${id}: ${JSON.stringify(frame)}`);
    }
    await this.syncOut(id);
    return result;
  }
}

/** The rig: a socket server, an agent process on a fresh workspace, and the cell attached. */
interface Container {
  cell: Cell;
  child: ChildProcess;
  workspace: string;
  home: string;
  stderr: string[];
  close(): Promise<number | null>;
}

async function startContainer(cell: Cell, root: string, name: string): Promise<Container> {
  const server = new WebSocketServer({ port: 0 });
  const connection = new Promise<WebSocket>((resolve) => server.once("connection", (socket) => resolve(socket)));
  const port = (server.address() as { port: number }).port;
  const workspace = join(root, `${name}-workspace`);
  const home = join(root, `${name}-home`);
  await Promise.all([mkdir(workspace, { recursive: true }), mkdir(home, { recursive: true })]);
  // The image sets `credential.helper = pen` system-wide and finds the helper on PATH; here the global config names the file itself.
  const gitconfig = join(root, `${name}-gitconfig`);
  await writeFile(gitconfig, `[credential]\n\thelper =\n\thelper = ${helper}\n`);
  const env: NodeJS.ProcessEnv = { ...process.env };
  // What the container does not have: an editor, a terminal, the laptop's git configuration and credentials.
  for (const name of ["GIT_EDITOR", "EDITOR", "VISUAL", "GIT_SEQUENCE_EDITOR", "TERM", "GIT_ASKPASS", "SSH_ASKPASS"]) delete env[name];
  Object.assign(env, {
    [CELL_URL_ENV]: `ws://127.0.0.1:${port}/pen`,
    [TOKEN_ENV]: `minted-for-${name}`,
    PEN_WORKSPACE: workspace,
    [HELPER_SOCKET_ENV]: join(root, `${name}.sock`),
    PEN_HEALTH_PORT: "0",
    HOME: home,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    // The author, as `PenContainer.ensure` puts it in the container's environment from the home's configuration.
    GIT_AUTHOR_NAME: AUTHOR.name,
    GIT_AUTHOR_EMAIL: AUTHOR.email,
    GIT_COMMITTER_NAME: AUTHOR.name,
    GIT_COMMITTER_EMAIL: AUTHOR.email,
  });
  const stderr: string[] = [];
  const child = spawn(process.execPath, [entry], { env, stdio: ["ignore", "ignore", "pipe"] });
  child.stderr!.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  cell.attach(await connection);
  return {
    cell,
    child,
    workspace,
    home,
    stderr,
    async close() {
      for (const client of server.clients) client.close(1000, "cell done");
      const code = await exited(child);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      return code;
    },
  };
}

/** Every file under `dir`, read as bytes. */
async function filesUnder(dir: string): Promise<Array<{ path: string; bytes: Uint8Array }>> {
  const out: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const dirent of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!dirent.isFile()) continue;
    const path = join(dirent.parentPath, dirent.name);
    out.push({ path, bytes: new Uint8Array(await readFile(path)) });
  }
  return out;
}

/** The laptop's git, asynchronous: the fixture it clones from is served by this same process. */
async function git(args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)("git", args, { encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
  return stdout.trim();
}

describe("pen journey 2: real git through the real pen-agent, the test as the cell", () => {
  let fixture: GitServer;
  let root: string;

  beforeAll(async () => {
    fixture = await startGitServer();
    root = await mkdtemp(join(tmpdir(), "pen-j2-"));
  });

  afterAll(async () => {
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  });

  it("clones, branches, edits by row, diffs, commits, pushes with the helper, and the token is in no frame, file, row, or environment; a clone survives the container; rebase -i says what git says", { timeout: 90_000 }, async () => {
    const cell = new Cell();
    const first = await startContainer(cell, root, "first");
    await cell.syncIn();

    // Step 1: clone. The fixture asks nothing for a clone, and no credential frame appears.
    const clone = await cell.run(`git clone ${fixture.url} repo`);
    expect(clone.end).toEqual({ exit: 0 });
    expect(clone.credentials).toEqual([]);
    expect(cell.rows.get("repo/README.md")).toBeDefined();
    expect(cell.text("repo/README.md")).toBe(SEEDED["README.md"]);
    // `.git` is rows: the objects, the refs, the index.
    expect(cell.rows.get("repo/.git/HEAD")).toBeDefined();
    expect(cell.text("repo/.git/HEAD")).toBe("ref: refs/heads/main\n");
    expect([...cell.rows.keys()].some((path) => path.startsWith("repo/.git/objects/"))).toBe(true);
    const gitRows = [...cell.rows.keys()].filter((path) => path.startsWith("repo/.git/")).length;
    console.info(`pen phase 4: the clone came back as ${cell.rows.size} rows, ${gitRows} of them under .git`);

    // Step 2: a branch; an edit made by the tool, which is a row, synced in; git status and git diff read it.
    const branch = await cell.run("git checkout -b fix-typo", { cwd: "/workspace/repo" });
    expect(branch.end).toEqual({ exit: 0 });
    expect(cell.text("repo/.git/HEAD")).toBe("ref: refs/heads/fix-typo\n");
    for (const path of ["README.md", "docs/guide.md"]) cell.put(`repo/${path}`, cell.text(`repo/${path}`).replace(TYPO, "repository"));
    await cell.syncIn();
    const status = await cell.run("git status --short", { cwd: "/workspace/repo" });
    expect(status.end).toEqual({ exit: 0 });
    expect(status.stdout.split("\n").filter(Boolean).sort()).toEqual([" M README.md", " M docs/guide.md"]);
    const diff = await cell.run("git diff", { cwd: "/workspace/repo" });
    expect(diff.end).toEqual({ exit: 0 });
    expect(diff.stdout).toContain(`-This ${TYPO} has a typo.`);
    expect(diff.stdout).toContain("+This repository has a typo.");
    expect(diff.stdout).toContain(`-Clone the ${TYPO} first.`);
    expect(diff.stdout).toContain("+Clone the repository first.");

    // Step 3: add, commit, push. The fixture's 401 makes git ask the helper; the helper asks the agent; the agent asks this cell.
    const commit = await cell.run('git add -A && git commit -q -m "Fix the typo across the docs"', { cwd: "/workspace/repo" });
    expect(commit.end).toEqual({ exit: 0 });
    expect(commit.stderr).toBe("");
    const answered: string[] = [];
    const push = await cell.run("git push -u origin fix-typo", {
      cwd: "/workspace/repo",
      answer: (request) => {
        answered.push(request.id);
        return { type: "credential", id: request.id, username: "x-access-token", value: fixture.token, expires: Date.now() + 60_000 };
      },
    });
    expect(push.end).toEqual({ exit: 0 });
    expect(push.credentials).toEqual([{ type: "credential", id: answered[0], kind: "git", scope: fixture.origin }]);
    expect(answered.length).toBe(1);
    expect(push.stderr).toContain("[new branch]");
    expect(push.stderr).toContain("fix-typo -> fix-typo");
    expect(push.stdout).toContain("set up to track");
    // Real git asked because the server demanded: a 401 on the advertisement, then the same request with the token.
    const pushes = fixture.requests.filter((request) => request.path.includes("git-receive-pack"));
    expect(pushes.map((request) => `${request.method} ${request.status} ${request.authorized ? "with" : "without"}`)).toEqual(["GET 401 without", "GET 200 with", "POST 200 with"]);

    // The push landed: the bare repository has the branch with the commit, authored as the environment says, and a fresh clone shows the fix.
    expect(await git(["-C", fixture.bare, "log", "-1", "--format=%s|%an <%ae>|%cn <%ce>", "refs/heads/fix-typo"])).toBe(
      `Fix the typo across the docs|${AUTHOR.name} <${AUTHOR.email}>|${AUTHOR.name} <${AUTHOR.email}>`,
    );
    const laptop = join(root, "laptop");
    await git(["clone", "-q", "-b", "fix-typo", fixture.url, laptop]);
    expect(await readFile(join(laptop, "README.md"), "utf8")).toBe("# Fixture\n\nThis repository has a typo.\n");
    expect(await readFile(join(laptop, "docs/guide.md"), "utf8")).toBe("# Guide\n\nClone the repository first.\n");

    // Nothing the container's commands can print carries the token.
    const shown = await cell.run("env", { cwd: "/workspace/repo" });
    expect(shown.end).toEqual({ exit: 0 });
    expect(shown.stdout).toContain("PEN_HELPER_SOCKET=");
    expect(shown.stdout).not.toContain(fixture.token);
    const config = await cell.run("git config --list --show-origin", { cwd: "/workspace/repo" });
    expect(config.end).toEqual({ exit: 0 });
    expect(config.stdout).toContain("credential.helper=");
    expect(config.stdout).not.toContain(fixture.token);
    const credentials = await cell.run("cat ~/.git-credentials", { cwd: "/workspace/repo" });
    expect(credentials.end).toEqual({ exit: 1 });
    expect(credentials.stdout).toBe("");
    expect(credentials.stderr).toContain("No such file");

    // The grep: every frame both ways but the one answer, every blob, every row, and the checkout on disk.
    const answers = cell.transcript.filter((line) => "frame" in line && line.from === "cell" && line.frame.type === "credential");
    expect(answers.length).toBe(1);
    let frames = 0;
    let blobs = 0;
    for (const line of cell.transcript) {
      if ("bytes" in line) {
        blobs++;
        expect(latin1.decode(line.bytes)).not.toContain(fixture.token);
      } else if (line.from === "cell" && line.frame.type === "credential") {
        expect(line.frame).toMatchObject({ value: fixture.token });
      } else {
        frames++;
        expect(JSON.stringify(line.frame)).not.toContain(fixture.token);
      }
    }
    expect(frames).toBeGreaterThan(20);
    expect(blobs).toBeGreaterThan(20);
    for (const [path, row] of cell.rows) expect(latin1.decode(row.bytes), path).not.toContain(fixture.token);
    for (const { path, bytes } of await filesUnder(first.workspace)) expect(latin1.decode(bytes), path).not.toContain(fixture.token);
    for (const { path, bytes } of await filesUnder(first.home)) expect(latin1.decode(bytes), path).not.toContain(fixture.token);
    console.info(`pen phase 4: ${frames} frames and ${blobs} blobs both ways, ${cell.rows.size} rows, and one credential answer; the token in none of the rest`);

    // The container dies. A new one, a new disk, the rows back in, `.git` included: git status is clean and the commit is there.
    expect(await first.close()).toBe(0);
    expect(first.stderr.join("")).toBe("");
    await rm(first.workspace, { recursive: true, force: true });
    const second = await startContainer(cell, root, "second");
    await cell.syncIn();
    const clean = await cell.run("git status --short && git branch --show-current && git log -1 --format=%s", { cwd: "/workspace/repo" });
    expect(clean.end).toEqual({ exit: 0 });
    expect(clean.stdout).toBe("fix-typo\nFix the typo across the docs\n");
    expect(clean.stderr).toBe("");
    const fetched = await cell.run("git fetch -q origin && git status -sb", { cwd: "/workspace/repo" });
    expect(fetched.end).toEqual({ exit: 0 });
    expect(fetched.stdout).toBe("## fix-typo...origin/fix-typo\n");

    // Step 5: an interactive rebase with no terminal. Real git's words, exit nonzero, nothing hung.
    const started = Date.now();
    const rebase = await cell.run("git rebase -i HEAD~1", { cwd: "/workspace/repo", timeout: 15 });
    expect(rebase.end).toEqual({ exit: 1 });
    expect(rebase.stderr).toContain("Terminal is dumb, but EDITOR unset");
    expect(Date.now() - started).toBeLessThan(10_000);
    const after = await cell.run("git status --short && git log -1 --format=%s", { cwd: "/workspace/repo" });
    expect(after.stdout).toBe("Fix the typo across the docs\n");

    expect(await second.close()).toBe(0);
    expect(second.stderr.join("")).toBe("");
    for (const { path, bytes } of await filesUnder(second.workspace)) expect(latin1.decode(bytes), path).not.toContain(fixture.token);
  });

  it("a push the cell refuses fails as git fails without a credential, and the helper keeps nothing", { timeout: 60_000 }, async () => {
    const cell = new Cell();
    const container = await startContainer(cell, root, "refused");
    await cell.syncIn();
    expect((await cell.run(`git clone -q ${fixture.url} repo`)).end).toEqual({ exit: 0 });
    const push = await cell.run("git push origin HEAD:refs/heads/refused", { cwd: "/workspace/repo", timeout: 30 });
    expect(push.credentials.length).toBe(1);
    expect(push.end).toEqual({ exit: 128 });
    // Git's own words when the helper printed nothing and no terminal can be asked.
    expect(push.stderr).toContain(`could not read Username for '${fixture.origin}': terminal prompts disabled`);
    expect(push.stderr).not.toContain(fixture.token);
    expect(await git(["-C", fixture.bare, "branch", "--list", "refused"])).toBe("");
    expect(await container.close()).toBe(0);
    expect(container.stderr.join("")).toBe("");
  });
});
