/**
 * just-bash's `IFileSystem` over the workspace table. Every method is a
 * thin async wrapper around the synchronous table so `cat`, `sed -i`,
 * `find`, and the rest see exactly the rows pi's `write` tool wrote.
 */
import type { BufferEncoding, CpOptions, FileContent, FsStat, IFileSystem, MkdirOptions, RmOptions } from "just-bash/browser";
import { posix } from "node:path";
import { type FileRow, FilesTable, FsError, normalizePath } from "./files.ts";

type ReadFileOptions = { encoding?: BufferEncoding | null };
type WriteFileOptions = { encoding?: BufferEncoding };
type DirentEntry = { name: string; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean };

const utf8 = new TextDecoder();
const latin1 = new TextDecoder("latin1");

function encodingOf(options: ReadFileOptions | WriteFileOptions | BufferEncoding | undefined): BufferEncoding | null | undefined {
  return typeof options === "string" ? (options as BufferEncoding) : options?.encoding;
}

function decode(bytes: Uint8Array, encoding: BufferEncoding | null | undefined): string {
  switch (encoding) {
    case "binary":
    case "latin1":
      return latin1.decode(bytes);
    case "base64":
      return btoa(String.fromCharCode(...bytes));
    case "hex":
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    case "ascii":
    case "utf8":
    case "utf-8":
    case null:
    case undefined:
      return utf8.decode(bytes);
  }
}

function encode(content: FileContent, encoding: BufferEncoding | null | undefined): Uint8Array {
  if (typeof content !== "string") return content;
  switch (encoding) {
    case "binary":
    case "latin1":
      return Uint8Array.from(content, (char) => char.charCodeAt(0) & 0xff);
    case "base64":
      return Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
    case "hex": {
      const bytes = new Uint8Array(content.length / 2);
      for (let index = 0; index < bytes.length; index++) bytes[index] = parseInt(content.slice(index * 2, index * 2 + 2), 16);
      return bytes;
    }
    default:
      return new TextEncoder().encode(content);
  }
}

function toStat(row: FileRow): FsStat {
  return {
    isFile: row.kind === "file",
    isDirectory: row.kind === "directory",
    isSymbolicLink: row.kind === "symlink",
    mode: row.mode | (row.kind === "directory" ? 0o040000 : row.kind === "symlink" ? 0o120000 : 0o100000),
    size: row.size,
    mtime: new Date(row.mtimeMs),
    identity: row.path,
  };
}

export class CellFs implements IFileSystem {
  constructor(readonly files: FilesTable) {}

  async readFile(path: string, options?: ReadFileOptions | BufferEncoding): Promise<string> {
    return decode(this.files.readFile(path), encodingOf(options));
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.files.readFile(path);
  }

  async writeFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding): Promise<void> {
    this.files.writeFile(path, encode(content, encodingOf(options)));
  }

  async appendFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding): Promise<void> {
    this.files.appendFile(path, encode(content, encodingOf(options)));
  }

  async exists(path: string): Promise<boolean> {
    return this.files.exists(path);
  }

  async stat(path: string): Promise<FsStat> {
    return toStat(this.files.stat(path, true));
  }

  async lstat(path: string): Promise<FsStat> {
    return toStat(this.files.stat(path, false));
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    this.files.mkdir(path, { recursive: options?.recursive ?? false });
  }

  async readdir(path: string): Promise<string[]> {
    return this.files.readdir(path).map((row) => posix.basename(row.path));
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    return this.files.readdir(path).map((row) => ({
      name: posix.basename(row.path),
      isFile: row.kind === "file",
      isDirectory: row.kind === "directory",
      isSymbolicLink: row.kind === "symlink",
    }));
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    this.files.rm(path, { recursive: options?.recursive ?? false, force: options?.force ?? false });
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const source = this.files.stat(src, false);
    let target = normalizePath(dest);
    const existing = this.files.get(target);
    if (existing?.kind === "directory") target = posix.join(target, posix.basename(source.path));
    if (source.kind === "directory") {
      if (!options?.recursive) throw new FsError("EISDIR", "cp", source.path);
      this.files.mkdir(target, { recursive: true });
      for (const row of this.files.descendants(source.path)) {
        const relative = row.path.slice(source.path.length + 1);
        const destination = posix.join(target, relative);
        if (row.kind === "directory") this.files.mkdir(destination, { recursive: true });
        else if (row.kind === "symlink") this.files.symlink(utf8.decode(row.content), destination);
        else this.files.writeFile(destination, this.files.readFile(row.path), { mode: row.mode });
      }
      return;
    }
    if (source.kind === "symlink") {
      this.files.symlink(utf8.decode(source.content), target);
      return;
    }
    this.files.writeFile(target, this.files.readFile(source.path), { mode: source.mode });
  }

  async mv(src: string, dest: string): Promise<void> {
    let target = normalizePath(dest);
    const existing = this.files.get(target);
    if (existing?.kind === "directory" && this.files.stat(src, false).kind !== "directory") {
      target = posix.join(target, posix.basename(normalizePath(src)));
    }
    this.files.rename(src, target);
  }

  resolvePath(base: string, path: string): string {
    return posix.resolve(base, path);
  }

  getAllPaths(): string[] {
    return this.files.allPaths();
  }

  async chmod(path: string, mode: number): Promise<void> {
    this.files.chmod(path, mode);
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    this.files.symlink(target, linkPath);
  }

  /** No hard links in a table of rows: a link is a copy, which is what `ln` needs to look right. */
  async link(existingPath: string, newPath: string): Promise<void> {
    const source = this.files.stat(existingPath, false);
    if (source.kind === "directory") throw new FsError("EISDIR", "link", source.path);
    this.files.writeFile(newPath, this.files.readFile(source.path), { mode: source.mode });
  }

  async readlink(path: string): Promise<string> {
    return this.files.readlink(path);
  }

  async realpath(path: string): Promise<string> {
    const resolved = this.files.resolve(path, true);
    if (this.files.get(resolved) === undefined) throw new FsError("ENOENT", "realpath", normalizePath(path));
    return resolved;
  }

  async utimes(path: string, _atime: Date, mtime: Date): Promise<void> {
    this.files.utimes(path, mtime.getTime());
  }
}

/** Node-style stats, the third face over a row: what isomorphic-git reads. */
export interface NodeLikeStats {
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  mtime: Date;
  ctime: Date;
  ino: number;
  dev: number;
  uid: number;
  gid: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

function toNodeStats(row: FileRow, ino: number): NodeLikeStats {
  const typeBits = row.kind === "directory" ? 0o040000 : row.kind === "symlink" ? 0o120000 : 0o100000;
  return {
    mode: typeBits | row.mode,
    size: row.size,
    mtimeMs: row.mtimeMs,
    ctimeMs: row.mtimeMs,
    mtime: new Date(row.mtimeMs),
    ctime: new Date(row.mtimeMs),
    ino,
    dev: 1,
    uid: 0,
    gid: 0,
    isFile: () => row.kind === "file",
    isDirectory: () => row.kind === "directory",
    isSymbolicLink: () => row.kind === "symlink",
  };
}

/** A stable inode per path, so git's index can tell files apart. */
function inodeOf(path: string): number {
  let hash = 2166136261;
  for (let index = 0; index < path.length; index++) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

/**
 * The `fs.promises` subset isomorphic-git's `PromiseFsClient` asks for,
 * over the same rows. Errors carry Node codes, which is all it reads.
 */
export function createNodeFsPromises(files: FilesTable) {
  return {
    async readFile(path: string, options?: { encoding?: string } | string): Promise<Uint8Array | string> {
      const bytes = files.readFile(path);
      const encoding = typeof options === "string" ? options : options?.encoding;
      return encoding ? decode(bytes, encoding as BufferEncoding) : bytes;
    },
    async writeFile(path: string, data: string | Uint8Array, options?: { encoding?: string; mode?: number } | string): Promise<void> {
      const encoding = typeof options === "string" ? options : options?.encoding;
      const mode = typeof options === "object" ? options?.mode : undefined;
      files.writeFile(path, typeof data === "string" ? encode(data, encoding as BufferEncoding) : data, mode === undefined ? {} : { mode });
    },
    async unlink(path: string): Promise<void> {
      files.rm(path);
    },
    async readdir(path: string): Promise<string[]> {
      return files.readdir(path).map((row) => posix.basename(row.path));
    },
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      files.mkdir(path, { recursive: options?.recursive ?? false });
    },
    async rmdir(path: string): Promise<void> {
      files.rm(path, { recursive: false });
    },
    async stat(path: string): Promise<NodeLikeStats> {
      const row = files.stat(path, true);
      return toNodeStats(row, inodeOf(row.path));
    },
    async lstat(path: string): Promise<NodeLikeStats> {
      const row = files.stat(path, false);
      return toNodeStats(row, inodeOf(row.path));
    },
    async readlink(path: string): Promise<string> {
      return files.readlink(path);
    },
    async symlink(target: string, linkPath: string): Promise<void> {
      files.symlink(target, linkPath);
    },
    async chmod(path: string, mode: number): Promise<void> {
      files.chmod(path, mode);
    },
  };
}
