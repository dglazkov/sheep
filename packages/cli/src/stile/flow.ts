/**
 * The stile's flow: the seven steps as a machine (stile phase 1).
 *
 * `sheep setup` at a terminal is the shepherd's one sitting. This file is
 * what happens in it, and knows nothing about a screen: it calls three
 * callbacks — `ask(step, prompt, hidden)`, `say(step, line)`, and
 * `choose(step, options)` — and between them it runs the code that
 * already exists: `setupCli`, `installSkill`, `makeKennel`, `AccountApi`,
 * `deploy()`, `putModelKey()`. **The stile adds no second deploy path**:
 * the station step is `deploy()` and the key step is deploy's fourth step
 * for one secret, shared with it.
 *
 * `screen.ts` implements the three over pi-tui; a scripted answerer
 * implements them in a test. The dog's `sheep setup` does not come
 * through here at all: it is `setup()` in `setup.ts`, unchanged, and
 * `cli.ts` forks on the tty.
 *
 * **The rule about values.** A value the shepherd types is read at a
 * hidden prompt and goes to exactly two places: `~/.sheep/credentials`,
 * mode 600, and — for the model key — the home's own secret, over
 * wrangler's stdin. It is never in a line handed to `say`, never in an
 * argument, never in the report this returns, and never in `--json`.
 * `Count` below carries how many values were typed and not one of them.
 */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { configPath, isMachineKennel, readConfigFile, realPath, samePath, sheepDir } from "../config.js";
import { CREDENTIAL_ENV, machineCredentialsPath, modelKey, readCredentials, writeCredentials } from "../credentials.js";
import { type Account, AccountApi, deploy, type DeployReport, KEY_SECRET, PLAN, plansPage, putModelKey, Refusal, validateName } from "../deploy.js";
import { whoAnswers } from "../local.js";
import { kennelName, mintName } from "../name.js";
import { checkoutRoot, installSkill, type KennelReport, makeKennel, setupCli, type SkillReport } from "../setup.js";
import { type StepName, STEPS } from "./words.js";

export { type StepName, STEPS };

/** One of the answers a step offers. `value` is what the flow reads; `label` is what the screen draws. */
export interface Option {
  value: string;
  label: string;
}

/**
 * What a screen, or a script, gives the flow. Three callbacks and no
 * more: everything else a step does is code that already exists.
 */
export interface Driver {
  /**
   * One value, typed. `hidden` means it is a credential: the screen shows
   * a dot per character and never the character. The flow never hands
   * what comes back to `say`.
   */
  ask(step: StepName, prompt: string, hidden: boolean): Promise<string>;
  /**
   * The step's line: what it is doing now while it is the cursor, and
   * what it settled on once it is done, which is the last line said. A
   * deploy's progress comes through here, line by line. Never a value.
   */
  say(step: StepName, line: string): void;
  /** One of the options, by `value`. The first is the default, and Enter takes it. */
  choose(step: StepName, options: Option[]): Promise<string>;
}

/**
 * The count (journey 1's first criterion): what the shepherd had to do.
 * The account ring prints it, and nothing in it is a value.
 */
export interface Count {
  /** Values typed at a hidden prompt: the account token and the model key, and so two in a first sitting. */
  typed: number;
  /** Choices answered by taking the offered default, Enter alone: `where` and `station` in a first sitting. */
  defaults: number;
  /** Choices answered with something that was not the default: the plan's re-check is the one a first sitting has. */
  yes: number;
  /** A value asked for a second time, because the first was refused. A first sitting's is zero. */
  askedTwice: number;
  /** The variables a credential came from instead of a file, by name; empty when nothing in the environment was used. */
  variables: string[];
}

/** Where the shepherd said this machine's settings go. */
export type Where = "machine" | "here" | "kennel";

export interface FlowOptions {
  /** The working directory: where `this directory` would put the kennel and the skill. */
  dir: string;
  /** `--no-install` turns it off: report the command missing rather than installing it. */
  install: boolean;
  /** `--name`, passed through to `deploy()` as the new station's name. */
  name?: string;
  /** `--faux`, passed through to `deploy()`: the scripted model as the station's var, the rings' flag. */
  faux?: boolean;
  /** `--subdomain`, passed through to `deploy()` for an account that has none. */
  subdomain?: string;
  driver: Driver;
}

export interface FlowReport {
  where: Where;
  /** The kennel this sitting settled on: `~/.sheep`, or `<dir>/.sheep`, or the one found above. */
  kennel: string;
  skill: SkillReport | { checkout: string };
  kennelMade: KennelReport | null;
  account: Account;
  /** The station: its name, its address, and whether this sitting deployed it or found it answering. */
  station: { name: string; home: string; state: "deployed" | "redeployed" | "found" };
  /** What happened to the model key: put by the deploy from what was kept, put by the key step after it, or left as the home holds it. */
  key: "put" | "put-after" | "left";
  /** The paths, for the last step's line: never a value. */
  credentials: string;
  config: string;
  count: Count;
  /** The one sentence to say to their agent. */
  next: string;
}

/** The sentence the last step ends on: what the shepherd says to their coding agent, and the whole of their part from here. */
export const AGENT_SENTENCE = "sheep is set up on this machine; run `sheep --agent-help` and herd.";

/** The command step's line, as short as the mock's: the version and which of the states `setupCli` came back with. */
function commandLine(cli: ReturnType<typeof setupCli>): string {
  const version = cli.version?.replace(/ \(.*\)$/, "") ?? "sheep";
  if (cli.state === "on-path") return `${version}, on PATH`;
  if (cli.state === "installed") return cli.bin === undefined ? `${version}, installed` : `${version}, installed; open a new terminal for PATH`;
  if (cli.state === "checkout") return `${version}, from a checkout`;
  if (cli.state === "not-installed") return "not on PATH; --no-install, so not installed";
  return `not on PATH; npm install -g ${cli.spec} failed`;
}

/** A path as the last step prints it: under the home directory with `~`, so a line reads the same on every machine. */
export function tilde(path: string): string {
  // Compared as real paths too: a config found by walking up from the working directory is a real path, and HOME may not be.
  for (const [home, candidate] of [[homedir(), path], [realPath(homedir()), realPath(path)]] as const) {
    if (candidate === home) return "~";
    if (candidate.startsWith(`${home}/`)) return `~${candidate.slice(home.length)}`;
  }
  return path;
}

/**
 * The seven steps, in order. Every value read here is read at a hidden
 * prompt and kept in `~/.sheep/credentials`; nothing typed reaches a line.
 */
export async function runFlow(options: FlowOptions): Promise<FlowReport> {
  const { driver, dir } = options;
  const count: Count = { typed: 0, defaults: 0, yes: 0, askedTwice: 0, variables: [] };
  if (options.name !== undefined) validateName(options.name);

  // 1. command. Setup's first thing as collar built it; nothing asked.
  const cli = setupCli({ install: options.install, say: (text) => driver.say("command", text.replace(/^sheep: /, "").trim()) });
  driver.say("command", commandLine(cli));

  // 2. where. `npx skills add`'s question, and it decides where the kennel is. A directory already inside a kennel says
  // so, and the question is whether to use that one; everywhere is the default otherwise, and Enter takes it.
  const found = sheepDir(dir);
  const machineKennel = join(homedir(), ".sheep");
  const ownKennel = join(dir, ".sheep");
  const inherited = isMachineKennel(found) ? undefined : found;
  // Everywhere cannot be offered where a kennel is already reachable: every command here would still find that one first.
  const whereOptions: Option[] =
    inherited === undefined
      ? [
          { value: "machine", label: "everywhere on this machine" },
          { value: "here", label: "this directory" },
        ]
      : samePath(inherited, ownKennel)
        ? [{ value: "kennel", label: "this directory's kennel, already here" }]
        : [
            { value: "kennel", label: `the kennel above, ${tilde(inherited)}` },
            { value: "here", label: "this directory, a kennel of its own" },
          ];
  const where = (await driver.choose("where", whereOptions)) as Where;
  if (where === whereOptions[0]!.value) count.defaults++;
  else count.yes++;
  // The skill goes where the answer said: `~/.agents/skills/sheep` for everywhere, `<dir>/.agents/skills/sheep` here,
  // each with its `.claude/skills` doorway beside it. A checkout of sheep carries its own, and is left alone.
  const skillDir = where === "machine" ? homedir() : dir;
  const inCheckout = checkoutRoot(skillDir);
  const skill: FlowReport["skill"] = inCheckout === undefined ? installSkill(skillDir) : { checkout: inCheckout };
  let kennelMade: KennelReport | null = null;
  if (where === "here") kennelMade = makeKennel(dir);
  // Everywhere: `~/.sheep`, which every directory without a kennel of its own already falls through to. Nothing is made here.
  if (where === "machine") mkdirSync(machineKennel, { recursive: true });
  const kennel = sheepDir(dir);
  driver.say("where", where === "machine" ? "everywhere on this machine" : where === "here" ? "this directory" : `the kennel at ${tilde(kennel)}`);

  // 3. account. The Cloudflare API token at a hidden prompt, kept, then verified the way deploy verifies it: whose token.
  // A token the account rejects is asked again with the reason; one kept already and still accepted asks nothing.
  let kept = readCredentials().cloudflare;
  if (kept !== undefined && kept.from === "environment") count.variables.push(CREDENTIAL_ENV.cloudflare);
  let token = kept?.value;
  let account: Account;
  for (;;) {
    if (token === undefined) {
      token = (await driver.ask("account", "Cloudflare API token", true)).trim();
      count.typed++;
      if (token === "") {
        driver.say("account", "nothing was typed; the token is what proves the account is yours");
        token = undefined;
        count.askedTwice++;
        continue;
      }
      writeCredentials({ cloudflare: token });
      kept = { value: token, from: "machine", path: machineCredentialsPath() };
    }
    try {
      account = await new AccountApi(token).account();
      break;
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      // A token from the environment outranks anything typed here, so asking again would keep a value the deploy never reads.
      if (kept?.from === "environment") throw new Refusal(`${CREDENTIAL_ENV.cloudflare} in this environment is not accepted (${error.message}), and it takes precedence over anything typed here; nothing was kept`);
      driver.say("account", error.message);
      count.askedTwice++;
      token = undefined;
    }
  }
  const accountToken = token;
  const api = new AccountApi(accountToken);
  driver.say("account", account.name);

  // 4. plan. On the plan: filled in. Not: the plans page, and Enter re-checks the account, so the shepherd turns it on
  // at the dashboard and comes back to this same screen.
  for (;;) {
    const plan = await api.plan(account.id);
    if (plan !== undefined) {
      driver.say("plan", `${PLAN.name}, ${PLAN.price}`);
      break;
    }
    driver.say("plan", `${account.name} is not on ${PLAN.name} yet; turn it on at the dashboard, then check again:`);
    driver.say("plan", plansPage(account.id));
    await driver.choose("plan", [{ value: "recheck", label: `turned on at the dashboard; check again` }]);
    count.yes++;
  }

  // 5. station. A kennel whose config already names a station that still answers is filled in and nothing is deployed;
  // otherwise `new <name>`, minted for the kennel as kennel's rule says, and Enter takes it. Join is stile phase 2's.
  const existing = readConfigFile();
  const recorded = typeof existing?.name === "string" ? existing.name : undefined;
  const recordedHome = typeof existing?.home === "string" ? existing.home : undefined;
  let station: FlowReport["station"];
  let deployed: DeployReport | undefined;
  if (recorded !== undefined && recordedHome !== undefined && (await whoAnswers(recordedHome)) === "sheep") {
    station = { name: recorded, home: recordedHome, state: "found" };
    driver.say("station", recordedHome);
  } else {
    const taken = await api.taken(account.id);
    const names = new Set([...taken.workers, ...taken.applications.map((application) => application.name)]);
    const minted = recorded ?? mintName(kennelName(dir), names, options.name);
    await driver.choose("station", [{ value: "new", label: `new ${minted}` }]);
    count.defaults++;
    deployed = await deploy({
      name: minted,
      subdomain: options.subdomain,
      faux: options.faux,
      // The key is the next step's, and on a first sitting nothing keeps one yet: deploy is told so rather than stopping.
      keyLater: modelKey() === undefined,
      say: (text) => driver.say("station", text.replace(/^sheep: /, "").trim()),
    });
    station = { name: deployed.name, home: deployed.home, state: deployed.state };
    driver.say("station", deployed.home);
  }

  // 6. key. The Anthropic key at a hidden prompt, kept, then put on the home as its secret through wrangler's stdin, as
  // deploy does and through deploy's own code. Kept already: put without asking, since a put is idempotent and a rotated
  // key is this sitting run again. Kept nowhere, on a station this sitting did not make: the Worker's secret names are
  // asked of the account, and a home that holds its own is left with it and nothing is asked (journey 2 step 4).
  let keyState: FlowReport["key"];
  const keptKey = modelKey();
  if (keptKey !== undefined && keptKey.from === "environment") count.variables.push(CREDENTIAL_ENV.anthropic);
  if (deployed?.key === "put") {
    keyState = "put";
    driver.say("key", "put on the home as its secret");
  } else if (keptKey === undefined && deployed?.state !== "deployed" && (await api.secrets(account.id, station.name)).includes(KEY_SECRET)) {
    keyState = "left";
    driver.say("key", "the home holds its own; nothing asked");
  } else {
    let value = keptKey?.value;
    while (value === undefined || value === "") {
      value = (await driver.ask("key", "Anthropic API key", true)).trim();
      count.typed++;
      if (value === "") {
        driver.say("key", "nothing was typed; the key is what the home's sheep call the model with");
        count.askedTwice++;
      }
    }
    if (keptKey === undefined) writeCredentials({ anthropic: value });
    driver.say("key", "putting it on the home as its secret");
    await putModelKey({ name: station.name, key: value, token: accountToken, accountId: account.id, say: (text) => driver.say("key", text.replace(/^sheep: /, "").trim()) });
    keyState = deployed === undefined ? "put" : "put-after";
    driver.say("key", "put on the home as its secret");
  }

  const credentials = machineCredentialsPath();
  const config = configPath();
  // The last step is four lines, each said in turn, and the screen keeps all four under it: the address, where the two
  // values are kept, where the config is, and the one sentence to say to their agent.
  driver.say("next", `home: ${station.home}`);
  driver.say("next", `credentials: ${tilde(credentials)}`);
  driver.say("next", `config: ${tilde(config)}`);
  driver.say("next", `say to your agent: ${AGENT_SENTENCE}`);
  return { where, kennel, skill, kennelMade, account, station, key: keyState, credentials, config, count, next: AGENT_SENTENCE };
}
