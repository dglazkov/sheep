# Kennel: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey steps it closes, and a
phase that claims a walk closes only when the walk was walked for real.
The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)) and
collar's ([../collar/phases.md](../collar/phases.md)): the cell's proofs
run in workerd, never in Node; pi is a dependency; findings are one
dated line of about forty words; `main` stays sources only and a phase's
proof runs in a ring, never from this checkout; steps marked **⚑
provision** create, change, or delete a cloud resource, spend money, or
need a login, and are asked out loud first. `/conduct kennel` is the
procedure. Phase citations name their project: `kennel phase 1`, never
a bare "phase 1".

**One rule for this project.** Nothing reads `~/.sheep` but the tools
directory and the fallback, and the ring proves it with a fresh `HOME`
and no other override: a walk that needs `SHEEP_CONFIG` to stay out of
the machine's kennel has left the design.

---

**Where we are: kennel phase 0 NOT STARTED. Next: kennel phase 0, the kennel.** Planned 7 Sep 2026, the evening station was planned, from a conversation with the shepherd; the shepherd's calls are in the journey's front matter. This project lands before station phase 1, which takes kennel phase 1's name rule. No ⚑ steps: nothing in this project touches an account.

The order is dependency order. Phase 0 is the directory: discovery,
the config and the local home under it, setup making it and guarding
it, and the ring walking two of them. Phase 1 is the name: the pure
rule and the config field, which station phase 1 consumes.

**Deliberately open.** Postponed on purpose: a machine-wide list of
running local homes; a keyring for the token; a kennel naming several
homes.

---

## Phase 0: The kennel

**Closes:** journeys 1, 2, and 4 in full.

**Work:** `packages/cli/src/config.ts`: `sheepDir()`, the walk up from
the working directory to the first `.sheep/`, else `~/.sheep`;
`configPath()` and `local.ts`'s `localDir()` become
`join(sheepDir(), …)`; `toolsDir()` is `~/.sheep/tools` always;
`SHEEP_CONFIG` and `SHEEP_LOCAL` removed. `sheep config` and `sheep
home [--json]` print the kennel (`kennel` in the JSON). `setup.ts`: make
`.sheep/`, the `.gitignore` entry when in a git work tree, both in the
report and its prose; the tracked warning, `git ls-files .sheep`, on
stderr from setup and from `sheep home`. This repository's `.gitignore`
gains `.sheep/`. `scripts/hermetic.mjs`: the package ring drops the two
variables and their assertions, makes two directories, walks journey 1
steps 1 to 4 and journey 2 steps 1 and 2 across them with the faux
provider, then collar's walk from the first, reading `<dir>/.sheep/
config`; the dog ring's fresh directory is a kennel the same way. The
guide, `SKILL.md`, the help text, and the README say `.sheep/` in the
directory, `~/.sheep` when there is none.

**Not this phase:** No name, no change to station's docs beyond what
this plan already made.

**Proof:** `pnpm test` exits 0 with a test for the walk: nearest wins, a
subdirectory finds its parent's, none falls back, `~/.sheep` under
`HOME`. `pnpm hermetic --ring package` exits 0 with the two-directory
walk: two ports, two tokens, each `sheep ls` its own sheep, `sheep
home` naming each kennel, `.gitignore` one line changed and `.sheep/`
unseen by `git status`, wrangler fetched once, nothing under the ring's
`HOME/.sheep` but `tools/`. `pnpm hermetic --ring machine` green
unchanged. Then the walk: this laptop, two directories, journey 1 with
a real model in one of them. **⚑** none.

**Status: NOT STARTED.**

## Phase 1: The name

**Closes:** journey 3's first two criteria; step 1 to 4's walk is
station phase 1's.

**Work:** `packages/cli/src/name.ts`: `mintName(basename, taken:
Set<string>, wanted?: string)` as the design states it, and `sheep` for
the fallback kennel. `config.ts`: `name` in `SheepConfig`, read and
written like `home`. `sheep home [--json]` prints the name when there
is one. Station phase 1's plan names this function and this field for
its deploy, its refusal of a different `--name`, and its delete; that
plan is edited here to say so, and nothing in it is built.

**Not this phase:** No deploy. No account.

**Proof:** `pnpm test` exits 0 with the rule's test: lowercasing,
hyphens, truncation, `sheep` for nothing and for the fallback, the
counter against a set holding Workers and container applications, and
`wanted` taken verbatim. `sheep home --json` in the package ring shows
`name: null` on a local home. **⚑** none.

**Status: NOT STARTED.**
