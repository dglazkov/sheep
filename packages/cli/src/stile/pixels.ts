/**
 * The sheep's raster (hill phase 1): the shapes the stile's banner prints
 * (`sheep.ts`), split from the terminal painting so that the hill's page
 * can draw the same picture on a canvas. A 35 by 14 grid of 256-colour ink
 * numbers, 0 for nothing, drawn from ellipses and rectangles as the mock
 * approved on 12 September 2026 drew it.
 *
 * **This file imports nothing**, so a browser bundle can follow it: the
 * page is built by esbuild from `packages/hill/src`, which imports
 * `sheepPixels` from here.
 */

/** A pixel canvas: 0 is nothing, anything else a 256-colour index. Shared with the collie (`collie.ts`), drawn the same way. */
export interface Canvas {
  w: number;
  h: number;
  px: number[][];
}

export type Ink = number | ((x: number, y: number) => number);

/** The raster's size: thirty-five pixels wide, fourteen high, printed as seven rows of cells by the stile. */
export const PIXELS_WIDE = 35;
export const PIXELS_HIGH = 14;

export function canvas(w: number, h: number): Canvas {
  return { w, h, px: Array.from({ length: h }, () => new Array<number>(w).fill(0)) };
}

const inkAt = (ink: Ink, x: number, y: number): number => (typeof ink === "function" ? ink(x, y) : ink);

export function ellipse(cv: Canvas, cx: number, cy: number, rx: number, ry: number, ink: Ink): void {
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) cv.px[y]![x] = inkAt(ink, x, y);
    }
  }
}

export function rect(cv: Canvas, x0: number, y0: number, x1: number, y1: number, ink: Ink): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cv.px[y]![x] = inkAt(ink, x, y);
}

/** The sheep, from the emoji: body, head, tuft, ears, eyes, nose, legs, grass. The shapes and the palette are the mock's. */
export function sheepPixels(): Canvas {
  const cv = canvas(PIXELS_WIDE, PIXELS_HIGH);
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
  return cv;
}
