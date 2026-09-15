/**
 * The blocks (hill phase 3): pi's entries and bleat's setups rendered once,
 * as a list of structured blocks, for the two faces that show a transcript.
 * `sheep log` prints `textOf` of them (`herd.ts`), byte for byte what it
 * printed before the rendering moved here; the hill draws them
 * (`packages/hill/src/sheep-view.ts`), folding a tool's result under its
 * call. One function decides what an entry says, so the two cannot drift.
 *
 * Nothing here reaches for a runtime: the imports are types, which the
 * compilers erase, and `setup-words.ts`, which imports nothing. The page's
 * bundle takes `blocksOf` and leaves `textOf` behind.
 *
 * A block is one thing `sheep log` prints as one paragraph, in its order:
 *
 *   prompt          a user message: its parts (text, or `[image]`)
 *   reply           an assistant message: text, thinking lines, tool calls
 *                   (each with the result entry paired to it by the call's
 *                   id, when there is one), and its error line; `aborted`
 *                   when pi's stop reason says the turn was aborted
 *   result          a tool result, `paired` when a call in this list claimed it
 *   message         any other role pi's entries carry, as compact JSON
 *   setup           a setup record, its ending, and its output's lines
 *   compaction, branch_summary, custom   what `sheep log` prints of each
 *
 * An abort, in pi's entries, is the assistant entry the aborted model call
 * ended with: `stopReason: "aborted"` and an `errorMessage`, which the text
 * face prints as that block's `[error]` line, as it printed any error.
 */
import type { Entry } from "@earendil-works/pi-agent-core";
import { elapsed, type SetupState } from "./setup-words.js";

export type { Entry };

type MessageEntry = Extract<Entry, { type: "message" }>;

/**
 * The facts of a setup record a block reads: `home.ts`'s `SetupRecord`
 * (the cell's, bleat phase 0) satisfies it. Mirrored rather than imported so
 * the page's compiler never reads `home.ts`.
 */
export interface SetupFacts {
  id: string;
  at: number;
  ms?: number;
  exit?: number;
  error?: string;
  output: string;
}

/** A tool result, as the call it answers and the result's own block both carry it. */
export interface ResultBlock {
  kind: "result";
  id: string;
  at: number;
  entry: MessageEntry;
  toolName: string;
  callId: string;
  text: string;
  isError: boolean;
  /** Whether a tool call in the same list names this result's call id, so the page draws it under that call. */
  paired: boolean;
}

/** A part of a prompt or a reply, in the message's order. */
export type Part =
  | { kind: "text"; text: string }
  | { kind: "thinking"; line: string }
  | {
      kind: "tool";
      callId: string;
      name: string;
      /** The call's arguments as `sheep log` prints them: compact JSON, cut at 200 characters. */
      args: string;
      arguments: unknown;
      /** The result entry for this call, when the list holds one. */
      result: ResultBlock | null;
    }
  | { kind: "other"; type: string };

export type ToolPart = Extract<Part, { kind: "tool" }>;

export type Block =
  | { kind: "prompt"; id: string; at: number; entry: MessageEntry; parts: Part[] }
  | { kind: "reply"; id: string; at: number; entry: MessageEntry; parts: Part[]; error: string | null; aborted: boolean }
  | ResultBlock
  | { kind: "message"; id: string; at: number; entry: MessageEntry; role: string; json: string }
  | { kind: "setup"; id: string; at: number; record: SetupFacts; ending: string; running: boolean; lines: string[] }
  | { kind: "compaction"; id: string; at: number; entry: Extract<Entry, { type: "compaction" }>; summary: string }
  | { kind: "branch_summary"; id: string; at: number; entry: Extract<Entry, { type: "branch_summary" }>; summary: string }
  | { kind: "custom"; id: string; at: number; entry: Extract<Entry, { type: "custom" }>; customType: string; data: string | null };

type Message = MessageEntry["message"];

/** The text of a user, assistant, or tool-result message; other pi messages have none. */
export function messageText(message: Message | { role: string; content?: unknown }): string {
  const known = message as { role: string; content?: string | { type: string; text?: string }[] };
  if (known.role !== "user" && known.role !== "assistant" && known.role !== "toolResult") return "";
  if (typeof known.content === "string") return known.content;
  return (known.content ?? []).flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("");
}

/** A value as one line of JSON, cut at 200 characters: how `sheep log` and `sheep status` print arguments. */
export function compact(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** The entries and the setups in one order, by time; a setup sharing a millisecond with an entry follows it. */
export function merge<S extends SetupFacts>(entries: readonly Entry[], setups: readonly S[]): ({ at: number; entry: Entry } | { at: number; setup: S })[] {
  const printed: ({ at: number; entry: Entry } | { at: number; setup: S })[] = [...entries.map((entry) => ({ at: entry.timestamp, entry })), ...setups.map((setup) => ({ at: setup.at, setup }))];
  return printed.sort((left, right) => left.at - right.at || ("setup" in left ? 1 : 0) - ("setup" in right ? 1 : 0));
}

/**
 * How a setup record ended: its own ending when it has one; else the row's,
 * when the row speaks of the same `at` and has ended (an eviction mends the
 * row and not the record); else `running` for as long as it has run.
 */
export function setupEnding(record: SetupFacts, row: SetupState | null, now: number): { ending: string; running: boolean } {
  if (record.ms !== undefined || record.exit !== undefined || record.error !== undefined) return { ending: endedAfter(record.exit, record.error, record.ms), running: false };
  if (row !== null && row.at === record.at && row.state !== "running") return { ending: endedAfter(row.exit, row.error, row.ms), running: false };
  return { ending: `running (${elapsed(now - record.at)})`, running: true };
}

function endedAfter(exit: number | undefined, error: string | undefined, ms: number | undefined): string {
  const how = exit !== undefined ? `exit ${exit}` : error !== undefined ? `error ${error}` : "ended";
  return ms === undefined ? how : `${how} after ${elapsed(ms)}`;
}

/** A content part as the blocks read it: whichever of pi's part shapes it is. */
type LoosePart = { type: string; text?: string; thinking?: string; id?: unknown; name?: string; arguments?: unknown };

function partsOf(content: string | readonly LoosePart[], byCall: ReadonlyMap<string, ResultBlock>): Part[] {
  if (typeof content === "string") return [{ kind: "text", text: content }];
  return content.map((part): Part => {
    if (part.type === "text") return { kind: "text", text: part.text as string };
    if (part.type === "toolCall") {
      const result = typeof part.id === "string" ? byCall.get(part.id) : undefined;
      return { kind: "tool", callId: part.id as string, name: part.name as string, args: compact(part.arguments), arguments: part.arguments, result: result ?? null };
    }
    if (part.type === "thinking") return { kind: "thinking", line: (part.thinking as string).split("\n")[0] ?? "" };
    return { kind: "other", type: part.type };
  });
}

/**
 * The blocks for a transcript: the entries and the setups merged by time,
 * one block for each, each tool call carrying its result. `row` is the
 * sheep's row setup, read only for a record with no ending of its own, and
 * `now` is the clock a running setup's elapsed time is read against.
 * Nothing is copied that the entries already hold but the few strings a
 * block is made of, so the page can hold one transcript and its blocks.
 */
export function blocksOf(entries: readonly Entry[], setups: readonly SetupFacts[], row: SetupState | null, now: number): Block[] {
  // The results first, each entry's own block, and each call id's first result, so a call finds its result wherever it landed.
  const results = new Map<Entry, ResultBlock>();
  const byCall = new Map<string, ResultBlock>();
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "toolResult") continue;
    const message = entry.message as { toolName: string; toolCallId?: unknown; isError?: unknown };
    const result: ResultBlock = {
      kind: "result",
      id: entry.id,
      at: entry.timestamp,
      entry,
      toolName: message.toolName,
      callId: typeof message.toolCallId === "string" ? message.toolCallId : "",
      text: messageText(entry.message),
      isError: Boolean(message.isError),
      paired: false,
    };
    results.set(entry, result);
    if (typeof message.toolCallId === "string" && !byCall.has(message.toolCallId)) byCall.set(message.toolCallId, result);
  }
  const blocks: Block[] = [];
  for (const item of merge(entries, setups)) {
    if ("setup" in item) {
      const record = item.setup;
      const { ending, running } = setupEnding(record, row, now);
      blocks.push({ kind: "setup", id: record.id, at: record.at, record, ending, running, lines: record.output === "" ? [] : record.output.replace(/\n$/, "").split("\n") });
      continue;
    }
    const entry = item.entry;
    switch (entry.type) {
      case "message": {
        const message = entry.message as { role: string; content?: string | LoosePart[]; errorMessage?: string; stopReason?: string };
        if (message.role === "toolResult") {
          blocks.push(results.get(entry)!);
        } else if (message.role === "user") {
          blocks.push({ kind: "prompt", id: entry.id, at: entry.timestamp, entry, parts: partsOf(message.content ?? [], byCall) });
        } else if (message.role === "assistant") {
          const parts = partsOf(message.content ?? [], byCall);
          for (const part of parts) if (part.kind === "tool" && part.result !== null) part.result.paired = true;
          const error = message.errorMessage !== undefined && message.errorMessage !== "" ? message.errorMessage : null;
          blocks.push({ kind: "reply", id: entry.id, at: entry.timestamp, entry, parts, error, aborted: message.stopReason === "aborted" });
        } else {
          blocks.push({ kind: "message", id: entry.id, at: entry.timestamp, entry, role: message.role, json: compact(message) });
        }
        break;
      }
      case "compaction":
        blocks.push({ kind: "compaction", id: entry.id, at: entry.timestamp, entry, summary: entry.summary });
        break;
      case "branch_summary":
        blocks.push({ kind: "branch_summary", id: entry.id, at: entry.timestamp, entry, summary: entry.summary });
        break;
      case "custom":
        blocks.push({ kind: "custom", id: entry.id, at: entry.timestamp, entry, customType: entry.customType, data: entry.data === undefined ? null : compact(entry.data) });
        break;
    }
  }
  return blocks;
}

/** A block's text lines' own words: a text part as `sheep log` splits it. */
const textLines = (text: string): string[] => text.replace(/\n$/, "").split("\n");

function partLines(part: Part): string[] {
  switch (part.kind) {
    case "text":
      return textLines(part.text);
    case "tool":
      return [`[tool ${part.name}] ${part.args}`];
    case "thinking":
      return [`[thinking] ${part.line}`];
    case "other":
      return [`[${part.type}]`];
  }
}

/** One block as `sheep log` prints it: its lines, each ended. */
export function blockText(block: Block): string {
  const at = new Date(block.at).toISOString();
  const lines: string[] = [];
  switch (block.kind) {
    case "setup":
      lines.push(`[setup] ${block.record.id} ${at} ${block.ending}`, ...block.lines);
      break;
    case "prompt":
      lines.push(`[user] ${block.id} ${at}`, ...block.parts.flatMap(partLines));
      break;
    case "reply":
      lines.push(`[assistant] ${block.id} ${at}`, ...block.parts.flatMap(partLines));
      // Tether phase 0: pi's interruption, an abort, and any other assistant entry that ended in an error, says why as its last line.
      if (block.error !== null) lines.push(`[error] ${block.error}`);
      break;
    case "result":
      lines.push(`[result ${block.toolName}] ${block.id} ${at}${block.isError ? " error" : ""}`, ...textLines(block.text));
      break;
    case "message":
      lines.push(`[${block.role}] ${block.id} ${at}`, block.json);
      break;
    case "compaction":
      lines.push(`[compaction] ${block.id} ${at} tokensBefore=${block.entry.tokensBefore}`, ...block.summary.split("\n"));
      break;
    case "branch_summary":
      lines.push(`[branch_summary] ${block.id} ${at}`, ...block.summary.split("\n"));
      break;
    case "custom":
      lines.push(`[custom ${block.customType}] ${block.id} ${at}`, ...(block.data === null ? [] : [block.data]));
      break;
  }
  return `${lines.join("\n")}\n`;
}

/** The text face: the transcript as `sheep log` prints it, a blank line between blocks. */
export function textOf(blocks: readonly Block[]): string {
  return blocks.map(blockText).join("\n");
}
