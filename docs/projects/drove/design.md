# Drove — the design

**14 September 2026.** Design, nothing built. It is the star **drove**
cut from town's [sheep constellation](https://github.com/dglazkov/town/blob/main/docs/drafts/sheep-constellation.md),
the third project of town's night sky after baton and
[road](https://github.com/dglazkov/town/blob/main/docs/projects/road/design.md),
and the sheep half of the seam road is the town half of: road wrote
the wire down as a contract any harness may implement, and drove is the
harness a sheep carries. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.
The project is planned and built in a second checkout of this
repository, `../sheep-drove`, on a branch `drove`, while
[collie](../collie/design.md) holds the first; the branch lands on
`main` when collie's does, and the station it deploys is that
checkout's kennel's, a second station on the account.

The thesis in one line: **town's wire is small enough that its harness
is a just-bash custom command in the cell: `town` as a tier-0 program
like `look`, holding the sheep's grant read from the Directory at the
moment of use, posting through the Worker's own `fetch`, printing what
comes back, and exiting with the code it was given, so the model never
sees the grant and a sheep that carries none is told so in §2's
refusal; and the walk that closes it, a dog minting a sheep
with a grant from the operator's box that works memory and github, is
shipped as a script, since every walk after it is run by that script.**

Two rules bind the seam and hold here. Town never imports or reads
sheep's files, and sheep implements town's wire from its doc,
[`docs/harness.md`](https://github.com/dglazkov/town/blob/main/docs/harness.md),
never from its code: the program is written from the ten sections, and
the proof that it was is road's conformance script, run from a town
checkout as a program, its commit named in the findings. And earmark's
rule stays: a secret is never in the model's environment. The grant is
the program's, not the shell's.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| `town`, the program | a just-bash custom command in every sheep's shell; tier 0, no row in the table, as `look` is | `packages/cell/src/env/town-command.ts`, wired where `look` is in `execution-env.ts` |
| the grant | `TOWN_GRANT`, the grant itself as one line of JSON, `{ "town": <url>, "token": <token> }`: the sheep's earmark, or the pasture's secret of that name, the sheep's laid over the pasture's | the Directory's `session_secrets` and the pasture's object; read at each run, never the shell's environment |
| the contract | what a harness posts, prints, refuses, and exits with, in ten numbered sections | town's `docs/harness.md`; §2 the grant, §4 stdin, §7 the refusals, §8 the exit codes |
| the peek | one line run in a sheep's shell by the dog, outside any turn and outside the transcript, its stdout, stderr, and exit code returned | `POST /s/<id>/sh` on the cell; `sheep sh <id> [-- <line>]` |
| the bridge | the command town's conformance script runs as the harness: it maps the `TOWN_GRANT` the script sets into a sheep minted with that earmark and runs each check's words through the peek | `scripts/conform-sheep.mjs` |
| the stage | the walk's set-up and strike, as a script: a pass on the box, a sheep minted with it, the sentence, the wait, the log and the audit, the search, the revoke, the end | `scripts/drove.mjs` |
| the second station | a station deployed from this checkout's kennel, named by kennel's rule from the directory, beside the shepherd's own | `../sheep-drove/.sheep`, Worker `sheep-drove` or the counter's next |

## What exists, exactly

Read from this checkout at `7aac0c8` and from town at `80496d2`, 14 Sep
2026.

- **A tier-0 program is a just-bash custom command.** `look` is one:
  `defineCommand` in `look-command.ts`, pushed onto the shell's
  `customCommands` in `execution-env.ts` when the home has eyes, its
  name in a set the router counts as tier 0 beside just-bash's own, and
  the prompt's paragraph naming it only in a cell that has it. A line
  that is all tier 0 runs in just-bash whether or not a container is up.
  A custom command gets its words, its stdin as text when the pipeline
  gave it some, and returns `{ stdout, stderr, exitCode }`; just-bash
  swallows thrown shapes, so a refusal is a return.
- **A sheep's secret is a Directory row, read at the moment of use.**
  Earmark's `Directory.secrets(id)` is an RPC method with no route;
  `laidOver` in `cell.ts` reads the pasture's and the sheep's when setup
  runs and lays the sheep's over by name. The Worker refuses, before any
  row, a secret on a sheep born into no pasture unless it is
  `GIT_TOKEN`, since a pastureless sheep has no setup and the value
  would reach nothing. The model's commands run with no secret in their
  environment, and no route returns a value.
- **The wire.** `POST <town>/call`, `authorization: Bearer <token>`,
  body `{ "argv", "stdin", "json" }`; the answer `{ "stdout", "stderr",
  "exit" }` whatever the status, a 500 with a `why` among them; anything
  else is a town that did not answer. `--json` is the harness's wherever it stands. The
  harness's own four refusals are one line on stderr, or with `--json`
  a five-field envelope on stdout, and never hold what `TOWN_GRANT`
  holds. A call is posted once. The town gives a shop thirty seconds.
- **Conformance runs a command.** `node scripts/conform.mjs [--town
  <url>] -- <harness command…>` starts a town on a free port, or uses a
  box with the operator's token townd reads, and runs the harness
  command once per check from an empty directory under an empty `HOME`,
  with its own environment less every `TOWN_*` name and `TOWN_GRANT` set
  as the check says, eight ways: pass A's grant as townd printed it,
  indented; the same wrapped in white space; the same with a trailing
  slash on its `town`, compacted; revoked pass B's; a JSON value that is
  no grant; a bare token; a grant at a port nothing listens on; or
  unset. Before any town, it runs the harness once with no grant and no
  words, and an exit of 126 or 127 there is no verdict. Stdin is nothing, a pipe, a regular file, or a
  socket held open and never written. Thirty checks; two seconds on the
  laptop binary; five over the box.
- **The dog reaches a cell over `/s/<id>/…`.** The router forwards
  under the home's token to the cell's own routes: `GET /`, `GET
  /transcript`, `POST /prompt`, `POST /abort`, `DELETE /`, `GET
  /export`, and `/faux` when the provider is faux. No route runs a line
  in the shell. `sheep` has no verb that does.
- **A kennel has one station, and two kennels two.** `sheep home
  deploy` from a checkout bundles the cell from source, builds the pen
  image with Docker, marks the Worker with the checkout's commit and
  `-dirty`, and names the station by kennel's rule: the directory's
  name and a counter against what the account already calls something.
  The hermetic account ring deploys `sheep-hermetic-<sha>` the same way
  and deletes it after. `SHEEP_HOME` and `SHEEP_TOKEN` reach a home for
  one command with no kennel.
- **Town's walk script** sets a stage a conductor walks: a town, a
  shop, a pass, a grant, an agent's directory with a `town` shim on its
  PATH; `--status` reads the pass's audit as a tree; `--search` finds
  the token's bytes under a root; `--teardown` revokes and removes. Over
  a box, every verb is `townd admin --town <url>`. Nothing in it mints
  a sheep, and it never will: that script is town's, and a sheep is
  sheep's.

## The program

`town` is `defineCommand` over the contract, one section at a time,
and nothing that is not in the contract:

- **The grant (§2).** `town` is in every sheep's shell. At each run
  the value is read through the same lay-over `laidOver` gives setup,
  one name: the sheep's own `TOWN_GRANT` row over its pasture's secret
  of that name. A sheep with neither is §2's first refusal, exit 3, one
  line: `town: this sheep carries no grant; mint one with sheep new
  --secret TOWN_GRANT, or set the pasture's`. A value that does not
  parse as a grant, white space around the JSON allowed, is §2's
  second, exit 3, and its line never holds the value. So a pasture's
  secret set after a sheep's boot is used at that sheep's next run. The
  prompt's paragraph names `town` only in a sheep that carries a grant
  at its boot, as it names `look` only in a cell with eyes; the model
  is told of a town it has, and the shell answers for the rest. (The
  constellation's line gave a sheep with no grant no `town` and
  just-bash's not-found line; conformance's no-grant checks want exit
  3, and its probe takes 127 for a harness that cannot run, so the
  contract wins.)
- **The words (§3).** Every word as just-bash gave it, in order, empty
  words and spaces and non-ASCII kept; `--json` taken out wherever it
  stands and `"json": true` said. The program takes no flag of its own.
- **Stdin (§4).** What the pipeline gave, sent exactly as text, nothing
  trimmed and no newline added; nothing given is `null`. just-bash
  hands a custom command bytes (a latin1 string), so `town < file` can
  carry bytes that are not UTF-8, and the program refuses them, exit 1,
  after the grant is found. There is no terminal, device, or socket in
  just-bash, so the section's second rule has nothing to decide in the
  cell; it is decided on the laptop by the bridge, which is the
  harness's other half there (below). No limit of the program's own:
  the town's one-mebibyte refusal comes back as an answer.
- **The request (§5) and the answer (§6).** `fetch` of the Worker's
  own, `POST` to `/call` resolved against the grant's `town`, the three
  headers and the three fields; the answer's `stdout` and `stderr`
  written as given and `exit` returned. The three fields are the answer
  at any status, a 500 with a `why` included, since §6 says so and a
  town may answer a revoked pass's exit 3 at a 401. A body that is not
  the three fields, a redirect, or a `fetch` that throws, is a town that
  did not answer:
  one line, `town: the town at <origin> did not answer (<what>)`, exit
  1. The program waits sixty seconds for an answer, twice the shop's
  time, and then says so the same way.
- **The refusals (§7) and `--json`.** All four are the program's: no
  grant, exit 3; a grant value that holds no grant, exit 3, a `town`
  holding more than an origin among them, which §5 lets a harness
  refuse; stdin that is not UTF-8, exit 1; and a town that did not
  answer, exit 1. With `--json` among the words each is the five-field
  envelope on stdout, one line and a newline, stderr empty. None ever prints
  the value or any part of it, and the test that reads every line of
  every refusal for the token's bytes is the rule made a test.
- **Once (§10).** A call is posted once whatever its answer. No retry,
  no second request on a 500, on a timeout, or on a body that does not
  parse.
- **Notices (§9), exit codes (§8).** Passed through and returned;
  the program parses nothing the town said.

The program holds the grant for the length of one run and writes it
nowhere: not the environment (`env` in the sheep's shell shows no
`TOWN_GRANT`), not the transcript, not a log line, not the files table.
The `fetch` is handed in, as the eyes are handed to `look`, so the
checkout ring's tests give a fake town that records what it was sent
and answers as scripted, in the same isolate, and a test of a network
never runs.

## The peek

Conformance runs a harness command on the laptop, with the grant in
that command's environment and the check's stdin on its descriptor,
and reads what it printed and how it exited. The program lives in a
cell. Something has to carry a line into a sheep's shell and carry its
three outputs back, and today nothing does: the model's bash tool is
the only caller `Shell.exec` has. `POST /s/<id>/sh` is that carrier,
and `sheep sh <id> [-- <line>]` its verb: the line is run in the
sheep's shell exactly as a bash call of the model's would be, the same
router, the same tier, the same working directory, its stdin the
request's `stdin`, the bytes as base64, when there is one, and the cell
answers `{ stdout, stderr, exit }`. A line the router sends to the
container carries those bytes in its `run` frame. The verb prints the
two streams as given and exits with the code; with stdin piped or a
file, it sends the bytes as read, and decides nothing about them.

A peek is not a turn: no entry in the transcript, no model call, and
`sheep log` does not show it. It is refused with a sentence and a 409
while a turn is open, and a prompt that arrives while a peek runs
waits for the peek to end, so a dog and the model never interleave in
one shell; the dog waits or aborts first. It runs under the home's token
like every verb, on a station as on a local home, which is why it is a
verb and not a test-only route behind the faux provider: the proof runs
against a real station. Its one purpose today is conformance and the
walk's search; its shape, a dog looking into the pen, is the general
one, and the sheep skill says so in a sentence.

## The bridge

`scripts/conform-sheep.mjs --kennel <dir> [--state <dir>]` is the
harness command town's script runs, and it is two things and no more:

- **The mapping.** Its `TOWN_GRANT`, set by the script per check or
  unset, names which sheep answers: one sheep per distinct value,
  minted on first use with `--secret TOWN_GRANT` and that value, or
  with no secret when the variable is unset, kept in `--state`'s
  directory by the value's hash and reused for the run; conformance
  makes a new town and passes each run, so a second run's grants are
  new sheep, and only the no-grant sheep outlives a run. Earmark's value
  is one line and townd prints a grant indented, so a value that parses
  as JSON is compacted first, as the dog's `jq -c .` does, and one that
  does not is sent as given; the spaced grant lands on pass A's sheep,
  and a full run mints seven: pass A's, A's with the slash, B's, the
  JSON that is no grant, the bare token, the closed port's, and none. The kennel, given by path since the script runs under an
  empty `HOME`, names the home and holds the token; `SHEEP_HOME` and
  `SHEEP_TOKEN` are read when no kennel is given. The state records the
  kennel or home it minted on beside the ids, so `--teardown` ends every
  sheep the state names with nothing else given.
- **§4 on the laptop.** Its own stdin is read to the end when it is a
  pipe or a regular file and left alone when it is anything else; what
  was read is sent in the peek as bytes. Whether to read is the one
  contract rule the bridge answers for, because only it has a
  descriptor. Whether the bytes are text is the program's, after the
  grant is found, as §7 orders them: a sheep with no grant and bytes
  that are not UTF-8 is exit 3, which a bridge that checked first would
  have made exit 1.

Every other check's behaviour is the cell's: the words go to the peek
as given, each quoted for the shell, and the peek's stdout, stderr, and exit come back unread. A
mutation of the program, a second post of a call whose answer's exit
is not 0 say, fails conformance through the bridge (its town answers
every call at 200, so a retry keyed on a 500 is never seen); that is drove phase 1's falsification, and it is how a
reader knows the bridge is not a harness of its own.

## The grant, and earmark

Three small changes in earmark's territory, all in its terms:

- **A second secret a pastureless sheep can carry.** The Directory's
  refusal names `GIT_TOKEN` as the one secret a sheep born into no
  pasture can carry, since only the broker reads anything there.
  `town` reads `TOWN_GRANT`, so the refusal names two, and its sentence
  says why each reaches something. The verb's word-for-word twin of it
  changes with it.
- **Not setup's.** Setup's environment is a pasture's secrets with the
  sheep's laid over them, `GIT_TOKEN` out of both. `TOWN_GRANT` is out
  of both too: setup runs in the container's shell and prints what it
  likes, and the grant is the program's and never a shell's.
- **One line, the grant itself.** Earmark's value is one line; `townd
  admin pass new` prints the grant indented. The dog hands it as one
  line, `jq -c . < grant.json | sheep new --secret TOWN_GRANT`, and the
  stage does the same in Node. A value that is a path, road's other
  form, is not a grant here: a cell has no file at that path, and §2's
  refusal says so without printing it.

A pasture's `TOWN_GRANT`, `sheep pasture secret set <name> TOWN_GRANT`,
gives every sheep born there a town, the herd's grant, and a sheep's
own lays over it. That is the shape growth's walks want, two or three
sheep in a pasture on one grant, and it costs nothing here.

## The stage

`scripts/drove.mjs` is to drove what `scripts/walk.mjs` is to town: the
walk's set-up and strike, so the walk itself is the conductor's reading
and every later walk is one command. It runs the two commands the walk
needs, `sheep` from this checkout and `townd` from a town checkout or
install named by `--townd <path>`, and never reads either's files:

```
node scripts/drove.mjs --box <url> --user <name> --repo <owner/name> --issue <n> [--townd <path>] [--kennel <dir>] [--keep]
node scripts/drove.mjs --status <root>
node scripts/drove.mjs --teardown <root>
node scripts/drove.mjs --search <id> [--kennel <dir>] < token
```

The stage, in order: a pass on the box for the user, `townd admin
--town <box> pass new`, with grants at `town/memory` and at
`town/github`'s `reply` and `show`, the repository held to the one
given, on the user's `github-token` credential, which the stage finds
with `credential ls` and refuses to guess when there is none or more
than one; the grant compacted to one line and
piped to `sheep new --secret TOWN_GRANT --detach`; the sentence sent
with `sheep attach <id> -- <sentence>`; `sheep wait <id>`; then the
reading: `sheep log --json <id>` to the root, `townd admin --town <box>
audit --pass <id>` beside it, and the search: the token's bytes looked
for in the log, in `sheep export`, in `sheep status`, and in the peek's
`env`, and named if found; then `pass revoke` and `sheep rm`, both
unless `--keep`, whose pass and sheep `--teardown` revokes and ends.
`--search` is the search alone over one sheep, the token on stdin, so
the search can be seen to fail. `sheep export` is pi's tables, the
transcript and the session's values, and never the workspace, so the
places a token can reach are the transcript's and the shell's. The report is one block: the sheep's id, the pass's id, the
calls the audit holds by command and result, the memory row and the
comment the walk left, and the search's verdict. The token goes from
townd's stdout to `sheep new`'s stdin and nowhere else: not argv, not a
file under the root, not the report.

The sentence is the walk's and is written in the stage, so a run is
the same run: the sheep is told it has `town`, asked to run it with no
words and read what it can do, to remember one line about this walk
with the memory shop, to reply on the issue with the github shop
saying what it remembered, and to answer with what the shop printed
for the comment and the memory's line. Town's github shop lists,
shows, and replies, and opens no issue (read from its manifest at
`473687e`), so the walk comments on an issue the shepherd names rather
than opening one; a shop that opens issues is town's to add.

## The second station

The walk needs a station, and the shepherd's own is in use by collie's
walks from the first checkout. A station is a kennel's, and this
checkout has its own kennel, so `sheep home deploy` from
`../sheep-drove` mints a second one by kennel's rule, `sheep-drove`,
from this checkout with smit's mark, on the account's Paid plan that
already exists, and records it in that kennel's config. Nothing about
the shepherd's station changes, and nothing in collie's checkout. It
stays after the walk: it is the standing station the infra
constellation's stranger runs sheep against, and a hermetic run that
wants a station it did not mint. Its cost at idle is its objects'
storage; a container's minutes while a sheep rents one; the Worker's
requests. Deleting it is `sheep home delete` from the same kennel.

## What this does not do, on purpose

- **`town` in the container.** The container's bash has no `town`, and
  a line that mixes `town` with a tier-2 program, `git log | town memory
  remember`, is routed whole to the container and refused there. The
  prompt's paragraph says `town` is the shell's. Giving the container a
  `town` means giving it the grant, which is relay's shape, a window
  the town opens, and not drove's.
- **Narrowing.** A dog holding a grant mints a sheep that can do what
  the grant can; a narrower, durable grant with a parent is deputy's.
- **Setting or rotating the grant after the mint.** Earmark left it
  open and it stays open; a pasture's secret is set at any time and
  read at the next run, which is the rotation a herd needs.
- **A `town` for the laptop dog.** The dog has town's own binary.
- **The peek as a verb the model is told about.** It is the dog's.
