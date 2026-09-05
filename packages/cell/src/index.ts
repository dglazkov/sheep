/**
 * The Worker: the door and the router. A bearer token per home guards
 * everything; `/sessions` is the Directory's; `/s/<id>/...` is that cell's.
 */
import { type FauxProgram, isFauxProgram } from "./models.ts";

export { SessionCell } from "./cell.ts";
export { Directory } from "./directory.ts";

function unauthorized(reason: string): Response {
  return new Response(reason, { status: 401 });
}

function admitted(request: Request, env: Env): Response | undefined {
  if (env.LAMB_TOKEN === undefined || env.LAMB_TOKEN === "") {
    if (env.LAMB_ALLOW_ANONYMOUS === "1") return undefined;
    return new Response("this home has no LAMB_TOKEN; set one, or LAMB_ALLOW_ANONYMOUS=1 for local use", { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : new URL(request.url).searchParams.get("token");
  if (token !== env.LAMB_TOKEN) return unauthorized("bad or missing token");
  return undefined;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") return new Response("lamb\n");
    const refused = admitted(request, env);
    if (refused) return refused;

    const directory = env.DIRECTORY.getByName("home");
    if (url.pathname === "/sessions" && request.method === "POST") {
      const body = ((await request.json().catch(() => ({}))) ?? {}) as { name?: unknown };
      const name = typeof body.name === "string" && body.name.length > 0 ? body.name : null;
      const summary = await directory.create(name);
      // Boot the cell now so the session exists even if the terminal dies before rendering.
      await env.SESSION_CELL.getByName(summary.id).fetch(new Request("https://cell/"));
      return Response.json(summary, { status: 201 });
    }
    if (url.pathname === "/sessions" && request.method === "GET") return Response.json(await directory.list());
    if (url.pathname === "/home" && request.method === "GET") return Response.json({ serverId: await directory.serverId() });
    if (url.pathname === "/faux" && request.method === "POST" && env.LAMB_PROVIDER === "faux") {
      // Test-only: the program every cell without one of its own answers from.
      const program: unknown = await request.json();
      if (program !== null && !isFauxProgram(program)) return new Response("a faux program is { steps: [{ text | tool: { name, args }, delayMs? }, …] }", { status: 400 });
      await directory.setFauxProgram(program as FauxProgram | null);
      return Response.json({ steps: program === null ? 0 : (program as FauxProgram).steps.length });
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
