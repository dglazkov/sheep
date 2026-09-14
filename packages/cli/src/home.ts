import type { Entry } from "@earendil-works/pi-agent-core";
import type { SheepConfig } from "./config.js";
import type { SetupState } from "./setup-words.js";

/** What a cell last told the Directory its lane was doing. */
export type LaneState = "idle" | "running" | "waiting";

export type { SetupPhase, SetupState } from "./setup-words.js";

/**
 * One setup as the cell kept it (bleat phase 0's `SetupRecord`), handed to
 * `sheep log` beside the entries: the same facts with the command, the
 * output's tail, and fold's cache outcome. Never a pi entry, and no model
 * reads it.
 */
export interface SetupRecord {
  /** `setup-<the millisecond it started>`, the block's id and the cell's storage key. */
  id: string;
  at: number;
  ms?: number;
  command: string;
  exit?: number;
  error?: string;
  /** The tail, 40 lines and 16 KiB; `""` while setup runs, since the output is kept at the end. */
  output: string;
  truncated: boolean;
  /** Fold's `CacheOutcome`, passed through untouched; the block does not read it, `--json` carries it. */
  cache?: unknown;
}

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
  /**
   * Bleat phase 0: what this sheep's setup is doing, or how it last ended;
   * `null` for a sheep no setup has ever run for. Optional here and not on
   * the cell's row: a home deployed before bleat answers without the field,
   * and a dog's command must not fail because its home is older than it.
   */
  setup?: SetupState | null;
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
  /**
   * Bleat phase 0: this sheep's last twenty setups, oldest first, beside
   * the entries and never among them; `sheep log` merges them into what it
   * prints by time. Absent from a home deployed before bleat, which is why
   * it is optional and read as `[]`.
   */
  setups?: SetupRecord[];
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

/** The header a home from shear on sends on every response (shear phase 0): `<commit> <builtAt>`, the commit alone where it has no time. */
export const BUILD_HEADER = "x-sheep-build";

/** The build a `x-sheep-build` value names; undefined for no header, or one that names no commit. */
export function parseBuildHeader(value: string | null): HomeBuild | undefined {
  if (value === null) return undefined;
  const [commit, builtAt] = value.trim().split(/\s+/);
  return commit ? { commit, builtAt: builtAt || null } : undefined;
}

/**
 * The floor (shear phase 1): the `builtAt` of the oldest home whose routes
 * and wire this command speaks, an ISO time. It starts at shear phase 0's
 * release, the first to send the header, and moves by hand, to the release
 * that shipped the change, when a route is added, a route's answer changes
 * shape, or the pi pin moves (`/pi-bump` says to look at it).
 */
export const OLDEST_HOME = "2026-09-13T19:16:16Z";

/**
 * The sentence a refusal gains from a home below the floor (shear phase
 * 1), or undefined: only a 4xx other than 401, a verb the home may lack,
 * and only when the response's header is absent (a home from before the
 * header) or names a time older than the floor. A 5xx is a route that
 * failed, and workerd's own 500 carries no header; a 401 is the token; a
 * header with no time is a checkout's home, the checkout's own code.
 */
export function floorSentence(response: Response): string | undefined {
  if (response.status < 400 || response.status >= 500 || response.status === 401) return undefined;
  const build = parseBuildHeader(response.headers.get(BUILD_HEADER));
  if (build !== undefined && (build.builtAt === null || !(Date.parse(build.builtAt) < Date.parse(OLDEST_HOME)))) return undefined;
  const named = build === undefined ? "(a build from before the header)" : `${build.commit} (${build.builtAt})`;
  return `the home's build ${named} is older than this command speaks to; \`sheep home deploy\` from this package updates it`;
}

/** A refusal's text with the floor's sentence after it, when the response is below the floor: still one line. */
function withFloor(text: string, response: Response): string {
  const floor = floorSentence(response);
  return floor === undefined ? text : `${text.replace(/\s+$/, "")}; ${floor}`;
}

/** The home's HTTP face: the door, the directory, and one cell's routes. */
export class Home {
  readonly url: URL;
  readonly token: string | undefined;
  /**
   * The home's build as the first response's header named it (shear phase
   * 0): undefined until a response comes back, and after one from a home
   * that sends no header. Read at the command's end for the skew line.
   * Every socket a verb opens is preceded by `GET /home` (`serverId`),
   * which is where a socket-only verb's header is read: Node's WebSocket
   * does not expose the upgrade's headers.
   */
  homeBuild: HomeBuild | undefined;
  private heard = false;

  constructor(config: SheepConfig) {
    if (config.home === undefined) throw new Error("no home configured; pass --home <url>, set SHEEP_HOME, or run `sheep home local` to write this kennel's config");
    this.url = new URL(config.home);
    this.token = config.token;
  }

  /** The first response's `x-sheep-build`, kept; every later response passes through untouched. */
  private hear(response: Response): Response {
    if (!this.heard) {
      this.heard = true;
      this.homeBuild = parseBuildHeader(response.headers.get(BUILD_HEADER));
    }
    return response;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.token !== undefined) headers.set("authorization", `Bearer ${this.token}`);
    const response = this.hear(await fetch(new URL(path, this.url), { ...init, headers }));
    if (!response.ok) throw new Error(withFloor(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`, response));
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
    const response = this.hear(await fetch(new URL(path, this.url), { ...init, headers }));
    if (response.ok) return response;
    const body = await response.text();
    if (response.status >= 400 && response.status < 500 && body.length > 0 && response.status !== 401) throw new Sentence(withFloor(body, response), response.status);
    throw new Error(withFloor(`${init.method ?? "GET"} ${path}: ${response.status} ${body}`, response));
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

  /**
   * One sheep's row, `GET /sessions/<id>` (bleat phase 0): the Directory's
   * answer and never a cell's — exactly the row `GET /sessions` lists, for
   * one sheep. The Directory is what can answer while a cell is held by the
   * very setup the dog is asking about, which is why the live `setup` state
   * lives on the row and why this route exists. `session(id)` above is the
   * other one and waits on the cell. The home's refusal (an id it does not
   * have) is thrown as its sentence.
   */
  async row(id: string): Promise<SessionSummary> {
    return (await (await this.ask(`/sessions/${encodeURIComponent(id)}`)).json()) as SessionSummary;
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
