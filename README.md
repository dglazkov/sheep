# sheep

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**: a coding agent, Claude Code in this
repo or pi on a laptop, working a goal a person gave it. The ones it herds
are **sheep**: pi sessions, each in a cell with its own workspace, given a
task and left to it. `lamb` is how the dog herds. A person does not run
`lamb`. The dog does.

Coding agents whose sessions live in cells rather than on machines. A cell
is a Durable Object: one small SQLite database with an address, on
Cloudflare or on a [celld](https://celld.dev) fleet you run yourself. The
transcript, the workspace, and the loop that drives the agent are rows in
it. A terminal attaches from anywhere, the cell resumes on its own after
being evicted mid-turn, and an idle session costs nothing.

The long version of the idea, and where the work stands, is in
[`docs/projects/`](docs/projects/README.md).

## lamb

Lamb is the first leg: [pi](https://pi.dev), running in a cell. It is not a
new agent. It is pi's own harness, session model, protocol, and terminal,
with the machine underneath swapped for a Durable Object. Pi comes in as a
submodule tracking a branch that is upstream pi plus a few small commits,
never a copy.

What you get today:

- `lamb new` mints a session at a **home** (a deployment) and opens pi's
  terminal on it. `lamb attach <id>` from any other machine opens the same
  session; two terminals can share one.
- The agent has pi's four tools. `read`, `write`, and `edit` work on a
  workspace stored in the cell. `bash` runs a shell interpreter inside the
  cell with the usual text tools. There are no interpreters, package
  managers, or `git` yet; the shell says so plainly when asked. Programs
  arrive with the second leg, in a container.
- A turn survives the cell being evicted. Pi's recovery settles the
  interrupted step honestly and continues.
- `lamb export <id>` writes a pi SQLite session file that pi's own Node
  backend opens.

Design, acceptance journeys, and the phase-by-phase record with findings:
[`docs/projects/lamb/`](docs/projects/lamb/design.md).

### Prerequisites

- Node 22 or newer, with corepack (ships with Node). The repo pins its pnpm
  version, so `corepack enable` is the only install.
- git.
- For a deployed home, a free [Cloudflare](https://dash.cloudflare.com/sign-up)
  account. No domain needed; the Free plan includes SQLite Durable Objects.
- An Anthropic API key.

### Set up the repo

```sh
git clone https://github.com/dglazkov/sheep && cd sheep
corepack enable

# pi, pinned as a submodule, with its packages built
git submodule update --init
(cd vendor/pi && npm ci --ignore-scripts && for p in chord tui telemetry ai agent session-backends/sqlite-node protocol client server coding-agent; do (cd packages/$p && npm run build); done)

pnpm install
pnpm test        # the cell's tests run inside workerd, the Workers runtime
```

### Secrets

Copy the example and fill in two values:

```sh
cp packages/cell/.dev.vars.example packages/cell/.dev.vars
```

- `LAMB_TOKEN`: the bearer token every request to your home must carry. Any
  long random string (`openssl rand -hex 24`).
- `LAMB_ANTHROPIC_API_KEY`: the key the cell uses to call the model.

`.dev.vars` is gitignored and is read only by the local dev servers. A
deployed home gets the same names through `wrangler secret put`, below.

### Run a home locally

In one terminal:

```sh
pnpm --filter @lamb/cell dev            # a local home on http://127.0.0.1:8787
```

In another, tell `lamb` where the home is and talk to it:

```sh
export LAMB_HOME=http://127.0.0.1:8787
export LAMB_TOKEN=$(grep ^LAMB_TOKEN= packages/cell/.dev.vars | cut -d= -f2)

node packages/lamb/bin/lamb.js new -- "hello, what can you see in the workspace?"   # one reply, then exit
node packages/lamb/bin/lamb.js new                                                   # pi's interactive terminal
```

### Deploy a home on Cloudflare

Once, log Wrangler in; it opens a browser tab to authorize:

```sh
cd packages/cell
pnpm exec wrangler login
```

Deploy, and set the two secrets from your `.dev.vars`:

```sh
pnpm run deploy                               # from the repo root; prints https://lamb.<you>.workers.dev
cd packages/cell
grep ^LAMB_TOKEN= .dev.vars | cut -d= -f2 | pnpm exec wrangler secret put LAMB_TOKEN
grep ^LAMB_ANTHROPIC_API_KEY= .dev.vars | cut -d= -f2 | pnpm exec wrangler secret put LAMB_ANTHROPIC_API_KEY
```

The first deploy asks you to pick a `workers.dev` subdomain. Redeploying
is `pnpm run deploy` again; sessions and secrets survive it. (Bare `pnpm deploy` is pnpm's own workspace-deploy command and shadows the script.) `pnpm exec wrangler
delete` removes everything.

Point `lamb` at the home so it needs no environment variables:

```json
// ~/.lamb/config
{ "home": "https://lamb.<you>.workers.dev", "token": "<your LAMB_TOKEN>" }
```

### Use it

```sh
lamb new [--name <name>] [-- <prompt>]   # a new session, pi's terminal attached
lamb -c [-- <prompt>]                    # attach to the newest session
lamb attach <id> [-- <prompt>]           # attach to a session; works from any machine with the config
lamb ls                                  # sessions at the home
lamb export <id> [file]                  # a pi SQLite session file
lamb --home <url> ...                    # a different home for one command
```

`lamb` here means `node packages/lamb/bin/lamb.js`; put an alias in your
shell if you like. With a prompt after `--` the reply streams and the
command exits; without one you get pi's full terminal.

### A home with a container: pen

The second leg, [pen](docs/projects/pen/design.md), gives each cell a
container it rents for the length of a command that needs one (`pnpm`,
`node`, `python`, `git`). The same Worker deploys twice: the top level is
lamb, with no container, and the `pen` environment is `lamb-pen`, with
one. Cloudflare Containers need the Workers Paid plan, and Docker Desktop
locally, where `wrangler dev` builds and runs the image
(`packages/pen/Dockerfile`).

```sh
# locally: the container dials the home back at PEN_CELL_ORIGIN, which from Docker on a Mac is
# host.docker.internal; PEN_IDLE is how long a container stays up after its last command.
cd packages/cell
pnpm exec wrangler dev --env pen --var PEN_CELL_ORIGIN:http://host.docker.internal:8787 --var PEN_IDLE:1m

# deployed: the Worker lamb-pen, its own origin as PEN_CELL_ORIGIN, and the same two secrets
pnpm run deploy:pen                           # from the repo root
cd packages/cell
pnpm exec wrangler secret put PEN_CELL_ORIGIN --env pen      # https://lamb-pen.<you>.workers.dev
grep ^LAMB_TOKEN= .dev.vars | cut -d= -f2 | pnpm exec wrangler secret put LAMB_TOKEN --env pen
grep ^LAMB_ANTHROPIC_API_KEY= .dev.vars | cut -d= -f2 | pnpm exec wrangler secret put LAMB_ANTHROPIC_API_KEY --env pen
pnpm exec wrangler secret put PEN_GIT_TOKEN --env pen        # a fine-grained token: one repository, contents read and write
```

A line of exactly `node <file> [args…]`, the file a workspace script,
runs in tier 1 while no container is up: a fresh isolate from the Worker
Loader (`worker_loaders` in `wrangler.jsonc`, the `pen` environment only;
the lamb home has no tier 1, which is journey 6) with the
workspace as its modules and nothing else, read-only under `/bundle`,
the script's working directory; no network; its stdout the tool result.
`PEN_ISOLATE_CPU_MS` (default 10000) is the CPU one run may spend,
enforced by the deployed runtime and not by `wrangler dev`.
`PEN_BUDGET_MINUTES` is the home's container budget;
when the minutes reach it, the sheep's shell says so instead of renting. `GET /home`
reports the minutes and the budget. `PEN_GIT_TOKEN` is the home's git
credential: when a sheep's `git push` needs one, the helper in the
container asks the cell, the cell hands the token over for that one
request, and it lives nowhere but the home. `PEN_GIT_HOST` (default
`github.com`) is the one host it is for; `PEN_GIT_AUTHOR_NAME` and
`PEN_GIT_AUTHOR_EMAIL` are who the container's commits are by.

### The same cell on celld

The same Wrangler project runs on a celld node, which keeps every cell's
state in a bucket you own.

```sh
curl -fsSL https://celld.dev/install.sh | sh     # installs to ~/.local/bin
pnpm --filter @lamb/cell dev:celld              # one local node on http://127.0.0.1:9876, reading .dev.vars
pnpm deploy:celld -- --bucket s3://<bucket>     # a fleet
```

celld runs the top-level config, which is lamb's; it has no container
support of its own, so the `pen` environment never reaches it. Pen on
celld is configuration on top: a **starter** beside the node, a small
program (`packages/pen/bin/pen-starter.mjs`, plain node) that drives
Docker on that machine, and `PEN_STARTER_URL` telling the cell where it
is. The cell speaks the same three verbs to it that the Containers
binding has (`ensure`, `renew`, `destroy`, one `POST` each); the image is
the same; the container dials the cell back at `PEN_CELL_ORIGIN` as
before. Which starter a home has is configuration, and no code path
asks what platform it is on.

```sh
pnpm --filter @lamb/pen build:image             # sheep-pen:dev, once
# the starter, beside the node: 127.0.0.1:9877, the image, and its own idle stop (docker stop after PEN_IDLE)
pnpm --filter @lamb/pen starter -- --port 9877 --idle 10m          # also --image, --cell-origin
# the node, told where the starter is and what the container dials; from Docker on a Mac that is host.docker.internal
PEN_STARTER_URL=http://127.0.0.1:9877 PEN_CELL_ORIGIN=http://host.docker.internal:9876 PEN_IDLE=10m pnpm --filter @lamb/cell dev:celld
pnpm --filter @lamb/cell dev:celld:pen          # the same two, with those defaults
```

`dev:celld` passes every `PEN_*` name, `LAMB_PROVIDER`, and `LAMB_MODEL`
from its environment to the node over `.dev.vars`, so the walk above
needs no edit to the secrets file. The starter's `--cell-origin` rewrites
the origin of the address the cell gives, for a node whose Docker cannot
reach the cell where the cell thinks it lives; with `PEN_CELL_ORIGIN` set
on the cell it is not needed. `docker kill pen-<session id>` is the
shepherd's hand.

### Layout

```
packages/cell/    the Worker: the cell, the directory, the workspace, the shell, the wire
packages/lamb/    the lamb command; runs pi's client
vendor/pi/        pi, pinned to the sheep branch of dglazkov/pi; `git log upstream/main..sheep` is what lamb changes
docs/projects/    the design, the journeys, the phases and their findings
AGENTS.md         house rules for anyone, human or agent, working in this repo
```
