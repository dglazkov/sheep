import { createRequire } from "node:module";
import { loadConfig } from "./config.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const USAGE = `lamb — pi, running in a cell

usage:
  lamb --version            print the version
  lamb --home <url> …       which home; also LAMB_HOME or ~/.lamb/config
  lamb config               print the resolved home (never the token)

Session commands arrive with lamb phase 4.
`;

/** Runs the CLI; returns the process exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const args = [...argv];
  let home: string | undefined;
  const rest: string[] = [];
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--home") {
      home = args.shift();
      if (home === undefined) return fail("--home needs a URL");
    } else if (arg.startsWith("--home=")) {
      home = arg.slice("--home=".length);
    } else {
      rest.push(arg);
    }
  }
  const command = rest[0];
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`lamb ${version}\n`);
    return 0;
  }
  if (command === "config") {
    const config = await loadConfig({ home });
    process.stdout.write(`home: ${config.home ?? "(none)"}\ntoken: ${config.token ? "set" : "(none)"}\n`);
    return 0;
  }
  return fail(`unknown command: ${command}`);
}

function fail(message: string): number {
  process.stderr.write(`lamb: ${message}\n`);
  return 2;
}
