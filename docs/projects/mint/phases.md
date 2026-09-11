# Mint: implementation phases

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
`/conduct mint` is the procedure. Phase citations name their project:
`mint phase 1`, never a bare "phase 1".

**One rule for this project.** A mint touches the Directory and nothing
else: a proof that finds a table in the cell's storage, a container
started, or a model called after `POST /sessions` alone has found the
bug, not a detail.

---

**Where we are: planned, 10 Sep 2026. Both phases NOT STARTED.** Next
is mint phase 0, the mint as one row, proved in workerd. Nothing waits
on a person until mint phase 1's account ring, one ⚑ step.

The order is dependency order. Phase 0 is the mechanism, which the
verb's promise needs. Phase 1 is the verb's docs, the refusal, and the
walk.

**Deliberately open.** Postponed on purpose: a verb that boots without
prompting; `state`, `transcript`, and `export` answered without a boot;
giving a sheep something at the mint; a name minted by the home.

---

## Phase 0: The mint is a row

**Closes:** journey 1 steps 1 to 3 and 6, and journey 2 steps 1 to 4,
in the cell's terms, against the fake container; nothing on the command
line yet.

**Work:** `packages/cell/src/index.ts`: `POST /sessions` inserts the
row and answers it; the boot of the cell, and its comment, go. Nothing
in `cell.ts` unless a route turns out to need it: `runtime()` is
already lazy, the birth already runs inside it, and `end()` already
handles a runtime that never booted. Tests: `packages/cell/test/
mint.test.ts` in the checkout ring, listed in `scripts/rings.mjs`: after
`POST /sessions` on a home with the faux provider, the cell's
`sqlite_master` has no table and no alarm is set, and the Directory's
row is `idle` with `task: null`; `GET /s/<id>/` after that boots it
(tables present, `operation: null`); a prompt over `POST /s/<id>/prompt`
is the first thing the faux program answers, and the transcript's first
entry is that prompt. With a pasture with a repository and the test's
starter (birth.test.ts's `sessionIn` is the shape): after the mint the
fake was never started; after the first prompt the fake started once,
the transcript is the birth entry then the prompt; a second sheep ended
before any boot (`DELETE /s/<id>`) leaves the fake's start count at zero
and the row gone; a third asked `GET /s/<id>/` alone is born by it, its
transcript the birth entry alone. `flock.test.ts`, `birth.test.ts`,
`setup.test.ts`, `end.test.ts`: whatever assumed the mint booted the
cell is corrected to ask the cell, never weakened.

**Not this phase:** No doc, no CLI change, no walk on a home.

**Proof:** `pnpm test` exits 0 with the new file in the checkout ring
and the rings guard green; `pnpm --filter @sheep/cell typecheck` exits 0.
**⚑** none.

**Status: NOT STARTED.**

## Phase 1: The verb and the walk

**Closes:** journeys 1 and 3 in full; journey 2 as walked on the local
home.

**Work:** `packages/cli/src/cli.ts`: `detach` sends before it prints,
so an ended id's refusal is the whole output (end phase 1's open
finding); `--detach` with no prompt on `attach` and `-c` is the refusal
in the design's sentence, exit 2; the usage's `new` and `--detach` lines
say that `--detach` alone mints and prints the id. `packages/cli/
agent-guide.md`, `README.md`: `sheep new --detach` with no prompt as the
way to an id before the first prompt, the birth at the first prompt for
a pastured sheep, and the guide's sentence that `sheep new` without a
prompt or `--detach` is pi's terminal. `packages/cli/test/journey5.test.
ts`: journey 1 steps 1 to 4, 6, and 7 against the faux provider, the mint
timed, the storage's emptiness read through the home's `export` being
the one route that would boot, so the proof of "nothing booted" there
is `sheep log` empty, `sheep status` at zero, and the faux program's
first answered step being the first prompt's. `scripts/hermetic.mjs`:
the account ring's new step, `m1`, after a3: `sheep new --detach` with
no prompt printing an id alone, `sheep ls --json` showing it `idle` with
`task: null`, `sheep attach <id> --detach -- "hello"` then `sheep wait
<id>` printing the faux reply, and the id added to those n1 ends.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings, the home
ring's journey 5 carrying the steps; `pnpm --filter @sheep/cli
typecheck` exits 0. Then the walk, journey 3 steps 1 and 2: the local
home with Docker (`sheep home local`) and a real model, a pasture with
a repository and a `setup.sh`, `sheep new --pasture <p> --detach` timed
with `docker ps` read after it, the first prompt timed with the birth
in `sheep log`; journey 1 with a real model. **⚑** journey 3 step 3:
`pnpm hermetic --ring account --yes <sha>` with the new step, a station
deployed and deleted on the shepherd's account, a few container minutes
and one deploy.

**Status: NOT STARTED.**
