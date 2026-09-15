#!/usr/bin/env node
/**
 * The hill's build (hill phase 1): esbuild over `src/` into `dist/`, the
 * directory the cell's `assets` binding serves at `/hill/`.
 *
 *   src/index.html   → dist/index.html   copied: the page every path under /hill/ answers
 *   src/main.ts      → dist/hill.js      Lit and the page, one ES module, minified
 *   src/hill.css     → dist/hill.css     minified
 *   src/mark.ts      → dist/mark.svg     the pixel sheep as the page's icon, drawn from the stile's shapes
 *
 * `dist/.assetsignore` is the one committed file under `dist/`, so a fresh
 * clone has the directory wrangler insists on; the build leaves it alone
 * and replaces everything else. With nothing built the Worker answers
 * `/hill/` with a gate that says `pnpm build` (`packages/cell/src/index.ts`).
 *
 * `scripts/bundle.mjs` calls `buildHill` and copies what it wrote to the
 * release's `home/hill/`; the cell's `test` and `dev` scripts and
 * `scripts/test.mjs` run this first, so every home a checkout starts
 * serves the page.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

export const hillDir = dirname(fileURLToPath(import.meta.url));
export const distDir = join(hillDir, "dist");
const srcDir = join(hillDir, "src");

/** The file that keeps `dist/` in a clone, and that wrangler never uploads. */
export const PLACEHOLDER = ".assetsignore";

/** The page's files, in the order the release lists them. */
export const PAGE_FILES = ["index.html", "hill.js", "hill.css", "mark.svg"];

/** Builds the page into `outdir` (the package's `dist/` by default); returns each file written with its size. */
export async function buildHill({ outdir = distDir } = {}) {
  const out = resolve(outdir);
  mkdirSync(out, { recursive: true });
  for (const entry of readdirSync(out)) if (entry !== PLACEHOLDER) rmSync(join(out, entry), { recursive: true, force: true });

  const common = { absWorkingDir: hillDir, bundle: true, legalComments: "eof", logLevel: "warning", minify: true, sourcemap: false };
  await build({ ...common, entryPoints: [join(srcDir, "main.ts")], outfile: join(out, "hill.js"), format: "esm", platform: "browser", target: ["chrome120", "firefox120", "safari17"] });
  await build({ ...common, entryPoints: [join(srcDir, "hill.css")], outfile: join(out, "hill.css"), loader: { ".css": "css" }, target: ["chrome120", "firefox120", "safari17"] });
  copyFileSync(join(srcDir, "index.html"), join(out, "index.html"));

  // The icon, from the same shapes the page paints: the mark's module built for this process and asked for its SVG.
  const mark = await build({ ...common, entryPoints: [join(srcDir, "mark.ts")], write: false, format: "esm", platform: "neutral", legalComments: "none" });
  const { markSvg } = await import(`data:text/javascript;base64,${Buffer.from(mark.outputFiles[0].text).toString("base64")}`);
  writeFileSync(join(out, "mark.svg"), markSvg());

  return PAGE_FILES.map((file) => ({ file, bytes: statSync(join(out, file)).size }));
}

/** The page's bytes before compression: what the phase's proof counts against 100 KiB. */
export function pageBytes(outdir = distDir) {
  return PAGE_FILES.reduce((total, file) => total + readFileSync(join(outdir, file)).length, 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildHill()
    .then((files) => {
      for (const { file, bytes } of files) console.log(`packages/hill/dist/${file}\t${(bytes / 1024).toFixed(1)} KiB`);
    })
    .catch((error) => {
      console.error(`hill build: ${error.message}`);
      process.exit(1);
    });
}
