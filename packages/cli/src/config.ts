import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Which home `sheep` talks to, and how it proves itself at the door. */
export interface SheepConfig {
  /** The deployment's URL, `https://…`. */
  home?: string;
  /** The bearer token the home expects on every request. */
  token?: string;
  /**
   * Written by `sheep home local`: the home is the one under `~/.sheep/local`,
   * which the CLI starts on demand when a connection to it is refused. The
   * marker, not the address, decides: the address is whatever port the
   * daemon last got, and a `--home` or `SHEEP_HOME` overriding it is never
   * the local home, whatever it says.
   */
  local?: boolean;
}

export function configPath(): string {
  return process.env.SHEEP_CONFIG ?? join(homedir(), ".sheep", "config");
}

/**
 * Resolve the config from, in rising precedence: `~/.sheep/config` (JSON),
 * `SHEEP_HOME` / `SHEEP_TOKEN`, and an explicit `--home`.
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
