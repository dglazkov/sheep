# Shear: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node; pi is a dependency; findings are one dated line
of about forty words; `main` stays sources only and a phase's proof runs
in a ring; steps marked **⚑ provision** create, change, or delete a
cloud resource, spend money, or need a login. `/conduct shear` is the
procedure. Phase citations name their project: `shear phase 0`, never a
bare "phase 0".

**One rule for this project.** Nothing is fetched, installed, or
deployed by sheep on its own. A phase that finds itself wanting to is a
finding and a stop, not a feature.

---

**Where we are: planned, 13 September 2026. Nothing built.** Phase 0 is
next.

Two phases, because the notice and the header are lines a command
says, provable against the fakes alone, and the floor and the guard are
refusals, whose walk is the account ring's upgrade.

**Deliberately open.** Postponed on purpose: refusing a downgrade; a
floor in the home for older commands; the local home; a doorway refresh
from any command; the command fetching anything but one kilobyte.

---

## Phase 0: The notice and the header

**Closes:** journeys 1 and 2 in full, and journey 5 step 1 for them.

**Work:** `packages/cli/src/tip.ts`, new: the tip's URL and its
`SHEEP_TIP` override (`0` is off); `readSaid`/`writeSaid` over
`~/.sheep/tip.json` (`tip: { commit, builtAt, at }`, `noticed: <commit>`,
`skew: "<home commit>:<cli commit>"`), a missing or unreadable file
being empty; `startTip()` that returns at once and fetches beside the
verb with a two-second timeout when the kept tip is a day old or absent,
writing what it gets; `noticeLine(stamp, said)` giving the line or
nothing. `packages/cli/src/cli.ts`: `startTip` after the verb is known
and before it runs, for every verb but `--version`, `--help`,
`--agent-help`, and `setup`; at exit, the notice and the skew line, each
through the said file, both on `output.err`; `CI` and a checkout say
nothing. `packages/cell/src/index.ts`: `x-sheep-build` on every response,
set once where the Worker's `fetch` returns. `packages/cli/src/home.ts`:
the header read from the first response and kept on the instance
(`Home.homeBuild`), through `request`, `ask`, and the WebSocket upgrade's
101 where it can be read. `packages/cli/src/local.ts`: `skewLine` says
nothing for one commit with no `-dirty` on either side. `sheep home`
prints the skew line as now, every time. `packages/cli/agent-guide.md`,
`README.md`, `packages/cli/src/usage.ts`: the paragraph on upgrading
says the three lines and the two commands, paid for by cutting.

Tests: `packages/cli/test/tip.test.ts` (checkout): the said file's
round trip and its empty cases; the day-old rule; `noticeLine` for a
newer tip, an equal one, an older one, and one already noticed;
`skewLine`'s one-commit cases in `local.test.ts`. `cli.test.ts` or a
new `shear.test.ts` (command): the fake station serves the header and a
manifest at `SHEEP_TIP` pointing at itself; a spawned `sheep ls` with a
newer manifest prints the notice once on stderr and not on the second
run, and stdout is byte-equal to a run with `SHEEP_TIP=0`; a manifest
the fake never answers (a route that hangs) costs the verb nothing past
its own time and prints nothing; a station header older than the command
prints the skew line once across two runs and `sheep home` prints it on
both; a header of the command's own commit at another time prints
nothing. The cell's suite (checkout, workerd): every route's response
carries the header, `GET /` and a 404 among them.

**Not this phase:** the floor, the guard, the account ring.

**Proof:** `pnpm test` exits 0 across all three inner rings, the new
files in their rings; `pnpm --filter @sheep/cli typecheck` exits 0.
Falsified by at least two mutations: the header dropped from the Worker
(the skew cases fail), and the said file never written (the once cases
print twice). Then, from a scratch kennel with the built command against
the local home, `sheep ls` twice with `SHEEP_TIP` at a file the walk
wrote: the notice once, by eye.

**Status: PLANNED.**

**Findings:**

---

## Phase 1: The floor and the guard

**Closes:** journeys 3 and 4 in full, and journey 5 in full.

**Work:** `packages/cli/src/home.ts`: `OLDEST_HOME`, the ISO time of the
release that shipped phase 0's header, with the comment that says when
it moves; in `request` and `ask`, a response that is not ok from a home
whose header is absent or older than the floor throws with the floor's
sentence appended. `packages/cli/src/deploy.ts`: before the join store
and before wrangler, when the config names a station that answers,
`GET /sessions` with the kept token; rows `running` or `waiting` are
listed on stderr as `<id>  <task>` and the deploy exits 2 with the
sentence, unless `options.now`; `interrupted` in the report and its
JSON. `packages/cli/src/cli.ts` and `usage.ts`: `--now` on `sheep home
deploy`. `.claude/skills/pi-bump/SKILL.md`: one line naming the floor. `scripts/hermetic.mjs`, the account ring: after
`--older`'s deploy, the previous release's `sheep ls` is expected to
print the notice (the ring leaves `SHEEP_TIP` on for it alone); after
the tip's install, `sheep ls` prints the skew line once; a sheep is
minted with a task that runs past the deploy, `sheep home deploy` is
expected to exit 2 naming it, `--now` to move the stamp and report
`interrupted: 1`, and the held `sheep wait` to return 0 (tether's r1
already holds a wait across the version change).

Tests: `deploy.test.ts` (command): a fake station with one lane
`running` refuses the deploy with exit 2, the id and task on stderr,
no wrangler call, no join store; `--now` deploys and the report says
`interrupted: 1`; an idle station deploys silently; a station that does
not answer deploys. `shear.test.ts` (command): a fake station sending no
header answers `sheep ls` as before with no skew line, and a verb it
404s carries the floor's sentence; a header older than the floor, the
same; a header at the floor, the bare 404.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings; typecheck
exits 0. Falsified by at least two mutations: the guard's count never
read (the refusal case deploys), and the floor's sentence dropped (the
404 case reads bare). **⚑** journey 5 step 2: `pnpm hermetic --ring
account --older <the release before phase 0's>` on the shepherd's
account, one station named `sheep-hermetic-<sha>`, deployed twice,
walked, deleted, under the shepherd's standing authorization to run
account walks.

**Status: PLANNED.**

**Findings:**
