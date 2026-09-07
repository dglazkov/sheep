#!/usr/bin/env node
/**
 * The rings: prove a release the way a user meets it, in an environment
 * this checkout's state cannot reach. Collar phase 0 built the package
 * ring; collar phase 1 gave it the local home; collar phase 2 gave it
 * setup, so the walk is journey 1 whole, from `npx <spec> setup` to
 * `sheep --version`, with the installed command and nothing else.
 *
 *   pnpm hermetic --ring package [ref]     ref defaults to refs/heads/release of this repository
 *   pnpm hermetic --ring machine [ref]     the package ring inside a container from node:22-slim, then node:24-slim (collar phase 3)
 *   --repo <path>                          the repository the ref is read from and installed from (default: this checkout; a bare repository works)
 *   --spec <spec>                          install this spec instead of a ref: `github:dglazkov/sheep#release` needs no repository at all
 *   --commit <sha>                         with --spec: the installed build must be stamped with this commit
 *   --image <name>                         machine ring: one image instead of both (repeatable)
 *   --keep                                 leave the ring's directory, and its local home running, and say where
 *
 * The rings are one script with one walk: the ring chooses the environment,
 * never the steps. The machine ring exports the ref into a build context as
 * a bare repository, builds an image from `node:22-slim` and one from
 * `node:24-slim` with git and procps added (git because the README names
 * it as a prerequisite and npm's git installer needs it; procps because
 * this script reads `ps`), copies itself in, and runs `node hermetic.mjs
 * --ring package --repo /src.git <sha>` in a container with nothing
 * mounted and no Docker socket. A machine without Docker says so and
 * exits 2. CI's second job runs `--spec github:dglazkov/sheep#release` on
 * a bare runner: the string a user types, with no repository beside it.
 *
 * The package ring makes one temp directory and points five variables
 * inside it: `npm_config_prefix`, `npm_config_cache`, `HOME`,
 * `SHEEP_CONFIG`, and `SHEEP_LOCAL`, asserted before anything runs. It
 * puts the prefix's `bin` first on PATH with this checkout's directories
 * stripped from it, and walks journey 1 with the installed `sheep`, never
 * `bin/sheep.js`. One line per step; the first failure prints its command
 * and output and exits 1; the end names what was not checked.
 *
 * The walk is journey 1 steps 1 to 7 with the faux provider. Step 1 is
 * `npx <spec> setup --json` in a scratch working directory under the ring,
 * with `SHEEP_INSTALL_SPEC` naming the ring's ref as `git+file://<this
 * repo>#<sha>`, so setup's own `npm install -g` runs npm's git installer,
 * where isocan's #47 lived, against the ring's prefix and cache, never a
 * tarball and never GitHub, whose branch collar phase 3 pushes. The ring
 * then reads the install the way phase 0 did, and the report: the command
 * at the prefix's bin, the skill and its doorway in the working directory,
 * no home, and the next sentence. Step 2's `sheep home local --faux`
 * starts the home under the ring's `SHEEP_LOCAL`
 * (wrangler fetched into the ring's `~/.sheep/tools` at the manifest's
 * pin, through the ring's npm cache) and writes the ring's `SHEEP_CONFIG`;
 * every later command finds the home through that config, with no
 * `SHEEP_HOME` or `SHEEP_TOKEN` in the environment. `ps` is read while the
 * home runs, and polled for the whole walk, to see that the token is in
 * no process's arguments: the daemon gets its secrets from `.dev.vars`,
 * mode 600, through `--env-file`. Step 5 is `sheep --agent-help`, which
 * must print `dist/agent-guide.md` from beside the bundle, and setup a
 * second time, which must report everything current. The CLI runs with no
 * `NODE_NO_WARNINGS`: a warning on stderr from `sheep --version` (collar
 * phase 0's `ExperimentalWarning: SQLite`) fails the walk.
 *
 * Step 4 has two halves. `sheep attach <id> -- "again"` streams the reply
 * through sheep's own client, inside `dist/sheep.mjs`. `sheep attach
 * <id>` with no prompt spawns pi's client, `dist/pi-client.mjs` beside
 * the bundle; with no terminal, pi's client attaches, prints
 * `<server>\t<session>\tattached`, and exits, and the ring reads `ps`
 * while it runs to see the child and where it runs from.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Where this script lives, one level up: the checkout, or `/ring` inside the machine ring's container. Stripped from PATH. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAUX_REPLY = "ok";

/** The one string a dog needs, as `packages/cli/src/setup.ts` holds it: with this spec the ring leaves `SHEEP_INSTALL_SPEC` unset and setup runs its own default. */
const INSTALL_SPEC = "github:dglazkov/sheep#release";

/** The machine ring's images, in the order they run. */
const MACHINE_IMAGES = ["node:22-slim", "node:24-slim"];

function usage(message) {
  console.error(`hermetic: ${message}\nusage: pnpm hermetic --ring package|machine [ref] [--repo <path>] [--spec <spec> [--commit <sha>]] [--image <name>] [--keep]`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = { ring: undefined, ref: undefined, repo: root, spec: undefined, commit: undefined, images: [], keep: false };
  const value = (flag) => {
    const next = args.shift();
    if (next === undefined || next.startsWith("--")) usage(`${flag} needs a value`);
    return next;
  };
  while (args.length > 0) {
    const arg = args.shift();
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (inline !== undefined) args.unshift(inline);
    if (flag === "--ring") parsed.ring = value(flag);
    else if (flag === "--repo") parsed.repo = resolve(value(flag));
    else if (flag === "--spec") parsed.spec = value(flag);
    else if (flag === "--commit") parsed.commit = value(flag);
    else if (flag === "--image") parsed.images.push(value(flag));
    else if (flag === "--keep") parsed.keep = true;
    else if (flag.startsWith("--")) usage(`unknown flag ${flag}`);
    else if (parsed.ref !== undefined) usage(`one ref at most: ${parsed.ref} and ${flag}`);
    else parsed.ref = flag;
  }
  if (parsed.ring === undefined) usage("--ring is required");
  if (parsed.ring === "dog") usage("the dog ring is collar phase 4's; the package and machine rings exist");
  if (parsed.ring !== "package" && parsed.ring !== "machine") usage(`unknown ring ${parsed.ring}`);
  if (parsed.spec !== undefined && parsed.ref !== undefined) usage(`a ref (${parsed.ref}) or a spec (${parsed.spec}), not both`);
  if (parsed.commit !== undefined && parsed.spec === undefined) usage("--commit goes with --spec; a ref names its own commit");
  if (parsed.commit !== undefined && !/^[0-9a-f]{7,40}$/.test(parsed.commit)) usage(`--commit ${parsed.commit} is not a sha`);
  if (parsed.ring === "machine" && parsed.spec !== undefined) usage("the machine ring takes a ref; it exports the ref into the container as a bare repository");
  if (parsed.images.length > 0 && parsed.ring !== "machine") usage("--image is the machine ring's");
  if (parsed.spec === undefined && parsed.ref === undefined) parsed.ref = "refs/heads/release";
  if (parsed.images.length === 0) parsed.images = [...MACHINE_IMAGES];
  return parsed;
}

/** `git` in a repository: this checkout by default, or the one `--repo` named, which may be bare. */
const gitIn =
  (dir) =>
  (...args) => {
    const done = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (done.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${dir}: ${(done.stderr || "").trim()}`);
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
  /**
   * A ref in a repository (the spec becomes `git+file://<repo>#<sha>`, and
   * the ring reads the ref's tree to check the install against it), or a
   * spec alone (`github:dglazkov/sheep#release`: no repository, and the
   * build stamp is read from the install; `--commit` says what it must be).
   */
  constructor({ ref, repo, spec, commit, keep }) {
    if (spec === undefined) {
      this.git = gitIn(repo);
      // The ref first: a ref that does not resolve leaves no directory behind.
      this.sha = this.git("rev-parse", "--verify", `${ref}^{commit}`);
      this.ref = ref;
      this.repo = repo;
      this.spec = `git+file://${repo}#${this.sha}`;
      this.stamp = JSON.parse(this.git("show", `${this.sha}:package.json`)).sheep;
    } else {
      this.git = undefined;
      this.sha = undefined;
      this.ref = undefined;
      this.repo = undefined;
      this.spec = spec;
      this.stamp = undefined;
    }
    this.commit = commit;
    this.keep = keep;
    this.dir = mkdtempSync(join(tmpdir(), "sheep-ring-"));
    this.prefix = join(this.dir, "prefix");
    this.cache = join(this.dir, "npm-cache");
    this.home = join(this.dir, "home");
    this.local = join(this.home, ".sheep", "local");
    this.config = join(this.home, ".sheep", "config");
    for (const dir of [this.prefix, this.cache, this.home, this.local]) mkdirSync(dir, { recursive: true });
    this.work = join(this.dir, "work");
    mkdirSync(this.work);
    this.lines = [];
    this.unchecked = [];
    this.localHome = undefined;
    this.tokenWatch = undefined;
  }

  /** The directories stripped from PATH: where this script lives and the repository the ring installs from; never the filesystem root. */
  stripped() {
    return [...new Set([root, this.repo].filter((dir) => dir && dir !== sep))];
  }

  /** The environment every command in the ring runs with: the five variables, and a PATH with this checkout stripped. */
  env() {
    const inherited = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("npm_") || key.startsWith("PNPM_") || key === "NODE_OPTIONS" || key === "NODE_PATH" || key === "INIT_CWD") continue;
      // No home, no token, no key: the walk gets its home from the config the installed command writes, and runs the faux provider.
      if (key === "SHEEP_HOME" || key === "SHEEP_TOKEN" || key === "ANTHROPIC_API_KEY" || key === "SHEEP_INSTALL_SPEC") continue;
      inherited[key] = value;
    }
    const stripped = this.stripped();
    const path = (process.env.PATH ?? "").split(":").filter((entry) => entry && !stripped.some((dir) => entry === dir || entry.startsWith(dir + sep)));
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
    onlyHolds(this.work, []);
    for (const entry of env.PATH.split(":")) {
      for (const dir of this.stripped()) {
        if (entry === dir || entry.startsWith(dir + sep)) throw new Error(`PATH still reaches ${dir}: ${entry}`);
      }
    }
    if (existsSync(this.config)) throw new Error(`${this.config} exists before the walk`);
    console.log(`ring: ${this.dir}`);
    for (const key of five) console.log(`  ${key}=${env[key]}`);
    console.log(`  PATH=${join(this.prefix, "bin")}:… (${this.stripped().join(" and ")} stripped)`);
  }

  /** Paths as a child saw them, or as the ring named them: on macOS the ring's temp directory is under /var and its realpath under /private/var. */
  samePath(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const real = (path) => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    };
    return a === b || real(a) === real(b);
  }

  /**
   * Journey 1 step 1: `npx <spec> setup --json` in the ring's scratch
   * working directory. Setup installs the command with npm's git installer
   * and the skill into that directory; the ring reads both, and the report.
   */
  async install() {
    const spec = this.spec;
    const started = Date.now();
    // Setup's own default is the user's string; any other spec (a ref in a repository) reaches setup through SHEEP_INSTALL_SPEC.
    const env = spec === INSTALL_SPEC ? this.env() : { ...this.env(), SHEEP_INSTALL_SPEC: spec };
    const versions = { node: spawnSync("node", ["--version"], { env, encoding: "utf8" }).stdout.trim(), npm: spawnSync("npm", ["--version"], { env, encoding: "utf8" }).stdout.trim() };
    const command = `npx ${spec} setup --json`;
    const result = await run("npx", [spec, "setup", "--json"], { env, cwd: this.work });
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (result.code !== 0) this.fail("step 1", command, result);
    let report;
    try {
      report = JSON.parse(result.stdout);
    } catch {
      this.fail("step 1", command, { ...result, stderr: `${result.stderr}\nstdout is not the JSON report` });
    }
    const bin = join(this.prefix, "bin", "sheep");
    const pkg = join(this.prefix, "lib", "node_modules", "sheep");
    for (const required of [bin, join(pkg, "package.json"), join(pkg, "dist", "sheep.mjs"), join(pkg, "dist", "pi-client.mjs"), join(pkg, "dist", "agent-guide.md"), join(pkg, "home", "worker.mjs"), join(pkg, "home", "wrangler.jsonc"), join(pkg, ".agents", "skills", "sheep", "SKILL.md")]) {
      if (!existsSync(required)) this.fail("step 1", command, { ...result, stderr: `${result.stderr}\nmissing after install: ${required}` });
    }
    // With no repository, the build stamp is the install's; it has to be whole, and the commit the caller expected.
    if (this.stamp === undefined) {
      const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
      const stamp = manifest.sheep;
      if (manifest.name !== "sheep" || typeof stamp?.commit !== "string" || typeof stamp?.builtAt !== "string" || typeof stamp?.wrangler !== "string") {
        this.fail("step 1", `cat ${join(pkg, "package.json")}`, { stdout: JSON.stringify(manifest, null, 2), stderr: "expected name sheep and a build stamp under sheep: commit, builtAt, wrangler", code: 1 });
      }
      if (this.commit !== undefined && !this.commit.startsWith(stamp.commit)) {
        this.fail("step 1", `cat ${join(pkg, "package.json")}`, { stdout: JSON.stringify(stamp), stderr: `the install is stamped ${stamp.commit}; expected a build of ${this.commit}`, code: 1 });
      }
      this.stamp = stamp;
      console.log(`installed: sheep ${stamp.commit} (${stamp.builtAt}), wrangler ${stamp.wrangler}`);
    }
    for (const tool of ["esbuild", "wrangler", "workerd"]) {
      if (existsSync(join(pkg, "node_modules", tool))) this.fail("step 1", `ls ${join(pkg, "node_modules")}`, { stdout: readdirSync(join(pkg, "node_modules")).join("\n"), stderr: `${tool} was installed into the release's tree`, code: 1 });
    }
    const which = spawnSync("sh", ["-c", "command -v sheep"], { env, encoding: "utf8" }).stdout.trim();
    if (which !== bin) this.fail("step 1", "command -v sheep", { stdout: which, stderr: `expected ${bin}`, code: 1 });
    // No pi source anywhere under the prefix: pi is inside the two bundles, not a checkout.
    const find = spawnSync("find", [this.prefix, "-name", "*.ts", "-path", "*earendil*"], { encoding: "utf8" });
    if (find.stdout.trim() !== "") this.fail("step 1", `find ${this.prefix} -name '*.ts' -path '*earendil*'`, { stdout: find.stdout, stderr: "pi sources under the prefix", code: 1 });
    // npx ran from the ring's own cache, where its copy of the package will not keep; the durable one is the prefix's.
    if (!existsSync(join(this.cache, "_npx"))) this.fail("step 1", `ls ${this.cache}`, { stdout: readdirSync(this.cache).join("\n"), stderr: "npx left no _npx cache in the ring", code: 1 });
    const installed = readdirSync(join(pkg, "node_modules")).filter((name) => !name.startsWith("."));
    this.pkg = pkg;

    // The report: three states, and the next sentence.
    const version = `sheep ${this.stamp.commit} (${this.stamp.builtAt})`;
    const skillDir = join(this.work, ".agents", "skills", "sheep");
    const doorway = join(this.work, ".claude", "skills", "sheep");
    const expected = { cli: { state: "installed", path: bin, version, spec }, skill: { state: "installed", path: skillDir, doorway: { path: doorway, state: "linked" } }, home: { state: "none", home: null }, checkout: null, next: "sheep home local" };
    const wrong = [];
    if (report.cli?.state !== expected.cli.state || !this.samePath(report.cli?.path, bin) || report.cli?.version !== version || report.cli?.spec !== spec) wrong.push("cli");
    if (report.skill?.state !== "installed" || !this.samePath(report.skill?.path, skillDir) || report.skill?.doorway?.state !== "linked" || !this.samePath(report.skill?.doorway?.path, doorway)) wrong.push("skill");
    if (report.home?.state !== "none" || report.home?.home !== null) wrong.push("home");
    if (report.checkout !== null) wrong.push("checkout");
    if (report.next !== expected.next) wrong.push("next");
    if (wrong.length > 0) this.fail("step 1", command, { ...result, stderr: `${result.stderr}\n${wrong.join(", ")} not as expected: ${JSON.stringify(expected)}` });
    // The skill on disk: this release's SKILL.md under .agents, and .claude/skills/sheep a relative link to it.
    const shipped = readFileSync(join(pkg, ".agents", "skills", "sheep", "SKILL.md"), "utf8");
    const copied = existsSync(join(skillDir, "SKILL.md")) ? readFileSync(join(skillDir, "SKILL.md"), "utf8") : undefined;
    if (copied !== shipped) this.fail("step 1", `cat ${join(skillDir, "SKILL.md")}`, { stdout: copied ?? "", stderr: "expected the release's SKILL.md", code: 1 });
    if (this.sha !== undefined && shipped.trim() !== this.git("show", `${this.sha}:.agents/skills/sheep/SKILL.md`)) this.fail("step 1", `git show ${this.sha}:.agents/skills/sheep/SKILL.md`, { stdout: shipped, stderr: "the installed skill is not the ref's", code: 1 });
    let link;
    try {
      link = lstatSync(doorway);
    } catch {
      this.fail("step 1", `ls -l ${doorway}`, { stdout: "", stderr: "no doorway", code: 1 });
    }
    if (!link.isSymbolicLink() || readlinkSync(doorway) !== "../../.agents/skills/sheep" || !statSync(doorway).isDirectory() || readFileSync(join(doorway, "SKILL.md"), "utf8") !== shipped) {
      this.fail("step 1", `ls -l ${doorway}`, { stdout: link.isSymbolicLink() ? readlinkSync(doorway) : "not a symlink", stderr: "expected a relative symlink ../../.agents/skills/sheep leading to the copy", code: 1 });
    }
    // Nothing else appeared in the working directory, and nothing in HOME beyond the skeleton: setup makes no home.
    const inWork = readdirSync(this.work).sort();
    if (JSON.stringify(inWork) !== JSON.stringify([".agents", ".claude"])) this.fail("step 1", `ls -a ${this.work}`, { stdout: inWork.join("\n"), stderr: "expected .agents and .claude only", code: 1 });
    if (existsSync(this.config) || readdirSync(this.local).length > 0) this.fail("step 1", `ls -a ${join(this.home, ".sheep")}`, { stdout: readdirSync(join(this.home, ".sheep")).join("\n"), stderr: "setup wrote a config or touched the local home", code: 1 });
    this.ok("step 1", command, `${seconds}s, node ${versions.node}, npm ${versions.npm}; ${installed.length} packages beside sheep; no *.ts under *earendil*`);
    this.ok("step 1", "the report", `cli installed at <ring>/prefix/bin/sheep (${version}); skill installed at <work>/.agents/skills/sheep, .claude/skills/sheep linked; home none; next "${report.next}"`);
    if (spec !== INSTALL_SPEC) this.unchecked.push(`journey 1 step 1: the spec ${JSON.stringify(INSTALL_SPEC)}; the ring installed ${spec} through SHEEP_INSTALL_SPEC (CI's second job installs the user's string)`);
    if (this.sha === undefined) this.unchecked.push(`journey 1 step 1: that the installed skill and guide are the ref's: the ring had a spec and no repository, so it read them from the install`);
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
    const stamp = this.stamp;
    if (this.sha !== undefined) {
      const parents = this.git("log", "-1", "--format=%P", this.sha).split(" ");
      if (!parents.some((parent) => parent.startsWith(stamp.commit))) throw new Error(`the manifest's commit ${stamp.commit} is not a parent of ${this.sha}`);
    } else this.unchecked.push(`journey 2: that the release commit has ${stamp.commit} as a parent: no repository to read; \`git log release\` answers it`);

    // Journey 1 step 7, the second half, first: the installed command names its build, and says nothing on stderr. No home is needed, and none is configured.
    const version = await this.sheep(["--version"]);
    const expected = `sheep ${stamp.commit} (${stamp.builtAt})\n`;
    if (version.code !== 0 || version.stdout !== expected || version.stderr !== "") this.fail("step 7", "sheep --version", { ...version, stderr: `${version.stderr}\nexpected ${JSON.stringify(expected)} and an empty stderr` });
    this.ok("step 7", "sheep --version", `${version.stdout.trim()}; nothing on stderr`);

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

    // Step 5: the guide is the file beside the bundle, printed whole; and setup again, in the same directory, finds everything current and the home running.
    const guide = await this.sheep(["--agent-help"]);
    const shipped = readFileSync(join(this.pkg, "dist", "agent-guide.md"), "utf8");
    if (guide.code !== 0 || guide.stdout !== shipped || guide.stderr !== "") this.fail("step 5", "sheep --agent-help", { ...guide, stderr: `${guide.stderr}\nexpected ${join(this.pkg, "dist", "agent-guide.md")} on stdout and nothing on stderr` });
    if (this.sha !== undefined && shipped.trim() !== this.git("show", `${this.sha}:dist/agent-guide.md`)) this.fail("step 5", `git show ${this.sha}:dist/agent-guide.md`, { stdout: shipped, stderr: "the installed guide is not the ref's", code: 1 });
    for (const said of ["sheep home local", "ANTHROPIC_API_KEY", "sheep wait", "A hand at a terminal"]) {
      if (!shipped.includes(said)) this.fail("step 5", "sheep --agent-help", { ...guide, stderr: `the guide does not say ${JSON.stringify(said)}`, code: 1 });
    }
    const setupAgain = await this.sheep(["setup", "--json"], { cwd: this.work });
    let second;
    try {
      second = JSON.parse(setupAgain.stdout);
    } catch {
      this.fail("step 5", "sheep setup --json (again)", setupAgain);
    }
    const bin = join(this.prefix, "bin", "sheep");
    const current =
      setupAgain.code === 0 &&
      second.cli?.state === "on-path" &&
      this.samePath(second.cli.path, bin) &&
      second.cli.version === expected.trim() &&
      second.skill?.state === "current" &&
      second.skill.doorway?.state === "current" &&
      second.home?.state === "local" &&
      second.home.home === url &&
      second.home.running === true &&
      second.home.pid === report.pid &&
      second.checkout === null &&
      second.next === "sheep --agent-help";
    if (!current) this.fail("step 5", "sheep setup --json (again)", { ...setupAgain, stderr: `${setupAgain.stderr}\nexpected cli on-path at ${bin}, skill current, doorway current, home ${url} local and running under pid ${report.pid}, next "sheep --agent-help"` });
    this.ok("step 5", "sheep --agent-help; sheep setup --json (again)", `${shipped.split(/\s+/).length} words, the ref's dist/agent-guide.md; again: cli on-path, skill current, doorway current, home local running, next "${second.next}"`);

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
    // Counted in a child Node told the SQLite warning is known, so the only ExperimentalWarning that can appear in this ring's output is the CLI's.
    const counter = `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(process.argv[1], { readOnly: true });
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
      console.log(JSON.stringify(Object.fromEntries(tables.map((table) => [table, db.prepare('SELECT count(*) AS n FROM "' + table + '"').get().n]))));`;
    const counted = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "-e", counter, file], { encoding: "utf8" });
    if (counted.status !== 0) this.fail("step 7", `node -e (node:sqlite) ${file}`, { stdout: counted.stdout, stderr: counted.stderr, code: counted.status ?? 1 });
    const inFile = JSON.parse(counted.stdout);
    for (const [table, count] of Object.entries(counts)) {
      if (!(table in inFile)) this.fail("step 7", `sqlite3 ${file} .tables`, { stdout: Object.keys(inFile).join("\n"), stderr: `export reported ${table}=${count}, not in the file`, code: 1 });
      if (String(inFile[table]) !== count) this.fail("step 7", `SELECT count(*) FROM ${table}`, { stdout: String(inFile[table]), stderr: `export reported ${count}`, code: 1 });
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
      "that this machine's Node is the user's: the ring ran the node and npm on PATH here (the machine ring runs this walk in containers from node:22-slim and node:24-slim)",
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

/** Streams a command's output line by line under an indent; resolves with the exit code. */
function runIndented(command, args, options, indent = "    ") {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let pending = "";
    const emit = (chunk) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) console.log(indent + line);
    };
    child.stdout.on("data", emit);
    child.stderr.on("data", emit);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (pending) console.log(indent + pending);
      resolveRun(code ?? (signal ? 1 : 0));
    });
  });
}

/** The image tag the machine ring builds for a base image: `sheep-ring:node-22-slim`. */
const ringTag = (image) => `sheep-ring:${image.replace(/[^A-Za-z0-9_.-]+/g, "-")}`;

/**
 * The machine ring: the package ring's walk inside a container built from
 * each of the images, with the ref exported into the build context as a
 * bare repository and nothing mounted. One line per image, the package
 * ring's output indented under it; the first image that fails ends the
 * ring. Docker is the one thing it needs; without it, exit 2, loudly.
 */
async function machineRing({ ref, repo, images, keep }) {
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8" });
  if (docker.error || docker.status !== 0) {
    const why = docker.error ? docker.error.message : (docker.stderr || docker.stdout || "").trim();
    console.error(`hermetic: the machine ring needs Docker on this machine, and there is none that answers (docker version: ${why}); nothing was checked`);
    process.exit(2);
  }
  const engine = docker.stdout.trim();
  const git = gitIn(repo);
  let sha;
  try {
    sha = git("rev-parse", "--verify", `${ref}^{commit}`);
  } catch (error) {
    usage(`${ref}: ${error.message}`);
  }
  console.log(`machine ring: ${ref} = ${sha}; docker ${engine}; images ${images.join(", ")}`);

  // The build context: the ref's history as a bare repository, this script, and the Dockerfile. Nothing else of this machine reaches the image.
  const context = mkdtempSync(join(tmpdir(), "sheep-machine-"));
  const bare = join(context, "src.git");
  const failures = [];
  const unchecked = [];
  try {
    gitIn(context)("init", "--quiet", "--bare", "src.git");
    git("push", "--quiet", bare, `${sha}:refs/heads/ring`);
    // A fresh bare repository's HEAD points at a branch that does not exist, so `git ls-remote` lists no HEAD, and npm's git
    // installer (pacote, npm 10 and 11) dies on it: "Cannot read properties of undefined (reading 'sha')". HEAD is the ring's branch.
    gitIn(bare)("symbolic-ref", "HEAD", "refs/heads/ring");
    copyFileSync(fileURLToPath(import.meta.url), join(context, "hermetic.mjs"));
    copyFileSync(join(root, "scripts", "hermetic", "Dockerfile"), join(context, "Dockerfile"));
    const size = spawnSync("du", ["-sh", bare], { encoding: "utf8" }).stdout.split("\t")[0];
    console.log(`context: ${context}: src.git (${size}, the ref as refs/heads/ring), hermetic.mjs, Dockerfile`);

    for (const image of images) {
      const tag = ringTag(image);
      console.log(`\n${image}:`);
      const buildStarted = Date.now();
      const build = await run("docker", ["build", "--build-arg", `NODE_IMAGE=${image}`, "--tag", tag, "--file", join(context, "Dockerfile"), context], { env: { ...process.env, DOCKER_BUILDKIT: "1" } });
      const buildSeconds = ((Date.now() - buildStarted) / 1000).toFixed(0);
      if (build.code !== 0) {
        console.log(`    docker build failed (exit ${build.code}):\n${build.stdout}${build.stderr}`.trimEnd());
        failures.push(`${image}: docker build exited ${build.code}`);
        break;
      }
      // What the container is: the image's node, npm, and git, and none of what journey 3 step 2 rules out.
      const probe = [
        `printf 'node %s, npm %s, git %s, %s\\n' "$(node --version)" "$(npm --version)" "$(git --version | cut -d' ' -f3)" "$(uname -m)"`,
        `test ! -e /var/run/docker.sock || { echo 'a Docker socket is in the container'; exit 1; }`,
        `for tool in pnpm wrangler workerd; do ! command -v "$tool" >/dev/null || { echo "$tool is in the image"; exit 1; }; done`,
        `for f in "$HOME/.gitconfig" "$HOME/.npmrc" "$HOME/.sheep" "$HOME/.npm" "$HOME/.wrangler" "$HOME/.config/.wrangler"; do test ! -e "$f" || { echo "$f is in the image"; exit 1; }; done`,
        // `--init` mounts Docker's own init at /usr/sbin/docker-init: the one process that reaps a detached daemon, which a user's machine has and a container does not.
        `awk '$5 !~ /^\\/(proc|sys|dev|etc\\/(resolv.conf|hostname|hosts)|usr\\/sbin\\/docker-init)(\\/|$)/ && $5 != "/" {print "mounted: " $5; bad=1} END {exit bad}' /proc/self/mountinfo`,
        `echo "no docker socket; no pnpm, wrangler, or workerd; no git config, npmrc, .sheep, or .npm; nothing mounted but /, /proc, /sys, /dev, the DNS files, and docker-init"`,
      ].join(" && ");
      const probed = await run("docker", ["run", "--rm", "--init", tag, "sh", "-c", probe]);
      if (probed.code !== 0) {
        console.log(`    the container is not bare (exit ${probed.code}):\n${probed.stdout}${probed.stderr}`.trimEnd());
        failures.push(`${image}: the container is not bare`);
        break;
      }
      for (const line of probed.stdout.trim().split("\n")) console.log(`    ${line}`);
      const ringArgs = ["run", "--rm", "--init", tag, "node", "/ring/hermetic.mjs", "--ring", "package", "--repo", "/src.git", sha];
      console.log(`    docker ${ringArgs.join(" ")}`);
      const ringStarted = Date.now();
      const code = await runIndented("docker", ringArgs, {});
      const ringSeconds = ((Date.now() - ringStarted) / 1000).toFixed(0);
      if (code !== 0) {
        console.log(`${image}: FAILED (build ${buildSeconds}s, ring ${ringSeconds}s, exit ${code}); the container's output is above`);
        failures.push(`${image}: the package ring exited ${code}`);
        break;
      }
      console.log(`${image}: ok (build ${buildSeconds}s, ring ${ringSeconds}s)`);
    }
    unchecked.push(
      "that a person was in the loop: the walk was the package ring's, scripted, with the faux provider",
      "that the user's machine has git and ps: the image added git (the README's prerequisite, which npm's git installer needs) and procps (this script's own need, to watch for the token)",
      `that the user's architecture and libc are this image's: docker ${engine}, Debian slim`,
      "that a user without root can do it: the container ran as root, the image's default",
      "that the registry is reachable from a user's network: wrangler came through this machine's network, into the container's own npm cache",
      "that the dog ring's agent would find its way: no coding agent was in the container (collar phase 4)",
    );
  } finally {
    if (keep) console.log(`\nkept: ${context}`);
    else rmSync(context, { recursive: true, force: true });
  }
  console.log("\nnot checked by the machine ring (the package ring's own list is above, per image):");
  for (const item of unchecked) console.log(`  - ${item}`);
  console.log(`images kept: ${images.map(ringTag).join(", ")} (docker image rm to drop them)`);
  if (failures.length > 0) {
    console.log(`\nmachine ring: FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`\nmachine ring: ok (${images.length} image${images.length === 1 ? "" : "s"} held)`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { ring: ringName, ref, repo, spec, commit, keep } = parsed;
  if (ringName === "machine") {
    await machineRing(parsed);
    return;
  }
  let ring;
  try {
    ring = new Ring({ ref, repo, spec, commit, keep });
  } catch (error) {
    usage(`${ref}: ${error.message}`);
  }
  if (spec === undefined) console.log(`package ring: ${ref} = ${ring.sha}${repo === root ? "" : ` in ${repo}`}`);
  else console.log(`package ring: ${spec}${commit ? `, expected to be a build of ${commit}` : ""}`);
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
