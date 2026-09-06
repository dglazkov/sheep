/**
 * The mount: `/pasture` in a sheep born into a pasture, served from the
 * pasture's object and never from the cell's own rows. It is the second
 * backing behind `CellFs` and behind the `CellExecutionEnv` methods pi's
 * tools call; a pastureless cell has none, and its file seam is lamb's.
 *
 * Live, per tool call. A `PastureCall` is made at the start of each tool
 * call that can touch the prefix (one shell run, one read, one prompt
 * build) and dropped at its end. It asks the object once for its
 * snapshot, the manifest with what a `stat` needs, and for a file's bytes
 * by hash when the call reads them, each kept for that call and no
 * longer. Nothing here outlives a call, so nothing here can go stale: a
 * note put a moment ago is in the next `cat`.
 *
 * The tree is read-only from a sheep. Every writing method under the
 * prefix throws `FsError("EROFS")` with `PASTURE_READ_ONLY`, so `write`,
 * `edit`, and `sed -i` say the same words.
 */
import { posix } from "node:path";
import type { PastureMeta, PastureSnapshot } from "../pasture.ts";
import { type FileKind, FsError, normalizePath } from "./files.ts";

export const PASTURE_ROOT = "/pasture";

/** The design's sentence, in every refusal of a write to the tree. */
export const PASTURE_READ_ONLY = "the pasture is read-only; `pasture put <path>` writes to it";

export function readOnly(syscall: string, path: string): FsError {
  return new FsError("EROFS", syscall, path, PASTURE_READ_ONLY);
}

export function isPasturePath(path: string): boolean {
  return path === PASTURE_ROOT || path.startsWith(`${PASTURE_ROOT}/`);
}

/**
 * just-bash's `sed -i` and `chmod` report any failed write as "No such
 * file or directory", whatever the file system threw, and `rm -f` reports
 * nothing at all. The refusal was real, and the mount recorded it; this
 * gives the program's output what the mount said, the way
 * `annotateCommandNotFound` gives the not-found line the table's sentence.
 * A line naming a refused path with the wrong ending gets the right one;
 * a refused path no line names gets a line of its own. The exit code is
 * the program's.
 */
export function annotateReadOnly(stderr: string, refused: readonly FsError[]): string {
  if (refused.length === 0) return stderr;
  let out = stderr
    .split("\n")
    .map((line) => {
      const error = refused.find((candidate) => line.includes(candidate.path) && line.endsWith("No such file or directory"));
      return error === undefined ? line : `${line.slice(0, -"No such file or directory".length)}${error.message}`;
    })
    .join("\n");
  for (const error of refused) {
    if (out.includes(error.path)) continue;
    if (out.length > 0 && !out.endsWith("\n")) out += "\n";
    out += `${error.message}\n`;
  }
  return out;
}

/**
 * What the cell asks of a pasture's object: the `Pasture` Durable Object
 * stub is one, over RPC. `read` by path is the fallback for a hash the
 * object no longer has, when a file changed between the snapshot and the
 * read within one call: the row as it is now is what is read.
 */
export interface PastureSource {
  snapshot(): Promise<PastureSnapshot>;
  readByHash(hash: string): Promise<Uint8Array | undefined>;
  read(path: string): Promise<Uint8Array | undefined>;
}

/** A row of the mounted tree, by its absolute path under `/pasture`. */
export interface PastureRow {
  path: string;
  kind: FileKind;
  mode: number;
  size: number;
  mtimeMs: number;
  hash: string | null;
}

const decoder = new TextDecoder();

export class PastureCall {
  #snapshot: Promise<PastureSnapshot> | undefined;
  #rows: PastureRow[] | undefined;
  readonly #content = new Map<string, Promise<Uint8Array>>();
  /** The writes this call refused, in order, for `annotateReadOnly`. */
  readonly refusals: FsError[] = [];

  constructor(readonly source: PastureSource) {}

  /** The one refusal, recorded and thrown. */
  refuse(syscall: string, path: string): never {
    const error = readOnly(syscall, path);
    this.refusals.push(error);
    throw error;
  }

  /** The one manifest hop of this call, made on first touch and never again. */
  snapshot(): Promise<PastureSnapshot> {
    this.#snapshot ??= this.source.snapshot().then((snapshot) => {
      this.#rows = toRows(snapshot);
      return snapshot;
    });
    return this.#snapshot;
  }

  async meta(): Promise<PastureMeta | undefined> {
    return (await this.snapshot()).meta;
  }

  /** Every row, the root first, sorted by path. */
  async rows(): Promise<PastureRow[]> {
    await this.snapshot();
    return this.#rows!;
  }

  /** The rows if this call has already fetched them: for just-bash's `getAllPaths`, the one synchronous face. */
  rowsNow(): PastureRow[] | undefined {
    return this.#rows;
  }

  async get(path: string): Promise<PastureRow | undefined> {
    const target = normalizePath(path);
    return (await this.rows()).find((row) => row.path === target);
  }

  async stat(path: string): Promise<PastureRow> {
    const row = await this.get(path);
    if (row === undefined) throw new FsError("ENOENT", "stat", normalizePath(path));
    return row;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const row = await this.stat(path);
    if (row.kind === "directory") throw new FsError("EISDIR", "read", row.path);
    return this.content(row);
  }

  async readText(path: string): Promise<string> {
    return decoder.decode(await this.readFile(path));
  }

  /** Direct children, sorted. */
  async readdir(path: string): Promise<PastureRow[]> {
    const dir = await this.stat(path);
    if (dir.kind !== "directory") throw new FsError("ENOTDIR", "scandir", dir.path);
    const prefix = `${dir.path}/`;
    return (await this.rows()).filter((row) => row.path.startsWith(prefix) && !row.path.slice(prefix.length).includes("/"));
  }

  /** Every row under a directory, the directory excluded, deepest last. */
  async descendants(path: string): Promise<PastureRow[]> {
    const prefix = `${normalizePath(path)}/`;
    return (await this.rows()).filter((row) => row.path.startsWith(prefix));
  }

  async readlink(path: string): Promise<string> {
    const row = await this.get(path);
    if (row === undefined) throw new FsError("ENOENT", "readlink", normalizePath(path));
    if (row.kind !== "symlink") throw new FsError("EINVAL", "readlink", row.path);
    return decoder.decode(await this.content(row));
  }

  /** The bytes behind a row, one hop per distinct hash per call. */
  private content(row: PastureRow): Promise<Uint8Array> {
    const hash = row.hash ?? "";
    let pending = this.#content.get(hash);
    if (pending === undefined) {
      pending = this.source.readByHash(hash).then(async (bytes) => {
        if (bytes !== undefined) return bytes;
        const now = await this.source.read(row.path.slice(PASTURE_ROOT.length + 1));
        if (now === undefined) throw new FsError("ENOENT", "read", row.path);
        return now;
      });
      this.#content.set(hash, pending);
    }
    return pending;
  }
}

function toRows(snapshot: PastureSnapshot): PastureRow[] {
  const root: PastureRow = { path: PASTURE_ROOT, kind: "directory", mode: 0o755, size: 0, mtimeMs: snapshot.meta?.createdAt ?? 0, hash: null };
  return [root, ...snapshot.tree.map((entry) => ({ path: posix.join(PASTURE_ROOT, entry.path), kind: entry.kind, mode: entry.mode, size: entry.size, mtimeMs: entry.mtimeMs, hash: entry.hash }))];
}
