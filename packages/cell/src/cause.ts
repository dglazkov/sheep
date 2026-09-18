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
