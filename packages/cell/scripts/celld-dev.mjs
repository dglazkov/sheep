#!/usr/bin/env node
// Runs this project on a local celld node: the Wrangler config plus .dev.vars as string vars,
// written to wrangler.celld.dev.json, with esbuild located for celld.
//
// celld runs the top-level config, which is lamb's, and refuses keys it does not know; the `env`
// key (the `pen` environment, with its `containers` entry and the `PEN_CONTAINER` binding) is
// dropped, since celld has no container support and must never see one. Pen on celld is
// configuration on top of lamb's config: `PEN_STARTER_URL` names a starter beside the node
// (`pnpm --filter @lamb/pen starter`). Every `PEN_*` name, `LAMB_PROVIDER`, and `LAMB_MODEL` set in
// this process's environment is passed as a var too, over .dev.vars, so a local pen walk needs no
// edit to .dev.vars, which holds the secrets.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");

// JSONC to JSON: line and block comments dropped outside strings, then trailing commas. Wrangler reads the file this way.
function stripJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

const { $schema: _schema, env: _environments, ...config } = JSON.parse(stripJsonc(readFileSync(join(here, "wrangler.jsonc"), "utf8")));
const vars = { ...(config.vars ?? {}) };
if (existsSync(join(here, ".dev.vars"))) {
  for (const line of readFileSync(join(here, ".dev.vars"), "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) vars[match[1]] = match[2];
  }
}
const passed = [];
for (const [name, value] of Object.entries(process.env)) {
  if (value === undefined || value === "") continue;
  if (name.startsWith("PEN_") || name === "LAMB_PROVIDER" || name === "LAMB_MODEL") {
    vars[name] = value;
    passed.push(name);
  }
}
if (passed.length > 0) console.error(`celld-dev: from the environment: ${passed.join(", ")}`);
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
