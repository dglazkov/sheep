import { env, runDurableObjectAlarm, runInDurableObject, SELF } from "cloudflare:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import { setFauxScript } from "../src/models.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

/**
 * write hello.txt, then edit it, then say done: five transitions
 * (provider, write, provider, edit, provider), decided from the transcript
 * so the script survives a reboot mid-turn.
 */
function scriptedTurn() {
  setFauxScript((conversation) => {
    const calls = conversation.messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.content.filter((part) => part.type === "toolCall").map((part) => part.name));
    if (!calls.includes("write")) {
      return fauxAssistantMessage([fauxToolCall("write", { path: "hello.txt", content: "hello from the cell\n" })], { stopReason: "toolUse" });
    }
    if (!calls.includes("edit")) {
      return fauxAssistantMessage([fauxToolCall("edit", { path: "hello.txt", edits: [{ oldText: "hello", newText: "hi" }] })], { stopReason: "toolUse" });
    }
    return fauxAssistantMessage("Done: wrote and edited hello.txt.");
  });
}

interface Outcome {
  killAt: number;
  roles: string[];
  stops: string[];
  toolResults: string[];
  effects: Record<string, number>;
  file: string | undefined;
  settled: boolean;
  wokeByAlarm: boolean;
}

async function runTurn(killAt: number): Promise<Outcome> {
  const summary = (await (await api("/sessions", { method: "POST", body: "{}" })).json()) as { id: string };
  const stub = env.SESSION_CELL.getByName(summary.id);
  await runInDurableObject(stub, (cell: SessionCell) => {
    cell.test.killAt = killAt;
  });
  await api(`/s/${summary.id}/prompt`, { method: "POST", body: JSON.stringify({ text: "make hello.txt then edit it" }) });

  // Give the turn time to reach the kill point and be abandoned, then wake the cell the way the platform would.
  let wokeByAlarm = false;
  if (killAt > 0) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    wokeByAlarm = await runDurableObjectAlarm(stub);
  }
  const settled = await runInDurableObject(stub, (cell: SessionCell) => cell.waitForIdle(10_000));
  return runInDurableObject(stub, async (cell: SessionCell) => {
    const view = await cell.transcript();
    const messages = view.entries.flatMap((entry) => (entry.type === "message" ? [entry.message] : []));
    let file: string | undefined;
    try {
      file = await cell.readFile("/workspace/hello.txt");
    } catch {
      file = undefined;
    }
    return {
      killAt,
      roles: messages.map((message) => message.role),
      stops: messages.flatMap((message) => (message.role === "assistant" ? [message.stopReason] : [])),
      toolResults: messages.flatMap((message) =>
        message.role === "toolResult" ? [message.content.map((part) => (part.type === "text" ? part.text : part.type)).join("|").slice(0, 120)] : [],
      ),
      effects: { ...cell.test.effects },
      file,
      settled: settled.operation === null,
      wokeByAlarm,
    };
  });
}

describe("journey 2: the turn outlives the cell", () => {
  beforeEach(scriptedTurn);

  it("settles to the same workspace whichever transition the cell died at", { timeout: 60_000 }, async () => {
    const baseline = await runTurn(0);
    expect(baseline).toMatchObject({
      settled: true,
      file: "hi from the cell\n",
      roles: ["user", "assistant", "toolResult", "assistant", "toolResult", "assistant"],
      stops: ["toolUse", "toolUse", "stop"],
      effects: { write: 1, edit: 1 },
    });

    for (let killAt = 1; killAt <= 5; killAt++) {
      const outcome = await runTurn(killAt);
      const label = `killAt=${killAt}: ${JSON.stringify(outcome)}`;
      // The alarm, not a client, is what brought the cell back.
      expect(outcome.wokeByAlarm, label).toBe(true);
      expect(outcome.settled, label).toBe(true);
      // The workspace ends the same, and no tool effect happened twice.
      expect(outcome.file, label).toBe(baseline.file);
      expect(outcome.effects, label).toEqual({ write: 1, edit: 1 });
      // The turn finished with the final answer.
      expect(outcome.stops.at(-1), label).toBe("stop");
      expect(outcome.roles.at(-1), label).toBe("assistant");
      if (killAt % 2 === 1) {
        // Died mid provider call: pi settles the orphaned request as interrupted, without a second call, and continues.
        expect(outcome.stops, label).toContain("error");
        expect(outcome.roles.length, label).toBe(baseline.roles.length + 1);
      } else {
        // Died after a tool's effect, before its outcome was durable: the call is settled as interrupted, never rerun.
        expect(outcome.toolResults.some((text) => text.startsWith("[Tool execution was interrupted")), label).toBe(true);
        expect(outcome.roles, label).toEqual(baseline.roles);
      }
    }
  });
});
