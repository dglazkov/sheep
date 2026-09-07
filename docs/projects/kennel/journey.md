---
status: done
since: 2026-09-07
see: kennel
note: "written 7 Sep 2026, the evening station was planned, from a conversation with the shepherd: a dog in each of a number of directories, wholly independent of one another. The shepherd's calls: the config is found from the directory, the way git finds `.git`, and `~/.sheep` is the fallback; the station's name is minted at the first deploy and recorded, the directory's basename and a counter, never a hash; named homes stay declined, the directory is the switch. The project lands before station phase 1, which takes its name rule. Kennel phase 0 closed the same afternoon: `.sheep/` found by walking up, setup making it with its ignore entry, two homes in two directories in the package ring and on this laptop with a real model; journeys 1, 2, and 4 walked. Kennel phase 1 closed an hour later: `mintName` proved pure, `name` read and kept. The project is done; journey 3 walked on the account by station phase 1 the same night, `sheep-2` minted from `~/.sheep`."
---

# Kennel — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. Collar made a directory a dog's, with
the skill in it, and left everything else the dog holds on the
machine: one config, one local home, one station. A shepherd who opens
a dog in each of several directories wants each to be its own: its own
sheep, its own token, its own home to start, stop, deploy, and delete,
with nothing shared but the command. A **kennel** is the directory that
holds those things, `.sheep/`, found from wherever the dog is standing.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, with nothing read from the machine's
`~/.sheep`. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **The kennel**: `.sheep/` at or above the working directory, or
  `~/.sheep` when there is none: the config and the local home.
- **The name**: what a station deployed from a kennel is called on the
  account, minted once from the directory's name and recorded.
- **The package ring**: collar's hermetic install and walk, from a
  fresh prefix, cache, and `HOME`.

## Journey 1: Two dogs, two homes

The shepherd has two projects, `~/code/blog` and `~/code/pi`, and opens
a dog in each.

1. In `blog`, the dog runs `npx github:dglazkov/sheep#release setup`.
   The report names the skill installed, `.sheep/` made, and the home:
   none configured. Then `sheep home local`: a home under
   `blog/.sheep/local`, the config written there, the port it got.
   `sheep new -- "hello"` mints a sheep.
2. In `pi`, the other dog runs the same three commands. Its home is
   under `pi/.sheep/local`, on a different port, with a different
   token. `sheep ls` there lists one sheep, its own. `sheep ls` in
   `blog` lists one sheep, its own.
3. The `blog` dog works in `blog/posts/2026`. `sheep ls` there finds
   `blog`'s home. `sheep home` says which kennel, which home, and that
   it is running.
4. The `pi` dog runs `sheep home stop`. `blog`'s home is still running,
   and its dog's next `sheep ls` says nothing about `pi`.
5. The shepherd, at a terminal in `/tmp`, runs `sheep home`. It names
   `~/.sheep`, the fallback, and whatever home a dog once put there, or
   none.

Acceptance criteria:

- `sheep config` and `sheep home` print the kennel's path, and the
  package ring asserts each dog's is its own directory's.
- The two homes have different ports and different tokens, and each
  `sheep ls` lists exactly the sheep minted from its kennel.
- Wrangler is fetched once, into `~/.sheep/tools`, and the second home
  reports it already there.
- Nothing under the ring's `HOME/.sheep` exists but `tools/`.

## Journey 2: The token stays out of the repository

`blog` is a git repository.

1. After setup, `git status` in `blog` shows `.gitignore` changed by
   one line, `.sheep/`, and nothing under `.sheep/` as untracked.
   `git status` after `sheep home local` shows the same: the token and
   the key are under `.sheep/` and git does not see them.
2. A directory that is not in a git work tree gets no `.gitignore`,
   and setup's report says so in the same line.
3. The shepherd, elsewhere, had once committed `.sheep/config`. `sheep
   setup` and `sheep home` there say in one line that `.sheep` is
   tracked and a token is in the repository. They do not fix it.

Acceptance criteria:

- Setup is still idempotent: a second run adds no second line and
  reports the entry already there.
- The tracked warning is one line, on stderr, and the command goes on.

## Journey 3: A station named for its kennel

The shepherd wants `blog`'s home in the cloud. This is station's journey
1, from a kennel; the walk is station phase 1's.

1. `sheep home deploy` in `blog` deploys a Worker named `blog`, and
   writes `name` into `blog/.sheep/config` beside the address.
2. A second checkout of the same repository at `~/work/blog` gets its
   own dog, its own kennel, and, on deploy, `blog-2`, because `blog` is
   taken on the account. The report says so.
3. `sheep home deploy` in `blog` again, a month later, redeploys `blog`
   from the recorded name and asks the account nothing about names.
   `sheep home deploy --name other` there is refused in a sentence that
   names `blog` and `sheep home delete`.
4. `sheep home delete` in `blog` deletes `blog`, and only `blog`, and
   clears that kennel's config.

Acceptance criteria:

- `mintName` is a pure function with a test: the lowercasing, the
  hyphens, the truncation, `sheep` for an empty result and for the
  fallback kennel, and the counter against a set of taken names that
  includes container applications.
- No hash of a path appears in a name, a config, or an address.
- The walk is station phase 1's proof, on the account; this project's
  ring never deploys.

## Journey 4: The ring, from two directories

The conductor wants the release proved as a shepherd would use it.

1. `pnpm hermetic --ring package` makes two fresh directories under its
   fresh world and walks journey 1 steps 1 to 4 and journey 2 steps 1
   and 2 between them, then collar's journey 1 from the first, reading
   the config where setup wrote it.
2. The machine ring, on its two Docker images, is unchanged and green.

Acceptance criteria:

- The ring never reads the machine's `~/.sheep`, `~/.wrangler`, or this
  checkout's `node_modules`, as collar's rings do not, and asserts it
  with `HOME` alone: `SHEEP_CONFIG` and `SHEEP_LOCAL` are gone.
- The ring's `ps` sees no token in any argument, as collar's does.
