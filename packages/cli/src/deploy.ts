/**
 * The station: a home in the cloud, on the shepherd's Cloudflare account,
 * from the installed package, in one path. Station phase 1. `sheep home
 * deploy` is the design's five steps: nothing without the account token,
 * read from what this machine keeps (`credentials.ts`, stile phase 0), and
 * nothing without a model key either kept here or already on the Worker;
 * the account asked whose token this is, whether it is on the Paid
 * plan, and whether it has a `workers.dev` subdomain; `wrangler deploy
 * --env pen` over a config derived from the package's, every name in it
 * the Worker's; the secrets through stdin, the model key among them when
 * one is kept here; the kennel's config
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
 * `sheep home delete` is the end of a station (station phase 3, whole).
 * Before the prompt, the listing of what goes: the Worker at its address,
 * its Durable Objects, its container application by id, and how many
 * sessions and pastures are in it, read from `GET /sessions` and `GET
 * /pastures` with the config's token (`unknown` when the config has no
 * token or the home does not answer). Then the Worker's name typed at a
 * terminal, or one line of stdin when there is none, and nothing happens
 * unless the line is the name; then `wrangler delete --force`, the
 * container application of that name deleted through the API by its id,
 * since `wrangler delete` leaves it behind, and the config cleared of
 * `home`, `token`, and `name`. Every request before the prompt is a GET.
 *
 * Secrets travel in environments and on stdin, never as arguments:
 * `CLOUDFLARE_API_TOKEN` reaches wrangler and the API client through the
 * environment and a header, and each of `SHEEP_TOKEN`,
 * `SHEEP_ANTHROPIC_API_KEY`, and `PEN_CELL_ORIGIN` through `wrangler secret
 * put`'s stdin. Nothing here prints a value of any of them.
 *
 * Four test seams, read from the environment and stripped by every ring:
 * `SHEEP_TEST_ACCOUNT_API` stands in for `https://api.cloudflare.com/client/v4`;
 * `SHEEP_TEST_WRANGLER` is a script run under node in wrangler's place;
 * `SHEEP_TEST_STATION_URL` is asked `GET /` and `GET /home` in place of
 * the station's address; `SHEEP_TEST_RETRY_MS` shortens the gap between
 * a wait's retried reads. The tests under `test/deploy.test.ts` drive the
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
import { accountToken, modelKey } from "./credentials.js";
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
/** The account's Workers plans page: what the plan refusal and the stile's plan step name. */
export const plansPage = (accountId: string) => `https://dash.cloudflare.com/${accountId}/workers/plans`;

/** A Worker's name: lowercase letters, digits, and hyphens, neither end a hyphen, at most 63 characters. */
const WORKER_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A refusal: the command made nothing, and exits 2 with this sentence. */
export class Refusal extends Error {}

/** What a stop wants of a person: an account token, a model key, or a terminal to type at. */
export type Need = "account" | "key" | "terminal";

/**
 * A stop: the refusal that needs a person (stile phase 0). It carries the
 * two parts `cli.ts` prints — the dog's line, third person, saying what was
 * needed and that nothing was made, which is `message`; and the shepherd's
 * paragraph, second person, naming the one command to type at their own
 * terminal — and the `needs` a `--json` caller reads. One class and one
 * printer, so a guard can enumerate every stop the command can throw and
 * assert that both parts are there (`STOPS` below is that enumeration).
 */
export class Stop extends Refusal {
  constructor(
    message: string,
    readonly needs: Need[],
    readonly shepherd: string,
  ) {
    super(message);
  }
}

/** A stop as `cli.ts` prints it: the dog's line, then the shepherd's paragraph under it. The one printer for every stop. */
export function stopText(stop: Stop): string {
  return `sheep: ${stop.message}\nfor the shepherd: ${stop.shepherd}\n`;
}

/** A stop as `--json` carries it: the dog's line as `refused`, what it needs, and the shepherd's paragraph. */
export function stopJson(stop: Stop): { refused: string; needs: Need[]; shepherd: string } {
  return { refused: stop.message, needs: stop.needs, shepherd: stop.shepherd };
}

/**
 * The sitting the shepherd is sent to, in their own words. One command to
 * type, on its own line, and what it does with what it asks for.
 */
const SITTING = "At your own terminal, run\n  sheep setup\nonce. It asks for what it needs and keeps it on this machine, and nothing your agent runs will ask again.";

/**
 * Every stop `sheep home deploy` and `sheep home delete` can throw, in one
 * place, so stile phase 1's fence can walk them. Each is the dog's line and
 * the shepherd's paragraph, and nothing in either is a value.
 */
export const STOPS = {
  /** Nothing on this machine keeps an account token, and the command needs one. */
  deployAccount: (): Stop =>
    new Stop(
      "sheep home deploy needs the account token, and nothing on this machine keeps one; nothing was made",
      ["account"],
      `sheep needs your Cloudflare account to make the home and to upgrade it. ${SITTING} The home costs the ${PLAN.name} plan, ${PLAN.price}, which containers need, and a container's minutes while a sheep uses one, at the rate on ${PRICING_PAGE}.`,
    ),
  /** No model key kept, and the Worker holds none either: the home would have nothing to call the model with. */
  deployKey: (name: string): Stop =>
    new Stop(
      `sheep home deploy needs the model key: nothing on this machine keeps one, and the Worker ${name} holds none; nothing was made`,
      ["key"],
      `sheep needs your Anthropic key, which is what the home's sheep call the model with. ${SITTING} The key becomes the home's own secret, and is never printed or passed as an argument.`,
    ),
  /** The delete needs the same account token, and nothing keeps one. */
  deleteAccount: (): Stop =>
    new Stop(
      "sheep home delete needs the account token, and nothing on this machine keeps one; nothing was deleted",
      ["account"],
      `sheep needs your Cloudflare account to end the home. ${SITTING}`,
    ),
  /** The name typed is the shepherd's act, and there was neither a terminal to type at nor a line on stdin. */
  deleteTerminal: (name: string): Stop =>
    new Stop(
      "sheep home delete needs the station's name typed to confirm, and there is no terminal here and nothing on stdin; nothing was deleted",
      ["terminal"],
      `ending ${name} deletes the home, its sessions, and its pastures, and it cannot be undone, so it is yours to confirm rather than your agent's. At your own terminal, in this directory, run\n  sheep home delete\nand type the station's name when it asks.`,
    ),
} as const;

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
    if (!envelope.success) throw new Refusal(`the account token is not accepted: ${quoteErrors(envelope.errors)}; it wants ${PERMISSIONS.join(", ")}, and is made at ${TOKENS_PAGE}`);
    const accounts = envelope.result.map((account) => ({ id: account.id, name: account.name }));
    if (accounts.length === 0) throw new Refusal(`the account token reaches no account; a token made in an account's API Tokens page (${TOKENS_PAGE}) reaches that one`);
    let chosen = accounts[0]!;
    if (accounts.length > 1) {
      const wanted = process.env.CLOUDFLARE_ACCOUNT_ID;
      const picked = accounts.find((account) => account.id === wanted);
      if (picked === undefined) {
        throw new Refusal(`the account token reaches ${accounts.length} accounts (${accounts.map((account) => `${account.name}: ${account.id}`).join("; ")}); set CLOUDFLARE_ACCOUNT_ID to say which`);
      }
      chosen = picked;
    }
    const verify = await this.call<{ status?: string }>("GET", `/accounts/${chosen.id}/tokens/verify`);
    if (!(verify.success && verify.result?.status === "active")) {
      const user = await this.call<{ status?: string }>("GET", "/user/tokens/verify");
      if (!(user.success && user.result?.status === "active")) throw new Refusal(`the account token is not active on ${chosen.name} (${chosen.id}): ${quoteErrors(verify.errors)}`);
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

  /**
   * The names of a Worker's secrets, and nothing of their values, which the
   * API does not answer with (stile phase 0). A Worker the account does not
   * have answers 404, which is `[]` here: a deploy asks this only when no
   * model key is kept, to find out whether the home already holds one.
   */
  async secrets(accountId: string, script: string): Promise<string[]> {
    const envelope = await this.call<{ name?: unknown }[] | null>("GET", `/accounts/${accountId}/workers/scripts/${script}/secrets`);
    if (!envelope.success) {
      if (envelope.errors?.some((error) => error.code === 10007 || error.code === 10090 || /not found/i.test(error.message))) return [];
      throw new Error(`GET /accounts/${accountId}/workers/scripts/${script}/secrets: ${quoteErrors(envelope.errors)}`);
    }
    return (envelope.result ?? []).map((secret) => secret.name).filter((name): name is string => typeof name === "string");
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

  /** The application of that name as the account holds it now: its id, the image its configuration names, its version, and its health. */
  async applicationState(accountId: string, name: string): Promise<ApplicationState | undefined> {
    type Row = { id: string; name: string; version?: unknown; configuration?: { image?: unknown }; health?: { errors?: unknown[]; instances?: Record<string, number> } };
    const found = (await this.must<Row[]>("GET", `/accounts/${accountId}/containers/applications`)).find((application) => application.name === name);
    if (found === undefined) return undefined;
    const instances = found.health?.instances ?? {};
    const count = (key: string) => (typeof instances[key] === "number" ? instances[key] : 0);
    return {
      id: found.id,
      image: typeof found.configuration?.image === "string" ? found.configuration.image : null,
      version: typeof found.version === "number" ? found.version : null,
      health: {
        errors: (found.health?.errors ?? []).map((error) => (typeof error === "string" ? error : JSON.stringify(error))),
        instances: { healthy: count("healthy"), starting: count("starting"), scheduling: count("scheduling"), failed: count("failed"), active: count("active") },
      },
    };
  }

  /**
   * The application's rollouts (station phase 3): a redeploy whose image
   * differs is a rollout the platform runs after `wrangler deploy` returns,
   * replacing the instances over minutes; until it completes a sheep rents
   * the old image. Each is its status, the versions, and the image it
   * targets; the list may come bare or under `rollouts`.
   */
  async rollouts(accountId: string, applicationId: string): Promise<Rollout[]> {
    type Step = { id?: unknown; status?: unknown; description?: unknown; step_size?: { percentage?: unknown } };
    type Row = { id?: unknown; status?: unknown; current_version?: unknown; target_version?: unknown; target_configuration?: { image?: unknown }; steps?: unknown };
    const result = await this.must<Row[] | { rollouts?: Row[] }>("GET", `/accounts/${accountId}/containers/applications/${applicationId}/rollouts`);
    const rows = Array.isArray(result) ? result : Array.isArray(result?.rollouts) ? result.rollouts : [];
    return rows.map((row) => ({
      id: typeof row.id === "string" ? row.id : null,
      status: typeof row.status === "string" ? row.status : "unknown",
      currentVersion: typeof row.current_version === "number" ? row.current_version : null,
      targetVersion: typeof row.target_version === "number" ? row.target_version : null,
      targetImage: typeof row.target_configuration?.image === "string" ? row.target_configuration.image : null,
      steps: (Array.isArray(row.steps) ? (row.steps as Step[]) : []).map((step) => ({
        status: typeof step.status === "string" ? step.status : "unknown",
        percentage: typeof step.step_size?.percentage === "number" ? step.step_size.percentage : null,
        description: typeof step.description === "string" ? step.description : null,
      })),
    }));
  }

  async deleteApplication(accountId: string, applicationId: string): Promise<void> {
    await this.must<unknown>("DELETE", `/accounts/${accountId}/containers/applications/${applicationId}`);
  }
}

/** A container application as the account holds it: what `deploy` reads before a redeploy and polls after it. */
export interface ApplicationState {
  id: string;
  image: string | null;
  version: number | null;
  health: ApplicationHealth;
}

export interface Rollout {
  id: string | null;
  status: string;
  currentVersion: number | null;
  targetVersion: number | null;
  targetImage: string | null;
  /** The rollout's steps (a rolling strategy: 34% of the instances, then 100%), each with its status and size. */
  steps: { status: string; percentage: number | null; description: string | null }[];
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

/**
 * Writes `<kennel>/deploy/wrangler.jsonc` for the name; returns its path,
 * the image the base names (what the report prints), and the image as
 * written, which is what the account's application will name (the same
 * for a registry reference; absolute for a checkout's Dockerfile path).
 */
export function writeDerivedConfig(name: string, stamp: BuildStamp | undefined = readStamp()): { path: string; image: string; configured: string } {
  const base = baseConfigPath(stamp);
  const derived = deriveConfig(readFileSync(base, "utf8"), base, name);
  mkdirSync(deployDir(), { recursive: true });
  const path = join(deployDir(), "wrangler.jsonc");
  writeFileSync(path, derived.text);
  const written = JSON.parse(derived.text) as { env: { pen: { containers: { image: string }[] } } };
  return { path, image: derived.image, configured: written.env.pen.containers[0]!.image };
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
  /**
   * The stile's (stile phase 1): the caller puts the model key itself, at
   * its own step, the moment this deploy returns, through `putModelKey`
   * below — so a Worker that holds no key yet is not a stop. Only the
   * stile passes it; `sheep home deploy` never does, and a dog's deploy
   * with no key kept and a home holding none is the stop it always was.
   */
  keyLater?: boolean;
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
  /** Station phase 4: whether `wrangler deploy` was run a second time after failing to attach the container application. */
  deployRetried: boolean;
  account: Account;
  plan: { id: string; state: string; price: string };
  subdomain: { name: string; registered: boolean };
  image: string;
  faux: boolean;
  /**
   * The model key (stile phase 0): `put` when this machine keeps one, since
   * the put is idempotent and a rotated key is the shepherd running `sheep
   * setup` again; `left` when it keeps none and the Worker already holds
   * `SHEEP_ANTHROPIC_API_KEY`, which a second machine that joined is. A
   * Worker with neither is a stop, before anything is deployed. `later`
   * is the stile's `keyLater`: its own `key` step puts one right after.
   */
  key: "put" | "left" | "later";
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
  /**
   * The rollout (station phase 3): a redeploy whose image differs from the
   * application's is a rollout the platform runs after wrangler returns,
   * replacing the instances over minutes; `completed` once the platform
   * says the rollout to the new image completed, `progressing` when the
   * budget ran out first (the old image serves until it completes), `none`
   * on a first deploy or a redeploy of the same image. `from` is what the
   * configuration named before this deploy — which, once the platform has
   * mirrored the image into its own registry, is a
   * `registry.cloudflare.com/<account>/<name>@sha256:…` reference and not
   * the one we deployed (11 Sep 2026).
   */
  rollout: {
    /**
     * `completed`: the platform says the rollout to this image completed — what the application is configured with
     * afterwards is the platform's own business, since it mirrors the image into its own registry; `rolling`: its last
     * step is under way with a healthy instance, and the platform finishes it; `progressing`: the budget ran out first;
     * `unknown`: the account API stopped answering; `none`: no rollout.
     */
    status: "none" | "completed" | "rolling" | "progressing" | "unknown" | string;
    /** The step under way when the wait ended, `2 of 2 (100%)`; null without one. */
    step: string | null;
    /** Healthy instances at the last read; null without one. */
    healthy: number | null;
    seconds: number;
    from: string | null;
  };
  /**
   * Whether the home's stamp is this command's after the waits (station
   * phase 3): a deployment takes seconds to propagate, so a redeploy polls
   * `GET /home` until the stamp moved, up to a minute; a first deploy reads
   * it once. `moved` is false when the command is unstamped (a checkout),
   * the home did not answer, or the minute ran out.
   */
  stamp: { moved: boolean; seconds: number };
  next: string;
}

/** How long deploy waits for a healthy container instance: within the three-minute budget, after the deploy itself. */
const CONTAINERS_WAIT_MS = 150_000;
const CONTAINERS_POLL_MS = 3_000;
/**
 * The whole wait's budget when a rollout follows: the instances, then the
 * rollout, polled every five seconds with a progress line every thirty.
 * A rolling rollout on the account is two steps, 34% then 100%, the second
 * starting about 77 s after the first; the whole took 150 s one evening
 * and more than 243 s the same night (station phase 3).
 */
const ROLLOUT_WAIT_MS = 300_000;
const ROLLOUT_POLL_MS = 5_000;
const ROLLOUT_SAY_MS = 30_000;
/** A rollout's statuses that mean it will not complete. */
const ROLLOUT_FAILED = new Set(["failed", "reverted", "rolled_back"]);
/** How long a redeploy waits for `GET /home` to report this command's stamp. */
const STAMP_WAIT_MS = 60_000;
const STAMP_POLL_MS = 2_000;
/** A read that throws (the network, a timeout, a 5xx) is retried this many times, this far apart; `SHEEP_TEST_RETRY_MS` shortens the gap in tests, and every ring strips it. */
const READ_RETRIES = 3;
const retryMs = (): number => {
  const seam = Number(process.env.SHEEP_TEST_RETRY_MS);
  return Number.isFinite(seam) && seam >= 0 ? seam : 5_000;
};
/**
 * Wrangler's one transient (station phase 4): right after a rollout, a
 * redeploy uploads the Worker and then fails to attach the container
 * application, "Could not deploy container application as durable
 * object was not found in list of bindings". The same deploy is run once
 * more after this gap (`SHEEP_TEST_RETRY_MS` shortens it in tests).
 */
const CONTAINER_ATTACH_LINE = "Could not deploy container application";
const deployRetryMs = (): number => {
  const seam = Number(process.env.SHEEP_TEST_RETRY_MS);
  return Number.isFinite(seam) && seam >= 0 ? seam : 20_000;
};

/**
 * A read of the account API or the home during a wait, retried: a thrown
 * error (the network, a timeout, a body that is not the API's) is said
 * once on stderr and tried again, three times; three failures end the
 * read as `undefined`, and the wait reports what it knows rather than
 * failing a deploy the account has already taken (station phase 3).
 */
async function retried<T>(what: string, read: () => Promise<T>, say: (text: string) => void): Promise<{ ok: true; value: T } | { ok: false }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return { ok: true, value: await read() };
    } catch (error) {
      if (attempt >= READ_RETRIES) return { ok: false };
      const message = error instanceof Error ? error.message : String(error);
      say(`sheep: ${what} did not answer (${message.split("\n")[0]}); retrying\n`);
      await sleep(retryMs());
    }
  }
}

/** A rollout's step under way: the last step that has started and not completed, else the first pending one, else the last; `2 of 2 (100%)`. */
function currentStep(rollout: Rollout): { index: number; total: number; text: string; last: boolean; underWay: boolean } | undefined {
  const { steps } = rollout;
  if (steps.length === 0) return undefined;
  const started = (step: Rollout["steps"][number]) => step.status !== "completed" && step.status !== "pending" && step.status !== "not_started";
  let index = steps.findIndex(started);
  const underWay = index !== -1;
  if (index === -1) index = steps.findIndex((step) => step.status === "pending" || step.status === "not_started");
  if (index === -1) index = steps.length - 1;
  const step = steps[index]!;
  return { index, total: steps.length, text: `${index + 1} of ${steps.length}${step.percentage === null ? "" : ` (${step.percentage}%)`}`, last: index === steps.length - 1, underWay };
}

/**
 * Waits for the rollout that a redeploy with a new image starts: the one
 * among the application's rollouts targeting the derived config's image.
 * None found is `none`. A status that is a failure word, or an error the
 * application names, is an `Error` (exit 1). Running out of the budget is
 * reported as `progressing`, not thrown: the Worker is deployed, and the
 * platform finishes the rollout on its own.
 */
async function waitForRollout(api: AccountApi, accountId: string, name: string, image: string, before: ApplicationState | undefined, deadline: number, say: (text: string) => void): Promise<DeployReport["rollout"]> {
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  if (before === undefined) return { status: "none", step: null, healthy: null, seconds: 0, from: null };
  // What the configuration named before this deploy, when that is not the image being deployed; after the platform has mirrored an
  // image it is that mirror's reference, which is what the application was serving and so what this rolls from.
  const from = before.image !== image ? before.image : null;
  let lastSaid = started;
  let step: string | null = null;
  let healthy: number | null = null;
  const unknown = () => ({ status: "unknown", step, healthy, seconds: seconds(), from });
  for (;;) {
    // The rollout first, then the application: the rollout decides, and the application's read is for the errors it reports and the instances it has.
    const rollouts = await retried("the account API", () => api.rollouts(accountId, before.id), say);
    if (!rollouts.ok) return unknown();
    const rollout = rollouts.value.find((candidate) => candidate.targetImage === image);
    if (rollout === undefined) return { status: "none", step: null, healthy, seconds: seconds(), from };
    if (ROLLOUT_FAILED.has(rollout.status)) throw new Error(`the rollout of ${image} to the container application ${name} ${rollout.status} (version ${rollout.currentVersion ?? "?"} → ${rollout.targetVersion ?? "?"}); the old image serves; \`sheep home deploy\` again retries the rollout`);
    const current = currentStep(rollout);
    step = current?.text ?? null;
    const read = await retried("the account API", () => api.applicationState(accountId, name), say);
    if (!read.ok) return unknown();
    const state = read.value;
    if (state === undefined) return { status: "none", step, healthy, seconds: seconds(), from };
    if (state.health.errors.length > 0) throw new Error(`the container application ${name} reports an error during its rollout: ${state.health.errors.join("; ")}; the Worker is deployed, and \`sheep home deploy\` again retries the rollout`);
    const { instances } = state.health;
    healthy = instances.healthy;
    // The rollout's own word ends the wait. Not "and the configuration names the image": the platform mirrors the image into its own
    // registry, so an application deployed from a Docker Hub digest ends up configured with a `registry.cloudflare.com/…` reference
    // of another digest, and that condition can never become true (11 Sep 2026).
    if (rollout.status === "completed") return { status: "completed", step, healthy, seconds: seconds(), from };
    // The last step under way with a healthy instance: the platform finishes it on its own (a rollout's status stayed `progressing` past 600 s once).
    if (current?.last && current.underWay && instances.healthy >= 1) return { status: "rolling", step, healthy, seconds: seconds(), from };
    if (Date.now() >= deadline) return { status: "progressing", step, healthy, seconds: seconds(), from };
    if (Date.now() - lastSaid >= ROLLOUT_SAY_MS) {
      lastSaid = Date.now();
      say(`sheep: rollout to ${name}: ${step === null ? "" : `step ${step}, `}${instances.healthy} healthy, ${instances.starting} starting, ${instances.scheduling} scheduling, ${seconds()}s\n`);
    }
    await sleep(ROLLOUT_POLL_MS);
  }
}

/**
 * Waits until the application of the Worker's name has a healthy instance;
 * an instance that failed, or an error the application names, is an
 * `Error` (exit 1); running out of time is reported, not thrown.
 */
async function waitForContainers(api: AccountApi, accountId: string, name: string, say: (text: string) => void): Promise<DeployReport["containers"]> {
  const started = Date.now();
  const deadline = started + CONTAINERS_WAIT_MS;
  let last: ApplicationHealth | undefined;
  for (;;) {
    const read = await retried("the account API", () => api.applicationHealth(accountId, name), say);
    const seconds = Math.round((Date.now() - started) / 1000);
    // The API stopped answering: the last counts seen, and the deploy goes on; the Worker is deployed either way.
    if (!read.ok) return { ...pick(last), seconds };
    last = read.value;
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

/** The Worker secret the home's sheep call the model with: what a deploy puts, and what a machine keeping no key requires the Worker to hold already. */
export const KEY_SECRET = "SHEEP_ANTHROPIC_API_KEY";

/**
 * One `wrangler secret put`, the value on stdin and never an argument.
 * The one place a secret is put: `deploy` puts its three through here, and
 * the stile's `key` step puts the model key through `putModelKey` below,
 * which is this and the derived config again — so there is one
 * implementation of the put and not a second one beside it.
 */
async function putSecret(options: { bin: string; config: string; cwd: string; secret: string; value: string; token: string; accountId: string }): Promise<void> {
  const put = await wrangler(options.bin, ["secret", "put", options.secret, "--config", options.config, "--env", "pen"], { token: options.token, accountId: options.accountId, cwd: options.cwd, stdin: `${options.value}\n` });
  if (put.code !== 0) throw new Error(`wrangler secret put ${options.secret} --config ${options.config} --env pen exited ${put.code}:\n${tail(put)}`);
}

/**
 * The model key onto a Worker that is already live: the stile's `key`
 * step (stile phase 1), which asks for the key after the station is
 * deployed, as journey 1 does. It is deploy's fourth step for one secret
 * and nothing else — the same derived config, the same wrangler, the same
 * stdin — so the stile adds no second deploy path. A put is a
 * config-only version and not a rollout, so a turn running on the home is
 * undisturbed by it.
 */
export async function putModelKey(options: { name: string; key: string; token: string; accountId: string; say?: (text: string) => void }): Promise<void> {
  const say = options.say ?? (() => {});
  const stamp = readStamp();
  const bin = wranglerBin(stamp, say);
  const derived = writeDerivedConfig(options.name, stamp);
  await putSecret({ bin, config: derived.path, cwd: dirname(derived.path), secret: KEY_SECRET, value: options.key, token: options.token, accountId: options.accountId });
}

/** The five steps of a deploy, in the order they happen, as the midway message names them. */
const DEPLOY_STEPS = ["the account token and the model key", "the account read", "the Worker uploaded by wrangler", "the secrets put", "the config written and the container application healthy"];

/**
 * The first line of a failure after `wrangler deploy` returned (journey 2
 * step 6): which of the five steps are done, that the new Worker is already
 * live whatever else failed, and that running the command again finishes it.
 * Without it the sentence is wrangler's tail, and a reader cannot tell a
 * deploy that made nothing from one that made half the station.
 */
function midway(name: string, home: string, done: number): string {
  return `the deploy of ${name} stopped after step ${done} of 5. Done: ${DEPLOY_STEPS.slice(0, done).join("; ")}. Not done: ${DEPLOY_STEPS.slice(done).join("; ")}. The new Worker is already live at ${home}, and \`sheep home deploy\` again finishes it.`;
}

/**
 * `sheep home deploy`. Throws a `Refusal` (exit 2, nothing made) before the
 * account is touched, and an `Error` (exit 1) after: a deploy that failed
 * midway is run again, and the redeploy finishes it.
 */
export async function deploy(options: DeployOptions = {}): Promise<DeployReport> {
  const say = options.say ?? (() => {});
  // 1. Nothing without the account token, wherever this machine keeps it. The key is not required here: a machine that
  // keeps none can still upgrade a home that already holds one, which is what a second machine that joined is (step 3').
  const token = accountToken()?.value;
  if (token === undefined) throw STOPS.deployAccount();
  const key = modelKey()?.value;
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

  // 2'. The model key, when this machine keeps none: the Worker's secret names are asked of the account (a GET, before
  // anything is made), and the key's presence among them is required. Found, the redeploy leaves the key the home holds.
  // With `keyLater` the caller is the stile, whose own `key` step puts the key through `putModelKey` the moment this
  // deploy returns (stile phase 1): the Worker is not asked to hold one already, since on a first sitting it holds none.
  const keyState: DeployReport["key"] = key !== undefined ? "put" : options.keyLater === true ? "later" : "left";
  if (key === undefined && options.keyLater === true) say(`sheep: the model key is put on the home after this deploy, at the step that asks for it\n`);
  else if (key === undefined) {
    const held = await api.secrets(account.id, name);
    if (!held.includes(KEY_SECRET)) throw STOPS.deployKey(name);
    say(`sheep: no model key is kept on this machine; the home keeps its own, and this deploy leaves it\n`);
  }

  // 3. The deploy: wrangler over the derived config, the token in its environment.
  const stamp = readStamp();
  const bin = wranglerBin(stamp, say);
  const derived = writeDerivedConfig(name, stamp);
  const cwd = dirname(derived.path);
  const faux = options.faux === true;
  // Before a redeploy, the application as it is: a new image makes the deploy a rollout, and this is what it rolls from.
  const before = taken.applications.some((application) => application.name === name) ? await api.applicationState(account.id, name) : undefined;
  say(`sheep: ${state === "deployed" ? "deploying" : "redeploying"} ${name} as ${home} with the image ${derived.image}${faux ? " and the faux provider" : ""}\n`);
  const deployArgs = ["deploy", "--config", derived.path, "--env", "pen", ...(faux ? ["--var", "SHEEP_PROVIDER:faux"] : [])];
  let deployed = await wrangler(bin, deployArgs, { token, accountId: account.id, cwd });
  let deployRetried = false;
  if (deployed.code !== 0 && `${deployed.stdout}\n${deployed.stderr}`.includes(CONTAINER_ATTACH_LINE)) {
    const line = `${deployed.stdout}\n${deployed.stderr}`.split("\n").find((candidate) => candidate.includes(CONTAINER_ATTACH_LINE))?.trim() ?? CONTAINER_ATTACH_LINE;
    say(`sheep: wrangler could not attach the container application (${line}); retrying once in ${Math.round(deployRetryMs() / 1000)}s\n`);
    await sleep(deployRetryMs());
    deployRetried = true;
    deployed = await wrangler(bin, deployArgs, { token, accountId: account.id, cwd });
  }
  if (deployed.code !== 0) throw new Error(`wrangler deploy --config ${derived.path} --env pen exited ${deployed.code}:\n${tail(deployed)}`);

  // Past here the Worker is live, so every failure is exit 1 and says which of the five steps are done (journey 2 step 6).
  let reached = 3;
  try {
    // 4. The secrets, each on stdin. The token is generated once and kept in the config; a redeploy reuses the config's.
    // The key is put when this machine keeps one, and left as it is when it does not: the home holds its own.
    const sheepToken = recorded !== undefined && typeof existing?.token === "string" && existing.token !== "" ? existing.token : randomBytes(24).toString("hex");
    const secrets: [string, string][] = [["SHEEP_TOKEN", sheepToken], ...(key === undefined ? [] : ([[KEY_SECRET, key]] as [string, string][])), ["PEN_CELL_ORIGIN", home]];
    for (const [secret, value] of secrets) await putSecret({ bin, config: derived.path, cwd, secret, value, token, accountId: account.id });
    reached = 4;

    // 5. The config, without the local marker; then the container application waited for, the rollout, and only then the address and the stamp.
    const { local: _local, ...rest } = existing ?? {};
    writeConfigFile({ ...rest, home, token: sheepToken, name });
    say(`sheep: waiting for a container instance of ${name} to be healthy\n`);
    const waitStarted = Date.now();
    const containers = await waitForContainers(api, account.id, name, say);
    // Then the rollout, when the image changed: the instances above may all be the old image's until it completes.
    if (before !== undefined && before.image !== derived.configured) say(`sheep: waiting for the rollout of ${derived.configured} to ${name}\n`);
    const rollout = await waitForRollout(api, account.id, name, derived.configured, before, waitStarted + ROLLOUT_WAIT_MS, say);
    // The address, then the stamp: after the waits, since a deployment takes seconds to propagate and a redeploy's `GET /home`
    // answered the old build when read right after wrangler (station phase 3). A redeploy polls until the stamp is this
    // command's, up to a minute; a first deploy, or an unstamped command, reads it once.
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
    const cli = cliBuild();
    let homeBuild: BuildSide | null = null;
    const stampReport: DeployReport["stamp"] = { moved: false, seconds: 0 };
    if (answers) {
      const stampStarted = Date.now();
      const stampDeadline = stampStarted + STAMP_WAIT_MS;
      const client = new Home({ home: probe, token: sheepToken });
      for (;;) {
        const read = await retried("the home", () => client.build(), say);
        homeBuild = read.ok ? read.value : null;
        stampReport.moved = homeBuild !== null && homeBuild.commit === cli.commit && homeBuild.builtAt === cli.builtAt;
        stampReport.seconds = Math.round((Date.now() - stampStarted) / 1000);
        if (!read.ok || stampReport.moved || state === "deployed" || cli.builtAt === null || Date.now() >= stampDeadline) break;
        await sleep(STAMP_POLL_MS);
      }
    }
    return {
      home,
      name,
      state,
      answers,
      deployRetried,
      account,
      plan: { ...plan, price: PLAN.price },
      subdomain: { name: subdomain, registered },
      image: derived.image,
      faux,
      key: keyState,
      config: { path: configPath(), wrangler: derived.path },
      kennel: sheepDir(),
      build: { home: homeBuild, cli },
      containers,
      rollout,
      stamp: stampReport,
      next: 'sheep new -- "…"',
    };
  } catch (error) {
    throw new Error(`${midway(name, home, reached)}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

/* Delete. */

export interface DeleteOptions {
  /** `--name`: the Worker's name, when the config records none, or the same one when it does. */
  name?: string;
  /** Reads the confirmation: the typed line at a terminal, one line of stdin without one. */
  confirm?: (prompt: string) => Promise<string>;
  say?: (text: string) => void;
}

/**
 * What the delete lists before it asks (station phase 3): the address, the
 * counts from the home with the config's token (`null` when the config
 * has no token for this station or the home did not answer), the
 * container application's id when the account has one, and the config.
 */
export interface DeleteListing {
  home: string | null;
  sessions: number | null;
  pastures: number | null;
  application: { id: string } | null;
  config: string;
}

export interface DeleteReport {
  name: string;
  account: Account;
  listing: DeleteListing;
  worker: "deleted" | "absent";
  application: { id: string; state: "deleted" } | null;
  config: { path: string; state: "cleared" | "removed" | "absent" };
  /** The listing's session count when the Worker was deleted, 0 when there was none to delete, null when the count was unknown. */
  sessionsDeleted: number | null;
}

/** How long the listing waits for the home's two answers: a station that does not answer is reported as unknown, not waited for. */
const LISTING_TIMEOUT_MS = 10_000;

/**
 * The counts, from `GET /sessions` and `GET /pastures` with the token:
 * `null` for both when there is no token or the home does not answer as a
 * sheep home, and `null` for either when its request fails.
 */
async function countAtHome(home: string | null, token: string | undefined): Promise<{ sessions: number | null; pastures: number | null }> {
  const none = { sessions: null, pastures: null };
  if (home === null || token === undefined || token === "") return none;
  if ((await whoAnswers(home)) !== "sheep") return none;
  const client = new Home({ home, token });
  const within = <T>(promise: Promise<T>): Promise<T | null> =>
    Promise.race([promise.catch(() => null), new Promise<null>((resolveTimeout) => setTimeout(() => resolveTimeout(null), LISTING_TIMEOUT_MS).unref())]);
  const [sessions, pastures] = await Promise.all([within(client.list()), within(client.pastures())]);
  return { sessions: Array.isArray(sessions) ? sessions.length : null, pastures: Array.isArray(pastures) ? pastures.length : null };
}

/** The listing as prose: the sentence naming what goes, then one line each, as `sheep home delete` prints them before the prompt. */
export function describeListing(name: string, listing: DeleteListing): string {
  const unknown = "unknown (the home did not answer)";
  return [
    `deleting ${name}: the Worker at ${listing.home ?? "(no address known)"}, its Durable Objects, and its container application ${name}`,
    `sessions: ${listing.sessions ?? unknown}`,
    `pastures: ${listing.pastures ?? unknown}`,
    `container application: ${listing.application === null ? "none on the account" : listing.application.id}`,
    `config: ${listing.config}`,
  ].join("\n");
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
 * `sheep home delete`. The listing before the prompt names what goes and
 * how much is in it; the account is asked with GETs alone until the name
 * is typed. A `Refusal` before anything is deleted is exit 2.
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
  const token = accountToken()?.value;
  if (token === undefined) throw STOPS.deleteAccount();

  // The listing: the account's side (GETs), then the home's counts with the config's token, when the config names this station.
  const api = new AccountApi(token);
  const account = await api.account();
  const [taken, subdomain] = await Promise.all([api.taken(account.id), api.subdomain(account.id)]);
  const found = taken.applications.find((candidate) => candidate.name === name);
  const home = subdomain === undefined ? (typeof existing?.home === "string" ? existing.home : null) : address(name, subdomain);
  // The token is this station's when the config records the name, or names the address; a joined kennel deleting another name has none for it.
  const configToken = typeof existing?.token === "string" && (recorded === name || (home !== null && existing.home === home)) ? existing.token : undefined;
  const probe = process.env.SHEEP_TEST_STATION_URL ?? home;
  const counts = await countAtHome(probe, configToken);
  const listing: DeleteListing = { home, ...counts, application: found === undefined ? null : { id: found.id }, config: configPath() };
  say(`${describeListing(name, listing)}\n`);

  // The confirmation: the name, typed, or nothing happens. With no terminal to type at and nothing on stdin, the act is
  // the shepherd's and the command cannot stand in for them: a stop with `terminal` (stile phase 0).
  const atTerminal = process.stdin.isTTY === true;
  const confirm = options.confirm ?? readLine;
  const typed = await confirm("type the name to confirm: ");
  if (typed === "" && !atTerminal) throw STOPS.deleteTerminal(name);
  if (typed !== name) throw new Refusal(typed === "" ? `nothing typed; nothing deleted (the name is ${name})` : `${typed} is not ${name}; nothing deleted`);

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
  // The sessions went with the Worker's objects: the listing's count, or none when there was no Worker to delete.
  const sessionsDeleted = worker === "deleted" ? listing.sessions : 0;
  say(`sessions deleted: ${sessionsDeleted ?? "unknown"}\n`);
  return { name, account, listing, worker, application, config: { path: configPath(), state: config }, sessionsDeleted };
}
