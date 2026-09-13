# Tether — the design

**12 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **a dog holding a sheep holds it through the
home's restart. When the socket to a cell drops, `sheep` attaches again
and goes on waiting for what it was waiting for; and the entry pi writes
for the interrupted model call says so in `sheep log`.**

## What issue #10 saw, and what it was

The shepherd's issue #10 reports that a Worker version change mid-turn
restarts the turn and leaves its lane stuck `running`, so `sheep wait`
never returns. Its evidence is a throwaway station with a 180 s faux
turn: a secret put and delete at 17 s and 23 s, two empty assistant
entries in the transcript, the reply landing 180 s after the second, and
`sheep wait --timeout 300` exiting 124 a minute after that reply.

A local probe on 12 Sep 2026 reproduced every observation and split
them in two. A `wrangler dev` home with the faux provider, a 40 s turn
started with `attach --detach`, a `sheep wait` held, and the home killed
and started again on the same state at 8 s:

- the transcript gained one assistant entry with no text at the restart,
  and the reply landed 41 s later: the model call ran again from the
  start;
- `sheep status` said `idle` at 53 s, and a second `sheep wait` started
  then returned at once, exit 0, with the reply;
- the `sheep wait` held across the restart had printed nothing by then,
  and would have printed nothing until its timeout.

**The lane was never stuck.** "The lane never went idle" was read off
the held `sheep wait`, and the held wait is what is broken. A version
change resets the Durable Object, and the reset closes every WebSocket
the old isolate held. `attachSheep` is pi's client over that WebSocket;
`until` subscribes to the replica and has no path for a connection that
ends, so it resolves on a delivery that can never come. `sheep attach`
held with a prompt and `sheep abort` wait the same way.

**The empty entries are pi's recovery, not a restart from nothing.** A
model call is not resumable: its stream lived in the isolate that died.
When the next incarnation resumes the open operation, pi settles the
orphaned call from what was committed of it
(`vendor/pi/packages/agent/src/harness/runtime/drive/recovery.ts`): an
assistant message with the partial content, `stopReason: "error"`, and
`errorMessage: "Assistant request was interrupted. …"`, then the loop
asks the model again. With the faux provider nothing was committed
before the delay, so the partial is empty. The entry is not blank; `sheep
log` prints an assistant entry's content and never its error, so it
looks blank. The issue's second expected outcome — "end visibly as
interrupted, with a readable reason in `sheep log`" — is what pi already
writes, and what sheep does not print.

So there are two defects, both in the command, and nothing in the cell
or in pi changes.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the drop | the connection to a cell closing while the dog still holds it | `client.ts`'s transport |
| the hold | what the dog is waiting on: idle, a queued entry placed, an abort settled | `herd.ts` |
| the reattach | a new `attachSheep` to the same id after a drop, the hold read again | `herd.ts` |
| the window | how long a reattach keeps being tried while the home does not answer | `herd.ts` |
| the interruption | pi's settled assistant entry with `stopReason: "error"` and its `errorMessage` | pi, printed by `formatEntry` |

## The drop

`Sheep.until` rejects when the attachment's connection ends, with an
error of its own (`Dropped`), instead of never settling. Pi's client
already knows: the transport calls `onClose`, the connection goes
`disconnected`, and `Client.onConnectionStateChange` says so. A close
the dog asked for (`sheep.close()`) is not a drop.

## The hold and the reattach

Every place a command waits on the replica goes through one helper that
takes the id and the hold. On `Dropped` it attaches again to the same id
and reads the hold on the new attachment's first snapshot, which is the
cell's state now. A cell restarted by a version change boots on that
attach and resumes the open operation before it answers, so the new
snapshot is either still running, and the hold waits on, or already
idle, and the hold resolves at once. Nothing is polled: the reattach is
one new socket per drop, and what it waits on is the same subscription
as before.

- **`sheep wait`** reattaches each id it is waiting on, independently,
  under the one `--timeout` it already has.
- **`sheep attach` held with a prompt** (and `sheep new` with one, the
  same path) reattaches and keeps the stream. The operation is durable in
  the cell once the prompt is accepted, so a drop after acceptance loses
  the connection and not the turn. In `--json` the entries written are
  remembered by id, so the reattach's snapshot writes only what was not
  written, in the order it landed, and the last assistant entry is still
  the last line. In text mode the reply streams again from the model's
  next call; the partial already printed is not taken back. A drop
  before the prompt was accepted is a failure, as it is today: the dog
  does not know whether its prompt landed, and a second prompt is the
  dog's to send. `pi`'s `prompt` resolving with the operation's result is
  not available after a reattach, so the exit is decided by the hold
  alone, the way `sheep wait` decides it.
- **`sheep abort`** reattaches and waits for idle; the abort was asked
  of the lane before the drop, or the reattached lane is idle, or it is
  asked again on the operation the new snapshot names.

**Each reattach says so once on stderr**: `sheep: <id>: the connection
dropped; attached again`. It is not on stdout, whose lines are the
contract.

**The window.** A version change answers at once. A home that was killed
and started again answers in a second or two. A home that is gone does
not answer at all, and a dog should not wait forever on a machine that
is not there. So a reattach that cannot connect is retried, with a short
backoff, for up to two minutes of consecutive failure; past that the
command fails with the last error, exit 2, the way an attach that never
connected fails today. `sheep wait`'s `--timeout` still wins when it is
shorter. The home's own refusal (the sheep was ended, the id is not the
home's) is not retried: it is the sentence, at once.

## The interruption

`formatEntry` prints an assistant entry's `errorMessage`, when it has
one, as a last line `[error] <errorMessage>`. That is the whole change:
the entry pi wrote is printed whole, and the interruption is readable
where the dog reads transcripts. `--json` already carries the fields.

## What does not change

- **The cell, the Directory, and pi.** Not a byte. The lane resumes and
  idles as it did; the entry is pi's.
- **The model call running again.** A stream in a dead isolate cannot be
  continued, and pi's answer — settle what was committed, say it was
  interrupted, ask again — is the right one. A long real turn caught by a
  version change pays for its call twice.
- **stdout's contract.** The same lines, in the same order, with the same
  last line.

## What this does not do, on purpose

- **Stop version changes from reaching running turns.** A secret put, a
  deploy, and a rollout all make a new version, and the platform resets
  the object; the join already moved to a KV store (stile phase 2) so
  that joining touches no version. Upgrading a station mid-turn still
  runs the interrupted calls again.
- **Reattach pi's TUI.** The interactive terminal (`sheep attach` with
  no prompt) is pi's client through the bridge, and a person sees the
  socket close.
- **The container lead.** The issue's comment names a second shape not
  yet isolated: a long tool-less turn on a sheep whose cell has a pen
  container, after a redeploy, stalling with no version change. Any
  shape that stalls by dropping the socket is healed here; one that
  stalls the lane itself is not, and waits on a sighting.
