---
status: partial
since: 2026-09-13
see: collie
note: "planned 13 Sep 2026 from the shepherd's issue #12: isocan's rc, the mechanical dog that answers a canvas's summonses by prompting sheep, hosted so no laptop stays open. Planned first as `sheep collie …`, recut into a repository of its own when the shepherd asked whether the collie was its own CLI, and moved back the same evening once it read as a complement built from sheep's parts: `collie` is a second command in this package, with a Worker of its own on the shepherd's account, one Durable Object that runs isocan's rc awake, holding isocan's long polls and prompting sheep over the sheep home's routes. Isocan's rc becomes a module with no Node in it (the brain, isocan's); the sheep home and the `sheep` command are untouched. Four phases, the first in isocan: closed there on 14 Sep 2026 as its project `room` (isocan#294), verified from a scratch install; nothing built here yet."
---

# Collie — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. [Isocan](https://github.com/dglazkov/isocan)
is a canvas where people and agents work together, and its **rc** is the
program that answers a canvas's summonses by prompting an agent. For an agent enrolled
`--harness sheep` the rc prompts a sheep, and the rc itself runs on a
laptop, so a laptop has to stay open. A **collie** is the dog that works
a field on its own once it has been shown it: the shepherd whistles once
and goes in for the night, and the collie stands by the **gate**. Here it
is isocan's rc, running at the shepherd's own Cloudflare account beside
their sheep, so a canvas's agents answer at three in the morning with
every laptop shut. The collie is a complement to sheep, not a tool of its own:
`collie` is a second command in sheep's package, built from the same
parts as `sheep`; the home is the station, the identity is the shepherd's
isocan one, the agents are isocan's, the sessions are sheep, and the
account token is the one `sheep setup` kept; what the collie owns is a
Worker of its own, the canvases it stands by on, and the record of what
it did.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against a real account. [design.md](design.md)
is the mechanism and [phases.md](phases.md) the walk. If a journey and
the mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use, isocan's and sheep's words where they are
theirs:

- **The shepherd**: the person. They have a station (`sheep setup`) and
  an isocan identity on this machine (`isocan setup`), and they run
  `collie` at their own terminal, the second command sheep's package puts
  on PATH. An agent never runs `collie setup`, `new`, `pass`, or `rm`.
- **The canvas**: an isocan canvas at an isocan **home** with an address
  (`https://isocan.io/p/<id>`); the **tray** is where a person on it adds
  and withdraws agents.
- **The sheep home**: the station `sheep setup` deployed, named by the
  sheep kennel's config with its token; a **sheep** is a session there.
- **The collie**: the Worker `collie setup` deploys on the shepherd's
  account beside the station, one Durable Object that runs isocan's rc
  room for each canvas it was given. It **stands by** on a canvas (isocan's *answerable*: its
  hold there is open) and **summons** a sheep when the canvas summons an
  agent.
- **A room**: one canvas the collie stands by on.
- **The pass**: isocan's fifteen-minute, single-use credential that puts
  another machine of the shepherd's on a canvas, arriving as them.
  `collie new` mints it through isocan's own API with the shepherd's
  identity here and hands it to the Worker; nobody sees its token.
- **The badge**: what the collie holds at an isocan home once it has
  redeemed a pass: the shepherd's second machine.
- **The narration**: the lines the rc prints at a laptop's terminal —
  `Percy · summons from Dimitri, 1 entry — starting a session` — kept at
  the collie as rows and read with `collie log`.
- **The switch**: `collie off` and `on`. Off releases every hold at once,
  so the canvas reads nobody listening within a second; the enrolments,
  the badge, and the sheep stay.
- **The rig**: `collie local`, the Worker under wrangler on this machine
  against the kennel's local home and a local isocan daemon; the
  developer's and the rings', never the shepherd's.

## Journey 1: Two sittings, one more, and the collie stands by

A bare laptop: no `sheep`, no `isocan`. The shepherd has a Cloudflare
account on the Workers Paid plan and an Anthropic key, and nothing else
is set up. Every step is theirs, at their own terminal; after step 6
nothing needs them or the laptop.

1. **Sheep.** `npx github:dglazkov/sheep#release setup` is sheep's own
   sitting, as its README says it: the checklist fills in, they type the
   account token and the model key at hidden prompts, and a station is
   deployed on their account. `sheep home` names it, and `collie` is on
   PATH beside `sheep`, since it is the same package. (Sheep's stile,
   unchanged; the collie asks nothing of it.)
2. **Isocan.** `npx github:dglazkov/isocan#release setup` is isocan's own:
   the daemon starts, the app opens, they pick their name and make a
   canvas at isocan.io, and the directory they are in is bound to it.
   `isocan whoami` names them; `isocan canvas` names the canvas. (Isocan's
   setup, unchanged.)
3. **Collie.** `collie setup` prints a small collie and a checklist that
   fills in: **sheep** finds the kennel and the station step 1 made, and
   says which; **isocan** finds the identity step 2 made, and says whose;
   **account** reads the Cloudflare token step 1 kept, or asks for one at
   a hidden prompt when none is kept; **collie** deploys the Worker on the
   account with the station's address and token as its secrets and
   becomes its address; **next** says `collie new` on a bound canvas is
   the whole of what is left. They typed nothing steps 1 and 2 had not
   already asked for.
4. `collie new` in the bound directory prints, within a few seconds: the
   collie is standing by on `"<canvas title>"` at its address, as `<the
   shepherd's name>`; what standing by costs; that agents are added in the
   tray at that address; and that `collie log` follows what it does. The
   pass was minted and spent inside the command: its token was never on
   the screen, in a process's arguments, or in a file.
5. The tray at that address offers **Add an agent**, since an rc is
   parked there. They add `Percy`. Within a lap `collie log` says
   `Dimitri asked from the canvas to add Percy — enrolling here`, and
   `isocan who` lists Percy as answerable, listening to Dimitri.
6. They comment on an item: `@Percy the empty state reads wrong`. The
   narration says `Percy · summons from Dimitri, 1 entry — starting a
   session`, then `birthing a sheep for Percy`, `making pasture
   isocan-percy`, `minting a pass for Percy`, `sheep <id> minted`,
   `session started`, then the tool beats. Percy's face appears on the
   thread and works. A minute or two later Percy replies on the thread,
   as Percy, and the face goes. `turn ended — end_turn`.
7. `sheep ls` from any machine on that station lists Percy's sheep,
   idle, in pasture `isocan-percy`; `sheep log <id>` is the turn, the
   summons text first. `collie` prints the room, Percy, its sheep's id
   and lane, turns today, and since when the collie has stood by.
8. They close the laptop. Nothing after step 4 needed it open. The
   `isocan` daemon on it was for steps 2 and 4 alone: the collie speaks
   to isocan.io, not to the laptop.

Acceptance criteria:

- Two sittings and one more, in that order, each asked for once: sheep
  asks for the account token and the model key, isocan for a name, collie
  for nothing new and installs nothing, since sheep's install put it on
  PATH. A machine that has done the first two has done all the collie
  needs.
- The summons Percy's sheep receives is byte-identical to what a laptop's
  `isocan rc` would send for the same entries, and the narration's lines
  are the rc's lines: the collie runs the rc's room, not a likeness of it.
- No new gesture in the tray or at isocan, and nothing at the sheep home
  that a dog's `sheep` does not already do over HTTP. The harness is
  always sheep and is never asked.
- The collie is a machine the shepherd started, as themselves, listed by
  `collie`, stoppable by `collie off`, and ended by `collie rm`: isocan's
  rule that no agent is spawned at a distance by machinery nobody
  launched holds without amendment.
- `CLOUDFLARE_API_TOKEN` in the environment takes precedence over what
  sheep kept, and nothing requires it.

## Journey 2: The night

1. The next afternoon, well past the container's idle period, someone
   the gate admits comments `@Percy and the heading above it`. The
   narration says `session resumed`, then `setup running (40s)` every
   half minute from the sheep home's own row, then `setup ok (1m 52s)`,
   then the beats. Percy's reply refers to yesterday's comment.
2. During a turn, `collie deploy` from the laptop restarts the Worker.
   The turn lands anyway: the sheep is its own cell at another Worker and
   finishes; the collie comes back within a lap, finds Percy's sheep
   mid-turn, rejoins it rather than summoning again, and advances the
   cursor when it ends. The narration says `back after <n>s — rejoined
   Percy's turn`. Between the restart and the return the tray read Percy
   as not answerable, and never as answerable while nothing held.
3. `sheep home deploy --now` restarts the sheep home mid-turn. The
   collie's follow drops and is taken up again, said once in the
   narration, and the turn ends as tether says it does.
4. With isocan.io unreachable for a minute, the narration says so once,
   the collie keeps asking, and says `back after <n>s — nothing missed`
   when it answers; every entry landed meanwhile is in the next summons.

Acceptance criteria:

- Standing by is honest: answerable exactly while the collie holds, said
  by the hold's socket and by no timer.
- A turn is never lost to the collie's own restart or the sheep home's:
  the turn is the cell's, and the collie's resume rule is to rejoin a
  running sheep, not to summon it twice. An entry that arrived while the
  collie was away is handed to the next turn, marked redelivered when a
  previous turn may already have seen it (isocan's park rule, unchanged).

## Journey 3: The switch and the end

1. `collie off` prints `collie: off — holds released; "<title>" reads
   nobody listening; collie on resumes`. Within a second the tray's
   **Add an agent** is gone and Percy's face reads *standing by* no
   longer. A mention of Percy now is not answered and not lost: it is the
   next summons after `on`.
2. `collie on` prints `collie: standing by on "<title>"`, the tray offers
   **Add an agent** again, and the held mention is answered.
3. `collie rm` lists what goes and what stays — the badge at the isocan
   home ended, the Worker and its object deleted, the config cleared;
   every enrolment still on its canvas, every sheep still in `sheep ls`
   with its pasture — and waits for the collie's name typed at the
   terminal. `isocan badges` no longer lists the collie's badge. `collie`
   afterwards says there is none and names `collie setup`.
4. They withdraw Percy in the tray while the collie stands by. The
   narration says `Dimitri dismissed Percy — no longer answering here`,
   then `ending sheep <id>`; `sheep ls` no longer lists it; pasture
   `isocan-percy` stays.

Acceptance criteria:

- Off is one round trip and releases every room's hold before it
  returns. It is not withdrawal: nothing on any canvas changes.
- The end takes the collie's own badge and Worker and nothing that is
  an agent's or the sheep home's.

## Journey 4: An agent moves in

Percy is already enrolled with `--harness sheep` from the shepherd's
laptop, answered by the laptop's `isocan rc`, with a sheep in pasture
`isocan-percy` at the station.

1. `collie pass --agent Percy` mints a pass that arrives as Percy, hands
   it over, and prints `collie: now answers for Percy on "<title>"`.
2. The laptop's rc, still running, says `another park adopted Percy's
   cursor — standing down for it` and answers for everyone else. The
   narration says `Percy · sheep <id> is already in pasture isocan-percy
   — resuming it rather than birthing a second`.
3. A mention of Percy is answered from the same sheep, which remembers
   its earlier turns. No second pass was minted for the sheep and no
   second sheep exists.
4. A second canvas: `collie pass` in its bound directory, and the collie
   stands by on two rooms with one badge; `collie` lists both, and an
   agent's turns-per-hour ceiling counts across them.

Acceptance criteria:

- A collie speaks as an agent only when its badge holds that agent's
  claim: born through it (the tray's ask), or handed to it by a pass
  minted for the agent. Any other agent on a roster it names once in the
  narration — `Shaun is answered elsewhere; collie pass --agent Shaun
  hands it over` — and never claims, never faces, never fails a turn
  for.
- One collie per shepherd's account, one badge per isocan home, rooms
  by passes.

## Journey 5: Refusals

1. `collie setup` with no kennel naming a station is refused at the
   **sheep** step with `sheep setup` named; with the kennel naming a
   local sheep home, refused there too: a Worker on Cloudflare cannot
   reach a laptop, and `collie local` is the rig for that. With no isocan
   identity here, refused at **isocan** with `isocan setup` named.
2. `collie new` in a directory bound to no canvas is refused with
   isocan's own sentence; `--canvas <ref>` names one. A canvas on the
   laptop's own daemon (`http://127.0.0.1:…`) is refused before any pass
   is minted: the collie cannot reach that address; move the canvas to a
   home with an address, or use the rig.
3. `collie new --pass` takes a pass at a hidden prompt (one line of stdin
   without a terminal) for a machine with no isocan identity; a spent,
   expired, or unknown pass is refused with isocan's own sentence, and
   nothing at the collie changes.
4. `collie new` when the collie stands by on that canvas says so; `pass`,
   `off`, `on`, `log`, and `rm` with no collie deployed say so and name
   `collie setup`.
5. The station too old for a route the collie needs (`GET
   /sessions/<id>`, bleat's row) is refused at `collie new` with the
   home's build named and `sheep home deploy` as the fix, by a floor the
   collie carries for the sheep home's `x-sheep-build` header.
6. A mention of Percy by somebody Percy does not listen to is answered in
   the thread by isocan's system voice, in isocan's words, and starts
   nothing (isocan's owner-only rule, unchanged).

Acceptance criteria:

- Every refusal names both homes and what would connect them, in one
  sentence, and no refusal leaves a half-made collie: a pass that is not
  redeemed makes no room and no badge, and a setup that stops before
  **collie** deploys nothing.

## Journey 6: The walk

1. The checkout ring holds the Worker in workerd against a fake isocan
   home and a fake sheep home, both scripted per test; the command ring
   holds the verbs against a fake collie Worker.
2. The home ring holds journeys 1 (steps 3 to 7, an ask posted at the
   daemon's own doorbell standing in for the tray), 2 (steps 3 and 4), 3,
   4, and 5 on the rig: `collie local` against this checkout's local home
   with the scripted model and a real isocan daemon on this machine.
3. **⚑** The account ring, `pnpm hermetic --ring account --collie`, walks
   journeys 1 and 3 whole on the shepherd's account with a real model,
   from a fresh prefix, cache, and `HOME`: sheep's setup from the release
   through the terminal the ring owns (the station on the account, as the
   ring already walks it), isocan's setup from its release with a scratch
   canvas made at dev.isocan.io and the ring's directory bound to it,
   `collie setup` through the same terminal, `collie new`, an agent asked for at the doorbell, a mention
   answered from a cell with no `isocan rc` running, the switch flipped
   both ways, `collie rm`, and the station deleted. The one thing the
   fresh `HOME` cannot make is an isocan identity at dev.isocan.io that
   is the shepherd's: the ring makes one of its own for the walk, so
   the shepherd's is never touched.
