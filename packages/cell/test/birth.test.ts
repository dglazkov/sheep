/**
 * pasture phase 3: birth, the second root, and the credential, in workerd
 * through the fake container. A pastured cell with a repository runs
 * `git clone` on its first boot and not on its second; the entry is in the
 * transcript and in the model's context before the first prompt; a clone
 * that fails is an entry that says so with the sheep still answering, and
 * so is a home with no container. The fake's pasture disk gets the tree
 * with read-only modes from the manifest's second root, a sync-out from a
 * container that wrote under it changes no row, and a sync-in leaves it
 * whole while landing what the object changed. The broker answers a
 * `credential` frame with the pasture's `GIT_TOKEN` when the pasture has
 * one and the home's when it does not, the host the repository's, and
 * neither value is in a log line.
 */
import { BACKGROUND_CONTEXT, createBashTool } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import { PASTURE_DIR_MODE, PASTURE_FILE_MODE } from "@sheep/pen/protocol";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BIRTH_ENTRY, type BirthData, birthCommand, birthText, shellWord } from "../src/birth.ts";
import type { SessionCell } from "../src/cell.ts";
import type { SessionSummary } from "../src/directory.ts";
import { NO_CONTAINER_NOTICE } from "../src/env/execution-env.ts";
import { setFauxScript } from "../src/models.ts";
import { CREDENTIAL_TTL_MS, CredentialBroker, GIT_USERNAME, PASTURE_GIT_TOKEN, pastureMinter } from "../src/pen/broker.ts";
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
const HOME_TOKEN = env.PEN_GIT_TOKEN!;
const PASTURE_TOKEN = "pasture-token-5d2e9a1c7b3f4086-never-in-a-log";
const REPO = "https://github.com/org/repo";
const MISSING = "https://github.com/org/missing";
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array | undefined): string | undefined => (bytes === undefined ? undefined : new TextDecoder().decode(bytes));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function pasture(name: string, meta: { repo?: string; branch?: string } = {}): Promise<void> {
  expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name, ...meta }) })).status).toBe(201);
}

/** The container's half without a container, as `broker.test.ts` does it: dial the real door on `ensure`, serve the fake on what comes back. */
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

/**
 * A session born into a pasture, with a starter set before its first boot. The directory is asked directly: the
 * Worker's route refuses a birth into a pasture with a repository on this home, which has no container binding, and
 * the starter is what stands in for one here.
 */
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

async function bash(cell: SessionCell, command: string) {
  const runtime = await cell.runtime();
  return text(await bashTool.execute("call", { command }, () => {}, { env: runtime.env }, invocation, context));
}

/** The frames of every fake so far, in order. */
function frames(stub: Stub): Array<Extract<TranscriptEntry, { frame: unknown }>> {
  return stub.fakes.flatMap((fake) => fake.transcript).filter((entry): entry is Extract<TranscriptEntry, { frame: unknown }> => "frame" in entry);
}

interface TranscriptEntryView {
  type: string;
  customType?: string;
  data?: unknown;
  timestamp: number;
  message?: { role: string; content: unknown };
}

async function transcript(id: string): Promise<TranscriptEntryView[]> {
  const view = (await (await api(`/s/${id}/transcript`)).json()) as { entries: TranscriptEntryView[] };
  return view.entries;
}

function births(entries: TranscriptEntryView[]): BirthData[] {
  return entries.filter((entry) => entry.type === "custom" && entry.customType === BIRTH_ENTRY).map((entry) => entry.data as BirthData);
}

/** One HTTP prompt, driven to idle, with the messages the faux model saw. */
async function prompt(id: string, message: string, answer = "ok"): Promise<Message[]> {
  let seen: Message[] = [];
  setFauxScript((conversation) => {
    seen = conversation.messages;
    return fauxAssistantMessage(answer);
  });
  expect((await api(`/s/${id}/prompt`, { method: "POST", body: JSON.stringify({ text: message }) })).status).toBe(200);
  const settled = await inCell(id, (cell) => cell.waitForIdle(20_000));
  expect(settled.operation).toBeNull();
  return seen;
}

/** The clone as the fake plays it: the checkout with its `.git` onto the disk, git's line on stderr. */
function cloneScript(repo: string): ScriptFor {
  return (request) => {
    const command = request.command.trim();
    if (command === birthCommand(MISSING, "main")) {
      return {
        steps: [{ stderr: "Cloning into '.'...\n" }, { wait: 5, stderr: `remote: Repository not found.\nfatal: repository '${MISSING}/' not found\n` }],
        exit: 128,
      };
    }
    if (command === birthCommand(repo, "main")) {
      return {
        steps: [
          { stderr: "Cloning into '.'...\n" },
          {
            act: (disk) => {
              disk.putFile("README.md", "# Fixture\n\nThis repositry has a typo.\n");
              disk.putFile(".git/HEAD", "ref: refs/heads/main\n");
              disk.putFile(".git/config", `[remote "origin"]\n\turl = ${repo}\n`);
              disk.putFile(".git/refs/heads/main", "0123456789abcdef0123456789abcdef01234567\n");
              disk.putFile(".git/objects/pack/pack-1.pack", new Uint8Array(2048).fill(7), 0o444);
            },
          },
        ],
        exit: 0,
      };
    }
    return undefined;
  };
}

describe("the birth's words", () => {
  it("quotes the repository and the branch for the shell, and says what ran and how it ended", () => {
    expect(birthCommand(REPO, "main")).toBe(`git clone --branch main ${REPO} .`);
    expect(birthCommand("https://example.com/a repo.git", "feature/x")).toBe("git clone --branch feature/x 'https://example.com/a repo.git' .");
    expect(shellWord("it's")).toBe("'it'\\''s'");
    const base: BirthData = { pasture: "docs", repo: REPO, branch: "main", command: birthCommand(REPO, "main"), cwd: WORKSPACE_ROOT, output: "", truncated: false };
    expect(birthText({ ...base, exit: 0, output: "Cloning into '.'...\n" })).toBe(
      `This session was born into the pasture docs: \`${base.command}\` ran in /workspace in a container, before the first prompt and exited 0, so /workspace is a clone of ${REPO} on branch main.\n\nIts output:\nCloning into '.'...`,
    );
    expect(birthText({ ...base, exit: 128, output: "fatal: not found\n", truncated: true })).toBe(
      `The birth of this session into the pasture docs failed: \`${base.command}\` ran in /workspace in a container, before the first prompt and exited 128. /workspace is as the failure left it.\n\nThe last of its output:\nfatal: not found`,
    );
    expect(birthText({ ...base, error: "this home has no container" })).toBe(
      `The birth of this session into the pasture docs failed: \`${base.command}\` could not run in /workspace in a container, before the first prompt: this home has no container. /workspace is as the failure left it.`,
    );
  });
});

describe("pasture phase 3: birth", () => {
  it("journey 1 step 4: a pastured cell with a repository clones on its first boot and not on its second; the entry is in the transcript and the model's context, and the clone is rows", { timeout: 30_000 }, async () => {
    await pasture("born", { repo: REPO, branch: "main" });
    await env.PASTURE.getByName("born").put("BRIEF.md", encode("Be brief.\n"));
    const { id, stub } = await sessionIn("typo", "born", cloneScript(REPO));

    // The first boot, through the home's face: the answer comes after the birth, with the entry first in the transcript.
    const entries = await transcript(id);
    expect(entries.length).toBe(1);
    const [birth] = births(entries);
    expect(birth).toEqual({
      pasture: "born",
      repo: REPO,
      branch: "main",
      command: `git clone --branch main ${REPO} .`,
      cwd: WORKSPACE_ROOT,
      exit: 0,
      output: "Cloning into '.'...\n",
      truncated: false,
    });
    // The birth was one run in the container, in /workspace, after a sync-in that carried the pasture as the second root.
    const sequence = frames(stub).map((entry) => `${entry.from}:${entry.frame.type}`);
    expect(sequence.filter((step) => step === "cell:run").length).toBe(1);
    const run = frames(stub).find((entry) => entry.frame.type === "run")!.frame as { command: string; cwd: string };
    expect(run).toMatchObject({ command: birth!.command, cwd: WORKSPACE_ROOT });
    expect(sequence.indexOf("container:checkout")).toBeLessThan(sequence.indexOf("cell:run"));
    const manifest = frames(stub).find((entry) => entry.frame.type === "manifest")!.frame as { entries: unknown[]; pasture?: Array<{ path: string; mode: number }> };
    expect(manifest.entries).toEqual([]);
    expect(manifest.pasture).toEqual([{ path: "BRIEF.md", kind: "file", mode: PASTURE_FILE_MODE, hash: expect.any(String) }]);
    expect(stub.fakes[0]!.pasture.entries.get("BRIEF.md")).toMatchObject({ kind: "file", mode: PASTURE_FILE_MODE });
    // The sync-out brought the clone into the rows, `.git` included, modes kept.
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      const paths = runtime.env.files.manifest().map((entry) => entry.path);
      expect(paths).toContain("README.md");
      expect(paths).toContain(".git/HEAD");
      expect(paths).toContain(".git/objects/pack/pack-1.pack");
      expect(runtime.env.files.readText(`${WORKSPACE_ROOT}/.git/HEAD`)).toBe("ref: refs/heads/main\n");
      expect(runtime.env.files.get(`${WORKSPACE_ROOT}/.git/objects/pack/pack-1.pack`)!.mode).toBe(0o444);
      expect(await cell.readFile(`${WORKSPACE_ROOT}/README.md`)).toContain("repositry");
    });
    const row = await env.DIRECTORY.getByName("home").get(id);
    expect(row?.state).toBe("idle");
    expect(row?.task).toBeNull();

    // The first prompt is taken after the birth, and the model has the entry as a message before it.
    const seen = await prompt(id, "What repository is this?");
    expect(seen.length).toBe(2);
    expect(seen[0]!.role).toBe("user");
    expect(JSON.stringify(seen[0])).toContain(birthText(birth!).slice(0, 60));
    expect(seen[1]!.role).toBe("user");
    expect(JSON.stringify(seen[1])).toContain("What repository is this?");
    // The birth entry is not the task; the prompt is.
    expect((await env.DIRECTORY.getByName("home").get(id))?.task).toBe("What repository is this?");
    const after = await transcript(id);
    expect(after[0]).toMatchObject({ type: "custom", customType: BIRTH_ENTRY });
    expect(after[1]).toMatchObject({ type: "message", message: { role: "user" } });

    // A second boot of the same cell: no second clone, no second entry, no second container.
    await inCell(id, (cell) => cell.evict());
    const again = await transcript(id);
    expect(births(again).length).toBe(1);
    expect(again.length).toBe(after.length);
    expect(frames(stub).filter((entry) => entry.frame.type === "run").length).toBe(1);
    expect(stub.ensures).toBe(1);
    await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell, state) => {
      // The record that says it ran: in the cell's own storage, not the presence of files.
      expect(await state.storage.get<{ exit?: number }>(BIRTH_ENTRY)).toMatchObject({ exit: 0 });
      (await cell.runtime()).lease!.idle();
    });
  });

  it("a clone that fails is an entry that says so, the workspace is as the failure left it, and the sheep answers", { timeout: 30_000 }, async () => {
    await pasture("stillborn", { repo: MISSING });
    const { id, stub } = await sessionIn("lost", "stillborn", cloneScript(MISSING));
    const entries = await transcript(id);
    const [birth] = births(entries);
    expect(birth).toMatchObject({ pasture: "stillborn", repo: MISSING, branch: "main", exit: 128, truncated: false });
    expect(birth!.output).toBe(`Cloning into '.'...\nremote: Repository not found.\nfatal: repository '${MISSING}/' not found\n`);
    expect(birthText(birth!)).toContain("failed");
    expect(birthText(birth!)).toContain("exited 128");
    await inCell(id, async (cell) => {
      expect((await cell.runtime()).env.files.manifest()).toEqual([]);
    });
    const seen = await prompt(id, "Did the clone work?", "No: the clone exited 128.");
    expect(JSON.stringify(seen[0])).toContain("exited 128");
    const after = await transcript(id);
    expect(after.at(-1)).toMatchObject({ type: "message", message: { role: "assistant" } });
    expect(JSON.stringify(after.at(-1))).toContain("No: the clone exited 128.");
    // Once, whatever the outcome: a second boot does not try again.
    await inCell(id, (cell) => cell.evict());
    expect(births(await transcript(id)).length).toBe(1);
    expect(frames(stub).filter((entry) => entry.frame.type === "run").length).toBe(1);
    await inCell(id, async (cell) => (await cell.runtime()).lease!.idle());
  });

  it("on a home with no container the entry says so, and the sheep is alive", { timeout: 30_000 }, async () => {
    await pasture("landless", { repo: REPO });
    // No starter: this home has no container binding, and nothing stands in for one.
    const { id } = await env.DIRECTORY.getByName("home").create("nowhere", "landless");
    const [birth] = births(await transcript(id));
    expect(birth).toMatchObject({ pasture: "landless", repo: REPO, error: NO_CONTAINER_NOTICE, output: "" });
    expect(birth!.exit).toBeUndefined();
    expect(birthText(birth!)).toContain("could not run");
    expect(birthText(birth!)).toContain(NO_CONTAINER_NOTICE);
    const seen = await prompt(id, "hello");
    expect(seen.length).toBe(2);
    await inCell(id, (cell) => cell.evict());
    expect(births(await transcript(id)).length).toBe(1);
  });
});

describe("pasture phase 3: the second root", () => {
  it("journey 3's /pasture: the container's disk gets the tree read-only; a sync-out from a container that wrote under it changes no row; a sync-in leaves it whole and lands what the object changed", { timeout: 30_000 }, async () => {
    await pasture("graze");
    const object = env.PASTURE.getByName("graze");
    await object.put("BRIEF.md", encode("Be brief.\n"));
    await object.put("notes/a.md", encode("a\n"));
    await object.put("skills/commit/SKILL.md", encode("---\nname: commit\ndescription: how\n---\nbody\n"));
    const stubRef: { stub?: Stub } = {};
    const { id, stub } = await sessionIn("grazer", "graze", (request) => {
      const command = request.command.trim();
      if (command === "git status") return { steps: [{ stdout: "On branch main\n" }], exit: 0 };
      if (command === "git scribble") {
        return {
          steps: [
            {
              act: (disk) => {
                // The container writes under both roots; only the workspace's write is ever reported.
                const fake = stubRef.stub!.fakes.at(-1)!;
                fake.pasture.putFile("notes/b.md", "written in the container\n");
                fake.pasture.putFile("BRIEF.md", "overwritten in the container\n", PASTURE_FILE_MODE);
                disk.putFile("out.txt", "out\n");
              },
              stdout: "scribbled\n",
            },
          ],
          exit: 0,
        };
      }
      return undefined;
    });
    stubRef.stub = stub;
    // No repository: no birth. The first container command syncs in with the second root.
    expect(births(await transcript(id)).length).toBe(0);
    await inCell(id, async (cell) => {
      // A stub made outside a Durable Object cannot be used inside it (pasture phase 1): the object is reached through one made here.
      const inside = env.PASTURE.getByName("graze");
      expect(await bash(cell, "git status")).toBe("On branch main\n");
      const fake = stub.fakes.at(-1)!;
      const manifest = frames(stub).find((entry) => entry.frame.type === "manifest")!.frame as { entries: unknown[]; pasture: Array<{ path: string; kind: string; mode: number }> };
      expect(manifest.entries).toEqual([]);
      expect(manifest.pasture.map((entry) => `${entry.path} ${entry.kind} ${entry.mode.toString(8)}`)).toEqual([
        `BRIEF.md file ${PASTURE_FILE_MODE.toString(8)}`,
        `notes directory ${PASTURE_DIR_MODE.toString(8)}`,
        `notes/a.md file ${PASTURE_FILE_MODE.toString(8)}`,
        `skills directory ${PASTURE_DIR_MODE.toString(8)}`,
        `skills/commit directory ${PASTURE_DIR_MODE.toString(8)}`,
        `skills/commit/SKILL.md file ${PASTURE_FILE_MODE.toString(8)}`,
      ]);
      // The fake's pasture disk: every entry, read-only modes, the bytes the object has; the workspace disk has none of it.
      const onDisk = [...fake.pasture.entries].map(([path, entry]) => `${path} ${entry.kind} ${entry.mode.toString(8)}`).sort();
      expect(onDisk).toEqual([
        `BRIEF.md file ${PASTURE_FILE_MODE.toString(8)}`,
        `notes directory ${PASTURE_DIR_MODE.toString(8)}`,
        `notes/a.md file ${PASTURE_FILE_MODE.toString(8)}`,
        `skills directory ${PASTURE_DIR_MODE.toString(8)}`,
        `skills/commit directory ${PASTURE_DIR_MODE.toString(8)}`,
        `skills/commit/SKILL.md file ${PASTURE_FILE_MODE.toString(8)}`,
      ]);
      expect(decode((fake.pasture.entries.get("BRIEF.md") as { bytes: Uint8Array }).bytes)).toBe("Be brief.\n");
      expect([...fake.disk.entries.keys()].some((path) => path.includes("BRIEF") || path.startsWith("pasture"))).toBe(false);
      // The blobs came by hash: three files, three `need`ed hashes, all served.
      const need = frames(stub).find((entry) => entry.frame.type === "need" && entry.from === "container")!.frame as { hashes: string[] };
      expect(need.hashes.length).toBe(3);

      // The container writes under /pasture and in the workspace: the sync-out reports the workspace's file and nothing else.
      const before = frames(stub).length;
      expect(await bash(cell, "git scribble")).toBe("scribbled\n");
      const changed = frames(stub).slice(before).find((entry) => entry.frame.type === "changed")!.frame as { entries: Array<{ path: string }>; deleted: string[] };
      expect(changed.entries.map((entry) => entry.path)).toEqual(["out.txt"]);
      expect(changed.deleted).toEqual([]);
      expect((await cell.runtime()).env.files.manifest().map((entry) => entry.path)).toEqual(["out.txt"]);
      expect((await inside.manifest()).map((entry) => entry.path)).toEqual(["BRIEF.md", "notes", "notes/a.md", "skills", "skills/commit", "skills/commit/SKILL.md"]);
      expect(decode(await inside.read("BRIEF.md"))).toBe("Be brief.\n");

      // The object changes: a put, a removal, an edit. The next sync-in lands them, keeps the rest whole, and takes the container's stray file with it.
      await inside.put("notes/c.md", encode("c\n"));
      await inside.rm("notes/a.md");
      await inside.put("BRIEF.md", encode("Be briefer.\n"));
      const mark = frames(stub).length;
      expect(await bash(cell, "git status")).toBe("On branch main\n");
      const need2 = frames(stub).slice(mark).find((entry) => entry.frame.type === "need" && entry.from === "container")!.frame as { hashes: string[] };
      expect(need2.hashes.length).toBe(2);
      const afterDisk = [...fake.pasture.entries].map(([path, entry]) => `${path} ${entry.kind} ${entry.mode.toString(8)}`).sort();
      expect(afterDisk).toEqual([
        `BRIEF.md file ${PASTURE_FILE_MODE.toString(8)}`,
        `notes directory ${PASTURE_DIR_MODE.toString(8)}`,
        `notes/c.md file ${PASTURE_FILE_MODE.toString(8)}`,
        `skills directory ${PASTURE_DIR_MODE.toString(8)}`,
        `skills/commit directory ${PASTURE_DIR_MODE.toString(8)}`,
        `skills/commit/SKILL.md file ${PASTURE_FILE_MODE.toString(8)}`,
      ]);
      expect(decode((fake.pasture.entries.get("BRIEF.md") as { bytes: Uint8Array }).bytes)).toBe("Be briefer.\n");
      expect(decode((fake.pasture.entries.get("skills/commit/SKILL.md") as { bytes: Uint8Array }).bytes)).toContain("name: commit");
      // A third sync-in with nothing changed needs nothing and touches nothing.
      const mark2 = frames(stub).length;
      expect(await bash(cell, "git status")).toBe("On branch main\n");
      const need3 = frames(stub).slice(mark2).find((entry) => entry.frame.type === "need" && entry.from === "container")!.frame as { hashes: string[] };
      expect(need3.hashes).toEqual([]);
      expect([...fake.pasture.entries].map(([path, entry]) => `${path} ${entry.kind} ${entry.mode.toString(8)}`).sort()).toEqual(afterDisk);
      (await cell.runtime()).lease!.idle();
    });
  });
});

describe("pasture phase 3: the credential", () => {
  it("the pasture's minter hands the pasture's GIT_TOKEN over for the repository's host, the home's after it, and refuses by name; no value in a log line", async () => {
    const now = 1_700_000_000_000;
    const meta = { name: "docs", repo: "https://gitlab.example/org/repo", branch: "main", createdAt: 1 };
    const secrets = (token: string | undefined) => ({ meta: async () => meta, secret: async (name: string) => (name === PASTURE_GIT_TOKEN ? token : undefined) });
    const both = pastureMinter("docs", secrets(PASTURE_TOKEN), { gitToken: HOME_TOKEN }, () => now);
    expect(await both({ kind: "git", scope: "https://gitlab.example/org/repo" })).toEqual({
      answer: { username: GIT_USERNAME, value: PASTURE_TOKEN, expires: now + CREDENTIAL_TTL_MS },
      from: "pasture docs",
    });
    // The host is the repository's, not PEN_GIT_HOST: the home's default host is refused by name.
    expect(await both({ kind: "git", scope: "https://github.com/org/repo" })).toEqual({ refused: "the home has no credential for github.com; its token is for gitlab.example" });
    const homeOnly = pastureMinter("docs", secrets(undefined), { gitToken: HOME_TOKEN }, () => now);
    expect(await homeOnly({ kind: "git", scope: "https://gitlab.example/org/repo" })).toEqual({
      answer: { username: GIT_USERNAME, value: HOME_TOKEN, expires: now + CREDENTIAL_TTL_MS },
      from: "the home",
    });
    const neither = pastureMinter("docs", secrets(""), {}, () => now);
    expect(await neither({ kind: "git", scope: "https://gitlab.example/org/repo" })).toEqual({
      refused: "pasture docs has no GIT_TOKEN and the home has no PEN_GIT_TOKEN, so nothing can be minted for gitlab.example",
    });
    // A pasture with no repository: the home's host, the pasture's token.
    const noRepo = pastureMinter("notes", { meta: async () => ({ ...meta, repo: null }), secret: async () => PASTURE_TOKEN }, { gitToken: HOME_TOKEN, gitHost: "git.example.com" }, () => now);
    expect(await noRepo({ kind: "git", scope: "https://git.example.com/x" })).toMatchObject({ answer: { value: PASTURE_TOKEN } });
    expect(await noRepo({ kind: "git", scope: "https://github.com/x" })).toMatchObject({ refused: expect.stringContaining("git.example.com") });
    // A lookup that throws is a refusal that names the failure, not a value.
    const broken = pastureMinter("docs", { meta: async () => meta, secret: async () => { throw new Error("the object is away"); } }, { gitToken: HOME_TOKEN }, () => now);
    await expect(broken({ kind: "git", scope: "https://gitlab.example/org/repo" })).rejects.toThrow("the object is away");

    // Through the broker on a socket pair: the log names the source and the host, never a value.
    const lines: string[] = [];
    const pair = new WebSocketPair();
    const [cellEnd, containerEnd] = [pair[0], pair[1]];
    cellEnd.accept();
    containerEnd.accept();
    const received: string[] = [];
    containerEnd.addEventListener("message", (event) => {
      received.push(String(event.data));
    });
    new CredentialBroker(both, (line) => lines.push(line)).attach(cellEnd);
    new CredentialBroker(broken, (line) => lines.push(line)).attach(cellEnd);
    containerEnd.send(JSON.stringify({ type: "credential", id: "cred-1", kind: "git", scope: "https://gitlab.example/org/repo" }));
    await sleep(50);
    expect(received.length).toBe(2);
    const answers = received.map((line) => JSON.parse(line) as { type: string; value?: string; message?: string });
    expect(answers.find((answer) => answer.type === "credential")).toEqual({ type: "credential", id: "cred-1", username: GIT_USERNAME, value: PASTURE_TOKEN, expires: now + CREDENTIAL_TTL_MS });
    expect(answers.find((answer) => answer.type === "error")).toMatchObject({ type: "error", code: "refused", of: "credential", id: "cred-1", message: expect.stringContaining("the object is away") });
    expect(lines.sort()).toEqual([
      "credential cred-1 for gitlab.example handed over from pasture docs, good for 60 s",
      "credential cred-1 for gitlab.example refused: the credential for gitlab.example could not be looked up: the object is away",
    ]);
    for (const line of lines) {
      expect(line).not.toContain(PASTURE_TOKEN);
      expect(line).not.toContain(HOME_TOKEN);
    }
  });

  it("journey 1 step 5 through the cell: a sheep born into a pasture with a GIT_TOKEN pushes with it, one born into a pasture without pushes with the home's; the value is in no frame but the answer, no row, no entry", { timeout: 30_000 }, async () => {
    await pasture("vault", { repo: REPO });
    await env.PASTURE.getByName("vault").setSecret(PASTURE_GIT_TOKEN, PASTURE_TOKEN);
    await env.PASTURE.getByName("vault").setSecret("NPM_TOKEN", "not-the-credential");
    await pasture("bare", { repo: REPO });
    const asked: Array<{ pasture: string; answer: unknown }> = [];
    const stubs: Record<string, Stub> = {};
    const script = (name: string): ScriptFor => (request) => {
      const clone = cloneScript(REPO)(request);
      if (clone !== undefined) return clone;
      if (request.command.trim() === "git push -u origin fix-typo") {
        return {
          steps: [
            { stderr: "Enumerating objects: 5, done.\n" },
            {
              act: async () => {
                asked.push({ pasture: name, answer: await stubs[name]!.fakes.at(-1)!.askCredential({ kind: "git", scope: "https://github.com" }) });
              },
            },
            { stderr: `To ${REPO}\n * [new branch]      fix-typo -> fix-typo\n` },
          ],
          exit: 0,
        };
      }
      return undefined;
    };
    const vault = await sessionIn("with", "vault", script("vault"));
    stubs.vault = vault.stub;
    const bare = await sessionIn("without", "bare", script("bare"));
    stubs.bare = bare.stub;

    for (const [name, { id, stub }] of [
      ["vault", vault],
      ["bare", bare],
    ] as const) {
      // Born: the clone is rows.
      const [birth] = births(await transcript(id));
      expect(birth).toMatchObject({ pasture: name, exit: 0 });
      await inCell(id, async (cell) => {
        const runtime = await cell.runtime();
        expect(runtime.env.files.manifest().map((entry) => entry.path)).toContain(".git/HEAD");
        // The push: the helper asks mid-run and the tool result is git's words.
        expect(await bash(cell, "git push -u origin fix-typo")).toBe(`Enumerating objects: 5, done.\nTo ${REPO}\n * [new branch]      fix-typo -> fix-typo\n`);
        runtime.lease!.idle();
      });
      const expected = name === "vault" ? PASTURE_TOKEN : HOME_TOKEN;
      const other = name === "vault" ? HOME_TOKEN : PASTURE_TOKEN;
      expect(asked.at(-1)).toEqual({ pasture: name, answer: { username: GIT_USERNAME, value: expected, expires: expect.any(Number) } });
      await sleep(25);
      // Every frame both ways but the one answer carries neither value; the answer carries the right one.
      const all = stub.fakes.flatMap((fake) => fake.transcript);
      const answers = all.filter((entry) => "frame" in entry && entry.from === "cell" && entry.frame.type === "credential");
      expect(answers.length).toBe(1);
      expect(answers[0]).toMatchObject({ frame: { value: expected } });
      for (const entry of all) {
        if (entry === answers[0] || !("frame" in entry)) continue;
        const encoded = JSON.stringify(entry.frame);
        expect(encoded).not.toContain(expected);
        expect(encoded).not.toContain(other);
      }
      // No row, no entry, no table of the export.
      const view = JSON.stringify(await transcript(id));
      expect(view).not.toContain(expected);
      expect(view).not.toContain(other);
      const dump = (await (await api(`/s/${id}/export`)).json()) as Record<string, unknown[]>;
      for (const [table, rows] of Object.entries(dump)) {
        expect(JSON.stringify(rows), table).not.toContain(expected);
        expect(JSON.stringify(rows), table).not.toContain(other);
      }
      await inCell(id, async (cell) => {
        const runtime = await cell.runtime();
        for (const entry of runtime.env.files.manifest()) {
          if (entry.kind !== "file") continue;
          const latin1 = new TextDecoder("latin1").decode(runtime.env.files.readFile(`${WORKSPACE_ROOT}/${entry.path}`));
          expect(latin1, entry.path).not.toContain(expected);
          expect(latin1, entry.path).not.toContain(other);
        }
      });
    }
    // The pasture's other secret is not the credential and went nowhere.
    expect(JSON.stringify(asked)).not.toContain("not-the-credential");
  });
});
