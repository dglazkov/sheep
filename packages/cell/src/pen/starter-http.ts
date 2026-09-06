/**
 * The starter for a home whose containers are started by a program beside
 * the node rather than by a platform binding: pen phase 6, celld. The
 * cell reaches it at `PEN_STARTER_URL`, a local HTTP endpoint the operator
 * configures (`packages/pen/bin/pen-starter.mjs` drives Docker there), and
 * speaks the same three verbs the `ContainerStarter` interface has, one
 * `POST` with a JSON body each:
 *
 *   POST /ensure  { session, cellUrl, token, env }  ->  { started }
 *   POST /renew   { session }                       ->  { running }
 *   POST /destroy { session }                       ->  {}
 *
 * `env` is what the Containers binding puts in the container's environment
 * beside the address and the token: the home's author for git, never a
 * secret. The starter knows nothing of the Directory, so a lease over this
 * starter reports the container's minutes itself, from the socket's open
 * and close (`cell.ts`, `leaseFor()`); the platform's starter reports from
 * its own `onStart` and `onStop`. Any answer that is not 2xx, and any
 * answer that does not come within the timeout, is the lease's "could not
 * be started".
 */
import { authorEnv } from "./container.ts";
import type { ContainerStarter } from "./lease.ts";

/** Milliseconds the starter has to answer one call. Starting is `docker run -d`: seconds at most. */
export const DEFAULT_STARTER_TIMEOUT_MS = 15_000;

export interface HttpStarterOptions {
  /** The endpoint, `http://127.0.0.1:9877`; a trailing slash is dropped. */
  url: string;
  sessionId: string;
  /** Put in the container's environment beside `PEN_CELL_URL` and `PEN_TOKEN`. */
  env?: Record<string, string>;
  timeoutMs?: number;
  /** The test's seam: what the calls go through. Default the runtime's `fetch`. */
  fetch?: typeof fetch;
}

export class HttpStarter implements ContainerStarter {
  readonly url: string;
  private readonly options: HttpStarterOptions;

  constructor(options: HttpStarterOptions) {
    this.options = options;
    this.url = options.url.replace(/\/+$/, "");
  }

  async ensure(args: { cellUrl: string; token: string }): Promise<{ started: boolean }> {
    const answer = await this.post("ensure", { session: this.options.sessionId, cellUrl: args.cellUrl, token: args.token, env: this.options.env ?? {} });
    return { started: answer.started === true };
  }

  async renew(): Promise<{ running: boolean }> {
    const answer = await this.post("renew", { session: this.options.sessionId });
    return { running: answer.running === true };
  }

  async destroy(): Promise<void> {
    await this.post("destroy", { session: this.options.sessionId });
  }

  private async post(verb: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_STARTER_TIMEOUT_MS;
    const doFetch = this.options.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${this.url}/${verb}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`the starter at ${this.url} did not answer ${verb} within ${timeoutMs / 1000} s`);
      throw new Error(`the starter at ${this.url} could not be reached for ${verb}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`the starter at ${this.url} answered ${response.status} to ${verb}${text.trim() === "" ? "" : `: ${text.trim()}`}`);
    if (text.trim() === "") return {};
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      throw new Error(`the starter at ${this.url} answered ${verb} with something other than JSON`);
    }
  }
}

/** The starter `PEN_STARTER_URL` names, or nothing when the home has none. The author travels with every start, as the binding's does. */
export function httpStarterFor(
  env: { PEN_STARTER_URL?: string | undefined; PEN_GIT_AUTHOR_NAME?: string | undefined; PEN_GIT_AUTHOR_EMAIL?: string | undefined },
  sessionId: string,
): HttpStarter | undefined {
  const url = env.PEN_STARTER_URL?.trim();
  if (url === undefined || url === "") return undefined;
  return new HttpStarter({ url, sessionId, env: authorEnv(env) });
}
