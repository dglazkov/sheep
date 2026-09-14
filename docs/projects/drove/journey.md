---
status: partial
since: 2026-09-14
see: drove
note: "planned 14 Sep 2026 from town's sheep constellation, the morning road closed: `town` as a tier-0 program in the cell, the grant a sheep's earmark or its pasture's secret, proved by road's conformance script through a peek into the sheep's shell, and closed by a walk shipped as a script, a dog minting a sheep with a grant from the operator's box that works memory and github. Built in a second checkout, ../sheep-drove, on branch drove, against a second station of its own. Drove phase 0 closed the same day: `town` in every sheep's shell, written from the contract alone, the grant read at each run and kept out of the shell, setup, rows, and logs, proved in workerd against a fake town with three mutations falsified. Drove phase 1 closed the same day: `sheep sh`, a peek into a sheep's shell outside any turn, carrying bytes, and the bridge, so town's conformance script at 473687e printed `conformant: 30 checks` twice through sheep on the local home; the second station and the walk against the box are next."
---

# Drove — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. Town is the shepherd's other repository:
a person who runs a town hands an agent a **grant**, the town's address
and a bearer token, and the agent types `town` and words; the harness
sends the words to the town and prints what comes back. Road wrote that
wire down as a contract any harness may implement. **Drove is the
harness a sheep carries**: `town` in its shell, its grant given at the
mint the way earmark gives a secret, and the walk that proves it, a dog
minting a sheep that reaches a town over the wire and nothing else.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against a fake town in workerd and
against the operator's box from a station. [design.md](design.md) is
the mechanism and [phases.md](phases.md) the walk. If a journey and the
mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **The grant**: `TOWN_GRANT`, one line of JSON naming a town and a
  token, given to a sheep as its own secret or set on its pasture.
- **The contract**: town's `docs/harness.md`, ten sections; a
  citation like §7 is to it.
- **Conformance**: town's `scripts/conform.mjs`, run from a town
  checkout, thirty checks against a harness command it is given.
- **The peek**: `sheep sh <id> -- <line>`, one line run in a sheep's
  shell by the dog, outside any turn.
- **The bridge**: the harness command conformance runs, which answers
  each check through a sheep minted with the check's grant.
- **The stage**: `scripts/drove.mjs`, the walk set up and struck.
- **The box**: the operator's town, `town.dglazkov.workers.dev`.
- **The second station**: the one deployed from this checkout's kennel.

## Journey 1: A sheep with a town

The dog holds a grant for the operator's box, minted with `townd admin
--town <box> pass new` at the memory shop.

1. `jq -c . < grant.json | sheep new --secret TOWN_GRANT --detach`
   prints an id and exits 0. `sheep ls` names `TOWN_GRANT` in the
   sheep's secrets column and shows no value.
2. `sheep attach <id> -- "run town with no words and tell me what you
   can do"` streams a reply that names the memory shop and its
   commands, as the town rendered them for this grant.
3. `sheep log <id>` shows a `[tool bash]` block whose command is `town`
   and a `[result bash]` block holding the town's help, the notice line
   among it. No line of the log holds the token's bytes.
4. `sheep sh <id> -- env` prints the shell's environment, and
   `TOWN_GRANT` is not in it. `sheep sh <id> -- 'town memory
   remember "the drove walk"'` exits 0, and the town's audit, `townd
   admin --town <box> audit --pass <id>`, shows both calls under this
   pass with their results.
5. `townd admin --town <box> pass revoke <id>`, then `sheep sh <id> --
   town` exits 3 with one line on stderr saying the pass is not valid,
   in the town's words; the line holds no part of the grant.
6. `sheep rm <id>` ends the sheep. `sheep ls` no longer lists it.

## Journey 2: The contract, check by check

The conductor has a town checkout built at a named commit, and a local
home up in this checkout's kennel.

1. `node <town>/scripts/conform.mjs --list` prints thirty checks and
   their sections.
2. `node <town>/scripts/conform.mjs -- node <sheep>/scripts/conform-sheep.mjs
   --kennel <kennel> --state <dir>` prints `ok <name> (§n)` thirty
   times and `conformant: 30 checks`, exit 0. `sheep ls` shows seven
   sheep minted by the bridge, one per grant the checks name once each
   is compacted to a line: pass A's, A's with a trailing slash, pass
   B's, a JSON value that is no grant, a bare token, a grant at a closed
   port, and none.
3. Run again with the same `--state`, the same thirty lines, exit 0.
   `sheep ls` shows thirteen: conformance makes a new town and new
   passes each run, so six of its grants are new sheep, and the sheep
   with no grant is the one reused.
4. `node <sheep>/scripts/conform-sheep.mjs --state <dir> --teardown`
   ends every sheep the state names; `sheep ls` shows none of them.
5. With the second station in the kennel instead of the local home and
   `--town <box>` given to conformance, the same thirty lines, exit 0:
   the sheep's `town` reached the box over the wire from the cell.

## Journey 3: The grant is the sheep's, or the herd's

1. `sheep new --detach` with no secret mints a sheep; `sheep sh <id> --
   town` exits 3 with one line on stderr: this sheep carries no grant,
   mint one with `sheep new --secret TOWN_GRANT`, or set the pasture's.
   The sheep's system prompt does not name `town`: on a faux home, a
   faux step that answers with the prompt it was given puts it where
   `sheep export` reads it.
2. `sheep pasture new herd` then `jq -c . < grant.json | sheep pasture
   secret set herd TOWN_GRANT`; `sheep new --pasture herd --detach`;
   `sheep sh <id> -- town` exits 0 with the town's help: a sheep born
   into a pasture with a grant has a town, and its prompt names it.
3. `jq -c . < other.json | sheep new --pasture herd --secret TOWN_GRANT
   --detach`, a grant at a different town; `sheep sh <id> -- town`
   answers with that town's help: the sheep's own lay over the
   pasture's.
4. `printf 'not a grant\n' | sheep new --secret TOWN_GRANT --detach`;
   `sheep sh <id> -- town memory remember x` exits 3 with one line on
   stderr, and the line does not contain `not a grant`; `sheep sh <id>
   -- town --json memory remember x` prints one line of JSON with
   `ok` false, `exit` 3, an `error` line, empty `output`, empty
   `notices`, and nothing on stderr; the value is in neither.
5. A pasture's grant set after a sheep was born there, `sheep pasture
   secret set herd TOWN_GRANT` on a pasture that had none: `sheep sh
   <id> -- town` on the sheep born before it now answers with the
   town's help, since the grant is read at each run, while its prompt,
   built at its boot, still does not name `town`; one born after it
   is told.

## Journey 4: The dog looks in the pen

1. `sheep sh <id> -- 'echo hello; exit 4'` prints `hello` and exits 4.
2. `printf 'a\tb\n' | sheep sh <id> -- 'cat | od -c'` shows the tab and
   the newline: stdin reached the line as given.
3. `sheep log <id>` has no entry for either: a peek is not a turn.
4. While a turn is open, `sheep sh <id> -- true` exits 2 with one
   sentence: the sheep is mid-turn; wait or abort first. `sheep abort
   <id>`, and the same peek exits 0.
5. `sheep sh <id> -- 'ls / && git status'` on a sheep in a pasture with
   a container runs where the router sends it, the container, and
   prints the container's root: a peek is the shell, whole, and not a
   second shell.
6. `sheep sh nosuch -- true` exits 2 with the home's sentence for an
   unknown session, the one every verb gives.

## Journey 5: The walk, as a script

The shepherd has the second station in this checkout's kennel, the
box's operator token where townd reads it, the box holding `town/github`
with a `github-token` credential for a user, and an issue on a
repository that credential can comment on. Town's github shop lists,
shows, and replies; it opens no issue, so the walk leaves a comment.

1. `node scripts/drove.mjs --box <box> --user <name> --repo
   <owner/name> --issue <n> --townd <path>` prints, in order: the pass
   it made for that user and the shops granted; the sheep it minted;
   the sentence it sent; the wait, ending in the sheep's last message,
   which names the comment it left and a line it remembered; the
   audit's rows for the pass, by command and result, with `memory
   remember` and `github reply` among them; the
   search's verdict, that the token's bytes were found in none of the
   log, the export, the status, and the shell's environment; the
   revoke; the end. Exit 0.
2. The comment is on the issue on GitHub, written with the box's
   credential, and holds the line the memory shop holds. `townd admin --town <box>
   audit --pass <id>` from the laptop shows the same rows the report
   showed, over the wire.
3. `node scripts/drove.mjs --status <root>` prints the report again
   from the root the walk left. `node scripts/drove.mjs --teardown
   <root>` removes the root and, if the walk was `--keep`, revokes the
   pass and ends the sheep.
4. A second run mints a second sheep in one command and leaves a second
   comment. Nothing was typed between the command and the report.
