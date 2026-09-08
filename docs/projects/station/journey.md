---
status: partial
since: 2026-09-07
see: station
note: "written 7 Sep 2026, the evening collar closed, from a conversation with the shepherd: a home in the cloud, from the package, in one path. The shepherd's calls: a sheep without a container is a writer and not a worker, so the deployed home is the pen home always, the Paid plan asked once, and there is no containerless home to deploy; the config names one home, and `--home` reaches another for one command; the token reaches a second machine through `sheep home join` on stdin, never through a dog's transcript; an API token and never a browser login, because the dog cannot do one; the local home rents a container when Docker is present, so a laptop with Docker gets the whole product with no account, as the last phase. Station phase 0 closed the same evening: the workflow builds the pen image and pushes it to Docker Hub with the shepherd's token in the repository's secrets, the release stamps the Worker and names the image at its commit in the shipped config, `GET /home` carries the stamp, `sheep home` prints both stamps and warns on skew, the package ring showed them equal, and the image pulled here by tag. Station phase 1 closed the same night: `sheep home deploy` and `sheep home delete` from the package, the account ring green on the shepherd's account with a station named for the commit deployed, walked, redeployed, and deleted, and journey 1 walked on the shepherd's own `sheep-2` with a real model. Station phase 2 the same night, part-done: `sheep home join` with the token on stdin, a second machine as a container in the ring, journey 2 walked in the ring and on `sheep-2` with a real model, the image named by digest when the release knows it; journey 3 built into the ring and waiting on the fine-grained token for the scratch repository. Station phase 3 the same night: the delete whole with its listing, the ring upgrading a station from the release before with the skew line printed and every row kept, `sheep-2` upgraded with its sessions intact. Late that night, with the shepherd's token in the checkout, the ring walked journey 3 and journey 5 whole, and the checkout's `sheep` and `sheep-pen` were deleted on the shepherd's word; phases 2 and 3 closed. Journey 6 is phase 4's, being built."
---

# Station — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**,
pi sessions each in a cell; the person is the **shepherd**. Collar gave
the dog the command and a home on its own machine. That home is a cell
with no container: its sheep read, write, and edit, and cannot clone,
build, test, or push. It is the first look, not the work. The work
needs a **station**: a home in the cloud, on the shepherd's account,
with a container beside every cell, reachable from any machine, where a
sheep survives the laptop closing. This project is `sheep home deploy`,
one path, from the installed package, with nothing on the account until
the shepherd's token is in the environment.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against a real account. [design.md](design.md)
is the mechanism and [phases.md](phases.md) the walk. If a journey and
the mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **The station**: the deployed home: one Worker on the shepherd's
  Cloudflare account, its Durable Objects, and its container
  application, made by `sheep home deploy` from the package.
- **The image**: the pen container's image, built and pushed to a
  registry by the release, named by tag in the package's config; a
  user's machine never builds it.
- **The stamp**: collar's build stamp, now reported by the home too, so
  the CLI can say when the two differ.
- **The account ring**: collar's hermetic walk, on a real account: a
  station named for the commit, walked, deleted.

## Journey 1: A home in the cloud

The shepherd has herded on the local home for a week. They say to
their dog: "Put the home on my Cloudflare account."

1. The dog runs `sheep home deploy`. It makes nothing. It prints what
   it needs and what it costs: a Cloudflare API token in
   `CLOUDFLARE_API_TOKEN` with the permissions it names, the Anthropic
   key in `ANTHROPIC_API_KEY`, and the Workers Paid plan, with the
   plan's price and what container minutes cost. The dog asks the
   person for the token in one sentence. Making it in the dashboard is
   the one browser step, and it is the person's.
2. The person exports the token. The dog runs `sheep home deploy`
   again. In under three minutes: the package's Worker deploys as
   `sheep` on the account with a container application of its own
   name, the image pulled from the registry by tag; `SHEEP_TOKEN` is
   generated and `SHEEP_ANTHROPIC_API_KEY` copied from the environment,
   both set as secrets through stdin; `PEN_CELL_ORIGIN` is the home's
   own address; a `workers.dev` subdomain is registered through the API
   if the account has none. The command prints the address and writes
   `~/.sheep/config` to name it. No secret is ever an argument.
3. `sheep new -- "Clone nothing; what tools do you have?"` answers from
   the cloud, and the sheep's shell names `git`, `node`, and `pnpm`.
   `sheep home` prints the address, the home's stamp, and the CLI's;
   they match.
4. `sheep home local` still starts the local home, and `--home
   http://127.0.0.1:<port>` reaches it for one command; the config
   keeps naming the station.

Acceptance criteria:

- With `CLOUDFLARE_API_TOKEN` unset, `sheep home deploy` creates
  nothing, and the account ring proves it by asking the account
  afterwards.
- Every secret goes to wrangler through stdin, and the ring's `ps`
  sees none in an argument, as collar's does.
- The container application's name is the Worker's, so two stations on
  one account do not collide, which recast found the hard way.
- `GET /home` carries the stamp, set into the Worker at bundle time.

## Journey 2: Two machines

The shepherd opens a second laptop.

1. Its dog runs `npx github:dglazkov/sheep#release setup`, then `sheep
   home join https://sheep.<subdomain>.workers.dev` with the token on
   stdin, piped by the person from the first machine's config or a
   password manager. `~/.sheep/config` on the second machine names the
   station. `sheep ls` lists the sheep minted from the first.
2. The person runs `sheep attach <id>` on the second machine and gets
   pi's terminal on a sheep the first machine minted. Two terminals
   share it, as lamb's journey 3.
3. The first laptop closes with a turn running. The turn finishes; the
   second machine's `sheep log <id>` shows the end of it, as lamb's
   journey 2.

Acceptance criteria:

- `sheep home join` refuses a token on the command line, and refuses a
  home whose `GET /` does not answer `sheep`.
- The second machine is a container in the ring, with nothing but Node,
  so "two machines" is walked without a person.

## Journey 3: A repository

The shepherd wants sheep on a repository. This is pasture's journey 1,
on a station made by `sheep home deploy`.

1. `sheep pasture new docs --repo .`, the fine-grained token piped into
   `sheep pasture secret set docs GIT_TOKEN`, a brief put, two sheep
   born detached on two tasks.
2. Each clones at birth in its container, edits, runs the tests, pushes
   a branch with the pasture's credential, and names it in the tree.
3. `sheep pasture docs` shows the herd. Two branches are on GitHub. The
   token appears in no transcript, export, log, or container
   environment.

Acceptance criteria:

- Pasture's journey 1 criteria hold unchanged on the station.
- The container the sheep worked in was the registry's image, by
  digest, and the ring says which.

## Journey 4: Upgrade, and delete

A month later, and a year later.

1. The person's dog upgrades the command with `npm install -g
   github:dglazkov/sheep#release`. `sheep home` now warns: the home's
   stamp is older than the CLI's. `sheep home deploy` again redeploys
   the same Worker from the new package; every session and pasture
   survives; the stamp moves; the warning stops.
2. `sheep home delete` prints what it would remove, the Worker, its
   objects, its container application, and every session in them, and
   waits for the home's name typed at a terminal. With no terminal it
   refuses. Typed, it deletes all of it and clears the config.

Acceptance criteria:

- A redeploy is not a migration: the Durable Object classes and their
  migration tags are the package's, and a deploy of the same tags over
  the same names keeps the rows.
- Deletion removes the container application too, which `wrangler
  delete` alone leaves behind, as recast found.

## Journey 5: The account ring

The conductor, or the shepherd, wants a release proved on a real
account before it matters.

1. `pnpm hermetic --ring account [ref|spec]`, with the token and the
   key in the environment, states the price, container minutes and the
   plan, and waits for a yes. Then, from a fresh prefix and `HOME`, it
   installs the release, runs `sheep home deploy --name
   sheep-hermetic-<sha>`, walks journey 1 steps 3 and 4 and journey 3
   against the scratch repository, joins from a second container as
   journey 2, and runs `sheep home delete` with the name on stdin.
2. It prints one line per step, the station's address, the image
   digest the container ran, and what it did not check. The account
   holds nothing of it afterwards, and the ring asks the account to be
   sure.

Acceptance criteria:

- The ring never reads `~/.sheep`, `~/.wrangler`, or this checkout's
  `node_modules`, as collar's rings do not.
- A ring that fails after deploying still deletes, and says so.

## Journey 6: The local home, whole

The shepherd's laptop has Docker. They want the whole product with no
account.

1. `sheep home local` says Docker is present and the home has a
   container. A sheep born there clones, builds, tests, and pushes,
   with the registry's image pulled by Docker, and `PEN_CELL_ORIGIN`
   the address Docker reaches the laptop by.
2. Without Docker, `sheep home local` is collar's home, and says in one
   sentence what a container would add and how to get one.

Acceptance criteria:

- The local home with a container is pen's local rig from the installed
  package: the same image, the same config, nothing built on the
  machine. The one-line `FROM <image by digest>` the home hands wrangler
  is a pull, not a build, and yields the registry's image id for id
  (station phase 4).
- The machine ring cannot walk this journey, since its container has
  no Docker; the walk is the conductor's, on this laptop, and the ring
  says so.
