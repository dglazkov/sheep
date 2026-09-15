/**
 * Hill phase 3 in the checkout ring: a sheep's page's logic with no browser
 * and no home. The wake rule (a row with no task and no setup asks nothing
 * of its cell), the loop over `GET /s/<id>/` and the transcript's long poll
 * as a schedule over a fake clock and a fake client (one request open at a
 * time, a rest when no turn is open, none started while hidden, a 404 the
 * end), following the bottom as a function of the scroll and new blocks, a
 * thousand entries to blocks in one copy, and what the page draws of them.
 */
import { describe, expect, it } from "vitest";
import { blocksOf } from "../../cli/src/blocks.ts";
import type { Clock, SessionRow } from "../src/flock.ts";
import { type Answer, homeClient, type SheepClient } from "../src/home.ts";
import {
  argSummary,
  asksCell,
  atBottom,
  EMPTY,
  foldKey,
  foldLabel,
  Held,
  openTool,
  quietWords,
  READING,
  type Reading,
  readCell,
  readTranscript,
  REST_MS,
  scrollAfter,
  SETUP_RUNNING,
  TranscriptFollow,
  type TranscriptView,
  UNASKED,
} from "../src/sheep.ts";

const NOW = Date.parse("2026-09-14T20:00:00Z");
const ID = "01a0a339-b572-72b5-a62a-b10aea490503";

const row = (fields: Partial<SessionRow>): SessionRow => ({ id: ID, name: null, createdAt: NOW - 60_000, state: "idle", pasture: null, task: null, secrets: [], setup: null, ...fields });

describe("looking never wakes a sheep", () => {
  it("a row with no task and no setup asks nothing of its cell, however the setup field is missing", () => {
    expect(asksCell(row({ task: null, setup: null }))).toBe(false);
    expect(asksCell({ task: null })).toBe(false);
    expect(asksCell({ task: null, setup: undefined })).toBe(false);
    expect(quietWords(row({}), undefined, 0)).toBe(UNASKED);
  });

  it("a row with a task, or a setup of any state, is a sheep something has asked, and its cell is read", () => {
    expect(asksCell(row({ task: "write the note" }))).toBe(true);
    for (const state of ["running", "ok", "failed"] as const) expect(asksCell(row({ setup: { state, at: NOW - 1_000 } }))).toBe(true);
    // A sheep being born says so from its row before the cell answers, and one that is asked and read has nothing to say.
    expect(quietWords(row({ task: "go", setup: { state: "running", at: NOW } }), undefined, 0)).toBe(SETUP_RUNNING);
    expect(quietWords(row({ task: "go" }), undefined, 0)).toBe(READING);
    const view: TranscriptView = { id: ID, tipId: null, operation: null, entries: [] };
    expect(quietWords(row({ task: "go" }), view, 0)).toBe(EMPTY);
    expect(quietWords(row({ task: "go" }), view, 3)).toBeNull();
  });
});

describe("an answer read", () => {
  const ok = (text: string): Answer => ({ status: 200, text, build: null });

  it("the cell's state names the operation; the transcript is the whole view", () => {
    expect(readCell(ok(JSON.stringify({ id: ID, tipId: "t", operation: { id: "op", kind: "prompt", startedAt: 1 } })))).toEqual({ kind: "cell", operation: { id: "op", kind: "prompt", startedAt: 1 } });
    expect(readCell(ok(JSON.stringify({ id: ID, tipId: null, operation: null })))).toEqual({ kind: "cell", operation: null });
    const view = { id: ID, tipId: "t", operation: null, entries: [], setups: [] };
    expect(readTranscript(ok(JSON.stringify(view)))).toEqual({ kind: "view", view });
  });

  it("a 404 is the sheep gone, a 401 the seat gone, and anything else asked again", () => {
    for (const read of [readCell, readTranscript]) {
      expect(read({ status: 404, text: `no session ${ID} at this home; \`sheep ls\` lists the ones there are`, build: null })).toEqual({ kind: "gone" });
      expect(read({ status: 401, text: "bad or missing token", build: null })).toEqual({ kind: "seatless" });
      expect(read({ status: 500, text: "boom", build: null })).toEqual({ kind: "silent" });
      expect(read(undefined)).toEqual({ kind: "silent" });
      expect(read(ok("<html>"))).toEqual({ kind: "silent" });
    }
    expect(readTranscript(ok("{}"))).toEqual({ kind: "silent" });
  });
});

/** A clock whose time moves only when told, running each timer as its moment passes. */
function fakeClock(): Clock & { advance(ms: number): Promise<void> } {
  let now = 0;
  let timers: { at: number; run: () => void; live: boolean }[] = [];
  return {
    now: () => now,
    after(ms, run) {
      const timer = { at: now + ms, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        const next = timers.filter((timer) => timer.live && timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (next === undefined) break;
        now = next.at;
        next.live = false;
        timers = timers.filter((timer) => timer.live);
        next.run();
      }
      now = end;
      await flush();
    },
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/** A cell that holds every request until the case answers it, and counts how many are open at once. */
function heldCell(clock: Clock) {
  const asked: { what: string; at: number; signal: AbortSignal | undefined; answer: (answer: Answer | Error) => void }[] = [];
  let open = 0;
  let most = 0;
  const hold = (what: string, signal: AbortSignal | undefined): Promise<Answer> =>
    new Promise((resolve, reject) => {
      open++;
      most = Math.max(most, open);
      let settled = false;
      const settle = (answer: Answer | Error): void => {
        if (settled) return;
        settled = true;
        open--;
        if (answer instanceof Error) reject(answer);
        else resolve(answer);
      };
      signal?.addEventListener("abort", () => settle(new DOMException("aborted", "AbortError") as unknown as Error), { once: true });
      asked.push({ what, at: clock.now(), signal, answer: settle });
    });
  const client: SheepClient = {
    cell: (id, signal) => hold(`cell ${id}`, signal),
    transcript: (id, tip, signal) => hold(`transcript ${id} tip=${tip ?? ""}`, signal),
  };
  return {
    client,
    asked,
    get open() {
      return open;
    },
    get most() {
      return most;
    },
    last: () => asked.at(-1)!,
  };
}

const json = (value: unknown): Answer => ({ status: 200, text: JSON.stringify(value), build: null });
const viewAnswer = (tipId: string | null, operation: TranscriptView["operation"], entries: unknown[] = []): Answer => json({ id: ID, tipId, operation, entries, setups: [] });
const OPEN = { id: "op-1", kind: "prompt", startedAt: 1 };

describe("the transcript loop", () => {
  it("asks the cell first, then the transcript from the last tip, one request open at a time", async () => {
    const clock = fakeClock();
    const cell = heldCell(clock);
    const landed: Reading[] = [];
    const follow = new TranscriptFollow(cell.client, ID, (reading) => landed.push(reading), clock);
    follow.visible(true);
    expect(cell.asked.map((one) => one.what)).toEqual([`cell ${ID}`]);
    // However the tab is toggled while it is open, nothing else starts.
    follow.visible(false);
    follow.visible(true);
    follow.visible(true);
    await clock.advance(30_000);
    expect(cell.asked).toHaveLength(1);

    cell.last().answer(json({ id: ID, tipId: "t1", operation: OPEN }));
    await flush();
    expect(landed.at(-1)).toEqual({ kind: "cell", operation: OPEN });
    expect(cell.asked.map((one) => one.what)).toEqual([`cell ${ID}`, `transcript ${ID} tip=`]);

    // A turn open: the long poll lands and the next is asked at once, from the tip it named.
    cell.last().answer(viewAnswer("t1", OPEN));
    await flush();
    expect(cell.last().what).toBe(`transcript ${ID} tip=t1`);
    cell.last().answer(viewAnswer("t2", OPEN));
    await flush();
    expect(cell.last().what).toBe(`transcript ${ID} tip=t2`);
    expect(cell.most).toBe(1);
    expect(follow.asking).toBe(true);
    follow.stop();
  });

  it("rests two seconds after an answer with no turn open, and after a failure, and never stacks", async () => {
    const clock = fakeClock();
    const cell = heldCell(clock);
    const follow = new TranscriptFollow(cell.client, ID, () => {}, clock);
    follow.visible(true);
    cell.last().answer(json({ id: ID, tipId: null, operation: null }));
    await flush();
    const idle = cell.asked.length;
    cell.last().answer(viewAnswer("t1", null));
    await clock.advance(REST_MS - 1);
    expect(cell.asked).toHaveLength(idle);
    await clock.advance(1);
    expect(cell.asked).toHaveLength(idle + 1);
    expect(cell.last().at).toBe(REST_MS);
    // Toggling the tab during a rest does not cut it short.
    cell.last().answer(viewAnswer("t1", null));
    await clock.advance(500);
    follow.visible(false);
    follow.visible(true);
    await flush();
    expect(cell.asked).toHaveLength(idle + 1);
    await clock.advance(REST_MS - 500);
    expect(cell.asked).toHaveLength(idle + 2);
    // A failure (no answer at all) rests too, then asks again.
    cell.last().answer(new TypeError("Failed to fetch"));
    await clock.advance(REST_MS - 1);
    expect(cell.asked).toHaveLength(idle + 2);
    await clock.advance(1);
    expect(cell.asked).toHaveLength(idle + 3);
    expect(cell.most).toBe(1);
    follow.stop();
  });

  it("starts nothing while hidden, however long; the one in flight lands and is handed on; visible again asks", async () => {
    const clock = fakeClock();
    const cell = heldCell(clock);
    const landed: Reading[] = [];
    const follow = new TranscriptFollow(cell.client, ID, (reading) => landed.push(reading), clock);
    follow.visible(true);
    cell.last().answer(json({ id: ID, tipId: "t1", operation: OPEN }));
    await flush();
    follow.visible(false);
    cell.last().answer(viewAnswer("t2", OPEN));
    await clock.advance(8 * 3_600_000);
    expect(landed.at(-1)).toMatchObject({ kind: "view", view: { tipId: "t2" } });
    expect(cell.asked).toHaveLength(2);
    expect(follow.asking).toBe(false);
    follow.visible(true);
    await flush();
    expect(cell.asked).toHaveLength(3);
    expect(cell.last().what).toBe(`transcript ${ID} tip=t2`);
    follow.stop();
  });

  it("a 404 is the end: handed on as gone, and nothing asked after it", async () => {
    const clock = fakeClock();
    const cell = heldCell(clock);
    const landed: Reading[] = [];
    const follow = new TranscriptFollow(cell.client, ID, (reading) => landed.push(reading), clock);
    follow.visible(true);
    cell.last().answer(json({ id: ID, tipId: "t1", operation: OPEN }));
    await flush();
    cell.last().answer({ status: 404, text: "no session", build: null });
    await clock.advance(60_000);
    expect(landed.at(-1)).toEqual({ kind: "gone" });
    expect(follow.stopped).toBe(true);
    expect(cell.asked).toHaveLength(2);
  });

  it("stop aborts the request in flight and hands nothing on", async () => {
    const clock = fakeClock();
    const cell = heldCell(clock);
    const landed: Reading[] = [];
    const follow = new TranscriptFollow(cell.client, ID, (reading) => landed.push(reading), clock);
    follow.visible(true);
    const first = cell.last();
    follow.stop();
    expect(first.signal?.aborted).toBe(true);
    await clock.advance(60_000);
    expect(landed).toEqual([]);
    expect(cell.open).toBe(0);
    expect(cell.asked).toHaveLength(1);
  });

  it("the client asks the two routes at the page's own origin, with no header of its own, and hands the signal on", async () => {
    const asked: { input: string; init: RequestInit }[] = [];
    const client = homeClient(async (input, init) => {
      asked.push({ input, init });
      return new Response("{}", { status: 200 });
    });
    const controller = new AbortController();
    await client.cell(ID, controller.signal);
    await client.transcript(ID, null, controller.signal);
    await client.transcript(ID, "01a0a33a-0000-7000-8000-000000000001", controller.signal);
    expect(asked.map(({ input, init }) => `${init.method} ${input}`)).toEqual([
      `GET /s/${ID}/`,
      `GET /s/${ID}/transcript?wait=25000&tip=`,
      `GET /s/${ID}/transcript?wait=25000&tip=01a0a33a-0000-7000-8000-000000000001`,
    ]);
    for (const { input, init } of asked) {
      expect(init.headers).toBeUndefined();
      expect(init.signal).toBe(controller.signal);
      expect(init.credentials).toBe("same-origin");
      expect(`${input} ${JSON.stringify({ ...init, signal: undefined })}`.toLowerCase()).not.toMatch(/token|bearer|authorization/);
    }
  });
});

describe("following the bottom", () => {
  it("at the bottom, the new bottom; within a few pixels counts as at it", () => {
    expect(atBottom({ top: 600, height: 1000, client: 400 })).toBe(true);
    expect(atBottom({ top: 595, height: 1000, client: 400 })).toBe(true);
    expect(scrollAfter({ top: 600, height: 1000, client: 400 }, { height: 1300, client: 400 })).toBe(900);
    expect(scrollAfter({ top: 594, height: 1000, client: 400 }, { height: 1300, client: 400 })).toBe(900);
    // A page shorter than its scroller is at its bottom, and stays there.
    expect(scrollAfter({ top: 0, height: 300, client: 400 }, { height: 350, client: 400 })).toBe(0);
    expect(scrollAfter({ top: 0, height: 300, client: 400 }, { height: 900, client: 400 })).toBe(500);
  });

  it("the new bottom is the scroller's size after the drawing: a head that grew a line in the same drawing does not leave the reader short of it", () => {
    // The walk at a phone's width: the head wrapped to two lines as the turn opened, and the scroller lost 23 px.
    expect(scrollAfter({ top: 0, height: 684, client: 684 }, { height: 725, client: 661 })).toBe(64);
    expect(atBottom({ top: 64, height: 725, client: 661 })).toBe(true);
  });

  it("scrolled up, where the reader was, however much lands", () => {
    expect(atBottom({ top: 200, height: 1000, client: 400 })).toBe(false);
    expect(scrollAfter({ top: 200, height: 1000, client: 400 }, { height: 1300, client: 400 })).toBe(200);
    expect(scrollAfter({ top: 0, height: 1000, client: 400 }, { height: 50_000, client: 380 })).toBe(0);
  });
});

/** A generated transcript of `count` entries: prompts, replies with a tool call each, and their results. */
function transcriptOf(count: number, tip = "tip"): TranscriptView {
  const entries: unknown[] = [];
  for (let i = 0; entries.length < count; i++) {
    const at = NOW + i * 1_000;
    entries.push({ id: `u${i}`, parentId: null, seq: entries.length, timestamp: at, type: "message", message: { role: "user", content: `prompt ${i}`, timestamp: at } });
    entries.push({ id: `a${i}`, parentId: null, seq: entries.length, timestamp: at + 1, type: "message", message: { role: "assistant", content: [{ type: "text", text: `reply ${i}` }, { type: "toolCall", id: `c${i}`, name: "bash", arguments: { command: `echo ${i}` } }], stopReason: "toolUse", timestamp: at + 1 } });
    entries.push({ id: `r${i}`, parentId: null, seq: entries.length, timestamp: at + 2, type: "message", message: { role: "toolResult", toolCallId: `c${i}`, toolName: "bash", content: [{ type: "text", text: `${i}\n` }], isError: false, timestamp: at + 2 } });
  }
  return { id: ID, tipId: tip, operation: null, entries: entries.slice(0, count) as TranscriptView["entries"], setups: [] };
}

describe("a thousand entries", () => {
  it("become a thousand blocks, each over the entry it came from, in the one copy the page holds", () => {
    const held = new Held();
    const first = transcriptOf(1000, "t1");
    expect(held.take(first, null, NOW)).toBe(true);
    expect(held.blocks).toHaveLength(1000);
    expect(held.view).toBe(first);
    const second = transcriptOf(1000, "t2");
    expect(held.take(second, null, NOW)).toBe(true);
    // Replaced, not appended to: the view is the second answer itself, and every block stands on its entries, none on the first's.
    expect(held.view).toBe(second);
    expect(held.blocks).toHaveLength(1000);
    for (const [index, block] of held.blocks.entries()) {
      if (block.kind === "setup") continue;
      expect(block.entry).toBe(second.entries[index]);
    }
    const reply = held.blocks[1]!;
    expect(reply.kind === "reply" && reply.parts[1]!.kind === "tool" && reply.parts[1]!.result === held.blocks[2]).toBe(true);
  });

  it("an answer that says nothing new keeps the copy held and draws nothing again", () => {
    const held = new Held();
    const first = transcriptOf(30, "t1");
    held.take(first, null, NOW);
    const blocks = held.blocks;
    expect(held.take(transcriptOf(30, "t1"), null, NOW)).toBe(false);
    expect(held.view).toBe(first);
    expect(held.blocks).toBe(blocks);
    expect(held.take({ ...transcriptOf(30, "t1"), operation: OPEN }, null, NOW)).toBe(true);
  });
});

describe("what the page draws of the blocks", () => {
  const view = transcriptOf(6);
  // The last reply's call without its result: the tool the sheep is on.
  const running = { ...view, entries: view.entries.slice(0, 5) };
  const blocks = blocksOf(running.entries, [], null, NOW);

  it("the tool the sheep is on is the last call with no result, while a turn is open, and none when it is not", () => {
    expect(openTool(blocks, OPEN)).toMatchObject({ part: { name: "bash", callId: "c1" }, at: NOW + 1_001 });
    expect(openTool(blocks, null)).toBeUndefined();
    expect(openTool(blocksOf(view.entries, [], null, NOW), OPEN)).toBeUndefined();
  });

  it("a call's line says its command or path, else its arguments as sheep log prints them", () => {
    expect(argSummary({ arguments: { command: "pnpm test" }, args: '{"command":"pnpm test"}' })).toBe("pnpm test");
    expect(argSummary({ arguments: { path: "src/feed.ts", offset: 3 }, args: "…" })).toBe("src/feed.ts");
    expect(argSummary({ arguments: { pattern: "rss" }, args: '{"pattern":"rss"}' })).toBe("rss");
    expect(argSummary({ arguments: { a: 1, b: "two" }, args: '{"a":1,"b":"two"}' })).toBe('{"a":1,"b":"two"}');
  });

  it("a folded result says its line count, or result, and error when it was one; the fold is kept by entry and call", () => {
    expect(foldLabel({ text: "a\nb\nc\n", isError: false })).toBe("3 lines");
    expect(foldLabel({ text: "one line\n", isError: false })).toBe("result");
    // The walk's bash result: one line of output and the blank line the tool trails, which is not a second line to open.
    expect(foldLabel({ text: "bash: line 1: hello: command not found\n\n", isError: false })).toBe("result");
    expect(foldLabel({ text: "", isError: false })).toBe("result");
    expect(foldLabel({ text: "no\nsuch file", isError: true })).toBe("error · 2 lines");
    expect(foldKey({ id: "a1" }, "c1")).toBe("a1:c1");
  });
});
