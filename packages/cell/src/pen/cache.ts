/**
 * Fold phase 1: the cell's side of the pasture's cache. The cell never
 * holds the cache: it passes chunks between the container's socket and the
 * pasture's object, one per `need`, holding one at a time, in both
 * directions. A Durable Object has 128 MB and a WebSocket's `send` has no
 * backpressure, so one at a time is the rule, not a tuning.
 *
 * Put back: `CacheRestore` rides the sync-in. `Checkout` sends its `ref`
 * in the manifest and hands it every `need` that names a chunk; it answers
 * one chunk per `need`, read from the object when asked, or `error {of:
 * "need"}` when the object no longer has it, which the agent takes as
 * "empty `/cache` and go cold". When the container says `checkout` the
 * restore says what came of it.
 *
 * Kept: `CacheSave` is a sync of its own on the socket, begun with
 * `cache {id}` after a setup that exited 0. The container describes
 * `/cache`; the same record as the one put back moves nothing, one over the
 * cap or empty is refused, and otherwise the chunks the object lacks are
 * asked for one `need` at a time, each put to the object as it arrives, and
 * the save committed in one call. `synced` ends it, whatever came of it.
 *
 * The seam with `checkout.ts`: the checkout owns the socket's frames during
 * a sync, so both halves run inside one of its syncs, over the
 * `SyncChannel` it lends them; everything they decide is here.
 */
import { CACHE_CHUNK_BYTES, type CacheRef, type CellFrame, type ContainerFrame, type NeedFrame, recordHashInput } from "@sheep/pen/protocol";
import type { CacheCommit, KeptCache } from "../pasture.ts";
import { hashBytes } from "../workspace/files.ts";

/** What the cell asks of the pasture's object for the cache; the `Pasture` stub is one, with `by` filled in by the cell (`cell.ts`). */
export interface CacheStore {
  cacheFor(key: string): Promise<KeptCache | undefined>;
  cacheChunk(hash: string): Promise<Uint8Array | undefined>;
  cacheMissing(save: string, hashes: string[]): Promise<string[]>;
  cachePut(save: string, hash: string, bytes: Uint8Array): Promise<void>;
  cacheCommit(save: string, commit: Omit<CacheCommit, "by">): Promise<KeptCache>;
}

/** What a sync lends the cache: the socket's two sends, and the one guard's announce and release by way of the checkout's own record. */
export interface SyncChannel {
  send(frame: CellFrame): void;
  sendBytes(bytes: Uint8Array): void;
  /** Registers that the bytes of this blob are next, with the socket's one guard. */
  expect(hash: string, size: number): void;
  /** The announced bytes arrived; the guard is free. */
  arrived(): void;
}

/** The container said something the cache's half of a sync does not allow. */
export class CacheProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CacheProtocolError";
  }
}

// ---------------------------------------------------------------------------
// Words, for the log and the birth.

/** A size as a person reads it: `148 MB`, decimal, as `du -h --si` and the design's line say it. */
export function cacheSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/** A `setup.sh` as the log names it: the first seven of its hash, as git names a commit. */
export function setupName(key: string): string {
  return `setup.sh ${key.slice(0, 7)}`;
}

/** The reason a setup's `/cache` is not kept when its environment held a sheep's own value; the log adds the names, never a value. */
export const OWN_SECRET_REFUSAL = "a secret of this sheep's own was in setup's environment";
/** The reason for a setup that left `/cache` empty: nothing to keep, and nothing to put back. */
export const EMPTY_REFUSAL = "setup left /cache empty";
/** The reason for a record over the cap. */
export function overCapRefusal(max: number): string {
  return `it was over the cap of ${cacheSize(max)}`;
}

// ---------------------------------------------------------------------------
// Put back.

/** How a put-back ended: the whole record written, or not, and why. */
export type RestoreEnd = { restored: true; ms: number } | { restored: false; reason: string };

/**
 * One put-back, for one sync-in. `has` says whether a `need` is the
 * cache's; `answer` gives it its one chunk; `finish` is called when the
 * container says `checkout`, and says whether the record was written.
 */
export class CacheRestore {
  readonly kept: KeptCache;
  private readonly store: Pick<CacheStore, "cacheChunk">;
  private readonly chunks: Set<string>;
  private readonly now: () => number;
  private served = 0;
  private started: number | undefined;
  private lost: string | undefined;

  constructor(kept: KeptCache, store: Pick<CacheStore, "cacheChunk">, now: () => number = Date.now) {
    this.kept = kept;
    this.store = store;
    this.chunks = new Set(kept.chunks);
    this.now = now;
  }

  /** The record as the manifest carries it. */
  get ref(): CacheRef {
    return { hash: this.kept.hash, chunks: this.kept.chunks };
  }

  /** Whether a `need` asks for the cache: it names one of its chunks. */
  has(frame: NeedFrame): boolean {
    return frame.hashes.some((hash) => this.chunks.has(hash));
  }

  /**
   * One chunk for one `need`: read from the object now and sent, the only
   * chunk this cell holds while it is in flight. A `need` naming two, or a
   * chunk beside a file, is refused: one per `need` is the protocol. A
   * chunk the object no longer has is the cache moving under the put-back,
   * and the agent is told so, not the sync failed.
   */
  async answer(frame: NeedFrame, channel: SyncChannel): Promise<void> {
    if (frame.hashes.length !== 1) throw new CacheProtocolError(`a need for the cache names one chunk; ${frame.id} named ${frame.hashes.length} hashes`);
    const hash = frame.hashes[0]!;
    this.started ??= this.now();
    const bytes = await this.store.cacheChunk(hash);
    if (bytes === undefined) {
      this.lost = `the pasture no longer has chunk ${hash.slice(0, 12)} of the cache it was putting back; it changed during the put-back`;
      channel.send({ type: "error", code: "refused", of: "need", id: frame.id, message: this.lost });
      return;
    }
    channel.send({ type: "blob", hash, size: bytes.byteLength });
    channel.sendBytes(bytes);
    this.served++;
  }

  /** How the put-back ended, once the container said `checkout`; `undefined` before, or when the sync-in failed. */
  ended: RestoreEnd | undefined;

  /** The container said `checkout`: the record is on its disk when every chunk was served and none was lost. */
  finish(): RestoreEnd {
    if (this.lost !== undefined) this.ended = { restored: false, reason: this.lost };
    else if (this.served < this.kept.chunks.length) this.ended = { restored: false, reason: `the container asked for ${this.served} of the cache's ${this.kept.chunks.length} chunks` };
    else this.ended = { restored: true, ms: this.started === undefined ? 0 : this.now() - this.started };
    return this.ended;
  }
}

// ---------------------------------------------------------------------------
// Kept.

export interface CacheSaveRequest {
  /** The `setup.sh` whose run left `/cache`: the save's key. */
  key: string;
  /** The record put back into this container, when one was: the same hash again moves nothing. */
  putBack?: string;
  /** The cap: a record over it is not kept. */
  max: number;
  /** A fresh id for this save, which the object's claims are made under. */
  save: string;
  store: Omit<CacheStore, "cacheFor" | "cacheChunk">;
}

/** What a save came to: the description, and the commit or why there was none. */
export type CacheSaved =
  | { described: { hash: string; chunks: string[]; files: number; bytes: number }; kept: KeptCache; sent: number }
  | { described: { hash: string; chunks: string[]; files: number; bytes: number }; unchanged: true }
  | { described: { hash: string; chunks: string[]; files: number; bytes: number }; refused: string };

/**
 * One save as a sync: `frame` and `bytes` are the checkout's `Pending`
 * for it. Begun by the checkout sending `cache {id, max}`; ended by
 * `synced`, then `resolve`.
 */
export class CacheSave {
  private readonly id: string;
  private readonly request: CacheSaveRequest;
  private readonly channel: SyncChannel;
  private readonly resolve: (saved: CacheSaved) => void;
  private described: Extract<ContainerFrame, { type: "cache" }> | null = null;
  /** The chunks still to ask for, in order; the first is the one asked for now. */
  private wanted: string[] = [];
  /** The chunk whose `blob` is awaited, once its frame came. */
  private announced: { hash: string; size: number } | null = null;
  private sent = 0;

  constructor(id: string, request: CacheSaveRequest, channel: SyncChannel, resolve: (saved: CacheSaved) => void) {
    this.id = id;
    this.request = request;
    this.channel = channel;
    this.resolve = resolve;
  }

  /** The frame that begins it. */
  get begin(): CellFrame {
    return { type: "cache", id: this.id, max: this.request.max };
  }

  async frame(frame: ContainerFrame): Promise<void> {
    if (this.described === null) {
      if (frame.type !== "cache" || frame.id !== this.id) throw new CacheProtocolError(`expected cache ${this.id}, got ${frame.type}`);
      await this.onDescribed(frame);
      return;
    }
    if (frame.type === "blob") {
      if (this.announced !== null || frame.hash !== this.wanted[0]) throw new CacheProtocolError(`the container sent chunk ${frame.hash}, which was not asked for`);
      if (frame.size > CACHE_CHUNK_BYTES) throw new CacheProtocolError(`chunk ${frame.hash} is ${frame.size} bytes, over a chunk`);
      this.channel.expect(frame.hash, frame.size);
      this.announced = { hash: frame.hash, size: frame.size };
      return;
    }
    throw new CacheProtocolError(`unexpected ${frame.type} frame during cache ${this.id}`);
  }

  async bytes(bytes: Uint8Array): Promise<void> {
    const announced = this.announced;
    this.announced = null;
    this.channel.arrived();
    if (announced === null) throw new CacheProtocolError("bytes with no chunk frame before them");
    if (bytes.byteLength !== announced.size) throw new CacheProtocolError(`chunk ${announced.hash} announced ${announced.size} bytes and carried ${bytes.byteLength}`);
    const hash = hashBytes(bytes);
    if (hash !== announced.hash) throw new CacheProtocolError(`chunk ${announced.hash} hashes to ${hash}; nothing kept`);
    // Passed on and let go: the object has it before the next is asked for.
    await this.request.store.cachePut(this.request.save, hash, bytes);
    this.sent++;
    this.wanted.shift();
    await this.next();
  }

  private async onDescribed(frame: Extract<ContainerFrame, { type: "cache" }>): Promise<void> {
    this.described = frame;
    const described = { hash: frame.hash, chunks: frame.chunks, files: frame.files, bytes: frame.bytes };
    if (frame.bytes > this.request.max) return this.end({ described, refused: overCapRefusal(this.request.max) });
    if (frame.chunks.length === 0) return this.end({ described, refused: EMPTY_REFUSAL });
    if (hashBytes(new TextEncoder().encode(recordHashInput(frame.chunks))) !== frame.hash) throw new CacheProtocolError(`the cache ${frame.hash} is not the record of its chunks`);
    // Setup changed nothing: the record put back is the record left, and nothing moves.
    if (this.request.putBack === frame.hash) return this.end({ described, unchanged: true });
    this.wanted = await this.request.store.cacheMissing(this.request.save, frame.chunks);
    await this.next();
  }

  /** The next chunk, alone in its `need`; or, with none left, the commit. */
  private async next(): Promise<void> {
    const hash = this.wanted[0];
    if (hash !== undefined) {
      this.channel.send({ type: "need", id: this.id, hashes: [hash] });
      return;
    }
    const frame = this.described!;
    const kept = await this.request.store.cacheCommit(this.request.save, { key: this.request.key, hash: frame.hash, chunks: frame.chunks, files: frame.files, bytes: frame.bytes });
    this.end({ described: { hash: frame.hash, chunks: frame.chunks, files: frame.files, bytes: frame.bytes }, kept, sent: this.sent });
  }

  private end(saved: CacheSaved): void {
    this.channel.send({ type: "synced", id: this.id, refused: [] });
    this.resolve(saved);
  }
}
