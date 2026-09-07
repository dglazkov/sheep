/**
 * The name of a station: what a home deployed from a kennel is called on
 * the account. Kennel phase 1. A Worker name is account-wide, is the
 * address (`https://<name>.<you>.workers.dev`), and names the container
 * application too, so it is needed exactly once, at the first deploy from
 * a kennel, and is then recorded in the config as `name` and never
 * derived again: nothing about a directory is both stable and unique, and
 * recording needs uniqueness only once, when the account can be asked.
 *
 * This file is the pure rule. Station phase 1 is where it meets the
 * account: its deploy collects the account's Worker names and container
 * application names into `taken`, calls `mintName(kennelName(), taken,
 * --name)`, and writes the result to the config.
 */
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { kennelDir, sheepDir } from "./config.js";

/** The name the fallback kennel, `~/.sheep`, deploys as, and what an empty basename becomes. */
export const DEFAULT_NAME = "sheep";

/** Cloudflare's ceiling on a Worker name is longer; fifty leaves room for the counter and reads on a dashboard. */
const MAX_LENGTH = 50;

/**
 * The rule. `wanted` given (the deploy's `--name`): returned verbatim,
 * taken or not; whether it is a valid Worker name is the account's answer,
 * not this function's. Otherwise `basename` lowercased, every run of
 * characters outside `[a-z0-9]` one hyphen, hyphens trimmed from both
 * ends, cut to fifty characters and trimmed again so no hyphen trails,
 * and `sheep` when nothing is left. A result in `taken` gets `-2`, then
 * `-3`, until one is free: `taken` holds Workers and container
 * applications alike, since an application left behind by a failed
 * delete is a collision recast found the hard way.
 */
export function mintName(basename: string, taken: Set<string>, wanted?: string): string {
  if (wanted !== undefined) return wanted;
  const trim = (text: string) => text.replace(/^-+|-+$/g, "");
  let base = trim(basename.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  base = trim(base.slice(0, MAX_LENGTH));
  if (base === "") base = DEFAULT_NAME;
  if (!taken.has(base)) return base;
  for (let counter = 2; ; counter++) {
    const candidate = `${base}-${counter}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * What the deploy passes as the basename: the kennel directory's name,
 * or `sheep` when the kennel is the fallback `~/.sheep`, whose directory
 * is the home directory and names nobody's project. `from` is the
 * working directory in the product and a fixture's tree in a test.
 */
export function kennelName(from?: string): string {
  if (sheepDir(from) === join(homedir(), ".sheep")) return DEFAULT_NAME;
  return basename(kennelDir(from));
}
