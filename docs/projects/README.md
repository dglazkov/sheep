# Projects

One directory per body of work. A project holds everything about itself:
the ideal it is aiming at (`journey.md`), the mechanism (`design.md`), and
the walk that gets there (`phases.md`). Reading a project end to end is
`ls` and then reading in order; adding a doc to one edits nothing outside
it. A project with one design names it `design.md`; a project with several
names each for what it designs.

**Where each project stands lives in its own primary doc**, in front
matter, so this table cannot be more right than the thing it describes.

| Project | What it is | Where it stands |
| --- | --- | --- |
| [lamb](lamb/) | pi, running in a cell. A pi session as the durable half of a coding harness, moved into a Durable Object: transcript and workspace as rows, an in-isolate shell, pi's own client attached over a WebSocket, the same bundle on Cloudflare and on celld. [`design.md`](lamb/design.md) is the argument, [`journey.md`](lamb/journey.md) the acceptance suite, [`phases.md`](lamb/phases.md) the walk. The first leg of a longer marathon: execution tiers, sub-agents as cells, and permission prompts answered from anywhere are later legs. | **Built 5 Sep 2026, the day of the design.** pi's storage and repo conformance suites pass over the cell's SQLite; the four tools run over a workspace table and just-bash in the isolate; the cell drives pi's harness with an alarm as the heartbeat and journey 2's eviction test holds at every transition; pi's own client attaches over a WebSocket through `lamb`, and two terminals share a cell; `git` runs over isomorphic-git; the same bundle runs on a local celld node; pi's full suite is green with four small patches. Every walk that needs a deployed home, a real model, a GitHub token, or a two-node fleet waits on those. |
