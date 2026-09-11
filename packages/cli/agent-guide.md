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
the current directory, and prints the next sentence. Upgrading is
`npm install -g github:dglazkov/sheep#release` again, then `sheep home
deploy` for a deployed home, which `sheep home` asks for on stderr while
the home is older; every session is kept.

Every verb talks to a home; the first is on this machine:

```sh
sheep home local
```

It starts a home under the kennel and prints:

```
local home: http://127.0.0.1:<port> (started, pid <pid>)
kennel: <dir>/.sheep
config: <dir>/.sheep/config written
key: not held; export ANTHROPIC_API_KEY and run `sheep home local` again
```

The `key:` line needs the shepherd (see the end); then it answers `key:
held, in <dir>/.sheep/local/.dev.vars`. `sheep home local --faux` runs a
scripted model that answers "ok": the plumbing, without a key.

A `container:` line follows: with Docker on the machine the home rents
one beside every cell and its sheep can clone, build, test, and push;
without, one sentence says what a container would add and how to get one.
Tell the shepherd that sentence when the work needs a repository.

`sheep home stop` stops it; the next verb starts it again. `sheep home`
reports the kennel, the home, and whether it answers.
`--home <url>` or `SHEEP_HOME` selects another home for one command.
`sheep home deploy` puts this package's home on the shepherd's Cloudflare
account, a container beside every cell: with `CLOUDFLARE_API_TOKEN` and
`ANTHROPIC_API_KEY` in your shell it deploys; without them it prints
what it needs and costs, and makes nothing. `sheep home delete` ends that
station after its name is typed at a terminal. `sheep home join
<address>` is a second machine's way in: the station's token is one line
of stdin, piped by the shepherd, never an argument.

## The kennel

The **kennel** is `.sheep/` at or above the working directory, found the
way git finds `.git`, and `~/.sheep` when there is none. Each directory
with one has its own config, sheep, token, and home. `sheep setup` makes one
here, and in a git work tree appends `.sheep/` to the `.gitignore` beside
it, since the config holds a token.
`cd` is how you switch. If the command says
`.sheep` is tracked, tell the shepherd a token is in their repository; do
not fix it yourself.

## The verbs

Every verb exits, and each has a `--json` form in pi's shapes. Errors go to
stderr as `sheep: …` with exit 2.

- `sheep new [--name <name>] [--pasture <name>] -- "<prompt>"` mints a
  sheep, prints `session <id>` on stderr, streams the reply on stdout, and
  exits when the turn ends. With neither a prompt nor `--detach` it opens
  pi's interactive terminal, for a person; do not run it so.
- `sheep new --detach -- "<prompt>"` mints, sends, and returns before the
  first token, the id as the first line of stdout. This is how you start
  several at once.
- `sheep new --detach` with no prompt mints and prints the id alone. It
  is idle and costs nothing until asked; a pastured one is cloned and set
  up at its first prompt, or the first verb that reads it, not at the
  mint.
- `sheep -c -- "<prompt>"` is `attach` on the newest sheep.
- `sheep attach <id> -- "<prompt>"` sends a prompt to a sheep and streams
  the reply. To a busy sheep the prompt is queued behind the running turn;
  sheep prints `queued <id>` on stderr and exits 0, or with `--wait`
  streams the queued turn when it starts. `--detach` returns at once.
- `sheep ls [--pasture <name>]` lists the home's sheep, one per line,
  tab-separated: id, name, created, lane state (`idle`, `running`, `waiting`),
  pasture, secret names.
- `sheep status <id>` is the lane now: `state`, the open `operation`, the
  last `tool` call, `tokens` so far, `messages`.
- `sheep wait [--timeout <seconds>] <id>...` blocks until every named
  sheep is idle and prints each one's last assistant message, one line
  per sheep, `<id>\t<message>`. Exit 124 on timeout, with what finished.
  Read several results in one call; do not poll.
- `sheep abort <id>` stops the open turn and prints `<id>\taborted <op>`,
  or `<id>\tidle` with none.
- `sheep rm <id>` ends a sheep and prints `<id>\tended`: its turn
  aborted, its container and browser released, its rows gone, the pasture
  kept. `--json` adds `"aborted"`. No undo.
- `sheep log [--since <entry id | ISO time>] [--last <n>] <id>` prints the
  transcript, oldest first, tool calls and results included.
- `sheep export <id> [file]` writes the session as a pi SQLite file,
  `<id>.sqlite` by default, and prints the file and its table counts.

A sheep has pi's tools: `read`, `write`, and `edit` on a workspace in its
cell, and `bash`, a shell with the usual text tools. With a container the
shell has `git`, `node`, `pnpm`, and `python` too, and `~` is kept with
the sheep, except `~/.cache`, `~/.npm`, and caches like `node_modules`.

On a home with eyes a sheep sees what it wrote: `look <path>` in its
shell renders a workspace page in a real Chromium and prints errors,
console, and the accessibility tree beside a `look.png` it reads with
`read`; the report is in `sheep log`. The local home has eyes; `sheep
home` says whether a station has them.

With a container too, `look --serve 'npx vite --port $PORT --strictPort'
/` runs that command with `PORT` set, renders the page its port serves,
and stops it. The recipe for a frontend app is a skill in the repository,
`docs/projects/serve/skills/frontend/SKILL.md`, for a pasture.

## Pastures: a herd on one tree

A pasture is a shared tree a herd works on, with a repository behind it
or none; a sheep born into it sees the tree and what every sheep on that
repository should know.

- `sheep pasture new <name> [--repo <url> | --repo .] [--branch <branch>]`
  makes one and prints `<name>\t<repo>\t<branch>`. `--repo .` reads this
  checkout's `origin`, uploading nothing.
- `sheep pasture ls` lists pastures; `sheep pasture <name>` prints the
  meta, the `cache:` line, then the herd: id, name, state, born, task.
- `sheep pasture ls <name> [path]` lists the tree, a directory with its
  slash; `sheep pasture cat <name> <path>` prints a file; `sheep pasture
  put <name> <path> [file]` writes a file or stdin, whole; `sheep pasture
  rm <name> <path>` removes a file or directory.
- `sheep pasture secret set <name> <KEY>` reads the value from stdin,
  never an argument (`GIT_TOKEN` is the credential a sheep pushes with);
  `sheep pasture secret ls <name>` prints the names, never a value.
- `sheep new --pasture <name> --secret <NAME> --detach` gives one sheep a
  secret of its own, one line of stdin per `--secret`, in order. Its setup
  sees it over the pasture's by name; as `GIT_TOKEN`, git uses it before
  the pasture's or the home's. `sheep rm` ends it with the sheep; `sheep
  ls` shows names, never values.
- `sheep new --pasture <name> -- "…"` and `sheep ls --pasture <name>` are
  birth and the roll call.
- `setup.sh` in the tree runs once per fresh container. Its `npm install
  -g` lands in `/cache`, which the pasture keeps for that exact script and
  puts back first next time, so write `command -v <tool> >/dev/null ||
  npm install -g <spec>`. A changed `setup.sh` runs cold once; a turn's
  installs, and a setup that saw a sheep's own secret, are never kept.

## How to herd

Split the goal, give each piece to a sheep with `--detach`, keep working,
then `sheep wait` on all of them and read what came back. Name sheep
(`--name docs`) so `sheep ls` reads. A sheep that goes wrong is aborted,
not abandoned. Read `sheep log <id>` before deciding a sheep failed. A
sheep you are finished with is ended with `sheep rm <id>` (`sheep export
<id>` first if the transcript matters).

## What needs a person

1. **A model key.** Ask the shepherd to `export ANTHROPIC_API_KEY`, then
   run `sheep home local` again. Never in the chat, never in a file.
2. **An account for a deployed home.** The local home needs none; `sheep
   home deploy` says what it needs when the shepherd wants one.
3. **A hand at a terminal.** `sheep new` or `sheep attach <id>` with no
   prompt opens pi's interactive terminal on the sheep; tell the shepherd
   the command and the id.

Ask for each in one sentence, saying what it unlocks, and go on with what
does not need it.
