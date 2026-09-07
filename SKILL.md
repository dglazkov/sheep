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

## What needs a person

- **A model key**: ask them to `export ANTHROPIC_API_KEY` in the shell
  `sheep` runs in, never to paste it into the chat.
- **An account for a deployed home**: a home on this machine needs none;
  `sheep home deploy` needs `CLOUDFLARE_API_TOKEN` and `ANTHROPIC_API_KEY`
  exported in the shell, and prints what to ask for when they are not;
  `sheep home delete` needs the station's name typed at their terminal.
- **A hand at a terminal**: `sheep attach <id>` with no prompt opens pi's
  interactive terminal, theirs to use, not yours.
