/**
 * The collie's Worker (collie phase 1): the router in front of the one
 * object. The wire is the phase's contract with `packages/cli/src/collie/`:
 *
 *   GET  /                 200 text "collie\n"          no bearer
 *   GET  /home             the build, on, since, the rooms' count
 *   POST /passes {address} a pass redeemed: a room, or an agent handed over
 *   GET  /report           on, since, the limits, each room with whose word it takes and its agents
 *   GET  /log?since=&last= the narration
 *   POST /off, POST /on    the switch
 *   DELETE /               the end
 *
 * Every response carries `x-collie-build: <commit> <builtAt>`; every route
 * but `GET /` wants `Authorization: Bearer <COLLIE_TOKEN>` and answers 401 in
 * text without it; a refusal is JSON `{ "error": "<one sentence>" }`.
 */
import type { Answer } from "./collie.ts";

export { Collie } from "./collie.ts";

interface Build {
  commit: string;
  builtAt: string | null;
}

const CHECKOUT_BUILD: Build = { commit: "0.0.0-checkout", builtAt: null };

/** The stamp the Worker was built with: `COLLIE_BUILD` under a release, the checkout's value under `wrangler dev` and in the pool. */
function collieBuild(): Build {
  if (typeof COLLIE_BUILD === "undefined") return CHECKOUT_BUILD;
  try {
    const parsed = JSON.parse(COLLIE_BUILD) as Partial<Build>;
    if (typeof parsed.commit === "string" && parsed.commit !== "") return { commit: parsed.commit, builtAt: typeof parsed.builtAt === "string" ? parsed.builtAt : null };
  } catch {
    // a define that is not JSON: the checkout's
  }
  return CHECKOUT_BUILD;
}

function buildHeader(build: Build): string {
  return build.builtAt === null ? build.commit : `${build.commit} ${build.builtAt}`;
}

const refuse = (status: number, error: string) => Response.json({ error }, { status });

/** A whole number at least `min` from a query value, undefined when absent, null when it is not one. */
function count(value: string | null, min: number): number | undefined | null {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min ? n : null;
}

function answer<T>(result: Answer<T>): Response {
  return result.ok ? Response.json(result.value) : refuse(result.status, result.error);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;
  if (key === "GET /") return new Response("collie\n");
  const token = env.COLLIE_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return new Response("unauthorized\n", { status: 401 });
  const collie = env.COLLIE.getByName("collie");
  switch (key) {
    case "GET /home":
      return Response.json(await collie.home(collieBuild()));
    case "POST /passes": {
      const body = (await request.json().catch(() => null)) as { address?: unknown } | null;
      if (body === null || typeof body.address !== "string" || body.address.trim() === "") return refuse(400, "a pass is posted as { address }, the address isocan printed");
      return answer(await collie.passes(body.address));
    }
    case "GET /report":
      return Response.json(await collie.report());
    case "GET /log": {
      const since = count(url.searchParams.get("since"), 0);
      const last = count(url.searchParams.get("last"), 1);
      if (since === null) return refuse(400, "since is a row's seq, a whole number");
      if (last === null) return refuse(400, "last is a count of one or more");
      return Response.json(await collie.log(since, last));
    }
    case "POST /off":
      return Response.json(await collie.off());
    case "POST /on":
      return Response.json(await collie.on());
    case "DELETE /":
      return answer(await collie.end());
    default:
      return refuse(404, `the collie has no route ${key}`);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, env);
    } catch (error) {
      response = refuse(500, error instanceof Error ? error.message : String(error));
    }
    const headers = new Headers(response.headers);
    headers.set("x-collie-build", buildHeader(collieBuild()));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
