# Station: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey steps it closes, and a
phase that claims a walk closes only when the walk was walked for real.
The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)) and
collar's ([../collar/phases.md](../collar/phases.md)): the cell's proofs
run in workerd, never in Node; pi is a dependency; findings are one
dated line of about forty words; `main` stays sources only and a phase's
proof runs in a ring, never from this checkout; steps marked **⚑
provision** create, change, or delete a cloud resource, spend money, or
need a login, and are asked out loud first. `/conduct station` is the
procedure. Phase citations name their project: `station phase 2`, never
a bare "phase 2".

**Two rules for this project.** Nothing on an account without
`CLOUDFLARE_API_TOKEN` in the environment, and every proof that deploys
also deletes: a ring that leaves a Worker behind has failed, whatever
else it printed. And there is one deployed home, the pen home; a phase
that finds itself deploying the containerless Worker to an account has
left the design.

---

**Where we are: station phase 0 PART-DONE; station phases 1 to 4 NOT STARTED. Next: the shepherd's Docker Hub token in the repository's secrets, which closes station phase 0's push and pull; then station phase 1, the deploy and the account ring.** Planned 7 Sep 2026, the evening collar closed, from a conversation with the shepherd; the shepherd's calls are in the journey's front matter. [Kennel](../kennel/phases.md) closed on 7 Sep 2026: the config station phase 1 writes is the kennel's, and the Worker's name is `mintName(kennelName(), taken, --name)` from `packages/cli/src/name.ts` with the config's `name` field; kennel's Open roster carries journey 3's walk, which station phase 1 is. Station phase 0 was built the same evening: the workflow builds the pen image and pushes it when `DOCKERHUB_TOKEN` is in the repository's secrets, the release stamps the Worker and names the image at its commit in the shipped config, `GET /home` carries `build`, `sheep home` prints both stamps and warns on skew, and the package ring showed them equal; only the push and the pull wait, on the token phase 0's Open finding names. Every phase after it waits on a person too: station phase 1 on the shepherd's Cloudflare token and the container minutes each walk spends; station phase 4 on the image being on the registry, and on Docker on this laptop, which is here. Nothing waits on work.

The order is dependency order. Phase 0 is the image on the registry
and the stamp on the home, because a deploy from the package needs an
image it did not build and a way to say which build it is. Phase 1 is
the deploy, the one path, and the account ring in its first form, since
every later proof runs in it. Phase 2 is two machines and a repository,
the journeys that make a station worth having. Phase 3 is upgrade and
delete, and the ring whole. Phase 4 is the local home with a container,
last, because it is the one phase that needs this laptop and not an
account.

**Deliberately open.** Postponed on purpose: named homes; a hosted home;
the GitHub App; a private registry if Docker Hub's limits bite; refusing
on stamp skew rather than warning.

---

## Phase 0: The image, and the stamp

**Closes:** journey 1's last criterion; the image half of journey 3's
last criterion.

**Work:** `.github/workflows/release.yml`: in the `release` job, before
`pnpm release`, build `packages/pen`'s image on the runner and push it
to `docker.io/dglazkov/sheep-pen:<commit>` with a Docker Hub token from
the repository's secrets; skip the push, and say so, when the secret is
absent, so a fork's CI still releases a package that cannot deploy.
`scripts/release.mjs`: the shipped `home/wrangler.jsonc`'s `pen`
environment names that image by the release's commit, and the
`containers[].name` is left for deploy to set per Worker. `scripts/
bundle.mjs`: `SHEEP_BUILD` defined into `home/worker.mjs`; `packages/cell/
src/index.ts`: `GET /home` reports `build`, `0.0.0-checkout` under
`wrangler dev` from the checkout. `sheep home` prints both stamps and
the one-line skew warning; `--json` carries both. The account ring is
not this phase.

**Not this phase:** No deploy from the package. No change to the
checkout's own deploys.

**Proof:** The workflow's run on the phase commit pushes the image and
`docker pull docker.io/dglazkov/sheep-pen:<commit>` succeeds here; the
release built by that run has an image line naming the same commit
(`git show origin/release:home/wrangler.jsonc`). In workerd, `GET
/home` carries `build` and a test holds its shape. The package ring
passes with `sheep home --json` showing both stamps equal. `pnpm test`
and `pnpm -r typecheck` exit 0. **⚑** a Docker Hub account and an
access token in the repository's secrets, once; the image is public and
free.

**Findings.**

- **2026-09-07 — The stamp rides wrangler's `--define` as a JSON string.** `scripts/bundle.mjs` passes `SHEEP_BUILD` to `wrangler deploy --dry-run`; esbuild substitutes inside `typeof`, so `homeBuild()`'s checkout test compiles to a constant in a release and stays a safe global check under `wrangler dev` and the workerd pool, which define nothing.
- **2026-09-07 — The shipped `pen` environment names `docker.io/dglazkov/sheep-pen:<commit>` and nothing of the checkout's build.** `shippedConfig` drops `image_build_context` and `containers[].name`; the environment's own `name` is still `sheep-pen`, so station phase 1's deploy passes `--name` for both. The checkout's config is untouched.
- **2026-09-07 — The package ring walked a stamped release: step 6 printed `build.home = build.cli = 1fc8d03 (2026-09-07T22:41:08Z)`.** Run here with `pnpm release --no-push --force` against `HEAD`, the ref reset after. The stopped-case prose is unchanged: the two build lines print only when `GET /home` answered with the token.
- **2026-09-07 — A local home's skew line says stop, not deploy.** A local home is the package's Worker from the moment it started, so an older home after `npm install -g` is fixed by `sheep home stop`; the station's line is the design's; unstamped sides are reported, never warned about.
- **2026-09-07 — The image builds for `linux/amd64` on this arm64 laptop under emulation, 403 MB.** The workflow builds it on every run and pushes only with `DOCKERHUB_TOKEN`, the token on stdin as `dglazkov`; without the secret it prints one line and the release goes on.
- **2026-09-07 — `pnpm release` is the conductor's to run.** Auto mode's classifier refused it to the subagent, with `--force` and without, because the script moves `refs/heads/release`; the subagent proved the pieces and the conductor ran the ring. Cost: 22 minutes of a subagent, 25 of verification.
- **2026-09-07 — Open: the push and the pull.** `docker pull docker.io/dglazkov/sheep-pen:<commit>` and a workflow-built release's image line wait on the shepherd: a Docker Hub account, a Read & Write access token, `gh secret set DOCKERHUB_TOKEN`; free.

**Status: PART-DONE.** 2026-09-07. Everything but the push built and proved here: the stamped Worker, the shipped config's image line, `GET /home`'s `build`, `sheep home`'s two stamps, and the package ring showing them equal; the workflow's push and the pull from the registry wait on the token the Open finding names.

## Phase 1: The deploy, and the account ring

**Closes:** journey 1 in full; journey 5 step 1 for journey 1's steps
and step 2's deletion.

**Work:** `packages/cli/src/deploy.ts`: `sheep home deploy [--name]
[--subdomain] [--json]` as the design's five steps: the refusal with the
price and the permissions when either variable is absent; the account
and plan check through the API; the subdomain registered when absent;
`wrangler deploy --env pen` over the package's config with the Worker's
name and the container application named the same; the three secrets
through stdin; the config written without the `local` marker; the
report. The name is kennel's: `mintName` over the kennel's directory
name and the account's Workers and container applications, or `--name`
at the first deploy, recorded in the kennel's config and read from it
after; a different `--name` later is refused. Run again, a redeploy
that keeps secrets. `scripts/hermetic.mjs --ring account`: the price and the yes, the fresh world, the install,
`sheep home deploy --name sheep-hermetic-<sha>`, journey 1 steps 3 and
4 with the faux provider set as a var, `sheep home delete` with the
name on stdin, and the account listed afterwards; a failure after the
deploy deletes first. `sheep home delete` in its first form, enough for
the ring.

**Not this phase:** No join, no repository walk, no local container.

**Proof:** `pnpm hermetic --ring account <ref>` exits 0 on the
shepherd's account: the deploy under three minutes, the address
answering `sheep`, `sheep new` answering from the faux provider in a
container whose shell names `git`, the secrets in no argument, the
Worker and its container application gone afterwards and the account's
listing saying so. With the token unset, `sheep home deploy` exits 2
having made nothing, and the ring asserts the listing before and after.
Then the walk: the shepherd's own station, `sheep home deploy` with a
real key, journey 1 steps 1 to 4 with a real model. **⚑** the
shepherd's Cloudflare token in the environment; each ring run spends
container minutes, cents; the walk's station stays.

**Status: NOT STARTED.**

## Phase 2: Two machines, and a repository

**Closes:** journeys 2 and 3 in full; journey 5 step 1's join and
repository.

**Work:** `sheep home join <address>` with the token on stdin, the two
refusals, the config written. The account ring gains a second machine:
the machine ring's image, `sheep home join` piped, `sheep ls` and a
promptless `sheep attach` from inside it, and lamb's journey 2 shape
with the first machine's turn left running. Journey 3 in the ring:
pasture's journey 1 commands against `dglazkov/lamb-playground` with the
shepherd's fine-grained token piped into the pasture's secret, two
branches pushed, the token absent from every place pasture's criterion
names; the image digest the container ran, from `GET /home` or the
container's own report, printed.

**Not this phase:** No upgrade, no local container.

**Proof:** `pnpm hermetic --ring account <ref>` exits 0 with journeys 1,
2, and 3 walked and the station deleted. Then the walk: the second
machine a real one or the machine ring's container at the shepherd's
choice, `sheep attach` there on a sheep the first minted, a turn
finished after the first terminal was closed. **⚑** the fine-grained
token for the scratch repository; container minutes.

**Status: NOT STARTED.**

## Phase 3: Upgrade, delete, and the ring whole

**Closes:** journey 4 in full; journey 5 in full.

**Work:** The redeploy proved as an upgrade: the ring deploys an older
release, mints a sheep and a pasture, redeploys the newer, and finds
both. `sheep home delete` whole: the listing of what goes and how many
sessions, the name typed at a terminal, the refusal without one, the
container application removed by name, the config cleared. The ring's
last lines: the account listed and the name absent. The skew warning
walked: the older home, the newer CLI, the line.

**Not this phase:** No local container.

**Proof:** `pnpm hermetic --ring account <ref>` exits 0 with journeys 1
to 4 walked; `sheep home delete </dev/null` exits 2 having deleted
nothing. Then the walk: the shepherd's station redeployed from the
newer package with its sessions intact, and, when the shepherd says so,
the checkout-deployed `sheep` and `sheep-pen` deleted. **⚑** that
deletion, asked by name; container minutes.

**Status: NOT STARTED.**

## Phase 4: The local home, whole

**Closes:** journey 6 in full.

**Work:** `sheep home local` detects Docker (`docker version`), and
with it starts the `pen` environment over the package's config with the
registry image, `PEN_CELL_ORIGIN` set to the address Docker reaches the
host by, `PEN_IDLE` short; without it, collar's home and the sentence.
`sheep home --json` says which. The guide and the README say what
Docker adds.

**Not this phase:** No deploy changes.

**Proof:** On this laptop, from a fresh prefix and `HOME` through the
package ring with a `--docker` flag: `sheep home local` reporting a
container, `sheep new -- "which tools?"` naming `git` and `node`,
pasture's journey 1 steps 1 to 5 against the scratch repository with
the shepherd's token, the container gone after the idle period. The
machine ring unchanged and green. **⚑** none beyond the token already
held; Docker on this laptop.

**Status: NOT STARTED.**
