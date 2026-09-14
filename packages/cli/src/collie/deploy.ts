/**
 * The collie's Worker on the account (collie phase 2): the deploy `collie
 * setup` runs at its **collie** step, and `collie deploy [--now]`, the same
 * deploy again from this package with the secrets kept.
 *
 * One path, the station's parts: wrangler from the tools directory
 * `deploy.ts` keeps (`wranglerBin`: the release's pin under
 * `~/.sheep/tools`, the checkout's own), run with the account token in its
 * environment; the base config found where the rig finds it (`rigConfig`:
 * `collie/wrangler.jsonc` beside the bundle in a release, whose `main` is
 * the emitted `worker.mjs` served with `no_bundle`, or
 * `packages/collie/wrangler.jsonc` in a checkout, which wrangler bundles
 * from source); and a derived config under the kennel,
 * `<kennel>/collie/wrangler.jsonc`, with `main` made absolute and the name
 * the Worker's. The name is `<station>-collie`, from the station's name in
 * the kennel's config. Under a checkout the smit is defined into the Worker
 * as `COLLIE_BUILD` (`markFor`, the station's mark); a release's Worker
 * carries its own stamp already.
 *
 * The three secrets ride with the Worker's upload as one version, through
 * `wrangler deploy --secrets-file` reading a named pipe (`withSecretsPipe`),
 * never an argument and never a file's content: `COLLIE_SHEEP_HOME` and
 * `COLLIE_SHEEP_TOKEN`, the station's address and token as the kennel's
 * config holds them, and `COLLIE_TOKEN`, minted here the first time and kept
 * after in the config's `collie` block beside the Worker's name and address,
 * so a second run redeploys the same Worker with the same token.
 *
 * **The guard** is sheep's (shear phase 1), in the collie's words: a
 * redeploy of the collie this kennel recorded asks it `GET /report` with the
 * kept token first, and refuses (`MidTurn`, the station's shape, exit 2)
 * while an agent's sheep is `running` or `waiting`, since the new Worker
 * restarts the object mid-turn; `--now` deploys anyway. A collie that does
 * not answer is deployed, since that is the recovery path.
 *
 * `SHEEP_TEST_COLLIE_URL` is the seam the station's `SHEEP_TEST_STATION_URL`
 * is: asked in place of the collie's `workers.dev` address, for the door, the
 * report, and the end. Every ring strips it.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { closeSync, constants as fsConstants, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { configPath, readConfigFile, sheepDir, writeConfigFile } from "../config.js";
import { accountToken, CREDENTIAL_ENV } from "../credentials.js";
import { type Account, AccountApi, address, markFor, MidTurn, type MidTurnSheep, parseJsonc, Refusal, tail, validateName, wrangler, type WranglerResult, wranglerBin } from "../deploy.js";
import { type BuildSide, readStamp } from "../local.js";
import { CollieHome, Unreachable } from "./home.js";
import { answersCollie, rigConfig } from "./local.js";

/** The collie Worker's name beside a station: `<station>-collie`. */
export const collieName = (station: string): string => `${station}-collie`;

/** Where a request meant for the collie's address goes: the address, or the seam in its place. */
export function collieProbe(address: string): string {
  const seam = process.env.SHEEP_TEST_COLLIE_URL;
  return seam === undefined || seam === "" ? address : seam;
}

/** The directory the derived config lives in: `<kennel>/collie/`, beside the station's `deploy/`. */
export function collieDeployDir(): string {
  return join(sheepDir(), "collie");
}

/**
 * The derived config's text: the base's with `$schema` dropped, `main` absolute against the base's directory, and the
 * name the Worker's. A base with an environment is refused, since the collie rents nothing and ships its top level alone.
 */
export function deriveCollieConfig(baseText: string, basePath: string, name: string): string {
  const { $schema: _schema, ...config } = parseJsonc(baseText);
  if (config.env !== undefined) throw new Error(`${basePath} names an environment; the collie's Worker is its top level alone`);
  if (typeof config.main !== "string") throw new Error(`${basePath} names no main`);
  return `${JSON.stringify({ ...config, name, main: resolve(dirname(resolve(basePath)), config.main) }, null, 2)}\n`;
}

function writeCollieConfig(name: string): string {
  const base = rigConfig();
  const dir = collieDeployDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "wrangler.jsonc");
  writeFileSync(path, deriveCollieConfig(readFileSync(base, "utf8"), base, name));
  return path;
}

/** The station the collie stands beside: what its two secrets are. */
export interface StationSide {
  name: string;
  home: string;
  token: string;
}

export interface CollieDeployOptions {
  station: StationSide;
  /** The account token, which reaches wrangler's environment and the API's header and nothing else. */
  token: string;
  account: Account;
  /** Put the three secrets (setup); `collie deploy` keeps the ones the Worker holds. */
  secrets: boolean;
  /** Deploy over agents mid-turn, which the guard otherwise refuses. */
  now?: boolean;
  say?: (text: string) => void;
}

export interface CollieDeployReport {
  name: string;
  address: string;
  state: "deployed" | "redeployed";
  /** The bearer: minted by this run, or kept from the kennel's config. Never the value. */
  token: "minted" | "kept";
  /** Which secrets were put; empty when a redeploy kept them. */
  secrets: string[];
  /** Whether `GET /` answered `collie` within a minute of the deploy. */
  answers: boolean;
  /** The mark: the release's stamp, or the checkout's smit. */
  build: BuildSide;
  /** The agents the guard found mid-turn, which `--now` restarted; null when nothing was asked. */
  interrupted: number | null;
  config: string;
  wrangler: string;
}

/** The collie block as the kennel's config holds a deployed one: its name, address, and token; undefined for none or the rig's. */
export function deployedBlock(config: Record<string, unknown> | undefined): { name: string; address: string; token: string } | undefined {
  const block = config?.collie as { name?: unknown; address?: unknown; token?: unknown; local?: unknown } | undefined;
  if (block === undefined || block === null || typeof block !== "object" || block.local === true) return undefined;
  if (typeof block.name !== "string" || typeof block.address !== "string" || typeof block.token !== "string" || block.token === "") return undefined;
  return { name: block.name, address: block.address, token: block.token };
}

/** The guard's refusal, in the collie's words and the station's shape. */
export function collieMidTurn(address: string, busy: MidTurnSheep[]): MidTurn {
  return new MidTurn(
    address,
    busy,
    `these sheep are mid-turn for the collie at ${address}: a deploy restarts the collie, which rejoins their turns within a lap, and the canvas reads them as not answerable until it does; nothing was deployed; \`collie deploy --now\` deploys anyway`,
  );
}

/** The guard's text as `cli.ts` prints it: `<sheep id>  <agent> on "<canvas>"` one per line, then the sentence. */
export function collieMidTurnText(refusal: MidTurn): string {
  return `${refusal.sheep.map((one) => `${one.id}  ${one.task ?? ""}\n`).join("")}collie: ${refusal.message}\n`;
}

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/** How long a deploy waits for the collie to be up: two minutes; `SHEEP_TEST_COLLIE_READY_MS` shortens it in a test. */
export function readyWaitMs(): number {
  const seam = Number(process.env.SHEEP_TEST_COLLIE_READY_MS);
  return process.env.SHEEP_TEST_COLLIE_READY_MS !== undefined && Number.isFinite(seam) && seam >= 0 ? seam : 120_000;
}

/** How many authorized answers in a row make the collie up. */
export const READY_IN_A_ROW = 5;

/** The gap between two asks: a second; `SHEEP_TEST_COLLIE_READY_GAP_MS` shortens it in a test. */
function readyGapMs(): number {
  const seam = Number(process.env.SHEEP_TEST_COLLIE_READY_GAP_MS);
  return process.env.SHEEP_TEST_COLLIE_READY_GAP_MS !== undefined && Number.isFinite(seam) && seam >= 0 ? seam : 1_000;
}

/** One `GET /home` with the bearer on a connection of its own (no agent, so no kept-alive socket answers twice): the status and whether the header came. */
function askHome(url: string, token: string): Promise<{ status: number; build: boolean }> {
  const target = new URL("/home", url);
  const client = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolveAsk, rejectAsk) => {
    const request = client(target, { method: "GET", agent: false, headers: { authorization: `Bearer ${token}`, connection: "close" }, timeout: 5_000 }, (response) => {
      response.resume();
      response.once("end", () => resolveAsk({ status: response.statusCode ?? 0, build: response.headers["x-collie-build"] !== undefined }));
      response.once("error", rejectAsk);
    });
    request.once("timeout", () => request.destroy(new Error("no answer in 5s")));
    request.once("error", rejectAsk);
    request.end();
  });
}

/**
 * Whether the collie is up: `GET /home` with the bearer answering 200 with `x-collie-build` `READY_IN_A_ROW` times in a
 * row, a gap apart, each on a fresh connection, within `readyWaitMs()`; anything else starts the count again. For a
 * while after a deploy and its secret puts the edge answers from no Worker (404), from a version without the token
 * (401), and from the right one, request by request (release ca1eec6's co4), so one authorized answer is not up.
 * `progress` hears the count as it moves. `last` names the last few answers, newest last.
 */
export async function readyWithToken(url: string, token: string, progress: (inARow: number) => void = () => {}): Promise<{ ready: boolean; last: string }> {
  const deadline = Date.now() + readyWaitMs();
  const answers: string[] = [];
  let inARow = 0;
  for (;;) {
    let answer: string;
    try {
      const got = await askHome(url, token);
      answer = got.status === 200 && !got.build ? "200 without x-collie-build" : String(got.status);
      inARow = got.status === 200 && got.build ? inARow + 1 : 0;
    } catch (error) {
      answer = error instanceof Error ? error.message : String(error);
      inARow = 0;
    }
    answers.push(answer);
    progress(inARow);
    if (inARow >= READY_IN_A_ROW) return { ready: true, last: answers.slice(-READY_IN_A_ROW).join(", ") };
    if (Date.now() >= deadline) return { ready: false, last: answers.slice(-5).join(", ") };
    await sleep(Math.min(readyGapMs(), Math.max(0, deadline - Date.now())));
  }
}

/**
 * The secrets handed to wrangler through a named pipe, not a file (collie phase 2). `--secrets-file` takes a path and
 * reads it whole; `/dev/stdin` would do on macOS but not on Linux, where a child's stdin is a socket and opening it by
 * path is ENXIO. So a FIFO, mode 600, in a private temporary directory (mode 700, `mkdtemp`'s): the values pass through
 * the kernel's pipe and are never written to a disk, never in an argument, and the directory is removed in `finally`
 * whatever wrangler did. The write waits for wrangler to open the pipe (a non-blocking open answers ENXIO until a reader
 * has it), and gives up when wrangler has ended without reading.
 */
export async function withSecretsPipe(values: Record<string, string>, run: (path: string) => Promise<WranglerResult>): Promise<WranglerResult> {
  const dir = mkdtempSync(join(tmpdir(), "collie-secrets-"));
  const fifo = join(dir, "secrets.json");
  try {
    const made = spawnSync("mkfifo", ["-m", "600", fifo], { encoding: "utf8" });
    if (made.error !== undefined || made.status !== 0) throw new Error(`mkfifo could not make the pipe the secrets pass through (${made.error?.message ?? made.stderr.trim()}); nothing was deployed`);
    const payload = JSON.stringify(values);
    let ended = false;
    const feeding = (async () => {
      while (!ended) {
        try {
          const fd = openSync(fifo, fsConstants.O_WRONLY | fsConstants.O_NONBLOCK);
          try {
            writeSync(fd, payload);
          } finally {
            closeSync(fd);
          }
          return;
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENXIO")) throw error;
        }
        await sleep(20);
      }
    })();
    try {
      return await run(fifo);
    } finally {
      ended = true;
      await feeding.catch(() => undefined);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The agents mid-turn at the collie, from `GET /report` with the kept token; undefined when it does not answer, since then nothing can be known. */
async function midTurnAtCollie(address: string, token: string): Promise<MidTurnSheep[] | undefined> {
  const probe = collieProbe(address);
  if (!(await answersCollie(probe))) return undefined;
  try {
    // The timeout unreferenced, so a report that answered at once does not hold the command open for the rest of it.
    const report = await Promise.race([new CollieHome({ address: probe, token }).report(), new Promise<undefined>((resolveTimeout) => setTimeout(() => resolveTimeout(undefined), 10_000).unref())]);
    if (report === undefined) return undefined;
    return report.rooms.flatMap((room) =>
      room.agents.filter((agent) => agent.sheep !== null && (agent.lane === "running" || agent.lane === "waiting")).map((agent) => ({ id: agent.sheep!, task: `${agent.name} on "${room.title}"`, state: agent.lane as MidTurnSheep["state"] })),
    );
  } catch (error) {
    if (error instanceof Unreachable || error instanceof Error) return undefined;
    throw error;
  }
}

/**
 * The collie's Worker, deployed or redeployed. A `Refusal` before wrangler runs is exit 2 with nothing made; an `Error`
 * after is exit 1, and the Worker may already be live, which `collie setup` again finishes.
 */
export async function deployCollie(options: CollieDeployOptions): Promise<CollieDeployReport> {
  const say = options.say ?? (() => {});
  const { account, token } = options;
  const name = collieName(options.station.name);
  try {
    validateName(name);
  } catch {
    throw new Refusal(`the collie's Worker would be named ${name}, which is not a Worker name (at most 63 characters, lowercase letters, digits, and hyphens); nothing was deployed`);
  }
  const stamp = readStamp();
  const mark = markFor(stamp, new Date());
  const api = new AccountApi(token);
  const subdomain = await api.subdomain(account.id);
  if (subdomain === undefined) throw new Refusal(`the account ${account.name} has no workers.dev subdomain, and the collie's address needs one; \`sheep home deploy --subdomain <name>\` registers one; nothing was deployed`);
  const workers = await api.workers(account.id);
  const state: CollieDeployReport["state"] = workers.includes(name) ? "redeployed" : "deployed";
  const collieAddress = address(name, subdomain);

  // The token: the kennel's, when its block names this Worker; minted otherwise, and kept in the block below.
  const existing = readConfigFile();
  const block = deployedBlock(existing);
  const kept = block !== undefined && block.name === name ? block.token : undefined;
  if (!options.secrets && kept === undefined) throw new Refusal(`this kennel keeps no token for ${name}, so a deploy that keeps the secrets would leave the collie unreachable from here; \`collie setup\` deploys it with a token this kennel keeps; nothing was deployed`);

  // The guard, before wrangler: a collie this kennel recorded, that answers, is asked who is mid-turn.
  const busy = state === "redeployed" && kept !== undefined ? await midTurnAtCollie(collieAddress, kept) : undefined;
  if (busy !== undefined && busy.length > 0 && options.now !== true) throw collieMidTurn(collieAddress, busy);
  const interrupted = busy === undefined ? null : busy.length;

  const bin = wranglerBin(stamp, say);
  const config = writeCollieConfig(name);
  const cwd = dirname(config);
  // The Worker and its three secrets are one version (release cc475fb's co4): a version without `COLLIE_TOKEN` kept
  // answering some requests 401 even after the new one answered five times in a row, so none may ever exist.
  // `wrangler deploy --secrets-file` (wrangler 4.129) binds them as `secret_text` in the same upload; a redeploy that
  // keeps them passes no file, and the new version inherits what the Worker holds.
  const bearer = kept ?? randomBytes(24).toString("hex");
  const secrets: [string, string][] = options.secrets
    ? [
        ["COLLIE_SHEEP_HOME", options.station.home],
        ["COLLIE_SHEEP_TOKEN", options.station.token],
        ["COLLIE_TOKEN", bearer],
      ]
    : [];
  say(secrets.length === 0 ? "collie: uploading the Worker, its secrets kept\n" : "collie: uploading the Worker with its secrets, as one version\n");
  const define = stamp === undefined ? ["--define", `COLLIE_BUILD:${JSON.stringify(JSON.stringify(mark))}`] : [];
  const deployed =
    secrets.length === 0
      ? await wrangler(bin, ["deploy", "--config", config, ...define], { token, accountId: account.id, cwd })
      : await withSecretsPipe(Object.fromEntries(secrets), (path) => wrangler(bin, ["deploy", "--config", config, ...define, "--secrets-file", path], { token, accountId: account.id, cwd }));
  if (deployed.code !== 0) throw new Error(`wrangler deploy --config ${config} exited ${deployed.code}:\n${tail(deployed)}`);

  // Past here the Worker is live, so a failure is exit 1 and says that running setup again finishes it.
  try {
    // The block: this Worker, its address, its token; the rest of the config as it was.
    const { collie: _collie, ...rest } = readConfigFile() ?? {};
    writeConfigFile({ ...rest, collie: { name, address: collieAddress, token: bearer } });
    // Ready is an authorized answer: `GET /` answers `collie` from the first version, before any secret, and each put is a
    // new version, so only `GET /home` with the token just put (or kept) says the version that holds it is serving.
    // The count leads the line, so the stage's key (up to its first comma) stays one line that moves rather than a stack.
    say(`collie: answers with its token in a row, 0 of ${READY_IN_A_ROW}\n`);
    let said = 0;
    const waited = await readyWithToken(collieProbe(collieAddress), bearer, (inARow) => {
      if (inARow === said) return;
      said = inARow;
      say(`collie: answers with its token in a row, ${inARow} of ${READY_IN_A_ROW}\n`);
    });
    if (!waited.ready) {
      throw new Error(`${collieAddress} did not answer GET /home with this kennel's token ${READY_IN_A_ROW} times in a row within ${Math.round(readyWaitMs() / 1000)}s (the last answers: ${waited.last}), so the Worker that holds it is not serving everywhere yet`);
    }
    const answers = true;
    return { name, address: collieAddress, state, token: kept === undefined ? "minted" : "kept", secrets: secrets.map(([secret]) => secret), answers, build: mark, interrupted, config: configPath(), wrangler: config };
  } catch (error) {
    throw new Error(`the Worker ${name} is deployed at ${collieAddress}, and what followed failed; \`collie setup\` again finishes it\n${error instanceof Error ? error.message : String(error)}`);
  }
}

/** `collie deploy [--now]`: the collie this kennel recorded, redeployed from this package with its secrets kept. */
export async function redeployCollie(options: { now: boolean; say?: (text: string) => void }): Promise<CollieDeployReport> {
  const config = readConfigFile();
  const raw = config?.collie as { local?: unknown; address?: unknown } | undefined;
  if (raw !== undefined && raw !== null && raw.local === true) throw new Refusal(`the collie this kennel names is the rig at ${String(raw.address)}; \`collie local\` restarts it from this checkout, and nothing of it is on an account to deploy`);
  const block = deployedBlock(config);
  if (block === undefined) throw new Refusal(`no collie is set up in this kennel (${sheepDir()}); \`collie setup\` deploys one beside the station`);
  const home = typeof config?.home === "string" ? config.home : undefined;
  const stationToken = typeof config?.token === "string" ? config.token : undefined;
  if (home === undefined || stationToken === undefined || !block.name.endsWith("-collie")) {
    throw new Refusal(`this kennel's config names the collie ${block.name} but not the station beside it; \`collie setup\` deploys it again with both; nothing was deployed`);
  }
  const token = accountToken()?.value;
  if (token === undefined) throw new Refusal(`collie deploy needs the account token, and nothing on this machine keeps one and ${CREDENTIAL_ENV.cloudflare} is not set; \`sheep setup\` keeps one, or \`collie setup\` at your own terminal asks for it; nothing was deployed`);
  const account = await new AccountApi(token).account();
  return deployCollie({ station: { name: block.name.slice(0, -"-collie".length), home, token: stationToken }, token, account, secrets: false, now: options.now, say: options.say });
}

/** `collie deploy`'s report as prose. */
export function redeployWords(report: CollieDeployReport): string {
  return (
    `collie: ${report.name} ${report.state} at ${report.address} (${report.answers ? "answers" : "not answering yet"})\n` +
    `build: ${report.build.commit} (${report.build.builtAt ?? "unstamped"})\n` +
    `secrets: ${report.secrets.length === 0 ? "kept as the Worker holds them" : report.secrets.join(", ")}\n` +
    (report.interrupted !== null && report.interrupted > 0 ? `interrupted: ${report.interrupted}\n` : "") +
    `config: ${report.config}\n`
  );
}
