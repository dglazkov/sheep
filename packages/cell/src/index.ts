import { DurableObject } from "cloudflare:workers";

/**
 * One session's home. Phase 0 gives it a name and a database and nothing
 * else; the harness, workspace, shell, and wire arrive in later phases.
 */
export class SessionCell extends DurableObject<Env> {
  /** Reads one row from the cell's SQLite. The scaffold's proof of life. */
  ping(): { one: number; name: string } {
    const row = this.ctx.storage.sql.exec<{ one: number }>("SELECT 1 AS one").one();
    return { one: row.one, name: this.ctx.id.name ?? "" };
  }

  override async fetch(_request: Request): Promise<Response> {
    return Response.json(this.ping());
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/s\/([^/]+)/.exec(url.pathname);
    if (match) {
      const stub = env.SESSION_CELL.getByName(decodeURIComponent(match[1]!));
      return stub.fetch(request);
    }
    return new Response("lamb\n", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
