/**
 * A pasture: the place a dog puts what every sheep on a repository should
 * know. One Durable Object per pasture, addressed by its name. Its SQLite
 * holds `meta` (the repository's URL, if any, its branch, and when the
 * pasture was made), lamb's files table rooted at `/pasture` (the tree the
 * dog fills with a brief, notes, and skills), and `secrets`, whose values
 * leave the object over RPC only: `GIT_TOKEN` is what the broker will hand
 * a container's helper (pasture phase 3), and no HTTP route ever returns a
 * value. The directory keeps the list of names; this object keeps the rest.
 *
 * Fold phase 1: the pasture's cache, what `setup.sh` left in `/cache`, as
 * the chunks of one record. `cache` holds a row per kept save: the key
 * (the hash of the `setup.sh` whose run left it), the record's hash and
 * its chunks in order, its counts, when, and by which sheep; the committed
 * save and the one before it, no more. `cache_chunks` holds each chunk in
 * rows of one MiB, as the files table holds a file, with its size in
 * `cache_sizes`; `cache_claims` says which save in flight put or relies on
 * which chunk. A chunk is put whole in one method, and a save is committed
 * in one transaction that checks every chunk is here, keeps two saves, and
 * deletes what no kept save names and no save begun within the hour
 * claims. So a restore reading the committed save survives one commit
 * after it, and a save cut off leaves the committed one as it was.
 */
import { DurableObject } from "cloudflare:workers";
import { CACHE_STORED_BYTES, type ManifestEntry, recordHashInput } from "@sheep/pen/protocol";
import { CHUNK_BYTES, FilesTable, FsError, hashBytes, normalizePath, type TreeEntry } from "./workspace/files.ts";
import { PASTURE_ROOT } from "./workspace/mount.ts";

export { PASTURE_ROOT };
export const DEFAULT_BRANCH = "main";

/** A pasture's name is a Durable Object name and a column the herd view prints, so it is plain. */
export const PASTURE_NAME = /^[a-z0-9-]+$/;
/** A secret's name is an environment variable's (pasture phase 4 puts all but `GIT_TOKEN` into setup's environment). */
export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isPastureName(name: unknown): name is string {
  return typeof name === "string" && PASTURE_NAME.test(name);
}

export function badPastureName(name: string): string {
  return `a pasture's name is [a-z0-9-]+, not ${JSON.stringify(name)}`;
}

export function isSecretName(name: unknown): name is string {
  return typeof name === "string" && SECRET_NAME.test(name);
}

export interface PastureMeta {
  name: string;
  /** A URL, or `null` for a pasture with no repository: a brief, notes, and skills, and no birth. */
  repo: string | null;
  branch: string;
  createdAt: number;
}

/** What a cell fetches in one hop at the start of a tool call that touches `/pasture` (pasture phase 1): the meta and the tree. */
export interface PastureSnapshot {
  meta: PastureMeta | undefined;
  tree: TreeEntry[];
}

/** A path in the tree, relative to `/pasture`, resolved to the row's absolute path; `undefined` when it would leave the tree. */
export function treePath(relative: string): string | undefined {
  let absolute: string;
  try {
    absolute = normalizePath(`${PASTURE_ROOT}/${relative}`);
  } catch {
    return undefined;
  }
  return absolute.startsWith(`${PASTURE_ROOT}/`) ? absolute : undefined;
}

/** A record as a save describes it (fold phase 1): its hash, its chunks' hashes in order, its file entries, and its bytes. */
export interface CacheRecord {
  hash: string;
  chunks: string[];
  files: number;
  bytes: number;
}

/** What a commit writes: the record, the `setup.sh` it is for, and the sheep whose setup left it. */
export interface CacheCommit extends CacheRecord {
  key: string;
  by: string;
}

/**
 * A kept save: the commit, when it was kept, and what its chunks come to
 * on this object's disk (fold phase 3: the deflated bytes, which is what
 * travels; `bytes` stays the record's own, the tree's size).
 */
export interface KeptCache extends CacheCommit {
  keptAt: number;
  stored: number;
}

/**
 * What `GET /p/<name>/` says of the cache, from the row alone: its size,
 * files, the `setup.sh` it is for, when, by whom, and whether that script
 * is the tree's now. `null` when nothing was ever kept.
 */
export interface CacheSummary {
  bytes: number;
  files: number;
  setup: string;
  keptAt: number;
  by: string;
  current: boolean;
}

/** How long a save that never committed keeps its chunks: an hour, far past any setup's ten minutes. */
export const CACHE_CLAIM_MS = 60 * 60 * 1000;
/** How many saves are kept: the committed one, and the one before it, which a restore begun before the commit still reads. */
export const CACHE_KEPT_SAVES = 2;

export class Pasture extends DurableObject<Env> {
  private readonly files: FilesTable;
  /** The object's clock for the cache's claims; a test moves it past the hour rather than waiting one. */
  clock: () => number = () => Date.now();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL)");
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS cache (
      generation INTEGER PRIMARY KEY,
      save       TEXT NOT NULL,
      key        TEXT NOT NULL,
      hash       TEXT NOT NULL,
      chunks     TEXT NOT NULL,
      files      INTEGER NOT NULL,
      bytes      INTEGER NOT NULL,
      kept_at    INTEGER NOT NULL,
      by         TEXT NOT NULL
    )`);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS cache_chunks (hash TEXT NOT NULL, idx INTEGER NOT NULL, content BLOB NOT NULL, PRIMARY KEY (hash, idx))");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS cache_sizes (hash TEXT PRIMARY KEY, size INTEGER NOT NULL)");
    // Fold phase 3: a chunk is kept deflated, under the name its plain bytes hash to, so the name cannot say which it is. A
    // chunk kept before that is plain, and the save that names it again must send it rather than find it here: the column
    // says which, and an object from before this phase has it added with every chunk it holds marked as not deflated.
    if (!ctx.storage.sql.exec("PRAGMA table_info(cache_sizes)").toArray().some((column) => (column as { name: string }).name === "deflated")) {
      ctx.storage.sql.exec("ALTER TABLE cache_sizes ADD COLUMN deflated INTEGER NOT NULL DEFAULT 0");
    }
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS cache_claims (save TEXT NOT NULL, hash TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (save, hash))");
    this.files = new FilesTable(ctx.storage.sql, Date.now, [PASTURE_ROOT]);
    this.files.init();
  }

  get name(): string {
    const name = this.ctx.id.name;
    if (name === undefined) throw new Error("Pasture must be addressed by name");
    return name;
  }

  /** Writes the meta once, when the directory registers the name. A second call keeps the first's. */
  init(options: { repo?: string | null; branch?: string | null; createdAt?: number } = {}): PastureMeta {
    const existing = this.meta();
    if (existing !== undefined) return existing;
    const repo = typeof options.repo === "string" && options.repo.length > 0 ? options.repo : null;
    const branch = typeof options.branch === "string" && options.branch.length > 0 ? options.branch : DEFAULT_BRANCH;
    const createdAt = options.createdAt ?? Date.now();
    for (const [key, value] of [
      ["repo", repo ?? ""],
      ["branch", branch],
      ["createdAt", String(createdAt)],
    ] as const) {
      this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, value);
    }
    return { name: this.name, repo, branch, createdAt };
  }

  /** The repository, branch, and birth date; `undefined` for an object the directory never registered. */
  meta(): PastureMeta | undefined {
    const rows = new Map(this.ctx.storage.sql.exec<{ key: string; value: string }>("SELECT key, value FROM meta").toArray().map((row) => [row.key, row.value]));
    const createdAt = rows.get("createdAt");
    if (createdAt === undefined) return undefined;
    const repo = rows.get("repo") ?? "";
    return { name: this.name, repo: repo === "" ? null : repo, branch: rows.get("branch") ?? DEFAULT_BRANCH, createdAt: Number(createdAt) };
  }

  /** The tree as pen's manifest: every row under `/pasture`, paths relative to it, sorted. */
  manifest(): ManifestEntry[] {
    return this.files.manifest(PASTURE_ROOT);
  }

  /** The meta and the tree with sizes and mtimes, together: the one RPC a cell's `PastureCall` makes (pasture phase 1). */
  snapshot(): PastureSnapshot {
    return { meta: this.meta(), tree: this.files.tree(PASTURE_ROOT) };
  }

  /** A file's bytes by its path in the tree; `undefined` when there is none. A directory is `EISDIR`. */
  read(path: string): Uint8Array | undefined {
    const absolute = treePath(path);
    if (absolute === undefined) return undefined;
    try {
      return this.files.readFile(absolute);
    } catch (error) {
      if (error instanceof FsError && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  /** A file's bytes by the hash the manifest names, which is how a cell fetches what a manifest entry says (pasture phase 1). */
  readByHash(hash: string): Uint8Array | undefined {
    const row = this.ctx.storage.sql
      .exec<{ path: string }>("SELECT path FROM files WHERE hash = ? AND kind = 'file' AND substr(path, 1, ?) = ? LIMIT 1", hash, PASTURE_ROOT.length + 1, `${PASTURE_ROOT}/`)
      .toArray()[0];
    return row === undefined ? undefined : this.files.readFile(row.path);
  }

  /** The one write path: a whole file in one transaction, parents made, last write wins. Throws `FsError` (`EFBIG`, `EISDIR`, `EINVAL`). */
  put(path: string, content: Uint8Array): ManifestEntry {
    const absolute = treePath(path);
    if (absolute === undefined) throw new FsError("EINVAL", "open", path, "outside the pasture's tree");
    this.files.writeFile(absolute, content, { createParents: true });
    const row = this.files.get(absolute)!;
    return { path: absolute.slice(PASTURE_ROOT.length + 1), kind: row.kind, mode: row.mode, hash: row.hash };
  }

  /** Removes a file, or a directory and everything under it. `false` when there was nothing there. */
  rm(path: string): boolean {
    const absolute = treePath(path);
    if (absolute === undefined) return false;
    if (this.files.get(absolute) === undefined) return false;
    this.files.rm(absolute, { recursive: true });
    return true;
  }

  setSecret(name: string, value: string): void {
    if (!isSecretName(name)) throw new Error(`a secret's name is an environment variable's, not ${JSON.stringify(name)}`);
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO secrets (name, value) VALUES (?, ?)", name, value);
  }

  /** Names only; this is all a route ever sees. */
  secretNames(): string[] {
    return this.ctx.storage.sql.exec<{ name: string }>("SELECT name FROM secrets ORDER BY name").toArray().map((row) => row.name);
  }

  /** A value, over RPC and to the cell only: the broker's lookup (pasture phase 3) and setup's environment (pasture phase 4). */
  secret(name: string): string | undefined {
    return this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM secrets WHERE name = ?", name).toArray()[0]?.value;
  }

  /**
   * Setup's environment (pasture phase 4): every secret but `GIT_TOKEN`,
   * name to value, read at the moment of the setup run and sent to that
   * one `run` frame. `GIT_TOKEN` is the broker's and is never environment.
   */
  secrets(): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const row of this.ctx.storage.sql.exec<{ name: string; value: string }>("SELECT name, value FROM secrets WHERE name <> ? ORDER BY name", SETUP_EXCLUDED_SECRET).toArray()) {
      environment[row.name] = row.value;
    }
    return environment;
  }

  // -------------------------------------------------------------------------
  // Fold phase 1: the pasture's cache.

  /** The kept saves, newest first. */
  private keptSaves(): Array<KeptCache & { generation: number; save: string }> {
    return this.ctx.storage.sql
      .exec<{ generation: number; save: string; key: string; hash: string; chunks: string; files: number; bytes: number; kept_at: number; by: string }>(
        "SELECT generation, save, key, hash, chunks, files, bytes, kept_at, by FROM cache ORDER BY generation DESC",
      )
      .toArray()
      .map((row) => {
        const chunks = JSON.parse(row.chunks) as string[];
        return {
          generation: row.generation,
          save: row.save,
          key: row.key,
          hash: row.hash,
          chunks,
          files: row.files,
          bytes: row.bytes,
          keptAt: row.kept_at,
          by: row.by,
          stored: this.storedBytes(chunks),
        };
      });
  }

  /** What a record's chunks come to here, deflated as they are kept; a chunk gone (an older save's, deleted) counts nothing. */
  private storedBytes(chunks: readonly string[]): number {
    let stored = 0;
    for (const hash of new Set(chunks)) stored += this.ctx.storage.sql.exec<{ size: number }>("SELECT size FROM cache_sizes WHERE hash = ?", hash).toArray()[0]?.size ?? 0;
    return stored;
  }

  /** The committed save, when there is one. */
  private committed(): (KeptCache & { generation: number; save: string }) | undefined {
    return this.keptSaves()[0];
  }

  /**
   * The cache a fresh container gets for the tree's `setup.sh` whose hash
   * is `key`: the committed save when it was left by that script, and
   * nothing otherwise, however many older ones there are.
   */
  cacheFor(key: string): KeptCache | undefined {
    const committed = this.committed();
    if (committed === undefined || committed.key !== key) return undefined;
    const { generation: _generation, save: _save, ...kept } = committed;
    return kept;
  }

  /** Whether a chunk is here, whole and deflated: one kept before fold phase 3 is plain, and counts as missing so the save replaces it. */
  private hasChunk(hash: string): boolean {
    return this.ctx.storage.sql.exec("SELECT 1 FROM cache_sizes WHERE hash = ? AND deflated = 1", hash).toArray().length > 0;
  }

  /** One chunk's bytes by its hash, its rows joined; `undefined` when no kept save or save in flight has it. */
  cacheChunk(hash: string): Uint8Array | undefined {
    const size = this.ctx.storage.sql.exec<{ size: number }>("SELECT size FROM cache_sizes WHERE hash = ?", hash).toArray()[0]?.size;
    if (size === undefined) return undefined;
    const out = new Uint8Array(size);
    let offset = 0;
    for (const row of this.ctx.storage.sql.exec<{ content: ArrayBuffer }>("SELECT content FROM cache_chunks WHERE hash = ? ORDER BY idx", hash).toArray()) {
      const bytes = new Uint8Array(row.content);
      out.set(bytes, offset);
      offset += bytes.byteLength;
    }
    if (offset !== size) throw new Error(`chunk ${hash} is ${offset} bytes of ${size}`);
    return out;
  }

  /**
   * Which of a save's chunks the object lacks, in order and once each. Every
   * one named is claimed for the save, the ones here too, so a commit by
   * another save in the meantime does not delete what this one relies on.
   */
  cacheMissing(save: string, hashes: string[]): string[] {
    const now = this.clock();
    const missing: string[] = [];
    for (const hash of new Set(hashes)) {
      this.ctx.storage.sql.exec("INSERT OR REPLACE INTO cache_claims (save, hash, at) VALUES (?, ?, ?)", save, hash, now);
      if (!this.hasChunk(hash)) missing.push(hash);
    }
    return missing;
  }

  /**
   * One chunk, whole, in one method and so one transaction: its rows of
   * one MiB and its size, claimed for the save. Bytes over a chunk, or
   * none, are refused before a row is written. Fold phase 3: what is kept
   * is the chunk deflated, under the name its plain bytes hash to, so this
   * object cannot check the name against the bytes and does not try; the
   * container that is given the chunk inflates it and checks the hash
   * there, which is where the bytes are used.
   */
  cachePut(save: string, hash: string, bytes: Uint8Array): void {
    if (bytes.byteLength === 0 || bytes.byteLength > CACHE_STORED_BYTES) throw new Error(`a chunk is 1 to ${CACHE_STORED_BYTES} bytes deflated, not ${bytes.byteLength}`);
    const sql = this.ctx.storage.sql;
    sql.exec("INSERT OR REPLACE INTO cache_claims (save, hash, at) VALUES (?, ?, ?)", save, hash, this.clock());
    if (this.hasChunk(hash)) return;
    sql.exec("DELETE FROM cache_chunks WHERE hash = ?", hash);
    for (let offset = 0, index = 0; offset < bytes.byteLength; offset += CHUNK_BYTES, index++) {
      sql.exec("INSERT INTO cache_chunks (hash, idx, content) VALUES (?, ?, ?)", hash, index, bytes.subarray(offset, offset + CHUNK_BYTES));
    }
    sql.exec("INSERT OR REPLACE INTO cache_sizes (hash, size, deflated) VALUES (?, ?, 1)", hash, bytes.byteLength);
  }

  /**
   * A save becomes the pasture's cache, in one transaction: every chunk it
   * names must be here, or nothing changes and the commit throws; then it
   * is the newest kept save, the oldest past `CACHE_KEPT_SAVES` goes, this
   * save's claims and every claim older than the hour go, and every chunk
   * no kept save names and no claim holds goes. The last commit wins, whole.
   */
  cacheCommit(save: string, commit: CacheCommit): KeptCache {
    if (hashBytes(new TextEncoder().encode(recordHashInput(commit.chunks))) !== commit.hash) throw new Error(`the cache ${commit.hash} is not the record of its chunks`);
    const keptAt = this.clock();
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      for (const hash of new Set(commit.chunks)) if (!this.hasChunk(hash)) throw new Error(`the save ${save} names chunk ${hash}, which the pasture does not have; nothing was kept`);
      sql.exec(
        "INSERT INTO cache (generation, save, key, hash, chunks, files, bytes, kept_at, by) VALUES ((SELECT coalesce(max(generation), 0) + 1 FROM cache), ?, ?, ?, ?, ?, ?, ?, ?)",
        save,
        commit.key,
        commit.hash,
        JSON.stringify(commit.chunks),
        commit.files,
        commit.bytes,
        keptAt,
        commit.by,
      );
      const kept = this.keptSaves();
      for (const old of kept.slice(CACHE_KEPT_SAVES)) sql.exec("DELETE FROM cache WHERE generation = ?", old.generation);
      sql.exec("DELETE FROM cache_claims WHERE save = ? OR at < ?", save, keptAt - CACHE_CLAIM_MS);
      const named = new Set(kept.slice(0, CACHE_KEPT_SAVES).flatMap((one) => one.chunks));
      for (const row of sql.exec<{ hash: string }>("SELECT hash FROM cache_sizes WHERE hash NOT IN (SELECT hash FROM cache_claims)").toArray()) {
        if (named.has(row.hash)) continue;
        sql.exec("DELETE FROM cache_chunks WHERE hash = ?", row.hash);
        sql.exec("DELETE FROM cache_sizes WHERE hash = ?", row.hash);
      }
    });
    return { key: commit.key, hash: commit.hash, chunks: commit.chunks, files: commit.files, bytes: commit.bytes, by: commit.by, keptAt, stored: this.storedBytes(commit.chunks) };
  }

  /** The committed save as the route says it, read from its row and never a chunk; `current` asks the tree for `setup.sh`'s hash now. */
  cacheSummary(): CacheSummary | null {
    const committed = this.committed();
    if (committed === undefined) return null;
    const setup = this.files.get(`${PASTURE_ROOT}/setup.sh`);
    return { bytes: committed.bytes, files: committed.files, setup: committed.key, keptAt: committed.keptAt, by: committed.by, current: setup?.kind === "file" && setup.hash === committed.key };
  }
}

/** The one secret setup does not get: the broker's credential, `GIT_TOKEN` (`PASTURE_GIT_TOKEN` in `pen/broker.ts`). */
export const SETUP_EXCLUDED_SECRET = "GIT_TOKEN";
