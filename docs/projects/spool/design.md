# Spool — the design

**11 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **the agent moves a file through itself, never
into itself: the record is read and written in slices, so what the agent
holds is a chunk and not a file.**

Fold left one debt, and this is it. A pasture's cache is one record cut
into chunks of 8 MiB, and the chunks stream; a file inside the record
does not. The agent's `Disk` has two content methods,
`read(path)` and `write(path, bytes)`, and both take a file whole
(`packages/pen/src/agent.ts`). So `writeRecord` reads a whole file to
put it into the record (`record.ts`, the `body = await disk.read(…)`
line), and `RecordReader` allocates a buffer of the file's size and
fills it across chunk boundaries before one `disk.write` lands it. What
the agent holds at its peak is one whole file, a chunk, gzip's buffers,
and node's own baseline.

Fold phase 3's walk measured that on wrangler's cache: 470 MiB at the
cold save, 354 to 376 MiB at a put-back, on an instance with 1 GiB. The
largest file in it, `workerd`, is about 155 MB. A tool whose largest file
is several hundred MB — Playwright's browsers, a CUDA toolchain — is not
an unusual thing for a herd's `setup.sh` to install, and it does not fit.

## What it costs when it does not fit

The agent is PID 1 in the container. Out of memory is the process dying,
the socket closing, and the cell settling the command as interrupted,
which is pen's journey 3 and works as designed. What does not work is
the next turn: a fresh container runs setup cold, installs the same tool,
describes `/cache`, and dies at the same file. The sheep's every first
turn is an interruption, and the cache that would have made the tool warm
is the thing that cannot be made. A pasture can be stuck there, and
nothing in the cell says why.

**The cap does not save it.** `CACHE_MAX_BYTES` is 1 GiB over the whole
record, and the check runs after the read: `writeRecord` reads the file,
adds its length to the running total, and only then asks whether the
total is over. A single 700 MB file is inside the cap and outside the
memory, so the cap refuses trees that would have fitted and never sees
the one that kills the process.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a slice | a piece of a file the size of a chunk, read or written on its own | `record.ts` |
| the reading handle | a file opened for reading, asked for slices in order, closed at the end | `Disk.openRead`, optional |
| the writing handle | a file opened for writing with its mode, appended to, closed at the end | `Disk.openWrite`, optional |
| the fallback | `read` and `write`, for a disk with no handles: the shape fold shipped | `record.ts` |

## Slices, both ways

**Into the record.** `writeRecord` asks the disk for a reading handle,
writes the header from the size the listing already gave it, and then
reads slices of a chunk's size and hands each to the sink in turn. The
sink is the chunker, which is unchanged: it cuts at chunk boundaries
wherever the slices fall. A file that grows or shrinks between the
listing and the read is a record whose header and body disagree, which is
what `RecordError` is for, and the save is refused rather than committed.

**Out of the record.** `RecordReader` opens a writing handle when a
header lands and appends each chunk's slice of the body as it arrives,
closing the handle at the last byte. Nothing of a file's size is ever
allocated. Directories, symlinks, and links are unchanged: their bodies
are a path or a target, and both are small.

**A put-back that is abandoned closes what it opened.** A chunk the
container cannot use ends the put-back where it stands, and `/cache` is
emptied (fold phase 3); with a handle open on the file the record was in
the middle of, unlinking the file does not free it, and the several
hundred megabytes this project is about stay allocated in the container
behind a descriptor nobody holds any more. So the reader can be
abandoned as well as ended: whoever drops a put-back closes the handle
first, and `/cache` going empty means what it said.

**The mode is the handle's.** A writing handle takes the mode at open, so
a file is never briefly readable by more than it should be, and the
`0555` directories the record restores are set at the end as they are
now.

**A disk without handles still works.** Both are optional on `Disk`, and
`record.ts` falls back to `read` and `write` when a disk has neither, so
a disk that cannot stream is slower to no one's surprise and correct.
`nodeDisk` has them over `node:fs` file handles; the tests' memory disk
has them over its `Map`, because the fake container is the agent over a
different disk and the streaming path must be the one the cell's tests
exercise (pen's rule).

## The cap comes first

`writeRecord` asks the listing for a file's size, adds the header and the
body to the running total, and refuses before it opens the file. The
refusal is what fold phase 1 wrote — the cache is not kept, setup's
result is unchanged, the log and the birth's entry say so — and it now
happens without reading a byte. A file whose size the listing does not
give is read in slices and counted as it goes, and the refusal comes at
the slice that crosses the cap.

## What this does not do, on purpose

- **A per-file cap on `/cache`.** The record's total is the cap, and
  after this the memory does not care how one file compares to another.
- **Streaming the workspace or `~`.** Both refuse a file over 8 MiB by
  name, which is a smaller number than this project is about, and their
  rows are whole-file by construction in the cell.
- **Streaming into the cell.** The cell holds at most three chunks, 24 MB
  of a Durable Object's 128, and that was never the problem.
- **A bigger chunk.** 8 MiB is a quarter of a WebSocket message and the
  unit the object stores; this project changes what a chunk costs to
  make, not what it is.
- **Deciding what a station's memory should be.** `basic` is the
  station's instance and 1 GiB is what it has; this makes the agent's
  peak a constant instead of a tool's largest file, which is the part
  sheep owns.
