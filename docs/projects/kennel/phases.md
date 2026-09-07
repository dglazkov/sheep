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

**Where we are: kennel phases 0 and 1 CLOSED; the project is done. Next: nothing here; station phase 1 took the name rule and walked journey 3.** Planned 7 Sep 2026, the evening station was planned, from a conversation with the shepherd; the shepherd's calls are in the journey's front matter. Both phases were built and walked the same afternoon: two directories on this laptop, two homes, a real model in one; the name rule proved pure and the field read and kept. No ⚑ steps: nothing in this project touches an account. Nothing waits on a person; journey 3 walked on the account by station phase 1 the same night.

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

**Status: CLOSED 2026-09-07.** `sheepDir()` is the one rule; `sheep setup` makes the kennel and its ignore entry; the package ring walks two kennels; journey 1 walked on this laptop with a real model.

**Findings:**

- **2026-09-07 — Setup makes the kennel before it resolves the home, or a fresh directory reports the machine's.** `main()` loads the config first; `setup()` now takes the `--home` override, makes `.sheep/`, then loads, so a new directory says "none configured".
- **2026-09-07 — The kennel is a realpath and `HOME` is not.** `sheepDir()` resolves from `process.cwd()`, so macOS says `/private/var` where the ring's own names say `/var`; every ring comparison takes either form.
- **2026-09-07 — An empty ignored directory is invisible to `git status --ignored`.** A just-made `.sheep/` proves nothing; the ring and the test write a config into it first, which is what journey 2 step 1 asks about.
- **2026-09-07 — Two kennels, two daemons, one toolchain, walked.** `blog` on 63908 with a real key and a real model's reply, `pi` on 64048 faux, different tokens; wrangler fetched once into `~/.sheep/tools`; `sheep home` from `/tmp` named `~/.sheep` and the deployed station.
- **2026-09-07 — Retiring `SHEEP_CONFIG` and `SHEEP_LOCAL` cost the tests nothing.** `HOME` plus a working directory isolates every CLI test, and is stricter: the old knob moved the config file, not the home directory.
- **2026-09-07 — Running the suite makes the checkout a kennel.** `setup.test.ts` runs setup at the repo root; the empty `.sheep/` is ignored, and a developer's `sheep home local` in the checkout now lands in `<repo>/.sheep/local`.
- **2026-09-07 — The machine ring's last line named images that do not exist**, `images.map(ringTag)` passing the index as the tag prefix; fixed in passing.
- **2026-09-07 — Open: setup in a subdirectory of a kennel makes a second one that shadows the first.** The design says "there"; whether setup should say a kennel exists above waits on a walk that trips over it.

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

**Status: CLOSED 2026-09-07.** `mintName` and `kennelName` in `name.ts` with the rule's test; `name` read from the config, kept across `sheep home local`'s rewrite, reported by `sheep home`; the package ring shows `name null` on a local home.

**Findings:**

- **2026-09-07 — `name` survived `sheep home local`'s rewrite before anything wrote it.** The start spreads the existing config under the refreshed address and token, so a deploy's name outlives a later local start; the test pins that instead of trusting it.
- **2026-09-07 — `--home` does not clear `name`.** The name is the kennel's record of its station, not a property of the address; an address override drops the `local` marker and keeps the name.
- **2026-09-07 — The counter is applied after the fifty-character cut.** A fifty-character base with a collision mints fifty-plus-two; Cloudflare's ceiling is longer, so fifty leaves room, and the test says so.
- **2026-09-07 — `mintName` does not validate `wanted`.** An empty or invalid `--name` comes back as it went in; station's deploy refuses those itself, and compares `config.name` to `--name` before minting.
- **2026-09-07 — Journey 3 steps 1 to 4 walked on the account, by station phase 1.** `mintName` over the account's Workers and container applications minted `sheep-2` from `~/.sheep`, `sheep` being the checkout's; the name written beside `home` and `token`, and removed with them by `sheep home delete`.
