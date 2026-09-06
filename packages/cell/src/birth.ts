/**
 * The birth (pasture phase 3): what a cell born into a pasture with a
 * repository does on its first boot with an empty workspace, before the
 * first prompt is taken. `git clone --branch <branch> <repo> .` runs in
 * `/workspace` through the container path, the credential coming from
 * the broker as it does for any push, and the output's tail becomes one
 * entry of the transcript: agent-core's `custom` entry, `customType`
 * `birth`, which is what pi's coding agent calls a `custom_message`. The
 * model has it through the projector below, as a message before the first
 * prompt; `sheep log` prints it as the entry it is. A birth that fails is
 * the same entry saying so, the workspace left as the failure left it,
 * and the sheep alive to be asked about it.
 *
 * A birth runs once. The cell records that it ran in its own storage,
 * whatever the outcome, and a second boot does not clone again; the
 * empty-workspace rule guards the one gap, a cell evicted between the
 * sync-out and the record.
 */
import { createCustomMessage, type CustomEntry, type EntryProjector } from "@earendil-works/pi-agent-core";
import { WORKSPACE_ROOT } from "./workspace/files.ts";

/** The entry's `customType`, and the key of the record in the cell's storage. */
export const BIRTH_ENTRY = "birth";
/** How much of the clone's output the entry keeps: the tail, about forty lines. */
export const BIRTH_TAIL_LINES = 40;
export const BIRTH_TAIL_BYTES = 16 * 1024;
/** Seconds a clone may take before the container's run is killed; a repository that needs longer is a finding. */
export const BIRTH_TIMEOUT_S = 10 * 60;

/** The entry's data, as `sheep log --json` prints it and the projector reads it. */
export interface BirthData {
  pasture: string;
  repo: string;
  branch: string;
  command: string;
  cwd: string;
  /** The exit code when the command ran to its end. */
  exit?: number;
  /** The sentence when it could not run, or ended without a code: no container, the budget spent, the container gone. */
  error?: string;
  /** The output's tail; `truncated` when the whole was more. */
  output: string;
  truncated: boolean;
}

/** What the cell keeps once the birth has run: when, and how it ended. */
export interface BirthRecord {
  at: number;
  exit?: number;
  error?: string;
}

/** A word for the shell: single-quoted, so a repository URL or a branch name is one argument whatever is in it. */
export function shellWord(text: string): string {
  return /^[A-Za-z0-9_./:@%+=-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
}

/** The birth's one line. */
export function birthCommand(repo: string, branch: string): string {
  return `git clone --branch ${shellWord(branch)} ${shellWord(repo)} .`;
}

/** Whether the data says the clone ran to exit 0. */
export function birthSucceeded(data: BirthData): boolean {
  return data.exit === 0;
}

/** The entry as the model reads it and a person would: one sentence on what ran and how it ended, then the output. */
export function birthText(data: BirthData): string {
  const where = `in ${data.cwd} in a container, before the first prompt`;
  let head: string;
  if (data.exit === 0) head = `This session was born into the pasture ${data.pasture}: \`${data.command}\` ran ${where} and exited 0, so ${data.cwd} is a clone of ${data.repo} on branch ${data.branch}.`;
  else if (data.exit !== undefined) head = `The birth of this session into the pasture ${data.pasture} failed: \`${data.command}\` ran ${where} and exited ${data.exit}. ${data.cwd} is as the failure left it.`;
  else head = `The birth of this session into the pasture ${data.pasture} failed: \`${data.command}\` could not run ${where}: ${data.error ?? "no reason was given"}. ${data.cwd} is as the failure left it.`;
  const output = data.output.replace(/\n$/, "");
  if (output === "") return head;
  return `${head}\n\n${data.truncated ? "The last of its output:" : "Its output:"}\n${output}`;
}

/** Reads the data back off an entry; an entry with none, or with the wrong shape, projects to nothing. */
export function birthData(entry: CustomEntry): BirthData | undefined {
  const data = entry.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.command !== "string" || typeof record.output !== "string" || typeof record.pasture !== "string") return undefined;
  return {
    pasture: record.pasture,
    repo: typeof record.repo === "string" ? record.repo : "",
    branch: typeof record.branch === "string" ? record.branch : "",
    command: record.command,
    cwd: typeof record.cwd === "string" ? record.cwd : WORKSPACE_ROOT,
    ...(typeof record.exit === "number" ? { exit: record.exit } : {}),
    ...(typeof record.error === "string" ? { error: record.error } : {}),
    output: record.output,
    truncated: record.truncated === true,
  };
}

/** How the harness turns the entry into context: one custom message, user-side, at the entry's time. */
export const birthProjector: EntryProjector = (entry) => {
  const data = birthData(entry);
  if (data === undefined) return undefined;
  return [createCustomMessage(BIRTH_ENTRY, birthText(data), true, undefined, entry.timestamp)];
};
