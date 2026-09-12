# Bell: implementation phases

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
resource, spend money, or need a login. `/conduct bell` is the
procedure. Phase citations name their project: `bell phase 0`, never a
bare "phase 0".

**One rule for this project.** Nothing is asked of the home that was not
already arriving. The events are on the socket the dog already holds; a
proof that finds a new request per entry, a poll, or a second client has
found the bug, not a detail.

---

**Where we are: bell is done, 12 September 2026. Its one phase is
CLOSED.** A dog holding a turn hears the work as it happens: `sheep
attach --json` writes each entry as it lands, from the events the
attached client was already being given, and the last assistant entry is
still the last line. Planned from the shepherd's issue #7 the day bleat
closed and closed the next morning. All four journeys are walked, the
account ring's `b2` among 43 lines with none failed. One open finding,
which waits on a sighting rather than on work; nothing waits on a
person.

One phase, because there is one change: the client already receives what
the dog is polling for, and reads two fields out of it.

**Deliberately open.** Postponed on purpose: `sheep wait --json`
streaming; entries in text mode; filtering the stream to one turn's own
entries; setup's blocks on the stream, which are `sheep log`'s and are
said on stderr by bleat.

---

## Phase 0: The stream

**Closes:** journeys 1 to 4 in full.

**Work:** `packages/cli/src/herd.ts`: in `runPrompt`, the subscription
that feeds `Stream` also writes each `entry_added` entry as a line when
`output.json`, within the window `active` already marks; ids are
remembered so nothing is written twice, and `printAssistant` at the end
writes the last assistant entry only when the stream has not. The
window's two openings — the accepted prompt and, under `--wait`, the
placed queued entry — are the ones already there. `packages/cli/src/
cli.ts`: the usage's `--json` line says that a held turn's entries stream
as they land, the last assistant entry last. `packages/cli/
agent-guide.md`, `README.md`: one sentence each, paid for by cutting, as
mint phase 1 and bleat phase 1 paid for theirs — the guide's guard is
`< 1500` words and does not move.

Tests: `packages/cli/test/bell.test.ts` in the home ring, listed in
`scripts/rings.mjs`, against a real `wrangler dev` home with the faux
provider (`local-home.ts`), whose program is a tool call and then a
reply after a delay: the lines arrive one per entry, the tool call's
before the turn ends (read from the child's stdout while it runs, not
after), the ids and bytes equal `sheep log --json`'s afterwards, no id
twice, the last line the last assistant entry; a queued prompt under
`--wait` streams only its own turn's entries, and without `--wait`
streams nothing; text mode is byte for byte what it was.
`scripts/hermetic.mjs`: the account ring's `b2` after `b1`, the same
read on the station.

**Not this phase:** Nothing open above.

**Proof:** `pnpm test` exits 0 across all three inner rings, the new file
in the home ring; `pnpm --filter @sheep/cli typecheck` exits 0.
Falsified by at least one mutation: the stream written at the end rather
than as entries land (journey 1 step 2 fails). Then the walk, journey 4
steps 1 and 2, on the local home with Docker and a real model. **⚑**
journey 4 step 3: `pnpm hermetic --ring account --yes <sha>` with `b2`,
a station deployed and deleted on the shepherd's account, a few container
minutes and one deploy; the shepherd authorized the conductor to run it.

**Status: CLOSED.** 2026-09-12. All four journeys are walked. The home
ring reads the stream off the running child's pipe with a clock; the walk
on a local home with Docker and a real model shows a turn's tool call
twelve seconds before its result; the account ring closes it on release
5230def, `ok b2` among 43 lines with none failed. `pnpm test` exits 0
across all three inner rings, 124 CLI cases; `pnpm --filter @sheep/cli
typecheck` exits 0.

**Findings:**

- **2026-09-12 — The stream is the subscription that was already there.** `entry_added` carries the whole entry to every replica subscriber, so `--json` gained four lines a turn with no new request and no second client.
- **2026-09-12 — "Before the turn ends" can only be proved from the pipe.** Under a mutation that flushes the lines at the end, every other assertion still passed — the four lines, the roles, the ids, the bytes, the last line — and only the arrival time failed.
- **2026-09-12 — The queued window had to open in the writing subscriber.** `until` subscribes second, so on the delivery that places the queued entry the writer ran first with the window shut and the dog's own prompt entry was swallowed.
- **2026-09-12 — The wire's entry and the session file's are the same fields in a different key order.** `seq` and `timestamp` follow `message` from the replica and `parentId` from storage; the journey's criterion was corrected rather than the bytes canonicalised.
- **2026-09-12 — The walk is where the promise is visible.** With a real model and a first act of `sleep 12 && echo awake`, the call's line came off the pipe at 1.33 s and its result at 13.35 s, twelve seconds of a sheep at work.
- **2026-09-12 — The account ring closes it on release 5230def, `ok b2`, 43 lines held:** four lines, the tool call's 15.0 s before the exit with the child still running, and `sheep log --json` holding the same four ids in the same order.
- **2026-09-12 — Open: a compaction entry after the final assistant entry would make the last line not an assistant one.** Nothing filters the stream, by design; no faux program compacts, so a long real session is where it would show.
