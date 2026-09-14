/**
 * drove phase 0: the `town` program in the cell, in workerd, against a
 * fake town in the same isolate. The contract is town's `docs/harness.md`
 * and only that doc: nothing of town's is imported, copied, or read here.
 * The fake town is a `fetch` that records each request it was sent and
 * answers as the case scripts, in `earmark.test.ts`'s shape, so a test of
 * a network never runs.
 *
 * Two halves. The first is the contract, section by section, with the
 * program in just-bash itself, so a case reads the recorded request and
 * the three things the shell returns, `stdout`, `stderr`, and the exit
 * code, apart: §3's word shapes, §4's stdin bytes and `null`, §5's headers
 * and fields, §6's bytes unchanged and a 500 with `why`, §7's refusals
 * with and without `--json`, §8's codes, §9's notices, §10's one request.
 *
 * The second is the grant's source, journey 3 steps 1 to 5 in the cell's
 * terms, through a real cell the home mints: the sheep's shell run through
 * pi's bash tool, the prompt read as the faux model was given it. A sheep
 * with neither grant is refused at exit 3 and not told of `town`; a
 * pasture's grant is used and named; the sheep's own lays over it; a
 * pasture's grant set after the boot is used at the next run while the
 * prompt stays the boot's. Then the search: the token's bytes in no line
 * the shell returned, no log line, the shell's `env`, and no row of the
 * cell's storage; and, against the fake container, in no frame of a
 * pasture's `setup.sh` run, whose environment is the pasture's secrets and
 * the sheep's laid over them less `GIT_TOKEN` and `TOWN_GRANT`.
 */
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { Bash } from "just-bash/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import type { SessionSummary } from "../src/directory.ts";
import { TOWN_PARAGRAPH } from "../src/env/programs.ts";
import { didNotAnswer, envelope, NO_GRANT, NOT_A_GRANT, parseGrant, STDIN_NOT_UTF8, TOWN_GRANT, type TownFetch, type TownSource, townCommand } from "../src/env/town-command.ts";
import { SETUP_COMMAND, SETUP_PATH } from "../src/env/execution-env.ts";
import { setFauxScript } from "../src/models.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { type FakeContainer, type ScriptFor, serveFakeOn } from "./fake-container.ts";

const context = BACKGROUND_CONTEXT;
const bashTool = createBashTool();
const invocation = {
  invocationId: "inv",
  operationId: "op",
  turnId: "turn",
  async getMemo() {
    return undefined;
  },
  async setMemo() {},
};
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

/** The tokens: each a string that looks like nothing else, so a search for one is exact. */
const TOKEN = "town-token-7c1e4a9f2b6d4085-held-by-the-program";
const OTHER_TOKEN = "town-token-2f9b6d1e8a3c4071-the-other-towns";
const LATER_TOKEN = "town-token-5d3a8f2c7e1b4069-set-after-the-boot";
const TOKENS = [TOKEN, OTHER_TOKEN, LATER_TOKEN];
const ORIGIN = "http://127.0.0.1:7000";
const OTHER_ORIGIN = "http://127.0.0.1:7100";
const LATER_ORIGIN = "http://127.0.0.1:7200";
/** A grant as one line, as `jq -c .` hands it; and as `townd admin pass new` prints it, indented with a newline after. */
const GRANT = JSON.stringify({ town: ORIGIN, token: TOKEN });
const INDENTED = `${JSON.stringify({ town: ORIGIN, token: TOKEN }, null, 2)}\n`;
const NOTICE = "town-notice: pass-expires expires=2026-09-17T17:38:03Z\n";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The fake town.

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

type Answer = (request: Recorded) => Response | Promise<Response>;

/** A town as a `fetch`: every request recorded whole, then answered as the case says. */
function fakeTown(answer: Answer): { fetch: TownFetch; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const fetch: TownFetch = async (input, init) => {
    const request = new Request(input, init);
    const recorded: Recorded = { url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body: await request.text() };
    requests.push(recorded);
    return answer(recorded);
  };
  return { fetch, requests };
}

/** The town's answer, the three fields and whatever else, at a status. */
function answered(stdout: string, stderr: string, exit: number, status = 200, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ stdout, stderr, exit, ...extra }), { status, headers: { "content-type": "application/json" } });
}

/** The check shop's `cat` and `echo`, as a town would answer them, notice first on stderr: enough to read what was sent back. */
const conform: Answer = (request) => {
  const body = JSON.parse(request.body) as { argv: string[]; stdin: string | null; json: boolean };
  const [shop, command, ...rest] = body.argv;
  let output = "";
  if (shop === "conform" && command === "cat") output = body.stdin ?? "";
  else if (shop === "conform" && command === "echo" && rest[0] === "--text" && rest[1] !== undefined) output = `${rest[1]}\n`;
  else output = "test/conform  Answers conformance's checks. [echo, cat, count, fail]\n";
  if (body.json) return answered(`${JSON.stringify({ ok: true, output, notices: [{ kind: "pass-expires", expires: "2026-09-17T17:38:03Z" }], exit: 0 })}\n`, "", 0);
  return answered(output, NOTICE, 0);
};

interface Ran {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** One line in just-bash with the program in it, the three outputs apart. */
async function sh(source: TownSource, line: string, files: Record<string, string | Uint8Array> = {}): Promise<Ran> {
  const bash = new Bash({ customCommands: [townCommand(source)], files });
  const result = await bash.exec(line);
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
}

function source(value: string | undefined, fetch: TownFetch, timeoutMs?: number): TownSource {
  return { grant: async () => value, fetch, ...(timeoutMs === undefined ? {} : { timeoutMs }) };
}

function sent(request: Recorded | undefined): { argv: string[]; stdin: string | null; json: boolean } {
  expect(request).toBeDefined();
  return JSON.parse(request!.body) as { argv: string[]; stdin: string | null; json: boolean };
}

// ---------------------------------------------------------------------------
// The contract, section by section.

describe("drove phase 0: the contract's sections, the program in just-bash against a fake town", () => {
  it("§1 and §5: `town` with no words is a call like any other, one POST to /call at the grant's origin with the two headers and the three fields", async () => {
    const town = fakeTown(conform);
    const ran = await sh(source(GRANT, town.fetch), "town");
    expect(ran).toEqual({ stdout: "test/conform  Answers conformance's checks. [echo, cat, count, fail]\n", stderr: NOTICE, exitCode: 0 });
    expect(town.requests).toHaveLength(1);
    const [request] = town.requests;
    expect(request!.method).toBe("POST");
    expect(request!.url).toBe(`${ORIGIN}/call`);
    expect(request!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request!.headers["content-type"]).toBe("application/json");
    // Exactly the three fields, in the contract's order.
    expect(request!.body).toBe('{"argv":[],"stdin":null,"json":false}');

    // §5: a trailing slash on the grant's `town` posts to the same /call.
    const slashed = fakeTown(conform);
    expect((await sh(source(JSON.stringify({ town: `${ORIGIN}/`, token: TOKEN }), slashed.fetch), "town conform echo --text hello")).exitCode).toBe(0);
    expect(slashed.requests.map((each) => each.url)).toEqual([`${ORIGIN}/call`]);
    expect(sent(slashed.requests[0])).toEqual({ argv: ["conform", "echo", "--text", "hello"], stdin: null, json: false });
  });

  it("§2: white space around the JSON, newlines included, is a grant; a https origin with a port is one", async () => {
    for (const value of [INDENTED, `  \n\t${GRANT}\n\n  `, `\n${INDENTED}\n`]) {
      const town = fakeTown(conform);
      expect(await sh(source(value, town.fetch), "town conform echo --text hi"), JSON.stringify(value)).toEqual({ stdout: "hi\n", stderr: NOTICE, exitCode: 0 });
      expect(town.requests.map((each) => [each.url, each.headers.authorization])).toEqual([[`${ORIGIN}/call`, `Bearer ${TOKEN}`]]);
    }
    expect(parseGrant(JSON.stringify({ town: "https://box.example:8443", token: TOKEN }))).toEqual({ origin: "https://box.example:8443", token: TOKEN });
    expect(parseGrant(JSON.stringify({ town: `${ORIGIN}/`, token: TOKEN, pass: "extra fields are the grant's own" }))).toEqual({ origin: ORIGIN, token: TOKEN });
  });

  it("§2 and §7: no grant, and a value that holds no grant, are exit 3 and one line on stderr, never the value, and no request; with --json the five-field envelope on stdout", async () => {
    const town = fakeTown(conform);
    expect(await sh(source(undefined, town.fetch), "town")).toEqual({ stdout: "", stderr: `${NO_GRANT}\n`, exitCode: 3 });
    expect(await sh(source(undefined, town.fetch), "town conform echo --text hi")).toEqual({ stdout: "", stderr: `${NO_GRANT}\n`, exitCode: 3 });
    expect(await sh(source(undefined, town.fetch), "town --json conform echo --text hi")).toEqual({ stdout: `{"ok":false,"output":"","notices":[],"exit":3,"error":${JSON.stringify(NO_GRANT)}}\n`, stderr: "", exitCode: 3 });
    expect(NO_GRANT).toBe("town: this sheep carries no grant; mint one with sheep new --secret TOWN_GRANT, or set the pasture's");

    // Each value that holds no grant, and the secret it would leak if it were printed.
    const noGrants: Array<{ value: string; secret: string }> = [
      { value: "not a grant\n", secret: "not a grant" },
      { value: TOKEN, secret: TOKEN },
      { value: "", secret: "" },
      { value: "   \n", secret: "" },
      { value: JSON.stringify({ town: "not a url", token: TOKEN }), secret: TOKEN },
      { value: JSON.stringify({ town: "ftp://127.0.0.1:7000", token: TOKEN }), secret: TOKEN },
      { value: JSON.stringify({ town: `${ORIGIN}/under/a/path`, token: TOKEN }), secret: TOKEN },
      { value: JSON.stringify({ town: `${ORIGIN}/?q=1`, token: TOKEN }), secret: TOKEN },
      { value: JSON.stringify({ town: `http://user:${TOKEN}@127.0.0.1:7000`, token: "t" }), secret: TOKEN },
      { value: JSON.stringify({ town: ORIGIN, token: "" }), secret: ORIGIN },
      { value: JSON.stringify({ town: ORIGIN }), secret: ORIGIN },
      { value: JSON.stringify({ town: ORIGIN, token: 42 }), secret: ORIGIN },
      { value: JSON.stringify({ town: ORIGIN, token: `${TOKEN}\nx-injected: 1` }), secret: TOKEN },
      { value: JSON.stringify([ORIGIN, TOKEN]), secret: TOKEN },
      { value: `${GRANT} trailing`, secret: TOKEN },
      { value: `x${GRANT}`, secret: TOKEN },
      { value: "/home/sheep/.town/grant.json", secret: "grant.json" },
    ];
    for (const { value, secret } of noGrants) {
      const label = JSON.stringify(value);
      const plain = await sh(source(value, town.fetch), "town memory remember x");
      expect(plain, label).toEqual({ stdout: "", stderr: `${NOT_A_GRANT}\n`, exitCode: 3 });
      const json = await sh(source(value, town.fetch), "town --json memory remember x");
      expect(json, label).toEqual({ stdout: envelope(3, NOT_A_GRANT), stderr: "", exitCode: 3 });
      expect(JSON.parse(json.stdout), label).toEqual({ ok: false, output: "", notices: [], exit: 3, error: NOT_A_GRANT });
      if (secret !== "") for (const said of [plain.stdout, plain.stderr, json.stdout, json.stderr]) expect(said, label).not.toContain(secret);
    }
    // The journey's own words: the line does not contain `not a grant`.
    expect(NOT_A_GRANT).not.toContain("not a grant");
    expect(town.requests).toEqual([]);
  });

  it("§3: every word as given, in order, the empty word, spaces, and non-ASCII kept, --help sent, and each --json taken out wherever it stands", async () => {
    const town = fakeTown(conform);
    const grant = source(GRANT, town.fetch);
    const cases: Array<{ line: string; argv: string[]; json: boolean }> = [
      { line: 'town conform echo --text ""', argv: ["conform", "echo", "--text", ""], json: false },
      { line: `town conform echo --text "  two  words  "`, argv: ["conform", "echo", "--text", "  two  words  "], json: false },
      { line: "town conform echo --text 'héllo·wörld,世界🌍'", argv: ["conform", "echo", "--text", "héllo·wörld,世界🌍"], json: false },
      { line: "town conform --help", argv: ["conform", "--help"], json: false },
      { line: "town --json conform echo --text hi", argv: ["conform", "echo", "--text", "hi"], json: true },
      { line: "town conform echo --json --text hi", argv: ["conform", "echo", "--text", "hi"], json: true },
      { line: "town conform echo --text hi --json", argv: ["conform", "echo", "--text", "hi"], json: true },
      { line: "town --json conform --json echo --text hi --json", argv: ["conform", "echo", "--text", "hi"], json: true },
    ];
    for (const { line, argv, json } of cases) {
      town.requests.length = 0;
      const ran = await sh(grant, line);
      expect(ran.exitCode, line).toBe(0);
      expect(town.requests, line).toHaveLength(1);
      expect(sent(town.requests[0]), line).toEqual({ argv, stdin: null, json });
    }
    // The three --json calls print the same line on stdout and nothing on stderr; the non-ASCII word comes back as itself.
    const lines = await Promise.all(["town --json conform echo --text hi", "town conform echo --json --text hi", "town conform echo --text hi --json"].map((line) => sh(grant, line)));
    for (const ran of lines) expect(ran).toEqual({ stdout: '{"ok":true,"output":"hi\\n","notices":[{"kind":"pass-expires","expires":"2026-09-17T17:38:03Z"}],"exit":0}\n', stderr: "", exitCode: 0 });
    expect((await sh(grant, "town conform echo --text 'héllo·wörld,世界🌍'")).stdout).toBe("héllo·wörld,世界🌍\n");
  });

  it("§4: a pipe or a file is sent exactly, nothing trimmed and no newline added; nothing given, or nothing there, is null; bytes that are not UTF-8 are refused before any request", async () => {
    const town = fakeTown(conform);
    const grant = source(GRANT, town.fetch);
    const exact = 'he said "hi" and\tleft\\ a backslash, \\n not a newline,\r\nand two lines after\n\n';
    const unicode = "héllo·wörld,世界🌍\n";
    const files = { "/in.txt": exact, "/unicode.txt": unicode, "/empty.txt": "", "/latin1.bin": new Uint8Array([0x68, 0xff, 0xfe, 0x0a]) };
    const cases: Array<{ line: string; stdin: string | null }> = [
      { line: "town conform cat < /in.txt", stdin: exact },
      { line: "cat /in.txt | town conform cat", stdin: exact },
      { line: "town conform cat < /unicode.txt", stdin: unicode },
      { line: "printf 'no newline' | town conform cat", stdin: "no newline" },
      { line: "town conform cat", stdin: null },
      { line: "town conform cat < /empty.txt", stdin: null },
      { line: "printf '' | town conform cat", stdin: null },
    ];
    for (const { line, stdin } of cases) {
      town.requests.length = 0;
      const ran = await sh(grant, line, files);
      expect(town.requests, line).toHaveLength(1);
      expect(sent(town.requests[0]), line).toEqual({ argv: ["conform", "cat"], stdin, json: false });
      // The check shop's `cat` prints stdin back, and the program prints that back byte for byte.
      expect(ran, line).toEqual({ stdout: stdin ?? "", stderr: NOTICE, exitCode: 0 });
    }
    town.requests.length = 0;
    expect(await sh(grant, "town conform cat < /latin1.bin", files)).toEqual({ stdout: "", stderr: `${STDIN_NOT_UTF8}\n`, exitCode: 1 });
    expect(await sh(grant, "town --json conform cat < /latin1.bin", files)).toEqual({ stdout: envelope(1, STDIN_NOT_UTF8), stderr: "", exitCode: 1 });
    expect(town.requests).toEqual([]);
    // The grant is found before stdin is read: no grant and stdin that is not UTF-8 is the grant's refusal, exit 3.
    expect(await sh(source(undefined, town.fetch), "town conform cat < /latin1.bin", files)).toEqual({ stdout: "", stderr: `${NO_GRANT}\n`, exitCode: 3 });
  });

  it("§6: the answer's two streams are written exactly as given, adding and removing nothing, whatever the status; a 500 with a why is an answer", async () => {
    const streams: Array<{ stdout: string; stderr: string; exit: number }> = [
      { stdout: "no newline at the end", stderr: "", exit: 0 },
      { stdout: "two\r\nlines\r\n", stderr: "  leading and trailing  \n\n", exit: 0 },
      { stdout: "héllo·wörld,世界🌍", stderr: "error: ünïcödé\n", exit: 1 },
      { stdout: "", stderr: "", exit: 0 },
      { stdout: "\n\n\n", stderr: "\t\n", exit: 2 },
    ];
    for (const stream of streams) {
      const town = fakeTown(() => answered(stream.stdout, stream.stderr, stream.exit));
      expect(await sh(source(GRANT, town.fetch), "town conform echo --text x"), JSON.stringify(stream)).toEqual({ stdout: stream.stdout, stderr: stream.stderr, exitCode: stream.exit });
    }
    // A 500 with the three fields and a `why` is the town's answer.
    const failing = fakeTown(() => answered("", "error: the town's own failure\n", 1, 500, { why: "the shop threw" }));
    expect(await sh(source(GRANT, failing.fetch), "town conform fail")).toEqual({ stdout: "", stderr: "error: the town's own failure\n", exitCode: 1 });
    // §8's revoked pass, as a town may answer it at any status: the three fields are the answer.
    const revoked = fakeTown(() => answered("", "error: this pass is not valid: its token is unknown, revoked, or expired\n", 3, 401));
    expect(await sh(source(GRANT, revoked.fetch), "town conform echo --text hi")).toEqual({ stdout: "", stderr: "error: this pass is not valid: its token is unknown, revoked, or expired\n", exitCode: 3 });
    // What the shell does with the bytes after the program: a pipe reads them unchanged.
    const piped = fakeTown(() => answered("héllo·wörld,世界🌍\nsecond\n", "", 0));
    expect(await sh(source(GRANT, piped.fetch), "town conform echo --text x | wc -l")).toMatchObject({ stdout: expect.stringMatching(/^\s*2\n$/), exitCode: 0 });
  });

  it("§6 and §7: a body that is not the three fields, a status with no JSON, a redirect, a throw, and no answer within the timeout are the town that did not answer: one line, exit 1, or the envelope with --json", async () => {
    const cases: Array<{ answer: Answer; what: string }> = [
      { answer: () => new Response("<html>bad gateway</html>", { status: 502 }), what: "HTTP 502, a body that is not JSON" },
      { answer: () => Response.json({ stdout: "", stderr: "" }, { status: 200 }), what: "HTTP 200, a body that is not stdout, stderr, and exit" },
      { answer: () => Response.json({ stdout: "", stderr: "", exit: "0" }, { status: 200 }), what: "HTTP 200, a body that is not stdout, stderr, and exit" },
      { answer: () => Response.json({ why: "no fields" }, { status: 500 }), what: "HTTP 500, a body that is not stdout, stderr, and exit" },
      { answer: () => Response.json([1, 2, 3]), what: "HTTP 200, a body that is not stdout, stderr, and exit" },
      { answer: () => new Response(null, { status: 302, headers: { location: "http://elsewhere.invalid/call" } }), what: "HTTP 302, a body that is not JSON" },
      {
        answer: () => {
          throw new TypeError("Network connection lost.");
        },
        what: "the request failed: Network connection lost.",
      },
    ];
    for (const { answer, what } of cases) {
      const town = fakeTown(answer);
      const line = didNotAnswer(ORIGIN, what);
      expect(await sh(source(GRANT, town.fetch), "town conform echo --text hi"), what).toEqual({ stdout: "", stderr: `${line}\n`, exitCode: 1 });
      expect(await sh(source(GRANT, town.fetch), "town conform echo --text hi --json"), what).toEqual({ stdout: envelope(1, line), stderr: "", exitCode: 1 });
      for (const request of town.requests) expect(request.url).toBe(`${ORIGIN}/call`);
      expect(town.requests, what).toHaveLength(2);
    }
    expect(didNotAnswer(ORIGIN, "x")).toBe("town: the town at http://127.0.0.1:7000 did not answer (x)");

    // No answer at all: the program waits its time, says so, and exits 1; the fake town never answers and is never asked twice.
    const silent = fakeTown(() => new Promise<Response>(() => {}));
    const started = Date.now();
    expect(await sh(source(GRANT, silent.fetch, 150), "town conform echo --text hi")).toEqual({ stdout: "", stderr: `${didNotAnswer(ORIGIN, "no answer within 0.15 s")}\n`, exitCode: 1 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(silent.requests).toHaveLength(1);
    // The sixty seconds, as the program says them when not shortened.
    expect(didNotAnswer(ORIGIN, `no answer within ${60_000 / 1000} s`)).toBe("town: the town at http://127.0.0.1:7000 did not answer (no answer within 60 s)");
  });

  it("§8 and §9: the answer's exit is the code unchanged, and notice lines pass through with the rest of stderr, on success as on failure", async () => {
    for (const exit of [0, 1, 2, 3, 42]) {
      const town = fakeTown(() => answered(exit === 0 ? "hello\n" : "", `${NOTICE}${exit === 0 ? "" : `error: exit ${exit}\n`}`, exit));
      expect(await sh(source(GRANT, town.fetch), "town conform echo --text hello"), String(exit)).toEqual({ stdout: exit === 0 ? "hello\n" : "", stderr: `${NOTICE}${exit === 0 ? "" : `error: exit ${exit}\n`}`, exitCode: exit });
    }
    // Two notices and an unknown kind: untouched, unparsed, in order.
    const notices = `${NOTICE}town-notice: something-new at=soon with=words\nerror: --text is required\nusage: town conform echo --text <string>\n`;
    const town = fakeTown(() => answered("", notices, 1));
    expect(await sh(source(GRANT, town.fetch), "town conform echo")).toEqual({ stdout: "", stderr: notices, exitCode: 1 });
    // With --json the town's envelope is stdout as it came, notices inside it, and the code is its exit.
    const denied = '{"ok":false,"output":"","notices":[{"kind":"pass-expires","expires":"2026-09-17T17:38:03Z"}],"exit":2,"error":"error: command \'hidden\' is not available to this grant"}\n';
    const json = fakeTown(() => answered(denied, "", 2));
    expect(await sh(source(GRANT, json.fetch), "town --json conform hidden")).toEqual({ stdout: denied, stderr: "", exitCode: 2 });
  });

  it("§10: a call is posted once whatever its answer: once on a 500, once on a body that does not parse, once on a timeout", async () => {
    const onFailure = fakeTown(() => answered("", "error: test/conform fail failed\nconform: failed on purpose\n", 1, 500, { why: "failed on purpose" }));
    expect((await sh(source(GRANT, onFailure.fetch), "town conform fail")).exitCode).toBe(1);
    expect(onFailure.requests).toHaveLength(1);
    const unparsed = fakeTown(() => new Response("not json", { status: 500 }));
    expect((await sh(source(GRANT, unparsed.fetch), "town conform fail")).exitCode).toBe(1);
    expect(unparsed.requests).toHaveLength(1);
    const timedOut = fakeTown(() => new Promise<Response>(() => {}));
    expect((await sh(source(GRANT, timedOut.fetch, 100), "town conform fail")).exitCode).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(timedOut.requests).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The grant's source, through a real cell.

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function mint(body: Record<string, unknown>): Promise<string> {
  const response = await api("/sessions", { method: "POST", body: JSON.stringify(body) });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as SessionSummary).id;
}

/**
 * Every line written to the console from here to the test's end, the cells' among them: the cells and the Directory run in
 * this isolate, so their `console` is this one. The lines still go out; this only reads them.
 */
function logLines(): () => string[] {
  const spies = (["debug", "log", "info", "warn", "error"] as const).map((level) => vi.spyOn(console, level));
  return () => spies.flatMap((spy) => spy.mock.calls.map((args) => args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack ?? ""}` : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")));
}

/** The fake towns, one per origin, each answering `town` with help that names its origin, and recording every request. */
function towns(): { fetch: TownFetch; requests: Recorded[] } {
  return fakeTown((request) => answered(`help from ${new URL(request.url).origin}\n`, NOTICE, 0));
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/** One line in the sheep's shell through pi's bash tool, the town set on the cell first: what the tool returned and the exit code. */
async function inShell(id: string, fetch: TownFetch, command: string): Promise<{ out: string; exitCode: number }> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => {
    cell.test.fetch = fetch;
    const runtime = await cell.runtime();
    try {
      return { out: text(await bashTool.execute("call", { command }, () => {}, { env: runtime.env }, invocation, context)), exitCode: 0 };
    } catch (error) {
      const match = /^([\s\S]*?)\n\n\nCommand exited with code (\d+)$/.exec(error instanceof Error ? error.message : String(error));
      if (match === null) throw error;
      return { out: match[1]!, exitCode: Number(match[2]) };
    }
  });
}

/** One turn: the model runs `command` with the bash tool, then answers. The system prompt it was given, and the tool's result. */
async function turn(id: string, fetch: TownFetch, command: string): Promise<{ prompt: string; result: string }> {
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.fetch = fetch;
  });
  let prompt: string | undefined;
  let result = "";
  setFauxScript((conversation) => {
    prompt = conversation.systemPrompt;
    const last = conversation.messages.at(-1);
    if (last?.role === "toolResult") {
      result = last.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
      return fauxAssistantMessage("done");
    }
    return fauxAssistantMessage([fauxToolCall("bash", { command })], { stopReason: "toolUse" });
  });
  expect((await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: `run ${command}` }) })).status).toBe(200);
  const settled = await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => cell.waitForIdle(20_000));
  expect(settled.operation).toBeNull();
  expect(prompt).toBeDefined();
  return { prompt: prompt!, result };
}

/**
 * Every row of the cell's own storage, as text, blobs decoded: each SQLite table but the platform's, whose `_cf_` tables
 * refuse a read, and the key-value store, which is the platform's `_cf_KV` read the way it is written.
 */
function storageOf(id: string, turned = true): Promise<string> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), async (_cell, state) => {
    const decode = (value: unknown): unknown => (value instanceof ArrayBuffer ? new TextDecoder().decode(value) : value);
    const tables = state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().filter(({ name }) => !name.startsWith("_cf_"));
    const rows = tables.map(({ name }) => ({
      name,
      rows: state.storage.sql
        .exec(`SELECT * FROM "${name.replace(/"/g, '""')}"`)
        .toArray()
        .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, decode(value)]))),
    }));
    const kv = [...(await state.storage.list()).entries()];
    if (turned) expect(rows.some((table) => table.name === "entries" && table.rows.length > 0)).toBe(true);
    return JSON.stringify({ rows, kv });
  });
}

describe("drove phase 0: journey 3 steps 1 to 5 in the cell's terms, the grant's source", () => {
  it("step 1: a sheep with no grant anywhere has `town`, refused at exit 3 with §2's line and no request, and its prompt does not name town", { timeout: 60_000 }, async () => {
    const town = towns();
    const id = await mint({ name: "grantless" });
    const { prompt, result } = await turn(id, town.fetch, "town");
    expect(result).toContain(NO_GRANT);
    expect(prompt).not.toContain(TOWN_PARAGRAPH);
    expect(prompt).not.toContain("town");
    expect(await inShell(id, town.fetch, "town")).toEqual({ out: NO_GRANT, exitCode: 3 });
    expect(await inShell(id, town.fetch, "town --json memory remember x")).toEqual({ out: envelope(3, NO_GRANT).trimEnd(), exitCode: 3 });
    expect(town.requests).toEqual([]);
    // The router counts it tier 0: the line runs in the shell, not refused as a program no tier has.
    const runtime = await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => (await cell.runtime()).env.home);
    expect(runtime.town).toBeUndefined();
  });

  it("steps 2 and 3: a pasture's grant is used and named in the prompt; a sheep's own grant at another town lays over it", { timeout: 60_000 }, async () => {
    const town = towns();
    expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name: "herd" }) })).status).toBe(201);
    // The pasture's grant as `townd` prints it, indented: a pasture secret may hold white space a one-line earmark cannot.
    await env.PASTURE.getByName("herd").setSecret(TOWN_GRANT, INDENTED);

    const herded = await mint({ pasture: "herd" });
    const first = await turn(herded, town.fetch, "town");
    expect(first.prompt).toContain(TOWN_PARAGRAPH);
    expect(first.result).toContain(`help from ${ORIGIN}`);
    expect(await inShell(herded, town.fetch, "town")).toEqual({ out: `help from ${ORIGIN}\n${NOTICE}`, exitCode: 0 });
    expect(town.requests.map((request) => [request.url, request.headers.authorization])).toEqual([
      [`${ORIGIN}/call`, `Bearer ${TOKEN}`],
      [`${ORIGIN}/call`, `Bearer ${TOKEN}`],
    ]);

    town.requests.length = 0;
    const own = await mint({ pasture: "herd", secrets: { [TOWN_GRANT]: JSON.stringify({ town: OTHER_ORIGIN, token: OTHER_TOKEN }) } });
    const second = await turn(own, town.fetch, "town");
    expect(second.prompt).toContain(TOWN_PARAGRAPH);
    expect(second.result).toContain(`help from ${OTHER_ORIGIN}`);
    expect(await inShell(own, town.fetch, "town")).toEqual({ out: `help from ${OTHER_ORIGIN}\n${NOTICE}`, exitCode: 0 });
    expect(town.requests.map((request) => [request.url, request.headers.authorization])).toEqual([
      [`${OTHER_ORIGIN}/call`, `Bearer ${OTHER_TOKEN}`],
      [`${OTHER_ORIGIN}/call`, `Bearer ${OTHER_TOKEN}`],
    ]);
    // The pasture's sheep is still the pasture's.
    expect((await inShell(herded, town.fetch, "town")).out).toContain(`help from ${ORIGIN}`);
  });

  it("step 4: a sheep whose TOWN_GRANT holds no grant is exit 3 with a line that does not hold the value; with --json the envelope and nothing else", { timeout: 60_000 }, async () => {
    const town = towns();
    const id = await mint({ secrets: { [TOWN_GRANT]: "not a grant" } });
    const plain = await inShell(id, town.fetch, "town memory remember x");
    expect(plain).toEqual({ out: NOT_A_GRANT, exitCode: 3 });
    expect(plain.out).not.toContain("not a grant");
    const json = await inShell(id, town.fetch, "town --json memory remember x");
    expect(json).toEqual({ out: envelope(3, NOT_A_GRANT).trimEnd(), exitCode: 3 });
    expect(JSON.parse(json.out)).toEqual({ ok: false, output: "", notices: [], exit: 3, error: NOT_A_GRANT });
    expect(json.out).not.toContain("not a grant");
    expect(town.requests).toEqual([]);
    // A value that holds no grant at the boot is not a grant carried: the prompt does not name town.
    expect((await turn(id, town.fetch, "true")).prompt).not.toContain(TOWN_PARAGRAPH);
  });

  it("step 5: a pasture's grant set after a sheep's boot is used at its next run, while its prompt stays the boot's; a sheep born after is told", { timeout: 60_000 }, async () => {
    const town = towns();
    expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name: "later" }) })).status).toBe(201);
    const before = await mint({ pasture: "later" });
    const booted = await turn(before, town.fetch, "town");
    expect(booted.result).toContain(NO_GRANT);
    expect(booted.prompt).not.toContain(TOWN_PARAGRAPH);
    expect(town.requests).toEqual([]);

    await env.PASTURE.getByName("later").setSecret(TOWN_GRANT, JSON.stringify({ town: LATER_ORIGIN, token: LATER_TOKEN }));
    const after = await turn(before, town.fetch, "town");
    expect(after.result).toContain(`help from ${LATER_ORIGIN}`);
    expect(after.prompt).toBe(booted.prompt);
    expect(town.requests.map((request) => [request.url, request.headers.authorization])).toEqual([[`${LATER_ORIGIN}/call`, `Bearer ${LATER_TOKEN}`]]);

    const born = await mint({ pasture: "later" });
    const told = await turn(born, town.fetch, "town");
    expect(told.prompt).toContain(TOWN_PARAGRAPH);
    expect(told.result).toContain(`help from ${LATER_ORIGIN}`);
  });
});

describe("drove phase 0: the search", () => {
  it("the token's bytes are in no line the shell returned, no log line, the shell's env, and no row of the cell's storage", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const said: string[] = [];
    const town = fakeTown((request) => {
      const body = JSON.parse(request.body) as { argv: string[]; stdin: string | null };
      if (body.argv[0] === "fail") return answered("", "error: failed\n", 1, 500, { why: "on purpose" });
      if (body.argv[0] === "junk") return new Response("<html>no</html>", { status: 502 });
      return answered(`help: ${body.argv.join(" ")} ${body.stdin ?? ""}\n`, NOTICE, 0);
    });
    expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name: "searched" }) })).status).toBe(201);
    await env.PASTURE.getByName("searched").setSecret(TOWN_GRANT, INDENTED);
    const herded = await mint({ pasture: "searched" });
    const own = await mint({ secrets: { [TOWN_GRANT]: JSON.stringify({ town: OTHER_ORIGIN, token: OTHER_TOKEN }) } });
    const broken = await mint({ secrets: { [TOWN_GRANT]: LATER_TOKEN } });

    for (const id of [herded, own, broken]) {
      // Turns, so the tool results land in the transcript and the storage.
      for (const command of ["town", "echo piped | town memory remember x", "town --json fail", "town junk", "env", "town; env | grep -i town"]) {
        const ran = await turn(id, town.fetch, command);
        said.push(ran.result, ran.prompt);
      }
      for (const command of ["town", "town --json junk", "printenv", "export -p", "set"]) said.push((await inShell(id, town.fetch, command)).out);
      const printed = await inShell(id, town.fetch, "env");
      expect(printed.out).toContain("SHEEP=1");
      expect(printed.out).not.toContain(TOWN_GRANT);
      said.push(printed.out);
      const answers = [await (await api(`/s/${id}/`)).text(), await (await api(`/s/${id}/transcript`)).text(), await (await api(`/s/${id}/export`)).text()];
      said.push(...answers);
      said.push(await storageOf(id));
    }
    // The calls were made: the search is over a run that carried the tokens to the town.
    expect(town.requests.some((request) => request.headers.authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(town.requests.some((request) => request.headers.authorization === `Bearer ${OTHER_TOKEN}`)).toBe(true);
    expect(said.some((text) => text.includes(NOT_A_GRANT))).toBe(true);
    expect(said.some((text) => text.includes(didNotAnswer(ORIGIN, "HTTP 502, a body that is not JSON")))).toBe(true);
    // The capture sees a line logged inside a cell, so a token logged by the program or the cell would be here too.
    await runInDurableObject(env.SESSION_CELL.getByName(own), () => console.info(`[search] canary from inside ${own}`));
    const lines = logs();
    expect(lines).toContain(`[search] canary from inside ${own}`);
    for (const token of TOKENS) {
      for (const text of said) expect(text.includes(token), `a returned line, env, answer, or row holds ${token}`).toBe(false);
      for (const line of lines) expect(line.includes(token), `a log line holds ${token}: ${line.slice(0, 200)}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Setup, against the fake container.

/** The container's half without a container, as `earmark.test.ts` has it: dial the real door on `ensure`, serve the fake on what comes back. */
function stubStarter(sessionId: string, script: ScriptFor): { starter: ContainerStarter; fakes: Array<Omit<FakeContainer, "socket">> } {
  const directory = () => env.DIRECTORY.getByName("home");
  const fakes: Array<Omit<FakeContainer, "socket">> = [];
  return {
    fakes,
    starter: {
      async ensure(args) {
        void (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          const response = await SELF.fetch(`${args.cellUrl}?token=${encodeURIComponent(args.token)}`, { headers: { upgrade: "websocket" } });
          if (response.status !== 101) return;
          const socket = response.webSocket!;
          socket.accept();
          const fake = serveFakeOn(socket, { script });
          fakes.push(fake);
          await directory().containerOpened(sessionId, Date.now());
          void fake.closed.then(() => directory().containerClosed(sessionId, Date.now()));
        })();
        return { started: true };
      },
      async renew() {
        return { running: fakes.length > 0 };
      },
      async destroy() {
        fakes.at(-1)?.stop("destroyed");
      },
    },
  };
}

describe("drove phase 0: the grant is not setup's", () => {
  it("a pasture's TOWN_GRANT and a sheep's own reach no setup run frame and are not in `own`, while `town` in that sheep's shell still posts with the sheep's own token", { timeout: 60_000 }, async () => {
    const logs = logLines();
    const town = towns();
    const PROBE = "pasture-probe-9a4c2e7f1b3d4058-setup-still-has-it";
    // No repository, so the Worker's route mints here; setup runs before the first container command.
    expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name: "setup-herd" }) })).status).toBe(201);
    const object = env.PASTURE.getByName("setup-herd");
    await object.put(SETUP_PATH, new TextEncoder().encode("#!/bin/sh\nenv\n"));
    await object.setSecret("PROBE", PROBE);
    await object.setSecret(TOWN_GRANT, INDENTED);
    const id = await mint({ pasture: "setup-herd", secrets: { [TOWN_GRANT]: JSON.stringify({ town: OTHER_ORIGIN, token: OTHER_TOKEN }) } });

    // Setup prints its whole environment, as a careless setup.sh would: whatever reaches it reaches bleat's rows and the log.
    const script: ScriptFor = (request) => {
      const command = request.command.trim();
      const printed = `${Object.entries(request.env).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
      if (command === SETUP_COMMAND) return { steps: [{ stdout: printed }], exit: 0 };
      if (command === "pnpm test") return { steps: [{ stdout: "1 passed\n" }], exit: 0 };
      return undefined;
    };
    const stub = stubStarter(id, script);
    const environment = await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => {
      cell.test.starter = stub.starter;
      cell.test.fetch = town.fetch;
      const runtime = await cell.runtime();
      const asked = await runtime.env.pasture!.setupEnvironment();
      expect(text(await bashTool.execute("call", { command: "pnpm test" }, () => {}, { env: runtime.env }, invocation, context))).toBe("1 passed\n");
      runtime.lease!.idle();
      return asked;
    });

    // What setup is given: the pasture's PROBE, and neither grant; `own` names nothing, so fold's cache rule is as it was.
    expect(environment.environment).toEqual({ PROBE });
    expect(environment.own).toEqual([]);
    const runs = stub.fakes.flatMap((fake) => fake.runs);
    expect(runs.map((run) => run.command)).toEqual([SETUP_COMMAND, "pnpm test"]);
    expect(runs[0]!.env).toMatchObject({ PROBE });
    for (const run of runs) expect(run.env, run.command).not.toHaveProperty(TOWN_GRANT);
    // No frame of the container's transcript, either way, carries a token; the setup frame did carry PROBE, so the frames were read.
    const frames = stub.fakes.flatMap((fake) => fake.transcript).map((entry) => JSON.stringify(entry));
    expect(frames.some((frame) => frame.includes(PROBE))).toBe(true);
    for (const token of TOKENS) for (const frame of frames) expect(frame.includes(token), `a container frame holds ${token}`).toBe(false);

    // `town` in that sheep's shell still posts with the sheep's own token, over the pasture's.
    expect(await inShell(id, town.fetch, "town")).toEqual({ out: `help from ${OTHER_ORIGIN}\n${NOTICE}`, exitCode: 0 });
    expect(town.requests.map((request) => [request.url, request.headers.authorization])).toEqual([[`${OTHER_ORIGIN}/call`, `Bearer ${OTHER_TOKEN}`]]);

    // Setup's printed environment went to bleat's record and the log: neither holds a token.
    const stored = await storageOf(id, false);
    // Bleat's record of the setup is a row of the cell's, and it holds what setup printed.
    expect(stored).toContain(PROBE);
    const transcript = await (await api(`/s/${id}/transcript`)).text();
    expect(transcript).toContain(PROBE);
    for (const token of TOKENS) {
      expect(transcript.includes(token), `the transcript view holds ${token}`).toBe(false);
      expect(stored.includes(token), `a row holds ${token}`).toBe(false);
      for (const line of logs()) expect(line.includes(token), `a log line holds ${token}`).toBe(false);
    }
    await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => (await cell.runtime()).lease?.close("done"));
  });
});
