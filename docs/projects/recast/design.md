# Recast — the design

The command the sheepdog runs is the product. Lamb was the leg that built
it, and the command took the leg's name because on 5 Sep 2026 there was
nothing else to name it after. Now there are two legs behind it and the
work ahead is the command itself: what a dog can ask of a flock, how it
waits, how it reads results. A repo whose README says "run `lamb`" to a
dog that came for `sheep` starts every session with a translation. This
project removes the translation. It is small on purpose, it changes no
behaviour, and it closes.

[journey.md](journey.md) is what it is like when it is done;
[phases.md](phases.md) is the walk.

## The names

The word "sheep" ends up meaning three things: the repo, a session in a
cell, and the command. That overload is a feature. `sheep new --name docs`
mints a sheep; `sheep ls` lists the flock; `sheep wait` waits on sheep.
The command is named for what it handles, the way `git` is.

| Was | Is | Where |
| --- | --- | --- |
| `packages/lamb`, `@lamb/lamb`, `bin/lamb.js` | `packages/cli`, `@sheep/cli`, `bin/sheep.js` | the dog's command |
| `@lamb/cell`, `@lamb/pen` | `@sheep/cell`, `@sheep/pen` | the package scope |
| `lamb <verb>`, `lamb:` on stderr, `lamb <version>` | `sheep <verb>`, `sheep:`, `sheep <version>` | the CLI's face |
| `~/.lamb/config`, `LAMB_HOME`, `LAMB_TOKEN`, `LAMB_CONFIG` | `~/.sheep/config`, `SHEEP_HOME`, `SHEEP_TOKEN`, `SHEEP_CONFIG` | the dog's configuration |
| `LAMB_TOKEN`, `LAMB_ANTHROPIC_API_KEY`, `LAMB_MODEL`, `LAMB_PROVIDER`, `LAMB_ALLOW_ANONYMOUS`, `LAMB_TEST_PORT` | the same with `SHEEP_` | the cell's secrets and vars |
| `LAMB=1` in a container's environment | `SHEEP=1` | what a program in a sheep's container sees |
| Workers `lamb` and `lamb-pen` | `sheep` and `sheep-pen` | the homes on Cloudflare |
| the container application `pen` | `sheep-pen` | Cloudflare's name for the container fleet beside a Worker; account-wide, and bound to one Durable Object namespace, so a new Worker needs a new one (found in recast phase 1) |
| `GET /` answers `lamb` | answers `sheep` | the home's door |
| `/tmp/lamb/sessions.sqlite`, author `lamb <lamb@example.invalid>` | `/tmp/sheep/…`, `sheep <sheep@example.invalid>` | paths and defaults inside the cell |

Not renamed, and why:

- **Pen.** `PEN_*`, the `pen` wrangler environment, the `pen` image,
  `packages/pen`, `pen-agent`, `git-credential-pen`. (The container
  *application* on Cloudflare is the one exception, above: its name is
  account-wide and bound to the old Worker's namespace, so the new Worker
  gets `sheep-pen`, the Worker's own name.) Pen is the name of
  a leg and of the thing that leg built, a rented container beside a
  cell. The shepherd has called the name a placeholder; renaming it is a
  decision, not a consequence of this one, and it waits.
- **The Durable Object classes.** `SessionCell`, `Directory`,
  `PenContainer`. Class names are migration tags on Cloudflare; a rename
  is a migration, for no gain.
- **The pi fork.** `vendor/pi` tracks the `sheep` branch of
  `dglazkov/pi` already, and none of its commits say lamb.
- **History.** Every finding, commit message, and quoted command under
  `docs/projects/lamb/` and `docs/projects/pen/` stays as written. A
  citation of the form `lamb phase 5`, in a doc or a code comment, names
  a leg and stays. A comment that says "lamb's shell, byte for byte"
  about the shell a home with no container has is rewritten to say that,
  because lamb is no longer the name of a home.

## The home is redeployed, not renamed

A Worker's name is its identity. `wrangler deploy` with `"name": "sheep"`
creates a new Worker with new Durable Object namespaces, empty. Nothing
moves from `lamb` to `sheep`: every session on the old homes is a walk's
scratch, and the export path exists for anyone who wants a file. The
new homes get their secrets from the same `.dev.vars` under the new
names; `PEN_CELL_ORIGIN` becomes the new origin. The old Workers are
deleted with `wrangler delete` when the shepherd says so, and only then;
deletion is asked, like provisioning, because it is not undone.

This costs nothing new. The account is already on the Workers Paid plan
for pen's container; two Workers cost the same as two other Workers.

## The dog's own configuration moves

`~/.lamb/config` becomes `~/.sheep/config`, the same JSON with the new
home. The old file is left where it is until the old home is deleted;
after that it points at nothing and can go. `SHEEP_CONFIG` still
overrides the path, as `LAMB_CONFIG` did, so a test can point the binary
at a scratch file.

## The legs are frozen

Lamb and pen are done. Their docs stay as the record of how the command
came to be, and a line at the top of each primary doc says so: frozen on
a date, `lamb` here is `sheep` now, read on for the mechanism as it was
built. Their `journey.md` front matter moves to `done` where a walk was
walked and stays honest where one was not: lamb's journey 1 still wants
a second machine and a night, and that debt moves to this project's Open
roster rather than being forgotten with the freeze.

## A project is short

The projects index gains a rule the shepherd stated on 6 Sep 2026: a
project holds one body of work with an end. If a project is long-lived,
the grain was wrong; it should have been several projects, each with a
journey that can be walked and a last phase that closes. This project is
the smallest example. The work on the command continues as more short
projects, each named for what it adds, not as an open-ended `sheep`
project.

## What this does not do, on purpose

- **Publishing.** `@sheep/cli` is the workspace name. It cannot be
  published as it is built: every pi dependency is a `link:` into the
  `vendor/pi` submodule, and attach mode spawns pi's client from `.ts`
  source under that checkout. Publishing means deciding how the fork
  ships (bundled into the CLI, vendored, or published from the fork),
  and that is a project of its own. This one records the debt as an Open
  finding so the roster carries it.
- **The verbs.** `new`, `attach`, `ls`, `status`, `wait`, `abort`,
  `log`, `export`, `config` are lamb journey 5's and stay. A better
  surface is the next project's journey, written for the dog.
- **Pen's name**, above.
