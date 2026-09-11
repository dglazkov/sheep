/**
 * pen phase 4: the broker, in workerd, through the fake and the lease.
 * The cell rents the fake through the real door, so the real `admit`
 * attaches the real broker to the real socket; the fake's `askCredential`
 * is the helper's socket without a process. The broker answers each
 * request from the home's secret, stores nothing, and refuses another
 * host by name. Then journey 2's frames through pi's real bash tool and
 * a faux turn: a scripted `git push` asks mid-run, the tool result the
 * model sees is git's output, and the token is in no frame but the one
 * answer, no row, no transcript entry, and no table of the export. And
 * `.git` is rows: a clone survives the fake's death and a new fake gets
 * it back on sync-in.
 *
 * Earmark phase 0: the sheep in front. A pastured sheep's minter asks the
 * sheep, then the pasture, then the home; a pastureless one's the sheep,
 * then the home; the log line says which, and the refusal names every
 * place it looked. Through the cell: the birth's clone is handed the
 * sheep's own token, a sibling the home's and then the pasture's, and a
 * sheep in no pasture its own over the home's, each value in the one
 * answer frame and nowhere else.
 */
import { BACKGROUND_CONTEXT, createBashTool, getOrThrow } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { birthCommand } from "../src/birth.ts";
import type { SessionCell } from "../src/cell.ts";
import type { SessionSummary } from "../src/directory.ts";
import { SETUP_COMMAND, SETUP_PATH } from "../src/env/execution-env.ts";
import type { FauxProgram } from "../src/models.ts";
import { CREDENTIAL_TTL_MS, CredentialBroker, DEFAULT_GIT_HOST, GIT_USERNAME, homeMinter, hostOf, PASTURE_GIT_TOKEN, pastureMinter, sheepMinter } from "../src/pen/broker.ts";
import { authorEnv, DEFAULT_AUTHOR } from "../src/pen/container.ts";
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
const TOKEN = env.PEN_GIT_TOKEN!;
const REPO = "https://github.com/org/repo";
const latin1 = new TextDecoder("latin1");

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await sleep(20);
  }
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

/** The container's half without a container, as `lease.test.ts` does it: dial the real door on `ensure`, serve the fake on what comes back. */
interface Stub {
  starter: ContainerStarter;
  fakes: Array<Omit<FakeContainer, "socket">>;
  ensures: number;
}

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

async function sessionWith(name: string, script: ScriptFor): Promise<{ id: string; stub: Stub }> {
  const { id } = await env.DIRECTORY.getByName("home").create(name);
  const stub = stubStarter(id, script);
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.starter = stub.starter;
  });
  return { id, stub };
}

function inCell<T>(id: string, body: (cell: SessionCell) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => body(cell));
}

async function bash(cell: SessionCell, command: string) {
  const runtime = await cell.runtime();
  const result = await bashTool.execute("call", { command }, () => {}, { env: runtime.env }, invocation, context);
  return { result, text: text(result) };
}

/** The frames of every fake so far, in order. */
function frames(stub: Stub): Array<Extract<TranscriptEntry, { frame: unknown }>> {
  return stub.fakes.flatMap((fake) => fake.transcript).filter((entry): entry is Extract<TranscriptEntry, { frame: unknown }> => "frame" in entry);
}

/**
 * Journey 2's git, scripted for the fake: a clone puts a checkout with its
 * `.git` on the disk; a push asks the helper mid-run, as real git does when
 * the server answers 401, and prints what git prints; a status reads the
 * disk the rows synced in.
 */
function gitScript(stub: Stub, asked: Array<{ scope: string; answer: unknown }>): ScriptFor {
  return (request) => {
    const command = request.command.trim();
    if (command === `git clone ${REPO} repo`) {
      return {
        steps: [
          { stderr: "Cloning into 'repo'...\n" },
          {
            act: (disk) => {
              disk.putFile("repo/README.md", "# Fixture\n\nThis repositry has a typo.\n");
              disk.putFile("repo/.git/HEAD", "ref: refs/heads/main\n");
              disk.putFile("repo/.git/config", `[remote "origin"]\n\turl = ${REPO}\n`);
              disk.putFile("repo/.git/refs/heads/main", "0123456789abcdef0123456789abcdef01234567\n");
              disk.putFile("repo/.git/objects/pack/pack-1.pack", new Uint8Array(4096).fill(7), 0o444);
            },
          },
        ],
        exit: 0,
      };
    }
    if (command === "git push -u origin fix-typo") {
      return {
        steps: [
          { stderr: "Enumerating objects: 5, done.\n" },
          {
            act: async () => {
              // What the helper does when git asks: the request goes up the socket, and the answer comes back to git alone.
              const fake = stub.fakes.at(-1)!;
              asked.push({ scope: REPO, answer: await fake.askCredential({ kind: "git", scope: "https://github.com" }) });
            },
          },
          { stderr: `To ${REPO}\n * [new branch]      fix-typo -> fix-typo\n`, act: (disk) => disk.putFile("repo/.git/refs/remotes/origin/fix-typo", "89abcdef0123456789abcdef0123456789abcdef\n") },
          { stdout: "branch 'fix-typo' set up to track 'origin/fix-typo'.\n" },
        ],
        exit: 0,
      };
    }
    if (command === "git status") {
      return { steps: [{ stdout: "On branch fix-typo\nnothing to commit, working tree clean\n" }], exit: 0 };
    }
    return undefined;
  };
}

describe("the home as a minter", () => {
  it("hands its token over for its host with a minute's expiry, and refuses every other host, kind, and scope by name", () => {
    const now = 1_700_000_000_000;
    const mint = homeMinter({ gitToken: "tok" }, () => now);
    expect(mint({ kind: "git", scope: "https://github.com/org/repo" })).toEqual({ answer: { username: GIT_USERNAME, value: "tok", expires: now + CREDENTIAL_TTL_MS } });
    expect(mint({ kind: "git", scope: "https://GitHub.com" })).toMatchObject({ answer: { value: "tok" } });
    expect(mint({ kind: "git", scope: "https://gitlab.com/org/repo" })).toEqual({ refused: `the home has no credential for gitlab.com; its token is for ${DEFAULT_GIT_HOST}` });
    expect(mint({ kind: "git", scope: "https://evil.github.com.example" })).toMatchObject({ refused: expect.stringContaining("evil.github.com.example") });
    expect(mint({ kind: "git", scope: "not a url" })).toEqual({ refused: "the scope not a url is not a URL" });
    expect(mint({ kind: "ssh" as "git", scope: "ssh://github.com" })).toEqual({ refused: "the home mints no ssh credential" });
    // No token: refused, naming the host and the variable, never a value.
    expect(homeMinter({})({ kind: "git", scope: "https://github.com/x" })).toEqual({ refused: "the home has no PEN_GIT_TOKEN, so nothing can be minted for github.com" });
    expect(homeMinter({ gitToken: "" })({ kind: "git", scope: "https://github.com/x" })).toMatchObject({ refused: expect.stringContaining("PEN_GIT_TOKEN") });
    // A host with a port, as the Node fixture is, and PEN_GIT_HOST in any case.
    const fixture = homeMinter({ gitToken: "tok", gitHost: "127.0.0.1:4180" }, () => now);
    expect(fixture({ kind: "git", scope: "http://127.0.0.1:4180" })).toMatchObject({ answer: { value: "tok" } });
    expect(fixture({ kind: "git", scope: "http://127.0.0.1:4181" })).toMatchObject({ refused: expect.stringContaining("127.0.0.1:4181") });
    expect(homeMinter({ gitToken: "tok", gitHost: "Git.Example.COM " })({ kind: "git", scope: "https://git.example.com/r" })).toMatchObject({ answer: { value: "tok" } });
    expect(hostOf("https://github.com/org/repo")).toBe("github.com");
    expect(hostOf("nonsense")).toBe("nonsense");
  });

  it("the author is the home's configuration, or a name that is plainly nobody's", () => {
    expect(authorEnv({})).toEqual({
      GIT_AUTHOR_NAME: DEFAULT_AUTHOR.name,
      GIT_AUTHOR_EMAIL: DEFAULT_AUTHOR.email,
      GIT_COMMITTER_NAME: DEFAULT_AUTHOR.name,
      GIT_COMMITTER_EMAIL: DEFAULT_AUTHOR.email,
    });
    expect(authorEnv({ PEN_GIT_AUTHOR_NAME: " ", PEN_GIT_AUTHOR_EMAIL: "" })).toEqual(authorEnv({}));
    expect(authorEnv(env)).toEqual({ GIT_AUTHOR_NAME: "Pen Home", GIT_AUTHOR_EMAIL: "pen@example.invalid", GIT_COMMITTER_NAME: "Pen Home", GIT_COMMITTER_EMAIL: "pen@example.invalid" });
    // The token is not among what the container is started with.
    expect(JSON.stringify(authorEnv(env))).not.toContain(TOKEN);
  });

  it("the broker logs the id and the host and never the value, and a frame that is not its own passes by", async () => {
    const lines: string[] = [];
    const pair = new WebSocketPair();
    const [cellEnd, containerEnd] = [pair[0], pair[1]];
    cellEnd.accept();
    containerEnd.accept();
    const received: string[] = [];
    containerEnd.addEventListener("message", (event) => {
      received.push(String(event.data));
    });
    new CredentialBroker(homeMinter({ gitToken: "tok-9f3a" }, () => 5_000), (line) => lines.push(line)).attach(cellEnd);
    containerEnd.send(JSON.stringify({ type: "pong", id: "x" }));
    containerEnd.send(JSON.stringify({ type: "credential", id: "cred-1", kind: "git", scope: "https://github.com/org/repo" }));
    containerEnd.send(JSON.stringify({ type: "credential", id: "cred-2", kind: "git", scope: "https://gitlab.com/org/repo" }));
    await until(() => received.length === 2);
    expect(JSON.parse(received[0]!)).toEqual({ type: "credential", id: "cred-1", username: GIT_USERNAME, value: "tok-9f3a", expires: 5_000 + CREDENTIAL_TTL_MS });
    expect(JSON.parse(received[1]!)).toEqual({ type: "error", code: "refused", of: "credential", id: "cred-2", message: `the home has no credential for gitlab.com; its token is for ${DEFAULT_GIT_HOST}` });
    expect(lines).toEqual(["credential cred-1 for github.com handed over, good for 60 s", `credential cred-2 for gitlab.com refused: the home has no credential for gitlab.com; its token is for ${DEFAULT_GIT_HOST}`]);
    for (const line of lines) expect(line).not.toContain("tok-9f3a");
  });
});

describe("pen journey 2 against the fake, through the lease and the door", () => {
  it("the broker answers each request from the home and stores nothing; the token is in no frame but the answer, no row, no tool result, no transcript entry, no export table; and .git survives the container", { timeout: 30_000 }, async () => {
    const asked: Array<{ scope: string; answer: unknown }> = [];
    const stubRef: { stub?: Stub } = {};
    const { id, stub } = await sessionWith("j2", (request) => gitScript(stubRef.stub!, asked)(request));
    stubRef.stub = stub;

    // Steps 1 and 3 as a faux turn through the home's HTTP face, so the transcript and the export are the real ones.
    const program: FauxProgram = {
      steps: [
        { tool: { name: "bash", args: { command: `git clone ${REPO} repo` } } },
        { tool: { name: "bash", args: { command: "git push -u origin fix-typo" } } },
        { text: "pushed fix-typo" },
      ],
    };
    expect((await api(`/s/${id}/faux`, { method: "POST", body: JSON.stringify(program) })).status).toBe(200);
    const accepted = (await (await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: "Clone the repository, then commit and push." }) })).json()) as { operationId?: string };
    expect(typeof accepted.operationId).toBe("string");
    await inCell(id, (cell) => cell.waitForIdle(20_000));

    // The helper asked once, and got the home's token with a minute's expiry.
    expect(asked.length).toBe(1);
    expect(asked[0]!.answer).toEqual({ username: GIT_USERNAME, value: TOKEN, expires: expect.any(Number) });
    const expires = (asked[0]!.answer as { expires: number }).expires;
    expect(expires - Date.now()).toBeGreaterThan(CREDENTIAL_TTL_MS - 5_000);
    expect(expires - Date.now()).toBeLessThanOrEqual(CREDENTIAL_TTL_MS);

    // The tool result the model saw is git's output and nothing else.
    const view = (await (await api(`/s/${id}/transcript`)).json()) as {
      entries: Array<{ type: string; message?: { role: string; content: Array<{ type: string; text?: string; content?: Array<{ type: string; text?: string }> }> } }>;
    };
    const toolResults = view.entries.filter((entry) => entry.type === "message" && entry.message?.role === "toolResult").map((entry) => JSON.stringify(entry.message!.content));
    expect(toolResults.length).toBe(2);
    expect(toolResults[0]).toContain("Cloning into 'repo'...");
    expect(toolResults[1]).toContain("[new branch]");
    expect(toolResults[1]).toContain("set up to track");
    for (const result of toolResults) expect(result).not.toContain(TOKEN);
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(view.entries.at(-1)!.message!.content[0]!.text).toBe("pushed fix-typo");

    // Every table of the export.
    const dump = (await (await api(`/s/${id}/export`)).json()) as Record<string, unknown[]>;
    expect(Object.keys(dump).sort()).toEqual(["branch_entries", "branch_meta", "entries", "list_values", "scalar_values", "sessions", "usage_ledger"]);
    expect(dump.entries!.length).toBeGreaterThan(3);
    for (const [table, rows] of Object.entries(dump)) expect(JSON.stringify(rows), table).not.toContain(TOKEN);

    // Every row of the workspace, `.git` among them.
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      const manifest = runtime.env.files.manifest();
      const paths = manifest.map((entry) => entry.path);
      expect(paths).toContain("repo/README.md");
      expect(paths).toContain("repo/.git/HEAD");
      expect(paths).toContain("repo/.git/objects/pack/pack-1.pack");
      expect(paths).toContain("repo/.git/refs/remotes/origin/fix-typo");
      for (const entry of manifest) {
        if (entry.kind === "directory") continue;
        const bytes = entry.kind === "symlink" ? new TextEncoder().encode(runtime.env.files.readlink(`${WORKSPACE_ROOT}/${entry.path}`)) : runtime.env.files.readFile(`${WORKSPACE_ROOT}/${entry.path}`);
        expect(latin1.decode(bytes), entry.path).not.toContain(TOKEN);
      }
      expect(runtime.env.files.get(`${WORKSPACE_ROOT}/repo/.git/objects/pack/pack-1.pack`)!.mode).toBe(0o444);
    });

    // Every frame both ways but the cell's one answer, and every blob.
    await sleep(25);
    const all = stub.fakes.flatMap((fake) => fake.transcript);
    const answers = all.filter((entry) => "frame" in entry && entry.from === "cell" && entry.frame.type === "credential");
    expect(answers.length).toBe(1);
    expect(answers[0]).toMatchObject({ frame: { id: "cred-1", value: TOKEN } });
    const requests = all.filter((entry) => "frame" in entry && entry.from === "container" && entry.frame.type === "credential");
    expect(requests).toEqual([{ from: "container", frame: { type: "credential", id: "cred-1", kind: "git", scope: "https://github.com" } }]);
    let checked = 0;
    for (const entry of all) {
      if (entry === answers[0]) continue;
      checked++;
      if ("frame" in entry) expect(JSON.stringify(entry.frame)).not.toContain(TOKEN);
    }
    expect(checked).toBeGreaterThan(10);
    // The credential frames are inside the run, and are not stdout or stderr.
    const sequence = frames(stub).map((entry) => `${entry.from}:${entry.frame.type}`);
    const push = sequence.lastIndexOf("cell:run");
    const exit = sequence.indexOf("container:exit", push);
    expect(sequence.slice(push, exit)).toContain("container:credential");
    expect(sequence.slice(push, exit)).toContain("cell:credential");
    expect(sequence.indexOf("cell:credential")).toBeGreaterThan(sequence.indexOf("container:credential"));
    console.info(`pen phase 4: ${checked} frames and blobs both ways in the fake's transcript, one credential answer, the token in none of the rest`);

    // A second request is brokered again, never served from anything kept; another host is refused by name; the error names no token.
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      await runtime.lease!.rent();
      const fake = stub.fakes.at(-1)!;
      const again = await fake.askCredential({ kind: "git", scope: `${REPO}.git` });
      expect(again).toEqual({ username: GIT_USERNAME, value: TOKEN, expires: expect.any(Number) });
      const refused = await fake.askCredential({ kind: "git", scope: "https://gitlab.com/org/repo" });
      expect(refused).toBeUndefined();
      await sleep(25);
      const errors = frames(stub).filter((entry) => entry.from === "cell" && entry.frame.type === "error");
      expect(errors).toEqual([
        { from: "cell", frame: { type: "error", code: "refused", of: "credential", id: "cred-3", message: `the home has no credential for gitlab.com; its token is for ${DEFAULT_GIT_HOST}` } },
      ]);
      expect(frames(stub).filter((entry) => entry.from === "cell" && entry.frame.type === "credential").length).toBe(2);
      runtime.lease!.idle();
    });

    // The container dies. The next command rents anew, and the new fake gets `.git` back from the rows before git status runs on it.
    expect(stub.fakes.length).toBe(1);
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      stub.fakes[0]!.stop("stopped as idle");
      await until(() => runtime.lease!.socket === undefined);
      const status = await bash(cell, "git status");
      expect(status.text).toBe("On branch fix-typo\nnothing to commit, working tree clean\n");
      expect(stub.fakes.length).toBe(2);
      const disk = stub.fakes[1]!.disk;
      expect(disk.entries.has("repo/.git/HEAD")).toBe(true);
      expect(disk.entries.has("repo/.git/refs/remotes/origin/fix-typo")).toBe(true);
      expect(disk.entries.get("repo/.git/objects/pack/pack-1.pack")).toMatchObject({ kind: "file", mode: 0o444 });
      expect(new TextDecoder().decode((disk.entries.get("repo/README.md") as { bytes: Uint8Array }).bytes)).toContain("repositry");
      expect(getOrThrow(await runtime.env.readTextFile("repo/.git/HEAD", context))).toBe("ref: refs/heads/main\n");
      runtime.lease!.idle();
    });
  });

  it("a push through pi's bash tool asks mid-run and the model's result is git's words with no token; a refused host leaves git without a credential", async () => {
    const asked: Array<{ scope: string; answer: unknown }> = [];
    const stubRef: { stub?: Stub } = {};
    const { id, stub } = await sessionWith("push", (request) => {
      const base = gitScript(stubRef.stub!, asked)(request);
      if (base !== undefined) return base;
      if (request.command.trim() === "git push gitlab main") {
        return {
          steps: [
            {
              act: async () => {
                asked.push({ scope: "https://gitlab.com", answer: await stubRef.stub!.fakes.at(-1)!.askCredential({ kind: "git", scope: "https://gitlab.com" }) });
              },
            },
            { stderr: "fatal: could not read Username for 'https://gitlab.com': terminal prompts disabled\n" },
          ],
          exit: 128,
        };
      }
      return undefined;
    });
    stubRef.stub = stub;
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      getOrThrow(await runtime.env.writeFile("repo/.git/HEAD", "ref: refs/heads/fix-typo\n", context));
      const push = await bash(cell, "git push -u origin fix-typo");
      expect(push.text).toBe(`Enumerating objects: 5, done.\nTo ${REPO}\n * [new branch]      fix-typo -> fix-typo\nbranch 'fix-typo' set up to track 'origin/fix-typo'.\n`);
      expect(asked).toEqual([{ scope: REPO, answer: { username: GIT_USERNAME, value: TOKEN, expires: expect.any(Number) } }]);
      await expect(bash(cell, "git push gitlab main")).rejects.toThrow("fatal: could not read Username for 'https://gitlab.com': terminal prompts disabled\n\n\nCommand exited with code 128");
      expect(asked[1]).toEqual({ scope: "https://gitlab.com", answer: undefined });
      runtime.lease!.idle();
    });
  });
});

describe("earmark phase 0: the sheep as the broker's first source", () => {
  const SHEEP = "sheep-token-1a7e3c9f5b2d4086-its-own";
  const PASTURE = "pasture-token-8d2f6b1e4a9c4053-the-herds";
  const HOME = "home-token-3c9a5e7b1d2f4061-the-homes";
  const now = 1_700_000_000_000;
  const meta = { name: "docs", repo: "https://gitlab.example/org/repo", branch: "main", createdAt: 1 };
  /** A sheep's secrets as the Directory answers them, counting each ask so a test sees they are read at every request. */
  const sheep = (token: string | undefined) => {
    const source = {
      asked: 0,
      secrets: async (): Promise<Record<string, string>> => {
        source.asked++;
        return token === undefined ? { NPM_TOKEN: "not-the-credential" } : { [PASTURE_GIT_TOKEN]: token, NPM_TOKEN: "not-the-credential" };
      },
    };
    return source;
  };
  const pasture = (token: string | undefined, repo: string | null = meta.repo) => ({ meta: async () => ({ ...meta, repo }), secret: async (name: string) => (name === PASTURE_GIT_TOKEN ? token : undefined) });
  const handed = (value: string, from: string) => ({ answer: { username: GIT_USERNAME, value, expires: now + CREDENTIAL_TTL_MS }, from });
  const scope = "https://gitlab.example/org/repo";

  it("a pastured sheep's minter: its own GIT_TOKEN, then the pasture's, then the home's, each read at the request; the host is the repository's; the refusal names all three places and no value", async () => {
    const all = sheep(SHEEP);
    const mint = pastureMinter("docs", pasture(PASTURE), { gitToken: HOME }, () => now, all);
    expect(await mint({ kind: "git", scope })).toEqual(handed(SHEEP, "this sheep"));
    expect(await mint({ kind: "git", scope })).toEqual(handed(SHEEP, "this sheep"));
    expect(all.asked).toBe(2);
    // The host rule is unchanged: the repository's, so the sheep's token is not handed to another host.
    expect(await mint({ kind: "git", scope: "https://github.com/org/repo" })).toEqual({ refused: "the home has no credential for github.com; its token is for gitlab.example" });
    expect(await pastureMinter("docs", pasture(PASTURE), { gitToken: HOME }, () => now, sheep(undefined))({ kind: "git", scope })).toEqual(handed(PASTURE, "pasture docs"));
    expect(await pastureMinter("docs", pasture(undefined), { gitToken: HOME }, () => now, sheep(undefined))({ kind: "git", scope })).toEqual(handed(HOME, "the home"));
    expect(await pastureMinter("docs", pasture(""), {}, () => now, sheep(undefined))({ kind: "git", scope })).toEqual({
      refused: "this sheep has no GIT_TOKEN, pasture docs has none, and the home has no PEN_GIT_TOKEN, so nothing can be minted for gitlab.example",
    });
    // With the pasture's and the home's there too, the sheep's is still first; with none of the sheep's, the pasture's over the home's.
    expect(await pastureMinter("docs", pasture(PASTURE), { gitToken: HOME }, () => now, sheep(SHEEP))({ kind: "git", scope })).toMatchObject({ answer: { value: SHEEP } });
    expect(await pastureMinter("docs", pasture(undefined), {}, () => now, sheep(SHEEP))({ kind: "git", scope })).toEqual(handed(SHEEP, "this sheep"));
    // A pasture with no repository: the home's host, the sheep's token.
    const noRepo = pastureMinter("notes", pasture(PASTURE, null), { gitToken: HOME, gitHost: "git.example.com" }, () => now, sheep(SHEEP));
    expect(await noRepo({ kind: "git", scope: "https://git.example.com/x" })).toEqual(handed(SHEEP, "this sheep"));
    // A Directory that cannot be read is a refusal that names the failure, through the broker.
    const away = pastureMinter("docs", pasture(PASTURE), { gitToken: HOME }, () => now, { secrets: async () => { throw new Error("the directory is away"); } });
    await expect(away({ kind: "git", scope })).rejects.toThrow("the directory is away");
  });

  it("a pastureless sheep's minter: its own GIT_TOKEN, then the home's, for PEN_GIT_HOST; the refusal names both places", async () => {
    const own = sheep(SHEEP);
    const mint = sheepMinter(own, { gitToken: HOME }, () => now);
    expect(await mint({ kind: "git", scope: "https://github.com/org/repo" })).toEqual(handed(SHEEP, "this sheep"));
    expect(own.asked).toBe(1);
    expect(await mint({ kind: "git", scope: "https://gitlab.example/org/repo" })).toEqual({ refused: `the home has no credential for gitlab.example; its token is for ${DEFAULT_GIT_HOST}` });
    expect(await sheepMinter(sheep(SHEEP), { gitToken: HOME, gitHost: "git.example.com" }, () => now)({ kind: "git", scope: "https://git.example.com/r" })).toEqual(handed(SHEEP, "this sheep"));
    expect(await sheepMinter(sheep(undefined), { gitToken: HOME }, () => now)({ kind: "git", scope: "https://github.com/org/repo" })).toEqual(handed(HOME, "the home"));
    expect(await sheepMinter(sheep(undefined), {}, () => now)({ kind: "git", scope: "https://github.com/org/repo" })).toEqual({
      refused: "this sheep has no GIT_TOKEN and the home has no PEN_GIT_TOKEN, so nothing can be minted for github.com",
    });
    expect(await sheepMinter(sheep(SHEEP), {}, () => now)({ kind: "ssh" as "git", scope: "ssh://github.com" })).toEqual({ refused: "the home mints no ssh credential" });
  });

  it("the log line says from this sheep, from pasture <p>, or from the home, and the refusal's line names every place; never a value", async () => {
    const lines: string[] = [];
    const pair = new WebSocketPair();
    const [cellEnd, containerEnd] = [pair[0], pair[1]];
    cellEnd.accept();
    containerEnd.accept();
    const received: string[] = [];
    containerEnd.addEventListener("message", (event) => {
      received.push(String(event.data));
    });
    const brokers = [
      pastureMinter("docs", pasture(PASTURE), { gitToken: HOME }, () => now, sheep(SHEEP)),
      pastureMinter("docs", pasture(PASTURE), { gitToken: HOME }, () => now, sheep(undefined)),
      pastureMinter("docs", pasture(undefined), { gitToken: HOME }, () => now, sheep(undefined)),
      pastureMinter("docs", pasture(undefined), {}, () => now, sheep(undefined)),
      sheepMinter(sheep(SHEEP), { gitToken: HOME }, () => now),
      sheepMinter(sheep(undefined), {}, () => now),
    ];
    const scopes = [scope, scope, scope, scope, "https://github.com/org/repo", "https://github.com/org/repo"];
    for (const [index, mint] of brokers.entries()) {
      const detach = new CredentialBroker(mint, (line) => lines.push(line)).attach(cellEnd);
      containerEnd.send(JSON.stringify({ type: "credential", id: `cred-${index + 1}`, kind: "git", scope: scopes[index] }));
      await until(() => received.length === index + 1);
      detach();
    }
    expect(received.map((frame) => JSON.parse(frame) as { type: string; value?: string }).map((frame) => frame.value ?? frame.type)).toEqual([SHEEP, PASTURE, HOME, "error", SHEEP, "error"]);
    expect(lines).toEqual([
      "credential cred-1 for gitlab.example handed over from this sheep, good for 60 s",
      "credential cred-2 for gitlab.example handed over from pasture docs, good for 60 s",
      "credential cred-3 for gitlab.example handed over from the home, good for 60 s",
      "credential cred-4 for gitlab.example refused: this sheep has no GIT_TOKEN, pasture docs has none, and the home has no PEN_GIT_TOKEN, so nothing can be minted for gitlab.example",
      "credential cred-5 for github.com handed over from this sheep, good for 60 s",
      "credential cred-6 for github.com refused: this sheep has no GIT_TOKEN and the home has no PEN_GIT_TOKEN, so nothing can be minted for github.com",
    ]);
    for (const line of lines) for (const value of [SHEEP, PASTURE, HOME, "not-the-credential"]) expect(line).not.toContain(value);
  });
});

describe("earmark phase 0: journey 2 through the cell", () => {
  const SHEEP_TOKEN = "sheep-git-5b8d2f1a7c3e4096-minted-for-one";
  const PASTURE_TOKEN = "pasture-git-2e7c4a9f1d3b4058-set-later";
  const LONER_TOKEN = "loner-git-9f1c6e3a8b2d4075-no-pasture";
  const VALUES = [SHEEP_TOKEN, PASTURE_TOKEN, LONER_TOKEN, TOKEN];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The clone asks the helper as git does, then a push asks again; each answer is kept by the test, the fake's credential frame the only way it came. */
  function keyringScript(stubRef: { stub?: Stub }, answers: unknown[]): ScriptFor {
    const ask = async () => {
      answers.push(await stubRef.stub!.fakes.at(-1)!.askCredential({ kind: "git", scope: "https://github.com" }));
    };
    return (request) => {
      const command = request.command.trim();
      if (command === birthCommand(REPO, "main")) {
        return {
          steps: [
            { stderr: "Cloning into '.'...\n" },
            { act: ask },
            { act: (disk) => disk.putFile(".git/HEAD", "ref: refs/heads/main\n") },
          ],
          exit: 0,
        };
      }
      if (command === SETUP_COMMAND) return { steps: [{ stdout: "set up\n" }], exit: 0 };
      if (command === "git push -u origin fix-typo") return { steps: [{ act: ask }, { stderr: `To ${REPO}\n * [new branch]      fix-typo -> fix-typo\n` }], exit: 0 };
      return undefined;
    };
  }

  async function mintedInto(name: string, pasture: string | null, secrets?: Record<string, string>) {
    const answers: unknown[] = [];
    const stubRef: { stub?: Stub } = {};
    const summary: SessionSummary = await env.DIRECTORY.getByName("home").create(name, pasture, secrets);
    const stub = stubStarter(summary.id, keyringScript(stubRef, answers));
    stubRef.stub = stub;
    await runInDurableObject(env.SESSION_CELL.getByName(summary.id), (cell: SessionCell) => {
      cell.test.starter = stub.starter;
    });
    return { id: summary.id, summary, stub, answers };
  }

  it("steps 1, 3 and 4: the birth's clone is handed the sheep's own token; the sibling the home's, then the pasture's once it has one, while the earmarked sheep keeps its own; a pastureless sheep its own over the home's; the log says whose; no value in setup's environment, another frame, or a log line", { timeout: 60_000 }, async () => {
    const spies = (["debug", "log", "info", "warn", "error"] as const).map((level) => vi.spyOn(console, level));
    const logs = () => spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(" ")));
    expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name: "keyring", repo: REPO, branch: "main" }) })).status).toBe(201);
    const object = env.PASTURE.getByName("keyring");
    await object.put(SETUP_PATH, new TextEncoder().encode("#!/bin/sh\ntrue\n"));
    await object.setSecret("NPM_TOKEN", "npm-not-the-credential");

    const own = await mintedInto("own", "keyring", { [PASTURE_GIT_TOKEN]: SHEEP_TOKEN });
    const sibling = await mintedInto("sibling", "keyring");
    expect(own.summary.secrets).toEqual([PASTURE_GIT_TOKEN]);

    // Step 1: the first thing asked of each births it, and the clone asks the broker mid-run, as git does.
    for (const { id } of [own, sibling]) expect((await api(`/s/${id}/`)).status).toBe(200);
    expect(own.answers).toEqual([{ username: GIT_USERNAME, value: SHEEP_TOKEN, expires: expect.any(Number) }]);
    expect(sibling.answers).toEqual([{ username: GIT_USERNAME, value: TOKEN, expires: expect.any(Number) }]);
    // GIT_TOKEN is never setup's environment, the sheep's no more than the pasture's; the pasture's other secret is.
    for (const { stub } of [own, sibling]) {
      expect(stub.fakes[0]!.runs.map((run) => run.command)).toEqual([birthCommand(REPO, "main"), SETUP_COMMAND]);
      expect(stub.fakes[0]!.runs[1]!.env).toMatchObject({ NPM_TOKEN: "npm-not-the-credential" });
      expect(stub.fakes[0]!.runs[1]!.env).not.toHaveProperty(PASTURE_GIT_TOKEN);
    }

    // Step 3: the pasture gains a GIT_TOKEN. The earmarked sheep's push still uses its own; the sibling's the pasture's.
    await object.setSecret(PASTURE_GIT_TOKEN, PASTURE_TOKEN);
    for (const { id } of [own, sibling]) {
      await inCell(id, async (cell) => {
        expect((await bash(cell, "git push -u origin fix-typo")).text).toBe(`To ${REPO}\n * [new branch]      fix-typo -> fix-typo\n`);
        (await cell.runtime()).lease!.idle();
      });
    }
    expect(own.answers.at(-1)).toMatchObject({ value: SHEEP_TOKEN });
    expect(sibling.answers.at(-1)).toMatchObject({ value: PASTURE_TOKEN });

    // Step 4: a sheep in no pasture, minted through the route with GIT_TOKEN alone: its own over the home's, for PEN_GIT_HOST.
    const minted = await api("/sessions", { method: "POST", body: JSON.stringify({ name: "loner", secrets: { [PASTURE_GIT_TOKEN]: LONER_TOKEN } }) });
    expect(minted.status).toBe(201);
    const loner = (await minted.json()) as SessionSummary;
    expect(loner).toMatchObject({ pasture: null, secrets: [PASTURE_GIT_TOKEN] });
    const lonerAnswers: unknown[] = [];
    const lonerRef: { stub?: Stub } = {};
    const lonerStub = stubStarter(loner.id, keyringScript(lonerRef, lonerAnswers));
    lonerRef.stub = lonerStub;
    await runInDurableObject(env.SESSION_CELL.getByName(loner.id), (cell: SessionCell) => {
      cell.test.starter = lonerStub.starter;
    });
    await inCell(loner.id, async (cell) => {
      expect((await bash(cell, "git push -u origin fix-typo")).text).toContain("[new branch]");
      const fake = lonerStub.fakes.at(-1)!;
      expect(await fake.askCredential({ kind: "git", scope: "https://gitlab.com/org/repo" })).toBeUndefined();
      (await cell.runtime()).lease!.idle();
    });
    expect(lonerAnswers).toEqual([{ username: GIT_USERNAME, value: LONER_TOKEN, expires: expect.any(Number) }]);
    await sleep(25);

    // Each value in its own sheep's answer frames and nowhere else: no other frame of that sheep, no frame of another.
    const expected: Array<[Stub, string[]]> = [
      [own.stub, [SHEEP_TOKEN, SHEEP_TOKEN]],
      [sibling.stub, [TOKEN, PASTURE_TOKEN]],
      [lonerStub, [LONER_TOKEN]],
    ];
    for (const [stub, values] of expected) {
      const all = stub.fakes.flatMap((fake) => fake.transcript);
      const answers = all.filter((entry) => "frame" in entry && entry.from === "cell" && entry.frame.type === "credential");
      expect(answers.map((entry) => ("frame" in entry ? (entry.frame as { value: string }).value : ""))).toEqual(values);
      for (const entry of all) {
        if (answers.includes(entry)) continue;
        for (const value of VALUES) expect(JSON.stringify(entry)).not.toContain(value);
      }
    }
    // The refusal the loner met named the host and no value.
    const refusal = frames(lonerStub).find((entry) => entry.from === "cell" && entry.frame.type === "error")!;
    expect(refusal.frame).toMatchObject({ code: "refused", of: "credential", message: `the home has no credential for gitlab.com; its token is for ${DEFAULT_GIT_HOST}` });

    // No transcript entry, export table, or route answer has one, and `GET /sessions` has the name alone.
    const listed = await (await api("/sessions")).text();
    expect((JSON.parse(listed) as SessionSummary[]).find((row) => row.id === own.id)?.secrets).toEqual([PASTURE_GIT_TOKEN]);
    for (const id of [own.id, sibling.id, loner.id]) {
      const answers = [listed, await (await api(`/s/${id}/transcript`)).text(), await (await api(`/s/${id}/export`)).text(), await (await api(`/s/${id}/`)).text()];
      for (const answer of answers) for (const value of VALUES) expect(answer).not.toContain(value);
    }

    // The log line says whose each was, and no line has a value.
    const lines = logs();
    const handedOver = (id: string, from: string) => lines.filter((line) => line.startsWith(`[cell ${id}] pen: credential `) && line.endsWith(`handed over from ${from}, good for 60 s`)).length;
    expect(handedOver(own.id, "this sheep")).toBe(2);
    expect(handedOver(sibling.id, "the home")).toBe(1);
    expect(handedOver(sibling.id, "pasture keyring")).toBe(1);
    expect(handedOver(loner.id, "this sheep")).toBe(1);
    expect(lines.some((line) => line.startsWith(`[cell ${loner.id}] pen: credential `) && line.includes("for gitlab.com refused"))).toBe(true);
    for (const line of lines) for (const value of VALUES) expect(line).not.toContain(value);
  });
});
