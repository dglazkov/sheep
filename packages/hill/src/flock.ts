/**
 * The flock (hill phase 2), pure: the home's line from `GET /home`, the
 * rows from `GET /sessions`, the address a row opens, and the poll's
 * schedule, all over given answers and a given clock, so the checkout ring
 * proves them with no browser and no home. `flock-view.ts` draws what this
 * returns.
 *
 * The words are the dog's words: a row's state is the Directory's word
 * unchanged, and its setup is `setupSaying` from the file `sheep status`
 * and `sheep log` say it with, imported and never retyped. The order is the
 * Directory's, newest first, and nothing here sorts it again.
 */
import { elapsed, type SetupState, setupSaying } from "../../cli/src/setup-words.ts";
import type { Answer } from "./home.ts";

export { elapsed };

/** What a cell last told the Directory its lane was doing. */
export type LaneState = "idle" | "running" | "waiting";

/**
 * One sheep as `GET /sessions` answers it: the cell's `SessionSummary`
 * (`packages/cell/src/directory.ts`), mirrored here because that file
 * imports the Workers runtime and could never be bundled for a browser.
 */
export interface SessionRow {
  id: string;
  name: string | null;
  createdAt: number;
  state: LaneState;
  pasture: string | null;
  task: string | null;
  secrets: string[];
  /** Optional as the dog's `SessionSummary` has it: a home older than bleat answers without the field. */
  setup?: SetupState | null;
}

/** What of `GET /home`'s `HomeReport` the home's line reads (`packages/cell/src/index.ts`). */
export interface HomeFacts {
  container: boolean;
  eyes: boolean;
  containerMinutes: number;
  budgetMinutes: number | null;
  spent: boolean;
}

/** The dot beside a row: its state at a glance, and red whenever its setup failed, whatever the state. */
export type Dot = "running" | "waiting" | "idle" | "failed";

/** The tone a row's setup words are drawn in: amber running, green ok, red failed, dim for none. */
export type SetupTone = "run" | "ok" | "bad" | "none";

/** A row as the page draws it, at a laptop's width and folded at a phone's. */
export interface RowModel {
  id: string;
  /** The id in parts (`idParts`): `lead` drawn dim, `mark` (its last eight) in ink, `short` where the id is folded. */
  lead: string;
  mark: string;
  short: string;
  name: string;
  state: LaneState;
  dot: Dot;
  pasture: string;
  /** The secrets' names, comma-separated; never a value, and the row carries none. */
  secrets: string;
  /** Born as a relative age, `2m ago`; `ageShort` is `2m` for a folded row; `bornIso` is the time itself. */
  age: string;
  ageShort: string;
  bornIso: string;
  task: string;
  /** `setupSaying` exactly: `running (1m 12s)`, `ok (45.1 s)`, `failed (exit 1, 12.4 s)`, `none`. */
  setup: string;
  setupTone: SetupTone;
  /** A folded row's second line: the setup while it runs or once it failed, else the task, else the setup's words when there are any. */
  sub: string;
  subIsSetup: boolean;
  /** A setup is running, so the row's words move each second from its `at`. */
  ticking: boolean;
}

/** The home's line as the page draws it. */
export interface HomeLine {
  container: boolean;
  eyes: boolean;
  /** The container minutes, rounded. */
  minutes: number;
  /** `null` when the home has no budget, and then no meter is drawn. */
  budget: number | null;
  /** The meter's fill, 0 to 1; `null` with no budget. */
  fill: number | null;
  spent: boolean;
  sheep: number;
}

/** How many of an id's characters tell it apart: its last eight. */
export const ID_MARK = 8;

/** An id as the page shortens it: everything but the last eight, the last eight, and the folded form. */
export interface IdParts {
  lead: string;
  mark: string;
  short: string;
}

/**
 * The one place the hill shortens an id. A sheep's id is a uuidv7, whose
 * first eight hex digits are a timestamp that holds for about 65 seconds, so
 * every sheep minted in one minute begins alike; the last eight are random.
 * So the last eight are the ones inked and the ones a fold keeps: `…` and
 * them. An id of eight characters or fewer is its own mark, unfolded.
 */
export function idParts(id: string): IdParts {
  if (id.length <= ID_MARK) return { lead: "", mark: id, short: id };
  const mark = id.slice(-ID_MARK);
  return { lead: id.slice(0, -ID_MARK), mark, short: `…${mark}` };
}

/** `12s`, `2m`, `3h`, `4d`: how long ago, the largest whole unit; a clock behind the home's is `0s`. */
export function ageShort(createdAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The dot's colour from the state and the setup. */
export function dotOf(row: Pick<SessionRow, "state" | "setup">): Dot {
  if (row.setup?.state === "failed") return "failed";
  return row.state;
}

function toneOf(setup: SetupState | null | undefined): SetupTone {
  if (setup === null || setup === undefined) return "none";
  return setup.state === "running" ? "run" : setup.state === "ok" ? "ok" : "bad";
}

/** One row of the flock at `now`. */
export function rowModel(row: SessionRow, now: number): RowModel {
  const setup = setupSaying(row.setup, now);
  const tone = toneOf(row.setup);
  const task = row.task ?? "";
  const setupFirst = tone === "run" || tone === "bad" || (task === "" && tone !== "none");
  return {
    id: row.id,
    ...idParts(row.id),
    name: row.name ?? "",
    state: row.state,
    dot: dotOf(row),
    pasture: row.pasture ?? "",
    secrets: row.secrets.join(","),
    age: `${ageShort(row.createdAt, now)} ago`,
    ageShort: ageShort(row.createdAt, now),
    bornIso: new Date(row.createdAt).toISOString(),
    task,
    setup,
    setupTone: tone,
    sub: setupFirst ? `setup ${setup}` : task,
    subIsSetup: setupFirst,
    ticking: tone === "run",
  };
}

/** The flock's rows at `now`, in the order the Directory answered them. */
export function rowModels(rows: readonly SessionRow[], now: number): RowModel[] {
  return rows.map((row) => rowModel(row, now));
}

/** The home's line from the report and the number of rows. */
export function homeLine(report: HomeFacts, sheep: number): HomeLine {
  const minutes = Math.round(report.containerMinutes);
  const budget = report.budgetMinutes;
  return {
    container: report.container,
    eyes: report.eyes,
    minutes,
    budget,
    fill: budget === null ? null : budget <= 0 ? 1 : Math.min(1, Math.max(0, report.containerMinutes / budget)),
    spent: report.spent,
    sheep,
  };
}

/** What one poll came to: the flock, a seat that is gone, or a home that did not answer. */
export type Reading =
  | { kind: "flock"; rows: SessionRow[]; report: HomeFacts; build: string | null }
  | { kind: "seatless"; build: string | null }
  | { kind: "silent" };

/**
 * One poll's two answers read: a 401 from either is the seat gone, which is
 * the gate; two 200s that parse are the flock; anything else, a failure to
 * fetch included (`undefined`), is the home not answering, and the page
 * keeps what it last had.
 */
export function readFlock(sessions: Answer | undefined, home: Answer | undefined): Reading {
  if (sessions?.status === 401 || home?.status === 401) return { kind: "seatless", build: sessions?.build ?? home?.build ?? null };
  if (sessions?.status !== 200 || home?.status !== 200) return { kind: "silent" };
  try {
    const rows = JSON.parse(sessions.text) as unknown;
    const report = JSON.parse(home.text) as unknown;
    if (!Array.isArray(rows) || report === null || typeof report !== "object") return { kind: "silent" };
    return { kind: "flock", rows: rows as SessionRow[], report: report as HomeFacts, build: sessions.build ?? home.build };
  } catch {
    return { kind: "silent" };
  }
}

/** The views under `/hill/`: the flock, or one sheep beside it. */
export type Route = { view: "flock" } | { view: "sheep"; id: string };

/** The route a path names: `/hill/s/<id>` is a sheep, anything else under `/hill/` the flock. */
export function routeOf(pathname: string): Route {
  const match = /^\/hill\/s\/([^/]+)\/?$/.exec(pathname);
  if (match === null) return { view: "flock" };
  try {
    return { view: "sheep", id: decodeURIComponent(match[1]!) };
  } catch {
    return { view: "flock" };
  }
}

/** The address a row opens. */
export function sheepPath(id: string): string {
  return `/hill/s/${encodeURIComponent(id)}`;
}

/** The flock's own address. */
export const FLOCK_PATH = "/hill/";

/** How often the flock asks, at most. */
export const POLL_MS = 2_000;

/** A clock the schedule is given: the time, and a timer it can cancel. The page's is `Date.now` and `setTimeout`. */
export interface Clock {
  now(): number;
  after(ms: number, run: () => void): () => void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

/**
 * The poll's schedule: `ask` (the two reads, as one promise) while visible,
 * never two in flight, never two starts closer than `interval`; a slow
 * answer delays the next ask and asks never stack. Hidden stops it: the
 * timer is cancelled, and an ask already in flight schedules nothing when it
 * lands. Visible again asks at once, or at the interval's end when the last
 * ask began less than an interval ago, so no toggling of a tab can make it
 * ask more often than once per interval.
 */
export class Poller {
  readonly #ask: () => Promise<void>;
  readonly #clock: Clock;
  readonly #interval: number;
  #visible = false;
  #inFlight = false;
  #lastStart: number | undefined;
  #cancel: (() => void) | undefined;

  constructor(ask: () => Promise<void>, clock: Clock = realClock, interval = POLL_MS) {
    this.#ask = ask;
    this.#clock = clock;
    this.#interval = interval;
  }

  /** Whether the page is visible now: `document.visibilityState === "visible"`. */
  visible(visible: boolean): void {
    this.#visible = visible;
    if (!visible) {
      this.#cancel?.();
      this.#cancel = undefined;
      return;
    }
    this.#schedule();
  }

  /** Stopped for good, as when the view goes: the same as hidden. */
  stop(): void {
    this.visible(false);
  }

  /** Whether an ask is waiting on a timer; for the tests. */
  get pending(): boolean {
    return this.#cancel !== undefined;
  }

  #schedule(): void {
    if (!this.#visible || this.#inFlight || this.#cancel !== undefined) return;
    const wait = this.#lastStart === undefined ? 0 : this.#lastStart + this.#interval - this.#clock.now();
    if (wait <= 0) {
      this.#run();
      return;
    }
    this.#cancel = this.#clock.after(wait, () => {
      this.#cancel = undefined;
      this.#schedule();
    });
  }

  #run(): void {
    this.#inFlight = true;
    this.#lastStart = this.#clock.now();
    const landed = (): void => {
      this.#inFlight = false;
      this.#schedule();
    };
    let asked: Promise<void>;
    try {
      asked = this.#ask();
    } catch {
      asked = Promise.resolve();
    }
    asked.then(landed, landed);
  }
}
