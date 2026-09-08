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
 *
 * Station phase 4: the home whole. When Docker answers (`docker version`),
 * the daemon is the config's `pen` environment, `wrangler dev --env pen`,
 * a container beside every cell. Wrangler demands a Cloudflare login
 * before it pulls any registry image locally, public or not, while its
 * Dockerfile path asks Docker; so the daemon runs over a config derived
 * from the package's, `<kennel>/local/wrangler.jsonc`, whose container is
 * the one-line `Dockerfile` beside it, `FROM <the config's image>`, and
 * Docker pulls the digest (for `linux/amd64`, under emulation on an arm64
 * machine): the registry's image, id for id, with no account in the loop.
 * The CLI names no image; the line is copied from the config, and both
 * files are rewritten at every start. A checkout's config names its own
 * Dockerfile already, and is run as it is. The container dials the home
 * back at `PEN_CELL_ORIGIN`, the
 * address Docker reaches this machine by: `host.docker.internal` on a Mac
 * and on Windows, the bridge network's gateway on Linux, where the daemon
 * also listens on every interface so that address reaches it. `PEN_IDLE`
 * is short, so a container is gone two minutes after its last command.
 * `--no-container` forces collar's home with Docker present; without
 * Docker the home is collar's and the report says in one sentence what a
 * container would add. The choice is the record's (`container`), honoured
 * by a start on demand, and a `sheep home local` that chooses otherwise
 * restarts the home. The daemon is named `sheep` in both environments
 * (`--name`), so the kennel's sheep, persisted under the Worker's name,
 * are the same sheep whichever way the home runs.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configPath, readConfigFile, sheepDir, writeConfigFile } from "./config.js";
import { parseJsonc } from "./deploy.js";

/** The release's build stamp, `sheep` in the manifest beside the code; absent in a checkout. `image` is the pen image the release named, by digest or by tag (station phase 2); a manifest from before it has none. */
export interface BuildStamp {
  commit: string;
  builtAt: string;
  wrangler: string;
  image?: string;
}

/** `home.json`: what the last start recorded. `pid` is null once `sheep home stop` has stopped it. */
export interface HomeRecord {
  pid: number | null;
  port: number;
  url: string;
  stamp: BuildStamp | null;
  startedAt: string;
  /** Station phase 4: whether the daemon is the `pen` environment, a container beside every cell. A record from before it says false. */
  container: boolean;
}

/** How long a local home's container stays up after its last command (`PEN_IDLE`): short, since the machine is the shepherd's. */
export const LOCAL_IDLE = "2m";

/** The sentence a home without Docker prints: what a container would add and how to get one (journey 6 step 2). */
export const NO_DOCKER_SENTENCE = "with Docker Desktop (or the docker engine) on this machine, sheep home local rents a container beside every cell, so sheep can clone, build, test, and push; https://docs.docker.com/get-docker/";

/** The package root: above `dist/`, which is `packages/cli/` in a checkout and the installed package otherwise. */
const packageDir = fileURLToPath(new URL("..", import.meta.url));

/** The build stamp from the manifest beside the code, or undefined in a checkout, where the manifest carries none. */
export function readStamp(): BuildStamp | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { sheep?: Partial<BuildStamp> };
    const stamp = manifest.sheep;
    if (stamp && typeof stamp.commit === "string" && typeof stamp.builtAt === "string" && typeof stamp.wrangler === "string") {
      return { commit: stamp.commit, builtAt: stamp.builtAt, wrangler: stamp.wrangler, ...(typeof stamp.image === "string" && stamp.image !== "" ? { image: stamp.image } : {}) };
    }
  } catch {
    // no manifest beside the code
  }
  return undefined;
}

/** One side of `sheep home`'s build report: a stamp's commit and time, or the checkout's value with no time. */
export interface BuildSide {
  commit: string;
  builtAt: string | null;
}

/** This command's build as `sheep home` reports it: the manifest's stamp, or the checkout's value. */
export function cliBuild(): BuildSide {
  const stamp = readStamp();
  return stamp === undefined ? { commit: "0.0.0-checkout", builtAt: null } : { commit: stamp.commit, builtAt: stamp.builtAt };
}

/** A build side as `sheep home` prints it: `<commit> (<builtAt>)`, or `0.0.0-checkout (unstamped)`. */
export function describeBuild(build: BuildSide): string {
  return `${build.commit} (${build.builtAt ?? "unstamped"})`;
}

/** An image reference as `sheep home` prints it (station phase 2): the reference, and whether it names the image by digest or by tag. */
export function describeImage(image: string): string {
  return `${image} (by ${image.includes("@sha256:") ? "digest" : "tag"})`;
}

/**
 * The one-line skew warning (station phase 0): when both sides carry a
 * time and the times differ, which is older and what updates it. A local
 * home is the package's own Worker from the moment it started, so the fix
 * there is a restart; a station's is a deploy from the newer package; an
 * older command's is the install. Unstamped sides are reported, not
 * warned about, and equal stamps say nothing.
 */
export function skewLine(home: BuildSide, cli: BuildSide, local: boolean): string | undefined {
  if (home.builtAt === null || cli.builtAt === null || home.builtAt === cli.builtAt) return undefined;
  if (home.builtAt < cli.builtAt) {
    const fix = local ? "`sheep home stop`; the next command restarts it from this package" : "`sheep home deploy` from this package updates it";
    return `sheep: the home's build ${describeBuild(home)} is older than this command's ${describeBuild(cli)}; ${fix}\n`;
  }
  return `sheep: this command's build ${describeBuild(cli)} is older than the home's ${describeBuild(home)}; \`npm install -g github:dglazkov/sheep#release\` updates it\n`;
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
      container: parsed.container === true,
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

/**
 * The wrangler the daemon runs, and the one `sheep home deploy` runs
 * (station phase 1): the checkout's own when there is no stamp, else the
 * manifest's pinned version under `~/.sheep/tools/`, installed there once
 * with `npm install` and reused after. Returns the path of `wrangler.js`
 * and whether this call installed it.
 */
export function ensureWrangler(stamp: BuildStamp | undefined, say: (text: string) => void): { bin: string; installed: boolean } {
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

/** What Docker answered: present with the engine's `os/arch`, or absent. */
export interface DockerAnswer {
  present: boolean;
  /** `docker version --format '{{.Server.Os}}/{{.Server.Arch}}'`, e.g. `linux/arm64`; null when Docker does not answer. */
  engine: string | null;
}

/**
 * Whether Docker answers on this machine: `docker version` asking the
 * engine, exit 0. A test says so through `SHEEP_TEST_DOCKER=present|absent`
 * and never runs docker; every ring strips `SHEEP_TEST_*`, so a ring's
 * homes ask the real thing.
 */
export function dockerAnswers(): DockerAnswer {
  const seam = process.env.SHEEP_TEST_DOCKER;
  if (seam === "present") return { present: true, engine: "test/present" };
  if (seam === "absent") return { present: false, engine: null };
  const done = spawnSync("docker", ["version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 });
  if (done.error || done.status !== 0) return { present: false, engine: null };
  const engine = (done.stdout || "").trim();
  return engine === "" ? { present: false, engine: null } : { present: true, engine };
}

/**
 * The address a container reaches this machine's home by: Docker Desktop
 * gives a Mac and Windows `host.docker.internal`; on Linux it is the
 * bridge network's gateway, asked of Docker and `172.17.0.1` when it does
 * not say (a test never asks).
 */
export function cellOrigin(port: number): string {
  if (process.platform !== "linux") return `http://host.docker.internal:${port}`;
  let gateway = "172.17.0.1";
  if (process.env.SHEEP_TEST_DOCKER === undefined) {
    const done = spawnSync("docker", ["network", "inspect", "bridge", "--format", "{{(index .IPAM.Config 0).Gateway}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 });
    const answered = (done.stdout || "").trim();
    if (!done.error && done.status === 0 && /^\d+\.\d+\.\d+\.\d+$/.test(answered)) gateway = answered;
  }
  return `http://${gateway}:${port}`;
}

/** The base config the daemon runs, or derives from: the package's `home/wrangler.jsonc`, the cell's in a checkout; a test names another through `SHEEP_TEST_LOCAL_CONFIG`. */
function wranglerConfig(stamp: BuildStamp | undefined): string {
  const seam = process.env.SHEEP_TEST_LOCAL_CONFIG;
  const config = seam ? seam : stamp === undefined ? join(packageDir, "..", "cell", "wrangler.jsonc") : join(packageDir, "home", "wrangler.jsonc");
  if (!existsSync(config)) throw new Error(`the home's config is missing at ${config}`);
  return config;
}

/** A derived local config (station phase 4): the text to write beside the record, the one-line Dockerfile, and the image the line names. */
export interface DerivedLocal {
  text: string;
  dockerfile: string;
  image: string;
}

/**
 * The rule for the derived config, a pure function over the base's text
 * and path: `$schema` dropped, `main` made absolute, and the `pen`
 * container's `image` replaced by `./Dockerfile` with the build context
 * `.`, both relative to the derived file's own directory; everything else
 * kept. The Dockerfile is exactly `FROM <the base's image reference>`.
 * Undefined when the base already names a Dockerfile (a path that exists
 * beside it: a checkout), which is run as it is.
 */
export function deriveLocalConfig(baseText: string, basePath: string): DerivedLocal | undefined {
  const { $schema: _schema, ...config } = parseJsonc(baseText);
  const dir = dirname(resolve(basePath));
  if (typeof config.main !== "string") throw new Error(`${basePath} names no main`);
  const env = (config.env ?? {}) as Record<string, unknown>;
  const pen = (env.pen ?? {}) as Record<string, unknown>;
  const containers = pen.containers;
  if (!Array.isArray(containers) || containers.length !== 1) throw new Error(`${basePath}: the pen environment must have exactly one container`);
  const container = containers[0] as Record<string, unknown>;
  const image = container.image;
  if (typeof image !== "string" || image === "") throw new Error(`${basePath}: the pen container names no image`);
  if ((image.startsWith(".") || image.startsWith("/")) && existsSync(resolve(dir, image))) return undefined;
  const { image_build_context: _context, ...rest } = container;
  const derived = {
    ...config,
    main: resolve(dir, config.main),
    env: { ...env, pen: { ...pen, containers: [{ ...rest, image: "./Dockerfile", image_build_context: "." }] } },
  };
  return { text: `${JSON.stringify(derived, null, 2)}\n`, dockerfile: `FROM ${image}\n`, image };
}

/**
 * Which config the daemon runs: the base as it is without a container, or
 * when the base names a Dockerfile already; else the derived one, written
 * with its Dockerfile under `local/` at every start.
 */
function daemonConfig(stamp: BuildStamp | undefined, container: boolean): { path: string; derived: boolean; from: string | null } {
  const base = wranglerConfig(stamp);
  if (!container) return { path: base, derived: false, from: null };
  const derived = deriveLocalConfig(readFileSync(base, "utf8"), base);
  if (derived === undefined) return { path: base, derived: false, from: null };
  const dir = localDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Dockerfile"), derived.dockerfile);
  const path = join(dir, "wrangler.jsonc");
  writeFileSync(path, derived.text);
  return { path, derived: true, from: derived.image };
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

/**
 * The daemon's arguments after `dev`: collar's, and with a container the
 * `pen` environment named `sheep` all the same (so the kennel's sheep are
 * one set of Durable Objects whichever way the home runs), the address
 * the container dials back, and the short idle; on Linux the daemon also
 * listens on every interface, since the bridge gateway does not reach
 * `localhost`. Exported for the tests that read a fake wrangler's log.
 */
export function daemonArgs(config: string, port: number, inspector: number, state: string, container: boolean): string[] {
  return [
    "dev",
    "--local",
    ...(container ? ["--env", "pen", "--name", "sheep"] : []),
    "--config",
    config,
    "--env-file",
    devVarsPath(),
    "--port",
    String(port),
    ...(container && process.platform === "linux" ? ["--ip", "0.0.0.0"] : []),
    "--inspector-port",
    String(inspector),
    "--persist-to",
    state,
    "--log-level",
    "error",
    "--show-interactive-dev-session=false",
    ...(container ? ["--var", `PEN_CELL_ORIGIN:${cellOrigin(port)}`, "--var", `PEN_IDLE:${LOCAL_IDLE}`] : []),
  ];
}

/**
 * The daemon, detached over the config with the secrets file, until `GET /`
 * answers `sheep`; the record written after. With a container the wait is
 * ten minutes, since wrangler pulls the image (or builds it, in a
 * checkout) before it listens; two minutes otherwise.
 */
async function spawnDaemon(stamp: BuildStamp | undefined, wrangler: string, port: number, container: boolean): Promise<{ record: HomeRecord; config: { path: string; derived: boolean; from: string | null } }> {
  const dir = localDir();
  const state = join(dir, "state");
  mkdirSync(state, { recursive: true });
  const config = daemonConfig(stamp, container);
  const inspector = await freePort();
  const log = openSync(logPath(), "a");
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [wrangler, ...daemonArgs(config.path, port, inspector, state, container)], {
    cwd: dir,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
  });
  closeSync(log);
  child.unref();
  const pid = child.pid;
  if (pid === undefined) throw new Error("wrangler did not start");
  const minutes = container ? 10 : 2;
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the local home exited (${child.exitCode}) before answering on ${url}: ${logTail()}`);
    if ((await whoAnswers(url)) === "sheep") {
      const record: HomeRecord = { pid, port, url, stamp: stamp ?? null, startedAt: new Date().toISOString(), container };
      writeRecord(record);
      return { record, config };
    }
    await sleep(250);
  }
  signal(pid, "SIGTERM");
  throw new Error(`the local home did not answer on ${url} within ${minutes === 2 ? "two" : "ten"} minutes${container ? " (with a container: the image is pulled or built first)" : ""}: ${logTail()}`);
}

export interface StartOptions {
  /** true: the faux provider; false: a key from the environment; undefined: the secrets as they are (a start on demand). */
  faux?: boolean;
  /**
   * Station phase 4. `"docker"`: a container when Docker answers (`sheep
   * home local`); false: none, whatever Docker says (`--no-container`);
   * undefined: the record's choice, and Docker's answer when there is no
   * record yet (a start on demand).
   */
  container?: "docker" | false;
  /** Where progress goes: the wrangler install, a restart. Never a value from the secrets file. */
  say?: (text: string) => void;
}

export interface StartReport {
  url: string;
  port: number;
  pid: number;
  dir: string;
  /** What this call did: started a daemon, found one running, or restarted one whose secrets or container choice changed. */
  state: "started" | "running" | "restarted";
  key: "held" | "not held" | "faux";
  secrets: string;
  stamp: BuildStamp | null;
  wrangler: { version: string | "checkout"; installed: boolean };
  config: { path: string; wrote: boolean; names: string | undefined };
  /** Station phase 4: the config the daemon runs, derived from the package's when the container is on (`from` the image its Dockerfile names). */
  daemonConfig: { path: string; derived: boolean; from: string | null };
  /** Station phase 4: whether the home rents a container beside every cell, and why or why not. */
  container: "running" | "none";
  reason: string;
  /** What Docker answered, `os/arch`, or null when it did not. */
  docker: string | null;
  /** The address the container dials the home back at, when there is one. */
  origin: string | null;
  /** How long a container stays up after its last command, when there is one. */
  idle: string | null;
}

/**
 * `sheep home local`: the home under the kennel's `local/`, started if it was
 * not, and the config written when there is none. A running home whose
 * secrets this call changed (a key newly exported, the provider flipped),
 * or whose container choice this call changed (Docker arrived, or
 * `--no-container`), is restarted, so what the report says is what the
 * home is.
 */
export async function startLocalHome(options: StartOptions = {}): Promise<StartReport> {
  const say = options.say ?? (() => {});
  const dir = localDir();
  mkdirSync(dir, { recursive: true });
  const stamp = readStamp();
  const secrets = writeDevVars(options.faux);
  const before = await localStatus();
  // Docker is asked once, and only when the choice depends on it: `sheep home local` looks; a start on demand reads the record,
  // and a record that says no container never runs `docker version` at all.
  let answered: DockerAnswer | undefined;
  const docker = (): DockerAnswer => (answered ??= dockerAnswers());
  let container: boolean;
  let reason: string;
  if (options.container === false) {
    container = false;
    reason = "--no-container";
  } else if (options.container === "docker" || before.record === undefined) {
    container = docker().present;
    reason = container ? `Docker (${docker().engine}) answered` : NO_DOCKER_SENTENCE;
  } else if (!before.record.container) {
    container = false;
    reason = "the record's choice (no container)";
  } else if (!docker().present) {
    container = false;
    reason = `the record asked for a container but Docker did not answer; ${NO_DOCKER_SENTENCE}`;
    say(`sheep: the local home was started with a container and Docker does not answer now; starting it without one\n`);
  } else {
    container = true;
    reason = `the record's choice; Docker (${docker().engine}) answered`;
  }
  let state: StartReport["state"] = "running";
  let record = before.record;
  const switched = before.running && before.record !== undefined && before.record.container !== container;
  if (before.running && (secrets.changed || switched)) {
    say(secrets.changed ? `sheep: the local home's secrets changed; restarting it\n` : `sheep: the local home ${container ? "had no container and Docker answers" : "had a container"}; restarting it ${container ? "with one" : "without one"}\n`);
    await stopLocalHome();
    state = "restarted";
  }
  let wrangler: { bin: string; installed: boolean } | undefined;
  // The config the daemon runs: a running home's is what the last start wrote, read again without rewriting it.
  let daemon = { path: wranglerConfig(stamp), derived: false, from: null as string | null };
  if (!before.running || secrets.changed || switched) {
    const seam = process.env.SHEEP_TEST_WRANGLER;
    wrangler = seam ? { bin: seam, installed: false } : ensureWrangler(stamp, say);
    const spawned = await spawnDaemon(stamp, wrangler.bin, await pickPort(before.record?.port), container);
    record = spawned.record;
    daemon = spawned.config;
    if (state === "running") state = "started";
  } else if (container) {
    const derived = deriveLocalConfig(readFileSync(daemon.path, "utf8"), daemon.path);
    if (derived !== undefined) daemon = { path: join(dir, "wrangler.jsonc"), derived: true, from: derived.image };
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
    daemonConfig: daemon,
    container: record.container ? "running" : "none",
    reason,
    docker: answered?.engine ?? null,
    origin: record.container ? cellOrigin(record.port) : null,
    idle: record.container ? LOCAL_IDLE : null,
  };
}

/**
 * `sheep home stop`: SIGTERM to the daemon when it is running, the record
 * kept with its pid cleared; a stale record is cleared too. The wait is
 * bounded: ten seconds after SIGTERM, three after SIGKILL, and a pid that
 * outlives both is reported as `unreaped` and left, never waited on
 * forever (collar phase 3's debt).
 */
export async function stopLocalHome(): Promise<{ stopped: boolean; record: HomeRecord | undefined; unreaped?: number; containersRemoved: number }> {
  const status = await localStatus();
  const { record } = status;
  if (record === undefined) return { stopped: false, record, containersRemoved: 0 };
  if (!status.running) {
    if (record.pid !== null) writeRecord({ ...record, pid: null });
    return { stopped: false, record: { ...record, pid: null }, containersRemoved: removeOwnContainers(record) };
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
  return { stopped: true, record: { ...record, pid: null }, ...(unreaped === undefined ? {} : { unreaped }), containersRemoved: removeOwnContainers(record) };
}

/** The prefix wrangler gives this home's containers: the Worker is named `sheep` in both environments, the class `PenContainer`; the shepherd's checkout rig is `workerd-sheep-pen-…` and never matches. */
export const OWN_CONTAINER_PREFIX = "workerd-sheep-PenContainer-";

/**
 * What a stopped daemon leaves in Docker (station phase 4): wrangler
 * removes a sheep's container when the home goes, and sometimes not its
 * `-proxy` sibling. After the daemon is gone, every container of this
 * home's naming is removed, only when the record says the home had a
 * container, only when Docker answers, and never under a test seam, since
 * a test must not reach the machine's containers. Returns how many went.
 */
function removeOwnContainers(record: HomeRecord): number {
  if (!record.container || process.env.SHEEP_TEST_DOCKER !== undefined || !dockerAnswers().present) return 0;
  const listed = spawnSync("docker", ["ps", "--all", "--format", "{{.Names}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 });
  if (listed.error || listed.status !== 0) return 0;
  const own = (listed.stdout || "").split("\n").map((line) => line.trim()).filter((name) => name.startsWith(OWN_CONTAINER_PREFIX));
  if (own.length === 0) return 0;
  const removed = spawnSync("docker", ["rm", "-f", ...own], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  return removed.error || removed.status !== 0 ? 0 : own.length;
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
