/**
 * The table: which program runs in which tier, in one place, and the
 * three things generated from it: the router's decision for a command
 * line, the sentence a refusal carries, and the paragraph the system
 * prompt says up front. Nothing else in the cell holds a program name.
 *
 * Tier 0 is what just-bash has, read from just-bash: its command
 * registry plus its own builtins. Tier 2 is the container image: the
 * programs the table names, and anything else the image turns out to
 * have, which the container's bash answers for. Tier 1 is `node` in a
 * fresh isolate, pen phase 5; the column is in the data and the router
 * never chooses it here.
 *
 * With no container configured the tier-2 column is empty, and the table
 * generates lamb's sentence and lamb's prompt line byte for byte; a test
 * holds those strings as literals and checks. That is journey 6. The
 * shell then does not route: the line runs in just-bash as lamb ran it,
 * and the refusal is just-bash's own not-found line with the sentence
 * appended by `annotateCommandNotFound`, as lamb's always was.
 * `classify` still answers for that home, so the table can be tested,
 * but `exec` consults it only when a container is configured; the
 * up-front refusal exists only for a program the table marks absent from
 * the image, when there is one.
 */
import { type CommandNode, getCommandNames, parse, type ScriptNode, type SimpleCommandNode, type WordNode } from "just-bash/browser";

/** What a home has: whether a container can be rented for a command. */
export interface Home {
  container: boolean;
}

export const NO_CONTAINER: Home = { container: false };

/** A class of program, as the prompt speaks of it. */
export type ProgramClass = "interpreter" | "package manager" | "version control";

export interface Program {
  /** The name the prompt speaks; `also` are other names for the same thing, routed the same. */
  name: string;
  also?: string[];
  class: ProgramClass;
  /** Tier 1, the fresh isolate: pen phase 5, never chosen by this router. */
  isolate: boolean;
  /** Tier 2: in the image, or known not to be. */
  container: boolean;
}

/**
 * The design's table, minus the text-tools row, which is read from
 * just-bash, and minus "everything else", which is a rule. Order is the
 * order the prompt speaks the names in.
 */
export const PROGRAMS: readonly Program[] = [
  { name: "python", also: ["python3"], class: "interpreter", isolate: false, container: true },
  { name: "node", class: "interpreter", isolate: true, container: true },
  { name: "npm", also: ["pnpm", "npx"], class: "package manager", isolate: false, container: true },
  { name: "pip", also: ["pip3"], class: "package manager", isolate: false, container: true },
  { name: "cargo", class: "package manager", isolate: false, container: false },
  { name: "git", class: "version control", isolate: false, container: true },
];

/**
 * just-bash's own builtins, the names its `help` lists. The interpreter
 * has no export for them, so they are data here and a test in workerd
 * asks `help` and checks the two lists are the same.
 */
export const TIER0_BUILTINS: readonly string[] = [
  ".", ":", "[", "alias", "bg", "break", "builtin", "caller", "cd", "command", "compgen", "complete", "continue",
  "declare", "dirs", "disown", "echo", "enable", "eval", "exec", "exit", "export", "false", "fc", "fg", "getopts",
  "hash", "help", "history", "jobs", "kill", "let", "local", "logout", "mapfile", "popd", "printf", "pushd", "pwd",
  "read", "readarray", "readonly", "return", "set", "shift", "shopt", "source", "suspend", "test", "times", "trap",
  "true", "type", "typeset", "ulimit", "umask", "unalias", "unset", "wait",
];

/** The text tools the prompt names as examples; lamb's list, kept so the line is lamb's. */
export const TEXT_TOOLS_SHOWN: readonly string[] = ["ls", "cat", "grep", "sed", "awk", "find", "sort", "jq", "diff", "tar"];

let tier0: Set<string> | undefined;

/** Every name tier 0 answers for: just-bash's registry and its builtins. */
export function tier0Programs(): ReadonlySet<string> {
  tier0 ??= new Set<string>([...getCommandNames(), ...TIER0_BUILTINS]);
  return tier0;
}

const byName = new Map<string, Program>();
for (const program of PROGRAMS) {
  byName.set(program.name, program);
  for (const name of program.also ?? []) byName.set(name, program);
}

/** The table's row for a name, if it has one. */
export function programNamed(name: string): Program | undefined {
  return byName.get(name);
}

/** Every name that runs in the container, spoken names and their others, in table order. */
export function containerPrograms(): string[] {
  return PROGRAMS.filter((program) => program.container).flatMap((program) => [program.name, ...(program.also ?? [])]);
}

// ---------------------------------------------------------------------------
// The sentences.

function list(items: readonly string[]): string {
  return items.join(", ");
}

function spoken(kind: ProgramClass, home: Home): string[] {
  return PROGRAMS.filter((program) => program.class === kind && (!home.container || !program.container)).map((program) => program.name);
}

/**
 * The one sentence a refusal carries when no program-specific one applies:
 * with no container it is lamb's, byte for byte, and the same for every
 * program, since nothing outside tier 0 runs anywhere.
 */
export function shellNotice(home: Home): string {
  if (!home.container) return "this shell runs inside the session; no interpreters or package managers are installed";
  return "this shell runs inside the session; a line that names a program the shell lacks runs in the container instead";
}

/** The sentence for refusing one program: which tier would have it, and whether this home has one. */
export function refusalSentence(program: string, home: Home): string {
  if (!home.container) return shellNotice(home);
  const row = programNamed(program);
  if (row !== undefined && !row.container) {
    return `${program} is installed nowhere this session can reach: not in the shell and not in the container's image`;
  }
  return shellNotice(home);
}

/** The line the system prompt says about the shell. Lamb's, byte for byte, when the home has no container. */
export function shellSystemPromptLine(home: Home): string {
  const opening = `The bash tool runs a shell interpreter inside the session with the usual text tools (${list(TEXT_TOOLS_SHOWN)}) over the workspace at /workspace. `;
  if (!home.container) {
    return (
      opening +
      `There are no interpreters (no ${list(spoken("interpreter", home))}) and no package managers (no ${list(spoken("package manager", home))}): ${shellNotice(home)}. ` +
      `Say so plainly when asked for something the shell cannot do, rather than pretending it ran.`
    );
  }
  const absent = PROGRAMS.filter((program) => !program.container).map((program) => program.name);
  return (
    opening +
    `A container is rented beside the session for the programs the shell lacks: ${list(containerPrograms())}, and anything else in its image. ` +
    `A command line runs whole in one place: in the shell when every program in it is a text tool, otherwise in the container over a checkout of the same workspace. ` +
    `Output streams back, and the files a command changed sync back to the workspace, except node_modules, build output, and anything in .gitignore, which stay in the container and go when it does. ` +
    (absent.length === 0 ? "" : `There is no ${list(absent)} in either. `) +
    `Say so plainly when asked for something neither can do, rather than pretending it ran.`
  );
}

/** Lamb's two strings, as the table generates them with no container. Lamb's tests import these by name. */
export const SHELL_NOTICE = shellNotice(NO_CONTAINER);
export const SHELL_SYSTEM_PROMPT_LINE = shellSystemPromptLine(NO_CONTAINER);

/** Rewrites just-bash's `X: command not found` lines to carry the notice. */
export function annotateCommandNotFound(text: string, notice: string = SHELL_NOTICE): string {
  return text.replace(/^(.*: command not (?:found|available)(?:[^\n(]*)?)$/gm, `$1 (${notice})`);
}

/** The refusal as the shell prints it: lamb's line, with the sentence for the program. */
export function refusalLine(program: string, home: Home): string {
  return `bash: ${program}: command not found (${refusalSentence(program, home)})\n`;
}

/** The sentences for a container that went away; journey 3 step 3. Beside the others so nothing drifts. */
export const INTERRUPTED_DURING_RUN =
  "the container went away while the command was running; its output up to that point is above, and it may have partly run";

export function interruptedDuringSyncOut(end: { exit: number } | { killed: string }): string {
  const how = "exit" in end ? `ran to exit ${end.exit}` : `was killed (${end.killed})`;
  return `the command ${how} and the container went away while its changes were syncing back; the workspace may hold part of them`;
}

// ---------------------------------------------------------------------------
// The router's decision.

export type Route =
  | { tier: 0; programs: string[] }
  | { tier: 2; programs: string[] }
  | { refused: string; sentence: string; programs: string[] };

/** The text of a word when nothing in it needs the shell to expand; `null` otherwise. */
function literalText(word: WordNode): string | null {
  let text = "";
  for (const part of word.parts) {
    switch (part.type) {
      case "Literal":
      case "SingleQuoted":
      case "Escaped":
        text += part.value;
        break;
      case "Glob":
        // `[` arrives as a glob; a pattern in command position that matches nothing is its own text.
        text += part.pattern;
        break;
      case "DoubleQuoted": {
        const inner = literalText({ type: "Word", parts: part.parts });
        if (inner === null) return null;
        text += inner;
        break;
      }
      default:
        return null;
    }
  }
  return text;
}

interface Found {
  /** Each simple command's name in source order; `null` for one the shell would have to expand. */
  names: Array<string | null>;
  /** Functions the line defines, whose calls are not programs. */
  defined: Set<string>;
}

/**
 * Walks the whole tree: compound bodies, and every word, since a command
 * substitution anywhere in a word is a program too.
 */
function collect(node: unknown, found: Found): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, found);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const typed = node as { type?: unknown };
  if (typed.type === "SimpleCommand") {
    const command = node as SimpleCommandNode;
    if (command.name !== null) found.names.push(literalText(command.name));
  } else if (typed.type === "FunctionDef") {
    found.defined.add((node as Extract<CommandNode, { type: "FunctionDef" }>).name);
  } else if (typed.type === "ArithCommandSubst") {
    // `$(( $(cmd) ))` carries its command as text; parse it as the shell would.
    const inner = (node as { command: string }).command;
    try {
      collect(parse(inner), found);
    } catch {
      // The shell will say what is wrong with it.
    }
    return;
  }
  for (const value of Object.values(node)) collect(value, found);
}

/** The programs a command line names, in order, deduplicated; `null` for a name the shell would expand. */
export function programsOf(script: ScriptNode): Array<string | null> {
  const found: Found = { names: [], defined: new Set() };
  collect(script, found);
  const seen = new Set<string>();
  const programs: Array<string | null> = [];
  for (const name of found.names) {
    if (name === null) {
      programs.push(null);
      continue;
    }
    if (name === "" || found.defined.has(name) || seen.has(name)) continue;
    seen.add(name);
    // A path is a script or a binary on some disk; which one this home has is not decidable from the name.
    programs.push(name.includes("/") ? null : name);
  }
  return programs;
}

/**
 * The rule: a command line runs whole in one tier, the lowest that has
 * every program in it. All tier 0: just-bash. Any program only the
 * container has, or any name the shell would have to expand, when this
 * home has a container: the container. A program the table says no
 * available tier has: refused with its sentence. A line that will not
 * parse goes to just-bash, which reports it as it does today.
 *
 * With no container the answer is what the table says, for the tests;
 * the shell does not ask, and runs the line in just-bash as lamb did.
 */
export function classify(command: string, home: Home): Route {
  let script: ScriptNode;
  try {
    script = parse(command);
  } catch {
    return { tier: 0, programs: [] };
  }
  const found = programsOf(script);
  const programs = found.filter((name): name is string => name !== null);
  const tier0 = tier0Programs();
  const outside = found.filter((name) => name === null || !tier0.has(name));
  if (outside.length === 0) return { tier: 0, programs };
  const named = outside.filter((name): name is string => name !== null);
  if (!home.container) {
    // Nothing outside tier 0 runs anywhere; a name the shell expands is the shell's to resolve, as in lamb.
    const first = named[0];
    if (first === undefined) return { tier: 0, programs };
    return { refused: first, sentence: refusalSentence(first, home), programs };
  }
  const absent = named.find((name) => programNamed(name)?.container === false);
  if (absent !== undefined) return { refused: absent, sentence: refusalSentence(absent, home), programs };
  return { tier: 2, programs };
}
