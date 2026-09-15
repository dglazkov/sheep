/**
 * Hill phase 1: the page, served by the Worker before the door, in workerd
 * through the pool's own `assets` binding over `packages/hill/dist` (the
 * package's `test` script builds it first).
 *
 * `/hill/`, a deep path, and a reload of either answer `index.html` with the
 * page's headers to a browser with no seat and no bearer, not the 401; a
 * built file is that file; `/hill` is a 302 to `/hill/`. `GET /` is a 302 to
 * `/hill/` for an `Accept` naming `text/html` and `sheep\n` for anything
 * else. The seat and the passes stay routes: a `HEAD` or `POST` there is not
 * the page. A write to a page path is the door's 401. And a binding with no
 * `index.html`, or no binding, answers the gate that says `pnpm build`.
 */
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { NO_BUILD } from "../src/hill-words.ts";
import { hillAnswer } from "../src/index.ts";

const ORIGIN = "https://sheep.test";

function at(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", ...init });
}

/** The headers `index.html` carries: the address held a pass a moment ago, so no referrer and no cache, and a policy of its own origin. */
function expectPageHeaders(response: Response): void {
  expect(response.headers.get("content-type")).toMatch(/^text\/html/);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toBe("default-src 'self'; frame-ancestors 'none'");
  expect(response.headers.get("x-sheep-build")).toBe("0.0.0-checkout");
  expect(response.headers.get("set-cookie")).toBeNull();
}

describe("hill phase 1: the page before the door", () => {
  it("serves index.html at /hill/ to a browser with no seat and no bearer, with the page's headers", async () => {
    const response = await at("/hill/");
    expect(response.status).toBe(200);
    expectPageHeaders(response);
    const html = await response.text();
    expect(html).toContain('<script type="module" src="/hill/hill.js"></script>');
    expect(html).toContain("<hill-app>");
  });

  it("answers index.html for every path under /hill/ that is not a file, a pass in the address included, so a pasted or reloaded address opens the page", async () => {
    const page = await (await at("/hill/")).text();
    for (const path of ["/hill/anything", "/hill/s/8c1f2a4e-3b9d-4f0a-9c2e-1d7b5e6a2f31", "/hill/?pass=9f3c", "/hill/nothing.js", "/hill//elsewhere.test/x"]) {
      const response = await at(path);
      expect(response.status, path).toBe(200);
      expectPageHeaders(response);
      expect(await response.text(), path).toBe(page);
    }
  });

  it("serves a built file as that file, nosniff, revalidated rather than stored", async () => {
    for (const [path, type] of [
      ["/hill/hill.js", /javascript/],
      ["/hill/hill.css", /^text\/css/],
      ["/hill/mark.svg", /^image\/svg\+xml/],
    ] as const) {
      const response = await at(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toMatch(type);
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("cache-control"), path).toBe("no-cache");
      expect(response.headers.get("content-security-policy"), path).toBeNull();
      expect((await response.text()).length, path).toBeGreaterThan(100);
    }
    const script = await at("/hill/hill.js");
    const tag = script.headers.get("etag");
    await script.body?.cancel();
    if (tag !== null) expect((await at("/hill/hill.js", { headers: { "if-none-match": tag } })).status).toBe(304);
  });

  it("answers a HEAD as its GET with no body", async () => {
    const response = await at("/hill/s/abc", { method: "HEAD" });
    expect(response.status).toBe(200);
    expectPageHeaders(response);
    expect(await response.text()).toBe("");
  });

  it("sends /hill to /hill/, its query kept", async () => {
    const bare = await at("/hill");
    expect(bare.status).toBe(302);
    expect(bare.headers.get("location")).toBe("/hill/");
    const withPass = await at("/hill?pass=9f3c");
    expect(withPass.status).toBe(302);
    expect(withPass.headers.get("location")).toBe("/hill/?pass=9f3c");
  });

  it("sends a browser at / to /hill/, and answers sheep to anything else, as every command has heard", async () => {
    const browser = await at("/", { headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } });
    expect(browser.status).toBe(302);
    expect(browser.headers.get("location")).toBe("/hill/");
    for (const accept of [undefined, "*/*", "application/json"]) {
      const response = await at("/", accept === undefined ? {} : { headers: { accept } });
      expect(response.status, String(accept)).toBe(200);
      expect(await response.text(), String(accept)).toBe("sheep\n");
    }
  });

  it("leaves the seat and the passes routes, and a write to a page path the door's bare 401", async () => {
    const passes = await at("/hill/passes");
    expect(passes.status).toBe(401);
    expect(await passes.text()).toBe("bad or missing token");
    const headSeat = await at("/hill/seat", { method: "HEAD" });
    expect(headSeat.headers.get("content-security-policy")).toBeNull();
    await headSeat.body?.cancel();
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await at("/hill/", { method });
      expect(response.status, method).toBe(401);
      expect(await response.text(), method).toBe("bad or missing token");
    }
  });
});

describe("hill phase 1: a checkout with no build", () => {
  const request = (path: string, method = "GET") => new Request(`${ORIGIN}${path}`, { method });
  /** An assets binding over an empty directory: every path is its 404. */
  const empty = { fetch: async () => new Response("not found", { status: 404 }) } as unknown as Fetcher;

  it("answers the gate that says pnpm build, not a 404, at every page path; and with no binding at all the same", async () => {
    for (const hill of [empty, undefined]) {
      for (const path of ["/hill/", "/hill/s/abc", "/hill/hill.js"]) {
        const response = await hillAnswer(request(path), { ...env, HILL: hill });
        expect(response.status, path).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
        const body = await response.text();
        expect(body).toContain("<code>pnpm build</code>");
        expect(body.replace(/<\/?code>/g, "")).toContain(NO_BUILD);
        expect(body).not.toContain("<script");
      }
    }
  });
});
