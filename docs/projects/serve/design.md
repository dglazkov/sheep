# Serve — the design

**9 September 2026.** Design. Nothing built. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.
The project that left the door open is
[eyes](../eyes/design.md), under "the container's dev server".

The thesis in one line: **a sheep can look at a page its dev server
serves, and the server lives for the length of the look.**

Eyes gave a sheep the write, look, fix loop for what it wrote into rows:
`look index.html` renders the files beside it, and a built app goes
through `vite build --outDir site` and then `look --root site
index.html`. A frontend engineer does not build to look. They run the
dev server and reload: the source app, unbundled, with the framework's
own error overlay, its proxy to an API, its SPA fallback, and no hashed
tree churning back into the rows after every build. A sheep cannot do
that today, and the reasons are all by design:

- The container runs one command at a time. The pen agent refuses a
  second `run` while one is in progress, so a server that stands would
  block every `pnpm test` and `git` for the rest of the turn.
- A run ends when its stdout closes and its process group is killed.
  `vite dev &` hangs the tool call until its timeout, and the kill takes
  the server with it. Nothing can be left behind, and nothing should be.
- The eyes read rows. A port in the container is invisible to Browser
  Run, which runs on the platform, not in the container.

Pen's thesis is that a cell rents a machine for the length of a command.
Serve's is the same sentence one step on: **a look rents a server for
the length of the look.** One flag on the program the sheep already has
starts the command in the container, waits for its port, renders the
page from it through the interception the eyes already do, and stops
it. Nothing stands, there is no lifetime for the sheep to manage or to
forget, and the container's idle clock runs as it always did.

The shepherd's calls, 9 Sep 2026: the server is rented per look, not
kept across a turn; the forward crosses the container's one socket as
frames, so the container stays a client of the cell and the proof runs
in workerd through the fake; the sheep is told in the prompt's
paragraph, and the recipe for a frontend app is a pasture skill; no
script in the image.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a served look | `look --serve '<command>' [--port <n>] [<path>]`: the command run in the container, the page rendered from its port, the command stopped | the `look` program's one run |
| the server | the command a served look runs; an ordinary `run` on the container's lane, `PORT` in its environment, killed when the look is done | the container, for seconds |
| the port | where the server listens inside the container, `5173` unless `--port` says; the same number as `PORT` | the look's flag |
| the forward | two frames on the container's socket: `fetch` from the cell, `response` and its bytes from the container, one pair per request the page makes to the origin | `packages/pen/src/protocol.ts`; the agent and `packages/cell/src/pen/forward.ts` |
| an origin | what answers the browser's requests to `http://sheep.invalid`: the rows under a root, as eyes built it, or the forward to a port | `packages/cell/src/eyes/origin.ts` |
| the `server` section | the tail of what the server printed, in the report of a served look, after `errors` | `report.ts` |
| the rental | the cell's side of a served look: rent, sync in, run, wait for the port, hand an origin to the eyes, kill, sync out | `CellExecutionEnv.rentServer` in `execution-env.ts` |

## The program

`look` grows two flags and keeps every other:

```
look --serve '<command>' [--port <n>] [<path>]
     [--click <selector>]… [--fill <selector> <text>]…
     [--viewport <w>x<h>] [--full] [--out <file>]
```

`--serve` takes one argument, the command, as the sheep would type it
in the bash tool; the container's bash runs it under the working
directory with `PORT` set to the port. `--port` is the number the
command listens on, `5173` unless said, and the number `PORT` carries,
so `look --serve 'npx vite --port $PORT --strictPort' /` and `look
--serve 'npx vite --port 4000 --strictPort' --port 4000 /` mean the same
thing. The `$PORT` in the sheep's line reaches the container unexpanded:
just-bash hands the program the string, and the container's bash
expands it against the run's environment. A framework that reads `PORT`
on its own needs no flag at all.

With `--serve`, `<path>` is a path on the server, `/` unless said; a
path with no leading slash gets one. It is not a workspace file, so
`--root` does not combine with `--serve`, and the pair is the usage line
and exit 2. The flags for clicks, fills, the viewport, the full page,
and the PNG's name act as they do on a look at the rows.

A served look, in order:

1. The container is rented and the workspace synced in, setup included,
   as any tier-2 line's is. The server therefore sees what the sheep
   wrote up to this line, which is what a reload would show.
2. The command runs as a `run` on the container's lane, `run-N` like
   any other, with `PORT` laid over the shell's environment. The
   sheep's own timeout on the bash tool covers the whole look.
3. The cell polls the port through the forward every quarter second: a
   `fetch` of `HEAD /` that comes back with any status is ready; one
   the agent could not connect is not yet. A run that exits before the
   port answers, or a port that does not answer within thirty seconds,
   is one error line, exit 1, with the last lines the command printed
   after it: `look: the server exited 1 before answering on 5173`, then
   the tail. The run is killed either way.
4. The eyes render `http://sheep.invalid<path>` as they render a page
   from the rows, with one difference: the origin. Every request to
   `sheep.invalid` becomes a `fetch` frame; the agent asks
   `http://127.0.0.1:<port>` with the method, the path and query, the
   headers, and the body, and answers `response` with the status, the
   headers, and the bytes. Other origins go to the network as before.
   The clicks and fills, the screenshot, and the tree follow.
5. The run is killed, the way a timeout kills one: `SIGKILL` to the
   process group, `killed` from the agent, then the sync-out every run
   ends with. A dev server writes its cache under `node_modules`, which
   the cache rule keeps in the container, so the sync-out is small.

The report gains one section for a served look, `server`, after
`errors` and before `console`: the last forty lines the command wrote
to either stream, since a Vite compile error lands there and in the
page's overlay, and the overlay is a picture. A look at the rows has no
`server` section; a served look always has one, `none` when the
command was silent. The closing line says what served: `wrote look.png
1024x768 in 4.1s, served by \`npx vite --port $PORT --strictPort\` on
5173, ready in 0.8s`.

## The forward

The container is a client of the cell, and stays one. The platform has
a port binding a Durable Object could fetch through, and the eyes design
named it; this project does not use it. Its reasons, in order: the fake
container the workerd suite runs against cannot answer a port, so the
proof would be the walk; wrangler dev's support for the binding is a
spike no one has run; and pen's rule that nothing connects into the
container is worth more than one line of code.

So the forward is two frames on the one socket, beside `run` and the
syncs:

- `fetch {id, port, method, url, headers, size}` from the cell, `url` the
  path and query, `port` the loopback port to ask (only the cell knows
  which server the look is of), and one binary message of `size` bytes
  after it when the request has a body. The agent handles it off its frame chain, the way
  `run` is handled, so a page's fifty module requests are fifty fetches
  in flight, not a queue.
- `response {id, status, headers, size}` from the container, and one
  binary message of `size` bytes after it when there are any. The agent
  sends the pair back to back with no await between, so the bytes
  follow their frame.

The agent asks `http://127.0.0.1:<port><url>` with the browser's method,
headers, and body, three headers changed: `host` is the loopback
address and port, so a server that checks its host, as Vite does since
6.0.9, answers; `accept-encoding` is pinned to `identity`, so bodies
arrive as bytes the browser can take as they are; and redirects are not
followed, so the browser sees the `302` and follows it itself. Pinning
is serve phase 0's correction of dropping: Node's own `fetch` puts
`gzip, deflate` back when nothing says otherwise, and then decompresses
the body while leaving `content-encoding: gzip` on it, so a body
forwarded as it came would say gzip and not be. A fetch the agent could
not make, the port not listening, is `response` with status `0` and the
error's text as the body, and the cell reads that as not ready during
the poll and as a failed request during the look. Status `0` is no
status a browser can be given, so the eyes' side turns it into `502`
with the agent's words as the body: the eyes are the gateway, and the
server was not there.

On the socket, a binary message belongs to the text frame that
announced it. Today the `Checkout` announces them during a sync; the
forward announces them during a look; a sync and a look never overlap,
since the look is a run and a sync happens before and after one, and a
guard on each side throws if a binary message arrives with two
announcers waiting. `Forward` in the cell is the third reader on the
socket after `Checkout` and `ContainerRun`, and sees only its own
frames.

The fake container (`packages/cell/test/fake-container.ts`) grows a
`serve(port, origin)` a test calls to stand a table of responses behind
a port, and its runner starts that origin when a command names it and
tears it down on kill, so a served look's every step runs in workerd
against the protocol, which is pen's rule for every phase.

## The eyes' origin

`Eyes.look` takes an `Origin`, one interface with two members, because
a look asks two questions. `answer` is the one this design was written
around: the request the browser made, the response to give it or
`undefined` for a 404. `start` is the other, found in serve phase 0:
where the look begins. The rows know that as a workspace path that must
exist, must be under the root, and may mean the `index.html` in a
directory — three rules and two error messages that are about rows and
nothing else; a server knows it as a path. Only the origin can say
which, so it says both, and the eyes compute nothing about rows.
`RowsOrigin(files, root)` is what `serve()` did before, moved; the
`look` program builds it for a look at the rows, and a `look` given no
origin at all builds one over the eyes' own rows, so every look that
existed before this project is the look it was. `ForwardOrigin(forward,
port)` is the served look's, built by the rental and handed to the eyes
for the length of one `look`. The interception handler, the listeners,
the report, and the session do not change: the eyes still render a page
from an origin nothing serves, and the origin now has two makers.

Vite's client opens a WebSocket to the origin for hot reload. Puppeteer's
interception does not see an upgrade, so the socket fails and the
client logs one line to the console, `[vite] failed to connect to
websocket`, and tries again. The eyes keep the line: the report is
what the page said. The prompt says it is expected on a served page,
and journey 1 checks the sheep does not go fixing it.

## What the sheep is told

The eyes' paragraph gains sentences when the home has a container as
well as eyes: what `--serve` does, that `PORT` is set and `--port`
names it, the Vite line, that `<path>` is on the server and `/` unless
said, that the server is stopped after the look, that the websocket
line is expected, and that `--root` does not combine with it. A home
with eyes and no container has the paragraph as eyes wrote it, and
`look --serve` there is one line, `look: --serve needs a container;
this home has none`, exit 1.

The recipe for a frontend app is a skill, not a paragraph: which
scaffold, `--serve` for a look and `--outDir` for a built site, tests
between looks, and the one warning that a server put in the background
never survives its line here. It is pi's format, listed in the prompt
by the pasture the sheep was born into, and it ships in this project as
[skills/frontend/SKILL.md](skills/frontend/SKILL.md), which a dog puts
into a pasture with `sheep pasture put <name>
skills/frontend/SKILL.md`. The dog's own skill and the agent guide say
it exists. No script in the image: the flag is the mechanism, and the
skill is the words.

## What this does not do, on purpose

- **A server kept across looks.** One per turn, on a lane of its own
  beside `run`, stopped when the turn ends, so a second look pays no
  start and the server's watcher sees the sync-in. The frames here do
  not care how long the run lives, so the change is a lane in the agent
  and a lifetime in the cell. Open until a walk shows served looks are
  too slow; eyes phase 1's numbers say a warm Vite is under a second.
- **Hot reload.** The websocket is not forwarded; a served page is a
  reload, not a session.
- **A port for the dog.** No `sheep open <id>`; the dog reads the report
  in `sheep log` and asks the sheep what it saw.
- **The platform's port binding.** Named above and left; a later
  project can swap the forward's transport if the frames prove slow.
- **More than one port.** A page that needs an API beside its dev server
  runs both under one command and proxies the one through the other,
  which is what Vite's `server.proxy` is for.
