/**
 * Paint: the escape sequences the stile's screen writes, at a colour
 * level the screen decides for itself (stile phase 1, second cut).
 *
 * Six meanings have six colours and nothing else is coloured: amber for
 * the step the cursor is on, its `›`, the chosen row's `❯` and the caret;
 * green for a settled step's `✓`; red for a refusal; cyan, underlined,
 * for an address; dim for the steps not reached, the hints, the key line,
 * and paths; bold for the sentence to say. At 256 colours the four are
 * 179, 114, 167, and 74; at sixteen they are yellow, green, red, and
 * cyan; with no colour there is none, and the glyphs alone carry the
 * meaning.
 *
 * **The level is decided here, not asked of the terminal.** The screen's
 * output may be a pipe the seam names as a terminal, so nothing queries
 * the device: `NO_COLOR` set to anything, or `TERM=dumb`, is none;
 * `SHEEP_TEST_TERMINAL` set is 256, since the harness's emulator is
 * xterm; `COLORTERM` naming truecolor, or `TERM` naming 256 colours, is
 * 256; anything else is sixteen. The SGR is written by hand: a level and
 * a handful of codes is all there is, and a dependency for that would be
 * more to read than this file.
 */

export type ColourLevel = "none" | "16" | "256";

/** The level for an environment: see the file's header for the order of the rules. */
export function colourLevel(env: NodeJS.ProcessEnv = process.env): ColourLevel {
  if (env.NO_COLOR !== undefined || env.TERM === "dumb") return "none";
  if (env.SHEEP_TEST_TERMINAL !== undefined && env.SHEEP_TEST_TERMINAL !== "") return "256";
  if (/truecolor|24bit/i.test(env.COLORTERM ?? "") || /256color/.test(env.TERM ?? "")) return "256";
  return "16";
}

/** The four meanings' colours: the 256-colour index, and the sixteen-colour SGR code. */
const MEANINGS = {
  amber: { p256: 179, p16: 33 },
  green: { p256: 114, p16: 32 },
  red: { p256: 167, p16: 31 },
  cyan: { p256: 74, p16: 36 },
} as const;

type Meaning = keyof typeof MEANINGS;

const RESET = "\x1b[0m";
const OSC_LINK_END = "\x1b]8;;\x1b\\";

/** Strips what this file writes: SGR, and the OSC 8 link wrapper. What is left is what a terminal shows. */
export function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
}

/** The visible width of a painted string: every glyph the screen draws is one cell wide. */
export function width(text: string): number {
  return [...plain(text)].length;
}

/** `text` padded with spaces to `columns` visible cells; a wider text is left as it is. */
export function padTo(text: string, columns: number): string {
  return text + " ".repeat(Math.max(0, columns - width(text)));
}

export class Paint {
  constructor(readonly level: ColourLevel) {}

  /** `text` between an SGR and a reset, or `text` alone where there is no colour or nothing to paint. */
  private sgr(codes: string, text: string): string {
    if (this.level === "none" || text === "") return text;
    return `\x1b[${codes}m${text}${RESET}`;
  }

  private code(meaning: Meaning): string {
    const colour = MEANINGS[meaning];
    return this.level === "256" ? `38;5;${colour.p256}` : String(colour.p16);
  }

  amber(text: string): string {
    return this.sgr(this.code("amber"), text);
  }

  boldAmber(text: string): string {
    return this.sgr(`1;${this.code("amber")}`, text);
  }

  green(text: string): string {
    return this.sgr(this.code("green"), text);
  }

  red(text: string): string {
    return this.sgr(this.code("red"), text);
  }

  dim(text: string): string {
    return this.sgr("2", text);
  }

  bold(text: string): string {
    return this.sgr("1", text);
  }

  /**
   * An address: cyan and underlined, and an OSC 8 hyperlink to `url` (or
   * to the text itself) so a terminal that follows links opens it. With no
   * colour the text alone: a dumb terminal follows nothing either.
   */
  link(text: string, url = text): string {
    if (this.level === "none") return text;
    return `\x1b]8;;${url}\x1b\\${this.sgr(`4;${this.code("cyan")}`, text)}${OSC_LINK_END}`;
  }

  /** A sixteen-colour SGR (`1;37`, `90`, `35`), for the line-art sheep's inks; nothing at the level with no colour. */
  ink16(codes: string, text: string): string {
    return this.sgr(codes, text);
  }

  /**
   * One cell of a picture: the pixel above and the pixel below, each a
   * 256-colour index or 0 for nothing, drawn with the half-block glyphs —
   * the foreground for the top pixel, the background for the bottom. Only
   * at 256 colours; the caller draws something else below that.
   */
  pixel(top: number, bottom: number): string {
    if (this.level !== "256") throw new Error("a pixel needs 256 colours");
    if (top === 0 && bottom === 0) return " ";
    if (bottom === 0) return `\x1b[38;5;${top}m▀${RESET}`;
    if (top === 0) return `\x1b[38;5;${bottom}m▄${RESET}`;
    if (top === bottom) return `\x1b[38;5;${top}m█${RESET}`;
    return `\x1b[38;5;${top}m\x1b[48;5;${bottom}m▀${RESET}`;
  }
}
