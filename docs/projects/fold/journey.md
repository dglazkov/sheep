---
status: partial
since: 2026-09-11
see: fold
note: "written 11 Sep 2026, the morning earmark closed, from the shepherd's issues #2 (a tool the pasture needs, installed once and not on every fresh container) and #6 (a home directory that survives the container), which the shepherd ranked together. A container is forgotten after its idle period, and with it npm's global prefix and `~`. Three phases: a sheep's `~` as a third root of rows in the cell, synced like the workspace; the pasture's `/cache` as chunks of one record in the pasture's object, put back before setup and kept after it, keyed by `setup.sh`; then the image, the verbs, the docs, and the walk. Fold phase 0 closed the same day: `~` as `/home/sheep`, a third manifest root synced both ways under the home rule, the cell's shell resolving `~` there on a home with a container, proved in workerd against the fake container and falsified by three mutations; the image does not carry it until fold phase 2. Fold phase 1 the same day: the pasture's `/cache` as chunks of the agent's own record in the pasture's object, keyed by `setup.sh`, put back one chunk per `need` in a fresh container's first sync-in and kept whole after a setup that exits 0, never from a setup that held a sheep's own secret; the birth's entry says `~` is kept and whether the cache was warm or cold; proved against the fake container and falsified by three mutations. Fold phase 2 the same day: the image's `HOME`, npm prefix, `PATH` and `COREPACK_HOME`, the agent's two disks and its scratch, the `cache:` line in `sheep pasture` and in the sheep's own `pasture`, the guide and README, journey 5's line, and the account ring's `f1`. Its walk found a warm put-back no faster than a cold install, which changed the design: the agent's socket offers no permessage-deflate (6.7 s of 8.6 were workerd deflating each 8 MiB chunk), a file with two names is written once (406 MB became 239), and an untouched cache is not re-described. Walked again after it: warm 1.85 s against a cold 9.8 s install, and journeys 1 and 2 whole on the local home with a real model, the conductor walking them once more himself. Journey 3 step 3 was walked on the account, `ok f1` on release 76809e8, and its acceptance was not met: the station put 239 MB back in 31.3 s against a 38.9 s cold install. Fold phase 3 answers it: the chunks are deflated where they are made and inflated where they land (wrangler's record travels as 63.2 MB), three fly at once, a chunk the container cannot use runs cold instead of failing a command, and a home upgraded across the change heals in one cold birth per pasture, walked on the local home. The account ring's second run waits on the shepherd."
---

# Fold — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. A sheep's container is rented for its
commands and forgotten after the idle period; the workspace survives
because it is rows. Two things did not: the tools a pasture's `setup.sh`
installs, and what a tool keeps under `~`. **A fold is where a flock
spends the night**: a sheep's `~` is rows beside its workspace, and a
pasture's `/cache` is kept by the pasture, so the morning's first turn
costs the model's time and not the package manager's.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against the fake container in workerd and
against a real one on a home. [design.md](design.md) is the mechanism
and [phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **A sheep's `~`**: `/home/sheep`, `HOME` in the container and in the
  cell's shell, kept as rows in the cell and synced both ways around
  every run, except `~/.cache`, `~/.npm`, and the cache rule's built-in
  names.
- **The pasture's cache**: what `setup.sh` left in `/cache`, npm's
  global prefix, kept by the pasture's object for the `setup.sh` that
  left it and put back into every fresh container of every sheep in the
  pasture before setup runs.
- **Warm** and **cold**: whether a fresh container's setup found the
  pasture's cache put back, or found `/cache` empty.
- **A fresh container**: the first one rented after the last one was
  forgotten, by its idle period, by a kill, or by a redeploy.
- **The fake container**: pen's, in workerd, reached through the same
  lease a real one is; the frames it was sent are a list a test can read.

## Journey 1: A tool installed once

The dog has a pasture on a repository whose `setup.sh` installs a
command-line tool the herd needs:

```sh
command -v <tool> >/dev/null || npm install -g <spec>
```

1. `sheep new --pasture <p> -- "run <tool> --version"`: the birth
   clones, finds no cache, and setup installs the tool into `/cache`;
   the turn runs it, found on `PATH`. `sheep log <id>` has the birth's
   entry saying the cache was cold and was kept, with its size.
2. `sheep pasture <p>` has `cache:` with the size, the file count, the
   `setup.sh` it is for, when it was kept, and by which sheep; `--json`
   has the same as `"cache"`.
3. A second sheep minted into the pasture and asked the same: its birth
   entry says the cache was warm, put back in so many seconds, and its
   setup did not install; the tool runs.
4. The first sheep, after its container is gone: its next command
   rents a fresh one, the cache is put back before setup, setup finds
   the tool, and the command runs it. Setup's own time is the check,
   not the install's.
5. The dog puts a changed `setup.sh` (`sheep pasture put`). The next
   fresh container finds no cache for it and runs cold, and the cache
   kept after it is for the new script; `sheep pasture <p>` names it.
6. The model's own `npm install -g <other>` in a turn lands in `/cache`
   and runs in that container; the next fresh container does not have
   it.
7. A sheep minted into the pasture with its own secret (`--secret
   PROBE`) gets the cache put back, and its setup's `/cache` is never
   kept: the cell's log names the reason and no value.

Acceptance criteria:

- The cache's bytes are in the pasture's object and in containers of
  sheep born into it, and nowhere else: no cell's rows, no route's
  answer, no transcript but the birth's counts.
- A mint still touches the Directory alone, as mint's rule says, and a
  sheep in no pasture, or in one with no `setup.sh`, is sent no cache.
- A cache is whole at every point: a restore sees the committed one or
  the one before it, never a mix; a save interrupted leaves the
  committed one.
- The cell passes the cache on one chunk per `need`, in both
  directions: the fake's frame list never has two chunk blobs between
  two `need`s.
- A cache over the cap is not kept, and the log says so; setup's result
  is unchanged.

## Journey 2: A tool that remembers who it is

A sheep on a home with a container.

1. A command writes a tool's state under `~`: `git config --global`,
   `npm config set`, or a file under `~/.config/<tool>`. `setup.sh`
   writing there is the same.
2. Its container goes. The next command rents a fresh one and the state
   is there: the tool knows who it is.
3. `cat ~/.config/<tool>/<file>` in the cell's shell, with no container
   involved, reads the same bytes; pi's `read` of the `~` path does too.
4. `ls /workspace`, `git status`, and the herd's view show nothing of
   it; `ls -a ~` does.
5. What a tool writes under `~/.cache` or `~/.npm`, or under a
   `node_modules` anywhere in `~`, is in the container that wrote it and
   not in the next.
6. A file over the per-file cap under `~` is refused by name in the
   tool result, `~/` in front of its path, and the command's other
   changes land.
7. `sheep rm <id>` ends `~` with the sheep: the cell's storage is empty
   after it.

Acceptance criteria:

- `~` is `/home/sheep` in the container and in the cell's shell on a
  home with a container; on a home with none, `HOME` is `/workspace` and
  the prompt is the no-container literal, byte for byte.
- The prompt says `~` is kept, and which parts are not, in the sentence
  that says what syncs back.
- Every row under `~` is whole at every point the container can die, as
  the workspace's are: pen's kill test holds with `~` in the manifest.

## Journey 3: The walk

The conductor wants the fold proved where a container is real and a
model answers.

1. On the local home with Docker and a real model, from a scratch
   kennel: a pasture on a public repository whose `setup.sh` installs
   wrangler guarded by `command -v`, the issue's shape. Journey 1 steps
   1 to 4: the cold birth's setup and the warm birth's setup timed and
   recorded side by side, the cache's size and the restore's seconds;
   the fresh container of step 4 got the way the issue gets one, by the
   idle period (the local home's is two minutes). The unguarded `npm
   install -g wrangler` is tried once warm, and whether npm redid the
   install is a finding.
2. On the same home, journey 2 steps 1 to 4 with a real tool's state
   (`git config --global`, `npm config set`) across an idle period, and
   once across a `docker rm -f` of the sheep's container.
3. The account ring's walk gains a step after n1, on a station whose
   sheep are ended and whose containers are gone: a pasture on a public
   repository whose `setup.sh` installs wrangler guarded by `command -v`,
   as step 1's; one sheep born cold, a second born warm, both birth
   entries read from `sheep log --json` with their counts and seconds,
   the two setups' seconds recorded side by side, `sheep pasture --json`
   naming the cache; the step ends both sheep. The put-back's chunk
   count, the bytes that travelled, and the share of it the cell spent
   reading from the pasture's object are printed with them, so a slow
   put-back names its own cause. **⚑** it deploys a station on the
   shepherd's account.

Acceptance criteria:

- The warm setup is the seconds the put-back takes plus the `command -v`,
  recorded beside the cold one's. On the station, where the link is the
  slow thing, a warm setup is a pass when it is a small part of the cold
  install; within a few seconds of it, as fold phase 2's ring run found
  (31.3 s against 38.9), is a finding against the design, not a pass.
- The walk's numbers are findings: the cache's size and chunk count,
  the restore's seconds on the laptop and on the station, the save's.
