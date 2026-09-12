/**
 * The bleat (bleat phase 0): what a sheep says it is waiting on. A
 * pasture's `setup.sh` runs in one place — `warm()` in
 * `env/execution-env.ts` — and until now nothing outside that function
 * learned that it ran: a success was one `console.info` in the home's
 * logs, which no dog can read, and a failure was a tool result the model
 * read and the dog did not. This file is the two shapes that carry a
 * setup out of it.
 *
 * The **row** is the live state, on the sheep's Directory row: `running`
 * from the moment setup starts, then `ok` or `failed` with how long it
 * took. It lives there and not in the cell because the case this project
 * opens with is a sheep whose *first* prompt rents the container: the
 * cell's own boot is what setup is holding, so every read of the cell
 * waits exactly as long as the dog does, while the Directory answers in a
 * millisecond whatever the cell is doing. A boot that finds the row
 * saying `running` — an incarnation evicted mid-setup — writes `failed`
 * with `SETUP_EVICTED`, so `running` is never a lie an eviction left
 * behind.
 *
 * The **record** is the cell's own, one per setup, in the cell's storage
 * beside the birth's: the same facts with the output's tail and what the
 * pasture's cache came to. It is sheep's and not pi's on purpose.
 * `appendCustomEntry` while an operation is open does not append — the
 * lane puts the entry in its inbox and materialises it when the turn ends,
 * after the tool result rather than between the call and it, and invisible
 * for the whole of the wait, which is the only time it is worth anything.
 * So the records are kept here, handed to `sheep log` beside the entries
 * (`TranscriptView.setups`), and merged by time where they happened. They
 * are not pi's entries, are not in `sheep export`'s tables, and reach no
 * model: **nothing about what the model reads changes in this project.**
 *
 * The last `SETUP_KEPT` are kept. A sheep that has rented fifty containers
 * has its last twenty setups; one whose log wants more than that wants the
 * home's own logs.
 */
import type { CacheOutcome, SetupEnd } from "./env/execution-env.ts";

/** What a setup is doing, as the sheep's row says it: `running` from the moment it starts, then how it ended. */
export type SetupPhase = "running" | "ok" | "failed";

/**
 * The `setup` on a sheep's Directory row: the live state, and nothing an
 * eviction could make stale for long. `null` on the row for a sheep no
 * setup has ever run for — one born into no pasture, or into one with no
 * `setup.sh` — which is journey 3's quiet sheep.
 */
export interface SetupState {
  state: SetupPhase;
  /** When the setup started; `Date.now() - at` is the elapsed time while it runs. */
  at: number;
  /** How long it took; absent while it runs, and absent for one an eviction cut off, whose length nothing knows. */
  ms?: number;
  /** The script's exit code, when it ran to one. */
  exit?: number;
  /** The sentence when it could not run to a code at all: the secrets unreadable, the container gone, the eviction. */
  error?: string;
}

/**
 * The cell's own row per setup, written when setup starts and replaced
 * when it ends. `id` is the storage key too, so the block `sheep log`
 * prints names the record the home holds.
 */
export interface SetupRecord {
  /** `setup-<the millisecond it started>`, which is the key it is kept under. */
  id: string;
  at: number;
  /** How long it took; absent while it runs, which is how a reader tells a setup still going from one that ended. */
  ms?: number;
  /** The line the container was handed: `SETUP_COMMAND`. */
  command: string;
  exit?: number;
  error?: string;
  /** The output's tail, within the bounds below; empty while setup runs, since the output is kept at the end. */
  output: string;
  truncated: boolean;
  /** Fold phase 1: what the pasture's cache came to around this setup; absent while it runs, and when it did not exit 0. */
  cache?: CacheOutcome;
}

/** How much of setup's output a record keeps: the tail, the birth's bounds. */
export const SETUP_TAIL_LINES = 40;
export const SETUP_TAIL_BYTES = 16 * 1024;

/** The prefix every setup record is kept under in the cell's storage, and how many are kept. */
export const SETUP_KEY_PREFIX = "setup-";
export const SETUP_KEPT = 20;

/** The key, and the record's own id: the millisecond it started, which sorts the keys in the order the setups ran. */
export function setupRecordKey(at: number): string {
  return `${SETUP_KEY_PREFIX}${at}`;
}

/**
 * The sentence for a setup an eviction cut off: the incarnation that held
 * the container's socket is gone, so nothing is running the script and
 * nothing will ever report its end. The next boot says this rather than
 * leave a dog waiting on a setup that has no container.
 */
export const SETUP_EVICTED = "the cell was evicted while setup.sh was running, so nothing is running it now";

/** The row's value for a setup that has just started. */
export function setupStartedState(at: number): SetupState {
  return { state: "running", at };
}

/** The row's value for a setup that has ended: `ok` for exit 0, `failed` for anything else and for one that could not run. */
export function setupEndedState(at: number, ms: number, end: SetupEnd): SetupState {
  if ("exit" in end) return { state: end.exit === 0 ? "ok" : "failed", at, ms, exit: end.exit };
  return { state: "failed", at, ms, error: end.error };
}

/** The row's value for a setup an eviction cut off: `failed` with the sentence, keeping when it started and saying no length. */
export function setupEvictedState(at: number): SetupState {
  return { state: "failed", at, error: SETUP_EVICTED };
}

/**
 * The state read back off the column, which is JSON in a `TEXT` column; a
 * column with nothing in it, or with something that is not one of these,
 * is no setup at all rather than a half-read one.
 */
export function setupStateOf(stored: string | null | undefined): SetupState | undefined {
  if (stored === null || stored === undefined || stored === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (record.state !== "running" && record.state !== "ok" && record.state !== "failed") return undefined;
  if (typeof record.at !== "number") return undefined;
  return {
    state: record.state,
    at: record.at,
    ...(typeof record.ms === "number" ? { ms: record.ms } : {}),
    ...(typeof record.exit === "number" ? { exit: record.exit } : {}),
    ...(typeof record.error === "string" ? { error: record.error } : {}),
  };
}

/**
 * The output's tail for a record: the last `SETUP_TAIL_LINES` lines, cut
 * to the last `SETUP_TAIL_BYTES` bytes, `truncated` when anything was
 * dropped. A trailing newline is the last line's end, not an empty line
 * after it, so a tail reads as the output did.
 */
export function setupTail(output: string): { output: string; truncated: boolean } {
  const ends = output.endsWith("\n");
  const body = ends ? output.slice(0, -1) : output;
  const lines = body === "" ? [] : body.split("\n");
  let kept = lines.length > SETUP_TAIL_LINES ? lines.slice(-SETUP_TAIL_LINES) : lines;
  let truncated = kept.length < lines.length;
  const encoder = new TextEncoder();
  // Whole lines from the front first, so the tail is lines; a single line over the bound is cut at its own end.
  while (kept.length > 1 && encoder.encode(kept.join("\n")).length > SETUP_TAIL_BYTES) {
    kept = kept.slice(1);
    truncated = true;
  }
  let text = kept.join("\n");
  const bytes = encoder.encode(text);
  if (bytes.length > SETUP_TAIL_BYTES) {
    text = new TextDecoder().decode(bytes.slice(bytes.length - SETUP_TAIL_BYTES));
    truncated = true;
  }
  return { output: text === "" && !ends ? "" : `${text}${ends ? "\n" : ""}`, truncated };
}
