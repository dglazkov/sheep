/**
 * mint phase 0: the mint is a row, in workerd against the fake container.
 * Journey 1 steps 1 to 3 and 6 in the cell's terms: `POST /sessions`
 * inserts the Directory's row and touches nothing else, so the cell's
 * storage holds no table and no alarm and the faux provider is not called;
 * the cell boots on the first thing that asks it, `GET /s/<id>/` here; the
 * first prompt is the first thing the provider answers and the transcript's
 * first entry; a sheep minted and never asked is ended with nothing to
 * stop. Then journey 2 steps 1 to 4, into a pasture with a repository and a
 * `setup.sh`. The pool has no container binding, so the Worker's route
 * refuses that pasture before any row and the mint here is the Directory's
 * `create`, as `birth.test.ts` mints, with the test's starter set before the
 * first boot: the fake is not started by the mint; the first prompt births
 * the sheep, the clone then setup in one container, the entry first and the
 * prompt second; a second sheep ended before any boot starts nothing; a
 * third asked `GET /s/<id>/` alone is born by that, its transcript the birth
 * entry alone.
 */
import type { Message } from "@earendil-works/pi-ai";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BIRTH_ENTRY, type BirthData, birthCommand, birthText } from "../src/birth.ts";
import type { EndReport, SessionCell } from "../src/cell.ts";
import { type SessionSummary, unknownSession } from "../src/directory.ts";
import { SETUP_COMMAND, SETUP_PATH } from "../src/env/execution-env.ts";
import { setFauxScript } from "../src/models.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { type FakeContainer, type ScriptFor, serveFakeOn } from "./fake-container.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const PASTURE = "born";
const REPO = "https://github.com/org/repo";
const SETUP_SCRIPT = "#!/bin/sh\nset -e\npnpm install --frozen-lockfile\n";
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

/** Every provider call in this isolate from now on, as the conversation each saw: the count is whether a model was called. */
function countingProvider(answer = "ok"): Message[][] {
  const calls: Message[][] = [];
  setFauxScript((conversation) => {
    calls.push(conversation.messages);
    return fauxAssistantMessage(answer);
  });
  return calls;
}

/** What the test's starter saw: how many times it was asked to start, how many to destroy, and the fakes it serves. */
interface Stub {
  starter: ContainerStarter;
  ensures: number;
  destroys: number;
  fakes: Array<Omit<FakeContainer, "socket">>;
}

/** The container's half without a container, as `end.test.ts` has it: dial the real door on `ensure`, serve the fake on what comes back, count both ways. */
function stubStarter(sessionId: string, script: ScriptFor): Stub {
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
        stub.destroys++;
        stub.fakes.at(-1)?.stop("destroyed");
      },
    },
  };
  return stub;
}

/** The clone and setup as the fake plays them: a checkout onto the disk, then a setup that exits 0. */
const repoScript: ScriptFor = (request) => {
  const command = request.command.trim();
  if (command === birthCommand(REPO, "main")) {
    return {
      steps: [
        { stderr: "Cloning into '.'...\n" },
        {
          act: (disk) => {
            disk.putFile("README.md", "# Fixture\n");
            disk.putFile("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
            disk.putFile(".git/HEAD", "ref: refs/heads/main\n");
          },
        },
      ],
      exit: 0,
    };
  }
  if (command === SETUP_COMMAND) return { steps: [{ stdout: "Lockfile is up to date, resolution step is skipped\n" }], exit: 0 };
  return undefined;
};

/** The pasture the journey 2 sheep are minted into: a repository and a `setup.sh`, so a birth is a clone and then setup. */
async function pastured(): Promise<void> {
  const response = await api("/pastures", { method: "POST", body: JSON.stringify({ name: PASTURE, repo: REPO, branch: "main" }) });
  expect([201, 409]).toContain(response.status);
  await env.PASTURE.getByName(PASTURE).put(SETUP_PATH, encode(SETUP_SCRIPT));
}

/**
 * A sheep minted into the pasture the way `birth.test.ts` mints one: the row
 * through the Directory, since the Worker's route refuses a repository on
 * this home with no container binding, and the starter set on the cell
 * before any boot, which is the seam and not a boot: nothing is asked of
 * the cell.
 */
async function minted(name: string): Promise<{ id: string; stub: Stub }> {
  const { id } = await env.DIRECTORY.getByName("home").create(name, PASTURE);
  const stub = stubStarter(id, repoScript);
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.starter = stub.starter;
  });
  return { id, stub };
}

/** Every object in the cell's own SQLite that is not the platform's: after a mint, none. */
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

/** The Directory's row for the sheep, as `sheep ls --json` prints it. */
async function rowOf(id: string): Promise<SessionSummary | undefined> {
  return ((await (await api("/sessions")).json()) as SessionSummary[]).find((session) => session.id === id);
}

/** The cell tells the Directory the task by an RPC it does not await; give it a moment. */
async function taskBecomes(id: string, wanted: string, timeoutMs = 3_000): Promise<string | null | undefined> {
  const deadline = Date.now() + timeoutMs;
  let task = (await rowOf(id))?.task;
  while (task !== wanted && Date.now() < deadline) {
    await sleep(25);
    task = (await rowOf(id))?.task;
  }
  return task;
}

interface TranscriptEntryView {
  type: string;
  customType?: string;
  data?: unknown;
  message?: { role: string; content: unknown };
}

async function transcript(id: string): Promise<TranscriptEntryView[]> {
  const response = await api(`/s/${id}/transcript`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { entries: TranscriptEntryView[] }).entries;
}

function idle(id: string) {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => cell.waitForIdle(20_000));
}

/** Every run every fake was handed, in order. */
function runs(stub: Stub): string[] {
  return stub.fakes.flatMap((fake) => fake.runs.map((run) => run.command));
}

/** Ends a sheep through the Worker, as `sheep rm` does, and reads the report. */
async function end(id: string): Promise<EndReport> {
  const response = await api(`/s/${id}`, { method: "DELETE" });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as EndReport;
}

/** After an end: the state route and a second end are the one sentence, 404. */
async function refused(id: string): Promise<void> {
  const state = await api(`/s/${id}/`);
  expect(state.status).toBe(404);
  expect(await state.text()).toBe(unknownSession(id));
  const again = await api(`/s/${id}`, { method: "DELETE" });
  expect(again.status).toBe(404);
  expect(await again.text()).toBe(unknownSession(id));
}

describe("mint phase 0: journey 1 in the cell's terms", () => {
  it("steps 1 to 3: the mint is one row and nothing else; GET /s/<id>/ is the first boot; the first prompt is the provider's first call and the transcript's first entry", async () => {
    const calls = countingProvider("hello");

    // Step 1: the mint. The answer is the row.
    const started = Date.now();
    const response = await api("/sessions", { method: "POST", body: JSON.stringify({ name: "named" }) });
    const took = Date.now() - started;
    expect(response.status).toBe(201);
    const summary = (await response.json()) as SessionSummary;
    expect(summary).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: "named", createdAt: expect.any(Number), state: "idle", pasture: null, task: null, secrets: [], setup: null });
    console.info(`mint phase 0: the mint took ${took} ms`);
    const { id } = summary;
    // The one rule: the mint touched the Directory and nothing else. `sqlite_master` is read before anything else is asked.
    expect(await tablesOf(id)).toEqual([]);
    expect(await alarmOf(id)).toBeNull();
    // Step 2: listed idle with no task.
    expect(await rowOf(id)).toEqual(summary);
    // Step 3: no model was called.
    expect(calls).toEqual([]);

    // The first boot, asked by `GET /s/<id>/`: tables now, no operation, still no alarm, still no model call, the row as it was.
    const state = await api(`/s/${id}/`);
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({ id, operation: null });
    expect((await tablesOf(id)).length).toBeGreaterThan(0);
    expect(await alarmOf(id)).toBeNull();
    expect(calls).toEqual([]);
    expect(await rowOf(id)).toEqual(summary);
    expect(await transcript(id)).toEqual([]);

    // Step 4's half the cell can prove: the first prompt is the first thing the provider answers, and the transcript's first entry.
    const prompted = await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "say hello\nand nothing more" }) });
    expect(prompted.status).toBe(200);
    expect(await prompted.json()).toMatchObject({ accepted: true, error: null, operationId: expect.any(String) });
    expect((await idle(id)).operation).toBeNull();
    expect(calls.length).toBe(1);
    expect(calls[0]!.map((message) => message.role)).toEqual(["user"]);
    expect(JSON.stringify(calls[0]![0])).toContain("say hello\\nand nothing more");
    const entries = await transcript(id);
    expect(entries[0]).toMatchObject({ type: "message", message: { role: "user" } });
    expect(JSON.stringify(entries[0])).toContain("say hello\\nand nothing more");
    expect(entries.at(-1)).toMatchObject({ type: "message", message: { role: "assistant" } });
    expect(JSON.stringify(entries.at(-1))).toContain("hello");
    // The task is the prompt's first line, and the sheep is idle again.
    expect(await taskBecomes(id, "say hello")).toBe("say hello");
    expect(await alarmOf(id)).toBeNull();
  });

  it("step 6: a sheep minted and never asked is ended: the row goes, the storage stays empty, and no model was called", async () => {
    const calls = countingProvider();
    const response = await api("/sessions", { method: "POST", body: JSON.stringify({ name: "unasked" }) });
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as SessionSummary;
    expect(await tablesOf(id)).toEqual([]);
    expect(await rowOf(id)).toMatchObject({ id, state: "idle", task: null });

    expect(await end(id)).toEqual({ ended: true, aborted: false });
    expect(await rowOf(id)).toBeUndefined();
    expect(await tablesOf(id)).toEqual([]);
    expect(await alarmOf(id)).toBeNull();
    expect(calls).toEqual([]);
    await refused(id);
  });
});

describe("mint phase 0: journey 2 in the cell's terms, into a pasture with a repository", () => {
  it("steps 1 and 2: the mint starts no container; the first prompt births the sheep, the clone then setup in one container, the entry first and the prompt second", { timeout: 30_000 }, async () => {
    await pastured();
    const seen = countingProvider("it is org/repo");
    const { id, stub } = await minted("first");

    // Step 1: no container was started, nothing was cloned, no table, no alarm; the row idle with no task; no model called.
    expect(stub.ensures).toBe(0);
    expect(stub.fakes).toEqual([]);
    expect(await tablesOf(id)).toEqual([]);
    expect(await alarmOf(id)).toBeNull();
    expect(await rowOf(id)).toMatchObject({ id, name: "first", pasture: PASTURE, state: "idle", task: null });
    expect(seen).toEqual([]);

    // Step 2: the first prompt births first. The answer is durable only after the birth, so by then the container was
    // rented once and the clone then setup ran in it.
    const started = Date.now();
    const prompted = await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "What repository is this?" }) });
    expect(prompted.status).toBe(200);
    console.info(`mint phase 0: the first prompt, birth included, took ${Date.now() - started} ms`);
    expect(stub.ensures).toBe(1);
    expect(runs(stub)).toEqual([birthCommand(REPO, "main"), SETUP_COMMAND]);
    expect((await idle(id)).operation).toBeNull();
    // The birth entry is first on the lane and the prompt second.
    const entries = await transcript(id);
    expect(entries[0]).toMatchObject({ type: "custom", customType: BIRTH_ENTRY });
    const birth = entries[0]!.data as BirthData;
    expect(birth).toMatchObject({ pasture: PASTURE, repo: REPO, branch: "main", command: birthCommand(REPO, "main"), exit: 0, setup: { exit: 0 } });
    expect(entries[1]).toMatchObject({ type: "message", message: { role: "user" } });
    expect(JSON.stringify(entries[1])).toContain("What repository is this?");
    expect(entries.at(-1)).toMatchObject({ type: "message", message: { role: "assistant" } });
    // The model read the birth before the prompt, as pasture phase 3 requires, and was called once.
    expect(seen.length).toBe(1);
    expect(seen[0]!.map((message) => message.role)).toEqual(["user", "user"]);
    expect(JSON.stringify(seen[0]![0])).toContain(birthText(birth).slice(0, 60));
    expect(JSON.stringify(seen[0]![1])).toContain("What repository is this?");
    expect(stub.ensures).toBe(1);
    expect(runs(stub)).toEqual([birthCommand(REPO, "main"), SETUP_COMMAND]);
    // The clone is rows, and `sheep pasture <p>` lists the sheep in the herd with its task.
    await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => {
      const runtime = await cell.runtime();
      expect(runtime.env.files.manifest().map((entry) => entry.path)).toContain(".git/HEAD");
    });
    expect(await taskBecomes(id, "What repository is this?")).toBe("What repository is this?");
    const view = (await (await api(`/p/${PASTURE}/`)).json()) as { name: string; repo: string | null; herd: SessionSummary[] };
    expect(view).toMatchObject({ name: PASTURE, repo: REPO });
    expect(view.herd.find((member) => member.id === id)).toMatchObject({ id, state: "idle", task: "What repository is this?" });
    await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => (await cell.runtime()).lease!.idle());
  });

  it("step 3: a second sheep minted into the pasture and ended before anything was asked starts no container to destroy one; the row goes and the herd is unchanged but for it", async () => {
    await pastured();
    const calls = countingProvider();
    const kept = await minted("kept");
    const { id, stub } = await minted("second");
    const herd = async () => ((await (await api(`/p/${PASTURE}/`)).json()) as { herd: SessionSummary[] }).herd.map((member) => member.id);
    const before = await herd();
    expect(before).toContain(id);
    expect(before).toContain(kept.id);
    expect(stub.ensures).toBe(0);
    expect(await tablesOf(id)).toEqual([]);

    expect(await end(id)).toEqual({ ended: true, aborted: false });
    // The starter was asked for the destroy, as end phase 0 has it; a destroy of nothing is nothing, and nothing was started.
    expect(stub.ensures).toBe(0);
    expect(stub.fakes).toEqual([]);
    expect(stub.destroys).toBe(1);
    expect(await tablesOf(id)).toEqual([]);
    expect(await alarmOf(id)).toBeNull();
    expect(await rowOf(id)).toBeUndefined();
    expect(await herd()).toEqual(before.filter((member) => member !== id));
    expect(calls).toEqual([]);
    await refused(id);
    // The sheep beside it was never touched: no start, no table.
    expect(kept.stub.ensures).toBe(0);
    expect(await tablesOf(kept.id)).toEqual([]);
    expect(await rowOf(kept.id)).toMatchObject({ id: kept.id, state: "idle", task: null });
  });

  it("step 4: a third sheep asked GET /s/<id>/ before any prompt is born by that: idle after the birth, its transcript the birth entry alone, no model called", { timeout: 30_000 }, async () => {
    await pastured();
    const calls = countingProvider();
    const { id, stub } = await minted("third");
    expect(stub.ensures).toBe(0);
    expect(await tablesOf(id)).toEqual([]);

    const started = Date.now();
    const state = await api(`/s/${id}/`);
    expect(state.status).toBe(200);
    console.info(`mint phase 0: GET /s/<id>/ on a minted pastured sheep, birth included, took ${Date.now() - started} ms`);
    expect(await state.json()).toMatchObject({ id, operation: null });
    // The birth was this boot: one container, the clone then setup in it, the entry alone on the lane, the row idle.
    expect(stub.ensures).toBe(1);
    expect(runs(stub)).toEqual([birthCommand(REPO, "main"), SETUP_COMMAND]);
    const entries = await transcript(id);
    expect(entries.length).toBe(1);
    expect(entries[0]).toMatchObject({ type: "custom", customType: BIRTH_ENTRY, data: { pasture: PASTURE, repo: REPO, exit: 0, setup: { exit: 0 } } });
    expect(await rowOf(id)).toMatchObject({ id, state: "idle", task: null });
    expect(await alarmOf(id)).toBeNull();
    expect(calls).toEqual([]);
    await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell, state) => {
      // The record that says it ran is in the cell's storage, so the next boot will not clone again.
      expect(await state.storage.get<{ exit?: number }>(BIRTH_ENTRY)).toMatchObject({ exit: 0 });
      (await cell.runtime()).lease!.idle();
    });
  });
});
