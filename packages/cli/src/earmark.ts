/**
 * The verb's half of earmark (earmark phase 1): `sheep new --secret <NAME>
 * [--secret <NAME> …]`, a secret for one sheep. The values are stdin, one
 * line per name in the order the names were given, read before the mint
 * and sent in its one request as `secrets: {NAME: value}`; never an
 * argument, so no value is in a shell's history or a `ps` line. Every
 * refusal here is before anything is asked of the home, and names a name
 * at most, never a value. Where the home refuses the same thing (a bad
 * name, a value that is not one line, a pastureless sheep's name other
 * than `GIT_TOKEN`), the sentence is the home's, word for word.
 */
import { SECRET_NAME } from "./pasture.js";

/** The one secret a sheep born into no pasture can carry: it has no setup, so only the broker's `GIT_TOKEN` reaches anything. */
export const PASTURELESS_SECRET = "GIT_TOKEN";

/** Stdin a terminal (journey 3 step 1): the pasture's rule, and the one sentence that says how to give the value. */
export const SECRET_NOT_TYPED = "a secret's value is read from stdin, never taken as an argument and never typed: pipe it in, one line per --secret";
/** Neither `--detach` nor a prompt (journey 3 step 5): pi's terminal would open on the stdin the values were read from. */
export const SECRET_NEEDS_STDIN = "pi's terminal needs stdin, and a secret is read from it: with --secret, pass --detach or a prompt after --";
/** `--secret` on `attach` or `-c` (journey 3 step 6). */
export const SECRET_AT_MINT = "a sheep's secrets are given at its mint: --secret is sheep new's";

/**
 * The names' refusal, before stdin is read (journey 3 steps 3 and 4): a
 * name that is not an environment variable's, a name given twice, and any
 * name but `GIT_TOKEN` for a sheep born into no pasture. `undefined` is a
 * `--secret` with nothing after it.
 */
export function refuseNames(names: readonly (string | undefined)[], pasture: string | undefined): string | undefined {
  const seen = new Set<string>();
  for (const name of names) {
    if (name === undefined || !SECRET_NAME.test(name)) return `a secret's name is an environment variable's, not ${JSON.stringify(name ?? "")}`;
    if (seen.has(name)) return `a secret's name is an environment variable's, once: ${name} is given twice`;
    seen.add(name);
    if (pasture === undefined && name !== PASTURELESS_SECRET) return `a sheep born into no pasture has no setup, so ${PASTURELESS_SECRET} is the only secret it can carry, not ${name}`;
  }
  return undefined;
}

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The values from stdin's text, matched to the names in the order given
 * (journey 3 step 2): one line per name, a final newline ending the last
 * line, and a `\r` before a newline dropped. A count of lines that is not
 * the count of names, or an empty line, is refused; so is a value the home
 * would refuse as not one line (a `\r` with no newline after it).
 */
export function secretsFrom(text: string, names: readonly string[]): { secrets: Record<string, string> } | { refused: string } {
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (text.endsWith("\n")) lines.pop();
  if (lines.length !== names.length) return { refused: `one line of stdin per --secret name, in order: ${count(names.length, "name")}, ${count(lines.length, "line")}` };
  const secrets: Record<string, string> = {};
  for (const [index, name] of names.entries()) {
    const value = lines[index]!;
    if (value === "") return { refused: `one line of stdin per --secret name, in order: the line for ${name} is empty` };
    if (value.includes("\r")) return { refused: `the value of the secret ${name} is not a non-empty string of one line` };
    secrets[name] = value;
  }
  return { secrets };
}

/** Stdin's whole text, or `undefined` when stdin is a terminal, where nothing is read and nothing is asked. */
export async function readPipedSecrets(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The whole of the verb's side, before the home: for `new`, the names
 * checked, then the terminal that would open, then stdin; for `attach` and
 * `-c`, the one refusal. The secrets, or the sentence to refuse with.
 */
export async function earmarks(command: string, options: { names: readonly (string | undefined)[]; pasture?: string; detach: boolean; prompt?: string }): Promise<{ secrets?: Record<string, string> } | { refused: string }> {
  if (options.names.length === 0) return {};
  if (command === "attach" || command === "-c" || command === "--continue") return { refused: SECRET_AT_MINT };
  if (command !== "new") return {};
  const refused = refuseNames(options.names, options.pasture);
  if (refused !== undefined) return { refused };
  if (!options.detach && options.prompt === undefined) return { refused: SECRET_NEEDS_STDIN };
  const text = await readPipedSecrets();
  if (text === undefined) return { refused: SECRET_NOT_TYPED };
  return secretsFrom(text, options.names as string[]);
}
