import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // The top-level config is lamb: no container binding. The `PEN_*` values apply only to a
        // cell with a test-provided starter (`test/lease.test.ts`); without one they change nothing.
        // The timeouts are short so the deadlines can be seen to fire; the budget is two minutes. The git token
        // is the broker test's fixture, a string that looks like nothing else, so a grep for it is exact.
        bindings: {
          LAMB_TOKEN: "test-token",
          LAMB_PROVIDER: "faux",
          PEN_CELL_ORIGIN: "https://lamb.test",
          PEN_START_TIMEOUT: "2",
          PEN_KILL_TIMEOUT: "1",
          PEN_BUDGET_MINUTES: "2",
          PEN_GIT_TOKEN: "fixture-token-8f1c2e7a9b3d4f60-never-in-a-row",
          PEN_GIT_AUTHOR_NAME: "Pen Home",
          PEN_GIT_AUTHOR_EMAIL: "pen@example.invalid",
        },
      },
    }),
  ],
});
