/**
 * The tip and the said file (shear phase 0): how a command hears that a
 * newer build is out, and how every line shear adds is said once.
 *
 * The tip is the release branch's manifest as GitHub serves it, whose
 * `sheep.commit` and `sheep.builtAt` are the newest build there is.
 * `SHEEP_TIP` names another URL (the fakes serve one), and `SHEEP_TIP=0`
 * turns it off, which every ring sets so none reaches GitHub. A command
 * from the release hands one fetch of it to a child process started
 * detached and never waited for, at most once a day and at most one ask in
 * ten minutes; the child writes the tip into the said file and is gone, and
 * the notice is said by the first command to end after that, most often
 * the next (shear phase 0, reworked: the walk found a fetch in the command's
 * own process, aborted at its exit, never landed against a local home).
 *
 * The said file is `~/.sheep/tip.json`, beside `tools`, never per kennel:
 * the tip last fetched and when, when a command last asked for it, the tip
 * commit the notice was last said for, and the pair of builds the skew
 * line was last said for. A missing or unreadable file is empty, so the
 * worst a broken one costs is a line said again.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type BuildSide, cliBuild, describeBuild, skewLine } from "./local.js";

/** The release branch's manifest, as GitHub serves it. */
export const TIP_URL = "https://raw.githubusercontent.com/dglazkov/sheep/release/package.json";

/** How long a kept tip is good for before a command fetches it again. */
export const TIP_FRESH_MS = 24 * 60 * 60 * 1000;

/** How long the one fetch may take; after that the child gives up, and a command after the ask's ten minutes tries again. */
export const TIP_TIMEOUT_MS = 2_000;

/** How long an ask holds off the next: an unreachable GitHub costs one child in this long. */
export const ASK_FRESH_MS = 10 * 60 * 1000;

/** `~/.sheep/tip.json`, as `readSaid` reads it: every field absent until something put it there. */
export interface Said {
  /** The tip last fetched: its build, and when it was fetched (ISO). */
  tip?: { commit: string; builtAt: string; at: string };
  /** When a command last started a child to fetch the tip (ISO), written before the child starts. */
  asked?: string;
  /** The tip commit the notice was last said for. */
  noticed?: string;
  /** The pair the skew line was last said for, `<home commit>:<cli commit>`. */
  skew?: string;
}

/** The said file: the machine's, under `HOME`, so a ring's fresh `HOME` has its own. */
export function saidPath(): string {
  return join(homedir(), ".sheep", "tip.json");
}

/** Where the tip is fetched from: `SHEEP_TIP` when set, the release branch's manifest when not; undefined when `SHEEP_TIP=0`. */
export function tipUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const named = env.SHEEP_TIP;
  if (named === "0") return undefined;
  return named === undefined || named === "" ? TIP_URL : named;
}

/** `CI` set to anything but empty, `0`, or `false`: a machine nobody reads the lines on, so none is said and no tip is fetched. */
export function underCi(env: NodeJS.ProcessEnv = process.env): boolean {
  const ci = env.CI;
  return ci !== undefined && ci !== "" && ci !== "0" && ci.toLowerCase() !== "false";
}

/** The said file, each field kept only when it has its shape; a missing or unreadable file, or one that is not JSON, is empty. */
export function readSaid(path: string = saidPath()): Said {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object") return {};
  const raw = parsed as { tip?: Partial<NonNullable<Said["tip"]>>; asked?: unknown; noticed?: unknown; skew?: unknown };
  const said: Said = {};
  const tip = raw.tip;
  if (tip && typeof tip.commit === "string" && typeof tip.builtAt === "string" && typeof tip.at === "string") said.tip = { commit: tip.commit, builtAt: tip.builtAt, at: tip.at };
  if (typeof raw.asked === "string") said.asked = raw.asked;
  if (typeof raw.noticed === "string") said.noticed = raw.noticed;
  if (typeof raw.skew === "string") said.skew = raw.skew;
  return said;
}

/**
 * The said file written whole, through a file beside it renamed into
 * place, so a command reading it while another writes reads one or the
 * other. A failure to write is swallowed: a verb never fails for the line
 * it would have said.
 */
export function writeSaid(said: Said, path: string = saidPath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const partial = `${path}.${process.pid}`;
    writeFileSync(partial, `${JSON.stringify(said, null, 2)}\n`);
    renameSync(partial, path);
  } catch {
    // a HOME that cannot be written: the line is said again next time
  }
}

/** Whether the tip is fetched: none kept, or the kept one fetched a day ago or more (or at a time that does not parse). */
export function tipDue(said: Said, now: number = Date.now()): boolean {
  if (said.tip === undefined) return true;
  const at = Date.parse(said.tip.at);
  return Number.isNaN(at) || now - at >= TIP_FRESH_MS;
}

/** Whether a child may be started: no ask kept, or the kept one ten minutes old or more (or at a time that does not parse). */
export function askDue(said: Said, now: number = Date.now()): boolean {
  if (said.asked === undefined) return true;
  const at = Date.parse(said.asked);
  return Number.isNaN(at) || now - at >= ASK_FRESH_MS;
}

/**
 * The child's whole program, run as `node --input-type=module -e` so it
 * depends on nothing beside it: not the bundle's layout under the
 * release, nor `dist/` under a checkout. The URL, the said file's path,
 * and the timeout come in `process.argv`, never spliced into the code.
 * One fetch, no retry; a manifest with a `sheep` stamp is merged into the
 * said file as `tip`, through a file beside it renamed into place, and
 * anything else (unreachable, too slow, not a manifest) writes nothing.
 */
export const TIP_CHILD = `
import { readFileSync, renameSync, writeFileSync } from "node:fs";
const [url, path, timeout] = process.argv.slice(1);
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(Number(timeout)), headers: { accept: "application/json" } });
  const stamp = response.ok ? (await response.json())?.sheep : undefined;
  if (stamp && typeof stamp.commit === "string" && stamp.commit !== "" && typeof stamp.builtAt === "string" && !Number.isNaN(Date.parse(stamp.builtAt))) {
    let said = {};
    try {
      const kept = JSON.parse(readFileSync(path, "utf8"));
      if (kept !== null && typeof kept === "object" && !Array.isArray(kept)) said = kept;
    } catch {}
    said.tip = { commit: stamp.commit, builtAt: stamp.builtAt, at: new Date().toISOString() };
    const partial = path + "." + process.pid;
    writeFileSync(partial, JSON.stringify(said, null, 2) + "\\n");
    renameSync(partial, path);
  }
} catch {}
`;

/**
 * The ask (shear phase 0, reworked): nothing when the tip is off, under
 * `CI`, from a command with no stamp (a checkout, which never says the
 * notice), when the kept tip is less than a day old, or when a command
 * asked less than ten minutes ago. Otherwise `asked` is written to the
 * said file, and then a child is started detached, its stdio ignored and
 * unreferenced, so the verb's exit waits on nothing; the child fetches the
 * tip and writes it (`TIP_CHILD`). A child that cannot be started is
 * swallowed: a verb never fails for the line it would have said.
 */
export function startTip(path: string = saidPath()): void {
  const url = tipUrl();
  if (url === undefined || underCi() || cliBuild().builtAt === null) return;
  const said = readSaid(path);
  if (!tipDue(said) || !askDue(said)) return;
  writeSaid({ ...said, asked: new Date().toISOString() }, path);
  try {
    const child = spawn(process.execPath, ["--input-type=module", "-e", TIP_CHILD, "--", url, path, String(TIP_TIMEOUT_MS)], { detached: true, stdio: "ignore" });
    child.once("error", () => {
      // no child: the next ask, ten minutes on, tries again
    });
    child.unref();
  } catch {
    // no child: the next ask, ten minutes on, tries again
  }
}

/**
 * The notice (shear phase 0), or nothing: when the kept tip was built
 * after this command, is not this command's own commit, and is not the
 * commit the notice was last said for. A command with no time (a
 * checkout) is never told.
 */
export function noticeLine(stamp: BuildSide, said: Said): string | undefined {
  const tip = said.tip;
  if (tip === undefined || stamp.builtAt === null || tip.commit === stamp.commit || tip.commit === said.noticed) return undefined;
  const tipAt = Date.parse(tip.builtAt);
  const ownAt = Date.parse(stamp.builtAt);
  if (Number.isNaN(tipAt) || Number.isNaN(ownAt) || tipAt <= ownAt) return undefined;
  return `sheep: a newer build ${describeBuild(tip)} is out; this command is ${describeBuild(stamp)}; \`npm install -g github:dglazkov/sheep#release\` updates it\n`;
}

/**
 * What a command says as it ends (shear phase 0), and the said file
 * brought up to date: the notice, when the tip is on; then the skew line
 * from the build the home's header named, once per pair. Nothing under
 * `CI`. `home` is undefined when no response came back, or the home sent
 * no header (a home from before shear). Returns the text for stderr.
 */
export function sayAtExit(home: BuildSide | undefined, local: boolean, path: string = saidPath()): string {
  if (underCi()) return "";
  const cli = cliBuild();
  const said = readSaid(path);
  const marks: Pick<Said, "noticed" | "skew"> = {};
  let text = "";
  const notice = tipUrl() === undefined ? undefined : noticeLine(cli, said);
  if (notice !== undefined) {
    text += notice;
    marks.noticed = said.tip!.commit;
  }
  if (home !== undefined) {
    const skew = skewLine(home, cli, local);
    const pair = `${home.commit}:${cli.commit}`;
    if (skew !== undefined && said.skew !== pair) {
      text += skew;
      marks.skew = pair;
    }
  }
  // The marks go over the file as it is now, read again right before the write: a tip the child renamed in since the read
  // above is kept, not written over with the copy from before it landed.
  if (text !== "") writeSaid({ ...readSaid(path), ...marks }, path);
  return text;
}
