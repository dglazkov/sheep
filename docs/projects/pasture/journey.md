---
status: done
since: 2026-09-06
see: pasture
note: "written 6 Sep 2026, the morning recast closed, from a brainstorm with the shepherd: a pasture is the place a dog puts what every sheep on a repository should know, and a sheep is born into one or into none. The shepherd's calls: the tree is mounted read-only and the one write path is the `pasture` program, not the agent tools; a sheep with a repository is cloned at birth; the tree is live; the herd view is generated from the directory and printed by a tier 0 program; tokens live in the pasture for now and a GitHub App is its own project. Pasture phase 0 built the same morning: the `Pasture` object with lamb's files table rooted at `/pasture`, the directory's `pasture` and `task` columns, the routes, the dog's verbs, and the two refusal sentences; journey 1 steps 1 to 3 and journey 4 step 3 walked on a local home. Pasture phase 1 built the same day: `/pasture` read-only through `read`, the shell, and the env, the prompt with the pasture paragraph, the brief, and pi-format skills, the pastureless prompt held as a literal; journey 4 steps 1 and 2 and journey 2 steps 2 to 5 walked on a local home with a real model. Pasture phase 2 built the same day: the `pasture` program in tier 0, the task column reported from the lane, the herd as one query behind the dog's view and the sheep's; journey 1 steps 6 and 7 and journey 2 step 1 walked on a local home with a real model. Pasture phase 3 built the same day: birth on first boot as a transcript entry, `/pasture` as the checkout's second root, the broker reading the pasture's token first; journey 1 steps 4, 5, and 8 walked on the local rig against the scratch repository with a real model. Pasture phase 4 built the same day: setup once per fresh container with the pasture's secrets in that run alone, pi's skills formatter from a new leaf on the fork; journey 3 steps 3 to 7 walked on the local rig with a real model. Pasture phase 5 the same afternoon: both homes redeployed with the `Pasture` class, and journeys 1 to 4 walked on them with a real model against the scratch repository. Done."
---

# Pasture — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**,
pi sessions each in a cell; the person is the **shepherd**. Lamb put a
sheep in a cell, pen rented it a container, recast named the command. A
sheep is still born knowing nothing: the dog's first paragraph to every
sheep says which repository, how to build it, what the last sheep found,
and when the sheep is done the paragraph is the dog's again. This
project gives that paragraph a place. A **pasture** is a shared tree,
a repository, and a herd; a sheep born into one wakes up in a clone with
the brief in its prompt, the tree at `/pasture`, and a program that says
who else is grazing. A sheep born into none is unchanged.

Each journey is an acceptance test: the work is done when it can be
walked as written against a real deployment. [design.md](design.md) is
the mechanism and [phases.md](phases.md) the walk. If a journey and the
mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **Pasture**: one `Pasture` Durable Object, named; a tree, a
  repository, secrets, and the sheep born into it.
- **The tree**: the pasture's files, mounted read-only at `/pasture` in
  every sheep of it; `BRIEF.md`, `setup.sh`, `skills/`, and notes.
- **The herd**: the sheep born into a pasture, as the directory lists
  them, with what each was asked.
- **Birth**: what a cell does on first boot into a pasture with a
  repository: clone, then setup, before the first prompt.

## Journey 1: A pasture with a repository

The dog is in a checkout of a repository on its laptop, with a home that
has a container. It wants two sheep on two tasks in that repository,
each on its own branch, and it does not want to explain the repository
twice.

1. Run `sheep pasture new docs --repo .`. The CLI reads the checkout's
   `origin` and prints the pasture's name, repository, and branch.
   `sheep pasture ls` lists it.
2. The shepherd pipes a fine-grained token for that repository into
   `sheep pasture secret set docs GIT_TOKEN`. `sheep pasture secret ls
   docs` prints `GIT_TOKEN` and nothing of its value.
3. Run `sheep pasture put docs BRIEF.md` with a brief on stdin: the
   repository's layout in three lines, and the rule that a sheep names
   its branch in `/pasture/notes/<its name>.md`, the name being the
   herd's second column, before it pushes.
4. Run `sheep new --pasture docs --name typo --detach -- "Fix the typo
   in README.md on a branch, commit, push."` and the same with `--name
   links` and a different task. Each id prints first and alone. `sheep
   log <id>` on either begins with the birth: `git clone` of the
   repository into `/workspace`, in a container, before the first turn.
5. Each sheep works in its clone with `edit` and real `git`, runs
   `pasture put notes/<name>.md` with its branch, and pushes. The
   credential is the pasture's, handed over by the broker as in pen's
   journey 2, and it appears nowhere the model or the dog can read.
6. Run `sheep pasture docs`. The herd: both sheep, their state, when
   each was born, and the task each was given, from the directory.
   `sheep ls --pasture docs` lists the same two; `sheep ls` shows
   `docs` in the last column for them and nothing there for a
   pastureless sheep.
7. Run `sheep attach <id> -- "Who else is in this pasture, and what are
   they doing?"` on either sheep. It runs `pasture` and answers from the
   output, naming the other sheep and its task, without either sheep
   having written anything about the other.
8. Two branches are on GitHub; `sheep pasture cat docs notes/typo.md`
   names one of them.

Acceptance criteria:

- The birth is a tier-2 run before the first prompt, its tail a
  transcript entry that `sheep log` prints and the model has; a birth
  that fails is an entry that says so, and the sheep is alive.
- The herd view printed by `sheep pasture <name>` and by `pasture` in a
  sheep are the same rows in the same order, from the directory; a test
  compares them.
- The token is in no transcript entry, tool result, row, checkout file,
  or environment any command can print; pen's journey 2 criterion,
  verbatim, with the pasture as the source.
- `--repo .` uploads nothing: the pasture stores a URL, and the clone is
  from the remote.

## Journey 2: A note across sheep

The dog has learned, through one sheep, something every later sheep on
the repository should know. It wants the next sheep to know it without
being told.

1. Run `sheep attach <id> -- "Write what you learned about the test
   fixtures to the pasture, under notes/fixtures.md."` The sheep runs
   `pasture put notes/fixtures.md` from a file it wrote in `/workspace`,
   or from stdin. `sheep pasture cat docs notes/fixtures.md` shows it
   from the dog's terminal within a second.
2. Run `sheep new --pasture docs --name fixtures -- "Read
   /pasture/notes/fixtures.md and tell me the one thing to watch for."`
   The new sheep `read`s the note and answers from it. It was told
   nothing but the path.
3. Ask a sheep to `edit /pasture/notes/fixtures.md`. The edit tool
   refuses with `EROFS` and the sentence naming `pasture put`. `echo x >
   /pasture/x` in its shell fails the same way. The tree is unchanged.
4. The dog changes the brief with `sheep pasture put docs BRIEF.md` while
   a sheep is mid-conversation. The sheep's next turn has the new brief:
   ask it to quote the brief's first line, and it quotes the new one.
5. Run `sheep pasture rm docs notes/fixtures.md`. A sheep's `ls
   /pasture/notes` no longer lists it, on its next command.

Acceptance criteria:

- Every read of `/pasture`, by `read`, by the shell, and by the prompt
  builder, sees the object's rows as of that tool call; a test writes
  through the object and reads through each path with no restart.
- Writes through `write`, `edit`, and every tier-0 command that writes
  are refused with `EROFS` and the sentence; a test covers the three
  tools and `sed -i`.
- `pasture put` and `sheep pasture put` are the same `PUT`, whole file
  in one transaction; the last writer wins and a file is never half of
  two writes.

## Journey 3: Setup, secrets, and skills

The repository needs `pnpm install` before its tests run, a private
registry token to do it, and the dog has a skill for how it likes its
commits written.

1. Run `sheep pasture put docs setup.sh` with a script that runs `pnpm
   install --frozen-lockfile` using `$NPM_TOKEN`, and `sheep pasture
   secret set docs NPM_TOKEN` from stdin.
2. Run `sheep pasture put docs skills/commit/SKILL.md` with a skill in
   pi's format: a name, a description, and the body.
3. Run `sheep new --pasture docs --name tests -- "Run the tests and
   report which fail."` The birth clones and then runs `setup.sh` in the
   same container, with `NPM_TOKEN` in setup's environment. The sheep's
   `pnpm test` runs against a warm `node_modules`.
4. Ask the sheep to print its environment. `NPM_TOKEN` is not in it.
5. Wait past the container's idle period, then `sheep attach <id> --
   "Run the tests again."` A fresh container is rented, setup runs
   again before `pnpm test`, and the tests run. `sheep log` shows no
   setup output, since it succeeded.
6. Break the script with `sheep pasture put docs setup.sh` and ask for the
   tests once more, past idle. The tool result begins with a line saying
   setup failed, then setup's output; `pnpm test` did not run. The sheep
   reports the failure instead of covering for it.
7. Ask the sheep "How should commits be written here?" The prompt lists
   the skill; the sheep `read`s `/pasture/skills/commit/SKILL.md` and
   answers from it.

Acceptance criteria:

- Setup runs after each sync-in into a fresh container and before that
  container's first command, never on a container that already ran it;
  a test through the fake container counts the runs.
- The pasture's secrets other than `GIT_TOKEN` are in setup's
  environment and in no model command's; `env` in the container after
  setup shows none of them.
- Skills are listed with pi's own formatter, with `/pasture` paths, and
  a malformed `SKILL.md` is a line naming the file and the fault, not a
  failed prompt.

## Journey 4: The sheep that has no pasture, and the home that has no container

Nothing lamb and pen built changes for a sheep born into no pasture,
and a pasture without a repository is useful on the home with no
container.

1. On `sheep`, the home with no container, run `sheep new -- "List the
   workspace."` The reply, the shell's refusal sentence, and `sheep log`
   are as before this project. There is no `/pasture`; `pasture` in its
   shell is just-bash's not-found line, annotated as before.
2. On the same home, run `sheep pasture new notes` with no repository,
   `put` a brief, and `sheep new --pasture notes -- "What does the brief
   say?"` The sheep quotes it. `/pasture` is there; `pasture` prints a
   herd of one.
3. On the same home, run `sheep pasture new src --repo
   https://github.com/<org>/<repo>` and then `sheep new --pasture src`.
   The CLI prints one sentence: the pasture has a repository and this
   home has no container to clone it with; a pasture with no repository
   would work here. No session was made; `sheep ls` is unchanged.
4. `sheep ls` on a home with no pastures prints the same columns as
   before, plus an empty last column; `sheep ls --json` shows
   `pasture: null`.

Acceptance criteria:

- The system prompt of a pastureless sheep is held as a literal in a test
  and is the prompt the cell built before this project.
- A pastureless sheep's shell has no `pasture` command, and its
  `CellFs` has no second backing; the tests that held on 6 Sep 2026
  hold unchanged.
- The refusal in step 3 is the directory's, before any cell exists, and
  its sentence is a literal in a test.
