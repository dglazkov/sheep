/**
 * The stile under a real pseudo-terminal (stile phase 1): the one thing
 * the screen harness cannot prove, because the harness is the terminal.
 *
 * `script` gives the command a pty of its own, with no seam set, so the
 * command decides for itself that it is at a terminal, pi-tui's
 * `ProcessTerminal` puts that terminal in raw mode, and the terminal's
 * own echo is what would betray a typed value if raw mode were not set.
 * So this proves the tty detection and the hidden prompt as a process,
 * and nothing `stile.test.ts` already proves: no deploy, no account, and
 * no frame is compared here. A value is typed a key at a time and pasted
 * the way a terminal brackets a paste, and neither is in anything the pty
 * gave back; then Ctrl-C ends the sitting with nothing kept.
 *
 * `script` is in macOS and in util-linux (`node:22-slim` has it), with
 * different arguments; where it is absent the case is skipped with a line
 * saying so. Every run is its own `HOME`.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hiddenShown } from "../src/stile/screen.js";
import { bin } from "./local-home.js";
import { runsOf } from "./screen.js";

/** Which `script` this machine has: util-linux's takes `-c <command>`, the BSD one takes the command after the file. */
function scriptFlavour(): "bsd" | "util-linux" | undefined {
  const which = spawnSync("sh", ["-c", "command -v script"], { encoding: "utf8" });
  if (which.status !== 0 || which.stdout.trim() === "") return undefined;
  const version = spawnSync("script", ["--version"], { encoding: "utf8" });
  return version.status === 0 && /util-linux/.test(`${version.stdout}${version.stderr}`) ? "util-linux" : "bsd";
}

const flavour = scriptFlavour();
if (flavour === undefined) console.log("stile-tty: skipped: no `script` on this machine, so no pseudo-terminal to run the command under");

const quote = (arg: string) => `'${arg.replace(/'/g, `'\\''`)}'`;

interface Pty {
  output: () => string;
  write: (data: string) => void;
  end: () => void;
  waitFor: (text: string, timeoutMs?: number) => Promise<void>;
  exited: Promise<number>;
}

const homes: string[] = [];
afterAll(async () => {
  for (const home of homes) await rm(home, { recursive: true, force: true });
});

/** The checkout's command under `script`, in a fresh HOME, with nothing of this machine's environment but PATH's node. */
async function underPty(args: string[]): Promise<Pty & { home: string }> {
  const home = realpathSync(await mkdtemp(join(tmpdir(), "sheep-stile-tty-")));
  homes.push(home);
  const cwd = join(home, "blog");
  await mkdir(cwd);
  const command = [process.execPath, bin, ...args];
  const scriptArgs = flavour === "util-linux" ? ["-q", "-e", "-c", command.map(quote).join(" "), "/dev/null"] : ["-q", "/dev/null", ...command];
  // PATH's node alone: a version manager puts a global `sheep` beside `node`, and this is the checkout's command, not that one.
  const nodeOnly = await mkdtemp(join(tmpdir(), "sheep-stile-tty-bin-"));
  homes.push(nodeOnly);
  await symlink(process.execPath, join(nodeOnly, "node"));
  const env = { PATH: `${nodeOnly}:/usr/bin:/bin`, HOME: home, TERM: "xterm-256color", NODE_NO_WARNINGS: "1" };
  // BSD `script` asks its stdin for the terminal's settings, and refuses a socket there ("tcgetattr/ioctl: Operation not
  // supported on socket"): a child's piped stdin is a socket under Node on macOS, and so is a FIFO on macOS. A shell's
  // own `|` is a pipe, so the keys go into a FIFO, `cat` copies them onto a real pipe, and `script` reads that. What the
  // pty gives back goes to a file, read as it grows. `end()` closes the keys, which ends `cat` and so the pipeline.
  const fifo = join(home, "keys");
  const out = join(home, "pty.out");
  spawnSync("mkfifo", [fifo]);
  const child = spawn("sh", ["-c", `cat < ${quote(fifo)} | script ${scriptArgs.map(quote).join(" ")} > ${quote(out)} 2>&1`], { cwd, env, stdio: "ignore" });
  const keys = createWriteStream(fifo);
  const read = () => (existsSync(out) ? readFileSync(out, "utf8") : "");
  const exited = new Promise<number>((resolve) => child.once("close", (code) => resolve(code ?? -1)));
  return {
    home,
    output: read,
    write: (data) => void keys.write(data),
    end: () => void keys.end(),
    waitFor: async (text, timeoutMs = 20_000) => {
      const deadline = Date.now() + timeoutMs;
      while (!read().includes(text)) {
        if (Date.now() > deadline) throw new Error(`the pty never showed ${JSON.stringify(text)}; it showed:\n${read()}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    exited,
  };
}

describe.skipIf(flavour === undefined)("sheep setup at a real terminal", () => {
  it("is the stile when stdin and stdout are a terminal, and the terminal shows no character of a value typed or pasted", { timeout: 60_000 }, async () => {
    const pty = await underPty(["setup"]);
    await pty.waitFor("› where");
    pty.write("\r");
    await pty.waitFor("Cloudflare API token:");
    // Typed, a key at a time, as fingers do; then pasted, as a terminal brackets a paste.
    const typed = "cfTyP3dQ8mZr4Wx";
    for (const key of typed) {
      pty.write(key);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await pty.waitFor(hiddenShown(typed.length));
    const pasted = "Lk9Vb2Nq7Hs5Jd3Fg6";
    pty.write(`\x1b[200~${pasted}\x1b[201~`);
    await pty.waitFor(hiddenShown(typed.length + pasted.length));
    for (const value of [typed, pasted, `${typed}${pasted}`]) {
      for (const piece of runsOf(value)) expect(pty.output().includes(piece), "the pty gave back characters of the value").toBe(false);
    }
    // Ctrl-C, which in raw mode is a byte and not a signal: the sitting ends, says so, and nothing was kept.
    pty.write("\x03");
    pty.end();
    expect(await pty.exited).toBe(2);
    expect(pty.output()).toContain("sheep: setup was interrupted; nothing more was asked, and what was kept is kept");
    expect(existsSync(join(pty.home, ".sheep", "credentials"))).toBe(false);
  });

  it("is the dog's setup at a terminal when --json is given: the report, and no screen", { timeout: 30_000 }, async () => {
    const pty = await underPty(["setup", "--json"]);
    pty.end();
    expect(await pty.exited).toBe(0);
    const text = pty.output();
    expect(text).not.toContain("› where");
    expect(text).toContain('"next":"sheep --agent-help"');
  });
});
