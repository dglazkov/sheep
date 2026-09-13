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

**Where we are: smit is done, 13 September 2026. Its one phase is
CLOSED.** A checkout's `sheep home deploy` defines its smit into the
Worker, waits for `GET /home` to report it, and refuses a checkout git
cannot name a commit for; the command ring holds journeys 1 and 2, and
journey 1 was walked on the shepherd's account as `sheep-smit-a2b17e7`,
deleted after. Nothing waits.

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

**Status: CLOSED.** 2026-09-13. Every inner ring holds, and the walk on the shepherd's account saw a clean, a dirty, and a reverted deploy each move the stamp, the release warn of skew, and the delete end it.

**Findings:**

- **2026-09-13 — The dry run needs no account and marks the Worker:** `wrangler deploy --dry-run --env pen --define SHEEP_BUILD:…` built the pen image with Docker and emitted `homeBuild()` folded to `JSON.parse('{"commit":"c761651-dirty",…}')`.
- **2026-09-13 — `smit.test.ts` is in the command ring:** the guard counts any `spawnSync(` as spawning, and it spawns git over scratch repositories, as pen's `git.test.ts` does.
- **2026-09-13 — A clean checkout with `vendor/pi` built is not dirty;** `git status --porcelain --ignore-submodules=none` printed nothing, so a committed tree deploys as its bare commit.
- **2026-09-13 — The smit's ~35 ms of blocking git lost a race** the stile's spinner tests ran with 60 to 80 ms spare; they now hold the fake wrangler's deploy four seconds. Main passed, the change failed twice.
- **2026-09-13 — Mutations held:** the define dropped failed seven deploy tests, four by the stamp wait's timeout; `-dirty` never appended failed three of five smit tests.
- **2026-09-13 — The walk held on `sheep-smit-a2b17e7`:** deploy 97 s, `a2b17e7 (18:17:44Z)` moved in 1 s; dirty 13 s, `a2b17e7-dirty`; reverted 11 s, `a2b17e7 (18:19:36Z)`; the delete took the Worker, application, and join store.
- **2026-09-13 — The release's skew line misleads on one commit:** its `sheep home` said build `a2b17e7 (18:14:51Z)` is older than the home's `a2b17e7 (18:19:36Z)` and that `npm install -g` updates it, which it cannot.
- **2026-09-13 — The release's deploy was not walked;** its path adds no define and compares the same stamp as before, held by reading. Cost: 45 minutes of a subagent, 70 of verification, 2 of walk.
