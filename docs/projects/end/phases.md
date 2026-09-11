# End: implementation phases

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
`/conduct end` is the procedure. Phase citations name their project:
`end phase 1`, never a bare "phase 1".

**One rule for this project.** Nothing an ended sheep held survives it
but the pasture: a proof that finds a table, an alarm, a running
container, or a warm browser after the end has found the bug, not a
detail.

---

**Where we are: end phases 0 and 1 NOT STARTED. Next: `end phase 0`.**
Planned 10 Sep 2026, the evening serve closed, from the shepherd's
issue #1. Two phases: the end in the cell, the Directory, and the
Worker, proved in workerd against the fake container and the pool's
browser; then the verb, the docs, the home ring's walk, and the walk on
the local home with Docker and a real model. One ⚑ step, in end phase
1: the account ring with its new step.

The order is dependency order. Phase 0 is the mechanism, which the
verb needs. Phase 1 is the verb and the walk.

**Deliberately open.** Postponed on purpose: ending a pasture; `rm` of
several ids; a grace period; ending from inside a sheep.

---

## Phase 0: The end

**Closes:** journey 1 steps 1 to 5 and journey 2 in the cell's terms,
against the fake container and the pool's browser; nothing on the
command line yet.

**Work:** `packages/cell/src/cell.ts`: `end()` in the design's five
steps, `DELETE /` as its route, `{ ended, aborted }` as its answer; the
starter reachable without a live lease (`leaseFor` factored so the
starter is made once and the destroy is asked of it). `packages/cell/
src/wire/listener.ts`: a close of every socket it holds, with a code
and reason. `packages/cell/src/eyes/session.ts`: `close()`, connect by
the kept id and close, never launch, the row deleted after.
`packages/cell/src/directory.ts`: `remove(id)`, `unknownSession(id)`.
`packages/cell/src/index.ts`: `DELETE /s/<id>` answered by the Worker in
the design's order; the 404 for every `/s/<id>` route is the sentence.
Tests: `packages/cell/test/end.test.ts` in the checkout ring, listed in
`scripts/rings.mjs`: a sheep mid-turn with a bash line in the fake
container ended (`aborted: true`, the fake's destroy count one, the
kill on its ledger, the row gone, `GET /s/<id>/` the sentence with 404,
the storage's `sqlite_master` empty of tables, no alarm, the Directory's
container row closed); an idle sheep that never rented ended (`aborted:
false`, the fake never started); a second end of the same id the
sentence; a terminal attached over `/ws` closed with the reason; the
pastures table untouched and the herd a query of none. In `eyes.test.
ts`: a look, then `close()`, then a connect by the kept id refused; a
close with no row a no-op.

**Not this phase:** No verb, no doc, no walk on a home.

**Proof:** `pnpm test` exits 0 with the new file in the checkout ring
and the rings guard green; `pnpm --filter @sheep/cell typecheck` exits 0.
**⚑** none.

**Status: NOT STARTED.**

## Phase 1: The verb and the walk

**Closes:** journeys 1 and 3 in full; journey 2 as walked on the local
home.

**Work:** `packages/cli/src/home.ts`: `end(id)` through `ask`.
`packages/cli/src/herd.ts`: `runEnd`, the line and the JSON. `packages/
cli/src/cli.ts`: `rm` in the dispatch and the usage. `packages/cli/src/
client.ts`: `attachSheep` asks `GET /s/<id>/` when the connect fails and
throws the home's sentence. `packages/cli/agent-guide.md`, `SKILL.md`,
`README.md`: the verb beside `abort`, and the guide's sentence that a
finished sheep is ended. `packages/cli/test/journey5.test.ts`: journey
1 steps 1 to 4 after step 7, against the fake. `scripts/hermetic.mjs`:
the account ring's walk ends the sheep it minted before the delete, and
asserts `sessions: 0` in the delete's listing.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings, the home
ring's journey 5 carrying the four steps; `pnpm --filter @sheep/cli
typecheck` exits 0. Then the walk, journey 3 steps 1 and 2: the local
home with Docker (`sheep home local`), a pasture with a repository, a
sheep whose container `docker ps` lists, ended, `docker ps` without it;
journey 1 with a real model, `tests` mid-turn on `sleep 120` in its
container. **⚑** journey 3 step 3: `pnpm hermetic --ring account --yes
<sha>` with the new step, a station deployed and deleted on the
shepherd's account, a few container minutes and one deploy.

**Status: NOT STARTED.**
