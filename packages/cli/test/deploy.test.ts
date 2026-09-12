/**
 * The station, without an account (station phase 1): `sheep home deploy`'s
 * five steps and its refusals, the derived config, the name rule meeting
 * the account, and `sheep home delete`'s listing, counts, and stdin rule
 * (station phase 3), driven through `bin/sheep.js` against a fake account
 * API, a fake station answering `/sessions` and `/pastures` with its
 * token, and the fake wrangler in `fake-wrangler.mjs`, through the three
 * seams `deploy.ts` reads from its environment. Nothing here touches an
 * account; the account ring (`scripts/hermetic.mjs --ring account`) walks
 * the real one.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { address, deriveConfig, needs, PERMISSIONS } from "../src/deploy.js";
import { bin, type Result } from "./local-home.js";

const fakeWrangler = new URL("./fake-wrangler.mjs", import.meta.url).pathname;
const cellConfig = new URL("../../cell/wrangler.jsonc", import.meta.url).pathname;

const ACCOUNT = { id: "6821ca17f9f0938585204d69dd050445", name: "Fake's Account" };
const TOKEN = "fake-cloudflare-token-0123456789abcdef";
const KEY = "fake-anthropic-key-0123456789abcdef";
const STAMP = { commit: "2b71e46", builtAt: "2026-09-07T23:30:00Z" };
/**
 * What the account's own registry answers with once the platform has mirrored a container image into it (11 Sep 2026):
 * the application is configured with `registry.cloudflare.com/<account>/<name>@sha256:<a different digest>`, the manifest
 * having been re-uploaded, and the Docker Hub rollouts are marked `replaced`.
 */
const MIRRORED = `registry.cloudflare.com/${ACCOUNT.id}/blog@sha256:c6dc1888e1a0f2d3c4b5a6978899aabbccddeeff00112233445566778899aabb`;

interface FakeState {
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
  deploys: { name: string; container: string; image: string; vars: string[] }[];
  requests: { method: string; path: string; auth: string | undefined }[];
}

function fresh(): FakeState {
  return { plan: "workers_paid", subdomain: "fake", subdomainPut: "ok", workers: ["learner", "sheep", "sheep-pen"], applications: [{ id: "a03d94e0-75b4-454d-b8c8-4882bfcad73d", name: "sheep-pen" }], deploys: [], requests: [], health: "healthy", polls: 0, rollout: "none", rolloutPolls: 0 };
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
function fakeAccount(state: FakeState): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fake");
    const path = url.pathname;
    const auth = request.headers.authorization;
    // The fake wrangler's side door: what a deploy or a delete does to the account.
    if (path === "/_fake/deploy") {
      const body = (await json(request)) as { name: string; container: string; image: string; vars: string[] };
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
    if (path === "/_fake/delete") {
      const body = (await json(request)) as { name: string };
      state.workers = state.workers.filter((name) => name !== body.name);
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
interface StationState {
  token: string;
  sessions: { id: string; name: string | null; createdAt: number; state: string; pasture: string | null; task: string | null }[];
  pastures: { name: string; createdAt: number }[];
}

/**
 * The station's door: `GET /` answers `sheep`, `GET /home` the stamp; the
 * listings need the station's bearer, a 401 otherwise (the home's
 * `admitted`); what bearer each request carried is kept.
 */
function fakeStation(auths: (string | undefined)[], state: StationState): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    auths.push(request.headers.authorization);
    if (request.url === "/") return response.end("sheep\n");
    if (request.url === "/home") return response.end(JSON.stringify({ serverId: "fake-station", container: true, build: STAMP }));
    if (request.headers.authorization !== `Bearer ${state.token}`) {
      response.statusCode = 401;
      return response.end("unauthorized");
    }
    if (request.url === "/sessions") return response.end(JSON.stringify(state.sessions));
    if (request.url === "/pastures") return response.end(JSON.stringify(state.pastures));
    response.statusCode = 404;
    response.end("no");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

interface World {
  root: string;
  blog: string;
  kennel: string;
  config: string;
  log: string;
  state: FakeState;
  api: string;
  station: string;
  stationState: StationState;
  stationAuths: (string | undefined)[];
  /** The CLI in `blog`, with `HOME` the world's root, the seams set, and the token and key in the environment unless dropped. */
  sheep: (args: string[], options?: { drop?: ("CLOUDFLARE_API_TOKEN" | "ANTHROPIC_API_KEY")[]; stdin?: string; env?: Record<string, string> }) => Promise<Result>;
  calls: () => Promise<{ args: string[]; stdin: string; cwd: string; env: Record<string, unknown> }[]>;
  close: () => Promise<void>;
}

const made: World[] = [];
afterAll(async () => {
  for (const world of made) await world.close();
});

/** The station's token as a deployed kennel's config records it: what the fake station admits. */
const STATION_TOKEN = "t".repeat(48);

/** A fresh world: `<root>/blog/.sheep` the kennel (so the minted name is `blog`), the fakes up, the log empty. */
async function world(state: FakeState = fresh(), stationState: StationState = { token: STATION_TOKEN, sessions: [], pastures: [] }): Promise<World> {
  const root = realpathSync(await mkdtemp(join(tmpdir(), "sheep-deploy-")));
  const blog = join(root, "blog");
  const kennel = join(blog, ".sheep");
  await mkdir(kennel, { recursive: true });
  const log = join(root, "wrangler.log");
  const account = await fakeAccount(state);
  const stationAuths: (string | undefined)[] = [];
  const station = await fakeStation(stationAuths, stationState);
  const sheep: World["sheep"] = (args, options = {}) => {
    const env: Record<string, string | undefined> = {
      ...process.env,
      HOME: root,
      NODE_NO_WARNINGS: "1",
      SHEEP_TEST_ACCOUNT_API: account.url,
      SHEEP_TEST_WRANGLER: fakeWrangler,
      SHEEP_TEST_WRANGLER_LOG: log,
      SHEEP_TEST_STATION_URL: station.url,
      CLOUDFLARE_API_TOKEN: TOKEN,
      ANTHROPIC_API_KEY: KEY,
      ...options.env,
    };
    delete env.SHEEP_HOME;
    delete env.SHEEP_TOKEN;
    delete env.CLOUDFLARE_ACCOUNT_ID;
    for (const name of options.drop ?? []) delete env[name];
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], { env, cwd: blog, stdio: ["pipe", "pipe", "pipe"] });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: code ?? -1 }));
      child.stdin.end(options.stdin ?? "");
    });
  };
  const calls: World["calls"] = async () => (existsSync(log) ? (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);
  const close = async () => {
    await new Promise((resolve) => account.server.close(resolve));
    await new Promise((resolve) => station.server.close(resolve));
    await rm(root, { recursive: true, force: true });
  };
  const made1: World = { root, blog, kennel, config: join(kennel, "config"), log, state, api: account.url, station: station.url, stationState, stationAuths, sheep, calls, close };
  made.push(made1);
  return made1;
}

const readConfig = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
/** The station token a `--json` deploy report's config was written with: read back from the kennel the report names. */
const config0 = (result: Result): string => JSON.parse(readFileSync((JSON.parse(result.stdout) as { config: { path: string } }).config.path, "utf8")).token as string;

describe("sheep home deploy: step 1, nothing without the two variables", () => {
  it("refuses without the token, naming the permissions, the plan's price, the minutes, and the ask; and asks nothing of the account", async () => {
    const w = await world();
    const result = await w.sheep(["home", "deploy"], { drop: ["CLOUDFLARE_API_TOKEN"] });
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    for (const permission of PERMISSIONS) expect(result.stderr).toContain(permission);
    expect(result.stderr).toContain("Workers Paid plan, 5 USD a month");
    expect(result.stderr).toContain("billed by the minute");
    expect(result.stderr).toContain("CLOUDFLARE_API_TOKEN is not set. Ask: Please make a Cloudflare API token");
    expect(result.stderr).toBe(`sheep: ${needs("token")}\n`);
    // Nothing was asked, nothing was run, nothing was written.
    expect(w.state.requests).toEqual([]);
    expect(await w.calls()).toEqual([]);
    expect(existsSync(w.config)).toBe(false);
    expect(existsSync(join(w.kennel, "deploy"))).toBe(false);

    const noKey = await w.sheep(["home", "deploy"], { drop: ["ANTHROPIC_API_KEY"] });
    expect(noKey.code).toBe(2);
    expect(noKey.stderr).toBe(`sheep: ${needs("key")}\n`);
    expect(noKey.stderr).toContain("ANTHROPIC_API_KEY is not set. Ask: Please export the Anthropic API key");
    expect(w.state.requests).toEqual([]);
  });
});

describe("sheep home deploy: steps 2 to 5 against the fake account", () => {
  it("asks the account, deploys over the derived config, puts the three secrets on stdin, writes the config, and reports", async () => {
    const w = await world();
    const result = await w.sheep(["home", "deploy", "--faux", "--json"]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, any>;
    const home = address("blog", "fake");
    expect(report.home).toBe(home);
    expect(report.name).toBe("blog");
    expect(report.state).toBe("deployed");
    expect(report.answers).toBe(true);
    expect(report.account).toEqual(ACCOUNT);
    expect(report.plan).toEqual({ id: "workers_paid", state: "Paid", price: "5 USD a month" });
    expect(report.subdomain).toEqual({ name: "fake", registered: false });
    expect(report.image).toBe("../pen/Dockerfile");
    expect(report.faux).toBe(true);
    expect(report.kennel).toBe(w.kennel);
    expect(report.config).toEqual({ path: w.config, wrangler: join(w.kennel, "deploy", "wrangler.jsonc") });
    expect(report.build).toEqual({ home: STAMP, cli: { commit: "0.0.0-checkout", builtAt: null } });
    expect(report.containers).toEqual({ healthy: 2, starting: 0, scheduling: 0, failed: 0, seconds: 0 });
    // A first deploy is no rollout: nothing was there to roll from, and the rollouts were not asked for.
    expect(report.rollout).toEqual({ status: "none", step: null, healthy: null, seconds: 0, from: null });
    expect(w.state.requests.some((request) => request.path.endsWith("/rollouts"))).toBe(false);
    // The stamp is read after the waits, once: this command is unstamped, so nothing moved and nothing was polled for.
    expect(report.stamp).toEqual({ moved: false, seconds: 0 });
    expect(w.stationAuths.filter((auth) => auth === `Bearer ${config0(result)}`)).toHaveLength(1);
    expect(report.next).toBe('sheep new -- "…"');
    // Progress on stderr, and the skew line: the fake station is stamped and this checkout is not, so nothing is warned.
    expect(result.stderr).toContain(`sheep: account ${ACCOUNT.name} (${ACCOUNT.id}), Workers Paid (Paid)\n`);
    expect(result.stderr).toContain(`sheep: deploying blog as ${home} with the image ../pen/Dockerfile and the faux provider\n`);
    expect(result.stderr).not.toContain(TOKEN);
    expect(result.stderr).not.toContain(KEY);

    // Step 2: the account was asked, in order, and nothing was written to it before wrangler ran: every request a GET.
    const asked = w.state.requests.map((request) => `${request.method} ${request.path}`);
    expect(asked.slice(0, 4)).toEqual(["GET /accounts", `GET /accounts/${ACCOUNT.id}/tokens/verify`, `GET /accounts/${ACCOUNT.id}/subscriptions`, `GET /accounts/${ACCOUNT.id}/workers/subdomain`]);
    // Two listings of the applications: the names taken before the deploy, and the health polled after the secrets.
    expect(asked.filter((line) => line === `GET /accounts/${ACCOUNT.id}/containers/applications`)).toHaveLength(2);
    expect(asked.indexOf(`GET /accounts/${ACCOUNT.id}/containers/applications`)).toBeLessThan(asked.lastIndexOf(`GET /accounts/${ACCOUNT.id}/containers/applications`));
    expect(asked.filter((line) => line.startsWith(`GET /accounts/${ACCOUNT.id}/workers/scripts`))).toHaveLength(2);
    expect(w.state.requests.every((request) => request.method === "GET")).toBe(true);
    expect(w.state.requests.every((request) => request.auth === `Bearer ${TOKEN}`)).toBe(true);

    // Step 3 and 4: four wrangler calls, the token and the account in each one's environment and in no argument.
    const calls = await w.calls();
    const derived = join(w.kennel, "deploy", "wrangler.jsonc");
    expect(calls.map((call) => call.args)).toEqual([
      ["deploy", "--config", derived, "--env", "pen", "--var", "SHEEP_PROVIDER:faux"],
      ["secret", "put", "SHEEP_TOKEN", "--config", derived, "--env", "pen"],
      ["secret", "put", "SHEEP_ANTHROPIC_API_KEY", "--config", derived, "--env", "pen"],
      ["secret", "put", "PEN_CELL_ORIGIN", "--config", derived, "--env", "pen"],
    ]);
    for (const call of calls) {
      expect(call.env).toEqual({ CI: "1", WRANGLER_SEND_METRICS: "false", token: true, account: ACCOUNT.id, tokenInArgs: false });
      expect(call.cwd).toBe(join(w.kennel, "deploy"));
      expect(call.args.join(" ")).not.toContain(KEY);
    }
    const config = await readConfig(w.config);
    expect(calls[0]!.stdin).toBe("");
    expect(calls[1]!.stdin).toBe(`${config.token}\n`);
    expect(calls[2]!.stdin).toBe(`${KEY}\n`);
    expect(calls[3]!.stdin).toBe(`${home}\n`);
    // The account's side of the deploy: the Worker and the container application both named blog, the config's image.
    expect(w.state.deploys).toEqual([{ name: "blog", container: "blog", image: join(cellConfig, "..", "..", "pen", "Dockerfile"), vars: ["SHEEP_PROVIDER:faux"] }]);

    // The derived config: plain JSON, every name the Worker's, main absolute, no secret in it.
    const written = JSON.parse(await readFile(derived, "utf8")) as Record<string, any>;
    expect(written.name).toBe("blog");
    expect(written.env.pen.name).toBe("blog");
    expect(written.env.pen.containers).toHaveLength(1);
    expect(written.env.pen.containers[0].name).toBe("blog");
    expect(written.main.startsWith("/")).toBe(true);
    expect(written.$schema).toBeUndefined();
    expect(await readFile(derived, "utf8")).not.toContain(config.token as string);

    // Step 5: the config names the station, with the token and the name and no local marker, mode 600; the station was asked with the token.
    expect(config).toEqual({ home, token: config.token, name: "blog" });
    expect(typeof config.token).toBe("string");
    expect((config.token as string).length).toBe(48);
    expect((await stat(w.config)).mode & 0o777).toBe(0o600);
    expect(w.stationAuths).toContain(`Bearer ${config.token}`);

    // Run again with no --name: the same Worker, the same token, "redeployed", the secrets put again.
    const again = await w.sheep(["home", "deploy", "--faux", "--json"]);
    expect(again.code, again.stderr).toBe(0);
    const second = JSON.parse(again.stdout) as Record<string, any>;
    expect(second.state).toBe("redeployed");
    expect(second.name).toBe("blog");
    expect(second.home).toBe(home);
    // The same image again: the application was read before the deploy, and no rollout followed.
    expect(second.rollout).toEqual({ status: "none", step: null, healthy: null, seconds: 0, from: null });
    expect(await readConfig(w.config)).toEqual(config);
    const later = (await w.calls()).slice(4);
    expect(later.map((call) => call.args[0])).toEqual(["deploy", "secret", "secret", "secret"]);
    expect(later[1]!.stdin).toBe(`${config.token}\n`);
    expect(again.stderr).toContain("sheep: redeploying blog");

    // Prose, the third time: the address, the name, the account, and the next sentence.
    const prose = await w.sheep(["home", "deploy", "--faux"]);
    expect(prose.code).toBe(0);
    expect(prose.stdout).toBe(
      `home: ${home} (redeployed; answers)\nname: blog\naccount: ${ACCOUNT.name} (${ACCOUNT.id}), workers_paid Paid, 5 USD a month; subdomain fake\nimage: ../pen/Dockerfile; the faux provider answers every prompt, no model is spent\nkennel: ${w.kennel}\nconfig: ${w.config} names the station\nhome build: 2b71e46 (2026-09-07T23:30:00Z)\ncli build: 0.0.0-checkout (unstamped)\ncontainers: 2 healthy (0s)\nrollout: none\nstamp: not compared (this command is unstamped)\nnext: sheep new -- "…"\n`,
    );
    // Without --faux, no --var at all.
    const plain = await w.sheep(["home", "deploy", "--json"]);
    expect(plain.code).toBe(0);
    expect((await w.calls()).at(-4)!.args).toEqual(["deploy", "--config", derived, "--env", "pen"]);
  });

  it("keeps what else the config holds, and drops the local marker", async () => {
    const w = await world();
    await writeFile(w.config, JSON.stringify({ home: "http://127.0.0.1:1", token: "local-token", local: true, extra: "kept" }));
    const result = await w.sheep(["home", "deploy", "--json"]);
    expect(result.code, result.stderr).toBe(0);
    const config = await readConfig(w.config);
    expect(config.local).toBeUndefined();
    expect(config.extra).toBe("kept");
    expect(config.name).toBe("blog");
    // A first deploy from a kennel generates its own token: the local home's is not the station's.
    expect(config.token).not.toBe("local-token");
  });

  it("refuses a Free account with the price and the plans page, having run nothing", async () => {
    const w = await world({ ...fresh(), plan: "free" });
    const result = await w.sheep(["home", "deploy"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("is not on the Workers Paid plan");
    expect(result.stderr).toContain("5 USD a month");
    expect(result.stderr).toContain(`https://dash.cloudflare.com/${ACCOUNT.id}/workers/plans`);
    expect(await w.calls()).toEqual([]);
    expect(existsSync(w.config)).toBe(false);
  });

  it("registers the subdomain from --subdomain when the account has none, refuses without the flag, and quotes a taken one", async () => {
    const w = await world({ ...fresh(), subdomain: undefined });
    const without = await w.sheep(["home", "deploy"]);
    expect(without.code).toBe(2);
    expect(without.stderr).toContain("run again with --subdomain <name>");
    expect(w.state.requests.some((request) => request.method === "PUT")).toBe(false);
    expect(await w.calls()).toEqual([]);

    w.state.subdomainPut = "taken";
    const taken = await w.sheep(["home", "deploy", "--subdomain", "mine"]);
    expect(taken.code).toBe(2);
    expect(taken.stderr).toContain("the subdomain mine.workers.dev was refused: workers.api.error.subdomain_taken (code 10036)");
    expect(await w.calls()).toEqual([]);

    w.state.subdomainPut = "ok";
    const registered = await w.sheep(["home", "deploy", "--subdomain", "mine", "--json"]);
    expect(registered.code, registered.stderr).toBe(0);
    const report = JSON.parse(registered.stdout) as Record<string, any>;
    expect(report.subdomain).toEqual({ name: "mine", registered: true });
    expect(report.home).toBe("https://blog.mine.workers.dev");
    expect((await w.calls())[3]!.stdin).toBe("https://blog.mine.workers.dev\n");
  });

  it("waits for a healthy container instance after the secrets, and says so in prose", { timeout: 30_000 }, async () => {
    const w = await world({ ...fresh(), health: "starting-then-healthy" });
    const result = await w.sheep(["home", "deploy", "--json"]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(report.containers).toMatchObject({ healthy: 2, starting: 0, failed: 0 });
    expect(report.containers.seconds).toBeGreaterThanOrEqual(3);
    expect(result.stderr).toContain("sheep: waiting for a container instance of blog to be healthy\n");
    // Polled until healthy: the two `starting` answers, then the healthy one, after the four wrangler calls.
    expect(w.state.polls).toBe(3);
    expect(await readConfig(w.config)).toMatchObject({ name: "blog" });
  });

  it("waits for the rollout a new image starts, and reports it completed with the image it rolled from", { timeout: 60_000 }, async () => {
    const OLD = "docker.io/dglazkov2/sheep-pen@sha256:6d1848d95eb4e0d749b27a56a7cc20ee9354ba4a78747a4ce79929b45a4ea55c";
    const NEW = join(cellConfig, "..", "..", "pen", "Dockerfile");
    const rolling = async (mode: FakeState["rollout"]): Promise<World> => {
      const w = await world({ ...fresh(), rollout: mode, workers: ["sheep", "blog"], applications: [{ id: "app-blog", name: "blog", image: OLD }] });
      await writeFile(w.config, JSON.stringify({ home: address("blog", "fake"), token: STATION_TOKEN, name: "blog" }));
      return w;
    };
    const w = await rolling("progressing-then-completed");
    const result = await w.sheep(["home", "deploy", "--json"]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(report.state).toBe("redeployed");
    expect(report.rollout).toMatchObject({ status: "completed", step: "2 of 2 (100%)", healthy: 2, from: OLD });
    // Step 1, the gap, then both steps done and the image moved: three polls five seconds apart; the application names the new image only then.
    expect(report.rollout.seconds).toBeGreaterThanOrEqual(10);
    expect(w.state.rolloutPolls).toBe(3);
    expect(w.state.applications).toEqual([{ id: "app-blog", name: "blog", image: NEW, rollout: { status: "completed", target: NEW } }]);
    expect(result.stderr).toContain(`sheep: waiting for the rollout of ${NEW} to blog\n`);
    expect(w.state.requests.filter((request) => request.path.endsWith("/rollouts")).every((request) => request.method === "GET" && request.path === `/accounts/${ACCOUNT.id}/containers/applications/app-blog/rollouts`)).toBe(true);

    // The prose line, on a second rollout.
    const again = await rolling("progressing-then-completed");
    const prose = await again.sheep(["home", "deploy"]);
    expect(prose.code, prose.stderr).toBe(0);
    expect(prose.stdout).toMatch(new RegExp(`\ncontainers: 2 healthy \\(0s\\)\nrollout: completed \\(\\d+s\\), from ${OLD.replace(/[.@]/g, "\\$&")}\nstamp: not compared \\(this command is unstamped\\)\nnext: `));

    // The last step under way with a healthy instance ends the wait as `rolling`: the platform finishes it, and the image has not moved yet.
    const stays = await rolling("rolling-stays");
    const rollingResult = await stays.sheep(["home", "deploy", "--json"]);
    expect(rollingResult.code, rollingResult.stderr).toBe(0);
    const rollingReport = JSON.parse(rollingResult.stdout) as Record<string, any>;
    expect(rollingReport.rollout).toMatchObject({ status: "rolling", step: "2 of 2 (100%)", healthy: 2, from: OLD });
    expect(stays.state.rolloutPolls).toBe(2);
    expect(stays.state.applications[0]).toMatchObject({ image: OLD, pending: NEW });
    const staysProse = await rolling("rolling-stays");
    const rollingProse = await staysProse.sheep(["home", "deploy"]);
    expect(rollingProse.code, rollingProse.stderr).toBe(0);
    expect(rollingProse.stdout).toMatch(new RegExp(`\nrollout: at step 2 of 2 \\(100%\\), 2 healthy \\(\\d+s\\); the platform finishes it, from ${OLD.replace(/[.@]/g, "\\$&")}\nstamp: `));
  });

  it("reports the rollout completed when the platform mirrors the image into its own registry", { timeout: 60_000 }, async () => {
    // The rollout to the image completes and the application is then configured with `registry.cloudflare.com/…@sha256:<another
    // digest>`, which is what the platform does to a Docker Hub image now (11 Sep 2026). The rollout's own word ends the wait: a
    // deploy that also asked the configuration to name the image would wait out its 300 s budget and tell the shepherd `progressing`,
    // "the old image serves until it completes", about a rollout that has completed.
    const OLD = "docker.io/dglazkov2/sheep-pen@sha256:6d1848d95eb4e0d749b27a56a7cc20ee9354ba4a78747a4ce79929b45a4ea55c";
    const NEW = join(cellConfig, "..", "..", "pen", "Dockerfile");
    const w = await world({ ...fresh(), rollout: "mirrored", workers: ["sheep", "blog"], applications: [{ id: "app-blog", name: "blog", image: OLD }] });
    await writeFile(w.config, JSON.stringify({ home: address("blog", "fake"), token: STATION_TOKEN, name: "blog" }));
    const result = await w.sheep(["home", "deploy", "--json"]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(report.rollout).toMatchObject({ status: "completed", step: "2 of 2 (100%)", healthy: 2, from: OLD });
    // Three polls, as the unmirrored rollout takes: the wait ended on the rollout, not on the budget.
    expect(w.state.rolloutPolls).toBe(3);
    expect(report.rollout.seconds).toBeLessThan(60);
    expect(w.state.applications).toEqual([{ id: "app-blog", name: "blog", image: MIRRORED, rollout: { status: "completed", target: NEW } }]);

    // And the prose says completed, not "the old image serves until it completes".
    const again = await world({ ...fresh(), rollout: "mirrored", workers: ["sheep", "blog"], applications: [{ id: "app-blog", name: "blog", image: OLD }] });
    await writeFile(again.config, JSON.stringify({ home: address("blog", "fake"), token: STATION_TOKEN, name: "blog" }));
    const prose = await again.sheep(["home", "deploy"]);
    expect(prose.code, prose.stderr).toBe(0);
    expect(prose.stdout).toMatch(new RegExp(`\nrollout: completed \\(\\d+s\\), from ${OLD.replace(/[.@]/g, "\\$&")}\n`));
    expect(prose.stdout).not.toContain("serves until it completes");
  });

  it("retries a read the account API drops, three times, and ends the rollout wait as unknown rather than failing", { timeout: 30_000 }, async () => {
    const OLD = "docker.io/dglazkov2/sheep-pen@sha256:6d1848d95eb4e0d749b27a56a7cc20ee9354ba4a78747a4ce79929b45a4ea55c";
    const w = await world({ ...fresh(), rollout: "dies", workers: ["sheep", "blog"], applications: [{ id: "app-blog", name: "blog", image: OLD }] });
    await writeFile(w.config, JSON.stringify({ home: address("blog", "fake"), token: STATION_TOKEN, name: "blog" }));
    const result = await w.sheep(["home", "deploy", "--json"], { env: { SHEEP_TEST_RETRY_MS: "100" } });
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(report.rollout).toEqual({ status: "unknown", step: null, healthy: null, seconds: 0, from: OLD });
    // One read, three retries, each said once; then the deploy went on to the stamp and the report.
    expect(w.state.rolloutPolls).toBe(4);
    expect(result.stderr.match(/sheep: the account API did not answer \(fetch failed\); retrying\n/g)).toHaveLength(3);
    expect(await readConfig(w.config)).toMatchObject({ name: "blog" });
    const prose = await w.sheep(["home", "deploy"], { env: { SHEEP_TEST_RETRY_MS: "100" } });
    expect(prose.code, prose.stderr).toBe(0);
    expect(prose.stdout).toContain("\nrollout: unknown (the account API did not answer)\n");
  });

  it("is exit 1 when the rollout fails, the Worker deployed and the config written", { timeout: 30_000 }, async () => {
    const w = await world({ ...fresh(), rollout: "failed", workers: ["sheep", "blog"], applications: [{ id: "app-blog", name: "blog", image: "docker.io/dglazkov2/sheep-pen:old" }] });
    await writeFile(w.config, JSON.stringify({ home: address("blog", "fake"), token: STATION_TOKEN, name: "blog" }));
    const result = await w.sheep(["home", "deploy"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("to the container application blog failed (version 1 → 2); the old image serves");
    // The rollouts were asked once: the first answer already named the failure, and the stamp was never read (the deploy threw before it).
    expect(w.state.rolloutPolls).toBe(1);
    expect((await w.calls()).map((call) => call.args[0])).toEqual(["deploy", "secret", "secret", "secret"]);
    expect(await readConfig(w.config)).toMatchObject({ name: "blog" });
  });

  it("is exit 1 when the container application reports a failed instance or an error, the Worker deployed and the config written", async () => {
    const w = await world({ ...fresh(), health: "failed" });
    const result = await w.sheep(["home", "deploy"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("the container application blog is not healthy: 1 failed, 0 healthy; image pull failed: manifest unknown");
    expect((await w.calls()).map((call) => call.args[0])).toEqual(["deploy", "secret", "secret", "secret"]);
    expect(await readConfig(w.config)).toMatchObject({ name: "blog" });
  });

  it("retries the deploy once, after a gap, when wrangler cannot attach the container application, and says so", async () => {
    const w = await world();
    const result = await w.sheep(["home", "deploy", "--json"], { env: { SHEEP_TEST_WRANGLER_FAIL: "deploy-once", SHEEP_TEST_RETRY_MS: "50" } });
    expect(result.code, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as { deployRetried: boolean; name: string }).deployRetried).toBe(true);
    expect(result.stderr).toContain("sheep: wrangler could not attach the container application (✘ [ERROR] Could not deploy container application as durable object was not found in list of bindings); retrying once in 0s\n");
    // Two deploys, the same arguments, then the secrets as ever; the Worker is the one the second deploy registered.
    const calls = await w.calls();
    expect(calls.map((call) => call.args[0])).toEqual(["deploy", "deploy", "secret", "secret", "secret"]);
    expect(calls[0]!.args).toEqual(calls[1]!.args);
    expect(w.state.deploys.length).toBe(1);
    expect(await readConfig(w.config)).toMatchObject({ name: "blog" });
    // A deploy that needed no retry says so.
    const again = await w.sheep(["home", "deploy", "--json"]);
    expect(again.code, again.stderr).toBe(0);
    expect((JSON.parse(again.stdout) as { deployRetried: boolean }).deployRetried).toBe(false);
  });

  it("is exit 1, not a refusal, when wrangler fails after the account was touched", async () => {
    const w = await world();
    const result = await w.sheep(["home", "deploy"], { env: { SHEEP_TEST_WRANGLER_FAIL: "deploy" } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("wrangler deploy --config");
    expect(result.stderr).toContain("the fake refused this deploy [code: 10000]");
    expect(existsSync(w.config)).toBe(false);
  });
});

describe("the name, meeting the account", () => {
  it("mints past a taken name, over Workers and container applications alike", async () => {
    const w = await world({ ...fresh(), workers: ["blog", "sheep"], applications: [{ id: "x", name: "blog-2" }] });
    const result = await w.sheep(["home", "deploy", "--json"]);
    expect(result.code, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as { name: string }).name).toBe("blog-3");
    expect((await readConfig(w.config)).name).toBe("blog-3");
  });

  it("takes --name at the first deploy, validates it, and refuses one the account already has", async () => {
    const w = await world();
    for (const bad of ["Blog", "-blog", "blog-", "a".repeat(64), "my_blog"]) {
      const result = await w.sheep(["home", "deploy", "--name", bad]);
      expect(result.code, bad).toBe(2);
      expect(result.stderr).toContain(`--name ${bad} is not a Worker name`);
    }
    expect(w.state.requests).toEqual([]);
    const taken = await w.sheep(["home", "deploy", "--name", "sheep-pen"]);
    expect(taken.code).toBe(2);
    expect(taken.stderr).toContain("the account already has a Worker or container application named sheep-pen");
    expect(await w.calls()).toEqual([]);
    const result = await w.sheep(["home", "deploy", "--name", "sheep-hermetic-2b71e46", "--json"]);
    expect(result.code, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as { name: string; home: string }).home).toBe(address("sheep-hermetic-2b71e46", "fake"));
    expect((await readConfig(w.config)).name).toBe("sheep-hermetic-2b71e46");
  });

  it("uses the recorded name after, and refuses a different --name before asking the account", async () => {
    const w = await world();
    await writeFile(w.config, JSON.stringify({ home: address("blog", "fake"), token: "t".repeat(48), name: "blog" }));
    const other = await w.sheep(["home", "deploy", "--name", "other"]);
    expect(other.code).toBe(2);
    expect(other.stderr).toContain("this kennel's station is blog");
    expect(other.stderr).toContain("`sheep home delete` ends this one first");
    expect(w.state.requests).toEqual([]);
    expect(await w.calls()).toEqual([]);
    const same = await w.sheep(["home", "deploy", "--name", "blog", "--json"]);
    expect(same.code, same.stderr).toBe(0);
    const report = JSON.parse(same.stdout) as { name: string; state: string };
    // The account never had it (deleted by hand, say): deployed again under the recorded name, the recorded token kept.
    expect(report).toMatchObject({ name: "blog", state: "deployed" });
    expect((await w.calls())[1]!.stdin).toBe(`${"t".repeat(48)}\n`);
  });
});

describe("the derived config", () => {
  it("is the base with main absolute, every name the Worker's, and the checkout's Dockerfile paths absolute", async () => {
    const text = await readFile(cellConfig, "utf8");
    const derived = deriveConfig(text, cellConfig, "sheep-hermetic-2b71e46");
    const config = JSON.parse(derived.text) as Record<string, any>;
    expect(derived.name).toBe("sheep-hermetic-2b71e46");
    expect(derived.image).toBe("../pen/Dockerfile");
    expect(config.name).toBe("sheep-hermetic-2b71e46");
    expect(config.main).toBe(join(cellConfig, "..", "src", "index.ts"));
    expect(config.env.pen.name).toBe("sheep-hermetic-2b71e46");
    expect(config.env.pen.containers[0]).toMatchObject({ name: "sheep-hermetic-2b71e46", class_name: "PenContainer", instance_type: "basic", max_instances: 3 });
    expect(config.env.pen.containers[0].image).toBe(join(cellConfig, "..", "..", "pen", "Dockerfile"));
    expect(config.env.pen.containers[0].image_build_context).toBe(join(cellConfig, "..", "..", "pen"));
    expect(config.$schema).toBeUndefined();
    // The rest is the base's: bindings, migrations, the loader, and the vars.
    expect(config.env.pen.durable_objects.bindings.map((binding: { name: string }) => binding.name)).toEqual(["SESSION_CELL", "DIRECTORY", "PEN_CONTAINER", "PASTURE"]);
    expect(config.env.pen.migrations.map((migration: { tag: string }) => migration.tag)).toEqual(["v1", "v2", "v3", "v4"]);
    expect(config.env.pen.worker_loaders).toEqual([{ binding: "LOADER" }]);
    expect(config.env.pen.vars).toEqual({ SHEEP_MODEL: "claude-sonnet-5", PEN_IDLE: "10m" });
  });

  it("leaves a registry image reference alone, as a release's config names one", () => {
    const base = JSON.stringify({ name: "sheep", main: "worker.mjs", no_bundle: true, env: { pen: { name: "sheep-pen", containers: [{ image: "docker.io/someone/sheep-pen:2b71e46", class_name: "PenContainer" }] } } });
    const derived = deriveConfig(base, "/pkg/home/wrangler.jsonc", "blog");
    const config = JSON.parse(derived.text) as Record<string, any>;
    expect(derived.image).toBe("docker.io/someone/sheep-pen:2b71e46");
    expect(config.main).toBe("/pkg/home/worker.mjs");
    expect(config.env.pen.containers[0]).toEqual({ image: "docker.io/someone/sheep-pen:2b71e46", class_name: "PenContainer", name: "blog" });
  });
});

describe("sheep home delete", () => {
  const born = (id: string, name: string | null, pasture: string | null = null) => ({ id, name, createdAt: 1_757_000_000_000, state: "idle", pasture, task: null });
  /** A deployed kennel: the config names blog with the station's token; the account holds it; the station holds three sheep and one pasture. */
  const station = async (): Promise<World> => {
    const w = await world(
      { ...fresh(), workers: ["sheep", "sheep-pen", "blog"], applications: [{ id: "app-pen", name: "sheep-pen" }, { id: "app-blog", name: "blog" }] },
      { token: STATION_TOKEN, sessions: [born("11111111-1111-4111-8111-111111111111", "older-sheep"), born("22222222-2222-4222-8222-222222222222", null), born("33333333-3333-4333-8333-333333333333", "typo", "ring-1")], pastures: [{ name: "ring-1", createdAt: 1_757_000_000_000 }] },
    );
    await writeFile(w.config, JSON.stringify({ home: address("blog", "fake"), token: STATION_TOKEN, name: "blog" }));
    return w;
  };
  const listing = (w: World, application = "app-blog", sessions = "3", pastures = "1") =>
    `deleting blog: the Worker at ${address("blog", "fake")}, its Durable Objects, and its container application blog\nsessions: ${sessions}\npastures: ${pastures}\ncontainer application: ${application}\nconfig: ${w.config}\n`;

  it("prints the listing, then deletes nothing on an empty line or the wrong name, and exits 2", async () => {
    const w = await station();
    // stdin at end of file, as `sheep home delete </dev/null`: the listing is printed, then the refusal.
    const empty = await w.sheep(["home", "delete"], { stdin: "" });
    expect(empty.code).toBe(2);
    expect(empty.stdout).toBe(listing(w));
    expect(empty.stderr).toBe("sheep: nothing typed; nothing deleted (the name is blog)\n");
    // The station was asked its two listings with the config's token, and the account only GETs.
    expect(w.stationAuths).toContain(`Bearer ${STATION_TOKEN}`);
    expect(w.state.requests.every((request) => request.method === "GET")).toBe(true);
    const wrong = await w.sheep(["home", "delete"], { stdin: "blog-2\n" });
    expect(wrong.code).toBe(2);
    expect(wrong.stdout).toBe(listing(w));
    expect(wrong.stderr).toContain("blog-2 is not blog; nothing deleted");
    expect(await w.calls()).toEqual([]);
    expect(w.state.requests.every((request) => request.method === "GET")).toBe(true);
    expect(w.state.workers).toContain("blog");
    expect(w.state.applications.map((application) => application.name)).toContain("blog");
    expect(await readConfig(w.config)).toMatchObject({ name: "blog" });
    // Nothing without the token, and a --name that is not the recorded one is refused before the account is asked at all.
    const asked = w.state.requests.length;
    const noToken = await w.sheep(["home", "delete"], { stdin: "blog\n", drop: ["CLOUDFLARE_API_TOKEN"] });
    expect(noToken.code).toBe(2);
    expect(noToken.stdout).toBe("");
    expect(noToken.stderr).toContain("sheep home delete needs CLOUDFLARE_API_TOKEN");
    const other = await w.sheep(["home", "delete", "--name", "other"], { stdin: "other\n" });
    expect(other.code).toBe(2);
    expect(other.stdout).toBe("");
    expect(other.stderr).toContain("this kennel's station is blog");
    expect(w.state.requests).toHaveLength(asked);
    expect(await w.calls()).toEqual([]);
  });

  it("with the name typed: the listing, wrangler delete --force over the derived config, the application by id, the config cleared, and the sessions deleted", async () => {
    const w = await station();
    const result = await w.sheep(["home", "delete"], { stdin: "blog\n" });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`${listing(w)}deleted the Worker blog and its objects\ndeleted the container application blog (app-blog)\nconfig: ${w.config} removed\nsessions deleted: 3\n`);
    const calls = await w.calls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual(["delete", "--config", join(w.kennel, "deploy", "wrangler.jsonc"), "--env", "pen", "--force"]);
    expect(calls[0]!.env).toMatchObject({ CI: "1", token: true, tokenInArgs: false });
    expect(w.state.workers).toEqual(["sheep", "sheep-pen"]);
    expect(w.state.applications).toEqual([{ id: "app-pen", name: "sheep-pen" }]);
    expect(w.state.requests.filter((request) => request.method === "DELETE").map((request) => request.path)).toEqual([`/accounts/${ACCOUNT.id}/containers/applications/app-blog`]);
    // The one DELETE came after every GET: nothing was written to the account before the name was typed.
    const methods = w.state.requests.map((request) => request.method);
    expect(methods.lastIndexOf("GET")).toBeLessThan(methods.indexOf("DELETE"));
    expect(existsSync(w.config)).toBe(false);
    expect(existsSync(join(w.kennel, "deploy"))).toBe(false);
  });

  it("--json carries the listing and the report; the counts are unknown when the token is not the station's, or the config has none", async () => {
    const w = await station();
    const result = await w.sheep(["home", "delete", "--json"], { stdin: "blog\n" });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      name: "blog",
      account: ACCOUNT,
      listing: { home: address("blog", "fake"), sessions: 3, pastures: 1, application: { id: "app-blog" }, config: w.config },
      worker: "deleted",
      application: { id: "app-blog", state: "deleted" },
      config: { path: w.config, state: "removed" },
      sessionsDeleted: 3,
    });

    // A token the station refuses (401 to the listings): the counts are unknown, and the delete still goes through.
    const stale = await station();
    await writeFile(stale.config, JSON.stringify({ home: address("blog", "fake"), token: "not-the-station-token", name: "blog" }));
    const unknown = await stale.sheep(["home", "delete"], { stdin: "blog\n" });
    expect(unknown.code, unknown.stderr).toBe(0);
    expect(unknown.stdout).toBe(`${listing(stale, "app-blog", "unknown (the home did not answer)", "unknown (the home did not answer)")}deleted the Worker blog and its objects\ndeleted the container application blog (app-blog)\nconfig: ${stale.config} removed\nsessions deleted: unknown\n`);

    // No token in the config at all: the station is not asked, and the counts are unknown.
    const bare = await station();
    await writeFile(bare.config, JSON.stringify({ home: address("blog", "fake") }));
    const before = bare.stationAuths.length;
    const untold = await bare.sheep(["home", "delete", "--name", "blog", "--json"], { stdin: "" });
    expect(untold.code).toBe(2);
    expect(untold.stdout).toBe("");
    expect(bare.stationAuths).toHaveLength(before);
    expect(bare.state.workers).toContain("blog");
  });

  it("keeps a config with more in it, and says when the account holds no Worker or application of the name", async () => {
    const w = await world({ ...fresh(), workers: ["sheep"], applications: [] });
    await writeFile(w.config, JSON.stringify({ home: address("blog", "fake"), token: STATION_TOKEN, name: "blog", extra: "kept" }));
    const result = await w.sheep(["home", "delete", "--json"], { stdin: "blog\n" });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      name: "blog",
      account: ACCOUNT,
      listing: { home: address("blog", "fake"), sessions: 0, pastures: 0, application: null, config: w.config },
      worker: "absent",
      application: null,
      config: { path: w.config, state: "cleared" },
      sessionsDeleted: 0,
    });
    expect(await w.calls()).toEqual([]);
    expect(await readConfig(w.config)).toEqual({ extra: "kept" });
    // In prose, the same: no application on the account, and none deleted.
    await writeFile(w.config, JSON.stringify({ home: address("blog", "fake"), token: STATION_TOKEN, name: "blog", extra: "kept" }));
    const prose = await w.sheep(["home", "delete"], { stdin: "blog\n" });
    expect(prose.code, prose.stderr).toBe(0);
    expect(prose.stdout).toBe(`${listing(w, "none on the account", "0", "0")}no Worker named blog on ${ACCOUNT.name}\nno container application named blog\nconfig: ${w.config} cleared\nsessions deleted: 0\n`);
    // With no station named anywhere, there is nothing to type for.
    await writeFile(w.config, JSON.stringify({ extra: "kept" }));
    const none = await w.sheep(["home", "delete"], { stdin: "blog\n" });
    expect(none.code).toBe(2);
    expect(none.stderr).toContain("this kennel names no station");
  });
});
