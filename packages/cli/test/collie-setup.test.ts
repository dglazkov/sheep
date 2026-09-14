/**
 * Collie phase 2, the shepherd's three: `collie setup`, `collie deploy`,
 * and `collie rm`, the built command spawned against fakes (journey 1 step
 * 3, journey 3 step 3, journey 5 steps 1 and 4, journey 6 step 1).
 *
 * The fakes are the ones `deploy.test.ts` and the stile drive (`fakes.ts`:
 * the fake account and the fake station; `fake-wrangler.mjs`, which logs
 * every call's arguments and stdin), a fake collie Worker here that speaks
 * the phase's wire (`GET /` answering `collie`, `GET /report` and `DELETE /`
 * with the bearer), and a fake `isocan` installed the way a linked checkout
 * is: a manifest named `isocan` whose `.` export is the module, its bin
 * under a manifest of another name and reached through a symlink on PATH.
 * The module is isocan's API as `isocanIdentity` reads it — `baseForCwd`,
 * `DaemonClient`, `resolveIdentity` — answering from a file under
 * `ISOCAN_HOME`, so no identity there is the refusal and one there is the
 * name.
 *
 * Every world is its own `HOME` holding the kennel; no environment of the
 * machine running this reaches the child but `node` on PATH.
 *
 * The screen: the sitting through `screen.ts`'s headless terminal at 80 by
 * 24 (the stile's harness), frame by frame, with the cells read for the
 * amber cursor, the green ticks, the collie's half-blocks, and the hidden
 * box; and once under a real pseudo-terminal (`script`, as
 * `stile-tty.test.ts` does), where the typed token must not echo.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hiddenShown } from "../src/stile/screen.js";
import { COLLIE_STEPS, collieWordsAt } from "../src/collie/setup.js";
import { ACCOUNT, type FakeState, fakeAccount, fakeStation, fresh, type StationState, TOKEN } from "./fakes.js";
import { driveStile, runsOf } from "./screen.js";

const collieBin = new URL("../bin/collie.js", import.meta.url).pathname;
const fakeWrangler = new URL("./fake-wrangler.mjs", import.meta.url).pathname;
const collieSource = new URL("../../collie/src/index.ts", import.meta.url).pathname;

const STATION = { name: "blog", home: "https://blog.fake.workers.dev", token: "st4tionTok3nQm8Zr2Wx9Lp" };
const COLLIE = { name: "blog-collie", address: "https://blog-collie.fake.workers.dev" };
const DIMITRI = { id: "usr_dimitri", name: "Dimitri" };
const ROOM = { canvasId: "cnv_7f3a", title: "Landing page", origin: "https://isocan.io", address: "https://isocan.io/p/cnv_7f3a" };
const SHEEP_ID = "11111111-2222-3333-4444-555555555555";

type Json = Record<string, unknown>;

interface CollieWorker {
  /** The bearer the Worker holds, when a case says; otherwise the last `COLLIE_TOKEN` the fake wrangler's record shows put, as the real Worker's secret is. */
  token: string | null;
  /** The token as the account holds it: the fake wrangler's record, read at each request. */
  put?: () => string | null;
  /** A new version taking the secret over this long after the put is first seen: every bearer route 401s meanwhile, while `GET /` answers at once. */
  secretLagMs?: number;
  /** When a request first saw the put, for the lag. */
  putSeenAt?: number;
  /**
   * The edge settling after a deploy (release ca1eec6's co4): for this long after the put is first seen, every bearer
   * request is answered in turn from the right version (200), from no Worker (Cloudflare's 404 page), and from a version
   * without the token (401).
   */
  flapMs?: number;
  /** How many bearer requests have been answered while flapping, for the turn. */
  flaps?: number;
  /** Every bearer route answered with this status and an HTML page, as an edge's page is, when set. */
  htmlStatus?: number;
  rooms: (typeof ROOM & { owner: string; agents: Json[] })[];
  requests: { method: string; path: string; auth: string | undefined }[];
  /** Whether `DELETE /` was answered: the badges ended, the rows dropped. */
  ended: boolean;
  /** The rig's process: while set, `GET /` answers `collie` only while it lives, as a rig's `wrangler dev` does. */
  rigPid?: number;
  /** A fresh Worker's door: `GET /` answers 404 until this time (ms since the epoch), as workers.dev does for a few seconds after a first deploy. */
  doorUpAt?: number;
}

async function fakeCollieWorker(state: CollieWorker): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fake");
    const key = `${request.method} ${url.pathname}`;
    state.requests.push({ method: request.method ?? "", path: url.pathname, auth: request.headers.authorization });
    response.setHeader("x-collie-build", "0.0.0-checkout");
    const json = (status: number, value: unknown) => {
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(value));
    };
    if (key === "GET /") {
      if (state.putSeenAt === undefined && state.token === null && state.put?.() != null) state.putSeenAt = Date.now();
      if (state.doorUpAt !== undefined && Date.now() < state.doorUpAt) {
        response.statusCode = 404;
        return response.end("There is nothing here yet\n");
      }
      if (state.rigPid !== undefined) {
        try {
          process.kill(state.rigPid, 0);
        } catch {
          response.statusCode = 503;
          return response.end("gone\n");
        }
      }
      return response.end("collie\n");
    }
    const held = state.token ?? state.put?.() ?? null;
    if (held !== null && state.putSeenAt === undefined) state.putSeenAt = Date.now();
    const page = (status: number) => {
      response.statusCode = status;
      response.setHeader("content-type", "text/html");
      return response.end(`<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Page not found</title></head><body><h1>There is nothing here yet</h1><p>If you expect something here, it may take some time. Please check back again later.</p></body></html>\n`);
    };
    if (state.htmlStatus !== undefined) return page(state.htmlStatus);
    if (state.flapMs !== undefined && state.putSeenAt !== undefined && Date.now() < state.putSeenAt + state.flapMs) {
      const turn = (state.flaps = (state.flaps ?? 0) + 1) % 3;
      if (turn === 2) return page(404);
      if (turn === 0) {
        response.statusCode = 401;
        return response.end("unauthorized\n");
      }
    }
    const serving = state.secretLagMs === undefined || (state.putSeenAt !== undefined && Date.now() >= state.putSeenAt + state.secretLagMs);
    if (held === null || !serving || request.headers.authorization !== `Bearer ${held}`) {
      response.statusCode = 401;
      return response.end("unauthorized\n");
    }
    if (key === "GET /home") return json(200, { build: { commit: "0.0.0-checkout", builtAt: null }, on: true, since: null, rooms: state.rooms.length });
    if (key === "GET /log") return json(200, { lines: [], last: 0 });
    if (key === "GET /report") return json(200, { on: true, since: "2026-09-14T03:42:10Z", limits: { turnsPerHour: 20, chain: 5 }, rooms: state.rooms });
    if (key === "DELETE /") {
      const ended = [...new Set(state.rooms.map((room) => room.origin))].map((origin) => ({ origin, badge: "bdg_1" }));
      state.ended = true;
      state.rooms = [];
      return json(200, { ended });
    }
    return json(404, { error: `no route ${key}` });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}

const cleanups: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

interface WranglerCall {
  args: string[];
  stdin: string;
  cwd: string;
  env: { token: boolean; tokenInArgs: boolean };
}

interface World {
  dir: string;
  /** The command, through a link of this world's: `collie.test.ts` reads `ps` for processes of `bin/collie.js` as its own, and these run beside it. */
  bin: string;
  kennel: string;
  account: FakeState;
  station: StationState;
  worker: CollieWorker;
  /** The fake collie Worker's own address, which the rig's block names. */
  workerUrl: string;
  isocanHome: string;
  calls: () => string[];
  env: (extra?: Record<string, string | undefined>) => Record<string, string>;
  collie: (args: string[], options?: { stdin?: string; env?: Record<string, string | undefined> }) => Promise<Run>;
  wrangler: () => WranglerCall[];
  config: () => Json;
  writeConfig: (config: Json) => Promise<void>;
  keepToken: () => Promise<void>;
}

interface WorldOptions {
  /** The kennel's config; `null` writes none. The default names the station. */
  config?: Json | null;
  /** Keep the account token in `~/.sheep/credentials`; the default does. */
  kept?: boolean;
  /** An isocan identity under `ISOCAN_HOME`; `null` none. */
  identity?: { id: string; name: string } | null;
  /** Put the fake isocan on PATH; the default does. */
  isocan?: boolean;
}

async function world(options: WorldOptions = {}): Promise<World> {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-collie-setup-")));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const logs = realpathSync(await mkdtemp(join(tmpdir(), "sheep-collie-setup-log-")));
  cleanups.push(() => rm(logs, { recursive: true, force: true }));
  const kennel = join(dir, ".sheep");
  await mkdir(kennel);

  const account = fresh();
  account.workers.push(STATION.name);
  const accountServer = await fakeAccount(account);
  const station: StationState = { token: STATION.token, sessions: [], pastures: [], worker: STATION.name };
  const stationServer = await fakeStation([], station);
  const worker: CollieWorker = { token: null, rooms: [], requests: [], ended: false };
  const workerServer = await fakeCollieWorker(worker);
  for (const server of [accountServer.server, stationServer.server, workerServer.server]) {
    cleanups.push(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
  }

  const config = options.config === undefined ? { home: STATION.home, token: STATION.token, name: STATION.name } : options.config;
  if (config !== null) await writeFile(join(kennel, "config"), JSON.stringify(config), { mode: 0o600 });
  const keepToken = () => writeFile(join(kennel, "credentials"), JSON.stringify({ cloudflare: TOKEN }), { mode: 0o600 });
  if (options.kept !== false) await keepToken();

  // The isocan: a linked checkout's shape, its bin under a manifest of another name, reached through a symlink on PATH.
  const isocanHome = join(dir, "isocan-home");
  await mkdir(isocanHome);
  if (options.identity !== null) await writeFile(join(isocanHome, "identity.json"), JSON.stringify({ actor: options.identity ?? DIMITRI }));
  const install = join(dir, "isocan-install");
  await mkdir(join(install, "packages", "cli", "bin"), { recursive: true });
  await writeFile(join(install, "package.json"), JSON.stringify({ name: "isocan", type: "module", bin: { isocan: "packages/cli/bin/isocan.js" }, exports: { ".": { types: "./types/index.d.ts", default: "./index.mjs" } } }));
  await writeFile(join(install, "packages", "cli", "package.json"), JSON.stringify({ name: "@isocan/cli", type: "module" }));
  await writeFile(join(install, "packages", "cli", "bin", "isocan.js"), "#!/usr/bin/env node\nconsole.log('isocan');\n", { mode: 0o755 });
  const callsFile = join(logs, "isocan-calls");
  await writeFile(
    join(install, "index.mjs"),
    `import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const call = (line) => appendFileSync(${JSON.stringify(callsFile)}, line + "\\n");
export async function baseForCwd(home, port) { call("baseForCwd " + port); return { base: "http://127.0.0.1:" + port, direct: null }; }
export class DaemonClient { constructor(base, home) { this.base = base; this.home = home; } }
export async function resolveIdentity(client, home) {
  call("resolveIdentity " + (client instanceof DaemonClient ? "client" : "not a client"));
  try { return JSON.parse(readFileSync(join(home, "identity.json"), "utf8")); } catch { return null; }
}
`,
  );
  const bin = join(logs, "bin");
  await mkdir(bin);
  await symlink(process.execPath, join(bin, "node"));
  if (options.isocan !== false) await symlink(join(install, "packages", "cli", "bin", "isocan.js"), join(bin, "isocan"));

  const log = join(logs, "wrangler.log");
  const commandLink = join(logs, "collie.js");
  await symlink(collieBin, commandLink);
  const env = (extra: Record<string, string | undefined> = {}) => {
    const merged: Record<string, string | undefined> = {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: dir,
      NODE_NO_WARNINGS: "1",
      SHEEP_TIP: "0",
      ISOCAN_HOME: isocanHome,
      SHEEP_TEST_ACCOUNT_API: accountServer.url,
      SHEEP_TEST_WRANGLER: fakeWrangler,
      SHEEP_TEST_WRANGLER_LOG: log,
      SHEEP_TEST_STATION_URL: stationServer.url,
      SHEEP_TEST_COLLIE_URL: workerServer.url,
      // Readiness asks five times in a row; a tenth of a second apart here, a second apart on an account.
      SHEEP_TEST_COLLIE_READY_GAP_MS: "100",
      ...extra,
    };
    for (const name of Object.keys(merged)) if (merged[name] === undefined) delete merged[name];
    return merged as Record<string, string>;
  };
  const collie = (args: string[], run: { stdin?: string; env?: Record<string, string | undefined> } = {}): Promise<Run> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [commandLink, ...args], { env: env(run.env), cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
      child.stdin.end(run.stdin ?? "");
    });
  worker.put = () => {
    const puts = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as WranglerCall).filter((call) => call.args[0] === "secret" && call.args[2] === "COLLIE_TOKEN") : [];
    return puts.length === 0 ? null : puts.at(-1)!.stdin.trim();
  };
  const made: World = {
    dir,
    bin: commandLink,
    kennel,
    account,
    station,
    worker,
    workerUrl: workerServer.url,
    isocanHome,
    calls: () => (existsSync(callsFile) ? readFileSync(callsFile, "utf8").trim().split("\n") : []),
    env,
    collie,
    wrangler: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as WranglerCall) : []),
    config: () => JSON.parse(readFileSync(join(kennel, "config"), "utf8")) as Json,
    writeConfig: (value) => writeFile(join(kennel, "config"), JSON.stringify(value), { mode: 0o600 }),
    keepToken,
  };
  return made;
}

/** The collie Worker's token as the config keeps it, which the fake Worker is then told to hold. */
function heldToken(w: World): string {
  const block = w.config().collie as { token: string };
  // The config's token is the one put: the fake Worker holds what wrangler's record shows put, so a mismatch is a 401.
  expect(block.token).toBe(w.worker.put!());
  return block.token;
}

describe("collie setup with --json, against the fake account (journey 1 step 3)", () => {
  it("finds the station and the identity, deploys <station>-collie with the three secrets on stdin, waits for its door, and writes the block", { timeout: 60_000 }, async () => {
    const w = await world();
    const run = await w.collie(["setup", "--json"]);
    expect(run.code, run.stderr).toBe(0);
    const report = JSON.parse(run.stdout) as Json;
    expect(report).toMatchObject({
      kennel: w.kennel,
      config: join(w.kennel, "config"),
      station: { name: STATION.name, home: STATION.home },
      isocan: { name: "Dimitri", actorId: DIMITRI.id, home: w.isocanHome },
      account: { id: ACCOUNT.id, name: ACCOUNT.name, token: "machine" },
      collie: { name: COLLIE.name, address: COLLIE.address, state: "deployed", token: "minted", secrets: ["COLLIE_SHEEP_HOME", "COLLIE_SHEEP_TOKEN", "COLLIE_TOKEN"], answers: true },
      next: "collie new, in a directory bound to a canvas",
    });
    // The identity was asked of the isocan on PATH, through its own API.
    expect(w.calls()).toEqual(["baseForCwd 4441", "resolveIdentity client"]);

    // The Worker: one deploy over the derived config, named for the station, built from packages/collie in this checkout.
    const calls = w.wrangler();
    expect(calls.map((call) => call.args.slice(0, 3).join(" "))).toEqual(["deploy --config " + join(w.kennel, "collie", "wrangler.jsonc"), "secret put COLLIE_SHEEP_HOME", "secret put COLLIE_SHEEP_TOKEN", "secret put COLLIE_TOKEN"]);
    const derived = JSON.parse(readFileSync(join(w.kennel, "collie", "wrangler.jsonc"), "utf8")) as Json;
    expect(derived).toMatchObject({ name: COLLIE.name, main: collieSource, durable_objects: { bindings: [{ name: "COLLIE", class_name: "Collie" }] } });
    expect(derived.env).toBeUndefined();
    const define = calls[0]!.args[calls[0]!.args.indexOf("--define") + 1]!;
    expect(define.startsWith("COLLIE_BUILD:")).toBe(true);
    expect(w.account.workers).toContain(COLLIE.name);
    expect(w.account.applications.map((application) => application.name)).not.toContain(COLLIE.name);
    expect(w.account.secrets[COLLIE.name]).toEqual(["COLLIE_SHEEP_HOME", "COLLIE_SHEEP_TOKEN", "COLLIE_TOKEN"]);

    // The secrets: each value on stdin, and none in any argument, in the env's record, or in the report.
    const block = w.config().collie as Json;
    expect(block).toEqual({ name: COLLIE.name, address: COLLIE.address, token: expect.stringMatching(/^[0-9a-f]{48}$/) });
    const values = { COLLIE_SHEEP_HOME: STATION.home, COLLIE_SHEEP_TOKEN: STATION.token, COLLIE_TOKEN: block.token as string };
    for (const call of calls.slice(1)) {
      expect(call.args).not.toContain("--env");
      expect(call.stdin).toBe(`${values[call.args[2] as keyof typeof values]}\n`);
    }
    for (const call of calls) {
      expect(call.env).toMatchObject({ token: true, tokenInArgs: false });
      for (const value of [...Object.values(values), TOKEN]) expect(call.args.some((arg) => arg.includes(value)), `a value in wrangler's arguments: ${call.args.join(" ")}`).toBe(false);
    }
    for (const value of [STATION.token, block.token as string, TOKEN]) expect(run.stdout.includes(value) || run.stderr.includes(value)).toBe(false);
    // The rest of the config kept, mode 600; the door asked, the report not (a first deploy has nothing to guard).
    expect(w.config()).toMatchObject({ home: STATION.home, token: STATION.token, name: STATION.name });
    expect(statSync(join(w.kennel, "config")).mode & 0o777).toBe(0o600);
    // Ready is the authorized door: `GET /home` with the token just put, and nothing else asked of a first deploy.
    expect(w.worker.requests).toEqual(Array.from({ length: 5 }, () => ({ method: "GET", path: "/home", auth: `Bearer ${block.token as string}` })));
    expect(w.worker.put!()).toBe(block.token);
  });

  it("run again, redeploys the same Worker and keeps its token, asking the collie who is mid-turn first", { timeout: 60_000 }, async () => {
    const w = await world();
    expect((await w.collie(["setup", "--json"])).code).toBe(0);
    const token = heldToken(w);
    const again = await w.collie(["setup", "--json"]);
    expect(again.code, again.stderr).toBe(0);
    expect(JSON.parse(again.stdout)).toMatchObject({ collie: { name: COLLIE.name, state: "redeployed", token: "kept" } });
    expect((w.config().collie as Json).token).toBe(token);
    const puts = w.wrangler().filter((call) => call.args[2] === "COLLIE_TOKEN");
    expect(puts.map((call) => call.stdin)).toEqual([`${token}\n`, `${token}\n`]);
    expect(w.worker.requests).toContainEqual({ method: "GET", path: "/report", auth: `Bearer ${token}` });
  });

  it("takes CLOUDFLARE_API_TOKEN over what is kept, and asks nothing without a terminal when neither is there", { timeout: 60_000 }, async () => {
    const w = await world({ kept: false });
    const none = await w.collie(["setup", "--json"]);
    expect(none.code).toBe(2);
    expect(JSON.parse(none.stdout)).toMatchObject({ step: "account", needs: ["account", "terminal"], sheep: { home: STATION.home, name: STATION.name, local: false }, isocan: { name: "Dimitri" } });
    expect(JSON.parse(none.stdout).refused).toContain("`sheep setup` keeps one");
    const prose = await w.collie(["setup"]);
    expect(prose).toMatchObject({ code: 2, stdout: "" });
    expect(prose.stderr).toContain("collie: collie setup needs the account token");
    expect(w.wrangler()).toEqual([]);
    expect(w.config().collie).toBeUndefined();

    const fromEnv = await w.collie(["setup", "--json"], { env: { CLOUDFLARE_API_TOKEN: TOKEN } });
    expect(fromEnv.code, fromEnv.stderr).toBe(0);
    expect(JSON.parse(fromEnv.stdout)).toMatchObject({ account: { token: "environment" }, collie: { state: "deployed" } });
    // Kept nowhere new: no credentials file was written.
    expect(existsSync(join(w.kennel, "credentials"))).toBe(false);
  });
});

describe("collie setup and deploy wait for the collie to answer with its token (co4)", () => {
  it("setup ends only once GET /home takes the token just put, though GET / answered from the first version, so `collie` right after it is let in", { timeout: 60_000 }, async () => {
    const w = await world();
    w.worker.secretLagMs = 3_000;
    const started = Date.now();
    const run = await w.collie(["setup", "--json"]);
    expect(run.code, run.stderr).toBe(0);
    const took = Date.now() - started;
    expect(JSON.parse(run.stdout)).toMatchObject({ collie: { name: COLLIE.name, answers: true } });
    const token = heldToken(w);
    // The shepherd's next command, at once: the report, with the kennel's token, is let in. (The block's address pointed at
    // the fake the seam stands in for, since `collie`'s own client has no seam.)
    const pointed = () => w.writeConfig({ ...w.config(), collie: { ...(w.config().collie as Json), address: w.workerUrl } });
    await pointed();
    const report = await w.collie(["--json"]);
    expect(report.stderr).toBe("");
    expect(report.code).toBe(0);
    expect(JSON.parse(report.stdout)).toMatchObject({ on: true, rooms: [] });
    expect(took).toBeGreaterThanOrEqual(3_000);
    const home = w.worker.requests.filter((request) => request.path === "/home");
    expect(home.length).toBeGreaterThan(1);
    expect(home.every((request) => request.auth === `Bearer ${token}`)).toBe(true);

    // A redeploy with the secrets kept is a new version too, and waits the same way.
    w.worker.putSeenAt = Date.now();
    w.worker.secretLagMs = 2_500;
    const before = w.worker.requests.length;
    const redeploy = await w.collie(["deploy"]);
    expect(redeploy.code, redeploy.stderr).toBe(0);
    expect(redeploy.stdout).toContain(`collie: ${COLLIE.name} redeployed at ${COLLIE.address} (answers)\n`);
    const waited = w.worker.requests.slice(before).filter((request) => request.path === "/home");
    expect(waited.length).toBeGreaterThan(1);
    await pointed();
    expect((await w.collie(["--json"])).code).toBe(0);
  });

  it("a collie that never takes its token in time is not a success: the step says so and the command exits 1", { timeout: 60_000 }, async () => {
    const w = await world();
    w.worker.secretLagMs = 600_000;
    const run = await w.collie(["setup", "--json"], { env: { SHEEP_TEST_COLLIE_READY_MS: "2000" } });
    expect(run.code).toBe(1);
    const failed = JSON.parse(run.stdout) as { failed: string };
    expect(failed.failed).toContain(`${COLLIE.address} did not answer GET /home with this kennel's token 5 times in a row within 2s (the last answers: 401, 401, 401, 401, 401)`);
    expect(failed.failed).toContain("`collie setup` again finishes it");
    // At the screen: red at the collie step, the sentence under the screen, exit 1.
    const screen = driveStile({ command: process.execPath, args: [w.bin, "setup"], cwd: w.dir, env: w.env({ SHEEP_TEST_COLLIE_READY_MS: "2000" }) });
    cleanups.push(async () => screen.kill());
    const exit = await screen.exited;
    expect(exit.code).toBe(1);
    expect(exit.stderr).toContain("did not answer GET /home with this kennel's token 5 times in a row within 2s");
    expect(screen.frame()).toContain("✗ the collie did not come up");
    expect(screen.frame()).not.toContain("what is left");
  });
});

describe("an edge that answers some requests from no Worker and some from an older version (release ca1eec6's co4)", () => {
  it("setup is up only after five authorized answers in a row, so the commands right after it are all let in", { timeout: 60_000 }, async () => {
    const w = await world();
    w.worker.flapMs = 3_000;
    const run = await w.collie(["setup", "--json"]);
    expect(run.code, run.stderr).toBe(0);
    const pointed = { ...w.config(), collie: { ...(w.config().collie as Json), address: w.workerUrl } };
    await w.writeConfig(pointed);
    // Three commands at once after the sitting, as a shepherd types `collie new`, `collie log`, `collie`: every one let in.
    const after = [await w.collie(["--json"]), await w.collie(["log", "--json"]), await w.collie(["--json"])];
    for (const one of after) expect(one.stderr).toBe("");
    // The readiness asks, in order: while flapping, no five 200s in a row; the last five 200.
    const statuses = w.worker.requests.filter((request) => request.path === "/home").length;
    expect(statuses).toBeGreaterThanOrEqual(5);
  });

  it("the spinner's line counts the answers in a row", { timeout: 60_000 }, async () => {
    const w = await world();
    w.worker.flapMs = 2_500;
    const run = driveStile({ command: process.execPath, args: [w.bin, "setup"], cwd: w.dir, env: w.env({ SHEEP_TEST_COLLIE_READY_GAP_MS: "400" }) });
    cleanups.push(async () => run.kill());
    await run.waitFor(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] answers with its token in a row, [1-4] of 5 +0m/, { timeoutMs: 30_000 });
    expect((await run.exited).code).toBe(0);
  });

  it("a refusal that is an edge's HTML page is never printed whole: the status, the page's title, and what to do", { timeout: 60_000 }, async () => {
    const w = await world();
    await w.writeConfig({ ...w.config(), collie: { name: COLLIE.name, address: w.workerUrl, token: "any" } });
    w.worker.htmlStatus = 404;
    const passed = await w.collie(["new", "--pass"], { stdin: "https://isocan.io/p/cnv_7f3a#Zq4Wm8Rt2Yx6Kb9Hd3Lp7Nc5Vf1Gj0\n" });
    expect(passed).toEqual({
      code: 1,
      stdout: "",
      stderr: `collie: the collie at ${w.workerUrl} answered POST /passes with 404 and no answer of its own (Page not found); a collie deployed moments ago can take a minute to answer everywhere — try again, or \`collie setup\` again\n`,
    });
    w.worker.htmlStatus = 502;
    const report = await w.collie([]);
    expect(report.code).toBe(1);
    expect(report.stderr).toBe(`collie: the collie at ${w.workerUrl} answered GET /report with 502 and no answer of its own (Page not found); a collie deployed moments ago can take a minute to answer everywhere — try again, or \`collie setup\` again\n`);
    for (const one of [passed, report]) expect(one.stderr).not.toContain("<!DOCTYPE");
  });
});

describe("collie setup's refusals (journey 5 step 1), each deploying nothing", () => {
  const nothingDeployed = (w: World) => {
    expect(w.wrangler()).toEqual([]);
    expect(w.account.deploys).toEqual([]);
    expect(w.account.requests.filter((request) => request.method !== "GET")).toEqual([]);
    expect(existsSync(join(w.kennel, "config")) ? w.config().collie : undefined).toBeUndefined();
  };

  it("no kennel naming a station: refused at sheep with `sheep setup` named", { timeout: 60_000 }, async () => {
    const w = await world({ config: null });
    const run = await w.collie(["setup", "--json"]);
    expect(run.code).toBe(2);
    const refusal = JSON.parse(run.stdout) as Json;
    expect(refusal).toMatchObject({ step: "sheep", needs: ["sheep"], sheep: { kennel: w.kennel, home: null, local: false }, isocan: { name: "Dimitri" } });
    expect(refusal.refused).toContain("`sheep setup` at your own terminal is the first sitting");
    expect(refusal.refused).toContain("Dimitri's isocan identity is here");
    const prose = await w.collie(["setup"]);
    expect(prose.code).toBe(2);
    expect(prose.stderr).toBe(`collie: ${refusal.refused as string}\n`);
    nothingDeployed(w);
  });

  it("a kennel naming the local home: refused at sheep with `collie local` named", { timeout: 60_000 }, async () => {
    const w = await world({ config: { home: "http://127.0.0.1:8787", token: "local-token", local: true } });
    const run = await w.collie(["setup", "--json"]);
    expect(run.code).toBe(2);
    const refusal = JSON.parse(run.stdout) as Json;
    expect(refusal).toMatchObject({ step: "sheep", sheep: { home: "http://127.0.0.1:8787", local: true } });
    expect(refusal.refused).toContain("a Worker on Cloudflare cannot reach a laptop; `collie local` is the rig for a local home");
    nothingDeployed(w);
  });

  it("no isocan identity here, or no isocan at all: refused at isocan with `isocan setup` named and the station named", { timeout: 60_000 }, async () => {
    const w = await world({ identity: null });
    const run = await w.collie(["setup", "--json"]);
    expect(run.code).toBe(2);
    const refusal = JSON.parse(run.stdout) as Json;
    expect(refusal).toMatchObject({ step: "isocan", needs: ["isocan"], sheep: { name: STATION.name }, isocan: null });
    expect(refusal.refused).toContain("`isocan setup` names you");
    expect(refusal.refused).toContain(`the station ${STATION.name} at ${STATION.home} is found`);

    const bare = await world({ isocan: false });
    const missing = await bare.collie(["setup", "--json"]);
    expect(missing.code).toBe(2);
    const gone = JSON.parse(missing.stdout) as Json;
    expect(gone).toMatchObject({ step: "isocan", isocan: null });
    expect(gone.refused).toContain("no `isocan` on this machine's PATH");
    expect(gone.refused).toContain("`isocan setup`");
    nothingDeployed(w);
    nothingDeployed(bare);
    // Nothing was asked of the account either: a sitting that stops before the account step reads no token.
    expect(w.account.requests).toEqual([]);
  });
});

describe("collie deploy (journey 2 step 2's guard)", () => {
  it("is refused while an agent's sheep is mid-turn, naming it, and deploys over it with --now, the secrets kept", { timeout: 60_000 }, async () => {
    const w = await world();
    expect((await w.collie(["setup", "--json"])).code).toBe(0);
    const token = heldToken(w);
    w.worker.rooms = [{ ...ROOM, owner: "Dimitri", agents: [{ name: "Percy", actorId: "act_percy", sheep: SHEEP_ID, lane: "running", pasture: "isocan-percy", came: "born here", turnsLastHour: 1 }] }];
    const before = w.wrangler().length;

    const refused = await w.collie(["deploy"]);
    expect(refused.code).toBe(2);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toBe(
      `${SHEEP_ID}  Percy on "Landing page"\ncollie: these sheep are mid-turn for the collie at ${COLLIE.address}: a deploy restarts the collie, which rejoins their turns within a lap, and the canvas reads them as not answerable until it does; nothing was deployed; \`collie deploy --now\` deploys anyway\n`,
    );
    const json = await w.collie(["deploy", "--json"]);
    expect(json.code).toBe(2);
    expect(JSON.parse(json.stdout)).toEqual({ refused: expect.stringContaining("`collie deploy --now`"), midTurn: [{ id: SHEEP_ID, task: 'Percy on "Landing page"', state: "running" }] });
    expect(w.wrangler().length).toBe(before);

    const now = await w.collie(["deploy", "--now"]);
    expect(now.code, now.stderr).toBe(0);
    expect(now.stdout).toContain(`collie: ${COLLIE.name} redeployed at ${COLLIE.address} (answers)\n`);
    expect(now.stdout).toContain("secrets: kept as the Worker holds them\ninterrupted: 1\n");
    const after = w.wrangler().slice(before);
    expect(after.map((call) => call.args[0])).toEqual(["deploy"]);
    expect((w.config().collie as Json).token).toBe(token);

    // Mistakes: --now goes with deploy alone.
    expect((await w.collie(["log", "--now"])).code).toBe(2);
  });

  it("with no collie set up says so and names collie setup", { timeout: 60_000 }, async () => {
    const w = await world();
    const run = await w.collie(["deploy"]);
    expect(run).toEqual({ code: 2, stdout: "", stderr: `collie: no collie is set up in this kennel (${w.kennel}); \`collie setup\` deploys one beside the station\n` });
    expect(w.wrangler()).toEqual([]);
  });
});

describe("collie rm (journey 3 step 3)", () => {
  it("lists what goes and what stays, waits for the name, ends the badges at the Worker, deletes it at the account, and clears the block", { timeout: 60_000 }, async () => {
    const w = await world();
    expect((await w.collie(["setup", "--json"])).code).toBe(0);
    const token = heldToken(w);
    w.worker.rooms = [{ ...ROOM, owner: "Dimitri", agents: [{ name: "Percy", actorId: "act_percy", sheep: SHEEP_ID, lane: "idle", pasture: "isocan-percy", came: "born here", turnsLastHour: 0 }] }];
    const listing =
      `collie rm ends ${COLLIE.name}, the collie at ${COLLIE.address}\n` +
      "goes:  the badge it holds at https://isocan.io, ended there\n" +
      `       the Worker ${COLLIE.name} and its object, deleted from ${ACCOUNT.name}\n` +
      `       the collie block in ${join(w.kennel, "config")}, cleared\n` +
      'stays: every enrolment on "Landing page"\n' +
      `       every sheep in \`sheep ls\`, with its pasture: ${SHEEP_ID} (Percy, pasture isocan-percy)\n`;

    // Nothing typed, then the wrong name: nothing ended, nothing deleted.
    const empty = await w.collie(["rm"]);
    expect(empty.code).toBe(2);
    expect(empty.stdout).toBe(listing);
    expect(empty.stderr).toContain("collie: collie rm needs the collie's name typed to confirm, and there is no terminal here and nothing on stdin");
    const wrong = await w.collie(["rm"], { stdin: "blog\n" });
    expect(wrong).toMatchObject({ code: 2, stderr: `collie: blog is not ${COLLIE.name}; nothing was ended\n` });
    expect(w.worker.ended).toBe(false);
    expect(w.account.workers).toContain(COLLIE.name);
    expect(w.worker.requests.filter((request) => request.method !== "GET")).toEqual([]);

    const run = await w.collie(["rm"], { stdin: `${COLLIE.name}\n` });
    expect(run.code, run.stderr).toBe(0);
    expect(run.stdout).toBe(
      listing +
        "ended: the badge at https://isocan.io\n" +
        `deleted: the Worker ${COLLIE.name} and its object\n` +
        `cleared: the collie block in ${join(w.kennel, "config")}\n` +
        `collie: ${COLLIE.name} is gone; every enrolment and every sheep stays, and \`collie setup\` deploys a collie again\n`,
    );
    expect(w.worker.requests).toContainEqual({ method: "DELETE", path: "/", auth: `Bearer ${token}` });
    expect(w.worker.ended).toBe(true);
    expect(w.account.workers).not.toContain(COLLIE.name);
    expect(w.account.requests).toContainEqual({ method: "DELETE", path: `/accounts/${ACCOUNT.id}/workers/scripts/${COLLIE.name}`, auth: `Bearer ${TOKEN}` });
    // The station and the sheep are untouched: nothing but GETs reached the station.
    expect(w.config()).toEqual({ home: STATION.home, token: STATION.token, name: STATION.name });
    expect(existsSync(join(w.kennel, "collie"))).toBe(false);

    // Afterwards `collie` says there is none and names `collie setup`, as does `rm` again.
    const after = await w.collie([]);
    expect(after).toEqual({ code: 1, stdout: "", stderr: `collie: no collie is set up in this kennel (${w.kennel}); \`collie setup\` deploys one beside the station\n` });
    expect((await w.collie(["rm"], { stdin: `${COLLIE.name}\n` })).stderr).toContain("`collie setup` deploys one beside the station");
  });
});

describe("collie rm on the rig (journey 6 step 2 holds journey 3 there)", () => {
  it("lists and waits the same way, ends the badges at the rig, stops the rig, clears the block, and asks the account nothing", { timeout: 60_000 }, async () => {
    const w = await world({ kept: false });
    const rigToken = "rig-bearer-Hq3Zt8Lw2Ec5";
    w.worker.token = rigToken;
    w.worker.rooms = [{ ...ROOM, owner: "Dimitri", agents: [{ name: "Percy", actorId: "act_percy", sheep: SHEEP_ID, lane: "idle", pasture: "isocan-percy", came: "born here", turnsLastHour: 0 }] }];
    // The rig: a process of its own standing for `wrangler dev`, recorded where `collie local` records it.
    const rig = spawn(process.execPath, ["-e", "setInterval(() => {}, 1 << 30)"], { stdio: "ignore" });
    cleanups.push(async () => void rig.kill("SIGKILL"));
    const rigExit = new Promise((resolve) => rig.once("exit", resolve));
    w.worker.rigPid = rig.pid;
    await mkdir(join(w.kennel, "local", "collie"), { recursive: true });
    await writeFile(join(w.kennel, "local", "collie", "collie.json"), JSON.stringify({ pid: rig.pid, port: Number(new URL(w.workerUrl).port), url: w.workerUrl, stamp: null, startedAt: "2026-09-14T12:00:00Z" }));
    const local = { home: "http://127.0.0.1:8787", token: "local-home-token", local: true };
    await w.writeConfig({ ...local, collie: { address: w.workerUrl, token: rigToken, local: true } });
    const listing =
      `collie rm ends collie, the collie at ${w.workerUrl}\n` +
      "goes:  the badge it holds at https://isocan.io, ended there\n" +
      `       the rig at ${w.workerUrl} and its object's rows, and the rig stopped\n` +
      `       the collie block in ${join(w.kennel, "config")}, cleared\n` +
      'stays: every enrolment on "Landing page"\n' +
      `       every sheep in \`sheep ls\`, with its pasture: ${SHEEP_ID} (Percy, pasture isocan-percy)\n`;

    const wrong = await w.collie(["rm"], { stdin: "blog\n" });
    expect(wrong).toEqual({ code: 2, stdout: listing, stderr: "collie: blog is not collie; nothing was ended\n" });
    expect(w.worker.ended).toBe(false);

    const run = await w.collie(["rm"], { stdin: "collie\n" });
    expect(run.code, run.stderr).toBe(0);
    expect(run.stdout).toBe(
      listing +
        "ended: the badge at https://isocan.io\n" +
        `stopped: the rig at ${w.workerUrl}\n` +
        `cleared: the collie block in ${join(w.kennel, "config")}\n` +
        "collie: collie is gone; every enrolment and every sheep stays, and `collie setup` deploys a collie again\n",
    );
    expect(w.worker.requests).toContainEqual({ method: "DELETE", path: "/", auth: `Bearer ${rigToken}` });
    expect(w.worker.ended).toBe(true);
    expect(await Promise.race([rigExit.then(() => "exited"), new Promise((resolve) => setTimeout(() => resolve("alive"), 5_000))])).toBe("exited");
    expect(JSON.parse(readFileSync(join(w.kennel, "local", "collie", "collie.json"), "utf8")).pid).toBeNull();
    expect(w.config()).toEqual(local);
    // No account: no token was asked (none is kept, and stdin held only the name) and the account API heard nothing.
    expect(w.account.requests).toEqual([]);
    expect(w.wrangler()).toEqual([]);
  });
});

describe("collie setup at a terminal (the stile's screen, 80 by 24)", () => {
  it("draws the collie and the checklist, asks for the token in the hidden box, shows the deploy behind the spinner, and ends on the finish", { timeout: 90_000 }, async () => {
    const w = await world({ kept: false });
    const run = driveStile({ command: process.execPath, args: [w.bin, "setup"], cwd: w.dir, env: { ...w.env(), SHEEP_TEST_WRANGLER_DEPLOY_MS: "1500" }, secrets: [TOKEN] });
    cleanups.push(async () => run.kill());

    // The first frames: the collie and its name, the five steps, sheep and isocan filled in, the account asked in its box.
    const asking = await run.waitFor("│ Cloudflare API token");
    const rows = asking.split("\n");
    expect(rows[2]!.slice(37)).toBe("collie");
    expect(rows[3]!.slice(37)).toBe("isocan's rc, standing by beside your sheep");
    expect(rows.slice(8, 11)).toEqual([`  ✓ sheep     blog, blog.fake.workers.dev`, `  ✓ isocan    Dimitri, in ${tildeOf(w.dir, w.isocanHome)}`, expect.stringMatching(/^ {2}› account {3}the Cloudflare account its Worker goes on +\? explain$/)]);
    expect(asking).toContain("    collie\n    next");
    expect(asking.split("\n").at(-1)).toBe("  Enter send   ? explain   Ctrl-C leave");
    // The cells: the collie in 256-colour half-blocks, the name bold amber, the cursor amber, the ticks green, the box dim.
    const banner = run.styledFrame().slice(0, 7);
    const blocks = banner.flatMap((row) => row.cells.slice(1, 36)).filter((cell) => "▀▄█".includes(cell.ch) && cell.ch !== "");
    expect(blocks.length).toBeGreaterThan(100);
    expect(blocks.some((cell) => cell.fgMode === "p256" && cell.fg === 238)).toBe(true);
    expect(blocks.some((cell) => cell.fgMode === "p256" && cell.fg === 255)).toBe(true);
    const name = banner[2]!.cells[37]!;
    expect(name).toMatchObject({ ch: "c", bold: true, fgMode: "p256", fg: 179 });
    const cursor = run.styled(10);
    expect(cursor.cells[2]).toMatchObject({ ch: "›", fgMode: "p256", fg: 179 });
    expect(cursor.cells[4]).toMatchObject({ ch: "a", bold: true, fg: 179 });
    expect(run.styled(8).cells[2]).toMatchObject({ ch: "✓", fgMode: "p256", fg: 114 });

    // The token typed a key at a time: dots, never a character, and never in the buffer or the output.
    await run.type(TOKEN.slice(0, 5));
    expect(run.frame()).toContain(`│ Cloudflare API token  ${hiddenShown(5)}▌`);
    await run.type(TOKEN.slice(5));
    expect(run.frame()).toContain(`${hiddenShown(TOKEN.length)}▌`);
    expect(run.leaks()).toEqual([]);
    await run.press("\r");

    // The deploy behind the spinner, its key line; then the finish.
    const deploying = await run.waitFor((text) => /› collie {4}deploying blog-collie to Fake's Account/.test(text) && /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] uploading the Worker with wrangler +0m \ds$/m.test(text));
    expect(deploying.split("\n").at(-1)).toBe("  the Worker takes a few seconds   Ctrl-C leaves it deploying");
    const finish = await run.waitFor("what is left", { timeoutMs: 60_000 });
    expect(finish).toContain(`  ✓ collie    ${COLLIE.address}`);
    expect(finish).toMatch(/ {2}✓ next {6}done, in \dm \ds/);
    expect(finish).toContain(`  collie       ${COLLIE.address} (deployed)`);
    expect(finish).toContain("│ collie new, in a directory bound to a canvas");
    expect((await run.exited).code).toBe(0);
    expect(run.leaks()).toEqual([]);
    // Typed, and kept nowhere new.
    expect(existsSync(join(w.kennel, "credentials"))).toBe(false);
    expect(w.config().collie).toMatchObject({ name: COLLIE.name });
  });

  it("holds every step's words to the stile's rule: eight lines at eighty, seven where the box sits under them", () => {
    for (const step of COLLIE_STEPS) expect(collieWordsAt(step, 80).length, step).toBeLessThanOrEqual(step === "account" ? 7 : 8);
    expect(collieWordsAt("account", 80).map((line) => line.label).filter(Boolean)).toEqual(["what", "where", "cost", "collie"]);
  });

  it("ends on the finish in the reader's buffer when the Worker's door opens late and the reader is busy as the sitting ends, as the account ring drove it (co3)", { timeout: 180_000 }, async () => {
    // Three sittings: whether the last chunk and the close land in one of the reader's turns is the scheduler's to say, and
    // before the harness waited on its emulator, at least one in three read the frame before the finish.
    for (let attempt = 0; attempt < 3; attempt++) {
      const w = await world();
      // The door in a process of its own, as a real Worker's is: 404 until told to open, then `collie`, and a mark on disk the
      // moment it first answers so, which this test (busy, below) can read without its event loop.
      const opened = join(w.dir, "door-answered");
      const door = spawn(process.execPath, ["-e", `const fs = require("node:fs"); let open = false; process.stdin.on("data", () => (open = true)); require("node:http").createServer((q, r) => { if (!open) { r.statusCode = 404; return r.end("There is nothing here yet"); } fs.writeFileSync(${JSON.stringify(opened)}, "1"); r.setHeader("x-collie-build", "0.0.0-checkout"); r.end(q.url === "/home" ? "{}" : "collie\\n"); }).listen(0, "127.0.0.1", function () { console.log(this.address().port); });`], { stdio: ["pipe", "pipe", "inherit"] });
      cleanups.push(async () => void door.kill());
      const port = await new Promise<string>((resolve) => door.stdout.once("data", (chunk: Buffer) => resolve(String(chunk).trim())));
      const run = driveStile({ command: process.execPath, args: [w.bin, "setup"], cwd: w.dir, env: w.env({ SHEEP_TEST_COLLIE_URL: `http://127.0.0.1:${port}` }), secrets: [TOKEN] });
      cleanups.push(async () => run.kill());
      await run.waitFor(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] answers with its token in a row, 0 of 5 +0m/, { timeoutMs: 30_000 });
      door.stdin.write("open\n");
      // The reader busy with something else from before the door opens until the command has exited (a zombie, or gone, in
      // `ps`, polled synchronously so no event of the child's is read): the finish's bytes and the exit reach it together.
      const busy = Date.now() + 30_000;
      const ended = (): boolean => {
        const rows = spawnSync("ps", ["-axo", "stat=,args="], { encoding: "utf8" }).stdout.split("\n").filter((row) => row.includes(w.bin));
        return rows.every((row) => row.trim().startsWith("Z"));
      };
      while (!(existsSync(opened) && ended()) && Date.now() < busy) {}
      expect(existsSync(opened)).toBe(true);
      const exit = await run.exited;
      expect(exit).toEqual({ code: 0, stderr: "" });
      const buffer = run.buffer();
      expect(run.output()).toContain("what is left");
      expect(buffer, `sitting ${attempt + 1}:\n${buffer}`).toContain(`  ✓ collie    ${COLLIE.address}`);
      expect(buffer).toContain(`  collie       ${COLLIE.address} (deployed)`);
      expect(buffer).toContain("│ collie new, in a directory bound to a canvas");
      for (const step of ["sheep", "isocan", "account", "collie", "next"]) expect(buffer).toContain(`  ✓ ${step.padEnd(8)}  `);
    }
  });

  it("stops at isocan in red when there is no identity, and deploys nothing", { timeout: 60_000 }, async () => {
    const w = await world({ identity: null });
    const run = driveStile({ command: process.execPath, args: [w.bin, "setup"], cwd: w.dir, env: w.env() });
    cleanups.push(async () => run.kill());
    const exit = await run.exited;
    expect(exit.code).toBe(2);
    const frame = run.frame();
    expect(frame).toContain("  › isocan    finding this machine's isocan identity");
    expect(frame).toContain("              ✗ no isocan identity on this machine\n                `isocan setup` names you, and the collie arrives as you\n    account\n    collie\n    next");
    const red = run.styledFrame().find((row) => row.text.includes("✗"))!;
    expect(red.cells[14]).toMatchObject({ ch: "✗", fgMode: "p256", fg: 167 });
    expect(exit.stderr).toContain("collie: no isocan identity on this machine; `isocan setup` names you, and the collie arrives as you; the station blog at https://blog.fake.workers.dev is found and waits for it; nothing was deployed\n");
    expect(w.wrangler()).toEqual([]);
  });
});

/** A path under the world's HOME as the screen prints it: `~` for the HOME. */
function tildeOf(home: string, path: string): string {
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** Which `script` this machine has: util-linux's takes `-c <command>`, the BSD one takes the command after the file. */
function scriptFlavour(): "bsd" | "util-linux" | undefined {
  const which = spawnSync("sh", ["-c", "command -v script"], { encoding: "utf8" });
  if (which.status !== 0 || which.stdout.trim() === "") return undefined;
  const version = spawnSync("script", ["--version"], { encoding: "utf8" });
  return version.status === 0 && /util-linux/.test(`${version.stdout}${version.stderr}`) ? "util-linux" : "bsd";
}
const flavour = scriptFlavour();
const quote = (arg: string) => `'${arg.replace(/'/g, `'\\''`)}'`;

describe.skipIf(flavour === undefined)("collie setup under a real pseudo-terminal", () => {
  it("is the screen when stdin and stdout are a terminal, and a token typed at the account box is never echoed", { timeout: 60_000 }, async () => {
    const w = await world({ kept: false });
    const command = [process.execPath, w.bin, "setup"];
    const scriptArgs = flavour === "util-linux" ? ["-q", "-e", "-c", command.map(quote).join(" "), "/dev/null"] : ["-q", "/dev/null", ...command];
    // BSD `script` refuses a socket on stdin, so the keys go through a FIFO and `cat`, as `stile-tty.test.ts` does.
    const fifo = join(w.dir, "keys");
    const out = join(w.dir, "pty.out");
    spawnSync("mkfifo", [fifo]);
    const env = { ...w.env(), TERM: "xterm-256color" };
    const child = spawn("sh", ["-c", `cat < ${quote(fifo)} | script ${scriptArgs.map(quote).join(" ")} > ${quote(out)} 2>&1`], { cwd: w.dir, env, stdio: "ignore" });
    const keys = createWriteStream(fifo);
    const read = () => (existsSync(out) ? readFileSync(out, "utf8").replace(/\x1b\[[0-9;]*m/g, "") : "");
    const exited = new Promise<number>((resolve) => child.once("close", (code) => resolve(code ?? -1)));
    const waitFor = async (text: string) => {
      const deadline = Date.now() + 30_000;
      while (!read().includes(text)) {
        if (Date.now() > deadline) throw new Error(`the pty never showed ${JSON.stringify(text)}; it showed:\n${read()}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    await waitFor("│ Cloudflare API token");
    const typed = TOKEN.slice(0, 14);
    for (const key of typed) {
      keys.write(key);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await waitFor(hiddenShown(typed.length));
    for (const piece of runsOf(typed)) expect(read().includes(piece), "the pty gave back characters of the token").toBe(false);
    keys.write("\x03");
    keys.end();
    expect(await exited).toBe(2);
    expect(read()).toContain("collie: setup was interrupted; nothing more was asked, and what was kept is kept");
    expect(w.wrangler()).toEqual([]);
    expect(existsSync(join(w.kennel, "credentials"))).toBe(false);
  });
});
