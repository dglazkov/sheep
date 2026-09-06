import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // The top-level config is lamb: no container binding. The `PEN_*` values apply only to a
        // cell with a test-provided starter (`test/lease.test.ts`); without one they change nothing.
        // The timeouts are short so the deadlines can be seen to fire; the budget is two minutes.
        bindings: {
          LAMB_TOKEN: "test-token",
          LAMB_PROVIDER: "faux",
          PEN_CELL_ORIGIN: "https://lamb.test",
          PEN_START_TIMEOUT: "2",
          PEN_KILL_TIMEOUT: "1",
          PEN_BUDGET_MINUTES: "2",
        },
      },
    }),
  ],
});
