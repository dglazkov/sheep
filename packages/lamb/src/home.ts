import type { Entry } from "@earendil-works/pi-agent-core";
import type { LambConfig } from "./config.js";

/** What a cell last told the Directory its lane was doing. */
export type LaneState = "idle" | "running" | "waiting";

export interface SessionSummary {
  id: string;
  name: string | null;
  createdAt: number;
  state: LaneState;
}

/** The cell's answer to `POST /prompt`: pi's `AgentOperationResponse`, or pi's `AgentQueueResponse` when the lane was busy. */
export type PromptResponse = { accepted: true; operationId: string; error: null } | { accepted: true; entryId: string; error: null };

/** `GET /s/<id>/transcript`: the lane's entries, pi's shape, with the open operation. */
export interface TranscriptView {
  id: string;
  tipId: string | null;
  operation: { id: string; kind: string; startedAt: number } | null;
  entries: Entry[];
}

/** The home's HTTP face: the door, the directory, and one cell's routes. */
export class Home {
  readonly url: URL;
  readonly token: string | undefined;

  constructor(config: LambConfig) {
    if (config.home === undefined) throw new Error("no home configured; pass --home <url>, set LAMB_HOME, or write ~/.lamb/config");
    this.url = new URL(config.home);
    this.token = config.token;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.token !== undefined) headers.set("authorization", `Bearer ${this.token}`);
    const response = await fetch(new URL(path, this.url), { ...init, headers });
    if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
    return response;
  }

  async serverId(): Promise<string> {
    const { serverId } = (await (await this.request("/home")).json()) as { serverId: string };
    return serverId;
  }

  async list(): Promise<SessionSummary[]> {
    return (await (await this.request("/sessions")).json()) as SessionSummary[];
  }

  async create(name: string | undefined): Promise<SessionSummary> {
    return (await (
      await this.request("/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) })
    ).json()) as SessionSummary;
  }

  /** Sends a prompt and returns once it is durable: accepted as an operation, or queued behind the running one. */
  async prompt(id: string, text: string): Promise<PromptResponse> {
    return (await (
      await this.request(`/s/${encodeURIComponent(id)}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
    ).json()) as PromptResponse;
  }

  async transcript(id: string): Promise<TranscriptView> {
    return (await (await this.request(`/s/${encodeURIComponent(id)}/transcript`)).json()) as TranscriptView;
  }

  async exportRows(id: string): Promise<Record<string, Record<string, unknown>[]>> {
    return (await (await this.request(`/s/${encodeURIComponent(id)}/export`)).json()) as Record<string, Record<string, unknown>[]>;
  }

  /** The WebSocket address of one cell, which lamb's client and the bridge dial. */
  socketUrl(id: string, _serverId: string): string {
    const url = new URL(`/s/${encodeURIComponent(id)}/ws`, this.url);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    if (this.token !== undefined) url.searchParams.set("token", this.token);
    return url.toString();
  }
}
