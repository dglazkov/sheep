import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import puppeteer from "@cloudflare/puppeteer";
import { look } from "../src/look.ts";

describe("eyes in workerd", () => {
  it("renders the workspace and sees the bug", async () => {
    const browser = await puppeteer.launch((env as any).BROWSER);
    try {
      const seen = await look(browser, "/index.html", { click: "#inc" });
      expect(seen.png.byteLength).toBeGreaterThan(1000);
      expect(seen.errors.join("\n")).toContain("undefinedFunction");
      expect(JSON.stringify(seen.tree)).toContain("Counter");
      console.log(seen.timings, seen.console, seen.errors);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
