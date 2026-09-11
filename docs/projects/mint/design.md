# Mint — the design

**10 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **minting and prompting are two acts: `sheep new
--detach` with no prompt mints a sheep, prints its id, and exits, and
nothing else happens until something is asked of it.**

A dog wants a sheep's id before it has anything to say to it: to record
the id, to give the sheep something, or because the first prompt is
composed by another program that needs a session to address. Today the
only way to an id without pi's terminal is `sheep new --detach -- "<prompt>"`,
which sends a prompt to get one, so the dog pays a model turn for an
identifier and the real first prompt queues behind it. The shepherd's
issue #3 says what the dog expects instead: `sheep new --detach` with no
prompt mints, prints the id as the first line of stdout, and exits; the
sheep is idle; no model call is made; and a sheep born into a pasture is
not cloned and set up at the mint.

Two of those three are nearly true already. `detach()` in `cli.ts`
prints the id and returns when there is no prompt, undocumented, and
`sheep ls` reads the Directory, where the row is `idle` with no task
until the first prompt reports one. What is not true is the third, and
it is the one that costs: `POST /sessions` boots the cell before it
answers, and a cell's first boot is where the birth runs (pasture phase
3), so a mint into a pasture with a repository rents a container, clones,
and runs `setup.sh` before the dog sees an id. The boot at mint is
lamb's, from when the cell's own session row was what made a session
exist; the Directory's row has been the session since lamb phase 5's
`ls`, and the boot has been paid for nothing since.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the mint | `POST /sessions`: one row in the Directory, no cell touched | `index.ts` |
| the first boot | `SessionCell.runtime()`, lazy, the birth inside it, as after an eviction | `cell.ts`, unchanged |
| the verb | `sheep new --detach` with no prompt: the id alone on stdout | `cli.ts`'s `detach` |
| the refusal | `--detach` with no prompt on `attach` and `-c`: nothing to send | `cli.ts` |

## The mint is a row

`POST /sessions` inserts the row and answers it. The Directory's
refusals stay where they are, before the row: a bad pasture name, a
pasture the home does not have, a birth into a pasture with a repository
on a home with no container. Nothing else is asked at the mint: no cell
is addressed, no storage is opened, no container is rented, no model is
called. The answer is the row, `{ id, name, createdAt, state: "idle",
pasture, task: null }`, in a few milliseconds whatever the pasture.

The cell already boots on first use: `runtime()` is lazy, and every
incarnation after an eviction has booted this way since lamb phase 2. A
minted sheep's cell is an incarnation that has not booted yet, and its
storage holds nothing, not a table: the same state the end leaves
(end phase 0), which is why `sheep rm` of a minted, never-asked sheep
finds no runtime to abort, no terminal to close, no container to
destroy (the starter is asked, and the fake's count stays at zero), and
empties a storage that is empty. `ls` and `rm` are the two verbs that
never boot a cell.

## The first boot is the birth

The birth stays what pasture phase 3 made it: what a cell does on its
first boot into a pasture with a repository, before the first prompt is
taken, the clone and then `setup.sh` in one container, the tail on the
lane as the `birth` entry. Only when the first boot happens moves: from
the mint to the first thing that asks the cell for its runtime. That is
the first prompt, over HTTP (`sheep attach <id> --detach -- "…"`) or the
wire (pi's terminal, sheep's own client), and it is also `status`,
`wait`, `log`, and `export`, which read the lane. A dog that wants the
birth done before its first prompt can ask `sheep status <id>` and wait
for it; a dog that does not care sends the prompt, and the prompt is
taken after the entry is on the lane, as it is today. The issue's words
are "the first command that needs a container"; the first boot is the
nearest thing to that the cell can keep honest, since a birth deferred
past the boot would land its entry mid-turn or run the model over an
empty workspace, and pasture phase 3's rule is that the model reads the
birth before it reads the first prompt.

The wait the dog paid at the mint is paid at the first prompt instead,
by whoever sends it: `home.prompt` is one HTTP request that returns once
the operation is durable, and for a pastured sheep that is after the
birth, as `POST /sessions` was. No request grows longer than the mint
was; one moves.

## The verb

`sheep new [--name <name>] [--pasture <name>] --detach`: the mint, then
the id on stdout, one line, exit 0, nothing on stderr. With a prompt
after `--`, what it does today: mint, send, the id first. `--json` with
no prompt adds nothing: the id is the id, and `sheep ls --json` has the
row. `sheep new` with neither `--detach` nor a prompt is pi's terminal,
for a person, as before; there is no `--idle`, since `--detach` already
means "give me the id and go", and a second flag for the same act would
be the one the guide has to explain.

On `attach` and `-c`, `--detach` with no prompt is refused: `sheep:
--detach with no prompt is sheep new's; there is nothing to send`, exit
2. Today it prints the id it was given and exits 0 without asking the
home anything, which is a success that did nothing. And `detach` with a
prompt sends before it prints, so that on an ended id the refusal is the
whole output: end phase 1 left that open, since `detach` printed first.
For `new` the order is the same and cannot matter: the id was minted a
moment ago.

## What this does not do, on purpose

- **A verb that boots without prompting.** `sheep status <id>` is that
  verb for a dog that wants the birth done early; a `sheep warm` would
  be a second name for it.
- **`state`, `transcript`, and `export` answered without a boot.** An
  unbooted cell and an evicted one are the same empty runtime, and a
  marker to tell them apart would exist to save one boot on a sheep the
  dog is about to use.
- **Giving the sheep something at the mint.** A secret for one sheep is
  issue #5; a file in its workspace before the first prompt has no verb
  yet. Both want the id first, which is what this project gives them.
- **A name minted by the home.** `--name` is the dog's; a sheep with
  none has none, and `sheep ls` prints the empty column as it does.
