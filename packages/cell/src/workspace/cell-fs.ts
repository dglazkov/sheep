/**
 * just-bash's `IFileSystem` over the workspace table. Every method is a
 * thin async wrapper around the synchronous table so `cat`, `sed -i`,
 * `find`, and the rest see exactly the rows pi's `write` tool wrote.
 *
 * Pasture phase 1 adds a second backing behind one prefix: with a
 * `PastureCall`, a path under `/pasture` is read from the pasture's object
 * and refused for writing with `EROFS` and the design's sentence. Without
 * one, which is every pastureless cell, no method here routes at all and
 * `/pasture` is a name the rows do not have, as before.
 */
import type { BufferEncoding, CpOptions, FileContent, FsStat, IFileSystem, MkdirOptions, RmOptions } from "just-bash/browser";
import { posix } from "node:path";
import { type FileKind, type FileRow, FilesTable, FsError, normalizePath } from "./files.ts";
import { isPasturePath, PASTURE_ROOT, type PastureCall, type PastureRow } from "./mount.ts";

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

function toStat(row: Pick<FileRow, "path" | "kind" | "mode" | "size" | "mtimeMs">): FsStat {
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

type Entry = { path: string; kind: FileKind };

function byPath(a: Entry, b: Entry): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export class CellFs implements IFileSystem {
  /**
   * `pasture` is the second backing, for this one shell run: the cell makes
   * a `CellFs` with a fresh `PastureCall` per `exec` that has a pasture, and
   * none at all for a pastureless cell, whose `CellFs` is the rows alone.
   */
  constructor(
    readonly files: FilesTable,
    readonly pasture?: PastureCall,
  ) {}

  /** Where `path` lands when it is the pasture's: the absolute path under `/pasture`, else `undefined`. Follows workspace symlinks when asked, as the table would. */
  private mounted(path: string, follow = true): string | undefined {
    if (this.pasture === undefined) return undefined;
    const resolved = this.files.resolve(path, follow);
    return isPasturePath(resolved) ? resolved : undefined;
  }

  async readFile(path: string, options?: ReadFileOptions | BufferEncoding): Promise<string> {
    return decode(await this.readFileBuffer(path), encodingOf(options));
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const mounted = this.mounted(path);
    return mounted === undefined ? this.files.readFile(path) : this.pasture!.readFile(mounted);
  }

  async writeFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding): Promise<void> {
    const mounted = this.mounted(path);
    if (mounted !== undefined) this.pasture!.refuse("open", mounted);
    this.files.writeFile(path, encode(content, encodingOf(options)));
  }

  async appendFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding): Promise<void> {
    const mounted = this.mounted(path);
    if (mounted !== undefined) this.pasture!.refuse("open", mounted);
    this.files.appendFile(path, encode(content, encodingOf(options)));
  }

  async exists(path: string): Promise<boolean> {
    let mounted: string | undefined;
    try {
      mounted = this.mounted(path);
    } catch {
      return false;
    }
    return mounted === undefined ? this.files.exists(path) : (await this.pasture!.get(mounted)) !== undefined;
  }

  async stat(path: string): Promise<FsStat> {
    const mounted = this.mounted(path);
    return toStat(mounted === undefined ? this.files.stat(path, true) : await this.pasture!.stat(mounted));
  }

  async lstat(path: string): Promise<FsStat> {
    const mounted = this.mounted(path, false);
    return toStat(mounted === undefined ? this.files.stat(path, false) : await this.pasture!.stat(mounted));
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    const mounted = this.mounted(path);
    if (mounted !== undefined) this.pasture!.refuse("mkdir", mounted);
    this.files.mkdir(path, { recursive: options?.recursive ?? false });
  }

  /** A directory's children from whichever backing has it; `/` itself lists the mount beside the rows' roots. */
  private async entries(path: string): Promise<Entry[]> {
    const mounted = this.mounted(path);
    if (mounted !== undefined) return this.pasture!.readdir(mounted);
    const rows: Entry[] = this.files.readdir(path);
    if (this.pasture !== undefined && this.files.resolve(path) === "/") {
      rows.push({ path: PASTURE_ROOT, kind: "directory" });
      rows.sort(byPath);
    }
    return rows;
  }

  async readdir(path: string): Promise<string[]> {
    return (await this.entries(path)).map((row) => posix.basename(row.path));
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    return (await this.entries(path)).map((row) => ({
      name: posix.basename(row.path),
      isFile: row.kind === "file",
      isDirectory: row.kind === "directory",
      isSymbolicLink: row.kind === "symlink",
    }));
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    const mounted = this.mounted(path, false);
    if (mounted !== undefined) this.pasture!.refuse("rm", mounted);
    this.files.rm(path, { recursive: options?.recursive ?? false, force: options?.force ?? false });
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const into = this.mounted(dest);
    if (into !== undefined) this.pasture!.refuse("cp", into);
    const from = this.mounted(src, false);
    if (from !== undefined) return this.cpFromPasture(await this.pasture!.stat(from), dest, options);
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

  /** `cp /pasture/… /workspace/…`: the one way bytes leave the tree by the shell, into the rows. */
  private async cpFromPasture(source: PastureRow, dest: string, options?: CpOptions): Promise<void> {
    const pasture = this.pasture!;
    let target = normalizePath(dest);
    const existing = this.files.get(target);
    if (existing?.kind === "directory") target = posix.join(target, posix.basename(source.path));
    if (source.kind === "directory") {
      if (!options?.recursive) throw new FsError("EISDIR", "cp", source.path);
      this.files.mkdir(target, { recursive: true });
      for (const row of await pasture.descendants(source.path)) {
        const destination = posix.join(target, row.path.slice(source.path.length + 1));
        if (row.kind === "directory") this.files.mkdir(destination, { recursive: true });
        else if (row.kind === "symlink") this.files.symlink(await pasture.readlink(row.path), destination);
        else this.files.writeFile(destination, await pasture.readFile(row.path), { mode: row.mode });
      }
      return;
    }
    if (source.kind === "symlink") {
      this.files.symlink(await pasture.readlink(source.path), target);
      return;
    }
    this.files.writeFile(target, await pasture.readFile(source.path), { mode: source.mode });
  }

  async mv(src: string, dest: string): Promise<void> {
    const mounted = this.mounted(src, false) ?? this.mounted(dest);
    if (mounted !== undefined) this.pasture!.refuse("rename", mounted);
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

  /** Synchronous, so the mount's paths are here only once this call has fetched them; a glob over `/pasture` after a `cat` or `ls` of it sees them. */
  getAllPaths(): string[] {
    const paths = this.files.allPaths();
    const rows = this.pasture?.rowsNow();
    return rows === undefined ? paths : [...paths, ...rows.map((row) => row.path)].sort();
  }

  async chmod(path: string, mode: number): Promise<void> {
    const mounted = this.mounted(path);
    if (mounted !== undefined) this.pasture!.refuse("chmod", mounted);
    this.files.chmod(path, mode);
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    const mounted = this.mounted(linkPath, false);
    if (mounted !== undefined) this.pasture!.refuse("symlink", mounted);
    this.files.symlink(target, linkPath);
  }

  /** No hard links in a table of rows: a link is a copy, which is what `ln` needs to look right. */
  async link(existingPath: string, newPath: string): Promise<void> {
    const into = this.mounted(newPath, false);
    if (into !== undefined) this.pasture!.refuse("link", into);
    const from = this.mounted(existingPath, false);
    if (from !== undefined) {
      const source = await this.pasture!.stat(from);
      if (source.kind === "directory") throw new FsError("EISDIR", "link", source.path);
      this.files.writeFile(newPath, await this.pasture!.readFile(from), { mode: source.mode });
      return;
    }
    const source = this.files.stat(existingPath, false);
    if (source.kind === "directory") throw new FsError("EISDIR", "link", source.path);
    this.files.writeFile(newPath, this.files.readFile(source.path), { mode: source.mode });
  }

  async readlink(path: string): Promise<string> {
    const mounted = this.mounted(path, false);
    return mounted === undefined ? this.files.readlink(path) : this.pasture!.readlink(mounted);
  }

  async realpath(path: string): Promise<string> {
    const mounted = this.mounted(path);
    if (mounted !== undefined) {
      if ((await this.pasture!.get(mounted)) === undefined) throw new FsError("ENOENT", "realpath", mounted);
      return mounted;
    }
    const resolved = this.files.resolve(path, true);
    if (this.files.get(resolved) === undefined) throw new FsError("ENOENT", "realpath", normalizePath(path));
    return resolved;
  }

  async utimes(path: string, _atime: Date, mtime: Date): Promise<void> {
    const mounted = this.mounted(path);
    if (mounted !== undefined) this.pasture!.refuse("utimes", mounted);
    this.files.utimes(path, mtime.getTime());
  }
}
