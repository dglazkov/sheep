/**
 * end phase 0: the end, in workerd, against the fake container and the
 * pool's browser. Journey 1 steps 1 to 5 in the cell's terms: three sheep
 * born into one pasture, `docs` finished, `tests` mid-turn with a bash line
 * running in its container, `types` idle and never having rented. Each is
 * ended with `DELETE /s/<id>`, and after each nothing of it remains but the
 * pasture: the row gone, every `/s/<id>` route the one sentence, the cell's
 * storage empty of tables and of an alarm, the fake destroyed once with the
 * kill on its ledger, the Directory's container row closed. A terminal
 * attached over `/ws` is closed with the reason. Then journey 2: a sheep
 * that looked has its browser closed by the end, so a connect by the kept
 * id is refused after, and one whose browser had already gone is ended the
 * same way.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/pi-agent-core";
import puppeteer from "@cloudflare/puppeteer";
import { Client } from "@earendil-works/pi-client";
import { AgentController } from "@earendil-works/pi-coding-agent/experimental/services/agent-controller";
import { createServerServiceSource, createSessionServiceSource } from "@earendil-works/pi-coding-agent/experimental/services/connection";
import { SessionManagement } from "@earendil-works/pi-coding-agent/experimental/services/sessions";
import { Transcript } from "@earendil-works/pi-coding-agent/experimental/services/transcript";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { EndReport, SessionCell } from "../src/cell.ts";
import { type Directory, type SessionSummary, unknownSession } from "../src/directory.ts";
import type { FauxProgram } from "../src/models.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { ENDED_CLOSE_CODE, ENDED_REASON } from "../src/wire/listener.ts";
import { type FakeContainer, type ScriptFor, serveFakeOn, type TranscriptEntry } from "./fake-container.ts";
import { adoptedSocketTransport } from "./ws-transport.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const PASTURE = "docs";

/** Long enough for a look on a machine whose wrangler cache is empty: the Chrome is fetched then. */
const LOOK_TIMEOUT_MS = 600_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await sleep(20);
  }
}

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

/** `pnpm test` ends; `pnpm run forever` prints one line and then runs until killed. */
const projectScript: ScriptFor = (request) => {
  const command = request.command.trim();
  if (command === "pnpm test") return { steps: [{ wait: 30, stdout: "1 passed\n" }], exit: 0 };
  if (command === "pnpm run forever") return { steps: [{ stdout: "started\n" }, { wait: 60_000, stdout: "never\n" }], exit: 0 };
  return undefined;
};

/** What the test's starter saw: the dials it made, the fakes it serves, and how many times it was asked to destroy. */
interface Stub {
  starter: ContainerStarter;
  ensures: number;
  destroys: number;
  fakes: Array<Omit<FakeContainer, "socket">>;
}

/** The container's half without a container, as `lease.test.ts` has it: dial the real door on `ensure`, serve the fake on what comes back, count the destroys. */
function stubStarter(sessionId: string): Stub {
  const directory = () => env.DIRECTORY.getByName("home");
  const stub: Stub = {
    ensures: 0,
    destroys: 0,
    fakes: [],
    starter: {
      async ensure(args) {
        stub.ensures++;
        void (async () => {
          await sleep(10);
          const response = await SELF.fetch(`${args.cellUrl}?token=${encodeURIComponent(args.token)}`, { headers: { upgrade: "websocket" } });
          if (response.status !== 101) return;
          const socket = response.webSocket!;
          socket.accept();
          const fake = serveFakeOn(socket, { script: projectScript });
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
        stub.destroys++;
        stub.fakes.at(-1)?.stop("destroyed");
      },
    },
  };
  return stub;
}

/** The pasture the three sheep are born into: no repository, so no birth and no container until a line asks for one. */
async function pastured(): Promise<void> {
  const response = await api("/pastures", { method: "POST", body: JSON.stringify({ name: PASTURE }) });
  expect([201, 409]).toContain(response.status);
}

/**
 * A sheep born into the pasture, with a starter set before its first boot,
 * and a faux program if it has one. Booted once through the home's face:
 * the mint boots no cell (mint phase 0), and these cases end sheep that
 * hold rows, so the boot is asked for here.
 */
async function sheep(name: string, program?: FauxProgram): Promise<{ id: string; stub: Stub }> {
  const { id } = await env.DIRECTORY.getByName("home").create(name, PASTURE);
  const stub = stubStarter(id);
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.starter = stub.starter;
  });
  expect((await api(`/s/${id}/`)).status).toBe(200);
  if (program !== undefined) expect((await api(`/s/${id}/faux`, { method: "POST", body: JSON.stringify(program) })).status).toBe(200);
  return { id, stub };
}

async function ls(): Promise<string[]> {
  return ((await (await api("/sessions")).json()) as SessionSummary[]).map((session) => session.id);
}

async function stateOf(id: string): Promise<string | undefined> {
  return ((await (await api("/sessions")).json()) as SessionSummary[]).find((session) => session.id === id)?.state;
}

/** Ends a sheep through the Worker, as `sheep rm` will, and reads the report. */
async function end(id: string): Promise<EndReport> {
  const response = await api(`/s/${id}`, { method: "DELETE" });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as EndReport;
}

/** Every object in the cell's own SQLite that is not the platform's: after an end, none. */
function tablesOf(id: string): Promise<string[]> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) =>
    state.storage.sql
      .exec<{ name: string; type: string }>("SELECT name, type FROM sqlite_master")
      .toArray()
      .filter((row) => !row.name.startsWith("_cf_"))
      .map((row) => `${row.type} ${row.name}`),
  );
}

function alarmOf(id: string): Promise<number | null> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) => state.storage.getAlarm());
}

/** Whether the Directory still counts a container as running for this sheep. */
function containerRowOf(id: string): Promise<boolean> {
  return runInDurableObject(env.DIRECTORY.getByName("home"), (_directory: Directory, state) => state.storage.sql.exec("SELECT 1 FROM containers WHERE session_id = ?", id).toArray().length > 0);
}

function frames(stub: Stub): Array<Extract<TranscriptEntry, { frame: unknown }>> {
  return stub.fakes.flatMap((fake) => fake.transcript).filter((entry): entry is Extract<TranscriptEntry, { frame: unknown }> => "frame" in entry);
}

/** Every route on an ended or unknown id is the one sentence, 404, and nothing else; the door too. */
async function refusedEverywhere(id: string): Promise<void> {
  const sentence = unknownSession(id);
  for (const [method, path] of [
    ["GET", `/s/${id}/`],
    ["GET", `/s/${id}/transcript`],
    ["POST", `/s/${id}/abort`],
    ["DELETE", `/s/${id}`],
  ] as const) {
    const response = await api(path, { method, ...(method === "POST" ? { body: "{}" } : {}) });
    expect(response.status, `${method} ${path}`).toBe(404);
    expect(await response.text(), `${method} ${path}`).toBe(sentence);
  }
  const ws = await SELF.fetch(`https://sheep.test/s/${id}/ws?token=test-token`, { headers: { upgrade: "websocket" } });
  expect(ws.status).toBe(404);
  const door = await SELF.fetch(`https://sheep.test/s/${id}/pen?token=x`, { headers: { upgrade: "websocket" } });
  expect(door.status).toBe(404);
  expect(await door.text()).toBe(sentence);
}

describe("end phase 0: journey 1 in the cell's terms", () => {
  it("steps 1 and 2: a finished sheep and a sheep mid-turn in its container are ended, and nothing of either remains", { timeout: 60_000 }, async () => {
    await pastured();
    const docs = await sheep("docs", { steps: [{ tool: { name: "bash", args: { command: "pnpm test" } } }, { text: "the docs are done" }] });
    const tests = await sheep("tests", { steps: [{ tool: { name: "bash", args: { command: "pnpm run forever" } } }, { text: "never said" }] });

    // `docs` is finished: one turn ran in its container and settled; the container is still up, idling.
    await api(`/s/${docs.id}/prompt`, { method: "POST", body: JSON.stringify({ text: "finish the docs" }) });
    await runInDurableObject(env.SESSION_CELL.getByName(docs.id), (cell: SessionCell) => cell.waitForIdle(20_000));
    expect(docs.stub.fakes.length).toBe(1);
    expect(await stateOf(docs.id)).toBe("idle");
    // `tests` is mid-turn: the line is running in its container.
    await api(`/s/${tests.id}/prompt`, { method: "POST", body: JSON.stringify({ text: "run the tests forever" }) });
    await until(() => tests.stub.fakes[0]?.runs.length === 1);
    expect(tests.stub.fakes[0]!.runs[0]!.command).toBe("pnpm run forever");
    await until(async () => (await stateOf(tests.id)) === "running");
    // Before the end, both cells hold rows; the running one holds an alarm.
    expect((await tablesOf(docs.id)).length).toBeGreaterThan(0);
    expect(await alarmOf(tests.id)).not.toBeNull();
    expect(await containerRowOf(docs.id)).toBe(true);
    expect(await containerRowOf(tests.id)).toBe(true);
    const before = await ls();
    expect(before).toContain(docs.id);
    expect(before).toContain(tests.id);

    // Step 1: `docs` ended. No turn to abort; the container destroyed once.
    expect(await end(docs.id)).toEqual({ ended: true, aborted: false });
    expect(docs.stub.destroys).toBe(1);
    expect(frames(docs.stub).some((entry) => entry.frame.type === "kill")).toBe(false);
    expect(await ls()).not.toContain(docs.id);
    expect(await ls()).toContain(tests.id);
    await refusedEverywhere(docs.id);
    expect(await tablesOf(docs.id)).toEqual([]);
    expect(await alarmOf(docs.id)).toBeNull();
    expect(await containerRowOf(docs.id)).toBe(false);

    // Step 2: `tests` ended mid-turn. The turn aborted, the command killed and the kill on the container's own ledger,
    // the container destroyed once, and the line the same shape.
    const started = Date.now();
    expect(await end(tests.id)).toEqual({ ended: true, aborted: true });
    console.info(`end phase 0: the mid-turn end took ${Date.now() - started} ms`);
    expect(tests.stub.destroys).toBe(1);
    const ledger = frames(tests.stub).map((entry) => `${entry.from}:${entry.frame.type}`);
    expect(frames(tests.stub).find((entry) => entry.frame.type === "kill")).toMatchObject({ from: "cell", frame: { reason: "aborted" } });
    expect(frames(tests.stub).find((entry) => entry.frame.type === "killed")).toMatchObject({ from: "container", frame: { reason: "aborted" } });
    expect(ledger.indexOf("cell:kill")).toBeGreaterThan(ledger.indexOf("cell:run"));
    expect(ledger).not.toContain("container:exit");
    expect(await ls()).not.toContain(tests.id);
    await refusedEverywhere(tests.id);
    expect(await tablesOf(tests.id)).toEqual([]);
    expect(await alarmOf(tests.id)).toBeNull();
    expect(await containerRowOf(tests.id)).toBe(false);
    // The fake itself saw its socket close: the container went away, as the platform's would.
    await tests.stub.fakes[0]!.closed;
    await docs.stub.fakes[0]!.closed;
  });

  it("step 3: an idle sheep that never rented is ended with the same shape, and no container is started to be destroyed", async () => {
    await pastured();
    const types = await sheep("types");
    expect((await tablesOf(types.id)).length).toBeGreaterThan(0);
    expect(await end(types.id)).toEqual({ ended: true, aborted: false });
    expect(types.stub.ensures).toBe(0);
    expect(types.stub.fakes).toEqual([]);
    // The destroy was asked of the starter all the same; a destroy of nothing is nothing.
    expect(types.stub.destroys).toBe(1);
    expect(await tablesOf(types.id)).toEqual([]);
    expect(await alarmOf(types.id)).toBeNull();
    await refusedEverywhere(types.id);
  });

  it("step 4 and a second end: an id the home does not have is the sentence, 404, and the list is unchanged", async () => {
    await pastured();
    const kept = await sheep("kept");
    const before = await ls();
    await refusedEverywhere("nonsense");
    expect(await ls()).toEqual(before);
    // A second end of an ended id is the same sentence.
    expect(await end(kept.id)).toEqual({ ended: true, aborted: false });
    const again = await api(`/s/${kept.id}`, { method: "DELETE" });
    expect(again.status).toBe(404);
    expect(await again.text()).toBe(unknownSession(kept.id));
    expect(await ls()).toEqual(before.filter((id) => id !== kept.id));
  });

  it("a terminal attached over /ws is closed by the end with the reason, and pi's client sees the connection go", { timeout: 30_000 }, async () => {
    await pastured();
    const watched = await sheep("watched");
    const { serverId } = (await (await api("/home")).json()) as { serverId: string };

    // A raw socket, to read the close code and reason exactly.
    const raw = await SELF.fetch(`https://sheep.test/s/${watched.id}/ws?token=test-token`, { headers: { upgrade: "websocket" } });
    expect(raw.status).toBe(101);
    const rawSocket = raw.webSocket!;
    rawSocket.accept();
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      rawSocket.addEventListener("close", (event) => resolve({ code: event.code, reason: event.reason }));
    });

    // And pi's client attached to the session, as the TUI is.
    const response = await SELF.fetch(`https://sheep.test/s/${watched.id}/ws?token=test-token`, { headers: { upgrade: "websocket" } });
    const socket = response.webSocket!;
    socket.accept();
    const client = await Client.connect({ serverId, transportFactory: adoptedSocketTransport(socket) });
    const server = createServerServiceSource(client);
    const session = createSessionServiceSource(client);
    const serverServices = server.open({ services: [SessionManagement], assertAccess() {}, onError() {} });
    const sessionServices = session.open({ services: [AgentController, Transcript], assertAccess() {}, onError() {} });
    const management = serverServices.use(SessionManagement);
    await Promise.all([serverServices.ready(BACKGROUND_CONTEXT), sessionServices.ready(BACKGROUND_CONTEXT)]);
    await management.attach(watched.id, BACKGROUND_CONTEXT);
    await session.whenAttached(watched.id, BACKGROUND_CONTEXT);
    expect(client.connected).toBe(true);

    expect(await end(watched.id)).toEqual({ ended: true, aborted: false });
    expect(await closed).toEqual({ code: ENDED_CLOSE_CODE, reason: ENDED_REASON });
    await until(() => !client.connected);
    expect(client.connected).toBe(false);
    await Promise.allSettled([server.dispose(BACKGROUND_CONTEXT), session.dispose(BACKGROUND_CONTEXT)]);
    await client.dispose();
    await refusedEverywhere(watched.id);
  });

  it("step 5: the pasture outlives its sheep: still named, a herd of none, and minting into it as before", async () => {
    await pastured();
    const first = await sheep("herded-1");
    const second = await sheep("herded-2");
    const mine = new Set([first.id, second.id]);
    // The herd as this test sees it: the pasture is shared by the file's other cases, so only this test's sheep are counted.
    const herd = async () => {
      const view = (await (await api(`/p/${PASTURE}/`)).json()) as { name: string; repo: string | null; herd: SessionSummary[] };
      return { ...view, herd: view.herd.filter((member) => mine.has(member.id)) };
    };
    expect((await herd()).herd.map((member) => member.id).sort()).toEqual([first.id, second.id].sort());
    expect(await end(first.id)).toEqual({ ended: true, aborted: false });
    expect(await end(second.id)).toEqual({ ended: true, aborted: false });
    // The pastures table is untouched, and the herd is a query of none.
    const pastures = (await (await api("/pastures")).json()) as Array<{ name: string }>;
    expect(pastures.map((pasture) => pasture.name)).toContain(PASTURE);
    const after = await herd();
    expect(after.name).toBe(PASTURE);
    expect(after.herd).toEqual([]);
    // Minting into it again works as before.
    const born = await api("/sessions", { method: "POST", body: JSON.stringify({ name: "herded-3", pasture: PASTURE }) });
    expect(born.status).toBe(201);
    const { id } = (await born.json()) as SessionSummary;
    mine.add(id);
    expect((await herd()).herd.map((member) => member.id)).toEqual([id]);
    expect(await end(id)).toEqual({ ended: true, aborted: false });
    expect((await herd()).herd).toEqual([]);
  });

  it("the removal alone: the Directory closes a container row it was never told stopped, and a late state report resurrects nothing", async () => {
    const directory = env.DIRECTORY.getByName("home");
    const { id } = await directory.create("orphan");
    // A container the Directory saw start and never saw stop, one second ago.
    await directory.containerOpened(id, Date.now() - 1_000);
    expect(await containerRowOf(id)).toBe(true);
    const before = await directory.containerMinutes();
    expect(await directory.remove(id)).toBe(true);
    expect(await containerRowOf(id)).toBe(false);
    expect(await directory.get(id)).toBeUndefined();
    // Its second was counted once, and the total no longer grows for it.
    const closed = await directory.containerMinutes();
    expect(closed).toBeGreaterThanOrEqual(before - 0.001);
    await sleep(60);
    expect(Math.abs((await directory.containerMinutes()) - closed)).toBeLessThan(0.0005);
    // A cell's report arriving after the removal updates nothing.
    await directory.setState(id, "running");
    await directory.setTask(id, "a late task");
    expect(await directory.get(id)).toBeUndefined();
    expect(await directory.remove(id)).toBe(false);
  });
});

describe("end phase 0: journey 2, the eyes are closed with the sheep", () => {
  /** A sheep that looked once, and the browser session its look kept. */
  async function looked(name: string): Promise<{ id: string; kept: string }> {
    const { id } = await sheep(name);
    const kept = await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => {
      const runtime = await cell.runtime();
      runtime.env.files.writeFile("/workspace/index.html", `<!doctype html><meta charset="utf-8"><h1>${name}</h1>`, { createParents: true });
      const eyes = runtime.env.eyes;
      expect(eyes).toBeDefined();
      await eyes!.look({ path: "/workspace/index.html" });
      return eyes!.session.id();
    });
    expect(kept).toBeTypeOf("string");
    return { id, kept: kept! };
  }

  it(
    "step 1: the end closes the browser before the rows go, so a connect by the kept id is refused; step 2: a browser already gone is nothing to close",
    async () => {
      await pastured();
      const warm = await looked("seer");
      // Warm: the kept session answers a connect before the end.
      const browser = await puppeteer.connect(env.BROWSER!, warm.kept);
      await browser.disconnect();
      expect(await end(warm.id)).toEqual({ ended: true, aborted: false });
      await expect(puppeteer.connect(env.BROWSER!, warm.kept)).rejects.toThrow();
      expect(await tablesOf(warm.id)).toEqual([]);
      await refusedEverywhere(warm.id);

      // Step 2: the browser idled out, or was taken back, before the end; the end is the same line.
      const cold = await looked("blinked");
      const gone = await puppeteer.connect(env.BROWSER!, cold.kept);
      await gone.close();
      await expect(puppeteer.connect(env.BROWSER!, cold.kept)).rejects.toThrow();
      expect(await end(cold.id)).toEqual({ ended: true, aborted: false });
      expect(await tablesOf(cold.id)).toEqual([]);
      await refusedEverywhere(cold.id);
    },
    LOOK_TIMEOUT_MS,
  );
});
