# Tether: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node; pi is a dependency; findings are one dated line
of about forty words; `main` stays sources only and a phase's proof runs
in a ring; steps marked **⚑ provision** create, change, or delete a
cloud resource, spend money, or need a login. `/conduct tether` is the
procedure. Phase citations name their project: `tether phase 0`, never
a bare "phase 0".

**One rule for this project.** Nothing in the cell, the Directory, or pi
changes. The lane already resumes and idles, and pi already writes the
interruption; a proof that needs the cell to behave differently has found
a second bug, which is a finding and a stop, not a patch.

---

**Where we are: tether is planned, 12 September 2026. Its one phase is
NOT STARTED.** Planned from the shepherd's issue #10 the night stile
closed, after a local probe showed the lane going idle and the held
`sheep wait` never hearing it. Next: tether phase 0.

One phase, because the two defects are one command's and one proof
restarts a home for both.

**Deliberately open.** Postponed on purpose: reattaching pi's TUI; a
turn that survives a version change without calling the model again;
the issue comment's container lead, which waits on a sighting.

---

## Phase 0: The tether

**Closes:** journeys 1 to 4 in full, and journey 5.

**Work:** `packages/cli/src/client.ts`: `Sheep.until` rejects with a
`Dropped` error when the attachment's connection ends and the dog did
not close it. `packages/cli/src/herd.ts`: one helper holds an id through
drops, attaching again with a short backoff inside a two-minute window
of consecutive failure, the home's refusal at once, and one stderr line
per reattach; `runWait`, `held` (both the idle hold and the queued
placement), and `runAbort` go through it. In `held`, the stream's
subscription moves to each new attachment, `Entries` keeps its ids
across them, a drop before acceptance fails as today, and after a
reattach the exit is decided by the hold. `formatEntry` prints an
assistant entry's `errorMessage` as a last `[error]` line.
`packages/cli/src/cli.ts` usage, `packages/cli/agent-guide.md`, and
`README.md`: a sentence where a sentence is owed, paid for by cutting;
the guide's word guard does not move.

Tests: `packages/cli/test/tether.test.ts` in the home ring, listed in
`scripts/rings.mjs`, against a real `wrangler dev` home with the faux
provider, which `local-home.ts` gains a way to restart on the same port
and state (skipped, with a message, for a `SHEEP_TEST_HOME` it did not
spawn): journeys 1 to 3 and journey 4 step 2 with the window shortened
by an environment variable the tests alone set. The command ring's
existing tests for `formatEntry` and the stream pass unchanged, and a
case for the `[error]` line joins them. `scripts/hermetic.mjs`: the
account ring's `r1`, per journey 5 step 2, after `b2` and ending its own
sheep.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings, the new
file in the home ring; `pnpm --filter @sheep/cli typecheck` exits 0.
Falsified by at least two mutations: `until` never rejecting on a drop
(journey 1 step 5 fails by timeout), and `Entries` forgetting its ids on
a reattach (journey 2 step 4 fails). **⚑** journey 5 step 2: `pnpm
hermetic --ring account --yes <sha>` with `r1`, a station deployed and
deleted on the shepherd's account, a few container minutes and one
deploy, typed by the shepherd.

**Status: NOT STARTED.** 2026-09-12. Nothing built.

**Findings:**

- **2026-09-12 — The lane in issue #10 was never stuck.** Locally, a home restarted mid-turn went `idle` at 53 s and a fresh `sheep wait` returned at once; the wait held across the restart hung, since the reset closed its socket and `until` never settles on a close.
- **2026-09-12 — The blank entry is pi's interruption.** `recovery.ts` settles an orphaned model call as an assistant message with `stopReason: error` and an `errorMessage`, then calls the model again; `sheep log` prints content and never the error.
