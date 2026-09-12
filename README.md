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
Nothing is on npm. The first five minutes, as the dog walks them:

1. With Claude Code (or another coding agent) open in a repository, say:
   "Install sheep from github.com/dglazkov/sheep and try it out." The dog
   runs

   ```sh
   npx github:dglazkov/sheep#release setup
   ```

   which puts `sheep` on PATH (`npm install -g github:dglazkov/sheep#release`),
   installs the skill into the current directory under `.agents/skills/sheep`
   with a `.claude/skills/sheep` doorway, makes this directory's kennel
   `.sheep/` (adding it to the `.gitignore` here when you are in a git work
   tree), reports that no home is configured, and prints the one sentence to
   run next. It is idempotent; `--json` gives the same report to a program.

2. `sheep home local` starts a home on the machine, under the kennel's
   `local/`, and writes the kennel's `config`. It says the home has no model
   key; the dog asks you for an Anthropic key, which you export as
   `ANTHROPIC_API_KEY`, and `sheep home local` again reports the key held,
   and where. No account is needed. (`--faux` runs a scripted model instead,
   for a look at the plumbing without a key.)

   With Docker Desktop (or the docker engine) on the machine, the same
   command gives the home a container beside every cell, pulled from the
   registry as the release named it: the sheep have `git`, `node`, `pnpm`,
   and `python`, and can clone, build, test, and push. Without Docker the
   report says so in one sentence, and the sheep read, write, and edit.
   `--no-container` asks for none. `sheep home` says which the home has.

   The home has **eyes**: a sheep can `look <path>` at a page it wrote, in a
   real Chromium, and read the picture; the report (errors, console, the
   accessibility tree) comes back in its transcript, and you read it in
   `sheep log`. The first look on a machine fetches a Chrome into the
   wrangler cache, which `sheep home local` says. A station deployed before
   this release has none until `sheep home deploy` upgrades it; `sheep home`
   prints `eyes: yes` or `no`.

   With a container as well as eyes, a sheep can look at its own dev server:
   `look --serve 'npx vite --port $PORT --strictPort' /` runs that command in
   the container with `PORT` set, renders the page its port serves, and stops
   it. A server lives for one look and no longer, which is why nothing is left
   running behind a sheep. The recipe for a frontend app is a skill this
   repository ships, [`docs/projects/serve/skills/frontend/SKILL.md`](docs/projects/serve/skills/frontend/SKILL.md);
   `sheep pasture put <name> skills/frontend/SKILL.md <that file>` puts it in
   a pasture and every sheep born there reads it.

   The **kennel** is `.sheep/` at or above the working directory, found the
   way git finds `.git`, and `~/.sheep` when there is none: this directory's
   config, its token, and its own local home. Open a dog in each of several
   directories and each is its own — its own sheep, its own port, its own
   home to start and stop — with nothing shared but the command and the
   runtime under `~/.sheep/tools`. `cd` is the switch; there is no variable
   to set. `sheep config` and `sheep home` print which kennel they found.

3. `sheep new -- "What can you see in the workspace?"` mints a sheep and
   streams its reply. `sheep ls` lists it; `sheep status <id>` and
   `sheep log <id>` say what it is doing and what it did. `sheep new
   --detach` with no prompt mints a sheep and prints its id alone, for a
   task the dog has not composed yet: the sheep is idle and costs nothing
   until something is asked of it, and one born into a pasture with a
   repository is cloned and set up at its first prompt, not at the mint.

4. `sheep attach <id> -- "And now?"` continues it. At your own terminal,
   `sheep attach <id>` opens pi's interactive terminal on the same sheep,
   from the installed bundle, with no checkout of pi anywhere.

5. `sheep --agent-help` is the guide the dog reads: the verbs, the home,
   what needs a person, in the words this build ships. The skill says to
   read it, and little else.

6. The next morning the home is not running. `sheep ls` starts it and lists
   yesterday's sheep. `sheep home stop` stops it; `sheep home` says so.

7. `sheep export <id>` writes a pi session file. `sheep --version` prints
   the build stamp: the commit on `main` the release was built from, and
   when. Upgrading is `npm install -g github:dglazkov/sheep#release` again.

Every release is proved before it is pushed by installing it the way you
do, into a fresh prefix, cache, and `HOME`, and walking the steps above
with the scripted model: `pnpm hermetic --ring package`. The walk includes
a look: a sheep writes a page with a bug, looks at it, reads the picture,
and clicks, the Chrome fetched into that fresh `HOME`. With `--docker`,
on a machine with Docker, the walk's home has a container: a sheep names
its tools from the registry's image, another looks at a page its own
server serves and finds nothing listening afterwards, and the container is
gone after the idle period.

## Developing sheep

Everything below is the checkout: `sheep` here means
`node packages/cli/bin/sheep.js`, against a home run from source.

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

From the installed command, with a Cloudflare API token (Workers Scripts,
Durable Objects, Containers, Workers Subdomain, Account Settings read,
Billing read) and the Anthropic key in the shell, on an account with the
Workers Paid plan:

```sh
export CLOUDFLARE_API_TOKEN=...  ANTHROPIC_API_KEY=...
sheep home deploy [--name <worker>] [--subdomain <name>]   # the pen home, a container beside every cell; prints the address
sheep home delete                                          # lists what goes (sessions, pastures, the application), then ends it after its name is typed
```

Without the two variables it prints what it needs and costs, and makes
nothing. The first deploy from a directory mints the Worker's name from
the directory's, records it in the kennel's config (`.sheep/config`, or
`~/.sheep/config` outside a kennel) with the address and the token it
generated, and sets the secrets through `wrangler secret put` on stdin;
run again, it redeploys the same Worker from the package it runs from and
keeps them. That is the upgrade: after `npm install -g` of a newer
release, `sheep home` says on stderr that the home is older, and `sheep
home deploy` moves its stamp with every session and pasture kept.
`--subdomain` registers a `workers.dev` subdomain when the account has
none.

A second machine joins the same station with the token on stdin, never as
an argument: pipe it from the first machine's `.sheep/config` or a
password manager. It writes this kennel's config (address and token, no
name: the station is the other kennel's), and prints both build stamps and
the pen image the station runs, by digest.

```sh
npx github:dglazkov/sheep#release setup
sheep home join https://<worker>.<subdomain>.workers.dev < token.txt   # then sheep ls, sheep attach <id>
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
