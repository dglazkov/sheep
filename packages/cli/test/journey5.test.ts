/**
 * Journey 5 through the built CLI against a local home: `wrangler dev` on
 * a free port with the faux provider, scripted over its test-only route,
 * and `bin/sheep.js` driven as a child process through steps 1 to 7. Skips,
 * with a message, when the home cannot be started here. The home and the
 * runner are `local-home.ts`'s, shared with pasture phase 0's test.
 *
 * End phase 1: a second case walks end's journey 1, steps 1 to 4, on the
 * three sheep the first case minted: `docs` ended finished, `tests` ended
 * mid-turn, `types` ended with `--json`, then an id the home lacks. This
 * home has no container (no Docker in the pool's `wrangler dev`), so the
 * mid-turn end's assertion is `aborted: true`, not a container.
 */
import { afterAll, describe, expect, it } from "vitest";
import { type Result, runSheep, scriptFaux, startHome, stopHome } from "./local-home.js";

const TOKEN = "journey-5-token";

const home = await startHome(TOKEN);
// Written to stderr directly: the runner swallows console output while it collects tests.
if (typeof home === "string") process.stderr.write(`journey 5 skipped: ${home}\n`);

/** Runs the built CLI against the local home; never throws on a nonzero exit. */
async function sheep(...args: string[]): Promise<Result> {
  if (typeof home === "string") throw new Error(home);
  return runSheep(home, args);
}

async function script(path: string, program: unknown): Promise<void> {
  if (typeof home === "string") throw new Error(home);
  expect(await scriptFaux(home, path, program)).toBe(200);
}

const ID = /^[0-9a-f-]{36}$/;

/** Every turn: a bash call at once, then the answer after a delay, so a sheep is observably running. */
const TURN = {
  steps: [{ tool: { name: "bash", args: { command: "echo herding > note.txt && cat note.txt" } } }, { text: "done: note.txt written", delayMs: 10_000 }],
};

/** The refusal for a session the home does not have, as `main` prints it: the home's sentence, one line on stderr. */
const refusal = (id: string): string => `sheep: no session ${id} at this home; \`sheep ls\` lists the ones there are\n`;

describe.skipIf(typeof home === "string")("journey 5: a dog and its flock, through sheep against a local home", () => {
  /** The three sheep of step 1, kept for end's journey 1 after step 7. */
  const flock = { docs: "", tests: "", types: "" };

  afterAll(async () => {
    if (typeof home === "string") return;
    await stopHome(home);
  });

  it("steps 1 to 7, then prompt mode with the whole reply", { timeout: 120_000 }, async () => {
    await script("/faux", TURN);

    // Step 1: three sheep minted detached; each prints its id and returns before the first token.
    const started = Date.now();
    const ids: string[] = [];
    for (const name of ["docs", "tests", "types"]) {
      const result = await sheep("new", "--name", name, "--detach", "--", `write the ${name}`);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/^[0-9a-f-]{36}\n$/);
      ids.push(result.stdout.trim());
    }
    const [docs, tests, types] = ids as [string, string, string];
    Object.assign(flock, { docs, tests, types });
    expect(Date.now() - started).toBeLessThan(TURN.steps[1]!.delayMs!);

    // Step 2: one record per line, tab separated, with the lane state; --json is the Directory's array.
    const ls = await sheep("ls");
    expect(ls.code).toBe(0);
    const rows = ls.stdout.trimEnd().split("\n").map((line) => line.split("\t"));
    for (const id of ids) {
      const row = rows.find((candidate) => candidate[0] === id);
      expect(row).toBeDefined();
      expect(row![1]).toMatch(/^(docs|tests|types)$/);
      expect(Number.isNaN(Date.parse(row![2]!))).toBe(false);
      expect(row![3]).toBe("running");
    }
    const lsJson = JSON.parse((await sheep("ls", "--json")).stdout) as Array<{ id: string; name: string; createdAt: number; state: string }>;
    expect(lsJson.find((session) => session.id === docs)).toMatchObject({ name: "docs", state: "running" });

    // Step 3: status on a running sheep: the open operation, the last tool call, tokens so far; --json is pi's lane snapshot.
    const status = await sheep("status", docs);
    expect(status.code).toBe(0);
    expect(status.stdout).toMatch(/^id: /m);
    expect(status.stdout).toMatch(/^state: running$/m);
    expect(status.stdout).toMatch(/^operation: [0-9a-f-]{36} run started \d{4}-/m);
    expect(status.stdout).toMatch(/^tool: bash \{"command":"echo herding/m);
    expect(status.stdout).toMatch(/^tokens: input=\d+ output=\d+ cacheRead=\d+ cacheWrite=\d+$/m);
    const snapshot = JSON.parse((await sheep("status", docs, "--json")).stdout) as {
      lane: string;
      operation: { id: string; kind: string; startedAt: number } | null;
      transcript: Array<{ type: string }>;
      stats: { usage: { input: number; output: number } };
    };
    expect(snapshot.lane).toBe("main");
    expect(snapshot.operation?.kind).toBe("run");
    expect(snapshot.transcript.length).toBeGreaterThan(0);
    expect(typeof snapshot.stats.usage.input).toBe("number");

    // Step 4: a prompt to a running sheep queues behind the turn; sheep says so and exits 0. --json is pi's queue response.
    const queued = await sheep("attach", docs, "--", "and again");
    expect(queued.code).toBe(0);
    expect(queued.stdout).toBe("");
    expect(queued.stderr).toContain(`queued ${docs}`);
    const queuedJson = await sheep("attach", tests, "--json", "--", "and again too");
    expect(queuedJson.code).toBe(0);
    expect(JSON.parse(queuedJson.stdout)).toMatchObject({ accepted: true, error: null });
    expect(JSON.parse(queuedJson.stdout).entryId).toMatch(ID);
    // With --wait, the queued turn streams when it starts.
    const waited = await sheep("attach", types, "--wait", "--", "and once more");
    expect(waited.code).toBe(0);
    expect(waited.stderr).toContain(`queued ${types}`);
    expect(waited.stdout).toBe("done: note.txt written\n");

    // Step 5: wait on all three; each line is one sheep's last assistant message.
    const wait = await sheep("wait", "--timeout", "60", docs, tests, types);
    expect(wait.code).toBe(0);
    const results = wait.stdout.trimEnd().split("\n").map((line) => line.split("\t"));
    expect(results.map((row) => row[0]).sort()).toEqual([...ids].sort());
    for (const row of results) expect(row[1]).toBe("done: note.txt written");
    const waitJson = JSON.parse((await sheep("wait", "--json", docs, tests)).stdout) as Array<{ id: string; message: { type: string; message: { role: string } } }>;
    expect(waitJson.map((entry) => entry.id).sort()).toEqual([docs, tests].sort());
    for (const entry of waitJson) expect(entry.message).toMatchObject({ type: "message", message: { role: "assistant" } });
    // The queued prompts ran after the turn: user, assistant, toolResult, assistant, twice.
    const docsRoles = (await sheep("log", docs, "--json")).stdout
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; message?: { role: string } })
      .map((entry) => entry.message?.role);
    expect(docsRoles).toEqual(["user", "assistant", "toolResult", "assistant", "user", "assistant", "toolResult", "assistant"]);

    // Step 6: a sheep going wrong is aborted; the transcript says so and the lane is idle.
    await script(`/s/${types}/faux`, { steps: [{ text: "this takes forever", delayMs: 60_000 }] });
    const slow = await sheep("attach", types, "--detach", "--", "go slow");
    expect(slow.code).toBe(0);
    expect(slow.stdout).toBe(`${types}\n`);
    expect((await sheep("status", types)).stdout).toMatch(/^state: running$/m);
    const abort = await sheep("abort", types);
    expect(abort.code).toBe(0);
    expect(abort.stdout).toMatch(new RegExp(`^${types}\taborted [0-9a-f-]{36}\n$`));
    expect(JSON.parse((await sheep("abort", types, "--json")).stdout)).toEqual({ id: types, aborted: false });
    expect((await sheep("status", types)).stdout).toMatch(/^state: idle$/m);
    const abortedEntries = (await sheep("log", types, "--json", "--last", "1")).stdout.trimEnd().split("\n").map((line) => JSON.parse(line) as { message: { role: string; stopReason?: string } });
    expect(abortedEntries[0]!.message).toMatchObject({ role: "assistant", stopReason: "aborted" });
    expect((await sheep("ls")).stdout).toContain(`${types}\ttypes\t`);
    expect((await sheep("ls", "--json")).stdout).toContain(`"id":"${types}","name":"types","createdAt":`);

    // Step 7: the transcript as text, oldest first, one block per entry, with the tool calls and their results.
    const log = await sheep("log", docs);
    expect(log.code).toBe(0);
    expect(log.stdout.endsWith("\n")).toBe(true);
    const blocks = log.stdout.trimEnd().split("\n\n");
    expect(blocks[0]).toMatch(/^\[user\] [0-9a-f-]{36} \d{4}-.*\nwrite the docs$/);
    expect(blocks[1]).toMatch(/^\[assistant\] [0-9a-f-]{36} .*\n\[tool bash\] \{"command":"echo herding > note.txt && cat note.txt"\}$/);
    expect(blocks[2]).toMatch(/^\[result bash\] [0-9a-f-]{36} .*\nherding$/);
    expect(blocks[3]).toMatch(/^\[assistant\] [0-9a-f-]{36} .*\ndone: note.txt written$/);
    expect(blocks).toHaveLength(8);
    const last = await sheep("log", docs, "--last", "2");
    expect(last.stdout.trimEnd().split("\n\n")).toHaveLength(2);
    const entries = (await sheep("log", docs, "--json")).stdout.trimEnd().split("\n").map((line) => JSON.parse(line) as { id: string; seq: number; timestamp: number });
    expect(entries.map((entry) => entry.seq)).toEqual([...entries.map((entry) => entry.seq)].sort((a, b) => a - b));
    const sinceId = (await sheep("log", docs, "--since", entries[3]!.id, "--json")).stdout.trimEnd().split("\n").map((line) => JSON.parse(line) as { id: string });
    expect(sinceId.map((entry) => entry.id)).toEqual(entries.slice(4).map((entry) => entry.id));
    const sinceTime = (await sheep("log", docs, "--since", new Date(entries[4]!.timestamp).toISOString(), "--json")).stdout.trimEnd().split("\n");
    expect(sinceTime.length).toBeGreaterThanOrEqual(4);
    expect((await sheep("log", docs, "--since", "yesterday")).code).toBe(2);

    // Prompt mode on an idle sheep prints the whole reply, first character included, and exits.
    const reply = await sheep("attach", docs, "--", "hello");
    expect(reply.code).toBe(0);
    expect(reply.stdout).toBe("done: note.txt written\n");
    const replyJson = JSON.parse((await sheep("attach", docs, "--json", "--", "hello json")).stdout) as { type: string; message: { role: string; content: Array<{ text: string }> } };
    expect(replyJson.type).toBe("message");
    expect(replyJson.message.role).toBe("assistant");
    expect(replyJson.message.content[0]!.text).toBe("done: note.txt written");
    // `sheep new` without --detach still says which session on stderr, and streams.
    const fresh = await sheep("new", "--name", "plain", "--", "hi there");
    expect(fresh.code).toBe(0);
    expect(fresh.stderr).toMatch(/^session [0-9a-f-]{36}\n/);
    expect(fresh.stdout).toBe("done: note.txt written\n");

    // A wait that runs out exits 124 with what had finished.
    await sheep("attach", types, "--detach", "--", "go slow again");
    const timedOut = await sheep("wait", "--timeout", "2", types, docs);
    expect(timedOut.code).toBe(124);
    expect(timedOut.stdout).toBe(`${docs}\tdone: note.txt written\n`);
    expect((await sheep("abort", types)).code).toBe(0);
  });

  it("end phase 1, journey 1 steps 1 to 4: a finished sheep, one mid-turn, one that never rented, and an id the home lacks", { timeout: 120_000 }, async () => {
    const { docs, tests, types } = flock;
    expect(docs).toMatch(ID);
    // The three are idle after step 7; the program every cell answers from is still TURN, whose answer comes 10 s after its tool call.
    for (const id of [docs, tests, types]) expect((await sheep("status", id)).stdout).toMatch(/^state: idle$/m);

    // Step 1: `docs` is finished and is ended: exactly `<id>\tended`, exit 0, nothing on stderr. `ls` lists the other two and not it.
    expect(await sheep("rm", docs)).toEqual({ code: 0, stdout: `${docs}\tended\n`, stderr: "" });
    const listed = await sheep("ls");
    expect(listed.code).toBe(0);
    expect(listed.stdout).not.toContain(docs);
    expect(listed.stdout).toContain(`${tests}\ttests\t`);
    expect(listed.stdout).toContain(`${types}\ttypes\t`);
    // Every verb on the ended id is the one sentence on stderr, exit 2, nothing on stdout: the ones that ask over HTTP (`log`, `export`,
    // `rm`), the ones that attach first (`attach` with a prompt, `status`, `abort`), whose socket fails and whose failure is the home's
    // sentence, and `attach` with no prompt, which asks the home before any terminal is spawned (here non-TTY, as `runSheep` spawns it).
    for (const args of [
      ["attach", docs],
      ["attach", docs, "--", "hello again"],
      ["status", docs],
      ["log", docs],
      ["export", docs],
      ["abort", docs],
      ["rm", docs],
    ]) {
      expect(await sheep(...args), `sheep ${args.join(" ")}`).toEqual({ code: 2, stdout: "", stderr: refusal(docs) });
    }

    // Step 2: `tests` is ended mid-turn. The turn is aborted and the report says so; the line is the same shape. On this home there
    // is no container to be killed or destroyed: `aborted: true` is the assertion. After, `status` on it is the sentence.
    const prompted = await sheep("attach", tests, "--detach", "--", "run the tests forever");
    expect(prompted.code).toBe(0);
    expect((await sheep("status", tests)).stdout).toMatch(/^state: running$/m);
    const endedMidTurn = await sheep("rm", tests, "--json");
    expect(endedMidTurn).toEqual({ code: 0, stdout: `{"id":"${tests}","ended":true,"aborted":true}\n`, stderr: "" });
    expect(await sheep("status", tests)).toEqual({ code: 2, stdout: "", stderr: refusal(tests) });
    expect(await sheep("log", tests)).toEqual({ code: 2, stdout: "", stderr: refusal(tests) });

    // Step 3: `types`, idle, is ended with `--json`: the same shape, `aborted: false`.
    expect(await sheep("rm", types, "--json")).toEqual({ code: 0, stdout: `{"id":"${types}","ended":true,"aborted":false}\n`, stderr: "" });

    // Step 4: an id the home never had is the sentence, exit 2, and `ls` is unchanged; none of the three is in it.
    const before = await sheep("ls", "--json");
    expect(before.code).toBe(0);
    expect(await sheep("rm", "nonsense")).toEqual({ code: 2, stdout: "", stderr: refusal("nonsense") });
    expect(await sheep("ls", "--json")).toEqual(before);
    const remaining = (JSON.parse(before.stdout) as Array<{ id: string }>).map((session) => session.id);
    for (const id of [docs, tests, types]) expect(remaining).not.toContain(id);
    expect(remaining.length).toBeGreaterThan(0);
  });

  it("mint phase 1, journey 1 steps 1 to 4, 6, and 7: a sheep named before it has anything to say", { timeout: 120_000 }, async () => {
    // The program every cell answers from, for this case: one text step, at once, so the reply names the step it came from. This
    // home has no container and the storage is not read here (that is the cell's proof, in workerd); "nothing booted" is `sheep
    // log` empty, `sheep status` at zero, and the program's first answered step being the first prompt's.
    const MINT = { steps: [{ text: "the first prompt's answer" }] };
    await script("/faux", MINT);

    // Step 1: the mint alone: one line, the id, exit 0, nothing on stderr, and back at once. The time is the whole command,
    // the process spawned and the bundle loaded included; the ring's bound is loose, and the number is printed for the record.
    const started = Date.now();
    const minted = await sheep("new", "--detach");
    const mintMs = Date.now() - started;
    expect(minted.code).toBe(0);
    expect(minted.stderr).toBe("");
    expect(minted.stdout).toMatch(/^[0-9a-f-]{36}\n$/);
    const id = minted.stdout.trim();
    expect(mintMs).toBeLessThan(5_000);
    process.stderr.write(`mint phase 1: sheep new --detach took ${mintMs} ms through the CLI\n`);
    // --json adds nothing: the id is the id. A second sheep, named, for step 6.
    const spareMinted = await sheep("new", "--name", "spare", "--detach", "--json");
    expect(spareMinted.code).toBe(0);
    expect(spareMinted.stderr).toBe("");
    expect(spareMinted.stdout).toMatch(/^[0-9a-f-]{36}\n$/);
    const spare = spareMinted.stdout.trim();

    // Step 2: listed idle with no task and no name; --json has task: null.
    const ls = await sheep("ls");
    expect(ls.code).toBe(0);
    expect(ls.stdout).toMatch(new RegExp(`^${id}\\t\\t\\d{4}-[^\\t]+\\tidle\\t$`, "m"));
    expect(ls.stdout).toMatch(new RegExp(`^${spare}\\tspare\\t\\d{4}-[^\\t]+\\tidle\\t$`, "m"));
    const rows = JSON.parse((await sheep("ls", "--json")).stdout) as Array<{ id: string; state: string; task: string | null; pasture: string | null }>;
    expect(rows.find((row) => row.id === id)).toMatchObject({ state: "idle", task: null, pasture: null });
    expect(rows.find((row) => row.id === spare)).toMatchObject({ state: "idle", task: null });

    // Step 3: no model was called: the log is empty, and the status is idle with no operation, no tool, zero tokens, no messages.
    // Both read the lane, which is the first boot; a pastureless cell's boot births nothing.
    expect(await sheep("log", id)).toEqual({ code: 0, stdout: "", stderr: "" });
    expect((await sheep("log", id, "--json")).stdout).toBe("");
    const status = await sheep("status", id);
    expect(status.code).toBe(0);
    expect(status.stdout).toBe(`id: ${id}\nstate: idle\noperation: none\ntool: none\ntokens: input=0 output=0 cacheRead=0 cacheWrite=0\nmessages: 0\n`);

    // Step 4: the first prompt is the sheep's first turn: the reply streams, the task is the prompt's first line, the log starts
    // with the prompt. The reply is the program's first step, so the mint consumed none of it.
    const reply = await sheep("attach", id, "--", "write the essay\nabout sheep");
    expect(reply.code).toBe(0);
    expect(reply.stdout).toBe(`${MINT.steps[0]!.text}\n`);
    const prompted = JSON.parse((await sheep("ls", "--json")).stdout) as Array<{ id: string; state: string; task: string | null }>;
    expect(prompted.find((row) => row.id === id)).toMatchObject({ state: "idle", task: "write the essay" });
    const log = await sheep("log", id);
    expect(log.code).toBe(0);
    const blocks = log.stdout.trimEnd().split("\n\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatch(new RegExp(`^\\[user\\] [0-9a-f-]{36} \\d{4}-[^\\n]*\\nwrite the essay\\nabout sheep$`));
    expect(blocks[1]).toMatch(new RegExp(`^\\[assistant\\] [0-9a-f-]{36} [^\\n]*\\n${MINT.steps[0]!.text}$`));
    expect((await sheep("status", id)).stdout).toMatch(/^messages: 2$/m);

    // Step 6: a sheep minted and never asked anything is ended with the one line; nothing was started to be stopped.
    expect(await sheep("rm", spare)).toEqual({ code: 0, stdout: `${spare}\tended\n`, stderr: "" });
    expect((await sheep("ls")).stdout).not.toContain(spare);

    // Step 7: --detach with nothing to send, on attach and on -c, is the one sentence, exit 2, nothing on stdout: nothing is asked
    // of the home. And --detach with a prompt to an ended id is the ended sentence alone: the send comes before the id is printed.
    const nothingToSend = "sheep: --detach with no prompt is sheep new's; there is nothing to send\n";
    expect(await sheep("attach", id, "--detach")).toEqual({ code: 2, stdout: "", stderr: nothingToSend });
    expect(await sheep("-c", "--detach")).toEqual({ code: 2, stdout: "", stderr: nothingToSend });
    expect(await sheep("attach", id, "--detach", "--json")).toEqual({ code: 2, stdout: "", stderr: nothingToSend });
    expect(await sheep("attach", spare, "--detach", "--", "x")).toEqual({ code: 2, stdout: "", stderr: refusal(spare) });
    expect(await sheep("attach", spare, "--detach", "--json", "--", "x")).toEqual({ code: 2, stdout: "", stderr: refusal(spare) });
    // With a prompt to a live sheep, --detach still prints the id, after the send, and the sheep takes the turn.
    const detached = await sheep("attach", id, "--detach", "--", "and again");
    expect(detached).toEqual({ code: 0, stdout: `${id}\n`, stderr: "" });
    expect((await sheep("wait", "--timeout", "30", id)).stdout).toBe(`${id}\t${MINT.steps[0]!.text}\n`);
  });
});
