---
name: pi-bump
description: Check, update, and verify the pinned pi dependency in vendor/pi. Use when asked to bump pi, check whether upstream pi moved, rebase the sheep branch, or when a lamb change needs a new commit on the pi fork.
---

# pi-bump: check, update, verify the pi dependency

`vendor/pi` is a git submodule tracking the `sheep` branch of
`https://github.com/dglazkov/pi`, a fork of `earendil-works/pi`. The branch
is upstream `main` plus a few small commits that lamb needs. This skill
keeps that true. Read `docs/projects/lamb/phases.md` phase 7 for the
history and the findings that explain each commit.

Three modes. Run **check** first, always. Only run **update** if check
says upstream moved or the user asked for a change to pi. Always finish
with **verify**.

## Working directory

Every `git` command below runs inside the submodule. Use absolute paths;
the shell's cwd persists between calls and a stale `cd` has bitten before.

```sh
PI=/Users/dimitriglazkov/Documents/code/sheep/vendor/pi   # adjust to the checkout
```

Remotes inside the submodule: `origin` is the fork `dglazkov/pi`,
`upstream` is `earendil-works/pi`. A fresh `git submodule update --init`
makes a shallow, single-branch clone, so on a new machine widen it once:

```sh
git -C $PI remote set-branches --add origin sheep
git -C $PI remote add upstream https://github.com/earendil-works/pi.git 2>/dev/null
git -C $PI fetch -q origin && git -C $PI checkout -q sheep && git -C $PI branch -q --set-upstream-to=origin/sheep sheep
```

## Check

Report, change nothing. Note the clock first; the Record step wants the
wall time of the whole bump.

```sh
date +%H:%M:%S
git -C $PI fetch -q origin
git -C $PI fetch -q --depth 200 upstream main:refs/remotes/upstream/main
git -C $PI status --short | grep -v '^??' | head          # must be empty: the tree is clean apart from ignored dist/
git -C $PI rev-parse --short HEAD                         # the commit the superproject pins
git -C $PI rev-parse --short origin/sheep                 # must equal HEAD; if not, the pin is stale
BASE=$(git -C $PI merge-base upstream/main HEAD); git -C $PI rev-parse --short $BASE   # the upstream commit the branch sits on
git -C $PI rev-parse --short upstream/main                # if different from BASE, upstream moved
git -C $PI log --oneline upstream/main..HEAD              # lamb's commits; expect a handful, all small
git -C $PI log --oneline --no-merges HEAD..upstream/main | wc -l   # how far behind
```

Say plainly: how many commits lamb carries, how many upstream commits
are unpicked, and whether anything upstream touched the files lamb's
commits touch:

```sh
git -C $PI diff --name-only $BASE..HEAD | sort -u > /tmp/lamb-touches            # from the base, not upstream/main, or upstream's own changes leak in
git -C $PI log --name-only --format= HEAD..upstream/main | sort -u | comm -12 - /tmp/lamb-touches
```

A non-empty intersection means the rebase will likely conflict; say
which files.

Then the surface: files lamb depends on but does not modify. The first
bump conflicted in one file and broke lamb in another that no commit on
the branch touches: upstream moved `pi client` out of the published CLI
and stopped compiling `src/experimental` into `dist/`. Lamb spawns pi's
development entrypoint from source and imports `experimental/services/*`,
so a change to any of these is a change to lamb:

```sh
git -C $PI log --oneline HEAD..upstream/main -- \
  packages/coding-agent/package.json packages/coding-agent/tsconfig.build.json \
  packages/coding-agent/src/cli.ts packages/coding-agent/src/experimental/cli.ts \
  packages/coding-agent/src/experimental/source-resolver.ts \
  packages/coding-agent/src/cli/experimental packages/coding-agent/src/experimental/services \
  packages/server/src packages/session-backends/sqlite-node/src
```

Any hit here is a reason to read the commit before rebasing, and to expect
the walk, not the suites, to be the test that notices.

## Update

Two reasons to be here: upstream moved, or lamb needs a new commit on pi.

**Rebase onto upstream:**

```sh
git -C $PI rebase upstream/main
```

On a conflict, resolve it by hand in the submodule, `git add`, `git rebase
--continue`. Each of lamb's commits is small and its commit message says
why it exists; keep the intent, not the exact lines. Never resolve by
dropping a lamb commit without saying so. When upstream moves something
lamb links against, move lamb to follow rather than re-adding what
upstream removed: the first bump kept the `./experimental/*` export but
pointed it at `.ts` source once upstream made its own experimental
entrypoints source-only, instead of putting `src/experimental` back into
the build. The cell's bundler and `tsc` read `.ts` through an export map
without any `conditions` setup; that keeps the fork to one line of
intent per change.

**Add a new commit** (a change lamb needs in pi): edit in `$PI`, then one
commit with a message that says what it is for. Keep it additive and in a
slow-moving file where possible; pi's `packages/*/src/experimental/` is
churn and lamb has kept off it since 6 Sep.

**Rebuild the packages the cell and lamb link to**, because the workspace
depends on `dist/`:

```sh
(cd $PI && npm ci --ignore-scripts --no-audit --no-fund)
for p in chord tui telemetry ai agent session-backends/sqlite-node protocol client server coding-agent; do
  (cd $PI/packages/$p && npm run clean >/dev/null 2>&1; npm run build >/dev/null 2>&1 && echo "built $p") || echo "FAILED $p"
done
```

`clean` first: `build` does not remove files, and a stale `dist/` can hide
that the build stopped producing something the cell resolves.

Then push the branch and record the new pin in the superproject:

```sh
git -C $PI push --force-with-lease origin sheep
git add vendor/pi
```

`--force-with-lease` because a rebase rewrites the branch; the lease
refuses to clobber a push you have not seen.

## Verify

Both suites, then the walk. Nothing is done until these pass.

```sh
cd /Users/dimitriglazkov/Documents/code/sheep
pnpm install                     # picks up any dependency change in pi's packages
pnpm test                        # the cell's suite runs in workerd; lamb's in Node
(cd packages/cell && pnpm typecheck) && (cd packages/lamb && pnpm typecheck)   # the suites do not type-check
(cd vendor/pi && npm test --workspaces --if-present > /tmp/pi-test.log 2>&1; echo "pi exit=$?")   # three minutes
grep -n "FAIL\|Test Files" /tmp/pi-test.log
```

Read the exit code, not the tail: `| tail` and a trailing `echo` both
report the last command's status, and a background task "completing" says
nothing about the suite. pi's `pi-ai` E2E tests run live against whatever
credentials the machine has; on Dimitri's Mac six Codex tests in
`test/stream.test.ts` fail because the Codex server refuses the model for
his account. That is the environment, not the branch; anything else that
fails is.

Then the real-client walk against a local home, which proves the bridge
and an unmodified `pi client` still agree with the cell:

```sh
cd packages/cell && (pnpm exec wrangler dev --port 8790 --local > /tmp/lamb-dev.log 2>&1 &)
until curl -s -o /dev/null http://127.0.0.1:8790/; do sleep 1; done
LAMB_HOME=http://127.0.0.1:8790 LAMB_TOKEN=$(grep ^LAMB_TOKEN= .dev.vars | cut -d= -f2) \
  node ../lamb/bin/lamb.js new -- "run ls, then reply with the single word ok"
lsof -ti :8790 | xargs kill
```

A reply that ends in `ok` with no `Byte transport closed` is a pass. Ask
for a tool call on purpose: the first real-model failure lamb ever had
only showed up when the model called `bash`. The walk is the only check
that exercises pi's CLI surface; the first bump passed both suites and
both typechecks and then failed here with `Unknown option: --connect`.
Never skip it. macOS has no `timeout`; run the walk bare.

## Record

In `docs/projects/lamb/phases.md`, phase 7 Findings, one dated line: the
upstream commit moved to, how many conflicts, how long it took. Phase 7
left "what a bump costs" unmeasured on purpose; each bump is a data point.
If the bump broke lamb itself, the phase that owns the broken piece gets
its own finding and the fix; phase 7 records only the cost. The first
bump's launcher fix went to phase 4, the wire and the terminal.
Then commit the superproject (the submodule pointer, the finding) and push
to `main`, per the house rule.

## Things that have gone wrong before

- The shell's cwd was already inside `vendor/pi`, so `cd vendor/pi`
  failed and the chain after it silently did nothing. Absolute paths.
- `pkill -f "celld dev"` matched the shell running it, and so would
  `pkill -f "wrangler dev --port 8790"`. Kill by port with `lsof -ti`.
- `npm test … | tail -20` in the background reported exit 0 while six tests
  failed. The pipe and the task both hide the suite's status.
- A stale `dist/experimental` from the previous build made the cell look
  fine against a tree that no longer built it. Clean before building.
- Two suites and two typechecks passed while `lamb new` was broken, because
  the break was in pi's CLI, which only the walk runs.
- pi's `dist/` is gitignored inside the submodule, so a fresh clone has
  nothing to link against until the build step runs.
- `git status` in the superproject shows `vendor/pi` as modified only when
  the pointer moved; `.gitmodules` sets `ignore = dirty` so the built
  `dist/` does not count.
