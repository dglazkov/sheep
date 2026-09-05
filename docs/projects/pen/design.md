# Pen

**5 September 2026.** Design. Nothing built. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.

The thesis in one line: **a cell should never become a machine; it should
rent one for the length of a command and keep only what the command
changed.**

Lamb ([../lamb/design.md](../lamb/design.md)) argued that a pi session is
the durable half of a coding harness and a Durable Object is the shape of
a durable half, and put the sheep a sheepdog herds into cells. The other
half, everything a harness does with a machine, was declared rentable and
then not rented: a sheep's shell is an interpreter in the isolate, and for
anything native it says one sentence, and the dog does that work itself.
Pen is the renting, so the dog can delegate it. A container is started on the first command that needs one,
given a checkout of the workspace, asked to run the command, and asked
what it changed. Then it is forgotten. The rows in the cell remain the
only truth; the container's disk is a cache with a lifetime.

Pen was written the day lamb's `git` was withdrawn, and the withdrawal is
the argument for the shape. Lamb built `git` as twelve verbs over
isomorphic-git in the isolate, and one walk against a real repository
showed what a facade costs: bugs in the surface that the fixture never
exercised, and a model that covered for them. A program is a program. It
runs where programs run, and the cell's job is to get the files there
and back.

## What exists, exactly

- **`Shell.exec` is the seam.** Pi's `ExecutionEnv` has one method a
  command enters through, and lamb's `CellExecutionEnv.exec` is where
  just-bash is called. Pen replaces that call with a router and nothing
  else in pi or lamb changes. Pi's bash tool, its renderer, its timeout
  code, and its truncation all see a `ShellExecResult` as before.
- **The workspace is rows with hashes.** Lamb's `files` table stores
  content in 1 MiB chunks under an 8 MiB cap, with mtimes. Pen adds a
  content hash column, computed on write, so a manifest is one query.
- **Cloudflare Containers** run an image beside a Durable Object, started
  from the object, addressed by the object, and stopped when the object
  says or when idle. The object holds the container's lifecycle, which
  is the shape pen wants: one container per cell, at most.
- **The Worker Loader** runs code in a fresh isolate with bindings the
  parent chooses. That is tier 1, and it is pen phase 5, the phase
  allowed to slip out of the leg.
- **celld** has neither. What it has is a node the operator owns, where a
  container runtime can run beside it. The protocol is the same; who
  starts the container is configuration.
- **Lamb's refusal sentence** lives in one file and a test checks the
  shell and the system prompt carry the same words. Pen makes that file a
  table.

## The router

A command enters `Shell.exec` as a string. The router does not parse
bash. It asks just-bash to parse, takes the first word of each simple
command, and looks each up in the table:

| Program | Tier 0 | Tier 1 | Tier 2 |
| --- | --- | --- | --- |
| the text tools (`ls`, `cat`, `grep`, `sed`, `find`, `jq`, …) | yes | no | yes |
| `git` | no | no | yes |
| `node`, `pnpm`, `npm`, `npx` | no | `node` only | yes |
| `python`, `pip` | no | no | yes |
| everything else | no | no | if the image has it |

The rule is: a command line runs whole in one tier, the lowest that has
every program in it, except that tier 1 is chosen only when no container
is up. A line that is all tier 0 runs in just-bash as it does in lamb,
whether or not a container is up. A line with any program that only tier
2 has runs whole in the container, through the container's own bash. A
line that names a program the table does not list goes to the container
when this home has one, and the container's bash answers for it. A line
that names a program no tier this home has can run is refused with the
sentence for that program, which names the tier that would have it and
whether this home has one.

The system prompt is generated from the same table, so the model is told
once, up front, what runs where, and the refusal repeats it. When no
container binding is configured, the tier-2 column is empty and the
table generates lamb's sentence exactly. That is journey 6, and it is a
test.

## The checkout

The container holds a checkout of the workspace under `/workspace`,
synced by content hash.

**Sync in.** Before a tier-2 command, the cell sends the manifest: every
row's path, kind, mode, and hash. The container compares it with what it
has, requests the blobs it lacks by hash, and writes them. Deletions in
the manifest are deletions in the checkout. An unchanged file costs one
manifest line.

**Sync out.** After the command, the container walks the checkout, hashes
what changed since the manifest, and sends the diff: new and changed
files as blobs, deletions as paths. The cell writes each file whole, in
one transaction per file, so a row is never half of before and half of
after. Files over the per-file cap are refused by name in the tool
result, and the command's other changes still land. The refusal happens
before the bytes move: `changed` carries each file's size, and the cell
asks only for what fits.

**The cache rule.** Paths matching the checkout's `.gitignore`, plus a
short built-in list (`node_modules`, `.venv`, `dist`, `build`,
`__pycache__`), stay in the container and never sync back, and a sync-in
never deletes them. They are rebuilt by the command that made them. The
model is told the rule in the system prompt and can change it with
`.gitignore`, which is the tool it already knows.

**`.git` syncs.** A repository's objects are files, they fit the cap in
the common case, and they are what makes a clone survive the container.
When one does not fit, the tool result names the object and the design's
open question about an object store gets its first real case.

## The container protocol

The container is a client of the cell. On start it opens one
authenticated WebSocket to the cell, using a token the cell minted for
that container's lifetime, and everything else is messages on it:

- `manifest` from the cell; `need [hashes]` from the container; `blob`
  frames from the cell, the bytes as binary messages; `checkout` from
  the container once the tree is on its disk.
- `run {command, cwd, env, timeout}` from the cell; `stdout`, `stderr`
  frames from the container as they happen; `exit {code}` or `killed
  {reason}` at the end. `kill {reason}` from the cell ends a run early,
  when pi's timeout fires or the turn is aborted, and `killed` answers
  it.
- `changed {manifest diff}` from the container after a run, or on
  `sync` from the cell when there was none; `need
  [hashes]` from the cell, which asks only for what it will accept;
  `blob` frames up; `synced {refused}` from the cell. The dance is the
  same in both directions: whoever holds the newer tree describes it,
  the other side asks for the bytes it lacks.
- `credential {kind, scope}` from the container's helper; `credential
  {value, expires}` from the cell, after the cell asks the home.

The cell never connects to the container. The container never holds a
home secret. A container that loses its socket stops its command and
exits; the cell sees the close and settles the command as interrupted,
which is journey 3.

## Credentials

A program in the container that needs a credential asks the helper. For
git that is a credential helper configured in the image, `credential.helper
= pen`, which reads the request git makes, sends `credential {git,
host}` to the cell, and answers git with what comes back. The cell holds
no token either: it asks the home, which holds the operator's secrets and
mints a short-lived, scoped value for this one request. The value goes
into git's process and nowhere else. Nothing writes it to disk, nothing
exports it, and the model's tool result is git's output. The author of a
commit is the home's configuration too: the container's git config gets
`user.name` and `user.email` from the cell at start, which is journey 2
step 4.

This is lamb's "secrets at the home, never in the session," kept, and
moved from an `onAuth` hook in the isolate to a helper in the container.
The property is the same; the test is the same; the thing under test is
real git.

## Lifecycle and cost

A container is started by the first tier-2 command in a lane and stopped
when the lane has been idle for a period the home configures, or when
the cell hibernates. Its start is the sync-in; its stop is nothing, since
the last sync-out already happened. A container is never kept for a
hibernating cell: the rows are the truth and the container is a cache.
The cost shape is what a session that is mostly idle wants: rows always,
minutes only while a command runs.

A home has a container budget. When it is spent the router's tier-2
column empties for that home and the refusal says so.

## Tier 1

`node <file>` when no container is up runs in a fresh isolate from the
Worker Loader, with the workspace as its only binding and no `fetch`.
Its stdout is the tool result. It exists so that a quick script does not
rent a machine, and it is the phase allowed to slip out of the leg
because the container makes it optional. On celld, where the loader does
not exist, `node` is tier 2 and the table says so.

## celld

The same cell, the same protocol. What differs is who starts the
container: on Cloudflare it is the Containers binding, on celld it is a
runtime on the node that the cell reaches through a local endpoint the
operator configures. The image is the same. What celld cannot do is
measured in pen phase 6 and written down.

## Packages

```text
packages/
  cell/      lamb's Worker, plus: the router, the manifest and sync, the container
             protocol's cell side, the credential broker, the tier-1 loader
  pen/       the container image: a small base with node, pnpm, python, git, and
             the pen agent that speaks the protocol and the git credential helper
  lamb/      unchanged
```

Pen adds no pi tool and no pi patch. `Shell.exec` is the whole seam.

## Considered and left out

- **Keeping git in the isolate.** Lamb tried it. See the withdrawn-git
  record at the end of lamb phase 5 in
  [../lamb/phases.md](../lamb/phases.md).
- **A container that owns the workspace.** Then the container is the
  truth and the cell is a proxy, which is a machine with extra steps.
  The rows are the truth so that a container can die.
- **Syncing by mtime.** Clocks in two places. Hashes are one place.
- **A persistent volume per cell.** Cheaper starts, and a second truth.
  Named in open questions as a cache-warming optimization, not a
  storage tier.
- **Running the model's code in the container by default.** It works, and
  it rents a machine for a ten-line script. Tier 1 is the cheaper answer
  when it exists; the router prefers it only when no container is up.
