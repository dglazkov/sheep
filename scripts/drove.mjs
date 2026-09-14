#!/usr/bin/env node
/**
 * The stage (drove phase 2): the walk's set-up and strike, so the walk is
 * the conductor's reading and every later walk is one command. Written from
 * drove's design, "The stage", and journey 5. It runs two commands, `sheep`
 * from this checkout and `townd` from the path `--townd` names, each a child
 * process whose exit is read, and reads neither's files.
 *
 *   node scripts/drove.mjs --box <url> --user <name> --repo <owner/name> --issue <n> [--townd <path>] [--kennel <dir>] [--keep]
 *   node scripts/drove.mjs --status <root>
 *   node scripts/drove.mjs --teardown <root>
 *   node scripts/drove.mjs --search <id> [--kennel <dir>] < token
 *
 * The walk, in order. Two readings that make nothing: `shop ls` on the box,
 * which must hold `town/memory` and `town/github`, and `credential ls --user`,
 * which must name exactly one active `github-token` for the user; either
 * refusal is exit 2 before any pass, root, or sheep. Then a root under the
 * system's temporary directory; `pass new` for the user, expiring in a day
 * so a walk killed mid-way leaves no standing pass; a grant at `town/memory`
 * and one at `town/github`'s `reply` and `show`, the repository held to the
 * one given, on that credential. The grant townd printed is parsed here,
 * compacted to one line, and written to `sheep new --secret TOWN_GRANT
 * --detach`'s stdin; it is never an argument, never an environment variable,
 * never a file. The sentence goes with `sheep attach <id> --detach`, and
 * `sheep wait --timeout` holds the walk until the turn ends. Then the reading:
 * `sheep log --json` and `townd admin --town <box> audit --pass <id>` to the
 * root, the calls the transcript shows at the memory and github shops, and
 * the search. Then `pass revoke` and `sheep rm`, both unless `--keep`, which
 * leaves the pass and the sheep for the conductor and for `--teardown`.
 *
 * The search is the four places the design names, each read through the
 * built command and looked through for the token's bytes: the log, the
 * export (the file's bytes and every cell of every table), the status, and
 * the peek's `env`. A place that cannot be read is not clean. `--search`
 * runs it alone over a sheep, the token on stdin.
 *
 * The root holds `walk.json`, `log.jsonl`, `audit.txt`, and `report.txt`,
 * and never the token: every write is looked through first, and a match is
 * written as `[the token]` and said in the report. Exit 0 is a walk whose
 * every child exited 0, whose audit holds `memory remember` and `github
 * reply` at `ok`, and whose search is clean; 1 is any other walk; 2 is a
 * refusal that made nothing.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHEEP = join(REPO, "packages", "cli", "bin", "sheep.js");
const WAIT_SECONDS = 900;
const USAGE = `usage:
  node scripts/drove.mjs --box <url> --user <name> --repo <owner/name> --issue <n> [--townd <path>] [--kennel <dir>] [--keep]
  node scripts/drove.mjs --status <root>
  node scripts/drove.mjs --teardown <root>
  node scripts/drove.mjs --search <id> [--kennel <dir>] < token
--townd defaults to townd on PATH; --kennel to this checkout's .sheep, read by path and never another.
`;

function refuse(line) {
  process.stderr.write(`drove: ${line}\n`);
  return 2;
}

// ---------------------------------------------------------------------------
// Children

/** One child, collected: its stdout as bytes, its stderr as text, its exit; stdin given as text, or none. */
function run(command, args, { env, input } = {}) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, { env, cwd: tmpdir(), stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    } catch (error) {
      resolvePromise({ code: 127, stdout: Buffer.alloc(0), stderr: `${error instanceof Error ? error.message : String(error)}\n` });
      return;
    }
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.once("error", (error) => resolvePromise({ code: 127, stdout: Buffer.alloc(0), stderr: `${error.message}\n` }));
    child.once("close", (code, signal) => resolvePromise({ code: code ?? (signal === null ? 1 : 128), stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8") }));
    if (input !== undefined) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}

/** The kennel's home, read from `<kennel>/config` by path; never `~/.sheep` unless it is the kennel named. */
export function homeOf(kennel) {
  let config;
  try {
    config = JSON.parse(readFileSync(join(kennel, "config"), "utf8"));
  } catch (error) {
    return { refused: `the kennel ${kennel} has no readable config (${error instanceof Error ? error.message : String(error)}); deploy its station, or give --kennel` };
  }
  if (typeof config?.home !== "string" || config.home === "" || typeof config?.token !== "string" || config.token === "") return { refused: `the kennel ${kennel}'s config names no home and token` };
  return { home: config.home, token: config.token, kennel };
}

/** The built `sheep` against one home: this environment less every `TOWN_*` name, the tip off. */
export function sheepRunner(home) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("TOWN_")));
  const childEnv = { ...env, SHEEP_HOME: home.home, SHEEP_TOKEN: home.token, SHEEP_TIP: "0", NODE_NO_WARNINGS: "1" };
  return (args, input) => run(process.execPath, [SHEEP, ...args], { env: childEnv, input });
}

/** `townd admin --town <box>` from the path given: a `.js` file through this node, anything else as a program. The operator's token is townd's to read. */
function towndRunner(townd, box) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "TOWN_GRANT" && name !== "TOWN_DATA"));
  const script = /\.[cm]?js$/.test(townd);
  return (args, input) => run(script ? process.execPath : townd, [...(script ? [townd] : []), "admin", "--town", box, ...args], { env, input });
}

/** A table townd prints: the header's names at their columns, each row cut at them. */
export function table(text) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];
  const header = lines[0];
  const columns = [];
  const pattern = /\S+(?: \S+)*/g;
  for (let match = pattern.exec(header); match !== null; match = pattern.exec(header)) columns.push({ name: match[0], at: match.index });
  return lines.slice(1).map((line) => Object.fromEntries(columns.map((column, index) => [column.name, line.slice(column.at, columns[index + 1]?.at ?? line.length).trim()])));
}

// ---------------------------------------------------------------------------
// The search

/** Where `needle` is in `bytes`: one `label line <n>` per line holding it. */
function linesHolding(label, bytes, needle) {
  const hits = [];
  let from = 0;
  for (let at = bytes.indexOf(needle, from); at !== -1; at = bytes.indexOf(needle, from)) {
    const line = bytes.subarray(0, at).toString("latin1").split("\n").length;
    const hit = `${label} line ${line}`;
    if (!hits.includes(hit)) hits.push(hit);
    from = at + 1;
  }
  return hits;
}

/** The export's every cell, through node:sqlite, so a value split across a page is seen whole; its experimental warning kept off stderr. */
export async function cellsHolding(file, needle) {
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => (String(warning).includes("SQLite") ? undefined : emit.call(process, warning, ...rest));
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } finally {
    process.emitWarning = emit;
  }
  const db = new DatabaseSync(file, { readOnly: true });
  const hits = [];
  try {
    // Every table whatever its shape: pi's are WITHOUT ROWID, so a row is named by its primary key, or by its ordinal when it has none.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name));
    for (const name of tables) {
      const key = db.prepare("SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk").all(name).map((column) => String(column.name));
      let ordinal = 0;
      for (const row of db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).iterate()) {
        ordinal++;
        for (const [column, value] of Object.entries(row)) {
          if (value === null) continue;
          const bytes = value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(String(value), "utf8");
          if (!bytes.includes(needle)) continue;
          // A key column that itself holds the token is named by ordinal, so the hit never repeats the token.
          const named = key.length > 0 && key.every((column) => !Buffer.from(String(row[column]), "utf8").includes(needle));
          hits.push(`export table ${name} column ${column} ${named ? `row ${key.map((column) => `${column}=${String(row[column])}`).join(" ")}` : `row #${ordinal}`}`);
        }
      }
    }
  } finally {
    db.close();
  }
  return hits;
}

/**
 * The places the search reads, in the design's order. Each reads through
 * the built command and answers the text it read (for the log, so the stage
 * can keep it) and where the token's bytes are in it. A read whose command
 * did not exit 0 is `unread`, which is not clean.
 */
export const PLACES = [
  {
    name: "log",
    says: "the log",
    async read(sheep, id, needle) {
      const got = await sheep(["log", "--json", id]);
      if (got.code !== 0) return { unread: `sheep log --json exited ${got.code}: ${got.stderr.trim()}` };
      return { text: got.stdout.toString("utf8"), hits: [...linesHolding("log", got.stdout, needle), ...linesHolding("log's stderr", Buffer.from(got.stderr), needle)] };
    },
  },
  {
    name: "export",
    says: "the export",
    async read(sheep, id, needle) {
      const dir = mkdtempSync(join(tmpdir(), "drove-export-"));
      try {
        const file = join(dir, `${id}.sqlite`);
        const got = await sheep(["export", id, file]);
        if (got.code !== 0) return { unread: `sheep export exited ${got.code}: ${got.stderr.trim()}` };
        const bytes = readFileSync(file);
        const hits = [...linesHolding("export's stdout", got.stdout, needle), ...linesHolding("export's stderr", Buffer.from(got.stderr), needle)];
        for (let at = bytes.indexOf(needle); at !== -1; at = bytes.indexOf(needle, at + 1)) hits.push(`export file offset ${at}`);
        hits.push(...(await cellsHolding(file, needle)));
        return { hits };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: "status",
    says: "the status",
    async read(sheep, id, needle) {
      const got = await sheep(["status", id]);
      if (got.code !== 0) return { unread: `sheep status exited ${got.code}: ${got.stderr.trim()}` };
      return { hits: [...linesHolding("status", got.stdout, needle), ...linesHolding("status's stderr", Buffer.from(got.stderr), needle)] };
    },
  },
  {
    name: "env",
    says: "the shell's environment",
    async read(sheep, id, needle) {
      const got = await sheep(["sh", id, "--", "env"]);
      if (got.code !== 0) return { unread: `sheep sh -- env exited ${got.code}: ${got.stderr.trim()}` };
      return { hits: [...linesHolding("env", got.stdout, needle), ...linesHolding("env's stderr", Buffer.from(got.stderr), needle)] };
    },
  },
];

/** A list said as prose: `a`, `a and b`, `a, b, and c`. */
function prose(items) {
  return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/**
 * The search over one sheep and one token: every place read, the token's
 * bytes looked for, and the verdict. `clean` only when every place was read
 * and none holds them. The verdict names the places it read, so a search
 * that reads fewer says so.
 */
export async function search(sheep, id, token, places = PLACES) {
  const needle = Buffer.from(token, "utf8");
  if (needle.length === 0) throw new Error("the search needs a token");
  const results = [];
  for (const place of places) {
    // A place that throws is a place that could not be read: named, and the verdict not clean. The message is scrubbed, so a refusal never carries the token.
    try {
      results.push({ place, ...(await place.read(sheep, id, needle)) });
    } catch (error) {
      results.push({ place, unread: (error instanceof Error ? error.message : String(error)).replaceAll(token, "[the token]") });
    }
  }
  const unread = results.filter((result) => result.unread !== undefined);
  const hits = results.flatMap((result) => result.hits ?? []);
  const clean = unread.length === 0 && hits.length === 0;
  const lines = [];
  if (hits.length === 0) lines.push(`search: the token's bytes were found in none of ${prose(results.filter((result) => result.unread === undefined).map((result) => result.place.says))}`);
  else lines.push(`search: the token's bytes WERE FOUND: ${hits.join("; ")}`);
  for (const result of unread) lines.push(`search: ${result.place.says} could not be read, so the search is not clean (${result.unread})`);
  return { clean, hits, lines, log: results.find((result) => result.place.name === "log")?.text };
}

// ---------------------------------------------------------------------------
// The root

function scrub(text, token) {
  return text.includes(token) ? { text: text.replaceAll(token, "[the token]"), scrubbed: true } : { text, scrubbed: false };
}

function readWalk(root) {
  let walk;
  try {
    if (!statSync(root).isDirectory()) return { refused: `${root} is not a directory` };
    walk = JSON.parse(readFileSync(join(root, "walk.json"), "utf8"));
  } catch (error) {
    return { refused: `no walk at ${root} (${error instanceof Error ? error.message : String(error)})` };
  }
  if (walk?.drove !== 1) return { refused: `${root}/walk.json is not a drove walk's` };
  return { walk };
}

function writeWalk(root, walk) {
  writeFileSync(join(root, "walk.json"), `${JSON.stringify(walk, null, 2)}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// The sentence

/** The walk's sentence: the same run every run, the key and the issue its only words that change. */
export function sentenceOf({ walk, repo, issue }) {
  return [
    "You have `town` in your shell: a program that reaches a town, whose shops act for you under a grant you carry and never see.",
    `This is drove's walk ${walk}. Do these in order, each in your shell:`,
    "1. Run `town` with no words and read what it can do; `town <shop> --help` shows a shop's commands.",
    `2. With the memory shop, remember one line about this walk under the key \`drove/${walk}\`: a sentence saying this is drove's walk ${walk}, commenting on ${repo}#${issue}.`,
    `3. With the github shop, reply on issue ${issue} of ${repo} with a short comment that says what you remembered and holds the line itself.`,
    "4. Answer with two things, exactly as the shops printed them: what the github shop printed for the comment, and the line the memory shop holds.",
  ].join("\n");
}

/** The calls the transcript shows at the memory and github shops: each bash call whose line is `town … memory remember` or `town … github reply`, with its result. */
export function leftBy(logText) {
  const calls = new Map();
  const left = [];
  for (const line of logText.split("\n")) {
    if (line.trim() === "") continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = entry?.message;
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        const command = part?.type === "toolCall" && part.name === "bash" ? part.arguments?.command : undefined;
        if (typeof command === "string" && /\btown\b[^\n]*\b(memory\s+remember|github\s+reply)\b/.test(command)) calls.set(part.id, command);
      }
    }
    if (message?.role === "toolResult" && calls.has(message.toolCallId)) {
      const text = (message.content ?? []).filter((part) => part?.type === "text").map((part) => part.text).join("");
      left.push({ command: calls.get(message.toolCallId), result: text.trim(), isError: message.isError === true });
    }
  }
  return left;
}

const indent = (text) => text.split("\n").map((line) => `  ${line}`).join("\n");

// ---------------------------------------------------------------------------
// The verbs

function parse(argv) {
  const options = { keep: false };
  const takes = new Set(["--box", "--user", "--repo", "--issue", "--townd", "--kennel", "--status", "--teardown", "--search"]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--keep") options.keep = true;
    else if (takes.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) return { refused: `${arg} needs a value` };
      options[arg.slice(2)] = value;
      index++;
    } else return { refused: `unknown argument: ${arg}` };
  }
  return options;
}

async function walkVerb(options) {
  const missing = ["box", "user", "repo", "issue"].filter((name) => options[name] === undefined);
  if (missing.length > 0) return refuse(`the walk needs ${prose(missing.map((name) => `--${name}`))}\n${USAGE}`);
  let box;
  try {
    const url = new URL(options.box);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("not http");
    box = url.origin;
  } catch {
    return refuse(`--box is a town's address, http or https, not ${options.box}`);
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(options.user)) return refuse(`--user is a town user's name, not ${options.user}`);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repo)) return refuse(`--repo is owner/name, not ${options.repo}`);
  if (!/^[1-9][0-9]*$/.test(options.issue)) return refuse(`--issue is an issue's number, not ${options.issue}`);
  const kennel = resolve(options.kennel ?? join(REPO, ".sheep"));
  const home = homeOf(kennel);
  if ("refused" in home) return refuse(home.refused);
  const townd = options.townd === undefined ? "townd" : /[\\/]/.test(options.townd) ? resolve(options.townd) : options.townd;
  const admin = towndRunner(townd, box);
  const sheep = sheepRunner(home);
  const out = (text) => process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);

  // Two readings that make nothing, and refuse before anything is made.
  const shops = await admin(["shop", "ls"]);
  if (shops.code !== 0) return refuse(`townd admin --town ${box} shop ls exited ${shops.code}: ${shops.stderr.trim()}`);
  const held = table(shops.stdout.toString("utf8")).map((row) => row.name);
  const lacking = ["town/memory", "town/github"].filter((name) => !held.includes(name));
  const credentials = await admin(["credential", "ls", "--user", options.user]);
  if (credentials.code !== 0) return refuse(`townd admin --town ${box} credential ls --user ${options.user} exited ${credentials.code}: ${credentials.stderr.trim()}`);
  const tokens = table(credentials.stdout.toString("utf8")).filter((row) => row.user === options.user && row.type === "github-token" && row.state === "active");
  const wrong = [];
  if (lacking.length > 0) wrong.push(`the box at ${box} holds no ${prose(lacking)} (it holds ${held.join(", ") || "no shop"})`);
  if (tokens.length === 0) wrong.push(`${options.user} holds no active github-token credential on ${box}`);
  if (tokens.length > 1) wrong.push(`${options.user} holds ${tokens.length} active github-token credentials on ${box} (${tokens.map((row) => row.id).join(", ")}), and the stage does not guess`);
  if (wrong.length > 0) return refuse(`${wrong.join("; ")}; a shop and a credential are the operator's to add, and nothing was made`);
  const credential = tokens[0].id;

  const root = mkdtempSync(join(tmpdir(), "drove-"));
  const name = basename(root);
  const walk = { drove: 1, box, user: options.user, repo: options.repo, issue: Number(options.issue), townd, kennel, home: home.home, keep: options.keep, started: new Date().toISOString(), credential, pass: null, grants: [], sheep: null, revoked: false, ended: false, finished: null, exit: null };
  writeWalk(root, walk);
  const report = [];
  const say = (text) => {
    report.push(text);
    out(text);
  };
  const failures = [];
  let token;
  const safe = (text) => (token === undefined ? { text, scrubbed: false } : scrub(text, token));

  say(`walk ${name}: ${box} for ${options.user}, ${options.repo}#${options.issue}, the home ${home.home} (kennel ${kennel})`);
  try {
    // The pass, and the grant held in this process alone.
    const pass = await admin(["pass", "new", "--user", options.user, "--label", `drove ${name}`, "--expires", "1d"]);
    const passId = pass.stderr.match(/\bpass_[0-9a-f]+\b/)?.[0];
    if (passId !== undefined) {
      walk.pass = passId;
      writeWalk(root, walk);
    }
    if (pass.code !== 0 || passId === undefined) throw new Error(`townd pass new exited ${pass.code} and named ${passId ?? "no pass"}: ${pass.stderr.trim()}`);
    let grant;
    try {
      grant = JSON.parse(pass.stdout.toString("utf8"));
    } catch {
      grant = undefined;
    }
    if (typeof grant?.token !== "string" || grant.token === "" || typeof grant?.town !== "string") throw new Error("townd pass new printed no grant on stdout");
    token = grant.token;
    const compact = JSON.stringify(grant);

    const memory = await admin(["grant", "new", "--pass", passId, "--shop", "town/memory"]);
    if (memory.code !== 0) throw new Error(`townd grant new at town/memory exited ${memory.code}: ${memory.stderr.trim()}`);
    walk.grants.push(memory.stdout.toString("utf8").trim());
    const github = await admin([
      "grant", "new", "--pass", passId, "--shop", "town/github", "--commands", "reply,show",
      "--constraint", `reply.repo equals ${options.repo}`, "--constraint", `show.repo equals ${options.repo}`, "--credential", credential,
    ]);
    if (github.code !== 0) throw new Error(`townd grant new at town/github exited ${github.code}: ${github.stderr.trim()}`);
    walk.grants.push(github.stdout.toString("utf8").trim());
    writeWalk(root, walk);
    say(`pass: ${passId} for ${options.user}, expiring in a day\n  granted: town/memory (every command), ${walk.grants[0]}\n  granted: town/github reply,show, repo equals ${options.repo}, credential ${credential}, ${walk.grants[1]}`);

    // The sheep, minted with the grant on stdin.
    const minted = await sheep(["new", "--secret", "TOWN_GRANT", "--detach"], `${compact}\n`);
    const id = minted.stdout.toString("utf8").trim();
    if (minted.code !== 0 || !/^[0-9a-f-]{36}$/.test(id)) throw new Error(`sheep new exited ${minted.code} and printed no id: ${safe(minted.stderr).text.trim()}`);
    walk.sheep = id;
    writeWalk(root, walk);
    say(`sheep: ${id}`);

    // The sentence, and the wait.
    const sentence = sentenceOf({ walk: name, repo: options.repo, issue: options.issue });
    const sent = await sheep(["attach", id, "--detach", "--", sentence]);
    if (sent.code !== 0) throw new Error(`sheep attach --detach exited ${sent.code}: ${sent.stderr.trim()}`);
    say(`sentence:\n${indent(sentence)}`);
    const started = Date.now();
    const waited = await sheep(["wait", "--timeout", String(WAIT_SECONDS), id]);
    const last = waited.stdout.toString("utf8").replace(new RegExp(`^${id}\\t`), "").trimEnd();
    say(`wait: ${waited.code === 0 ? "idle" : waited.code === 124 ? `not idle after ${WAIT_SECONDS}s` : `exited ${waited.code}`} after ${Math.round((Date.now() - started) / 1000)}s; the sheep's last message:\n${indent(safe(last).text)}`);
    if (waited.code !== 0) {
      failures.push(`sheep wait exited ${waited.code}`);
      if (waited.code === 124) await sheep(["abort", id]);
    }

    // The audit, over the wire.
    const audit = await admin(["audit", "--pass", passId]);
    const auditText = audit.stdout.toString("utf8");
    const auditSafe = safe(auditText);
    writeFileSync(join(root, "audit.txt"), auditSafe.text, { mode: 0o600 });
    if (audit.code !== 0) failures.push(`townd audit --pass exited ${audit.code}: ${audit.stderr.trim()}`);
    const rows = table(auditText);
    say(`audit: ${rows.length} call${rows.length === 1 ? "" : "s"} under ${passId}${rows.length === 0 ? "" : `\n${rows.map((row) => `  ${row.shop} ${row.command}: ${row.result} (exit ${row.exit}, ${row.call})`).join("\n")}`}`);
    for (const [shop, command] of [["town/memory", "remember"], ["town/github", "reply"]]) {
      if (!rows.some((row) => row.shop === shop && row.command === command && row.result === "ok")) failures.push(`the audit holds no ${shop} ${command} at ok`);
    }

    // The search, the log kept as it was read.
    const found = await search(sheep, id, token);
    if (found.log !== undefined) {
      const logSafe = safe(found.log);
      writeFileSync(join(root, "log.jsonl"), logSafe.text, { mode: 0o600 });
      const left = leftBy(logSafe.text);
      say(`left, as the transcript shows it:${left.length === 0 ? " no town memory remember and no town github reply in the transcript" : ""}\n${left.map((call) => `  $ ${call.command}\n${indent(indent(call.result))}`).join("\n")}`.trimEnd());
      if (logSafe.scrubbed) failures.push("the log held the token; log.jsonl holds [the token] in its place");
    }
    for (const line of found.lines) say(line);
    if (auditSafe.scrubbed) {
      say("search: the audit held the token's bytes; audit.txt holds [the token] in its place");
      failures.push("the audit held the token");
    }
    if (!found.clean) failures.push("the search is not clean");
  } catch (error) {
    failures.push(safe(error instanceof Error ? error.message : String(error)).text);
  } finally {
    // The strike: the pass revoked and the sheep ended, both unless --keep.
    if (walk.pass !== null && !options.keep) {
      const revoked = await admin(["pass", "revoke", walk.pass]);
      walk.revoked = revoked.code === 0;
      say(revoked.code === 0 ? `revoke: ${revoked.stdout.toString("utf8").trim()}` : `revoke: townd pass revoke exited ${revoked.code}: ${revoked.stderr.trim()}`);
      if (revoked.code !== 0) failures.push("the pass was not revoked");
    } else if (walk.pass !== null) say(`revoke: kept, --keep; --teardown ${root} revokes ${walk.pass}`);
    if (walk.sheep !== null && !options.keep) {
      const ended = await sheep(["rm", walk.sheep]);
      walk.ended = ended.code === 0;
      say(ended.code === 0 ? `end: ${ended.stdout.toString("utf8").trim()}` : `end: sheep rm exited ${ended.code}: ${ended.stderr.trim()}`);
      if (ended.code !== 0) failures.push("the sheep was not ended");
    } else if (walk.sheep !== null) say(`end: kept, --keep; --teardown ${root} ends ${walk.sheep}`);
    const exit = failures.length === 0 ? 0 : 1;
    say(exit === 0 ? "walked: every step exited 0, the audit holds memory remember and github reply at ok, and the search is clean" : `not walked: ${failures.join("; ")}`);
    say(`root: ${root} (walk.json, ${walk.sheep === null ? "" : "log.jsonl, "}audit.txt, report.txt); --status and --teardown take it`);
    walk.finished = new Date().toISOString();
    walk.exit = exit;
    writeWalk(root, walk);
    writeFileSync(join(root, "report.txt"), `${safe(report.join("\n")).text}\n`, { mode: 0o600 });
    token = undefined;
    process.exitCode = exit;
  }
  return process.exitCode;
}

async function statusVerb(rootArg) {
  const root = resolve(rootArg);
  const read = readWalk(root);
  if ("refused" in read) return refuse(read.refused);
  let report;
  try {
    report = readFileSync(join(root, "report.txt"), "utf8");
  } catch {
    process.stdout.write(`walk ${basename(root)} left no report: started ${read.walk.started}, pass ${read.walk.pass ?? "none"}, sheep ${read.walk.sheep ?? "none"}; --teardown ${root} strikes what it made\n`);
    return 1;
  }
  process.stdout.write(report);
  return 0;
}

async function teardownVerb(rootArg) {
  const root = resolve(rootArg);
  const read = readWalk(root);
  if ("refused" in read) return refuse(read.refused);
  const { walk } = read;
  let failed = 0;
  if (walk.pass !== null && !walk.revoked) {
    const revoked = await towndRunner(walk.townd, walk.box)(["pass", "revoke", walk.pass]);
    walk.revoked = revoked.code === 0;
    process.stdout.write(revoked.code === 0 ? `revoke: ${revoked.stdout.toString("utf8").trim()}\n` : `revoke: townd pass revoke ${walk.pass} exited ${revoked.code}: ${revoked.stderr.trim()}\n`);
    if (revoked.code !== 0) failed++;
  } else process.stdout.write(`revoke: ${walk.pass === null ? "the walk made no pass" : `${walk.pass} was revoked by the walk`}\n`);
  if (walk.sheep !== null && !walk.ended) {
    const home = homeOf(walk.kennel);
    if ("refused" in home) {
      process.stdout.write(`end: ${home.refused}\n`);
      failed++;
    } else if (home.home !== walk.home) {
      process.stdout.write(`end: the sheep was minted on ${walk.home}, and ${walk.kennel} now names ${home.home}; not ended\n`);
      failed++;
    } else {
      const ended = await sheepRunner(home)(["rm", walk.sheep]);
      const gone = ended.code === 0 || ended.stderr.includes(`no session ${walk.sheep} at this home`);
      walk.ended = gone;
      process.stdout.write(ended.code === 0 ? `end: ${ended.stdout.toString("utf8").trim()}\n` : gone ? `end: ${walk.sheep} was already gone\n` : `end: sheep rm exited ${ended.code}: ${ended.stderr.trim()}\n`);
      if (!gone) failed++;
    }
  } else process.stdout.write(`end: ${walk.sheep === null ? "the walk minted no sheep" : `${walk.sheep} was ended by the walk`}\n`);
  if (failed > 0) {
    writeWalk(root, walk);
    process.stdout.write(`root: kept at ${root}, since ${failed} thing${failed === 1 ? "" : "s"} could not be struck\n`);
    return 1;
  }
  rmSync(root, { recursive: true, force: true });
  process.stdout.write(`root: removed ${root}\n`);
  return 0;
}

async function searchVerb(options) {
  const home = homeOf(resolve(options.kennel ?? join(REPO, ".sheep")));
  if ("refused" in home) return refuse(home.refused);
  if (process.stdin.isTTY) return refuse("--search reads the token on stdin, never an argument; pipe it");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const token = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  if (token === "") return refuse("--search read no token on stdin");
  const found = await search(sheepRunner(home), options.search, token);
  process.stdout.write(`${found.lines.join("\n")}\n`);
  return found.clean ? 0 : 1;
}

async function main(argv) {
  if (argv.length === 0) {
    process.stderr.write(USAGE);
    return 2;
  }
  const options = parse(argv);
  if ("refused" in options) return refuse(`${options.refused}\n${USAGE}`);
  const modes = ["status", "teardown", "search"].filter((mode) => options[mode] !== undefined);
  if (modes.length > 1) return refuse(`--${modes[0]} and --${modes[1]} are two verbs; give one`);
  if (options.status !== undefined) return statusVerb(options.status);
  if (options.teardown !== undefined) return teardownVerb(options.teardown);
  if (options.search !== undefined) return searchVerb(options);
  return walkVerb(options);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
