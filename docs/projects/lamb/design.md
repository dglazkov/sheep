# Lamb

**5 September 2026.** Design. Nothing built. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.

The thesis in one line: **a pi session is the durable half of a coding
harness, a Durable Object is the shape of a durable half, and everything a
harness does with a machine is the other half and can be rented.**

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the sheepdog, a coding agent working a goal a person
gave it; the ones it herds are sheep, pi sessions in cells; `lamb` is how
the dog herds. A person does not run `lamb`. That decides what the
terminal half of this design is for: pi's client, yes, so a shepherd can
watch, but first a surface a program can drive, with the id printed before
anything else and a queue where a person would see a refusal.

Lamb is pi, running in a cell. It walks and quacks like pi because it *is*
pi: the same harness package, the same session model, the same protocol,
the same client. What changes is where the session lives. Today a pi
session lives in a process on a laptop, and the laptop is the workspace,
the shell, the transcript's disk, and the one place a client can attach.
Lamb moves the session into a Durable Object, one per session, where the
transcript and the workspace are rows in the cell's SQLite, the client
attaches over a WebSocket from anywhere, and the loop resumes on its own
after the cell is evicted mid-turn.

This is the very first leg of a marathon. The marathon ends somewhere like
this: a harness whose durable half runs on Cloudflare or on a celld fleet
you own, unchanged; whose execution is tiered, a shell in the isolate for
most commands, a fresh isolate for model-written code, a disposable
container for anything native; whose sub-agents are sibling cells; and
whose permission prompts are rows that any attached client can answer, a
day later, from a phone. None of that is in this leg. **This leg proves
one thing: pi's harness runs in a cell, with a real workspace and a real
shell, attached from pi's own client, on Cloudflare and on celld.** If that
holds, the rest is plumbing. If it does not, nothing after it matters.

## What exists, exactly

Read from pi at `0.85.0` and from the platform docs before designing, so the
design changes location and not logic where it can. Pi has spent the last
several releases refactoring toward this shape, and most of the seams are
already cut.

- **The harness is runtime-neutral by intent.** `pi-agent-core`'s source
  imports Node in exactly one production file, `harness/env/nodejs.ts`, and
  the package exports it under a separate `./node` subpath. The loop, the
  operation state machine, compaction, the session model, and the four
  tools import nothing from Node. `pi-protocol` imports nothing from Node
  at all.
- **The tools reach the machine through one interface.** `read`, `write`,
  `edit`, and `bash` take an `ExecutionToolContext` holding an
  `ExecutionEnv`, which is `FileSystem` plus `Shell`: eleven filesystem
  methods (`absolutePath`, `joinPath`, `readTextFile`, `readTextLines`,
  `readBinaryFile`, `writeFile`, `appendFile`, `renameFile`, `fileInfo`,
  `listDir`, `canonicalPath`, plus `exists`, `createDir`, `remove`,
  `createTempDir`, `createTempFile`) and two shell methods (`exec`,
  `cleanup`). Every method returns a `Result`, takes a `Context`, and
  honours its abort signal. `NodeExecutionEnv` is the one implementation,
  and most of its seven hundred lines are child-process plumbing a cell
  does not need.
- **Storage is an interface with a conformance suite.** `Storage` is eleven
  methods over three stores: write-once entries, replaceable values and
  append-only lists, and a usage ledger, committed through one atomic
  `commit(writes)`. `SessionRepo` is five methods: `create`, `open`,
  `list`, `delete`, `fork`. Both ship conformance and benchmark suites
  under `harness/session/testing`, exported as a subpath so a backend
  outside the repo can run them.
- **A SQLite backend exists, and its database is an adapter.**
  `@earendil-works/pi-session-backend-sqlite-node` implements `Storage` and
  `SessionRepo` over a `SqliteDatabase` interface of four methods: `exec`,
  `prepare`, `transaction`, `close`, with `SqliteStatement` as `run`, `get`,
  `all`, `iterate`. `transaction` is **synchronous by contract**, which the
  Node backend satisfies with `node:sqlite`. The backend's `sqlite/`
  directory imports Node in two places: `repo.ts` for one-file-per-session
  path management, and `migrations.ts` to read `.sql` files off disk.
- **The harness already drives itself in steps and recovers.** The spec in
  `packages/agent/docs/harness.md` says a serving layer "may instead
  schedule `drive` calls through alarms, jobs, or another host runtime."
  `AgentHarness.create` returns the harness and the list of operations
  left open by a previous process, and `lane.resume` continues each from
  its last durable state. A provider stream cut mid-turn settles from the
  committed frame prefix with an honest interruption message and no second
  provider call. Tool calls are bracketed by intent and settlement commits,
  so a tool whose outcome is durable is never rerun.
- **There is a protocol, a client, and a server.** `pi-protocol` is CBOR
  envelopes routed to `{ serverId }` or `{ serverId, sessionId,
  attachmentId }`, with request correlation, cancellation, subscriptions,
  and out-of-band attachment changes. `pi-client` is transport-neutral:
  it takes a `ByteTransportFactory` and verifies the server's logical id on
  handshake. `pi-server` routes server-scoped and session-scoped service
  calls through connection attachments and ships a Unix transport. A
  session may have many presentation attachments at once.
- **The experimental client is already a presentation with no agent
  state.** Under `PI_EXPERIMENTAL=1`, `pi client` attaches to a server,
  subscribes to the `Transcript` and `AgentController` services, and
  renders pi's own interactive components from the replicated snapshot.
  Its transports are Unix sockets and the Radius relay, which is a
  WebSocket to a gateway with its own subprotocol and auth. **There is no
  plain WebSocket route.** This is the seam that is not yet cut.
- **The minimal worker is forty lines.** `experimental/mini/worker/run.ts`
  opens a session, builds an env, calls `AgentHarness.create` with the four
  tools, takes the `main` lane, and resumes what the last worker left open.
  That file is the template for the cell.
- **The model layer is fetch-based where it matters.** `pi-ai`'s Anthropic
  provider imports nothing from Node. Node appears only in Bedrock, the
  Codex OAuth flow, and the CLI. There is a Workers AI binding transport in
  `api/cloudflare-ai-binding.ts` already.
- **On the platform side:** a Durable Object's SQLite API is synchronous
  (`ctx.storage.sql.exec`, `transactionSync`), which is what pi's
  `transaction` contract needs. WebSockets hibernate, alarms wake an
  evicted object, and a cell gets 10 GB of storage and a 128 MB heap.
  celld runs the same Worker and Durable Object model on your own nodes
  with state replicated to a bucket you own, deploys from a Wrangler
  project, and lacks the Worker Loader and Containers. Neither is needed in
  this leg.
- **A bash interpreter exists that needs no process.** just-bash runs a
  shell in JavaScript over an `IFileSystem` interface, with pipes,
  redirection, globs, functions, loops, and the coreutils an agent reaches
  for: `ls`, `cat`, `grep`, `sed`, `awk`, `find`, `sort`, `diff`, `jq`,
  `tar`. Its core shell runs outside Node; its Python and JavaScript
  runtimes do not, and are not used.

## The cell

One Durable Object class, `SessionCell`, one instance per session, named
by the session id. It holds everything a pi session worker holds today:
the storage, the harness, the lane, and the model runtime. It also holds
what the laptop held: the workspace files and the shell. Nothing about a
session exists anywhere else.

```text
lamb (terminal)      lamb (terminal)          presentations: render, no agent state
      \                 /
       \               /                      WebSocket, pi-protocol frames
        \             /
        SessionCell (DO)                      harness, storage, workspace, shell
              |
        Directory (DO)                        session metadata: id, name, created, cwd
```

Mini's three roles, TUI, server, worker, become two. The server role, which
today routes calls and spawns workers, is folded into the cell for
session-scoped calls and into a second, singleton Durable Object,
`Directory`, for the server-scoped ones: `SessionDirectory` and
`SessionManagement`. A client connects to the cell directly at
`wss://<host>/s/<sessionId>`; server-scoped calls it makes on that
connection are forwarded by the cell to the Directory over a stub. The
protocol's `serverId` is the deployment's logical id, one per Worker, and
`lamb new` is an HTTP call to the Directory that mints a session id before
the socket opens.

**What phase 3 found** (5 Sep): the cell has no database file to hand
out, so `lamb export` is `GET /export`, pi's seven tables for the session
as JSON, rebuilt into a SQLite file by the terminal with `node:sqlite`.
And the test seam for eviction is a kill point that hangs the old
incarnation forever, because cancelling its context only makes it run
beside the new one.

**Lifecycle.** The cell is constructed on first request and on every wake.
Construction opens the storage, runs `AgentHarness.create`, and resumes
every operation the list of open ones names, exactly as the mini worker
does. It never waits for a client to do that. While an operation is open
the cell keeps an alarm armed a few seconds out, so eviction mid-turn is
followed by a wake, which is followed by construction, which is followed
by resumption. When the lane is idle the alarm is cleared and the cell
hibernates with its sockets. **The alarm is the heartbeat of an open
operation and nothing else.**

**Driving.** Pi's `lane.prompt` is a convenience that accepts an operation
and then waits, process-locally, for it to finish. The cell uses the
primitives underneath: `accept` durably creates the operation and returns,
and `drive` advances it on the cell's own event loop, detached from any
request. A client's `AgentController.prompt` call therefore returns when
the operation is accepted, and the transcript subscription carries the
rest. That is how the experimental services already behave; the cell
changes nothing on the wire.

**Limits, named.** A cell's CPU budget per event is bounded, but a drive
step spends its time awaiting a provider stream or a shell that yields,
which is wall time, not CPU. The in-isolate shell is the one CPU consumer
and just-bash bounds it by command count and wall clock. The heap is 128
MB, so the cell bundles `pi-agent-core`, `pi-ai`, `chord`, `pi-protocol`,
`pi-server`, and just-bash, and nothing from `pi-coding-agent`, whose
settings, auth, and TUI belong to the terminal.

## Storage

The cell does not write a storage backend. It writes a `SqliteDatabase`
adapter over `ctx.storage.sql` and hands it to pi's existing SQLite backend.

```ts
class CellSqliteDatabase implements SqliteDatabase {
  constructor(private sql: SqlStorage, private storage: DurableObjectStorage) {}
  exec(text: string): void { this.sql.exec(text); }
  prepare(text: string): SqliteStatement { /* run/get/all/iterate over sql.exec(text, ...params) */ }
  transaction<T>(callback: () => T): T { return this.storage.transactionSync(callback); }
  close(): void {}
}
```

`prepare` is the only piece with any body: it binds positional parameters
and reads the cursor. `transaction` is `transactionSync`, and the backend's
synchronous contract is met without a shim. Pi's conformance suites run
against this adapter inside workerd, through `@cloudflare/vitest-pool-workers`,
before anything else in this project is written. **If the suites do not
pass, this project stops at phase 1** and the design is rewritten around
whatever failed.

**What phase 1 found** (5 Sep): pi's `SqliteSessionRepo` runs in the cell
unmodified. Its schema scopes every row by session id and its
shared-container mode wants a single path, which workerd's in-memory
`node:fs` can satisfy with a marker file the factory touches on every
wake. So there is no `CellSessionRepo`; the cell constructs pi's repo over
`CellSqliteDatabaseFactory` with `databasePath` set to the marker. Two
patches were needed and live in `vendor/patches`: the schema inlined as a
string beside the `.sql` file with a `./sqlite` export that avoids
`node:sqlite`, and entry lookups chunked because the cell's SQLite binds
at most 100 variables. The adapter also drops the journal-mode and
busy-timeout pragmas and the explicit `BEGIN`/`COMMIT` around the fork
snapshot, which the platform owns or a single-threaded object does not
need, and reads `changes()` after each statement because the cursor's
`rowsWritten` counts index rows.

The session id is the Durable Object's name. `SessionMetadata.cwd` is
`/workspace`, always, because the cwd is a fact about the cell and not
about a machine.

## The workspace

The workspace is a table in the same SQLite, beside pi's own tables.

```sql
CREATE TABLE files (
  path     TEXT PRIMARY KEY,   -- absolute, normalized, under /workspace or /tmp
  kind     TEXT NOT NULL,      -- file | directory | symlink
  content  BLOB,               -- NULL for directories; link target for symlinks
  size     INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  mode     INTEGER NOT NULL DEFAULT 420
);
```

`CellExecutionEnv` implements pi's `FileSystem` over it. Every method is a
query or two: `listDir` is a prefix scan for direct children, `renameFile`
rewrites the prefix of every row under the source in one transaction,
`fileInfo` is one row, `canonicalPath` follows symlink rows. Path
resolution is POSIX and pure: `absolutePath` normalizes against
`/workspace`, `~` is `/workspace`, and anything that escapes both
`/workspace` and `/tmp` is a `FileError` with code `permission_denied`.
`createTempDir` and `createTempFile` write under `/tmp`, which the cell
truncates when the lane goes idle.

**One file is one row plus chunk rows, capped.** A Durable Object value is
limited to 2 MB, so a file is stored in 1 MiB chunks, the first in its row
and the rest in `file_chunks`, and a file is capped at 8 MiB in this leg;
a larger write is refused with `FileError("invalid")` naming the limit.
Lamb phase 5, as git before it was withdrawn, raised the cap from one
row because a clone writes its packfile as one file. Spilling large files to an object store is a later leg's
work. **Dependencies do not go in the workspace.** A `node_modules` tree
in a table is the wrong shape and the wrong leg; the container tier owns
installs.

The same table backs just-bash. `CellFs` implements just-bash's
`IFileSystem` over the same rows, so a file the model wrote with `write`
is the file `cat` prints, with no sync between two filesystems because
there is one.

## The shell

`Shell.exec` runs the command in a just-bash instance whose filesystem is
`CellFs`, whose cwd is the env's, and whose network is off. Output flows
into pi's `OutputCapture` as the Node env feeds it from a child process,
so truncation and spill to a temp file behave as they do on a laptop. One
difference, found in phase 2: just-bash returns output when the command
ends, so this shell does not stream and the bash tool's periodic
checkpoints never fire for it. The exit code is just-bash's. `cleanup` is
a no-op, because there is no process tree.

**The shell says what it is.** A model trained on real bash will type
`python3`, `npm test`, and `cargo build`. In this leg those are absent, and
the refusal has to be one the model can act on: `bash: python3: command not
found (this shell runs inside the session; no interpreters or package
managers are installed)`. The system prompt says the same thing once, up
front. Silent partial success is the failure mode to design against, not
the missing command.

Execution tiers, a fresh isolate for model-written code and a container
for native work, are the marathon's second leg. `Shell.exec` is the seam
they slot behind, and the bash tool's `prepare` hook is where a command is
routed. Nothing in this leg forecloses either.

## The wire

The cell speaks pi's protocol over a hibernating WebSocket, and the terminal
speaks it back through pi's client with one new transport.

**Server side.** A `ServerListener` for `pi-server` whose connections are
the cell's WebSockets. Each message is one protocol frame, so the byte
framing is length-prefixed CBOR inside a binary message, unchanged from the
Unix transport. `RoutedServerServiceHost` and `RoutedSessionHandle` are
pi's; the cell provides the `ServerHost` with a resolver that knows one
session and an `openSession` that returns the harness the cell already
holds. **What phase 4 found** (5 Sep): the sockets are standard, not
hibernating. pi-server keeps a connection's handshake stage and attachments
in memory and pi's client never reconnects on its own, so a wake would end
in a reconnect either way; a cell with a terminal attached stays in memory
and hibernates when the last one leaves. The session-scoped services are
pi's own `createSessionWorkerServices` run in-process over the cell's lane,
and the server-scoped ones are pi's `createExperimentalServerServices` over
the Directory.

**Client side.** A `ByteTransportFactory` over a WebSocket: `send` is
`socket.send(bytes)`, inbound messages are `handlers.onData(chunk)`, close
and error map to their handlers. That is the whole transport. The Radius
relay's transport in `pi-coding-agent` already does the same over undici's
WebSocket, minus the relay's header, and is the reference.

**The terminal.** `lamb` runs an unmodified `pi client` against a local
Unix socket that it bridges to the cell's WebSocket. pi's Unix transport
is a byte stream of length-prefixed frames and the cell's listener takes
one frame per message, so the bridge re-frames in one direction and
passes frames through in the other, about a hundred lines in
`packages/lamb/src/bridge.ts`. The socket is named `<serverId>.sock`
because that is how pi's client learns the server id it verifies at the
handshake, and `GET /home` answers the id. This replaced a patch that
taught pi's client a WebSocket route (5 Sep) so that no commit on the
`sheep` branch touches pi's experimental client code. With a prompt after
`--` the reply streams and lamb exits, as pi does when stdout is not a
terminal.

```
lamb new [--name <name>] [-- <prompt>]   # mint a session at the Directory, attach, open pi's TUI
lamb -c | --continue [-- <prompt>]       # attach to the newest session
lamb attach <sessionId> [-- <prompt>]    # attach to a named one; a second terminal on the same cell
lamb ls                                  # the Directory's list
lamb export <sessionId> [file]           # pi's rows rebuilt into a SQLite file pi's Node backend opens
lamb --home <url>                        # which deployment; default from ~/.lamb/config
```

Auth in this leg is one bearer token per deployment, a Worker secret, sent
as a header on the upgrade. That is not a multi-user story. It is the
minimum that keeps a public URL from being an open agent, and the identity
question is named in the journeys as open.

## Models

The cell calls the provider through `pi-ai` with `fetch`. The API key is a
Worker secret. `pi-coding-agent`'s `ModelRuntime`, which reads auth files
and settings from `~/.pi`, stays in the terminal, and the cell's `Models`
service answers with the providers its secrets name. The lane's model and
thinking level are lane configuration in the session, as they are in pi,
so `/model` in the TUI writes the same value it writes today. On Cloudflare
the AI Gateway binding is available through pi's existing transport and is
optional; on celld the key goes straight to the provider.

## Git, and programs

`git` is a program, and the cell cannot spawn one. On 5 September a
facade was built and withdrawn the same day: twelve verbs as a just-bash
command over isomorphic-git, with `CellFs` grown an `fs.promises` face
and credentials through `onAuth`. It held in workerd against a fixture and
half-walked against a real repository, and the walk was the argument
against it. A hand-written command surface over a library that
reimplements git is two layers of almost-git, and every verb a model
reaches for that the fixture did not is a bug the model then covers for.
The shell now refuses `git` with the sentence it refuses `npm`, and the
system prompt says the same thing once.

The repository journey moves to the second leg, [pen](../pen/design.md),
where git is real git in a container over a checkout synced from the
workspace rows, and the credential is held at the home behind a helper
the host controls. `Shell.exec` is the seam; nothing in this leg builds
behind it. What the facade left behind and the workspace keeps: files in
1 MiB chunks under an 8 MiB cap, which a packfile forced and which any
large file wants.

## celld

The same Wrangler project, deployed with `celld deploy` to a fleet whose
bucket the operator owns, or run on one node with `celld dev`. celld
advertises the Durable Object model in full: SQLite per cell, alarms,
hibernating WebSockets. What the cell uses is exactly that and `fetch`.
What celld lacks, the Worker Loader and Containers, this leg does not
touch. **What phase 6 found** (5 Sep): the same bundle ran on a local
node unchanged. Two things around it differed: celld bundles with its own
esbuild and refuses Wrangler's `alias`, so a CommonJS `require("buffer")`
deep in just-bash's dependencies (`safe-buffer`, under zstd's
prebuild-install) is handled by a pnpm patch rather than a bundler
alias; and celld's `setTimeout` returns a number, which
one guarded line in pi-server absorbs. The one deliberate difference is
cost shape: a hibernated session on celld costs bucket storage, which is
the shape a session that is mostly idle wants.

## Packages

```text
packages/
  cell/      the Worker: SessionCell, Directory, CellSqliteDatabase, CellExecutionEnv,
             CellFs, the shell, the WebSocket listener; wrangler.jsonc; vitest in workerd
  lamb/      the terminal: pi's experimental client TUI plus the WebSocket transport
             and the lamb commands
vendor/pi/   pi as a submodule on the `sheep` branch of a fork: upstream plus a few commits
```

Pi is a dependency, never a copy. Every change the cell needs in pi is one
commit on the `sheep` branch of `github.com/dglazkov/pi`, named in
phases.md; `git log upstream/main..sheep` in the submodule is the whole
difference, and rebasing it onto upstream is how pi is bumped. The list is
expected to stay short and confined to slow-moving files. It started as
`.patch` files applied on checkout (5 Sep) and became a branch on 6 Sep so
that conflicts on a bump are resolved with git rather than by hand.

## Considered and left out

- **Building on the Agents SDK's fibers instead of pi's harness.** Fibers
  checkpoint a replacing snapshot and recover through a hook; pi's harness
  already does that and more, with intent and settlement around every
  effect and a spec that anticipates alarm-driven driving. Using both would
  mean two recovery stories for one loop.
- **Building on Flue.** Flue's hooks hide the loop that lamb needs to drive
  in steps, and lamb wants pi's session tree and pi's client, which Flue
  does not expose. Flue is a framework over a harness; lamb is the harness
  in a new place.
- **The container disk as the workspace.** The Sandbox SDK's natural model
  makes the container the source of truth. That gives up the thing this
  project exists for: a session whose state is rows, evictable and
  portable. The container is a cache, and this leg has no container.
- **A plain `fetch`-and-`ws` protocol of lamb's own.** Mini has one, and it
  is what proved the harness from a client. But `lamb attach` from a second
  terminal, transcript replication, and cancellation are all things
  `pi-protocol` and Chord already do, and the cost of speaking pi's wire is
  one transport on each side.
- **Running the model call outside the cell** through a queue or a
  Workflow, to get it off the cell's event loop. The stream is I/O wait, the
  harness already settles an interrupted stream honestly, and a second
  process means a second recovery story.
- **Storing files as pi entries or values.** The three stores are the
  conversation and its state; a workspace is a different thing with
  different queries, and a table beside pi's is the honest shape.

## What this is still not

- **Not sandboxed against the model in any new way.** just-bash runs in the
  cell's isolate. A hostile script has the cell's heap and the cell's CPU
  budget and nothing else, which is the same trust pi extends to a shell
  today, narrowed by the absence of a network and a process table.
- **Not multi-user.** One token per deployment. Who a session belongs to,
  and who may attach to it, is a later project.
- **Not a place to run tests.** No interpreter, no package manager, no
  container. The shell is for the eighty percent of commands that are text
  over files, and the marathon's second leg is the other twenty.
- **Not a replacement for pi on a laptop.** Nothing in pi changes for a
  person who never runs `lamb`, and journey 7 exists to prove it.
