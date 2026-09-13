/**
 * Bleat phase 1, the dog's half: the three surfaces against a fake home
 * that says what a row says, in `earmark.test.ts`'s shape — `createServer`
 * from `node:http` recording every request, the built `bin/sheep.js`
 * spawned against it. The command ring carries journey 1 steps 1 to 3 and
 * 5 and journey 3, so the dog's side is repeated by `pnpm test`.
 *
 * The fake home answers `GET /sessions/<id>` with whatever row a case
 * needs and changes its answer between polls, and holds `POST
 * /s/<id>/prompt` the way a birth holds it. Nothing here drives the
 * command's own clock: the watcher polls on its own (a case waits out its
 * ten seconds to prove it), and the two-second deadline is measured
 * against a socket that hangs, which is what a cell being born does.
 *
 * What the ring cannot have: a lane. `attachSheep` speaks pi's protocol
 * over a WebSocket, which a fake home does not; so `status`'s long form
 * (`setup: ok (…)`) is the home ring's and the walk's, and the words it
 * would print are the same `setupSaying` the stderr lines prove here.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { elapsed, SETUP_NO_LANE, setupSaying, SetupVoice } from "../src/herd.js";
import type { SetupRecord, SetupState } from "../src/home.js";
import { bin, type Result } from "./local-home.js";

const TOKEN = "bleat-cli-token";
const SERVER_ID = "9f1d8d2e-6b3a-4f5c-9d1e-2a3b4c5d6e7f";
const EVICTED = "the cell was evicted while setup.sh was running, so nothing is running it now";

/** A row's setup as a case wants it now, and what the ask does to it; `asks` counts the asks this id has had. */
interface Sheep {
  setup: SetupState | null | undefined;
  asks: number;
  /** Answers the row with this status instead, for the home that will not answer it. */
  refuse?: number;
  /** Called after each ask, so a case can flip the row between the command's own polls. */
  onAsk?: (sheep: Sheep) => void;
  /**
   * How the socket behaves. `born` is a cell held by its birth, which is the walk's case: the upgrade is answered, so the
   * WebSocket opens, and then nothing is ever said on it — not a protocol frame, and not the reply to a close frame, so
   * an abandoned attachment cannot be closed and the command must end itself. `silent` receives the upgrade and never
   * answers it at all; that one node does abort on its own, which is why it hid the defect. `refuse` drops the socket.
   */
  socket: "born" | "silent" | "refuse";
  entries?: unknown[];
  setups?: SetupRecord[];
  /** Held until this many row asks have happened, so a prompt spans a poll. */
  promptAfterAsks?: number;
}

const AT = 1_757_620_443_122;
const sheepdom = new Map<string, Sheep>();

let server: Server;
let url: string;
let dir: string;
const asked: string[] = [];
const held: Socket[] = [];

function row(id: string): unknown {
  const sheep = sheepdom.get(id)!;
  return { id, name: null, createdAt: 0, state: "running", pasture: "meadow", task: null, secrets: [], setup: sheep.setup ?? null };
}

beforeAll(async () => {
  dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-bleat-")));
  server = createServer((request, response) => {
    const path = request.url ?? "";
    asked.push(`${request.method} ${path}`);
    // pi's client refuses a serverId that is not a canonical lowercase UUIDv4, so the fake home has one.
    if (path === "/home") return response.end(JSON.stringify({ serverId: SERVER_ID }));
    if (path === "/sessions") return response.end(JSON.stringify([...sheepdom.keys()].map(row)));
    const one = /^\/sessions\/([^/?]+)$/.exec(path);
    if (one) {
      const id = decodeURIComponent(one[1]!);
      const sheep = sheepdom.get(id);
      if (sheep === undefined) {
        response.statusCode = 404;
        return response.end(`no session ${id} at this home; \`sheep ls\` lists the ones there are`);
      }
      sheep.asks++;
      const answer = sheep.refuse === undefined ? JSON.stringify(row(id)) : undefined;
      sheep.onAsk?.(sheep);
      if (answer === undefined) {
        response.statusCode = sheep.refuse!;
        return response.end("the row is not answered here");
      }
      return response.end(answer);
    }
    const cell = /^\/s\/([^/]+)(\/.*)?$/.exec(path);
    if (cell) {
      const id = decodeURIComponent(cell[1]!);
      const sheep = sheepdom.get(id);
      const inner = cell[2] ?? "/";
      if (sheep === undefined || inner === "/") {
        response.statusCode = 404;
        return response.end(`no session ${id} at this home; \`sheep ls\` lists the ones there are`);
      }
      if (inner === "/transcript") return response.end(JSON.stringify({ id, tipId: null, operation: null, entries: sheep.entries ?? [], setups: sheep.setups ?? [] }));
      if (inner === "/prompt") {
        const wanted = sheep.promptAfterAsks ?? 0;
        const answer = (): void => void response.end(JSON.stringify({ accepted: true, operationId: "op-1", error: null }));
        const wait = (): void => {
          if (sheep.asks >= wanted) return answer();
          setTimeout(wait, 50);
        };
        return wait();
      }
    }
    response.statusCode = 404;
    response.end("no");
  });
  // What a cell does with the upgrade while it is being born, which is what the deadline and the deliberate end are for.
  // Every socket kept is remembered, since one nothing ever finished keeps `server.close` waiting.
  server.on("upgrade", (request, socket) => {
    const id = decodeURIComponent(/^\/s\/([^/]+)\//.exec(request.url ?? "")?.[1] ?? "");
    const how = sheepdom.get(id)?.socket;
    if (how === "refuse") return void socket.destroy();
    if (how === "born") {
      // The handshake answered and not one word after it: the cell's routes await the boot the birth is holding.
      const accept = createHash("sha1").update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    }
    held.push(socket);
  });
  url = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
});

afterAll(async () => {
  for (const socket of held) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

function sheep(args: string[]): Promise<Result> {
  const env = { ...process.env, SHEEP_HOME: url, SHEEP_TOKEN: TOKEN, HOME: dir, NODE_NO_WARNINGS: "1" };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { env, cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
    child.stdin.end("");
  });
}

describe("the durations and the saying: one function, so the three surfaces agree", () => {
  it("is 12.4 s under a minute and 1m 40s over it", () => {
    expect(elapsed(0)).toBe("0.0 s");
    expect(elapsed(12_400)).toBe("12.4 s");
    expect(elapsed(59_949)).toBe("59.9 s");
    expect(elapsed(60_000)).toBe("1m 0s");
    expect(elapsed(100_000)).toBe("1m 40s");
    expect(elapsed(112_000)).toBe("1m 52s");
    expect(elapsed(3_723_000)).toBe("62m 3s");
    // Nothing a bad number could make: a negative or a NaN is zero, never "NaN s".
    expect(elapsed(-5)).toBe("0.0 s");
    expect(elapsed(Number.NaN)).toBe("0.0 s");
  });

  it("says the four forms, and each of the three shapes with no ms", () => {
    expect(setupSaying(null, AT)).toBe("none");
    expect(setupSaying(undefined, AT)).toBe("none");
    expect(setupSaying({ state: "running", at: AT - 100_000 }, AT)).toBe("running (1m 40s)");
    expect(setupSaying({ state: "ok", at: AT, ms: 112_000, exit: 0 }, AT)).toBe("ok (1m 52s)");
    expect(setupSaying({ state: "failed", at: AT, ms: 12_400, exit: 1 }, AT)).toBe("failed (exit 1, 12.4 s)");
    expect(setupSaying({ state: "failed", at: AT, ms: 900, error: "no container could be rented" }, AT)).toBe("failed (no container could be rented, 0.9 s)");
    // An eviction: `failed` with the sentence and no length, since nothing knows how long it had run.
    expect(setupSaying({ state: "failed", at: AT, error: EVICTED }, AT)).toBe(`failed (${EVICTED})`);
    expect(setupSaying({ state: "ok", at: AT }, AT)).toBe("ok");
  });
});

describe("the voice: what a held prompt says, and when", () => {
  it("says the first sighting, one every 30 s after, and one line when it ends", () => {
    const voice = new SetupVoice();
    const at = 1_000_000;
    expect(voice.saw(null, at)).toEqual([]);
    expect(voice.waiting).toBe(false);
    expect(voice.saw({ state: "running", at }, at + 8_000)).toEqual(["setup running (8.0 s)\n"]);
    expect(voice.waiting).toBe(true);
    // Not again at the next polls, and again once half a minute has passed since it was said.
    expect(voice.saw({ state: "running", at }, at + 18_000)).toEqual([]);
    expect(voice.saw({ state: "running", at }, at + 28_000)).toEqual([]);
    expect(voice.saw({ state: "running", at }, at + 38_000)).toEqual(["setup running (38.0 s)\n"]);
    expect(voice.saw({ state: "running", at }, at + 48_000)).toEqual([]);
    expect(voice.saw({ state: "running", at }, at + 68_000)).toEqual(["setup running (1m 8s)\n"]);
    expect(voice.saw({ state: "ok", at, ms: 70_000, exit: 0 }, at + 78_000)).toEqual(["setup ok (1m 10s)\n"]);
    expect(voice.waiting).toBe(false);
    // The ending is said once, whatever the row is asked after it.
    expect(voice.saw({ state: "ok", at, ms: 70_000, exit: 0 }, at + 88_000)).toEqual([]);
  });

  it("says nothing for a setup that ended before the command started, and starts again for a second setup", () => {
    const quiet = new SetupVoice();
    expect(quiet.saw({ state: "ok", at: 1, ms: 5, exit: 0 }, 1_000_000)).toEqual([]);
    expect(quiet.saw({ state: "failed", at: 1, ms: 5, exit: 1 }, 1_000_000)).toEqual([]);
    expect(quiet.waiting).toBe(false);
    const voice = new SetupVoice();
    expect(voice.saw({ state: "running", at: 1_000 }, 2_000)).toEqual(["setup running (1.0 s)\n"]);
    expect(voice.saw({ state: "failed", at: 1_000, ms: 12_400, exit: 1 }, 14_000)).toEqual(["setup failed (exit 1, 12.4 s)\n"]);
    expect(voice.saw({ state: "running", at: 20_000 }, 21_000)).toEqual(["setup running (1.0 s)\n"]);
    expect(voice.waiting).toBe(true);
  });
});

describe("journey 1 step 1 and journey 2: the line on stderr while a prompt is held", () => {
  it("says the first sighting at once and the ending at the poll ten seconds on, and stdout is the id alone", { timeout: 60_000 }, async () => {
    const id = "slow";
    sheepdom.set(id, {
      setup: undefined,
      asks: 0,
      socket: "refuse",
      // The row answers `running` until the watcher has seen it once, then `ok`: the second poll, the command's own, says so.
      onAsk: (self) => {
        if (self.asks === 1) self.setup = { state: "ok", at: (self.setup as SetupState).at, ms: 100_000, exit: 0 };
      },
      promptAfterAsks: 2,
    });
    sheepdom.get(id)!.setup = { state: "running", at: Date.now() - 12_400 };
    const started = Date.now();
    const held = await sheep(["attach", id, "--detach", "--", "hello"]);
    const seconds = (Date.now() - started) / 1000;
    expect(held.code).toBe(0);
    // Nothing on stdout but the id: every program reading a reply reads the same bytes as before.
    expect(held.stdout).toBe(`${id}\n`);
    expect(held.stderr).toMatch(/^setup running \(1[0-9]\.\d s\)\n/);
    expect(held.stderr).toContain("setup ok (1m 40s)\n");
    expect(held.stderr.split("\n").filter(Boolean)).toHaveLength(2);
    // The command's own poll said the second line: it was not there to be read until ten seconds in.
    expect(seconds).toBeGreaterThan(9.5);
    expect(sheepdom.get(id)!.asks).toBeGreaterThanOrEqual(2);
  });

  it("says the ending at the stop when the prompt returned before the next poll: journey 2's failed setup", async () => {
    const id = "fast";
    sheepdom.set(id, {
      setup: { state: "running", at: Date.now() - 400 },
      asks: 0,
      socket: "refuse",
      onAsk: (self) => {
        if (self.asks === 1) self.setup = { state: "failed", at: (self.setup as SetupState).at, ms: 12_400, exit: 1 };
      },
    });
    const held = await sheep(["attach", id, "--detach", "--", "hello"]);
    expect(held.code).toBe(0);
    expect(held.stdout).toBe(`${id}\n`);
    expect(held.stderr).toMatch(/^setup running \(0\.\d s\)\nsetup failed \(exit 1, 12\.4 s\)\n$/);
  });
});

describe("journey 3: the quiet sheep, and a home that will not answer the row", () => {
  it("prints nothing on stderr for a row with setup null, and nothing changes", async () => {
    sheepdom.set("quiet", { setup: null, asks: 0, socket: "refuse", entries: [] });
    const held = await sheep(["attach", "quiet", "--detach", "--", "hello"]);
    expect(held).toEqual({ code: 0, stdout: "quiet\n", stderr: "" });
    // The row was asked, and nothing else about this sheep was: the poll is the one request this adds.
    expect(sheepdom.get("quiet")!.asks).toBeGreaterThanOrEqual(1);
  });

  it("does not fail the command when the home will not answer the row", async () => {
    sheepdom.set("broken", { setup: null, asks: 0, refuse: 500, socket: "refuse", entries: [] });
    const held = await sheep(["attach", "broken", "--detach", "--", "hello"]);
    expect(held).toEqual({ code: 0, stdout: "broken\n", stderr: "" });
    expect(sheepdom.get("broken")!.asks).toBeGreaterThanOrEqual(1);
    // And `sheep log` is what it was: the row is asked only for a record with no ending, and never to fail the command.
    const logged = await sheep(["log", "broken"]);
    expect(logged).toEqual({ code: 0, stdout: "", stderr: "" });
  });
});

describe("journey 1 step 2: status answers from the row while the cell cannot", () => {
  /**
   * The bound the walk asked for. The deadline is two seconds and the rest is a node starting, so the answer lands at
   * about 2.3 s; three and a half is that with room for a loaded runner, and far under the length of any setup a dog
   * would be asking about — which is what the command held the terminal for before it ended itself.
   */
  const ENDS_BY_S = 3.5;

  for (const socket of ["born", "silent"] as const) {
    it(`gives the short form and ends, against a cell that ${socket === "born" ? "answers the upgrade and then says nothing" : "never answers the upgrade"}`, async () => {
      const id = `held-${socket}`;
      sheepdom.set(id, { setup: undefined, asks: 0, socket });
      // The row is minted at each ask, so the elapsed time is exactly 1m 40s however long the spawn took.
      sheepdom.get(id)!.onAsk = (self) => void (self.setup = { state: "running", at: Date.now() - 100_000 });
      sheepdom.get(id)!.setup = { state: "running", at: Date.now() - 100_000 };
      const started = Date.now();
      // `sheep()` resolves on the child's `close`, so this is when the process ended, not when it printed: a command
      // that prints its answer and then holds the terminal is no answer at all to a dog reading `out=$(sheep status …)`.
      const status = await sheep(["status", id]);
      const seconds = (Date.now() - started) / 1000;
      expect(status.code).toBe(0);
      expect(status.stderr).toBe("");
      // The four lines, the third of them growing with the setup: the row was minted at 1m 40s and the deadline adds its two seconds.
      const lines = status.stdout.split("\n");
      expect(lines[0]).toBe(`id: ${id}`);
      expect(lines[1]).toBe("state: running");
      expect(lines[2]).toMatch(/^setup: running \(1m 4[0-9]s\)$/);
      expect(lines[3]).toBe(SETUP_NO_LANE);
      expect(lines[4]).toBe("");
      // The deadline is the command's own, and the end is too: the socket said nothing either way.
      expect(seconds).toBeGreaterThan(2);
      expect(seconds).toBeLessThan(ENDS_BY_S);
    });
  }

  it("says the same in --json, and ends the same way", async () => {
    const id = "held-born";
    const started = Date.now();
    const json = await sheep(["status", id, "--json"]);
    expect(JSON.parse(json.stdout)).toEqual({ id, state: "running", setup: { state: "running", at: expect.any(Number) }, snapshot: null });
    expect((Date.now() - started) / 1000).toBeLessThan(ENDS_BY_S);
  });

  it("refuses as it did on a sheep whose row says no setup: the lane is still what status is for", async () => {
    const status = await sheep(["status", "quiet"]);
    expect(status).toEqual({ code: 2, stdout: "", stderr: "sheep: no session quiet at this home; `sheep ls` lists the ones there are\n" });
  });

  it("journey 1 step 3: ls --json carries the row's setup, and ls's columns are the six they were", async () => {
    const json = JSON.parse((await sheep(["ls", "--json"])).stdout) as Array<{ id: string; setup: SetupState | null }>;
    expect(json.find((one) => one.id === "held-born")?.setup).toMatchObject({ state: "running" });
    expect(json.find((one) => one.id === "quiet")?.setup).toBeNull();
    const text = await sheep(["ls"]);
    for (const line of text.stdout.split("\n").filter(Boolean)) expect(line.split("\t")).toHaveLength(6);
  });
});

describe("journey 1 step 4 and journey 2 steps 2 to 4: the block in sheep log", () => {
  const call = { id: "e1", type: "message", timestamp: AT - 2_000, message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "pnpm build" } }] } };
  const result = { id: "e2", type: "message", timestamp: AT + 200_000, message: { role: "toolResult", toolName: "bash", content: [{ type: "text", text: "built\n" }] } };
  const record: SetupRecord = { id: `setup-${AT}`, at: AT, ms: 112_000, command: "bash /pasture/setup.sh", exit: 0, output: "installed the tool\nready\n", truncated: false };
  const failed: SetupRecord = { id: `setup-${AT + 300_000}`, at: AT + 300_000, ms: 12_400, command: "bash /pasture/setup.sh", exit: 1, output: "setup.sh: line 3: nope\n", truncated: false };

  it("prints it between the tool call and that call's result, oldest first, with the tail", async () => {
    sheepdom.set("logged", { setup: null, asks: 0, socket: "refuse", entries: [call, result], setups: [record, failed] });
    const logged = await sheep(["log", "logged"]);
    expect(logged.code).toBe(0);
    expect(logged.stdout).toBe(
      `[assistant] e1 ${new Date(AT - 2_000).toISOString()}\n[tool bash] {"command":"pnpm build"}\n\n` +
        `[setup] setup-${AT} ${new Date(AT).toISOString()} exit 0 after 1m 52s\ninstalled the tool\nready\n\n` +
        `[result bash] e2 ${new Date(AT + 200_000).toISOString()}\nbuilt\n\n` +
        `[setup] setup-${AT + 300_000} ${new Date(AT + 300_000).toISOString()} exit 1 after 12.4 s\nsetup.sh: line 3: nope\n`,
    );
    // Both blocks are there, each dated, oldest first (journey 2 step 3).
    expect(logged.stdout.indexOf(`setup-${AT} `)).toBeLessThan(logged.stdout.indexOf(`setup-${AT + 300_000} `));
  });

  it("--json gives each its own type and leaves every pi entry beside it unchanged", async () => {
    const logged = await sheep(["log", "logged", "--json"]);
    const lines = logged.stdout.trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.map((line) => line.type)).toEqual(["message", "setup", "message", "setup"]);
    expect(lines[0]).toEqual(call);
    expect(lines[2]).toEqual(result);
    expect(lines[1]).toEqual({ type: "setup", ...record });
  });

  it("journey 2 step 4: a record an eviction cut off says what the row says, not `running`", async () => {
    const running: SetupRecord = { id: `setup-${AT}`, at: AT, command: "bash /pasture/setup.sh", output: "", truncated: false };
    sheepdom.set("evicted", { setup: { state: "failed", at: AT, error: EVICTED }, asks: 0, socket: "refuse", entries: [], setups: [running] });
    const logged = await sheep(["log", "evicted"]);
    expect(logged.stdout).toBe(`[setup] setup-${AT} ${new Date(AT).toISOString()} error ${EVICTED}\n`);
    // A record still running, with a row that says so, is the elapsed time and the block being there at all.
    sheepdom.set("warming", { setup: { state: "running", at: Date.now() - 12_400 }, asks: 0, socket: "refuse", entries: [], setups: [{ ...running, at: Date.now() - 12_400, id: "setup-now" }] });
    const warming = await sheep(["log", "warming"]);
    expect(warming.stdout).toMatch(/^\[setup] setup-now \S+ running \(1[23]\.\d s\)\n$/);
  });

  it("tether's journey 3: an assistant entry's errorMessage is its block's last line, and one with none is unchanged", async () => {
    const warning = "Assistant request was interrupted. The preceding content is the latest committed partial; newer live output may be missing and the external outcome is unknown.";
    const interrupted = { id: "e3", type: "message", timestamp: AT + 1_000, message: { role: "assistant", content: [], stopReason: "error", errorMessage: warning } };
    const partial = { id: "e4", type: "message", timestamp: AT + 2_000, message: { role: "assistant", content: [{ type: "text", text: "half a" }], stopReason: "error", errorMessage: warning } };
    const reply = { id: "e5", type: "message", timestamp: AT + 3_000, message: { role: "assistant", content: [{ type: "text", text: "the reply\n" }], stopReason: "stop" } };
    sheepdom.set("interrupted", { setup: null, asks: 0, socket: "refuse", entries: [interrupted, partial, reply], setups: [] });
    const logged = await sheep(["log", "interrupted"]);
    expect(logged.code).toBe(0);
    expect(logged.stdout).toBe(
      `[assistant] e3 ${new Date(AT + 1_000).toISOString()}\n[error] ${warning}\n\n` +
        `[assistant] e4 ${new Date(AT + 2_000).toISOString()}\nhalf a\n[error] ${warning}\n\n` +
        `[assistant] e5 ${new Date(AT + 3_000).toISOString()}\nthe reply\n`,
    );
    // --json already carried the fields, and still does, unchanged.
    const json = await sheep(["log", "interrupted", "--json"]);
    expect(json.stdout.trimEnd().split("\n").map((line) => JSON.parse(line) as unknown)).toEqual([interrupted, partial, reply]);
  });

  it("journey 3 step 1: a sheep with no setups has the bytes it had, and the row is not asked for it", async () => {
    sheepdom.set("bare", { setup: null, asks: 0, socket: "refuse", entries: [call, result], setups: [] });
    asked.length = 0;
    const logged = await sheep(["log", "bare"]);
    expect(logged.stdout).toBe(
      `[assistant] e1 ${new Date(AT - 2_000).toISOString()}\n[tool bash] {"command":"pnpm build"}\n\n[result bash] e2 ${new Date(AT + 200_000).toISOString()}\nbuilt\n`,
    );
    // And the whole of what the home was asked: the transcript, as before this project. The row costs a request only
    // where it is the answer — a record with no ending, `status`, and the poll a held prompt makes.
    expect(sheepdom.get("bare")!.asks).toBe(0);
    expect(asked).toEqual(["GET /s/bare/transcript"]);
  });
});
