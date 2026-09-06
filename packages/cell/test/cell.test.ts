import { env, runInDurableObject, SELF } from "cloudflare:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import { setFauxScript } from "../src/models.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

/** A turn that writes a file when asked, then says it did. Decided from the transcript, not call order. */
function scriptedTurn() {
  setFauxScript((conversation) => {
    const messages = conversation.messages;
    const wrote = messages.some((message) => message.role === "assistant" && message.content.some((part) => part.type === "toolCall" && part.name === "write"));
    if (!wrote) return fauxAssistantMessage([fauxToolCall("write", { path: "hello.txt", content: "hello from the cell\n" })], { stopReason: "toolUse" });
    return fauxAssistantMessage("Wrote hello.txt.");
  });
}

describe("the home's door and directory", () => {
  it("refuses without the token and answers with it", async () => {
    expect((await SELF.fetch("https://sheep.test/sessions")).status).toBe(401);
    const created = await api("/sessions", { method: "POST", body: JSON.stringify({ name: "scratch" }) });
    expect(created.status).toBe(201);
    const summary = (await created.json()) as { id: string; name: string };
    expect(summary.name).toBe("scratch");
    const listed = (await (await api("/sessions")).json()) as Array<{ id: string }>;
    expect(listed.map((session) => session.id)).toContain(summary.id);
    expect((await api("/s/nope/")).status).toBe(404);
  });
});

describe("a cell drives a turn on its own event loop", () => {
  beforeEach(scriptedTurn);

  it("accepts a prompt, runs the tool, settles, and reads back the file and the transcript", async () => {
    const summary = (await (await api("/sessions", { method: "POST", body: "{}" })).json()) as { id: string };
    const base = `/s/${summary.id}`;
    const accepted = (await (await api(`${base}/prompt`, { method: "POST", body: JSON.stringify({ text: "make hello.txt" }) })).json()) as { operationId: string };
    expect(accepted.operationId).toMatch(/\S/);

    const stub = env.SESSION_CELL.getByName(summary.id);
    const settled = await runInDurableObject(stub, (cell: SessionCell) => cell.waitForIdle(10_000));
    expect(settled.operation).toBeNull();
    // Idle means no heartbeat: the cell may hibernate for free.
    const alarm = await runInDurableObject(stub, (_cell, state) => state.storage.getAlarm());
    expect(alarm).toBeNull();

    const file = await api(`${base}/file?path=/workspace/hello.txt`);
    expect(await file.text()).toBe("hello from the cell\n");

    const view = (await (await api(`${base}/transcript`)).json()) as { entries: Array<{ type: string; message?: { role: string } }> };
    const roles = view.entries.filter((entry) => entry.type === "message").map((entry) => entry.message!.role);
    expect(roles).toEqual(["user", "assistant", "toolResult", "assistant"]);

    const dump = (await (await api(`${base}/export`)).json()) as Record<string, unknown[]>;
    expect(dump.sessions).toHaveLength(1);
    expect(dump.entries!.length).toBeGreaterThanOrEqual(4);
  });
});
