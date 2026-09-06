/**
 * pasture phase 4: setup, in workerd through the fake container. A
 * pastured cell whose tree has `setup.sh` runs it once per fresh
 * container, after the sync-in and before that container's first command,
 * and not again on the next command of the same container; a container
 * gone and rented anew runs it again. The pasture's secrets, all but
 * `GIT_TOKEN`, are in setup's `run` frame and in no other frame. A setup
 * that exits 0 leaves nothing in the tool result; one that fails is the
 * first line and its output, and the command does not run. The birth runs
 * it after the clone in the same container and says so in its entry. A
 * pasture without the script changes nothing about the container path.
 */
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BIRTH_ENTRY, type BirthData, birthCommand, birthText, setupSentence } from "../src/birth.ts";
import type { SessionCell } from "../src/cell.ts";
import { SETUP_COMMAND, SETUP_PATH, setupFailedAfterLine, setupFailedLine } from "../src/env/execution-env.ts";
import { PASTURE_GIT_TOKEN } from "../src/pen/broker.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { WORKSPACE_ROOT } from "../src/workspace/files.ts";
import { type FakeContainer, type ScriptFor, serveFakeOn, type TranscriptEntry } from "./fake-container.ts";

const context = BACKGROUND_CONTEXT;
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
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
const REPO = "https://github.com/org/repo";
const NPM_TOKEN = "npm-token-7c1e4d9a2b5f4083-never-in-a-frame-but-one";
const GIT_TOKEN = "git-token-3a9f1b7e5c2d4061-never-in-any-run";
const SETUP_SCRIPT = "#!/bin/sh\nset -e\npnpm install --frozen-lockfile\n";
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function pasture(name: string, meta: { repo?: string; branch?: string } = {}): Promise<void> {
  expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name, ...meta }) })).status).toBe(201);
}

interface Stub {
  starter: ContainerStarter;
  fakes: Array<Omit<FakeContainer, "socket">>;
  ensures: number;
}

/** The container's half without a container, as `birth.test.ts` has it: dial the real door on `ensure`, serve the fake on what comes back. */
function stubStarter(sessionId: string, script: ScriptFor): Stub {
  const directory = () => env.DIRECTORY.getByName("home");
  const stub: Stub = {
    fakes: [],
    ensures: 0,
    starter: {
      async ensure(args) {
        stub.ensures++;
        void (async () => {
          await sleep(10);
          const response = await SELF.fetch(`${args.cellUrl}?token=${encodeURIComponent(args.token)}`, { headers: { upgrade: "websocket" } });
          if (response.status !== 101) return;
          const socket = response.webSocket!;
          socket.accept();
          const fake = serveFakeOn(socket, { script });
          stub.fakes.push(fake);
          await directory().containerOpened(sessionId, Date.now());
          void fake.closed.then(() => directory().containerClosed(sessionId, Date.now()));
        })();
        return { started: true };
      },
      async renew() {
        return { running: stub.fakes.length > 0 };
      },
      async destroy() {
        stub.fakes.at(-1)?.stop("destroyed");
      },
    },
  };
  return stub;
}

async function sessionIn(name: string, pastureName: string, script: ScriptFor): Promise<{ id: string; stub: Stub }> {
  const { id } = await env.DIRECTORY.getByName("home").create(name, pastureName);
  const stub = stubStarter(id, script);
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.starter = stub.starter;
  });
  return { id, stub };
}

function inCell<T>(id: string, body: (cell: SessionCell) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => body(cell));
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

async function bash(cell: SessionCell, command: string): Promise<string> {
  const runtime = await cell.runtime();
  return text(await bashTool.execute("call", { command }, () => {}, { env: runtime.env }, invocation, context));
}

/** The frames of every fake so far, in order. */
function frames(stub: Stub): Array<Extract<TranscriptEntry, { frame: unknown }>> {
  return stub.fakes.flatMap((fake) => fake.transcript).filter((entry): entry is Extract<TranscriptEntry, { frame: unknown }> => "frame" in entry);
}

/** Every run every fake was handed, in order: `[command, env]`. */
function runs(stub: Stub): Array<{ command: string; cwd: string; env: Record<string, string> }> {
  return stub.fakes.flatMap((fake) => fake.runs);
}

async function births(id: string): Promise<BirthData[]> {
  const view = (await (await api(`/s/${id}/transcript`)).json()) as { entries: Array<{ type: string; customType?: string; data?: unknown }> };
  return view.entries.filter((entry) => entry.type === "custom" && entry.customType === BIRTH_ENTRY).map((entry) => entry.data as BirthData);
}

/** The clone, setup, and `pnpm test` as the fake plays them; `setupExit` is read at each setup run, so a test can break and mend the script. */
function repoScript(setup: { exit: number }): ScriptFor {
  return (request) => {
    const command = request.command.trim();
    if (command === birthCommand(REPO, "main")) {
      return {
        steps: [
          { stderr: "Cloning into '.'...\n" },
          {
            act: (disk) => {
              disk.putFile("package.json", '{"name":"fixture","scripts":{"test":"node test.js"}}\n');
              disk.putFile("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
              disk.putFile(".git/HEAD", "ref: refs/heads/main\n");
            },
          },
        ],
        exit: 0,
      };
    }
    if (command === SETUP_COMMAND) {
      if (setup.exit !== 0) return { steps: [{ stderr: "ERR_PNPM_NO_LOCKFILE  Cannot install with \"frozen-lockfile\"\n" }], exit: setup.exit };
      return {
        steps: [
          { stdout: `Lockfile is up to date, resolution step is skipped\ntoken length ${(request.env.NPM_TOKEN ?? "").length}\n` },
          // What setup writes stays on the container's disk: `node_modules` is the cache rule's, out of the rows.
          { act: (disk) => disk.putFile("node_modules/.modules.yaml", "hoistPattern:\n  - '*'\n") },
        ],
        exit: 0,
      };
    }
    if (command === "pnpm test") return { steps: [{ stdout: "1 passed\n" }], exit: 0 };
    // `env` alone is a text tool and runs in the cell's shell; beside `node` the whole line runs in the container.
    if (command === "node -e 0 && env") {
      return { steps: [{ stdout: `${Object.entries(request.env).map(([key, value]) => `${key}=${value}`).join("\n")}\n` }], exit: 0 };
    }
    return undefined;
  };
}

describe("pasture phase 4: setup", () => {
  it("journey 3 steps 3 to 5: setup runs after the clone in the birth's container, not on the next command of that container, again on a fresh one; the secrets are in setup's run frame and no other; a success leaves nothing in the tool result", { timeout: 30_000 }, async () => {
    await pasture("warm", { repo: REPO, branch: "main" });
    const object = env.PASTURE.getByName("warm");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    await object.setSecret("NPM_TOKEN", NPM_TOKEN);
    await object.setSecret(PASTURE_GIT_TOKEN, GIT_TOKEN);
    // The object's `secrets()` is setup's environment: every secret but `GIT_TOKEN`.
    expect(await object.secrets()).toEqual({ NPM_TOKEN });
    const { id, stub } = await sessionIn("tests", "warm", repoScript({ exit: 0 }));

    // Step 3: the birth cloned, then ran setup in the same container, with NPM_TOKEN in setup's environment and not the clone's.
    const [birth] = await births(id);
    expect(birth).toMatchObject({ pasture: "warm", exit: 0, output: "Cloning into '.'...\n", truncated: false, setup: { exit: 0 } });
    expect(birthText(birth!)).toContain(`exited 0, so ${WORKSPACE_ROOT} is a clone of ${REPO} on branch main. ${setupSentence({ exit: 0 })}`);
    expect(birthText(birth!)).not.toContain("token length");
    expect(runs(stub).map((run) => run.command)).toEqual([birthCommand(REPO, "main"), SETUP_COMMAND]);
    const [clone, setup] = runs(stub);
    expect(setup).toMatchObject({ command: SETUP_COMMAND, cwd: WORKSPACE_ROOT, env: { NPM_TOKEN, PWD: WORKSPACE_ROOT, SHEEP: "1" } });
    expect(setup!.env).not.toHaveProperty(PASTURE_GIT_TOKEN);
    expect(clone!.env).not.toHaveProperty("NPM_TOKEN");
    expect(stub.ensures).toBe(1);
    // The setup's write stayed on the container's disk, under the cache rule; the clone is rows.
    await inCell(id, async (cell) => {
      const paths = (await cell.runtime()).env.files.manifest().map((entry) => entry.path);
      expect(paths).toContain("pnpm-lock.yaml");
      expect(paths.some((path) => path.startsWith("node_modules"))).toBe(false);
    });

    await inCell(id, async (cell) => {
      // The sheep's `pnpm test` on the same container: no setup before it, and nothing of setup in the tool result.
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      expect(runs(stub).map((run) => run.command)).toEqual([birthCommand(REPO, "main"), SETUP_COMMAND, "pnpm test"]);
      expect(runs(stub)[2]!.env).not.toHaveProperty("NPM_TOKEN");
      // Step 4: `env` in the container shows no secret.
      const printed = await bash(cell, "node -e 0 && env");
      expect(printed).toContain("SHEEP=1");
      expect(printed).not.toContain(NPM_TOKEN);
      expect(printed).not.toContain(GIT_TOKEN);
      expect(printed).not.toContain("NPM_TOKEN");
      expect(runs(stub).filter((run) => run.command === SETUP_COMMAND).length).toBe(1);
      expect(stub.ensures).toBe(1);

      // Step 5: the container goes away past its idle period; the next command rents a fresh one, and setup runs again before it.
      (await cell.runtime()).lease!.idle();
      stub.fakes.at(-1)!.stop("idle");
      await sleep(50);
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      expect(stub.ensures).toBe(2);
      expect(stub.fakes.length).toBe(2);
      expect(stub.fakes[1]!.runs.map((run) => run.command)).toEqual([SETUP_COMMAND, "pnpm test"]);
      expect(stub.fakes[1]!.runs[0]!.env).toMatchObject({ NPM_TOKEN });
      expect(stub.fakes[1]!.runs[1]!.env).not.toHaveProperty("NPM_TOKEN");
      // And not again on that container's next command.
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      expect(runs(stub).filter((run) => run.command === SETUP_COMMAND).length).toBe(2);
      expect(runs(stub).length).toBe(7);

      // The secrets: NPM_TOKEN is in the two setup frames and in no other frame either way; GIT_TOKEN is in none.
      const all = stub.fakes.flatMap((fake) => fake.transcript);
      const carrying = all.filter((entry) => "frame" in entry && JSON.stringify(entry.frame).includes(NPM_TOKEN));
      expect(carrying.length).toBe(2);
      for (const entry of carrying) expect(entry).toMatchObject({ from: "cell", frame: { type: "run", command: SETUP_COMMAND } });
      expect(all.some((entry) => "frame" in entry && JSON.stringify(entry.frame).includes(GIT_TOKEN))).toBe(false);
      // Not in the transcript, and not in the rows.
      expect(JSON.stringify(await (await api(`/s/${id}/transcript`)).json())).not.toContain(NPM_TOKEN);
      const dump = (await (await api(`/s/${id}/export`)).json()) as Record<string, unknown[]>;
      for (const [table, rows] of Object.entries(dump)) expect(JSON.stringify(rows), table).not.toContain(NPM_TOKEN);
      (await cell.runtime()).lease!.idle();
    });
  });

  it("journey 3 step 6: a failing setup is the first line and its output, the command does not run, and a mended script runs on the next command of the same container", { timeout: 30_000 }, async () => {
    expect(setupFailedLine(1)).toBe("setup.sh failed (exit 1); the command did not run:");
    expect(setupFailedAfterLine(2)).toBe("setup.sh failed (exit 2) after the clone:");
    // No repository: no birth, so the first container command is a tool's, and setup runs before it.
    await pasture("cold");
    const object = env.PASTURE.getByName("cold");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    await object.setSecret("NPM_TOKEN", NPM_TOKEN);
    const setup = { exit: 1 };
    const { id, stub } = await sessionIn("cold-tests", "cold", repoScript(setup));

    await inCell(id, async (cell) => {
      // pi's bash tool throws on a non-zero exit, the output first: the model reads the first line, then setup's output.
      const result = await bash(cell, "pnpm test").then(
        () => {
          throw new Error("the command ran");
        },
        (error: Error) => error.message,
      );
      expect(result.startsWith(`${setupFailedLine(1)}\nERR_PNPM_NO_LOCKFILE  Cannot install with "frozen-lockfile"`)).toBe(true);
      expect(result).toContain("Command exited with code 1");
      expect(result).not.toContain("1 passed");
      expect(result).not.toContain(NPM_TOKEN);
      expect(runs(stub).map((run) => run.command)).toEqual([SETUP_COMMAND]);
      // The exit code the tool saw is setup's.
      const exec = await (await cell.runtime()).env.exec("pnpm test", undefined, context);
      expect(exec.ok && exec.value.exitCode).toBe(1);
      expect(runs(stub).map((run) => run.command)).toEqual([SETUP_COMMAND, SETUP_COMMAND]);
      expect(stub.ensures).toBe(1);

      // Mended: the next command of the same container runs setup again, since it never succeeded here, then the command.
      setup.exit = 0;
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      expect(runs(stub).map((run) => run.command)).toEqual([SETUP_COMMAND, SETUP_COMMAND, SETUP_COMMAND, "pnpm test"]);
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      expect(runs(stub).length).toBe(5);
      (await cell.runtime()).lease!.idle();
    });
  });

  it("a failing setup after the clone is said in the birth's entry with its output, and the sheep is alive", { timeout: 30_000 }, async () => {
    await pasture("stumbled", { repo: REPO });
    const object = env.PASTURE.getByName("stumbled");
    await object.put(SETUP_PATH, encode(SETUP_SCRIPT));
    const { id, stub } = await sessionIn("stumbler", "stumbled", repoScript({ exit: 2 }));
    const [birth] = await births(id);
    expect(birth).toMatchObject({ exit: 0, setup: { exit: 2 }, truncated: false });
    expect(birth!.output).toBe(`Cloning into '.'...\n${setupFailedAfterLine(2)}\nERR_PNPM_NO_LOCKFILE  Cannot install with "frozen-lockfile"\n`);
    expect(birthText(birth!)).toContain(setupSentence({ exit: 2 }));
    expect(birthText(birth!)).toContain("exited 2, so the checkout is not warmed up");
    expect(runs(stub).map((run) => run.command)).toEqual([birthCommand(REPO, "main"), SETUP_COMMAND]);
    await inCell(id, async (cell) => {
      // The clone is rows either way.
      expect((await cell.runtime()).env.files.manifest().map((entry) => entry.path)).toContain("pnpm-lock.yaml");
      (await cell.runtime()).lease!.idle();
    });
  });

  it("a pasture without setup.sh, and a birth whose clone failed: no setup run, and the container path as pasture phase 3 left it", { timeout: 30_000 }, async () => {
    await pasture("plain");
    await env.PASTURE.getByName("plain").put("BRIEF.md", encode("Be brief.\n"));
    await env.PASTURE.getByName("plain").setSecret("NPM_TOKEN", NPM_TOKEN);
    const { id, stub } = await sessionIn("plain-tests", "plain", repoScript({ exit: 0 }));
    await inCell(id, async (cell) => {
      expect(await bash(cell, "pnpm test")).toBe("1 passed\n");
      expect(runs(stub).map((run) => run.command)).toEqual(["pnpm test"]);
      expect(runs(stub)[0]!.env).not.toHaveProperty("NPM_TOKEN");
      expect(frames(stub).some((entry) => JSON.stringify(entry.frame).includes(NPM_TOKEN))).toBe(false);
      (await cell.runtime()).lease!.idle();
    });
    // A clone that fails has no setup after it, and the entry has no `setup`.
    await pasture("stillborn-setup", { repo: "https://github.com/org/missing" });
    await env.PASTURE.getByName("stillborn-setup").put(SETUP_PATH, encode(SETUP_SCRIPT));
    const failing = await sessionIn("lost", "stillborn-setup", (request) =>
      request.command.trim() === birthCommand("https://github.com/org/missing", "main") ? { steps: [{ stderr: "fatal: repository not found\n" }], exit: 128 } : undefined,
    );
    const [birth] = await births(failing.id);
    expect(birth).toMatchObject({ exit: 128 });
    expect(birth!.setup).toBeUndefined();
    expect(runs(failing.stub).map((run) => run.command)).toEqual([birthCommand("https://github.com/org/missing", "main")]);
    await inCell(failing.id, async (cell) => (await cell.runtime()).lease!.idle());
  });
});
