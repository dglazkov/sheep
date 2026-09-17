# Draft — the design

**16 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **the account ring becomes a set of walks that
stand alone, one per journey, each on a station of its own, runnable
alone in minutes and run together in the time of the longest; what each
step asserts does not change.**

## Where the loop's time goes

The question behind issue #13 is the shepherd's: how does the
development loop get faster while staying grounded. Measured on 16 Sep
2026, from the checkout at 8376f2d:

| Ring | What it proves | Cost | State |
| --- | --- | --- | --- |
| checkout, command, home (`pnpm test`) | this checkout | 2 min 50 s for 78 files, the home ring's eight `wrangler dev` starts included | healthy; the phase's inner loop |
| package, on CI (`release.yml`) | a release installs and walks | 8 to 10 min per commit on `main`; pi's fork built from scratch and the pen image built and pushed every run | tolerable; the account ring waits on it for the image |
| account (`pnpm hermetic --ring account`) | a station on the shepherd's account | 30 to 45 min when it holds; five of the last runs failed before the step they were run for (hill three times at `t2`, `a5`, `a2`; collie twice at `a3`, `f2`) | the bottleneck |

The account ring is where a phase with a walk on the account spends
its hour, and where a retry costs another. Its shape is the "projects
are short" problem in the test ladder: since collar every project has
added its journey to one sequential walk on one station, so a phase
proves every older journey again, in order, before its own. The order
inside is not free either: `n1` had to come before `s1`, `f1` before
`f2`, because one station's container cap of three forced each step to
end its sheep before the next could rent (earmark's and fold's
findings). Separate stations dissolve that ordering.

What the ring's minutes are, read from its own waits: three deploys of
a minute or two each, the second machine's four-minute turn across the
join, the spool's 640 MiB setup and put-back at about six minutes, the
collie's real turn up to ten, and a dozen container rents of a minute.
None of that is waste; all of it is real. What is waste is paying for
all of it to prove one of it.

So the split, and not a faster walk: the grounding is the real deploy,
the real container, the real model, and every one of them stays. What
goes is the accretion.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a walk | one journey's steps on the account, from a fresh world to its station deleted | `scripts/walks.mjs` names it; `scripts/hermetic.mjs` runs it |
| the prologue | what every walk does first: the install, the deploy, the checks a deploy earns | `hermetic.mjs` |
| the epilogue | what every walk does last: the ends, the delete, the listing, the `ps` line | `hermetic.mjs` |
| the sibling rule | a walk's listing comparison sets aside every name of the form `sheep-hermetic-<sha>-*` | the epilogue |
| the set | every walk, run together by a parent that runs each as a child process | `hermetic.mjs` |
| the rerun line | `pnpm hermetic --ring account --walk <name> --yes <ref>`, printed for a walk that failed | the parent, and the walk itself |

## The walks

The steps are the ring's own, by name, unchanged in what they run and
assert. The table is the truth, written in `scripts/walks.mjs` the way
`scripts/rings.mjs` writes the inner rings, and a guard in the checkout
ring fails when the script's steps and the table disagree.

| Walk | Steps | Needs beyond the token | About |
| --- | --- | --- | --- |
| `upgrade` | `a1`, `a2`, `a2b`, `sh1`, `up`, `sh2`, `sh3`, `sh4`, `n1`, `a6` | the older release (`--older`, or the ref's first parent) | 8 min |
| `station` | `d1`, `st`, `a3`, `m1`, `e2`, `s2`, `a4`, `a5`, `n1`, `a6` | nothing | 6 min |
| `second` | `d1`, `a7`, `t2`, `n1`, `a6` | Docker | 7 min |
| `pasture` | `d1`, `a8`, `s1`, `n1`, `a6` | `LAMB_PLAYGROUND_TOKEN` | 4 min |
| `fold` | `d1`, `f1`, `n1`, `a6` | nothing | 4 min |
| `spool` | `d1`, `f2`, `n1`, `a6` | nothing | 8 min |
| `bleat` | `d1`, `b1`, `n1`, `a6` | nothing | 3 min |
| `bell` | `d1`, `b2`, `h1`, `n1`, `a6` | nothing | 3 min |
| `tether` | `d1`, `r1`, `n1`, `a6` | nothing | 4 min |
| `stile` | `t1` | the key | 4 min |
| `collie` | `t1`, `co0` to `co9`, `c-end` | the key, dev.isocan.io, the stile's terminal harness | 10 to 15 min |

Every walk also prints the `walk` line: the `ps` watch's samples with
no secret in any process's arguments.

`upgrade` is the one walk that installs the older release first: its
prologue is `a1` and `a2` as they are, and `up` is the newer over it.
It runs when the upgrade path changes, and in the set. `stile` and
`collie` deploy through the sitting, `t1`, on `<name>-t`, as they do
today, so they have no `d1`; `collie` is `--collie-only` under its new
name, and `--collie-only` goes.

## The prologue

`d1` is the newer release deployed straight, `sheep home deploy --faux
--name sheep-hermetic-<sha>-<walk> --json` from `blog`, timed under
three minutes, with `a2`'s assertions on the result: the address
answers, the two stamps equal, the config names the station with no
local marker, the image the Worker reports is the release's and the
application's, wrangler fetched once into the ring's `~/.sheep/tools`,
the join store made and bound. `a2` asserts the same of the older
release; `d1` is `a2` with the newer's expectations and no older.

The install is the package ring's, of the ref itself, as
`--collie-only` already does: `npx <spec> setup --json` into a fresh
prefix, cache, and `HOME`. Each walk pays it, about a minute, and pays
its own deploy, about a minute and a half. That is the trade: the set
costs more machine-minutes than the one walk did, roughly twice, and
its wall clock is a third; one walk costs a tenth.

## The epilogue

`n1` ends every sheep the walk minted, `sheep rm <id>` printing its one
line each, and asks a verb of an ended id, as it does today; in a walk
that minted none it prints that it had none to end. `a6` deletes the
station with the name on stdin and reads the listing, and the `walk`
line closes the `ps` watch.

**The sibling rule.** A walk compares the account's listing after with
the listing before, and both are read with every name of the form
`sheep-hermetic-<sha>-*` set aside: a sibling's station, its `-t`, its
`-collie`, its `-join` store, mid-deploy or mid-delete, is not this
walk's to count. What the walk asserts of its own names stays exact:
none of them on the account after, and a leftover of any of them
refused before anything is deployed. The set's parent restores the
whole guarantee: it reads the whole listing before the first child and
after the last, with nothing set aside, and the two must be equal.

A failure anywhere after the deploy deletes the walk's station, as the
ring's `finally` does today, and drops the join store; then the rerun
line, then exit 1.

## The set

`pnpm hermetic --ring account --yes <ref>` with no `--walk` is the set.
The parent does the preflight once (the account, the plan, the
subdomain, the listing, the image on the registry, Docker, and for the
collie dev.isocan.io and the harness), prints the price once, asks
once, then runs each walk as a child, `node scripts/hermetic.mjs --ring
account --walk <name> --yes --child <ref>`, at most `--jobs` at a time,
default 4. Four, because the account has rented every container a
walk asked for one station at a time and has not been asked for four
stations' worth at once; the first set's finding says what held, and
the default moves on evidence.

Each child's whole output goes to `<ring dir>/<walk>.log`; the parent
prints each `ok`, `skip`, and `fail` line as it lands, prefixed
`[bell]`, and at the end one line per walk: `held` or `failed at
<step>`, the seconds, and for a failure the rerun line. The parent's
not-checked list is the union of the children's, plus each walk left
out and why. The exit code is 1 when any child failed, and the
station-deleting `finally` is each child's own, so a parent killed
mid-set leaves each child to finish its delete.

`--walk a,b` or `--walk a --walk b` is a set of those walks. `--jobs 1`
is the set in order, which is the old ring's shape with eleven stations
instead of one, for a machine that must not run four.

What the set leaves out, it names: `second` without Docker, `pasture`
without the playground token, `collie` unless named or `--collie`.
Asked for alone, each of those refuses with exit 2 before anything is
deployed, as the ring refuses today without a token.

## What does not change

- **Every step's commands and assertions.** A step moves into a walk
  function with its code; the diff of a step is a move. The guard test
  reads the script for `ring.ok("<step>"` and `ring.fail("<step>"` and
  matches the names against the table, so a step in no walk, or a walk
  naming a step the script lacks, fails `pnpm test`.
- **The inner rings, the package ring, the machine ring, the dog ring,
  and the release.** Not a line.
- **The ring's guarantees**: tokens in the environment only; the price
  before the yes; a station named for the run and deleted whatever
  happens; the listing checked before and after; the `ps` watch through
  every walk.
- **The settings' allow rule.** `pnpm hermetic --ring account:*` still
  matches every command here.

## What this does not do, on purpose

- **Retry a walk on its own.** A transient fault is a fact about the
  platform, and issue #14 was found by reading one. A failed walk
  prints its rerun line; running it is the dog's, and a run that held
  on the second try says so in the phase's finding.
- **Shorten CI.** The nine minutes per commit are pi's fork built from
  scratch and the pen image built and pushed every run, even when
  `packages/pen` did not change. Naming the image by the pen tree's
  hash and caching the fork's build would cut a commit to about four
  minutes, and would let the account ring run on a local candidate
  release, minutes after the commit, since the image it names would
  already be on the registry. That is a project of its own, and it is
  filed as an issue so it is not lost.
- **Run walks on CI.** The account is the shepherd's, and a walk spends
  on it; it stays a thing conducted here, with someone watching.
- **Change what any journey proves.** Issue #13's "not this".
