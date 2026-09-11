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

**Where we are: fold is done, 11 Sep 2026. All four phases CLOSED.** A
sheep's `~` is `/home/sheep`, rows synced both ways around every run; a
pasture's `/cache` is chunks of one record in its object, keyed by
`setup.sh`, deflated on the wire, put back before setup and kept whole
after it. The image carries both, `sheep pasture` names the cache, and a
birth's entry says whether setup found it warm. Journeys 1 and 2 are
walked on the local home with Docker and a real model, journey 3 on the
account: the ring the shepherd typed on release 5e9ebd2 put wrangler's
cache back in 8.5 s against a 56.4 s cold install, `ok f1` among 32
steps, none skipped. Nothing waits on work and nothing on a person.

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
- **2026-09-11 — Until fold phase 2 the prompt said `~` is kept while the image's agent had no `~` disk and `HOME` was `/root`,** so a release from `main` in between was not for the station. Paid by fold phase 2.
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
(`PEN_HOME`, `PEN_CACHE`), the chunk scratch under `/tmp`; the socket
dialled with `ws`, pinned exactly in `packages/pen/package.json`, with
`perMessageDeflate` off. `packages/pen/src/record.ts`, `agent.ts`: a file
with two names written once, the later name a `link` entry (the `Disk`
says which entries share a file: `nodeDisk` by inode, the memory disk
never); the put-back's stat of what it wrote kept, and a description
after setup that finds `/cache` exactly so answered with the hash given
and no record written.
`packages/pen/test/agent.test.ts`, the command ring's process test: the
record over `nodeDisk` with real files, an executable and a symlink among them, and
real `bash` writing under `~` and `/cache`, a hard-linked pair among
them restored as one file with two names; a warm description after an
untouched put-back writing nothing to the scratch. `packages/cli/src/pasture.ts`:
the `cache:` line after `created:`, the design's three forms; `--json`
as the route has it. `packages/cli/agent-guide.md`, `README.md`: `~` is
kept, what is not; `/cache` is the pasture's, setup's idiom guarded by
`command -v`, the key, what the model installs going with the container,
a sheep's own secret never kept; the guide within the word cap its test
counts, cut from elsewhere if it must. `packages/cli/test/journey5.test.ts`:
`sheep pasture <p>` prints `cache: none` and `--json` has `"cache":
null` (the home ring has no container). `scripts/hermetic.mjs`: the
account ring's new step, `f1`, after n1 and s1: a pasture on a public
repository whose `setup.sh` installs wrangler guarded by `command -v`,
as the walk's; one sheep born cold and one born warm, each scripted by
the faux provider to run the tool; both birth entries read from `sheep
log --json` (cold and kept, then warm, with counts and seconds, the two
setups' seconds printed side by side); `sheep
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

**Status: CLOSED.** 2026-09-11. Journeys 1 and 2 are walked whole on the local home with Docker and a real model; the image carries `~` and `/cache`, `sheep pasture` names the cache, the guide and README say both, and `pnpm test` exits 0 across all three rings. Journey 3 step 3 was walked twice on the account: `ok f1` on release 76809e8 failed its acceptance (31.3 s against 38.9), and on release 5e9ebd2, after fold phase 3, it holds.

**Findings:**

- **2026-09-11 — The image carries the fold:** `HOME=/home/sheep`, `NPM_CONFIG_PREFIX=/cache`, `/cache/bin` first on `PATH`, and `COREPACK_HOME=/opt/corepack` for pnpm.
- **2026-09-11 — After the design change a warm setup is 1.85 s on the laptop against a 9.8 s cold install,** where it was 10.4 against 10.2: the put-back 1.82 s, the record 239 MB in 29 chunks against 406 in 49.
- **2026-09-11 — The conductor walked it too:** wrangler cold in 10.6 s kept 239 MB, a second sheep put it back in 1824 ms, `~` held across a `docker rm -f`.
- **2026-09-11 — `ws` is pen's second dependency (8.21.0), offering no `Sec-WebSocket-Extensions`,** and an untouched warm cache is never re-described: a fresh container left the row's `by` and `keptAt` alone.
- **2026-09-11 — The scratch is made before the dial:** `mkdtemp` between it and `serveAgent` could drop a manifest, and hung the process test once.
- **2026-09-11 — Open: two tier-2 commands in one turn collide on the checkout's one sync** (pen phase 1's rule); the collision re-saved an identical record, moving the row's `by`. Pen's to fix.
- **2026-09-11 — Open: the agent peaks at 512 MiB on a cold save,** holding one whole file; wrangler fits the instance's 1 GiB and a larger binary would not.
- **2026-09-11 — The account ring is green on release 76809e8, `ok f1` among its steps:** the station kept wrangler's 239 MB cold, put it back for a second sheep, and named it; 11 sheep minted and ended, the station deleted.
- **2026-09-11 — Open: on the station the put-back is 31.3 s against a 38.9 s cold install,** 239 MB at about 7.6 MB/s where the laptop takes 1.8 s. Journey 3 calls that a finding against the design, not a pass; fold phase 3 answers it.

## Phase 3: Fewer bytes, and three in flight

**Closes:** journey 3 step 3's acceptance, walked again on the account;
journeys 1 and 2 stay as fold phase 2 walked them.

**Work:** `packages/pen/src/record.ts`, `agent.ts`: each chunk gzipped
where it is made and inflated where it lands, with `CompressionStream`
and `DecompressionStream`, which workerd and Node both have, so the fake
runs the agent's own code; **the chunk's hash stays over its plain
bytes**, so a zlib that packs differently changes no identity and an
unchanged install still hashes the same. `protocol.ts`: what a chunk's
`blob` carries is the deflated form and `size` is its length; a `need`
for the cache may name up to three chunks, answered in the order asked.
`packages/cell/src/pen/cache.ts`, `checkout.ts`: the window of three in
both directions, the cell holding at most three; the put-back's time
split into the whole and the part spent in `cacheChunk`.
`packages/cell/src/pasture.ts`: the stored (deflated) length beside the
record's own, so `cacheSummary` still reports the tree's bytes.
`packages/cell/src/birth.ts`: the entry's `cache` gains `chunks`,
`stored`, and `read`, and `sheep log --json` carries them.
`scripts/hermetic.mjs`: `f1` prints them beside the two setups' seconds.
Tests: `fold-cache.test.ts` for the round trip through a deflated chunk,
a plain-bytes hash that a different packing does not move, a `need` of
three answered in order, and never a fourth blob before the next `need`;
`agent.test.ts` for the real container's round trip.

**Not this phase:** No change to what is kept or when; no new verb.

**Proof:** `pnpm test` exits 0 across all three inner rings; the three
typechecks exit 0. Falsified by two mutations: a hash taken over the
deflated bytes (an unchanged install becomes a new record), and a fourth
chunk sent before its `need`. Then the walk on the local home with
Docker and a real model, wrangler as before, the put-back's seconds and
the record's stored bytes recorded beside fold phase 2's. **⚑** journey
3 step 3 again: `pnpm hermetic --ring account --yes <sha>` on a release
whose image CI pushed, a station deployed and deleted on the shepherd's
account, a few container minutes and one deploy.

**Status: CLOSED.** 2026-09-11. The chunks are deflated and three fly at once; `pnpm test` exits 0 across all three rings, the three typechecks and `node --check` exit 0, and three mutations each fail the new tests. The upgrade case is walked on the local home, and journey 3 step 3 holds on the account: the ring the shepherd typed on release 5e9ebd2 put wrangler's cache back in 8.5 s against a 56.4 s cold install, `ok f1` among its 32 steps.

**Findings:**

- **2026-09-11 — wrangler's record deflates to 26%:** 63.2 MB travels against 239 MB of tree, in the same 29 chunks; `sheep pasture` still reports the tree's size.
- **2026-09-11 — A chunk's hash is its plain bytes',** so a chunk another zlib repacked is the same chunk; the container checks it on restore, since the cell cannot.
- **2026-09-11 — gzip grows incompressible data,** so what travels is capped at a chunk and 64 KiB.
- **2026-09-11 — A chunk the container cannot use ends the put-back, not the sheep's command:** `/cache` empties, `error {of: "cache"}` says why, `checkout` completes the sync-in, and chunks still in flight are dropped.
- **2026-09-11 — An upgraded home would not have healed on its own:** stale plain chunks read as present, so the save would commit them again. `cache_sizes.deflated` makes it replace them instead.
- **2026-09-11 — The upgrade walked on the local home:** a cache kept by fold phase 2's code, then this one over the same kennel — the first fresh container's turn exits 0, and the next is warm in 2793 ms.
- **2026-09-11 — workerd's `DecompressionStream` refuses a multi-member gzip and Node's takes it;** only the agent, Node, ever inflates.
- **2026-09-11 — The account ring on release 5e9ebd2 closes it: the put-back is 8.5 s against a 56.4 s cold install,** where fold phase 2's ring spent 31.3 against 38.9. `ok f1`, 32 steps, none skipped.
- **2026-09-11 — The split says the link is what is left:** 63.2 MB travelled at 7.4 MB/s, and 1.6 s of the 8.5 was the cell reading the object. Fewer bytes, not more in flight, is the next gain.
