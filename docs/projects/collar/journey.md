---
status: partial
since: 2026-09-07
see: collar
note: "written 7 Sep 2026, the day after pasture closed, from a brainstorm with the shepherd: how a person gives their sheepdog the `sheep` command. The shepherd's calls: the command is published the way isocan is, a `release` branch on GitHub built from `main`, installed with npm's git installer, and nothing on npm; the pi fork ships inside the bundle; a home on the dog's own machine comes before any account; the deployed home from the package is the next project, not this one; and the release is proved by a hermetic install, in an environment as close to the user's as the repo can make, before it is pushed and again after. Collar phase 0 built the same morning: the two bundles with pi's own esbuild options, the Worker from wrangler's dry run, the release script making a two-parent ref without pushing, and the package ring installing that ref through npm's git installer into a fresh prefix and walking journey 1 steps 3, 4, and 7 with the faux provider; the ring held. Collar phase 1 the same morning: `sheep home local`, workerd under `~/.sheep/local` with wrangler fetched once and the secrets in a file of mode 600, stop and start on demand; the ring walked journey 1 steps 2, 3, 4, 6, and 7 from the install against it, and journey 5's file passed against that home. Collar phase 2 the same morning: `sheep setup` in isocan's shape, the skill as a doorway, the guide shipped beside the bundle as `sheep --agent-help`, the README with the install spec first, and the SQLite warning debt paid; the ring walked journey 1 steps 1 to 7 from the install. Collar phase 3 in the afternoon, part-done: the machine ring green on `node:22-slim` and `node:24-slim` with nothing mounted, the release script walking every candidate in the package ring before the ref moves and refusing a bundle broken on purpose, the workflow written; the first push of `release` waits on the shepherd."
---

# Collar — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**,
pi sessions each in a cell; the person is the **shepherd**. Lamb put a
sheep in a cell, pen rented it a container, recast named the command,
pasture gave the herd a place. Every one of them was walked from this
checkout, by a dog that had built the command. No other dog has ever run
`sheep`, because there is no way to give it one: the CLI links into a
submodule and spawns pi from source under it. This project is the
collar: the shepherd says one sentence to their dog, and the dog has the
command, a home to use it on, and the knowledge to use it.

Each journey is an acceptance test: the work is done when it can be
walked as written, and the walks here are walked in a hermetic
environment, never from this checkout. [design.md](design.md) is the
mechanism and [phases.md](phases.md) the walk. If a journey and the
mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **The release**: the `release` branch of `github.com/dglazkov/sheep`,
  built from a commit on `main`; what every install comes from.
- **The install spec**: `github:dglazkov/sheep#release`, the one string
  a dog needs.
- **The local home**: a home on the dog's own machine, workerd under
  `~/.sheep`, started by the CLI, with no account behind it.
- **A ring**: one hermetic environment the release is proved in. The
  package ring is a fresh npm prefix, cache, and `HOME` on this machine;
  the machine ring is a container with Node and nothing else; the dog
  ring is the machine ring with a coding agent in it, given only the
  skill and a sentence.

## Journey 1: The first five minutes

A person has Claude Code open in a repository on a laptop where sheep
has never been. They say: "Install sheep from github.com/dglazkov/sheep
and try it out." The dog has the repository's README, or the skill, and
nothing else.

1. The dog runs `npx github:dglazkov/sheep#release setup`. In under two
   minutes on a warm network, setup reports, in prose and with `--json`:
   `sheep` is on PATH, and where; the skill is installed in this
   directory, under `.agents/skills/sheep` with the `.claude/skills`
   doorway; no home is configured; and the one sentence to run next.
2. The dog runs `sheep home local`. A home starts under `~/.sheep/local`
   on a free port, `~/.sheep/config` names it, and the command prints
   the address and that the home has no model key. The dog asks the
   person for an Anthropic key, which the person exports as
   `ANTHROPIC_API_KEY`; `sheep home local` again reports the key is
   held, and where.
3. The dog runs `sheep new -- "What can you see in the workspace?"`. The
   reply streams from a real model and the command exits. `sheep ls`
   lists the sheep. `sheep status <id>` and `sheep log <id>` are lamb
   journey 5's.
4. The dog runs `sheep attach <id> -- "And now?"` and the reply
   streams. The person runs `sheep attach <id>` at their own terminal
   and gets pi's interactive terminal on the same sheep, from the
   bundle, with no checkout of pi anywhere on the machine; the same
   command with no terminal attaches through that bundle and says so.
5. The dog runs `sheep --agent-help` and reads the guide: the verbs, the
   home, what needs a person, in the words this build ships. The skill
   said to; it says little else.
6. The next morning the home is not running. `sheep ls` starts it and
   lists yesterday's sheep. `sheep home stop` stops it; `sheep home`
   says so.
7. `sheep export <id>` writes a pi session file. `sheep --version`
   prints the release's build stamp: the commit on `main` it was built
   from, and when.

Acceptance criteria:

- The install carries no `.git`, no submodule, no `workspaces`, no
  `prepare`, and no pi checkout; pi is inside the two bundles, and the
  release manifest's dependencies are the handful pi's own bundle keeps
  external, held as a literal in a test.
- Steps 1 to 4 and 6 are walked by the package ring on every release,
  with the faux provider in place of the key, and the walk is what
  decides whether the release is pushed.
- The local home is the cell of 6 Sep 2026, the home with no container,
  in workerd: `GET /` answers `sheep`, and the suite that holds against
  `wrangler dev` in the checkout holds against it.
- A key is read from the person's environment and written to the local
  home's secrets file, mode 600, and never passed as an argument.

## Journey 2: The release

The shepherd pushes a commit to `main`. Nothing else is done by hand.

1. CI builds the release from that commit: pi from the submodule, the
   two bundles, the Worker, the manifest; commits the tree onto
   `release` with two parents, the previous release and the `main`
   commit; and, before pushing, installs it from the local repository
   into the package ring and walks journey 1 steps 1 to 4 and 6 with
   the faux provider.
2. The push happens only if the walk held. A commit whose release walk
   fails leaves `release` at the last good release, and the run is red
   with the walk's output.
3. After the push, a second job on a bare runner installs from
   `github:dglazkov/sheep#release`, the string a user types, and walks
   the same steps. This is the ring closest to the user's shell, and it
   is the one that would have caught isocan's #47.
4. By hand, `pnpm release` does step 1 on a laptop and pushes;
   `pnpm release --no-push` stops before the push and prints the ref.
   `pnpm hermetic --ring package` runs the walk alone against a ref.

Acceptance criteria:

- The `release` branch is never force-pushed; every release commit has
  the `main` commit it was built from as its second parent, so `git log
  release` answers which commit any install is.
- The release tree carries no `.github/`.
- The build stamp in the manifest, `sheep --version`, and `git log`
  agree.

## Journey 3: The rings

The conductor, or the shepherd, wants to know that a release works for a
user, not for this laptop.

1. `pnpm hermetic --ring package [ref]` installs the ref into a fresh
   prefix, cache, and `HOME` on this machine and walks journey 1 steps
   1 to 4 and 6 with the faux provider. It prints one line per step
   and exits nonzero on the first that fails, with the command and its
   output.
2. `pnpm hermetic --ring machine [ref]` does the same inside a
   container built from `node:22-slim` and again from `node:24-slim`,
   with the ref reachable as a bare repository and nothing else mounted.
   No Docker socket, no git config, no pnpm, no wrangler login.
3. `pnpm hermetic --ring dog [ref]` runs the machine ring with a coding
   agent installed, Claude Code first, the person's key in its
   environment, the skill added with `npx skills add`, and the
   sentence from journey 1. The agent is not told the steps. Afterwards
   the ring asserts on `sheep ls --json` and `sheep home --json` inside
   the container, and prints the agent's transcript as the report.
4. Each ring names what it did not check: the package ring that this
   machine's Node is the user's, the machine ring that a person was in
   the loop, the dog ring that any dog but the one it ran was tried.

Acceptance criteria:

- A ring never reads this checkout's `node_modules`, `~/.sheep`, or
  `~/.npm`; the package ring asserts its prefix, cache, and `HOME` are
  the fresh directories it made.
- The rings are one script with one walk; the ring chooses the
  environment, never the steps.
- The dog ring spends the person's tokens and says so before it starts.

## Journey 4: The checkout is unchanged

A developer of sheep, in this checkout, notices nothing.

1. `node packages/cli/bin/sheep.js new -- "hello"` against `pnpm
   --filter @sheep/cell dev` works as it did on 6 Sep 2026. `pnpm
   test` runs the suites that held that day, unchanged in what they
   assert.
2. `sheep setup` run inside a checkout of sheep installs no skill into
   it and points nothing at a home; it says it is in a checkout.
3. The `release` branch is never checked out here; `main` carries
   sources only, and no bundle, Worker, or manifest is committed to it.
4. The README's setup section is the install spec and journey 1; the
   checkout instructions move below it, for developers.

Acceptance criteria:

- `git ls-files main` has no `dist/`, no `home/worker.mjs`, and no
  release manifest.
- The conduct skill's status script prints `clean` for this project.
