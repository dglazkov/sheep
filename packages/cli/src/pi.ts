import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startBridge } from "./bridge.js";

/**
 * pi's experimental CLI, whole. Installed from the release, it is the
 * bundle `dist/pi-client.mjs` beside the running `dist/sheep.mjs`, built
 * by `scripts/bundle.mjs` from the fork; there is nothing to resolve, so
 * it is spawned bare. In a checkout it is the pinned fork's source: since
 * #9132 the published `pi` no longer dispatches `client`; the command
 * lives in `src/experimental/cli.ts`, and pi's own tests run it exactly
 * this way, Node stripping the types and pi's `source-resolver` mapping
 * the workspace packages to their sources.
 */
export function piCliArgs(): string[] {
  const bundled = join(dirname(fileURLToPath(import.meta.url)), "pi-client.mjs");
  if (existsSync(bundled)) return [bundled];
  // The package's entry is dist/index.js, reachable only through its ESM export map; src sits beside dist.
  const packageDir = dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
  const experimental = join(packageDir, "src", "experimental");
  return ["--import", join(experimental, "source-resolver.ts"), join(experimental, "cli.ts")];
}

/**
 * Runs an unmodified `pi client` against one cell, through a local Unix
 * socket bridged to the cell's WebSocket. The terminal is pi's; sheep only
 * chooses the route. Interactive when stdin and stdout are terminals,
 * otherwise `prompt` is sent and the reply streamed, as pi does.
 */
export async function runPiClient(options: { socketUrl: string; serverId: string; sessionId: string; prompt?: string }): Promise<number> {
  const bridge = await startBridge({
    socketUrl: options.socketUrl,
    serverId: options.serverId,
    onError: (error) => process.stderr.write(`sheep: ${error.message}\n`),
  });
  try {
    const args = [...piCliArgs(), "client", "--connect", `unix://${bridge.path}`, "--session-id", options.sessionId];
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
