import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** pi's own CLI, from the pinned checkout this package links to. */
export function piCliPath(): string {
  // The package's entry is dist/index.js, reachable only through its ESM export map; the CLI sits beside it.
  return join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "cli.js");
}

/**
 * Runs `pi client` against one cell. The terminal is pi's; lamb only
 * chooses the route. Interactive when stdin and stdout are terminals,
 * otherwise `prompt` is sent and the reply streamed, as pi does.
 */
export function runPiClient(options: { socketUrl: string; sessionId: string; prompt?: string }): Promise<number> {
  const args = [piCliPath(), "client", "--connect", options.socketUrl, "--session-id", options.sessionId];
  if (options.prompt !== undefined) args.push("--", options.prompt);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: { ...process.env, PI_EXPERIMENTAL: "1" },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
