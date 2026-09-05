/**
 * The one sentence the shell says when asked for something it does not
 * have, and the same sentence the system prompt says up front. Kept in one
 * place so the two can never drift; a test checks both carry it.
 */
export const SHELL_NOTICE =
  "this shell runs inside the session; no interpreters or package managers are installed";

export const SHELL_SYSTEM_PROMPT_LINE =
  `The bash tool runs a shell interpreter inside the session with the usual text tools (ls, cat, grep, sed, awk, find, sort, jq, diff, tar) over the workspace at /workspace. ` +
  `There are no interpreters (no python, node) and no package managers (no npm, pip, cargo): ${SHELL_NOTICE}. ` +
  `Say so plainly when asked for something the shell cannot do, rather than pretending it ran.`;

/** Rewrites just-bash's `X: command not found` lines to carry the notice. */
export function annotateCommandNotFound(text: string): string {
  return text.replace(/^(.*: command not (?:found|available)(?:[^\n(]*)?)$/gm, `$1 (${SHELL_NOTICE})`);
}
