# Eyes — the design

**8 September 2026.** Design. Nothing built. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.
The spike that settled the platform question is
[docs/spikes/eyes](../../spikes/eyes/README.md).

The thesis in one line: **a sheep can look at what it wrote, in a real
Chromium, without a server, and the picture and the page's own report
come back through the tools it already has.**

A sheep today is a writer with a shell: it writes HTML, CSS, and
modules into its workspace, builds and tests them in the container, and
never sees a pixel. It cannot tell an unstyled page from a styled one,
a runtime error from a working app, a list from an empty `<ul>`. A
frontend engineer's loop is write, look, fix; a sheep has two thirds of
it. Eyes are the third.

The eyes are Cloudflare Browser Run, the platform's own Chromium,
reached through a Worker binding with Cloudflare's puppeteer. The spike
proved the one thing that could have failed: a page whose files are
rows in a Durable Object, not files behind a port, renders whole. The
cell intercepts every request the browser makes to a made-up origin and
answers it from the workspace table. Nothing listens anywhere. The same
binding runs in `wrangler dev` on a Chrome the tool fetches, in the
vitest pool under workerd, and on the account, so the house rule about
proofs holds and the local home has eyes too.

The shepherd's calls, 8 Sep 2026: the sheep asks with a program in its
shell, not a fifth tool; one browser per cell, kept alive ten minutes,
the shared per-home browser a debt; the eyes read rows, and the
container's dev server is a later project; a fixed handful of flags for
interaction, a script the open door.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the eyes | the browser binding, `BROWSER`, and the cell's use of it | `packages/cell/src/eyes/`, bound in both environments of `wrangler.jsonc` |
| a look | one render of a workspace path: a PNG in the workspace and a report on stdout | the `look` program's one run |
| the report | what the page said while it rendered: errors, console, failed requests, and the accessibility tree, as text | the program's stdout, so the transcript keeps it |
| the origin | `http://sheep.invalid`, the address the workspace is mounted at inside the browser; no server answers it, interception does | the eyes |
| the root | the workspace directory mounted at `/` for one look; the workspace itself unless `--root` says otherwise | the program's flag |
| the session | the cell's browser on the platform, kept ten minutes past its last look, reconnected by id | one row in the cell |

## The program

`look` is a just-bash custom command in every sheep's shell, tier 0
the way `pasture` is: no row in the programs table, no change to its
paragraph. Its shape:

```
look <path> [--root <dir>] [--click <selector>]… [--fill <selector> <text>]…
     [--viewport <w>x<h>] [--full] [--out <file>]
```

`<path>` is a workspace file, relative to the working directory or
absolute under `/workspace`; a directory means its `index.html`. The
page is loaded at `http://sheep.invalid/<path relative to the root>`,
so relative stylesheets, module scripts, images, and a `fetch` of the
page's own JSON resolve to the rows beside it, and an absolute
`/assets/x.js` resolves from the root. `--root <dir>` mounts a
subdirectory at `/`, which is what a built site needs. The flags act in
the order given after the page is idle: `--click` clicks the first
element the selector matches, `--fill` types into it. `--viewport`
defaults to 1024×768; `--full` captures the whole scroll height. The
PNG goes to `--out`, default `look.png` in the working directory,
overwritten; the report goes to stdout.

The report is four short sections, in the order a sheep should read
them: `errors`, the page's uncaught exceptions and any request that
failed, 404 or aborted, one per line; `console`, each message with its
level; `tree`, puppeteer's accessibility snapshot indented one level per
depth, roles and names and values; and one closing line, `wrote
look.png 1024x768 in 2.3s`. Nothing is truncated but the tree, at two
hundred lines with a line saying so. A look that fails to render, a
missing path, a browser that could not be had, is a plain error line and
exit 1, the program's own `{stdout, stderr, exitCode}`, since just-bash
swallows thrown shapes.

The sheep then reads the PNG. The cell's `read` tool is pi's harness
read, which sniffs PNG bytes and returns an image block, so the picture
is in the model's context on the next turn with nothing added. Writing
the PNG into the workspace rather than returning it from the tool is
the call: the four tools stay four, the screenshot is a file the sheep
can keep, compare, or leave for the dog, and the transcript holds the
report as text the dog reads with `sheep log`.

## The eyes

`Eyes` is one class in the cell, given the binding and the files table.
`look(request)` does what the spike's `look` does: a page in the cell's
session, interception that answers the origin from the rows under the
root with the content type by extension, 404s what is not there, and
lets every other origin through to the network so a font from a CDN
renders and shows in the request list; the listeners for `console`,
`pageerror`, and failed requests; `goto` with `networkidle0` and a
fifteen-second timeout; the flags; `screenshot`; `accessibility
.snapshot`; the page closed. What comes back is the PNG bytes and the
report, and the program writes the one and prints the other.

The session is per cell, kept alive ten minutes, the platform's
maximum. The cell keeps the session id in a row; a look connects to it
with `puppeteer.connect`, launches with `keep_alive` when there is none
or the connect fails, and writes the new id. It disconnects after every
look, never closes: a browser is worth more warm than the ten idle
minutes cost, at nine cents an hour. The spike's numbers: a launch on
the platform is three to ten seconds, a connect under half a second, a
warm look about two and a half. The herd counts one browser per sheep
that looked in the last ten minutes, against ten included and two
dollars a month per browser beyond, averaged; a shared browser per home
with a context per sheep would make it one, and is open below.

The binding is `"browser": { "binding": "BROWSER" }` in
`packages/cell/wrangler.jsonc`, in the top level and in `env.pen`,
since a binding is not inherited into a named environment. `scripts/
bundle.mjs` copies the config into `home/wrangler.jsonc` and `sheep home
deploy` keeps the `pen` environment verbatim, so the station gets eyes
from the release with no change to station's path. `sheep home local`
runs the same config under wrangler, and wrangler's local browser is a
Chrome that miniflare puts in the wrangler cache the first time a look
is asked for, `~/Library/Caches/.wrangler/chrome` on macOS and
`~/.cache/.wrangler/chrome` on Linux, at a version miniflare pins; the
first look on a machine pays that download and start, and the home's
report says so.

## What the sheep is told

One paragraph in the system prompt, after the shell's line, when the
home has eyes: what `look` does, its flags, that the PNG is read with
the read tool, and that `dist` and `build` stay in the container by
pen's rule, so a build the sheep wants to see goes to a directory that
syncs, `vite build --outDir site` and then `look --root site
index.html`. A home without the binding, a station deployed before this
project, has no paragraph, and `look` there is just-bash's not-found
line annotated with one sentence, `this home has no eyes; a station
upgraded from this release has them`. `/home` reports `eyes: true` or
`false`, `sheep home` prints it beside the container, and the
`Home` the prompt is built from carries it.

## What this does not do, on purpose

- **The container's dev server.** `vite dev` in the pen is a port the
  eyes cannot see; interception could forward to it through the
  container binding. A later project, when a walk shows a build per
  look is too slow.
- **A shared browser per home.** One session, a context per sheep, one
  concurrent browser for the herd. Open until the browser line on the
  bill says so.
- **`--script`.** A puppeteer script the sheep writes, run against its
  page, for anything the flags cannot say. The door is named in the
  prompt as absent; the flags are what a paragraph can teach.
- **The dog's eyes.** No `sheep look`. The dog reads the report in
  `sheep log` and asks the sheep what it saw; a verb that fetches a
  workspace file to the dog's machine is its own small project.
- **Video, traces, PDFs.** Puppeteer has them; a sheep has not asked.
- **Blocking the network.** The browser fetches other origins as any
  browser would. A page that leans on a CDN renders as the shepherd
  would see it.
