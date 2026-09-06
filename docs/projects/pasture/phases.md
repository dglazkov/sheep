# Pasture: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey steps it closes, and a
phase that claims a walk closes only when the walk was walked for real.
The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)): the cell's
proofs run in workerd, never in Node; pi is a dependency, and a change
sheep needs in it is one commit on the fork named here; findings are one
dated line of about forty words; steps marked **⚑ provision** create,
change, or delete a cloud resource and are asked out loud first.
`/conduct pasture` is the procedure. Phase citations name their project:
`pasture phase 2`, never a bare "phase 2".

**Two rules for this project.** A sheep with no pasture is byte for byte
the sheep of 6 Sep 2026: its prompt, its shell, its tools, its rows. Every
phase's proof includes the suites that held that day, unchanged in what
they assert, and the literal-prompt test from pasture phase 1 on. And
everything in a pasture that can be a file is a file: a phase that finds
itself adding a property with a verb of its own, where a path in the
tree would do, has left the design.

---

**Where we are: pasture phases 0, 1, and 2 CLOSED; phase 3 NOT STARTED.** Planned 6 Sep 2026, the morning recast closed, from a brainstorm with the shepherd; the shepherd's calls are in the journey's front matter. Phase 0 built the same morning: the object, the columns, the routes, the verbs. Phase 1: the read-only mount and the prompt. Phase 2: the `pasture` program, the task column, and the herd as one query behind two views, walked on a local home with a real model. The next phase is pasture phase 3, birth and the credential, the first that needs a container. Nothing waits on a person before pasture phase 5.

The order is dependency order. Phase 0 is the object, the directory's
two columns, the routes, and the dog's verbs, so that every later phase
has a pasture to point at and a way to fill it. Phase 1 is the mount and
the prompt: the read path, which every later phase reads through, and
the literal test that guards the pastureless sheep. Phase 2 is the
program: the write path and the herd. Phase 3 is birth, the first phase
that needs a container, and the broker's lookup. Phase 4 is setup and
skills, the two conventions with behaviour. Phase 5 is the walk: the
class deployed to both homes and the four journeys on them.

**Deliberately open.** Postponed on purpose: a GitHub App in place of
tokens (the broker's lookup is its seam); a cache for the tree (the
manifest's hashes are its key); what each sheep pushed in the herd view;
messaging between sheep; per-pasture defaults for model or budget.

---

## Phase 0: The object, and the verbs

**Closes:** journey 1 steps 1 to 3 and its last criterion; journey 4
step 3 and its last criterion; the `sheep ls` column of journey 1 step
6 and journey 4 step 4.

**Work:** `packages/cell/src/pasture.ts`: the `Pasture` Durable Object,
`meta` (`repo`, `branch`, `created_at`), lamb's `FilesTable` rooted at
`/pasture`, and `secrets`; methods for the manifest, read by path, read
by hash, put, rm, secret set, secret names, and meta. The directory:
`pastures (name, created_at)`, and `sessions` gains `pasture` and
`task`, added with the `ALTER TABLE` pattern lamb phase 5 used so a home
deployed before this project keeps its rows; `create(name, pasture)`
refuses an unknown pasture, and refuses a pasture with a repository when
the home has no container, with the design's sentence; `herd(pasture)`
and `list()` carry the two columns. Routes in `index.ts`: `/pastures`
and `/p/<name>/…` per the design, behind the token. `wrangler.jsonc`: the
`PASTURE` binding and a migration tag adding the class, on the top level
and in the `pen` environment. The CLI: `sheep pasture new|ls|cat|put|rm|
secret set|secret ls` and the bare `sheep pasture <name>`, `--repo .`
reading `git remote get-url origin` and refusing with a sentence when
there is none, `secret set` reading stdin only, `sheep new --pasture`,
`sheep ls --pasture` and the last column, `--json` with `pasture`.
Usage text for all of it.

**Not this phase:** No `/pasture` in a cell, no prompt change, no
program, no birth. A sheep born into a pasture in this phase is a row
with a column.

**Proof:** In workerd: the object's tree round-trips a file through
`put`, `cat`, `rm` and the manifest; a secret's value is readable by the
object and by no route; the directory refuses an unknown pasture and,
with `container: false`, a pasture with a repository, each with the
design's sentence held as a literal; `sessions` on a database made
before this phase gains the columns and keeps its rows. Against a local
home through `bin/sheep.js`: journey 1 steps 1 to 3 with a scratch
repository as `--repo .` and with a URL, `secret ls` printing the name
only, `sheep new --pasture` then `sheep ls` showing the column and
`--json` the field, and journey 4 step 3's refusal verbatim. `pnpm test`
and `pnpm -r typecheck` exit 0; the pre-project suites unchanged. **⚑**
none: the migration is written, not deployed.

**Status: CLOSED.** 2026-09-06. The object, the directory's columns, the routes, and the dog's verbs built and proved in workerd; journey 1 steps 1 to 3 and journey 4 step 3 walked by the conductor on a local faux home through `bin/sheep.js`.

**Findings:**

- **2026-09-06 — Lamb's `FilesTable` had no root: `/workspace` and `/tmp` were constants and the fence was hard-coded.** The constructor gained a `roots` list and `manifest` a root, defaults unchanged, so the pasture's tree is the same class rooted at `/pasture`, not a copy.
- **2026-09-06 — vitest-pool-workers counts an Error rejected from an async Durable Object method as unhandled even when the caller catches it.** `Directory.create` stays sync, and the Worker asks `refusal()` first; the refusals are the directory's, before any cell exists.
- **2026-09-06 — `sheep ls` now ends a pastureless row with a tab.** A reader that trims a line loses the empty column; journey 5's test reads only four columns and holds unchanged. `--json` carries `pasture: null`.
- **2026-09-06 — Open: `return runX(...)` inside `main`'s `try` in `cli.ts` returns the promise unawaited,** so a rejection escapes the catch and exits 1 with a stack trace; `status`, `wait`, `abort`, and `log` carry the hole. `pasture` is `return await`. Waits on the next phase that touches `cli.ts`.
- **2026-09-06 — The walk, by the conductor on a local faux home:** `--repo .` from a scratch checkout and refused from `/private/tmp`, the secret from stdin and refused as an argument, two sheep born and the column shown, both refusals verbatim, the secret route 404. Cost: 16 minutes of a subagent, 8 of verification.

## Phase 1: The mount, and the prompt

**Closes:** journey 2 steps 2 to 5 as read paths and step 3's refusals;
journey 2's first two criteria; journey 4 steps 1 and 2 and its first
two criteria.

**Work:** A second backing behind `/pasture` in `CellFs` and in the
`CellExecutionEnv` methods pi's tools call: at the start of each tool
call that touches the prefix, the pasture's manifest by one RPC, content
by hash on demand, cached for that call; `readFile`, `stat`, `readdir`,
`exists`, `readlink` served from it; `writeFile`, `appendFile`, `mkdir`,
`rm`, `rename`, `symlink`, `chmod`, `utimes` refused with `FsError
("EROFS")` carrying the design's sentence, so `write`, `edit`, and
`sed -i` say the same words. The system prompt: the pasture paragraph
(name, repository and branch when there is one, `/pasture` read-only,
the program's three verbs) and `BRIEF.md` appended when the tree has
one, built at every model call as the home line is; skills parsed with
pi's `parseFrontmatter` and appended with `formatSkillsForPrompt` over
`/pasture` paths, a malformed one a line naming the file and the fault.
The cell learns its pasture from the directory's row at boot. The
literal test: the prompt of a pastureless sheep held as a string, equal
to the prompt the cell built at commit `1b4a42d`.

**Not this phase:** No writes to the tree from a sheep; no container
sync of `/pasture`; no birth.

**Proof:** In workerd, with the object and a cell in the same test: a
file put through the object is read by `read`, by `cat`, and by `find`
with no restart; changed, and read again as changed on the next call;
removed, and gone; `write`, `edit`, and `sed -i` refused with the
sentence as a literal; the prompt contains the brief and lists a skill
with its `/pasture` path, and a `SKILL.md` without a name yields the
fault line; a pastureless cell's prompt equals the literal and its
`CellFs` has no second backing. Against a local home: journey 4 steps 1
and 2 with the faux provider, and journey 2 steps 2 and 4 with a real
model if a key is in `.dev.vars`, else recorded as owed to pasture phase
5. Suites unchanged. **⚑** none.

**Status: CLOSED.** 2026-09-06. The mount, the refusals, the prompt with the brief and the skills, and the pastureless literal built and proved in workerd; journey 4 steps 1 and 2 and journey 2 steps 2 to 5 walked by the conductor on a local home with a real model.

**Findings:**

- **2026-09-06 — Pi's `formatSkillsForPrompt` cannot load in a Worker.** Its module drags in `config.js`, whose top level calls `fileURLToPath(import.meta.url)`, and a wrangler bundle dies at boot; `parseFrontmatter` and `createSyntheticSourceInfo` are leaves and are imported. The cell's `skillsBlock` is pinned byte for byte to pi's by a workerd test.
- **2026-09-06 — Open: one fork commit owed, making `formatSkillsForPrompt` a leaf module** so `skillsBlock` becomes an import. Waits on pasture phase 4, which walks skills, per `/pi-bump`.
- **2026-09-06 — just-bash reports any failed write in `sed -i` and `chmod` as "No such file or directory", and `rm -f` reports nothing.** The mount records each refusal, and the cell corrects the shell's line, as `annotateCommandNotFound` corrects the not-found line.
- **2026-09-06 — Pi's edit tool prints only a returned error's code, so the env's writing methods throw the `EROFS` error under `/pasture`;** the harness makes the throw the tool's text, and `write`, `edit`, and the shell say the same sentence.
- **2026-09-06 — One `snapshot()` hop serves a whole tool call, and `readByHash` one hop per distinct hash.** A `Pasture` stub satisfies the mount's source with no adapter; a stub made outside a Durable Object's context cannot be used inside it in workerd.
- **2026-09-06 — The walk, by the conductor on a local home with a real model:** the sheep read a note told only by path, quoted a brief changed mid-conversation, reported `edit`'s and a redirect's refusal verbatim, and found a removed note gone. Cost: 33 minutes of a subagent, 20 of verification.

## Phase 2: The program, and the herd

**Closes:** journey 1 steps 6 and 7 and its second criterion; journey 2
step 1 and its third criterion; journey 4 step 2's herd of one.

**Work:** `packages/cell/src/env/pasture-command.ts`: a just-bash custom
command `pasture`, registered in `runInShell` only for a cell with a
pasture; `herd` (and bare) printing the design's rows from the
directory's `herd(pasture)` with this sheep's line marked; `put <path>
[file]` from a workspace path or stdin, one `PUT` to the object; `rm
<path>`. The `task` column: the cell reports the first line of the first
user prompt, trimmed to 120 characters, the way it reports lane state.
`sheep pasture <name>` prints the same rows from the same query, and one
test compares the two outputs. The prompt's sentence names the verbs;
the table's paragraph is unchanged and a test says so.

**Not this phase:** No container; no birth.

**Proof:** In workerd: `pasture` in a pastured cell prints the herd with
the marked line and the `task` reported by a prompt; `pasture put` from
stdin and from a file lands in the object whole, and a concurrent pair
of puts leaves one of the two, never a splice; `pasture rm` removes;
`pasture` in a pastureless cell is just-bash's not-found line annotated
as before, held as a literal. Against a local home with the faux
provider: journey 2 step 1 and journey 1 step 6, the two views diffed
empty. Suites unchanged. **⚑** none.

**Status: CLOSED.** 2026-09-06. The `pasture` program in tier 0 with `herd`, `put`, and `rm`, the task reported from the lane, and the two views diffed empty by a CLI test; journey 1 steps 6 and 7 and journey 2 step 1 walked by the conductor on a local home with a real model.

**Findings:**

- **2026-09-06 — just-bash's `getCommandNames()` is its static registry, so a custom command is not tier 0 to `classify` by itself.** `classify` gained an optional set of names a pastured cell passes, and `pasture put` stays in the shell on a home with a container.
- **2026-09-06 — The first prompt reaches `observeLane` as `entry_added` with a user message whatever door it came through,** so the task is reported from the listener that reports lane state; the directory keeps the first report and ignores the rest.
- **2026-09-06 — Pi's bash tool trims stderr's trailing newline before its exit line and renders empty stdout as `(no output)`;** a test reading exit codes through the tool normalises both. just-bash's stdin is a latin1 byte string, so `put` rebuilds bytes and a multibyte character lands as UTF-8.
- **2026-09-06 — A line naming both `pasture` and a container program runs whole in the container, which has no `pasture` binary.** The brief tells a sheep to write a file and `put` it on its own line; a helper in the image is pasture phase 3's call.
- **2026-09-06 — The Open finding of pasture phase 0 is paid:** every case in `main`'s `try` in `cli.ts` is `return await`.
- **2026-09-06 — The walk, by the conductor on a local home with a real model:** two sheep born with tasks; `sheep pasture <name>` showed both rows with their tasks; a sheep asked who else was there ran `pasture` and named its sibling and the sibling's task; a sheep's `put` was the dog's `cat` at once. Cost: 19 minutes of a subagent, 9 of verification.

## Phase 3: Birth, and the credential

**Closes:** journey 1 steps 4, 5, and 8 and its first and third
criteria, through the fake container and real git in Node; the
container's `/pasture` for journey 3.

**Work:** The checkout's manifest gains a second root: the pasture's
entries under `/pasture`, marked read-only, one field in
`packages/pen/protocol`; the agent writes them with read-only modes and
the sync-out walk never enters the prefix; a sync-in never deletes
under it what the manifest still carries. Birth in `SessionCell.boot`:
a cell whose row names a pasture with a repository and whose workspace
is empty runs, before the first prompt is taken, `git clone --branch
<branch> <repo> .` in `/workspace` through `runInContainer`, then
`setup.sh` if the tree has one (the run itself is pasture phase 4's;
this phase leaves the hook), and appends the output's tail as a
`custom_message` entry, failure said plainly. The broker's `Mint`: for
a sheep in a pasture, the pasture's `GIT_TOKEN` first, the home's
`PEN_GIT_TOKEN` after; the host is the repository's.

**Not this phase:** Setup's run and environment; skills beyond the
prompt; the deployed walk.

**Proof:** In workerd through the fake container: a pastured cell with a
repository runs the birth on first boot and not on a second boot, the
entry is in the transcript, and a clone that fails is an entry that says
so with the sheep still answering; the fake's disk has `/pasture` with
read-only modes, a sync-out from a container that wrote under it
changes no row, and a sync-in leaves it whole; the broker answers a
`credential` frame with the pasture's token when the pasture has one
and the home's when it does not, the value in no log line. In Node with
real git, pen's pattern: a birth against a local bare repository yields
`.git` and the files in the rows. On the local rig (wrangler dev, Docker,
a real model): journey 1 steps 4 and 5 against a scratch repository the
shepherd names, if the shepherd's token is at hand; else owed to pasture
phase 5. Suites unchanged. **⚑** none.

**Status: NOT STARTED.**

**Findings:**

## Phase 4: Setup, and skills

**Closes:** journey 3 steps 1 to 7 and its criteria, through the fake
and on the local rig.

**Work:** Setup in `runInContainer`: after a sync-in into a container
that has not run it, `sh /pasture/setup.sh` in `/workspace` with the
pasture's secrets, all but `GIT_TOKEN`, in that run's environment only;
the lease remembers per container whether setup ran; success is a log
line with the duration, failure is the tool result under the design's
first line, and the command that rented the container does not run.
Birth's hook from pasture phase 3 calls the same path. Skills are
pasture phase 1's prompt work; this phase walks them with a real model
and fixes what the walk finds.

**Not this phase:** The deployed walk.

**Proof:** In workerd through the fake: setup runs once per fresh
container and not again on the next command of the same container, a
count the fake keeps; the secrets are in setup's `run` frame and in no
later frame; a failing setup yields the first line and the output and
no `run` for the command. On the local rig with a real model: journey 3
steps 3 to 7 against a repository with a lockfile, the idle period set
to a minute, `env` in the container printed by the sheep and showing no
secret. Suites unchanged. **⚑** none.

**Status: NOT STARTED.**

**Findings:**

## Phase 5: The walk

**Closes:** every journey on the deployed homes, and the project.

**Work:** **⚑ provision** `pnpm run deploy` and `pnpm run deploy:pen`:
the `Pasture` class reaches `sheep` and `sheep-pen` by the migration
written in pasture phase 0; nothing else on the account changes, and the
price is the plan the account is on. Then the walk, by the conductor as
the dog with a real model: journey 1 on `sheep-pen` against a scratch
repository the shepherd names, with a fine-grained token the shepherd
pipes in (the one from pen expires 13 Sep 2026); journey 2 on the same
pasture; journey 3 with a repository that has a lockfile and a secret
the shepherd chooses, the idle period as deployed; journey 4 on `sheep`.
Every command and its output in the Findings, ids included. Then the
record: the Open roster names the GitHub App, the cache, the pushed
column, and what the walk found; the index row and the front matter
move to `done`.

**Not this phase:** No new verb. A fix the walk exposes is a finding
with the command that found it.

**Proof:** The deploy output naming both homes; `curl` of `GET /pastures`
on each answering `[]` before the walk and the pasture after; the four
journeys' commands and output in the Findings; `sheep log` of a birth on
`sheep-pen`; the token absent from every `sheep log`, from the rows
through `sheep export`, and from `env` in the container;
`.claude/skills/conduct/status.sh pasture` printing `clean`. **⚑** the
two deploys above, asked with the price first.

**Status: NOT STARTED.**

**Findings:**
