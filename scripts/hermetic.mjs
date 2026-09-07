#!/usr/bin/env node
/**
 * The rings: prove a release the way a user meets it, in an environment
 * this checkout's state cannot reach. Collar phase 0 built the package
 * ring; collar phase 1 gave it the local home, so the walk is the
 * installed command's from the first step to the last.
 *
 *   pnpm hermetic --ring package [ref]     ref defaults to refs/heads/release of this repository
 *   --keep                                  leave the ring's directory, and its local home running, and say where
 *
 * The package ring makes one temp directory and points five variables
 * inside it: `npm_config_prefix`, `npm_config_cache`, `HOME`,
 * `SHEEP_CONFIG`, and `SHEEP_LOCAL`, asserted before anything runs. It
 * installs the ref with `npm install -g git+file://<this repo>#<ref>`,
 * npm's git installer, where isocan's #47 lived, never a tarball; puts the
 * prefix's `bin` first on PATH with this checkout's directories stripped
 * from it; and walks journey 1 with the installed `sheep`, never
 * `bin/sheep.js`. One line per step; the first failure prints its command
 * and output and exits 1; the end names what was not checked.
 *
 * The walk is journey 1 steps 2, 3, 4, 6, and 7 with the faux provider:
 * `sheep home local --faux` starts the home under the ring's `SHEEP_LOCAL`
 * (wrangler fetched into the ring's `~/.sheep/tools` at the manifest's
 * pin, through the ring's npm cache) and writes the ring's `SHEEP_CONFIG`;
 * every later command finds the home through that config, with no
 * `SHEEP_HOME` or `SHEEP_TOKEN` in the environment. `ps` is read while the
 * home runs, and polled for the whole walk, to see that the token is in
 * no process's arguments: the daemon gets its secrets from `.dev.vars`,
 * mode 600, through `--env-file`. Steps 1 and 5 are collar phase 2's.
 *
 * Step 4 has two halves. `sheep attach <id> -- "again"` streams the reply
 * through sheep's own client, inside `dist/sheep.mjs`. `sheep attach
 * <id>` with no prompt spawns pi's client, `dist/pi-client.mjs` beside
 * the bundle; with no terminal, pi's client attaches, prints
 * `<server>\t<session>\tattached`, and exits, and the ring reads `ps`
 * while it runs to see the child and where it runs from.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAUX_REPLY = "ok";

function usage(message) {
  console.error(`hermetic: ${message}\nusage: pnpm hermetic --ring package [ref] [--keep]`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = { ring: undefined, ref: "refs/heads/release", keep: false };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--ring") parsed.ring = args.shift();
    else if (arg.startsWith("--ring=")) parsed.ring = arg.slice("--ring=".length);
    else if (arg === "--keep") parsed.keep = true;
    else if (arg.startsWith("--")) usage(`unknown flag ${arg}`);
    else parsed.ref = arg;
  }
  if (parsed.ring === undefined) usage("--ring is required");
  if (parsed.ring === "machine" || parsed.ring === "dog") usage(`the ${parsed.ring} ring is collar phase 4's; only the package ring exists`);
  if (parsed.ring !== "package") usage(`unknown ring ${parsed.ring}`);
  return parsed;
}

const git = (...args) => {
  const done = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (done.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(done.stderr || "").trim()}`);
  return (done.stdout || "").trim();
};

/** Runs a command to completion, collecting output; never throws on a nonzero exit. */
function run(command, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.once("error", reject);
    options?.onSpawn?.(child);
    child.once("close", (code, signal) => resolveRun({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? (signal ? 1 : 0) }));
  });
}

/** Every process's pid and arguments, one line each, from `ps`: no shell, so no argument of this ring's own carries what it looks for. */
function psLines() {
  return spawnSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8" }).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** `ps` over every process, polled while something runs; the first line holding `needle` is kept, and the samples counted. */
function watchPs(needle, everyMs = 15) {
  let seen;
  let samples = 0;
  const timer = setInterval(() => {
    samples++;
    if (seen) return;
    const line = psLines().find((candidate) => candidate.includes(needle));
    if (line) seen = line;
  }, everyMs);
  return { stop: () => clearInterval(timer), line: () => seen, samples: () => samples };
}

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok && (await response.text()).startsWith("sheep");
  } catch {
    return false;
  }
}

class Ring {
  constructor(ref, keep) {
    // The ref first: a ref that does not resolve leaves no directory behind.
    this.sha = git("rev-parse", "--verify", `${ref}^{commit}`);
    this.ref = ref;
    this.keep = keep;
    this.dir = mkdtempSync(join(tmpdir(), "sheep-ring-"));
    this.prefix = join(this.dir, "prefix");
    this.cache = join(this.dir, "npm-cache");
    this.home = join(this.dir, "home");
    this.local = join(this.home, ".sheep", "local");
    this.config = join(this.home, ".sheep", "config");
    for (const dir of [this.prefix, this.cache, this.home, this.local]) mkdirSync(dir, { recursive: true });
    this.lines = [];
    this.unchecked = [];
    this.localHome = undefined;
    this.tokenWatch = undefined;
  }

  /** The environment every command in the ring runs with: the five variables, and a PATH with this checkout stripped. */
  env() {
    const inherited = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("npm_") || key.startsWith("PNPM_") || key === "NODE_OPTIONS" || key === "NODE_PATH" || key === "INIT_CWD") continue;
      // No home, no token, no key: the walk gets its home from the config the installed command writes, and runs the faux provider.
      if (key === "SHEEP_HOME" || key === "SHEEP_TOKEN" || key === "ANTHROPIC_API_KEY") continue;
      inherited[key] = value;
    }
    const path = (process.env.PATH ?? "").split(":").filter((entry) => entry && !entry.startsWith(root + sep) && entry !== root);
    return {
      ...inherited,
      npm_config_prefix: this.prefix,
      npm_config_cache: this.cache,
      HOME: this.home,
      SHEEP_CONFIG: this.config,
      SHEEP_LOCAL: this.local,
      PATH: [join(this.prefix, "bin"), ...path].join(":"),
      npm_config_update_notifier: "false",
      npm_config_fund: "false",
      npm_config_audit: "false",
      npm_config_progress: "false",
      NODE_NO_WARNINGS: "1",
    };
  }

  assertFresh() {
    const env = this.env();
    const five = ["npm_config_prefix", "npm_config_cache", "HOME", "SHEEP_CONFIG", "SHEEP_LOCAL"];
    for (const key of five) {
      const value = env[key];
      if (!value || !(value === this.dir || value.startsWith(this.dir + sep))) throw new Error(`${key}=${value} is not inside the ring ${this.dir}`);
      const dir = key === "SHEEP_CONFIG" ? dirname(value) : value;
      if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`${key}: ${dir} is not a fresh directory`);
    }
    // Fresh means empty, except that HOME holds the empty `.sheep/local` skeleton the ring made for SHEEP_LOCAL.
    const onlyHolds = (dir, names) => {
      const found = readdirSync(dir);
      if (found.some((name) => !names.includes(name))) throw new Error(`${dir} is not empty: ${found.join(", ")}`);
    };
    onlyHolds(this.prefix, []);
    onlyHolds(this.cache, []);
    onlyHolds(this.home, [".sheep"]);
    onlyHolds(join(this.home, ".sheep"), ["local"]);
    onlyHolds(this.local, []);
    for (const entry of env.PATH.split(":")) {
      if (entry === root || entry.startsWith(root + sep)) throw new Error(`PATH still reaches this checkout: ${entry}`);
    }
    if (existsSync(this.config)) throw new Error(`${this.config} exists before the walk`);
    console.log(`ring: ${this.dir}`);
    for (const key of five) console.log(`  ${key}=${env[key]}`);
    console.log(`  PATH=${join(this.prefix, "bin")}:… (this checkout stripped)`);
  }

  async install() {
    const spec = `git+file://${root}#${this.sha}`;
    const started = Date.now();
    const env = this.env();
    const versions = { node: spawnSync("node", ["--version"], { env, encoding: "utf8" }).stdout.trim(), npm: spawnSync("npm", ["--version"], { env, encoding: "utf8" }).stdout.trim() };
    const result = await run("npm", ["install", "-g", spec], { env, cwd: this.dir });
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (result.code !== 0) this.fail("install", `npm install -g ${spec}`, result);
    const bin = join(this.prefix, "bin", "sheep");
    const pkg = join(this.prefix, "lib", "node_modules", "sheep");
    for (const required of [bin, join(pkg, "package.json"), join(pkg, "dist", "sheep.mjs"), join(pkg, "dist", "pi-client.mjs"), join(pkg, "home", "worker.mjs"), join(pkg, "home", "wrangler.jsonc")]) {
      if (!existsSync(required)) this.fail("install", `npm install -g ${spec}`, { ...result, stderr: `${result.stderr}\nmissing after install: ${required}` });
    }
    for (const tool of ["esbuild", "wrangler", "workerd"]) {
      if (existsSync(join(pkg, "node_modules", tool))) this.fail("install", `ls ${join(pkg, "node_modules")}`, { stdout: readdirSync(join(pkg, "node_modules")).join("\n"), stderr: `${tool} was installed into the release's tree`, code: 1 });
    }
    const which = spawnSync("sh", ["-c", "command -v sheep"], { env, encoding: "utf8" }).stdout.trim();
    if (which !== bin) this.fail("install", "command -v sheep", { stdout: which, stderr: `expected ${bin}`, code: 1 });
    // No pi source anywhere under the prefix: pi is inside the two bundles, not a checkout.
    const find = spawnSync("find", [this.prefix, "-name", "*.ts", "-path", "*earendil*"], { encoding: "utf8" });
    if (find.stdout.trim() !== "") this.fail("install", `find ${this.prefix} -name '*.ts' -path '*earendil*'`, { stdout: find.stdout, stderr: "pi sources under the prefix", code: 1 });
    const installed = readdirSync(join(pkg, "node_modules")).filter((name) => !name.startsWith("."));
    this.ok("install", `npm install -g ${spec}`, `${seconds}s, node ${versions.node}, npm ${versions.npm}; ${installed.length} packages beside sheep; no *.ts under *earendil*`);
    this.pkg = pkg;
  }

  /** The installed `sheep`, first on PATH, finding its home through the ring's config file and nothing in the environment. */
  sheep(args, options = {}) {
    return run("sheep", args, { env: this.env(), cwd: this.dir, ...options });
  }

  ok(step, command, note) {
    const line = `ok    ${step.padEnd(8)} ${command}${note ? `  → ${note}` : ""}`;
    this.lines.push(line);
    console.log(line);
  }

  skip(step, why) {
    const line = `skip  ${step.padEnd(8)} ${why}`;
    this.lines.push(line);
    console.log(line);
    this.unchecked.push(`journey 1 ${step}: ${why}`);
  }

  fail(step, command, result) {
    const error = new Error(`${step}: ${command}`);
    error.ring = { step, command, result };
    throw error;
  }

  /** `home.json` under the ring's SHEEP_LOCAL, as the installed command wrote it. */
  record() {
    return JSON.parse(readFileSync(join(this.local, "home.json"), "utf8"));
  }

  async walk() {
    const stamp = JSON.parse(git("show", `${this.sha}:package.json`)).sheep;
    const parents = git("log", "-1", "--format=%P", this.sha).split(" ");
    if (!parents.some((parent) => parent.startsWith(stamp.commit))) throw new Error(`the manifest's commit ${stamp.commit} is not a parent of ${this.sha}`);

    // Journey 1 step 7, the second half, first: the installed command names its build. No home is needed, and none is configured.
    const version = await this.sheep(["--version"]);
    const expected = `sheep ${stamp.commit} (${stamp.builtAt})\n`;
    if (version.code !== 0 || version.stdout !== expected) this.fail("step 7", "sheep --version", { ...version, stderr: `${version.stderr}\nexpected ${JSON.stringify(expected)}` });
    this.ok("step 7", "sheep --version", version.stdout.trim());

    this.skip("step 1", "sheep setup is collar phase 2's");

    // Step 2: the local home, under the ring's SHEEP_LOCAL, with the faux provider in place of a key.
    const startedAt = Date.now();
    const started = await this.sheep(["home", "local", "--faux", "--json"]);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
    let report;
    try {
      report = JSON.parse(started.stdout);
    } catch {
      this.fail("step 2", "sheep home local --faux --json", started);
    }
    if (started.code !== 0 || report.state !== "started" || report.key !== "faux" || typeof report.pid !== "number") this.fail("step 2", "sheep home local --faux --json", started);
    const url = report.home;
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !(await answers(url))) this.fail("step 2", `curl ${url}/`, { ...started, stderr: `${started.stderr}\n${url} does not answer sheep`, code: 1 });
    this.localHome = { url, pid: report.pid };
    // The record: pid, port, and the stamp the install's manifest carries.
    const record = this.record();
    if (record.pid !== report.pid || record.url !== url || JSON.stringify(record.stamp) !== JSON.stringify(stamp)) {
      this.fail("step 2", `cat ${join(this.local, "home.json")}`, { stdout: JSON.stringify(record), stderr: `expected pid ${report.pid}, url ${url}, stamp ${JSON.stringify(stamp)}`, code: 1 });
    }
    // The config, written in the ring's HOME: the address, a token, and the local marker.
    if (!existsSync(this.config)) this.fail("step 2", `cat ${this.config}`, { stdout: "", stderr: "no config was written", code: 1 });
    const config = JSON.parse(readFileSync(this.config, "utf8"));
    if (config.home !== url || typeof config.token !== "string" || config.token.length < 32 || config.local !== true) {
      this.fail("step 2", `cat ${this.config}`, { stdout: JSON.stringify({ ...config, token: "…" }), stderr: `expected {home: ${url}, token, local: true}`, code: 1 });
    }
    this.token = config.token;
    // The secrets file: mode 600, the token and the provider in it, no key.
    const devVars = join(this.local, ".dev.vars");
    const mode = statSync(devVars).mode & 0o777;
    if (mode !== 0o600) this.fail("step 2", `stat ${devVars}`, { stdout: mode.toString(8), stderr: "expected mode 600", code: 1 });
    const secrets = readFileSync(devVars, "utf8");
    if (!secrets.includes(`SHEEP_TOKEN=${this.token}\n`) || !secrets.includes("SHEEP_PROVIDER=faux\n") || secrets.includes("SHEEP_ANTHROPIC_API_KEY")) {
      this.fail("step 2", `cat ${devVars}`, { stdout: secrets.replace(/=.*/g, "=…"), stderr: "expected the config's token, the faux provider, and no key", code: 1 });
    }
    // The tool: wrangler at the manifest's pin, under the ring's ~/.sheep/tools, and nowhere in the release's tree.
    const tools = join(this.home, ".sheep", "tools");
    const wranglerPkg = join(tools, "node_modules", "wrangler", "package.json");
    const wranglerVersion = existsSync(wranglerPkg) ? JSON.parse(readFileSync(wranglerPkg, "utf8")).version : undefined;
    if (wranglerVersion !== stamp.wrangler) this.fail("step 2", `cat ${wranglerPkg}`, { stdout: String(wranglerVersion), stderr: `expected wrangler ${stamp.wrangler} in ${tools}`, code: 1 });
    if (existsSync(join(this.pkg, "node_modules", "wrangler"))) this.fail("step 2", `ls ${join(this.pkg, "node_modules")}`, { stdout: "", stderr: "wrangler was installed into the release's tree", code: 1 });
    const dotSheep = readdirSync(join(this.home, ".sheep")).sort();
    if (JSON.stringify(dotSheep) !== JSON.stringify(["config", "local", "tools"])) this.fail("step 2", `ls ${join(this.home, ".sheep")}`, { stdout: dotSheep.join("\n"), stderr: "expected config, local, tools", code: 1 });
    // ps: the daemon runs from the tools directory over the release's config with the secrets file's path, and no process's arguments carry the token.
    // Paths as the daemon saw them: the bundle resolves its own through realpath (on macOS /var is /private/var), the ring's variables do not.
    const either = (line, path) => line.includes(path) || line.includes(realpathSync(path));
    const lines = psLines();
    const daemon = lines.find((line) => line.startsWith(`${report.pid} `));
    const pkgConfig = join(this.pkg, "home", "wrangler.jsonc");
    if (!daemon || !either(daemon, join(tools, "node_modules", "wrangler")) || !(daemon.includes(`--config ${pkgConfig}`) || daemon.includes(`--config ${realpathSync(pkgConfig)}`)) || !either(daemon, `--env-file ${devVars}`)) {
      this.fail("step 2", `ps -Ao pid=,args= | grep ^${report.pid}`, { stdout: daemon ?? "", stderr: "expected the ring's wrangler over the release's home/wrangler.jsonc with --env-file the ring's .dev.vars", code: 1 });
    }
    const leaked = lines.filter((line) => line.includes(this.token));
    if (leaked.length > 0) this.fail("step 2", "ps -Ao pid=,args=", { stdout: leaked.join("\n"), stderr: "the token is in a process's arguments", code: 1 });
    // From here to the end of the walk, ps is polled for the token.
    this.tokenWatch = watchPs(this.token, 25);
    // A second call reports the running home at the same address.
    const again = await this.sheep(["home", "local", "--faux", "--json"]);
    let againReport;
    try {
      againReport = JSON.parse(again.stdout);
    } catch {
      this.fail("step 2", "sheep home local --faux --json (again)", again);
    }
    if (again.code !== 0 || againReport.state !== "running" || againReport.home !== url || againReport.pid !== report.pid) this.fail("step 2", "sheep home local --faux --json (again)", again);
    this.ok("step 2", "sheep home local --faux", `${url}, pid ${report.pid}, ${seconds}s with wrangler ${stamp.wrangler} fetched into ~/.sheep/tools; config written; .dev.vars mode 600; again: running`);
    this.ok("step 2", "ps", `${daemon.slice(0, 96)}… --env-file ${devVars.replace(this.dir, "<ring>")}; ${lines.length} processes, none with the token in its arguments`);
    this.unchecked.push("journey 1 step 2: a key from ANTHROPIC_API_KEY held in .dev.vars, and a real model answering; the ring's home ran the faux provider");

    // Step 3: a sheep is minted, the reply streams, and ls lists it; the home came from the config, nothing from the environment.
    const created = await this.sheep(["new", "--", "hello"]);
    const id = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== `${FAUX_REPLY}\n` || !id) this.fail("step 3", "sheep new -- hello", created);
    const listed = await this.sheep(["ls"]);
    if (listed.code !== 0 || !listed.stdout.split("\n").some((line) => line.startsWith(`${id}\t`))) this.fail("step 3", "sheep ls", listed);
    this.ok("step 3", "sheep new -- hello; sheep ls", `${FAUX_REPLY}; session ${id} listed`);

    // Step 4, first half: a prompt to the sheep, streamed by sheep's own client inside the bundle.
    const again4 = await this.sheep(["attach", id, "--", "again"]);
    if (again4.code !== 0 || again4.stdout !== `${FAUX_REPLY}\n`) this.fail("step 4", `sheep attach ${id} -- again`, again4);
    // Second half: no prompt, no terminal; pi's client from the bundle attaches and says so, and ps sees it run.
    const needle = join(this.pkg, "dist", "pi-client.mjs");
    const ps = watchPs(needle);
    let attached;
    try {
      attached = await this.sheep(["attach", id]);
    } finally {
      ps.stop();
    }
    if (attached.code !== 0 || !attached.stdout.includes(`\t${id}\tattached`)) this.fail("step 4", `sheep attach ${id}`, attached);
    const seen = ps.line();
    if (!seen) this.fail("step 4", `ps -Ao pid=,args= while sheep attach ${id}`, { ...attached, stderr: `${attached.stderr}\nno process running ${needle} was seen`, code: 1 });
    this.ok("step 4", `sheep attach ${id} -- again; sheep attach ${id}`, `${FAUX_REPLY}; attached through pi's client`);
    this.ok("step 4", "ps", seen);
    this.unchecked.push("journey 1 step 4: pi's interactive terminal, which needs a TTY; the ring attached with none");

    this.skip("step 5", "sheep --agent-help is collar phase 2's");

    // Step 6: the home stops; the next command starts it and says so; the sheep is still there; `sheep home` reports each state.
    const stopped = await this.sheep(["home", "stop"]);
    if (stopped.code !== 0 || stopped.stdout !== `stopped the local home at ${url}\n`) this.fail("step 6", "sheep home stop", stopped);
    if (await answers(url)) this.fail("step 6", `curl ${url}/`, { stdout: "", stderr: "the home still answers after sheep home stop", code: 1 });
    if (this.record().pid !== null) this.fail("step 6", `cat ${join(this.local, "home.json")}`, { stdout: JSON.stringify(this.record()), stderr: "the pid was not cleared", code: 1 });
    const down = await this.sheep(["home"]);
    if (down.code !== 0 || down.stdout !== `home: ${url} (local, stopped)\n`) this.fail("step 6", "sheep home", down);
    const morning = await this.sheep(["ls"]);
    if (morning.code !== 0 || !morning.stderr.includes("sheep: the local home is not running; starting it\n") || !morning.stdout.split("\n").some((line) => line.startsWith(`${id}\t`))) {
      this.fail("step 6", "sheep ls (the home stopped)", morning);
    }
    const up = await this.sheep(["home", "--json"]);
    let upReport;
    try {
      upReport = JSON.parse(up.stdout);
    } catch {
      this.fail("step 6", "sheep home --json", up);
    }
    if (up.code !== 0 || upReport.running !== true || upReport.home !== url || typeof upReport.pid !== "number" || upReport.pid === report.pid || JSON.stringify(upReport.stamp) !== JSON.stringify(stamp)) {
      this.fail("step 6", "sheep home --json", { ...up, stderr: `${up.stderr}\nexpected running at ${url} under a new pid with stamp ${JSON.stringify(stamp)}` });
    }
    this.localHome = { url, pid: upReport.pid };
    this.ok("step 6", "sheep home stop; sheep home; sheep ls; sheep home --json", `stopped; "(local, stopped)"; started on demand, pid ${report.pid} → ${upReport.pid}, ${id} listed; stamp ${upReport.stamp.commit} (${upReport.stamp.builtAt}), wrangler ${upReport.stamp.wrangler}`);

    // Step 7, first half: the export is a SQLite file with the tables the command reports.
    const file = join(this.dir, `${id}.sqlite`);
    const exported = await this.sheep(["export", id, file]);
    if (exported.code !== 0 || !existsSync(file)) this.fail("step 7", `sheep export ${id} ${file}`, exported);
    const counts = Object.fromEntries(exported.stdout.trim().split("\t")[1].split(" ").map((pair) => pair.split("=")));
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
      for (const [table, count] of Object.entries(counts)) {
        if (!tables.includes(table)) this.fail("step 7", `sqlite3 ${file} .tables`, { stdout: tables.join("\n"), stderr: `export reported ${table}=${count}, not in the file`, code: 1 });
        const rows = db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n;
        if (String(rows) !== count) this.fail("step 7", `SELECT count(*) FROM ${table}`, { stdout: String(rows), stderr: `export reported ${count}`, code: 1 });
      }
    } finally {
      db.close();
    }
    this.ok("step 7", `sheep export ${id}`, `${exported.stdout.trim().split("\t")[1]}; opened with node:sqlite, counts match`);
    this.unchecked.push("journey 1 step 7: pi's own session backend opening the export; node:sqlite opened it and counted");

    // The whole walk: the token was in no process's arguments in any sample.
    this.tokenWatch.stop();
    const leak = this.tokenWatch.line();
    if (leak) this.fail("walk", "ps -Ao pid=,args= (polled)", { stdout: leak, stderr: "the token was seen in a process's arguments during the walk", code: 1 });
    this.ok("walk", "ps (polled every 25 ms from step 2)", `${this.tokenWatch.samples()} samples, the token in no process's arguments`);
  }

  /** The home the walk started: stopped with the installed command, unless kept; whatever is left is signalled. */
  async stopLocalHome() {
    this.tokenWatch?.stop();
    if (!this.localHome) return;
    if (this.keep) return;
    const stopped = await this.sheep(["home", "stop"]).catch(() => undefined);
    if (stopped?.code !== 0) console.error(`hermetic: sheep home stop exited ${stopped?.code ?? "?"}: ${(stopped?.stderr ?? "").trim()}`);
    let pid = this.localHome.pid;
    try {
      pid = this.record().pid ?? pid;
    } catch {
      // no record
    }
    if (pid !== null) {
      for (const target of [-pid, pid]) {
        try {
          process.kill(target, "SIGTERM");
        } catch {
          // gone
        }
      }
    }
    this.localHome = undefined;
  }

  report(failure) {
    console.log("");
    if (failure?.ring) {
      const { step, command, result } = failure.ring;
      console.log(`FAIL  ${step}: ${command} (exit ${result.code})`);
      if (result.stdout?.trim()) console.log(`--- stdout ---\n${result.stdout.trimEnd()}`);
      if (result.stderr?.trim()) console.log(`--- stderr ---\n${result.stderr.trimEnd()}`);
    } else if (failure) {
      console.log(`FAIL  ${failure.message}`);
    }
    console.log(`not checked by the package ring:`);
    for (const item of [
      ...this.unchecked,
      "that this machine's Node is the user's: the ring ran the node and npm on PATH here (the machine ring is collar phase 4's)",
      "that wrangler's fetch works on a cold network: ~/.sheep/tools came through the ring's own npm cache, from the registry the first time",
    ]) {
      console.log(`  - ${item}`);
    }
    if (this.keep) {
      console.log(`kept: ${this.dir}`);
      if (this.localHome) {
        console.log(`  the local home is still running at ${this.localHome.url} (pid ${this.localHome.pid}); journey 5's file runs against it with`);
        console.log(`    SHEEP_TEST_HOME=${this.localHome.url} SHEEP_TEST_TOKEN=${this.token} pnpm --filter @sheep/cli exec vitest --run test/journey5.test.ts`);
        console.log(`  and stops with`);
        console.log(`    HOME=${this.home} SHEEP_LOCAL=${this.local} SHEEP_CONFIG=${this.config} ${join(this.prefix, "bin", "sheep")} home stop`);
      }
    }
  }

  cleanup() {
    if (this.keep) return;
    rmSync(this.dir, { recursive: true, force: true });
  }
}

async function main() {
  const { ring: ringName, ref, keep } = parseArgs(process.argv.slice(2));
  let ring;
  try {
    ring = new Ring(ref, keep);
  } catch (error) {
    usage(`${ref}: ${error.message}`);
  }
  console.log(`package ring: ${ref} = ${ring.sha}`);
  let failure;
  try {
    ring.assertFresh();
    await ring.install();
    await ring.walk();
  } catch (error) {
    failure = error;
  } finally {
    // A failed walk does not keep a daemon: the home is stopped before anything is reported, kept only with --keep and a walk that held.
    if (failure && keep) console.error("hermetic: the walk failed; the local home is stopped even with --keep");
    if (failure) ring.keep = false;
    await ring.stopLocalHome();
    ring.keep = keep;
  }
  ring.report(failure);
  ring.cleanup();
  if (failure) {
    console.log(`\n${ringName} ring: FAILED at ${failure.ring?.step ?? "setup"}`);
    process.exit(1);
  }
  console.log(`\n${ringName} ring: ok (${ring.lines.filter((line) => line.startsWith("ok")).length} lines held)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`hermetic: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}
