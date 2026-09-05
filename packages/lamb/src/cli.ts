import { createRequire } from "node:module";
import { loadConfig } from "./config.js";
import { writeSessionFile } from "./export.js";
import { Home } from "./home.js";
import { runPiClient } from "./pi.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const USAGE = `lamb — pi, running in a cell

usage:
  lamb new [--name <name>] [-- <prompt>]   mint a session at the home and attach pi's terminal to it
  lamb -c | --continue [-- <prompt>]       attach to the newest session
  lamb attach <sessionId> [-- <prompt>]    attach to a named session; a second terminal on the same cell
  lamb ls                                  the home's sessions
  lamb export <sessionId> [file]           write the session as a pi SQLite file (default <sessionId>.sqlite)
  lamb config                              print the resolved home (never the token)
  lamb --version

options:
  --home <url>    which home; also LAMB_HOME or ~/.lamb/config ({"home": "...", "token": "..."})

With a prompt after --, the reply is streamed and lamb exits, as pi does when stdout is not a terminal.
`;

interface Parsed {
  home?: string;
  name?: string;
  prompt?: string;
  rest: string[];
}

function parse(argv: readonly string[]): Parsed {
  const args = [...argv];
  const parsed: Parsed = { rest: [] };
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--") {
      parsed.prompt = args.join(" ");
      break;
    }
    if (arg === "--home") parsed.home = args.shift();
    else if (arg.startsWith("--home=")) parsed.home = arg.slice("--home=".length);
    else if (arg === "--name") parsed.name = args.shift();
    else if (arg.startsWith("--name=")) parsed.name = arg.slice("--name=".length);
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
    process.stdout.write(`lamb ${version}\n`);
    return 0;
  }
  const config = await loadConfig({ home: parsed.home });
  if (command === "config") {
    process.stdout.write(`home: ${config.home ?? "(none)"}\ntoken: ${config.token ? "set" : "(none)"}\n`);
    return 0;
  }
  try {
    const home = new Home(config);
    switch (command) {
      case "ls": {
        for (const session of await home.list()) {
          process.stdout.write(`${session.id}\t${new Date(session.createdAt).toISOString()}\t${session.name ?? ""}\n`);
        }
        return 0;
      }
      case "new": {
        const session = await home.create(parsed.name);
        process.stderr.write(`session ${session.id}\n`);
        return attach(home, session.id, parsed.prompt);
      }
      case "-c":
      case "--continue": {
        const newest = (await home.list())[0];
        if (newest === undefined) return fail("no sessions at this home; run `lamb new`");
        return attach(home, newest.id, parsed.prompt);
      }
      case "attach": {
        const id = parsed.rest[1];
        if (id === undefined) return fail("attach needs a session id");
        return attach(home, id, parsed.prompt);
      }
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

async function attach(home: Home, sessionId: string, prompt: string | undefined): Promise<number> {
  const serverId = await home.serverId();
  return runPiClient({ socketUrl: home.socketUrl(sessionId, serverId), sessionId, ...(prompt === undefined ? {} : { prompt }) });
}

function fail(message: string): number {
  process.stderr.write(`lamb: ${message}\n`);
  return 2;
}
