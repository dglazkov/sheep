/**
 * earmark phase 0: the secret is a row, in workerd against the fake
 * container. Journey 1 steps 1 to 6 in the cell's terms: two sheep minted
 * into one pasture with a `setup.sh`, the pasture's `PROBE` and
 * `NPM_TOKEN`, one sheep with a `PROBE` of its own. The mint is the
 * Directory's rows and nothing else; `GET /sessions` has the names and no
 * value; the earmarked value is in that sheep's setup `run` frames and in
 * no other frame, route answer, transcript entry, export, or log line; the
 * sibling's setup reads the pasture's; the model's `env` prints neither;
 * the end removes the sheep's secrets and leaves the pasture's. Then two
 * names carried through the route, and journey 3 step 4 with the route's
 * other refusals, each before any row. The broker's half is in
 * `broker.test.ts`.
 *
 * The pool binds no container, so the Worker's route refuses a pasture with
 * a repository before any row (mint phase 0); a sheep born into one is
 * minted by the Directory's `create`, as `birth.test.ts` mints, with the
 * test's starter set before the first boot. The route's own mint is proved
 * against a pasture with no repository, where setup runs before the first
 * container command.
 */
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { birthCommand } from "../src/birth.ts";
import type { SessionCell } from "../src/cell.ts";
import { type Directory, mintSecrets, type SessionSummary } from "../src/directory.ts";
import { SETUP_COMMAND, SETUP_PATH } from "../src/env/execution-env.ts";
import { setFauxScript } from "../src/models.ts";
import { PASTURE_GIT_TOKEN } from "../src/pen/broker.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { WORKSPACE_ROOT } from "../src/workspace/files.ts";
import { type FakeContainer, type ScriptFor, serveFakeOn, type TranscriptEntry } from "./fake-container.ts";

const context = BACKGROUND_CONTEXT;
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const bashTool = createBashTool();
const invocation = {
  invocationId: "inv",
  operationId: "op",
  turnId: "turn",
  async getMemo() {
    return undefined;
  },
  async setMemo() {},
};
const REPO = "https://github.com/org/repo";
const SETUP_SCRIPT = "#!/bin/sh\nset -e\npnpm install --frozen-lockfile\n";
/** The values: each a string that looks like nothing else, so a search for one is exact. */
const PASTURE_PROBE = "pasture-probe-2b8e4c1a9f3d4750-the-herds";
const SHEEP_PROBE = "sheep-probe-6d1f3a8c2e9b4071-earmarked-for-one";
const NPM_TOKEN = "npm-token-9e3b7d1f5a2c4068-the-herds-too";
const PASTURE_GIT = "pasture-git-4c7a2e9d1b6f4035-the-brokers";
const A_VALUE = "a-value-1f8d3b6e2a9c4757-first-named";
const B_VALUE = "b-value-7a2c9e4d1f3b4086-second-named";
const PASTURE_B = "pasture-b-5e1a8c3f7d2b4094-laid-under";
const PASTURE_C = "pasture-c-3d9f1b7a5c2e4013-untouched";
const VALUES = [PASTURE_PROBE, SHEEP_PROBE, NPM_TOKEN, PASTURE_GIT, A_VALUE, B_VALUE, PASTURE_B, PASTURE_C];
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function pasture(name: string, meta: { repo?: string; branch?: string } = {}): Promise<void> {
  expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name, ...meta }) })).status).toBe(201);
}

/**
 * Every line written to the console from here to the test's end, the cell's among them: the cells and the Directory
 * run in this isolate, so their `console.info` is this one. The lines still go out; this only reads them.
 */
function logLines(): () => string[] {
  const spies = (["debug", "log", "info", "warn", "error"] as const).map((level) => vi.spyOn(console, level));
  return () => spies.flatMap((spy) => spy.mock.calls.map((args) => args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack ?? ""}` : String(arg))).join(" ")));
}

afterEach(() => {
  vi.restoreAllMocks();
});

interface Stub {
  starter: ContainerStarter;
  fakes: Array<Omit<FakeContainer, "socket">>;
  ensures: number;
}

/** The container's half without a container, as `setup.test.ts` has it: dial the real door on `ensure`, serve the fake on what comes back. */
function stubStarter(sessionId: string, script: ScriptFor): Stub {
  const directory = () => env.DIRECTORY.getByName("home");
  const stub: Stub = {
    fakes: [],
    ensures: 0,
    starter: {
      async ensure(args) {
        stub.ensures++;
        void (async () => {
          await sleep(10);
          const response = await SELF.fetch(`${args.cellUrl}?token=${encodeURIComponent(args.token)}`, { headers: { upgrade: "websocket" } });
          if (response.status !== 101) return;
          const socket = response.webSocket!;
          socket.accept();
          const fake = serveFakeOn(socket, { script });
          stub.fakes.push(fake);
          await directory().containerOpened(sessionId, Date.now());
          void fake.closed.then(() => directory().containerClosed(sessionId, Date.now()));
        })();
        return { started: true };
      },
      async renew() {
        return { running: stub.fakes.length > 0 };
      },
      async destroy() {
        stub.fakes.at(-1)?.stop("destroyed");
      },
    },
  };
  return stub;
}

/** The starter set on a minted sheep's cell before anything is asked of it: the seam, not a boot. */
async function withStarter(id: string, script: ScriptFor): Promise<Stub> {
  const stub = stubStarter(id, script);
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.starter = stub.starter;
  });
  return stub;
}

/** A sheep minted into a pasture with a repository, by the Directory's `create` with its secrets, as `birth.test.ts` mints. */
async function mintedInto(name: string, pastureName: string, script: ScriptFor, secrets?: Record<string, string>): Promise<{ id: string; summary: SessionSummary; stub: Stub }> {
  const summary = await env.DIRECTORY.getByName("home").create(name, pastureName, secrets);
  return { id: summary.id, summary, stub: await withStarter(summary.id, script) };
}

function inCell<T>(id: string, body: (cell: SessionCell) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => body(cell));
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

async function bash(cell: SessionCell, command: string): Promise<string> {
  const runtime = await cell.runtime();
  return text(await bashTool.execute("call", { command }, () => {}, { env: runtime.env }, invocation, context));
}

/** Every object in the cell's own SQLite that is not the platform's, read before anything else is asked (mint phase 0). */
function tablesOf(id: string): Promise<string[]> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) =>
    state.storage.sql
      .exec<{ name: string; type: string }>("SELECT name, type FROM sqlite_master")
      .toArray()
      .filter((row) => !row.name.startsWith("_cf_"))
      .map((row) => `${row.type} ${row.name}`),
  );
}

/** The Directory's `session_secrets` rows for an id, read with a `SELECT` of its own, not through any method under test. */
function secretRows(id: string): Promise<Array<{ name: string; value: string }>> {
  return runInDurableObject(env.DIRECTORY.getByName("home"), (_directory: Directory, state) =>
    state.storage.sql.exec<{ name: string; value: string }>("SELECT name, value FROM session_secrets WHERE session_id = ? ORDER BY name", id).toArray(),
  );
}

/** Every entry of every fake so far, frames and blobs, in order. */
function entries(stub: Stub): TranscriptEntry[] {
  return stub.fakes.flatMap((fake) => fake.transcript);
}

/** The entries that carry `value` anywhere in them. */
function carrying(stub: Stub, value: string): TranscriptEntry[] {
  return entries(stub).filter((entry) => JSON.stringify(entry).includes(value));
}

function runs(stub: Stub): Array<{ command: string; cwd: string; env: Record<string, string> }> {
  return stub.fakes.flatMap((fake) => fake.runs);
}

/** The clone, setup, `pnpm test`, and `env` as the fake plays them. Setup prints nothing of its environment. */
const repoScript: ScriptFor = (request) => {
  const command = request.command.trim();
  if (command === birthCommand(REPO, "main")) {
    return {
      steps: [
        { stderr: "Cloning into '.'...\n" },
        {
          act: (disk) => {
            disk.putFile("package.json", '{"name":"fixture","scripts":{"test":"node test.js"}}\n');
            disk.putFile("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
            disk.putFile(".git/HEAD", "ref: refs/heads/main\n");
          },
        },
      ],
      exit: 0,
    };
  }
  if (command === SETUP_COMMAND) return { steps: [{ stdout: "Lockfile is up to date, resolution step is skipped\n" }], exit: 0 };
  if (command === "pnpm test") return { steps: [{ stdout: "1 passed\n" }], exit: 0 };
  // `env` alone is a text tool and runs in the cell's shell; beside `node` the whole line runs in the container.
  if (command === "node -e 0 && env") return { steps: [{ stdout: `${Object.entries(request.env).map(([key, value]) => `${key}=${value}`).join("\n")}\n` }], exit: 0 };
  return undefined;
};

/** One HTTP prompt, driven to idle. */
async function prompt(id: string, message: string): Promise<void> {
  setFauxScript(() => fauxAssistantMessage("ok"));
  expect((await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: message }) })).status).toBe(200);
  expect((await inCell(id, (cell) => cell.waitForIdle(20_000))).operation).toBeNull();
}

/** The container goes away past its idle period and the next command rents a fresh one. */
async function freshContainer(id: string, stub: Stub): Promise<void> {
  await inCell(id, async (cell) => {
    (await cell.runtime()).lease!.idle();
    stub.fakes.at(-1)!.stop("idle");
    await sleep(50);
    expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
  });
}

describe("earmark phase 0: journey 1 in the cell's terms", () => {
  it("steps 1 to 5: two sheep in one pasture, one with a PROBE of its own; the value is in that sheep's setup run frames alone, the sibling's setup has the pasture's, NPM_TOKEN in both; the end removes the sheep's and leaves the pasture's", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const directory = env.DIRECTORY.getByName("home");
    await pasture("herd", { repo: REPO, branch: "main" });
    const object = env.PASTURE.getByName("herd");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    await object.setSecret("PROBE", PASTURE_PROBE);
    await object.setSecret("NPM_TOKEN", NPM_TOKEN);
    await object.setSecret(PASTURE_GIT_TOKEN, PASTURE_GIT);
    const pastureBefore = { secrets: await object.secrets(), git: await object.secret(PASTURE_GIT_TOKEN), names: await object.secretNames() };
    expect(pastureBefore.secrets).toEqual({ NPM_TOKEN, PROBE: PASTURE_PROBE });

    // Step 1: the mint. The answer is the row with the names; the Directory holds the value; the cell holds no table.
    const earmarked = await mintedInto("earmarked", "herd", repoScript, { PROBE: SHEEP_PROBE });
    const sibling = await mintedInto("sibling", "herd", repoScript);
    expect(earmarked.summary).toEqual({ id: earmarked.id, name: "earmarked", createdAt: expect.any(Number), state: "idle", pasture: "herd", task: null, secrets: ["PROBE"] });
    expect(sibling.summary).toMatchObject({ name: "sibling", pasture: "herd", secrets: [] });
    expect(JSON.stringify(earmarked.summary)).not.toContain(SHEEP_PROBE);
    expect(await tablesOf(earmarked.id)).toEqual([]);
    expect(await tablesOf(sibling.id)).toEqual([]);
    expect(await secretRows(earmarked.id)).toEqual([{ name: "PROBE", value: SHEEP_PROBE }]);
    expect(await secretRows(sibling.id)).toEqual([]);
    expect(await directory.secrets(earmarked.id)).toEqual({ PROBE: SHEEP_PROBE });
    expect(earmarked.stub.ensures + sibling.stub.ensures).toBe(0);

    // Step 2: `GET /sessions` has the names, `[]` for none, and no value anywhere in its body; so do the herd's routes.
    const listed = await (await api("/sessions")).text();
    const rows = JSON.parse(listed) as SessionSummary[];
    expect(rows.find((row) => row.id === earmarked.id)).toMatchObject({ name: "earmarked", pasture: "herd", secrets: ["PROBE"] });
    expect(rows.find((row) => row.id === sibling.id)).toMatchObject({ name: "sibling", pasture: "herd", secrets: [] });
    for (const row of rows) expect(Array.isArray(row.secrets), row.id).toBe(true);
    const herdBodies = [await (await api("/sessions?pasture=herd")).text(), await (await api("/p/herd/")).text()];
    expect((JSON.parse(herdBodies[0]!) as SessionSummary[]).find((row) => row.id === earmarked.id)?.secrets).toEqual(["PROBE"]);
    expect((JSON.parse(herdBodies[1]!) as { herd: SessionSummary[] }).herd.find((row) => row.id === earmarked.id)?.secrets).toEqual(["PROBE"]);
    for (const body of [listed, ...herdBodies]) for (const value of VALUES) expect(body).not.toContain(value);

    // Step 3: the first prompt to each births it, the clone then setup in one container. The earmarked sheep's setup
    // sees its own PROBE, the sibling's the pasture's, both the pasture's NPM_TOKEN; neither sees a GIT_TOKEN.
    await prompt(earmarked.id, "Probe the earmark.");
    await prompt(sibling.id, "Probe the herd.");
    for (const { stub } of [earmarked, sibling]) {
      expect(stub.ensures).toBe(1);
      expect(runs(stub).map((run) => run.command)).toEqual([birthCommand(REPO, "main"), SETUP_COMMAND]);
      const [clone, setup] = runs(stub);
      expect(setup!.env).not.toHaveProperty(PASTURE_GIT_TOKEN);
      for (const name of ["PROBE", "NPM_TOKEN", PASTURE_GIT_TOKEN]) expect(clone!.env, name).not.toHaveProperty(name);
    }
    expect(runs(earmarked.stub)[1]!.env).toMatchObject({ PROBE: SHEEP_PROBE, NPM_TOKEN, PWD: WORKSPACE_ROOT });
    expect(runs(sibling.stub)[1]!.env).toMatchObject({ PROBE: PASTURE_PROBE, NPM_TOKEN, PWD: WORKSPACE_ROOT });

    // Step 4: the model's own commands see no secret of either kind, in either sheep.
    for (const { id, stub } of [earmarked, sibling]) {
      await inCell(id, async (cell) => {
        const printed = await bash(cell, "node -e 0 && env");
        expect(printed).toContain("SHEEP=1");
        for (const value of VALUES) expect(printed).not.toContain(value);
        expect(printed).not.toMatch(/^(PROBE|NPM_TOKEN|GIT_TOKEN)=/m);
      });
      expect(runs(stub).at(-1)!.command).toBe("node -e 0 && env");
    }
    // A fresh container for the earmarked sheep reads its PROBE again, at that setup run.
    await freshContainer(earmarked.id, earmarked.stub);
    expect(earmarked.stub.fakes[1]!.runs.map((run) => run.command)).toEqual([SETUP_COMMAND, "pnpm test"]);
    expect(earmarked.stub.fakes[1]!.runs[0]!.env).toMatchObject({ PROBE: SHEEP_PROBE, NPM_TOKEN });

    // The acceptance: the earmarked value is in the earmarked sheep's setup run frames and in no other entry of either
    // sheep; the pasture's PROBE is in the sibling's setup frame and in nothing of the earmarked sheep's; NPM_TOKEN is
    // in both sheep's setup frames alone; the pasture's GIT_TOKEN is in none.
    const isSetupRun = (entry: TranscriptEntry) => "frame" in entry && entry.from === "cell" && entry.frame.type === "run" && (entry.frame as { command?: string }).command === SETUP_COMMAND;
    const earmarkedCarrying = carrying(earmarked.stub, SHEEP_PROBE);
    expect(earmarkedCarrying.length).toBe(2);
    for (const entry of earmarkedCarrying) expect(isSetupRun(entry)).toBe(true);
    expect(carrying(earmarked.stub, PASTURE_PROBE)).toEqual([]);
    expect(carrying(sibling.stub, SHEEP_PROBE)).toEqual([]);
    const siblingCarrying = carrying(sibling.stub, PASTURE_PROBE);
    expect(siblingCarrying.length).toBe(1);
    expect(isSetupRun(siblingCarrying[0]!)).toBe(true);
    for (const stub of [earmarked.stub, sibling.stub]) {
      const npm = carrying(stub, NPM_TOKEN);
      expect(npm.length).toBeGreaterThan(0);
      for (const entry of npm) expect(isSetupRun(entry)).toBe(true);
      expect(carrying(stub, PASTURE_GIT)).toEqual([]);
      expect(entries(stub).length).toBeGreaterThan(10);
    }

    // Not in any route's answer, transcript entry, or export table, and not in any line the console was given.
    for (const { id } of [earmarked, sibling]) {
      const answers = [await (await api(`/s/${id}/`)).text(), await (await api(`/s/${id}/transcript`)).text(), await (await api("/sessions")).text(), await (await api(`/p/herd/`)).text()];
      for (const answer of answers) for (const value of VALUES) expect(answer).not.toContain(value);
      const dump = (await (await api(`/s/${id}/export`)).json()) as Record<string, unknown[]>;
      expect(dump.entries!.length).toBeGreaterThan(1);
      for (const [table, rowsOf] of Object.entries(dump)) for (const value of VALUES) expect(JSON.stringify(rowsOf), table).not.toContain(value);
    }
    const lines = logs();
    // The capture sees the cells' own lines, so a value logged by either would be here.
    expect(lines.some((line) => line.startsWith(`[cell ${earmarked.id}] birth:`))).toBe(true);
    expect(lines.some((line) => line.startsWith(`[cell ${sibling.id}] birth:`))).toBe(true);
    expect(lines.some((line) => line.startsWith("[pen] setup exit 0"))).toBe(true);
    for (const line of lines) for (const value of VALUES) expect(line).not.toContain(value);

    // Step 5: `sheep rm` on the earmarked sheep. The Directory holds no secret for the id afterwards; the pasture's are as
    // they were, and the sibling's next fresh container reads the pasture's PROBE in setup as before.
    const ended = await api(`/s/${earmarked.id}`, { method: "DELETE" });
    expect(ended.status, await ended.clone().text()).toBe(200);
    expect(await secretRows(earmarked.id)).toEqual([]);
    expect(await directory.secrets(earmarked.id)).toEqual({});
    expect(await object.secrets()).toEqual(pastureBefore.secrets);
    expect(await object.secret(PASTURE_GIT_TOKEN)).toBe(pastureBefore.git);
    expect(await object.secretNames()).toEqual(pastureBefore.names);
    const after = (await (await api("/sessions")).json()) as SessionSummary[];
    expect(after.find((row) => row.id === earmarked.id)).toBeUndefined();
    expect(after.find((row) => row.id === sibling.id)).toMatchObject({ secrets: [] });
    await freshContainer(sibling.id, sibling.stub);
    expect(sibling.stub.fakes[1]!.runs[0]).toMatchObject({ command: SETUP_COMMAND, env: { PROBE: PASTURE_PROBE, NPM_TOKEN } });
    await inCell(sibling.id, async (cell) => (await cell.runtime()).lease!.idle());
  });

  it("step 6 through the route: two names carried and laid over the pasture's by name, the mint the Directory's rows and nothing else, the names in GET /sessions and no value; the end takes both", { timeout: 30_000 }, async () => {
    const logs = logLines();
    // No repository, so the Worker's route mints here; setup runs before the first container command.
    await pasture("pair");
    const object = env.PASTURE.getByName("pair");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    await object.setSecret("B", PASTURE_B);
    await object.setSecret("C", PASTURE_C);

    const response = await api("/sessions", { method: "POST", body: JSON.stringify({ name: "two", pasture: "pair", secrets: { A: A_VALUE, B: B_VALUE } }) });
    expect(response.status).toBe(201);
    const body = await response.text();
    for (const value of VALUES) expect(body).not.toContain(value);
    const summary = JSON.parse(body) as SessionSummary;
    expect(summary).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: "two", createdAt: expect.any(Number), state: "idle", pasture: "pair", task: null, secrets: ["A", "B"] });
    const { id } = summary;
    // The one rule of the mint: the Directory and nothing else. `sqlite_master` is read before anything is asked of the cell.
    expect(await tablesOf(id)).toEqual([]);
    expect(await secretRows(id)).toEqual([
      { name: "A", value: A_VALUE },
      { name: "B", value: B_VALUE },
    ]);
    const listed = await (await api("/sessions")).text();
    expect((JSON.parse(listed) as SessionSummary[]).find((row) => row.id === id)).toEqual(summary);
    for (const value of VALUES) expect(listed).not.toContain(value);

    const stub = await withStarter(id, repoScript);
    await inCell(id, async (cell) => {
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      (await cell.runtime()).lease!.idle();
    });
    expect(runs(stub).map((run) => run.command)).toEqual([SETUP_COMMAND, "pnpm test"]);
    // A and B are the sheep's, B laid over the pasture's; C is the pasture's, used as before.
    expect(runs(stub)[0]!.env).toMatchObject({ A: A_VALUE, B: B_VALUE, C: PASTURE_C });
    for (const name of ["A", "B", "C"]) expect(runs(stub)[1]!.env, name).not.toHaveProperty(name);
    expect(carrying(stub, PASTURE_B)).toEqual([]);
    for (const value of [A_VALUE, B_VALUE, PASTURE_C]) {
      const found = carrying(stub, value);
      expect(found.length, value).toBe(1);
      expect(found[0]).toMatchObject({ from: "cell", frame: { type: "run", command: SETUP_COMMAND } });
    }

    expect((await api(`/s/${id}`, { method: "DELETE" })).status).toBe(200);
    expect(await secretRows(id)).toEqual([]);
    expect(await object.secrets()).toEqual({ B: PASTURE_B, C: PASTURE_C });
    for (const line of logs()) for (const value of VALUES) expect(line).not.toContain(value);
  });
});

describe("earmark phase 0: the mint's refusals, before any row", () => {
  it("journey 3 step 4 and the rest: a bad name, a value that is not a non-empty line, a name but GIT_TOKEN with no pasture, secrets that are not an object; each a 400 and one sentence naming no value, GET /sessions unchanged", async () => {
    await pasture("refusing");
    // `direct`: the Directory is asked too, once for each kind of refusal (workerd reports each throw over RPC on the console).
    const cases: Array<{ body: Record<string, unknown>; sentence: string; value?: string; direct?: true }> = [
      { body: { pasture: "refusing", secrets: { "1BAD": "v1-3f9a" } }, sentence: `a secret's name is an environment variable's, not "1BAD"`, value: "v1-3f9a", direct: true },
      { body: { pasture: "refusing", secrets: { "BAD-NAME": "v2-8c1e" } }, sentence: `a secret's name is an environment variable's, not "BAD-NAME"`, value: "v2-8c1e" },
      { body: { pasture: "refusing", secrets: { PROBE: "" } }, sentence: "the value of the secret PROBE is not a non-empty string of one line", direct: true },
      { body: { pasture: "refusing", secrets: { PROBE: "line-one-7b2d\nline-two-4e6a" } }, sentence: "the value of the secret PROBE is not a non-empty string of one line", value: "line-one-7b2d" },
      { body: { pasture: "refusing", secrets: { PROBE: "carriage-5d1f\r" } }, sentence: "the value of the secret PROBE is not a non-empty string of one line", value: "carriage-5d1f" },
      { body: { pasture: "refusing", secrets: { PROBE: 42 } }, sentence: "the value of the secret PROBE is not a non-empty string of one line" },
      { body: { pasture: "refusing", secrets: ["PROBE"] }, sentence: 'a sheep\'s secrets are an object of name to value, as {"NAME": "value"}', direct: true },
      { body: { pasture: "refusing", secrets: "PROBE=v3-2a7c" }, sentence: 'a sheep\'s secrets are an object of name to value, as {"NAME": "value"}', value: "v3-2a7c" },
      // Journey 3 step 4: a sheep born into no pasture has no setup, so GIT_TOKEN is all it can carry.
      { body: { secrets: { NPM_TOKEN: NPM_TOKEN } }, sentence: "a sheep born into no pasture has no setup, so GIT_TOKEN is the only secret it can carry, not NPM_TOKEN", value: NPM_TOKEN, direct: true },
      { body: { name: "loner", secrets: { GIT_TOKEN: "git-9e4b", PROBE: SHEEP_PROBE } }, sentence: "a sheep born into no pasture has no setup, so GIT_TOKEN is the only secret it can carry, not PROBE", value: SHEEP_PROBE },
    ];
    const before = await (await api("/sessions")).text();
    for (const { body, sentence, value, direct } of cases) {
      const response = await api("/sessions", { method: "POST", body: JSON.stringify(body) });
      const said = await response.text();
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(said).toBe(sentence);
      if (value !== undefined) expect(said).not.toContain(value);
      expect(await (await api("/sessions")).text()).toBe(before);
      if (direct === undefined) continue;
      // The Directory refuses the same secrets in the same sentence, for a caller that is not the Worker.
      const directly = await env.DIRECTORY.getByName("home")
        .create("direct", typeof body.pasture === "string" ? body.pasture : null, body.secrets as Record<string, string>)
        .then(
          () => "minted",
          (error: Error) => error.message,
        );
      expect(directly).toBe(sentence);
      expect(await (await api("/sessions")).text()).toBe(before);
    }
    expect(mintSecrets(undefined, null)).toEqual({ secrets: {} });
    expect(mintSecrets(null, "refusing")).toEqual({ secrets: {} });

    // What is not refused: GIT_TOKEN alone on a sheep with no pasture, and no secrets at all. The mint is the row with the names.
    const loner = await api("/sessions", { method: "POST", body: JSON.stringify({ name: "loner", secrets: { GIT_TOKEN: "git-token-0c5e8a2d7f1b4639-the-loners" } }) });
    expect(loner.status).toBe(201);
    const lonerBody = await loner.text();
    expect(lonerBody).not.toContain("git-token-0c5e8a2d7f1b4639-the-loners");
    const lonerSummary = JSON.parse(lonerBody) as SessionSummary;
    expect(lonerSummary).toMatchObject({ name: "loner", pasture: null, secrets: [PASTURE_GIT_TOKEN] });
    expect(await tablesOf(lonerSummary.id)).toEqual([]);
    const plain = (await (await api("/sessions", { method: "POST", body: JSON.stringify({ name: "plain", secrets: {} }) })).json()) as SessionSummary;
    expect(plain).toMatchObject({ name: "plain", pasture: null, secrets: [] });
    const all = await (await api("/sessions")).text();
    expect(all).not.toContain("git-token-0c5e8a2d7f1b4639-the-loners");
    expect((JSON.parse(all) as SessionSummary[]).find((row) => row.id === lonerSummary.id)?.secrets).toEqual([PASTURE_GIT_TOKEN]);
  });
});
