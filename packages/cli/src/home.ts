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
  /** The names of the secrets this sheep was minted with, sorted; `[]` for none; never a value (earmark phase 0). */
  secrets: string[];
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

/**
 * Fold phase 1: what `GET /p/<name>` says of the pasture's cache, from its
 * row alone: its size and files, the hash of the `setup.sh` whose run left
 * it, when it was kept and by which sheep, and whether that `setup.sh` is
 * the tree's now. `null` when nothing was ever kept.
 */
export interface PastureCache {
  bytes: number;
  files: number;
  setup: string;
  keptAt: number;
  by: string;
  current: boolean;
}

/** `GET /p/<name>`: the meta, the herd, the directory's rows for the sheep born there, and the cache (fold phase 1). */
export interface PastureView extends PastureMeta {
  herd: SessionSummary[];
  cache: PastureCache | null;
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

/** `DELETE /s/<id>`'s answer (end phase 1), the cell's `EndReport` passed through: `aborted` is whether the end found a turn to stop. */
export interface EndReport {
  ended: true;
  aborted: boolean;
}

/**
 * A refusal the home stated in a sentence: a 4xx with a text body, thrown
 * by `ask` as that sentence alone. Its own class so that a caller with a
 * failure of its own (a socket that would not open) can tell the home's
 * sentence from a home that did not answer at all.
 */
export class Sentence extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** `GET /home`'s `build`: the commit the Worker was built from and when; `builtAt` null and commit `0.0.0-checkout` from a checkout. */
export interface HomeBuild {
  commit: string;
  builtAt: string | null;
}

/** `GET /home`'s stamp and image together (station phase 2): `image` is the pen image the home's config named, by digest or by tag, and null from a checkout or a home from before it. */
export interface HomeStamp {
  build: HomeBuild;
  image: string | null;
  /** Station phase 4: whether the home has a container beside every cell, as `GET /home` reports it; null when it does not say. */
  container: boolean | null;
  /**
   * Eyes phase 2: whether the home has eyes, `look` in every sheep's shell,
   * as `GET /home` reports it; null when it does not say, which is a
   * station deployed before eyes phase 1. `sheep home` prints `no` for both.
   */
  eyes: boolean | null;
}

/** The home's HTTP face: the door, the directory, and one cell's routes. */
export class Home {
  readonly url: URL;
  readonly token: string | undefined;

  constructor(config: SheepConfig) {
    if (config.home === undefined) throw new Error("no home configured; pass --home <url>, set SHEEP_HOME, or run `sheep home local` to write this kennel's config");
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
    if (response.status >= 400 && response.status < 500 && body.length > 0 && response.status !== 401) throw new Sentence(body, response.status);
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${body}`);
  }

  /**
   * One cell's state, `GET /s/<id>/`, through `ask`: for a session the
   * home does not have, the refusal is its sentence. This is what
   * `attachSheep` asks when its socket failed (end phase 1), and nothing
   * on the happy path.
   */
  async session(id: string): Promise<unknown> {
    return (await this.ask(`/s/${encodeURIComponent(id)}/`)).json();
  }

  /** The end (end phase 1): `DELETE /s/<id>`. The home's refusal, a session it does not have, is thrown as its sentence. */
  async end(id: string): Promise<EndReport> {
    return (await (await this.ask(`/s/${encodeURIComponent(id)}`, { method: "DELETE" })).json()) as EndReport;
  }

  async serverId(): Promise<string> {
    const { serverId } = (await (await this.request("/home")).json()) as { serverId: string };
    return serverId;
  }

  /**
   * The home's build stamp from `GET /home` (station phase 0): what
   * `scripts/bundle.mjs` defined into its Worker, or `0.0.0-checkout` with
   * no time from a checkout's `wrangler dev`. A home from before the stamp
   * answers without one, and that is reported as unstamped too.
   */
  async build(): Promise<HomeBuild> {
    return (await this.stamp()).build;
  }

  /**
   * The stamp and the image from one `GET /home` (station phase 2): the
   * image is what `scripts/bundle.mjs` defined into the Worker beside the
   * stamp, the reference the shipped config names; a checkout, or a home
   * from before the field, answers none, and that is null. `container` and
   * `eyes` the same way: a boolean when the home says, null when it does not.
   */
  async stamp(): Promise<HomeStamp> {
    const answer = (await (await this.request("/home")).json()) as { build?: Partial<HomeBuild>; image?: unknown; container?: unknown; eyes?: unknown };
    const { build } = answer;
    const known = build && typeof build.commit === "string" && build.commit !== "" ? { commit: build.commit, builtAt: typeof build.builtAt === "string" ? build.builtAt : null } : { commit: "0.0.0-checkout", builtAt: null };
    return {
      build: known,
      image: typeof answer.image === "string" && answer.image !== "" ? answer.image : null,
      container: typeof answer.container === "boolean" ? answer.container : null,
      eyes: typeof answer.eyes === "boolean" ? answer.eyes : null,
    };
  }

  /** Every session, newest first; with a pasture, its herd: the sessions born into it. */
  async list(pasture?: string): Promise<SessionSummary[]> {
    const path = pasture === undefined ? "/sessions" : `/sessions?pasture=${encodeURIComponent(pasture)}`;
    return (await (await this.request(path)).json()) as SessionSummary[];
  }

  /**
   * A session, born into a pasture or into none. The directory's refusal is thrown as its sentence. With `secrets` (earmark
   * phase 1), the sheep's own, name to value, in the same one request; the answer carries their names, never a value.
   */
  async create(name: string | undefined, pasture?: string, secrets?: Record<string, string>): Promise<SessionSummary> {
    return (await (
      await this.ask("/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, pasture, secrets }) })
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

  /**
   * Sends a prompt and returns once it is durable: accepted as an
   * operation, or queued behind the running one. Through `ask` (end phase
   * 1), as the cell's other routes are, so a session the home does not have
   * is refused in its sentence.
   */
  async prompt(id: string, text: string): Promise<PromptResponse> {
    return (await (
      await this.ask(`/s/${encodeURIComponent(id)}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
    ).json()) as PromptResponse;
  }

  async transcript(id: string): Promise<TranscriptView> {
    return (await (await this.ask(`/s/${encodeURIComponent(id)}/transcript`)).json()) as TranscriptView;
  }

  async exportRows(id: string): Promise<Record<string, Record<string, unknown>[]>> {
    return (await (await this.ask(`/s/${encodeURIComponent(id)}/export`)).json()) as Record<string, Record<string, unknown>[]>;
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
