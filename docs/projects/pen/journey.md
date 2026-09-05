---
status: planned
since: 2026-09-05
see: pen
note: "journeys, design and phases written 5 Sep 2026, the day lamb's git facade was withdrawn. Nothing built. The second leg: programs running for a cell. Lamb rented the durable half of a harness; pen rents the machine half, per command, and hands the results back to the rows. Journey 2 is lamb's withdrawn journey 5, a repository in and the work out, now over real git in a container."
---

# Pen — the journeys

These journeys describe what it is like to ask a cell to run a program.
Lamb ([../lamb/journey.md](../lamb/journey.md)) put pi's session in a
cell with a workspace in rows and a shell in the isolate, and that shell
says plainly what it lacks: interpreters, package managers, and `git`.
Pen is where those sentences stop being true. Each journey is an
acceptance test: the work is done when you can walk it against a real
deployment and it behaves as written here. [design.md](design.md) is the
mechanism and [phases.md](phases.md) the walk. If a journey and the
mechanism disagree, the mechanism is what changes.

The starting point is lamb as it stands: the four tools over the workspace
table, just-bash over the same rows, `Shell.exec` as the one place a
command enters, and a refusal in one sentence for everything the isolate
cannot do. The premise of this leg is that a cell should not become a
machine. It should rent one, for the length of a command, and keep only
what the command changed.

Key terms, in addition to lamb's:

- **Tier 0**: the shell in the isolate. just-bash, the text tools, the
  workspace rows. Lamb built it; pen does not change it.
- **Tier 2**: a container. A real filesystem, a real process, `node`,
  `pnpm`, `python`, `git`. Rented per session, started on first use,
  discarded when idle. Its disk is a cache of the rows, never the truth.
- **Tier 1**: a fresh isolate for model-written code. Named, designed,
  and the last phase, because the container makes it optional.
- **Checkout**: the container's copy of the workspace, synced in by
  content hash and the diff synced back out.
- **Helper**: the process in the container that a program asks for a
  credential. It asks the cell, the cell asks the home, and the program
  gets a short-lived answer. The model gets nothing.

## What exists today, and what each journey adds

| Today | After these journeys |
| --- | --- |
| `pnpm install` answers `command not found (this shell runs inside the session…)`. | `pnpm install` runs, in a container the cell rented, and `node_modules` stays there. |
| The model's script cannot run. | `node script.js` runs, and its output and the files it wrote come back to the rows. |
| `git` is not in the cell. | `git clone`, `commit`, and `push` run as real git, over a checkout, with a credential the model never sees. |
| A command is a tier-0 command or a refusal. | A command is routed: tier 0 if the shell has it, tier 2 if a container is provisioned, a refusal that says which, otherwise. |
| The cell's cost is its rows. | The cell's cost is its rows plus a container while one is running, and nothing while it is not. |
| Nothing native runs on celld. | The same routing runs on a celld node with a container runtime beside it. |

## Cast

- **Nadia** — uses pi every day, has a lamb home, and has been told
  twice that the shell has no `npm`. Would like it to stop saying that.
- **Theo** — Nadia's teammate. Attaches to her session and runs the tests.
- **The operator** — whoever deployed the home and pays for the container
  minutes. In this leg, Nadia.
- **The container** — a machine rented by the cell. Named by nothing,
  because it has no identity worth keeping.

The journeys are ordered from the smallest claim outward: journey 1 is
one command in a container, journey 2 is a repository, journey 3 is the
container dying, journey 4 is the model's own code, journey 5 is celld,
and journey 6 verifies nothing changed for lamb.

## Journey 1: A command that needs a machine

Nadia has a project in her cell's workspace, put there by the agent with
`write` over a few turns. She wants its tests run.

1. Ask the agent to install the dependencies and run the tests. It runs
   `pnpm install`. The tool result streams pnpm's output as pnpm prints
   it, and ends with the exit code.
2. It runs `pnpm test`. The tests run. Output streams; the result says
   which passed.
3. Ask it to list the workspace. `find . -maxdepth 1` in tier 0 shows the
   project files and no `node_modules`. `ls node_modules | head` runs in
   the container and shows them there.
4. Ask it what the shell can do now. The system prompt's sentence has
   changed: it names the container and what runs there.
5. Come back an hour later and ask for the tests again. The first command
   takes longer, because the container is new and `node_modules` is
   gone. The tests run the same.

Acceptance criteria:

- Steps 1 and 2 are `Shell.exec` routing the command to tier 2. Pi's
  bash tool did not change; the renderer sees a normal bash result with
  periodic updates.
- Step 3 shows the rule: files the command wrote under the checkout sync
  back to the rows, except paths the design names as cache
  (`node_modules`, build output, anything in `.gitignore`). Those live in
  the container and die with it.
- Step 4's sentence is in one place, and a test checks that the shell's
  refusal, the system prompt, and the routing table agree.
- Step 5 costs nothing during the hour. The container was discarded when
  the lane idled, and the rows are what came back.

## Journey 2: A repository in, the work out

Lamb's withdrawn journey 5, as written there, over real git.

1. Ask the agent to clone `https://github.com/<org>/<repo>` and describe
   its layout. It runs `git clone`, then `find` and `cat`, and describes
   it.
2. Ask it for a change: fix a typo across the docs, on a new branch. It
   runs `git checkout -b`, edits with `edit`, runs `git status` and `git
   diff`, and shows the diff.
3. Ask it to commit and push. It runs `git add`, `git commit -m`, and
   `git push -u origin <branch>`. The push succeeds.
4. Nadia opens GitHub and finds the branch, with the commit authored as
   the home is configured to author, and opens the pull request herself.
5. Ask it to `git rebase -i`. Real git says what real git says about an
   interactive rebase with no terminal, and the agent says so.

Acceptance criteria:

- The credential that authorized step 3 was minted by the home for that
  push, handed to git by the helper, and appears in no transcript entry,
  no tool result, no file in the checkout or the rows, and no environment
  variable any command can print. `env`, `git config --list`, and `cat
  ~/.git-credentials` in the container show nothing.
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

Nadia asks for a long test run and the container is lost in the middle.

1. Ask the agent to run a test suite that takes a minute. It runs `pnpm
   test`. Output streams.
2. The operator kills the container. On Cloudflare this is the container
   instance ending; on a test rig it is a forced stop.
3. The tool result ends with a clear statement that the command was
   interrupted by the container going away, with the output up to that
   point and no exit code claimed. The agent says so and offers to run it
   again.
4. Ask it to. A new container is rented, the checkout is synced from the
   rows, and the tests run.
5. `find` in tier 0 shows the workspace exactly as the rows had it before
   step 1, plus whatever the interrupted command synced back before it
   died, and nothing half-written.

Acceptance criteria:

- Step 3 is honest in pi's terms: the tool result is an error result with
  the partial output, and pi's tool-durability rules settle it as an
  effect of unknown outcome, which the transcript says.
- Step 5 is the sync's atomicity claim: a file syncs back whole or not at
  all, and the rows are never a mix of before and after for one file.
- The proof is repeatable: a test in workerd against a fake container
  kills it at each stage of a scripted command and asserts the rows and
  the transcript are the same every time.
- The cell itself is not evicted in this journey. Lamb's journey 2 covers
  that; the two together are covered by one more test that does both.

## Journey 4: The model's own code

Nadia asks for a quick computation and the agent writes a script.

1. Ask the agent to compute something from the workspace files that a
   pipeline of text tools would not do well. It writes `compute.mjs` and
   runs `node compute.mjs`.
2. The script runs in tier 1, a fresh isolate: it can read the workspace,
   it cannot reach the network, and it cannot see the container or the
   home's secrets. Its stdout is the tool result.
3. Ask it to fetch a URL from the script. The script's `fetch` is refused
   with a sentence that names tier 1 and what it lacks, and the agent
   runs it in tier 2 instead, where `fetch` works.

Acceptance criteria:

- Tier 1 is a Worker Loader isolate with the workspace as a binding and
  no other bindings. A test asserts the isolate cannot `fetch` and cannot
  read the cell's environment.
- The routing decision, tier 1 or tier 2 for `node`, is the design's
  rule, stated once and tested. Tier 2 is the default when a container is
  up; tier 1 is the default when none is and the program is `node`.
- This journey is the last phase and is allowed to slip out of the leg.
  Everything before it stands without it.

## Journey 5: The same pen on celld

The operator runs celld with a container runtime on the node.

1. Journey 1 walks as written against `lamb --home https://<fleet>`.
2. Journey 2 walks as written.
3. Journey 3 walks as written, with `docker kill` as the operator's hand.

Acceptance criteria:

- No code path branches on the platform. The container protocol is the
  same; what differs is who starts the container, and that is
  configuration.
- What celld cannot do is a finding with celld's behaviour named, and the
  design decides whether it is pen's to work around.

## Journey 6: Nothing changed for lamb

A person with a lamb home who never provisions a container.

1. Every lamb journey walks as before. The shell refuses `npm` and `git`
   with lamb's sentence, unchanged.
2. Lamb's suite is green with pen's code present and no container
   configured.
3. The system prompt says what lamb's said, because no tier 2 exists for
   this home.

Acceptance criteria:

- A home without a container binding is lamb, byte for byte in behaviour.
  The routing table's tier-2 column is empty and the refusal is the same
  sentence.
- Pen adds no pi tool and no pi patch. `Shell.exec` is the whole seam.

## What the journeys force

- **A container protocol the cell speaks.** Journeys 1, 3, and 5. One
  small protocol over an authenticated channel: sync in, run, stream,
  sync out. The container is a client of the cell, never the reverse.
- **A checkout synced by hash, both ways, per file, atomically.**
  Journeys 1, 2, and 3. A manifest of paths and hashes, blobs fetched by
  hash, and a diff written back whole.
- **A routing table in one place.** Journeys 1, 4, and 6. Which program
  runs where, and the sentence for each refusal, generated from the same
  table the system prompt reads.
- **A credential helper, and a home that mints.** Journey 2. Short-lived,
  scoped, per operation, never in the container's environment.
- **A cache rule.** Journey 1 step 3. What syncs back and what does not,
  and `.gitignore` as the model's way to say so.
- **An honest interruption.** Journey 3. A tool result that says the
  machine went away, settled by pi's rules, not a fake exit code.

## Open questions

- **Who pays, and how much before the cell says no?** Container minutes
  are money. A per-home budget and a sentence when it is spent is this
  leg's answer; a per-user one is Identity's.
- **A GitHub App that authors as itself.** Journey 2 step 4 authors as
  the home. An installation token from an app the operator installed is
  the real client and belongs with Identity.
- **Large objects.** A `node_modules` never syncs; a `.git` with a big
  packfile does. Lamb's per-file cap stands in for an object store, and
  pen is the leg that will hit it first.
- **Which tier for which program**, beyond `node`. Python in a fresh
  isolate is Pyodide, which is a different thing than Python. The table
  starts small and grows by finding.
- **Sub-agents.** A child cell that rents its own container, or shares
  the parent's. Not this leg.
