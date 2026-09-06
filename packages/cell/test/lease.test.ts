/**
 * pen phase 3: the lease and the door, in workerd. The pool cannot bind a
 * `PenContainer` (the top-level config has no container, on purpose, and
 * the class refuses to construct without one), so the cell is given a
 * starter through its test seam: in place of starting a container it
 * dials the cell's real `GET /s/<id>/pen?token=…` over `SELF.fetch` with
 * the upgrade and serves the real agent on the client end. Everything
 * else is the real thing: the mint, the door, the token spent on use, the
 * lease's socket, the start and kill deadlines, the Directory's minutes
 * and the budget's sentence, and pi's bash tool over the lease.
 */
import { BACKGROUND_CONTEXT, createBashTool, getOrThrow } from "@earendil-works/pi-agent-core";
import { Client } from "@earendil-works/pi-client";
import { AgentController } from "@earendil-works/pi-coding-agent/experimental/services/agent-controller";
import { createServerServiceSource, createSessionServiceSource } from "@earendil-works/pi-coding-agent/experimental/services/connection";
import { SessionManagement } from "@earendil-works/pi-coding-agent/experimental/services/sessions";
import { Transcript } from "@earendil-works/pi-coding-agent/experimental/services/transcript";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import type { Budget } from "../src/directory.ts";
import type { FauxProgram } from "../src/models.ts";
import { BUDGET_SPENT_NOTICE, killUnanswered, shellSystemPromptLine } from "../src/env/programs.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { type FakeContainer, type ScriptFor, serveFakeOn } from "./fake-container.ts";
import { adoptedSocketTransport } from "./ws-transport.ts";

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

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://lamb.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await sleep(20);
  }
}

const INSTALL_LINES = ["Progress: resolved 12, reused 0, downloaded 12, added 12\n", "Packages: +12\n", "Done in 1.3s\n"];

const projectScript: ScriptFor = (request) => {
  const command = request.command.trim();
  if (command === "pnpm install") {
    return {
      steps: [
        { wait: 30, stdout: INSTALL_LINES[0] },
        { wait: 30, stdout: INSTALL_LINES[1], act: (disk) => disk.putFile("node_modules/left-pad/index.js", "module.exports = (s) => s;\n") },
        { wait: 30, stdout: INSTALL_LINES[2], act: (disk) => disk.putFile("pnpm-lock.yaml", "lockfileVersion: '9.0'\n") },
      ],
      exit: 0,
    };
  }
  if (command === "pnpm test") return { steps: [{ wait: 30, stdout: "1 passed\n" }], exit: 0 };
  if (command === "pnpm run chatty") return { steps: Array.from({ length: 30 }, (_unused, index) => ({ wait: 50, stdout: `line ${index}\n` })), exit: 0 };
  if (command === "pnpm run forever") return { steps: [{ stdout: "started\n" }, { wait: 60_000, stdout: "never\n" }], exit: 0 };
  return undefined;
};

/** What the test's starter saw: the real dials it made, and the fakes it serves. */
interface Stub {
  starter: ContainerStarter;
  ensures: Array<{ cellUrl: string; token: string }>;
  renews: number;
  destroys: number;
  fakes: Array<Omit<FakeContainer, "socket">>;
  /** The status of the last dial, for the door's answers. */
  dials: number[];
}

interface StubOptions {
  script?: ScriptFor;
  deaf?: boolean;
  /** Never dial in: a container that starts and never connects. */
  silent?: boolean;
  /** Dial with this token instead of the minted one. */
  tokenOverride?: (minted: string) => string;
}

/**
 * The container's half, without a container: on `ensure`, dial the door
 * the way the image's agent does, and serve the agent on what comes back.
 * The dial is not awaited, as a real start returns before the container
 * has booted; the rent waits for the door.
 */
function stubStarter(sessionId: string, options: StubOptions = {}): Stub {
  // Stubs are I/O objects of the context that made them; make them where they are used, inside the cell.
  const directory = () => env.DIRECTORY.getByName("home");
  const stub: Stub = {
    ensures: [],
    renews: 0,
    destroys: 0,
    fakes: [],
    dials: [],
    starter: {
      async ensure(args) {
        stub.ensures.push(args);
        if (options.silent) return { started: true };
        void (async () => {
          await sleep(10);
          const token = options.tokenOverride === undefined ? args.token : options.tokenOverride(args.token);
          const response = await SELF.fetch(`${args.cellUrl}?token=${encodeURIComponent(token)}`, { headers: { upgrade: "websocket" } });
          stub.dials.push(response.status);
          if (response.status !== 101) return;
          const socket = response.webSocket!;
          socket.accept();
          const fake = serveFakeOn(socket, { ...(options.script === undefined ? {} : { script: options.script }), deaf: options.deaf ?? false });
          stub.fakes.push(fake);
          await directory().containerOpened(sessionId, Date.now());
          void fake.closed.then(() => directory().containerClosed(sessionId, Date.now()));
        })();
        return { started: true };
      },
      async renew() {
        stub.renews++;
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

/** A session whose cell rents from the stub. The starter is set before the cell's first boot. */
async function sessionWith(name: string, options: StubOptions = {}): Promise<{ id: string; stub: Stub }> {
  const { id } = await env.DIRECTORY.getByName("home").create(name);
  const stub = stubStarter(id, options);
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

/** pi's bash tool over the cell's env, as the harness would call it. */
async function bash(cell: SessionCell, command: string, options: { timeout?: number } = {}) {
  const runtime = await cell.runtime();
  const updates: string[] = [];
  const result = await bashTool.execute(
    "call",
    { command, ...(options.timeout === undefined ? {} : { timeout: options.timeout }) },
    (update) => updates.push(text(update as { content: Array<{ type: string; text?: string }> })),
    { env: runtime.env },
    invocation,
    context,
  );
  return { result, text: text(result), updates };
}

describe("the lease and the door", () => {
  it("rent() resolves with the socket the /pen route accepted, the token is spent, and a second rent reuses the socket", async () => {
    const { id, stub } = await sessionWith("rent", { script: projectScript });
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      const lease = runtime.lease!;
      // The pool binds the loader, so every cell here has tier 1 too; nothing is up until a rent.
      expect(runtime.env.home).toEqual({ container: true, isolate: true, containerUp: false });
      expect(lease.socket).toBeUndefined();

      const socket = await lease.rent();
      expect(socket).toBe(lease.socket);
      expect(stub.ensures.length).toBe(1);
      expect(stub.ensures[0]!.cellUrl).toBe(`https://lamb.test/s/${id}/pen`);
      // The rent resolves inside the door's handling, before the 101 returns to the dialer; let it land.
      await until(() => stub.dials.length === 1);
      expect(stub.dials).toEqual([101]);
      expect(lease.lastStartMs).toBeGreaterThanOrEqual(0);
      console.info(`pen phase 3: the fake connected ${lease.lastStartMs} ms after the rent, through the real door`);

      // The token was spent on use: the same dial again is refused.
      const again = await SELF.fetch(`${stub.ensures[0]!.cellUrl}?token=${stub.ensures[0]!.token}`, { headers: { upgrade: "websocket" } });
      expect(again.status).toBe(403);

      // A second rent while the socket is open: the same socket, a renewal, no new container.
      const second = await lease.rent();
      expect(second).toBe(socket);
      expect(stub.ensures.length).toBe(1);
      await until(() => stub.renews >= 1);
      lease.idle();
    });
  });

  it("the door: a wrong token is 403, the home's LAMB_TOKEN is 403, no upgrade is 426, an unknown session is 404, and the other routes still need the home's token", async () => {
    const { id, stub } = await sessionWith("door", { script: projectScript });
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      const pending = runtime.lease!.rent();
      await until(() => stub.ensures.length === 1);
      const cellUrl = stub.ensures[0]!.cellUrl;
      // Before the container dials in, other tokens knock.
      expect((await SELF.fetch(`${cellUrl}?token=not-the-one`, { headers: { upgrade: "websocket" } })).status).toBe(403);
      expect((await SELF.fetch(`${cellUrl}?token=test-token`, { headers: { upgrade: "websocket" } })).status).toBe(403);
      expect((await SELF.fetch(`${cellUrl}?token=test-token`, { headers: { upgrade: "websocket", authorization: "Bearer test-token" } })).status).toBe(403);
      expect((await SELF.fetch(`${cellUrl}?token=${stub.ensures[0]!.token}`)).status).toBe(426);
      expect((await SELF.fetch(`https://lamb.test/s/nobody/pen?token=x`, { headers: { upgrade: "websocket" } })).status).toBe(404);
      // The right one, from the stub, is the one that opened the door.
      await pending;
      await until(() => stub.dials.length === 1);
      expect(stub.dials).toEqual([101]);
      runtime.lease!.idle();
    });
    // The pen door opens nothing else: the cell's other routes still want the home's token.
    expect((await SELF.fetch(`https://lamb.test/s/${id}/transcript`)).status).toBe(401);
    expect((await SELF.fetch(`https://lamb.test/s/${id}/transcript?token=wrong`)).status).toBe(401);
    expect((await SELF.fetch(`https://lamb.test/s/${id}/`)).status).toBe(401);
  });

  it("a socket close, then a rent, mints a new token and starts again; a container that never dials in fails the rent at the start deadline", async () => {
    const { id, stub } = await sessionWith("again", { script: projectScript });
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      const lease = runtime.lease!;
      const first = await lease.rent();
      lease.idle();
      await until(() => stub.fakes.length === 1);
      stub.fakes[0]!.stop("stopped as idle");
      await until(() => lease.socket === undefined);
      const second = await lease.rent();
      expect(second).not.toBe(first);
      expect(stub.ensures.length).toBe(2);
      expect(stub.ensures[1]!.token).not.toBe(stub.ensures[0]!.token);
      await until(() => stub.fakes.length === 2);
      expect(stub.dials).toEqual([101, 101]);
      lease.idle();
      stub.fakes[1]!.stop();
      await until(() => lease.socket === undefined);
    });

    const silent = await sessionWith("silent", { silent: true });
    await inCell(silent.id, async (cell) => {
      const runtime = await cell.runtime();
      const started = Date.now();
      await expect(runtime.lease!.rent()).rejects.toThrow("the container did not connect within 2 s");
      expect(Date.now() - started).toBeGreaterThanOrEqual(1_900);
      expect(silent.stub.ensures.length).toBe(1);
      // Through the shell, that is a command that could not run, saying why.
      const result = await runtime.env.exec("pnpm install", { capture: { limits: { maxBytes: 4096, maxLines: 100 } } }, context);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("shell_unavailable");
        expect(result.error.message).toBe("no container could be rented: the container did not connect within 2 s");
      }
    });
  });

  it("the kill deadline: a run that ignores kill is given up after PEN_KILL_TIMEOUT, the container destroyed, and the next command rents anew", async () => {
    const { id, stub } = await sessionWith("deaf", { script: projectScript, deaf: true });
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      getOrThrow(await runtime.env.writeFile("package.json", '{"name":"p"}\n', context));
      const started = Date.now();
      await expect(bash(cell, "pnpm run forever", { timeout: 0.3 })).rejects.toThrow(`started\n\n\n${killUnanswered("timeout", 1)}`);
      const took = Date.now() - started;
      expect(took).toBeGreaterThanOrEqual(1_200);
      expect(took).toBeLessThan(5_000);
      await until(() => stub.destroys === 1);
      expect(runtime.lease!.socket).toBeUndefined();
      // The next command: a new token, a new container, and the tests run.
      const tests = await bash(cell, "pnpm test");
      expect(tests.text).toBe("1 passed\n");
      expect(stub.ensures.length).toBe(2);
      expect(stub.ensures[1]!.token).not.toBe(stub.ensures[0]!.token);
      runtime.lease!.idle();
    });
  });
});

describe("pen journey 1 steps 1 to 3 over the lease, through the home's HTTP face", () => {
  it("a faux turn runs pnpm install and pnpm test in the fake it rented through the door, then find in tier 0 shows no node_modules", { timeout: 30_000 }, async () => {
    const { id, stub } = await sessionWith("j1", { script: projectScript });
    const program: FauxProgram = {
      steps: [
        { tool: { name: "bash", args: { command: "printf '{\"name\":\"p\"}\\n' > package.json" } } },
        { tool: { name: "bash", args: { command: "pnpm install" } } },
        { tool: { name: "bash", args: { command: "pnpm test" } } },
        { tool: { name: "bash", args: { command: "find . -maxdepth 1 | sort" } } },
        { text: "installed and tested" },
      ],
    };
    expect((await api(`/s/${id}/faux`, { method: "POST", body: JSON.stringify(program) })).status).toBe(200);
    const accepted = (await (await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "Install the dependencies and run the tests." }) })).json()) as {
      operationId?: string;
    };
    expect(typeof accepted.operationId).toBe("string");
    await inCell(id, (cell) => cell.waitForIdle(20_000));

    const view = (await (await api(`/s/${id}/transcript`)).json()) as {
      entries: Array<{ type: string; message?: { role: string; content: Array<{ type: string; text?: string; content?: Array<{ type: string; text?: string }> }> } }>;
    };
    const toolResults = view.entries
      .filter((entry) => entry.type === "message" && entry.message?.role === "toolResult")
      .map((entry) => JSON.stringify(entry.message!.content));
    expect(toolResults.length).toBe(4);
    expect(toolResults[1]).toContain(INSTALL_LINES[0]!.trim());
    expect(toolResults[1]).toContain("Done in 1.3s");
    expect(toolResults[2]).toContain("1 passed");
    expect(toolResults[3]).toContain("./package.json");
    expect(toolResults[3]).toContain("./pnpm-lock.yaml");
    expect(toolResults[3]).not.toContain("node_modules");
    const last = view.entries.at(-1)!.message!;
    expect(last.role).toBe("assistant");
    expect(last.content[0]!.text).toBe("installed and tested");

    // One container for the turn, rented through the real door; node_modules on its disk and not in the rows.
    expect(stub.ensures.length).toBe(1);
    expect(stub.dials).toEqual([101]);
    expect(stub.fakes[0]!.disk.entries.has("node_modules/left-pad/index.js")).toBe(true);
    expect(await (await api(`/s/${id}/file?path=/workspace/pnpm-lock.yaml`)).text()).toBe("lockfileVersion: '9.0'\n");
    expect((await api(`/s/${id}/file?path=/workspace/node_modules`)).status).toBe(500);
    // The minutes: the stub reported the start, so the home's counter is running.
    const budget = (await (await api("/home")).json()) as Budget;
    expect(budget.containerMinutes).toBeGreaterThan(0);
    expect(budget.spent).toBe(false);
  });
});

describe("lamb wait over the wire, attached while a container command streams", () => {
  it("a client that attaches mid-stream gets the hydrated snapshot with the live bash update, and the turn's end", { timeout: 30_000 }, async () => {
    const { id } = await sessionWith("wire", { script: projectScript });
    const program: FauxProgram = {
      steps: [{ tool: { name: "bash", args: { command: "pnpm run chatty" } } }, { text: "chatted" }],
    };
    expect((await api(`/s/${id}/faux`, { method: "POST", body: JSON.stringify(program) })).status).toBe(200);
    await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "Run the chatty script." }) });
    // Let the container be rented and the output start streaming, then attach as `lamb wait` does.
    await sleep(400);

    const { serverId } = (await (await api("/home")).json()) as { serverId: string };
    const response = await SELF.fetch(`https://lamb.test/s/${id}/ws?token=test-token`, { headers: { upgrade: "websocket" } });
    const socket = response.webSocket!;
    socket.accept();
    const client = await Client.connect({ serverId, transportFactory: adoptedSocketTransport(socket) });
    const server = createServerServiceSource(client);
    const session = createSessionServiceSource(client);
    const serverServices = server.open({ services: [SessionManagement], assertAccess() {}, onError() {} });
    const errors: string[] = [];
    const sessionServices = session.open({ services: [AgentController, Transcript], assertAccess() {}, onError: (error: unknown) => errors.push(String(error)) });
    const management = serverServices.use(SessionManagement);
    const transcript = sessionServices.use(Transcript);
    await Promise.all([serverServices.ready(BACKGROUND_CONTEXT), sessionServices.ready(BACKGROUND_CONTEXT)]);
    await management.attach(id, BACKGROUND_CONTEXT);
    await session.whenAttached(id, BACKGROUND_CONTEXT);

    // The replica hydrates from the invoke result: the running operation, its streamed bash update inside.
    let sawRunning = false;
    const idle = new Promise<void>((resolve) => {
      const unsubscribe = transcript.state.subscribe((state) => {
        const snapshot = state.snapshot;
        if (snapshot === null || snapshot === undefined) return;
        if (snapshot.operation !== null) sawRunning = true;
        else {
          unsubscribe();
          resolve();
        }
      });
    });
    await idle;
    expect(sawRunning).toBe(true);
    expect(errors).toEqual([]);
    await inCell(id, (cell) => cell.waitForIdle(10_000));
    const view = (await (await api(`/s/${id}/transcript`)).json()) as { entries: Array<{ message?: { role: string; content: Array<{ text?: string }> } }> };
    expect(view.entries.at(-1)!.message!.content[0]!.text).toBe("chatted");
    await Promise.allSettled([server.dispose(BACKGROUND_CONTEXT), session.dispose(BACKGROUND_CONTEXT)]);
    await client.dispose();
  });
});

/**
 * Last on purpose: the pool does not isolate the Directory's storage
 * between tests, and minutes only ever grow, so once the budget is spent
 * here every later cell with a starter would be refused.
 */
describe("the budget", () => {
  it("the budget: once the Directory's minutes reach PEN_BUDGET_MINUTES, tier-2 lines are refused with the sentence, the prompt line agrees, and /home says so", async () => {
    const { id, stub } = await sessionWith("budget", { script: projectScript });
    const directory = env.DIRECTORY.getByName("home");
    const before = (await (await api("/home")).json()) as Budget & { serverId: string };
    expect(before.budgetMinutes).toBe(2);
    expect(before.spent).toBe(false);

    // A container of another session has run three minutes, reported by whoever started it.
    await directory.containerOpened("some-other-session", Date.now() - 3 * 60_000);
    const spent = (await (await api("/home")).json()) as Budget;
    expect(spent.containerMinutes).toBeGreaterThanOrEqual(3);
    expect(spent.spent).toBe(true);

    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      const home = await runtime.env.homeNow();
      expect(home).toEqual({ container: true, isolate: true, containerUp: false, budgetSpent: true });
      // The refusal is up front, names the budget, and rents nothing.
      await expect(bash(cell, "pnpm install")).rejects.toThrow(`bash: pnpm: command not found (${BUDGET_SPENT_NOTICE})\n\n\nCommand exited with code 127`);
      expect(stub.ensures.length).toBe(0);
      // The prompt line says the same sentence, byte for byte, and the table's line for a container is gone from it.
      const line = shellSystemPromptLine(home);
      expect(line).toContain(BUDGET_SPENT_NOTICE);
      expect(line).not.toContain("runs in the container instead");
      // Tier 0 is unaffected.
      getOrThrow(await runtime.env.writeFile("a.txt", "a\n", context));
      expect((await bash(cell, "cat a.txt")).text).toBe("a\n");
    });

    // The other container stops: its three minutes are the total, still spent.
    await directory.containerClosed("some-other-session", Date.now());
    const after = (await (await api("/home")).json()) as Budget;
    expect(after.containerMinutes).toBeGreaterThanOrEqual(3);
    expect(after.spent).toBe(true);
    // Earlier tests' fakes are still counted as running, so the total keeps creeping; the two reads are a breath apart.
    expect(Math.abs((await directory.containerMinutes()) - after.containerMinutes)).toBeLessThan(0.01);
  });
});
