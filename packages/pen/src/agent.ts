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
 * and to what a sync-in may delete. `run` and `credential` get a typed
 * `error` so a later phase fills the case in rather than discovering it
 * was silently dropped.
 */
import ignore from "ignore";
import {
  BUILT_IN_IGNORES,
  type CellFrame,
  type ChangedEntry,
  type ContainerFrame,
  decodeFrame,
  encodeFrame,
  type EntryKind,
  type ManifestEntry,
  messageBytes,
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
}

/** Wires the agent to a socket. Frames are handled in the order they arrive, one at a time. */
export function serveAgent(socket: AgentSocket, disk: Disk): ServedAgent {
  const agent = new Agent(socket, disk);
  return { closed: agent.closed, syncOut: (id) => agent.syncOut(id) };
}

class Agent {
  private readonly socket: AgentSocket;
  private readonly disk: Disk;
  readonly closed: Promise<void>;
  private isClosed = false;
  private tail = Promise.resolve();
  /** What is on disk as far as the last sync said. */
  private known = new Map<string, Known>();
  /** A sync-in in progress: the manifest and the blobs still to come. */
  private checkout: { id: string; entries: ManifestEntry[]; have: Map<string, Scanned>; needed: Set<string>; blobs: Map<string, Uint8Array> } | null = null;
  /** The `blob` frame whose binary message is next. */
  private expecting: { hash: string; size: number } | null = null;
  /** A sync-out in progress. */
  private out: { id: string; entries: ChangedEntry[]; deleted: string[]; resolve: (refused: Refused[]) => void; reject: (error: Error) => void } | null = null;

  constructor(socket: AgentSocket, disk: Disk) {
    this.socket = socket;
    this.disk = disk;
    socket.addEventListener("message", (event) => {
      this.tail = this.tail.then(() => this.receive(event.data));
    });
    this.closed = new Promise<void>((resolve) => {
      socket.addEventListener("close", () => {
        this.isClosed = true;
        this.out?.reject(new Error("the socket closed during a sync-out"));
        this.out = null;
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
        await this.receiveManifest(frame.id, frame.entries);
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
      default:
        this.send({ type: "error", code: "unsupported", of: frame.type, message: `the agent does not handle ${frame.type} yet` });
    }
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
    const state = new Map<string, Scanned>();
    for (const entry of kept) {
      if (entry.kind === "directory") {
        state.set(entry.path, { kind: "directory", mode: entry.mode, hash: null, size: 0 });
      } else if (entry.kind === "symlink") {
        const target = encoder.encode(await this.disk.readlink(entry.path));
        state.set(entry.path, { kind: "symlink", mode: SYMLINK_MODE, hash: await this.disk.digest(target), size: target.byteLength });
      } else {
        const bytes = await this.disk.read(entry.path);
        state.set(entry.path, { kind: "file", mode: entry.mode, hash: await this.disk.digest(bytes), size: bytes.byteLength });
      }
    }
    return { state, present };
  }

  /** The disk under the cache rule, unhashed: what the rule keeps out of `list()`, and every path that is there. */
  private async listKept(): Promise<{ kept: DiskEntry[]; present: Set<string> }> {
    const listed = await this.disk.list();
    const present = new Set(listed.map((entry) => entry.path));
    const gitignore = listed.some((entry) => entry.path === GITIGNORE && entry.kind === "file") ? decoder.decode(await this.disk.read(GITIGNORE)) : undefined;
    const cached = cacheRule(gitignore);
    return { kept: listed.filter((entry) => !cached(entry.path, entry.kind)), present };
  }

  private async receiveManifest(id: string, entries: ManifestEntry[]): Promise<void> {
    const { state } = await this.scan();
    const needed = new Set<string>();
    for (const entry of entries) {
      if (entry.kind === "directory" || entry.hash === null) continue;
      const have = state.get(entry.path);
      if (have !== undefined && have.kind === entry.kind && have.hash === entry.hash) continue;
      needed.add(entry.hash);
    }
    this.checkout = { id, entries, have: state, needed, blobs: new Map() };
    this.send({ type: "need", id, hashes: [...needed] });
    if (needed.size === 0) await this.applyCheckout();
  }

  /** Every blob is here: write the manifest to disk, then delete what it does not name and the rule does not keep. */
  private async applyCheckout(): Promise<void> {
    const checkout = this.checkout;
    if (checkout === null) return;
    this.checkout = null;
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
