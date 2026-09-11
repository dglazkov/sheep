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
 */
import { type Budget, unknownPasture, unknownSession } from "./directory.ts";
import { hasEyes } from "./eyes/eyes.ts";
import { type FauxProgram, isFauxProgram } from "./models.ts";
import { badPastureName, isPastureName, isSecretName } from "./pasture.ts";

export { SessionCell } from "./cell.ts";
export { Directory } from "./directory.ts";
export { Pasture } from "./pasture.ts";
export { PenContainer } from "./pen/container.ts";

function unauthorized(reason: string): Response {
  return new Response(reason, { status: 401 });
}

function admitted(request: Request, env: Env): Response | undefined {
  if (env.SHEEP_TOKEN === undefined || env.SHEEP_TOKEN === "") {
    if (env.SHEEP_ALLOW_ANONYMOUS === "1") return undefined;
    return new Response("this home has no SHEEP_TOKEN; set one, or SHEEP_ALLOW_ANONYMOUS=1 for local use", { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : new URL(request.url).searchParams.get("token");
  if (token !== env.SHEEP_TOKEN) return unauthorized("bad or missing token");
  return undefined;
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
const PASTURE = /^\/p\/([^/]+)(\/.*)?$/;

/** A pasture's routes, after the name is known to the Directory. */
async function pastureRoute(request: Request, env: Env, name: string, path: string): Promise<Response> {
  const directory = env.DIRECTORY.getByName("home");
  const pasture = env.PASTURE.getByName(name);
  const method = request.method;
  if (path === "/" && method === "GET") {
    const meta = await pasture.meta();
    return Response.json({ ...(meta ?? { name, repo: null, branch: null, createdAt: null }), herd: await directory.herd(name) });
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

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") return new Response("sheep\n");
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

    const refused = admitted(request, env);
    if (refused) return refused;

    if (url.pathname === "/sessions" && request.method === "POST") {
      const body = ((await request.json().catch(() => ({}))) ?? {}) as { name?: unknown; pasture?: unknown };
      const name = typeof body.name === "string" && body.name.length > 0 ? body.name : null;
      const pasture = typeof body.pasture === "string" && body.pasture.length > 0 ? body.pasture : null;
      if (pasture !== null && !isPastureName(pasture)) return new Response(badPastureName(pasture), { status: 400 });
      // The Directory's refusal, before any cell exists; its sentence is the whole body.
      const refusal = pasture === null ? undefined : await directory.refusal(pasture);
      if (refusal !== undefined) return new Response(refusal, { status: 409 });
      const summary = await directory.create(name, pasture);
      // Boot the cell now so the session exists even if the terminal dies before rendering.
      await env.SESSION_CELL.getByName(summary.id).fetch(new Request("https://cell/"));
      return Response.json(summary, { status: 201 });
    }
    if (url.pathname === "/sessions" && request.method === "GET") {
      const pasture = url.searchParams.get("pasture");
      return Response.json(pasture === null ? await directory.list() : await directory.herd(pasture));
    }
    if (url.pathname === "/home" && request.method === "GET") return Response.json(await homeReport(env));
    if (url.pathname === "/faux" && request.method === "POST" && env.SHEEP_PROVIDER === "faux") {
      // Test-only: the program every cell without one of its own answers from.
      const program: unknown = await request.json();
      if (program !== null && !isFauxProgram(program)) return new Response("a faux program is { steps: [{ text | tool: { name, args }, delayMs? }, …] }", { status: 400 });
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
