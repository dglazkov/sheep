# House rules

This repo is sheep: `sheep`, the command a coding agent runs to herd coding
agents. Two legs built it. The first is [project lamb](docs/projects/lamb/design.md):
pi, running in a cell. The second is [project pen](docs/projects/pen/design.md):
programs, running for a cell. [Project recast](docs/projects/recast/design.md)
gave the command its name. [Project pasture](docs/projects/pasture/design.md)
gave the herd a place: what every sheep on a repository should know.
[Project collar](docs/projects/collar/design.md) gave the dog the
command, and a release proved by installing it the way a user would.
[Project kennel](docs/projects/kennel/design.md) gave the dog a
directory, found the way git finds `.git`, so dogs in several
directories share nothing but the command. [Project station](docs/projects/station/design.md)
gave the dog a home in the cloud, `sheep home deploy` from the package in
one path, and the local home a container when Docker answers. [Project eyes](docs/projects/eyes/design.md) gave a sheep eyes: `look
<path>` in its shell renders what it wrote through the platform's
Chromium, prints the page's report, and leaves the picture for `read`.
[Project serve](docs/projects/serve/design.md) joined the eyes to the
container: `look --serve '<command>'` runs a dev server for the length of
one look and stops it, the page reached over two frames on the socket the
container already opened, so nothing connects into the container.
[Project end](docs/projects/end/design.md) gives the dog the other half
of minting: `sheep rm <id>` ends a sheep and releases everything it
held, the pasture excepted. [Project mint](docs/projects/mint/design.md)
makes minting and prompting two acts: `sheep new --detach` with no
prompt mints a sheep and prints its id, and nothing else happens until
something is asked of it. [Project earmark](docs/projects/earmark/design.md)
gave one sheep a secret of its own: `sheep new --secret <NAME>`, the
value on stdin, laid over its pasture's by name and ended with it.
[Project fold](docs/projects/fold/design.md) keeps what outlives the
container: a sheep's `~` as rows beside its workspace, and a pasture's
`/cache`, put back before setup and kept after it.
[Project spool](docs/projects/spool/design.md) makes the agent pass a
file rather than hold one: the record is read and written in slices, so
a cache whose largest file is hundreds of megabytes costs a chunk of
memory and not a file's worth.
Setup and usage are in [README.md](README.md).
Read a project's `phases.md` for where its work stands and what the next
phase is; [docs/projects/README.md](docs/projects/README.md) lists them.
`/conduct <project>` is how a phase is run: briefed to a subagent, proved
by the conductor, recorded, committed whole.

- **Proofs run in workerd, never in Node.** `packages/cell` tests go
  through `@cloudflare/vitest-pool-workers`. A test that passes in Node
  proves that Node works.
- **Every test is in a ring, and the ring says what it needs.** Inside
  this checkout: `checkout` runs in this process, `command` spawns the
  built command against fakes, `home` starts a real `wrangler dev`.
  Outward from it, `hermetic.mjs`'s four: `package`, `machine`, `dog`,
  `account`. `pnpm test` runs the inner three, which is what a phase's
  proof means; `pnpm test --ring <name>` runs one, and `--list` shows
  them. Membership is written down in `scripts/rings.mjs` and a guard
  (`packages/cli/test/rings.test.ts`) fails when a file's ring and what
  the file actually does disagree. A new test file goes in a ring.
- **CI does not run the home ring; you do.** The workflow runs `pnpm test
  --ci`, the checkout and command rings. The home ring starts a real
  `wrangler dev` per file, which on a shared runner is the least steady
  thing here, and a walk that flakes teaches a reader to ignore red. So a
  green CI says nothing about it. Run `pnpm test` in your checkout, which
  includes it, before you call a phase proved; a run that leaves a ring
  out names what it skipped at the end, and that line is part of the
  result you report.
- **Pi is a dependency, never a copy.** `vendor/pi` is a submodule tracking
  the `sheep` branch of `github.com/dglazkov/pi`, which is upstream pi plus
  a few small commits; `git log upstream/main..sheep` in it is the whole
  difference. A change sheep needs in pi is one commit on that branch, named
  in phases.md. Never copy a pi file into `packages/`. `/pi-bump` checks,
  rebases, and verifies.
- **Nothing in the cloud without a token the user provided.** Steps marked
  ⚑ provision in phases.md are asked out loud first.
- **Findings are one dated line, one claim, about forty words.** The
  argument goes in the commit message.

```
git submodule update --init
(cd vendor/pi && npm ci --ignore-scripts && for p in chord tui telemetry ai agent session-backends/sqlite-node protocol client server coding-agent; do (cd packages/$p && npm run build); done)
pnpm install
pnpm test          # the inner rings: checkout, command, home
pnpm test --list   # what is in each ring
pnpm test --ring checkout   # this process alone; the inner loop
cp packages/cell/.dev.vars.example packages/cell/.dev.vars   # then fill in SHEEP_TOKEN and SHEEP_ANTHROPIC_API_KEY
pnpm --filter @sheep/cell dev        # a local home on :8787 (wrangler), reading .dev.vars
SHEEP_HOME=http://127.0.0.1:8787 SHEEP_TOKEN=... node packages/cli/bin/sheep.js new -- "hello"
pnpm run deploy        # wrangler deploy (bare `pnpm deploy` is pnpm's own command and shadows the script)
```
