/**
 * The workspace: one table in the cell's SQLite, one row per file,
 * directory, or symlink. Everything that touches files in the cell goes
 * through this class, synchronously, because the cell's SQL is synchronous
 * and a single-threaded object needs no locking. The two async faces over
 * it, pi's `FileSystem` and just-bash's `IFileSystem`, live beside it.
 */
import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { ManifestEntry } from "@lamb/pen/protocol";

export type FileKind = "file" | "directory" | "symlink";

export interface FileRow {
  path: string;
  kind: FileKind;
  /** File bytes, or a symlink's target as UTF-8. Empty for directories. */
  content: Uint8Array;
  size: number;
  mtimeMs: number;
  mode: number;
  /** SHA-256 of the whole content (chunks included), lowercase hex. `null` for a directory. */
  hash: string | null;
}

/** The content hash pen syncs by: SHA-256 over the bytes, lowercase hex. Synchronous, as the table is. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The roots the workspace fence allows. `/` itself is readable and lists them. */
export const WORKSPACE_ROOT = "/workspace";
export const TEMP_ROOT = "/tmp";
/**
 * A Durable Object value is capped at 2 MB, so a file is stored in chunks
 * of one MiB: the first in the file's row, the rest in `file_chunks`.
 * The per-file limit is the workspace's own, so a clone that would not fit
 * is refused whole rather than stored halfway.
 */
export const CHUNK_BYTES = 1024 * 1024;
export const MAX_FILE_BYTES = 8 * CHUNK_BYTES;

export type FsErrorCode = "ENOENT" | "EEXIST" | "ENOTDIR" | "EISDIR" | "ENOTEMPTY" | "EACCES" | "EFBIG" | "ELOOP" | "EINVAL";

/** Node-shaped so just-bash's commands read `code` as they would from `node:fs`. */
export class FsError extends Error {
  constructor(
    readonly code: FsErrorCode,
    syscall: string,
    readonly path: string,
    detail?: string,
  ) {
    super(`${code}: ${detail ?? describe(code)}, ${syscall} '${path}'`);
    this.name = "FsError";
    (this as { syscall?: string }).syscall = syscall;
    (this as { errno?: number }).errno = -1;
  }
}

function describe(code: FsErrorCode): string {
  switch (code) {
    case "ENOENT": return "no such file or directory";
    case "EEXIST": return "file already exists";
    case "ENOTDIR": return "not a directory";
    case "EISDIR": return "illegal operation on a directory";
    case "ENOTEMPTY": return "directory not empty";
    case "EACCES": return "permission denied";
    case "EFBIG": return "file too large";
    case "ELOOP": return "too many levels of symbolic links";
    case "EINVAL": return "invalid argument";
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Absolute, normalized, no trailing slash except for the root. */
export function normalizePath(path: string): string {
  if (path.includes("\0")) throw new FsError("EINVAL", "open", path, "path contains null byte");
  const absolute = posix.normalize(path.startsWith("/") ? path : `/${path}`);
  return absolute.length > 1 && absolute.endsWith("/") ? absolute.slice(0, -1) : absolute;
}

export function parentOf(path: string): string {
  return posix.dirname(path);
}

function isUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** Whether the fence allows writing here. Reads are allowed at `/` too. */
export function isWritable(path: string): boolean {
  return isUnder(path, WORKSPACE_ROOT) || isUnder(path, TEMP_ROOT);
}

export function isReadable(path: string): boolean {
  return path === "/" || isWritable(path);
}

type Row = {
  path: string;
  kind: FileKind;
  content: ArrayBuffer | null;
  size: number;
  mtime_ms: number;
  mode: number;
  hash: string | null;
};

const MAX_SYMLINK_DEPTH = 32;

export class FilesTable {
  constructor(
    private readonly sql: SqlStorage,
    private readonly now: () => number = Date.now,
  ) {}

  /** Creates the table and the roots, and brings an older table up to date. Idempotent; run on every construction. */
  init(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS files (
      path     TEXT PRIMARY KEY,
      kind     TEXT NOT NULL,
      content  BLOB,
      size     INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      mode     INTEGER NOT NULL DEFAULT 420,
      hash     TEXT
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS file_chunks (
      path    TEXT NOT NULL,
      idx     INTEGER NOT NULL,
      content BLOB NOT NULL,
      PRIMARY KEY (path, idx)
    )`);
    this.migrateHashes();
    for (const root of ["/", WORKSPACE_ROOT, TEMP_ROOT]) {
      if (this.get(root) === undefined) this.insertDirectory(root, 0o755);
    }
  }

  /**
   * A table from before pen has no `hash` column. Add it, then hash every
   * file and symlink row that has none, one row at a time: the cell's SQL
   * binds few variables and this runs once per cell.
   */
  private migrateHashes(): void {
    const columns = this.sql.exec<{ name: string }>("PRAGMA table_info(files)").toArray().map((column) => column.name);
    if (!columns.includes("hash")) this.sql.exec("ALTER TABLE files ADD COLUMN hash TEXT");
    const unhashed = this.sql.exec<{ path: string }>("SELECT path FROM files WHERE hash IS NULL AND kind != 'directory' ORDER BY path").toArray();
    for (const { path } of unhashed) {
      const row = this.get(path);
      if (row === undefined) continue;
      this.sql.exec("UPDATE files SET hash = ? WHERE path = ?", hashBytes(this.assemble(row)), path);
    }
  }

  /**
   * The workspace as pen's manifest: every row under `/workspace`, the root
   * itself and `/tmp` excluded, sorted by path, paths relative to the root.
   * One query; the hash column is what makes it one.
   */
  manifest(): ManifestEntry[] {
    const prefix = `${WORKSPACE_ROOT}/`;
    return this.sql
      .exec<{ path: string; kind: FileKind; mode: number; hash: string | null }>(
        "SELECT substr(path, ?) AS path, kind, mode, hash FROM files WHERE substr(path, 1, ?) = ? ORDER BY files.path",
        prefix.length + 1,
        prefix.length,
        prefix,
      )
      .toArray()
      .map((row) => ({ path: row.path, kind: row.kind, mode: row.mode, hash: row.kind === "directory" ? null : row.hash }));
  }

  /** The whole content of a file row, its later chunks joined on. */
  private assemble(row: FileRow): Uint8Array {
    if (row.kind !== "file" || row.size <= row.content.byteLength) return row.content;
    const out = new Uint8Array(row.size);
    out.set(row.content, 0);
    let offset = row.content.byteLength;
    for (const chunk of this.sql.exec<{ content: ArrayBuffer }>("SELECT content FROM file_chunks WHERE path = ? ORDER BY idx", row.path).toArray()) {
      const bytes = new Uint8Array(chunk.content);
      out.set(bytes, offset);
      offset += bytes.byteLength;
    }
    return out;
  }

  get(path: string): FileRow | undefined {
    const row = this.sql.exec<Row>("SELECT * FROM files WHERE path = ?", path).toArray()[0];
    return row === undefined ? undefined : toFileRow(row);
  }

  /** Follows symlinks through every component. Throws ENOENT/ELOOP/ENOTDIR. */
  resolve(path: string, followFinal = true): string {
    let resolved = "/";
    const parts = normalizePath(path).split("/").filter(Boolean);
    let hops = 0;
    for (let index = 0; index < parts.length; index++) {
      const candidate = posix.join(resolved, parts[index]!);
      const row = this.get(candidate);
      if (row === undefined) {
        // Resolved as far as it exists; the rest is what a write would create.
        const rest = parts.slice(index + 1).join("/");
        return rest ? posix.join(candidate, rest) : candidate;
      }
      const isFinal = index === parts.length - 1;
      if (row.kind === "symlink" && (followFinal || !isFinal)) {
        if (++hops > MAX_SYMLINK_DEPTH) throw new FsError("ELOOP", "stat", normalizePath(path));
        const target = decoder.decode(row.content);
        const absoluteTarget = target.startsWith("/") ? target : posix.join(posix.dirname(candidate), target);
        const rest = parts.slice(index + 1).join("/");
        const relinked = rest ? posix.join(absoluteTarget, rest) : absoluteTarget;
        return this.resolve(relinked, followFinal);
      }
      if (!isFinal && row.kind !== "directory") throw new FsError("ENOTDIR", "stat", normalizePath(path));
      resolved = candidate;
    }
    return resolved;
  }

  stat(path: string, followSymlinks = true): FileRow {
    const target = this.resolve(path, followSymlinks);
    const row = this.get(target);
    if (row === undefined) throw new FsError("ENOENT", "stat", normalizePath(path));
    return row;
  }

  exists(path: string): boolean {
    try {
      this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  readFile(path: string): Uint8Array {
    const row = this.stat(path);
    if (row.kind === "directory") throw new FsError("EISDIR", "read", normalizePath(path));
    return this.assemble(row);
  }

  readText(path: string): string {
    return decoder.decode(this.readFile(path));
  }

  writeFile(path: string, content: string | Uint8Array, options: { createParents?: boolean; mode?: number } = {}): void {
    const bytes = typeof content === "string" ? encoder.encode(content) : content;
    const target = this.prepareWrite(path, options.createParents ?? false);
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new FsError("EFBIG", "write", target, `file exceeds the per-file limit of ${MAX_FILE_BYTES} bytes`);
    }
    const existing = this.get(target);
    const mode = options.mode ?? existing?.mode ?? 0o644;
    const head = bytes.subarray(0, CHUNK_BYTES);
    this.sql.exec(
      "INSERT INTO files (path, kind, content, size, mtime_ms, mode, hash) VALUES (?, 'file', ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET kind = 'file', content = excluded.content, size = excluded.size, mtime_ms = excluded.mtime_ms, hash = excluded.hash",
      target,
      head,
      bytes.byteLength,
      this.now(),
      mode,
      hashBytes(bytes),
    );
    this.sql.exec("DELETE FROM file_chunks WHERE path = ?", target);
    for (let offset = CHUNK_BYTES, index = 1; offset < bytes.byteLength; offset += CHUNK_BYTES, index++) {
      this.sql.exec("INSERT INTO file_chunks (path, idx, content) VALUES (?, ?, ?)", target, index, bytes.subarray(offset, offset + CHUNK_BYTES));
    }
  }

  appendFile(path: string, content: string | Uint8Array, options: { createParents?: boolean } = {}): void {
    const bytes = typeof content === "string" ? encoder.encode(content) : content;
    const target = this.prepareWrite(path, options.createParents ?? false);
    const existing = this.get(target);
    if (existing === undefined) {
      this.writeFile(target, bytes, options);
      return;
    }
    const current = this.assemble(existing);
    const joined = new Uint8Array(current.byteLength + bytes.byteLength);
    joined.set(current, 0);
    joined.set(bytes, current.byteLength);
    this.writeFile(target, joined, options);
  }

  mkdir(path: string, options: { recursive?: boolean; mode?: number } = {}): void {
    const target = normalizePath(path);
    this.assertWritable(target, "mkdir");
    const existing = this.get(target);
    if (existing !== undefined) {
      if (options.recursive && existing.kind === "directory") return;
      throw new FsError(existing.kind === "directory" ? "EEXIST" : "EEXIST", "mkdir", target, existing.kind === "directory" ? "directory already exists" : undefined);
    }
    const parent = parentOf(target);
    const parentRow = this.get(parent);
    if (parentRow === undefined) {
      if (!options.recursive) throw new FsError("ENOENT", "mkdir", target);
      this.mkdir(parent, options);
    } else if (parentRow.kind !== "directory") {
      throw new FsError("ENOTDIR", "mkdir", target);
    }
    this.insertDirectory(target, options.mode ?? 0o755);
  }

  /** Direct children, by name, sorted. */
  readdir(path: string): FileRow[] {
    const dir = this.stat(path);
    if (dir.kind !== "directory") throw new FsError("ENOTDIR", "scandir", normalizePath(path));
    const prefix = dir.path === "/" ? "/" : `${dir.path}/`;
    return this.sql
      .exec<Row>(
        "SELECT * FROM files WHERE substr(path, 1, ?) = ? AND length(path) > ? AND instr(substr(path, ?), '/') = 0 ORDER BY path",
        prefix.length,
        prefix,
        prefix.length,
        prefix.length + 1,
      )
      .toArray()
      .map(toFileRow);
  }

  /** Every row under a directory, the directory excluded, deepest last. */
  descendants(path: string): FileRow[] {
    const prefix = path === "/" ? "/" : `${path}/`;
    return this.sql
      .exec<Row>("SELECT * FROM files WHERE substr(path, 1, ?) = ? AND length(path) > ? ORDER BY path", prefix.length, prefix, prefix.length)
      .toArray()
      .map(toFileRow);
  }

  rm(path: string, options: { recursive?: boolean; force?: boolean } = {}): void {
    const target = normalizePath(path);
    this.assertWritable(target, "rm");
    const row = this.get(target);
    if (row === undefined) {
      if (options.force) return;
      throw new FsError("ENOENT", "rm", target);
    }
    if (row.kind === "directory") {
      const children = this.readdir(target);
      if (children.length > 0 && !options.recursive) throw new FsError("ENOTEMPTY", "rm", target);
      if (!options.recursive) throw new FsError("EISDIR", "rm", target);
      this.sql.exec("DELETE FROM files WHERE substr(path, 1, ?) = ?", target.length + 1, `${target}/`);
      this.sql.exec("DELETE FROM file_chunks WHERE substr(path, 1, ?) = ?", target.length + 1, `${target}/`);
    }
    this.sql.exec("DELETE FROM files WHERE path = ?", target);
    this.sql.exec("DELETE FROM file_chunks WHERE path = ?", target);
  }

  rename(source: string, destination: string): void {
    const from = normalizePath(source);
    const to = normalizePath(destination);
    this.assertWritable(from, "rename");
    this.assertWritable(to, "rename");
    const row = this.get(from);
    if (row === undefined) throw new FsError("ENOENT", "rename", from);
    if (from === to) return;
    const parent = this.get(parentOf(to));
    if (parent === undefined) throw new FsError("ENOENT", "rename", to);
    if (parent.kind !== "directory") throw new FsError("ENOTDIR", "rename", to);
    const existing = this.get(to);
    if (existing !== undefined) {
      if (existing.kind === "directory") {
        if (row.kind !== "directory") throw new FsError("EISDIR", "rename", to);
        if (this.readdir(to).length > 0) throw new FsError("ENOTEMPTY", "rename", to);
      } else if (row.kind === "directory") {
        throw new FsError("ENOTDIR", "rename", to);
      }
      this.sql.exec("DELETE FROM files WHERE path = ?", to);
      this.sql.exec("DELETE FROM file_chunks WHERE path = ?", to);
    }
    if (row.kind === "directory") {
      if (to.startsWith(`${from}/`)) throw new FsError("EINVAL", "rename", to);
      const prefix = `${from}/`;
      for (const table of ["files", "file_chunks"]) {
        this.sql.exec(
          `UPDATE ${table} SET path = ? || substr(path, ?) WHERE substr(path, 1, ?) = ?`,
          `${to}/`,
          prefix.length + 1,
          prefix.length,
          prefix,
        );
      }
    }
    this.sql.exec("UPDATE files SET path = ? WHERE path = ?", to, from);
    this.sql.exec("UPDATE file_chunks SET path = ? WHERE path = ?", to, from);
  }

  symlink(target: string, linkPath: string): void {
    const link = this.prepareWrite(linkPath, false);
    if (this.get(link) !== undefined) throw new FsError("EEXIST", "symlink", link);
    const bytes = encoder.encode(target);
    this.sql.exec(
      "INSERT INTO files (path, kind, content, size, mtime_ms, mode, hash) VALUES (?, 'symlink', ?, ?, ?, ?, ?)",
      link,
      bytes,
      bytes.byteLength,
      this.now(),
      0o777,
      hashBytes(bytes),
    );
  }

  readlink(path: string): string {
    const target = normalizePath(path);
    const row = this.get(target);
    if (row === undefined) throw new FsError("ENOENT", "readlink", target);
    if (row.kind !== "symlink") throw new FsError("EINVAL", "readlink", target);
    return decoder.decode(row.content);
  }

  chmod(path: string, mode: number): void {
    const target = this.resolve(path);
    if (this.get(target) === undefined) throw new FsError("ENOENT", "chmod", target);
    this.sql.exec("UPDATE files SET mode = ? WHERE path = ?", mode & 0o7777, target);
  }

  utimes(path: string, mtimeMs: number): void {
    const target = this.resolve(path);
    if (this.get(target) === undefined) throw new FsError("ENOENT", "utimes", target);
    this.sql.exec("UPDATE files SET mtime_ms = ? WHERE path = ?", Math.floor(mtimeMs), target);
  }

  allPaths(): string[] {
    return this.sql.exec<{ path: string }>("SELECT path FROM files ORDER BY path").toArray().map((row) => row.path);
  }

  /** Empties a root's contents, keeping the root. Used for `/tmp` when the lane idles. */
  truncate(root: string): void {
    this.sql.exec("DELETE FROM files WHERE substr(path, 1, ?) = ?", root.length + 1, `${root}/`);
    this.sql.exec("DELETE FROM file_chunks WHERE substr(path, 1, ?) = ?", root.length + 1, `${root}/`);
  }

  private prepareWrite(path: string, createParents: boolean): string {
    const target = this.resolve(path);
    this.assertWritable(target, "open");
    const existing = this.get(target);
    if (existing?.kind === "directory") throw new FsError("EISDIR", "open", target);
    const parent = parentOf(target);
    const parentRow = this.get(parent);
    if (parentRow === undefined) {
      if (!createParents) throw new FsError("ENOENT", "open", target);
      this.mkdir(parent, { recursive: true });
    } else if (parentRow.kind !== "directory") {
      throw new FsError("ENOTDIR", "open", target);
    }
    return target;
  }

  private assertWritable(path: string, syscall: string): void {
    if (!isWritable(path)) {
      throw new FsError("EACCES", syscall, path, `outside ${WORKSPACE_ROOT} and ${TEMP_ROOT}`);
    }
  }

  private insertDirectory(path: string, mode: number): void {
    this.sql.exec(
      "INSERT INTO files (path, kind, content, size, mtime_ms, mode, hash) VALUES (?, 'directory', NULL, 0, ?, ?, NULL)",
      path,
      this.now(),
      mode,
    );
  }
}

function toFileRow(row: Row): FileRow {
  return {
    path: row.path,
    kind: row.kind,
    content: row.content === null ? new Uint8Array() : new Uint8Array(row.content),
    size: row.size,
    mtimeMs: row.mtime_ms,
    mode: row.mode,
    hash: row.hash,
  };
}
