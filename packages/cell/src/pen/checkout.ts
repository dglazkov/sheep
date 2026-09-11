/**
 * The cell's side of the checkout: the workspace rows to a container's
 * disk and back, over the container's socket, by content hash. One
 * `Checkout` per socket; `syncIn()` before a run, `syncOut()` after it.
 * The pen phase 2 router calls the two around a `run`; nothing here
 * knows what a run is, and frames that are not the checkout's pass by.
 *
 * Every row is written whole: a file's blob arrives, its hash is checked,
 * and the row and its chunks are written with no `await` between the first
 * statement and the last. The cell's SQL is synchronous and the object is
 * single-threaded, so a row is either before or after, never between.
 * The kill test in `test/checkout.test.ts` proves that from the outside.
 *
 * Pasture phase 3: with a `pasture`, the sync-in's manifest carries a
 * second root, the pasture's tree as its object has it at that moment,
 * marked read-only, and the `need` is answered for both roots: a hash the
 * workspace has comes from the rows, any other from the object by hash.
 * The sync-out is the workspace's alone; the container never reports
 * `/pasture`, and nothing here would write it if it did.
 *
 * Serve phase 0 puts a second announcer of binary messages on the socket,
 * the forward's `response`. Its frames pass by here like any that are not
 * the checkout's, but its bytes cannot: bytes belong to the frame that
 * announced them, so the `blob` this waits on is registered with the
 * socket's one `BinaryGuard`. A sync and a look never overlap — the look
 * is a run, and a sync happens before and after one — and the guard is
 * what says so out loud rather than letting a look's body be written to
 * a row, whichever of the two announced first.
 *
 * Fold phase 0: on a table that has `~` as a root (a home with a
 * container), the manifest carries a third root, `home`, the rows under
 * `/home/sheep` with paths relative to it, from the same table; the `need`
 * is answered for it from those rows; and its `changed` is written the way
 * the workspace's is, one row at a time, whole, under `/home/sheep`. A file
 * over the cap there is refused by name in `synced.home`, and the sync-out
 * resolves with it named `~/` in front, which is how the tool result says
 * it. A table without the root sends no `home` and writes none, so a
 * transcript is what it was.
 *
 * Fold phase 1: the pasture's cache rides two syncs here, and is decided
 * in `pen/cache.ts`. A sync-in may carry a `CacheRestore`: its record goes
 * in the manifest as `cache`, every `need` that names one of its chunks is
 * the restore's to answer, one chunk each, and the `checkout` that ends the
 * sync tells it how the put-back went. `keepCache` is a third kind of sync,
 * `cache {id}` and the chunks back one `need` at a time, whose frames and
 * bytes the `CacheSave` takes; the bytes it waits on are registered with
 * the socket's one guard, as a sync-out's are. No chunk is ever a row.
 */
import {
  type CellFrame,
  type ChangedEntry,
  type ContainerFrame,
  decodeFrame,
  encodeFrame,
  homePath,
  type ManifestEntry,
  messageBytes,
  PASTURE_DIR_MODE,
  PASTURE_FILE_MODE,
  type Refused,
} from "@sheep/pen/protocol";
import { posix } from "node:path";
import { FilesTable, HOME_ROOT, hashBytes, MAX_FILE_BYTES, WORKSPACE_ROOT } from "../workspace/files.ts";
import type { PastureSource } from "../workspace/mount.ts";
import { type CacheRestore, CacheSave, type CacheSaved, type CacheSaveRequest, type SyncChannel } from "./cache.ts";
import { type BinaryGuard, binaryGuard } from "./forward.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** What the checkout asks of a pasture: the tree now, and bytes by hash. The `Pasture` object's stub is one. */
export type PastureCheckoutSource = Pick<PastureSource, "snapshot" | "readByHash">;

/** The pasture's tree as the manifest's second root: paths relative to `/pasture`, modes the read-only ones the container writes. */
export async function pastureManifest(source: PastureCheckoutSource): Promise<ManifestEntry[]> {
  const { tree } = await source.snapshot();
  return tree.map((entry) => ({
    path: entry.path,
    kind: entry.kind,
    mode: entry.kind === "directory" ? PASTURE_DIR_MODE : entry.kind === "file" ? PASTURE_FILE_MODE : entry.mode,
    hash: entry.hash,
  }));
}

/** The container went away in the middle of a sync. The rows are whole; the sync is not done. */
export class CheckoutInterrupted extends Error {
  readonly code: number;
  readonly reason: string;
  constructor(code: number, reason: string) {
    super(`the container went away during a sync (${code}${reason ? `: ${reason}` : ""})`);
    this.name = "CheckoutInterrupted";
    this.code = code;
    this.reason = reason;
  }
}

/** The container said something the dance does not allow, or reported an error. */
export class CheckoutProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutProtocolError";
  }
}

/** An entry of a `changed`, with the row it lands in: under `/workspace`, or under `/home/sheep` for `~`'s. */
interface Landing {
  absolute: string;
  entry: ChangedEntry;
}

/** One sync in flight: what it does with each frame, and how it ends. A frame's handling may wait, as a `need` for the pasture's bytes does, and so may bytes, as a chunk put to the pasture's object does. */
interface Pending {
  id: string;
  frame(frame: ContainerFrame): void | Promise<void>;
  bytes(bytes: Uint8Array): void | Promise<void>;
  reject(error: Error): void;
}

export interface CheckoutOptions {
  /** Ids for the frames the cell sends; deterministic by default so transcripts compare. */
  nextId?: () => string;
  /** Pasture phase 3: the pasture whose tree is the manifest's second root. Absent, the manifest has one root, as before. */
  pasture?: PastureCheckoutSource;
}

export interface SyncInOptions {
  /**
   * Fold phase 1: asked with the pasture's tree as this sync-in sends it,
   * before the manifest goes; a restore it returns rides this sync-in, and
   * `undefined` sends no cache. Only asked when the checkout has a pasture.
   */
  cache?: (tree: ManifestEntry[]) => Promise<CacheRestore | undefined>;
}

export class Checkout {
  private readonly socket: WebSocket;
  private readonly files: FilesTable;
  private readonly pasture: PastureCheckoutSource | undefined;
  private readonly nextId: () => string;
  /** The one guard for this socket, shared with the `Forward` that reads it too. */
  private readonly guard: BinaryGuard;
  private pending: Pending | null = null;
  /** A `blob` frame whose bytes are next. */
  private expecting: { hash: string; size: number } | null = null;
  /** A `changed` the container sent before `syncOut()` asked for it. */
  private arrived: Extract<ContainerFrame, { type: "changed" }> | null = null;
  private interrupted: CheckoutInterrupted | null = null;
  private tail = Promise.resolve();

  constructor(socket: WebSocket, files: FilesTable, options: CheckoutOptions = {}) {
    this.socket = socket;
    this.files = files;
    this.pasture = options.pasture;
    this.guard = binaryGuard(socket);
    let counter = 0;
    this.nextId = options.nextId ?? (() => `sync-${++counter}`);
    socket.addEventListener("message", (event) => {
      this.tail = this.tail.then(() => this.receive(event.data)).catch(() => {});
    });
    const close = (code: number, reason: string) => {
      if (this.interrupted !== null) return;
      this.interrupted = new CheckoutInterrupted(code, reason);
      this.fail(this.interrupted);
    };
    socket.addEventListener("close", (event) => close(event.code, event.reason));
    socket.addEventListener("error", (event) => close(1006, String((event as { message?: string }).message ?? "socket error")));
  }

  /**
   * Sends the manifest, answers `need` with blobs, and resolves when the
   * container says `checkout`: the tree is on its disk. With a pasture,
   * the manifest carries the second root and `need` is answered for both,
   * and the second root as it was sent is what the sync-in resolves to,
   * so the caller knows what the container's `/pasture` holds now without
   * a second hop (pasture phase 4 asks it for `setup.sh`); without a
   * pasture it resolves to nothing, as before. With a restore (fold phase
   * 1), the manifest carries its record and the restore answers the
   * `need`s for its chunks; its `finish()` is called at `checkout`, and
   * the caller reads it after.
   */
  async syncIn(options: SyncInOptions = {}): Promise<ManifestEntry[] | undefined> {
    // The pasture's tree as it is now, one hop, before the manifest goes; a socket gone meanwhile fails at `start`.
    const pasture = this.pasture === undefined ? undefined : await pastureManifest(this.pasture);
    const source = this.pasture;
    // The cache for that tree's `setup.sh`, one more hop, only when the caller asks (the first sync-in of a socket).
    const restore = pasture === undefined || options.cache === undefined ? undefined : await options.cache(pasture);
    return this.start<ManifestEntry[] | undefined>((id, resolve, reject) => {
      const entries = this.files.manifest();
      // The third root, from the same rows, when the table has it: `~` on a home with a container.
      const home = this.files.hasRoot(HOME_ROOT) ? this.files.manifest(HOME_ROOT) : undefined;
      const byHash = new Map<string, { entry: ManifestEntry; absolute: string }>();
      const offer = (root: string, list: ManifestEntry[]) => {
        for (const entry of list) if (entry.hash !== null && !byHash.has(entry.hash)) byHash.set(entry.hash, { entry, absolute: `${root}/${entry.path}` });
      };
      offer(WORKSPACE_ROOT, entries);
      if (home !== undefined) offer(HOME_ROOT, home);
      const pastureHashes = new Set(pasture?.flatMap((entry) => (entry.hash === null ? [] : [entry.hash])) ?? []);
      const pending: Pending = {
        id,
        frame: async (frame) => {
          if (frame.type === "need" && frame.id === id) {
            // A chunk of the cache is the restore's, alone in its `need`.
            if (restore !== undefined && restore.has(frame)) {
              await restore.answer(frame, this.channel());
              return;
            }
            for (const hash of frame.hashes) {
              const row = byHash.get(hash);
              let bytes: Uint8Array | undefined;
              if (row !== undefined) {
                bytes = row.entry.kind === "symlink" ? encoder.encode(this.files.readlink(row.absolute)) : this.files.readFile(row.absolute);
              } else if (source !== undefined && pastureHashes.has(hash)) {
                // The second root's bytes, from the object by hash; a file changed since the snapshot is a hash it no longer has.
                bytes = await source.readByHash(hash);
                if (bytes === undefined) throw new CheckoutProtocolError(`the pasture no longer has ${hash}; it changed during the sync-in`);
              }
              if (bytes === undefined) throw new CheckoutProtocolError(`the container asked for ${hash}, which the manifest does not carry`);
              this.send({ type: "blob", hash, size: bytes.byteLength });
              this.sendBytes(bytes);
            }
            return;
          }
          if (frame.type === "checkout" && frame.id === id) {
            this.pending = null;
            restore?.finish();
            resolve(pasture);
            return;
          }
          throw new CheckoutProtocolError(`unexpected ${frame.type} frame during sync-in ${id}`);
        },
        bytes: () => {
          throw new CheckoutProtocolError(`unexpected bytes during sync-in ${id}`);
        },
        reject,
      };
      this.pending = pending;
      this.send({
        type: "manifest",
        id,
        entries,
        ...(pasture === undefined ? {} : { pasture }),
        ...(home === undefined ? {} : { home }),
        ...(restore === undefined ? {} : { cache: restore.ref }),
      });
    });
  }

  /**
   * Fold phase 1: asks the container to describe `/cache`, and keeps it in
   * the pasture's object when `pen/cache.ts` says so, passing each chunk the
   * object lacks from the socket to the object, one `need` at a time.
   * Resolves with what came of it once `synced` is sent.
   */
  keepCache(request: CacheSaveRequest): Promise<CacheSaved> {
    return this.start<CacheSaved>((id, resolve, reject) => {
      const save = new CacheSave(id, request, this.channel(), (saved) => {
        this.pending = null;
        resolve(saved);
      });
      this.pending = { id, frame: (frame) => save.frame(frame), bytes: (bytes) => save.bytes(bytes), reject };
      this.send(save.begin);
    });
  }

  /** What a sync lends the cache's half of it: the sends, and this checkout's record of the bytes it waits on, which the guard backs. */
  private channel(): SyncChannel {
    return {
      send: (frame) => this.send(frame),
      sendBytes: (bytes) => this.sendBytes(bytes),
      expect: (hash, size) => {
        this.guard.announce(`chunk ${hash}`);
        this.expecting = { hash, size };
      },
      arrived: () => {
        this.expecting = null;
        this.guard.release();
      },
    };
  }

  /**
   * Waits for the container's `changed` (under `id` when given, else the
   * next one), asks for the blobs that fit, writes each row whole as its
   * bytes arrive, and resolves with what was refused once `synced` is sent.
   */
  syncOut(id?: string): Promise<Refused[]> {
    return this.start<Refused[]>((_ignored, resolve, reject) => {
      let awaited = new Map<string, Landing[]>();
      let refused: Refused[] = [];
      let homeRefused: Refused[] = [];
      let changed: Extract<ContainerFrame, { type: "changed" }> | null = null;
      const finish = () => {
        const frame = changed!;
        // `home` answers a `changed` that had it, and only then, so a transcript without `~` is what it was.
        this.send(frame.home === undefined ? { type: "synced", id: frame.id, refused } : { type: "synced", id: frame.id, refused, home: homeRefused });
        this.pending = null;
        resolve([...refused, ...homeRefused.map((entry) => ({ path: homePath(entry.path), size: entry.size }))]);
      };
      const onChanged = (frame: Extract<ContainerFrame, { type: "changed" }>) => {
        changed = frame;
        const outcome = this.applyChanged(frame);
        awaited = outcome.awaited;
        refused = outcome.refused;
        homeRefused = outcome.homeRefused;
        this.send({ type: "need", id: frame.id, hashes: [...awaited.keys()] });
        if (awaited.size === 0) finish();
      };
      const pending: Pending = {
        id: id ?? "next",
        frame: (frame) => {
          if (changed === null) {
            if (frame.type === "changed" && (id === undefined || frame.id === id)) onChanged(frame);
            else throw new CheckoutProtocolError(`expected changed${id === undefined ? "" : ` ${id}`}, got ${frame.type}`);
            return;
          }
          if (frame.type === "blob") {
            if (!awaited.has(frame.hash)) throw new CheckoutProtocolError(`the container sent blob ${frame.hash}, which was not asked for`);
            this.guard.announce(`blob ${frame.hash}`);
            this.expecting = { hash: frame.hash, size: frame.size };
            return;
          }
          throw new CheckoutProtocolError(`unexpected ${frame.type} frame during sync-out ${changed.id}`);
        },
        bytes: (bytes) => {
          const expecting = this.expecting;
          this.expecting = null;
          this.guard.release();
          if (expecting === null) throw new CheckoutProtocolError("bytes with no blob frame before them");
          if (bytes.byteLength !== expecting.size) {
            throw new CheckoutProtocolError(`blob ${expecting.hash} announced ${expecting.size} bytes and carried ${bytes.byteLength}`);
          }
          const hash = hashBytes(bytes);
          if (hash !== expecting.hash) throw new CheckoutProtocolError(`blob ${expecting.hash} hashes to ${hash}; nothing written`);
          const landings = awaited.get(hash);
          if (landings === undefined) throw new CheckoutProtocolError(`blob ${hash} was not asked for`);
          awaited.delete(hash);
          // One row at a time, whole: nothing asynchronous from here to the end of the loop.
          for (const { absolute, entry } of landings) this.writeWhole(absolute, entry, bytes);
          if (awaited.size === 0) finish();
        },
        reject,
      };
      this.pending = pending;
      const arrived = this.arrived;
      if (arrived !== null && (id === undefined || arrived.id === id)) {
        this.arrived = null;
        onChanged(arrived);
      }
    });
  }

  /**
   * What `changed` says before any bytes move: deletions, directories, and
   * mode-only changes land now, each whole; files that fit are asked for;
   * files over the cap are refused by name. The workspace first, then `~`
   * when the frame has it and the table has the root; a `home` sent to a
   * table without one is a protocol error, since nothing here asked for it.
   */
  private applyChanged(frame: Extract<ContainerFrame, { type: "changed" }>): { awaited: Map<string, Landing[]>; refused: Refused[]; homeRefused: Refused[] } {
    if (frame.home !== undefined && !this.files.hasRoot(HOME_ROOT)) throw new CheckoutProtocolError(`the container reported ~ under ${frame.id}, and this cell has no ${HOME_ROOT}`);
    const awaited = new Map<string, Landing[]>();
    const refused = this.applyRoot(WORKSPACE_ROOT, frame.entries, frame.deleted, awaited);
    const homeRefused = frame.home === undefined ? [] : this.applyRoot(HOME_ROOT, frame.home.entries, frame.home.deleted, awaited);
    return { awaited, refused, homeRefused };
  }

  /** One root's half of `applyChanged`: its rows under `root`, and what it refused, by the path relative to the root. */
  private applyRoot(root: string, changedEntries: ChangedEntry[], deleted: string[], awaited: Map<string, Landing[]>): Refused[] {
    const refused: Refused[] = [];
    for (const path of [...deleted].sort()) {
      this.files.rm(`${root}/${path}`, { recursive: true, force: true });
    }
    const entries = [...changedEntries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const entry of entries) {
      const absolute = `${root}/${entry.path}`;
      const existing = this.files.get(absolute);
      if (entry.kind === "directory") {
        if (existing !== undefined && existing.kind !== "directory") this.files.rm(absolute, { recursive: true, force: true });
        if (existing?.kind === "directory") this.files.chmod(absolute, entry.mode);
        else this.files.mkdir(absolute, { recursive: true, mode: entry.mode });
        continue;
      }
      if (entry.hash === null) throw new CheckoutProtocolError(`${entry.path} is a ${entry.kind} with no hash`);
      if (existing !== undefined && existing.kind === entry.kind && existing.hash === entry.hash) {
        if (entry.kind === "file" && existing.mode !== entry.mode) this.files.chmod(absolute, entry.mode);
        continue;
      }
      if (entry.kind === "file" && entry.size > MAX_FILE_BYTES) {
        refused.push({ path: entry.path, size: entry.size });
        continue;
      }
      const list = awaited.get(entry.hash);
      if (list === undefined) awaited.set(entry.hash, [{ absolute, entry }]);
      else list.push({ absolute, entry });
    }
    return refused;
  }

  /** One row, whole, at `absolute`. Synchronous by construction; keep it so. */
  private writeWhole(absolute: string, entry: ChangedEntry, bytes: Uint8Array): void {
    const existing = this.files.get(absolute);
    if (entry.kind === "symlink") {
      if (existing !== undefined) this.files.rm(absolute, { recursive: true, force: true });
      this.files.mkdir(posix.dirname(absolute), { recursive: true });
      this.files.symlink(decoder.decode(bytes), absolute);
      return;
    }
    if (existing !== undefined && existing.kind !== "file") this.files.rm(absolute, { recursive: true, force: true });
    this.files.writeFile(absolute, bytes, { createParents: true, mode: entry.mode });
  }

  private start<T>(begin: (id: string, resolve: (value: T) => void, reject: (error: Error) => void) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.interrupted !== null) {
        reject(this.interrupted);
        return;
      }
      if (this.pending !== null) {
        reject(new Error(`a sync (${this.pending.id}) is already in progress`));
        return;
      }
      try {
        begin(this.nextId(), resolve, reject);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        this.fail(failure);
        reject(failure);
      }
    });
  }

  private send(frame: CellFrame): void {
    this.sendRaw(encodeFrame(frame));
  }

  private sendBytes(bytes: Uint8Array): void {
    this.sendRaw(bytes);
  }

  /** A send that fails is a socket that is gone: the sync is interrupted, whatever the runtime's wording. */
  private sendRaw(data: string | Uint8Array): void {
    if (this.interrupted !== null) throw this.interrupted;
    try {
      this.socket.send(data);
    } catch (error) {
      this.interrupted = new CheckoutInterrupted(1006, error instanceof Error ? error.message : String(error));
      throw this.interrupted;
    }
  }

  private fail(error: Error): void {
    const pending = this.pending;
    this.pending = null;
    if (this.expecting !== null) this.guard.release();
    this.expecting = null;
    pending?.reject(error);
  }

  private async receive(data: unknown): Promise<void> {
    try {
      if (typeof data === "string") {
        const frame = decodeFrame(data) as ContainerFrame;
        // The forward's frames are not the checkout's, in a sync or out of one; what the two share is the socket's one guard.
        if (frame.type === "response") return;
        if (this.expecting !== null) throw new CheckoutProtocolError(`expected the bytes of blob ${this.expecting.hash}, got a ${frame.type} frame`);
        if (frame.type === "error") throw new CheckoutProtocolError(`the container reported ${frame.code} on ${frame.of}: ${frame.message}`);
        if (this.pending === null) {
          if (frame.type === "changed") this.arrived = frame;
          return;
        }
        await this.pending.frame(frame);
      } else {
        const bytes = await messageBytes(data);
        if (bytes === undefined) throw new CheckoutProtocolError("a binary message the cell cannot read");
        if (this.pending === null) throw new CheckoutProtocolError("bytes with no sync in progress");
        await this.pending.bytes(bytes);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
