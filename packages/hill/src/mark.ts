/**
 * The mark (hill phase 1): the stile's pixel sheep, from the same shapes
 * (`packages/cli/src/stile/pixels.ts`), drawn on a canvas instead of in
 * half-blocks, with the storyboard's table from the stile's 256-colour
 * inks to the hill's own colours. `markSvg` is the same picture as the
 * page's icon, written by `build.mjs`.
 */
import { type Canvas, sheepPixels } from "../../cli/src/stile/pixels.ts";

/** The 256-colour inks the stile uses, as the hill's own colours: the storyboard's table. */
export const INK: Record<number, string> = {
  255: "#f7f2e6",
  253: "#ede6d6",
  251: "#ddd4bf",
  248: "#c9bfa8",
  240: "#3a3a42",
  237: "#2b2a30",
  217: "#e8a0b4",
  231: "#ffffff",
  211: "#e88aa6",
  64: "#5aa64f",
  70: "#3d8a3d",
};

/** Each row's runs of one ink, so a picture is a few dozen rectangles and not five hundred. */
export function inkRuns(cv: Canvas = sheepPixels()): { x: number; y: number; w: number; colour: string }[] {
  const out: { x: number; y: number; w: number; colour: string }[] = [];
  for (let y = 0; y < cv.h; y++) {
    let x = 0;
    while (x < cv.w) {
      const ink = cv.px[y]![x]!;
      let end = x + 1;
      while (end < cv.w && cv.px[y]![end] === ink) end++;
      const colour = INK[ink];
      if (ink !== 0 && colour !== undefined) out.push({ x, y, w: end - x, colour });
      x = end;
    }
  }
  return out;
}

/** The mark as an SVG document, for the page's icon. */
export function markSvg(): string {
  const cv = sheepPixels();
  const rects = inkRuns(cv)
    .map((run) => `<rect x="${run.x}" y="${run.y}" width="${run.w}" height="1" fill="${run.colour}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cv.w} ${cv.w}" shape-rendering="crispEdges"><g transform="translate(0 ${(cv.w - cv.h) / 2})">${rects}</g></svg>\n`;
}

/** Paints the mark on a canvas at `scale` CSS pixels to a sheep's pixel, sharp on a dense screen. */
export function paintMark(canvas: HTMLCanvasElement, scale: number, density = globalThis.devicePixelRatio || 1): void {
  const cv = sheepPixels();
  const ratio = Math.max(1, Math.round(density));
  canvas.width = cv.w * scale * ratio;
  canvas.height = cv.h * scale * ratio;
  canvas.style.width = `${cv.w * scale}px`;
  canvas.style.height = `${cv.h * scale}px`;
  const g = canvas.getContext("2d");
  if (g === null) return;
  const unit = scale * ratio;
  for (const run of inkRuns(cv)) {
    g.fillStyle = run.colour;
    g.fillRect(run.x * unit, run.y * unit, run.w * unit, unit);
  }
}
