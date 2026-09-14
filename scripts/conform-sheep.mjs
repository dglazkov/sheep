#!/usr/bin/env node
/**
 * The bridge (drove phase 1): the harness command town's conformance
 * script runs, so the checks it makes of a harness are made of the `town`
 * program in a sheep's shell. Written from town's `docs/harness.md` and
 * drove's design, "The bridge"; nothing of town's is read.
 *
 *   node scripts/conform-sheep.mjs --kennel <dir> --state <dir> [words…]
 *   node scripts/conform-sheep.mjs --state <dir> --teardown
 *
 * It is two things and no more.
 *
 * The mapping. `TOWN_GRANT`, as the script sets it for a check or leaves it
 * unset, names the sheep that answers: one sheep per distinct value, minted
 * on first use with `sheep new --secret TOWN_GRANT --detach` and that value
 * on stdin, or `sheep new --detach` with no secret when it is unset, kept in
 * `--state`'s `bridge.json` by the value's SHA-256 and reused. The script
 * runs checks at once, so the look-up and the mint are under a lock in the
 * state directory, and two checks with one value share one sheep. A value that
 * parses as JSON is compacted first, as a dog's `jq -c .` does, since a
 * sheep's secret is one line and townd prints a grant indented; one that
 * does not is sent as given. The home is the kennel's, read from
 * `<kennel>/config` by path since the script runs under an empty `HOME`,
 * else `SHEEP_HOME` and `SHEEP_TOKEN`; with neither, the bridge refuses and
 * asks no home anything. The state records the kennel or home it minted on
 * beside the ids, so `--teardown` ends every sheep the state names with
 * nothing else given.
 *
 * §4 on the laptop. Stdin is read to its end when it is a pipe or a regular
 * file and left alone when it is anything else; the bytes read are the
 * peek's stdin, as read. Whether to read is all the bridge decides: whether
 * the bytes are text is the program's, after it has found the grant, as §7
 * orders the two.
 *
 * Every other check's behaviour is the cell's: the words go to `sheep sh
 * <id> -- town <words>`, each quoted for the shell, and the verb's stdout,
 * stderr, and exit code are this process's, unread.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHEEP = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cli", "bin", "sheep.js");
const STATE_FILE = "bridge.json";
const GRANT = "TOWN_GRANT";

/** The bridge's own refusals: one line on stderr, exit 2, before anything is asked of a home. */
function refuse(line) {
  process.stderr.write(`conform-sheep: ${line}\n`);
  return 2;
}

/** `--kennel`, `--state`, and `--teardown` before the words; the rest are the check's words, every one of them, as given. */
function parse(argv) {
  const options = { words: [] };
  let index = 0;
  for (; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--kennel" || arg === "--state") {
      const value = argv[index + 1];
      if (value === undefined) return { refused: `${arg} needs a directory` };
      options[arg.slice(2)] = resolve(value);
      index++;
    } else if (arg === "--teardown") options.teardown = true;
    else break;
  }
  options.words = argv.slice(index);
  return options;
}

/** The home to mint on and peek at: the kennel's config, else the environment; `refused` with neither. */
function homeOf(kennel) {
  if (kennel !== undefined) {
    let config;
    try {
      config = JSON.parse(readFileSync(join(kennel, "config"), "utf8"));
    } catch (error) {
      return { refused: `the kennel ${kennel} has no readable config (${error instanceof Error ? error.message : String(error)}); run \`sheep home local\` there first` };
    }
    if (typeof config?.home !== "string" || config.home === "" || typeof config?.token !== "string" || config.token === "") return { refused: `the kennel ${kennel}'s config names no home and token` };
    return { home: config.home, token: config.token, named: { kennel } };
  }
  const home = process.env.SHEEP_HOME;
  const token = process.env.SHEEP_TOKEN;
  if (!home || !token) return { refused: "no home: give --kennel <dir>, or set SHEEP_HOME and SHEEP_TOKEN; the bridge never falls back to another" };
  return { home, token, named: { home } };
}

/** Whether a process is alive: a lock whose holder is gone is broken rather than waited on. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/**
 * The state's lock: a directory made atomically, holding the holder's pid,
 * waited for while another live bridge holds it and broken when its holder
 * is gone (a check the script killed mid-mint). Released by the returned
 * function.
 */
async function lock(dir) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "bridge.lock");
  for (;;) {
    try {
      mkdirSync(path);
      writeFileSync(join(path, "pid"), String(process.pid));
      return () => rmSync(path, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let holder;
      try {
        holder = Number(readFileSync(join(path, "pid"), "utf8"));
      } catch {
        // Made and not yet written, or removed under us: a moment, then again, unless it has been that way a while.
        try {
          if (Date.now() - statSync(path).mtimeMs > 5_000) rmSync(path, { recursive: true, force: true });
        } catch {
          // gone already
        }
      }
      if (holder !== undefined && Number.isInteger(holder) && holder > 0 && !alive(holder)) rmSync(path, { recursive: true, force: true });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    }
  }
}

function readState(dir) {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, STATE_FILE), "utf8"));
    return { at: parsed.at ?? null, sheep: parsed.sheep ?? {} };
  } catch {
    return { at: null, sheep: {} };
  }
}

function writeState(dir, state) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, STATE_FILE);
  const scratch = `${file}.${process.pid}`;
  writeFileSync(scratch, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(scratch, file);
}

/** The value a sheep is minted with: compacted when it parses as JSON, as given otherwise; `undefined` when unset. */
export function mintValue(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value;
  }
}

/** The state's key for a value: the SHA-256 of what the sheep is minted with, or `unset`. Never the value. */
export function keyOf(value) {
  return value === undefined ? "unset" : `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** A word quoted for the shell: single quotes around it, each single quote inside closed, escaped, and opened again. */
export function quote(word) {
  return `'${word.replaceAll("'", `'\\''`)}'`;
}

/** The line a check's words make: `town` and each word quoted. */
export function lineOf(words) {
  return ["town", ...words.map(quote)].join(" ");
}

/** The built command, run against one home, with this process's environment less every `TOWN_*` name and the tip off. */
function sheep(home, args, stdio) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("TOWN_")));
  return spawn(process.execPath, [SHEEP, ...args], { env: { ...env, SHEEP_HOME: home.home, SHEEP_TOKEN: home.token, SHEEP_TIP: "0", NODE_NO_WARNINGS: "1" }, stdio });
}

/** One run of the command, collected: stdin given as text, or none. */
function collect(home, args, input) {
  return new Promise((resolvePromise, reject) => {
    const child = sheep(home, args, [input === undefined ? "ignore" : "pipe", "pipe", "pipe"]);
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code: code ?? 1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
    if (input !== undefined) child.stdin.end(input);
  });
}

/** Stdin for §4: the bytes when fd 0 is a pipe or a regular file, `undefined` when it is anything else. */
function readStdin() {
  let kind;
  try {
    kind = fstatSync(0);
  } catch {
    return undefined;
  }
  if (!kind.isFIFO() && !kind.isFile()) return undefined;
  const chunks = [];
  const buffer = Buffer.alloc(256 * 1024);
  for (;;) {
    let read;
    try {
      read = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (error?.code === "EAGAIN") {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        continue;
      }
      throw error;
    }
    if (read === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, read)));
  }
  return Buffer.concat(chunks);
}

async function teardown(stateDir) {
  const release = await lock(stateDir);
  try {
    return await endAll(stateDir);
  } finally {
    release();
  }
}

async function endAll(stateDir) {
  const state = readState(stateDir);
  const ids = Object.values(state.sheep);
  if (ids.length === 0) {
    process.stdout.write("nothing to end\n");
    return 0;
  }
  if (state.at === null) return refuse(`the state in ${stateDir} names ${ids.length} sheep and no home they were minted on`);
  const home = homeOf(state.at.kennel);
  if ("refused" in home) return refuse(home.refused);
  if (state.at.home !== undefined && home.home !== state.at.home) return refuse(`the state's sheep were minted on ${state.at.home}, and SHEEP_HOME names ${home.home}`);
  let failed = 0;
  const left = { ...state.sheep };
  for (const [key, id] of Object.entries(state.sheep)) {
    const ended = await collect(home, ["rm", id]);
    const gone = ended.code === 0 || ended.stderr.includes(`no session ${id} at this home`);
    if (gone) delete left[key];
    else failed++;
    process.stdout.write(ended.code === 0 ? ended.stdout : `${id}\t${gone ? "already gone" : `not ended: ${ended.stderr.trim()}`}\n`);
  }
  writeState(stateDir, { at: Object.keys(left).length === 0 ? null : state.at, sheep: left });
  return failed === 0 ? 0 : 1;
}

async function main(argv) {
  const options = parse(argv);
  if ("refused" in options) return refuse(options.refused);
  if (options.state === undefined) return refuse("--state <dir> is where the bridge keeps its sheep; give one");
  if (options.teardown) return teardown(options.state);

  const home = homeOf(options.kennel);
  if ("refused" in home) return refuse(home.refused);

  // §4 on the laptop: read what a pipe or a file gave, and nothing else; the bytes go to the peek as they are.
  const bytes = readStdin();
  const stdin = bytes !== undefined && bytes.length > 0 ? bytes : undefined;

  // The mapping: this value's sheep, minted on first use, the look-up and the mint under the state's lock.
  const value = mintValue(process.env[GRANT]);
  const key = keyOf(value);
  let id;
  const release = await lock(options.state);
  try {
    const state = readState(options.state);
    if (state.at !== null && JSON.stringify(state.at) !== JSON.stringify(home.named)) {
      return refuse(`the state in ${options.state} is for ${state.at.kennel ?? state.at.home}, not ${home.named.kennel ?? home.named.home}; tear it down or give another --state`);
    }
    id = state.sheep[key];
    if (id === undefined) {
      const minted = await collect(home, value === undefined ? ["new", "--detach"] : ["new", "--secret", GRANT, "--detach"], value === undefined ? undefined : `${value}\n`);
      const printed = minted.stdout.trim();
      // The mint's refusal is the verb's words, which never hold a value; a mint that printed no id is the bridge's failure, exit 2.
      if (minted.code !== 0 || !/^[0-9a-f-]{36}$/.test(printed)) {
        process.stderr.write(minted.stderr);
        return refuse(`the mint did not print an id (exit ${minted.code})`);
      }
      id = printed;
      writeState(options.state, { at: home.named, sheep: { ...state.sheep, [key]: id } });
    }
  } finally {
    release();
  }

  // The peek: the verb's stdin is a regular file holding what was read, so the verb reads it as a dog's pipe is read.
  let input = "ignore";
  let scratch;
  if (stdin !== undefined) {
    scratch = join(tmpdir(), `conform-sheep-${process.pid}-${Date.now()}.stdin`);
    writeFileSync(scratch, stdin, { mode: 0o600 });
    input = openSync(scratch, "r");
  }
  try {
    const child = sheep(home, ["sh", id, "--", lineOf(options.words)], [input, "inherit", "inherit"]);
    return await new Promise((resolvePromise, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolvePromise(code ?? (signal === null ? 1 : 128)));
    });
  } finally {
    if (typeof input === "number") closeSync(input);
    if (scratch !== undefined) rmSync(scratch, { force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
