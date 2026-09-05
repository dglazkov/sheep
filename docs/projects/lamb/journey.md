---
status: designed
since: 2026-09-05
see: lamb
note: journeys, design and seven phases written 5 Sep 2026; phase 0 (the scaffold) part-done the same day with its deploy half waiting on a Cloudflare token; phase 1 closed the same day: pi's storage and repo conformance suites pass in full in workerd, and pi's own SQLite repo runs in the cell with two small patches; phase 2 closed the same day: pi's four tools run over a workspace table and just-bash in the isolate, journey 4's steps each held by a test in workerd; phase 3 part-done the same day: the cell drives pi's harness, the alarm brings it back, and journey 2's eviction test holds at every transition in workerd, with the real-model walk on a deployed home waiting on secrets; phase 4 part-done the same day: pi's own client attaches to a cell over a WebSocket through `lamb`, journey 3 holds in workerd, journey 1 walked against a local home with the faux provider, and an exported session opens in pi's Node backend. The first leg of a longer walk — pi's harness in a Durable Object with a workspace in rows, an in-isolate shell, pi's own client attached over a WebSocket, and the same bundle on celld. Execution tiers, sub-agents as cells, and multi-user are named as later legs and not addressed here.
---

# Lamb — the journeys

These journeys describe what it is like to use pi when the session lives in
a cell instead of on a laptop. Each journey is an acceptance test: the work
is done when you can walk it against a real deployment and it behaves as
written here. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism disagree,
the mechanism is what changes.

The starting point is pi at `0.85.0`: a terminal coding agent with four
tools, a durable session tree, and an experimental split into a protocol,
a server, a session worker, and a client that renders and holds no agent
state. That split was cut for a server on the same machine. These journeys
need it to hold across a network, with the machine gone.

This is the first leg of a marathon, and the journeys are written to the
leg. A session with no machine under it, a turn that outlives the cell,
two terminals on one session, a shell that knows what it is, a repository
in and the work out, the same thing on a fleet you own, and nothing changed
for pi on a laptop. Execution tiers, sub-agents, permission prompts
answered from a phone, and who owns a session are the next legs, and the
journeys name the gap where they touch it.

Key terms:

- **Cell**: one session's home. A Durable Object holding the transcript,
  the workspace, the shell, and the harness that drives the loop.
- **Workspace**: the files the agent reads and writes. Rows in the cell.
- **Shell**: what `bash` runs. An interpreter in the cell's isolate, with
  no processes, no interpreters, and no network.
- **Presentation**: a terminal attached to a cell. Renders, holds nothing.
- **Home**: a deployment, on Cloudflare or on celld. `lamb --home`.

## What exists today, and what each journey adds

| Today | After these journeys |
| --- | --- |
| A pi session lives in a process on one machine. | A session lives in a cell, addressed by id, reachable from any terminal. |
| The workspace is the laptop's disk. | The workspace is rows in the cell, capped per file, with no machine under it. |
| `bash` spawns `/bin/bash`. | `bash` runs an interpreter in the cell that says plainly what it lacks. |
| Killing the process mid-turn leaves the session to be resumed by hand. | Evicting the cell mid-turn is followed by a wake and a resumption nobody asked for. |
| `pi client` attaches over a Unix socket or the Radius relay. | `lamb` attaches over a WebSocket, and two terminals attach to one cell. |
| `git` is whatever the laptop has. | `git` is a command in the shell, over the workspace, with credentials the model never sees. |
| pi runs where Node runs. | The same bundle runs on Cloudflare and on a celld fleet. |

## Cast

- **Nadia** — uses pi every day on her laptop and has opinions about it.
  Wants the same pi without the laptop.
- **Theo** — Nadia's teammate, on a different machine and a different
  operating system.
- **The operator** — whoever deployed the home. In this leg, Nadia.
- **The cell** — one session. Named by its id, and not by anything else.

The journeys are ordered from the smallest claim outward: journeys 1 and 2
are one terminal and one cell, journey 3 is two terminals, journeys 4 and
5 are what the shell can do, journey 6 is a second home, and journey 7
verifies nothing changed for anyone who never runs `lamb`.

## Journey 1: A session with no machine under it

Nadia has a home deployed. She wants a pi session she can leave and come
back to from anywhere.

1. Run `lamb new --name scratch`. The terminal shows pi's interactive
   screen: the same editor, the same transcript, the same footer with the
   model name and token counts. The footer's working directory reads
   `/workspace`.
2. Ask the agent to create a small project: a README, a `src/` directory
   with two files, and a note in each. The agent uses `write` and `bash`;
   the tool renderers look as they do in pi.
3. Ask it to list the tree and grep for a word. `bash` runs `find` and
   `grep`, and the output is right.
4. Close the laptop lid. Open it the next morning. Run `lamb -c`. The
   transcript is intact from the first message, the files are as they were
   left, and the next prompt continues the conversation.
5. From Theo's machine, run `lamb attach <id>` with the id from `lamb ls`.
   The same session opens, files and all.

Acceptance criteria:

- Step 1 mints the session at the home before the socket opens, so a
  session exists even if the terminal dies before rendering.
- Step 4 costs nothing while the laptop is closed. The cell is hibernated;
  no alarm is armed while the lane is idle.
- Step 5 needs nothing but the id and the home's token. No file was copied,
  no machine was named.
- Every message in the transcript is a pi entry with pi's shape. `lamb
  export <id>` writes the cell's SQLite file, and pi's Node SQLite backend
  opens it and lists the same entries.

## Journey 2: The turn outlives the cell

Nadia asks for a multi-step change and, while the agent is in the middle
of it, the cell is evicted. Nothing she did should be lost and nothing the
agent did should happen twice.

1. Ask the agent to rename a symbol across the three files and then
   summarize what changed. It begins: a `read`, an `edit`, another `edit`.
2. The operator evicts the cell between the second `edit` and the
   provider's next response. On Cloudflare this is a deploy of the same
   code; on a test rig it is a forced restart.
3. Nadia's terminal shows a reconnecting notice and then the transcript,
   unchanged. Within a few seconds, without anyone typing, the agent
   continues: it reads the third file and finishes.
4. The transcript shows what happened. If the eviction cut a provider
   stream, the interrupted assistant message is present with pi's
   interruption note, followed by the resumed turn. No `edit` appears
   twice, and the files show each edit once.

Acceptance criteria:

- Step 3 is driven by the cell's alarm, not by the reconnecting client. A
  client that never reconnects gets the same resumption; `lamb attach` an
  hour later shows the finished turn.
- Step 4 is pi's own recovery: `AgentHarness.create` reports the open
  operation and `lane.resume` continues it. Lamb writes no recovery logic
  of its own.
- A tool whose outcome was durable before the eviction is not rerun. A
  tool that was mid-flight is settled per pi's tool-durability rules, and
  the transcript says which.
- The proof is repeatable: a test in workerd kills the cell at each
  transition of a scripted turn and asserts the final transcript and
  workspace are the same every time.

## Journey 3: Two terminals on one session

Nadia is mid-conversation. Theo wants to watch, then to steer.

1. Nadia is attached. Theo runs `lamb attach <id>`. Theo's terminal renders
   the whole transcript so far and then, as Nadia's next turn streams,
   both terminals show the same tokens at the same time.
2. Theo types a prompt. Nadia sees it appear in her transcript as a user
   message, and the agent's reply streams to both.
3. Theo presses the abort key. The turn stops in both terminals.
4. Theo closes the terminal. Nadia notices nothing.
5. Nadia closes hers. The cell finishes the turn in progress and then
   hibernates.

Acceptance criteria:

- Each terminal holds its own attachment, and the cell's `Transcript`
  subscription is per attachment, so a slow terminal never stalls a fast
  one.
- Step 2 is `AgentController.prompt` over the wire, unchanged from pi's
  experimental client. Lamb adds no message type.
- Step 5's hibernation keeps the socket count at zero and the alarm
  cleared. A wake from `lamb attach` rebuilds the router from the sockets
  it has and needs nothing from the terminal beyond the handshake.
- The transcript does not say which terminal a prompt came from. That is a
  later leg's question, named below.

## Journey 4: A shell that knows what it is

Nadia treats the agent the way she treats pi, and the agent treats `bash`
the way it treats bash.

1. Ask for a count of lines per file, sorted. The agent runs `wc -l src/*
   | sort -n` and gets it.
2. Ask it to rewrite a word in every file. It runs `sed -i` in a `for`
   loop over a glob, and the files change.
3. Ask it to pretty-print a JSON file it wrote. It runs `jq .` and the
   output is right.
4. Ask it to run the tests. It runs `npm test`. The shell answers `bash:
   npm: command not found (this shell runs inside the session; no
   interpreters or package managers are installed)`. The agent tells Nadia
   it cannot run tests here and does not pretend it did.
5. Ask it, as a test, to `while true; do :; done`. The shell stops it at
   its own limit, the tool result says so, and the terminal stays
   responsive.
6. Ask it to write a two-megabyte file. `write` refuses with a message
   naming the per-file limit, and the agent says so.

Acceptance criteria:

- The commands in steps 1 to 3 run in the cell's isolate against the same
  rows `read` and `write` use. No second filesystem, no sync.
- Step 4's sentence is the shell's, not the tool's, and the system prompt
  says the same thing once. A test checks both places carry the same
  words.
- Step 5 is just-bash's own bound, surfaced as a nonzero exit and pi's
  timeout code, and the cell's event loop is not blocked past the bound.
- Truncation, spill to `/tmp`, and the bash renderer's periodic updates
  behave as they do in pi against a real shell.

## Journey 5: A repository in, the work out

Nadia wants the agent to make a change to a real repository and open a
pull request, with nothing on her laptop.

1. Ask the agent to clone `https://github.com/<org>/<repo>` and describe
   its layout. It runs `git clone`, then `find` and `cat`, and describes
   it.
2. Ask it for a change: fix a typo across the docs, on a new branch. It
   runs `git checkout -b`, edits, runs `git status` and `git diff`, and
   shows the diff.
3. Ask it to commit and push. It runs `git add`, `git commit -m`, and `git
   push -u origin <branch>`. The push succeeds.
4. Nadia opens GitHub and finds the branch, with the commit authored as
   the home is configured to author, and opens the pull request herself.
5. Ask it to `git rebase -i`. The shell says `git: rebase is not available
   in this shell` and the agent says so.

Acceptance criteria:

- The token that authorized step 3 is a secret on the home. It appears in
  no transcript entry, no tool result, no file in the workspace, and no
  environment variable the shell exposes.
- The clone in step 1 fits the per-file cap, or the tool result names the
  file that did not and the clone is refused whole. No partial clone.
- `git status`, `git diff`, and `git log` print in git's shape closely
  enough that the agent reads them without comment.
- The pushed commit is bit-identical to what isomorphic-git wrote, and a
  laptop `git fetch` of the branch shows the same tree.

## Journey 6: The same lamb on a fleet you own

The operator runs celld on two nodes with a bucket, and wants the same
sessions there.

1. From the same `packages/cell` directory, run `celld deploy` against the
   fleet. It accepts the Wrangler project.
2. Run `lamb --home https://<fleet> new`. Journey 1 walks as written.
3. Stop the node that owns the cell mid-turn. Journey 2 walks as written:
   the cell wakes on the other node and finishes.
4. Run `lamb --home https://<fleet> attach <id>` from Theo's machine.
   Journey 3 walks as written.

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

- Lamb carries its patches against pi as diffs in `vendor/pi`, each named
  in phases.md with its upstream status. The list is short and every entry
  is one that pi could take without knowing why.
- No file in pi is forked. A version bump of the pinned commit is a
  rebase of the patch set, and the phases record how long it took.
- pi's storage and repo conformance suites pass against lamb's adapter in
  workerd, and against the Node backend unchanged.

## What the journeys force

Named here so the design has a list to answer, not to decide them.

- **A `SqliteDatabase` over the cell's SQL.** Journey 1 step 4 and journey
  7 step 3 need the transcript in pi's own schema, which means pi's own
  SQLite backend over an adapter, not a new backend.
- **One filesystem with two faces.** Journey 4 needs `read`, `write`, and
  `bash` to see the same rows; journey 5 needs isomorphic-git to see them
  too. One table, three interfaces over it.
- **The alarm as the heartbeat of an open operation.** Journey 2 step 3
  says the client is not what resumes the turn, and journey 3 step 5 says
  an idle cell costs nothing. Both follow from arming the alarm only while
  an operation is open.
- **A WebSocket transport on both sides of pi's protocol.** Journeys 1, 3,
  and 6 attach from anywhere; journey 3 needs multiple attachments, which
  the protocol has and a new wire would have to reinvent.
- **A refusal the model can act on.** Journey 4 steps 4 and 6, journey 5
  step 5. Every missing capability is a sentence that names the reason and
  is the same sentence in the system prompt.
- **Secrets at the home, never in the session.** Journey 5 step 3. The
  model does the push; the model never holds the token.
- **A patch set, not a fork.** Journey 7. Every change to pi is named,
  small, and upstreamable.

## Open questions

Written down so they are decided on purpose, mostly by later legs.

- **Who is a session's owner, and who may attach?** One token per home is
  this leg's answer. The next leg that touches it needs a person and a
  grant, and pi's protocol notes that peer authentication is application
  policy.
- **Which terminal said what?** Journey 3 shows two people's prompts as
  indistinguishable user messages. Pi's entries have room for source
  metadata; whether to write it, and how to render it, is undecided.
- **What happens to `/tmp` and to spilled output** across hibernation?
  This leg truncates `/tmp` when the lane idles. A spilled tool output the
  terminal wants to open later is lost. Probably fine; named so it is not
  a surprise.
- **Where do large files go?** The per-file cap is a placeholder for an
  object store behind the same table. The shape is designed; the leg does
  not build it.
- **What does the model get told about the shell, exactly?** The design
  says one sentence in the system prompt and the same sentence at the
  refusal. Whether that is enough for a cheaper model is a measurement,
  and the evals project that would measure it does not exist yet.
- **Extensions.** Pi's classic extensions run in the pi process with full
  access; its facet system is the sandboxed successor and is partly
  specified. Neither runs in a cell in this leg. Skills and prompt
  templates are files and would ride the workspace when someone asks.
