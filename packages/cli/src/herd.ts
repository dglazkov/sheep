/**
 * The one-shot commands a sheepdog runs: prompt mode, wait, status, abort,
 * and log. Each is pi's agent controller, transcript replica, or lane
 * snapshot, read by a program instead of drawn by a TUI, and each exits.
 */
import type { Entry, LaneTranscriptSnapshot } from "@earendil-works/pi-agent-core";
import type { TranscriptState } from "@earendil-works/pi-coding-agent/experimental/services/transcript";
import { attachSheep, BACKGROUND_CONTEXT, lastAssistant, messageText, type Sheep } from "./client.js";
import type { Home } from "./home.js";

export interface Output {
  json: boolean;
  out(text: string): void;
  err(text: string): void;
}

function fail(output: Output, message: string): number {
  output.err(`sheep: ${message}\n`);
  return 2;
}

/**
 * Prints an assistant reply as it streams. The text is read from the
 * replica's streaming message, which pi's reducer keeps whole, rather than
 * from the delta events, one of which can arrive inside the hydrated
 * snapshot and never as an event. At the message's end the printed text is
 * compared with the message's full text and whatever is missing is printed,
 * so a program always gets the whole reply.
 */
class Stream {
  #printed = "";
  #wrote = false;

  constructor(private readonly out: (text: string) => void) {}

  observe(state: TranscriptState): void {
    const streaming = state.snapshot?.operation?.streamingMessage;
    if (streaming !== undefined && streaming.role === "assistant") this.grow(messageText(streaming));
    const event = state.event;
    if (event?.type === "message_end" && event.message.role === "assistant") this.finish(messageText(event.message));
  }

  private grow(text: string): void {
    if (!text.startsWith(this.#printed)) return;
    const rest = text.slice(this.#printed.length);
    if (rest.length > 0) {
      this.out(rest);
      this.#wrote = true;
    }
    this.#printed = text;
  }

  private finish(full: string): void {
    if (full.startsWith(this.#printed)) this.grow(full);
    else if (full !== this.#printed) {
      this.out(`${this.#wrote ? "\n" : ""}${full}`);
      this.#wrote = true;
    }
    if (this.#wrote) this.out("\n");
    this.#printed = "";
    this.#wrote = false;
  }
}

const idle = (state: TranscriptState): LaneTranscriptSnapshot | undefined =>
  state.snapshot !== null && state.snapshot !== undefined && state.snapshot.operation === null ? state.snapshot : undefined;

function printAssistant(output: Output, snapshot: LaneTranscriptSnapshot): void {
  const entry = lastAssistant(snapshot.transcript);
  if (entry !== undefined) output.out(`${JSON.stringify(entry)}\n`);
}

/**
 * Prompt mode over sheep's own client. An idle lane takes the prompt as an
 * operation, whose reply streams until the operation ends. A busy lane
 * queues it as pi's follow-up, taken up when the running turn ends; `sheep`
 * says so and exits, or with `wait` streams the queued turn when it starts.
 */
export async function runPrompt(home: Home, id: string, prompt: string, options: { wait: boolean }, output: Output): Promise<number> {
  const sheep = await attachSheep(home, id);
  const stream = new Stream(output.json ? () => {} : output.out);
  let active = false;
  const unsubscribe = sheep.transcript.state.subscribe((state) => {
    if (active) stream.observe(state);
  });
  try {
    if (sheep.snapshot().operation === null) {
      active = true;
      const response = await sheep.agent.prompt({ message: prompt, images: null }, BACKGROUND_CONTEXT);
      if (response.accepted) {
        // pi's `prompt` resolves at the end of the operation; the replica's last delivery may still be in flight.
        const snapshot = await sheep.until(idle);
        if (output.json) printAssistant(output, snapshot);
        if (response.error !== null) return fail(output, response.error.message);
        return 0;
      }
      if (response.error.code !== "lane_busy") return fail(output, response.error.message);
      active = false;
    }
    const queued = await sheep.agent.followUp({ message: prompt, images: null }, BACKGROUND_CONTEXT);
    if (!queued.accepted) return fail(output, queued.error.message);
    output.err(`queued ${id}\n`);
    if (!options.wait) {
      if (output.json) output.out(`${JSON.stringify(queued)}\n`);
      return 0;
    }
    const placed = await sheep.until((state) => {
      const snapshot = state.snapshot;
      if (snapshot === null || snapshot === undefined) return undefined;
      if (snapshot.transcript.some((entry) => entry.id === queued.entryId)) {
        active = true;
        return "placed" as const;
      }
      return snapshot.operation === null ? ("dropped" as const) : undefined;
    });
    if (placed === "dropped") return fail(output, `queued prompt ${queued.entryId} was dropped: the turn ended without taking it up`);
    const snapshot = await sheep.until(idle);
    if (output.json) printAssistant(output, snapshot);
    return 0;
  } finally {
    unsubscribe();
    await sheep.close();
  }
}

/** Blocks on each cell's own idle notification over the transcript subscription; never polls. */
export async function runWait(home: Home, ids: readonly string[], options: { timeoutMs: number | undefined }, output: Output): Promise<number> {
  const controller = new AbortController();
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new Error("timed out")), options.timeoutMs);
  const results: Array<{ id: string; message: Entry | null }> = [];
  let timedOut = false;
  let failed = false;
  await Promise.all(
    ids.map(async (id) => {
      let sheep: Sheep;
      try {
        sheep = await withSignal(attachSheep(home, id), controller.signal);
      } catch (error) {
        if (controller.signal.aborted) timedOut = true;
        else {
          failed = true;
          output.err(`sheep: ${id}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        return;
      }
      try {
        const snapshot = await sheep.until(idle, controller.signal);
        const entry = lastAssistant(snapshot.transcript) ?? null;
        if (output.json) results.push({ id, message: entry });
        else output.out(`${id}\t${oneLine(entry === null ? "" : messageText(entry.message))}\n`);
      } catch {
        timedOut = true;
      } finally {
        await sheep.close();
      }
    }),
  );
  clearTimeout(timer);
  if (output.json) output.out(`${JSON.stringify(results)}\n`);
  if (timedOut) output.err(`sheep: timed out; ${results.length === 0 && !output.json ? "the lines above are" : "printed"} the sheep that finished\n`);
  return timedOut ? 124 : failed ? 2 : 0;
}

/** The lane snapshot, read once: the open operation, the last tool call, tokens so far. */
export async function runStatus(home: Home, id: string, output: Output): Promise<number> {
  const sheep = await attachSheep(home, id);
  try {
    const snapshot = sheep.snapshot();
    if (output.json) {
      output.out(`${JSON.stringify(snapshot)}\n`);
      return 0;
    }
    const operation = snapshot.operation;
    const state = operation === null ? "idle" : operation.retry !== undefined || operation.deferred !== undefined ? "waiting" : "running";
    const lines = [`id: ${id}`, `state: ${state}`];
    lines.push(
      operation === null
        ? "operation: none"
        : `operation: ${operation.id} ${operation.kind} started ${new Date(operation.startedAt).toISOString()}${operation.status === "aborting" ? " aborting" : ""}`,
    );
    const tool = lastToolCall(snapshot);
    lines.push(tool === undefined ? "tool: none" : `tool: ${tool.name} ${tool.args}`);
    const usage = snapshot.stats.usage;
    lines.push(`tokens: input=${usage.input} output=${usage.output} cacheRead=${usage.cacheRead} cacheWrite=${usage.cacheWrite}`);
    lines.push(`messages: ${snapshot.stats.messageCount}`);
    output.out(`${lines.join("\n")}\n`);
    return 0;
  } finally {
    await sheep.close();
  }
}

function lastToolCall(snapshot: LaneTranscriptSnapshot): { name: string; args: string } | undefined {
  const running = snapshot.operation?.runningTools.at(-1);
  if (running !== undefined) return { name: running.toolName, args: compact(running.args) };
  for (let i = snapshot.transcript.length - 1; i >= 0; i--) {
    const entry = snapshot.transcript[i]!;
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const call = entry.message.content.findLast((part) => part.type === "toolCall");
    if (call !== undefined && call.type === "toolCall") return { name: call.name, args: compact(call.arguments) };
  }
  return undefined;
}

function compact(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** pi's `requestAbort` on the open operation; resolves once the lane has settled it. */
export async function runAbort(home: Home, id: string, output: Output): Promise<number> {
  const sheep = await attachSheep(home, id);
  try {
    const operation = sheep.snapshot().operation;
    if (operation === null) {
      if (output.json) output.out(`${JSON.stringify({ id, aborted: false })}\n`);
      else output.out(`${id}\tidle\n`);
      return 0;
    }
    await sheep.agent.requestAbort(operation.id, BACKGROUND_CONTEXT);
    await sheep.until(idle);
    if (output.json) output.out(`${JSON.stringify({ id, aborted: true })}\n`);
    else output.out(`${id}\taborted ${operation.id}\n`);
    return 0;
  } finally {
    await sheep.close();
  }
}

/** The transcript as text, oldest first, one block per entry; `--json` is pi's entries, one per line. */
export async function runLog(home: Home, id: string, options: { since: string | undefined; last: number | undefined }, output: Output): Promise<number> {
  const view = await home.transcript(id);
  let entries = view.entries;
  if (options.since !== undefined) {
    const index = entries.findIndex((entry) => entry.id === options.since);
    if (index !== -1) entries = entries.slice(index + 1);
    else {
      const time = Date.parse(options.since);
      if (Number.isNaN(time)) return fail(output, `--since needs an entry id from this transcript or an ISO time, not ${options.since}`);
      entries = entries.filter((entry) => entry.timestamp >= time);
    }
  }
  if (options.last !== undefined) entries = entries.slice(-options.last);
  if (output.json) {
    for (const entry of entries) output.out(`${JSON.stringify(entry)}\n`);
    return 0;
  }
  output.out(entries.map(formatEntry).join("\n"));
  return 0;
}

export function formatEntry(entry: Entry): string {
  const at = new Date(entry.timestamp).toISOString();
  const lines: string[] = [];
  switch (entry.type) {
    case "message": {
      const message = entry.message;
      lines.push(`[${message.role}] ${entry.id} ${at}`);
      if (message.role === "toolResult") {
        lines[0] = `[result ${message.toolName}] ${entry.id} ${at}${message.isError ? " error" : ""}`;
        lines.push(...messageText(message).replace(/\n$/, "").split("\n"));
      } else if (message.role === "user" || message.role === "assistant") {
        if (typeof message.content === "string") lines.push(...message.content.replace(/\n$/, "").split("\n"));
        else {
          for (const part of message.content) {
            if (part.type === "text") lines.push(...part.text.replace(/\n$/, "").split("\n"));
            else if (part.type === "toolCall") lines.push(`[tool ${part.name}] ${compact(part.arguments)}`);
            else if (part.type === "thinking") lines.push(`[thinking] ${part.thinking.split("\n")[0] ?? ""}`);
            else lines.push(`[${part.type}]`);
          }
        }
      } else lines.push(compact(message));
      break;
    }
    case "compaction":
      lines.push(`[compaction] ${entry.id} ${at} tokensBefore=${entry.tokensBefore}`, ...entry.summary.split("\n"));
      break;
    case "branch_summary":
      lines.push(`[branch_summary] ${entry.id} ${at}`, ...entry.summary.split("\n"));
      break;
    case "custom":
      lines.push(`[custom ${entry.customType}] ${entry.id} ${at}`, ...(entry.data === undefined ? [] : [compact(entry.data)]));
      break;
  }
  return `${lines.join("\n")}\n`;
}

function oneLine(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
