/**
 * Stile phase 2: `POST /join`, the second machine's way in, in workerd.
 *
 * The route is before the home's door and is the one route the home's
 * token does not guard, so what it refuses matters more than what it
 * answers. A home with `SHEEP_JOIN` set answers `{ token }`, its own, to a
 * bearer equal to it and to nothing else; a home with no `SHEEP_JOIN` —
 * which is every home but for the seconds a join takes — answers 404 to
 * every bearer, the home's own included, with the same body as a route
 * that does not exist. And the join bearer opens nothing else: `GET /home`
 * is still 401 without the home's token, with a join set or not.
 *
 * The pool's home (`SELF`) is the one with no `SHEEP_JOIN`, as the
 * bindings in `vitest.config.ts` make it; a home with one set is the same
 * Worker's `fetch` called with that env, since a secret is only ever an
 * env value to the Worker.
 */
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";

const HOME_TOKEN = "test-token";
const JOIN = "join-4f9c2a7e1b8d6053c1a9e7f2b4d8c6a0e3f5b7d9";

/** The same Worker, with `SHEEP_JOIN` in its env as a put would have set it. */
async function withJoin(join: string, path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`https://sheep.test${path}`, init) as unknown as Parameters<typeof worker.fetch>[0];
  return worker.fetch(request, { ...env, SHEEP_JOIN: join } as Env);
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("POST /join on a home with SHEEP_JOIN set", () => {
  it("answers { token }, the home's own, to the join token as the bearer", async () => {
    const response = await withJoin(JOIN, "/join", { method: "POST", headers: bearer(JOIN) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: HOME_TOKEN });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers the bare 404 to every other bearer, to none, and to the join token anywhere but the header", async () => {
    const refusals: [string, RequestInit, string?][] = [
      ["no bearer", { method: "POST" }],
      ["the home's own token", { method: "POST", headers: bearer(HOME_TOKEN) }],
      ["a prefix of the join token", { method: "POST", headers: bearer(JOIN.slice(0, -1)) }],
      ["the join token and more", { method: "POST", headers: bearer(`${JOIN}x`) }],
      ["one character changed", { method: "POST", headers: bearer(`${JOIN.slice(0, -1)}1`) }],
      ["an empty bearer", { method: "POST", headers: bearer("") }],
      ["the join token without Bearer", { method: "POST", headers: { authorization: JOIN } }],
      ["the join token as a query", { method: "POST" }, `?token=${JOIN}`],
    ];
    for (const [what, init, query] of refusals) {
      const response = await withJoin(JOIN, `/join${query ?? ""}`, init);
      expect(response.status, what).toBe(404);
      expect(await response.text(), what).toBe("not found");
    }
  });

  it("answers nothing but POST: a GET with the join token is not the token", async () => {
    const response = await withJoin(JOIN, "/join", { headers: bearer(JOIN) });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(HOME_TOKEN);
  });

  it("opens no other route: GET /home and GET /sessions are still 401 without the home's token, the join bearer included", async () => {
    for (const path of ["/home", "/sessions"]) {
      expect((await withJoin(JOIN, path)).status, `${path} with no bearer`).toBe(401);
      expect((await withJoin(JOIN, path, { headers: bearer(JOIN) })).status, `${path} with the join bearer`).toBe(401);
    }
  });

  it("treats an empty SHEEP_JOIN as none: an empty bearer is not a join", async () => {
    expect((await withJoin("", "/join", { method: "POST", headers: bearer("") })).status).toBe(404);
    expect((await withJoin("", "/join", { method: "POST", headers: { authorization: "Bearer " } })).status).toBe(404);
  });
});

describe("POST /join on a home with no SHEEP_JOIN", () => {
  it("is the bare 404 to every bearer, the home's own included, saying nothing", async () => {
    expect(env.SHEEP_JOIN).toBeUndefined();
    for (const [what, headers] of [
      ["no bearer", {}],
      ["the home's own token", bearer(HOME_TOKEN)],
      ["a join token", bearer(JOIN)],
      ["an empty bearer", { authorization: "Bearer " }],
    ] as [string, Record<string, string>][]) {
      const response = await SELF.fetch("https://sheep.test/join", { method: "POST", headers });
      expect(response.status, what).toBe(404);
      const body = await response.text();
      expect(body, what).toBe("not found");
      expect(body, what).not.toContain(HOME_TOKEN);
    }
  });

  it("leaves the door as it was: GET /home is 401 without the home's token and 200 with it", async () => {
    expect((await SELF.fetch("https://sheep.test/home")).status).toBe(401);
    expect((await SELF.fetch("https://sheep.test/home", { headers: bearer(JOIN) })).status).toBe(401);
    expect((await SELF.fetch("https://sheep.test/home", { headers: bearer(HOME_TOKEN) })).status).toBe(200);
  });
});
