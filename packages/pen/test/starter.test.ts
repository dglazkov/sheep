/**
 * pen phase 6: the starter beside a celld node, `bin/pen-starter.mjs`, as
 * the process the operator runs, against a stub `docker` on PATH: a shell
 * script that records every call's arguments, keeps a "running" mark per
 * container name for `inspect`, and prints a container id for `run`. Node
 * on purpose: the starter is a Node program on the node, and Node is where
 * it is proved. The cell's side of the same three calls is proved in
 * workerd (`packages/cell/test/starter-http.test.ts`); this test is the
 * other end: what each call does to Docker.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const entry = new URL("../bin/pen-starter.mjs", import.meta.url).pathname;

/**
 * The stub: `run` marks the name running and prints an id; `inspect` prints
 * `true` for a marked name and fails like Docker for an unknown one;
 * `stop` and `kill` clear the mark. Every call is one line in `calls.log`,
 * arguments tab-separated. `run` of the image named `missing:image` fails
 * with Docker's words, for the refused start.
 */
const STUB = `#!/bin/bash
set -e
printf '%s\\n' "$(IFS=$'\\t'; echo "$*")" >> "$PEN_STUB_DIR/calls.log"
verb="$1"; shift
case "$verb" in
  run)
    name=""; image=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --name) name="$2"; shift 2;;
        -e) shift 2;;
        -d|--rm) shift;;
        *) image="$1"; shift;;
      esac
    done
    if [ "$image" = "missing:image" ]; then echo "Unable to find image 'missing:image' locally" >&2; exit 125; fi
    touch "$PEN_STUB_DIR/running-$name"
    echo "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    ;;
  inspect)
    name="\${@: -1}"
    if [ -e "$PEN_STUB_DIR/running-$name" ]; then echo true; else echo "Error: No such object: $name" >&2; exit 1; fi
    ;;
  stop|kill)
    name="\${@: -1}"
    if [ -e "$PEN_STUB_DIR/running-$name" ]; then rm "$PEN_STUB_DIR/running-$name"; echo "$name"; else echo "Error response from daemon: No such container: $name" >&2; exit 1; fi
    ;;
  *) echo "stub: unknown verb $verb" >&2; exit 1;;
esac
`;

interface Starter {
  url: string;
  child: ChildProcess;
  lines: string[];
  stub: string;
}

async function calls(stub: string): Promise<string[][]> {
  const text = await readFile(join(stub, "calls.log"), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("\t"));
}

async function post(url: string, verb: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${url}/${verb}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function until(condition: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function startStarter(args: string[], env: Record<string, string> = {}): Promise<Starter> {
  const stub = await mkdtemp(join(tmpdir(), "pen-starter-"));
  const bin = join(stub, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "docker"), STUB);
  await chmod(join(bin, "docker"), 0o755);
  const lines: string[] = [];
  const child = spawn(process.execPath, [entry, "--port", "0", ...args], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, PEN_STUB_DIR: stub, DOCKER: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stdout!.on("data", (chunk: string) => lines.push(...chunk.split("\n").filter((line) => line !== "")));
  child.stderr!.on("data", (chunk: string) => lines.push(...chunk.split("\n").filter((line) => line !== "")));
  await until(() => lines.some((line) => line.includes("listening on")));
  const port = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(lines.find((line) => line.includes("listening on"))!)![1];
  return { url: `http://127.0.0.1:${port}`, child, lines, stub };
}

async function stopStarter(starter: Starter): Promise<void> {
  const exited = new Promise<void>((resolve) => starter.child.once("exit", () => resolve()));
  starter.child.kill("SIGTERM");
  await exited;
  await rm(starter.stub, { recursive: true, force: true });
}

describe("pen-starter, the process", () => {
  let starter: Starter;
  beforeAll(async () => {
    starter = await startStarter(["--idle", "1s", "--image", "sheep-pen:test", "--cell-origin", "http://host.docker.internal:9876"], {
      PEN_IDLE: "10m",
    });
  });
  afterAll(async () => {
    await stopStarter(starter);
  });

  it("ensure runs the image detached, removed on exit, named for the session, with the address, the token, no health port, and the env", async () => {
    const answer = await post(starter.url, "ensure", {
      session: "0199-abc",
      cellUrl: "http://127.0.0.1:9876/s/0199-abc/pen",
      token: "minted-1",
      env: { GIT_AUTHOR_NAME: "Pen Home", GIT_AUTHOR_EMAIL: "pen@example.invalid", PEN_TOKEN: "never", "bad name": "x" },
    });
    expect(answer).toEqual({ status: 200, json: { started: true } });
    const seen = await calls(starter.stub);
    expect(seen[0]).toEqual(["inspect", "--format", "{{.State.Running}}", "pen-0199-abc"]);
    expect(seen[1]).toEqual([
      "run",
      "-d",
      "--rm",
      "--name",
      "pen-0199-abc",
      "-e",
      // --cell-origin replaced the origin and kept the path.
      "PEN_CELL_URL=http://host.docker.internal:9876/s/0199-abc/pen",
      "-e",
      "PEN_TOKEN=minted-1",
      "-e",
      "PEN_HEALTH_PORT=0",
      "-e",
      "GIT_AUTHOR_NAME=Pen Home",
      "-e",
      "GIT_AUTHOR_EMAIL=pen@example.invalid",
      "sheep-pen:test",
    ]);
    expect(seen.length).toBe(2);
  });

  it("a second ensure while the container runs starts nothing and renews; renew says running; a renewal keeps the idle stop away", async () => {
    const again = await post(starter.url, "ensure", { session: "0199-abc", cellUrl: "http://127.0.0.1:9876/s/0199-abc/pen", token: "minted-2" });
    expect(again).toEqual({ status: 200, json: { started: false } });
    expect((await calls(starter.stub)).filter((call) => call[0] === "run").length).toBe(1);
    // Renew twice across the idle period: the stop never comes while the clock is renewed.
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const renew = await post(starter.url, "renew", { session: "0199-abc" });
      expect(renew).toEqual({ status: 200, json: { running: true } });
    }
    expect((await calls(starter.stub)).some((call) => call[0] === "stop")).toBe(false);
  });

  it("the idle stop: after --idle with no renewal, docker stop; then renew says not running and ensure starts anew", async () => {
    await until(async () => (await calls(starter.stub)).some((call) => call[0] === "stop"), 3_000);
    expect((await calls(starter.stub)).filter((call) => call[0] === "stop")).toEqual([["stop", "pen-0199-abc"]]);
    expect(starter.lines.some((line) => line.includes("0199-abc: idle for 1s; stopping the container"))).toBe(true);
    expect(await post(starter.url, "renew", { session: "0199-abc" })).toEqual({ status: 200, json: { running: false } });
    const restarted = await post(starter.url, "ensure", { session: "0199-abc", cellUrl: "http://127.0.0.1:9876/s/0199-abc/pen", token: "minted-3" });
    expect(restarted).toEqual({ status: 200, json: { started: true } });
    const runs = (await calls(starter.stub)).filter((call) => call[0] === "run");
    expect(runs.length).toBe(2);
    expect(runs[1]).toContain("PEN_TOKEN=minted-3");
  });

  it("destroy is docker kill; a destroy of nothing is still 200; a kill by the shepherd is seen as not running", async () => {
    expect(await post(starter.url, "destroy", { session: "0199-abc" })).toEqual({ status: 200, json: {} });
    expect((await calls(starter.stub)).filter((call) => call[0] === "kill")).toEqual([["kill", "pen-0199-abc"]]);
    expect(await post(starter.url, "destroy", { session: "0199-abc" })).toEqual({ status: 200, json: {} });
    expect(await post(starter.url, "renew", { session: "0199-abc" })).toEqual({ status: 200, json: { running: false } });
    // The shepherd's hand: the mark removed behind the starter's back, as `docker kill` from a terminal would.
    await post(starter.url, "ensure", { session: "0199-abc", cellUrl: "http://127.0.0.1:9876/s/0199-abc/pen", token: "minted-4" });
    await rm(join(starter.stub, "running-pen-0199-abc"));
    expect(await post(starter.url, "renew", { session: "0199-abc" })).toEqual({ status: 200, json: { running: false } });
  });

  it("a refused start is 500 with Docker's words; without --cell-origin the container dials the cell's URL as is; a bad body is 400", async () => {
    const other = await startStarter(["--image", "missing:image"]);
    try {
      const failed = await post(other.url, "ensure", { session: "0199-xyz", cellUrl: "http://127.0.0.1:9876/s/0199-xyz/pen", token: "minted-6" });
      expect(failed.status).toBe(500);
      expect(failed.json.error).toBe("docker run failed: Unable to find image 'missing:image' locally");
      expect((await calls(other.stub)).find((call) => call[0] === "run")).toContain("PEN_CELL_URL=http://127.0.0.1:9876/s/0199-xyz/pen");
      expect((await post(other.url, "ensure", { session: "../etc", cellUrl: "http://x/", token: "t" })).status).toBe(400);
      expect((await post(other.url, "ensure", { session: "ok", cellUrl: "not a url", token: "t" })).status).toBe(400);
      expect((await post(other.url, "ensure", { session: "ok", cellUrl: "http://x/", token: "" })).status).toBe(400);
      expect((await post(other.url, "start", { session: "ok" })).status).toBe(404);
      expect((await fetch(`${other.url}/renew`)).status).toBe(405);
      // Nothing but the one refused run reached Docker.
      expect((await calls(other.stub)).filter((call) => call[0] === "run").length).toBe(1);
    } finally {
      await stopStarter(other);
    }
  });
});
