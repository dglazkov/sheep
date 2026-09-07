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

**Where we are: collar phases 0 to 3 CLOSED; collar phase 4 PART-DONE. Next: collar phase 4's run from the spec, then the record.** Planned 7 Sep 2026, the day after pasture closed, from a brainstorm with the shepherd; the shepherd's calls are in the journey's front matter. Phases 0 to 2 built and verified the same morning. Phase 3 closed in the afternoon after the shepherd's yes: `release` is on GitHub, built by the workflow, and the install from the spec walks. Phase 4's dog ring held in repo mode with a real key and is running from the spec; the shepherd authorized the tokens.

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
answers `ok`; `sheep attach <id> -- again` streams, and `sheep
attach <id>` with no prompt and no terminal attaches through pi's
client, `ps` during it, captured by the ring, showing the child
running `dist/pi-client.mjs` under the ring's prefix; `sheep export` writes a
file pi's backend opens. `find
<prefix> -name '*.ts' -path '*earendil*'` is empty. `pnpm test` and
`pnpm -r typecheck` exit 0, the suites unchanged. **⚑** none.

**Status: CLOSED.** 2026-09-07. The bundles, the Worker, the release ref, and the package ring built; the ring installed the ref through npm's git installer into a fresh prefix and walked journey 1 steps 3, 4, and 7 with the faux provider, verified by the conductor.

**Findings:**

- **2026-09-07 — The client bundle from the fork's `experimental/cli.ts` built and ran first try with pi's own esbuild options.** The one addition is a stub for `chord/bundler`, which reaches esbuild through pi's `server.ts`, a server-side path attach mode never takes.
- **2026-09-07 — A prompt never spawns pi's client.** `sheep attach <id> -- "…"` is sheep's in-process client; only the promptless attach runs `dist/pi-client.mjs`, which with no TTY attaches, prints `attached`, and exits. The proof and journey 1 step 4 now say so.
- **2026-09-07 — npm's git installer took the release in three seconds:** twelve files, seven packages beside sheep, no `.git`, no `*.ts`, no build tool; `dist/pi-client.mjs` is 7.1 MiB and `dist/sheep.mjs` 570 KiB. The ring's fresh `HOME` held only an empty `.sheep/local` afterwards.
- **2026-09-07 — The emitted Worker serves from an installed tree:** `wrangler dev --config <install>/home/wrangler.jsonc --persist-to …` with the checkout's wrangler 4.129.0 answers `sheep` on `GET /`. Collar phase 1's local home is a daemon and a wrangler fetch away.
- **2026-09-07 — A debt, for collar phase 2: every `sheep` invocation on Node 24 prints `ExperimentalWarning: SQLite`,** because `export.ts` imports `node:sqlite` at load. The ring silences it with `NODE_NO_WARNINGS`; a user will not. A lazy import in `export` ends it.
- **2026-09-07 — The manifest's pins for photon, jiti, and clipboard are checked against the fork's `package.json` at build time,** so a pi bump that moves them fails `pnpm release` until `release.mjs` follows. Cost: 20 minutes of a subagent, 15 of verification.

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

**Status: CLOSED.** 2026-09-07. The local home built: `sheep home local|stop`, `sheep home`, the secrets file, wrangler fetched once, start on demand; the package ring walked journey 1 steps 2, 3, 4, 6, and 7 from the install against it, and journey 5's file passed against that home, verified by the conductor.

**Findings:**

- **2026-09-07 — wrangler's `--env-file` reads a secrets file for a config in another directory,** so `~/.sheep/local/.dev.vars`, mode 600, feeds the package's own `home/wrangler.jsonc` unchanged; the daemon's one secret-related argument is the file's path, and 83 `ps` samples across the walk saw the token in none.
- **2026-09-07 — A home is running only when its pid is alive and the port answers `sheep`;** either alone is a stale record, and `sheep home stop` signals nothing stale, so a reused pid or a stranger on the port is never killed. Tests drive both halves.
- **2026-09-07 — A `local: true` marker in `~/.sheep/config` decides the start on demand, not the address,** which the daemon may move; `SHEEP_HOME` or `--home` drops the marker, so a refused connection to any other home is the error it was.
- **2026-09-07 — A running home whose secrets changed is restarted, not reported:** `sheep home local` after `export ANTHROPIC_API_KEY` says `restarted` and `held`, and the home holds it; otherwise "held" would describe the file and not the home.
- **2026-09-07 — wrangler 4.129.0 fetched into the ring's `~/.sheep/tools` in seven seconds, 236 MB;** the home started, stopped, and was restarted by `sheep ls` on the same port with the earlier sheep listed. wrangler also writes `.wrangler/tmp` beside the served config, inside the installed package tree; harmless, gone on reinstall.
- **2026-09-07 — On macOS `import.meta.url` inside the bundle is the realpath under `/private/var`, while the ring's variables said `/var`;** the ring's first run failed on that string alone and now compares real paths. Cost: 18 minutes of a subagent, 12 of verification.

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

**Status: CLOSED.** 2026-09-07. `sheep setup`, the skill, `sheep --agent-help`, and the README built; the package ring walked journey 1 steps 1 to 7 from the install with the faux provider, setup's second run reporting everything current, verified by the conductor.

**Findings:**

- **2026-09-07 — `npx git+file://…#sha setup` ran from the ring's `_npx` cache and installed the durable copy itself:** setup's `npm install -g` put `sheep` at the prefix in seven seconds, and the report named the prefix's bin, not the cache's, because the lookup skips `_npx` (isocan #48).
- **2026-09-07 — Collar phase 0's warning debt is paid:** export's was the CLI's only `node:sqlite` import; lazy, `sheep --version` on Node 24 prints 21 bytes and an empty stderr, which the ring asserts with no `NODE_NO_WARNINGS`. The root script's `--disable-warning` had never reached the CLI, a child node.
- **2026-09-07 — The release takes the skill from the working tree with `git add -f`, like the bundles, while the manifest and README come from `HEAD`;** on a `--force` build of a dirty tree the README is `HEAD`'s and the skill is disk's, which a clean tree makes moot.
- **2026-09-07 — A checkout is told twice, separately:** the working directory (a `package.json` named `sheep` with a workspace beside `packages/`) decides the skill, the missing stamp decides the command; a checkout's `sheep` run elsewhere installs the skill there, which is how the test drives it without an install.
- **2026-09-07 — A differing skill copy is refreshed, not refused, so upgrading the command upgrades the doorway;** a real directory or a foreign link at `.claude/skills/sheep` is kept and reported. The guide's claims about exit codes, lane states, and the queued line were checked against the code. Cost: 15 minutes of a subagent, 10 of verification.

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

**Status: CLOSED.** 2026-09-07. The machine ring green on both images, the guard refusing a broken bundle, and the workflow's third run green on both jobs after two fixes; `release` is on GitHub, and the package ring here installed `github:dglazkov/sheep#release` from a fresh `HOME` in nine seconds and walked journey 1, verified by the conductor.

**Findings:**

- **2026-09-07 — The machine ring held on both images in under thirty seconds: `node:22-slim` and `node:24-slim`, arm64, git and procps added, nothing mounted, as root;** the install took three seconds and wrangler's fetch five inside each container.
- **2026-09-07 — A bare repository with an unborn `HEAD` crashes npm's git installer:** `git ls-remote` lists no `HEAD`, and pacote dies with "Cannot read properties of undefined (reading 'sha')". The ring points the bare repository's `HEAD` at the ref it exports.
- **2026-09-07 — A debt, for collar phase 4: `sheep home stop` waits forever on a zombie.** With no init in a container the detached daemon is never reaped, `kill(pid, 0)` keeps answering, and after SIGKILL the loop in `stopLocalHome` is unbounded. The ring runs `docker --init`; the CLI should bound that loop.
- **2026-09-07 — The guard refused a bundle broken on purpose at step 1 and left `refs/heads/release` untouched, the candidate parked at `refs/sheep/candidate`;** a good release moves the ref only after twelve ring lines, and neither `--force` nor `--no-push` skips the walk.
- **2026-09-07 — The workflow cannot reach the release tree:** `release.mjs` drops every top-level entry of `HEAD` but README and LICENSE and demands exactly the design's 14 files, so `.github/` throws; checked by the conductor on a release built from the commit carrying the workflow. Cost: 90 minutes of a subagent, 20 of verification.
- **2026-09-07 — The shepherd said push, and the workflow's first two runs were red for reasons no local ring could see:** `setup-node` looks for pnpm before corepack has enabled it (`package-manager-cache: false`), and lamb's journey 5 test kept a faux turn running for 2.5 seconds, less than three CLI calls take on the runner (now ten). The third run pushed `release`.
- **2026-09-07 — `npx github:dglazkov/sheep#release setup` from a fresh `HOME` on this machine reported in nine seconds,** and the package ring walked journey 1 from that spec in twenty; the runner's install job did the same, stamped with the run's commit.

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

**Status: PART-DONE.** 2026-09-07. The dog ring built and dry-run: the image with Claude Code 2.1.263, the probe, the skill added by name, the README's spec redirected to the ref inside the container, the exact `claude -p` command printed and stopped before; the run itself and journey 1's real walk wait on the shepherd's key and the tokens it spends.

**Findings:**

- **2026-09-07 — Claude Code 2.1.263 refuses `--dangerously-skip-permissions` and `bypassPermissions` as root, and the dog ring runs as root anyway:** `--allowedTools Bash,Read,Edit,Write,Glob,Grep` works as root, and `--permission-prompts none` denies and reports anything that would prompt, so print mode cannot hang.
- **2026-09-07 — In repo mode a git `insteadOf` rule makes the README's spec install the ref:** `url.file:///src.git.insteadOf https://github.com/dglazkov/sheep.git` in the container's `~/.gitconfig`, so `npx github:dglazkov/sheep#release setup` reported that spec and the ref's stamp; the ring's "not checked" says so.
- **2026-09-07 — Collar phase 3's stop debt is paid: a zombie counts as gone.** `kill(pid, 0)` succeeds on a zombie on macOS too; `alive()` reads `/proc/<pid>/stat` or `ps -o stat=`, and the post-SIGKILL wait is three seconds, then `unreaped` is reported. A test makes a zombie with `exec sleep`.
- **2026-09-07 — `npm install -g @anthropic-ai/claude-code` leaves 97 MB in `~/.npm`,** which the fresh-`HOME` probe would have refused; the Dockerfile's agent layer removes it. The skills CLI copies the skill into `.claude/skills/sheep` as a real directory, so setup's doorway there is kept, not linked. Cost: 19 minutes of a subagent, 10 of verification.
- **2026-09-07 — The skill moved to the repo root, so `npx skills add dglazkov/sheep` finds it alone.** It had listed `conduct` and `pi-bump` too, the repo's own workflow, which the shepherd said a dog must never receive; the skills CLI stops at a root `SKILL.md` unless asked for `--full-depth`.
- **2026-09-07 — Open: the dog ring's run, and journey 1's real walk.** Waits on the shepherd's key in the environment and a yes to the tokens: one Claude Code session in print mode, on the order of a dollar or two, capped at five; `pnpm hermetic --ring dog github:dglazkov/sheep#release` once `release` is pushed.
