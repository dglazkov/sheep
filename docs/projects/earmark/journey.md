---
status: partial
since: 2026-09-11
see: earmark
note: "written 11 Sep 2026, the morning mint closed, from the shepherd's issue #5 (a secret for one sheep, not for the whole pasture). A pasture's secrets are setup's environment for every sheep born into it, so a credential minted for one sheep has nowhere to go but a pasture of its own, and the brief and setup script are copied N times. Two phases: a sheep's secret as rows beside its row in the Directory, laid over the pasture's by name in setup's environment and in the broker; then the verb, the names in `sheep ls`, the docs, and the walk. Earmark phase 0 closed the same morning: the rows, the lay-over in setup and the broker, and the end taking them, proved in workerd against the fake container, falsified by two mutations. Earmark phase 1 the same day: `--secret` on `new`, one line of stdin per name, its refusals before any request, the names in `ls`, the guide and README, journey 5 in the home ring, the account ring's `s1` written; journeys 1 and 3 walked, journey 4 step 1 on the local home with Docker and a real model, each sheep's setup hashing its own value. Journey 2 step 2 was corrected: a refused push reaches the sheep as git's line, the broker's sentence is the cell's log. Journey 4 step 2, `s1` on the station, waits on the shepherd."
---

# Earmark — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. Pasture gave the herd one place for what
every sheep on a repository shares: the brief, the skills, `setup.sh`,
and secrets that are setup's environment in every fresh container born
there. A credential minted for one sheep is the wrong thing to put in
it, and the dog's only other move today is a pasture per sheep. **An
earmark is a secret for one sheep**: `sheep new --secret <NAME>` carries
a value to that sheep alone, its setup reads it over the pasture's of the
same name, and its end takes it away.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against the fake container in workerd and
against a real one on a home. [design.md](design.md) is the mechanism
and [phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **A sheep's secret**: a name and a value given at the mint, held by
  the Directory beside the sheep's row, read at the moment setup runs or
  the broker answers, and kept nowhere else.
- **Laid over**: where the sheep and its pasture both have a name, the
  sheep's value is the one used; the pasture's other names are used as
  before.
- **The fake container**: pen's, in workerd, reached through the same
  lease a real one is; the frames it was sent are a list a test can read.

## Journey 1: One pasture, one herd, one sheep somebody in particular

The dog has a pasture with a `setup.sh` whose tree the whole herd shares,
and a secret `PROBE` set on the pasture. One sheep needs its own `PROBE`.

1. `printf '%s\n' "$value" | sheep new --pasture <p> --secret PROBE
   --detach` prints the id alone, exit 0, nothing on stderr; the value is
   on no command line and in no output.
2. `sheep ls` has the sheep with `PROBE` in its last column; `sheep ls
   --json` has `"secrets": ["PROBE"]`. A sibling minted into the same
   pasture with no `--secret` has the empty column and `"secrets": []`.
3. The first prompt to each births it: the clone, then `setup.sh`, in
   one container. The earmarked sheep's setup sees its own `PROBE`; the
   sibling's sees the pasture's. Both see the pasture's other secrets.
4. The model's own commands see no secret of either kind: `env` in the
   container, in either sheep, prints neither value.
5. `sheep rm <id>` on the earmarked sheep prints `<id>\tended`, and the
   Directory holds no secret for that id afterwards. The pasture's
   `PROBE` is untouched: the sibling's next fresh container reads it in
   setup as before.
6. `sheep new --pasture <p> --secret A --secret B --detach` with two
   lines on stdin carries both, in the order named; `sheep ls` lists
   `A,B`.

Acceptance criteria:

- The earmarked value is in exactly one kind of frame the fake container
  is sent: setup's `run` frame, in that sheep's containers only. It is in
  no route's answer, no transcript entry, no export, no log line, and no
  frame of the sibling's.
- After step 1 the cell's storage still holds no table: a mint with a
  secret touches the Directory and nothing else, as mint's rule says.
- After step 5 a `SELECT` over the Directory's secrets for the ended id
  finds nothing.

## Journey 2: A credential of its own

The dog has a pasture on a repository with no `GIT_TOKEN`, on a home
whose `PEN_GIT_TOKEN` is unset or is for something else, and one sheep
that should push with a token minted for it.

1. `sheep new --pasture <p> --secret GIT_TOKEN --detach`, the token on
   stdin, then a first prompt that commits and pushes: the push succeeds
   with the sheep's token, handed over by the broker and never in the
   model's view.
2. A sibling born into the same pasture with no secret is refused the
   push: the broker refuses the credential in a sentence that names the
   sheep, the pasture, and the home, and no value, and the helper gives
   git nothing, so git says it could not read a username and no branch
   reaches the repository. The sentence is the cell's log line, as every
   broker refusal has been since pen; the sheep reads git's.
3. With `GIT_TOKEN` set on the pasture as well, the earmarked sheep's
   push still uses its own; the sibling's uses the pasture's.
4. A sheep born into no pasture with `--secret GIT_TOKEN` pushes with its
   own token over the home's `PEN_GIT_TOKEN`; its host is the home's
   `PEN_GIT_HOST`, as a pastureless sheep's always was.

Acceptance criteria:

- `GIT_TOKEN` is never in setup's environment, the sheep's no more than
  the pasture's.
- The birth's clone asks the broker as any git command does, so a sheep
  whose own token is the only one that can read the repository is
  cloned with it.
- The broker's log line says which of the three the value came from
  (`this sheep`, `pasture <p>`, `the home`), never the value.

## Journey 3: Refused before the mint

The dog gets something wrong. Every refusal is one sentence on stderr,
exit 2, nothing on stdout, and no sheep minted: `sheep ls` is unchanged.

1. `sheep new --secret PROBE --pasture <p> --detach` with stdin a
   terminal: the value is stdin, never an argument and never typed;
   pipe it in.
2. Two `--secret` names and one line on stdin, or one name and two
   lines, or an empty line: one line of stdin per name, in order.
3. `--secret 1BAD`, or the same name twice: a secret's name is an
   environment variable's, once.
4. `sheep new --secret NPM_TOKEN --detach` with no `--pasture`: a sheep
   born into no pasture has no setup, so `GIT_TOKEN` is the only secret
   it can carry.
5. `sheep new --secret PROBE --pasture <p>` with neither `--detach` nor
   a prompt: pi's terminal needs stdin, and the secret is read from it.
6. `sheep attach <id> --secret PROBE …` and `sheep -c --secret PROBE …`:
   a sheep's secrets are given at its mint.

Acceptance criteria:

- Steps 1 to 6 ask nothing of the home; step 4 is refused by the home as
  well, before the row, for a client that is not this CLI.
- The home ring's journey 5 test carries steps 2 to 6 against a real
  `wrangler dev`.

## Journey 4: The walk

The conductor wants the earmark proved where a container is real and a
model answers, and where the token is real.

1. On the local home with Docker and a real model, journey 1 as written:
   a pasture with a public repository, a `setup.sh` that writes a short
   hash of `$PROBE` beside the checkout (never the value), the pasture's
   `PROBE` and one sheep's own; the two hashes differ as the two values
   do, and the model's `env` shows neither.
2. The account ring's walk gains a step after n1, on a station whose
   sheep are ended and whose containers are gone: journey 2 steps 1 and
   2 against the scratch repository, with the shepherd's playground
   token as one sheep's `GIT_TOKEN` and on no pasture; the earmarked
   sheep's branch is seen on GitHub, the sibling's push is refused and
   its branch is not, the step ends both sheep itself, and the branch is
   deleted afterwards. **⚑** it deploys a station on the shepherd's
   account and uses the shepherd's token.

Acceptance criteria:

- The token is absent from every transcript, export, `ps` sample, and
  command line of the walk, as a8's already is.
