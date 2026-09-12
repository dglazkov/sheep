/**
 * Bell's journeys 1 to 3 through the built CLI against a local home:
 * `wrangler dev` on a free port with the faux provider, scripted with a
 * program whose turn is a tool call at once and a reply ten seconds later,
 * so a turn is observably running for the length of the proof. Skips, with
 * a message, when the home cannot be started here; the home and the runner
 * are `local-home.ts`'s.
 *
 * The whole weight of this file is on *when* a line is written, so it uses
 * `streamSheep` rather than `runSheep`: stdout is read line by line as the
 * child runs, each line carrying the milliseconds since the spawn and
 * whether the child was still alive when the bytes came off the pipe. A
 * stream written at the end of the turn instead of as entries land would
 * put every line at the exit, and the assertions below name the gap.
 */
import { afterAll, describe, expect, it } from "vitest";
import { type Line, type Result, type Streamed, runSheep, scriptFaux, startHome, stopHome, streamSheep } from "./local-home.js";

const TOKEN = "bell-token";

const home = await startHome(TOKEN);
// Written to stderr directly: the runner swallows console output while it collects tests.
if (typeof home === "string") process.stderr.write(`bell skipped: ${home}\n`);

const ID = /^[0-9a-f-]{36}$/;

/** How long the reply waits after the tool call: the room the "before the turn ends" proof lives in. */
const REPLY_MS = 10_000;
const REPLY = "done: note.txt written";

/** Every turn: a bash call at once, then the answer after the delay. */
const TURN = { steps: [{ tool: { name: "bash", args: { command: "echo bell > note.txt && cat note.txt" } } }, { text: REPLY, delayMs: REPLY_MS }] };

/** A turn with no tool call, for journey 1's second acceptance criterion. */
const PLAIN = { steps: [{ text: "just an answer" }] };

type Logged = { id: string; type: string; message?: { role: string } };

const parseLines = (lines: readonly Line[]): Logged[] => lines.map((line) => JSON.parse(line.text) as Logged);
const roles = (entries: readonly Logged[]): Array<string | undefined> => entries.map((entry) => entry.message?.role);

/**
 * One line of JSON with its object keys sorted, at every depth. The stream
 * and `sheep log --json` hold the same entry with the same keys and the
 * same values, but not in the same order: the entry the replica delivers
 * carries `seq` and `timestamp` after `message`, and the one the
 * transcript route reads back from storage carries them after `parentId`.
 * Both are `JSON.stringify(entry)` in `herd.ts` and neither order is
 * sheep's to choose (they are pi's, on the wire and in the session file).
 * So the comparison is the bytes after this, which is byte for byte up to
 * key order: a missing field, an extra one, or a different value still
 * fails, and only the order is forgiven.
 */
function canonical(json: string): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (typeof value !== "object" || value === null) return value;
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return Object.fromEntries(entries.map(([key, held]) => [key, sort(held)]));
  };
  return JSON.stringify(sort(JSON.parse(json)));
}

/** The timeline, for the record: each line's arrival, whether the child was alive, and the head of its bytes. */
function say(what: string, streamed: Streamed): void {
  const rows = streamed.lines.map((line) => `    ${String(line.at).padStart(6)} ms ${line.running ? "running" : "exited "} ${line.text.length} bytes  ${line.text.slice(0, 120)}`);
  process.stderr.write(`bell: ${what} (exit ${streamed.code} at ${streamed.exited} ms)\n${rows.join("\n")}\n`);
}

describe.skipIf(typeof home === "string")("bell: a dog hears the work as it happens", () => {
  afterAll(async () => {
    if (typeof home === "string") return;
    await stopHome(home);
  });

  async function sheep(...args: string[]): Promise<Result> {
    if (typeof home === "string") throw new Error(home);
    return runSheep(home, args);
  }

  async function held(...args: string[]): Promise<Streamed> {
    if (typeof home === "string") throw new Error(home);
    return streamSheep(home, args);
  }

  async function script(path: string, program: unknown): Promise<void> {
    if (typeof home === "string") throw new Error(home);
    expect(await scriptFaux(home, path, program)).toBe(200);
  }

  /** A sheep minted idle (mint phase 1), answering from `TURN` unless it is scripted its own program. */
  async function mint(): Promise<string> {
    const minted = await sheep("new", "--detach");
    expect(minted.code).toBe(0);
    expect(minted.stdout).toMatch(/^[0-9a-f-]{36}\n$/);
    return minted.stdout.trim();
  }

  it("journey 1: each entry as it lands, the tool call's line before the turn ends", { timeout: 180_000 }, async () => {
    await script("/faux", TURN);
    const id = await mint();

    const stream = await held("attach", id, "--json", "--", "write the note");
    say(`journey 1: sheep attach ${id} --json -- "write the note"`, stream);

    // Step 5: nothing new on stderr (this home has no container, so no setup line), exit 0.
    expect(stream.code).toBe(0);
    expect(stream.stderr).toBe("");

    // Step 1: one JSON object per line, each parsing on its own; the prompt, the tool call, its result, the reply.
    const entries = parseLines(stream.lines);
    expect(roles(entries)).toEqual(["user", "assistant", "toolResult", "assistant"]);
    for (const entry of entries) expect(entry.id).toMatch(ID);

    // Step 2: the tool call's line was on stdout while the sheep was still working. The child was alive when the bytes
    // came off the pipe, and the turn ran for most of a further `REPLY_MS` after it: a stream written in a burst at the
    // end would put this line at `exited`, which is what the mutation in the phase's proof does.
    const call = stream.lines[1]!;
    expect(call.running).toBe(true);
    expect(stream.exited - call.at).toBeGreaterThan(REPLY_MS / 2);
    // And the three that precede the reply were all written before it: the turn did not arrive at once.
    for (const line of stream.lines.slice(0, 3)) expect(stream.exited - line.at).toBeGreaterThan(REPLY_MS / 2);
    expect(stream.exited - stream.lines[3]!.at).toBeLessThan(REPLY_MS / 2);

    // Step 3: the last line is the turn's last assistant entry, what `--json` printed before this project.
    const lastLogged = (await sheep("log", id, "--json", "--last", "1")).stdout.trimEnd();
    expect(canonical(stream.lines.at(-1)!.text)).toBe(canonical(lastLogged));
    expect(entries.at(-1)!.message?.role).toBe("assistant");

    // Step 4 and the acceptance criterion: no id twice, and every line is in the log with the same id and the same bytes,
    // in the same order.
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const logged = (await sheep("log", id, "--json")).stdout.trimEnd().split("\n");
    expect(entries.map((entry) => entry.id)).toEqual(logged.map((line) => (JSON.parse(line) as Logged).id));
    expect(stream.lines.map((line) => canonical(line.text))).toEqual(logged.map(canonical));

    // The second acceptance criterion: a turn with no tool call writes the prompt and the reply, and its last line is
    // what `--json` printed before this project.
    await script(`/s/${id}/faux`, PLAIN);
    const plain = await held("attach", id, "--json", "--", "no tools please");
    say(`journey 1: a turn with no tool call on ${id}`, plain);
    expect(plain.code).toBe(0);
    expect(roles(parseLines(plain.lines))).toEqual(["user", "assistant"]);
    expect(canonical(plain.lines.at(-1)!.text)).toBe(canonical((await sheep("log", id, "--json", "--last", "1")).stdout.trimEnd()));
  });

  it("journey 2: a queued turn streams its own entries and no others, and without --wait nothing streams", { timeout: 180_000 }, async () => {
    await script("/faux", TURN);
    const id = await mint();

    // The sheep is busy: a detached prompt opens a turn whose reply is ten seconds away.
    expect(await sheep("attach", id, "--detach", "--", "the first turn")).toEqual({ code: 0, stdout: `${id}\n`, stderr: "" });

    // Steps 1 and 2: `queued <id>` on stderr, then the entries of the turn that was waited for.
    const stream = await held("attach", id, "--json", "--wait", "--", "the queued turn");
    say(`journey 2: sheep attach ${id} --json --wait -- "the queued turn"`, stream);
    expect(stream.code).toBe(0);
    expect(stream.stderr).toBe(`queued ${id}\n`);
    const entries = parseLines(stream.lines);
    expect(roles(entries)).toEqual(["user", "assistant", "toolResult", "assistant"]);
    const call = stream.lines[1]!;
    expect(call.running).toBe(true);
    expect(stream.exited - call.at).toBeGreaterThan(REPLY_MS / 2);

    // The acceptance criterion: the window opened at the placement of the dog's own prompt, so the first turn's four
    // entries are not written. The log has eight; the stream is the last four, byte for byte.
    const logged = (await sheep("log", id, "--json")).stdout.trimEnd().split("\n");
    expect(logged).toHaveLength(8);
    expect(stream.lines.map((line) => canonical(line.text))).toEqual(logged.slice(4).map(canonical));
    expect(canonical(stream.lines.at(-1)!.text)).toBe(canonical((await sheep("log", id, "--json", "--last", "1")).stdout.trimEnd()));

    // Step 3: without --wait, nothing streams; sheep says `queued <id>` and exits 0 with pi's queue response, as before.
    const other = await mint();
    expect(await sheep("attach", other, "--detach", "--", "the first turn")).toEqual({ code: 0, stdout: `${other}\n`, stderr: "" });
    const unwaited = await held("attach", other, "--json", "--", "not waited for");
    say(`journey 2: sheep attach ${other} --json -- "not waited for"`, unwaited);
    expect(unwaited.code).toBe(0);
    expect(unwaited.stderr).toBe(`queued ${other}\n`);
    expect(unwaited.lines).toHaveLength(1);
    expect(JSON.parse(unwaited.lines[0]!.text)).toMatchObject({ accepted: true, error: null });
    expect(unwaited.exited).toBeLessThan(REPLY_MS);
    expect((await sheep("wait", "--timeout", "120", other)).code).toBe(0);
  });

  it("journey 3: text mode, --detach, and `new --json`", { timeout: 180_000 }, async () => {
    await script("/faux", TURN);
    const id = await mint();

    // Step 1: text mode is byte for byte what it was — the reply on stdout as it streams, nothing else.
    const text = await held("attach", id, "--", "in text");
    say(`journey 3: sheep attach ${id} -- "in text"`, text);
    expect(text.code).toBe(0);
    expect(text.stdout).toBe(`${REPLY}\n`);
    expect(text.stderr).toBe("");

    // Step 2: `--detach` is the id on stdout and nothing more; there is no turn in hand to hear.
    expect(await sheep("attach", id, "--detach", "--", "and detached")).toEqual({ code: 0, stdout: `${id}\n`, stderr: "" });
    expect((await sheep("wait", "--timeout", "120", id)).code).toBe(0);
    // `--json` with `--detach` is pi's operation response and one line, as before.
    const detachedJson = await held("attach", id, "--detach", "--json", "--", "detached with json");
    expect(detachedJson.code).toBe(0);
    expect(detachedJson.lines[0]!.text).toBe(id);
    expect(detachedJson.lines).toHaveLength(2);
    expect(JSON.parse(detachedJson.lines[1]!.text)).toMatchObject({ accepted: true });
    expect((await sheep("wait", "--timeout", "120", id)).code).toBe(0);

    // Step 3: `sheep new --json` streams the same way, since it is the same path; `session <id>` is still on stderr.
    const fresh = await held("new", "--name", "bell", "--json", "--", "a fresh sheep");
    say(`journey 3: sheep new --name bell --json -- "a fresh sheep"`, fresh);
    expect(fresh.code).toBe(0);
    expect(fresh.stderr).toMatch(/^session [0-9a-f-]{36}\n$/);
    expect(roles(parseLines(fresh.lines))).toEqual(["user", "assistant", "toolResult", "assistant"]);
    const call = fresh.lines[1]!;
    expect(call.running).toBe(true);
    expect(fresh.exited - call.at).toBeGreaterThan(REPLY_MS / 2);
  });
});
