/**
 * The redeploy's window (issue #16): a Worker version change resets every
 * Durable Object, and a call that reaches one while it resets throws
 * "Durable Object reset because its code was updated." The platform marks
 * such an error `retryable`; the object answers again from the new code a
 * moment later. `throughReset` asks again across that moment, for the
 * calls that are safe to ask twice — never a prompt, whose first asking
 * may have landed.
 */

/** How long to wait before each ask after the first: about four seconds in all, the window the account ring saw. */
export const RESET_DELAYS_MS = [250, 750, 1_000, 2_000] as const;

/** Whether an error is the platform resetting an object, not an overload and not the call's own failure. */
export function isReset(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const flags = error as Error & { retryable?: unknown; overloaded?: unknown; durableObjectReset?: unknown };
  if (flags.overloaded === true) return false;
  return flags.durableObjectReset === true || flags.retryable === true || /reset because its code was updated/i.test(error.message);
}

/** Runs `call`, and runs it again after each delay while it throws a reset; any other error, or the last reset, is thrown. */
export async function throughReset<T>(call: () => Promise<T>, delays: readonly number[] = RESET_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= delays.length || !isReset(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
