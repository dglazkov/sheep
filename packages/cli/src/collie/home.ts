/**
 * The collie Worker's client (collie phase 1), over `Home`'s shape in
 * `../home.ts`: the bearer on every request, the build header read from
 * the first response, and a refusal the Worker states thrown as a
 * `Sentence`, which the command prints as it is.
 *
 * The wire is the phase's contract with `packages/collie`, and nothing
 * else: every response carries `x-collie-build: <commit> <builtAt>` (the
 * format of `x-sheep-build`, read with `parseBuildHeader`); every route
 * but `GET /` wants `Authorization: Bearer <token>` and answers 401 in
 * text otherwise; a refusal is JSON `{ "error": "<one sentence>" }` with a
 * 4xx or 5xx. The sheep home's floor is the Worker's to apply, since it is
 * the Worker that talks to the station; its sentence arrives here as any
 * other refusal.
 */
import type { CollieConfig } from "../config.js";
import { type HomeBuild, parseBuildHeader, Sentence } from "../home.js";

/** The header the collie Worker sends on every response. */
export const COLLIE_BUILD_HEADER = "x-collie-build";

/** One canvas the collie stands by on. `address` is `<origin>/p/<canvasId>`. */
export interface Room {
  canvasId: string;
  title: string;
  origin: string;
  address: string;
}

/** One agent the collie answers for, on one room. */
export interface Agent {
  name: string;
  actorId: string;
  sheep: string | null;
  lane: "idle" | "running" | "waiting" | null;
  pasture: string | null;
  came: "born here" | "handed over";
  turnsLastHour: number;
}

/** `GET /home`. */
export interface CollieHomeView {
  build: HomeBuild;
  on: boolean;
  since: string | null;
  rooms: number;
}

/** `POST /passes`: a pass that admitted a canvas, or one that endowed an agent's claim. */
export type PassResult = { kind: "room"; room: Room; owner: string; already: boolean } | { kind: "agent"; agent: string; room: Room };

/** `GET /report`. */
export interface Report {
  on: boolean;
  since: string | null;
  limits: { turnsPerHour: number; chain: number };
  /** Each room with `owner`, the name of the person whose word the room takes, and its agents. */
  rooms: (Room & { owner: string; agents: Agent[] })[];
}

/** One row of the narration. */
export interface LogLine {
  seq: number;
  at: string;
  canvasId: string | null;
  title: string | null;
  line: string;
}

/** `GET /log`. */
export interface LogPage {
  lines: LogLine[];
  last: number;
}

/** A collie that did not answer at all: refused, unreachable, or cut off. Its own class, so a follow can ask again. */
export class Unreachable extends Error {}

export class CollieHome {
  readonly url: URL;
  private readonly token: string;
  /** The Worker's build as the first response's header named it; undefined until one comes back, or when it sent none. */
  build: HomeBuild | undefined;
  private heard = false;

  constructor(config: CollieConfig) {
    this.url = new URL(config.address);
    this.token = config.token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers({ authorization: `Bearer ${this.token}` });
    if (body !== undefined) headers.set("content-type", "application/json");
    let response: Response;
    try {
      response = await fetch(new URL(path, this.url), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : error instanceof Error ? error.message : String(error);
      throw new Unreachable(`the collie at ${this.url.origin} does not answer (${cause})`);
    }
    if (!this.heard) {
      this.heard = true;
      this.build = parseBuildHeader(response.headers.get(COLLIE_BUILD_HEADER));
    }
    const text = await response.text();
    if (!response.ok) {
      // The Worker's own sentence, as it said it: isocan's words for a spent pass, the station floor's, anything it refuses.
      if (response.status >= 400) {
        const error = errorOf(text);
        if (error !== undefined) throw new Sentence(error, response.status);
      }
      if (response.status === 401) throw new Sentence(`the collie at ${this.url.origin} refused this kennel's token (${method} ${path}: 401 ${text.trim()})`, 401);
      throw new Error(`${method} ${path}: ${response.status} ${text.trim()}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${method} ${path}: the collie answered ${response.status} with something that is not JSON: ${text.slice(0, 120)}`);
    }
  }

  home(): Promise<CollieHomeView> {
    return this.request("GET", "/home");
  }

  /** Hands the collie a pass by its address. The address is the body of one request and goes nowhere else. */
  passes(address: string): Promise<PassResult> {
    return this.request("POST", "/passes", { address });
  }

  report(): Promise<Report> {
    return this.request("GET", "/report");
  }

  log(options: { since?: number; last?: number }): Promise<LogPage> {
    const query = new URLSearchParams();
    if (options.since !== undefined) query.set("since", String(options.since));
    if (options.last !== undefined) query.set("last", String(options.last));
    const search = query.toString();
    return this.request("GET", search === "" ? "/log" : `/log?${search}`);
  }

  off(): Promise<{ on: false; rooms: Room[] }> {
    return this.request("POST", "/off");
  }

  on(): Promise<{ on: true; rooms: Room[] }> {
    return this.request("POST", "/on");
  }

  /** `DELETE /` (collie phase 2, `collie rm`): the badge at each isocan home ended, the rooms and rows dropped. */
  end(): Promise<{ ended: { origin: string; badge: string }[] }> {
    return this.request("DELETE", "/");
  }
}

/** A refusal's sentence, when the body is `{ "error": "<sentence>" }`; undefined for anything else. */
function errorOf(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string" && (parsed as { error: string }).error !== "") return (parsed as { error: string }).error;
  } catch {
    // not JSON: the status and the text say it
  }
  return undefined;
}
