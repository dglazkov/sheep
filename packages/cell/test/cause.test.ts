import { describe, expect, it } from "vitest";
import { describeError } from "../src/cause.ts";

describe("describeError", () => {
  it("walks the cause chain, so a harness fault's reason is in the line", () => {
    const fault = new Error("AgentHarness storage or invariant fault", { cause: new RangeError("Durable Object instance is no longer active") });
    fault.name = "HarnessFault";
    expect(describeError(fault)).toBe("HarnessFault: AgentHarness storage or invariant fault <- RangeError: Durable Object instance is no longer active");
  });

  it("ends at a cause that is not an Error, and at a cycle", () => {
    expect(describeError(new Error("outer", { cause: "socket closed" }))).toBe("Error: outer <- socket closed");
    const loop = new Error("loop");
    loop.cause = loop;
    expect(describeError(loop)).toBe("Error: loop");
    expect(describeError("plain")).toBe("plain");
  });
});
