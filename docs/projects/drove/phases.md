# Drove: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), collar's
([../collar/phases.md](../collar/phases.md)), and earmark's
([../earmark/phases.md](../earmark/phases.md)): the cell's proofs run
in workerd, never in Node; the fake container is what a cell test talks
to; pi is a dependency; findings are one dated line of about forty
words; `main` stays sources only and a phase's proof runs in a ring;
steps marked **⚑ provision** create, change, or delete a cloud
resource, spend money, or need a login, and are asked out loud first.
`/conduct drove` is the procedure. Phase citations name their project:
`drove phase 1`, never a bare "phase 1".

**Three rules for this project.**

- **The contract is town's doc, and only the doc.** The program is
  written from `docs/harness.md` in a town checkout, and no file of
  town's is imported, copied, or read by a test. Town's scripts,
  `conform.mjs` and `townd`, are run as programs, from a checkout whose
  commit each phase's findings name.
- **The grant is nowhere the model can see.** A proof that finds the
  token's bytes in a transcript, an export, a status line, the shell's
  environment, a refusal, a log line, or a route's answer has found
  the bug, not a detail. Every phase carries the search.
- **Two checkouts, one branch, one station.** This project is built in
  `../sheep-drove` on branch `drove` while collie holds `../sheep`; a
  phase commits on the branch and pushes it, and the branch lands on
  `main` after collie's, rebased, its phase commits kept. The station
  it deploys is this checkout's kennel's, and the shepherd's own station
  and collie's checkout are not touched.

---

**Where we are: done, 14 September 2026.** All three phases are
CLOSED and every journey was walked: `town` is in every sheep's shell,
`sheep sh` looks into it, town's conformance script passes through
sheep on the local home and on the second station against the box, and
`scripts/drove.mjs` walks a sheep with a grant from the box that works
memory and github, twice, the search clean. The second station
`sheep-drove` stands at `b589052`. Nothing waits on a person; three
Open debts remain, none of them the line's. Town stands at `473687e`, whose
`docs/harness.md` and `scripts/conform.mjs` are road's `80496d2`.

The order is the order of dependence. Drove phase 0 is the program,
which everything else runs. Drove phase 1 is the peek and the bridge,
so road's script can reach the program, and the conformance run that
is the constellation's first proof. Drove phase 2 is the station and
the walk, shipped as the stage, which draws the night sky's line.

**Deliberately open.** Postponed on purpose: `town` in the container
(relay's); a narrower grant (deputy's); the grant set or rotated on a
sheep after its mint; the peek named to the model. Never: the grant in
the model's environment.

---

## Phase 0: The program in the cell

**Closes:** journey 3 steps 1 to 5 in the cell's terms, and the
contract's sections as journey 2 will check them, against a fake town
in the same isolate; no verb, no route, no home of its own.

**Work:** `packages/cell/src/env/town-command.ts`: `town` as
`defineCommand`, the design's "The program" section by section: in
every sheep's shell, the value read at each run through the one-name
lay-over,
the words as given with `--json` taken out, stdin as given or `null`,
the request's three headers and three fields to `/call` against the
grant's origin, the answer's two streams written as given and its exit
returned, a 500 with three fields an answer, everything else the
did-not-answer line and exit 1 after at most sixty seconds, §2's two
refusals, no grant and a value that is no grant, at exit 3, all three
refusals as the
five-field envelope under `--json`, no retry, nothing parsed. The
`fetch` handed in. `packages/cell/src/env/programs.ts`: the prompt's
line for a sheep that carries a grant at its boot, in `look`'s shape. `packages/cell/src/env/execution-env.ts`: the
program pushed with `look`, its name in the tier-0 set, the grant
source an option beside `eyes`. `packages/cell/src/cell.ts`: the
source, `laidOver` for one name over the Directory and the pasture's
object, and whether a grant is carried read at the boot for the
prompt's line. `packages/cell/src/directory.ts`:
`TOWN_GRANT` beside `GIT_TOKEN` as a secret a pastureless sheep can
carry; the refusal's sentence names both and why.
`packages/cli/src/earmark.ts`: the verb's twin of that refusal, the
same two names and the home's sentence word for word, since the verb
refuses before it asks. Tests:
`packages/cell/test/town.test.ts` in the checkout ring, listed in
`scripts/rings.mjs`, in `earmark.test.ts`'s shape: a fake town as a
`fetch` that records each request and answers as the case scripts;
for each contract section a case that reads the recorded request or
the returned streams and code, §3's four word shapes, §4's stdin bytes
and `null`, §5's headers and fields, §6's bytes unchanged and a 500
with `why`, §7's two refusals with and without `--json`, §8's codes
passed through, §9's notice lines untouched, §10's one request on a
500 and on a timeout; the grant's source: §2's no-grant line at exit
3 and a prompt silent on `town` for a sheep with neither, a pasture's
grant used and named in the prompt, the sheep's over the pasture's, a
pasture's set after the boot used at the next run while the prompt
stays the boot's; §2's white space around the JSON a grant; the search: the token's bytes in no
returned line, no log line, the shell's `env`, and no row of the
cell's storage. `packages/cell/test/earmark.test.ts`, `packages/cli/test/earmark.test.ts`,
and `packages/cli/test/journey5.test.ts`: the pastureless refusal's new
sentence, and `TOWN_GRANT` taken on a pastureless mint.

**Not this phase:** No verb, no route, no bridge, no conformance run,
no doc outside the project.

**Proof:** `pnpm test` exits 0 with the new file in the checkout ring
and the rings guard green; `pnpm --filter @sheep/cell typecheck` and
`pnpm --filter @sheep/cli typecheck` exit 0. Falsified by three mutations, each failing the new test and put
back: a second request after a 500; a newline added to `stdout`; the
value printed in §2's refusal. **⚑** none.

**Status: CLOSED.** 2026-09-14. `pnpm test` exits 0 across the three
inner rings with `town.test.ts` in the checkout ring, both typechecks
exit 0, and each of the three mutations fails the new test.

**Findings:**

- **2026-09-14 — Conformance decided presence.** Its no-grant checks
  want exit 3, and its probe takes 127 for a harness that cannot run, so
  `town` is in every shell and the not-found line was dropped before
  building. Town at `473687e`.
- **2026-09-14 — The answer is the three fields at any status.** §6
  says so; the design's 200-or-500 would have made a revoked pass's exit
  3 at a 401 an exit 1. The design was corrected.
- **2026-09-14 — just-bash hands a command bytes.** Stdin is a latin1
  string, so `town < file` can carry non-UTF-8, and §4's exit-1 refusal
  is the program's as well as the bridge's.
- **2026-09-14 — The first build put the grant in setup's environment.**
  `laidOver` stripped `GIT_TOKEN` only; the conductor's reading sent it
  back, and a test now reads setup's `run` frames, bleat's record, and
  the logs for the token.
- **2026-09-14 — A `town` with a path, query, or user is no grant.** §5
  allows refusing it or posting at its origin; refusing never sends a
  token somewhere the grant did not name exactly.
- **2026-09-14 — "Carried at its boot" means the value parses.** A
  sheep minted with a value that is no grant is not told of `town`; its
  shell refuses at exit 3.
- **2026-09-14 — A checkout with no kennel failed `setup.test.ts`.**
  `~/.sheep/config` on this machine was reachable from `../sheep-drove`,
  so setup made no kennel; the checkout now has its own `.sheep/`.
- **2026-09-14 — The phase took about an hour and a half** of wall
  clock, the builder's first pass seventeen minutes, the full suite two.

## Phase 1: The peek, the bridge, and conformance

**Closes:** journey 4 in full; journey 2 steps 1 to 4 on the local
home; journey 3 steps 1 to 5 on the command line.

**Work:** `packages/cell/src/cell.ts`: `POST /sh`, body `{ line,
stdin? }`, `stdin` the bytes as base64, the line through the runtime's
router and tiers as a bash call of the model's would go, no transcript
entry and no model call, the answer `{ stdout, stderr, exit }`; a 409
with one sentence while a turn is open, and a prompt that arrives
during a peek waiting for it; the router forwards it under
`/s/<id>/sh` as it does the rest. `packages/pen/src/`: the `run`
frame's optional stdin, the bytes, piped into a container line. `packages/cli/src/cli.ts`, `home.ts`: `sheep sh <id> [-- <line>]`,
the line joined from the words after `--`, stdin sent when it is a
pipe or a file, the streams printed as given, the code returned, the
409 as exit 2 with the sentence, an unknown session as every verb has
it, exit 2; the usage's line, and `--agent-help`'s sentence for it.
`packages/cli/agent-guide.md`, `README.md`, `SKILL.md`: the verb in one
sentence each; `--secret TOWN_GRANT` beside `GIT_TOKEN` where the
guide names a pastureless sheep's secret; the guide within its word
cap. `scripts/conform-sheep.mjs`: the bridge as the design's "The
bridge": `--kennel <dir>` read for the home and token, `SHEEP_HOME` and
`SHEEP_TOKEN` when none, `--state <dir>` mapping the hash of
`TOWN_GRANT`, compacted when it parses as JSON, to a sheep id, the mint
on first use with or without the secret, the home it minted on
written beside the ids so `--teardown` needs only `--state`, §4 on the
laptop, whether to read and nothing about what was read, the peek with
the words as given, each quoted for the shell, and the streams and
code returned unread; `--teardown`. Tests:
`packages/cli/test/journey-drove.test.ts` in the home ring, in
`journey5.test.ts`'s shape against the faux provider: journey 4 steps
1 to 4 and 6 with the faux model holding a turn for step 4; journey 3
steps 1 to 5 through `sheep sh` against a fake town the test starts on
a free port, which `wrangler dev`'s workerd reaches, step 1's prompt
read through `sheep export`; the
grant's bytes in no line `sheep log`, `sheep export`, `sheep status`,
and `sheep sh <id> -- env` print. `packages/cell/test/`: the route's
409 and its shape, in the checkout ring, in `cell.test.ts`'s file or
a sibling in the same ring, and journey 4 step 5 against the fake
container: a pastured sheep's peek of a line the router sends to the
container answers with the container's streams and code.

**Not this phase:** No station, no box, no stage.

**Proof:** `pnpm test` exits 0 across all three inner rings, the home
ring's new file carrying journey 4, run with no local home in the
kennel (`setup.test.ts` reads this checkout's kennel); `pnpm --filter @sheep/cli
typecheck` and `pnpm --filter @sheep/cell typecheck` exit 0. Then
journey 2 steps 1 to 4, typed by the conductor: a local home up in
this checkout's kennel (`sheep home local`, no container needed), a
town checkout built at a commit the findings name, and

```
node <town>/scripts/conform.mjs -- node <sheep-drove>/scripts/conform-sheep.mjs --kennel <sheep-drove>/.sheep --state <tmp>
```

printing `conformant: 30 checks` and exit 0, twice, `sheep ls` showing
seven bridge sheep after the first run and thirteen after the second,
and `--teardown` ending all of them. Falsified by one mutation in the
cell, a second post of a call whose answer's exit is not 0, which fails
conformance's call-once check through the bridge and is put back: that
is the proof the bridge answers for §4 and nothing else.
**⚑** none.

**Status: CLOSED.** 2026-09-14. The inner rings exit 0 with the peek
in both; conformance at town `473687e` printed `conformant: 30 checks`
twice through the bridge on the local home, seven sheep then thirteen,
all torn down; the retry mutation failed call-once.

**Findings:**

- **2026-09-14 — Conformance makes a new town every run.** Six of the
  bridge's seven grants change between runs, so a second run mints six
  sheep and reuses only the no-grant one; journey 2 step 3 said seven.
- **2026-09-14 — Its town answers every call at HTTP 200.** A retry
  keyed on 500 passed all thirty checks; a second post of a call whose
  exit is not 0 failed call-once with two audit rows.
- **2026-09-14 — The peek carries bytes.** A bridge checking UTF-8
  would make a no-grant sheep's bad stdin exit 1; the cell's program
  finds the grant first, exit 3, as §7 orders.
- **2026-09-14 — Checks run concurrently.** The first bridge minted
  three sheep in one millisecond and lost state; the look-up and mint
  are under a lock in the state directory.
- **2026-09-14 — `sheep export` holds no system prompt.** pi keeps no
  copy, so "the prompt does not name `town`" passed for every sheep; a
  faux `system` step now answers with the prompt it was given.
- **2026-09-14 — Node's `stdio: "pipe"` is a socketpair.** §4 leaves a
  socket unread, so the bridge hands the verb its stdin as a file.
- **2026-09-14 — `ls /` never reaches the container.** It is all tier
  0; journey 4 step 5 is `ls / && git status`, proved against the fake.
- **2026-09-14 — The home ring grew to six files.** The guard's cap
  moved from five for `journey-drove.test.ts`.
- **2026-09-14 — A local home in the kennel fails `setup.test.ts`.**
  Run the suite before the walk, and empty `.sheep/` after it.
- **2026-09-14 — Open: `OLDEST_HOME` does not know `/sh`.** It moves
  with the first release that ships the peek; until then a bare `not
  found` gets the floor's sentence.

## Phase 2: The station, the stage, and the walk

**Closes:** journey 5 in full; journey 2 step 5; journey 1 in full,
walked on the second station against the box. This is the night sky's
line.

**Work:** `scripts/drove.mjs`: the stage as the design's "The stage":
`--box`, `--user`, `--repo`, `--issue`, `--townd`, `--kennel`, `--keep`; `--status` and
`--teardown` over a root under the system's temporary directory
holding `walk.json`, the log, the audit, and the report, and never the
token; the pass through `townd admin --town`, the grant compacted to
one line and piped to `sheep new --secret TOWN_GRANT --detach`, the
sentence through `sheep attach`, `sheep wait`, the log through `sheep
log --json`, the audit through `townd admin --town <box> audit --pass`,
the search across the log, the export, the status, and the peek's
`env`, the revoke, the end; the report as one block; every `townd` and
`sheep` call a child process, its exit read. `README.md`: the walk in
one paragraph, the command and what it leaves. `scripts/hermetic.mjs`:
nothing this phase; the account ring's station is its own, and the
stage is what stranger will wrap.

**⚑ provision, two steps.** The box's github shop, which it does not
hold (`shop ls` at 14 Sep 2026: `town/memory`, `town/gdocs`,
`town/hall`, `dimitri/lookout`): `townd admin --town <box> shop add -`
from town's `shops/github`, a `github-token` credential for the user,
whose token is the shepherd's to give, added before the shop, since
`shop add --user` runs the shop's tests on that credential, and an
issue on a repository that token can comment on, which the shepherd
names; no cost but the box's requests. And the second station: `sheep home deploy` from
`../sheep-drove`, a Worker and a container application named by
kennel's rule from the directory on the account's Workers Paid plan
that already exists; its cost the objects' storage at idle, a
container's minutes while a sheep rents one, and the Worker's
requests. It stays after the walk as the standing second station, and
`sheep home delete` from the same kennel is its end. Each asked once,
with its sentence; journey 2 step 5 and journey 1 need only the
station.

**Proof:** `pnpm test` exits 0 across the three inner rings, with the
kennel's config set aside for the run and put back (`setup.test.ts`
reads this checkout's kennel, which names the station). Then, in
order, typed by the conductor and recorded in the findings with town's
commit and the station's stamp:

1. The deploy above, `sheep home` naming the station, its smit mark
   this checkout's commit, and a healthy instance.
2. Journey 2 step 5: conformance from the town checkout with `--town
   <box>` and the bridge on this kennel, `conformant: 30 checks`, exit
   0, twice, the bridge's sheep torn down after.
3. Journey 1, steps 1 to 6, typed against the station and the box.
4. Journey 5, steps 1 to 4: the stage run twice, two comments on the
   issue, the search's verdict clean both times, `--status` and
   `--teardown` on the first run's root.

Falsified by one mutation in the stage, the search made to skip the
log and the export, which is seen through `--search` to miss a token
planted in a scratch sheep's transcript by a prompt that holds it, and
put back. (A workspace file was the plan; `sheep export` holds no
workspace, so it hid the token from the search whole.) A phase with a walk is not CLOSED
until the walk is walked.

**Status: CLOSED.** 2026-09-14. The four Proof steps held on the second
station against the box, journey 5 walked twice with a real model, and
the stage's search was falsified there. This is the night sky's line.

**Findings:**

- **2026-09-14 — The station went up on `sheep home deploy --help`.**
  The verb takes `--help` for no flag; it deployed `sheep-drove` at
  `b589052`, clean and healthy, after the shepherd's yes but before the
  conductor meant to.
- **2026-09-14 — Conformance held over the wire.** Town `473687e`,
  `--town` the box, the bridge on the station: thirty `ok`, exit 0,
  twice (14 s, 12 s); every bridge sheep ended.
- **2026-09-14 — Journey 1 walked on the station.** A real model ran
  `town`; no token in the log or `env`; after the revoke `town` exited 3
  in the town's words.
- **2026-09-14 — pi's export tables are WITHOUT ROWID.** The stage's
  first search died on a real export; it names hits by primary key, and
  a place that throws is not clean.
- **2026-09-14 — The falsification held.** A prompted canary was found
  in log and export; with both skipped the search said clean, exit 0.
- **2026-09-14 — Journey 5 walked twice, 16 s and 15 s.** Each run
  remembered a line and commented it on `dglazkov/town#6`, a fixture
  opened and closed for the walk; `--teardown` revoked the kept pass.
- **2026-09-14 — The box's audit keeps argv's hash.** The stage reads
  the memory line and the comment from the transcript.
- **2026-09-14 — Open: the report prints the last message's newlines
  as `\n`.** Readable, not pretty; the stage's next change fixes it.
- **2026-09-14 — Open: `setup.test.ts` reads this checkout's kennel.**
  With a home named there it fails; the suite runs with the config set
  aside.
