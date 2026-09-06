/**
 * A local home for the CLI's tests: `wrangler dev` on a free port with the
 * faux provider, and `bin/sheep.js` driven as a child process against it.
 * Started once per test file; a file skips, with a message, when the home
 * cannot be started here. Factored out of journey 5's test for pasture
 * phase 0, which drives the same binary against the same kind of home.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const bin = new URL("../bin/sheep.js", import.meta.url).pathname;
const cellDir = new URL("../../cell/", import.meta.url).pathname;

export interface LocalHome {
  url: string;
  token: string;
  child: ChildProcess;
  persist: string;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
  });
}

/** The home, or the sentence saying why it could not be started. */
export async function startHome(token: string): Promise<LocalHome | string> {
  const wrangler = join(cellDir, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wrangler)) return `wrangler is not installed at ${wrangler}`;
  let port: number;
  let inspector: number;
  try {
    // SHEEP_TEST_PORT pins the home's port, which is how the skip path is exercised: point it at a port in use.
    [port, inspector] = await Promise.all([process.env.SHEEP_TEST_PORT ? Number(process.env.SHEEP_TEST_PORT) : freePort(), freePort()]);
  } catch (error) {
    return `no port could be bound: ${error instanceof Error ? error.message : String(error)}`;
  }
  const persist = await mkdtemp(join(tmpdir(), "sheep-home-"));
  const child = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--port",
      String(port),
      "--inspector-port",
      String(inspector),
      "--persist-to",
      persist,
      "--var",
      `SHEEP_TOKEN:${token}`,
      "--var",
      "SHEEP_PROVIDER:faux",
      "--log-level",
      "error",
      "--show-interactive-dev-session=false",
    ],
    { cwd: cellDir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } },
  );
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && (await response.text()).startsWith("sheep")) return { url, token, child, persist };
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill("SIGTERM");
  await rm(persist, { recursive: true, force: true });
  return `wrangler dev did not answer on ${url} (exit ${child.exitCode}): ${output.trim().split("\n").slice(-3).join(" | ")}`;
}

export async function stopHome(home: LocalHome): Promise<void> {
  home.child.kill("SIGTERM");
  await new Promise((resolve) => home.child.once("exit", resolve));
  await rm(home.persist, { recursive: true, force: true });
}

export interface Result {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RunOptions {
  /** Bytes for the CLI's stdin; without it, stdin is closed at once. */
  stdin?: string | Uint8Array;
  cwd?: string;
}

/** Runs the built CLI against the home; never throws on a nonzero exit. */
export async function runSheep(home: LocalHome, args: readonly string[], options: RunOptions = {}): Promise<Result> {
  const env = { ...process.env, SHEEP_HOME: home.url, SHEEP_TOKEN: home.token, SHEEP_CONFIG: join(home.persist, "no-config"), NODE_NO_WARNINGS: "1" };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { env, cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

/** The test-only route: the faux program a cell (or every cell, at `/faux`) answers from. */
export async function scriptFaux(home: LocalHome, path: string, program: unknown): Promise<number> {
  const response = await fetch(`${home.url}${path}`, { method: "POST", headers: { authorization: `Bearer ${home.token}` }, body: JSON.stringify(program) });
  return response.status;
}
