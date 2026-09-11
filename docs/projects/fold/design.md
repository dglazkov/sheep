# Fold — the design

**11 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **what outlives the container is rows: a sheep's
`~` beside its workspace in the cell, synced as the workspace is, and a
pasture's `/cache` in the pasture's object, put back before setup and
kept after it.**

A fold is where a flock spends the night. Two of the shepherd's issues
ask for one, and the shepherd ranked them together: state that outlives
the container.

Issue #2: a pasture's `setup.sh` installs a command-line tool with `npm
install -g`. Setup runs once per fresh container, and a container is
forgotten after the idle period, so the first turn of every sheep after
a quiet night pays for the install again: two minutes of a three-minute
turn on a station, before the model says a word. The global prefix is
the container's disk, not the workspace and not the pasture, so nothing
warm survives. What the dog expects: a cache the pasture owns, put into
every fresh container before setup runs and found on `PATH` after it, or
a pasture image; `sheep pasture <name>` saying what is cached; `sheep
log` for a birth saying whether setup found its tools warm.

Issue #6: setup, or a turn, configures a tool that keeps its state under
`~`: a login, a credential, a config. After the idle period the container
is gone and `~` with it; the workspace survived because it is rows. The
dog's workaround is a symlink into the workspace, a trick every pasture
has to know. What the dog expects: `~` synced as the workspace is, under
the same per-file cap, out of the way of the model's `ls` unless asked,
or a mounted place with `HOME` pointing at it; `sheep log` for a birth
saying which.

## What exists, exactly

- **The container is a cache with a lifetime** (pen's design). The rows
  are the truth, and the checkout is synced by hash: a manifest in, the
  bytes the container lacks, a `changed` out after every run.
- **The manifest already has two roots.** The workspace, both ways, and
  since pasture phase 3 the pasture's tree, in only, read-only. The dance
  is the same for each: whoever holds the newer tree describes it, the
  other side asks for the bytes it lacks.
- **Setup runs once per container** (pasture phase 4): `sh
  /pasture/setup.sh` in `/workspace`, after the sync-in, with the
  pasture's secrets and a sheep's own laid over them (earmark), before
  the container's first command, or after a birth's clone. The socket's
  record, `Lease.warmed`, is how the cell knows.
- **`~` is two places today.** The cell's shell sets `HOME=/workspace`
  and resolves `~` there; the container's `HOME` is the image's, `/root`,
  which the router keeps by not sending one. Neither survives the other.
- **The platform keeps no disk.** A container's disk is its instance's
  (4 GB on `basic`, the station's type) and goes with it. The platform's
  one way to persist is a FUSE mount of an R2 bucket, which needs the
  bucket's credentials inside the container, the one thing pen's
  container never holds, and a bucket per home, which `sheep home deploy`
  does not make. An image is fixed per container application at deploy,
  so a pasture image is a deploy per pasture.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a sheep's `~` | `/home/sheep`, `HOME` in the container and in the cell's shell | the cell's files table, a third root beside `/workspace` and `/tmp` |
| the home rule | what stays in the container under `~`: `.cache`, `.npm`, and the cache rule's built-in names at any depth | `protocol.ts`, beside `BUILT_IN_IGNORES` |
| the pasture's cache | `/cache` in the container: npm's global prefix, its `bin` on `PATH` | the pasture's object, as chunks of one record |
| the record | the cache as one byte stream: every entry under `/cache`, sorted by path, each its path, kind, mode, and bytes | written and read by the agent |
| a chunk | 8 MiB of the record, named by its hash, a `blob` like any other | `cache_chunks` in the pasture's object |
| the key | the hash of the `setup.sh` whose run left the cache | the cache's row |

## `~` is a root

A sheep's home directory is `/home/sheep` in the container and in the
cell's shell, and its files are rows in the cell's files table, a third
root beside `/workspace` and `/tmp`. The manifest carries it as a root of
its own, both ways: synced in before every run with the workspace, walked
by the sync-out after every run with the workspace, written by the cell
one row at a time, whole, as the workspace is. Setup is a run, so what
setup writes under `~` is kept too. `sheep rm` empties the cell's storage
(end phase 0), so the end takes `~` with nothing added.

This is the issue's first option, and the second one's `HOME` pointing
at a kept place comes with it: the image's `HOME` is `/home/sheep`, and a
tool's own default paths land there without a symlink. `/home/sheep` is
empty in the image, as `/workspace` is, so a sync-in's rule (anything the
manifest does not name is deleted, except what the rule keeps) has
nothing of the image's to delete.

**The cell's shell agrees.** On a home with a container, `HOME` in the
cell's shell is `/home/sheep` and `~` resolves there, so `cat
~/.config/gh/hosts.yml` reads the same file in the shell and in the
container, and pi's `read`, `write`, and `edit` take `~` the same way. On
a home with no container nothing changes, byte for byte: no program runs
there that keeps state, and the no-container prompt is a literal in a
test.

**The home rule.** Under `~`, what is a cache by convention stays in the
container and never syncs back, and a sync-in never deletes it: `.cache`
and `.npm` at the root of `~`, and the cache rule's built-in names
(`node_modules`, `.venv`, `dist`, `build`, `__pycache__`) at any depth.
There is no `.gitignore` under `~` to read: `~` is not a repository, and
a second rule file is a second format for the guide. A tool that keeps a
login under `~/.cache` loses it, as today; the finding would name it.
Files over the per-file cap are refused by name in the tool result, as
the workspace's are, with `~/` in front of the path.

**Out of the way.** `ls /workspace`, `git status`, `find .` in the
checkout, and the herd's view never show `~`: it is not under
`/workspace`. `ls -a ~` does. The prompt's sentence on what syncs back
gains one clause: `~` is kept the same way, except `~/.cache` and
`~/.npm`.

**Why rows in the cell, and not the symlink.** The workspace is a
repository, and the checkout's `.gitignore` is the model's to change: a
login written to `/workspace/.tool-home` is one `git add -A` from a
commit. The cell's rows have every property the issue asks for already:
whole at every point the container can die, synced per command, capped
per file, read by the shell without a container, and ended with the
sheep. What changes is the number of roots.

**The plain limit.** A credential a tool writes under `~` is now a row
in the cell's storage for the sheep's life, where before it lived for
the container's. That is the point of the issue, and it is the pasture's
limit made longer, not a new one: the file is readable by the sheep that
reads it, the cell is the home's behind its token, and the end removes
it. `sheep export` carries the transcript, not files.

## The pasture's cache

`/cache` is a directory in every container, empty in the image. npm's
global prefix is `/cache` (`NPM_CONFIG_PREFIX` in the image) and
`/cache/bin` is on the image's `PATH`, so the issue's own line, `npm
install -g <spec>` in `setup.sh`, installs into it, and every command
after finds the tool. Another ecosystem is pointed at it by its own
prefix flag; the image sets npm's because the issue's tool is npm's.

For a sheep in a pasture whose tree has `setup.sh`, `/cache` is the
pasture's: put back into each fresh container before setup runs, and
kept after a setup that exits 0. What the model's own commands put there
goes with the container, as today: the cache is what setup leaves, so it
changes when the herd's warm-up changes and not when one sheep
experiments. For a sheep in no pasture, or a pasture with no `setup.sh`,
`/cache` is the container's, as `/usr/local` was.

**Why not under `/pasture`.** The tree is the dog's and the herd's
files, live per tool call, read-only, in every manifest. The cache is
setup's bytes, whole, once per container, written by setup alone. The
issue's `/pasture/cache` would put a thousand-file install into every
manifest and every `ls /pasture`.

**The key.** The cache belongs to the `setup.sh` whose run left it: its
row records that script's hash, and a fresh container gets the cache
only when the tree's `setup.sh` has the same hash. A dog that changes
setup to install something else, or another version, gets a cold setup
once and a new cache after it, with nothing to remember to clear. The
cost is one cold setup for a typo fixed; the gain is that a cache never
answers for a script that did not make it.

**Put back.** The first sync-in into a fresh container carries the
cache when the pasture has one for the tree's `setup.sh`: its hash and
its chunks' hashes. The agent asks for each chunk, one `need` at a time,
writes the record's entries under `/cache` as they arrive, and says
`checkout` when the workspace, `~`, the tree, and the cache are all on
its disk. One at a time is the rule: a Durable Object has 128 MB, a
WebSocket's `send` has no backpressure, and the cell reads each chunk
from the pasture's object and passes it on, so it never holds more than
one. A later sync-in on the same socket carries no cache: the container
has it. A chunk the object no longer has is a cache that moved under
the restore; the agent empties `/cache`, setup runs cold, and the log
says so.

**Kept.** After a setup that exits 0, the cell asks the container to
describe `/cache`. The agent writes the record to its own disk in
chunks, hashes each, and answers with the record's hash, the chunks', and
a count of files and bytes. The same hash as the cache it was given
means setup changed nothing, and nothing moves; this is the warm path,
every fresh container after the first. Otherwise the cell asks for the
chunks the object lacks, one `need` at a time, puts each to the object,
and commits: the chunk list, the key, the counts, the time, and the sheep,
in one transaction. The object keeps the committed cache and the one
before it; a commit deletes the chunks of any older one and of any save
begun more than an hour ago and never committed. A restore racing one
save still finds its chunks; racing two, it runs cold, as above. Two
sheep saving at once: the last commit wins, whole.

**Why a record, and not files.** The workspace's shape, a row per file
synced by hash, is wrong here three ways. An install is thousands of
files, and a manifest per fresh container of thousands of lines is paid
at the moment the issue is about. A tool ships binaries over the 8 MiB
cap (the `workerd` binary wrangler installs is many times it), and a WebSocket message
is at most 32 MiB. And the cache is read whole and written whole, never
a file at a time. So it is one stream, cut into chunks the protocol
already carries as blobs.

**Why the agent's own record, and not tar.** The fake container in
workerd is `agent.ts` over a disk in memory, and a proof of the restore
must run the agent's own code there (pen's rule). The record is the
agent's: sorted by path, each entry a JSON line with its path, kind,
mode, and size, then its bytes; no mtime and no owner, so the same tree
is the same bytes and an unchanged install hashes the same. Nobody else
reads it.

**The cap.** A cache over 1 GiB is not kept: the station's instance has
4 GB of disk and 1 GiB of memory, and the record, the chunks, and the
tree are on that disk together while a save runs. Setup's result is
unchanged; the cell's log and the birth's entry say the cache was not
kept and why.

**A sheep's own secret stays its own.** The cache is every sheep's in
the pasture, so a setup whose environment held a sheep's own value
(earmark: any of its secrets but `GIT_TOKEN`, which setup never sees)
puts the cache back and never keeps it; the log names the reason, never
a value. Otherwise a token one sheep's setup wrote into `/cache/etc/npmrc`
would be in its siblings' containers the next morning. The pasture's own
secrets are every sheep's setup environment already.

## What the dog sees

**`sheep pasture <name>`** gains one line after `created:`:

```
cache: 148 MB, 5210 files, for setup.sh 3f2a1c9, kept 2026-09-12T14:02:11Z by <id>
cache: none
```

`none` when there is no cache, or none for the tree's `setup.sh` now; a
cache for an older script is named as `cache: none for this setup.sh (an
older one's, 148 MB, goes at the next save)`. `--json` gains `"cache":
{"bytes", "files", "setup", "keptAt", "by"}` or `null`. The route is
`GET /pastures/<name>`, which reads the object's row and never a chunk.

**`sheep log` for a birth.** The birth's entry, which the model reads
too, gains two sentences after setup's. One for `~`: its home directory
is `/home/sheep` and is kept with the session. One for the cache, when
the tree has `setup.sh`:

- warm: the pasture's cache for this `setup.sh` was put back first, 148
  MB in 3.1 s;
- cold: the pasture had no cache for this `setup.sh`, so setup ran
  cold, and what it left in `/cache` was kept, 148 MB;
- or cold and not kept, with the reason: over the cap, or a sheep's own
  secret in setup's environment.

The entry's data gains `cache`, `{found: "warm" | "cold", bytes, files,
ms}` and `kept` or `refused`, so `sheep log --json` has the numbers. A
pasture with no repository has no birth, and the cell's log lines say
the same for each fresh container: `[pen] cache warm, 148 MB in 3100
ms`.

## The image

`HOME=/home/sheep`, `NPM_CONFIG_PREFIX=/cache`, `/cache/bin` first on
`PATH`, both directories made empty. `COREPACK_HOME=/opt/corepack` before
`corepack prepare`, since corepack keeps the pnpm it prepared under
`~/.cache` by default, and a `~` that starts empty would make the first
`pnpm` of every container a download. The agent gains two disks, `~` and
`/cache`, as the pasture gave it its second (`PEN_HOME`, `PEN_CACHE` for
a test on a machine without them).

## What this does not do, on purpose

- **A pasture image.** The issue's second option. An image is a deploy
  of a container application on the platform, so it would be a deploy
  per pasture and a registry push per `setup.sh`; the cache is rows the
  home has already.
- **A volume on the local home.** Docker has them and the station does
  not; one mechanism for both homes, so the walk on the laptop proves
  the station's.
- **Dropping the cache by hand.** A changed `setup.sh` is a cold cache;
  a byte is enough. `sheep pasture cache rm <name>` is one route when a
  dog needs one.
- **Keeping what the model installs.** The cache is setup's.
- **`~` shared by a pasture.** A login is a sheep's; what the herd
  shares is the tree and the cache.
- **Prefixes for other ecosystems.** npm's is the image's; pip, pnpm,
  and cargo take `/cache` by their own flags, and the brief can say so.
- **`~` on a home with no container.** Nothing there keeps state.
