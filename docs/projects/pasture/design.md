# Pasture — the design

**6 September 2026.** Design. Nothing built. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.

The thesis in one line: **a sheep should be born knowing where it is: the
repository, the notes the sheep before it left, the skills its dog keeps,
and who else is grazing.**

Today a sheep is born knowing nothing. Lamb gave it a cell with an empty
workspace; pen gave it a container to clone into; recast gave the command
its name. Every task the dog hands a sheep starts with the same
paragraph: here is the repo, here is how to build it, here is what the
last sheep found. The dog writes that paragraph from its own memory, the
sheep learns it, and when the sheep is done the learning goes nowhere. A
second sheep on the same repo starts from the same paragraph. The
paragraph is the thing this project makes a place for.

A **pasture** is that place. The dog makes one, gives it a repository, and
puts in it what every sheep on that repository should know: a brief, a
setup script, skills, notes. A sheep is born into a pasture, or into none.
Born into one, it wakes up in a clone, with the brief in its prompt, the
tree at `/pasture`, a `pasture` program that says who else is here, and
one way to leave something behind for the next sheep. A sheep born into
none is the sheep lamb built, byte for byte.

## The names

"Workspace" is taken. It is the cell's own tree, `/workspace`, one per
sheep, rows in the cell's table since lamb. A pasture is a level above:
one tree that many sheep see, kept in its own object. The word is the
repo's own vocabulary. Sheep graze a pasture; a pasture has a herd.
"Field" collides with databases and forms; "fold" with the function;
"flock" names the sheep and not the place, and the place is the thing.

| Word | What it is | Where it lives |
| --- | --- | --- |
| pasture | a shared tree, a repository, secrets, and the sheep born into it | one `Pasture` Durable Object per pasture, addressed by name |
| the tree | the pasture's files: brief, setup, skills, notes | `files` rows in the pasture's object, mounted read-only at `/pasture` in every sheep of it |
| the herd | the sheep born into a pasture, and what each was asked | the directory's `sessions` rows, by their `pasture` column |
| the brief | `/pasture/BRIEF.md`, into every sheep's system prompt | a file in the tree, by convention |
| setup | `/pasture/setup.sh`, run in each fresh container | a file in the tree, by convention |
| skills | `/pasture/skills/<name>/SKILL.md`, pi's format, listed in the prompt | files in the tree, by convention |
| `pasture` | the program a sheep runs in tier 0: the herd, `put`, `rm` | a just-bash custom command in the cell |
| `sheep pasture` | the dog's verbs: `new`, `ls`, `cat`, `put`, `rm`, `secret`, the herd | the CLI, over `/pastures` and `/p/<name>/…` |

Everything a pasture carries that can be a file is a file, so that the
dog and the sheep have one way to look at it, `cat`, and one way to
change it, `put`. What cannot be a file is small: the repository's URL
and branch, and the secrets.

## What exists, exactly

- **The files table.** Lamb's `FilesTable` (`packages/cell/src/workspace/files.ts`)
  is a tree in SQLite with hashes, chunks, modes, and mtimes, rooted where
  its owner says. The pasture's object holds one, rooted at `/pasture`.
  Nothing new is written to store a tree.
- **`CellFs` is the one file seam.** just-bash sees the rows through it,
  and pi's `read`, `write`, and `edit` see them through the same
  `CellExecutionEnv` methods it backs. Every method is already async, so
  a second backing behind a path prefix, reached over a Durable Object
  hop, is a routing change and not a new file system.
- **The system prompt is built at every model call.** Lamb made it a
  function of what the home has now, so the tier-2 line is true after a
  budget is spent. A brief that is re-read at every call is the same
  shape, and it is what makes the tree live for free.
- **just-bash takes custom commands.** `new Bash({ customCommands })` is
  how a program with no binary joins tier 0. Pen's table
  (`packages/cell/src/env/programs.ts`) reads tier 0 from just-bash's
  registry, so a custom command is tier 0 without a row.
- **The checkout's manifest.** Pen syncs `/workspace` into a container by
  hash. A manifest with a second root, marked read-only, is how
  `/pasture` reaches the container's disk; the sync-out walk never
  enters it.
- **The broker's `Mint`.** Pen's credential broker answers a `credential`
  frame from the home's secret at the moment of the request. Where it
  reads from is one function, and the pasture is the first place it
  looks.
- **The directory.** One row per session, with the columns lamb and pen
  needed. It gains two: which pasture a sheep was born into, and what it
  was asked.
- **Pi's pieces.** `parseFrontmatter` is a leaf module of pi's coding
  agent and is imported, so a skill in the tree is parsed the way pi
  parses its own; `appendCustomMessageEntry` is how a birth's output
  becomes a transcript entry the model has and `sheep log` shows.
  `formatSkillsForPrompt` sits behind a module a Worker cannot load
  (pasture phase 1 found `config.js` calling `fileURLToPath` at its top
  level), so the cell makes the block itself, pinned byte for byte to
  pi's by a test, until one fork commit makes pi's a leaf.

## The object

`Pasture` is a Durable Object addressed by its name. Its SQLite holds:

- `meta`: `repo` (a URL or absent), `branch` (default `main`), `created_at`.
- the tree: lamb's `files` and `file_chunks`, rooted at `/pasture`, with
  the 8 MiB per-file cap the workspace has.
- `secrets`: name and value. `GIT_TOKEN` is the one the broker looks for;
  every other name is environment for the setup run and for nothing
  else.

The directory keeps `pastures (name, created_at)` so `sheep pasture ls`
does not have to guess names, and the `sessions` table gains `pasture`
(nullable) and `task` (the first line of the first prompt, trimmed,
reported by the cell the way it reports lane state). The herd of a
pasture is a query on the directory: id, name, state, born, task. The
directory computes it, and both the dog's verb and the sheep's program
print the same rows.

Routes, all behind the home's bearer token like everything else:
`GET`/`POST /pastures` on the directory; `/p/<name>` for the object:
`GET` (meta and the herd), `GET`/`PUT`/`DELETE /p/<name>/tree/<path>`,
`GET /p/<name>/tree` (the manifest), `PUT /p/<name>/secrets/<KEY>`, and
`GET /p/<name>/secrets` (names only, never values).

A Durable Object that nobody addresses costs nothing, and a pasture is
addressed when a sheep reads its tree or the dog changes it. Deploying
the class is one wrangler migration on each home, and the top-level
`sheep` home gets pastures too: a pasture with no repository is a brief,
notes, and skills, and none of that needs a container.

## The tree

`/pasture` is in every sheep born into the pasture, beside `/workspace`.
It is read-only everywhere a sheep looks: pi's `read` reads it; `write`
and `edit` refuse it with `EROFS` and the sentence "the pasture is
read-only; `pasture put <path>` writes to it"; `cat`, `grep`, `find`, and
the rest of tier 0 read it; the container gets it at `/pasture`, synced
in with the checkout, written with read-only modes, and never walked by
the sync-out.

**Live, per tool call.** At the start of each tool call that touches
`/pasture`, the cell asks the pasture's object for its manifest, one hop,
and fetches a file's content by hash when the call reads it, cached for
that call only. A note sheep A put a minute ago is in sheep B's next
`cat`. The brief is read at every model call by the same path. There is
no session-long snapshot to go stale, and no cache across calls to
invalidate. If a walk shows `grep -r /pasture` paying a hop per file, the
manifest already has the hashes a cache would key on; that is a finding,
not a design.

**One write path.** A sheep writes to the tree with `pasture put <path>
[file]`, a file from `/workspace` or stdin, and removes with `pasture rm
<path>`. The dog writes with `sheep pasture put <name> <path> [file]`.
Both are one `PUT` on the object, a whole file in one transaction, last
write wins. That the agent tools cannot write there is the point: leaving
something for the next sheep is an act, not a side effect of an edit, and
the brief and the setup script cannot be changed by a sheep that meant
to fix a typo in its own checkout.

The layout is convention, not schema:

```
/pasture/
  BRIEF.md            standing instructions; appended to every sheep's system prompt
  setup.sh            run by `sh` in each fresh container after the sync-in, before the first command
  skills/<name>/SKILL.md   pi skills, listed in the prompt; the sheep reads one with `read`
  …                   notes, findings, anything the sheep and the dog keep
```

## The program

`pasture` is a just-bash custom command in the cell, tier 0, present
only in a sheep that has a pasture:

- `pasture` or `pasture herd`: the pasture's name, repository, and
  branch, then one line per sheep in it: id, name, state, born, task.
  This sheep's own line is marked. The rows come from the directory,
  which is why a sheep that never wrote anything down still appears
  with what it was asked.
- `pasture put <path> [file]`: write `file`, a workspace path, or stdin
  when there is none, to `/pasture/<path>`.
- `pasture rm <path>`.

Reading is `cat /pasture/…`, listing is `ls /pasture`; the program does
not repeat what the shell has. The system prompt says the three verbs in
one sentence, and the table's prompt paragraph does not change: the
program is tier 0 because just-bash has it.

## Birth

`sheep new --pasture <name>` asks the directory for a session in that
pasture. The directory refuses a name it does not know, and refuses a
pasture with a repository on a home with no container, with the sentence
that says why and what would work: a pasture with no repository. The
refusal is the CLI's, before any cell exists.

A cell born into a pasture with a repository, on its first boot with an
empty workspace, rents a container and runs the birth: `git clone
--branch <branch> <repo> .` in `/workspace`, with the credential the
broker hands the helper from the pasture's `GIT_TOKEN`, then `setup.sh`
if the tree has one. The sync-out brings the clone into the rows, `.git`
included, as pen's journey 2 already relies on. The output's tail is
appended to the transcript as pi's `custom_message` entry, so `sheep log`
shows the birth and the model has it as context; a birth that fails says
so in the entry, leaves the workspace as the failure left it, and the
sheep is alive to be asked about it. The first prompt is taken after the
birth, so `sheep new --pasture <name> -- "<prompt>"` streams the birth
entry and then the turn.

A pasture with no repository has no birth. Its sheep wakes up with an
empty workspace, the brief, and the tree.

## Setup

`setup.sh` is the container's warm-up, and its cost is pen's shape: a
container is rented for the length of a command and forgotten, and the
cache rule keeps `node_modules` on the container's disk and out of the
rows. So setup runs once per fresh container, not once per sheep. A
sheep whose container went idle overnight gets a fresh one and runs
setup again, before the command that rented it. The brief should say
setup must be idempotent and fast on a warm checkout; `npm install`
against a lockfile is that, and a script that provisions something
remote is not.

Setup runs with the pasture's secrets, all but `GIT_TOKEN`, in its
environment, and the model's own commands run without them. Its output
is kept as the cell's log and shown to the model only when it fails: the
command it was warming up for is not run, and the tool result is setup's
output under a first line that says setup failed. The limit to say
plainly: a secret setup writes to disk, an `.npmrc` say, is readable by
the sheep that reads the file, in this harness as in any.

## Skills, and the brief

A skill is `/pasture/skills/<name>/SKILL.md` in pi's format, the Agent
Skills standard pi already follows. The cell does what pi's resource
loader does over a disk, over the tree: at each model call it lists
`skills/*/SKILL.md`, parses each frontmatter with pi's `parseFrontmatter`,
and appends pi's own `formatSkillsForPrompt` with the file's `/pasture`
path, so the model reads a skill it wants with `read`, the way pi's
prompt tells it to. A malformed skill is a line in the prompt naming the
file and the fault, not a crash.

The brief, `/pasture/BRIEF.md`, is appended to the system prompt whole,
after the cell's own lines and after the pasture paragraph that names
the pasture, its repository, `/pasture`, and the program's three verbs.
Re-read at every call: the dog can change the brief while a sheep runs,
and the sheep's next turn has it.

## Secrets, and the credential

`sheep pasture secret set <name> <KEY>` reads the value from stdin and
`PUT`s it; the value is never an argument, so it is in no shell history
and no `ps`. The dog is an agent, and a value the dog reads from a file
is in the dog's transcript; a value the shepherd pipes from a password
manager is not. `sheep pasture secret ls` prints names.

Pen's broker gains one lookup: for a sheep in a pasture, the pasture's
`GIT_TOKEN` is the value handed over, and the home's `PEN_GIT_TOKEN` is
the fallback, for pastureless sheep and for pastures without one. The
frame, the helper, the once-per-push hand-over, and the one-minute
`expires` are pen's, unchanged. Tokens are the wrong tool in the long
run: a GitHub App that mints per push, per repository, is the shepherd's
stated direction, and it is a project of its own. This project makes the
place the App's minted credential will be looked up from, and the
lookup is the one function it will replace.

## The dog's verbs

```
sheep pasture new <name> [--repo <url> | --repo .] [--branch <branch>]
sheep pasture ls
sheep pasture <name>                         meta and the herd
sheep pasture ls <name> [path]               the tree, or a directory in it
sheep pasture cat <name> <path>
sheep pasture put <name> <path> [file]       from a file, or stdin
sheep pasture rm <name> <path>
sheep pasture secret set <name> <KEY>        the value from stdin
sheep pasture secret ls <name>
sheep new --pasture <name> …
sheep ls [--pasture <name>]                  gains a pasture column, last, empty for a pastureless sheep
```

`--repo .` is for the dog, which stands in a repository nearly every time
it mints a pasture: the CLI runs `git remote get-url origin` where it
stands and stores that URL. Nothing local is uploaded; the sheep clones
from the remote. No remote is a sentence, not a guess. A pasture's name
is `[a-z0-9-]+`, since it is a Durable Object name and a column value
the herd view prints.

`sheep ls` gaining a column is the one change a pastureless dog sees.
`--json` carries `pasture: null`.

## The sheep that has no pasture

`sheep new` without `--pasture` is lamb's sheep: no `/pasture`, no
`pasture` program, the system prompt the cell built before this project,
byte for byte, held as a literal in a test the way pen's journey 6 holds
the no-container sentence. The herd view, the tree, the brief, and the
program exist only when the directory's row names a pasture.

## What this does not do, on purpose

- **A GitHub App.** Above. The broker's lookup is the seam it will use.
- **Sheep talking to each other.** The tree is a mailbox already; `put`
  a note, and the next sheep's `cat` has it. Messaging is designed when
  a walked journey shows the files are not enough.
- **A cache for the tree.** Live and uncached, per tool call, until a
  walk says otherwise; the hashes are in the manifest when it does.
- **Moving a sheep between pastures.** A pasture is where a sheep was
  born. A sheep that should be elsewhere is a new sheep.
- **What each sheep pushed.** The herd view is what the directory knows.
  The brief can ask a sheep to `put` a note naming its branch; the
  broker knowing branches is a later finding.
- **The pasture as its own container, or its own model settings.** A
  container is a cell's, rented per command; a pasture is files and a
  name. Defaults per pasture are a property when a journey wants one.
- **Sheep-side `cat` and `ls` in the program.** The shell has them.
