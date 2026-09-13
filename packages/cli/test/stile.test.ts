/**
 * The stile, through a terminal this ring owns (stile phase 1; the frames
 * of the second cut, issue #9).
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
 * every step. Journey 3 is walked the same way (stile phase 2): the
 * station step listing the account's sheep homes, the join chosen with an
 * arrow and Enter, the join key's write, the asks, and its delete read back
 * from the fake account's and the fake station's logs in one order, no
 * wrangler call, and `key` asking nothing. The frames are written out by
 * hand below, from the design's mock, and are not recorded from a run: a
 * snapshot that is whatever the code printed cannot fail.
 *
 * **The attributes are asserted too.** The text of a frame cannot see
 * colour, so a screen that lost its styling would pass every snapshot.
 * The cases under "the screen's colour" read the emulator's cells: the
 * cursor step's name bold amber, a settled `✓` green, the chosen row's
 * `❯` amber, a refusal red, an address cyan and underlined, the box and
 * the panel drawn, the sheep in pixels with 256-colour backgrounds; and
 * under `NO_COLOR` none of it, the line-art sheep instead, and the glyphs
 * alone still saying which step is done, current, and chosen.
 *
 * Every world is its own `HOME`, a temporary directory: the machine this
 * runs on may keep real credentials in its own `~/.sheep`, and nothing
 * here may read them.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AGENT_SENTENCE } from "../src/stile/flow.js";
import { colourLevel } from "../src/stile/paint.js";
import { hiddenShown, TAGLINE, wordsAt } from "../src/stile/screen.js";
import { STEPS, THINGS, WORDS } from "../src/stile/words.js";
import { ACCOUNT, type FakeState, fakeAccount, fakeStation, fresh, KEY, type StationState, TOKEN } from "./fakes.js";
import { bin, type Result } from "./local-home.js";
import { DOWN, DOWN_KITTY, DOWN_SS3, driveStile, ENTER, runsOf, type StileRun, type StyledRow, UP_KITTY } from "./screen.js";

const fakeWrangler = new URL("./fake-wrangler.mjs", import.meta.url).pathname;

/** The column everything under a step starts at, and the width of the box and the finish's box at eighty. */
const IND = " ".repeat(14);
const BOX_RULE = "─".repeat(64);
const WIDE_RULE = "─".repeat(76);

/** The rows after the banner's seven: what every frame is compared on. The banner is checked once, by its cells. */
const body = (text: string): string[] => text.split("\n").slice(7);

/** A cursor row: the mark, the step's name in its column, its text, and the hint at the right with at least two spaces before it. */
const cursor = (step: string, text: string, hint = "? explain"): string => {
  const left = `  › ${step.padEnd(8)}  ${text}`;
  return `${left}${" ".repeat(Math.max(2, 80 - [...left].length - hint.length))}${hint}`;
};
const done = (step: string, text: string): string => `  ✓ ${step.padEnd(8)}  ${text}`;
const later = (step: string): string => `    ${step}`;
/** A row of the selector: `❯` on the chosen one, the label in a column of thirty, the description dim beside it. */
const chosen = (label: string, description = ""): string => `${IND}❯ ${label.padEnd(30)}${description}`.trimEnd();
const other = (label: string, description = ""): string => `${IND}  ${label.padEnd(30)}${description}`.trimEnd();
/** A secret's box: the prompt, two spaces, what the hidden input shows, and the caret. */
const box = (prompt: string, typed: string): string[] => [`${IND}╭${BOX_RULE}╮`, `${IND}│ ${`${prompt}  ${typed}▌`.padEnd(62)} │`, `${IND}╰${BOX_RULE}╯`];
const KEYS = { choose: "  ↑↓ choose   Enter take   ? explain   Ctrl-C leave", send: "  Enter send   ? explain   Ctrl-C leave", recheck: "  Enter check again   ? explain   Ctrl-C leave" };
/** A frame's body with its key line on the last row of twenty-four: the rows given, blank rows, then the key line. */
const screen = (rows: string[], foot: string): string[] => {
  const out = [...rows];
  while (out.length < 16) out.push("");
  return [...out, foot];
};
const command = done("command", "sheep 0.0.0-checkout, from a checkout");
/** The sheep's first row, in pixels and in lines: the first row of the viewport when the finish is on screen whole. */
const SHEEP_TOP = "        ████    ▄▄█▄▄ ▄▄█▄▄ ▄▄█▄▄";
const LINE_SHEEP_TOP = "     ,-.      ,-''-.,-''-.,-''-.";
/** The finish's last frame must start with the sheep: the renderer's stop scrolls two rows, and the sheep is still whole. */
const expectWhole = (run: StileRun, top: string): void => {
  const rows = run.frame().split("\n");
  expect(rows[0], `the finish scrolled the sheep off; the viewport starts with ${JSON.stringify(rows[0])}`).toBe(top);
  expect(rows[2]!.slice(37)).toBe("sheep");
};
const finishBox = [`  ╭${WIDE_RULE}╮`, `  │ ${"say to your agent".padEnd(74)} │`, `  │ ${AGENT_SENTENCE.padEnd(74)} │`, `  ╰${WIDE_RULE}╯`];
/** Every prompt the command drew, read from its output with the paint stripped: the box's rule, the prompt, its two spaces. */
const promptsShown = (run: StileRun): Set<string> => new Set(run.output().replace(/\x1b\[[0-9;]*m/g, "").match(/│ (Cloudflare API token|Anthropic API key) {2}/g) ?? []);
/** The finish's `next` row counts the sitting's seconds, which no snapshot can name. */
const timeless = (text: string): string => text.replace(/done, in \d+m \d+s/, "done, in <time>");

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
  wrangler: () => { args: string[]; stdin: string; env: { token: boolean; tokenInArgs: boolean } }[];
  close: () => Promise<void>;
}

const worlds: World[] = [];
afterAll(async () => {
  for (const world of worlds) await world.close();
});

/**
 * A slow `npm`, first on PATH (stile phase 1, second cut): `install` sleeps this long and then leaves a `sheep` beside
 * itself, so the command step has an install to wait for; `prefix -g` answers the directory above it; anything else nothing.
 */
const SLOW_NPM_MS = 1_500;
const slowNpm = (bin: string): string =>
  ["#!/bin/sh", `case "$1" in`, `  install) sleep ${SLOW_NPM_MS / 1000}; printf '#!/bin/sh\\necho sheep\\n' > "${bin}/sheep"; chmod +x "${bin}/sheep";;`, `  prefix) echo "${join(bin, "..")}";;`, "esac", "exit 0", ""].join("\n");

async function world(state: FakeState = fresh(), options: { linkedHome?: boolean; station?: Partial<StationState>; env?: Record<string, string>; slowNpm?: boolean } = {}): Promise<World> {
  const root = realpathSync(await mkdtemp(join(tmpdir(), "sheep-stile-")));
  // A HOME reached through a symlink, as macOS's /var is: HOME names the link, and the working directory is a real path.
  const home = options.linkedHome === true ? `${root}-link` : root;
  if (options.linkedHome === true) await symlink(root, home);
  // The wrangler log is outside HOME, so a walk of HOME for a typed value finds what the command wrote and not the fake's notes.
  const logs = realpathSync(await mkdtemp(join(tmpdir(), "sheep-stile-log-")));
  const blog = join(root, "blog");
  await mkdir(blog, { recursive: true });
  const account = await fakeAccount(state);
  const stationState: StationState = { token: "t".repeat(48), sessions: [], pastures: [], account: state, ...options.station };
  const station = await fakeStation([], stationState);
  const log = join(logs, "wrangler.log");
  // No `sheep` of this machine's on PATH: the command step reads a checkout, whatever the machine running this has installed.
  // Node's own directory is not enough, since a version manager installs a global `sheep` beside `node`; so PATH's first
  // directory holds `node` alone.
  const nodeOnly = join(logs, "bin");
  await mkdir(nodeOnly);
  await symlink(process.execPath, join(nodeOnly, "node"));
  if (options.slowNpm === true) await writeFile(join(nodeOnly, "npm"), slowNpm(nodeOnly), { mode: 0o755 });
  const env = (): Record<string, string | undefined> => ({
    PATH: `${nodeOnly}:/usr/bin:/bin`,
    HOME: home,
    NODE_NO_WARNINGS: "1",
    SHEEP_TEST_ACCOUNT_API: account.url,
    SHEEP_TEST_WRANGLER: fakeWrangler,
    SHEEP_TEST_WRANGLER_LOG: log,
    SHEEP_TEST_STATION_URL: station.url,
    ...options.env,
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

/** What a secret's box shows after the prompt: the dots, the count, and the caret, read from the frame. */
function shownIn(text: string, prompt: string): string {
  return new RegExp(`│ ${prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}  (.*?) *│$`, "m").exec(text)?.[1] ?? "";
}

/**
 * Types a value at a hidden prompt, one key at a time, and after every
 * key reads the terminal's whole buffer and everything the command wrote:
 * no run of eight characters of the value, or of either fake value, is in
 * either. The wait before each read is for the box to have been redrawn
 * with as many dots as keys were typed, so the absence is never read from
 * a frame drawn before the key; and once the value is typed, the box
 * shows dots and a count, and not the value.
 */
async function typeHidden(run: StileRun, prompt: string, value: string): Promise<void> {
  await run.type(value, async (typed) => {
    await run.waitFor((text) => shownIn(text, prompt) === `${hiddenShown(typed)}▌`, { timeoutMs: 5_000 });
    const whole = run.buffer();
    const output = run.output();
    for (const secret of new Set([TOKEN, KEY, value])) {
      for (const piece of runsOf(secret)) {
        expect(whole.includes(piece), `after ${typed} keys the terminal's buffer holds eight characters of a typed value`).toBe(false);
        expect(output.includes(piece), `after ${typed} keys the command's output holds eight characters of a typed value`).toBe(false);
      }
    }
  });
  expect(shownIn(run.frame(), prompt)).toBe(`${hiddenShown(value.length)}▌`);
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

/** The rows between a step's row and the next step's row: its words, its box, its list, or its progress, drawn under it. */
function under(text: string, step: string): string[] {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => new RegExp(`^  [✓› ] ${step}\\b`).test(line));
  const rest = lines.slice(at + 1);
  const next = rest.findIndex((line) => /^  [✓› ] [a-z]+\b/.test(line));
  return next === -1 ? rest : rest.slice(0, next);
}

/** The viewport row whose text starts with `prefix`, with its cells; fails the case when there is none. */
function rowStarting(run: StileRun, prefix: string): StyledRow {
  const found = run.styledFrame().find((row) => row.text.startsWith(prefix));
  expect(found, `a row starting with ${JSON.stringify(prefix)} in:\n${run.frame()}`).toBeDefined();
  return found!;
}

/** The cell under a text's column: `row.text[column]`, checked to be the glyph expected there so the index is never off by one. */
function cellAt(row: StyledRow, column: number, glyph: string) {
  expect([...row.text][column], `column ${column} of ${JSON.stringify(row.text)}`).toBe(glyph);
  return row.cells[column]!;
}

const AMBER = 179;
const GREEN = 114;
const RED = 167;
const CYAN = 74;
const HALF_BLOCKS = /[▀▄█]/;

/**
 * The banner, by its cells: seven rows of the pixel sheep with 256-colour
 * foregrounds and backgrounds on the half-block glyphs, the name bold amber
 * beside the third row, the line dim beside the fourth, and nothing else
 * in the first seven rows.
 */
function expectPixelBanner(run: StileRun): void {
  const rows = run.styledFrame().slice(0, 7);
  expect(rows).toHaveLength(7);
  let painted = 0;
  for (const row of rows) {
    const picture = [...row.text].slice(0, 36).join("");
    expect(picture, `a banner row holds glyphs that are not pixels: ${JSON.stringify(row.text)}`).toMatch(/^[▀▄█ ]*$/);
    for (const cell of row.cells.slice(0, 36)) {
      if (!HALF_BLOCKS.test(cell.ch)) continue;
      expect(cell.fgMode).toBe("p256");
      if (cell.bgMode === "p256") painted++;
    }
  }
  // The two-tone cells, a light pixel over a dark one, are where the picture has edges; a sheep has many.
  expect(painted).toBeGreaterThan(20);
  expect(rows[2]!.text.slice(37)).toBe("sheep");
  const name = cellAt(rows[2]!, 37, "s");
  expect(name).toMatchObject({ bold: true, fg: AMBER, fgMode: "p256" });
  expect(rows[3]!.text.slice(37)).toBe(TAGLINE);
  expect(cellAt(rows[3]!, 37, "a")).toMatchObject({ dim: true, bold: false, fg: null });
}

describe("the stile: journey 1, the first sitting", () => {
  it("walks the seven steps: two values typed at hidden prompts, one yes, two defaults, and nothing typed anywhere but the credentials", { timeout: 120_000 }, async () => {
    const w = await world({ ...fresh(), plan: "free" });
    const run = w.stile();

    // Step 1: the sheep and the checklist of seven; command filled in at once; the cursor on where, everywhere the default,
    // as the chosen row of a list with a description beside each answer; the key line on the last row.
    const start = screen(
      ["", command, cursor("where", "where should this machine keep its settings?"), chosen("everywhere on this machine", "~/.sheep, the usual answer"), other("this directory", ".sheep/ here, git-ignored"), later("account"), later("plan"), later("station"), later("key"), later("next")],
      KEYS.choose,
    );
    const first = await run.waitFor("› where");
    expect(body(first)).toEqual(start);
    expectPixelBanner(run);
    // The banner and the checklist fit 80 by 24 with no words open.
    expect(first.split("\n").length).toBeLessThanOrEqual(24);
    for (const row of first.split("\n")) expect([...row].length).toBeLessThanOrEqual(80);

    // `?` opens the step's words under it as a panel: the four things, what, where, cost, and what sheep does, with a rule
    // down the left. With them open the screen is full: the blank line under the grass and the key line give way.
    await run.press("?");
    expect(body(run.frame())).toEqual([
      command,
      cursor("where", "where should this machine keep its settings?", "? close"),
      `${IND}│ what   where this machine keeps its settings: everywhere on it,`,
      `${IND}│        or this directory alone.`,
      `${IND}│ where  everywhere puts them in ~/.sheep; this directory puts`,
      `${IND}│        them in .sheep/ here, git-ignored.`,
      `${IND}│ cost   nothing. Everywhere is the usual answer, and every`,
      `${IND}│        directory without its own falls back to it.`,
      `${IND}│ sheep  writes the skill your agent reads and, for this`,
      `${IND}│        directory, an empty .sheep/; nothing else.`,
      chosen("everywhere on this machine", "~/.sheep, the usual answer"),
      other("this directory", ".sheep/ here, git-ignored"),
      later("account"),
      later("plan"),
      later("station"),
      later("key"),
      later("next"),
    ]);
    // `?` again closes them: the frame is the first one again, exactly.
    await run.press("?");
    expect(body(run.frame())).toEqual(start);

    // Enter takes the default. Step 2: account, at a hidden prompt in a box, the address to make the token at under it.
    await run.press(ENTER);
    expect(body(await run.waitFor("› account"))).toEqual(
      screen(
        ["", command, done("where", "everywhere on this machine"), cursor("account", "the Cloudflare account your home lives on"), ...box("Cloudflare API token", ""), `${IND}made at dash.cloudflare.com/?to=/:account/api-tokens`, later("plan"), later("station"), later("key"), later("next")],
        KEYS.send,
      ),
    );
    await typeHidden(run, "Cloudflare API token", TOKEN);
    await run.press(ENTER);

    // The account's name; the plan not on, its page as a link under the row, and the one action as the chosen row, held
    // until Enter finds it on.
    expect(body(await run.waitFor("› plan"))).toEqual(
      screen(
        [
          "",
          command,
          done("where", "everywhere on this machine"),
          done("account", "Fake's Account"),
          cursor("plan", "Workers Paid, 5 USD a month, is not on this account yet"),
          `${IND}dash.cloudflare.com/${ACCOUNT.id}/workers/plans`,
          "",
          chosen("turned on at the dashboard; check again"),
          later("station"),
          later("key"),
          later("next"),
        ],
        KEYS.recheck,
      ),
    );
    // Enter with the account still Free: asked again, and nothing deployed.
    await run.press(ENTER);
    await run.waitFor("check again");
    expect(w.wrangler()).toEqual([]);
    // The shepherd turns the plan on at the dashboard and comes back to the same screen.
    w.state.plan = "workers_paid";
    await run.press(ENTER);

    // Step 3: station offers new, the name minted for the kennel, as the chosen row, and Enter takes it.
    expect(body(await run.waitFor("› station"))).toEqual(
      screen(
        [
          "",
          command,
          done("where", "everywhere on this machine"),
          done("account", "Fake's Account"),
          done("plan", "Workers Paid, 5 USD a month"),
          cursor("station", "which station should this machine's sheep live on?"),
          chosen("new sheep-2", "deploy a station on this account"),
          later("key"),
          later("next"),
        ],
        KEYS.choose,
      ),
    );
    await run.press(ENTER);
    // The deploy's stages appear under the step as it runs: the current one behind a spinner with the elapsed time, and the
    // key line says what the wait is.
    const deploying = await run.waitFor((text) => under(text, "station").some((line) => /^ {14}[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] deploying sheep-2 .* {2}\dm \d+s$/.test(line)), { whole: true });
    expect(deploying.split("\n").at(-1)).toBe("  the first container takes a minute or two   Ctrl-C leaves it deploying");
    expect(under(deploying, "station").some((line) => /^ {14}✓ /.test(line))).toBe(true);
    // The row while it works: the flow's line, and deploy's own lines are the stages under it, never the row.
    expect(deploying).toContain("\n  › station   deploying sheep-2 to Fake's Account\n");

    // Step 4: the step became the address; key at a hidden prompt, in the same box, where it goes said once under it.
    expect(body(await run.waitFor("› key"))).toEqual(
      screen(
        [
          "",
          command,
          done("where", "everywhere on this machine"),
          done("account", "Fake's Account"),
          done("plan", "Workers Paid, 5 USD a month"),
          done("station", "https://sheep-2.fake.workers.dev"),
          cursor("key", "the Anthropic key your sheep call the model with"),
          ...box("Anthropic API key", ""),
          `${IND}made at console.anthropic.com/settings/keys`,
          `${IND}kept in ~/.sheep/credentials and put on the home as its secret`,
          later("next"),
        ],
        KEYS.send,
      ),
    );
    await typeHidden(run, "Anthropic API key", KEY);
    await run.press(ENTER);

    const exit = await run.exited;
    expect(exit).toEqual({ code: 0, stderr: "" });
    // The finish: seven green rows, the three places things are, and the sentence to say in a box; nothing printed twice,
    // and nothing after the screen stopped.
    expect(body(timeless(run.buffer()))).toEqual([
      "",
      command,
      done("where", "everywhere on this machine"),
      done("account", "Fake's Account"),
      done("plan", "Workers Paid, 5 USD a month"),
      done("station", "https://sheep-2.fake.workers.dev"),
      done("key", "put on the home as its secret"),
      done("next", "done, in <time>"),
      "  credentials  ~/.sheep/credentials (mode 600, the two values and nothing else)",
      "  config       ~/.sheep/config",
      "  skill        ~/.agents/skills/sheep",
      "",
      ...finishBox,
    ]);
    expectWhole(run, SHEEP_TOP);
    expect(run.output().split(AGENT_SENTENCE).length - 1, "the sentence to say is on the screen once").toBe(1);
    expect(run.leaks()).toEqual([]);

    // The count, from the keys this ring pressed: two values typed, one yes (the plan re-checked on), two defaults (where,
    // station), no value asked twice — the plan's first Enter found it still Free, which is the account's answer, not a value.
    expect(promptsShown(run)).toEqual(new Set(["│ Cloudflare API token  ", "│ Anthropic API key  "]));

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
    expect(body(await run.waitFor("› station"))).toEqual(
      screen(
        [
          "",
          command,
          done("where", "everywhere on this machine"),
          done("account", "Fake's Account"),
          done("plan", "Workers Paid, 5 USD a month"),
          cursor("station", "which station should this machine's sheep live on?"),
          chosen("new sheep-2", "deploy a station on this account"),
          later("key"),
          later("next"),
        ],
        KEYS.choose,
      ),
    );
    await run.press(ENTER);
    expect(await run.exited).toEqual({ code: 0, stderr: "" });
    expect(run.output()).not.toContain("API token");
    expect(run.output()).not.toContain("API key");
    expect(run.buffer()).toContain(`${done("key", "put on the home as its secret")}\n`);
    // The key went with the deploy's own secrets, and no second put followed.
    expect(w.wrangler().map((call) => call.args.slice(0, 3).join(" ")).filter((call) => call.startsWith("secret put"))).toEqual(["secret put SHEEP_TOKEN", "secret put SHEEP_ANTHROPIC_API_KEY", "secret put PEN_CELL_ORIGIN"]);
    expect(run.leaks()).toEqual([]);

    expectWhole(run, SHEEP_TOP);
    // The finish's cells: the settled address cyan and underlined, the settled ticks green, the paths' labels dim, the
    // sentence to say bold in its box with its heading bold amber.
    const station = rowStarting(run, "  ✓ station");
    expect(cellAt(station, 2, "✓")).toMatchObject({ fg: GREEN, fgMode: "p256" });
    expect(cellAt(station, 14, "h")).toMatchObject({ fg: CYAN, fgMode: "p256", underline: true });
    expect(cellAt(rowStarting(run, "  credentials"), 2, "c")).toMatchObject({ dim: true });
    expect(cellAt(rowStarting(run, "  credentials"), 15, "~")).toMatchObject({ dim: false, fg: null });
    expect(cellAt(rowStarting(run, "  │ say to your agent"), 4, "s")).toMatchObject({ bold: true, fg: AMBER, fgMode: "p256" });
    expect(cellAt(rowStarting(run, `  │ ${AGENT_SENTENCE}`), 4, "s")).toMatchObject({ bold: true, fg: null });
    expect(cellAt(rowStarting(run, "  ╭"), 2, "╭")).toMatchObject({ dim: true });
  });

  it("asks again for a token the account rejects, with the account's reason in red under the row and the box back empty", { timeout: 90_000 }, async () => {
    const w = await world();
    const wrong = "cfWr0ngT0kenZq8Xv3Lm7Pn2Kd5Hs9Bj4";
    const run = w.stile([], [wrong]);
    await run.waitFor("› where");
    await run.press(ENTER);
    await run.waitFor("› account");
    await typeHidden(run, "Cloudflare API token", wrong);
    await run.press(ENTER);
    const again = await run.waitFor("Invalid API Token");
    expect(again).toContain(`${cursor("account", "the Cloudflare account your home lives on")}\n`);
    // The reason's first clause in red after the ✗; what it wants, dim, on two lines at most and cut; then the box, empty.
    const beneath = under(again, "account");
    expect(beneath[0]).toBe(`${IND}✗ the account token is not accepted: Invalid API Token (code 1000)`);
    expect(beneath[1]).toBe(`${IND}  it wants Workers Scripts (edit), Durable Objects (edit),`);
    expect(beneath[2]).toMatch(/^ {16}Containers \(edit\), .*…$/);
    expect(beneath.slice(3, 6)).toEqual(box("Cloudflare API token", ""));
    const refused = rowStarting(run, `${IND}✗`);
    expect(cellAt(refused, 14, "✗")).toMatchObject({ fg: RED, fgMode: "p256", dim: false });
    expect(cellAt(refused, 16, "t")).toMatchObject({ fg: RED, fgMode: "p256" });
    expect(cellAt(refused, 79, ")")).toMatchObject({ fg: RED, fgMode: "p256" });
    const wants = rowStarting(run, `${IND}  it wants`);
    expect(cellAt(wants, 16, "i")).toMatchObject({ dim: true, fg: null, bold: false });
    expect(cellAt(rowStarting(run, `${IND}  Containers`), 16, "C")).toMatchObject({ dim: true, fg: null });
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

describe("the stile: the keys a terminal sends", () => {
  it("moves the choice on an arrow in application mode (SS3) and under the kitty keyboard protocol, not only the legacy form", { timeout: 60_000 }, async () => {
    const w = await world();
    const run = w.stile();
    await run.waitFor("› where");
    const rows = () => under(run.frame(), "where").slice(0, 2);
    const everywhere = [chosen("everywhere on this machine", "~/.sheep, the usual answer"), other("this directory", ".sheep/ here, git-ignored")];
    const here = [other("everywhere on this machine", "~/.sheep, the usual answer"), chosen("this directory", ".sheep/ here, git-ignored")];
    expect(rows()).toEqual(everywhere);
    // vim-era application mode: ESC O B.
    await run.press(DOWN_SS3);
    expect(rows(), "an SS3 down arrow did not move the choice").toEqual(here);
    // The kitty keyboard protocol, which pi-tui negotiates and Ghostty answers: CSI 1 ; 1 B for a plain down arrow.
    await run.press(DOWN_KITTY);
    expect(rows(), "a kitty down arrow did not move the choice").toEqual(everywhere);
    await run.press(DOWN_KITTY);
    expect(rows()).toEqual(here);
    await run.press(UP_KITTY);
    expect(rows(), "a kitty up arrow did not move the choice").toEqual(everywhere);
    // A kitty key release, which the protocol reports too, is not a press: nothing moves.
    await run.press("\x1b[1;1:3B");
    expect(rows()).toEqual(everywhere);
    await run.press(DOWN);
    expect(rows()).toEqual(here);
    run.kill();
    await run.exited;
    expect(run.leaks()).toEqual([]);
  });
});

describe("the stile: the first frame and the install", () => {
  it("draws the sheep before the command step does anything, then the install behind the spinner with the clock while npm runs", { timeout: 60_000 }, async () => {
    // No sheep on PATH and a slow npm first on it: the command step installs, which takes a second and a half here.
    const w = await world(fresh(), { slowNpm: true, env: { SHEEP_TEST_INSTALL: "1" } });
    const run = w.stile();
    // The first frame, at once: the sheep, and the command row saying what it is doing, before the install runs.
    const first = await run.waitFor((text) => text.startsWith(`${SHEEP_TOP}\n`), { timeoutMs: SLOW_NPM_MS - 500 });
    expect(first).toContain("\n  › command   checking for sheep on PATH\n");
    // While npm runs: the install as a stage behind the spinner, with the elapsed time, under the row; a stage is cut to
    // the row with `…`, and the spec's tail is what goes.
    const installing = await run.waitFor((text) => under(text, "command").some((line) => /^ {14}[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] installing sheep \(npm install -g github:dglazkov\/sheep#.*…  \dm \d+s$/.test(line)), { timeoutMs: SLOW_NPM_MS - 500 });
    expect(installing).toContain("\n  › command   checking for sheep on PATH\n");
    expect(installing).not.toContain("› where");
    // Then the command step settles on the install, and the where step's choices follow.
    expect(await run.waitFor("› where")).toContain(`\n${done("command", "sheep, installed")}\n`);
    expect(existsSync(join(w.root, ".sheep"))).toBe(false);
    run.kill();
    await run.exited;
    expect(run.leaks()).toEqual([]);
  });
});

describe("the stile: the screen's colour", () => {
  it("paints the meanings and nothing else: the cursor step bold amber, a settled tick green, the chosen row's ❯ amber, the box and the panel dim, the rest plain", { timeout: 60_000 }, async () => {
    const w = await world();
    const run = w.stile();
    await run.waitFor("› where");
    // The settled step: its tick green, its name dim, its text plain.
    const settled = rowStarting(run, "  ✓ command");
    expect(cellAt(settled, 2, "✓")).toMatchObject({ fg: GREEN, fgMode: "p256", bold: false });
    expect(cellAt(settled, 4, "c")).toMatchObject({ dim: true, fg: null });
    expect(cellAt(settled, 14, "s")).toMatchObject({ dim: false, bold: false, fg: null });
    // The cursor step: its mark amber, its name bold amber, its question plain, its hint dim.
    const current = rowStarting(run, "  › where");
    expect(cellAt(current, 2, "›")).toMatchObject({ fg: AMBER, fgMode: "p256" });
    for (const [column, glyph] of [...Array.from("where").entries()]) expect(cellAt(current, 4 + column, glyph)).toMatchObject({ bold: true, fg: AMBER, fgMode: "p256" });
    expect(cellAt(current, 14, "w")).toMatchObject({ bold: false, fg: null });
    expect(cellAt(current, 71, "?")).toMatchObject({ dim: true });
    // The chosen row: `❯` amber and bold, the label bold, the description dim; the other row's label plain.
    const picked = rowStarting(run, `${IND}❯`);
    expect(cellAt(picked, 14, "❯")).toMatchObject({ fg: AMBER, fgMode: "p256", bold: true });
    expect(cellAt(picked, 16, "e")).toMatchObject({ bold: true, fg: null });
    expect(cellAt(picked, 46, "~")).toMatchObject({ dim: true, bold: false });
    const unpicked = rowStarting(run, `${IND}  this directory`);
    expect(cellAt(unpicked, 16, "t")).toMatchObject({ bold: false, dim: false, fg: null });
    expect(cellAt(unpicked, 46, ".")).toMatchObject({ dim: true });
    // The steps not reached and the key line: dim.
    expect(cellAt(rowStarting(run, "    account"), 4, "a")).toMatchObject({ dim: true, fg: null });
    expect(cellAt(rowStarting(run, "  ↑↓ choose"), 2, "↑")).toMatchObject({ dim: true });
    // The panel: its rule dim, its labels bold, its text plain.
    await run.press("?");
    const what = rowStarting(run, `${IND}│ what`);
    expect(cellAt(what, 14, "│")).toMatchObject({ dim: true });
    expect(cellAt(what, 16, "w")).toMatchObject({ bold: true });
    expect(cellAt(what, 23, "w")).toMatchObject({ bold: false, dim: false, fg: null });
    await run.press("?");
    // The box: its corners at the fourteenth column and the last, dim; the prompt dim; the dots and the caret amber.
    await run.press(ENTER);
    await run.waitFor("› account");
    expect(cellAt(rowStarting(run, `${IND}╭`), 14, "╭")).toMatchObject({ dim: true });
    expect(cellAt(rowStarting(run, `${IND}╭`), 79, "╮")).toMatchObject({ dim: true });
    expect(cellAt(rowStarting(run, `${IND}╰`), 79, "╯")).toMatchObject({ dim: true });
    const prompt = rowStarting(run, `${IND}│ Cloudflare`);
    expect(cellAt(prompt, 16, "C")).toMatchObject({ dim: true });
    expect(cellAt(prompt, 38, "▌")).toMatchObject({ fg: AMBER, fgMode: "p256" });
    await run.type(TOKEN.slice(0, 3));
    const typed = rowStarting(run, `${IND}│ Cloudflare`);
    expect(cellAt(typed, 38, "•")).toMatchObject({ fg: AMBER, fgMode: "p256" });
    expect(cellAt(typed, 41, "▌")).toMatchObject({ fg: AMBER, fgMode: "p256" });
    // The address under the box: a link, cyan and underlined, after a dim `made at`.
    const madeAt = rowStarting(run, `${IND}made at`);
    expect(cellAt(madeAt, 14, "m")).toMatchObject({ dim: true });
    expect(cellAt(madeAt, 22, "d")).toMatchObject({ fg: CYAN, fgMode: "p256", underline: true });
    run.kill();
    await run.exited;
    expect(run.leaks()).toEqual([]);
  });

  it("draws the same screen plain under NO_COLOR: no colour, no boldness, the line-art sheep, and ✓ › ❯ still carrying the meaning", { timeout: 60_000 }, async () => {
    const w = await world(fresh(), { env: { NO_COLOR: "1" } });
    // The account token kept, so the sitting reaches the key's box and the finish with one value typed.
    await w.keep({ cloudflare: TOKEN });
    const run = w.stile();
    const first = await run.waitFor("› where");
    const plainRows = (): void => {
      for (const row of run.styledFrame()) {
        for (const cell of row.cells) {
          expect(cell, `a cell of ${JSON.stringify(row.text)} is styled under NO_COLOR`).toMatchObject({ fg: null, bg: null, fgMode: "default", bgMode: "default", bold: false, dim: false, underline: false });
        }
      }
    };
    plainRows();
    // The line-art sheep, of the same size, where the picture cannot exist; not a pixel of the other.
    const banner = first.split("\n").slice(0, 7);
    for (const row of banner) expect(row).not.toMatch(HALF_BLOCKS);
    expect(banner[0]).toBe("     ,-.      ,-''-.,-''-.,-''-.");
    expect(banner[2]).toBe("   ( o   o )(   ~   ~   ~   ~    )   sheep");
    expect(banner[3]!.slice(37)).toBe(TAGLINE);
    expect(banner[6]).toBe("   ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁");
    // The rest is the same frame as with colour: the glyphs alone say which step is done, current, and chosen.
    expect(body(first)).toEqual(
      screen(
        ["", command, cursor("where", "where should this machine keep its settings?"), chosen("everywhere on this machine", "~/.sheep, the usual answer"), other("this directory", ".sheep/ here, git-ignored"), later("account"), later("plan"), later("station"), later("key"), later("next")],
        KEYS.choose,
      ),
    );
    await run.press("?");
    expect(run.frame()).toContain(`${IND}│ what   `);
    plainRows();
    await run.press("?");
    await run.press(ENTER);
    await run.waitFor("› station");
    plainRows();
    await run.press(ENTER);
    await run.waitFor("› key");
    expect(run.frame()).toContain(`${IND}╭${BOX_RULE}╮`);
    expect(run.frame()).toContain(`${IND}made at console.anthropic.com/settings/keys`);
    plainRows();
    await typeHidden(run, "Anthropic API key", KEY);
    plainRows();
    await run.press(ENTER);
    expect((await run.exited).code).toBe(0);
    // The finish, plain, with the line-art sheep whole at the top of the last frame.
    expectWhole(run, LINE_SHEEP_TOP);
    expect(run.frame()).toContain(`${done("station", "https://sheep-2.fake.workers.dev")}\n`);
    plainRows();
    // Nothing painted in the output either: pi-tui's own bare reset after each line is the one SGR left.
    expect(run.output()).not.toMatch(/\x1b\[(?!0m)[0-9;]+m/);
    expect(run.leaks()).toEqual([]);
  });

  it("decides its colour level from the environment alone: none under NO_COLOR or a dumb terminal, 256 through the seam or a 256-colour terminal, sixteen otherwise", () => {
    expect(colourLevel({ NO_COLOR: "1", COLORTERM: "truecolor", SHEEP_TEST_TERMINAL: "80x24" })).toBe("none");
    expect(colourLevel({ NO_COLOR: "" })).toBe("none");
    expect(colourLevel({ TERM: "dumb", COLORTERM: "truecolor" })).toBe("none");
    expect(colourLevel({ SHEEP_TEST_TERMINAL: "80x24", TERM: "xterm" })).toBe("256");
    expect(colourLevel({ COLORTERM: "truecolor", TERM: "xterm" })).toBe("256");
    expect(colourLevel({ COLORTERM: "24bit" })).toBe("256");
    expect(colourLevel({ TERM: "xterm-256color" })).toBe("256");
    expect(colourLevel({ TERM: "xterm" })).toBe("16");
    expect(colourLevel({})).toBe("16");
  });
});

/** The home's own token on the fake station a join finds: made of no word on any screen, and sharing no run of eight with either fake value. */
const STATION_TOKEN = "hT3wQ8zK5nV1pR7mX2cL9bJ4fD6gS0yA";

/**
 * A second laptop's world: the account already has `sheep`, deployed from the first, with its secrets and its join store
 * (the KV namespace `sheep-join`, empty), and the fake station is that Worker. `store: false` is a station from before stores.
 */
async function secondLaptop(options: { env?: Record<string, string>; joinLag?: number; worker?: string; store?: boolean; kvDeleteFails?: boolean } = {}) {
  const state = fresh();
  const worker = options.worker ?? "sheep";
  if (!state.workers.includes(worker)) state.workers.push(worker);
  state.secrets[worker] = ["SHEEP_TOKEN", "SHEEP_ANTHROPIC_API_KEY", "PEN_CELL_ORIGIN"];
  // Another namespace first, so the store is found by its title and not by being the only one.
  state.kv.push({ id: "kv-other-0000000000000000000000", title: "learner-cache", values: {} });
  if (options.store !== false) state.kv.push({ id: "kv-join-00000000000000000000000", title: `${worker}-join`, values: {} });
  state.kvDeleteFails = options.kvDeleteFails === true;
  const log: NonNullable<StationState["log"]> = [];
  const w = await world(state, { station: { token: STATION_TOKEN, worker, joinLag: options.joinLag ?? 1, log }, env: options.env });
  return { w, log };
}

/** The join token, as the station's log saw it on the one bearer a join carries: the only place the test can learn it. */
const joinTokenOf = (log: NonNullable<StationState["log"]>): string => {
  const bearers = [...new Set(log.filter((entry) => entry.path === "/join").map((entry) => entry.auth))];
  expect(bearers, "one bearer on every POST /join").toHaveLength(1);
  return bearers[0]!.slice("Bearer ".length);
};

const keyOf = (joinToken: string): string => `join:${createHash("sha256").update(joinToken).digest("hex")}`;

/** Every join key the fake account's stores hold now. */
const joinKeysIn = (w: World): string[] => w.state.kv.flatMap((namespace) => Object.keys(namespace.values).filter((key) => key.startsWith("join:")));

describe("the stile: journey 3, the second laptop", () => {
  it("lists the account's sheep homes after new, joins sheep: the key written, asked, and deleted in order, no wrangler call, the join token alone at the home, and no key asked", { timeout: 120_000 }, async () => {
    const { w, log } = await secondLaptop();
    const run = w.stile([], [STATION_TOKEN]);
    await run.waitFor("› where");
    await run.press(ENTER);
    await run.waitFor("› account");
    // account asks for the token, since this machine has never held one, and keeps it.
    await typeHidden(run, "Cloudflare API token", TOKEN);
    await run.press(ENTER);

    // station lists what the account already has: new sheep-2 first, then sheep, found because it answers as a sheep home,
    // each with what choosing it means. learner and sheep-pen are Workers on the account too, and answer as something else.
    expect(body(await run.waitFor("› station"))).toEqual(
      screen(
        [
          "",
          command,
          done("where", "everywhere on this machine"),
          done("account", "Fake's Account"),
          done("plan", "Workers Paid, 5 USD a month"),
          cursor("station", "which station should this machine's sheep live on?"),
          chosen("new sheep-2", "deploy a station on this account"),
          other("join sheep", "this account's station, joined"),
          later("key"),
          later("next"),
        ],
        KEYS.choose,
      ),
    );
    // The listing asked every Worker on the account at its address, with no bearer, and nothing else yet.
    expect(log.map((entry) => `${entry.method} ${entry.path} ${entry.auth ?? "(no bearer)"}`).sort()).toEqual(["GET / (no bearer)", "GET / (no bearer)", "GET / (no bearer)"]);
    expect(w.state.events).toEqual([]);
    await run.press(DOWN);
    expect(under(run.frame(), "station").slice(0, 2)).toEqual([other("new sheep-2", "deploy a station on this account"), chosen("join sheep", "this account's station, joined")]);
    expect(cellAt(rowStarting(run, `${IND}❯ join`), 14, "❯")).toMatchObject({ fg: AMBER, fgMode: "p256" });
    await run.press(ENTER);

    const exit = await run.exited;
    expect(exit).toEqual({ code: 0, stderr: "" });
    const joinToken = joinTokenOf(log);
    expect(joinToken).toMatch(/^[0-9a-f]{48}$/);
    const key = keyOf(joinToken);
    // The join, in order: the key written to sheep-join with its two-minute TTL; the ask before the write reached the edge,
    // refused; the ask after, answered, the home deleting the key it used; and the key deleted through the account API. After
    // it the store holds no join key, which is what the account ring reads from the account.
    expect(w.state.events).toEqual([`put ${key} ttl 120`, "ask 404", "ask 200", `delete ${key}`]);
    expect(joinKeysIn(w)).toEqual([]);
    const writes = w.state.requests.filter((request) => request.method !== "GET");
    expect(writes.map((request) => `${request.method} ${request.path}`)).toEqual([
      `PUT /accounts/${ACCOUNT.id}/storage/kv/namespaces/kv-join-00000000000000000000000/values/${encodeURIComponent(key)}`,
      `DELETE /accounts/${ACCOUNT.id}/storage/kv/namespaces/kv-join-00000000000000000000000/values/${encodeURIComponent(key)}`,
    ]);
    // Through the account API, with the account token in the header; no wrangler call, and so no Worker version (issue #10).
    for (const request of writes) expect(request.auth).toBe(`Bearer ${TOKEN}`);
    expect(w.wrangler()).toEqual([]);
    expect(w.state.secrets.sheep).toEqual(["SHEEP_TOKEN", "SHEEP_ANTHROPIC_API_KEY", "PEN_CELL_ORIGIN"]);

    // The finish: joined, the key the station's own, and the credentials holding the account token alone.
    await run.waitFor("say to your agent", { whole: true, timeoutMs: 5_000 });
    expect(body(timeless(run.buffer()))).toEqual([
      "",
      command,
      done("where", "everywhere on this machine"),
      done("account", "Fake's Account"),
      done("plan", "Workers Paid, 5 USD a month"),
      done("station", "https://sheep.fake.workers.dev, joined"),
      done("key", "the station holds its own; nothing asked"),
      done("next", "done, in <time>"),
      "  credentials  ~/.sheep/credentials (mode 600, the account token)",
      "  config       ~/.sheep/config",
      "  skill        ~/.agents/skills/sheep",
      "",
      ...finishBox,
    ]);
    expectWhole(run, SHEEP_TOP);
    // key asked nothing: one prompt in the whole sitting, the token's.
    expect(run.output()).not.toContain("API key");
    expect(promptsShown(run)).toEqual(new Set(["│ Cloudflare API token  "]));

    // The asks: both carried the join token and nothing else, the first while the write was still on its way to the edge.
    const joins = log.filter((entry) => entry.path === "/join");
    expect(joins.map((entry) => [entry.method, entry.keyed, entry.status])).toEqual([
      ["POST", true, 404],
      ["POST", true, 200],
    ]);
    // The account token never reaches the home: the fake station's log holds the join token alone as a bearer, never the
    // account token and never the home's own. And the store never held the token, only its hash.
    const bearers = new Set(log.map((entry) => entry.auth).filter((auth) => auth !== undefined));
    expect([...bearers]).toEqual([`Bearer ${joinToken}`]);
    expect(w.state.events.join("\n")).not.toContain(joinToken);

    // The config: the address and the home's token, no name, no local marker, mode 600, in ~/.sheep where `where` said.
    const configPath = `${w.root}/.sheep/config`;
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ home: "https://sheep.fake.workers.dev", token: STATION_TOKEN });
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    // The credentials: the account token, and no key, since none was asked.
    const credentials = `${w.root}/.sheep/credentials`;
    expect(JSON.parse(readFileSync(credentials, "utf8"))).toEqual({ cloudflare: TOKEN });

    // Nothing that crossed: the join token on no screen and in no file; the home's token in the config alone; the account
    // token in the credentials alone.
    expect(run.leaks()).toEqual([]);
    for (const piece of runsOf(joinToken)) {
      expect(run.buffer().includes(piece), "the join token on the screen").toBe(false);
      expect(run.output().includes(piece), "the join token in the output").toBe(false);
    }
    for (const path of filesUnder(w.root)) {
      const text = readFileSync(path, "latin1");
      expect(runsOf(joinToken).some((piece) => text.includes(piece)), `${path} holds the join token`).toBe(false);
      if (path !== configPath) expect(runsOf(STATION_TOKEN).some((piece) => text.includes(piece)), `${path} holds the home's token`).toBe(false);
      if (path !== credentials) expect(runsOf(TOKEN).some((piece) => text.includes(piece)), `${path} holds the account token`).toBe(false);
    }
  });

  it("keeps a long station name whole: the descriptions give way rather than the label, and the chosen row is still in sight", { timeout: 60_000 }, async () => {
    const long = "sheep-hermetic-0123456-a-long-station-name";
    const { w } = await secondLaptop({ worker: long });
    await w.keep({ cloudflare: TOKEN });
    const run = w.stile();
    await run.waitFor("› where");
    await run.press(ENTER);
    expect(under(await run.waitFor("› station"), "station").slice(0, 2)).toEqual([`${IND}❯ new sheep-2`, `${IND}  join ${long}`]);
    await run.press(DOWN);
    expect(under(run.frame(), "station").slice(0, 2)).toEqual([`${IND}  new sheep-2`, `${IND}❯ join ${long}`]);
    expect(run.frame()).not.toContain("deploy a station");
    await run.press(ENTER);
    expect((await run.exited).code).toBe(0);
    expect(JSON.parse(readFileSync(`${w.root}/.sheep/config`, "utf8"))).toEqual({ home: `https://${long}.fake.workers.dev`, token: STATION_TOKEN });
    expect(joinKeysIn(w)).toEqual([]);
  });

  it("deletes the join key when the home never answers the join, keeps nothing, and says so", { timeout: 60_000 }, async () => {
    const { w, log } = await secondLaptop({ joinLag: 1_000, env: { SHEEP_TEST_RETRY_MS: "5" } });
    await w.keep({ cloudflare: TOKEN });
    const run = w.stile();
    await run.waitFor("› where");
    await run.press(ENTER);
    await run.waitFor("› station");
    await run.press(DOWN);
    await run.press(ENTER);
    const exit = await run.exited;
    expect(exit.code).not.toBe(0);
    expect(exit.stderr).toContain("did not answer the join");
    expect(exit.stderr).toContain("nothing was kept");
    // Ninety asks, the whole budget, each refused; then the key the home never used deleted through the API, and none left.
    expect(log.filter((entry) => entry.path === "/join").length).toBe(90);
    const key = keyOf(joinTokenOf(log));
    expect(w.state.events[0]).toBe(`put ${key} ttl 120`);
    expect(w.state.events.at(-1)).toBe(`delete ${key}`);
    expect(joinKeysIn(w)).toEqual([]);
    expect(w.wrangler()).toEqual([]);
    expect(existsSync(`${w.root}/.sheep/config`)).toBe(false);
  });

  it("names the join key left in the store when its delete fails, and its TTL, after keeping what the home answered", { timeout: 60_000 }, async () => {
    const { w, log } = await secondLaptop({ joinLag: 1_000, env: { SHEEP_TEST_RETRY_MS: "5" }, kvDeleteFails: true });
    await w.keep({ cloudflare: TOKEN });
    const run = w.stile();
    await run.waitFor("› where");
    await run.press(ENTER);
    await run.waitFor("› station");
    await run.press(DOWN);
    await run.press(ENTER);
    const exit = await run.exited;
    expect(exit.code).not.toBe(0);
    expect(exit.stderr).toContain("did not answer the join");
    expect(exit.stderr).toContain("the join key is still in sheep-join (kv-join-00000000000000000000000) until it expires 120s after it was written");
    expect(exit.stderr).not.toContain(joinTokenOf(log));
    expect(joinKeysIn(w)).toEqual([keyOf(joinTokenOf(log))]);
  });

  it("refuses a station with no join store before writing anything or asking the home: its next deploy gives it one", { timeout: 60_000 }, async () => {
    const { w, log } = await secondLaptop({ store: false });
    await w.keep({ cloudflare: TOKEN });
    const run = w.stile();
    await run.waitFor("› where");
    await run.press(ENTER);
    await run.waitFor("› station");
    await run.press(DOWN);
    await run.press(ENTER);
    const exit = await run.exited;
    expect(exit.code).toBe(2);
    expect(exit.stderr).toContain("sheep has no join store (no KV namespace sheep-join on the account)");
    expect(exit.stderr).toContain("`sheep home deploy` from the machine that deployed it gives it one; nothing was written");
    expect(w.state.events).toEqual([]);
    expect(log.filter((entry) => entry.path === "/join")).toEqual([]);
    expect(existsSync(`${w.root}/.sheep/config`)).toBe(false);
  });
});

describe("the stile: where the settings go, and a station already there", () => {
  it("under a HOME reached through a symlink, is everywhere's sitting still: the station minted for ~/.sheep and the config shown under ~", { timeout: 90_000 }, async () => {
    const w = await world(fresh(), { linkedHome: true });
    await w.keep({ cloudflare: TOKEN, anthropic: KEY });
    const run = w.stile();
    expect(under(await run.waitFor("› where"), "where").slice(0, 2)).toEqual([chosen("everywhere on this machine", "~/.sheep, the usual answer"), other("this directory", ".sheep/ here, git-ignored")]);
    await run.press(ENTER);
    expect(under(await run.waitFor("› station"), "station")[0]).toBe(chosen("new sheep-2", "deploy a station on this account"));
    await run.press(ENTER);
    expect(await run.exited).toEqual({ code: 0, stderr: "" });
    expect(run.buffer()).toContain(`${done("station", "https://sheep-2.fake.workers.dev")}\n`);
    expect(run.buffer()).toContain("  credentials  ~/.sheep/credentials (mode 600, the two values and nothing else)\n  config       ~/.sheep/config\n");
  });

  it("makes this directory's kennel, with its own station named for the directory, when this directory is chosen", { timeout: 90_000 }, async () => {
    const w = await world();
    await w.keep({ cloudflare: TOKEN, anthropic: KEY });
    const run = w.stile();
    await run.waitFor("› where");
    await run.press(DOWN);
    expect(under(run.frame(), "where").slice(0, 2)).toEqual([other("everywhere on this machine", "~/.sheep, the usual answer"), chosen("this directory", ".sheep/ here, git-ignored")]);
    await run.press(ENTER);
    expect(await run.waitFor("› station")).toContain(`${done("where", "this directory")}\n`);
    expect(under(run.frame(), "station")[0]).toBe(chosen("new blog", "deploy a station on this account"));
    await run.press(ENTER);
    expect(await run.exited).toEqual({ code: 0, stderr: "" });
    expect(run.buffer()).toContain("  config       ~/blog/.sheep/config\n");
    expect(run.buffer()).toContain("  skill        ~/blog/.agents/skills/sheep\n");
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
    expect(run.buffer()).toContain(`${done("station", w.station)}\n${done("key", "the home holds its own; nothing asked")}\n`);
    expect(run.output()).not.toContain("API key");
    // Nothing redeployed and nothing put: the wrangler log is empty.
    expect(w.wrangler()).toEqual([]);
    expect(JSON.parse(readFileSync(join(w.root, ".sheep", "credentials"), "utf8"))).toEqual({ cloudflare: TOKEN });
  });
});

describe("the stile: the words", () => {
  it("--explain opens every step's words as it is reached, each at most eight lines, and each step's frame one screen with the banner still on it", { timeout: 120_000 }, async () => {
    const w = await world();
    const run = w.stile(["--explain"]);
    const seen: Record<string, string[]> = {};
    const read = async (step: string) => {
      const text = await run.waitFor(`› ${step}`);
      seen[step] = under(text, step);
      const rows = text.split("\n");
      expect(rows.length, `the ${step} frame is more than one screen:\n${text}`).toBeLessThanOrEqual(24);
      // One screen means nothing scrolled off: the banner's name and line are still on rows three and four.
      expect(rows[2]!.slice(37), `the ${step} frame scrolled the banner off:\n${text}`).toBe("sheep");
      expect(rows[3]!.slice(37)).toBe(TAGLINE);
      expect(text).toContain("? close");
      return text;
    };
    await read("where");
    await run.press(ENTER);
    await read("account");
    await typeHidden(run, "Cloudflare API token", TOKEN);
    await run.press(ENTER);
    await read("station");
    await run.press(ENTER);
    // The deploy with the words open: fewer stages kept, and still one screen.
    await run.waitFor((text) => under(text, "station").some((line) => /^ {14}[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /.test(line)) && text.split("\n")[2]!.slice(37) === "sheep");
    await read("key");
    await typeHidden(run, "Anthropic API key", KEY);
    await run.press(ENTER);
    expect((await run.exited).code).toBe(0);
    for (const [step, lines] of Object.entries(seen)) {
      // The panel's lines, and not the box's middle line, which also starts with the rule and ends with one.
      const panel = lines.filter((line) => line.startsWith(`${IND}│ `) && !line.endsWith("│"));
      expect(panel.length, `${step}'s words`).toBeGreaterThan(0);
      expect(panel.length, `${step}'s words are ${panel.length} lines`).toBeLessThanOrEqual(8);
      // The four things, in order, each labelled once.
      expect(panel.map((line) => line.slice(16, 22).trim()).filter(Boolean)).toEqual(["what", "where", "cost", "sheep"]);
      expect(lines[0]).toBe(panel[0]);
    }
    // A settled step is one line again: no words are left under a done row in the last frame.
    expect(run.buffer().split("\n").slice(-16).join("\n")).not.toContain("│ what");
  });

  it("gives every step all four things, non-empty, in at most eight lines of the panel at eighty columns, seven where a box or a link sits under them", () => {
    for (const step of STEPS) {
      for (const thing of THINGS) expect(WORDS[step][thing].trim().length, `${step}.${thing}`).toBeGreaterThan(10);
      const lines = wordsAt(step, 80);
      const most = step === "account" || step === "key" || step === "plan" ? 7 : 8;
      expect(lines.length, `${step}'s words wrap to ${lines.length} lines at 80:\n${lines.map((line) => `${line.label.padEnd(6)} ${line.text}`).join("\n")}`).toBeLessThanOrEqual(most);
      for (const line of lines) expect([...line.text].length, `${step}: ${line.text}`).toBeLessThanOrEqual(80 - 14 - 2 - 7);
      expect(lines.filter((line) => line.label !== "").map((line) => line.label)).toEqual(["what", "where", "cost", "sheep"]);
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
