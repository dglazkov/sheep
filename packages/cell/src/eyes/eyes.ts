/**
 * The eyes: one class over the browser binding and the cell's files
 * table. A sheep writes HTML, CSS, and modules into rows in a Durable
 * Object; nothing listens on a port and nothing ever will. So the eyes
 * mount the workspace at a made-up origin, `http://sheep.invalid`, and
 * answer every request the browser makes to it out of the rows. A page
 * loaded at `http://sheep.invalid/<path under the root>` resolves its
 * relative stylesheet, its module script, its images, and a `fetch` of
 * its own JSON against the rows beside it, and an absolute
 * `/assets/x.js` against the root. Nothing serves the origin;
 * interception does.
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
import { posix } from "node:path";
import { type FilesTable, normalizePath, WORKSPACE_ROOT } from "../workspace/files.ts";
import { type AxNode, type ConsoleLine, pngSize, report, type RequestLine, type Seen } from "./report.ts";
import { EyesSession } from "./session.ts";

/** The address the workspace is mounted at inside the browser. Nothing serves it. */
export const ORIGIN = "http://sheep.invalid";

/** The viewport a look gets when the program's `--viewport` says nothing. */
export const DEFAULT_VIEWPORT = { width: 1024, height: 768 } as const;

/** The name the closing line uses when the program's `--out` says nothing. */
export const DEFAULT_OUT = "look.png";

/** How long `goto` waits for the page to go idle before it gives up. */
export const GOTO_TIMEOUT_MS = 15_000;

/** `--click <selector>` and `--fill <selector> <text>`, which act in the order the program was given them. */
export type LookAction = { kind: "click"; selector: string } | { kind: "fill"; selector: string; text: string };

/**
 * One look, as the `look` program's flags map onto it, one for one:
 * `path` is the argument, the rest are the flags. `--out` is here only so
 * the closing line can name the file; the eyes never write it.
 */
export interface LookRequest {
  /** The page: an absolute workspace path. A directory means its `index.html`. */
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
 * A look that could not be taken: a path that is not in the workspace, a
 * selector that matched nothing. One line, which is what the program
 * prints before it exits 1. A page that rendered badly is not this: that
 * is a report with errors in it.
 */
export class LookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookError";
  }
}

/**
 * The cell's eyes, or `undefined` on a home whose Worker has no `BROWSER`
 * binding — a station deployed before this release. This is the one place
 * that decides: `/home`, the prompt, and the shell's `look` ask it rather
 * than reading the env themselves, so there is one answer to "does this
 * home have eyes" and one place to change it.
 */
export function eyesFor(env: Env, files: FilesTable, sql: SqlStorage): Eyes | undefined {
  return env.BROWSER === undefined ? undefined : new Eyes(env.BROWSER, files, sql);
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

  /** One look: a page in the cell's session, rendered from the rows, and what it said. */
  async look(request: LookRequest): Promise<LookResult> {
    const started = Date.now();
    const root = normalizePath(request.root ?? WORKSPACE_ROOT);
    const url = this.pageUrl(root, request.path);
    const out = request.out ?? DEFAULT_OUT;
    const browser = await this.session.open();
    try {
      return await this.lookIn(browser, root, url, request, out, started);
    } finally {
      await this.session.release(browser);
    }
  }

  private async lookIn(browser: Browser, root: string, url: string, request: LookRequest, out: string, started: number): Promise<LookResult> {
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
      page.on("request", (intercepted) => {
        const asked = new URL(intercepted.url());
        note(intercepted, {});
        if (asked.origin !== ORIGIN) {
          // Every other origin goes to the network, as it would in any browser.
          return void intercepted.continue();
        }
        const file = this.serve(root, asked.pathname);
        if (file === undefined) {
          note(intercepted, { status: 404 });
          blame(intercepted, `404 ${asked.pathname}`);
          return void intercepted.respond({ status: 404, contentType: "text/plain", headers: {}, body: `not in the workspace: ${asked.pathname}` });
        }
        note(intercepted, { status: 200 });
        return void intercepted.respond({ status: 200, contentType: contentTypeOf(file.path), headers: {}, body: file.bytes });
      });
      await page.goto(url, { waitUntil: "networkidle0", timeout: GOTO_TIMEOUT_MS });
      await act(page, request.actions ?? []);
      const png = new Uint8Array(await page.screenshot({ type: "png", fullPage: request.full === true }));
      const tree = (await page.accessibility.snapshot()) as AxNode | null;
      const seen: Seen = { errors, console: messages, requests, tree, ...pngSize(png), ms: Date.now() - started, out };
      return { png, report: report(seen), seen };
    } finally {
      await page.close();
    }
  }

  /**
   * Where the page is loaded: the origin, then the path relative to the
   * root, so a relative asset beside it resolves to the row beside it. A
   * path that is not in the workspace, or is outside the root, is a
   * `LookError` and no browser is even asked for.
   */
  private pageUrl(root: string, path: string): string {
    const target = normalizePath(path);
    if (target !== root && !target.startsWith(`${root}/`)) throw new LookError(`${target} is not under the root ${root}`);
    const file = this.indexed(target);
    if (file === undefined) throw new LookError(`no such path in the workspace: ${target}`);
    return `${ORIGIN}${encodeURI(file.slice(root.length)) || "/"}`;
  }

  /** One intercepted request, answered from the rows under the root, or `undefined` for a 404. */
  private serve(root: string, pathname: string): { path: string; bytes: Uint8Array } | undefined {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return undefined;
    }
    let target: string;
    try {
      target = normalizePath(posix.join(root, decoded));
    } catch {
      return undefined;
    }
    // A `..` that climbs out of the root reads nothing: the root is the mount, and there is no above it.
    if (target !== root && !target.startsWith(`${root}/`)) return undefined;
    const file = this.indexed(target);
    if (file === undefined) return undefined;
    try {
      return { path: file, bytes: this.files.readFile(file) };
    } catch {
      return undefined;
    }
  }

  /** The file a path means: itself, or the `index.html` in it when it is a directory. `undefined` when there is none. */
  private indexed(path: string): string | undefined {
    let kind;
    try {
      kind = this.files.stat(path).kind;
    } catch {
      return undefined;
    }
    if (kind !== "directory") return path;
    const index = posix.join(path, "index.html");
    return this.files.exists(index) ? index : undefined;
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

/** A URL as an error line names it: the path alone for the origin, the whole thing for anywhere else. */
function short(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin === ORIGIN ? parsed.pathname : url;
  } catch {
    return url;
  }
}

/**
 * The content type of a row, by its extension. A browser is strict about
 * these — a module served as `text/plain` does not run, a stylesheet does
 * not apply — so the list covers what a sheep writes and everything else
 * is bytes.
 */
const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  wasm: "application/wasm",
  webmanifest: "application/manifest+json",
  xml: "application/xml",
};

export function contentTypeOf(path: string): string {
  const extension = posix.extname(path).slice(1).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}
