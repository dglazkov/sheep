/**
 * Shear phase 0: the notice and the skew line, said once, from the built
 * command against the fake station (journey 1, journey 2 step 2, and
 * journey 5 step 1 for them).
 *
 * The station serves the header on every answer and the tip's manifest at
 * a route `SHEEP_TIP` names. A checkout's command has no stamp and never
 * says either line, so every run here names a stamped build through
 * `SHEEP_TEST_CLI_BUILD`, the seam the notice and the skew line read;
 * `readStamp` never sees it. Each world is a scratch kennel whose `HOME` is
 * its own, so the said file is the world's; `CI` is taken out of every
 * run's environment, since a runner sets it and it silences both lines.
 * The tip is fetched by a detached child the command never waits for (the
 * rework), so a case polls the said file and the fake's `tipClosed` for the
 * child's work, and each case ends with every child it started done.
 *
 * Shear phase 1: the floor (journey 4 steps 1 and 2, and journey 5 step 1
 * for it), from the same station: a verb it has no route for, `sheep
 * pasture ls <name>` asking a tree the fake never serves, refused with the
 * floor's sentence when the header is absent or older than `OLDEST_HOME`,
 * and bare at the floor, for a 500, and for a 401. Drove phase 1: `sheep
 * sh` against a station whose cell answers its bare `not found` for the
 * peek's route, which carries the floor's words whatever the header says.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { OLDEST_HOME } from "../src/home.js";
import { skewLine } from "../src/local.js";
import { fakeStation, type StationState } from "./fakes.js";
import { bin } from "./local-home.js";

const TOKEN = "a-station-token-shear-0123456789abcdef";
const CLI = { commit: "c0ffee1", builtAt: "2026-09-13T12:00:00Z" };
const NEWER = { commit: "5511bf9", builtAt: "2026-09-13T18:26:23Z" };
const OLDER = { commit: "a2b17e7", builtAt: "2026-09-10T08:00:00Z" };
const SESSIONS = [{ id: "11111111-2222-3333-4444-555555555555", name: "one", createdAt: Date.parse("2026-09-13T10:00:00Z"), state: "idle", pasture: null, task: null, secrets: [] }];

const cleanups: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

interface Run {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

/** A world: a fake station over `state`, a scratch kennel naming it, and the `HOME` the said file lives under. */
async function world(state: Partial<StationState>): Promise<{ state: StationState; dir: string; tip: string; sheep: (args: string[], env?: Record<string, string | undefined>) => Promise<Run> }> {
  const full: StationState = { token: TOKEN, sessions: SESSIONS as StationState["sessions"], pastures: [], build: CLI, ...state };
  const station = await fakeStation([], full);
  cleanups.push(async () => {
    station.server.closeAllConnections();
    await new Promise((resolve) => station.server.close(resolve));
  });
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-shear-")));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, ".sheep"));
  await writeFile(join(dir, ".sheep", "config"), JSON.stringify({ home: station.url, token: TOKEN }));
  const tip = `${station.url}/_tip/package.json`;
  const sheep = (args: string[], extra: Record<string, string | undefined> = {}): Promise<Run> => {
    const env: Record<string, string | undefined> = { ...process.env, HOME: dir, NODE_NO_WARNINGS: "1" };
    for (const name of Object.keys(env)) if (name.startsWith("SHEEP_") || name === "CI" || name === "CLOUDFLARE_API_TOKEN" || name === "ANTHROPIC_API_KEY") delete env[name];
    Object.assign(env, { SHEEP_TEST_CLI_BUILD: `${CLI.commit} ${CLI.builtAt}`, SHEEP_TIP: tip }, extra);
    for (const name of Object.keys(env)) if (env[name] === undefined) delete env[name];
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], { env, cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), ms: Date.now() - started }));
    });
  };
  return { state: full, dir, tip, sheep };
}

const NOTICE = `sheep: a newer build ${NEWER.commit} (${NEWER.builtAt}) is out; this command is ${CLI.commit} (${CLI.builtAt}); \`npm install -g github:dglazkov/sheep#release\` updates it\n`;

/** Polls until `check` holds, every 25 ms for up to `ms`; the child's work is asynchronous, and a fixed sleep would be a guess. */
async function until(check: () => boolean, ms = 5_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

/** The said file as it is on disk now, or `{}`: read raw, so a test sees `asked` and `tip` exactly as the command and the child wrote them. */
function saidIn(dir: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(join(dir, ".sheep", "tip.json"), "utf8"));
  } catch {
    return {};
  }
}

describe("the notice (journey 1)", () => {
  // The tip takes 500 ms to answer, as GitHub far away may: the child cannot land before its verb ends, so the first run
  // never says the notice and the next one does, which is the order the design promises "most often".
  it("is not said by the run that starts the child, is kept once the child lands, is said once by the next run, and stdout is byte-equal to a run with SHEEP_TIP=0", { timeout: 60_000 }, async () => {
    const { state, dir, sheep } = await world({ tip: NEWER, tipDelayMs: 500 });
    const first = await sheep(["ls"]);
    expect(first).toMatchObject({ code: 0, stderr: "" });
    expect(first.stdout).toContain(SESSIONS[0]!.id);
    // The ask was written before the child started; the tip, once the child lands.
    expect(Date.now() - Date.parse(saidIn(dir).asked)).toBeLessThan(60_000);
    expect(await until(() => saidIn(dir).tip !== undefined), JSON.stringify(saidIn(dir))).toBe(true);
    expect(saidIn(dir).tip).toMatchObject(NEWER);
    expect(Date.now() - Date.parse(saidIn(dir).tip.at)).toBeLessThan(60_000);
    expect(await until(() => state.tipClosed === 1)).toBe(true);

    const second = await sheep(["ls"]);
    expect(second).toMatchObject({ code: 0, stderr: NOTICE, stdout: first.stdout });
    expect(saidIn(dir)).toMatchObject({ tip: NEWER, noticed: NEWER.commit });
    const third = await sheep(["ls"]);
    expect(third).toMatchObject({ code: 0, stderr: "", stdout: first.stdout });
    // The kept tip is less than a day old, so neither later command started a child: one fetch for the one ask.
    expect(state.tipAsks).toBe(1);

    const off = await sheep(["ls"], { SHEEP_TIP: "0" });
    expect(off).toMatchObject({ code: 0, stderr: "" });
    expect(Buffer.from(off.stdout).equals(Buffer.from(first.stdout))).toBe(true);
    expect(state.tipAsks).toBe(1);
  });

  it("leaves --json's stdout as it was, and is said again, once, when the tip moves and both the tip and the ask are aged", { timeout: 60_000 }, async () => {
    const { state, dir, sheep } = await world({ tip: NEWER, tipDelayMs: 500 });
    const json = await sheep(["ls", "--json"]);
    expect(json).toMatchObject({ code: 0, stderr: "" });
    expect(await until(() => saidIn(dir).tip !== undefined)).toBe(true);
    expect(await sheep(["ls", "--json"])).toMatchObject({ code: 0, stderr: NOTICE, stdout: json.stdout });
    const off = await sheep(["ls", "--json"], { SHEEP_TIP: "0" });
    expect(off.stdout).toBe(json.stdout);
    expect(JSON.parse(json.stdout)).toHaveLength(1);

    // The tip moves on, and the kept one is aged past a day and the ask past ten minutes, so the next command starts a child.
    const later = { commit: "9e9e9e9", builtAt: "2026-09-14T09:00:00Z" };
    state.tip = later;
    const path = join(dir, ".sheep", "tip.json");
    const kept = saidIn(dir);
    await writeFile(path, JSON.stringify({ ...kept, tip: { ...kept.tip, at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }, asked: new Date(Date.now() - 11 * 60 * 1000).toISOString() }));
    expect(await sheep(["ls", "--json"])).toMatchObject({ code: 0, stdout: json.stdout, stderr: "" });
    expect(await until(() => saidIn(dir).tip?.commit === later.commit)).toBe(true);
    const moved = await sheep(["ls", "--json"]);
    expect(moved).toMatchObject({ code: 0, stdout: json.stdout, stderr: NOTICE.replace(`${NEWER.commit} (${NEWER.builtAt})`, `${later.commit} (${later.builtAt})`) });
    expect(await sheep(["ls", "--json"])).toMatchObject({ code: 0, stderr: "" });
    expect(await until(() => state.tipClosed === 2)).toBe(true);
    expect(state.tipAsks).toBe(2);
  });

  it("is never said, nor a child started, under CI, with SHEEP_TIP=0, or from a command with no stamp", { timeout: 60_000 }, async () => {
    const { state, dir, sheep } = await world({ tip: NEWER });
    for (const extra of [{ CI: "true" }, { SHEEP_TIP: "0" }, { SHEEP_TEST_CLI_BUILD: undefined }]) {
      const run = await sheep(["ls"], extra);
      expect(run, JSON.stringify(extra)).toMatchObject({ code: 0, stderr: "" });
    }
    // No ask was written, and an ask is written before any child starts.
    expect(existsSync(join(dir, ".sheep", "tip.json"))).toBe(false);
    expect(state.tipAsks ?? 0).toBe(0);
  });

  it("costs the verb nothing when the tip never answers, keeps nothing, and a second run within ten minutes starts no child", { timeout: 60_000 }, async () => {
    const { state, dir, sheep } = await world({ tip: "hang" });
    // Warm, then two with the tip off, the fastest compared with the run that started the child: were the exit to wait on
    // the child, it would cost its two-second timeout, and the margin is one.
    await sheep(["ls"], { SHEEP_TIP: "0" });
    const off = [await sheep(["ls"], { SHEEP_TIP: "0" }), await sheep(["ls"], { SHEEP_TIP: "0" })];
    const started = await sheep(["ls"]);
    const within = await sheep(["ls"]);
    for (const run of [started, within]) expect(run).toMatchObject({ code: 0, stderr: "", stdout: off[0]!.stdout });
    const fastest = Math.min(...off.map((run) => run.ms));
    expect(started.ms, `the child's run ${started.ms} ms against ${off.map((run) => run.ms)} ms`).toBeLessThan(fastest + 1_000);
    // The child gives up at its timeout and its request closes; by then a second child, had one started, would have asked.
    expect(await until(() => (state.tipClosed ?? 0) >= 1)).toBe(true);
    expect(state.tipAsks).toBe(1);
    expect(await until(() => state.tipClosed === state.tipAsks)).toBe(true);
    const said = saidIn(dir);
    expect(said.tip).toBeUndefined();
    expect(Date.now() - Date.parse(said.asked)).toBeLessThan(60_000);
  });
});

describe("the skew line from the header (journey 2 step 2)", () => {
  it("is said once across two runs for a station older than the command, and sheep home says it on both", { timeout: 60_000 }, async () => {
    const { sheep } = await world({ build: OLDER });
    const line = skewLine(OLDER, CLI, false)!;
    expect(line).toContain("is older than this command's");
    const off = { SHEEP_TIP: "0" };
    expect(await sheep(["ls"], off)).toMatchObject({ code: 0, stderr: line });
    expect(await sheep(["ls"], off)).toMatchObject({ code: 0, stderr: "" });
    for (let i = 0; i < 2; i++) {
      const home = await sheep(["home"], off);
      expect(home).toMatchObject({ code: 0, stderr: line });
      expect(home.stdout).toContain(`home build: ${OLDER.commit} (${OLDER.builtAt})`);
    }
    expect(await sheep(["ls"], off)).toMatchObject({ code: 0, stderr: "" });
  });

  it("is said once the other way for a command older than the station, naming the install", { timeout: 60_000 }, async () => {
    const { sheep } = await world({ build: NEWER });
    const off = { SHEEP_TIP: "0" };
    const first = await sheep(["ls"], off);
    expect(first).toMatchObject({ code: 0, stderr: skewLine(NEWER, CLI, false) });
    expect(first.stderr).toContain("npm install -g github:dglazkov/sheep#release");
    expect(await sheep(["ls"], off)).toMatchObject({ code: 0, stderr: "" });
  });

  it("says nothing for a header of the command's own commit at another time, for a home that sends none, or under CI", { timeout: 60_000 }, async () => {
    const off = { SHEEP_TIP: "0" };
    const same = await world({ build: { commit: CLI.commit, builtAt: "2026-09-13T12:07:41Z" } });
    expect(await same.sheep(["ls"], off)).toMatchObject({ code: 0, stderr: "" });
    expect(await same.sheep(["home"], off)).toMatchObject({ code: 0, stderr: "" });
    const before = await world({ build: OLDER, header: null });
    expect(await before.sheep(["ls"], off)).toMatchObject({ code: 0, stderr: "" });
    const ci = await world({ build: OLDER });
    expect(await ci.sheep(["ls"], { ...off, CI: "1" })).toMatchObject({ code: 0, stderr: "" });
    expect(existsSync(join(same.dir, ".sheep", "tip.json"))).toBe(false);
  });
});

describe("the floor (journey 4)", () => {
  const off = { SHEEP_TIP: "0" };
  const floor = (named: string) => `the home's build ${named} is older than this command speaks to; \`sheep home deploy\` from this package updates it`;

  it("answers ls as before with no skew line from a home that sends no header, and a verb it 404s carries the floor's sentence", { timeout: 60_000 }, async () => {
    const { sheep } = await world({ build: OLDER, header: null });
    const listed = await sheep(["ls"], off);
    expect(listed).toMatchObject({ code: 0, stderr: "" });
    expect(listed.stdout).toContain(SESSIONS[0]!.id);
    const refused = await sheep(["pasture", "ls", "fold"], off);
    expect(refused).toMatchObject({ code: 2, stdout: "", stderr: `sheep: no; ${floor("(a build from before the header)")}\n` });
  });

  it("carries the sentence from a header older than the floor, and none from a header at the floor", { timeout: 60_000 }, async () => {
    const below = { commit: "a2b17e7", builtAt: new Date(Date.parse(OLDEST_HOME) - 1_000).toISOString().replace(/\.\d{3}Z$/, "Z") };
    const older = await world({ build: below });
    const refused = await older.sheep(["pasture", "ls", "fold"], off);
    expect(refused).toMatchObject({ code: 2, stdout: "", stderr: `sheep: no; ${floor(`${below.commit} (${below.builtAt})`)}\n${skewLine(below, CLI, false) ?? ""}` });

    const at = await world({ build: { commit: "f00d000", builtAt: OLDEST_HOME } });
    const bare = await at.sheep(["pasture", "ls", "fold"], off);
    expect(bare).toMatchObject({ code: 2, stdout: "", stderr: `sheep: no\n${skewLine({ commit: "f00d000", builtAt: OLDEST_HOME }, CLI, false) ?? ""}` });
  });

  it("drove phase 1: refuses `sheep sh` with the floor's words when the home's cell answers its bare not found, whatever the header's time", { timeout: 60_000 }, async () => {
    const id = SESSIONS[0]!.id;
    const at = { commit: "f00d000", builtAt: OLDEST_HOME };
    const { sheep } = await world({ build: at, routes: { [`/s/${id}/sh`]: { status: 404, body: "not found" } } });
    const lacked = await sheep(["sh", id, "--", "true"], off);
    expect(lacked).toMatchObject({ code: 2, stdout: "", stderr: `sheep: ${floor(`${at.commit} (${at.builtAt})`)}\n${skewLine(at, CLI, false) ?? ""}` });
    // An id the home lacks is still its sentence, exit 2, and carries no floor from a home at it.
    const refused = await (await world({ build: at, routes: { [`/s/${id}/sh`]: { status: 404, body: `no session ${id} at this home` } } })).sheep(["sh", id, "--", "true"], off);
    expect(refused).toMatchObject({ code: 2, stdout: "", stderr: `sheep: no session ${id} at this home\n${skewLine(at, CLI, false) ?? ""}` });
  });

  it("leaves a 500 with no header bare, as workerd answers a route that threw, and a 401 too", { timeout: 60_000 }, async () => {
    const { sheep, dir } = await world({ build: OLDER, header: null, routes: { "/p/fold/tree": { status: 500, body: "boom" } } });
    expect(await sheep(["pasture", "ls", "fold"], off)).toMatchObject({ code: 2, stdout: "", stderr: "sheep: GET /p/fold/tree: 500 boom\n" });
    await writeFile(join(dir, ".sheep", "config"), JSON.stringify({ home: JSON.parse(readFileSync(join(dir, ".sheep", "config"), "utf8")).home, token: "not-the-token" }));
    expect(await sheep(["ls"], off)).toMatchObject({ code: 2, stdout: "", stderr: "sheep: GET /sessions: 401 unauthorized\n" });
  });
});
