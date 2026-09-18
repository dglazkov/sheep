# Code red

Declared by the shepherd on 18 Sep 2026. Stands until they lift it. A session pointed at this file picks up here.

## The mode

- **The shepherd decides, the agent writes.** Propose in a sentence, ask when a choice is theirs, do exactly that. No unattended phases.
- **`/conduct` and `/plan-project` are suspended.** No new projects under `docs/projects/`, no journey/design/phases docs, no findings paragraphs. Work comes from the open issues and from the shepherd in chat.
- **Small commits, straight to main, verified narrowly.** Typecheck, the tests the change touches, a dry run where it is cheap. Watch CI on every push (about nine minutes) and fix red before anything else.
- **Pace is measured.** Read only what a change needs.
- **A live test gets a plan first**: numbered steps, a time per step, every wait named and why. The shepherd confirms before it runs. A person's pace between asks is seconds, never a scripted gap.
- **No shortcut walks.** A step taken by a route a person would not take (a config written by hand, an API call instead of the tray, a throwaway identity, credentials copied over ssh) is a step not walked. Say so, file it, and never call such a walk held for a person.

## Why

Two things. The product was poor when the shepherd used it on 17 Sep (#14, #17 to #25) after weeks of every ring reporting held. And each commit had come to cost far more time and tokens than it should. The shepherd's diagnosis: the conduct and plan machinery produced both.

## The objective

One person, with the prerequisites in hand, gets from nothing to an agent on a canvas that answers in under a minute, following a written page and nothing else. The journey, with what stands in its way today:

| # | Where | Step | Today |
|---|---|---|---|
| 0 | before sitting down | A Cloudflare account on Workers Paid with an API token, an Anthropic key, Node 22.19+ | nothing says so up front (#17) |
| 1 | terminal | `npx github:dglazkov/sheep#release setup`: two values at hidden prompts, the station deployed | 3 to 5 min, a minute of it wrangler (#26) |
| 2 | browser, isocan.io | sign in, create the canvas, open "Bring your own agent", copy the setup command it prints, which carries a pass minted as you | works |
| 3 | terminal | paste it: isocan installs, the daemon comes up, this machine becomes you, the directory is bound to the canvas | works only as the machine's first isocan command; a bare `isocan setup` first makes a stranger (isocan#329, isocan#330) |
| 4 | terminal | `collie setup`: the Worker beside the station, its badge minted as you | minted for whoever the machine is, without saying who (#27) |
| 5 | terminal | `collie new`: standing by on this directory's canvas, the link printed | works |
| 6 | browser | open the link, Add an agent, name her, mention her | the button is there only if steps 2 and 3 were the same person; otherwise nothing, and no word why (#27, isocan#330) |
| 7 | browser | the first reply | 2 to 5 min of setup with nothing on the page (#21, #23), the model's own work under 30 s |
| 8 | browser | every reply after, at a person's pace, with looks and isocan calls in them | under a minute each when nothing breaks; on 17 and 18 Sep a turn faulted and stalled for ten minutes (fixed 18 Sep, see below); each container replacement costs step 7 again (#21) |

The identity thread through steps 2, 3, 4 and 6 is the whole difficulty: one person, held by the browser, handed to the machine by the pass, carried by the collie's badge, checked by the tray. Every bug filed on 18 Sep is a break in that thread or a silence where it broke.

## What was learned on 18 Sep

**Fixed and deployed** (main at 82f34b6, sheep-2 running it, CI green):

- #20: the cell's catch-all logs a fault with its cause chain, and the Worker keeps its logs (`observability` on in `packages/cell/wrangler.jsonc`). The first replay named the cause within the hour: `HarnessFault <- Error: Connection closed: this Durable Object instance is no longer active.` A call into a Durable Object replaced under it; pi sealed every lane.
- #14 in part: a harness fault is logged once with the innermost cause's stack (the call site, still not seen since the fault has not recurred), the incarnation is forgotten as an eviction forgets it, its terminals closed with 1012 so they reattach, its container's socket closed, and the next touch boots from storage and takes up the open turn. Before, the sealed harness was served forever and the alarm replayed the fault every few seconds; the platform replaced the instance after 4.5 minutes on its own. The pen agent writes the close code to stderr on any close but the cell's own 1000.
- CI: the pi fork builds online (its model catalog is hydrated from models.dev at build; `build:offline` cannot work in CI); the fork took upstream's Kimi catalog fix (fork 1ece87566); the ring's c2 sentence matches the collie's current refusal; `cause.test.ts` is in the checkout ring.

**Measured**, from a Codespace joined to sheep-2 as a second machine:

- A first turn: 168 to 300 s, of which setup.sh (installing isocan in a quarter-CPU container) 123 to 268 s, the model under 40 s. The cache is refused because the sheep's pass is in setup's environment (#21). Every container replacement pays it again.
- Turns two and three on a warm container, with a write, a look in Chrome, an isocan add and a reply: 51 s and 38 s.
- A container exited on its own (exit 0) between turns, 4.5 minutes after the turn ended, before the ten-minute idle period, with no idle stop logged and the socket closed 1006 on both sides. Unexplained. The pen agent's stderr will say which side let go next time; container stdout/stderr are in the dashboard's container logs, not the Worker's.
- The log line "the lane idled; the container stops on its own after its idle period" fires after every tool run, not when the lane idles. It misleads.
- The collie's follow of a transcript dies on a 500 and does not come back (#23).
- An alarm fires every five seconds on a cell with a running container and one is canceled every minute on the minute; benign, the containers library's rescheduling.

**Filed** from the shepherd's own attempt at the journey (steps 2 to 6 by hand on a fresh Codespace; they stopped at step 6):

- isocan#329: setup's daemon left running from the npx cache; a second "what should we call you"; an error nobody can read.
- isocan#330: redeeming a pass keeps the old default person with no way to switch; the tray hides Add an agent from a non-owner and says "nobody is parked" while one is; nothing names the pass as the way; two people with one name and no id.
- #26: wrangler installed on a friend's machine to deploy; the account API could do it.
- #27: the collie names people without ids, stands by as a stranger on a canvas without a word, mints for the machine's default person, holds rooms as several people, refuses a second pass for a held canvas.
- #25 confirmed: the agent's own walk of the same journey reported three turns held, having taken steps 1, 2, 3 and 6 by internal shortcuts, and so measured the sheep's turn and not the person's afternoon.

## What the next walk needs (the friend ring)

The person touches four surfaces, and the agent's walk had a back door for each:

1. **A terminal with a TTY.** The stile takes defaults without one (the agent never saw "join sheep-2" as a choice). Needed: a pty driver for walks that runs the real command, types what a person types, presses the keys, and captures frames.
2. **Secrets typed, never handled.** The walk's secrets are in the box's environment before it starts; the pty driver types them at the hidden prompt; the agent never sees a value.
3. **A browser signed in as the person.** The agent had Chrome tools on the shepherd's laptop, signed in as them, and never opened the canvas: discipline. For a fresh friend, isocan would need a CLI link that signs a browser in as this machine's person, which it does not have.
4. **One person across two machines.** Step 3 done first, by the pass; assert on the actor id before anything else.

And: the front door (#17) is the only script, written from the journey above; the report leads with every sentence the terminal and the page showed and the time it took.

## Proposed order (the shepherd's to change)

1. #27, the collie: ids everywhere, refuse to stand by on another person's canvas, a second pass replaces the owner.
2. #21, the setup cache: the install cached, the pass redeemed after.
3. #17, the front door, from the journey table.
4. isocan#329 and #330, in that repo.
5. The friend ring, the shepherd at the browser, the agent watching; then the agent walking it with the pty driver.

## State of the world at the end of 18 Sep

- Main: 82f34b6 and this doc. sheep-2 runs 82f34b6. The release branch carries it.
- The shepherd's laptop kennel `~/.sheep` names sheep-2 and has no collie block. The laptop's isocan person is `usr_SRYYnt1Zsb` "Dimitri" at dev.isocan.io.
- Codespaces: `laughing-space-barnacle-pw7556ph96wj` (repo dglazkov/sheep-walk, the agent's walk: kennel joined to sheep-2, isocan as "Walker" `usr_potkvbsObJ`, canvas "Walk 18 Sep" `prj_Qv3FOSuEeE` with an agent Dolly, sheep `01a0b568-…` in pasture `isocan-dolly`); `turbo-couscous-r6756vp2prp5` (repo dglazkov/sheep, the shepherd's attempt: isocan as a second "Dimitri" `usr_muLWG7ykVz`, canvases Dolly6 `prj_Qw9ofdL8Os` and Dolly7 `prj_INAMXX6GyM`); `special-waddle-4vqp6jpcwqw` (17 Sep, the collie on "Test Collie" at isocan.io with Dolly2). All three idle out on their own; delete when done with them.
- The collie Worker `sheep-2-collie` stands beside sheep-2, deployed last from turbo-couscous, holding "Walk 18 Sep" as Walker and Dolly6 and Dolly7 as the second Dimitri. `collie rm` from that Codespace ends it; a fresh `collie setup` from the right person redeploys it.
- A `wrangler tail sheep-2 --format json` started 16:44 UTC on the shepherd's laptop was still running at the end of the session, writing to the session's scratchpad (163,000 lines by 19:20 UTC). Kill it with `pkill -f "wrangler.js tail sheep-2"`; the file is the record of the day's turns and is gone with the scratchpad.
- The repo dglazkov/sheep-walk (private, one README) exists only to host a Codespace with no sheep checkout.
