/**
 * Hill phase 0: the door, in workerd, with `fetch` in place of a browser.
 *
 * Journey 1 steps 1, 3, 4, 5, and 6 in the home's terms. A bearer mints a
 * pass, `POST /hill/passes`, and the url carries it at the request's
 * origin. `GET /hill/seat?pass=` takes it once: a 204 and the `sheep-seat`
 * cookie with its five attributes; the same pass again, and a pass minted
 * with the clock three minutes back, are each a 403 and the gate's one
 * sentence. The cookie alone reads (`GET /sessions` is the bearer's body;
 * a sheep's transcript is admitted) and does nothing else: `POST /sessions`
 * and the WebSocket upgrade to a cell are the bare 401, and the upgrade
 * reaches no cell. `DELETE /hill/seat` clears the cookie and the seat; a
 * seat past its thirty days, and a pass past its two minutes, are gone after
 * the next mint; `last_seen` is written at most hourly; a cookie of
 * the right shape with no row is 401; no bearer and no cookie is what it
 * was. The Directory's clock seam (`now`) moves time over RPC; there is no
 * test route.
 */
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { type Directory, PASS_EXPIRED, PASS_USED, SEAT_MS, type SessionSummary, sha256Hex } from "../src/directory.ts";

const TOKEN = "test-token";
const ORIGIN = "https://sheep.test";
const bearer = { authorization: `Bearer ${TOKEN}` };
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const directory = () => env.DIRECTORY.getByName("home");

function at(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, init);
}

/** A pass minted as `sheep hill` mints one: under the bearer, the url and when it expires. */
async function mint(): Promise<{ url: string; expires: number; pass: string }> {
  const before = Date.now();
  const response = await at("/hill/passes", { method: "POST", headers: bearer });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { url: string; expires: number };
  expect(Object.keys(body).sort()).toEqual(["expires", "url"]);
  expect(body.expires).toBeGreaterThanOrEqual(before + 2 * 60 * 1000);
  expect(body.expires).toBeLessThanOrEqual(Date.now() + 2 * 60 * 1000);
  const url = new URL(body.url);
  return { ...body, pass: url.searchParams.get("pass")! };
}

/** The seat a pass buys: the cookie's value from the 204's `Set-Cookie`. */
async function seat(pass: string): Promise<string> {
  const response = await at(`/hill/seat?pass=${pass}`);
  expect(response.status, await response.clone().text()).toBe(204);
  const cookie = response.headers.get("set-cookie") ?? "";
  return /^sheep-seat=([0-9a-f]{64});/.exec(cookie)![1]!;
}

const withSeat = (value: string, init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie: `sheep-seat=${value}` } });

async function mintSheep(name: string): Promise<string> {
  const response = await at("/sessions", { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: JSON.stringify({ name }) });
  expect(response.status).toBe(201);
  return ((await response.json()) as SessionSummary).id;
}

/** Every table in the cell's own SQLite that is not the platform's: none for a cell nothing has reached. */
function cellTables(id: string): Promise<string[]> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (_cell, state) =>
    state.storage.sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master")
      .toArray()
      .map((row) => row.name)
      .filter((name) => !name.startsWith("_cf_")),
  );
}

describe("hill phase 0: a pass", () => {
  it("step 1: a bearer mints a pass, and the url carries it at the request's origin; the Directory keeps its sha256 and never the pass", async () => {
    const { url, pass } = await mint();
    expect(url).toBe(`${ORIGIN}/hill/?pass=${pass}`);
    expect(pass).toMatch(/^[0-9a-f]{64}$/);
    const rows = await runInDurableObject(directory(), (_directory: Directory, state) => state.storage.sql.exec<{ hash: string }>("SELECT hash FROM passes").toArray().map((row) => row.hash));
    expect(rows).toContain(await sha256Hex(pass));
    expect(rows).not.toContain(pass);
    // Another origin, another url: the station's address is the hill's.
    const local = await SELF.fetch("http://127.0.0.1:8787/hill/passes", { method: "POST", headers: bearer });
    expect(((await local.json()) as { url: string }).url).toMatch(/^http:\/\/127\.0\.0\.1:8787\/hill\/\?pass=[0-9a-f]{64}$/);
  });

  it("is minted under the bearer alone: no bearer, a wrong bearer, and a seat alone are each the bare 401", async () => {
    const standing = await seat((await mint()).pass);
    for (const [what, init] of [
      ["no bearer", { method: "POST" }],
      ["a wrong bearer", { method: "POST", headers: { authorization: "Bearer nope" } }],
      ["a seat alone", withSeat(standing, { method: "POST" })],
    ] as [string, RequestInit][]) {
      const response = await at("/hill/passes", init);
      expect(response.status, what).toBe(401);
      expect(await response.text(), what).toBe("bad or missing token");
    }
  });

  it("step 3: GET /hill/seat takes it once: a 204 and a cookie with the five attributes; the same pass again is 403 used", async () => {
    const { pass } = await mint();
    const first = await at(`/hill/seat?pass=${pass}`);
    expect(first.status).toBe(204);
    const cookie = first.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^sheep-seat=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=2592000$/);
    expect(Number(/Max-Age=(\d+)/.exec(cookie)![1]) * 1000).toBe(SEAT_MS);
    // The seat is a row by its sha256, never the value.
    const value = /^sheep-seat=([0-9a-f]{64});/.exec(cookie)![1]!;
    const seats = await runInDurableObject(directory(), (_directory: Directory, state) => state.storage.sql.exec<{ hash: string }>("SELECT hash FROM seats").toArray().map((row) => row.hash));
    expect(seats).toContain(await sha256Hex(value));
    expect(seats).not.toContain(value);

    const again = await at(`/hill/seat?pass=${pass}`);
    expect(again.status).toBe(403);
    expect(await again.text()).toBe(PASS_USED);
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  it("a pass minted with the clock three minutes back is 403 expired, and taking it spends it", async () => {
    const { pass } = await directory().mintPass(Date.now() - 3 * 60 * 1000);
    const response = await at(`/hill/seat?pass=${pass}`);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe(PASS_EXPIRED);
    expect(response.headers.get("set-cookie")).toBeNull();
    const again = await at(`/hill/seat?pass=${pass}`);
    expect(await again.text()).toBe(PASS_USED);
  });

  it("a pass never minted, an empty pass, and no pass are each 403 used", async () => {
    for (const path of [`/hill/seat?pass=${"a".repeat(64)}`, "/hill/seat?pass=", "/hill/seat"]) {
      const response = await at(path);
      expect(response.status, path).toBe(403);
      expect(await response.text(), path).toBe(PASS_USED);
    }
  });
});

describe("hill phase 0: a seat reads, and does nothing else", () => {
  it("step 4: GET /sessions with the cookie alone is 200 and the same body the bearer gets; a sheep's transcript is admitted", async () => {
    const id = await mintSheep("grazing");
    const standing = await seat((await mint()).pass);
    const byBearer = await at("/sessions", { headers: bearer });
    const bySeat = await at("/sessions", withSeat(standing));
    expect(bySeat.status).toBe(200);
    expect(await bySeat.text()).toBe(await byBearer.text());
    // A HEAD is a read and passes the door; the router has no HEAD for the route, so it is the router's 404 and not the door's 401.
    const head = await at("/sessions", withSeat(standing, { method: "HEAD" }));
    expect(head.status).toBe(404);
    const transcript = await at(`/s/${id}/transcript`, withSeat(standing));
    expect(transcript.status).toBe(200);
    expect(await transcript.json()).toMatchObject({ entries: [] });
  });

  it("journey 1's third criterion: POST /sessions with the cookie alone is the bare 401, and mints nothing", async () => {
    const standing = await seat((await mint()).pass);
    const before = ((await (await at("/sessions", { headers: bearer })).json()) as SessionSummary[]).length;
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await at("/sessions", withSeat(standing, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "by-seat" }) }));
      expect(response.status, method).toBe(401);
      expect(await response.text(), method).toBe("bad or missing token");
    }
    expect(((await (await at("/sessions", { headers: bearer })).json()) as SessionSummary[]).length).toBe(before);
  });

  it("a WebSocket upgrade to /s/<id>/ws with the cookie alone is the bare 401 and reaches no cell", async () => {
    const id = await mintSheep("unreached");
    const standing = await seat((await mint()).pass);
    for (const upgrade of ["websocket", "h2c"]) {
      const response = await at(`/s/${id}/ws`, withSeat(standing, { headers: { upgrade } }));
      expect(response.status, upgrade).toBe(401);
      expect(response.webSocket, upgrade).toBeNull();
      expect(await response.text(), upgrade).toBe("bad or missing token");
    }
    expect(await cellTables(id)).toEqual([]);
  });

  it("step 5: DELETE /hill/seat clears the cookie and the seat, and the next GET /sessions with it is 401", async () => {
    const standing = await seat((await mint()).pass);
    expect((await at("/sessions", withSeat(standing))).status).toBe(200);
    const out = await at("/hill/seat", withSeat(standing, { method: "DELETE" }));
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toBe("sheep-seat=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
    const after = await at("/sessions", withSeat(standing));
    expect(after.status).toBe(401);
    expect(await after.text()).toBe("bad or missing token");
    // Again, and with no cookie at all: still the 204 and the cleared cookie.
    expect((await at("/hill/seat", withSeat(standing, { method: "DELETE" }))).status).toBe(204);
    expect((await at("/hill/seat", { method: "DELETE" })).status).toBe(204);
  });

  it("a seat not seen in thirty-one days is gone after a mint; so is one seated thirty days ago that was seen yesterday", async () => {
    const seatRow = (hash: string) => runInDurableObject(directory(), (_directory: Directory, state) => state.storage.sql.exec("SELECT 1 FROM seats WHERE hash = ?", hash).toArray().length);
    const then = Date.now() - 31 * DAY_MS;
    const taken = await directory().takePass((await directory().mintPass(then)).pass, then);
    expect(taken.taken).toBe("ok");
    const old = (taken as { seat: string }).seat;
    const hash = await sha256Hex(old);
    expect(await seatRow(hash)).toBe(1);
    expect((await at("/sessions", withSeat(old))).status).toBe(401);
    await mint();
    expect(await seatRow(hash)).toBe(0);

    // Seen yesterday, seated a little over thirty days ago: its thirty days are up, it no longer stands, and the mint sweeps it,
    // since the sweep keys on the seating and a lapsed seat still being presented would otherwise never go.
    const seatedAt = Date.now() - SEAT_MS - 60_000;
    const month = (await directory().takePass((await directory().mintPass(seatedAt)).pass, seatedAt)) as { seat: string };
    const monthHash = await sha256Hex(month.seat);
    expect(await directory().seated(month.seat, seatedAt + 29 * DAY_MS)).toBe(true);
    expect(await directory().seated(month.seat)).toBe(false);
    expect(await seatRow(monthHash)).toBe(1);
    await mint();
    expect(await seatRow(monthHash)).toBe(0);
  });

  it("a mint sweeps the passes past their two minutes: one minted three minutes back and never taken is gone after the next", async () => {
    const passRow = (hash: string) => runInDurableObject(directory(), (_directory: Directory, state) => state.storage.sql.exec("SELECT 1 FROM passes WHERE hash = ?", hash).toArray().length);
    const { pass } = await directory().mintPass(Date.now() - 3 * 60 * 1000);
    const hash = await sha256Hex(pass);
    expect(await passRow(hash)).toBe(1);
    const fresh = await mint();
    expect(await passRow(hash)).toBe(0);
    expect(await passRow(await sha256Hex(fresh.pass))).toBe(1);
  });

  it("a read writes little: seated() a minute later leaves last_seen alone; two hours later it moves", async () => {
    const lastSeen = (hash: string) => runInDurableObject(directory(), (_directory: Directory, state) => state.storage.sql.exec<{ last_seen: number }>("SELECT last_seen FROM seats WHERE hash = ?", hash).toArray()[0]?.last_seen);
    const start = Date.now() - 3 * HOUR_MS;
    const taken = (await directory().takePass((await directory().mintPass(start)).pass, start)) as { seat: string };
    const hash = await sha256Hex(taken.seat);
    expect(await lastSeen(hash)).toBe(start);
    expect(await directory().seated(taken.seat, start + 60_000)).toBe(true);
    expect(await lastSeen(hash)).toBe(start);
    expect(await directory().seated(taken.seat, start + 2 * 60_000)).toBe(true);
    expect(await lastSeen(hash)).toBe(start);
    expect(await directory().seated(taken.seat, start + 2 * HOUR_MS)).toBe(true);
    expect(await lastSeen(hash)).toBe(start + 2 * HOUR_MS);
  });

  it("step 6: a cookie of the right shape with no row is 401, as is one of the wrong shape; no bearer and no cookie is what it was", async () => {
    for (const [what, init] of [
      ["a seat never taken", withSeat("b".repeat(64))],
      ["a seat of the wrong shape", withSeat("not-a-seat")],
      ["no bearer and no cookie", {}],
    ] as [string, RequestInit][]) {
      const response = await at("/sessions", init);
      expect(response.status, what).toBe(401);
      expect(await response.text(), what).toBe("bad or missing token");
    }
    expect((await at("/home")).status).toBe(401);
  });

  it("a bearer or ?token= decides alone: a wrong one with a good cookie is still 401", async () => {
    const standing = await seat((await mint()).pass);
    expect((await at("/sessions", withSeat(standing, { headers: { authorization: "Bearer nope" } }))).status).toBe(401);
    expect((await at("/sessions?token=nope", withSeat(standing))).status).toBe(401);
    expect((await at("/sessions", withSeat(standing))).status).toBe(200);
  });

  it("GET /hill/ is the page since hill phase 1, the same with a bearer, a seat, or neither (hill-page.test.ts has the rest)", async () => {
    const standing = await seat((await mint()).pass);
    const page = await (await at("/hill/")).text();
    for (const init of [{ headers: bearer }, withSeat(standing), {}]) {
      const response = await at("/hill/", init);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(page);
    }
  });
});
