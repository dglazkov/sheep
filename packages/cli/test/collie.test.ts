/**
 * Collie phase 1, the command half: the built `collie` spawned against a
 * fake collie Worker (journey 1 step 4, journey 3 steps 1 and 2, journey 5
 * steps 3 to 5, journey 6 step 1's command ring).
 *
 * The fake is an `http` server speaking the phase's wire contract and no
 * more: `x-collie-build` on every answer, the bearer on every route but
 * `GET /`, a 401 in text without it, refusals as `{ error }`, and the
 * routes' shapes. It records every request, so a case can say what was
 * asked, with what token, and with what body. Each world is a scratch
 * directory that is both the kennel's parent and `HOME`, so the config
 * and the said file are the world's own; `CI` and every `SHEEP_` variable
 * are taken out of the child's environment, `SHEEP_TIP=0` is set unless a
 * case is about the notice, and `TZ` is a zone half an hour off UTC, so a
 * clock printed in UTC could not pass for the local one.
 *
 * The pass: typed at a real terminal (`script`'s pty, as
 * `stile-tty.test.ts` drives one) and given as one line of stdin. While
 * the fake holds `POST /passes`, every process's arguments are read with
 * `ps`, and after, every file under the world is read; the pass's token is
 * in neither, nor anywhere on the terminal.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const collieBin = new URL("../bin/collie.js", import.meta.url).pathname;
const guideFile = new URL("../collie-guide.md", import.meta.url).pathname;

const TOKEN = "collie-bearer-Qm3Vx8Lr2Tn6Wb9K";
const TZ = "Asia/Kolkata";
const CLI = { commit: "c0ffee1", builtAt: "2026-09-14T12:00:00Z" };
const OLDER = { commit: "a2b17e7", builtAt: "2026-09-13T08:00:00Z" };
const NEWER = { commit: "5511bf9", builtAt: "2026-09-14T18:00:00Z" };
/** The pass's token: no word that is on any screen, so any eight of its characters in a row are the pass and nothing else. */
const PASS_TOKEN = "Zq4Wm8Rt2Yx6Kb9Hd3Lp7Nc5Vf1Gj0";
const PASS = `https://isocan.io/pass/${PASS_TOKEN}`;

const ROOM = { canvasId: "cnv_7f3a", title: "Landing page", origin: "https://isocan.io", address: "https://isocan.io/p/cnv_7f3a" };
const ROOM2 = { canvasId: "cnv_91bd", title: "Pricing", origin: "https://isocan.io", address: "https://isocan.io/p/cnv_91bd" };
const SHEEP_ID = "11111111-2222-3333-4444-555555555555";

type Json = Record<string, unknown>;

interface Recorded {
  method: string;
  path: string;
  auth: string | undefined;
  body: string;
}

interface CollieState {
  /** The header's build; null sends no header, as a Worker from before it would. */
  build: { commit: string; builtAt: string | null } | null;
  on: boolean;
  since: string | null;
  limits: { turnsPerHour: number; chain: number };
  rooms: (typeof ROOM & { owner: string; agents: Json[] })[];
  lines: { seq: number; at: string; canvasId: string | null; title: string | null; line: string }[];
  /** What `POST /passes` answers, by the address in its body; any other address is isocan's unknown pass. */
  passes: Record<string, { status: number; body: Json }>;
  /** How long `POST /passes` is held before it answers. */
  passHoldMs: number;
  /** A route answered with this instead, by `METHOD /path`. */
  refuse: Record<string, { status: number; body: Json }>;
  requests: Recorded[];
}

function freshState(state: Partial<CollieState> = {}): CollieState {
  return { build: CLI, on: true, since: "2026-09-14T03:42:10Z", limits: { turnsPerHour: 20, chain: 5 }, rooms: [], lines: [], passes: {}, passHoldMs: 0, refuse: {}, requests: [], ...state };
}

/** The fake collie Worker: the contract's routes over `state`, every request recorded. */
async function fakeCollie(state: CollieState): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const url = new URL(request.url ?? "/", "http://fake");
    const key = `${request.method} ${url.pathname}`;
    state.requests.push({ method: request.method ?? "GET", path: `${url.pathname}${url.search}`, auth: request.headers.authorization, body });
    if (state.build !== null) response.setHeader("x-collie-build", `${state.build.commit}${state.build.builtAt === null ? "" : ` ${state.build.builtAt}`}`);
    const json = (status: number, value: unknown) => {
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(value));
    };
    if (key === "GET /") return response.end("collie\n");
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.statusCode = 401;
      return response.end("unauthorized");
    }
    const refused = state.refuse[key];
    if (refused !== undefined) return json(refused.status, refused.body);
    const bare = state.rooms.map(({ agents: _agents, owner: _owner, ...room }) => room);
    switch (key) {
      case "GET /home":
        return json(200, { build: state.build ?? { commit: "0.0.0-checkout", builtAt: null }, on: state.on, since: state.since, rooms: state.rooms.length });
      case "GET /report":
        return json(200, { on: state.on, since: state.since, limits: state.limits, rooms: state.rooms });
      case "GET /log": {
        const since = url.searchParams.get("since");
        const last = url.searchParams.get("last");
        let lines = state.lines;
        if (since !== null) lines = lines.filter((row) => row.seq > Number(since));
        lines = lines.slice(-(last !== null ? Number(last) : since !== null ? lines.length || 1 : 100));
        const newest = state.lines.at(-1)?.seq ?? 0;
        return json(200, { lines, last: lines.at(-1)?.seq ?? (since !== null ? Number(since) : newest) });
      }
      case "POST /off":
        state.on = false;
        return json(200, { on: false, rooms: bare });
      case "POST /on":
        state.on = true;
        return json(200, { on: true, rooms: bare });
      case "POST /passes": {
        await new Promise((resolve) => setTimeout(resolve, state.passHoldMs));
        const address = (JSON.parse(body || "{}") as { address?: string }).address ?? "";
        const answer = state.passes[address] ?? { status: 400, body: { error: "that pass is not one isocan minted; `isocan pass` prints a new one" } };
        return json(answer.status, answer.body);
      }
      default:
        return json(404, { error: `no route ${key}` });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${port}` };
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

interface World {
  dir: string;
  kennel: string;
  url: string;
  state: CollieState;
  /**
   * This world's path to the command: a symlink to `bin/collie.js` in a directory of its own outside the world. The processes
   * it spawns carry it in their arguments, so a case reading `ps` finds its own and never another file's running at once.
   */
  bin: string;
  env: (extra?: Record<string, string | undefined>) => Record<string, string>;
  collie: (args: string[], options?: { stdin?: string; env?: Record<string, string | undefined> }) => Promise<Run>;
}

/** A world: the fake over `state`, a scratch directory that is `HOME` and holds the kennel, and a config naming the collie (or not). */
async function world(state: Partial<CollieState> = {}, options: { collie?: boolean } = {}): Promise<World> {
  const full = freshState(state);
  const fake = await fakeCollie(full);
  cleanups.push(async () => {
    fake.server.closeAllConnections();
    await new Promise((resolve) => fake.server.close(resolve));
  });
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-collie-")));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const binDir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-collie-bin-")));
  cleanups.push(() => rm(binDir, { recursive: true, force: true }));
  const bin = join(binDir, "collie.js");
  await symlink(collieBin, bin);
  const kennel = join(dir, ".sheep");
  await mkdir(kennel);
  const config: Json = { home: "https://sheep-2.fake.workers.dev", token: "a-station-token", name: "sheep-2" };
  if (options.collie !== false) config.collie = { name: "sheep-2-collie", address: fake.url, token: TOKEN };
  await writeFile(join(kennel, "config"), JSON.stringify(config), { mode: 0o600 });
  const env = (extra: Record<string, string | undefined> = {}) => {
    const merged: Record<string, string | undefined> = { ...process.env, HOME: dir, NODE_NO_WARNINGS: "1", TZ };
    for (const name of Object.keys(merged)) if (name.startsWith("SHEEP_") || name === "CI" || name === "CLOUDFLARE_API_TOKEN") delete merged[name];
    Object.assign(merged, { SHEEP_TIP: "0" }, extra);
    for (const name of Object.keys(merged)) if (merged[name] === undefined) delete merged[name];
    return merged as Record<string, string>;
  };
  const collie = (args: string[], run: { stdin?: string; env?: Record<string, string | undefined> } = {}): Promise<Run> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], { env: env(run.env), cwd: dir, stdio: [run.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
      if (run.stdin !== undefined) child.stdin!.end(run.stdin);
    });
  return { dir, kennel, url: fake.url, state: full, bin, env, collie };
}

/** Every file under `root`, read whole; a FIFO or a socket is skipped. */
function filesUnder(root: string): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) found.push(...filesUnder(path));
    else if (stat.isFile()) found.push({ path, text: readFileSync(path, "latin1") });
  }
  return found;
}

/** Every run of eight characters of a value. */
const runsOf = (value: string): string[] => Array.from({ length: Math.max(1, value.length - 7) }, (_, at) => value.slice(at, at + 8));

async function until(check: () => boolean, ms = 10_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

const ROOM_ANSWER = { status: 200, body: { kind: "room", room: ROOM, owner: "Dimitri", already: false } };
const STANDING_BY =
  `collie: standing by on "Landing page" at ${ROOM.address}, as Dimitri\n` +
  "standing by costs one object awake, about four dollars a month at Cloudflare's list price, inside the plan's included duration for the first\n" +
  `agents are added in the tray at ${ROOM.address}\n` +
  "`collie log` follows what it does\n";

describe("collie without a collie (journey 5 step 4)", () => {
  it("says so in one sentence naming collie setup for every verb that needs one, exit 1, asking nothing of anyone and reading no pass", { timeout: 60_000 }, async () => {
    const w = await world({}, { collie: false });
    const sentence = `collie: no collie is set up in this kennel (${w.kennel}); \`collie setup\` deploys one beside the station\n`;
    for (const args of [[], ["log"], ["off"], ["on"], ["new"], ["pass"], ["new", "--canvas", "Pricing"], ["new", "--pass"], ["--json"], ["log", "--follow"]]) {
      const run = await w.collie(args, { stdin: `${PASS}\n` });
      expect(run, args.join(" ")).toEqual({ code: 1, stdout: "", stderr: sentence });
    }
    expect(w.state.requests).toEqual([]);
  });

  it("refuses what this build does not do yet, before the config is read, and names the verb that does", { timeout: 60_000 }, async () => {
    const w = await world();
    const agent = await w.collie(["pass", "--agent", "Percy"], { stdin: `${PASS}\n` });
    expect(agent).toMatchObject({ code: 1, stdout: "" });
    expect(agent.stderr).toMatch(/^collie: collie pass --agent is not in this build yet;/);
    // `setup`, `deploy`, and `rm` are collie phase 2's, walked in `collie-setup.test.ts`; a verb that is none is still a mistake.
    const unknown = await w.collie(["herd"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stdout).toBe("");
    expect(unknown.stderr).toMatch(/^collie: unknown command: herd\n\ncollie — /);
    // The rig (collie phase 1's Worker half) stands beside a local home, and this kennel names a station.
    expect(await w.collie(["local"])).toEqual({ code: 1, stdout: "", stderr: `collie: the rig stands beside this kennel's local home, and ${w.kennel} has none; \`sheep home local\` starts one\n` });
    expect(w.state.requests).toEqual([]);
  });

  it("prints its version, its usage, and its guide with no collie and no kennel", { timeout: 30_000 }, async () => {
    const w = await world({}, { collie: false });
    expect(await w.collie(["--version"])).toEqual({ code: 0, stdout: "collie 0.0.0-checkout; the brain is isocan 18ca496a\n", stderr: "" });
    const help = await w.collie(["--help"]);
    expect(help).toMatchObject({ code: 0, stderr: "" });
    for (const verb of ["collie log", "collie off", "collie on", "collie new --pass", "collie pass", "collie --agent-help"]) expect(help.stdout).toContain(verb);
    expect(await w.collie(["--agent-help"])).toEqual({ code: 0, stdout: readFileSync(guideFile, "utf8"), stderr: "" });
  });
});

describe("the pass (journey 1 step 4, journey 5 step 3)", () => {
  it("takes the address as one line of stdin, posts it in one body with the bearer, and says where it stands by, as whom, and what it costs", { timeout: 60_000 }, async () => {
    const w = await world({ passes: { [PASS]: ROOM_ANSWER } });
    expect(await w.collie(["new", "--pass"], { stdin: `${PASS}\n` })).toEqual({ code: 0, stdout: STANDING_BY, stderr: "" });
    expect(w.state.requests).toEqual([{ method: "POST", path: "/passes", auth: `Bearer ${TOKEN}`, body: JSON.stringify({ address: PASS }) }]);
    w.state.passes[PASS] = { status: 200, body: { kind: "room", room: ROOM, owner: "Dimitri", already: true } };
    expect(await w.collie(["pass", "--pass"], { stdin: `${PASS}\n` })).toEqual({ code: 0, stdout: 'collie: already standing by on "Landing page"\n', stderr: "" });
    w.state.passes[PASS] = { status: 200, body: { kind: "agent", agent: "Percy", room: ROOM } };
    expect(await w.collie(["pass", "--pass"], { stdin: `${PASS}\n` })).toEqual({ code: 0, stdout: 'collie: now answers for Percy on "Landing page"\n', stderr: "" });
    for (const { path, text } of filesUnder(w.dir)) expect(text.includes(PASS_TOKEN), `${path} holds the pass`).toBe(false);
  });

  it("relays the collie's refusal as its own sentence, exit 1: a spent pass, an expired one, and the station's floor", { timeout: 60_000 }, async () => {
    const spent = "this pass was already used; passes are single-use, and `isocan pass` mints another";
    const floor = "the station's build a2b17e7 (2026-09-10T08:00:00Z) is older than the collie speaks to; `sheep home deploy` from this package updates it";
    const w = await world({ passes: { [PASS]: { status: 410, body: { error: spent } }, [`${PASS}x`]: { status: 502, body: { error: floor } } } });
    expect(await w.collie(["new", "--pass"], { stdin: `${PASS}\n` })).toEqual({ code: 1, stdout: "", stderr: `collie: ${spent}\n` });
    expect(await w.collie(["new", "--pass"], { stdin: `${PASS}x\n` })).toEqual({ code: 1, stdout: "", stderr: `collie: ${floor}\n` });
    expect(await w.collie(["pass", "--pass"], { stdin: "https://isocan.io/pass/nope\n" })).toEqual({ code: 1, stdout: "", stderr: "collie: that pass is not one isocan minted; `isocan pass` prints a new one\n" });
    expect(await w.collie(["new", "--pass"], { stdin: "" })).toEqual({ code: 1, stdout: "", stderr: "collie: no pass on stdin; give its address as one line of stdin, or run this at a terminal to type it hidden\n" });
    // Three posts for three lines; the empty stdin asked nothing.
    expect(w.state.requests.map((request) => request.path)).toEqual(["/passes", "/passes", "/passes"]);
  });

  it("says a wrong token and a collie that does not answer in one line each, exit 1", { timeout: 60_000 }, async () => {
    const w = await world();
    const config = JSON.parse(readFileSync(join(w.kennel, "config"), "utf8"));
    await writeFile(join(w.kennel, "config"), JSON.stringify({ ...config, collie: { ...config.collie, token: "not-the-token" } }));
    expect(await w.collie([])).toEqual({ code: 1, stdout: "", stderr: `collie: the collie at ${w.url} refused this kennel's token (GET /report: 401 unauthorized)\n` });
    await writeFile(join(w.kennel, "config"), JSON.stringify({ ...config, collie: { ...config.collie, address: "http://127.0.0.1:9" } }));
    const down = await w.collie(["off"]);
    expect(down).toMatchObject({ code: 1, stdout: "" });
    expect(down.stderr).toMatch(/^collie: the collie at http:\/\/127\.0\.0\.1:9 does not answer \(.+\)\n$/);
  });
});

/**
 * A fake isocan package, installed the way both real shapes are: a manifest named `isocan` at the root whose `.` export is
 * the module, and a bin below it (`packages/cli/bin/isocan.js`, under a manifest of another name, as a linked checkout has
 * it) reached through a symlink on PATH. The module is isocan's API as the mint uses it — `connect()` with `ctx.actor`,
 * `ctx.client.base`, `ctx.client.mintPass`, and `ctx.homeOf`; `resolveCanvas` and `resolveCanvasRef` — scripted by
 * `FAKE_ISOCAN` in the environment, and every call but the token written to `calls.jsonl` beside it.
 */
interface FakeIsocanScript {
  identity: { id: string; name: string } | null;
  base: string;
  /** What `ctx.homeOf` answers for every canvas; null when the daemon is the canvas's home. */
  homeOf: string | null;
  /** The directory's canvas; null when the directory is bound to none. */
  bound: { id: string; title: string } | null;
  canvases: { id: string; title: string }[];
  token: string;
}

async function fakeIsocan(w: World, options: { old?: boolean } = {}): Promise<{ bin: string; calls: () => Json[]; env: (script: Partial<FakeIsocanScript>) => Record<string, string> }> {
  const root = join(w.dir, "isocan-install");
  const calls = join(root, "calls.jsonl");
  await mkdir(join(root, "packages", "cli", "bin"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "isocan", type: "module", bin: { isocan: "packages/cli/bin/isocan.js" }, exports: { ".": { types: "./types/index.d.ts", default: "./index.mjs" }, "./rc": "./rc.mjs" } }));
  await writeFile(join(root, "packages", "cli", "package.json"), JSON.stringify({ name: "@isocan/cli", type: "module" }));
  await writeFile(join(root, "packages", "cli", "bin", "isocan.js"), "#!/usr/bin/env node\nconsole.log('isocan');\n", { mode: 0o755 });
  await writeFile(
    join(root, "index.mjs"),
    `import { appendFileSync } from "node:fs";
const s = JSON.parse(process.env.FAKE_ISOCAN ?? "{}");
const call = (entry) => appendFileSync(${JSON.stringify(calls)}, JSON.stringify(entry) + "\\n");
export async function connect() {
  call({ call: "connect" });
  if (s.identity === null) throw new Error('no identity configured — run \`isocan identity --name "Your Name" --session\` first');
  return { ctx: { actor: s.identity, client: { base: s.base, async mintPass(canvasId, actorId) { call({ call: "mintPass", canvasId, actorId }); return { pass: { id: "pass_1" }, token: s.token }; } }, async homeOf(canvasId) { call({ call: "homeOf", canvasId }); return s.homeOf; } } };
}
export async function resolveCanvas() {
  call({ call: "resolveCanvas" });
  if (s.bound === null) throw new Error("multiple canvases — pass --canvas <id|title>, or bind this directory to one with \`isocan use <canvas>\`");
  return s.bound;
}
${options.old === true ? "" : `// isocan 8729b9e3's address helpers, as core writes them; the fake is the isocan on PATH, so it carries its own.
export function canvasUrlWithPass(origin, canvasId, token) {
  call({ call: "canvasUrlWithPass", canvasId });
  return \`\${origin.replace(/\\/+$/, "")}/p/\${encodeURIComponent(canvasId)}#\${token}\`;
}
export function isLoopbackBase(base) {
  return /^(\\[::1\\]|::1|localhost|127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})$/i.test(new URL(base).hostname);
}
`}export async function resolveCanvasRef(_client, ref) {
  call({ call: "resolveCanvasRef", ref });
  const found = s.canvases.find((canvas) => canvas.id === ref || canvas.title.startsWith(ref));
  if (!found) throw new Error(\`no canvas matches "\${ref}"\`);
  return found;
}
`,
  );
  const bin = join(w.dir, "bin");
  await mkdir(bin);
  await symlink(join(root, "packages", "cli", "bin", "isocan.js"), join(bin, "isocan"));
  const base: FakeIsocanScript = { identity: DIMITRI, base: "http://127.0.0.1:4441", homeOf: "https://isocan.io", bound: { id: ROOM.canvasId, title: ROOM.title }, canvases: [{ id: ROOM.canvasId, title: ROOM.title }, { id: ROOM2.canvasId, title: ROOM2.title }], token: PASS_TOKEN };
  return {
    bin,
    calls: () => (existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Json) : []),
    env: (script) => ({ PATH: `${bin}:/usr/bin:/bin`, FAKE_ISOCAN: JSON.stringify({ ...base, ...script }) }),
  };
}

const DIMITRI = { id: "usr_dimitri", name: "Dimitri" };
const MINTED = `${ROOM.address}#${PASS_TOKEN}`;
const MINTED2 = `${ROOM2.address}#${PASS_TOKEN}`;

describe("the mint through the isocan on PATH (journey 1 step 4, journey 5 step 2)", () => {
  it("collie new mints a pass as this machine's identity for the directory's canvas and hands it over; collie pass --canvas for another", { timeout: 60_000 }, async () => {
    const w = await world({ passes: { [MINTED]: ROOM_ANSWER, [MINTED2]: { status: 200, body: { kind: "room", room: ROOM2, owner: "Dimitri", already: false } } } });
    const isocan = await fakeIsocan(w);
    const run = await w.collie(["new"], { env: isocan.env({}) });
    expect(run).toEqual({ code: 0, stdout: STANDING_BY, stderr: "" });
    expect(isocan.calls()).toEqual([{ call: "connect" }, { call: "resolveCanvas" }, { call: "homeOf", canvasId: ROOM.canvasId }, { call: "mintPass", canvasId: ROOM.canvasId, actorId: DIMITRI.id }, { call: "canvasUrlWithPass", canvasId: ROOM.canvasId }]);
    // The address composed by isocan's own `canvasUrlWithPass`, as its `pass` verb composes it: the canvas's home, its path, the token as the fragment.
    expect(w.state.requests).toEqual([{ method: "POST", path: "/passes", auth: `Bearer ${TOKEN}`, body: JSON.stringify({ address: MINTED }) }]);

    const second = await w.collie(["pass", "--canvas", "Pri"], { env: isocan.env({}) });
    expect(second.code, second.stderr).toBe(0);
    expect(second.stdout.split("\n")[0]).toBe(`collie: standing by on "Pricing" at ${ROOM2.address}, as Dimitri`);
    expect(isocan.calls().slice(5)).toEqual([{ call: "connect" }, { call: "resolveCanvasRef", ref: "Pri" }, { call: "homeOf", canvasId: ROOM2.canvasId }, { call: "mintPass", canvasId: ROOM2.canvasId, actorId: DIMITRI.id }, { call: "canvasUrlWithPass", canvasId: ROOM2.canvasId }]);
    expect(w.state.requests.at(-1)!.body).toBe(JSON.stringify({ address: MINTED2 }));
    for (const { path, text } of filesUnder(w.dir)) expect(text.includes(PASS_TOKEN), `${path} holds the pass`).toBe(false);
  });

  it("while the collie holds the minted pass, no process carries it in its arguments, and nothing on the screen or in a file does after", { timeout: 60_000 }, async () => {
    const w = await world({ passes: { [MINTED]: ROOM_ANSWER }, passHoldMs: 2_000 });
    const isocan = await fakeIsocan(w);
    const running = w.collie(["new"], { env: isocan.env({}) });
    expect(await until(() => w.state.requests.length === 1 && isocan.calls().some((call) => call.call === "mintPass"), 20_000)).toBe(true);
    const processes = spawnSync("ps", ["-axww", "-o", "pid=,args="], { encoding: "utf8" }).stdout.split("\n");
    // Ours by this world's own path to the command; the pass is looked for in every process's arguments.
    const ours = processes.filter((line) => line.includes(w.bin));
    expect(ours.length, processes.join("\n")).toBeGreaterThan(0);
    for (const line of ours) expect(line).toMatch(/ new$/);
    for (const line of processes) expect(line.includes(PASS_TOKEN), `a process carries the pass in its arguments: ${line}`).toBe(false);
    const run = await running;
    expect(run).toEqual({ code: 0, stdout: STANDING_BY, stderr: "" });
    for (const { path, text } of filesUnder(w.dir)) expect(text.includes(PASS_TOKEN), `${path} holds the pass`).toBe(false);
  });

  it("refuses before any pass is minted: no isocan on PATH, no identity, no canvas bound, and a canvas on this machine's own daemon; the rig reaches that one", { timeout: 60_000 }, async () => {
    const w = await world({ passes: { [MINTED]: ROOM_ANSWER, [`http://127.0.0.1:4441/p/${ROOM.canvasId}#${PASS_TOKEN}`]: ROOM_ANSWER } });
    const isocan = await fakeIsocan(w);

    const missing = await w.collie(["new"], { env: { PATH: "/usr/bin:/bin" } });
    expect(missing).toEqual({ code: 1, stdout: "", stderr: "collie: no `isocan` on this machine's PATH, and the collie mints through the isocan you set up here; `isocan setup` (npx github:dglazkov/isocan#release setup) installs it and names you\n" });

    const nobody = await w.collie(["new"], { env: isocan.env({ identity: null }) });
    expect(nobody).toEqual({ code: 1, stdout: "", stderr: 'collie: no identity configured — run `isocan identity --name "Your Name" --session` first\n' });

    const unbound = await w.collie(["pass"], { env: isocan.env({ bound: null }) });
    expect(unbound).toEqual({ code: 1, stdout: "", stderr: "collie: multiple canvases — pass --canvas <id|title>, or bind this directory to one with `isocan use <canvas>`\n" });

    const loopback = `collie: the canvas "Landing page" lives at http://127.0.0.1:4441, this machine's own isocan daemon, which the collie at ${w.url} cannot reach; no pass was minted — move the canvas to a home with an address, or use the rig\n`;
    expect(await w.collie(["new"], { env: isocan.env({ homeOf: null }) })).toEqual({ code: 1, stdout: "", stderr: loopback });
    const localhost = await w.collie(["new"], { env: isocan.env({ homeOf: "http://localhost:4441" }) });
    expect(localhost).toMatchObject({ code: 1, stdout: "" });
    expect(localhost.stderr).toContain('the canvas "Landing page" lives at http://localhost:4441, this machine\'s own isocan daemon');

    expect(isocan.calls().filter((call) => call.call === "mintPass")).toEqual([]);
    expect(w.state.requests).toEqual([]);

    // The rig (`local: true` in the collie block) is this machine's own, and reaches the loopback daemon.
    const config = JSON.parse(readFileSync(join(w.kennel, "config"), "utf8"));
    await writeFile(join(w.kennel, "config"), JSON.stringify({ ...config, collie: { address: w.url, token: TOKEN, local: true } }));
    expect(await w.collie(["new"], { env: isocan.env({ homeOf: null }) })).toEqual({ code: 0, stdout: STANDING_BY, stderr: "" });
    expect(isocan.calls().filter((call) => call.call === "mintPass")).toEqual([{ call: "mintPass", canvasId: ROOM.canvasId, actorId: DIMITRI.id }]);
    expect(w.state.requests.map((request) => request.body)).toEqual([JSON.stringify({ address: `http://127.0.0.1:4441/p/${ROOM.canvasId}#${PASS_TOKEN}` })]);
  });

  it("refuses an isocan on PATH older than the address helpers, naming isocan upgrade, before it is asked anything", { timeout: 60_000 }, async () => {
    const w = await world({ passes: { [MINTED]: ROOM_ANSWER } });
    const isocan = await fakeIsocan(w, { old: true });
    const old = await w.collie(["new"], { env: isocan.env({}) });
    expect(old).toEqual({ code: 1, stdout: "", stderr: `collie: the \`isocan\` on PATH (${join(w.dir, "isocan-install")}) is older than the collie mints with: it exports no canvasUrlWithPass, isLoopbackBase; \`isocan upgrade\` updates it\n` });
    expect(isocan.calls()).toEqual([]);
    expect(w.state.requests).toEqual([]);
  });

  it("takes --canvas with new and pass alone, and not with a pass already minted", { timeout: 60_000 }, async () => {
    const w = await world();
    const isocan = await fakeIsocan(w);
    const withPass = await w.collie(["new", "--pass", "--canvas", "Pricing"], { stdin: `${PASS}\n`, env: isocan.env({}) });
    expect(withPass.code).toBe(2);
    expect(withPass.stderr).toMatch(/^collie: --canvas names the canvas collie mints a pass for; a pass taken with --pass already names its canvas\n\ncollie — /);
    const onLog = await w.collie(["log", "--canvas", "Pricing"], { env: isocan.env({}) });
    expect(onLog.code).toBe(2);
    expect(onLog.stderr).toMatch(/^collie: --canvas goes with collie new and collie pass, not collie log\n/);
    expect(isocan.calls()).toEqual([]);
    expect(w.state.requests).toEqual([]);
  });
});

/** Which `script` this machine has, as `stile-tty.test.ts` asks. */
function scriptFlavour(): "bsd" | "util-linux" | undefined {
  const which = spawnSync("sh", ["-c", "command -v script"], { encoding: "utf8" });
  if (which.status !== 0 || which.stdout.trim() === "") return undefined;
  const version = spawnSync("script", ["--version"], { encoding: "utf8" });
  return version.status === 0 && /util-linux/.test(`${version.stdout}${version.stderr}`) ? "util-linux" : "bsd";
}
const flavour = scriptFlavour();
if (flavour === undefined) console.log("collie: the hidden prompt's case is skipped: no `script` on this machine, so no pseudo-terminal");
const quote = (arg: string) => `'${arg.replace(/'/g, `'\\''`)}'`;

describe.skipIf(flavour === undefined)("the pass at a real terminal (journey 1 step 4)", () => {
  it("is typed at a hidden prompt: dots on the terminal, in no process's arguments while the collie holds it, and in no file after", { timeout: 60_000 }, async () => {
    const w = await world({ passes: { [PASS]: ROOM_ANSWER }, passHoldMs: 2_000 });
    // The keys and what the pty gave back live outside the world, so the world's files are the command's alone.
    const side = realpathSync(await mkdtemp(join(tmpdir(), "sheep-collie-pty-")));
    cleanups.push(() => rm(side, { recursive: true, force: true }));
    await symlink(process.execPath, join(side, "node"));
    const command = [process.execPath, w.bin, "new", "--pass"];
    const scriptArgs = flavour === "util-linux" ? ["-q", "-e", "-c", command.map(quote).join(" "), "/dev/null"] : ["-q", "/dev/null", ...command];
    const fifo = join(side, "keys");
    const out = join(side, "pty.out");
    spawnSync("mkfifo", [fifo]);
    const env = { ...w.env(), PATH: `${side}:/usr/bin:/bin`, TERM: "xterm-256color" };
    const child = spawn("sh", ["-c", `cat < ${quote(fifo)} | script ${scriptArgs.map(quote).join(" ")} > ${quote(out)} 2>&1`], { cwd: w.dir, env, stdio: "ignore", detached: true });
    const keys = createWriteStream(fifo);
    // A case that fails before Enter leaves the pipeline waiting on its keys: the whole group goes at the end, whatever happened.
    cleanups.push(async () => {
      keys.destroy();
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // already gone
      }
    });
    const exited = new Promise<number>((resolve) => child.once("close", (code) => resolve(code ?? -1)));
    const read = () => (existsSync(out) ? readFileSync(out, "utf8") : "");
    expect(await until(() => read().includes("the pass isocan printed (hidden): ")), read()).toBe(true);

    // Every process's arguments, as `ps` gives them: the command is there, waiting on the prompt, with none of the pass.
    const processes = () => spawnSync("ps", ["-axww", "-o", "pid=,args="], { encoding: "utf8" }).stdout.split("\n");
    // Ours by this world's own path to the command, so a `collie new` from another file running at once is never read as this one.
    const ours = processes().filter((line) => line.includes(w.bin) && !line.includes("script"));
    expect(ours.length, processes().join("\n")).toBeGreaterThanOrEqual(1);
    for (const line of ours) expect(line).toMatch(/ new --pass$/);

    for (const key of PASS) {
      keys.write(key);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(await until(() => read().includes(`${"•".repeat(16)} ${PASS.length}`)), read()).toBe(true);
    keys.write("\r");
    // The fake holds the post for two seconds: read every process's arguments while the command is inside it.
    expect(await until(() => w.state.requests.length === 1)).toBe(true);
    const during = processes();
    expect(during.some((line) => line.includes(w.bin) && !line.includes("script")), "the command is still running").toBe(true);
    for (const line of during) expect(line.includes(PASS_TOKEN), `a process carries the pass in its arguments: ${line}`).toBe(false);

    keys.end();
    expect(await exited).toBe(0);
    const screen = read();
    expect(screen).toContain(`collie: standing by on "Landing page" at ${ROOM.address}, as Dimitri`);
    for (const run of runsOf(PASS_TOKEN)) expect(screen.includes(run), `the terminal shows ${run} of the pass`).toBe(false);
    expect(w.state.requests).toEqual([{ method: "POST", path: "/passes", auth: `Bearer ${TOKEN}`, body: JSON.stringify({ address: PASS }) }]);
    for (const { path, text } of filesUnder(w.dir)) expect(text.includes(PASS_TOKEN), `${path} holds the pass`).toBe(false);
  });
});

const PERCY = { name: "Percy", actorId: "act_percy", sheep: SHEEP_ID, lane: "idle", pasture: "isocan-percy", came: "born here", turnsLastHour: 3 };
const SHAUN = { name: "Shaun", actorId: "act_shaun", sheep: null, lane: null, pasture: null, came: "handed over", turnsLastHour: 0 };

describe("the report (journey 1 step 7)", () => {
  it("says since when in local time, the ceiling, each room and whose word it takes, and each agent's sheep, lane, how it came, and its turns against the ceiling", { timeout: 60_000 }, async () => {
    const w = await world({ rooms: [{ ...ROOM, owner: "Dimitri", agents: [PERCY, SHAUN] }, { ...ROOM2, owner: "Kate", agents: [] }] });
    const run = await w.collie([]);
    expect(run).toMatchObject({ code: 0, stderr: "" });
    // 03:42 UTC is 09:12 in Kolkata; how long ago is the clock's, so it is read from the line and checked for its shape.
    const ago = /^collie: standing by since 2026-09-14 09:12 \(([^)]+)\) on 2 canvases\n/.exec(run.stdout)?.[1];
    expect(ago, run.stdout).toMatch(/^(\d+d \d+h|\d+h \d+m|\d+m|under a minute)$/);
    expect(run.stdout).toBe(
      `collie: standing by since 2026-09-14 09:12 (${ago}) on 2 canvases\n` +
        "an agent here answers at most 20 turns an hour, and 5 turns in a row with no person's word between\n" +
        "\n" +
        `"Landing page"  ${ROOM.address}  taking Dimitri's word\n` +
        `  Percy  sheep ${SHEEP_ID}  idle  born here    3 of 20 turns in the last hour\n` +
        `  Shaun  ${"no sheep yet".padEnd(`sheep ${SHEEP_ID}`.length)}  ${"".padEnd("idle".length)}  handed over  0 of 20 turns in the last hour\n` +
        "\n" +
        `"Pricing"  ${ROOM2.address}  taking Kate's word\n` +
        `  no agents yet; they are added in the tray at ${ROOM2.address}\n`,
    );
    const json = await w.collie(["--json"]);
    expect(json).toMatchObject({ code: 0, stderr: "" });
    expect(JSON.parse(json.stdout)).toEqual({ on: true, since: w.state.since, limits: w.state.limits, rooms: w.state.rooms });
    expect(w.state.requests.map((request) => `${request.method} ${request.path} ${request.auth}`)).toEqual([`GET /report Bearer ${TOKEN}`, `GET /report Bearer ${TOKEN}`]);
  });

  it("with no rooms says so and names collie new; off says so and names collie on", { timeout: 60_000 }, async () => {
    const w = await world({ since: null });
    expect(await w.collie([])).toEqual({ code: 0, stderr: "", stdout: "collie: standing by on no canvas\nno canvas has been handed to it; `collie new` on a bound canvas gives it one\n" });
    w.state.on = false;
    w.state.rooms = [{ ...ROOM, owner: "Dimitri", agents: [] }];
    const off = await w.collie([]);
    expect(off.stdout.split("\n")[0]).toBe("collie: off; `collie on` resumes standing by on 1 canvas");
  });
});

const LINES = [
  { seq: 1, at: "2026-09-14T03:42:11Z", canvasId: ROOM.canvasId, title: ROOM.title, line: "Dimitri asked from the canvas to add Percy — enrolling here" },
  { seq: 2, at: "2026-09-14T03:44:02Z", canvasId: ROOM.canvasId, title: ROOM.title, line: "Percy · summons from Dimitri, 1 entry — starting a session" },
  { seq: 3, at: "2026-09-14T03:44:03Z", canvasId: ROOM.canvasId, title: ROOM.title, line: "birthing a sheep for Percy" },
  { seq: 4, at: "2026-09-14T03:45:59Z", canvasId: ROOM.canvasId, title: ROOM.title, line: "turn ended — end_turn" },
];

describe("the log (journey 1 steps 5 and 6)", () => {
  it("prints one line per row, the local clock first, then the rc's line; --last, --since, and --json ask and print what they say", { timeout: 60_000 }, async () => {
    const w = await world({ lines: LINES });
    expect(await w.collie(["log"])).toEqual({
      code: 0,
      stderr: "",
      stdout: "09:12:11  Dimitri asked from the canvas to add Percy — enrolling here\n09:14:02  Percy · summons from Dimitri, 1 entry — starting a session\n09:14:03  birthing a sheep for Percy\n09:15:59  turn ended — end_turn\n",
    });
    expect(await w.collie(["log", "--last", "1"])).toEqual({ code: 0, stderr: "", stdout: "09:15:59  turn ended — end_turn\n" });
    expect(await w.collie(["log", "--since=2"])).toEqual({ code: 0, stderr: "", stdout: "09:14:03  birthing a sheep for Percy\n09:15:59  turn ended — end_turn\n" });
    const json = await w.collie(["log", "--json", "--last", "2"]);
    expect(json).toMatchObject({ code: 0, stderr: "" });
    expect(json.stdout.trim().split("\n").map((line) => JSON.parse(line))).toEqual(LINES.slice(2));
    expect(w.state.requests.map((request) => request.path)).toEqual(["/log", "/log?last=1", "/log?since=2", "/log?last=2"]);
    for (const bad of [["--last", "0"], ["--last", "two"], ["--since", "-1"]]) {
      const run = await w.collie(["log", ...bad]);
      expect(run.code, bad.join(" ")).toBe(2);
      expect(run.stderr).toMatch(/^collie: --(last|since) needs /);
    }
    const empty = await world();
    expect(await empty.collie(["log"])).toEqual({ code: 0, stdout: "", stderr: "collie: nothing in the log yet\n" });
  });

  it("--follow asks for the rows after the last every two seconds, prints each as it lands, and ends at Ctrl-C with 0", { timeout: 60_000 }, async () => {
    const w = await world({ lines: LINES.slice(0, 2) });
    const child = spawn(process.execPath, [w.bin, "log", "--follow"], { env: w.env(), cwd: w.dir, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    const exited = new Promise<number | null>((resolve) => child.once("close", resolve));
    expect(await until(() => stdout.split("\n").length === 3), stdout).toBe(true);
    const asked = Date.now();
    w.state.lines.push(LINES[2]!);
    expect(await until(() => stdout.includes("birthing a sheep for Percy"))).toBe(true);
    w.state.lines.push(LINES[3]!);
    expect(await until(() => stdout.includes("turn ended"))).toBe(true);
    expect(Date.now() - asked).toBeGreaterThan(1_500);
    // The cursor moved past the last row printed: the next ask is for the rows after it.
    expect(await until(() => w.state.requests.some((request) => request.path === "/log?since=4"))).toBe(true);
    child.kill("SIGINT");
    expect(await exited).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("09:12:11  Dimitri asked from the canvas to add Percy — enrolling here\n09:14:02  Percy · summons from Dimitri, 1 entry — starting a session\n09:14:03  birthing a sheep for Percy\n09:15:59  turn ended — end_turn\n");
    const paths = w.state.requests.map((request) => request.path);
    // The first page as asked, then only the rows after the last one printed, the cursor moving with each page.
    expect(paths[0]).toBe("/log");
    for (const path of paths.slice(1)) expect(path).toMatch(/^\/log\?since=[234]$/);
    expect(paths).toContain("/log?since=2");
    expect(paths).toContain("/log?since=3");
    expect(paths.at(-1)).toBe("/log?since=4");
    // Every two seconds: the requests after the first are spaced by the follow's interval, not a busy loop.
    expect(paths.length).toBeLessThan(10);
  });
});

describe("the switch (journey 3 steps 1 and 2)", () => {
  it("off names each canvas reading nobody listening and on names what it stands by on, one round trip each", { timeout: 60_000 }, async () => {
    const w = await world({ rooms: [{ ...ROOM, owner: "Dimitri", agents: [PERCY] }] });
    expect(await w.collie(["off"])).toEqual({ code: 0, stderr: "", stdout: 'collie: off — holds released; "Landing page" reads nobody listening; collie on resumes\n' });
    expect(w.state.on).toBe(false);
    expect(await w.collie(["on"])).toEqual({ code: 0, stderr: "", stdout: 'collie: standing by on "Landing page"\n' });
    expect(w.state.on).toBe(true);
    w.state.rooms.push({ ...ROOM2, owner: "Kate", agents: [] });
    expect((await w.collie(["off"])).stdout).toBe('collie: off — holds released; "Landing page" and "Pricing" read nobody listening; collie on resumes\n');
    expect((await w.collie(["on"])).stdout).toBe('collie: standing by on "Landing page" and "Pricing"\n');
    expect(w.state.requests.map((request) => `${request.method} ${request.path}`)).toEqual(["POST /off", "POST /on", "POST /off", "POST /on"]);
    const refused = await world({ refuse: { "POST /off": { status: 503, body: { error: "the collie could not release its hold on \"Landing page\"; isocan.io did not answer" } } } });
    expect(await refused.collie(["off"])).toEqual({ code: 1, stdout: "", stderr: 'collie: the collie could not release its hold on "Landing page"; isocan.io did not answer\n' });
  });
});

describe("the lines at the end (shear's, for the collie)", () => {
  const stamped = { SHEEP_TEST_CLI_BUILD: `${CLI.commit} ${CLI.builtAt}` };

  it("says the skew line once for a collie older than the command, naming collie deploy, and the other way naming the install", { timeout: 60_000 }, async () => {
    const older = await world({ build: OLDER });
    const line = `collie: the collie's build ${OLDER.commit} (${OLDER.builtAt}) is older than this command's ${CLI.commit} (${CLI.builtAt}); \`collie deploy\` from this package updates it\n`;
    expect(await older.collie(["log"], { env: stamped })).toEqual({ code: 0, stdout: "", stderr: `collie: nothing in the log yet\n${line}` });
    expect(await older.collie(["log"], { env: stamped })).toEqual({ code: 0, stdout: "", stderr: "collie: nothing in the log yet\n" });
    expect((await older.collie(["off"], { env: stamped })).stderr).toBe("");

    const newer = await world({ build: NEWER });
    // `sheep` said its own skew line for the same pair of commits: the collie's is its own, and is said anyway.
    await writeFile(join(newer.dir, ".sheep", "tip.json"), JSON.stringify({ skew: `${NEWER.commit}:${CLI.commit}` }));
    const first = await newer.collie(["on"], { env: stamped });
    expect(first).toMatchObject({ code: 0, stderr: `collie: this command's build ${CLI.commit} (${CLI.builtAt}) is older than the collie's ${NEWER.commit} (${NEWER.builtAt}); \`npm install -g github:dglazkov/sheep#release\` updates it\n` });
    expect((await newer.collie(["on"], { env: stamped })).stderr).toBe("");
    expect(JSON.parse(readFileSync(join(newer.dir, ".sheep", "tip.json"), "utf8"))).toEqual({ skew: `${NEWER.commit}:${CLI.commit}`, collieSkew: `${NEWER.commit}:${CLI.commit}` });

    // Nothing from a command with no stamp, a collie that sends no header, one of the command's own commit, or under CI.
    for (const [state, env] of [[{ build: OLDER }, {}], [{ build: null }, stamped], [{ build: { commit: CLI.commit, builtAt: "2026-09-14T12:30:00Z" } }, stamped], [{ build: OLDER }, { ...stamped, CI: "1" }]] as const) {
      const quiet = await world(state);
      expect((await quiet.collie(["on"], { env })).stderr, JSON.stringify(state)).toBe("");
    }
  });

  it("says the notice of a newer build once, in the collie's voice, and not when sheep already said it for that tip", { timeout: 60_000 }, async () => {
    const w = await world();
    const now = new Date().toISOString();
    const tip = { commit: NEWER.commit, builtAt: NEWER.builtAt, at: now };
    const said = join(w.dir, ".sheep", "tip.json");
    // A tip fetched a moment ago and asked for a moment ago: no child is started, and the notice is the kept tip's.
    await writeFile(said, JSON.stringify({ tip, asked: now }));
    const env = { ...stamped, SHEEP_TIP: "http://127.0.0.1:9/package.json" };
    const notice = `collie: a newer build ${NEWER.commit} (${NEWER.builtAt}) is out; this command is ${CLI.commit} (${CLI.builtAt}); \`npm install -g github:dglazkov/sheep#release\` updates it\n`;
    expect(await w.collie(["on"], { env })).toMatchObject({ code: 0, stderr: notice });
    expect(await w.collie(["on"], { env })).toMatchObject({ code: 0, stderr: "" });
    expect(JSON.parse(readFileSync(said, "utf8"))).toEqual({ tip, asked: now, noticed: NEWER.commit });
    await writeFile(said, JSON.stringify({ tip, asked: now, noticed: NEWER.commit }));
    expect(await w.collie(["on"], { env })).toMatchObject({ code: 0, stderr: "" });
  });
});
