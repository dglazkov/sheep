/**
 * `sheep home join <address>`: a second machine's way in (station phase 2,
 * journey 2 step 1). The station was deployed from another kennel, on
 * another machine; this one has the package and nothing else. The token is
 * one line of stdin, piped by the person from the first machine's config
 * or a password manager, the way a pasture secret travels: never an
 * argument, never a prompt, never echoed. With a terminal on stdin and
 * nothing piped, the command refuses with a sentence saying to pipe it. A
 * second positional, or anything token-shaped on the command line
 * (`--token`), is refused before any request is made: exit 2.
 *
 * Then two questions of the home. `GET /` must answer `sheep`, or the
 * address is not a sheep home: refused. `GET /home` with the token must
 * answer, or the token is not this home's (a 401): refused. What comes
 * back is the home's stamp and its image, printed beside this command's
 * stamp with the skew line if the two differ.
 *
 * The config is written as `{ home, token }` with no `local` marker and no
 * `name`, keeping whatever else was there. A `name` is not this machine's
 * to keep: the station was deployed from another kennel, whose config
 * records it; a later `sheep home deploy` from this kennel would mint its
 * own, which is correct. `sheep home` afterwards is what it is for any
 * non-local home.
 */
import { configPath, readConfigFile, sheepDir, writeConfigFile } from "./config.js";
import { Refusal } from "./deploy.js";
import { Home, type HomeBuild } from "./home.js";
import { type BuildSide, cliBuild, skewLine, whoAnswers } from "./local.js";

export const PIPE_THE_TOKEN = "the home's token is one line of stdin, never an argument and never typed at a prompt: pipe it in, from the first machine's .sheep/config or a password manager (`sheep home join <address> < token.txt`)";
export const TOKEN_NOT_AN_ARGUMENT = "a token on the command line is refused: it would be in the shell's history and in `ps`; sheep home join takes the address alone, and the token on stdin";
export const NOT_A_SHEEP_HOME = "does not answer as a sheep home";
export const NOT_THIS_HOMES_TOKEN = "the token is not this home's";

export interface JoinOptions {
  /** The address as typed; a trailing slash is dropped. */
  address: string;
  /** Every other positional after the address: any is refused. */
  extra: string[];
  /** Reads the token: one line of stdin, or nothing at a terminal. The default reads the real stdin. */
  readToken?: () => Promise<string | undefined>;
  /** Where progress goes; never the token. */
  say?: (text: string) => void;
}

export interface JoinReport {
  home: string;
  kennel: string;
  config: { path: string; state: "written" };
  build: { home: HomeBuild; cli: BuildSide };
  /** The pen image the home's config named, by digest or by tag; null when the home reports none. */
  image: string | null;
  /** The one-line skew warning, when the two stamps differ; null when they do not. */
  skew: string | null;
}

/** One line of stdin, whole, when stdin is not a terminal; undefined at a terminal, where nothing is asked. */
export function readPipedToken(): Promise<string | undefined> {
  if (process.stdin.isTTY) return Promise.resolve(undefined);
  return new Promise((resolveLine) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => (text += chunk));
    process.stdin.on("end", () => resolveLine(text.split("\n")[0]!.trim()));
    process.stdin.on("error", () => resolveLine(""));
    process.stdin.resume();
  });
}

/** The address's shape, checked before anything is read or asked. */
function normalizeAddress(address: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Refusal(`${address} is not an address; a home's is https://<worker>.<subdomain>.workers.dev`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Refusal(`${address} is not an http(s) address`);
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") throw new Refusal(`${address} is more than a home's address; a home is the origin alone, https://<worker>.<subdomain>.workers.dev`);
  return url.origin;
}

/** Whether a positional or a flag on the command line looks like a token being handed over: refused whatever it is. */
export function refuseTokenOnCommandLine(extra: string[]): void {
  if (extra.length === 0) return;
  const flag = extra.find((arg) => /^--?token(=|$)/.test(arg));
  if (flag !== undefined) throw new Refusal(TOKEN_NOT_AN_ARGUMENT);
  throw new Refusal(`${TOKEN_NOT_AN_ARGUMENT} (got ${extra.length} extra argument${extra.length === 1 ? "" : "s"} after the address)`);
}

export async function join(options: JoinOptions): Promise<JoinReport> {
  const say = options.say ?? (() => {});
  // The refusals that need no request: an argument beyond the address, then the address's shape, then no token piped.
  refuseTokenOnCommandLine(options.extra);
  const home = normalizeAddress(options.address);
  const token = await (options.readToken ?? readPipedToken)();
  if (token === undefined) throw new Refusal(`nothing is piped on stdin; ${PIPE_THE_TOKEN}`);
  if (token === "") throw new Refusal(`stdin was empty; ${PIPE_THE_TOKEN}`);

  // The home: a sheep home, then this token's.
  say(`sheep: asking ${home}\n`);
  const answers = await whoAnswers(home);
  if (answers !== "sheep") throw new Refusal(`${home} ${answers === "nobody" ? "does not answer" : NOT_A_SHEEP_HOME}; nothing was written`);
  let stamp: Awaited<ReturnType<Home["stamp"]>>;
  try {
    stamp = await new Home({ home, token }).stamp();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/^GET \/home: 401\b/.test(message)) throw new Refusal(`${NOT_THIS_HOMES_TOKEN}: ${home} answered 401 to GET /home; nothing was written`);
    throw new Error(`${home} answered GET / as a sheep home and then failed GET /home: ${message}`);
  }

  // The config: the address and the token, no local marker, no name; the rest kept.
  const { local: _local, name: _name, home: _home, token: _token, ...rest } = readConfigFile() ?? {};
  writeConfigFile({ ...rest, home, token });
  const cli = cliBuild();
  const skew = skewLine(stamp.build, cli, false) ?? null;
  return { home, kennel: sheepDir(), config: { path: configPath(), state: "written" }, build: { home: stamp.build, cli }, image: stamp.image, skew };
}
