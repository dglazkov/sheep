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

**Where we are: end is done, 10 Sep 2026. Both phases CLOSED.** A dog
can end a sheep: `sheep rm <id>` aborts its open turn, disconnects its
terminals, destroys its container, closes its browser, empties its
cell, and removes its row, in that order, and every verb on the ended
id refuses in one sentence that names `sheep ls`; the pasture stays.
Planned and built in one evening from the shepherd's issue #1. Phase
0 proved the mechanism in workerd against the fake container and the
pool's real Chrome; phase 1 added the verb and the docs, walked
journeys 1 and 2 on the local home with Docker and a real model, and
closed on the account ring, typed by the shepherd, which ended six
sheep on the platform and deleted a station listing none. Two open
debts under the phases; nothing waits on work.

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

**Status: CLOSED.** 2026-09-10. Journey 1 steps 1 to 5 and journey 2 hold in the cell's terms: `docs` idle, `tests` mid-turn with its line killed on the fake's ledger, `types` never rented, `nonsense` and a second end the sentence, the pasture's herd a query of none, a terminal closed `1001 ended`, a warm browser refused after the end; the storage empty of tables and alarm each time. `pnpm test` exits 0 across all three rings; falsified by three mutations.

**Findings:**

- **2026-09-10 — Ending a sheep mid-turn takes about 9 ms against the fake.** The abort's kill is answered, the sync-out runs, and the lane settles well inside `PEN_KILL_TIMEOUT` plus the 2 s margin; the bound is for a container that ignores the kill.
- **2026-09-10 — The starter outlives the lease.** `starterFor()` makes the `PenContainer` stub or the test's fake once and keeps it, so an end asks the destroy of the same starter whether or not a lease is live, evicted incarnations included.
- **2026-09-10 — `PenContainer.destroy()` of a container that is not running is a logged no-op,** since the platform's own `destroy()` may throw for what it does not have. By construction only, the pool binding no container; journey 3's Docker walk proves it.
- **2026-09-10 — `PenLease.close()` refuses a pending rent, and `discard()` composes it.** Benign today: discard is only called from the kill path with a live socket. An end during a rent that never dials in is refused rather than left for the start deadline.
- **2026-09-10 — miniflare's browser emulation asserts on a connect to a closed session** (`sessionInfo must be set before connecting`, as `[mf:error]`) and logs `Can't call WebSocket send() after close()`; noise, the connect rejects as the platform's would.
- **2026-09-10 — Three mutations failed the test:** the removal deleting nothing (six cases), the Worker removing the row without ending the cell (five), and the browser's close forgetting the row without closing (one).
- **2026-09-10 — Open: a request between the cell's end and the row's removal boots a fresh empty cell** whose tables step 5 dropped; nothing routes to it afterwards and it holds nothing. A finding if a walk ever sees it.

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

**Status: CLOSED.** 2026-09-10. Journeys 1, 2, and 3 walked: 1 and 2 on the local home with Docker and a real model, 3 steps 1 and 2 with them, step 3 by the account ring the shepherd typed, `ok n1`; `pnpm test` exits 0 across all three rings with journey 5 carrying journey 1 steps 1 to 4.

**Findings:**

- **2026-09-10 — The refusal reaches every verb by three paths.** `ask` throws a `Sentence`; `attachSheep` asks `GET /s/<id>/` after a failed socket and throws the sentence when that is what came back; `attach()` with no prompt asks before pi's terminal is spawned.
- **2026-09-10 — The builder's first pass left the interactive `attach` with the bridge's line;** sent back against journey 1 step 1, and the home ring's case now runs `sheep attach <ended>` with no prompt.
- **2026-09-10 — `prompt`, `transcript`, and `exportRows` went through `request`,** so `sheep log <ended>` said `GET …/transcript: 404 <sentence>`; all three go through `ask` now.
- **2026-09-10 — The guide is at its 1500-word ceiling.** The verb cost about sixty words of redundancy elsewhere; the next verb pays the same way or the budget moves.
- **2026-09-10 — The walk, with Docker and a real model:** `docs` ended with its container gone from `docker ps` at once; `tests` ended mid-turn on a 120 s `node` line in under a second, its container gone; the minutes read 0.204 before and after a 30 s wait.
- **2026-09-10 — wrangler's `-proxy` sidecars outlive a destroyed container by seconds,** gone within the walk's 30 s wait. They are wrangler's, not the sheep's.
- **2026-09-10 — `sheep attach <ended> --detach -- "…"` printed the id before the refusal,** since `detach` printed first. Closed by mint phase 1: the send comes first, the id after.
- **2026-09-10 — The account ring, typed by the shepherd: `ok n1` in 7 s.** Six sheep ended on the station, the older release's and a3's with its container and a8's two that had cloned and pushed; none listed after; the delete listed `sessions: 0`, `sessions deleted: 0`. `PenContainer.destroy()` met the platform there.
