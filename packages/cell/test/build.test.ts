/**
 * Station phase 0: `GET /home` carries `build`, the stamp `scripts/bundle.mjs`
 * defines into the released Worker. The test pool defines nothing, so what
 * this sees is the checkout's value; the shape is what the CLI's `sheep home`
 * reads, and the package ring sees the release's values in the same field.
 */
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CHECKOUT_BUILD, homeBuild } from "../src/index.ts";

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

  it("is behind the door like the rest of /home", async () => {
    expect((await SELF.fetch("https://sheep.test/home")).status).toBe(401);
  });
});
