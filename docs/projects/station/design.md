# Station — the design

**7 September 2026.** Design. Nothing built. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.

The thesis in one line: **a home worth an account is a home with a
container, so there is one thing to deploy, and the dog deploys it from
the package with a token the shepherd provided.**

Collar left the dog with a command and a home on its own machine. That
home is the containerless cell lamb built first: its sheep have pi's
four tools over a workspace in SQLite, and a shell that is an
interpreter with text tools. They can write and read. They cannot clone,
install, build, test, or push. The shepherd put it plainly on 7 Sep
2026: a sheep without a container is a writer, not a worker, and a
gradual path from one to the other is the history of the legs, not the
shape of the product. So the deployed home is the pen home, always. The
Paid plan is asked once, with its price. There is no `--pen`.

The station is that home on the shepherd's Cloudflare account, made by
one command from the installed package. Everything the checkout's README
does by hand today, `wrangler login`, two deploys, four secrets, a config
written by a person, becomes `sheep home deploy` with two environment
variables, and the hermetic ring that proved collar proves this on a
real account.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the station | the deployed home: a Worker, its objects, its container application | the shepherd's account, Worker `sheep` by default, `--name` for another |
| the image | the pen container's image | `docker.io/dglazkov2/sheep-pen:<commit>`, pushed by the release; named by tag in the package's config |
| the stamp | collar's build stamp, on the home too | `GET /home` gains `build: {commit, builtAt}`, set into the Worker at bundle time |
| `sheep home deploy` | the one path | the CLI, over wrangler from `~/.sheep/tools` and the account API |
| `sheep home join` | a second machine's way in | the CLI: the address as an argument, the token on stdin |
| `sheep home delete` | the end of a station | the CLI: the name typed at a terminal, then Worker, objects, and container application |
| the account ring | collar's walk on a real account | `scripts/hermetic.mjs --ring account` |

## What exists, exactly

- **The package carries the pen home already.** Collar's release ships
  `home/worker.mjs`, one bundle exporting all four classes, and
  `home/wrangler.jsonc` with the `pen` environment kept verbatim: the
  `PEN_CONTAINER` binding, the migrations, the loader, and a `containers`
  entry whose `image` is `../pen/Dockerfile`, a path that does not exist
  in an install. Deploying the station is `wrangler deploy --env pen`
  over that config with the image line changed.
- **Cloudflare pulls images from Docker Hub by reference.** The config
  names `docker.io/<namespace>/<repository>:<tag>`; Cloudflare pulls at
  deploy and does not cache; `wrangler dev` accepts the same reference
  locally. GitHub's registry is not on the list. So the release pushes
  the image to Docker Hub, and neither the user's machine nor the
  account needs to build anything.
- **A container application's name is account-wide** and bound to one
  Durable Object namespace, and deleting a Worker leaves its application
  behind (recast phase 1). The config's `containers[].name` is the
  Worker's own name, so a second station on the account, the hermetic
  one, does not collide, and deletion removes the application by name.
- **Wrangler is already on the machine.** Collar's local home installed
  the pinned version into `~/.sheep/tools`; deploy uses the same copy.
  Wrangler reads `CLOUDFLARE_API_TOKEN` from the environment and needs
  no login with it. `wrangler secret put` reads the value from stdin.
- **The subdomain.** A first deploy on an account without a `workers.dev`
  subdomain has no address. Wrangler asks interactively; the account API
  registers one with a `PUT`. Deploy calls the API with the token when
  the account has none, `--subdomain <name>` choosing it, and refuses
  with a sentence when the name is taken.
- **The stamp is a file today.** Collar's `sheep --version` reads the
  manifest beside the bundle. The Worker has no manifest; the bundler
  defines a constant into it, and `GET /home` reports it.
- **Pen's local rig.** `wrangler dev --env pen` on a machine with Docker
  builds the image and runs a container, dialing the home back at
  `host.docker.internal`; the README walks it. With a registry image in
  the config, the build step goes and the pull stays.

## The deploy

`sheep home deploy [--name <worker>] [--subdomain <name>] [--json]`:

1. **Nothing without the token.** `CLOUDFLARE_API_TOKEN` absent: print
   what the command needs and costs, the token's permissions by name
   (Workers Scripts, Durable Objects, Containers, Workers Subdomain,
   Account Settings read), the Paid plan's price, the container
   instance's price per minute, and the sentence to ask the person
   with; exit 2. `ANTHROPIC_API_KEY` absent: the same, for the key.
2. **The account.** Ask the API whose token this is and whether the
   account is on the Paid plan; a Free account is refused with the
   price and the dashboard's page, since containers need the plan and
   the deploy would fail later and worse. Register the subdomain if
   there is none.
3. **The deploy.** wrangler from `~/.sheep/tools`, `deploy --env pen
   --config <kennel>/deploy/wrangler.jsonc`: the package's config with `main`
   absolute and the Worker's name set three times, the top level's, the
   environment's, and the container application's, since wrangler names
   the application `<worker>-pencontainer-pen` when the config does not
   (station phase 1). The image line in the shipped
   config already names the registry image at the release's commit, so
   the deploy pulls the image the release built.
4. **The secrets.** `SHEEP_TOKEN`, generated once and kept in
   `~/.sheep/config`; `SHEEP_ANTHROPIC_API_KEY` from the environment;
   `PEN_CELL_ORIGIN`, the address the deploy printed; each through
   `wrangler secret put --env pen` on stdin. `PEN_GIT_TOKEN` is not set:
   the credential is a pasture's, since pasture phase 3.
5. **The config.** `~/.sheep/config` names the station and drops the
   `local` marker. Then the wait: a container instance of the
   application healthy, which `wrangler deploy` does not wait for
   (station phase 1). The report: the address, the stamp, the plan, the
   healthy instances, and the next sentence.

Run again, it redeploys the same Worker from the package it runs from,
keeps every secret, and reports the stamp moving. That is the upgrade,
and there is no other.

## Two machines, and one config

The config names one home. `--home <url>` and `SHEEP_HOME` reach another
for one command, as they do today. Named homes and `sheep home use` are a
surface nobody has asked for; the day two stations are in daily use is
the day to add it.

Which config is [kennel](../kennel/design.md)'s: the nearest `.sheep/`
at or above the working directory, `~/.sheep` when there is none. A
station is deployed from a kennel, named by kennel's rule, the
directory's name and a counter against the account, minted at the
first deploy and recorded in that kennel's config as `name`; every
later deploy and the delete use the recorded name, and a different
`--name` is refused. Two directories, two stations, two tokens, two
deletes, on one account. Kennel lands before station phase 1.

`sheep home join <address>` reads the token from stdin, asks the home's
`GET /` for `sheep` and `GET /home` for its stamp, and writes the config.
The token travels the way a pasture secret does: piped by a person from
where they keep it, never printed by a dog into its transcript. `sheep
home` on either machine prints the address and both stamps, and one line
when they differ: the home is older, `sheep home deploy` from the newer
package; or the CLI is older, `npm install -g` the spec.

## Delete

`sheep home delete [--name <worker>]` lists what it will remove and the
number of sessions in it, and waits for the Worker's name typed on a
terminal; with no terminal it refuses, so a dog in print mode cannot
delete a station by accident and a person can. Then: `wrangler delete`,
`wrangler containers delete` for the application of that name, and the
config cleared. Deletion is asked, as recast said, and it is not undone.

## The stamp on the home

`scripts/bundle.mjs` defines `SHEEP_BUILD` into `home/worker.mjs` at
release time, the same commit and time the manifest carries; a checkout's
`wrangler dev` sees `0.0.0-checkout`. `GET /home` adds `build`. The CLI's
`sheep home` compares it to its own and says which is older. Nothing
refuses on skew: the wire is private, but a warning is enough until a
walk shows it is not.

## The image

The release builds `packages/pen`'s image and pushes it to Docker Hub as
`docker.io/dglazkov2/sheep-pen:<commit>`, on the runner, with a token the
shepherd puts in the repository's secrets: one ⚑ step, once. The release
script rewrites the shipped config's image line to that reference, so
the package and the image name the same commit, and a station deployed
from a package runs the container its bundle was tested with. The push
comes before the release in the workflow, so the release knows the
digest the registry gave the tag: the shipped config names the image by
that digest, `docker.io/dglazkov2/sheep-pen@sha256:…`, and the Worker
carries the same reference beside its stamp for `GET /home` to report,
since nothing on the platform tells a container its own digest. A
release built by hand, with no push before it, names the tag and says
so (station phase 2). Docker Hub
does not cache on Cloudflare's side and rate-limits anonymous pulls;
the account ring records the pull time, and a private registry is a
finding if it bites.

## The account ring

`scripts/hermetic.mjs --ring account [ref|spec] [--yes]`: collar's package
ring, then the station. With `CLOUDFLARE_API_TOKEN` and `ANTHROPIC_API_KEY`
in the environment, it states the price, the plan already paid and the
container minutes the walk will spend, and waits for a yes. From a fresh
prefix and `HOME`: `sheep home deploy --name sheep-hermetic-<sha>`, journey
1 steps 3 and 4 with the faux provider set as a var so no model is
spent, journey 3 against the scratch repository with the shepherd's
fine-grained token, journey 2 from a second container built by the
machine ring with `sheep home join` on stdin, and `sheep home delete`
with the name piped. A failure after the deploy still deletes. Afterwards
the ring lists the account's Workers and container applications and
asserts the name is gone. It prints the image digest the container ran.

## The local home, whole

`sheep home local` on a machine with Docker starts the `pen` environment:
`wrangler dev --env pen` over the package's config, the registry image
pulled by Docker, `PEN_CELL_ORIGIN` the address Docker reaches the host
by, `host.docker.internal` on a Mac and the bridge address on Linux.
Without Docker it is collar's home and says what a container would add.
This is the last phase, because it is the one that makes the first five
minutes the product, and because deploy is what the shepherd asked for.

## What this does not do, on purpose

- **A hosted home.** The Worker has one token and one key; tenancy is a
  project, if ever.
- **Named homes.** Above.
- **A GitHub App.** Pasture's open debt, its own project; the broker's
  lookup is the seam.
- **A home with no container.** It exists for tests and for a machine
  without Docker, and is never deployed by this command.
- **Migrating sessions from the checkout's homes.** `sheep` and
  `sheep-pen` on the shepherd's account were deployed by hand from the
  checkout. A station deployed from the package is a new Worker; the old
  ones are deleted when the shepherd says so, as recast did.
