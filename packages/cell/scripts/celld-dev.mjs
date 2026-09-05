#!/usr/bin/env node
// Runs this project on a local celld node: the Wrangler config plus .dev.vars as string vars,
// written to .celld/wrangler.dev.json, with esbuild located for celld.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(here, "wrangler.jsonc"), "utf8").replace(/^\s*"\$schema".*\n/m, ""));
const vars = { ...(config.vars ?? {}) };
if (existsSync(join(here, ".dev.vars"))) {
  for (const line of readFileSync(join(here, ".dev.vars"), "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) vars[match[1]] = match[2];
  }
}
// celld wants `main` inside the project, so the generated config sits beside wrangler.jsonc (gitignored).
const out = join(here, "wrangler.celld.dev.json");
writeFileSync(out, JSON.stringify({ ...config, vars }, null, 2));
const require = createRequire(import.meta.url);
const esbuild = join(dirname(require.resolve("esbuild/package.json")), "bin", "esbuild");
const celld = process.env.CELLD ?? "celld";
try {
  execFileSync(celld, ["--version"], { stdio: "ignore" });
} catch {
  console.error("celld not found; install it with: curl -fsSL https://celld.dev/install.sh | sh");
  process.exit(1);
}
const child = spawn(celld, ["dev", out, ...process.argv.slice(2).filter((arg) => arg !== "--")], { stdio: "inherit", env: { ...process.env, CELLD_ESBUILD: esbuild } });
child.on("exit", (code) => process.exit(code ?? 0));
