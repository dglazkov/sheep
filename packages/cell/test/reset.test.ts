/**
 * Issue #16: what `throughReset` asks again. A redeploy resets every
 * Durable Object, and a call that meets the reset is asked again across
 * the window; an overload, or any other error, is thrown at once.
 */
import { describe, expect, it } from "vitest";
import { isReset, throughReset } from "../src/reset.ts";

const reset = () => Object.assign(new Error("Durable Object reset because its code was updated."), { retryable: true });
const NO_WAIT = [0, 0, 0, 0];

describe("issue #16: throughReset", () => {
  it("knows the reset by its flags or its words, and not an overload or another error", () => {
    expect(isReset(reset())).toBe(true);
    expect(isReset(new Error("Durable Object reset because its code was updated."))).toBe(true);
    expect(isReset(Object.assign(new Error("x"), { durableObjectReset: true }))).toBe(true);
    expect(isReset(Object.assign(new Error("Durable Object is overloaded."), { retryable: true, overloaded: true }))).toBe(false);
    expect(isReset(new Error("no such session"))).toBe(false);
    expect(isReset("reset because its code was updated")).toBe(false);
  });

  it("asks again while the call meets the reset, and answers with the first answer", async () => {
    let calls = 0;
    const answer = await throughReset(async () => {
      if (++calls < 3) throw reset();
      return "answered";
    }, NO_WAIT);
    expect(answer).toBe("answered");
    expect(calls).toBe(3);
  });

  it("throws another error at once, and the last reset once the delays are spent", async () => {
    let calls = 0;
    await expect(
      throughReset(async () => {
        calls++;
        throw new Error("no such session");
      }, NO_WAIT),
    ).rejects.toThrow("no such session");
    expect(calls).toBe(1);

    calls = 0;
    await expect(
      throughReset(async () => {
        calls++;
        throw reset();
      }, NO_WAIT),
    ).rejects.toThrow("reset because its code was updated");
    expect(calls).toBe(5);
  });
});
