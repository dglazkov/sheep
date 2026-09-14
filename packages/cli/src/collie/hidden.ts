/**
 * The pass, read (collie phase 1): at a terminal, a hidden prompt; without
 * one, the first line of stdin. Never an argument, never a file.
 *
 * The hidden prompt is the stile's, outside the stile's screen: raw mode,
 * so the terminal echoes nothing; a bracketed paste taken as its
 * characters with its line breaks dropped (`keysOf`); one `•` per
 * character and past sixteen the count (`hiddenShown`); Enter sends,
 * Backspace takes one back, and Ctrl-C, a byte in raw mode, ends it with
 * nothing sent. The prompt is drawn on stderr, so stdout stays the
 * command's answer.
 */
import { hiddenShown, keysOf } from "../stile/screen.js";

/** Ctrl-C at the hidden prompt. */
export class Interrupted extends Error {}

/** The pass: typed hidden at a terminal, else stdin's first line; trimmed, and `""` when nothing came. */
export function readPass(prompt: string): Promise<string> {
  return process.stdin.isTTY ? hiddenLine(prompt) : firstLine();
}

function firstLine(): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => (text += chunk));
    process.stdin.once("end", () => resolve((text.split("\n")[0] ?? "").trim()));
    process.stdin.once("error", () => resolve(""));
    process.stdin.resume();
  });
}

const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

function hiddenLine(prompt: string): Promise<string> {
  const input = process.stdin;
  const out = process.stderr;
  let buffer = "";
  const draw = () => out.write(`\r\x1b[2K${prompt}${hiddenShown([...buffer].length)}`);
  return new Promise((resolve, reject) => {
    const done = (end: () => void) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      out.write(`${PASTE_OFF}\r\n`);
      end();
    };
    const onData = (chunk: string) => {
      for (const key of keysOf(chunk)) {
        if (key === "\x03") return done(() => reject(new Interrupted("interrupted at the prompt; no pass was handed to the collie")));
        if (key === "\r" || key === "\n") return done(() => resolve(buffer.trim()));
        if (key === "\x7f" || key === "\b") buffer = [...buffer].slice(0, -1).join("");
        else if (!key.startsWith("\x1b") && key >= " ") buffer += key;
      }
      draw();
    };
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.on("data", onData);
    input.resume();
    out.write(PASTE_ON);
    draw();
  });
}
