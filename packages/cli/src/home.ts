import type { Entry } from "@earendil-works/pi-agent-core";
import type { SheepConfig } from "./config.js";

/** What a cell last told the Directory its lane was doing. */
export type LaneState = "idle" | "running" | "waiting";

export interface SessionSummary {
  id: string;
  name: string | null;
  createdAt: number;
  state: LaneState;
  /** The pasture this sheep was born into; `null` for a pastureless sheep. */
  pasture: string | null;
  /** What it was asked: the first line of its first prompt, as the cell reported it; `null` until it does. */
  task: string | null;
}

export interface PastureSummary {
  name: string;
  createdAt: number;
}

export interface PastureMeta {
  name: string;
  repo: string | null;
  branch: string;
  createdAt: number;
}

/** `GET /p/<name>`: the meta and the herd, the directory's rows for the sheep born there. */
export interface PastureView extends PastureMeta {
  herd: SessionSummary[];
}

/** One row of a pasture's tree, as the home's manifest names it. */
export interface TreeEntry {
  path: string;
  kind: "file" | "directory" | "symlink";
  mode: number;
  hash: string | null;
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

  constructor(config: SheepConfig) {
    if (config.home === undefined) throw new Error("no home configured; pass --home <url>, set SHEEP_HOME, or write ~/.sheep/config");
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

  /**
   * The same, but a refusal the home states in a sentence (a 4xx with a
   * text body) is that sentence alone: the directory's refusal of a birth,
   * an unknown pasture, a file that is not there.
   */
  private async ask(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.token !== undefined) headers.set("authorization", `Bearer ${this.token}`);
    const response = await fetch(new URL(path, this.url), { ...init, headers });
    if (response.ok) return response;
    const body = await response.text();
    if (response.status >= 400 && response.status < 500 && body.length > 0 && response.status !== 401) throw new Error(body);
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${body}`);
  }

  async serverId(): Promise<string> {
    const { serverId } = (await (await this.request("/home")).json()) as { serverId: string };
    return serverId;
  }

  /** Every session, newest first; with a pasture, its herd: the sessions born into it. */
  async list(pasture?: string): Promise<SessionSummary[]> {
    const path = pasture === undefined ? "/sessions" : `/sessions?pasture=${encodeURIComponent(pasture)}`;
    return (await (await this.request(path)).json()) as SessionSummary[];
  }

  /** A session, born into a pasture or into none. The directory's refusal is thrown as its sentence. */
  async create(name: string | undefined, pasture?: string): Promise<SessionSummary> {
    return (await (
      await this.ask("/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, pasture }) })
    ).json()) as SessionSummary;
  }

  async pastures(): Promise<PastureSummary[]> {
    return (await (await this.request("/pastures")).json()) as PastureSummary[];
  }

  async createPasture(options: { name: string; repo?: string; branch?: string }): Promise<PastureMeta> {
    return (await (
      await this.ask("/pastures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(options) })
    ).json()) as PastureMeta;
  }

  async pasture(name: string): Promise<PastureView> {
    return (await (await this.ask(pasturePath(name))).json()) as PastureView;
  }

  async tree(name: string): Promise<TreeEntry[]> {
    return (await (await this.ask(`${pasturePath(name)}/tree`)).json()) as TreeEntry[];
  }

  async cat(name: string, path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.ask(`${pasturePath(name)}/tree/${treePath(path)}`)).arrayBuffer());
  }

  async put(name: string, path: string, content: Uint8Array): Promise<TreeEntry> {
    return (await (await this.ask(`${pasturePath(name)}/tree/${treePath(path)}`, { method: "PUT", body: content })).json()) as TreeEntry;
  }

  async rm(name: string, path: string): Promise<void> {
    await this.ask(`${pasturePath(name)}/tree/${treePath(path)}`, { method: "DELETE" });
  }

  /** Sets a secret's value; nothing ever reads it back through this face. */
  async setSecret(name: string, key: string, value: string): Promise<void> {
    await this.ask(`${pasturePath(name)}/secrets/${encodeURIComponent(key)}`, { method: "PUT", body: value });
  }

  async secretNames(name: string): Promise<string[]> {
    return (await (await this.ask(`${pasturePath(name)}/secrets`)).json()) as string[];
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

  /** The WebSocket address of one cell, which sheep's client and the bridge dial. */
  socketUrl(id: string, _serverId: string): string {
    const url = new URL(`/s/${encodeURIComponent(id)}/ws`, this.url);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    if (this.token !== undefined) url.searchParams.set("token", this.token);
    return url.toString();
  }
}

function pasturePath(name: string): string {
  return `/p/${encodeURIComponent(name)}`;
}

/** A tree path in a URL: each segment encoded, the slashes kept. */
function treePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
