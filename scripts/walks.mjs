/**
 * The account ring's walks (draft phase 0): which journey's steps run on
 * the shepherd's account together, on a station of their own, named the
 * way `rings.mjs` names the inner rings. The ring used to be one sequential
 * walk that re-proved every project since collar on one station, thirty to
 * forty-five minutes when it held, and a platform fault anywhere sank the
 * run before the step it was run for. Drafting is what a shepherd does at
 * the gate: the mob is sorted into pens, each pen gets what it needs, and
 * the pens are worked at once.
 *
 *   a walk       one journey's steps on the account, from a fresh world to
 *                its station deleted: `pnpm hermetic --ring account --walk
 *                <name> --yes <ref>`
 *   its station  `sheep-hermetic-<sha>-<walk>` (`stationName`; the collie's
 *                is `-c`, for the stile's screen), and for the two walks
 *                that deploy through the stile's sitting, that name with
 *                `-t`; nothing another walk touches
 *   a sibling    another walk of the same release on the account at the
 *                same time, told by the prefix `sheep-hermetic-<sha>-`
 *   the rerun    the one command that runs a walk again, alone (`rerunLine`)
 *
 * **The table below is the truth, and the guard keeps it true.** The steps
 * are the ring's own, by name, unchanged in what they run and assert; each
 * lives in its walk's function in `hermetic.mjs`. A guard in the checkout
 * ring (`packages/cli/test/walks.test.ts`) reads that script for the steps
 * it prints (`stepsInScript`) and fails when a walk names a step the script
 * lacks, or the script prints a step no walk names. Neither half can drift
 * alone. The package ring's and the dog ring's step names are written down
 * here too, so the guard can tell the account's steps from them.
 */

/** The walks, in the order the design's table gives them. */
export const WALK_NAMES = ["upgrade", "station", "second", "pasture", "fold", "spool", "bleat", "bell", "tether", "stile", "collie"];

/**
 * Each walk: its steps in the order they run, what it needs beyond the
 * account token, a sentence, and about how long it takes. `needs` is what
 * the ring checks before anything is deployed; a walk that lacks one of
 * them refuses with exit 2. `older` is the upgrade walk's older release,
 * `docker` a Docker that answers, `env` variables in the environment, `key`
 * the model key, `isocan` dev.isocan.io answering, and `harness` the stile's
 * terminal harness from this checkout (the command ring's).
 */
export const WALKS = {
  upgrade: {
    steps: ["a1", "a2", "a2b", "sh1", "up", "sh2", "sh3", "sh4", "n1", "a6"],
    needs: { older: true },
    about: "the older release installed and deployed, the tip's notice, the upgrade over it with a sheep mid-turn, and every row kept (station journey 4, shear journey 5)",
    minutes: 8,
  },
  station: {
    steps: ["d1", "st", "a3", "m1", "e2", "s2", "a4", "a5", "n1", "a6"],
    needs: {},
    about: "the station's own journey: the stop with nothing kept, a sheep from a container, the mint, the two looks, a local home beside it, the redeploy (station journey 1, mint, eyes, serve)",
    minutes: 6,
  },
  second: {
    steps: ["d1", "a7", "t2", "n1", "a6"],
    needs: { docker: true, harness: true },
    about: "a second machine, a container, joins the station through the stile while a turn runs and watches a turn the first machine left (station journey 2, stile journey 3)",
    minutes: 7,
  },
  pasture: {
    steps: ["d1", "s1", "a8", "n1", "a6"],
    needs: { env: ["LAMB_PLAYGROUND_TOKEN"] },
    about: "earmark's journey 2 and pasture's journey 1 against the scratch repository: one sheep pushing with its own token and its sibling refused, then two pushing with the pasture's; s1 first, since it ends its own two and a8 leaves its two idle under the cap of three",
    minutes: 4,
  },
  fold: {
    steps: ["d1", "f1", "n1", "a6"],
    needs: {},
    about: "a pasture's cache on the station: one sheep born cold, one born warm, the birth entries and the put-back's ms (fold journey 3)",
    minutes: 4,
  },
  spool: {
    steps: ["d1", "f2", "n1", "a6"],
    needs: {},
    about: "the same with a 640 MiB file in the cache, and the agent's own peak read from /proc/1/status (spool journey 3)",
    minutes: 8,
  },
  bleat: {
    steps: ["d1", "b1", "n1", "a6"],
    needs: {},
    about: "what a dog is told while a sheep waits on its pasture's setup.sh: the line on stderr, status, and the block in the log (bleat journey 4)",
    minutes: 3,
  },
  bell: {
    steps: ["d1", "b2", "h1", "n1", "a6"],
    needs: {},
    about: "a held `sheep attach --json` read line by line as the turn runs, then the hill's page reading that sheep with a seat alone (bell journey 4, hill journey 5)",
    minutes: 3,
  },
  tether: {
    steps: ["d1", "r1", "n1", "a6"],
    needs: {},
    about: "a held `sheep wait` through two Worker versions of the station, the reply returned and the interruption in the log (tether journey 5)",
    minutes: 4,
  },
  stile: {
    steps: ["t1"],
    needs: { key: true, harness: true },
    about: "the shepherd's sitting on a station of its own, `sheep setup` typed through the ring's terminal, then the dog with nothing in its environment (stile journeys 1 and 4)",
    minutes: 4,
  },
  collie: {
    steps: ["t1", "co0", "co1", "co2", "co3", "co4", "co5", "co6", "co7", "co8", "co9", "co", "c-end"],
    needs: { key: true, harness: true, isocan: true },
    about: "the collie's journey 1 whole on the sitting's station with a real model and an isocan identity of the ring's own at dev.isocan.io; `co` is its cleanup line",
    minutes: 12,
  },
};

/**
 * The steps every walk prints after its own and the table does not repeat:
 * the `ps` watch's line, no secret in any process's arguments through the
 * whole walk.
 */
export const EVERY_WALK = ["walk"];

/**
 * The steps more than one walk names, each with why. Every other step is
 * one journey's and belongs to exactly one walk; the guard says so.
 */
export const SHARED_STEPS = {
  d1: "the prologue: the release deployed straight, on every walk that has no older release and no sitting",
  n1: "the epilogue: every sheep the walk minted ended",
  a6: "the epilogue: the station deleted and the account listed",
  t1: "the sitting: the stile's walk and the collie's both deploy through it",
  walk: "the ps line, on every walk",
};

/**
 * The package ring's step names, which the guard leaves to that ring: the
 * seven of collar's journey 1, kennel's, the eyes' e1, serve's s1, the
 * docker walk's d1 to d4, the collie's refusal c1 and c2, the stile's t0,
 * and the hill's h0. Two of these names the account ring uses for steps of
 * its own (`s1` is earmark's there, `d1` the deploy), so the guard reads
 * those two by name and cannot tell which ring printed them.
 */
export const PACKAGE_RING_STEPS = ["step 1", "step 2", "step 3", "step 4", "step 5", "step 6", "step 7", "k1.2", "k1.3", "k1.4", "k1.5", "k2.1", "k2.2", "e1", "s1", "d1", "d2", "d3", "d4", "c1", "c2", "t0", "h0"];

/** The dog ring prints a transcript and its assertions, not step lines; it has no names for the guard to set aside. */
export const DOG_RING_STEPS = [];

/** The steps a walk prints, in order: its own from the table, then the ones every walk prints. */
export function stepsOf(name) {
  return [...WALKS[name].steps, ...EVERY_WALK];
}

/** The walks that name a step. */
export function walksOf(step) {
  return WALK_NAMES.filter((name) => stepsOf(name).includes(step));
}

/**
 * The step names a script prints, read from its source: every literal
 * `ring.ok("…"`, `ring.fail("…"`, and `ring.skip("…"` (and `this.` for the
 * Ring's own methods), and every step handed to a function by name, as a
 * default parameter (`step = "b2"`) or at a call (`step: "e2"`), since the
 * journeys print their lines through the `step` they were given.
 */
export function stepsInScript(source) {
  const found = new Set();
  for (const match of source.matchAll(/\b(?:ring|this)\.(?:ok|skip|fail)\(\s*"([^"]+)"/g)) found.add(match[1]);
  for (const match of source.matchAll(/\bstep(?:\s*=\s*|:\s*)"([^"]+)"/g)) found.add(match[1]);
  return found;
}

/**
 * The files a script imports from beside itself (`from "./x.mjs"`), read
 * from its source: what every build context must copy in with it, since a
 * container has nothing the context did not give it. Draft phase 0's second
 * walk failed at a7 because this script had begun importing `walks.mjs`
 * and the contexts copied the script alone; the copy is derived from the
 * imports now, and the guard checks the Dockerfile against the same list.
 */
export function importedBeside(source) {
  return [...source.matchAll(/^import\b[^;]*?\bfrom\s+"\.\/([^"/]+)";/gm)].map((match) => match[1]);
}

/** The prefix every name of one release's walks begins with; the sibling rule sets these aside. */
export const prefixOf = (sha7) => `sheep-hermetic-${sha7}-`;

/**
 * A walk's station: `sheep-hermetic-<sha>-<walk>`. The two walks that deploy
 * through the sitting deploy `<that>-t`. The collie's is `-c`, as
 * `--collie-only` named it: its Worker is `<station>-t-collie`, and the
 * stile's screen is 80 columns, off which co3 reads that Worker's whole
 * address; with `-collie` the address ran to 67 characters, was cut with
 * `…` on the step line and wrapped at the finish, and co3 refused it. A
 * name on the account is also a name on a screen.
 */
export function stationName(sha7, walk) {
  return `${prefixOf(sha7)}${walk === "collie" ? "c" : walk}`;
}

/**
 * Every name a walk makes on the account, from its station's name: the
 * Workers (and container applications, which share the Worker's name) and
 * the KV namespaces (each station's `-join` store). These are refused as
 * leftovers before anything is deployed and asserted absent after.
 */
export function ownNames(station, walk) {
  const sits = WALKS[walk].steps.includes("t1");
  const workers = sits ? [`${station}-t`, ...(walk === "collie" ? [`${station}-t-collie`] : [])] : [station];
  const namespaces = sits ? [`${station}-t-join`] : [`${station}-join`];
  return { workers, namespaces };
}

/**
 * The sibling rule: a listing with every name of the form
 * `sheep-hermetic-<sha>-*` set aside, so a sibling's station, its `-t`, its
 * `-collie`, its `-join` store, mid-deploy or mid-delete, is not this walk's
 * to count. The walk's own names go too, since they have the form; what the
 * walk asserts of them stays exact, through `leftovers`.
 */
export function siblingsAside(listing, sha7) {
  const prefix = prefixOf(sha7);
  const ours = (name) => name.startsWith(prefix);
  return {
    workers: listing.workers.filter((worker) => !ours(worker)),
    applications: listing.applications.filter((application) => !ours(application.name)),
    namespaces: listing.namespaces.filter((title) => !ours(title)),
  };
}

/** What a listing holds of a walk's own names: Workers, container applications, and KV namespaces, each named for the refusal. */
export function leftovers(listing, names) {
  return [
    ...listing.workers.filter((worker) => names.workers.includes(worker)).map((worker) => `Worker ${worker}`),
    ...listing.applications.filter((application) => names.workers.includes(application.name)).map((application) => `container application ${application.name} (${application.id})`),
    ...listing.namespaces.filter((title) => names.namespaces.includes(title)).map((title) => `KV namespace ${title}`),
  ];
}

/**
 * The rerun line: the one command that runs a walk again, alone. It starts
 * with `pnpm hermetic --ring account`, the prefix the shepherd's allow rule
 * matches; `flags` are the ones the run was given beyond `--walk` and
 * `--yes` (`--older`, `--repo`, `--commit`, `--name`), and `ref` is the ref
 * or spec as given, or the default the ring took.
 */
export function rerunLine(walk, ref, flags = []) {
  return ["pnpm", "hermetic", "--ring", "account", "--walk", walk, "--yes", ...flags, ref].join(" ");
}

/** What a walk needs beyond the token, as a sentence for `--list` and the refusal. */
export function needsOf(walk) {
  const needs = WALKS[walk].needs;
  const parts = [];
  if (needs.older) parts.push("the older release (--older <ref>, or the ref's first parent when it is a release commit)");
  if (needs.docker) parts.push("Docker");
  for (const variable of needs.env ?? []) parts.push(`${variable} in the environment`);
  if (needs.key) parts.push("ANTHROPIC_API_KEY in the environment");
  if (needs.isocan) parts.push("dev.isocan.io answering");
  if (needs.harness) parts.push("the stile's terminal harness (this checkout, built)");
  return parts.length === 0 ? "nothing" : parts.join(", ");
}

/** `--list`'s text: each walk with its steps, what it needs beyond the token, and about how long. */
export function listText() {
  const width = Math.max(...WALK_NAMES.map((name) => name.length));
  const lines = ["the account ring's walks: pnpm hermetic --ring account --walk <name> [--yes] [--dry-run] [ref|spec]", ""];
  for (const name of WALK_NAMES) {
    const walk = WALKS[name];
    lines.push(`  ${name.padEnd(width)}  ${walk.steps.join(" ")}`);
    lines.push(`  ${" ".repeat(width)}  needs ${needsOf(name)}; about ${walk.minutes} min`);
    lines.push(`  ${" ".repeat(width)}  ${walk.about}`);
  }
  lines.push("");
  lines.push("every walk installs the release into a fresh world, deploys a station of its own (sheep-hermetic-<sha>-<walk>, the collie's -c; the stile's");
  lines.push("and the collie's through the sitting, with -t), and ends with the `walk` line: the ps watch's samples, no secret in any process's");
  lines.push("arguments. A walk that fails deletes its station and prints the line that runs it again, alone. The set is draft phase 1.");
  return lines.join("\n");
}

/* The set (draft phase 1): every walk, run together by a parent that runs each as a child process. */

/**
 * How many walks the set runs at once by default. Four, because the
 * account had rented every container a walk asked for one station at a
 * time and had not been asked for four stations' worth at once; draft
 * phase 0's finding then ran five at a time on the account and every one
 * held, so four is under evidence. `--jobs 1` is the set in order.
 */
export const JOBS_DEFAULT = 4;

/**
 * What a walk needs beyond the token that a machine lacks, as short
 * reasons, from what the machine has: `docker` (an engine answers), `env`
 * (the variables present), `key` (`ANTHROPIC_API_KEY`), `harness` (the
 * stile's terminal harness from this checkout), `isocan` (dev.isocan.io
 * answering). Empty when the walk can run. The child refuses on the same
 * needs, with fuller sentences; the parent leaves the walk out on these.
 */
export function lackingOf(walk, has) {
  const needs = WALKS[walk].needs;
  const lacking = [];
  if (needs.docker && !has.docker) lacking.push("Docker");
  for (const variable of needs.env ?? []) if (!(has.env ?? []).includes(variable)) lacking.push(`${variable} in the environment`);
  if (needs.key && !has.key) lacking.push("ANTHROPIC_API_KEY in the environment");
  if (needs.harness && !has.harness) lacking.push("the stile's terminal harness");
  if (needs.isocan && !has.isocan) lacking.push("dev.isocan.io answering");
  return lacking;
}

/**
 * Which walks a machine's set holds, from what it has: every walk but the
 * collie, which joins when named in `--walk` or when `--collie` is given
 * (it spends the key on a real model, and stands up an identity at
 * dev.isocan.io); `named` narrows the set to those walks. A walk the
 * machine cannot run is left out with why, in the table's order, and the
 * report's not-checked list names it too.
 */
export function setOf({ docker = false, env = [], key = false, harness = false, isocan = false, collie = false, named = [] } = {}) {
  const has = { docker, env, key, harness, isocan };
  const wanted = named.length > 0 ? [...new Set([...named, ...(collie ? ["collie"] : [])])] : WALK_NAMES.filter((walk) => walk !== "collie" || collie);
  const members = [];
  const leftOut = [];
  for (const walk of WALK_NAMES) {
    if (!wanted.includes(walk)) {
      // The whole set names the collie it left out; a set narrowed by --walk left out everything else on purpose.
      if (walk === "collie" && named.length === 0) leftOut.push({ walk, why: "not named: `--collie`, or `--walk collie`, runs it (a real model's turn, and an identity at dev.isocan.io)" });
      continue;
    }
    const lacking = lackingOf(walk, has);
    if (lacking.length > 0) leftOut.push({ walk, why: `this machine lacks ${lacking.join(" and ")}` });
    else members.push(walk);
  }
  return { members, leftOut };
}

/**
 * A child's outcome, read from its exit code and the last lines phase 0
 * prints: `account ring: ok (the <walk> walk, N lines held, Ss)` or
 * `account ring: FAILED at <step> (the <walk> walk, Ss)`. A child that
 * printed neither (refused at its preflight with exit 2, or killed) is
 * failed at `preflight`, with no seconds of its own.
 */
export function readOutcome(text, code) {
  const held = /^account ring: ok \(the (\S+) walk, (\d+) lines held, (\d+)s\)$/m.exec(text);
  if (held && code === 0) return { walk: held[1], status: "held", lines: Number(held[2]), seconds: Number(held[3]) };
  const failed = /^account ring: FAILED at (\S+) \(the (\S+) walk, (\d+)s\)$/m.exec(text);
  if (failed) return { walk: failed[2], status: "failed", step: failed[1], seconds: Number(failed[3]) };
  const refused = /^hermetic: (.+)$/m.exec(text);
  return { status: "failed", step: "preflight", why: refused?.[1] ?? `exit ${code} with no last line` };
}

/** The items under a child's `not checked by the account ring:` line, each without its `  - `, for the parent's union. */
export function notCheckedIn(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === "not checked by the account ring:");
  if (start < 0) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  - ")) break;
    items.push(line.slice(4));
  }
  return items;
}

/**
 * The set's report: one line per walk, in the table's order, from each
 * outcome (`held` with its lines and seconds, `failed` at a step with its
 * seconds, `left out` with why); then the rerun line for each failure.
 * `outcomes` is `{ [walk]: outcome }`; `rerun(walk)` gives the line.
 */
export function reportLines(outcomes, rerun) {
  const width = Math.max(...WALK_NAMES.map((name) => name.length));
  const lines = [];
  for (const walk of WALK_NAMES) {
    const outcome = outcomes[walk];
    if (outcome === undefined) continue;
    const name = walk.padEnd(width);
    if (outcome.status === "held") lines.push(`  ${name}  held  ${outcome.lines} lines  ${outcome.seconds}s`);
    else if (outcome.status === "failed") lines.push(`  ${name}  FAILED at ${outcome.step}${outcome.seconds !== undefined ? `  ${outcome.seconds}s` : ""}${outcome.why ? `  (${outcome.why})` : ""}`);
    else lines.push(`  ${name}  left out: ${outcome.why}`);
  }
  const failed = WALK_NAMES.filter((walk) => outcomes[walk]?.status === "failed");
  if (failed.length > 0) {
    lines.push(`run again, alone${failed.length > 1 ? ", each" : ""}:`);
    for (const walk of failed) lines.push(`  ${rerun(walk)}`);
  }
  return lines;
}
