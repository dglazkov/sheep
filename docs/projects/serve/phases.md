# Serve: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey steps it closes, and a
phase that claims a walk closes only when the walk was walked for real.
The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)), pen's
([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node; the proof runs against the fake container that
speaks the protocol, and a real container is the walk; pi is a
dependency; findings are one dated line of about forty words; `main`
stays sources only and a phase's proof runs in a ring, never from this
checkout; steps marked **⚑ provision** create, change, or delete a cloud
resource, spend money, or need a login, and are asked out loud first.
`/conduct serve` is the procedure. Phase citations name their project:
`serve phase 1`, never a bare "phase 1".

**One rule for this project.** A server lives for one look and no
longer: a `--serve` command that is still running when the report is
printed has left the design, and a test asserts the kill in every path
that starts one, the failures included.

---

**Where we are: planned, 9 Sep 2026. Nothing built.** Planned from a
conversation with the shepherd the day eyes closed; the shepherd's calls
are in the journey's front matter. The order is dependency order, and the
next thing to do is serve phase 0, the forward: the frames, the agent,
the fake, the cell's reader, and the eyes taking an origin. Then serve
phase 1, the served look: the flags, the rental, the report, the prompt,
and the walk on the local home. Then serve phase 2, the station and the
skill: the release, the rings, the pasture skill walked, and the walk on
the account. Nothing waits on a person before phase 2's walk.

**Deliberately open.** Postponed on purpose: a server kept for a turn
on a lane of its own; the websocket forwarded; the platform's port
binding as the forward's transport; a port for the dog.

---

## Phase 0: The forward

**Closes:** journey 4 steps 1 and 3, and its second criterion.

**Work:** `packages/pen/src/protocol.ts`: `fetch` in `CellFrame` and
`response` in `ContainerFrame`, each with `id`, `headers`, and `size`,
the bytes as one binary message after the frame when `size` is not
zero, the doc comment saying whose a binary message is. `agent.ts`: a
`Fetcher` injected beside the disk and the runner, `fetch` handled off
the chain like `run`, the pair sent with no await between, a fetch the
fetcher could not make answered with status `0`. `node.ts`: the fetcher
over Node's `fetch` at `http://127.0.0.1:<port><url>` with `host`
rewritten, `accept-encoding` dropped, `redirect: "manual"`; a test in
`packages/pen/test` against a real port. `packages/cell/test/
fake-container.ts`: `serve(port, origin)` and a runner that starts the
origin when a command names it and ends it on kill, recording both.
`packages/cell/src/pen/forward.ts`: `Forward`, the third reader on the
socket, `fetch(request)` resolving with the response and its bytes,
many in flight by id, the binary guard shared with `Checkout`.
`packages/cell/src/eyes/origin.ts`: the `Origin` interface,
`RowsOrigin` lifted from `Eyes.serve`, `ForwardOrigin` over a `Forward`
and a port; `eyes.ts`: `look(request, origin)`, the handler asking the
origin and nothing else. `look-command.ts` builds a `RowsOrigin` and is
otherwise unchanged.

**Not this phase:** No flag, no rental, no report change, no prompt.

**Proof:** `pnpm test` exits 0 with the eyes suite unchanged and a
suite in workerd that renders journey 4 step 1's page from the fake's
origin through the forward: the statuses and content types as the
table said them, the POST's body arriving, the `302` followed by the
browser, the 404 blamed once, fifty requests in flight settled. The
agent's suite proves the fetcher in Node against a real port as journey
4's second criterion says. A binary message with two announcers waiting
throws on both sides, and a test says so. **⚑** none.

**Findings.**

**Status: NOT STARTED.**

## Phase 1: The served look

**Closes:** journey 1 in full; journey 4 step 2.

**Work:** `look-command.ts`: `--serve` and `--port` parsed as the
design shapes them, `<path>` as a server path with `/` the default and
a leading slash added, `--root` with `--serve` the usage line, `--serve`
on a cell without a container the one line and exit 1. `execution-env.ts`:
`rentServer(command, port, cwd, during)`: rent, sync in, setup, the
`run` with `PORT` over the shell's environment, the readiness poll
through the forward at a quarter second up to `SERVE_READY_MS`, `during`
given a `ForwardOrigin`, the kill and its `killed`, the sync-out, the
tail of the run's output kept for the report; the run exiting first or
the port never answering as the design's errors, the run killed in
every path. `report.ts`: the `server` section for a served look, forty
lines, `none` when silent, and the closing line's `served by … on …,
ready in …`. `prompt.ts`: the sentences in the eyes' paragraph when the
home has a container too; the byte-for-byte test for a home with eyes
and no container holds.

**Not this phase:** No release, no ring, no station, no skill.

**Proof:** `pnpm test` exits 0 with journey 4 step 2 through the shell
against the fake: the `server` section and the closing line, each
failure as one line with the kill recorded, `--root` with `--serve`
refused, a cell without a container refusing `--serve` by the design's
sentence, and the prompt's paragraph with and without a container. Then
the walk: `sheep home local` on this laptop with Docker, journey 1 with
a real model, the served looks' ready times and whole times recorded,
the lane shown free between looks. **⚑** none; the model's key is the
shepherd's, as every walk's.

**Findings.**

**Status: NOT STARTED.**

## Phase 2: The station and the skill

**Closes:** journeys 2 and 3 in full; journey 3's third criterion.

**Work:** `scripts/hermetic.mjs`: the package ring with `--docker`
walks a served look with the faux provider after the look at the rows,
one turn, the program's steps a Vite scaffold the fixture carries
prebuilt so no `npm install` runs in the ring; without `--docker` the
step is skipped and named; the account ring walks the same on its
station. `README.md`, `SKILL.md`, and `sheep --agent-help` say a sheep
can look at its dev server and that the frontend skill ships in the
project. The skill at `docs/projects/serve/skills/frontend/SKILL.md`
put into a pasture by the dog and walked.

**Not this phase:** Nothing open above.

**Proof:** `pnpm hermetic --ring package --docker` exits 0 with the
served look walked; `pnpm release --no-push --force` builds a candidate.
Then the walk, on the account: journey 3 step 1 on `sheep-2`; `sheep
home deploy`; journey 1 steps 1 to 3 there with a real model, the
timings recorded; journey 2 on the local home with a real model, the
skill put and read; `pnpm hermetic --ring account --yes <ref>` green.
**⚑ provision:** the upgrade of `sheep-2` and the ring's station on the
shepherd's account, and the container and browser minutes both spend.

**Findings.**

**Status: NOT STARTED.**
