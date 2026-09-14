# Collie — the design

**13 September 2026.** Design, from the shepherd's issue
[#12](https://github.com/dglazkov/sheep/issues/12); nothing built. First
drafted as `sheep collie …`, recut into a repository of its own when the
shepherd asked whether the collie was its own CLI, and moved back the
same evening as a second command in this package, once "a complement to
sheep" turned out to mean "built from sheep's parts" (see "A complement,
not a tool of its own"). The
project's status lives in [journey.md](journey.md)'s front matter. The
journeys are the acceptance suite, this doc is the argument, and
[phases.md](phases.md) is the walk.

The thesis in one line: **isocan's rc is a loop over a cursor, a hold,
and a prompt, and only the prompt was ever laptop-shaped; the
sheep-harness project moved the prompt into a cell, and what is left is a
mechanical dog that a Durable Object on the shepherd's own account can
run, awake, for the price of a socket — so the rc's room becomes a module
in isocan, and `collie`, a second command in sheep's package, is what deploys the
object, hands it the shepherd's pass, and reads what it did, with the
station and the `sheep` command untouched.**

## A complement, not a tool of its own

The collie is a command of its own and not a tool of its own. It has no
home: the station is sheep's, deployed by `sheep setup`, and the collie
reaches it with the address and token the kennel already holds. It
has no identity: it arrives at isocan as the shepherd's second machine,
on a pass minted with the identity `isocan setup` made. It has no agents
and no sessions: the agents are isocan's, enrolled in isocan's tray and
gated by isocan's rules, and their sessions are sheep, listed by `sheep
ls` and ended by `sheep rm`. It has no account of its own to ask for: the
Cloudflare token it deploys with is the one `sheep setup` kept in
`~/.sheep/credentials`, read from that file and kept nowhere new. What it
owns is exactly what neither program could: one Worker on the shepherd's
account, the rooms it stands by on, and the narration of what it did.

So `collie setup` is the third sitting, never the first, and it asks for
nothing: its **sheep** and **isocan** steps find what the other two made
and refuse plainly when one is missing, naming that program's setup.
`collie` is to sheep what a dog is to a home — a thing that runs `sheep`'s
routes so that the shepherd need not — and it is to isocan what a
laptop's `isocan rc` is, moved off the laptop. A reader who knows sheep
should find nothing new here but the Worker; a reader who knows isocan's
rc should find nothing new but where it runs.

That is also why it lives in this repository and not one of its own,
which is where it spent an afternoon (13 Sep 2026). A complement built
from sheep's parts — the kennel finder, the credentials reader, the
stile's flow and paint, the tip's notice and the skew line, the floor,
the deploy over the account API with wrangler from the tools directory,
the rig, the rings, the bundle and the release — would have to grow
every one of them again in a repository of its own, reading two private
file shapes it had no test on, and both repositories forbid copying. So
it is a second bin of the same package, `dist/collie.mjs` beside
`dist/sheep.mjs`, sharing `packages/cli`'s modules, with a Worker of its
own in `packages/collie` that is deployed beside the station and never
into it. `npm install -g github:dglazkov/sheep#release` puts both
commands on PATH, and the shepherd's path is two sittings and one more
command rather than three installs. The lesson is kept in the memory the
sheepdog reads: a complement of sheep's is a bin in sheep's repository,
not a repository.

## Where this stands with what came before

Isocan's [sheep-harness](../../../../isocan/docs/projects/sheep-harness/design.md)
project (10–12 Sep 2026) made a sheep the machine an isocan agent runs on:
`isocan rc add Percy --harness sheep`, and the rc on the laptop births a
sheep into a pasture named for the agent, mints a pass for the agent's
actor as the sheep's own secret, and prompts it with `sheep attach --wait
--json`. Its design names the price and the next leg in one breath: *"the
rc is a parked long poll, so a laptop still has to be open … The rc in a
cell is a later leg"*. Isocan's research weighed four ways to host that
process ([sheepdog](../../../../isocan/docs/research/2026-09-04-sheepdog.md),
4 Sep): the home running it (refused: the home never grows a spawner), a
rented box that sleeps and is woken by a signal from the home
(isocannery), a cron, and the laptop. It asked for the actor credential
first and estimated a box at a dollar a month awake twenty minutes a day.

A Durable Object on the shepherd's own account is a fifth way, and it is
cheaper than the box in every axis that note measured. Sheep already
proved the pattern beside it: a cell is an object with an alarm as its
heartbeat, resumed after eviction, reaching isocan's home from a
container; and a station already holds the credential story, a pass
redeemed once into a badge kept as rows. An object awake all month costs
about four dollars at Cloudflare's list price, inside the plan's included
duration for the first. So the collie never sleeps and needs no wake
signal from isocan: it holds isocan's long polls the way a laptop's rc
does, and the honesty the sheepdog note asked for — *answerable* said by
a socket, never a timer — is kept without a new mechanism at isocan.

Why a command of its own, and not a verb of `sheep` or of `isocan`.
Sheep's thesis is that a dog runs `sheep`; the collie is a dog, a
mechanical one, and it should run the station's routes, not live inside
the station's Worker with isocan's protocol in it, and its verbs are the
shepherd's and isocan-shaped, which `sheep`'s surface is not. Isocan's rc
is a laptop's program and its home is a Cloud Run service; a Cloudflare
Worker is a foreign deploy target there. So the collie is a second
command here with a Worker of its own, pinning isocan for the brain and
speaking to the station over HTTP alone: the station and `sheep` need
nothing, and isocan needs only the module.

Custody holds without amendment. Isocan's rule is that no agent is
spawned at a distance by machinery nobody launched. The collie is
deployed by the shepherd at their terminal on their account and handed a
pass minted as themselves; it runs as them (their badge, their second
machine); it is listed (`collie`), switched off in one round trip, and
ended. A summons reaches it as an op it read, never as a call it
received: isocan's home calls nothing. Every sheep it mints is in `sheep
ls` and ends with `sheep rm`. This is the sheepdog note's shape B with
the box replaced by an object, and isocan #210's shape 2 with the parking
made nearly free.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| `collie` | the second command of this package; the shepherd's, like `sheep setup` | `packages/cli/src/collie/`, `bin/collie.js`, `dist/collie.mjs` in the release beside `dist/sheep.mjs`; on PATH with `sheep` |
| the Worker | the collie's own Worker on the shepherd's account beside the station, `<station>-collie` by default, one Durable Object `Collie` named `collie`, a bearer token of its own | `packages/collie`; `collie setup` deploys it, `collie deploy` redeploys it, `collie rm` deletes it |
| the brain | isocan's rc room as a module with no Node in it: the laps, the hold, the asks, the dispatch, the guard, the narration, the sheep adapter's policy | isocan, `isocan/rc`; a pinned git dependency of `packages/collie` alone, moved by `/isocan-bump` |
| the body | what the brain is given at the Worker: the routes client over the object's badge, rows in the object's SQLite, sheep commands over the station's HTTP routes, the narration as rows, a clock | `packages/collie/src/collie.ts` |
| the two secrets | the station's address and token, `COLLIE_SHEEP_HOME` and `COLLIE_SHEEP_TOKEN`, read from the kennel's config at setup and put on the Worker | `wrangler secret put`, the value on stdin, `deploy.ts`'s own function |
| the config | the collie Worker's name, address, and bearer token | the kennel's config, a `collie` block beside `home`, `token`, and `name`; `CLOUDFLARE_API_TOKEN` and the Anthropic key are never here |
| a room | one canvas: its id, title, and home address, kept from the pass that opened it | a row in the object's `rooms` |
| the pass | minted by `collie new` through isocan's API with the shepherd's identity on this machine, or taken at a hidden prompt with `--pass`; its address handed to the Worker | `POST /passes`; redeemed at once and never stored |
| the badge | the collie's credential at one isocan home, born at its first request there and endowed by every pass it redeems | a row in `badges`, per isocan home; never leaves the object |
| the narration | the rc's lines, as rows: seq, time, the room, the line | `narration`, the last 5,000 rows kept; `GET /log?since=` and `collie log` |
| the switch | `POST /off`, `/on`: off stops the loops and releases every hold, on starts them | `collie off`, `on` |
| the rig | the Worker under `wrangler dev` under the kennel's `local/`, reaching the kennel's local home and a local isocan daemon | `collie local`; `local.ts`'s machinery; the rings' and the developer's |
| the floors | two ISO times the command carries: the oldest station build whose routes the collie speaks (read from `x-sheep-build`, shear's floor with its own value), and the isocan commit the brain is pinned at | `packages/cli/src/collie/floors.ts`; moved by hand, `/isocan-bump` says when |

## The brain: isocan's room, as a module

Isocan's `runRcRoom` (`packages/cli/src/main.ts` there, about twelve
hundred lines) is the whole of what an rc does on one canvas: adopt a
cursor row per enrolled agent, read the log once a lap from the earliest
of them, apply `dispatchReason` per agent, hold `rc/hold` back to back so
the agents read as answerable, enrol the tray's asks, gate a summons by
owner, ceiling, and chain, narrate every step, run the turn through an
adapter with the face's beats, say failures in the thread in the system
voice, and advance the cursor when the turn ends. Almost none of that is
laptop-shaped, and the parts that are can be counted: `console.log`,
`rc-agents.json` on disk, `spawn` for an adapter, the session pointer
file that loans the face to the agent's own CLI commands, the
auto-upgrade window, the sandbox fence, and the harness scan. Everything
it decides with is already in `@isocan/core`, which has no `node:`
import, and its typed route client (`DaemonRoutes`) is fetch-only by
design, with a test that keeps it so.

So the first phase is in isocan, filed as
[isocan#294](https://github.com/dglazkov/isocan/issues/294) for any host
that is not a laptop: the room moves out of `main.ts` into a package with
no Node in it, `isocan/rc`, and the laptop's `isocan rc` becomes its
first consumer. The module takes what a host supplies and
nothing else:

- **The routes**, `DaemonRoutes` over `fetch`, with the badge store as a
  parameter (`read`, `keep`) rather than `@isocan/server`'s file. The door
  hands a badge to a badge-less caller and the client keeps it; the host
  decides where. The room declares the calls it makes as `RoomRoutes`,
  and `isocan/rc` exports `DaemonRoutes` itself, so a host constructs
  isocan's client over its own `fetch` and never writes the wire again
  (collie phase 1 asks isocan for that export).
- **The rows**: the rc half of the enrolment record, as an interface with
  the five verbs isocan's `rc.ts` has.
- **The adapter**: `ensureSession`, `prompt`, `close`, as today; and
  `SheepAgent` rewritten over a `SheepCommands` interface — `sessions`,
  `session`, `pastures`, `pastureNew`, `pasturePut`, `mint`, `attach`,
  `rm`, `abort` — so that its policy (a pasture per agent, `setup.sh`,
  `BRIEF.md`, the collab skill, the pass as the sheep's own secret, a
  sheep resumed from the herd before one is born) is written once. The
  laptop implements the commands with `spawn`; the collie with the sheep
  home's routes.
- **The narration**: one function, a line.
- **Small state** the room wants to survive a restart: the guard per
  agent, the said-sets, the turned-away keys. A key-value the host backs.
- **A clock and a sleep**, so a test can run a night in a second.
- **The collab skill's text**, exported by the module: a host with no
  disk has to be given it.
- **One rule the laptop never needed**: the room claims only the agents
  its badge may speak as. On a laptop that is every agent it enrolled; at
  a collie it is those born through it and those handed to it. Any other
  agent on the roster is named once and left alone, rather than claimed,
  faced, and failed on every summons.

Out of the module, by name: the upgrade window, the fence, the harness
scan and the default-harness question, and the session pointer file. The
proof is isocan's own: its rc suite green over the module, and a boundary
test that `isocan/rc` and everything it imports has no `node:` import and
nothing from `@isocan/server`.

Why not write the loop again here: isocan's rc moved every day this
month. A copy would be right for a week.

## The body: an object that never sleeps

`Collie` is a Durable Object in the collie's own Worker, `packages/collie`,
one, addressed by name; the station's Worker gains nothing. Its SQLite holds `badges` (one per isocan home: the address, the
badge id, the secret), `rooms`, `agents` (the rc rows: canvas, actor,
name, sheep id, pasture, the pass id the sheep redeemed), `state` (the
room's small state), and `narration`. The Worker's router guards every
route with the collie's own bearer token, and stamps every response with
`x-collie-build`, sheep's shape.

**The loops.** For each room the brain's `runRoom` is started detached,
under `waitUntil`, as a cell starts a drive, and an alarm is armed a lap
ahead. The alarm handler's whole job is to see that every room's loop is
running and start any that is not; a collie evicted by a deploy or by
the platform is back within a lap, with its rows and its badge, and the
brain's own start — re-read the roster, adopt the cursors, re-issue the
hold — is what a laptop's rc does at every start. `off` stops every loop
through its abort signal and clears the alarm; `on` starts them and arms
it. Two long polls per room are outstanding at any moment, isocan's log
watch and the hold, exactly the laptop's two.

**Standing by is a socket.** The hold is the same `POST /api/rc/hold` a
laptop issues, ten seconds at a time, back to back, and it dies with the
loop: off, an eviction, and the end all close it at once, and the tray
reads nobody listening within the hold's window. Nothing at isocan is
told that this rc is hosted.

**Prompting a sheep, over HTTP.** `SheepCommands` at the collie are the
sheep home's routes with the home's token, the ones a dog's `sheep`
speaks: `sessions` is `GET /sessions` (`?pasture=` for a herd);
`session` is `GET /sessions/<id>`, bleat's row with the setup's state;
`mint` is `POST /sessions` with the pass as the sheep's own secret
(earmark); `pastureNew` and `pasturePut` are `POST /pastures` and the
pasture's file routes; `rm` is `DELETE /s/<id>`, `abort` is `POST
/s/<id>/abort`. `attach` is `POST /s/<id>/prompt` and then `GET
/s/<id>/transcript?wait=25000&tip=<tipId>`, the cell's own long poll,
which answers when the tip moves or the operation ends: the entries
since the last tip are the beats and the reply, one entry at most once
by id, and the setup's state from the row is narrated as `sheep attach`
says it on stderr. No WebSocket: pi's protocol stays pi's client's. A
transcript re-read per beat is what the rc did before bell, and it is
bounded by the cell's own `wait`; a plain entry stream on the sheep
home would be a small project here later, if the walk finds
the re-read costs a turn. Nothing runs between turns; a turn costs what
a sheep's turn costs.

**The resume rule.** The sheep's turn is the cell's, at another Worker,
and outlives the collie's own restart. When the loop starts and an
agent's sheep is `running` or `waiting`, the collie rejoins that turn —
the transcript long poll from where it stands — and advances the cursor
when it ends, rather than handing the batch to a second summons. The
park's redelivery marking is kept for the case it was made for, a turn
that left no trace.

**Whose word.** The collie is its owner's second machine — the pass was
minted by the shepherd as themselves — so isocan's owner-only rule reads
as it should: an agent at the collie answers the shepherd, and whoever
the shepherd widened it to in the tray or with `isocan rc listen`.

## The command: one sitting, and four verbs

`collie` is the shepherd's, like `sheep setup`: the pass comes from their
isocan identity and the Worker goes on their account, and neither is a
dog's to mint. It stands on both sides at once, which is why it is a
command of its own: it reads the kennel with `config.ts` as `sheep` does
(`.sheep/` at or above the directory, else `~/.sheep`) for the station's
address and token, and `credentials.ts` for the account token, and it
imports isocan's Node API (`connect` from `isocan`) for the
identity, the bound canvas, and the mint. That isocan is the one the
shepherd installed in their second sitting, never a copy in sheep's
release: the `isocan` on PATH, its package found by walking up from the
bin's real path to the manifest named `isocan`, and imported by that
manifest's own `.` export, which is the same for a release install and a
linked checkout. So sheep's install carries no isocan and `collie`
installs nothing, the identity is read by the isocan that wrote it, and
no `isocan` on PATH is refused at **isocan** with `isocan setup` named.
The `sheep` command is not
asked to know isocan, and isocan is not asked to know the kennel.

- **`collie setup`** is the stile's own screen with a collie drawn from
  the same shapes: a checklist that fills in. **sheep** (the kennel and
  the station it names; a local home refused, the rig named), **isocan**
  (the identity here, whose), **account** (the token the stile kept in
  `~/.sheep/credentials`, or a hidden prompt; `CLOUDFLARE_API_TOKEN`
  first), **collie** (wrangler from the same tools directory, the Worker
  deployed with the two secrets on stdin and a bearer of its own minted
  here, the `collie` block written into the kennel's config), **next**
  (`collie new` on a bound canvas). No **command** step: sheep's install
  put `collie` on PATH. Idempotent; a second run redeploys the same
  Worker, which is the upgrade. `--explain` and `?` as the stile has
  them. With no terminal or `--json` it asks nothing and reports.
- **`collie new [--canvas <ref>] [--pass]`** resolves the bound canvas
  through isocan's own resolution from the directory, refuses a loopback
  isocan home before minting, mints a pass with the shepherd's identity,
  posts its address to the Worker, and prints the report: the room's
  title and address, the owner's name, the price line (`standing by costs
  one object awake, about four dollars a month at Cloudflare's list
  price, inside the plan's included duration for the first`), the tray,
  the log. `--pass` takes an address at a hidden prompt (one line of
  stdin without a terminal) for a machine with no isocan identity.
- **`collie pass [--agent <name>] [--canvas <ref>]`** hands the collie
  another: a second canvas becomes a room; `--agent` mints for the named
  agent's actor when this identity's badge holds its claim (isocan's
  `mintPass(canvasId, actorId)`, allowed for exactly that), and the
  agent becomes the collie's.
- **`collie`** is the report: standing by since when, each room, each
  agent with its sheep's id and lane and whether it was born here or
  handed over, turns in the last hour against the ceiling, whose word it
  takes. `--json` for a dog that reads it.
- **`collie log [--follow] [--last <n>] [--since <t>]`** is the
  narration, one line per row in the rc's own shape, the clock first.
- **`collie off`**, **`on`**: the switch. **`collie deploy`**: the
  Worker again from this package, the secrets kept; refused while a turn
  the collie holds is running unless `--now`, sheep's guard in the same
  words. **`collie rm`**: lists what goes and what stays, waits for the
  name typed at a terminal, ends the badge at each isocan home, deletes
  the Worker, clears the config.
- **`collie local`**: the rig. The Worker under `wrangler dev` under the
  kennel's `local/` beside the local home, pointed at that home and
  reaching a local isocan daemon, through `local.ts`'s own machinery;
  `collie local stop`. The developer's and the rings'; the shepherd never
  hears of it.
- **`collie --agent-help`**: the guide an agent reads: what a collie is,
  that setup, new, pass, and rm are the shepherd's, that `collie` and
  `collie log` are anyone's, and that a collie's sheep are herd like any
  other.

Every verb says once on stderr that a newer build is out, through
`tip.ts` as `sheep` does, and once when the collie Worker's build and the
command's differ, through the same said file; `collie deploy` is the
fix.

## What this does not change

- **Isocan's canvas, tray, desk, and words.** Adding, withdrawing,
  mentioning, gating, and the system voice are what they are; the harness
  is sheep by construction and no dialog asks.
- **The laptop's `isocan rc`.** It runs the same module and behaves as it
  does today, and it stands down for an agent a collie holds the way it
  stands down for any other park.
- **The station and the `sheep` command.** No route, no verb, no object
  in either; `sheep ls` cannot tell a collie's sheep from a dog's except
  by the pasture's name. What changes in this repository is a second bin,
  a new package for the Worker, and the shared modules gaining what both
  commands need.

## What this does not do, on purpose

- **Ask for what sheep already asked for.** The account token and the
  station's address and token are read where `sheep setup` kept them,
  through the modules that wrote them.
- **Sleep.** The object is awake and the price is said at `new`. A
  collie that sleeps would need isocan to grow a wake signal, which the
  sheepdog note called the dangerous door.
- **Answer for an agent it cannot speak as.** Named once, left alone.
- **Withdraw anything at its end.** `rm` ends the collie's badge and
  Worker; the canvas keeps its enrolments and the sheep home its sheep.
- **A collie per canvas or per kennel.** One per account, rooms by
  passes. If an account is ever shared by two shepherds, that is the day
  it gets a name.
- **Speak pi's protocol.** The cell's transcript long poll is the follow;
  a stream is a project of its own if the walk asks for one.
