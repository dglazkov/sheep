import type { LambConfig } from "./config.js";

export interface SessionSummary {
  id: string;
  name: string | null;
  createdAt: number;
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

  async exportRows(id: string): Promise<Record<string, Record<string, unknown>[]>> {
    return (await (await this.request(`/s/${encodeURIComponent(id)}/export`)).json()) as Record<string, Record<string, unknown>[]>;
  }

  /** The address `pi client --connect` dials for one cell. */
  socketUrl(id: string, serverId: string): string {
    const url = new URL(`/s/${encodeURIComponent(id)}/ws`, this.url);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    if (this.token !== undefined) url.searchParams.set("token", this.token);
    url.searchParams.set("serverId", serverId);
    return url.toString();
  }
}
