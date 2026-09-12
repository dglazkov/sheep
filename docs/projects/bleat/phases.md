# Bleat: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node; the fake container is what a cell test talks
to; pi is a dependency; findings are one dated line of about forty
words; `main` stays sources only and a phase's proof runs in a ring;
steps marked **⚑ provision** create, change, or delete a cloud
resource, spend money, or need a login, and are asked out loud first.
`/conduct bleat` is the procedure. Phase citations name their project:
`bleat phase 1`, never a bare "phase 1".

**One rule for this project.** Nothing the model reads changes. This is
a log for the dog: pi's transcript, the context built from it, and the
tool result a failed setup returns are what they were, and a proof that
finds a new message in front of the model has found the bug, not a
detail.

---

**Where we are: bleat is done, 11 September 2026. Both phases CLOSED.** A
setup says itself twice — to the sheep's Directory row, which answers
whatever the cell is doing, and to the cell's own record, which carries
the output's tail beside the transcript's entries — and the dog hears it
three ways: `setup:` on `sheep status`, the `[setup]` block in `sheep
log`, and `setup running (1m 40s)` on stderr while a prompt is held.
Planned and built in one day from the shepherd's issue #4. All four
journeys are walked: 1 to 3 on a local home with Docker and a real model,
4 by the account ring on release 220ba1f, `ok b1` among 40 lines. Nothing
waits on work or on a person.

The order is dependency order. Phase 0 is the fact and where it is kept,
which all three surfaces read. Phase 1 is the surfaces, the docs, and the
walk.

**Deliberately open.** Postponed on purpose: a pi change to write into an
open operation's transcript; setup's output streamed as it runs; `sheep
wait` saying the line; a column on `sheep ls`; the cell answering while
it is being born; more than the last twenty setups kept.

---

## Phase 0: The sheep says it

**Closes:** journeys 1 to 3 in the cell's terms, against the fake
container; nothing on the command line yet.

**Work:** `packages/cell/src/bleat.ts`, new, beside `birth.ts`: the
`SetupState` the row carries, the `SetupRecord` the cell keeps (`id`,
`at`, `ms`, `command`, `exit` or `error`, `output`, `truncated`, fold's
`cache`), the tail's bounds (40 lines, 16 KiB, the birth's), the key
prefix and how many are kept (20), and the sentence for a setup an
eviction cut off. `packages/cell/src/env/execution-env.ts`: an optional
`onSetup` in the env's options, awaited once at the start of `warm()`
after the script is known to exist and once at its end, whatever the
ending, with what ended it; the sink throwing is logged and changes
nothing about setup. `packages/cell/src/directory.ts`: a `setup` column
on `sessions` with the migration the others have, `setup` on
`SessionSummary`, `setupStarted`, `setupEnded`, and `setupInterrupted`,
which writes `failed` only when the row says `running`. `packages/cell/
src/cell.ts`: the sink wired at boot — the Directory told, the record
written and replaced, the oldest beyond twenty deleted — and the row's
stale `running` cleared at boot from the summary it already reads;
`transcript()` carries `setups`. `packages/cell/src/index.ts`: `GET
/sessions/<id>`, the row alone, `unknownSession` for one the home lacks.

Tests: `packages/cell/test/bleat.test.ts` in the checkout ring, listed in
`scripts/rings.mjs`, over the fake container with a setup script the test
holds open: the row says `running` with its `at` while setup runs and
`ok` with its `ms` after; the record is there while it runs and carries
the tail after; a second container's setup leaves a second record; a
setup that exits 1 leaves `failed` and pasture phase 4's tool result
unchanged; a birth's setup leaves a record and the `birth` entry
unchanged; the transcript view carries entries and setups; twenty-one
setups leave twenty records; `setupInterrupted` on a fresh boot;
`GET /sessions/<id>` answers the row and 404s a sheep the home lacks;
and the faux provider's messages are byte for byte what `setup.test.ts`
sees without the sink.

**Not this phase:** No CLI change, no doc, no walk on a home.

**Proof:** `pnpm test` exits 0 with the new file in the checkout ring and
the rings guard green; `pnpm --filter @sheep/cell typecheck` exits 0.
Falsified by at least two mutations: the sink called only at the end
(journey 1 step 2's `running` fails), and the stale-running clear removed
(journey 2 step 4 fails). **⚑** none.

**Status: CLOSED.** 2026-09-11. Journeys 1 to 3 hold in the cell's terms
against the fake container: a setup the test holds open says `running` on
the sheep's row with its `at` and `ok` with its `ms` after, the record
exists for the whole of the wait and carries the output's tail at the end,
a failed setup is `failed` on the row with pasture phase 4's tool result
unchanged in front of the model, a birth's setup leaves a record and the
`birth` entry as it was, twenty-one setups leave twenty records, an
eviction leaves no `running` behind, and a sheep with no `setup.sh` says
nothing. `pnpm test` exits 0 across all three rings; falsified by two
mutations.

**Findings:**

- **2026-09-11 — The row answers in 1 ms while setup holds the cell.** Measured in the checkout ring from inside the cell, mid-setup: `GET /sessions/<id>` is the Directory's alone, and the cell's own routes would have waited out the whole setup.
- **2026-09-11 — `warm()` had eleven return paths and one accumulating `output`.** Wrapping it, rather than editing each return, is what makes "the sink is told whatever the ending" a property of the shape instead of a checklist a later ending could miss.
- **2026-09-11 — A record keyed by its start millisecond needs a collision bump.** Twenty-one back-to-back setups through the fake container are fast enough that two could share a millisecond and become one record; a taken key moves the next one on.
- **2026-09-11 — The test seam `evict()` is not the platform.** It drops `#runtime` but leaves the abandoned incarnation's `warm()` alive in this isolate, so the eviction case must hold its setup open forever and stop the fake last; a real eviction takes the isolate with it.
- **2026-09-11 — An evicted setup's record still says `running`;** only the row is mended at boot. Closed by bleat phase 1: the block reads the row's ending for a record with none of its own, and asks the row only when some record lacks an ending.

## Phase 1: The dog hears it

**Closes:** journeys 1 to 4 in full.

**Work:** `packages/cli/src/home.ts`: `row(id)` over `GET
/sessions/<id>`, `setup` on `SessionSummary`, `setups` on
`TranscriptView`. `packages/cli/src/herd.ts`: `runStatus` reads the row
first and prints the `setup:` line in the design's four forms, with the
two-second deadline on the lane read and the short form when it passes;
`runLog` merges the setups into what it prints by time and renders the
`[setup]` block, with `--json` giving each `"type": "setup"`; a record
with no `ms` is `running (…)`, unless the row's `setup` for that same
`at` has ended, in which case the block says what the row says (bleat
phase 0's open finding: an eviction mends the row and not the record); a watcher
used by every path that holds a prompt — `runPrompt` and `detach` —
asking the row every 10 s from the moment the command starts, saying
`setup running (…)` on first sight and every 30 s after, and one line
when it ends. The durations are one function: `12.4 s` under a minute,
`1m 40s` over it. `packages/cli/src/cli.ts`: the usage's `status` and
`log` lines, and one line under `--json`. `packages/cli/agent-guide.md`,
`README.md`: what a dog does when a sheep is slow.

Tests: `packages/cli/test/bleat.test.ts` in the command ring, the built
CLI against a fake home in `earmark.test.ts`'s shape: a row that says
`running` and then `ok` gives the stderr lines and the status line, a
transcript with setups gives the block and the `--json` type, a row with
`"setup": null` gives none of it and the same bytes as today, and a home
that will not answer the row does not fail the command. `scripts/
hermetic.mjs`: the account ring's `b1` after the steps that already have
a pasture with a repository, a slow `setup.sh` of its own, the first
prompt sent with `--detach` while the row is asked, the line seen, the
block read back; its sheep among those the ring ends.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm
--filter @sheep/cli typecheck` exits 0. Then the walk, journey 4 steps 1
and 2: the local home with Docker (`sheep home local`) and a real model,
a pasture with a repository and a slow `setup.sh`, two terminals, the
three surfaces read and the times recorded; then a `setup.sh` that exits
1. **⚑** journey 4 step 3: `pnpm hermetic --ring account --yes <sha>`
with the new step, a station deployed and deleted on the shepherd's
account, a few container minutes and one deploy.

**Status: CLOSED.** 2026-09-11. All four journeys are walked. Journey 4
steps 1 and 2 on a local home with Docker and a real model: a held prompt
says `setup running (7.7 s)`, `setup running (37.7 s)`, `setup ok (45.1
s)` on stderr with the reply alone on stdout, `sheep status` from a
second terminal answers from the row in 2.2 s while the cell is being
born and `setup: ok (45.1 s)` in 0.21 s after, the `[setup]` block
carries setup's own output, and the row, the block, and the lines agree
to the tenth of a second; a `setup.sh` that exits 1 is `setup: failed
(exit 1, 0.0 s)` with its output in the block. Journey 4 step 3 by the
account ring on release 220ba1f, `ok b1` among 40 lines with none
failed. `pnpm test` exits 0 across all three rings, 121 CLI cases.

**Findings:**

- **2026-09-11 — The walk found `sheep status` printing at two seconds and exiting at thirty-nine.** A cell being born answers the upgrade then says nothing, and `close()` waits on a frame that cannot come; the short form now ends once flushed. The ring had faked a handshake, which node frees, not an open socket, which it does not.
- **2026-09-11 — The guide was cut to fit rather than the cap raised.** Bleat's section cost 159 words against two of slack, so about 200 came out elsewhere; 1492 words, the guard still `< 1500`, as mint phase 1 left it.
- **2026-09-11 — A setup that fails fast is never said on stderr.** The broken pasture's script exited in under 50 ms, so the first poll found it ended and said nothing: the dog waited for nothing, as the design has it.
- **2026-09-11 — The three surfaces agree because they share one number,** one `Date.now() - at`: the walk read 45.1 s in all three and `45108` in the row.
- **2026-09-11 — The account ring's first run failed at `s2`, before `b1`.** Not bleat's: the platform now mirrors container images into its own registry, so the settle waited on a configuration that could never name it; fixed in `7d3b22d`.
- **2026-09-11 — The account ring closes it on release 220ba1f, `ok b1`, 40 lines held:** the held prompt said `setup running` twice then `setup ok (45.2 s)`, eight `status` answers came from the row while the cell was born, the slowest 2.4 s, and the block held setup's own line.
- **2026-09-11 — The same run proved `7d3b22d`:** `s2` settled in 24 s on a rollout that completed while the application named another digest — the state that burned 305 s an hour before.
