---
status: done
since: 2026-09-10
see: mint
note: "written 10 Sep 2026, the night end closed, from the shepherd's issue #3 (a sheep I can name before I have anything to say). The only way to a sheep's id without pi's terminal is to send it a prompt, so a dog pays a model turn for an identifier, and a mint into a pasture with a repository clones and sets up before the id is printed. Two phases: the mint becomes one row in the Directory, the cell booting and being born on the first thing that asks it; then the verb's docs, the refusal on attach, and the walk. Mint phase 0 closed the same night: the mint is one row, proved in workerd against the fake container, journey 1 steps 1 to 3 and 6 and journey 2 in the cell's terms, falsified by restoring the boot. Mint phase 1 the same night: `detach` sends before it prints, `--detach` with no prompt on `attach` and `-c` is refused, the guide and README say how a sheep is named before its first prompt, journey 5 carries journey 1 in the home ring, the account ring's `m1` is written; journeys 1 and 2 walked on the local home with Docker and a real model, journey 3 steps 1 and 2 with them. Journey 3 step 3 walked by the account ring the shepherd typed on 11 Sep: `ok m1` on the station, the promptless mint in 0.5 s, its sheep among the seven n1 ended. The project is done."
---

# Mint — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. Lamb gave the dog `new`, and lamb phase 5
gave it `--detach`, which sends a prompt and returns before the first
token. A dog that wants an id and has nothing to say yet has to say
something anyway, and a dog that mints into a pasture with a repository
waits for the clone before it sees the id. **Minting and prompting are
two acts**: `sheep new --detach` mints a sheep and prints its id, and the
sheep does nothing, costs nothing, and is born into nothing until
something is asked of it.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against the fake container in workerd and
against a real one on a home. [design.md](design.md) is the mechanism
and [phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **Minted**: the sheep's row is in the Directory, and nothing else of
  it exists: its cell's storage holds no table, no container was
  started, no model was called.
- **The first boot**: the first time anything asks the cell for its
  runtime; for a sheep born into a pasture with a repository, where the
  birth runs (clone, then setup, before the first prompt is taken).
- **The fake container**: pen's, in workerd, reached through the same
  lease a real one is; its starts are a count a test can read.

## Journey 1: A sheep named before it has anything to say

The dog is composing a task for a sheep in another program and needs a
session to address before the prompt exists.

1. `id=$(sheep new --detach)` prints one line, the id, exit 0, nothing on
   stderr, and returns at once: well under a second on a local home.
2. `sheep ls` lists the sheep `idle` with no task; `--json` has
   `"task": null`.
3. No model was called: `sheep log <id>` prints nothing, and `sheep
   status <id>` says `idle`, `messages: 0`, every token count zero.
4. `sheep attach <id> -- "<prompt>"` is the sheep's first turn: the reply
   streams, `sheep ls` now shows the prompt's first line as the task, and
   `sheep log <id>` has the prompt as its first entry.
5. `sheep new --name <name> --detach` and `sheep new --pasture <name>
   --detach` are the same line with the row carrying the name and the
   pasture; the refusals a mint has today (a pasture the home lacks, a
   bad name) are the same sentences, exit 2, nothing on stdout.
6. A sheep minted and never asked anything is ended by `sheep rm <id>`
   with the one line, `<id>\tended`; nothing was started to be stopped.
7. `sheep attach <id> --detach` with no prompt, and `sheep -c --detach`
   with none, are refused in one sentence, exit 2: there is nothing to
   send. `sheep attach <ended> --detach -- "<prompt>"` is the refusal
   for an ended id alone, nothing on stdout.

Acceptance criteria:

- After step 1, the cell's storage holds no table and no alarm: the
  mint touched the Directory and nothing else. The proof reads
  `sqlite_master`, as end's does after an end.
- The faux provider's program is untouched by the mint: the first step
  it answers is step 4's prompt.
- The id on stdout is exactly `<id>\n`, with or without `--json`.

## Journey 2: Born when asked

The dog has a pasture with a repository and a `setup.sh` on a home with
a container, and mints a sheep into it to give it a task later.

1. `sheep new --pasture <p> --detach` prints the id and returns at once:
   no container was started, nothing was cloned. Against the fake, the
   start count is zero; on a home with Docker, `docker ps` lists nothing
   for the sheep.
2. `sheep attach <id> --detach -- "<prompt>"` births the sheep first:
   the clone and then `setup.sh` run in one container before the prompt
   is taken, and `sheep log <id>` prints the birth entry and then the
   prompt, in that order. `sheep pasture <p>` lists the sheep in the
   herd with its task.
3. A second sheep minted into the pasture and ended before anything was
   asked of it: `sheep rm <id>` starts no container to destroy one, the
   row goes, and `sheep pasture <p>` is unchanged but for the herd.
4. A third sheep minted into the pasture and asked `sheep status <id>`
   before any prompt is born by that: the status returns `idle` after
   the birth, and `sheep log <id>` prints the birth entry alone. The
   birth is the cell's first boot, whatever asks for it; `ls` and `rm`
   are the verbs that never do.

Acceptance criteria:

- The birth entry is first on the lane and the prompt second, as
  pasture phase 3 requires; nothing about the birth changed but when
  the first boot happens.
- The Directory's refusal of a birth into a pasture with a repository
  on a home with no container is still the mint's answer, before any
  row, exit 2.
- The fake's start count after step 1 is zero and after step 2 is one.

## Journey 3: The walk

The conductor wants the mint proved where a container is real and a
model answers.

1. On the local home with Docker and a real model, a pasture with a
   repository and a `setup.sh`: `sheep new --pasture <p> --detach`
   returns in under a second with `docker ps` listing no container for
   the sheep; the first prompt clones, sets up, and answers, and the
   times are recorded.
2. Journey 1 walked on that home with a real model.
3. The account ring's walk gains a step: `sheep new --detach` with no
   prompt on the station, listed idle with no task, then its first
   prompt through `attach` and its reply through `wait`; the sheep is
   among those n1 ends. **⚑** it deploys a station on the shepherd's
   account.

Acceptance criteria:

- The home ring's journey 5 test carries journey 1 steps 1 to 4, 6, and
  7 against the faux provider, so the walk is repeated by `pnpm test`.
- No step of the walk sends a prompt to get an id.
