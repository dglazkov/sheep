/**
 * The screen harness (stile phase 1): a terminal the ring owns.
 *
 * The command is spawned with `SHEEP_TEST_TERMINAL=<cols>x<rows>`, which
 * makes it treat its pipes as a terminal of that size; its stdout is fed
 * into `@xterm/headless`, a real terminal emulator with no window; keys
 * are written to its stdin one at a time; and the emulator's buffer is
 * read back as text after each. Nothing here answers a step: every value
 * and every Enter comes from the test, as a person's fingers would, and
 * the seam replaces the pseudo-terminal and nothing else.
 *
 * **One harness for every ring.** The command ring's `stile.test.ts`
 * drives the checkout's command through this file, and `hermetic.mjs`
 * imports this same file from the checkout to drive a release's command
 * in the package and account rings (journey 4's criterion: the terminal a
 * ring drives the stile through is the same code in every ring). So the
 * file is written in the part of TypeScript that Node runs by erasing the
 * types — no enums, no parameter properties, no imports of local modules —
 * and resolves the emulator from beside itself.
 *
 * **The hidden-input check lives here.** `secrets` are the values the
 * caller will type. After every key the harness reads the whole buffer
 * (scrollback and viewport) and every byte the command has written, and
 * records any place where a run of eight characters of a secret appears.
 * Eight, because a single character of a token is in every word on the
 * screen, and eight of a token in a row is in none of them.
 *
 * **The attributes are read too** (the second cut, issue #9). `frame()`
 * and `buffer()` are text, which cannot see colour, so a styled screen
 * could lose its styling and every text assertion stay green. `styled()`
 * and `styledFrame()` read each cell's foreground and background, its
 * colour mode (the sixteen-colour palette, the 256-colour palette, RGB,
 * or the default), and its bold, dim, and underline bits from the
 * emulator, so a test can say which cells carry meaning by colour and
 * which carry none under `NO_COLOR`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type HeadlessTerminal = import("@xterm/headless").Terminal;
const { Terminal } = require("@xterm/headless") as typeof import("@xterm/headless");

/** How long output must be quiet before a key is said to have been answered. The renderer throttles to sixteen milliseconds. */
const QUIET_MS = 60;
/** The longest a key waits for the command to go quiet; a deploy says something at least this often. */
const KEY_WAIT_MS = 3_000;
/** How long `waitFor` waits by default: a deploy against the fakes takes a few seconds. */
const WAIT_MS = 30_000;
/** The run of a secret's characters that counts as a leak. */
export const LEAK_RUN = 8;

export interface StileOptions {
  /** The program and its arguments: `node bin/sheep.js setup`, or the installed `sheep setup`. */
  command: string;
  args: string[];
  cwd: string;
  /** The whole environment of the child. The harness adds `SHEEP_TEST_TERMINAL` and nothing else. */
  env: Record<string, string | undefined>;
  columns?: number;
  rows?: number;
  /** The values the caller will type; any run of `LEAK_RUN` of their characters in the buffer or the output is a leak. */
  secrets?: string[];
}

export interface Leak {
  /** Which secret, by position in `secrets`; never the secret. */
  secret: number;
  /** Where it was seen: the terminal's buffer or the raw output. */
  where: "buffer" | "output";
  /** How many keys had been pressed when it was seen. */
  after: number;
}

export interface Exit {
  code: number;
  stderr: string;
}

/** One cell of the emulator's buffer, with the attributes that carry meaning on the stile's screen. */
export interface StyledCell {
  ch: string;
  /** The foreground: a palette index or an RGB number by `fgMode`, or `null` for the terminal's default. */
  fg: number | null;
  fgMode: "default" | "p16" | "p256" | "rgb";
  bg: number | null;
  bgMode: "default" | "p16" | "p256" | "rgb";
  bold: boolean;
  dim: boolean;
  underline: boolean;
}

export interface StyledRow {
  /** The row as `frame` reads it: trailing spaces trimmed. */
  text: string;
  /** Every cell of the row, one per column, so `cells[i]` is the cell under `text[i]` while every glyph is one cell wide. */
  cells: StyledCell[];
}

/** `@xterm/headless`'s colour modes, as `getFgColorMode()` and `getBgColorMode()` number them. */
const MODE_P16 = 0x1000000;
const MODE_P256 = 0x2000000;
const MODE_RGB = 0x3000000;

function modeName(mode: number): StyledCell["fgMode"] {
  return mode === MODE_P16 ? "p16" : mode === MODE_P256 ? "p256" : mode === MODE_RGB ? "rgb" : "default";
}

const BLANK_CELL: StyledCell = { ch: "", fg: null, fgMode: "default", bg: null, bgMode: "default", bold: false, dim: false, underline: false };

/** A row of the emulator's buffer with its attributes, cell by cell. */
function styledRow(term: HeadlessTerminal, index: number, columns: number): StyledRow {
  const line = term.buffer.active.getLine(index);
  const cells: StyledCell[] = [];
  for (let x = 0; x < columns; x++) {
    const cell = line?.getCell(x);
    if (cell === undefined) {
      cells.push(BLANK_CELL);
      continue;
    }
    cells.push({
      ch: cell.getChars(),
      fg: cell.isFgDefault() ? null : cell.getFgColor(),
      fgMode: modeName(cell.getFgColorMode()),
      bg: cell.isBgDefault() ? null : cell.getBgColor(),
      bgMode: modeName(cell.getBgColorMode()),
      bold: cell.isBold() !== 0,
      dim: cell.isDim() !== 0,
      underline: cell.isUnderline() !== 0,
    });
  }
  return { text: rowText(term, index), cells };
}

export interface StileRun {
  /** The viewport as text: each row with its trailing spaces trimmed, and the empty rows after the last one dropped. */
  frame(): string;
  /** Every row the terminal holds, scrollback and viewport, as `frame` trims them. */
  buffer(): string;
  /** One row of the viewport with its attributes, `row` counted from the top of the viewport. */
  styled(row: number): StyledRow;
  /** The viewport's rows with their attributes, the empty rows after the last one with text dropped. */
  styledFrame(): StyledRow[];
  /** Every byte the command has written to stdout, escape sequences and all. */
  output(): string;
  /** One key, then the wait until the command has gone quiet and the emulator has taken what it wrote; then the leak check. */
  press(key: string): Promise<void>;
  /** A value, one key at a time, each a `press`; `onKey` is called after each with the number typed so far. */
  type(value: string, onKey?: (typed: number) => void | Promise<void>): Promise<void>;
  /** Waits until the frame (or the whole buffer, with `whole`) satisfies `match`, and returns it; throws with the last frame when it does not. */
  waitFor(match: string | RegExp | ((text: string) => boolean), options?: { timeoutMs?: number; whole?: boolean }): Promise<string>;
  /** Every leak recorded so far. Empty is the only acceptable answer. */
  leaks(): Leak[];
  /** How many keys have been pressed. */
  keys(): number;
  /** The command's exit, once it has one. */
  exited: Promise<Exit>;
  kill(): void;
}

/** A row of the emulator's buffer, as text. */
function rowText(term: HeadlessTerminal, index: number): string {
  return (term.buffer.active.getLine(index)?.translateToString(true) ?? "").replace(/\s+$/, "");
}

/** Rows as one string, the trailing empty ones dropped. */
function joinRows(rows: string[]): string {
  let end = rows.length;
  while (end > 0 && rows[end - 1] === "") end--;
  return rows.slice(0, end).join("\n");
}

/** Every run of `LEAK_RUN` consecutive characters of a value; a value shorter than that is its own one run. */
export function runsOf(value: string): string[] {
  if (value.length <= LEAK_RUN) return [value];
  const runs: string[] = [];
  for (let at = 0; at + LEAK_RUN <= value.length; at++) runs.push(value.slice(at, at + LEAK_RUN));
  return runs;
}

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export function driveStile(options: StileOptions): StileRun {
  const columns = options.columns ?? 80;
  const rows = options.rows ?? 24;
  const term = new Terminal({ cols: columns, rows, scrollback: 1000, allowProposedApi: true });
  const secrets = (options.secrets ?? []).filter((secret) => secret !== "");
  const runs = secrets.map(runsOf);
  const env = { ...options.env, SHEEP_TEST_TERMINAL: `${columns}x${rows}` };
  const child = spawn(options.command, options.args, { cwd: options.cwd, env, stdio: ["pipe", "pipe", "pipe"] });

  let raw = "";
  let lastOutput = Date.now();
  /** Writes into the emulator are asynchronous; this is the one that has not been taken yet. */
  let parsed: Promise<void> = Promise.resolve();
  const err: Buffer[] = [];
  const found: Leak[] = [];
  let pressed = 0;

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    raw += text;
    lastOutput = Date.now();
    parsed = parsed.then(() => new Promise<void>((resolveWrite) => term.write(text, () => resolveWrite())));
  });
  child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
  const exited = new Promise<Exit>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("close", (code, signal) => resolveExit({ code: code ?? (signal ? 1 : 0), stderr: Buffer.concat(err).toString("utf8") }));
  });
  let done = false;
  void exited.then(() => (done = true));

  const buffer = () => {
    const all: string[] = [];
    for (let index = 0; index < term.buffer.active.length; index++) all.push(rowText(term, index));
    return joinRows(all);
  };
  const frame = () => {
    const viewport: string[] = [];
    const top = term.buffer.active.viewportY;
    for (let index = 0; index < rows; index++) viewport.push(rowText(term, top + index));
    return joinRows(viewport);
  };

  const check = () => {
    const whole = buffer();
    runs.forEach((list, secret) => {
      if (list.some((run) => whole.includes(run))) found.push({ secret, where: "buffer", after: pressed });
      if (list.some((run) => raw.includes(run))) found.push({ secret, where: "output", after: pressed });
    });
  };

  const settle = async () => {
    const deadline = Date.now() + KEY_WAIT_MS;
    // At least one quiet interval after the key, so a render the key caused has had its sixteen milliseconds.
    await sleep(QUIET_MS);
    while (!done && Date.now() - lastOutput < QUIET_MS && Date.now() < deadline) await sleep(QUIET_MS / 3);
    await parsed;
  };

  const press = async (key: string) => {
    if (done) throw new Error(`the command has exited; ${JSON.stringify(key)} went nowhere`);
    child.stdin.write(key);
    pressed++;
    await settle();
    check();
  };

  const styled = (row: number): StyledRow => styledRow(term, term.buffer.active.viewportY + row, columns);
  const styledFrame = (): StyledRow[] => {
    const viewport: StyledRow[] = [];
    for (let index = 0; index < rows; index++) viewport.push(styled(index));
    let end = viewport.length;
    while (end > 0 && viewport[end - 1]!.text === "") end--;
    return viewport.slice(0, end);
  };

  return {
    frame,
    buffer,
    styled,
    styledFrame,
    output: () => raw,
    press,
    async type(value, onKey) {
      let typed = 0;
      for (const key of value) {
        await press(key);
        typed++;
        await onKey?.(typed);
      }
    },
    async waitFor(match, waitOptions = {}) {
      const deadline = Date.now() + (waitOptions.timeoutMs ?? WAIT_MS);
      const test = typeof match === "string" ? (text: string) => text.includes(match) : match instanceof RegExp ? (text: string) => match.test(text) : match;
      for (;;) {
        await parsed;
        const text = waitOptions.whole ? buffer() : frame();
        if (test(text)) {
          check();
          return text;
        }
        if (done || Date.now() >= deadline) {
          await parsed;
          const last = waitOptions.whole ? buffer() : frame();
          if (test(last)) return last;
          const stderr = Buffer.concat(err).toString("utf8");
          throw new Error(`the screen never showed ${String(match)}${done ? " (the command exited)" : ""}; the last frame:\n${last}${stderr ? `\n--- stderr ---\n${stderr}` : ""}`);
        }
        await sleep(25);
      }
    },
    leaks: () => {
      check();
      return [...found];
    },
    keys: () => pressed,
    exited,
    kill: () => {
      if (!done) child.kill("SIGKILL");
    },
  };
}

/** Enter, as a terminal sends it. */
export const ENTER = "\r";
/** The arrow keys, as a terminal without application mode sends them. */
export const DOWN = "\x1b[B";
export const UP = "\x1b[A";
