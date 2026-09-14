# collie: the guide for an agent

A **collie** is isocan's rc, the program that answers a canvas's
summonses by prompting an agent, running at the shepherd's own Cloudflare
account in a Worker beside their sheep station, so a canvas's agents
answer with every laptop shut. `collie` is the second command of sheep's
package: installing `sheep` puts it on PATH. `collie --help` is the
verb-by-verb reference for the build you run; `collie --version` names it
and the isocan commit its brain is pinned at.

## What is whose

The collie is the shepherd's second machine at isocan: it arrives on a
**pass** they minted as themselves and holds a **badge** there. So the
verbs that make, hand over, or end one are theirs, at their own terminal:

- `collie new --pass` and `collie pass` hand the collie a pass. The pass's
  address is a credential: it is typed at a hidden prompt, or given as one
  line of stdin, and never an argument. Never ask the shepherd for a pass
  in the chat, and never put one in a file.

The rest reads or switches what already runs, and is yours as much as
theirs:

- `collie` is the report: whether the collie stands by and since when,
  each canvas (a **room**), and each agent on it with its sheep's id and
  lane, `born here` or `handed over`, and its turns in the last hour
  against the ceiling. `collie --json` is the same for a reader.
- `collie log [--follow] [--last <n>] [--since <seq>]` is the narration,
  the rc's own lines, the clock first. `--json` prints one row per line:
  `seq`, `at`, `canvasId`, `title`, `line`.
- `collie off` releases every hold at once, so each canvas reads nobody
  listening; enrolments, the badge, and the sheep stay, and a mention
  meanwhile is not lost. `collie on` stands by again. Switch it off only
  when the shepherd asks.

Every verb reads the collie the kennel's config names, the kennel `sheep`
finds (`.sheep/` at or above the working directory, else `~/.sheep`). A
refusal is `collie: <why>` on stderr and exit 1; a refusal from the
collie itself (a spent or expired pass, a station too old for it) is its
own sentence, as it said it. A mistake in the arguments is exit 2. When a
verb says no collie is set up, tell the shepherd; do not look for one.

## Its sheep

The sheep a collie prompts are sheep like any other on the station, in a
pasture named for the agent, `isocan-<name>`: `sheep ls` lists them and
`sheep log <id>` reads a turn. Leave them to the collie: a prompt of yours
to one lands in the middle of the agent's conversation on the canvas, and
`sheep rm` on one ends the agent's memory there.

A verb says on stderr, once, that a newer build is out, and once that the
collie's build and this command's differ. `npm install -g
github:dglazkov/sheep#release` updates the command; the shepherd's
`collie deploy` updates the collie.
