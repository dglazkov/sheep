# House rules

This repo is sheep; its first leg is [project lamb](docs/projects/lamb/design.md):
pi, running in a cell. Setup and usage are in [README.md](README.md). Read
`docs/projects/lamb/phases.md` for where the work stands and what the next
phase is.

- **Proofs run in workerd, never in Node.** `packages/cell` tests go
  through `@cloudflare/vitest-pool-workers`. A test that passes in Node
  proves that Node works.
- **Pi is a dependency, never a copy.** `vendor/pi` is a submodule tracking
  the `sheep` branch of `github.com/dglazkov/pi`, which is upstream pi plus
  a few small commits; `git log upstream/main..sheep` in it is the whole
  difference. A change lamb needs in pi is one commit on that branch, named
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
cp packages/cell/.dev.vars.example packages/cell/.dev.vars   # then fill in LAMB_TOKEN and LAMB_ANTHROPIC_API_KEY
pnpm --filter @lamb/cell dev        # a local home on :8787 (wrangler), reading .dev.vars
pnpm --filter @lamb/cell dev:celld  # the same on a local celld node on :9876 (curl -fsSL https://celld.dev/install.sh | sh)
LAMB_HOME=http://127.0.0.1:8787 LAMB_TOKEN=... node packages/lamb/bin/lamb.js new -- "hello"
pnpm deploy        # wrangler deploy, needs CLOUDFLARE_API_TOKEN
pnpm deploy:celld  # celld deploy against a fleet
```
