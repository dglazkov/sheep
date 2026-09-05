import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Which home `lamb` talks to, and how it proves itself at the door. */
export interface LambConfig {
  /** The deployment's URL, `https://…`. */
  home?: string;
  /** The bearer token the home expects on every request. */
  token?: string;
}

export function configPath(): string {
  return process.env.LAMB_CONFIG ?? join(homedir(), ".lamb", "config");
}

/**
 * Resolve the config from, in rising precedence: `~/.lamb/config` (JSON),
 * `LAMB_HOME` / `LAMB_TOKEN`, and an explicit `--home`.
 */
export async function loadConfig(overrides: Partial<LambConfig> = {}): Promise<LambConfig> {
  let fromFile: LambConfig = {};
  try {
    const text = await readFile(configPath(), "utf8");
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      fromFile = {
        ...(typeof record.home === "string" ? { home: record.home } : {}),
        ...(typeof record.token === "string" ? { token: record.token } : {}),
      };
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const fromEnv: LambConfig = {
    ...(process.env.LAMB_HOME ? { home: process.env.LAMB_HOME } : {}),
    ...(process.env.LAMB_TOKEN ? { token: process.env.LAMB_TOKEN } : {}),
  };
  return { ...fromFile, ...fromEnv, ...stripUndefined(overrides) };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
