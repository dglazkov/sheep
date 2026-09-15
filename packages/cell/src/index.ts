/**
 * The Worker: the door and the router. A bearer token per home guards
 * everything; `/sessions` is the Directory's; `/s/<id>/...` is that cell's.
 * One route is not the home token's: `/s/<id>/pen`, the WebSocket a
 * container dials with the token its cell minted for it, which the cell
 * checks itself. Nothing else reaches a cell without the home's token.
 *
 * Pasture phase 0: `/pastures` is the Directory's list of names, and
 * `/p/<name>/...` is that pasture's object: its meta and herd, its tree,
 * and its secrets' names. No route returns a secret's value.
 *
 * Station phase 0: `GET /home` carries `build`, the stamp `scripts/bundle.mjs`
 * defined into the released Worker as `SHEEP_BUILD`; a checkout reports
 * `0.0.0-checkout`, and the CLI's `sheep home` compares it to its own.
 * Station phase 2: `GET /home` carries `image` too, the pen image the
 * release's config names, defined in as `SHEEP_IMAGE` beside the stamp,
 * since nothing on the platform tells a container its own digest; a
 * checkout reports `null`.
 * Eyes phase 1: `GET /home` carries `eyes`, whether the Worker has the
 * browser binding, asked of the one place that decides (`hasEyes`), so
 * `sheep home` can print it beside the container.
 * Earmark phase 0: `POST /sessions` takes `secrets`, name to value, and
 * refuses a bad one before any row; the answer, like `GET /sessions`,
 * carries the names and never a value.
 * Fold phase 1: `GET /p/<name>/` carries `cache`, the pasture's cache as
 * its object's row says it (size, files, the `setup.sh` it is for, when,
 * by whom, and whether that script is the tree's now), or `null`.
 * Bleat phase 0: `GET /sessions/<id>` is one sheep's row, the Directory's
 * and never a cell's, so a dog can ask what a sheep is waiting on while
 * the cell is held by the very setup it is waiting on.
 * Stile phase 2: `POST /join` is the second machine's way in, and the one
 * route the home's token does not guard. A machine that can write this
 * station's KV namespace owns the account: it writes the key
 * `join:<sha256 of a join token>` through the account API and asks here
 * with the token as the bearer, and the home deletes the key and answers
 * `{ token }`, its own, once. Anything else — no `JOIN` binding, no
 * bearer, a bearer whose key is not there — is the same bare 404 as a
 * route that does not exist, saying nothing. A KV write is not a Worker
 * version, so nothing running here restarts (issue #10).
 * Drove phase 1: `POST /s/<id>/sh` is forwarded like the cell's other
 * routes, under the home's token: the peek, one line in that sheep's shell
 * for the dog, answered `{ stdout, stderr, exit }`, a 409 and a sentence
 * while a turn is open.
 * Shear phase 0: every response the Worker returns carries
 * `x-sheep-build: <commit> <builtAt>`, set once where `fetch` returns, so
 * any command hears which build answered it; a WebSocket's 101 too.
 * Hill phase 0: the door for a browser, which never holds the home's token.
 * `POST /hill/passes`, under the bearer, mints a pass and answers `{ url,
 * expires }`, the url `<this request's origin>/hill/?pass=<pass>`, good for
 * two minutes and one take. `GET /hill/seat?pass=`, before the door as
 * `/join` is, takes it: a 204 with the seat cookie, named `sheep-seat-` and
 * 12 hex of the sha256 of the home's serverId so two homes on one host keep
 * their own (`HttpOnly;
 * Secure; SameSite=Strict; Path=/`, thirty days), or a 403 and the gate's
 * one sentence for a pass used or expired. `DELETE /hill/seat`, before the
 * door too, deletes the cookie's seat and clears it: sign out. And the door
 * admits a seat: a request with no bearer and no `?token=` whose cookie's
 * sha256 is a seat's row is admitted if it is a `GET` or `HEAD` that carries
 * no `Upgrade` header, and is the bare 401 otherwise. The upgrade is the one
 * GET that is not a read: `/s/<id>/ws` is pi's protocol, which writes. The
 * seat is asked of the Directory before any cell is reached.
 * Hill phase 1: the page, before the door, since a browser with no seat must
 * meet the gate and not the 401. `GET` and `HEAD` of `/hill` are a 302 to
 * `/hill/`, and of anything under `/hill/` but the seat and the passes are
 * the `HILL` assets binding's: a built file for a file's path, `index.html`
 * for every other path (the Worker maps `/hill/<file>` to the binding's
 * `/<file>`, and asks for `/index.html` when that is not a file), so a
 * pasted or reloaded address opens the page. `index.html` is served
 * `no-store`, with no referrer and a policy of `'self'` and no frames; every
 * file with `nosniff`. A binding with no `index.html` (a checkout never
 * built) answers a small gate that says `pnpm build`. `GET /` from a
 * browser, an `Accept` naming `text/html`, is a 302 to `/hill/`; from
 * anything else it is `sheep\n` as it was.
 */
import { type Budget, mintSecrets, PASS_EXPIRED, PASS_USED, SEAT_MS, seatCookieName, unknownPasture, unknownSession } from "./directory.ts";
import { hasEyes } from "./eyes/eyes.ts";
import { NO_BUILD } from "./hill-words.ts";
import { type FauxProgram, isFauxProgram } from "./models.ts";
import { badPastureName, isPastureName, isSecretName } from "./pasture.ts";

export { SessionCell } from "./cell.ts";
export { Directory } from "./directory.ts";
export { Pasture } from "./pasture.ts";
export { PenContainer } from "./pen/container.ts";

function unauthorized(reason: string): Response {
  return new Response(reason, { status: 401 });
}

/**
 * The door. A bearer, or a `?token=`, decides alone when either is there: a wrong one is the 401 whatever cookie rides with
 * it. With neither (hill phase 0), this home's seat cookie (`sheep-seat-<12 hex of its serverId's sha256>`; another home's on
 * the same host is ignored) whose seat stands admits a read, a `GET` or a `HEAD` with no
 * `Upgrade` header, and nothing else; every other request with only a seat is the same bare 401 a missing bearer gets.
 */
async function admitted(request: Request, env: Env): Promise<Response | undefined> {
  if (env.SHEEP_TOKEN === undefined || env.SHEEP_TOKEN === "") {
    if (env.SHEEP_ALLOW_ANONYMOUS === "1") return undefined;
    return new Response("this home has no SHEEP_TOKEN; set one, or SHEEP_ALLOW_ANONYMOUS=1 for local use", { status: 503 });
  }
  const header = request.headers.get("authorization");
  const query = new URL(request.url).searchParams.get("token");
  if (header !== null || query !== null) {
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : query;
    if (token !== env.SHEEP_TOKEN) return unauthorized("bad or missing token");
    return undefined;
  }
  const seat = seatOf(request, await seatName(env));
  if (seat === undefined) return unauthorized("bad or missing token");
  if (!isRead(request)) return unauthorized("bad or missing token");
  if (!(await env.DIRECTORY.getByName("home").seated(seat))) return unauthorized("bad or missing token");
  return undefined;
}

/** What a seat alone may ask (hill phase 0): a `GET` or `HEAD` that asks for no upgrade of any kind. */
function isRead(request: Request): boolean {
  return (request.method === "GET" || request.method === "HEAD") && request.headers.get("upgrade") === null;
}

/** A seat's shape: 32 bytes as lowercase hex. */
const SEAT_SHAPE = /^[0-9a-f]{64}$/;

/** This home's seat cookie name, learned from the Directory's serverId once per isolate: one Worker is one home. */
let homeSeatName: string | undefined;
async function seatName(env: Env): Promise<string> {
  homeSeatName ??= await seatCookieName(await env.DIRECTORY.getByName("home").serverId());
  return homeSeatName;
}

/** This home's seat cookie's value when it is the shape of a seat; `undefined` otherwise, which no seat row can be. Another home's cookie is not read. */
function seatOf(request: Request, name: string): string | undefined {
  const cookies = request.headers.get("cookie");
  if (cookies === null) return undefined;
  for (const part of cookies.split(";")) {
    const at = part.indexOf("=");
    if (at === -1 || part.slice(0, at).trim() !== name) continue;
    const value = part.slice(at + 1).trim();
    if (SEAT_SHAPE.test(value)) return value;
  }
  return undefined;
}

/** The cookie's attributes (hill phase 0): the station's origin alone, no script, no other site, thirty days or none. */
function seatCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

/**
 * `GET /hill/seat?pass=` (hill phase 0): the pass taken, a 204 that sets the seat's cookie; or a 403 and the gate's sentence
 * for a pass used or expired. A missing pass is a used one.
 */
async function seatAnswer(request: Request, env: Env): Promise<Response> {
  const pass = new URL(request.url).searchParams.get("pass");
  const taken = pass === null || pass === "" ? ({ taken: "used" } as const) : await env.DIRECTORY.getByName("home").takePass(pass);
  const noStore = { "cache-control": "no-store" };
  if (taken.taken === "used") return new Response(PASS_USED, { status: 403, headers: noStore });
  if (taken.taken === "expired") return new Response(PASS_EXPIRED, { status: 403, headers: noStore });
  return new Response(null, { status: 204, headers: { ...noStore, "set-cookie": seatCookie(await seatName(env), taken.seat, SEAT_MS / 1000) } });
}

/** `DELETE /hill/seat` (hill phase 0): sign out. The cookie's seat deleted, if it had one, and the cookie cleared; a 204 either way. */
async function leaveAnswer(request: Request, env: Env): Promise<Response> {
  const name = await seatName(env);
  const seat = seatOf(request, name);
  if (seat !== undefined) await env.DIRECTORY.getByName("home").leave(seat);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", "set-cookie": seatCookie(name, "", 0) } });
}

/**
 * The page's policy (hill phase 1): scripts, styles, the icon, and requests from this origin alone, and never inside a
 * frame. The page has no inline script or style and no remote font, so it needs nothing more.
 */
const HILL_POLICY = "default-src 'self'; frame-ancestors 'none'";

/** What every hill response carries, and what `index.html` carries besides: the address held a pass a moment ago. */
const HILL_FILE_HEADERS = { "x-content-type-options": "nosniff" };
const HILL_PAGE_HEADERS = { ...HILL_FILE_HEADERS, "cache-control": "no-store", "referrer-policy": "no-referrer", "content-security-policy": HILL_POLICY };

/** Whether a path is the hill's page, served before the door: `/hill` and under it, but the seat and the passes, which are routes. */
function isHillPage(pathname: string): boolean {
  if (pathname === "/hill/seat" || pathname === "/hill/passes") return false;
  return pathname === "/hill" || pathname.startsWith("/hill/");
}

/** An asset's response made again around its body, its headers kept and the hill's laid over them; a `HEAD` gets no body. */
function hillResponse(asset: Response, method: string, headers: Record<string, string>): Response {
  const merged = new Headers(asset.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  return new Response(method === "HEAD" ? null : asset.body, { status: asset.status, statusText: asset.statusText, headers: merged });
}

/** The gate a checkout with no build answers: one sentence, no script, and the page's own headers. */
function noBuild(method: string): Response {
  const body = `<!doctype html>\n<meta charset="utf-8">\n<title>the hill</title>\n<p>${NO_BUILD.replace("pnpm build", "<code>pnpm build</code>")}</p>\n`;
  return new Response(method === "HEAD" ? null : body, { status: 503, headers: { ...HILL_PAGE_HEADERS, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; frame-ancestors 'none'" } });
}

/**
 * `GET` or `HEAD` of the hill's page (hill phase 1), before the door. `/hill` is a 302 to `/hill/`, its query kept. Under
 * `/hill/`, a path that is a built file is that file, `nosniff` and revalidated; any other is `index.html`, for the page
 * to route. The binding is asked for `/<file>` with the prefix taken off, since the built directory is the page's root.
 */
export async function hillAnswer(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  if (url.pathname === "/hill") return new Response(null, { status: 302, headers: { ...HILL_FILE_HEADERS, location: `/hill/${url.search}` } });
  const assets = env.HILL;
  if (assets === undefined) return noBuild(method);
  const rest = url.pathname.slice("/hill".length);
  if (rest !== "/") {
    const conditional = request.headers.get("if-none-match");
    // The path set on a URL of this origin, never resolved against it: `//elsewhere` stays a path.
    const at = new URL(url.origin);
    at.pathname = rest;
    const file = await assets.fetch(new Request(at, { headers: conditional === null ? {} : { "if-none-match": conditional } }));
    if (file.status === 200 || file.status === 304) return hillResponse(file, method, { ...HILL_FILE_HEADERS, "cache-control": "no-cache" });
    await file.body?.cancel();
  }
  const page = await assets.fetch(new Request(new URL("/index.html", url.origin)));
  if (page.status !== 200) {
    await page.body?.cancel();
    return noBuild(method);
  }
  return hillResponse(page, method, HILL_PAGE_HEADERS);
}

/** Whether `GET /` is a browser's (hill phase 1): an `Accept` that names `text/html`. No command's `Accept` does. */
function wantsPage(request: Request): boolean {
  return /\btext\/html\b/i.test(request.headers.get("accept") ?? "");
}

/** The key a join token is looked up by: `join:` and the hex of its SHA-256. The raw token is never stored, and never compared. */
export async function joinKey(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return `join:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * `POST /join` (stile phase 2): the home's token to a bearer whose key is
 * in the `JOIN` namespace, the key deleted first so the token is good for
 * one ask; `undefined` otherwise, which the router answers as it answers
 * any route it does not have. The account token never comes here: writing
 * the key is the proof, and the join token is all that travels.
 */
export async function joinAnswer(request: Request, env: Env): Promise<Response | undefined> {
  const store = env.JOIN;
  const token = env.SHEEP_TOKEN;
  if (store === undefined || token === undefined || token === "") return undefined;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return undefined;
  const bearer = header.slice("Bearer ".length);
  if (bearer === "") return undefined;
  const key = await joinKey(bearer);
  if ((await store.get(key)) === null) return undefined;
  await store.delete(key);
  return Response.json({ token }, { headers: { "cache-control": "no-store" } });
}

/** `GET /home`'s `build`: what `scripts/bundle.mjs` defined at release, or the checkout's value when nothing was defined. */
export interface HomeBuild {
  commit: string;
  builtAt: string | null;
}

export const CHECKOUT_BUILD: HomeBuild = { commit: "0.0.0-checkout", builtAt: null };

/**
 * The pen image this Worker's config names (station phase 2): `SHEEP_IMAGE`
 * under a release, `docker.io/dglazkov2/sheep-pen@sha256:…` when the
 * release knew the digest and `…:<commit>` when it named the tag; `null`
 * from a checkout, whose container is a Dockerfile.
 */
export function homeImage(): string | null {
  if (typeof SHEEP_IMAGE === "undefined") return null;
  return typeof SHEEP_IMAGE === "string" && SHEEP_IMAGE !== "" ? SHEEP_IMAGE : null;
}

/** The stamp the Worker was built with: `SHEEP_BUILD` under a release, the checkout's value under `wrangler dev` and in the test pool. */
export function homeBuild(): HomeBuild {
  if (typeof SHEEP_BUILD === "undefined") return CHECKOUT_BUILD;
  try {
    const parsed = JSON.parse(SHEEP_BUILD) as Partial<HomeBuild>;
    if (typeof parsed.commit === "string" && parsed.commit !== "") return { commit: parsed.commit, builtAt: typeof parsed.builtAt === "string" ? parsed.builtAt : null };
  } catch {
    // a define that is not JSON: reported as the checkout's, below
  }
  return CHECKOUT_BUILD;
}

/**
 * The header every response carries (shear phase 0), so any command hears the home's build without asking `GET /home`.
 * Not exported: workerd reads every export of the Worker's module as a handler or a class, and refuses a string.
 */
const BUILD_HEADER = "x-sheep-build";

/** The header's value: the stamp's commit and time separated by a space; the commit alone where there is no time (a checkout). */
export function buildHeader(build: HomeBuild = homeBuild()): string {
  return build.builtAt === null ? build.commit : `${build.commit} ${build.builtAt}`;
}

/**
 * A response with the header set (shear phase 0), in the one place the
 * Worker's `fetch` hands a response back. A response from a Durable
 * Object's stub has immutable headers, so it is made again around the same
 * body; a WebSocket upgrade's 101 is made again around the same socket,
 * which is the only way a 101 can be built.
 */
export function stamped(response: Response): Response {
  const value = buildHeader();
  try {
    response.headers.set(BUILD_HEADER, value);
    return response;
  } catch {
    // immutable headers: a stub's response
  }
  const headers = new Headers(response.headers);
  headers.set(BUILD_HEADER, value);
  if (response.webSocket) return new Response(null, { status: response.status, statusText: response.statusText, webSocket: response.webSocket, headers });
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** `GET /home`'s body: what this home has, for `sheep home` to print. */
export interface HomeReport extends Budget {
  serverId: string;
  /** Whether a container can be rented here: `PEN_CONTAINER` is bound. */
  container: boolean;
  /** Whether this home has eyes: `BROWSER` is bound, so every sheep's shell has `look` (eyes phase 1). */
  eyes: boolean;
  build: HomeBuild;
  image: string | null;
}

/** The report for one env: the Directory's server id and budget, and what the bindings say the home has. */
export async function homeReport(env: Env): Promise<HomeReport> {
  const directory = env.DIRECTORY.getByName("home");
  const budget = await directory.budget();
  return { serverId: await directory.serverId(), container: env.PEN_CONTAINER !== undefined, eyes: hasEyes(env), build: homeBuild(), image: homeImage(), ...budget };
}

const PEN_DOOR = /^\/s\/([^/]+)\/pen$/;
/** Bleat phase 0: one sheep's Directory row, beside the list. */
const SESSION_ROW = /^\/sessions\/([^/]+)$/;
const PASTURE = /^\/p\/([^/]+)(\/.*)?$/;

/** A pasture's routes, after the name is known to the Directory. */
async function pastureRoute(request: Request, env: Env, name: string, path: string): Promise<Response> {
  const directory = env.DIRECTORY.getByName("home");
  const pasture = env.PASTURE.getByName(name);
  const method = request.method;
  if (path === "/" && method === "GET") {
    const meta = await pasture.meta();
    // Fold phase 1: the cache as its row says it, `null` when none was kept; never a chunk.
    return Response.json({ ...(meta ?? { name, repo: null, branch: null, createdAt: null }), herd: await directory.herd(name), cache: await pasture.cacheSummary() });
  }
  if (path === "/tree" && method === "GET") return Response.json(await pasture.manifest());
  if (path.startsWith("/tree/")) {
    const treePath = decodeURIComponent(path.slice("/tree/".length));
    if (method === "GET") {
      let content: Uint8Array | undefined;
      try {
        content = await pasture.read(treePath);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("EISDIR")) return new Response(`${treePath} is a directory; GET /tree lists it`, { status: 409 });
        throw error;
      }
      if (content === undefined) return new Response(`no ${treePath} in pasture ${name}`, { status: 404 });
      return new Response(content, { headers: { "content-type": "application/octet-stream" } });
    }
    if (method === "PUT") {
      try {
        const entry = await pasture.put(treePath, new Uint8Array(await request.arrayBuffer()));
        return Response.json(entry);
      } catch (error) {
        // The object's `FsError` arrives over RPC as an Error whose message begins with the code.
        if (error instanceof Error && /^E[A-Z]+:/.test(error.message)) return new Response(error.message, { status: error.message.startsWith("EFBIG") ? 413 : 400 });
        throw error;
      }
    }
    if (method === "DELETE") {
      if (!(await pasture.rm(treePath))) return new Response(`no ${treePath} in pasture ${name}`, { status: 404 });
      return new Response(null, { status: 204 });
    }
  }
  if (path === "/secrets" && method === "GET") return Response.json(await pasture.secretNames());
  if (path.startsWith("/secrets/") && method === "PUT") {
    const key = decodeURIComponent(path.slice("/secrets/".length));
    if (!isSecretName(key)) return new Response(`a secret's name is an environment variable's, not ${JSON.stringify(key)}`, { status: 400 });
    await pasture.setSecret(key, await request.text());
    return new Response(null, { status: 204 });
  }
  // A secret's value has no route: `GET /secrets/<KEY>` is not found, by design.
  return new Response("not found", { status: 404 });
}

/** Every route the Worker has; the default export's `fetch` stamps what it answers. */
const router = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    // `/` (hill phase 1): a browser is sent to the hill; everything else hears `sheep`, as every command has.
    if (url.pathname === "/" && request.method === "GET") return wantsPage(request) ? new Response(null, { status: 302, headers: { location: "/hill/" } }) : new Response("sheep\n");
    const directory = env.DIRECTORY.getByName("home");

    // The container's door, before the home's: the cell checks the minted token, and only this path passes.
    const door = PEN_DOOR.exec(url.pathname);
    if (door && request.method === "GET") {
      const id = decodeURIComponent(door[1]!);
      if ((await directory.get(id)) === undefined) return new Response(unknownSession(id), { status: 404 });
      const inner = new URL(request.url);
      inner.pathname = "/pen";
      return env.SESSION_CELL.getByName(id).fetch(new Request(inner, request));
    }

    // The join (stile phase 2), before the home's door: the one route the home's token does not guard. Refused, it is the
    // router's own bare 404, so a prober learns nothing of whether a join is open.
    if (url.pathname === "/join" && request.method === "POST") return (await joinAnswer(request, env)) ?? new Response("not found", { status: 404 });

    // The hill's seat (hill phase 0), before the home's door as the join is: taken with a pass, given up with the cookie.
    if (url.pathname === "/hill/seat" && request.method === "GET") return seatAnswer(request, env);
    if (url.pathname === "/hill/seat" && request.method === "DELETE") return leaveAnswer(request, env);
    // The page itself (hill phase 1), before the door too: a browser with no seat meets the gate, not the 401. It carries
    // nothing secret; what it shows comes from the routes behind the door.
    if (isHillPage(url.pathname) && (request.method === "GET" || request.method === "HEAD")) return hillAnswer(request, env);

    const refused = await admitted(request, env);
    if (refused) return refused;

    // A pass (hill phase 0), under the bearer: the link a browser climbs the hill with, at the origin this request reached.
    if (url.pathname === "/hill/passes" && request.method === "POST") {
      const { pass, expires } = await directory.mintPass();
      return Response.json({ url: `${url.origin}/hill/?pass=${pass}`, expires }, { status: 201, headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/sessions" && request.method === "POST") {
      const body = ((await request.json().catch(() => ({}))) ?? {}) as { name?: unknown; pasture?: unknown; secrets?: unknown };
      const name = typeof body.name === "string" && body.name.length > 0 ? body.name : null;
      const pasture = typeof body.pasture === "string" && body.pasture.length > 0 ? body.pasture : null;
      if (pasture !== null && !isPastureName(pasture)) return new Response(badPastureName(pasture), { status: 400 });
      // The sheep's own secrets (earmark phase 0), refused before any row and before any hop: a sentence and a 400, as the
      // pasture's secret routes refuse, naming a name at most and never a value.
      const secrets = mintSecrets(body.secrets, pasture);
      if ("refused" in secrets) return new Response(secrets.refused, { status: 400 });
      // The Directory's refusal, before any cell exists; its sentence is the whole body.
      const refusal = pasture === null ? undefined : await directory.refusal(pasture);
      if (refusal !== undefined) return new Response(refusal, { status: 409 });
      // The mint (mint phase 0): the row, and nothing else. No cell is addressed: it boots on the first thing that asks
      // it, as after an eviction, and a sheep born into a pasture with a repository is born inside that first boot. The
      // secrets are rows beside it, written in the same call (earmark phase 0).
      return Response.json(await directory.create(name, pasture, secrets.secrets), { status: 201 });
    }
    if (url.pathname === "/sessions" && request.method === "GET") {
      const pasture = url.searchParams.get("pasture");
      return Response.json(pasture === null ? await directory.list() : await directory.herd(pasture));
    }
    // Bleat phase 0: one sheep's row, the Directory's and never a cell's. A dog asking what its sheep is waiting on is
    // answered in a millisecond whatever the cell is doing, which is the whole reason the live setup state lives here.
    const one = SESSION_ROW.exec(url.pathname);
    if (one && request.method === "GET") {
      const id = decodeURIComponent(one[1]!);
      const summary = await directory.get(id);
      if (summary === undefined) return new Response(unknownSession(id), { status: 404 });
      return Response.json(summary);
    }
    if (url.pathname === "/home" && request.method === "GET") return Response.json(await homeReport(env));
    if (url.pathname === "/faux" && request.method === "POST" && env.SHEEP_PROVIDER === "faux") {
      // Test-only: the program every cell without one of its own answers from.
      const program: unknown = await request.json();
      if (program !== null && !isFauxProgram(program)) return new Response("a faux program is { steps: [{ text | tool: { name, args } | system: true, delayMs? }, …] }", { status: 400 });
      await directory.setFauxProgram(program as FauxProgram | null);
      return Response.json({ steps: program === null ? 0 : (program as FauxProgram).steps.length });
    }

    if (url.pathname === "/pastures" && request.method === "GET") return Response.json(await directory.pastures());
    if (url.pathname === "/pastures" && request.method === "POST") {
      const body = ((await request.json().catch(() => ({}))) ?? {}) as { name?: unknown; repo?: unknown; branch?: unknown };
      if (!isPastureName(body.name)) return new Response(badPastureName(typeof body.name === "string" ? body.name : String(body.name)), { status: 400 });
      const repo = typeof body.repo === "string" && body.repo.length > 0 ? body.repo : null;
      const branch = typeof body.branch === "string" && body.branch.length > 0 ? body.branch : null;
      const createdAt = Date.now();
      if (!(await directory.registerPasture(body.name, createdAt))) return new Response(`a pasture named ${body.name} is already at this home`, { status: 409 });
      return Response.json(await env.PASTURE.getByName(body.name).init({ repo, branch, createdAt }), { status: 201 });
    }
    const grazing = PASTURE.exec(url.pathname);
    if (grazing) {
      const name = decodeURIComponent(grazing[1]!);
      if (!isPastureName(name)) return new Response(badPastureName(name), { status: 400 });
      if (!(await directory.hasPasture(name))) return new Response(unknownPasture(name), { status: 404 });
      return pastureRoute(request, env, name, grazing[2] ?? "/");
    }

    const match = /^\/s\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      // The sentence for a session this home does not have: every verb that asks over HTTP gets it, `rm` again included.
      if ((await directory.get(id)) === undefined) return new Response(unknownSession(id), { status: 404 });
      const inner = new URL(request.url);
      inner.pathname = match[2] ?? "/";
      const cell = env.SESSION_CELL.getByName(id);
      if (request.method === "DELETE" && inner.pathname === "/") {
        // The end (end phase 0): the cell's end first, the row after and only then. A row removed first would make a failed
        // end unreachable, its storage and container orphaned; removed last, a failed end is the cell's 500 with its sentence,
        // the row stays, and the dog asks again.
        const ended = await cell.fetch(new Request(inner, request));
        if (!ended.ok) return ended;
        await directory.remove(id);
        return ended;
      }
      return cell.fetch(new Request(inner, request));
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export default {
  async fetch(request, env): Promise<Response> {
    return stamped(await router.fetch(request, env));
  },
} satisfies ExportedHandler<Env>;
