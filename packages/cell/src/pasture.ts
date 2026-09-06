/**
 * A pasture: the place a dog puts what every sheep on a repository should
 * know. One Durable Object per pasture, addressed by its name. Its SQLite
 * holds `meta` (the repository's URL, if any, its branch, and when the
 * pasture was made), lamb's files table rooted at `/pasture` (the tree the
 * dog fills with a brief, notes, and skills), and `secrets`, whose values
 * leave the object over RPC only: `GIT_TOKEN` is what the broker will hand
 * a container's helper (pasture phase 3), and no HTTP route ever returns a
 * value. The directory keeps the list of names; this object keeps the rest.
 */
import { DurableObject } from "cloudflare:workers";
import type { ManifestEntry } from "@sheep/pen/protocol";
import { FilesTable, FsError, normalizePath, type TreeEntry } from "./workspace/files.ts";
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

export class Pasture extends DurableObject<Env> {
  private readonly files: FilesTable;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL)");
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
}

/** The one secret setup does not get: the broker's credential, `GIT_TOKEN` (`PASTURE_GIT_TOKEN` in `pen/broker.ts`). */
export const SETUP_EXCLUDED_SECRET = "GIT_TOKEN";
