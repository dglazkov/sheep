/**
 * Station phase 0: `GET /home` carries `build`, the stamp `scripts/bundle.mjs`
 * defines into the released Worker. The test pool defines nothing, so what
 * this sees is the checkout's value; the shape is what the CLI's `sheep home`
 * reads, and the package ring sees the release's values in the same field.
 * Station phase 2: `image` beside it, `null` here where nothing was
 * defined; the account ring reads the release's reference from it.
 * Shear phase 0: `x-sheep-build` on every response the Worker returns —
 * its own answers, the Directory's, a cell's through its stub, refusals,
 * a 404, and a WebSocket's 101 — the commit alone here, where the stamp
 * has no time.
 */
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildHeader, CHECKOUT_BUILD, homeBuild, homeImage } from "../src/index.ts";

const headers = { authorization: "Bearer test-token" };

describe("GET /home's build stamp", () => {
  it("is { commit: string, builtAt: string | null }, the checkout's value where nothing was defined", async () => {
    const response = await SELF.fetch("https://sheep.test/home", { headers });
    expect(response.status).toBe(200);
    const home = (await response.json()) as { build?: { commit?: unknown; builtAt?: unknown } };
    expect(typeof home.build?.commit).toBe("string");
    expect(home.build?.builtAt === null || typeof home.build?.builtAt === "string").toBe(true);
    expect(home.build).toEqual({ commit: "0.0.0-checkout", builtAt: null });
    expect(homeBuild()).toEqual(CHECKOUT_BUILD);
  });

  it("carries image: string | null beside it, null where no image was defined (station phase 2)", async () => {
    const response = await SELF.fetch("https://sheep.test/home", { headers });
    expect(response.status).toBe(200);
    const home = (await response.json()) as { image?: unknown };
    expect("image" in home).toBe(true);
    expect(home.image === null || typeof home.image === "string").toBe(true);
    expect(home.image).toBeNull();
    expect(homeImage()).toBeNull();
  });

  it("is behind the door like the rest of /home", async () => {
    expect((await SELF.fetch("https://sheep.test/home")).status).toBe(401);
  });
});

describe("the build header (shear phase 0)", () => {
  it("is the commit and the time separated by a space, the commit alone with no time", () => {
    expect(buildHeader({ commit: "5511bf9", builtAt: "2026-09-13T18:26:23Z" })).toBe("5511bf9 2026-09-13T18:26:23Z");
    expect(buildHeader(CHECKOUT_BUILD)).toBe("0.0.0-checkout");
    expect(buildHeader()).toBe("0.0.0-checkout");
  });

  it("is on every response: GET /, the door's refusal, a 404, the Directory's, a cell's through its stub, a pasture's, the join, and a WebSocket's 101", async () => {
    const json = { ...headers, "content-type": "application/json" };
    const asked: [string, Response][] = [];
    const ask = async (label: string, path: string, init?: RequestInit) => {
      const response = await SELF.fetch(`https://sheep.test${path}`, init);
      asked.push([`${label} (${response.status})`, response]);
      return response;
    };
    await ask("GET /", "/");
    await ask("no token", "/sessions");
    await ask("a route that does not exist", "/nowhere", { headers });
    await ask("GET /home", "/home", { headers });
    const minted = (await (await ask("POST /sessions", "/sessions", { method: "POST", headers: json, body: JSON.stringify({ name: "stamped" }) })).json()) as { id: string };
    await ask("GET /sessions", "/sessions", { headers });
    await ask("GET /sessions/<id>", `/sessions/${minted.id}`, { headers });
    await ask("GET /s/<id>/, the cell's", `/s/${minted.id}/`, { headers });
    await ask("GET /s/<id>/transcript, the cell's", `/s/${minted.id}/transcript`, { headers });
    await ask("an unknown session", "/s/not-a-sheep/", { headers });
    await ask("POST /pastures", "/pastures", { method: "POST", headers: json, body: JSON.stringify({ name: "stamped" }) });
    await ask("GET /p/<name>/", "/p/stamped/", { headers });
    await ask("POST /join, refused", "/join", { method: "POST" });
    const upgraded = await ask("the WebSocket upgrade", `/s/${minted.id}/ws?token=test-token`, { headers: { upgrade: "websocket" } });
    await ask("DELETE /s/<id>, the cell's end", `/s/${minted.id}`, { method: "DELETE", headers });

    expect(asked.map(([label]) => label)).toEqual([
      "GET / (200)",
      "no token (401)",
      "a route that does not exist (404)",
      "GET /home (200)",
      "POST /sessions (201)",
      "GET /sessions (200)",
      "GET /sessions/<id> (200)",
      "GET /s/<id>/, the cell's (200)",
      "GET /s/<id>/transcript, the cell's (200)",
      "an unknown session (404)",
      "POST /pastures (201)",
      "GET /p/<name>/ (200)",
      "POST /join, refused (404)",
      "the WebSocket upgrade (101)",
      "DELETE /s/<id>, the cell's end (200)",
    ]);
    for (const [label, response] of asked) expect(response.headers.get("x-sheep-build"), label).toBe("0.0.0-checkout");
    expect(upgraded.webSocket).toBeTruthy();
    upgraded.webSocket!.accept();
    upgraded.webSocket!.close(1000, "done");
    for (const [, response] of asked) if (!response.bodyUsed && response.body !== null) await response.body.cancel();
  });
});
