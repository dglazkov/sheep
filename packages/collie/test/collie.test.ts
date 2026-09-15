/**
 * The collie's object in workerd (collie phase 1): journeys 1 (steps 5 to
 * 7), 2 (steps 2 to 4, in miniature; step 3 from collie phase 2), 3, 4 (collie phase 3), and 5 (steps 3 and 5) against the
 * fakes in `fakes.ts`, which stand in for an isocan home and the station and
 * are put in place of the global `fetch` the object calls.
 *
 * Each case has an object of its own (a fresh name), and every object is
 * aborted after the case, so no room outlives it. What a case asserts is what
 * the journey requires of the two homes — the hold the isocan home saw, the
 * summons the station was sent, the cursor's row, the badge — and the
 * summons text is computed with isocan's own `summonsPrompt` over the entry
 * the fake served, never copied from a run.
 */
import { abortAllDurableObjects, env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { summonsPrompt } from "isocan/rc";
import { carriesNewEntries } from "../src/sheep.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Collie } from "../src/collie.ts";
import { type Actor, FakeIsocan, FakeStation, installFetch } from "./fakes.ts";

const DIMITRI: Actor = { id: "usr_dimitri", name: "Dimitri" };
const CANVAS = { id: "cnv_landing", title: "Landing page" };

let restore: (() => void) | undefined;
let isocan: FakeIsocan;
let station: FakeStation;
let count = 0;

beforeEach(() => {
  isocan = new FakeIsocan({ origin: "https://isocan.test", canvas: CANVAS, owner: DIMITRI });
  station = new FakeStation({ origin: env.COLLIE_SHEEP_HOME!, token: env.COLLIE_SHEEP_TOKEN! });
  restore = installFetch(isocan, station);
});

afterEach(async () => {
  await abortAllDurableObjects();
  restore?.();
});

function collie(): DurableObjectStub<Collie> {
  return env.COLLIE.getByName(`collie-case-${++count}-${crypto.randomUUID()}`);
}

async function until(check: () => boolean | Promise<boolean>, what: string, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`waited ${ms} ms for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function lines(stub: DurableObjectStub<Collie>): Promise<string[]> {
  return (await stub.log(0, undefined)).lines.map((row) => row.line);
}

/** Waits until the narration holds a line containing `text`. */
async function said(stub: DurableObjectStub<Collie>, text: string, ms?: number): Promise<void> {
  await until(async () => (await lines(stub)).some((line) => line.includes(text)), `the narration to say ${JSON.stringify(text)}`, ms);
}

/** Every table of the object's SQLite, and its key-value storage, as one string. */
async function wholeStorage(stub: DurableObjectStub<Collie>): Promise<string> {
  return runInDurableObject(stub, async (_instance, state) => {
    const tables = state.storage.sql.exec<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'`).toArray();
    const dump: Record<string, unknown> = {};
    for (const { name } of tables) dump[name] = state.storage.sql.exec(`SELECT * FROM "${name}"`).toArray();
    dump.kv = [...(await state.storage.list()).entries()];
    return JSON.stringify(dump);
  });
}

/** A room on the canvas, handed over by a pass minted as Dimitri, and the collie standing by on it. */
async function standingBy(stub: DurableObjectStub<Collie>): Promise<string> {
  const { address, token } = isocan.issuePass();
  const answer = await stub.passes(address);
  expect(answer).toEqual({ ok: true, value: { kind: "room", room: { canvasId: CANVAS.id, title: CANVAS.title, origin: isocan.origin, address: `${isocan.origin}/p/${CANVAS.id}` }, owner: "Dimitri", already: false } });
  await until(() => isocan.holdsStarted > 0 && isocan.openHolds > 0, "the collie's hold at the isocan home");
  return token;
}

/** Percy asked for in the tray, enrolled by the collie, and parked. */
async function percyEnrolled(stub: DurableObjectStub<Collie>): Promise<Actor> {
  isocan.ask("Percy");
  await said(stub, "Dimitri asked from the canvas to add Percy — enrolling here");
  await until(() => Object.values(isocan.agents).some((agent) => agent.actor.name === "Percy"), "Percy's enrolment at the isocan home");
  const percy = Object.values(isocan.agents).find((agent) => agent.actor.name === "Percy")!.actor;
  await until(() => isocan.calls.filter((call) => call === "POST /api/rc/hold").length > 0 && isocan.parks.has(percy.id), "Percy's cursor");
  return percy;
}

describe("a pass becomes a room, and the collie stands by (journey 1 steps 4 and 5)", () => {
  it("redeems the pass at the isocan home with a badge the door handed it, and holds for the canvas as Dimitri", async () => {
    const stub = collie();
    await standingBy(stub);
    expect(isocan.calls.slice(0, 3)).toEqual(["POST /api/passes/redeem", "POST /api/door", "POST /api/passes/redeem"]);
    const holdsBefore = isocan.holdsStarted;
    await until(() => isocan.holdsStarted >= holdsBefore + 2, "holds issued back to back");
    expect(await lines(stub)).toContain(`answering on "Landing page" — ${isocan.origin}/p/${CANVAS.id}`);
    expect(await stub.home({ commit: "c", builtAt: null })).toMatchObject({ on: true, rooms: 1 });
    // A second pass for the same canvas is spent and changes nothing: the room was already one.
    const again = await stub.passes(isocan.issuePass().address);
    expect(again).toMatchObject({ ok: true, value: { kind: "room", already: true } });
    expect((await stub.report()).rooms).toHaveLength(1);
  });

  it("the ask from the tray enrols Percy here: claimed under the collie's own agent key, the row, the enroll op, the cursor seeded", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    const key = [...isocan.keys.entries()].find(([, actor]) => actor.id === percy.id)![0];
    expect(key).toMatch(/^agent:[A-Za-z0-9_-]{32}$/);
    expect(key).not.toContain("Percy");
    const enroll = isocan.log.find((entry) => entry.envelope.op.type === "agent.enroll")!;
    expect(enroll.envelope.actor).toEqual(DIMITRI);
    expect(isocan.parks.get(percy.id)!.cursor).toBeGreaterThanOrEqual(enroll.seq);
    const report = await stub.report();
    expect(report.rooms[0]!.agents).toEqual([{ name: "Percy", actorId: percy.id, sheep: null, lane: null, pasture: null, came: "born here", turnsLastHour: 0 }]);
    // The hold now names Percy, so the canvas reads Percy as answerable.
    await until(() => isocan.calls.length > 0 && isocan.badges.size > 0 && [...isocan.badges.values()].some((badge) => badge.holds.has(percy.id)), "Percy held by the collie's badge");
  });
});

describe("a mention of Percy (journey 1 steps 6 and 7)", () => {
  it("births a sheep into isocan-percy with ISOCAN_PASS its own, sends isocan's summons, puts the face on and off, advances the cursor, and says the rc's lines", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    const threadId = isocan.mention(DIMITRI, percy, "@Percy the empty state reads wrong");
    const mention = isocan.log.at(-1)!;
    await said(stub, "Percy · turn ended — end_turn");

    // The sheep: born into the agent's pasture, with the pass as its own secret, minted for Percy's actor at the isocan home.
    expect(station.rows.size).toBe(1);
    const [sheep] = [...station.rows.values()];
    expect(sheep).toMatchObject({ name: "Percy", pasture: "isocan-percy", secrets: ["ISOCAN_PASS"] });
    const birthPass = station.secretValues.get(sheep!.id)!.ISOCAN_PASS!;
    const minted = [...isocan.passes.values()].find((pass) => pass.actorId === percy.id)!;
    expect(birthPass).toBe(`${isocan.origin}/p/${CANVAS.id}#${minted.id}.${minted.secret}`);
    expect([...station.pastures.get("isocan-percy")!.files.keys()].sort()).toEqual(["BRIEF.md", "setup.sh", "skills/isocan/SKILL.md"]);

    // The summons, byte for byte isocan's for the same entry.
    expect(station.prompts).toHaveLength(1);
    expect(station.prompts[0]!.text).toBe(summonsPrompt(CANVAS.title, "Percy", { reason: "summons", entries: [isocan.served(mention)] as never }));

    // The face: made for Percy with the sheep harness, placed on the thread, beaten by the tool call, and ended.
    const faces = isocan.calls.filter((call) => call === `POST /api/projects/${CANVAS.id}/sessions`);
    expect(faces.length).toBeGreaterThanOrEqual(2);
    const endedFace = isocan.ended.find((id) => !isocan.presence.has(id));
    expect(endedFace).toBeDefined();
    await until(() => isocan.parks.get(percy.id)!.cursor >= mention.seq, "Percy's cursor advanced past the mention");

    const narration = await lines(stub);
    const order = [
      "Percy · summons from Dimitri, 1 entry — starting a session",
      `Percy · birthing a sheep for Percy at ${station.origin}`,
      "Percy · making pasture isocan-percy",
      "Percy · minting a pass for Percy",
      `Percy · sheep ${sheep!.id} minted`,
      `Percy · session started at ${station.origin}`,
      "Percy · turn ended — end_turn",
    ];
    let at = -1;
    for (const expected of order) {
      const found = narration.findIndex((line, index) => index > at && line.startsWith(expected));
      expect(found, `${expected} after line ${at} in:\n${narration.join("\n")}`).toBeGreaterThan(at);
      at = found;
    }
    expect(threadId).toMatch(/^thr_/);

    // Journey 1 step 7: the report names the sheep, idle, in its pasture, born here, one turn in the hour.
    const report = await stub.report();
    expect(report).toMatchObject({ on: true, limits: { turnsPerHour: 12, chain: 3 } });
    expect(report.rooms[0]).toMatchObject({ canvasId: CANVAS.id, title: CANVAS.title, owner: "Dimitri" });
    expect(report.rooms[0]!.agents).toEqual([{ name: "Percy", actorId: percy.id, sheep: sheep!.id, lane: "idle", pasture: "isocan-percy", came: "born here", turnsLastHour: 1 }]);
  });

  it("keeps no pass anywhere in the object: not the one it redeemed, not the one it minted for the sheep", async () => {
    const stub = collie();
    const token = await standingBy(stub);
    const percy = await percyEnrolled(stub);
    isocan.mention(DIMITRI, percy, "@Percy look");
    await said(stub, "Percy · turn ended — end_turn");
    const minted = [...isocan.passes.values()].find((pass) => pass.actorId === percy.id)!;
    const storage = await wholeStorage(stub);
    expect(storage).toContain(CANVAS.id);
    for (const secret of [token, token.split(".")[1]!, minted.secret]) expect(storage).not.toContain(secret);
  });
});

describe("the switch and the end (journey 3)", () => {
  it("off releases every hold before it answers; a mention meanwhile is not answered and not lost, and is the next summons after on", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    await until(() => isocan.openHolds > 0, "a hold open");
    const off = await stub.off();
    expect(isocan.openHolds).toBe(0);
    expect(off).toEqual({ on: false, rooms: [{ canvasId: CANVAS.id, title: CANVAS.title, origin: isocan.origin, address: `${isocan.origin}/p/${CANVAS.id}` }] });
    const holds = isocan.holdsStarted;
    const mention = isocan.mention(DIMITRI, percy, "@Percy while it is off");
    const entry = isocan.log.at(-1)!;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(isocan.holdsStarted).toBe(holds);
    expect(station.prompts).toHaveLength(0);
    expect((await stub.report()).on).toBe(false);
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())).toBeNull();

    expect(await stub.on()).toMatchObject({ on: true });
    await until(() => isocan.holdsStarted > holds, "the hold again after on");
    await until(() => station.prompts.length === 1, "the held mention summoned");
    expect(mention).toMatch(/^thr_/);
    expect(station.prompts[0]!.text).toContain(JSON.stringify((isocan.served(entry) as { envelope: { op: { comment: unknown } } }).envelope.op.comment, null, 2).split("\n")[1]!.trim());
    await until(() => isocan.parks.get(percy.id)!.cursor >= entry.seq, "the cursor past the held mention");
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())).not.toBeNull();
  });

  it("the end stops the room, ends the badge at the isocan home with isocan's route, and leaves every sheep and pasture at the station", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    isocan.mention(DIMITRI, percy, "@Percy hello");
    await said(stub, "Percy · turn ended — end_turn");
    const badgeId = [...isocan.badges.entries()].find(([, badge]) => badge.holds.has(DIMITRI.id))![0];
    const stationBefore = station.requests.length;
    const ended = await stub.end();
    expect(ended).toEqual({ ok: true, value: { ended: [{ origin: isocan.origin, badge: badgeId }] } });
    expect(isocan.badges.get(badgeId)!.killed).toBe(true);
    expect(isocan.openHolds).toBe(0);
    expect(station.requests.slice(stationBefore).filter((request) => !request.startsWith("GET "))).toEqual([]);
    expect(station.rows.size).toBe(1);
    expect(station.pastures.has("isocan-percy")).toBe(true);
    expect((await stub.report()).rooms).toEqual([]);
    const storage = await wholeStorage(stub);
    expect(storage).not.toContain(badgeId);
  });

  it("Percy withdrawn in the tray: said as the rc says it, and the sheep ended at the station, its pasture kept", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    isocan.mention(DIMITRI, percy, "@Percy hello");
    await said(stub, "Percy · turn ended — end_turn");
    const [sheep] = [...station.rows.keys()];
    isocan.withdraw(percy);
    await said(stub, "Dimitri dismissed Percy — no longer answering here");
    await said(stub, `Percy · ending sheep ${sheep}`);
    expect(station.rows.size).toBe(0);
    expect(station.pastures.has("isocan-percy")).toBe(true);
  });
});

describe("the night (journey 2, in miniature)", () => {
  it("step 2: the object evicted mid-turn; the alarm's restart rejoins the sheep's turn, sends nothing twice, and advances the cursor once when it ends", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    station.turn = "hold";
    isocan.mention(DIMITRI, percy, "@Percy a long one");
    const mention = isocan.log.at(-1)!;
    await until(() => station.prompts.length === 1 && [...station.rows.keys()].some((id) => station.running(id)), "Percy's turn running at the station");
    const [sheep] = [...station.rows.keys()];
    const advancesBefore = isocan.calls.filter((call) => call === "POST /api/park/advance").length;

    // The deploy's restart: every instance torn down mid-turn, storage kept; the stub to the same name reaches the new one.
    await abortAllDurableObjects();
    const stationAt = station.requests.length;
    const again = env.COLLIE.get(stub.id);
    expect(await runDurableObjectAlarm(again)).toBe(true);
    await until(() => station.requests.slice(stationAt).some((request) => request === `GET /s/${sheep}/transcript`), "the follow taken up again");
    expect(station.prompts).toHaveLength(1);
    expect(isocan.parks.get(percy.id)!.cursor).toBeLessThan(mention.seq);

    station.endTurn(sheep!);
    await until(() => isocan.parks.get(percy.id)!.cursor >= mention.seq, "the cursor advanced when the rejoined turn ended");
    await said(again, "Percy · turn ended — end_turn");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(station.prompts).toHaveLength(1);
    expect(station.rows.size).toBe(1);
    expect(isocan.calls.filter((call) => call === "POST /api/park/advance").length).toBeGreaterThan(advancesBefore);
    // The alarm is armed a lap ahead again.
    expect(await runInDurableObject(again, (_instance, state) => state.storage.getAlarm())).not.toBeNull();
  });

  it("step 3: the station restarted mid-turn; the follow's drop is said once, naming the station, the turn's end still read, and the cursor advanced", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    station.turn = "hold";
    isocan.mention(DIMITRI, percy, "@Percy through a restart");
    const mention = isocan.log.at(-1)!;
    await until(() => station.prompts.length === 1 && [...station.rows.keys()].some((id) => station.running(id)), "Percy's turn running at the station");
    const [sheep] = [...station.rows.keys()];

    // The restart: the held long poll is cut, and the station refuses connections for a while.
    station.down = true;
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    station.down = false;
    await said(stub, "stopped answering for");
    station.endTurn(sheep!);
    await until(() => isocan.parks.get(percy.id)!.cursor >= mention.seq, "the cursor advanced when the turn ended");
    await said(stub, "Percy · turn ended — end_turn");
    const narration = await lines(stub);
    const origin = new URL(station.origin).origin.replace(/[.]/g, "\\.");
    expect(narration.filter((line) => line.includes("stopped answering for")), narration.join("\n")).toHaveLength(1);
    expect(narration.find((line) => line.includes("stopped answering for"))).toMatch(new RegExp(`^Percy · the station at ${origin} stopped answering for \\d+s — following sheep ${sheep}'s turn again$`));
    expect(station.prompts).toHaveLength(1);
    expect(station.rows.size).toBe(1);
  });

  it("the resume rule reads isocan's own marks: a summons whose every entry is redelivered is the rejoined turn's, one with a new entry is sent after it", () => {
    const entry = (seq: number, redelivered?: boolean) => ({ seq, envelope: { actor: DIMITRI, op: { type: "thread.create", threadId: "thr", comment: { id: `c${seq}`, body: "{\n}" } }, ts: "2026-09-14T00:00:00Z" }, canvasId: CANVAS.id, canvasTitle: CANVAS.title, ...(redelivered ? { redelivered } : {}) });
    const text = (entries: unknown[]) => summonsPrompt(CANVAS.title, "Percy", { reason: "summons", entries: entries as never });
    expect(carriesNewEntries(text([entry(4, true), entry(5, true)]))).toBe(false);
    expect(carriesNewEntries(text([entry(4, true), entry(6)]))).toBe(true);
    expect(carriesNewEntries(text([entry(7)]))).toBe(true);
    expect(carriesNewEntries("not a summons")).toBe(true);
  });

  it("step 1's setup, said as sheep attach says it: running when the follow first sees it, and its end when the turn ends", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    station.setupOnFirstTurn = true;
    isocan.mention(DIMITRI, percy, "@Percy the first one");
    await said(stub, "Percy · turn ended — end_turn");
    const narration = await lines(stub);
    const running = narration.findIndex((line) => /^Percy · setup running \(\d+\.\d s\)$/.test(line));
    const ok = narration.findIndex((line) => /^Percy · setup ok \(\d+\.\d s\)$/.test(line));
    expect(running, narration.join("\n")).toBeGreaterThan(-1);
    expect(ok).toBeGreaterThan(running);
    expect(narration.filter((line) => line.includes("setup running"))).toHaveLength(1);
  });

  it("step 4: the isocan home refusing connections for a while; the room says so once, keeps asking, and a mention that landed meanwhile is the next summons", async () => {
    const stub = collie();
    await standingBy(stub);
    const percy = await percyEnrolled(stub);
    isocan.down = true;
    await said(stub, "the daemon stopped answering");
    const entry = isocan.mention(DIMITRI, percy, "@Percy while you were away");
    const mention = isocan.log.at(-1)!;
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    isocan.down = false;
    await said(stub, "back after");
    const narration = await lines(stub);
    expect(narration.filter((line) => line.includes("the daemon stopped answering"))).toHaveLength(1);
    expect(narration.find((line) => line.includes("back after"))).toMatch(/back after \d+s — nothing missed/);
    await until(() => station.prompts.length === 1, "the summons after the home came back");
    expect(entry).toMatch(/^thr_/);
    expect(station.prompts[0]!.text).toBe(summonsPrompt(CANVAS.title, "Percy", { reason: "summons", entries: [isocan.served(mention)] as never }));
  });
});

describe("an agent moves in (journey 4)", () => {
  /** Percy enrolled and answered from the laptop, its sheep in isocan-percy at the station, and the collie standing by beside it. */
  async function percyOnTheLaptop(stub: DurableObjectStub<Collie>): Promise<{ percy: Actor; sheep: string }> {
    const percy = isocan.enrolElsewhere("Percy");
    const sheep = station.seedSheep("Percy", "isocan-percy");
    await standingBy(stub);
    return { percy, sheep };
  }

  it("a pass for Percy writes the row as handed over, says so, and the room takes Percy up without a restart of the object: the next summons resumes the sheep already in isocan-percy", async () => {
    const stub = collie();
    const { percy, sheep } = await percyOnTheLaptop(stub);
    // Before the pass: another badge holds Percy, so the room says so once and holds only what is its own.
    await said(stub, "Percy is not held by this machine — a pass from whoever holds Percy hands it over");
    expect((await stub.report()).rooms[0]!.agents).toEqual([]);
    const badge = [...isocan.badges.values()].find((one) => one.holds.has(DIMITRI.id))!;
    expect(badge.holds.has(percy.id)).toBe(false);

    const handed = isocan.issuePass({ actorId: percy.id });
    const answer = await stub.passes(handed.address);
    expect(answer).toEqual({ ok: true, value: { kind: "agent", agent: "Percy", room: { canvasId: CANVAS.id, title: CANVAS.title, origin: isocan.origin, address: `${isocan.origin}/p/${CANVAS.id}` } } });
    await said(stub, "now answers for Percy");
    // The room started again parks Percy's cursor under the collie's badge, and its hold names Percy.
    await until(() => isocan.parks.get(percy.id)!.parkId.startsWith("park_") && !isocan.parks.get(percy.id)!.parkId.startsWith("park_laptop_"), "Percy's cursor adopted by the collie");
    await until(() => [...isocan.badges.values()].some((one) => one.holds.has(percy.id) && !one.killed), "Percy held by the collie's badge");
    const report = await stub.report();
    expect(report.rooms).toHaveLength(1);
    expect(report.rooms[0]!.agents).toEqual([{ name: "Percy", actorId: percy.id, sheep: null, lane: null, pasture: null, came: "handed over", turnsLastHour: 0 }]);
    const stored = await runInDurableObject(stub, (_instance, state) => state.storage.sql.exec<{ row: string; came: string }>(`SELECT row, came FROM agents`).toArray());
    expect(stored.map((row) => ({ row: JSON.parse(row.row), came: row.came }))).toEqual([{ row: { canvasId: CANVAS.id, actorId: percy.id, name: "Percy", harness: "sheep", cwd: "collie:object", sessionId: null }, came: "handed over" }]);

    const mintsBefore = isocan.calls.filter((call) => call === `POST /api/projects/${CANVAS.id}/passes`).length;
    isocan.mention(DIMITRI, percy, "@Percy the footer, too");
    const mention = isocan.log.at(-1)!;
    await said(stub, "Percy · turn ended — end_turn");
    const narration = await lines(stub);
    expect(narration).toContain(`Percy · sheep ${sheep} is already in pasture isocan-percy — resuming it rather than birthing a second`);
    expect(narration.some((line) => line.startsWith(`Percy · session resumed at ${station.origin}`)), narration.join("\n")).toBe(true);
    for (const birth of ["birthing a sheep", "minting a pass for Percy", "making pasture"]) expect(narration.some((line) => line.includes(birth)), birth).toBe(false);
    // No second sheep and no second pass: the station saw no mint, the isocan home no pass minted for the sheep.
    expect(station.requests.filter((request) => request === "POST /sessions")).toEqual([]);
    expect(station.rows.size).toBe(1);
    expect(station.prompts).toEqual([{ id: sheep, text: summonsPrompt(CANVAS.title, "Percy", { reason: "summons", entries: [isocan.served(mention)] as never }) }]);
    expect(isocan.calls.filter((call) => call === `POST /api/projects/${CANVAS.id}/passes`).length).toBe(mintsBefore);
    await until(() => isocan.parks.get(percy.id)!.cursor >= mention.seq, "Percy's cursor past the mention");
    expect((await stub.report()).rooms[0]!.agents).toEqual([{ name: "Percy", actorId: percy.id, sheep, lane: "idle", pasture: "isocan-percy", came: "handed over", turnsLastHour: 1 }]);
  });

  it("a pass for an agent on a canvas the collie does not stand by on is still refused, and nothing is written", async () => {
    const stub = collie();
    const percy = isocan.enrolElsewhere("Percy");
    const answer = await stub.passes(isocan.issuePass({ actorId: percy.id }).address);
    expect(answer).toEqual({ ok: false, status: 409, error: `that pass hands over Percy, an agent on "${CANVAS.title}", which the collie does not stand by on; a pass minted as yourself for the canvas comes first` });
    const storage = JSON.parse(await wholeStorage(stub)) as Record<string, unknown[]>;
    expect({ rooms: storage.rooms, agents: storage.agents }).toEqual({ rooms: [], agents: [] });
    expect(await lines(stub)).toEqual([]);
  });

  it("step 4: a second canvas's pass makes a second room with the same badge, the report lists both, and an agent's guard is one key across rooms", async () => {
    const stub = collie();
    const { percy } = await percyOnTheLaptop(stub);
    await stub.passes(isocan.issuePass({ actorId: percy.id }).address);
    await said(stub, "now answers for Percy");
    const PRICING = { id: "cnv_pricing", title: "Pricing" };
    isocan.addCanvas(PRICING);
    const second = await stub.passes(isocan.issuePass({ canvasId: PRICING.id }).address);
    expect(second).toEqual({ ok: true, value: { kind: "room", room: { canvasId: PRICING.id, title: PRICING.title, origin: isocan.origin, address: `${isocan.origin}/p/${PRICING.id}` }, owner: "Dimitri", already: false } });
    await said(stub, `answering on "Pricing" — ${isocan.origin}/p/${PRICING.id}`);
    const report = await stub.report();
    expect(report.rooms.map((room) => room.title)).toEqual([CANVAS.title, PRICING.title]);
    const storage = JSON.parse(await wholeStorage(stub)) as Record<string, { origin?: string; key?: string; value?: string }[]>;
    expect(storage.badges!.map((badge) => badge.origin)).toEqual([isocan.origin]);
    // Both redeems and every room's calls came from the one badge the door handed over.
    expect(isocan.calls.filter((call) => call === "POST /api/door")).toHaveLength(1);

    // A turn on the first room writes the guard under the agent alone, the key every room of this collie hands to `gateTurn`.
    isocan.mention(DIMITRI, percy, "@Percy count me");
    await said(stub, "Percy · turn ended — end_turn");
    const after = JSON.parse(await wholeStorage(stub)) as Record<string, { key: string; value: string }[]>;
    const guards = after.state!.filter((row) => row.key.startsWith("rc:guard:"));
    expect(guards.map((row) => row.key)).toEqual([`rc:guard:${percy.id}`]);
    expect((JSON.parse(guards[0]!.value) as { turnTimes: number[] }).turnTimes).toHaveLength(1);
  });
});

describe("refusals (journey 5)", () => {
  it("step 3: a spent, an expired, and an unknown pass are refused in isocan's own sentences, and nothing at the collie changes", async () => {
    const stub = collie();
    const spent = isocan.issuePass();
    isocan.spend(spent.token);
    const expired = isocan.issuePass({ expired: true });
    const unknown = `${isocan.origin}/p/${CANVAS.id}#pass_nope.Snotasecret`;
    const answers = [await stub.passes(spent.address), await stub.passes(expired.address), await stub.passes(unknown)];
    expect(answers[0]).toMatchObject({ ok: false, status: 409 });
    expect((answers[0] as { error: string }).error).toMatch(/^this pass was already redeemed at .* — a pass is single-use, so the surface that used it is already enrolled\. Mint another if you need a second one$/);
    expect(answers[1]).toMatchObject({ ok: false, status: 410 });
    expect((answers[1] as { error: string }).error).toMatch(/^this pass expired at .* — passes are good for 15 minutes\. Ask the surface that minted it for another$/);
    expect(answers[2]).toEqual({ ok: false, status: 404, error: "no such pass — check the address you were given, or ask for a fresh one (a pass is single-use and short-lived, so an old command will not do)" });
    expect(await stub.report()).toMatchObject({ rooms: [] });
    expect(await stub.home({ commit: "c", builtAt: null })).toMatchObject({ rooms: 0, since: null });
    const storage = JSON.parse(await wholeStorage(stub)) as Record<string, unknown[]>;
    expect({ badges: storage.badges, rooms: storage.rooms, agents: storage.agents, state: storage.state }).toEqual({ badges: [], rooms: [], agents: [], state: [] });
    expect(isocan.holdsStarted).toBe(0);
  });

  it("step 5: a station older than the collie's floor is refused before the pass is spent, naming its build and sheep home deploy", async () => {
    const stub = collie();
    station.build = "0a1b2c3 2026-09-01T00:00:00Z";
    station.lacksRowRoute = true;
    const { address, token } = isocan.issuePass();
    const answer = await stub.passes(address);
    expect(answer).toEqual({ ok: false, status: 409, error: "not found; the station's build 0a1b2c3 (2026-09-01T00:00:00Z) is older than the collie speaks to; `sheep home deploy` from this package updates it" });
    expect(isocan.calls).toEqual([]);
    expect(isocan.passes.get(token.split(".")[0]!)!.redeemedAt).toBeUndefined();
    // A station from before the header at all is named as such.
    station.build = null;
    expect(await stub.passes(address)).toMatchObject({ ok: false, error: expect.stringContaining("the station's build (a build from before the header) is older than the collie speaks to") });
  });
});
