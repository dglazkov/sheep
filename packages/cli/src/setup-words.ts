/**
 * The setup's words (bleat phase 1), shared by both commands: `sheep`'s
 * held prompt, `sheep status`, and `sheep log` (`herd.ts`), and the
 * collie's Worker, which narrates a sheep's setup as `sheep attach` says it
 * (`packages/collie/src/sheep.ts`, collie phase 1). This file imports
 * nothing, on purpose: Node reads it through `herd.ts` and workerd reads it
 * through the collie, so nothing here may reach for either runtime.
 */

/** What a setup is doing, as the sheep's row says it (bleat phase 0's `SetupPhase`). */
export type SetupPhase = "running" | "ok" | "failed";

/**
 * The `setup` on a sheep's Directory row, mirroring
 * `packages/cell/src/bleat.ts`: the live state of the pasture's `setup.sh`
 * in this sheep's container. `ms` is absent three ways — while it runs, on
 * a `failed` an eviction cut off (the length is unknowable, not zero), and
 * on one whose end never came — and every surface must render each.
 */
export interface SetupState {
  state: SetupPhase;
  /** When the setup started; `Date.now() - at` is the elapsed time while it runs. */
  at: number;
  ms?: number;
  exit?: number;
  error?: string;
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
