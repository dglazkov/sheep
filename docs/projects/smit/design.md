# Smit — the design

**13 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **a station deployed from a checkout is marked
with the checkout's commit, a dirty marker, and the deploy's time, so
`sheep home` names what it runs and a redeploy is seen to move it; a
checkout with no commit is refused, so a station never answers
`unstamped`.**

## What issue #11 saw, and the choice

The shepherd's issue #11 is the one item from the walk under issue #8
that stile did not fix: a station deployed from a checkout reports `home
build: 0.0.0-checkout (unstamped)` and keeps saying it through every
redeploy, so the dog that wanted to know whether the station had the
`rm` verb had to mint a throwaway sheep and try. The issue offers two
fixes and asks for one: stamp the checkout deploy, or refuse it.

**Stamp.** Refusing is smaller, and the code's own comment already calls
a checkout deploy "not a supported path". But the path is used: the
shepherd's station `sheep-2` was deployed from a checkout and ran that
way for days, and it is how a change to the deploy or the cell is tried
on a real account before a release exists. Taking the path away would
push every such try through `main`, CI's release, and an install. The
account ring (`pnpm hermetic --ring account`) rightly walks the release
and only the release; the checkout deploy is the developer's shortcut,
and a shortcut that lies about what it deployed is worse than one that
says so. So the deploy marks the Worker, and the one case that cannot be
marked, a checkout with no commit, is the one that is refused.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the manifest's stamp | `readStamp()`: the release's commit, time, wrangler, image; undefined in a checkout | `local.ts` |
| the smit | a checkout's mark: `<commit>[-dirty]` and the deploy's time | `local.ts`, beside `readStamp` |
| the mark | what a deploy defines into the Worker and waits to see: the manifest's stamp under the release, the smit under a checkout | `deploy.ts` |
| the define | `SHEEP_BUILD`, a JSON string of `{ commit, builtAt }`, read by the Worker's `homeBuild()` | `scripts/bundle.mjs`, `packages/cell/src/index.ts` |
| the dirty marker | `-dirty` on the commit when `git status --porcelain` prints anything | the smit |

## The smit

`checkoutStamp(root, now)` runs two git commands in the checkout's root
(`checkoutRoot(packageDir)`, which `setup.ts` already has): `git
rev-parse HEAD`, cut to seven characters the way `scripts/release.mjs`
cuts the release's, and `git status --porcelain`, whose output being
non-empty appends `-dirty`. The time is the deploy's wall clock, ISO
seconds, the shape the manifest's `builtAt` has. Untracked files count
as dirty and ignored ones do not, which is git's own line: what would
not be in a commit made now is what makes the tree dirty; a checkout
whose `dist/` or `home/` differ is not dirty for it. A submodule at a
different commit is dirty too.

A root with no git, or a git that cannot answer, gives no smit, and the
deploy refuses before anything is done: exit 2, one sentence naming the
release install. Nothing on the account is touched: the refusal comes
before the join store and before wrangler.

## The deploy

`runDeploy` has two stamps where it had one. The manifest's stamp keeps
deciding what it decided: which base config is derived from
(`baseConfigPath`), which wrangler runs (`wranglerBin`). The mark is new:
the manifest's commit and time under the release, the smit under a
checkout. Under a checkout the mark goes to wrangler as `--define
SHEEP_BUILD:<json>`, the same argument and the same encoding
`scripts/bundle.mjs`'s `emitWorker` uses, so the Worker that wrangler
bundles from `packages/cell/src/index.ts` reads it through the same
`homeBuild()` and nothing in the cell changes. Under the release the
Worker is already built with the define inside it and no argument is
added; the release's deploy runs the commands it ran before.

The wait after the deploy (station phase 3) polls `GET /home` until the
home reports the mark, not until it reports the command's own build.
Those were the same object under the release and are still; under a
checkout they were never going to agree, which is why the wait was
skipped and the report said `not compared`. Now every deploy is marked,
so every deploy waits, and a redeploy of an unchanged dirty tree still
moves, because the time is the deploy's. The report carries the mark as
`build.deployed` beside `build.home` and `build.cli`, and the `stamp:`
line reads `moved (<n>s)` or `not moved after <n>s; the home still
reports …`, as it does for the release. The `cli build:` line is still
the command's own: `0.0.0-checkout (unstamped)` in a checkout, which is
true.

`sheep home`, the status command, changes nothing: it prints what
`GET /home` says, which is now the smit. The skew line's rule holds: a
side with no time is reported and not warned about, and two times are
compared. A release command's `sheep home` against a checkout station
therefore warns, with the times, the way it warns between two releases.
(Shear phase 0 since: two sides of one commit with no `-dirty` are not
skew, whatever their times.)

## What does not change

- **The cell, the bundle, and the release.** `homeBuild()` parses the
  same define; `scripts/bundle.mjs` and `scripts/release.mjs` are not
  touched; the account ring walks the release as before.
- **The derived config.** A checkout's station is still built from the
  checkout's Dockerfile through wrangler, with Docker on the machine;
  `SHEEP_IMAGE` is not defined for it and `GET /home` keeps `image:
  null`, since there is no registry reference to name.
- **`sheep --version` and the command's own line.** A checkout's command
  is `0.0.0-checkout`; git says what its tree is, not what its `bin`
  runs.

## What this does not do, on purpose

- **Mark the local home.** `sheep home local` in a checkout is `wrangler
  dev` over `packages/cell`, which reloads on every save; a commit
  stamped at start would be wrong within the minute. It stays
  `0.0.0-checkout`, and it is the developer's rig, on their own machine.
- **Name the checkout command's commit in `sheep home`.** The `cli
  build:` line from a checkout could carry the same smit, and a skew
  line could then compare a checkout command to its own station. That
  is a second git spawn on every `sheep home` and a change to the
  version line's meaning; a later project, if a walk wants it.
- **Refuse a dirty deploy.** The marker says it; the shepherd decides.
- **Supported does not mean walked by a ring.** The checkout deploy is
  walked by hand from a scratch kennel; the account ring's estimate,
  steps, and delete are the release's. A ring for the checkout deploy
  would need a Docker on the runner and a build of the pen image per
  run.
