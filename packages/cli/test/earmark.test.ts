/**
 * Earmark phase 1, the verb's half: `sheep new --secret <NAME> …` through
 * `bin/sheep.js` against a fake home that records every request. Journey 3
 * step 1, stdin a terminal (lent by `script`, as join's test does), and the
 * other refusals, each one sentence on stderr, exit 2, nothing on stdout,
 * and no request; then a mint whose one request carries the values matched
 * to the names in the order given, and `sheep ls`'s sixth column. The same
 * steps against a real `wrangler dev` are journey 5's, in the home ring.
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refuseNames, SECRET_AT_MINT, SECRET_NEEDS_STDIN, SECRET_NOT_TYPED, secretsFrom } from "../src/earmark.js";
import { bin, type Result } from "./local-home.js";

const TOKEN = "earmark-cli-token";
const VALUE = "sk-earmark-one-0123456789";
const SECOND = "sk-earmark-two-9876543210";
const ID = "0b7a2c1e-5f3d-4c2b-9a8e-1d2c3b4a5f60";

interface Asked {
  method: string;
  url: string;
  body: string;
}

let server: Server;
let url: string;
let dir: string;
const asked: Asked[] = [];

beforeAll(async () => {
  dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-earmark-")));
  // A home: POST /sessions answers the row as the Directory has it, the names sorted; GET /sessions lists that row and a bare one.
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")));
    request.on("end", () => {
      asked.push({ method: request.method ?? "", url: request.url ?? "", body });
      if (request.method === "POST" && request.url === "/sessions") {
        const given = JSON.parse(body) as { name?: string; pasture?: string; secrets?: Record<string, string> };
        response.statusCode = 201;
        return response.end(JSON.stringify({ id: ID, name: given.name ?? null, createdAt: 0, state: "idle", pasture: given.pasture ?? null, task: null, secrets: Object.keys(given.secrets ?? {}).sort() }));
      }
      if (request.method === "GET" && request.url === "/sessions") {
        return response.end(
          JSON.stringify([
            { id: ID, name: null, createdAt: 0, state: "idle", pasture: "meadow", task: null, secrets: ["A", "B"] },
            { id: "bare", name: "bare", createdAt: 0, state: "idle", pasture: null, task: null, secrets: [] },
          ]),
        );
      }
      response.statusCode = 404;
      response.end("no");
    });
  });
  url = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

/**
 * The CLI against the fake home; `stdin` piped (a string, or closed at once), or a terminal lent by `script`. `script`'s own
 * stdin is /dev/null, not a pipe: macOS's refuses to start on a socket ("tcgetattr/ioctl: Operation not supported on socket"),
 * which is what node's piped stdio is there, and takes a device that is no terminal; the child gets the pty either way.
 */
function sheep(args: string[], options: { stdin?: string; tty?: boolean } = {}): Promise<Result> {
  const env = { ...process.env, SHEEP_HOME: url, SHEEP_TOKEN: TOKEN, HOME: dir, NODE_NO_WARNINGS: "1" };
  return new Promise((resolve, reject) => {
    const child = options.tty
      ? spawn("script", process.platform === "darwin" ? ["-q", "/dev/null", process.execPath, bin, ...args] : ["-qec", [process.execPath, bin, ...args].map((arg) => `'${arg.replace(/'/g, `'\\''`)}'`).join(" "), "/dev/null"], { env, cwd: dir, stdio: ["ignore", "pipe", "pipe"] })
      : spawn(process.execPath, [bin, ...args], { env, cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
    // At a terminal nothing is typed; piped, the bytes are the stdin.
    child.stdin?.end(options.stdin ?? "");
  });
}

const refused = (sentence: string): Result => ({ code: 2, stdout: "", stderr: `sheep: ${sentence}\n` });

describe("sheep new --secret: the rules, as functions", () => {
  it("refuses a bad name, a name twice, and any name but GIT_TOKEN with no pasture, in the home's words", () => {
    expect(refuseNames(["PROBE", "_x", "A1"], "p")).toBeUndefined();
    expect(refuseNames(["GIT_TOKEN"], undefined)).toBeUndefined();
    expect(refuseNames(["1BAD"], "p")).toBe(`a secret's name is an environment variable's, not "1BAD"`);
    expect(refuseNames(["A-B"], "p")).toBe(`a secret's name is an environment variable's, not "A-B"`);
    expect(refuseNames([undefined], "p")).toBe(`a secret's name is an environment variable's, not ""`);
    expect(refuseNames(["PROBE", "PROBE"], "p")).toBe("a secret's name is an environment variable's, once: PROBE is given twice");
    expect(refuseNames(["NPM_TOKEN"], undefined)).toBe("a sheep born into no pasture has no setup, so GIT_TOKEN is the only secret it can carry, not NPM_TOKEN");
  });

  it("matches one line per name in order: a final newline and a \\r before one dropped; a count off or an empty line refused", () => {
    expect(secretsFrom(`${VALUE}\n`, ["PROBE"])).toEqual({ secrets: { PROBE: VALUE } });
    expect(secretsFrom(VALUE, ["PROBE"])).toEqual({ secrets: { PROBE: VALUE } });
    expect(secretsFrom(`${VALUE}\r\n${SECOND}\r\n`, ["B", "A"])).toEqual({ secrets: { B: VALUE, A: SECOND } });
    expect(secretsFrom(`${VALUE}\n`, ["A", "B"])).toEqual({ refused: "one line of stdin per --secret name, in order: 2 names, 1 line" });
    expect(secretsFrom(`${VALUE}\n${SECOND}\n`, ["A"])).toEqual({ refused: "one line of stdin per --secret name, in order: 1 name, 2 lines" });
    expect(secretsFrom("", ["A"])).toEqual({ refused: "one line of stdin per --secret name, in order: 1 name, 0 lines" });
    expect(secretsFrom("\n", ["A"])).toEqual({ refused: "one line of stdin per --secret name, in order: the line for A is empty" });
    expect(secretsFrom(`${VALUE}\n\n`, ["A", "B"])).toEqual({ refused: "one line of stdin per --secret name, in order: the line for B is empty" });
    expect(secretsFrom(`${VALUE}\r`, ["A"])).toEqual({ refused: "the value of the secret A is not a non-empty string of one line" });
    // No refusal names a value.
    for (const text of [`${VALUE}\n`, `${VALUE}\n\n`, `${VALUE}\r`]) {
      const answer = secretsFrom(text, ["A", "B"]);
      if ("refused" in answer) expect(answer.refused).not.toContain(VALUE);
    }
  });
});

describe("sheep new --secret: refused before any request", () => {
  it("journey 3 step 1: stdin a terminal is refused, nothing asked of the home and nothing typed", { timeout: 30_000 }, async () => {
    asked.length = 0;
    const result = await sheep(["new", "--secret", "PROBE", "--pasture", "meadow", "--detach"], { tty: true });
    // `script` exits with the child's status; the sentence is on the pty, which `script` copies to its stdout.
    const everything = `${result.stdout}\n${result.stderr}`;
    if (!everything.includes("sheep: ")) {
      // Without `script` here (or a pty refused under the runner) the CLI never ran and the case cannot be had; say so rather than
      // pass silently. Once the CLI has said anything, what it said is asserted whole.
      console.warn(`sheep new --secret at a terminal could not be driven here (exit ${result.code}): ${everything.trim().split("\n").slice(-2).join(" | ")}`);
      return;
    }
    expect(result.code).toBe(2);
    // The whole of it is the sentence, less the pty's echo of the end-of-file `script` passed on from /dev/null ("^D" and two backspaces).
    expect(everything.replace(/\^D\x08\x08/g, "").replace(/\r/g, "").trim()).toBe(`sheep: ${SECRET_NOT_TYPED}`);
    expect(asked).toEqual([]);
  });

  it("journey 3 steps 2 to 6: each one sentence on stderr, exit 2, nothing on stdout, and no request", async () => {
    asked.length = 0;
    const cases: Array<{ args: string[]; stdin?: string; sentence: string }> = [
      // Step 2: two names and one line; one name and two lines; an empty line; nothing at all.
      { args: ["new", "--pasture", "meadow", "--secret", "A", "--secret", "B", "--detach"], stdin: `${VALUE}\n`, sentence: "one line of stdin per --secret name, in order: 2 names, 1 line" },
      { args: ["new", "--pasture", "meadow", "--secret", "A", "--detach"], stdin: `${VALUE}\n${SECOND}\n`, sentence: "one line of stdin per --secret name, in order: 1 name, 2 lines" },
      { args: ["new", "--pasture", "meadow", "--secret", "A", "--secret", "B", "--detach"], stdin: `${VALUE}\n\n`, sentence: "one line of stdin per --secret name, in order: the line for B is empty" },
      { args: ["new", "--pasture", "meadow", "--secret", "A", "--detach"], stdin: "", sentence: "one line of stdin per --secret name, in order: 1 name, 0 lines" },
      // Step 3: a bad name, and the same name twice.
      { args: ["new", "--pasture", "meadow", "--secret", "1BAD", "--detach"], stdin: `${VALUE}\n`, sentence: `a secret's name is an environment variable's, not "1BAD"` },
      { args: ["new", "--pasture", "meadow", "--secret", "PROBE", "--secret=PROBE", "--detach"], stdin: `${VALUE}\n${SECOND}\n`, sentence: "a secret's name is an environment variable's, once: PROBE is given twice" },
      { args: ["new", "--pasture", "meadow", "--detach", "--secret"], stdin: `${VALUE}\n`, sentence: `a secret's name is an environment variable's, not ""` },
      // Step 4: a name but GIT_TOKEN with no pasture.
      { args: ["new", "--secret", "NPM_TOKEN", "--detach"], stdin: `${VALUE}\n`, sentence: "a sheep born into no pasture has no setup, so GIT_TOKEN is the only secret it can carry, not NPM_TOKEN" },
      // Step 5: neither --detach nor a prompt: pi's terminal would want the stdin the values come from.
      { args: ["new", "--secret", "PROBE", "--pasture", "meadow"], stdin: `${VALUE}\n`, sentence: SECRET_NEEDS_STDIN },
      // Step 6: on attach and -c, with or without a prompt.
      { args: ["attach", ID, "--secret", "PROBE", "--detach", "--", "hello"], stdin: `${VALUE}\n`, sentence: SECRET_AT_MINT },
      { args: ["attach", ID, "--secret", "PROBE"], stdin: `${VALUE}\n`, sentence: SECRET_AT_MINT },
      { args: ["-c", "--secret", "PROBE", "--", "hello"], stdin: `${VALUE}\n`, sentence: SECRET_AT_MINT },
      { args: ["--continue", "--secret", "PROBE", "--detach", "--", "hello"], stdin: `${VALUE}\n`, sentence: SECRET_AT_MINT },
    ];
    for (const { args, stdin, sentence } of cases) expect(await sheep(args, { stdin }), `sheep ${args.join(" ")}`).toEqual(refused(sentence));
    expect(asked).toEqual([]);
  });
});

describe("sheep new --secret: the mint and the names", () => {
  it("sends the values matched to the names in the order given, in the mint's one request, and prints the id alone", async () => {
    asked.length = 0;
    const minted = await sheep(["new", "--pasture", "meadow", "--secret", "B", "--secret", "A", "--detach"], { stdin: `${VALUE}\n${SECOND}\n` });
    expect(minted).toEqual({ code: 0, stdout: `${ID}\n`, stderr: "" });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ method: "POST", url: "/sessions" });
    expect(JSON.parse(asked[0]!.body)).toEqual({ pasture: "meadow", secrets: { B: VALUE, A: SECOND } });
    // A pastureless sheep's GIT_TOKEN, `\r\n` from a Windows pipe, --json adding nothing to the id.
    asked.length = 0;
    const pastureless = await sheep(["new", "--secret", "GIT_TOKEN", "--detach", "--json"], { stdin: `${VALUE}\r\n` });
    expect(pastureless).toEqual({ code: 0, stdout: `${ID}\n`, stderr: "" });
    expect(JSON.parse(asked[0]!.body)).toEqual({ secrets: { GIT_TOKEN: VALUE } });
    // Without --secret the request carries no secrets, and stdin is not read: a mint with nothing piped still mints.
    asked.length = 0;
    expect((await sheep(["new", "--detach"])).code).toBe(0);
    expect(JSON.parse(asked[0]!.body)).toEqual({});
  });

  it("sheep ls: the names last, comma separated, empty for none; --json the home's rows as they come", async () => {
    const ls = await sheep(["ls"]);
    expect(ls).toEqual({ code: 0, stdout: `${ID}\t\t1970-01-01T00:00:00.000Z\tidle\tmeadow\tA,B\nbare\tbare\t1970-01-01T00:00:00.000Z\tidle\t\t\n`, stderr: "" });
    const json = JSON.parse((await sheep(["ls", "--json"])).stdout) as Array<{ id: string; secrets: string[] }>;
    expect(json.map((row) => [row.id, row.secrets])).toEqual([
      [ID, ["A", "B"]],
      ["bare", []],
    ]);
  });
});
