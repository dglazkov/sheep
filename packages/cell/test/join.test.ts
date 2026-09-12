/**
 * Stile phase 2: `POST /join`, the second machine's way in, in workerd.
 *
 * The route is before the home's door and is the one route the home's
 * token does not guard, so what it refuses matters more than what it
 * answers. The station's `JOIN` namespace (bound in `wrangler.jsonc`, a
 * local KV here) holds `join:<sha256 of a join token>` for the seconds a
 * join takes, written by the joining machine through the account API. A
 * bearer whose key is there is answered `{ token }`, the home's own, once:
 * the key is deleted, and a second ask is 404. A bearer whose key is not
 * there, no bearer, and a home with no binding are the same bare 404 as a
 * route that does not exist. And the join bearer opens nothing else:
 * `GET /home` is still 401 without the home's token.
 */
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker, { joinKey } from "../src/index.ts";

const HOME_TOKEN = "test-token";
const JOIN = "4f9c2a7e1b8d6053c1a9e7f2b4d8c6a0e3f5b7d9a1c3e5f7";

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const ask = (headers: Record<string, string>, path = "/join") => SELF.fetch(`https://sheep.test${path}`, { method: "POST", headers });

/** What the joining machine writes through the account API: the hashed key, value "1". */
async function write(token: string): Promise<string> {
  const key = await joinKey(token);
  await env.JOIN!.put(key, "1", { expirationTtl: 120 });
  return key;
}

beforeEach(async () => {
  for (const { name } of (await env.JOIN!.list()).keys) await env.JOIN!.delete(name);
});

describe("POST /join with a join key written", () => {
  it("keys the store by the token's SHA-256, never the token", async () => {
    expect(await joinKey("abc")).toBe("join:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    await write(JOIN);
    const keys = (await env.JOIN!.list()).keys.map((key) => key.name);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(JOIN);
  });

  it("answers { token }, the home's own, to the token as the bearer, deletes the key, and answers a second ask 404", async () => {
    const key = await write(JOIN);
    const first = await ask(bearer(JOIN));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ token: HOME_TOKEN });
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await env.JOIN!.get(key)).toBeNull();
    const second = await ask(bearer(JOIN));
    expect(second.status).toBe(404);
    expect(await second.text()).toBe("not found");
  });

  it("answers the bare 404 to every other bearer, to none, and to the token anywhere but the header, and leaves the key", async () => {
    const key = await write(JOIN);
    const refusals: [string, Record<string, string>, string?][] = [
      ["no bearer", {}],
      ["the home's own token", bearer(HOME_TOKEN)],
      ["a prefix of the join token", bearer(JOIN.slice(0, -1))],
      ["the join token and more", bearer(`${JOIN}x`)],
      ["the key itself", bearer(key)],
      ["the key's hash alone", bearer(key.slice("join:".length))],
      ["an empty bearer", { authorization: "Bearer " }],
      ["the join token without Bearer", { authorization: JOIN }],
      ["the join token as a query", {}, `/join?token=${JOIN}`],
    ];
    for (const [what, headers, path] of refusals) {
      const response = await ask(headers, path);
      expect(response.status, what).toBe(404);
      expect(await response.text(), what).toBe("not found");
    }
    expect(await env.JOIN!.get(key)).toBe("1");
  });

  it("answers nothing but POST: a GET with the join token is the door's 401, and the key stays", async () => {
    const key = await write(JOIN);
    const response = await SELF.fetch("https://sheep.test/join", { headers: bearer(JOIN) });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(HOME_TOKEN);
    expect(await env.JOIN!.get(key)).toBe("1");
  });

  it("opens no other route: GET /home and GET /sessions are still 401 without the home's token, the join bearer included", async () => {
    await write(JOIN);
    for (const path of ["/home", "/sessions"]) {
      expect((await SELF.fetch(`https://sheep.test${path}`)).status, `${path} with no bearer`).toBe(401);
      expect((await SELF.fetch(`https://sheep.test${path}`, { headers: bearer(JOIN) })).status, `${path} with the join bearer`).toBe(401);
    }
    expect((await SELF.fetch("https://sheep.test/home", { headers: bearer(HOME_TOKEN) })).status).toBe(200);
  });
});

describe("POST /join with no join key", () => {
  it("is the bare 404 to every bearer, the home's own included, saying nothing", async () => {
    for (const [what, headers] of [
      ["no bearer", {}],
      ["the home's own token", bearer(HOME_TOKEN)],
      ["a join token never written", bearer(JOIN)],
      ["an empty bearer", { authorization: "Bearer " }],
    ] as [string, Record<string, string>][]) {
      const response = await ask(headers);
      expect(response.status, what).toBe(404);
      const body = await response.text();
      expect(body, what).toBe("not found");
      expect(body, what).not.toContain(HOME_TOKEN);
    }
  });

  it("is the bare 404 on a home with no JOIN binding, a station deployed before the store, even with the key written", async () => {
    await write(JOIN);
    const { JOIN: _store, ...unbound } = env;
    const request = new Request("https://sheep.test/join", { method: "POST", headers: bearer(JOIN) }) as unknown as Parameters<typeof worker.fetch>[0];
    const response = await worker.fetch(request, unbound as Env);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("not found");
  });
});
