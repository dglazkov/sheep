/**
 * The local home: a home on the dog's own machine, workerd under the
 * kennel's `local/`, started by the CLI, with no account behind it. Collar
 * phase 1; kennel phase 0 moved it from `~/.sheep/local` to the kennel, so
 * two directories run two homes, each with its own port, token, and store.
 *
 * The daemon is `wrangler dev` over the package's `home/wrangler.jsonc`
 * (the Worker `scripts/bundle.mjs` emitted) with `--persist-to` the
 * `state/` directory, detached, its output appended to `log`. Its secrets
 * are `.dev.vars` beside the state, mode 600, handed to wrangler with
 * `--env-file <path>`: wrangler reads that file in place of the
 * `.dev.vars` beside the config, so the config stays the package's and no
 * secret is ever an argument; the one argument is the file's path.
 * `home.json` records the pid, the port, and the build stamp; a record is
 * stale, and the home not running, unless the pid is alive AND the port
 * answers `sheep` on `GET /`, so a dead daemon whose pid was reused, or a
 * port taken by something else, is never mistaken for the home.
 *
 * Installed from the release, the code sits in `dist/` with the manifest
 * and `home/` beside it, and the manifest's `sheep` stamp names the
 * wrangler the Worker was built with; that version is installed once, by
 * `npm install`, into `~/.sheep/tools/` (the machine's, not the kennel's)
 * and reused after. In a checkout there is no stamp (the way `version()`
 * tells), and the daemon is the
 * checkout's own wrangler over `packages/cell/wrangler.jsonc`, which
 * bundles from source; the secrets file and the record are the same.
 *
 * Nothing overrides the directory: it is the kennel's, and a test or a
 * ring makes a fresh world with a working directory and `HOME`.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configPath, sheepDir, type SheepConfig } from "./config.js";

/** The release's build stamp, `sheep` in the manifest beside the code; absent in a checkout. */
export interface BuildStamp {
  commit: string;
  builtAt: string;
  wrangler: string;
}

/** `home.json`: what the last start recorded. `pid` is null once `sheep home stop` has stopped it. */
export interface HomeRecord {
  pid: number | null;
  port: number;
  url: string;
  stamp: BuildStamp | null;
  startedAt: string;
}

/** The package root: above `dist/`, which is `packages/cli/` in a checkout and the installed package otherwise. */
const packageDir = fileURLToPath(new URL("..", import.meta.url));

/** The build stamp from the manifest beside the code, or undefined in a checkout, where the manifest carries none. */
export function readStamp(): BuildStamp | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { sheep?: Partial<BuildStamp> };
    const stamp = manifest.sheep;
    if (stamp && typeof stamp.commit === "string" && typeof stamp.builtAt === "string" && typeof stamp.wrangler === "string") {
      return { commit: stamp.commit, builtAt: stamp.builtAt, wrangler: stamp.wrangler };
    }
  } catch {
    // no manifest beside the code
  }
  return undefined;
}

/** The kennel's local home: `<kennel>/local`, so a directory's home is its own. */
export function localDir(): string {
  return join(sheepDir(), "local");
}

/**
 * Where wrangler is installed once: `~/.sheep/tools` on every machine,
 * never per kennel. A kennel is a config and a store, not a toolchain, so
 * the second kennel on a machine finds the pin already fetched.
 */
export function toolsDir(): string {
  return join(homedir(), ".sheep", "tools");
}

const recordPath = () => join(localDir(), "home.json");
const devVarsPath = () => join(localDir(), ".dev.vars");
const logPath = () => join(localDir(), "log");

export function readRecord(): HomeRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(recordPath(), "utf8")) as Partial<HomeRecord>;
    if (typeof parsed.port !== "number" || typeof parsed.url !== "string") return undefined;
    return {
      pid: typeof parsed.pid === "number" ? parsed.pid : null,
      port: parsed.port,
      url: parsed.url,
      stamp: parsed.stamp && typeof parsed.stamp === "object" ? (parsed.stamp as BuildStamp) : null,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
    };
  } catch {
    return undefined;
  }
}

function writeRecord(record: HomeRecord): void {
  writeFileSync(recordPath(), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * A zombie: exited, and not yet reaped by its parent. A detached daemon in
 * a container with no init is one after it dies, and `kill(pid, 0)` keeps
 * answering for it (collar phase 3's finding); the process table says `Z`.
 * Linux answers from `/proc`; elsewhere `ps` does.
 */
function zombie(pid: number): boolean {
  if (process.platform === "linux") {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      // "pid (comm) state …": comm may hold spaces and parentheses, so the state is the first field after the last ")".
      return stat.slice(stat.lastIndexOf(")") + 1).trim().startsWith("Z");
    } catch {
      return false;
    }
  }
  const ps = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
  return ps.status === 0 && ps.stdout.trim().startsWith("Z");
}

/** There is such a process and it has not exited: a zombie has, whatever `kill(pid, 0)` says. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error) {
    // EPERM: there is such a process, and it is not ours to signal.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
  return !zombie(pid);
}

/** Who answers on the port: the home, something else, or nobody. */
export async function whoAnswers(url: string): Promise<"sheep" | "other" | "nobody"> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok && (await response.text()).startsWith("sheep") ? "sheep" : "other";
  } catch {
    return "nobody";
  }
}

export interface LocalStatus {
  record: HomeRecord | undefined;
  /** The pid is alive and the port answers `sheep`; anything less is a stale record. */
  running: boolean;
  answers: "sheep" | "other" | "nobody";
}

export async function localStatus(): Promise<LocalStatus> {
  const record = readRecord();
  if (record === undefined) return { record, running: false, answers: "nobody" };
  const answers = await whoAnswers(record.url);
  const running = record.pid !== null && alive(record.pid) && answers === "sheep";
  return { record, running, answers };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/** The port the record names when it is still free, so the address survives a stop; a fresh one otherwise. */
function pickPort(preferred: number | undefined): Promise<number> {
  if (preferred === undefined) return freePort();
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(freePort()));
    server.listen(preferred, "127.0.0.1", () => server.close(() => resolve(preferred)));
  });
}

/** `.dev.vars` as pairs; blank lines and `#` comments dropped. */
function readDevVars(): Map<string, string> {
  const vars = new Map<string, string>();
  let text: string;
  try {
    text = readFileSync(devVarsPath(), "utf8");
  } catch {
    return vars;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    vars.set(trimmed.slice(0, equals).trim(), trimmed.slice(equals + 1).trim());
  }
  return vars;
}

/**
 * The secrets file, mode 600. `SHEEP_TOKEN` is generated the first time
 * and kept after. With `faux` true the provider line goes in and any key
 * comes out; with `faux` false the provider line comes out and the key is
 * copied from `ANTHROPIC_API_KEY` when the environment has one, kept
 * from before otherwise; with `faux` undefined (a start on demand) the
 * file is left as it was, the token aside.
 */
function writeDevVars(faux: boolean | undefined): { token: string; key: "held" | "not held" | "faux"; changed: boolean } {
  const before = readDevVars();
  const vars = new Map(before);
  if (!vars.get("SHEEP_TOKEN")) vars.set("SHEEP_TOKEN", randomBytes(24).toString("hex"));
  if (faux === true) {
    vars.set("SHEEP_PROVIDER", "faux");
    vars.delete("SHEEP_ANTHROPIC_API_KEY");
  } else if (faux === false) {
    vars.delete("SHEEP_PROVIDER");
    if (process.env.ANTHROPIC_API_KEY) vars.set("SHEEP_ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  }
  const text = [...vars.entries()].map(([name, value]) => `${name}=${value}`).join("\n") + "\n";
  const changed = !existsSync(devVarsPath()) || text !== [...before.entries()].map(([name, value]) => `${name}=${value}`).join("\n") + "\n";
  if (changed) writeFileSync(devVarsPath(), text, { mode: 0o600 });
  chmodSync(devVarsPath(), 0o600);
  const key = vars.get("SHEEP_PROVIDER") === "faux" ? "faux" : vars.get("SHEEP_ANTHROPIC_API_KEY") ? "held" : "not held";
  return { token: vars.get("SHEEP_TOKEN")!, key, changed };
}

/** The config file as written, or nothing when it is absent or not JSON. */
function readConfigFile(): (SheepConfig & Record<string, unknown>) | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath(), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as SheepConfig & Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function writeConfigFile(config: Record<string, unknown>): void {
  mkdirSync(dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(configPath(), 0o600);
}

/**
 * The wrangler the daemon runs: the checkout's own when there is no
 * stamp, else the manifest's pinned version under `~/.sheep/tools/`,
 * installed there once with `npm install` and reused after. Returns the
 * path of `wrangler.js` and whether this call installed it.
 */
function ensureWrangler(stamp: BuildStamp | undefined, say: (text: string) => void): { bin: string; installed: boolean } {
  if (stamp === undefined) {
    const bin = join(packageDir, "..", "cell", "node_modules", "wrangler", "bin", "wrangler.js");
    if (!existsSync(bin)) throw new Error(`this is a checkout and wrangler is not installed at ${bin}; run pnpm install`);
    return { bin, installed: false };
  }
  const tools = toolsDir();
  const bin = join(tools, "node_modules", "wrangler", "bin", "wrangler.js");
  const installedVersion = () => {
    try {
      return (JSON.parse(readFileSync(join(tools, "node_modules", "wrangler", "package.json"), "utf8")) as { version?: string }).version;
    } catch {
      return undefined;
    }
  };
  if (installedVersion() === stamp.wrangler && existsSync(bin)) return { bin, installed: false };
  mkdirSync(tools, { recursive: true });
  // A manifest of its own, so npm installs here and does not go looking up the tree for a package to install into.
  if (!existsSync(join(tools, "package.json"))) writeFileSync(join(tools, "package.json"), `${JSON.stringify({ name: "sheep-tools", private: true }, null, 2)}\n`);
  say(`sheep: installing wrangler ${stamp.wrangler} into ${tools} (once; the Worker was built with it)\n`);
  const done = spawnSync("npm", ["install", "--save-exact", "--no-audit", "--no-fund", "--loglevel", "error", `wrangler@${stamp.wrangler}`], {
    cwd: tools,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
  if (done.status !== 0) throw new Error(`npm install wrangler@${stamp.wrangler} in ${tools} failed (exit ${done.status}):\n${(done.stderr || done.stdout || "").trim()}`);
  const version = installedVersion();
  if (version !== stamp.wrangler || !existsSync(bin)) throw new Error(`npm installed wrangler ${version ?? "(none)"} into ${tools}, not ${stamp.wrangler}`);
  return { bin, installed: true };
}

function wranglerConfig(stamp: BuildStamp | undefined): string {
  const config = stamp === undefined ? join(packageDir, "..", "cell", "wrangler.jsonc") : join(packageDir, "home", "wrangler.jsonc");
  if (!existsSync(config)) throw new Error(`the home's config is missing at ${config}`);
  return config;
}

function logTail(lines = 5): string {
  try {
    return readFileSync(logPath(), "utf8").trim().split("\n").slice(-lines).join(" | ");
  } catch {
    return "";
  }
}

/** Signals the daemon's whole process group (it is a session leader, detached), falling back to the pid alone. */
function signal(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(-pid, sig);
  } catch {
    try {
      process.kill(pid, sig);
    } catch {
      // already gone
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The daemon, detached over the config with the secrets file, until `GET /` answers `sheep`; the record written after. */
async function spawnDaemon(stamp: BuildStamp | undefined, wrangler: string, port: number): Promise<HomeRecord> {
  const dir = localDir();
  const state = join(dir, "state");
  mkdirSync(state, { recursive: true });
  const inspector = await freePort();
  const log = openSync(logPath(), "a");
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--local",
      "--config",
      wranglerConfig(stamp),
      "--env-file",
      devVarsPath(),
      "--port",
      String(port),
      "--inspector-port",
      String(inspector),
      "--persist-to",
      state,
      "--log-level",
      "error",
      "--show-interactive-dev-session=false",
    ],
    { cwd: dir, detached: true, stdio: ["ignore", log, log], env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } },
  );
  closeSync(log);
  child.unref();
  const pid = child.pid;
  if (pid === undefined) throw new Error("wrangler did not start");
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the local home exited (${child.exitCode}) before answering on ${url}: ${logTail()}`);
    if ((await whoAnswers(url)) === "sheep") {
      const record: HomeRecord = { pid, port, url, stamp: stamp ?? null, startedAt: new Date().toISOString() };
      writeRecord(record);
      return record;
    }
    await sleep(250);
  }
  signal(pid, "SIGTERM");
  throw new Error(`the local home did not answer on ${url} within two minutes: ${logTail()}`);
}

export interface StartOptions {
  /** true: the faux provider; false: a key from the environment; undefined: the secrets as they are (a start on demand). */
  faux?: boolean;
  /** Where progress goes: the wrangler install, a restart. Never a value from the secrets file. */
  say?: (text: string) => void;
}

export interface StartReport {
  url: string;
  port: number;
  pid: number;
  dir: string;
  /** What this call did: started a daemon, found one running, or restarted one whose secrets changed. */
  state: "started" | "running" | "restarted";
  key: "held" | "not held" | "faux";
  secrets: string;
  stamp: BuildStamp | null;
  wrangler: { version: string | "checkout"; installed: boolean };
  config: { path: string; wrote: boolean; names: string | undefined };
}

/**
 * `sheep home local`: the home under the kennel's `local/`, started if it was
 * not, and the config written when there is none. A running home whose
 * secrets this call changed (a key newly exported, the provider flipped)
 * is restarted, so what the report says held is what the home holds.
 */
export async function startLocalHome(options: StartOptions = {}): Promise<StartReport> {
  const say = options.say ?? (() => {});
  const dir = localDir();
  mkdirSync(dir, { recursive: true });
  const stamp = readStamp();
  const secrets = writeDevVars(options.faux);
  const before = await localStatus();
  let state: StartReport["state"] = "running";
  let record = before.record;
  if (before.running && secrets.changed) {
    say(`sheep: the local home's secrets changed; restarting it\n`);
    await stopLocalHome();
    state = "restarted";
  }
  let wrangler: { bin: string; installed: boolean } | undefined;
  if (!before.running || secrets.changed) {
    wrangler = ensureWrangler(stamp, say);
    record = await spawnDaemon(stamp, wrangler.bin, await pickPort(before.record?.port));
    if (state === "running") state = "started";
  }
  if (record === undefined || record.pid === null) throw new Error("the local home has no record after starting");

  // The config: written when absent, its address refreshed when it is this home's, left alone when it names another.
  const existing = readConfigFile();
  let wrote = false;
  let names: string | undefined;
  if (existing === undefined) {
    writeConfigFile({ home: record.url, token: secrets.token, local: true });
    wrote = true;
  } else if (existing.local === true) {
    if (existing.home !== record.url || existing.token !== secrets.token) {
      writeConfigFile({ ...existing, home: record.url, token: secrets.token, local: true });
      wrote = true;
    }
  } else {
    names = typeof existing.home === "string" ? existing.home : "(none)";
  }
  return {
    url: record.url,
    port: record.port,
    pid: record.pid,
    dir,
    state,
    key: secrets.key,
    secrets: devVarsPath(),
    stamp: stamp ?? null,
    wrangler: { version: stamp?.wrangler ?? "checkout", installed: wrangler?.installed ?? false },
    config: { path: configPath(), wrote, names },
  };
}

/**
 * `sheep home stop`: SIGTERM to the daemon when it is running, the record
 * kept with its pid cleared; a stale record is cleared too. The wait is
 * bounded: ten seconds after SIGTERM, three after SIGKILL, and a pid that
 * outlives both is reported as `unreaped` and left, never waited on
 * forever (collar phase 3's debt).
 */
export async function stopLocalHome(): Promise<{ stopped: boolean; record: HomeRecord | undefined; unreaped?: number }> {
  const status = await localStatus();
  const { record } = status;
  if (record === undefined) return { stopped: false, record };
  if (!status.running) {
    if (record.pid !== null) writeRecord({ ...record, pid: null });
    return { stopped: false, record: { ...record, pid: null } };
  }
  const pid = record.pid!;
  signal(pid, "SIGTERM");
  const deadline = Date.now() + 10_000;
  while (alive(pid) && Date.now() < deadline) await sleep(100);
  let unreaped: number | undefined;
  if (alive(pid)) {
    signal(pid, "SIGKILL");
    const killed = Date.now() + 3_000;
    while (alive(pid) && Date.now() < killed) await sleep(50);
    if (alive(pid)) unreaped = pid;
  }
  // The port lets go a moment after the process does.
  const gone = Date.now() + 5_000;
  while ((await whoAnswers(record.url)) !== "nobody" && Date.now() < gone) await sleep(100);
  writeRecord({ ...record, pid: null });
  return { stopped: true, record: { ...record, pid: null }, ...(unreaped === undefined ? {} : { unreaped }) };
}

/** The mode bits of the secrets file, for a report; undefined when there is none. */
export function secretsMode(): number | undefined {
  try {
    return statSync(devVarsPath()).mode & 0o777;
  } catch {
    return undefined;
  }
}

/** A refused connection, wherever fetch buried it: the error's own code, its cause, or one of an AggregateError's errors. */
export function isRefused(error: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (candidate: unknown): boolean => {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return false;
    seen.add(candidate);
    const record = candidate as { code?: unknown; cause?: unknown; errors?: unknown };
    if (record.code === "ECONNREFUSED") return true;
    if (walk(record.cause)) return true;
    return Array.isArray(record.errors) && record.errors.some(walk);
  };
  return walk(error);
}
