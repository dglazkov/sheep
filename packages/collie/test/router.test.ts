/**
 * The collie's router in workerd (collie phase 1): every route carries
 * `x-collie-build`, every route but `GET /` refuses without the bearer in
 * text with a 401, and a refusal the object states is JSON `{ error }`.
 * Nothing here reaches past the object: the isocan home and the station
 * are fakes that answer nothing but a floor probe.
 */
import { abortAllDurableObjects, env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeIsocan, FakeStation, installFetch } from "./fakes.ts";

const worker = (exports as unknown as { default: { fetch(request: Request): Promise<Response> } }).default;
const BEARER = { authorization: `Bearer ${env.COLLIE_TOKEN}` };

let restore: (() => void) | undefined;

beforeEach(() => {
  const isocan = new FakeIsocan({ origin: "https://isocan.test", canvas: { id: "cnv_1", title: "One" }, owner: { id: "usr_1", name: "One" } });
  const station = new FakeStation({ origin: env.COLLIE_SHEEP_HOME!, token: env.COLLIE_SHEEP_TOKEN! });
  restore = installFetch(isocan, station);
});

afterEach(async () => {
  await worker.fetch(new Request("https://collie.test/", { method: "DELETE", headers: BEARER }));
  await abortAllDurableObjects();
  restore?.();
});

const ROUTES: { method: string; path: string; body?: unknown }[] = [
  { method: "GET", path: "/home" },
  { method: "POST", path: "/passes", body: { address: "https://isocan.test/p/cnv_1#pass_x.Snope" } },
  { method: "GET", path: "/report" },
  { method: "GET", path: "/log" },
  { method: "GET", path: "/log?since=0" },
  { method: "GET", path: "/log?last=5" },
  { method: "POST", path: "/off" },
  { method: "POST", path: "/on" },
  { method: "DELETE", path: "/" },
];

function request(route: { method: string; path: string; body?: unknown }, headers: Record<string, string> = {}): Request {
  return new Request(`https://collie.test${route.path}`, {
    method: route.method,
    headers: { ...headers, ...(route.body === undefined ? {} : { "content-type": "application/json" }) },
    ...(route.body === undefined ? {} : { body: JSON.stringify(route.body) }),
  });
}

describe("the router", () => {
  it("answers GET / with collie and the build header, and no bearer", async () => {
    const response = await worker.fetch(new Request("https://collie.test/"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("collie\n");
    expect(response.headers.get("x-collie-build")).toBe("0.0.0-checkout");
  });

  it("refuses every other route without the bearer, or with the wrong one, in text with a 401 and the header", async () => {
    for (const route of [...ROUTES, { method: "GET", path: "/nothing" }]) {
      for (const headers of [{}, { authorization: "Bearer not-the-token" }, { authorization: env.COLLIE_TOKEN! }] as Record<string, string>[]) {
        const response = await worker.fetch(request(route, headers));
        expect(response.status, `${route.method} ${route.path}`).toBe(401);
        expect(response.headers.get("content-type") ?? "").not.toContain("json");
        expect(await response.text()).toBe("unauthorized\n");
        expect(response.headers.get("x-collie-build")).toBe("0.0.0-checkout");
      }
    }
  });

  it("answers every route with the bearer, each with the header, each in its contract's shape", async () => {
    const answers: Record<string, { status: number; body: unknown; build: string | null }> = {};
    for (const route of ROUTES) {
      const response = await worker.fetch(request(route, BEARER));
      answers[`${route.method} ${route.path}`] = { status: response.status, body: await response.json(), build: response.headers.get("x-collie-build") };
    }
    for (const [key, answer] of Object.entries(answers)) expect(answer.build, key).toBe("0.0.0-checkout");
    expect(answers["GET /home"]).toMatchObject({ status: 200, body: { build: { commit: "0.0.0-checkout", builtAt: null }, on: true, since: null, rooms: 0 } });
    expect(answers["POST /passes"]).toMatchObject({ status: 404, body: { error: expect.stringMatching(/^no such pass/) } });
    expect(answers["GET /report"]).toEqual({ status: 200, body: { on: true, since: null, limits: { turnsPerHour: 12, chain: 3 }, rooms: [] }, build: "0.0.0-checkout" });
    expect(answers["GET /log"]).toMatchObject({ status: 200, body: { lines: [], last: 0 } });
    expect(answers["GET /log?since=0"]).toMatchObject({ status: 200, body: { lines: [], last: 0 } });
    expect(answers["POST /off"]).toMatchObject({ status: 200, body: { on: false, rooms: [] } });
    expect(answers["POST /on"]).toMatchObject({ status: 200, body: { on: true, rooms: [] } });
    expect(answers["DELETE /"]).toMatchObject({ status: 200, body: { ended: [] } });
  });

  it("refuses what it cannot read as a JSON sentence, with the header", async () => {
    for (const [route, status, error] of [
      [{ method: "POST", path: "/passes", body: {} }, 400, "a pass is posted as { address }, the address isocan printed"],
      [{ method: "POST", path: "/passes", body: { address: "https://isocan.test/p/cnv_1" } }, 400, "that is not a pass's address; isocan prints one as <home>/p/<canvas>#<pass>"],
      [{ method: "GET", path: "/log?since=x" }, 400, "since is a row's seq, a whole number"],
      [{ method: "GET", path: "/log?last=0" }, 400, "last is a count of one or more"],
      [{ method: "GET", path: "/nothing" }, 404, "the collie has no route GET /nothing"],
    ] as const) {
      const response = await worker.fetch(request(route, BEARER));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
      expect(response.headers.get("x-collie-build")).toBe("0.0.0-checkout");
    }
  });
});
