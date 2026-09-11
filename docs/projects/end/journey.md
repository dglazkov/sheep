---
status: done
since: 2026-09-10
see: end
note: "written 10 Sep 2026, the evening serve closed, from the shepherd's issue #1 (a herd member with no purpose left). The dog can mint a sheep and cannot end one: `abort` stops a turn and the row stays in `sheep ls` with its workspace, its container, and its browser, forever. One verb, `sheep rm <id>`, ends it: the open turn aborted, the container destroyed, the browser closed, the cell's rows deleted, the directory's row gone. The pasture stays; the pasture is the shepherd's. End phase 0 closed the same evening: the mechanism proved in workerd against the fake container and the pool's real Chrome, journeys 1 and 2 in the cell's terms; end phase 1 the same night: `sheep rm`, every verb on an ended id the one sentence, journey 5 carrying journey 1 in the home ring, the account ring's step written; journeys 1 and 2 walked on the local home with Docker and a real model, journey 3 steps 1 and 2 with them. Journey 3 step 3 walked by the account ring the shepherd typed: six sheep ended on the platform, the delete listing none. The project is done."
---

# End — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. Lamb gave the dog `new`, and lamb phase 5
gave it `abort`, which stops a turn and leaves the sheep idle. Nothing
ends a sheep. A dog that runs a herd for a week reads a list that only
grows, cannot tell a sheep that is resting from one it is finished with,
and pays for every container and browser those sheep still hold. **Ending
is the other half of minting**: `sheep rm <id>` removes a sheep and
everything it holds, and nothing of it remains but the pasture it was
born into.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against the fake container in workerd and
against a real one on a home. [design.md](design.md) is the mechanism
and [phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **Ended**: the sheep's row is gone from the directory, its cell's
  storage is empty, its container is destroyed, its browser is closed,
  and no later request reaches it.
- **The open turn**: the operation the lane is running or waiting on,
  what `sheep abort` stops.
- **The fake container**: pen's, in workerd, reached through the same
  lease a real one is; its destroy is a count a test can read.

## Journey 1: A sheep with no purpose left

The dog has three sheep at a home with a container: `docs`, `tests`, and
`types`. `docs` is finished; `tests` is mid-turn, with a command running
in its container; `types` is idle and has never asked for a container.

1. `sheep rm <docs>` prints `<docs>\tended` and exits 0. `sheep ls` lists
   two sheep. `sheep attach <docs>` says in one line that there is no
   such session at this home and exits 2, and so do `sheep status`,
   `sheep log`, and `sheep rm` again.
2. `sheep rm <tests>` while its turn runs: the turn is aborted, the
   command in its container is killed, the container is destroyed, and
   the line printed is the same, `<tests>\tended`. `--json` gives
   `{"id":…,"ended":true,"aborted":true}`; for `docs` it said
   `"aborted":false`. Nothing about the container appears in the line:
   the dog asked for the sheep to end, and it ended.
3. `sheep rm <types> --json` ends a sheep that never rented a container
   and never looked: no container is started to be destroyed, no browser
   is launched to be closed, and the report is the same shape.
4. `sheep rm <nonsense>` exits 2 with the one line, and `sheep ls` is
   unchanged.
5. The three sheep were born into pasture `docs`. `sheep pasture docs`
   still names the pasture, its repository, and a herd of none; `sheep
   new --pasture docs` mints into it as before.

Acceptance criteria:

- After step 2, the container's own ledger recorded the kill, the
  directory's container minutes stopped growing for that sheep, and the
  fake's destroy count is one; on a home with Docker, `docker ps` no
  longer lists the sheep's container.
- After any `rm`, the cell's storage holds no table and no alarm:
  transcript, workspace, temp, files, the birth record, and the eyes'
  session row are gone together.
- A terminal attached to the sheep through pi's TUI is disconnected by
  the end; it does not hang.
- The line on stdout is exactly `<id>\tended\n`; the refusal is one
  sentence on stderr that names `sheep ls`, exit 2, nothing on stdout.

## Journey 2: The eyes are closed with the sheep

A sheep on a home with eyes has looked, so its cell keeps a browser
session warm for ten minutes.

1. `sheep rm <id>` closes that browser before the rows go: a later
   connect by the session's id is refused by the platform.
2. A sheep whose browser already idled out is ended the same way, with
   the same line: a browser that is not there is nothing to close.

Acceptance criteria:

- The close is asked of the session by its kept id and never launches a
  browser to close it.
- The cell's proof runs in workerd through the pool's binding, as the
  eyes' own proofs do.

## Journey 3: The walk

The conductor wants the end proved where a container is real.

1. On the local home with Docker, a sheep born into a pasture with a
   repository runs a command in its container; `docker ps` lists the
   container. `sheep rm <id>`: `docker ps` no longer lists it, `sheep
   ls` no longer lists the sheep, and `sheep home`'s container minutes
   have stopped growing.
2. Journey 1 walked on that home with a real model, `tests` mid-turn on
   a long command.
3. The account ring's walk gains one step, `sheep rm` on the sheep it
   minted, before the station is deleted. **⚑** it deploys a station on
   the shepherd's account.

Acceptance criteria:

- Nothing in the walk reads a sheep that was ended: every verb on its
  id is the refusal.
- The home ring's journey 5 test carries journey 1 steps 1 to 4 against
  the fake, so the walk is repeated by `pnpm test`.
