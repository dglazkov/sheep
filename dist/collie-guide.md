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

- `collie setup` is their third sitting, after `sheep setup` and `isocan
  setup`: it deploys the collie's Worker on their account beside the
  station. `collie deploy` redeploys it from this package; `collie rm`
  ends its badges and deletes it, once they type its name. When `collie`
  says none is set up, or a deploy is wanted, tell the shepherd which of
  the three to run; do not run them yourself, and never with a token of
  theirs.
- `collie new` and `collie pass` mint a pass through the shepherd's own
  `isocan`, as them, for the directory's canvas (or `--canvas <ref>`),
  and hand it to the collie; nobody sees it. With `--pass` they take one
  already minted: its address is a credential, typed at a hidden prompt
  or given as one line of stdin, and never an argument. Never ask the
  shepherd for a pass in the chat, and never put one in a file.
- `collie pass --agent <name>` moves an agent in: the pass carries that
  agent's claim, which the shepherd's identity must hold (an agent their
  laptop's `isocan rc` answers for). The collie answers for it from then
  on, resuming its sheep in `isocan-<name>`, and the laptop's rc stands
  down for it.

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
