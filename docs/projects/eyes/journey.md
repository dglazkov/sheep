---
status: done
since: 2026-09-08
see: eyes
note: "written 8 Sep 2026, the afternoon of the spike, from a conversation with the shepherd: sheep are to become decent frontend engineers, and for that they need eyes. The shepherd's calls: the sheep asks with a `look` program in its shell, not a fifth tool, and reads the PNG with the read tool it has; one browser per cell kept ten minutes, the shared per-home browser a debt; the eyes read the workspace rows, and the container's dev server is a later project; a fixed handful of flags, `--script` the open door. Eyes phase 0 closed the same day: the `Eyes` class over the browser binding and the cell's files table, the interception that answers `http://sheep.invalid` out of the rows and lets every other origin through, the report as one pure function, and the session kept warm in a row by id; journey 4 steps 1 and 3 hold in workerd, the spike's fixture rendering from the rows with its bug, its 404, its console, its tree, and its counter at 2 after two clicks, and a cell with no `BROWSER` building no eyes. The Chrome miniflare fetches lives in the wrangler cache, not `~/.cache/puppeteer` as the design first said. Eyes phase 1 closed 9 Sep 2026: `look` is a just-bash command in every sighted sheep's shell, tier 0 like `pasture`, with the design's flags; the PNG is written through the files table and the report is stdout; the prompt carries one paragraph after the shell's line when the home has eyes, and a home without says `this home has no eyes; a station upgraded from this release has them`; `/home` reports `eyes`. Journeys 1 and 2 walked on the local home with a real model: the counter page looked at, clicked twice, read as an image, broken and diagnosed from the report; the Vite app scaffolded and built in the container into `app/site`, looked at from the rows with the hashed asset served and the table's cells in the tree, once the walk had found that puppeteer's pruned snapshot reports a page with nothing focusable as its root alone, and the eyes took the snapshot whole. Journey 4 steps 2 and 3 hold in workerd. Eyes phase 2 is PART-DONE the same day: the release guards the binding in both environments, `sheep home` prints `eyes: yes|no` and carries it in its JSON, `sheep home local` says where the first look's Chrome goes, the package ring walks journey 1 steps 1 to 4 with the faux provider in a fresh `HOME` (the Chrome fetched, the first look 7.7 s and the second 1.0 s on the candidate), the account ring carries the same walk, and README, SKILL.md, and the agent guide say what a sheep can see. Journey 3 was walked on the account the same night, the shepherd's hand on the two token-bearing commands: `sheep-2` at build 768051a said `eyes: no` and answered a sheep's `look` with its container's not-found line; `sheep home deploy` from release b321940 upgraded it in two minutes; `sheep home` said `eyes: yes`; a real model wrote the counter page and looked, 9.9 s for the first look with the platform's launch, 5.6 and 3.6 s on the kept session; the account ring deployed `sheep-hermetic-c561609` from the older release, upgraded it, walked the look there as step e2 (4.8 s then 3.2 s), and deleted it, the listing as before. The dashboard's Browser Run page was opened but its pane rendered nothing readable to the conductor; the ring's listing says nothing else changed on the account. Done: every journey walked."
---

# Eyes — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. A sheep writes pages it cannot see.
**Eyes** are a real Chromium on the platform the cell lives on, reached
from the sheep's shell: one command renders a workspace path, writes
the picture beside it, and prints what the page said while it rendered.

Each journey is an acceptance test: the work is done when it can be
walked as written, with a real model, on a home a shepherd could have.
[design.md](design.md) is the mechanism and [phases.md](phases.md) the
walk. If a journey and the mechanism disagree, the mechanism is what
changes.

Vocabulary the journeys use:

- **A look**: `look <path>` in a sheep's shell; a PNG in the workspace
  and a report on stdout.
- **The report**: errors, console, tree, and the closing line, as text.
- **The origin**: `http://sheep.invalid`, where the workspace is mounted
  inside the browser; nothing serves it.
- **The session**: the cell's browser, kept ten minutes past its last
  look.

## Journey 1: A sheep sees its bug

The dog has a local home (`sheep home local`) and asks a sheep for a
small page.

1. `sheep new -- "Write a counter page: index.html, style.css, and
   app.js as a module. A button increments a number. Load the list in
   items.json into a <ul>. Then look at it and fix anything wrong."`
   The sheep writes the four files.
2. The sheep runs `look index.html`. The first look on this machine
   takes longer, and the home said at start that it would, since
   wrangler fetches a Chrome. The report comes back: `errors` empty or
   not, `console` with whatever the module logged, `tree` with the
   heading, the button, and the list items, and `wrote look.png
   1024x768 in …`.
3. The sheep reads `look.png` and sees the page: the styling it wrote,
   the number, the list. If the page has a bug, an undefined name, a
   stylesheet path that 404s, an empty list, the report or the picture
   shows it; the sheep fixes the file and looks again.
4. The sheep runs `look index.html --click "#inc" --click "#inc"` and
   the tree shows the number at `2`. It reports to the dog in a
   sentence what the page looks like and that the button works.
5. The dog reads `sheep log <id>` and finds the report in the
   transcript, text it can quote to the shepherd.

Acceptance criteria:

- A look on a page with a runtime error lists the error under `errors`
  and exits 0; the look happened, the page is broken, both are said.
- A look at a path that is not in the workspace is one error line and
  exit 1.
- `look.png` is a PNG the read tool returns as an image; the transcript
  shows the image block on the sheep's next turn.
- A second look within ten minutes connects to the same session; the
  cell's row holds one id across the two.

## Journey 2: A built app, looked at

The dog's home has a container. The sheep is asked for a small Vite
app.

1. `sheep new -- "Scaffold a Vite vanilla-TypeScript app in app/, add a
   component that renders a table of three rows, build it into app/site,
   and look at the result."` The sheep runs `pnpm create vite`, writes
   the component, and `pnpm build --outDir site` in the container.
2. `dist` would have stayed in the container by pen's rule; `site`
   syncs back to the rows. The sheep runs `look --root app/site
   index.html`. The built page's `/assets/index-….js` resolves from the
   root; the tree shows the table's cells.
3. The sheep reads the PNG and reports what it sees. The dog asks it to
   make the header row bold; the sheep edits, builds, looks, and answers
   with what changed in the picture.

Acceptance criteria:

- A path under the root that Vite's build wrote with a hashed name is
  served from the rows with the content type its extension says.
- A page that fetches a font or a script from another origin renders
  with it, and the request list names the origin.
- The prompt's paragraph says the `dist` rule and `--root`, and the
  sheep uses `--outDir` without being told twice.

## Journey 3: The station has eyes

The shepherd's station, `sheep-2`, was deployed before this project.

1. Before the upgrade, a sheep there runs `look index.html`. The shell
   answers with its not-found line: that station's cell is older than
   the eyes and knows no sentence for them, so the line is its
   container's `look: command not found`, and `sheep home` prints
   `eyes: no`. The annotated sentence, this home has no eyes and a
   station upgraded from this release has them, is what a home running
   this release without the binding says, journey 4 step 3.
2. `sheep home deploy` from the kennel, the release carrying the
   binding. `sheep home` prints `eyes: yes`.
3. Journey 1 walked on the station with a real model. The first look
   pays the platform's launch, three to ten seconds; the second, within
   ten minutes, connects in under half a second and the look is under
   five.
4. The account ring, `pnpm hermetic --ring account`, deploys a station
   named for the commit, walks journey 1 steps 1 to 4 with the faux
   provider, and deletes it, as station's ring does today.

Acceptance criteria:

- The home's `/home` reports `eyes`, and the CLI's report and its JSON
  carry it.
- The dashboard's Browser Run page shows the session opened by the
  walk and closed ten minutes after its last look; nothing else
  changed on the account.
- `pnpm hermetic --ring package` walks journey 1 steps 1 to 4 on the
  local home with the faux provider, the Chrome fetched into the ring's
  fresh `HOME`.

## Journey 4: The eyes in workerd

The conductor wants the eyes proved without a model or an account.

1. `pnpm test` in `packages/cell` renders the spike's fixture, four
   files with a deliberate bug, through the eyes in the vitest pool: the
   PNG is bytes of a PNG at the viewport's size, the error names the
   undefined function, the tree holds the heading and the button, the
   404 for `favicon.ico` is listed, two clicks make the counter `2`.
2. The same suite runs the `look` program through the shell against
   those rows and compares its stdout to the report, and reads the
   written PNG back from the table.
3. A cell whose env has no `BROWSER` is the pre-upgrade station:
   `look` there is the annotated not-found line, and `/home` says
   `eyes: false`.

Acceptance criteria:

- Every proof runs in workerd through `@cloudflare/vitest-pool-workers`;
  none is a Node test of the browser.
- The suite passes on a machine with an empty wrangler cache, the Chrome
  fetched by the first test that needs it, and in CI.
