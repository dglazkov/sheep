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
 */
import { unknownPasture } from "./directory.ts";
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
      if ((await directory.get(id)) === undefined) return new Response("unknown session", { status: 404 });
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
    if (url.pathname === "/home" && request.method === "GET") {
      const budget = await directory.budget();
      return Response.json({ serverId: await directory.serverId(), container: env.PEN_CONTAINER !== undefined, ...budget });
    }
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
      if ((await directory.get(id)) === undefined) return new Response("unknown session", { status: 404 });
      const inner = new URL(request.url);
      inner.pathname = match[2] ?? "/";
      return env.SESSION_CELL.getByName(id).fetch(new Request(inner, request));
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
