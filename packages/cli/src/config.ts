/**
 * The kennel: what a dog holds in the directory it stands in. Kennel phase
 * 0. `.sheep/` at or above the working directory, found by walking up the
 * way git finds `.git`, and `~/.sheep` when there is none. The config and
 * the local home live there, so two dogs in two directories share nothing
 * but the command; the tools (wrangler) are the machine's, not a
 * kennel's. There is no environment override: the working directory and
 * `HOME` are the whole rule, which is what a ring walks.
 */
import { chmodSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** Which home `sheep` talks to, and how it proves itself at the door. */
export interface SheepConfig {
  /** The deployment's URL, `https://…`. */
  home?: string;
  /** The bearer token the home expects on every request. */
  token?: string;
  /**
   * Written by `sheep home local`: the home is the one under the kennel's
   * `local/`, which the CLI starts on demand when a connection to it is
   * refused. The marker, not the address, decides: the address is whatever
   * port the daemon last got, and a `--home` or `SHEEP_HOME` overriding it
   * is never the local home, whatever it says.
   */
  local?: boolean;
  /**
   * The station's name on the account, minted by the first `sheep home
   * deploy` from this kennel (`name.ts`) and recorded here; every later
   * deploy and the delete use it, and nothing derives it again. Absent
   * until a deploy; a local home never has one.
   */
  name?: string;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A path as the filesystem resolves it: every symlink in it followed, as
 * far as it exists, and the part that does not exist yet appended as
 * written. Never throws. `process.cwd()` is already a real path, and
 * `homedir()` is `HOME` as it was set, so on macOS, where `/var` is a
 * link to `/private/var`, the two name one directory two ways: a kennel
 * found by walking up from the working directory is `/private/var/…/.sheep`
 * while `~/.sheep` is `/var/…/.sheep`.
 */
export function realPath(path: string): string {
  let current = resolve(path);
  const missing: string[] = [];
  for (;;) {
    try {
      return join(realpathSync(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      missing.push(basename(current));
      current = parent;
    }
  }
}

/** Whether two paths name one directory or file, however either was reached: the comparison every kennel check makes. */
export function samePath(a: string, b: string): boolean {
  return a === b || realPath(a) === realPath(b);
}

/** Whether a kennel is the machine's, `~/.sheep`, the fallback every directory without its own walks up to. */
export function isMachineKennel(kennel: string): boolean {
  return samePath(kennel, join(homedir(), ".sheep"));
}

/**
 * The kennel: the first `.sheep/` directory at or above `from`, else
 * `~/.sheep`, which a walk from anywhere under the home directory reaches
 * on its own and a walk from `/tmp` falls back to. The path is returned
 * whether or not the fallback exists; `sheep home local` makes it, as it
 * always did. `from` is the working directory in the product and a
 * fixture's tree in a test; nothing else passes it.
 */
export function sheepDir(from: string = process.cwd()): string {
  let current = resolve(from);
  for (;;) {
    const candidate = join(current, ".sheep");
    if (isDirectory(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(homedir(), ".sheep");
}

/** The directory the kennel is in: where the `.gitignore` entry goes and where git is asked about `.sheep`. */
export function kennelDir(from: string = process.cwd()): string {
  return dirname(sheepDir(from));
}

export function configPath(): string {
  return join(sheepDir(), "config");
}

/**
 * The config file as written, or nothing when it is absent or not JSON:
 * what `sheep home local` and `sheep home deploy` read before they write,
 * so a key one of them does not own survives the other's rewrite.
 */
export function readConfigFile(): (SheepConfig & Record<string, unknown>) | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath(), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as SheepConfig & Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** The config file, whole, mode 600: it holds the home's token. */
export function writeConfigFile(config: Record<string, unknown>): void {
  mkdirSync(dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(configPath(), 0o600);
}

/**
 * Resolve the config from, in rising precedence: the kennel's `config`
 * (JSON), `SHEEP_HOME` / `SHEEP_TOKEN`, and an explicit `--home`.
 */
export async function loadConfig(overrides: Partial<SheepConfig> = {}): Promise<SheepConfig> {
  let fromFile: SheepConfig = {};
  try {
    const text = await readFile(configPath(), "utf8");
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      fromFile = {
        ...(typeof record.home === "string" ? { home: record.home } : {}),
        ...(typeof record.token === "string" ? { token: record.token } : {}),
        ...(record.local === true ? { local: true } : {}),
        ...(typeof record.name === "string" ? { name: record.name } : {}),
      };
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const fromEnv: SheepConfig = {
    ...(process.env.SHEEP_HOME ? { home: process.env.SHEEP_HOME } : {}),
    ...(process.env.SHEEP_TOKEN ? { token: process.env.SHEEP_TOKEN } : {}),
  };
  const resolved = { ...fromFile, ...fromEnv, ...stripUndefined(overrides) };
  // An address from the environment or the command line is some home, never the local one, whatever the file says.
  if (fromEnv.home !== undefined || overrides.home !== undefined) delete resolved.local;
  return resolved;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
