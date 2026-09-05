# Lamb: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey it closes, and a phase that
claims one closes only when the journey is walked for real. Each phase is a
discrete amount of work ending in a testable outcome, named up front.

**How the work runs.** Claude does all of it, and a working session is a
**conductor**: it reads the "where we are" line below, spawns a subagent on
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

**Where we are: ALL SEVEN PHASES BUILT 5 Sep 2026; phases 1, 2, and 7
CLOSED, phases 0, 3, 4, 5, and 6 PART-DONE.** Every proof that can run
locally has run: pi's conformance suites, journey 4 in workerd, journey 2's
eviction test at every transition, journey 3 over pi's protocol on
WebSockets, journey 5 against a git server, journeys 1 and 3 through
`lamb` and pi's real client against both `wrangler dev` and a single
`celld dev` node, and an export pi's Node backend opens. What remains is
every walk that needs a deployed Cloudflare home, a real model, a real
GitHub token, or a two-node celld fleet. The next thing to do is provide
those and walk them; the code is not expected to change for it.

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

**A second rule.** Pi is a dependency. A change the cell needs in pi is a
patch in `vendor/pi`, named in the phase's Findings with its upstream
status, and never a copy of a pi file into `packages/`.

**Deliberately open.** Postponed on purpose, so a later session decides
instead of improvising mid-task:

- **Execution tiers.** A fresh isolate for model-written code and a
  container for native work are the marathon's second leg. `Shell.exec` is
  the seam; nothing here builds behind it.
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

**Status: PART-DONE** 5 Sep 2026. Built and proved locally: `pnpm test`
runs the cell's two tests in workerd and the CLI's two in Node, all
passing; `lamb --version` prints; typecheck clean. Missing: `pnpm deploy`
and the `curl` against the scratch home, because no `CLOUDFLARE_API_TOKEN`
was in the environment. Closes when the token arrives and the deploy
answers.

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

- **2026-09-05 — Open: the deploy half of the proof is not run.** No
  Cloudflare token in the environment. Everything else in the phase is
  proved locally.
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
- `CellFs`: the table behind three faces. Pi's `FileSystem`; just-bash's
  `IFileSystem`; and Node's `fs.promises` subset that isomorphic-git will
  need in phase 5, written now because it is the same rows. POSIX path
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
`wrangler dev` with the faux provider. Missing: the same walk on the
scratch home with a real model and a real mid-turn redeploy, waiting on
`CLOUDFLARE_API_TOKEN` and `LAMB_ANTHROPIC_API_KEY`.

**Closes journey 2, and journey 1 through the HTTP route.** The terminal
half of journey 1 waits for phase 4.

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
- **2026-09-05 — Open: the scratch-home walk with a real model** and the
  mid-turn redeploy are not run. No Cloudflare token and no Anthropic key
  in the environment.

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
interactive TUI drew pi's session header under a pseudo-terminal. Missing:
the overnight and second-machine steps of journey 1 and the dashboard
check of journey 3, all on a deployed home, waiting on a Cloudflare token.

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

**Proof:** Journey 1 walked end to end from two machines: `lamb new`,
files made and grepped, the laptop closed overnight, `lamb -c` the next
morning, `lamb attach` from Theo's machine with only the id. Journey 3
walked with two terminals side by side: both stream, Theo prompts and
aborts, one closes and the other notices nothing, both close and the cell
hibernates with the alarm clear, checked from the dashboard.

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
- **2026-09-05 — Open: the deployed walks.** Overnight, a second machine,
  and the dashboard's hibernation check need a Cloudflare token.
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

## Phase 5 — Git

**Status: PART-DONE** 5 Sep 2026. Built and proved locally: `git` is a
just-bash command over isomorphic-git against the workspace rows, with
clone, status, add, commit, log, diff, checkout, branch, remote, push, and
pull, and every other verb refused by name; files are stored in 1 MiB
chunks so a packfile fits, with the per-file limit now 8 MiB. Journey 5's
steps run in workerd against a bare fixture served over smart HTTP by
`git http-backend` from vitest's global setup: clone, a branch, the typo
fixed with `sed -i`, status and diff, add, commit, push, log, `rebase -i`
refused, and a fresh clone in a second cell showing the fix. The fake
credential appears in no shell environment, file, or config. Missing: the
push to a real GitHub repository, waiting on `LAMB_GITHUB_TOKEN`.

**Closes journey 5.** The largest piece of new code in the leg, and the one
to cut down first if the leg runs long: the journey needs `clone`,
`status`, `add`, `commit`, and `push`, and the rest is what a model
expects beside them.

**Work:**

- isomorphic-git over `CellFs`'s `fs.promises` face and
  `isomorphic-git/http/web`, with `onAuth` reading a Worker secret and the
  author from the home's configuration.
- `git` as a just-bash custom command: `clone`, `status`, `add`, `commit`,
  `log`, `diff`, `checkout`, `branch`, `push`, `pull`, output shaped like
  git's; every other verb answered with `git: <verb> is not available in
  this shell`.
- A clone that meets a file over the cap is refused whole, with the file
  named, and leaves no partial tree.
- A test in workerd against a fixture repository served from the test:
  clone, branch, edit, status, diff, commit, push, and the pushed tree
  compared object by object.
- ⚑ provision: a GitHub token scoped to one scratch repository, as a
  Worker secret on the home.

**Proof:** Journey 5 walked against a real repository on GitHub: cloned,
a typo fixed on a branch, pushed, the branch found on GitHub with the
configured author, and a laptop `git fetch` showing the same tree. The
token appears nowhere in the transcript, the workspace, `env` in the
shell, or any tool result, checked by grepping the exported session file.
`git rebase -i` answered with the sentence.

**Findings:**

- **2026-09-05 — A clone is one packfile, so one file is now one row plus
  chunk rows.** isomorphic-git writes what it fetched to
  `.git/objects/pack/*.pack` as one file, which the 1 MiB cap refused
  whole. Files are stored in 1 MiB chunks, the first in the row and the
  rest in `file_chunks`, and the per-file limit is 8 MiB. The object-store
  spill stays open; this is the stand-in that keeps everything in the cell.
- **2026-09-05 — isomorphic-git runs in workerd over an `fs.promises` face
  of eighty lines.** It reads `isFile`, `isDirectory`, `isSymbolicLink`,
  `mode` with type bits, `mtime`, `ctime`, `ino`, `uid`, `gid`, and `dev`;
  the inode is a hash of the path, which is what its index needs to tell
  files apart.
- **2026-09-05 — `statusMatrix` rows are `[HEAD, WORKDIR, STAGE]` and a
  stage of 2 means "same as the working tree", which is the staged case.**
  Read backwards the first time; `git add` then `git status` showed
  nothing staged.
- **2026-09-05 — `git diff` reads the index as the working tree** for
  stages 2 and 3, because isomorphic-git's public API has no cheap way to
  read an index blob. Cosmetic: the patches were right in every case the
  test checks.
- **2026-09-05 — The fixture is `git http-backend` behind fifty lines of
  Node CGI**, started by vitest's global setup on 127.0.0.1:4180 with
  `http.receivepack` on. workerd reaches it. git's own "push negotiation
  failed; proceeding anyway" warning from the seed push is noise.
- **2026-09-05 — The credential is `x-access-token` plus the secret**
  through isomorphic-git's `onAuth`, sent only to the remote. The shell's
  `env`, every workspace path, and `.git/config` were checked for the fake
  secret and it was in none.
- **2026-09-05 — Open: the real GitHub push.** No `LAMB_GITHUB_TOKEN` in
  the environment; the walk against a real repository waits.

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
  dependency of isomorphic-git, `safe-buffer`, does a dynamic
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
