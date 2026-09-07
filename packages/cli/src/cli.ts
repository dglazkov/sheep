import { kennelDir, loadConfig, sheepDir, type SheepConfig } from "./config.js";
import { writeSessionFile } from "./export.js";
import { runAbort, runLog, runPrompt, runStatus, runWait } from "./herd.js";
import { Home } from "./home.js";
import { isRefused, localStatus, readStamp, startLocalHome, stopLocalHome, whoAnswers } from "./local.js";
import { PASTURE_NAME, runPasture } from "./pasture.js";
import { runPiClient } from "./pi.js";
import { formatSetup, INSTALL_SPEC, kennelTracked, readGuide, setup, trackedWarning } from "./setup.js";

/**
 * The build stamp, from the manifest beside the running code: the release
 * manifest above `dist/sheep.mjs` carries `sheep.commit` and
 * `sheep.builtAt`, written by `scripts/release.mjs`; a checkout's
 * `packages/cli/package.json` carries no stamp, and says so. The same
 * test tells the local home which wrangler and which config are its own.
 */
export function version(): string {
  const stamp = readStamp();
  return stamp === undefined ? "sheep 0.0.0-checkout" : `sheep ${stamp.commit} (${stamp.builtAt})`;
}

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
  sheep config                              print the resolved home and this directory's kennel (never the token)
  sheep setup [--no-install]                ready this directory: the command on PATH (installed with
                                            npm install -g ${INSTALL_SPEC} when absent), the skill under
                                            .agents/skills/sheep with the .claude/skills doorway, the kennel .sheep/
                                            here with a .gitignore entry for it in a git work tree, the home reported;
                                            idempotent, and it prints the next thing to run
  sheep --agent-help                        the guide for an agent: what sheep is, the verbs, the home, what needs a person
  sheep --version

  sheep home local [--faux]                 a home on this machine, under the kennel's local/, started if it was not;
                                            writes the kennel's config when there is none; the report says whether a model
                                            key is held (from ANTHROPIC_API_KEY), or that the faux provider answers instead
  sheep home stop                           stop this kennel's local home
  sheep home                                which kennel, which home the config names, and whether it answers

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
  --home <url>    which home; also SHEEP_HOME or the kennel's config ({"home": "...", "token": "..."})
  --json          machine output, pi's shapes: entries are pi entries, status is pi's lane snapshot,
                  a queued prompt is pi's queue response, a detached prompt is pi's operation response;
                  ls rows carry "pasture": null | "<name>" and "task": null | "<first line of the first prompt>"
  --pasture <name>  with new: the pasture to be born into; with ls: only that herd
  --detach        with a prompt: send it and exit before the first token; the id is the first line of stdout
  --wait          with a prompt to a busy session: stream the queued turn when it starts
  --faux          with home local: the scripted model that answers "ok", for a look at the plumbing without a key
  --no-install    with setup: report the command missing rather than installing it

The kennel is .sheep/ at or above the working directory, found the way git finds .git, and ~/.sheep when there is
none: this directory's config and its own local home. sheep setup makes one here; two directories share nothing
but the command, and cd is how you switch.

A command whose home is the local one starts it when the connection is refused, and says so on stderr.

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
  faux: boolean;
  noInstall: boolean;
  since?: string;
  last?: string;
  timeout?: string;
  rest: string[];
}

function parse(argv: readonly string[]): Parsed {
  const args = [...argv];
  const parsed: Parsed = { rest: [], json: false, detach: false, wait: false, faux: false, noInstall: false };
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
    else if (arg === "--faux") parsed.faux = true;
    else if (arg === "--no-install") parsed.noInstall = true;
    else parsed.rest.push(arg);
  }
  return parsed;
}

/** Runs the CLI; returns the process exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  // The guide, wherever the flag is typed before a prompt: stop, and print how to work here.
  const dash = argv.indexOf("--");
  if (argv.slice(0, dash === -1 ? argv.length : dash).includes("--agent-help")) {
    process.stdout.write(readGuide());
    return 0;
  }
  const parsed = parse(argv);
  const command = parsed.rest[0];
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${version()}\n`);
    return 0;
  }
  const config = await loadConfig({ home: parsed.home });
  if (command === "config") {
    process.stdout.write(`home: ${config.home ?? "(none)"}\ntoken: ${config.token ? "set" : "(none)"}\nkennel: ${sheepDir()}\n`);
    return 0;
  }
  const output = { json: parsed.json, out: (text: string) => void process.stdout.write(text), err: (text: string) => void process.stderr.write(text) };
  if (command === "home") return await runHome(parsed, config, output);
  if (command === "setup") {
    const report = await setup({ dir: process.cwd(), install: !parsed.noInstall, say: output.err, home: parsed.home });
    process.stdout.write(parsed.json ? `${JSON.stringify(report)}\n` : formatSetup(report, process.cwd()));
    return 0;
  }
  try {
    return await dispatch(command, parsed, config, output);
  } catch (error) {
    // Started on demand: the configured home is the local one and nobody answered, so start it, say so, and go on once.
    if (!(config.local === true && isRefused(error))) return fail(error instanceof Error ? error.message : String(error));
    process.stderr.write("sheep: the local home is not running; starting it\n");
    try {
      const started = await startLocalHome({ say: output.err });
      process.stderr.write(`sheep: local home at ${started.url}\n`);
      return await dispatch(command, parsed, await loadConfig({ home: parsed.home }), output);
    } catch (again) {
      return fail(again instanceof Error ? again.message : String(again));
    }
  }
}

type Output = Parameters<typeof runPrompt>[4];

/** Every verb that talks to a home. A rejection is thrown to `main`, which prints it as a sentence, or starts the local home first. */
async function dispatch(command: string, parsed: Parsed, config: SheepConfig, output: Output): Promise<number> {
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
      if (parsed.detach) return await detach(home, session.id, parsed);
      process.stderr.write(`session ${session.id}\n`);
      return await attach(home, session.id, parsed, output);
    }
    case "-c":
    case "--continue": {
      const newest = (await home.list())[0];
      if (newest === undefined) return fail("no sessions at this home; run `sheep new`");
      return await (parsed.detach ? detach(home, newest.id, parsed) : attach(home, newest.id, parsed, output));
    }
    case "attach": {
      const id = parsed.rest[1];
      if (id === undefined) return fail("attach needs a session id");
      return await (parsed.detach ? detach(home, id, parsed) : attach(home, id, parsed, output));
    }
    case "status": {
      const id = parsed.rest[1];
      if (id === undefined) return fail("status needs a session id");
      return await runStatus(home, id, output);
    }
    case "wait": {
      const ids = parsed.rest.slice(1);
      if (ids.length === 0) return fail("wait needs at least one session id");
      const seconds = parsed.timeout === undefined ? undefined : Number(parsed.timeout);
      if (seconds !== undefined && !(seconds > 0)) return fail(`--timeout needs a number of seconds, not ${parsed.timeout}`);
      return await runWait(home, ids, { timeoutMs: seconds === undefined ? undefined : seconds * 1000 }, output);
    }
    case "abort": {
      const id = parsed.rest[1];
      if (id === undefined) return fail("abort needs a session id");
      return await runAbort(home, id, output);
    }
    case "log": {
      const id = parsed.rest[1];
      if (id === undefined) return fail("log needs a session id");
      const last = parsed.last === undefined ? undefined : Number(parsed.last);
      if (last !== undefined && !(Number.isInteger(last) && last >= 0)) return fail(`--last needs a count, not ${parsed.last}`);
      return await runLog(home, id, { since: parsed.since, last }, output);
    }
    case "pasture":
      return await runPasture(home, { rest: parsed.rest.slice(1), repo: parsed.repo, branch: parsed.branch }, output);
    case "export": {
      const id = parsed.rest[1];
      if (id === undefined) return fail("export needs a session id");
      const file = parsed.rest[2] ?? `${id}.sqlite`;
      const { tables } = await writeSessionFile(file, await home.exportRows(id));
      process.stdout.write(`${file}\t${Object.entries(tables).map(([table, count]) => `${table}=${count}`).join(" ")}\n`);
      return 0;
    }
    default:
      return fail(`unknown command: ${command}`);
  }
}

/**
 * `sheep home local [--faux]`, `sheep home stop`, `sheep home [--json]`.
 * The report names states and paths, never a value from the secrets file.
 * Every form says one line on stderr first when git tracks the kennel: a
 * token is in the repository, and the command goes on regardless.
 */
async function runHome(parsed: Parsed, config: SheepConfig, output: Output): Promise<number> {
  const sub = parsed.rest[1];
  const kennel = sheepDir();
  if (kennelTracked(kennelDir())) output.err(trackedWarning(kennelDir()));
  try {
    if (sub === "local") {
      const report = await startLocalHome({ faux: parsed.faux, say: output.err });
      if (parsed.json) {
        output.out(`${JSON.stringify({ home: report.url, kennel, ...report })}\n`);
        return 0;
      }
      const key =
        report.key === "faux"
          ? "the faux provider answers every prompt with \"ok\"; no key is used"
          : report.key === "held"
            ? `held, in ${report.secrets}`
            : `not held; export ANTHROPIC_API_KEY and run \`sheep home local\` again`;
      const configLine =
        report.config.names !== undefined
          ? `${report.config.path} names ${report.config.names}; --home ${report.url} selects the local home for one command`
          : report.config.wrote
            ? `${report.config.path} written`
            : `${report.config.path} names this home`;
      output.out(`local home: ${report.url} (${report.state}, pid ${report.pid})\nkennel: ${kennel}\nfiles: ${report.dir}\nconfig: ${configLine}\nkey: ${key}\n`);
      return 0;
    }
    if (sub === "stop") {
      const { stopped, record, unreaped } = await stopLocalHome();
      if (unreaped !== undefined) output.err(`sheep: pid ${unreaped} is still in the process table after SIGKILL (nothing reaps it?); the record's pid is cleared\n`);
      if (parsed.json) {
        output.out(`${JSON.stringify({ stopped, home: record?.url ?? null, kennel, ...(unreaped === undefined ? {} : { unreaped }) })}\n`);
        return 0;
      }
      output.out(record === undefined ? "no local home has been started here\n" : stopped ? `stopped the local home at ${record.url}\n` : `the local home at ${record.url} was not running\n`);
      return 0;
    }
    if (sub !== undefined) return fail(`unknown home command: ${sub}; sheep home [local [--faux] | stop]`);

    // Which home the config names, and whether it answers.
    if (config.local === true) {
      const status = await localStatus();
      const home = status.record?.url ?? config.home ?? null;
      if (parsed.json) {
        output.out(`${JSON.stringify({ home, kennel, local: true, running: status.running, pid: status.running ? status.record!.pid : null, port: status.record?.port ?? null, stamp: status.record?.stamp ?? null, startedAt: status.running ? status.record!.startedAt : null })}\n`);
        return 0;
      }
      output.out(home === null ? "home: (none); run `sheep home local`\n" : `home: ${home} (local, ${status.running ? `running, pid ${status.record!.pid}` : "stopped"})\n`);
      output.out(`kennel: ${kennel}\n`);
      return 0;
    }
    const home = config.home ?? null;
    const answers = home === null ? "nobody" : await whoAnswers(home);
    if (parsed.json) {
      output.out(`${JSON.stringify({ home, kennel, local: false, answers: answers === "sheep" })}\n`);
      return 0;
    }
    output.out(home === null ? "home: (none); run `sheep home local`, or pass --home <url>\n" : `home: ${home} (${answers === "sheep" ? "answers" : answers === "other" ? "answers, but not as a sheep home" : "does not answer"})\n`);
    output.out(`kennel: ${kennel}\n`);
    return 0;
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
async function attach(home: Home, sessionId: string, parsed: Parsed, output: Output): Promise<number> {
  if (parsed.prompt !== undefined) return runPrompt(home, sessionId, parsed.prompt, { wait: parsed.wait }, output);
  const serverId = await home.serverId();
  return runPiClient({ socketUrl: home.socketUrl(sessionId, serverId), serverId, sessionId });
}

function fail(message: string): number {
  process.stderr.write(`sheep: ${message}\n`);
  return 2;
}
