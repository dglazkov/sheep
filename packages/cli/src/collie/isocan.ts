/**
 * The isocan the shepherd installed (collie phase 2; design.md, "The
 * command"): `collie` reads this machine's isocan identity and mints its
 * passes through isocan's own Node API, and that API is the one the
 * `isocan` on PATH carries, never a copy in sheep's release.
 *
 * The rule is one walk: the `isocan` found on PATH, its real path (a
 * global install's bin is a symlink into the package), then up the tree to
 * the first `package.json` named `isocan`. A release install's
 * `bin/isocan.js` and a linked checkout's `packages/cli/bin/isocan.js` both
 * have that manifest at the package root, and its own `.` export is what is
 * imported, by file URL, so the bundle carries no static `isocan` import.
 * The types come from the root devDependency at the collie's pin, as a
 * type-only import that leaves nothing at runtime.
 *
 * Isocan's API reads its own environment (`ISOCAN_HOME`, `HOME`, the harness
 * variables, the directory's `.isocan/project.json` marker) from the
 * process, so the `env` taken here names where `isocan` is found and the
 * process's own environment is the one isocan resolves in; the command runs
 * with them the same.
 *
 * What is written here is the host's part only: where the package is, the
 * refusal when there is none (or when it is older than the three names the
 * mint needs, `ISOCAN_NEEDS`), and the choice to refuse a loopback home.
 * Whether a home is loopback is isocan's `isLoopbackBase`, and the address is
 * isocan's `canvasUrlWithPass`, both from the same PATH module (isocan
 * 8729b9e3 exports them). Which canvas, whose identity, and every refusal of
 * isocan's are isocan's sentences, thrown as isocan threw them.
 */
import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type * as IsocanModule from "isocan";
import { Sentence } from "../home.js";

/** Isocan's Node API, as its root entry exports it. */
export type IsocanApi = typeof IsocanModule;

/** This machine's isocan identity: the person's name and actor, and the isocan home directory it lives in. */
export interface IsocanIdentity {
  name: string;
  actorId: string;
  home: string;
}

/** The sentence for no `isocan` on PATH. */
export const ISOCAN_MISSING = "no `isocan` on this machine's PATH, and the collie mints through the isocan you set up here; `isocan setup` (npx github:dglazkov/isocan#release setup) installs it and names you";

/** No `isocan` on PATH, or none that is a package named isocan: refused at **isocan** with `isocan setup` named. */
export class IsocanMissing extends Sentence {
  constructor(message: string = ISOCAN_MISSING) {
    super(message, 0);
  }
}

/** The first executable `isocan` on `env.PATH`, or null. */
function onPath(env: NodeJS.ProcessEnv): string | null {
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    const candidate = join(dir, "isocan");
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not here
    }
  }
  return null;
}

function manifestName(dir: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

/** The isocan package's root: the PATH bin's real path walked up to the manifest named `isocan`; null when there is none. */
export function isocanPackage(env: NodeJS.ProcessEnv = process.env): string | null {
  const bin = onPath(env);
  if (bin === null) return null;
  let dir: string;
  try {
    dir = dirname(realpathSync(bin));
  } catch {
    return null;
  }
  for (;;) {
    if (manifestName(dir) === "isocan") return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The file a manifest's `.` export names for Node's `import`: a string, or the `import`/`node`/`default` condition. */
function entryOf(root: string): string | undefined {
  let manifest: { exports?: unknown; main?: unknown };
  try {
    manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as typeof manifest;
  } catch {
    return undefined;
  }
  const exports = manifest.exports;
  let dot: unknown = exports;
  if (exports !== null && typeof exports === "object" && !Array.isArray(exports) && Object.keys(exports).some((key) => key.startsWith("."))) dot = (exports as Record<string, unknown>)["."];
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const conditions = value as Record<string, unknown>;
    for (const key of ["import", "node", "default"]) {
      const found = pick(conditions[key]);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return pick(dot) ?? (typeof manifest.main === "string" ? manifest.main : undefined);
}

/** What the mint calls on isocan's API; an isocan that exports fewer (before 8729b9e3) is older than the collie mints with, and is refused before anything is asked of it. */
export const ISOCAN_NEEDS = ["connect", "resolveCanvas", "resolveCanvasRef", "canvasUrlWithPass", "isLoopbackBase"] as const;

/** The sentence for an isocan on PATH older than the mint: the names it lacks, and isocan's own upgrade. */
export function isocanTooOld(root: string, lacking: readonly string[]): string {
  return `the \`isocan\` on PATH (${root}) is older than the collie mints with: it exports no ${lacking.join(", ")}; \`isocan upgrade\` updates it`;
}

/** Isocan's API from the package on PATH, imported by its own `.` export; throws `IsocanMissing` when there is no package to import. */
export async function loadIsocan(env: NodeJS.ProcessEnv = process.env): Promise<IsocanApi> {
  const root = isocanPackage(env);
  if (root === null) throw new IsocanMissing();
  const entry = entryOf(root);
  if (entry === undefined || !existsSync(join(root, entry))) throw new IsocanMissing(`the \`isocan\` on PATH (${root}) exports no module to import; ${ISOCAN_MISSING.slice(ISOCAN_MISSING.indexOf("`isocan setup`"))}`);
  const url = pathToFileURL(join(root, entry)).href;
  return (await import(url)) as IsocanApi;
}

/** Isocan's home directory, as isocan's own `paths.isocanHome` names it. */
function isocanHomeDir(env: NodeJS.ProcessEnv): string {
  return env.ISOCAN_HOME ?? join(env.HOME ?? homedir(), ".isocan");
}

/**
 * This machine's isocan identity through isocan's `resolveIdentity`, or null when it has none. No daemon is started for
 * a person's identity (isocan reads the home slot offline); a harness session in the environment is isocan's to resolve.
 * Throws `IsocanMissing` when there is no isocan on PATH.
 */
export async function isocanIdentity(env: NodeJS.ProcessEnv = process.env): Promise<IsocanIdentity | null> {
  const api = await loadIsocan(env);
  const home = isocanHomeDir(env);
  const port = Number(env.ISOCAN_PORT ?? 4441);
  const { base } = await api.baseForCwd(home, port);
  const client = new api.DaemonClient(base, home);
  const resolved = await api.resolveIdentity(client, home);
  return resolved === null ? null : { name: resolved.actor.name, actorId: resolved.actor.id, home };
}

/** The canvas a mint is for, and whose identity minted it. The address carries the pass; it goes to the collie and nowhere else. */
export interface MintedPass {
  canvas: { id: string; title: string };
  /** The canvas's home: where the pass is minted and redeemed. */
  origin: string;
  actor: { id: string; name: string };
  address: string;
}

/** A canvas on this machine's loopback, refused before any pass is minted; `cli.ts` prints it with the collie's address. */
export class LoopbackCanvas extends Sentence {
  constructor(
    readonly title: string,
    readonly origin: string,
  ) {
    super(`the canvas "${title}" lives at ${origin}, this machine's own isocan daemon`, 0);
  }
}

export interface MintOptions {
  /** `--canvas`: an id or a unique title prefix; absent, the directory's canvas as isocan resolves it. */
  canvas?: string;
  /** Whether the collie reaches this machine's loopback (the rig, `local: true`); otherwise a loopback home is refused. */
  reachesLoopback: boolean;
  env?: NodeJS.ProcessEnv;
}

/**
 * A pass for the collie, minted through isocan's API as isocan's `pass` verb mints one: `connect()` for this machine's
 * identity, the canvas from the directory or `--canvas`, its home (`homeOf`, else the daemon's own base), then
 * `mintPass(canvasId, actorId)` with the person's actor. A loopback home is refused before the mint unless the collie
 * reaches it.
 */
export async function mintCollie(options: MintOptions): Promise<MintedPass> {
  const api = await loadIsocan(options.env);
  const lacking = ISOCAN_NEEDS.filter((name) => typeof (api as unknown as Record<string, unknown>)[name] !== "function");
  if (lacking.length > 0) throw new IsocanMissing(isocanTooOld(isocanPackage(options.env) ?? "isocan", lacking));
  const home = await api.connect();
  const ctx = home.ctx;
  const canvas = options.canvas === undefined ? await api.resolveCanvas(ctx) : await api.resolveCanvasRef(ctx.client, options.canvas);
  const origin = (await ctx.homeOf(canvas.id)) ?? ctx.client.base;
  if (!options.reachesLoopback && api.isLoopbackBase(origin)) throw new LoopbackCanvas(canvas.title, origin);
  const actor = ctx.actor;
  const { token } = await ctx.client.mintPass(canvas.id, actor.id);
  return { canvas: { id: canvas.id, title: canvas.title }, origin, actor: { id: actor.id, name: actor.name }, address: api.canvasUrlWithPass(origin, canvas.id, token) };
}
