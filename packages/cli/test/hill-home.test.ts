/**
 * Hill phase 1, journey 4 steps 1 and 2 in the home ring: a real `wrangler
 * dev` home over the checkout's config, whose `HILL` binding serves the
 * page `scripts/test.mjs` built. `/hill/` and `/hill/anything` answer
 * `index.html` with the page's headers to a request with no seat and no
 * bearer; `/` is a 302 to `/hill/` for an `Accept` naming `text/html` and
 * `sheep\n` for `*\/*`, as every command has heard it; and `sheep hill`,
 * the built command, prints a link whose pass `fetch` takes for a 204 and a
 * cookie, and the cookie alone reads the home and writes nothing. The
 * browser's half is the conductor's walk.
 */
import { afterAll, describe, expect, it } from "vitest";
import { runSheep, startHome, stopHome } from "./local-home.js";

const TOKEN = "hill-home-token";

const home = await startHome(TOKEN);
// Written to stderr directly: the runner swallows console output while it collects tests.
if (typeof home === "string") process.stderr.write(`hill home skipped: ${home}\n`);

function url(): string {
  if (typeof home === "string") throw new Error(home);
  return home.url;
}

describe.skipIf(typeof home === "string")("hill phase 1: the page from a real wrangler dev", () => {
  afterAll(async () => {
    if (typeof home !== "string") await stopHome(home);
  });

  it("serves index.html at /hill/ and at any path under it, before the door, with the page's headers", { timeout: 60_000 }, async () => {
    const pages: string[] = [];
    for (const path of ["/hill/", "/hill/anything", "/hill/s/8c1f2a4e-3b9d-4f0a-9c2e-1d7b5e6a2f31"]) {
      const response = await fetch(`${url()}${path}`, { redirect: "manual" });
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toMatch(/^text\/html/);
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(response.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("content-security-policy"), path).toBe("default-src 'self'; frame-ancestors 'none'");
      const html = await response.text();
      expect(html, path).toContain('<script type="module" src="/hill/hill.js"></script>');
      pages.push(html);
    }
    expect(new Set(pages).size).toBe(1);
    // The files the page names are there, and none of its bytes carries a bearer or the word token.
    for (const file of ["/hill/hill.js", "/hill/hill.css", "/hill/mark.svg"]) {
      const response = await fetch(`${url()}${file}`);
      expect(response.status, file).toBe(200);
      expect(await response.text(), file).not.toMatch(/Bearer|token/);
    }
  });

  it("sends a browser at / to /hill/, and answers sheep to anything else", async () => {
    const browser = await fetch(`${url()}/`, { redirect: "manual", headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" } });
    expect(browser.status).toBe(302);
    expect(browser.headers.get("location")).toBe("/hill/");
    await browser.body?.cancel();
    const command = await fetch(`${url()}/`, { redirect: "manual", headers: { accept: "*/*" } });
    expect(command.status).toBe(200);
    expect(await command.text()).toBe("sheep\n");
  });

  it("sheep hill prints a link at this home that fetch takes for a seat, and the seat reads and does not write", { timeout: 60_000 }, async () => {
    if (typeof home === "string") throw new Error(home);
    const printed = await runSheep(home, ["hill"]);
    expect(printed.code, printed.stderr).toBe(0);
    expect(printed.stderr).toBe("");
    const link = /^(http:\/\/127\.0\.0\.1:\d+\/hill\/\?pass=([0-9a-f]{64}))\n$/.exec(printed.stdout);
    expect(link, printed.stdout).not.toBeNull();
    expect(link![1]!.startsWith(`${home.url}/hill/?pass=`)).toBe(true);

    // The link opens the page, as a browser's first request would, and the page's script takes the pass.
    const page = await fetch(link![1]!, { redirect: "manual" });
    expect(page.status).toBe(200);
    await page.body?.cancel();
    const taken = await fetch(`${home.url}/hill/seat?pass=${link![2]}`);
    expect(taken.status).toBe(204);
    const cookie = taken.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^sheep-seat=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=2592000$/);
    const seat = cookie.split(";")[0]!;

    // The cookie alone reads; a write with it is the bare 401; the same pass again is the gate's sentence.
    const read = await fetch(`${home.url}/home`, { headers: { cookie: seat } });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ build: { commit: "0.0.0-checkout" } });
    const write = await fetch(`${home.url}/sessions`, { method: "POST", headers: { cookie: seat, "content-type": "application/json" }, body: "{}" });
    expect(write.status).toBe(401);
    expect(await write.text()).toBe("bad or missing token");
    const again = await fetch(`${home.url}/hill/seat?pass=${link![2]}`);
    expect(again.status).toBe(403);
    expect(await again.text()).toBe("that pass was already used; run sheep hill for another");
  });
});
