/**
 * The one-shot commands a sheepdog runs: prompt mode, wait, status, abort,
 * and log. Each is pi's agent controller, transcript replica, or lane
 * snapshot, read by a program instead of drawn by a TUI, and each exits.
 */
import type { Entry, LaneTranscriptSnapshot } from "@earendil-works/pi-agent-core";
import type { TranscriptState } from "@earendil-works/pi-coding-agent/experimental/services/transcript";
import { attachSheep, BACKGROUND_CONTEXT, lastAssistant, messageText, type Sheep } from "./client.js";
import { type Home, Sentence, type SessionSummary, type SetupRecord, type SetupState } from "./home.js";

export interface Output {
  json: boolean;
  out(text: string): void;
  err(text: string): void;
  /**
   * Bleat phase 1: end the process with this code, once what has been
   * written is flushed. One path calls it — `sheep status`'s short form,
   * which has said everything it has to say while a socket it cannot
   * cancel is still in flight (see `attachWithin`). A sink without one is
   * told nothing and the command returns normally.
   */
  end?(code: number): void;
}

/**
 * The bleat, the dog's side (bleat phase 1). A sheep's `setup.sh` running
 * in a container is three surfaces here — the `setup:` line on `sheep
 * status`, the `[setup]` block in `sheep log`, and the line on stderr
 * while a prompt is held — and one fact underneath: the sheep's Directory
 * row, `GET /sessions/<id>`, which answers in a millisecond whatever the
 * cell is doing. The durations below are one function, so the three agree
 * to the second.
 */

/** `12.4 s` under a minute, `1m 40s` at one and over: every surface's duration, so all of them read alike. */
export function elapsed(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (safe < 60_000) return `${(safe / 1000).toFixed(1)} s`;
  const seconds = Math.floor(safe / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * What a row's `setup` says, in the words the surfaces share: `running (1m
 * 40s)`, `ok (1m 52s)`, `failed (exit 1, 12.4 s)`, `failed (<the sentence
 * for a setup that could not run, or that an eviction cut off>)`, and
 * `none` for a sheep no setup has ever run for. `status` prints `setup: `
 * before it and the held prompt prints `setup `; a running setup's elapsed
 * time is `now - at` on both, which is why they agree. `exit` is said only
 * for a failure: `ok` is exit 0 by definition.
 */
export function setupSaying(setup: SetupState | null | undefined, now: number): string {
  if (setup === null || setup === undefined) return "none";
  if (setup.state === "running") return `running (${elapsed(now - setup.at)})`;
  const parts: string[] = [];
  if (setup.state === "failed" && setup.exit !== undefined) parts.push(`exit ${setup.exit}`);
  if (setup.error !== undefined) parts.push(setup.error);
  if (setup.ms !== undefined) parts.push(elapsed(setup.ms));
  return parts.length === 0 ? setup.state : `${setup.state} (${parts.join(", ")})`;
}

/** How often the row is asked while a prompt is held, and how often a setup still running is said again. */
export const SETUP_POLL_MS = 10_000;
export const SETUP_SAY_MS = 30_000;

/**
 * What a prompt-holding command says on stderr, as a state machine over
 * the answers the row gives: the first sighting of a running setup, one
 * more every `SETUP_SAY_MS` while it runs, and one line when it ends. A
 * setup that had already ended when the command started is never said —
 * the dog waited for nothing — and a second setup, with an `at` of its
 * own, starts the count again. Nothing is ever written to stdout, so every
 * program reading a reply reads the same bytes as before.
 */
export class SetupVoice {
  /** The `at` of the setup being spoken about; `undefined` before the first running one is seen. */
  #at: number | undefined;
  #saidAt = 0;
  #ended = false;

  /** The lines to say for this answer, already newline-terminated; usually none. */
  saw(setup: SetupState | null | undefined, now: number): string[] {
    if (setup === null || setup === undefined) return [];
    const line = `setup ${setupSaying(setup, now)}\n`;
    if (setup.state === "running") {
      if (this.#at !== setup.at) {
        this.#at = setup.at;
        this.#saidAt = now;
        this.#ended = false;
        return [line];
      }
      if (this.#ended || now - this.#saidAt < SETUP_SAY_MS) return [];
      this.#saidAt = now;
      return [line];
    }
    // An ending is said only for the setup this watcher announced, and only once.
    if (this.#at !== setup.at || this.#ended) return [];
    this.#ended = true;
    return [line];
  }

  /** Whether a setup was announced as running and its ending has not been said yet. */
  get waiting(): boolean {
    return this.#at !== undefined && !this.#ended;
  }
}

/** A running watcher, stopped when the request the dog held has returned. */
export interface SetupWatch {
  stop(): Promise<void>;
}

/**
 * The watcher every path that holds a prompt starts — `runPrompt` here and
 * `detach` in `cli.ts` — from the moment the command starts and before the
 * socket, since during a birth the socket is what is waiting. It asks the
 * row every `SETUP_POLL_MS` and says what `SetupVoice` gives it on stderr.
 * A home that will not answer the row is silence, never a failure: the
 * command the dog ran is the point, and this is a courtesy beside it. On
 * `stop`, a setup announced but not yet ended is asked for once more, so
 * the ending is said even when the prompt returned before the next poll.
 */
export function watchSetup(home: Home, id: string, output: Output): SetupWatch {
  const voice = new SetupVoice();
  let tail: Promise<void> = Promise.resolve();
  const ask = (): void => {
    tail = tail.then(async () => {
      const row = await rowOf(home, id);
      if (row !== undefined) for (const line of voice.saw(row.setup, Date.now())) output.err(line);
    });
  };
  ask();
  const timer = setInterval(ask, SETUP_POLL_MS);
  // Nothing here holds the process open: the command's own request is what the dog is waiting on.
  timer.unref();
  return {
    async stop(): Promise<void> {
      clearInterval(timer);
      await tail;
      if (!voice.waiting) return;
      ask();
      await tail;
    },
  };
}

/** The sheep's row, or nothing: a home that will not answer it must not fail the command that asked. */
async function rowOf(home: Home, id: string): Promise<SessionSummary | undefined> {
  try {
    return await home.row(id);
  } catch {
    return undefined;
  }
}

function fail(output: Output, message: string): number {
  output.err(`sheep: ${message}\n`);
  return 2;
}

/**
 * Prints an assistant reply as it streams. The text is read from the
 * replica's streaming message, which pi's reducer keeps whole, rather than
 * from the delta events, one of which can arrive inside the hydrated
 * snapshot and never as an event. At the message's end the printed text is
 * compared with the message's full text and whatever is missing is printed,
 * so a program always gets the whole reply.
 */
class Stream {
  #printed = "";
  #wrote = false;

  constructor(private readonly out: (text: string) => void) {}

  /**
   * After a reattach (tether phase 0): the reply streams again from the model's next call. What was printed of the
   * interrupted one stays printed, its line ended, and the count starts over.
   */
  restart(): void {
    if (this.#wrote) this.out("\n");
    this.#printed = "";
    this.#wrote = false;
  }

  observe(state: TranscriptState): void {
    const streaming = state.snapshot?.operation?.streamingMessage;
    if (streaming !== undefined && streaming.role === "assistant") this.grow(messageText(streaming));
    const event = state.event;
    if (event?.type === "message_end" && event.message.role === "assistant") this.finish(messageText(event.message));
  }

  private grow(text: string): void {
    if (!text.startsWith(this.#printed)) return;
    const rest = text.slice(this.#printed.length);
    if (rest.length > 0) {
      this.out(rest);
      this.#wrote = true;
    }
    this.#printed = text;
  }

  private finish(full: string): void {
    if (full.startsWith(this.#printed)) this.grow(full);
    else if (full !== this.#printed) {
      this.out(`${this.#wrote ? "\n" : ""}${full}`);
      this.#wrote = true;
    }
    if (this.#wrote) this.out("\n");
    this.#printed = "";
    this.#wrote = false;
  }
}

/**
 * The stream (bell phase 0): in `--json`, each entry of the turn the dog is
 * holding, written as it lands. The replica already delivers `entry_added`
 * with the whole entry to every subscriber as the lane commits it, so
 * nothing is asked of the home that was not already arriving; a line is
 * `JSON.stringify(entry)`, the shape `sheep log --json` prints for that
 * entry — the same fields and the same values, in pi's order on the wire
 * rather than pi's order in the session file, which is the one thing about
 * the two texts that differs. Ids are remembered, so an entry is written
 * at most once and
 * `printAssistant` at the end is silent when the stream has already said
 * the last assistant entry — the guarantee a program depends on today does
 * not become a race on whether the replica's last delivery beat the
 * operation's resolution.
 */
class Entries {
  readonly #written = new Set<string>();
  /** The first id written: the turn's first entry, which a reattach's snapshot is read from. */
  #first: string | undefined;

  constructor(private readonly out: (text: string) => void) {}

  get first(): string | undefined {
    return this.#first;
  }

  observe(state: TranscriptState): void {
    const event = state.event;
    if (event?.type === "entry_added") this.write(event.entry);
  }

  /** The entry as one line, unless its id has been written already. */
  write(entry: Entry): void {
    if (this.#written.has(entry.id)) return;
    this.#written.add(entry.id);
    this.#first ??= entry.id;
    this.out(`${JSON.stringify(entry)}\n`);
  }
}

/**
 * The window (tether phase 0): how long a reattach keeps being tried while
 * the home does not answer, counted from the drop, so it is two minutes of
 * consecutive failure. `SHEEP_TEST_TETHER_MS` shortens it in tests, and
 * every ring strips it.
 */
export const TETHER_WINDOW_MS = 120_000;
const REATTACH_FIRST_MS = 250;
const REATTACH_MOST_MS = 5_000;

function tetherWindow(): number {
  const seam = Number(process.env.SHEEP_TEST_TETHER_MS);
  return Number.isFinite(seam) && seam > 0 ? seam : TETHER_WINDOW_MS;
}

/** What a reattach says, once each time, on stderr; stdout's lines are the contract and are not touched. */
export const reattachedLine = (id: string): string => `sheep: ${id}: the connection dropped; attached again\n`;

/**
 * The tether (tether phase 0): one id held through drops. `hold` runs a
 * read of the lane — `until(idle)`, a queued entry's placement, an abort —
 * on the current attachment; when it fails because the connection dropped
 * (the attachment's `dropped()` says so, whether the failure was `until`'s
 * `Dropped` or a request pi rejected at the drop), the attachment is
 * closed, a new one is made to the same id, one line is said on stderr,
 * and the read runs again on the new attachment's snapshot, which is the
 * cell's state now. A home that does not answer is tried again with a
 * short backoff until `TETHER_WINDOW_MS` of consecutive failure, then its
 * last error is thrown; the home's own refusal (`Sentence`) is thrown at
 * once. A `signal` (`sheep wait --timeout`) wins over all of it.
 *
 * `follow` is how a command keeps something on each attachment — `held`'s
 * stream — called with the first at once and with every new one before
 * the read runs again; what it returns is called before that attachment is
 * closed. Anything that is not a drop is thrown as it was.
 */
class Tether {
  #sheep: Sheep;
  #unfollow: () => void;

  constructor(
    private readonly home: Home,
    private readonly id: string,
    first: Sheep,
    private readonly output: Output,
    private readonly options: { signal?: AbortSignal; follow?: (sheep: Sheep, again: boolean) => () => void } = {},
  ) {
    this.#sheep = first;
    this.#unfollow = options.follow?.(first, false) ?? (() => {});
  }

  get sheep(): Sheep {
    return this.#sheep;
  }

  /** The read, run again on each new attachment after a drop; `again` is false the first time. */
  async hold<T>(read: (sheep: Sheep, again: boolean) => Promise<T>): Promise<T> {
    let again = false;
    for (;;) {
      try {
        return await read(this.#sheep, again);
      } catch (error) {
        if (this.options.signal?.aborted === true || this.#sheep.dropped() === undefined) throw error;
      }
      await this.#reattach();
      again = true;
    }
  }

  async close(): Promise<void> {
    this.#unfollow();
    this.#unfollow = () => {};
    await this.#sheep.close();
  }

  async #reattach(): Promise<void> {
    await this.close();
    const { signal } = this.options;
    const window = tetherWindow();
    const started = Date.now();
    let pause = REATTACH_FIRST_MS;
    let last: unknown;
    for (;;) {
      const left = window - (Date.now() - started);
      // One attempt never outlives the window: a home that takes the connection and says nothing is a home that did not answer.
      const deadline = AbortSignal.timeout(Math.max(left, 1));
      const attempt = new AbortController();
      const attaching = attachSheep(this.home, this.id, attempt.signal);
      try {
        const sheep = await withSignal(attaching, signal === undefined ? deadline : AbortSignal.any([signal, deadline]));
        this.#sheep = sheep;
        this.output.err(reattachedLine(this.id));
        this.#unfollow = this.options.follow?.(sheep, true) ?? (() => {});
        return;
      } catch (error) {
        if (error instanceof Sentence) throw error;
        if (signal?.aborted === true) {
          abandon(attempt, attaching);
          throw error;
        }
        if (deadline.aborted) {
          abandon(attempt, attaching);
          throw last ?? error;
        }
        last = error;
      }
      const remaining = window - (Date.now() - started);
      if (remaining <= 0) throw last;
      await pauseFor(Math.min(pause, remaining), signal);
      pause = Math.min(pause * 2, REATTACH_MOST_MS);
    }
  }
}

/** An attachment given up on: its socket closed by its signal, and closed again should it land all the same, so nothing holds the process. */
function abandon(attempt: AbortController, attaching: Promise<Sheep>): void {
  attempt.abort();
  void attaching.then((late) => late.close(), () => undefined);
}

function pauseFor(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal?.aborted === true) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const idle = (state: TranscriptState): LaneTranscriptSnapshot | undefined =>
  state.snapshot !== null && state.snapshot !== undefined && state.snapshot.operation === null ? state.snapshot : undefined;

function printAssistant(entries: Entries, snapshot: LaneTranscriptSnapshot): void {
  const entry = lastAssistant(snapshot.transcript);
  if (entry !== undefined) entries.write(entry);
}

/**
 * Prompt mode over sheep's own client. An idle lane takes the prompt as an
 * operation, whose reply streams until the operation ends. A busy lane
 * queues it as pi's follow-up, taken up when the running turn ends; `sheep`
 * says so and exits, or with `wait` streams the queued turn when it starts.
 *
 * Bleat phase 1: the setup watcher starts before the attachment, since a
 * sheep whose first prompt rents the container is held in `attachSheep`
 * for the whole of the birth, which is exactly the wait the line is for.
 *
 * Bell phase 0: in `--json` the same subscription that feeds `Stream` also
 * writes each entry as it lands (`Entries`), inside the window `active`
 * already marks. Text mode is untouched, and so is the last line.
 */
export async function runPrompt(home: Home, id: string, prompt: string, options: { wait: boolean }, output: Output): Promise<number> {
  const watch = watchSetup(home, id, output);
  try {
    return await held(home, id, prompt, options, output);
  } finally {
    await watch.stop();
  }
}

async function held(home: Home, id: string, prompt: string, options: { wait: boolean }, output: Output): Promise<number> {
  const first = await attachSheep(home, id);
  const stream = new Stream(output.json ? () => {} : output.out);
  const entries = new Entries(output.json ? output.out : () => {});
  let active = false;
  /**
   * The queued entry that opens the window under `--wait`, watched here
   * rather than only in the `until` below: both subscribers see the same
   * delivery, and this one runs first, so the entry whose placement opens
   * the window is itself the stream's first line.
   */
  let opening: string | undefined;
  /**
   * Tether phase 0: the ids the transcript held when the prompt was sent,
   * and whether the lane has since taken it. Once it has, the operation is
   * durable in the cell and a drop loses the connection, not the turn; before,
   * a drop is a failure as it always was, since the dog cannot know whether
   * its prompt landed.
   */
  let before: ReadonlySet<string> | undefined;
  let accepted = false;
  const opened = (snapshot: LaneTranscriptSnapshot | null | undefined): boolean =>
    opening !== undefined && snapshot?.transcript.some((entry) => entry.id === opening) === true;
  /**
   * The stream's subscription, on every attachment. On a reattach, the
   * entries that landed while the socket was down are in the new snapshot
   * and never arrive as events, so this turn's unwritten ones are written
   * from it first, in transcript order — from the queued entry under
   * `--wait`, else from the turn's first written entry, else from the first
   * the transcript did not hold when the prompt was sent — and the
   * subscription after them, so every later event follows.
   */
  const follow = (sheep: Sheep, again: boolean): (() => void) => {
    if (again) {
      stream.restart();
      const snapshot = sheep.snapshot();
      if (!active && opened(snapshot)) active = true;
      if (active) {
        const start = opening ?? entries.first;
        const from = start !== undefined ? snapshot.transcript.findIndex((entry) => entry.id === start) : snapshot.transcript.findIndex((entry) => before?.has(entry.id) === false);
        if (from !== -1) for (const entry of snapshot.transcript.slice(from)) entries.write(entry);
      }
    }
    return sheep.transcript.state.subscribe((state) => {
      if (!accepted && before !== undefined && state.snapshot !== null && state.snapshot !== undefined) {
        const taken = before;
        accepted = state.snapshot.operation !== null || state.snapshot.transcript.some((entry) => !taken.has(entry.id));
      }
      if (!active && opened(state.snapshot)) active = true;
      if (!active) return;
      stream.observe(state);
      entries.observe(state);
    });
  };
  const tether = new Tether(home, id, first, output, { follow });
  try {
    if (first.snapshot().operation === null) {
      active = true;
      before = new Set(first.snapshot().transcript.map((entry) => entry.id));
      let response: Awaited<ReturnType<Sheep["agent"]["prompt"]>> | undefined;
      try {
        response = await first.agent.prompt({ message: prompt, images: null }, BACKGROUND_CONTEXT);
      } catch (error) {
        // After acceptance, the hold decides the exit, the way `sheep wait` decides it: pi's `prompt` cannot resolve across a reattach.
        if (first.dropped() === undefined || !accepted) throw error;
      }
      if (response === undefined || response.accepted) {
        // pi's `prompt` resolves at the end of the operation; the replica's last delivery may still be in flight.
        const snapshot = await tether.hold((sheep) => sheep.until(idle));
        if (output.json) printAssistant(entries, snapshot);
        if (response !== undefined && response.error !== null) return fail(output, response.error.message);
        return 0;
      }
      if (response.error.code !== "lane_busy") return fail(output, response.error.message);
      active = false;
      before = undefined;
    }
    const queued = await first.agent.followUp({ message: prompt, images: null }, BACKGROUND_CONTEXT);
    if (!queued.accepted) return fail(output, queued.error.message);
    output.err(`queued ${id}\n`);
    if (!options.wait) {
      if (output.json) output.out(`${JSON.stringify(queued)}\n`);
      return 0;
    }
    opening = queued.entryId;
    const placed = await tether.hold((sheep) =>
      sheep.until((state) => {
        const snapshot = state.snapshot;
        if (snapshot === null || snapshot === undefined) return undefined;
        if (snapshot.transcript.some((entry) => entry.id === queued.entryId)) return "placed" as const;
        return snapshot.operation === null ? ("dropped" as const) : undefined;
      }),
    );
    if (placed === "dropped") return fail(output, `queued prompt ${queued.entryId} was dropped: the turn ended without taking it up`);
    const snapshot = await tether.hold((sheep) => sheep.until(idle));
    if (output.json) printAssistant(entries, snapshot);
    return 0;
  } finally {
    await tether.close();
  }
}

/** Blocks on each cell's own idle notification over the transcript subscription; never polls. */
export async function runWait(home: Home, ids: readonly string[], options: { timeoutMs: number | undefined }, output: Output): Promise<number> {
  const controller = new AbortController();
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new Error("timed out")), options.timeoutMs);
  const results: Array<{ id: string; message: Entry | null }> = [];
  let timedOut = false;
  let failed = false;
  await Promise.all(
    ids.map(async (id) => {
      let sheep: Sheep;
      try {
        sheep = await withSignal(attachSheep(home, id), controller.signal);
      } catch (error) {
        if (controller.signal.aborted) timedOut = true;
        else {
          failed = true;
          output.err(`sheep: ${id}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        return;
      }
      // Tether phase 0: each id held through drops on its own, under the one timeout.
      const tether = new Tether(home, id, sheep, output, { signal: controller.signal });
      try {
        const snapshot = await tether.hold((attached) => attached.until(idle, controller.signal));
        const entry = lastAssistant(snapshot.transcript) ?? null;
        if (output.json) results.push({ id, message: entry });
        else output.out(`${id}\t${oneLine(entry === null ? "" : messageText(entry.message))}\n`);
      } catch (error) {
        if (controller.signal.aborted) timedOut = true;
        else {
          failed = true;
          output.err(`sheep: ${id}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      } finally {
        await tether.close();
      }
    }),
  );
  clearTimeout(timer);
  if (output.json) output.out(`${JSON.stringify(results)}\n`);
  if (timedOut) output.err(`sheep: timed out; ${results.length === 0 && !output.json ? "the lines above are" : "printed"} the sheep that finished\n`);
  return timedOut ? 124 : failed ? 2 : 0;
}

/** The two seconds a lane gets when the row says a setup is running, and no more. */
export const SETUP_LANE_MS = 2_000;

/** The short form's last line: what a dog is told instead of a lane the cell cannot draw yet. */
export const SETUP_NO_LANE = "lane: none yet; the cell is held by setup.sh and answers when it ends";

/**
 * The lane snapshot, read once: the open operation, the last tool call,
 * tokens so far, and (bleat phase 1) the `setup:` line last, from the row.
 *
 * The row is read first, and when it says a setup is running the lane read
 * gets `SETUP_LANE_MS` and no more: a cell being born cannot answer — the
 * boot is the very setup the dog is asking about — so a dog that asked what
 * its sheep is doing is answered with what is known rather than made to
 * wait for the thing it is waiting on. That short form is the id, the lane
 * state the row holds, the setup line, and one sentence saying why there is
 * no lane; `--json` is the same four as an object with `snapshot: null`.
 * A home that will not answer the row leaves the line out and changes
 * nothing else: the lane is still what `status` is for.
 */
export async function runStatus(home: Home, id: string, output: Output): Promise<number> {
  const row = await rowOf(home, id);
  const setup = row?.setup ?? null;
  const sheep = setup?.state === "running" ? await attachWithin(home, id, SETUP_LANE_MS) : await attachSheep(home, id);
  if (sheep === undefined) {
    const state = row?.state ?? "running";
    if (output.json) output.out(`${JSON.stringify({ id, state, setup, snapshot: null })}\n`);
    else output.out(`id: ${id}\nstate: ${state}\nsetup: ${setupSaying(setup, Date.now())}\n${SETUP_NO_LANE}\n`);
    // The answer is written and there is nothing else to do, so the command ends rather than waiting out the setup it
    // just reported: the abandoned attachment cannot always be cancelled, and a dog reading `out=$(sheep status <id>)`
    // gets nothing at all until the process exits. This is the one path that ends itself.
    output.end?.(0);
    return 0;
  }
  try {
    const snapshot = sheep.snapshot();
    if (output.json) {
      output.out(`${JSON.stringify(row === undefined ? snapshot : { ...snapshot, setup })}\n`);
      return 0;
    }
    const operation = snapshot.operation;
    const state = operation === null ? "idle" : operation.retry !== undefined || operation.deferred !== undefined ? "waiting" : "running";
    const lines = [`id: ${id}`, `state: ${state}`];
    lines.push(
      operation === null
        ? "operation: none"
        : `operation: ${operation.id} ${operation.kind} started ${new Date(operation.startedAt).toISOString()}${operation.status === "aborting" ? " aborting" : ""}`,
    );
    const tool = lastToolCall(snapshot);
    lines.push(tool === undefined ? "tool: none" : `tool: ${tool.name} ${tool.args}`);
    const usage = snapshot.stats.usage;
    lines.push(`tokens: input=${usage.input} output=${usage.output} cacheRead=${usage.cacheRead} cacheWrite=${usage.cacheWrite}`);
    lines.push(`messages: ${snapshot.stats.messageCount}`);
    // The setup line last, so a reader of the five above by index is unchanged; absent when the row could not be read.
    if (row !== undefined) lines.push(`setup: ${setupSaying(setup, Date.now())}`);
    output.out(`${lines.join("\n")}\n`);
    return 0;
  } finally {
    await sheep.close();
  }
}

/**
 * The attachment, with the deadline a running setup earns it: the one that
 * has not arrived in `ms` is abandoned and closed if it lands late, and one
 * that failed inside the deadline is abandoned too — a cell being born
 * answers neither way, and the row is the answer either way. Only a sheep
 * whose row says `running` is read like this; everything else waits as it
 * did, so a refusal is still a refusal.
 *
 * Abandoning is not cancelling, and node gives no way to make it one. A
 * socket still shaking hands is aborted by the signal and the process is
 * free; but a cell being born answers the upgrade and then says nothing
 * (the boot is what the birth holds), and `close()` on an open socket
 * waits for a closing handshake that cell will not send until it is born.
 * There is no `terminate` in the web API and no dispatcher to destroy
 * without depending on undici, so the loop stays alive for the whole of
 * the setup. That is why `runStatus` ends the process itself once its
 * answer is flushed: bleat phase 1's walk measured a `status` that printed
 * at two seconds and did not exit for thirty-nine.
 */
async function attachWithin(home: Home, id: string, ms: number): Promise<Sheep | undefined> {
  const controller = new AbortController();
  const attaching = attachSheep(home, id, controller.signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  const sheep = await Promise.race([attaching.catch(() => undefined), deadline]);
  clearTimeout(timer);
  // The socket is closed by the signal, and an attachment that landed all the same is closed here: a command that
  // has printed its answer must exit, and a half-open attachment to a cell being born would hold the process.
  if (sheep === undefined) {
    controller.abort();
    void attaching.then((late) => late.close(), () => undefined);
  }
  return sheep;
}

function lastToolCall(snapshot: LaneTranscriptSnapshot): { name: string; args: string } | undefined {
  const running = snapshot.operation?.runningTools.at(-1);
  if (running !== undefined) return { name: running.toolName, args: compact(running.args) };
  for (let i = snapshot.transcript.length - 1; i >= 0; i--) {
    const entry = snapshot.transcript[i]!;
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const call = entry.message.content.findLast((part) => part.type === "toolCall");
    if (call !== undefined && call.type === "toolCall") return { name: call.name, args: compact(call.arguments) };
  }
  return undefined;
}

function compact(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** pi's `requestAbort` on the open operation; resolves once the lane has settled it. */
export async function runAbort(home: Home, id: string, output: Output): Promise<number> {
  const tether = new Tether(home, id, await attachSheep(home, id), output);
  try {
    const operation = tether.sheep.snapshot().operation;
    if (operation === null) {
      if (output.json) output.out(`${JSON.stringify({ id, aborted: false })}\n`);
      else output.out(`${id}\tidle\n`);
      return 0;
    }
    // Tether phase 0: after a reattach the abort is asked again of the operation the new snapshot names, unless that lane is
    // idle or already aborting it; asking twice is harmless, and an abort asked before the drop may not have landed.
    await tether.hold(async (sheep, again) => {
      const open = again ? sheep.snapshot().operation : operation;
      if (open !== null && !(again && open.status === "aborting")) await sheep.agent.requestAbort(open.id, BACKGROUND_CONTEXT);
      await sheep.until(idle);
    });
    if (output.json) output.out(`${JSON.stringify({ id, aborted: true })}\n`);
    else output.out(`${id}\taborted ${operation.id}\n`);
    return 0;
  } finally {
    await tether.close();
  }
}

/**
 * The end (end phase 1): `DELETE /s/<id>` through the home's face, which
 * aborts the open turn, disconnects the terminals, destroys the container,
 * closes the browser, empties the storage, and removes the row, in that
 * order. On stdout exactly `<id>\tended`; `--json` is `{ id, ended,
 * aborted }`, the cell's report with the id first. A session the home
 * does not have is its sentence, thrown to `main`: stderr and exit 2.
 * Nothing about the container is said: the dog asked for the sheep to
 * end, and it ended.
 */
export async function runEnd(home: Home, id: string, output: Output): Promise<number> {
  const report = await home.end(id);
  if (output.json) output.out(`${JSON.stringify({ id, ...report })}\n`);
  else output.out(`${id}\tended\n`);
  return 0;
}

/**
 * The transcript as text, oldest first, one block per entry; `--json` is
 * pi's entries, one per line.
 *
 * Bleat phase 1: the cell's setups (`TranscriptView.setups`) are merged in
 * by time, so each `[setup]` block prints where it happened — between the
 * tool call that rented the container and that call's result, and before
 * the `birth` entry when the birth rented it. They are sheep's own rows,
 * not pi's entries: `--json` gives each `"type": "setup"` and every pi
 * entry beside it is unchanged. `--since` and `--last` bound them the way
 * they bound the entries. The row is read only when a record has no ending
 * of its own, which is the one case the record alone cannot render.
 */
export async function runLog(home: Home, id: string, options: { since: string | undefined; last: number | undefined }, output: Output): Promise<number> {
  const view = await home.transcript(id);
  let entries = view.entries;
  let setups = view.setups ?? [];
  if (options.since !== undefined) {
    const index = entries.findIndex((entry) => entry.id === options.since);
    if (index !== -1) {
      const at = entries[index]!.timestamp;
      entries = entries.slice(index + 1);
      setups = setups.filter((setup) => setup.at >= at);
    } else {
      const time = Date.parse(options.since);
      if (Number.isNaN(time)) return fail(output, `--since needs an entry id from this transcript or an ISO time, not ${options.since}`);
      entries = entries.filter((entry) => entry.timestamp >= time);
      setups = setups.filter((setup) => setup.at >= time);
    }
  }
  if (options.last !== undefined) {
    entries = entries.slice(-options.last);
    const first = entries[0];
    setups = first === undefined ? [] : setups.filter((setup) => setup.at >= first.timestamp);
  }
  // Bleat phase 0's open finding: an eviction mends the row and not the record, so a record with no ending is
  // rendered with the row's beside it when the row speaks of that same setup. Only then is the row asked at all.
  const row = setups.some((setup) => setup.ms === undefined) ? (await rowOf(home, id))?.setup ?? null : null;
  const now = Date.now();
  const merged = merge(entries, setups);
  if (output.json) {
    for (const item of merged) output.out(`${JSON.stringify("entry" in item ? item.entry : { type: "setup", ...item.setup })}\n`);
    return 0;
  }
  output.out(merged.map((item) => ("entry" in item ? formatEntry(item.entry) : formatSetupBlock(item.setup, row, now))).join("\n"));
  return 0;
}

type Printed = { at: number; entry: Entry } | { at: number; setup: SetupRecord };

/** The entries and the setups in one order, by time; a setup sharing a millisecond with an entry follows it. */
function merge(entries: readonly Entry[], setups: readonly SetupRecord[]): Printed[] {
  const printed: Printed[] = [...entries.map((entry) => ({ at: entry.timestamp, entry })), ...setups.map((setup) => ({ at: setup.at, setup }))];
  return printed.sort((left, right) => left.at - right.at || (("setup" in left ? 1 : 0) - ("setup" in right ? 1 : 0)));
}

/**
 * The block: the record's id, when setup started, how it ended, and the
 * tail of what it printed — which on a successful setup is output no dog
 * could see before. A record with no ending of its own is `running (12.4
 * s)`, unless the row's `setup` for that same `at` has ended, in which case
 * the block says what the row says: an eviction is mended on the row alone.
 */
export function formatSetupBlock(record: SetupRecord, row: SetupState | null, now: number): string {
  const lines = [`[setup] ${record.id} ${new Date(record.at).toISOString()} ${setupEnding(record, row, now)}`];
  if (record.output !== "") lines.push(...record.output.replace(/\n$/, "").split("\n"));
  return `${lines.join("\n")}\n`;
}

function setupEnding(record: SetupRecord, row: SetupState | null, now: number): string {
  if (record.ms !== undefined || record.exit !== undefined || record.error !== undefined) return endedAfter(record.exit, record.error, record.ms);
  if (row !== null && row.at === record.at && row.state !== "running") return endedAfter(row.exit, row.error, row.ms);
  return `running (${elapsed(now - record.at)})`;
}

function endedAfter(exit: number | undefined, error: string | undefined, ms: number | undefined): string {
  const how = exit !== undefined ? `exit ${exit}` : error !== undefined ? `error ${error}` : "ended";
  return ms === undefined ? how : `${how} after ${elapsed(ms)}`;
}

export function formatEntry(entry: Entry): string {
  const at = new Date(entry.timestamp).toISOString();
  const lines: string[] = [];
  switch (entry.type) {
    case "message": {
      const message = entry.message;
      lines.push(`[${message.role}] ${entry.id} ${at}`);
      if (message.role === "toolResult") {
        lines[0] = `[result ${message.toolName}] ${entry.id} ${at}${message.isError ? " error" : ""}`;
        lines.push(...messageText(message).replace(/\n$/, "").split("\n"));
      } else if (message.role === "user" || message.role === "assistant") {
        if (typeof message.content === "string") lines.push(...message.content.replace(/\n$/, "").split("\n"));
        else {
          for (const part of message.content) {
            if (part.type === "text") lines.push(...part.text.replace(/\n$/, "").split("\n"));
            else if (part.type === "toolCall") lines.push(`[tool ${part.name}] ${compact(part.arguments)}`);
            else if (part.type === "thinking") lines.push(`[thinking] ${part.thinking.split("\n")[0] ?? ""}`);
            else lines.push(`[${part.type}]`);
          }
        }
        // Tether phase 0: pi's interruption, and any other assistant entry that ended in an error, says why as its last line.
        if (message.role === "assistant" && message.errorMessage !== undefined && message.errorMessage !== "") lines.push(`[error] ${message.errorMessage}`);
      } else lines.push(compact(message));
      break;
    }
    case "compaction":
      lines.push(`[compaction] ${entry.id} ${at} tokensBefore=${entry.tokensBefore}`, ...entry.summary.split("\n"));
      break;
    case "branch_summary":
      lines.push(`[branch_summary] ${entry.id} ${at}`, ...entry.summary.split("\n"));
      break;
    case "custom":
      lines.push(`[custom ${entry.customType}] ${entry.id} ${at}`, ...(entry.data === undefined ? [] : [compact(entry.data)]));
      break;
  }
  return `${lines.join("\n")}\n`;
}

function oneLine(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
