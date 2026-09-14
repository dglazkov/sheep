---
name: isocan-bump
description: Check, update, and verify the pinned isocan dependency — the brain, `isocan/rc`, installed from github:dglazkov/isocan at one commit. Use when asked to bump isocan, check whether isocan moved, move the pin, or when a collie change needs something from isocan's side.
---

# isocan-bump: check, update, verify the isocan pin

The collie's brain is isocan's rc room, `isocan/rc`, and it arrives as
a git dependency of `packages/collie` pinned to one commit:
`"isocan": "github:dglazkov/isocan#<sha>"`. Isocan is a dependency,
never a copy: nothing under `node_modules/isocan` is edited, and a
change the brain needs is a commit in `../isocan`, made there under its
conventions, then pinned here. This skill keeps that true. Read
`docs/projects/collie/design.md`, "The brain", for what the module is and
what a host supplies.

Three modes. Run **check** first, always. Only run **update** if check
says isocan moved or the user asked for a change on isocan's side.
Always finish with **verify**.

## Working directory

Absolute paths everywhere; the shell's cwd persists between calls and a
stale `cd` has bitten before.

```sh
C=/Users/dimitriglazkov/Documents/code/sheep
I=/Users/dimitriglazkov/Documents/code/isocan     # the checkout beside it
```

## Check

Report, change nothing. Note the clock first; the Record step wants the
wall time of the whole bump.

```sh
date +%H:%M:%S
PIN=$(node -e 'const p=require("'$C'/packages/collie/package.json");console.log(p.dependencies.isocan.split("#")[1])'); echo "pinned: $PIN"
git -C $I fetch -q origin
git -C $I rev-parse --short origin/main                     # if different from the pin, isocan moved
git -C $I log --oneline --no-merges $PIN..origin/main | wc -l   # how far behind
```

Then the surface: the files the collie depends on. The module and what
it imports, the route client, the core it decides with, and the release
script that keeps the export alive:

```sh
git -C $I log --oneline $PIN..origin/main -- \
  packages/rc packages/core/src packages/api/src/routes.ts \
  package.json scripts/release.mjs
```

Any hit under `packages/rc` is a change to what the collie runs and is
read before the pin moves. A hit in `routes.ts` or `core` may move the
wire the collie speaks; the boundary test in isocan says whether the
module still has no Node in it, and this repository's typecheck says
whether the interface moved. Say plainly: how many commits are unpicked,
which touched the surface, and whether the module's interface changed.

## Update

Two reasons to be here: isocan moved, or the collie needs something
from isocan's side.

**A change on isocan's side** is made in `$I`, as a commit there with a
message that says what it is for, under isocan's own rules (its
`AGENTS.md`, its projects). The collie's docs name it: a phase whose
work is isocan's says so in `phases.md`, and the finding that records
the bump names the isocan commit.

**Move the pin**, to a commit on isocan's `release` branch, never
`main`: `isocan/rc`'s `browser` condition names
`packages/rc/dist/index.mjs`, which only a release commit carries, and
wrangler's bundler reads that condition. CI builds a release from every
commit on main; `git log --format='%h %p' origin/release` names each
release's main parent:

```sh
git -C $I fetch -q origin release
NEW=$(git -C $I log --format=%h -1 origin/release)   # the release built from main's tip, or an older one by its main parent
sed -i '' "s|github:dglazkov/isocan#$PIN|github:dglazkov/isocan#$NEW|" $C/packages/collie/package.json
(cd $C && pnpm install)
```

A bump that changes a route the collie speaks, or an answer's shape,
moves the isocan floor too: `ISOCAN_PIN` in `packages/cli/src/collie/floors.ts`
becomes the new commit, so the command can say which brain its Worker
runs.

## Verify

The suites, then the rig. Nothing is done until these pass.

```sh
cd $C
pnpm install
pnpm test                                     # the inner rings; the collie Worker's suite runs in workerd
(cd packages/collie && pnpm typecheck) && (cd packages/cli && pnpm typecheck)   # the suites do not type-check
```

Read the exit code, not the tail: `| tail` and a trailing `echo` both
report the last command's status. Then the rig by hand, which is the
only check that runs the module against a real isocan daemon and a real
sheep home rather than the fakes: the home ring's walk in
`packages/cli/test/collie-home.test.ts` is that, and a bump is not verified
until it has run in this checkout, not on CI, which leaves the home ring
out.

## Record

A bump's cost is recorded here, one dated line in the list below: the
isocan commit moved to, what on the surface changed, how long it took.
The argument goes in the bump's commit message. If the bump broke the
collie, the fix is its own commit and the line here says what broke.
Then commit and push to `main`, per the house rule.

Bumps so far:

- none yet; the first pin is collie phase 1's, at the release commit
  built from 30e9902e or later (isocan's project `room` closed #294 there,
  14 Sep 2026).

## Things that have gone wrong before (pi-bump's lessons, which apply)

- The shell's cwd was already inside the dependency, so a relative `cd`
  failed and the chain after it silently did nothing. Absolute paths.
- `npm test … | tail -20` in the background reported exit 0 while six
  tests failed. The pipe and the task both hide the suite's status.
- Two suites and two typechecks passed while the command was broken,
  because the break was in a surface only the walk runs. Walk.
- A dependency's top-level `fileURLToPath(import.meta.url)` killed a
  Worker bundle that every Node test passed; the module's boundary test
  exists so this is caught in isocan, not at `wrangler deploy`.
