# sheep: the guide for the dog

Sheep is a repository for coding agents that herd coding agents. A
**sheep** is a pi session in a **cell**: one small database with an
address, holding the transcript, a workspace, and the loop that drives the
agent, at a **home**. You are the **sheepdog**, the agent with the
terminal; the person you work for is the **shepherd**. A person does not
run `sheep`. You do. This file describes the build you run; `sheep --help`
is the verb-by-verb reference.

## The command, and a home

`sheep --version` says which build this is. If the command is missing,
`npx github:dglazkov/sheep#release setup` installs it, puts the skill in
the current directory, and prints the next sentence; `sheep setup` again
is harmless. Upgrading is
`npm install -g github:dglazkov/sheep#release` again; a deployed home is
then `sheep home deploy` again from the newer package, which `sheep home`
says on stderr while the home is older, with every session kept.

Every verb talks to a home; the first is on this machine:

```sh
sheep home local
```

It starts a home under the kennel's `local/` (fetching a runtime once),
writes the kennel's `config`, and prints:

```
local home: http://127.0.0.1:<port> (started, pid <pid>)
kennel: <dir>/.sheep
config: <dir>/.sheep/config written
key: not held; export ANTHROPIC_API_KEY and run `sheep home local` again
```

The `key:` line is the one thing you cannot do alone. Ask the shepherd to export `ANTHROPIC_API_KEY` in
your shell, then run `sheep home local` again; it answers `key:
held, in <dir>/.sheep/local/.dev.vars`. Never in the chat, never as an
argument: the home reads that file and nothing else. `sheep home local
--faux` runs a scripted model that answers
"ok" to everything: the plumbing, without a key.

A `container:` line follows: with Docker on the machine the home rents
one beside every cell and its sheep can clone, build, test, and push;
without, one sentence says what a container would add and how to get one.
Tell the shepherd that sentence when the work needs a repository.

The home stops with `sheep home stop`, and the next verb that needs it
starts it again, saying so on stderr. `sheep home` reports which
kennel it found, which home the config names, and whether it answers.
`--home <url>` or `SHEEP_HOME` selects another home for one command.
`sheep home deploy` puts this package's home on the shepherd's Cloudflare
account, a container beside every cell: with `CLOUDFLARE_API_TOKEN` and
`ANTHROPIC_API_KEY` in your shell it deploys, prints the address, and
writes the kennel's config; without them it prints what it needs and
costs, and makes nothing. `sheep home delete` ends that station after its
name is typed at a terminal. `sheep home join <address>` is a second
machine's way in: the station's token is one line of stdin, piped by the
shepherd, never an argument.

## The kennel

The **kennel** is `.sheep/` at or above the working directory, found the
way git finds `.git`, and `~/.sheep` when there is none. It
holds this directory's config and local home, so a dog in each of several
directories has its own sheep, token, and home; nothing is shared but the
command. `sheep setup` makes one here, and in a git work tree appends
`.sheep/` to the `.gitignore` beside it, since the config holds a token.
No variable moves it: `cd` is how you switch. If the command says
`.sheep` is tracked, tell the shepherd a token is in their repository; do
not fix it yourself.

## The verbs

Every verb exits, and each has a `--json` form whose shapes are pi's:
entries are pi entries, a status is pi's lane snapshot. Errors go to
stderr as `sheep: …` with exit 2.

- `sheep new [--name <name>] [--pasture <name>] -- "<prompt>"` mints a
  sheep, prints `session <id>` on stderr, streams the reply on stdout, and
  exits when the turn ends. With no prompt it opens pi's interactive
  terminal, for a person; do not run it without one.
- `sheep new --detach -- "<prompt>"` mints, sends, and returns before the
  first token, the id as the first line of stdout. The sheep works whether
  or not anyone is attached; this is how you start several at once.
- `sheep -c -- "<prompt>"` is `attach` on the newest sheep.
- `sheep attach <id> -- "<prompt>"` sends a prompt to a sheep and streams
  the reply. To a busy sheep the prompt is queued behind the running turn;
  sheep prints `queued <id>` on stderr and exits 0, or with `--wait`
  streams the queued turn when it starts. `--detach` returns at once.
- `sheep ls [--pasture <name>]` lists the home's sheep, one per line,
  tab-separated: id, name, created, lane state (`idle`, `running`, `waiting`),
  pasture.
- `sheep status <id>` is the lane now: `state`, the open `operation`, the
  last `tool` call, `tokens` so far, `messages`.
- `sheep wait [--timeout <seconds>] <id>...` blocks until every named
  sheep is idle and prints each one's last assistant message, one line
  per sheep, `<id>\t<message>`. Exit 124 on timeout, with what finished.
  Read several results in one call this way; do not poll.
- `sheep abort <id>` stops the open turn and prints `<id>\taborted <op>`,
  or `<id>\tidle` with none.
- `sheep rm <id>` ends a sheep and prints `<id>\tended`: its turn
  aborted, its container and browser released, its rows gone, the pasture
  kept. `--json` adds `"aborted"`. No undo.
- `sheep log [--since <entry id | ISO time>] [--last <n>] <id>` prints the
  transcript as text, oldest first, one block per entry, tool calls and
  results included.
- `sheep export <id> [file]` writes the session as a pi SQLite file,
  `<id>.sqlite` by default, and prints the file and its table counts.

A sheep has pi's tools: `read`, `write`, and `edit` on a workspace in its
cell, and `bash`, a shell with the usual text tools. With a container the
shell has `git`, `node`, `pnpm`, and `python` too; without one it says so
when asked.

On a home with eyes a sheep sees what it wrote: `look <path>` in its
shell renders a workspace page in a real Chromium and prints errors,
console, and the accessibility tree beside a `look.png` it reads with
`read`; the report is in `sheep log`. The local home has eyes, its first
look fetching a Chrome; a station deployed before them says `eyes: no` in
`sheep home` until `sheep home deploy` upgrades it.

With a container too, `look --serve 'npx vite --port $PORT --strictPort'
/` runs that command with `PORT` set, renders the page its port serves,
and stops it: a server lives for one look and no longer. The recipe for a
frontend app is a skill in the repository,
`docs/projects/serve/skills/frontend/SKILL.md`, for a pasture.

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
  rm <name> <path>` removes a file or directory.
- `sheep pasture secret set <name> <KEY>` reads the value from stdin,
  never an argument (`GIT_TOKEN` is the credential a sheep pushes with);
  `sheep pasture secret ls <name>` prints the names, never a value.
- `sheep new --pasture <name> -- "…"` and `sheep ls --pasture <name>` are
  birth and the roll call.

## How to herd

Split the goal, give each piece to a sheep with `--detach`, keep working,
then `sheep wait` on all of them and read what came back. Name sheep
(`--name docs`) so `sheep ls` reads. A sheep that goes wrong is aborted,
not abandoned. Read `sheep log <id>` before deciding a sheep failed. A
sheep you are finished with is ended with `sheep rm <id>` (`sheep export
<id>` first if the transcript matters); a herd that only grows cannot be
read. Keep the ids: every later verb names the sheep by them.

## What needs a person

Three things:

1. **A model key.** Ask the shepherd to `export ANTHROPIC_API_KEY`, then
   run `sheep home local` again. Never in the chat, never in a file.
2. **An account for a deployed home.** The local home needs none; `sheep
   home deploy` says what it needs when the shepherd wants one.
3. **A hand at a terminal.** `sheep new` or `sheep attach <id>` with no
   prompt opens pi's interactive terminal on the sheep, from any machine
   with the config; tell the shepherd the command and the id.

Ask for each in one sentence, saying what it unlocks, and go on with what
does not need it.
