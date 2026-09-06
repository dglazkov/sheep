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
 */
import {
  type CellFrame,
  type ChangedEntry,
  type ContainerFrame,
  decodeFrame,
  encodeFrame,
  type ManifestEntry,
  messageBytes,
  PASTURE_DIR_MODE,
  PASTURE_FILE_MODE,
  type Refused,
} from "@sheep/pen/protocol";
import { posix } from "node:path";
import { FilesTable, hashBytes, MAX_FILE_BYTES, WORKSPACE_ROOT } from "../workspace/files.ts";
import type { PastureSource } from "../workspace/mount.ts";

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

/** One sync in flight: what it does with each frame, and how it ends. A frame's handling may wait, as a `need` for the pasture's bytes does. */
interface Pending {
  id: string;
  frame(frame: ContainerFrame): void | Promise<void>;
  bytes(bytes: Uint8Array): void;
  reject(error: Error): void;
}

export interface CheckoutOptions {
  /** Ids for the frames the cell sends; deterministic by default so transcripts compare. */
  nextId?: () => string;
  /** Pasture phase 3: the pasture whose tree is the manifest's second root. Absent, the manifest has one root, as before. */
  pasture?: PastureCheckoutSource;
}

export class Checkout {
  private readonly socket: WebSocket;
  private readonly files: FilesTable;
  private readonly pasture: PastureCheckoutSource | undefined;
  private readonly nextId: () => string;
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
   * the manifest carries the second root and `need` is answered for both.
   */
  async syncIn(): Promise<void> {
    // The pasture's tree as it is now, one hop, before the manifest goes; a socket gone meanwhile fails at `start`.
    const pasture = this.pasture === undefined ? undefined : await pastureManifest(this.pasture);
    const source = this.pasture;
    return this.start<void>((id, resolve, reject) => {
      const entries = this.files.manifest();
      const byHash = new Map<string, ManifestEntry>();
      for (const entry of entries) if (entry.hash !== null && !byHash.has(entry.hash)) byHash.set(entry.hash, entry);
      const pastureHashes = new Set(pasture?.flatMap((entry) => (entry.hash === null ? [] : [entry.hash])) ?? []);
      const pending: Pending = {
        id,
        frame: async (frame) => {
          if (frame.type === "need" && frame.id === id) {
            for (const hash of frame.hashes) {
              const entry = byHash.get(hash);
              let bytes: Uint8Array | undefined;
              if (entry !== undefined) {
                bytes = entry.kind === "symlink"
                  ? encoder.encode(this.files.readlink(`${WORKSPACE_ROOT}/${entry.path}`))
                  : this.files.readFile(`${WORKSPACE_ROOT}/${entry.path}`);
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
            resolve();
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
      this.send(pasture === undefined ? { type: "manifest", id, entries } : { type: "manifest", id, entries, pasture });
    });
  }

  /**
   * Waits for the container's `changed` (under `id` when given, else the
   * next one), asks for the blobs that fit, writes each row whole as its
   * bytes arrive, and resolves with what was refused once `synced` is sent.
   */
  syncOut(id?: string): Promise<Refused[]> {
    return this.start<Refused[]>((_ignored, resolve, reject) => {
      let awaited = new Map<string, ChangedEntry[]>();
      let refused: Refused[] = [];
      let changed: Extract<ContainerFrame, { type: "changed" }> | null = null;
      const finish = () => {
        this.send({ type: "synced", id: changed!.id, refused });
        this.pending = null;
        resolve(refused);
      };
      const onChanged = (frame: Extract<ContainerFrame, { type: "changed" }>) => {
        changed = frame;
        const outcome = this.applyChanged(frame);
        awaited = outcome.awaited;
        refused = outcome.refused;
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
            this.expecting = { hash: frame.hash, size: frame.size };
            return;
          }
          throw new CheckoutProtocolError(`unexpected ${frame.type} frame during sync-out ${changed.id}`);
        },
        bytes: (bytes) => {
          const expecting = this.expecting;
          this.expecting = null;
          if (expecting === null) throw new CheckoutProtocolError("bytes with no blob frame before them");
          if (bytes.byteLength !== expecting.size) {
            throw new CheckoutProtocolError(`blob ${expecting.hash} announced ${expecting.size} bytes and carried ${bytes.byteLength}`);
          }
          const hash = hashBytes(bytes);
          if (hash !== expecting.hash) throw new CheckoutProtocolError(`blob ${expecting.hash} hashes to ${hash}; nothing written`);
          const entries = awaited.get(hash);
          if (entries === undefined) throw new CheckoutProtocolError(`blob ${hash} was not asked for`);
          awaited.delete(hash);
          // One row at a time, whole: nothing asynchronous from here to the end of the loop.
          for (const entry of entries) this.writeWhole(entry, bytes);
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
   * files over the cap are refused by name.
   */
  private applyChanged(frame: Extract<ContainerFrame, { type: "changed" }>): { awaited: Map<string, ChangedEntry[]>; refused: Refused[] } {
    const awaited = new Map<string, ChangedEntry[]>();
    const refused: Refused[] = [];
    for (const path of [...frame.deleted].sort()) {
      this.files.rm(`${WORKSPACE_ROOT}/${path}`, { recursive: true, force: true });
    }
    const entries = [...frame.entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const entry of entries) {
      const absolute = `${WORKSPACE_ROOT}/${entry.path}`;
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
      if (list === undefined) awaited.set(entry.hash, [entry]);
      else list.push(entry);
    }
    return { awaited, refused };
  }

  /** One row, whole. Synchronous by construction; keep it so. */
  private writeWhole(entry: ChangedEntry, bytes: Uint8Array): void {
    const absolute = `${WORKSPACE_ROOT}/${entry.path}`;
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
    this.expecting = null;
    pending?.reject(error);
  }

  private async receive(data: unknown): Promise<void> {
    try {
      if (typeof data === "string") {
        const frame = decodeFrame(data) as ContainerFrame;
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
        this.pending.bytes(bytes);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
