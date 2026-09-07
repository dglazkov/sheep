# sheep: the guide for the dog

Sheep is a repository for coding agents that herd coding agents. A
**sheep** is a pi session in a **cell**: one small database with an
address, holding the transcript, a workspace, and the loop that drives the
agent, at a **home**. You are the **sheepdog**, the agent with the
terminal; the person you work for is the **shepherd**. A person does not
run `sheep`. You do. This file ships beside the command and describes the
build you are running; `sheep --help` is the verb-by-verb reference.

## The command, and a home

`sheep --version` says which build this is. If the command is missing,
`npx github:dglazkov/sheep#release setup` installs it, puts the skill in
the current directory, and prints the next sentence; `sheep setup` again
later is harmless and reports what is current. Upgrading is
`npm install -g github:dglazkov/sheep#release` again.

Every verb talks to a home, and the first one is on this machine:

```sh
sheep home local
```

It starts a home under the kennel's `local/` (fetching a runtime once, the
first time), writes the kennel's `config` so every later command in this
directory finds it, and prints:

```
local home: http://127.0.0.1:<port> (started, pid <pid>)
kennel: <dir>/.sheep
files: <dir>/.sheep/local
config: <dir>/.sheep/config written
key: not held; export ANTHROPIC_API_KEY and run `sheep home local` again
```

(The paths are spelled out in full.) That last line is the one thing you
cannot do alone. Ask the shepherd to export `ANTHROPIC_API_KEY` in the
shell you run in, then run `sheep home local` again; it answers `key:
held, in <dir>/.sheep/local/.dev.vars`. Never ask for the key in the chat,
and never pass it as an argument: the home reads it from that file and
nothing else. `sheep home local --faux` runs a scripted model that answers
"ok" to everything, for a look at the plumbing without a key.

The home stops with `sheep home stop` and is started again by the next
verb that needs it, which says so on stderr. `sheep home` reports which
kennel it found, which home the config names, and whether it answers;
`sheep config` prints the resolved home and the kennel. `--home <url>` or
`SHEEP_HOME` selects another home for one command. A home in the cloud,
shared between machines, needs an account and is a later project.

## The kennel

The **kennel** is `.sheep/` at or above the working directory, found by
walking up the way git finds `.git`, and `~/.sheep` when there is none. It
holds this directory's config and its own local home, so a dog in each of
several directories has its own sheep, its own token, and its own home to
start and stop; nothing is shared but the command and the runtime under
`~/.sheep/tools`. `sheep setup` makes one here, and in a git work tree
appends `.sheep/` to the `.gitignore` beside it, because the config holds a
token and the home holds the model key. There is no variable that moves
it: `cd` is how you switch, and a subdirectory finds the kennel above it.
If the command says `.sheep` is tracked, tell the shepherd a token is in
their repository; do not try to fix it yourself.

## The verbs

Every verb exits, and every one has a `--json` form whose shapes are pi's:
entries are pi entries, a status is pi's lane snapshot. Errors go to
stderr as `sheep: …` with exit 2.

- `sheep new [--name <name>] [--pasture <name>] -- "<prompt>"` mints a
  sheep, prints `session <id>` on stderr, streams the reply on stdout, and
  exits when the turn ends. With no prompt it opens pi's interactive
  terminal, which is for a person; do not run it without one.
- `sheep new --detach -- "<prompt>"` mints, sends, and returns before the
  first token, the id as the first line of stdout. The sheep works whether
  or not anyone is attached. This is how you start several at once.
- `sheep -c -- "<prompt>"` is `attach` on the newest sheep.
- `sheep attach <id> -- "<prompt>"` sends a prompt to a sheep and streams
  the reply. To a busy sheep the prompt is queued behind the running turn;
  sheep prints `queued <id>` on stderr and exits 0, or with `--wait`
  streams the queued turn when it starts. `--detach` returns at once.
- `sheep ls [--pasture <name>]` lists the home's sheep, one per line, tab
  separated: id, name, created, lane state (`idle`, `running`, `waiting`),
  pasture.
- `sheep status <id>` is the lane now: `state`, the open `operation`, the
  last `tool` call, `tokens` so far, `messages`.
- `sheep wait [--timeout <seconds>] <id>...` blocks until every named
  sheep is idle and prints each one's last assistant message, one line
  per sheep, `<id>\t<message>`. Exit 124 on timeout, with what finished.
  This is how you read several results in one call; do not poll.
- `sheep abort <id>` stops the open turn and prints `<id>\taborted <op>`,
  or `<id>\tidle` when there was none.
- `sheep log [--since <entry id | ISO time>] [--last <n>] <id>` prints the
  transcript as text, oldest first, one block per entry, tool calls and
  results included.
- `sheep export <id> [file]` writes the session as a pi SQLite file,
  `<id>.sqlite` by default, and prints the file and its table counts.

A sheep has pi's tools: `read`, `write`, and `edit` on a workspace in its
cell, and `bash`, a shell in the cell with the usual text tools. On a home
with no container there is no `git`, no `node`, no package manager; the
shell says so plainly when asked.

## Pastures: a herd on one tree

A pasture is a shared tree a herd works on, with a repository behind it
or none. A sheep born into a pasture sees the tree and what every sheep
on that repository should know.

- `sheep pasture new <name> [--repo <url> | --repo .] [--branch <branch>]`
  makes one and prints `<name>\t<repo>\t<branch>`. `--repo .` reads this
  checkout's `origin`, uploading nothing.
- `sheep pasture ls` lists pastures; `sheep pasture <name>` prints the
  meta, then the herd: id, name, state, born, task.
- `sheep pasture ls <name> [path]` lists the tree, a directory with its
  slash; `sheep pasture cat <name> <path>` prints a file; `sheep pasture
  put <name> <path> [file]` writes a file or stdin, whole; `sheep pasture
  rm <name> <path>` removes a file or a directory.
- `sheep pasture secret set <name> <KEY>` reads the value from stdin,
  never an argument (`GIT_TOKEN` is the credential a sheep pushes with);
  `sheep pasture secret ls <name>` prints the names, never a value.
- `sheep new --pasture <name> -- "…"` and `sheep ls --pasture <name>` are
  birth and the roll call.

## How to herd

Split the goal, give each piece to a sheep with `--detach`, keep working,
then `sheep wait` on all of them and read what came back. Name sheep
(`--name docs`) so `sheep ls` reads. A sheep that goes wrong is aborted,
not abandoned. Read `sheep log <id>` before deciding a sheep failed; the
transcript is the whole story. Keep the ids: they are how every later
verb names the sheep.

## What needs a person

Three things, and only these:

1. **A model key.** Ask the shepherd to `export ANTHROPIC_API_KEY`, then
   run `sheep home local` again. Never ask them to paste the key into the
   chat; never write it into a file yourself.
2. **An account for a deployed home.** The local home needs none. A home
   in the cloud is a later project; if the shepherd asks for one, say that.
3. **A hand at a terminal.** `sheep new` or `sheep attach <id>` with no
   prompt opens pi's interactive terminal on the sheep, from the same
   build, on any machine with the config. It is the shepherd's window into
   a sheep; tell them the command and the id.

Ask for each in one sentence, saying what it unlocks, and go on with what
does not need it.
