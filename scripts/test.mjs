#!/usr/bin/env node
/**
 * `pnpm test` — every ring inside this checkout, the home ring included,
 * because the machine you are on can start a `wrangler dev` and CI's
 * runner should not be trusted to. `pnpm test --ring <name>` runs one.
 *
 *   pnpm test                    checkout, command, and home: everything here
 *   pnpm test --ring checkout    this process alone; the inner loop
 *   pnpm test --ring command     the built command against fakes
 *   pnpm test --ring home        the walk: a real `wrangler dev` home
 *   pnpm test --ci               the rings CI runs (checkout and command)
 *   pnpm test --list             what is in each ring, and nothing run
 *
 * `--ring` may be given more than once, or as a comma-separated list.
 *
 * The home ring is not CI's (see `RING_ON_CI` in `rings.mjs`): it is a
 * walk, and a walk is conducted on a machine with someone watching. A run
 * that leaves it out says so at the end, so that "green" is never read as
 * more than it was. The four outer rings — package, machine, dog, account
 * — are `pnpm hermetic --ring <name>`, and prove a release rather than a
 * checkout.
 */
import { spawnSync } from "node:child_process";
import { CI_RINGS, RING_NAMES, RING_NEEDS, RINGS } from "./rings.mjs";

const argv = process.argv.slice(2);
const rest = [];
const rings = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--ci") {
    rings.push(...CI_RINGS);
    continue;
  }
  if (arg === "--ring") {
    rings.push(...String(argv[++i] ?? "").split(","));
    continue;
  }
  if (arg.startsWith("--ring=")) {
    rings.push(...arg.slice("--ring=".length).split(","));
    continue;
  }
  rest.push(arg);
}

if (rest.includes("--list")) {
  for (const name of RING_NAMES) {
    console.log(`\n${name} — ${RING_NEEDS[name]}${RING_ON_CI_NOTE(name)}`);
    for (const file of RINGS[name]) console.log(`    ${file}`);
  }
  console.log(`\nthe outer rings are \`pnpm hermetic --ring package|machine|dog|account\`.`);
  process.exit(0);
}

function RING_ON_CI_NOTE(name) {
  return CI_RINGS.includes(name) ? "" : "  (not run by CI; walked here)";
}

const chosen = [...new Set(rings.map((ring) => ring.trim()).filter(Boolean))];
const unknown = chosen.filter((ring) => !RING_NAMES.includes(ring));
if (unknown.length > 0) {
  console.error(`no such ring: ${unknown.join(", ")}`);
  console.error(`inside this checkout: ${RING_NAMES.join(", ")}`);
  console.error(`a release's rings are \`pnpm hermetic --ring package|machine|dog|account\`.`);
  process.exit(2);
}

const running = chosen.length > 0 ? chosen : RING_NAMES;
if (chosen.length > 0) {
  const files = running.reduce((total, ring) => total + RINGS[ring].length, 0);
  console.log(`the ${running.join(" and ")} ring${running.length > 1 ? "s" : ""}: ${files} files\n`);
}

const run = spawnSync("pnpm", ["-r", "--workspace-concurrency=1", "test", ...rest], {
  stdio: "inherit",
  env: chosen.length > 0 ? { ...process.env, SHEEP_RING: chosen.join(",") } : process.env,
});

// What was not run is part of the result. Said after the suites so it is the last thing read.
const skipped = RING_NAMES.filter((ring) => !running.includes(ring));
if (run.status === 0 && skipped.length > 0) {
  console.log(`\nnot run: the ${skipped.join(" and ")} ring${skipped.length > 1 ? "s" : ""}.`);
  for (const ring of skipped) console.log(`  pnpm test --ring ${ring}    ${RING_NEEDS[ring]}`);
}

process.exit(run.status ?? 1);
