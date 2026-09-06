# Recast: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey steps it closes, and a
phase that claims a walk closes only when the walk was walked for real.
The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)): the cell's
proofs run in workerd, never in Node; pi is a dependency; findings are
one dated line of about forty words; steps marked **⚑ provision** create,
change, or delete a cloud resource and are asked out loud first. `/conduct
recast` is the procedure. Phase citations name their project: `recast
phase 1`, never a bare "phase 1".

**One rule for this project.** Nothing the dog can do changes. A phase
that finds itself improving the command has left the project; it stops,
records the improvement as a note for the next project, and does the
rename only. The proof of every phase includes the suites that held on
5 Sep 2026, unchanged in what they assert.

---

**Where we are: recast phases 0 and 1 CLOSED; phase 2 is next, and it needs no one.** Planned 6 Sep 2026, the day after lamb and pen were walked, when the shepherd said the command is `sheep` and the work from here on is the command. Phase 0 renamed everything in the repo the same morning; phase 1 deployed `sheep` and `sheep-pen`, walked journey 1 with a real model, and deleted the old homes, all three ⚑ steps approved by the shepherd that morning. Nothing waits on a person.

The order is dependency order. Phase 0 renames everything in the repo
and proves it locally, so that the README a reader gets after it is true
of the code beside it. Phase 1 deploys the renamed home, moves the dog's
configuration, and walks the journey against it; it needs the shepherd
for the deploys and for the deletion of the old homes, so everything
that does not need the shepherd comes first. Phase 2 freezes the two
legs and finishes the index, last, so that its "frozen on" lines name a
date on which the new name was already deployed.

**Deliberately open.** Postponed on purpose, so a later project decides
instead of this one improvising: publishing `@sheep/cli` (the pi fork
ships somehow first); the verb set (lamb journey 5's stays); pen's name.

---

## Phase 0: The name in the repo

**Closes:** journey 1 steps 1 and 2, and its first acceptance criterion,
locally.

**Work:** Rename with `git mv` so history follows: `packages/lamb` to
`packages/cli`, `bin/lamb.js` to `bin/sheep.js`. Package names to
`@sheep/cli`, `@sheep/cell`, `@sheep/pen`, and every `workspace:` and
`--filter` that names them (root `package.json`, `packages/cell/package.json`,
the imports of `@lamb/pen/protocol`). The CLI's face: the usage text,
the `sheep:` error prefix, `sheep <version>`, the config path
`~/.sheep/config`, `SHEEP_HOME`, `SHEEP_TOKEN`, `SHEEP_CONFIG`. The
cell's names: `SHEEP_TOKEN`, `SHEEP_ANTHROPIC_API_KEY`, `SHEEP_MODEL`,
`SHEEP_PROVIDER`, `SHEEP_ALLOW_ANONYMOUS`, `SHEEP_TEST_PORT` in
`env.d.ts`, `wrangler.jsonc`, `vitest.config.ts`, `src/`, and `test/`;
`SHEEP=1` in the container's environment; `GET /` answers `sheep`; the
database path and the default git author per the design's table. The
Worker names in `wrangler.jsonc`: `sheep` and `sheep-pen`.
`.dev.vars.example` under the new names, and the gitignored `.dev.vars`
on this machine with its variable names changed and its values
untouched. Comments that say "lamb's" of the shell a home with no
container has are rewritten to say that; citations of a lamb phase
stay. `README.md` and `AGENTS.md` are rewritten to run `sheep`,
with lamb and pen named once each as the legs that built it and links to
their docs; `.claude/skills/pi-bump/SKILL.md` says sheep where it meant
the repo's commits on the fork. The `# lamb` comment in `.gitignore`.
The tests move with the names: `packages/cli/test/*` drive `bin/sheep.js`
and set `SHEEP_*`; the cell's tests read `SHEEP_*`.

**Not this phase:** Nothing under `docs/projects/` but this file's
record; nothing in `vendor/`; no Worker deployed; no change to a verb,
a flag, an output shape, a route, or a message.

**Proof:** From the repo root, exit codes read, not tails:
`pnpm test` exits 0, the cell's suite in workerd and the CLI's journey 5
test run against a local `wrangler dev` home and not skipped (the
conductor reads its output for the skip message); `pnpm -r typecheck`
exits 0; `node packages/cli/bin/sheep.js --version` prints `sheep 0.0.0`
and `--help` prints a first line beginning `sheep`;
`grep -rn -i lamb packages --exclude-dir=node_modules --exclude-dir=.wrangler --exclude-dir=dist | grep -v -E 'lamb phase [0-9]'`
prints nothing; `grep -n -i lamb README.md AGENTS.md` prints only the
lines that name the leg and link its docs; `git status --short` shows
`packages/lamb/*` as renames, not deletes and adds. **⚑** none.

**Status: CLOSED.** 2026-09-06. Every name in the repo is sheep; every suite that held on 5 Sep holds unchanged, the cell's in workerd and journey 5 through `bin/sheep.js` against a real `wrangler dev`.

**Findings:**

- **2026-09-06 — The rename was mechanical except in comments.** 52 files, 311 lines, no behaviour change; `pnpm test` exit 0 with the cell's 106 tests in workerd and journey 5 against a real local home in 19 s; `pnpm -r typecheck` exit 0. Cost: 8 minutes of a subagent, 15 of verification.
- **2026-09-06 — Lamb was two names in the cell: the command, and a home with no container.** The first became sheep by substitution; the second was rewritten as "a home with no container" or "before pen" in eleven comments and two test names, because sheep is not a kind of home.
- **2026-09-06 — The gitignored `.dev.vars` carried commented author placeholders from an early lamb phase** that nothing reads (pen uses `PEN_GIT_AUTHOR_*`); the conductor deleted the two lines so the proof grep is empty. Nothing tracked was touched.
- **2026-09-06 — `/pi-bump` still records a bump's cost in lamb phase 7's Findings.** A frozen doc cannot take new findings; recast phase 2 gives the record a new home in the skill itself.

## Phase 1: The home, renamed

**Closes:** journey 1 steps 3 to 6 and its walk criterion.

**Work:** Deploy the renamed Workers and move the dog's configuration.
**⚑ provision** `pnpm run deploy`: the Worker `sheep`, a new Worker at
`https://sheep.<you>.workers.dev`, empty; price nothing beyond the plan
the account is on. **⚑ provision** `pnpm run deploy:pen`: the Worker
`sheep-pen` with its container image; price the same. On each, `wrangler
secret put` `SHEEP_TOKEN` and `SHEEP_ANTHROPIC_API_KEY` from
`packages/cell/.dev.vars`; on `sheep-pen` also `PEN_CELL_ORIGIN` as the
new origin, `PEN_GIT_TOKEN` from the commented line in `.dev.vars` (the
token expires 13 Sep 2026), and `PEN_GIT_AUTHOR_NAME` and
`PEN_GIT_AUTHOR_EMAIL` with the values the shepherd used before, which
the repo does not hold, or the defaults if the shepherd prefers. Write
`~/.sheep/config` with the new home and the same token. Then the walk,
by the conductor as the dog with a real model: journey 1 step 3 on
`sheep` (three sheep detached in one command, `ls`, `wait`, `log`), step
4 (`sheep config`, `curl` the door), step 5 on `sheep-pen` (a line that
needs `node`; the container's environment shows `SHEEP=1` and no
`LAMB`). **⚑ provision**, asked separately and last: `wrangler delete`
for `lamb` and `wrangler delete --env pen` for `lamb-pen`, and then
`~/.lamb/`; the sessions on them are scratch, and the shepherd says
whether they go now or later. Every ⚑ step is asked with its price
before it runs; a step without a yes is where the phase stops, PART-DONE.

**Not this phase:** No code beyond a fix the walk exposes, and a fix is
recorded as a finding with the command that found it.

**Proof:** The deploy output naming `sheep` and `sheep-pen`;
`pnpm exec wrangler secret list` and `--env pen` listing the new names
and no `LAMB_*`; `curl -s https://sheep.<you>.workers.dev/` printing
`sheep`; `node packages/cli/bin/sheep.js config` naming the new home
with no environment set; the walk's commands and output in the
Findings, ids included; `pnpm exec wrangler deployments list` (or the
dashboard) showing `lamb` and `lamb-pen` absent, or an Open finding
saying the shepherd kept them.

**Status: CLOSED.** 2026-09-06. `sheep` and `sheep-pen` deployed with their secrets, `~/.sheep/config` written, journey 1 steps 3 to 6 walked with a real model, and `lamb`, `lamb-pen`, their container application, and `~/.lamb` deleted.

**Findings:**

- **2026-09-06 — A container application's name is account-wide and bound to one Durable Object namespace.** `wrangler deploy --env pen` refused `pen` as "already deployed … associated with a different durable object namespace"; the new Worker's application is `sheep-pen`. The design's table gained the row.
- **2026-09-06 — Deleting a Worker leaves its container application behind.** After `wrangler delete --name lamb-pen`, `wrangler containers list` still showed `pen`, ready; `wrangler containers delete <id>` removed it. Only `sheep-pen` remains.
- **2026-09-06 — The walk, by the conductor as the dog with a real model.** Three sheep minted detached in one command; `ls` showed all three running; `wait` returned three `done` lines, exit 0, in under ten seconds; `log --last 4` showed the write and its result.
- **2026-09-06 — On `sheep-pen`, a `node -e` line printed `{"SHEEP":"1","node":"v24.20.0"}` from the container**, `LAMB` absent. Both doors answer `sheep`; `sheep config` names the new home with no environment set; the old doors answer 404.
- **2026-09-06 — Secrets re-put from `.dev.vars` under the new names**, plus `PEN_CELL_ORIGIN`, `PEN_GIT_TOKEN` (expires 13 Sep 2026), and the shepherd's git identity as `PEN_GIT_AUTHOR_*`. `wrangler secret list` on both shows no `LAMB_*`. Cost of the phase: 8 minutes, one failed deploy included.

## Phase 2: The legs frozen, and the index

**Closes:** journey 2 and journey 1 step 1's history clause.

**Work:** A freeze line as the first paragraph after the front matter of
each primary doc in `docs/projects/lamb/` and `docs/projects/pen/`
(journey, design, phases): the leg is done and frozen on the date, the
command it calls `lamb` is `sheep` since recast phase 1, the commands
below are as they ran, and a link to this project. Nothing below the
freeze line changes. Lamb's `journey.md` front matter: `status: done`
with the note saying journey 1's night and second machine are carried
by recast's Open roster; pen's stays `done`. Lamb's and pen's index rows
in `docs/projects/README.md` reworded to frozen, in their own words;
recast's row to where it stands. The index's rule that a project is
short, checked against its own wording. The `/conduct` skill's examples
may keep naming lamb and pen; nothing there runs `lamb`. The `/pi-bump`
skill's Record section sends a bump's cost to lamb phase 7's Findings;
a frozen doc takes no new findings, so the skill keeps its own dated
list of bumps (the first, 5 Sep 2026, to upstream v0.85.1, one
conflict, ten minutes) and the argument goes in the bump's commit. Then the
record: recast's Open roster carries lamb journey 1's second machine and
night, and the publishing debt, each one dated line naming who or what
it waits on. Finally the sheepdog's memory outside the repo, per journey
2's last criterion: this is the conductor's own note, not a file here.

**Not this phase:** No code. No rewrite below a freeze line, however
tempting a stale sentence is; the freeze line is what makes it not stale.

**Proof:** `.claude/skills/conduct/status.sh recast` prints `clean` under
lint and lists the two Open entries; `status.sh lamb` and `status.sh pen`
each report no next phase and the same lint hits as before this phase,
none new (the conductor runs them before and after and diffs);
`git diff --stat docs/projects/lamb docs/projects/pen` touches only the
first paragraphs and lamb's front matter; `head -12` of each of the six
frozen docs shows the freeze line. **⚑** none.

**Status: NOT STARTED.** 2026-09-06.

**Findings:**
