/**
 * sheep's own client for the one-shot commands: pi's `Client` over a
 * WebSocket to one cell, with pi's own services activated the way pi's
 * experimental client activates them. A program reads the transcript
 * replica and calls the agent controller; nothing here is a new message
 * on pi's protocol. The interactive terminal is still pi's TUI through the
 * bridge.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { AgentMessage, Entry, LaneTranscriptSnapshot } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { type ByteTransport, type ByteTransportFactory, type ByteTransportHandlers, Client } from "@earendil-works/pi-client";
import { AgentController } from "@earendil-works/pi-coding-agent/experimental/services/agent-controller";
import { createServerServiceSource, createSessionServiceSource } from "@earendil-works/pi-coding-agent/experimental/services/connection";
import { PresentationPlugins } from "@earendil-works/pi-coding-agent/experimental/services/plugins";
import { SessionManagement } from "@earendil-works/pi-coding-agent/experimental/services/sessions";
import { Transcript, type TranscriptState } from "@earendil-works/pi-coding-agent/experimental/services/transcript";
import type { Home } from "./home.js";

export { BACKGROUND_CONTEXT };

/** pi's byte transport over a WebSocket: one protocol frame per binary message. */
export function webSocketTransport(url: string): ByteTransportFactory {
  return (handlers: ByteTransportHandlers) =>
    new Promise<ByteTransport>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      let opened = false;
      let closed = false;
      let tail = Promise.resolve();
      socket.addEventListener("open", () => {
        opened = true;
        resolve({
          async send(chunk) {
            if (closed) throw new Error("transport closed");
            socket.send(chunk);
          },
          close() {
            if (closed) return;
            closed = true;
            socket.close(1000, "client closed");
          },
        });
      });
      socket.addEventListener("message", (event) => {
        const data: unknown = event.data;
        tail = tail
          .then(async () => {
            if (closed) return;
            if (data instanceof ArrayBuffer) handlers.onData(new Uint8Array(data));
            else if (typeof data === "string") throw new Error("text frames are not part of pi's protocol");
            else handlers.onData(new Uint8Array(await (data as Blob).arrayBuffer()));
          })
          .catch((error: unknown) => handlers.onError(error instanceof Error ? error : new Error(String(error))));
      });
      socket.addEventListener("close", () => {
        if (closed) return;
        closed = true;
        handlers.onClose();
      });
      socket.addEventListener("error", () => {
        const error = new Error(`WebSocket to ${url.replace(/token=[^&]+/, "token=…")} failed`);
        if (!opened) reject(error);
        else handlers.onError(error);
      });
    });
}

export interface Sheep {
  readonly id: string;
  readonly agent: AgentController;
  readonly transcript: Transcript;
  /** The replica's current snapshot; hydrated by the time the attachment is ready. */
  snapshot(): LaneTranscriptSnapshot;
  /** Resolves with the first non-undefined `read` of the state, now or at any later delivery. */
  until<T>(read: (state: TranscriptState) => T | undefined, signal?: AbortSignal): Promise<T>;
  close(): Promise<void>;
}

/** One attachment to one cell, as pi's non-interactive client makes it. */
export async function attachSheep(home: Home, id: string): Promise<Sheep> {
  const serverId = await home.serverId();
  const client = await Client.connect({ serverId, transportFactory: webSocketTransport(home.socketUrl(id, serverId)) });
  const server = createServerServiceSource(client);
  const session = createSessionServiceSource(client);
  const serverServices = server.open({ services: [SessionManagement, PresentationPlugins], assertAccess() {}, onError() {} });
  const sessionServices = session.open({ services: [AgentController, Transcript], assertAccess() {}, onError() {} });
  const management = serverServices.use(SessionManagement);
  const plugins = serverServices.use(PresentationPlugins);
  const agent = sessionServices.use(AgentController);
  const transcript = sessionServices.use(Transcript);
  const close = async (): Promise<void> => {
    await Promise.allSettled([server.dispose(BACKGROUND_CONTEXT), session.dispose(BACKGROUND_CONTEXT)]);
    await client.dispose();
  };
  try {
    await Promise.all([serverServices.ready(BACKGROUND_CONTEXT), sessionServices.ready(BACKGROUND_CONTEXT)]);
    await plugins.prepareSession({ sessionId: id, packagePaths: null }, BACKGROUND_CONTEXT);
    await management.attach(id, BACKGROUND_CONTEXT);
    await session.whenAttached(id, BACKGROUND_CONTEXT);
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }
  const snapshot = (): LaneTranscriptSnapshot => {
    const value = transcript.state.value?.snapshot;
    if (value === null || value === undefined) throw new Error(`session ${id}: the transcript has no snapshot yet`);
    return value;
  };
  return {
    id,
    agent,
    transcript,
    snapshot,
    until(read, signal) {
      return new Promise((resolve, reject) => {
        const current = transcript.state.value;
        if (current !== undefined) {
          const found = read(current);
          if (found !== undefined) return resolve(found);
        }
        const unsubscribe = transcript.state.subscribe((value) => {
          const found = read(value);
          if (found === undefined) return;
          unsubscribe();
          signal?.removeEventListener("abort", onAbort);
          resolve(found);
        });
        const onAbort = (): void => {
          unsubscribe();
          reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
        };
        if (signal?.aborted) return onAbort();
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
    close,
  };
}

/** The text of a user, assistant, or tool-result message; other pi messages have none. */
export function messageText(message: AgentMessage | AssistantMessage): string {
  if (message.role !== "user" && message.role !== "assistant" && message.role !== "toolResult") return "";
  if (typeof message.content === "string") return message.content;
  return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}

/** The last assistant message entry, if any. */
export function lastAssistant(entries: readonly Entry[]): Extract<Entry, { type: "message" }> | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (entry.type === "message" && entry.message.role === "assistant") return entry;
  }
  return undefined;
}
