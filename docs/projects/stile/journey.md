---
status: partial
since: 2026-09-12
see: stile
note: "written 12 Sep 2026, the day bell closed, from the shepherd's issue #8 and a morning's brainstorm: the shepherd hands over a token once and reads only what is meant for them. The shepherd's calls: no verb for keeping a credential, the command that needs it asks for it the first time and keeps it, the way Claude CLI and `gh auth login` do; the local home is a developer's rig and leaves the consumer's surface, since the account is the cheap prerequisite and dropping it added workerd, a Chrome, and Docker to the machine; `sheep setup` at a terminal is the shepherd's whole part, one sitting, with a small screen, an ASCII sheep, and an explanation under any step when `?` is pressed; where the station lives, this directory or everywhere on the machine, is a question in that flow, the way `npx skills add` asks; a second machine is the same flow, choosing to join a station the account already has; and the whole of it proved hermetically, the flow driven through a virtual terminal against the fakes in the command and package rings, and the account ring playing the shepherd and counting what they had to do. Three phases. Phase 0 is CLOSED, 12 Sep 2026: the dog's half — the credentials file and its precedence, deploy and delete reading it, the stop in two parts, the key left when the home holds one, the midway message, and the dog's setup making no kennel where a home is reachable — green against the fakes, and walked on the shepherd's sheep-2: the release upgraded it with an empty environment, nothing asked, every session kept. Journey 1 step 6 is walked; journey 2 steps 1 to 6 hold against the fakes. Phase 1 is PART-DONE the same day: the stile, its screen over pi-tui, the words, the fence and its guard, and the README in two halves, green in the inner rings with both mutations falsified, and in the package, dog, and account rings on release b227c2d, where the account ring typed the real token and key through its own terminal; the shepherd walked it and found the screen bare and confusing, filed as issue #9 and kept out of this project. Phase 2 is CLOSED the same day: POST /join in the cell and the join in the stile, first by a Worker secret, which a probe showed restarts running turns (issue #10), then re-cut to a KV store per station at the shepherd's choice; walked from this laptop to sheep-2 with its Worker version unchanged, and held in the account ring with a turn across the join ending whole. Journeys 2, 3, and 4 hold; journey 1 waits on issue #9."
---

# Stile — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**,
pi sessions each in a cell; the person is the **shepherd**. Collar gave
the dog the command; station gave it a home in the cloud. Both were
walked by a dog whose shepherd already had every token in a file and
knew which shell to source it in. A shepherd meeting sheep today reads a
sentence written for their dog, telling them to change an environment
they cannot see, and then keeps that environment by hand for as long as
they have a station. **A stile is how a person gets over the fence
without opening the gate**: this project is the shepherd's one sitting
at a terminal, after which everything is the dog's.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, and the walks here are driven through a
terminal the ring owns, never a person's. [design.md](design.md) is the
mechanism and [phases.md](phases.md) the walk. If a journey and the
mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **The stile**: `sheep setup` at a terminal: the shepherd's flow, a
  checklist that fills in, asking for what it needs the first time and
  never again.
- **The credentials**: the two values only a person can make: the
  **account token**, a Cloudflare API token, and the **model key**, an
  Anthropic key. Kept in `~/.sheep/credentials`, mode 600.
- **The station**: station's: the deployed home, one Worker and its
  container application on the shepherd's account.
- **The developer's rig**: the local home, workerd under a kennel's
  `local/`, with Docker's container and a fetched Chrome. It exists for
  the rings and for a developer of sheep, and no longer for a shepherd.
- **The count**: what the shepherd had to do in a first run: values
  typed, a yes given, values asked twice, variables their dog needed.
- **The fakes**: the fake account API, the fake wrangler, and the fake
  station that `deploy.test.ts` already drives; the stile is driven
  against the same three.

## Journey 1: The first sitting

A person has a laptop with Node on it and a Cloudflare account. The
README says one command. They type it at their own terminal.

1. `npx github:dglazkov/sheep#release setup` prints a small sheep and a
   checklist of seven lines: `command`, `where`, `account`, `plan`,
   `station`, `key`, `next`. The first fills in at once: `sheep` is
   installed and on PATH. The cursor is on `where`: this directory, or
   everywhere on this machine; everywhere is the default and Enter takes
   it. Pressing `?` on any step opens a few lines under it saying what
   the step is for, where to get what it asks for, what it costs, and
   what sheep will and will not do with it; `?` again closes them.
2. `account` asks for the Cloudflare API token at a hidden prompt, with
   the permissions and the dashboard address in its explanation. Typed,
   the step becomes the account's name. `plan` says the Workers Paid
   plan and its price; on the plan already, it fills in; not on it, the
   step shows the plans page and re-checks the account when Enter is
   pressed.
3. `station` offers `new sheep`, the name minted for the kennel, and
   Enter takes it. The deploy's progress lines appear under the step as
   it runs, and the step becomes the address when the home answers.
4. `key` asks for the Anthropic key at a hidden prompt and puts it on the
   home as its secret. `next` prints the address, where the credentials
   are kept, and the one sentence to say to their agent.
5. In under five minutes and one sitting, the shepherd typed two values
   and one yes, and pressed Enter for two defaults. Nothing they typed
   appeared on screen, in a process's arguments, or in any file but the
   credentials file and the kennel's config.
6. The next morning their dog, in some other directory, runs `sheep
   setup` with no terminal. It installs the skill there, finds the
   station through `~/.sheep`, makes no kennel, asks nothing, and prints
   the report.

Acceptance criteria:

- The count for a first run is exactly: two values typed (the token and
  the key), one yes (the plan), no value asked twice, and no variable in
  the environment of anything the dog runs afterwards. The package ring
  plays the shepherd against a fake account not yet on the plan and
  prints that count; the account ring plays them on an account already on
  it, where there is no yes to give, and prints its count too.
- The banner and the checklist fit 80 by 24 with no explanation open;
  every explanation is at most eight lines and says the four things.
- Hidden input is never on screen: the ring reads the terminal's buffer
  after each keystroke and finds no byte of either value.
- `sheep setup` with no terminal, or with `--json`, asks nothing and is
  the dog's setup; the stile only ever starts at a terminal.
- `--explain` opens every explanation at the start, for a shepherd who
  wants to read before typing, and the whole of it is still under one
  screen per step.

## Journey 2: The dog, after

The shepherd never touches the station again. Their dog does everything.

1. The dog herds: `sheep new`, `sheep ls`, `sheep wait`, `sheep rm`, as
   every project before this one walked them. Nothing asks for a
   credential.
2. A release later, the dog runs `npm install -g
   github:dglazkov/sheep#release`; `sheep home` says the home is older.
   The dog runs `sheep home deploy`: it reads the kept account token,
   redeploys the Worker, puts the kept model key again, waits for the
   rollout, and reports the stamp moved. Every session and pasture
   survives. Nothing is asked of anyone, and no secret is on the dog's
   command line.
3. On a machine that keeps no model key (a second machine that joined,
   journey 3), the same `sheep home deploy` upgrades the Worker and
   leaves the model key the home already holds, and says so.
4. The credentials file is gone (a new laptop, a cleaned home
   directory). `sheep home deploy` from the dog exits 2. The first line
   is the dog's, `sheep: …`, and says nothing was made. Under it is a
   paragraph addressed to the shepherd, in the second person, naming
   the one command to type at their own terminal: `sheep setup`. The
   dog relays that paragraph and does nothing else. `--json` carries
   `needs: ["account"]` and the paragraph. The shepherd runs `sheep
   setup`; only `account` asks; the station is found and nothing is
   redeployed.
5. `sheep home delete` is the shepherd's, as station made it: at their
   terminal, the listing, the name typed, and the account token read
   from what was kept. From the dog it is the same exit 2 with the
   paragraph. `sheep home` lists which credentials are kept and where,
   never a value.
6. A deploy that fails after wrangler uploaded the Worker but before the
   secrets or the container says which of the five steps are done, that
   the new Worker is already live, and that running `sheep home deploy`
   again finishes it.

Acceptance criteria:

- Every exit 2 that needs a person has the two parts, the dog's line
  and the shepherd's paragraph, and the `--json` form has `needs`; a
  guard enumerates them from the one class that carries them.
- No user-facing string of the command says `export`, names a shell, or
  is written in the dog's voice for the shepherd to decode; the guard
  reads `--help`, the guide, the skill, and the README's first half.
- `ps`, polled through the account ring's walk, sees neither credential
  in any argument, as station's walk already asserts for the secrets.
- The environment still overrides: `CLOUDFLARE_API_TOKEN` and
  `ANTHROPIC_API_KEY` set take precedence over the kept values, which
  is what the rings and CI use, and nothing requires them.

## Journey 3: The second laptop

The shepherd opens a second laptop.

1. `npx github:dglazkov/sheep#release setup`. `command` fills; `where`
   is Enter. `account` asks for the token, since this machine has never
   held one, and keeps it. `plan` fills. `station` lists what the
   account already has: `new sheep-2`, and `join sheep`, the station
   from the first laptop, found because it answers as a sheep home.
   They choose join.
2. The join is invisible: a join token is written to the station's own
   store with the account token, the home is asked for its own token
   with it, the answer is kept in the config, and the join token is
   deleted.
   `key` says the station holds its own and asks nothing. `next` prints
   the address.
3. `sheep ls` lists the sheep minted from the first laptop. `sheep
   attach <id>` at this terminal is pi's terminal on one of them, as
   station's journey 2.
4. `sheep home join` is gone: typing it says setup does this, and
   `--help` does not list it.

Acceptance criteria:

- The account token never reaches the home: the fake station's request
  log shows the join token alone, and never the account token or the
  home's own.
- After the join the station's store holds no join token, which the ring
  reads from the account.
- A turn running on the station across the join finishes, and its
  transcript is whole: the join changes no Worker version.
- The second machine is a container in the account ring, as station's
  journey 2 made it, with the ring playing the shepherd at its terminal.

## Journey 4: The developer's rig

A developer of sheep, in this checkout, still has the local home; a
shepherd never hears of it.

1. `pnpm test` runs the three inner rings as before; the home ring
   starts a real `wrangler dev`. `node packages/cli/bin/sheep.js home
   local` starts a home under the kennel, with Docker's container when
   Docker answers, and the conductor's walks with a real model run
   there, as they did for fold, bleat, and bell.
2. `sheep --help`, `sheep --agent-help`, `SKILL.md`, and the README
   above its developer heading name none of it: no `home local`, `home
   stop`, `--faux`, `--no-container`, `.dev.vars`, workerd, Docker, or
   Chrome. The README's developer half does, and says what the rig is
   for.
3. The package ring drives the stile through its own terminal against
   the fakes on every release, then walks the herd on the rig as it
   does today. The dog ring sets up the rig's home and a kennel before
   Claude Code runs, so the dog it tests is the dog of journey 2 and is
   never expected to start a home; its transcript names no verb from
   the rig.
4. The account ring plays the shepherd: the stile through its terminal
   with the real token and key typed in, then every variable stripped
   from the environment before the dog's walk begins.

Acceptance criteria:

- The guard test names the words and the files, and the list is the
  design's.
- The rings are still one script with one walk; the ring chooses the
  environment, never the steps, and the terminal it drives the stile
  through is the same code in every ring.
- The checkout ring and the command ring prove the flow, the screen,
  and the hidden input without an account, a person, or a real
  terminal; one test under a real pseudo-terminal proves the detection.
