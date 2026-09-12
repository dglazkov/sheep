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

**Where we are: station phases 0 to 4 CLOSED; the project is done. Next: nothing here.** Planned 7 Sep 2026, the evening collar closed, from a conversation with the shepherd; the shepherd's calls are in the journey's front matter. [Kennel](../kennel/phases.md) closed on 7 Sep 2026: the config station phase 1 writes is the kennel's, and the Worker's name is `mintName(kennelName(), taken, --name)` from `packages/cli/src/name.ts` with the config's `name` field; kennel's Open roster carries journey 3's walk, which station phase 1 is. Station phase 0 closed the same evening: the workflow builds the pen image and pushes it to `docker.io/dglazkov2/sheep-pen:<commit>` with the shepherd's Docker Hub token in the repository's secrets, the release stamps the Worker and names that image in the shipped config, `GET /home` carries `build`, `sheep home` prints both stamps and warns on skew, the package ring shows them equal, and the image of the release built from 2b71e46 was pulled here by tag. Station phase 1 closed the same night: `sheep home deploy` and `sheep home delete` from the package, the account ring green on the shepherd's account with the shepherd's token from the checkout's `packages/cell/.env`, and journey 1 walked on the shepherd's own station, `sheep-2`, with a real model. Station phase 2 was built the same night: `sheep home join`, the second machine as a container in the account ring, journey 2 walked in the ring and on `sheep-2` with a real model, and journey 3 built into the ring, where it is skipped until `LAMB_PLAYGROUND_TOKEN`, a fine-grained token for `dglazkov/lamb-playground`, is in the environment; the design now names the image by digest when the release knows it, and the first release built by digest is phase 2's own commit's. Station phase 3 the same night: the delete whole, with its listing; the ring deploying the release before, minting on it, upgrading to the newer with the skew line printed and every row kept, and deleting with the listing read; `sheep-2` upgraded the same way with its sessions intact. Late that night the shepherd put the fine-grained token in the checkout and said the word: the account ring walked journey 3 and the whole of journey 5, nineteen lines, and the checkout's `sheep` and `sheep-pen` were deleted by name, so the account holds `sheep-2` alone of sheep's. Station phase 4 closed the same night: the local home rents a container from the registry image when Docker answers, through a one-line Dockerfile since wrangler's local dev will not pull a registry image without a login, and the package ring with `--docker` walked journey 6 on this laptop, a sheep pushing to the scratch repository from the local container; without Docker it is collar's home with the sentence, walked in the machine ring's image. Journeys 1 to 6 walked; nothing waits on a person or on work.

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
to `docker.io/dglazkov2/sheep-pen:<commit>` with a Docker Hub token from
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
`docker pull docker.io/dglazkov2/sheep-pen:<commit>` succeeds here; the
release built by that run has an image line naming the same commit
(`git show origin/release:home/wrangler.jsonc`). In workerd, `GET
/home` carries `build` and a test holds its shape. The package ring
passes with `sheep home --json` showing both stamps equal. `pnpm test`
and `pnpm -r typecheck` exit 0. **⚑** a Docker Hub account and an
access token in the repository's secrets, once; the image is public and
free.

**Findings.**

- **2026-09-07 — The stamp rides wrangler's `--define` as a JSON string.** esbuild substitutes inside `typeof`, so `homeBuild()`'s checkout test compiles to a constant in a release and stays a safe global check under `wrangler dev` and the workerd pool, which define nothing.
- **2026-09-07 — The shipped `pen` environment names `docker.io/dglazkov2/sheep-pen:<commit>` and nothing of the checkout's build.** `image_build_context` and `containers[].name` are dropped; the environment's own `name` is still `sheep-pen`, so station phase 1's deploy passes `--name` for both.
- **2026-09-07 — The package ring walked a stamped release: step 6 printed `build.home = build.cli = 1fc8d03 (2026-09-07T22:41:08Z)`.** The stopped-case prose is unchanged: the two build lines print only when `GET /home` answered with the token.
- **2026-09-07 — A local home's skew line says stop, not deploy.** A local home is the package's Worker from the moment it started, so `sheep home stop` is its fix after `npm install -g`; the station's line is the design's; unstamped sides are reported, never warned about.
- **2026-09-07 — Without the secret the workflow said `did not push it` and stayed green,** the release naming an image it had not pushed and the install job's ring showing the stamps equal on the runner. Here the image builds for `linux/amd64` under emulation, 403 MB.
- **2026-09-07 — `pnpm release` is the conductor's to run.** Auto mode's classifier refused it to the subagent, with `--force` and without, since the script moves `refs/heads/release`; the conductor ran the ring, the ref reset after. Cost: 22 minutes of a subagent, 25 of verification.
- **2026-09-07 — The image is on the registry: `docker.io/dglazkov2/sheep-pen:2b71e46`, digest `sha256:48101e13…`, pushed in thirteen seconds; `docker pull` by tag here, and that run's release names the same commit.** The shepherd's namespace is `dglazkov2`; the first push failed at login as `dglazkov`.

**Status: CLOSED.** 2026-09-07. The stamped Worker, the shipped config's image line, `GET /home`'s `build`, `sheep home`'s two stamps, the package ring showing them equal; the workflow pushed the image and it pulls here by tag, the release of that run naming the same commit.

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

**Findings.**

- **2026-09-07 — Cloudflare pulled the public Docker Hub image by reference.** `wrangler deploy` passed `docker.io/dglazkov2/sheep-pen:62b177e` as the application's image and needed no Docker; the station's container answered `git version 2.39.5, node v24.20.0, pnpm 10.33.0` twenty seconds after the deploy.
- **2026-09-07 — A deploy is done when a container instance is healthy, not when `GET /` answers.** The third ring run's first sheep got "there is no container instance that can be provided to this durable object"; deploy now polls the application's `health.instances.healthy`, 35 seconds that run, and reports it.
- **2026-09-07 — Every name is set in a derived config.** With `containers[].name` absent wrangler names the application `<worker>-pencontainer-pen`, so deploy writes `<kennel>/deploy/wrangler.jsonc` with `main` absolute and the Worker's name three times, and runs wrangler there.
- **2026-09-07 — The shepherd's token is account-owned:** `GET /user/tokens/verify` calls it invalid and `GET /accounts/{id}/tokens/verify` answers `active`; the plan is `workers_paid` among `/subscriptions`, which needs Billing read, now in the refusal's list.
- **2026-09-07 — The account ring held: deploy 56 s, the faux sheep's container shell in 5 s, redeploy 10 s with the sheep still listed, delete in three lines, 3186 `ps` samples clean.** A failure after the deploy deleted first, twice; a concurrent walk broke its before-and-after listing once.
- **2026-09-07 — The walk: `sheep-2`, deployed from `~/.sheep` in ten seconds with a real key,** a real model naming the container's tools, `sheep home local` beside it reached with `--home`; `sheep` is the checkout's Worker until station phase 3, so the rule minted the counter.
- **2026-09-07 — A first deploy refuses a `--name` the account already holds,** since `mintName` returns it verbatim; otherwise `--name sheep-pen` from a fresh kennel would redeploy the shepherd's own Worker. Cost: 45 minutes of a subagent over four passes, 70 of verification.

**Status: CLOSED.** 2026-09-07. `sheep home deploy` and `sheep home delete` from the package; the account ring green on the shepherd's account, the station deployed, walked, redeployed, and deleted; journey 1 walked with a real model on the shepherd's `sheep-2`.

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

**Findings.**

- **2026-09-07 — Journey 2 walked twice: in the ring and on `sheep-2`.** A container installed the release, joined with the token on stdin, listed the sheep, attached promptless, and saw the turn end; on `sheep-2` a real model's turn finished 45 seconds after the first terminal was killed.
- **2026-09-07 — The image by digest is the workflow's to know, and Cloudflare deploys it.** `docker push` prints the digest and the release runs after it; the release from 7db59d3 names `…@sha256:28817231…`, and the ring's three-way check, Worker, config, application, held on it, the container running.
- **2026-09-07 — The account API echoes a Docker Hub reference verbatim** as `configuration.image`; the platform gives a container ids, never its digest, so `GET /home` carries the reference the release defined.
- **2026-09-07 — `sheep home join` drops `name` and `local`:** the station's name is the deploying kennel's record; the token is one line of stdin, and `--token` or a second positional is refused before any request.
- **2026-09-07 — A joined machine warns on skew at once:** `sheep-2` runs 62b177e and the joining command was 747f923, so the join printed the older home's line.
- **2026-09-07 — The ring held thirteen lines three times: deploy 46 to 90 s, the second machine's container 27 s, up to 5616 `ps` samples clean.** Once in four runs the abandoned faux turn did not end within the second machine's wait; not reproduced. Cost: 20 minutes of a subagent, 55 of verification.
- **2026-09-07 — Journey 3 walked in the ring with the shepherd's token:** the pasture `ring-876a5f8`, two sheep cloning at birth and pushing `sheep/ring-876a5f8-typo` and `-links`, seen anonymously from here; the token in neither transcript, the export's bytes, or 17970 `ps` samples; the branches deleted after.

**Status: CLOSED.** 2026-09-07. `sheep home join`, the second machine in the account ring, journey 2 walked in the ring and on `sheep-2` with a real model; journey 3 walked in the ring against the scratch repository once the shepherd's token was in the checkout.

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

**Findings.**

- **2026-09-07 — The upgrade walked in the ring and on `sheep-2`.** The release before deployed, a sheep and a pasture minted on it, the newer installed over it, the skew line printed, the redeploy keeping every row; `sheep-2`'s sessions survived its own.
- **2026-09-07 — A redeploy with a new image is a rollout, not a deploy.** `wrangler deploy` returns with the application naming the old image; a rolling rollout, 34% then 100%, replaces instances over 150 s or more; deploy waits to the last step with a healthy instance, 300 s at most, and reports it.
- **2026-09-11 — The platform mirrors a container image into its own registry.** An application deployed from a Docker Hub digest ends up configured with `registry.cloudflare.com/<account>/<name>@sha256:<another digest>`, the manifest re-uploaded, and the Docker Hub rollouts it superseded read `replaced`.
- **2026-09-11 — So `sheep home deploy` told the shepherd a finished rollout was still running.** Requiring the configuration to name the image made a completed rollout report `rolling` — "the old image serves until it completes" — about one the platform had completed; the rollout's own word now ends the wait.
- **2026-09-07 — A rollout's status can stay `progressing` past 600 s with every instance healthy,** while `sheep-2`'s completed in 150 s; so `rolling` ends a deploy too, and the platform finishes it.
- **2026-09-07 — A Worker deployment takes seconds to reach `GET /home`:** read right after `wrangler deploy`, the stamp was the older's; deploy reads it after the waits, polling a redeploy's up to a minute.
- **2026-09-07 — One dropped API read killed a deploy the account had taken** (`fetch failed` at 35 s); every read in a wait is retried three times, and one that keeps failing ends the wait as `unknown`, never exit 1.
- **2026-09-07 — The delete asks the account before the person:** five listing lines from GETs, `</dev/null` refusing with exit 2 and no DELETE, on `sheep-2` too; the ring read `sessions: 2`, `pastures: 1`. Sixteen lines held, 13994 `ps` samples clean. Cost: 55 minutes of a subagent over four passes, 95 of verification.
- **2026-09-07 — The checkout's `sheep` and `sheep-pen` deleted on the shepherd's word,** by name from a kennel without their token, so the listing counted their sessions as unknown; the account holds `sheep-2` alone, and `sheep` is free.

**Status: CLOSED.** 2026-09-07. Journey 4 walked in the ring and on `sheep-2`; journey 5 whole in the ring with the repository's token, nineteen lines; the checkout's homes deleted on the shepherd's word.

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

**Findings.**

- **2026-09-07 — `wrangler dev` needs a Cloudflare login for any registry image, public or not,** so the local home hands it a derived config with a one-line `FROM <image>` Dockerfile; Docker pulls the digest and the image is the registry's, id for id, `sha256:f088aa1b…` running and pulled by name.
- **2026-09-07 — Journey 6 walked on this laptop through the package ring with `--docker`:** the home up in 8 s with a container, `git, node, pnpm` in 2 s, two sheep pushing to the scratch repository from it, the token nowhere, the containers gone 126 s after the last command; without Docker, collar's home and the sentence.
- **2026-09-07 — A build's base image is never tagged in the store,** so the ring pulls the reference by name before comparing ids; a fresh `HOME` hides Docker's CLI plugins, so the ring passes `DOCKER_CONFIG` with `--docker`.
- **2026-09-07 — The record decides a start on demand without asking Docker,** and `--no-container` never does; only `sheep home local` runs `docker version`. The ring's second call had let a containerless home restart with a container.
- **2026-09-07 — `--name sheep` on `wrangler dev --env pen` keeps the kennel's sheep across the container switch,** and `sheep home stop` removes the home's orphaned `-proxy` container, which wrangler leaves behind.
- **2026-09-07 — Right after a rollout, `wrangler deploy` uploaded the Worker and refused the container application** ("durable object was not found in list of bindings"); deploy runs it once more after 20 s, `deployRetried` in the report, and the ring's a5 held after.
- **2026-09-07 — The guide sits at 1496 of its 1500 words.** Cost: 75 minutes of a subagent over five passes, 90 of verification; the account ring held whole with journey 3 the same night.

**Status: CLOSED.** 2026-09-07. `sheep home local` with a container from the registry image when Docker answers, collar's home and the sentence without; the package ring with `--docker` walked journey 6 on this laptop, pasture's journey 1 included; the machine ring green.
