# sheep: the guide for the dog

Sheep is for coding agents that herd coding agents. A
**sheep** is a pi session in a **cell**: one small database with an
address, holding the transcript, a workspace, and the loop that drives the
agent, at a **home**. You are the **sheepdog**, the agent with the
terminal; the person you work for is the **shepherd**. A person does not
run `sheep`. You do. `sheep --help` is the verb-by-verb reference for the
build you run.

## The command, and a home

`sheep --version` says which build this is. If the command is missing,
`npx github:dglazkov/sheep#release setup` installs it and puts the skill
here. Upgrading is `npm install -g github:dglazkov/sheep#release` again,
then `sheep home deploy`, which `sheep home` asks for while the home is
older; it asks nobody anything, and every session is kept.

Every verb talks to a **home**: the shepherd's station on their
Cloudflare account, where every sheep lives with a container to clone,
build, test, and push in. You never make one. The shepherd does, once, at
their own terminal, with `sheep setup`, which asks them for their account
token and their Anthropic key and keeps both. Run by you, with no
terminal, `sheep setup` asks nothing: it installs the skill here and its
report's `home:` line says whether a home is reachable.

`sheep home` reports the kennel, the home, whether it answers, and which
credentials are kept (never a value); `--home <url>` or `SHEEP_HOME`
selects another for one command. `sheep home delete` is the shepherd's,
and so is a second machine: `sheep setup` at their terminal there joins
the station the account already has.

## The kennel

The **kennel** is `.sheep/` at or above the working directory, found the
way git finds `.git`, and `~/.sheep` when there is none; `cd` is how you
switch. Your `sheep setup` makes a kennel only where no
home is reachable. If the command says `.sheep` is tracked, tell the
shepherd a token is in their repository; do not fix it yourself.

## The verbs

Every verb exits, and each has a `--json` form in pi's shapes. Errors go to
stderr as `sheep: …` with exit 2.

- `sheep new [--name <name>] [--pasture <name>] -- "<prompt>"` mints a
  sheep, prints `session <id>` on stderr, streams the reply on stdout, and
  exits when the turn ends.
- `sheep new --detach -- "<prompt>"` returns before the first token, the
  id the first line of stdout: this is how you start several at once. With no prompt it mints
  and prints the id alone, idle until asked; a pastured one is cloned and
  set up at its first prompt, not at the mint.
- `sheep -c -- "<prompt>"` is `attach` on the newest sheep.
- `sheep attach <id> -- "<prompt>"` sends a prompt and streams the reply.
  To a busy sheep it is queued behind the running turn: `queued <id>` on
  stderr, exit 0, or with `--wait` the queued turn streams when it starts.
  With `--json` the turn's entries stream as they land, one pi entry per
  line, tool calls included, and the last assistant entry is still the last
  line.
- `sheep ls [--pasture <name>]` lists the home's sheep, one per line,
  tab-separated: id, name, created, lane state (`idle`, `running`, `waiting`),
  pasture, secret names.
- `sheep status <id>` is the lane now: `state`, the open `operation`, the
  last `tool` call, `tokens` so far, `messages`, and last `setup`, what
  the pasture's `setup.sh` is doing: `none`, `running (1m 40s)`, `ok (1m
  52s)`, `failed (exit 1, 12.4 s)`.
- `sheep wait [--timeout <seconds>] <id>...` blocks until every named
  sheep is idle and prints each one's last assistant message,
  `<id>\t<message>`. Exit 124 on timeout, with what finished. Read several
  in one call; do not poll. A held `wait`, prompt, or `abort` survives the
  home's restart: it attaches again and says so once on stderr.
- `sheep abort <id>` stops the open turn and prints `<id>\taborted <op>`,
  or `<id>\tidle` with none.
- `sheep rm <id>` ends a sheep and prints `<id>\tended`: its turn aborted,
  what it held released, its rows gone, the pasture kept. No undo.
- `sheep log [--since <entry id | ISO time>] [--last <n>] <id>` prints the
  transcript, oldest first, tool calls and results included, with a
  `[setup]` block where each `setup.sh` ran: how it ended and the tail of
  what it printed. A model call a restart cut off ends `[error] <why>`.
- `sheep export <id> [file]` writes the session as a pi SQLite file
  (`<id>.sqlite` by default).

A sheep has pi's tools: `read`, `write`, and `edit` on a workspace in its
cell, and `bash` with the usual text tools. With a container the
shell has `git`, `node`, `pnpm`, and `python` too, and `~` is kept with
the sheep, except `~/.cache`, `~/.npm`, and caches like `node_modules`.

On a home with eyes a sheep sees what it wrote: `look <path>` renders a
workspace page in Chromium and prints errors, console, and the
accessibility tree beside a `look.png` it can `read`; the report is in
`sheep log`. `sheep home` says whether the home has them. With a
container, `look --serve 'npx vite --port $PORT --strictPort' /` runs
that command with `PORT` set, renders the page its port serves, and stops
it; the recipe for a frontend app is the skill
`docs/projects/serve/skills/frontend/SKILL.md`, for a pasture.

## Pastures: a herd on one tree

A pasture is a shared tree a herd works on, with a repository behind it
or none; a sheep born into it sees the tree and what every sheep on that
repository should know.

- `sheep pasture new <name> [--repo <url> | --repo .] [--branch <branch>]`
  makes one and prints `<name>\t<repo>\t<branch>`. `--repo .` reads this
  checkout's `origin`, uploading nothing.
- `sheep pasture ls` lists pastures; `sheep pasture <name>` prints the
  meta, the `cache:` line, then the herd.
- `sheep pasture ls <name> [path]` lists the tree, a directory with its
  slash; `cat <name> <path>` prints a file, `put <name> <path> [file]`
  writes one or stdin, whole, and `rm <name> <path>` removes one.
- `sheep pasture secret set <name> <KEY>` reads the value from stdin,
  never an argument (`GIT_TOKEN` is what a sheep pushes with); `secret ls
  <name>` prints the names, never a value.
- `sheep new --pasture <name> --secret <NAME> --detach` gives one sheep a
  secret of its own, one line of stdin per `--secret`, in order, laid over
  the pasture's of that name and ended with the sheep; `sheep ls` shows
  names, never values.
- `setup.sh` in the tree runs once per fresh container. Its `npm install
  -g` lands in `/cache`, which the pasture keeps for that exact script and
  puts back first next time, so write `command -v <tool> >/dev/null ||
  npm install -g <spec>`. A changed `setup.sh` runs cold once; a turn's
  own installs are never kept.

## A sheep that is slow

A first command in a fresh container waits for its pasture's `setup.sh`,
which can be minutes. A held prompt says `setup running (1m 40s)` on
stderr within ten seconds of setup starting, again every half minute, and
once when it ends; stdout is the reply and nothing else. `sheep status
<id>` from another terminal answers in about a second from the sheep's
row, which speaks while the cell cannot. `sheep log <id>` has the `[setup]` block, with the tail of
what setup printed. Wait while it says `running`; read the block when it
says `failed`. A sheep with no `setup.sh` says `setup: none` and none of
this.

## How to herd

Split the goal, give each piece to a sheep with `--detach`, keep working,
then `sheep wait` on all of them and read what came back. Name sheep
(`--name docs`) so `sheep ls` reads. Read `sheep log <id>` before deciding
a sheep failed. A sheep you are finished with is ended with `sheep rm
<id>` (`sheep export <id>` first if the transcript matters).

## What needs a person

1. **A home, and the two values it needs.** When `sheep home` says there
   is none, or a command exits 2 with a paragraph that begins `for the
   shepherd:`, give the shepherd that paragraph as it is and do nothing
   else toward it: it names their one sitting, `sheep setup` at their own
   terminal. Never ask for a token or a key in the chat.
2. **Ending the station.** `sheep home delete` wants the station's name
   typed at their terminal; give them the command.
3. **A hand at a terminal.** `sheep new` or `sheep attach <id>` with no
   prompt opens pi's interactive terminal; tell the shepherd the command
   and the id.

Ask for each in one sentence, saying what it unlocks, and go on with what
does not need it.
