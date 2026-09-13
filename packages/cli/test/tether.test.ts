/**
 * Tether's journeys 1 to 3 and journey 4 step 2 through the built CLI
 * against a local home: `wrangler dev` with the faux provider, scripted
 * with one text step after a delay, so a turn is running when the home is
 * restarted. The restart is `local-home.ts`'s `restartHome`: the process
 * stopped (its sockets to the cells closed with it) and started again on
 * the same port and the same state, which is what a restart is on a local
 * home. Skips, with a message, when the home cannot be started here, or
 * was not spawned by this file (`SHEEP_TEST_HOME`) and so cannot be
 * restarted.
 *
 * The held commands are `streamSheep` children, so each one's exit is
 * timed against the reply's own timestamp in `sheep log --json`: "within
 * seconds of the reply landing" is a claim about when the process ended,
 * and the transcript says when the reply landed. Every restart here happens
 * while every held command is already attached, and the assertions name
 * what a command that did not hear the drop would do instead: hang until
 * its timeout (journey 1), or write an entry twice (journey 2).
 */
import { afterAll, describe, expect, it } from "vitest";
import { type LocalHome, type Result, restartHome, runSheep, scriptFaux, startHome, stopHome, type Streamed, streamSheep, unrestartable } from "./local-home.js";

const TOKEN = "tether-token";

const started = await startHome(TOKEN);
const home: LocalHome | string = typeof started === "string" ? started : (unrestartable(started) ?? started);
if (typeof started !== "string" && typeof home === "string") await stopHome(started);
// Written to stderr directly: the runner swallows console output while it collects tests.
if (typeof home === "string") process.stderr.write(`tether skipped: ${home}\n`);

/** How long the model takes to answer: the turn a restart lands in, and runs again after it. */
const DELAY_MS = 20_000;
const REPLY = "held through the tug";
const TURN = { steps: [{ text: REPLY, delayMs: DELAY_MS }] };
/** When the restart comes, after the held commands are attached and the turn is running. */
const RESTART_AFTER_MS = 4_000;
/** How soon after the reply lands a held command must have exited: the drop was heard, not timed out. */
const PROMPTLY_MS = 5_000;
/** The seam's window in journey 4, instead of two minutes. */
const WINDOW_MS = 5_000;

const INTERRUPTED = /^Assistant request was interrupted\./;

type Logged = { id: string; type: string; timestamp: number; message?: { role: string; stopReason?: string; errorMessage?: string; content?: unknown } };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** One line of JSON with its keys sorted at every depth: the wire's entry and the log's differ only in key order (bell). */
function canonical(json: string): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (typeof value !== "object" || value === null) return value;
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return Object.fromEntries(entries.map(([key, held]) => [key, sort(held)]));
  };
  return JSON.stringify(sort(JSON.parse(json)));
}

/** The timeline, for the record. */
function say(what: string, streamed: Streamed, spawned: number, reference: number): void {
  const rows = streamed.lines.map((line) => `    ${String(line.at).padStart(6)} ms ${line.running ? "running" : "exited "} ${line.text.slice(0, 140)}`);
  process.stderr.write(`tether: ${what} (exit ${streamed.code} at ${spawned + streamed.exited - reference} ms)\n${rows.join("\n")}\n    stderr: ${JSON.stringify(streamed.stderr)}\n`);
}

describe.skipIf(typeof home === "string")("tether: a dog holds its sheep through the home's restart", () => {
  afterAll(async () => {
    if (typeof home === "string") return;
    await stopHome(home);
  });

  function local(): LocalHome {
    if (typeof home === "string") throw new Error(home);
    return home;
  }

  async function sheep(...args: string[]): Promise<Result> {
    return runSheep(local(), args);
  }

  /** A held command: spawned now, with the wall clock of its spawn so its exit can be set against the transcript's timestamps. */
  function hold(args: string[], env?: Record<string, string>): { spawned: number; done: Promise<Streamed> } {
    const spawned = Date.now();
    return { spawned, done: streamSheep(local(), args, { env }) };
  }

  /** A sheep minted idle, answering from `TURN`. */
  async function mint(): Promise<string> {
    const minted = await sheep("new", "--detach");
    expect(minted.code).toBe(0);
    expect(minted.stdout).toMatch(/^[0-9a-f-]{36}\n$/);
    const id = minted.stdout.trim();
    expect(await scriptFaux(local(), `/s/${id}/faux`, TURN)).toBe(200);
    return id;
  }

  async function logged(id: string): Promise<{ lines: string[]; entries: Logged[] }> {
    const log = await sheep("log", id, "--json");
    expect(log.code).toBe(0);
    const lines = log.stdout.trimEnd().split("\n").filter(Boolean);
    return { lines, entries: lines.map((line) => JSON.parse(line) as Logged) };
  }

  /** Polls the row until the lane is running: the prompt is durable in the cell, so a restart lands inside the turn. */
  async function running(id: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const rows = JSON.parse((await sheep("ls", "--json")).stdout) as Array<{ id: string; state: string }>;
      if (rows.find((row) => row.id === id)?.state === "running") return;
      await sleep(250);
    }
    throw new Error(`${id} never showed running`);
  }

  /** The restart, timed. */
  async function restart(): Promise<void> {
    const down = await restartHome(local());
    process.stderr.write(`tether: the home restarted; ${down} ms not answering\n`);
  }

  /** The interruption and the reply, the last two assistant entries of a turn a restart cut. */
  function interruptedTurn(entries: readonly Logged[]): { interruption: Logged; reply: Logged } {
    const assistants = entries.filter((entry) => entry.message?.role === "assistant");
    const interruption = assistants.at(-2);
    const reply = assistants.at(-1);
    expect(interruption?.message?.stopReason).toBe("error");
    expect(interruption?.message?.errorMessage).toMatch(INTERRUPTED);
    expect(JSON.stringify(reply?.message?.content)).toContain(REPLY);
    expect(reply?.message?.errorMessage).toBeUndefined();
    return { interruption: interruption!, reply: reply! };
  }

  it("journeys 1 and 3: sheep wait returns through a restart, and sheep log says the call was interrupted", { timeout: 300_000 }, async () => {
    const a = await mint();
    const b = await mint();
    const shortTimeoutS = Math.round((RESTART_AFTER_MS + DELAY_MS) / 2_000);

    // Step 1: two turns whose model calls take a while, started detached.
    for (const id of [a, b]) expect(await sheep("attach", id, "--detach", "--", "take your time")).toEqual({ code: 0, stdout: `${id}\n`, stderr: "" });
    await Promise.all([running(a), running(b)]);

    // Step 2: the waits, held. One id; the same id in --json; two ids at once; and one whose timeout is shorter than the turn.
    const one = hold(["wait", "--timeout", "150", a]);
    const json = hold(["wait", "--timeout", "150", "--json", a]);
    const both = hold(["wait", "--timeout", "150", a, b]);
    const short = hold(["wait", "--timeout", String(shortTimeoutS), a]);
    await sleep(RESTART_AFTER_MS);

    // Step 3: the home restarts while the turns run.
    const restartedAt = Date.now();
    await restart();

    const [oneDone, jsonDone, bothDone, shortDone] = await Promise.all([one.done, json.done, both.done, short.done]);
    say(`sheep wait ${a}`, oneDone, one.spawned, restartedAt);
    say(`sheep wait --json ${a}`, jsonDone, json.spawned, restartedAt);
    say(`sheep wait ${a} ${b}`, bothDone, both.spawned, restartedAt);
    say(`sheep wait --timeout ${shortTimeoutS} ${a}`, shortDone, short.spawned, restartedAt);

    const logA = await logged(a);
    const logB = await logged(b);
    const turnA = interruptedTurn(logA.entries);
    const turnB = interruptedTurn(logB.entries);

    // Steps 4 and 5: the stderr line once, then `<id>\t<reply>` and exit 0, within seconds of the reply landing. A wait that
    // never heard the drop exits 124 at its timeout instead, long after the reply.
    expect(oneDone.code).toBe(0);
    expect(oneDone.stdout).toBe(`${a}\t${REPLY}\n`);
    expect(oneDone.stderr).toBe(`sheep: ${a}: the connection dropped; attached again\n`);
    const oneExit = one.spawned + oneDone.exited;
    expect(oneExit - turnA.reply.timestamp).toBeLessThan(PROMPTLY_MS);
    expect(oneExit).toBeGreaterThanOrEqual(turnA.reply.timestamp);

    // The first criterion: --json prints what it prints without a restart, one array with the last assistant entry.
    expect(jsonDone.code).toBe(0);
    expect(jsonDone.stderr).toBe(`sheep: ${a}: the connection dropped; attached again\n`);
    const unrestarted = await sheep("wait", "--timeout", "30", "--json", a);
    expect(unrestarted.code).toBe(0);
    expect(jsonDone.lines).toHaveLength(1);
    expect(canonical(jsonDone.stdout)).toBe(canonical(unrestarted.stdout));
    const array = JSON.parse(jsonDone.stdout) as Array<{ id: string; message: Logged }>;
    expect(array.map((item) => item.id)).toEqual([a]);
    expect(array[0]!.message.id).toBe(turnA.reply.id);

    // The second: two ids waited on at once, both restarted, both return, each said once.
    expect(bothDone.code).toBe(0);
    expect(bothDone.stdout.split("\n").filter(Boolean).sort()).toEqual([`${a}\t${REPLY}`, `${b}\t${REPLY}`].sort());
    expect(bothDone.stderr.split("\n").filter(Boolean).sort()).toEqual([`sheep: ${a}: the connection dropped; attached again`, `sheep: ${b}: the connection dropped; attached again`].sort());
    expect(both.spawned + bothDone.exited - Math.max(turnA.reply.timestamp, turnB.reply.timestamp)).toBeLessThan(PROMPTLY_MS);

    // The third: a timeout shorter than the turn still exits 124 at the timeout, the drop between.
    expect(shortDone.code).toBe(124);
    expect(shortDone.exited).toBeGreaterThanOrEqual(shortTimeoutS * 1000);
    expect(shortDone.exited).toBeLessThan(shortTimeoutS * 1000 + PROMPTLY_MS);
    expect(short.spawned + shortDone.exited).toBeLessThan(turnA.reply.timestamp);

    // Journey 3 step 1: the interruption as an [assistant] block whose last line is [error] …, then the reply's block.
    const text = await sheep("log", a);
    expect(text.code).toBe(0);
    const iso = (at: number): string => new Date(at).toISOString();
    expect(text.stdout).toContain(
      `[assistant] ${turnA.interruption.id} ${iso(turnA.interruption.timestamp)}\n[error] ${turnA.interruption.message!.errorMessage}\n\n[assistant] ${turnA.reply.id} ${iso(turnA.reply.timestamp)}\n${REPLY}\n`,
    );
    // Step 2: an assistant entry with no error prints as it did, byte for byte: the reply's block is the log's last, and ends there.
    expect(text.stdout.endsWith(`\n[assistant] ${turnA.reply.id} ${iso(turnA.reply.timestamp)}\n${REPLY}\n`)).toBe(true);
    expect(text.stdout.match(/\[error]/g)).toHaveLength(1);
  });

  it("journey 2: a held turn streams through a restart, every entry once, the reply last", { timeout: 300_000 }, async () => {
    const c = await mint();
    const d = await mint();
    const e = await mint();

    // The queued criterion's sheep is busy first: its own turn, detached, which the restart will cut.
    expect(await sheep("attach", e, "--detach", "--", "the first turn")).toEqual({ code: 0, stdout: `${e}\n`, stderr: "" });
    await running(e);

    // Step 1: the held turns, --json and text, and the queued prompt held with --wait.
    const stream = hold(["attach", c, "--json", "--", "stream it"]);
    const text = hold(["attach", d, "--", "say it"]);
    const queued = hold(["attach", e, "--json", "--wait", "--", "the queued turn"]);
    await Promise.all([running(c), running(d)]);
    await sleep(RESTART_AFTER_MS);

    // Step 2: the home restarts while the turns run.
    const restartedAt = Date.now();
    await restart();

    const [streamDone, textDone, queuedDone] = await Promise.all([stream.done, text.done, queued.done]);
    say(`sheep attach ${c} --json`, streamDone, stream.spawned, restartedAt);
    say(`sheep attach ${d}`, textDone, text.spawned, restartedAt);
    say(`sheep attach ${e} --json --wait`, queuedDone, queued.spawned, restartedAt);

    // Step 3: the line once; the command kept going.
    expect(streamDone.code).toBe(0);
    expect(streamDone.stderr).toBe(`sheep: ${c}: the connection dropped; attached again\n`);

    // Step 4: the entries that landed after the restart are written, the interruption and then the reply, and no id twice.
    const log = await logged(c);
    const turn = interruptedTurn(log.entries);
    const streamed = streamDone.lines.map((line) => JSON.parse(line.text) as Logged);
    const ids = streamed.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(streamed.map((entry) => entry.message?.role)).toEqual(["user", "assistant", "assistant"]);
    expect(ids.slice(1)).toEqual([turn.interruption.id, turn.reply.id]);

    // Step 5 and the first criterion: the last line is the reply, and the stream is the log, the same ids in the same order.
    expect(canonical(streamDone.lines.at(-1)!.text)).toBe(canonical((await sheep("log", c, "--json", "--last", "1")).stdout.trimEnd()));
    expect(streamDone.lines.map((line) => canonical(line.text))).toEqual(log.lines.map(canonical));
    expect(stream.spawned + streamDone.exited - turn.reply.timestamp).toBeLessThan(PROMPTLY_MS);

    // The second criterion: text mode prints the reply and exits 0.
    expect(textDone.code).toBe(0);
    expect(textDone.stdout).toBe(`${REPLY}\n`);
    expect(textDone.stderr).toBe(`sheep: ${d}: the connection dropped; attached again\n`);
    interruptedTurn((await logged(d)).entries);

    // The third: the queued prompt, placed after the restart, streams its own turn and no other.
    expect(queuedDone.code).toBe(0);
    expect(queuedDone.stderr).toBe(`queued ${e}\nsheep: ${e}: the connection dropped; attached again\n`);
    const logE = await logged(e);
    const opening = logE.entries.findIndex((entry) => entry.message?.role === "user" && JSON.stringify(entry.message.content).includes("the queued turn"));
    expect(opening).toBeGreaterThan(0);
    // Placed after the restart: the first turn's interruption is before the queued entry.
    interruptedTurn(logE.entries.slice(0, opening));
    expect(queuedDone.lines.map((line) => canonical(line.text))).toEqual(logE.lines.slice(opening).map(canonical));
    const queuedIds = queuedDone.lines.map((line) => (JSON.parse(line.text) as Logged).id);
    expect(new Set(queuedIds).size).toBe(queuedIds.length);
    expect(canonical(queuedDone.lines.at(-1)!.text)).toBe(canonical(logE.lines.at(-1)!));
  });

  it("journey 4 step 2: a home that does not come back ends the wait with exit 2 at the window, not a hang", { timeout: 120_000 }, async () => {
    const f = await mint();
    expect(await sheep("attach", f, "--detach", "--", "the home will go")).toEqual({ code: 0, stdout: `${f}\n`, stderr: "" });
    await running(f);
    const waiting = hold(["wait", f], { SHEEP_TEST_TETHER_MS: String(WINDOW_MS) });
    await sleep(RESTART_AFTER_MS);

    // Step 1: the home stops and does not start again. This is the file's last case: the home stays down.
    const stoppedAt = Date.now();
    await restartHome(local(), { down: true });
    const done = await waiting.done;
    say(`sheep wait ${f} (the home gone)`, done, waiting.spawned, stoppedAt);

    // Step 2: exit 2 with the connection's error on stderr, once the window of failed reattaches has passed.
    expect(done.code).toBe(2);
    expect(done.stdout).toBe("");
    expect(done.stderr).toMatch(new RegExp(`^sheep: ${f}: \\S.*\\n$`));
    expect(done.stderr).not.toContain("attached again");
    const after = waiting.spawned + done.exited - stoppedAt;
    expect(after).toBeGreaterThanOrEqual(WINDOW_MS);
    expect(after).toBeLessThan(WINDOW_MS + 10_000);
  });
});
