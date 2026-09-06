/**
 * Journey 5 through the built CLI against a local home: `wrangler dev` on
 * a free port with the faux provider, scripted over its test-only route,
 * and `bin/sheep.js` driven as a child process through steps 1 to 7. Skips,
 * with a message, when the home cannot be started here. The home and the
 * runner are `local-home.ts`'s, shared with pasture phase 0's test.
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
  steps: [{ tool: { name: "bash", args: { command: "echo herding > note.txt && cat note.txt" } } }, { text: "done: note.txt written", delayMs: 2_500 }],
};

describe.skipIf(typeof home === "string")("journey 5: a dog and its flock, through sheep against a local home", () => {
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
});
