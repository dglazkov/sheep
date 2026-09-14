/**
 * `collie local` and `collie local stop` (collie phase 1): the rig, the
 * collie's Worker under `wrangler dev` beside the kennel's local home, the
 * developer's and the rings', never the shepherd's.
 *
 * Through `../local.ts`'s machinery, in its shape: the daemon is detached
 * under `<kennel>/local/collie/`, its output appended to `log`, its state
 * under `state/`, its secrets a `.dev.vars` beside them, mode 600, handed
 * to wrangler with `--env-file` so no secret is ever an argument, and
 * `collie.json` the record (pid, port, address, stamp). A record is running
 * only while its pid is alive and its port answers `collie` on `GET /`.
 * The wrangler is the one `sheep home local` runs (`ensureWrangler`): the
 * checkout's own, or the release's pin under `~/.sheep/tools`. The config
 * is `packages/collie/wrangler.jsonc` in a checkout, which bundles from
 * source, and `collie/wrangler.jsonc` beside the release's bundle, as the
 * local home finds `home/`.
 *
 * The secrets are three: `COLLIE_TOKEN`, minted here the first time and kept
 * after; and the kennel's local home's address and token as
 * `COLLIE_SHEEP_HOME` and `COLLIE_SHEEP_TOKEN`, so the rig's sheep are that
 * home's. The local home is started on demand, as any `sheep` verb starts
 * it; a kennel with no local home is refused with `sheep home local` named.
 * A rig whose secrets changed is restarted. The kennel's config gains the
 * `collie` block, `{ address, token, local: true }`, so every `collie` verb
 * from this kennel talks to the rig; a block naming a deployed collie is
 * never overwritten.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configPath, readConfigFile, sheepDir, writeConfigFile } from "../config.js";
import { alive, ensureWrangler, freePort, localDir, localStatus, pickPort, readDevVarsFile, readStamp, signal, startLocalHome, writeDevVarsFile } from "../local.js";
import { CollieHome } from "./home.js";

export interface LocalOptions {
  /** The words after `local`: `[]`, or `["stop"]`. */
  args: string[];
  json: boolean;
  out: (text: string) => void;
  err: (text: string) => void;
  heard: (collie: CollieHome) => void;
}

/** `collie.json`: what the last start recorded; `pid` null once stopped. */
export interface RigRecord {
  pid: number | null;
  port: number;
  url: string;
  stamp: { commit: string; builtAt: string } | null;
  startedAt: string;
}

/** A refusal of the rig's, printed by `cli.ts` as `collie: <message>` with exit 1. */
export class RigRefusal extends Error {}

const codeDir = dirname(fileURLToPath(import.meta.url));

export function rigDir(): string {
  return join(localDir(), "collie");
}

const recordPath = () => join(rigDir(), "collie.json");
const devVarsPath = () => join(rigDir(), ".dev.vars");
const logPath = () => join(rigDir(), "log");

/** The config the rig runs: the package's `collie/wrangler.jsonc` beside the bundle, `packages/collie/wrangler.jsonc` in a checkout. */
export function rigConfig(): string {
  const config = readStamp() === undefined ? join(codeDir, "..", "..", "..", "collie", "wrangler.jsonc") : join(codeDir, "..", "collie", "wrangler.jsonc");
  if (!existsSync(config)) throw new Error(`the collie's config is missing at ${config}`);
  return config;
}

export function readRigRecord(): RigRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(recordPath(), "utf8")) as Partial<RigRecord>;
    if (typeof parsed.port !== "number" || typeof parsed.url !== "string") return undefined;
    return { pid: typeof parsed.pid === "number" ? parsed.pid : null, port: parsed.port, url: parsed.url, stamp: parsed.stamp ?? null, startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "" };
  } catch {
    return undefined;
  }
}

function writeRigRecord(record: RigRecord): void {
  writeFileSync(recordPath(), `${JSON.stringify(record, null, 2)}\n`);
}

/** Whether the port answers as a collie. */
export async function answersCollie(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok && (await response.text()).startsWith("collie");
  } catch {
    return false;
  }
}

async function rigRunning(): Promise<{ record: RigRecord | undefined; running: boolean }> {
  const record = readRigRecord();
  if (record === undefined) return { record, running: false };
  return { record, running: record.pid !== null && alive(record.pid) && (await answersCollie(record.url)) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The rig's secrets, mode 600: the token kept once minted, the local home's address and token as they are now. */
function writeDevVars(home: string, homeToken: string): { token: string; changed: boolean } {
  const before = readDevVarsFile(devVarsPath());
  const vars = new Map(before);
  if (!vars.get("COLLIE_TOKEN")) vars.set("COLLIE_TOKEN", randomBytes(24).toString("hex"));
  vars.set("COLLIE_SHEEP_HOME", home);
  vars.set("COLLIE_SHEEP_TOKEN", homeToken);
  return { token: vars.get("COLLIE_TOKEN")!, changed: writeDevVarsFile(devVarsPath(), before, vars) };
}

function logTail(lines = 5): string {
  try {
    return readFileSync(logPath(), "utf8").trim().split("\n").slice(-lines).join(" | ");
  } catch {
    return "";
  }
}

/** Stops the rig as `collie local stop` does; `collie rm` on a rig ends with it (collie phase 2). */
export async function stopRig(): Promise<{ stopped: boolean; record: RigRecord | undefined }> {
  const { record, running } = await rigRunning();
  if (record === undefined) return { stopped: false, record };
  if (!running) {
    if (record.pid !== null) writeRigRecord({ ...record, pid: null });
    return { stopped: false, record: { ...record, pid: null } };
  }
  const pid = record.pid!;
  signal(pid, "SIGTERM");
  const deadline = Date.now() + 10_000;
  while (alive(pid) && Date.now() < deadline) await sleep(100);
  if (alive(pid)) signal(pid, "SIGKILL");
  const gone = Date.now() + 5_000;
  while ((await answersCollie(record.url)) && Date.now() < gone) await sleep(100);
  writeRigRecord({ ...record, pid: null });
  return { stopped: true, record: { ...record, pid: null } };
}

export async function runLocal(options: LocalOptions): Promise<number> {
  const [verb, ...rest] = options.args;
  if (rest.length > 0 || (verb !== undefined && verb !== "stop")) {
    options.err(`collie: collie local takes nothing, or stop; not ${JSON.stringify(options.args.join(" "))}\n`);
    return 2;
  }
  if (verb === "stop") {
    const { stopped, record } = await stopRig();
    if (options.json) options.out(`${JSON.stringify({ stopped, url: record?.url ?? null })}\n`);
    else options.out(stopped ? `collie: the rig at ${record!.url} stopped\n` : "collie: the rig was not running\n");
    return 0;
  }

  // The kennel's local home, which the rig's sheep live at: refused without one, started on demand with one.
  const kennel = readConfigFile();
  if (kennel === undefined || kennel.local !== true || typeof kennel.home !== "string" || typeof kennel.token !== "string") {
    throw new RigRefusal(`the rig stands beside this kennel's local home, and ${sheepDir()} has none; \`sheep home local\` starts one`);
  }
  const block = kennel.collie as { address?: unknown; local?: unknown } | undefined;
  if (block !== undefined && block !== null && block.local !== true) {
    throw new RigRefusal(`this kennel's config names a deployed collie at ${String(block.address)}, and the rig would take its place; the rig is for a kennel with a local home and no collie deployed from it`);
  }
  const say = (text: string) => options.err(text.replace(/^sheep: /, "collie: "));
  const home = await localStatus();
  const station = home.running ? { url: home.record!.url } : await startLocalHome({ say });
  const stationToken = (readConfigFile()?.token as string | undefined) ?? kennel.token;

  const dir = rigDir();
  mkdirSync(join(dir, "state"), { recursive: true });
  const secrets = writeDevVars(station.url, stationToken);
  const before = await rigRunning();
  let state: "started" | "running" | "restarted" = "running";
  if (before.running && secrets.changed) {
    say("collie: the rig's secrets changed; restarting it\n");
    await stopRig();
    state = "restarted";
  }
  let record = before.record;
  if (!before.running || secrets.changed) {
    const stamp = readStamp();
    const seam = process.env.SHEEP_TEST_WRANGLER;
    const wrangler = seam ? seam : ensureWrangler(stamp, say).bin;
    const port = await pickPort(before.record?.port);
    const inspector = await freePort();
    const log = openSync(logPath(), "a");
    const url = `http://127.0.0.1:${port}`;
    const args = [wrangler, "dev", "--local", "--config", rigConfig(), "--env-file", devVarsPath(), "--port", String(port), "--inspector-port", String(inspector), "--persist-to", join(dir, "state"), "--log-level", "error", "--show-interactive-dev-session=false"];
    const child = spawn(process.execPath, args, { cwd: dir, detached: true, stdio: ["ignore", log, log], env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });
    closeSync(log);
    child.unref();
    if (child.pid === undefined) throw new Error("wrangler did not start");
    const deadline = Date.now() + 2 * 60_000;
    let up = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`the rig exited (${child.exitCode}) before answering on ${url}: ${logTail()}`);
      if (await answersCollie(url)) {
        up = true;
        break;
      }
      await sleep(250);
    }
    if (!up) {
      signal(child.pid, "SIGTERM");
      throw new Error(`the rig did not answer on ${url} within two minutes: ${logTail()}`);
    }
    record = { pid: child.pid, port, url, stamp: stamp === undefined ? null : { commit: stamp.commit, builtAt: stamp.builtAt }, startedAt: new Date().toISOString() };
    writeRigRecord(record);
    if (state === "running") state = "started";
  }
  if (record === undefined || record.pid === null) throw new Error("the rig has no record after starting");

  // The collie block: this kennel's verbs talk to the rig.
  const latest = readConfigFile() ?? kennel;
  const wanted = { address: record.url, token: secrets.token, local: true };
  const current = latest.collie as Record<string, unknown> | undefined;
  const wrote = current?.address !== wanted.address || current?.token !== wanted.token || current?.local !== true;
  if (wrote) writeConfigFile({ ...latest, collie: wanted });

  const collie = new CollieHome({ address: record.url, token: secrets.token });
  options.heard(collie);
  const view = await collie.home();
  if (options.json) {
    options.out(`${JSON.stringify({ url: record.url, pid: record.pid, state, dir, secrets: devVarsPath(), station: station.url, config: { path: configPath(), wrote }, home: view })}\n`);
    return 0;
  }
  options.out(
    `collie: the rig at ${record.url} (${state}, pid ${record.pid}), beside the local home at ${station.url}\n` +
      `secrets: ${devVarsPath()} (mode 600): COLLIE_TOKEN, COLLIE_SHEEP_HOME, COLLIE_SHEEP_TOKEN\n` +
      `config: ${configPath()} ${wrote ? "names it now" : "already names it"} in its collie block\n` +
      `${view.rooms === 0 ? "no canvas yet; `collie new --pass` hands it one" : `${view.rooms} ${view.rooms === 1 ? "canvas" : "canvases"}, ${view.on ? "standing by" : "off"}`}; \`collie local stop\` stops it\n`,
  );
  return 0;
}
