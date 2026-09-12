---
status: planned
since: 2026-09-11
see: bell
note: "written 11 Sep 2026, the day bleat closed, from the shepherd's issue #7: a dog holding a turn is shown nothing of the work. Text mode streams the reply; `--json` prints the last assistant entry when the turn ends and nothing while it runs, so a dog that wants to show a person what its sheep is doing polls `sheep log --json --since` every few seconds — a second client every few seconds, beside the one already attached, to learn what that one was already told. The lane's watch stream already carries `entry_added` with the whole entry, and `runPrompt` already subscribes; it reads the assistant's text out of each delivery and lets every tool call go past. One phase: the stream, the docs, the command and home rings, the account ring's `b2`, and the walk. Nothing built."
---

# Bell — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. A sheep at work is a turn: a prompt, tool
calls, their results, a reply. The dog holding that turn is told the
reply and nothing else. **A bell says where the flock is without anyone
going to look**: `sheep attach --json` writes each entry as it lands, so
one attached client is enough to see the work.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against a real home and a real model.
[design.md](design.md) is the mechanism and [phases.md](phases.md) the
walk. If a journey and the mechanism disagree, the mechanism is what
changes.

Vocabulary the journeys use:

- **The stream**: the lines `sheep attach --json` writes while a turn
  runs, one pi entry each.
- **The window**: from the turn being the dog's to the lane going idle;
  under `--wait`, from the queued prompt being placed.
- **The faux provider**: the scripted model a test home answers with; its
  program can call a tool and then reply after a delay, so a turn has
  parts that land at different times.

## Journey 1: The dog shows a person the work

The dog holds a turn for a sheep that reads a file and answers.

1. `sheep attach <id> --json -- "<prompt>"` writes one JSON object per
   line as the turn runs: the prompt as the lane took it, the assistant
   message carrying the tool call, the tool result, and the assistant's
   reply. Each line parses on its own, and each is the shape `sheep log
   --json` prints for that entry.
2. The tool call's line is written **before the turn ends**: with a model
   that pauses between the call and the reply, the line is on stdout
   while the sheep is still working, not in a burst at the end.
3. The last line is the turn's last assistant entry, exactly as it was
   before this project: a program that reads only the last line reads
   what it read yesterday.
4. No line is written twice; every line has an entry id of its own, and
   the ids are the ones `sheep log --json` shows for the same turn
   afterwards, in the same order.
5. Nothing is on stderr but what was there before (a queued notice, a
   setup line); exit 0.

Acceptance criteria:

- The stream and `sheep log --json <id>` agree: every line the stream
  wrote is in the log, with the same id and the same bytes.
- A turn with no tool call writes the prompt and the reply, and its last
  line is what `--json` printed before this project.

## Journey 2: The queued turn

Two dogs, or one dog twice: the sheep is busy when the prompt arrives.

1. `sheep attach <id> --json --wait -- "<prompt>"` prints `queued <id>`
   on stderr as it does today, and writes nothing until the turn it
   waited for starts.
2. When that turn starts, its entries stream as in journey 1, and its
   last assistant entry is the last line.
3. Without `--wait`, nothing streams: sheep says `queued <id>` and exits
   0, as before.

Acceptance criteria:

- The entries of the turn that was running when the prompt was queued are
  not written: the window opens at the placement of the dog's own prompt.

## Journey 3: The person at the terminal

The shepherd, or a dog in text mode, sees what they saw before.

1. `sheep attach <id> -- "<prompt>"` in text mode is byte for byte what
   it was: the reply on stdout as it streams, nothing else on stdout.
2. `sheep attach <id> --detach -- "<prompt>"` is the id on stdout and
   nothing more; there is no turn in hand to hear.
3. `sheep new --json -- "<prompt>"` streams the same way `attach` does,
   since it is the same path; `session <id>` is still on stderr.

Acceptance criteria:

- The home ring's journey 5, which reads exact bytes in text mode,
  passes unchanged.

## Journey 4: The walk

The conductor wants it proved where a model is real and a home is far
away.

1. On the local home with Docker and a real model: journey 1 walked with
   a prompt that makes the sheep run a command, the tool call's line read
   on stdout while the turn is still running, and the times recorded.
2. Journey 2 walked on that home, two prompts to one sheep.
3. The account ring's walk gains a step: on the station, a faux program
   with a tool call and a delayed reply, `sheep attach --json` held, and
   the stream read back — the tool call's line before the turn's end, the
   last line the last assistant entry, and the ids matching `sheep log
   --json`. **⚑** it deploys a station on the shepherd's account.

Acceptance criteria:

- The command ring drives the built CLI against a fake home that speaks
  pi's protocol, or the home ring against a real one, so the stream is
  repeated by `pnpm test` and not only by a walk.
