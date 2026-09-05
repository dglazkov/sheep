import { env, runInDurableObject } from "cloudflare:test";
import type { ConformanceCase } from "@earendil-works/pi-agent-core/harness/session/testing";
import { describe, it } from "vitest";

/**
 * Registers pi's runner-independent conformance cases as vitest tests, each
 * run inside a fresh Durable Object so the fixture factory sees the cell's
 * storage. The current cell's state is published through `currentState`
 * for the factory the cases were built with.
 */
export let currentState: DurableObjectState | undefined;

export function registerConformance(name: string, cases: readonly ConformanceCase[]): void {
  describe(name, () => {
    for (const group of new Set(cases.map((testCase) => testCase.group))) {
      describe(group, () => {
        for (const testCase of cases.filter((candidate) => candidate.group === group)) {
          it(testCase.name, async () => {
            const stub = env.SESSION_CELL.getByName(`conformance:${group}:${testCase.name}`);
            await runInDurableObject(stub, async (_instance, state) => {
              currentState = state;
              try {
                await testCase.run();
              } finally {
                currentState = undefined;
              }
            });
          });
        }
      });
    }
  });
}

export function requireState(): DurableObjectState {
  if (currentState === undefined) throw new Error("conformance case ran outside a Durable Object");
  return currentState;
}
