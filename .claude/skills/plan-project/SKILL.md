---
name: plan-project
description: Plan a new project under docs/projects/ — from an issue, a question, or a sighting, write the three docs (journey.md, design.md, phases.md), the index row, and the plan commit, and stop; conducting is /conduct in a session of its own. Use for "/plan-project <name> from issue #N", "plan a project for X", "turn this into a project", or "what would the project for this look like".
argument-hint: "<name> [from issue #N | from <a sentence>]"
---

# plan-project: one project, planned, committed, handed to /conduct

A project under `docs/projects/<name>/` is three documents: `journey.md`
(the acceptance suite), `design.md` (the argument), `phases.md` (the
walk). This skill writes them. The session that runs it is the
**planner**. It measures, reads, decides, and writes; it builds nothing
and briefs nobody. When the plan is committed, the planner's work is
over, and `/conduct <name>` picks the plan up, usually in another session
and on a cheaper model: the plan is where the judgment is spent, and the
conduct is mechanical against it. A plan that needs the planner in the
room during the conduct is not finished.

The shepherd's rules for projects live in
[docs/projects/README.md](../../../docs/projects/README.md): **a project
is short**, one body of work with an end, a journey that can be walked,
phases that close, a last phase after which nothing in it waits on work.
A plan that would be long-lived is cut at the wrong grain and should be
several. The house rules in `AGENTS.md` apply to the plan as much as to
the code.

## Arguments

- `/plan-project <name> from issue #N`: plan from a GitHub issue. Read
  it whole, comments included, with `gh issue view N --comments`.
- `/plan-project <name> from <a sentence>`: plan from the shepherd's
  question or a sighting in a walk.
- `/plan-project <name>` alone: ask what it is from, in one line, and
  stop; a project with no source is a guess.

The name is one short word in the sheep's vocabulary (a thing on a farm,
a sheep's part, a shepherd's act: pen, collar, kennel, stile, shear,
draft), not a description, and not already under `docs/projects/`.

## 0. Ground the plan before writing a word

The plan's claims are measured, not recalled. Before writing:

- **Read the source whole.** The issue and its comments; the finding or
  commit that raised it (`git log --grep`, `git show`); the phases of
  the project that carried the debt.
- **Read the code the phases will touch**, enough to name the functions,
  the files, and the seams by their real names. A plan that says "the
  walk" where the code says `accountWalk` sends the builder guessing.
- **Measure what the plan says is slow, broken, or big**: run it, time
  it, count it, and keep the numbers. `wc -l`, `time pnpm test`, `gh run
  view --json jobs` for CI's steps, a `--dry-run` for a ring. Numbers
  the plan states without a run behind them are the ones a builder
  later finds wrong; correct any you did state wrong, as their own
  commit, the moment a measurement contradicts them.
- **Check the neighbours.** `grep -rn` the term across `docs/projects/`
  and the living docs (`AGENTS.md`, `README.md`, `SKILL.md`, the
  skills) for what already describes it; list the open issues for one
  that overlaps.
- **Note the wall clock** when you start; the plan commit says what
  planning cost.

Three questions the plan must answer before it is written, each in a
sentence the design will carry:

1. What is the one thing this project adds, and what is its end?
2. What does it deliberately not do, and where does each of those go
   (an issue, a later project, nowhere)?
3. What does a phase's proof look like against a real thing, and which
   steps of it are **⚑** (a cloud resource, money, a login, a hand)?

## 1. journey.md: the acceptance suite

The front matter first:

```
---
status: planned
since: <YYYY-MM-DD>
see: <name>
note: "<when and from what it was planned, in a sentence or three, retold at each phase>"
---
```

Then the opening paragraph every journey shares (sheepdog, sheep,
shepherd), the project's one word defined in it, and the sentence that
binds the three docs: **if a journey and the mechanism disagree, the
mechanism is what changes.** Then a **vocabulary** list: every word the
journeys use that a reader could take two ways, defined once.

Then the journeys, numbered. Each is one story from the dog's or the
shepherd's seat, in numbered steps that name real commands and real
outputs, followed by **acceptance criteria**: the checks a walk can make
that the steps alone do not say. A journey is walkable as written: a
conductor with the command and a real home can do each step and see
each result. The last journey is usually **the walk**: which ring proves
it, and which of its steps are ⚑.

What is not a journey: the mechanism (that is the design), the order of
building (that is the phases), a wish with no step a walk can take.

## 2. design.md: the argument

Opens with the date, `Design. Nothing built.`, the pointer to
journey.md's front matter for status, and **the thesis in one line**, in
bold: what the project makes true, stated so that a reader can tell when
it is false.

Then, in the order that argues best:

- **What was seen, and what it was.** For a project from an issue or a
  sighting: the evidence, then the diagnosis, with the numbers measured
  in step 0. The reader should be able to disagree with the diagnosis
  from the evidence alone.
- **The names.** A table: word, what it is, where it lives (a file, a
  function, a table). Every name the phases will use is minted here,
  once.
- **The mechanism**, section by section, in the code's own terms: which
  file, which function, which route, which table. A diagram is welcome
  where a picture beats a paragraph; a paragraph that could be a table
  is a table.
- **What does not change.** Named, so the builder knows the edges: the
  rings, pi, the release, another project's contract.
- **What this does not do, on purpose.** Each with where it goes: an
  issue filed now (`gh issue create`, with the measurements), a later
  project, or nowhere with the reason.

The design is the argument the commit message will retell. If a
sentence in it is a guess, say so in the sentence.

## 3. phases.md: the walk

The opening paragraph names the rules that bind (lamb's, pen's, collar's,
and any project's whose rule applies), `/conduct <name>` as the
procedure, and the citation rule (`<name> phase 0`, never a bare "phase
0"). Then **the project's own rules**, one to three, in bold: what a
builder must not trade away, and what a proof that would trade it away
means (a finding and a stop, not an edit).

Then the where-we-are paragraph, whose first line must name the next
phase on one line (`**Where we are: <name> is planned, <date>; next is
<name> phase 0.**`, the status script reads it), what it stands on, and
what waits on a person; then why the phases are cut where they are, in
one or two sentences; then **Deliberately open**, the postponed list.

Then the phases, in dependency order, each with exactly these
paragraphs:

- **Closes:** which journeys and steps, by number.
- **Work:** the files by path and what each gains, in the code's names;
  the tests by path and ring, and what each proves; the docs of other
  projects that this phase must retell.
- **Not this phase:** what a builder would be tempted to do here and
  must not.
- **Proof:** exact commands from the repo root and their expected exit
  codes; at least one **mutation** that must make the proof fail, so
  the proof is shown able to fail; the walk, against a real home, a
  real model, a real account, with every ⚑ step marked and priced. The
  proof is the conductor's territory: a phase's status moves on it and
  on nothing else.
- **Status: NOT STARTED.**

Cut phases so that each is useful the day it closes, and so that the
first phase carries the riskiest unknown. Two phases beat one long one;
one beats two that cannot stand apart. A phase with a walk on the
account is a phase; a walk is never an afterthought to a phase that
"also" runs it.

## 4. The index, the lint, the commit

- **The projects index**, `docs/projects/README.md`: one row after the
  newest project, "what it is" in a few sentences with the three docs
  linked, "where it stands" as `Planned <date> from <source>. <name>
  phase 0 is next: <one clause>.` The row must not be more right than
  the docs, nor less.
- **Not `AGENTS.md`**: the house rules gain their sentence about a
  project when it is done, from the conductor's last commit.
- **Run the status script** and read its lint, which must be clean:

  ```sh
  /Users/dimitriglazkov/Documents/code/sheep/.claude/skills/conduct/status.sh <name>
  ```

- **One commit**, the plan whole, on `main`, pushed: title `<name>:
  planned from <source> (PLANNED; <one clause on the cut>)`. The body is
  the argument a reader who was not here can follow: what was seen,
  what was measured, what the project adds, why the phases are cut so,
  what is left out and where it went. End with the session trailer the
  harness gives you.

## 5. Stop

The plan is the deliverable. Do not brief a builder, do not start a
phase, do not spawn an agent. The final report is short: the commit,
the phases with one line each, the ⚑ steps with their prices, the
issues filed, and the one line that hands it on:

```
/conduct <name>
```

If the shepherd asks in the same session to go on, `/conduct <name>` is
what goes on, under its own skill, and the planner becomes the
conductor; nothing about the plan changes for that.

## Things that have gone wrong before

- A plan named a CI cost from memory (pi's fork built every run); the
  run's own step times said the tests and the candidate's walk were the
  cost. Measure, and correct in a commit of its own when wrong.
- A phase's where-we-are wrapped `phase 0` onto its second line, and the
  status script's lint said the paragraph did not name the next phase.
  Keep `<name> phase N` on one line near the top.
- A journey named a walk with no ring and no ⚑ mark, and the conductor
  had to decide at the proof whether it spent money. Mark every ⚑ in
  the plan.
- A project that "also" added a step to the account ring's one walk, ten
  projects running, made that walk 45 minutes long (issue #13). A plan
  that grows a shared thing says how the growth is paid for.
