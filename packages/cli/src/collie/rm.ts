/**
 * `collie rm` (collie phase 2, journey 3 step 3): the end of a collie, the
 * shepherd's, shaped as `sheep home delete` is.
 *
 * Before the prompt, the listing of what goes and what stays, read with
 * GETs alone: the badge the collie holds at each isocan home (the homes of
 * the rooms `GET /report` lists), the Worker and its object on the account,
 * and the kennel config's `collie` block go; every enrolment on each canvas
 * and every sheep in `sheep ls`, with its pasture, stay. Then the collie's
 * name typed at a terminal, or one line of stdin when there is none, and
 * nothing happens unless the line is the name; with neither a terminal nor
 * a line, the act is the shepherd's and it is refused. Then `DELETE /` at
 * the Worker, which ends the badges with isocan's own route; the Worker
 * deleted through the account API with its Durable Objects; and the block
 * cleared, with the rest of the config kept.
 *
 * The account token is `CLOUDFLARE_API_TOKEN`, else the one `sheep setup`
 * kept, else typed at a hidden prompt when there is a terminal; it is kept
 * nowhere new.
 *
 * **On the rig** (the collie block `local: true`, `collie local`'s), the same
 * listing, the Worker line saying the rig stops, and the same name typed;
 * then `DELETE /` at the rig, which ends the badges at each isocan home, the
 * rig stopped as `collie local stop` stops it, and the block cleared. No
 * account token is asked and the account API is not called: the rig is on
 * no account. Its name is the one the block names, else `collie`.
 */
import { rmSync } from "node:fs";
import { configPath, readConfigFile, sheepDir, writeConfigFile } from "../config.js";
import { accountToken, CREDENTIAL_ENV } from "../credentials.js";
import { AccountApi, readLine, Refusal } from "../deploy.js";
import { Sentence } from "../home.js";
import { collieDeployDir, collieProbe, deployedBlock } from "./deploy.js";
import { readPass } from "./hidden.js";
import { CollieHome, type Report, Unreachable } from "./home.js";
import { stopRig } from "./local.js";

/** What the listing names: the rooms and agents the collie reported, or null when it did not answer. */
export interface RmListing {
  name: string;
  address: string;
  /** The account the Worker is deleted from; null on the rig, which stops instead. */
  account: string | null;
  /** The isocan homes the collie holds a badge at, from its rooms; null when the report could not be read. */
  homes: string[] | null;
  rooms: { title: string; address: string }[] | null;
  sheep: { agent: string; id: string; pasture: string | null }[] | null;
  config: string;
}

export interface RmReport {
  listing: RmListing;
  /** The badges `DELETE /` ended; null when there was no Worker to ask. */
  ended: { origin: string; badge: string }[] | null;
  /** `stopped` and `not-running` on the rig. */
  worker: "deleted" | "absent" | "stopped" | "not-running";
  config: { path: string; state: "cleared" };
}

const quoted = (titles: string[]): string => (titles.length <= 2 ? titles.map((t) => `"${t}"`).join(" and ") : `${titles.slice(0, -1).map((t) => `"${t}"`).join(", ")}, and "${titles.at(-1)}"`);

/** The listing as the prompt's preface: what goes, what stays. */
export function rmWords(listing: RmListing): string {
  const unknown = "(the collie did not answer, so which is not known)";
  const homes = listing.homes === null ? `at each isocan home it stands by on ${unknown}` : listing.homes.length === 0 ? "none: it holds no badge yet" : `at ${listing.homes.join(", ")}`;
  const rooms = listing.rooms === null ? unknown : listing.rooms.length === 0 ? "(it stands by on no canvas)" : `on ${quoted(listing.rooms.map((room) => room.title))}`;
  const sheep =
    listing.sheep === null ? unknown : listing.sheep.length === 0 ? "(none of the collie's agents has one yet)" : listing.sheep.map((one) => `${one.id} (${one.agent}${one.pasture === null ? "" : `, pasture ${one.pasture}`})`).join(", ");
  return (
    `collie rm ends ${listing.name}, the collie at ${listing.address}\n` +
    `goes:  the badge it holds ${homes}, ended there\n` +
    (listing.account === null ? `       the rig at ${listing.address} and its object's rows, and the rig stopped\n` : `       the Worker ${listing.name} and its object, deleted from ${listing.account}\n`) +
    `       the collie block in ${listing.config}, cleared\n` +
    `stays: every enrolment ${rooms}\n` +
    `       every sheep in \`sheep ls\`, with its pasture: ${sheep}\n`
  );
}

function listingOf(name: string, address: string, account: string | null, report: Report | undefined): RmListing {
  if (report === undefined) return { name, address, account, homes: null, rooms: null, sheep: null, config: configPath() };
  return {
    name,
    address,
    account,
    homes: [...new Set(report.rooms.map((room) => room.origin))],
    rooms: report.rooms.map((room) => ({ title: room.title, address: room.address })),
    sheep: report.rooms.flatMap((room) => room.agents.filter((agent) => agent.sheep !== null).map((agent) => ({ agent: agent.name, id: agent.sheep!, pasture: agent.pasture }))),
    config: configPath(),
  };
}

export interface RmOptions {
  json: boolean;
  out: (text: string) => void;
  err: (text: string) => void;
  /** Reads the confirmation: the typed line at a terminal, one line of stdin without one. */
  confirm?: (prompt: string) => Promise<string>;
}

/** The name, typed at a terminal or one line of stdin, or a refusal; the same for a deployed collie and the rig. */
async function confirmName(name: string, options: RmOptions): Promise<void> {
  const confirm = options.confirm ?? readLine;
  const typed = await confirm("type the collie's name to confirm: ");
  if (typed === "" && process.stdin.isTTY !== true) {
    throw new Refusal(`collie rm needs the collie's name typed to confirm, and there is no terminal here and nothing on stdin; ending ${name} ends its badges and deletes its Worker, which is the shepherd's to confirm; nothing was ended`);
  }
  if (typed !== name) throw new Refusal(typed === "" ? `nothing typed; nothing was ended (the name is ${name})` : `${typed} is not ${name}; nothing was ended`);
}

/** `DELETE /` at a collie, its badges ended; a collie that does not answer or refuses is an `Error` with nothing deleted. */
async function endAt(collie: CollieHome, address: string, options: RmOptions): Promise<{ origin: string; badge: string }[]> {
  let ended: { origin: string; badge: string }[];
  try {
    ended = (await collie.end()).ended;
  } catch (error) {
    if (error instanceof Unreachable) throw new Error(`the collie at ${address} does not answer, so the badges it holds could not be ended; nothing was deleted, and \`collie rm\` again ends it once it answers (${error.message})`);
    if (error instanceof Sentence) throw new Error(`${error.message}; nothing was deleted`);
    throw error;
  }
  if (!options.json) options.out(ended.length === 0 ? "ended: no badge was held\n" : ended.map((badge) => `ended: the badge at ${badge.origin}\n`).join(""));
  return ended;
}

/** The block cleared, the rest of the config kept; the derived config goes with it. */
function clearBlock(name: string, options: RmOptions): void {
  const { collie: _collie, ...rest } = readConfigFile() ?? {};
  writeConfigFile(rest);
  rmSync(collieDeployDir(), { recursive: true, force: true });
  if (!options.json) options.out(`cleared: the collie block in ${configPath()}\ncollie: ${name} is gone; every enrolment and every sheep stays, and \`collie setup\` deploys a collie again\n`);
}

/** `collie rm` on the rig: the listing, the name, `DELETE /` at the rig, the rig stopped, the block cleared; no account. */
async function removeRig(block: { name: string; address: string; token: string }, options: RmOptions): Promise<RmReport> {
  const collie = new CollieHome({ address: block.address, token: block.token });
  let report: Report | undefined;
  try {
    report = await collie.report();
  } catch {
    report = undefined;
  }
  const listing = listingOf(block.name, block.address, null, report);
  if (!options.json) options.out(rmWords(listing));
  await confirmName(block.name, options);
  const ended = await endAt(collie, block.address, options);
  const { stopped } = await stopRig();
  if (!options.json) options.out(stopped ? `stopped: the rig at ${block.address}\n` : `the rig at ${block.address} was not running under this kennel\n`);
  clearBlock(block.name, options);
  return { listing, ended, worker: stopped ? "stopped" : "not-running", config: { path: configPath(), state: "cleared" } };
}

/** `collie rm`. A `Refusal` before anything is ended is exit 2; a failure after is an `Error`, exit 1. */
export async function removeCollie(options: RmOptions): Promise<RmReport> {
  const config = readConfigFile();
  const raw = config?.collie as { local?: unknown; address?: unknown; token?: unknown; name?: unknown } | undefined;
  if (raw !== undefined && raw !== null && raw.local === true && typeof raw.address === "string" && typeof raw.token === "string") {
    return await removeRig({ name: typeof raw.name === "string" && raw.name !== "" ? raw.name : "collie", address: raw.address, token: raw.token }, options);
  }
  const block = deployedBlock(config);
  if (block === undefined) throw new Refusal(`no collie is set up in this kennel (${sheepDir()}); \`collie setup\` deploys one beside the station`);
  const atTerminal = process.stdin.isTTY === true;

  // The account token, before anything is listed: the Worker's delete needs it, and nothing goes without it.
  let token = accountToken()?.value;
  if (token === undefined && atTerminal) token = (await readPass("Cloudflare API token (hidden): ")) || undefined;
  if (token === undefined) throw new Refusal(`collie rm needs the account token to delete the Worker, and nothing on this machine keeps one and ${CREDENTIAL_ENV.cloudflare} is not set; \`sheep setup\` keeps one, or \`collie rm\` at your own terminal asks for it; nothing was ended`);
  const api = new AccountApi(token);
  const account = await api.account();
  const onAccount = (await api.workers(account.id)).includes(block.name);

  // The listing: the collie's own report, read with its token; unknown when it does not answer.
  const collie = new CollieHome({ address: collieProbe(block.address), token: block.token });
  let report: Report | undefined;
  try {
    report = await collie.report();
  } catch {
    report = undefined;
  }
  const listing = listingOf(block.name, block.address, account.name, report);
  if (!options.json) options.out(rmWords(listing));

  // The confirmation: the name, typed, or nothing happens.
  await confirmName(block.name, options);

  // The end at the Worker first, so the badges are ended with isocan's own route while the object still holds them.
  let ended: RmReport["ended"] = null;
  if (onAccount) ended = await endAt(collie, block.address, options);
  const worker: RmReport["worker"] = onAccount && (await api.deleteWorker(account.id, block.name)) ? "deleted" : "absent";
  if (!options.json) options.out(worker === "deleted" ? `deleted: the Worker ${block.name} and its object\n` : `no Worker named ${block.name} on ${account.name}\n`);

  clearBlock(block.name, options);
  return { listing, ended, worker, config: { path: configPath(), state: "cleared" } };
}
