/**
 * `collie`, the second command of sheep's package (collie phase 1): the
 * shepherd's view of and hand on the collie Worker beside their station.
 * `bin/collie.js` calls `main`, as `bin/sheep.js` calls `../cli.ts`'s.
 *
 * The verbs of this phase: `collie` (the report), `log`, `off`, `on`,
 * `new`, and `pass`, each against the collie the kennel's config
 * names in its `collie` block; `--version`, `--help`, and `--agent-help`,
 * which need no collie. `new` and `pass` mint through the isocan on PATH
 * (`./isocan.ts`, collie phase 2), or take one with `--pass`; `pass --agent`
 * is refused as not in this build. `setup`, `deploy [--now]`, and `rm` are
 * the shepherd's (collie phase 2), through `./setup.ts`, `./deploy.ts`, and
 * `./rm.ts`. `local` is the rig's, through `./local.ts`.
 *
 * As `sheep` does in `../cli.ts`: the tip is asked for before a verb, by
 * `startTip`'s detached child, and at the end the notice and the skew line
 * are said once each on stderr (`./said.ts`), the skew line from the
 * `x-collie-build` the verb heard.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, readConfigFile, sheepDir } from "../config.js";
import { Sentence } from "../home.js";
import { readStamp } from "../local.js";
import { startTip } from "../tip.js";
import { ISOCAN_PIN } from "./floors.js";
import { CollieHome, type LogPage, Unreachable } from "./home.js";
import { Interrupted, readPass } from "./hidden.js";
import { LoopbackCanvas, mintCollie } from "./isocan.js";
import { sayAtCollieExit } from "./said.js";
import { COLLIE_USAGE } from "./usage.js";
import { logWords, loopbackWords, offWords, onWords, passWords, reportWords } from "./words.js";

/** How often `collie log --follow` asks for more. */
export const FOLLOW_MS = 2_000;

/** `collie --version`: the build this is, and the isocan commit its brain is pinned at. */
export function collieVersion(): string {
  const stamp = readStamp();
  return `${stamp === undefined ? "collie 0.0.0-checkout" : `collie ${stamp.commit} (${stamp.builtAt})`}; the brain is isocan ${ISOCAN_PIN}`;
}

/** Beside the code: `dist/` in a release, where the bundle is `dist/collie.mjs`; `packages/cli/dist/collie/` in a checkout. */
const codeDir = dirname(fileURLToPath(import.meta.url));

/** The guide this build ships: `dist/collie-guide.md` beside the bundle, or `packages/cli/collie-guide.md` in a checkout. */
export function collieGuidePath(): string {
  return readStamp() === undefined ? join(codeDir, "..", "..", "collie-guide.md") : join(codeDir, "collie-guide.md");
}

interface Parsed {
  json: boolean;
  follow: boolean;
  pass: boolean;
  /** `collie deploy --now`: deploy over agents mid-turn. */
  now: boolean;
  /** `collie setup --explain`: every step's words open as it is reached. */
  explain: boolean;
  since?: string;
  last?: string;
  agent?: string;
  canvas?: string;
  rest: string[];
  unknown: string[];
}

function parse(argv: readonly string[]): Parsed {
  const args = [...argv];
  const parsed: Parsed = { json: false, follow: false, pass: false, now: false, explain: false, rest: [], unknown: [] };
  const valued: Record<string, (value: string | undefined) => void> = {
    "--since": (value) => (parsed.since = value ?? ""),
    "--last": (value) => (parsed.last = value ?? ""),
    "--agent": (value) => (parsed.agent = value ?? ""),
    "--canvas": (value) => (parsed.canvas = value ?? ""),
  };
  while (args.length > 0) {
    const arg = args.shift()!;
    const equals = arg.indexOf("=");
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    if (flag in valued) valued[flag]!(equals === -1 ? args.shift() : arg.slice(equals + 1));
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--follow" || arg === "-f") parsed.follow = true;
    else if (arg === "--pass") parsed.pass = true;
    else if (arg === "--now") parsed.now = true;
    else if (arg === "--explain") parsed.explain = true;
    else if (arg.startsWith("-") && !["--help", "-h", "--version", "-v"].includes(arg)) parsed.unknown.push(arg);
    else parsed.rest.push(arg);
  }
  return parsed;
}

/** A refusal: one line on stderr and exit 1. */
function refuse(message: string): number {
  process.stderr.write(`collie: ${message}\n`);
  return 1;
}

/** A mistake in the arguments: the line, the usage, and exit 2. */
function misuse(message: string): number {
  process.stderr.write(`collie: ${message}\n\n${COLLIE_USAGE}`);
  return 2;
}

/** Runs `collie`; returns the exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes("--agent-help")) {
    process.stdout.write(readFileSync(collieGuidePath(), "utf8"));
    return 0;
  }
  const parsed = parse(argv);
  const command = parsed.rest[0];
  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(COLLIE_USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${collieVersion()}\n`);
    return 0;
  }
  if (parsed.unknown.length > 0) return misuse(`unknown option ${parsed.unknown[0]}`);
  startTip();
  let heard: CollieHome | undefined;
  try {
    return await run(command, parsed, (collie) => (heard = collie));
  } finally {
    const said = sayAtCollieExit(heard?.build);
    if (said !== "") process.stderr.write(said);
  }
}

/** Every verb that needs the kennel: the rig's hook, the refusals that need nothing, then the collie the config names. */
async function run(command: string | undefined, parsed: Parsed, hear: (collie: CollieHome) => void): Promise<number> {
  const out = (text: string) => void process.stdout.write(text);
  const err = (text: string) => void process.stderr.write(text);
  if (parsed.now && command !== "deploy") return misuse("--now goes with collie deploy");
  if (parsed.explain && command !== "setup") return misuse("--explain goes with collie setup");
  switch (command) {
    case undefined:
    case "log":
    case "off":
    case "on":
    case "new":
    case "pass":
      break;
    // The shepherd's three (collie phase 2): the sitting, the Worker again, and the end, each in its own module.
    case "setup":
    case "deploy":
    case "rm":
      if (parsed.rest.length > 1) return misuse(`${command} takes no ${JSON.stringify(parsed.rest[1])}`);
      return await shepherds(command, parsed, out, err);
    // The rig (collie phase 1's Worker half): `collie local [stop]`, the Worker under wrangler dev beside the local home.
    case "local": {
      try {
        const { runLocal } = await import("./local.js");
        return await runLocal({ args: parsed.rest.slice(1), json: parsed.json, out, err, heard: hear });
      } catch (error) {
        return refuse(error instanceof Error ? error.message : String(error));
      }
    }
    default:
      return misuse(`unknown command: ${command}`);
  }
  if (parsed.rest.length > 1) return misuse(`${command ?? "collie"} takes no ${JSON.stringify(parsed.rest[1])}`);
  // `--canvas` names the canvas a mint is for, so it goes with `new` and `pass` and not with a pass already minted.
  if (parsed.canvas !== undefined && command !== "new" && command !== "pass") return misuse(`--canvas goes with collie new and collie pass, not ${command === undefined ? "collie" : `collie ${command}`}`);
  if (parsed.canvas !== undefined && parsed.pass) return misuse("--canvas names the canvas collie mints a pass for; a pass taken with --pass already names its canvas");
  if (parsed.canvas === "") return misuse("--canvas needs a canvas's id or the start of its title");
  // Not in this build, and nothing asked of anyone: a pass for an agent (collie phase 3).
  if (command === "pass" && parsed.agent !== undefined) return refuse("collie pass --agent is not in this build yet; a pass minted for the agent, handed over with `collie pass`, makes it the collie's");

  const config = await loadConfig();
  if (config.collie === undefined) return refuse(`no collie is set up in this kennel (${sheepDir()}); \`collie setup\` deploys one beside the station`);
  let collie: CollieHome;
  try {
    collie = new CollieHome(config.collie);
  } catch {
    return refuse(`this kennel's config names the collie at ${JSON.stringify(config.collie.address)}, which is not an address; \`collie setup\` writes it again`);
  }
  hear(collie);
  try {
    switch (command) {
      case undefined: {
        const report = await collie.report();
        out(parsed.json ? `${JSON.stringify(report)}\n` : reportWords(report));
        return 0;
      }
      case "log":
        return await runLog(collie, parsed, out, err);
      case "off":
        out(offWords((await collie.off()).rooms));
        return 0;
      case "on":
        out(onWords((await collie.on()).rooms));
        return 0;
      case "new":
      case "pass": {
        // `--pass`: a pass already minted, at the hidden prompt or on stdin. Otherwise minted here through the isocan on
        // PATH, with this machine's identity, and handed over in the same breath: the address is in no argument, no
        // file, and never on the screen.
        let address: string;
        if (parsed.pass) {
          address = await readPass("the pass isocan printed (hidden): ");
          if (address === "") return refuse(process.stdin.isTTY ? "nothing was typed; no pass was handed to the collie" : "no pass on stdin; give its address as one line of stdin, or run this at a terminal to type it hidden");
        } else {
          const rig = (readConfigFile()?.collie as { local?: unknown } | undefined)?.local === true;
          try {
            address = (await mintCollie({ canvas: parsed.canvas, reachesLoopback: rig })).address;
          } catch (error) {
            if (error instanceof LoopbackCanvas) return refuse(loopbackWords(error.title, error.origin, collie.url.origin));
            throw error;
          }
        }
        out(passWords(await collie.passes(address)));
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof Interrupted || error instanceof Sentence || error instanceof Unreachable) return refuse(error.message);
    return refuse(error instanceof Error ? error.message : String(error));
  }
  return 0;
}

/** A count flag's value: a whole number at least `min`, or undefined when it is not one. */
function whole(value: string, min: number): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min ? n : undefined;
}

/** `collie log`: a page, printed; with `--follow`, every two seconds the rows after the last until Ctrl-C. */
async function runLog(collie: CollieHome, parsed: Parsed, out: (text: string) => void, err: (text: string) => void): Promise<number> {
  const since = parsed.since === undefined ? undefined : whole(parsed.since, 0);
  if (parsed.since !== undefined && since === undefined) return misuse(`--since needs a row's seq, a whole number, not ${JSON.stringify(parsed.since)}`);
  const last = parsed.last === undefined ? undefined : whole(parsed.last, 1);
  if (parsed.last !== undefined && last === undefined) return misuse(`--last needs a count of one or more, not ${JSON.stringify(parsed.last)}`);
  const print = (page: LogPage) => {
    for (const row of page.lines) out(parsed.json ? `${JSON.stringify(row)}\n` : logWords(row));
  };
  const first = await collie.log({ since, last });
  print(first);
  if (!parsed.follow) {
    if (first.lines.length === 0 && !parsed.json) err("collie: nothing in the log yet\n");
    return 0;
  }
  let cursor = first.last;
  let stopped = false;
  let wake: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    wake?.();
  };
  process.once("SIGINT", stop);
  let down = false;
  try {
    while (!stopped) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, FOLLOW_MS);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      if (stopped) break;
      try {
        const page = await collie.log({ since: cursor });
        print(page);
        cursor = page.last;
        down = false;
      } catch (error) {
        // A collie that went away (a deploy restarts it) is asked again, said once; a refusal ends the follow.
        if (!(error instanceof Unreachable)) throw error;
        if (!down) err(`collie: ${error.message}; asking again every two seconds\n`);
        down = true;
      }
    }
  } finally {
    process.off("SIGINT", stop);
  }
  return 0;
}

/**
 * `collie setup`, `collie deploy [--now]`, and `collie rm` (collie phase 2): the shepherd's. A refusal that made nothing
 * is exit 2, as `sheep home deploy`'s is, with `--json` its JSON on stdout; a failure after the account was touched is
 * exit 1.
 */
async function shepherds(command: "setup" | "deploy" | "rm", parsed: Parsed, out: (text: string) => void, err: (text: string) => void): Promise<number> {
  if (command === "setup") {
    const { runSetup } = await import("./setup.js");
    const { atTerminal } = await import("../stile/screen.js");
    return await runSetup({ json: parsed.json, explain: parsed.explain, terminal: atTerminal(), out, err });
  }
  const { MidTurn, midTurnJson, Refusal } = await import("../deploy.js");
  try {
    if (command === "deploy") {
      const { collieMidTurnText, redeployCollie, redeployWords } = await import("./deploy.js");
      try {
        const report = await redeployCollie({ now: parsed.now, say: parsed.json ? () => {} : err });
        out(parsed.json ? `${JSON.stringify(report)}\n` : redeployWords(report));
        return 0;
      } catch (error) {
        if (!(error instanceof MidTurn)) throw error;
        if (parsed.json) out(`${JSON.stringify(midTurnJson(error))}\n`);
        else err(collieMidTurnText(error));
        return 2;
      }
    }
    const { removeCollie } = await import("./rm.js");
    const report = await removeCollie({ json: parsed.json, out, err });
    if (parsed.json) out(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Refusal) {
      if (parsed.json) out(`${JSON.stringify({ refused: message })}\n`);
      else err(`collie: ${message}\n`);
      return 2;
    }
    err(`collie: ${message}\n`);
    return 1;
  }
}
