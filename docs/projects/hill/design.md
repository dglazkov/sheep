# Hill — the design

**14 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **the hill is a face of the station, not a
second Worker: the same origin, the same routes, served from beside
them; the way in is a one-time link the dog's command prints, exchanged
for a cookie, so the home's token never reaches a browser; and in this
project the hill only observes.**

The shepherd's ask: an observation point. A Web UI they can easily sign
into and watch sheep in action, starting very small (sign in, see
status) and going deep, Chrome DevTools style, over time. Today the
shepherd sees the flock through the dog: `sheep ls` pasted into a chat,
`sheep status` when asked, `sheep log` scrolled. Every one of those is a
question the dog has to be asked; none of them is a glance. A person
minding a flock wants a glance.

Everything the hill would show already exists as a route. `GET /home`
is the station's line; `GET /sessions` is the flock, answered from the
Directory in a millisecond whatever any cell is doing (bleat phase 0);
`GET /s/<id>/transcript?wait=25000&tip=<tip>` is one sheep's transcript
with a long poll that returns when an entry lands, which is how the
collie follows a turn. What does not exist is any way for a browser to
be admitted: the home has one bearer token, kept in the kennel's config
and put on the wire by the dog's command, and a browser can put it
nowhere a page could use it without the page's scripts holding it. So
the project is three things: a door for a browser, a page beside the
routes, and the two views. It is deliberately the smallest hill that is
a hill.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the hill | the page at `/hill/`: the gate, the flock, a sheep's page | `packages/hill/` |
| a pass | one way in: 32 random bytes as hex, minted by a bearer, two minutes, one use | `POST /hill/passes`; the Directory's `passes` |
| a seat | a browser's standing: 32 random bytes as hex in a cookie, its sha256 a row, thirty days | `GET /hill/seat?pass=`; the Directory's `seats`; the cookie `sheep-seat` |
| the gate | the hill with no seat | `packages/hill/src/gate.ts` |
| the flock | every row, newest first, and the home's line | `packages/hill/src/flock.ts` |
| a sheep's page | one transcript, live | `packages/hill/src/sheep.ts` |
| the verb | `sheep hill`: a pass minted and printed as a link | `packages/cli/src/hill.ts` |
| the door | `admitted()` taking a seat for a read | `packages/cell/src/index.ts` |
| the assets | the built page, served by the Worker's assets binding | `packages/hill/dist/` in a checkout, `home/hill/` in a release |
| the blocks | one rendering of pi's entries and bleat's setups into what a person reads | `packages/cli/src/blocks.ts`, shared by `sheep log` and the hill |

## Why the station serves it

Collie is the precedent for a second surface, and it is a second Worker
because its brain is isocan's and it rents nothing of the station's: it
is another client of the routes. The hill is not another brain; it is
the shepherd's eyes on this station. Three things follow from serving
it from the station itself, and each would cost a design of its own on
a second Worker:

- **Same origin, so the cookie works everywhere.** A browser sends a
  same-origin cookie on a `fetch` and on a long poll without a line of
  script, and would send it on a WebSocket upgrade too, which is what a
  later project's live stream will want. A second origin means CORS on
  every route, a preflight per poll, and a cookie the browser refuses
  to send.
- **One deploy, one token, one build.** `sheep home deploy` already
  ships the Worker; the hill is files beside it, uploaded by the same
  `wrangler deploy` through an assets binding. No second name, no
  second secret, no second `home` line.
- **The station's address is the hill's address.** The shepherd has one
  address to know.

The price is an `assets` binding on the Worker's config and a directory
of built files in the release, and `scripts/bundle.mjs` learning one
more step. The Worker runs first on every request (`run_worker_first`),
so no route the dog uses is shadowed by a file, and the files are served
by the Worker handing `/hill/*` to the binding.

## The door

The home's token stays where stile put it: the kennel's config, on the
wire from the dog's command, never typed. A browser is admitted another
way, in two steps, so that the thing in a link is worthless a moment
later and the thing in the browser is worthless anywhere else.

**A pass** is minted by a bearer: `POST /hill/passes` answers `{ url,
expires }`, the url `https://<home>/hill/?pass=<32 random bytes, hex>`.
The Directory keeps `passes(hash, minted_at)` with the pass's sha256,
and a pass older than two minutes is as good as none. `sheep hill` is
the verb: it asks, prints the url on stdout, one line, and exits. It
carries no `--open`; the dog's shell is not the shepherd's browser, and
a shepherd at their own terminal can click a printed link.

**A seat** is what a pass buys. The page, loaded with `?pass=` in its
address, asks `GET /hill/seat?pass=<pass>`; the home deletes the pass's
row (a pass whose row is gone, or too old, is refused with the sentence
the gate shows), mints 32 random bytes, keeps their sha256 in
`seats(hash, seated_at, last_seen)`, and answers with `Set-Cookie:
sheep-seat=<seat>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=`
thirty days, and a 204. The page then replaces its address with `/hill/`
so the pass leaves the history bar, and loads the flock. `DELETE
/hill/seat` with the cookie deletes the row and clears the cookie: sign
out. A mint deletes the passes past their two minutes and the seats past
their thirty days; `last_seen` is written at most once an hour, so a page
that polls is a read and not a write (hill phase 0).

**The door** is one change to `admitted()`: a request with no bearer and
no `?token=` but a `sheep-seat` cookie whose sha256 is a row is admitted
if its method is `GET` or `HEAD` and it asks for no upgrade, and refused
with the bare 401 the home gives any bad token otherwise. The upgrade is
the one GET that is not a read: `GET /s/<id>/ws` opens pi's protocol,
over which a client prompts, steers, and aborts, so a seat that reached
it would be a seat that drives a sheep. A request carrying `Upgrade` is
the bearer's alone. Reads only, and `SameSite=Strict`, so a
page on another site can neither carry the cookie nor do anything with
it if it could. When the hill learns to act (a later project), it will
carry a token of its own on each write, the way every browser app that
acts does; this project does not need one and does not build one. The
seat is checked in the Worker before any cell is reached, from the
Directory, so a cookie costs what a bearer costs.

The local home is the same. `wrangler dev` serves on `http://127.0.0.1`,
which browsers treat as a secure context, so the `Secure` cookie is
kept there too and nothing is loosened for the rig; the home ring takes
a pass with `fetch` and sends the cookie by hand. `SHEEP_ALLOW_ANONYMOUS`
admits a browser as it admits anything.

Two things a reader may expect and will not find. There is no sign-in
form: the shepherd has no token to type, by stile's design, and a form
that takes the home's token would teach them to find it. And there is no
Cloudflare Access: a station is one shepherd's, the join already proves
account ownership another way, and Access would put a second login and a
second dashboard in front of a page whose whole point is one gesture.

## The page

`packages/hill/` is a fifth package: TypeScript, Lit for the components,
bundled by esbuild (already a dependency) into `dist/`: `index.html`,
`hill.js`, `hill.css`, the mark. No framework beyond Lit, no CSS
framework, no router library: three views and `history.pushState`.
Lit, because the hill is to grow panels the way DevTools did, as
components down a tree that a reader can open one at a time, and
because it is small and the platform's own elements underneath. The
whole page is under 100 KiB before compression, and a phase's proof
counts it.

The Worker serves it: `GET /hill` and `/hill/*` go to the assets
binding, every path under it answering `index.html` for the page to
route, files for files. `GET /` from a browser (an `Accept` naming
`text/html`) is a 302 to `/hill/`; from anything else it is `sheep\n`
as it has been, so no command that reads `/` changes. A checkout whose
`dist/` is empty serves a gate that says `pnpm build` rather than a
404, since `wrangler dev` with a missing assets directory is the kind
of error that reads as the home being down.

Three views, one shell. The shell is a top bar: the mark (the stile's
pixel sheep, rendered from the same shapes, small), the station's name
and build from `GET /home`, and sign out. Under it, one of:

- **The gate.** The mark, larger; one sentence: *to climb the hill, run
  `sheep hill` at your terminal, or ask your agent to, and open the
  link it prints*; and, when the address had a pass that was refused,
  its sentence in red above that: *that pass was used* or *that pass
  expired*.
- **The flock.** The home's line: container yes or no, eyes yes or no,
  container minutes spent of the budget. Then the rows, newest first,
  each the columns `sheep ls` has and a state dot: amber, moving, for
  `running`; cyan for `waiting`; dim for `idle`; red for a setup that
  failed. A setup running is its elapsed time, ticking, in the row. The
  flock polls `GET /sessions` and `GET /home` every two seconds while
  the tab is visible and stops when it is hidden (`visibilitychange`),
  which is what makes journey 2 step 6 true.
- **A sheep's page.** Its id and name, its state and setup from the row
  the flock already polls, so a sheep being born shows setup running at
  once; the open operation from `GET /s/<id>/`, and the tool it is on
  from the last tool call in the transcript that has no result yet,
  since `sheep status`'s token and message counts come from pi's socket,
  which the hill does not open; then the blocks, oldest first, the page
  following the bottom unless scrolled up. It reads `GET
  /s/<id>/transcript?wait=25000&tip=` in a loop, the collie's way, one
  request open at a time and none while the page is hidden; a 404 means
  the sheep is gone, and the page says so and offers the flock.

  **Looking never wakes a sheep.** A cell boots on the first thing that
  asks it, and a sheep minted into a pasture with a repository is born
  inside that boot: the clone, `setup.sh`, a container rented (mint
  phase 0). A shepherd clicking down the flock would start every unborn
  sheep's birth. So a sheep whose row has no task and no setup, which
  nothing has prompted, is never asked of its cell: its page says that
  nothing has been asked of it yet, from the row alone, until the row
  says otherwise (hill phase 3's orientation).

**The blocks** are the one thing the hill and `sheep log` must agree
on. `sheep log` renders pi's entries and bleat's setups into text in
`herd.ts`; that rendering moves to `packages/cli/src/blocks.ts` as a
pure function from entries and setups to a list of blocks (a prompt, a
reply, a tool call with its arguments and result, a setup, an abort),
with no Node in it, and `herd.ts` prints from the blocks and the hill
draws them. One function, two faces, and a test that the text face
prints the same bytes it printed before the move.

## The screen

Chrome DevTools is the reference for the shape: dense, panels, a list
on the left that selects what the right shows, everything legible at a
glance and nothing decorative. The stile is the reference for the look:
an id is inked and folded by its last eight characters, since ids are
uuidv7 and the first eight are a timestamp sheep minted in the same
minute share (hill phase 2); the palette is amber for what is happening now, green for settled, red
for refused or failed, cyan for a link and for waiting, dim for what is
not the point; the mark is the pixel sheep; ids and transcripts are in
a monospace face and prose in the system's. Dark ground by default, the
viewer's theme respected. On a laptop the flock is a left column and
the sheep's page fills the rest; at a phone's width they are one column
and the back button is how one returns.

The frames are settled as mockups before phase 1 builds to them
([screen/](screen/)), the stile's lesson: the shepherd tastes the gate,
the flock, and a sheep's page as pictures, and the conductor judges the
built page against those as a newcomer would before calling any phase
with a screen closed.

## What this does not do, on purpose

- **Act.** No prompt, abort, `rm`, shell line, or file write from the
  hill. The seat admits reads. A later project gives the hill hands and
  the token a write needs.
- **The live stream over the WebSocket.** `GET /s/<id>/ws` speaks pi's
  binary protocol, and the protocol writes, so a seat is refused there;
  the long poll is proven and browser-shaped and costs nothing new. A
  later project that wants the token-by-token view brings a listener
  that only listens, or the write token, not a looser door.
- **The DevTools depth.** The shell as a panel, the workspace tree and
  files, the pictures `look` took, the pasture's tree and its secrets'
  names, the container's lane, the collie's log: each is a panel and a
  short project of its own, on the shell this project leaves.
- **A code to type.** A shepherd on a phone whose link is on a laptop
  types the link. A six-character code exchanged at the gate is a small
  later addition.
- **More than one home on one hill.** A hill is its station's.
- **A sign-in form, or Cloudflare Access.** Argued above.
- **The stile printing the hill's link.** `sheep setup`'s finish could
  say it; that is one line in another project's screen, after this one
  has a hill to point at.
