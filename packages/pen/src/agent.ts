/**
 * The agent: the container's side of the protocol, as code that runs
 * anywhere. Given a socket and a disk it answers the cell's frames. The
 * process in the image (`node.ts`) hands it Node's WebSocket and a disk
 * over `node:fs` under `/workspace`; the cell's tests hand it one end of
 * a `WebSocketPair` and a disk in memory. There is one agent, not a real
 * one and a fake one: the fake is this file over a different disk.
 *
 * Phase 1 speaks the checkout: `manifest` in, `changed` out, blobs by
 * hash both ways, the cache rule applied on this side to what it reports
 * and to what a sync-in may delete. Phase 2 speaks `run`: the command
 * goes to a `Runner`, the second thing injected beside the disk, its
 * output is sent as it comes, and when it ends the agent describes what
 * it changed without being asked. A run has its own lane: the frames
 * that arrive while it runs (`ping`, `kill`) are answered at once, not
 * queued behind it. Phase 4 carries a credential: `askCredential` is the
 * helper's path in, called by the Unix socket server in `node.ts` and by
 * a test directly; the agent sends `credential` up, and the cell's
 * `credential` or `error` under the same id settles it. The value goes
 * back to the caller and is held nowhere else: not logged, not kept, and
 * never part of a `stdout` or `stderr` frame.
 *
 * Pasture phase 3 gives the agent a second disk, the pasture's, rooted at
 * `/pasture` beside the checkout. A `manifest` that carries `pasture` is
 * applied to it after the workspace: files `0444`, directories `0555`,
 * blobs asked for in the one `need`, and what the manifest no longer
 * names removed. The sync-out walks the checkout's disk alone, so nothing
 * written under `/pasture` is ever reported: the two disks are two trees,
 * as `/workspace` and `/pasture` are in the image.
 */
import ignore from "ignore";
import {
  BUILT_IN_IGNORES,
  type CellFrame,
  type ChangedEntry,
  type ContainerFrame,
  type CredentialAnswer,
  type CredentialRequest,
  decodeFrame,
  encodeFrame,
  type EntryKind,
  type ManifestEntry,
  messageBytes,
  PASTURE_DIR_MODE,
  PASTURE_FILE_MODE,
  type Refused,
} from "./protocol.ts";

export interface DiskEntry {
  /** Relative to the checkout root, no leading slash. */
  path: string;
  kind: EntryKind;
  mode: number;
}

/**
 * What the agent needs of a filesystem. The checkout root is the disk's
 * own business; every path here is relative to it. Writes create parents;
 * `remove` is recursive and quiet about a path that is not there.
 */
export interface Disk {
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array, options?: { mode?: number }): Promise<void>;
  mkdir(path: string, mode: number): Promise<void>;
  /** Replaces whatever is at `path`. */
  symlink(target: string, path: string): Promise<void>;
  readlink(path: string): Promise<string>;
  chmod(path: string, mode: number): Promise<void>;
  /** Every entry under the root, the root excluded, sorted by path. Applies no rule; the agent does. */
  list(): Promise<DiskEntry[]>;
  remove(path: string): Promise<void>;
  /** SHA-256, lowercase hex. On the disk so Node can use `node:crypto` and a test WebCrypto. */
  digest(bytes: Uint8Array): Promise<string>;
}

/** One command to run, as the cell asked for it. */
export interface RunRequest {
  id: string;
  command: string;
  /** Absolute, under the checkout root's mount (`/workspace/...`). */
  cwd: string;
  /** Laid over the process's own environment; the container's `PATH` and `HOME` win by not being here. */
  env: Record<string, string>;
  /** Seconds; absent for no limit. The runner's own backstop, beside the cell's timer. */
  timeout?: number;
}

/** Where a run's output goes as it happens. Chunks are text; the runner decodes. */
export interface RunOutput {
  stdout(data: string): void;
  stderr(data: string): void;
}

/** How a run ended: on its own with a code, or early for a reason, in which case no code exists. */
export type RunOutcome = { exit: number } | { killed: string };

/** A run in progress: its end, and a way to end it early. `kill` after the end is a no-op. */
export interface RunHandle {
  outcome: Promise<RunOutcome>;
  kill(reason: string): void;
}

/**
 * What the agent needs of a process runner. The image runs `bash -c`
 * under `/workspace`; the cell's tests run a script the test wrote, since
 * workerd has no processes. That is the one place the fake is not the
 * thing; the protocol around it is the agent's own in both.
 */
export interface Runner {
  run(request: RunRequest, output: RunOutput): RunHandle;
}

/**
 * The part of a WebSocket the agent uses, so the same code takes workerd's
 * and Node's without either's types. Binary messages go out as views.
 */
export interface AgentSocket {
  send(data: string | Uint8Array): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: unknown) => void): void;
}

/** A symlink's permission bits are not its own; the cell's rows say 0o777 and so does the agent. */
const SYMLINK_MODE = 0o777;
const GITIGNORE = ".gitignore";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** What the agent knows to be at a path: written at a sync-in or accepted at a sync-out. */
interface Known {
  kind: EntryKind;
  mode: number;
  hash: string | null;
}

interface Scanned extends Known {
  size: number;
}

/**
 * The cache rule: the built-in list at any depth, then the checkout's own
 * `.gitignore` at the root. Directories are tested with a trailing slash,
 * as git does, so `dist/` in the file keeps `dist` and everything under it.
 */
export function cacheRule(gitignore: string | undefined): (path: string, kind: EntryKind) => boolean {
  const rules = ignore().add([...BUILT_IN_IGNORES]);
  if (gitignore !== undefined) rules.add(gitignore);
  return (path, kind) => rules.ignores(kind === "directory" ? `${path}/` : path);
}

/** The entries of a disk with their hashes and sizes, as a sync compares them. */
async function hashed(disk: Disk, entries: DiskEntry[]): Promise<Map<string, Scanned>> {
  const state = new Map<string, Scanned>();
  for (const entry of entries) {
    if (entry.kind === "directory") {
      state.set(entry.path, { kind: "directory", mode: entry.mode, hash: null, size: 0 });
    } else if (entry.kind === "symlink") {
      const target = encoder.encode(await disk.readlink(entry.path));
      state.set(entry.path, { kind: "symlink", mode: SYMLINK_MODE, hash: await disk.digest(target), size: target.byteLength });
    } else {
      const bytes = await disk.read(entry.path);
      state.set(entry.path, { kind: "file", mode: entry.mode, hash: await disk.digest(bytes), size: bytes.byteLength });
    }
  }
  return state;
}

class ProtocolError extends Error {
  readonly code: "malformed" | "mismatch" | "failed";
  /** The frame type the error is about. */
  readonly of: string;
  constructor(code: "malformed" | "mismatch" | "failed", of: string, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
    this.of = of;
  }
}

export interface ServedAgent {
  /** Resolves when the socket closes; the agent sends nothing after. */
  closed: Promise<void>;
  /**
   * Describes what changed since the last sync under `id` and sends the
   * bytes the cell asks for. Resolves with what the cell refused once it
   * says `synced`. A later phase calls this after every `run`; a test
   * calls it in place of one.
   */
  syncOut(id: string): Promise<Refused[]>;
  /**
   * The helper's path: asks the cell for a credential and resolves with the
   * home's answer, or with `undefined` when the cell refused it, the wait
   * ran out, or the socket is gone. The answer is the caller's to hand on
   * and forget.
   */
  askCredential(request: CredentialRequest, options?: { timeoutMs?: number }): Promise<CredentialAnswer | undefined>;
}

/** How long the helper waits for the cell's answer before git is told there is none. */
export const CREDENTIAL_TIMEOUT_MS = 10_000;

export interface ServeAgentOptions {
  /** Pasture phase 3: the disk rooted at `/pasture`, written read-only from a manifest's second root. Absent, a manifest's `pasture` is ignored. */
  pasture?: Disk;
}

/** Wires the agent to a socket. Frames are handled in the order they arrive, one at a time; a run's work is not on that chain. */
export function serveAgent(socket: AgentSocket, disk: Disk, runner: Runner, options: ServeAgentOptions = {}): ServedAgent {
  const agent = new Agent(socket, disk, runner, options.pasture);
  return { closed: agent.closed, syncOut: (id) => agent.syncOut(id), askCredential: (request, options) => agent.askCredential(request, options) };
}

/** A sync-in's second root: the pasture's manifest and what its disk had before. */
interface PastureCheckout {
  entries: ManifestEntry[];
  have: Map<string, Scanned>;
}

class Agent {
  private readonly socket: AgentSocket;
  private readonly disk: Disk;
  private readonly pasture: Disk | undefined;
  private readonly runner: Runner;
  readonly closed: Promise<void>;
  private isClosed = false;
  private tail = Promise.resolve();
  /** The run in progress, at most one. */
  private running: { id: string; handle: RunHandle } | null = null;
  /** What is on disk as far as the last sync said. */
  private known = new Map<string, Known>();
  /** A sync-in in progress: the manifest and the blobs still to come; `pasture` when the manifest carried the second root. */
  private checkout: {
    id: string;
    entries: ManifestEntry[];
    have: Map<string, Scanned>;
    needed: Set<string>;
    blobs: Map<string, Uint8Array>;
    pasture: PastureCheckout | null;
  } | null = null;
  /** The `blob` frame whose binary message is next. */
  private expecting: { hash: string; size: number } | null = null;
  /** A sync-out in progress. */
  private out: { id: string; entries: ChangedEntry[]; deleted: string[]; resolve: (refused: Refused[]) => void; reject: (error: Error) => void } | null = null;
  /** Credential requests waiting on the cell, by id. */
  private credentials = new Map<string, { settle: (answer: CredentialAnswer | undefined) => void }>();
  private credentialCount = 0;

  constructor(socket: AgentSocket, disk: Disk, runner: Runner, pasture: Disk | undefined) {
    this.socket = socket;
    this.disk = disk;
    this.pasture = pasture;
    this.runner = runner;
    socket.addEventListener("message", (event) => {
      this.tail = this.tail.then(() => this.receive(event.data));
    });
    this.closed = new Promise<void>((resolve) => {
      socket.addEventListener("close", () => {
        this.isClosed = true;
        this.out?.reject(new Error("the socket closed during a sync-out"));
        this.out = null;
        // A container that loses its socket stops its command.
        this.running?.handle.kill("the socket closed");
        for (const pending of this.credentials.values()) pending.settle(undefined);
        this.credentials.clear();
        resolve();
      });
    });
  }

  private send(frame: ContainerFrame): void {
    if (this.isClosed) return;
    this.socket.send(encodeFrame(frame));
  }

  private sendBytes(bytes: Uint8Array): void {
    if (this.isClosed) return;
    this.socket.send(bytes);
  }

  private async receive(data: unknown): Promise<void> {
    let of = "binary";
    try {
      if (typeof data === "string") {
        let frame: CellFrame;
        try {
          frame = decodeFrame(data) as CellFrame;
        } catch (error) {
          throw new ProtocolError("malformed", "?", error instanceof Error ? error.message : String(error));
        }
        of = frame.type;
        await this.handle(frame);
      } else {
        const bytes = await messageBytes(data);
        if (bytes === undefined) throw new ProtocolError("malformed", of, "a binary message the agent cannot read");
        await this.handleBytes(bytes);
      }
    } catch (error) {
      // Whatever failed, the sync it was part of is over, and the cell is told.
      this.checkout = null;
      this.expecting = null;
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof ProtocolError) this.send({ type: "error", code: error.code, of: error.of, message });
      else this.send({ type: "error", code: "failed", of, message });
    }
  }

  private async handle(frame: CellFrame): Promise<void> {
    if (this.expecting !== null) {
      throw new ProtocolError("malformed", frame.type, `expected the bytes of blob ${this.expecting.hash}, got a ${frame.type} frame`);
    }
    switch (frame.type) {
      case "ping":
        this.send(frame.id === undefined ? { type: "pong" } : { type: "pong", id: frame.id });
        return;
      case "manifest":
        await this.receiveManifest(frame.id, frame.entries, frame.pasture);
        return;
      case "blob":
        if (this.checkout === null || !this.checkout.needed.has(frame.hash)) {
          throw new ProtocolError("malformed", "blob", `no sync-in is waiting for blob ${frame.hash}`);
        }
        this.expecting = { hash: frame.hash, size: frame.size };
        return;
      case "need":
        await this.answerNeed(frame.id, frame.hashes);
        return;
      case "sync":
        // Not awaited: the answer is `changed`, and the dance runs on frames that arrive behind this one.
        this.syncOut(frame.id).catch((error: unknown) => {
          this.send({ type: "error", code: "failed", of: "sync", message: error instanceof Error ? error.message : String(error) });
        });
        return;
      case "synced":
        this.finishSyncOut(frame.id, frame.refused);
        return;
      case "run":
        // Not awaited: the run has its own lane, so `ping` and `kill` are answered while it runs.
        this.startRun(frame);
        return;
      case "kill":
        // A kill for a run that already ended is ignored: `exit` is on its way, and the cell takes either.
        if (this.running !== null && this.running.id === frame.id) this.running.handle.kill(frame.reason);
        return;
      case "credential": {
        // An answer no one is waiting for (the wait ran out first) is dropped, value and all; nothing is said, since the value must not be repeated.
        const { id, ...answer } = frame;
        this.settleCredential(id, answer.value === undefined ? undefined : { ...(answer.username === undefined ? {} : { username: answer.username }), value: answer.value, expires: answer.expires });
        return;
      }
      case "error":
        if (frame.of === "credential" && frame.id !== undefined) this.settleCredential(frame.id, undefined);
        return;
      default: {
        // Every frame the protocol names is handled above; one it does not is answered, not dropped.
        const { type } = frame as { type: string };
        this.send({ type: "error", code: "unsupported", of: type, message: `the agent does not handle ${type}` });
      }
    }
  }

  /** Starts the runner, streams its output, and when it ends says how and then what changed. */
  private startRun(frame: Extract<CellFrame, { type: "run" }>): void {
    if (this.running !== null) {
      this.send({ type: "error", code: "failed", of: "run", message: `a run (${this.running.id}) is already in progress` });
      return;
    }
    const id = frame.id;
    let handle: RunHandle;
    try {
      handle = this.runner.run(
        { id, command: frame.command, cwd: frame.cwd, env: frame.env, ...(frame.timeout === undefined ? {} : { timeout: frame.timeout }) },
        {
          stdout: (data) => this.send({ type: "stdout", id, data }),
          stderr: (data) => this.send({ type: "stderr", id, data }),
        },
      );
    } catch (error) {
      this.send({ type: "error", code: "failed", of: "run", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    this.running = { id, handle };
    handle.outcome
      .then((outcome) => {
        this.running = null;
        if ("exit" in outcome) this.send({ type: "exit", id, code: outcome.exit });
        else this.send({ type: "killed", id, reason: outcome.killed });
        if (this.isClosed) return;
        return this.syncOut(id).then(
          () => undefined,
          (error: unknown) => {
            this.send({ type: "error", code: "failed", of: "run", message: error instanceof Error ? error.message : String(error) });
          },
        );
      })
      .catch((error: unknown) => {
        this.running = null;
        this.send({ type: "error", code: "failed", of: "run", message: error instanceof Error ? error.message : String(error) });
      });
  }

  askCredential(request: CredentialRequest, options: { timeoutMs?: number } = {}): Promise<CredentialAnswer | undefined> {
    if (this.isClosed) return Promise.resolve(undefined);
    const id = `cred-${++this.credentialCount}`;
    return new Promise<CredentialAnswer | undefined>((resolve) => {
      const timer = setTimeout(() => this.settleCredential(id, undefined), options.timeoutMs ?? CREDENTIAL_TIMEOUT_MS);
      this.credentials.set(id, {
        settle: (answer) => {
          clearTimeout(timer);
          resolve(answer);
        },
      });
      this.send({ type: "credential", id, kind: request.kind, scope: request.scope });
    });
  }

  private settleCredential(id: string, answer: CredentialAnswer | undefined): void {
    const pending = this.credentials.get(id);
    if (pending === undefined) return;
    this.credentials.delete(id);
    pending.settle(answer);
  }

  private async handleBytes(bytes: Uint8Array): Promise<void> {
    const expecting = this.expecting;
    if (expecting === null || this.checkout === null) throw new ProtocolError("malformed", "binary", "bytes with no blob frame before them");
    this.expecting = null;
    if (bytes.byteLength !== expecting.size) {
      throw new ProtocolError("mismatch", "blob", `blob ${expecting.hash} announced ${expecting.size} bytes and carried ${bytes.byteLength}`);
    }
    const hash = await this.disk.digest(bytes);
    if (hash !== expecting.hash) throw new ProtocolError("mismatch", "blob", `blob ${expecting.hash} hashes to ${hash}`);
    this.checkout.blobs.set(hash, bytes);
    this.checkout.needed.delete(hash);
    if (this.checkout.needed.size === 0) await this.applyCheckout();
  }

  /**
   * Walks the disk under the cache rule: every entry not kept by it, with
   * its hash. `present` is every path on disk, kept or not, so a sync-out
   * can tell a deleted file from one the rule now hides.
   */
  private async scan(): Promise<{ state: Map<string, Scanned>; present: Set<string> }> {
    const { kept, present } = await this.listKept();
    return { state: await hashed(this.disk, kept), present };
  }

  /** The pasture's disk, whole and hashed: no cache rule applies there, since nothing is ever built under it. */
  private async scanPasture(pasture: Disk): Promise<Map<string, Scanned>> {
    return hashed(pasture, await pasture.list());
  }

  /** The disk under the cache rule, unhashed: what the rule keeps out of `list()`, and every path that is there. */
  private async listKept(): Promise<{ kept: DiskEntry[]; present: Set<string> }> {
    const listed = await this.disk.list();
    const present = new Set(listed.map((entry) => entry.path));
    const gitignore = listed.some((entry) => entry.path === GITIGNORE && entry.kind === "file") ? decoder.decode(await this.disk.read(GITIGNORE)) : undefined;
    const cached = cacheRule(gitignore);
    return { kept: listed.filter((entry) => !cached(entry.path, entry.kind)), present };
  }

  private async receiveManifest(id: string, entries: ManifestEntry[], pastureEntries: ManifestEntry[] | undefined): Promise<void> {
    const { state } = await this.scan();
    const needed = new Set<string>();
    const missing = (manifest: ManifestEntry[], have: Map<string, Scanned>) => {
      for (const entry of manifest) {
        if (entry.kind === "directory" || entry.hash === null) continue;
        const had = have.get(entry.path);
        if (had !== undefined && had.kind === entry.kind && had.hash === entry.hash) continue;
        needed.add(entry.hash);
      }
    };
    missing(entries, state);
    // The second root, when the manifest carries it and this agent has a pasture disk: its blobs join the one `need`.
    let pasture: PastureCheckout | null = null;
    if (pastureEntries !== undefined && this.pasture !== undefined) {
      pasture = { entries: pastureEntries, have: await this.scanPasture(this.pasture) };
      missing(pastureEntries, pasture.have);
    }
    this.checkout = { id, entries, have: state, needed, blobs: new Map(), pasture };
    this.send({ type: "need", id, hashes: [...needed] });
    if (needed.size === 0) await this.applyCheckout();
  }

  /**
   * The pasture's tree onto its disk, read-only. Directories are made
   * writable first, so the agent, which need not be root, can write into
   * them; then every entry the manifest names lands (files `0444`, symlinks
   * as they are), what it does not name is removed, and every directory,
   * the root included, is set `0555`, deepest first.
   */
  private async applyPasture(disk: Disk, checkout: PastureCheckout, blobs: Map<string, Uint8Array>): Promise<void> {
    const { entries, have } = checkout;
    await disk.mkdir("", 0o755);
    for (const [path, was] of have) if (was.kind === "directory") await disk.chmod(path, 0o755);
    const named = new Set<string>();
    for (const entry of entries) {
      named.add(entry.path);
      const had = have.get(entry.path);
      if (entry.kind === "directory") {
        if (had?.kind === "directory") continue;
        if (had !== undefined) await disk.remove(entry.path);
        await disk.mkdir(entry.path, 0o755);
        continue;
      }
      if (had !== undefined && had.kind === entry.kind && had.hash === entry.hash) {
        if (entry.kind === "file" && had.mode !== PASTURE_FILE_MODE) await disk.chmod(entry.path, PASTURE_FILE_MODE);
        continue;
      }
      const bytes = entry.hash === null ? undefined : blobs.get(entry.hash);
      if (bytes === undefined) throw new ProtocolError("malformed", "manifest", `no blob for /pasture/${entry.path}`);
      if (had !== undefined && had.kind !== entry.kind) await disk.remove(entry.path);
      if (entry.kind === "symlink") await disk.symlink(decoder.decode(bytes), entry.path);
      else await disk.write(entry.path, bytes, { mode: PASTURE_FILE_MODE });
    }
    // What the manifest no longer names goes; what it still names stays, whole.
    let removed: string | null = null;
    for (const path of [...have.keys()].sort()) {
      if (named.has(path)) continue;
      if (removed !== null && path.startsWith(`${removed}/`)) continue;
      await disk.remove(path);
      removed = path;
    }
    const directories = entries.filter((entry) => entry.kind === "directory").map((entry) => entry.path);
    for (const path of directories.sort((a, b) => b.length - a.length)) await disk.chmod(path, PASTURE_DIR_MODE);
    await disk.chmod("", PASTURE_DIR_MODE);
  }

  /** Every blob is here: write the manifest to disk, then delete what it does not name and the rule does not keep. */
  private async applyCheckout(): Promise<void> {
    const checkout = this.checkout;
    if (checkout === null) return;
    this.checkout = null;
    // The second root first, so a workspace command that follows finds `/pasture` in place; its failure ends the sync like any other.
    if (checkout.pasture !== null && this.pasture !== undefined) await this.applyPasture(this.pasture, checkout.pasture, checkout.blobs);
    const known = new Map<string, Known>();
    for (const entry of checkout.entries) {
      const have = checkout.have.get(entry.path);
      known.set(entry.path, { kind: entry.kind, mode: entry.kind === "symlink" ? SYMLINK_MODE : entry.mode, hash: entry.hash });
      if (entry.kind === "directory") {
        if (have?.kind === "directory") {
          if (have.mode !== entry.mode) await this.disk.chmod(entry.path, entry.mode);
          continue;
        }
        if (have !== undefined) await this.disk.remove(entry.path);
        await this.disk.mkdir(entry.path, entry.mode);
        continue;
      }
      if (have !== undefined && have.kind === entry.kind && have.hash === entry.hash) {
        if (entry.kind === "file" && have.mode !== entry.mode) await this.disk.chmod(entry.path, entry.mode);
        continue;
      }
      const bytes = entry.hash === null ? undefined : checkout.blobs.get(entry.hash);
      if (bytes === undefined) throw new ProtocolError("malformed", "manifest", `no blob for ${entry.path}`);
      if (have !== undefined && have.kind !== entry.kind) await this.disk.remove(entry.path);
      if (entry.kind === "symlink") await this.disk.symlink(decoder.decode(bytes), entry.path);
      else await this.disk.write(entry.path, bytes, { mode: entry.mode });
    }
    // The rule is read again: the manifest may have brought a new `.gitignore`.
    const { kept } = await this.listKept();
    let removed: string | null = null;
    for (const { path } of kept) {
      if (known.has(path)) continue;
      if (removed !== null && path.startsWith(`${removed}/`)) continue;
      await this.disk.remove(path);
      removed = path;
    }
    this.known = known;
    this.send({ type: "checkout", id: checkout.id });
  }

  syncOut(id: string): Promise<Refused[]> {
    return new Promise<Refused[]>((resolve, reject) => {
      this.tail = this.tail
        .then(async () => {
          if (this.isClosed) throw new Error("the socket is closed");
          if (this.out !== null) throw new Error(`a sync-out (${this.out.id}) is already in progress`);
          const { state, present } = await this.scan();
          const entries: ChangedEntry[] = [];
          for (const [path, now] of state) {
            const was = this.known.get(path);
            if (was !== undefined && was.kind === now.kind && was.mode === now.mode && was.hash === now.hash) continue;
            entries.push({ path, kind: now.kind, mode: now.mode, hash: now.hash, size: now.size });
          }
          const deleted = [...this.known.keys()].filter((path) => !present.has(path)).sort();
          if (this.isClosed) throw new Error("the socket closed");
          this.out = { id, entries, deleted, resolve, reject };
          this.send({ type: "changed", id, entries, deleted });
        })
        .catch((error: unknown) => {
          this.out = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private async answerNeed(id: string, hashes: string[]): Promise<void> {
    const out = this.out;
    if (out === null || out.id !== id) throw new ProtocolError("malformed", "need", `no sync-out ${id} is in progress`);
    const byHash = new Map<string, ChangedEntry>();
    for (const entry of out.entries) if (entry.hash !== null && !byHash.has(entry.hash)) byHash.set(entry.hash, entry);
    for (const hash of hashes) {
      const entry = byHash.get(hash);
      if (entry === undefined) throw new ProtocolError("malformed", "need", `the sync-out ${id} did not offer ${hash}`);
      const bytes = entry.kind === "symlink" ? encoder.encode(await this.disk.readlink(entry.path)) : await this.disk.read(entry.path);
      const now = await this.disk.digest(bytes);
      if (now !== hash) throw new ProtocolError("mismatch", "need", `${entry.path} changed while syncing: ${now}`);
      this.send({ type: "blob", hash, size: bytes.byteLength });
      this.sendBytes(bytes);
    }
  }

  private finishSyncOut(id: string, refused: Refused[]): void {
    const out = this.out;
    if (out === null || out.id !== id) throw new ProtocolError("malformed", "synced", `no sync-out ${id} is in progress`);
    this.out = null;
    const refusedPaths = new Set(refused.map((entry) => entry.path));
    for (const entry of out.entries) {
      if (refusedPaths.has(entry.path)) continue;
      this.known.set(entry.path, { kind: entry.kind, mode: entry.mode, hash: entry.hash });
    }
    for (const path of out.deleted) this.known.delete(path);
    out.resolve(refused);
  }
}
