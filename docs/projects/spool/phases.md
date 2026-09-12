# Spool: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node; the fake container is what a cell test talks
to; pi is a dependency; findings are one dated line of about forty
words; `main` stays sources only and a phase's proof runs in a ring;
steps marked **⚑ provision** create, change, or delete a cloud
resource, spend money, or need a login, and are asked out loud first.
`/conduct spool` is the procedure. Phase citations name their project:
`spool phase 0`, never a bare "phase 0".

**One rule for this project.** The peak is the proof. A change that
makes the record stream but leaves one path that still takes a file
whole — a fallback the real disk reaches, a link's body, a header's
buffer — has not done the work, and the number from the container says
so. Every proof here reads the agent's own memory rather than the shape
of the code.

---

**Where we are: spool phase 0 closed, 11 Sep 2026.** Next is spool
phase 1, the image, the memory, and the walk, NOT STARTED, and it waits
on the shepherd: the walk needs a local home with Docker and a real
model, and journey 3 step 3 is the account ring's one ⚑. What phase 0
left standing: the record moves in slices both ways behind optional
handles on `Disk`, the cap is asked of the listing before a file is
opened, and a put-back that is dropped closes the file it was in the
middle of — proved in workerd over a disk that throws for any whole
file, and byte for byte the same record as the disk with no handles at
all. Nothing waits on work.

The order is dependency order. Phase 0 is the record in slices, which is
all of the mechanism. Phase 1 is the image, the walk where the memory is
a real container's, and the ring.

**Deliberately open.** Postponed on purpose: a per-file cap on `/cache`;
streaming the workspace or `~`, both capped at 8 MiB a file; a bigger
chunk; what a station's instance should be. Never: a record whose bytes
depend on how they were carried.

---

## Phase 0: Slices, both ways

**Closes:** journey 1 steps 1 to 4 and journey 2 steps 1 to 4, in the
cell's terms, against the fake container; nothing in the image yet.

**Work:** `packages/pen/src/agent.ts`: `Disk` gains optional
`openRead(path)` and `openWrite(path, mode)`, each a handle with the
methods the record needs and a `close`; the interface says plainly that
a disk with neither is served by `read` and `write`.
`packages/pen/src/record.ts`: `writeRecord` takes each file's size from
the listing, refuses at the cap **before** it opens anything, and
otherwise reads slices of `CACHE_CHUNK_BYTES` through a reading handle
into the sink, counting as it goes for a listing that gave no size; a
file whose length disagrees with its header is a `RecordError` and the
save is refused. `RecordReader` opens a writing handle when a file's
header lands, appends each chunk's slice of the body, and closes at the
last byte; no buffer of a file's size is allocated anywhere, directories,
symlinks, and links unchanged. `packages/cell/test/fake-container.ts`:
the memory disk gains both handles, so the cell's tests exercise the
streaming path. Tests: `packages/cell/test/spool.test.ts` in the checkout
ring, listed in `scripts/rings.mjs`: a record whose largest file is many
chunks, made and put back through a disk whose `read` and `write` throw
for anything over a chunk — the proof that no path takes a file whole —
and byte for byte the same record as the same tree through a disk with
no handles at all; journey 2's cap refused before a byte is read (the
disk counts its reads), with the pasture's cache unchanged and the
container answering the next frame; a file that changes length under the
writer; modes, an executable, a symlink, and a hard-linked pair.

**Not this phase:** No image change, no `node.ts` handles, no walk on a
home, no doc outside the project.

**Proof:** `pnpm test` exits 0 with the new file in the checkout ring and
the rings guard green; `pnpm --filter @sheep/cell typecheck` and `pnpm
--filter @sheep/pen typecheck` exit 0. Falsified by three mutations, each
failing the new tests and put back: the reader allocating the file's size
again; the writer reading the file whole again; the cap checked after the
read. **⚑** none.

**Status: CLOSED, 11 Sep 2026.** The record streams both ways over a
disk that throws for any whole file, makes the same bytes as the disk
with no handles at all, refuses the cap without a read, and closes its
handle on all three paths that drop a put-back.

**Findings:**

- **2026-09-11 — The cap taken from the listing costs no reading at all.** An over-cap `/cache` counted 0 reads and 0 bytes on the disk, where fold's shape read every file before refusing; the refusal the cell logs is fold phase 1's, unchanged.
- **2026-09-11 — The later name of a hard-linked pair was the last whole-file path,** copied through `read` and `write` on a disk without `link`; only a disk that refuses a whole file found it, not a reading of the diff.
- **2026-09-11 — A streaming reader must be abandonable, not only endable.** Three paths drop a put-back and empty `/cache`; an unlinked file with a descriptor still on it keeps its blocks, and PID 1 outlives the put-back. The design gained it (`722b260`).
- **2026-09-11 — A memory disk's reading handle must look its entry up at each slice** rather than capture the bytes at open, as a descriptor reads the file and not a copy; that alone makes a file changing length under the writer provable in workerd.
- **2026-09-11 — A listing with no size needs two passes, count then stream,** because a header precedes its body; `nodeDisk` and the memory disk both give sizes, so that path is the edge and not the road.
- **2026-09-11 — Mutations, all four run by the conductor:** the reader buffering a file again fails five cases, the writer reading one whole four, the cap after the read two, the three `abandon` calls removed three. Put back.

## Phase 1: The image, the memory, and the walk

**Closes:** journeys 1 and 2 in full, journey 3.

**Work:** `packages/pen/src/node.ts`: `nodeDisk` gains both handles over
`node:fs` file handles, the writing one taking its mode at open.
`packages/pen/test/agent.test.ts`, the command ring's process test: a
real `/cache` whose largest file is several chunks, described and put
back through a real disk, its bytes and mode right afterwards, and the
process's own `VmHWM` read before and after — the number the phase is
for. `scripts/hermetic.mjs`: the account ring's new step, `f2`, after
f1: a pasture whose `setup.sh` writes a file larger than the agent could
once have held, beside a small tool; one sheep born cold and one born
warm, each scripted by the faux provider to run the tool and stat the
file; both turns ending normally, the cache named, both sheep ended with
n1's check; the peak, read from the container, printed with them.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings; the three
typechecks exit 0; `node --check scripts/hermetic.mjs` exits 0. Then the
walk, journey 3 steps 1 and 2: the local home with Docker (`sheep home
local`, this checkout's image) and a real model, from a scratch kennel,
never the checkout; a pasture whose `/cache` holds an incompressible file
of several hundred MB; the agent's peak sampled through the cold save and
the warm put-back and recorded beside fold phase 3's; then the file
doubled and the peak unmoved. **⚑** journey 3 step 3: `pnpm hermetic
--ring account --yes <sha>` on a release whose image CI pushed, a station
deployed and deleted on the shepherd's account, a few container minutes
and one deploy.

**Status: NOT STARTED.**
