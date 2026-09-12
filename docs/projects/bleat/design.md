# Bleat — the design

**11 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **a sheep says what it is waiting on. A pasture's
`setup.sh` running in a container is a row the home answers at once, a
block of its own in the dog's log, and a line on stderr while the dog
waits.**

The shepherd's issue #4 states the journey. A sheep's first command in a
fresh container waits for `setup.sh`; the dog, holding `sheep attach
--wait <id> -- "…"`, sees nothing for two minutes. `sheep status <id>`
says `running` with the open operation and the last tool call — the tool
the sheep called, which is not the setup that tool is waiting on. When
setup fails the sheep sees its output as a tool result, which is right
(pasture phase 4); when setup succeeds, or is still going, the output is
one `console.info` in the home's logs, which no dog can read. A dog that
cannot tell a slow setup from a hung sheep either waits too long or
aborts too early, and both cost more than the setup did.

Three surfaces, one fact underneath: `sheep status <id>` says `setup:
running (1m 40s)`; `sheep log <id>` carries setup's output as a block of
its own, dated, where it happened; and a prompt held by `sheep attach`
says `setup running (1m 40s)` on stderr, the way `queued <id>` is said
today.

## Where setup runs, and who can see it

`warm()` in `env/execution-env.ts` is the one place `setup.sh` runs: once
per container, after the socket's first sync-in, before that container's
first command, or after the clone for a birth (pasture phase 4). Every
setup in a sheep's life goes through it, the birth's included, and its
whole output is already a string in that function. Nothing outside the
function learns that it ran.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the sink | `onSetup`, the one call the env makes at a setup's start and at its end | `env/execution-env.ts` |
| the row | `setup` on the sheep's Directory row: the state, when it started, how long, how it ended | `directory.ts` |
| the record | the cell's own row per setup: the same, with the output's tail | `bleat.ts`, `cell.ts` |
| the block | `sheep log`'s `[setup]`, dated, merged into the transcript by time | `herd.ts` |
| the line | `setup running (1m 40s)` on stderr while a prompt waits | `herd.ts` |

## Why the live state is the Directory's row, and not the cell's

The obvious home for "a setup is running" is the cell, and `GET /s/<id>/`
would carry it. It cannot: the case the issue opens with is a sheep whose
*first* prompt rents the container, and a cell's first boot is where the
birth runs (pasture phase 3, mint phase 0). `state()` awaits `runtime()`,
and during the birth that promise is the boot, which is held by the very
setup the dog is asking about. Every read of the cell — the wire, the
transcript, the state — waits exactly as long as the dog does.

The Directory answers in a millisecond whatever the cell is doing, keeps
the lane state already (`running` for the birth's length), and is where
`sheep ls` reads without waking anything. So the sheep's row gains
`setup`: `{ state: "running" | "ok" | "failed", at, ms?, exit?, error? }`,
`null` for a sheep no setup has ever run for. The cell reports it at the
start of a setup and at its end, through the sink, and a boot that finds
the row saying `running` — an incarnation evicted mid-setup — writes
`failed` with the sentence for it, so `running` is never a lie an
eviction left behind.

`GET /sessions/<id>` is the route: the row alone, the Directory's, never
a cell. `sheep ls --json` carries `setup` beside `task` and `secrets`;
`sheep ls`'s columns do not grow, since a dog asking about one sheep asks
`status`.

## Why the log's block is not a lane entry

A setup's output belongs in the transcript where it happened: between the
tool call that rented the container and that call's result. pi will not
put it there. `appendCustomEntry` while an operation is open does not
append: `lane.ts`'s `append` sees `state.operation !== null` and puts the
entry in the lane's **inbox** as a pending write, materialised when the
turn ends — after the tool result, not between the call and it, and
invisible for the whole of the wait, which is the only time it is worth
anything. A pi change to write into an open operation's transcript would
buy one log line at the cost of the lane's one invariant.

So the record is sheep's own, in the cell's own storage beside the birth's
(`bleat.ts`), written when setup starts and replaced when it ends: `at`,
`ms`, the command, `exit` or `error`, the output's tail — 40 lines and 16
KiB, the birth's bounds — and fold's `cache` outcome. The last 20 are
kept; a sheep that has rented fifty containers has its last twenty setups.
`GET /s/<id>/transcript` carries them beside the entries as `setups`, and
`sheep log` merges them into what it prints by time. They are not pi's
entries, are not in `sheep export`'s tables, and reach no model:
**nothing about what the model reads changes in this project**, which is
the cheapest way to be sure a log for the dog is not a message for the
sheep. `--json` gives each its own `"type": "setup"`, which is what the
issue asks for by asking for a type of its own.

A birth's setup says itself twice on failure: once in the `birth` entry,
which the model reads (pasture phase 4's rule, unchanged), and once in
the block, which the dog reads. That is the price of the two audiences,
and the block is the only one of the two that says anything when setup
succeeds.

## The dog's three surfaces

**`sheep status <id>`** gains one line, from the row: `setup: running (1m
40s)`, `setup: ok (1m 52s)`, `setup: failed (exit 1, 12.4 s)`, or `setup:
none`. `--json` is pi's lane snapshot with `setup` beside it. The row is
read first, and when it says a setup is running the lane read gets two
seconds and no more: a cell being born cannot answer, and a dog that asked
what its sheep is doing is answered with what is known rather than made
to wait for the thing it is waiting on. The short form says the id, the
state, the setup line, and that the cell is busy with setup and has no
lane to show yet.

**`sheep log <id>`** prints the block where it belongs:

```
[setup] setup-1757620443122 2026-09-11T20:14:03.122Z exit 0 after 1m 52s
<the output's tail>
```

A setup still running is `running (1m 40s)` in place of the ending, with
whatever it has printed so far — which is nothing, since the output is
kept at the end; the block being there at all is the answer.

**A prompt held by `sheep attach`** (and by `-c`, by `new` with a prompt,
and by all three with `--detach`, which wait on the same request) says it
on stderr: the row is asked every 10 s from the moment the command starts
— before the socket, since during a birth the socket is what is waiting —
and the first answer that says `running` prints `setup running (1m 40s)`,
another every 30 s after it, and one line when it ends: `setup ok (1m
52s)`, `setup failed (exit 1, 12.4 s)`. A sheep with no setup prints
nothing and the dog sees what it sees today. Nothing is printed on stdout,
so every program reading a reply reads the same bytes.

## What this does not do, on purpose

- **A pi change.** The lane's inbox is right about an open operation; the
  dog's log is sheep's to keep.
- **Setup's output streamed as it runs.** The block gets the tail at the
  end. A dog that needs the line the install is on wants the container's
  lane, which is a bigger door than this issue asks for.
- **`sheep wait` saying it.** It waits the same way and could say the same
  line; it takes many ids, and one line per sheep per 30 s is a different
  design. The walk will say whether the dog wants it.
- **A column on `sheep ls`.** The row carries `setup` and `--json` shows
  it; the text table's six columns stay six.
- **The cell answering while it is born.** `GET /s/<id>/` and `sheep log`
  wait for the boot as they do today; the Directory is what answers
  meanwhile, and that is the whole reason the live state lives there.
- **Every setup kept.** The last twenty. A sheep whose log wants more
  than that wants the home's own logs.
