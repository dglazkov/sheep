/**
 * The sheep in the banner (stile phase 1, second cut): a picture, not
 * typed art. It is the rasteriser of `docs/projects/stile/screen/mock.mjs`,
 * moved here as the shepherd approved it on 12 September 2026: a 35 by 14
 * pixel canvas drawn from ellipses and rectangles, printed two pixels per
 * cell with the half-block glyphs in 256 colours. The wool is shaded from
 * white on top to shadow at the belly, a dark face nestled into the body's
 * front looks at you with two eyes, a domed tuft of wool sits on the head,
 * the ears and the nose are pink, four legs stand under it, and a row of
 * green grass is the rule under the banner.
 *
 * Where there is no 256-colour palette the picture cannot exist, and the
 * line-art sheep of the same size stands in for it, with its inks at
 * sixteen colours where there are any and none under `NO_COLOR`.
 *
 * Both are seven rows of exactly `SHEEP_WIDTH` cells, so the banner's
 * name and line sit beside either at the same column.
 */
import { type Paint, padTo, width } from "./paint.js";

/** The sheep's width in cells; the banner's name and line start after it. */
export const SHEEP_WIDTH = 35;
/** The sheep's height in cells: fourteen pixel rows, two to a cell. */
export const SHEEP_ROWS = 7;

/** A pixel canvas: 0 is nothing, anything else a 256-colour index. */
interface Canvas {
  w: number;
  h: number;
  px: number[][];
}

type Ink = number | ((x: number, y: number) => number);

function canvas(w: number, h: number): Canvas {
  return { w, h, px: Array.from({ length: h }, () => new Array<number>(w).fill(0)) };
}

const inkAt = (ink: Ink, x: number, y: number): number => (typeof ink === "function" ? ink(x, y) : ink);

function ellipse(cv: Canvas, cx: number, cy: number, rx: number, ry: number, ink: Ink): void {
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) cv.px[y]![x] = inkAt(ink, x, y);
    }
  }
}

function rect(cv: Canvas, x0: number, y0: number, x1: number, y1: number, ink: Ink): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cv.px[y]![x] = inkAt(ink, x, y);
}

/** Cells from pixels: two rows of pixels per row of cells. */
function cells(cv: Canvas, paint: Paint): string[] {
  const out: string[] = [];
  for (let r = 0; r < cv.h; r += 2) {
    let line = "";
    for (let c = 0; c < cv.w; c++) line += paint.pixel(cv.px[r]![c]!, cv.px[r + 1]?.[c] ?? 0);
    out.push(line);
  }
  return out;
}

/** The sheep, from the emoji: body, head, tuft, ears, eyes, nose, legs, grass. The shapes and the palette are the mock's. */
export function pixelSheep(paint: Paint): string[] {
  const cv = canvas(SHEEP_WIDTH, 14);
  // Wool: light on top, a shoulder highlight, shadow toward the belly and the back.
  const wool = (x: number, y: number): number => (y <= 3 ? 255 : y <= 5 ? (x < 25 ? 255 : 253) : y <= 7 ? 253 : y <= 9 ? 251 : 248);
  // The body, a chunky one: a slab with bumps along the top and the bottom, and rounded ends.
  rect(cv, 16, 4, 31, 9, wool);
  for (const cx of [17.5, 23.5, 29.5]) ellipse(cv, cx, 3.8, 3.9, 3.4, wool);
  for (const cx of [20.5, 26.5]) ellipse(cv, cx, 9.6, 3.4, 2.6, wool);
  ellipse(cv, 15.5, 6.8, 3.4, 3.8, wool);
  ellipse(cv, 31.5, 6.8, 3.2, 3.8, wool);
  // Legs, under the belly, before the head so nothing of them crosses it.
  for (const x of [18, 23, 27, 31]) rect(cv, x, 11, x + 1, 12, 240);
  // The head at the front, dark, looking at you; the tuft of wool on top; the ears out to the sides, pink inside.
  ellipse(cv, 9, 6, 4.6, 4.4, 237);
  ellipse(cv, 9, 2.2, 2.6, 2.4, 255);
  rect(cv, 3, 5, 4, 6, 240);
  rect(cv, 4, 5, 4, 5, 217);
  rect(cv, 14, 5, 15, 6, 240);
  rect(cv, 14, 5, 14, 5, 217);
  // Eyes, and a pink nose.
  rect(cv, 7, 6, 7, 6, 231);
  rect(cv, 11, 6, 11, 6, 231);
  rect(cv, 8, 9, 9, 9, 211);
  // Grass.
  rect(cv, 0, 13, 34, 13, (x) => ([3, 9, 19, 27, 33].includes(x) ? 64 : 70));
  return cells(cv, paint).map((row) => padTo(row, SHEEP_WIDTH));
}

/**
 * The line-art sheep, for a terminal without the palette: the mock's
 * candidate J. Each row is segments of an ink and its text; the inks are
 * the mock's keys, given here at sixteen colours (wool white, the face and
 * legs bright black, the ears and nose magenta, the grass green), and
 * nothing at the level with none.
 */
const INKS_16: Record<string, string> = {
  w: "1;37",
  W: "1;37",
  x: "37",
  y: "37",
  v: "37",
  f: "90",
  F: "90",
  e: "1;37",
  p: "35",
  P: "35",
  l: "90",
  g: "32",
  G: "32",
};

const LINE_SHEEP: [string, string][][] = [
  [
    ["_", "    "],
    ["w", ",-."],
    ["_", "      "],
    ["w", ",-''-.,-''-.,-''-."],
  ],
  [
    ["_", "  "],
    ["p", "~"],
    ["f", "(     )"],
    ["p", "~"],
    ["_", " "],
    ["w", ",'"],
    ["W", "                 "],
    ["w", "`."],
  ],
  [
    ["_", "  "],
    ["f", "("],
    ["_", " "],
    ["e", "o"],
    ["_", "   "],
    ["e", "o"],
    ["_", " "],
    ["f", ")"],
    ["w", "("],
    ["x", "   ~   ~   ~   ~    "],
    ["w", ")"],
  ],
  [
    ["_", "   "],
    ["f", "`."],
    ["P", "v"],
    ["f", ".'"],
    ["_", "  "],
    ["y", "`."],
    ["y", "                  "],
    ["y", ",'"],
  ],
  [
    ["_", "     "],
    ["l", "|"],
    ["_", "      "],
    ["v", "`-.,-''-.,-''-.,-'"],
  ],
  [
    ["_", "     "],
    ["l", "|"],
    ["_", "       "],
    ["l", "||"],
    ["_", "  "],
    ["l", "||"],
    ["_", "  "],
    ["l", "||"],
    ["_", "  "],
    ["l", "||"],
  ],
  [["g", "  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁"]],
];

export function lineSheep(paint: Paint): string[] {
  return LINE_SHEEP.map((row) => padTo(row.map(([ink, text]) => (ink in INKS_16 ? paint.ink16(INKS_16[ink]!, text) : text)).join(""), SHEEP_WIDTH));
}

/** The sheep for a paint: pixels at 256 colours, lines below that. Seven rows, each `SHEEP_WIDTH` wide. */
export function sheep(paint: Paint): string[] {
  const rows = paint.level === "256" ? pixelSheep(paint) : lineSheep(paint);
  for (const row of rows) if (width(row) !== SHEEP_WIDTH) throw new Error(`a sheep row is ${width(row)} wide, not ${SHEEP_WIDTH}`);
  if (rows.length !== SHEEP_ROWS) throw new Error(`the sheep is ${rows.length} rows, not ${SHEEP_ROWS}`);
  return rows;
}
