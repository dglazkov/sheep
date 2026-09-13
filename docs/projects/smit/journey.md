---
status: planned
since: 2026-09-13
see: smit
note: "written 13 Sep 2026 from the shepherd's issue #11: a station deployed from a checkout says `home build: 0.0.0-checkout (unstamped)` before and after every redeploy, so neither the dog nor the shepherd can tell what it runs. The issue offers stamp or refuse; smit stamps. A checkout deploy marks the Worker with the checkout's commit, a `-dirty` marker when the tree has uncommitted changes, and the deploy's time, through the same define the release's bundle uses; a checkout with no commit is refused. One phase: the mark, the wait that sees it move, the tests, and a walk on the shepherd's account."
---

# Smit — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. A **smit** is the mark a shepherd paints
on a fleece so anyone on the fell can say whose the sheep is. Here it is
the mark on a station that says what code it runs: a station deployed
from the release carries the release's stamp, and a station deployed
from a checkout has, until this project, carried nothing.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against a real account. [design.md](design.md)
is the mechanism and [phases.md](phases.md) the walk. If a journey and
the mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **A checkout**: this repository cloned, `sheep` run as
  `packages/cli/bin/sheep.js`; its manifest carries no stamp, so `sheep
  --version` says `0.0.0-checkout`.
- **The release**: the package installed from `github:dglazkov/sheep#release`,
  whose manifest carries the commit and time it was built at.
- **The stamp**: what `GET /home` reports as `build`, and `sheep home`
  prints as `home build: <commit> (<time>)`.
- **The smit**: the stamp a checkout deploy gives its station: the
  checkout's short commit, `-dirty` appended when `git status` has
  anything to say, and the deploy's own time.
- **A scratch kennel**: a directory that is not the checkout, with its
  own `.sheep/`, from which the checkout's `sheep` is run. A walk never
  deploys from the checkout's own kennel.

## Journey 1: The dog reads what a checkout station runs

The dog is in a scratch kennel, running the checkout's `sheep`, and the
account token and model key are what the stile keeps on this machine.

1. `sheep home deploy` deploys the station. Its report prints `home
   build: <commit> (<time>)`, where `<commit>` is the checkout's seven
   character HEAD and `<time>` is within the deploy's own minute, and
   `stamp: moved (<n>s)`. Nowhere does it say `unstamped` or `not
   compared`.
2. `sheep home` afterwards prints the same `home build:` line, and
   `sheep home --json`'s `build.commit` is the same commit.
3. A file the checkout tracks is edited and not committed, and `sheep
   home deploy` is run again. The report prints `home build:
   <commit>-dirty (<later time>)` and `stamp: moved (<n>s)`: the same
   tree redeployed is seen to move, because the time moved.
4. The edit is reverted and the deploy run once more: `home build:
   <commit> (<still later time>)`, `stamp: moved`.

Acceptance criteria:

- `sheep home deploy --json`'s `build.home` equals its `build.deployed`
  when `stamp.moved` is true, and `build.deployed` is the smit.
- The release's `sheep home`, pointed at that station, prints the skew
  line as it does between two releases: the two times compared, the
  older named, and what updates it.
- The release's own deploy is not changed by any of this: its report
  and its `stamp:` line read as station phase 3 left them.

## Journey 2: A checkout with no commit is refused

1. `sheep home deploy` from a checkout whose root is not a git
   repository (or whose git cannot answer `rev-parse HEAD`) exits 2 with
   one sentence on stderr saying the checkout has no commit to mark the
   station with and naming the release install, and nothing is deployed:
   no wrangler call, no join store made, no config written.

## Journey 3: The walk

1. The command ring's `deploy.test.ts` runs `sheep home deploy` from this
   checkout against the fakes and reads the smit off the fake wrangler's
   recorded `deploy` call and the fake station's `/home`, so `pnpm test`
   repeats journey 1 steps 1 and 2 and journey 2 without an account.
2. Journey 1 is walked on the shepherd's account from a scratch kennel,
   the checkout's `sheep home deploy` three times and `sheep home delete`
   once. **⚑** it deploys a station on the shepherd's account and builds
   the pen image on this machine's Docker.
