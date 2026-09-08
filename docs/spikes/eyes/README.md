# Spike: eyes

**Question.** Sheep are to become decent frontend engineers. For that they
need eyes: a way to actuate Chromium and look at what they wrote. Does
Cloudflare Browser Run (the product formerly named Browser Rendering)
fit the cell?

**Answer, 8 Sep 2026: yes.** A Worker with a `browser` binding renders a
sheep's workspace straight from memory, with no server behind it, and
hands back a PNG, the console, the page errors, the requests, and the
accessibility tree. It runs in `wrangler dev` on a Chrome the tool
downloads, in `vitest-pool-workers` under workerd (the house rule holds),
and on the account. The picture reaches the model through the `read` tool
the cell already has. A warm look is about two and a half seconds
deployed; a cold browser is three to ten.

## What was tried

The Worker in this directory, deployed as `sheep-eyes-spike` and deleted
the same afternoon. `src/workspace.ts` is a fake workspace, four files a
sheep might write: a page with a stylesheet, a module that fetches its
own JSON and then calls an undefined function. `src/look.ts` is the eyes:

1. `puppeteer.launch(env.BROWSER)`, or `connect` to a session kept alive.
2. `page.setRequestInterception(true)` and a handler that answers every
   request to `http://sheep.invalid/…` from the workspace map, 404s what
   is not there, and aborts every other origin. Nothing listens anywhere.
3. `page.goto` to the page, `networkidle0`; optional clicks.
4. `page.screenshot`, `page.accessibility.snapshot`, and the console,
   `pageerror`, and request lists gathered along the way.

`look.png` is the deployed result. `test/look.test.ts` is the same look
in workerd, asserting the bug is seen.

Also tried: the REST quick action, `POST …/browser-rendering/screenshot`
with inline `html`, using the account token already in
`packages/cell/.env`. It works (an 800×400 PNG in 2.5 s, 583 ms of browser
time by its own header) but takes HTML or a URL, not a workspace, so it
is the wrong shape for a sheep.

## Numbers

Wall time of one look, 800×600, the fake workspace, one click.

| Where | Launch or connect | `goto` | Whole look |
| --- | --- | --- | --- |
| `wrangler dev`, first look (Chrome starting) | 7.0 s | 0.7 s | 8.1 s |
| `wrangler dev`, after | 0.24 s | 0.7–0.9 s | 1.2–1.3 s |
| Deployed, fresh launch | 3.1–10.5 s | 1.6–2.3 s | 8–13 s |
| Deployed, connect to a kept session | 0.17–0.41 s | 1.6–2.2 s | 2.3–5.2 s |
| workerd test through vitest-pool-workers | | | 1.2 s |

Screenshot is 50–200 ms and the accessibility tree under 70 ms
everywhere. `goto` is the bulk of a warm look: `networkidle0` waits half
a second by definition, and each intercepted request is a devtools
round trip between the Worker and the browser, longer on the platform
than on a laptop.

## Findings

- **No server is needed.** Interception serves the workspace at a made-up
  origin; relative stylesheets, module scripts, and a `fetch` of the
  page's own JSON all resolve. This is the fit: a sheep's workspace is
  rows in a Durable Object, not a port, and the eyes read the rows.
- **The eyes see more than pixels.** The runtime `ReferenceError`, the
  `console.warn`, the 404 for `favicon.ico`, and an accessibility tree
  with the heading, the button, and the counter at `2` after two clicks,
  all came back as text. The tree is tiny and a few milliseconds; for
  "is the list rendered" it beats an image.
- **The picture reaches the model already.** The cell's `read` tool is
  pi's harness read (`vendor/pi/packages/agent/src/harness/tools/read.ts`),
  which sniffs PNG, JPEG, GIF, and WebP from the bytes it gets through
  `readBinaryFile` and returns an image block. A PNG written into the
  workspace and read by the sheep is an image in the model's context.
  Not yet walked with a live sheep.
- **Sessions can be kept and shared.** `launch` with `keep_alive` up to
  ten minutes, `sessions()` to list, `connect` to an idle one,
  `disconnect` to hand it back. The spike's fourth look connected in
  165 ms. `limits()` reported 200 concurrent sessions and 10 browser
  acquisitions in the window on this account.
- **Local development is real.** `wrangler dev` and the vitest pool both
  launch a Chrome from `~/.cache/puppeteer`, downloading one when none
  fits; the first look pays for the start.
  Quick actions (`env.BROWSER.quickAction`) need `--remote`; puppeteer
  does not.
- **Price.** Workers Paid includes 10 browser-hours and 10 concurrent
  browsers a month, then $0.09 an hour and $2 a browser. A kept session
  bills its idle minutes. Free is 10 minutes a day and 3 browsers,
  not a herd's worth.
- **The platform's Chrome has Linux fonts.** The deployed shot renders
  `system-ui` as DejaVu Sans; the laptop's as Helvetica. A sheep judging
  type sees Linux.
- **Rough edges.** An entry module that exports anything but the handler
  fails workerd (`Incorrect type for map entry`); the first `wrangler
  deploy` uploaded and then failed to enable the subdomain (error 10007),
  the second succeeded; miniflare's binding logs a `WebSocket send()
  after close()` on `browser.close()` in tests, harmless.

## What a project would build

- A `look` program in the sheep's shell, beside `pasture`: `look
  index.html [--click sel] [--out look.png]` renders a workspace path
  through interception, writes the PNG into the workspace, and prints
  the console, errors, and accessibility tree. The sheep then reads the
  PNG. This keeps the four tools and needs no image in a tool result.
- One browser per home, not per sheep: the cell asks the home for a page
  in a shared session, one browser context per sheep, kept alive ten
  minutes. The herd counts as one concurrent browser and pays the cold
  launch once.
- The container's dev server: interception can forward a request to the
  pen container over its port through the container binding, so `vite
  dev` in the pen would be visible too. Untested.
- The binding is `"browser": { "binding": "BROWSER" }` in
  `wrangler.jsonc`, per environment, not inherited; station's deploy
  path writes the config and must carry it.

## Running the spike

```sh
cd docs/spikes/eyes && npm install
npx vitest --run                 # the look in workerd
npx wrangler dev --port 8799     # then GET /look?click=%23inc, /shot.png, /limits, ?reuse=1
```

This directory is not in the pnpm workspace; it has its own `package.json`.
