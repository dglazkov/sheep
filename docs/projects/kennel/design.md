# Kennel — the design

**7 September 2026.** Design. Nothing built. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.

The thesis in one line: **a dog lives in a directory, so what a dog
holds is found from the directory, the way git finds `.git`, and two
dogs in two directories share nothing but the command.**

Collar made a directory a dog's: `sheep setup` puts the skill under
`.agents/skills/sheep` there, and the dog that opens in it knows how to
herd. But everything else the dog holds is the machine's. The config is
`~/.sheep/config`, one home per machine. The local home is
`~/.sheep/local`, one daemon, one port, one SQLite store. Pastures are
named per home, so two dogs making a pasture called `docs` collide. And
station, as planned, deploys one Worker named `sheep` per account. Two
dogs in two directories today see each other's sheep in `sheep ls`,
spend one key, hold one token, and are deleted together. The shepherd
said on 7 Sep 2026 what they want instead: a dog in each of a number of
directories, wholly independent of one another.

One rule gives that. `sheep` finds its directory, `.sheep/`, by walking
up from the working directory, and falls back to `~/.sheep` when there
is none. The config lives there. The local home lives there. A station
deployed from there is named for there and recorded there. Named homes
and `sheep home use`, which station declined, stay declined: the
directory is the switch, and `cd` is the verb.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the kennel | a dog's directory: the config, the local home, and the station's name | `.sheep/` at or above the working directory; `~/.sheep` when there is none |
| the config | which home, its token, the `local` marker, and the station's name once minted | `<kennel>/config`, JSON as today plus `name` |
| the local home | collar's daemon and its state, one per kennel | `<kennel>/local/` |
| the tools | wrangler at the manifest's pin, one per machine | `~/.sheep/tools`, never per kennel |
| the name | what a station deployed from this kennel is called on the account | minted at the first deploy, recorded in the config, never derived again |

## Finding the kennel

`sheepDir()` replaces `configPath()` and `localDir()`, the two functions
every other call goes through; there are twelve call sites, all in
`config.ts` and `local.ts`. From the working directory upward, the first
directory holding a `.sheep/` directory is the kennel. None: `~/.sheep`,
which a walk from anywhere under the home directory reaches on its own,
and which a walk from `/tmp` falls back to. `sheep config` and `sheep
home` print which, so a dog can always say where it stands.

`SHEEP_CONFIG` and `SHEEP_LOCAL`, the two overrides collar's ring used to
keep a walk out of `~/.sheep`, are retired. The ring's fresh `HOME` and
its fresh working directory are the override now, and the ring reads the
config where `sheep setup` wrote it. Fewer knobs, and the ring walks
the same discovery a dog does.

## What `sheep setup` does now

Setup already readies the directory it runs in. It gains one thing: it
makes `.sheep/` there, empty, so the directory is a kennel from then on
and nothing later has to guess. Two consequences follow, both setup's:

- **The ignore entry.** The config will hold a token, and the local
  home's `.dev.vars` a model key. When the directory is in a git work
  tree, setup appends `.sheep/` to the `.gitignore` at the kennel,
  creating the file if there is none, and reports the line added or
  already there. Outside git, nothing. The entry is visible and travels
  with a clone, which is why it is `.gitignore` and not
  `.git/info/exclude`: a teammate's dog must not commit theirs either.
- **The tracked warning.** `git ls-files .sheep` non-empty means a
  token is in the repository already. `sheep setup` and `sheep home`
  say so in one line and go on. The person decides what to do about
  it; the dog has been told.

Inside a checkout of sheep itself, setup installs no skill and says
why; it still makes the kennel, and this repository ignores `.sheep/`.

## Two local homes

`sheep home local` starts the daemon under `<kennel>/local`: its own
free port, its own generated `SHEEP_TOKEN`, its own `.dev.vars`,
`home.json`, `log`, and `state/`. Two kennels on one laptop run two
`wrangler dev` processes and two stores, and a sheep in one is unknown
to the other. `sheep home stop` stops this kennel's. `sheep ls` in a
subdirectory of the kennel finds the kennel's home, as `git status`
finds the repository.

Wrangler is not per kennel. `toolsDir()` is `~/.sheep/tools` on every
machine, the manifest's pin installed once and reused, as collar built
it; a kennel is a config and a store, not a toolchain. A kennel whose
directory is deleted leaves its daemon running until it idles or the
machine restarts; a machine-wide list of running local homes is
deliberately open, below.

## The name of a station

Station's deploy needs a Worker name, and a Worker name is account-wide,
shows up in the address as `https://<name>.<you>.workers.dev`, and names
the container application too. It is needed exactly once, at the first
deploy from a kennel. After that the config holds the address and the
name, and a second machine joins by address. So the name is **minted
and recorded, never derived**: nothing about a directory is both stable
and unique, and recording only needs uniqueness once, when the account
can be asked.

`mintName(basename, taken)`: the kennel's directory name lowercased,
every run of characters outside `[a-z0-9]` replaced by one hyphen,
hyphens trimmed from the ends, truncated to fifty characters, and
`sheep` when nothing is left or the kennel is `~/.sheep`. If the
account has a Worker or a container application of that name, `-2`,
then `-3`, until one is free, since a container application left
behind by a failed delete is a collision recast found the hard way.
`--name <worker>` at the first deploy sets it instead. The result is
written to the config as `name` and every later deploy and the delete
use it; `--name` with a different name than the recorded one is refused
in a sentence that says which station this kennel has and how to end
it. The dashboard reads `sheep`, `sheep-2`, `blog`, `pi`; no hash
appears anywhere; moving the directory changes nothing.

The rule is a pure function proved in a test, and station phase 1 is
where it meets the account. This project builds the rule and the
field; station walks them.

## What this does not do, on purpose

- **Named homes.** The directory is the switch.
- **A machine-wide list of local homes**, or a stop for a kennel whose
  directory is gone. The daemon idles; `ps` finds it. A finding when it
  bites.
- **A kennel that names several homes.** One config, one home,
  `--home` for one command, as station said.
- **Moving the token out of the directory** into a machine keyring. The
  ignore entry and the tracked warning are the guard; a keyring is a
  project if a walk shows they are not enough.
- **Migrating `~/.sheep`.** It is the fallback and keeps working
  unchanged; a dog that never runs setup in a directory is collar's dog.
