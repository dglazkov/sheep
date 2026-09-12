/**
 * The credentials: the two values only a person can make, kept once per
 * machine. Stile phase 0.
 *
 * The **account token** is a Cloudflare API token for the account the home
 * goes on; the **model key** is the Anthropic key the home's sheep call the
 * model with. `~/.sheep/credentials` is JSON with two keys, `cloudflare`
 * and `anthropic`, mode 600, written by the stile and read by everything
 * that needs either. The machine's, like `~/.sheep/tools`, because the
 * account and the key are the shepherd's and a station is a kennel's: a
 * second station on the same machine asks for neither.
 *
 * The precedence is the config's (`config.ts`), read outward: a kennel's own
 * `.sheep/credentials` shadows the machine's, for the rare second account,
 * and `CLOUDFLARE_API_TOKEN` and `ANTHROPIC_API_KEY` in the environment beat
 * both, which is what the rings and CI use; nothing requires them. There is
 * no argument, and never will be: a value in argv is a value in `ps`.
 *
 * `writeCredentials()` only ever writes `~/.sheep/credentials`, and keeps the
 * key it is not setting, so rotating one leaves the other alone. Nothing here
 * returns a value to a report: `credentialsLine()` and `credentialsReport()`
 * name which are kept and where, never what they are.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { sheepDir } from "./config.js";

/** The two, by the names the file holds them under. */
export type CredentialName = "cloudflare" | "anthropic";

export const CREDENTIAL_NAMES: readonly CredentialName[] = ["cloudflare", "anthropic"];

/** The environment variable that overrides each, which is what the rings and CI set. */
export const CREDENTIAL_ENV: Record<CredentialName, string> = { cloudflare: "CLOUDFLARE_API_TOKEN", anthropic: "ANTHROPIC_API_KEY" };

/** What each is called in a sentence to a person. */
export const CREDENTIAL_PROSE: Record<CredentialName, string> = { cloudflare: "account token", anthropic: "model key" };

/** A credential as found: its value, where it came from, and the file it was in. */
export interface Kept {
  value: string;
  from: "kennel" | "machine" | "environment";
  /** The file it was read from; null for the environment. */
  path: string | null;
}

/** The machine's file: `~/.sheep/credentials`, the only one the stile writes. */
export function machineCredentialsPath(): string {
  return join(homedir(), ".sheep", "credentials");
}

/** The kennel's own, which shadows the machine's when it holds a value; the stile never writes one. */
export function kennelCredentialsPath(): string {
  return join(sheepDir(), "credentials");
}

/** One file's values, or nothing when it is absent, unreadable, or not the shape. */
function readFile(path: string): Partial<Record<CredentialName, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object") return {};
  const record = parsed as Record<string, unknown>;
  const values: Partial<Record<CredentialName, string>> = {};
  for (const name of CREDENTIAL_NAMES) {
    const value = record[name];
    if (typeof value === "string" && value !== "") values[name] = value;
  }
  return values;
}

/**
 * The credentials this command has, each with where it came from: the
 * environment, else the kennel's file, else the machine's. A kennel that is
 * `~/.sheep` itself is one file, not two.
 */
export function readCredentials(): Partial<Record<CredentialName, Kept>> {
  const machinePath = machineCredentialsPath();
  const kennelPath = kennelCredentialsPath();
  const machine = readFile(machinePath);
  const kennel = kennelPath === machinePath ? {} : readFile(kennelPath);
  const found: Partial<Record<CredentialName, Kept>> = {};
  for (const name of CREDENTIAL_NAMES) {
    const fromEnv = process.env[CREDENTIAL_ENV[name]];
    if (fromEnv) found[name] = { value: fromEnv, from: "environment", path: null };
    else if (kennel[name] !== undefined) found[name] = { value: kennel[name], from: "kennel", path: kennelPath };
    else if (machine[name] !== undefined) found[name] = { value: machine[name], from: "machine", path: machinePath };
  }
  return found;
}

/** The account token, wherever it is kept: what `deploy()` and `deleteStation()` read. */
export function accountToken(): Kept | undefined {
  return readCredentials().cloudflare;
}

/** The model key, wherever it is kept: what `deploy()` puts on the home and the rig holds in `.dev.vars`. */
export function modelKey(): Kept | undefined {
  return readCredentials().anthropic;
}

/**
 * Writes `~/.sheep/credentials`, mode 600, keeping every key it is not
 * setting; returns the path. The kennel's file is never written here.
 */
export function writeCredentials(values: Partial<Record<CredentialName, string>>): string {
  const path = machineCredentialsPath();
  const after = { ...readFile(path) };
  for (const name of CREDENTIAL_NAMES) {
    const value = values[name];
    if (value !== undefined) after[name] = value;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(after, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

/** Where one is, for a report: a path, the variable that carried it, or nothing. Never a value. */
export function whereKept(name: CredentialName, kept: Kept | undefined): string {
  if (kept === undefined) return "none kept";
  return kept.from === "environment" ? `from ${CREDENTIAL_ENV[name]} in the environment` : `kept in ${kept.path}`;
}

/** `sheep home`'s one line: which are kept and where, never a value. */
export function credentialsLine(found: Partial<Record<CredentialName, Kept>> = readCredentials()): string {
  return `credentials: ${CREDENTIAL_NAMES.map((name) => `${CREDENTIAL_PROSE[name]} ${whereKept(name, found[name])}`).join("; ")}`;
}

/** `sheep home --json`'s shape: the same, in fields. */
export function credentialsReport(found: Partial<Record<CredentialName, Kept>> = readCredentials()): Record<CredentialName, { from: Kept["from"]; path: string | null } | null> {
  return {
    cloudflare: found.cloudflare === undefined ? null : { from: found.cloudflare.from, path: found.cloudflare.path },
    anthropic: found.anthropic === undefined ? null : { from: found.anthropic.from, path: found.anthropic.path },
  };
}
