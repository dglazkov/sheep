# Stile — the design

**12 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **the shepherd's part is one sitting at their
own terminal, in their own words, and everything after it is the dog's.
The command that needs a credential asks for it the first time, keeps
it, and never asks again; every message that needs a person is
addressed to that person; and the local home is a developer's rig, not
a shepherd's first look.**

The shepherd's issue #8 states the problem and the dog's account under
it counts the cost of one redeploy. Three values cross a shepherd's
hands. The home's own token is generated at deploy, kept in the kennel's
config, and reused by every command after; nobody types it twice. The
Cloudflare token is read from the environment by deploy and delete,
kept nowhere, and asked for every time. The model key is read from the
environment by deploy and by the local home, put on the home as a
secret, and asked for again on every redeploy though the home still
holds it. The environment is the wrong channel for the dog era: each of
the dog's shell calls is fresh, the shepherd cannot see the dog's shell,
and a `!` export dies with the session. So the shepherd invents a place
outside sheep, and in this repo that place is two files with mismatched
variable names and a `SHEEP_TOKEN` line that silently overrides the
config when sourced whole.

The first draft of this design added a verb for keeping a credential.
The shepherd's answer was that nobody wants a word for "give sheep the
thing it just asked for": Claude CLI, `gh auth login`, and `wrangler
login` all ask at first run, keep, and never ask again, and the keeping
is invisible. The second draft asked why there is a local home at all,
and the honest answer is in the table below: the account is the cheap
prerequisite, and dropping it makes the machine's heavier. So the
project has three parts that turn out to be one: the shepherd's flow,
the dog's commands reading what it kept, and the fence between what a
shepherd sees and what a developer of sheep keeps.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the stile | `sheep setup` at a terminal: the shepherd's flow | `packages/cli/src/stile/` |
| the flow | the steps as a machine: ask, say, act, with scripted or terminal answers | `stile/flow.ts` |
| the screen | pi-tui components: the banner, the checklist, a prompt, an explanation | `stile/screen.ts` |
| the words | each step's explanation: what, where, cost, what sheep does with it | `stile/words.ts` |
| the credentials | the account token and the model key, kept once per machine | `~/.sheep/credentials`, mode 600, JSON |
| a stop | an exit 2 that needs a person: the dog's line and the shepherd's paragraph | `Stop` in `deploy.ts`, printed by `cli.ts` |
| the fence | what a shepherd's surface may name, and a guard that reads it | `packages/cli/test/surface.test.ts` |
| the developer's rig | the local home, `sheep home local`, from the checkout and in the rings | `local.ts`, the README's developer half |
| the join | a machine proving it owns the account by writing to the station's KV store, and the home answering with its token | `POST /join` in the cell; the `JOIN` namespace; the station step |
| the terminal seam | the flow driven through pipes as if through a terminal of a given size | `SHEEP_TEST_TERMINAL=<cols>x<rows>` |
| the count | values typed, a yes, values asked twice, variables the dog needed | the account ring's `t1` line |

## What exists, exactly

- **Two credentials from the environment, one kept.** `deploy()` reads
  `CLOUDFLARE_API_TOKEN` and `ANTHROPIC_API_KEY` and throws a `Refusal`
  with `needs()` when either is missing; `deleteStation()` reads the
  token the same way. `SHEEP_TOKEN` is generated once and written to the
  kennel's config, mode 600, and a redeploy reuses it (station phase 1).
  The model key is put with `wrangler secret put` on every deploy,
  whether or not it changed.
- **The sentence is in the dog's voice.** `ASK_TOKEN` ends "export it as
  CLOUDFLARE_API_TOKEN in the shell I run in"; `ASK_KEY` the same. The
  skill and the guide tell the dog to ask the shepherd to `export`. The
  shepherd reads that in the dog's tool output, or pasted, and it names
  a shell they do not have.
- **The kennel already keeps things per directory and per machine.**
  `.sheep/` is found by walking up, `~/.sheep` is the fallback; the
  config and the local home are the kennel's, wrangler is the machine's
  under `~/.sheep/tools` (kennel phase 0). `sheep setup` makes a kennel
  in the working directory unconditionally, which is why kennel's Open
  roster notes that setup in a subdirectory makes a shadowing second
  one.
- **The token already travels on stdin, never argv.** `sheep home join`
  reads it piped; `sheep pasture secret set` and `sheep new --secret`
  the same; `sheep home delete` reads the name typed at a terminal or
  one line of stdin without one. The rule that token-bearing commands
  are the shepherd's to type is already the repo's.
- **pi-tui is in the bundle.** `@earendil-works/pi-tui` ships inside
  `dist/pi-client.mjs` for attach mode. It has a `Terminal` interface
  with `ProcessTerminal` over stdin and stdout, a main-screen renderer
  that keeps scrollback, `Text`, `Input`, and `SelectList` components,
  and in its tests a hundred-line `VirtualTerminal` over
  `@xterm/headless`, which is its dependency. A screen can be drawn and
  read back without a terminal.
- **The fakes drive deploy end to end.** `deploy.test.ts` runs the built
  command against `SHEEP_TEST_ACCOUNT_API` (a fake account with plans,
  subdomains, Workers, and applications), `SHEEP_TEST_WRANGLER` (a
  script that logs argv and stdin), and `SHEEP_TEST_STATION_URL` (a fake
  home that answers `/` and `/home`). Every refusal and every step of
  deploy and delete is already proved there.
- **The rings own their environment.** The package ring makes a fresh
  prefix, cache, and `HOME`; the account ring deploys a station named
  for the commit, walks it as a1 to a8 and the project steps after,
  and deletes it; `ps` is polled through the walk for any secret in an
  argument. A second machine is a container (a7).
- **The home checks one bearer.** `env.SHEEP_TOKEN` against the
  `authorization` header or a `token` query, 401 otherwise; `GET /`
  answers `sheep` to anyone, which is what `whoAnswers` reads.

## Why the local home leaves the shepherd's surface

What each path needs, from the release manifest and the code that
fetches tools:

| Path | On the machine | Elsewhere |
| --- | --- | --- |
| a station | Node 22.19+, npm; wrangler fetched once into `~/.sheep/tools` (236 MB) for four calls | a Cloudflare account on Workers Paid; an Anthropic key |
| the local home, no container | Node, npm, the same wrangler and its workerd, a Chrome on the first look | an Anthropic key |
| the local home, whole | all of that and Docker, pulling the pen image under emulation on an arm64 laptop | an Anthropic key |
| developing sheep | pnpm, the checkout's wrangler, Docker, the fake container, the rings | an account, for the account ring |

The local home was collar's first look with no account behind it, and
station's journey 6 made it the whole product when Docker is present.
But the account is the cheap prerequisite. Dropping it removes nothing
from the machine and adds workerd, a Chrome, and Docker, for a home
that dies with the laptop and, without Docker, a sheep that cannot
clone or build, which station already called a writer and not a
worker. It was only ever light for us, because we had all of it
installed. What it still is, and stays, is the rings' substrate and the
conductor's rig for walking a journey with a real model without
spending the account. `gh` has no local because GitHub cannot be run
on a laptop; sheep's home can, and that was the whole temptation.

So the fence: a **shepherd** sees `sheep setup`, the herd verbs, `sheep
home`, `sheep home deploy` as the upgrade, and `sheep home delete`. A
**developer** has the checkout, `sheep home local` and `home stop`,
`--faux`, `--no-container`, `.dev.vars`, and the rings. The code of the
rig stays in the package, because the package ring runs the released
bundle's Worker in it and the dog ring needs a home with no account;
its words go. Nothing in `--help`, the guide, the skill, or the README
above its developer heading names it, and a guard reads all four.
Wrangler stays for now as the one heavy fetch on a shepherd's machine;
the four calls it makes could be account API calls, and that is its own
short project.

## The stile

`sheep setup` at a terminal is the shepherd's flow. Without a terminal,
or with `--json`, it is the dog's setup: the skill here, a kennel when
none is reachable, the report, and nothing asked. That is how one verb
serves two callers, and it is `gh`'s rule too: a tty gets the login, a
pipe gets the report.

**The screen.** pi-tui's main-screen renderer, so the flow scrolls like
a checklist filling in and leaves its lines in the scrollback. A small
sheep, then seven steps, one line each:

```
      __  _
   ,-'  `' \_          sheep
  (  o   ) . _)        a home for coding agents that herd coding agents
   `-.__.-'
     ||  ||

  ✓ command   sheep 601b4df, installed
  › where     everywhere on this machine  ·  this directory     ? explain
    account
    plan
    station
    key
    next
```

The art is a draft and is the shepherd's to change. The cursor step has
its prompt and nothing else. `?` opens the step's words under it, four
things in at most eight lines: what this is for, where to get it, what
it costs, and what sheep will and will not do with it. `?` again closes
them. `--explain` opens every step's words as it is reached. A done step
is one line: what it settled on. The whole fits 80 by 24 with nothing
open, and narrower terminals wrap the words, never the checklist.

**The steps.**

1. **command.** Setup's first thing as collar built it: `sheep` on PATH,
   or installed with `npm install -g` and the version. Nothing asked.
2. **where.** `npx skills add`'s question: this directory or everywhere
   on this machine. Everywhere is the default. It decides where the
   kennel is: `<cwd>/.sheep`, gitignored, with its own station; or
   nothing here, and the config in `~/.sheep`, which every directory
   without a kennel already falls through to. The skill follows the
   answer, `.agents/skills/sheep` here or under `~/.agents/skills`,
   with the `.claude/skills` doorway beside it. A directory that is
   already in a kennel says so, and the question is whether to use it.
3. **account.** The Cloudflare API token, hidden input, one line. The
   words name the permissions and the dashboard address. Kept, then
   verified the way deploy verifies it: whose token, and the step
   becomes the account's name. A token the account rejects is asked
   again with the reason. Kept already and still accepted: the step
   fills in and asks nothing.
4. **plan.** Workers Paid, its price, and what container minutes cost.
   On the plan: filled in. Not: the plans page in the words, and Enter
   re-checks the account, so the shepherd goes to the dashboard, turns
   it on, and comes back to the same screen.
5. **station.** `new <name>`, minted for the kennel as kennel's rule
   says, first; then every station the account already has, found as
   the Workers whose `GET /` answers `sheep`. `--name` sets the new
   one's name, as deploy takes it. New runs `deploy()` with its
   progress lines under the step and the step becoming the address
   when the home answers. Join is the section below. A kennel whose
   config already names a station that still answers: filled in,
   nothing deployed.
6. **key.** The Anthropic key, hidden input. Kept, then put on the home
   as its secret through `wrangler secret put`'s stdin, as deploy does.
   Kept already: put without asking. On a joined station: the station
   holds its own, and the step says so and asks nothing.
7. **next.** The address, where the credentials and the config are, and
   the one sentence to say to their agent.

Every value is read at a hidden prompt or, when stdin is not a
terminal and the terminal seam is set, from the pipe. Never an
argument. Nothing the flow keeps is ever written to the screen, to a
log, or to `--json`.

**The flow is a machine and the screen is a renderer.** `flow.ts` is
the steps with three callbacks: `ask(step, prompt, hidden)`,
`say(step, line)`, and `choose(step, options)`. The screen implements
them with pi-tui; a scripted answerer implements them for tests; the
dog's non-tty setup is the machine with `ask` refusing. What the steps
do between callbacks is the code that exists: `setupCli`,
`installSkill`, `makeKennel`, `AccountApi`, `deploy()`. The stile adds
no second deploy path.

## What is kept, and where

`~/.sheep/credentials` is JSON with two keys, `cloudflare` and
`anthropic`, mode 600, written by the stile and read by everything
that needs either. The machine's, like `~/.sheep/tools`, because the
account and the key are the shepherd's and a station is a kennel's: a
second station on the same machine asks for neither. A kennel's own
`.sheep/credentials` shadows it, for the rare second account, and the
stile never writes one. `CLOUDFLARE_API_TOKEN` and `ANTHROPIC_API_KEY`
in the environment override both, which is what the rings and CI use;
nothing requires them. The precedence is the config's: file, then
environment, and no argument.

`sheep home` prints one line naming which are kept and where. `sheep
home delete` clears the config, as station made it, and leaves the
credentials, which are the machine's and not the station's.

## The dog, after

`deploy()` and `deleteStation()` read the credentials in place of the
environment. A redeploy puts the model key when one is kept, since the
put is idempotent and a rotated key is the shepherd running `sheep
setup` again, where only `key` asks. When none is kept, the Worker's
secret names are asked of the account API, the key's presence among
them is required, and the redeploy leaves it and says so; a Worker with
no key and no key kept is a stop.

**A stop** is the refusal that needs a person: a `Stop` class carrying
`needs` (`account`, `key`, `terminal`) and the shepherd's paragraph.
`cli.ts` prints it in two parts:

```
sheep: sheep home deploy needs the account token, and nothing on this machine keeps one; nothing was made
for the shepherd: sheep needs your Cloudflare account to upgrade the home. At your own terminal, run
  sheep setup
once. It asks for what it needs and keeps it on this machine, and nothing your agent runs will ask again.
```

The first line is the dog's, in the third person. The paragraph is the
shepherd's, in the second person, and names one command to type; the
guide tells the dog to relay it verbatim and do nothing else. `--json`
is `{ refused, needs, shepherd }` on stdout, exit 2. `sheep home delete`
from a non-terminal with nothing on stdin is a stop with `terminal`,
since the name typed is the shepherd's act. The guard enumerates every
`Stop` the command can throw and asserts the two parts and the shape.

**The midway message.** A deploy that fails after wrangler uploaded the
Worker throws an `Error` today whose text is wrangler's tail. It gains
a first line saying which of the five steps are done, that the new
Worker is live and the container and the secrets are not, and that
running `sheep home deploy` again finishes it, which the code's comment
already knew.

**The dog's setup makes a kennel only when no home is reachable.** A
non-tty `sheep setup` installs the skill in the working directory, then
asks the walk-up for a config that names a home. Found, it reports that
home and makes nothing, since a kennel here would shadow it with an
empty one; the station a shepherd put everywhere is what the dog in
any directory should find. Not found, it makes the kennel as today. The
same rule closes kennel's note about a subdirectory shadowing its
kennel.

## The second machine

The station step on a machine that holds the account token lists the
account's sheep homes. Joining one needs the home's own token, which is
a wrangler secret and cannot be read back. The mechanism turns that
around: writing to the station's own store through the account API is
the proof that this machine owns the account, and the home answers that
proof with its token.

**Why a store and not a secret (12 September 2026).** The first cut put
the join token on the Worker as a secret, on the belief that a secret
put is config-only and leaves running turns alone. A probe on a scratch
station proved otherwise: a secret put or delete is a new Worker
version, the version restarts the Durable Objects holding turns, and a
180 s turn restarted with empty entries and a lane stuck running (issue
#10). A KV write changes no version. The shepherd chose the store.

**The store.** Every station has a KV namespace titled `<worker>-join`,
bound to its Worker as `JOIN`. `sheep home deploy` makes it through the
account API when the account has none of that title, and writes its id
into the derived config's `pen` environment; `sheep home delete` deletes
it after the Worker. A station deployed before this has no binding, and
its first `sheep home deploy` gives it one. The token's permissions gain
`Workers KV Storage (edit)`.

1. The stile generates a join token and writes the key
   `join:<sha256 of the token>` with `expiration_ttl` 120 to the
   station's namespace through the account API, the account token in
   the request's header. No wrangler call, no Worker version.
2. It asks `POST /join` with the join token as the bearer, polling up to
   ninety seconds, since a KV write can take up to a minute to reach
   the edge that serves the Worker.
3. The cell hashes the bearer, reads that key from `env.JOIN`, and when
   it is there deletes it and answers `{ token: env.SHEEP_TOKEN }`; a
   missing key, a missing binding, or a missing bearer is the bare 404.
   The route is before the bearer check and is the one route the home's
   token does not guard. The raw join token is never stored anywhere.
4. The stile keeps the answer in the config with the address and no
   name, and deletes the key through the account API on every path out
   once it was written. The TTL is the backstop: a key left by a killed
   process expires in two minutes, and no process holds its token.

The account token never reaches the home; the home's token travels once,
over HTTPS, to a machine that proved it owns the account. The join
changes no Worker version, so a turn running on the station is
undisturbed, which the account ring confirms. `sheep home join` and
`join.ts` are withdrawn: the verb answers with a sentence naming `sheep
setup`.

## Testing it hermetically

The seams exist and the ladder is the repo's. Every ring drives the
stile through a terminal it owns.

- **The terminal seam.** `SHEEP_TEST_TERMINAL=<cols>x<rows>` makes the
  flow treat its pipes as a terminal of that size: pi-tui's renderer
  writes to stdout, keys are read from stdin, and hidden input is
  hidden. It replaces the pseudo-terminal, not the flow, the way
  `SHEEP_TEST_WRANGLER` replaces wrangler and not deploy. Stripped by
  every ring that does not set it.
- **The screen harness, command ring.** `packages/cli/test/screen.ts`:
  the built command spawned with the seam and the fakes, its stdout fed
  into `@xterm/headless` (a devDependency of the CLI package), keys
  written to its stdin, and the terminal's buffer read back as text
  after each. `stile.test.ts` drives every journey 1 and 3 case through
  it: the order of steps, what is asked when a credential is kept,
  `?` opening and closing, the buffer never holding a byte of either
  value while it is typed, the file written with mode 600, a rejected
  token asked again, a Free account held at `plan` until the fake
  account is put on it, the join's put, poll, and delete in the
  wrangler log, and frame snapshots at each step.
- **One real pseudo-terminal, command ring.** `stile-tty.test.ts` runs
  the command under `script`, which `node:22-slim` and macOS both have,
  skipped with a line where it is absent. It proves the tty detection
  and the hidden prompt as a process, and nothing the harness already
  proves.
- **The fence, checkout ring.** `surface.test.ts` reads `USAGE`, the
  guide, the skill, and the README above its developer heading, and
  asserts none of the rig's words; enumerates every `Stop` and asserts
  its two parts and its `--json` shape; and asserts no user-facing
  string says `export` or names a shell.
- **The cell, checkout ring.** `POST /join` in workerd with a KV binding:
  answers the token to a bearer whose hash is a key, deletes the key so a
  second ask is 404, 404 to anything else and to a home with no binding,
  and `GET /home` still 401 without the home's token.
- **The package ring.** A step `t0` before the walk: the released
  command's stile through the seam against the fakes, started from the
  checkout: the frames, the count, the credentials file, the config
  where `where` said. Then the herd on the developer's rig as today,
  since the fake station answers `/` and `/home` and nothing more.
- **The dog ring.** The ring sets up the rig's home and a kennel under
  the container's `HOME` before Claude Code runs; the dog's `sheep
  setup` finds it. The sentence is collar's, unchanged. The transcript
  must name no verb from the rig, and the ring reads it.
- **The account ring.** `t1`, a second, short station: the stile
  through the seam with the real token and the real key typed in,
  `--name sheep-hermetic-<sha>-t`, then `CLOUDFLARE_API_TOKEN` and
  `ANTHROPIC_API_KEY` deleted from the environment, then `sheep new
  --detach`, `sheep home deploy` as the upgrade with nothing asked, and
  `sheep home delete` with the name on stdin. The line prints the
  count. `t2` in the second machine's container: the stile joining the
  walk's station, a turn running across the join ending whole, the
  station's namespace read for no join key afterwards, and `sheep home
  delete` leaving no `<worker>-join` namespace. The upgrade step already there
  (`up`) runs with the environment stripped and the credentials
  written by the ring, which is what the older release's setup would
  have kept.

## What this does not do, on purpose

- **Wrangler replaced by the account API.** The Worker bundle is
  prebuilt and the CLI already speaks the API for accounts, plans,
  subdomains, and applications; upload, secrets, and delete could be
  four more calls and the machine's prerequisite would be Node alone.
  Its own project.
- **The OS keychain.** A 600 file is what wrangler and `gh` do, and the
  rings' rule that `HOME` is the whole override holds. A keychain would
  break that for a gain the file already has.
- **A station deployed from a checkout is unstamped forever**, which the
  dog's account under issue #8 found: nobody can tell what it runs.
  The fix is to stamp or refuse, and it is a finding for a later
  project.
- **A per-machine token on the home.** The join hands out the home's
  one token; revoking a machine means rotating it everywhere. Tokens
  per machine, listed and revoked, is a project when there is a second
  shepherd.
- **A rotation verb.** Running `sheep setup` again and answering the
  one step that asks is the rotation.
- **`sheep home` as a screen.** The stile is the one screen; the dog's
  verbs stay lines.
- **Windows.** The pseudo-terminal test and `script` are macOS and
  Linux; Windows is a finding when a walk meets it.
