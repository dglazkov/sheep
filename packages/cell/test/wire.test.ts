import { BACKGROUND_CONTEXT } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Client } from "@earendil-works/pi-client";
import { AgentController } from "@earendil-works/pi-coding-agent/experimental/services/agent-controller";
import { createServerServiceSource, createSessionServiceSource } from "@earendil-works/pi-coding-agent/experimental/services/connection";
import { Models } from "@earendil-works/pi-coding-agent/experimental/services/models";
import { PresentationPlugins } from "@earendil-works/pi-coding-agent/experimental/services/plugins";
import { SessionDirectory, SessionManagement } from "@earendil-works/pi-coding-agent/experimental/services/sessions";
import { Transcript } from "@earendil-works/pi-coding-agent/experimental/services/transcript";
import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { setFauxScript } from "../src/models.ts";
import { adoptedSocketTransport } from "./ws-transport.ts";

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

/** A terminal, as pi's experimental client builds one, minus the rendering. */
async function attachTerminal(sessionId: string, serverId: string) {
  const response = await SELF.fetch(`https://sheep.test/s/${sessionId}/ws?token=test-token`, { headers: { upgrade: "websocket" } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  socket.accept();
  const client = await Client.connect({ serverId, transportFactory: adoptedSocketTransport(socket) });
  const server = createServerServiceSource(client);
  const session = createSessionServiceSource(client);
  const serverServices = server.open({ services: [SessionDirectory, SessionManagement, PresentationPlugins], assertAccess() {}, onError() {} });
  const sessionServices = session.open({ services: [Models, AgentController, Transcript], assertAccess() {}, onError() {} });
  const directory = serverServices.use(SessionDirectory);
  const management = serverServices.use(SessionManagement);
  const plugins = serverServices.use(PresentationPlugins);
  const agent = sessionServices.use(AgentController);
  const transcript = sessionServices.use(Transcript);
  await Promise.all([serverServices.ready(BACKGROUND_CONTEXT), sessionServices.ready(BACKGROUND_CONTEXT)]);
  await plugins.prepareSession({ sessionId, packagePaths: null }, BACKGROUND_CONTEXT);
  await management.attach(sessionId, BACKGROUND_CONTEXT);
  await session.whenAttached(sessionId, BACKGROUND_CONTEXT);
  const updates: string[] = [];
  transcript.state.subscribe((value) => {
    updates.push(value.event?.type ?? "hydrate");
  });
  return {
    client,
    directory,
    management,
    agent,
    transcript,
    updates,
    roles: () => (transcript.state.value?.snapshot?.transcript ?? []).flatMap((entry) => (entry.type === "message" ? [entry.message.role] : [])),
    async waitForIdle(timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const snapshot = transcript.state.value?.snapshot;
        if (snapshot !== undefined && snapshot !== null && snapshot.operation === null && snapshot.transcript.length > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("terminal never saw the lane idle");
    },
    async close() {
      await Promise.allSettled([server.dispose(BACKGROUND_CONTEXT), session.dispose(BACKGROUND_CONTEXT)]);
      await client.dispose();
    },
  };
}

describe("journey 3: two terminals on one session, over pi's protocol on a WebSocket", () => {
  beforeEach(() => {
    setFauxScript(() => fauxAssistantMessage("hello from the cell"));
  });

  it("both terminals see the same transcript, either can prompt, and one leaving changes nothing for the other", { timeout: 30_000 }, async () => {
    const summary = (await (await api("/sessions", { method: "POST", body: JSON.stringify({ name: "wire" }) })).json()) as { id: string };
    const { serverId } = (await (await api("/home")).json()) as { serverId: string };

    const nadia = await attachTerminal(summary.id, serverId);
    const theo = await attachTerminal(summary.id, serverId);
    expect(nadia.directory.state.value?.sessions.map((session) => session.sessionId)).toContain(summary.id);

    const accepted = await nadia.agent.prompt({ message: "say hello", images: null }, BACKGROUND_CONTEXT);
    expect(accepted.accepted).toBe(true);
    await Promise.all([nadia.waitForIdle(), theo.waitForIdle()]);
    expect(nadia.roles()).toEqual(["user", "assistant"]);
    expect(theo.roles()).toEqual(nadia.roles());
    expect(theo.updates.length).toBeGreaterThan(1);

    // Theo prompts too; Nadia sees it.
    const second = await theo.agent.prompt({ message: "again", images: null }, BACKGROUND_CONTEXT);
    expect(second.accepted).toBe(true);
    await Promise.all([nadia.waitForIdle(), theo.waitForIdle()]);
    expect(nadia.roles()).toEqual(["user", "assistant", "user", "assistant"]);

    // Theo leaves; Nadia notices nothing and can still prompt.
    await theo.close();
    const third = await nadia.agent.prompt({ message: "once more", images: null }, BACKGROUND_CONTEXT);
    expect(third.accepted).toBe(true);
    await nadia.waitForIdle();
    expect(nadia.roles()).toHaveLength(6);
    await nadia.close();
  });

  it("survives a tool call: bash's first progress update carries an undefined, which the wire must not choke on", async () => {
    setFauxScript((conversation) => {
      const ranBash = conversation.messages.some(
        (message) => message.role === "assistant" && message.content.some((part) => part.type === "toolCall" && part.name === "bash"),
      );
      return ranBash
        ? fauxAssistantMessage("listed")
        : fauxAssistantMessage([fauxToolCall("bash", { command: "echo hello > a.txt && ls" })], { stopReason: "toolUse" });
    });
    const summary = (await (await api("/sessions", { method: "POST", body: "{}" })).json()) as { id: string };
    const { serverId } = (await (await api("/home")).json()) as { serverId: string };
    const terminal = await attachTerminal(summary.id, serverId);
    const accepted = await terminal.agent.prompt({ message: "list the workspace", images: null }, BACKGROUND_CONTEXT);
    expect(accepted.accepted).toBe(true);
    await terminal.waitForIdle();
    expect(terminal.client.connected).toBe(true);
    expect(terminal.roles()).toEqual(["user", "assistant", "toolResult", "assistant"]);
    await terminal.close();
  });

  it("refuses the upgrade without the token", async () => {
    const summary = (await (await api("/sessions", { method: "POST", body: "{}" })).json()) as { id: string };
    const response = await SELF.fetch(`https://sheep.test/s/${summary.id}/ws`, { headers: { upgrade: "websocket" } });
    expect(response.status).toBe(401);
  });
});
