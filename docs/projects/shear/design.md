# Shear — the design

**13 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk.

The thesis in one line: **a dog hears once that a newer build is out and
once that its home is older, upgrades each with the command that already
exists, is refused a deploy that would interrupt a herd unless it says
`--now`, and is told in a sentence when a home is too old for the verb it
ran; nothing is fetched or replaced on its own.**

## The shape, and where it came from

Codex upgrades by `npm install -g @openai/codex`, and the old copy says
the version is out of date. That shape fits sheep's command exactly, and
the pieces exist: the release's manifest carries a commit and a time
(collar), the same manifest is readable at the release branch's tip on
GitHub, and `npm install -g github:dglazkov/sheep#release` resolves the
tip every run. Isocan needed more, a managed install root and a symlink
flip, because a daemon on the laptop outlived the command. Sheep has no
daemon on the laptop. Its long-lived process is the home, and `sheep
home deploy` already replaces it (station). So the isocan dance is not
taken, and what is added is what codex has plus the half codex does not
have: the home.

Three things make sheep's half harder than codex's, and each is one
decision here.

- **Out of date is the permanent state.** Main took thirty to fifty
  commits a day this week, and each is a release. A notice on every
  command fills the dog's transcript with the same line. So every line
  here is said once, remembered in one file, and said again only when
  what it names changes.
- **The reader is a dog, and a deploy resets every cell.** A new Worker
  version restarts the Durable Objects holding running turns, and the
  interrupted model calls run again (tether). The dog may deploy, since
  the token is kept and the deploy asks nobody anything; but it must not
  do that to a herd mid-turn without knowing, this machine's or another's.
  So the deploy lists the sheep mid-turn and refuses, and `--now` is the
  word for "I know".
- **Skew is normal and only half watched.** Only `sheep home` compares
  stamps today. A verb from a newer command at an older home answers a
  bare 404 that means nothing, and two machines make skew certain. So
  the home says its build on every response, any command notices, and
  a verb the home lacks is refused with the sentence that fixes it.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the stamp | the release's commit and time, in the manifest under `sheep` and on the home at `GET /home` | `local.ts` (`readStamp`), `packages/cell/src/index.ts` |
| the tip | the release branch's manifest as GitHub serves it, `https://raw.githubusercontent.com/dglazkov/sheep/release/package.json`; its `sheep.commit` and `sheep.builtAt` | fetched by the command; `SHEEP_TIP` names another URL for the fakes, `SHEEP_TIP=0` turns it off |
| the notice | the one stderr line that a newer build than this command is out, and the install sentence | `tip.ts` |
| the said file | `~/.sheep/tip.json`: the tip last fetched and when, the build the notice was last said for, and the pair of builds the skew line was last said for | `tip.ts`; beside `tools`, never per kennel |
| the header | `x-sheep-build: <commit> <builtAt>` on every response the Worker sends | `packages/cell/src/index.ts` |
| the skew line | `skewLine` as it is, printed from the header by any command once per pair of builds, and by `sheep home` every time | `local.ts`, `home.ts` |
| the floor | `OLDEST_HOME`, the build time of the oldest home this command's verbs speak to; a constant, bumped by hand | `home.ts` |
| the guard | `sheep home deploy`'s refusal while any sheep's lane is `running` or `waiting`; `--now` passes it | `deploy.ts` |

## The notice

A command run from the release, with a home to talk to, starts one
fetch of the tip beside its verb: a two-second `AbortSignal.timeout`, no
retry, and never waited for. If it answers before the verb ends, the
said file gets the tip and the time; if it does not, the verb's exit is
not delayed by a millisecond and the next command tries again. A tip in
the said file less than a day old is not fetched again. At the end of a
command, when the kept tip's time is newer than this command's stamp and
the tip's commit is not the one the notice was last said for, stderr
gets one line:

    sheep: a newer build 5511bf9 (2026-09-13T18:26:23Z) is out; this command is a2b17e7 (2026-09-13T18:14:51Z); `npm install -g github:dglazkov/sheep#release` updates it

and the said file records the commit. The line is stderr, so `--json`'s
stdout is what it was. It is never said from a checkout (no stamp), by
`--version`, `--help`, or `--agent-help`, when `CI` is set, or when
`SHEEP_TIP=0`; the rings set that, so no ring reaches GitHub, and the
account ring alone leaves it on, since it installs an older release
first and is the one place the real tip is read against a real command.

Why the command fetches and not the home: a home deployed before shear
would never say it, and a laptop that can reach GitHub for `npm
install` can reach it for one kilobyte. Why the tip and not `git
ls-remote`: the sha alone has no time to compare, and the manifest is
the same object the install would fetch.

## The header and the skew line

The Worker sets `x-sheep-build` on every response it returns, the
stamp's commit and time separated by a space, in the one place its
`fetch` hands a response back; a home from before shear sends none. The
CLI's `Home` reads it on the first response of a command and remembers
it for the process. At the end of the command, when the header names a
build and the pair (home build, command build) is not the pair the said
file has, the skew line is printed once and the pair recorded. `sheep
home` prints it every time, as now: that is the status command, and a
dog asking is told.

The rule in `skewLine` changes in one place: two sides with the same
commit and no `-dirty` marker are not skew, whatever their times. Smit's
walk found the line telling a same-commit station to `npm install -g`,
which cannot help. A dirty side is compared by time as it is, since two
dirty builds of one commit are two trees.

## The floor

`OLDEST_HOME` is an ISO time, the `builtAt` of the oldest release whose
routes and wire this command speaks; it starts at the release that ships
the header and moves by hand when a route is added, a route's answer
changes shape, or the pi pin moves (`/pi-bump` says to look at it). It is
applied where a refusal is already made into an error, in `Home.request`
and `Home.ask`: a 4xx other than 401, from a home whose header is absent
or older than the floor, throws with one more sentence appended:

    the home's build a2b17e7 (2026-09-13T18:14:51Z) is older than this command speaks to; `sheep home deploy` from this package updates it

(`a build from before the header` where there is none). A 5xx is not a
verb the home lacks but a route that failed, and a route that throws
answers workerd's own 500 with no header (shear phase 0), so a current
home would read as one from before the header; a 401 is the token. Neither
gets the sentence. A response that is ok is never touched: an older home that still answers a verb keeps
answering it, since nothing refuses on skew alone (station). The wire
itself needs no floor here: pi's codec already refuses a
`PROTOCOL_VERSION` that is not its own at attach, and a pi bump that
moves it is exactly when the floor moves too, so the dog reads the
sentence and not the codec.

The reverse, an older command at a newer home, is the skew line's other
branch and stays a line: a newer home keeps every old route, since a
route is never removed in a release, and the day one is, the header
carries the home's own floor and the command compares itself to it.

## The guard

`sheep home deploy` against a station that answers asks `GET /sessions`
with the kept token before the join store and before wrangler, and
counts the rows whose lane is `running` or `waiting`. Any, and it exits
2 with the rows, `<id>  <task>` one per line, and one sentence: these
sheep are mid-turn, a deploy restarts their turns and runs their
interrupted calls again, `--now` deploys anyway. With `--now` the deploy
runs as it does today and the report gains `interrupted: <n>`. A first
deploy has no station to ask; a station that does not answer is
deployed, since that is the recovery path and the guard cannot know.
The stile's deploy is a first deploy and is not touched.

## What does not change

- **The install, the deploy, the delete, the join.** The upgrade is the
  two commands the README names, and nothing runs either on its own.
- **`sheep home`'s output on stdout,** `GET /home`, the release script,
  the bundle, and every ring's walk except the account ring's, which
  gains the lines above as expectations.
- **The dog's commands' stdout.** Every line here is stderr.

## What this does not do, on purpose

- **Upgrade anything by itself.** No fetch of a build, no install, no
  deploy, no managed root. The dog runs two commands and reads three
  lines.
- **Refuse a downgrade.** Storage migrations only add classes, so an
  older Worker over a newer home's rows is safe today; the guard that
  earmark left out stays out until a migration removes something.
- **Guard the local home.** `sheep home stop` and the restart from the
  package are the developer's, on their own machine.
- **Refresh the skill doorway from any command.** `sheep setup` does it,
  and the guide says to run it after an install.
