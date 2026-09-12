import { kennelDir, loadConfig, sheepDir, type SheepConfig } from "./config.js";
import { credentialsLine, credentialsReport } from "./credentials.js";
import { deleteStation, deploy, Refusal, Stop } from "./deploy.js";
import { earmarks } from "./earmark.js";
import { writeSessionFile } from "./export.js";
import { runAbort, runEnd, runLog, runPrompt, runStatus, runWait, watchSetup } from "./herd.js";
import { Home, type PromptResponse } from "./home.js";
import { join } from "./join.js";
import { type BuildSide, cliBuild, describeBuild, describeImage, eyesSentence, isRefused, localStatus, readStamp, skewLine, startLocalHome, stopLocalHome, whoAnswers } from "./local.js";
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
  sheep new [--name <name>] [--pasture <name>] [--secret <NAME>]... [--detach] [--wait] [-- <prompt>]
                                            mint a session at the home, born into a pasture or into none; attach pi's
                                            terminal, or send the prompt; with --detach alone, print the id and exit;
                                            each --secret's value is a line of stdin, for this sheep alone
  sheep -c | --continue [--detach] [--wait] [-- <prompt>]       the same, on the newest session
  sheep attach <id> [--detach] [--wait] [-- <prompt>]           the same, on a named session; a second terminal on the same cell
  sheep ls [--pasture <name>]               the home's sessions: id, name, created, lane state, pasture, secret names; one
                                            per line, tab separated, the pasture empty for a pastureless sheep and the
                                            names (comma separated, never a value) empty for none; with --pasture, that herd
  sheep status <id>                         the lane now: open operation, last tool call, tokens so far, and last the
                                            pasture's setup.sh, from the sheep's row: setup: none | running (1m 40s) |
                                            ok (1m 52s) | failed (exit 1, 12.4 s). A sheep whose setup is running is
                                            answered from the row alone when the cell cannot answer in two seconds
  sheep wait [--timeout <seconds>] <id>...  block until every named session is idle; print each one's last assistant message
  sheep abort <id>                          stop the open operation
  sheep rm <id>                             end the session: its open turn aborted, its container and browser released, its
                                            rows gone, the pasture kept; prints <id>\\tended, with no undo (export first)
  sheep log [--since <entry id | ISO time>] [--last <n>] <id>   the transcript as text, oldest first, one block per entry,
                                            and a [setup] block where each of this sheep's setup.sh runs happened, with
                                            how it ended and the tail of what it printed (the last twenty are kept)
  sheep export <id> [file]                  write the session as a pi SQLite file (default <id>.sqlite)
  sheep config                              print the resolved home and this directory's kennel (never the token)
  sheep setup [--no-install]                ready this directory: the command on PATH (installed with
                                            npm install -g ${INSTALL_SPEC} when absent), the skill under
                                            .agents/skills/sheep with the .claude/skills doorway, the kennel .sheep/
                                            here with a .gitignore entry for it in a git work tree, the home reported;
                                            idempotent, and it prints the next thing to run
  sheep --agent-help                        the guide for an agent: what sheep is, the verbs, the home, what needs a person
  sheep --version

  sheep home local [--faux] [--no-container]
                                            a home on this machine, under the kennel's local/, started if it was not;
                                            writes the kennel's config when there is none; the report says whether a model
                                            key is held (from ANTHROPIC_API_KEY), or that the faux provider answers instead.
                                            With Docker on this machine the home rents a container beside every cell (git,
                                            node, pnpm, python: sheep can clone, build, test, and push), the image pulled by
                                            Docker; without Docker, or with --no-container, its sheep read, write, and edit.
                                            The home has eyes: a sheep's \`look <path>\` renders a workspace page in a real
                                            Chromium, and the first look on this machine fetches that Chrome
  sheep home stop                           stop this kennel's local home
  sheep home deploy [--name <worker>] [--subdomain <name>] [--json]
                                            the station: this package's home on the shepherd's Cloudflare account, a
                                            container beside every cell. Nothing without the account token and the model
                                            key, kept on this machine: absent, it prints what it needs and
                                            costs and exits 2. The name is the kennel's, minted at the first deploy and
                                            recorded in the config; run again, it redeploys the same Worker from this
                                            package and keeps its secrets
  sheep home delete [--name <worker>] [--json]
                                            end the station: lists what goes (the Worker at its address, its Durable
                                            Objects, its container application, how many sessions and pastures are in
                                            it, the config), then waits for the name typed at a terminal (one line of
                                            stdin without one; anything else is exit 2 with nothing deleted); deletes
                                            all of it and clears the config
  sheep home join <address> [--json]        a second machine's way in: the station's token is one line of stdin, piped,
                                            never an argument; the home is asked to answer as a sheep home and to take the
                                            token, then this kennel's config names it; prints the address, both stamps,
                                            and the image
  sheep home                                which kennel, which home the config names, its station's name once minted,
                                            which credentials are kept and where (never a value),
                                            whether it answers, and its build stamp beside this command's, with one line
                                            on stderr when they differ; the pen image its config named, when it says;
                                            whether it has eyes (a station deployed before they existed says no until
                                            \`sheep home deploy\` upgrades it)

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
                  a held turn's entries stream as they land, one per line, the last assistant entry last;
                  ls rows carry "pasture": null | "<name>", "task": null | "<first line of the first prompt>", and
                  "secrets": [<the sheep's secret names, sorted>];
                  rm is {"id": …, "ended": true, "aborted": <whether a turn was stopped>};
                  status is the snapshot with "setup" beside it, or {"id", "state", "setup", "snapshot": null} while a
                  setup holds the cell; ls rows carry the same "setup"; log gives each setup block "type": "setup"
  --pasture <name>  with new: the pasture to be born into; with ls: only that herd
  --secret <NAME> with new, repeatable: a secret for this sheep alone, its value one line of stdin per name in the
                  order given, never an argument; laid over its pasture's secret of the same name in setup, and as
                  GIT_TOKEN over the pasture's and the home's when git asks; ended with the sheep. Refused at a terminal,
                  without --detach or a prompt, and on attach and -c
  --detach        with a prompt: send it and exit before the first token; the id is the first line of stdout.
                  With new and no prompt: mint the session, print its id, and exit; the sheep is idle, costs
                  nothing, and is born into its pasture at the first thing that asks it (a prompt, status, log)
  --wait          with a prompt to a busy session: stream the queued turn when it starts
  --faux          with home local: the scripted model that answers "ok", for a look at the plumbing without a key;
                  with home deploy: the same provider set as the station's var, the account ring's flag
  --no-container  with home local: no container even with Docker present; a running home that has one is restarted
  --subdomain <name>  with home deploy: the workers.dev subdomain to register when the account has none
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
  subdomain?: string;
  prompt?: string;
  json: boolean;
  detach: boolean;
  wait: boolean;
  faux: boolean;
  noInstall: boolean;
  noContainer: boolean;
  since?: string;
  last?: string;
  timeout?: string;
  /** Every `--secret <NAME>`, in the order given; `undefined` for one with nothing after it. */
  secretNames: (string | undefined)[];
  /** The secrets read from stdin before the mint (earmark phase 1), name to value; set by `main`, sent by `new`. */
  secrets?: Record<string, string>;
  rest: string[];
}

function parse(argv: readonly string[]): Parsed {
  const args = [...argv];
  const parsed: Parsed = { rest: [], secretNames: [], json: false, detach: false, wait: false, faux: false, noInstall: false, noContainer: false };
  const valued: Record<string, (value: string | undefined) => void> = {
    "--home": (value) => (parsed.home = value),
    "--name": (value) => (parsed.name = value),
    "--pasture": (value) => (parsed.pasture = value),
    "--repo": (value) => (parsed.repo = value),
    "--branch": (value) => (parsed.branch = value),
    "--subdomain": (value) => (parsed.subdomain = value),
    "--since": (value) => (parsed.since = value),
    "--last": (value) => (parsed.last = value),
    "--timeout": (value) => (parsed.timeout = value),
    "--secret": (value) => void parsed.secretNames.push(value),
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
    else if (arg === "--no-container") parsed.noContainer = true;
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
  const output = { json: parsed.json, out: (text: string) => void process.stdout.write(text), err: (text: string) => void process.stderr.write(text), end: endAfterFlush };
  if (command === "home") return await runHome(parsed, config, output);
  if (command === "setup") {
    const report = await setup({ dir: process.cwd(), install: !parsed.noInstall, say: output.err, home: parsed.home });
    process.stdout.write(parsed.json ? `${JSON.stringify(report)}\n` : formatSetup(report, process.cwd()));
    return 0;
  }
  // A sheep's own secrets (earmark phase 1): refused, or read from stdin, before anything is asked of the home, and here rather
  // than in `dispatch`, which runs a second time when the local home had to be started, by when stdin is spent.
  const earmarked = await earmarks(command, { names: parsed.secretNames, pasture: parsed.pasture, detach: parsed.detach, prompt: parsed.prompt });
  if ("refused" in earmarked) return fail(earmarked.refused);
  parsed.secrets = earmarked.secrets;
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
          // The names last (earmark phase 1), so a reader of the first five by index is unchanged; never a value.
          process.stdout.write(`${session.id}\t${session.name ?? ""}\t${new Date(session.createdAt).toISOString()}\t${session.state}\t${session.pasture ?? ""}\t${session.secrets.join(",")}\n`);
        }
      }
      return 0;
    }
    case "new": {
      if (parsed.pasture !== undefined && !PASTURE_NAME.test(parsed.pasture)) return fail(`a pasture's name is [a-z0-9-]+, not ${JSON.stringify(parsed.pasture)}`);
      const session = await home.create(parsed.name, parsed.pasture, parsed.secrets);
      if (parsed.detach) return await detach(home, session.id, parsed, output);
      process.stderr.write(`session ${session.id}\n`);
      return await attach(home, session.id, parsed, output);
    }
    case "-c":
    case "--continue": {
      // The refusal (mint phase 1): a detach with nothing to send is `new`'s verb alone; nothing is asked of the home.
      if (parsed.detach && parsed.prompt === undefined) return fail(NOTHING_TO_SEND);
      const newest = (await home.list())[0];
      if (newest === undefined) return fail("no sessions at this home; run `sheep new`");
      return await (parsed.detach ? detach(home, newest.id, parsed, output) : attach(home, newest.id, parsed, output));
    }
    case "attach": {
      const id = parsed.rest[1];
      if (id === undefined) return fail("attach needs a session id");
      if (parsed.detach && parsed.prompt === undefined) return fail(NOTHING_TO_SEND);
      return await (parsed.detach ? detach(home, id, parsed, output) : attach(home, id, parsed, output));
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
    case "rm": {
      const id = parsed.rest[1];
      if (id === undefined) return fail("rm needs a session id");
      return await runEnd(home, id, output);
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
 * `sheep home local [--faux]`, `sheep home stop`, `sheep home [--json]`,
 * and station phase 1's `sheep home deploy [--name] [--subdomain] [--faux]
 * [--json]` and `sheep home delete [--name] [--json]` (`deploy.ts`): a
 * refusal that made nothing is exit 2, a failure after the account was
 * touched is exit 1. Station phase 3: the delete prints its listing (what
 * goes, and the session and pasture counts) on stdout before the prompt,
 * and `sessions deleted: <n>` after its three lines; `--json` carries the
 * listing and the counts in the report, and prints nothing before it.
 * The report names states and paths, never a value from the secrets file.
 * Station phase 0: a home that answers is asked its build stamp, printed
 * beside this command's (`--json`: `build: { home, cli }`), and skew is one
 * line on stderr, never a refusal. Station phase 2: `sheep home join
 * <address>` (`join.ts`), the token on stdin, exit 2 for every refusal;
 * and the image the home reports beside the stamps (`--json`: `image`).
 * Every form says one line on stderr first when git tracks the kennel: a
 * token is in the repository, and the command goes on regardless.
 * Station phase 4: `sheep home local` rents a container when Docker
 * answers, `--no-container` refuses one, the report says which and why;
 * `sheep home` for a local home reports the record's `container`, and a
 * home that answers `GET /home` must agree, else the record is stale and
 * the home is reported as not running.
 * Eyes phase 2: `sheep home` prints `eyes: yes|no` beside the container,
 * from what `GET /home` says (`--json`: `eyes: true | false | null`, null
 * for a home that does not say, a station from before eyes phase 1, which
 * the prose calls `no`); and `sheep home local` says the home has eyes
 * and where the first look fetches its Chrome.
 */
async function runHome(parsed: Parsed, config: SheepConfig, output: Output): Promise<number> {
  const sub = parsed.rest[1];
  const kennel = sheepDir();
  if (kennelTracked(kennelDir())) output.err(trackedWarning(kennelDir()));
  try {
    if (sub === "local") {
      const report = await startLocalHome({ faux: parsed.faux, container: parsed.noContainer ? false : "docker", say: output.err });
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
      // The container line (station phase 4): running, with what Docker said and how the container reaches the home; or none, with
      // the reason, which without Docker is the one sentence saying what a container would add and how to get one.
      const containerLine =
        report.container === "running"
          ? `container: running (${report.reason}; the pen environment, ${report.stamp?.image === undefined ? "the image built by Docker from the checkout's Dockerfile" : `the image ${report.stamp.image} pulled by Docker`}; PEN_CELL_ORIGIN ${report.origin}; idle ${report.idle})`
          : `container: none; ${report.reason}`;
      // Which config the daemon runs (station phase 4): the derived one, with its one-line Dockerfile, when the container is on and the
      // package's config names a registry image; a line only then, since otherwise it is the package's own.
      const daemonLine = report.daemonConfig.derived ? `daemon config: ${report.daemonConfig.path} (derived from the package's; the container is FROM ${report.daemonConfig.from})\n` : "";
      // The eyes line (eyes phase 2): unconditional, since the local home always has them; it says where the first look's Chrome goes.
      output.out(`local home: ${report.url} (${report.state}, pid ${report.pid})\nkennel: ${kennel}\nfiles: ${report.dir}\nconfig: ${configLine}\nkey: ${key}\n${containerLine}\n${eyesSentence(report.chrome)}\n${daemonLine}`);
      return 0;
    }
    if (sub === "stop") {
      const { stopped, record, unreaped, containersRemoved } = await stopLocalHome();
      if (unreaped !== undefined) output.err(`sheep: pid ${unreaped} is still in the process table after SIGKILL (nothing reaps it?); the record's pid is cleared\n`);
      if (parsed.json) {
        output.out(`${JSON.stringify({ stopped, home: record?.url ?? null, kennel, ...(unreaped === undefined ? {} : { unreaped }), containersRemoved })}\n`);
        return 0;
      }
      output.out(record === undefined ? "no local home has been started here\n" : stopped ? `stopped the local home at ${record.url}\n` : `the local home at ${record.url} was not running\n`);
      // The home's containers wrangler left behind (station phase 4), removed by name; one line only when there were any.
      if (containersRemoved > 0) output.out(`removed ${containersRemoved} container${containersRemoved === 1 ? "" : "s"} of the home's (${"workerd-sheep-PenContainer-…"})\n`);
      return 0;
    }
    if (sub === "deploy") {
      const report = await deploy({ name: parsed.name, subdomain: parsed.subdomain, faux: parsed.faux, say: output.err });
      if (parsed.json) {
        output.out(`${JSON.stringify(report)}\n`);
        return 0;
      }
      const skew = report.build.home === null ? undefined : skewLine(report.build.home, report.build.cli, false);
      if (skew !== undefined) output.err(skew);
      const builds = report.build.home === null ? "" : `home build: ${describeBuild(report.build.home)}\ncli build: ${describeBuild(report.build.cli)}\n`;
      const { containers } = report;
      const containersLine =
        containers.healthy >= 1
          ? `containers: ${containers.healthy} healthy (${containers.seconds}s)\n`
          : `containers: none healthy yet after ${containers.seconds}s (${containers.starting} starting, ${containers.scheduling} scheduling); \`sheep new\` may have to wait\n`;
      const { rollout } = report;
      const from = rollout.from === null ? "" : `, from ${rollout.from}`;
      const atStep = rollout.step === null ? "" : ` at step ${rollout.step}`;
      const rolloutLine =
        rollout.status === "none"
          ? "rollout: none\n"
          : rollout.status === "completed"
            ? `rollout: completed (${rollout.seconds}s)${from}\n`
            : rollout.status === "rolling"
              ? `rollout:${atStep}, ${rollout.healthy ?? "?"} healthy (${rollout.seconds}s); the platform finishes it${from}\n`
              : rollout.status === "unknown"
                ? "rollout: unknown (the account API did not answer)\n"
                : `rollout: ${rollout.status} after ${rollout.seconds}s${atStep}; the old image${rollout.from === null ? "" : ` (${rollout.from})`} serves until it completes\n`;
      const stampLine =
        report.build.cli.builtAt === null
          ? "stamp: not compared (this command is unstamped)\n"
          : report.build.home === null
            ? "stamp: unknown (the home did not answer)\n"
            : report.stamp.moved
              ? `stamp: moved (${report.stamp.seconds}s)\n`
              : `stamp: not moved after ${report.stamp.seconds}s; the home still reports ${describeBuild(report.build.home)}\n`;
      output.out(
        `home: ${report.home} (${report.state}; ${report.answers ? "answers" : "not answering yet; a fresh Worker takes a moment"})\n` +
          `name: ${report.name}\n` +
          `account: ${report.account.name} (${report.account.id}), ${report.plan.id} ${report.plan.state}, ${report.plan.price}; subdomain ${report.subdomain.name}${report.subdomain.registered ? " (registered now)" : ""}\n` +
          `image: ${report.image.startsWith("docker.io/") ? describeImage(report.image) : report.image}${report.faux ? "; the faux provider answers every prompt, no model is spent" : ""}\n` +
          // The model key (stile phase 0): put from what this machine keeps, or left as the home holds it when it keeps none.
          `key: ${report.key === "put" ? "put on the home from what this machine keeps" : "left as it is; the home keeps its own, and nothing on this machine does"}\n` +
          `kennel: ${kennel}\n` +
          `config: ${report.config.path} names the station\n` +
          builds +
          containersLine +
          rolloutLine +
          stampLine +
          `next: ${report.next}\n`,
      );
      return 0;
    }
    if (sub === "delete") {
      const report = await deleteStation({ name: parsed.name, say: parsed.json ? () => {} : output.out });
      if (parsed.json) output.out(`${JSON.stringify(report)}\n`);
      return 0;
    }
    if (sub === "join") {
      const address = parsed.rest[2];
      if (address === undefined) return fail("join needs the station's address: sheep home join https://<worker>.<subdomain>.workers.dev, with the token on stdin");
      const report = await join({ address, extra: parsed.rest.slice(3), say: output.err });
      if (report.skew !== null) output.err(report.skew);
      if (parsed.json) {
        output.out(`${JSON.stringify(report)}\n`);
        return 0;
      }
      output.out(
        `home: ${report.home} (joined; answers)\n` +
          `kennel: ${report.kennel}\n` +
          `config: ${report.config.path} names the station; no name, since it was deployed from another kennel\n` +
          `home build: ${describeBuild(report.build.home)}\ncli build: ${describeBuild(report.build.cli)}\n` +
          (report.image === null ? "image: (the home reports none)\n" : `image: ${describeImage(report.image)}\n`) +
          "next: sheep ls\n",
      );
      return 0;
    }
    if (sub !== undefined) return fail(`unknown home command: ${sub}; sheep home [local [--faux] | stop | deploy [--name <worker>] [--subdomain <name>] | delete [--name <worker>] | join <address>]`);

    // Which home the config names, and whether it answers. The station's name (kennel phase 1) is the config's record of the
    // first deploy from this kennel: null in JSON until there is one, and a `name:` line in prose only when there is.
    const name = config.name ?? null;
    const nameLine = name === null ? "" : `name: ${name}\n`;
    // The two stamps (station phase 0): the home's from `GET /home` with the token, once it is known to answer as a sheep
    // home, and this command's from the manifest beside the bundle. A home that does not answer leaves its side null, and
    // the prose is what it was; both there, the prose prints both and stderr gets the one-line skew warning, if any.
    // Station phase 2: the same answer carries the image the home's config named, an `image:` line when it does.
    // Eyes phase 2: and whether the home has eyes, `eyes: yes|no` as the first of the lines, beside the container's line in the
    // local case; a home that does not say (a station deployed before eyes phase 1) is `no` in prose and null in JSON.
    const buildReport = async (home: string | null, answers: boolean, local: boolean): Promise<{ build: { home: BuildSide | null; cli: BuildSide }; image: string | null; container: boolean | null; eyes: boolean | null; lines: string }> => {
      const cli = cliBuild();
      let stamp: { build: BuildSide; image: string | null; container: boolean | null; eyes: boolean | null } | null = null;
      if (home !== null && answers) {
        try {
          stamp = await new Home({ home, token: config.token }).stamp();
        } catch {
          stamp = null;
        }
      }
      if (stamp === null) return { build: { home: null, cli }, image: null, container: null, eyes: null, lines: "" };
      const skew = skewLine(stamp.build, cli, local);
      if (skew !== undefined) output.err(skew);
      const imageLine = stamp.image === null ? "" : `image: ${describeImage(stamp.image)}\n`;
      return { build: { home: stamp.build, cli }, image: stamp.image, container: stamp.container, eyes: stamp.eyes, lines: `eyes: ${stamp.eyes === true ? "yes" : "no"}\nhome build: ${describeBuild(stamp.build)}\ncli build: ${describeBuild(cli)}\n${imageLine}` };
    };
    if (config.local === true) {
      const status = await localStatus();
      const home = status.record?.url ?? config.home ?? null;
      let { running } = status;
      const answered = await buildReport(home, running, true);
      let { build, image, eyes, lines } = answered;
      const reported = answered.container;
      // The record's container choice (station phase 4), which a home that answers must agree with: a home reporting otherwise is
      // not the one the record describes, so the record is stale and the home is reported as not running.
      const container = status.record?.container ?? null;
      if (running && reported !== null && container !== null && reported !== container) {
        output.err(`sheep: the record says the local home ${container ? "has" : "has no"} container and the home at ${home} reports otherwise; a stale record, so the home is reported as not running\n`);
        running = false;
        build = { home: null, cli: build.cli };
        image = null;
        eyes = null;
        lines = "";
      }
      if (parsed.json) {
        output.out(`${JSON.stringify({ home, kennel, name, local: true, running, pid: running ? status.record!.pid : null, port: status.record?.port ?? null, stamp: status.record?.stamp ?? null, startedAt: running ? status.record!.startedAt : null, container, eyes, build, image, credentials: credentialsReport() })}\n`);
        return 0;
      }
      output.out(home === null ? "home: (none); run `sheep home local`\n" : `home: ${home} (local, ${running ? `running, pid ${status.record!.pid}` : "stopped"})\n`);
      output.out(`kennel: ${kennel}\n${nameLine}${credentialsLine()}\n${running ? `container: ${container ? "yes" : "no"}\n` : ""}${lines}`);
      return 0;
    }
    const home = config.home ?? null;
    const answers = home === null ? "nobody" : await whoAnswers(home);
    const { build, image, eyes, lines } = await buildReport(home, answers === "sheep", false);
    if (parsed.json) {
      output.out(`${JSON.stringify({ home, kennel, name, local: false, answers: answers === "sheep", eyes, build, image, credentials: credentialsReport() })}\n`);
      return 0;
    }
    output.out(home === null ? "home: (none); run `sheep home local`, or pass --home <url>\n" : `home: ${home} (${answers === "sheep" ? "answers" : answers === "other" ? "answers, but not as a sheep home" : "does not answer"})\n`);
    output.out(`kennel: ${kennel}\n${nameLine}${credentialsLine()}\n${lines}`);
    return 0;
  } catch (error) {
    // A stop (stile phase 0): the refusal that needs a person, printed in two parts — the dog's line, third person, saying
    // nothing was made, and under it the shepherd's paragraph, second person, naming the one command to type at their own
    // terminal. The dog relays that paragraph and does nothing else. `--json` is the same two parts and the `needs`.
    if (error instanceof Stop) {
      if (parsed.json) output.out(`${JSON.stringify({ refused: error.message, needs: error.needs, shepherd: error.shepherd })}\n`);
      else output.err(`sheep: ${error.message}\nfor the shepherd: ${error.shepherd}\n`);
      return 2;
    }
    // A deploy or delete that failed after the account was touched is exit 1, so a dog can tell it from a refusal that made nothing.
    if ((sub === "deploy" || sub === "delete") && error instanceof Error && !(error instanceof Refusal)) {
      process.stderr.write(`sheep: ${error.message}\n`);
      return 1;
    }
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/** The refusal for `--detach` with no prompt on `attach` and `-c` (mint phase 1); `fail` adds the `sheep: ` prefix. */
const NOTHING_TO_SEND = "--detach with no prompt is sheep new's; there is nothing to send";

/**
 * The verb (mint phase 1): with no prompt, the id alone on stdout, one
 * line, and nothing else happens; `new` minted it a moment ago and the
 * sheep is idle until something is asked of it. With a prompt, it is sent
 * through the cell's HTTP face, which returns once the operation is
 * durable, or once the prompt is queued behind a running one, and the id
 * is printed after: so on an id the home lacks the refusal is the whole
 * output, the sentence on stderr and nothing on stdout (end phase 1 left
 * that open, since the id was printed first). Nothing streams.
 *
 * Bleat phase 1: the request below is the one that blocks through a birth,
 * so the setup watcher runs for its length and says on stderr what the
 * sheep is waiting on; stdout is the id and nothing else, as before.
 */
async function detach(home: Home, sessionId: string, parsed: Parsed, output: Output): Promise<number> {
  if (parsed.prompt === undefined) {
    process.stdout.write(`${sessionId}\n`);
    return 0;
  }
  const watch = watchSetup(home, sessionId, output);
  let response: PromptResponse;
  try {
    response = await home.prompt(sessionId, parsed.prompt);
  } finally {
    await watch.stop();
  }
  process.stdout.write(`${sessionId}\n`);
  if ("entryId" in response) process.stderr.write(`queued ${sessionId}\n`);
  if (parsed.json) process.stdout.write(`${JSON.stringify(response)}\n`);
  return 0;
}

/**
 * With a prompt, sheep's own client; without one, pi's terminal through
 * the bridge. Before the terminal, the session is asked of the home (end
 * phase 1): the bridge's socket says only that it failed, and pi's client
 * exits with its own code, so a session the home lacks would never be
 * named. `home.session` throws the home's sentence to `main`'s `fail`
 * (stderr, exit 2) before any TUI is spawned. One request ahead of an
 * interactive session is nothing; the no-request rule is `attachSheep`'s
 * happy path, not this one.
 */
async function attach(home: Home, sessionId: string, parsed: Parsed, output: Output): Promise<number> {
  if (parsed.prompt !== undefined) return runPrompt(home, sessionId, parsed.prompt, { wait: parsed.wait }, output);
  await home.session(sessionId);
  const serverId = await home.serverId();
  return runPiClient({ socketUrl: home.socketUrl(sessionId, serverId), serverId, sessionId });
}

function fail(message: string): number {
  process.stderr.write(`sheep: ${message}\n`);
  return 2;
}

/**
 * The deliberate end (bleat phase 1), which one path uses: `sheep status`'s
 * short form, printed while a socket to a cell being born is still open and
 * cannot be cancelled (`herd.ts`'s `attachWithin` says why). Without it the
 * command prints its answer at two seconds and holds the terminal — and a
 * caller's `$(…)` — until the setup it was reporting on ends.
 *
 * The bytes first: a write to a pipe is asynchronous, and `process.exit`
 * drops whatever has not drained, so the exit waits on an empty write's
 * callback, which runs after everything already queued on that stream. The
 * code is the one the command would have returned.
 */
function endAfterFlush(code: number): void {
  let left = 2;
  const gone = (): void => {
    if (--left === 0) process.exit(code);
  };
  process.stdout.write("", gone);
  process.stderr.write("", gone);
}
