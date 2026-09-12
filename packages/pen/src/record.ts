/**
 * Fold phase 1: the record, the pasture's cache as one byte stream. It is
 * the agent's own format and nobody else reads it: every entry under the
 * disk, sorted by path, each a JSON line of its path, kind, mode, and size,
 * then that many bytes (a file's bytes, a symlink's target, nothing for a
 * directory). No mtime and no owner, and the keys in one order, so the same
 * tree is the same bytes and an install that changed nothing hashes the
 * same.
 *
 * It is written from a disk and read onto one as a stream: `writeRecord`
 * hands its bytes to a sink in order, `Chunker` cuts them into chunks of a
 * fixed size, and `RecordReader` takes chunks one at a time and writes each
 * entry as its last byte arrives. A file larger than a chunk is carried
 * across chunks; each side holds the one file it is on and the one chunk,
 * never the record.
 *
 * Fold phase 3: a chunk is gzipped where it is made and inflated where it
 * lands (`gzipBytes`, `gunzipBytes`, over `CompressionStream` and
 * `DecompressionStream`, which workerd and Node both have). The chunk's
 * hash stays over its plain bytes, so a zlib that packs differently moves
 * no identity and an unchanged install still hashes the same; what travels
 * and what the pasture's object holds is the deflated form.
 *
 * Fold phase 2: a file with two names is written once. When the disk says
 * two entries are one file (`DiskEntry.file`, a hard link; npm makes them
 * for an install's largest binaries), the first name in path order carries
 * the bytes and each later name is a `link` entry whose bytes are the first
 * name's path; the reader makes a hard link, or a copy on a disk that has
 * none. A disk that cannot say writes every name whole, as before, and the
 * same tree is still the same record: the inode is never in it.
 *
 * Spool phase 0: a file moves through this file, never into it. `writeRecord`
 * takes each file's size from the listing, writes the header from it, and
 * hands the sink slices of `CACHE_CHUNK_BYTES` read through a reading handle;
 * `RecordReader` opens a writing handle when a header lands and appends each
 * chunk's slice of the body until the last byte. Nothing here allocates a
 * file's size, a later name's copy included. The handles are optional on
 * `Disk`: a disk with neither is served by `read` and `write`, which is the
 * shape fold shipped and holds one whole file. The record's bytes do not
 * depend on how they were carried — the same tree is the same record either
 * way — and a file whose length disagrees with the header its listing gave
 * is a `RecordError`, so a save is refused rather than committed half true.
 */
import type { Disk, WriteHandle } from "./agent.ts";
import { CACHE_CHUNK_BYTES, type EntryKind } from "./protocol.ts";

/** A record's entry kinds: the disk's three, and `link`, a later name of a file an earlier entry wrote (fold phase 2). */
export type RecordKind = EntryKind | "link";

/** One entry's line, before its bytes. */
export interface RecordHeader {
  path: string;
  kind: RecordKind;
  mode: number;
  size: number;
}

/** What a record held: its file entries (a link is a file's name, and counts), and its bytes with the headers, which is what the cap measures and the object stores. */
export interface RecordCount {
  files: number;
  bytes: number;
}

/** A symlink's mode is not its own; the record says 0o777, as the cell's rows and the agent do. */
const SYMLINK_MODE = 0o777;
/** A line longer than this is not a header: a path is at most a few KiB on any disk the image has. */
const MAX_HEADER_BYTES = 64 * 1024;
const NEWLINE = 0x0a;
/** No body at all: a directory's, and what a file written through a handle keeps in place of one. */
const EMPTY = new Uint8Array(0);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A header as the record spells it: always these keys, in this order. */
function headerLine(header: RecordHeader): Uint8Array {
  return encoder.encode(`${JSON.stringify({ path: header.path, kind: header.kind, mode: header.mode, size: header.size })}\n`);
}

function byPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * The disk as a record, into `sink` in order. `max`, when given, is where
 * the writer stops: the count it returns is then over `max` and the sink
 * has had a prefix, which is all a caller needs to refuse it.
 *
 * Spool phase 0: a file's size comes from the listing, so the cap is asked
 * before the file is opened and a tree that cannot be kept costs no reading
 * at all; the bytes then go to the sink a slice at a time. A listing that
 * gives no size is counted in slices first, and the refusal comes at the
 * slice that crosses. Nothing of a file's size is allocated unless the disk
 * has no reading handle, which is the fallback.
 */
export async function writeRecord(disk: Disk, sink: (bytes: Uint8Array) => Promise<void>, options: { max?: number } = {}): Promise<RecordCount & { over: boolean }> {
  const entries = [...(await disk.list())].sort(byPath);
  const { max } = options;
  let files = 0;
  let bytes = 0;
  /** The first name, in path order, of each file the disk says has more than one. */
  const firstNames = new Map<string, string>();
  for (const entry of entries) {
    const first = entry.kind === "file" && entry.file !== undefined ? firstNames.get(entry.file) : undefined;
    if (entry.kind === "file" && entry.file !== undefined && first === undefined) firstNames.set(entry.file, entry.path);
    if (entry.kind === "file" && first === undefined) {
      // The one entry whose body is a file's bytes, and so the only one that can be large: its header from the listing's
      // size, the cap before the open, and then slices.
      const mode = entry.mode & 0o7777;
      const line = (size: number) => headerLine({ path: entry.path, kind: "file", mode, size });
      let size = entry.size;
      if (size === undefined) {
        // A listing that says no size: the file is counted as its slices arrive, and the cap crosses at one of them.
        const counted = await countFile(disk, entry.path, (running) => max !== undefined && bytes + line(running).byteLength + running > max);
        if (counted.over) return { files: files + 1, bytes: bytes + line(counted.size).byteLength + counted.size, over: true };
        size = counted.size;
      }
      files++;
      const header = line(size);
      bytes += header.byteLength + size;
      if (max !== undefined && bytes > max) return { files, bytes, over: true };
      await sink(header);
      await streamFile(disk, entry.path, size, sink);
      continue;
    }
    // Everything else: a path, a target, or nothing at all, and small by construction.
    let body: Uint8Array;
    let mode: number;
    let kind: RecordKind = entry.kind;
    if (first !== undefined) {
      // A later name of a file already in the record: its first name's path, not its bytes again.
      kind = "link";
      body = encoder.encode(first);
      mode = entry.mode & 0o7777;
      files++;
    } else if (entry.kind === "directory") {
      body = new Uint8Array(0);
      mode = entry.mode & 0o7777;
    } else {
      body = encoder.encode(await disk.readlink(entry.path));
      mode = SYMLINK_MODE;
    }
    const header = headerLine({ path: entry.path, kind, mode, size: body.byteLength });
    bytes += header.byteLength + body.byteLength;
    if (max !== undefined && bytes > max) return { files, bytes, over: true };
    await sink(header);
    if (body.byteLength > 0) await sink(body);
  }
  return { files, bytes, over: false };
}

/** A file's length is not what its header already said: the tree moved under the writer, and the record would be a lie. */
function lengthChanged(path: string, size: number, found: string): RecordError {
  return new RecordError(`a record's file ${path} is ${found}, not the ${size} bytes its listing said`);
}

/**
 * A file whose listing gave no size, read in slices and counted rather than
 * held. `crossed` is asked at each slice, and the read stops at the one that
 * crosses the cap: past it there is nothing to learn.
 */
async function countFile(disk: Disk, path: string, crossed: (size: number) => boolean): Promise<{ size: number; over: boolean }> {
  if (disk.openRead === undefined) {
    // The fallback: a disk with no handle can only say a size by handing over the bytes.
    const size = (await disk.read(path)).byteLength;
    return { size, over: crossed(size) };
  }
  const handle = await disk.openRead(path);
  let size = 0;
  try {
    for (;;) {
      const slice = await handle.read(CACHE_CHUNK_BYTES);
      if (slice.byteLength === 0) return { size, over: crossed(size) };
      size += slice.byteLength;
      if (crossed(size)) return { size, over: true };
    }
  } finally {
    await handle.close();
  }
}

/**
 * One file's bytes into the sink, a slice at a time, and exactly as many as
 * its header said: a file that shrank or grew since the listing is a
 * `RecordError`, and the save that was writing it is refused.
 */
async function streamFile(disk: Disk, path: string, size: number, sink: (bytes: Uint8Array) => Promise<void>): Promise<void> {
  if (disk.openRead === undefined) {
    // The fallback: the whole file, as fold read it.
    const body = await disk.read(path);
    if (body.byteLength !== size) throw lengthChanged(path, size, `${body.byteLength} bytes`);
    if (size > 0) await sink(body);
    return;
  }
  const handle = await disk.openRead(path);
  try {
    let read = 0;
    while (read < size) {
      const slice = await handle.read(Math.min(CACHE_CHUNK_BYTES, size - read));
      if (slice.byteLength === 0) throw lengthChanged(path, size, `${read} bytes`);
      read += slice.byteLength;
      await sink(slice);
    }
    // The file ends where its header says it does; one byte more is a file that grew while it was being written.
    if ((await handle.read(1)).byteLength > 0) throw lengthChanged(path, size, "longer");
  } finally {
    await handle.close();
  }
}

/**
 * Cuts a stream into chunks of `size` bytes, the last one shorter. Each
 * chunk is a fresh array handed to `onChunk` once full, so a caller may
 * keep it; nothing is emitted for an empty stream.
 */
export class Chunker {
  private readonly size: number;
  private readonly onChunk: (chunk: Uint8Array) => Promise<void>;
  private buffer: Uint8Array;
  private filled = 0;

  constructor(size: number, onChunk: (chunk: Uint8Array) => Promise<void>) {
    this.size = size;
    this.onChunk = onChunk;
    this.buffer = new Uint8Array(size);
  }

  async push(bytes: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const take = Math.min(this.size - this.filled, bytes.byteLength - offset);
      this.buffer.set(bytes.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.size) {
        const full = this.buffer;
        this.buffer = new Uint8Array(this.size);
        this.filled = 0;
        await this.onChunk(full);
      }
    }
  }

  async end(): Promise<void> {
    if (this.filled === 0) return;
    const last = this.buffer.slice(0, this.filled);
    this.filled = 0;
    await this.onChunk(last);
  }
}

/** Why a record could not be read: a header that is not one, a path that would leave the disk, or a stream cut inside an entry. */
export class RecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordError";
  }
}

/** A path the record may name: relative, `/`-separated, no empty, `.`, or `..` segment. */
function safePath(path: unknown): path is string {
  if (typeof path !== "string" || path === "" || path.includes("\0") || path.startsWith("/")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function parseHeader(bytes: Uint8Array): RecordHeader {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new RecordError("a record's header is not JSON");
  }
  const header = parsed as Partial<RecordHeader>;
  if (typeof parsed !== "object" || parsed === null) throw new RecordError("a record's header is not an object");
  if (!safePath(header.path)) throw new RecordError(`a record names a path it may not: ${JSON.stringify(header.path)}`);
  if (header.kind !== "file" && header.kind !== "directory" && header.kind !== "symlink" && header.kind !== "link") throw new RecordError(`a record's entry ${header.path} has no kind`);
  if (typeof header.mode !== "number" || !Number.isInteger(header.mode) || header.mode < 0 || header.mode > 0o7777) throw new RecordError(`a record's entry ${header.path} has no mode`);
  if (typeof header.size !== "number" || !Number.isInteger(header.size) || header.size < 0) throw new RecordError(`a record's entry ${header.path} has no size`);
  if (header.kind === "directory" && header.size !== 0) throw new RecordError(`a record's directory ${header.path} has bytes`);
  return { path: header.path, kind: header.kind, mode: header.mode, size: header.size };
}

/**
 * A record onto a disk, chunk by chunk. `push` takes the next chunk and
 * writes every entry whose last byte it carries; `end` says the stream is
 * over, fails when it ended inside an entry, and sets the directories'
 * modes, deepest first, so a read-only directory is filled before it is
 * made read-only. The disk is written as it arrives; emptying it first is
 * the caller's.
 *
 * Spool phase 0: a file's bytes go to a writing handle opened when its
 * header lands and closed at its last byte, so a file of many chunks costs
 * a chunk and not its size. A disk with no handle keeps fold's shape: the
 * body is buffered and written whole.
 */
export class RecordReader {
  private readonly disk: Disk;
  private headerParts: Uint8Array[] = [];
  private headerBytes = 0;
  private header: RecordHeader | null = null;
  private body: Uint8Array = new Uint8Array(0);
  /** The file the body is being appended to, when the disk opens one; `null` for every other kind and for a disk with no handle. */
  private writing: WriteHandle | null = null;
  /** Set by `abandon`: this reader is done, and a chunk pushed after it is a caller's mistake. */
  private abandoned = false;
  private filled = 0;
  private readonly directories: Array<{ path: string; mode: number }> = [];
  /** The files this record has written so far, which a `link` may name. */
  private readonly written = new Set<string>();
  private files = 0;
  private bytes = 0;

  constructor(disk: Disk) {
    this.disk = disk;
  }

  async push(chunk: Uint8Array): Promise<void> {
    if (this.abandoned) throw new RecordError("a chunk was pushed into a record's reader that was abandoned");
    this.bytes += chunk.byteLength;
    let offset = 0;
    while (offset < chunk.byteLength) {
      if (this.header === null) {
        const newline = chunk.indexOf(NEWLINE, offset);
        const end = newline < 0 ? chunk.byteLength : newline;
        this.headerParts.push(chunk.subarray(offset, end));
        this.headerBytes += end - offset;
        if (this.headerBytes > MAX_HEADER_BYTES) throw new RecordError("a record's header runs past any path");
        if (newline < 0) return;
        offset = newline + 1;
        this.header = parseHeader(concat(this.headerParts, this.headerBytes));
        this.headerParts = [];
        this.headerBytes = 0;
        // A file goes straight to a handle, with its mode at the open; a directory, a symlink, and a link are a path or
        // nothing, and are buffered as they always were.
        this.writing = this.header.kind === "file" && this.disk.openWrite !== undefined ? await this.disk.openWrite(this.header.path, this.header.mode) : null;
        this.body = this.writing === null ? new Uint8Array(this.header.size) : EMPTY;
        this.filled = 0;
        if (this.header.size === 0) await this.land();
        continue;
      }
      const take = Math.min(this.header.size - this.filled, chunk.byteLength - offset);
      if (this.writing !== null) await this.writing.append(chunk.subarray(offset, offset + take));
      else this.body.set(chunk.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.header.size) await this.land();
    }
  }

  /**
   * Spool phase 0: the record is not going to arrive, and this reader is
   * done. Whatever handle is open is closed, and nothing more may be pushed:
   * whoever drops a put-back calls this **before** it empties `/cache`, so
   * the unlink is not racing a descriptor and the file's blocks go with it.
   * An unlinked file with an open descriptor keeps its blocks until the
   * descriptor closes, and the agent is PID 1 and outlives the put-back.
   */
  async abandon(): Promise<void> {
    const writing = this.writing;
    this.writing = null;
    this.header = null;
    this.headerParts = [];
    this.headerBytes = 0;
    this.body = EMPTY;
    this.filled = 0;
    this.abandoned = true;
    await writing?.close();
  }

  /** The stream is over: every entry must be whole. Returns what was written. */
  async end(): Promise<RecordCount> {
    if (this.abandoned) throw new RecordError("the record's reader was abandoned");
    if (this.header !== null || this.headerBytes > 0) {
      // Half a file is on the disk: the reader is abandoned, handle and all, before the record is refused.
      await this.abandon();
      throw new RecordError("the record ended inside an entry");
    }
    for (const { path, mode } of [...this.directories].sort((a, b) => b.path.length - a.path.length)) await this.disk.chmod(path, mode);
    return { files: this.files, bytes: this.bytes };
  }

  private async land(): Promise<void> {
    const header = this.header!;
    const body = this.body;
    const writing = this.writing;
    this.header = null;
    this.body = EMPTY;
    this.writing = null;
    this.filled = 0;
    if (writing !== null) {
      // A file written through a handle: its last byte has arrived, and its mode was the open's.
      await writing.close();
      this.written.add(header.path);
      this.files++;
      return;
    }
    if (header.kind === "directory") {
      // Writable while it fills; its own mode at the end.
      await this.disk.mkdir(header.path, 0o755);
      this.directories.push({ path: header.path, mode: header.mode });
    } else if (header.kind === "symlink") {
      await this.disk.symlink(decoder.decode(body), header.path);
    } else if (header.kind === "link") {
      // A second name for a file this record already wrote, and for nothing else: a link cannot reach outside the record.
      const existing = decoder.decode(body);
      if (!this.written.has(existing)) throw new RecordError(`a record's link ${header.path} names a file it has not written: ${JSON.stringify(existing)}`);
      if (this.disk.link !== undefined) await this.disk.link(existing, header.path);
      else await copyFile(this.disk, existing, header.path, header.mode);
      this.written.add(header.path);
      this.files++;
    } else {
      await this.disk.write(header.path, body, { mode: header.mode });
      this.written.add(header.path);
      this.files++;
    }
  }
}

/**
 * A second name on a disk that cannot make a hard link: the earlier name's
 * file copied to the later one, in slices where the disk has handles and
 * whole where it has not. A link's body is a path, but the file it names can
 * be any size, so this is a path the record must stream too.
 */
async function copyFile(disk: Disk, existing: string, path: string, mode: number): Promise<void> {
  if (disk.openRead === undefined || disk.openWrite === undefined) {
    await disk.write(path, await disk.read(existing), { mode });
    return;
  }
  const from = await disk.openRead(existing);
  try {
    const to = await disk.openWrite(path, mode);
    try {
      for (;;) {
        const slice = await from.read(CACHE_CHUNK_BYTES);
        if (slice.byteLength === 0) break;
        await to.append(slice);
      }
    } finally {
      await to.close();
    }
  } finally {
    await from.close();
  }
}

function concat(parts: Uint8Array[], length: number): Uint8Array {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** One stream's bytes, read to the end and joined. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    length += value.byteLength;
  }
  return concat(parts, length);
}

/** Through one of the platform's transform streams, whole: what goes in is one write, what comes out is read to the end. */
async function through(bytes: Uint8Array, stream: { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const written = writer.write(bytes).then(() => writer.close());
  const [out] = await Promise.all([drain(stream.readable), written]);
  return out;
}

/** Fold phase 3: a chunk as it travels and as the object keeps it. */
export function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return through(bytes, new CompressionStream("gzip"));
}

/** The other way, before the hash is checked: the plain bytes are what a chunk's hash is over. */
export function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return through(bytes, new DecompressionStream("gzip"));
}

/** Removes everything under a disk's root, the root kept. */
export async function emptyDisk(disk: Disk): Promise<void> {
  for (const entry of await disk.list()) {
    if (!entry.path.includes("/")) await disk.remove(entry.path);
  }
}
