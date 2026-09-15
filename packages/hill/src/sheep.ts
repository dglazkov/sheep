/**
 * A sheep's page (hill phase 3), pure: whether the page may ask the cell at
 * all, what an answer from the cell or its transcript comes to, the loop
 * that reads the transcript one request at a time, what the page draws of
 * the blocks, and where the page scrolls when new blocks land. All of it
 * over given answers and a given clock, so the checkout ring proves it with
 * no browser and no home; `sheep-view.ts` draws what this returns.
 *
 * The blocks are `blocksOf` from the dog's own `packages/cli/src/blocks.ts`,
 * the function `sheep log` prints through, imported and never retyped.
 */
import { type Block, blocksOf, type Entry, type ResultBlock, type SetupFacts, type ToolPart } from "../../cli/src/blocks.ts";
import type { SetupState } from "../../cli/src/setup-words.ts";
import { type Clock, POLL_MS, realClock, type SessionRow } from "./flock.ts";
import type { Answer, SheepClient } from "./home.ts";

/**
 * **Looking never wakes a sheep.** A cell boots on the first thing that asks
 * it, and a sheep minted into a pasture with a repository is born inside
 * that boot. A row with no task and no setup is a sheep nothing has
 * prompted, and the page asks nothing of its cell until a poll of the flock
 * says otherwise. The one rule; everything that would ask the cell asks this
 * first.
 */
export function asksCell(row: Pick<SessionRow, "task" | "setup">): boolean {
  return (row.task ?? null) !== null || (row.setup ?? null) !== null;
}

/** The open operation, as `GET /s/<id>/` and the transcript view carry it. */
export interface Operation {
  id: string;
  kind: string;
  startedAt: number;
  status?: string;
}

/** `GET /s/<id>/transcript`: the cell's `TranscriptView`, as much of it as the page reads. */
export interface TranscriptView {
  id: string;
  tipId: string | null;
  operation: Operation | null;
  entries: Entry[];
  setups?: SetupFacts[];
}

/** What one read of the cell came to. */
export type Reading =
  | { kind: "cell"; operation: Operation | null }
  | { kind: "view"; view: TranscriptView }
  /** The home has no such sheep: the Worker's 404, which a sheep ended with `sheep rm` gets. */
  | { kind: "gone" }
  | { kind: "seatless" }
  /** No answer, a 5xx, or a body that does not parse: asked again after a rest. */
  | { kind: "silent" };

function common(answer: Answer | undefined): Reading | undefined {
  if (answer === undefined) return { kind: "silent" };
  if (answer.status === 404) return { kind: "gone" };
  if (answer.status === 401) return { kind: "seatless" };
  if (answer.status !== 200) return { kind: "silent" };
  return undefined;
}

/** `GET /s/<id>/` read: the operation it names. */
export function readCell(answer: Answer | undefined): Reading {
  const early = common(answer);
  if (early !== undefined) return early;
  try {
    const state = JSON.parse(answer!.text) as { operation?: Operation | null };
    if (state === null || typeof state !== "object") return { kind: "silent" };
    return { kind: "cell", operation: state.operation ?? null };
  } catch {
    return { kind: "silent" };
  }
}

/** `GET /s/<id>/transcript` read: the whole view. */
export function readTranscript(answer: Answer | undefined): Reading {
  const early = common(answer);
  if (early !== undefined) return early;
  try {
    const view = JSON.parse(answer!.text) as TranscriptView;
    if (view === null || typeof view !== "object" || !Array.isArray(view.entries)) return { kind: "silent" };
    return { kind: "view", view };
  } catch {
    return { kind: "silent" };
  }
}

/** How long the loop rests after an answer with no turn open, or after a read that failed: the flock's own interval. */
export const REST_MS = POLL_MS;

/**
 * The loop, the collie's way: `GET /s/<id>/` once, then `GET
 * /s/<id>/transcript?wait=25000&tip=<the last tip>` again and again, one
 * request open at a time. The cell holds a transcript read until the tip
 * moves or the turn ends, and answers at once when no turn is open, so after
 * an answer with no turn the loop rests `REST_MS` before it asks again, as
 * it does after a failure; with a turn open it asks again at once. Hidden,
 * no new request starts (the one in flight may land, and is handed on);
 * visible again, it asks when its rest is over. `stop` aborts the request in
 * flight and ends the loop, and so does a read that says the sheep is gone
 * or the seat is.
 */
export class TranscriptFollow {
  readonly #client: SheepClient;
  readonly #id: string;
  readonly #land: (reading: Reading) => void;
  readonly #clock: Clock;
  #visible = false;
  #stopped = false;
  #stated = false;
  #tip: string | null = null;
  #inFlight: AbortController | undefined;
  #notBefore = 0;
  #cancel: (() => void) | undefined;

  constructor(client: SheepClient, id: string, land: (reading: Reading) => void, clock: Clock = realClock) {
    this.#client = client;
    this.#id = id;
    this.#land = land;
    this.#clock = clock;
  }

  /** Whether the page is visible now. */
  visible(visible: boolean): void {
    this.#visible = visible;
    if (!visible) {
      this.#cancel?.();
      this.#cancel = undefined;
      return;
    }
    this.#schedule();
  }

  /** Ended for good: the timer cancelled, the request in flight aborted, and nothing it answers handed on. */
  stop(): void {
    this.#stopped = true;
    this.#cancel?.();
    this.#cancel = undefined;
    this.#inFlight?.abort();
    this.#inFlight = undefined;
  }

  /** Whether a request is open now; for the tests. */
  get asking(): boolean {
    return this.#inFlight !== undefined;
  }

  /** Whether the loop has ended. */
  get stopped(): boolean {
    return this.#stopped;
  }

  #schedule(): void {
    if (this.#stopped || !this.#visible || this.#inFlight !== undefined || this.#cancel !== undefined) return;
    const wait = this.#notBefore - this.#clock.now();
    if (wait <= 0) {
      this.#run();
      return;
    }
    this.#cancel = this.#clock.after(wait, () => {
      this.#cancel = undefined;
      this.#schedule();
    });
  }

  #run(): void {
    const controller = new AbortController();
    this.#inFlight = controller;
    const stating = !this.#stated;
    let asked: Promise<Answer>;
    try {
      asked = stating ? this.#client.cell(this.#id, controller.signal) : this.#client.transcript(this.#id, this.#tip, controller.signal);
    } catch (error) {
      asked = Promise.reject(error);
    }
    asked.then(
      (answer) => this.#landed(controller, stating ? readCell(answer) : readTranscript(answer)),
      () => this.#landed(controller, { kind: "silent" }),
    );
  }

  #landed(controller: AbortController, reading: Reading): void {
    if (this.#inFlight !== controller || this.#stopped) return;
    this.#inFlight = undefined;
    const now = this.#clock.now();
    switch (reading.kind) {
      case "cell":
        this.#stated = true;
        this.#notBefore = now;
        break;
      case "view":
        this.#tip = reading.view.tipId;
        this.#notBefore = reading.view.operation === null ? now + REST_MS : now;
        break;
      case "silent":
        this.#notBefore = now + REST_MS;
        break;
      case "gone":
      case "seatless":
        this.#stopped = true;
        break;
    }
    this.#land(reading);
    this.#schedule();
  }
}

/**
 * The page's copy of a transcript: the last view the cell answered and its
 * blocks, both replaced whole by each answer, never appended to, so the page
 * holds one transcript however long it runs. An answer that says nothing new
 * (the same tip, the same turn, the same setups) keeps the copy it has and
 * the page draws nothing again.
 */
export class Held {
  view: TranscriptView | undefined;
  blocks: Block[] = [];

  /** Takes an answer; returns whether anything changed. */
  take(view: TranscriptView, row: SetupState | null, now: number): boolean {
    const held = this.view;
    if (held !== undefined && held.tipId === view.tipId && held.entries.length === view.entries.length && JSON.stringify(held.operation) === JSON.stringify(view.operation) && JSON.stringify(held.setups ?? []) === JSON.stringify(view.setups ?? [])) return false;
    this.view = view;
    this.blocks = blocksOf(view.entries, view.setups ?? [], row, now);
    return true;
  }
}

/** The tool the sheep is on: the last tool call in the transcript with no result yet, while a turn is open. */
export function openTool(blocks: readonly Block[], operation: Operation | null): { part: ToolPart; at: number } | undefined {
  if (operation === null) return undefined;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    if (block.kind !== "reply") continue;
    for (let j = block.parts.length - 1; j >= 0; j--) {
      const part = block.parts[j]!;
      if (part.kind === "tool" && part.result === null) return { part, at: block.at };
    }
  }
  return undefined;
}

/** What a tool call's line says of its arguments: the command or the path when the call has one, else the arguments as `sheep log` prints them. */
export function argSummary(part: Pick<ToolPart, "arguments" | "args">): string {
  const args = part.arguments;
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
    const record = args as Record<string, unknown>;
    for (const key of ["command", "path", "file_path", "url"]) if (typeof record[key] === "string") return record[key];
    const strings = Object.values(record).filter((value) => typeof value === "string");
    if (Object.keys(record).length === 1 && strings.length === 1) return strings[0] as string;
  }
  return part.args;
}

/** The lines of a result as the page shows them: `sheep log`'s, without the blank lines a tool's output trails. */
export function resultLines(result: Pick<ResultBlock, "text">): string[] {
  const text = result.text.replace(/\s+$/, "");
  return text === "" ? [] : text.split("\n");
}

/** A folded result's label: its line count, or `result` for one line or none. */
export function foldLabel(result: Pick<ResultBlock, "text" | "isError">): string {
  const count = resultLines(result).length;
  const size = count > 1 ? `${count} lines` : "result";
  return result.isError ? `error · ${size}` : size;
}

/** The key a result's fold is kept open by across re-renders: the entry and the call. */
export function foldKey(block: Pick<Block, "id">, callId: string): string {
  return `${block.id}:${callId}`;
}

/** A scroller's position: `scrollTop`, `scrollHeight`, `clientHeight`. */
export interface Scroll {
  top: number;
  height: number;
  client: number;
}

/** How near the bottom counts as at it. */
export const BOTTOM_SLACK_PX = 8;

/** Whether the reader is at the bottom. */
export function atBottom(scroll: Scroll): boolean {
  return scroll.height - scroll.top - scroll.client <= BOTTOM_SLACK_PX;
}

/**
 * Following the bottom: where the scroller goes once new blocks have landed,
 * from where it was before they did and its size after (the head above it
 * can grow in the same drawing, so the scroller's own height is read again).
 * At the bottom, the new bottom; scrolled up, where the reader was.
 */
export function scrollAfter(before: Scroll, after: Pick<Scroll, "height" | "client">): number {
  return atBottom(before) ? Math.max(0, after.height - after.client) : before.top;
}

/** The words for a sheep's page with nothing drawn under the head yet. */
export const UNASKED = "Nothing has been asked of this sheep yet.";
export const SETUP_RUNNING = "setup.sh is running; the transcript fills in when the cell answers.";
export const READING = "Reading the transcript…";
export const EMPTY = "Nothing in the transcript yet.";
export const CELL_SILENT = "The cell did not answer. Showing what it last said; asking again.";

/** What the space under the head says before any block is drawn, from the row and what the page holds. */
export function quietWords(row: Pick<SessionRow, "task" | "setup">, view: TranscriptView | undefined, blocks: number): string | null {
  if (!asksCell(row)) return UNASKED;
  if (view === undefined) return row.setup?.state === "running" ? SETUP_RUNNING : READING;
  return blocks === 0 ? EMPTY : null;
}
