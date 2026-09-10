#!/usr/bin/env node
/**
 * `pnpm test` — every ring inside this checkout, which is what CI runs and
 * what a phase's proof means. `pnpm test --ring <name>` runs one of them.
 *
 *   pnpm test                    checkout, command, and home: everything here
 *   pnpm test --ring checkout    this process alone; the inner loop
 *   pnpm test --ring command     the built command against fakes
 *   pnpm test --ring home        a real `wrangler dev` home
 *   pnpm test --list             what is in each ring, and nothing run
 *
 * The four outer rings — package, machine, dog, account — are `pnpm
 * hermetic --ring <name>`, and prove a release rather than a checkout.
 * `scripts/rings.mjs` holds the membership and the reasoning for both.
 *
 * A ring reaches the packages as `SHEEP_RING`, which each package's vitest
 * config turns into an `include`. Anything this script does not recognise is
 * passed on to `pnpm -r test` untouched, so `pnpm test --reporter=dot` and
 * the rest still work.
 */
import { spawnSync } from "node:child_process";
import { RING_NAMES, RING_NEEDS, RINGS } from "./rings.mjs";

const argv = process.argv.slice(2);
const rest = [];
let ring;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--ring") {
    ring = argv[++i];
    continue;
  }
  if (argv[i].startsWith("--ring=")) {
    ring = argv[i].slice("--ring=".length);
    continue;
  }
  rest.push(argv[i]);
}

if (rest.includes("--list")) {
  for (const name of RING_NAMES) {
    console.log(`\n${name} — ${RING_NEEDS[name]}`);
    for (const file of RINGS[name]) console.log(`    ${file}`);
  }
  console.log(`\nthe outer rings are \`pnpm hermetic --ring package|machine|dog|account\`.`);
  process.exit(0);
}

if (ring !== undefined && !RING_NAMES.includes(ring)) {
  console.error(`no such ring: ${ring}`);
  console.error(`inside this checkout: ${RING_NAMES.join(", ")}`);
  console.error(`a release's rings are \`pnpm hermetic --ring package|machine|dog|account\`.`);
  process.exit(2);
}

if (ring) console.log(`the ${ring} ring: ${RINGS[ring].length} files, ${RING_NEEDS[ring]}\n`);

const run = spawnSync("pnpm", ["-r", "--workspace-concurrency=1", "test", ...rest], {
  stdio: "inherit",
  env: ring ? { ...process.env, SHEEP_RING: ring } : process.env,
});
process.exit(run.status ?? 1);
