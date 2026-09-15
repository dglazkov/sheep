/**
 * Hill phase 0, the verb's half: `sheep hill` through `bin/sheep.js`
 * against a fake home, in earmark's shape. Journey 1 step 1: the url the
 * home answered on stdout, one line and nothing else, exit 0, and the one
 * request a `POST /hill/passes` under the bearer. Journey 1's third
 * criterion's last sentence: a home too old to have the route answers its
 * router's bare `not found`, and the verb is refused with the sentence
 * `sheep sh` gives a home that lacks the peek, exit 2, nothing on stdout.
 * The seat, the cookie, and the door are the cell's, in workerd.
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bin, type Result } from "./local-home.js";

const TOKEN = "hill-cli-token";
const PASS = "5e1d9c3a7b2f4068a1c3e5f7092b4d6f8a0c2e4f6b8d0a1c3e5f7092b4d6f8a0";

interface Asked {
  method: string;
  url: string;
  authorization: string | undefined;
}

let current: Server;
let old: Server;
let url: string;
let oldUrl: string;
let dir: string;
const asked: Asked[] = [];

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
}

beforeAll(async () => {
  dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-hill-")));
  // A home with the route: POST /hill/passes answers the url at its own origin and when the pass expires.
  current = createServer((request, response) => {
    asked.push({ method: request.method ?? "", url: request.url ?? "", authorization: request.headers.authorization });
    request.resume();
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/hill/passes" && request.headers.authorization === `Bearer ${TOKEN}`) {
        response.statusCode = 201;
        response.setHeader("content-type", "application/json");
        return response.end(JSON.stringify({ url: `${url}/hill/?pass=${PASS}`, expires: Date.now() + 120_000 }));
      }
      response.statusCode = 404;
      response.end("not found");
    });
  });
  // A home from before the hill: every route it lacks is its router's bare `not found`, and it sends no build header.
  old = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.statusCode = 404;
      response.end("not found");
    });
  });
  url = await listen(current);
  oldUrl = await listen(old);
});

afterAll(async () => {
  await new Promise((resolve) => current.close(resolve));
  await new Promise((resolve) => old.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

function sheep(args: string[], home: string): Promise<Result> {
  const env = { ...process.env, SHEEP_HOME: home, SHEEP_TOKEN: TOKEN, HOME: dir, SHEEP_TIP: "0", NODE_NO_WARNINGS: "1" };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { env, cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
  });
}

describe("sheep hill", () => {
  it("journey 1 step 1: prints the url the home answered and nothing else, exit 0, from one POST /hill/passes under the bearer", async () => {
    asked.length = 0;
    expect(await sheep(["hill"], url)).toEqual({ code: 0, stdout: `${url}/hill/?pass=${PASS}\n`, stderr: "" });
    expect(asked).toEqual([{ method: "POST", url: "/hill/passes", authorization: `Bearer ${TOKEN}` }]);
  });

  it("a home answering its bare `not found` gets the sentence `sheep sh` gives a home that lacks the peek, exit 2, nothing on stdout", async () => {
    expect(await sheep(["hill"], oldUrl)).toEqual({
      code: 2,
      stdout: "",
      stderr: "sheep: the home's build (a build from before the header) is older than this command speaks to; `sheep home deploy` from this package updates it\n",
    });
  });
});
