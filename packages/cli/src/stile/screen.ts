/**
 * The screen: the stile's three callbacks drawn with pi-tui (stile phase
 * 1; redrawn in the second cut, issue #9).
 *
 * pi-tui's **main-screen** renderer, not its alternate screen, so the
 * flow scrolls like a checklist filling in and leaves its lines in the
 * scrollback when it ends. The frames are the ones of
 * `docs/projects/stile/screen/mock.mjs`, matched to the cell: the sheep
 * in pixels beside its name, the seven steps, and under the cursor step a
 * vertical selector with `❯`, or a rounded box for a secret with the
 * address to make it at under the box, or the deploy's stages as green
 * ticks behind a spinner with the elapsed time; a refusal in red; `?`
 * opening the step's words as a panel with a rule down its left; the
 * finish with the sentence to say in a box; a dim key line on the last
 * row. Colour carries the state, at a level `paint.ts` decides; with none
 * the glyphs alone do.
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
 *
 * **What gives way.** The banner and the checklist fit 80 by 24 with
 * nothing open. When what is under the cursor fills the screen (the words
 * open on a step), the blank line under the grass goes first, then the
 * key line, then the line under a secret's box, and the deploy keeps
 * fewer of its ticks; the words themselves are held to eight lines (seven
 * on the steps that draw a box or a link under them), so a step with its
 * words open is still one screen.
 */
import { type Component, isKeyRelease, matchesKey, ProcessTerminal, type Terminal, TuiMainScreen } from "@earendil-works/pi-tui";
import { Refusal } from "../deploy.js";
import { AGENT_SENTENCE, type Driver, type FlowOptions, type FlowReport, type Option, runFlow, tilde } from "./flow.js";
import { colourLevel, Paint, padTo, width as widthOf } from "./paint.js";
import { sheep } from "./sheep.js";
import { explain, QUESTIONS, shown, type StepName, STEPS, UNDER_BOX } from "./words.js";

/** The line under the name in the banner. */
export const TAGLINE = "a home for agents that herd agents";

/** The widest step name plus its gutters: `  ✓ command   `, so every step's text starts in the same column. */
const NAME_WIDTH = 8;
/** The column everything under a step starts at: the width of `  ✓ command   `. */
const INDENT = 14;
const IND = " ".repeat(INDENT);
/** The hint at the right of the cursor step's line, while its words are closed and open. */
const HINT_OPEN = "? explain";
const HINT_CLOSE = "? close";
/** The fewest spaces between the cursor row's text and its hint. */
const HINT_GAP = 2;

/** How many of a deploy's stages are kept under the step at most: the current one and three ticks above it. */
const STAGES_KEPT = 4;
/** The banner's rows and the checklist's: what is on screen before anything is under a step. */
const FIXED_ROWS = 7 + STEPS.length;

const SPINNER = [..."⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"];
const SPINNER_MS = 80;

/** The key line's parts, as the step allows. */
const KEYS = { choose: "↑↓ choose   Enter take", recheck: "Enter check again", send: "Enter send", leave: "Ctrl-C leave", deploying: "the first container takes a minute or two   Ctrl-C leaves it deploying" };

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

/** What a step said while it was the cursor: a line of progress, or the reason a value is asked for again. */
interface Said {
  text: string;
  refused: boolean;
}

/** What the cursor step is waiting for, if anything. */
type Waiting = { kind: "ask"; prompt: string; hidden: boolean; buffer: string } | { kind: "choose"; options: Option[]; at: number; first: number } | undefined;

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

/** `text` cut to `room` cells with `…` at the end where it was longer. Plain text only. */
function fit(text: string, room: number): string {
  const chars = [...text];
  if (chars.length <= room) return text;
  return `${chars.slice(0, Math.max(0, room - 1)).join("")}…`;
}

/** A path as lines that never break inside a segment: whole on one line, else its segments packed at `/` to `room`. */
function pathLines(path: string, room: number): string[] {
  if (path.length <= room) return [path];
  const pieces = path.split(/(?<=\/)/);
  const lines: string[] = [];
  let line = "";
  for (const piece of pieces) {
    if (line !== "" && line.length + piece.length > room) {
      lines.push(line);
      line = "";
    }
    line += piece;
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** The line up to its first `:` or `,`: what a stage is about. A stage that says the same thing again replaces the last. */
const stageKey = (text: string): string => text.split(/[:,]/)[0]!;

/** Minutes and seconds since `since`, as `1m 12s`. */
function elapsed(since: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** The text room the panel wraps to at a width: the indent, the rule, the label, and a space. */
const PANEL_ROOM = (width: number): number => Math.max(20, width - INDENT - 2 - 7);

/**
 * A step's words as the panel draws them at a width: the four things,
 * each wrapped to the panel, its label on the first line and blank on the
 * rest. At most eight at eighty; seven on the steps that draw a box or a
 * link under them (the words' rule, held by the command ring).
 */
export function wordsAt(step: StepName, width: number): { label: string; text: string }[] {
  return explain(step).flatMap(({ label, text }) => wrap(text, PANEL_ROOM(width)).map((line, index) => ({ label: index === 0 ? label : "", text: line })));
}

/**
 * The whole screen as one pi-tui component: the banner, the seven rows,
 * and under the cursor row its words when they are open, what it waits
 * for, or its progress while it works; then the finish. One component
 * rather than seven, because the checklist is one block whose rows are
 * drawn in relation to each other, and the key line's row depends on all
 * of them.
 */
class Sheet implements Component {
  cursor: StepName = "command";
  /** The flow ended: every row is settled, and the finish is drawn from the report. */
  finished = false;
  report: FlowReport | undefined;
  /** What each step settled on: the last line it said that was not a refusal. */
  readonly settled = new Map<StepName, string>();
  /** What each step said while it was the cursor, since it was reached. */
  readonly said = new Map<StepName, Said[]>();
  readonly open = new Set<StepName>();
  waiting: Waiting;
  /** The station step's choice was a join, so what it says under the row is not a deploy's stages. */
  joining = false;
  /** When the cursor step was reached, for the elapsed time beside a stage; and when the sitting started, for the finish. */
  reachedAt = Date.now();
  readonly startedAt = Date.now();
  /** The spinner's frame, advanced by the timer while a stage runs. */
  tick = 0;

  constructor(
    private readonly paint: Paint,
    private readonly terminal: Terminal,
  ) {}

  /** Nothing is cached here: every render is drawn from the state above, so there is nothing to throw away. */
  invalidate(): void {}

  /** The progress lines the cursor step said, the row's own first line excluded: a deploy's stages, the plan's page. */
  stages(): string[] {
    return (this.said.get(this.cursor) ?? []).filter((one) => !one.refused).map((one) => one.text).slice(1);
  }

  /** A stage is running: the cursor step is working, with nothing asked, and has said what it is doing. */
  working(): boolean {
    return !this.finished && this.waiting === undefined && this.stages().length > 0;
  }

  render(width: number): string[] {
    const out = [...this.banner(), ""];
    const reached = this.finished ? STEPS.length : STEPS.indexOf(this.cursor);
    const panel = this.open.has(this.cursor) && !this.finished ? this.panel(width) : [];
    for (const step of STEPS) {
      const at = STEPS.indexOf(step);
      if (at < reached) out.push(this.doneRow(step, this.finished && step === "next" ? `done, in ${elapsed(this.startedAt)}` : (this.settled.get(step) ?? "")));
      else if (at === reached) {
        out.push(this.cursorRow(step, width));
        out.push(...panel);
        out.push(...this.under(step, width, panel.length));
      } else out.push(`    ${this.paint.dim(step.padEnd(NAME_WIDTH))}`);
    }
    if (this.finished) {
      // The finish is the last thing on screen, and the newline that puts the prompt under it takes one row: a finish
      // that fills the screen would scroll the top of the sheep into the scrollback. So it is drawn one row short, giving
      // up the blank line after the seven rows first and the one before the box next; at 80 by 24 the first is enough.
      const finish = this.finish(width);
      while (out.length + finish.length > this.terminal.rows - 1) {
        const blank = finish.indexOf("");
        if (blank === -1) break;
        finish.splice(blank, 1);
      }
      return out.concat(finish).map((line) => this.guard(line, width));
    }
    // The key line sits on the last row of the viewport. When what is under the cursor fills the screen, the blank line
    // under the grass gives way first, then the key line itself, until the words close.
    const foot = this.keyLine();
    const rows = this.terminal.rows;
    if (out.length + (foot === undefined ? 0 : 1) > rows) out.splice(7, 1);
    if (foot !== undefined && out.length + 1 <= rows) {
      while (out.length < rows - 1) out.push("");
      out.push(foot);
    }
    return out.map((line) => this.guard(line, width));
  }

  /** pi-tui refuses a line wider than the terminal; nothing here should make one, and this is the guard that says so quietly. */
  private guard(line: string, width: number): string {
    if (widthOf(line) <= width) return line;
    // A styled line over the width is a bug in the drawing above; cut its plain text rather than crash the sitting.
    return fit(line.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, ""), width);
  }

  /** Seven rows: the sheep, and beside it the name in bold amber with the dim line under it. The grass is the rule. */
  private banner(): string[] {
    const title = ["", "", this.paint.boldAmber("sheep"), this.paint.dim(TAGLINE), "", "", ""];
    return sheep(this.paint).map((row, index) => ` ${row} ${title[index]}`.trimEnd());
  }

  /** A settled step: green tick, dim name, and what it settled on, an address drawn as a link. */
  private doneRow(step: StepName, text: string): string {
    const address = /^(https?:\/\/\S+)(.*)$/.exec(text);
    const styled = address === null ? text : `${this.paint.link(address[1]!)}${address[2]}`;
    return `  ${this.paint.green("✓")} ${this.paint.dim(step.padEnd(NAME_WIDTH))}  ${styled}`;
  }

  /** The cursor row: amber mark and bold amber name, the step's question or its first line, and the hint at the right while it waits. */
  private cursorRow(step: StepName, width: number): string {
    const hint = this.waiting === undefined ? undefined : this.open.has(step) ? HINT_CLOSE : HINT_OPEN;
    const first = (this.said.get(step) ?? []).find((one) => !one.refused)?.text;
    const room = width - INDENT - (hint === undefined ? 0 : HINT_GAP + hint.length);
    const text = fit(first ?? QUESTIONS[step], Math.max(1, room));
    const left = `  ${this.paint.amber("›")} ${this.paint.boldAmber(step.padEnd(NAME_WIDTH))}  ${text}`;
    if (hint === undefined) return left;
    return `${left}${" ".repeat(Math.max(HINT_GAP, width - widthOf(left) - hint.length))}${this.paint.dim(hint)}`;
  }

  /** The words as a panel: a dim rule down the left, the four labels bold, each thing wrapped to the panel. */
  private panel(width: number): string[] {
    return wordsAt(this.cursor, width).map(({ label, text }) => `${IND}${this.paint.dim("│ ")}${this.paint.bold(label.padEnd(6))} ${text}`);
  }

  /** What is under the cursor row: a refusal and the box, the list, or the stages. */
  private under(step: StepName, width: number, panelRows: number): string[] {
    const waiting = this.waiting;
    const out: string[] = [];
    if (waiting?.kind === "ask") {
      const refused = [...(this.said.get(step) ?? [])].reverse().find((one) => one.refused);
      if (refused !== undefined) {
        // The reason: `✗` and its first clause (up to the first `;`, or the whole line) in red, and the rest, if any, dim on at
        // most two lines under it, cut with `…` beyond; the permissions and the address it names are in the step's words too.
        // With the words open there is less room above the box, and the dim lines are the ones that give way.
        const room = Math.max(0, this.terminal.rows - FIXED_ROWS - panelRows - 3 - (this.open.has(step) ? 0 : 1) - 1);
        const at = refused.text.indexOf(";");
        const head = at === -1 ? refused.text : refused.text.slice(0, at);
        const rest = at === -1 ? "" : refused.text.slice(at + 1).trim();
        out.push(`${IND}${this.paint.red(`✗ ${fit(head, width - INDENT - 2)}`)}`);
        const most = Math.min(2, room);
        if (rest !== "" && most > 0) {
          const lines = wrap(rest, width - INDENT - 2);
          const kept = lines.length > most ? [...lines.slice(0, most - 1), fit(lines.slice(most - 1).join(" "), width - INDENT - 2)] : lines;
          out.push(...kept.map((line) => `${IND}  ${this.paint.dim(line)}`));
        }
      }
      out.push(...this.box(waiting, width));
      // The address to make the value at, said once under the box; the words say it too, and the screen is one row short
      // with them open, so it is theirs then.
      if (!this.open.has(step) && (step === "account" || step === "key")) {
        const { madeAt, note } = UNDER_BOX[step];
        out.push(`${IND}${this.paint.dim("made at ")}${this.paint.link(shown(madeAt), madeAt)}`);
        if (note !== undefined) out.push(`${IND}${this.paint.dim(fit(note, width - INDENT))}`);
      }
      return out;
    }
    if (waiting?.kind === "choose") {
      // The plan not on the account: its page as a link under the row, then the one action as the chosen row.
      const extra = this.stages();
      for (const line of extra) {
        if (/^https?:\/\/\S+$/.test(line)) {
          const prefix = "turn it on at ";
          const link = this.paint.link(shown(line), line);
          out.push(INDENT + prefix.length + shown(line).length <= width ? `${IND}${this.paint.dim(prefix)}${link}` : `${IND}${link}`);
        } else out.push(`${IND}${this.paint.dim(fit(line, width - INDENT))}`);
      }
      if (extra.length > 0) out.push("");
      out.push(...this.list(waiting, width, panelRows));
      return out;
    }
    if (!this.finished) {
      // Working: the stages said so far as green ticks, the current one behind the spinner with the elapsed time. Fewer are
      // kept when the words are open, so the step stays on one screen.
      const keep = Math.max(1, Math.min(STAGES_KEPT, this.terminal.rows - FIXED_ROWS - panelRows));
      const stages = this.stages().slice(-keep);
      stages.forEach((text, index) => {
        if (index < stages.length - 1) out.push(`${IND}${this.paint.green("✓")} ${fit(text, width - INDENT - 2)}`);
        else {
          const time = elapsed(this.reachedAt);
          out.push(`${IND}${this.paint.amber(SPINNER[this.tick % SPINNER.length]!)} ${fit(text, width - INDENT - 2 - 2 - time.length)}  ${this.paint.dim(time)}`);
        }
      });
    }
    return out;
  }

  /** A secret's box: rounded, the prompt dim inside, a dot per character in amber, the count past sixteen dim, an amber caret. */
  private box(waiting: Waiting & { kind: "ask" }, width: number): string[] {
    const outer = Math.max(10, width - INDENT - 2);
    const inner = outer - 2;
    const typed = waiting.buffer.length;
    let content = "";
    for (let dots = waiting.hidden ? Math.min(typed, HIDDEN_DOTS) : 0; ; dots--) {
      const count = waiting.hidden && typed > HIDDEN_DOTS ? ` ${this.paint.dim(String(typed))}` : "";
      const value = waiting.hidden ? this.paint.amber("•".repeat(dots)) : this.paint.amber(waiting.buffer);
      content = `${this.paint.dim(waiting.prompt)}  ${value}${count}${this.paint.amber("▌")}`;
      if (widthOf(content) <= inner || dots <= 0) break;
    }
    const rule = "─".repeat(outer);
    return [`${IND}${this.paint.dim(`╭${rule}╮`)}`, `${IND}${this.paint.dim("│")} ${padTo(content, inner)} ${this.paint.dim("│")}`, `${IND}${this.paint.dim(`╰${rule}╯`)}`];
  }

  /**
   * The options as a vertical list at the indent: `❯` and bold on the
   * chosen row, a dim description beside each label where they all fit,
   * the labels alone where they do not. More options than the screen has
   * rows for are a window that always holds the chosen one, with a dim
   * `↑ n more` or `↓ n more` where the rest are, so an arrow key never
   * moves the choice out of sight.
   */
  private list(waiting: Waiting & { kind: "choose" }, width: number, panelRows: number): string[] {
    const labels = waiting.options.map((option) => option.label);
    const descriptions = waiting.options.map((option) => option.description ?? "");
    const longest = Math.max(...labels.map((label) => [...label].length));
    const widest = Math.max(...descriptions.map((description) => [...description].length));
    let labelWidth = Math.max(30, longest + 2);
    const withDescriptions = widest > 0 && INDENT + 2 + labelWidth + widest <= width;
    if (!withDescriptions) labelWidth = longest;
    const rowOf = (index: number): string => {
      const label = fit(labels[index]!, width - INDENT - 2);
      const description = withDescriptions ? this.paint.dim(descriptions[index]!) : "";
      const chosen = index === waiting.at;
      return `${IND}${chosen ? this.paint.boldAmber("❯ ") : "  "}${chosen ? this.paint.bold(padTo(label, labelWidth)) : padTo(label, labelWidth)}${description}`.trimEnd();
    };
    const count = waiting.options.length;
    const size = Math.max(3, this.terminal.rows - FIXED_ROWS - panelRows);
    if (count <= size) return waiting.options.map((_option, index) => rowOf(index));
    // The window: a marker row at either end where more are, and the chosen row always inside.
    let first = Math.min(Math.max(0, waiting.first), count - size);
    const visibleFrom = () => first + (first > 0 ? 1 : 0);
    const visibleTo = () => first + size - 1 - (first + size < count ? 1 : 0);
    while (waiting.at < visibleFrom() && first > 0) first--;
    while (waiting.at > visibleTo() && first + size < count) first++;
    waiting.first = first;
    const out: string[] = [];
    for (let index = first; index < Math.min(count, first + size); index++) {
      if (index === first && first > 0) out.push(`${IND}  ${this.paint.dim(`↑ ${first} more`)}`);
      else if (index === first + size - 1 && first + size < count) out.push(`${IND}  ${this.paint.dim(`↓ ${count - index} more`)}`);
      else out.push(rowOf(index));
    }
    return out;
  }

  /** The dim key line for the last row, as the step allows; nothing while a step works on something other than a deploy. */
  private keyLine(): string | undefined {
    const hint = this.open.has(this.cursor) ? HINT_CLOSE : HINT_OPEN;
    const waiting = this.waiting;
    let text: string | undefined;
    if (waiting?.kind === "choose") text = `${this.cursor === "plan" ? KEYS.recheck : KEYS.choose}   ${hint}   ${KEYS.leave}`;
    else if (waiting?.kind === "ask") text = `${KEYS.send}   ${hint}   ${KEYS.leave}`;
    else if (this.cursor === "station" && !this.joining && this.working()) text = KEYS.deploying;
    return text === undefined ? undefined : `  ${this.paint.dim(text)}`;
  }

  /** After the seven green rows: where things are, and the sentence to say in a box across the screen. */
  private finish(width: number): string[] {
    const report = this.report;
    if (report === undefined) return [];
    const out: string[] = [""];
    const labelled = (label: string, path: string, note?: string): void => {
      const lines = pathLines(path, Math.max(10, width - 15));
      lines.forEach((line, index) => {
        const head = index === 0 ? `  ${this.paint.dim(label.padEnd(11))}  ` : " ".repeat(15);
        const tail = index === lines.length - 1 && note !== undefined && 15 + line.length + 1 + note.length <= width ? ` ${this.paint.dim(note)}` : "";
        out.push(`${head}${line}${tail}`);
      });
    };
    labelled("credentials", tilde(report.credentials), report.key === "left" ? "(mode 600, the account token)" : "(mode 600, the two values and nothing else)");
    labelled("config", tilde(report.config));
    labelled("skill", "checkout" in report.skill ? "from this checkout" : tilde(report.skill.path));
    out.push("");
    const outer = Math.max(10, width - 4);
    const inner = outer - 2;
    const rule = "─".repeat(outer);
    out.push(`  ${this.paint.dim(`╭${rule}╮`)}`);
    out.push(`  ${this.paint.dim("│")} ${padTo(this.paint.boldAmber("say to your agent"), inner)} ${this.paint.dim("│")}`);
    for (const line of wrap(AGENT_SENTENCE, inner)) out.push(`  ${this.paint.dim("│")} ${padTo(this.paint.bold(line), inner)} ${this.paint.dim("│")}`);
    out.push(`  ${this.paint.dim(`╰${rule}╯`)}`);
    return out;
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
  const sheet = new Sheet(new Paint(colourLevel()), terminal);
  tui.addChild(sheet);

  /** The one place a key is answered: whichever of ask and choose is waiting, plus `?` and Ctrl-C, which are always. */
  let answer: ((value: string) => void) | undefined;
  let refuse: ((error: Error) => void) | undefined;

  /**
   * The spinner's timer: running while a stage runs, so the frame advances and the elapsed time counts, and stopped the
   * moment the step waits or settles. Unreferenced, so it never keeps the process alive at the end.
   */
  let timer: NodeJS.Timeout | undefined;
  const sync = () => {
    if (sheet.working() && timer === undefined) {
      timer = setInterval(() => {
        sheet.tick++;
        tui.requestRender();
      }, SPINNER_MS);
      timer.unref();
    } else if (!sheet.working() && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  const draw = () => {
    sync();
    tui.requestRender();
  };

  const toggle = () => {
    if (sheet.open.has(sheet.cursor)) sheet.open.delete(sheet.cursor);
    else sheet.open.add(sheet.cursor);
    draw();
  };

  // The keys are matched by name, not by byte (issue #9's walk): pi-tui's `ProcessTerminal` negotiates the kitty keyboard
  // protocol, and a terminal that answers (Ghostty) sends a plain down arrow as `CSI 1 ; 1 B`, a vim-era one sends `ESC O B`,
  // and the harness sends `CSI B`; `matchesKey` knows all three. The protocol reports releases too, and a release is not a
  // press.
  tui.addInputListener((data) => {
    for (const key of keysOf(data)) {
      if (isKeyRelease(key)) continue;
      if (key === "\x03" || matchesKey(key, "ctrl+c")) {
        const stop = refuse;
        answer = undefined;
        refuse = undefined;
        if (stop !== undefined) {
          stop(new Refusal("setup was interrupted; nothing more was asked, and what was kept is kept"));
          continue;
        }
        // Working, with nothing asked (a deploy under way): raw mode made Ctrl-C a byte, so it is the signal it would have been.
        if (timer !== undefined) clearInterval(timer);
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
        if (matchesKey(key, "enter")) {
          const value = waiting.buffer;
          const give = answer;
          sheet.waiting = undefined;
          answer = undefined;
          refuse = undefined;
          draw();
          give?.(value);
          continue;
        }
        if (key === "\x7f" || key === "\b" || matchesKey(key, "backspace")) {
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
      if (matchesKey(key, "up") || matchesKey(key, "left")) {
        waiting.at = (waiting.at + waiting.options.length - 1) % waiting.options.length;
        draw();
        continue;
      }
      if (matchesKey(key, "down") || matchesKey(key, "right") || matchesKey(key, "tab")) {
        waiting.at = (waiting.at + 1) % waiting.options.length;
        draw();
        continue;
      }
      if (matchesKey(key, "enter")) {
        const chosen = waiting.options[waiting.at]!.value;
        if (sheet.cursor === "station") sheet.joining = chosen.startsWith("join:");
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
    sheet.said.set(step, []);
    sheet.reachedAt = Date.now();
    // Words opened on a step close when it settles; `--explain` opens the next step's as it is reached.
    sheet.open.clear();
    if (options.explain === true) sheet.open.add(step);
  };

  const driver: Driver = {
    say(step, line, tone) {
      reach(step);
      const said = sheet.said.get(step) ?? [];
      const last = said.at(-1);
      if (tone === "refused") said.push({ text: line, refused: true });
      else {
        sheet.settled.set(step, line);
        // A stage that says the same thing again (a rollout's counts) replaces its line rather than stacking.
        if (last !== undefined && !last.refused && stageKey(last.text) === stageKey(line)) said[said.length - 1] = { text: line, refused: false };
        else said.push({ text: line, refused: false });
      }
      sheet.said.set(step, said);
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
      sheet.waiting = { kind: "choose", options: choices, at: 0, first: 0 };
      draw();
      return new Promise<string>((resolveChoose, rejectChoose) => {
        answer = resolveChoose;
        refuse = rejectChoose;
      });
    },
  };

  tui.start();
  if (options.explain === true) sheet.open.add("command");
  // The first frame at once, before the flow does anything: the renderer draws on a timer, and the command step's install
  // would otherwise be the first thing a shepherd waits on, with the cursor hidden and nothing on screen (issue #9's walk).
  tui.renderNow();
  let stopped = false;
  try {
    const report = await runFlow({ ...options, driver });
    // The last step is settled, so the last frame is the finish: seven done rows, the paths, and the sentence in its box.
    sheet.finished = true;
    sheet.report = report;
    sheet.waiting = undefined;
    sheet.open.clear();
    sync();
    tui.renderNow();
    // The renderer's own stop writes a space before its newline, which wraps off a row the box fills to its last column
    // and scrolls the sheep's top row away; so the screen is left as drawn and the one newline is written here, with the
    // cursor where the render left it, at the end of the last row.
    stopped = true;
    tui.stop({ preserveScreen: true });
    terminal.write("\r\n");
    return report;
  } finally {
    if (timer !== undefined) clearInterval(timer);
    if (!stopped) tui.stop();
  }
}
