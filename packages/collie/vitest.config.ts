import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { ringConfig } from "../../scripts/rings.mjs";

/**
 * The collie's suite runs in workerd (collie phase 1): the object, the room it hosts, and the station's routes it speaks,
 * with the global `fetch` replaced per case by the fakes in `test/fakes.ts`. The alarm is armed a long way ahead, so a
 * case runs it by hand (`runDurableObjectAlarm`) and never races one.
 */
export default defineConfig({
  // `SHEEP_RING` narrows this to one ring's files; unset, everything here runs.
  test: { testTimeout: 30_000, ...ringConfig("packages/collie") },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          COLLIE_TOKEN: "collie-test-token",
          COLLIE_SHEEP_HOME: "https://station.test",
          COLLIE_SHEEP_TOKEN: "station-test-token",
          COLLIE_LAP_MS: "3600000",
        },
      },
    }),
  ],
});
