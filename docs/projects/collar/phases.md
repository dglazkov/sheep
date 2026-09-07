# Collar: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is the
acceptance suite. Each phase names the journey steps it closes, and a
phase that claims a walk closes only when the walk was walked for real.
The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)): the cell's
proofs run in workerd, never in Node; pi is a dependency, and a change
sheep needs in it is one commit on the fork named here; findings are one
dated line of about forty words; steps marked **⚑ provision** create,
change, or delete a cloud resource, spend money, or need a login, and are
asked out loud first. `/conduct collar` is the procedure. Phase citations
name their project: `collar phase 2`, never a bare "phase 2".

**Two rules for this project.** Nothing is proved from this checkout: a
phase's proof runs the ring, and the ring installs the release through
npm's git installer into a world it made, with this checkout's
`node_modules`, `~/.sheep`, and `~/.npm` out of reach. A proof that
passes here and not in the ring has proved that this laptop works. And
`main` stays sources only: no bundle, Worker, or manifest is committed
to it, ever; the release script makes them and the `release` branch
carries them.

---

**Where we are: collar phase 0 NOT STARTED. Next: collar phase 0, the bundles and the release tree.** Planned 7 Sep 2026, the day after pasture closed, from a brainstorm with the shepherd; the shepherd's calls are in the journey's front matter. Nothing waits on a person until collar phase 3, which asks once for the `release` branch and the workflow, and collar phase 4, which spends tokens.

The order is dependency order. Phase 0 is the release itself, the two
bundles and the Worker in a tree npm can install, and the package ring
in its first form, because every later phase's proof is that ring.
Phase 1 is the local home, the first thing the installed command can
talk to without an account. Phase 2 is setup, the skill, and the guide,
the words a dog meets first, written after the verbs they describe
exist. Phase 3 is the machine ring, the guard in the release script, and
CI, which needs everything before it to have a walk worth guarding.
Phase 4 is the dog ring and the real walk, last, because a dog in a
container needs a release on GitHub to install.

**Deliberately open.** Postponed on purpose, so a later project decides:
the deployed home from the package (`sheep home deploy`, the image on a
registry, the stamp on `GET /home`); a hosted home; `sheep upgrade`;
Windows; pi as the dog in the dog ring.

---

## Phase 0: The bundles, and the release tree

**Closes:** journey 1's first criterion; journey 2's last two criteria;
journey 4 steps 1 and 3 and its first criterion; journey 3's first
criterion, for the package ring.

**Work:** `scripts/bundle.mjs`: esbuild with the options of the fork's
`build-coding-agent-bundle.mjs` (platform node, ESM, the banner, the
lazy jiti plugin, the externals) over two entries, `packages/cli/src/
cli.ts` to `dist/sheep.mjs` and the fork's `src/experimental/cli.ts` to
`dist/pi-client.mjs`, with the files the client path reads at runtime
copied beside them, and the validation that nothing outside the allowed
externals leaked; `wrangler deploy --dry-run --outdir home` over
`packages/cell` for `home/worker.mjs`, and `home/wrangler.jsonc` written
from the cell's config with `main` and `no_bundle`. `packages/cli/src/
pi.ts`: when `pi-client.mjs` sits beside the running bundle, spawn it
without the resolver; otherwise the checkout's path, unchanged. `sheep
--version` prints the stamp from the manifest, or `0.0.0-checkout`.
`scripts/release.mjs`, isocan's with the build swapped: the temporary
index, the manifest from `HEAD` with `sheep.commit`, `sheep.builtAt`,
`sheep.wrangler` (the pinned version), `engines`, the dependency list,
no scripts or workspaces, `.github/` dropped, two parents, `update-ref`;
`--no-push` prints the ref; no push in this phase. A test holds the
manifest's dependencies as a literal and asserts `esbuild` and
`wrangler` are absent. `scripts/hermetic.mjs --ring package [ref]` in
its first form: the fresh prefix, cache, `HOME`, `SHEEP_CONFIG`, and
`SHEEP_LOCAL`, the five asserted, `npm install -g git+file://<repo>#<ref>`,
then journey 1 steps 3, 4, and 7 against a faux home the test helper
starts from the checkout, since the local home is collar phase 1;
one line per step, the first failure's command and output, and the
list of what was not checked. `pnpm release` and `pnpm hermetic` as
root scripts.

**Not this phase:** No local home, no setup, no skill, no CI, no push.
The release exists as a ref in this repository.

**Proof:** `pnpm release --no-push` exits 0 and prints a ref whose tree
has exactly the files the design lists and whose commit's second parent
is `HEAD`; `git ls-tree` of it shows no `packages/`, `vendor/`,
`.github/`. `pnpm hermetic --ring package <ref>` exits 0 on this machine:
the installed `sheep --version` prints the stamp; `sheep new -- hello`
answers `ok`; `sheep attach <id> -- again` streams, and `ps`
during it, captured by the ring, shows the child running
`dist/pi-client.mjs` under the ring's prefix; `sheep export` writes a
file pi's backend opens. `find
<prefix> -name '*.ts' -path '*earendil*'` is empty. `pnpm test` and
`pnpm -r typecheck` exit 0, the suites unchanged. **⚑** none.

**Status: NOT STARTED.**

## Phase 1: The local home

**Closes:** journey 1 steps 2, 3, and 6 and its last two criteria;
journey 4 step 1 for the home.

**Work:** `packages/cli/src/local.ts`: `sheep home local [--faux]`,
`sheep home stop`, `sheep home [--json]`. `~/.sheep/local/` with
`state/`, `.dev.vars` mode 600, `home.json`, and `log`; `SHEEP_LOCAL`
overrides the directory. wrangler installed once into `~/.sheep/tools/`
at the manifest's pinned version by `npm install`, reused after, and in
a checkout the checkout's own. The daemon detached over the package's
`home/wrangler.jsonc` with `--persist-to`, ready when `GET /` answers
`sheep`; `home.json` with pid, port, and stamp; a stale pid file
detected by asking the port who it is. Start on demand: a connection
refused to the configured local home starts it and says so on stderr.
`SHEEP_TOKEN` generated on first start and written to `.dev.vars` and
`~/.sheep/config`; `SHEEP_ANTHROPIC_API_KEY` from `ANTHROPIC_API_KEY`
when present; `--faux` writes the provider instead; the report says
held or not held. A config naming another home is left alone with the
sentence. The test helper `local-home.ts` gains `SHEEP_TEST_HOME` and
`SHEEP_TEST_TOKEN`, using a home that is already up instead of
spawning one, so journey 5's file can run against the installed home.
The ring's walk becomes journey 1 steps 2, 3, 4, 6, and 7 with `--faux`
against `sheep home local` from the install, the checkout's helper no
longer used.

**Not this phase:** No setup, no skill, no key prompt beyond the report.
No container.

**Proof:** `pnpm hermetic --ring package <ref>` exits 0 with the walk
above: the home under the ring's `SHEEP_LOCAL`, `~/.sheep/config`
written there, `.dev.vars` mode 600 and the token in no argument of any
process (`ps` during the walk, in the ring's report); `sheep home stop`
then `sheep ls` starting the home again and listing the sheep; `sheep
home --json` naming the stamp the install's manifest carries. Journey
5's test file, with `SHEEP_TEST_HOME` and token pointed at that home,
passes. In the checkout: `pnpm test` unchanged, plus tests for the pid
file, the port check, and the config sentence driven through
`bin/sheep.js` with a temp `SHEEP_LOCAL`. **⚑** none.

**Status: NOT STARTED.**

## Phase 2: Setup, the skill, and the guide

**Closes:** journey 1 steps 1 and 5; journey 4 steps 2 and 4.

**Work:** `packages/cli/src/setup.ts`: `sheep setup [--json]
[--no-install]`, isocan's shape: the PATH lookup that skips `_npx` and
`node_modules/.bin`, `npm install -g <spec>` when absent, the skill
copied to `.agents/skills/sheep` with the `.claude/skills/sheep`
relative symlink and never over a real directory, the checkout guard,
the home reported, the next sentence printed. `INSTALL_SPEC` in one
place. `.agents/skills/sheep/SKILL.md`, the doorway. `packages/cli/
agent-guide.md`, shipped as `dist/agent-guide.md` and printed by `sheep
--agent-help`: what sheep is, that the dog runs it, the verbs, the
home, what to ask a person for. `README.md`: the install spec and
journey 1 first, the checkout below for developers. The ring's walk
gains step 1 (`npx <spec> setup`, then the installed `sheep`) and step
5.

**Not this phase:** No CI, no machine ring, no upgrade verb.

**Proof:** `pnpm hermetic --ring package <ref>` exits 0 walking journey
1 steps 1 to 7 with `--faux`: setup's `--json` report has the three
states and the next sentence, the skill and the doorway exist in the
ring's working directory, `sheep --agent-help` prints the guide, and
setup run a second time reports everything current. In the checkout,
`node packages/cli/bin/sheep.js setup --json` reports a checkout and
installs nothing, held by a test. `git diff --stat README.md` moves the
checkout section below the spec. **⚑** none.

**Status: NOT STARTED.**

## Phase 3: The machine ring, the guard, and CI

**Closes:** journey 2 steps 1 to 4 and its first criterion; journey 3
steps 1, 2, and 4 and its last two criteria for those rings.

**Work:** `scripts/hermetic.mjs --ring machine [ref]`: a Dockerfile
from `node:22-slim` and one from `node:24-slim`, the ref exported as a
bare repository into the build context, the package ring's script run
inside with `git+file:///src.git#<ref>`, no socket, no mounts; a
machine without Docker says so and exits 2. `scripts/release.mjs` runs
the package ring against the ref it made and refuses to push on a
failure; `--force` does not skip it. `.github/workflows/release.yml`:
on push to `main`, submodule init, the fork's packages built, `pnpm
install`, `pnpm test`, `pnpm release`; a second job after it installs
from `github:dglazkov/sheep#release` on the runner and runs the package
ring's walk from that spec; `concurrency` queued, `contents: write`.
The walk in the ring takes the spec as well as a ref.

**Not this phase:** No dog ring. No deploy of any Worker.

**Proof:** `pnpm hermetic --ring machine <ref>` exits 0 on both images
here. `pnpm release --no-push` shows the ring running before the ref is
printed, and a release with a bundle deliberately broken (a test that
sets an environment variable the bundler honours) is refused. Then, with
the shepherd's yes, `pnpm release` pushes; the workflow's two jobs are
green on that push; and on this machine, with a fresh `HOME`, `npx
github:dglazkov/sheep#release setup` reports in under two minutes on a
warm network. **⚑** the first push of `release` and the workflow: a
generated branch and an Actions workflow on the public repository,
asked once; no money.

**Status: NOT STARTED.**

## Phase 4: The dog ring, and the walk

**Closes:** journey 1 in full, walked for real; journey 3 steps 3 and 4
and its last criterion.

**Work:** `scripts/hermetic.mjs --ring dog [ref|spec] [--yes]`: the
machine ring's image plus `npm install -g @anthropic-ai/claude-code`,
the key from the environment, `npx skills add dglazkov/sheep`, then
`claude -p` with journey 1's sentence and the tools it needs; after it,
`sheep ls --json` and `sheep home --json` inside the container asserted,
the transcript printed; the token estimate and the yes before it
starts. The walk of journey 1 by the shepherd's dog: the dog ring with
a real key, so step 2's ask is met by the environment and steps 3 and 4
answer from a real model. Then the record: the Open roster names the
deployed home project, `sheep upgrade`, Windows, and pi as the dog; the
index row and the front matter move to `done`.

**Not this phase:** No second dog. A fix the walk exposes is a finding
with the command that found it.

**Proof:** `pnpm hermetic --ring dog github:dglazkov/sheep#release`
exits 0: the transcript shows the agent running setup, `sheep home
local`, and `sheep new`, a sheep in `sheep ls --json`, the local home
answering, and every step of journey 1 in the Findings with its
output. `.claude/skills/conduct/status.sh collar` prints `clean`.
**⚑** the dog ring spends the shepherd's tokens, on the order of a
dollar or two per run, asked with the estimate.

**Status: NOT STARTED.**
