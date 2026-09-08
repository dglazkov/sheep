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
 *   pnpm hermetic --ring dog [ref|spec]    the machine ring's container with Claude Code in it, given the skill and journey 1's sentence (collar phase 4)
 *   pnpm hermetic --ring account [ref|spec] the package ring's install, then a station on the shepherd's Cloudflare account: deployed, walked, deleted (station phase 1)
 *   --repo <path>                          the repository the ref is read from and installed from (default: this checkout; a bare repository works)
 *   --spec <spec>                          install this spec instead of a ref: `github:dglazkov/sheep#release` needs no repository at all
 *   --commit <sha>                         with --spec: the installed build must be stamped with this commit
 *   --image <name>                         machine ring: one image instead of both (repeatable); dog ring: instead of node:24-slim
 *   --keep                                 leave the ring's directory, and its local home running, and say where
 *   --yes                                  dog and account rings: the shepherd has read the estimate; do not ask
 *   --dry-run                              dog ring: build, probe, add the skill, print the `claude -p` command, and stop before it; no key is needed
 *                                          account ring: the preflight alone: the price, the account, its listing, the image on the registry; nothing deployed
 *   --name <worker>                        account ring: the station's name (default sheep-hermetic-<sha>)
 *   --budget <usd>                         dog ring: Claude Code's --max-budget-usd (default 5)
 *   --timeout <minutes>                    dog ring: the container is killed after this long (default 30)
 *   --agent <name>                         dog ring: claude-code, the only dog so far
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
 * The dog ring is the machine ring's image from `node:24-slim` with Claude
 * Code installed by `npm install -g` at its current version, run once, as
 * root, with `ANTHROPIC_API_KEY` from this process's environment passed
 * through `docker run -e` (never an argument, never a build arg, never a
 * file) and nothing else of this machine. Inside, this script's other
 * half (`--inside`) adds the skill to a fresh working directory under the
 * container's HOME with `npx skills add dglazkov/sheep --skill sheep` (the
 * root SKILL.md, the one skill a bare `skills add` finds). That directory
 * becomes a kennel when the dog runs setup in it, the way any directory
 * does, and the assertions after the run read the kennel `sheep home
 * --json` names rather than assuming `~/.sheep`. The ring
 * prints the exact `claude -p` command, and runs it with journey 1's
 * sentence and no steps: `--allowedTools` for Bash, Read, Edit, Write,
 * Glob, and Grep, `--permission-prompts none` so nothing can ask and
 * anything that would is denied and reported, `--max-budget-usd` as the
 * cap, and `--output-format stream-json`, which this script renders as
 * the transcript. Afterwards, in the same container, the installed
 * `sheep --version`, `sheep ls --json`, and `sheep home --json` must show
 * the ref's build, a sheep, and the local home answering with the key
 * held; then `sheep home stop`. A ref is exported as `refs/heads/release`
 * of `/src.git` and the container's git is told that
 * `github.com/dglazkov/sheep` is `/src.git`, so the string the dog types
 * from the README installs the ref; the spec `github:dglazkov/sheep#release`
 * exports nothing and the dog's string reaches GitHub. The ring spends the
 * shepherd's tokens and says so before the image is built, waiting for a
 * `y` unless `--yes`; `--dry-run` needs neither the key nor the yes.
 *
 * The package ring makes one temp directory and points three variables
 * inside it: `npm_config_prefix`, `npm_config_cache`, and `HOME`,
 * asserted before anything runs. Kennel phase 0 retired the other two:
 * `SHEEP_CONFIG` and `SHEEP_LOCAL` are gone, and the ring reads the config
 * where `sheep setup` wrote it, in the kennel each working directory
 * became. A fresh `HOME` and a fresh working directory are the whole
 * override now, which is the discovery a dog does. It puts the prefix's
 * `bin` first on PATH with this checkout's directories stripped from it,
 * and walks with the installed `sheep`, never `bin/sheep.js`. One line per
 * step; the first failure prints its command and output and exits 1; the
 * end names what was not checked.
 *
 * Two working directories under the ring, `blog` (a git work tree) and
 * `pi` (not one), walk kennel's journey 1 steps 1 to 5 and journey 2 steps
 * 1 and 2 between them: two kennels, two homes on two ports with two
 * tokens, each `sheep ls` its own sheep, a subdirectory finding its
 * parent's home, one home stopped while the other runs, and a walk from
 * outside both falling back to `~/.sheep`. Journey 2's half is git's: the
 * `.gitignore` gains one line, `.sheep/` is ignored and never untracked,
 * and the directory outside git gets no `.gitignore` at all. Wrangler is
 * fetched once, into `~/.sheep/tools`, and the second kennel finds it
 * there; nothing else is ever under the ring's `HOME/.sheep`.
 *
 * Collar's own walk is journey 1 steps 1 to 7 with the faux provider, from
 * `blog`. Step 1 is `npx <spec> setup --json` in that directory,
 * with `SHEEP_INSTALL_SPEC` naming the ring's ref as `git+file://<this
 * repo>#<sha>`, so setup's own `npm install -g` runs npm's git installer,
 * where isocan's #47 lived, against the ring's prefix and cache, never a
 * tarball and never GitHub, whose branch collar phase 3 pushes. The ring
 * then reads the install the way phase 0 did, and the report: the command
 * at the prefix's bin, the skill and its doorway in the working directory,
 * the kennel made there with its ignore entry, no home, and the next
 * sentence. Step 2's `sheep home local --faux` starts the home under
 * `blog/.sheep/local` (wrangler fetched into the ring's `~/.sheep/tools`
 * at the manifest's pin, through the ring's npm cache) and writes
 * `blog/.sheep/config`; every later command run in that directory finds
 * the home through that config, with no `SHEEP_HOME` or `SHEEP_TOKEN` in
 * the environment. `ps` is read while the
 * home runs, and polled for the whole walk, to see that the token is in
 * no process's arguments: the daemon gets its secrets from `.dev.vars`,
 * mode 600, through `--env-file`. Step 5 is `sheep --agent-help`, which
 * must print `dist/agent-guide.md` from beside the bundle, and setup a
 * second time, which must report everything current. Step 6's `sheep home
 * --json`, with the home started on demand, must show the two stamps
 * equal: `build.home`, which the Worker reports from what
 * `scripts/bundle.mjs` defined into it, and `build.cli`, the manifest's,
 * both the release's commit and time (station phase 0). The CLI runs with no
 * `NODE_NO_WARNINGS`: a warning on stderr from `sheep --version` (collar
 * phase 0's `ExperimentalWarning: SQLite`) fails the walk.
 *
 * Step 4 has two halves. `sheep attach <id> -- "again"` streams the reply
 * through sheep's own client, inside `dist/sheep.mjs`. `sheep attach
 * <id>` with no prompt spawns pi's client, `dist/pi-client.mjs` beside
 * the bundle; with no terminal, pi's client attaches, prints
 * `<server>\t<session>\tattached`, and exits, and the ring reads `ps`
 * while it runs to see the child and where it runs from.
 *
 * The account ring (station phase 1) is the package ring's fresh world
 * and install, then the station: with `CLOUDFLARE_API_TOKEN` in this
 * process's environment (else exit 2, nothing done) it asks the account
 * whose token it is, which plan, which subdomain, and what it holds, asks
 * Docker Hub for the image the ref's `home/wrangler.jsonc` names, states
 * the price, and waits for a `y` unless `--yes` (no terminal and no
 * `--yes` is exit 2). Then, from `blog`: `sheep home deploy` with the token
 * removed exits 2 and the listing is identical before and after; `sheep
 * home deploy --faux --name sheep-hermetic-<sha> --json`, timed under
 * three minutes, the address answering `sheep`, `sheep home --json`
 * showing the two stamps equal; a faux program posted through the address
 * and `sheep new` answering `git, node, pnpm` from a container whose
 * shell names `git version` in `sheep log`; `sheep home local --faux` in
 * `pi` reached from `blog` with `--home` for one command while blog's
 * config keeps naming the station; the redeploy, same Worker, same token,
 * same stamp, the sheep still listed; and `sheep home delete` with the
 * name on stdin, the account listed afterwards holding neither the Worker
 * nor the application. The token and the key reach `sheep home deploy`'s
 * environment and nothing else; `ps` is polled for the token, the key,
 * and the station's `SHEEP_TOKEN` across the whole walk. A failure after
 * the deploy deletes first and says so. Without `ANTHROPIC_API_KEY`, a
 * placeholder is set as the secret, since the faux provider uses none.
 *
 * Station phase 2 adds two steps between the redeploy and the delete, and
 * the image by digest. The image: the ref's config names the pen image,
 * by digest when the workflow's push came before the release; the ring
 * asks Docker Hub for the digest of the tag at the release's commit and
 * asserts the two are the same, then after the deploy asserts `GET
 * /home`'s `image` equals the config's line and the deployed container
 * application's `configuration.image`. That is "the ring says which". The
 * second machine (journey 2, step a7): a container from the machine
 * ring's image (`node:24-slim`, the ref as `/src.git`), run with `--rm
 * --init -i` and nothing mounted, the station's token piped on its stdin,
 * the address and the sheep's id as arguments; inside, this script's
 * other half (`--second`, never typed by hand) installs the release from
 * `/src.git` into a fresh world under the container's HOME, runs `sheep
 * home join <address>` with the token from its own stdin, `sheep home
 * --json`, `sheep ls --json` listing the sheep the first machine minted,
 * a promptless `sheep attach <id>`, and then, once the outer half has
 * started a turn on that sheep from `blog` with `sheep attach <id> -- …`
 * and killed that process with SIGKILL two seconds in (lamb's journey 2:
 * the first terminal closed mid-turn), `sheep wait <id>` and `sheep log
 * <id>` showing the turn's end. The token is asserted absent from `ps`
 * inside the container as it is outside. Journey 3 (step a8): pasture's
 * journey 1 against `dglazkov/lamb-playground` with the shepherd's
 * fine-grained token, read from `LAMB_PLAYGROUND_TOKEN` in this process's
 * environment and piped into `sheep pasture secret set`: two sheep born
 * into a pasture named for the commit, each cloning at birth in its
 * container, each pushing a branch with the pasture's credential and
 * naming it in the tree; both branches seen on GitHub anonymously, the
 * token absent from every transcript, export, and `ps` sample; the two
 * branches deleted afterwards through a `GIT_ASKPASS` helper reading the
 * environment, so the scratch repository is left as found. Without the
 * variable the step is one `skip` line and the ring goes on.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Where this script lives, one level up: the checkout, or `/ring` inside the machine ring's container. Stripped from PATH. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAUX_REPLY = "ok";

/** The one string a dog needs, as `packages/cli/src/setup.ts` holds it: with this spec the ring leaves `SHEEP_INSTALL_SPEC` unset and setup runs its own default. */
const INSTALL_SPEC = "github:dglazkov/sheep#release";

/** The machine ring's images, in the order they run. */
const MACHINE_IMAGES = ["node:22-slim", "node:24-slim"];

/** The dog ring: one image, one dog, the sentence from journey 1, and the tools the dog is given. */
const DOG_IMAGE = "node:24-slim";
const DOG_AGENT = "claude-code";
const AGENT_PACKAGE = "@anthropic-ai/claude-code";
const SENTENCE = "Install sheep from github.com/dglazkov/sheep and try it out.";
const DOG_TOOLS = "Bash,Read,Edit,Write,Glob,Grep";
/** How the skill reaches the dog before the prompt: the `skills` CLI, reading `main` of the public repository, this skill alone, into Claude Code's directory, with no prompts. */
const SKILLS_ADD = ["npx", "-y", "skills", "add", "dglazkov/sheep", "--skill", "sheep", "--agent", DOG_AGENT, "-y"];
/** The URLs npm's git installer may try for `github:dglazkov/sheep`; in repo mode the container's git is told each one is `/src.git`. */
const GITHUB_URLS = ["https://github.com/dglazkov/sheep.git", "git+https://github.com/dglazkov/sheep.git", "ssh://git@github.com/dglazkov/sheep.git", "git+ssh://git@github.com/dglazkov/sheep.git"];

function usage(message) {
  console.error(
    `hermetic: ${message}\nusage: pnpm hermetic --ring package|machine [ref] [--repo <path>] [--spec <spec> [--commit <sha>]] [--image <name>] [--keep]\n       pnpm hermetic --ring dog [ref|${INSTALL_SPEC}] [--repo <path>] [--commit <sha>] [--image <name>] [--yes] [--dry-run] [--budget <usd>] [--timeout <minutes>] [--agent claude-code] [--keep]\n       pnpm hermetic --ring account [ref|${INSTALL_SPEC}] [--repo <path>] [--commit <sha>] [--yes] [--dry-run] [--name <worker>] [--keep]`,
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    ring: undefined,
    ref: undefined,
    repo: root,
    spec: undefined,
    commit: undefined,
    images: [],
    keep: false,
    yes: false,
    dryRun: false,
    budget: 5,
    timeout: 30,
    agent: DOG_AGENT,
    name: undefined,
    // The container's half of the dog ring, and what the outer half tells it: never typed by hand.
    inside: false,
    redirect: false,
    expect: undefined,
    // The container's half of the account ring's second machine (station phase 2), and what the outer half tells it: never typed by hand.
    second: false,
    address: undefined,
    sheep: undefined,
    expectImage: undefined,
  };
  const value = (flag) => {
    const next = args.shift();
    if (next === undefined || next.startsWith("--")) usage(`${flag} needs a value`);
    return next;
  };
  let positional;
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
    else if (flag === "--yes") parsed.yes = true;
    else if (flag === "--dry-run") parsed.dryRun = true;
    else if (flag === "--budget") parsed.budget = Number(value(flag));
    else if (flag === "--timeout") parsed.timeout = Number(value(flag));
    else if (flag === "--agent") parsed.agent = value(flag);
    else if (flag === "--name") parsed.name = value(flag);
    else if (flag === "--inside") parsed.inside = true;
    else if (flag === "--redirect") parsed.redirect = true;
    else if (flag === "--expect") parsed.expect = value(flag);
    else if (flag === "--second") parsed.second = true;
    else if (flag === "--address") parsed.address = value(flag);
    else if (flag === "--sheep") parsed.sheep = value(flag);
    else if (flag === "--expect-image") parsed.expectImage = value(flag);
    else if (flag.startsWith("--")) usage(`unknown flag ${flag}`);
    else if (positional !== undefined) usage(`one ref at most: ${positional} and ${flag}`);
    else positional = flag;
  }
  if (parsed.ring === undefined) usage("--ring is required");
  if (parsed.ring !== "package" && parsed.ring !== "machine" && parsed.ring !== "dog" && parsed.ring !== "account") usage(`unknown ring ${parsed.ring}`);
  // The dog and account rings' one argument is a ref or the spec a user types; the other rings take a ref there and a spec by flag.
  if (positional !== undefined) {
    if ((parsed.ring === "dog" || parsed.ring === "account") && /^(github:|git\+|git:|https?:|ssh:)/.test(positional)) parsed.spec = positional;
    else parsed.ref = positional;
  }
  if (parsed.spec !== undefined && parsed.ref !== undefined) usage(`a ref (${parsed.ref}) or a spec (${parsed.spec}), not both`);
  if (parsed.commit !== undefined && parsed.spec === undefined) usage("--commit goes with --spec; a ref names its own commit");
  if (parsed.commit !== undefined && !/^[0-9a-f]{7,40}$/.test(parsed.commit)) usage(`--commit ${parsed.commit} is not a sha`);
  if (parsed.ring === "machine" && parsed.spec !== undefined) usage("the machine ring takes a ref; it exports the ref into the container as a bare repository");
  if (parsed.images.length > 0 && parsed.ring === "package") usage("--image is the machine and dog rings'");
  for (const [flag, on] of [["--inside", parsed.inside], ["--redirect", parsed.redirect], ["--expect", parsed.expect !== undefined]]) {
    if (on && parsed.ring !== "dog") usage(`${flag} is the dog ring's`);
  }
  for (const [flag, on] of [["--second", parsed.second], ["--address", parsed.address !== undefined], ["--sheep", parsed.sheep !== undefined], ["--expect-image", parsed.expectImage !== undefined]]) {
    if (on && parsed.ring !== "account") usage(`${flag} is the account ring's second machine's`);
  }
  if (parsed.second && (parsed.address === undefined || parsed.sheep === undefined || parsed.expectImage === undefined)) usage("--second needs --address, --sheep, and --expect-image; the outer half passes them, and nobody types them");
  for (const [flag, on] of [["--yes", parsed.yes], ["--dry-run", parsed.dryRun]]) {
    if (on && parsed.ring !== "dog" && parsed.ring !== "account") usage(`${flag} is the dog and account rings'`);
  }
  if (parsed.name !== undefined && parsed.ring !== "account") usage("--name is the account ring's");
  if (parsed.name !== undefined && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(parsed.name)) usage(`--name ${parsed.name} is not a Worker name`);
  if (parsed.images.length > 0 && parsed.ring === "account") usage("--image is the machine and dog rings'");
  if (parsed.ring === "dog") {
    if (parsed.spec !== undefined && parsed.spec !== INSTALL_SPEC) usage(`the dog types the README's spec, ${INSTALL_SPEC}; a spec that is not that one cannot be what it installs (a ref installs through /src.git)`);
    if (parsed.agent !== DOG_AGENT) usage(`--agent ${parsed.agent}: ${DOG_AGENT} is the only dog so far; pi is the second, deliberately open`);
    if (!Number.isFinite(parsed.budget) || parsed.budget <= 0) usage(`--budget ${parsed.budget} is not a number of dollars`);
    if (!Number.isFinite(parsed.timeout) || parsed.timeout <= 0) usage(`--timeout ${parsed.timeout} is not a number of minutes`);
    if (parsed.images.length > 1) usage("the dog ring runs one image; the walk is the point, not the matrix");
    if (parsed.images.length === 0) parsed.images = [DOG_IMAGE];
  }
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

/** Runs a command to completion, collecting output; never throws on a nonzero exit. `input` is written to stdin, which is otherwise closed. */
function run(command, args, options) {
  const { input, ...rest } = options ?? {};
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], ...rest });
    if (input !== undefined) child.stdin.end(input);
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

/**
 * `ps` over every process, polled while something runs; the first line
 * holding any of the needles is kept, and the samples counted. Two tokens
 * (one per kennel) are two needles, watched by one timer.
 */
function watchPs(needle, everyMs = 15) {
  const needles = Array.isArray(needle) ? needle : [needle];
  let seen;
  let samples = 0;
  const timer = setInterval(() => {
    samples++;
    if (seen) return;
    const line = psLines().find((candidate) => needles.some((one) => candidate.includes(one)));
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
  constructor({ ref, repo, spec, commit, keep, dir }) {
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
    // The world: a temp directory, or the one the caller made (the second machine's, under the container's HOME).
    this.dir = dir ?? mkdtempSync(join(tmpdir(), "sheep-ring-"));
    this.prefix = join(this.dir, "prefix");
    this.cache = join(this.dir, "npm-cache");
    this.home = join(this.dir, "home");
    // Two dogs, two directories: `blog` is a git work tree (journey 2 step 1), `pi` is not (step 2). Neither is a kennel yet; setup makes them.
    this.blog = join(this.dir, "blog");
    this.pi = join(this.dir, "pi");
    // A subdirectory of blog, where journey 1 step 3 stands: it has no kennel of its own and must find blog's.
    this.deep = join(this.blog, "posts", "2026");
    for (const dir of [this.prefix, this.cache, this.home, this.blog, this.pi, this.deep]) mkdirSync(dir, { recursive: true });
    gitIn(this.blog)("init", "--quiet");
    this.lines = [];
    this.unchecked = [];
    // Each kennel's running home, by directory: what `stopLocalHome` ends.
    this.homes = new Map();
    this.watches = [];
  }

  /** The kennel `sheep setup` made in a working directory: `<dir>/.sheep`, where the config and the local home live. */
  kennel(dir) {
    return join(dir, ".sheep");
  }

  /**
   * The `kennel:` line as the installed command prints it: the path it
   * resolved from its working directory, which on macOS is the realpath
   * under `/private/var` where the ring's own name says `/var`.
   */
  kennelLine(dir) {
    return `kennel: ${realpathSync(this.kennel(dir))}\n`;
  }

  configOf(dir) {
    return join(this.kennel(dir), "config");
  }

  localOf(dir) {
    return join(this.kennel(dir), "local");
  }

  /** The directories stripped from PATH: where this script lives and the repository the ring installs from; never the filesystem root. */
  stripped() {
    return [...new Set([root, this.repo].filter((dir) => dir && dir !== sep))];
  }

  /** The environment every command in the ring runs with: the three variables, and a PATH with this checkout stripped. */
  env() {
    const inherited = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("npm_") || key.startsWith("PNPM_") || key === "NODE_OPTIONS" || key === "NODE_PATH" || key === "INIT_CWD") continue;
      // No home, no token, no key: the walk gets its home from the config the installed command writes, and runs the faux provider.
      if (key === "SHEEP_HOME" || key === "SHEEP_TOKEN" || key === "ANTHROPIC_API_KEY" || key === "SHEEP_INSTALL_SPEC") continue;
      // No account, and none of the test seams: the account ring hands the token to one command's environment; a fake would be a facade.
      if (key.startsWith("CLOUDFLARE_") || key.startsWith("SHEEP_TEST_")) continue;
      // The scratch repository's token reaches `sheep pasture secret set`'s stdin and the branch delete's helper, and no command's environment.
      if (key === "LAMB_PLAYGROUND_TOKEN") continue;
      inherited[key] = value;
    }
    const stripped = this.stripped();
    const path = (process.env.PATH ?? "").split(":").filter((entry) => entry && !stripped.some((dir) => entry === dir || entry.startsWith(dir + sep)));
    return {
      ...inherited,
      npm_config_prefix: this.prefix,
      npm_config_cache: this.cache,
      HOME: this.home,
      PATH: [join(this.prefix, "bin"), ...path].join(":"),
      npm_config_update_notifier: "false",
      npm_config_fund: "false",
      npm_config_audit: "false",
      npm_config_progress: "false",
    };
  }

  assertFresh() {
    const env = this.env();
    const three = ["npm_config_prefix", "npm_config_cache", "HOME"];
    for (const key of three) {
      const value = env[key];
      if (!value || !(value === this.dir || value.startsWith(this.dir + sep))) throw new Error(`${key}=${value} is not inside the ring ${this.dir}`);
      if (!existsSync(value) || !statSync(value).isDirectory()) throw new Error(`${key}: ${value} is not a fresh directory`);
    }
    // Fresh means empty: no `.sheep` anywhere, not in HOME and not in either working directory. Setup makes the kennels; nothing here does.
    const onlyHolds = (dir, names) => {
      const found = readdirSync(dir);
      if (found.some((name) => !names.includes(name))) throw new Error(`${dir} is not empty: ${found.join(", ")}`);
    };
    onlyHolds(this.prefix, []);
    onlyHolds(this.cache, []);
    onlyHolds(this.home, []);
    onlyHolds(this.blog, [".git", "posts"]);
    onlyHolds(this.pi, []);
    for (const entry of env.PATH.split(":")) {
      for (const dir of this.stripped()) {
        if (entry === dir || entry.startsWith(dir + sep)) throw new Error(`PATH still reaches ${dir}: ${entry}`);
      }
    }
    for (const dir of [this.home, this.blog, this.pi]) {
      if (existsSync(this.kennel(dir))) throw new Error(`${this.kennel(dir)} exists before the walk`);
    }
    if (existsSync(join(this.blog, ".gitignore"))) throw new Error(`${join(this.blog, ".gitignore")} exists before the walk`);
    console.log(`ring: ${this.dir}`);
    for (const key of three) console.log(`  ${key}=${env[key]}`);
    console.log(`  kennels: none yet; ${this.blog} (a git work tree) and ${this.pi} (not one) become two when setup runs in them`);
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
   * Journey 1 step 1: `npx <spec> setup --json` in the ring's `blog`
   * directory. Setup installs the command with npm's git installer, the
   * skill into that directory, and the kennel `.sheep/` with the
   * `.gitignore` entry a git work tree needs; the ring reads all three,
   * and the report.
   */
  async install() {
    const spec = this.spec;
    const started = Date.now();
    // Setup's own default is the user's string; any other spec (a ref in a repository) reaches setup through SHEEP_INSTALL_SPEC.
    const env = spec === INSTALL_SPEC ? this.env() : { ...this.env(), SHEEP_INSTALL_SPEC: spec };
    const versions = { node: spawnSync("node", ["--version"], { env, encoding: "utf8" }).stdout.trim(), npm: spawnSync("npm", ["--version"], { env, encoding: "utf8" }).stdout.trim() };
    const command = `npx ${spec} setup --json`;
    const result = await run("npx", [spec, "setup", "--json"], { env, cwd: this.blog });
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
    for (const required of [bin, join(pkg, "package.json"), join(pkg, "dist", "sheep.mjs"), join(pkg, "dist", "pi-client.mjs"), join(pkg, "dist", "agent-guide.md"), join(pkg, "home", "worker.mjs"), join(pkg, "home", "wrangler.jsonc"), join(pkg, "SKILL.md")]) {
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
    const skillDir = join(this.blog, ".agents", "skills", "sheep");
    const doorway = join(this.blog, ".claude", "skills", "sheep");
    const expected = { cli: { state: "installed", path: bin, version, spec }, skill: { state: "installed", path: skillDir, doorway: { path: doorway, state: "linked" } }, home: { state: "none", home: null }, checkout: null, next: "sheep home local" };
    const wrong = [];
    if (report.cli?.state !== expected.cli.state || !this.samePath(report.cli?.path, bin) || report.cli?.version !== version || report.cli?.spec !== spec) wrong.push("cli");
    if (report.skill?.state !== "installed" || !this.samePath(report.skill?.path, skillDir) || report.skill?.doorway?.state !== "linked" || !this.samePath(report.skill?.doorway?.path, doorway)) wrong.push("skill");
    if (report.home?.state !== "none" || report.home?.home !== null) wrong.push("home");
    // The kennel: made here, with the entry appended to a .gitignore this directory did not have, and nothing of it tracked.
    if (
      report.kennel?.state !== "made" ||
      !this.samePath(report.kennel?.path, this.kennel(this.blog)) ||
      report.kennel?.gitignore?.state !== "added" ||
      !this.samePath(report.kennel?.gitignore?.path, join(this.blog, ".gitignore")) ||
      report.kennel?.tracked !== false
    ) {
      wrong.push("kennel");
    }
    if (report.checkout !== null) wrong.push("checkout");
    if (report.next !== expected.next) wrong.push("next");
    if (wrong.length > 0) this.fail("step 1", command, { ...result, stderr: `${result.stderr}\n${wrong.join(", ")} not as expected: ${JSON.stringify(expected)}` });
    // The skill on disk: this release's root SKILL.md copied under .agents, and .claude/skills/sheep a relative link to it.
    const shipped = readFileSync(join(pkg, "SKILL.md"), "utf8");
    const copied = existsSync(join(skillDir, "SKILL.md")) ? readFileSync(join(skillDir, "SKILL.md"), "utf8") : undefined;
    if (copied !== shipped) this.fail("step 1", `cat ${join(skillDir, "SKILL.md")}`, { stdout: copied ?? "", stderr: "expected the release's SKILL.md", code: 1 });
    if (this.sha !== undefined && shipped.trim() !== this.git("show", `${this.sha}:SKILL.md`)) this.fail("step 1", `git show ${this.sha}:SKILL.md`, { stdout: shipped, stderr: "the installed skill is not the ref's", code: 1 });
    let link;
    try {
      link = lstatSync(doorway);
    } catch {
      this.fail("step 1", `ls -l ${doorway}`, { stdout: "", stderr: "no doorway", code: 1 });
    }
    if (!link.isSymbolicLink() || readlinkSync(doorway) !== "../../.agents/skills/sheep" || !statSync(doorway).isDirectory() || readFileSync(join(doorway, "SKILL.md"), "utf8") !== shipped) {
      this.fail("step 1", `ls -l ${doorway}`, { stdout: link.isSymbolicLink() ? readlinkSync(doorway) : "not a symlink", stderr: "expected a relative symlink ../../.agents/skills/sheep leading to the copy", code: 1 });
    }
    // Nothing else appeared in the working directory, and nothing at all in HOME: setup makes no home and fetches no tool.
    const inWork = readdirSync(this.blog).sort();
    const expectedInWork = [".agents", ".claude", ".git", ".gitignore", ".sheep", "posts"];
    if (JSON.stringify(inWork) !== JSON.stringify(expectedInWork)) this.fail("step 1", `ls -a ${this.blog}`, { stdout: inWork.join("\n"), stderr: `expected ${expectedInWork.join(", ")}`, code: 1 });
    if (readdirSync(this.kennel(this.blog)).length > 0) this.fail("step 1", `ls -a ${this.kennel(this.blog)}`, { stdout: readdirSync(this.kennel(this.blog)).join("\n"), stderr: "the kennel setup made is not empty", code: 1 });
    if (existsSync(join(this.home, ".sheep"))) this.fail("step 1", `ls -a ${this.home}`, { stdout: readdirSync(this.home).join("\n"), stderr: "setup touched HOME/.sheep", code: 1 });
    // Journey 2 step 1: the .gitignore is one line, and git sees nothing under .sheep.
    const ignore = readFileSync(join(this.blog, ".gitignore"), "utf8");
    if (ignore !== ".sheep/\n") this.fail("step 1", `cat ${join(this.blog, ".gitignore")}`, { stdout: ignore, stderr: 'expected exactly ".sheep/"', code: 1 });
    const status = this.git0(this.blog, "status", "--porcelain");
    if (status.includes(".sheep")) this.fail("k2.1", `git status --porcelain in ${this.blog}`, { stdout: status, stderr: "git sees something under .sheep", code: 1 });
    this.ok("step 1", command, `${seconds}s, node ${versions.node}, npm ${versions.npm}; ${installed.length} packages beside sheep; no *.ts under *earendil*`);
    this.ok("step 1", "the report", `cli installed at <ring>/prefix/bin/sheep (${version}); skill installed at <blog>/.agents/skills/sheep, .claude/skills/sheep linked; kennel <blog>/.sheep made; home none; next "${report.next}"`);
    this.ok("k2.1", `cat <blog>/.gitignore; git status --porcelain`, `one line, ".sheep/"; untracked: ${status.trim().split("\n").join(" ") || "(none)"}; nothing under .sheep`);
    if (spec !== INSTALL_SPEC) this.unchecked.push(`journey 1 step 1: the spec ${JSON.stringify(INSTALL_SPEC)}; the ring installed ${spec} through SHEEP_INSTALL_SPEC (CI's second job installs the user's string)`);
    if (this.sha === undefined) this.unchecked.push(`journey 1 step 1: that the installed skill and guide are the ref's: the ring had a spec and no repository, so it read them from the install`);
  }

  /**
   * The installed `sheep`, first on PATH, finding its kennel by walking up
   * from `cwd` and its home through the config it finds there, with
   * nothing in the environment. Every step names the directory it stands
   * in; `blog` is the default, as the dog that opened there.
   */
  sheep(args, options = {}) {
    return run("sheep", args, { env: this.env(), cwd: this.blog, ...options });
  }

  /** `git` in a directory of the ring, for reading: the output, whatever the exit code. */
  git0(dir, ...args) {
    const done = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    return done.stdout ?? "";
  }

  ok(step, command, note) {
    const line = `ok    ${step.padEnd(8)} ${command}${note ? `  → ${note}` : ""}`;
    this.lines.push(line);
    console.log(line);
  }

  skip(step, why, journey = "journey 1") {
    const line = `skip  ${step.padEnd(8)} ${why}`;
    this.lines.push(line);
    console.log(line);
    this.unchecked.push(`${journey} ${step}: ${why}`);
  }

  fail(step, command, result) {
    const error = new Error(`${step}: ${command}`);
    error.ring = { step, command, result };
    throw error;
  }

  /** `home.json` under a kennel's `local/`, as the installed command wrote it. */
  record(dir) {
    return JSON.parse(readFileSync(join(this.localOf(dir), "home.json"), "utf8"));
  }

  /**
   * `sheep home local --faux --json` in a kennel: the report, the address
   * answering, and the two files that are the kennel's own — the config
   * with its token and the local marker, and `.dev.vars` mode 600 holding
   * that same token, the faux provider, and no key. Returns what the
   * caller compares between kennels.
   */
  async startHome(dir, step, expectState) {
    const command = `sheep home local --faux --json (in ${dir === this.blog ? "blog" : "pi"})`;
    const started = await this.sheep(["home", "local", "--faux", "--json"], { cwd: dir });
    let report;
    try {
      report = JSON.parse(started.stdout);
    } catch {
      this.fail(step, command, started);
    }
    // Registered the moment a pid is known, under the kennel the report names (the fallback `~/.sheep`, if the directory was
    // no kennel): a check that fails below still ends this home in `stopLocalHome`, whichever kennel it started under.
    if (typeof report?.pid === "number" && typeof report.home === "string") this.homes.set(typeof report.kennel === "string" ? dirname(report.kennel) : dir, { url: report.home, pid: report.pid });
    if (started.code !== 0 || report.state !== expectState || report.key !== "faux" || typeof report.pid !== "number") this.fail(step, command, started);
    const url = report.home;
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !(await answers(url))) this.fail(step, `curl ${url}/`, { ...started, stderr: `${started.stderr}\n${url} does not answer sheep`, code: 1 });
    // The report names the kennel it found, and it is this directory's.
    if (!this.samePath(report.kennel, this.kennel(dir))) this.fail(step, command, { ...started, stderr: `${started.stderr}\nthe report names kennel ${report.kennel}; expected ${this.kennel(dir)}` });
    // The config, in the kennel and nowhere else: the address, a token, and the local marker.
    const configPath = this.configOf(dir);
    if (!existsSync(configPath)) this.fail(step, `cat ${configPath}`, { stdout: "", stderr: "no config was written in the kennel", code: 1 });
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (config.home !== url || typeof config.token !== "string" || config.token.length < 32 || config.local !== true) {
      this.fail(step, `cat ${configPath}`, { stdout: JSON.stringify({ ...config, token: "…" }), stderr: `expected {home: ${url}, token, local: true}`, code: 1 });
    }
    // The secrets file: mode 600, the config's token and the provider in it, no key.
    const devVars = join(this.localOf(dir), ".dev.vars");
    const mode = statSync(devVars).mode & 0o777;
    if (mode !== 0o600) this.fail(step, `stat ${devVars}`, { stdout: mode.toString(8), stderr: "expected mode 600", code: 1 });
    const secrets = readFileSync(devVars, "utf8");
    if (!secrets.includes(`SHEEP_TOKEN=${config.token}\n`) || !secrets.includes("SHEEP_PROVIDER=faux\n") || secrets.includes("SHEEP_ANTHROPIC_API_KEY")) {
      this.fail(step, `cat ${devVars}`, { stdout: secrets.replace(/=.*/g, "=…"), stderr: "expected the config's token, the faux provider, and no key", code: 1 });
    }
    this.homes.set(dir, { url, pid: report.pid });
    return { url, report, token: config.token, port: report.port };
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

    // Journey 2 step 2, before the homes: the second dog's directory, which is in no git work tree, becomes a kennel with no .gitignore.
    const piSetup = await this.sheep(["setup", "--json"], { cwd: this.pi });
    let piReport;
    try {
      piReport = JSON.parse(piSetup.stdout);
    } catch {
      this.fail("k2.2", "sheep setup --json (in pi)", piSetup);
    }
    if (
      piSetup.code !== 0 ||
      piReport.cli?.state !== "on-path" ||
      piReport.kennel?.state !== "made" ||
      !this.samePath(piReport.kennel?.path, this.kennel(this.pi)) ||
      piReport.kennel?.gitignore?.state !== "not-git" ||
      piReport.kennel?.gitignore?.path !== null ||
      piReport.kennel?.tracked !== false ||
      piReport.home?.state !== "none" ||
      piReport.skill?.state !== "installed"
    ) {
      this.fail("k2.2", "sheep setup --json (in pi)", { ...piSetup, stderr: `${piSetup.stderr}\nexpected cli on-path, the kennel made, no .gitignore outside a git work tree, home none` });
    }
    if (existsSync(join(this.pi, ".gitignore"))) this.fail("k2.2", `ls -a ${this.pi}`, { stdout: readdirSync(this.pi).join("\n"), stderr: "a .gitignore was written outside a git work tree", code: 1 });
    this.ok("k2.2", "sheep setup --json (in pi)", `cli on-path; skill installed; kennel <pi>/.sheep made; no .gitignore (not a git work tree); home none`);

    // Step 2 / journey 1 step 1: the local home under blog's kennel, with the faux provider in place of a key.
    const startedAt = Date.now();
    const blog = await this.startHome(this.blog, "step 2", "started");
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
    const { url, report } = blog;
    this.token = blog.token;
    const devVars = join(this.localOf(this.blog), ".dev.vars");
    // The record: pid, port, and the stamp the install's manifest carries.
    const record = this.record(this.blog);
    if (record.pid !== report.pid || record.url !== url || JSON.stringify(record.stamp) !== JSON.stringify(stamp)) {
      this.fail("step 2", `cat ${join(this.localOf(this.blog), "home.json")}`, { stdout: JSON.stringify(record), stderr: `expected pid ${report.pid}, url ${url}, stamp ${JSON.stringify(stamp)}`, code: 1 });
    }
    // The tool: wrangler at the manifest's pin, under the ring's ~/.sheep/tools (the machine's, not the kennel's), and nowhere in the release's tree.
    const tools = join(this.home, ".sheep", "tools");
    const wranglerPkg = join(tools, "node_modules", "wrangler", "package.json");
    const wranglerVersion = existsSync(wranglerPkg) ? JSON.parse(readFileSync(wranglerPkg, "utf8")).version : undefined;
    if (wranglerVersion !== stamp.wrangler) this.fail("step 2", `cat ${wranglerPkg}`, { stdout: String(wranglerVersion), stderr: `expected wrangler ${stamp.wrangler} in ${tools}`, code: 1 });
    if (existsSync(join(this.pkg, "node_modules", "wrangler"))) this.fail("step 2", `ls ${join(this.pkg, "node_modules")}`, { stdout: "", stderr: "wrangler was installed into the release's tree", code: 1 });
    if (report.wrangler?.installed !== true) this.fail("step 2", "sheep home local --faux --json", { stdout: JSON.stringify(report.wrangler), stderr: "expected the first home to have fetched wrangler", code: 1 });
    // Nothing of the kennel is in HOME: the tools alone, which are the machine's.
    const dotSheep = readdirSync(join(this.home, ".sheep")).sort();
    if (JSON.stringify(dotSheep) !== JSON.stringify(["tools"])) this.fail("step 2", `ls ${join(this.home, ".sheep")}`, { stdout: dotSheep.join("\n"), stderr: "expected tools alone under HOME/.sheep: the config and the home are the kennel's", code: 1 });
    // ps: the daemon runs from the tools directory over the release's config with the secrets file's path, and no process's arguments carry the token.
    // Paths as the daemon saw them: it resolves its kennel from its own working directory, so on macOS its paths are realpaths under
    // /private/var where the ring's names say /var. Every comparison takes either form, and never realpaths a string that is not a path.
    const real = (path) => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    };
    const either = (line, path) => line.includes(path) || line.includes(real(path));
    const flagged = (line, flag, path) => line.includes(`${flag} ${path}`) || line.includes(`${flag} ${real(path)}`);
    const lines = psLines();
    const daemon = lines.find((line) => line.startsWith(`${report.pid} `));
    const pkgConfig = join(this.pkg, "home", "wrangler.jsonc");
    if (!daemon || !either(daemon, join(tools, "node_modules", "wrangler")) || !flagged(daemon, "--config", pkgConfig) || !flagged(daemon, "--env-file", devVars)) {
      this.fail("step 2", `ps -Ao pid=,args= | grep ^${report.pid}`, { stdout: daemon ?? "", stderr: "expected the ring's wrangler over the release's home/wrangler.jsonc with --env-file blog's .dev.vars", code: 1 });
    }
    const leaked = lines.filter((line) => line.includes(this.token));
    if (leaked.length > 0) this.fail("step 2", "ps -Ao pid=,args=", { stdout: leaked.join("\n"), stderr: "the token is in a process's arguments", code: 1 });
    // A second call reports the running home at the same address.
    const again = await this.sheep(["home", "local", "--faux", "--json"], { cwd: this.blog });
    let againReport;
    try {
      againReport = JSON.parse(again.stdout);
    } catch {
      this.fail("step 2", "sheep home local --faux --json (again)", again);
    }
    if (again.code !== 0 || againReport.state !== "running" || againReport.home !== url || againReport.pid !== report.pid) this.fail("step 2", "sheep home local --faux --json (again)", again);
    this.ok("step 2", "sheep home local --faux (in blog)", `${url}, pid ${report.pid}, ${seconds}s with wrangler ${stamp.wrangler} fetched into ~/.sheep/tools; <blog>/.sheep/config written; .dev.vars mode 600; again: running`);
    this.ok("step 2", "ps", `${daemon.slice(0, 96)}… --env-file ${devVars.replace(this.dir, "<ring>")}; ${lines.length} processes, none with the token in its arguments`);
    this.unchecked.push("journey 1 step 2: a key from ANTHROPIC_API_KEY held in .dev.vars, and a real model answering; the ring's homes ran the faux provider");
    this.unchecked.push("kennel journey 2 step 3: the warning said when `git ls-files .sheep` names something; the ring's blog never committed its kennel, and packages/cli/test/setup.test.ts drives that line from setup and from `sheep home`");

    // Step 3: a sheep is minted, the reply streams, and ls lists it; the home came from the kennel's config, nothing from the environment.
    const created = await this.sheep(["new", "--", "hello"], { cwd: this.blog });
    const id = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== `${FAUX_REPLY}\n` || !id) this.fail("step 3", "sheep new -- hello", created);
    const listed = await this.sheep(["ls"], { cwd: this.blog });
    if (listed.code !== 0 || !listed.stdout.split("\n").some((line) => line.startsWith(`${id}\t`))) this.fail("step 3", "sheep ls", listed);
    this.ok("step 3", "sheep new -- hello; sheep ls (in blog)", `${FAUX_REPLY}; session ${id} listed`);

    // Kennel journey 1 step 2: the second dog's home, in its own directory. A different port, a different token, and the tool already fetched.
    const pi = await this.startHome(this.pi, "k1.2", "started");
    if (pi.url === url) this.fail("k1.2", "sheep home local --faux --json (in pi)", { stdout: pi.url, stderr: `pi's home is at blog's address ${url}: two kennels must run two daemons`, code: 1 });
    if (pi.token === this.token) this.fail("k1.2", `cat ${this.configOf(this.pi)}`, { stdout: "(the token)", stderr: "pi's token is blog's: each kennel generates its own", code: 1 });
    if (pi.report.wrangler?.installed !== false || pi.report.wrangler?.version !== stamp.wrangler) {
      this.fail("k1.2", "sheep home local --faux --json (in pi)", { stdout: JSON.stringify(pi.report.wrangler), stderr: `expected wrangler ${stamp.wrangler} already there, installed false: the tools are the machine's`, code: 1 });
    }
    // Both daemons run, and neither token is in any process's arguments. From here the poll watches for both.
    const twoLines = psLines();
    const bothLeaked = twoLines.filter((line) => line.includes(this.token) || line.includes(pi.token));
    if (bothLeaked.length > 0) this.fail("k1.2", "ps -Ao pid=,args=", { stdout: bothLeaked.join("\n"), stderr: "a token is in a process's arguments", code: 1 });
    this.tokenWatch = watchPs([this.token, pi.token], 25);
    const stillDotSheep = readdirSync(join(this.home, ".sheep")).sort();
    if (JSON.stringify(stillDotSheep) !== JSON.stringify(["tools"])) this.fail("k1.2", `ls ${join(this.home, ".sheep")}`, { stdout: stillDotSheep.join("\n"), stderr: "the second home put something under HOME/.sheep", code: 1 });

    // A sheep in pi, and then each `sheep ls` lists exactly its own kennel's.
    const piCreated = await this.sheep(["new", "--", "hello"], { cwd: this.pi });
    const piId = /^session ([0-9a-f-]{36})\n/.exec(piCreated.stderr)?.[1];
    if (piCreated.code !== 0 || piCreated.stdout !== `${FAUX_REPLY}\n` || !piId) this.fail("k1.2", "sheep new -- hello (in pi)", piCreated);
    const ids = async (cwd, step) => {
      const result = await this.sheep(["ls", "--json"], { cwd });
      let rows;
      try {
        rows = JSON.parse(result.stdout);
      } catch {
        this.fail(step, `sheep ls --json (in ${cwd})`, result);
      }
      if (result.code !== 0 || !Array.isArray(rows)) this.fail(step, `sheep ls --json (in ${cwd})`, result);
      return rows.map((row) => row.id);
    };
    const inPi = await ids(this.pi, "k1.2");
    const inBlog = await ids(this.blog, "k1.2");
    if (JSON.stringify(inPi) !== JSON.stringify([piId])) this.fail("k1.2", `sheep ls --json (in pi)`, { stdout: inPi.join("\n"), stderr: `expected exactly ${piId}, the sheep minted from this kennel`, code: 1 });
    if (JSON.stringify(inBlog) !== JSON.stringify([id])) this.fail("k1.2", `sheep ls --json (in blog)`, { stdout: inBlog.join("\n"), stderr: `expected exactly ${id}, the sheep minted from this kennel`, code: 1 });
    this.ok("k1.2", "sheep home local --faux; sheep new; sheep ls (in pi)", `${pi.url} (blog: ${url}), a token of its own, wrangler ${stamp.wrangler} already there; pi lists ${piId} alone, blog lists ${id} alone`);

    // Journey 1 step 3: a working directory under blog with no kennel of its own finds blog's, as git status finds the repository.
    const deepLs = await ids(this.deep, "k1.3");
    if (JSON.stringify(deepLs) !== JSON.stringify([id])) this.fail("k1.3", `sheep ls --json (in blog/posts/2026)`, { stdout: deepLs.join("\n"), stderr: `expected blog's ${id}`, code: 1 });
    const deepHome = await this.sheep(["home", "--json"], { cwd: this.deep });
    let deepReport;
    try {
      deepReport = JSON.parse(deepHome.stdout);
    } catch {
      this.fail("k1.3", "sheep home --json (in blog/posts/2026)", deepHome);
    }
    // Kennel phase 1: a local home has no station's name; the field is there and null until a deploy mints one.
    if (deepHome.code !== 0 || deepReport.home !== url || deepReport.running !== true || !this.samePath(deepReport.kennel, this.kennel(this.blog)) || deepReport.name !== null) {
      this.fail("k1.3", "sheep home --json (in blog/posts/2026)", { ...deepHome, stderr: `${deepHome.stderr}\nexpected kennel ${this.kennel(this.blog)}, home ${url}, running, name null` });
    }
    const deepProse = await this.sheep(["home"], { cwd: this.deep });
    if (!deepProse.stdout.includes(this.kennelLine(this.blog).trim())) {
      this.fail("k1.3", "sheep home (in blog/posts/2026)", { ...deepProse, stderr: `${deepProse.stderr}\nexpected the prose to name blog's kennel` });
    }
    this.ok("k1.3", "sheep ls; sheep home (in blog/posts/2026)", `${id} listed; kennel <blog>/.sheep, home ${url}, running, name null`);

    // Journey 1 step 4: pi's dog stops its home; blog's is untouched, and its next `sheep ls` says nothing about pi.
    const piStopped = await this.sheep(["home", "stop"], { cwd: this.pi });
    if (piStopped.code !== 0 || piStopped.stdout !== `stopped the local home at ${pi.url}\n`) this.fail("k1.4", "sheep home stop (in pi)", piStopped);
    this.homes.delete(this.pi);
    if (await answers(pi.url)) this.fail("k1.4", `curl ${pi.url}/`, { stdout: "", stderr: "pi's home still answers after sheep home stop", code: 1 });
    if (!(await answers(url))) this.fail("k1.4", `curl ${url}/`, { stdout: "", stderr: "stopping pi's home stopped blog's", code: 1 });
    const afterStop = await ids(this.blog, "k1.4");
    if (JSON.stringify(afterStop) !== JSON.stringify([id])) this.fail("k1.4", "sheep ls --json (in blog)", { stdout: afterStop.join("\n"), stderr: `expected blog's ${id} alone, and nothing of pi's`, code: 1 });
    const piDown = await this.sheep(["home"], { cwd: this.pi });
    if (piDown.code !== 0 || piDown.stdout !== `home: ${pi.url} (local, stopped)\n${this.kennelLine(this.pi)}`) this.fail("k1.4", "sheep home (in pi)", { ...piDown, stderr: `${piDown.stderr}\nexpected "home: ${pi.url} (local, stopped)" and ${this.kennelLine(this.pi).trim()}` });
    this.ok("k1.4", "sheep home stop (in pi); sheep ls (in blog)", `pi's ${pi.url} stopped and says so; blog's ${url} still answers and lists ${id} alone`);

    // Journey 1 step 5: a terminal in neither directory falls back to ~/.sheep, which holds no home, and says which kennel that is.
    const outside = await this.sheep(["home", "--json"], { cwd: this.dir });
    let outsideReport;
    try {
      outsideReport = JSON.parse(outside.stdout);
    } catch {
      this.fail("k1.5", `sheep home --json (in ${this.dir})`, outside);
    }
    if (outside.code !== 0 || outsideReport.home !== null || !this.samePath(outsideReport.kennel, join(this.home, ".sheep"))) {
      this.fail("k1.5", `sheep home --json (outside both kennels)`, { ...outside, stderr: `${outside.stderr}\nexpected home null and kennel ${join(this.home, ".sheep")}, the fallback` });
    }
    this.ok("k1.5", "sheep home --json (outside both kennels)", `kennel ~/.sheep, the fallback; home none, and neither dog's home named`);

    // Journey 2 step 1, after the home ran: the token and the key are under .sheep, and git sees neither.
    const ignoreNow = readFileSync(join(this.blog, ".gitignore"), "utf8");
    const statusNow = this.git0(this.blog, "status", "--porcelain");
    const ignored = this.git0(this.blog, "status", "--porcelain", "--ignored");
    if (ignoreNow !== ".sheep/\n" || statusNow.includes(".sheep") || !ignored.includes("!! .sheep/")) {
      this.fail("k2.1", `git status --porcelain --ignored in ${this.blog}`, { stdout: `${statusNow}${ignored}`, stderr: 'expected .gitignore still one line, nothing under .sheep untracked, and "!! .sheep/" ignored', code: 1 });
    }
    this.ok("k2.1", "git status --porcelain [--ignored] (in blog, the home running)", `.gitignore one line; untracked: ${statusNow.trim().split("\n").join(" ")}; ignored: !! .sheep/, holding the config and .dev.vars`);

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
    const setupAgain = await this.sheep(["setup", "--json"], { cwd: this.blog });
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
      // Idempotent: the kennel is there, the entry is there, and no second line was added.
      second.kennel?.state === "present" &&
      second.kennel.gitignore?.state === "present" &&
      second.kennel.tracked === false &&
      second.home?.state === "local" &&
      second.home.home === url &&
      second.home.running === true &&
      second.home.pid === report.pid &&
      second.checkout === null &&
      second.next === "sheep --agent-help";
    if (!current) this.fail("step 5", "sheep setup --json (again)", { ...setupAgain, stderr: `${setupAgain.stderr}\nexpected cli on-path at ${bin}, skill current, doorway current, kennel present with its entry already there, home ${url} local and running under pid ${report.pid}, next "sheep --agent-help"` });
    if (readFileSync(join(this.blog, ".gitignore"), "utf8") !== ".sheep/\n") this.fail("step 5", `cat ${join(this.blog, ".gitignore")}`, { stdout: readFileSync(join(this.blog, ".gitignore"), "utf8"), stderr: "a second setup added a second line", code: 1 });
    this.ok("step 5", "sheep --agent-help; sheep setup --json (again)", `${shipped.split(/\s+/).length} words, the ref's dist/agent-guide.md; again: cli on-path, skill current, doorway current, kennel present and .gitignore unchanged, home local running, next "${second.next}"`);

    // Step 6: the home stops; the next command starts it and says so; the sheep is still there; `sheep home` reports each state.
    const stopped = await this.sheep(["home", "stop"], { cwd: this.blog });
    if (stopped.code !== 0 || stopped.stdout !== `stopped the local home at ${url}\n`) this.fail("step 6", "sheep home stop", stopped);
    if (await answers(url)) this.fail("step 6", `curl ${url}/`, { stdout: "", stderr: "the home still answers after sheep home stop", code: 1 });
    if (this.record(this.blog).pid !== null) this.fail("step 6", `cat ${join(this.localOf(this.blog), "home.json")}`, { stdout: JSON.stringify(this.record(this.blog)), stderr: "the pid was not cleared", code: 1 });
    const down = await this.sheep(["home"], { cwd: this.blog });
    if (down.code !== 0 || down.stdout !== `home: ${url} (local, stopped)\n${this.kennelLine(this.blog)}`) this.fail("step 6", "sheep home", { ...down, stderr: `${down.stderr}\nexpected "home: ${url} (local, stopped)" and ${this.kennelLine(this.blog).trim()}` });
    const morning = await this.sheep(["ls"], { cwd: this.blog });
    if (morning.code !== 0 || !morning.stderr.includes("sheep: the local home is not running; starting it\n") || !morning.stdout.split("\n").some((line) => line.startsWith(`${id}\t`))) {
      this.fail("step 6", "sheep ls (the home stopped)", morning);
    }
    const up = await this.sheep(["home", "--json"], { cwd: this.blog });
    let upReport;
    try {
      upReport = JSON.parse(up.stdout);
    } catch {
      this.fail("step 6", "sheep home --json", up);
    }
    if (up.code !== 0 || upReport.running !== true || upReport.home !== url || typeof upReport.pid !== "number" || upReport.pid === report.pid || JSON.stringify(upReport.stamp) !== JSON.stringify(stamp)) {
      this.fail("step 6", "sheep home --json", { ...up, stderr: `${up.stderr}\nexpected running at ${url} under a new pid with stamp ${JSON.stringify(stamp)}` });
    }
    // Station phase 0: the two stamps. The home's, from `GET /home`, is what scripts/bundle.mjs defined into the release's
    // Worker; the command's is the manifest's. Both must be the release's commit and time: a checkout-built Worker in an
    // install is a release that did not carry its stamp, and skew between the two is a warning the ring must not see.
    const build = { commit: stamp.commit, builtAt: stamp.builtAt };
    if (JSON.stringify(upReport.build?.home) !== JSON.stringify(build) || JSON.stringify(upReport.build?.cli) !== JSON.stringify(build)) {
      this.fail("step 6", "sheep home --json", { ...up, stderr: `${up.stderr}\nexpected build.home and build.cli both ${JSON.stringify(build)}; got ${JSON.stringify(upReport.build)}` });
    }
    if (up.stderr !== "") this.fail("step 6", "sheep home --json", { ...up, stderr: `${up.stderr}\nexpected nothing on stderr: the two stamps are equal, so no skew line` });
    this.homes.set(this.blog, { url, pid: upReport.pid });
    this.ok("step 6", "sheep home stop; sheep home; sheep ls; sheep home --json", `stopped; "(local, stopped)"; started on demand, pid ${report.pid} → ${upReport.pid}, ${id} listed; stamp ${upReport.stamp.commit} (${upReport.stamp.builtAt}), wrangler ${upReport.stamp.wrangler}; build.home = build.cli = ${build.commit} (${build.builtAt})`);

    // Step 7, first half: the export is a SQLite file with the tables the command reports.
    const file = join(this.dir, `${id}.sqlite`);
    const exported = await this.sheep(["export", id, file], { cwd: this.blog });
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

    // The whole walk: neither kennel's token was in any process's arguments in any sample.
    this.tokenWatch.stop();
    const leak = this.tokenWatch.line();
    if (leak) this.fail("walk", "ps -Ao pid=,args= (polled)", { stdout: leak, stderr: "a token was seen in a process's arguments during the walk", code: 1 });
    this.ok("walk", "ps (polled every 25 ms from k1.2)", `${this.tokenWatch.samples()} samples, neither kennel's token in any process's arguments`);
    // What the ring's HOME holds after everything: the tools, and nothing else. The kennels hold the rest.
    const homeAfter = existsSync(join(this.home, ".sheep")) ? readdirSync(join(this.home, ".sheep")).sort() : [];
    if (JSON.stringify(homeAfter) !== JSON.stringify(["tools"])) {
      this.fail("walk", `ls -a ${join(this.home, ".sheep")}`, { stdout: homeAfter.join("\n"), stderr: "expected tools alone under the ring's HOME/.sheep", code: 1 });
    }
    this.ok("walk", `ls ~/.sheep`, `tools alone (wrangler ${stamp.wrangler}, fetched once for both kennels); the configs and both homes are in <blog>/.sheep and <pi>/.sheep`);
  }

  /** Every home the walk started, one per kennel: stopped with the installed command, unless kept; whatever is left is signalled. */
  async stopLocalHome() {
    this.tokenWatch?.stop();
    if (this.keep) return;
    for (const [dir, home] of [...this.homes]) {
      const stopped = await this.sheep(["home", "stop"], { cwd: dir }).catch(() => undefined);
      if (stopped?.code !== 0) console.error(`hermetic: sheep home stop in ${dir} exited ${stopped?.code ?? "?"}: ${(stopped?.stderr ?? "").trim()}`);
      let pid = home.pid;
      try {
        pid = this.record(dir).pid ?? pid;
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
      this.homes.delete(dir);
    }
  }

  report(failure, ringName = "package") {
    console.log("");
    if (failure?.ring) {
      const { step, command, result } = failure.ring;
      console.log(`FAIL  ${step}: ${command} (exit ${result.code})`);
      if (result.stdout?.trim()) console.log(`--- stdout ---\n${result.stdout.trimEnd()}`);
      if (result.stderr?.trim()) console.log(`--- stderr ---\n${result.stderr.trimEnd()}`);
    } else if (failure) {
      console.log(`FAIL  ${failure.message}`);
    }
    console.log(`not checked by the ${ringName} ring:`);
    for (const item of [
      ...this.unchecked,
      "that this machine's Node is the user's: the ring ran the node and npm on PATH here (the machine ring runs this walk in containers from node:22-slim and node:24-slim)",
      "that wrangler's fetch works on a cold network: ~/.sheep/tools came through the ring's own npm cache, from the registry the first time",
    ]) {
      console.log(`  - ${item}`);
    }
    if (this.keep) {
      console.log(`kept: ${this.dir}`);
      const blogHome = this.homes.get(this.blog);
      if (blogHome) {
        console.log(`  blog's local home is still running at ${blogHome.url} (pid ${blogHome.pid}); journey 5's file runs against it with`);
        console.log(`    SHEEP_TEST_HOME=${blogHome.url} SHEEP_TEST_TOKEN=${this.token} pnpm --filter @sheep/cli exec vitest --run test/journey5.test.ts`);
        console.log(`  and stops with`);
        console.log(`    (cd ${this.blog} && HOME=${this.home} ${join(this.prefix, "bin", "sheep")} home stop)`);
      }
      for (const [dir, home] of this.homes) {
        if (dir !== this.blog) console.log(`  ${dir}'s home is still running at ${home.url} (pid ${home.pid}); (cd ${dir} && HOME=${this.home} ${join(this.prefix, "bin", "sheep")} home stop)`);
      }
    }
  }

  cleanup() {
    if (this.keep) return;
    rmSync(this.dir, { recursive: true, force: true });
  }
}

/** Streams a command's output line by line under an indent; resolves with the exit code. `onLine` sees each line as it arrives; `input` goes to stdin, which is otherwise ignored. */
function runIndented(command, args, options, indent = "    ", onLine = undefined) {
  const { input, ...rest } = options ?? {};
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], ...rest });
    if (input !== undefined) child.stdin.end(input);
    let pending = "";
    const emit = (chunk) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) {
        console.log(indent + line);
        onLine?.(line);
      }
    };
    child.stdout.on("data", emit);
    child.stderr.on("data", emit);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (pending) {
        console.log(indent + pending);
        onLine?.(pending);
      }
      resolveRun(code ?? (signal ? 1 : 0));
    });
  });
}

/** The image tag the machine ring builds for a base image: `sheep-ring:node-22-slim`; the dog ring's is `sheep-ring:dog-node-24-slim`. */
const ringTag = (image, prefix = "") => `sheep-ring:${prefix}${image.replace(/[^A-Za-z0-9_.-]+/g, "-")}`;

/**
 * What a container is, checked before the walk: the image's node, npm, and
 * git, and none of what journey 3 step 2 rules out. The dog ring adds its
 * own lines. One shell command; a nonzero exit names the first thing wrong.
 */
function probeScript(extra = []) {
  return [
    `printf 'node %s, npm %s, git %s, %s\\n' "$(node --version)" "$(npm --version)" "$(git --version | cut -d' ' -f3)" "$(uname -m)"`,
    `test ! -e /var/run/docker.sock || { echo 'a Docker socket is in the container'; exit 1; }`,
    `for tool in pnpm wrangler workerd sheep; do ! command -v "$tool" >/dev/null || { echo "$tool is in the image"; exit 1; }; done`,
    `for f in "$HOME/.gitconfig" "$HOME/.npmrc" "$HOME/.sheep" "$HOME/.npm" "$HOME/.wrangler" "$HOME/.config/.wrangler" "$HOME/.claude" "$HOME/.claude.json"; do test ! -e "$f" || { echo "$f is in the image"; exit 1; }; done`,
    // `--init` mounts Docker's own init at /usr/sbin/docker-init: the one process that reaps a detached daemon, which a user's machine has and a container does not.
    `awk '$5 !~ /^\\/(proc|sys|dev|etc\\/(resolv.conf|hostname|hosts)|usr\\/sbin\\/docker-init)(\\/|$)/ && $5 != "/" {print "mounted: " $5; bad=1} END {exit bad}' /proc/self/mountinfo`,
    `echo "no docker socket; no pnpm, wrangler, workerd, or sheep; no git config, npmrc, .sheep, .npm, or .claude; nothing mounted but /, /proc, /sys, /dev, the DNS files, and docker-init"`,
    ...extra,
  ].join(" && ");
}

/** Builds one ring image from the context, streaming nothing; returns the seconds it took, or throws with docker's output. */
async function buildImage(context, image, tag, buildArgs) {
  const started = Date.now();
  const args = ["build", "--build-arg", `NODE_IMAGE=${image}`, ...buildArgs.flatMap((arg) => ["--build-arg", arg]), "--tag", tag, "--file", join(context, "Dockerfile"), context];
  const build = await run("docker", args, { env: { ...process.env, DOCKER_BUILDKIT: "1" } });
  if (build.code !== 0) throw new Error(`docker build failed (exit ${build.code}):\n${build.stdout}${build.stderr}`.trimEnd());
  return ((Date.now() - started) / 1000).toFixed(0);
}

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
      let buildSeconds;
      try {
        buildSeconds = await buildImage(context, image, tag, []);
      } catch (error) {
        console.log(`    ${error.message}`);
        failures.push(`${image}: docker build failed`);
        break;
      }
      const probed = await run("docker", ["run", "--rm", "--init", tag, "sh", "-c", probeScript()]);
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
      "that a coding agent would find its way: none was in the container (the dog ring puts Claude Code in it and gives it the sentence)",
    );
  } finally {
    if (keep) console.log(`\nkept: ${context}`);
    else rmSync(context, { recursive: true, force: true });
  }
  console.log("\nnot checked by the machine ring (the package ring's own list is above, per image):");
  for (const item of unchecked) console.log(`  - ${item}`);
  // `map(ringTag)` would hand the index in as the tag's prefix, and name two images that do not exist.
  console.log(`images kept: ${images.map((image) => ringTag(image)).join(", ")} (docker image rm to drop them)`);
  if (failures.length > 0) {
    console.log(`\nmachine ring: FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`\nmachine ring: ok (${images.length} image${images.length === 1 ? "" : "s"} held)`);
}

/** An argument as a person would paste it into a shell. */
const quote = (arg) => (/^[A-Za-z0-9_/.,:=+@%#-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`);

/** One line from the terminal. */
function ask(question) {
  return new Promise((resolveAsk) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolveAsk(answer.trim());
    });
  });
}

/**
 * The dog ring, outside: the key and the yes, then the build context, the
 * image with Claude Code in it, the probe, and one container running this
 * script's other half with the key as an environment variable. The
 * container's output is the report; the ring ends by naming what it did
 * not check.
 */
async function dogRing({ ref, repo, spec, commit, images, keep, yes, dryRun, budget, timeout }) {
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8" });
  if (docker.error || docker.status !== 0) {
    const why = docker.error ? docker.error.message : (docker.stderr || docker.stdout || "").trim();
    console.error(`hermetic: the dog ring needs Docker on this machine, and there is none that answers (docker version: ${why}); nothing was checked`);
    process.exit(2);
  }
  const engine = docker.stdout.trim();
  const image = images[0];
  let sha;
  let stamp;
  if (spec === undefined) {
    const git = gitIn(repo);
    try {
      sha = git("rev-parse", "--verify", `${ref}^{commit}`);
    } catch (error) {
      usage(`${ref}: ${error.message}`);
    }
    stamp = JSON.parse(git("show", `${sha}:package.json`)).sheep;
    if (typeof stamp?.commit !== "string") usage(`${ref} carries no build stamp in its package.json; a release does`);
  }
  const expect = spec === undefined ? stamp.commit : commit;
  const source = spec === undefined ? `${ref} = ${sha} (a build of ${stamp.commit}), reached inside as ${INSTALL_SPEC} through /src.git` : `${spec} from GitHub${commit ? `, expected to be a build of ${commit}` : ""}`;
  console.log(`dog ring: ${source}; docker ${engine}; image ${image}; dog ${AGENT_PACKAGE} at its current version${dryRun ? "; dry run: stops before the prompt" : ""}`);

  // The key and the yes, before anything is built or pulled.
  if (!dryRun) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("hermetic: the dog ring needs ANTHROPIC_API_KEY in its environment: Claude Code's key, and the one the dog's home will hold; export it and run again, or --dry-run, which needs none");
      process.exit(2);
    }
    console.log(
      [
        "",
        "the dog ring spends the shepherd's tokens.",
        `  one Claude Code session in print mode on its default model with ${DOG_TOOLS}, walking journey 1 in a dozen or two turns: on the order of a dollar or two,`,
        `  and never more than $${budget} (--max-budget-usd; --budget changes it). The key goes to the container as an environment variable and to nothing else of this ring;`,
        `  ${image} is pulled if it is not here, and the container reaches npm, GitHub, and Anthropic over this machine's network.`,
      ].join("\n"),
    );
    if (yes) console.log("  --yes: not asking");
    else {
      if (!process.stdin.isTTY) {
        console.error("hermetic: the dog ring asks before it spends, and stdin is not a terminal; pass --yes to answer ahead. Nothing was built or spent");
        process.exit(2);
      }
      const answer = await ask("run it? [y/N] ");
      if (!/^y(es)?$/i.test(answer)) {
        console.error("hermetic: not run; nothing was built or spent");
        process.exit(2);
      }
    }
  }

  // The build context: the ref as refs/heads/release of a bare repository (an empty directory for the spec, which needs none), this script, and the Dockerfile.
  const context = mkdtempSync(join(tmpdir(), "sheep-dog-"));
  const bare = join(context, "src.git");
  const tag = ringTag(image, "dog-");
  const unchecked = [];
  let failure;
  let claudeVersion = "?";
  try {
    if (spec === undefined) {
      gitIn(context)("init", "--quiet", "--bare", "src.git");
      gitIn(repo)("push", "--quiet", bare, `${sha}:refs/heads/release`);
      gitIn(bare)("symbolic-ref", "HEAD", "refs/heads/release");
    } else mkdirSync(bare);
    copyFileSync(fileURLToPath(import.meta.url), join(context, "hermetic.mjs"));
    copyFileSync(join(root, "scripts", "hermetic", "Dockerfile"), join(context, "Dockerfile"));
    console.log(`context: ${context}: src.git (${spec === undefined ? `${spawnSync("du", ["-sh", bare], { encoding: "utf8" }).stdout.split("\t")[0]}, the ref as refs/heads/release` : "empty; the spec needs no repository"}), hermetic.mjs, Dockerfile`);

    console.log(`\n${image} + ${AGENT_PACKAGE}:`);
    const buildSeconds = await buildImage(context, image, tag, [`AGENT=${AGENT_PACKAGE}`]);
    console.log(`  built ${tag} in ${buildSeconds}s`);
    const probed = await run("docker", ["run", "--rm", "--init", tag, "sh", "-c", probeScript([`printf 'claude %s at %s, run as %s\\n' "$(claude --version | cut -d' ' -f1)" "$(command -v claude)" "$(id -un)"`])]);
    if (probed.code !== 0) throw new Error(`the container is not bare (exit ${probed.code}):\n${probed.stdout}${probed.stderr}`.trimEnd());
    for (const line of probed.stdout.trim().split("\n")) console.log(`  ${line}`);
    claudeVersion = /^claude (\S+)/m.exec(probed.stdout)?.[1] ?? "?";

    // The container: this script's other half, the key as a variable docker reads from this process's environment, never an argument.
    const name = `sheep-dog-${process.pid}`;
    const inside = ["node", "/ring/hermetic.mjs", "--ring", "dog", "--inside", "--budget", String(budget), ...(spec === undefined ? ["--redirect"] : []), ...(expect ? ["--expect", expect] : []), ...(dryRun ? ["--dry-run"] : [])];
    const runArgs = ["run", "--rm", "--init", "--name", name, ...(dryRun ? [] : ["-e", "ANTHROPIC_API_KEY"]), tag, ...inside];
    console.log(`\n  docker ${runArgs.join(" ")}`);
    let killed;
    const kill = (why) => {
      killed = why;
      spawnSync("docker", ["kill", name], { stdio: "ignore" });
    };
    const onSignal = () => kill("interrupted");
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    const timer = setTimeout(() => kill(`${timeout} minutes passed (--timeout)`), timeout * 60_000);
    const started = Date.now();
    let code;
    try {
      code = await runIndented("docker", runArgs, {}, "  ");
    } finally {
      clearTimeout(timer);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (killed) throw new Error(`the container was killed after ${seconds}s: ${killed}`);
    if (code !== 0) throw new Error(`the container exited ${code} after ${seconds}s; its output is above`);
    console.log(`\n${image}: ok (build ${buildSeconds}s, container ${seconds}s)`);
  } catch (error) {
    failure = error;
  } finally {
    if (keep) console.log(`\nkept: ${context}`);
    else rmSync(context, { recursive: true, force: true });
  }
  unchecked.push(
    `that any dog but Claude Code ${claudeVersion} would find its way: --agent ${DOG_AGENT} is the only value (pi is the second dog, deliberately open)`,
    `that a second image holds: ${image} alone (the machine ring walks node:22-slim and node:24-slim)`,
    `that a person typed the sentence and answered the dog: the prompt went in print mode with --allowedTools ${DOG_TOOLS} and --permission-prompts none, so nothing could ask and anything that would was denied and reported`,
    "that the dog asked for the key: ANTHROPIC_API_KEY was in the container's environment from the start, so journey 1 step 2's ask was met ahead",
    "that a user without root can do it: the container ran as root, the image's default; Claude Code refuses --dangerously-skip-permissions as root, so the dog's tools came by --allowedTools",
    "that the skill the dog read is the ref's: npx skills add clones main of github.com/dglazkov/sheep, as it does for a user; --skill sheep names the one the root SKILL.md is, which a bare `skills add` finds and stops at (the repository's .claude/skills are its own workflow, and never offered)",
    spec === undefined
      ? `that github.com serves ${INSTALL_SPEC}: the container's git was told github.com/dglazkov/sheep is /src.git, the ref exported as refs/heads/release (the ring given the spec installs from GitHub)`
      : `that the release commit has ${expect ?? "a known commit"} as a parent: no repository to read; \`git log release\` answers it${expect ? "" : "; with no --commit the stamp was printed, not checked"}`,
    "that the dog's network is a user's: Claude Code, npm, GitHub, and the registry were reached over this machine's network",
  );
  if (dryRun) unchecked.push("everything from the prompt on: --dry-run stopped before it, and no key was in the container");
  console.log("\nnot checked by the dog ring:");
  for (const item of unchecked) console.log(`  - ${item}`);
  console.log(`image kept: ${tag} (docker image rm to drop it)`);
  if (failure) {
    console.log(`\ndog ring: FAILED: ${failure.message}`);
    process.exit(1);
  }
  console.log(`\ndog ring: ${dryRun ? "dry run ok (stopped before the prompt)" : "ok"}`);
}

/** The transcript, rendered from Claude Code's stream-json as it arrives: what the dog said, each tool call, the first lines of each result, and the result event kept. */
class Transcript {
  constructor(print) {
    this.print = print;
    this.result = undefined;
    this.tools = 0;
  }

  line(text) {
    if (!text.trim()) return;
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      this.print(`  ? ${text.slice(0, 200)}`);
      return;
    }
    this.event(event);
  }

  event(event) {
    const type = event.type;
    if (type === "system" && event.subtype === "init") {
      const skills = [...(event.skills ?? []), ...(event.slash_commands ?? [])].map(String);
      this.print(`  init: claude ${event.claude_code_version ?? "?"}, model ${event.model}, ${(event.tools ?? []).length} tools, permission mode ${event.permissionMode}, the sheep skill ${skills.some((skill) => skill.includes("sheep")) ? "listed" : "not listed"}`);
    } else if (type === "assistant") {
      for (const block of event.message?.content ?? []) {
        if (block.type === "text" && block.text.trim()) this.print(`  dog: ${block.text.trim().split("\n").join("\n       ")}`);
        else if (block.type === "tool_use") {
          this.tools++;
          this.print(`  ${block.name}: ${Transcript.call(block)}`);
        }
      }
    } else if (type === "user") {
      for (const block of event.message?.content ?? []) {
        if (block.type !== "tool_result") continue;
        const text = typeof block.content === "string" ? block.content : (block.content ?? []).map((part) => part.text ?? "").join("\n");
        const lines = text.trimEnd().split("\n");
        const shown = lines.slice(0, 12).map((line) => (line.length > 200 ? `${line.slice(0, 200)}…` : line));
        this.print(`    ${block.is_error ? "error" : "→"} ${shown.join("\n    | ")}${lines.length > 12 ? `\n    … ${lines.length - 12} more lines` : ""}`);
      }
    } else if (type === "result") this.result = event;
  }

  static call(block) {
    const input = block.input ?? {};
    if (block.name === "Bash") return `$ ${input.command}${input.description ? `  # ${input.description}` : ""}`;
    if (typeof input.file_path === "string") return input.file_path;
    return JSON.stringify(input).slice(0, 300);
  }
}

/**
 * The dog ring, inside the container: the skill, the redirect, the exact
 * command, the run rendered as a transcript, and the assertions after it,
 * all in one HOME. Prints nothing that holds the key.
 */
async function dogInside({ dryRun, redirect, expect, budget }) {
  if (root !== "/" || !existsSync("/ring/hermetic.mjs") || !existsSync("/.dockerenv")) {
    console.error("hermetic: --inside is the container's half of the dog ring; run pnpm hermetic --ring dog");
    process.exit(2);
  }
  const env = process.env;
  const key = env.ANTHROPIC_API_KEY;
  const print = (text) => console.log(key ? text.split(key).join("<ANTHROPIC_API_KEY>") : text);
  const home = homedir();
  const work = join(home, "work");
  const tilde = (path) => path.replace(home, "~");
  const ok = (step, command, note) => print(`ok    ${step.padEnd(8)} ${command}${note ? `  → ${note}` : ""}`);
  const fail = (step, command, result) => {
    print(`\nFAIL  ${step}: ${command} (exit ${result.code})`);
    if (result.stdout?.trim()) print(`--- stdout ---\n${result.stdout.trimEnd()}`);
    if (result.stderr?.trim()) print(`--- stderr ---\n${result.stderr.trimEnd()}`);
    process.exit(1);
  };

  // Before the dog: no sheep, no ~/.sheep, no working directory.
  const before = spawnSync("sh", ["-c", "command -v sheep"], { encoding: "utf8" }).stdout.trim();
  if (before || existsSync(join(home, ".sheep")) || existsSync(work)) fail("before", `command -v sheep; ls ${tilde(join(home, ".sheep"))} ${tilde(work)}`, { stdout: before, stderr: "sheep is in the container before the dog", code: 1 });
  mkdirSync(work);
  ok("before", `command -v sheep; ls ${tilde(join(home, ".sheep"))}`, `nothing; ${tilde(work)} made, empty`);

  // The skill, from main on GitHub, as a user's would come; before the redirect, which is npm's.
  const skillStarted = Date.now();
  const added = await run(SKILLS_ADD[0], SKILLS_ADD.slice(1), { cwd: work, env });
  const skillSeconds = ((Date.now() - skillStarted) / 1000).toFixed(0);
  const skillDir = join(work, ".claude", "skills", "sheep");
  const skillFile = join(skillDir, "SKILL.md");
  if (added.code !== 0 || !existsSync(skillFile)) fail("skill", SKILLS_ADD.join(" "), { ...added, stderr: `${added.stderr}\nexpected ${skillFile}` });
  const skillText = readFileSync(skillFile, "utf8");
  let versus = "";
  if (redirect) {
    const refs = spawnSync("git", ["--git-dir", "/src.git", "show", "release:SKILL.md"], { encoding: "utf8" }).stdout;
    versus = skillText.trim() === refs.trim() ? "; the same text as the ref's SKILL.md" : "; not the ref's text (main's, from GitHub)";
  }
  ok("skill", SKILLS_ADD.join(" "), `${skillSeconds}s; ${tilde(skillFile)} (${lstatSync(skillDir).isSymbolicLink() ? "a link" : "a real directory, copied"}, ${skillText.length} bytes)${versus}; in ${tilde(work)}: ${readdirSync(work).sort().join(", ")}`);

  // The redirect: the string the dog types reaches /src.git, where the ref is refs/heads/release.
  if (redirect) {
    GITHUB_URLS.forEach((url, index) => gitIn(home)("config", "--global", ...(index === 0 ? [] : ["--add"]), "url.file:///src.git.insteadOf", url));
    const listed = spawnSync("git", ["ls-remote", GITHUB_URLS[0], "refs/heads/release"], { encoding: "utf8" });
    const sha = (listed.stdout || "").split("\t")[0];
    if (listed.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) fail("redirect", `git ls-remote ${GITHUB_URLS[0]} refs/heads/release`, { stdout: listed.stdout, stderr: listed.stderr, code: listed.status ?? 1 });
    ok("redirect", `git config --global url.file:///src.git.insteadOf ${GITHUB_URLS[0]} (and ${GITHUB_URLS.length - 1} more forms)`, `git ls-remote ${GITHUB_URLS[0]} refs/heads/release → ${sha.slice(0, 7)}`);
  }

  // The command, exactly; the sentence is journey 1's and nothing else is said.
  const claudeArgs = ["-p", SENTENCE, "--allowedTools", DOG_TOOLS, "--permission-prompts", "none", "--max-budget-usd", String(budget), "--output-format", "stream-json", "--verbose"];
  print(`\ndog: cd ${work} && claude ${claudeArgs.map(quote).join(" ")}`);
  print(`     stdin /dev/null; ANTHROPIC_API_KEY ${key ? "in" : "not in"} the environment; the skill at ${tilde(skillDir)}`);
  if (dryRun) {
    print("dry run: stopping before the prompt");
    return;
  }
  if (!key) fail("dog", "claude -p …", { stdout: "", stderr: "ANTHROPIC_API_KEY is not in the container's environment", code: 2 });

  const transcript = new Transcript(print);
  const started = Date.now();
  print("");
  const dog = await new Promise((resolveRun, reject) => {
    const child = spawn("claude", claudeArgs, { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
    let pending = "";
    const err = [];
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) transcript.line(line);
    });
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (pending) transcript.line(pending);
      resolveRun({ code: code ?? (signal ? 1 : 0), stderr: Buffer.concat(err).toString("utf8") });
    });
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const result = transcript.result;
  if (dog.stderr.trim()) print(`  stderr: ${dog.stderr.trim().split("\n").slice(0, 20).join("\n  stderr: ")}`);
  const denials = result?.permission_denials ?? [];
  const summary = result
    ? `${result.subtype}${result.is_error ? " (error)" : ""}, ${result.num_turns} turns, $${Number(result.total_cost_usd ?? 0).toFixed(2)}, ${transcript.tools} tool calls, ${denials.length} denials, model ${Object.keys(result.modelUsage ?? {}).join("+") || "?"}`
    : "no result event";
  print(`\ndog: exit ${dog.code} after ${seconds}s; ${summary}`);
  for (const denial of denials) print(`  denied: ${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {}).slice(0, 200)}`);
  if (result?.result) print(`\nthe dog's report:\n  ${String(result.result).trim().split("\n").join("\n  ")}\n`);
  const dogFailed = dog.code !== 0 || result === undefined || result.is_error === true;

  // Afterwards, in the same HOME: the ref's build on PATH, a sheep, the local home answering with the key held, and a stop that ends.
  const sheep = (args) => run("sheep", args, { cwd: work, env });
  const version = await sheep(["--version"]);
  const stampCommit = /^sheep ([0-9a-f]+) \(/.exec(version.stdout)?.[1];
  if (version.code !== 0 || !stampCommit || version.stderr !== "") fail("after", "sheep --version", version);
  if (expect && !expect.startsWith(stampCommit)) fail("after", "sheep --version", { ...version, stderr: `expected a build of ${expect}` });
  ok("after", "sheep --version", `${version.stdout.trim()}${expect ? `, a build of ${expect}` : ""}; at ${spawnSync("sh", ["-c", "command -v sheep"], { encoding: "utf8" }).stdout.trim()}`);
  const listed = await sheep(["ls", "--json"]);
  let sessions;
  try {
    sessions = JSON.parse(listed.stdout);
  } catch {
    fail("after", "sheep ls --json", listed);
  }
  if (listed.code !== 0 || !Array.isArray(sessions) || sessions.length === 0) fail("after", "sheep ls --json", { ...listed, stderr: `${listed.stderr}\nexpected at least one sheep` });
  ok("after", "sheep ls --json", `${sessions.length} sheep: ${sessions.map((session) => `${session.id} (${session.state ?? "?"}${session.name ? `, ${session.name}` : ""})`).join("; ")}${listed.stderr.trim() ? `; stderr: ${listed.stderr.trim()}` : ""}`);
  const homed = await sheep(["home", "--json"]);
  let report;
  try {
    report = JSON.parse(homed.stdout);
  } catch {
    fail("after", "sheep home --json", homed);
  }
  if (homed.code !== 0 || report.local !== true || report.running !== true || !/^http:\/\/127\.0\.0\.1:\d+$/.test(report.home) || typeof report.pid !== "number") fail("after", "sheep home --json", { ...homed, stderr: `${homed.stderr}\nexpected the local home running` });
  if (expect && !expect.startsWith(report.stamp?.commit ?? "")) fail("after", "sheep home --json", { ...homed, stderr: `the home's stamp is ${report.stamp?.commit}; expected a build of ${expect}` });
  // The secrets are the kennel's, wherever the dog made one: the report names it, so nothing here guesses at ~/.sheep.
  const kennel = typeof report.kennel === "string" ? report.kennel : join(home, ".sheep");
  const devVars = join(kennel, "local", ".dev.vars");
  const names = existsSync(devVars) ? readFileSync(devVars, "utf8").split("\n").map((line) => line.split("=")[0].trim()).filter(Boolean) : [];
  const mode = existsSync(devVars) ? statSync(devVars).mode & 0o777 : undefined;
  if (!names.includes("SHEEP_ANTHROPIC_API_KEY") || names.includes("SHEEP_PROVIDER") || mode !== 0o600) fail("after", `stat ${tilde(devVars)}`, { stdout: `${names.join(", ")}; mode ${mode?.toString(8)}`, stderr: "expected SHEEP_ANTHROPIC_API_KEY held, no SHEEP_PROVIDER, mode 600: the key from the environment, a real model", code: 1 });
  ok("after", "sheep home --json", `${report.home} running, pid ${report.pid}, stamp ${report.stamp?.commit}; kennel ${tilde(kennel)}; ${tilde(devVars)} mode ${mode.toString(8)} holds ${names.join(", ")}`);
  const stopStarted = Date.now();
  const stopped = await sheep(["home", "stop"]);
  const stopSeconds = ((Date.now() - stopStarted) / 1000).toFixed(1);
  if (stopped.code !== 0 || stopped.stdout !== `stopped the local home at ${report.home}\n`) fail("after", "sheep home stop", stopped);
  ok("after", "sheep home stop", `${stopped.stdout.trim()} in ${stopSeconds}s${stopped.stderr.trim() ? `; stderr: ${stopped.stderr.trim()}` : ""}`);
  const machineSheep = existsSync(join(home, ".sheep")) ? readdirSync(join(home, ".sheep")).sort().join(", ") : "(none)";
  print(`after: ${tilde(work)}: ${readdirSync(work).sort().join(", ")}; ${tilde(join(home, ".sheep"))}: ${machineSheep}; the kennel ${tilde(kennel)}: ${existsSync(kennel) ? readdirSync(kennel).sort().join(", ") : "(none)"}`);
  if (dogFailed) {
    print(`\nFAIL  dog: claude exited ${dog.code}${result ? `, ${result.subtype}${result.is_error ? ", is_error" : ""}` : ", no result event"}; the assertions after it held`);
    process.exit(1);
  }
  print("\ninside: ok");
}

/* The account ring (station phase 1). */

const PLAN_PRICE = "5 USD a month";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

/** The account API, for the ring's own reading: the token in a header, never an argument; every answer's errors quoted. */
function accountApi(token) {
  const call = async (method, path, body) => {
    const response = await fetch(`${CLOUDFLARE_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const envelope = await response.json();
    if (!envelope.success) throw new Error(`${method} ${path}: ${(envelope.errors ?? []).map((error) => `${error.message} (code ${error.code})`).join("; ") || `${response.status}`}`);
    return envelope;
  };
  return {
    async account() {
      const accounts = (await call("GET", "/accounts?per_page=50")).result.map((account) => ({ id: account.id, name: account.name }));
      if (accounts.length === 0) throw new Error("CLOUDFLARE_API_TOKEN reaches no account");
      const wanted = process.env.CLOUDFLARE_ACCOUNT_ID;
      const chosen = accounts.length === 1 ? accounts[0] : accounts.find((account) => account.id === wanted);
      if (chosen === undefined) throw new Error(`CLOUDFLARE_API_TOKEN reaches ${accounts.length} accounts; export CLOUDFLARE_ACCOUNT_ID to say which`);
      const verify = (await call("GET", `/accounts/${chosen.id}/tokens/verify`)).result;
      if (verify?.status !== "active") throw new Error(`the token is ${verify?.status ?? "not verifiable"} on ${chosen.name}`);
      return chosen;
    },
    async plan(accountId) {
      const paid = (await call("GET", `/accounts/${accountId}/subscriptions`)).result.find((subscription) => subscription.rate_plan?.id === "workers_paid");
      return paid === undefined ? undefined : { id: "workers_paid", state: paid.state, price: paid.price, currency: paid.currency, frequency: paid.frequency };
    },
    async subdomain(accountId) {
      const result = (await call("GET", `/accounts/${accountId}/workers/subdomain`)).result;
      return typeof result?.subdomain === "string" && result.subdomain !== "" ? result.subdomain : undefined;
    },
    /** Every Worker's name and every container application's name and id, sorted, so two listings compare as strings. */
    async listing(accountId) {
      const workers = [];
      for (let page = 1; ; page++) {
        const envelope = await call("GET", `/accounts/${accountId}/workers/scripts?page=${page}&per_page=100`);
        workers.push(...envelope.result.map((script) => script.id));
        if (page >= (envelope.result_info?.total_pages ?? 1) || envelope.result.length === 0) break;
      }
      const applications = (await call("GET", `/accounts/${accountId}/containers/applications`)).result.map((application) => ({ id: application.id, name: application.name }));
      workers.sort();
      applications.sort((a, b) => a.name.localeCompare(b.name));
      return { workers, applications };
    },
    async deleteApplication(accountId, applicationId) {
      await call("DELETE", `/accounts/${accountId}/containers/applications/${applicationId}`);
    },
    /** The container application of that name, with the image its configuration names: what the deployed station's container runs. */
    async application(accountId, name) {
      const found = (await call("GET", `/accounts/${accountId}/containers/applications`)).result.find((application) => application.name === name);
      return found === undefined ? undefined : { id: found.id, name: found.name, image: found.configuration?.image };
    },
  };
}

/** The config's text as one object: `//` and block comments stripped outside strings, trailing commas dropped (the release's is plain JSON under a comment header). */
function parseJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** The image a config's `pen` environment names, whatever the namespace: the ring hardcodes none. */
const imageOf = (config) => config?.env?.pen?.containers?.[0]?.image;

/** A docker.io reference taken apart: the repository, and the tag or the digest it names the image by. */
function parseImage(image) {
  const match = /^docker\.io\/([^:@]+)(?::([^:/@]+)|@(sha256:[0-9a-f]{64}))$/.exec(typeof image === "string" ? image : "");
  if (!match) return undefined;
  return { repository: match[1], tag: match[2], digest: match[3] };
}

/**
 * Whether Docker Hub has the image, asked the way a pull begins: an
 * anonymous pull token for the repository, then a `HEAD` of the manifest,
 * by tag or by digest. Returns the digest the registry names for it, or
 * the registry's answer.
 */
async function registryDigest(image) {
  const parsed = parseImage(image);
  if (parsed === undefined) return { error: `${image} is not a docker.io reference with a tag or a digest` };
  const { repository } = parsed;
  const tag = parsed.tag ?? parsed.digest;
  try {
    const auth = await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`, { signal: AbortSignal.timeout(20_000) });
    const { token } = await auth.json();
    const head = await fetch(`https://registry-1.docker.io/v2/${repository}/manifests/${tag}`, {
      method: "HEAD",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!head.ok) return { error: `${head.status} ${head.statusText} from registry-1.docker.io for ${repository}:${tag}` };
    return { digest: head.headers.get("docker-content-digest") ?? "(no digest header)" };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * The account ring, outside the walk: the token, the account's answers,
 * the image, the price and the yes; then the package ring's world and
 * install, the station's walk, and the deletion, whatever happened. The
 * ring never reads `~/.sheep`, `~/.wrangler`, or this checkout's
 * `node_modules`: the fresh `HOME` and the stripped PATH are the package
 * ring's, and `env()` drops every `CLOUDFLARE_*` and `SHEEP_TEST_*`
 * variable, so the token reaches one command's environment by name.
 */
async function accountRing({ ref, repo, spec, commit, keep, yes, dryRun, name: wantedName }) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.error("hermetic: the account ring needs CLOUDFLARE_API_TOKEN in its environment: the shepherd's token for the account the station goes on, which sheep home deploy takes the same way; nothing was done");
    process.exit(2);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  // The faux provider uses no key, so a missing one becomes a placeholder secret; the ring says so, and never asks for one.
  const keyForDeploy = key || `not-a-key-the-faux-provider-answers-${randomBytes(8).toString("hex")}`;
  let ring;
  try {
    ring = new Ring({ ref, repo, spec, commit, keep });
  } catch (error) {
    usage(`${ref}: ${error.message}`);
  }
  const api = accountApi(token);
  // The second machine is a container (station phase 2): Docker is needed for the walk, and its absence is known before anything is made.
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8" });
  const engine = docker.error || docker.status !== 0 ? undefined : docker.stdout.trim();
  let failure;
  const station = { deployed: false, name: undefined, home: undefined, account: undefined, subdomain: undefined, image: undefined, digest: undefined, tagDigest: undefined, engine };
  try {
    // Preflight: the account, the plan, the subdomain, the listing, and the image the ref's config names, on the registry.
    if (spec === undefined) console.log(`account ring: ${ref} = ${ring.sha}${repo === root ? "" : ` in ${repo}`}`);
    else console.log(`account ring: ${spec}${commit ? `, expected to be a build of ${commit}` : ""}`);
    station.account = await api.account();
    const plan = await api.plan(station.account.id);
    if (plan === undefined) throw new Error(`the account ${station.account.name} (${station.account.id}) is not on the Workers Paid plan, which containers need; deploy would refuse it, and the ring stops here`);
    station.subdomain = await api.subdomain(station.account.id);
    if (station.subdomain === undefined) throw new Error(`the account ${station.account.name} has no workers.dev subdomain; deploy takes --subdomain, and the ring does not choose one for the shepherd`);
    const before = await api.listing(station.account.id);
    console.log(`account: ${station.account.name} (${station.account.id}); plan ${plan.id} ${plan.state}, ${plan.price} ${plan.currency} ${plan.frequency}; subdomain ${station.subdomain}.workers.dev`);
    console.log(`  Workers: ${before.workers.join(", ") || "(none)"}`);
    console.log(`  container applications: ${before.applications.map((application) => `${application.name} (${application.id})`).join(", ") || "(none)"}`);
    if (ring.sha !== undefined) {
      station.image = imageOf(parseJsonc(ring.git("show", `${ring.sha}:home/wrangler.jsonc`)));
      if (typeof station.image !== "string") throw new Error(`${ref}'s home/wrangler.jsonc names no image in its pen container; a release does`);
      await checkImage(station, ring.stamp);
    } else console.log("image: read from the install's home/wrangler.jsonc after step 1 (a spec has no tree to read before)");
    console.log(engine === undefined ? "docker: none answers; the second machine (a7) is a container, so the walk needs it" : `docker: ${engine}; the second machine (a7) is a container from node:24-slim`);
    if (engine === undefined && !dryRun) throw new Error(`the account ring's second machine is a container, and no Docker answers here (docker version: ${docker.error ? docker.error.message : (docker.stderr || docker.stdout || "").trim()}); nothing was deployed`);
    station.name = wantedName ?? (ring.sha !== undefined ? `sheep-hermetic-${ring.sha.slice(0, 7)}` : undefined);
    if (station.name !== undefined && (before.workers.includes(station.name) || before.applications.some((application) => application.name === station.name))) {
      throw new Error(`the account already holds ${station.name}; a ring that left it behind failed, and deploy would refuse the name: delete it first (sheep home delete --name ${station.name}, or wrangler delete and wrangler containers delete)`);
    }
    console.log(`station: ${station.name ?? "sheep-hermetic-<the install's commit>"} at https://${station.name ?? "<name>"}.${station.subdomain}.workers.dev, deleted at the end whatever happens`);

    // The price and the yes, before anything is made.
    console.log(
      [
        "",
        "the account ring spends on the shepherd's account.",
        `  the Workers Paid plan is already paid, ${PLAN_PRICE}; the walk deploys one Worker with a container application, runs one container for one`,
        "  command (minutes at Cloudflare's per-minute container rate: cents), redeploys it once, and deletes both at the end, or on failure.",
        `  the key is used for nothing: the station runs the faux provider (ANTHROPIC_API_KEY ${key ? "is in the environment and becomes the secret" : "is not set; a placeholder string becomes the secret"}).`,
        "  the token and the key go to sheep home deploy's environment, and to nothing else of this ring.",
      ].join("\n"),
    );
    if (dryRun) console.log("\ndry run: stopping before the world is made; nothing deployed");
    else {
      if (yes) console.log("  --yes: not asking");
      else {
        if (!process.stdin.isTTY) {
          console.error("hermetic: the account ring asks before it spends, and stdin is not a terminal; pass --yes to answer ahead. Nothing was deployed");
          process.exit(2);
        }
        const answer = await ask("run it? [y/N] ");
        if (!/^y(es)?$/i.test(answer)) {
          console.error("hermetic: not run; nothing was deployed");
          process.exit(2);
        }
      }
      console.log("");

      // The world and the install: the package ring's.
      ring.assertFresh();
      await ring.install();
      if (station.name === undefined) station.name = `sheep-hermetic-${ring.stamp.commit.slice(0, 7)}`;
      station.home = `https://${station.name}.${station.subdomain}.workers.dev`;
      if (station.image === undefined) {
        // A spec: the install's config is the first tree there is to read the image from.
        station.image = imageOf(parseJsonc(readFileSync(join(ring.pkg, "home", "wrangler.jsonc"), "utf8")));
        if (typeof station.image !== "string") throw new Error("the install's home/wrangler.jsonc names no image in its pen container; a release does");
        await checkImage(station, ring.stamp);
      }
      await accountWalk(ring, api, station, { token, key: keyForDeploy, placeholder: key === undefined || key === "", before, spec, commit });
    }
  } catch (error) {
    failure = error;
  } finally {
    if (failure && station.deployed) {
      console.log(`\nhermetic: the walk failed after the deploy; deleting ${station.name} first`);
      await deleteStation(ring, api, station, token);
    }
    if (failure && keep) console.error("hermetic: the walk failed; the local home is stopped even with --keep");
    if (failure) ring.keep = false;
    await ring.stopLocalHome();
    ring.keep = keep;
  }
  if (dryRun) {
    ring.cleanup();
    if (failure) {
      console.log(`\naccount ring: dry run FAILED at preflight: ${failure.message}`);
      process.exit(1);
    }
    console.log("\naccount ring: dry run ok (the preflight held; nothing deployed)");
    return;
  }
  ring.unchecked.push(
    "journey 1 step 2: a real key from ANTHROPIC_API_KEY and a real model at the station; the ring set the faux provider as a var, and the key it put is unused",
    "journey 2 step 2: pi's interactive terminal on the second machine, which needs a TTY; the container attached with none and pi's client said so",
    "journey 3 step 2: that a sheep ran the repository's tests; the faux program edited, committed, and pushed, and ran no tests",
    "journey 5 step 2: the image digest read from the container itself: the platform gives a container ids, not a digest, so the ring read the reference the Worker carries beside its stamp and the application's configured image, and asked the registry what the tag is",
    "station phase 3: the delete's listing of what goes and how many sessions are in it; the ring typed the name and read the three lines",
  );
  ring.report(failure, "account");
  ring.cleanup();
  if (failure) {
    console.log(`\naccount ring: FAILED at ${failure.ring?.step ?? "preflight"}`);
    process.exit(1);
  }
  console.log(`\naccount ring: ok (${ring.lines.filter((line) => line.startsWith("ok")).length} lines held)`);
}

/** `sheep home delete` with the name on stdin, from blog, with the token; then the listing, and what is left named loudly. */
async function deleteStation(ring, api, station, token) {
  const env = { ...ring.env(), CLOUDFLARE_API_TOKEN: token };
  const deleted = await ring.sheep(["home", "delete", "--name", station.name], { env, input: `${station.name}\n` });
  console.log(`  sheep home delete (exit ${deleted.code}): ${deleted.stdout.trim().split("\n").join("; ")}${deleted.stderr.trim() ? `; stderr: ${deleted.stderr.trim()}` : ""}`);
  station.deployed = false;
  const after = await api.listing(station.account.id);
  const left = [...after.workers.filter((worker) => worker === station.name).map((worker) => `Worker ${worker}`), ...after.applications.filter((application) => application.name === station.name).map((application) => `container application ${application.name} (${application.id})`)];
  if (left.length > 0) console.log(`  STILL ON THE ACCOUNT: ${left.join(", ")}; delete by hand: wrangler delete ${station.name}; wrangler containers delete <id>`);
  else console.log(`  the account holds no Worker and no container application named ${station.name}`);
  return { deleted, after, left };
}

/**
 * What the ref's config names and what the registry holds (station phase
 * 2): a digest-named image is asked for by digest, and the tag at the
 * stamp's commit is asked for too and must be that digest; a tag-named
 * image (a release built by hand) is asked for by tag, and the digest the
 * registry answers is printed, not asserted against anything. Sets
 * `station.digest` (what the config's reference resolves to on the
 * registry) and `station.tagDigest`.
 */
async function checkImage(station, stamp) {
  const parsed = parseImage(station.image);
  if (parsed === undefined) throw new Error(`the config's image ${station.image} is not a docker.io reference by tag or by digest`);
  const registry = await registryDigest(station.image);
  if (registry.error !== undefined) throw new Error(`the image ${station.image} is not on the registry: ${registry.error}; the deploy would fail on the pull`);
  station.digest = registry.digest;
  if (parsed.digest !== undefined) {
    if (station.digest !== parsed.digest) throw new Error(`the registry answered ${station.digest} for ${station.image}, not the digest the reference names`);
    const tag = `docker.io/${parsed.repository}:${stamp.commit}`;
    const byTag = await registryDigest(tag);
    if (byTag.error !== undefined) throw new Error(`the tag ${tag}, the release's commit, is not on the registry: ${byTag.error}`);
    station.tagDigest = byTag.digest;
    if (station.tagDigest !== parsed.digest) throw new Error(`the config names ${station.image}, but the registry's digest for the tag ${tag} is ${station.tagDigest}; the release named a digest that is not its commit's push`);
    console.log(`image: ${station.image} (by digest; the tag ${tag} on Docker Hub is that digest)`);
  } else {
    station.tagDigest = station.digest;
    console.log(`image: ${station.image} (by tag; a release built by hand names the tag; the registry's digest for it is ${station.digest})`);
  }
  if (typeof stamp?.image === "string" && stamp.image !== station.image) throw new Error(`the manifest's sheep.image is ${stamp.image}; the config names ${station.image}`);
}

/** The station's walk: the steps a1 to a8, one line each, from blog; `station.deployed` is set the moment the deploy is attempted. */
async function accountWalk(ring, api, station, { token, key, placeholder, before, spec, commit }) {
  const { name, home, account } = station;
  const withToken = { ...ring.env(), CLOUDFLARE_API_TOKEN: token, ANTHROPIC_API_KEY: key };
  const needles = [token, key];
  const watch = watchPs(needles, 25);
  const stamp = ring.stamp;
  const build = { commit: stamp.commit, builtAt: stamp.builtAt };
  const parse = (step, command, result) => {
    try {
      return JSON.parse(result.stdout);
    } catch {
      ring.fail(step, command, result);
    }
  };
  try {
    // Step 1: with the token removed, the deploy refuses, makes nothing, and the account's listing is what it was.
    const refused = await ring.sheep(["home", "deploy"]);
    if (refused.code !== 2 || refused.stdout !== "" || !refused.stderr.includes("CLOUDFLARE_API_TOKEN is not set") || !refused.stderr.includes("Workers Paid plan")) {
      ring.fail("a1", "sheep home deploy (no token in the environment)", { ...refused, stderr: `${refused.stderr}\nexpected exit 2, nothing on stdout, and the refusal naming CLOUDFLARE_API_TOKEN and the plan` });
    }
    if (existsSync(ring.configOf(ring.blog)) || existsSync(join(ring.kennel(ring.blog), "deploy"))) ring.fail("a1", `ls -a ${ring.kennel(ring.blog)}`, { stdout: readdirSync(ring.kennel(ring.blog)).join("\n"), stderr: "the refused deploy wrote into the kennel", code: 1 });
    const afterRefusal = await api.listing(account.id);
    if (JSON.stringify(afterRefusal) !== JSON.stringify(before)) ring.fail("a1", "the account's listing after the refused deploy", { stdout: JSON.stringify(afterRefusal), stderr: `expected ${JSON.stringify(before)}`, code: 1 });
    ring.ok("a1", "sheep home deploy (no token)", `exit 2: "${refused.stderr.split("\n")[0].replace(/^sheep: /, "")}"; nothing in the kennel; the account's listing identical before and after (${before.workers.length} Workers, ${before.applications.length} applications)`);

    // Step 2: the deploy, timed; the address answers; the two stamps are equal; the config names the station with no local marker.
    station.deployed = true;
    const startedAt = Date.now();
    const deployed = await ring.sheep(["home", "deploy", "--faux", "--name", name, "--json"], { env: withToken });
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
    const report = parse("a2", `sheep home deploy --faux --name ${name} --json`, deployed);
    if (deployed.code !== 0 || report.name !== name || report.home !== home || report.state !== "deployed" || report.answers !== true) {
      ring.fail("a2", `sheep home deploy --faux --name ${name} --json`, { ...deployed, stderr: `${deployed.stderr}\nexpected exit 0, name ${name}, home ${home}, state deployed, answers true` });
    }
    if (station.image !== undefined && report.image !== station.image) ring.fail("a2", `sheep home deploy --faux --name ${name} --json`, { ...deployed, stderr: `the report's image is ${report.image}; the ref's config names ${station.image}` });
    station.image = report.image;
    if (Number(seconds) >= 180) ring.fail("a2", `sheep home deploy --faux --name ${name} --json`, { ...deployed, stderr: `${seconds}s; the deploy must finish under three minutes` });
    if (!(report.containers?.healthy >= 1)) ring.fail("a2", `sheep home deploy --faux --name ${name} --json`, { ...deployed, stderr: `${deployed.stderr}\nexpected a healthy container instance; got ${JSON.stringify(report.containers)}` });
    if (!(await answers(home))) ring.fail("a2", `curl ${home}/`, { stdout: "", stderr: `${home} does not answer sheep`, code: 1 });
    const config = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (config.home !== home || config.name !== name || typeof config.token !== "string" || config.token.length < 32 || config.local !== undefined) {
      ring.fail("a2", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...config, token: "…" }), stderr: `expected {home: ${home}, token, name: ${name}} and no local marker`, code: 1 });
    }
    needles.push(config.token);
    station.token = config.token;
    const homed = await ring.sheep(["home", "--json"]);
    const homeReport = parse("a2", "sheep home --json", homed);
    if (homed.code !== 0 || homeReport.home !== home || homeReport.name !== name || homeReport.local !== false || homeReport.answers !== true || JSON.stringify(homeReport.build?.home) !== JSON.stringify(build) || JSON.stringify(homeReport.build?.cli) !== JSON.stringify(build) || homed.stderr !== "") {
      ring.fail("a2", "sheep home --json", { ...homed, stderr: `${homed.stderr}\nexpected home ${home}, name ${name}, local false, answers true, build.home = build.cli = ${JSON.stringify(build)}, nothing on stderr` });
    }
    // The image (station phase 2): what the Worker reports beside its stamp is the config's line, and what the account says the application runs.
    if (homeReport.image !== station.image) ring.fail("a2", "sheep home --json", { ...homed, stderr: `${homed.stderr}\nGET /home reports the image ${homeReport.image}; the config names ${station.image}` });
    const application = await api.application(account.id, name);
    if (application === undefined) ring.fail("a2", `GET /accounts/${account.id}/containers/applications`, { stdout: "", stderr: `no container application named ${name}`, code: 1 });
    if (application.image !== station.image) ring.fail("a2", `GET /accounts/${account.id}/containers/applications`, { stdout: JSON.stringify(application), stderr: `the application's configuration.image is ${application.image}; the config names ${station.image}`, code: 1 });
    station.applicationImage = application.image;
    // wrangler came once, into the ring's ~/.sheep/tools, and nothing else is under HOME/.sheep.
    const tools = join(ring.home, ".sheep", "tools");
    const wranglerPkg = join(tools, "node_modules", "wrangler", "package.json");
    const wranglerVersion = existsSync(wranglerPkg) ? JSON.parse(readFileSync(wranglerPkg, "utf8")).version : undefined;
    if (wranglerVersion !== stamp.wrangler) ring.fail("a2", `cat ${wranglerPkg}`, { stdout: String(wranglerVersion), stderr: `expected wrangler ${stamp.wrangler} in ${tools}`, code: 1 });
    const dotSheep = readdirSync(join(ring.home, ".sheep")).sort();
    if (JSON.stringify(dotSheep) !== JSON.stringify(["tools"])) ring.fail("a2", `ls ${join(ring.home, ".sheep")}`, { stdout: dotSheep.join("\n"), stderr: "expected tools alone under HOME/.sheep", code: 1 });
    const derived = JSON.parse(readFileSync(join(ring.kennel(ring.blog), "deploy", "wrangler.jsonc"), "utf8"));
    if (derived.name !== name || derived.env?.pen?.name !== name || derived.env?.pen?.containers?.[0]?.name !== name || imageOf(derived) !== station.image) {
      ring.fail("a2", `cat ${join(ring.kennel(ring.blog), "deploy", "wrangler.jsonc")}`, { stdout: JSON.stringify(derived), stderr: `expected every name ${name} and the image ${station.image}`, code: 1 });
    }
    ring.ok("a2", `sheep home deploy --faux --name ${name} --json (in blog)`, `${seconds}s; ${home} answers sheep; containers ${report.containers.healthy} healthy after ${report.containers.seconds}s; account ${report.account.name}, ${report.plan.id} ${report.plan.state}; wrangler ${stamp.wrangler} fetched into ~/.sheep/tools; <blog>/.sheep/config names the station, no local marker; deploy/wrangler.jsonc names ${name} three times; the key secret is ${placeholder ? "a placeholder (no ANTHROPIC_API_KEY here; the faux provider uses none)" : "the environment's ANTHROPIC_API_KEY"}`);
    ring.ok("a2", "sheep home --json (in blog)", `home ${home}, name ${name}, answers; build.home = build.cli = ${build.commit} (${build.builtAt}); nothing on stderr`);
    ring.ok("a2", `GET /home; GET /accounts/${account.id.slice(0, 6)}…/containers/applications`, `image ${station.image}: the Worker reports it, the application ${application.id} is configured with it${station.tagDigest !== undefined && station.image.includes("@sha256:") ? `, and the registry's digest for the tag at ${stamp.commit} is it` : " (by tag; a release built by hand)"}`);

    // Step 3: the faux program through the address, then a sheep whose shell names git, node, and pnpm from the container.
    const program = { steps: [{ tool: { name: "bash", args: { command: "git --version && node --version && pnpm --version" } } }, { text: "git, node, pnpm" }] };
    const posted = await fetch(`${home}/faux`, { method: "POST", headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" }, body: JSON.stringify(program), signal: AbortSignal.timeout(30_000) });
    const postedBody = await posted.text();
    if (posted.status !== 200) ring.fail("a3", `POST ${home}/faux`, { stdout: postedBody, stderr: `status ${posted.status}; expected 200 from the faux provider's route`, code: 1 });
    const sentence = "Clone nothing; what tools do you have?";
    const newStarted = Date.now();
    const created = await ring.sheep(["new", "--", sentence]);
    const newSeconds = ((Date.now() - newStarted) / 1000).toFixed(0);
    const id = /^session ([0-9a-f-]{36})\n/.exec(created.stderr)?.[1];
    if (created.code !== 0 || created.stdout !== "git, node, pnpm\n" || !id) ring.fail("a3", `sheep new -- "${sentence}"`, { ...created, stderr: `${created.stderr}\nexpected "git, node, pnpm" on stdout and the session id on stderr` });
    const logged = await ring.sheep(["log", id]);
    if (logged.code !== 0 || !logged.stdout.includes("git version")) ring.fail("a3", `sheep log ${id}`, { ...logged, stderr: `${logged.stderr}\nexpected the tool result naming git version` });
    const versions = { git: /git version (\S+)/.exec(logged.stdout)?.[1], node: /\n(v\d+\.\d+\.\d+)\n/.exec(logged.stdout)?.[1], pnpm: /\n(\d+\.\d+\.\d+)\n/.exec(logged.stdout)?.[1] };
    station.sheep = id;
    ring.ok("a3", `POST /faux; sheep new -- "${sentence}"; sheep log ${id}`, `${newSeconds}s; "git, node, pnpm"; the shell in the container: git version ${versions.git ?? "?"}, node ${versions.node ?? "?"}, pnpm ${versions.pnpm ?? "?"}`);
    console.log(`image: ${station.image}${station.image.includes("@sha256:") ? " (by digest)" : ` (by tag; ${station.digest} on the registry)`}`);

    // Step 4: pi becomes a kennel first (the package ring's k2.2; without it `sheep home local` falls back to ~/.sheep), then
    // the local home in pi, reached from blog with --home for one command; blog's config keeps naming the station.
    const piSetup = await ring.sheep(["setup", "--json"], { cwd: ring.pi });
    const piReport = parse("a4", "sheep setup --json (in pi)", piSetup);
    if (piSetup.code !== 0 || piReport.kennel?.state !== "made" || !ring.samePath(piReport.kennel?.path, ring.kennel(ring.pi)) || piReport.home?.state !== "none") {
      ring.fail("a4", "sheep setup --json (in pi)", { ...piSetup, stderr: `${piSetup.stderr}\nexpected the kennel ${ring.kennel(ring.pi)} made and no home` });
    }
    const pi = await ring.startHome(ring.pi, "a4", "started");
    if (pi.report.wrangler?.installed !== false || pi.report.wrangler?.version !== stamp.wrangler) {
      ring.fail("a4", "sheep home local --faux --json (in pi)", { stdout: JSON.stringify(pi.report.wrangler), stderr: `expected wrangler ${stamp.wrangler} already fetched by the deploy, installed false`, code: 1 });
    }
    needles.push(pi.token);
    const viaFlag = await ring.sheep(["--home", pi.url, "ls", "--json"], { env: { ...ring.env(), SHEEP_TOKEN: pi.token } });
    const rows = parse("a4", `sheep --home ${pi.url} ls --json (in blog)`, viaFlag);
    if (viaFlag.code !== 0 || !Array.isArray(rows) || rows.length !== 0) ring.fail("a4", `sheep --home ${pi.url} ls --json (in blog)`, { ...viaFlag, stderr: `${viaFlag.stderr}\nexpected no rows: pi's home has no sheep, and the station's ${id} is not its` });
    const stationRows = parse("a4", "sheep ls --json (in blog)", await ring.sheep(["ls", "--json"]));
    if (!stationRows.some((row) => row.id === id)) ring.fail("a4", "sheep ls --json (in blog)", { stdout: JSON.stringify(stationRows), stderr: `expected ${id} at the station`, code: 1 });
    const configAfter = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (configAfter.home !== home || configAfter.name !== name || configAfter.token !== config.token || configAfter.local !== undefined) {
      ring.fail("a4", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...configAfter, token: "…" }), stderr: "expected blog's config still naming the station", code: 1 });
    }
    const piStopped = await ring.sheep(["home", "stop"], { cwd: ring.pi });
    if (piStopped.code !== 0 || piStopped.stdout !== `stopped the local home at ${pi.url}\n`) ring.fail("a4", "sheep home stop (in pi)", piStopped);
    ring.homes.delete(ring.pi);
    ring.ok("a4", `sheep setup (in pi); sheep home local --faux (in pi); sheep --home ${pi.url} ls (in blog); sheep home stop (in pi)`, `<pi>/.sheep made; pi's home at ${pi.url} with wrangler already there; --home lists pi's none while blog's config names ${home} and ${id} stays at the station; pi's home stopped`);

    // Step 5: the redeploy: the same Worker, the same token, the same stamp, the sheep still there.
    const againStarted = Date.now();
    const again = await ring.sheep(["home", "deploy", "--faux", "--json"], { env: withToken });
    const againSeconds = ((Date.now() - againStarted) / 1000).toFixed(0);
    const second = parse("a5", "sheep home deploy --faux --json (again, no --name)", again);
    if (again.code !== 0 || second.name !== name || second.home !== home || second.state !== "redeployed" || second.answers !== true || JSON.stringify(second.build?.home) !== JSON.stringify(build) || !(second.containers?.healthy >= 1)) {
      ring.fail("a5", "sheep home deploy --faux --json (again)", { ...again, stderr: `${again.stderr}\nexpected the same name and home, state redeployed, answers true, build.home ${JSON.stringify(build)}, a healthy container instance` });
    }
    const configAgain = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (configAgain.token !== config.token || configAgain.name !== name || configAgain.home !== home) ring.fail("a5", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...configAgain, token: "…" }), stderr: "expected the same token, name, and home", code: 1 });
    const stillThere = parse("a5", "sheep ls --json (in blog)", await ring.sheep(["ls", "--json"]));
    if (!stillThere.some((row) => row.id === id)) ring.fail("a5", "sheep ls --json (after the redeploy)", { stdout: JSON.stringify(stillThere), stderr: `expected ${id} still listed`, code: 1 });
    ring.ok("a5", "sheep home deploy --faux --json (again, no --name)", `${againSeconds}s; redeployed ${name} at ${home}, the same token, stamp ${second.build.home.commit} (${second.build.home.builtAt}); containers ${second.containers.healthy} healthy after ${second.containers.seconds}s; ${id} still listed`);

    // Step 7 (station phase 2): the second machine, a container, joins the station and watches a turn the first machine left running.
    await secondMachine(ring, station, { sheepId: id, spec, commit });

    // Step 8 (station phase 2): journey 3 against the scratch repository, when its token is here; one skip line otherwise.
    await journeyThree(ring, station, { needles });

    // Step 6: the delete, the name on stdin; then the account listed, the last lines.
    const { deleted, after, left } = await deleteStation(ring, api, station, token);
    const lines = deleted.stdout.trim().split("\n");
    if (deleted.code !== 0 || lines[0] !== `deleted the Worker ${name} and its objects` || !lines[1]?.startsWith(`deleted the container application ${name} (`) || lines[2] !== `config: ${join(realpathSync(ring.kennel(ring.blog)), "config")} removed`) {
      ring.fail("a6", `sheep home delete --name ${name} (the name on stdin)`, { ...deleted, stderr: `${deleted.stderr}\nexpected the three lines: the Worker, the application, the config removed` });
    }
    if (existsSync(ring.configOf(ring.blog)) || existsSync(join(ring.kennel(ring.blog), "deploy"))) ring.fail("a6", `ls -a ${ring.kennel(ring.blog)}`, { stdout: readdirSync(ring.kennel(ring.blog)).join("\n"), stderr: "expected the config and deploy/ gone", code: 1 });
    if (left.length > 0) ring.fail("a6", "the account's listing after the delete", { stdout: left.join("\n"), stderr: `expected no Worker and no container application named ${name}`, code: 1 });
    ring.ok("a6", `sheep home delete --name ${name} (the name on stdin)`, `${lines.join("; ").replace(ring.dir, "<ring>")}; the account holds neither`);
    console.log(`  Workers: ${after.workers.join(", ") || "(none)"}`);
    console.log(`  container applications: ${after.applications.map((application) => `${application.name} (${application.id})`).join(", ") || "(none)"}`);
    if (JSON.stringify(after) !== JSON.stringify(before)) ring.fail("a6", "the account's listing after the walk", { stdout: JSON.stringify(after), stderr: `expected the listing from before the walk: ${JSON.stringify(before)}`, code: 1 });

    // The whole walk: the token, the key, the station's token, and pi's were in no process's arguments in any sample.
    watch.stop();
    const leak = watch.line();
    if (leak) ring.fail("walk", "ps -Ao pid=,args= (polled)", { stdout: leak.replace(token, "<CLOUDFLARE_API_TOKEN>").replace(key, "<ANTHROPIC_API_KEY>"), stderr: "a secret was seen in a process's arguments during the walk", code: 1 });
    ring.ok("walk", "ps (polled every 25 ms from a1)", `${watch.samples()} samples; the token, the key, the station's SHEEP_TOKEN, pi's, and the repository's token in no process's arguments`);
  } finally {
    watch.stop();
  }
}

/* The second machine (station phase 2, journey 2). */

/** The image the second machine is: the machine ring's, from node:24-slim, so "two machines" is a container with nothing but Node, git, and ps. */
const SECOND_IMAGE = "node:24-slim";

/** The turn the first machine leaves running: one text step after a delay, so the terminal that started it is gone long before it ends. */
const SECOND_TURN = { text: "the turn outlived the terminal that started it", delayMs: 20_000 };
const SECOND_PROMPT = "Finish this after I am gone.";
/** How long after `sheep attach <id> -- …` starts that process is killed: lamb's journey 2, the first terminal closed mid-turn. */
const KILL_AFTER_MS = 2_000;

/**
 * The outer half of step a7, from this machine: the context, the image,
 * the probe, and one container running `--second` with the token on its
 * stdin and nothing else of this ring. The container's lines stream
 * indented; the line that says it attached is the cue to start the turn
 * from `blog` and kill that process two seconds in. The container's exit
 * code is the inner half's verdict; the outer half then reads the
 * transcript from this side too.
 */
async function secondMachine(ring, station, { sheepId, spec, commit }) {
  const { home, token: stationToken } = station;
  const context = mkdtempSync(join(tmpdir(), "sheep-second-"));
  const bare = join(context, "src.git");
  const tag = ringTag(SECOND_IMAGE);
  const name = `sheep-second-${process.pid}`;
  try {
    // The build context: the ref as a bare repository (an empty directory for a spec), this script, and the Dockerfile: the machine ring's shape.
    if (ring.sha !== undefined) {
      gitIn(context)("init", "--quiet", "--bare", "src.git");
      ring.git("push", "--quiet", bare, `${ring.sha}:refs/heads/ring`);
      gitIn(bare)("symbolic-ref", "HEAD", "refs/heads/ring");
    } else mkdirSync(bare);
    copyFileSync(fileURLToPath(import.meta.url), join(context, "hermetic.mjs"));
    copyFileSync(join(root, "scripts", "hermetic", "Dockerfile"), join(context, "Dockerfile"));
    console.log(`  second machine: ${SECOND_IMAGE} + git + procps, the ref as /src.git; context ${context}`);
    let buildSeconds;
    try {
      buildSeconds = await buildImage(context, SECOND_IMAGE, tag, []);
    } catch (error) {
      ring.fail("a7", `docker build (${SECOND_IMAGE})`, { stdout: "", stderr: error.message, code: 1 });
    }
    const probed = await run("docker", ["run", "--rm", "--init", tag, "sh", "-c", probeScript()]);
    if (probed.code !== 0) ring.fail("a7", "docker run … sh -c <probe>", probed);
    for (const line of probed.stdout.trim().split("\n")) console.log(`  ${line}`);

    // The container: the token on stdin, the address, the sheep, and the image it must see as arguments; nothing mounted.
    const inside = ["node", "/ring/hermetic.mjs", "--ring", "account", "--second", "--address", home, "--sheep", sheepId, "--expect-image", station.image, ...(ring.sha !== undefined ? ["--repo", "/src.git", ring.sha] : ["--spec", spec, ...(commit ? ["--commit", commit] : [])])];
    const runArgs = ["run", "--rm", "--init", "-i", "--name", name, tag, ...inside];
    console.log(`  docker ${runArgs.join(" ")}  (stdin: the station's token, one line)`);
    let turn;
    let attachedAt;
    let killedAt;
    let started = false;
    const startTurn = async () => {
      // The cue came: the second machine attached and is waiting. The first machine starts a turn and closes its terminal mid-turn.
      attachedAt = Date.now();
      const posted = await fetch(`${home}/s/${encodeURIComponent(sheepId)}/faux`, { method: "POST", headers: { authorization: `Bearer ${stationToken}`, "content-type": "application/json" }, body: JSON.stringify({ steps: [SECOND_TURN] }), signal: AbortSignal.timeout(30_000) });
      if (posted.status !== 200) throw new Error(`POST /s/${sheepId}/faux answered ${posted.status}: ${await posted.text()}`);
      let child;
      const timer = new Promise((resolveKill) =>
        setTimeout(() => {
          killedAt = Date.now();
          child?.kill("SIGKILL");
          resolveKill();
        }, KILL_AFTER_MS),
      );
      const result = await ring.sheep(["attach", sheepId, "--", SECOND_PROMPT], { onSpawn: (spawned) => (child = spawned) });
      await timer;
      console.log(`  first machine: sheep attach ${sheepId} -- "${SECOND_PROMPT}" started the turn and was killed with SIGKILL after ${((killedAt - attachedAt) / 1000).toFixed(1)}s (exit ${result.code}; stdout ${JSON.stringify(result.stdout.slice(0, 80))})`);
      const rows = JSON.parse((await ring.sheep(["ls", "--json"])).stdout);
      const row = rows.find((candidate) => candidate.id === sheepId);
      if (row?.state !== "running") throw new Error(`after the kill, ${sheepId} is ${row?.state ?? "not listed"}, not running: the prompt did not reach the cell in ${KILL_AFTER_MS / 1000}s, or the turn ended with the terminal`);
      console.log(`  first machine: sheep ls --json says ${sheepId} is running with its terminal gone`);
    };
    const containerStarted = Date.now();
    const code = await runIndented("docker", runArgs, { input: `${stationToken}\n` }, "    ", (line) => {
      if (!started && /^second: attached to /.test(line)) {
        started = true;
        turn = startTurn().catch((error) => {
          console.log(`  first machine: ${error.message}`);
          spawnSync("docker", ["kill", name], { stdio: "ignore" });
          const failure = new Error(`a7: the first machine's turn: ${error.message}`);
          failure.ring = { step: "a7", command: `POST /s/${sheepId}/faux; sheep attach ${sheepId} -- "${SECOND_PROMPT}" (killed at ${KILL_AFTER_MS / 1000}s); sheep ls --json`, result: { stdout: "", stderr: error.message, code: 1 } };
          throw failure;
        });
      }
    });
    const containerSeconds = ((Date.now() - containerStarted) / 1000).toFixed(0);
    if (turn !== undefined) await turn;
    if (!started) ring.fail("a7", `docker ${runArgs.join(" ")}`, { stdout: "", stderr: `the container exited ${code} after ${containerSeconds}s without attaching; its output is above`, code });
    if (code !== 0) ring.fail("a7", `docker ${runArgs.join(" ")}`, { stdout: "", stderr: `the container exited ${code} after ${containerSeconds}s; its output is above`, code });

    // From this side too: the turn ended, and the transcript shows the prompt and the text.
    const logged = await ring.sheep(["log", sheepId]);
    if (logged.code !== 0 || !logged.stdout.includes(SECOND_PROMPT) || !logged.stdout.includes(SECOND_TURN.text)) ring.fail("a7", `sheep log ${sheepId} (in blog)`, { ...logged, stderr: `${logged.stderr}\nexpected the prompt and "${SECOND_TURN.text}"` });
    const rows = JSON.parse((await ring.sheep(["ls", "--json"])).stdout);
    if (rows.find((row) => row.id === sheepId)?.state !== "idle") ring.fail("a7", "sheep ls --json (in blog)", { stdout: JSON.stringify(rows), stderr: `expected ${sheepId} idle after the turn`, code: 1 });
    ring.ok("a7", `docker run --rm --init -i ${tag} … --second (the token on stdin); sheep attach ${sheepId} -- … killed at ${KILL_AFTER_MS / 1000}s (in blog)`, `build ${buildSeconds}s, container ${containerSeconds}s; the second machine installed the release, joined ${home}, listed ${sheepId}, attached, and saw the turn end ${SECOND_TURN.delayMs / 1000}s after the first terminal was killed; sheep log here shows "${SECOND_TURN.text}"`);
  } finally {
    rmSync(context, { recursive: true, force: true });
  }
}

/**
 * The inner half of step a7, in the container: the token from stdin,
 * the package ring's world and install from `/src.git` under the
 * container's HOME, `sheep home join`, `sheep home`, `sheep ls`, a
 * promptless `sheep attach`, the cue, then `sheep wait` and `sheep log`
 * on the turn the first machine left running. `ps` is read while join
 * runs: the token is in no process's arguments here either. Prints
 * nothing that holds the token.
 */
async function secondInside({ ref, repo, spec, commit, address, sheep: sheepId, expectImage }) {
  if (root !== "/" || !existsSync("/ring/hermetic.mjs") || !existsSync("/.dockerenv")) {
    console.error("hermetic: --second is the container's half of the account ring's second machine; run pnpm hermetic --ring account");
    process.exit(2);
  }
  const token = await new Promise((resolveToken) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolveToken(text.split("\n")[0].trim()));
    process.stdin.on("error", () => resolveToken(""));
    process.stdin.resume();
  });
  const redact = (text) => (token ? String(text).split(token).join("<SHEEP_TOKEN>") : String(text));
  const print = (text) => console.log(redact(text));
  const ok = (step, command, note) => print(`ok    ${step.padEnd(8)} ${command}${note ? `  → ${note}` : ""}`);
  const fail = (step, command, result) => {
    print(`\nFAIL  ${step}: ${command} (exit ${result.code})`);
    if (result.stdout?.trim()) print(`--- stdout ---\n${result.stdout.trimEnd()}`);
    if (result.stderr?.trim()) print(`--- stderr ---\n${result.stderr.trimEnd()}`);
    process.exit(1);
  };
  if (token === "") fail("second", "read stdin", { stdout: "", stderr: "no token on stdin; the outer half pipes one line", code: 2 });
  print(`second: token read from stdin (${token.length} characters); station ${address}; sheep ${sheepId}`);

  // The world: the package ring's, under this container's HOME, with the release installed from /src.git (or the spec).
  const world = join(homedir(), "second");
  mkdirSync(world);
  let ring;
  try {
    ring = new Ring({ ref, repo, spec, commit, keep: false, dir: world });
    ring.assertFresh();
    await ring.install();
  } catch (error) {
    if (error.ring) fail(error.ring.step, error.ring.command, error.ring.result);
    fail("second", "the world and the install", { stdout: "", stderr: error.stack ?? error.message, code: 1 });
  }
  const stamp = ring.stamp;
  const build = { commit: stamp.commit, builtAt: stamp.builtAt };
  const parse = (step, command, result) => {
    try {
      return JSON.parse(result.stdout);
    } catch {
      fail(step, command, result);
    }
  };
  const tokenWatch = watchPs([token], 15);
  try {
    // Journey 2 step 1: join, the token on stdin; the config names the station with no local marker and no name.
    const joined = await ring.sheep(["home", "join", address, "--json"], { input: `${token}\n` });
    const report = parse("second", `sheep home join ${address} --json (in blog)`, joined);
    if (joined.code !== 0 || report.home !== address || report.image !== expectImage || JSON.stringify(report.build?.home) !== JSON.stringify(build) || JSON.stringify(report.build?.cli) !== JSON.stringify(build) || report.skew !== null) {
      fail("second", `sheep home join ${address} --json`, { ...joined, stdout: redact(joined.stdout), stderr: `${redact(joined.stderr)}\nexpected home ${address}, image ${expectImage}, build.home = build.cli = ${JSON.stringify(build)}, no skew` });
    }
    const config = JSON.parse(readFileSync(ring.configOf(ring.blog), "utf8"));
    if (JSON.stringify(Object.keys(config).sort()) !== JSON.stringify(["home", "token"]) || config.home !== address || config.token !== token) {
      fail("second", `cat ${ring.configOf(ring.blog)}`, { stdout: JSON.stringify({ ...config, token: "…" }), stderr: `expected exactly {home: ${address}, token}: no local marker, no name (the station is the other kennel's)`, code: 1 });
    }
    ok("second", `sheep home join ${address} --json (the token on stdin)`, `joined; image ${report.image}; build.home = build.cli = ${build.commit} (${build.builtAt}); <blog>/.sheep/config is {home, token}, no name, no local marker`);
    print(`second: image ${report.image}`);

    // `sheep home`: the station named, not local, answering, the stamps equal, the image reported.
    const homed = await ring.sheep(["home", "--json"]);
    const homeReport = parse("second", "sheep home --json", homed);
    if (homed.code !== 0 || homeReport.home !== address || homeReport.name !== null || homeReport.local !== false || homeReport.answers !== true || JSON.stringify(homeReport.build?.home) !== JSON.stringify(build) || JSON.stringify(homeReport.build?.cli) !== JSON.stringify(build) || homeReport.image !== expectImage || homed.stderr !== "") {
      fail("second", "sheep home --json", { ...homed, stderr: `${homed.stderr}\nexpected home ${address}, name null, local false, answers true, build.home = build.cli = ${JSON.stringify(build)}, image ${expectImage}, nothing on stderr` });
    }
    ok("second", "sheep home --json (in blog)", `home ${address}, name null, local false, answers; build.home = build.cli = ${build.commit} (${build.builtAt}); image ${homeReport.image}`);

    // `sheep ls`: the sheep the first machine minted, idle.
    const listed = await ring.sheep(["ls", "--json"]);
    const rows = parse("second", "sheep ls --json", listed);
    const row = Array.isArray(rows) ? rows.find((candidate) => candidate.id === sheepId) : undefined;
    if (listed.code !== 0 || row === undefined) fail("second", "sheep ls --json", { ...listed, stderr: `${listed.stderr}\nexpected ${sheepId}, the sheep the first machine minted` });
    if (row.state !== "idle") fail("second", "sheep ls --json", { ...listed, stderr: `${listed.stderr}\nexpected ${sheepId} idle before the first machine's turn; it is ${row.state}` });
    ok("second", "sheep ls --json (in blog)", `${rows.length} sheep at the station; ${sheepId} (${row.name ?? "unnamed"}) listed, idle: minted from the first machine, seen from the second`);

    // Journey 2 step 2, without a terminal: pi's client attaches, says so, and exits.
    const attached = await ring.sheep(["attach", sheepId]);
    if (attached.code !== 0 || !attached.stdout.includes(`\t${sheepId}\tattached`)) fail("second", `sheep attach ${sheepId}`, { ...attached, stderr: `${attached.stderr}\nexpected pi's client to attach and say so` });
    ok("second", `sheep attach ${sheepId} (no prompt, no terminal)`, "attached through pi's client, and exited");
    // The cue the outer half waits for, then the first machine starts a turn and closes its terminal.
    print(`second: attached to ${sheepId}; waiting for the first machine's turn`);
    const deadline = Date.now() + 90_000;
    let running;
    for (;;) {
      const again = parse("second", "sheep ls --json (polling)", await ring.sheep(["ls", "--json"]));
      running = again.find((candidate) => candidate.id === sheepId);
      if (running?.state === "running") break;
      if (Date.now() >= deadline) fail("second", "sheep ls --json (polled 90s)", { stdout: JSON.stringify(running), stderr: `${sheepId} never went running: the first machine did not start a turn`, code: 1 });
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
    }
    const runningAt = Date.now();
    print(`second: ${sheepId} is running`);

    // Journey 2 step 3: the first terminal is gone; the turn finishes; this machine's wait and log show the end of it.
    const waited = await ring.sheep(["wait", "--timeout", "120", sheepId]);
    const waitSeconds = ((Date.now() - runningAt) / 1000).toFixed(0);
    if (waited.code !== 0 || !waited.stdout.startsWith(`${sheepId}\t`) || !waited.stdout.includes(SECOND_TURN.text)) fail("second", `sheep wait ${sheepId}`, { ...waited, stderr: `${waited.stderr}\nexpected exit 0 and the turn's last message "${SECOND_TURN.text}"` });
    const logged = await ring.sheep(["log", sheepId]);
    if (logged.code !== 0 || !logged.stdout.includes(SECOND_PROMPT) || !logged.stdout.includes(SECOND_TURN.text)) fail("second", `sheep log ${sheepId}`, { ...logged, stderr: `${logged.stderr}\nexpected the first machine's prompt and the turn's end` });
    const tail = logged.stdout.trimEnd().split("\n").slice(-3).join(" | ");
    ok("second", `sheep wait ${sheepId}; sheep log ${sheepId}`, `the turn ended ${waitSeconds}s after it was seen running, its terminal long gone; the log ends: ${tail}`);
  } finally {
    tokenWatch.stop();
  }
  const leak = tokenWatch.line();
  if (leak) fail("second", "ps -Ao pid=,args= (polled)", { stdout: redact(leak), stderr: "the token was in a process's arguments inside the container", code: 1 });
  ok("second", "ps (polled every 15 ms from join)", `${tokenWatch.samples()} samples; the token in no process's arguments in the container`);
  print(`second: HOME holds ${readdirSync(homedir()).sort().join(", ")}; the world ${world.replace(homedir(), "~")} holds ${readdirSync(world).sort().join(", ")}`);
  print("\ninside: ok");
}

/* Journey 3 (station phase 2): a repository, on the station. */

const PLAYGROUND = "https://github.com/dglazkov/lamb-playground.git";
const PLAYGROUND_VAR = "LAMB_PLAYGROUND_TOKEN";

/**
 * Pasture's journey 1 on the station, with the faux provider: the sheep's
 * steps are a program, and the clone at birth is the cell's. Two sheep,
 * two branches on GitHub, the token nowhere the criterion names; then the
 * branches deleted with the token through a `GIT_ASKPASS` helper that
 * reads the environment, so the scratch repository is left as found.
 * Runs only with `LAMB_PLAYGROUND_TOKEN` in the ring's environment; one
 * `skip` line otherwise.
 */
async function journeyThree(ring, station, { needles }) {
  const playground = process.env[PLAYGROUND_VAR];
  if (!playground) {
    ring.skip("a8", `${PLAYGROUND_VAR} is not in the environment, so journey 3 against ${PLAYGROUND} was not walked: two sheep, two branches, the token nowhere`, "journey 3");
    return;
  }
  needles.push(playground);
  const { home, token: stationToken } = station;
  const pasture = `ring-${ring.stamp.commit.slice(0, 7)}`;
  const branch = (name) => `sheep/${pasture}-${name}`;
  const names = ["typo", "links"];
  const tasks = { typo: "Fix the typo in README.md on a branch, commit, push.", links: "Fix the dead links in docs/ on a branch, commit, push." };
  const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const lsRemote = () => {
    const done = spawnSync("git", ["ls-remote", PLAYGROUND, `refs/heads/${branch("*")}`], { encoding: "utf8", env: gitEnv, cwd: ring.blog });
    if (done.status !== 0) throw new Error(`git ls-remote ${PLAYGROUND} failed: ${(done.stderr || "").trim()}`);
    return (done.stdout || "").trim().split("\n").filter(Boolean).map((line) => line.split("\t")[1].replace(/^refs\/heads\//, ""));
  };
  // The helper: git asks it for the username and the password; it answers from the environment the delete runs with, and never from a URL.
  const askpass = join(ring.dir, "askpass.sh");
  writeFileSync(askpass, `#!/bin/sh\ncase "$1" in\n  Username*) printf '%s\\n' x-access-token ;;\n  *) printf '%s\\n' "$${PLAYGROUND_VAR}" ;;\nesac\n`, { mode: 0o700 });
  const deleteBranches = () => {
    const results = [];
    for (const name of names) {
      const done = spawnSync("git", ["push", "--delete", PLAYGROUND, branch(name)], { encoding: "utf8", cwd: ring.blog, env: { ...gitEnv, GIT_ASKPASS: askpass, [PLAYGROUND_VAR]: playground } });
      results.push(`${branch(name)}: ${done.status === 0 ? "deleted" : `not deleted (exit ${done.status}: ${(done.stderr || "").trim().split("\n").at(-1) ?? ""})`}`);
    }
    return results;
  };
  const started = Date.now();
  const ids = {};
  let pushed = false;
  try {
    // Step 1: the pasture on the scratch repository, the token into its secret on stdin, the brief put.
    const before = lsRemote();
    if (before.length > 0) ring.fail("a8", `git ls-remote ${PLAYGROUND} refs/heads/${branch("*")}`, { stdout: before.join("\n"), stderr: `branches of this ring's name are already on the repository; a ring that left them behind failed: git push --delete ${PLAYGROUND} ${before.join(" ")}`, code: 1 });
    const made = await ring.sheep(["pasture", "new", pasture, "--repo", PLAYGROUND]);
    if (made.code !== 0 || !made.stdout.startsWith(`${pasture}\t${PLAYGROUND}\t`)) ring.fail("a8", `sheep pasture new ${pasture} --repo ${PLAYGROUND}`, made);
    const secret = await ring.sheep(["pasture", "secret", "set", pasture, "GIT_TOKEN"], { input: `${playground}\n` });
    if (secret.code !== 0 || secret.stdout !== `${pasture}\tGIT_TOKEN\n`) ring.fail("a8", `sheep pasture secret set ${pasture} GIT_TOKEN (the token on stdin)`, { ...secret, stdout: secret.stdout.split(playground).join("<token>"), stderr: secret.stderr.split(playground).join("<token>") });
    const secretNames = await ring.sheep(["pasture", "secret", "ls", pasture]);
    if (secretNames.code !== 0 || secretNames.stdout !== "GIT_TOKEN\n") ring.fail("a8", `sheep pasture secret ls ${pasture}`, secretNames);
    const brief = `# ${pasture}\n\nA scratch repository. Make a branch, one small change under notes/, commit, name the branch in /pasture/notes/<your name>.md, push.\n`;
    const put = await ring.sheep(["pasture", "put", pasture, "BRIEF.md"], { input: brief });
    if (put.code !== 0) ring.fail("a8", `sheep pasture put ${pasture} BRIEF.md`, put);

    // Step 4: each sheep born detached into the pasture (the cell clones at birth, before any turn), given its program, then its task.
    for (const name of names) {
      const born = await ring.sheep(["new", "--pasture", pasture, "--name", name, "--detach"]);
      const id = born.stdout.trim();
      if (born.code !== 0 || !/^[0-9a-f-]{36}$/.test(id)) ring.fail("a8", `sheep new --pasture ${pasture} --name ${name} --detach`, born);
      ids[name] = id;
      const program = {
        steps: [
          { tool: { name: "bash", args: { command: `git checkout -b ${branch(name)}` } } },
          { tool: { name: "bash", args: { command: `mkdir -p notes && printf 'The %s sheep of the account ring at %s was here.\\n' ${name} ${ring.stamp.commit} > notes/${name}.md && git add -A && git commit -q -m "ring ${ring.stamp.commit}: ${name}"` } } },
          { tool: { name: "bash", args: { command: `printf '${branch(name)}\\n' | pasture put notes/${name}.md` } } },
          { tool: { name: "bash", args: { command: `git push -u origin ${branch(name)}` } } },
          { text: `pushed ${branch(name)}` },
        ],
      };
      const posted = await fetch(`${home}/s/${encodeURIComponent(id)}/faux`, { method: "POST", headers: { authorization: `Bearer ${stationToken}`, "content-type": "application/json" }, body: JSON.stringify(program), signal: AbortSignal.timeout(30_000) });
      if (posted.status !== 200) ring.fail("a8", `POST /s/${id}/faux`, { stdout: await posted.text(), stderr: `status ${posted.status}`, code: 1 });
      const asked = await ring.sheep(["attach", id, "--detach", "--", tasks[name]]);
      if (asked.code !== 0) ring.fail("a8", `sheep attach ${id} --detach -- "${tasks[name]}"`, asked);
    }
    pushed = true;
    // Step 5: both turns end; the last message of each names its branch.
    const waited = await ring.sheep(["wait", "--timeout", "300", ids.typo, ids.links]);
    for (const name of names) {
      if (waited.code !== 0 || !waited.stdout.includes(`${ids[name]}\tpushed ${branch(name)}`)) ring.fail("a8", `sheep wait ${ids.typo} ${ids.links}`, { ...waited, stderr: `${waited.stderr}\nexpected ${ids[name]} to end with "pushed ${branch(name)}"` });
    }
    const workSeconds = ((Date.now() - started) / 1000).toFixed(0);

    // Step 6: the herd, and the pasture column.
    const herd = await ring.sheep(["pasture", pasture]);
    if (herd.code !== 0) ring.fail("a8", `sheep pasture ${pasture}`, herd);
    const herdRows = herd.stdout.trimEnd().split("\n").slice(4).map((row) => row.split("\t"));
    for (const name of names) {
      const row = herdRows.find((candidate) => candidate[0] === ids[name]);
      if (row === undefined || row[1] !== name || row[2] !== "idle" || row[4] !== tasks[name]) ring.fail("a8", `sheep pasture ${pasture}`, { ...herd, stderr: `${herd.stderr}\nexpected ${ids[name]}\t${name}\tidle\t…\t${tasks[name]}` });
    }
    if (!herd.stdout.startsWith(`name: ${pasture}\nrepo: ${PLAYGROUND}\n`)) ring.fail("a8", `sheep pasture ${pasture}`, { ...herd, stderr: `${herd.stderr}\nexpected the meta to name ${PLAYGROUND}` });
    const inPasture = JSON.parse((await ring.sheep(["ls", "--pasture", pasture, "--json"])).stdout).map((row) => row.id).sort();
    if (JSON.stringify(inPasture) !== JSON.stringify(Object.values(ids).sort())) ring.fail("a8", `sheep ls --pasture ${pasture} --json`, { stdout: inPasture.join("\n"), stderr: `expected exactly ${Object.values(ids).join(", ")}`, code: 1 });

    // Step 8: the note names the branch, and both branches are on GitHub, seen anonymously from this laptop.
    const note = await ring.sheep(["pasture", "cat", pasture, "notes/typo.md"]);
    if (note.code !== 0 || note.stdout !== `${branch("typo")}\n`) ring.fail("a8", `sheep pasture cat ${pasture} notes/typo.md`, { ...note, stderr: `${note.stderr}\nexpected "${branch("typo")}"` });
    const onGitHub = lsRemote().sort();
    if (JSON.stringify(onGitHub) !== JSON.stringify(names.map(branch).sort())) ring.fail("a8", `git ls-remote ${PLAYGROUND} refs/heads/${branch("*")}`, { stdout: onGitHub.join("\n"), stderr: `expected ${names.map(branch).join(" and ")}`, code: 1 });

    // The criterion: the token is in no transcript, no export, and no process's arguments (the watch runs on).
    const logs = {};
    for (const name of names) {
      const logged = await ring.sheep(["log", ids[name]]);
      if (logged.code !== 0) ring.fail("a8", `sheep log ${ids[name]}`, logged);
      if (logged.stdout.includes(playground)) ring.fail("a8", `sheep log ${ids[name]}`, { stdout: "(withheld)", stderr: "the repository's token is in the transcript", code: 1 });
      if (!/git clone/.test(logged.stdout) || !logged.stdout.includes(`pushed ${branch(name)}`)) ring.fail("a8", `sheep log ${ids[name]}`, { ...logged, stderr: `${logged.stderr}\nexpected the birth's git clone and the push` });
      logs[name] = logged.stdout;
    }
    const file = join(ring.dir, `${ids.typo}.sqlite`);
    const exported = await ring.sheep(["export", ids.typo, file]);
    if (exported.code !== 0 || !existsSync(file)) ring.fail("a8", `sheep export ${ids.typo} ${file}`, exported);
    if (readFileSync(file).includes(playground)) ring.fail("a8", `grep <token> ${file}`, { stdout: "(withheld)", stderr: "the repository's token is in the export's bytes", code: 1 });
    const clonedIn = /git clone[^\n]*/.exec(logs.typo)?.[0] ?? "git clone";
    ring.ok("a8", `sheep pasture new ${pasture} --repo …lamb-playground.git; secret set GIT_TOKEN (stdin); put BRIEF.md; sheep new --pasture ${pasture} --name typo|links --detach; sheep wait`, `${workSeconds}s; born ${ids.typo} (typo) and ${ids.links} (links), each cloning at birth ("${clonedIn.slice(0, 60)}"), each pushing; the herd lists both idle with their tasks; notes/typo.md says ${branch("typo")}`);
    ring.ok("a8", `git ls-remote ${PLAYGROUND} 'refs/heads/${branch("*")}' (anonymous, from this laptop)`, `${onGitHub.join(", ")}`);
    ring.ok("a8", `sheep log ${ids.typo}; sheep log ${ids.links}; sheep export ${ids.typo}`, `the repository's token in neither transcript, not in the export's bytes (${readFileSync(file).length} bytes), and, by the poll, in no process's arguments`);
    console.log(`  the container the sheep worked in was ${station.image}${station.applicationImage !== undefined ? ` (the application's configured image)` : ""}`);
  } finally {
    if (pushed) {
      const deleted = deleteBranches();
      const left = lsRemote();
      console.log(`  ${PLAYGROUND}: ${deleted.join("; ")}; ${left.length === 0 ? "no branches of this ring's name remain" : `STILL THERE: ${left.join(", ")}`}`);
      if (left.length > 0) ring.unchecked.push(`journey 3: the scratch repository is not as found: ${left.join(", ")} remain; git push --delete ${PLAYGROUND} ${left.join(" ")}`);
    }
    rmSync(askpass, { force: true });
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { ring: ringName, ref, repo, spec, commit, keep } = parsed;
  if (ringName === "machine") {
    await machineRing(parsed);
    return;
  }
  if (ringName === "dog") {
    if (parsed.inside) await dogInside(parsed);
    else await dogRing(parsed);
    return;
  }
  if (ringName === "account") {
    if (parsed.second) await secondInside(parsed);
    else await accountRing(parsed);
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
