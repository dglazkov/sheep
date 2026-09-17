# Hill: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), collar's
([../collar/phases.md](../collar/phases.md)), and stile's
([../stile/phases.md](../stile/phases.md)): the cell's proofs run in
workerd, never in Node; the fake container is what a cell test talks
to; pi is a dependency; findings are one dated line of about forty
words; `main` stays sources only and a phase's proof runs in a ring;
steps marked **⚑ provision** create, change, or delete a cloud
resource, spend money, or need a login, and are asked out loud first.
`/conduct hill` is the procedure. Phase citations name their project:
`hill phase 1`, never a bare "phase 1".

**Three rules for this project.**

- **The token never reaches a browser.** A proof that finds the home's
  token in a link, the page's source or scripts, the browser's storage,
  or any request the page makes has found the bug, not a detail. Every
  phase with a page carries the search.
- **The seat reads.** A request admitted by a seat alone is a `GET` or a
  `HEAD` that asks for no upgrade; anything else with only a seat, the
  WebSocket to a cell included, is the 401 a bad bearer gets.
  A phase that needs a write from the hill has found the next project,
  not a shortcut.
- **The frames come first, and the yes closes.** The page is built to
  the mockups in [screen/](screen/). A phase with a screen may be built
  and walked before the shepherd has said yes to them, and is not CLOSED
  until they have, and until the conductor has looked at the built page
  as a newcomer would and judged it against them. A no re-cuts the look,
  never the door or the plumbing under it.

---

**Where we are: hill phases 0 to 2 CLOSED, hill phase 3 PART-DONE, 16
September 2026; the shepherd said yes to the look, and hill phase 3 waits on an account ring that reaches `h1`.** The flock is live,
walked on a real model and a real container, and a sheep's page follows its transcript. The door stands, and the station serves the page at
`/hill/` from an assets binding, before the door: the gate for a
browser with no seat, the shell once seated, and a release that carries
it, walked in Chrome and by the package ring. Hill phase 1 waits on one
thing, which it has: the shepherd's yes, given 16 September 2026. Hill
phase 3 waits on an account ring that reaches `h1`, which failed twice
at `a5`'s redeploy. Nothing else waits on work. `hill phase 3`'s walk and its account-ring
step are ⚑.

The order is dependency order. Hill phase 0 is the door and the verb:
a pass, a seat, the cookie admitted for a read, proved in workerd with
`fetch` and in the command ring with a fake home; no page. Hill phase 1
is the shell: the package, its build, the Worker serving it, the
release carrying it, and the gate, the first screen. Hill phase 2 is
the flock. Hill phase 3 is a sheep's page, the blocks shared with
`sheep log`, and the walks.

**Deliberately open.** Postponed on purpose: the hill acting (prompt,
abort, `rm`, the shell); the WebSocket stream in pi's protocol; every
DevTools panel beyond the transcript; a code to type at the gate; more
than one home on a hill; the stile printing the hill's link; a browser
in a ring.

---

## Phase 0: The door

**Closes:** journey 1 steps 1, 3, 4, 5, and 6 in the home's terms, with
`fetch` in place of a browser; journey 4 step 2's half that needs no
page.

**Work:** `packages/cell/src/directory.ts`: two tables with the
migration the others have, `passes(hash, minted_at)` and `seats(hash,
seated_at, last_seen)`, and the methods over them: `mintPass()` answers
the pass and keeps its sha256; `takePass(pass)` deletes the row and
answers `used`, `expired`, or `ok` with a fresh seat whose sha256 it
keeps; `seated(seat)` answers whether the hash is a row younger than
thirty days and touches `last_seen`; `leave(seat)` deletes it; a mint
deletes seats not seen in thirty days. `packages/cell/src/index.ts`:
`POST /hill/passes` under the bearer, answering `{ url, expires }` with
the url built from the request's origin; `GET /hill/seat?pass=` with
no bearer, answering 204 and the `Set-Cookie` of the design or a 403
and one sentence for a used or expired pass; `DELETE /hill/seat` with
the cookie, clearing it, before the door as `/join` is; `admitted()`
gaining the seat for `GET` and `HEAD` with no `Upgrade` header alone,
checked before any cell is reached; the doc comment at
the top gaining the paragraph. `packages/cli/src/home.ts`: `pass()`
over `POST /hill/passes`. `packages/cli/src/hill.ts`: the verb, the
url on stdout and nothing else, exit 0; drove phase 1's `lackedSentence`
for a home whose router answers its bare `not found`, exit 2. `packages/cli/src/cli.ts`,
`usage.ts`: `hill` in the dispatch and the usage, one line;
`surface.test.ts`'s fence updated for the one word.

Tests: `packages/cell/test/hill.test.ts` in the checkout ring, listed in
`scripts/rings.mjs`, in workerd: a bearer mints a pass and the url
carries it; `GET /hill/seat` with it answers 204 and a cookie with the
five attributes; the same pass again is 403 `used`; a pass minted with
the clock moved three minutes is 403 `expired`; `GET /sessions` with the
cookie alone is 200 and the same body the bearer gets; `POST /sessions`
with the cookie alone is the bare 401; a WebSocket upgrade to
`/s/<id>/ws` with the cookie alone is the bare 401 and reaches no cell;
`GET /s/<id>/transcript` with the cookie is admitted; `DELETE /hill/seat` clears it and the next `GET
/sessions` is 401; a seat not seen in thirty-one days is gone after a
mint; a cookie of the right shape with no row is 401; no bearer and no
cookie is what it was. `packages/cli/test/hill.test.ts` in the command
ring, the built CLI against a fake home in `earmark.test.ts`'s shape:
`sheep hill` prints the url and nothing else; a home answering its bare
`not found` gets the lacked sentence and exit 2.

**Not this phase:** No page, no assets, no build; `GET /hill/` is the
404 it is today.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0. Falsified by at least three mutations: the seat
admitting `POST` (journey 1's third criterion fails), the seat admitting
an upgrade (the WebSocket test fails), and `takePass` not deleting the
row (step 3's test fails). **⚑** none.

**Status: CLOSED.** 2026-09-14. Journey 1 steps 1, 3, 4, 5, and 6 hold in
the home's terms with `fetch`: a bearer mints a pass, the pass buys one
seat and then is `used`, three minutes old it is `expired`, the seat's
cookie reads `/sessions` and a transcript and is the bare 401 for a
write and for the WebSocket, sign out ends it, and `sheep hill` prints
the link or refuses an older home. `pnpm test` exits 0 across all three
inner rings and `pnpm -r typecheck` exits 0; three mutations falsified.

**Findings:**

- **2026-09-14 — A seat would have driven a sheep.** Orienting found `GET /s/<id>/ws` is a GET whose protocol prompts and aborts, before any brief; with the `Upgrade` check removed, a cookie-only upgrade got a 101. The docs were fixed first (`72e38ea`).
- **2026-09-14 — A take is one `transactionSync`:** the read, the delete, and the seat with no await between, so two takes of one pass cannot both win. With the delete removed, the second take was a 204 and not `used`.
- **2026-09-14 — A read wrote.** The first `seated()` wrote `last_seen` on every admitted request, a Directory write per poll per tab; it writes at most hourly now. The mint sweeps passes past two minutes and seats past thirty days from seating.
- **2026-09-14 — A seat's `HEAD` passes the door and meets the router's 404:** routes match methods exactly, so the page reads with `GET`.
- **2026-09-14 — The page must be served before the door,** beside `/hill/seat`, or a browser with no seat meets the 401 instead of the gate. Hill phase 1's work.

## Phase 1: The shell and the gate

**Closes:** journey 1 steps 1, 2, 3, and 5 in a browser; journey 4
steps 1 and 3; journey 5 step 2. Journey 5's first criterion is the
gate of this phase: the shepherd's yes on [screen/](screen/).

**Work:** `packages/hill/`: the fifth package, `@sheep/hill`, with
`src/` (the shell, the gate, the mark rendered from the stile's shapes,
a `home` client over `fetch` that sends no token because it has none),
`build.mjs` (esbuild into `dist/`, `index.html` and the two bundles),
`typecheck`. `packages/cell/wrangler.jsonc`: the `assets` binding,
`directory` the hill's `dist/`, `binding: "HILL"`, `run_worker_first:
true`, repeated in `env.pen`. `packages/cell/src/index.ts`: `GET /hill`
and `/hill/*` handed to the binding, every path answering `index.html`
but files; `GET /` a 302 to `/hill/` for an `Accept` naming `text/html`
and `sheep\n` otherwise; a missing or empty assets directory answering
a gate that says `pnpm build`. `scripts/bundle.mjs`: the hill built
and copied to `home/hill/`, and the shipped `home/wrangler.jsonc`'s
`assets.directory` pointing at it; `scripts/release.mjs`'s tree gaining
`home/hill/`. `packages/cli/src/deploy.ts`: the derived config's
`assets.directory` made absolute the way `main` is, for the release and
the checkout alike. `packages/cli/src/local.ts` the same for the rig.
`scripts/test.mjs` or the home ring's harness building the hill before
`wrangler dev` starts, so the ring serves it. The gate to the mockup:
the sentence, the refused pass's sentence in red, the mark; `?pass=`
exchanged for the seat and the address replaced. `README.md`: three
lines under the shepherd's half saying what the hill is and how to
climb it; `packages/cli/agent-guide.md`: one line, `sheep hill` and
what to do with what it prints, within the cap.

Tests: `packages/hill/test/` in the checkout ring: the address rewrite
and the gate's three sentences as pure functions; the built page's
bytes under 100 KiB and containing no `Bearer` and no `token`.
`packages/cli/test/hill-home.test.ts` in the home ring, in
`journey5.test.ts`'s shape: `wrangler dev` serves `index.html` at
`/hill/`, `/hill/anything`, and a 302 at `/` for `text/html`; `sheep\n`
at `/` for `*/*`; `sheep hill` against it prints a url the ring takes
with `fetch`. `scripts/hermetic.mjs`'s package ring reading `/hill/`
from the local home the ring makes.

**Not this phase:** No flock, no sheep's page: a seated browser sees
the shell and an empty column that says the flock is the next phase.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0; `pnpm bundle` exits 0 and `home/hill/index.html`
exists. On the phase's commit, before it is pushed, `pnpm release
--no-push --force` exits 0: the release built from that commit, with
`home/hill/` in its tree, and the package ring walked against the
candidate, `/hill/` read from the local home the ring makes. (The ring
installs a built release, never the checkout, so the commit comes
first; `--force` skips only the pushed-HEAD guard.) Then the walk, journey 1
steps 1 to 3 and 5 in Chrome against the local home from a scratch
kennel, never the checkout, frames captured and read by the conductor
against the mockups. Falsified by one mutation: the address not
replaced after the seat (the pass stays in the bar; the rewrite test
fails). **⚑** none. **A hand:** the shepherd's yes on the mockups,
which closes the phase and does not hold the build.

**Status: CLOSED.** 2026-09-16. Every proof held: the station serves the
gate and the shell at `/hill/` before the door, the pass leaves the
address on a take and on a refusal, and a release built from the phase's
commit carries `home/hill/` and held the package ring with `h0`. The
conductor walked journey 1 steps 1 to 3 and 5 in Chrome and judged the
frames; the shepherd said yes to the look on 16 September 2026.

**Findings:**

- **2026-09-14 — The walk held in Chrome at a scratch kennel's local home.** The link seated the browser and left `/hill/` in the bar, and the same link again said "That pass was already used." in red. Sign out and a reload showed the gate, `/hill/s/<id>` opened the page, and no request carried anything but the pass given.
- **2026-09-14 — The release ring held on the phase's commit:** `pnpm release --no-push --force` built a candidate with `home/hill/` and held 28 lines. Its two `h0` lines saw the page's headers and a seat taken through the installed `sheep hill`.
- **2026-09-14 — `sheep.ts` could not be bundled for a browser:** `paint.ts` reads `process.env`. The raster moved to `pixels.ts`, which imports nothing, and the gate and the stile draw one sheep.
- **2026-09-14 — Deep paths are the Worker's, not the binding's:** with `html_handling` and `not_found_handling` at `none`, the Worker maps `/hill/<file>` and falls back to `index.html`. A fresh clone keeps `dist/` through one placeholder, and no build answers a gate saying `pnpm build`.
- **2026-09-14 — Two timing assertions failed once each under the full run, never hill's:** lease's budget and stile's one-second first frame. Each passed alone, and the third full run was green. The home ring is eight `wrangler dev`s now.
- **2026-09-16 — The shepherd said yes to the look,** storyboard and built page together, after the station walk's frames. The light theme's pale wool and hill phase 3's two taste notes stand as later polish, not as debts of this project.

## Phase 2: The flock

**Closes:** journey 2 in full; journey 1 step 2 in full; journey 3 step
7's back button.

**Work:** `packages/hill/src/flock.ts`: the home's line from `GET
/home` and the rows from `GET /sessions`, the columns of `sheep ls` and
bleat's setup, the state dot, the ticking elapsed time from the row's
`at`; the poll every two seconds while visible and stopped while hidden;
a row's click pushing `/hill/s/<id>`. The layout at a laptop's width and
a phone's. `packages/hill/src/home.ts`: the two reads.

Tests: `packages/hill/test/flock.test.ts` in the checkout ring: rows
from a `SessionSummary[]` fixture to the row model, newest first, the
dot's colour from the state and the setup, the elapsed time from `at`
and a clock; the poller as a pure schedule that stops when told hidden
and asks at most once per two seconds. `hill-home.test.ts` in the home
ring: the flock's two reads with the cookie return what the bearer
returns, and a sheep minted through `sheep new --detach` is in the next
answer.

**Not this phase:** No sheep's page; a row's click shows the empty
column with the id.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0. Then the walk, journey 2 steps 1 to 5 in Chrome
against the local home with Docker and a real model, a second terminal
running the dog's commands, the times recorded, frames captured and
judged against the mockup; step 6 by an hour's tab, its asks counted by
a `PerformanceObserver` in the page (a local home's log records no
request, so the page's own count is the witness to how often it asked). Falsified by one mutation: the poll not stopping when hidden
(the schedule test fails). **⚑** none.

**Status: CLOSED.** 2026-09-16. Journey 2 in full: steps 1 to 5 walked in
Chrome on a local home with Docker and a real model, the flock saying
what `ls` and `status` say within two seconds of each dog's command, the
split view and the phone's matching the storyboard, and journey 3 step
7's back button returning; step 6's hour held on hill phase 3's walk
station. `pnpm test` exits 0 and the mutation fails. The shepherd said
yes to the look on 16 September 2026.

**Findings:**

- **2026-09-14 — The flock kept up with the dog on a real model and a real container:** a mint's row 1.9 s after the command, a prompt's `running` 0.06 s after, an `rm`'s row gone 0.87 s after. The setup ticked beside `sheep status`, 35.1 s then 41.9 s eight seconds later, and both said `ok (45.1 s)`.
- **2026-09-14 — An id's first eight characters name no sheep.** Ids are uuidv7 and begin with a timestamp, so sheep minted in the same minute share them. The hill inks and folds by the last eight, and the storyboard now does too.
- **2026-09-14 — `echo` rents no container:** it runs in the cell's own shell, so the walk's first prompt left `setup: none`. A walk that wants a setup must run a program the container owns, such as `node`.
- **2026-09-14 — Chrome under automation reports an occluded window as hidden,** and a hidden page asks nothing, as designed. The builder's walk had to simulate visibility; the conductor's, in a window in front, did not.
- **2026-09-14 — A walk's scratch `HOME` hides Docker's buildx plugin:** `sheep home local` failed on `--load` until `DOCKER_CONFIG` named the real `~/.docker`.
- **2026-09-15 — Two counts of step 6 broke before the hour, and each held while it ran:** 805 pairs in 28 minutes, then 437 in 18, no gap under 1995 ms. A second home's cookie signed out the first; then an edit reloaded the checkout's Worker.
- **2026-09-15 — Step 6's hour held on a deployed station:** a headless Chrome counted 1,798 pairs in 3,601 s against a ceiling of 1,801, the smallest gap 1997 ms, all 3,596 answers 200, and the flock still right at the end.

## Phase 3: A sheep's page

**Closes:** journey 3 in full; journey 5 in full.

**Work:** `packages/cli/src/blocks.ts`: the rendering `sheep log` does
in `herd.ts` moved out as a pure function from entries and setups to
blocks (prompt, reply, tool call with arguments and result, setup,
abort), no Node in it; `herd.ts` printing from the blocks, byte for
byte what it printed. `packages/hill/src/sheep.ts`: the row first from
`GET /sessions/<id>`, then `GET /s/<id>/`, then the transcript loop over
`GET /s/<id>/transcript?wait=25000&tip=`, one request open at a time;
the blocks drawn, results folded and opened on a click, the page
following the bottom unless scrolled up; a 404 answered with the gone
sentence and the flock offered; the address `/hill/s/<id>` opened
straight; a row with no task and no setup never asked of its cell, the
page saying nothing has been asked of the sheep yet; the transcript loop
paused while the page is hidden. `scripts/hermetic.mjs`: the account ring's step `h1` after a
step that has prompted a sheep: a pass minted through `sheep hill`, the
seat taken with `fetch`, `GET /sessions` read with the cookie alone and
compared with the bearer's answer, `POST /sessions` with the cookie
refused 401, the prompted sheep's transcript read with the cookie and
its last entry the reply the ring saw; the token's bytes searched for
in the page's files and found in none.

Tests: `packages/cli/test/blocks.test.ts` in the checkout ring: the
text face prints what `herd.ts` printed before the move, over the
fixtures `log` already has; the blocks from a transcript with a setup,
a tool call, and an abort. `packages/hill/test/sheep.test.ts`: the
follow-the-bottom rule as a pure function of scroll and a new block;
the loop holding one request; a thousand entries to blocks in one
copy; the rule that a row with no task and no setup asks nothing of its
cell. `hill-home.test.ts`: the transcript read with the cookie during
and after a faux turn, the entries in `attach --json`'s order; a
removed sheep's 404.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings; `pnpm -r
typecheck` exits 0; `pnpm bundle` exits 0. Falsified by one mutation:
the blocks' text face changed (the byte test fails), and the page asking
the cell of an unprompted sheep (the wake rule's test fails). Then the walk,
journey 5 step 1: journeys 1, 2, and 3 on a station of the walk's own,
deployed with `sheep home deploy` from a scratch kennel and deleted
after, with a real model, the conductor in Chrome, frames captured at each step and
judged as a newcomer would, the times recorded; the browser's network
log and storage searched for the token. **⚑** journey 5 step 3: `pnpm
hermetic --ring account --yes <sha>` with `h1`, a station deployed and
deleted on the shepherd's account, a few container minutes and one
deploy; and the walk's own station, the same again. The shepherd's
station `sheep-2` is not touched: it is theirs to upgrade.

**Status: PART-DONE.** 2026-09-15. Every proof that runs in the
checkout held: `sheep log` prints through the blocks byte for byte
against the rendering frozen from before the move, a sheep's page
follows its transcript over the long poll and never wakes a sheep
nothing has asked, and the seat's cookie is named for its home.
Journey 5 step 1 was walked on the walk's own station with a real model
and deleted after: journeys 1 to 3 in a headless Chrome, frames judged.
The account ring failed twice, both times right after `a5`'s redeploy
and before `h1`, whose checks held by hand on the walk's station. The
shepherd said yes to the look on 16 September 2026, so the phase closes
on a ring that reaches `h1` alone.

**Findings:**

- **2026-09-14 — An abort in pi's entries is the cut-off model call's own assistant entry,** empty, `stopReason: "aborted"`. One during a tool call is the tool's error result instead, folded red on the page as `sheep log` prints it.
- **2026-09-14 — The cell answers a long poll at once when no turn is open,** so the loop rests two seconds after such an answer rather than asking back to back.
- **2026-09-14 — The page's `sheep log` is the CLI's code:** `blocks.ts` imports only `setup-words`. The byte test's oracle is the rendering frozen from cefefbd.
- **2026-09-15 — Cookies ignore ports:** a second local home on `127.0.0.1` signed out the first. The cookie is now named for its home's serverId.
- **2026-09-15 — A local home runs the checkout's live Worker,** so an edit reloaded it under a seated tab. Builders' walks shared this session's scratchpad and browser, and disturbed each other.
- **2026-09-15 — The walk held on `sheep-hill-walk` with a real model:** a mint's row in 0.93 s, `running` in 1.03 s, a prompt on the page in 1.45 s, setup `ok (40.2 s)` beside `sheep status`, the seat through a browser restart, 398 requests with no token.
- **2026-09-15 — HTTP/2 carries no `Upgrade`:** a seat's socket was 401 over HTTP/1.1 and the bearer's 101; over HTTP/2 the cell answered a plain GET 426.
- **2026-09-15 — Open: the account ring on release 491fc54 failed twice right after `a5`'s redeploy, before `h1`:** `t2`'s turn cut off, then `GET /sessions` threw. Issues #13 and #14 describe such runs. A run reaching `h1` closes it.
