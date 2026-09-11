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

**Where we are: mint is done, 11 Sep 2026. Both phases CLOSED.** A dog
can name a sheep before it has anything to say: `sheep new --detach`
mints one row and prints the id, the sheep idle with no task and no
container until something is asked of it, and a sheep born into a
pasture with a repository is cloned and set up at its first prompt.
Planned and built in one night from the shepherd's issue #3. Phase 0
proved the mechanism in workerd; phase 1 added the refusal, the docs,
journey 5 in the home ring, and the account ring's step, walked
journeys 1 and 2 on the local home with Docker and a real model, and
closed on the account ring the shepherd typed, `ok m1` on the station.
Two open debts under the phases; nothing waits on work.

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

**Status: CLOSED.** 2026-09-10. Journey 1 steps 1 to 3 and 6 and journey 2 steps 1 to 4 hold in the cell's terms: after `POST /sessions` the cell's storage has no table and no alarm, the row is idle with no task, and no model was called; `GET /s/<id>/` is the first boot; the first prompt is the provider's first call, the birth entry ahead of it for a pastured sheep; a sheep ended before any boot starts nothing. `pnpm test` exits 0 across all three rings; falsified by restoring the boot.

**Findings:**

- **2026-09-10 — The mint is one Directory row.** In the pool `POST /sessions` takes 3 ms against 18 ms with the boot, for a pastureless sheep; nothing in the tree assumed the boot at mint but one comment in `end.test.ts`, which boots explicitly.
- **2026-09-10 — The test-only `POST /s/<id>/faux` before any boot leaves `_cf_KV` in `sqlite_master`** and no alarm; the proof reads `sqlite_master` before scripting anything and filters the platform's own tables, else the one rule would misfire.
- **2026-09-10 — A pastured mint through the Worker's route is unprovable in workerd:** the pool binds no container, so `directory.refusal` refuses the repository before any row. The test mints through `directory.create`, as `birth.test.ts` does; the route's pastured path is mint phase 1's walk.
- **2026-09-10 — The first boot's birth reports `idle` before `boot()` returns,** so `GET /s/<id>/` on a minted pastured sheep answers with the row already idle and the birth entry alone on the lane; 24 ms against the fake, the first prompt with the birth 29 ms.
- **2026-09-10 — One mutation failed the test:** the boot restored at the mint fails journey 1's two cases at "no table after the mint" (22 objects in the cell's SQLite, `table sessions` first); journey 2's cases never went through the route and pass either way.
- **2026-09-10 — Open: pen's loopback test (`agent.test.ts`, serve phase 1) failed twice in a row at 22:44** with a 404 where the `::1` server should answer, then passed six runs; nothing in `packages/pen` changed. Waits on a cause; a third red run should find one.

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

**Status: CLOSED.** 2026-09-11. Journeys 1, 2, and 3 walked: 1 and 2 on the local home with Docker and a real model, 3 steps 1 and 2 with them, step 3 by the account ring the shepherd typed, `ok m1` on the station; `pnpm test` exits 0 across all three rings with journey 5 carrying journey 1's steps.

**Findings:**

- **2026-09-10 — The mint through the CLI is about 170 ms,** the process included, against the row's 3 ms in the pool; on the local home with Docker the pastured mint printed the id in 0.19 s with `docker ps` listing nothing for it.
- **2026-09-10 — The first prompt into a pasture returned in 2.4 s with the birth done:** `octocat/Hello-World` cloned and `setup.sh` run in the container `docker ps` then listed, the entry first and the prompt second; `sheep status` alone births in 2.3 s.
- **2026-09-10 — Send-before-print is what the ended-id case proves:** with `detach` printing first, journey 5's new case fails at exactly `sheep attach <ended> --detach -- x`; end phase 1's open finding is closed.
- **2026-09-10 — `sheep -c --detach` with no prompt is refused before `home.list`:** the refusal is a usage error and asks nothing of the home.
- **2026-09-10 — The guide had four words of room; the mint bullet cost 63,** cut from redundancies elsewhere; 1495 by the test's count.
- **2026-09-10 — `m1` posts one text step before its mint,** since after a3 the home's program is a3's container one; e2 posts its own after.
- **2026-09-10 — Open: the walk's first pastured sheep was born into no container:** wrangler answered "No such image available" for the image it had just built; a restart of the home rebuilt it. Cause not found; the home ring's `wrangler dev`s ran beside it.
- **2026-09-11 — The account ring, typed by the shepherd: `ok m1` in 0.5 s to the id alone,** listed idle with no task, the first prompt through `attach --detach` with the id after the send, `wait` printing the reply; seven sheep ended by n1, the delete listing none.
