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

## Give your agent sheep

The install spec is `github:dglazkov/sheep#release`: the `release` branch
of this repository, built from `main`, installed with npm's git installer.
Nothing is on npm. You need Node 22.19 or newer, a Cloudflare account on
the Workers Paid plan, and an Anthropic API key. The first five minutes
are yours, at your own terminal; everything after them is your agent's.

1. At your own terminal, in any directory:

   ```sh
   npx github:dglazkov/sheep#release setup
   ```

   prints a small sheep and a checklist of seven steps that fill in as you
   go. **command** puts `sheep` on PATH. **where** asks whether this
   machine's settings go everywhere on it or in this directory alone;
   everywhere is the default, and Enter takes it. **account** asks for a
   Cloudflare API token at a hidden prompt and becomes the account's name.
   **plan** checks for Workers Paid, 5 USD a month, and waits on the
   dashboard's plans page if the account is not on it yet. **station**
   offers a new home named for where you are, and Enter deploys it: one
   Worker and its container application on your account, the step
   becoming its address. **key** asks for your Anthropic key at a hidden
   prompt and puts it on the home as its secret. **next** prints the
   address, where the two values are kept, and the one sentence to say to
   your agent.

   Pressing `?` on a step opens a few lines under it: what the step is
   for, where to get what it asks for, what it costs, and what sheep does
   with it; `?` again closes them, and `sheep setup --explain` opens each
   as it is reached. What you type is never on the screen, in a process's
   arguments, or in any file but `~/.sheep/credentials` (mode 600). You
   typed two values and pressed Enter a few times, and that is the whole
   of your part.

2. Say to your agent — Claude Code, or another coding agent, open in a
   repository — the sentence `next` printed: "sheep is set up on this
   machine; run `sheep --agent-help` and herd." The agent runs `sheep
   setup` itself where it stands. With no terminal it asks nothing: it
   installs the skill there under `.agents/skills/sheep` with a
   `.claude/skills/sheep` doorway, finds the home you made through
   `~/.sheep`, and prints a report.

3. The agent herds. `sheep new -- "What can you see in the workspace?"`
   mints a sheep and streams its reply; `sheep new --detach` starts several
   at once; `sheep ls`, `sheep status <id>`, `sheep wait`, and `sheep log
   <id>` say what they are doing and what they did; `sheep rm <id>` ends
   one. A sheep's container has `git`, `node`, `pnpm`, and `python`, so it
   can clone, build, test, and push. A pasture (`sheep pasture new`) is a
   shared tree a herd works on, a repository behind it or none.

4. `sheep attach <id>` at your own terminal opens pi's interactive
   terminal on the same sheep, from the installed bundle, with no checkout
   of pi anywhere.

5. `sheep --agent-help` is the guide your agent reads: the verbs, the
   home, what needs you, in the words this build ships. The skill says to
   read it, and little else.

The home has **eyes**: a sheep can `look <path>` at a page it wrote, in a
real Chromium, and read the picture; the report (errors, console, the
accessibility tree) comes back in its transcript, and you read it in
`sheep log`. With its container too, `look --serve 'npx vite --port $PORT
--strictPort' /` runs that command with `PORT` set, renders the page its
port serves, and stops it: a server lives for one look and no longer. The
recipe for a frontend app is a skill this repository ships,
[`docs/projects/serve/skills/frontend/SKILL.md`](docs/projects/serve/skills/frontend/SKILL.md);
`sheep pasture put <name> skills/frontend/SKILL.md <that file>` puts it in
a pasture and every sheep born there reads it.

The **kennel** is `.sheep/` at or above the working directory, found the
way git finds `.git`, and `~/.sheep` when there is none. Setting up for
everywhere puts the config there, so every directory finds the one home;
setting up for this directory gives that directory a kennel and a station
of its own, with `.sheep/` added to the `.gitignore` in a git work tree.
`sheep config` and `sheep home` print which kennel they found.

**After the first sitting, nothing asks you for anything.** Upgrading is
`npm install -g github:dglazkov/sheep#release`; `sheep home` then says the
home is older, and `sheep home deploy` reads the token and the key that
were kept, redeploys, and moves the home's stamp with every session and
pasture kept. `CLOUDFLARE_API_TOKEN` and `ANTHROPIC_API_KEY` in the
environment take precedence over what is kept, and nothing requires them.
When a command does need you — the credentials file is gone, say, on a new
laptop — it stops with a paragraph that begins `for the shepherd:` and
names the one command to type at your terminal, `sheep setup`; your agent
passes it on. `sheep home delete` is yours too: it lists what goes and
waits for the station's name typed at your terminal.

**A second laptop** is the same command at its own terminal. **account**
asks for the token, since that machine has never held one; **station**
lists the homes the account already has after the new one, and choosing
yours joins it: this machine proves it owns the account, the home hands
over its own token, and nothing is copied between the laptops by hand.
**key** asks nothing, since the home holds its own. `sheep ls` there lists
the sheep your first laptop's agent made.

`sheep export <id>` writes a pi session file. `sheep --version` prints the
build stamp: the commit on `main` the release was built from, and when.

## Developing sheep

Everything below is the checkout: `sheep` here means
`node packages/cli/bin/sheep.js`, against a home run from source.

### The developer's rig

A shepherd's home is a station on their account. A developer of sheep also
has the **rig**: the local home, workerd under a kennel's `local/`, which is
what the rings run a release's Worker in and what the conductor walks a
journey with a real model on without spending the account. It needs
everything a station does not: wrangler's workerd, a Chrome fetched on the
first look, and Docker for the container. It is the checkout's and the
rings', and a shepherd never hears of it.

```sh
node packages/cli/bin/sheep.js home local [--faux] [--no-container]   # a home under the kennel's local/, started if it was not
node packages/cli/bin/sheep.js home stop                               # stop this kennel's local home
```

`sheep home local` writes the kennel's config when there is none and
`.dev.vars` (mode 600) under `local/` with the home's token and the model
key, which it reads from what `sheep setup` kept in `~/.sheep/credentials`
or from `ANTHROPIC_API_KEY` in the environment; `--faux` runs the scripted
model that answers "ok" instead, for the plumbing without a key. With
Docker Desktop (or the docker engine) on the machine the home rents a
container beside every cell, pulled from the registry as the release
named it; without Docker, or with `--no-container`, its sheep read, write,
and edit, and the report says which in one sentence. The local home always
has eyes, and its first look fetches a Chrome into the wrangler cache. A
command whose home is the local one starts it when the connection is
refused, and says so on stderr.

Every release is proved before it is pushed by installing it the way a
user does, into a fresh prefix, cache, and `HOME`, and walking it:
`pnpm hermetic --ring package`. The walk drives the stile through a
terminal the ring owns against the fake account (`t0`), then walks the
herd on the rig with the scripted model, including a look: a sheep writes a
page with a bug, looks at it, reads the picture, and clicks, the Chrome
fetched into that fresh `HOME`. With `--docker`, on a machine with Docker,
the walk's home has a container: a sheep names its tools from the
registry's image, another looks at a page its own server serves and finds
nothing listening afterwards, and the container is gone after the idle
period. `--ring machine` repeats it inside `node:22-slim` and
`node:24-slim`; `--ring dog` gives Claude Code the sentence in a container
whose rig home and kennel the ring set up first; `--ring account` deploys
a station on the shepherd's account, plays the shepherd through the stile
with the real token and key, and walks the dog with nothing in the
environment.

### sheep

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
  terminal on it; `sheep new --detach` mints one and prints its id, and
  nothing else happens until something is asked of it. `sheep attach <id>`
  from any other machine opens the same session; two terminals can share
  one.
- The agent has pi's four tools. `read`, `write`, and `edit` work on a
  workspace stored in the cell. `bash` runs a shell interpreter inside the
  cell with the usual text tools. On a home with no container there are no
  interpreters, package managers, or `git`; the shell says so when asked.
  Programs arrive with a container, below.
- On a home with eyes, `look <path>` in the shell renders a workspace page
  through the platform's Chromium and prints what the page said: errors,
  console, the accessibility tree, and the PNG it wrote, which the sheep
  reads with `read`. With a container too, `look --serve '<command>'
  [<path>]` runs a dev server for the length of the look and stops it. The
  local home always has them; a station deployed before they existed says
  `eyes: no` in `sheep home` until `sheep home deploy` upgrades it.
- A turn survives the cell being evicted. Pi's recovery settles the
  interrupted step honestly and continues.
- `sheep export <id>` writes a pi SQLite session file that pi's own Node
  backend opens.

Design, acceptance journeys, and the phase-by-phase record with findings,
project by project: [`docs/projects/`](docs/projects/README.md).

#### Prerequisites

- Node 22 or newer, with corepack (ships with Node). The repo pins its pnpm
  version, so `corepack enable` is the only install.
- git.
- For a deployed home, a free [Cloudflare](https://dash.cloudflare.com/sign-up)
  account. No domain needed; the Free plan includes SQLite Durable Objects.
- An Anthropic API key.

#### Set up the repo

```sh
git clone https://github.com/dglazkov/sheep && cd sheep
corepack enable

# pi, pinned as a submodule, with its packages built
git submodule update --init
(cd vendor/pi && npm ci --ignore-scripts && for p in chord tui telemetry ai agent session-backends/sqlite-node protocol client server coding-agent; do (cd packages/$p && npm run build); done)

pnpm install
pnpm test        # the inner rings; the cell's run inside workerd, the Workers runtime
pnpm test --list # what each ring needs, and which files are in it
pnpm test --ci   # what CI runs: every ring but `home`, which is walked here
```

#### Secrets

Copy the example and fill in two values:

```sh
cp packages/cell/.dev.vars.example packages/cell/.dev.vars
```

- `SHEEP_TOKEN`: the bearer token every request to your home must carry. Any
  long random string (`openssl rand -hex 24`).
- `SHEEP_ANTHROPIC_API_KEY`: the key the cell uses to call the model.

`.dev.vars` is gitignored and is read only by the local dev servers. A
deployed home gets the same names through `wrangler secret put`, below.

#### Run a home locally

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

#### Deploy a home on Cloudflare

`sheep setup` at a terminal is the shepherd's way, and deploys through
the same code. From the installed command, with a Cloudflare API token
(Workers Scripts, Durable Objects, Containers, Workers Subdomain, Account
Settings read, Billing read) and the Anthropic key either kept in
`~/.sheep/credentials` or in the environment, which is how the rings and CI
give them, on an account with the Workers Paid plan:

```sh
CLOUDFLARE_API_TOKEN=... ANTHROPIC_API_KEY=... sheep home deploy [--name <worker>] [--subdomain <name>] [--faux]
sheep home delete                                          # lists what goes (sessions, pastures, the application), then ends it after its name is typed
```

With neither kept nor set it stops in two parts, the dog's line and the
shepherd's paragraph, and makes nothing; `--faux` sets the scripted model
as the station's var, the account ring's flag. The first deploy from a directory mints the Worker's name from
the directory's, records it in the kennel's config (`.sheep/config`, or
`~/.sheep/config` outside a kennel) with the address and the token it
generated, and sets the secrets through `wrangler secret put` on stdin;
run again, it redeploys the same Worker from the package it runs from and
keeps them. That is the upgrade: after `npm install -g` of a newer
release, `sheep home` says on stderr that the home is older, and `sheep
home deploy` moves its stamp with every session and pasture kept.
`--subdomain` registers a `workers.dev` subdomain when the account has
none.

A second machine joins a station the account already has through the
same `sheep setup`, and nothing is carried between the machines. Its
station step lists `new <name>` and then every Worker on the account
whose `GET /` answers `sheep`; choosing one is the join. The home's own
token is a Worker secret and cannot be read back, so the join turns that
around: writing the Worker's secrets proves this machine owns the
account. The stile generates a join token and puts it as `SHEEP_JOIN`
through `wrangler secret put`'s stdin, the account token in wrangler's
environment; asks `POST /join` with the join token as the bearer, a
second apart for up to a minute, until the new version answers; writes
the kennel's config with the address and the token it answered, and no
name, since the station is the other kennel's; and deletes `SHEEP_JOIN`
with `wrangler secret delete`, on every path out once the put succeeded.
The cell answers `{ token }` only to a bearer equal to a set `SHEEP_JOIN`,
and the same bare 404 as a missing route otherwise; it is the one route
the home's token does not guard. The account token never reaches the
home, and a secret put is a config-only version, so a turn running on the
station is undisturbed. `key` then asks nothing: the station holds its
own. `sheep home join`, station's piped way in, is withdrawn and says so.

```sh
npx github:dglazkov/sheep#release setup   # on the second machine: station → join <name>; then sheep ls, sheep attach <id>
```

#### Use it

```sh
sheep new [--name <name>] [-- <prompt>]   # a new session, pi's terminal attached
sheep new [--name <name>] --detach        # mint a session and print its id alone; idle until something is asked of it
sheep new --pasture <p> --secret <NAME> --detach < value.txt   # a secret for this sheep alone: one line of stdin per --secret
sheep -c [-- <prompt>]                    # attach to the newest session
sheep attach <id> [-- <prompt>]           # attach to a session; works from any machine with the config
sheep ls                                  # sessions at the home; the last column names each one's secrets, never a value
sheep rm <id>                             # end a session: turn aborted, container and browser released, rows gone; the pasture stays
sheep export <id> [file]                  # a pi SQLite session file
sheep --home <url> ...                    # a different home for one command
```

`sheep` here means `node packages/cli/bin/sheep.js`; put an alias in your
shell if you like. With a prompt after `--` the reply streams and the
command exits; without one you get pi's full terminal. Under `--json` the
held turn's entries stream as they land, one pi entry per line, tool calls
and results included, and the last assistant entry is still the last line,
so a program that reads only that line reads what it read before.

A pasture's secrets (`sheep pasture secret set <name> <KEY>`, the value on
stdin) are setup's environment for every sheep born into it, and its
`GIT_TOKEN` is the credential git pushes with. `sheep new --secret <NAME>`
gives one sheep a secret of its own: the values are stdin, one line per
`--secret` in the order named, never an argument, read before the mint, so
the command wants `--detach` or a prompt rather than pi's terminal. A
sheep's secret lies over its pasture's of the same name in setup, and its
`GIT_TOKEN` over the pasture's and the home's `PEN_GIT_TOKEN` when git
asks; neither kind is ever in the model's environment. A sheep born into
no pasture has no setup, so `GIT_TOKEN` is the one secret it can carry.
`sheep ls` names each sheep's secrets in its last column (`"secrets"` in
`--json`), never a value, and `sheep rm` ends them with the sheep.

On a home with a container, what a sheep's container leaves behind outlives
it in two places. A sheep's `~` is `/home/sheep`, `HOME` in the container
and in the cell's shell, kept as rows beside the workspace and synced
around every command under the same per-file cap, so a tool's login or
config (`git config --global`, `npm config set`, `~/.config/<tool>`) is
there in the next container. Not kept: `~/.cache`, `~/.npm`, and the
cache rule's names at any depth (`node_modules`, `.venv`, `dist`, `build`,
`__pycache__`). `ls /workspace` and `git status` never show `~`; `sheep
rm` ends it with the sheep.

A pasture's `setup.sh` runs once in each fresh container, before its
first command, and `/cache` is the pasture's: npm's global prefix in the
image, `/cache/bin` first on `PATH`. After a setup that exits 0 the
pasture keeps what setup left there, for the hash of that `setup.sh`, and
puts it back into every fresh container of its sheep before setup runs.
Guard the install, `command -v <tool> >/dev/null || npm install -g
<spec>`, and a warm setup is the put-back and a `command -v`. A changed
`setup.sh` finds no cache for it and runs cold once. What a turn installs
lands in `/cache` too and goes with the container, and a setup whose
environment held a sheep's own secret gets the cache put back and never
keeps one. `sheep pasture <name>` has a `cache:` line after `created:`
(its size and files, the `setup.sh` it is for, when and by which sheep it
was kept, or `none`), and a birth's entry in `sheep log` says whether
setup found it warm. Other ecosystems take `/cache` by their own prefix
flags.

A setup takes as long as it takes, and the dog is told what it is waiting
on rather than left to guess whether a sheep is slow or hung. A prompt
held by `sheep attach` says `setup running (1m 40s)` on stderr within ten
seconds of setup starting, another every half minute, and one line when it
ends (`setup ok (1m 52s)`, `setup failed (exit 1, 12.4 s)`); stdout is the
reply and nothing else. `sheep status <id>` from another terminal answers
in about a second with `setup: running (1m 40s)` — it reads the sheep's
row at the Directory, which answers while the cell is held by the very
setup being asked about, and gives the cell two seconds before saying what
the row alone knows. `sheep log <id>` carries a `[setup]` block where the
setup ran, with how it ended and the tail of what it printed, which on a
successful setup is output nothing else shows. A sheep no setup has ever
run for says `setup: none` and none of the rest. None of it reaches the
model: the transcript pi keeps, the context built from it, and the tool
result a failed setup returns are what they were.

#### A home with a container: pen

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

#### Layout

```
packages/cell/    the Worker: the cell, the directory, the workspace, the shell, the wire
packages/cli/     the sheep command; runs pi's client
packages/pen/     the container image and the agent that speaks the container protocol
vendor/pi/        pi, pinned to the sheep branch of dglazkov/pi; `git log upstream/main..sheep` is what sheep changes
docs/projects/    the design, the journeys, the phases and their findings
AGENTS.md         house rules for anyone, human or agent, working in this repo
```
