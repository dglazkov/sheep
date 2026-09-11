# Earmark — the design

**11 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **a sheep's secret is a row beside the sheep's
row in the Directory: given at the mint, laid over its pasture's by name
wherever the pasture's are read, and removed with the row.**

The shepherd's issue #5: the dog mints a sheep that has to carry a
credential of its own, a token minted for that one sheep that no other
sheep in the pasture should hold. The pasture is the right place for the
brief, the skills, and the setup script the herd shares, and the wrong
place for this secret, because a pasture's secrets are setup's
environment in every fresh container born there. Today the dog's only
move is a pasture per sheep, which turns the herd's shared tree into a
per-sheep envelope and copies the brief and the setup script N times.
What the dog expects: `sheep new --secret <NAME>` reads the value from
stdin, never an argument, and the name is environment for this sheep's
setup runs and for nothing else, the rule pasture secrets have; `sheep
ls` or `sheep status` says which names a sheep carries, never a value;
ending the sheep ends the secret; pasture secrets stay as they are, and
a sheep's lies over them by name.

Pasture already has the two places a secret is read, and both read at
the moment of use and keep nothing. Setup's `run` frame carries the
pasture's secrets, all but `GIT_TOKEN`, read from the pasture's object
when setup runs (`CellExecutionEnv.warm`, pasture phase 4). The broker
hands over the pasture's `GIT_TOKEN`, read at each credential request,
with the home's `PEN_GIT_TOKEN` behind it (`pastureMinter`,
pasture phase 3). An earmark is a third source in front of each, read
the same way. What the project decides is where the value lives.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a sheep's secret | a name and a value given at the mint | the Directory's `session_secrets (session_id, name, value)` |
| the mint with secrets | `POST /sessions` with `secrets: { NAME: value }`; the rows and the sheep's row in one call | `index.ts`, `Directory.create` |
| the lay-over | the sheep's over the pasture's, by name, at the moment of use | `cell.ts`: setup's secrets and the minter |
| the verb | `sheep new --secret <NAME> …`, one line of stdin per name | `cli.ts` |
| the names | `sheep ls`'s last column; `"secrets"` in `--json` | `Directory.list`, `cli.ts` |

## The secret lives in the Directory

The value is needed before the sheep's first boot is over: the birth is
the first boot (mint phase 0), and the birth's clone asks the broker and
its `setup.sh` reads setup's environment. So the value has to exist from
the mint, and mint's one rule is that a mint touches the Directory and
nothing else. The Directory it is.

It is the right place for the rest of the issue too. `sheep ls` reads
the Directory and never boots a cell, so the names come from the query
the rows already come from. The end's last step is `Directory.remove`
(end phase 0), and the secret rows go in the same call as the sheep's
row, so ending the sheep ends the secret with nothing to forget. The
Directory is one object per home, as the home's own secrets are one
environment per home and a pasture's are one object per pasture; all
three are the home's to hold, behind its token.

The other places were weighed. The cell's storage would need the mint to
address the cell, undoing mint phase 0, and `ls` would boot every cell
to name what it carries. The pasture's object, keyed by sheep, leaves a
sheep born into no pasture without a home for its `GIT_TOKEN`, and the
end would have to reach a second object to remove it.

`session_secrets` is created by the Directory's constructor with `IF NOT
EXISTS`, as `pastures` was: a home deployed before this project gains
the table on its next boot and no migration. `Directory.secrets(id)` is
an RPC method for the cell and has no route: `GET /sessions` carries
names, never a value, and no route anywhere returns one, the rule
pasture's routes already keep.

## The mint with secrets

`POST /sessions` takes `secrets`, an object of name to value. The
Worker refuses before the row: a name that is not an environment
variable's, a value that is not a non-empty string of one line, and any
name but `GIT_TOKEN` on a sheep with no pasture, since a pastureless
sheep has no setup and its secret would reach nothing. Every refusal is
a sentence and a 400, as the pasture's are. `Directory.create` inserts
the sheep's row and its secret rows in one method with no await between
them, so no reader sees one without the other. The answer is the row as
`ls` has it, with `secrets` its sorted names.

Nothing else is asked at the mint: no cell, no container, no pasture
object. A mint with secrets is still one Directory call, and its cell's
storage after it still holds no table.

## The lay-over

**Setup's environment.** At each setup run, the pasture's secrets but
`GIT_TOKEN`, then the sheep's but `GIT_TOKEN` over them by name, both
read then. The env's `pasture` option already takes a `SetupSecrets`
whose `secrets()` is asked at the run; the cell hands it one that asks
the pasture's object and the Directory and merges, so the env is
unchanged. A secret set on the pasture later is read by the next fresh
container, as today.

**The broker.** For a sheep in a pasture: its own `GIT_TOKEN`, then the
pasture's, then the home's `PEN_GIT_TOKEN`, each read at the request.
For a sheep in no pasture: its own, then the home's. The host rule is
unchanged: the repository's when the pasture has one, else
`PEN_GIT_HOST`. The log line gains `from this sheep` beside `from pasture
<p>` and `from the home`; the refusal names all three places it looked.
The birth's clone goes through the helper like any git command, so a
repository only the sheep's token can read is cloned with it.

**What does not change.** The model's own commands run with no secret,
the sheep's no more than the pasture's. Pasture's plain limit holds for
both: a secret setup writes to disk is readable by the sheep that reads
the file, and a secret setup writes into `/workspace` is synced out to
rows like anything else setup writes there.

## The verb

```
sheep new [--name <n>] [--pasture <p>] --secret <NAME> [--secret <NAME> …] (--detach | -- <prompt>)
```

The values are stdin, one line per `--secret`, in the order the names
were given; a final newline ends the last line and `\r` before one is
dropped. A value is one line: tokens are, and the rule that a line per
name is the whole format keeps a second format out of the guide.
Refused before anything is asked of the home, exit 2, nothing on
stdout: stdin a terminal (the pasture's sentence: the value is stdin,
never an argument, pipe it in); a count of lines that is not the count
of names, or an empty line; a bad name, or a name twice; a name but
`GIT_TOKEN` with no `--pasture`; `--secret` where pi's terminal would
open, since the terminal needs the stdin the values were read from; and
`--secret` on `attach` or `-c`, since a sheep's secrets are given at its
mint.

What it prints is what `new` prints without it: the id, alone with
`--detach`, and the stream with a prompt. A home older than the CLI is
not guarded against: there is one station, and it is upgraded with the
release (the shepherd, 11 Sep 2026).

## The names

`sheep ls` gains a sixth column, last: the sheep's secret names joined
by commas, empty for none. A dog reading the first five by index is
unchanged, as pasture's column was added last for the same reason. `ls
--json` rows gain `"secrets": [<names>]`, sorted, `[]` for none. The
herd's rows are the same summaries, so `sheep pasture <p> --json` and
the program's JSON carry the names too; the herd's text is unchanged.
Names are not values, and a sibling that sees `GIT_TOKEN` in a row
learns that the dog gave that sheep a token and nothing else.

`sheep status` is unchanged. Its `--json` is pi's lane snapshot, its
text is the lane's, and both come from the cell; the names are the
Directory's, and `ls` is the Directory's verb. The issue asked for one
of the two.

## What this does not do, on purpose

- **Setting or rotating a secret after the mint.** The rows are read at
  each use, so a `sheep secret set <id> <NAME>` is one route and one
  verb when a dog needs one; a sheep is short, and the issue's journey
  gives the secret at the mint.
- **A secret in the model's environment.** Never, for either kind: the
  rule is pasture's and stays.
- **A multi-line value.** One line per name. A value that needs lines
  can be base64 and decoded by setup.
- **`sheep status` naming the secrets.** `ls` does.
- **Per-sheep files in the pasture's tree.** A sheep's `/workspace` is
  its own already; the tree is the herd's.
