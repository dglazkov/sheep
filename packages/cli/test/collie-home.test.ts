/**
 * Collie phase 2's walk on the rig (journey 6 step 2): journey 1's sittings
 * in their order and in their programs' own shapes, then journeys 3, 2
 * (steps 3 and 4), and 5 (step 6), with nothing faked.
 *
 * The world is one scratch directory that is `HOME`: a kennel with this
 * checkout's own local home in it (`sheep home local --faux
 * --no-container`, through `local-home.ts`'s `startKennelHome`), standing in
 * for step 1's station; a real isocan daemon started by the root
 * `node_modules/.bin/isocan` (the collie's pin, the devDependency) on a free
 * port with its own `ISOCAN_HOME`, the person named and a canvas made by that
 * isocan and `work/` bound to it (step 2); and that isocan first on the
 * world's `PATH` as a symlink to its bin, the shape an install gives, since
 * the collie imports the isocan on PATH. Every harness variable isocan reads
 * is taken out of the environment, so the walk speaks as the machine's
 * person and never as the agent running it.
 *
 * Then `collie setup --json` finding both sides (and refusing the local home,
 * the rig named), `collie local`, and `collie new` in the bound directory,
 * minting through isocan's API against the daemon (the rig reaches loopback).
 * An ask at the daemon's `POST /api/projects/:id/agents/ask`, on the
 * person's own badge, stands in for the tray. The faux model answers `ok`
 * after a delay the walk sets at the home's test-only `/faux`, so the face is
 * seen while a turn runs; what is asserted is that the summons reached the
 * sheep, the face appeared and went, the cursor advanced, and the narration's
 * lines, never a reply, which needs a real model and a container.
 *
 * The cases share the world and run in order; each names the journey step it
 * walks. Skips, with a sentence, when the kennel's home cannot start here.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type KennelHome, type Result, startKennelHome, stopKennelHome } from "./local-home.js";

const collieBin = new URL("../bin/collie.js", import.meta.url).pathname;
const sheepBin = new URL("../bin/sheep.js", import.meta.url).pathname;
/** The root devDependency's bin, as pnpm links it (a shell shim), and the file it runs. */
const isocanShim = new URL("../../../node_modules/.bin/isocan", import.meta.url).pathname;
const isocanPackage = new URL("../../../node_modules/isocan/", import.meta.url).pathname;

const TITLE = "Collie Walk";
const PRICE_LINE = "standing by costs one object awake, about four dollars a month at Cloudflare's list price, inside the plan's included duration for the first";
/** Isocan's client-features header: a canvas made by this isocan uses groups, and its routes refuse a client that does not say so. */
const FEATURES = { "x-isocan-features": "canvas-groups-v4" };
/** The variables isocan reads a harness session from (`harnessVars`), and sheep's own; none of them is the world's. */
const STRIPPED = ["ISOCAN_SESSION_ID", "ISOCAN_HARNESS", "CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID", "PI_SESSION_ID", "ANTIGRAVITY_CONVERSATION_ID", "CI", "CLOUDFLARE_API_TOKEN"];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

async function until<T>(read: () => Promise<T> | T, ok: (value: T) => boolean, what: string, ms = 60_000): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T;
  for (;;) {
    last = await read();
    if (ok(last)) return last;
    if (Date.now() > deadline) throw new Error(`waited ${ms} ms for ${what}; last: ${typeof last === "string" ? last : JSON.stringify(last)}`);
    await sleep(250);
  }
}

interface World {
  dir: string;
  work: string;
  bin: string;
  isocanHome: string;
  port: number;
  env: Record<string, string>;
  daemon?: ChildProcess;
  home?: KennelHome;
  canvasId?: string;
  actor?: { id: string; name: string };
}

const world: World | string = await (async (): Promise<World | string> => {
  if (!existsSync(isocanShim)) return `no isocan at ${isocanShim}; \`pnpm install\` installs the root devDependency`;
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "collie-home-")));
  const work = join(dir, "work");
  const bin = join(dir, "bin");
  await mkdir(work);
  await mkdir(bin);
  await symlink(realpathSync(join(isocanPackage, "packages", "cli", "bin", "isocan.js")), join(bin, "isocan"));
  const port = await freePort();
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith("SHEEP_") || STRIPPED.includes(name)) delete env[name];
  Object.assign(env, {
    HOME: dir,
    ISOCAN_HOME: join(dir, "isocan"),
    ISOCAN_PORT: String(port),
    PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    SHEEP_TIP: "0",
    NODE_NO_WARNINGS: "1",
    // A scratch HOME loses Docker's buildx (collie phase 1's finding); the home here rents no container, and the setting costs nothing.
    DOCKER_CONFIG: join(homedir(), ".docker"),
  });
  const w: World = { dir, work, bin, isocanHome: join(dir, "isocan"), port, env: env as Record<string, string> };
  const home = await startKennelHome(work, w.env);
  if (typeof home === "string") {
    await rm(dir, { recursive: true, force: true });
    return home;
  }
  w.home = home;
  return w;
})();
if (typeof world === "string") process.stderr.write(`collie-home skipped: ${world}\n`);

function the(): World {
  if (typeof world === "string") throw new Error(world);
  return world;
}

function run(file: string, args: readonly string[], options: { stdin?: string; cwd?: string; env?: Record<string, string> } = {}): Promise<Result> {
  const w = the();
  return new Promise((resolve, reject) => {
    const child = spawn(file === "node" ? process.execPath : file, args, { cwd: options.cwd ?? w.work, env: { ...w.env, ...options.env }, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
    child.stdin.end(options.stdin ?? "");
  });
}

const collie = (args: readonly string[], options?: { stdin?: string; cwd?: string }) => run("node", [collieBin, ...args], options);
const sheep = (args: readonly string[]) => run("node", [sheepBin, ...args]);
/** The isocan first on the world's PATH, as the shepherd types it. */
const isocan = (args: readonly string[], options?: { env?: Record<string, string> }) => run(join(the().bin, "isocan"), args, options);

async function isocanJson<T>(args: readonly string[], options?: { env?: Record<string, string> }): Promise<T> {
  const result = await isocan(["--json", ...args], options);
  if (result.code !== 0) throw new Error(`isocan ${args.join(" ")} exited ${result.code}: ${result.stderr}`);
  return JSON.parse(result.stdout) as T;
}

/** The daemon, started by the root devDependency's own bin, answering its health route. */
async function startDaemon(): Promise<void> {
  const w = the();
  const child = spawn(isocanShim, ["serve", "--foreground"], { cwd: w.work, env: w.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  w.daemon = child;
  await until(
    async () => {
      if (child.exitCode !== null) throw new Error(`the isocan daemon exited ${child.exitCode}: ${output}`);
      return fetch(`http://127.0.0.1:${w.port}/healthz`).then((response) => response.ok, () => false);
    },
    (up) => up,
    "the isocan daemon to answer",
  );
}

async function stopDaemon(): Promise<void> {
  const child = the().daemon;
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(10_000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

/** The person's own badge at the daemon, as isocan keeps it in `identity.json`. */
function badgeToken(): string {
  const w = the();
  const identity = JSON.parse(readFileSync(join(w.isocanHome, "identity.json"), "utf8")) as { auth: Record<string, { badgeId: string; secret: string }> };
  const auth = identity.auth[`http://127.0.0.1:${w.port}`] ?? Object.values(identity.auth)[0]!;
  return `${auth.badgeId}.${auth.secret}`;
}

async function daemon<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`http://127.0.0.1:${the().port}${path}`, {
    method,
    headers: { authorization: `Bearer ${badgeToken()}`, ...FEATURES, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T };
}

/** The narration, one line per row, as `collie log --json` gives it. */
async function narration(): Promise<string[]> {
  const result = await collie(["log", "--json", "--last", "1000"]);
  if (result.code !== 0) return [];
  return result.stdout.trim().split("\n").filter(Boolean).map((line) => (JSON.parse(line) as { line: string }).line);
}

interface Who {
  sessions: { actor: { id: string; name: string }; kind: string; harness: string | null }[];
  standing: { actor: { id: string; name: string }; state: string; listens: string; policy: { owner: { id: string; name: string } } }[];
}

/** Percy's face: a presence session under Percy's actor, which the room puts on for a turn and takes off after. */
const faceOn = (who: Who) => who.sessions.some((session) => session.actor.name === "Percy" && session.kind !== "rc");

interface Entry {
  type: string;
  message?: { role: string; content: { type: string; text?: string }[] };
}

/** The summonses the sheep was sent: every user message in its transcript, as text. */
async function summonses(id: string): Promise<string[]> {
  const result = await sheep(["log", id, "--json"]);
  if (result.code !== 0) return [];
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Entry)
    .filter((entry) => entry.type === "message" && entry.message?.role === "user")
    .map((entry) => entry.message!.content.map((part) => part.text ?? "").join(""));
}

/** The comment ids a summons carries, from the payload isocan puts at its end. */
function carried(summons: string): { comment: string; redelivered: boolean }[] {
  const payload = JSON.parse(summons.slice(summons.indexOf("\n{") + 1)) as { entries: { redelivered?: boolean; envelope: { op: { comment?: { id: string } } } }[] };
  return payload.entries.map((entry) => ({ comment: entry.envelope.op.comment?.id ?? "", redelivered: entry.redelivered === true }));
}

/** A delay before the faux model's `ok`, for every sheep at the kennel's home. */
async function fauxDelay(ms: number): Promise<void> {
  const home = the().home!;
  const response = await fetch(`${home.url}/faux`, { method: "POST", headers: { authorization: `Bearer ${home.token}` }, body: JSON.stringify({ steps: [{ text: "ok", delayMs: ms }] }) });
  expect(response.status).toBe(200);
}

async function comment(text: string, at: string, env?: Record<string, string>): Promise<string> {
  return (await isocanJson<{ commentId: string }>(["comment", "add", text, "--at", at], { env })).commentId;
}

const count = (lines: string[], text: string) => lines.filter((line) => line.includes(text)).length;

describe.skipIf(typeof world === "string")("the collie on the rig, walked whole (journey 6 step 2)", { timeout: 300_000 }, () => {
  let sheepId = "";

  beforeAll(async () => {
    const w = the();
    await startDaemon();
    // Step 2, isocan's own sitting without its browser: the person named, a canvas made, this directory bound to it.
    const named = await isocan(["identity", "--home", "--name", "Dimitri"]);
    expect(named.code, named.stderr).toBe(0);
    const identity = JSON.parse(readFileSync(join(w.isocanHome, "identity.json"), "utf8")) as { id: string; name: string };
    w.actor = { id: identity.id, name: identity.name };
    expect(w.actor.name).toBe("Dimitri");
    const made = await isocanJson<{ canvasId: string }>(["canvas", "create", TITLE]);
    w.canvasId = made.canvasId;
    expect(w.canvasId, JSON.stringify(made)).toMatch(/^prj_/);
    const bound = await isocan(["use", w.canvasId!]);
    expect(bound.code, bound.stderr).toBe(0);
    expect(existsSync(join(w.work, ".isocan", "project.json"))).toBe(true);
  }, 120_000);

  afterAll(async () => {
    if (typeof world === "string") return;
    await collie(["local", "stop"]).catch(() => undefined);
    await stopKennelHome(world.work, world.env).catch(() => undefined);
    await stopDaemon().catch(() => undefined);
    // And a daemon an `isocan` command started for itself while the walk's was down, which is not the walk's child.
    await isocan(["stop"]).catch(() => undefined);
    await rm(world.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it("journey 1 step 3 on the rig: collie setup --json finds the kennel's local home and the identity, refuses at sheep with the rig named, and deploys nothing", async () => {
    const w = the();
    const result = await collie(["setup", "--json"]);
    expect(result.code, result.stderr).toBe(2);
    const report = JSON.parse(result.stdout) as { refused: string; step: string; needs: string[]; sheep: { home: string; local: boolean }; isocan: { name: string; actorId: string; home: string } };
    expect(report.step).toBe("sheep");
    expect(report.needs).toEqual(["sheep"]);
    expect(report.refused).toContain("`collie local` is the rig for a local home");
    expect(report.refused).toMatch(/nothing was deployed$/);
    expect(report.sheep).toMatchObject({ home: w.home!.url, local: true });
    expect(report.isocan).toEqual({ name: "Dimitri", actorId: w.actor!.id, home: w.isocanHome });
    expect((JSON.parse(readFileSync(w.home!.config, "utf8")) as { collie?: unknown }).collie).toBeUndefined();
  });

  it("journey 1 step 4: collie local, then collie new in the bound directory stands by, the pass minted through isocan and shown nowhere", async () => {
    const w = the();
    const local = await collie(["local", "--json"]);
    expect(local.code, local.stderr).toBe(0);
    const rig = JSON.parse(local.stdout) as { url: string; station: string };
    expect(rig.station).toBe(w.home!.url);

    const address = `http://127.0.0.1:${w.port}/p/${w.canvasId}`;
    const minted = await collie(["new"]);
    expect(minted, minted.stderr).toMatchObject({ code: 0 });
    expect(minted.stdout).toBe(`collie: standing by on "${TITLE}" at ${address}, as Dimitri\n${PRICE_LINE}\nagents are added in the tray at ${address}\n\`collie log\` follows what it does\n`);
    expect(minted.stderr).toBe("");
    const report = JSON.parse((await collie(["--json"])).stdout) as { on: boolean; rooms: { canvasId: string; title: string; owner: string }[] };
    expect(report).toMatchObject({ on: true, rooms: [{ canvasId: w.canvasId, title: TITLE, owner: "Dimitri" }] });
    await until(narration, (lines) => lines.includes(`answering on "${TITLE}" — ${address}`), "the room to say it answers");
  });

  it("journey 1 step 5: an ask at the doorbell enrols Percy, answerable and listening to Dimitri", async () => {
    const w = the();
    const asked = await daemon<{ ok?: boolean; error?: string }>("POST", `/api/projects/${w.canvasId}/agents/ask`, { name: "Percy", from: w.actor });
    expect(asked, JSON.stringify(asked.body)).toMatchObject({ status: 200, body: { ok: true } });
    await until(narration, (lines) => lines.includes("Dimitri asked from the canvas to add Percy — enrolling here"), "the enrolment narrated");
    const who = await until(
      () => isocanJson<Who>(["who"]),
      (value) => value.standing.some((row) => row.actor.name === "Percy" && row.state === "answerable"),
      "isocan who to read Percy answerable",
    );
    const percy = who.standing.find((row) => row.actor.name === "Percy")!;
    expect(percy.policy.owner).toEqual(w.actor);
    expect(percy.listens).toBe("listens only to you");
  });

  it("journey 1 steps 6 and 7: a mention births Percy's sheep at the local home; the summons reaches it, the face appears and goes, and the narration says each beat", async () => {
    await fauxDelay(8_000);
    const commentId = await comment("@Percy the empty state reads wrong", "0,0");
    await until(() => isocanJson<Who>(["who"]), faceOn, "Percy's face on the canvas while the turn runs");
    const lines = await until(narration, (value) => value.includes("Percy · turn ended — end_turn"), "the turn's end narrated");
    await until(() => isocanJson<Who>(["who"]), (who) => !faceOn(who), "Percy's face to go");

    const minted = lines.find((line) => /^Percy · sheep \S+ minted/.test(line))!;
    sheepId = /^Percy · sheep (\S+) minted/.exec(minted)![1]!;
    const beats = ["Percy · summons from Dimitri, 1 entry — starting a session", `Percy · birthing a sheep for Percy at ${the().home!.url}`, "Percy · making pasture isocan-percy", "Percy · minting a pass for Percy", minted, `Percy · session started at ${the().home!.url}`, "Percy · turn ended — end_turn"];
    let at = -1;
    for (const beat of beats) {
      const found = lines.findIndex((line, index) => index > at && line.startsWith(beat));
      expect(found, `${beat} after line ${at}:\n${lines.join("\n")}`).toBeGreaterThan(at);
      at = found;
    }

    const ls = await sheep(["ls"]);
    const row = ls.stdout.split("\n").find((line) => line.startsWith(sheepId))!.split("\t");
    expect(row.slice(1, 2).concat(row.slice(3, 6))).toEqual(["Percy", "idle", "isocan-percy", "ISOCAN_PASS"]);
    const sent = await summonses(sheepId);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(`You are Percy, an agent enrolled on the isocan canvas "${TITLE}"`);
    expect(carried(sent[0]!)).toEqual([{ comment: commentId, redelivered: false }]);
  });

  it("journey 5 step 6: a mention by somebody Percy does not listen to is answered by isocan's system voice and starts nothing", async () => {
    const nico = { ISOCAN_HARNESS: "isocan", ISOCAN_SESSION_ID: "collie-walk-nico" };
    const named = await isocan(["identity", "--name", "Nico", "--session"], { env: nico });
    expect(named.code, named.stderr).toBe(0);
    await comment("@Percy please look at the footer", "40,40", nico);
    await until(narration, (lines) => lines.includes("Percy · Nico asked; listens only to you — said so in the thread, nothing started"), "the room to say it did not start");
    const threads = await until(
      () => isocanJson<{ comments: { author: { id: string }; body: string }[] }[]>(["comment", "list"]),
      (value) => value.some((thread) => thread.comments[0]?.body === "@Percy please look at the footer" && thread.comments.length === 2),
      "isocan's reply in the thread",
    );
    const answered = threads.find((thread) => thread.comments[0]?.body === "@Percy please look at the footer")!;
    expect(answered.comments.map((one) => one.author.id)).toEqual([expect.stringMatching(/^usr_/), expect.stringMatching(/^sys_/)]);
    expect(answered.comments[1]!.body).toMatch(/^Percy listens only to Dimitri/);
    expect(await summonses(sheepId)).toHaveLength(1);
  });

  it("journey 3 steps 1 and 2: off, and the tray reads nobody within a second; a mention held; on, and it is the next summons, the first not sent again", async () => {
    const w = the();
    await fauxDelay(1_000);
    const off = await collie(["off"]);
    expect(off).toEqual({ code: 0, stdout: `collie: off — holds released; "${TITLE}" reads nobody listening; collie on resumes\n`, stderr: "" });
    const released = Date.now();
    // Read until the tray reads nobody (a hold outlives its socket by up to its ten seconds otherwise); the second is asserted
    // at the end of the case, so the rest of the switch is walked either way and the failure names the time it took.
    await until(
      () => daemon<{ actorIds: string[] }>("GET", `/api/projects/${w.canvasId}/rc`),
      (answer) => answer.status === 200 && answer.body.actorIds.length === 0,
      "the tray to read nobody listening",
      15_000,
    );
    const nobodyAfter = Date.now() - released;
    process.stderr.write(`collie-home: the tray read nobody listening ${nobodyAfter} ms after collie off exited\n`);

    const held = await comment("@Percy and the heading above it", "0,40");
    await sleep(6_000);
    expect(await summonses(sheepId)).toHaveLength(1);

    const on = await collie(["on"]);
    expect(on).toEqual({ code: 0, stdout: `collie: standing by on "${TITLE}"\n`, stderr: "" });
    const sent = await until(() => summonses(sheepId), (value) => value.length === 2, "the held mention as the next summons");
    // The cursor advanced past the first turn's entry: the next summons carries the held mention alone, and not Nico's.
    expect(carried(sent[1]!)).toEqual([{ comment: held, redelivered: false }]);
    await until(narration, (lines) => count(lines, "Percy · turn ended — end_turn") === 2, "the held mention's turn to end");
    expect(nobodyAfter, "ms from off's exit to the tray reading nobody listening").toBeLessThan(1_000);
  });

  it("journey 2 step 3: the sheep home restarted mid-turn; the follow's drop is said once and taken up again, and the turn ends once", async () => {
    const w = the();
    await fauxDelay(15_000);
    const mention = await comment("@Percy through a restart", "80,80");
    await until(() => summonses(sheepId), (value) => value.length === 3, "the summons at the sheep");
    await until(() => isocanJson<Who>(["who"]), faceOn, "Percy's face while the turn runs");
    await sleep(2_000);
    await stopKennelHome(w.work, w.env);
    await sleep(1_500);
    const again = await startKennelHome(w.work, w.env);
    expect(again).toEqual(w.home);

    const lines = await until(narration, (value) => count(value, "Percy · turn ended — end_turn") === 3, "the restarted turn's end", 120_000);
    const dropped = lines.filter((line) => line.includes("stopped answering for"));
    expect(dropped, lines.join("\n")).toHaveLength(1);
    expect(dropped[0]).toMatch(new RegExp(`^Percy · the station at ${w.home!.url.replace(/[.]/g, "\\.")} stopped answering for \\d+s — following sheep ${sheepId}'s turn again$`));
    const sent = await summonses(sheepId);
    expect(sent.filter((text) => carried(text).some((entry) => entry.comment === mention))).toHaveLength(1);
    await until(() => isocanJson<Who>(["who"]), (who) => !faceOn(who), "Percy's face to go after the turn");
  });

  it("journey 2 step 4: the isocan daemon restarted; the room says so once and comes back with nothing missed", async () => {
    await stopDaemon();
    await until(narration, (lines) => lines.includes("the daemon stopped answering — retrying, and starting it if it is gone"), "the room to hear the daemon go", 60_000);
    await sleep(2_000);
    await startDaemon();
    const lines = await until(narration, (value) => value.some((line) => /^daemon back after \d+s — nothing missed$/.test(line)), "back after", 120_000);
    expect(count(lines, "the daemon stopped answering")).toBe(1);
    await until(
      () => isocanJson<Who>(["who"]),
      (who) => who.standing.some((row) => row.actor.name === "Percy" && row.state === "answerable"),
      "Percy answerable again",
      60_000,
    );
  });

  it("journey 3 step 3 on the rig: the end ends the collie's badge (isocan badges lists it no more), and the enrolment and the sheep stay", async () => {
    const listed = async () => (await isocanJson<{ badges: { badgeId: string; self: boolean; actors: { name: string }[] }[] }>(["badges"])).badges;
    const before = await listed();
    // This machine's badge, and the collie's: the person's second machine, holding Percy's claim.
    expect(before.map((badge) => badge.self).sort()).toEqual([false, true]);
    const collies = before.find((badge) => !badge.self)!;
    expect(collies.actors.map((actor) => actor.name)).toEqual(expect.arrayContaining(["Dimitri", "Percy"]));
    // `collie rm` on the rig (builder A's rm.ts): the listing, the name typed (one line of stdin here), `DELETE /` at the rig ending
    // the badge, the rig stopped, the block cleared. A wrong name first, which ends nothing.
    const wrong = await collie(["rm"], { stdin: "whatever\n" });
    expect(wrong.code).toBe(2);
    const name = /^collie rm ends (\S+), the collie at/m.exec(wrong.stdout)?.[1];
    expect(name, `${wrong.stdout}${wrong.stderr}`).toBeDefined();
    expect(wrong.stderr).toBe(`collie: whatever is not ${name}; nothing was ended\n`);
    expect((await listed()).map((badge) => badge.badgeId)).toContain(collies.badgeId);
    const ended = await collie(["rm"], { stdin: `${name}\n` });
    expect(ended.code, `${ended.stdout}${ended.stderr}`).toBe(0);
    expect(ended.stdout).toContain(`ended: the badge at http://127.0.0.1:${the().port}\n`);
    expect(ended.stdout).toMatch(/^stopped: the rig at /m);
    expect((JSON.parse(readFileSync(the().home!.config, "utf8")) as { collie?: unknown }).collie).toBeUndefined();
    const after = await until(listed, (badges) => !badges.some((badge) => badge.badgeId === collies.badgeId), "isocan badges to list the collie's badge no more", 30_000);
    expect(after.map((badge) => badge.self)).toEqual([true]);
    const who = await isocanJson<Who>(["who"]);
    expect(who.standing.map((row) => row.actor.name)).toContain("Percy");
    expect((await sheep(["ls"])).stdout).toContain(sheepId);
  });
});
