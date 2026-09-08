/**
 * The local home's bookkeeping, driven through `bin/sheep.js` in a temp
 * directory that is a kennel, with `HOME` pointed there too: the pid file,
 * the port check, and the config sentence. Collar phase 1; kennel phase 0
 * retired the two variables that used to make this world, so the world is
 * now a working directory holding `.sheep/` and nothing else.
 *
 * The ring proves the home a user gets,
 * from the install; these hold the rules a record is judged by, which no
 * ring walks (a dead daemon, a port taken by something else), and the one
 * start, stop, and start on demand the checkout can do with its own
 * wrangler over `packages/cell`, with `--no-container`, since a checkout
 * with Docker would build the Dockerfile.
 *
 * Station phase 4: the container choice, through two seams the rings
 * strip: `SHEEP_TEST_DOCKER=present|absent` in place of `docker version`,
 * and `SHEEP_TEST_WRANGLER`, the fake in `fake-wrangler.mjs` playing
 * `dev`, whose log holds the daemon's arguments and whose `/home` reports
 * the environment it was given. The real daemon with a container is the
 * package ring's with `--docker`, on a machine with Docker.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { deriveLocalConfig, LOCAL_IDLE, NO_DOCKER_SENTENCE, skewLine } from "../src/local.js";
import { bin, type Result } from "./local-home.js";

/** This command's side of `sheep home`'s build report, in a checkout: the value, with no time. */
const CHECKOUT = { commit: "0.0.0-checkout", builtAt: null };

const cellWrangler = new URL("../../cell/node_modules/wrangler/bin/wrangler.js", import.meta.url).pathname;
const fakeWrangler = new URL("./fake-wrangler.mjs", import.meta.url).pathname;
const cellConfig = new URL("../../cell/wrangler.jsonc", import.meta.url).pathname;

/** A release's config, as `scripts/bundle.mjs` ships it: `main` beside it, the pen container a registry image by digest; comments as JSONC allows. */
const IMAGE = "docker.io/dglazkov2/sheep-pen@sha256:ca161d749bbf418cea829cd7cce668bddd43741d1f493805f8ff8c639cebcf64";
const releaseConfig = `// GENERATED\n{
  "name": "sheep",
  "main": "worker.mjs",
  "no_bundle": true,
  "compatibility_date": "2026-08-22",
  "vars": { "SHEEP_MODEL": "claude-sonnet-5" },
  "env": {
    "pen": {
      "name": "sheep-pen",
      "containers": [{ "image": "${IMAGE}", "class_name": "PenContainer", "instance_type": "basic", "max_instances": 3 }],
      "worker_loaders": [{ "binding": "LOADER" }],
      "vars": { "SHEEP_MODEL": "claude-sonnet-5", "PEN_IDLE": "10m" }
    }
  }
}\n`;

interface World {
  dir: string;
  kennel: string;
  local: string;
  config: string;
  sheep: (...args: string[]) => Promise<Result>;
  /** The same command with more in its environment: the two seams of station phase 4. */
  sheepWith: (extra: Record<string, string>, ...args: string[]) => Promise<Result>;
}

/**
 * A fresh kennel: a temp directory holding `.sheep/`, run in as the
 * working directory, with `HOME` pointed at it as well so the fallback is
 * the same empty place and nothing of this machine's is read. The path is
 * a real one: on macOS the CLI's own `process.cwd()` is the realpath under
 * `/private/var`, and the report prints what it resolved.
 */
async function world(): Promise<World> {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-local-")));
  const kennel = join(dir, ".sheep");
  await mkdir(kennel);
  const local = join(kennel, "local");
  const config = join(kennel, "config");
  // No Docker, as far as every command here is told (station phase 4): GitHub's runners have Docker, and a real `sheep home
  // local` from the checkout's config would otherwise build packages/pen's image, minutes of a build on Linux where
  // host.docker.internal is not there either. The checkout's container path is the shepherd's laptop's, walked by the
  // package ring with --docker; the seam tests below say `present` themselves, through `sheepWith`, and run a fake wrangler.
  const env = { ...process.env, HOME: dir, NODE_NO_WARNINGS: "1", SHEEP_TEST_DOCKER: "absent" };
  delete env.SHEEP_HOME;
  delete env.SHEEP_TOKEN;
  const sheepWith = (extra: Record<string, string>, ...args: string[]): Promise<Result> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], { env: { ...env, ...extra }, cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
    });
  const sheep = (...args: string[]): Promise<Result> => sheepWith({}, ...args);
  return { dir, kennel, local, config, sheep, sheepWith };
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

async function record(w: World, fields: { pid: number | null; port: number; container?: boolean }): Promise<string> {
  await rm(w.local, { recursive: true, force: true });
  await mkdir(w.local, { recursive: true });
  const url = `http://127.0.0.1:${fields.port}`;
  // A record from before station phase 4 has no `container`, and reads as false.
  await writeFile(join(w.local, "home.json"), JSON.stringify({ pid: fields.pid, port: fields.port, url, stamp: null, startedAt: "2026-09-07T00:00:00Z", ...(fields.container === undefined ? {} : { container: fields.container }) }));
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
    expect((await w.sheep("home")).stdout).toBe(`home: ${url} (local, stopped)\nkennel: ${w.kennel}\n`);

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
      expect(status).toMatchObject({ home: url, running: true, pid: process.pid, container: false });
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (local, running, pid ${process.pid})\nkennel: ${w.kennel}\ncontainer: no\n`);
    } finally {
      sheepish.server.close();
    }
  });

  it("names a home that is not local as such, and says so when there is none", async () => {
    const w = await world();
    worlds.push(w);
    const none = await w.sheep("home", "--json");
    expect(none.code).toBe(0);
    expect(JSON.parse(none.stdout)).toEqual({ home: null, kennel: w.kennel, name: null, local: false, answers: false, build: { home: null, cli: CHECKOUT }, image: null });
    expect((await w.sheep("home")).stdout).toBe(`home: (none); run \`sheep home local\`, or pass --home <url>\nkennel: ${w.kennel}\n`);

    const sheepish = await listen("sheep\n");
    try {
      const url = `http://127.0.0.1:${sheepish.port}`;
      await writeFile(w.config, JSON.stringify({ home: url, token: "t" }));
      // A home that answers `sheep` but not `GET /home` (this fake) has no build side: null, and the prose is the plain one.
      expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toEqual({ home: url, kennel: w.kennel, name: null, local: false, answers: true, build: { home: null, cli: CHECKOUT }, image: null });
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (answers)\nkennel: ${w.kennel}\n`);
      // The station's name, once a deploy has recorded it (kennel phase 1): read like home, in JSON always and in prose as its own line.
      await writeFile(w.config, JSON.stringify({ home: url, token: "t", name: "blog" }));
      expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toEqual({ home: url, kennel: w.kennel, name: "blog", local: false, answers: true, build: { home: null, cli: CHECKOUT }, image: null });
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (answers)\nkennel: ${w.kennel}\nname: blog\n`);
      // A --home overrides a local config, and is never the local home.
      await writeFile(w.config, JSON.stringify({ home: "http://127.0.0.1:1", token: "t", local: true }));
      expect(JSON.parse((await w.sheep("--home", url, "home", "--json")).stdout)).toEqual({ home: url, kennel: w.kennel, name: null, local: false, answers: true, build: { home: null, cli: CHECKOUT }, image: null });
    } finally {
      sheepish.server.close();
    }
  });
});

/** A home that answers `sheep` at the door and the given build from `GET /home`, with the token checked there. */
function listenHome(build: unknown, token = "t"): Promise<{ server: Server; port: number; asked: string[] }> {
  const asked: string[] = [];
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      asked.push(`${request.method} ${request.url} ${request.headers.authorization ?? "(no token)"}`);
      if (request.url === "/home") {
        if (request.headers.authorization !== `Bearer ${token}`) {
          response.statusCode = 401;
          return response.end("bad or missing token");
        }
        response.setHeader("content-type", "application/json");
        return response.end(JSON.stringify({ serverId: "fake", container: false, build }));
      }
      response.end("sheep\n");
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port, asked }));
  });
}

describe("the two stamps (station phase 0)", () => {
  // Eight CLI spawns; on a GitHub runner each takes most of a second (collar phase 3), so the default 5s is not enough.
  it("prints the home's build beside this command's, in prose and in JSON, with the token at GET /home", { timeout: 60_000 }, async () => {
    const w = await world();
    worlds.push(w);
    const stamped = await listenHome({ commit: "1fc8d03", builtAt: "2026-09-07T20:00:00Z" });
    try {
      const url = `http://127.0.0.1:${stamped.port}`;
      await writeFile(w.config, JSON.stringify({ home: url, token: "t" }));
      const json = await w.sheep("home", "--json");
      expect(json.code).toBe(0);
      expect(JSON.parse(json.stdout)).toEqual({ home: url, kennel: w.kennel, name: null, local: false, answers: true, build: { home: { commit: "1fc8d03", builtAt: "2026-09-07T20:00:00Z" }, cli: CHECKOUT }, image: null });
      const prose = await w.sheep("home");
      expect(prose.stdout).toBe(`home: ${url} (answers)\nkennel: ${w.kennel}\nhome build: 1fc8d03 (2026-09-07T20:00:00Z)\ncli build: 0.0.0-checkout (unstamped)\n`);
      // A checkout on one side is reported, never warned about.
      expect(prose.stderr).toBe("");
      expect(stamped.asked).toContain("GET /home Bearer t");

      // The local case reads the same route through the record's address; the record's pid is this runner's, alive.
      await record(w, { pid: process.pid, port: stamped.port });
      const local = await w.sheep("home", "--json");
      expect(JSON.parse(local.stdout)).toMatchObject({ home: url, local: true, running: true, build: { home: { commit: "1fc8d03", builtAt: "2026-09-07T20:00:00Z" }, cli: CHECKOUT } });
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (local, running, pid ${process.pid})\nkennel: ${w.kennel}\ncontainer: no\nhome build: 1fc8d03 (2026-09-07T20:00:00Z)\ncli build: 0.0.0-checkout (unstamped)\n`);
    } finally {
      stamped.server.close();
    }

    // A home from before the stamp answers /home without one: unstamped, like a checkout.
    const unstamped = await listenHome(undefined);
    try {
      const url = `http://127.0.0.1:${unstamped.port}`;
      await writeFile(w.config, JSON.stringify({ home: url, token: "t" }));
      expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toMatchObject({ build: { home: CHECKOUT, cli: CHECKOUT } });
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (answers)\nkennel: ${w.kennel}\nhome build: 0.0.0-checkout (unstamped)\ncli build: 0.0.0-checkout (unstamped)\n`);
    } finally {
      unstamped.server.close();
    }

    // The wrong token: the door answers sheep, /home refuses, and the home's side is null with the plain prose.
    const refused = await listenHome({ commit: "1fc8d03", builtAt: "2026-09-07T20:00:00Z" }, "other");
    try {
      const url = `http://127.0.0.1:${refused.port}`;
      await writeFile(w.config, JSON.stringify({ home: url, token: "t" }));
      expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toMatchObject({ answers: true, build: { home: null, cli: CHECKOUT } });
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (answers)\nkennel: ${w.kennel}\n`);
    } finally {
      refused.server.close();
    }
  });

  it("warns in one line when both sides are stamped and differ, naming the older one and its fix; says nothing otherwise", () => {
    const older = { commit: "aaaaaaa", builtAt: "2026-09-07T10:00:00Z" };
    const newer = { commit: "bbbbbbb", builtAt: "2026-09-07T20:00:00Z" };
    expect(skewLine(older, newer, false)).toBe("sheep: the home's build aaaaaaa (2026-09-07T10:00:00Z) is older than this command's bbbbbbb (2026-09-07T20:00:00Z); `sheep home deploy` from this package updates it\n");
    expect(skewLine(older, newer, true)).toBe("sheep: the home's build aaaaaaa (2026-09-07T10:00:00Z) is older than this command's bbbbbbb (2026-09-07T20:00:00Z); `sheep home stop`; the next command restarts it from this package\n");
    expect(skewLine(newer, older, false)).toBe("sheep: this command's build aaaaaaa (2026-09-07T10:00:00Z) is older than the home's bbbbbbb (2026-09-07T20:00:00Z); `npm install -g github:dglazkov/sheep#release` updates it\n");
    expect(skewLine(newer, older, true)).toBe(skewLine(newer, older, false));
    // Equal stamps, and a checkout on either side: nothing.
    expect(skewLine(newer, { ...newer }, false)).toBeUndefined();
    expect(skewLine(CHECKOUT, newer, false)).toBeUndefined();
    expect(skewLine(newer, CHECKOUT, true)).toBeUndefined();
    expect(skewLine(CHECKOUT, CHECKOUT, true)).toBeUndefined();
  });
});

describe.skipIf(!existsSync(cellWrangler))("sheep home local, in a checkout", () => {
  // The real wrangler dev over packages/cell/wrangler.jsonc, told there is no Docker (see `world`) and asked for no container
  // besides, so the home is collar's whatever the machine has; the start on demand then reads the record's `container: false`.
  it("leaves a config naming another home alone with the sentence, writes the secrets mode 600, stops, and starts on demand", { timeout: 240_000 }, async () => {
    const w = await world();
    worlds.push(w);
    const foreign = JSON.stringify({ home: "https://elsewhere.example", token: "elsewhere" });
    await writeFile(w.config, foreign);

    // The config sentence: the local address, and that --home selects it for one command; the file is untouched.
    const started = await w.sheep("home", "local", "--faux", "--no-container");
    expect(started.stderr).toBe("");
    expect(started.code).toBe(0);
    const url = /^local home: (http:\/\/127\.0\.0\.1:\d+) \(started, pid (\d+)\)$/m.exec(started.stdout)?.[1];
    expect(url).toBeDefined();
    expect(started.stdout).toContain(`kennel: ${w.kennel}\nfiles: ${w.local}\n`);
    expect(started.stdout).toContain(`config: ${w.config} names https://elsewhere.example; --home ${url} selects the local home for one command`);
    expect(started.stdout).toContain('key: the faux provider answers every prompt with "ok"; no key is used');
    expect(started.stdout).toMatch(/^container: none; --no-container$/m);
    expect(await readFile(w.config, "utf8")).toBe(foreign);

    // The secrets file: mode 600, a generated token and the provider, no key; and the record beside it.
    const secretsPath = join(w.local, ".dev.vars");
    expect((await stat(secretsPath)).mode & 0o777).toBe(0o600);
    const secrets = await readFile(secretsPath, "utf8");
    const token = /^SHEEP_TOKEN=([0-9a-f]{48})$/m.exec(secrets)?.[1];
    expect(token).toBeDefined();
    expect(secrets).toMatch(/^SHEEP_PROVIDER=faux$/m);
    expect(secrets).not.toContain("SHEEP_ANTHROPIC_API_KEY");
    const home = JSON.parse(await readFile(join(w.local, "home.json"), "utf8")) as { pid: number; port: number; url: string; stamp: null; container: boolean };
    expect(home).toMatchObject({ url, stamp: null, container: false });
    expect(typeof home.pid).toBe("number");
    expect(url).toBe(`http://127.0.0.1:${home.port}`);

    // The home holds the token from the file: the door admits it and refuses without it.
    expect((await fetch(`${url}/sessions`)).status).toBe(401);
    expect((await fetch(`${url}/sessions`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);

    // A second call reports the running home; --json carries the same address and the wrangler it ran.
    const again = JSON.parse((await w.sheep("home", "local", "--faux", "--no-container", "--json")).stdout) as { home: string; state: string; pid: number; wrangler: { version: string } };
    expect(again).toMatchObject({ home: url, state: "running", pid: home.pid, wrangler: { version: "checkout" }, container: "none" });

    // Stop: the port refuses, the record keeps the port with its pid cleared, and `sheep home` says so.
    const stopped = await w.sheep("home", "stop");
    expect(stopped.code).toBe(0);
    expect(stopped.stdout).toBe(`stopped the local home at ${url}\n`);
    await expect(fetch(`${url}/`, { signal: AbortSignal.timeout(2_000) })).rejects.toThrow();
    expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ pid: null, port: home.port });

    // With no config, the start writes one with the marker; then a stop, and `sheep ls` starts the home on demand.
    await rm(w.config);
    const fresh = await w.sheep("home", "local", "--faux", "--no-container", "--json");
    expect(fresh.code).toBe(0);
    const freshUrl = (JSON.parse(fresh.stdout) as { home: string }).home;
    expect(JSON.parse(await readFile(w.config, "utf8"))).toEqual({ home: freshUrl, token, local: true });
    expect((await stat(w.config)).mode & 0o777).toBe(0o600);
    expect((await w.sheep("home", "stop")).stdout).toBe(`stopped the local home at ${freshUrl}\n`);

    // A name a deploy recorded (kennel phase 1) survives the rewrite a start does when the address moved: the file is
    // rewritten with the real address and the name kept, and `sheep home` prints it.
    await writeFile(w.config, JSON.stringify({ home: "http://127.0.0.1:1", token, local: true, name: "blog" }));
    const named = await w.sheep("home", "local", "--faux", "--no-container", "--json");
    expect(named.code).toBe(0);
    const namedUrl = (JSON.parse(named.stdout) as { home: string; config: { wrote: boolean } }).home;
    expect((JSON.parse(named.stdout) as { config: { wrote: boolean } }).config.wrote).toBe(true);
    expect(JSON.parse(await readFile(w.config, "utf8"))).toEqual({ home: namedUrl, token, local: true, name: "blog" });
    const namedStatus = JSON.parse((await w.sheep("home", "--json")).stdout) as { name: string | null; pid: number };
    expect(namedStatus.name).toBe("blog");
    // A running home answers GET /home: both stamps are printed, the checkout's on both sides (station phase 0).
    expect((await w.sheep("home")).stdout).toBe(`home: ${namedUrl} (local, running, pid ${namedStatus.pid})\nkennel: ${w.kennel}\nname: blog\ncontainer: no\nhome build: 0.0.0-checkout (unstamped)\ncli build: 0.0.0-checkout (unstamped)\n`);
    expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toMatchObject({ build: { home: { commit: "0.0.0-checkout", builtAt: null }, cli: { commit: "0.0.0-checkout", builtAt: null } } });
    expect((await w.sheep("home", "stop")).stdout).toBe(`stopped the local home at ${namedUrl}\n`);
    await writeFile(w.config, JSON.stringify({ home: namedUrl, token, local: true }));

    const ls = await w.sheep("ls");
    expect(ls.code).toBe(0);
    expect(ls.stderr).toContain("sheep: the local home is not running; starting it\n");
    expect(ls.stdout).toBe("");
    const running = JSON.parse((await w.sheep("home", "--json")).stdout) as { running: boolean; home: string; container: boolean };
    expect(running).toMatchObject({ running: true, container: false });
    expect((await w.sheep("home", "stop")).stdout).toBe(`stopped the local home at ${running.home}\n`);
  });
});

/** The daemon's arguments as the fake wrangler logged them, last call first. */
async function loggedArgs(log: string): Promise<string[][]> {
  const lines = (await readFile(log, "utf8")).trim().split("\n").filter(Boolean);
  return lines.map((line) => (JSON.parse(line) as { args: string[] }).args).reverse();
}

describe("the container (station phase 4)", () => {
  it("derives the local config from a release's: main absolute, the pen container a one-line Dockerfile FROM the config's image, everything else kept; a checkout's is run as it is", () => {
    const derived = deriveLocalConfig(releaseConfig, "/opt/sheep/home/wrangler.jsonc");
    expect(derived).toBeDefined();
    expect(derived!.dockerfile).toBe(`FROM ${IMAGE}\n`);
    expect(derived!.image).toBe(IMAGE);
    const config = JSON.parse(derived!.text) as { main: string; name: string; no_bundle: boolean; vars: unknown; env: { pen: { name: string; containers: unknown[]; worker_loaders: unknown; vars: unknown } } };
    expect(config.main).toBe("/opt/sheep/home/worker.mjs");
    expect(config.env.pen.containers).toEqual([{ image: "./Dockerfile", image_build_context: ".", class_name: "PenContainer", instance_type: "basic", max_instances: 3 }]);
    expect(config).toMatchObject({ name: "sheep", no_bundle: true, vars: { SHEEP_MODEL: "claude-sonnet-5" }, env: { pen: { name: "sheep-pen", worker_loaders: [{ binding: "LOADER" }], vars: { SHEEP_MODEL: "claude-sonnet-5", PEN_IDLE: "10m" } } } });
    expect("$schema" in config).toBe(false);
    // The image is copied, never named: a different reference in the base is a different line.
    expect(deriveLocalConfig(releaseConfig.replace(IMAGE, "docker.io/dglazkov2/sheep-pen:2b71e46"), "/opt/sheep/home/wrangler.jsonc")!.dockerfile).toBe("FROM docker.io/dglazkov2/sheep-pen:2b71e46\n");
    // The checkout's config names ../pen/Dockerfile, which exists beside it: nothing to derive.
    expect(deriveLocalConfig(readFileSync(cellConfig, "utf8"), cellConfig)).toBeUndefined();
    // A base with no pen container, or no image, is refused.
    expect(() => deriveLocalConfig('{ "main": "worker.mjs", "env": { "pen": {} } }', "/opt/sheep/home/wrangler.jsonc")).toThrow("exactly one container");
    expect(() => deriveLocalConfig('{ "main": "worker.mjs", "env": { "pen": { "containers": [{ "class_name": "PenContainer" }] } } }', "/opt/sheep/home/wrangler.jsonc")).toThrow("names no image");
  });

  it("rents one when Docker answers, none with --no-container or without Docker, records the choice, honours it on demand, and restarts on a change", { timeout: 120_000 }, async () => {
    const w = await world();
    worlds.push(w);
    const log = join(w.dir, "wrangler.log");
    const seams = { SHEEP_TEST_WRANGLER: fakeWrangler, SHEEP_TEST_WRANGLER_LOG: log };
    const withDocker = { ...seams, SHEEP_TEST_DOCKER: "present" };
    const noDocker = { ...seams, SHEEP_TEST_DOCKER: "absent" };
    const parseReport = (result: Result) => JSON.parse(result.stdout) as { home: string; port: number; pid: number; state: string; container: string; reason: string; docker: string | null; origin: string | null; idle: string | null };

    // Without Docker: collar's home, the record says so, and the report carries the one sentence.
    const none = await w.sheepWith(noDocker, "home", "local", "--faux", "--json");
    expect(none.code).toBe(0);
    const noneReport = parseReport(none);
    expect(noneReport).toMatchObject({ state: "started", container: "none", reason: NO_DOCKER_SENTENCE, docker: null, origin: null, idle: null });
    expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ pid: noneReport.pid, container: false });
    const [noneArgs] = await loggedArgs(log);
    expect(noneArgs).not.toContain("--env");
    expect(noneArgs).not.toContain("--var");
    expect(noneArgs).not.toContain("--name");
    const noneProse = await w.sheepWith(noDocker, "home", "local", "--faux");
    expect(noneProse.stdout).toContain(`container: none; ${NO_DOCKER_SENTENCE}\n`);
    expect(noneProse.stdout).toContain("(running, pid ");
    expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toMatchObject({ running: true, pid: noneReport.pid, container: false });

    // Docker arrives: the same command restarts the home with the pen environment, named sheep, with the origin and the short idle.
    const rented = await w.sheepWith(withDocker, "home", "local", "--faux", "--json");
    expect(rented.code).toBe(0);
    expect(rented.stderr).toBe("sheep: the local home had no container and Docker answers; restarting it with one\n");
    const rentedReport = parseReport(rented);
    const port = noneReport.port;
    const origin = process.platform === "linux" ? `http://172.17.0.1:${port}` : `http://host.docker.internal:${port}`;
    expect(rentedReport).toMatchObject({ home: noneReport.home, state: "restarted", container: "running", reason: "Docker (test/present) answered", docker: "test/present", origin, idle: LOCAL_IDLE });
    expect(rentedReport.pid).not.toBe(noneReport.pid);
    expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ pid: rentedReport.pid, port, container: true });
    const [rentedArgs] = await loggedArgs(log);
    expect(rentedArgs.slice(0, 6)).toEqual(["dev", "--local", "--env", "pen", "--name", "sheep"]);
    expect(rentedArgs).toContain("--config");
    expect(rentedArgs[rentedArgs.indexOf("--env-file") + 1]).toBe(join(w.local, ".dev.vars"));
    expect(rentedArgs[rentedArgs.indexOf("--port") + 1]).toBe(String(port));
    expect(rentedArgs.slice(-4)).toEqual(["--var", `PEN_CELL_ORIGIN:${origin}`, "--var", `PEN_IDLE:${LOCAL_IDLE}`]);
    if (process.platform === "linux") expect(rentedArgs[rentedArgs.indexOf("--ip") + 1]).toBe("0.0.0.0");
    else expect(rentedArgs).not.toContain("--ip");
    // In a checkout the daemon runs the cell's config as it is: nothing derived, and no derived files written.
    expect((JSON.parse(rented.stdout) as { daemonConfig: unknown }).daemonConfig).toEqual({ path: cellConfig, derived: false, from: null });
    expect(rentedArgs[rentedArgs.indexOf("--config") + 1]).toBe(cellConfig);
    expect(existsSync(join(w.local, "Dockerfile"))).toBe(false);
    // `sheep home` reads the record's choice, and the home (the fake, given --env pen) agrees.
    const status = JSON.parse((await w.sheep("home", "--json")).stdout) as { running: boolean; container: boolean; pid: number };
    expect(status).toMatchObject({ running: true, container: true, pid: rentedReport.pid });
    expect((await w.sheep("home")).stdout).toBe(`home: ${noneReport.home} (local, running, pid ${rentedReport.pid})\nkennel: ${w.kennel}\ncontainer: yes\nhome build: 0.0.0-checkout (unstamped)\ncli build: 0.0.0-checkout (unstamped)\n`);
    // The same choice again: running, nothing restarted.
    const same = parseReport(await w.sheepWith(withDocker, "home", "local", "--faux", "--json"));
    expect(same).toMatchObject({ state: "running", pid: rentedReport.pid, container: "running" });

    // Stopped, then started on demand: the record's choice, a container, without anyone asking. Under the seam the stop reaches
    // no container of the machine's: containersRemoved is 0 and the prose has no second line.
    const stoppedWithContainer = await w.sheep("home", "stop", "--json");
    expect(JSON.parse(stoppedWithContainer.stdout)).toMatchObject({ stopped: true, home: noneReport.home, containersRemoved: 0 });
    const onDemand = await w.sheepWith(withDocker, "ls");
    expect(onDemand.stderr).toContain("sheep: the local home is not running; starting it\n");
    expect(onDemand.code).toBe(0);
    const [onDemandArgs] = await loggedArgs(log);
    expect(onDemandArgs.slice(0, 6)).toEqual(["dev", "--local", "--env", "pen", "--name", "sheep"]);
    expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ container: true });

    // --no-container with Docker present: restarted without one, the record and the arguments say so, and the reason names the flag.
    const refused = await w.sheepWith(withDocker, "home", "local", "--faux", "--no-container", "--json");
    expect(refused.stderr).toBe("sheep: the local home had a container; restarting it without one\n");
    expect(parseReport(refused)).toMatchObject({ state: "restarted", container: "none", reason: "--no-container", docker: null, origin: null });
    expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ container: false });
    const [refusedArgs] = await loggedArgs(log);
    expect(refusedArgs).not.toContain("--env");
    expect(refusedArgs).not.toContain("--var");
    expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toMatchObject({ running: true, container: false });

    // On demand with a record that asks for a container while Docker is gone: started without one, and said on stderr.
    await w.sheepWith(withDocker, "home", "local", "--faux", "--json");
    expect((await w.sheep("home", "stop")).code).toBe(0);
    const gone = await w.sheepWith(noDocker, "ls");
    expect(gone.stderr).toContain("sheep: the local home was started with a container and Docker does not answer now; starting it without one\n");
    expect(gone.code).toBe(0);
    const [goneArgs] = await loggedArgs(log);
    expect(goneArgs).not.toContain("--env");
    expect(JSON.parse(await readFile(join(w.local, "home.json"), "utf8"))).toMatchObject({ container: false });
    expect((await w.sheep("home", "stop")).code).toBe(0);
  });

  it("runs a release's config through the derived one and its Dockerfile, rewritten at every start", { timeout: 60_000 }, async () => {
    const w = await world();
    worlds.push(w);
    const base = join(w.dir, "home", "wrangler.jsonc");
    await mkdir(join(w.dir, "home"));
    await writeFile(base, releaseConfig);
    const log = join(w.dir, "wrangler.log");
    const withDocker = { SHEEP_TEST_WRANGLER: fakeWrangler, SHEEP_TEST_WRANGLER_LOG: log, SHEEP_TEST_DOCKER: "present", SHEEP_TEST_LOCAL_CONFIG: base };
    const started = await w.sheepWith(withDocker, "home", "local", "--faux", "--json");
    expect(started.code).toBe(0);
    const report = JSON.parse(started.stdout) as { container: string; daemonConfig: { path: string; derived: boolean; from: string | null } };
    const derivedPath = join(w.local, "wrangler.jsonc");
    expect(report.container).toBe("running");
    expect(report.daemonConfig).toEqual({ path: derivedPath, derived: true, from: IMAGE });
    const [args] = await loggedArgs(log);
    expect(args.slice(0, 6)).toEqual(["dev", "--local", "--env", "pen", "--name", "sheep"]);
    expect(args[args.indexOf("--config") + 1]).toBe(derivedPath);
    expect(await readFile(join(w.local, "Dockerfile"), "utf8")).toBe(`FROM ${IMAGE}\n`);
    const written = JSON.parse(await readFile(derivedPath, "utf8")) as { main: string; env: { pen: { containers: { image: string; image_build_context: string }[] } } };
    expect(written.main).toBe(join(w.dir, "home", "worker.mjs"));
    expect(written.env.pen.containers[0]).toMatchObject({ image: "./Dockerfile", image_build_context: "." });
    // The prose names the derived config and the line.
    const prose = await w.sheepWith(withDocker, "home", "local", "--faux");
    expect(prose.stdout).toContain(`daemon config: ${derivedPath} (derived from the package's; the container is FROM ${IMAGE})\n`);
    // Rewritten at every start: a stale Dockerfile is replaced when the home restarts without, then with, a container.
    expect((await w.sheep("home", "stop")).code).toBe(0);
    await writeFile(join(w.local, "Dockerfile"), "FROM scratch\n");
    const again = JSON.parse((await w.sheepWith(withDocker, "home", "local", "--faux", "--json")).stdout) as { state: string; daemonConfig: { derived: boolean } };
    expect(again).toMatchObject({ state: "started", daemonConfig: { derived: true } });
    expect(await readFile(join(w.local, "Dockerfile"), "utf8")).toBe(`FROM ${IMAGE}\n`);
    // Without a container the daemon runs the base as it is, whatever is under local/.
    const none = JSON.parse((await w.sheepWith(withDocker, "home", "local", "--faux", "--no-container", "--json")).stdout) as { daemonConfig: unknown };
    expect(none.daemonConfig).toEqual({ path: base, derived: false, from: null });
    const [noneArgs] = await loggedArgs(log);
    expect(noneArgs[noneArgs.indexOf("--config") + 1]).toBe(base);
    expect((await w.sheep("home", "stop")).code).toBe(0);
  });

  it("treats a record whose container choice the home contradicts as stale: not running", async () => {
    const w = await world();
    worlds.push(w);
    // The fake home answers GET /home with container false; the record says true; the pid is this runner's, alive.
    const home = await listenHome({ commit: "1fc8d03", builtAt: "2026-09-07T20:00:00Z" });
    try {
      const url = await record(w, { pid: process.pid, port: home.port, container: true });
      const status = await w.sheep("home", "--json");
      expect(status.code).toBe(0);
      expect(JSON.parse(status.stdout)).toMatchObject({ home: url, local: true, running: false, pid: null, container: true, build: { home: null, cli: CHECKOUT }, image: null });
      expect(status.stderr).toBe(`sheep: the record says the local home has container and the home at ${url} reports otherwise; a stale record, so the home is reported as not running\n`);
      expect((await w.sheep("home")).stdout).toBe(`home: ${url} (local, stopped)\nkennel: ${w.kennel}\n`);
      // The record agreeing with the home: running, with the build lines.
      await record(w, { pid: process.pid, port: home.port, container: false });
      expect(JSON.parse((await w.sheep("home", "--json")).stdout)).toMatchObject({ running: true, container: false, build: { home: { commit: "1fc8d03", builtAt: "2026-09-07T20:00:00Z" }, cli: CHECKOUT } });
    } finally {
      home.server.close();
    }
  });
});
