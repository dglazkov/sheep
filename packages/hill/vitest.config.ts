import { defineConfig } from "vitest/config";
import { ringConfig } from "../../scripts/rings.mjs";

/**
 * The hill's own logic in Node (hill phase 1, journey 4 step 3): the address
 * rewrite, the gate's words, the load flow as a function of the home's
 * answers, and the built page counted and searched. No browser and no home;
 * the page's truth in a browser is the walk's, and its routes are the cell's.
 */
export default defineConfig({
  // `SHEEP_RING` narrows this to one ring's files; unset, everything here runs.
  test: { testTimeout: 30_000, ...ringConfig("packages/hill") },
});
