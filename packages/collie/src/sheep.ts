/**
 * `SheepCommands` over the station's routes (collie phase 1): the verbs
 * isocan's `SheepAgent` speaks, as HTTP to the sheep home the kennel named,
 * with its token. What a laptop does with `spawn("sheep", …)` the collie
 * does with `fetch`, and with exactly the routes a dog's `sheep` already
 * speaks, so the station gains nothing (design.md, "Prompting a sheep, over
 * HTTP").
 *
 *   sessions      GET /sessions
 *   session       GET /sessions/<id>          bleat's row, the setup state on it
 *   pastures      GET /pastures
 *   pastureNew    POST /pastures
 *   pasturePut    PUT /p/<name>/tree/<path>
 *   pastureSecret PUT /p/<name>/secrets/<KEY>
 *   mint          POST /sessions               the sheep's own secrets in the one body (earmark)
 *   attach        POST /s/<id>/prompt, then GET /s/<id>/transcript?wait=25000&tip=<tip> until the operation ends
 *   rm            DELETE /s/<id>
 *   abort         POST /s/<id>/abort
 *
 * **The follow.** The prompt is accepted as an operation (or queued behind a
 * running one), and the transcript long poll answers when the tip moves or
 * the operation ends; each entry after the tip the follow started from is
 * handed on once by id. While it follows, the sheep's row is asked every ten
 * seconds and its setup said as `sheep attach` says it on stderr, in bleat's own words (`setup-words.ts`): the
 * first sighting of a running setup, again every thirty seconds, and its end.
 *
 * **The resume rule's host half.** The room re-summons a batch whose cursor
 * never advanced, which is what an eviction mid-turn leaves; the turn itself
 * is the cell's and ran on. So before the prompt is sent, the transcript's tip
 * is kept under `turn:<sheep>` in the collie's state, and the mark is taken
 * off when the follow ends. An `attach` that finds the mark prompts nothing:
 * it follows the turn already sent from the tip it was sent at, so the cursor
 * advances once when that turn ends. Only when the summons carries an entry
 * isocan does not mark `redelivered` (it landed while the collie was away,
 * after the batch the running turn holds) is the summons sent after the
 * rejoined turn ends, whole, as the room made it.
 *
 * **The floor.** The first answer's `x-sheep-build` is read, and a 4xx other
 * than 401 from a station older than `OLDEST_SHEEP_HOME` is thrown as shear's
 * sentence with `sheep home deploy` named.
 */
import type { RmAnswer, SheepCommands, SheepEntry, SheepReply, SheepRow } from "isocan/rc";
import { OLDEST_SHEEP_HOME } from "../../cli/src/collie/floors.ts";
import { SETUP_POLL_MS, type SetupState, SetupVoice } from "../../cli/src/setup-words.ts";

/** The header a station from shear on sends on every response. */
const SHEEP_BUILD_HEADER = "x-sheep-build";

/** How long one transcript long poll is asked to wait: the cell's own ceiling. */
export const FOLLOW_WAIT_MS = 25_000;
/** How long a follow keeps asking a station that does not answer before the turn is given up on. */
export const FOLLOW_DROP_WINDOW_MS = 5 * 60_000;

/** A station's refusal in its own sentence (a 4xx with a text body), or the floor's sentence for a station too old. */
export class StationSentence extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Whether the sentence is the floor's: a station too old for the route, not a refusal it stated. */
    readonly floor = false,
  ) {
    super(message);
  }
}

/** Where the station is and how the collie proves itself there. */
export interface Station {
  home: string;
  token: string;
}

/** The part of the collie's state the follow keeps its mark in. */
export interface TurnMarks {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The mark a sent prompt leaves until its follow ends: the tip it was sent at, and the entry when it was queued. */
interface TurnMark {
  tip: string | null;
  queued: string | null;
}

/** `GET /s/<id>/transcript`, as much of it as the follow reads. */
interface Transcript {
  tipId: string | null;
  operation: { id: string } | null;
  entries: (SheepEntry & { message?: { role?: string; content?: unknown; stopReason?: string; errorMessage?: string } })[];
}

/** The floor's sentence for a refusal from a station below it, or undefined (shear phase 1's rule, the collie's floor). */
export function stationFloorSentence(status: number, header: string | null): string | undefined {
  if (status < 400 || status >= 500 || status === 401) return undefined;
  const [commit, builtAt] = (header ?? "").trim().split(/\s+/);
  const known = commit !== undefined && commit !== "";
  if (known && (!builtAt || !(Date.parse(builtAt) < Date.parse(OLDEST_SHEEP_HOME)))) return undefined;
  const named = known ? `${commit} (${builtAt})` : "(a build from before the header)";
  return `the station's build ${named} is older than the collie speaks to; \`sheep home deploy\` from this package updates it`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Whether the summons carries an entry isocan did not mark redelivered; true when its payload cannot be read, so nothing is lost. */
export function carriesNewEntries(text: string): boolean {
  const at = text.lastIndexOf("\n{");
  if (at === -1) return true;
  try {
    const payload = JSON.parse(text.slice(at + 1)) as { entries?: { redelivered?: boolean }[] };
    if (!Array.isArray(payload.entries)) return true;
    return payload.entries.some((entry) => entry.redelivered !== true);
  } catch {
    return true;
  }
}

/** The station's HTTP face as the collie uses it: the bearer, the build read once, and refusals as sentences. */
export class StationClient {
  /** The station's build header from the first answer; undefined until one comes, null when it sent none. */
  build: string | null | undefined;

  constructor(readonly station: Station) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.station.token}`);
    const response = await fetch(new URL(path, this.station.home), { ...init, headers });
    if (this.build === undefined) this.build = response.headers.get(SHEEP_BUILD_HEADER);
    if (response.ok) return response;
    const body = (await response.text()).trim();
    const floor = stationFloorSentence(response.status, response.headers.get(SHEEP_BUILD_HEADER));
    if (floor !== undefined) throw new StationSentence(body === "" ? floor : `${body}; ${floor}`, response.status, true);
    if (response.status >= 400 && response.status < 500 && response.status !== 401 && body !== "") throw new StationSentence(body, response.status);
    throw new Error(`the station at ${new URL(this.station.home).origin} answered ${init.method ?? "GET"} ${path} with ${response.status}${body === "" ? "" : ` ${body}`}`);
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await (await this.request(path, init)).json()) as T;
  }
}

/** The pasture's path, its name encoded. */
const pasturePath = (name: string) => `/p/${encodeURIComponent(name)}`;
const sheepPath = (id: string) => `/s/${encodeURIComponent(id)}`;

/**
 * The commands for one turn: `narrate` is the turn's, so the setup's lines are said as the agent's, and `marks` is the
 * collie's state, where the resume rule's mark lives.
 */
export function stationCommands(client: StationClient, marks: TurnMarks, narrate: (line: string) => void = () => {}): SheepCommands {
  const markKey = (id: string) => `turn:${id}`;
  return {
    async sessions(): Promise<SheepRow[]> {
      return client.json<SheepRow[]>("/sessions");
    },
    async session(id: string): Promise<SheepRow | null> {
      try {
        return await client.json<SheepRow>(`/sessions/${encodeURIComponent(id)}`);
      } catch (error) {
        if (error instanceof StationSentence && error.status === 404 && !error.floor) return null;
        throw error;
      }
    },
    async pastures(): Promise<string[]> {
      return (await client.json<{ name: string }[]>("/pastures")).map((pasture) => pasture.name);
    },
    async pastureNew(name: string): Promise<void> {
      await client.request("/pastures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    },
    async pasturePut(name: string, path: string, body: string): Promise<void> {
      await client.request(`${pasturePath(name)}/tree/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "PUT", body });
    },
    async pastureSecret(name: string, key: string, value: string): Promise<void> {
      await client.request(`${pasturePath(name)}/secrets/${encodeURIComponent(key)}`, { method: "PUT", body: value });
    },
    async mint(opts: { name: string; pasture: string }, secrets: Record<string, string>): Promise<string> {
      const row = await client.json<{ id: string }>("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: opts.name, pasture: opts.pasture, secrets }),
      });
      return row.id;
    },
    async attach(id: string, text: string, onEntry: (entry: SheepEntry) => void): Promise<SheepReply> {
      const key = markKey(id);
      const kept = (await marks.get(key)) as TurnMark | undefined;
      try {
        if (kept !== undefined) {
          // The resume rule: a turn this collie sent and never saw end is followed from where it was sent, not sent again.
          const rejoined = await follow(client, id, kept, onEntry, narrate);
          if (!carriesNewEntries(text)) return rejoined;
          await marks.delete(key);
        }
        const before = await client.json<Transcript>(`${sheepPath(id)}/transcript`);
        const answer = await client.json<{ operationId?: string; entryId?: string }>(`${sheepPath(id)}/prompt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const mark: TurnMark = { tip: before.tipId, queued: typeof answer.entryId === "string" ? answer.entryId : null };
        await marks.set(key, mark);
        return await follow(client, id, mark, onEntry, narrate);
      } finally {
        await marks.delete(key);
      }
    },
    async rm(id: string): Promise<RmAnswer> {
      try {
        const report = await client.json<{ aborted?: boolean }>(sheepPath(id), { method: "DELETE" });
        return { ended: true, aborted: report.aborted === true };
      } catch (error) {
        if (error instanceof StationSentence) return { ended: false, refusal: error.message };
        throw error;
      }
    },
    async abort(id: string): Promise<boolean> {
      const answer = await client.json<{ aborted?: boolean } | boolean>(`${sheepPath(id)}/abort`, { method: "POST" });
      return typeof answer === "boolean" ? answer : answer.aborted === true;
    },
  };
}

/**
 * One turn followed from `mark.tip` to its end: every entry after the tip handed on once, the queued entry waited for
 * when the prompt was queued, and the setup said while it runs. A station that stops answering is asked again with a
 * backoff for `FOLLOW_DROP_WINDOW_MS`; its refusal is thrown at once.
 */
async function follow(client: StationClient, id: string, mark: TurnMark, onEntry: (entry: SheepEntry) => void, narrate: (line: string) => void): Promise<SheepReply> {
  const seen = new Set<string>();
  let started = mark.tip === null;
  let tip = mark.tip;
  let placed = mark.queued === null;
  let last: Transcript["entries"][number] | undefined;
  const voice = new SetupVoice();
  let rowAt = 0;
  let droppedAt: number | null = null;
  let pause = 250;
  const askRow = async () => {
    rowAt = Date.now();
    try {
      const row = await client.json<SheepRow>(`/sessions/${encodeURIComponent(id)}`);
      for (const line of voice.saw(row.setup as SetupState | null | undefined, Date.now())) narrate(line.trimEnd());
    } catch {
      // the row is a courtesy beside the turn; a station that will not answer it fails nothing
    }
  };
  for (;;) {
    if (Date.now() - rowAt >= SETUP_POLL_MS) await askRow();
    let view: Transcript;
    try {
      const query = new URLSearchParams({ wait: String(FOLLOW_WAIT_MS) });
      if (tip !== null) query.set("tip", tip);
      view = await client.json<Transcript>(`${sheepPath(id)}/transcript?${query}`);
      droppedAt = null;
      pause = 250;
    } catch (error) {
      if (error instanceof StationSentence) throw error;
      droppedAt ??= Date.now();
      if (Date.now() - droppedAt > FOLLOW_DROP_WINDOW_MS) throw error;
      await sleep(pause);
      pause = Math.min(pause * 2, 5_000);
      continue;
    }
    for (const entry of view.entries) {
      if (!started) {
        if (entry.id === mark.tip) started = true;
        continue;
      }
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (entry.id === mark.queued) placed = true;
      if (entry.type === "message" && entry.message?.role === "assistant") last = entry;
      onEntry(entry);
    }
    // A tip the transcript no longer holds (a compaction): everything it holds now is after it.
    if (!started) {
      started = true;
      continue;
    }
    tip = view.tipId;
    if (view.operation !== null) continue;
    // A setup said to be running is asked for once more at the end, so its end is said even inside one poll.
    if (voice.waiting) await askRow();
    if (!placed) return { ended: false, why: `the prompt queued as ${mark.queued} was dropped: the turn ended without taking it up` };
    const stop = last?.message?.stopReason;
    if (stop === "error" || stop === "aborted") return { ended: false, why: last?.message?.errorMessage ?? stop };
    return { ended: true };
  }
}
