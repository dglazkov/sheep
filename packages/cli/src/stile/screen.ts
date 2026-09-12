/**
 * The screen: the stile's three callbacks drawn with pi-tui (stile phase
 * 1).
 *
 * pi-tui's **main-screen** renderer, not its alternate screen, so the
 * flow scrolls like a checklist filling in and leaves its lines in the
 * scrollback when it ends. A small sheep, then the seven steps, one line
 * each: a done step is what it settled on, the cursor step is its prompt
 * and nothing else, and the steps after it are their names alone. `?`
 * opens the step's words under it and `?` again closes them; `--explain`
 * opens each step's words as the cursor reaches it.
 *
 * **Hidden input is never on screen.** A hidden prompt draws one `•` per
 * character and never the character, and nothing typed reaches the
 * component's state except the buffer it is read from. The command ring's
 * harness reads the terminal's buffer after every keystroke and asserts
 * that no byte of either value is in it; that is journey 1's third
 * criterion, and this is the code it is about.
 *
 * **The terminal seam.** `SHEEP_TEST_TERMINAL=<cols>x<rows>` makes the
 * flow treat its pipes as a terminal of that size: the renderer writes to
 * stdout and keys are read from stdin, exactly as through a
 * pseudo-terminal. It replaces the pseudo-terminal and nothing else, the
 * way `SHEEP_TEST_WRANGLER` replaces wrangler and not deploy — no step is
 * answered by it, no prompt is skipped, and the hiding still happens.
 */
import { type Component, ProcessTerminal, type Terminal, TuiMainScreen } from "@earendil-works/pi-tui";
import { Refusal } from "../deploy.js";
import { type Driver, type FlowOptions, type FlowReport, type Option, runFlow } from "./flow.js";
import { explain, type StepName, STEPS } from "./words.js";

/**
 * The sheep and the two lines beside it. A draft, and the shepherd's to
 * change; nothing reads it but the screen and the frame snapshots.
 */
export const BANNER = [
  "      __  _",
  "   ,-'  `' \\_          sheep",
  "  (  o   ) . _)        a home for coding agents that herd coding agents",
  "   `-.__.-'",
  "     ||  ||",
];

/** The mark at the left of a step: settled, the cursor, or not reached. */
const MARKS = { done: "✓", cursor: "›", waiting: " " } as const;

/** The widest step name plus its gutters: `  ✓ command   `, so every step's text starts in the same column. */
const NAME_WIDTH = 8;
const GUTTER = "  ";
/** The hint at the right of the cursor step's line, while its words are closed. */
const HINT_OPEN = "? explain";
const HINT_CLOSE = "? close";

/** How many of a step's progress lines are kept under it while it is the cursor; a deploy says more than this. */
const PROGRESS_LINES = 4;

/** The size the seam names, or nothing when it is not set. A malformed value is a refusal, not a guess. */
export function seamSize(): { columns: number; rows: number } | undefined {
  const seam = process.env.SHEEP_TEST_TERMINAL;
  if (seam === undefined || seam === "") return undefined;
  const parsed = /^\s*(\d+)\s*x\s*(\d+)\s*$/.exec(seam);
  if (parsed === null) throw new Refusal(`SHEEP_TEST_TERMINAL=${seam} is not <cols>x<rows>`);
  return { columns: Number(parsed[1]), rows: Number(parsed[2]) };
}

/**
 * Is there a terminal for the stile? The seam names one, or stdin and
 * stdout both are one. stdin alone is not enough: a screen that cannot be
 * drawn is not a screen.
 */
export function atTerminal(): boolean {
  if (seamSize() !== undefined) return true;
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * pi-tui's `Terminal` over this process's pipes, at the size the seam
 * names. It is `ProcessTerminal` without the parts a pipe has no answer
 * for: no raw mode (a pipe has none), no Kitty keyboard negotiation and
 * no bracketed paste (nothing would answer the query, and the bytes
 * would only confuse a reader of the stream), and a size that is given
 * rather than asked of the device.
 */
export class PipeTerminal implements Terminal {
  private handler: ((data: string) => void) | undefined;
  private readonly onData = (chunk: string | Buffer) => this.handler?.(typeof chunk === "string" ? chunk : chunk.toString("utf8"));

  constructor(private readonly size: { columns: number; rows: number }) {}

  start(onInput: (data: string) => void, _onResize: () => void): void {
    this.handler = onInput;
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", this.onData);
    process.stdin.resume();
  }

  stop(): void {
    process.stdin.off("data", this.onData);
    process.stdin.pause();
    this.handler = undefined;
  }

  async drainInput(): Promise<void> {}

  write(data: string): void {
    process.stdout.write(data);
  }

  get columns(): number {
    return this.size.columns;
  }

  get rows(): number {
    return this.size.rows;
  }

  get kittyProtocolActive(): boolean {
    return false;
  }

  moveBy(lines: number): void {
    if (lines > 0) this.write(`\x1b[${lines}B`);
    else if (lines < 0) this.write(`\x1b[${-lines}A`);
  }

  hideCursor(): void {
    this.write("\x1b[?25l");
  }

  showCursor(): void {
    this.write("\x1b[?25h");
  }

  clearLine(): void {
    this.write("\x1b[K");
  }

  clearFromCursor(): void {
    this.write("\x1b[J");
  }

  clearScreen(): void {
    this.write("\x1b[2J\x1b[H");
  }

  setTitle(_title: string): void {}

  setProgress(_active: boolean): void {}
}

/** How many dots a hidden prompt draws before it counts instead: a model key is a hundred characters, and the row is not. */
const HIDDEN_DOTS = 16;

/**
 * What a hidden prompt shows for `length` characters typed: a dot for
 * each, up to sixteen, and past that sixteen dots and the count. Never a
 * character of the value — only how many there are, which a person
 * watching their own keystrokes land needs to see.
 */
export function hiddenShown(length: number): string {
  return length <= HIDDEN_DOTS ? "•".repeat(length) : `${"•".repeat(HIDDEN_DOTS)} ${length}`;
}

/** What the cursor step is waiting for, if anything. */
type Waiting = { kind: "ask"; prompt: string; hidden: boolean; buffer: string } | { kind: "choose"; options: Option[]; at: number } | undefined;

/** Wrapping that does not break a word unless the word is wider than the line. */
function wrap(text: string, width: number): string[] {
  if (width < 1) return [text];
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
    while (line.length > width) {
      lines.push(line.slice(0, width));
      line = line.slice(width);
    }
  }
  if (line !== "") lines.push(line);
  return lines.length === 0 ? [""] : lines;
}

/** A step's words as the screen draws them at a width: the four things, wrapped, indented under the row. At most eight at eighty. */
export function wordsAt(step: StepName, width: number): string[] {
  return explain(step).flatMap((one) => wrap(one, Math.max(20, width - 6))).map((line) => `      ${line}`);
}

/**
 * The whole screen as one pi-tui component: the banner, the seven rows,
 * and under the cursor row its words when they are open and its progress
 * while a step is running. One component rather than seven, because the
 * checklist is one block whose rows are drawn in relation to each other.
 */
class Sheet implements Component {
  cursor: StepName = "command";
  /** The flow ended: every row is settled, and there is no cursor left to draw a prompt or a hint on. */
  finished = false;
  readonly lines = new Map<StepName, string>();
  readonly progress = new Map<StepName, string[]>();
  readonly open = new Set<StepName>();
  waiting: Waiting;

  /** Nothing is cached here: every render is drawn from the state above, so there is nothing to throw away. */
  invalidate(): void {}

  render(width: number): string[] {
    const out = [...BANNER, ""];
    const reached = this.finished ? STEPS.length : STEPS.indexOf(this.cursor);
    for (const step of STEPS) {
      const at = STEPS.indexOf(step);
      const mark = at < reached ? MARKS.done : at === reached ? MARKS.cursor : MARKS.waiting;
      // The last step, settled, is the one that keeps every line it said: its first on the row, the rest under it, wrapped
      // rather than cut, since a path or the sentence to say is no use with its end missing.
      const said = this.progress.get(step) ?? [];
      const last = this.finished && step === "next";
      const text = last ? (said[0] ?? "") : at === reached ? this.cursorText() : at < reached ? (this.lines.get(step) ?? "") : "";
      out.push(this.row(mark, step, text, at === reached, width));
      // The words are the cursor's alone: a done step is one line, what it settled on, whether or not its words were open.
      if (at === reached && this.open.has(step)) for (const line of wordsAt(step, width)) out.push(line);
      // While a step is the cursor, what it said is under it, wrapped: a deploy's progress, the plans page, the reason a
      // token was refused. A prompt does not hide them, since they are what the prompt is about.
      if (at === reached) for (const line of said.slice(-PROGRESS_LINES).flatMap((one) => wrap(one, Math.max(20, width - 6)))) out.push(`      ${line}`);
      if (last) for (const line of said.slice(1).flatMap((one) => wrap(one, Math.max(20, width - 14)))) out.push(`${" ".repeat(14)}${line}`);
    }
    return out;
  }

  /** The cursor row's text: its prompt, its options, or what it last said while it works. */
  private cursorText(): string {
    const waiting = this.waiting;
    // Working, with nothing asked: the row is the step's name alone, and what it says is under it.
    if (waiting === undefined) return "";
    if (waiting.kind === "ask") return `${waiting.prompt}: ${waiting.hidden ? hiddenShown(waiting.buffer.length) : waiting.buffer}`;
    return waiting.options.map((option, index) => (index === waiting.at ? `[${option.label}]` : option.label)).join("  ·  ");
  }

  private row(mark: string, step: StepName, text: string, isCursor: boolean, width: number): string {
    const left = `${GUTTER}${mark} ${step.padEnd(NAME_WIDTH)}${GUTTER}`;
    const hint = isCursor ? (this.open.has(step) ? HINT_CLOSE : HINT_OPEN) : "";
    const room = Math.max(0, width - left.length - (hint === "" ? 0 : hint.length + 5));
    const body = text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text;
    if (hint === "") return `${left}${body}`;
    return `${left}${body}${" ".repeat(Math.max(5, width - left.length - body.length - hint.length))}${hint}`;
  }
}

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

/**
 * The keys in one chunk of input. An escape sequence is one key. A
 * bracketed paste — which `ProcessTerminal` turns on, and which is how a
 * shepherd gives a token they copied from the dashboard — is its
 * characters, one at a time, with any line break in it dropped: a paste
 * is a value, and Enter is still the shepherd's to press. Anything else,
 * a pipe's chunk included, is its characters.
 */
export function keysOf(data: string): string[] {
  if (data.startsWith(PASTE_START)) {
    const end = data.indexOf(PASTE_END);
    const pasted = data.slice(PASTE_START.length, end === -1 ? undefined : end);
    return [...pasted.replace(/[\r\n]/g, "")];
  }
  if (data.startsWith("\x1b")) return [data];
  return [...data];
}

/**
 * The stile, drawn. Returns the flow's report; the screen is stopped
 * before it returns, whether the flow ended or threw, so a refusal is
 * printed under the last frame and not into it.
 */
export async function stile(options: Omit<FlowOptions, "driver"> & { explain?: boolean }): Promise<FlowReport> {
  const size = seamSize();
  const terminal: Terminal = size === undefined ? new ProcessTerminal() : new PipeTerminal(size);
  const tui = new TuiMainScreen(terminal);
  const sheet = new Sheet();
  tui.addChild(sheet);

  /** The one place a key is answered: whichever of ask and choose is waiting, plus `?` and Ctrl-C, which are always. */
  let answer: ((value: string) => void) | undefined;
  let refuse: ((error: Error) => void) | undefined;
  const draw = () => tui.requestRender();

  const toggle = () => {
    if (sheet.open.has(sheet.cursor)) sheet.open.delete(sheet.cursor);
    else sheet.open.add(sheet.cursor);
    draw();
  };

  tui.addInputListener((data) => {
    for (const key of keysOf(data)) {
      if (key === "\x03") {
        const stop = refuse;
        answer = undefined;
        refuse = undefined;
        if (stop !== undefined) {
          stop(new Refusal("setup was interrupted; nothing more was asked, and what was kept is kept"));
          continue;
        }
        // Working, with nothing asked (a deploy under way): raw mode made Ctrl-C a byte, so it is the signal it would have been.
        tui.stop();
        process.stderr.write("sheep: setup was interrupted while it was working; what was kept is kept, and `sheep setup` again picks up from there\n");
        process.exit(130);
      }
      const waiting = sheet.waiting;
      if (waiting === undefined) continue;
      if (waiting.kind === "ask") {
        // `?` opens the words only on an empty prompt: past the first character it is a character of the value, since a
        // value is not ours to edit. Backspace is either byte a terminal sends for it.
        if (key === "?" && waiting.buffer === "") {
          toggle();
          continue;
        }
        if (key === "\r" || key === "\n") {
          const value = waiting.buffer;
          const give = answer;
          sheet.waiting = undefined;
          answer = undefined;
          refuse = undefined;
          draw();
          give?.(value);
          continue;
        }
        if (key === "\x7f" || key === "\b") {
          waiting.buffer = waiting.buffer.slice(0, -1);
          draw();
          continue;
        }
        if (key >= " " && key !== "\x7f") {
          waiting.buffer += key;
          draw();
        }
        continue;
      }
      if (key === "?") {
        toggle();
        continue;
      }
      if (key === "\x1b[A" || key === "\x1b[D") {
        waiting.at = (waiting.at + waiting.options.length - 1) % waiting.options.length;
        draw();
        continue;
      }
      if (key === "\x1b[B" || key === "\x1b[C" || key === "\t") {
        waiting.at = (waiting.at + 1) % waiting.options.length;
        draw();
        continue;
      }
      if (key === "\r" || key === "\n") {
        const chosen = waiting.options[waiting.at]!.value;
        const give = answer;
        sheet.waiting = undefined;
        answer = undefined;
        refuse = undefined;
        draw();
        give?.(chosen);
      }
    }
    return { consume: true };
  });

  /** The cursor follows whichever step spoke last, and `--explain` opens the words of each as it is reached. */
  const reach = (step: StepName) => {
    if (sheet.cursor === step) return;
    sheet.cursor = step;
    sheet.progress.set(step, []);
    // Words opened on a step close when it settles; `--explain` opens the next step's as it is reached.
    sheet.open.clear();
    if (options.explain === true) sheet.open.add(step);
  };

  const driver: Driver = {
    say(step, line) {
      reach(step);
      sheet.lines.set(step, line);
      sheet.progress.set(step, [...(sheet.progress.get(step) ?? []), line]);
      draw();
    },
    ask(step, prompt, hidden) {
      reach(step);
      sheet.waiting = { kind: "ask", prompt, hidden, buffer: "" };
      draw();
      return new Promise<string>((resolveAsk, rejectAsk) => {
        answer = resolveAsk;
        refuse = rejectAsk;
      });
    },
    choose(step, choices) {
      reach(step);
      sheet.waiting = { kind: "choose", options: choices, at: 0 };
      draw();
      return new Promise<string>((resolveChoose, rejectChoose) => {
        answer = resolveChoose;
        refuse = rejectChoose;
      });
    },
  };

  tui.start();
  if (options.explain === true) sheet.open.add("command");
  try {
    const report = await runFlow({ ...options, driver });
    // The last step is settled, so the last frame shows seven done rows rather than six and a cursor.
    sheet.finished = true;
    sheet.waiting = undefined;
    sheet.open.clear();
    for (const step of STEPS) if (step !== "next") sheet.progress.delete(step);
    tui.renderNow();
    return report;
  } finally {
    tui.stop();
  }
}
