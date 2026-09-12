# Stile: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
collar's ([../collar/phases.md](../collar/phases.md)), and station's
([../station/phases.md](../station/phases.md)): the cell's proofs run in
workerd, never in Node; pi is a dependency; findings are one dated line
of about forty words; `main` stays sources only and a phase's proof runs
in a ring, never from this checkout; every proof that deploys also
deletes; steps marked **⚑ provision** create, change, or delete a cloud
resource, spend money, or need a login, and are asked out loud first.
`/conduct stile` is the procedure. Phase citations name their project:
`stile phase 1`, never a bare "phase 1".

**Two rules for this project.** A value the shepherd types is never on
the screen, in an argument, in a log, or in `--json`; a proof that finds
one anywhere but the credentials file and the config has found the bug.
And the stile is driven through a terminal the ring owns: a phase whose
proof needs a person at a keyboard, or a `SHEEP_TEST_*` seam that
answers a step for the flow rather than standing in for a terminal or a
tool, has built a facade.

---

**Where we are: stile phase 0 is CLOSED, phases 1 and 2 PART-DONE, 12
September 2026.** Phase 2 is PART-DONE: the next thing to do is **stile phase 2**'s
account ring and join walk. Stile phase 1 waits on issue #9, the screen
the shepherd's walk found bare; the package, dog,
and ⚑ account rings all hold on release `b227c2d`, run with the
checkout's keys at the shepherd's word, and `sheep-2` is upgraded to it.

Both phases are green in the inner rings. Stile phase 0 is the dog's half:
`credentials.ts`, deploy and delete reading what the machine keeps, `Stop`
in two parts, the key left when the Worker holds one, the midway message,
and setup making no kennel where a home is reachable; its walk upgraded
`sheep-2` from the release with an empty environment, nothing asked. Stile
phase 1 is the stile: the flow, the screen over pi-tui, the words, the
fence and its guard, the two halves of the README, and the ring steps,
all of which have run. Two ⚑ steps in the project, both the account
ring's: `t1` in stile phase 1 and `t2` in stile phase 2, each a station
deployed and deleted on the shepherd's account.

The order is dependency order. Phase 0 is the mechanism under the flow,
provable against the fakes with nothing on a screen, so the stile in
phase 1 is a renderer over code that already holds. Phase 1 is the
stile itself, the screen, the fence, the words, and the rings driving
it. Phase 2 is the join, last, because it is the one phase that touches
the cell.

**Deliberately open.** Postponed on purpose: wrangler's four calls as
account API calls; the OS keychain; stamping or refusing a deploy from
a checkout; a token per machine on the home; a rotation verb; `sheep
home` as a screen; Windows.

---

## Phase 0: What the dog reads

**Closes:** journey 2 steps 1 to 6 against the fakes, but for step 4's
last sentence, which is the stile's; journey 1 step 6; journey 2's fourth
criterion.

**Work:** `packages/cli/src/credentials.ts`: `readCredentials()`, the
kennel's `.sheep/credentials` over `~/.sheep/credentials`, the
environment over both, and `writeCredentials()` to `~/.sheep`, mode
600, keeping the key it does not set. `packages/cli/src/deploy.ts`: the
token and the key from it; `Stop extends Refusal` with `needs` and the
shepherd's paragraph, thrown where `needs()` was; the key put when
kept, else the Worker's secret names read from the account API and the
key's presence required, the report saying which; the midway message on
the `Error` after `wrangler deploy`; `deleteStation` reading the token
the same way, and a stop with `terminal` when neither a terminal nor
stdin gives the name. `packages/cli/src/cli.ts`: a stop printed as the
dog's line and the shepherd's paragraph, `--json` as `{ refused, needs,
shepherd }`, exit 2; `sheep home` gaining the credentials line.
`packages/cli/src/setup.ts`: the non-tty kennel rule, the report naming
the home found and that no kennel was made. `packages/cli/src/local.ts`:
the local home's key from `readCredentials()` too, so the rig and the
station read one place. `ASK_TOKEN`, `ASK_KEY`, and the `Ask:` line go.

Tests: `packages/cli/test/credentials.test.ts` in the checkout ring:
precedence, the mode, a kennel's file shadowing, the environment over
both. `deploy.test.ts`: the kept token and key read; nothing asked; the
key left when none is kept and the Worker has one, a stop when neither;
the midway message; the stop's two parts and its `--json`; delete
reading the kept token. `setup.test.ts`: a directory under a reachable
home gets the skill and no kennel; one under none gets both; a
subdirectory of a kennel makes no second one. `rings.mjs` lists the new
file.

**Not this phase:** No screen. `sheep setup` at a terminal asks nothing
yet. No fence; the words of `--help`, the guide, the skill, and the
README wait for stile phase 1, when the flow they describe exists. The
account ring is unchanged.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0. Falsified by at least one mutation: a redeploy that
puts a placeholder key when none is kept (journey 2 step 3 fails), and
a stop printed in one part (journey 2's first criterion fails). Then, by
hand on this laptop: `~/.sheep/credentials` written from the checkout's
two files, and `sheep home deploy` from the release against `sheep-2`
with nothing in the environment, the upgrade with nothing asked. No
provision step: the redeploy of the shepherd's own station is the shepherd's
call, asked out loud.

**Status: CLOSED, 12 September 2026.** The mechanism holds against the
fakes, `pnpm test` and `pnpm -r typecheck` exit 0, and both named
mutations falsified their tests. The walk held on the shepherd's station:
the released `sheep 82cf207`, under `env -i` with stdin at `/dev/null`,
upgraded `sheep-2` from what `~/.sheep` keeps, nothing asked, and its
nine sessions and four pastures survived.

**Findings:**

- **2026-09-12 — The key check must precede `wrangler deploy`.** A machine
  keeping no key reads the Worker's secret names through the account API
  first: a stop firing after the upload would claim nothing was made about
  a Worker already live.
- **2026-09-12 — Precedence is per credential, not per file.** A kennel's
  `credentials` naming only `cloudflare` leaves `anthropic` the machine's;
  whole-file shadowing would make a second account cost the shepherd a
  second model key for nothing.
- **2026-09-12 — The kennel rule keys on a config naming a home, not on a
  kennel existing.** A parent kennel naming no home still gets one in the
  subdirectory, since nothing is shadowed. Closes kennel phase 0's open
  note about a shadowing second kennel.
- **2026-09-12 — The fakes had to grow a secrets listing to stay
  falsifiable.** The fake wrangler registers each `secret put` with the
  fake account, which answers the names from what the puts made; a
  hard-coded listing cannot fail.
- **2026-09-12 — The account ring's a1 runs the older release.** It
  deploys the prior release first, so a1 must keep the old refusal and
  the two-part stop is proved after the upgrade; rewriting a1 to the stop
  failed the ring's first real run, with nothing made.
- **2026-09-12 — The upgrade needed nothing but the file.** `sheep home
  deploy` from the release, environment empty, read the kept token, put
  the kept key, and moved `sheep-2`'s stamp in a second, from an
  unstamped checkout build to `82cf207`; `sheep ls` listed all nine.

---

## Phase 1: The stile

**Closes:** journey 1 steps 1 to 5 and its criteria; journey 4 steps 1
to 3 and its criteria; journey 2's first, second, and third criteria, and
its step 4's last sentence.

**Work:** `packages/cli/src/stile/flow.ts`: the steps as a machine with
`ask`, `say`, and `choose`; the answers scripted or from a terminal;
`--explain`; `--name` and `--faux` passed through to `deploy()`.
`stile/screen.ts`: the banner, the checklist, the prompt with hidden
input, the explanation opened and closed by `?`, over pi-tui's
main-screen renderer and `ProcessTerminal`, or over the pipes when
`SHEEP_TEST_TERMINAL` names a size. `stile/words.ts`: each step's four
things, at most eight lines. `setup.ts` and `cli.ts`: the stile when
stdin is a terminal and `--json` is not given; the dog's setup
otherwise, as stile phase 0 left it. The fence: `USAGE` without `home
local`, `home stop`, `home join`'s line unchanged until stile phase 2,
`--faux`, `--no-container`; the guide's "What needs a person" rewritten
around `sheep setup` at the shepherd's terminal; `SKILL.md` the same;
`README.md` in two halves, the shepherd's first with the stile as the
first five minutes, and the developer's with the rig, the checkout, and
the rings. `packages/cli/package.json`: `@xterm/headless` as a
devDependency.

Tests: `packages/cli/test/screen.ts` and `stile.test.ts` in the command
ring, every journey 1 case through the harness against the fakes, with
frame snapshots at each step. `stile-tty.test.ts` in the command ring
under `script`, skipped with a line where absent. `surface.test.ts` in
the checkout ring: the fence's words and files, the stops enumerated,
no `export` and no shell. `scripts/hermetic.mjs`: the package ring's
`t0`; the dog ring setting up the rig's home and a kennel before Claude
Code runs and reading the transcript for the rig's words; the account
ring's `t1` and the `up` step run with the environment stripped and
the credentials written by the ring. `rings.mjs` lists the new files.

**Not this phase:** No join: `station` offers `new` alone, and `sheep
home join` stays as station made it for one more phase.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0. Falsified by at least one mutation: hidden input
echoed (journey 1's third criterion fails), and the explanation left
open after the second `?` (the screen snapshot fails). `pnpm hermetic
--ring package` green with `t0`; `pnpm hermetic --ring dog --yes` green
with a transcript naming no verb from the rig, at the shepherd's cost
of about half a dollar. Then the walk, journey 1 steps 1 to 5, by hand
at this laptop's terminal against a scratch kennel, never the checkout,
which is the one walk a person does, since the screen is for one. **⚑**
`pnpm hermetic --ring account --yes <sha>` with `t1`: a second station
deployed and deleted on the shepherd's account, a few container minutes
and one more deploy per run.

**Status: PART-DONE, 12 September 2026.** The stile is built and green in
the inner rings: `pnpm test`, `pnpm -r typecheck`, and `pnpm bundle` exit
0, and both named mutations falsified their tests — hidden input echoed
fails four stile cases on the buffer check, and a `?` that never closes
fails journey 1's frame snapshot. Every ring holds on release `b227c2d`:
the package ring with `t0`, the dog ring, and the ⚑ account ring (46
lines) with `t1`, `up`, and `st`. The shepherd walked it and found the
screen bare and confusing: issue #9, Open.

**Findings:**

- **2026-09-12 — A first sitting deploys before it has a key.** `deploy()`
  stops when neither machine nor Worker holds one, so the stile passes
  `keyLater` and its `key` step puts the key through `putModelKey`, which
  shares `putSecret` with deploy: one put, not two.
- **2026-09-12 — The plan's yes exists only on an account not yet on
  Workers Paid.** The account ring requires Paid up front, so `t1` counts
  no yes; the package ring's `t0` counts the whole of it against a Free
  fake account, and journey 1's criterion now says so.
- **2026-09-12 — pi-tui inlines into `sheep.mjs` with nothing shipped
  beside it.** No new external, no native module; the bundle is 896 KiB.
  `ProcessTerminal`'s bracketed paste delivers a pasted token as one
  escape sequence, which the key splitter must unwrap.
- **2026-09-12 — A symlinked `HOME` split `~/.sheep` in two.** Kennel
  phase 1's `kennelName()` compared a walk from the resolved cwd with
  `HOME` as set; under macOS's `/var` link `t0` minted `t0`, not
  `sheep-2`, while Linux CI passed. Kennel checks now compare real paths.
- **2026-09-12 — The account ring played the shepherd for real.** `t1`
  typed the real token and key through its terminal, deployed a second
  station, then herded, upgraded, and deleted it with nothing in the
  environment; `ps` saw no secret in 28,638 samples.
- **2026-09-12 — Open: the shepherd's walk found the screen bare and
  confusing.** No colour, a banner that is "fish on legs", choices as
  bracketed text; every mechanical proof held regardless. Issue #9, kept
  out of this project at the shepherd's word.

---

## Phase 2: The second machine

**Closes:** journey 3 in full; journey 4 step 4.

**Work:** `packages/cell/src/index.ts`: `POST /join` before the bearer
check, answering `{ token }` to a bearer equal to a set `SHEEP_JOIN` and
404 otherwise; `packages/cell/test/join.test.ts` in workerd. `stile/
flow.ts`: the station step listing the account's sheep homes (`taken`
and `whoAnswers`), and the join: the join token put, `POST /join`
polled up to a minute, the config written with the address and the
token and no name, the secret deleted; `key` skipped on a joined
station with its line. `join.ts` withdrawn; `sheep home join` answers
with the sentence naming `sheep setup`, exit 2, and leaves `USAGE`.
`README.md`'s second-machine section rewritten. `packages/cli/test/
fake-wrangler.mjs` and the fake station: the put recorded, `/join`
answering only after it, the delete recorded.

Tests: `stile.test.ts` gains journey 3 through the harness: the listing,
the join's put, ask, and delete in order, the fake station's request
log holding the join token alone, the config written, `key` skipped.
`join.test.ts` in the command ring becomes the one refusal. `scripts/
hermetic.mjs`: the account ring's a7 becomes the stile in the second
machine's container, joining the walk's station; `t2` reads the Worker's
secret names for no `SHEEP_JOIN`, and a turn started before the join is
read whole after it.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0. Falsified by at least one mutation: `/join`
answering a home with no `SHEEP_JOIN` (the workerd test fails), and the
join secret left on the Worker (journey 3's cases in `stile.test.ts` fail
against the fakes, as `t2` would on the account). **⚑**
`pnpm hermetic --ring account --yes <sha>` with a7 as the stile and
`t2`: a station deployed and deleted on the shepherd's account, a few
container minutes. Then the walk, journey 3 steps 1 to 3, by hand: this
laptop joining `sheep-2` from a scratch kennel under a fresh `HOME`.

**Status: PART-DONE, 12 September 2026.** The join is built and green in
the inner rings: `pnpm test`, `pnpm -r typecheck`, and `pnpm bundle` exit
0, and both named mutations falsified their tests — `/join` answering a
home with no `SHEEP_JOIN` fails two workerd cases, and the join secret
left on the Worker fails three of journey 3's. The ⚑ account ring and the
join walk from this laptop are Open.

**Findings:**

- **2026-09-12 — The join is two wrangler calls and an ask between.** A
  put and a delete, with `POST /join` over plain HTTP in the middle; the
  test proves the order by recording, at each ask, whether `SHEEP_JOIN`
  was on the Worker.
- **2026-09-12 — The delete runs on every path after the put.** A poll
  that times out or a config write that throws still deletes; a failed
  delete names the secret left behind. A Ctrl-C mid-poll leaves one no
  process holds, and the next join overwrites it.
- **2026-09-12 — The station row could not show two homes.** With the
  walk's station and `sheep-2` on the account the options passed the
  row's width and hid the join; the row is now a window holding the
  selected option.
- **2026-09-12 — A global `sheep` beside `node` broke setup's tests.**
  The shepherd's taste test installed one, as journey 1 step 1 does; the
  command step then read "on PATH". The tests now build their own PATH.
- **2026-09-12 — Open: the ⚑ account ring with a7 as the stile and `t2`,
  and the join walk from this laptop to `sheep-2`.** Both need a release
  with `/join`, and `sheep-2` upgraded to it.
