/**
 * Drove phase 1: the peek, `POST /s/<id>/sh`, in workerd, through the
 * Worker's router as a dog's request comes. Checkout ring: the home is the
 * pool's, the container is the fake container, and the town is a `fetch`
 * set on the cell, so no network and no process is involved.
 *
 * The route's shape: `{ line, stdin? }`, stdin the bytes as base64,
 * answered `{ stdout, stderr, exit }`, the two streams apart and the code
 * as the line gave it, stdin reaching the line byte for byte, bytes that
 * are not UTF-8 among them, a body that is not a peek a 400, an id the
 * home lacks the router's sentence. A peek is not a turn: no entry, no
 * model call. While a turn is open it is a 409 with the one sentence, and
 * after an abort the same peek runs. `town` given bytes that are not UTF-8
 * is §7's order: exit 3 on a sheep with no grant, exit 1 and the program's
 * line on one with a grant. A prompt that arrives while a peek runs waits
 * for it, and so does a tool's line started in the env directly: the turn's
 * first tool call starts only once the peek has answered.
 *
 * Journey 4 step 5 against the fake container: a pastured sheep's peek of a
 * line the table sends to the container runs there, with setup before it as
 * a tool's first line has it, stdin carried in the `run` frame, and the
 * container's two streams and code are the answer; `town`, tier 0, still
 * runs in just-bash on that home, and neither the shell's `env` nor any
 * answer holds the grant's token.
 */
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, it } from "vitest";
import { midTurnPeek, type SessionCell } from "../src/cell.ts";
import { type SessionSummary, unknownSession } from "../src/directory.ts";
import { SETUP_COMMAND, SETUP_PATH } from "../src/env/execution-env.ts";
import { NO_GRANT, STDIN_NOT_UTF8, TOWN_GRANT, type TownFetch } from "../src/env/town-command.ts";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import { setFauxScript } from "../src/models.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { type FakeContainer, type ScriptFor, serveFakeOn } from "./fake-container.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const TOKEN = "peek-token-4b8e1d6a2c9f4073-held-by-the-program";
const ORIGIN = "http://127.0.0.1:7300";

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function mint(body: Record<string, unknown> = {}): Promise<string> {
  const response = await api("/sessions", { method: "POST", body: JSON.stringify(body) });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as SessionSummary).id;
}

/** Bytes as the route takes them: base64. A string is its UTF-8 bytes. */
function b64(bytes: string | Uint8Array): string {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...raw));
}

/** One peek over the route: the status, and the body as JSON when it is one, else as text. */
async function peek(id: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await api(`/s/${id}/sh`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

/** A town as a `fetch` answering the check shop's `cat` with the stdin it was sent. */
function catTown(): { fetch: TownFetch; bodies: string[] } {
  const bodies: string[] = [];
  return {
    bodies,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const body = await request.text();
      bodies.push(body);
      const sent = JSON.parse(body) as { stdin: string | null };
      return Response.json({ stdout: sent.stdin ?? "", stderr: "", exit: 0 });
    },
  };
}

describe("drove phase 1: the peek's route", () => {
  it("§7's order through the route: a sheep with no grant and stdin that is not UTF-8 is the grant's refusal, exit 3", async () => {
    const id = await mint();
    expect(await peek(id, { line: "town conform cat", stdin: b64(new Uint8Array([0xff, 0xfe])) })).toEqual({ status: 200, body: { stdout: "", stderr: `${NO_GRANT}\n`, exit: 3 } });
  });

  it("answers { stdout, stderr, exit } with the streams apart and the line's code, carries stdin byte for byte, and writes no entry", async () => {
    let calls = 0;
    setFauxScript(() => {
      calls++;
      return fauxAssistantMessage("ok");
    });
    const id = await mint();

    expect(await peek(id, { line: "echo hello; echo oops >&2; exit 4" })).toEqual({ status: 200, body: { stdout: "hello\n", stderr: "oops\n", exit: 4 } });
    expect(await peek(id, { line: "cat | od -c", stdin: b64("a\tb\n") })).toMatchObject({ status: 200, body: { stderr: "", exit: 0 } });
    const od = (await peek(id, { line: "cat | od -c", stdin: b64("a\tb\n") })).body as { stdout: string };
    expect(od.stdout).toContain("\\t");
    expect(od.stdout).toContain("\\n");
    // Text that is not ASCII, quotes, a backslash, a carriage return, and no newline at the end: exactly what went in.
    const text = 'héllo·wörld "quoted" \\ back\r\nlast';
    expect(await peek(id, { line: "cat", stdin: b64(text) })).toEqual({ status: 200, body: { stdout: text, stderr: "", exit: 0 } });
    // Bytes that are not UTF-8 reach the line as bytes.
    const raw = (await peek(id, { line: "cat | od -c", stdin: b64(new Uint8Array([0xff, 0xfe])) })).body as { stdout: string; exit: number };
    expect(raw.exit).toBe(0);
    expect(raw.stdout).toMatch(/^0000000\s+377\s+376\n/);
    // The empty line runs nothing.
    expect(await peek(id, { line: "" })).toEqual({ status: 200, body: { stdout: "", stderr: "", exit: 0 } });
    // A program the shell lacks, on a home with no container: the shell's own not-found line and 127.
    const missing = (await peek(id, { line: "git status" })).body as { stdout: string; stderr: string; exit: number };
    expect(missing.exit).toBe(127);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toMatch(/git/);

    // Not a turn: the transcript is empty and the model was never called.
    const view = (await (await api(`/s/${id}/transcript`)).json()) as { entries: unknown[]; operation: unknown };
    expect(view.entries).toEqual([]);
    expect(view.operation).toBeNull();
    expect(calls).toBe(0);
    // The files a peek writes are the sheep's, as a tool's would be.
    expect(await peek(id, { line: "echo kept > peeked.txt" })).toMatchObject({ status: 200, body: { exit: 0 } });
    expect(await (await api(`/s/${id}/file?path=/workspace/peeked.txt`)).text()).toBe("kept\n");
  });

  it("refuses a body that is not a peek with a 400, and an id the home lacks with the router's sentence", async () => {
    const id = await mint();
    expect(await peek(id, "not json")).toMatchObject({ status: 400 });
    expect(await peek(id, { stdin: "x" })).toMatchObject({ status: 400 });
    expect(await peek(id, { line: "true", stdin: 7 })).toMatchObject({ status: 400 });
    expect(await peek(id, { line: "true", stdin: "not base64!" })).toMatchObject({ status: 400 });
    expect(await peek("nosuch", { line: "true" })).toEqual({ status: 404, body: unknownSession("nosuch") });
  });

  it("is a 409 with the one sentence while a turn is open, and runs once the turn is aborted", async () => {
    const id = await mint();
    // This cell's model holds its answer for a minute, so the turn is observably open.
    expect((await api(`/s/${id}/faux`, { method: "POST", body: JSON.stringify({ steps: [{ text: "slow", delayMs: 60_000 }] }) })).status).toBe(200);
    expect((await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "take your time" }) })).status).toBe(200);
    const deadline = Date.now() + 10_000;
    for (;;) {
      const state = (await (await api(`/s/${id}/`)).json()) as { operation: unknown };
      if (state.operation !== null || Date.now() > deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const refused = await api(`/s/${id}/sh`, { method: "POST", body: JSON.stringify({ line: "true" }) });
    expect(refused.status).toBe(409);
    expect(await refused.text()).toBe(midTurnPeek(id));
    expect((await api(`/s/${id}/abort`, { method: "POST" })).status).toBe(200);
    const settled = await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => cell.waitForIdle(10_000));
    expect(settled.operation).toBeNull();
    expect(await peek(id, { line: "true" })).toEqual({ status: 200, body: { stdout: "", stderr: "", exit: 0 } });
  });

  it("gives `town` the peek's stdin as a pipe would, and no answer holds the grant", async () => {
    const id = await mint({ secrets: { [TOWN_GRANT]: JSON.stringify({ town: ORIGIN, token: TOKEN }) } });
    const town = catTown();
    await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
      cell.test.fetch = town.fetch;
    });
    const text = "he said \"hi\" and\tleft\\ a backslash,\r\nand two lines after\n\n";
    expect(await peek(id, { line: "town conform cat", stdin: b64(text) })).toEqual({ status: 200, body: { stdout: text, stderr: "", exit: 0 } });
    expect(JSON.parse(town.bodies[0]!)).toEqual({ argv: ["conform", "cat"], stdin: text, json: false });
    expect(await peek(id, { line: "town conform cat" })).toEqual({ status: 200, body: { stdout: "", stderr: "", exit: 0 } });
    expect(JSON.parse(town.bodies[1]!)).toMatchObject({ stdin: null });
    // Bytes that are not UTF-8: the program's refusal, exit 1, after the grant was found, and nothing posted.
    expect(await peek(id, { line: "town conform cat", stdin: b64(new Uint8Array([0x68, 0xff, 0xfe, 0x0a])) })).toEqual({ status: 200, body: { stdout: "", stderr: `${STDIN_NOT_UTF8}\n`, exit: 1 } });
    expect(town.bodies).toHaveLength(2);
    const shown = await peek(id, { line: "env" });
    expect(shown.status).toBe(200);
    expect(JSON.stringify(shown.body)).not.toContain(TOKEN);
    expect(JSON.stringify(shown.body)).not.toContain(TOWN_GRANT);
  });
});

/** The container's half without a container, as `town.test.ts` has it: dial the real door on `ensure`, serve the fake on what comes back. */
function stubStarter(sessionId: string, script: ScriptFor): { starter: ContainerStarter; fakes: Array<Omit<FakeContainer, "socket">> } {
  const directory = () => env.DIRECTORY.getByName("home");
  const fakes: Array<Omit<FakeContainer, "socket">> = [];
  return {
    fakes,
    starter: {
      async ensure(args) {
        void (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          const response = await SELF.fetch(`${args.cellUrl}?token=${encodeURIComponent(args.token)}`, { headers: { upgrade: "websocket" } });
          if (response.status !== 101) return;
          const socket = response.webSocket!;
          socket.accept();
          const fake = serveFakeOn(socket, { script });
          fakes.push(fake);
          await directory().containerOpened(sessionId, Date.now());
          void fake.closed.then(() => directory().containerClosed(sessionId, Date.now()));
        })();
        return { started: true };
      },
      async renew() {
        return { running: fakes.length > 0 };
      },
      async destroy() {
        fakes.at(-1)?.stop("destroyed");
      },
    },
  };
}

describe("drove phase 1, journey 4 step 5: a peek is the shell, whole", () => {
  it("runs a pastured sheep's container line in the container, setup first, stdin in the run frame, and answers with the container's streams and code", { timeout: 60_000 }, async () => {
    expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name: "peek-herd" }) })).status).toBe(201);
    await env.PASTURE.getByName("peek-herd").put(SETUP_PATH, new TextEncoder().encode("#!/bin/sh\ntrue\n"));
    const id = await mint({ pasture: "peek-herd", secrets: { [TOWN_GRANT]: JSON.stringify({ town: ORIGIN, token: TOKEN }) } });
    const script: ScriptFor = (request) => {
      const command = request.command.trim();
      if (command === SETUP_COMMAND) return { steps: [{ stdout: "setting up\n" }], exit: 0 };
      if (command === "ls / && git status") return { steps: [{ stdout: "bin\n" }, { stderr: "fatal: not a git repository\n" }, { stdout: "workspace\n" }], exit: 128 };
      if (command === "git apply") return { steps: [{ stdout: `read ${request.stdin === undefined ? 0 : atob(request.stdin).length} bytes\n` }], exit: 0 };
      return undefined;
    };
    const stub = stubStarter(id, script);
    const town = catTown();
    await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
      cell.test.starter = stub.starter;
      cell.test.fetch = town.fetch;
    });

    // `git` is a program the shell lacks, so a line naming it runs whole in the container, starting one.
    const applied = await peek(id, { line: "git apply", stdin: b64("diff --git a/x b/x\n") });
    expect(applied).toEqual({ status: 200, body: { stdout: "read 19 bytes\n", stderr: "", exit: 0 } });
    const binary = new Uint8Array([0x00, 0xff, 0xfe, 0x80, 0x0a]);
    expect(await peek(id, { line: "git apply", stdin: b64(binary) })).toEqual({ status: 200, body: { stdout: "read 5 bytes\n", stderr: "", exit: 0 } });
    const listed = await peek(id, { line: "ls / && git --version" });
    expect(listed.status).toBe(200);

    const runs = stub.fakes.flatMap((fake) => fake.runs);
    // Setup ran first, as it does before a tool's first container line; the peek's line after it, with its stdin in the frame.
    expect(runs[0]!.command).toBe(SETUP_COMMAND);
    expect(runs[0]!.stdin).toBeUndefined();
    // The frame carries the bytes as base64, exactly: text, and bytes that are no text.
    expect(runs[1]).toMatchObject({ command: "git apply", stdin: b64("diff --git a/x b/x\n") });
    expect(runs[2]).toMatchObject({ command: "git apply", stdin: b64(binary) });
    expect(runs[3]!.command).toBe("ls / && git --version");

    // A line the container answers with both streams and a code: the answer is those, apart, and that code.
    expect(await peek(id, { line: "ls / && git status" })).toEqual({ status: 200, body: { stdout: "bin\nworkspace\n", stderr: "fatal: not a git repository\n", exit: 128 } });
    expect(stub.fakes.flatMap((fake) => fake.runs).at(-1)!.command).toBe("ls / && git status");
    // `ls /` alone is all tier 0, so the table keeps it in just-bash with a container up, as it keeps a tool's: the cell's root.
    expect(await peek(id, { line: "ls /" })).toEqual({ status: 200, body: { stdout: "home\npasture\ntmp\nworkspace\n", stderr: "", exit: 0 } });

    // `town` is tier 0 on this home too: it runs in just-bash and posts, and no container run names it.
    expect(await peek(id, { line: "town conform cat", stdin: b64("hi\n") })).toEqual({ status: 200, body: { stdout: "hi\n", stderr: "", exit: 0 } });
    expect(stub.fakes.flatMap((fake) => fake.runs).some((run) => run.command.includes("town"))).toBe(false);

    // No run frame and no answer holds the grant.
    for (const run of stub.fakes.flatMap((fake) => fake.runs)) expect(JSON.stringify(run)).not.toContain(TOKEN);
    const shown = await peek(id, { line: "env" });
    expect(JSON.stringify(shown.body)).not.toContain(TOKEN);
    await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => (await cell.runtime()).lease?.close("done"));
  });
});

describe("drove phase 1: a dog and the model never share the shell at once", () => {
  const invocation = {
    invocationId: "inv",
    operationId: "op",
    turnId: "turn",
    async getMemo() {
      return undefined;
    },
    async setMemo() {},
  };

  /** A town whose `held` call answers only when released; every arrival, and whatever the test adds, in one ordered list. */
  function heldTown(): { fetch: TownFetch; events: string[]; release: () => void } {
    const events: string[] = [];
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    return {
      events,
      release: () => release(),
      fetch: async (input, init) => {
        const sent = JSON.parse(await new Request(input, init).text()) as { argv: string[] };
        events.push(`town ${sent.argv.join(" ")}`);
        if (sent.argv[0] === "held") await released;
        return Response.json({ stdout: `${sent.argv.join(" ")}\n`, stderr: "", exit: 0 });
      },
    };
  }

  async function until(check: () => boolean, ms = 10_000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timed out");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it("a prompt that arrives while a peek runs is taken after the peek answers, and its first tool call starts after that", { timeout: 60_000 }, async () => {
    const id = await mint({ secrets: { [TOWN_GRANT]: JSON.stringify({ town: ORIGIN, token: TOKEN }) } });
    const town = heldTown();
    await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
      cell.test.fetch = town.fetch;
    });
    setFauxScript((conversation) => {
      if (conversation.messages.at(-1)?.role === "toolResult") return fauxAssistantMessage("done");
      return fauxAssistantMessage([fauxToolCall("bash", { command: "town second" })], { stopReason: "toolUse" });
    });

    const peeking = peek(id, { line: "town held" }).then((answer) => {
      town.events.push("peek answered");
      return answer;
    });
    await until(() => town.events.includes("town held"));
    const prompting = api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "run town" }) });
    // Held a while: the prompt has arrived, and nothing of its turn has reached the shell.
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(town.events).toEqual(["town held"]);

    town.release();
    expect(await peeking).toEqual({ status: 200, body: { stdout: "held\n", stderr: "", exit: 0 } });
    expect((await prompting).status).toBe(200);
    const settled = await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => cell.waitForIdle(20_000));
    expect(settled.operation).toBeNull();
    expect(town.events).toEqual(["town held", "peek answered", "town second"]);
  });

  it("a tool's line started in the env while a peek runs waits for the peek, whoever drives the turn", { timeout: 60_000 }, async () => {
    const id = await mint({ secrets: { [TOWN_GRANT]: JSON.stringify({ town: ORIGIN, token: TOKEN }) } });
    const town = heldTown();
    const events = await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => {
      cell.test.fetch = town.fetch;
      const runtime = await cell.runtime();
      const peeking = runtime.env.peek("town held").then((answer) => {
        town.events.push("peek answered");
        return answer;
      });
      await until(() => town.events.includes("town held"));
      const tool = createBashTool().execute("call", { command: "town second" }, () => {}, { env: runtime.env }, invocation, BACKGROUND_CONTEXT).then(() => town.events.push("tool answered"));
      await new Promise((resolve) => setTimeout(resolve, 500));
      const before = [...town.events];
      town.release();
      await Promise.all([peeking, tool]);
      return { before, after: town.events };
    });
    expect(events.before).toEqual(["town held"]);
    expect(events.after).toEqual(["town held", "peek answered", "town second", "tool answered"]);
  });
});
