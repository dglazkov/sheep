---
name: sheep
description: Herd coding agents with the sheep command — mint pi sessions in cells at a home, prompt them, wait on them, read their transcripts, and give a herd a shared pasture. Use when asked to run sheep, to delegate work to sheep, to set up sheep, or when a task is big enough to split across several agents working at once.
---

# sheep

Sheep is a repository for coding agents that herd coding agents: `sheep`
is your command, and the sheep it herds are pi sessions, each in a cell at
a home. A person does not run `sheep`; you do.

**The instructions ship inside the command.** Run this once per session
and read all of it before anything else:

```sh
sheep --agent-help
```

It describes the build you are running, so it cannot fall behind this
file.

## If `sheep` isn't there

One command installs it and readies the directory you are in; the
repository is the package:

```sh
npx github:dglazkov/sheep#release setup
```

It is idempotent, puts `sheep` on your PATH, installs this skill here,
makes this directory's kennel (`.sheep/`, which holds its config and its
own local home, and which setup adds to the `.gitignore` in a git work
tree), and ends with the sentence to run next. Keep the `#release` on the
spec.

The kennel is found by walking up from where you stand, the way git finds
`.git`, and is `~/.sheep` when there is none, so a dog in each of several
directories herds its own sheep and shares nothing but the command.

## What a sheep can see

On a home with eyes, a sheep can `look <path>` at a page in its workspace:
a real Chromium renders it, and the sheep reads the picture and a report
(errors, console, the accessibility tree). You read that report in `sheep
log <id>`; there is no `sheep look`. The local home always has eyes, and
its first look fetches a Chrome, which `sheep home local` says. A station
deployed before this release has none until `sheep home deploy` upgrades
it; `sheep home` prints `eyes: yes` or `no`.

With a container as well, a sheep can look at its own dev server: `look
--serve '<command>' [<path>]` runs the command with `PORT` set, renders
the page its port serves, and stops it — a server lives for one look and
no longer. The recipe for a frontend app is a skill in the repository, at
`docs/projects/serve/skills/frontend/SKILL.md`: put it in a pasture with
`sheep pasture put <name> skills/frontend/SKILL.md <that file>` and every
sheep born there reads it.

## What needs a person

- **A model key**: ask them to `export ANTHROPIC_API_KEY` in the shell
  `sheep` runs in, never to paste it into the chat.
- **An account for a deployed home**: a home on this machine needs none;
  `sheep home deploy` needs `CLOUDFLARE_API_TOKEN` and `ANTHROPIC_API_KEY`
  exported in the shell, and prints what to ask for when they are not;
  `sheep home delete` lists what goes and how many sessions are in it, then
  needs the station's name typed at their terminal (exit 2 without one);
  `sheep home join <address>` needs its token piped on stdin, never pasted.
- **A hand at a terminal**: `sheep attach <id>` with no prompt opens pi's
  interactive terminal, theirs to use, not yours.
