# House rules

This repo is [project lamb](docs/projects/lamb/design.md): pi, running in a
cell. Read `docs/projects/lamb/phases.md` for where the work stands and
what the next phase is.

- **Proofs run in workerd, never in Node.** `packages/cell` tests go
  through `@cloudflare/vitest-pool-workers`. A test that passes in Node
  proves that Node works.
- **Pi is a dependency, never a fork.** `vendor/pi` is a pinned submodule;
  a change lamb needs in pi is a `.patch` in `vendor/patches`, named in
  phases.md with its upstream status. Never copy a pi file into `packages/`.
- **Nothing in the cloud without a token the user provided.** Steps marked
  ⚑ provision in phases.md are asked out loud first.
- **Findings are one dated line, one claim, about forty words.** The
  argument goes in the commit message.

```
git submodule update --init && pnpm install && pnpm patches:apply
pnpm test          # every package's suite; the cell's runs in workerd
pnpm deploy        # wrangler deploy, needs CLOUDFLARE_API_TOKEN
pnpm deploy:celld  # celld deploy against a fleet
```
