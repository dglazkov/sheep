---
status: done
since: 2026-09-16
see: draft
note: "planned 16 Sep 2026 from the shepherd's issue #13, after the account ring failed three times before hill's `h1` and twice before collie's steps, each time at a step the phase being closed did not need. The ring is one sequential walk that re-proves every project since collar on one station, 30 to 45 minutes when it holds, and a transient platform fault anywhere sinks the run. Draft cuts it into walks that stand alone, each on a station of its own, runnable alone and run together. Two phases: the walks, then the set. Draft phase 0 closed the same day: eleven walks, each on a station of its own under the sibling rule, every one held alone on release 22d2fec, five at a time, in 125 to 493 seconds; the bell walk reached hill's `h1`; the split's two own defects (the table not copied into containers, the collie's address too long for the stile's screen) were found by the walks and fixed. Draft phase 1 closed the same evening: the set, the walks as children four at a time with one report, held whole in 1038 seconds on the same release, and a wrong token failed one walk while its siblings held. The project is done; what the walks found beyond it is issues #15 and #16."
---

# Draft — the journeys

Sheep is a repository for coding agents that herd coding agents. The one
with the terminal is the **sheepdog**; the ones it herds are **sheep**;
the person is the **shepherd**. The rings prove a release the way a user
meets it, and the outermost, the **account ring**, deploys a station on
the shepherd's Cloudflare account and walks it. **Drafting** is what a
shepherd does at the gate: one mob is sorted into pens, each pen gets
what it needs, and the pens are worked at once. The account ring's one
long walk is drafted into walks that stand alone.

Each journey is an acceptance test: the work is done when it can be
walked as written, in a ring, against the shepherd's account.
[design.md](design.md) is the mechanism and [phases.md](phases.md) the
walk. If a journey and the mechanism disagree, the mechanism is what
changes.

Vocabulary the journeys use:

- **A walk**: one journey's steps on the account, from a fresh world to
  its station deleted, named for the project whose journey it is:
  `upgrade`, `station`, `second`, `pasture`, `fold`, `spool`, `bleat`,
  `bell`, `tether`, `stile`, `collie`.
- **A walk's station**: the Worker and container application a walk
  deploys for itself, `sheep-hermetic-<sha>-<walk>`, and nothing
  another walk touches.
- **The set**: every walk, run together by one command.
- **A sibling**: another walk of the same release, on the account at the
  same time.
- **The rerun line**: the exact command that runs one walk again, alone.

## Journey 1: One walk, alone

A conductor is closing a phase whose proof names one journey on the
account, and wants that journey and nothing else.

1. `pnpm hermetic --ring account --walk bell --yes <ref>` runs the bell
   walk: the release installed into a fresh prefix, cache, and `HOME`;
   a station of the walk's own deployed from it; bell's `b2` and hill's
   `h1` on that station; every sheep the walk minted ended; the station
   deleted; the account's listing, its siblings set aside, equal to the
   listing before.
2. The steps print one line each, as the ring always has, with the same
   commands and the same assertions the full walk made.
3. The walk takes minutes, not the better part of an hour: the install,
   one deploy, the journey, one delete.
4. Nothing on the account but the walk's own station is made, changed,
   or deleted.

Acceptance criteria:

- Every walk can be run this way, and `pnpm hermetic --ring account
  --list` names each with its steps and what it needs beyond the token.
- A walk that needs what the machine lacks (Docker for `second`, the
  playground token for `pasture`, the key and dev.isocan.io for
  `collie`) says so and exits 2 before anything is deployed.
- Two walks of the same release run at the same time from two terminals
  both hold: neither counts the other's station in its listing.
- The `ps` watch for secrets runs through every walk.

## Journey 2: A walk that fails

A platform fault, or a real defect, stops a walk at a step.

1. The failing step prints its command and its output, as the ring
   always has, and the walk stops there.
2. The walk's station is deleted, and its join store with it, whatever
   step it failed at.
3. The last lines name the walk, the step, and the rerun line.
4. Exit 1.

Acceptance criteria:

- A retry costs that walk alone, from its install to its delete.
- A leftover of the walk's own name on the account is refused before
  anything is deployed, as the ring refuses one today.

## Journey 3: The set

A release is out and the conductor wants every journey on the account
proved against it.

1. `pnpm hermetic --ring account --yes <ref>` reads the account, the
   plan, the listing, and the image once, states the price once, and
   asks once.
2. The walks run as children, several at a time, each on its own
   station, each writing its own log under the ring's directory.
3. Each step's line is printed as it lands, prefixed with its walk's
   name.
4. A walk that fails does not stop its siblings.
5. At the end, one line per walk: held or failed, at which step, how
   many seconds; the rerun line for each that failed; then the account's
   whole listing, equal to the one before the set.
6. Exit 0 when every walk held, 1 otherwise.

Acceptance criteria:

- The set's wall clock is about the longest walk's, not their sum.
- `--jobs <n>` caps how many run at once; the default is written down.
- `--walk` given several times, or as a comma-separated list, runs those
  walks as a set.
- A walk the machine cannot run (`second` without Docker, `pasture`
  without the playground token) is left out with one line naming it,
  and the report's not-checked list names it too. `collie` is in the
  set only when named or when `--collie` is given, as before.

## Journey 4: A phase names its walks

A project's phase has a proof on the account.

1. The phase's Proof names the walks it needs by name, not the ring.
2. `pnpm hermetic --ring account --list` is where the names come from.
3. The house rules and the README say the account ring is a set of
   walks, and how one is run alone.

## Journey 5: Hill's debt

Hill phase 3 closed on one debt: `h1` had never run inside the account
ring, which failed three times before reaching it.

1. The bell walk reaches `h1` on the shepherd's account and holds.
2. Hill's Open finding is answered, in hill's own docs, with the
   release and the date.
