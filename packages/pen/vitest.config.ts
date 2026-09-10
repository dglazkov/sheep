import { defineConfig } from "vitest/config";
import { ringConfig } from "../../scripts/rings.mjs";

/**
 * Every case in here spawns the built pen agent as a real process, so the
 * whole package is the command ring's. The config exists for that: with
 * `SHEEP_RING` set to another ring, `include` is empty and this package
 * passes with nothing run rather than failing for want of test files.
 */
export default defineConfig({
  test: { testTimeout: 30_000, ...ringConfig("packages/pen") },
});
