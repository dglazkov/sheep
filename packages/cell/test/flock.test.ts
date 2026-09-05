/**
 * lamb phase 5, the cell's half: the Directory's state column is the
 * cell's report at each lane transition, whoever drives the lane; a prompt
 * to a busy lane is pi's follow-up, not a refusal; an abort settles the
 * turn as aborted; and a home can be scripted from outside its isolate.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/pi-agent-core";
import { Client } from "@earendil-works/pi-client";
import { AgentController } from "@earendil-works/pi-coding-agent/experimental/services/agent-controller";
import { createServerServiceSource, createSessionServiceSource } from "@earendil-works/pi-coding-agent/experimental/services/connection";
import { SessionManagement } from "@earendil-works/pi-coding-agent/experimental/services/sessions";
import { Transcript } from "@earendil-works/pi-coding-agent/experimental/services/transcript";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import type { SessionSummary } from "../src/directory.ts";
import type { FauxProgram } from "../src/models.ts";
import { adoptedSocketTransport } from "./ws-transport.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://lamb.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function mint(name: string, program?: FauxProgram): Promise<string> {
  const { id } = (await (await api("/sessions", { method: "POST", body: JSON.stringify({ name }) })).json()) as { id: string };
  if (program !== undefined) expect((await api(`/s/${id}/faux`, { method: "POST", body: JSON.stringify(program) })).status).toBe(200);
  return id;
}

async function stateOf(id: string): Promise<string> {
  const sessions = (await (await api("/sessions")).json()) as SessionSummary[];
  return sessions.find((session) => session.id === id)!.state;
}

/** The Directory is told by an RPC the cell does not await; give it a moment. */
async function stateBecomes(id: string, wanted: string, timeoutMs = 3_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let state = await stateOf(id);
  while (state !== wanted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    state = await stateOf(id);
  }
  return state;
}

async function roles(id: string): Promise<Array<[string, string | undefined]>> {
  const view = (await (await api(`/s/${id}/transcript`)).json()) as {
    entries: Array<{ id: string; type: string; message?: { role: string; stopReason?: string } }>;
  };
  return view.entries.filter((entry) => entry.type === "message").map((entry) => [entry.message!.role, entry.message!.stopReason]);
}

function idle(id: string) {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => cell.waitForIdle(10_000));
}

const SLOW_TOOL_TURN: FauxProgram = {
  steps: [{ tool: { name: "bash", args: { command: "echo herding > note.txt && cat note.txt" } } }, { text: "done: note.txt written", delayMs: 600 }],
};

describe("the Directory knows each lane's state without waking the cell", () => {
  it("reports idle, running, and idle again through the HTTP face, and a busy lane queues the second prompt", { timeout: 30_000 }, async () => {
    const id = await mint("docs", SLOW_TOOL_TURN);
    expect(await stateOf(id)).toBe("idle");

    const first = (await (await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "write the note" }) })).json()) as Record<string, unknown>;
    expect(first).toMatchObject({ accepted: true, error: null });
    expect(typeof first.operationId).toBe("string");
    expect(await stateBecomes(id, "running")).toBe("running");

    // The lane is busy in the second step's delay: pi's follow-up, taken up when the turn ends.
    const second = (await (await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "and again" }) })).json()) as Record<string, unknown>;
    expect(second).toMatchObject({ accepted: true, error: null });
    expect(typeof second.entryId).toBe("string");
    expect(second.operationId).toBeUndefined();

    await idle(id);
    expect(await stateBecomes(id, "idle")).toBe("idle");
    const alarm = await runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) => state.storage.getAlarm());
    expect(alarm).toBeNull();

    // One operation: the first turn, then the queued user message, then its answer.
    const transcript = await roles(id);
    expect(transcript.map(([role]) => role)).toEqual(["user", "assistant", "toolResult", "assistant", "user", "assistant", "toolResult", "assistant"]);
    const view = (await (await api(`/s/${id}/transcript`)).json()) as { entries: Array<{ id: string }> };
    expect(view.entries.some((entry) => entry.id === second.entryId)).toBe(true);
  });

  it("an abort settles the turn as aborted and the lane idles for the next prompt", { timeout: 30_000 }, async () => {
    const id = await mint("types", { steps: [{ text: "this takes a while", delayMs: 20_000 }] });
    await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "go" }) });
    expect(await stateBecomes(id, "running")).toBe("running");
    const aborted = (await (await api(`/s/${id}/abort`, { method: "POST" })).json()) as { aborted: boolean };
    expect(aborted.aborted).toBe(true);
    await idle(id);
    expect(await stateBecomes(id, "idle")).toBe("idle");
    const transcript = await roles(id);
    expect(transcript.at(-1)).toEqual(["assistant", "aborted"]);
    // Idle for the next prompt: accepted as an operation, not queued.
    const next = (await (await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "again" }) })).json()) as Record<string, unknown>;
    expect(typeof next.operationId).toBe("string");
    await idle(id);
  });

  it("a turn driven over the wire reports and arms the heartbeat the same way", { timeout: 30_000 }, async () => {
    const id = await mint("tests", { steps: [{ text: "hello over the wire", delayMs: 600 }] });
    const { serverId } = (await (await api("/home")).json()) as { serverId: string };
    const response = await SELF.fetch(`https://lamb.test/s/${id}/ws?token=test-token`, { headers: { upgrade: "websocket" } });
    const socket = response.webSocket!;
    socket.accept();
    const client = await Client.connect({ serverId, transportFactory: adoptedSocketTransport(socket) });
    const server = createServerServiceSource(client);
    const session = createSessionServiceSource(client);
    const serverServices = server.open({ services: [SessionManagement], assertAccess() {}, onError() {} });
    const sessionServices = session.open({ services: [AgentController, Transcript], assertAccess() {}, onError() {} });
    const management = serverServices.use(SessionManagement);
    const agent = sessionServices.use(AgentController);
    await Promise.all([serverServices.ready(BACKGROUND_CONTEXT), sessionServices.ready(BACKGROUND_CONTEXT)]);
    await management.attach(id, BACKGROUND_CONTEXT);
    await session.whenAttached(id, BACKGROUND_CONTEXT);

    // pi's `prompt` over the wire resolves at the end of the operation, so look while it runs.
    const prompted = agent.prompt({ message: "say hello", images: null }, BACKGROUND_CONTEXT);
    expect(await stateBecomes(id, "running")).toBe("running");
    const armed = await runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) => state.storage.getAlarm());
    expect(armed).not.toBeNull();
    const result = await prompted;
    expect(result.accepted).toBe(true);
    expect(await stateBecomes(id, "idle")).toBe("idle");
    const cleared = await runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) => state.storage.getAlarm());
    expect(cleared).toBeNull();
    await Promise.allSettled([server.dispose(BACKGROUND_CONTEXT), session.dispose(BACKGROUND_CONTEXT)]);
    await client.dispose();
  });

  it("a cell without a program of its own answers from the home's default", { timeout: 30_000 }, async () => {
    expect((await api("/faux", { method: "POST", body: JSON.stringify({ steps: [{ text: "from the home's default" }] }) })).status).toBe(200);
    try {
      const id = await mint("default");
      await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "hi" }) });
      await idle(id);
      const view = (await (await api(`/s/${id}/transcript`)).json()) as { entries: Array<{ message?: { role: string; content: Array<{ text?: string }> } }> };
      const last = view.entries.at(-1)!.message!;
      expect(last.role).toBe("assistant");
      expect(last.content[0]!.text).toBe("from the home's default");
    } finally {
      expect((await api("/faux", { method: "POST", body: "null" })).status).toBe(200);
    }
    expect((await api("/faux", { method: "POST", body: JSON.stringify({ steps: [] }) })).status).toBe(400);
  });
});
