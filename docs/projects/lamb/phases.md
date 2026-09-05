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

**Where we are: PHASE 0 PART-DONE 5 Sep 2026.** The scaffold builds and its
proof runs in workerd; the deploy half waits on a Cloudflare token. The
next thing to do is phase 1.

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

**Status: NOT STARTED.**

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

- None yet.

## Phase 2 — The workspace and the shell

**Status: NOT STARTED.**

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

- None yet.

## Phase 3 — The cell

**Status: NOT STARTED.**

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

- None yet.

## Phase 4 — The wire, and the terminal

**Status: NOT STARTED.**

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

- None yet.

## Phase 5 — Git

**Status: NOT STARTED.**

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

- None yet.

## Phase 6 — celld

**Status: NOT STARTED.**

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

- None yet.

## Phase 7 — Nothing changed for pi

**Status: NOT STARTED.**

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

- None yet.

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
