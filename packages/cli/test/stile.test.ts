/**
 * The stile, through a terminal this ring owns (stile phase 1).
 *
 * Every case spawns the built command with `SHEEP_TEST_TERMINAL=80x24`,
 * feeds what it writes into `@xterm/headless` (`screen.ts`), and presses
 * keys one at a time, against the fake account, the fake wrangler, and
 * the fake station `deploy.test.ts` drives (`fakes.ts`). No step is
 * answered by a seam: each value and each Enter is a key written here,
 * and each frame asserted is the terminal's buffer read back.
 *
 * Journey 1 is walked whole — the checklist's seven steps in order, `?`
 * opening and closing, the two values at hidden prompts with the buffer
 * read after every keystroke, a Free account held at `plan` until the
 * fake account is put on Workers Paid, the deploy, the key put after it,
 * the credentials file mode 600, and the count — with a frame snapshot at
 * every step. The frames are written out by hand below, from the
 * design's mock, and are not recorded from a run: a snapshot that is
 * whatever the code printed cannot fail.
 *
 * Every world is its own `HOME`, a temporary directory: the machine this
 * runs on may keep real credentials in its own `~/.sheep`, and nothing
 * here may read them.
 */
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hiddenShown, wordsAt } from "../src/stile/screen.js";
import { STEPS, THINGS, WORDS } from "../src/stile/words.js";
import { ACCOUNT, type FakeState, fakeAccount, fakeStation, fresh, KEY, type StationState, TOKEN } from "./fakes.js";
import { bin, type Result } from "./local-home.js";
import { DOWN, driveStile, ENTER, runsOf, type StileRun } from "./screen.js";

const fakeWrangler = new URL("./fake-wrangler.mjs", import.meta.url).pathname;

/** The sheep, the same five lines every frame starts with. */
const BANNER = ["      __  _", "   ,-'  `' \\_          sheep", "  (  o   ) . _)        a home for coding agents that herd coding agents", "   `-.__.-'", "     ||  ||", ""].join("\n");

/** A frame: the banner, then the rows given, as the terminal's buffer reads them back (trailing spaces trimmed). */
const frame = (...rows: string[]) => `${BANNER}\n${rows.join("\n")}`;

/** The cursor's row: the mark, the step's name in its column, what it shows, and the hint flush with the eightieth column. */
const cursor = (step: string, text: string, hint = "? explain") => {
  const left = `  › ${step.padEnd(8)}  ${text}`;
  return `${left}${" ".repeat(80 - left.length - hint.length)}${hint}`;
};

interface World {
  root: string;
  blog: string;
  state: FakeState;
  stationState: StationState;
  station: string;
  /** The stile in `blog`, at a terminal of 80 by 24 through the seam, with HOME the world's root and no credential in the environment. */
  stile: (args?: string[], secrets?: string[]) => StileRun;
  /** The command in `blog` with no terminal at all: stdin and stdout pipes, and the seam unset. */
  piped: (args: string[]) => Promise<Result>;
  keep: (values: Record<string, string>) => Promise<void>;
  wrangler: () => { args: string[]; stdin: string; env: { tokenInArgs: boolean } }[];
  close: () => Promise<void>;
}

const worlds: World[] = [];
afterAll(async () => {
  for (const world of worlds) await world.close();
});

async function world(state: FakeState = fresh(), options: { linkedHome?: boolean } = {}): Promise<World> {
  const root = realpathSync(await mkdtemp(join(tmpdir(), "sheep-stile-")));
  // A HOME reached through a symlink, as macOS's /var is: HOME names the link, and the working directory is a real path.
  const home = options.linkedHome === true ? `${root}-link` : root;
  if (options.linkedHome === true) await symlink(root, home);
  // The wrangler log is outside HOME, so a walk of HOME for a typed value finds what the command wrote and not the fake's notes.
  const logs = realpathSync(await mkdtemp(join(tmpdir(), "sheep-stile-log-")));
  const blog = join(root, "blog");
  await mkdir(blog, { recursive: true });
  const account = await fakeAccount(state);
  const stationState: StationState = { token: "t".repeat(48), sessions: [], pastures: [] };
  const station = await fakeStation([], stationState);
  const log = join(logs, "wrangler.log");
  const env = (): Record<string, string | undefined> => ({
    // No `sheep` of this machine's on PATH: the command step reads a checkout, whatever the machine running this has installed.
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: home,
    NODE_NO_WARNINGS: "1",
    SHEEP_TEST_ACCOUNT_API: account.url,
    SHEEP_TEST_WRANGLER: fakeWrangler,
    SHEEP_TEST_WRANGLER_LOG: log,
    SHEEP_TEST_STATION_URL: station.url,
  });
  const made: World = {
    root,
    blog,
    state,
    stationState,
    station: station.url,
    stile: (args = [], secrets = []) => driveStile({ command: process.execPath, args: [bin, "setup", ...args], cwd: blog, env: env(), secrets: [TOKEN, KEY, ...secrets] }),
    piped: (args) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [bin, ...args], { cwd: blog, env: env(), stdio: ["pipe", "pipe", "pipe"] });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
        child.once("error", reject);
        child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
        child.stdin.end("");
      }),
    keep: async (values) => {
      await mkdir(join(root, ".sheep"), { recursive: true });
      await writeFile(join(root, ".sheep", "credentials"), JSON.stringify(values), { mode: 0o600 });
    },
    wrangler: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []),
    close: async () => {
      await new Promise((resolve) => account.server.close(resolve));
      await new Promise((resolve) => station.server.close(resolve));
      await rm(root, { recursive: true, force: true });
      if (home !== root) await rm(home, { force: true });
      await rm(logs, { recursive: true, force: true });
    },
  };
  worlds.push(made);
  return made;
}

/**
 * Types a value at a hidden prompt, one key at a time, and after every
 * key reads the terminal's whole buffer and everything the command wrote:
 * no run of eight characters of the value, or of either fake value, is in
 * either. The wait before each read is for the prompt's row to have been
 * redrawn with as many characters as were typed, so the absence is never
 * read from a frame drawn before the key; and once the value is typed,
 * the row shows dots and a count, and not the value.
 */
async function typeHidden(run: StileRun, prompt: string, value: string): Promise<void> {
  const shownAfter = (text: string) => new RegExp(`${prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: (.*?)\\s*\\? (?:explain|close)$`, "m").exec(text)?.[1] ?? "";
  await run.type(value, async (typed) => {
    await run.waitFor((text) => shownAfter(text).length === hiddenShown(typed).length, { timeoutMs: 5_000 });
    const whole = run.buffer();
    const output = run.output();
    for (const secret of new Set([TOKEN, KEY, value])) {
      for (const piece of runsOf(secret)) {
        expect(whole.includes(piece), `after ${typed} keys the terminal's buffer holds eight characters of a typed value`).toBe(false);
        expect(output.includes(piece), `after ${typed} keys the command's output holds eight characters of a typed value`).toBe(false);
      }
    }
  });
  expect(shownAfter(run.frame())).toBe(hiddenShown(value.length));
}

/** Every file under a directory, for the walk that looks for a typed value where none may be. */
function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

/** The rows between a step's row and the next step's row: its words, or its progress, drawn under it. */
function under(text: string, step: string): string[] {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => new RegExp(`^  [✓› ] ${step}\\b`).test(line));
  const rest = lines.slice(at + 1);
  const next = rest.findIndex((line) => /^  [✓› ] [a-z]+\b/.test(line));
  return next === -1 ? rest : rest.slice(0, next);
}

describe("the stile: journey 1, the first sitting", () => {
  it("walks the seven steps: two values typed at hidden prompts, one yes, two defaults, and nothing typed anywhere but the credentials", { timeout: 120_000 }, async () => {
    const w = await world({ ...fresh(), plan: "free" });
    const run = w.stile();

    // Step 1: the sheep and the checklist of seven; command filled in at once; the cursor on where, everywhere the default.
    const start = frame(
      "  ✓ command   sheep 0.0.0-checkout, from a checkout",
      cursor("where", "[everywhere on this machine]  ·  this directory"),
      "    account",
      "    plan",
      "    station",
      "    key",
      "    next",
    );
    expect(await run.waitFor("› where")).toBe(start);
    // The banner and the checklist fit 80 by 24 with no words open.
    expect(start.split("\n").length).toBeLessThanOrEqual(24);
    for (const row of start.split("\n")) expect([...row].length).toBeLessThanOrEqual(80);

    // `?` opens the step's words under it: four things, what, where, cost, and what sheep does.
    await run.press("?");
    expect(run.frame()).toBe(
      frame(
        "  ✓ command   sheep 0.0.0-checkout, from a checkout",
        cursor("where", "[everywhere on this machine]  ·  this directory", "? close"),
        "      what: where this machine keeps its settings: everywhere on it, or this",
        "      directory alone.",
        "      where: everywhere puts them in ~/.sheep; this directory puts them in",
        "      .sheep/ here, git-ignored.",
        "      cost: nothing. Everywhere is the usual answer, and every directory without",
        "      its own falls back to it.",
        "      sheep: sheep writes the skill your agent reads and, for this directory, an",
        "      empty .sheep/; nothing else.",
        "    account",
        "    plan",
        "    station",
        "    key",
        "    next",
      ),
    );
    // `?` again closes them: the frame is the first one again, exactly.
    await run.press("?");
    expect(run.frame()).toBe(start);

    // Enter takes the default. Step 2: account, at a hidden prompt.
    await run.press(ENTER);
    expect(await run.waitFor("› account")).toBe(
      frame(
        "  ✓ command   sheep 0.0.0-checkout, from a checkout",
        "  ✓ where     everywhere on this machine",
        cursor("account", "Cloudflare API token: "),
        "    plan",
        "    station",
        "    key",
        "    next",
      ),
    );
    await typeHidden(run, "Cloudflare API token", TOKEN);
    await run.press(ENTER);

    // The account's name; the plan not on, with the plans page, held until Enter finds it on.
    expect(await run.waitFor("› plan")).toBe(
      frame(
        "  ✓ command   sheep 0.0.0-checkout, from a checkout",
        "  ✓ where     everywhere on this machine",
        "  ✓ account   Fake's Account",
        cursor("plan", "[turned on at the dashboard; check again]"),
        "      Fake's Account is not on Workers Paid yet; turn it on at the dashboard,",
        "      then check again:",
        `      https://dash.cloudflare.com/${ACCOUNT.id}/workers/plans`,
        "    station",
        "    key",
        "    next",
      ),
    );
    // Enter with the account still Free: asked again, and nothing deployed.
    await run.press(ENTER);
    await run.waitFor("check again");
    expect(w.wrangler()).toEqual([]);
    // The shepherd turns the plan on at the dashboard and comes back to the same screen.
    w.state.plan = "workers_paid";
    await run.press(ENTER);

    // Step 3: station offers new, the name minted for the kennel, and Enter takes it.
    expect(await run.waitFor("› station")).toBe(
      frame(
        "  ✓ command   sheep 0.0.0-checkout, from a checkout",
        "  ✓ where     everywhere on this machine",
        "  ✓ account   Fake's Account",
        "  ✓ plan      Workers Paid, 5 USD a month",
        cursor("station", "[new sheep-2]"),
        "    key",
        "    next",
      ),
    );
    await run.press(ENTER);
    // The deploy's progress lines appear under the step as it runs.
    await run.waitFor((text) => under(text, "station").some((line) => line.includes("deploying sheep-2")), { whole: true });

    // Step 4: the step became the address; key at a hidden prompt.
    expect(await run.waitFor("› key")).toBe(
      frame(
        "  ✓ command   sheep 0.0.0-checkout, from a checkout",
        "  ✓ where     everywhere on this machine",
        "  ✓ account   Fake's Account",
        "  ✓ plan      Workers Paid, 5 USD a month",
        "  ✓ station   https://sheep-2.fake.workers.dev",
        cursor("key", "Anthropic API key: "),
        "    next",
      ),
    );
    await typeHidden(run, "Anthropic API key", KEY);
    await run.press(ENTER);

    const exit = await run.exited;
    expect(exit).toEqual({ code: 0, stderr: "" });
    // next: the address, where the credentials are kept, and the one sentence to say to their agent.
    expect(run.buffer()).toBe(
      `${frame(
        "  ✓ command   sheep 0.0.0-checkout, from a checkout",
        "  ✓ where     everywhere on this machine",
        "  ✓ account   Fake's Account",
        "  ✓ plan      Workers Paid, 5 USD a month",
        "  ✓ station   https://sheep-2.fake.workers.dev",
        "  ✓ key       put on the home as its secret",
        "  ✓ next      home: https://sheep-2.fake.workers.dev",
        "              credentials: ~/.sheep/credentials",
        "              config: ~/.sheep/config",
        "              say to your agent: sheep is set up on this machine; run `sheep",
        "              --agent-help` and herd.",
      )}\n\nsheep is set up on this machine; run \`sheep --agent-help\` and herd.`,
    );
    expect(run.leaks()).toEqual([]);

    // The count, from the keys this ring pressed: two values typed, one yes (the plan re-checked on), two defaults (where,
    // station), no value asked twice — the plan's first Enter found it still Free, which is the account's answer, not a value.
    const prompts = run.output().match(/(Cloudflare API token|Anthropic API key):/g) ?? [];
    expect(new Set(prompts)).toEqual(new Set(["Cloudflare API token:", "Anthropic API key:"]));

    // The credentials: ~/.sheep/credentials, mode 600, both values; the config in ~/.sheep, naming the station.
    const credentials = join(w.root, ".sheep", "credentials");
    expect(statSync(credentials).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(credentials, "utf8"))).toEqual({ cloudflare: TOKEN, anthropic: KEY });
    const config = JSON.parse(readFileSync(join(w.root, ".sheep", "config"), "utf8")) as Record<string, unknown>;
    expect(config).toMatchObject({ home: "https://sheep-2.fake.workers.dev", name: "sheep-2" });
    // Everywhere: no kennel in the working directory, and the skill under ~/.agents with its doorway.
    expect(existsSync(join(w.blog, ".sheep"))).toBe(false);
    expect(existsSync(join(w.root, ".agents", "skills", "sheep", "SKILL.md"))).toBe(true);
    expect(lstatSync(join(w.root, ".claude", "skills", "sheep")).isSymbolicLink()).toBe(true);

    // Nothing typed appears in any file but the credentials file: not the config, not the derived wrangler config, nowhere.
    for (const path of filesUnder(w.root)) {
      if (path === credentials) continue;
      const text = readFileSync(path, "latin1");
      for (const secret of [TOKEN, KEY]) expect(runsOf(secret).some((piece) => text.includes(piece)), `${path} holds a typed value`).toBe(false);
    }

    // The deploy, then the key after it: wrangler deploy, the two secrets deploy puts, and the key put by the key step, on
    // stdin; no argument of any call holds either value, and the token reached wrangler's environment alone.
    const calls = w.wrangler();
    expect(calls.map((call) => call.args.slice(0, 3).join(" "))).toEqual(["deploy --config " + calls[0]!.args[2], "secret put SHEEP_TOKEN", "secret put PEN_CELL_ORIGIN", "secret put SHEEP_ANTHROPIC_API_KEY"]);
    expect(calls[3]!.stdin).toBe(`${KEY}\n`);
    for (const call of calls) {
      expect(call.env.tokenInArgs).toBe(false);
      expect(call.args.some((arg) => arg.includes(KEY) || arg.includes(TOKEN))).toBe(false);
    }
    expect(w.state.secrets["sheep-2"]?.sort()).toEqual(["PEN_CELL_ORIGIN", "SHEEP_ANTHROPIC_API_KEY", "SHEEP_TOKEN"]);
  });

  it("asks nothing for a credential that is kept and still accepted, and the deploy puts the kept key", { timeout: 90_000 }, async () => {
    const w = await world();
    await w.keep({ cloudflare: TOKEN, anthropic: KEY });
    const run = w.stile();
    await run.waitFor("› where");
    await run.press(ENTER);
    // account and plan fill in with no prompt: the next frame that waits for a key is the station's.
    expect(await run.waitFor("› station")).toBe(
      frame(
        "  ✓ command   sheep 0.0.0-checkout, from a checkout",
        "  ✓ where     everywhere on this machine",
        "  ✓ account   Fake's Account",
        "  ✓ plan      Workers Paid, 5 USD a month",
        cursor("station", "[new sheep-2]"),
        "    key",
        "    next",
      ),
    );
    await run.press(ENTER);
    expect(await run.exited).toEqual({ code: 0, stderr: "" });
    expect(run.output()).not.toContain("API token:");
    expect(run.output()).not.toContain("API key:");
    expect(run.buffer()).toContain("  ✓ key       put on the home as its secret\n");
    // The key went with the deploy's own secrets, and no second put followed.
    expect(w.wrangler().map((call) => call.args.slice(0, 3).join(" ")).filter((call) => call.startsWith("secret put"))).toEqual(["secret put SHEEP_TOKEN", "secret put SHEEP_ANTHROPIC_API_KEY", "secret put PEN_CELL_ORIGIN"]);
    expect(run.leaks()).toEqual([]);
  });

  it("asks again for a token the account rejects, with the account's reason under the prompt", { timeout: 90_000 }, async () => {
    const w = await world();
    const wrong = "cfWr0ngT0kenZq8Xv3Lm7Pn2Kd5Hs9Bj4";
    const run = w.stile([], [wrong]);
    await run.waitFor("› where");
    await run.press(ENTER);
    await run.waitFor("› account");
    await typeHidden(run, "Cloudflare API token", wrong);
    await run.press(ENTER);
    const again = await run.waitFor("Invalid API Token");
    expect(again).toContain(`${cursor("account", "Cloudflare API token: ")}\n`);
    expect(under(again, "account")[0]).toBe("      the account token is not accepted: Invalid API Token (code 1000); it wants");
    // Nothing was kept of the rejected token past its replacement: the right one is typed, and it is the one kept.
    await typeHidden(run, "Cloudflare API token", TOKEN);
    await run.press(ENTER);
    await run.waitFor("› station");
    run.kill();
    await run.exited;
    expect(JSON.parse(readFileSync(join(w.root, ".sheep", "credentials"), "utf8"))).toEqual({ cloudflare: TOKEN });
    expect(run.leaks()).toEqual([]);
  });
});

describe("the stile: where the settings go, and a station already there", () => {
  it("under a HOME reached through a symlink, is everywhere's sitting still: the station minted for ~/.sheep and the config shown under ~", { timeout: 90_000 }, async () => {
    const w = await world(fresh(), { linkedHome: true });
    await w.keep({ cloudflare: TOKEN, anthropic: KEY });
    const run = w.stile();
    expect(await run.waitFor("› where")).toContain(`${cursor("where", "[everywhere on this machine]  ·  this directory")}\n`);
    await run.press(ENTER);
    expect(await run.waitFor("› station")).toContain(`${cursor("station", "[new sheep-2]")}\n`);
    await run.press(ENTER);
    expect(await run.exited).toEqual({ code: 0, stderr: "" });
    expect(run.buffer()).toContain("  ✓ station   https://sheep-2.fake.workers.dev\n");
    expect(run.buffer()).toContain("              credentials: ~/.sheep/credentials\n              config: ~/.sheep/config\n");
  });

  it("makes this directory's kennel, with its own station named for the directory, when this directory is chosen", { timeout: 90_000 }, async () => {
    const w = await world();
    await w.keep({ cloudflare: TOKEN, anthropic: KEY });
    const run = w.stile();
    await run.waitFor("› where");
    await run.press(DOWN);
    expect(run.frame()).toContain(`${cursor("where", "everywhere on this machine  ·  [this directory]")}\n`);
    await run.press(ENTER);
    expect(await run.waitFor("› station")).toContain("  ✓ where     this directory\n");
    expect(run.frame()).toContain("  › station   [new blog]");
    await run.press(ENTER);
    expect(await run.exited).toEqual({ code: 0, stderr: "" });
    expect(run.buffer()).toContain("              config: ~/blog/.sheep/config\n");
    expect(JSON.parse(readFileSync(join(w.blog, ".sheep", "config"), "utf8"))).toMatchObject({ home: "https://blog.fake.workers.dev", name: "blog" });
    expect(existsSync(join(w.blog, ".agents", "skills", "sheep", "SKILL.md"))).toBe(true);
    expect(existsSync(join(w.root, ".sheep", "config"))).toBe(false);
  });

  it("finds the station the config names when it answers, deploys nothing, and asks only for the account (journey 2 step 4)", { timeout: 90_000 }, async () => {
    const w = await world();
    // The credentials file is gone; the kennel's config still names the station, and the Worker holds its own key.
    await mkdir(join(w.root, ".sheep"), { recursive: true });
    await writeFile(join(w.root, ".sheep", "config"), JSON.stringify({ home: w.station, token: w.stationState.token, name: "sheep-2" }), { mode: 0o600 });
    w.state.workers.push("sheep-2");
    w.state.secrets["sheep-2"] = ["SHEEP_TOKEN", "SHEEP_ANTHROPIC_API_KEY", "PEN_CELL_ORIGIN"];
    const run = w.stile();
    await run.waitFor("› where");
    await run.press(ENTER);
    await run.waitFor("› account");
    await typeHidden(run, "Cloudflare API token", TOKEN);
    await run.press(ENTER);
    expect(await run.exited).toEqual({ code: 0, stderr: "" });
    expect(run.buffer()).toContain(`  ✓ station   ${w.station}\n  ✓ key       the home holds its own; nothing asked\n`);
    expect(run.output()).not.toContain("API key:");
    // Nothing redeployed and nothing put: the wrangler log is empty.
    expect(w.wrangler()).toEqual([]);
    expect(JSON.parse(readFileSync(join(w.root, ".sheep", "credentials"), "utf8"))).toEqual({ cloudflare: TOKEN });
  });
});

describe("the stile: the words", () => {
  it("--explain opens every step's words as it is reached, each at most eight lines, and each prompt's frame one screen", { timeout: 120_000 }, async () => {
    const w = await world();
    const run = w.stile(["--explain"]);
    const seen: Record<string, string[]> = {};
    const read = async (step: string) => {
      const text = await run.waitFor(`› ${step}`);
      seen[step] = under(text, step);
      expect(text.split("\n").length, `the ${step} frame is more than one screen:\n${text}`).toBeLessThanOrEqual(24);
      return text;
    };
    await read("where");
    await run.press(ENTER);
    await read("account");
    await typeHidden(run, "Cloudflare API token", TOKEN);
    await run.press(ENTER);
    await read("station");
    await run.press(ENTER);
    await read("key");
    await typeHidden(run, "Anthropic API key", KEY);
    await run.press(ENTER);
    expect((await run.exited).code).toBe(0);
    for (const [step, lines] of Object.entries(seen)) {
      expect(lines.length, `${step}'s words`).toBeGreaterThan(0);
      expect(lines.length, `${step}'s words are ${lines.length} lines`).toBeLessThanOrEqual(8);
      // The four things, in order.
      const joined = lines.map((line) => line.trim()).join(" ");
      expect(joined.indexOf("what:")).toBe(0);
      expect(joined.indexOf("where:")).toBeGreaterThan(0);
      expect(joined.indexOf("cost:")).toBeGreaterThan(joined.indexOf("where:"));
      expect(joined.indexOf("sheep:")).toBeGreaterThan(joined.indexOf("cost:"));
    }
    // A settled step is one line again: no words are left under a done row in the last frame.
    expect(run.buffer().split("\n").slice(-12).join("\n")).not.toContain("what:");
  });

  it("gives every step all four things, non-empty, in at most eight lines at eighty columns", () => {
    for (const step of STEPS) {
      for (const thing of THINGS) expect(WORDS[step][thing].trim().length, `${step}.${thing}`).toBeGreaterThan(10);
      const lines = wordsAt(step, 80);
      expect(lines.length, `${step}'s words wrap to ${lines.length} lines at 80:\n${lines.join("\n")}`).toBeLessThanOrEqual(8);
      for (const line of lines) expect([...line].length).toBeLessThanOrEqual(80);
    }
  });
});

describe("the stile only ever starts at a terminal", () => {
  it("is the dog's setup with no terminal: the report, nothing asked, and exit 0 with stdin closed", async () => {
    const w = await world();
    const result = await w.piped(["setup"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("\nkennel: .sheep/ made; not a git work tree, so no .gitignore\n");
    expect(result.stdout).toContain("next: sheep --agent-help\n");
    expect(result.stdout).not.toContain("Cloudflare API token");
    expect(result.stdout).not.toContain("\x1b[");
  });

  it("is the dog's setup with --json even at a terminal: the JSON report, no screen drawn, nothing asked", async () => {
    const w = await world();
    const run = w.stile(["--json"]);
    const exit = await run.exited;
    expect(exit.code).toBe(0);
    const report = JSON.parse(run.output()) as { kennel: { state: string }; next: string };
    expect(report.kennel.state).toBe("made");
    expect(report.next).toBe("sheep --agent-help");
    expect(run.output()).not.toContain("› where");
  });
});
