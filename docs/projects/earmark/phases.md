# Earmark: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are lamb's ([../lamb/phases.md](../lamb/phases.md)),
pen's ([../pen/phases.md](../pen/phases.md)), and collar's
([../collar/phases.md](../collar/phases.md)): the cell's proofs run in
workerd, never in Node; the fake container is what a cell test talks
to; pi is a dependency; findings are one dated line of about forty
words; `main` stays sources only and a phase's proof runs in a ring;
steps marked **⚑ provision** create, change, or delete a cloud
resource, spend money, or need a login, and are asked out loud first.
`/conduct earmark` is the procedure. Phase citations name their project:
`earmark phase 1`, never a bare "phase 1".

**One rule for this project.** A sheep's value goes to that sheep's
setup and that sheep's broker and nowhere else: a proof that finds it in
a sibling's frame, a route's answer, a transcript, a log line, or a
command's environment has found the bug, not a detail.

---

**Where we are: 11 Sep 2026. Phase 0 CLOSED; phase 1 PART-DONE, waiting
on the shepherd.** A dog can give one sheep a secret of its own: `sheep
new --secret <NAME>`, the value a line of stdin, laid over its pasture's
in setup and in the broker, named in `sheep ls`, ended with the sheep.
Journeys 1, 3, and 4 step 1 are walked, 1 on the local home with Docker
and a real model. What is left is journey 4 step 2, the account ring's
`s1`: **⚑** the shepherd types `pnpm hermetic --ring account --yes
<sha>` on the release CI builds from phase 1's push, with
`LAMB_PLAYGROUND_TOKEN` in the environment. Nothing waits on work.

The order is dependency order. Phase 0 is the mechanism, which the
verb's promise needs. Phase 1 is the verb, the names in `ls`, the docs,
and the walk.

**Deliberately open.** Postponed on purpose: setting or rotating a
secret after the mint; a multi-line value; `sheep status` naming the
secrets; per-sheep files in the pasture's tree. Never: a secret in the
model's environment.

---

## Phase 0: The secret is a row

**Closes:** journey 1 steps 1 to 6 and journey 2 steps 1 to 4, in the
cell's terms, against the fake container; journey 3 step 4 as the
home's refusal; nothing on the command line yet.

**Work:** `packages/cell/src/directory.ts`: `session_secrets
(session_id, name, value, PRIMARY KEY (session_id, name))`, created in
the constructor; `create(name, pasture, secrets)` inserts the row and
the secrets in one method with no await between; `SessionSummary`
gains `secrets: string[]`, sorted names, on every summary `list`,
`herd`, and `get` return; `secrets(id)` returns name to value, for the
cell, with no route; `remove` deletes the secrets with the row.
`packages/cell/src/index.ts`: `POST /sessions` takes `secrets` and
refuses before the row, 400 and a sentence: a bad name, a value that is
not a non-empty one-line string, a name but `GIT_TOKEN` with no pasture.
`packages/cell/src/pen/broker.ts`: the sheep as the first source, in
front of the pasture and the home (the pasture's minter gains it; a
pastureless sheep's minter is the sheep's, then the home's), the log's
`from this sheep`, the refusal naming every place looked.
`packages/cell/src/cell.ts`: the boot hands the env a `SetupSecrets`
that reads the pasture's object and the Directory at the run and lays
the sheep's over the pasture's by name, `GIT_TOKEN` out of both; the
lease's broker gets the Directory as the sheep's source. The env is
unchanged. Tests: `packages/cell/test/earmark.test.ts` in the checkout
ring, listed in `scripts/rings.mjs`, in `setup.test.ts`'s and
`birth.test.ts`'s shape: two sheep in one pasture with a `setup.sh`,
the pasture's `PROBE` and `NPM_TOKEN`, one sheep's own `PROBE`; the
earmarked value in that sheep's setup `run` frames alone, the sibling's
setup with the pasture's, `NPM_TOKEN` in both, no secret in any other
frame; after the mint the cell's `sqlite_master` has no table; after
`DELETE /s/<id>` the Directory has no secret for the id and the pasture's
secrets are unchanged; two names carried; `GET /sessions` has the names
and no value anywhere in its body. The broker in `broker.test.ts`: the
three sources in order for a pastured sheep, two for a pastureless one,
the log line, the refusal; the birth's clone handed the sheep's token
through the fake's credential frame. The route's refusals, journey 3
step 4's among them, each leaving `GET /sessions` unchanged.

**Not this phase:** No CLI change, no doc outside the project, no walk
on a home.

**Proof:** `pnpm test` exits 0 with the new file in the checkout ring
and the rings guard green; `pnpm --filter @sheep/cell typecheck` exits
0. Falsified by two mutations, each failing the new test and put back:
the pasture's value laid over the sheep's, and `remove` leaving the
secrets. **⚑** none.

**Status: CLOSED.** 2026-09-11. Journey 1 steps 1 to 6 and journey 2 steps 1 to 4 hold in the cell's terms, and journey 3 step 4 as the home's refusal: the mint writes the sheep's row and its secrets and nothing else, setup reads the sheep's over the pasture's, the broker asks the sheep first, the end removes them; `pnpm test` exits 0 across all three rings; falsified by both mutations.

**Findings:**

- **2026-09-11 — A sheep's secrets are `session_secrets` rows,** written with the sheep's row in one `transactionSync` and deleted by `remove` in the same call; after a mint with secrets the cell's `sqlite_master` is empty, as mint's rule wants.
- **2026-09-11 — The lay-over is one function, `laidOver` in `cell.ts`:** both sources read when setup runs, `GIT_TOKEN` out of each, the sheep's over the pasture's; `execution-env.ts` unchanged, as the design said.
- **2026-09-11 — The broker asks the sheep, the pasture, then the home** (`pastureMinter`'s new argument), or the sheep then the home (`sheepMinter`); a pastureless sheep's hand-over from the home now logs `from the home`, where it logged no source.
- **2026-09-11 — `mintSecrets` is the one validator:** the Worker answers its sentence as a 400 before any row, and `Directory.create` throws the same, so a caller that skips the route is refused alike.
- **2026-09-11 — The cells log into the test's isolate,** so a console spy sees their lines; the test asserts no value in any log line, and proves the spy sees `birth:` and `setup exit 0`.
- **2026-09-11 — Journey 2 step 2's refusal is proved at the minter, not through a cell:** the pool always binds `PEN_GIT_TOKEN`, so a cell's sibling always has the home's; the refusal through a cell is s1's, on the station.
- **2026-09-11 — A host mismatch's refusal still says "the home has no credential for X"** when the token was the sheep's: pen's wording, unchanged; the docs do not quote it as naming the sheep.
- **2026-09-11 — Mutations:** the pasture's laid over the sheep's fails both lay-over cases at setup's frame; a `remove` leaving the secrets fails both end cases at the Directory's `SELECT`. Put back.

## Phase 1: The verb and the walk

**Closes:** journeys 1, 3, and 4 in full; journey 2 steps 1 and 2 as
walked on the station.

**Work:** `packages/cli/src/cli.ts`: `--secret <NAME>`, repeatable, on
`new`; the values from stdin, one line per name in order, read before
the mint; the refusals of journey 3 steps 1 to 6 in the design's
sentences, exit 2, nothing asked of the home; `ls`'s sixth column; the
usage's `new`, `ls`, and `--json` lines. `packages/cli/src/home.ts`:
`create` sends `secrets`. `packages/cli/agent-guide.md`, `README.md`:
`--secret` beside `sheep pasture secret set`, what lies over what, the
end ending it, the names in `ls`; the guide stays within the word cap
its test counts, cut from elsewhere if it must. `packages/cli/test/
journey5.test.ts`: journey 1 steps 1, 2, 5, and 6 on a pasture with no
repository (the home ring has no container), and journey 3 steps 2 to
6, each refusal leaving `sheep ls --json` unchanged. A unit case for
journey 3 step 1, stdin a terminal. `scripts/hermetic.mjs`: the account
ring's new step, `s1`, after n1 and skipped as a8 is without
`LAMB_PLAYGROUND_TOKEN`: a pasture on the scratch repository with no
`GIT_TOKEN`; one sheep minted with `--secret GIT_TOKEN`, the token on
stdin, and one without; each scripted by the faux provider to commit
and push a branch; the earmarked sheep's branch seen on GitHub
anonymously, the sibling's push refused (git's line in its log, its
branch absent); the
token absent from every transcript, export, and `ps` sample the step
takes; both sheep ended by the step with n1's check, the branch deleted
after.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings, the home
ring's journey 5 carrying the steps; `pnpm --filter @sheep/cli
typecheck` exits 0. Then the walk, journey 4 step 1: the local home
with Docker (`sheep home local`) and a real model, from a scratch
kennel, a pasture on a public repository with a `setup.sh` that writes
a short hash of `$PROBE` beside the checkout, the pasture's `PROBE` and
one sheep's own; both sheep asked to print the file and `env | grep -c
PROBE`; the hashes recorded. **⚑** journey 4 step 2: `pnpm hermetic
--ring account --yes <sha>` with `LAMB_PLAYGROUND_TOKEN` in the
shepherd's environment, a station deployed and deleted on the
shepherd's account, a few container minutes and one deploy.

**Status: PART-DONE.** 2026-09-11. Journeys 1 and 3 hold, and journey 4 step 1 walked on the local home with Docker and a real model: each sheep's setup hashed its own `PROBE`, the model's `env` had neither, no value in any log, export, or `ls`; `pnpm test` exits 0 across all three rings. Journey 4 step 2, the account ring's `s1`, waits on the shepherd.

**Findings:**

- **2026-09-11 — The values are read in `main`, not `dispatch`:** `dispatch` runs twice when the local home starts on demand, and stdin would be spent the second time; every refusal is before the first request.
- **2026-09-11 — The walk: a mint with a secret in 0.18 s, no container;** two first prompts, clone and setup, 2.4 s each; the earmarked sheep's setup hashed its own `PROBE` (`aa72c913fa59`), the sibling's the pasture's (`9b23d0d2f4c4`), as computed; `env` counted 0 in both.
- **2026-09-11 — The walk's first try named a branch the repository lacks** (`main` for `octocat/Hello-World`): the clone exited 128 and setup ran at the first command instead, with the same hashes; the second try, `--branch master`, cloned, then set up.
- **2026-09-11 — The guide paid for its `--secret` bullet with cut redundancies:** 1497 words against the cap of 1500.
- **2026-09-11 — Open: the broker's refusal reaches git as nothing.** Pen's agent answers the helper with nothing, so a sheep reads "could not read Username" and never the sentence that names the sheep, pasture, and home; carrying it is pen's to change. Waits on work.
- **2026-09-11 — Open: `join.test.ts`'s terminal case warns and passes without running on macOS:** `script` will not start with a socket as stdin; `earmark.test.ts` gives it `/dev/null`, and its case ran. Waits on work.
- **2026-09-11 — The account ring on d37f9e6 failed at `s1` on the container cap, not the earmark:** `own` pushed with its own token, but beside a8 the sibling could rent no container (`max_instances` 3, idle 10 min; pasture's open debt). `s1` now runs after n1 and ends its own two.
- **2026-09-11 — Open: `s1` on the station.** Waits on the shepherd's account ring on the release with `s1` after n1.
