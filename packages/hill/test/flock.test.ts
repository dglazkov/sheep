/**
 * Hill phase 2 in the checkout ring: the flock's logic with no browser and
 * no home. Rows from a `SessionSummary[]` to the row model in the order the
 * Directory gave them, the dot from the state and the setup, the setup in
 * the dog's own words from a clock, the home's line from `GET /home`, a
 * poll's two answers read, the address a row opens, and the poll as a
 * schedule over a fake clock: at most one ask per two seconds, never two in
 * flight, and none while hidden.
 */
import { describe, expect, it } from "vitest";
import { setupSaying } from "../../cli/src/setup-words.ts";
import { ageShort, type Clock, dotOf, homeLine, idParts, POLL_MS, Poller, readFlock, routeOf, rowModel, rowModels, type SessionRow, sheepPath } from "../src/flock.ts";
import type { Answer } from "../src/home.ts";

const NOW = Date.parse("2026-09-14T20:00:00Z");
const BUILD = "3b38f11 2026-09-14T18:02:11Z";

/** The storyboard's example flock, as `GET /sessions` answers it: newest first. */
const FLOCK: SessionRow[] = [
  {
    id: "8c1f2a4e-3b9d-4f0a-9c2e-1d7b5e6a2f31",
    name: "feed",
    createdAt: NOW - 2 * 60_000,
    state: "running",
    pasture: "blog",
    task: "Fix the RSS feed's date format in src/feed.ts and add a test",
    secrets: ["NPM_TOKEN"],
    setup: { state: "ok", at: NOW - 3 * 60_000, ms: 45_100, exit: 0 },
  },
  { id: "2e77d0c1-58aa-4c13-a1e4-6f9b2c0d8e45", name: null, createdAt: NOW - 4 * 60_000, state: "running", pasture: "blog", task: null, secrets: [], setup: { state: "running", at: NOW - 72_000 } },
  { id: "b41a9e37-0c2d-4e8f-b7a1-3c5d9e2f6a08", name: "nav", createdAt: NOW - 18 * 60_000, state: "waiting", pasture: "blog", task: "Make the site nav collapse", secrets: [], setup: { state: "ok", at: NOW - 19 * 60_000, ms: 44_800, exit: 0 } },
  { id: "f09e6b52-7d1c-4a3b-8e2f-9a4c1b7d3e60", name: null, createdAt: NOW - 60 * 60_000, state: "idle", pasture: null, task: "Say hello and list the tools you have", secrets: [], setup: null },
  {
    id: "61d3c8a9-2f4e-4b6d-a0c7-5e8f2a1b9c73",
    name: "deps",
    createdAt: NOW - 3 * 3_600_000,
    state: "idle",
    pasture: "town",
    task: "Bump every dependency a minor and run the suite",
    secrets: ["GH_TOKEN", "NPM_TOKEN"],
    setup: { state: "failed", at: NOW - 3 * 3_600_000, ms: 12_400, exit: 1 },
  },
];

describe("an id, shortened", () => {
  // Two ids a local home minted 4.6 seconds apart in the walk: uuidv7, so their first eight are one timestamp.
  const WALKER = "01a0a339-b572-72b5-a62a-b10aea490503";
  const FEED2 = "01a0a339-c740-72b5-a62a-b10ddbcf00f8";

  it("keeps the last eight, which tell two sheep minted in the same minute apart where the first eight cannot", () => {
    expect(WALKER.slice(0, 8)).toBe(FEED2.slice(0, 8));
    expect(idParts(WALKER)).toEqual({ lead: "01a0a339-b572-72b5-a62a-b10a", mark: "ea490503", short: "…ea490503" });
    expect(idParts(FEED2)).toEqual({ lead: "01a0a339-c740-72b5-a62a-b10d", mark: "dbcf00f8", short: "…dbcf00f8" });
    expect(idParts(WALKER).short).not.toBe(idParts(FEED2).short);
    expect(idParts(WALKER).mark).not.toBe(idParts(FEED2).mark);
  });

  it("is the whole id again when joined, and an id of eight or fewer is its own mark, unfolded", () => {
    for (const id of [WALKER, FEED2]) expect(idParts(id).lead + idParts(id).mark).toBe(id);
    expect(idParts("8c1f2a4e")).toEqual({ lead: "", mark: "8c1f2a4e", short: "8c1f2a4e" });
    expect(idParts("abc")).toEqual({ lead: "", mark: "abc", short: "abc" });
  });

  it("is what every row carries", () => {
    for (const row of FLOCK) expect(rowModel(row, NOW)).toMatchObject(idParts(row.id));
  });
});

describe("the rows", () => {
  it("keep the Directory's order exactly, whatever the times say", () => {
    const shuffled = [FLOCK[3]!, FLOCK[0]!, FLOCK[4]!, FLOCK[1]!, FLOCK[2]!];
    expect(rowModels(shuffled, NOW).map((row) => row.id)).toEqual(shuffled.map((row) => row.id));
    expect(rowModels(FLOCK, NOW).map((row) => row.id)).toEqual(FLOCK.map((row) => row.id));
  });

  it("carry the columns of sheep ls and the row's task and setup, the id split where the storyboard dims it", () => {
    expect(rowModel(FLOCK[0]!, NOW)).toEqual({
      id: "8c1f2a4e-3b9d-4f0a-9c2e-1d7b5e6a2f31",
      lead: "8c1f2a4e-3b9d-4f0a-9c2e-1d7b",
      mark: "5e6a2f31",
      short: "…5e6a2f31",
      name: "feed",
      state: "running",
      dot: "running",
      pasture: "blog",
      secrets: "NPM_TOKEN",
      age: "2m ago",
      ageShort: "2m",
      bornIso: "2026-09-14T19:58:00.000Z",
      task: "Fix the RSS feed's date format in src/feed.ts and add a test",
      setup: "ok (45.1 s)",
      setupTone: "ok",
      sub: "Fix the RSS feed's date format in src/feed.ts and add a test",
      subIsSetup: false,
      ticking: false,
    });
    const quiet = rowModel(FLOCK[3]!, NOW);
    expect([quiet.name, quiet.pasture, quiet.secrets, quiet.setup, quiet.setupTone]).toEqual(["", "", "", "none", "none"]);
    expect(rowModel(FLOCK[4]!, NOW).secrets).toBe("GH_TOKEN,NPM_TOKEN");
  });

  it("say the state as the Directory's word, unchanged", () => {
    expect(rowModels(FLOCK, NOW).map((row) => row.state)).toEqual(["running", "running", "waiting", "idle", "idle"]);
  });

  it("colour the dot from the state, and red whenever the setup failed, whatever the state", () => {
    expect(rowModels(FLOCK, NOW).map((row) => row.dot)).toEqual(["running", "running", "waiting", "idle", "failed"]);
    for (const state of ["idle", "running", "waiting"] as const) {
      expect(dotOf({ state, setup: { state: "failed", at: NOW, error: "the container went away" } })).toBe("failed");
      expect(dotOf({ state, setup: { state: "running", at: NOW } })).toBe(state);
      expect(dotOf({ state, setup: null })).toBe(state);
      expect(dotOf({ state })).toBe(state);
    }
  });

  it("say the setup as sheep status says it, a running one's elapsed time from its at and the clock, moving with the clock", () => {
    for (const row of FLOCK) expect(rowModel(row, NOW).setup).toBe(setupSaying(row.setup, NOW));
    const running = FLOCK[1]!;
    expect(rowModel(running, NOW)).toMatchObject({ setup: "running (1m 12s)", setupTone: "run", ticking: true, sub: "setup running (1m 12s)", subIsSetup: true });
    expect(rowModel(running, NOW + 1_000).setup).toBe("running (1m 13s)");
    expect(rowModel({ ...running, setup: { state: "running", at: NOW - 9_000 } }, NOW).setup).toBe("running (9.0 s)");
    expect(rowModel(FLOCK[4]!, NOW)).toMatchObject({ setup: "failed (exit 1, 12.4 s)", setupTone: "bad", sub: "setup failed (exit 1, 12.4 s)", subIsSetup: true });
  });

  it("fold to a second line: the setup running or failed, else the task, else the setup's words, else nothing", () => {
    expect(rowModel(FLOCK[2]!, NOW).sub).toBe("Make the site nav collapse");
    expect(rowModel({ ...FLOCK[2]!, task: null }, NOW).sub).toBe("setup ok (44.8 s)");
    expect(rowModel({ ...FLOCK[3]!, task: null }, NOW)).toMatchObject({ sub: "", subIsSetup: false });
  });

  it("age from createdAt and the clock in the largest whole unit, and a clock behind the home's is 0s", () => {
    expect(ageShort(NOW - 12_000, NOW)).toBe("12s");
    expect(ageShort(NOW - 2 * 60_000, NOW)).toBe("2m");
    expect(ageShort(NOW - 3 * 3_600_000 - 1, NOW)).toBe("3h");
    expect(ageShort(NOW - 4 * 86_400_000, NOW)).toBe("4d");
    expect(ageShort(NOW + 5_000, NOW)).toBe("0s");
    expect(rowModels(FLOCK, NOW).map((row) => row.age)).toEqual(["2m ago", "4m ago", "18m ago", "1h ago", "3h ago"]);
  });
});

describe("the home's line", () => {
  it("container and eyes, the minutes rounded against a budget with its fill, and the count", () => {
    expect(homeLine({ container: true, eyes: true, containerMinutes: 37.4, budgetMinutes: 250, spent: false }, 5)).toEqual({
      container: true,
      eyes: true,
      minutes: 37,
      budget: 250,
      fill: 37.4 / 250,
      spent: false,
      sheep: 5,
    });
  });

  it("no meter with no budget, and a spent budget full and said so", () => {
    expect(homeLine({ container: false, eyes: false, containerMinutes: 0, budgetMinutes: null, spent: false }, 0)).toMatchObject({ budget: null, fill: null, minutes: 0 });
    expect(homeLine({ container: true, eyes: false, containerMinutes: 301.6, budgetMinutes: 300, spent: true }, 2)).toMatchObject({ minutes: 302, fill: 1, spent: true });
  });
});

describe("a poll's two answers", () => {
  const ok = (text: string): Answer => ({ status: 200, text, build: BUILD });
  const REPORT = { serverId: "s", container: true, eyes: false, build: { commit: "3b38f11", builtAt: null }, image: null, containerMinutes: 3, budgetMinutes: null, spent: false };

  it("two 200s are the flock, rows as given", () => {
    const reading = readFlock(ok(JSON.stringify(FLOCK)), ok(JSON.stringify(REPORT)));
    expect(reading).toEqual({ kind: "flock", rows: FLOCK, report: REPORT, build: BUILD });
  });

  it("a 401 from either is the seat gone", () => {
    const refused: Answer = { status: 401, text: "bad or missing token", build: BUILD };
    expect(readFlock(refused, ok("{}"))).toEqual({ kind: "seatless", build: BUILD });
    expect(readFlock(ok("[]"), refused)).toEqual({ kind: "seatless", build: BUILD });
    expect(readFlock(undefined, refused).kind).toBe("seatless");
  });

  it("no answer, a 5xx, or a body that does not parse is the home not answering", () => {
    expect(readFlock(undefined, undefined)).toEqual({ kind: "silent" });
    expect(readFlock(ok("[]"), undefined)).toEqual({ kind: "silent" });
    expect(readFlock({ status: 502, text: "", build: null }, ok("{}"))).toEqual({ kind: "silent" });
    expect(readFlock(ok("<html>"), ok("{}"))).toEqual({ kind: "silent" });
    expect(readFlock(ok("{}"), ok("{}"))).toEqual({ kind: "silent" });
  });
});

describe("the address", () => {
  it("a row opens /hill/s/<id>, and that path is the sheep's view; anything else under /hill/ is the flock", () => {
    const id = FLOCK[0]!.id;
    expect(sheepPath(id)).toBe(`/hill/s/${id}`);
    expect(routeOf(sheepPath(id))).toEqual({ view: "sheep", id });
    expect(routeOf(`/hill/s/${id}/`)).toEqual({ view: "sheep", id });
    expect(routeOf("/hill/")).toEqual({ view: "flock" });
    expect(routeOf("/hill/anything")).toEqual({ view: "flock" });
    expect(routeOf("/hill/s/")).toEqual({ view: "flock" });
    expect(routeOf("/hill/s/%E0%A4%A")).toEqual({ view: "flock" });
  });
});

/** A clock whose time moves only when told, running each timer as its moment passes. */
function fakeClock(): Clock & { advance(ms: number): Promise<void>; timers: number } {
  let now = 0;
  let timers: { at: number; run: () => void; live: boolean }[] = [];
  return {
    now: () => now,
    after(ms, run) {
      const timer = { at: now + ms, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    get timers() {
      return timers.filter((timer) => timer.live).length;
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        const next = timers.filter((timer) => timer.live && timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (next === undefined) break;
        now = next.at;
        next.live = false;
        timers = timers.filter((timer) => timer.live);
        next.run();
      }
      now = end;
      await flush();
    },
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** An ask that records when it began, answering at once or when released. */
function asker(clock: Clock, { hold = false } = {}): { ask: () => Promise<void>; starts: number[]; release: () => void } {
  const starts: number[] = [];
  let pending: (() => void)[] = [];
  return {
    starts,
    ask: () => {
      starts.push(clock.now());
      return hold ? new Promise<void>((resolve) => pending.push(resolve)) : Promise.resolve();
    },
    release: () => {
      for (const resolve of pending) resolve();
      pending = [];
    },
  };
}

describe("the poll", () => {
  it("asks at once when visible, then once every two seconds", async () => {
    const clock = fakeClock();
    const { ask, starts } = asker(clock);
    const poller = new Poller(ask, clock);
    poller.visible(true);
    await clock.advance(10_000);
    expect(POLL_MS).toBe(2_000);
    expect(starts).toEqual([0, 2_000, 4_000, 6_000, 8_000, 10_000]);
  });

  it("stops when told hidden: nothing is asked while hidden, however long, and no timer is left", async () => {
    const clock = fakeClock();
    const { ask, starts } = asker(clock);
    const poller = new Poller(ask, clock);
    poller.visible(true);
    await clock.advance(3_000);
    expect(starts).toEqual([0, 2_000]);
    poller.visible(false);
    await clock.advance(8 * 3_600_000);
    expect(starts).toEqual([0, 2_000]);
    expect(poller.pending).toBe(false);
    expect(clock.timers).toBe(0);
  });

  it("an ask in flight when hidden schedules nothing when it lands", async () => {
    const clock = fakeClock();
    const held = asker(clock, { hold: true });
    const poller = new Poller(held.ask, clock);
    poller.visible(true);
    expect(held.starts).toEqual([0]);
    poller.visible(false);
    await clock.advance(500);
    held.release();
    await clock.advance(60_000);
    expect(held.starts).toEqual([0]);
    expect(poller.pending).toBe(false);
  });

  it("asks at once when visible again, unless the last ask began under two seconds ago, and then at the two seconds", async () => {
    const clock = fakeClock();
    const { ask, starts } = asker(clock);
    const poller = new Poller(ask, clock);
    poller.visible(true);
    poller.visible(false);
    await clock.advance(30_000);
    poller.visible(true);
    await flush();
    expect(starts).toEqual([0, 30_000]);
    await clock.advance(500);
    poller.visible(false);
    poller.visible(true);
    await flush();
    expect(starts).toEqual([0, 30_000]);
    await clock.advance(1_500);
    expect(starts).toEqual([0, 30_000, 32_000]);
  });

  it("never asks more than once in two seconds, however the tab is toggled", async () => {
    const clock = fakeClock();
    const { ask, starts } = asker(clock);
    const poller = new Poller(ask, clock);
    for (let step = 0; step < 400; step++) {
      poller.visible(step % 3 !== 0);
      await clock.advance(137);
    }
    expect(starts.length).toBeGreaterThan(10);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(POLL_MS);
  });

  it("a slow answer delays the next ask, and asks never stack", async () => {
    const clock = fakeClock();
    const held = asker(clock, { hold: true });
    const poller = new Poller(held.ask, clock);
    poller.visible(true);
    await clock.advance(7_000);
    expect(held.starts).toEqual([0]);
    held.release();
    await flush();
    expect(held.starts).toEqual([0, 7_000]);
    await clock.advance(1_000);
    held.release();
    await clock.advance(999);
    expect(held.starts).toEqual([0, 7_000]);
    await clock.advance(1);
    expect(held.starts).toEqual([0, 7_000, 9_000]);
  });

  it("an ask that fails is asked again at the next tick", async () => {
    const clock = fakeClock();
    const starts: number[] = [];
    const poller = new Poller(() => {
      starts.push(clock.now());
      return Promise.reject(new TypeError("Failed to fetch"));
    }, clock);
    poller.visible(true);
    await clock.advance(4_000);
    expect(starts).toEqual([0, 2_000, 4_000]);
    poller.stop();
  });
});
