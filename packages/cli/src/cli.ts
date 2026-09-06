import { createRequire } from "node:module";
import { loadConfig } from "./config.js";
import { writeSessionFile } from "./export.js";
import { runAbort, runLog, runPrompt, runStatus, runWait } from "./herd.js";
import { Home } from "./home.js";
import { PASTURE_NAME, runPasture } from "./pasture.js";
import { runPiClient } from "./pi.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const USAGE = `sheep — pi, running in a cell

usage:
  sheep new [--name <name>] [--pasture <name>] [--detach] [--wait] [-- <prompt>]
                                            mint a session at the home, born into a pasture or into none; attach pi's
                                            terminal, or send the prompt
  sheep -c | --continue [--detach] [--wait] [-- <prompt>]       the same, on the newest session
  sheep attach <id> [--detach] [--wait] [-- <prompt>]           the same, on a named session; a second terminal on the same cell
  sheep ls [--pasture <name>]               the home's sessions: id, name, created, lane state, pasture; one per line, tab
                                            separated, the last column empty for a pastureless sheep; with --pasture, that herd
  sheep status <id>                         the lane now: open operation, last tool call, tokens so far
  sheep wait [--timeout <seconds>] <id>...  block until every named session is idle; print each one's last assistant message
  sheep abort <id>                          stop the open operation
  sheep log [--since <entry id | ISO time>] [--last <n>] <id>   the transcript as text, oldest first, one block per entry
  sheep export <id> [file]                  write the session as a pi SQLite file (default <id>.sqlite)
  sheep config                              print the resolved home (never the token)
  sheep --version

  sheep pasture new <name> [--repo <url> | --repo .] [--branch <branch>]
                                            make a pasture: a shared tree, a repository or none, and the sheep born into it;
                                            --repo . reads this checkout's origin and stores the URL, uploading nothing;
                                            prints name, repository, branch
  sheep pasture ls                          the home's pastures: name, created
  sheep pasture <name>                      the meta, then the herd: id, name, state, born, task
  sheep pasture ls <name> [path]            the tree, or a directory in it; one path per line, a directory with its slash
  sheep pasture cat <name> <path>           a file of the tree, to stdout
  sheep pasture put <name> <path> [file]    write a file, or stdin, to the tree at <path>; whole, last write wins
  sheep pasture rm <name> <path>            remove a file, or a directory and what is under it
  sheep pasture secret set <name> <KEY>     set a secret; the value is stdin, never an argument (GIT_TOKEN is the credential)
  sheep pasture secret ls <name>            the secrets' names, one per line, never a value

options:
  --home <url>    which home; also SHEEP_HOME or ~/.sheep/config ({"home": "...", "token": "..."})
  --json          machine output, pi's shapes: entries are pi entries, status is pi's lane snapshot,
                  a queued prompt is pi's queue response, a detached prompt is pi's operation response;
                  ls rows carry "pasture": null | "<name>" and "task": null | "<first line of the first prompt>"
  --pasture <name>  with new: the pasture to be born into; with ls: only that herd
  --detach        with a prompt: send it and exit before the first token; the id is the first line of stdout
  --wait          with a prompt to a busy session: stream the queued turn when it starts

With a prompt after --, the reply streams and sheep exits when the turn ends. A prompt to a busy session is
queued behind the running turn, as pi queues a prompt typed mid-turn; sheep prints "queued <id>" and exits 0.
Without a prompt, sheep attaches pi's interactive terminal. wait exits 124 on timeout, with what had finished.
`;

interface Parsed {
  home?: string;
  name?: string;
  pasture?: string;
  repo?: string;
  branch?: string;
  prompt?: string;
  json: boolean;
  detach: boolean;
  wait: boolean;
  since?: string;
  last?: string;
  timeout?: string;
  rest: string[];
}

function parse(argv: readonly string[]): Parsed {
  const args = [...argv];
  const parsed: Parsed = { rest: [], json: false, detach: false, wait: false };
  const valued: Record<string, (value: string | undefined) => void> = {
    "--home": (value) => (parsed.home = value),
    "--name": (value) => (parsed.name = value),
    "--pasture": (value) => (parsed.pasture = value),
    "--repo": (value) => (parsed.repo = value),
    "--branch": (value) => (parsed.branch = value),
    "--since": (value) => (parsed.since = value),
    "--last": (value) => (parsed.last = value),
    "--timeout": (value) => (parsed.timeout = value),
  };
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--") {
      parsed.prompt = args.join(" ");
      break;
    }
    const equals = arg.indexOf("=");
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    if (flag in valued) valued[flag]!(equals === -1 ? args.shift() : arg.slice(equals + 1));
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--detach") parsed.detach = true;
    else if (arg === "--wait") parsed.wait = true;
    else parsed.rest.push(arg);
  }
  return parsed;
}

/** Runs the CLI; returns the process exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parse(argv);
  const command = parsed.rest[0];
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`sheep ${version}\n`);
    return 0;
  }
  const config = await loadConfig({ home: parsed.home });
  if (command === "config") {
    process.stdout.write(`home: ${config.home ?? "(none)"}\ntoken: ${config.token ? "set" : "(none)"}\n`);
    return 0;
  }
  const output = { json: parsed.json, out: (text: string) => void process.stdout.write(text), err: (text: string) => void process.stderr.write(text) };
  try {
    const home = new Home(config);
    switch (command) {
      case "ls": {
        const sessions = await home.list(parsed.pasture);
        if (parsed.json) process.stdout.write(`${JSON.stringify(sessions)}\n`);
        else {
          for (const session of sessions) {
            process.stdout.write(`${session.id}\t${session.name ?? ""}\t${new Date(session.createdAt).toISOString()}\t${session.state}\t${session.pasture ?? ""}\n`);
          }
        }
        return 0;
      }
      case "new": {
        if (parsed.pasture !== undefined && !PASTURE_NAME.test(parsed.pasture)) return fail(`a pasture's name is [a-z0-9-]+, not ${JSON.stringify(parsed.pasture)}`);
        const session = await home.create(parsed.name, parsed.pasture);
        if (parsed.detach) return detach(home, session.id, parsed);
        process.stderr.write(`session ${session.id}\n`);
        return attach(home, session.id, parsed, output);
      }
      case "-c":
      case "--continue": {
        const newest = (await home.list())[0];
        if (newest === undefined) return fail("no sessions at this home; run `sheep new`");
        return parsed.detach ? detach(home, newest.id, parsed) : attach(home, newest.id, parsed, output);
      }
      case "attach": {
        const id = parsed.rest[1];
        if (id === undefined) return fail("attach needs a session id");
        return parsed.detach ? detach(home, id, parsed) : attach(home, id, parsed, output);
      }
      case "status": {
        const id = parsed.rest[1];
        if (id === undefined) return fail("status needs a session id");
        return runStatus(home, id, output);
      }
      case "wait": {
        const ids = parsed.rest.slice(1);
        if (ids.length === 0) return fail("wait needs at least one session id");
        const seconds = parsed.timeout === undefined ? undefined : Number(parsed.timeout);
        if (seconds !== undefined && !(seconds > 0)) return fail(`--timeout needs a number of seconds, not ${parsed.timeout}`);
        return runWait(home, ids, { timeoutMs: seconds === undefined ? undefined : seconds * 1000 }, output);
      }
      case "abort": {
        const id = parsed.rest[1];
        if (id === undefined) return fail("abort needs a session id");
        return runAbort(home, id, output);
      }
      case "log": {
        const id = parsed.rest[1];
        if (id === undefined) return fail("log needs a session id");
        const last = parsed.last === undefined ? undefined : Number(parsed.last);
        if (last !== undefined && !(Number.isInteger(last) && last >= 0)) return fail(`--last needs a count, not ${parsed.last}`);
        return runLog(home, id, { since: parsed.since, last }, output);
      }
      case "pasture":
        // Awaited, so the home's refusal sentence is caught below and printed, not thrown out of `main`.
        return await runPasture(home, { rest: parsed.rest.slice(1), repo: parsed.repo, branch: parsed.branch }, output);
      case "export": {
        const id = parsed.rest[1];
        if (id === undefined) return fail("export needs a session id");
        const file = parsed.rest[2] ?? `${id}.sqlite`;
        const { tables } = writeSessionFile(file, await home.exportRows(id));
        process.stdout.write(`${file}\t${Object.entries(tables).map(([table, count]) => `${table}=${count}`).join(" ")}\n`);
        return 0;
      }
      default:
        return fail(`unknown command: ${command}`);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/**
 * The id first, on its own line, then the prompt is sent through the
 * cell's HTTP face, which returns once the operation is durable, or once
 * the prompt is queued behind a running one. Nothing streams.
 */
async function detach(home: Home, sessionId: string, parsed: Parsed): Promise<number> {
  process.stdout.write(`${sessionId}\n`);
  if (parsed.prompt === undefined) return 0;
  const response = await home.prompt(sessionId, parsed.prompt);
  if ("entryId" in response) process.stderr.write(`queued ${sessionId}\n`);
  if (parsed.json) process.stdout.write(`${JSON.stringify(response)}\n`);
  return 0;
}

/** With a prompt, sheep's own client; without one, pi's terminal through the bridge. */
async function attach(home: Home, sessionId: string, parsed: Parsed, output: Parameters<typeof runPrompt>[4]): Promise<number> {
  if (parsed.prompt !== undefined) return runPrompt(home, sessionId, parsed.prompt, { wait: parsed.wait }, output);
  const serverId = await home.serverId();
  return runPiClient({ socketUrl: home.socketUrl(sessionId, serverId), serverId, sessionId });
}

function fail(message: string): number {
  process.stderr.write(`sheep: ${message}\n`);
  return 2;
}
