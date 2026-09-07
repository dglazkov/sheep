/**
 * The station: a home in the cloud, on the shepherd's Cloudflare account,
 * from the installed package, in one path. Station phase 1. `sheep home
 * deploy` is the design's five steps: nothing without the token and the
 * key; the account asked whose token this is, whether it is on the Paid
 * plan, and whether it has a `workers.dev` subdomain; `wrangler deploy
 * --env pen` over a config derived from the package's, every name in it
 * the Worker's; the three secrets through stdin; the kennel's config
 * written to name the station, with no `local` marker. Run again, it
 * redeploys the same Worker from the package it runs from, keeps the token
 * it generated, and reports the stamp moving; that is the upgrade.
 *
 * The name is kennel's rule (`name.ts`): the config's `name` once there is
 * one, else `mintName` over the kennel directory's name and everything
 * the account already calls something, a Worker or a container
 * application, since an application's name is account-wide and bound to
 * one Durable Object namespace (recast phase 1). A `--name` that differs
 * from the recorded one is refused: a kennel has one station.
 *
 * The derived config, `<kennel>/deploy/wrangler.jsonc`, is the package's
 * `home/wrangler.jsonc` with `main` made absolute and the top-level name,
 * the `pen` environment's name, and its one container's name all set to
 * the Worker's. It is plain JSON, rewritten on every deploy, and carries
 * no secret; every wrangler call here, deploy, secret put, and delete,
 * runs `--config <that file> --env pen`. In a checkout the base is
 * `packages/cell/wrangler.jsonc`, so the code path is one, and the
 * command typechecks and is testable; a deploy from a checkout is not a
 * supported path.
 *
 * `sheep home delete` is the end of a station, in its first form: the
 * Worker's name typed at a terminal, or one line of stdin when there is
 * none, and nothing happens unless the line is the name; then `wrangler
 * delete --force`, the container application of that name deleted through
 * the API by its id, since `wrangler delete` leaves it behind, and the
 * config cleared of `home`, `token`, and `name`.
 *
 * Secrets travel in environments and on stdin, never as arguments:
 * `CLOUDFLARE_API_TOKEN` reaches wrangler and the API client through the
 * environment and a header, and each of `SHEEP_TOKEN`,
 * `SHEEP_ANTHROPIC_API_KEY`, and `PEN_CELL_ORIGIN` through `wrangler secret
 * put`'s stdin. Nothing here prints a value of any of them.
 *
 * Three test seams, read from the environment and stripped by every ring:
 * `SHEEP_TEST_ACCOUNT_API` stands in for `https://api.cloudflare.com/client/v4`;
 * `SHEEP_TEST_WRANGLER` is a script run under node in wrangler's place;
 * `SHEEP_TEST_STATION_URL` is asked `GET /` and `GET /home` in place of
 * the station's address. The tests under `test/deploy.test.ts` drive the
 * five steps and the refusals through them against a fake account and a
 * fake wrangler, touching no account; the account ring walks the real one.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { configPath, readConfigFile, sheepDir, writeConfigFile } from "./config.js";
import { Home } from "./home.js";
import { type BuildSide, type BuildStamp, cliBuild, ensureWrangler, readStamp, whoAnswers } from "./local.js";
import { kennelName, mintName } from "./name.js";

/** The package root: `packages/cli/` in a checkout and the installed package otherwise. */
const packageDir = fileURLToPath(new URL("..", import.meta.url));

const API_BASE = "https://api.cloudflare.com/client/v4";

/** What the token needs, by the names the dashboard's token editor shows. */
export const PERMISSIONS = ["Workers Scripts (edit)", "Durable Objects (edit)", "Containers (edit)", "Workers Subdomain (edit)", "Account Settings (read)", "Billing (read)"];

/** The plan containers need, and its price. */
export const PLAN = { id: "workers_paid", name: "Workers Paid", price: "5 USD a month" };
const PRICING_PAGE = "https://developers.cloudflare.com/containers/pricing/";
const TOKENS_PAGE = "https://dash.cloudflare.com/?to=/:account/api-tokens";
const plansPage = (accountId: string) => `https://dash.cloudflare.com/${accountId}/workers/plans`;

/** A Worker's name: lowercase letters, digits, and hyphens, neither end a hyphen, at most 63 characters. */
const WORKER_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The one sentence a dog asks the person with; the person's step is the dashboard, and it is the only browser step. */
export const ASK_TOKEN = `Please make a Cloudflare API token for the account the home goes on, with ${PERMISSIONS.join(", ")} (${TOKENS_PAGE}), and export it as CLOUDFLARE_API_TOKEN in the shell I run in.`;
export const ASK_KEY = "Please export the Anthropic API key as ANTHROPIC_API_KEY in the shell I run in; the home holds it as a secret and I never see it.";

/** A refusal: the command made nothing, and exits 2 with this sentence. */
export class Refusal extends Error {}

/**
 * Step 1's text: what the command needs and costs, then which of the two
 * is missing and the sentence to ask with. Printed whole, so the dog can
 * tell the person both the price and the ask in one go.
 */
export function needs(missing: "token" | "key"): string {
  const lines = [
    "sheep home deploy makes nothing without two variables in the environment:",
    `  CLOUDFLARE_API_TOKEN  an API token for the Cloudflare account the home goes on, with ${PERMISSIONS.join(", ")}`,
    "  ANTHROPIC_API_KEY     the Anthropic key the home's sheep call the model with; it becomes the home's secret",
    `it costs the ${PLAN.name} plan, ${PLAN.price}, which containers need, and a container's minutes while a sheep uses one, billed by the minute at the rate on ${PRICING_PAGE}`,
    missing === "token" ? `CLOUDFLARE_API_TOKEN is not set. Ask: ${ASK_TOKEN}` : `ANTHROPIC_API_KEY is not set. Ask: ${ASK_KEY}`,
  ];
  return lines.join("\n");
}

/* The account API. */

interface ApiError {
  code: number;
  message: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  result: T;
  errors?: ApiError[];
  result_info?: { page?: number; total_pages?: number };
}

export interface Account {
  id: string;
  name: string;
}

export interface Application {
  id: string;
  name: string;
}

/** A container application's health as the API reports it: how many instances are in each state, and the errors it names. */
export interface ApplicationHealth {
  errors: string[];
  instances: { healthy: number; starting: number; scheduling: number; failed: number; active: number };
}

/** The account's names: every Worker and every container application, which is what `mintName` must avoid. */
export interface Taken {
  workers: string[];
  applications: Application[];
}

/** The API's errors, quoted, so a taken subdomain or a refused delete is the account's own sentence. */
const quoteErrors = (errors: ApiError[] | undefined): string => (errors && errors.length > 0 ? errors.map((error) => `${error.message} (code ${error.code})`).join("; ") : "no error given");

export class AccountApi {
  readonly base: string;

  constructor(private readonly token: string, base = process.env.SHEEP_TEST_ACCOUNT_API ?? API_BASE) {
    this.base = base.replace(/\/+$/, "");
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<ApiEnvelope<T>> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let envelope: ApiEnvelope<T>;
    try {
      envelope = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
    }
    return envelope;
  }

  /** A call that must succeed; the API's errors are the exception's sentence. */
  private async must<T>(method: string, path: string, body?: unknown): Promise<T> {
    const envelope = await this.call<T>(method, path, body);
    if (!envelope.success) throw new Error(`${method} ${path}: ${quoteErrors(envelope.errors)}`);
    return envelope.result;
  }

  /**
   * Whose token this is: the accounts it lists. An account-owned token
   * lists its one account and answers `active` at that account's verify
   * endpoint; a user token lists every account the user is in, and
   * `CLOUDFLARE_ACCOUNT_ID` picks when there are several.
   */
  async account(): Promise<Account> {
    const envelope = await this.call<Account[]>("GET", "/accounts?per_page=50");
    if (!envelope.success) throw new Refusal(`CLOUDFLARE_API_TOKEN is not accepted: ${quoteErrors(envelope.errors)}; ${ASK_TOKEN}`);
    const accounts = envelope.result.map((account) => ({ id: account.id, name: account.name }));
    if (accounts.length === 0) throw new Refusal(`CLOUDFLARE_API_TOKEN reaches no account; a token made in an account's API Tokens page (${TOKENS_PAGE}) reaches that one`);
    let chosen = accounts[0]!;
    if (accounts.length > 1) {
      const wanted = process.env.CLOUDFLARE_ACCOUNT_ID;
      const picked = accounts.find((account) => account.id === wanted);
      if (picked === undefined) {
        throw new Refusal(`CLOUDFLARE_API_TOKEN reaches ${accounts.length} accounts (${accounts.map((account) => `${account.name}: ${account.id}`).join("; ")}); export CLOUDFLARE_ACCOUNT_ID to say which`);
      }
      chosen = picked;
    }
    const verify = await this.call<{ status?: string }>("GET", `/accounts/${chosen.id}/tokens/verify`);
    if (!(verify.success && verify.result?.status === "active")) {
      const user = await this.call<{ status?: string }>("GET", "/user/tokens/verify");
      if (!(user.success && user.result?.status === "active")) throw new Refusal(`CLOUDFLARE_API_TOKEN is not active on ${chosen.name} (${chosen.id}): ${quoteErrors(verify.errors)}`);
    }
    return chosen;
  }

  /** The plan: `workers_paid` among the account's subscriptions, with its state; undefined on a Free account. */
  async plan(accountId: string): Promise<{ id: string; state: string } | undefined> {
    const subscriptions = await this.must<{ state?: string; rate_plan?: { id?: string } }[]>("GET", `/accounts/${accountId}/subscriptions`);
    const paid = subscriptions.find((subscription) => subscription.rate_plan?.id === PLAN.id);
    return paid === undefined ? undefined : { id: PLAN.id, state: paid.state ?? "unknown" };
  }

  /** The account's `workers.dev` subdomain, or undefined when it has none. */
  async subdomain(accountId: string): Promise<string | undefined> {
    const envelope = await this.call<{ subdomain?: string | null } | null>("GET", `/accounts/${accountId}/workers/subdomain`);
    if (!envelope.success) {
      // An account that never had one answers 404 here rather than an empty result.
      if (envelope.errors?.some((error) => error.code === 10007 || /not found/i.test(error.message))) return undefined;
      throw new Error(`GET /accounts/${accountId}/workers/subdomain: ${quoteErrors(envelope.errors)}`);
    }
    const subdomain = envelope.result?.subdomain;
    return typeof subdomain === "string" && subdomain !== "" ? subdomain : undefined;
  }

  /** Registers the subdomain; a taken name is the API's own sentence, as a refusal. */
  async registerSubdomain(accountId: string, subdomain: string): Promise<string> {
    const envelope = await this.call<{ subdomain?: string }>("PUT", `/accounts/${accountId}/workers/subdomain`, { subdomain });
    if (!envelope.success) throw new Refusal(`the subdomain ${subdomain}.workers.dev was refused: ${quoteErrors(envelope.errors)}; run again with another --subdomain`);
    return envelope.result?.subdomain ?? subdomain;
  }

  /** Every Worker's name, over every page of the listing. */
  async workers(accountId: string): Promise<string[]> {
    const names: string[] = [];
    for (let page = 1; ; page++) {
      const envelope = await this.call<{ id: string }[]>("GET", `/accounts/${accountId}/workers/scripts?page=${page}&per_page=100`);
      if (!envelope.success) throw new Error(`GET /accounts/${accountId}/workers/scripts: ${quoteErrors(envelope.errors)}`);
      for (const script of envelope.result) names.push(script.id);
      const pages = envelope.result_info?.total_pages ?? 1;
      if (page >= pages || envelope.result.length === 0) break;
    }
    return names;
  }

  /** Every container application: its id, which delete takes, and its name, which the Worker's must not collide with. */
  async applications(accountId: string): Promise<Application[]> {
    const result = await this.must<{ id: string; name: string }[]>("GET", `/accounts/${accountId}/containers/applications`);
    return result.map((application) => ({ id: application.id, name: application.name }));
  }

  async taken(accountId: string): Promise<Taken> {
    const [workers, applications] = await Promise.all([this.workers(accountId), this.applications(accountId)]);
    return { workers, applications };
  }

  /** The health of the application of that name, or undefined when the account has none: what `deploy` polls after the secrets. */
  async applicationHealth(accountId: string, name: string): Promise<ApplicationHealth | undefined> {
    type Row = { name: string; health?: { errors?: unknown[]; instances?: Record<string, number> } };
    const found = (await this.must<Row[]>("GET", `/accounts/${accountId}/containers/applications`)).find((application) => application.name === name);
    if (found === undefined) return undefined;
    const instances = found.health?.instances ?? {};
    const count = (key: string) => (typeof instances[key] === "number" ? instances[key] : 0);
    return {
      errors: (found.health?.errors ?? []).map((error) => (typeof error === "string" ? error : JSON.stringify(error))),
      instances: { healthy: count("healthy"), starting: count("starting"), scheduling: count("scheduling"), failed: count("failed"), active: count("active") },
    };
  }

  async deleteApplication(accountId: string, applicationId: string): Promise<void> {
    await this.must<unknown>("DELETE", `/accounts/${accountId}/containers/applications/${applicationId}`);
  }
}

/* The derived config. */

/** A JSONC text as one object: `//` and block comments stripped outside strings, trailing commas dropped. */
export function parseJsonc(text: string): Record<string, unknown> {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")) as Record<string, unknown>;
}

/** The config the derived one is made from: the release's `home/wrangler.jsonc`, or the cell's in a checkout. */
export function baseConfigPath(stamp: BuildStamp | undefined = readStamp()): string {
  const path = stamp === undefined ? join(packageDir, "..", "cell", "wrangler.jsonc") : join(packageDir, "home", "wrangler.jsonc");
  if (!existsSync(path)) throw new Error(`the home's config is missing at ${path}`);
  return resolve(path);
}

/** The derived config's text and what it names: the Worker, the container application, and the image. */
export interface Derived {
  text: string;
  name: string;
  image: string;
}

type Json = Record<string, unknown>;

/**
 * The rule, pure over the base config's text and path: `$schema` dropped,
 * `main` made absolute against the base's directory (a relative image path
 * or build context too, which only a checkout's config has), and the three
 * names set to the Worker's: the top level's, `env.pen`'s, and
 * `env.pen.containers[0]`'s. The output is plain JSON.
 */
export function deriveConfig(baseText: string, basePath: string, name: string): Derived {
  const { $schema: _schema, ...config } = parseJsonc(baseText);
  const dir = dirname(resolve(basePath));
  const absolute = (value: unknown): unknown => (typeof value === "string" && (value.startsWith(".") || value.startsWith("/")) ? resolve(dir, value) : value);
  if (typeof config.main !== "string") throw new Error(`${basePath} names no main`);
  const env = (config.env ?? {}) as Json;
  const pen = (env.pen ?? {}) as Json;
  const containers = pen.containers;
  if (!Array.isArray(containers) || containers.length !== 1) throw new Error(`${basePath}: the pen environment must have exactly one container`);
  const container = containers[0] as Json;
  if (typeof container.image !== "string") throw new Error(`${basePath}: the pen container names no image`);
  const derived: Json = {
    ...config,
    name,
    main: resolve(dir, config.main),
    env: {
      ...env,
      pen: {
        ...pen,
        name,
        containers: [{ ...container, name, image: absolute(container.image), ...(container.image_build_context === undefined ? {} : { image_build_context: absolute(container.image_build_context) }) }],
      },
    },
  };
  return { text: `${JSON.stringify(derived, null, 2)}\n`, name, image: container.image };
}

/** Where the derived config lives: under the kennel, beside `local/`. */
export function deployDir(): string {
  return join(sheepDir(), "deploy");
}

/** Writes `<kennel>/deploy/wrangler.jsonc` for the name; returns its path and the image it names. */
export function writeDerivedConfig(name: string, stamp: BuildStamp | undefined = readStamp()): { path: string; image: string } {
  const base = baseConfigPath(stamp);
  const derived = deriveConfig(readFileSync(base, "utf8"), base, name);
  mkdirSync(deployDir(), { recursive: true });
  const path = join(deployDir(), "wrangler.jsonc");
  writeFileSync(path, derived.text);
  return { path, image: derived.image };
}

/* wrangler. */

interface WranglerResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * wrangler, from `~/.sheep/tools` (installed once if it is not there) or
 * the checkout's, with the token and the account in its environment, `CI`
 * and no metrics so it never prompts, and a value on stdin when a call has
 * one. It runs in the derived config's directory, so its own scratch
 * (`.wrangler/`) lands under the kennel.
 */
async function wrangler(bin: string, args: string[], options: { token: string; accountId: string; cwd: string; stdin?: string }): Promise<WranglerResult> {
  const env = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_API_TOKEN: options.token, CLOUDFLARE_ACCOUNT_ID: options.accountId };
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: options.cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolveRun({ code: code ?? 1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
    child.stdin.end(options.stdin ?? "");
  });
}

/** The last lines of a failed wrangler call, for the sentence; never a value the call carried. */
const tail = (result: WranglerResult, lines = 12): string =>
  `${result.stdout}\n${result.stderr}`
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-lines)
    .join("\n");

function wranglerBin(stamp: BuildStamp | undefined, say: (text: string) => void): string {
  const seam = process.env.SHEEP_TEST_WRANGLER;
  if (seam) return seam;
  return ensureWrangler(stamp, say).bin;
}

/* The deploy. */

export interface DeployOptions {
  /** `--name`: the Worker's name at the first deploy from this kennel; later, it must be the recorded one. */
  name?: string;
  /** `--subdomain`: the `workers.dev` subdomain to register when the account has none. */
  subdomain?: string;
  /** `--faux`: `SHEEP_PROVIDER=faux` as a var, so the home answers from a program and spends no model; the ring's flag. */
  faux?: boolean;
  /** Where progress goes; never a secret. */
  say?: (text: string) => void;
}

export interface DeployReport {
  home: string;
  name: string;
  /** Whether the account already had a Worker of this name when the deploy began. */
  state: "deployed" | "redeployed";
  /** Whether the address answered `sheep` within a minute of the deploy. */
  answers: boolean;
  account: Account;
  plan: { id: string; state: string; price: string };
  subdomain: { name: string; registered: boolean };
  image: string;
  faux: boolean;
  config: { path: string; wrangler: string };
  kennel: string;
  build: { home: BuildSide | null; cli: BuildSide };
  /**
   * The container application's instances when the wait ended: a station
   * can rent a container once one is healthy, and right after a deploy or
   * a rollout none is yet (station phase 1's finding). `seconds` is how
   * long the wait took; `healthy` 0 means it ran out, and `sheep new` may
   * have to wait.
   */
  containers: { healthy: number; starting: number; scheduling: number; failed: number; seconds: number };
  next: string;
}

/** How long deploy waits for a healthy container instance: within the three-minute budget, after the deploy itself. */
const CONTAINERS_WAIT_MS = 150_000;
const CONTAINERS_POLL_MS = 3_000;

/**
 * Waits until the application of the Worker's name has a healthy instance;
 * an instance that failed, or an error the application names, is an
 * `Error` (exit 1); running out of time is reported, not thrown.
 */
async function waitForContainers(api: AccountApi, accountId: string, name: string): Promise<DeployReport["containers"]> {
  const started = Date.now();
  const deadline = started + CONTAINERS_WAIT_MS;
  let last: ApplicationHealth | undefined;
  for (;;) {
    last = await api.applicationHealth(accountId, name);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (last !== undefined) {
      if (last.errors.length > 0 || last.instances.failed > 0) {
        throw new Error(`the container application ${name} is not healthy: ${last.instances.failed} failed, ${last.instances.healthy} healthy${last.errors.length > 0 ? `; ${last.errors.join("; ")}` : ""}; the Worker is deployed, and \`sheep home deploy\` again retries the rollout`);
      }
      if (last.instances.healthy >= 1) return { ...pick(last), seconds };
    }
    if (Date.now() >= deadline) return { ...pick(last), seconds };
    await sleep(CONTAINERS_POLL_MS);
  }
}

const pick = (health: ApplicationHealth | undefined): Omit<DeployReport["containers"], "seconds"> => ({
  healthy: health?.instances.healthy ?? 0,
  starting: health?.instances.starting ?? 0,
  scheduling: health?.instances.scheduling ?? 0,
  failed: health?.instances.failed ?? 0,
});

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/** The address a Worker gets on the account's subdomain. */
export const address = (name: string, subdomain: string): string => `https://${name}.${subdomain}.workers.dev`;

/** Which name this kennel deploys as: the recorded one, or a fresh mint; a different `--name` later is refused. */
function resolveName(recorded: string | undefined, wanted: string | undefined, taken: Taken): { name: string; minted: boolean } {
  if (recorded !== undefined) {
    if (wanted !== undefined && wanted !== recorded) {
      throw new Refusal(`this kennel's station is ${recorded} (named in ${configPath()}); --name ${wanted} would be a second one, and a kennel has one: \`sheep home delete\` ends this one first`);
    }
    return { name: recorded, minted: false };
  }
  const names = new Set([...taken.workers, ...taken.applications.map((application) => application.name)]);
  if (wanted !== undefined && names.has(wanted)) {
    throw new Refusal(`the account already has a Worker or container application named ${wanted}, and this kennel did not deploy it; choose another --name`);
  }
  return { name: mintName(kennelName(), names, wanted), minted: true };
}

/** `--name`'s shape, checked here since `mintName` returns it verbatim (kennel phase 1). */
export function validateName(name: string): void {
  if (!WORKER_NAME.test(name)) throw new Refusal(`--name ${name} is not a Worker name: lowercase letters, digits, and hyphens, neither first nor last a hyphen, at most 63 characters`);
}

/**
 * `sheep home deploy`. Throws a `Refusal` (exit 2, nothing made) before the
 * account is touched, and an `Error` (exit 1) after: a deploy that failed
 * midway is run again, and the redeploy finishes it.
 */
export async function deploy(options: DeployOptions = {}): Promise<DeployReport> {
  const say = options.say ?? (() => {});
  // 1. Nothing without the token, and nothing without the key.
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Refusal(needs("token"));
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Refusal(needs("key"));
  if (options.name !== undefined) validateName(options.name);
  const existing = readConfigFile();
  const recorded = typeof existing?.name === "string" ? existing.name : undefined;
  if (recorded !== undefined && options.name !== undefined && options.name !== recorded) resolveName(recorded, options.name, { workers: [], applications: [] });

  // 2. The account: whose token, which plan, which subdomain.
  const api = new AccountApi(token);
  const account = await api.account();
  const plan = await api.plan(account.id);
  if (plan === undefined) {
    throw new Refusal(`the account ${account.name} (${account.id}) is not on the ${PLAN.name} plan, which containers need, at ${PLAN.price}: ${plansPage(account.id)}; deploy makes nothing until it is`);
  }
  say(`sheep: account ${account.name} (${account.id}), ${PLAN.name} (${plan.state})\n`);
  let subdomain = await api.subdomain(account.id);
  let registered = false;
  if (subdomain === undefined) {
    if (options.subdomain === undefined) throw new Refusal("the account has no workers.dev subdomain, and the home's address needs one; run again with --subdomain <name>, and the home lives at https://<worker>.<name>.workers.dev");
    subdomain = await api.registerSubdomain(account.id, options.subdomain);
    registered = true;
    say(`sheep: registered the subdomain ${subdomain}.workers.dev\n`);
  }
  const taken = await api.taken(account.id);
  const { name } = resolveName(recorded, options.name, taken);
  const state: DeployReport["state"] = taken.workers.includes(name) ? "redeployed" : "deployed";
  const home = address(name, subdomain);

  // 3. The deploy: wrangler over the derived config, the token in its environment.
  const stamp = readStamp();
  const bin = wranglerBin(stamp, say);
  const derived = writeDerivedConfig(name, stamp);
  const cwd = dirname(derived.path);
  const faux = options.faux === true;
  say(`sheep: ${state === "deployed" ? "deploying" : "redeploying"} ${name} as ${home} with the image ${derived.image}${faux ? " and the faux provider" : ""}\n`);
  const deployed = await wrangler(bin, ["deploy", "--config", derived.path, "--env", "pen", ...(faux ? ["--var", "SHEEP_PROVIDER:faux"] : [])], { token, accountId: account.id, cwd });
  if (deployed.code !== 0) throw new Error(`wrangler deploy --config ${derived.path} --env pen exited ${deployed.code}:\n${tail(deployed)}`);

  // 4. The secrets, each on stdin. The token is generated once and kept in the config; a redeploy reuses the config's.
  const sheepToken = recorded !== undefined && typeof existing?.token === "string" && existing.token !== "" ? existing.token : randomBytes(24).toString("hex");
  for (const [secret, value] of [
    ["SHEEP_TOKEN", sheepToken],
    ["SHEEP_ANTHROPIC_API_KEY", key],
    ["PEN_CELL_ORIGIN", home],
  ] as const) {
    const put = await wrangler(bin, ["secret", "put", secret, "--config", derived.path, "--env", "pen"], { token, accountId: account.id, cwd, stdin: `${value}\n` });
    if (put.code !== 0) throw new Error(`wrangler secret put ${secret} --config ${derived.path} --env pen exited ${put.code}:\n${tail(put)}`);
  }

  // 5. The config, without the local marker; then the address asked, the container application waited for, and the stamps.
  const { local: _local, ...rest } = existing ?? {};
  writeConfigFile({ ...rest, home, token: sheepToken, name });
  const probe = process.env.SHEEP_TEST_STATION_URL ?? home;
  const deadline = Date.now() + 60_000;
  let answers = false;
  while (Date.now() < deadline) {
    if ((await whoAnswers(probe)) === "sheep") {
      answers = true;
      break;
    }
    await sleep(1_000);
  }
  let homeBuild: BuildSide | null = null;
  if (answers) {
    try {
      homeBuild = await new Home({ home: probe, token: sheepToken }).build();
    } catch {
      homeBuild = null;
    }
  }
  say(`sheep: waiting for a container instance of ${name} to be healthy\n`);
  const containers = await waitForContainers(api, account.id, name);
  return {
    home,
    name,
    state,
    answers,
    account,
    plan: { ...plan, price: PLAN.price },
    subdomain: { name: subdomain, registered },
    image: derived.image,
    faux,
    config: { path: configPath(), wrangler: derived.path },
    kennel: sheepDir(),
    build: { home: homeBuild, cli: cliBuild() },
    containers,
    next: 'sheep new -- "…"',
  };
}

/* Delete. */

export interface DeleteOptions {
  /** `--name`: the Worker's name, when the config records none, or the same one when it does. */
  name?: string;
  /** Reads the confirmation: the typed line at a terminal, one line of stdin without one. */
  confirm?: (prompt: string) => Promise<string>;
  say?: (text: string) => void;
}

export interface DeleteReport {
  name: string;
  account: Account;
  worker: "deleted" | "absent";
  application: { id: string; state: "deleted" } | null;
  config: { path: string; state: "cleared" | "removed" | "absent" };
}

/** One line: at a terminal, asked for on stderr and typed; otherwise the first line of stdin, or nothing. */
export function readLine(prompt: string): Promise<string> {
  if (process.stdin.isTTY) {
    return new Promise((resolveLine) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.question(prompt, (answer) => {
        rl.close();
        resolveLine(answer.trim());
      });
    });
  }
  return new Promise((resolveLine) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => (text += chunk));
    process.stdin.on("end", () => resolveLine(text.split("\n")[0]!.trim()));
    process.stdin.on("error", () => resolveLine(""));
    process.stdin.resume();
  });
}

/**
 * `sheep home delete`. The sentence before the prompt names what goes;
 * the listing of what is in it, and its session count, is station phase
 * 3's. A `Refusal` before anything is deleted is exit 2.
 */
export async function deleteStation(options: DeleteOptions = {}): Promise<DeleteReport> {
  const say = options.say ?? (() => {});
  const existing = readConfigFile();
  const recorded = typeof existing?.name === "string" ? existing.name : undefined;
  if (recorded !== undefined && options.name !== undefined && options.name !== recorded) {
    throw new Refusal(`this kennel's station is ${recorded} (named in ${configPath()}), not ${options.name}; run \`sheep home delete\` here with no --name, or --name ${recorded}`);
  }
  const name = recorded ?? options.name;
  if (name === undefined) throw new Refusal("this kennel names no station; `sheep home deploy` makes one, and --name <worker> names one to delete");
  validateName(name);
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Refusal(`sheep home delete needs CLOUDFLARE_API_TOKEN in the environment, the token the deploy used; nothing was deleted. Ask: ${ASK_TOKEN}`);

  // The confirmation: the name, typed, or nothing happens.
  const confirm = options.confirm ?? readLine;
  const typed = await confirm(`deleting ${name}: the Worker, its objects, and its container application\ntype the name to confirm: `);
  if (typed !== name) throw new Refusal(typed === "" ? `nothing typed; nothing deleted (the name is ${name})` : `${typed} is not ${name}; nothing deleted`);

  const api = new AccountApi(token);
  const account = await api.account();
  const taken = await api.taken(account.id);
  const stamp = readStamp();
  const derived = writeDerivedConfig(name, stamp);
  const cwd = dirname(derived.path);

  let worker: DeleteReport["worker"] = "absent";
  if (taken.workers.includes(name)) {
    const bin = wranglerBin(stamp, say);
    const deleted = await wrangler(bin, ["delete", "--config", derived.path, "--env", "pen", "--force"], { token, accountId: account.id, cwd });
    if (deleted.code !== 0) throw new Error(`wrangler delete --config ${derived.path} --env pen --force exited ${deleted.code}:\n${tail(deleted)}`);
    worker = "deleted";
  }
  say(worker === "deleted" ? `deleted the Worker ${name} and its objects\n` : `no Worker named ${name} on ${account.name}\n`);

  let application: DeleteReport["application"] = null;
  const found = taken.applications.find((candidate) => candidate.name === name);
  if (found !== undefined) {
    await api.deleteApplication(account.id, found.id);
    application = { id: found.id, state: "deleted" };
  }
  say(application === null ? `no container application named ${name}\n` : `deleted the container application ${name} (${application.id})\n`);

  // The config: cleared of the station, the file removed when nothing else is in it; the derived config goes with it.
  let config: DeleteReport["config"]["state"] = "absent";
  if (existing !== undefined) {
    const { home: _home, token: _token, name: _name, ...rest } = existing;
    if (Object.keys(rest).length === 0) {
      rmSync(configPath(), { force: true });
      config = "removed";
    } else {
      writeConfigFile(rest);
      config = "cleared";
    }
  }
  rmSync(deployDir(), { recursive: true, force: true });
  say(config === "absent" ? `config: none at ${configPath()}\n` : `config: ${configPath()} ${config}\n`);
  return { name, account, worker, application, config: { path: configPath(), state: config } };
}
