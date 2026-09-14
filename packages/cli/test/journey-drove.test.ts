/**
 * Drove phase 1 through the built command against a local home: `wrangler
 * dev` on a free port with the faux provider and no container, in
 * `journey5.test.ts`'s shape, and two fake towns this file starts on free
 * ports on 127.0.0.1, which the home's workerd reaches with the Worker's own
 * `fetch`. The town is written from the contract's wire alone: `POST /call`
 * with a bearer, answered `{ stdout, stderr, exit }`, every request kept.
 *
 * Journey 4, the dog looks in the pen: steps 1 to 4 and 6 (step 5 needs a
 * container, and is the cell's test against the fake container). A line's
 * streams and code come back as the line gave them; stdin piped to the verb
 * by a shell reaches the line; `sheep log` has no entry for a peek; a peek
 * while the faux model holds a turn open is exit 2 with the one sentence,
 * and after `sheep abort` it runs; an id the home lacks is its sentence and
 * exit 2, as every verb gives it.
 *
 * Journey 3 steps 1 to 5 through `sheep sh`: a sheep with no grant is
 * refused at exit 3 in one line; a sheep born into a pasture with a grant
 * has the town's help; its own grant at another town lays over the
 * pasture's; a value that is no grant is refused at exit 3, its words in
 * neither the line nor the envelope, and nothing reaches a town; a
 * pasture's grant set after a sheep's boot is that sheep's next peek's. The
 * prompt each sheep was built with is read through `sheep export`: the faux
 * model's `system` step answers with the system prompt it was given, which
 * puts the prompt in the transcript, since pi keeps no prompt of its own in
 * the session's rows.
 *
 * The search: the grants' tokens in no line `sheep log`, `sheep export`,
 * `sheep status`, and `sheep sh <id> -- env` print, for a sheep whose model
 * ran `town` in a turn, so the log has the call in it.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bin, type Result, type RunOptions, runSheep, scriptFaux, startHome, stopHome } from "./local-home.js";

const TOKEN = "journey-drove-token";
const home = await startHome(TOKEN);
if (typeof home === "string") process.stderr.write(`drove phase 1 skipped: ${home}\n`);

/** The grants' tokens: strings that look like nothing else, so a search for one is exact. */
const HERD_TOKEN = "drove-herd-token-3e9a7c1f5b2d4086-the-pastures";
const OWN_TOKEN = "drove-own-token-8d2b6f4a1c7e4093-the-sheeps";
const LATE_TOKEN = "drove-late-token-6a1f9c3e7b2d4051-set-after-a-birth";
const TOKENS = [HERD_TOKEN, OWN_TOKEN, LATE_TOKEN];
const HOLDERS: Record<string, string> = { [`Bearer ${HERD_TOKEN}`]: "the herd's grant", [`Bearer ${OWN_TOKEN}`]: "the sheep's own grant", [`Bearer ${LATE_TOKEN}`]: "the late grant" };
/** What a sheep's system prompt says when it carries a grant (drove phase 0's paragraph), and what every sheep's says. */
const TOLD = "This sheep carries a grant at a town: `town` in the bash tool";
const SHELL = "The bash tool runs a shell interpreter";

const ID = /^[0-9a-f-]{36}$/;
const NO_GRANT = "town: this sheep carries no grant; mint one with sheep new --secret TOWN_GRANT, or set the pasture's";
const refusal = (id: string): string => `sheep: no session ${id} at this home; \`sheep ls\` lists the ones there are\n`;
const NOTICE = "town-notice: pass-expires expires=2026-09-17T17:38:03Z\n";
const midTurn = (id: string): string => `sheep: the sheep ${id} is mid-turn; wait or abort first (sheep wait ${id}, sheep abort ${id}), since a peek would share the shell the turn is using\n`;

interface Call {
  authorization: string | undefined;
  body: { argv: string[]; stdin: string | null; json: boolean };
}

/** A fake town: `POST /call` answered with help that names the town and the token's holder, every request kept. */
async function startTown(name: string): Promise<{ server: Server; origin: string; calls: Call[] }> {
  const calls: Call[] = [];
  const read = (request: IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  const server = createServer(async (request, response) => {
    const text = await read(request);
    if (request.method !== "POST" || request.url !== "/call") {
      response.writeHead(404).end();
      return;
    }
    const body = JSON.parse(text) as Call["body"];
    calls.push({ authorization: request.headers.authorization, body });
    const holder = HOLDERS[request.headers.authorization ?? ""];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(holder === undefined ? { stdout: "", stderr: "error: this pass is not valid\n", exit: 3 } : { stdout: `${name}: help for ${holder} [remember]\n`, stderr: NOTICE, exit: 0 }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return { server, origin: `http://127.0.0.1:${port}`, calls };
}

const town = await startTown("memory town");
const other = await startTown("other town");

async function sheep(args: string[], options: RunOptions = {}): Promise<Result> {
  if (typeof home === "string") throw new Error(home);
  return runSheep(home, args, options);
}

/** The verb with its stdin a pipe a shell made, as a dog's `printf … | sheep sh` has it. */
async function piped(printf: string, args: string[]): Promise<Result> {
  if (typeof home === "string") throw new Error(home);
  const env = { ...process.env, SHEEP_HOME: home.url, SHEEP_TOKEN: home.token, HOME: home.persist, NODE_NO_WARNINGS: "1", SHEEP_TIP: "0" };
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", `printf '${printf}' | "$0" "$@"`, process.execPath, bin, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
  });
}

async function script(path: string, program: unknown): Promise<void> {
  if (typeof home === "string") throw new Error(home);
  expect(await scriptFaux(home, path, program)).toBe(200);
}

const grantOf = (origin: string, token: string): string => `${JSON.stringify({ town: origin, token })}\n`;

/**
 * The prompt a sheep was built with, read through `sheep export`: its model answers one turn with the system prompt it was
 * given, and the exported file is read for it. The reply is returned too, so a case can see the two are the one prompt.
 */
async function promptOf(id: string, dir: string): Promise<{ reply: string; exported: string }> {
  await script(`/s/${id}/faux`, { steps: [{ system: true }] });
  const replied = await sheep(["attach", id, "--", "what were you told?"]);
  expect(replied.code, replied.stderr).toBe(0);
  const file = join(dir, `${id}-prompt.sqlite`);
  expect((await sheep(["export", id, file])).code).toBe(0);
  const exported = (await readFile(file)).toString("utf8");
  expect(exported).toContain(SHELL);
  return { reply: replied.stdout, exported };
}

async function mint(args: string[] = [], options: RunOptions = {}): Promise<string> {
  const minted = await sheep(["new", ...args, "--detach"], options);
  expect(minted, JSON.stringify(minted)).toMatchObject({ code: 0 });
  expect(minted.stdout.trim()).toMatch(ID);
  return minted.stdout.trim();
}

describe.skipIf(typeof home === "string")("drove phase 1: the peek and the grant, through sheep against a local home and a fake town", () => {
  afterAll(async () => {
    for (const each of [town, other]) {
      each.server.closeAllConnections();
      await new Promise((resolve) => each.server.close(resolve));
    }
    if (typeof home !== "string") await stopHome(home);
  });

  it("journey 4 steps 1 to 4 and 6: the streams and the code, stdin from a pipe, no entry, mid-turn and aborted, and an id the home lacks", { timeout: 120_000 }, async () => {
    const id = await mint();

    // Step 1.
    expect(await sheep(["sh", id, "--", "echo hello; exit 4"])).toEqual({ code: 4, stdout: "hello\n", stderr: "" });
    expect(await sheep(["sh", id, "--", "echo out; echo err >&2"])).toEqual({ code: 0, stdout: "out\n", stderr: "err\n" });

    // Step 2: stdin reached the line as given, the tab and the newline shown by od.
    const od = await piped("a\\tb\\n", ["sh", id, "--", "cat | od -c"]);
    expect(od.code).toBe(0);
    expect(od.stderr).toBe("");
    expect(od.stdout).toMatch(/a\s+\\t\s+b\s+\\n/);

    // Step 3: a peek is not a turn.
    expect(await sheep(["log", id])).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(await sheep(["log", id, "--json"])).toEqual({ code: 0, stdout: "", stderr: "" });

    // Step 4: the faux model holds this sheep's turn for a minute.
    await script(`/s/${id}/faux`, { steps: [{ text: "slow", delayMs: 60_000 }] });
    expect((await sheep(["attach", id, "--detach", "--", "take your time"])).code).toBe(0);
    expect((await sheep(["status", id])).stdout).toMatch(/^state: running$/m);
    expect(await sheep(["sh", id, "--", "true"])).toEqual({ code: 2, stdout: "", stderr: midTurn(id) });
    expect((await sheep(["abort", id])).code).toBe(0);
    expect(await sheep(["sh", id, "--", "true"])).toEqual({ code: 0, stdout: "", stderr: "" });

    // Step 6.
    expect(await sheep(["sh", "nosuch", "--", "true"])).toEqual({ code: 2, stdout: "", stderr: refusal("nosuch") });
    expect((await sheep(["rm", id])).code).toBe(0);
  });

  it("journey 3 steps 1 to 5 through sheep sh, each prompt read through sheep export, then the search for the grants' tokens", { timeout: 180_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "drove-export-"));
    try {
      // Step 1: no grant anywhere; one line on stderr, exit 3, and no request; its prompt, read through the export, has no town.
      const bare = await mint();
      expect(await sheep(["sh", bare, "--", "town"])).toEqual({ code: 3, stdout: "", stderr: `${NO_GRANT}\n` });
      expect(town.calls).toEqual([]);
      const bareTold = await promptOf(bare, dir);
      expect(bareTold.reply).toContain(SHELL);
      expect(bareTold.exported).not.toContain(TOLD);
      expect(bareTold.exported).not.toContain("`town`");

      // Step 2: a pasture's grant, one line on stdin; a sheep born there has the town's help, posted with the herd's token, and is told.
      expect((await sheep(["pasture", "new", "drove-herd"])).code).toBe(0);
      expect((await sheep(["pasture", "secret", "set", "drove-herd", "TOWN_GRANT"], { stdin: grantOf(town.origin, HERD_TOKEN) })).code).toBe(0);
      const herded = await mint(["--pasture", "drove-herd"]);
      expect(await sheep(["sh", herded, "--", "town"])).toEqual({ code: 0, stdout: "memory town: help for the herd's grant [remember]\n", stderr: NOTICE });
      expect(town.calls).toEqual([{ authorization: `Bearer ${HERD_TOKEN}`, body: { argv: [], stdin: null, json: false } }]);
      expect((await promptOf(herded, dir)).exported).toContain(TOLD);

      // Step 3: a sheep's own grant at another town, laid over the pasture's.
      const own = await mint(["--pasture", "drove-herd", "--secret", "TOWN_GRANT"], { stdin: grantOf(other.origin, OWN_TOKEN) });
      expect(await sheep(["sh", own, "--", "town"])).toEqual({ code: 0, stdout: "other town: help for the sheep's own grant [remember]\n", stderr: NOTICE });
      expect(other.calls).toEqual([{ authorization: `Bearer ${OWN_TOKEN}`, body: { argv: [], stdin: null, json: false } }]);
      expect(town.calls).toHaveLength(1);

      // Step 4: a value that is no grant; exit 3 in one line without its words, and the envelope without them; nothing posted.
      const notAGrant = await mint(["--secret", "TOWN_GRANT"], { stdin: "not a grant\n" });
      const refused = await sheep(["sh", notAGrant, "--", "town memory remember x"]);
      expect(refused.code).toBe(3);
      expect(refused.stdout).toBe("");
      expect(refused.stderr.split("\n")).toHaveLength(2);
      expect(refused.stderr).not.toContain("not a grant");
      const enveloped = await sheep(["sh", notAGrant, "--", "town --json memory remember x"]);
      expect(enveloped.code).toBe(3);
      expect(enveloped.stderr).toBe("");
      expect(enveloped.stdout.endsWith("\n")).toBe(true);
      expect(enveloped.stdout.trimEnd().split("\n")).toHaveLength(1);
      const envelope = JSON.parse(enveloped.stdout) as Record<string, unknown>;
      expect(Object.keys(envelope).sort()).toEqual(["error", "exit", "notices", "ok", "output"]);
      expect(envelope).toMatchObject({ ok: false, exit: 3, output: "", notices: [] });
      expect(typeof envelope.error).toBe("string");
      expect(enveloped.stdout).not.toContain("not a grant");
      expect(town.calls).toHaveLength(1);
      expect(other.calls).toHaveLength(1);

      // Step 5: a pasture with no grant; a sheep born there boots at its first peek, refused. The pasture's grant is set after:
      // that sheep's next peek has the town, while its prompt, built at its boot, still has none; a sheep born after is told.
      expect((await sheep(["pasture", "new", "late-herd"])).code).toBe(0);
      const early = await mint(["--pasture", "late-herd"]);
      expect(await sheep(["sh", early, "--", "town"])).toEqual({ code: 3, stdout: "", stderr: `${NO_GRANT}\n` });
      expect((await sheep(["pasture", "secret", "set", "late-herd", "TOWN_GRANT"], { stdin: grantOf(town.origin, LATE_TOKEN) })).code).toBe(0);
      expect(await sheep(["sh", early, "--", "town"])).toEqual({ code: 0, stdout: "memory town: help for the late grant [remember]\n", stderr: NOTICE });
      expect(town.calls.at(-1)).toEqual({ authorization: `Bearer ${LATE_TOKEN}`, body: { argv: [], stdin: null, json: false } });
      const earlyTold = await promptOf(early, dir);
      expect(earlyTold.exported).not.toContain(TOLD);
      expect(earlyTold.exported).not.toContain("`town`");
      const later = await mint(["--pasture", "late-herd"]);
      expect((await promptOf(later, dir)).exported).toContain(TOLD);

      // The search. The own-grant sheep's model runs `town` and `env` in a turn, so the log holds the call and the environment.
      await script(`/s/${own}/faux`, { steps: [{ tool: { name: "bash", args: { command: "town; env" } } }, { text: "the town answered" }] });
      expect((await sheep(["attach", own, "--", "run town"])).stdout).toBe("the town answered\n");
      expect(other.calls).toHaveLength(2);
      const flock = [bare, herded, own, notAGrant, early, later];
      for (const id of flock) {
        const log = await sheep(["log", id]);
        const logJson = await sheep(["log", id, "--json"]);
        const status = await sheep(["status", id]);
        const statusJson = await sheep(["status", id, "--json"]);
        const env = await sheep(["sh", id, "--", "env"]);
        const file = join(dir, `${id}.sqlite`);
        const exported = await sheep(["export", id, file]);
        const bytes = (await readFile(file)).toString("latin1");
        for (const [name, printed] of Object.entries({ log, logJson, status, statusJson, env, exported })) {
          expect(printed.code, `${name} ${id}`).toBe(0);
          for (const token of TOKENS) {
            expect(printed.stdout.includes(token), `sheep ${name} ${id} prints ${token} on stdout`).toBe(false);
            expect(printed.stderr.includes(token), `sheep ${name} ${id} prints ${token} on stderr`).toBe(false);
          }
        }
        expect(env.stdout).not.toContain("TOWN_GRANT");
        for (const token of TOKENS) expect(bytes.includes(token), `sheep export ${id} holds ${token}`).toBe(false);
      }
      // The search read something: the turn's log has the town's answer and the shell's environment in it.
      const ownLog = (await sheep(["log", own])).stdout;
      expect(ownLog).toContain("other town: help for the sheep's own grant");
      expect(ownLog).toContain("SHEEP=1");
      for (const id of flock) expect((await sheep(["rm", id])).code).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
