# Fold: implementation phases

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
`/conduct fold` is the procedure. Phase citations name their project:
`fold phase 1`, never a bare "phase 1".

**One rule for this project.** What is kept is whole, and it is kept
where the design says and nowhere else: a sheep's `~` in its own cell,
the pasture's cache in the pasture's object. A proof that finds a row
under `~` half written, a cache that mixes two saves, a cache in a
sibling's container that a sheep's own secret shaped, or a chunk in a
cell's rows has found the bug, not a detail.

---

**Where we are: 11 Sep 2026. Fold phases 0 and 1 CLOSED; phase 2 NOT
STARTED.** A sheep's `~` is `/home/sheep`, a third root of rows synced
both ways around every run; a pasture's `/cache` is chunks of one record
in its object, keyed by `setup.sh`, put back one chunk per `need` before
setup and kept whole after it. Both are proved in workerd against the
fake container; the image carries neither yet. Next is fold phase 2, the
image, the verbs, the docs, and the walk on the local home. Nothing
waits on a person until its account ring, one ⚑ step.

The order is dependency order. Phase 0 is `~`, which gives the agent and
the checkout their third root and the cell's shell its `HOME`. Phase 1
is the pasture's cache, which rides the first sync-in and setup's end.
Phase 2 is the image both need, the dog's verbs, the docs, and the walk.

**Deliberately open.** Postponed on purpose: a pasture image; a volume
on the local home; `sheep pasture cache rm`; keeping what the model's
own commands put in `/cache`; prefixes for pip, pnpm, and cargo; `~` on
a home with no container. Never: a cache kept from a setup that held a
sheep's own secret.

---

## Phase 0: `~` is a root

**Closes:** journey 2 steps 1 to 7 in the cell's terms, against the
fake container; nothing in the image or on the command line yet.

**Work:** `packages/pen/src/protocol.ts`: the manifest's third root,
`home`, paths relative to `~`, both ways; `changed` gains `home:
{entries, deleted}`; `HOME_IGNORES`, `.cache` and `.npm` at the root of
`~`, beside `BUILT_IN_IGNORES`, which apply there at any depth.
`packages/pen/src/agent.ts`: a third disk, `home`; the sync-in writes it
under the home rule and deletes what the manifest does not name and the
rule does not keep; the sync-out walks it beside the checkout and
reports it under `home`; what the agent knows is kept per root.
`packages/cell/src/workspace/files.ts`: `HOME_ROOT`, `/home/sheep`, a
root of the cell's files table. `packages/cell/src/pen/checkout.ts`: the
manifest's `home` from `files.manifest(HOME_ROOT)`, `need` answered for
it, its `changed` written one row at a time, whole, under
`/home/sheep`, a refusal over the cap named with `~/` in front.
`packages/cell/src/env/execution-env.ts`: on a home with a container,
the shell's `HOME` and the resolution of `~` are `/home/sheep`; with
none, both stay `/workspace`. `packages/cell/src/env/programs.ts`: the
clause on `~` in the sentence on what syncs back. Tests:
`packages/cell/test/fold-home.test.ts` in the checkout ring, listed in
`scripts/rings.mjs`: a run that writes under `~` and a fresh fake
container that reads it back; the cell's shell reading the same bytes
at `~`; `~/.cache`, `~/.npm`, and a nested `node_modules` staying in
the container that wrote them; a file over the cap refused by name;
nothing of `~` under `/workspace`; `DELETE /s/<id>` leaving the cell's
storage empty; the no-container prompt and `HOME` unchanged byte for
byte. `checkout.test.ts`'s kill test with rows under `~` in the
manifest. `packages/cell/test/fake-container.ts`: the fake gains the
`~` disk in memory, so the agent's own code is what the tests sync
against.

**Not this phase:** No image change, no `node.ts` wiring, no cache, no
CLI change, no doc outside the project, no walk on a home.

**Proof:** `pnpm test` exits 0 with the new file in the checkout ring
and the rings guard green; `pnpm --filter @sheep/cell typecheck` and
`pnpm --filter @sheep/pen typecheck` exit 0. Falsified by three
mutations, each failing the new tests and put back: the home rule not
applied (`~/.cache` syncs back); the sync-out skipping `~`; the cell's
shell resolving `~` to `/workspace` on a home with a container. **⚑**
none.

**Status: CLOSED.** 2026-09-11. Journey 2 steps 1 to 7 hold in the cell's terms against the fake container: a tool's state under `~` comes back in a fresh container, the cell's shell reads the same rows, the home rule keeps caches out, the end empties it, and a home with no container is unchanged; `pnpm test` exits 0 across all three rings; falsified by all three mutations.

**Findings:**

- **2026-09-11 — `~` is the pasture's root made two-way:** a third manifest root, per-root knowledge in the agent, one `need` by hash. Only `synced` gained a field, so a refusal under `~` comes back per root and is named `~/` in the tool result alone.
- **2026-09-11 — `/home/sheep` is a root only when the env has a container,** decided at construction from `options.container`, not the budget, which is momentary. A no-container cell has no `/home` row, its old fence sentence, and journey 6's literals unmoved.
- **2026-09-11 — The kill walk with `~` in the manifest covers 262 positions,** a row under `~` rewritten across two chunks among them; every row was its before or its after at each.
- **2026-09-11 — On a container home `ls /` lists `home tmp workspace`;** `/home` is a readable row, not a root, so nothing is written beside `sheep`.
- **2026-09-11 — A row the cell writes under a kept name** (pi's `write ~/.cache/x`) goes into the container and never comes back, as a `node_modules` row does in the workspace.
- **2026-09-11 — Mutations:** the home rule off fails five cases, the sync-out skipping `~` eight, the shell's `~` at `/workspace` four; the conductor reran the first and the third. Put back.
- **2026-09-11 — Open: until fold phase 2 the prompt says `~` is kept while the image's agent has no `~` disk and `HOME` is `/root`.** A release from `main` in between is not for the station; fold phase 2 closes it.
- **2026-09-11 — Open: `flock.test.ts`'s wire-turn case failed once in the full run** (`idle` for `running`, 9.7 s) and passed on the rerun and three runs alone; it does not touch `~`.

## Phase 1: The pasture's cache

**Closes:** journey 1 steps 1 to 7 in the cell's terms, against the fake
container; the birth entry's sentences; the pasture's route carrying
`cache`.

**Work:** `packages/pen/src/protocol.ts`: the manifest's `cache`, its
hash and its chunks' hashes; `cache {id}` from the cell, asking the
container to describe `/cache`; `cache {id, hash, chunks, files, bytes}`
from the container; `need`, `blob`, and `synced` reused, one hash per
`need` for a chunk; `CACHE_CHUNK_BYTES` (8 MiB) and `CACHE_MAX_BYTES`
(1 GiB). `packages/pen/src/record.ts`: the record, written from a disk
and read onto one as a stream, entries sorted by path, a JSON line and
the bytes each, no mtime or owner. `packages/pen/src/agent.ts`: a fourth
disk, `cache`, and a scratch for the chunks a description made; the
restore on a manifest's `cache`, emptying `/cache` first and asking for
one chunk at a time; the description on `cache {id}`; a chunk missing
from the cell as `/cache` emptied and the sync-in done.
`packages/cell/src/pasture.ts`: the cache's row (key, chunks, files,
bytes, kept at, by) for the committed save and the one before it;
`cache_chunks` in 1 MiB rows as the files table stores a file;
`cacheFor(setupHash)`, `cacheChunk(hash)`, `cachePut(save, hash, bytes)`,
`cacheCommit(save, …)` in one transaction, deleting what no kept save
names and what an hour-old uncommitted save put; `cacheSummary()`.
`packages/cell/src/pen/cache.ts`: the cell's side, passing chunks
between the socket and the object one per `need`, holding one at a
time. `packages/cell/src/env/execution-env.ts`: the first sync-in of a
socket carries the cache when the pasture has one for the tree's
`setup.sh` (the `Lease` records it); after a setup that exits 0, the
description and the save, skipped for a sheep whose setup held a secret
of its own (the setup source says so; `laidOver` in `cell.ts`), and for
a record over the cap; the log lines. `packages/cell/src/birth.ts`:
`cache` in the entry's data, the sentence for `~` and the sentence for
the cache. `packages/cell/src/index.ts`: `GET /p/<name>/` gains
`cache`. Tests: `packages/cell/test/fold-cache.test.ts` in the checkout
ring, in `setup.test.ts`'s and `birth.test.ts`'s shape: a pasture whose
`setup.sh` the fake's runner runs as a script that writes into `/cache`
when it finds it empty and records whether it did; the first sheep cold
and kept, the second warm and its script finding the files; a fresh
container of the first sheep warm; a changed `setup.sh` cold and kept
anew; the model's writes to `/cache` absent from the next container; an
earmarked sheep's setup never kept, the reason logged and no value; the
frame list with one chunk between two `need`s; a record over a lowered
cap not kept; a save cut off between chunks leaving the committed cache;
a restore racing one commit still whole; a pastureless sheep and a
pasture with no `setup.sh` sent no cache; after a mint, the cell's
storage holds no table; the birth entries' data and text; the route's
`cache` and no chunk in its body. The record in the same file, over the
fake's memory disk (`fake-container.ts` gains the `/cache` disk and the
scratch): a round trip with a symlink, a directory, modes, and a file
larger than a chunk; the same tree written twice is the same bytes.

**Not this phase:** No image change, no `node.ts` wiring, no CLI change,
no doc outside the project, no walk on a home.

**Proof:** `pnpm test` exits 0 with the new file in the checkout ring
and the rings guard green; both typechecks exit 0. Falsified by three
mutations, each failing the new tests and put back: the key ignored, so
a cache is put back for another `setup.sh`; an earmarked sheep's cache
kept; every chunk sent for the first `need`. **⚑** none.

**Status: CLOSED.** 2026-09-11. Journey 1 steps 1 to 7 hold in the cell's terms against the fake container: cold and kept, warm for a sibling and for a fresh container, cold again for a changed `setup.sh`, the model's installs gone with the container, an earmarked sheep's setup never kept; whole under a cut-off save and a racing commit, one chunk per `need`; `pnpm test` exits 0 across all three rings; falsified by all three mutations.

**Findings:**

- **2026-09-11 — The record's hash is the digest of its chunks' hashes, one per line:** neither side holds the whole record to hash it, and the same tree is the same chunks, so an unchanged install moves nothing.
- **2026-09-11 — The put-back rides the sync-in after the files,** and `checkout` waits for the last chunk; `checkout.ts` routes a `need` naming a chunk, `cache.ts` decides.
- **2026-09-11 — A chunk gone mid-restore is `error {of: "need"}` from the cell:** the agent empties `/cache` and says `checkout`, and setup runs cold; a restore racing two commits proved it.
- **2026-09-11 — A save claims every chunk it names, present ones too;** a commit deletes only what no kept save names and no claim under an hour holds, and refuses if a named chunk is gone.
- **2026-09-11 — An empty `/cache` is not kept,** and a save is refused when `setup.sh` changed after a cache was put back into that container.
- **2026-09-11 — Mutations:** the key ignored fails three cases, an earmarked cache kept one (rerun by the conductor), every chunk on the first `need` two. Under the last the restore still landed whole: only the frame list catches it. Put back.
- **2026-09-11 — Open: the record's writer and reader hold a whole file in memory,** since `Disk` has no append or ranged read; a binary of hundreds of MB, once on each side, against the instance's 1 GiB. Fold phase 2's walk with wrangler's `workerd` measures it.
- **2026-09-11 — Open: the inner rings time out under load.** The first full run failed `deploy.test.ts`'s retry and journey 5 on timeouts, the CLI ring taking 767 s; the rerun took 72 s and passed. Beside phase 0's `flock.test.ts`.

## Phase 2: The image, the verbs, and the walk

**Closes:** journeys 1 and 2 in full, journey 3.

**Work:** `packages/pen/Dockerfile`: `HOME=/home/sheep`,
`NPM_CONFIG_PREFIX=/cache`, `/cache/bin` first on `PATH`, both
directories made empty, `COREPACK_HOME=/opt/corepack` before `corepack
prepare`. `packages/pen/src/node.ts`: the `~` and `/cache` disks
(`PEN_HOME`, `PEN_CACHE`), the chunk scratch under `/tmp`.
`packages/pen/test/agent.test.ts`, the command ring's process test: the
record over `nodeDisk` with real files, an executable and a symlink among them, and
real `bash` writing under `~` and `/cache`. `packages/cli/src/pasture.ts`:
the `cache:` line after `created:`, the design's three forms; `--json`
as the route has it. `packages/cli/agent-guide.md`, `README.md`: `~` is
kept, what is not; `/cache` is the pasture's, setup's idiom guarded by
`command -v`, the key, what the model installs going with the container,
a sheep's own secret never kept; the guide within the word cap its test
counts, cut from elsewhere if it must. `packages/cli/test/journey5.test.ts`:
`sheep pasture <p>` prints `cache: none` and `--json` has `"cache":
null` (the home ring has no container). `scripts/hermetic.mjs`: the
account ring's new step, `f1`, after n1 and s1: a pasture on a public
repository whose `setup.sh` installs a small tool from npm guarded by
`command -v`; one sheep born cold and one born warm, each scripted by
the faux provider to run the tool; both birth entries read from `sheep
log --json` (cold and kept, then warm, with counts and seconds); `sheep
pasture --json` naming the cache for that `setup.sh`; both sheep ended
by the step with n1's check.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings, the home
ring's journey 5 carrying the line; `pnpm --filter @sheep/cli typecheck`
exits 0. Then the walk, journey 3 steps 1 and 2: the local home with
Docker (`sheep home local`, this checkout's image) and a real model,
from a scratch kennel, never the checkout; the cold and warm setups
timed, the restore and the save, the cache's size and chunk count, the
unguarded install tried warm; `~` across an idle period and a `docker
rm -f`. **⚑** journey 3 step 3: `pnpm hermetic --ring account --yes
<sha>` on a release whose image CI pushed, a station deployed and
deleted on the shepherd's account, a few container minutes and one
deploy; no token beyond the Cloudflare one.

**Status: NOT STARTED.**
