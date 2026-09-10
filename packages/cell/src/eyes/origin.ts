/**
 * What answers the browser during a look. The eyes mount a made-up
 * origin, `http://sheep.invalid`, and intercept every request to it;
 * until now the answer always came from the rows, and the eyes computed
 * it themselves. A served look answers from a server the container is
 * running instead, so the two have to be one interface, and the eyes have
 * to ask rather than know.
 *
 * An origin has two members because a look has two questions. `answer`
 * is the one the design names: the request the browser made, the response
 * to give it, or nothing for a 404 the eyes write themselves. `start` is
 * the other: where the look begins. The rows know that as a workspace
 * path that has to exist, be under the root, and may mean the
 * `index.html` in a directory — three rules and two error messages that
 * are about rows and nothing else. A server knows it as a path. Only the
 * origin can say which, so it says both, and the eyes compute nothing
 * about the rows themselves.
 */
import { posix } from "node:path";
import type { Forward, ForwardResponse } from "../pen/forward.ts";
import { type FilesTable, normalizePath } from "../workspace/files.ts";

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

/** One request the browser made to the look's origin, as the origin is asked it. */
export interface OriginRequest {
  method: string;
  /** The path and query, as the browser asked for it: `/assets/app.js?v=2`. */
  url: string;
  headers: Record<string, string>;
  /** The request's body, when it had one. */
  body?: Uint8Array;
}

/** What to answer the browser with. `headers` carries the content type; the eyes add nothing. */
export interface OriginAnswer {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** What answers `http://sheep.invalid` during one look: the rows under a root, or a forward to a port. */
export interface Origin {
  /**
   * Where the look starts, as a path under the origin, beginning with
   * `/`. Throws a `LookError` when there is nothing to look at; the eyes
   * ask before any browser is opened, so a bad path costs no session.
   */
  start(path: string): string;
  /**
   * One request; `undefined` is a 404 the eyes answer and blame
   * themselves. An origin that already has the answer gives it back
   * plainly, and the eyes respond inside the interception event as they
   * always have; only an origin that has to leave the cell — the
   * forward's — waits, and only its requests are answered a turn later.
   */
  answer(request: OriginRequest): OriginAnswer | undefined | Promise<OriginAnswer | undefined>;
}

/**
 * The rows under a root, which is what the eyes did before an origin was
 * an interface. A page loaded at `<origin>/<path under the root>`
 * resolves its relative stylesheet, its module script, its images, and a
 * `fetch` of its own JSON against the rows beside it, and an absolute
 * `/assets/x.js` against the root.
 */
export class RowsOrigin implements Origin {
  constructor(
    private readonly files: FilesTable,
    /** The directory mounted at `/`, absolute and normalized. */
    private readonly root: string,
  ) {}

  start(path: string): string {
    const target = normalizePath(path);
    if (target !== this.root && !target.startsWith(`${this.root}/`)) throw new LookError(`${target} is not under the root ${this.root}`);
    const file = this.indexed(target);
    if (file === undefined) throw new LookError(`no such path in the workspace: ${target}`);
    return encodeURI(file.slice(this.root.length)) || "/";
  }

  answer(request: OriginRequest): OriginAnswer | undefined {
    const file = this.file(pathnameOf(request.url));
    if (file === undefined) return undefined;
    return { status: 200, headers: { "content-type": contentTypeOf(file.path) }, body: file.bytes };
  }

  /** One path, read from the rows under the root, or `undefined` for a 404. */
  private file(pathname: string): { path: string; bytes: Uint8Array } | undefined {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return undefined;
    }
    let target: string;
    try {
      target = normalizePath(posix.join(this.root, decoded));
    } catch {
      return undefined;
    }
    // A `..` that climbs out of the root reads nothing: the root is the mount, and there is no above it.
    if (target !== this.root && !target.startsWith(`${this.root}/`)) return undefined;
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

/**
 * Headers a server's answer carries about its own hop, which are not the
 * browser's to receive: the body is handed over whole and decoded, so a
 * length or a chunking that described the wire would describe nothing
 * here. `content-encoding` is among them because the agent asks the
 * server for `identity`; a server that compressed anyway would have been
 * decompressed on the way, and the header would be a lie.
 */
const HOP_HEADERS = new Set(["connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding", "upgrade", "proxy-connection"]);

/** The status the eyes give a request the container could not make at all: the gateway is the eyes, and the server was not there. */
export const NOT_REACHED_STATUS = 502;

/**
 * A server the container is running, reached over the forward. The look
 * is one page from a port: `start` is a path on that server, and every
 * request the browser makes is one `fetch` frame and one `response`. A
 * fetch the container could not make comes back with status `0`, which is
 * no status at all; the eyes are a gateway that could not reach its
 * upstream, so the browser is told `502` and the agent's own words, and
 * the look reports it as the failed request it is.
 */
export class ForwardOrigin implements Origin {
  constructor(
    private readonly forward: Forward,
    /** The port the server listens on inside the container. */
    private readonly port: number,
  ) {}

  start(path: string): string {
    if (path === "" || path === "/") return "/";
    return path.startsWith("/") ? path : `/${path}`;
  }

  async answer(request: OriginRequest): Promise<OriginAnswer | undefined> {
    const response = await this.forward.fetch({
      port: this.port,
      method: request.method,
      url: request.url,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
    });
    return served(response);
  }
}

/** One `response` as the browser is to be given it: the hop's own headers dropped, and no status turned into `502`. */
export function served(response: ForwardResponse): OriginAnswer {
  if (response.status === 0) {
    return { status: NOT_REACHED_STATUS, headers: { "content-type": "text/plain; charset=utf-8" }, body: response.body };
  }
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    if (!HOP_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return { status: response.status, headers, body: response.body };
}

/** The path and query of a URL that is already one: everything before a `#`, which never reaches a server anyway. */
function pathnameOf(url: string): string {
  const query = url.indexOf("?");
  return query < 0 ? url : url.slice(0, query);
}

/**
 * The content type of a row, by its extension. A browser is strict about
 * these — a module served as `text/plain` does not run, a stylesheet does
 * not apply — so the list covers what a sheep writes and everything else
 * is bytes. A served look needs none of this: the server says its own.
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
