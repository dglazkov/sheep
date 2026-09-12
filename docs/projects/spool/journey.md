---
status: partial
since: 2026-09-11
see: spool
note: "written 11 Sep 2026, the evening fold closed, from fold phase 3's open debt: the agent holds a whole file in memory, 470 MiB of an instance's 1 GiB on wrangler's cache, because `Disk` reads and writes a file whole. A tool whose largest file is several hundred MB would take the process, and every fresh container would die at the same file. Two phases: slices both ways behind optional handles on `Disk`, with the cap checked before the read; then the image, the walk with a file too big for the old shape, and the ring's step. Phase 0 closed the same day: the record streams both ways in the cell's terms, over a disk that throws for any whole file, and makes the same bytes as the disk with no handles at all; the cap refuses without a read, and a dropped put-back closes the file it was in the middle of. The image, the peak from `/proc`, and the walks are phase 1's, and they wait on the shepherd."
---

# Spool — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. Fold gave a pasture a cache: one record,
cut into chunks, put back into every fresh container before setup. The
chunks stream and a file does not — the agent reads a file whole to put
it in, and allocates its size to take it out. **A spool passes what it
carries**: the record moves through the agent in slices, so what it holds
is a chunk, whatever the file.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against the fake container in workerd and
against a real one on a home. [design.md](design.md) is the mechanism
and [phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **A slice**: a piece of a file the size of a chunk, read or written on
  its own.
- **The handles**: `openRead` and `openWrite`, optional on the agent's
  `Disk`; a disk with neither is served by `read` and `write`, as fold
  shipped.
- **The peak**: the agent process's highest memory while it works, read
  from the container itself (`VmHWM` in `/proc/1/status`).
- **The fake container**: pen's, in workerd, reached through the same
  lease a real one is; the frames it was sent are a list a test can read.

## Journey 1: A tool with a binary too big to hold

The dog has a pasture whose `setup.sh` installs a tool whose largest file
is far larger than a chunk — a browser bundle, a toolchain — and larger
than the agent could hold beside its own baseline.

1. The first sheep's birth runs setup cold, and the cache is kept: the
   entry says cold and kept, with the record's bytes and files, and
   `sheep pasture <p>` names it.
2. A second sheep's birth finds it warm: the cache is put back, setup
   finds the tool, and the tool runs in the turn.
3. The agent's peak, in both containers, is near its baseline plus a
   chunk, and nowhere near the largest file. The largest file is whole
   and right on the disk afterwards: its bytes hash as they did before.
4. A file's mode and its hard links survive as they did in fold: an
   executable is executable, and a file with two names is one file.

Acceptance criteria:

- The peak does not follow the largest file. Doubling the largest file
  leaves the peak where it was, within noise.
- Nothing else about the cache changes: the same record, the same chunk
  count, the same hashes as the whole-file shape would have made, so a
  cache kept before this project is still put back after it.
- A disk with no handles (the memory disk of a test that withholds them)
  makes the same record, byte for byte.

## Journey 2: The cap refuses before the memory is spent

The dog has a pasture whose `setup.sh` leaves more in `/cache` than the
cap allows.

1. The cache is not kept, the reason is the cap, and setup's own result
   is unchanged: the sheep's command runs and its turn ends normally.
2. The container is alive afterwards: the next command in the same
   container runs, and the socket never closed.
3. The refusal happens without reading the file that would have crossed
   the cap: the agent's peak stays near its baseline.
4. A file whose size the disk's listing does not give is counted as its
   slices arrive, and the refusal comes at the slice that crosses.

Acceptance criteria:

- No frame of the save moves after the refusal, and the pasture's cache
  is what it was.
- The birth's entry and the cell's log say the cap, as fold phase 1
  wrote them.

## Journey 3: The walk

The conductor wants it proved where the container is real and the memory
is the platform's.

1. On the local home with Docker and a real model, from a scratch
   kennel: a pasture whose `setup.sh` puts a file of several hundred MB
   in `/cache` beside a small tool, incompressible so the chunks do not
   hide it. Journey 1 steps 1 to 4, with the agent's peak sampled from
   `/proc/1/status` through the cold save and the warm put-back, and
   recorded beside fold phase 3's numbers (470 MiB save, 354 to 376 MiB
   put-back, on wrangler's 155 MB largest file).
2. The same pasture with the file made twice as large: the peak is where
   it was, and the turn still ends normally.
3. The account ring's walk gains a step after f1, on a station whose
   sheep are ended: a pasture whose setup leaves a file larger than the
   station's instance could have held, one sheep born cold and one born
   warm, both turns ending normally and the cache named; the step ends
   both sheep. **⚑** it deploys a station on the shepherd's account.

Acceptance criteria:

- On the station, a tool the old shape could not have cached is cached,
  and no turn of the step is an interruption.
- The peak is a finding in every walk: the number, and the largest file
  it was carrying.
