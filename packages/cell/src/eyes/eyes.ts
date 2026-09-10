/**
 * The eyes: one class over the browser binding and an origin. A sheep
 * writes HTML, CSS, and modules into rows in a Durable Object; nothing
 * listens on a port and nothing ever will. So the eyes mount a made-up
 * origin, `http://sheep.invalid`, and answer every request the browser
 * makes to it by asking the look's `Origin` — the rows under a root, as
 * eyes built it, or a forward to a server the container is running.
 * Nothing serves the origin; interception does.
 *
 * Serve phase 0 made that an interface. The eyes compute nothing about
 * rows any more: where the look starts and what each request is answered
 * with are both the origin's to say, and a look with no origin given
 * builds the rows' one over its own files, which is what every look was
 * until now.
 *
 * Every other origin is let through to the network, so a font from a CDN
 * renders and a page that leans on one looks as the shepherd would see
 * it. The spike aborted them; the design says continue.
 *
 * What a look gathers is the page's console, its uncaught exceptions,
 * and the requests that failed — 404 for a file the sheep did not write,
 * the browser's own text for one that never finished. Then the
 * screenshot and the accessibility tree, and the page is closed. What
 * comes back is the PNG's bytes and the report; writing the one and
 * printing the other is the `look` program's, in eyes phase 1.
 */
import type { Browser, HTTPRequest, Page } from "@cloudflare/puppeteer";
import { type FilesTable, normalizePath, WORKSPACE_ROOT } from "../workspace/files.ts";
import { LookError, type Origin, type OriginAnswer, RowsOrigin } from "./origin.ts";
import { type AxNode, type ConsoleLine, pngSize, pruneTree, report, type RequestLine, type Seen } from "./report.ts";
import { EyesSession } from "./session.ts";

export { contentTypeOf, ForwardOrigin, LookError, type Origin, type OriginAnswer, type OriginRequest, RowsOrigin } from "./origin.ts";

/** The address the workspace is mounted at inside the browser. Nothing serves it. */
export const ORIGIN = "http://sheep.invalid";

/** The viewport a look gets when the program's `--viewport` says nothing. */
export const DEFAULT_VIEWPORT = { width: 1024, height: 768 } as const;

/** The name the closing line uses when the program's `--out` says nothing. */
export const DEFAULT_OUT = "look.png";

/** How long `goto` waits for the page to go idle before it gives up. */
export const GOTO_TIMEOUT_MS = 15_000;

const encoder = new TextEncoder();

/** `--click <selector>` and `--fill <selector> <text>`, which act in the order the program was given them. */
export type LookAction = { kind: "click"; selector: string } | { kind: "fill"; selector: string; text: string };

/**
 * One look, as the `look` program's flags map onto it, one for one:
 * `path` is the argument, the rest are the flags. `--out` is here only so
 * the closing line can name the file; the eyes never write it.
 */
export interface LookRequest {
  /** The page, as the origin reads it: an absolute workspace path for the rows, where a directory means its `index.html`; a path on the server for a served look. */
  path: string;
  /** `--root`: the directory mounted at `/`. The workspace root unless the program says otherwise. */
  root?: string;
  /** `--click` and `--fill`, in the order given, acted on once the page is idle. */
  actions?: readonly LookAction[];
  /** `--viewport`; 1024×768 by default. */
  viewport?: { width: number; height: number };
  /** `--full`: the whole scroll height rather than the viewport. */
  full?: boolean;
  /** `--out`: the name the closing line reports. The program writes the file. */
  out?: string;
}

/** What comes back: the bytes for the program to write, the text for it to print, and what the text was made of. */
export interface LookResult {
  png: Uint8Array;
  report: string;
  seen: Seen;
}

/**
 * The cell's eyes, or `undefined` on a home whose Worker has no `BROWSER`
 * binding — a station deployed before this release. This is the one place
 * that decides: `/home`, the prompt, and the shell's `look` ask it rather
 * than reading the env themselves, so there is one answer to "does this
 * home have eyes" and one place to change it.
 */
export function eyesFor(env: Pick<Env, "BROWSER">, files: FilesTable, sql: SqlStorage): Eyes | undefined {
  return env.BROWSER === undefined ? undefined : new Eyes(env.BROWSER, files, sql);
}

/** Whether this home has eyes at all: the same test `eyesFor` makes, for `/home` to report without building any (eyes phase 1). */
export function hasEyes(env: Pick<Env, "BROWSER">): boolean {
  return env.BROWSER !== undefined;
}

export class Eyes {
  /** The cell's browser, kept warm between looks. Public so a later phase can report the session a look used. */
  readonly session: EyesSession;

  constructor(
    binding: Fetcher,
    private readonly files: FilesTable,
    sql: SqlStorage,
  ) {
    this.session = new EyesSession(binding, sql);
  }

  /**
   * One look: a page in the cell's session, rendered from an origin, and
   * what it said. With no origin, the rows under the request's root, which
   * is what the eyes have always done and what the `look` program asks
   * for; a served look hands in the forward's instead. The origin is asked
   * where the look starts before a browser is opened, so a path that is
   * not there costs no session.
   */
  async look(request: LookRequest, origin: Origin = new RowsOrigin(this.files, normalizePath(request.root ?? WORKSPACE_ROOT))): Promise<LookResult> {
    const started = Date.now();
    const url = `${ORIGIN}${origin.start(request.path)}`;
    const out = request.out ?? DEFAULT_OUT;
    const browser = await this.session.open();
    try {
      return await this.lookIn(browser, origin, url, request, out, started);
    } finally {
      await this.session.release(browser);
    }
  }

  private async lookIn(browser: Browser, origin: Origin, url: string, request: LookRequest, out: string, started: number): Promise<LookResult> {
    const errors: string[] = [];
    const messages: ConsoleLine[] = [];
    const requests: RequestLine[] = [];
    /**
     * One line per request, and at most one error line per request. A
     * stylesheet the sheep never wrote is answered 404 here and then
     * abandoned by the browser, which reports it a second time as
     * `net::ERR_ABORTED`; the design says one line per failed request, so
     * the first thing said about a request is the only thing said.
     */
    const seenRequests = new Map<HTTPRequest, RequestLine>();
    const blamed = new Set<HTTPRequest>();
    const note = (asked: HTTPRequest, patch: Partial<RequestLine>): void => {
      const line = seenRequests.get(asked);
      if (line === undefined) {
        const fresh: RequestLine = { method: asked.method(), url: asked.url(), ...patch };
        seenRequests.set(asked, fresh);
        requests.push(fresh);
        return;
      }
      Object.assign(line, patch);
    };
    const blame = (asked: HTTPRequest, line: string): void => {
      if (blamed.has(asked)) return;
      blamed.add(asked);
      errors.push(line);
    };
    const page = await browser.newPage();
    try {
      await page.setViewport(request.viewport ?? DEFAULT_VIEWPORT);
      page.on("console", (message) => messages.push({ level: message.type(), text: message.text() }));
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("requestfailed", (failed) => {
        const text = failed.failure()?.errorText ?? "failed";
        note(failed, { failure: text });
        blame(failed, `${text} ${short(failed.url())}`);
      });
      page.on("response", (response) => {
        const asked = response.request();
        note(asked, { status: response.status() });
        if (response.status() >= 400) blame(asked, `${response.status()} ${short(response.url())}`);
      });
      await page.setRequestInterception(true);
      page.on("request", (intercepted) => this.answer(intercepted, origin, note, blame));
      await page.goto(url, { waitUntil: "networkidle0", timeout: GOTO_TIMEOUT_MS });
      await act(page, request.actions ?? []);
      const png = new Uint8Array(await page.screenshot({ type: "png", fullPage: request.full === true }));
      // Whole, then cut by the eyes' own rule: puppeteer's `interestingOnly` reports a page with nothing focusable as its root alone.
      const tree = pruneTree((await page.accessibility.snapshot({ interestingOnly: false })) as AxNode | null);
      const seen: Seen = { errors, console: messages, requests, tree, ...pngSize(png), ms: Date.now() - started, out };
      return { png, report: report(seen), seen };
    } finally {
      await page.close();
    }
  }

  /**
   * One intercepted request. Every other origin goes to the network, as it
   * would in any browser; the look's own is the origin's to answer, and
   * `undefined` from it is the 404 the eyes write and blame. A 404 is said
   * twice by the browser — once as the status, again as `net::ERR_ABORTED`
   * on the request it then abandoned — and `blame` is what keeps it to one
   * line.
   *
   * The rows answer inside this event, as they always did, and the browser
   * sees no gap; only an origin that has to leave the cell waits, and then
   * the answer lands a turn later, which is what lets a page's fifty
   * requests be fifty fetches rather than a queue. An origin that throws is
   * a request the browser will never be answered, so it is aborted and
   * reported as one.
   */
  private answer(
    intercepted: HTTPRequest,
    origin: Origin,
    note: (asked: HTTPRequest, patch: Partial<RequestLine>) => void,
    blame: (asked: HTTPRequest, line: string) => void,
  ): void {
    const asked = new URL(intercepted.url());
    note(intercepted, {});
    if (asked.origin !== ORIGIN) return void intercepted.continue();
    const give = (answer: OriginAnswer | undefined): void => {
      if (answer === undefined) {
        note(intercepted, { status: 404 });
        blame(intercepted, `404 ${asked.pathname}`);
        return void intercepted.respond({ status: 404, contentType: "text/plain", headers: {}, body: `not in the workspace: ${asked.pathname}` });
      }
      note(intercepted, { status: answer.status });
      return void intercepted.respond({ status: answer.status, headers: answer.headers, body: answer.body });
    };
    const failed = (error: unknown): void => {
      blame(intercepted, `${error instanceof Error ? error.message : String(error)} ${asked.pathname}`);
      void intercepted.abort().catch(() => {});
    };
    let answered: OriginAnswer | undefined | Promise<OriginAnswer | undefined>;
    try {
      answered = origin.answer({ method: intercepted.method(), url: `${asked.pathname}${asked.search}`, headers: intercepted.headers(), ...bodyOf(intercepted) });
    } catch (error) {
      return failed(error);
    }
    if (answered instanceof Promise) return void answered.then(give, failed);
    return give(answered);
  }
}

/** The flags, in the order the program was given them, once the page is idle. */
async function act(page: Page, actions: readonly LookAction[]): Promise<void> {
  for (const action of actions) {
    try {
      if (action.kind === "click") await page.click(action.selector);
      else await page.type(action.selector, action.text);
    } catch (error) {
      throw new LookError(`--${action.kind} ${action.selector}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }
}

/** The request's body, when it has one: puppeteer hands it over as text, so text is what the origin gets bytes of. */
function bodyOf(intercepted: HTTPRequest): { body?: Uint8Array } {
  const data = intercepted.postData();
  return data === undefined || data === "" ? {} : { body: encoder.encode(data) };
}

/** A URL as an error line names it: the path alone for the origin, the whole thing for anywhere else. */
function short(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin === ORIGIN ? parsed.pathname : url;
  } catch {
    return url;
  }
}
