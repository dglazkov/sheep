/**
 * The collie in `collie setup`'s banner (collie phase 2): the stile's
 * second mascot, drawn the way the sheep is (`sheep.ts`) and from its
 * rasteriser — a 35 by 14 pixel canvas of ellipses and rectangles, printed
 * two pixels per cell with the half-block glyphs in 256 colours, on the
 * same row of grass.
 *
 * A working border collie, standing, its head turned to look at you: a
 * black coat with a sheen along the back, a white blaze down the face that
 * opens into a white muzzle, a black nose, amber eyes, ears up and tipped
 * over, a white ruff at the chest, white socks, and a low feathered tail
 * with a white tip.
 *
 * Where there is no 256-colour palette the line-art collie of the same
 * size stands in for it, its inks at sixteen colours where there are any
 * and none under `NO_COLOR`. Both are seven rows of `SHEEP_WIDTH` cells, so
 * the name sits beside either in the column it sits in beside the sheep.
 */
import { type Paint, padTo, width } from "./paint.js";
import { canvas, cells, ellipse, rect, SHEEP_ROWS, SHEEP_WIDTH } from "./sheep.js";

/**
 * The coat's inks. Not black: a black dog is invisible on a dark terminal, so the coat is the charcoal the sheep's face
 * is, with a sheen along the back and the far legs a shade darker; white shaded to the belly; amber eyes; a black nose.
 */
const COAT = 238;
const SHEEN = 242;
const FAR = 236;
const WHITE = 255;
const SHADE = 252;
const EYE = 172;
const NOSE = 16;
const TONGUE = 204;

/** The collie from shapes: body, tail, legs, ruff, head, ears, blaze, muzzle, eyes, nose, grass. */
export function pixelCollie(paint: Paint): string[] {
  const cv = canvas(SHEEP_WIDTH, 14);
  // The body, long and low as a working dog stands, with a sheen along the back.
  const coat = (_x: number, y: number): number => (y <= 5 ? SHEEN : COAT);
  ellipse(cv, 23, 7.6, 8.8, 3.2, coat);
  // The tail, low and feathered, sweeping back and down from the rump, its tip white.
  rect(cv, 31, 6, 32, 8, COAT);
  rect(cv, 32, 9, 33, 10, COAT);
  rect(cv, 33, 11, 34, 11, WHITE);
  // Legs: the far pair a shade back, the near pair in white socks.
  for (const x of [19, 30]) rect(cv, x, 10, x, 12, FAR);
  for (const x of [17, 28]) {
    rect(cv, x, 10, x + 1, 10, COAT);
    rect(cv, x, 11, x + 1, 12, (_px, y) => (y === 12 ? SHADE : WHITE));
  }
  // The ruff: white at the chest, under the head, shaded toward the belly.
  ellipse(cv, 14, 9.2, 3.2, 2.7, (_x, y) => (y >= 10 ? SHADE : WHITE));
  // The head, turned to you.
  ellipse(cv, 8.5, 5.8, 4.4, 4.2, COAT);
  // Ears up, set wide, the tips tipped over outward: a border collie's.
  rect(cv, 4, 2, 6, 3, COAT);
  rect(cv, 4, 1, 5, 1, COAT);
  rect(cv, 3, 0, 4, 0, COAT);
  rect(cv, 11, 2, 13, 3, COAT);
  rect(cv, 12, 1, 13, 1, COAT);
  rect(cv, 13, 0, 14, 0, COAT);
  // The blaze, white down the middle of the face, opening into the muzzle.
  rect(cv, 8, 2, 9, 5, WHITE);
  ellipse(cv, 8.5, 8.3, 2.7, 1.9, WHITE);
  // Eyes, amber, either side of the blaze; the nose black at the top of the muzzle; a bit of tongue under it.
  rect(cv, 6, 5, 6, 5, EYE);
  rect(cv, 11, 5, 11, 5, EYE);
  rect(cv, 8, 7, 9, 7, NOSE);
  rect(cv, 8, 10, 9, 10, TONGUE);
  // Grass, the sheep's.
  rect(cv, 0, 13, 34, 13, (x) => ([3, 9, 19, 27, 33].includes(x) ? 64 : 70));
  return cells(cv, paint).map((row) => padTo(row, SHEEP_WIDTH));
}

/** The line-art collie's inks at sixteen colours: the coat bright black, the blaze, muzzle, socks, and tail tip white, the eyes yellow, the grass green. */
const INKS_16: Record<string, string> = {
  k: "90",
  w: "1;37",
  e: "33",
  g: "32",
};

const LINE_COLLIE: [string, string][][] = [
  [
    ["_", "   "],
    ["k", "/\\___/\\"],
  ],
  [
    ["_", "  "],
    ["k", "( "],
    ["e", "o"],
    ["_", " "],
    ["w", "|"],
    ["_", " "],
    ["e", "o"],
    ["k", " )"],
    ["_", "  "],
    ["k", ",~~~~~~~~~~~~~~~~~."],
  ],
  [
    ["_", "   "],
    ["k", "\\ "],
    ["w", "(_)"],
    ["k", " /__("],
    ["_", "                   "],
    ["k", ")\\"],
  ],
  [
    ["_", "    "],
    ["w", "`-v-'"],
    ["_", "   "],
    ["k", "(___________________)"],
    ["_", " "],
    ["k", "\\"],
  ],
  [
    ["_", "              "],
    ["k", "||"],
    ["_", "  "],
    ["k", "||"],
    ["_", "      "],
    ["k", "||"],
    ["_", "  "],
    ["k", "||"],
    ["_", "  "],
    ["w", "~"],
  ],
  [
    ["_", "              "],
    ["w", "''"],
    ["_", "  "],
    ["w", "''"],
    ["_", "      "],
    ["w", "''"],
    ["_", "  "],
    ["w", "''"],
  ],
  [["g", "  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁"]],
];

export function lineCollie(paint: Paint): string[] {
  return LINE_COLLIE.map((row) => padTo(row.map(([ink, text]) => (ink in INKS_16 ? paint.ink16(INKS_16[ink]!, text) : text)).join(""), SHEEP_WIDTH));
}

/** The collie for a paint: pixels at 256 colours, lines below that. Seven rows, each `SHEEP_WIDTH` wide, as the sheep is. */
export function collie(paint: Paint): string[] {
  const rows = paint.level === "256" ? pixelCollie(paint) : lineCollie(paint);
  for (const row of rows) if (width(row) !== SHEEP_WIDTH) throw new Error(`a collie row is ${width(row)} wide, not ${SHEEP_WIDTH}`);
  if (rows.length !== SHEEP_ROWS) throw new Error(`the collie is ${rows.length} rows, not ${SHEEP_ROWS}`);
  return rows;
}
