---
status: partial
since: 2026-09-09
see: serve
note: "written 9 Sep 2026, from a conversation with the shepherd: a sheep building a frontend app needs its dev server, and a standing server would occupy the container, so the server is rented for the length of a look. The shepherd's calls: `look --serve` in the shell, one flag on the program the sheep has; the server an ordinary run, killed when the look is done, a server kept across a turn the named debt; the forward as two frames on the container's one socket, so the container stays a client of the cell and the proof runs in workerd through the fake, the platform's port binding left; the recipe for a frontend app a pasture skill, shipped in the project; no script in the image. Phase 0 closed 10 Sep 2026: the forward is built and proved in workerd — `fetch` and `response` on the container's one socket, the agent's fetcher, the fake's stood ports, the cell's third reader, and the eyes rendering from an `Origin` the rows are now one maker of. Journey 4 steps 1 and 3 and its second criterion hold. Journeys 1, 2 and 3 wait on the flags, the rental and the walks."
---

# Serve — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. A sheep with eyes can look at what it
wrote; a sheep with a container can run a dev server, but only for the
length of a line. **Serve** joins the two: one flag on `look` starts the
server in the container, renders the page it serves, and stops it.

Each journey is an acceptance test: the work is done when it can be
walked as written, with a real model, on a home a shepherd could have.
[design.md](design.md) is the mechanism and [phases.md](phases.md) the
walk. If a journey and the mechanism disagree, the mechanism is what
changes.

Vocabulary the journeys use:

- **A served look**: `look --serve '<command>' [--port <n>] [<path>]`
  in a sheep's shell; the command run in the container, the page
  rendered from its port, the command stopped, a PNG and a report as
  any look.
- **The server**: the command, alive for the look and no longer.
- **The forward**: the frames that carry the page's requests to the
  container's port and the answers back.
- **The `server` section**: the tail of what the command printed, in a
  served look's report.

## Journey 1: A sheep sees its source app

The dog has a local home with a container (`sheep home local` on a
machine with Docker) and asks a sheep for a Vite app.

1. `sheep new -- "Scaffold a Vite vanilla-TypeScript app in app/. Add a
   component that renders a table of three rows. Look at it running
   under the dev server, not a build, and fix anything wrong."` The
   sheep runs `npm create vite` and writes the component in the
   container.
2. The sheep runs `look --serve 'npx vite --port $PORT --strictPort' /`
   from `app/`. The report comes back: `errors` empty or not, `server`
   with Vite's `ready in …` line, `console` with the websocket line the
   prompt said to expect, `tree` with the table's cells, and the closing
   line naming the PNG, the command, the port, and how long the server
   took to answer.
3. The sheep reads the PNG and sees the table. It edits the component
   so the header row is bold, looks again with the same line, and sees
   the change with no build between: the sync-in put the edit on the
   container's disk before the server started.
4. The sheep runs the same look with `--click` on a row and the tree
   shows what the click did. It reports to the dog what the page looks
   like.
5. The dog reads `sheep log <id>`: each served look is one bash line
   and one report, and between looks nothing ran in the container.

Acceptance criteria:

- A served look at a page with a runtime error lists the error under
  `errors` and exits 0; a served look at a path the server answers 404
  lists `404 /path` under `errors` and exits 0.
- A `--serve` command that exits before its port answers is one error
  line, exit 1, with the command's last lines after it; a command that
  never listens is one error line after thirty seconds; in both cases
  the run is killed and the next line in the container runs at once.
- After a served look, `ps` in the container shows no server: the next
  bash line finds the lane free.
- The second served look in a turn answers in under two seconds from
  the run's start on this laptop, Vite's cache warm under
  `node_modules`, and the numbers are recorded in phases.md.
- The sheep does not spend a turn on the websocket line.

## Journey 2: A herd with a frontend skill

The dog keeps a pasture for a repository and puts the project's skill
in it.

1. `sheep pasture put <name> skills/frontend/SKILL.md
   docs/projects/serve/skills/frontend/SKILL.md`. `sheep pasture ls
   <name>` lists it; a sheep born into the pasture has it in the
   prompt's skills block.
2. `sheep new --pasture <name> -- "Build a small page that lists the
   repository's top-level directories in a table, with a Vite app in
   web/. Look at it served, and run its tests before you report."` The
   sheep reads the skill, scaffolds, serves, looks, runs `vitest` on
   the lane between looks, and reports what it saw.
3. The dog asks it to build the site into `web/site` and look at the
   built page. The sheep uses `--outDir` and `--root`, as the skill
   says, and both looks are in the transcript.

Acceptance criteria:

- The skill is listed in the prompt under its name and description,
  and the sheep reads it before its first served look.
- The served look and the built look show the same page, and the sheep
  says so.
- No line in the transcript puts a server in the background.

## Journey 3: The station serves

The shepherd's station, `sheep-2`, was deployed before this project.

1. Before the upgrade, `look --serve 'npx vite' /` there is the usage
   line of the older program, which knows no `--serve`.
2. `sheep home deploy` from the kennel. Journey 1 steps 1 to 3 walked on
   the station with a real model; the served look's timings on the
   platform recorded, the container's start included when the look
   rented a cold one.
3. The account ring, `pnpm hermetic --ring account`, walks a served
   look with the faux provider on its station, after the look at the
   rows it already walks.

Acceptance criteria:

- The report on the station has the same five sections it has on the
  local home.
- The container's minutes for the walk are the looks' and nothing more:
  the container stops ten minutes after the last served look, as after
  any line.
- `pnpm hermetic --ring package --docker` walks a served look on the
  local home with the faux provider; without `--docker` the step is
  skipped and named at the end.

## Journey 4: The forward in workerd

The conductor wants the served look proved without a model, a browser
that reaches a real port, or an account.

1. `pnpm test` in `packages/cell` stands a table of responses behind a
   port in the fake container and renders a page from it through the
   eyes: the page, a module it imports, a stylesheet, a PNG, a `fetch`
   of JSON, a POST with a body, a `302` the browser follows, a 404, and
   fifty requests in flight at once; the status and the content type of
   each reach the page as the table said them.
2. The same suite runs `look --serve` through the shell: the fake's
   runner starts the table's origin when the command names it and
   records the kill; the report's `server` section carries the
   command's output; the closing line names the command and the port;
   a command that exits at once, one that never listens, `--serve`
   with `--root`, and `--serve` on a cell with no container each end
   as the design says.
3. The rows origin renders the eyes suite's fixture exactly as it did
   before the origin was an interface: the eyes suite passes unchanged.

Acceptance criteria:

- Every proof runs in workerd through `@cloudflare/vitest-pool-workers`;
  the fake speaks the protocol and nothing listens on a port.
- The agent's own suite (`packages/pen`) proves the `fetch` frame
  against a real port in Node, the host header rewritten, encoding
  dropped, a redirect not followed, and a port that is not listening
  answered with status `0`.
