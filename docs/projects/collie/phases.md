# Collie: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node, and so do the collie Worker's; pi is a
dependency; findings are one dated line of about forty words; `main`
stays sources only and a phase's proof runs in a ring; steps marked **⚑
provision** create, change, or delete a cloud resource, spend money, or
need a login. `/conduct collie` is the procedure. Phase citations name
their project: `collie phase 1`, never a bare "phase 1".

**Three rules for this project.** The brain is isocan's: nothing that
decides what a summons is, whom an agent answers, or what a line says is
written in this repository; a phase that finds itself wanting to is a
finding and a stop. Isocan is a dependency, never a copy: `packages/collie`
alone depends on `github:dglazkov/isocan` at a pinned commit, moved by
`/isocan-bump` and named in a finding, as `vendor/pi` is pinned. And the
station and the `sheep` command are not touched: a route the collie
wants and the station lacks is a project of its own here, and until it
lands the collie does without or says so; what the two commands share
lives in `packages/cli`'s modules and is changed for both.

---

**Where we are: collie phases 0 and 1 CLOSED, collie phase 2 PART-DONE,
14 September 2026, its walks held; collie phase 3 is next.** The brain is isocan's `isocan/rc` (project `room`,
#294), carrying `DaemonRoutes` and the address helpers since isocan
14f39ba5 and 8729b9e3; the pin is release 18ca496a. `collie setup`,
`new`, `pass`, `deploy`, `rm`, and `local` are built, and the home ring
walks journey 1 on the rig against a real isocan daemon; the package ring
held, and the account's collie-only walk held on release be3d642 with a
real model answering on dev.isocan.io. Collie phase 2 stays PART-DONE on
two isocan issues (#308, off within a second on a hosted home; #306, `who`
on a replica), the shepherd's call. Next is collie phase 3, moving in.
Phase 1's Opens on the resume rule and the withdrawn sheep's badge are
isocan's work still.

Four phases: the brain in isocan, the Worker and the rig, the sitting
and the walk, and moving in. The last is small and last because it needs
one more isocan verb and the first three do not.

**Deliberately open.** Postponed on purpose: an entry stream on the
station in place of the transcript re-read; `rcLimits` at the collie; a
collie that sleeps; the switch from the tray; canvases derived from the
owner (the sheepdog note's admission rule); a collie per shepherd on a
shared account; an `isocan rc host` that calls `collie` from isocan's
side.

---

## Phase 0: The brain, in isocan

**Closes:** nothing here directly; the ground under collie phases 1 to 3.
Filed in isocan as [isocan#294](https://github.com/dglazkov/isocan/issues/294),
framed for any host that is not a laptop, and worked there by the
shepherd's own session under isocan's conventions; this doc records the
isocan commit that closed it. The Work below is what the issue asks
for, kept here so a reader of this project need not leave it.

**Work (isocan):** `packages/rc`, new, exported from the root manifest as
`isocan/rc` beside `.`: `runRoom(deps): Room`, the whole of `runRcRoom`
minus the laptop, returning `{ stop() }` (an abort that ends both long
polls and the hold); `RoomDeps` — `routes` (`DaemonRoutes` over `fetch`
with a badge store parameter, `{ read, keep }`, in place of
`@isocan/server`'s `readBadge`), `canvas`, `owner`, `rows` (the five verbs
of `rc.ts` as an interface), `adapterFor(row)`, `endSession(row,
narrate)`, `narrate(line)`, `state` (a key-value for the guard, the
said-sets, the turned-away keys), `limits`, `clock` and `sleep`;
`SheepAgent` moved from `packages/cli/src/sheep.ts` and rewritten over
`SheepCommands` (`sessions`, `session`, `pastures`, `pastureNew`,
`pasturePut`, `mint`, `attach`, `rm`, `abort`), with `SETUP_SCRIPT`,
`BRIEF`, `PASS_SECRET`, `pastureFor`, `toolCalls`, `assistantText`,
`endSheep`; `COLLAB_SKILL`, the skill's text as a string the release
carries; `gateTurn` moved from `rc.ts`; `summonsPrompt`, `nameResolver`,
`threadLocus`, `itemCenter` moved from `main.ts`. The claim rule: the
room claims, faces, and dispatches only agents `owner`'s badge may speak
as (read from the claim's refusal, `not-your-actor`, at the first
summons, then remembered), and narrates any other once: `<name> is
answered elsewhere; a pass minted for <name> hands it over`.
`packages/cli/src/main.ts`: `isocan rc` builds `RoomDeps` from what it has
today — `rc-agents.json`, `spawn`, `console.log`, a `Map` — and calls
`runRoom`; the upgrade window, the fence, the harness scan, the
default-harness question, and the session pointer file stay in `main.ts`
around it. `packages/rc/test/boundary.test.ts`: nothing under
`packages/rc/src` or `packages/core/src` reachable from `isocan/rc`
imports `node:*` or `@isocan/server`. `scripts/release.mjs`: the export
survives the release manifest's pruning.

**Not this phase:** anything here; `isocan pass --agent`.

**Proof:** In isocan: `npm test` exits 0, `packages/cli/test/rc.test.ts`
and the sheep-harness tests among it, unchanged; `npm run typecheck`
exits 0; the boundary test fails when a `node:fs` import is added to
`packages/rc/src` (one mutation) and when the claim rule is dropped (the
new rc case for an agent claimed by another badge reads a failed turn
instead of the one line). Then, from a scratch directory, `npm install
github:dglazkov/isocan#release` and `node -e 'import("isocan/rc")'`
resolves, and `esbuild --bundle --platform=browser` over a one-line file
importing `isocan/rc` succeeds with no `node:` in the bundle's externals.

**Status: CLOSED, 2026-09-14.** Isocan's project `room` (its
`docs/projects/room/`) closed #294 in seven phases at 30e9902e, and the
conductor verified the acceptance from a scratch install on 14 Sep.

**Findings:**

- **2026-09-14 — The acceptance held from a scratch directory:** `npm install github:dglazkov/isocan#release`, `import("isocan/rc")` resolving fifteen names, an esbuild browser bundle of 147 KB with no `node:` import; isocan's rc suite 57 for 57 and typecheck 0.
- **2026-09-14 — The module asks a host for more than the issue named:** `RoomDeps` has `origin`, `cwd`, `whereOf(row)`, `enrol(ask)` (the tray's last hop), and `agentKey(name)`; `SheepCommands` has `pastureSecret`; the collie's body supplies each (collie phase 1).
- **2026-09-14 — Agent keys are per machine (room phase 3.5):** `agent:<mac>` from a secret the host keeps, so the collie keeps a secret of its own in the object and derives its keys from it; a laptop's agent is handed over by a pass, as before.
- **2026-09-14 — The pin is a release commit, not one on main:** `isocan/rc`'s `browser` condition names `packages/rc/dist/index.mjs`, built on `release` only, and wrangler's bundler reads that condition; `/isocan-bump` says so.
- **2026-09-14 — An agent another badge holds is read from the desk's `held-elsewhere` reason,** not a sentence, and the line is "a pass from whoever holds <name> hands it over"; `parkClaim` and `rcHold` refuse `not-your-actor` at the server too.

---

## Phase 1: The Worker and the rig

**Closes:** journeys 1 (steps 5 to 7), 2 (steps 2 and 4), and 3 against
the fakes; journey 5 steps 3 to 5; journey 6 step 1.

**Work (isocan, first):** `DaemonRoutes` reachable from `isocan/rc`, the
entry with no Node in it, so a host constructs isocan's own route client
over its `fetch` and a badge store rather than writing one: the room
declares `RoomRoutes` and exports no implementation, the package's root
entry is tsx-registered Node, and `redeemPass`, `mintPass`, and
`killBadge`, which the body needs beside the room's thirteen, are
`DaemonRoutes`' too. A commit on isocan's `main` under its conventions,
its boundary test extended to the export, and the pin below its release.

**Work:** `packages/collie`, new, `@sheep/collie`, the Worker:
`wrangler.jsonc` (name `collie`, `Collie` in `durable_objects` and
migration `v1` as `new_sqlite_classes`, `nodejs_compat`, no `pen`
environment since it rents nothing), a `vitest.config.ts` on the pool
like the cell's, `package.json` with `isocan` from
`github:dglazkov/isocan#<the release commit built from 30e9902e or
later>`, a release commit because the module's `browser` condition names
a bundle built there (collie phase 0's finding);
`scripts/rings.mjs` gains the package's test directory in the checkout
ring; `scripts/bundle.mjs` adds `packages/cli/src/collie/cli.ts` →
`dist/collie.mjs` and the Worker by `wrangler deploy --dry-run` →
`collie/worker.mjs` with `collie/wrangler.jsonc`, `scripts/release.mjs`
carries them, the root manifest's `bin` gains `collie`, and
`.gitignore` gains `/collie/`. `src/index.ts`, the router: the bearer (`COLLIE_TOKEN`), the
`x-collie-build` header, `GET /` answering `collie` without the bearer
as the station's answers `sheep`, `GET /home` (the
build, the rooms' count and state), `POST /passes`, `GET /report` the report,
`GET /log?since=`, `POST /off`, `POST /on`, `DELETE /` the end;
`src/collie.ts`, the object: tables `badges`, `rooms`, `agents`, `state`,
`narration`; `passes(address)` — isocan's `DaemonRoutes` for that isocan home
over a badge store backed by `badges`, `redeemPass`, and then, when the
pass admitted a canvas, the room and the loop, or, when it endowed an
agent, the row and a line; `runRoom` per room under `waitUntil` with the
body's `RoomDeps` as the module has them — the routes, `origin` from the
room, `cwd` a constant naming the object, `rows` over `agents`, `whereOf`
naming the station, `enrol(ask)` claiming the actor under `agentKey` and
writing the row and the enroll op as the laptop's last hop does,
`agentKey(name)` a keyed hash of a secret minted once into the object's
`state` and the name, `adapterFor` always the `SheepAgent` over
`src/sheep.ts`, `SheepCommands` as the station's routes with
`COLLIE_SHEEP_HOME` and `COLLIE_SHEEP_TOKEN` (the design's list plus
`pastureSecret` as the pasture's secret route, the follow as the
transcript long poll with entries handed on at most once by id), `narrate` as an insert with the room's tag, `state`
over the `state` table, the real clock; the alarm armed a lap ahead while
on, its handler starting any room's loop that is not running; the resume
rule; `off`, `on`, `end` (the badge ended at each isocan home with
isocan's own route, then the rows dropped), `report`, `log(since)`. The
sheep home's floor: `x-sheep-build` read on the first answer and a 4xx
other than 401 from a home older than `OLDEST_SHEEP_HOME` (bleat's
release, the row route) answered to the command with the sentence, as
shear does. `packages/cli/src/collie/`, new: `cli.ts` (the second
bin, `packages/cli/bin/collie.js`), `usage.ts`, `floors.ts`, `home.ts`
(the collie Worker's client over `Home`'s shape, reading the `collie`
block `config.ts` gains beside `home` and `token`; the skew line and the
tip's notice through `tip.ts` and the same said file); the verbs
`collie`, `log`, `off`, `on`, `new --pass` (the stile's hidden reader and
stdin), `pass` with an address on stdin; `collie local` and `local stop`
through `local.ts`'s machinery (the Worker under the kennel's `local/`
beside the local home, `.dev.vars` mode 600 with a token minted here and
the local home's address and token); `--agent-help` and
`collie-guide.md` beside `agent-guide.md`. `packages/cli/src/usage.ts`
and `agent-guide.md` gain one paragraph each naming the collie. Not
this phase: `setup`, `deploy`, `rm`, the mint through isocan's API.

Tests: `packages/collie/test/collie.test.ts` (checkout, workerd): the
pool's `fetchMock` serves a fake isocan home and a fake sheep home, both
scripted per case — the door handing a badge, redeem, snapshot, log,
watch, park claim and delivered and advance, hold with an ask, ops,
sessions on one; `/sessions`, `/sessions/<id>` with a setup state,
`/pastures`, the file routes, `/s/<id>/prompt`, a transcript long poll
that answers tip by tip, `/s/<id>` `DELETE` on the other — and the cases
are journey 1 steps 5 to 7 (the ask enrols; a mention births a sheep into
`isocan-percy` with `ISOCAN_PASS` in its secrets; the summons text equals
isocan's for the same entries; the face's beats and end; the cursor
advanced; the narration's lines), journey 3 (off releases the hold before
the response, and a held mention is the next summons after on; the end
ends the badge and leaves the fake sheep home's rows), journey 2 step 2
in miniature (`abortAll`-style eviction of the object mid-turn; the fake
cell's turn ends; the alarm's restart rejoins and advances once) and
step 4 (the fake isocan refusing connections for a while; `back after`),
journey 5 steps 3 and 5 (isocan's spent and expired sentences relayed;
the sheep-home floor's sentence). `packages/collie/test/router.test.ts`: every route
carries the header, and every route but `GET /` refuses without the bearer.
`packages/cli/test/collie.test.ts` (command): the verbs against a fake
collie Worker beside the fake station — `--pass` at a hidden
prompt and on stdin, the address in no argument (the spawned command's
argv read) and no file (the config grepped), the report's and log's
words and `--json`, journey 5 step 4's refusals with no config. `rings.test.ts`
places every file.

**Proof:** `pnpm test` exits 0 across all three inner rings, the new
files in their rings; `pnpm --filter @sheep/collie typecheck` and `pnpm
--filter @sheep/cli typecheck` exit 0; `pnpm build` makes
`dist/collie.mjs` and `collie/worker.mjs`. Falsified by at least three mutations: the
hold loop never started (the standing-by cases fail on the fake's hold
count), the resume rule dropped (the eviction case reads two summonses),
and the pass kept in a row (the never-stored case greps it out of the
object's storage). Then the rig by hand: `collie local` beside `sheep home
local --faux` in a scratch kennel and against a fake isocan served from
the test's fixture on a port, `collie new --pass` with a fixture pass,
and `collie` reporting a room.

**Status: CLOSED, 2026-09-14.** `pnpm test` exits 0 across the three rings, both typechecks and the bundle hold, the three mutations fail their cases, and the rig by hand stood by, enrolled Percy, birthed its sheep, and switched off and on.

**Findings:**

- **2026-09-14 — `isocan/rc` exported no route client,** so the phase opened with isocan 14f39ba5 re-exporting `DaemonRoutes` (blob methods `Uint8Array`); `packages/collie` pins its release 2f15360e and writes none of the wire.
- **2026-09-14 — The pool (0.22) has no `fetchMock`:** the fakes replace `globalThis.fetch` in the shared isolate, and poll rather than resolve a case's promise, which workerd refuses across objects.
- **2026-09-14 — A refused pass leaves nothing:** the door's badge waits in memory for the redeem, and the station's floor is probed before the pass is spent.
- **2026-09-14 — Shared modules moved, not copied:** `setup-words.ts` serves `herd.ts` and the Worker; `local.ts` exports the rig's helpers; `tip.ts` keeps `collieSkew`.
- **2026-09-14 — A scratch `HOME` loses Docker's buildx;** `sheep home local` there needs `DOCKER_CONFIG` at the real `~/.docker`.
- **2026-09-14 — Open: the resume rule reads isocan's text.** The host's `attach` rejoins a marked turn, re-prompting only for an entry `summonsPrompt`'s JSON tail does not mark `redelivered`; a rejoin hook is isocan's work.
- **2026-09-14 — Open: two host pieces are the laptop's only.** `endCellBadge` is skipped, so a withdrawn sheep's badge stays live; `back after <n>s — rejoined <name>'s turn` is unsaid. Isocan's work. (The address helpers came with isocan 8729b9e3, collie phase 2.)
- **2026-09-14 — A dropped station was retried silently;** collie phase 2 says the drop once, when the station answers again.

---

## Phase 2: The sitting and the walk

**Closes:** journeys 1, 2, 3, and 5 in full; journey 6 steps 2 and 3.

**Work:** `packages/cli/src/collie/setup.ts` over `stile/`'s flow,
paint, and screen, with a collie drawn from the same shapes and the
palette the stile settled: **sheep** (the kennel through `config.ts`; a
station's address and token read from it, a local home refused with
`collie local` named, no kennel or no home refused with `sheep setup`
named),
**isocan** (`resolveIdentity` from isocan's API for this machine's home
identity; none, refused with `isocan setup` named), **account**
(`CLOUDFLARE_API_TOKEN`, else the token `credentials.ts` kept, else a
hidden prompt; kept nowhere new), **collie** (wrangler from the tools
directory `deploy.ts` already keeps, the Worker named `<station>-collie`,
deployed with `COLLIE_SHEEP_HOME`, `COLLIE_SHEEP_TOKEN`, and a minted
`COLLIE_TOKEN` on stdin through `deploy.ts`'s own secret function, `GET
/` awaited, the `collie` block written into the kennel's config),
**next**; `?` and `--explain`; `--json` and no terminal report
and ask nothing. `collie deploy [--now]` (sheep's guard: a turn the
collie holds is listed and refused without `--now`); `collie rm` (the
listing, the name typed, the badges ended, the Worker deleted through the
account API, the config cleared). `collie new` and `collie pass` through
isocan's API, imported from the `isocan` on PATH as design.md says (none,
refused at **isocan**; sheep's release manifest gains no isocan): `connect()` for this machine's identity, `resolveCanvas`
from the directory or `--canvas`, the canvas's home address, a loopback
home refused before minting, `mintPass(canvasId, actorId)` with the
shepherd's actor (or, `pass --agent`, the named agent's, collie phase 3),
the address composed as isocan's `pass` verb composes it, posted; the
price line. `package.json` (root): `isocan` from the
pinned commit as a devDependency, for the home ring's isocan daemon.
`packages/cli/test/collie-home.test.ts` (home): the rig whole, journey
1's sittings in their order and in their programs' own shapes — this
checkout's local home (`sheep home local --faux` in a scratch kennel
through `test/local-home.ts`, standing in for step 1's station), a real
isocan daemon started by the test's installed `isocan` on a free port
with its own `ISOCAN_HOME`, a canvas made and an identity named by it and
the directory bound (step 2), `collie setup --json` finding both (step 3; the rig's kennel has a local home, so it is the refusal at **sheep** naming `collie local`, carrying the home and the identity, deploying nothing), `collie local` from that kennel, `collie new` in the
bound directory minting through isocan's API against the test's daemon,
an ask posted at the daemon's `POST /api/projects/:id/agents/ask` standing
in for the tray, `isocan who` reading Percy answerable and listening to
the test's person, a comment mentioning Percy, the sheep born at the
local home and the summons in its transcript (the faux model answers
`ok`, and the walk asserts the summons reached the sheep, the face
appeared and went, the cursor advanced, the narration's lines — not that
a reply landed, which needs a real model and a container), off and the
tray's read within a second (`GET /api/projects/:id/rc`), on and the held
mention answered, the sheep home restarted mid-turn and the follow taken
up again (journey 2 step 3), the daemon restarted and `back after`,
`collie rm` on the rig ending the badge and `isocan badges` no longer
listing it, the enrolment still there. `scripts/hermetic.mjs`: the
package ring gains `collie --version` and `collie setup --json`'s refusal
against the fake account (a kennel with a local home: the rig named),
and, with `--collie`, the account ring gains journey 1 whole after the
stile it already drives (isocan's setup from its release in the ring's
fresh `HOME`, an identity of the ring's own at dev.isocan.io and a scratch
canvas bound; `collie setup` through the same terminal; `collie new`; the ask at the doorbell, a mention by `isocan comment`,
the reply read from the thread by `isocan --json comment list` within ten minutes
with no `isocan rc` on this machine, `collie log` holding the rc's lines,
off and on with the tray's read, `collie rm`, the station deleted, the
enrolment withdrawn by the ring at its end). `README.md`: the collie's section, the sitting as the shepherd meets it,
paid for by cutting.

**Proof:** `pnpm test` exits 0 across all three inner rings, the home
ring's file named in the run; both typechecks exit 0. The rendered frames
of `collie setup` looked at by the conductor as a newcomer would, before
the walk, since a stile that passes every ring can still be a fish on
legs (stile, 12 Sep). `pnpm hermetic --ring package` on the phase's
release holds. **⚑** journey 6 step 3: `pnpm hermetic --ring account
--collie-only` on the shepherd's account (the full ring's `--collie`
re-proves every older project first and lost two runs to their steps,
sheep#13), one station `sheep-hermetic-<sha>-c-t`
and its collie Worker, deployed, walked, deleted, under the shepherd's
standing authorization to run account walks. The ring's isocan identity
is its own, made in the fresh `HOME` at dev.isocan.io for the walk and
never the shepherd's; the canvas it makes there is named
`collie-hermetic-<sha>` and archived by the ring at its end.

**Status: PART-DONE, 2026-09-14.** Every inner ring holds, the frames were looked at, the package ring held on 185d9db, and the account walk held on be3d642 (18 lines, a real model's reply on dev.isocan.io); journey 3 step 1's "within a second" and journey 1 step 5's `isocan who` wait on isocan#308 and isocan#306.

**Findings:**

- **2026-09-14 — Isocan's hold outlived its socket:** it released on `req.raw` close, which Node fires once a POST's body is read. Isocan 8729b9e3 releases on `reply.raw` (1 ms on the rig) and exports the address helpers; the pin is its release 18ca496a.
- **2026-09-14 — `collie new` mints through the PATH isocan's own functions;** pnpm's `.bin/isocan` is a shell shim, so walks put a symlink on PATH, a global install's shape.
- **2026-09-14 — The stile takes a second checklist** (`drawChecklist(spec)`); the collie's coat is xterm 238, since true black vanished on a dark terminal.
- **2026-09-14 — A fresh Worker's edge disagrees for a while:** secrets put after the deploy left tokenless versions serving past five good answers; the Worker and its secrets now go up as one version (`--secrets-file` on a mode-600 pipe).
- **2026-09-14 — Four walk probes were wrong, not the collie:** a rollout window at `/faux`, a harness race reading the screen before its last bytes, `who` hiding a live agent from `standing`, and HOME spelled through `/var` retiring isocan's identity (isocan#304).
- **2026-09-14 — The station faulted a first turn during a long setup** (`AgentHarness storage or invariant fault`); the collie narrated it, retried, and resumed the same sheep (sheep#14).
- **2026-09-14 — Open: journey 3 step 1's "within a second".** On a hosted home a stopped rc's socket close does not reach it through Cloudflare's egress and Cloud Run's front end; off read 6397 ms. Waits on isocan#308.
- **2026-09-14 — Open: journey 1 step 5's `isocan who`.** A replica daemon's roster does not see a hold placed at the home; the walk read the tray's route. Waits on isocan#306.

---

## Phase 3: Moving in

**Closes:** journey 4 in full.

**Work (isocan, a second issue there once #294 has landed):** the desk's
`not-your-actor` answered for a claim the badge holds is already the
rule; nothing new is needed for the mint, since `mintPass(canvasId,
actorId)` is allowed for exactly an actor this badge holds. What isocan
adds is the words: `isocan pass --agent <name>` for a person at a laptop
who wants the line to paste into `collie new --pass`, refused otherwise
with `not-your-actor`'s sentence; the printed line says the pass arrives
as the agent. **Work (here):** `collie pass --agent <name>` resolving the
name to an actor this identity's badge holds (the roster of the bound
canvas) and minting for it; `collie.ts`: a redeemed pass that endowed an
agent's claim writes the row (the herd rule then finds the existing sheep
at the first summons, as `SheepAgent.ensureSession` already does) and
narrates `now answers for <name>`; `collie` lists an agent's origin, `born
here` or `handed over`.

Tests: `packages/collie/test/collie.test.ts` (checkout): a pass the fake says endowed an
agent, the row written, the first summons resuming the sheep the fake
sheep home lists in the pasture, no second mint. `collie-home.test.ts` (home):
Percy enrolled by a laptop-shaped `isocan rc add --harness sheep` run by
the test's `isocan` against the local home, its sheep born by one
summons through the test's own `isocan rc` (the sheep-harness path, over
the same module), then `collie pass --agent Percy`, the laptop rc's
`another park adopted Percy's cursor`, the next mention answered from the
same sheep id, and a second canvas's `collie pass` making a second room
with one badge.

**Proof:** `pnpm test` exits 0 across all three inner rings; isocan's
suite green on its side. Falsified by one mutation: the herd rule
dropped at the collie (the moving-in case births a second sheep). No
account walk: the home ring's two-rc walk is the journey, and the
account's part of it is collie phase 2's.

**Status: NOT STARTED.**

**Findings:**
