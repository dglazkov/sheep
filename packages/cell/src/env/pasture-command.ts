/**
 * The program: `pasture`, a just-bash custom command in the shell of a
 * sheep born into a pasture, and nothing in a pastureless sheep's, where
 * `pasture` is just-bash's not-found line annotated as before. It is tier
 * 0 because just-bash has it: no row in the table, and no change to the
 * table's paragraph.
 *
 * Three verbs, as the design has them. `pasture`, or `pasture herd`,
 * prints the pasture's name, repository, branch, and birth date, then one
 * line per sheep born into it: id, name, state, born, task, tab
 * separated, from the directory's `herd` in the directory's order, this
 * sheep's own line marked with a leading `*`. It is the view `sheep
 * pasture <name>` prints, in the one format, and a test compares the two
 * outputs; a sheep that never wrote anything down is in it with what it
 * was asked. `pasture put <path> [file]` writes a workspace file, or
 * stdin when there is none, to `/pasture/<path>`: one `PUT` on the
 * object, the whole file in one transaction, last write wins. `pasture rm
 * <path>` removes. Reading is the shell's, `cat` and `ls`; the program
 * does not repeat what the shell has.
 *
 * A refusal is the command's own `{stdout, stderr, exitCode}`: just-bash
 * swallows the error shapes some commands throw, so the program reports
 * plainly. Anything but the three verbs is the usage line and exit 2.
 */
import type { ManifestEntry } from "@sheep/pen/protocol";
import { type Command, defineCommand } from "just-bash/browser";
import { posix } from "node:path";
import type { SessionSummary } from "../directory.ts";
import { DEFAULT_BRANCH, type PastureMeta, treePath } from "../pasture.ts";
import { PASTURE_ROOT, type PastureCall, type PastureSource } from "../workspace/mount.ts";

/** The program's name: the one name a pastured cell's shell has that just-bash's registry does not. */
export const PASTURE_PROGRAM = "pasture";

/** The names the router counts as tier 0 in a pastured cell, beside just-bash's own. */
export const PASTURE_PROGRAMS: ReadonlySet<string> = new Set([PASTURE_PROGRAM]);

export const USAGE = "usage: pasture [herd] | pasture put <path> [file] | pasture rm <path>";

/** The object as the program reaches it: what the mount reads through, plus the one write path. */
export interface PastureObject extends PastureSource {
  put(path: string, content: Uint8Array): Promise<ManifestEntry>;
  rm(path: string): Promise<boolean>;
}

/** What a cell gives the program at boot: its pasture's name, its own id, the object, and the directory's query. */
export interface PastureProgram {
  name: string;
  /** This sheep's id: the line the herd marks. */
  sessionId: string;
  /** The same stub the mount reads from, so a `put` is read by the next `cat` with no other hop. */
  object: PastureObject;
  /** The directory's `herd(pasture)`: the rows and their order, the same query the dog's verb prints. */
  herd(): Promise<SessionSummary[]>;
}

/** One line per sheep of the herd: id, name, state, born, task; the format `sheep pasture <name>` prints. */
export function herdLine(session: SessionSummary): string {
  return `${session.id}\t${session.name ?? ""}\t${session.state}\t${new Date(session.createdAt).toISOString()}\t${session.task ?? ""}`;
}

/** The whole view: the meta's four lines, then the herd; `mark` is the id whose line gets the leading `*`, or none. */
export function herdView(name: string, meta: PastureMeta | undefined, herd: readonly SessionSummary[], mark?: string): string {
  const head = `name: ${name}\nrepo: ${meta?.repo ?? "(none)"}\nbranch: ${meta?.branch ?? DEFAULT_BRANCH}\ncreated: ${new Date(meta?.createdAt ?? 0).toISOString()}\n`;
  return head + herd.map((session) => `${session.id === mark ? "*" : ""}${herdLine(session)}\n`).join("");
}

/**
 * A `<path>` argument as the object takes it: relative to `/pasture`, or
 * absolute under `/pasture/`, which is what `ls /pasture` showed the
 * sheep; `undefined` for any other absolute path and for one that would
 * leave the tree.
 */
export function pathArgument(argument: string): string | undefined {
  if (argument.startsWith("/") && !argument.startsWith(`${PASTURE_ROOT}/`)) return undefined;
  const relative = argument.startsWith(`${PASTURE_ROOT}/`) ? argument.slice(PASTURE_ROOT.length + 1) : argument;
  const absolute = treePath(relative);
  return absolute === undefined ? undefined : absolute.slice(PASTURE_ROOT.length + 1);
}

/** just-bash's stdin is a latin1 string, one char per byte; these are the bytes. */
function stdinBytes(stdin: unknown): Uint8Array {
  const latin1 = stdin as string;
  return Uint8Array.from(latin1, (char) => char.charCodeAt(0) & 0xff);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Done = { stdout: string; stderr: string; exitCode: number };

const done = (stdout: string): Done => ({ stdout, stderr: "", exitCode: 0 });
const failed = (stderr: string, exitCode = 1): Done => ({ stdout: "", stderr: `${stderr}\n`, exitCode });

/**
 * The command for one shell run: `call` is that run's `PastureCall`, so the
 * herd's meta is the run's one snapshot, and a `put` or `rm` tells the
 * call to forget it, so `pasture put x f && cat /pasture/x` reads what was
 * just put.
 */
export function pastureCommand(program: PastureProgram, call: PastureCall): Command {
  return defineCommand(PASTURE_PROGRAM, async (args, ctx) => {
    const [verb, ...words] = args;
    if (verb === undefined || verb === "herd") {
      if (words.length > 0) return failed(USAGE, 2);
      const [meta, herd] = await Promise.all([call.meta(), program.herd()]);
      return done(herdView(program.name, meta, herd, program.sessionId));
    }
    if (verb === "put") {
      const [argument, file, extra] = words;
      if (argument === undefined || extra !== undefined) return failed(USAGE, 2);
      const path = pathArgument(argument);
      if (path === undefined) return failed(`pasture put: ${argument} is outside the pasture's tree`, 2);
      let content: Uint8Array;
      if (file === undefined) content = stdinBytes(ctx.stdin);
      else {
        try {
          content = await ctx.fs.readFileBuffer(posix.isAbsolute(file) ? file : posix.join(ctx.cwd, file));
        } catch (error) {
          return failed(`pasture put: ${file}: ${messageOf(error)}`);
        }
      }
      let entry: ManifestEntry;
      try {
        entry = await program.object.put(path, content);
      } catch (error) {
        return failed(`pasture put: ${messageOf(error)}`);
      }
      call.forget();
      return done(`${PASTURE_ROOT}/${entry.path}\t${content.byteLength}\n`);
    }
    if (verb === "rm") {
      const [argument, extra] = words;
      if (argument === undefined || extra !== undefined) return failed(USAGE, 2);
      const path = pathArgument(argument);
      if (path === undefined) return failed(`pasture rm: ${argument} is outside the pasture's tree`, 2);
      const removed = await program.object.rm(path);
      call.forget();
      if (!removed) return failed(`pasture rm: no ${path} in pasture ${program.name}`);
      return done("");
    }
    return failed(USAGE, 2);
  });
}
