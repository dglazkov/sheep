---
status: partial
since: 2026-09-11
see: bleat
note: "written 11 Sep 2026, the day spool closed, from the shepherd's issue #4: a pasture's setup runs in a fresh container and the dog cannot tell. `sheep status` says the tool the sheep called, not the setup that tool waits on; setup's output goes to the model on failure and nowhere at all when it succeeds or is still going, so a dog holding `sheep attach --wait` sees nothing for two minutes and cannot tell a slow setup from a hung sheep. Two phases: the sink, the Directory's row, and the cell's record, proved in workerd against the fake container; then the dog's three surfaces — status's line, log's block, and the line on stderr — the docs, the command ring's fake home, the account ring's `b1`, and the walk on a home with Docker. Bleat phase 0 closed the same day: `warm()` tells a sink at a setup's start and at its end whatever the ending, the sheep's Directory row says `running` then `ok` or `failed` and answered in 1 ms while setup held the cell, the cell keeps a record per setup with the output's tail and hands the last twenty to `GET /s/<id>/transcript` beside the entries, `GET /sessions/<id>` is the row alone, and a boot that finds a stale `running` ends it; nothing the model reads changed, proved by reading the faux provider's conversation and `export`'s tables, and falsified by two mutations. Bleat phase 1, the dog's side, is next."
---

# Bleat — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. Pasture phase 4 gave a pasture a
`setup.sh` that runs once per container, and fold made what it leaves
worth keeping. Neither told the dog it was running. **A sheep says what
it is waiting on**: the row says a setup is running and for how long, the
log carries what it printed, and a dog holding a prompt is told on stderr.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against the fake container in workerd and
against a real one on a home. [design.md](design.md) is the mechanism
and [phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **A setup**: one run of `/pasture/setup.sh` in a container, before that
  container's first command or after a birth's clone. At most one runs in
  a sheep at a time.
- **The row**: the sheep's row in the Directory, which `sheep ls` reads
  and `GET /sessions/<id>` answers without waking a cell.
- **The block**: what `sheep log` prints for one setup, dated, where it
  happened; `--json` gives it `"type": "setup"`.
- **The birth**: the first boot of a cell born into a pasture with a
  repository: the clone, then setup, before the first prompt is taken.

## Journey 1: The dog hears the setup

The dog mints a sheep into a pasture whose `setup.sh` takes minutes, and
sends its first prompt.

1. `sheep attach <id> --wait -- "<prompt>"` prints `setup running (…)` on
   stderr within a quarter of a minute of setup starting, and again every
   half minute while it runs; when setup ends it prints one more line,
   `setup ok (<how long>)`. The reply then streams on stdout as it does
   today, and stdout carries no line of this.
2. From a second terminal while that runs, `sheep status <id>` answers in
   about a second with `setup: running (1m 40s)`, the elapsed time growing
   between two asks. `--json` carries `setup` beside the lane snapshot.
3. `sheep ls --json` shows the same sheep with `"setup": {"state":
   "running", …}`; `sheep ls`'s columns are the six they were.
4. After the turn, `sheep log <id>` has the block: `[setup]`, its id, its
   date, `exit 0 after <how long>`, and the tail of what setup printed —
   which on a successful setup is output no dog could see before. The
   block is between the tool call that rented the container and that
   call's result when a tool rented it, and before the `birth` entry when
   the birth did. `sheep log --json` gives it `"type": "setup"` and every
   pi entry beside it unchanged.
5. `sheep status <id>` after it says `setup: ok (<how long>)`.

Acceptance criteria:

- Step 2 answers while the cell is being born, when the cell itself
  cannot: `sheep status` waits no more than two seconds for the lane and
  says what the row knows.
- Nothing the model reads changes: the transcript pi keeps, the context
  built from it, and `sheep export`'s tables are what they would have
  been without this project.
- The elapsed times said by the three surfaces agree to the second.

## Journey 2: A setup that fails, and one that never ends

The dog's pasture has a `setup.sh` that exits 1, and later a container
that dies while setup runs.

1. The turn's tool result is pasture phase 4's, byte for byte: `setup.sh
   failed (exit 1); the command did not run:` and setup's output, and the
   model is told that way and no other.
2. `sheep status <id>` says `setup: failed (exit 1, <how long>)`, and the
   block in `sheep log` says the same with the output's tail.
3. A second command in the same sheep runs setup again, as it does today
   (a container that has not been warmed), and leaves a second block; the
   log has both, each dated, oldest first.
4. A cell evicted while setup runs leaves no `running` behind: the next
   boot finds the row saying `running` and writes `failed` with the
   sentence for an eviction, so no dog waits on a setup that has no
   container.

Acceptance criteria:

- The refusal the model sees is unchanged: the proof compares it with
  pasture phase 4's own test.
- A setup that could not run at all (no container, the budget spent, the
  pasture's secrets unreadable) is `failed` with `error` and its
  sentence, never `ok`.

## Journey 3: The quiet sheep

The dog's sheep is born into no pasture, or into one with no `setup.sh`.

1. Every command prints exactly what it prints today: no line on stderr
   from `attach`, no block in `sheep log`, and `sheep status <id>` says
   `setup: none`.
2. The sheep's row has `"setup": null`, and the home it talks to is asked
   no more often than it was, but for the row `attach` reads while it
   waits.
3. A home with no container at all is unchanged in every one of these.

Acceptance criteria:

- The home ring's journey 5, which runs against a home with no container,
  passes with its expected output unchanged but for `status`'s new line.

## Journey 4: The walk

The conductor wants it proved where a container is real, a setup is slow,
and a model answers.

1. On the local home with Docker and a real model, a pasture with a
   repository and a `setup.sh` that sleeps the better part of a minute:
   journey 1 walked end to end, the three surfaces read from two
   terminals, the times recorded.
2. Journey 2 steps 1 to 3 on that home, with a `setup.sh` that exits 1.
3. The account ring's walk gains a step: a station, a pasture whose setup
   is slow, a sheep minted into it, its first prompt sent with `--detach`
   while the row is asked, the line on stderr seen, and the block read
   back from `sheep log --json`; the sheep is among those the ring ends.
   **⚑** it deploys a station on the shepherd's account.

Acceptance criteria:

- The command ring carries journey 1 steps 1 to 3 and 5 and journey 3
  against a fake home that says what the row says, so the dog's side is
  repeated by `pnpm test`.
- No step of the walk reads the home's own logs to learn what setup did.
