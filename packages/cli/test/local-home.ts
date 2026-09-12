/**
 * A local home for the CLI's tests: `wrangler dev` on a free port with the
 * faux provider, and `bin/sheep.js` driven as a child process against it.
 * Started once per test file; a file skips, with a message, when the home
 * cannot be started here. Factored out of journey 5's test for pasture
 * phase 0, which drives the same binary against the same kind of home.
 *
 * Collar phase 1: with `SHEEP_TEST_HOME` set, a home that is already up
 * (the installed `sheep home local --faux`, in a ring or kept from one)
 * is used instead of spawning, with `SHEEP_TEST_TOKEN` as its token, and
 * `stopHome` leaves it running. That is how journey 5's file runs against
 * the home a user gets, not the checkout's.
 *
 * Bell phase 0 adds `streamSheep` beside `runSheep`: the same child, with
 * stdout read line by line while it runs rather than collected at its
 * exit, for the one thing a collected buffer cannot say — when a line was
 * written.
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
  /** The `wrangler dev` this helper spawned; absent for a home that was already up (`SHEEP_TEST_HOME`). */
  child?: ChildProcess;
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
  if (process.env.SHEEP_TEST_HOME) {
    const url = process.env.SHEEP_TEST_HOME.replace(/\/+$/, "");
    const given = process.env.SHEEP_TEST_TOKEN ?? token;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (!response.ok || !(await response.text()).startsWith("sheep")) return `SHEEP_TEST_HOME=${url} does not answer as a sheep home`;
    } catch (error) {
      return `SHEEP_TEST_HOME=${url} does not answer: ${error instanceof Error ? error.message : String(error)}`;
    }
    // A scratch directory all the same: `runSheep` makes it the CLI's HOME, so the kennel it falls back to holds no config.
    return { url, token: given, persist: await mkdtemp(join(tmpdir(), "sheep-home-")) };
  }
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
  const { child } = home;
  if (child !== undefined) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
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

/**
 * Runs the built CLI against the home; never throws on a nonzero exit.
 * `HOME` is the scratch directory, so the fallback kennel is empty and no
 * config of this machine's is read; the address and token come from the
 * environment, which outranks any config a working directory might find.
 */
export async function runSheep(home: LocalHome, args: readonly string[], options: RunOptions = {}): Promise<Result> {
  const env = { ...process.env, SHEEP_HOME: home.url, SHEEP_TOKEN: home.token, HOME: home.persist, NODE_NO_WARNINGS: "1" };
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

/** One line of a child's stdout, as it was read rather than as it was collected. */
export interface Line {
  /** The bytes of the line, without its newline. */
  text: string;
  /** Milliseconds from the spawn to the moment the line came off the pipe. */
  at: number;
  /** Whether the child was still running when it came off. */
  running: boolean;
}

export interface Streamed extends Result {
  /** stdout's lines in order, each with when it arrived. */
  lines: Line[];
  /** Milliseconds from the spawn to the child's exit. */
  exited: number;
}

/**
 * The built CLI as `runSheep` runs it, with stdout read line by line while
 * the child runs instead of collected at its exit. Bell phase 0 needs this
 * and `runSheep` cannot give it: "the tool call's line is written before
 * the turn ends" is a claim about *when* bytes left the process, and a
 * buffer read after `close` cannot tell a stream from a burst — every line
 * of a burst would carry the same time and pass either way. So each line
 * carries its own arrival, taken as the chunk is read, and the child's exit
 * is timed beside it; the proof is the gap between them.
 */
export async function streamSheep(home: LocalHome, args: readonly string[], options: RunOptions = {}): Promise<Streamed> {
  const env = { ...process.env, SHEEP_HOME: home.url, SHEEP_TOKEN: home.token, HOME: home.persist, NODE_NO_WARNINGS: "1" };
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { env, cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
    const lines: Line[] = [];
    const err: Buffer[] = [];
    let stdout = "";
    let pending = "";
    let exited = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const running = child.exitCode === null && child.signalCode === null;
      const at = Date.now() - started;
      stdout += text;
      pending += text;
      const split = pending.split("\n");
      pending = split.pop() ?? "";
      for (const line of split) lines.push({ text: line, at, running });
    });
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("exit", () => (exited = Date.now() - started));
    child.once("error", reject);
    child.once("close", (code) => {
      if (pending !== "") lines.push({ text: pending, at: Date.now() - started, running: false });
      resolve({ stdout, stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1, lines, exited });
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

/** The test-only route: the faux program a cell (or every cell, at `/faux`) answers from. */
export async function scriptFaux(home: LocalHome, path: string, program: unknown): Promise<number> {
  const response = await fetch(`${home.url}${path}`, { method: "POST", headers: { authorization: `Bearer ${home.token}` }, body: JSON.stringify(program) });
  return response.status;
}
