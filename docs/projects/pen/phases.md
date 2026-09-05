# Pen: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey it closes, and a phase that
claims one closes only when the journey is walked for real. The rules are
lamb's ([../lamb/phases.md](../lamb/phases.md)): the conductor verifies
every proof itself, findings are one dated line of about forty words, and
steps marked **⚑ provision** are asked out loud first. Phase citations
name their project: `pen phase 2`, never a bare "phase 2".

---

**Where we are: NOTHING BUILT.** Planned 5 Sep 2026. The next thing to do
is pen phase 0. Pen phases 0 to 2 prove against a fake and need nothing
from lamb; pen phase 3, the first real walk, uses `--detach`, `wait`, and
`log` and so waits on lamb phase 5, the sheepdog's surface.

The order is dependency order and risk order. Phase 1 is the gate: if a
checkout cannot be synced by hash both ways with the atomicity journey 3
demands, the container is a machine and the thesis fails. Phase 2 is the
seam and the sentence, and it is where lamb's behaviour is preserved.
Phase 3 is the first real machine. Phase 4 is the repository journey and
the credential broker, the largest piece of new code. Phase 5 is the
fresh isolate and is allowed to slip. Phase 6 is celld. Phase 7 is the
proof that lamb did not notice.

**One rule for every phase.** The proof runs in workerd against a fake
container that speaks the protocol, never against a real one, until the
phase whose job is the real one. A real container is the walk, not the
test.

**Deliberately open.** Postponed on purpose:

- **Budgets.** A number per home and a sentence. Not a meter per user.
- **A GitHub App.** The push authors as the home. An app that authors as
  itself is Identity's.
- **Persistent volumes.** A cache-warming question, after the cache rule
  is proven.
- **Python in tier 1.** The table says tier 2. Pyodide is a later finding.

---

## Phase 0 — The scaffold

**Status: NOT STARTED.**

**Closes no journey.** Makes every later phase possible to prove.

**Work:**

- `packages/pen`: a container image definition with node, pnpm, python,
  and git, and a `pen-agent` that opens a WebSocket to a URL from its
  environment and answers `ping`. Built by a script; not yet run
  anywhere.
- In `packages/cell`: the `hash` column on the `files` table, computed on
  write, with a migration that backfills; a manifest query; and a test in
  workerd that writes files through lamb's tools and asserts the manifest.
- A fake container for tests: a workerd-side implementation of the
  protocol over an in-process socket pair, holding its checkout in
  memory. The fake is what every phase's tests talk to.
- The protocol as one TypeScript file of message types, imported by the
  cell and by the agent.

**Proof:** `pnpm test` runs the manifest test in workerd. The image
builds. `pen-agent` answers `ping` against a local socket in the fake's
test.

## Phase 1 — The checkout

**Status: NOT STARTED.** The gate.

**Proves journey 3's atomicity claim and journey 1 step 3 against the
fake.** Closes nothing; pen phase 3 walks them.

**Work:**

- Sync in: manifest to the fake, `need`, blobs, and the fake's checkout
  equals the rows. Deletions honoured.
- Sync out: the fake changes files; `changed`, blobs up, rows updated
  one transaction per file; over-cap files refused by name.
- The cache rule: `.gitignore` and the built-in list, applied on the
  container side to what it reports, and a test that a `node_modules`
  written in the fake does not come back.
- The kill test: the fake is stopped at each stage of a sync, and the
  rows are asserted whole every time.

**Proof:** A test in workerd round-trips a workspace of a hundred files
through the fake with edits, adds, deletes, and one over-cap file, and
the rows and the transcript match a fixture at every kill point.

## Phase 2 — The router and the sentence

**Status: NOT STARTED.**

**Proves journey 6, and journey 1 steps 1, 2, and 4, against the fake.**
Closes nothing; pen phase 3 walks journey 1 and pen phase 7 walks
journey 6.

**Work:**

- The table, in one file, generating three things: the router's
  decision, the refusal sentence per program, and the system prompt's
  paragraph. Lamb's `shell-notice.ts` becomes this file.
- `CellExecutionEnv.exec` routes: parse with just-bash, classify each
  simple command, run whole in tier 0 or tier 2 or refuse. Tier-2 runs go
  to the fake in tests.
- Streaming: `stdout` and `stderr` frames become pi's periodic bash
  updates, so the renderer behaves as it does against a real shell.
- Interruption: a socket close mid-run settles the command as
  interrupted, with partial output and no exit code, as journey 3 step 3
  says.
- A test that with no container binding the table generates lamb's
  sentence byte for byte and lamb's suite passes unchanged.

**Proof:** Journey 6 holds: lamb's suite green with pen's code present and
no binding. Journey 1 steps 1 to 4 hold against the fake.

## Phase 3 — A real machine

**Status: NOT STARTED.**

**Closes journey 1 and journey 3 on Cloudflare.**

**Work:**

- ⚑ provision: Cloudflare Containers on the scratch account, which needs
  the Workers Paid plan. Asked out loud, with the price.
- The Containers binding in `wrangler.jsonc`, the container started from
  the cell on first tier-2 command, the agent connecting back with the
  minted token, and idle stop.
- The budget: a number per home in configuration, a counter in the
  Directory, and the sentence when spent.

**Proof:** Journey 1 walked on the deployed home: `pnpm install`, `pnpm
test`, `node_modules` in the container and not in the rows, the sentence
changed, and the container gone an hour later. Journey 3 walked with the
container killed from the dashboard mid-run. The Findings record start
time, sync time for a workspace of a hundred files, and what an idle
minute costs.

## Phase 4 — A repository, and the broker

**Status: NOT STARTED.** The largest piece of new code.

**Closes journey 2.**

**Work:**

- The git credential helper in the image, `credential.helper = pen`,
  speaking `credential` frames.
- The broker in the cell: a `credential` request becomes a request to
  the home, which mints from its secrets a short-lived scoped value;
  the value is returned once and not stored.
- ⚑ provision: a fine-grained token to one scratch repository as a home
  secret, contents-only, short-lived, revoked after the walk.
- `.git` syncing, with a test that a clone survives a fake-container
  restart and `git status` in the new one is clean.
- A test in workerd against a git server fixture (lamb's fifty lines of
  CGI, revived) that walks journey 2 through the fake, and greps every
  frame, every row, and the exported session for the credential.

**Proof:** Journey 2 walked against a real repository from the deployed
home: cloned, a branch, an `edit`-tool change that `git diff` shows,
pushed, the branch on GitHub, and a laptop fetch showing the tree. The
credential in nothing the model can see.

## Phase 5 — The fresh isolate

**Status: NOT STARTED.** Allowed to slip out of the leg.

**Closes journey 4.**

**Work:**

- The Worker Loader binding; a `node`-compatible entry that runs a file
  from the workspace binding with no `fetch`; stdout as the tool result.
- The router's rule for `node`: tier 1 when no container is up, tier 2
  when one is.
- A test that the isolate cannot `fetch` and cannot read the cell's
  environment.

**Proof:** Journey 4 walked on the deployed home.

## Phase 6 — celld

**Status: NOT STARTED.**

**Closes journey 5.**

**Work:**

- ⚑ provision: a celld node with a container runtime the operator
  configures, and the endpoint the cell uses to start one.
- The same image, started by the node; the same protocol.
- Findings for every celld behaviour the design leans on.

**Proof:** Journeys 1, 2, and 3 walked against the fleet, with `docker
kill` as the operator's hand in journey 3.

## Phase 7 — Nothing changed for lamb

**Status: NOT STARTED.**

**Closes journey 6.**

**Proof:** Every lamb journey walked against a home with no container
binding, unchanged. Lamb's suite green. No pi patch added. `git log
upstream/main..sheep` in the submodule is the same list it was.

## What the phases leave open

- **Sub-agents as cells** that rent their own containers, or share.
- **A permission gate that hibernates**, now that a command can cost
  money as well as time.
- **Identity**, which the budget and the GitHub App both wait on.
