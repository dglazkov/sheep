---
status: partial
since: 2026-09-05
see: pen
note: "journeys, design and phases written 5 Sep 2026, the day lamb's git facade was withdrawn, and recast the same evening around agents as the actors: a sheepdog delegates to sheep, and a sheep rents a machine for the length of a command. Pen phase 0, the scaffold, built 5 Sep: the hash column and manifest on the workspace table, the protocol file, the agent that answers ping, a fake container that is the agent over a socket pair in workerd, and the image. Pen phase 1, the checkout, built the same day: the sync in both directions by hash over binary blobs, the cache rule in the agent, and a kill walk in workerd that finds the rows whole at every one of 246 points; journey 3's atomicity claim holds against the fake. Pen phase 2, the router and the sentence, built the same day: the table in one file generating the routing decision, the refusal, and the prompt paragraph; Shell.exec routing a line whole to just-bash or to the container, output streamed as pi's bash updates, a socket close settled as an honest interruption; journey 6 holds byte for byte and journey 1 steps 1 to 4 hold against the fake. Pen phase 3, a real machine, built the same day and walked on a local rig, wrangler dev with Docker and a real model: journeys 1 and 3 as written, a container rented in 1.2 s, gone after the idle period, killed mid-run and reported honestly. Pen phase 4, the repository and the broker, built the same night: real git in the image with a credential helper over a Unix socket, the broker in the cell handing the home's token over once per push, journey 2 held with real git in Node and through the fake in workerd. Pen phase 5, the fresh isolate, built the same night: node <file> in a dynamic worker over the workspace as read-only modules, fetch refused with a sentence, proved in workerd through the real loader; it did not slip. The shepherd enabled the Workers Paid plan that evening; the deployed walks of phases 3 and 5 are next, phase 4's waits on a fine-grained token. Journey 2 is lamb's withdrawn git journey, a repository in and the work out, now over real git in a container. Journeys 1 and 3 use lamb phase 5's surface (detach, wait, log), which closed on 5 Sep; pen's first real walk waits only on the Workers Paid plan."
---

# Pen — the journeys

Sheep is a repository for coding agents that herd coding agents. The
**sheepdog** has the terminal and runs `lamb`; the **sheep** are pi
sessions in cells, each given a task; the **shepherd** is the person who
deployed the home and gave the goal. Lamb
([../lamb/journey.md](../lamb/journey.md)) put the sheep in cells with a
workspace in rows and a shell in the isolate, and that shell says plainly
what it lacks: interpreters, package managers, and `git`. Pen is where
those sentences stop being true, so that a dog can delegate work that
needs a machine and not do it itself.

Each journey is an acceptance test: the work is done when a dog can walk
it against a real deployment and it behaves as written here.
[design.md](design.md) is the mechanism and [phases.md](phases.md) the
walk. If a journey and the mechanism disagree, the mechanism is what
changes.

The starting point is lamb with its phase 5 done: the four tools over the
workspace table, just-bash over the same rows, `Shell.exec` as the one
place a command enters, a refusal in one sentence for everything the
isolate cannot do, and `lamb` as the dog's surface with `--detach`,
`wait`, and `log`, which the journeys below use. The premise of this leg is
that a sheep should not become a machine. It should rent one, for the
length of a command, and keep only what the command changed.

Key terms, in addition to lamb's:

- **Tier 0**: the shell in the isolate. just-bash, the text tools, the
  workspace rows. Lamb built it; pen does not change it.
- **Tier 2**: a container. A real filesystem, a real process, `node`,
  `pnpm`, `python`, `git`. Rented by a sheep on first use, discarded when
  idle. Its disk is a cache of the rows, never the truth.
- **Tier 1**: a fresh isolate for code a sheep wrote. Named, designed,
  and allowed to slip out of the leg, because the container makes it
  optional.
- **Checkout**: the container's copy of the workspace, synced in by
  content hash and the diff synced back out.
- **Helper**: the process in the container that a program asks for a
  credential. It asks the cell, the cell asks the home, and the program
  gets a short-lived answer. The sheep gets nothing, and neither does the
  dog.

## What exists today, and what each journey adds

| Today | After these journeys |
| --- | --- |
| A sheep asked to `pnpm install` answers `command not found (this shell runs inside the session…)`, and the dog does it itself. | The sheep runs `pnpm install` in a container it rented, and `node_modules` stays there. |
| A sheep's script cannot run. | `node script.js` runs in a fresh isolate over the workspace and its output is the tool result; a script that writes files runs in the container, and those come back to the rows. |
| `git` is not in the cell. | The sheep runs `git clone`, `commit`, and `push` as real git, over a checkout, with a credential neither it nor the dog ever sees. |
| A command is a tier-0 command or a refusal. | A command is routed: tier 0 if the shell has it, tier 2 if a container is provisioned, a refusal that says which, otherwise. |
| A sheep's cost is its rows. | A sheep's cost is its rows plus a container while one is running, and nothing while it is not. |
| Nothing native runs on celld. | The same routing runs on a celld node with a container runtime beside it. |

## Cast

- **The sheepdog** — a coding agent with a terminal and a goal. Runs
  `lamb`, delegates to sheep, checks their work. Called "the dog" below.
- **The sheep** — one session, given a task that needs a machine.
- **The shepherd** — the person who deployed the home and pays for the
  container minutes. Kills things, when a journey needs a hand.
- **The container** — a machine rented by a sheep. Named by nothing,
  because it has no identity worth keeping.

The journeys are ordered from the smallest claim outward: journey 1 is
one command in a container, journey 2 is a repository, journey 3 is the
container dying, journey 4 is a sheep's own code, journey 5 is celld, and
journey 6 verifies nothing changed for lamb.

## Journey 1: A command that needs a machine

The dog has had a sheep build a project in its workspace over a few
turns. Now the dog wants the tests run, and would rather not pull the
files down and run them itself.

1. Run `lamb attach <id> -- "Install the dependencies and run the
   tests."` The sheep runs `pnpm install`. The tool result streams pnpm's
   output as pnpm prints it, and ends with the exit code.
2. The sheep runs `pnpm test`. The tests run. Output streams; the sheep
   reports which passed.
3. Run `lamb attach <id> -- "List the workspace, then list what was
   installed."` `find . -maxdepth 1` in tier 0 shows the project files
   and no `node_modules`. `pnpm ls --depth 0` runs in the container and
   lists what is installed there.
4. Run `lamb attach <id> -- "What can your shell run now?"` The sheep
   answers from its system prompt, and the sentence has changed: it names
   the container and what runs there.
5. An hour later, a second dog asks for the tests again. The first
   command takes longer, because the container is new and `node_modules`
   is gone. The tests run the same.

Acceptance criteria:

- Steps 1 and 2 are `Shell.exec` routing the command to tier 2. Pi's
  bash tool did not change; the renderer sees a normal bash result with
  periodic updates, and so does `lamb log`.
- Step 3 shows the rule: files the command wrote under the checkout sync
  back to the rows, except paths the design names as cache
  (`node_modules`, build output, anything in `.gitignore`). Those live in
  the container and die with it.
- Step 4's sentence is in one place, and a test checks that the shell's
  refusal, the system prompt, and the routing table agree. It is the
  sentence the dog parses to decide what to delegate.
- Step 5 costs nothing during the hour. The container was discarded when
  the lane idled, and the rows are what came back.

## Journey 2: A repository in, the work out

Lamb's withdrawn git journey, over real git. The record of what was
built and why it went is at the end of lamb phase 5 in
[../lamb/phases.md](../lamb/phases.md). The dog wants a change made to a
real repository and a branch it can point the shepherd at, without
cloning anything itself.

1. Run `lamb new --name typo-fix -- "Clone https://github.com/<org>/<repo>
   and describe its layout."` The sheep runs `git clone`, then `find` and
   `cat`, and describes it.
2. Run `lamb attach <id> -- "Fix the typo across the docs, on a new
   branch, and show me the diff."` The sheep runs `git checkout -b`,
   edits with `edit`, runs `git status` and `git diff`, and shows the
   diff.
3. Run `lamb attach <id> -- "Commit and push."` The sheep runs `git add`,
   `git commit -m`, and `git push -u origin <branch>`. The push succeeds.
4. The dog runs `gh pr create` from its own terminal against the branch,
   or tells the shepherd the branch name. The commit is authored as the
   home is configured to author.
5. Ask the sheep to `git rebase -i`. Real git says what real git says
   about an interactive rebase with no terminal, and the sheep says so.

Acceptance criteria:

- The credential that authorized step 3 was minted by the home for that
  push, handed to git by the helper, and appears in no transcript entry,
  no tool result, no file in the checkout or the rows, no environment
  variable any command can print, and nothing `lamb log` shows the dog.
  `env`, `git config --list`, and `cat ~/.git-credentials` in the
  container show nothing.
- Step 2's `edit` is pi's edit tool writing a row, and step 2's `git
  diff` is real git reading the checkout. The sync between them is by
  hash, in both directions, and a test proves an edit made by the tool is
  what git diffs.
- The `.git` directory is part of the checkout that syncs back, so a
  clone survives the container and a fresh container can `git status`
  without cloning again. Objects over the per-file cap are the design's
  problem to name, not the journey's.
- The identity of the author is the home's configuration. A GitHub App
  that authors as itself is named in the open questions and is not this
  leg.

## Journey 3: The container dies

The dog asks a sheep for a long test run and the container is lost in
the middle.

1. Run `lamb attach <id> --detach -- "Run the full test suite."` The
   sheep runs `pnpm test`. It takes a minute.
2. The shepherd kills the container. On Cloudflare this is the container
   instance ending; on a test rig it is a forced stop.
3. The tool result ends with a clear statement that the command was
   interrupted by the container going away, with the output up to that
   point and no exit code claimed. The sheep says so in its reply and
   stops. `lamb wait <id>` returns with that reply.
4. The dog reads it and runs `lamb attach <id> -- "Run them again."` A
   new container is rented, the checkout is synced from the rows, and the
   tests run.
5. `find` in tier 0 shows the workspace exactly as the rows had it before
   step 1, plus whatever the interrupted command synced back before it
   died, and nothing half-written.

Acceptance criteria:

- Step 3 is honest in pi's terms: the tool result is an error result with
  the partial output, and pi's tool-durability rules settle it as an
  effect of unknown outcome, which the transcript says. The dog is never
  told a fake exit code.
- Step 5 is the sync's atomicity claim: a file syncs back whole or not at
  all, and the rows are never a mix of before and after for one file.
- The proof is repeatable: a test in workerd against a fake container
  kills it at each stage of a scripted command and asserts the rows and
  the transcript are the same every time.
- The cell itself is not evicted in this journey. Lamb's journey 2 covers
  that; the two together are covered by one more test that does both.

## Journey 4: A sheep's own code

The dog asks for a computation and the sheep writes a script.

1. Run `lamb attach <id> -- "Compute <something> from the workspace
   files."` A pipeline of text tools would do it badly, so the sheep
   writes `compute.mjs` and runs `node compute.mjs`.
2. The script runs in tier 1, a fresh isolate: it can read the workspace,
   it cannot reach the network, and it cannot see the container or the
   home's secrets. Its stdout is the tool result.
3. Ask the sheep to fetch a URL from the script. The script's `fetch` is
   refused with a sentence that names tier 1 and what it lacks, and the
   sheep runs it in tier 2 instead, where `fetch` works.

Acceptance criteria:

- Tier 1 is a Worker Loader isolate with the workspace as a binding and
  no other bindings. A test asserts the isolate cannot `fetch` and cannot
  read the cell's environment.
- The routing decision, tier 1 or tier 2 for `node`, is the design's
  rule, stated once and tested. Tier 2 is the default when a container is
  up; tier 1 is the default when none is and the program is `node`.
- This journey is pen phase 5 and is allowed to slip out of the leg.
  Everything else stands without it.

## Journey 5: The same pen on celld

The shepherd runs celld with a container runtime on the node.

1. Journey 1 walks as written against `lamb --home https://<fleet>`.
2. Journey 2 walks as written.
3. Journey 3 walks as written, with `docker kill` as the shepherd's hand.

Acceptance criteria:

- No code path branches on the platform. The container protocol is the
  same; what differs is who starts the container, and that is
  configuration.
- What celld cannot do is a finding with celld's behaviour named, and the
  design decides whether it is pen's to work around.

## Journey 6: Nothing changed for lamb

A dog with a lamb home whose shepherd never provisioned a container.

1. Every lamb journey walks as before. The sheep refuse `npm` and `git`
   with lamb's sentence, unchanged, and the dog delegates accordingly.
2. Lamb's suite is green with pen's code present and no container
   configured.
3. The system prompt says what lamb's said, because no tier 2 exists for
   this home.

Acceptance criteria:

- A home without a container binding is lamb, byte for byte in behaviour.
  The routing table's tier-2 column is empty and the refusal is the same
  sentence.
- Pen adds no pi tool, no pi patch, and no `lamb` command. `Shell.exec` is
  the whole seam.

## What the journeys force

- **A container protocol the cell speaks.** Journeys 1, 3, and 5. One
  small protocol over an authenticated channel: sync in, run, stream,
  sync out. The container is a client of the cell, never the reverse.
- **A checkout synced by hash, both ways, per file, atomically.**
  Journeys 1, 2, and 3. A manifest of paths and hashes, blobs fetched by
  hash, and a diff written back whole.
- **A routing table in one place.** Journeys 1, 4, and 6. Which program
  runs where, and the sentence for each refusal, generated from the same
  table the system prompt reads, so a sheep's answer to "what can you
  run" is something a dog can parse.
- **A credential helper, and a home that mints.** Journey 2. Short-lived,
  scoped, per operation, never in the container's environment, never in
  anything the dog reads.
- **A cache rule.** Journey 1 step 3. What syncs back and what does not,
  and `.gitignore` as the sheep's way to say so.
- **An honest interruption.** Journey 3. A tool result that says the
  machine went away, settled by pi's rules, not a fake exit code, so a
  dog reading `lamb wait` knows to ask again.

## Open questions

- **Who pays, and how much before the cell says no?** Container minutes
  are money. A per-home budget and a sentence when it is spent is this
  leg's answer; a per-principal one is Identity's, and a dog is a
  principal.
- **A GitHub App that authors as itself.** Journey 2 step 4 authors as
  the home. An installation token from an app the shepherd installed is
  the real client and belongs with Identity.
- **Large objects.** A `node_modules` never syncs; a `.git` with a big
  packfile does. Lamb's per-file cap stands in for an object store, and
  pen is the leg that will hit it first.
- **Which tier for which program**, beyond `node`. Python in a fresh
  isolate is Pyodide, which is a different thing than Python. The table
  starts small and grows by finding.
- **Looking at the cache.** A line of text tools runs in tier 0, so `cat
  dist/index.js` reads the rows and finds nothing; what the cache rule
  keeps in the container is reachable only through a program the
  container has. Whether a sheep needs a way to say "this line, in the
  container" is a finding for pen phase 3.
- **A dog in a cell.** A sheepdog that is itself a sheep, renting a
  container for its own work and herding sheep that rent theirs. Not
  this leg; the reason the herding surface is a program's.
