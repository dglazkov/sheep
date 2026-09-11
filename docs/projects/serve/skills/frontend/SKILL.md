---
name: frontend
description: Build and check a frontend app in this workspace — scaffold with Vite, look at the running dev server with `look --serve`, look at a built site with `look --root`, and test between looks. Use when asked for a web page, a web app, a component, or anything a browser renders.
---

# Frontend apps here

You have eyes and a container. The loop is write, look, fix, and the
look is one line.

## Scaffold

```sh
npm create vite@latest app -- --template vanilla-ts
cd app && npm install
```

Any template works. `node_modules`, `dist`, and `build` stay in the
container and never come back to the workspace, which is what you want.

That cuts both ways: because `node_modules` never syncs, a container you
have not installed into does not have it, and on a home whose containers
the platform can replace you may meet a fresh one. If a served look comes
back `the server exited 127 before answering` with `vite: not found`
under it, the install is what is missing — put it on the look's own line,
`look --serve 'npm --prefix app install && npm --prefix app run dev --
--port $PORT --strictPort' /`, so it happens in the same container that
runs the server.

Every bash line of yours starts in the workspace root: a `cd` holds for
that line and no longer, so keep it on the line that needs it. The
examples below are written from the root, with the app in `app/`.

## Look at the dev server

```sh
cd app && look --serve 'npx vite --port $PORT --strictPort' /
```

This starts Vite in the container with `PORT` set, waits for it to
answer, renders `/` from it in a real browser, writes `look.png`, prints
the report, and stops Vite. Read `look.png` with the read tool to see
the page. The report's `server` section is Vite's own output: a compile
error is there. A `[vite] failed to connect to websocket` line in
`console` is expected on a served page and is not a bug.

The closing line carries two numbers off one clock:

```
wrote look.png 1024x768 in 2.5s, served by `npx vite --port $PORT --strictPort` on 5173, ready in 1.3s
```

`in` is the whole served look and the `ready in` wait is a part of it,
so the two numbers tell a slow server from a slow page.

Every served look starts the server fresh, so an edit you made is what
the next look shows. Add `--click` and `--fill` as on any look; `--port
<n>` when the server must listen elsewhere; a path other than `/` to
see another route. `--root` does not combine with `--serve`.

## Look at a built site

```sh
cd app && npx vite build --outDir site
cd app && look --root site index.html
```

`site` syncs back to the workspace, so the built page is looked at from
the files. Do this before you report a build is good, and say whether
the built page is the one the dev server showed.

## Test between looks

```sh
cd app && npx vitest run
```

Tests run on the same lane as the server, one at a time, which is why
the server is not kept running.

## Never

Do not put a server in the background: `vite dev &` hangs your line
until its timeout and is killed with it. `look --serve` is the only way
a server runs here.
