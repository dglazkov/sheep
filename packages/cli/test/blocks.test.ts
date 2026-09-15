/**
 * Hill phase 3 in the checkout ring: the blocks, `sheep log`'s rendering
 * moved out of `herd.ts` into `blocks.ts` so the hill can draw what the dog
 * reads. The text face must print the bytes `herd.ts` printed before the
 * move, so the rendering as it stood at cefefbd is frozen below as the
 * oracle (`before`), and every fixture `sheep log`'s tests already had
 * (bleat's blocks and tether's interruption), plus a transcript with a
 * setup, a tool call and its result, an error, and an abort, is printed
 * both ways and compared byte for byte; `runLog` itself is run over a home
 * that answers those transcripts. Then the blocks' own shape: a result
 * paired to its call by the call's id, an abort as pi's entries carry it,
 * and a setup with its ending and output.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Block, blocksOf, messageText, textOf } from "../src/blocks.js";
import { messageText as clientMessageText } from "../src/client.js";
import { runLog } from "../src/herd.js";
import type { Home, SetupRecord } from "../src/home.js";
import { elapsed, type SetupState } from "../src/setup-words.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The oracle: `sheep log`'s text as `herd.ts` rendered it at cefefbd, before
 * hill phase 3 moved it, copied here unchanged but for the names and the
 * types. It is never edited: it is what "the bytes it printed before" means.
 */
const before = (() => {
  function compact(value: unknown): string {
    const text = JSON.stringify(value) ?? "";
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }
  function messageTextBefore(message: any): string {
    if (message.role !== "user" && message.role !== "assistant" && message.role !== "toolResult") return "";
    if (typeof message.content === "string") return message.content;
    return message.content.flatMap((part: any) => (part.type === "text" ? [part.text] : [])).join("");
  }
  type Printed = { at: number; entry: any } | { at: number; setup: SetupRecord };
  function merge(entries: readonly any[], setups: readonly SetupRecord[]): Printed[] {
    const printed: Printed[] = [...entries.map((entry) => ({ at: entry.timestamp, entry })), ...setups.map((setup) => ({ at: setup.at, setup }))];
    return printed.sort((left, right) => left.at - right.at || (("setup" in left ? 1 : 0) - ("setup" in right ? 1 : 0)));
  }
  function formatSetupBlock(record: SetupRecord, row: SetupState | null, now: number): string {
    const lines = [`[setup] ${record.id} ${new Date(record.at).toISOString()} ${setupEnding(record, row, now)}`];
    if (record.output !== "") lines.push(...record.output.replace(/\n$/, "").split("\n"));
    return `${lines.join("\n")}\n`;
  }
  function setupEnding(record: SetupRecord, row: SetupState | null, now: number): string {
    if (record.ms !== undefined || record.exit !== undefined || record.error !== undefined) return endedAfter(record.exit, record.error, record.ms);
    if (row !== null && row.at === record.at && row.state !== "running") return endedAfter(row.exit, row.error, row.ms);
    return `running (${elapsed(now - record.at)})`;
  }
  function endedAfter(exit: number | undefined, error: string | undefined, ms: number | undefined): string {
    const how = exit !== undefined ? `exit ${exit}` : error !== undefined ? `error ${error}` : "ended";
    return ms === undefined ? how : `${how} after ${elapsed(ms)}`;
  }
  function formatEntry(entry: any): string {
    const at = new Date(entry.timestamp).toISOString();
    const lines: string[] = [];
    switch (entry.type) {
      case "message": {
        const message = entry.message;
        lines.push(`[${message.role}] ${entry.id} ${at}`);
        if (message.role === "toolResult") {
          lines[0] = `[result ${message.toolName}] ${entry.id} ${at}${message.isError ? " error" : ""}`;
          lines.push(...messageTextBefore(message).replace(/\n$/, "").split("\n"));
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
          if (message.role === "assistant" && message.errorMessage !== undefined && message.errorMessage !== "") lines.push(`[error] ${message.errorMessage}`);
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
  return {
    messageText: messageTextBefore,
    log(entries: readonly any[], setups: readonly SetupRecord[], row: SetupState | null, now: number): string {
      return merge(entries, setups)
        .map((item) => ("entry" in item ? formatEntry(item.entry) : formatSetupBlock(item.setup, row, now)))
        .join("\n");
    },
  };
})();

const AT = 1_757_620_443_122;
const NOW = AT + 400_000;
const iso = (at: number): string => new Date(at).toISOString();

// Bleat phase 1's fixtures (`bleat.test.ts`), as `sheep log`'s command-ring test gives them to its fake home.
const call = { id: "e1", type: "message", timestamp: AT - 2_000, message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "pnpm build" } }] } };
const result = { id: "e2", type: "message", timestamp: AT + 200_000, message: { role: "toolResult", toolName: "bash", content: [{ type: "text", text: "built\n" }] } };
const record: SetupRecord = { id: `setup-${AT}`, at: AT, ms: 112_000, command: "bash /pasture/setup.sh", exit: 0, output: "installed the tool\nready\n", truncated: false };
const failed: SetupRecord = { id: `setup-${AT + 300_000}`, at: AT + 300_000, ms: 12_400, command: "bash /pasture/setup.sh", exit: 1, output: "setup.sh: line 3: nope\n", truncated: false };
const EVICTED = "the cell was evicted while setup.sh was running, so nothing is running it now";
const runningRecord: SetupRecord = { id: `setup-${AT}`, at: AT, command: "bash /pasture/setup.sh", output: "", truncated: false };
const WARNING = "Assistant request was interrupted. The preceding content is the latest committed partial; newer live output may be missing and the external outcome is unknown.";
const interrupted = { id: "e3", type: "message", timestamp: AT + 1_000, message: { role: "assistant", content: [], stopReason: "error", errorMessage: WARNING } };
const partial = { id: "e4", type: "message", timestamp: AT + 2_000, message: { role: "assistant", content: [{ type: "text", text: "half a" }], stopReason: "error", errorMessage: WARNING } };
const reply = { id: "e5", type: "message", timestamp: AT + 3_000, message: { role: "assistant", content: [{ type: "text", text: "the reply\n" }], stopReason: "stop" } };

/**
 * A transcript with everything a page draws: a prompt, a reply that thinks
 * and calls two tools, a setup that the first call rented printing between
 * the call and its result, a result, an error result, the aborted model call
 * as the home ring saw pi write it (no content, `stopReason: "aborted"`,
 * `Request was aborted`), and the rest of pi's entry kinds and part kinds.
 */
const T = AT + 1_000_000;
const usage = { input: 704, output: 3, cacheRead: 508, cacheWrite: 705, totalTokens: 1920, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const PAGE_ENTRIES: any[] = [
  { id: "p1", parentId: null, seq: 1, timestamp: T, type: "message", message: { role: "user", content: "Fix the feed's dates\nand add a test.\n", timestamp: T } },
  {
    id: "p2",
    parentId: "p1",
    seq: 2,
    timestamp: T + 1_000,
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "the dates are ISO\nRSS wants RFC 822" },
        { type: "text", text: "I'll read the feed first." },
        { type: "toolCall", id: "call-read", name: "read", arguments: { path: "src/feed.ts" } },
        { type: "toolCall", id: "call-bash", name: "bash", arguments: { command: `node -e '${"x".repeat(240)}'` } },
      ],
      api: "faux",
      provider: "faux",
      model: "faux-1",
      usage,
      stopReason: "toolUse",
      timestamp: T + 1_000,
    },
  },
  { id: "p3", parentId: "p2", seq: 3, timestamp: T + 60_000, type: "message", message: { role: "toolResult", toolCallId: "call-read", toolName: "read", content: [{ type: "text", text: "line one\nline two\nline three\n" }], isError: false, timestamp: T + 60_000 } },
  { id: "p4", parentId: "p3", seq: 4, timestamp: T + 61_000, type: "message", message: { role: "toolResult", toolCallId: "call-bash", toolName: "bash", content: [{ type: "text", text: "node: not found" }, { type: "image", data: "", mimeType: "image/png" }], isError: true, timestamp: T + 61_000 } },
  { id: "p5", parentId: "p4", seq: 5, timestamp: T + 62_000, type: "message", message: { role: "assistant", content: [], api: "faux", provider: "faux", model: "faux-1", usage, stopReason: "aborted", timestamp: T + 62_000, errorMessage: "Request was aborted" } },
  { id: "p6", parentId: "p5", seq: 6, timestamp: T + 63_000, type: "message", message: { role: "user", content: [{ type: "text", text: "look at this" }, { type: "image", data: "", mimeType: "image/png" }], timestamp: T + 63_000 } },
  { id: "p7", parentId: "p6", seq: 7, timestamp: T + 64_000, type: "message", message: { role: "assistant", content: [{ type: "text", text: "" }], api: "faux", provider: "faux", model: "faux-1", usage, stopReason: "error", timestamp: T + 64_000, errorMessage: "the model is overloaded" } },
  { id: "p8", parentId: "p7", seq: 8, timestamp: T + 65_000, type: "compaction", summary: "the story so far\nin two lines", retainedTail: [], tokensBefore: 12_345, fromHook: false },
  { id: "p9", parentId: "p8", seq: 9, timestamp: T + 66_000, type: "branch_summary", fromId: null, summary: "a branch left behind", fromHook: false },
  { id: "p10", parentId: "p9", seq: 10, timestamp: T + 67_000, type: "custom", customType: "birth", data: { pasture: "blog", repo: "https://github.com/example/blog" } },
  { id: "p11", parentId: "p10", seq: 11, timestamp: T + 68_000, type: "custom", customType: "marker" },
  { id: "p12", parentId: "p11", seq: 12, timestamp: T + 69_000, type: "message", message: { role: "bashExecution", command: "ls", output: "a b", exitCode: 0, timestamp: T + 69_000 } },
  { id: "p13", parentId: "p12", seq: 13, timestamp: T + 70_000, type: "message", message: { role: "toolResult", toolCallId: "call-elsewhere", toolName: "grep", content: [{ type: "text", text: "" }], isError: false, timestamp: T + 70_000 } },
];
const PAGE_SETUPS: SetupRecord[] = [
  { id: `setup-${T + 2_000}`, at: T + 2_000, ms: 45_100, command: "bash /pasture/setup.sh", exit: 0, output: "+ pnpm install --frozen-lockfile\nPackages: +212\nDone in 41.3s\n", truncated: false },
  // Sharing a millisecond with an entry: printed after it.
  { id: `setup-${T + 65_000}`, at: T + 65_000, ms: 1_000, command: "bash /pasture/setup.sh", exit: 1, output: "", truncated: false },
];

/** Every fixture, with the row and the clock `sheep log` would have read it with. */
const FIXTURES: { name: string; entries: any[]; setups: SetupRecord[]; row: SetupState | null; now: number }[] = [
  { name: "bleat: a tool call, its setup, its result, and a failed setup", entries: [call, result], setups: [record, failed], row: null, now: NOW },
  { name: "bleat: a record an eviction cut off, mended on the row", entries: [], setups: [runningRecord], row: { state: "failed", at: AT, error: EVICTED }, now: NOW },
  { name: "bleat: a record still running", entries: [], setups: [{ ...runningRecord, at: NOW - 12_400, id: "setup-now" }], row: { state: "running", at: NOW - 12_400 }, now: NOW },
  { name: "bleat: an empty log", entries: [], setups: [], row: null, now: NOW },
  { name: "tether: an interruption as the error line", entries: [interrupted, partial, reply], setups: [], row: null, now: NOW },
  { name: "a page's transcript: setup, tool calls and results, an error, an abort, and every entry kind", entries: PAGE_ENTRIES, setups: PAGE_SETUPS, row: null, now: NOW },
];

describe("the text face", () => {
  for (const fixture of FIXTURES) {
    it(`prints the bytes herd.ts printed before the move: ${fixture.name}`, () => {
      expect(textOf(blocksOf(fixture.entries, fixture.setups, fixture.row, fixture.now))).toBe(before.log(fixture.entries, fixture.setups, fixture.row, fixture.now));
    });
  }

  it("prints bleat's and tether's blocks as their command-ring tests spell them out", () => {
    const text = (entries: any[], setups: SetupRecord[], row: SetupState | null = null, now = NOW): string => textOf(blocksOf(entries, setups, row, now));
    expect(text([call, result], [record, failed])).toBe(
      `[assistant] e1 ${iso(AT - 2_000)}\n[tool bash] {"command":"pnpm build"}\n\n` +
        `[setup] setup-${AT} ${iso(AT)} exit 0 after 1m 52s\ninstalled the tool\nready\n\n` +
        `[result bash] e2 ${iso(AT + 200_000)}\nbuilt\n\n` +
        `[setup] setup-${AT + 300_000} ${iso(AT + 300_000)} exit 1 after 12.4 s\nsetup.sh: line 3: nope\n`,
    );
    expect(text([], [runningRecord], { state: "failed", at: AT, error: EVICTED })).toBe(`[setup] setup-${AT} ${iso(AT)} error ${EVICTED}\n`);
    expect(text([interrupted, partial, reply], [])).toBe(
      `[assistant] e3 ${iso(AT + 1_000)}\n[error] ${WARNING}\n\n` + `[assistant] e4 ${iso(AT + 2_000)}\nhalf a\n[error] ${WARNING}\n\n` + `[assistant] e5 ${iso(AT + 3_000)}\nthe reply\n`,
    );
  });

  it("is what runLog prints, whole and bounded by --last and --since, with the row asked only for a record with no ending", async () => {
    for (const fixture of FIXTURES) {
      let rowAsks = 0;
      const home = {
        transcript: async () => ({ id: "s", tipId: null, operation: null, entries: fixture.entries, setups: fixture.setups }),
        row: async () => {
          rowAsks++;
          return { id: "s", name: null, createdAt: 0, state: "idle", pasture: null, task: null, secrets: [], setup: fixture.row };
        },
      } as unknown as Home;
      const printed = async (options: { since: string | undefined; last: number | undefined }): Promise<string> => {
        let out = "";
        const code = await runLog(home, "s", options, { json: false, out: (text) => (out += text), err: (text) => expect.fail(text) });
        expect(code).toBe(0);
        return out;
      };
      // runLog reads its own clock, so a fixture whose record is still running is compared for its shape alone.
      const stillRunning = fixture.setups.some((setup) => setup.ms === undefined) && fixture.row?.state === "running";
      const whole = await printed({ since: undefined, last: undefined });
      if (stillRunning) expect(whole).toMatch(/^\[setup] setup-now \S+ running \(.+\)\n$/);
      else expect(whole, fixture.name).toBe(before.log(fixture.entries, fixture.setups, fixture.row, Date.now()));
      expect(rowAsks > 0).toBe(fixture.setups.some((setup) => setup.ms === undefined));
      if (fixture.entries.length > 2) {
        const last = fixture.entries.slice(-2);
        const setups = fixture.setups.filter((setup) => setup.at >= last[0].timestamp);
        expect(await printed({ since: undefined, last: 2 })).toBe(before.log(last, setups, fixture.row, Date.now()));
        const since = fixture.entries.slice(2);
        expect(await printed({ since: fixture.entries[1].id, last: undefined })).toBe(before.log(since, fixture.setups.filter((setup) => setup.at >= fixture.entries[1].timestamp), fixture.row, Date.now()));
      }
    }
  });
});

describe("the blocks", () => {
  const blocks = blocksOf(PAGE_ENTRIES, PAGE_SETUPS, null, NOW);
  const byId = (id: string): Block => blocks.find((block) => block.id === id)!;

  it("are one per entry and setup, in sheep log's order", () => {
    expect(blocks.map((block) => `${block.kind} ${block.id}`)).toEqual([
      "prompt p1",
      "reply p2",
      `setup setup-${T + 2_000}`,
      "result p3",
      "result p4",
      "reply p5",
      "prompt p6",
      "reply p7",
      "compaction p8",
      `setup setup-${T + 65_000}`,
      "branch_summary p9",
      "custom p10",
      "custom p11",
      "message p12",
      "result p13",
    ]);
  });

  it("carry a tool call's name, arguments, and the result paired to it by the call's id, isError kept", () => {
    const calls = byId("p2");
    expect(calls.kind).toBe("reply");
    if (calls.kind !== "reply") return;
    expect(calls.parts.map((part) => part.kind)).toEqual(["thinking", "text", "tool", "tool"]);
    expect(calls.parts[0]).toEqual({ kind: "thinking", line: "the dates are ISO" });
    const [read, bash] = calls.parts.slice(2) as Extract<(typeof calls.parts)[number], { kind: "tool" }>[];
    expect(read).toMatchObject({ callId: "call-read", name: "read", args: '{"path":"src/feed.ts"}', arguments: { path: "src/feed.ts" } });
    expect(read!.result).toBe(byId("p3"));
    expect(read!.result).toMatchObject({ kind: "result", toolName: "read", callId: "call-read", text: "line one\nline two\nline three\n", isError: false, paired: true });
    expect(bash!.args.endsWith("…")).toBe(true);
    expect(bash!.result).toMatchObject({ id: "p4", isError: true, text: "node: not found", paired: true });
    // A result no call in this list claims stands alone.
    expect(byId("p13")).toMatchObject({ kind: "result", callId: "call-elsewhere", paired: false, text: "" });
  });

  it("carry an abort as pi's entries do: the reply that ended aborted, with pi's sentence; an error is not an abort", () => {
    expect(byId("p5")).toMatchObject({ kind: "reply", parts: [], error: "Request was aborted", aborted: true });
    expect(byId("p7")).toMatchObject({ kind: "reply", parts: [{ kind: "text", text: "" }], error: "the model is overloaded", aborted: false });
    expect(blocksOf([interrupted], [], null, NOW)[0]).toMatchObject({ error: WARNING, aborted: false });
  });

  it("carry a setup's ending and its output's lines, and a running one's elapsed time from the clock", () => {
    expect(byId(`setup-${T + 2_000}`)).toMatchObject({ kind: "setup", ending: "exit 0 after 45.1 s", running: false, lines: ["+ pnpm install --frozen-lockfile", "Packages: +212", "Done in 41.3s"] });
    expect(byId(`setup-${T + 65_000}`)).toMatchObject({ ending: "exit 1 after 1.0 s", lines: [] });
    expect(blocksOf([], [{ ...runningRecord, at: NOW - 9_000 }], null, NOW)[0]).toMatchObject({ ending: "running (9.0 s)", running: true });
  });

  it("carry the prompt's parts, and what the rest of pi's entries say", () => {
    expect(byId("p1")).toMatchObject({ kind: "prompt", parts: [{ kind: "text", text: "Fix the feed's dates\nand add a test.\n" }] });
    expect(byId("p6")).toMatchObject({ kind: "prompt", parts: [{ kind: "text", text: "look at this" }, { kind: "other", type: "image" }] });
    expect(byId("p8")).toMatchObject({ kind: "compaction", summary: "the story so far\nin two lines" });
    expect(byId("p10")).toMatchObject({ kind: "custom", customType: "birth", data: '{"pasture":"blog","repo":"https://github.com/example/blog"}' });
    expect(byId("p11")).toMatchObject({ kind: "custom", data: null });
    expect(byId("p12")).toMatchObject({ kind: "message", role: "bashExecution" });
  });

  it("messageText is the one the client exported, and says what it said", () => {
    expect(clientMessageText).toBe(messageText);
    for (const entry of [...PAGE_ENTRIES, call, result, interrupted, partial, reply]) if (entry.type === "message") expect(messageText(entry.message)).toBe(before.messageText(entry.message));
  });

  it("imports no runtime but setup-words, so the page can bundle it", () => {
    const source = readFileSync(new URL("../src/blocks.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import (type )?.*? from "([^"]+)";$/gm)].map((match) => ({ type: match[1] !== undefined, from: match[2] }));
    expect(imports.filter((one) => !one.type).map((one) => one.from)).toEqual(["./setup-words.js"]);
    expect(source).not.toMatch(/\bprocess\.|node:|\brequire\(/);
  });
});
