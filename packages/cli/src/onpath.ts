/**
 * Where `sheep` can be found, and where it cannot, whatever `which` says.
 * Collar phase 2; isocan's `onpath.ts`, whose #48 is the reason it exists.
 *
 * Run through `npx`, this process's own directory is on PATH: a cache npm
 * made for one command (`…/_npx/<hash>/node_modules/.bin`) and will not
 * keep. `which sheep` answers yes from in there while the shell running
 * the NEXT command answers "command not found", which is how a setup comes
 * to report "already on PATH" and install nothing. So the lookup skips
 * directories that do not outlive the command, and everything that reports
 * or hands out a path goes through it.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, join, sep } from "node:path";

const NPX_CACHE = `${sep}_npx${sep}`;
const LOCAL_BIN = `${sep}node_modules${sep}.bin`;

/** A directory whose contents vanish, or belong to one project: npx's cache, or a `node_modules/.bin`. */
export function transientDir(dir: string): boolean {
  return dir.includes(NPX_CACHE) || dir.endsWith(LOCAL_BIN);
}

function runnable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function real(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

/**
 * `which <command>`, minus the copies that are about to disappear. Returns
 * the path a later shell would find, or undefined when there is no such copy.
 */
export function findOnPath(command: string, pathVar: string = process.env.PATH ?? "", executable: (file: string) => boolean = runnable): string | undefined {
  for (const dir of pathVar.split(delimiter)) {
    if (!dir || transientDir(dir)) continue;
    const file = join(dir, command);
    // The link can lead back into the cache the directory scan just skipped.
    if (executable(file) && !transientDir(real(file))) return file;
  }
  return undefined;
}

/**
 * Where `npm install -g` puts binaries. Under nvm, fnm, asdf, or volta this
 * is a version-specific directory a non-login shell may never have been told
 * about, so setup says where the command went rather than assuming the next
 * shell can see it.
 */
export function globalBinDir(): string | undefined {
  const done = spawnSync("npm", ["prefix", "-g"], { encoding: "utf8" });
  const prefix = done.stdout?.trim();
  return prefix ? join(prefix, "bin") : undefined;
}
