# Smit: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node; pi is a dependency; findings are one dated line
of about forty words; `main` stays sources only and a phase's proof runs
in a ring; steps marked **⚑ provision** create, change, or delete a
cloud resource, spend money, or need a login. `/conduct smit` is the
procedure. Phase citations name their project: `smit phase 0`, never a
bare "phase 0".

**One rule for this project.** Nothing in the cell, `scripts/bundle.mjs`,
or `scripts/release.mjs` changes. The Worker already reads the define
and the release already writes it; a proof that needs either to behave
differently has found a second bug, which is a finding and a stop, not
a patch.

---

**Where we are: smit phase 0 is PART-DONE, 13 September 2026.** A
checkout's `sheep home deploy` defines its smit into the Worker, waits
for `GET /home` to report it, and refuses a checkout git cannot name a
commit for; `pnpm test` holds with journeys 1 and 2 against the fakes,
and the checkout's wrangler dry run emits a Worker carrying the smit.
What waits is a person: journey 3 step 2, three checkout deploys and a
delete of `sheep-smit-<sha>` on the shepherd's account, typed by the
shepherd. Nothing waits on work.

One phase, because the mark, the wait that sees it, and the refusal are
one function and one branch of `runDeploy`, and one walk proves them.

**Deliberately open.** Postponed on purpose: marking the local home;
the checkout command's own commit in `sheep home`; refusing a dirty
deploy; a ring for the checkout deploy.

---

## Phase 0: The smit

**Closes:** journeys 1 and 2 in full, and journey 3.

**Work:** `packages/cli/src/local.ts`: `checkoutStamp(root, now)`
beside `readStamp`, the seven-character HEAD with `-dirty` when `git
status --porcelain` prints anything, and the given time; undefined when
git cannot answer (a module of its own if importing `checkoutRoot` from
`setup.ts` would cycle). `packages/cli/src/deploy.ts`: the mark, the
manifest's commit and time under the release and the smit under a
checkout, refused with exit 2 and one sentence naming the release
install before the join store when there is none; `--define
SHEEP_BUILD:<json>` on the wrangler `deploy` call under a checkout, the
encoding `scripts/bundle.mjs`'s `emitWorker` uses; the stamp wait
comparing the home's build to the mark; `build.deployed` in the report;
the `not compared` branch of `stamp:` gone from `cli.ts`. The comments
in `deploy.ts` and `packages/cell/wrangler.jsonc` that call a checkout
deploy unsupported say what it is now. `packages/cli/src/usage.ts`,
`packages/cli/agent-guide.md`, and `README.md`: a sentence where a
sentence is owed, paid for by cutting; the guide's word guard does not
move.

Tests: `packages/cli/test/smit.test.ts` in the ring the guard accepts
(checkout, expected: it spawns git over a scratch repository in a temp
directory and never the command): one commit gives the seven characters
and no marker; an untracked file, a modified tracked file, and a
submodule moved each give `-dirty`; `now` is carried through; a
directory that is not a repository gives undefined. Listed in
`scripts/rings.mjs`. `packages/cli/test/deploy.test.ts` (command ring):
a deploy from this checkout records a wrangler `deploy` call carrying
the define, whose commit is this checkout's HEAD as the test reads it
from git, with `-dirty` exactly when the test's own `git status
--porcelain` prints anything, and whose time is within the test's
window; the fake wrangler hands the define's stamp to the fake station
through the `_fake` routes the way `deploy` registers the Worker, so
`/home` answers it, the report says `stamp: moved`, and the JSON
report's `build.home` equals `build.deployed`; a redeploy moves again;
the `stamp: not compared` expectations go; journey 2's refusal, with
git made unable to answer for the spawned command (an environment such
as `GIT_DIR` pointing nowhere, stripped by nothing else), exits 2 with
no wrangler call and no config.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings, the new
file in its ring; `pnpm --filter @sheep/cli typecheck` exits 0.
Falsified by at least two mutations: the define dropped from the deploy
args (the recorded call and `stamp: moved` fail), and the dirty marker
never appended (the unit test's untracked-file case fails). Then, from
the checkout with the real wrangler and no account, `wrangler deploy
--dry-run --outdir <tmp> --config packages/cell/wrangler.jsonc --env pen
--define 'SHEEP_BUILD:…'` emits a Worker with the commit in it, as
`emitWorker` checks for the release; if the dry run trips on the
container block, that is a finding and the walk carries the proof.
**⚑** journey 3 step 2: from a scratch kennel on this machine, the
checkout's `sheep home deploy --name sheep-smit-<sha>` three times and
`sheep home delete` once on the shepherd's account: one Worker, a pen
image built here and pushed by wrangler, a few container minutes, typed
by the shepherd.

**Status: PART-DONE.** 2026-09-13. Every inner ring holds with the smit defined, waited for, and refused without a commit; the walk on the shepherd's account waits on the shepherd.

**Findings:**

- **2026-09-13 — The dry run needs no account and marks the Worker.** `wrangler deploy --dry-run --env pen --define SHEEP_BUILD:…` from the checkout built the pen image with local Docker and emitted `homeBuild()` as `if (false)` then `JSON.parse('{"commit":"c761651-dirty",…}')`.
- **2026-09-13 — `smit.test.ts` is in the command ring, not checkout.** The guard counts any `spawnSync(` as spawning, and the test spawns git over scratch repositories, as pen's `git.test.ts` does; the guard accepts it there.
- **2026-09-13 — A clean checkout with `vendor/pi` built is not dirty.** `git status --porcelain --ignore-submodules=none` printed nothing on c761651 after the pi build, so a committed tree deploys as its bare commit.
- **2026-09-13 — The smit costs about 35 ms of blocking git before the account read,** which lost a race the stile's spinner tests always ran with 60 to 80 ms spare; those two tests now hold the fake wrangler's deploy four seconds. Main passed the suite, the change failed it twice.
- **2026-09-13 — The fake station answers the last deploy's define at `/home`.** Without it every checkout redeploy in the command ring polled the full minute against the fixed stamp; a station with no linked account still answers `STAMP`, as the release's does.
- **2026-09-13 — Mutations held:** the define dropped failed seven deploy tests, four by the stamp wait's timeout; `-dirty` never appended failed three of five smit tests. Cost: 22 minutes of a subagent and 23 on the race, 60 of verification.
- **2026-09-13 — Open: journey 3 step 2, the walk on the shepherd's account.** Three checkout deploys (clean, a tracked edit, reverted), `sheep home`, the release's `sheep home` against it, and a delete of `sheep-smit-<sha>` from a scratch kennel; typed by the shepherd.
