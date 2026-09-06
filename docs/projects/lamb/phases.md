# Lamb: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey it closes, and a phase that
claims one closes only when the journey is walked for real. Each phase is a
discrete amount of work ending in a testable outcome, named up front.

**How the work runs.** Claude does all of it, and a working session is a
**conductor** (the `/conduct lamb` skill in `.claude/skills/conduct/` is
the procedure; this paragraph is the idea): it reads the "where we are"
line below, spawns a subagent on
the next phase with the phase's section, the docs it cites, and the repo's
house rules, and the subagent does the work: code, tests, and the walk.
The conductor then **verifies the named proof itself**, running the suite
and walking the journey, never taking the subagent's word for it; the
proofs are named up front so review is mechanical. Work that fails review
goes back down. When the proof holds, the conductor writes the Findings,
moves the Status line and the "where we are" line in the same change,
commits the phase whole, and repeats. Phases run in order; parallel
subagents belong inside a phase, never across phases. Steps marked
**⚑ provision** create a cloud resource or spend money and are asked of
the user out loud before they run.

**How a finding is written.** One dated line, one claim, about forty words.
A phase's Findings section stays under three hundred. The argument belongs
in the commit message. An entry marked **Open** is a debt nothing else in
the repo records; `grep -n '— Open' docs/projects/lamb/phases.md` is the
roster of them.

**Phase citations name their project**: write `lamb phase 2`, never a bare
"phase 2".

---

**Where we are: phases 0, 1, 2, 5, and 7 CLOSED, phases 3, 4, and 6
PART-DONE. Nothing in lamb waits on work; what is left waits on a
person.** Every proof that can run locally has run: pi's conformance
suites, journey 4 in workerd, journey 2's eviction test at every
transition, journey 3 over pi's protocol on WebSockets, journeys 1 and 3
through `lamb` and pi's real client against both `wrangler dev` and a
single `celld dev` node, journey 5 through the built CLI against a
`wrangler dev` home, and an export pi's Node backend opens. On the
deployed home with a real model, journey 1 has walked as far as one
laptop can take it, journey 2 has walked in full (a turn evicted by a
real `wrangler deploy` mid-flight, resumed by the alarm), and journey 5
has walked in full: three sheep minted detached in one command, `ls` and
`status` parsed, a queued prompt, a `wait` on all three, an abort, and a
`log`, all by a Claude Code session on 5 Sep. Git was built as lamb
phase 5 and withdrawn on 5 Sep: the shell's `git` was a facade over
isomorphic-git, and git is a program for the second leg's container tier
([pen](../pen/phases.md)); the same evening the journeys were recast
around agents as the actors and lamb phase 5 became the sheepdog's
surface, now built. What waits on a person: a second machine and the
TUI half of journey 3, and a two-node celld fleet for journey 6. Pen
phase 3, the first real machine, no longer waits on lamb.

The order is dependency order and it is also risk order: phase 1 is the
gate, because if pi's storage does not run over the cell's SQL nothing
after it is worth building; phases 2 and 3 are the cell; phase 4 is the
wire and the boulder, because the terminal is the seam pi has not cut;
phase 5 is the largest piece of new code; phase 6 is the portability claim
measured; phase 7 is the proof that pi did not notice. Phases 1 and 4 are
where the design is most likely to be wrong, and each says what happens if
it is.

**One rule for every phase.** The proof runs in workerd, never in Node.
A test that passes in Node proves that Node works. Every phase's suite
runs through `@cloudflare/vitest-pool-workers`, and every walk is against a
deployed home, on a scratch account the user provisions once.

**A second rule.** Pi is a dependency. A change the cell needs in pi is one
commit on the `sheep` branch of the `dglazkov/pi` fork that `vendor/pi`
tracks, named in the phase's Findings, and never a copy of a pi file into
`packages/`. (Until 6 Sep these were `.patch` files under `vendor/patches`;
the findings below still call them patches 0001 to 0004.)

**Deliberately open.** Postponed on purpose, so a later session decides
instead of improvising mid-task:

- **Execution tiers.** A fresh isolate for model-written code and a
  container for native work are the marathon's second leg,
  [pen](../pen/design.md). `Shell.exec` is the seam; nothing here builds
  behind it. `git` is a program and goes there too.
- **Large files.** The per-file cap stands in for an object store. The
  table is shaped for it; the leg does not build it.
- **Identity.** One bearer token per home. No people, no grants.
- **Extensions and facets.** Nothing from pi's extension system runs in
  the cell. Skills and prompt templates as workspace files are a phase
  someone adds when the journey needs one.
- **Permission gates.** Pi's tools run unasked in this leg, as they do in
  pi by default. A gate that hibernates the cell and is answered from any
  terminal is the leg after execution tiers.

---

## Phase 0 — The scaffold

**Status: CLOSED** 6 Sep 2026. Proved locally 5 Sep: `pnpm test` runs the
cell's tests in workerd and the CLI's in Node; `lamb --version` prints;
typecheck clean. Deployed 6 Sep after Dimitri's first `wrangler login`:
`pnpm deploy` put the cell on the Free plan at
`https://lamb.dglazkov.workers.dev`, 4.4 MB uploaded, 46 ms startup, and
`curl` got `lamb` back.

**Closes no journey.** It makes every later phase possible to prove.

**Work:**

- A pnpm workspace with `packages/cell`, `packages/lamb`, and `vendor/pi`
  as a git submodule pinned at the commit read for the design, with a
  `patches/` directory beside it that starts empty and a script that
  applies it after checkout.
- `packages/cell`: a Wrangler project with one Durable Object class that
  does nothing but answer `fetch`, `wrangler.jsonc` naming it, a
  `nodejs_compat` flag, and `@cloudflare/vitest-pool-workers` running one
  test that instantiates the object and reads a row from `ctx.storage.sql`.
- `packages/lamb`: a `lamb` binary that prints its version and reads
  `~/.lamb/config` for a home URL and token.
- A `justfile` or `package.json` scripts: `test` runs every package's
  suite in workerd, `deploy` runs `wrangler deploy`, `deploy:celld` runs
  `celld deploy`.
- ⚑ provision: a Cloudflare account on the Workers Paid plan for the
  scratch home, and its API token in the user's environment.

**Proof:** `pnpm test` runs one workerd test and it passes. `pnpm deploy`
puts the empty object on the scratch account and `curl` gets a response
from it. `lamb --version` prints.

**Findings:**

- **2026-09-05 — The deploy half of the proof waited a day** for a
  Cloudflare login; closed 6 Sep. `wrangler login` from the laptop was the
  whole provisioning step; the Free plan carries SQLite Durable Objects.
- **2026-09-05 — `@cloudflare/vitest-pool-workers` 0.22 needs vitest 4**
  and is a Vite plugin, `cloudflareTest(...)`, not `defineWorkersConfig`.
  Types come from its `./types` subpath.
- **2026-09-05 — The pool's workerd trails wrangler's**: 2026-08-22
  against 2026-09-03. `compatibility_date` is pinned to the pool's, and
  moves when the pool does.
- **2026-09-05 — `@cloudflare/workers-types` 5 has no dated entry
  points.** `types: ["@cloudflare/workers-types"]` and nothing else.
- **2026-09-05 — pi is pinned at `9841914`** (5 Sep, "keep list selection
  unchanged on mouse hover"), as a shallow submodule. The patch set is
  empty.
- **2026-09-05 — `pnpm deploy` is pnpm's own command, not the script.**
  pnpm 10 ships a built-in workspace `deploy` that shadows a script of the
  same name, and the root script's inner `pnpm --filter @lamb/cell deploy`
  hit the same built-in (`ERR_PNPM_NOTHING_TO_DEPLOY`). The scripts now
  say `run deploy`, the README says `pnpm run deploy`, and extra flags
  forward without `--`: `pnpm run deploy --dry-run` reaches wrangler.

## Phase 1 — pi's storage over the cell's SQL

**Status: CLOSED** 5 Sep 2026. All 21 storage conformance cases and all 17
session-repo conformance cases pass in workerd against
`CellSqliteDatabase`, with no case excluded: pi's own `SqliteSessionRepo`
runs in the cell in shared-container mode, so the `CellSessionRepo` wrapper
the design planned was not needed. pi's backend suite passes at the pinned
commit with lamb's two patches applied (105 tests). Typecheck clean.

**Closes nothing by itself; journeys 1 and 7 depend on it.** This is the
gate. If the conformance suites cannot be made to pass, the conductor
stops, records why, and the design is rewritten before phase 2 starts.

**Work:**

- `packages/cell/src/storage/sqlite.ts`: `CellSqliteDatabase` over
  `ctx.storage.sql` and `transactionSync`, per the design's sketch, with
  `prepare` binding positional parameters and reading the cursor for
  `run`, `get`, `all`, and `iterate`.
- Migrations as strings: a build step in `packages/cell` that reads the
  `.sql` files from `vendor/pi`'s SQLite backend and emits a module, so the
  backend's `migrations.ts` is bypassed and nothing is copied by hand.
- `CellSessionRepo`: `SessionRepo` for a cell that holds one session.
  `create` and `open` return that session over the adapter; `list`,
  `delete`, and `fork` throw `not implemented` in this phase, with `list`
  becoming the Directory's in phase 3.
- Pi's storage and repo conformance suites, imported from
  `@earendil-works/pi-agent-core/harness/session/testing`, run against
  the adapter inside a Durable Object in workerd. The benchmark suite runs
  once and its numbers are recorded in Findings beside the Node backend's.
- Findings name every patch to pi this needed, with an upstream issue
  each. The expected two: a repo constructor that takes an opened
  database, and migrations exported as strings.

**Proof:** Every conformance case pi ships for `Storage` passes in workerd
against `CellSqliteDatabase`, and every `SessionRepo` case that a
single-session repo can satisfy passes, with the excluded cases listed by
name in Findings and the reason for each. The Node backend's own suite
still passes at the pinned commit with lamb's patches applied.

**Findings:**

- **2026-09-05 — pi's `SqliteSessionRepo` runs in the cell unmodified.**
  Its schema already scopes every row by session id, its shared-container
  mode wants one path, and workerd's `node:fs` under `/tmp` satisfies the
  `mkdir`, `realpath`, and `open("wx")` calls it makes. The cell touches a
  marker file at `/tmp/lamb/sessions.sqlite` and hands the repo its one
  database for any path. No `CellSessionRepo`.
- **2026-09-05 — The marker file dies with the isolate.** In-memory
  `node:fs` is per isolate, so `CellSqliteDatabaseFactory.prepare()` must
  run again after every wake, before the repo's first `realpath`.
- **2026-09-05 — Patch 0001, `sqlite-backend-runtime-neutral`:** the
  initial schema inlined as `INITIAL_SCHEMA_SQL` beside the `.sql` file,
  `migrations.ts` re-exported from `sqlite/index.ts`, and a `./sqlite`
  export so the runtime-neutral core is reachable without `node:sqlite`.
  Upstream: not yet proposed.
- **2026-09-05 — The cell's SQLite binds at most 100 variables.** pi's
  `getEntries` named every id in one `IN (...)`, so 100 ids plus the
  session id failed. **Patch 0002, `sqlite-chunk-entry-lookups`:** lookups
  in chunks of 64. Upstream: not yet proposed. Found by the timing pass,
  not the conformance suites, which never look up that many.
- **2026-09-05 — `rowsWritten` on a cursor counts index rows.** pi's
  `run()` wants SQLite's `changes()`; the adapter selects it after each
  statement. Before the fix, 8 of 21 storage cases failed on "updated 2".
- **2026-09-05 — The cell's SQLite refuses `PRAGMA journal_mode`,
  `PRAGMA busy_timeout`, and explicit `BEGIN`/`COMMIT`/`ROLLBACK`.** The
  adapter drops them: the first two are the platform's business, and the
  fork snapshot's explicit transaction wraps synchronous reads that nothing
  can interleave in a single-threaded object.
- **2026-09-05 — Cursors are materialized.** `iterate` returns an array; a
  cursor held open across another `exec` is not a contract the cell's
  SQLite offers, and pi's scans are bounded.
- **2026-09-05 — One timed pass, 1k entries, 256-byte payloads, cell
  against `node:sqlite` in memory:** seed 59 / 56 ms; get 100 entries 1.0 /
  1.2; scan latest 50 1.0 / 0.6; full branch structure 3.0 / 3.0; commit
  one 0 / 0.2; commit 100 6.0 / 5.3; mixed append 2.0 / 0.6. workerd's
  timer is 1 ms coarse. Same order of magnitude everywhere.
- **2026-09-05 — pi's packages come from the pinned checkout, not npm.**
  `npm ci` and a build of chord, telemetry, ai, agent, and the backend
  take about fifteen seconds; the cell depends on them by `link:`. npm has
  0.85.0 too, but it cannot carry patches.

## Phase 2 — The workspace and the shell

**Status: CLOSED** 5 Sep 2026. Eight tests in workerd run pi's `read`,
`write`, `edit`, and `bash` tools against `CellExecutionEnv`: journey 4's
steps 1 to 6 each have a test, plus truncation with spill to `/tmp`, the
fence, directory renames, symlinks, and abort. The by-hand walk through
the HTTP route moves to phase 3, which builds that route; it runs there
against `wrangler dev` until a Cloudflare token exists. Typecheck clean.

**Closes journey 4.** Walked against a cell driven by an HTTP test route,
before the wire exists, with the tool results asserted directly.

**Work:**

- The `files` table from the design, created by the cell's own migration
  beside pi's.
- `CellFs`: the table behind two faces. Pi's `FileSystem` and just-bash's
  `IFileSystem`. (A third, Node's `fs.promises` subset for isomorphic-git,
  was written here and removed with lamb phase 5.) POSIX path
  normalization in pure code; the `/workspace` and `/tmp` fence; the
  per-file cap refused with `FileError("invalid")` naming the limit.
- `CellExecutionEnv`: `FileSystem` delegated to `CellFs`; `Shell.exec`
  over a just-bash instance with network off, output fed to pi's
  `OutputCapture`, exit code and timeout mapped to pi's `ExecutionError`
  codes; `cleanup` a no-op; `createTempDir` and `createTempFile` under
  `/tmp`.
- The command-not-found sentence, in one constant, used by the shell and
  by the system prompt.
- A test that runs pi's four tools against `CellExecutionEnv` in workerd:
  write, read back, edit, rename, `find | grep | sort` through `bash`,
  `sed -i` in a loop, `jq`, the runaway loop stopped at just-bash's bound
  with the event loop responsive, the two-megabyte write refused, and
  `python3` answered with the sentence.

**Proof:** The test above passes in workerd. The conductor then walks
journey 4's steps 1 to 6 by hand against the scratch home through the HTTP
test route and reads the tool results.

**Findings:**

- **2026-09-05 — just-bash 3.4.2's browser build runs in workerd** with
  its coreutils, `jq`, `sed -i`, `find | xargs`, symlinks, and loops, over
  an `IFileSystem` that is thirty small methods on the table.
- **2026-09-05 — The in-isolate shell does not stream.** just-bash returns
  stdout and stderr when the command ends, so pi's `onUpdate` sees one
  update and the bash renderer's periodic checkpoints never fire for this
  shell. Truncation and spill still behave as pi's, after the fact.
- **2026-09-05 — just-bash knows `python3` and says "command not
  available"**, not "not found", because its Python runtime exists and is
  off. `annotateCommandNotFound` covers both phrasings.
- **2026-09-05 — Patch 0003, `export-output-capture`:** `OutputCapture`
  exported from `pi-agent-core`'s index. Only the Node env used it, by
  relative import; any env outside the package needs it. Upstream: not
  yet proposed.
- **2026-09-05 — Path resolution resolves as far as rows exist** and
  returns the rest unresolved, so a write can create parents and a stat
  can say not found; a resolver that throws on a missing parent broke
  every `write` into a new directory.
- **2026-09-05 — Hard links are copies.** `ln` without `-s` copies the
  row; a table of paths has no inode to share.
- **2026-09-05 — `withAbortSignal(signal, context)`**, signal first. The
  test had it backwards and the abort silently never reached the env.
- **2026-09-05 — Bundle size is phase 3's number.** The Worker entry does
  not import the env yet, so a dry-run bundle measured 1 KB; the real
  figure arrives when the cell wires the harness in.

## Phase 3 — The cell

**Status: PART-DONE** 5 Sep 2026. Built and proved locally: `SessionCell`
boots pi's harness over the cell's storage, accepts and drives a prompt
detached, resumes whatever a previous incarnation left open, and arms the
alarm only while an operation is open; `Directory` mints and lists
sessions; the Worker guards everything with a bearer token. The eviction
test kills a scripted two-tool turn at each of its five transitions and
the workspace, the effects, and the settled transcript come out as journey
2 says, with the alarm doing the waking. The HTTP walk ran by hand against
`wrangler dev` with the faux provider; journey 1's turns ran on the
deployed home with a real model through lamb phase 4's wire, and journey 2
walked in full on the deployed home: a turn evicted by a real `wrangler
deploy` mid-flight, resumed by the alarm, and finished with pi's
interruption note and no doubled effect.

**Closes journey 2, and journey 1 through the HTTP route.** Journey 2 is
now walked on the deployed home, not only in workerd. The terminal half of
journey 1 is phase 4.

**Work:**

- `SessionCell`: the mini worker ported. Construction opens
  `CellSessionRepo`, builds `CellExecutionEnv`, calls `AgentHarness.create`
  with `createReadTool`, `createWriteTool`, `createEditTool`,
  `createBashTool`, and the system prompt; takes the `main` lane; and
  resumes every operation the `open` list names, logging any that fail.
- The model runtime: `pi-ai` with the provider chosen by which secrets
  the home holds, the lane's model and thinking level read from and
  written to pi's lane configuration. No `ModelRuntime` from the
  coding-agent package.
- Driving through `accept` and `drive` on the cell's event loop. The alarm
  armed a few seconds out while any operation is open, cleared when the
  lane idles; the alarm handler does nothing but construct the cell, which
  resumes.
- `/tmp` truncated when the lane idles.
- `Directory`: a singleton Durable Object holding session metadata rows;
  `create` mints an id and writes a row; `list` reads them. `CellSessionRepo.list`
  delegates to it. HTTP routes on the Worker for `new`, `ls`, and an
  `export` that streams the cell's SQLite file, guarded by the bearer
  token.
- An HTTP test route that prompts the lane and long-polls the transcript,
  for this phase's walk and for tests; removed or kept behind the token at
  the conductor's call.
- The eviction test: a scripted turn in workerd, the cell killed at each
  transition of the operation state machine, the final transcript and
  workspace asserted identical across runs, and no tool effect present
  twice.
- ⚑ provision: an Anthropic API key as a Worker secret on the scratch home.

**Proof:** The eviction test passes for every transition. On the scratch
home the conductor runs journey 1 steps 2 and 3 over the HTTP route, then
journey 2: starts a multi-file rename, redeploys the same code mid-turn,
and watches the transcript finish without a further request, with the
interruption note where the stream was cut and each edit once. `lamb
export` on that session opens in pi's Node SQLite backend and lists the
entries.

**Findings:**

- **2026-09-05 — Journey 2 holds at every transition, on pi's recovery
  alone.** Killed mid provider call, pi settles the orphaned request as an
  interrupted assistant message and continues the run without a second
  call. Killed after a tool's effect and before its outcome was durable,
  pi writes the tool result as interrupted and never reruns it; the
  transcript has the same shape as an unkilled turn. Effects were exactly
  one write and one edit in all six runs, and the file was identical.
- **2026-09-05 — The alarm is what wakes the cell.** `runDurableObjectAlarm`
  returned true after every kill, and the resumed drive ran from `boot`,
  not from a client's touch.
- **2026-09-05 — Cancelling a drive's context is not an eviction.** The
  first simulation cancelled the old driver's context and got identical
  transcripts at every kill point, because the old driver kept running
  beside the new one. A faithful eviction is an incarnation that never
  makes progress again: the kill point now hangs forever.
- **2026-09-05 — A cell has no database file to export.** The platform
  exposes rows, not the file. `GET /export` returns pi's seven tables for
  the session as JSON; `lamb export` in phase 4 rebuilds a SQLite file from
  them with `node:sqlite`, which pi's Node backend then opens.
- **2026-09-05 — RPC stubs choke on pi's types.** Calling a cell method that
  returns a `LaneSnapshot` through the Durable Object RPC stub sent
  TypeScript's instantiation depth over the edge; the router reaches the
  cell by `fetch` and the Directory by RPC.
- **2026-09-05 — The bundle is 3.6 MB raw, 746 KB gzipped**, with
  pi-agent-core, pi-ai and its provider data, chord, the SQLite backend,
  and just-bash inside. Well under the 10 MB script limit.
- **2026-09-05 — Models are pi-ai's `createModels` with an auth context
  answering from Worker secrets**; `pi-coding-agent`'s `ModelRuntime` and
  its `~/.pi` stay in the terminal. Default model `claude-sonnet-5`, which
  pi's Anthropic data carries.
- **2026-09-05 — The faux provider consumes one queued step per call.** A
  factory that re-queues itself answers every call from a script that
  reads the conversation, which is what lets one script survive a reboot
  mid-turn.
- **2026-09-05 — `wrangler dev` walk:** door refused without the token,
  session minted, prompt accepted, turn settled, transcript and list read,
  on the bundled Worker with both Durable Object migrations applied.
- **2026-09-05 — The deployed home ran real-model turns** for journey 1
  through lamb phase 4's wire, so the harness, the alarm, and the storage
  hold on Cloudflare with Anthropic behind them.
- **2026-09-05 — Journey 2 walked on the deployed home.** A thirteen-tool
  rename turn was started on the cell and `wrangler deploy` of the same
  code run on top of it; the Worker tail showed the eviction as
  Cloudflare's "This script has been upgraded" on the cell's live
  WebSocket, the client dropped, and with nobody typing the turn came back
  and finished. The export carries pi's own interruption note
  ("Assistant request was interrupted…") at the cut, the resumed turn
  after it, each `edit` once per rename round, and a workspace whose files
  match the final rename. A mid-flight `bash` was re-run per pi's
  tool-durability rules; no durable `edit` was. Walked twice.

## Phase 4 — The wire, and the terminal

**Status: PART-DONE** 5 Sep 2026. Built and proved locally: pi's protocol
server runs in the cell over standard WebSockets; the session and server
services the client expects are pi's own providers, in-process; pi-client
gained a WebSocket transport and `pi client` a `--connect wss://` route
(patch 0004); `lamb new`, `-c`, `attach`, `ls`, and `export` exist.
Journey 3 holds in workerd with two protocol clients on one cell. Journey
1 walked against `wrangler dev` with pi's real client: `lamb new -- "…"`
streamed a reply, `lamb attach` prompted the same cell, `lamb export`
wrote a file pi's Node backend opened with the same entries, and the
interactive TUI drew pi's session header under a pseudo-terminal. On the
deployed home with a real model, journey 1 steps 1 to 3 walked as
written, step 4 as a resume of a cell left hibernated for hours, and step
5 from a bare `HOME` with only the id and the token; the export opened in
pi's Node backend. Missing: an actual second machine and a real night for
journey 1, and journey 3 with two terminals side by side plus the
dashboard's hibernation check.

**Closes journeys 1 and 3.** The boulder.

**Work:**

- Server side: a `ServerListener` for `pi-server` whose connections are the
  cell's hibernating WebSockets, one protocol frame per binary message;
  a `ServerHost` that resolves the one session and returns the harness the
  cell holds; attachment state written beside the socket's tags so a wake
  rebuilds the router. Server-scoped `SessionDirectory` and
  `SessionManagement` calls forwarded to the Directory over a stub.
- Client side: a `ByteTransportFactory` over a WebSocket, with the bearer
  token on the upgrade, reconnect on close with the attachment re-made
  through `SessionManagement.attach`.
- The patch: a `--server <wss url>` route in `pi client` beside the Unix
  and Radius routes, in `vendor/pi/patches`, with the upstream issue
  opened. **The first finding of this phase is what the patch actually
  touched.** If the client's route selection turns out to assume a local
  coordinator in ways the design missed, the conductor stops and records
  the shape before building around it.
- `lamb new`, `lamb -c`, `lamb attach`, `lamb ls`, `lamb --home`, each a
  thin command that mints or lists at the Directory and then runs pi's
  experimental client TUI over the new transport.
- A test in workerd that attaches two clients to one cell, prompts from
  one, and asserts both transcript subscriptions receive the same events
  in the same order; and a test that closes every socket, forces a wake,
  reattaches, and asserts the router recovered.

**Proof:** Journey 1 walked end to end by two dogs on two machines:
`lamb new`, files made and grepped, the first dog's session ended, a
second dog hours later finding the sheep with `lamb ls` and attaching, a
third from another machine with only the id. Journey 3 walked with the
shepherd's terminal beside the dog's stream: both stream, the shepherd
prompts and aborts, one closes and the other notices nothing, both close
and the cell hibernates with the alarm clear, checked from the dashboard.

**Findings:**

- **2026-09-05 — The boulder was smaller than feared.** pi's client picks
  a route from a discriminated union in one file, and the two places that
  tested `=== "radius"` meant "remote". A `websocket` member, a transport
  factory of eighty lines, and two export-map entries were the whole
  terminal half. Patch 0004, `websocket-route-and-exports`. Upstream: not
  yet proposed.
- **2026-09-05 — The address is `wss://<home>/s/<id>/ws?token=…&serverId=<uuid>`.**
  pi's client verifies the server's logical id at the handshake, so the
  id rides in the URL; the Directory mints one UUIDv4 per home and every
  cell answers with it. `lamb` asks `GET /home` for it before dialing.
- **2026-09-05 — Sockets are standard, not hibernating.** pi-server keeps
  a connection's handshake stage and attachments in memory, and pi's
  client never reconnects on its own, so a hibernation wake would end in
  a reconnect either way. A cell with a terminal attached stays in memory;
  it hibernates when the last one leaves. Open: hibernation with
  re-attachment is later work.
- **2026-09-05 — The cell is the server.** Session-scoped services are
  pi's `createSessionWorkerServices` in-process with no `ModelRuntime`, so
  `/model` shows the lane's model and cannot switch; server-scoped ones
  are pi's `createExperimentalServerServices` over the Directory, with
  `remove` refused and plugins empty. A cell resolves only its own session
  id.
- **2026-09-05 — Frames arrive as Blob or ArrayBuffer depending on the
  peer.** workerd handed the in-process client's frames to the listener as
  Blobs, and `instanceof` failed across the test runner's realms. Both
  transports read either shape through a promise chain so order holds.
- **2026-09-05 — `lamb` runs `pi client`, not a TUI of its own**, from
  the pinned checkout with `PI_EXPERIMENTAL=1`, resolved through the ESM
  export map because pi-coding-agent has no CommonJS condition. With a
  prompt after `--` the reply streams and lamb exits, which is how the
  walks ran without a terminal.
- **2026-09-05 — `lamb export` is rows into pi's schema.** `node:sqlite`
  applies `INITIAL_SCHEMA_SQL` and inserts the seven tables; pi's Node
  backend opened the file and listed the same four entries. Journey 7
  step 3 walked early.
- **2026-09-05 — Journey 1 on the deployed home.** `lamb new --name
  deployed-j1 -- "…"` minted a cell and the model wrote a README and two
  files; `lamb attach` ran `find` and `grep -rn` in the cell and the output
  was right; a cell minted hours earlier and hibernated since answered from
  its transcript; `lamb attach` from an empty `HOME` with `LAMB_HOME` and
  `LAMB_TOKEN` alone read a file back; `lamb export` wrote 18 entries that
  pi's `SqliteStorage` over `node:sqlite` listed with pi's stats. Each turn
  ran under ten seconds.
- **2026-09-05 — Two one-shot clients cannot prompt one cell at once.**
  Two `lamb attach … -- "…"` runs a second apart: the first streamed, the
  second got pi's `LaneBusy` ("already has an active operation") and
  exited. Prompt mode calls `agent.prompt` directly; the TUI queues a
  prompt typed mid-turn. Journey 3 step 2 is a TUI claim and still holds
  in workerd; the deployed walk needs two terminals.
- **2026-09-05 — Open: the deployed walks that need a person.** A real
  second machine and a real night for journey 1; two terminals, an abort,
  and the dashboard's hibernation check for journey 3.
- **2026-09-06 — First real-model turn on a laptop found a wire fault.** pi's
  bash tool opens with a progress update of `details: undefined`; the
  transcript service replicated the `undefined`, pi's strict codec refused
  to encode the message, and pi-server dropped the connection. Only turns
  that called a tool failed, so it looked intermittent. The cell's host
  now normalizes every update to strict JSON before pi-server sees it, and
  a wire test drives a tool-calling turn. Upstream: pi's provider should
  strip `undefined` from `tool_update` partial results.
- **2026-09-06 — A one-shot client hanging up read as a server error.**
  workerd reports a vanished peer as a socket error; the listener now
  treats "connection lost" as a close.
- **2026-09-06 — First turn on the deployed home:** `lamb new -- "…"` from
  the laptop, the model ran `ls` in the cell and answered, over the
  WebSocket, with the secrets set by `wrangler secret put` from
  `.dev.vars`. Journey 1 step 1 on Cloudflare. Steps 4 and 5, overnight
  and a second machine, are now walkable.
- **2026-09-06 — One-shot mode dropped the first text delta.** Both
  locally and deployed, `lamb … -- "prompt"` printed replies missing their
  first token ("'m running…"); the first `text_delta` likely arrives
  inside the hydrated snapshot. Paid in lamb phase 5: lamb prints from
  the replica's streaming message and checks the whole reply at its end.
- **2026-09-05 — `pi client` left the published CLI.** Upstream #9132
  moved the `server` and `client` commands into a development entrypoint,
  `src/experimental/cli.ts`, that is not compiled into `dist/`; the stock
  `dist/cli.js` answered `lamb new` with `Unknown option: --connect`. lamb
  now spawns that entrypoint from the pinned checkout's source under pi's
  own `source-resolver`, exactly as pi's tests run it: Node strips the
  types and the resolver maps the workspace packages to their sources.
  Still an unmodified client; the bridge did not change.

## Phase 5 — The sheepdog's surface

**Status: CLOSED.** 5 Sep 2026. Journey 5 walked on the deployed home by
a Claude Code session, every step. Re-cut 5 Sep 2026; this slot was git,
built and withdrawn the same day, and that record is at the end of this
section.

**Closes journey 5**, and turns journey 1's `--detach` and journey 3's
queue from prose into behaviour.

**Work:**

- `lamb new` and `lamb attach` grow `--detach`: mint or resolve, send the
  prompt, print the id, exit before the first token. And `--wait` on a
  busy lane: queue, then stream the queued turn when it starts.
- A prompt to a busy lane queues through pi's own lane rules instead of
  surfacing `LaneBusy`, and `lamb` says it queued. The TUI already does
  this; prompt mode calls `agent.prompt` directly and must not.
- `lamb ls` prints one record per line with lane state; `lamb status
  <id>` prints the lane snapshot: open operation, last tool call, tokens.
- `lamb wait <id>…` blocks on the cell's own idle notification over the
  existing WebSocket, never polling a hibernated cell awake, and prints
  each sheep's last assistant message.
- `lamb abort <id>` is `AgentController.abort` over the wire.
- `lamb log <id>` prints the transcript as text, oldest first, with
  `--since`, `--last`, and `--json` whose entries are pi entries.
- `--json` on every command, shapes borrowed from pi, never invented.
- The dropped first delta in prompt mode (phase 4's open finding) is
  fixed here, because a program reads the whole reply.
- Tests in Node for the CLI against a cell in workerd, and one walk of
  journey 5 with three sheep on the deployed home.

**Proof:** Journey 5 walked by a Claude Code session in this repo against
the deployed home: three sheep minted detached in one command, `ls` and
`status` parsed, a queued prompt, a `wait` on all three, an abort, and a
`log`. The Findings record how many tokens the dog spent herding.

**Findings:**

- **2026-09-05 — Prompt mode was built for a person.** A second prompt to
  a busy lane was refused, the first delta dropped, `ls` had no lane
  state, and there was no wait or abort. This phase is that list.
- **2026-09-05 — Journey 5 walked on the deployed home.** Three detached
  mints in 3.9 s, `status` mid-turn with the running tool and tokens, a
  queued prompt with and without `--wait`, `wait` on three sheep in
  8.6 s, an abort in 0.5 s, `log`. The dog read about a hundred lines.
- **2026-09-05 — `prompt` over the wire resolves when the turn ends**, so
  `--detach` is the cell's own `POST /prompt`, which returns once durable.
- **2026-09-05 — A wire-driven turn had no heartbeat.** One lane watch now
  reports every transition to the Directory and arms the alarm for any
  driver, which is also how `ls` wakes nobody.
- **2026-09-05 — The queue is pi's `followUp`**, taken when the turn would
  otherwise end; an abort drops queued follow-ups and `--wait` says so.
- **2026-09-05 — A `wait` is one attachment per sheep**, which wakes a
  hibernated one once, as `lamb attach` does. Cost: 35 minutes, 24 the
  builder's, 7 the walk.
- **2026-09-05 — Open: the `waiting` state is wired and never seen.** The
  faux provider neither retries nor defers. Open: `lamb attach … | head`
  dies with an EPIPE stack trace when the pipe closes early; a program
  piping lamb should get a quiet exit.

**Formerly: Git, withdrawn.** Built 5 Sep as a just-bash command over
isomorphic-git against the workspace rows, twelve verbs with every other
refused by name, a smart-HTTP fixture in workerd, journey 5's steps held
there, and the read-and-egress half walked against this repository from
the deployed home. Withdrawn the same day: a facade that is almost git
costs more than a shell that says it has no git, and git is a program for
pen. Removed: `packages/cell/src/env/git.ts`, its test and fixture, the
`fs.promises` face of `CellFs`, the `LAMB_GITHUB_TOKEN` secret and the
author variables, and the isomorphic-git and diff dependencies, 43
packages. Kept: files in 1 MiB chunks under an 8 MiB cap.

- **2026-09-05 — A clone is one packfile, so one file is one row plus
  chunk rows.** A Durable Object value is capped at 2 MB; files are stored
  in 1 MiB chunks, the first in the row and the rest in `file_chunks`,
  with an 8 MiB per-file limit. The packfile forced it and the workspace
  keeps it.
- **2026-09-05 — A real repository finds what a fixture cannot.** `git
  clone --depth 1 <url>` parsed the `1` as the url, and `git diff` never
  emitted its header; the fixture used neither. The model covered for both,
  once by fabricating a real-looking diff. This is the finding that
  withdrew git: a command surface over a library is a second almost-git,
  and its bugs are the model's to hide.
- **2026-09-05 — The credential path worked as designed.** `x-access-token`
  plus the secret through `onAuth`, sent only to the remote, absent from
  `env`, every workspace path, and `.git/config`. Pen keeps the property
  through a credential helper the host controls rather than a hook.
- **2026-09-05 — The pnpm patch for `safe-buffer` is just-bash's**, via
  zstd's prebuild-install, not isomorphic-git's. It stays after the
  removal.

## Phase 6 — celld

**Status: PART-DONE** 5 Sep 2026. Walked on one local node: `celld dev`
accepted the Wrangler project, and journeys 1 and 3 ran through `lamb`
and pi's real client against it, with the session made before a node
restart still listed and readable after it, two terminals prompting at
once, and an export pi's Node backend opened. `pnpm dev:celld` reproduces
the setup. Missing: the two-node fleet with a bucket, and the node stopped
mid-turn with the turn finishing on the other node.

**Closes journey 6.**

**Work:**

- ⚑ provision: two celld nodes and a bucket, or a local two-node rig if
  celld's testing docs make one possible on one machine.
- `pnpm deploy:celld` running `celld deploy` from `packages/cell`. The
  Findings record what the deploy accepted and refused: the compatibility
  flags, the SQL API, hibernation, alarms.
- No code path that branches on the platform. Anything celld needs that
  Cloudflare does not is a finding first and a decision second.

**Proof:** Journeys 1, 2, and 3 walked against the fleet with `lamb --home`,
including the node holding a mid-turn cell stopped and the turn finishing
on the other node with the same transcript and workspace. The findings
say, for each celld claim the design leans on, whether it held.

**Findings:**

- **2026-09-05 — celld 0.4.0 has `celld dev`**: one node, a local object
  store, no Docker, state under `.celld/dev`. The design assumed a fleet
  was the smallest celld; it is not.
- **2026-09-05 — The same bundle runs.** SQLite per cell, alarms, the
  Directory's RPC, `fetch`, and `nodejs_compat`'s `node:fs` and `Buffer`
  all held; `celld deploy --dry-run` bundles the cell at 4.2 MB. The
  Worker code did not change for celld.
- **2026-09-05 — celld bundles with its own esbuild call**, found through
  `CELLD_ESBUILD`, and refuses Wrangler's `alias` key. A CommonJS
  dependency of just-bash, `safe-buffer`, does a dynamic
  `require("buffer")` that Wrangler's bundler shims and celld's leaves
  dynamic; a pnpm patch on `safe-buffer` takes the global `Buffer` first,
  which both runtimes provide.
- **2026-09-05 — celld's `setTimeout` returns a number**, where workerd's
  Node compat returns a Node-style timer. pi-server called `.unref()` on
  it unguarded and every WebSocket upgrade answered 500. One guarded line
  in pi-server, folded into patch 0004. Upstream: not yet proposed.
- **2026-09-05 — State survived a node restart.** A session made before
  `celld dev` was killed and restarted was listed and its transcript
  read after; the local object store is the durable half, as the design
  claims a bucket would be.
- **2026-09-05 — Open: celld logs an isolate-startup event for every
  resident cell every five seconds while idle.** Whether that is a
  restart or a report was not measured; a long-lived WebSocket held for
  the walk, which argues report.
- **2026-09-05 — A replaced node drains before it exits** and answers
  503 `{"draining": true}` meanwhile; a walk that restarts the node has to
  wait for the new listen line, not for the port to answer.
- **2026-09-05 — Open: the two-node walk.** No fleet and no bucket; the
  failover claim in journey 6 step 3 is untested.
- **2026-09-05 — celld drops work no request covers** (pen phase 6): a
  detached drive's timers never fired there until the cell put the drive
  under `ctx.waitUntil`. And celld 0.4.1 has no writable `node:fs`, so
  the marker write fails and no cell boots on it; 0.4.0 does. Open.

## Phase 7 — Nothing changed for pi

**Status: CLOSED** 5 Sep 2026. pi's full suite passed in every workspace
at the pinned commit with all four patches applied, in three minutes. The
patch set is four files under `vendor/patches`, each named in the phase
that made it with its upstream status, plus one pnpm patch on
`safe-buffer`. `lamb export` files from both `wrangler dev` and `celld
dev` opened in pi's Node SQLite backend with the same entries. A fresh
`npm install -g` of pi 0.85.0 from the registry runs beside `lamb` and
neither knows about the other. pi's `main` had not moved since the pin,
so the rebase measurement is zero.

**Closes journey 7.**

**Work:** No code by intent. Pi's full suite at the pinned commit with
lamb's patches applied; the patch set listed with each entry's upstream
status; the pinned commit bumped once to whatever pi's dev branch is that
day, the patches rebased, and the time it took recorded. If the bump
breaks a phase, that phase is reopened rather than this one growing work.

**Proof:** Pi's suite green with the patches. The `lamb export` file from
phase 3 opened by pi's Node SQLite backend. A fresh `npm install -g` of pi
from the registry runs on a laptop with `lamb` installed beside it and
neither knows about the other.

**Findings:**

- **2026-09-05 — The patch set is four patches and one pnpm patch.** 0001
  schema as a string and a `./sqlite` export; 0002 chunked entry lookups;
  0003 `OutputCapture` exported; 0004 a WebSocket transport and route, an
  `./experimental/*` export, the connection types from pi-server, and a
  guarded timer `unref`. None touches the harness, the loop, or a test.
  Upstream: none proposed yet; each is small enough to send as is.
- **2026-09-05 — pi's suite with the patches: every workspace passed,
  exit 0, three minutes wall.**
- **2026-09-05 — The pin is still pi's `main`**, so what a bump costs is
  unmeasured. The patches are all additive or one-line, which is the
  reason to expect a small number.
- **2026-09-06 — The patch set became a branch.** `vendor/pi` now tracks
  `sheep` on `github.com/dglazkov/pi`: four commits, 163 lines, over
  upstream `9841914`. Dimitri does not intend to upstream, so conflicts on
  a bump are resolved with git rather than `git apply`. `/pi-bump` is the
  procedure.
- **2026-09-06 — The client patch is gone.** `lamb` bridges a local Unix
  socket to the cell's WebSocket and runs an unmodified `pi client
  --connect unix://…`. Nothing on the branch touches pi's experimental
  client code any more; what remains is the SQLite backend, one export in
  agent-core, one in coding-agent's package.json, and pi-server's types
  and timer guard.
- **2026-09-05 — First bump: upstream `9841914` to `da840b6` (v0.85.1,
  nine commits), one conflict, about ten minutes wall.** The rebase itself
  took seconds. The conflict was `coding-agent/package.json`: upstream
  stopped compiling `src/experimental` into `dist/` and made its
  experimental entrypoints source-only, so lamb's `./experimental/*`
  export now points at the `.ts` source, which the cell's bundler and
  `tsc` read directly; typecheck clean, no dist duplication because the
  cell never imports the coding-agent's main entry. The same upstream
  change broke `lamb new` (phase 4 finding, same date), which no test on
  either side guards; the real-client walk caught it. Sheep's suites,
  pi's suites (the only failures six live Codex E2E tests the Codex
  server refuses for this account) and the walk with a tool call pass.
  The cost of a bump is not the rebase but pi's CLI surface moving under
  lamb.

---

## What the phases leave open

- **The next leg.** Execution tiers behind `Shell.exec`: a fresh isolate
  for model-written code and a container that syncs the workspace in by
  hash and the diff back out. The design names the seam and the journeys
  name the refusal that stands in until then.
- **Sub-agents as cells.** Pi's harness has lanes and forks; a child
  session as a sibling cell is a Directory row and a stub. Not this leg.
- **A permission gate that hibernates.** The leg after tiers.
- **What a bumped pi costs.** Phase 7 measures one rebase. Whether tracking
  pi's dev branch is sustainable is a question the number answers, and the
  answer decides whether the patch set has to reach upstream before the
  second leg starts.
