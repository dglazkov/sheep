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
import { type Canvas, sheepPixels } from "./pixels.js";

// The raster is `pixels.ts`, which imports nothing, so the hill's page draws the same sheep in a browser (hill phase 1).
export { type Canvas, canvas, ellipse, type Ink, rect, sheepPixels } from "./pixels.js";

/** The sheep's width in cells; the banner's name and line start after it. The raster's width too (`pixels.ts`). */
export const SHEEP_WIDTH = 35;
/** The sheep's height in cells: fourteen pixel rows, two to a cell. */
export const SHEEP_ROWS = 7;

/** Cells from pixels: two rows of pixels per row of cells. */
export function cells(cv: Canvas, paint: Paint): string[] {
  const out: string[] = [];
  for (let r = 0; r < cv.h; r += 2) {
    let line = "";
    for (let c = 0; c < cv.w; c++) line += paint.pixel(cv.px[r]![c]!, cv.px[r + 1]?.[c] ?? 0);
    out.push(line);
  }
  return out;
}

/** The sheep, from the emoji, as `sheepPixels()` draws it, printed two pixels per cell (`pixels.ts` holds the shapes). */
export function pixelSheep(paint: Paint): string[] {
  return cells(sheepPixels(), paint).map((row) => padTo(row, SHEEP_WIDTH));
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
