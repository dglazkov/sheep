---
status: planned
since: 2026-09-08
see: eyes
note: "written 8 Sep 2026, the afternoon of the spike, from a conversation with the shepherd: sheep are to become decent frontend engineers, and for that they need eyes. The shepherd's calls: the sheep asks with a `look` program in its shell, not a fifth tool, and reads the PNG with the read tool it has; one browser per cell kept ten minutes, the shared per-home browser a debt; the eyes read the workspace rows, and the container's dev server is a later project; a fixed handful of flags, `--script` the open door. Nothing built."
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
   answers with the not-found line and the sentence: this home has no
   eyes, and a station upgraded from this release has them. `sheep
   home` prints `eyes: no`.
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
- The suite passes on a machine with an empty `~/.cache/puppeteer`, the
  Chrome fetched by the first test that needs it, and in CI.
