/**
 * The fakes: the fake account API and the fake station that
 * `deploy.test.ts` has driven since station phase 1, factored out here so
 * the stile's screen harness drives the same three (with
 * `fake-wrangler.mjs`, which is already its own file) rather than a
 * second set of its own. A second fake would be a second thing to keep
 * true; one is the account's shapes as they answered on 7 Sep 2026, in
 * one place.
 *
 * Nothing here spawns anything, which is why it is a helper and not a
 * test file: what spawns is the ring's business, and both rings that use
 * these run the built command as a child.
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export const ACCOUNT = { id: "6821ca17f9f0938585204d69dd050445", name: "Fake's Account" };
/**
 * The two values, made of no word that is on any screen (stile phase 1): the stile's harness looks for any eight of
 * their characters in a row in the terminal's buffer, so a value spelled "cloudflare" would be found in the prompt
 * that asks for it. They share no run of eight with each other either.
 */
export const TOKEN = "cfQ7mR2vX9pL4zN8bW3kJ6hT1yF5cD0gAe";
export const KEY = "sk-ant-u4Hq9Zt2Lw7Ec5Vn1Rb8Ym3Xk6Pj0Sg";
export const STAMP = { commit: "2b71e46", builtAt: "2026-09-07T23:30:00Z" };
/**
 * What the account's own registry answers with once the platform has mirrored a container image into it (11 Sep 2026):
 * the application is configured with `registry.cloudflare.com/<account>/<name>@sha256:<a different digest>`, the manifest
 * having been re-uploaded, and the Docker Hub rollouts are marked `replaced`.
 */
export const MIRRORED = `registry.cloudflare.com/${ACCOUNT.id}/blog@sha256:c6dc1888e1a0f2d3c4b5a6978899aabbccddeeff00112233445566778899aabb`;

export interface FakeState {
  plan: "workers_paid" | "free";
  subdomain: string | undefined;
  /** What a `PUT` of the subdomain answers: the name, or an error the API would send. */
  subdomainPut: "ok" | "taken";
  workers: string[];
  /** An application: `image` is what its configuration names; `pending` and `rollout` while a redeploy with a new image rolls out. */
  applications: { id: string; name: string; image?: string; pending?: string; rollout?: { status: string; target: string } }[];
  /** What an application's health answers: healthy at once, `starting` on the first poll and healthy after, or failed. */
  health: "healthy" | "starting-then-healthy" | "failed";
  polls: number;
  /**
   * What a redeploy with a new image does (station phase 3): the image set at once; a rollout whose first step runs, then
   * a gap before the second, then both done and the image moved on the third poll; the same, except that the platform
   * mirrors the image into its own registry and the configuration ends up naming that instead (11 Sep 2026); one whose
   * second step stays under way with the image not moved; one that `failed`; or an API that drops the connection on every
   * rollouts read.
   */
  rollout: "none" | "progressing-then-completed" | "mirrored" | "rolling-stays" | "failed" | "dies";
  rolloutPolls: number;
  deploys: { name: string; container: string; image: string; vars: string[]; kv: { binding: string; id?: string }[] }[];
  /** Each Worker's secret names, as the fake wrangler's `secret put` registers them: never a value, as the real API answers. */
  secrets: Record<string, string[]>;
  /**
   * The account's KV namespaces (stile phase 2, the join store), as the API lists, makes, and deletes them, each with
   * its keys: the value and the `expiration_ttl` it was written with. The fake station reads the namespace titled
   * `<worker>-join` as its `JOIN` binding, as the cell reads its own.
   */
  kv: { id: string; title: string; values: Record<string, { value: string; ttl: number | null }> }[];
  /**
   * What happened to join keys, in the order it happened, across the account and the station: `put <key> ttl <n>` and
   * `delete <key>` through the API, `ask <status>` and `ask deleted <key>` at the station. The order a join must keep.
   */
  events: string[];
  /** A KV key's delete refused by the API, as a token without Workers KV Storage (edit) would be: the join's failed delete. */
  kvDeleteFails?: boolean;
  requests: { method: string; path: string; auth: string | undefined }[];
}

export function fresh(): FakeState {
  return { plan: "workers_paid", subdomain: "fake", subdomainPut: "ok", workers: ["learner", "sheep", "sheep-pen"], applications: [{ id: "a03d94e0-75b4-454d-b8c8-4882bfcad73d", name: "sheep-pen" }], deploys: [], secrets: {}, kv: [], events: [], requests: [], health: "healthy", polls: 0, rollout: "none", rolloutPolls: 0 };
}

const json = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  let text = "";
  for await (const chunk of request) text += chunk;
  return text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);
};

const envelope = (response: ServerResponse, result: unknown, extra: Record<string, unknown> = {}) => response.end(JSON.stringify({ success: true, result, errors: [], messages: [], ...extra }));
const refuse = (response: ServerResponse, status: number, code: number, message: string) => {
  response.statusCode = status;
  response.end(JSON.stringify({ success: false, result: null, errors: [{ code, message }], messages: [] }));
};

/** The account API's shapes as the real one answered on 7 Sep 2026, over a state each test sets. */
export function fakeAccount(state: FakeState): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fake");
    const path = url.pathname;
    const auth = request.headers.authorization;
    // The fake wrangler's side door: what a deploy or a delete does to the account.
    if (path === "/_fake/deploy") {
      const body = (await json(request)) as { name: string; container: string; image: string; vars: string[]; kv: { binding: string; id?: string }[] };
      state.deploys.push(body);
      if (!state.workers.includes(body.name)) state.workers.push(body.name);
      const existing = state.applications.find((application) => application.name === body.container);
      if (existing === undefined) state.applications.push({ id: `app-${state.applications.length + 1}`, name: body.container, image: body.image });
      else if (state.rollout === "none" || existing.image === body.image) existing.image = body.image;
      else {
        // A new image: the platform starts a rollout, and the configuration keeps naming the old image until it completes (7 Sep 2026).
        existing.pending = body.image;
        existing.rollout = { status: "progressing", target: body.image };
        state.rolloutPolls = 0;
      }
      return response.end("{}");
    }
    if (path === "/_fake/secret") {
      const body = (await json(request)) as { name: string; secret: string };
      const held = state.secrets[body.name] ?? [];
      if (!held.includes(body.secret)) held.push(body.secret);
      state.secrets[body.name] = held;
      return response.end("{}");
    }
    if (path === "/_fake/delete") {
      const body = (await json(request)) as { name: string };
      state.workers = state.workers.filter((name) => name !== body.name);
      delete state.secrets[body.name];
      return response.end("{}");
    }
    state.requests.push({ method: request.method ?? "", path, auth });
    if (auth !== `Bearer ${TOKEN}`) return refuse(response, 400, 1000, "Invalid API Token");
    if (path === "/accounts" && request.method === "GET") return envelope(response, [ACCOUNT], { result_info: { page: 1, per_page: 20, total_pages: 1, count: 1, total_count: 1 } });
    if (path === `/accounts/${ACCOUNT.id}/tokens/verify`) return envelope(response, { id: "ba9eba10e50c777c170f3bcd7b13bcb6", status: "active" });
    if (path === `/accounts/${ACCOUNT.id}/subscriptions`) {
      return envelope(response, state.plan === "workers_paid" ? [{ id: "cdf9c255", state: "Paid", rate_plan: { id: "workers_paid", public_name: "Workers Paid" }, price: 5, currency: "USD", frequency: "monthly" }] : []);
    }
    if (path === `/accounts/${ACCOUNT.id}/workers/subdomain` && request.method === "GET") {
      return state.subdomain === undefined ? refuse(response, 404, 10007, "workers.api.error.not_found") : envelope(response, { subdomain: state.subdomain });
    }
    if (path === `/accounts/${ACCOUNT.id}/workers/subdomain` && request.method === "PUT") {
      const body = (await json(request)) as { subdomain: string };
      if (state.subdomainPut === "taken") return refuse(response, 400, 10036, "workers.api.error.subdomain_taken");
      state.subdomain = body.subdomain;
      return envelope(response, { subdomain: body.subdomain });
    }
    if (path === `/accounts/${ACCOUNT.id}/workers/scripts`) {
      // Two pages, to prove the listing is walked whole: the first holds all but the last Worker.
      const page = Number(url.searchParams.get("page") ?? "1");
      const pages = state.workers.length > 1 ? 2 : 1;
      const rows = pages === 1 ? state.workers : page === 1 ? state.workers.slice(0, -1) : state.workers.slice(-1);
      return envelope(
        response,
        rows.map((id) => ({ id, created_on: "2026-09-07T00:00:00Z" })),
        { result_info: { page, per_page: 100, total_pages: pages, count: rows.length, total_count: state.workers.length } },
      );
    }
    // A Worker's secret names (stile phase 0): what the puts registered, never a value; a Worker the account lacks is a 404.
    const holding = /^\/accounts\/[^/]+\/workers\/scripts\/([^/]+)\/secrets$/.exec(path);
    if (holding && request.method === "GET") {
      if (!state.workers.includes(holding[1]!)) return refuse(response, 404, 10007, "workers.api.error.script_not_found");
      return envelope(
        response,
        (state.secrets[holding[1]!] ?? []).map((name) => ({ name, type: "secret_text" })),
      );
    }
    if (path === `/accounts/${ACCOUNT.id}/containers/applications` && request.method === "GET") {
      state.polls++;
      // The health the API reports (7 Sep 2026): the ring's finding is that instances are provisioned after the deploy returns.
      const instances =
        state.health === "failed"
          ? { active: 0, assigned: 0, healthy: 0, stopped: 0, failed: 1, scheduling: 0, starting: 0 }
          : state.health === "starting-then-healthy" && state.polls <= 2
            ? { active: 0, assigned: 1, healthy: 0, stopped: 0, failed: 0, scheduling: 0, starting: 1 }
            : { active: 1, assigned: 2, healthy: 2, stopped: 0, failed: 0, scheduling: 0, starting: 0 };
      return envelope(
        response,
        state.applications.map(({ id, name, image, pending }) => ({
          id,
          name,
          account_id: ACCOUNT.id,
          version: pending === undefined ? 2 : 1,
          configuration: { image: image ?? "registry.cloudflare.com/x/y@sha256:0" },
          durable_objects: { namespace_id: "ns" },
          health: { errors: state.health === "failed" ? ["image pull failed: manifest unknown"] : [], instances },
        })),
      );
    }
    // The rollouts (7 Sep 2026): one row while a new image rolls out, `progressing` with the versions and the target image, then `completed`.
    const rolling = /^\/accounts\/[^/]+\/containers\/applications\/([^/]+)\/rollouts$/.exec(path);
    if (rolling && request.method === "GET") {
      const application = state.applications.find((candidate) => candidate.id === rolling[1]);
      if (application === undefined) return refuse(response, 404, 10007, "application not found");
      if (application.rollout === undefined) return envelope(response, []);
      state.rolloutPolls++;
      // The account API dropping the connection: what a deploy saw once at 35 s into a rollout ("fetch failed").
      if (state.rollout === "dies") return request.socket.destroy();
      if (state.rollout === "failed") application.rollout.status = "failed";
      else if ((state.rollout === "progressing-then-completed" || state.rollout === "mirrored") && state.rolloutPolls > 2 && application.pending !== undefined) {
        application.rollout.status = "completed";
        // Mirrored: the rollout completes and the configuration names the platform's own registry, another digest, not the image deployed.
        application.image = state.rollout === "mirrored" ? MIRRORED : application.pending;
        delete application.pending;
      }
      // Two steps, as the account's rolling strategy has them: 34% of the instances, then 100%, the second starting a while after the
      // first ends. Progressing-then-completed: step 1 on the first poll, the gap on the second, both done on the third; rolling-stays: step 2 under way from the second poll on, forever.
      const polls = state.rolloutPolls;
      const stepStatus = (step: 1 | 2) => {
        if (state.rollout === "failed") return step === 1 ? "failed" : "pending";
        if (state.rollout === "rolling-stays") return step === 1 ? (polls >= 2 ? "completed" : "progressing") : polls >= 2 ? "progressing" : "pending";
        return step === 1 ? (polls >= 2 ? "completed" : "progressing") : polls >= 3 ? "completed" : "pending";
      };
      const steps = [
        { id: "step-1", status: stepStatus(1), step_size: { percentage: 34 }, description: "Step 1", started_at: "2026-09-08T01:00:00Z" },
        { id: "step-2", status: stepStatus(2), step_size: { percentage: 100 }, description: "Step 2", started_at: polls >= 2 ? "2026-09-08T01:01:17Z" : null },
      ];
      return envelope(response, [{ id: "rollout-1", status: application.rollout.status, kind: "full_auto", strategy: "rolling", current_version: 1, target_version: 2, target_configuration: { image: application.rollout.target }, steps }]);
    }
    // The join store (stile phase 2): KV namespaces listed in pages, made by title, deleted by id; a key written with its TTL
    // as the raw body, deleted, and its namespace's keys listed. What the real API answers, over the state above.
    if (path === `/accounts/${ACCOUNT.id}/storage/kv/namespaces` && request.method === "GET") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const per = Number(url.searchParams.get("per_page") ?? "20");
      const rows = state.kv.slice((page - 1) * per, page * per).map(({ id, title }) => ({ id, title, supports_url_encoding: true }));
      return envelope(response, rows, { result_info: { page, per_page: per, count: rows.length, total_count: state.kv.length, total_pages: Math.max(1, Math.ceil(state.kv.length / per)) } });
    }
    if (path === `/accounts/${ACCOUNT.id}/storage/kv/namespaces` && request.method === "POST") {
      const body = (await json(request)) as { title: string };
      if (state.kv.some((namespace) => namespace.title === body.title)) return refuse(response, 400, 10014, "a namespace with this account ID and title already exists");
      const made = { id: `kv${String(state.kv.length + 1).padStart(30, "0")}`, title: body.title, values: {} };
      state.kv.push(made);
      return envelope(response, { id: made.id, title: made.title, supports_url_encoding: true });
    }
    const namespaceRoute = /^\/accounts\/[^/]+\/storage\/kv\/namespaces\/([^/]+)(\/.*)?$/.exec(path);
    if (namespaceRoute) {
      const namespace = state.kv.find((candidate) => candidate.id === namespaceRoute[1]);
      if (namespace === undefined) return refuse(response, 404, 10013, "namespace not found");
      const rest = namespaceRoute[2] ?? "";
      if (rest === "" && request.method === "DELETE") {
        state.kv = state.kv.filter((candidate) => candidate !== namespace);
        return envelope(response, null);
      }
      if (rest === "/keys" && request.method === "GET") {
        const prefix = url.searchParams.get("prefix") ?? "";
        return envelope(response, Object.keys(namespace.values).filter((key) => key.startsWith(prefix)).map((name) => ({ name })), { result_info: { count: 0, cursor: "" } });
      }
      const value = /^\/values\/(.+)$/.exec(rest);
      if (value) {
        const key = decodeURIComponent(value[1]!);
        if (request.method === "PUT") {
          let text = "";
          for await (const chunk of request) text += chunk;
          const ttl = url.searchParams.get("expiration_ttl");
          namespace.values[key] = { value: text, ttl: ttl === null ? null : Number(ttl) };
          state.events.push(`put ${key} ttl ${ttl}`);
          return envelope(response, null);
        }
        if (request.method === "DELETE") {
          if (state.kvDeleteFails === true) return refuse(response, 403, 10000, "Authentication error");
          delete namespace.values[key];
          state.events.push(`delete ${key}`);
          return envelope(response, null);
        }
      }
    }
    const deleting = /^\/accounts\/[^/]+\/containers\/applications\/([^/]+)$/.exec(path);
    if (deleting && request.method === "DELETE") {
      const before = state.applications.length;
      state.applications = state.applications.filter((application) => application.id !== deleting[1]);
      return before === state.applications.length ? refuse(response, 404, 10007, "application not found") : envelope(response, {});
    }
    refuse(response, 404, 7000, `no route for ${request.method} ${path}`);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

/** What the fake station holds: its sessions and its pastures, as `GET /sessions` and `GET /pastures` list them, with the token. */
export interface StationState {
  token: string;
  sessions: { id: string; name: string | null; createdAt: number; state: string; pasture: string | null; task: string | null }[];
  pastures: { name: string; createdAt: number }[];
  /**
   * Stile phase 2: the Worker on the fake account this station is. A probe that names a Worker (`?worker=<name>`, where
   * a hostname would have named it) is answered as a sheep home for this one and as something else for every other; a
   * probe that names none is answered as a sheep home, as deploy's is. Unset, no named Worker is this station.
   */
  worker?: string;
  /** The fake account whose namespace titled `<worker>-join` is this station's `JOIN` binding: `POST /join` reads it and nothing else. */
  account?: FakeState;
  /** How many `POST /join` asks, after the key is written, answer 404 still, as the edge does until the write reaches it. */
  joinLag?: number;
  /** Every request, in order: method, path, the bearer it carried, the status, and, for a join, whether a join key was in the store when it came. */
  log?: { method: string; path: string; auth: string | undefined; keyed?: boolean; status: number }[];
}

/**
 * The station's door: `GET /` answers `sheep`, `GET /home` the stamp; the
 * listings need the station's bearer, a 401 otherwise (the home's
 * `admitted`); what bearer each request carried is kept. `POST /join` is
 * the cell's (stile phase 2): the bearer hashed, its `join:<sha256>` key
 * looked up in the fake account's `<worker>-join` namespace and deleted,
 * and the station's token answered; a bare 404 when the key is not there,
 * there is no namespace, or the write is still `joinLag` asks from the edge.
 */
export function fakeStation(auths: (string | undefined)[], state: StationState): Promise<{ server: Server; url: string }> {
  let joinAsks = 0;
  const server = createServer((request, response) => {
    auths.push(request.headers.authorization);
    const url = new URL(request.url ?? "/", "http://fake");
    const entry: NonNullable<StationState["log"]>[number] = { method: request.method ?? "", path: url.pathname, auth: request.headers.authorization, status: 200 };
    state.log?.push(entry);
    const answer = (status: number, body: string) => {
      entry.status = status;
      response.statusCode = status;
      response.end(body);
    };
    const named = url.searchParams.get("worker");
    if (url.pathname === "/" && request.method === "GET") return named === null || named === state.worker ? answer(200, "sheep\n") : answer(200, "<!doctype html><title>another Worker</title>");
    if (url.pathname === "/join" && request.method === "POST") {
      const store = state.worker === undefined || named !== state.worker ? undefined : state.account?.kv.find((namespace) => namespace.title === `${state.worker}-join`);
      const joinKeys = Object.keys(store?.values ?? {}).filter((key) => key.startsWith("join:"));
      entry.keyed = joinKeys.length > 0;
      const refused = () => {
        state.account?.events.push("ask 404");
        return answer(404, "not found");
      };
      if (store === undefined || joinKeys.length === 0) return refused();
      joinAsks++;
      if (joinAsks <= (state.joinLag ?? 0)) return refused();
      const header = request.headers.authorization ?? "";
      if (!header.startsWith("Bearer ") || header === "Bearer ") return refused();
      const key = `join:${createHash("sha256").update(header.slice("Bearer ".length)).digest("hex")}`;
      if (store.values[key] === undefined) return refused();
      delete store.values[key];
      state.account?.events.push("ask 200");
      return answer(200, JSON.stringify({ token: state.token }));
    }
    if (url.pathname === "/home") return answer(200, JSON.stringify({ serverId: "fake-station", container: true, build: STAMP }));
    if (request.headers.authorization !== `Bearer ${state.token}`) return answer(401, "unauthorized");
    if (url.pathname === "/sessions") return answer(200, JSON.stringify(state.sessions));
    if (url.pathname === "/pastures") return answer(200, JSON.stringify(state.pastures));
    answer(404, "no");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}
