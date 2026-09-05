import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SessionCell } from "../src/index.ts";

describe("SessionCell scaffold", () => {
  it("reads a row from its own SQLite", async () => {
    const stub = env.SESSION_CELL.getByName("scaffold");
    const result = await runInDurableObject(stub, (instance: SessionCell, state) => {
      expect(instance).toBeInstanceOf(SessionCell);
      const row = state.storage.sql.exec<{ two: number }>("SELECT 2 AS two").one();
      return { ...instance.ping(), two: row.two };
    });
    expect(result).toEqual({ one: 1, two: 2, name: "scaffold" });
  });

  it("routes /s/<id> to that cell", async () => {
    const response = await SELF.fetch("https://lamb.test/s/route-me");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ one: 1, name: "route-me" });
  });
});
