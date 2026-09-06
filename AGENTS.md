# House rules

This repo is sheep: `sheep`, the command a coding agent runs to herd coding
agents. Two legs built it. The first is [project lamb](docs/projects/lamb/design.md):
pi, running in a cell. The second is [project pen](docs/projects/pen/design.md):
programs, running for a cell. [Project recast](docs/projects/recast/design.md)
gave the command its name. [Project pasture](docs/projects/pasture/design.md)
is the next: the place a dog puts what every sheep on a repository should
know. Setup and usage are in [README.md](README.md).
Read a project's `phases.md` for where its work stands and what the next
phase is; [docs/projects/README.md](docs/projects/README.md) lists them.
`/conduct <project>` is how a phase is run: briefed to a subagent, proved
by the conductor, recorded, committed whole.

- **Proofs run in workerd, never in Node.** `packages/cell` tests go
  through `@cloudflare/vitest-pool-workers`. A test that passes in Node
  proves that Node works.
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
pnpm test          # every package's suite; the cell's runs in workerd
cp packages/cell/.dev.vars.example packages/cell/.dev.vars   # then fill in SHEEP_TOKEN and SHEEP_ANTHROPIC_API_KEY
pnpm --filter @sheep/cell dev        # a local home on :8787 (wrangler), reading .dev.vars
SHEEP_HOME=http://127.0.0.1:8787 SHEEP_TOKEN=... node packages/cli/bin/sheep.js new -- "hello"
pnpm run deploy        # wrangler deploy (bare `pnpm deploy` is pnpm's own command and shadows the script)
```
