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

Report, change nothing.

```sh
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

## Update

Two reasons to be here: upstream moved, or lamb needs a new commit on pi.

**Rebase onto upstream:**

```sh
git -C $PI rebase upstream/main
```

On a conflict, resolve it by hand in the submodule, `git add`, `git rebase
--continue`. Each of lamb's commits is small and its commit message says
why it exists; keep the intent, not the exact lines. Never resolve by
dropping a lamb commit without saying so.

**Add a new commit** (a change lamb needs in pi): edit in `$PI`, then one
commit with a message that says what it is for. Keep it additive and in a
slow-moving file where possible; pi's `packages/*/src/experimental/` is
churn and lamb has kept off it since 6 Sep.

**Rebuild the packages the cell and lamb link to**, because the workspace
depends on `dist/`:

```sh
(cd $PI && npm ci --ignore-scripts --no-audit --no-fund)
for p in chord tui telemetry ai agent session-backends/sqlite-node protocol client server coding-agent; do
  (cd $PI/packages/$p && npm run build >/dev/null 2>&1 && echo "built $p") || echo "FAILED $p"
done
```

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
(cd vendor/pi && npm test --workspaces --if-present 2>&1 | tail -20)   # pi's own suites, three minutes
```

Then the real-client walk against a local home, which proves the bridge
and an unmodified `pi client` still agree with the cell:

```sh
cd packages/cell && (pnpm exec wrangler dev --port 8790 --local > /tmp/lamb-dev.log 2>&1 &)
until curl -s -o /dev/null http://127.0.0.1:8790/; do sleep 1; done
LAMB_HOME=http://127.0.0.1:8790 LAMB_TOKEN=$(grep ^LAMB_TOKEN= .dev.vars | cut -d= -f2) \
  node ../lamb/bin/lamb.js new -- "run ls, then reply with the single word ok"
pkill -f "wrangler dev --port 8790"
```

A reply that ends in `ok` with no `Byte transport closed` is a pass. Ask
for a tool call on purpose: the first real-model failure lamb ever had
only showed up when the model called `bash`.

## Record

In `docs/projects/lamb/phases.md`, phase 7 Findings, one dated line: the
upstream commit moved to, how many conflicts, how long it took. Phase 7
left "what a bump costs" unmeasured on purpose; each bump is a data point.
Then commit the superproject (the submodule pointer, the finding) and push
to `main`, per the house rule.

## Things that have gone wrong before

- The shell's cwd was already inside `vendor/pi`, so `cd vendor/pi`
  failed and the chain after it silently did nothing. Absolute paths.
- `pkill -f "celld dev"` matched the shell running it. Match the binary,
  `pkill -x`.
- pi's `dist/` is gitignored inside the submodule, so a fresh clone has
  nothing to link against until the build step runs.
- `git status` in the superproject shows `vendor/pi` as modified only when
  the pointer moved; `.gitmodules` sets `ignore = dirty` so the built
  `dist/` does not count.
