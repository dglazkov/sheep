# Draft: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node; pi is a dependency; findings are one dated line
of about forty words; `main` stays sources only and a phase's proof runs
in a ring; steps marked **⚑ provision** create, change, or delete a
cloud resource, spend money, or need a login. `/conduct draft` is the
procedure. Phase citations name their project: `draft phase 0`, never
a bare "phase 0".

**One rule for this project.** No step asserts less than it did. A step
moves into its walk with its commands and its checks; a walk that can
only hold by loosening a step has found a defect in the split or in the
step, which is a finding and a stop, not an edit to the assertion.

---

**Where we are: draft phase 0 CLOSED, 16 September 2026; next is draft
phase 1.** The account ring is eleven walks that stand alone, `pnpm
hermetic --ring account --walk <name>`, each on a station of its own
under the sibling rule, the table in `scripts/walks.mjs` and a guard in
the checkout ring keeping it true against the script. Every walk held
alone on release 22d2fec, five at a time on the account, between 125
and 493 seconds each, and the bell walk reached hill's `h1`. Draft phase
1 runs them as a set, several at a time, with one report. Nothing waits
on a person: the account walks are the conductor's to run under the
shepherd's standing authorization.

Two phases, because a walk that stands alone is useful the day it
exists, and the set is a parent over children that already work.

**Deliberately open.** Postponed on purpose: a walk retrying itself;
walks on CI; the nine-minute CI (the pen image named by its tree and
pi's build cached), filed as its own issue; a walk for a journey no
project has yet.

---

## Phase 0: The walks

**Closes:** journeys 1, 2, and 5 in full; journey 4 steps 1 and 2.

**Work:** `scripts/walks.mjs`, beside `rings.mjs` and in its shape: the
table of walks, each with its steps, what it needs beyond the token,
and a sentence; the package ring's and the dog ring's step names,
written down so the guard can tell the account's steps from them; the
sibling rule as a function over a listing and a sha; the rerun line as
a function of a walk and a ref; `--list`'s text. `scripts/hermetic.mjs`:
`--walk <name>` on the account ring, required in this phase (no `--walk`
prints the list and exits 2, until draft phase 1); the prologue `d1`,
the newer deployed straight with `a2`'s assertions; the epilogue, `n1`
and `a6` under the sibling rule, and the `walk` line; each of the ring's
account steps moved, unchanged, into its walk's function; the `upgrade`
walk keeping `a1`, `a2`, and `a2b` on the older; the `second` walk
minting the sheep `a7` watches, as `a3` did; `stile` as `t1` alone;
`collie` as `--collie-only` was, under its name, and `--collie-only` and
`--collie` gone; every station named `sheep-hermetic-<sha>-<walk>`, the
sitting's `-t` under that; a walk refusing with exit 2 before any deploy
when it needs what the machine lacks; the failure path ending with the
rerun line; the header comment retold. `packages/cli/test/walks.test.ts`
in the checkout ring, listed in `scripts/rings.mjs`: every step a walk
names is `ring.ok`'d in the script; every `ring.ok`, `ring.fail`, and
`ring.skip` step in the script not among the package ring's or the dog
ring's names belongs to exactly one walk; the eleven names, each
station name under the platform's length; the sibling rule on a listing
with siblings, a leftover of the walk's own, and a stranger. Hill's
`phases.md` and the projects index: the Open finding answered by the
bell walk, with the release and the date.

**Not this phase:** the set, `--jobs`, the parent's report; the house
rules and the README (draft phase 1, with the set they will describe).

**Proof:** `pnpm test` exits 0 across all three inner rings, the new
file in the checkout ring; `pnpm -r typecheck` exits 0. Falsified by
two mutations: a step renamed in the script (the guard names it as in
no walk), and a walk in the table naming a step the script lacks. `pnpm
hermetic --ring account --list` prints the eleven walks; `pnpm hermetic
--ring account --walk bell --dry-run` holds its preflight and deploys
nothing. **⚑** every walk run alone on the shepherd's account against
the current release: `pnpm hermetic --ring account --walk <name> --yes
refs/remotes/origin/release` for each of the eleven, `second` with
Docker, `pasture` with `LAMB_PLAYGROUND_TOKEN`, `collie` with the key
and dev.isocan.io answering, `bell` reaching `h1`; each station deleted,
the account's listing equal before and after each; the seconds of each
recorded. Several may run at once, which is the sibling rule's own
proof.

**Status: CLOSED.** 2026-09-16. Every inner ring holds with the guard, both mutations fail it, and all eleven walks held alone on the shepherd's account against release 22d2fec, the bell walk reaching `h1`.

**Findings:**

- **2026-09-16 — Every walk held alone on release 22d2fec, five at a time on the account:** stile 125 s, pasture 126, bell 133, station 153, bleat 158, fold 214, tether 219, upgrade 341, spool 378, second 385, collie 493; every listing equal with siblings aside, the account as it was.
- **2026-09-16 — The split's first defect was found by a walk, not the guard:** `hermetic.mjs` began importing `walks.mjs` and every build context copied the script alone, so the second machine's container failed at its first line. The copy now derives from the imports, and the guard holds the Dockerfile to the same list.
- **2026-09-16 — A name on the account is also a name on a screen:** the collie's station renamed `-collie` made its Worker's address 67 characters, cut and wrapped on the stile's 80 columns where `co3` reads it whole. The collie's station is `-c`.
- **2026-09-16 — The station walk failed once at `s2` with the platform's `503 No browser available`,** beside four siblings, and held on its rerun beside four; the rerun line cost 153 s where the old ring's retry cost the top. The browser cap is the account's, not a station's.
- **2026-09-16 — The pasture walk runs `s1` before `a8`:** `a8` leaves two idle containers for `n1` and `s1` births two more under one station's cap of three, earmark's own finding again; `s1` ends its own two.
- **2026-09-16 — Two step names are shared across rings by accident of history,** `s1` (serve, earmark) and `d1` (the docker walk, the deploy); the guard reads names, so for those two it cannot tell the ring, written down in `PACKAGE_RING_STEPS`.

## Phase 1: The set

**Closes:** journey 3 in full; journey 4 step 3.

**Work:** `scripts/hermetic.mjs`: the account ring with no `--walk` is
the set; the preflight, the price, and the yes once in the parent; each
walk a child process, `--child` marking it, at most `--jobs` at a time
(default 4), its output whole in `<ring dir>/<walk>.log` and its `ok`,
`skip`, and `fail` lines printed by the parent as they land, prefixed
with the walk's name; the walks left out named with why (`second`
without Docker, `pasture` without the playground token, `collie` unless
named or `--collie`); the report, one line per walk with held or the
failing step and the seconds, the rerun line for each failure, the
not-checked list as the union; the whole listing read before the first
child and after the last, nothing set aside, equal; exit 1 when any
child failed. `--walk a,b` and `--walk a --walk b` as a set of those.
`scripts/walks.mjs`: which walks a machine's set holds, from what it
has; the report's lines. `walks.test.ts`: the set from each combination
of Docker, the playground token, the key, and `--collie`; the report on
a mix of held and failed walks naming the rerun lines. `AGENTS.md`'s
ring bullet, `README.md`'s ring paragraph, `scripts/rings.mjs`'s and
`scripts/test.mjs`'s headers: the account ring is a set of walks, and
how one is run alone.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0. **⚑** the set on the shepherd's account against the
current release, `pnpm hermetic --ring account --yes
refs/remotes/origin/release`, with Docker, the playground token, and
the key on the machine, held: every walk's line, the wall clock
recorded against the longest walk's; then the same with
`LAMB_PLAYGROUND_TOKEN` set to a wrong value, the `pasture` walk failing
at `a8` while its siblings hold, the report naming it with its rerun
line, the whole listing equal, exit 1. Both leave the account as it
was.

**Status: NOT STARTED.**
