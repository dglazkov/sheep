/**
 * `collie setup` (collie phase 2): the third sitting, never the first. The
 * stile's own screen (`../stile/screen.ts`, `drawChecklist`) with a collie
 * drawn from the same shapes (`../stile/collie.ts`) and five steps:
 *
 * - **sheep**: the kennel `sheep` finds, and the station its config names,
 *   by address, token, and name. No kennel naming one, or one naming no
 *   token, is refused with `sheep setup` named; a kennel whose home is the
 *   local one is refused with `collie local` named, since a Worker on
 *   Cloudflare cannot reach a laptop.
 * - **isocan**: this machine's isocan identity, through the isocan on PATH
 *   (`./isocan.ts`); none, or no isocan at all, refused with `isocan setup`
 *   named.
 * - **account**: `CLOUDFLARE_API_TOKEN`, else the token `sheep setup` kept
 *   (`credentials.ts`), else a hidden prompt; a typed token is used for this
 *   sitting and kept nowhere new.
 * - **collie**: the Worker `<station>-collie` deployed through `./deploy.ts`
 *   with the three secrets on wrangler's stdin, `GET /` awaited, and the
 *   `collie` block written into the kennel's config. A second run redeploys
 *   the same Worker with the same token: the upgrade.
 * - **next**: `collie new`, in a directory bound to a canvas, is the whole
 *   of what is left.
 *
 * Every refusal names both sides — the station found or not, and the isocan
 * identity found or not — and nothing is deployed by a sitting that stops
 * before **collie** (journey 5's criterion). So the **sheep** step's verdict
 * is held while the identity is read, and the refusal, when there is one,
 * carries both.
 *
 * With `--json` or no terminal the same flow runs with a driver that asks
 * nothing: a value it would have asked for is a refusal naming what is
 * needed, as `sheep setup --json` never asks, and the report or the refusal
 * is one JSON object on stdout.
 */
import { configPath, readConfigFile, sheepDir } from "../config.js";
import { accountToken, CREDENTIAL_ENV } from "../credentials.js";
import { type Account, AccountApi, MidTurn, midTurnJson, Refusal, stationProbe } from "../deploy.js";
import { whoAnswers } from "../local.js";
import { collie as collieMascot } from "../stile/collie.js";
import { type Driver, tilde } from "../stile/flow.js";
import { type Checklist, drawChecklist, panelWords } from "../stile/screen.js";
import { shown, TOKENS_PAGE } from "../stile/words.js";
import { collieMidTurnText, collieName, type CollieDeployReport, deployCollie, type StationSide } from "./deploy.js";
import { IsocanMissing, type IsocanIdentity, isocanIdentity } from "./isocan.js";

/** The five steps, in the order the checklist draws them. */
export const COLLIE_STEPS = ["sheep", "isocan", "account", "collie", "next"] as const;
export type CollieStep = (typeof COLLIE_STEPS)[number];

/** The line under the name in the banner. */
export const COLLIE_TAGLINE = "isocan's rc, standing by beside your sheep";

/** The sentence the sitting ends on: the whole of what is left. */
export const COLLIE_NEXT = "collie new, in a directory bound to a canvas";

/** What a step's row says while it waits, before it has said anything. */
export const COLLIE_QUESTIONS: Record<CollieStep, string> = {
  sheep: "the station the collie stands beside",
  isocan: "who the collie arrives as at a canvas",
  account: "the Cloudflare account its Worker goes on",
  collie: "the collie's own Worker, beside the station",
  next: "what is done, and what is left",
};

/** One step's four things; the fourth's label is `collie`, and its text reads on from it. */
export const COLLIE_WORDS: Record<CollieStep, { what: string; where: string; cost: string; does: string }> = {
  sheep: {
    what: "the station the collie stands beside: the sheep home `sheep setup` deployed.",
    where: "the kennel sheep finds, .sheep/ at or above here, else ~/.sheep; a local home is the rig's, `collie local`.",
    cost: "nothing: the station is already yours, and the collie adds nothing to it.",
    does: "reads the station's address and token and gives them to its own Worker as secrets.",
  },
  isocan: {
    what: "who the collie arrives as at a canvas: your isocan identity on this machine.",
    where: "the isocan you set up here with `isocan setup`, found on PATH and asked through its own API.",
    cost: "nothing; no pass is minted until `collie new`.",
    does: "reads your name and nothing else; passes and badges stay isocan's.",
  },
  account: {
    what: "the token that proves the account your station is on is yours; the collie's Worker goes there too.",
    where: `kept by \`sheep setup\`, or CLOUDFLARE_API_TOKEN; otherwise made at ${shown(TOKENS_PAGE)}.`,
    cost: "free to read; the Worker is the next step.",
    does: "uses it for this sitting and keeps it nowhere new; for Cloudflare only.",
  },
  collie: {
    what: "one Worker, <station>-collie, with one Durable Object running isocan's rc awake.",
    where: "deployed from this package; run again, it redeploys the same Worker.",
    cost: "one object awake: about four dollars a month at list price, inside the plan's included duration.",
    does: "gives the Worker the station's address and token and a token of its own; the config keeps the last, mode 600.",
  },
  next: {
    what: "what is done, and what is left.",
    where: "the collie's address and the config on these lines.",
    cost: "nothing until a canvas is handed to it; `collie off` stops it standing by.",
    does: "asks for nothing more: `collie new`, in a directory bound to a canvas, is the whole of what is left.",
  },
};

const LABELS = { what: "what", where: "where", cost: "cost", does: "collie" } as const;

/** A step's words as the panel draws them at a width. */
export function collieWordsAt(step: CollieStep, width: number): { label: string; text: string }[] {
  const words = COLLIE_WORDS[step];
  return panelWords(
    (["what", "where", "cost", "does"] as const).map((thing) => ({ label: LABELS[thing], text: words[thing] })),
    width,
  );
}

/** What a sitting that stopped found on each side: the station, and the isocan identity. */
export interface Found {
  sheep: { kennel: string; home: string | null; name: string | null; local: boolean } | null;
  isocan: IsocanIdentity | null;
}

/**
 * A refusal of the sitting's: the step it stopped at, what it needs (`sheep`, `isocan`, `account`, `terminal`), the
 * paragraph for the shepherd, and what each side was found to be. Nothing was deployed.
 */
export class SetupRefusal extends Refusal {
  constructor(
    readonly step: CollieStep,
    message: string,
    readonly needs: string[],
    readonly found: Found,
  ) {
    super(message);
  }
}

/** A refusal as `--json` carries it. */
export function refusalJson(refusal: SetupRefusal): { refused: string; step: CollieStep; needs: string[]; sheep: Found["sheep"]; isocan: Found["isocan"] } {
  return { refused: refusal.message, step: refusal.step, needs: refusal.needs, sheep: refusal.found.sheep, isocan: refusal.found.isocan };
}

export interface CollieSetupReport {
  kennel: string;
  config: string;
  station: { name: string; home: string };
  isocan: IsocanIdentity;
  account: Account & { token: "environment" | "kennel" | "machine" | "typed" };
  collie: Pick<CollieDeployReport, "name" | "address" | "state" | "token" | "secrets" | "answers" | "build">;
  next: string;
}

export interface CollieFlowOptions {
  dir: string;
  driver: Driver<CollieStep>;
  /** Filled in as the sitting finds each side, so a driver's own refusal can carry what was found. */
  found?: Found;
}

/** The station's name: the config's, else the first label of a `workers.dev` address, which is how a joined kennel names none. */
function stationName(config: Record<string, unknown>, home: string): string | null {
  if (typeof config.name === "string" && config.name !== "") return config.name;
  try {
    const host = new URL(home).hostname;
    return host.endsWith(".workers.dev") ? host.split(".")[0]! : null;
  } catch {
    return null;
  }
}

/** The identity, or the sentence that says why there is none and the shorter line the screen draws for it; never throws. */
async function readIdentity(): Promise<{ identity: IsocanIdentity | null; refused?: string; line?: string }> {
  try {
    const identity = await isocanIdentity();
    const none = "no isocan identity on this machine; `isocan setup` names you, and the collie arrives as you";
    return identity === null ? { identity, refused: none, line: none } : { identity };
  } catch (error) {
    if (error instanceof IsocanMissing) return { identity: null, refused: error.message, line: "no `isocan` on this machine's PATH; `isocan setup` installs it and names you" };
    const said = `isocan could not say who you are here; ${error instanceof Error ? error.message : String(error)}; \`isocan setup\` names you`;
    return { identity: null, refused: said, line: said };
  }
}

/** The five steps. Nothing is deployed before the **collie** step, and nothing typed reaches a line. */
export async function runCollieFlow(options: CollieFlowOptions): Promise<CollieSetupReport> {
  const { driver } = options;

  // 1. sheep. The kennel and the station its config names; the verdict held until the identity is read.
  driver.say("sheep", "finding the kennel and the station it names");
  const kennel = sheepDir(options.dir);
  const config = readConfigFile() ?? {};
  const home = typeof config.home === "string" && config.home !== "" ? config.home : null;
  const local = config.local === true;
  const name = home === null ? null : stationName(config, home);
  const found: Found = options.found ?? { sheep: null, isocan: null };
  found.sheep = { kennel, home, name, local };
  let sheepRefused: string | undefined;
  // Each refusal's first clause is short, since the screen draws it in red on one row and the rest dim under it.
  if (home === null) sheepRefused = `no station in the kennel at ${tilde(kennel)}; the collie stands beside the one \`sheep setup\` deploys, and \`sheep setup\` at your own terminal is the first sitting`;
  else if (local) sheepRefused = `the kennel's home is local, at ${home}; a Worker on Cloudflare cannot reach a laptop; \`collie local\` is the rig for a local home`;
  else if (typeof config.token !== "string" || config.token === "") sheepRefused = `no token for the station at ${home}; \`sheep setup\` at your own terminal deploys or joins it again`;
  else if (name === null) sheepRefused = `no name for the station at ${home}; the collie's is made from it, and \`sheep setup\` at your own terminal records it`;
  else if ((await whoAnswers(stationProbe(name, home))) !== "sheep") sheepRefused = `the station ${name} does not answer; nothing at ${home} answers as a sheep home, and \`sheep setup\` at your own terminal deploys it again`;

  // 2. isocan. Read either way, so a refusal at either step names both sides.
  const read = await readIdentity();
  found.isocan = read.identity;
  const identityClause = read.identity === null ? "and no isocan identity was found here either (`isocan setup` names you)" : `and ${read.identity.name}'s isocan identity is here, waiting for it`;
  if (sheepRefused !== undefined) {
    driver.say("sheep", sheepRefused, "refused");
    throw new SetupRefusal("sheep", `${sheepRefused}; ${identityClause}; nothing was deployed`, read.identity === null ? ["sheep", "isocan"] : ["sheep"], found);
  }
  const station: StationSide = { name: name!, home: home!, token: config.token as string };
  driver.say("sheep", `${station.name}, ${shown(station.home)}`);
  driver.say("isocan", "finding this machine's isocan identity");
  if (read.identity === null) {
    driver.say("isocan", read.line!, "refused");
    throw new SetupRefusal("isocan", `${read.refused}; the station ${station.name} at ${station.home} is found and waits for it; nothing was deployed`, ["isocan"], found);
  }
  const identity = read.identity;
  driver.say("isocan", `${identity.name}, in ${tilde(identity.home)}`);

  // 3. account. The environment's, else the kept one, else typed at a hidden prompt; a typed one is kept nowhere.
  const kept = accountToken();
  let token = kept?.value;
  let from: CollieSetupReport["account"]["token"] = kept?.from ?? "typed";
  let account: Account;
  for (;;) {
    if (token === undefined) {
      token = (await driver.ask("account", "Cloudflare API token", true)).trim();
      from = "typed";
      if (token === "") {
        driver.say("account", "nothing was typed; the token is what proves the account is yours", "refused");
        token = undefined;
        continue;
      }
    }
    try {
      account = await new AccountApi(token).account();
      break;
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      if (from !== "typed") {
        const where = from === "environment" ? `${CREDENTIAL_ENV.cloudflare} in this environment` : `the account token kept in ${tilde(kept!.path!)}`;
        throw new SetupRefusal("account", `${where} is not accepted (${error.message}); nothing was deployed`, ["account"], found);
      }
      driver.say("account", error.message, "refused");
      token = undefined;
    }
  }
  driver.say("account", account.name);

  // 4. collie. The Worker, its secrets, the door, and the block in the config.
  driver.say("collie", `${readConfigFile()?.collie === undefined ? "deploying" : "redeploying"} ${collieName(station.name)} to ${account.name}`);
  let deployed: CollieDeployReport;
  try {
    deployed = await deployCollie({ station, token, account, secrets: true, say: (text) => driver.say("collie", text.replace(/^collie: /, "").trim()) });
  } catch (error) {
    // The step says it did not come up, in red, rather than the screen ending on a spinner; the sentence follows under it.
    if (!(error instanceof Refusal) && !(error instanceof MidTurn)) driver.say("collie", "the collie did not come up; the reason is under this screen", "refused");
    throw error;
  }
  driver.say("collie", deployed.answers ? deployed.address : `${deployed.address} (not answering yet)`);

  // 5. next.
  driver.say("next", COLLIE_NEXT);
  return {
    kennel,
    config: configPath(),
    station: { name: station.name, home: station.home },
    isocan: identity,
    account: { ...account, token: from },
    collie: { name: deployed.name, address: deployed.address, state: deployed.state, token: deployed.token, secrets: deployed.secrets, answers: deployed.answers, build: deployed.build },
    next: COLLIE_NEXT,
  };
}

/** The checklist `collie setup` draws at a terminal. */
export function collieChecklist(dir: string): Checklist<CollieStep, CollieSetupReport> {
  return {
    name: "collie",
    tagline: COLLIE_TAGLINE,
    mascot: collieMascot,
    steps: COLLIE_STEPS,
    questions: COLLIE_QUESTIONS,
    words: collieWordsAt,
    underBox: { account: { madeAt: TOKENS_PAGE, note: "used for this sitting and kept nowhere new" } },
    deploying: { step: "collie", keys: "the Worker takes a few seconds   Ctrl-C leaves it deploying" },
    finish: (report) => ({
      labelled: [
        ["collie", report.collie.address, report.collie.state === "deployed" ? "(deployed)" : "(redeployed, the same token)"],
        ["station", report.station.home],
        ["as", `${report.isocan.name}`, "(your isocan identity here)"],
        ["config", tilde(report.config), "(mode 600)"],
      ],
      box: { title: "what is left", lines: [COLLIE_NEXT] },
    }),
    interruptedWorking: "collie: setup was interrupted while it was working; `collie setup` again picks up from there\n",
    run: (driver) => runCollieFlow({ dir, driver }),
  };
}

/** A driver for no terminal: says nothing, takes each default, and refuses to ask. */
export function quietDriver(found: Found): Driver<CollieStep> {
  return {
    say() {},
    async choose(_step, choices) {
      return choices[0]!.value;
    },
    async ask(step) {
      throw new SetupRefusal(
        step,
        `collie setup needs the account token, and nothing on this machine keeps one and ${CREDENTIAL_ENV.cloudflare} is not set, and there is no terminal to ask at; nothing was deployed; \`sheep setup\` keeps one, or \`collie setup\` at your own terminal asks for it`,
        ["account", "terminal"],
        found,
      );
    },
  };
}

/** The report as prose, for no terminal without `--json`. */
export function setupWords(report: CollieSetupReport): string {
  return (
    `collie: ${report.collie.name} ${report.collie.state} at ${report.collie.address}${report.collie.answers ? "" : " (not answering yet)"}\n` +
    `station: ${report.station.name} at ${report.station.home}\n` +
    `isocan: ${report.isocan.name}\n` +
    `account: ${report.account.name} (${report.account.id})\n` +
    `config: ${report.config} names it in its collie block\n` +
    `next: ${report.next}\n`
  );
}

export interface SetupRun {
  json: boolean;
  explain: boolean;
  terminal: boolean;
  out: (text: string) => void;
  err: (text: string) => void;
}

/** `collie setup`, whole: the screen at a terminal, the quiet flow otherwise; the exit code. */
export async function runSetup(options: SetupRun): Promise<number> {
  const dir = process.cwd();
  try {
    if (options.terminal && !options.json) {
      await drawChecklist(collieChecklist(dir), { explain: options.explain });
      return 0;
    }
    const found: Found = { sheep: null, isocan: null };
    const report = await runCollieFlow({ dir, driver: quietDriver(found), found });
    options.out(options.json ? `${JSON.stringify(report)}\n` : setupWords(report));
    return 0;
  } catch (error) {
    if (error instanceof SetupRefusal) {
      if (options.json) options.out(`${JSON.stringify(refusalJson(error))}\n`);
      else options.err(`collie: ${error.message}\n`);
      return 2;
    }
    if (error instanceof MidTurn) {
      if (options.json) options.out(`${JSON.stringify(midTurnJson(error))}\n`);
      else options.err(collieMidTurnText(error));
      return 2;
    }
    if (error instanceof Refusal) {
      if (options.json) options.out(`${JSON.stringify({ refused: error.message })}\n`);
      else options.err(`collie: ${error.message}\n`);
      return 2;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) options.out(`${JSON.stringify({ failed: message })}\n`);
    else options.err(`collie: ${message}\n`);
    return 1;
  }
}
