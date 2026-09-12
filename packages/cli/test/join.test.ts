/**
 * `sheep home join`, withdrawn (stile phase 2, journey 3 step 4).
 *
 * Station phase 2 made it a second machine's way in, the home's token
 * piped on stdin by the shepherd. The stile's station step joins now, by
 * proving the account rather than carrying a token by hand, so the verb is
 * one sentence naming `sheep setup`, exit 2, whatever is typed after it —
 * an address, a token on the command line, `--json`, a token piped — and
 * nothing is read, asked, or written. `--help` not listing it is the
 * fence's (`surface.test.ts`).
 *
 * Driven through `bin/sheep.js` in a scratch kennel, `HOME` the world's
 * own temporary directory: the machine this runs on may keep real
 * credentials in its own `~/.sheep`.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { JOIN_WITHDRAWN } from "../src/deploy.js";
import { bin, type Result } from "./local-home.js";

const TOKEN = "a-station-token-0123456789abcdef0123456789abcdef";

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

function sheep(cwd: string, home: string, args: string[], stdin: string): Promise<Result> {
  const env: Record<string, string | undefined> = { ...process.env, HOME: home, NODE_NO_WARNINGS: "1" };
  for (const name of Object.keys(env)) if (name.startsWith("SHEEP_") || name === "CLOUDFLARE_API_TOKEN" || name === "ANTHROPIC_API_KEY") delete env[name];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { env, cwd, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
    child.stdin.end(stdin);
  });
}

describe("sheep home join is withdrawn", () => {
  it("answers one sentence naming sheep setup, exit 2, with any arguments; asks the address nothing and writes nothing", async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), "sheep-join-")));
    roots.push(root);
    const blog = join(root, "blog");
    await mkdir(join(blog, ".sheep"), { recursive: true });
    const asked: string[] = [];
    const home = createServer((request, response) => {
      asked.push(`${request.method} ${request.url}`);
      response.end("sheep\n");
    });
    await new Promise<void>((resolve) => home.listen(0, "127.0.0.1", resolve));
    const address = `http://127.0.0.1:${(home.address() as { port: number }).port}`;
    try {
      for (const args of [["home", "join"], ["home", "join", address], ["home", "join", address, "--json"], ["home", "join", address, TOKEN], ["home", "join", address, `--token=${TOKEN}`]]) {
        const result = await sheep(blog, root, args, `${TOKEN}\n`);
        expect(result.code, args.join(" ")).toBe(2);
        expect(result.stdout, args.join(" ")).toBe("");
        expect(result.stderr, args.join(" ")).toBe(`sheep: ${JOIN_WITHDRAWN}\n`);
        expect(result.stderr).not.toContain(TOKEN);
      }
    } finally {
      await new Promise((resolve) => home.close(resolve));
    }
    expect(JOIN_WITHDRAWN).toContain("`sheep setup`");
    expect(asked).toEqual([]);
    expect(readdirSync(join(blog, ".sheep"))).toEqual([]);
    expect(existsSync(join(root, ".sheep", "config"))).toBe(false);
  });
});
