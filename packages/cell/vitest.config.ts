import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { LAMB_TOKEN: "test-token", LAMB_PROVIDER: "faux", LAMB_GITHUB_TOKEN: "secret-git-credential-9f3a" },
      },
    }),
  ],
  test: {
    globalSetup: ["./test/git-server.ts"],
  },
});
