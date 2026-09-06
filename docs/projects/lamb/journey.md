---
status: done
since: 2026-09-05
see: lamb
note: "journeys, design and seven phases written 5 Sep 2026 and every phase built the same day; phase 0 (the scaffold) closed by the first deploy to Cloudflare; phase 1 closed the same day: pi's storage and repo conformance suites pass in full in workerd, and pi's own SQLite repo runs in the cell with two small patches; phase 2 closed the same day: pi's four tools run over a workspace table and just-bash in the isolate, journey 4's steps each held by a test in workerd; phase 3 part-done the same day: the cell drives pi's harness, the alarm brings it back, journey 2's eviction test holds at every transition in workerd, and journey 2 walked in full on the deployed home, a turn evicted by a real `wrangler deploy` mid-flight and resumed by the alarm; phase 4 part-done the same day: pi's own client attaches to a cell over a WebSocket through `lamb`, journey 3 holds in workerd, journey 1 walked against a local home with the faux provider and then on the deployed home with a real model as far as one machine can take it, and an exported session opens in pi's Node backend; phase 5 built as git and withdrawn the same day (a twelve-verb facade over isomorphic-git; git is a program and moved to the second leg, pen), re-cut the same evening as the sheepdog's surface, and closed the same night: detach, status, wait, abort, log, and --json over lamb's own client of pi's protocol, journey 5 walked in full on the deployed home by a Claude Code session; phase 6 part-done on one local celld node, journeys 1 and 3 walked there through lamb and pi's client with state surviving a node restart; phase 7 closed, pi's full suite green with the four patches and a fresh pi from the registry running beside lamb. Journeys recast 5 Sep around agents as the actors: a sheepdog runs lamb, sheep are cells, a shepherd watches. celld and journey 6 withdrawn 5 Sep 2026, not yet mature. Journey 3 walked in full on the deployed home the night of 5 Sep, the shepherd's terminal beside the dog's stream: attach, a steered prompt, an abort by Escape, a close the dog did not notice, and a cell with its alarm clear. What waits on a person: a second machine and a night for journey 1. Nothing waits on work. The first leg of a longer walk — pi's harness in a Durable Object with a workspace in rows, an in-isolate shell, pi's own client attached over a WebSocket, and a second home, celld, tried and withdrawn. Execution tiers are pen; sub-agents as cells and multi-user are named as later legs. Frozen 6 Sep 2026 by recast: the command is `sheep`; journey 1's second machine and night are carried by recast's Open roster, not owed here."
---

# Lamb — the journeys

**Frozen 6 Sep 2026.** This leg is done. The command it calls `lamb`
throughout has been `sheep` since recast phase 1 ([recast](../recast/design.md)):
`node packages/cli/bin/sheep.js`, `~/.sheep/config`, `SHEEP_*`, and the
homes `sheep` and `sheep-pen`. Everything below is as it was built and as
it ran, and nothing below this line changes. Lamb's one unwalked step, a
second machine and a night for journey 1, is carried by recast's Open
roster, not owed here.

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**: a coding agent, Claude Code in this
repo or pi on a laptop, working on a goal a person gave it. The ones it
herds are **sheep**: pi sessions, each living in a cell with its own
workspace, given a task and left to it. `lamb` is how the dog herds. A
person does not run `lamb`. The dog does.

These journeys describe what it is like for a sheepdog to use pi when the
sessions it delegates to live in cells instead of on its own machine.
Each journey is an acceptance test: the work is done when a dog can walk
it against a real deployment and it behaves as written here.
[design.md](design.md) is the mechanism and [phases.md](phases.md) the
walk. If a journey and the mechanism disagree, the mechanism is what
changes.

The starting point is pi at `0.85.0`: a terminal coding agent with four
tools, a durable session tree, and an experimental split into a protocol,
a server, a session worker, and a client that renders and holds no agent
state. That split was cut for a server on the same machine. These journeys
need it to hold across a network, with the machine gone, and with a
program on the other end of the terminal instead of a person.

This is the first leg of a marathon, and the journeys are written to the
leg. A sheep with no machine under it, a task that outlives the cell, a
shepherd looking over the dog's shoulder, a sheep that says what it cannot
do, a dog with more than one sheep, the same flock on a fleet you own, and
nothing changed for pi on a laptop. A repository in and the work out was
journey 5 and moved to the second leg: `git` is a program, and programs
run in the tier that runs programs, [pen](../pen/journey.md). Execution
tiers, the dog itself as a cell, permission prompts answered from
anywhere, and who owns a sheep are the next legs, and the journeys name
the gap where they touch it.

Key terms:

- **Sheepdog**: the agent with the terminal. It runs `lamb`. Its own
  context ends when its session does; what survives is what it wrote
  down and what its sheep hold.
- **Sheep**: one session's home. A Durable Object holding the transcript,
  the workspace, the shell, and the harness that drives the loop. Also
  called a cell, when the mechanism is the subject.
- **Shepherd**: the person. Deploys the home, gives the dog the goal,
  reads the result, and sometimes opens a terminal on a sheep to watch.
- **Workspace**: the files a sheep reads and writes. Rows in the cell.
- **Shell**: what a sheep's `bash` runs. An interpreter in the cell's
  isolate, with no processes, no interpreters, and no network.
- **Home**: a deployment, on Cloudflare. `lamb --home`.

## What exists today, and what each journey adds

| Today | After these journeys |
| --- | --- |
| A pi session lives in a process on one machine, and dies with it. | A sheep lives in a cell, addressed by id, reachable from any dog on any machine. |
| A dog that delegates holds the child in its own context, and loses it when the context ends. | A dog hands a task to a sheep, goes away, and a later dog picks the sheep up by id. |
| The workspace is the dog's disk. | The workspace is rows in the cell, capped per file, with no machine under it. |
| `bash` spawns `/bin/bash`. | `bash` runs an interpreter in the cell that says plainly what it lacks, so the dog knows what to delegate. |
| Killing the process mid-turn leaves the session to be resumed by hand. | Evicting the cell mid-turn is followed by a wake and a resumption nobody asked for. |
| A dog talks to a session through a TUI meant for a person. | A dog prompts, polls, waits, aborts, and reads through `lamb`, non-interactively, and a shepherd can still open the TUI on the same sheep. |
| `git` is whatever the machine has. | `git` is not in the cell, and the shell says so in the sentence it says for `npm`. It arrives with pen, as a program. |
| pi runs where Node runs. | The same bundle runs on Cloudflare. (celld, a second home, was withdrawn 5 Sep 2026.) |

## Cast

- **The sheepdog** — a coding agent with a terminal and a goal. Runs
  `lamb`. Called "the dog" below.
- **A second dog** — another agent session, on the same machine hours
  later or on a different machine now. Knows nothing the first dog knew
  except what is in the repo and at the home.
- **The shepherd** — the person who deployed the home and gave the goal.
  Never runs `lamb`; may open a terminal on a sheep to watch or steer.
- **The sheep** — one session. Named by its id, and by the name the dog
  gave it, and by nothing else.

The journeys are ordered from the smallest claim outward: journeys 1 and 2
are one dog and one sheep, journey 3 is a shepherd watching, journey 4 is
what a sheep can and cannot do, journey 5 is a dog with a flock, journey 6
is a second home, and journey 7 verifies nothing changed for anyone who
never runs `lamb`.

## Journey 1: A sheep with no machine under it

The dog has a home configured. It wants to hand off a piece of work and
not carry it in its own context.

1. Run `lamb new --name scaffold -- "Create a small project: a README, a
   src/ directory with two files, and a note in each."` The first line of
   output is the sheep's id, on its own line, before anything streams.
   The reply streams, and `lamb` exits when the turn ends.
2. Run `lamb attach <id> -- "List the tree and grep for the word note."`
   The sheep's `bash` runs `find` and `grep`, and the output is right.
3. The dog's session ends. Hours later a second dog, working the same
   goal, runs `lamb ls`, finds `scaffold` by name, and runs `lamb attach
   <id> -- "Where were we?"` The sheep answers from its transcript, and
   the files are as they were left.
4. From a different machine, with nothing but the home's URL, its token,
   and the id, a third dog runs `lamb attach <id> -- "cat README.md"` and
   gets the file.
5. The shepherd runs `lamb export <id>`, opens the file with pi's Node
   SQLite backend, and reads what the sheep did, entry by entry.

Acceptance criteria:

- Step 1 mints the session at the home before the socket opens, and prints
  the id before anything else, so a dog that dies mid-stream still holds
  the handle. A session exists even if `lamb` never renders a token.
- Step 3 costs nothing in between. The cell is hibernated; no alarm is
  armed while the lane is idle. `lamb ls` shows the name the dog gave it.
- Step 4 needs nothing but the id and the home's token. No file was
  copied, no machine was named, and nothing the first dog knew was needed.
- Every message in the transcript is a pi entry with pi's shape. `lamb
  export <id>` writes the cell's SQLite file, and pi's Node SQLite backend
  opens it and lists the same entries.

## Journey 2: The task outlives the cell

The dog hands a sheep a multi-step change and moves on. While the sheep
is in the middle of it, the cell is evicted. Nothing the dog asked for
should be lost and nothing the sheep did should happen twice.

1. Run `lamb attach <id> -- "Rename the symbol across the three files,
   then summarize what changed."` The sheep begins: a `read`, an `edit`,
   another `edit`. The dog does not wait; `lamb` may have exited, or the
   dog may have moved to another sheep.
2. The shepherd evicts the cell between the second `edit` and the
   provider's next response. On Cloudflare this is a deploy of the same
   code; on a test rig it is a forced restart.
3. Within a few seconds, without anyone typing, the sheep continues: it
   reads the third file and finishes. A dog that was still attached sees
   a reconnecting notice and then the transcript, unchanged. A dog that
   was not attached sees nothing, and finds the finished turn when it
   looks.
4. The transcript shows what happened. If the eviction cut a provider
   stream, the interrupted assistant message is present with pi's
   interruption note, followed by the resumed turn. No `edit` appears
   twice, and the files show each edit once.

Acceptance criteria:

- Step 3 is driven by the cell's alarm, not by any client. A dog that
  never reconnects gets the same resumption; `lamb attach` an hour later
  shows the finished turn. This is what lets the dog not babysit.
- Step 4 is pi's own recovery: `AgentHarness.create` reports the open
  operation and `lane.resume` continues it. Lamb writes no recovery logic
  of its own.
- A tool whose outcome was durable before the eviction is not rerun. A
  tool that was mid-flight is settled per pi's tool-durability rules, and
  the transcript says which.
- The proof is repeatable: a test in workerd kills the cell at each
  transition of a scripted turn and asserts the final transcript and
  workspace are the same every time.

## Journey 3: The shepherd looks over the dog's shoulder

The dog is mid-task with a sheep. The shepherd wants to watch, then to
steer.

1. The dog is attached and a turn is streaming. The shepherd runs `lamb
   attach <id>` with no prompt and gets pi's interactive terminal on the
   same sheep. It renders the whole transcript so far, and then both the
   dog's stream and the shepherd's screen show the same tokens at the same
   time.
2. The shepherd types a prompt. pi takes it as pi takes a prompt typed
   mid-turn: Enter steers it into the running turn at the next tool
   boundary, Alt+Enter queues it behind the turn. The dog's next read of
   the transcript shows it as a user message, and the sheep's reply
   streams to both.
3. The shepherd presses the abort key. The turn stops for the dog too,
   and the dog's `lamb` reports the abort rather than an error.
4. The shepherd closes the terminal. The dog notices nothing.
5. The dog's `lamb` exits. The cell finishes the turn in progress and then
   hibernates.

Acceptance criteria:

- Each attachment is its own, and the cell's `Transcript` subscription is
  per attachment, so a slow terminal never stalls the dog.
- Step 2 is pi's own `steer` or `followUp` over the wire, unchanged
  from pi's experimental client, placed by pi's own lane rules. Lamb adds
  no message type.
- Step 5's hibernation keeps the socket count at zero and the alarm
  cleared. A wake from `lamb attach` rebuilds the router from the sockets
  it has and needs nothing from the terminal beyond the handshake.
- The transcript does not say whether the dog or the shepherd said a
  thing. That is a later leg's question, named below.

## Journey 4: A sheep that says what it cannot do

The dog delegates the way it would to a colleague, and the sheep treats
`bash` the way it treats bash. What matters is that when the sheep cannot
do a thing, it says so in a form the dog can act on.

1. Ask for a count of lines per file, sorted. The sheep runs `wc -l src/*
   | sort -n` and gets it.
2. Ask it to rewrite a word in every file. It runs `sed -i` in a `for`
   loop over a glob, and the files change.
3. Ask it to pretty-print a JSON file it wrote. It runs `jq .` and the
   output is right.
4. Ask it to run the tests. It runs `npm test`. The shell answers `bash:
   npm: command not found (this shell runs inside the session; no
   interpreters or package managers are installed)`. The sheep tells the
   dog it cannot run tests here and does not pretend it did. The dog
   reads that sentence and runs the tests itself, or hands them to pen.
5. Ask it, as a test, to `while true; do :; done`. The shell stops it at
   its own limit, the tool result says so, and the sheep stays responsive.
6. Ask it to write a two-megabyte file. `write` refuses with a message
   naming the per-file limit, and the sheep says so.

Acceptance criteria:

- The commands in steps 1 to 3 run in the cell's isolate against the same
  rows `read` and `write` use. No second filesystem, no sync.
- Step 4's sentence is the shell's, not the tool's, and the system prompt
  says the same thing once. A test checks both places carry the same
  words. The sentence is what the dog parses; it does not change between
  programs except for the program's name.
- Step 5 is just-bash's own bound, surfaced as a nonzero exit and pi's
  timeout code, and the cell's event loop is not blocked past the bound.
- Truncation, spill to `/tmp`, and the bash renderer's periodic updates
  behave as they do in pi against a real shell.

## Journey 5: A dog and its flock

The goal is bigger than one sheep. The dog splits it, hands each piece
to a sheep, and keeps working while they do.

1. Run `lamb new --name docs -- "…"`, `lamb new --name tests -- "…"`, and
   `lamb new --name types -- "…"` in one go, each with `--detach`. Each
   prints its id and returns at once. Three sheep are working.
2. Run `lamb ls`. Each line is one sheep: id, name, when it was made, and
   whether its lane is idle, running, or waiting. The output is one
   record per line and stable enough to parse.
3. Run `lamb status <id>` on a running sheep. It says what the sheep is
   doing now: the open operation, the last tool call, tokens so far.
4. Run `lamb attach <id> -- "…"` on a running sheep. The prompt is queued
   behind the running turn, `lamb` says so and exits, and the sheep takes
   it up when the turn ends. Or run it with `--wait` and `lamb` streams
   the queued turn when it starts.
5. Run `lamb wait <id> <id> <id>`. It returns when every named sheep is
   idle, with each one's last assistant message, so the dog reads three
   results in one call.
6. One sheep is going wrong. Run `lamb abort <id>`. The turn stops, the
   transcript says it was aborted, and the sheep is idle for the next
   prompt.
7. Run `lamb log <id>`. The transcript prints as text, oldest first, one
   entry per block, with the tool calls and their results. `--since` and
   `--last` cut it down. `lamb export` is still the file for a program
   that wants the rows.

Acceptance criteria:

- Every command here is non-interactive and exits. None needs a
  terminal. Every one has a `--json` form whose shape is pi's: entries
  are pi entries, lane state is pi's lane snapshot.
- Step 1's `--detach` mints and prompts and returns before the first
  token. The sheep runs whether or not any client is attached, which is
  journey 2's claim used on purpose.
- Step 4 is pi's queue, not a refusal. Today a prompt to a busy lane
  answers `Lane "main" already has an active operation`; after this
  journey it queues, and the dog is told it did.
- Step 5 does not poll the sheep awake. It waits on the cell's own
  notification of the lane going idle, and a hibernated sheep stays
  hibernated.
- Nothing here is a new message type on pi's protocol. It is pi's
  `AgentController`, `Transcript`, and lane snapshot, read by a program
  instead of drawn by a TUI.

## Journey 6: The same flock on a fleet you own

**Withdrawn 5 Sep 2026**, with celld: the shepherd judged it not yet
mature, after pen phase 6 found it dropping the work a socket wakes. The
journey stays as written, the record of what was wanted of a second
home; lamb phase 6 holds what one local node did and did not do.

The shepherd runs celld on two nodes with a bucket, and wants the same
sheep there.

1. From the same `packages/cell` directory, run `celld deploy` against the
   fleet. It accepts the Wrangler project.
2. Run `lamb --home https://<fleet> new`. Journey 1 walks as written.
3. Stop the node that owns the cell mid-turn. Journey 2 walks as written:
   the cell wakes on the other node and finishes.
4. Run `lamb --home https://<fleet> attach <id>` from a second dog's
   machine. Journeys 3 and 5 walk as written.

Acceptance criteria:

- No code path branches on the platform. One bundle, two homes, and the
  differences are configuration: the secrets and the URL.
- Step 3 is the claim celld makes about itself, measured: the transcript
  and workspace after failover are what they were before it.
- Anything that does not hold is a finding with the celld behaviour named,
  and the design decides whether it is lamb's to work around.

## Journey 7: Nothing changed for pi

A person who uses pi on a laptop and never runs `lamb`.

1. Install pi from npm. Run it. Everything works as it did.
2. Run pi's own test suites at the pinned commit with lamb's patches
   applied. They pass.
3. Open the SQLite file from journey 1's `lamb export` with pi's Node
   SQLite backend. It lists the session's entries and reads the transcript.
4. Look for lamb in pi's repository. It is not there. Lamb depends on pi;
   pi does not know about lamb.

Acceptance criteria:

- Lamb carries its changes to pi as a short branch on a fork, each commit
  named in phases.md with its upstream status. The list is short and every
  entry is one that pi could take without knowing why.
- No file in pi is forked. A version bump of the pinned commit is a
  rebase of the branch, and the phases record how long it took.
- pi's storage and repo conformance suites pass against lamb's adapter in
  workerd, and against the Node backend unchanged.

## What the journeys force

Named here so the design has a list to answer, not to decide them.

- **A `SqliteDatabase` over the cell's SQL.** Journey 1 step 5 and journey
  7 step 3 need the transcript in pi's own schema, which means pi's own
  SQLite backend over an adapter, not a new backend.
- **One filesystem with two faces.** Journey 4 needs `read`, `write`, and
  `bash` to see the same rows. One table, two interfaces over it.
- **The alarm as the heartbeat of an open operation.** Journey 2 step 3
  says the client is not what resumes the turn, and journey 3 step 5 says
  an idle cell costs nothing. Both follow from arming the alarm only while
  an operation is open. Journey 5 leans on it: a dog that detaches is
  trusting the alarm.
- **A WebSocket transport on both sides of pi's protocol.** Journeys 1, 3,
  5, and 6 attach from anywhere; journey 3 needs multiple attachments,
  which the protocol has and a new wire would have to reinvent.
- **A surface for a program, not a person.** Journey 5. The id first and
  alone, one record per line, `--json` everywhere, exits that mean
  something, a queue instead of a refusal, and a wait that does not poll.
  All of it read from pi's protocol, none of it added to it.
- **A refusal the dog can act on.** Journey 4 steps 4 and 6, and `git`
  with them. Every missing capability is a sentence that names the reason
  and is the same sentence in the system prompt, and the same sentence
  from program to program.
- **A patch set, not a fork.** Journey 7. Every change to pi is named,
  small, and upstreamable.

## Open questions

Written down so they are decided on purpose, mostly by later legs.

- **Who is a sheep's owner, and who may attach?** One token per home is
  this leg's answer. The next leg that touches it needs a principal and a
  grant, and pi's protocol notes that peer authentication is application
  policy. A dog is a principal too.
- **Which principal said what?** Journey 3 shows the dog's and the
  shepherd's prompts as indistinguishable user messages. Pi's entries have
  room for source metadata; whether to write it, and how to render it, is
  undecided.
- **The dog as a sheep.** A dog that lives in a cell, herding sheep that
  live in cells, is sub-agents as cells, and the reason the herding
  surface must be a program's. Not this leg.
- **What happens to `/tmp` and to spilled output** across hibernation?
  This leg truncates `/tmp` when the lane idles. A spilled tool output a
  dog wants to open later is lost. Probably fine; named so it is not a
  surprise.
- **Where do large files go?** The per-file cap is a placeholder for an
  object store behind the same table. The shape is designed; the leg does
  not build it.
- **What does a sheep get told about the shell, exactly?** The design
  says one sentence in the system prompt and the same sentence at the
  refusal. Whether that is enough for a cheaper model is a measurement,
  and the evals project that would measure it does not exist yet.
- **Extensions.** Pi's classic extensions run in the pi process with full
  access; its facet system is the sandboxed successor and is partly
  specified. Neither runs in a cell in this leg. Skills and prompt
  templates are files and would ride the workspace when someone asks.
