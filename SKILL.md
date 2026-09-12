---
name: sheep
description: Herd coding agents with the sheep command — mint pi sessions in cells at a home, prompt them, wait on them, read their transcripts, end them when they are done, and give a herd a shared pasture. Use when asked to run sheep, to delegate work to sheep, to set up sheep, or when a task is big enough to split across several agents working at once.
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
and prints a report whose `home:` line says whether a home is reachable
from where you stand. Keep the `#release` on the spec.

The kennel is found by walking up from where you stand, the way git finds
`.git`, and is `~/.sheep` when there is none, so a home the shepherd set
up for the whole machine is the one you find in every directory.

## What a sheep can see

On a home with eyes, a sheep can `look <path>` at a page in its workspace:
a real Chromium renders it, and the sheep reads the picture and a report
(errors, console, the accessibility tree). You read that report in `sheep
log <id>`; there is no `sheep look`. `sheep home` prints `eyes: yes` or
`no`, and a home deployed before eyes existed has them once `sheep home
deploy` upgrades it.

With a container as well, a sheep can look at its own dev server: `look
--serve '<command>' [<path>]` runs the command with `PORT` set, renders
the page its port serves, and stops it — a server lives for one look and
no longer. The recipe for a frontend app is a skill in the repository, at
`docs/projects/serve/skills/frontend/SKILL.md`: put it in a pasture with
`sheep pasture put <name> skills/frontend/SKILL.md <that file>` and every
sheep born there reads it.

## What needs a person

- **A home, and the two values it needs**: the shepherd's one sitting,
  `sheep setup` at their own terminal, which asks for their Cloudflare
  account token and their Anthropic key once and keeps them. When a
  command stops with a paragraph that begins `for the shepherd:`, give
  them that paragraph as it is and do nothing else toward it. Never ask
  for either value in the chat.
- **Ending the station**: `sheep home delete` lists what goes and needs
  the station's name typed at their terminal.
- **A hand at a terminal**: `sheep attach <id>` with no prompt opens pi's
  interactive terminal, theirs to use, not yours.
