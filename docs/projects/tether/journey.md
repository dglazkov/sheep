---
status: partial
since: 2026-09-12
see: tether
note: "written 12 Sep 2026, the night stile closed, from the shepherd's issue #10: a Worker version change mid-turn looked like a lane stuck running forever. A local probe split it in two. The lane goes idle; the `sheep wait` held across the restart is what never returns, since the reset closes the cell's WebSockets and `until` has no path for a connection that ends. The blank assistant entries are pi's recovery of the interrupted model call, with `stopReason: error` and a sentence `sheep log` does not print. One phase: the reattach, the printed error, the home ring, and the account ring's `r1`. Tether phase 0 built it the same night: `until` rejects on a drop, a tether attaches again inside a two-minute window and says so once on stderr, the stream re-seeds from the reattach's snapshot by id, and `formatEntry` prints the error line. The home ring restarts a real `wrangler dev` home under journeys 1 to 4, falsified by `until` never rejecting and by the stream forgetting its ids; `sheep rm` under a held wait turned out to end it at once, and journey 4 step 3 says so. Part-done: `r1` on the account waits on the shepherd."
---

# Tether — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. A dog waits on its sheep over a socket to
each sheep's cell, and a home's restart closes those sockets. **A tether
holds through a tug**: when the socket drops, `sheep` attaches again and
goes on waiting for the same thing.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against a real home. [design.md](design.md)
is the mechanism and [phases.md](phases.md) the walk. If a journey and
the mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **A restart**: the cell's isolate replaced while a turn runs. On a
  station, a Worker version change (a secret put or delete, a deploy);
  on a local `wrangler dev` home, the process stopped and started again
  on the same state.
- **The drop**: the socket a held command has to the cell closing
  because of a restart.
- **The interruption**: the assistant entry pi writes for a model call
  the restart cut off, with `stopReason: "error"` and an `errorMessage`
  saying the request was interrupted.
- **The faux provider**: the scripted model a test home answers with; a
  step can reply after a delay, so a turn is running when the restart
  comes.

## Journey 1: The dog waits through a restart

A sheep is mid-turn, detached, and the dog is waiting on it.

1. `sheep attach <id> --detach -- "<prompt>"` starts a turn whose model
   call takes a while.
2. `sheep wait <id>` is held.
3. The home restarts while the turn runs.
4. `sheep wait` writes `sheep: <id>: the connection dropped; attached
   again` on stderr, once, and keeps waiting.
5. When the turn ends, `sheep wait` prints `<id>\t<reply>` on stdout and
   exits 0, within seconds of the reply landing and before its timeout.

Acceptance criteria:

- `sheep wait --json` prints what it prints without a restart: one array,
  the last assistant entry for the id.
- Two ids waited on at once, both restarted, both return.
- A `--timeout` shorter than the turn still exits 124 at the timeout.

## Journey 2: The dog holding a turn

The dog attached with a prompt and is holding the turn.

1. `sheep attach <id> --json -- "<prompt>"` streams the turn's entries.
2. The home restarts while the turn runs.
3. The stderr line is written once; the command keeps going.
4. The entries that land after the restart are written — the
   interruption, then the reply — and no entry id is written twice.
5. The last line is the turn's last assistant entry, the reply; exit 0.

Acceptance criteria:

- The stream's ids are `sheep log --json`'s ids for the same turn, in
  the same order.
- Text mode prints the reply and exits 0.
- A queued prompt held with `--wait` that is placed after the restart
  still streams its own turn.

## Journey 3: The dog reads what happened

1. `sheep log <id>` after a turn a restart interrupted prints the
   interruption as an `[assistant]` block whose last line is `[error]
   Assistant request was interrupted. …`, followed by the reply's block.
2. An assistant entry with no error prints as it did before, byte for
   byte.

## Journey 4: The home that does not come back

1. A dog is holding `sheep wait <id>` with no timeout and the home stops
   and does not start again.
2. `sheep wait` keeps trying to attach for up to two minutes, then exits
   2 with the connection's error on stderr. It does not hang.
3. A sheep ended with `sheep rm` while a dog waits on it ends the wait at
   once, not after two minutes of retries: the end aborts the turn before
   it closes the sockets, so the wait hears the lane go idle and exits 0
   with the aborted turn's last assistant entry. A reattach that does meet
   an ended sheep gets the home's refusal at once, and is not retried.

## Journey 5: The walk

1. The home ring restarts a real `wrangler dev` home mid-turn under
   journeys 1, 2, and 3, so `pnpm test` repeats them.
2. The account ring's walk gains a step, `r1`: on the station, a sheep
   with a faux turn of a minute or more, `sheep wait` held, a `wrangler
   secret put` and `wrangler secret delete` on the station's Worker while
   it runs, the wait returning 0 with the reply, and `sheep log` showing
   the interruption. **⚑** it deploys a station on the shepherd's
   account.
