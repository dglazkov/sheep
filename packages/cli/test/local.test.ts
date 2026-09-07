/**
 * The local home's bookkeeping, driven through `bin/sheep.js` with a temp
 * `SHEEP_LOCAL` and `SHEEP_CONFIG`: the pid file, the port check, and the
 * config sentence. Collar phase 1. The ring proves the home a user gets,
 * from the install; these hold the rules a record is judged by, which no
 * ring walks (a dead daemon, a port taken by something else), and the one
 * start, stop, and start on demand the checkout can do with its own
 * wrangler over `packages/cell`.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bin, type Result } from "./local-home.js";

const cellWrangler = new URL("../../cell/node_modules/wrangler/bin/wrangler.js", import.meta.url).pathname;

interface World {
  dir: string;
  local: string;
  config: string;
  sheep: (...args: string[]) => Promise<Result>;
}

/** A fresh `SHEEP_LOCAL` and `SHEEP_CONFIG`, and the CLI run against them with no home in the environment. */
async function world(): Promise<World> {
  const dir = await mkdtemp(join(tmpdir(), "sheep-local-"));
  const local = join(dir, "local");
  const config = join(dir, "config");
  const env = { ...process.env, SHEEP_LOCAL: local, SHEEP_CONFIG: config, NODE_NO_WARNINGS: "1" };
  delete env.SHEEP_HOME;
  delete env.SHEEP_TOKEN;
  const sheep = (...args: string[]): Promise<Result> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], { env, cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
    });
  return { dir, local, config, sheep };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createTcpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/** A pid nothing runs under any more: a Node that exited. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((resolve) => child.once("exit", resolve));
  return child.pid!;
}

/**
 * A zombie: a Node that exited under a parent that never waits for it
 * (`exec sleep` takes the shell's place and reaps nothing), which is what
 * a detached daemon becomes in a container with no init. `kill(pid, 0)`
 * keeps answering for it until the parent goes.
 */
async function zombiePid(): Promise<{ pid: number; reap: () => void }> {
  const parent = spawn("sh", ["-c", `"${process.execPath}" -e "console.log(process.pid)" & exec sleep 60`], { stdio: ["ignore", "pipe", "ignore"] });
  let out = "";
  const pid = await new Promise<number>((resolve) => {
    parent.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      if (out.includes("\n")) resolve(Number(out.trim()));
    });
  });
  const state = () => (spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim() || "?")[0];
  const deadline = Date.now() + 5_000;
  while (state() !== "Z" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
  expect(state()).toBe("Z");
  return { pid, reap: () => void parent.kill("SIGKILL") };
}

async function record(w: World, fields: { pid: number | null; port: number }): Promise<string> {
  await rm(w.local, { recursive: true, force: true });
  await mkdir(w.local, { recursive: true });
  const url = `http://127.0.0.1:${fields.port}`;
  await writeFile(join(w.local, "home.json"), JSON.stringify({ pid: fields.pid, port: fields.port, url, stamp: null, startedAt: "2026-09-07T00:00:00Z" }));
  await writeFile(w.config, JSON.stringify({ home: url, token: "t", local: true }));
  return url;
}

function listen(body: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((_request, response) => response.end(body));
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

const worlds: World[] = [];
afterAll(async () => {
  for (const w of worlds) {
    // Whatever daemon a failed test left behind goes with its directory; a record naming this runner's own pid is the port test's.
    try {
      const { pid } = JSON.parse(await readFile(join(w.local, "home.json"), "utf8")) as { pid: number | null };
      if (pid !== null && pid !== process.pid) process.kill(pid, "SIGTERM");
    } catch {
      // no record, or nothing to signal
    }
    await rm(w.dir, { recursive: true, force: true });
  }
});

describe("the local home's record", () => {
  it("is stale when its pid is dead: not running, and stop clears it without signalling anything", async () => {
    const w = await world();
    worlds.push(w);
    const url = await record(w, { pid: await deadPid(), port: await freePort() });

    const status = await w.sheep("home", "--json");
    expect(status.code).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ home: url, local: true, running: false, pid: null });
    expect((await w.sheep("home")).stdout).toBe(`home: ${url} (local, stopped)\n`);

    const stop = await w.sheep("home", "stop");
    expect(stop.code).toBe(0);
    expect(stop.stdout).toBe(`the local home at ${url} was not running\n`);
    expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ pid: null });
  });

  it("is stale when its pid is a zombie, though kill(pid, 0) answers for it: not running, and stop clears it at once", async () => {
    const w = await world();
    worlds.push(w);
    const zombie = await zombiePid();
    const sheepish = await listen("sheep\n");
    try {
      // The port answers sheep and the pid is in the table; only the state says the daemon is gone, as it is in a container with no init.
      const url = await record(w, { pid: zombie.pid, port: sheepish.port });
      expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toMatchObject({ home: url, running: false, pid: null });
      const started = Date.now();
      const stop = await w.sheep("home", "stop");
      expect(stop.code).toBe(0);
      expect(stop.stdout).toBe(`the local home at ${url} was not running\n`);
      expect(stop.stderr).toBe("");
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ pid: null });
    } finally {
      sheepish.server.close();
      zombie.reap();
    }
  });

  it("is stale when its pid is alive but the port answers as something else; running when the port answers sheep", async () => {
    const w = await world();
    worlds.push(w);
    // The test runner's own pid is alive for the whole test; what decides is who answers on the port.
    const other = await listen("nope\n");
    try {
      const url = await record(w, { pid: process.pid, port: other.port });
      const status = JSON.parse((await w.sheep("home", "--json")).stdout) as { running: boolean; home: string };
      expect(status).toMatchObject({ home: url, running: false });
      expect((await w.sheep("home")).stdout).toContain("(local, stopped)");
    } finally {
      other.server.close();
    }
    const sheepish = await listen("sheep\n");
    try {
      const url = await record(w, { pid: process.pid, port: sheepish.port });
      const status = JSON.parse((await w.sheep("home", "--json")).stdout) as { running: boolean; pid: number };
      expect(status).toMatchObject({ home: url, running: true, pid: process.pid });
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (local, running, pid ${process.pid})\n`);
    } finally {
      sheepish.server.close();
    }
  });

  it("names a home that is not local as such, and says so when there is none", async () => {
    const w = await world();
    worlds.push(w);
    const none = await w.sheep("home", "--json");
    expect(none.code).toBe(0);
    expect(JSON.parse(none.stdout)).toEqual({ home: null, local: false, answers: false });
    expect((await w.sheep("home")).stdout).toBe("home: (none); run `sheep home local`, or pass --home <url>\n");

    const sheepish = await listen("sheep\n");
    try {
      const url = `http://127.0.0.1:${sheepish.port}`;
      await writeFile(w.config, JSON.stringify({ home: url, token: "t" }));
      expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toEqual({ home: url, local: false, answers: true });
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (answers)\n`);
      // A --home overrides a local config, and is never the local home.
      await writeFile(w.config, JSON.stringify({ home: "http://127.0.0.1:1", token: "t", local: true }));
      expect(JSON.parse((await w.sheep("--home", url, "home", "--json")).stdout)).toEqual({ home: url, local: false, answers: true });
    } finally {
      sheepish.server.close();
    }
  });
});

describe.skipIf(!existsSync(cellWrangler))("sheep home local, in a checkout", () => {
  it("leaves a config naming another home alone with the sentence, writes the secrets mode 600, stops, and starts on demand", { timeout: 240_000 }, async () => {
    const w = await world();
    worlds.push(w);
    const foreign = JSON.stringify({ home: "https://elsewhere.example", token: "elsewhere" });
    await writeFile(w.config, foreign);

    // The config sentence: the local address, and that --home selects it for one command; the file is untouched.
    const started = await w.sheep("home", "local", "--faux");
    expect(started.stderr).toBe("");
    expect(started.code).toBe(0);
    const url = /^local home: (http:\/\/127\.0\.0\.1:\d+) \(started, pid (\d+)\)$/m.exec(started.stdout)?.[1];
    expect(url).toBeDefined();
    expect(started.stdout).toContain(`config: ${w.config} names https://elsewhere.example; --home ${url} selects the local home for one command`);
    expect(started.stdout).toContain('key: the faux provider answers every prompt with "ok"; no key is used');
    expect(await readFile(w.config, "utf8")).toBe(foreign);

    // The secrets file: mode 600, a generated token and the provider, no key; and the record beside it.
    const secretsPath = join(w.local, ".dev.vars");
    expect((await stat(secretsPath)).mode & 0o777).toBe(0o600);
    const secrets = await readFile(secretsPath, "utf8");
    const token = /^SHEEP_TOKEN=([0-9a-f]{48})$/m.exec(secrets)?.[1];
    expect(token).toBeDefined();
    expect(secrets).toMatch(/^SHEEP_PROVIDER=faux$/m);
    expect(secrets).not.toContain("SHEEP_ANTHROPIC_API_KEY");
    const home = JSON.parse(await readFile(join(w.local, "home.json"), "utf8")) as { pid: number; port: number; url: string; stamp: null };
    expect(home).toMatchObject({ url, stamp: null });
    expect(typeof home.pid).toBe("number");
    expect(url).toBe(`http://127.0.0.1:${home.port}`);

    // The home holds the token from the file: the door admits it and refuses without it.
    expect((await fetch(`${url}/sessions`)).status).toBe(401);
    expect((await fetch(`${url}/sessions`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);

    // A second call reports the running home; --json carries the same address and the wrangler it ran.
    const again = JSON.parse((await w.sheep("home", "local", "--faux", "--json")).stdout) as { home: string; state: string; pid: number; wrangler: { version: string } };
    expect(again).toMatchObject({ home: url, state: "running", pid: home.pid, wrangler: { version: "checkout" } });

    // Stop: the port refuses, the record keeps the port with its pid cleared, and `sheep home` says so.
    const stopped = await w.sheep("home", "stop");
    expect(stopped.code).toBe(0);
    expect(stopped.stdout).toBe(`stopped the local home at ${url}\n`);
    await expect(fetch(`${url}/`, { signal: AbortSignal.timeout(2_000) })).rejects.toThrow();
    expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ pid: null, port: home.port });

    // With no config, the start writes one with the marker; then a stop, and `sheep ls` starts the home on demand.
    await rm(w.config);
    const fresh = await w.sheep("home", "local", "--faux", "--json");
    expect(fresh.code).toBe(0);
    const freshUrl = (JSON.parse(fresh.stdout) as { home: string }).home;
    expect(JSON.parse(await readFile(w.config, "utf8"))).toEqual({ home: freshUrl, token, local: true });
    expect((await stat(w.config)).mode & 0o777).toBe(0o600);
    expect((await w.sheep("home", "stop")).stdout).toBe(`stopped the local home at ${freshUrl}\n`);

    const ls = await w.sheep("ls");
    expect(ls.code).toBe(0);
    expect(ls.stderr).toContain("sheep: the local home is not running; starting it\n");
    expect(ls.stdout).toBe("");
    const running = JSON.parse((await w.sheep("home", "--json")).stdout) as { running: boolean; home: string };
    expect(running.running).toBe(true);
    expect((await w.sheep("home", "stop")).stdout).toBe(`stopped the local home at ${running.home}\n`);
  });
});
