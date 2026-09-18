/**
 * An error and its causes as one line, for a log a `wrangler tail` or the Worker's retained logs carry.
 *
 * Pi's `HarnessFault` says only "AgentHarness storage or invariant fault" and keeps the reason in `cause`; a
 * `fetch` error keeps its socket's reason there too. A line that stops at `message` is why #20 was filed.
 */
export function describeError(error: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current) && parts.length < 8) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(`${current.name}: ${current.message}`);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" <- ");
}

/** The stack of the innermost cause, the call site's; the message alone says what, this says where. */
export function innermostStack(error: unknown): string {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && current.cause instanceof Error && !seen.has(current.cause)) {
    seen.add(current);
    current = current.cause;
  }
  return current instanceof Error && current.stack ? current.stack : "";
}
