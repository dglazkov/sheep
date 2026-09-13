---
status: planned
since: 2026-09-13
see: shear
note: "written 13 Sep 2026 after the shepherd asked for the upgrade story and liked codex's shape: `npm install -g` and the old copy says it is out of date. Sheep takes that shape for the command and adds the half codex lacks, the home. A command hears once from the release branch's tip that a newer build is out; the home says its build on every response, so any command says once that one side is older; `sheep home deploy` refuses while sheep are mid-turn unless told `--now`; and a verb a too-old home cannot answer is refused with the sentence that fixes it, by a floor the command carries. The skew rule stops calling two builds of one commit skew. Nothing is fetched, installed, or deployed on its own. Two phases: the notice and the header; the floor and the guard, walked in the account ring's `--older` upgrade."
---

# Shear — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. A **shear** takes the year's fleece off
and the sheep walks away none the worse, and it is done to every sheep
on the farm in its turn, never mid-lambing. Here it is the upgrade: the
build comes off the command and the home, a newer goes on, and no
session, pasture, or turn in progress is the worse for it.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against a real account. [design.md](design.md)
is the mechanism and [phases.md](phases.md) the walk. If a journey and
the mechanism disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **The release**: the package installed from `github:dglazkov/sheep#release`;
  its manifest carries the commit and time it was built at, the
  **stamp**, which `sheep --version` prints and `GET /home` reports.
- **The tip**: the release branch's manifest as GitHub serves it, whose
  stamp is the newest build there is.
- **The previous release**: the release commit before the tip, which the
  account ring installs first (`--older`).
- **The notice**: one stderr line saying a newer build than this command
  is out, with the install sentence.
- **The skew line**: `sheep home`'s one line saying which of the home and
  the command is older and what updates it.
- **Mid-turn**: a sheep whose lane is `running` or `waiting` in `sheep
  ls`.
- **A scratch kennel**: a directory that is not the checkout, with its
  own `.sheep/`. A walk never deploys from the checkout's own kennel.

## Journey 1: The dog hears that a newer build is out

The dog runs the previous release, installed on this machine, against a
station deployed from it; the tip is newer.

1. `sheep ls` prints its list on stdout as it always has, and within the
   day one stderr line:
   `sheep: a newer build <tip commit> (<tip time>) is out; this command
   is <commit> (<time>); `npm install -g github:dglazkov/sheep#release`
   updates it`. The command took no longer than its verb.
2. `sheep ls` again prints the list and no line.
3. `sheep --version` prints the stamp and nothing else, before and after.
4. `SHEEP_TIP=0 sheep ls`, and `sheep ls` from a checkout, and `sheep ls`
   with `CI` set, print no notice, ever.
5. With GitHub unreachable, `sheep ls` prints the list, no line, and
   returns as fast as before.

Acceptance criteria:

- The notice is said once per tip commit per machine, from
  `~/.sheep/tip.json`, and again when the tip moves.
- The tip is fetched at most once a day, beside the verb, and a verb
  never waits on it.
- Nothing in stdout changes, under `--json` or without.

## Journey 2: The dog upgrades the command, then the home

1. `npm install -g github:dglazkov/sheep#release` puts the tip's build on
   PATH; `sheep --version` prints the tip's stamp.
2. `sheep ls` prints its list and, once, the skew line: the home's build
   is older than this command's; `sheep home deploy` from this package
   updates it. `sheep ls` again prints no line. `sheep home` prints the
   line every time.
3. `sheep home deploy` reports `stamp: moved (<n>s)` and every session
   and pasture is still there. `sheep ls` afterwards prints no line.
4. On a second machine that joined this station, still on the previous
   release, `sheep ls` prints once that this command's build is older
   than the home's and names the install; after the install, nothing.

Acceptance criteria:

- The skew line comes from a header on every response, not from
  `GET /home`, so any verb sees it; it is said once per pair of builds
  per machine, and `sheep home` is exempt from the once.
- A station deployed from a checkout at the release's own commit, and
  the release's command, are not skew: no line, whatever their times.
- The upgrade is the two commands the README already names, and nothing
  is fetched, installed, or deployed by sheep on its own.

## Journey 3: The herd is mid-turn

1. `sheep new --detach -- "<a task that takes a minute>"` mints a sheep;
   `sheep ls` says `running`.
2. `sheep home deploy` exits 2 having deployed nothing, with the sheep's
   id and task on stderr and one sentence: a deploy restarts its turn and
   runs its interrupted calls again; `--now` deploys anyway.
3. `sheep home deploy --now` deploys, reports `stamp: moved` and
   `interrupted: 1`, and `sheep wait <id>` returns with the sheep's reply
   (tether).
4. With the herd idle, `sheep home deploy` deploys without a word about
   it.

## Journey 4: A home too old for the verb

1. Against a station deployed from a release before the header, the
   newer command's `sheep ls` and `sheep new` answer as they do today,
   and the skew line is not said, since the home names no build.
2. A verb that home has no route for is refused with the home's 404 and
   one more sentence: the home's build (`a build from before the header`)
   is older than this command speaks to; `sheep home deploy` from this
   package updates it.
3. After the deploy, the same verb answers.

Acceptance criteria:

- The floor is one constant in the command, an ISO time, compared to the
  header on responses that are not ok and nowhere else.
- `/pi-bump` names the floor as a thing to look at.

## Journey 5: The walk

1. The checkout and command rings hold journeys 1 to 4 against the fakes:
   the fake station serves the header and a manifest at `SHEEP_TIP`, and
   answers a lane `running` when told to.
2. **⚑** `pnpm hermetic --ring account --older <previous release>` walks
   journeys 1 to 3 on the shepherd's account: the previous release
   installed and deployed, its `sheep ls` printing the notice from the
   real tip, the tip installed, the skew line once, a sheep mid-turn
   refusing the deploy, `--now` moving the stamp, and the delete.
