/**
 * bleat phase 0: the sheep says it, in workerd through the fake container.
 * Journeys 1 to 3 in the cell's terms, with nothing on the command line
 * yet: a pastured sheep whose `setup.sh` the test holds open says
 * `running` on its Directory row from the moment setup starts and `ok`
 * with how long it took after, while the cell's own record of that setup
 * exists for the whole of the wait and carries the output's tail at the
 * end; a second container leaves a second record; a setup that exits 1 is
 * `failed` on the row and pasture phase 4's tool result, byte for byte, in
 * front of the model; a birth's setup leaves a record and an entry
 * unchanged; twenty-one setups leave twenty records; a cell evicted
 * mid-setup leaves no `running` behind; and `GET /sessions/<id>` answers
 * the row alone, which is what a dog can ask while the cell itself is held
 * by the very setup it is asking about.
 *
 * The one rule of the project is proved here too: nothing the model reads
 * changes. The faux provider's conversation is read at every call, and the
 * only sentence about setup in it is the one pasture phase 4 already put
 * there.
 */
import type { Message } from "@earendil-works/pi-ai";
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BIRTH_ENTRY, type BirthData, birthCommand, birthText, setupSentence } from "../src/birth.ts";
import { SETUP_EVICTED, SETUP_KEPT, SETUP_KEY_PREFIX, type SetupRecord } from "../src/bleat.ts";
import type { SessionCell, TranscriptView } from "../src/cell.ts";
import { type SessionSummary, unknownSession } from "../src/directory.ts";
import { SETUP_COMMAND, SETUP_PATH, setupFailedLine } from "../src/env/execution-env.ts";
import { setFauxScript } from "../src/models.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { WORKSPACE_ROOT } from "../src/workspace/files.ts";
import { type FakeContainer, type ScriptFor, serveFakeOn } from "./fake-container.ts";

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
/** What a setup that works prints: output no dog could see before this project. */
const SETUP_OUTPUT = "Lockfile is up to date, resolution step is skipped\n";
/** What a setup that fails prints, as pasture phase 4's own test has it. */
const SETUP_FAILURE = 'ERR_PNPM_NO_LOCKFILE  Cannot install with "frozen-lockfile"\n';
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function pasture(name: string, meta: { repo?: string; branch?: string } = {}): Promise<void> {
  expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name, ...meta }) })).status).toBe(201);
}

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

async function sessionIn(name: string, pastureName: string, script: ScriptFor): Promise<{ id: string; stub: Stub }> {
  const { id } = await env.DIRECTORY.getByName("home").create(name, pastureName);
  const stub = stubStarter(id, script);
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.starter = stub.starter;
  });
  return { id, stub };
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

/** The sheep's Directory row, the way `GET /sessions/<id>` answers it: the route, so the route is what every read here proves. */
async function rowOf(id: string): Promise<SessionSummary> {
  const response = await api(`/sessions/${id}`);
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as SessionSummary;
}

/** The cell's setups, oldest first, as `GET /s/<id>/transcript` carries them. */
async function setupsOf(id: string): Promise<SetupRecord[]> {
  const response = await api(`/s/${id}/transcript`);
  expect(response.status).toBe(200);
  return ((await response.json()) as TranscriptView).setups;
}

/** Waits for a condition the cell reports through another object, or fails saying what it last saw. */
async function until<T>(what: string, read: () => Promise<T>, ready: (value: T) => boolean, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await read();
  while (!ready(last) && Date.now() < deadline) {
    await sleep(10);
    last = await read();
  }
  expect(ready(last), `${what}; last saw ${JSON.stringify(last)}`).toBe(true);
  return last;
}

/** A promise the test resolves itself, so a scripted setup is held open for as long as the test wants it. */
function gate(): { held: Promise<void>; open: () => void } {
  let open = (): void => {};
  const held = new Promise<void>((resolve) => {
    open = () => resolve();
  });
  return { held, open };
}

/** Every string anywhere in the messages the provider was handed, so what the model reads can be searched whole. */
function textsOf(messages: Message[]): string[] {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") found.push(value);
    else if (Array.isArray(value)) for (const item of value) walk(item);
    else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) walk(item);
  };
  walk(messages);
  return found;
}

describe("bleat phase 0: the sheep says it", () => {
  it("journey 1 steps 1 to 5: the row says running with its at while setup runs and ok with its ms after; the record is there while it runs and carries the tail after; a second container leaves a second record", { timeout: 30_000 }, async () => {
    await pasture("slow");
    await env.PASTURE.getByName("slow").put(SETUP_PATH, encode(SETUP_SCRIPT));
    const held = gate();
    const script: ScriptFor = (request) => {
      const command = request.command.trim();
      // The setup the test holds open: nothing is printed until the gate opens, which is what a `pnpm install` looks like.
      if (command === SETUP_COMMAND) return { steps: [{ act: async () => held.held }, { stdout: SETUP_OUTPUT }], exit: 0 };
      if (command === "pnpm test") return { steps: [{ stdout: "1 passed\n" }], exit: 0 };
      return undefined;
    };
    const { id, stub } = await sessionIn("slow-tests", "slow", script);

    // Before anything ran: a sheep no setup has ever run for says nothing (journey 3 step 2).
    expect((await rowOf(id)).setup).toBeNull();
    expect(await setupsOf(id)).toEqual([]);

    // How long the row took to answer while setup was running, measured inside the cell and said out here.
    let answered = -1;
    await inCell(id, async (cell) => {
      const asked = Date.now();
      const running = bash(cell, "pnpm test");

      // Step 2: the row says `running` with its `at`, and the elapsed time grows between two asks.
      const row = await until("the row says setup is running", () => rowOf(id), (value) => value.setup?.state === "running");
      const at = row.setup!.at;
      expect(at).toBeGreaterThanOrEqual(asked);
      expect(row.setup!.ms).toBeUndefined();
      const first = Date.now() - at;
      await sleep(60);
      // The acceptance criterion of step 2: the row answers while the cell cannot, and it is the Directory that answers.
      const asking = Date.now();
      const second = await rowOf(id);
      answered = Date.now() - asking;
      expect(answered).toBeLessThan(2_000);
      expect(Date.now() - second.setup!.at).toBeGreaterThan(first);

      // The record is there while it runs: the block exists for the whole of the wait, with no output yet and no ending.
      const [open] = await setupsOf(id);
      expect(open).toMatchObject({ id: `${SETUP_KEY_PREFIX}${at}`, at, command: SETUP_COMMAND, output: "", truncated: false });
      expect(open!.ms).toBeUndefined();
      expect(open!.exit).toBeUndefined();

      held.open();
      expect(await running).toBe("1 passed\n");

      // Step 5: the row says `ok` with how long it took, and the record says the same with the output's tail.
      const ended = await until("the row says setup is ok", () => rowOf(id), (value) => value.setup?.state === "ok");
      expect(ended.setup).toMatchObject({ state: "ok", at, exit: 0 });
      expect(ended.setup!.ms).toBeGreaterThanOrEqual(60);
      const [record] = await setupsOf(id);
      expect(record).toMatchObject({ id: open!.id, at, command: SETUP_COMMAND, exit: 0, output: SETUP_OUTPUT, truncated: false });
      // The three surfaces count from one fact: the row's length and the record's are the same number.
      expect(record!.ms).toBe(ended.setup!.ms);
      // Fold's outcome rides along, so the block can say what the cache came to.
      expect(record!.cache).toBeDefined();

      // A second container's setup leaves a second record, and the first is still there.
      (await cell.runtime()).lease!.idle();
      stub.fakes.at(-1)!.stop("idle");
      await sleep(50);
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      const both = await setupsOf(id);
      expect(both.length).toBe(2);
      expect(both[0]).toEqual(record);
      expect(both[1]).toMatchObject({ command: SETUP_COMMAND, exit: 0, output: SETUP_OUTPUT });
      expect(both[1]!.at).toBeGreaterThan(both[0]!.at);
      expect((await rowOf(id)).setup).toMatchObject({ state: "ok", at: both[1]!.at });
      (await cell.runtime()).lease!.idle();
    });
    console.info(`bleat phase 0: the row answered in ${answered} ms while setup was running`);
  });

  it("journey 2 steps 1 to 3: a setup that exits 1 is failed on the row with a record, the tool result is pasture phase 4's byte for byte, and the model reads nothing else", { timeout: 30_000 }, async () => {
    await pasture("stumble");
    await env.PASTURE.getByName("stumble").put(SETUP_PATH, encode(SETUP_SCRIPT));
    const setup = { exit: 1 };
    const script: ScriptFor = (request) => {
      const command = request.command.trim();
      if (command === SETUP_COMMAND) {
        return setup.exit === 0 ? { steps: [{ stdout: SETUP_OUTPUT }], exit: 0 } : { steps: [{ stderr: SETUP_FAILURE }], exit: setup.exit };
      }
      if (command === "pnpm test") return { steps: [{ stdout: "1 passed\n" }], exit: 0 };
      return undefined;
    };
    const { id } = await sessionIn("stumbler", "stumble", script);

    await inCell(id, async (cell) => {
      // Step 1: the refusal is pasture phase 4's, the same assertion its own test makes.
      const refusal = await bash(cell, "pnpm test").then(
        () => {
          throw new Error("the command ran");
        },
        (error: Error) => error.message,
      );
      expect(refusal.startsWith(`${setupFailedLine(1)}\n${SETUP_FAILURE}`)).toBe(true);
      expect(refusal).toContain("Command exited with code 1");
      expect(refusal).not.toContain("1 passed");
    });

    // Step 2: the row says failed with the code and how long, and the record says the same with the output's tail.
    const row = await until("the row says setup failed", () => rowOf(id), (value) => value.setup?.state === "failed");
    expect(row.setup).toMatchObject({ state: "failed", exit: 1 });
    expect(row.setup!.ms).toBeGreaterThanOrEqual(0);
    expect(row.setup!.error).toBeUndefined();
    const [first] = await setupsOf(id);
    expect(first).toMatchObject({ at: row.setup!.at, ms: row.setup!.ms, command: SETUP_COMMAND, exit: 1, output: SETUP_FAILURE, truncated: false });

    // Step 3: a second command in the same sheep runs setup again and leaves a second block; the log has both, oldest first.
    await inCell(id, async (cell) => {
      const again = await (await cell.runtime()).env.exec("pnpm test", undefined, context);
      expect(again.ok && again.value.exitCode).toBe(1);
    });
    const two = await setupsOf(id);
    expect(two.length).toBe(2);
    expect(two[0]).toEqual(first);
    expect(two[1]!.at).toBeGreaterThanOrEqual(two[0]!.at);
    expect(two.map((record) => record.exit)).toEqual([1, 1]);

    // The one rule: what the model reads is what pasture phase 4 put there and nothing of this project.
    const calls: Message[][] = [];
    let turn = 0;
    setFauxScript((conversation) => {
      calls.push(conversation.messages);
      turn++;
      return turn === 1 ? fauxAssistantMessage([fauxToolCall("bash", { command: "pnpm test" })], { stopReason: "toolUse" }) : fauxAssistantMessage("the setup is broken");
    });
    const prompted = await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "run the tests" }) });
    expect(prompted.status).toBe(200);
    await inCell(id, (cell) => cell.waitForIdle(20_000));
    expect(calls.length).toBe(2);
    const said = textsOf(calls[1]!).filter((part) => part.includes(setupFailedLine(1)));
    expect(said.length).toBe(1);
    expect(said[0]!.startsWith(`${setupFailedLine(1)}\n${SETUP_FAILURE}`)).toBe(true);
    const conversation = JSON.stringify(calls);
    for (const record of await setupsOf(id)) expect(conversation).not.toContain(record.id);
    expect(conversation).not.toContain('"setups"');
    expect(conversation).not.toContain("[setup]");
    // Nor in the tables `sheep export` rebuilds a database from.
    const dump = (await (await api(`/s/${id}/export`)).json()) as Record<string, unknown[]>;
    for (const [table, rows] of Object.entries(dump)) expect(JSON.stringify(rows), table).not.toContain(SETUP_KEY_PREFIX);
    await inCell(id, async (cell) => (await cell.runtime()).lease!.idle());
  });

  it("journey 1 step 4: a birth's setup leaves a record, the birth entry is what pasture phase 4 left it, and the transcript view carries entries and setups", { timeout: 30_000 }, async () => {
    await pasture("born", { repo: REPO, branch: "main" });
    await env.PASTURE.getByName("born").put(SETUP_PATH, encode(SETUP_SCRIPT));
    const script: ScriptFor = (request) => {
      const command = request.command.trim();
      if (command === birthCommand(REPO, "main")) {
        return {
          steps: [{ stderr: "Cloning into '.'...\n" }, { act: (disk) => disk.putFile("pnpm-lock.yaml", "lockfileVersion: '9.0'\n") }],
          exit: 0,
        };
      }
      if (command === SETUP_COMMAND) return { steps: [{ stdout: SETUP_OUTPUT }], exit: 0 };
      return undefined;
    };
    const { id } = await sessionIn("newborn", "born", script);

    // The boot is the birth: the entry, then the record for the setup that ran inside it.
    const view = (await (await api(`/s/${id}/transcript`)).json()) as TranscriptView;
    const births = view.entries.filter((entry) => entry.type === "custom" && entry.customType === BIRTH_ENTRY).map((entry) => (entry as { data: unknown }).data as BirthData);
    expect(births.length).toBe(1);
    const birth = births[0]!;
    // Pasture phase 4's entry, unchanged: the clone's output alone, and setup's sentence without setup's output.
    expect(birth).toMatchObject({ pasture: "born", exit: 0, output: "Cloning into '.'...\n", truncated: false, setup: { exit: 0 } });
    expect(birthText(birth)).toContain(`exited 0, so ${WORKSPACE_ROOT} is a clone of ${REPO} on branch main. ${setupSentence({ exit: 0 })}`);
    expect(birthText(birth)).not.toContain(SETUP_OUTPUT.trim());

    // The block is the only place setup's output is, which on a success is output no dog could see before.
    expect(view.setups.length).toBe(1);
    expect(view.setups[0]).toMatchObject({ command: SETUP_COMMAND, exit: 0, output: SETUP_OUTPUT, truncated: false });
    expect((await rowOf(id)).setup).toMatchObject({ state: "ok", at: view.setups[0]!.at, exit: 0 });
    await inCell(id, async (cell) => (await cell.runtime()).lease!.idle());
  });

  it("twenty-one setups leave twenty records, the newest twenty", { timeout: 60_000 }, async () => {
    await pasture("many");
    await env.PASTURE.getByName("many").put(SETUP_PATH, encode(SETUP_SCRIPT));
    // A setup that never succeeds runs again on every command of the same container, so one container gives twenty-one.
    const script: ScriptFor = (request) => (request.command.trim() === SETUP_COMMAND ? { steps: [{ stderr: SETUP_FAILURE }], exit: 1 } : undefined);
    const { id, stub } = await sessionIn("many-tests", "many", script);

    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      for (let n = 0; n < SETUP_KEPT + 1; n++) {
        const ran = await runtime.env.exec("pnpm test", undefined, context);
        expect(ran.ok && ran.value.exitCode, `run ${n}`).toBe(1);
      }
      expect(stub.fakes.flatMap((fake) => fake.runs).filter((run) => run.command === SETUP_COMMAND).length).toBe(SETUP_KEPT + 1);
      runtime.lease!.idle();
    });
    const kept = await setupsOf(id);
    expect(kept.length).toBe(SETUP_KEPT);
    // Oldest first, and every one of them newer than the one that was dropped.
    const ats = kept.map((record) => record.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    expect(kept.every((record) => record.exit === 1)).toBe(true);
    expect((await rowOf(id)).setup).toMatchObject({ state: "failed", at: ats.at(-1), exit: 1 });
  });

  it("the record keeps the tail and says so: forty lines of a setup that printed more", { timeout: 30_000 }, async () => {
    await pasture("loud");
    await env.PASTURE.getByName("loud").put(SETUP_PATH, encode(SETUP_SCRIPT));
    const lines = Array.from({ length: 60 }, (_value, n) => `line ${n + 1}\n`).join("");
    const script: ScriptFor = (request) => (request.command.trim() === SETUP_COMMAND ? { steps: [{ stdout: lines }], exit: 0 } : undefined);
    const { id } = await sessionIn("loud-tests", "loud", script);
    await inCell(id, async (cell) => {
      // A line the cell's own shell lacks goes whole to the container, and setup runs before it.
      await (await cell.runtime()).env.exec("pnpm test", undefined, context);
      (await cell.runtime()).lease!.idle();
    });
    const [record] = await setupsOf(id);
    expect(record).toMatchObject({ exit: 0, truncated: true });
    expect(record!.output.split("\n").filter((line) => line !== "").length).toBe(40);
    expect(record!.output.startsWith("line 21\n")).toBe(true);
    expect(record!.output.endsWith("line 60\n")).toBe(true);
  });

  it("journey 2 step 4: a cell evicted while setup runs leaves no running behind; the next boot writes failed with the sentence for it", { timeout: 30_000 }, async () => {
    await pasture("lost");
    await env.PASTURE.getByName("lost").put(SETUP_PATH, encode(SETUP_SCRIPT));
    // Held and never let go: the incarnation that was running this setup is gone, so nothing will ever report its end.
    const held = gate();
    const script: ScriptFor = (request) => (request.command.trim() === SETUP_COMMAND ? { steps: [{ act: async () => held.held }], exit: 0 } : undefined);
    const { id, stub } = await sessionIn("lost-tests", "lost", script);

    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      void runtime.env.exec("pnpm test", undefined, context).catch(() => undefined);
      const row = await until("the row says setup is running", () => rowOf(id), (value) => value.setup?.state === "running");
      const at = row.setup!.at;

      // The platform takes the isolate: every drive abandoned, the runtime forgotten, the socket with it.
      await cell.evict();
      // And the next touch boots a new one, which finds the row saying `running`.
      await cell.runtime();
      expect((await rowOf(id)).setup).toEqual({ state: "failed", at, error: SETUP_EVICTED });
      // The record for it is still there, saying what it knew: no dog waits on it, since the row is what says `running`.
      const [record] = await setupsOf(id);
      expect(record).toMatchObject({ at, command: SETUP_COMMAND, output: "" });
      expect(record!.ms).toBeUndefined();
    });
    // A second boot changes nothing: the row no longer says `running`, so nothing is written over its ending.
    await inCell(id, async (cell) => {
      await cell.evict();
      await cell.runtime();
      expect((await rowOf(id)).setup).toMatchObject({ state: "failed", error: SETUP_EVICTED });
      // Last, and inside the cell whose context the fake was made in: `evict()` is a seam, not the platform, so the
      // abandoned incarnation is still in this isolate and its `warm` would report the container's death over the row.
      stub.fakes.at(-1)?.stop("the test is over");
    });
  });

  it("journey 3: a sheep with no pasture and one with no setup.sh say nothing, and GET /sessions/<id> answers the row or 404s", { timeout: 30_000 }, async () => {
    // A sheep born into no pasture: no setup can run for it, and its row says so.
    const quiet = await env.DIRECTORY.getByName("home").create("quiet");
    expect(quiet.setup).toBeNull();
    expect((await rowOf(quiet.id)).setup).toBeNull();

    // A pasture with no `setup.sh`: the container path is what pasture phase 3 left it, and nothing is reported.
    await pasture("plain");
    await env.PASTURE.getByName("plain").put("BRIEF.md", encode("Be brief.\n"));
    const script: ScriptFor = (request) => (request.command.trim() === "pnpm test" ? { steps: [{ stdout: "1 passed\n" }], exit: 0 } : undefined);
    const { id, stub } = await sessionIn("plain-tests", "plain", script);
    await inCell(id, async (cell) => {
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      expect(stub.fakes.flatMap((fake) => fake.runs).map((run) => run.command)).toEqual(["pnpm test"]);
      (await cell.runtime()).lease!.idle();
    });
    expect((await rowOf(id)).setup).toBeNull();
    expect(await setupsOf(id)).toEqual([]);

    // The route: the row alone, the same one `GET /sessions` lists, and the home's sentence for a sheep it lacks.
    const listed = ((await (await api("/sessions")).json()) as SessionSummary[]).find((session) => session.id === id);
    expect(await rowOf(id)).toEqual(listed);
    const missing = await api(`/sessions/${quiet.id.replace(/.$/, "0")}-nope`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe(unknownSession(`${quiet.id.replace(/.$/, "0")}-nope`));
    // And it is the home's token's, as every other route but the container's door is.
    const unguarded = await SELF.fetch(`https://sheep.test/sessions/${id}`);
    expect(unguarded.status).toBe(401);
  });
});
