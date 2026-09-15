/**
 * Hill phase 1: the built page, counted and searched. Built by `build.mjs`'s
 * own function into a scratch directory, so the package's `dist/` a running
 * home may be serving is not touched. The whole page is under 100 KiB before
 * compression (design.md, "The page"), and no byte of it carries a bearer
 * or the word token: the home's token never reaches a browser, and a page
 * that names it has found somewhere to put it.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildHill, PAGE_FILES, pageBytes } from "../build.mjs";
import { inkRuns, INK } from "../src/mark.ts";
import { sheepPixels } from "../../cli/src/stile/pixels.ts";

let out: string;
let built: { file: string; bytes: number }[];

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "sheep-hill-page-"));
  built = await buildHill({ outdir: out });
});

afterAll(async () => {
  await rm(out, { recursive: true, force: true });
});

describe("the built page", () => {
  it("is index.html, the script, the stylesheet, and the mark, under 100 KiB before compression", () => {
    expect(built.map((file) => file.file)).toEqual(PAGE_FILES);
    const total = pageBytes(out);
    expect(total).toBe(built.reduce((sum, file) => sum + file.bytes, 0));
    expect(total).toBeLessThan(100 * 1024);
  });

  it("carries no Bearer, no authorization, and no token anywhere in its bytes", async () => {
    for (const file of PAGE_FILES) {
      const text = await readFile(join(out, file), "utf8");
      expect(text, file).not.toContain("Bearer");
      expect(text, file).not.toContain("token");
      expect(text.toLowerCase(), file).not.toMatch(/bearer|authorization|sheep_token/);
    }
  });

  it("loads its script and stylesheet from /hill/ itself, with nothing inline and nothing remote", async () => {
    const html = await readFile(join(out, "index.html"), "utf8");
    expect(html).toContain('<script type="module" src="/hill/hill.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="/hill/hill.css">');
    expect(html).not.toMatch(/<script>|<style|style="|https?:\/\//);
    const css = await readFile(join(out, "hill.css"), "utf8");
    expect(css).not.toMatch(/@import|url\(/);
  });
});

describe("the mark", () => {
  it("is the stile's raster, every pixel's ink in the storyboard's table", () => {
    const cv = sheepPixels();
    expect([cv.w, cv.h]).toEqual([35, 14]);
    const inks = new Set(cv.px.flat().filter((ink) => ink !== 0));
    for (const ink of inks) expect(INK[ink], `ink ${ink}`).toBeDefined();
    const painted = inkRuns(cv).reduce((sum, run) => sum + run.w, 0);
    expect(painted).toBe(cv.px.flat().filter((ink) => ink !== 0).length);
  });
});
