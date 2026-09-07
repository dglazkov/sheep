#!/usr/bin/env node
/**
 * The rings: prove a release the way a user meets it, in an environment
 * this checkout's state cannot reach. Collar phase 0 builds the package
 * ring in its first form.
 *
 *   pnpm hermetic --ring package [ref]     ref defaults to refs/heads/release of this repository
 *   --keep                                  leave the ring's directory behind, and say where
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
 * This phase walks steps 3, 4, and 7 against a faux home the ring starts
 * from this checkout (`wrangler dev` over `packages/cell` with the faux
 * provider, the shape of `packages/cli/test/local-home.ts`); the local
 * home, and with it steps 1, 2, 5, and 6, is collar phase 1's. The faux
 * provider answers `ok` to every prompt.
 *
 * Step 4 has two halves. `sheep attach <id> -- "again"` streams the reply
 * through sheep's own client, inside `dist/sheep.mjs`. `sheep attach
 * <id>` with no prompt spawns pi's client, `dist/pi-client.mjs` beside
 * the bundle; with no terminal, pi's client attaches, prints
 * `<server>\t<session>\tattached`, and exits, and the ring reads `ps`
 * while it runs to see the child and where it runs from.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAUX_REPLY = "ok";
const TOKEN = "ring-token";

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

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

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

/** `ps` over every process, polled while a command runs; the first line holding `needle` is kept. */
function watchPs(needle) {
  let seen;
  const timer = setInterval(() => {
    if (seen) return;
    const ps = spawnSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8" });
    const line = ps.stdout.split("\n").find((candidate) => candidate.includes(needle));
    if (line) seen = line.trim();
  }, 15);
  return { stop: () => clearInterval(timer), line: () => seen };
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
    this.fauxHome = undefined;
  }

  /** The environment every command in the ring runs with: the five variables, and a PATH with this checkout stripped. */
  env() {
    const inherited = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("npm_") || key.startsWith("PNPM_") || key === "NODE_OPTIONS" || key === "NODE_PATH" || key === "INIT_CWD") continue;
      if (key === "SHEEP_HOME" || key === "SHEEP_TOKEN") continue;
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

  /** The faux home, from this checkout: `wrangler dev` over packages/cell with SHEEP_PROVIDER=faux, until GET / answers `sheep`. */
  async startFauxHome() {
    const cellDir = join(root, "packages", "cell");
    const wrangler = join(cellDir, "node_modules", "wrangler", "bin", "wrangler.js");
    if (!existsSync(wrangler)) throw new Error(`wrangler is not installed at ${wrangler}; the faux home needs this checkout's pnpm install`);
    const [port, inspector] = await Promise.all([freePort(), freePort()]);
    const persist = join(this.dir, "faux-home-state");
    const child = spawn(
      process.execPath,
      [wrangler, "dev", "--port", String(port), "--inspector-port", String(inspector), "--persist-to", persist, "--var", `SHEEP_TOKEN:${TOKEN}`, "--var", "SHEEP_PROVIDER:faux", "--log-level", "error", "--show-interactive-dev-session=false"],
      { cwd: cellDir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        if (response.ok && (await response.text()).startsWith("sheep")) {
          this.fauxHome = { url, child };
          console.log(`home: faux, ${url}, wrangler dev from ${cellDir} (this checkout's; the local home is collar phase 1's)`);
          return;
        }
      } catch {
        // not up yet
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    child.kill("SIGTERM");
    throw new Error(`the faux home did not answer on ${url} (exit ${child.exitCode}): ${output.trim().split("\n").slice(-3).join(" | ")}`);
  }

  async stopFauxHome() {
    if (!this.fauxHome) return;
    const { child } = this.fauxHome;
    this.fauxHome = undefined;
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  }

  /** The installed `sheep`, first on PATH, against the faux home. */
  sheep(args, options = {}) {
    const env = { ...this.env(), SHEEP_HOME: this.fauxHome.url, SHEEP_TOKEN: TOKEN };
    return run("sheep", args, { env, cwd: this.dir, ...options });
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

  async walk() {
    const stamp = JSON.parse(git("show", `${this.sha}:package.json`)).sheep;
    const parents = git("log", "-1", "--format=%P", this.sha).split(" ");
    if (!parents.some((parent) => parent.startsWith(stamp.commit))) throw new Error(`the manifest's commit ${stamp.commit} is not a parent of ${this.sha}`);

    // Journey 1 step 7, the second half, first: the installed command names its build.
    const version = await this.sheep(["--version"]);
    const expected = `sheep ${stamp.commit} (${stamp.builtAt})\n`;
    if (version.code !== 0 || version.stdout !== expected) this.fail("step 7", "sheep --version", { ...version, stderr: `${version.stderr}\nexpected ${JSON.stringify(expected)}` });
    this.ok("step 7", "sheep --version", version.stdout.trim());

    this.skip("step 1", "sheep setup is collar phase 2's");
    this.skip("step 2", "sheep home local is collar phase 1's; the home is the faux one above");

    // Step 3: a sheep is minted, the reply streams, and ls lists it.
    const created = await this.sheep(["new", "--", "hello"]);
    const id = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== `${FAUX_REPLY}\n` || !id) this.fail("step 3", "sheep new -- hello", created);
    const listed = await this.sheep(["ls"]);
    if (listed.code !== 0 || !listed.stdout.split("\n").some((line) => line.startsWith(`${id}\t`))) this.fail("step 3", "sheep ls", listed);
    this.ok("step 3", "sheep new -- hello; sheep ls", `${FAUX_REPLY}; session ${id} listed`);

    // Step 4, first half: a prompt to the sheep, streamed by sheep's own client inside the bundle.
    const again = await this.sheep(["attach", id, "--", "again"]);
    if (again.code !== 0 || again.stdout !== `${FAUX_REPLY}\n`) this.fail("step 4", `sheep attach ${id} -- again`, again);
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
    this.skip("step 6", "the home stopping and starting is collar phase 1's");

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
      "the home a user gets: the home was this checkout's wrangler with the faux provider, not ~/.sheep/local",
    ]) {
      console.log(`  - ${item}`);
    }
    if (this.keep) console.log(`kept: ${this.dir}`);
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
    await ring.startFauxHome();
    await ring.walk();
  } catch (error) {
    failure = error;
  } finally {
    await ring.stopFauxHome();
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
