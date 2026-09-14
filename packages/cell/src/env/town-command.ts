/**
 * The program: `town`, a just-bash custom command in every sheep's shell,
 * tier 0 as `look` is, written from town's harness contract
 * (`docs/harness.md` in a town checkout, its ten sections) and from
 * nothing of town's code (drove phase 0).
 *
 * One run, in the contract's order:
 *
 * - **§2, the grant.** The value is read now, from the source the cell
 *   hands in: the sheep's own `TOWN_GRANT` laid over its pasture's secret
 *   of that name. None is the first refusal, exit 3; a value that holds no
 *   grant is the second, exit 3, and its line never holds the value. A
 *   grant is a JSON object, white space around it allowed, whose `town` is
 *   an `http` or `https` origin and whose `token` is a non-empty string a
 *   request header can carry. A `town` holding more than an origin (a path
 *   past `/`, a query, a fragment, a user) is refused here as no grant,
 *   which §5 allows, rather than posted to at its origin.
 * - **§3, the words.** Every word as just-bash gave it, in order; each
 *   `--json`, wherever it stands, taken out and said as `"json": true`.
 * - **§4, stdin.** What the pipeline gave, as text, exactly; nothing given
 *   is `null`. just-bash hands a command bytes, so bytes that are not UTF-8
 *   are refused before any request, exit 1, as §4 and §7 say, after the
 *   grant is found.
 * - **§5 and §6, the request and the answer.** One `POST` to `/call` at
 *   the grant's origin through the `fetch` handed in, `authorization:
 *   Bearer <token>` and `content-type: application/json`, the body `argv`,
 *   `stdin`, `json`. An answer is a JSON object holding a string `stdout`,
 *   a string `stderr`, and a number `exit`, whatever the status, so a 500
 *   with a `why` beside them is an answer; its two streams are returned as
 *   given and its `exit` is the code. Anything else, a thrown `fetch`, a
 *   redirect, or no answer within sixty seconds, is the town that did not
 *   answer: one line, exit 1.
 * - **§7, the refusals.** One line on stderr, nothing on stdout; with
 *   `--json` among the words, the five-field envelope on stdout instead,
 *   one line and a newline, stderr empty. No refusal prints the value.
 * - **§8, §9, §10.** The code passed through, the notices passed through
 *   with the rest of `stderr`, nothing the town said parsed, and the call
 *   posted once whatever came back.
 *
 * The program holds the value for the length of one run and writes it
 * nowhere: not the shell's environment, not a log line, not a row.
 */
import { type Command, defineCommand } from "just-bash/browser";

/** The program's name, and the name the router counts as tier 0 beside just-bash's own. */
export const TOWN_PROGRAM = "town";

export const TOWN_PROGRAMS: ReadonlySet<string> = new Set([TOWN_PROGRAM]);

/** The secret the program reads: the grant itself, one JSON object. */
export const TOWN_GRANT = "TOWN_GRANT";

/** The word that is the harness's and never the town's (§3). */
export const JSON_FLAG = "--json";

/** How long a call waits for its answer: twice the thirty seconds the town gives a shop (§10). */
export const TOWN_TIMEOUT_MS = 60_000;

/** §2's first refusal, exit 3: the design's words. */
export const NO_GRANT = "town: this sheep carries no grant; mint one with sheep new --secret TOWN_GRANT, or set the pasture's";

/** §2's second refusal, exit 3. It says what a grant is, and nothing of what the value was. */
export const NOT_A_GRANT = `town: this sheep's ${TOWN_GRANT} holds no grant; a grant is one JSON object whose town is an http or https origin and whose token is a non-empty string`;

/** §4's refusal, exit 1: the town carries text. */
export const STDIN_NOT_UTF8 = "town: stdin is not UTF-8 text, and the town carries text; nothing was sent";

/** §6's refusal, exit 1: the town at the grant's origin did not answer, and what came instead. */
export function didNotAnswer(origin: string, what: string): string {
  return `town: the town at ${origin} did not answer (${what})`;
}

/** The `fetch` the program posts through: the Worker's own in a cell, a fake town in a test. */
export type TownFetch = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

/**
 * What the cell hands the shell (drove phase 0): where the value is read at
 * each run, the `fetch` to post through, and whether the sheep carried a
 * grant at its boot, which is the prompt's line and nothing else.
 */
export interface TownSource {
  /** The value, read now: the sheep's own over its pasture's; `undefined` when neither has one. */
  grant(): Promise<string | undefined>;
  fetch: TownFetch;
  /** Whether a grant was carried at the boot: the prompt names `town` only then. Absent, it was not. */
  carried?: boolean;
  /** Milliseconds a call waits for its answer; absent, `TOWN_TIMEOUT_MS`. A test shortens it; nothing else does. */
  timeoutMs?: number;
}

/** A grant, as §2 reads one: the origin the call goes to and the token it carries. */
export interface Grant {
  /** The `town`'s origin, no trailing slash: `http://127.0.0.1:7000`. */
  origin: string;
  token: string;
}

/**
 * §2: the grant a value holds, or `undefined`. White space, newlines
 * included, may surround the JSON; its first character that is not white
 * space is `{`; `town` is an `http` or `https` URL that is an origin with at
 * most a trailing `/`; `token` is a non-empty string that a header can
 * carry. Nothing about the value leaves this function but the answer.
 */
export function parseGrant(value: string): Grant | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const { town, token } = parsed as { town?: unknown; token?: unknown };
  if (typeof town !== "string" || typeof token !== "string" || token === "") return undefined;
  let url: URL;
  try {
    url = new URL(town);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  // An origin and at most a trailing slash (§2); more than that is no town's, and §5 lets a harness refuse it.
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "" || /[?#]/.test(town)) return undefined;
  // A token a request header cannot carry is no bearer; asked here, so a refusal of it never quotes it.
  try {
    new Headers({ authorization: `Bearer ${token}` });
  } catch {
    return undefined;
  }
  return { origin: url.origin, token };
}

/** The words the town is sent (§3): every word as given, less each `--json`; and whether one was there. */
export function wordsOf(args: readonly string[]): { argv: string[]; json: boolean } {
  const argv = args.filter((word) => word !== JSON_FLAG);
  return { argv, json: argv.length !== args.length };
}

/** §7's envelope: exactly the five fields, one line of JSON and a newline. */
export function envelope(exit: number, line: string): string {
  return `${JSON.stringify({ ok: false, output: "", notices: [], exit, error: line })}\n`;
}

type Done = { stdout: string; stderr: string; exitCode: number; stdoutKind: "text" };

/** A refusal of the program's own: the line on stderr, or with `--json` in the envelope on stdout. */
function refused(line: string, exit: number, json: boolean): Done {
  return json ? { stdout: envelope(exit, line), stderr: "", exitCode: exit, stdoutKind: "text" } : { stdout: "", stderr: `${line}\n`, exitCode: exit, stdoutKind: "text" };
}

/** §6: an answer is an object holding a string `stdout`, a string `stderr`, and a number `exit`; anything else is none. */
function answerOf(body: unknown): { stdout: string; stderr: string; exit: number } | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const { stdout, stderr, exit } = body as { stdout?: unknown; stderr?: unknown; exit?: unknown };
  if (typeof stdout !== "string" || typeof stderr !== "string" || typeof exit !== "number" || !Number.isFinite(exit)) return undefined;
  return { stdout, stderr, exit };
}

/**
 * §4: what the pipeline gave, as text. just-bash's stdin is a latin1 view
 * of bytes, one char per byte; nothing is `null`, and bytes that are not
 * UTF-8 are `undefined`, which the program refuses.
 */
export function stdinText(stdin: unknown): string | null | undefined {
  const latin1 = typeof stdin === "string" ? stdin : "";
  if (latin1 === "") return null;
  const bytes = Uint8Array.from(latin1, (char) => char.charCodeAt(0) & 0xff);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Why a call came to nothing, in a few words that hold nothing of the grant's token. */
class NoAnswer extends Error {}

/**
 * The command for a cell: every run reads the value from `source`, and
 * posts, when there is a grant, through `source.fetch`, once.
 */
export function townCommand(source: TownSource): Command {
  const timeoutMs = source.timeoutMs ?? TOWN_TIMEOUT_MS;
  return defineCommand(TOWN_PROGRAM, async (args, ctx) => {
    const { argv, json } = wordsOf(args);

    // §2, and before stdin (§7): the grant is found first.
    const value = await source.grant();
    if (value === undefined) return refused(NO_GRANT, 3, json);
    const grant = parseGrant(value);
    if (grant === undefined) return refused(NOT_A_GRANT, 3, json);

    // §4.
    const stdin = stdinText(ctx.stdin);
    if (stdin === undefined) return refused(STDIN_NOT_UTF8, 1, json);

    // §5, once (§10): no retry on any answer, on a throw, or on the timeout.
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    ctx.signal?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new NoAnswer(`no answer within ${timeoutMs / 1000} s`));
      }, timeoutMs);
    });
    const call = async (): Promise<{ stdout: string; stderr: string; exit: number }> => {
      let response: Response;
      try {
        response = await source.fetch(`${grant.origin}/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${grant.token}`, "content-type": "application/json" },
          body: JSON.stringify({ argv, stdin, json }),
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw new NoAnswer("the call was aborted");
        // The runtime's own first line says why (a refused connection, a name that did not resolve); a line that somehow
        // carried the token is not said at all.
        const message = (error instanceof Error ? error.message : String(error)).split("\n")[0]!.trim();
        throw new NoAnswer(message === "" || message.includes(grant.token) ? "the request failed" : `the request failed: ${message}`);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new NoAnswer(`HTTP ${response.status}, a body that is not JSON`);
      }
      const answer = answerOf(body);
      if (answer === undefined) throw new NoAnswer(`HTTP ${response.status}, a body that is not stdout, stderr, and exit`);
      return answer;
    };
    try {
      const answer = await Promise.race([call(), deadline]);
      // §6: each stream exactly as given, and the code unchanged (§8). Notices are in `stderr` and pass with it (§9).
      return { stdout: answer.stdout, stderr: answer.stderr, exitCode: answer.exit, stdoutKind: "text" };
    } catch (error) {
      return refused(didNotAnswer(grant.origin, error instanceof NoAnswer ? error.message : "the request failed"), 1, json);
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", onAbort);
    }
  });
}
