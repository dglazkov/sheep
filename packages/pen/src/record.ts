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
 * Fold phase 2: a file with two names is written once. When the disk says
 * two entries are one file (`DiskEntry.file`, a hard link; npm makes them
 * for an install's largest binaries), the first name in path order carries
 * the bytes and each later name is a `link` entry whose bytes are the first
 * name's path; the reader makes a hard link, or a copy on a disk that has
 * none. A disk that cannot say writes every name whole, as before, and the
 * same tree is still the same record: the inode is never in it.
 */
import type { Disk } from "./agent.ts";
import type { EntryKind } from "./protocol.ts";

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
 */
export async function writeRecord(disk: Disk, sink: (bytes: Uint8Array) => Promise<void>, options: { max?: number } = {}): Promise<RecordCount & { over: boolean }> {
  const entries = [...(await disk.list())].sort(byPath);
  let files = 0;
  let bytes = 0;
  const over = () => options.max !== undefined && bytes > options.max;
  /** The first name, in path order, of each file the disk says has more than one. */
  const firstNames = new Map<string, string>();
  for (const entry of entries) {
    let body: Uint8Array;
    let mode: number;
    let kind: RecordKind = entry.kind;
    const first = entry.kind === "file" && entry.file !== undefined ? firstNames.get(entry.file) : undefined;
    if (entry.kind === "file" && entry.file !== undefined && first === undefined) firstNames.set(entry.file, entry.path);
    if (first !== undefined) {
      // A later name of a file already in the record: its first name's path, not its bytes again.
      kind = "link";
      body = encoder.encode(first);
      mode = entry.mode & 0o7777;
      files++;
    } else if (entry.kind === "directory") {
      body = new Uint8Array(0);
      mode = entry.mode & 0o7777;
    } else if (entry.kind === "symlink") {
      body = encoder.encode(await disk.readlink(entry.path));
      mode = SYMLINK_MODE;
    } else {
      body = await disk.read(entry.path);
      mode = entry.mode & 0o7777;
      files++;
    }
    const line = headerLine({ path: entry.path, kind, mode, size: body.byteLength });
    bytes += line.byteLength + body.byteLength;
    if (over()) return { files, bytes, over: true };
    await sink(line);
    if (body.byteLength > 0) await sink(body);
  }
  return { files, bytes, over: false };
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
 */
export class RecordReader {
  private readonly disk: Disk;
  private headerParts: Uint8Array[] = [];
  private headerBytes = 0;
  private header: RecordHeader | null = null;
  private body: Uint8Array = new Uint8Array(0);
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
        this.body = new Uint8Array(this.header.size);
        this.filled = 0;
        if (this.header.size === 0) await this.land();
        continue;
      }
      const take = Math.min(this.header.size - this.filled, chunk.byteLength - offset);
      this.body.set(chunk.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.header.size) await this.land();
    }
  }

  /** The stream is over: every entry must be whole. Returns what was written. */
  async end(): Promise<RecordCount> {
    if (this.header !== null || this.headerBytes > 0) throw new RecordError("the record ended inside an entry");
    for (const { path, mode } of [...this.directories].sort((a, b) => b.path.length - a.path.length)) await this.disk.chmod(path, mode);
    return { files: this.files, bytes: this.bytes };
  }

  private async land(): Promise<void> {
    const header = this.header!;
    const body = this.body;
    this.header = null;
    this.body = new Uint8Array(0);
    this.filled = 0;
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
      else await this.disk.write(header.path, await this.disk.read(existing), { mode: header.mode });
      this.written.add(header.path);
      this.files++;
    } else {
      await this.disk.write(header.path, body, { mode: header.mode });
      this.written.add(header.path);
      this.files++;
    }
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

/** Removes everything under a disk's root, the root kept. */
export async function emptyDisk(disk: Disk): Promise<void> {
  for (const entry of await disk.list()) {
    if (!entry.path.includes("/")) await disk.remove(entry.path);
  }
}
