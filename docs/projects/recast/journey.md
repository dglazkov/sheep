---
status: done
since: 2026-09-06
see: recast
note: "written 6 Sep 2026, the day after lamb and pen were walked: the command the dog runs is renamed from `lamb` to `sheep`, the home with it, and the first two legs are frozen as history. Recast phase 0 closed the same morning: every name in the repo is sheep, every suite holds unchanged, journey 1 steps 1 and 2 hold locally. Recast phase 1 closed the same morning: `sheep` and `sheep-pen` deployed, journey 1 walked in full with a real model by the conductor as the dog, `lamb` and `lamb-pen` deleted. Recast phase 2 closed the same morning: lamb and pen frozen above their first paragraphs, the index finished, journey 2 walked by reading. Done."
---

# Recast — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**,
pi sessions each in a cell; the person is the **shepherd**. The command
the dog runs to herd is the product of this repo, and the work from here
on is that command. Its first leg, [lamb](../lamb/journey.md), built it
and called it `lamb`, after the leg. Its second, [pen](../pen/journey.md),
gave a sheep a container and kept the name. Both legs are walked. This
short project gives the command its real name, `sheep`, moves every
name that hung off the old one, and freezes the two legs as the history
they are. It is a recast, not a leg: nothing the dog can do changes.

Each journey is an acceptance test: the work is done when it can be
walked as written against a real deployment. [design.md](design.md) is
the mechanism and [phases.md](phases.md) the walk. If a journey and the
mechanism disagree, the mechanism is what changes.

## Journey 1: The dog is handed the repo

A Claude Code session is pointed at a fresh checkout of this repo and a
home the shepherd deployed, and told to herd.

1. It reads `README.md`. The command is `sheep`. The home is at
   `~/.sheep/config`, or `SHEEP_HOME` and `SHEEP_TOKEN`. Nothing it reads
   about setting up or running says `lamb`, except where the README
   names the first leg as history.
2. It runs `sheep --help`. The first line begins `sheep`. Every verb lamb
   journey 5 gave the dog is there under the new name: `new`, `attach`,
   `ls`, `status`, `wait`, `abort`, `log`, `export`, `config`.
3. It runs `sheep new --name docs --detach -- "…"`. The id prints first
   and alone. `sheep ls` lists the sheep; `sheep wait <id>` returns its
   last message; `sheep log <id>` prints the transcript. The error
   prefix, when it earns one, is `sheep:`.
4. It runs `sheep config`. The resolved home is `https://sheep.<you>.workers.dev`,
   and `GET /` on that home answers `sheep`.
5. Against the home with a container, `https://sheep-pen.<you>.workers.dev`,
   it hands a sheep a line that needs `node`. The container is rented,
   the line runs, and the sheep's environment says `SHEEP=1`, not
   `LAMB=1`.
6. The shepherd's Cloudflare account lists the Workers `sheep` and
   `sheep-pen`. `lamb` and `lamb-pen` are gone, once the shepherd said
   they could go.

Acceptance criteria:

- `grep -rn -i lamb packages` (node_modules and `.wrangler` aside) prints
  only citations of a lamb phase or of the leg by name, never an
  identifier, a string the dog or the model sees, an environment
  variable, a path, a file name, or a package name.
- Every test that held on 5 Sep 2026 holds under the new names, in the
  place the rules say it runs: the cell's in workerd, the CLI's against
  a local home through the built binary.
- The walk in steps 3 to 5 is by a Claude Code session against the
  deployed homes with a real model, and its commands and output are in
  the phase's Findings.
- The `pen` environment, its `PEN_*` variables, and the `pen` package
  keep their names: pen is a leg, and its container is still pen's.

## Journey 2: A reader opens the index

Someone, a person or an agent, opens `docs/projects/README.md` to find
out what this repo is and where the work stands.

1. The index says what sheep is in one paragraph and lists three
   projects: lamb and pen, done and frozen, and recast, done. Each row
   says where the project stands in the words of its own docs.
2. The index says that a project is short: it holds one body of work
   with an end, and a project that turns out to be long-lived was cut
   at the wrong grain and should have been several.
3. The reader opens `docs/projects/lamb/phases.md`. Its first lines say
   the leg is done and frozen on a date, that the command it calls
   `lamb` throughout is now `sheep`, and where to read on. The commands
   quoted below that line are as they ran. The same is true of pen's
   docs and of every primary doc in both legs.
4. The reader runs the status script on lamb, on pen, and on recast. Lamb
   and pen have no next phase. Recast's Open roster carries the one walk
   lamb still owed a person, a second machine and a night for its
   journey 1, and the debt this recast created on purpose: the command
   is not published, and what it would take to publish it is named.

Acceptance criteria:

- Nothing in `docs/projects/lamb/` or `docs/projects/pen/` is rewritten
  below the freeze line. History quotes what ran.
- `.claude/skills/conduct/status.sh recast` lints clean, and running it
  on lamb and pen reports nothing new.
- The memory that the sheepdog carries between sessions says `sheep`
  where it used to say `lamb`, so the next session does not reach for a
  command that is gone.
