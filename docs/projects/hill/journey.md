---
status: done
since: 2026-09-16
see: hill
note: "planned and built 14 to 16 Sep 2026 from the shepherd's ask for an observation point: a Web UI they can sign into easily and watch sheep in action, small first and deep later. The station serves the page itself at `/hill/`, before its own door, never a second Worker; `sheep hill` prints a one-time link, the link buys a seat in an HttpOnly cookie named for its home, and a seat only looks: every write and the socket to a cell are refused, and looking never wakes a sheep nothing has asked. Four phases, all CLOSED: the door; the shell and the gate, with the release carrying the page; the flock, polled every two seconds while visible; a sheep's page, whose blocks are the rendering `sheep log` prints through. Orienting caught two holes before any code, a seat reaching the WebSocket and a look waking a birth, and the conduct caught two more: ids fold by their last eight, since a uuidv7's first eight are shared, and each home names its own seat cookie, after two local homes signed each other out. Journeys 1 to 4 walked; journey 5 step 1 walked on a station deployed for it and deleted after, with a real model, in a headless Chrome because the shepherd's display was off; step 6's hour held there, 1,798 asks in 3,601 s. The shepherd said yes to the look on 16 Sep and closed the last phase on what had been proved; `h1` has never run inside the account ring, which failed three times before reaching it, and issue #13's split carries that."
---

# Hill — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**,
pi sessions each in a cell at a **home**; the person is the
**shepherd**. Every surface built so far is the dog's: `sheep ls`,
`sheep status`, `sheep log`, `sheep attach --json`. The shepherd sees
the flock only through the dog's tool output, one command at a time,
pasted or scrolled. **A hill is where a shepherd stands to see the whole
flock at once without walking to any sheep**: a page at their station,
in their browser, signed into in one gesture, that shows every sheep and
what each is doing, and lets them open one and watch it work. This
project is the hill's first cut, sign in and see; later projects go
deep, panel by panel, the way a browser's DevTools grew.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring where a ring can, and in a real browser at
a real station where it cannot. [design.md](design.md) is the mechanism
and [phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **The hill**: the page, served by the station at `/hill/`. The same
  Worker, the same origin, the same routes the dog uses.
- **A pass**: a one-time way in, minted by whoever holds the home's
  token, good for two minutes and one use, carried in a link.
- **A seat**: a browser's standing at the hill once a pass is taken: a
  cookie the browser keeps and the home remembers, until it is given up
  or thirty days pass.
- **The gate**: what the hill shows a browser with no seat: how to get
  one, and nothing of the flock.
- **The flock**: every sheep at the home, as `sheep ls` lists them, with
  the home's own line above.
- **A sheep's page**: one sheep's transcript, live while a turn runs.

## Journey 1: The shepherd climbs the hill

The shepherd has a station (stile journey 1) and a dog that has minted
a few sheep. They want to see them.

1. The shepherd asks the dog to show them the hill, or types it
   themselves: `sheep hill` prints one line, a link at the station,
   `https://<station>/hill/?pass=<pass>`, and nothing else.
2. They open the link. Within two seconds the browser is at
   `https://<station>/hill/` with no pass in the address, and the flock
   is on the screen: the home's line, and one row per sheep.
3. They open the same link again in another window. The hill shows the
   gate with one sentence: the pass was used, run `sheep hill` for
   another. Nothing of the flock is shown.
4. They close the browser, open it the next morning, and go to
   `https://<station>/hill/`. The flock is there; no link was needed.
5. They press sign out. The gate is shown; a reload shows the gate; the
   dog's commands never noticed.
6. Somebody who finds the station's address opens
   `https://<station>/hill/` cold. The gate, and the same sentence a
   wrong pass gets; `GET /sessions` from that browser is refused with
   the bare 401 the home gives a missing bearer.

Acceptance criteria:

- The home's token is never in a link, the page's source, its scripts,
  its storage, or any request the browser makes. The proof searches the
  browser's network log and storage for the token's bytes and finds
  none.
- A pass is refused after its one use and after two minutes, with one
  sentence each; a seat outlives a browser restart and dies at sign out
  or after thirty days.
- A seat admits reads and nothing else: a `POST`, `PUT`, or `DELETE` to
  any route with only a seat is the same 401 as no bearer, and so is a
  WebSocket upgrade to a cell, whose protocol writes. `sheep hill`
  against a home too old to have the route is refused with the sentence
  `sheep sh` gives a home that lacks the peek.
- The cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, on the
  station's origin alone.

## Journey 2: The flock

The shepherd is seated and watching while the dog works.

1. The flock lists every sheep the home has, newest first, with the
   columns `sheep ls` has: id, name, born, state, pasture, its secrets'
   names; and beside them what the row also carries, the task and
   bleat's setup. The home's line above says the station's
   name, its build, whether it has a container and eyes, and the
   container minutes spent against the budget, as `sheep home` says
   them.
2. The dog runs `sheep new --detach`. Within three seconds the new
   sheep is a row at the top, `idle`; nothing was clicked.
3. The dog prompts it. The row turns `running` within three seconds,
   with the task the row carries; when the turn ends the row is `idle`
   again with the same delay.
4. The dog mints a sheep into a pasture whose `setup.sh` is slow. The
   row says setup is running and for how long, the seconds moving,
   then `ok` and its length, exactly what `sheep status` says.
5. The dog runs `sheep rm` on a sheep. Its row is gone within three
   seconds.
6. The shepherd leaves the tab open overnight. In the morning it is
   right, and the home's logs show the hill asked about the flock no
   more than once every two seconds the whole night.

Acceptance criteria:

- Every fact on the flock comes from the routes the dog already reads,
  `GET /home` and `GET /sessions`; the flock adds no route to the home
  and wakes no cell.
- A row's state and setup are the Directory's words, unchanged; nothing
  the dog reads changed.
- The page is usable at a phone's width and at a laptop's.

## Journey 3: One sheep

The shepherd wants to watch one sheep work.

1. They click a row. The sheep's page opens: its id and name, its state,
   what it is doing now (the open operation and the tool it is on, as
   `sheep status` says them), and its transcript, oldest first.
2. The transcript shows what `sheep log` prints: the shepherd's and
   dog's prompts, the sheep's replies, each tool call with its arguments
   and its result folded under it, and bleat's `[setup]` blocks where
   they happened. A folded result opens on a click.
3. The dog prompts the sheep. The prompt appears within three seconds;
   each entry that lands appears within three seconds of landing, in
   the order `sheep attach --json` prints them; the page follows the
   bottom unless the shepherd has scrolled up.
4. The dog aborts the turn. The page says so where `sheep log` would.
5. They open a sheep being born into a pasture with a slow setup. The
   page says setup is running, from the row, at once; it does not hang
   on the cell until setup ends, and the transcript fills in when the
   cell answers.
6. The dog runs `sheep rm` on the sheep they are watching. The page says
   the sheep is gone and offers the flock; nothing errors.
7. The back button returns to the flock, and a sheep's page has an
   address of its own, `/hill/s/<id>`, that a reload or a pasted link
   opens straight.

Acceptance criteria:

- The transcript is read from `GET /s/<id>/transcript` and its long
  poll, the route the collie follows a turn with; the hill speaks no
  binary protocol and opens no WebSocket in this project.
- What an entry says is what `sheep log` says of it: the two share one
  rendering of pi's entries into blocks, or the proof compares them.
- The page's own memory is bounded: a transcript of a thousand entries
  renders, and the page holds one copy of it.
- Looking never wakes a sheep: opening the page of a sheep nothing has
  prompted says so from its row and asks nothing of its cell, so no
  birth, clone, setup, or container starts because a shepherd looked.

## Journey 4: The developer's rig

A developer of sheep runs the local home (stile journey 4).

1. `sheep home local` serves the hill at `http://127.0.0.1:<port>/hill/`
   from the checkout's build, and `sheep hill` against it prints a
   link that seats a browser there.
2. The home ring starts a `wrangler dev` that serves the hill, and its
   tests read the gate, take a pass, and read the flock and one sheep's
   transcript with the cookie alone.
3. `pnpm test --ring checkout` runs the page's own logic with no browser
   and no home.

Acceptance criteria:

- The hill's files are built by the same script that builds the rest,
  and a checkout with no build serves a gate that says so rather than a
  404.
- The local home admits the seat on `http://127.0.0.1` the way the
  station does on `https://`, and nothing about the station's cookie is
  loosened for it.

## Journey 5: The walk

The conductor wants it proved where the station is real, the model is
real, and the browser is a person's.

1. On a station deployed for the walk from a scratch kennel, with a real
   model, journeys 1, 2, and 3 walked in a real browser, and the station
   deleted after: the conductor in Chrome, frames captured
   at each step and read as a newcomer would read them, the times
   recorded.
2. The release ring installs a release that carries the hill and walks
   journey 4 step 1 against the local home it makes.
3. The account ring's walk gains a step `h1`: a station deployed, a pass
   minted, a seat taken with `fetch`, the flock read with the cookie
   alone, a write refused with it, and the transcript of a sheep the
   ring already prompted read with it. **⚑** it deploys a station on
   the shepherd's account.

Acceptance criteria:

- Before anything is built to the screen, the shepherd has seen the
  frames of the gate, the flock, and a sheep's page as mockups and said
  yes; the walk's frames are judged against those.
- No step of the walk reads the home's own logs to learn what the hill
  did, except journey 2 step 6's count.
