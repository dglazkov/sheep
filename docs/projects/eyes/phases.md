# Eyes: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey steps it closes, and a
phase that claims a walk closes only when the walk was walked for real.
The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)) and
collar's ([../collar/phases.md](../collar/phases.md)): the cell's proofs
run in workerd, never in Node; pi is a dependency; findings are one
dated line of about forty words; `main` stays sources only and a phase's
proof runs in a ring, never from this checkout; steps marked **⚑
provision** create, change, or delete a cloud resource, spend money, or
need a login, and are asked out loud first. `/conduct eyes` is the
procedure. Phase citations name their project: `eyes phase 1`, never a
bare "phase 1".

**One rule for this project.** The eyes read rows and nothing else: a
look that needs a port, a server, or a file on a disk has left the
design. The spike's interception is the mechanism, and the workerd suite
renders from the files table alone.

---

**Where we are: eyes phases 0 and 1 closed, 8 and 9 Sep 2026. Next:
eyes phase 2.** Planned the afternoon of the spike, from a conversation
with the shepherd; the shepherd's calls are in the journey's front
matter. The spike is [docs/spikes/eyes](../../spikes/eyes/README.md):
the numbers, the findings, and the Worker the eyes are lifted from; its
README is left as the record of what was tried, so it still names the
puppeteer cache this project's phase 0 found to be the wrong one. The
eyes are built and proved in workerd, and a sheep on the local home asks
them for a look: `look` is in its shell, the prompt says so, and
journeys 1 and 2 were walked on this laptop with a real model, a Vite
app built in the container and looked at from the rows. Eyes phase 2 is
the station: the release carrying the binding, `eyes` in the home's
report, the rings, and journey 3 on the account. Its local parts wait
on no one; ⚑ steps: the upgrade of `sheep-2` and the ring's station on
the shepherd's account, and the browser minutes both spend. That is the
one thing in this project that waits on the shepherd.

The order is dependency order. Phase 0 is the eyes: the class, the
binding, the interception over the rows, the session, and the workerd
proof. Phase 1 is the program and the prompt, and the walk on the local
home. Phase 2 is the station: the release carrying the binding, the
home's report, the rings, and the walk on the account.

**Deliberately open.** Postponed on purpose: the container's dev server
behind interception; a shared browser per home with a context per
sheep; `--script`; a dog's verb for a workspace file; video and traces.

---

## Phase 0: The eyes

**Closes:** journey 4 steps 1 and 3.

**Work:** `packages/cell/wrangler.jsonc`: `"browser": { "binding":
"BROWSER" }` at the top level and in `env.pen`; `env.d.ts`: `BROWSER?:
Fetcher`, absent on a home without eyes. `@cloudflare/puppeteer` pinned
in the cell's dependencies. `packages/cell/src/eyes/eyes.ts`: the
`Eyes` class over the binding and a `FilesTable`; `look(request)` as the
design states it, the interception handler answering the origin from
the rows under the root with a content type by extension, 404 for what
is not there, `continue` for other origins; the listeners; `goto`
with `networkidle0` and the timeout; the clicks and fills in order; the
screenshot and the snapshot; the page closed. `packages/cell/src/eyes/
report.ts`: the report as one pure function of what the look gathered,
the four sections and the closing line, the tree indented and cut at
two hundred lines. `packages/cell/src/eyes/session.ts`: the session
row, `connect` by id, `launch` with `keep_alive` at ten minutes when
there is none or the connect fails, `disconnect` after every look.
`docs/spikes/eyes` stays as it is, the record of what was tried.

**Not this phase:** No program, no prompt line, no home report, no
release.

**Proof:** `pnpm test` exits 0 with a suite in workerd that writes the
spike's four files into a cell's files table and looks: a PNG at the
viewport's size, the `ReferenceError` under errors, the `favicon.ico`
404 listed, the console's log and warn, the tree with the heading and
the button, the counter at `2` after two clicks, `--root` serving a
hashed asset from a subdirectory, a missing path as one error, and the
session id kept across two looks. A cell with no `BROWSER` in its env
constructs no `Eyes` and says so in one typed place. The suite passes
with the wrangler cache's `chrome` emptied first (`~/Library/Caches/
.wrangler/chrome` on macOS, `~/.cache/.wrangler/chrome` on Linux), which
the phase's findings record with the download's size and time. **⚑**
none.

**Findings.**

- **2026-09-08 — The Chrome the eyes need lives in the wrangler cache, not `~/.cache/puppeteer`.** Miniflare installs it through `xdgAppPaths(".wrangler").cache()` at a version it pins, 126.0.6478.182, 283 MB unpacked. This phase's Proof, the design, and journey 4 all named a directory the pool never touches.
- **2026-09-08 — The download costs about six seconds, and the suite passes without it.** The eyes suite ran 17 s with that cache emptied against 11 s warm, `Downloading browser…` in the log; the whole cell suite's cold run sits inside its warm noise, 23 s against 28 s.
- **2026-09-08 — A 404 the eyes answer reaches the page twice.** Once as the status, again as `net::ERR_ABORTED` on the request the browser abandoned, so the report blames each request at most once and a stylesheet the sheep never wrote is the one line `404 /gone.css`.
- **2026-09-08 — The eyes let every other origin through, where the spike aborted them.** The design's call, built as written. Journey 2's criterion, that a page leaning on a CDN renders and the request list names the origin, is not walked until a page actually fetches one.
- **2026-09-08 — The binding rides `scripts/bundle.mjs` untouched.** `shippedConfig` spreads the cell's config, so `pnpm bundle` put `browser` at both the top level and `env.pen` of `home/wrangler.jsonc` with no change to the script; eyes phase 2's first proof clause needs no code.
- **2026-09-08 — `eyesFor(env, files, sql)` is the one typed place that decides.** A cell in the test pool always has `BROWSER`, so the negative case is proved by passing an env with it undefined; eyes phase 1 should ask the factory for `/home` rather than take a field the pool can never leave empty.

**Status: CLOSED.** 2026-09-08. The eyes render the spike's fixture from the rows in workerd and see the bug, the 404, both console levels, the tree, and the counter at `2`; `--root`, `--full`, a missing path, and the kept session id all hold; a cell with no `BROWSER` builds no `Eyes`. Verified by the conductor, cold cache included, and falsified by two mutations.

## Phase 1: The look

**Closes:** journeys 1 and 2 in full; journey 4 step 2.

**Work:** `packages/cell/src/env/look-command.ts`: `look` as a just-bash
custom command like `pasture`, the flags parsed as the design shapes
them, the path resolved against the working directory and the root,
the PNG written to `--out` through the files table, the report to
stdout, refusals as the command's own result. `execution-env.ts`: the
command in the shell's `customCommands` when the cell has eyes;
`LOOK_PROGRAMS` counted as tier 0 the way `PASTURE_PROGRAMS` is, so a
line naming `look` never routes to the container. `programs.ts` and
`prompt.ts`: `eyes` on `Home`; the paragraph after the shell's line
when the home has eyes, saying the program, its flags, the read tool
for the PNG, and the `dist` rule with `--outDir`; the not-found
sentence for a home without. `directory.ts` and `index.ts`: `eyes` in
`/home`. The prompt's byte-for-byte test for a home without eyes
holds as it did.

**Not this phase:** No release, no station, no CLI change beyond what
`sheep home` prints from `/home`.

**Proof:** `pnpm test` exits 0 with the program's suite: each flag,
the report on stdout equal to `report.ts`'s for the same look, the PNG
read back from the table as bytes, exit 1 and one line for a missing
path, the annotated not-found line and no paragraph on a cell without
eyes, `eyes` in `/home`. Then the walk: `sheep home local` on this
laptop with Docker, journey 1 with a real model, the transcript showing
the image block; journey 2 with a real model, the Vite app built into a
syncing directory and looked at from the rows. **⚑** none; the model's
key is the shepherd's, as every walk's.

**Findings.**

- **2026-09-09 — puppeteer's pruned snapshot takes a page with nothing focusable for one leaf.** Journey 2's built page printed `RootWebArea "app"` alone while the picture showed the table; `interestingOnly` stops at a focusable named root with no focusable child. The eyes take the snapshot whole and cut it by their own rule.
- **2026-09-09 — The prompt's one paragraph was enough.** Journey 1's sheep looked with two `--click`s in one line and read the PNG unasked; journey 2's ran `vite build --outDir site` and `look --root app/site index.html` on its own, from `npm create vite` to the picture in 39 s.
- **2026-09-09 — `look --root site index.html` reads two ways, and the program takes both.** Relative to the working directory it is outside the root; the program then reads it under the root, so the design's example and the `ls` spelling name the same page.
- **2026-09-09 — Chrome asks for `/favicon.ico` once per browser session.** The first look at a page without an icon lists its 404; the second, in the same session, lists none, which the walk showed and the report-equality test dodges with an inline icon.
- **2026-09-09 — The request list names another origin, through the eyes and not the report.** A page loading lodash from cdn.jsdelivr.net rendered with it and `seen.requests` named the origin, on this laptop's network; the report prints failures only, so journey 2's criterion is walked in the pool, not read by a sheep.
- **2026-09-09 — Every look on the local home took 1.1 to 1.4 s, the first included.** The wrangler cache was warm from eyes phase 0; the launch a cold machine pays is eyes phase 2's hermetic ring to measure.

**Status: CLOSED.** 2026-09-09. `look` is in every sighted sheep's shell and routes nowhere else; the prompt carries the paragraph only with eyes; `/home` says `eyes`; the suite holds each flag, the report byte for byte, the PNG from the rows, and the blind home's line; journeys 1 and 2 walked on the local home with a real model, the tree hole the walk found fixed and proved.

## Phase 2: The station

**Closes:** journey 3 in full; journey 4's second criterion.

**Work:** `scripts/bundle.mjs` carries the binding through to `home/
wrangler.jsonc` unchanged, and the release's guard checks it is there;
`packages/cli/src/home.ts`: `eyes: yes|no` in the report and its JSON,
and the local home's start saying that the first look fetches a Chrome.
`scripts/hermetic.mjs`: the package ring walks journey 1 steps 1 to 4
with the faux provider on the local home; the account ring walks the
same on its station. `README.md`, `SKILL.md`, and `sheep --agent-help`
say what a sheep can see. CI's cache holds `~/.cache/.wrangler/chrome`.

**Not this phase:** Nothing open above.

**Proof:** `pnpm hermetic --ring package` exits 0 with the look walked
on a local home in a fresh `HOME`, the Chrome fetched there. `pnpm
release --no-push --force` builds a candidate whose `home/wrangler.jsonc`
has the binding in both environments. Then the walk, on the account:
`sheep home` on `sheep-2` says `eyes: no` and a look there is refused
by name; `sheep home deploy` upgrades it; `sheep home` says `eyes:
yes`; journey 1 walked there with a real model, the first look's launch
and the second look's connect timed and recorded; `pnpm hermetic --ring
account --yes <ref>` green. **⚑ provision:** the upgrade of `sheep-2`
and the ring's station on the shepherd's account, and the browser
minutes both spend, ten a session at most.

**Status: NOT STARTED.**
