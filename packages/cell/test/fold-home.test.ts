/**
 * fold phase 0: a sheep's `~` is a root. Journey 2 steps 1 to 7 in the
 * cell's terms, in workerd, against the fake container, whose `~` is a disk
 * in memory handed to the agent's own code. A run writes a tool's state
 * under `~`; the container goes; a fresh one is synced from the rows and
 * the tool knows who it is. The cell's shell reads the same bytes at `~`
 * with no container involved, and pi's `read` does too. Nothing of `~` is
 * under `/workspace`. `~/.cache`, `~/.npm`, and a `node_modules` anywhere
 * in `~` stay in the container that wrote them. A file over the cap is
 * refused by name, `~/` in front, and the rest lands. Setup is a run, so
 * what it leaves under `~` is rows and `warm` is unchanged. `DELETE
 * /s/<id>` leaves the cell's storage empty. A home with no container is as
 * it was, byte for byte: `HOME` is `/workspace`, `/home/sheep` is outside
 * the fence, and the prompt is the literal.
 */
import { BACKGROUND_CONTEXT, createBashTool, createReadTool, createWriteTool, getOrThrow } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import { CellExecutionEnv, type ContainerLease, SETUP_COMMAND, SETUP_PATH } from "../src/env/execution-env.ts";
import { NO_CONTAINER, SHELL_SYSTEM_PROMPT_LINE, shellSystemPromptLine } from "../src/env/programs.ts";
import type { ContainerStarter } from "../src/pen/lease.ts";
import { systemPrompt } from "../src/prompt.ts";
import { HOME_ROOT, MAX_FILE_BYTES, WORKSPACE_ROOT } from "../src/workspace/files.ts";
import { type FakeContainer, type MemoryDisk, type ScriptFor, serveFakeOn, startFakeContainer } from "./fake-container.ts";

const context = BACKGROUND_CONTEXT;
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const noUpdate = () => {};
const invocation = {
  invocationId: "inv",
  operationId: "op",
  turnId: "turn",
  async getMemo() {
    return undefined;
  },
  async setMemo() {},
};
const tools = { read: createReadTool(), write: createWriteTool(), bash: createBashTool() };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

async function bash(cell: CellExecutionEnv, command: string): Promise<string> {
  return text(await tools.bash.execute("b", { command }, noUpdate, { env: cell }, invocation, context));
}

async function read(cell: CellExecutionEnv, path: string): Promise<string> {
  return text(await tools.read.execute("r", { path }, noUpdate, { env: cell }, invocation, context));
}

/** A file's bytes on a fake's disk as text, or `undefined` when it is not a file there. */
function onDisk(disk: MemoryDisk, path: string): string | undefined {
  const entry = disk.entries.get(path);
  return entry?.kind === "file" ? decoder.decode(entry.bytes) : undefined;
}

// ---------------------------------------------------------------------------
// The tools, as the fake plays them. What a tool reads back, it reads from the `~` of the container it runs in.

const GITCONFIG = "[user]\n\tname = Sheep\n\temail = sheep@example.invalid\n";
const HOSTS = "github.com:\n    user: sheep\n    oauth_token: gho_fixture\n";
const NPMRC = "fund=false\n";
const HUGE = new Uint8Array(MAX_FILE_BYTES + 1).fill(7);

/** What each command does, over the `~` of whichever container `current()` says runs it. */
function toolScript(current: () => FakeContainer | undefined): ScriptFor {
  return (request) => {
    const command = request.command.trim();
    if (command === "git config --global user.name Sheep") {
      return { steps: [{ act: (_disk, home) => home.putFile(".gitconfig", GITCONFIG) }], exit: 0 };
    }
    if (command === "npm config set fund false") {
      return { steps: [{ act: (_disk, home) => home.putFile(".npmrc", NPMRC) }], exit: 0 };
    }
    if (command === "gh auth login") {
      // A login under `~/.config/<tool>`, and, beside it, what a tool keeps as a cache: the home rule's three shapes.
      return {
        steps: [
          {
            act: (_disk, home) => {
              home.putFile(".config/gh/hosts.yml", HOSTS, 0o600);
              home.putFile(".cache/gh/blob", "cached\n");
              home.putFile(".npm/_cacache/index-v5/00", "cached\n");
              home.putFile(".config/gh/node_modules/dep/index.js", "module.exports = 1;\n");
              home.putFile(".local/lib/node_modules/pkg/package.json", "{}\n");
            },
            stdout: "Logged in as sheep\n",
          },
        ],
        exit: 0,
      };
    }
    // The reads: what the tool finds under this container's `~`, which is only what the sync-in put there.
    if (command === "git config --global user.name") {
      const found = onDisk(current()!.home, ".gitconfig")?.match(/name = (.*)/)?.[1];
      return found === undefined ? { steps: [], exit: 1 } : { steps: [{ stdout: `${found}\n` }], exit: 0 };
    }
    if (command === "gh auth status") {
      const hosts = onDisk(current()!.home, ".config/gh/hosts.yml");
      return hosts === undefined ? { steps: [{ stderr: "You are not logged into any GitHub hosts.\n" }], exit: 1 } : { steps: [{ stdout: `Logged in to github.com as ${hosts.match(/user: (.*)/)?.[1]}\n` }], exit: 0 };
    }
    if (command === "gh dump") {
      return {
        steps: [
          {
            act: (disk, home) => {
              home.putFile(".config/gh/huge.bin", HUGE);
              home.putFile(".config/gh/small.txt", "small\n");
              disk.putFile("out.txt", "the command's other change\n");
            },
            stdout: "dumped\n",
          },
        ],
        exit: 0,
      };
    }
    if (command === "node -e 0") return { steps: [], exit: 0 };
    return undefined;
  };
}

/** A home with a container: every `rent()` starts a fresh fake unless `reuse` and the last one is still up; `forget()` is its idle period running out. */
interface Home {
  lease: ContainerLease;
  containers: FakeContainer[];
  rents: number;
  forget(): void;
}

function homeWith(options: { reuse?: boolean } = {}): Home {
  let gone = true;
  const home: Home = {
    containers: [],
    rents: 0,
    lease: {
      async rent() {
        home.rents++;
        const last = home.containers.at(-1);
        if (options.reuse && last !== undefined && !gone) return last.socket;
        const container = startFakeContainer({ script: toolScript(() => home.containers.at(-1)) });
        home.containers.push(container);
        gone = false;
        return container.socket;
      },
      idle() {},
    },
    forget() {
      home.containers.at(-1)?.stop("idle");
      gone = true;
    },
  };
  return home;
}

function inCell<T>(name: string, lease: ContainerLease | undefined, body: (cell: CellExecutionEnv) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`fold:${name}`), (_instance, state) => {
    state.storage.sql.exec("DROP TABLE IF EXISTS files");
    state.storage.sql.exec("DROP TABLE IF EXISTS file_chunks");
    return body(new CellExecutionEnv(state.storage.sql, lease === undefined ? {} : { container: lease }));
  });
}

/** Every path of the cell's rows under a root, relative to it. */
function rowsUnder(cell: CellExecutionEnv, root: string): string[] {
  return cell.files.manifest(root).map((entry) => entry.path);
}

const HOME_NAMES = [".gitconfig", ".npmrc", ".config", ".cache", ".npm", ".local"];

// ---------------------------------------------------------------------------

describe("fold phase 0: journey 2 in the cell's terms", () => {
  it("steps 1 and 2: a tool's state written under ~ in one container is there in a fresh one, and the tool knows who it is", async () => {
    const home = homeWith();
    await inCell("steps-1-2", home.lease, async (cell) => {
      expect(await bash(cell, "git config --global user.name Sheep")).toBe("(no output)");
      expect(await bash(cell, "npm config set fund false")).toBe("(no output)");
      expect(await bash(cell, "gh auth login")).toBe("Logged in as sheep\n");
      // Each is a fresh container, as the harness rents them: what the last one left under `~` came back as rows.
      expect(home.containers.length).toBe(3);
      expect(cell.files.readText(`${HOME_ROOT}/.gitconfig`)).toBe(GITCONFIG);
      expect(cell.files.readText(`${HOME_ROOT}/.npmrc`)).toBe(NPMRC);
      expect(cell.files.readText(`${HOME_ROOT}/.config/gh/hosts.yml`)).toBe(HOSTS);
      expect(cell.files.stat(`${HOME_ROOT}/.config/gh/hosts.yml`).mode).toBe(0o600);

      // Step 2: the container goes; the next command rents a fresh one, whose `~` the sync-in wrote, and the tools know who they are.
      home.forget();
      expect(await bash(cell, "git config --global user.name")).toBe("Sheep\n");
      const fresh = home.containers.at(-1)!;
      expect(onDisk(fresh.home, ".gitconfig")).toBe(GITCONFIG);
      expect(onDisk(fresh.home, ".npmrc")).toBe(NPMRC);
      expect(fresh.home.entries.get(".config/gh/hosts.yml")?.mode).toBe(0o600);
      home.forget();
      expect(await bash(cell, "gh auth status")).toBe("Logged in to github.com as sheep\n");
      // The manifest that did it carried `~` as its third root, beside the workspace, and the fresh `~` came only from it.
      const manifest = home.containers.at(-1)!.transcript.find((entry) => "frame" in entry && entry.frame.type === "manifest");
      expect(manifest !== undefined && "frame" in manifest && manifest.frame.type === "manifest" ? manifest.frame.home?.map((entry) => entry.path) : null).toEqual(
        [".config", ".config/gh", ".config/gh/hosts.yml", ".gitconfig", ".local", ".local/lib", ".npmrc"],
      );
    });
  });

  it("step 3: cat ~/… in the cell's shell, with no container involved, reads the same bytes; pi's read, and write, take ~ the same way", async () => {
    const home = homeWith();
    await inCell("step-3", home.lease, async (cell) => {
      await bash(cell, "gh auth login");
      const rented = home.rents;
      expect(await bash(cell, "cat ~/.config/gh/hosts.yml")).toBe(HOSTS);
      expect((await bash(cell, "echo $HOME; echo ~; cd ~ && pwd")).trim().split("\n")).toEqual([HOME_ROOT, HOME_ROOT, HOME_ROOT]);
      expect(await read(cell, "~/.config/gh/hosts.yml")).toContain("oauth_token: gho_fixture");
      expect(getOrThrow(await cell.readTextFile("~/.config/gh/hosts.yml", context))).toBe(HOSTS);
      expect(getOrThrow(await cell.absolutePath("~", context))).toBe(HOME_ROOT);
      // None of it rented a container: the text tools and pi's read are the cell's own.
      expect(home.rents).toBe(rented);

      // The other way: pi's write under `~` is a row, and the next fresh container has it.
      await tools.write.execute("w", { path: "~/.config/gh/config.yml", content: "git_protocol: https\n" }, noUpdate, { env: cell }, invocation, context);
      expect(cell.files.readText(`${HOME_ROOT}/.config/gh/config.yml`)).toBe("git_protocol: https\n");
      await bash(cell, "node -e 0");
      expect(onDisk(home.containers.at(-1)!.home, ".config/gh/config.yml")).toBe("git_protocol: https\n");
    });
  });

  it("step 4: /workspace, the container's checkout, and the workspace's manifest show nothing of ~; ls -a ~ does", async () => {
    const home = homeWith();
    await inCell("step-4", home.lease, async (cell) => {
      getOrThrow(await cell.writeFile("README.md", "# project\n", context));
      await bash(cell, "git config --global user.name Sheep");
      await bash(cell, "npm config set fund false");
      await bash(cell, "gh auth login");
      const workspace = (await bash(cell, "ls -a /workspace")).split("\n").map((line) => line.trim());
      for (const name of HOME_NAMES) expect(workspace).not.toContain(name);
      expect(workspace).toContain("README.md");
      expect(await bash(cell, "find /workspace")).toBe("/workspace\n/workspace/README.md\n");
      // What `git status` in the container sees is its `/workspace`: nothing of `~` is there, and nothing of it is in the workspace's rows.
      for (const container of home.containers) {
        for (const path of container.disk.entries.keys()) for (const name of HOME_NAMES) expect(path === name || path.startsWith(`${name}/`), path).toBe(false);
      }
      expect(rowsUnder(cell, WORKSPACE_ROOT)).toEqual(["README.md"]);
      expect(cell.files.allPaths().filter((path) => path.startsWith(`${WORKSPACE_ROOT}/`))).toEqual([`${WORKSPACE_ROOT}/README.md`]);
      // `~` has it.
      const listed = (await bash(cell, "ls -a ~")).split("\n").map((line) => line.trim());
      for (const name of [".gitconfig", ".npmrc", ".config"]) expect(listed).toContain(name);
      // And `/` lists `home` beside the other two roots.
      expect((await bash(cell, "ls /")).trim().split("\n")).toEqual(["home", "tmp", "workspace"]);
    });
  });

  it("step 5: what a tool writes under ~/.cache, ~/.npm, or a node_modules anywhere in ~ stays in the container that wrote it and is not in the next", async () => {
    const reused = homeWith({ reuse: true });
    await inCell("step-5", reused.lease, async (cell) => {
      await bash(cell, "gh auth login");
      const cached = [".cache", ".cache/gh/blob", ".npm", ".npm/_cacache/index-v5/00", ".config/gh/node_modules", ".config/gh/node_modules/dep/index.js", ".local/lib/node_modules", ".local/lib/node_modules/pkg/package.json"];
      // Not in the rows.
      for (const path of cached) expect(cell.files.get(`${HOME_ROOT}/${path}`), path).toBeUndefined();
      expect(cell.files.readText(`${HOME_ROOT}/.config/gh/hosts.yml`)).toBe(HOSTS);
      const first = reused.containers[0]!;
      // The same container's next command: its sync-in deletes what the rows no longer name, and never what the rule keeps.
      await bash(cell, "rm ~/.config/gh/hosts.yml");
      expect(await bash(cell, "gh auth status").catch((error: Error) => error.message)).toContain("You are not logged into any GitHub hosts.");
      expect(reused.containers.length).toBe(1);
      expect(first.home.entries.has(".config/gh/hosts.yml")).toBe(false);
      for (const path of cached) expect(first.home.entries.has(path), path).toBe(true);
      // Nor did a second sync-out bring the cache back.
      for (const path of cached) expect(cell.files.get(`${HOME_ROOT}/${path}`), path).toBeUndefined();

      // A fresh container: none of it.
      reused.forget();
      await bash(cell, "node -e 0");
      const fresh = reused.containers.at(-1)!;
      expect(fresh).not.toBe(first);
      for (const path of cached) expect(fresh.home.entries.has(path), path).toBe(false);
      expect([...fresh.home.entries.keys()].some((path) => path.startsWith(".cache") || path.startsWith(".npm") || path.includes("node_modules"))).toBe(false);
    });
  });

  it("step 6: a file over the cap under ~ is refused by name with ~/ in front, and the command's other changes land", async () => {
    const home = homeWith();
    await inCell("step-6", home.lease, async (cell) => {
      const result = await bash(cell, "gh dump");
      expect(result).toBe(`dumped\npen: ~/.config/gh/huge.bin (${MAX_FILE_BYTES + 1} bytes) is over the per-file limit and was not synced\n`);
      expect(cell.files.get(`${HOME_ROOT}/.config/gh/huge.bin`)).toBeUndefined();
      expect(cell.files.readText(`${HOME_ROOT}/.config/gh/small.txt`)).toBe("small\n");
      expect(cell.files.readText(`${WORKSPACE_ROOT}/out.txt`)).toBe("the command's other change\n");
      // The refusal is named per root on the wire: `synced.home`, relative to `~`, and nothing in the workspace's list.
      // The fake records a frame from the cell when the agent receives it, a tick after the cell sent it and moved on.
      await sleep(25);
      const synced = home.containers[0]!.transcript.find((entry) => "frame" in entry && entry.frame.type === "synced");
      expect(synced !== undefined && "frame" in synced ? synced.frame : null).toMatchObject({ refused: [], home: [{ path: ".config/gh/huge.bin", size: MAX_FILE_BYTES + 1 }] });
      // Its bytes never moved.
      expect(home.containers[0]!.transcript.some((entry) => "binary" in entry && entry.size > MAX_FILE_BYTES)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// The whole cell: setup, a sheep's `~` through its container, and the end.

function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

interface Stub {
  starter: ContainerStarter;
  fakes: Array<Omit<FakeContainer, "socket">>;
  ensures: number;
  destroys: number;
}

/** The container's half without a container, as `setup.test.ts` has it: dial the real door on `ensure`, serve the fake on what comes back. */
function stubStarter(sessionId: string, script: ScriptFor): Stub {
  const directory = () => env.DIRECTORY.getByName("home");
  const stub: Stub = {
    fakes: [],
    ensures: 0,
    destroys: 0,
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
        stub.destroys++;
        stub.fakes.at(-1)?.stop("destroyed");
      },
    },
  };
  return stub;
}

/** Every object in the cell's own SQLite that is not the platform's: after an end, none. */
function tablesOf(id: string): Promise<string[]> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) =>
    state.storage.sql
      .exec<{ name: string; type: string }>("SELECT name, type FROM sqlite_master")
      .toArray()
      .filter((row) => !row.name.startsWith("_cf_"))
      .map((row) => `${row.type} ${row.name}`),
  );
}

const SETUP_SCRIPT = "#!/bin/sh\nset -e\ngit config --global init.defaultBranch main\n";
const SETUP_GITCONFIG = "[init]\n\tdefaultBranch = main\n";

describe("fold phase 0: setup is a run, and the end takes ~", () => {
  it("what setup writes under ~ is rows and warm is unchanged; a fresh container has it before its setup; DELETE /s/<id> leaves the cell's storage empty", { timeout: 30_000 }, async () => {
    expect((await api("/pastures", { method: "POST", body: JSON.stringify({ name: "fold" }) })).status).toBe(201);
    await env.PASTURE.getByName("fold").put(SETUP_PATH, encoder.encode(SETUP_SCRIPT));
    const { id } = await env.DIRECTORY.getByName("home").create("folded", "fold");
    /** What each fresh container's setup found under `~` when it ran, in order: the git config, and whether a cache was there. */
    const foundBySetup: Array<{ gitconfig: string | undefined; cache: boolean }> = [];
    let stub: Stub;
    const script: ScriptFor = (request) => {
      const command = request.command.trim();
      if (command === SETUP_COMMAND) {
        const home = stub.fakes.at(-1)!.home;
        foundBySetup.push({ gitconfig: onDisk(home, ".gitconfig"), cache: [...home.entries.keys()].some((path) => path.startsWith(".cache")) });
        return { steps: [{ act: (_disk, home) => { home.putFile(".gitconfig", SETUP_GITCONFIG); home.putFile(".cache/setup/blob", "cached\n"); } }], exit: 0 };
      }
      if (command === "pnpm test") return { steps: [{ stdout: "1 passed\n" }], exit: 0 };
      return undefined;
    };
    stub = stubStarter(id, script);
    await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
      cell.test.starter = stub.starter;
    });

    await runInDurableObject(env.SESSION_CELL.getByName(id), async (cell: SessionCell) => {
      const runtime = await cell.runtime();
      expect(runtime.env.homeDir).toBe(HOME_ROOT);
      // The first command: setup before it, and what setup wrote under `~` came back with setup's own sync-out.
      expect(await bash(runtime.env, "pnpm test")).toBe("1 passed\n");
      expect(runtime.env.files.readText(`${HOME_ROOT}/.gitconfig`)).toBe(SETUP_GITCONFIG);
      expect(runtime.env.files.get(`${HOME_ROOT}/.cache`)).toBeUndefined();
      // `warm` is unchanged: the same container's next command does not run setup again.
      expect(await bash(runtime.env, "pnpm test")).toBe("1 passed\n");
      expect(stub.fakes.flatMap((fake) => fake.runs).map((run) => run.command)).toEqual([SETUP_COMMAND, "pnpm test", "pnpm test"]);
      // A fresh container: setup runs again, and finds `~` as the rows have it, synced in before it.
      runtime.lease!.idle();
      stub.fakes.at(-1)!.stop("idle");
      await sleep(50);
      expect(await bash(runtime.env, "pnpm test")).toBe("1 passed\n");
      expect(stub.fakes.length).toBe(2);
      // The second setup found the first one's git config, synced in from the rows, and none of its cache.
      expect(foundBySetup).toEqual([{ gitconfig: undefined, cache: false }, { gitconfig: SETUP_GITCONFIG, cache: false }]);
      runtime.lease!.idle();
    });

    // Step 7: the end. The cell held rows under `~` before it, and holds nothing after.
    const homeRows = await runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) =>
      state.storage.sql.exec<{ path: string }>("SELECT path FROM files WHERE substr(path, 1, ?) = ?", HOME_ROOT.length + 1, `${HOME_ROOT}/`).toArray().map((row) => row.path),
    );
    expect(homeRows).toContain(`${HOME_ROOT}/.gitconfig`);
    const ended = await api(`/s/${id}`, { method: "DELETE" });
    expect(ended.status, await ended.clone().text()).toBe(200);
    expect(await tablesOf(id)).toEqual([]);
    expect(stub.destroys).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// A home with no container: nothing moves.

/** The no-container shell's prompt line, as a literal: the one pen held, byte for byte. */
const NO_CONTAINER_LINE =
  "The bash tool runs a shell interpreter inside the session with the usual text tools (ls, cat, grep, sed, awk, find, sort, jq, diff, tar) over the workspace at /workspace. " +
  "There are no interpreters (no python, node) and no package managers (no npm, pip, cargo): this shell runs inside the session; no interpreters or package managers are installed. " +
  "Say so plainly when asked for something the shell cannot do, rather than pretending it ran.";

describe("fold phase 0: a home with no container is as it was", () => {
  it("HOME and ~ are /workspace, /home/sheep is outside the fence and not in the table, and the prompt is the literal", async () => {
    await inCell("no-container", undefined, async (cell) => {
      expect(cell.homeDir).toBe(WORKSPACE_ROOT);
      expect((await bash(cell, "echo $HOME; echo ~; cd ~ && pwd")).trim().split("\n")).toEqual([WORKSPACE_ROOT, WORKSPACE_ROOT, WORKSPACE_ROOT]);
      getOrThrow(await cell.writeFile("~/a.txt", "in the workspace\n", context));
      expect(cell.files.readText(`${WORKSPACE_ROOT}/a.txt`)).toBe("in the workspace\n");
      expect(getOrThrow(await cell.absolutePath("~", context))).toBe(WORKSPACE_ROOT);
      // No `/home` row at all, and `/` lists the two roots it always did.
      expect(cell.files.get("/home")).toBeUndefined();
      expect(cell.files.get(HOME_ROOT)).toBeUndefined();
      expect((await bash(cell, "ls /")).trim().split("\n")).toEqual(["tmp", "workspace"]);
      expect(getOrThrow(await cell.listDir("/", context)).map((info) => info.name)).toEqual(["tmp", "workspace"]);
      // The fence refuses `/home/sheep` with the sentence it always had.
      const refused = await cell.writeFile(`${HOME_ROOT}/x`, "no\n", context);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.message).toBe("outside /workspace and /tmp");
      expect(cell.files.get(`${HOME_ROOT}/x`)).toBeUndefined();
      // The prompt.
      expect(SHELL_SYSTEM_PROMPT_LINE).toBe(NO_CONTAINER_LINE);
      expect(shellSystemPromptLine(NO_CONTAINER)).toBe(NO_CONTAINER_LINE);
      expect(systemPrompt(cell.home)).toContain(NO_CONTAINER_LINE);
      expect(systemPrompt(cell.home)).not.toContain("~");
    });
  });

  it("with a container, the prompt's sentence on what syncs back says ~ is kept, and which parts are not", async () => {
    const line = shellSystemPromptLine({ container: true });
    expect(line).toContain(
      "Output streams back, and the files a command changed sync back to the workspace, except node_modules, build output, and anything in .gitignore, which stay in the container and go when it does; ~ (/home/sheep) is kept the same way, except ~/.cache and ~/.npm. ",
    );
    // The fence names the third root where there is one.
    const home = homeWith();
    await inCell("fence", home.lease, async (cell) => {
      const refused = await cell.writeFile("/etc/passwd", "no\n", context);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.message).toBe(`outside /workspace, /tmp, and ${HOME_ROOT}`);
      // `/home` is a row, readable, and not a root: nothing can be written beside `sheep`.
      expect(getOrThrow(await cell.listDir("/home", context)).map((info) => info.name)).toEqual(["sheep"]);
      await expect(bash(cell, "echo no > /home/other")).rejects.toThrow(/EACCES|permission/i);
    });
  });
});
