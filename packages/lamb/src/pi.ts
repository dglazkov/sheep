import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startBridge } from "./bridge.js";

/** pi's own CLI, from the pinned checkout this package links to. */
export function piCliPath(): string {
  // The package's entry is dist/index.js, reachable only through its ESM export map; the CLI sits beside it.
  return join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "cli.js");
}

/**
 * Runs an unmodified `pi client` against one cell, through a local Unix
 * socket bridged to the cell's WebSocket. The terminal is pi's; lamb only
 * chooses the route. Interactive when stdin and stdout are terminals,
 * otherwise `prompt` is sent and the reply streamed, as pi does.
 */
export async function runPiClient(options: { socketUrl: string; serverId: string; sessionId: string; prompt?: string }): Promise<number> {
  const bridge = await startBridge({
    socketUrl: options.socketUrl,
    serverId: options.serverId,
    onError: (error) => process.stderr.write(`lamb: ${error.message}\n`),
  });
  try {
    const args = [piCliPath(), "client", "--connect", `unix://${bridge.path}`, "--session-id", options.sessionId];
    if (options.prompt !== undefined) args.push("--", options.prompt);
    return await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        stdio: "inherit",
        env: { ...process.env, PI_EXPERIMENTAL: "1" },
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
  } finally {
    await bridge.close();
  }
}
