#!/usr/bin/env node
/**
 * The release's built files, from this checkout: two bundles into `dist/`
 * and the Worker into `home/`. Collar phase 0. `scripts/release.mjs`
 * commits what this makes onto the `release` branch; `main` never carries
 * it (`/dist/` and `/home/` are gitignored).
 *
 * The bundles are esbuild with the options of the fork's
 * `vendor/pi/scripts/build-coding-agent-bundle.mjs`, which is how pi
 * bundles its own coding agent for Node: ESM, a `createRequire` banner,
 * `PI_BUNDLED_NODE` defined, jiti loaded lazily, `https-proxy-agent`'s
 * named export, target node22.19, and the monorepo's tsconfig paths
 * ignored so packages resolve as installed packages do. Two entries:
 *
 *   packages/cli/src/cli.ts                          → dist/sheep.mjs
 *   vendor/pi/packages/coding-agent/src/experimental/cli.ts → dist/pi-client.mjs
 *
 * The first is the CLI with pi's client and services inside it. The
 * second is pi's experimental CLI, whole, which is what attach mode spawns
 * (`packages/cli/src/pi.ts`); the published `pi` excludes it, so it has
 * to come from the fork. Chord goes inside both; the packages left to
 * `node_modules` are exactly the release manifest's dependencies, and a
 * bundle that leaks any other import fails here rather than on a user's
 * laptop.
 *
 * Beside the bundles, the guide: `packages/cli/agent-guide.md` becomes
 * `dist/agent-guide.md`, which `sheep --agent-help` prints from beside the
 * bundle (collar phase 2). And what the client path reads at runtime
 * relative to its package: pi's built-in theme JSON (`dist/modes/interactive/theme/`,
 * where `getThemesDir()` looks from a package with no `src/`) and the
 * image-resize worker (`dist/image-resize-worker.js`, resolved beside the
 * bundle by `resizeImage`). Not copied, because attach mode never reaches
 * them: the HTML export templates (`pi --export`), the interactive
 * assets (the announcement image of pi's own interactive mode), and
 * `plugin.js` (facet bundles a server sends; the cell sends none).
 *
 * The Worker is `wrangler deploy --dry-run --outdir` over `packages/cell`,
 * run here where the `link:` dependencies resolve, renamed to
 * `home/worker.mjs`; `home/wrangler.jsonc` is the cell's config with
 * `main` pointed at it and `no_bundle` set, the `pen` environment kept.
 *
 * The stamp (station phase 0). `buildRelease({ commit, builtAt })` defines
 * `SHEEP_BUILD` into the Worker through wrangler's `--define`, a JSON
 * string of the two values the release manifest carries, and `GET /home`
 * reports them as `build`; and the shipped config's `pen` environment
 * names the pen image the same release pushed,
 * `docker.io/dglazkov/sheep-pen:<commit>`, in place of the checkout's
 * Dockerfile, with `image_build_context` gone and `containers[].name`
 * left for deploy to set per Worker (a container application's name is
 * account-wide; recast phase 1). Run by hand with no stamp, the Worker is
 * a checkout build (`0.0.0-checkout`) and the config keeps the Dockerfile
 * line, which is what `wrangler dev --env pen` from a checkout builds.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { IMAGE_REPOSITORY, RELEASE_DEPENDENCIES, RELEASE_OPTIONAL_DEPENDENCIES } from "./release.mjs";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const piRoot = join(root, "vendor", "pi");
const codingAgent = join(piRoot, "packages", "coding-agent");
const cellDir = join(root, "packages", "cell");
export const distDir = join(root, "dist");
export const homeDir = join(root, "home");

const banner = {
  js: 'import { createRequire as __piCreateRequire } from "node:module"; const require = __piCreateRequire(import.meta.url);',
};

/** What a bundle may import from `node_modules`: the manifest's dependencies, and nothing else. */
const allowedExternals = new Set([...Object.keys(RELEASE_DEPENDENCIES), ...Object.keys(RELEASE_OPTIONAL_DEPENDENCIES)]);

/** pi's: `jiti/static` becomes a synchronous lazy `require("jiti")`, so jiti loads only when an extension is imported. */
const lazyJitiPlugin = {
  name: "lazy-jiti-transform",
  setup(build) {
    build.onResolve({ filter: /^jiti\/static$/ }, () => ({ namespace: "lazy-jiti", path: "jiti/static" }));
    build.onLoad({ filter: /.*/, namespace: "lazy-jiti" }, () => ({
      contents: `
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let createJitiImpl;

export function createJiti(...args) {
	createJitiImpl ??= require("jiti").createJiti;
	return createJitiImpl(...args);
}
`,
      loader: "js",
    }));
  },
};

/** pi's: the dynamic `import("https-proxy-agent")` gets a module with the named export the caller reads. */
const httpsProxyAgentNamedExportPlugin = {
  name: "https-proxy-agent-named-export",
  setup(build) {
    build.onResolve({ filter: /^https-proxy-agent$/ }, (args) => {
      if (args.kind !== "dynamic-import") return undefined;
      return { namespace: "https-proxy-agent-named-export", path: args.path };
    });
    build.onLoad({ filter: /^https-proxy-agent$/, namespace: "https-proxy-agent-named-export" }, () => ({
      contents: 'export { HttpsProxyAgent } from "https-proxy-agent";',
      loader: "js",
      resolveDir: piRoot,
    }));
  },
};

/**
 * Sheep's own: `@earendil-works/chord/bundler` depends on esbuild, and it
 * is on the client entry's graph through pi's server module, which the
 * experimental CLI imports for `pi server`. pi keeps that subpath external
 * and resolves it from chord on npm; the release does not ship esbuild,
 * and attach mode never bundles a plugin package, so the two functions
 * are stubs that say so if ever called.
 */
const chordBundlerStubPlugin = {
  name: "chord-bundler-stub",
  setup(build) {
    build.onResolve({ filter: /^@earendil-works\/chord\/bundler$/ }, () => ({ namespace: "chord-bundler-stub", path: "@earendil-works/chord/bundler" }));
    build.onLoad({ filter: /.*/, namespace: "chord-bundler-stub" }, () => ({
      contents: `
const absent = (name) => () => {
	throw new Error(name + " needs esbuild, which sheep's release does not ship; bundling a plugin package is a server-side path");
};
export const bundleFacets = absent("bundleFacets");
export const bundleFacetPackage = absent("bundleFacetPackage");
`,
      loader: "js",
    }));
  },
};

function commonBuildOptions() {
  return {
    absWorkingDir: root,
    banner,
    bundle: true,
    define: { PI_BUNDLED_NODE: "true" },
    external: [...allowedExternals],
    format: "esm",
    legalComments: "none",
    logLevel: "warning",
    metafile: true,
    minifySyntax: true,
    minifyWhitespace: true,
    platform: "node",
    plugins: [lazyJitiPlugin, httpsProxyAgentNamedExportPlugin, chordBundlerStubPlugin],
    sourcemap: false,
    target: "node22.19",
    // Do not apply the fork's source-oriented path aliases: the bundle resolves the same package entries an installed pi does.
    tsconfigRaw: { compilerOptions: {} },
  };
}

/** pi's check, with sheep's allowed set: every external import is a Node builtin or a manifest dependency. */
function validateExternalImports(name, metafile) {
  const unexpected = new Set();
  const forbidden = new Set();
  for (const [inputPath, input] of Object.entries(metafile.inputs)) {
    if (/node_modules\/(esbuild|@esbuild|wrangler|workerd|@cloudflare)\//.test(inputPath)) forbidden.add(inputPath);
    for (const imported of input.imports) {
      if (!imported.external || isBuiltin(imported.path) || allowedExternals.has(imported.path)) continue;
      unexpected.add(imported.path);
    }
  }
  if (unexpected.size > 0) throw new Error(`${name} left unexpected external imports: ${[...unexpected].sort().join(", ")}`);
  if (forbidden.size > 0) throw new Error(`${name} bundled a build tool: ${[...forbidden].sort().slice(0, 5).join(", ")}`);
}

/**
 * The fork's pins for the packages the manifest names must be the
 * manifest's: a pi bump that moves photon or jiti is a release.mjs edit,
 * not a silent skew between what the bundle expects and what npm installs.
 */
function checkPinsAgainstFork() {
  const pkg = JSON.parse(readFileSync(join(codingAgent, "package.json"), "utf8"));
  const forkPins = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
  const ours = { ...RELEASE_DEPENDENCIES, ...RELEASE_OPTIONAL_DEPENDENCIES };
  const skew = Object.entries(ours)
    .filter(([name, version]) => name in forkPins && forkPins[name] !== version)
    .map(([name, version]) => `${name}: manifest ${version}, fork ${forkPins[name]}`);
  if (skew.length > 0) throw new Error(`release.mjs pins disagree with the fork's coding-agent package.json: ${skew.join("; ")}`);
}

async function bundleEntry(name, entry, outfile) {
  const result = await build({ ...commonBuildOptions(), entryPoints: [entry], outfile });
  validateExternalImports(name, result.metafile);
  const bytes = Object.values(result.metafile.outputs).reduce((total, output) => total + output.bytes, 0);
  return { file: relative(root, outfile), bytes };
}

/** The cell's config as one object: `//` comments stripped outside strings, then JSON. */
function parseJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") out += text[++i];
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function wranglerVersion() {
  return JSON.parse(readFileSync(join(cellDir, "node_modules", "wrangler", "package.json"), "utf8")).version;
}

/** The image reference a release's config names: the repository at the stamp's commit, the string the workflow pushes. */
export function imageReference(commit) {
  return `${IMAGE_REPOSITORY}:${commit}`;
}

/**
 * The shipped config from the cell's (station phase 0). With a stamp, the
 * `pen` environment's one container names the registry image at the
 * stamp's commit and drops the checkout's build context and the
 * container application's name, which deploy sets to the Worker's own.
 * Without one, the config is the checkout's, Dockerfile line and all.
 */
export function shippedConfig(config, stamp) {
  const { $schema: _schema, name, main: _main, ...rest } = config;
  const written = { name, main: "worker.mjs", no_bundle: true, ...rest };
  if (stamp === undefined) return written;
  const containers = written.env?.pen?.containers;
  if (!Array.isArray(containers) || containers.length !== 1) throw new Error("the cell's config must have exactly one container in its pen environment");
  const { name: _containerName, image: _image, image_build_context: _context, ...container } = containers[0];
  written.env = { ...written.env, pen: { ...written.env.pen, containers: [{ image: imageReference(stamp.commit), ...container }] } };
  return written;
}

/**
 * `wrangler deploy --dry-run` writes the bundled Worker without deploying;
 * the top-level environment is the one built. With a stamp, `SHEEP_BUILD`
 * is defined into it, a JSON string of `{ commit, builtAt }`; without one
 * nothing is defined and the Worker reports the checkout's value.
 */
function emitWorker(stamp) {
  const wrangler = join(cellDir, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wrangler)) throw new Error(`wrangler is not installed at ${wrangler}; run pnpm install`);
  const out = mkdtempSync(join(tmpdir(), "sheep-worker-"));
  // esbuild's define takes a JSON expression: the string, JSON-encoded, so the Worker's `JSON.parse(SHEEP_BUILD)` reads the object back.
  const define = stamp === undefined ? [] : ["--define", `SHEEP_BUILD:${JSON.stringify(JSON.stringify({ commit: stamp.commit, builtAt: stamp.builtAt }))}`];
  try {
    const done = spawnSync(process.execPath, [wrangler, "deploy", "--dry-run", "--outdir", out, "--env", "", ...define], {
      cwd: cellDir,
      encoding: "utf8",
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    });
    if (done.status !== 0) throw new Error(`wrangler deploy --dry-run failed:\n${done.stdout}${done.stderr}`);
    const emitted = join(out, "index.js");
    if (!existsSync(emitted)) throw new Error(`wrangler did not write ${emitted}; it wrote ${readdirSync(out).join(", ")}`);
    const extra = readdirSync(out).filter((name) => !["index.js", "index.js.map", "README.md"].includes(name));
    if (extra.length > 0) throw new Error(`wrangler emitted files beside the Worker that home/ does not carry: ${extra.join(", ")}`);
    mkdirSync(homeDir, { recursive: true });
    copyFileSync(emitted, join(homeDir, "worker.mjs"));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  const worker = readFileSync(join(homeDir, "worker.mjs"), "utf8");
  if (stamp !== undefined && !worker.includes(stamp.commit)) throw new Error(`wrangler emitted a Worker without the stamp ${stamp.commit} in it; was --define dropped?`);
  if (stamp === undefined && !worker.includes("0.0.0-checkout")) throw new Error("wrangler emitted a Worker without the checkout stamp in it");
  const written = shippedConfig(parseJsonc(readFileSync(join(cellDir, "wrangler.jsonc"), "utf8")), stamp);
  const header =
    "// GENERATED by scripts/bundle.mjs from packages/cell/wrangler.jsonc: `main` is the Worker wrangler emitted\n" +
    "// beside this file and `no_bundle` serves it as is. The `pen` environment is the deployed home's (station):\n" +
    (stamp === undefined
      ? "// a checkout build, so its container is still the Dockerfile; a release names the registry image at its commit.\n"
      : `// its container is the image the release pushed, ${imageReference(stamp.commit)}, and its name is deploy's to set.\n`);
  writeFileSync(join(homeDir, "wrangler.jsonc"), header + JSON.stringify(written, null, 2) + "\n");
  return { wrangler: wranglerVersion(), bytes: worker.length };
}

/**
 * A test seam for the release guard (collar phase 3). `SHEEP_BUNDLE_BREAK=sheep`
 * or `=pi-client` appends a top-level `throw` to that bundle after it is
 * built and checked, so a release made with it fails the package ring at
 * the first step that loads the bundle, and `pnpm release` refuses to move
 * or push `release`. Proving the guard is the seam's only use; under `CI`
 * it is refused outright, so a build that could be pushed can never carry it.
 */
function breakOnPurpose() {
  const which = process.env.SHEEP_BUNDLE_BREAK;
  if (!which) return;
  if (process.env.CI) throw new Error(`SHEEP_BUNDLE_BREAK=${which} is a laptop's test seam for the release guard, refused under CI`);
  const file = { sheep: "sheep.mjs", "pi-client": "pi-client.mjs" }[which];
  if (!file) throw new Error(`SHEEP_BUNDLE_BREAK=${which}: sheep or pi-client`);
  appendFileSync(join(distDir, file), '\nthrow new Error("broken on purpose: SHEEP_BUNDLE_BREAK was set when this bundle was built");\n');
  console.error(`bundle: dist/${file} broken on purpose (SHEEP_BUNDLE_BREAK=${which}); the ring must refuse this release`);
}

/**
 * Builds `dist/` and `home/` from scratch; returns the wrangler version the
 * Worker was built with and the files written. `stamp` is the release's
 * `{ commit, builtAt }`, defined into the Worker and named in the config;
 * absent, the build is a checkout's.
 */
export async function buildRelease(stamp) {
  if (stamp !== undefined) {
    for (const key of ["commit", "builtAt"]) {
      if (typeof stamp[key] !== "string" || stamp[key] === "") throw new Error(`buildRelease: the stamp needs a ${key}`);
    }
  }
  checkPinsAgainstFork();
  for (const required of [join(codingAgent, "dist", "index.js"), join(piRoot, "packages", "chord", "dist", "index.js"), join(root, "packages", "cli", "src", "cli.ts")]) {
    if (!existsSync(required)) throw new Error(`missing ${relative(root, required)}: build the fork's packages first (AGENTS.md)`);
  }
  rmSync(distDir, { recursive: true, force: true });
  rmSync(homeDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  const files = [];
  files.push(await bundleEntry("dist/sheep.mjs", join(root, "packages", "cli", "src", "cli.ts"), join(distDir, "sheep.mjs")));
  files.push(await bundleEntry("dist/pi-client.mjs", join(codingAgent, "src", "experimental", "cli.ts"), join(distDir, "pi-client.mjs")));
  files.push(await bundleEntry("dist/image-resize-worker.js", join(codingAgent, "src", "utils", "image-resize-worker.ts"), join(distDir, "image-resize-worker.js")));
  chmodSync(join(distDir, "pi-client.mjs"), 0o755);
  breakOnPurpose();

  const guide = join(root, "packages", "cli", "agent-guide.md");
  copyFileSync(guide, join(distDir, "agent-guide.md"));
  files.push({ file: "dist/agent-guide.md", bytes: readFileSync(guide).length });

  const themeSource = join(codingAgent, "src", "modes", "interactive", "theme");
  const themeTarget = join(distDir, "modes", "interactive", "theme");
  mkdirSync(themeTarget, { recursive: true });
  for (const name of readdirSync(themeSource).filter((entry) => entry.endsWith(".json"))) {
    copyFileSync(join(themeSource, name), join(themeTarget, name));
    files.push({ file: relative(root, join(themeTarget, name)), bytes: readFileSync(join(themeTarget, name)).length });
  }

  const worker = emitWorker(stamp);
  files.push({ file: "home/worker.mjs", bytes: worker.bytes });
  files.push({ file: "home/wrangler.jsonc", bytes: readFileSync(join(homeDir, "wrangler.jsonc")).length });
  return { wrangler: worker.wrangler, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildRelease()
    .then(({ wrangler, files }) => {
      for (const { file, bytes } of files) console.log(`${file}\t${(bytes / 1024).toFixed(0)} KiB`);
      console.log(`Worker built with wrangler ${wrangler}; a checkout build (0.0.0-checkout), the config's container still the Dockerfile`);
    })
    .catch((error) => {
      console.error(`bundle: ${error.message}`);
      process.exit(1);
    });
}
