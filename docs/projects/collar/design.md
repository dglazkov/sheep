# Collar — the design

**7 September 2026.** Design. Nothing built. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.

The thesis in one line: **a shepherd gives their dog the command with one
sentence, and the release that sentence installs was proved in an
environment as close to the dog's as this repo can make.**

Four projects built `sheep`, and every walk of it was walked from this
checkout by the dog that built it. Recast recorded why no other dog can
have it: every pi dependency of `@sheep/cli` is a `link:` into the
`vendor/pi` submodule, and attach mode spawns pi's client from `.ts`
source under that checkout. The command exists; it cannot be handed over.
This project is the collar, the thing the shepherd puts on the dog to
make it a working dog. It ships the command, gives the dog a home to use
it on that needs no account, teaches the dog how, and proves each release
by installing it the way a user would, somewhere this laptop's state
cannot reach.

The shape is isocan's, which the shepherd likes and which has run for
weeks: `main` is sources only; a `release` branch, built by CI from every
commit on `main`, is what installs come from; the install spec is
`github:dglazkov/sheep#release`, and nothing is on npm. The one thing
isocan lacks, and this project has from its first phase, is the hermetic
install: isocan's #47, an installer bug that left an empty directory and a
dangling binary, shipped because nothing ever installed the branch the
way a user did.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the release | the tree an install gets: two bundles, the Worker, the skill, a manifest | the `release` branch, regenerated from `main` |
| the install spec | `github:dglazkov/sheep#release` | `INSTALL_SPEC` in the CLI; the README; the skill |
| the build stamp | the `main` commit and time a release was built from | `sheep.commit` and `sheep.builtAt` in the manifest; `sheep --version` |
| the local home | a home in workerd on the dog's machine, no account behind it | `~/.sheep/local/`: state, secrets, the daemon's log and pid |
| the skill | the doorway an agent reads: install, `sheep --agent-help`, what needs a person | `SKILL.md` at the repo root and the release root; installed as `.agents/skills/sheep/` with a `.claude/skills/sheep` symlink |
| the guide | the words this build ships about itself | `sheep --agent-help`, a file beside the bundle |
| a ring | one hermetic environment the walk runs in | `scripts/hermetic.mjs --ring package\|machine\|dog` |
| the walk | journey 1 steps 1 to 4 and 6, with the faux provider | the one script every ring runs |

## What exists, exactly

- **The CLI is small and its pi imports are library imports.** Twelve
  hundred lines under `packages/cli/src`. In process it imports pi's
  client, chord's context, agent-core types, `INITIAL_SCHEMA_SQL` from
  the fork's sqlite backend, and five service modules under
  `pi-coding-agent/experimental/services/`, each a leaf over chord and
  the client. None of that reaches pi's `main.ts`.
- **Attach mode is a spawn.** `packages/cli/src/pi.ts` runs Node on pi's
  `src/experimental/cli.ts` with `source-resolver.ts` preloaded, over a
  Unix socket the CLI bridges to the cell's WebSocket. The resolver reads
  the fork's root `tsconfig.json` to map workspace packages to sources.
  That entry pulls the whole coding agent, and the published pi excludes
  `dist/experimental` from its tarball and no longer dispatches `client`
  at all, so the published `pi` cannot stand in.
- **The fork is needed on both sides.** Five commits on the `sheep`
  branch of `dglazkov/pi`: the experimental exports, the connection
  types, `OutputCapture`, chunked lookups, the runtime-neutral sqlite
  core, and `formatSkillsForPrompt` as a leaf. The CLI imports through
  two of them and the cell through all five. Upstream's npm packages
  are not a substitute, so the fork ships inside what is built, as
  recast's debt predicted.
- **pi bundles itself.** `scripts/build-coding-agent-bundle.mjs` in the
  fork is an esbuild build of the coding agent for Node: ESM, a
  `createRequire` banner, `PI_BUNDLED_NODE` defined, jiti loaded lazily,
  and a short list of packages kept external, with a check that nothing
  else leaked out: chord, `@silvia-odwyer/photon-node` (a wasm package),
  `jiti`, and the optional natives `bufferutil`, `utf-8-validate`,
  `supports-color`. `@mariozechner/clipboard` is an optional dependency
  the TUI falls back from. The bundle this project needs is that script's
  options with a different entry.
- **Wrangler can emit the Worker.** `wrangler deploy --dry-run --outdir`
  writes the bundled Worker without deploying, and a config with
  `no_bundle` deploys or serves it as is. The cell's four classes are
  exports of one entry; the top-level environment has no container and
  no loader, and is journey 6's home.
- **A local home already exists, as a test helper.**
  `packages/cli/test/local-home.ts` spawns `wrangler dev` on a free port
  with `--persist-to` a temp directory, `SHEEP_PROVIDER=faux`, and waits
  for `GET /` to answer `sheep`. Journey 5's test and pasture's drive
  `bin/sheep.js` as a child against it. The faux provider answers `ok`
  to everything unless a program is posted to `/faux`; that is how a
  walk runs without a key.
- **isocan's pieces.** `scripts/release.mjs`: a temporary index built
  from `HEAD` with plumbing, a manifest stripped of the keys pacote reads
  as "needs preparation" (`workspaces`, `prepare`, `build`, and the
  install scripts), a commit with two parents, `update-ref`, push, never
  a checkout. `onpath.ts`: `which` lies from inside an `_npx` cache
  directory, so the lookup skips directories that do not outlive the
  command. `installSkill`: one copy under `.agents/skills/<name>`, a
  relative symlink from `.claude/skills/<name>`, never over a real
  directory. `agent-guide.ts`: the skill is a doorway that says "run
  `--agent-help`", because a skill installed once rots while the binary
  is upgraded; the guide ships beside the binary.

## The release

The release is a tree, committed onto `release`, that npm's git installer
can install with nothing but Node:

```
package.json              name sheep, bin sheep, the dependencies below, engines node >=22.19, sheep.commit, sheep.builtAt; no scripts, no workspaces
bin/sheep.js              #!/usr/bin/env node; imports ../dist/sheep.mjs
dist/sheep.mjs            the CLI, pi's client and services inside it
dist/pi-client.mjs        pi's experimental cli, whole, for attach mode
dist/agent-guide.md       the guide, `sheep --agent-help`
home/worker.mjs           the cell, bundled for workerd
home/wrangler.jsonc       main worker.mjs, no_bundle, the bindings and migrations of packages/cell/wrangler.jsonc
SKILL.md                  the skill, at the root so `npx skills add dglazkov/sheep` finds it alone
README.md, LICENSE
```

Nothing of `packages/`, `vendor/`, `docs/`, or `.github/` ships. The
manifest's `dependencies` are exactly the packages pi's bundle keeps
external and the one the CLI adds, held as a literal in a test so a
leak is a red test and not a runtime `ERR_MODULE_NOT_FOUND` on a user's
laptop: `@silvia-odwyer/photon-node`, `jiti`, and as optional
dependencies `bufferutil`, `utf-8-validate`, `supports-color`,
`@mariozechner/clipboard`. Chord goes inside; its `bundler` subpath,
which depends on esbuild, is not imported by anything shipped, and the
test asserts `esbuild` is not in the tree.

**Why bundle, and not vendor or publish.** Vendoring the fork's built
packages under the release tree needs `node_modules` inside the tree,
which npm's pack drops, or a manifest that names them, which is
publishing. Publishing the fork's ten packages to npm under a scope is
ten packages to version for one consumer, and it puts the fork on npm
when the shepherd wants nothing there. The bundle is one file per
entry, built by the fork's own script with a different entry, and the
fork stays what it is: a submodule on `main`, and a thing that happened
at build time on `release`.

**The two bundles.** `dist/sheep.mjs` is esbuild over
`packages/cli/src/cli.ts` with pi's options: platform node, ESM, the
banner, the externals above. `dist/pi-client.mjs` is the same options
over the fork's `src/experimental/cli.ts`, which is what `pi.ts` spawns
today, from source; after this project `pi.ts` spawns the file beside
its own bundle, and `PI_EXPERIMENTAL=1` and the socket URL are as they
were. The `source-resolver` preload goes: it exists to map workspace
names to sources, and a bundle has no names to map. pi's theme JSON,
export template, and the wasm are files the coding agent reads relative
to its package; the bundle build copies what the client path reads
beside `dist/`, and the package ring is what finds the ones the
build missed.

**The Worker.** `home/worker.mjs` is `wrangler deploy --dry-run
--outdir home` over `packages/cell`, run at release time from the
checkout where the links resolve. `home/wrangler.jsonc` is the cell's
config with `main` pointed at the file and `no_bundle` set, and it
keeps the `pen` environment's bindings so the next project changes a
line, not a file. The local home serves the top level only.

**The manifest** is written from `HEAD`'s `package.json` the way isocan's
is, plus the build stamp under a `sheep` key: npm owns the top level and
a `commit` key would one day collide. `sheep --version` prints
`sheep <commit> (<date>)` from it, and `sheep 0.0.0-checkout` from a
checkout, where there is no stamp.

## The release script, and CI

`scripts/release.mjs` is isocan's with three changes. It builds the two
bundles and the Worker instead of a web app. It writes the tree into a
temporary index, commits it with two parents, and updates
`refs/heads/release`. And **before it pushes, it runs the package ring
against the ref it just made**, by `git+file://` from this repository,
and refuses to push a release the ring failed. `--no-push` stops before
the push and prints the ref; `--force` skips the clean-tree and
pushed-HEAD guards, never the ring. `pnpm release` is the script.

`.github/workflows/release.yml` runs on every push to `main`: submodule
init, pi's packages built, `pnpm install`, `pnpm test`, then the
release script, which pushes only after its ring holds. A second job,
after the push, installs from `github:dglazkov/sheep#release` on a bare
runner and runs the package ring's walk from there: the string a user
types, minutes after it changed. The branch is pushed and never
force-pushed, and two runs racing queue. The first push of the branch
and the first workflow are a ⚑ step: a generated branch on the public
repository, asked once.

## The local home

`sheep home local` gives the dog a home with no account behind it, in
the runtime the deployed home runs in, so that the first five minutes
need a laptop and a key and nothing else.

- **Where.** `~/.sheep/local/`: `state/` for wrangler's persistence,
  `.dev.vars` for the home's secrets, `home.json` for the daemon's pid,
  port, and build stamp, and `log`. `SHEEP_CONFIG` still points the CLI
  at another config file, and `SHEEP_LOCAL` at another directory, so a
  test and a ring make a fresh world with two variables.
- **Wrangler, fetched once.** wrangler and workerd are a hundred and
  sixty megabytes; `npx github:…` must not pull them to print a report.
  The release manifest does not depend on wrangler. `sheep home local`
  installs the pinned version into `~/.sheep/tools/` with `npm install`
  the first time and reuses it after; the pin is the version the Worker
  was built with, recorded in the manifest beside the stamp.
- **The daemon.** `wrangler dev --local --config <package>/home/wrangler.jsonc
  --persist-to ~/.sheep/local/state --port <free>`, detached, with the
  package's `home/` as its config and `~/.sheep/local/.dev.vars` as its
  secrets. Ready when `GET /` answers `sheep`. `sheep home local` when
  one is running reports it; `sheep home stop` sends it `SIGTERM`;
  `sheep home` reports which home the config names, and whether it
  answers.
- **Started on demand.** A command whose home is the local one and
  whose connection is refused starts the daemon, waits for it, and goes
  on; the CLI says so on stderr. This is isocan's rule, and it is what
  makes journey 1 step 6 one command.
- **The secrets file.** `SHEEP_TOKEN` is generated the first time and
  written to `.dev.vars`, mode 600, and into `~/.sheep/config` as the
  token. `SHEEP_ANTHROPIC_API_KEY` is copied from `ANTHROPIC_API_KEY` in
  the environment when it is there, and the report says held or not
  held, never the value. `--faux` writes `SHEEP_PROVIDER=faux` instead:
  the scripted model, for the rings and for a dog that wants to see the
  plumbing without spending. No secret is ever an argument.
- **The config.** `sheep home local` writes `~/.sheep/config` when there
  is none. When one names another home it leaves it, prints the local
  address, and says `--home` selects it for one command.

The local home is journey 6's home with no container. A container needs
Docker on the machine and is the pen environment; that stays a checkout
affair until the next project, and `sheep home local` says so if asked
for one.

## Setup, the skill, and the guide

`sheep setup` is one idempotent command from any directory, isocan's
shape:

1. **The CLI on PATH.** Run through `npx`, the process's own directory is
   an `_npx` cache that will not outlive the command, so `which` is not
   trusted; the lookup skips transient directories. Not on PATH: `npm
   install -g <spec>`, unless `--no-install`. On PATH from a checkout:
   left alone.
2. **The skill in this directory.** `.agents/skills/sheep/`, copied from
   the package, and a relative symlink at `.claude/skills/sheep`, never
   over a real directory. In a checkout of sheep itself: nothing, and
   the report says why.
3. **The home.** Reported, not made: none configured, the local home and
   whether it answers, or another address. Setup does not start a home;
   `sheep home local` is the next sentence, and the report prints it.
4. **The report**, in prose and with `--json`: each of the three, its
   state, and the next thing to run.

The skill sits at the repo root, not under `.claude/skills` beside `conduct` and `pi-bump`: those are the repo's own workflow, the shepherd's, and a dog must never receive them. The skills CLI stops at a root `SKILL.md` and lists only that one, descending into subdirectories only when asked with `--full-depth`, so the root is what keeps `npx skills add dglazkov/sheep` honest.

The skill, `SKILL.md` at the repo root, is short and does not rot:
what sheep is in two sentences, the install spec, `sheep setup`, then
"run `sheep --agent-help` and read it before anything else", and the
three things that need a person: a key, an account for a deployed home,
a hand at a terminal. The guide, `dist/agent-guide.md`, is the long
version and ships beside the bundle, so upgrading the CLI upgrades the
words. It says: a person does not run `sheep`, the dog does; the verbs
and what each prints; the home and how to get one; what to ask the
person for and how to ask.

## The rings

`scripts/hermetic.mjs --ring <ring> [ref]` proves a release the way a
user meets it. One walk, journey 1 steps 1 to 4 and 6 with `--faux`, and
one ring per environment. The ref defaults to `refs/heads/release` of
this repository.

- **package.** A fresh `npm_config_prefix`, `npm_config_cache`, `HOME`,
  `SHEEP_CONFIG`, and `SHEEP_LOCAL` under one temp directory. `npm
  install -g git+file://<this repo>#<ref>` through npm's git installer,
  which is where #47 lived, never a tarball. Then the walk with the
  installed `sheep` first on PATH. The ring asserts the five variables
  point inside its directory before the first step.
- **machine.** A container from `node:22-slim`, then `node:24-slim`,
  with the ref reachable as a bare repository at `/src.git` and nothing
  else mounted: no Docker socket, no git config, no pnpm, no wrangler.
  The package ring's script runs inside, so the two rings cannot drift.
  Docker on the machine is the one thing this ring needs, and a machine
  without it says so and skips, loudly.
- **dog.** The machine ring with a coding agent in it, Claude Code first,
  `npm install -g` at its current version, the person's key in the
  environment, the skill added with `npx skills add dglazkov/sheep`, and
  journey 1's sentence as the prompt in print mode. No steps are given.
  Afterwards the ring runs `sheep ls --json` and `sheep home --json`
  inside the container and asserts a sheep exists and the local home
  answers; the agent's transcript is the report. It spends the person's
  tokens and prints an estimate and waits for a yes, unless `--yes`.

Every ring prints one line per step, stops at the first failure with the
command and its output, and ends by naming what it did not check. The
release script runs the package ring; CI runs it twice; the machine and
dog rings are the conductor's, before a phase closes, and the shepherd's,
when a release matters.

## What this does not do, on purpose

- **A deployed home from the package.** `sheep home deploy`, the pen
  image on a registry Cloudflare pulls from, secrets by API token, a
  version stamp on `GET /home` and the CLI warning on skew. That is the
  next project; this one ships the Worker and keeps the pen bindings in
  the config so it starts from a line change.
- **A hosted home.** The Worker has one token and one key. Tenancy is a
  project, if ever.
- **`sheep upgrade`.** `npm install -g <spec>` again is the upgrade, and
  the guide says so. A verb for it, and a check for a newer release, is
  a small later project or a finding here.
- **Windows.** The daemon, the symlink, and the socket bridge are tested
  on macOS and Linux. Windows is a finding when a walk meets it.
- **A pen on the local home.** Above.
- **pi as the dog in the dog ring.** Claude Code first, because it is
  the dog that has walked every journey so far. A second dog is a flag
  on the ring, added when the first holds.
