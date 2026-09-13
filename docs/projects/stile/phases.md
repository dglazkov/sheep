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

**Where we are: stile phases 0 and 2 are CLOSED and phase 1 PART-DONE, 12
September 2026.** The screen of issue #9 is built to the approved
mockups, green in the inner rings and the package ring on release
`084cc74`, and the shepherd's first walk found two faults, both fixed; what is
left of **stile phase 1** waits on a person: the ⚑ account ring and a
second walk on the release with the fixes. Stile phase 0
gave the dog what the shepherd keeps: `~/.sheep/credentials`, deploy and
delete reading it, the stop in two parts, and `sheep-2` upgraded with
nothing in the environment. Stile phase 1 gave the shepherd the stile,
first as plain text that their walk refused, then as the TUI of
`design.md`'s "The screen": the pixel sheep, the six colours, the
selector, the boxed secrets, the deploy's progress, the finish. Stile
phase 2 gave a second machine the join, by a KV store per station after
a secret put proved to restart running turns (issue #10), walked on
`sheep-2` and held in the account ring. Issue #8 is closed; checkout
deploys left unstamped are issue #11.

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

**The second cut, issue #9 (12 September 2026).** The screen as first
built was plain text and the shepherd's walk refused it. This cut is
the screen of `design.md`'s "The screen", matched to
`docs/projects/stile/screen/mock.mjs` to the cell: `stile/screen.ts`
redrawn with colour at a level it decides itself (256, sixteen, or
none under `NO_COLOR` and `TERM=dumb`), the pixel sheep rasterised
from shapes with a line-art stand-in where there is no colour, the
vertical selector with `❯`, the boxed secret prompt with its address
under it, refusals in red, the deploy's stages as ticks behind a
spinner with the elapsed time, the `?` panel with its rule, the finish
with the sentence in a box, the key line on row 24, and the blank line
under the grass and the key line giving way when the words are open on
a choice. `stile/words.ts` gains each step's one-line question, and the
`made at` address for the two secrets. `stile/flow.ts` changes only
where the screen cannot do without it: an `Option` may carry a
`description`, and `say` may mark a line as a refusal, so the screen
knows red from progress; the count, the values' rule, and the steps
stay. The `[brackets]` that existed for the snapshots go.
`packages/cli/test/screen.ts` learns to read a cell's attributes from
the emulator, and `stile.test.ts` asserts on the ones that carry
meaning: the cursor step's name bold amber, a settled `✓` green, the
chosen row's `❯` amber, a refusal red, the box and the panel drawn, the
sheep drawn in pixels, and the whole of it plain but present under
`NO_COLOR`. `scripts/hermetic.mjs`'s `t0`, `t1`, and `a7` read the new
frames. `design.md`'s "The screen" says what the screen looks like, so a
reader can refuse a draft before a walk does.

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
and one more deploy per run. For the second cut, the same proof again,
and two more mutations falsified: the cursor step drawn without its
colour (the attribute test fails), and the pixel sheep drawn under
`NO_COLOR` (the plain test fails); the conductor looks at the frames
rendered, as a newcomer would, before the shepherd walks it.

**Status: PART-DONE, 12 September 2026.** The stile is built and green in
the inner rings, and its screen is the second cut: matched to the
approved mockups, `pnpm test`, `pnpm -r typecheck`, and `pnpm bundle`
exit 0, all four mutations falsified (hidden input echoed, `?` never
closing, the cursor step without its colour, the pixel sheep under
`NO_COLOR`), and the conductor looked at every state rendered through
the harness. The first cut held in every ring on release `b227c2d`, the
account ring typing the real token and key through its own terminal.
The package ring held on release `084cc74`; the shepherd's walk on it
found the arrows dead under the kitty protocol and a blank first frame,
both fixed and the package ring green again on `752761e`. Owed: the ⚑
account ring and a second walk on that release.

**Findings:**

- **2026-09-12 — A first sitting deploys before it has a key.** `deploy()`
  stops without one, so the stile passes `keyLater` and its `key` step
  puts the key through `putModelKey`, shared with deploy: one put.
- **2026-09-12 — The plan's yes exists only off Workers Paid**, so `t1`
  counts none and `t0` counts it against a Free fake; and a symlinked
  `HOME` split `~/.sheep` in two until kennel checks compared real paths.
- **2026-09-12 — The shepherd's walk refused the first screen**: plain
  text, "fish on legs", bracketed choices, every proof green. Issue #9;
  the second cut was settled as mockups first.
- **2026-09-12 — pi-tui's main-screen stop writes a space before its
  newline.** On a last row that fills the width it wraps and the finish
  lost two rows; the stile stops with `preserveScreen` and writes its own.
- **2026-09-12 — Styling is proved from the emulator's cells**, since
  pi-tui appends a bare reset to every line; `NO_COLOR` is read cell by
  cell. The fakes showed no spinner until `healthDelayMs` held their
  listings back.
- **2026-09-12 — The package ring held on releases `084cc74` and
  `752761e`**, `t0` walking the stile whole; the ring reads the local
  `release` branch, and a global `sheep` a walk installed fools it.
- **2026-09-12 — Ghostty sends an arrow as `CSI 1;1 B`** under the kitty
  protocol pi-tui negotiates; a byte comparison missed it. Keys are
  matched by name now, releases skipped.
- **2026-09-12 — A synchronous `npm install -g` ran before the first
  frame**, a blank screen for its length, since pi-tui draws on a timer.
  The first frame is drawn at once and the install awaited.
- **2026-09-12 — Open: the ⚑ account ring and a second walk on release
  `752761e`.** `t1` and `a7` on the shepherd's yes; the walk is theirs.

---

## Phase 2: The second machine

**Closes:** journey 3 in full; journey 4 step 4.

**Work:** `packages/cell/src/index.ts`: `POST /join` before the bearer
check, answering `{ token }` to a bearer whose `sha256` is a key in the
`JOIN` KV binding, deleting that key, and 404 otherwise; `env.d.ts`
declaring `JOIN`; `packages/cell/wrangler.jsonc` and the release's
config carrying the binding; `packages/cell/test/join.test.ts` in
workerd. `deploy.ts`: the `<worker>-join` namespace made through the
account API when absent and its id written to the derived config;
`deleteStation` deleting it; `joinStation` writing
`join:<sha256>` with a 120 s TTL, polling `POST /join` up to ninety
seconds, keeping `{home, token}`, and deleting the key on every path;
`PERMISSIONS` gaining `Workers KV Storage (edit)`. `stile/flow.ts`: the
station step listing the account's sheep homes, and `key` skipped on a
joined station. `join.ts` withdrawn; `sheep home join` answers with the
sentence naming `sheep setup`, exit 2, and leaves `USAGE`. `README.md`'s
second-machine section. The fake account: KV namespaces and values; the
fake station answering `/join` only from the fake namespace, and
deleting the key.

Tests: `stile.test.ts` gains journey 3 through the harness: the listing,
the key written, the ask, and the key deleted in order, no wrangler call
in the join, the fake station's request log holding the join token
alone, the config written, `key` skipped. `deploy.test.ts`: the
namespace made once and bound, and deleted with the station.
`join.test.ts` in the command ring becomes the one refusal.
`scripts/hermetic.mjs`: the account ring's a7 is the stile in the second
machine's container, joining the walk's station; `t2` reads the
station's namespace for no join key and reads a turn started before the
join whole after it; a6 leaves no `<worker>-join` namespace.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0. Falsified by at least one mutation: `/join`
answering a bearer whose key is absent (the workerd test fails), and the
join key left in the store (journey 3's cases in `stile.test.ts` fail
against the fakes, as `t2` would on the account). **⚑** `pnpm hermetic
--ring account --yes <sha>` with a7 as the stile and `t2`: a station and
its namespace deployed and deleted on the shepherd's account, a few
container minutes. Then the walk, journey 3 steps 1 to 3: this laptop
joining `sheep-2` from a scratch kennel under a fresh `HOME`, after
`sheep-2` is upgraded to carry the binding.

**Status: CLOSED, 12 September 2026.** The join on a KV store holds: the
inner rings, typecheck, and bundle exit 0 and both mutations falsified;
the ⚑ account ring held 51 lines, `a7` the stile joining from a container
and `t2` a turn across the join ending whole; journey 3 walked from this
laptop to `sheep-2`, whose Worker version the join left unchanged.

**Findings:**

- **2026-09-12 — A secret put restarts a running turn.** On a scratch
  station a 180 s faux turn ended whole alone; with `SHEEP_JOIN` put and
  deleted mid-turn it restarted with two empty assistant entries and a
  lane stuck running. Issue #10; the shepherd chose a KV store.
- **2026-09-12 — The join has no wrangler call now.** The key is written,
  asked with, and deleted through the account API; the home deletes a key
  it answers, so `t2` cannot see the stile's own delete, which the fakes'
  event order proves instead.
- **2026-09-12 — A station with no store is refused before any write.**
  Otherwise joining one deployed before the store sits through ninety
  seconds of 404s; the refusal names `sheep home deploy`.
- **2026-09-12 — The station row could not show two homes.** With the
  walk's station and `sheep-2` on the account the join was cut off the
  row; the row is now a window holding the selected option.
- **2026-09-12 — The join changed no Worker version on `sheep-2`.** The
  deployment and version ids were the same before and after; the walk
  kept `{home, token}` and left `sheep-2-join` empty.
- **2026-09-12 — `t2` stalled on `a3`'s container sheep, not the join.**
  Fresh sheep held 240 s turns idle, polled, and right after a redeploy;
  `t2` now mints its own. The container case is a lead on issue #10.
- **2026-09-12 — The account ring held with `t2` on its own sheep.** 51
  lines on release `0885ad0`: the turn started before the join ran
  across it and ended whole, the store held no join key, and a6 counted
  16 sheep minted and 16 ended.

**Formerly: the join by a Worker secret (built 12 Sep 2026, commit
6e64cb9).** The join token was put as `SHEEP_JOIN` with `wrangler secret
put`, asked with, and deleted with `wrangler secret delete`; the cell
compared it in constant time. It walked on `sheep-2` and a7 held, but a
secret put or delete is a new Worker version, which restarts the turns
running on the station (the finding above, issue #10), so journey 3's
third criterion could not hold. Re-cut to the KV store at the shepherd's
choice.
