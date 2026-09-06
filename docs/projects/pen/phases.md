# Pen: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey it closes, and a phase that
claims one closes only when the journey is walked for real. The rules are
lamb's ([../lamb/phases.md](../lamb/phases.md)), and `/conduct pen` is
the procedure: the conductor verifies every proof itself, findings are
one dated line of about forty words, and steps marked **⚑ provision** are
asked out loud first. Phase citations name their project: `pen phase 2`,
never a bare "phase 2".

---

**Where we are: pen phases 0 to 5 CLOSED, phase 6 WITHDRAWN with celld,
phase 7 PART-DONE. Nothing in pen waits on work; what is left waits on
a person.** Planned
5 Sep 2026; every phase built the same day. The shepherd enabled the
Workers Paid plan that evening and scoped a token to a scratch
repository; `lamb-pen` was deployed with its image, and journeys 1, 2,
3, and 4 walked there with a real model. Phase 6 built the starter
beside a celld node and reached a real container through it; the walk
stalled on celld dropping the work a socket message wakes, and the
shepherd withdrew celld that night. Phase 7 walked lamb's journeys 1, 2,
4, and 5 on the lamb home with all of pen present and no binding;
journey 3 waits on a second terminal.

The order is dependency order and risk order. Phase 1 is the gate: if a
checkout cannot be synced by hash both ways with the atomicity journey 3
demands, the container is a machine and the thesis fails. Phase 2 is the
seam and the sentence, and it is where lamb's behaviour is preserved.
Phase 3 is the first real machine. Phase 4 is the repository journey and
the credential broker, the largest piece of new code. Phase 5 is the
fresh isolate and is allowed to slip. Phase 6 is celld. Phase 7 is the
proof that lamb did not notice.

**One rule for every phase.** The proof runs in workerd against a fake
container that speaks the protocol, never against a real one, until the
phase whose job is the real one. A real container is the walk, not the
test.

**Deliberately open.** Postponed on purpose:

- **Budgets.** A number per home and a sentence. Not a meter per user.
- **A GitHub App.** The push authors as the home. An app that authors as
  itself is Identity's.
- **Persistent volumes.** A cache-warming question, after the cache rule
  is proven.
- **Python in tier 1.** The table says tier 2. Pyodide is a later finding.

---

## Phase 0 — The scaffold

**Status: CLOSED.** 5 Sep 2026. The manifest test and the fake's ping test
run in workerd, the process test runs the real `pen-agent` in Node, and
`sheep-pen:dev` builds and starts.

**Closes no journey.** Makes every later phase possible to prove.

**Work:**

- `packages/pen`: a container image definition with node, pnpm, python,
  and git, and a `pen-agent` that opens a WebSocket to a URL from its
  environment and answers `ping`. Built by a script; not yet run
  anywhere.
- In `packages/cell`: the `hash` column on the `files` table, computed on
  write, with a migration that backfills; a manifest query; and a test in
  workerd that writes files through lamb's tools and asserts the manifest.
- A fake container for tests: a workerd-side implementation of the
  protocol over an in-process socket pair, holding its checkout in
  memory. The fake is what every phase's tests talk to.
- The protocol as one TypeScript file of message types, imported by the
  cell and by the agent.

**Proof:** `pnpm test` runs the manifest test in workerd. The image
builds. `pen-agent` answers `ping` against a local socket in the fake's
test.

**Findings:**

- **2026-09-05 — The fake container is the agent.** `serveAgent` from
  `@lamb/pen/agent` runs unchanged in workerd over a `Map` disk and one
  end of a `WebSocketPair`; the image runs the same function over
  `node:fs`. There is no second almost-agent to drift.
- **2026-09-05 — The hash migration ran in workerd for real.** The cell's
  SQLite accepts `PRAGMA table_info` and `ALTER TABLE ADD COLUMN`; a
  raw-SQL pre-pen table with a two-chunk file backfilled correctly,
  checked against WebCrypto, not the table's own code.
- **2026-09-05 — `pen-agent` has no build step.** Node 24 strips types from
  `.ts` imported by a `.mjs`, silently; the image copies `src` and `bin`
  to `/opt/pen`. Under the image's node the entry exits 2 without its
  environment and 1 without a cell.
- **2026-09-05 — One `@types/node` major per workspace.** Pen at `^24`
  re-resolved the cell's vitest peer and `vendor/pi` stopped typechecking;
  pinned `^22` like lamb, the global `WebSocket` typed by hand.
- **2026-09-05 — `WebSocketPair` carries a close code and reason across**,
  so the fake's `stop()` is a real 1012 on the cell's end. Both ends need
  `accept()` first.
- **2026-09-05 — The image is 425 MB**, `python3-pip` most of it; the
  Worker bundle 3.9 MB raw, from 3.6. Cost: 25 minutes, 10 the builder's.
- **2026-09-05 — `blob` frames were base64 text**, 1.37× plus a copy each
  way. Paid in pen phase 1: the bytes are one binary message each.
- **2026-09-05 — `serveAgent` answered frames on one chain**, so a long
  `run` would have queued `killed` behind it. Paid in pen phase 2: a run
  has its own lane.
- **2026-09-05 — The Worker imported only a type from pen.** Paid in pen
  phase 2: wrangler bundles `@lamb/pen`'s `.ts` exports as the pool does.

## Phase 1 — The checkout

**Status: CLOSED.** 5 Sep 2026. The gate held: a hundred files round-trip
through the fake and the rows are whole at all 246 points the container
can die. Pen phase 3 walks it for real.

**Proves journey 3's atomicity claim and journey 1 step 3 against the
fake.** Closes nothing; pen phase 3 walks them.

**Work:**

- Sync in: manifest to the fake, `need`, blobs, and the fake's checkout
  equals the rows. Deletions honoured.
- Sync out: the fake changes files; `changed`, blobs up, rows updated
  one transaction per file; over-cap files refused by name.
- The cache rule: `.gitignore` and the built-in list, applied on the
  container side to what it reports, and a test that a `node_modules`
  written in the fake does not come back.
- The kill test: the fake is stopped at each stage of a sync, and the
  rows are asserted whole every time.

**Proof:** A test in workerd round-trips a workspace of a hundred files
through the fake with edits, adds, deletes, and one over-cap file, and
the rows and the transcript match a fixture at every kill point.

**Findings:**

- **2026-09-05 — The gate held.** A hundred files, two symlinks, a
  two-chunk file and an over-cap one round-trip in 246 frames: sync-in
  9 ms, sync-out 14 ms in workerd. Killed at every one of the 246
  positions, each row was byte-for-byte before or after; the walk took
  4.8 s.
- **2026-09-05 — Two frames the design lacked.** `checkout {id}` from the
  container: the agent verifies every blob, and a mismatch needs a frame
  to fail on. `sync {id}` from the cell asks for `changed` when there was
  no run, which is how the process test drives the real agent.
- **2026-09-05 — `ignore@7.0.8` is pen's one runtime dependency**,
  CommonJS, bundled by the vitest pool into workerd unasked and installed
  in the image by `npm install --omit=dev`; the agent imports inside the
  image. An almost-gitignore was not written.
- **2026-09-05 — The container hears `synced` last, so it can die
  complete.** Killed after its last blob, the rows are whole and
  `syncOut()` resolves; only the agent's memory is stale. Rows are the
  truth.
- **2026-09-05 — Sending on a closed pair does not throw in workerd**;
  the close event is the only signal. A symlink's mode differs by OS, so
  the agent says 0o777. `toEqual` on megabyte arrays cost 244 s; a byte
  loop, 5 s. Cost: 35 minutes, 25 the builder's.
- **2026-09-05 — Open: a refused over-cap file is deleted by the next
  sync-in**, since the rows never had it. A big packfile would break the
  clone on the second command; pen phase 4 decides whether the agent
  keeps refused paths as cache.
- **2026-09-05 — Open: the agent hashes the whole checkout every sync**,
  walks `node_modules` before the rule drops it, and reads only the root
  `.gitignore`. Pen phase 3's real `pnpm install` measures the cost.

## Phase 2 — The router and the sentence

**Status: CLOSED.** 5 Sep 2026. Journey 6 holds byte for byte and journey
1 steps 1 to 4 hold against the fake, through pi's real bash tool; pen
phase 3 walks journey 1 and pen phase 7 walks journey 6.

**Proves journey 6, and journey 1 steps 1, 2, and 4, against the fake.**
Closes nothing; pen phase 3 walks journey 1 and pen phase 7 walks
journey 6.

**Work:**

- The table, in one file, generating three things: the router's
  decision, the refusal sentence per program, and the system prompt's
  paragraph. Lamb's `shell-notice.ts` becomes this file.
- `CellExecutionEnv.exec` routes: parse with just-bash, classify each
  simple command, run whole in tier 0 or tier 2 or refuse. Tier-2 runs go
  to the fake in tests.
- Streaming: `stdout` and `stderr` frames become pi's periodic bash
  updates, so the renderer behaves as it does against a real shell.
- Interruption: a socket close mid-run settles the command as
  interrupted, with partial output and no exit code, as journey 3 step 3
  says.
- A test that with no container binding the table generates lamb's
  sentence byte for byte and lamb's suite passes unchanged.

**Proof:** Journey 6 holds: lamb's suite green with pen's code present and
no binding. Journey 1 steps 1 to 4 hold against the fake.

**Findings:**

- **2026-09-05 — With no container the router must not run at all.** An
  up-front refusal lost the `hi` of `echo hi; npm test` and turned a
  line ending in `echo b` from exit 0 to 127. Journey 6 is lamb's `exec`
  with the sentence appended; four lines from lamb's tree assert it.
- **2026-09-05 — `parse` went by patch.** The pool and wrangler resolve
  just-bash through its `browser` condition, where `parse` is not
  exported; `patches/just-bash@3.4.2.patch` adds the one name. Bundle
  unchanged, 3.85 MiB uploaded.
- **2026-09-05 — A streamed run costs at most ten updates a second.**
  Three frames 120 ms apart reached pi's bash tool as three updates;
  fifty frames 5 ms apart as four. Pi's publisher emits every 100 ms.
- **2026-09-05 — The run has its own lane.** A `ping` is answered while
  `sleep 30` runs in the real process; `kill` returns `killed` at once;
  the agent's own backstop ends a run the cell never killed.
- **2026-09-05 — Tier 0 is read from just-bash, mostly.** Its registry
  is `getCommandNames()`; its 61 builtins have no export and are data
  checked against `help` in workerd. Lamb's prompt names `tar`, which
  just-bash 3.4.2 lacks; the list stays for byte-for-byte.
- **2026-09-05 — Cost: 48 minutes wall clock**, 40 of them the builder's,
  3 of those the journey 6 correction.
- **2026-09-05 — Open: wrappers hide programs from the router.** `xargs
  node`, `env X=1 pnpm i`, `bash -c "npm test"` are tier 0 by their first
  word and fail in just-bash. Pen phase 3's walk decides a wrapper rule.
- **2026-09-05 — After `kill` the cell waited with no deadline** for
  `killed` or `exit`. Paid in pen phase 3: `PEN_KILL_TIMEOUT`, after
  which the container is discarded.

## Phase 3 — A real machine

**Status: CLOSED.** 5 Sep 2026. Walked on the local rig and then on the
deployed pen home with a real model, journeys 1 and 3 as written; the
container instance was ended mid-run from inside, since the dashboard's
hand was not at the keyboard in the window.

**Closes journey 1 and journey 3 on Cloudflare.**

**Work:**

- ⚑ provision: Cloudflare Containers on the scratch account, which needs
  the Workers Paid plan. Asked out loud, with the price.
- The Containers binding in `wrangler.jsonc`, the container started from
  the cell on first tier-2 command, the agent connecting back with the
  minted token, and idle stop.
- The budget: a number per home in configuration, a counter in the
  Directory, and the sentence when spent.

**Proof:** Journey 1 walked on the deployed home: `pnpm install`, `pnpm
test`, `node_modules` in the container and not in the rows, the sentence
changed, and the container gone an hour later. Journey 3 walked with the
container killed from the dashboard mid-run. The Findings record start
time, sync time for a workspace of a hundred files, and what an idle
minute costs.

**Findings:**

- **2026-09-05 — Two homes from one config.** The top level is lamb;
  `env.pen` is `lamb-pen` with the containers entry, the binding, and the
  migrations repeated, since nothing is inherited.
- **2026-09-05 — A real container answers in 1.2 s**, locally and on
  Cloudflare; install and test in 11 s there with the start. An idle
  `basic` minute is about 0.0005 USD; the deployed walk was 27 minutes.
- **2026-09-05 — The agent is PID 1**: SIGTERM must be handled, and a
  SIGKILL from inside is dropped by the kernel. Local dev insists on an
  exposed port; the agent answers `ok` on 8080.
- **2026-09-05 — Journeys 1 and 3 walked, locally and on Cloudflare**,
  with a real model: a kill mid-run gave an error result with the output
  so far and the sentence, `lamb wait` came back in 12 s, and the rerun
  got a fresh container. SIGTERM to PID 1 stood in for the dashboard.
- **2026-09-05 — The sentence is the instruction.** Given the honest
  interruption the model retried on its own; "Report this to the user
  and stop" in the same sentence made it stop and say so.
- **2026-09-05 — The model folds commands**, so `find … && pnpm ls` ran
  whole in the container and listed `node_modules`; one command per turn,
  tier 0 lists none. Cost: 61 minutes, 43 the builder's.
- **2026-09-05 — Open: an idle container's socket drops at about 270 s**
  on Cloudflare (1006) and the agent exits; a keepalive from the lease
  would hold it, if a warm container is worth the minutes.
- **2026-09-05 — Open: `.dev.vars.pen` replaces `.dev.vars`**; the local
  walk passes `PEN_*` with `--var`. The wrapper rule is still undecided.

## Phase 4 — A repository, and the broker

**Status: CLOSED.** 5 Sep 2026. Real git through the real agent and
helper in Node against a fixture that demands auth, the broker in
workerd through the fake, and journey 2 walked from the deployed pen
home against a real repository with the shepherd's token.

**Closes journey 2.**

**Work:**

- The git credential helper in the image, `credential.helper = pen`,
  speaking `credential` frames.
- The broker in the cell: a `credential` request becomes a request to
  the home, which mints from its secrets a short-lived scoped value;
  the value is returned once and not stored.
- ⚑ provision: a fine-grained token to one scratch repository as a home
  secret, contents-only, short-lived, revoked after the walk.
- `.git` syncing, with a test that a clone survives a fake-container
  restart and `git status` in the new one is clean.
- A test in Node against a git server fixture (lamb's fifty lines of
  CGI, revived) that runs real git through the real `pen-agent` process
  with the test as the cell: clone, branch, commit, push with the helper,
  and the credential in no frame, no file of the checkout, no environment.
- A test in workerd that walks journey 2's frames through the fake: the
  broker mints once per `credential` request, returns the value once,
  stores nothing, and the value is in no row, no tool result, and not in
  the exported session.

**Proof:** Journey 2 walked against a real repository from the deployed
home: cloned, a branch, an `edit`-tool change that `git diff` shows,
pushed, the branch on GitHub, and a laptop fetch showing the tree. The
credential in nothing the model can see.

**Findings:**

- **2026-09-05 — Real git asked the helper once per push.** The fixture's
  401 on the receive-pack advertisement made git spawn
  `git-credential-pen`: one `credential` frame, then the advertisement
  and the pack with the token. A clone asked nothing.
- **2026-09-05 — The token was in nothing but the one answer.** In Node,
  112 frames and 51 blobs both ways, 73 rows, the checkout, `env`, `git
  config --list --show-origin`, and `~/.git-credentials` carried none; in
  workerd, no tool result, no transcript entry, no export table, no row.
- **2026-09-05 — A clone survives the process.** It came back as 58 rows,
  52 under `.git`; a new agent on an empty disk got them by manifest and
  `git status` was clean, in step with `origin/fix-typo`.
- **2026-09-05 — `git rebase -i` with no terminal says "Terminal is dumb,
  but EDITOR unset"**, exit 1; `GIT_TERMINAL_PROMPT=0` in the image makes a
  refused push fail at once. Git's objects are 0444, so the disk replaces
  files rather than writing through.
- **2026-09-05 — A minter cannot mint a fine-grained token**, so `expires`
  is a promise about handling, not a property of the value: the same
  secret, read at each request, said to be good for a minute.
- **2026-09-05 — Journey 2 walked on Cloudflare** against
  `lamb-playground` with the shepherd's token: clone, `fix-typo` edited
  by the tool, the diff, commit, push; the branch on GitHub authored as
  the home says; the token in no entry, export, `env`, config, or file.
- **2026-09-05 — Open: one token per host.** `credential.useHttpPath` is
  off, so the scope is the host and one token covers every repository on
  it; a per-repository scope is a later table in the home.

## Phase 5 — The fresh isolate

**Status: CLOSED.** 5 Sep 2026. Proved in workerd through the real Worker
Loader and walked on the deployed pen home with a real model: journey 4
steps 1 to 3, a hundred files, and the CPU limit. Tier 1 reads the
workspace and prints; writes go to the container. Allowed to slip; it
did not.

**Closes journey 4.**

**Work:**

- The Worker Loader binding; a `node`-compatible entry that runs a file
  from the workspace binding with no `fetch`; stdout as the tool result.
- The router's rule for `node`: tier 1 when no container is up, tier 2
  when one is.
- A test that the isolate cannot `fetch` and cannot read the cell's
  environment.

**Proof:** Journey 4 walked on the deployed home.

**Findings:**

- **2026-09-05 — A module's top level is global scope in workerd**,
  outside any request: no filesystem a handler could read back, no
  timers, no fetch, no top-level await. So tier 1 is read-only: the
  workspace goes in as modules, the script reads and prints. The design
  says so now.
- **2026-09-05 — The pool binds a loader from miniflare's own option**,
  `workerLoaders: { LOADER: {} }`, so the top-level config stays lamb's
  with no loader, which is journey 6. `nodejs_compat` must not be named
  in the loaded code; it is the default and the loader refuses it spelled.
- **2026-09-05 — The loader compiles every code module at start**, so
  only the script and what it reaches by relative import goes in as code;
  every other file is bytes.
- **2026-09-05 — `limits.cpuMs` is production's.** Local workerd ignored
  it, and a bare `for(;;){}` froze the pool's runtime whole, vitest's
  timeout included; that test is skipped by name.
- **2026-09-05 — Tier 1 costs milliseconds.** 6 ms for a nine-line script
  over five files in the pool, 7 ms over a hundred and one; 9 and 23 ms
  under `wrangler dev`. The same script in the container took 292 ms
  after a 1120 ms start. Around one idle stop, `node` went isolate,
  container, isolate.
- **2026-09-05 — Cost: 47 minutes**, 42 the builder's.
- **2026-09-05 — Walked on Cloudflare the same evening.** `node
  compute.mjs` answered from the isolate before any container existed;
  `fetch` there was refused with the sentence; a hundred and one files
  went in and answered in 64 ms; a bare `for(;;){}` was ended by the CPU
  limit as exit 1 in 70 ms, "Dynamic import exceeded CPU time limit".

## Phase 6 — celld

**Status: WITHDRAWN.** 5 Sep 2026, with celld, the shepherd's call: not
yet mature. Formerly PART-DONE the same day: the starter beside the node
built and proved, journey 1 step 1 reaching a real container through it
on celld 0.4.0, the turn then stalling on celld's dropped work. The
starter, its HTTP seam, and the celld dev script are removed; the
findings stay as the record.

**Closes journey 5.**

**Work:**

- ⚑ provision: a celld node with a container runtime the operator
  configures, and the endpoint the cell uses to start one.
- The same image, started by the node; the same protocol.
- Findings for every celld behaviour the design leans on.

**Proof:** Journeys 1, 2, and 3 walked against the fleet, with `docker
kill` as the operator's hand in journey 3.

**Findings:**

- **2026-09-05 — Who starts the container is configuration.** With no
  Containers binding, `PEN_STARTER_URL` names a program beside the node,
  `pen-starter`, which drives Docker and speaks the starter's three
  verbs over HTTP; the same image, the same protocol, the same lease. A
  cell reaches 127.0.0.1 on celld, and a container reaches the node at
  `host.docker.internal`: dial-in in 293 ms.
- **2026-09-05 — celld drops work no request covers.** A timer set after
  a response never fires in a Durable Object there; `ctx.waitUntil`
  keeps it. The cell's detached drive now runs under `waitUntil`, and
  detached turns complete on celld; workerd never needed it.
- **2026-09-05 — A WebSocket message covers nothing on celld.** A timer
  or a `fetch` woken by a socket message is dropped unless a `waitUntil`
  is taken inside that handler. So `pnpm install` ran in the container
  (run 354 ms, syncs under 10 ms) and the turn's next step never began.
- **2026-09-05 — celld 0.4.1 has no writable `node:fs`**; the cell's
  marker write fails and no cell boots. 0.4.0, which lamb walked, boots.
  `celld deploy` refuses the `env` key, so the celld config is the
  generated top level; `dev:celld` had been broken by the comments in
  `wrangler.jsonc` and is fixed.
- **2026-09-05 — Cost: 40 minutes**, 36 the builder's.
- **2026-09-05 — Withdrawn the same night.** Covering the work a socket
  message wakes with `waitUntil` in every handler was the open decision;
  the shepherd decided celld instead: not yet mature. The starter went
  with it; `ctx.waitUntil` around the detached drive stays.

## Phase 7 — Nothing changed for lamb

**Status: PART-DONE.** 5 Sep 2026. The lamb home redeployed with all of
pen and no binding; lamb's journeys 1, 2, 4, and 5 walked there with a
real model, its suite green, pi's branch the same four commits. Lamb's journey 3 waits on a person, as lamb's own record says; journey
6 went with celld, withdrawn.

**Closes journey 6.**

**Proof:** Every lamb journey walked against a home with no container
binding, unchanged. Lamb's suite green. No pi patch added. `git log
upstream/main..sheep` in the submodule is the same list it was.

**Findings:**

- **2026-09-05 — The lamb home is lamb with all of pen in it.** No
  binding, no loader: `npm`, `git`, and `node` refused with lamb's one
  sentence; journeys 1, 5, and 2 held, the last with a deploy mid-turn:
  fifteen writes, fifteen distinct, one interruption mark, fifteen files.
- **2026-09-05 — No pi patch was added.** The submodule pointer is what
  it was at the start of the day and `upstream/main..sheep` is the same
  four commits; pen's only dependency patch is one export on just-bash.
- **2026-09-05 — Cost: 8 minutes**, all walks.
- **2026-09-05 — Open: lamb's journey 3** needs a second terminal, a
  person's, as lamb's phase 4 says; journey 6 went with celld.

## What the phases leave open

- **Sub-agents as cells** that rent their own containers, or share.
- **A permission gate that hibernates**, now that a command can cost
  money as well as time.
- **Identity**, which the budget and the GitHub App both wait on.
