# End — the design

**10 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **a sheep is ended in one verb, and ending it
releases everything minting and working gave it, in the order that
costs least if the end is interrupted.**

A sheep holds five things. Its row in the Directory, which is what
`sheep ls` reads and what the Worker checks before any request reaches
the cell. Its cell's storage: pi's tables, the workspace and temp rows,
the birth record, the eyes' session row, and the alarm. Its container,
a `PenContainer` object named for it, running until its idle period
passes. Its browser, a Browser Rendering session kept warm for ten
minutes. And whatever terminals are attached over its WebSockets. Today
every one of these is released by time or never: `abort` leaves the row
and the rows, the container idles out, the browser idles out, the
transcript stays until the home is deleted. The shepherd's issue #1 says
what a dog wants instead: `sheep rm <id>`, and nothing of that sheep
remains.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the end | `DELETE /s/<id>` on the Worker: the cell ends, then the row goes | `index.ts` |
| the cell's end | `SessionCell.end()`: abort, disconnect, destroy, close, delete | `cell.ts` |
| the removal | `Directory.remove(id)`: the row and the container row gone | `directory.ts` |
| the verb | `sheep rm <id> [--json]`, `<id>\tended` | `cli.ts`, `herd.ts` |
| the refusal | one sentence for a session the home does not have | `directory.ts`'s `unknownSession` |

## The cell's end

`end()` is the cell's, because everything it releases is the cell's to
reach: the lane, the lease, the eyes' session, the listener, and the
storage. It runs in this order, each step going on if the one before
failed, so an end interrupted by an eviction can be asked again and
finishes:

1. **The open turn is aborted.** If a runtime is live and its lane has
   an operation, the lane is told to abort, as `abort()` tells it, and
   the end waits for the lane to settle, bounded by the kill timeout
   plus a margin: pi's abort cancels the tool, and the env's kill path
   (pen phase 3, serve phase 1) ends the command in the container and
   records it on the container's ledger. A runtime that is not live has
   no turn running anywhere: the platform evicted it, and the alarm
   that would resume it is deleted in step 5 before it fires.
2. **The terminals are disconnected.** Every WebSocket the listener
   holds is closed with a code and the reason `ended`; pi's TUI reports
   a lost connection and exits its attachment. The drives are cancelled
   and the watch unsubscribed, as `evict()` does.
3. **The container is destroyed.** Through the starter, which is the
   `PenContainer` stub on a home with the binding and the test's fake
   in the pool: `destroy()`, whether or not a lease is live and whether
   or not a container was ever started. A destroy of nothing is
   nothing; the `Container` class answers it without starting one.
   The lease, if live, is discarded first so its socket closes and its
   keep-alive stops, and the container's `onStop` reports the minutes
   as it does for an idle-out.
4. **The browser is closed.** `EyesSession.close()`: when the row holds
   a session id, connect by it and `browser.close()`; a connect that
   fails is a browser already gone. Never a launch. A home without the
   binding has no session to close.
5. **The storage is emptied.** `deleteAlarm()`, then `deleteAll()`,
   which on a SQLite-backed object drops every table and key: pi's
   seven, the files table, the birth record, the eyes' row, the faux
   program. The runtime and the lease are forgotten, so a request that
   somehow reaches this object boots a fresh empty cell that nothing
   routes to.

The end answers `{ ended: true, aborted }`, where `aborted` is whether
step 1 found a turn to stop. It is idempotent: a second end finds
nothing at every step and answers `aborted: false`.

## The Worker's end and the Directory's removal

`DELETE /s/<id>` is answered by the Worker, not routed into the cell,
because the row must go after the cell's end and only then: a row
removed first would make a failed end unreachable, its storage and
container orphaned; a row removed last means a failed end answers 500
with the sentence, the row stays, and the dog asks again. The Worker
checks the row as it does for every `/s/<id>` route, calls the cell's
`DELETE /`, then `directory.remove(id)`.

`remove(id)` deletes the session row and closes the container row, so
a container the platform is still stopping has its minutes counted now
and `containerMinutes` stops growing for that sheep; the container's
own `onStop`, arriving later, finds nothing to close and adds nothing.
The pastures table is untouched: the pasture is the shepherd's, and the
herd is a query over sessions, so `sheep pasture <name>` shows a herd
of none.

The 404 every `/s/<id>` route gives for a missing row becomes one
sentence, `unknownSession(id)`, in the shape of `unknownPasture`: `no
session <id> at this home; \`sheep ls\` lists the ones there are`. Every
verb that asks the home over HTTP gets it for free through `ask`. The
verbs that attach first, `attach`, `status`, `wait`, and `abort`, fail
in the WebSocket before any sentence; `attachSheep` asks `GET /s/<id>/`
when the connect fails, so the failure it throws is the home's sentence
when the home has no such session, and the socket's when it has.

## The verb

`sheep rm <id> [--json]`: `home.end(id)`, `DELETE /s/<id>` through
`ask`. On stdout `<id>\tended\n`, or with `--json` `{"id":…,"ended":
true,"aborted":…}`. A refusal is the sentence on stderr and exit 2, as
every refusal is. There is no `--force` and no confirmation: the dog is
a program, and `abort` was never asked to confirm either. `rm` is the
name because `sheep pasture rm` and `sheep home delete` are the
siblings and the dog already knows the first; `end` is the word the
docs use for what it does.

## What this does not do, on purpose

- **Ending a pasture.** `sheep pasture rm` removes a file from the
  tree; a pasture is ended by `sheep home delete` with the home. A
  pasture verb for it is its own short project if a walk wants one.
- **`rm` of several ids at once**, or `--all`, or `--idle`. One id, as
  `abort` takes one. A herd is ended by a loop the dog writes.
- **A grace period or an undo.** The rows are gone when the line prints.
  `sheep export <id>` before `rm` is the dog's way to keep a transcript.
- **Ending from inside the sheep.** The `pasture` program is the sheep's
  one write path outward; a sheep does not end itself or another.
