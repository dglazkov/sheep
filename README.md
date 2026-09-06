# sheep

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**: a coding agent, Claude Code in this
repo or pi on a laptop, working a goal a person gave it. The ones it herds
are **sheep**: pi sessions, each in a cell with its own workspace, given a
task and left to it. `sheep` is how the dog herds. A person does not run
`sheep`. The dog does.

Coding agents whose sessions live in cells rather than on machines. A cell
is a Durable Object: one small SQLite database with an address, on
Cloudflare. The transcript, the workspace, and the loop that drives the
agent are rows in it. A terminal attaches from anywhere, the cell resumes
on its own after being evicted mid-turn, and an idle session costs nothing.

The long version of the idea, and where the work stands, is in
[`docs/projects/`](docs/projects/README.md).

## sheep

`sheep` is the command. Two legs built it, and a third gave it its name:
[lamb](docs/projects/lamb/design.md) put [pi](https://pi.dev) in a cell,
[pen](docs/projects/pen/design.md) gave the cell a container, and
[recast](docs/projects/recast/design.md) renamed the command for what it
handles. It is not a new agent. It is pi's own harness, session model,
protocol, and terminal, with the machine underneath swapped for a Durable
Object. Pi comes in as a submodule tracking a branch that is upstream pi
plus a few small commits, never a copy.

What you get today:

- `sheep new` mints a session at a **home** (a deployment) and opens pi's
  terminal on it. `sheep attach <id>` from any other machine opens the same
  session; two terminals can share one.
- The agent has pi's four tools. `read`, `write`, and `edit` work on a
  workspace stored in the cell. `bash` runs a shell interpreter inside the
  cell with the usual text tools. On a home with no container there are no
  interpreters, package managers, or `git`; the shell says so plainly when
  asked. Programs arrive with a container, below.
- A turn survives the cell being evicted. Pi's recovery settles the
  interrupted step honestly and continues.
- `sheep export <id>` writes a pi SQLite session file that pi's own Node
  backend opens.

Design, acceptance journeys, and the phase-by-phase record with findings,
project by project: [`docs/projects/`](docs/projects/README.md).

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

- `SHEEP_TOKEN`: the bearer token every request to your home must carry. Any
  long random string (`openssl rand -hex 24`).
- `SHEEP_ANTHROPIC_API_KEY`: the key the cell uses to call the model.

`.dev.vars` is gitignored and is read only by the local dev servers. A
deployed home gets the same names through `wrangler secret put`, below.

### Run a home locally

In one terminal:

```sh
pnpm --filter @sheep/cell dev            # a local home on http://127.0.0.1:8787
```

In another, tell `sheep` where the home is and talk to it:

```sh
export SHEEP_HOME=http://127.0.0.1:8787
export SHEEP_TOKEN=$(grep ^SHEEP_TOKEN= packages/cell/.dev.vars | cut -d= -f2)

node packages/cli/bin/sheep.js new -- "hello, what can you see in the workspace?"   # one reply, then exit
node packages/cli/bin/sheep.js new                                                   # pi's interactive terminal
```

### Deploy a home on Cloudflare

Once, log Wrangler in; it opens a browser tab to authorize:

```sh
cd packages/cell
pnpm exec wrangler login
```

Deploy, and set the two secrets from your `.dev.vars`:

```sh
pnpm run deploy                               # from the repo root; prints https://sheep.<you>.workers.dev
cd packages/cell
grep ^SHEEP_TOKEN= .dev.vars | cut -d= -f2 | pnpm exec wrangler secret put SHEEP_TOKEN
grep ^SHEEP_ANTHROPIC_API_KEY= .dev.vars | cut -d= -f2 | pnpm exec wrangler secret put SHEEP_ANTHROPIC_API_KEY
```

The first deploy asks you to pick a `workers.dev` subdomain. Redeploying
is `pnpm run deploy` again; sessions and secrets survive it. (Bare `pnpm deploy` is pnpm's own workspace-deploy command and shadows the script.) `pnpm exec wrangler
delete` removes everything.

Point `sheep` at the home so it needs no environment variables:

```json
// ~/.sheep/config
{ "home": "https://sheep.<you>.workers.dev", "token": "<your SHEEP_TOKEN>" }
```

### Use it

```sh
sheep new [--name <name>] [-- <prompt>]   # a new session, pi's terminal attached
sheep -c [-- <prompt>]                    # attach to the newest session
sheep attach <id> [-- <prompt>]           # attach to a session; works from any machine with the config
sheep ls                                  # sessions at the home
sheep export <id> [file]                  # a pi SQLite session file
sheep --home <url> ...                    # a different home for one command
```

`sheep` here means `node packages/cli/bin/sheep.js`; put an alias in your
shell if you like. With a prompt after `--` the reply streams and the
command exits; without one you get pi's full terminal.

### A home with a container: pen

The second leg gave each cell a container it rents for the length of a
command that needs one (`pnpm`, `node`, `python`, `git`). The same Worker
deploys twice: the top level is `sheep`, with no container, and the `pen`
environment is `sheep-pen`, with one. Cloudflare Containers need the
Workers Paid plan, and Docker Desktop locally, where `wrangler dev` builds
and runs the image (`packages/pen/Dockerfile`).

```sh
# locally: the container dials the home back at PEN_CELL_ORIGIN, which from Docker on a Mac is
# host.docker.internal; PEN_IDLE is how long a container stays up after its last command.
cd packages/cell
pnpm exec wrangler dev --env pen --var PEN_CELL_ORIGIN:http://host.docker.internal:8787 --var PEN_IDLE:1m

# deployed: the Worker sheep-pen, its own origin as PEN_CELL_ORIGIN, and the same two secrets
pnpm run deploy:pen                           # from the repo root
cd packages/cell
pnpm exec wrangler secret put PEN_CELL_ORIGIN --env pen      # https://sheep-pen.<you>.workers.dev
grep ^SHEEP_TOKEN= .dev.vars | cut -d= -f2 | pnpm exec wrangler secret put SHEEP_TOKEN --env pen
grep ^SHEEP_ANTHROPIC_API_KEY= .dev.vars | cut -d= -f2 | pnpm exec wrangler secret put SHEEP_ANTHROPIC_API_KEY --env pen
pnpm exec wrangler secret put PEN_GIT_TOKEN --env pen        # a fine-grained token: one repository, contents read and write
```

A line of exactly `node <file> [args…]`, the file a workspace script,
runs in tier 1 while no container is up: a fresh isolate from the Worker
Loader (`worker_loaders` in `wrangler.jsonc`, the `pen` environment only;
the home with no container has no tier 1, which is journey 6) with the
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

### Layout

```
packages/cell/    the Worker: the cell, the directory, the workspace, the shell, the wire
packages/cli/     the sheep command; runs pi's client
packages/pen/     the container image and the agent that speaks the container protocol
vendor/pi/        pi, pinned to the sheep branch of dglazkov/pi; `git log upstream/main..sheep` is what sheep changes
docs/projects/    the design, the journeys, the phases and their findings
AGENTS.md         house rules for anyone, human or agent, working in this repo
```
