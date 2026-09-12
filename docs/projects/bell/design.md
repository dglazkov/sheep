# Bell — the design

**11 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **a dog holding a turn hears the work as it
happens. `sheep attach --json` with a prompt writes each of the turn's
entries as it lands, one pi entry per line, and the last assistant entry
is still the last line.**

The shepherd's issue #7 states the journey. A dog attaches with a prompt
and wants to show a person what the sheep is doing — "reading the brief",
"running the tests", "editing app.ts". Text mode streams the reply and
nothing else; `--json` is quieter still, printing the last assistant
entry when the turn ends and nothing while it runs. So the dog polls
`sheep log --json --since <entry> <id>` every few seconds for the length
of the turn, which is a second client starting every few seconds beside
the one already attached, to learn what that one was already told.

Already told is the whole point. `attachSheep` is pi's client over a
WebSocket to the cell, and the lane's watch stream carries `entry_added`
with the whole entry (`agent-harness.ts`); the replica delivers it to
every subscriber as it commits. `runPrompt` subscribes today and reads
two things out of each delivery — the operation's streaming message and
`message_end` — for the assistant's text. Every tool call and every tool
result goes past unread. **Nothing has to be asked of the home that is
not already arriving.**

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the stream | each `entry_added` written as a line, in `--json` | `herd.ts`'s `runPrompt` |
| the shape | `JSON.stringify(entry)`, what `sheep log --json` prints | `herd.ts` |
| the last line | the turn's last assistant entry, printed once | `printAssistant`, kept |
| the window | from the prompt being ours to the lane going idle | `runPrompt`'s `active` |

## What is written, and when

In `--json`, from the moment the turn is ours until the lane is idle,
every entry that lands is one line: the prompt as the lane took it, each
assistant message with its tool calls, each tool result, and the final
assistant message. The order is the order they land, which is the order
`sheep log` would print them in afterwards. Nothing is summarized and
nothing is filtered: a dog that wants tool calls reads the assistant
entries' `toolCall` parts, exactly as it does from `sheep log --json`
today, and a dog that wants nothing new ignores the extra lines.

The prompt entry is written too. It is the turn's first entry, it is what
the lane made of what was sent, and a reader of the stream should not
have to have been the sender to know what the turn was for.

**The last assistant entry is still the last line.** `printAssistant` at
the end stays, and prints only when the stream has not already written
that entry: the guarantee a program depends on today does not become a
race on whether the replica's last delivery arrived before the operation
resolved. Every line is written at most once, by id.

The window is the one `runPrompt` already keeps. An idle lane takes the
prompt as an operation and the window opens with it; a busy lane queues
it and, under `--wait`, the window opens when the queued entry is placed,
so the turn the dog waited for is the turn it hears. Without `--wait`
sheep prints `queued <id>` and exits, as it does today, and nothing is
streamed because the dog is not holding anything.

## What does not change

- **Text mode.** The reply on stdout as it streams, and nothing else.
  A person reading a terminal is not reading JSON.
- **stdout's contract in `--json`.** Lines of JSON, one object each, as
  before; there are simply more of them, and the last one is what it was.
- **`--detach`.** It returns before the first token; there is no turn in
  hand to hear.
- **The cell, the wire, and pi.** Not a byte. The events were already on
  the socket, and this project reads them.

## What this does not do, on purpose

- **`sheep wait --json` streaming.** It waits on many sheep and prints
  one line each at the end; a stream per sheep is a different shape, and
  the issue asks for the one the dog is holding.
- **Entries in text mode.** A `--verbose` that narrates tool calls in
  prose is a design of its own, and the dog that wants them has `--json`.
- **Filtering to this turn's entries.** What lands while the turn runs is
  what is written; a second dog prompting the same sheep mid-turn is rare,
  and an entry's shape says whose it is better than a filter would guess.
- **Setup's blocks on the stream.** A setup that a turn waits on is said
  on stderr (bleat), and the wire has no setup records; `sheep log` is
  where the block lives.
