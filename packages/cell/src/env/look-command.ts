/**
 * The program: `look`, a just-bash custom command in the shell of a sheep
 * whose home has eyes, and nothing in the shell of one whose home has
 * none, where `look` is just-bash's not-found line annotated with the
 * sentence `programs.ts` keeps for it. It is tier 0 because just-bash has
 * it: no row in the table, and no change to the table's paragraph.
 *
 * One verb, the design's shape: `look <path> [--root <dir>] [--click
 * <selector>]… [--fill <selector> <text>]… [--viewport <w>x<h>] [--full]
 * [--out <file>]`. The flags map onto a `LookRequest` one for one, in the
 * order they were given; the program resolves the three paths and hands
 * the rest to the eyes. The PNG that comes back is written to `--out`,
 * `look.png` in the working directory unless told otherwise, overwritten,
 * its parents made, through the files table directly so no byte is decoded
 * on the way; the report is stdout, byte for byte what `report.ts` made,
 * nothing added and nothing reordered.
 *
 * What the eyes check, the program does not check again: a path that is
 * not in the workspace, one outside the root, a selector that matched
 * nothing, come back as a `LookError`; a browser that could not be had or
 * a page that never went idle as a plain Error. Both are one line on
 * stderr, `look: <message>`, and exit 1, the command's own `{stdout,
 * stderr, exitCode}`, since just-bash swallows thrown shapes. A usage
 * fault — a flag it does not know, a flag missing its argument, no path or
 * two, a viewport that is not `<w>x<h>` of positive integers — is the
 * usage line and exit 2, like `pasture`.
 */
import { type Command, defineCommand } from "just-bash/browser";
import { posix } from "node:path";
import { DEFAULT_OUT, type Eyes, type LookAction, type LookRequest, type LookResult } from "../eyes/eyes.ts";
import type { FilesTable } from "../workspace/files.ts";

/** The program's name: the one name a sighted cell's shell has that just-bash's registry does not. */
export const LOOK_PROGRAM = "look";

/** The names the router counts as tier 0 in a cell with eyes, beside just-bash's own. */
export const LOOK_PROGRAMS: ReadonlySet<string> = new Set([LOOK_PROGRAM]);

export const USAGE = "usage: look <path> [--root <dir>] [--click <selector>]... [--fill <selector> <text>]... [--viewport <w>x<h>] [--full] [--out <file>]";

/** The flags, parsed: the request the eyes take, and the absolute path the PNG is written to. */
export interface ParsedLook {
  request: LookRequest;
  /** Where the PNG goes, absolute; `request.out` is the name the closing line says, as the sheep gave it. */
  outPath: string;
}

/** A path argument as the shell would read it: absolute as it is, relative against the working directory. */
function fromCwd(path: string, cwd: string): string {
  return posix.isAbsolute(path) ? path : posix.join(cwd, path);
}

/**
 * `<path>`, resolved: absolute as it is; relative against the working
 * directory, and, when a `--root` was given and that reading falls outside
 * it, against the root instead. So `look --root site index.html` and `look
 * --root site site/index.html` from `/workspace` both mean the built page,
 * which is what the design's own example says and what a sheep that thinks
 * in `ls`'s paths would type. The eyes still decide what is under the root.
 */
export function resolvePagePath(path: string, cwd: string, root: string | undefined): string {
  const resolved = fromCwd(path, cwd);
  if (root === undefined || posix.isAbsolute(path)) return resolved;
  return resolved === root || resolved.startsWith(`${root}/`) ? resolved : posix.join(root, path);
}

/** `<w>x<h>` of positive integers, or nothing. */
export function parseViewport(text: string): { width: number; height: number } | undefined {
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (match === null) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/** The arguments as `LookRequest` and an output path; `undefined` for anything the usage line refuses. */
export function parseLookArgs(args: readonly string[], cwd: string): ParsedLook | undefined {
  let path: string | undefined;
  let root: string | undefined;
  let viewport: { width: number; height: number } | undefined;
  let full = false;
  let out: string | undefined;
  const actions: LookAction[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    switch (arg) {
      case "--root": {
        const dir = args[++index];
        if (dir === undefined) return undefined;
        root = fromCwd(dir, cwd);
        break;
      }
      case "--click": {
        const selector = args[++index];
        if (selector === undefined) return undefined;
        actions.push({ kind: "click", selector });
        break;
      }
      case "--fill": {
        const selector = args[++index];
        const text = args[++index];
        if (selector === undefined || text === undefined) return undefined;
        actions.push({ kind: "fill", selector, text });
        break;
      }
      case "--viewport": {
        const size = args[++index];
        if (size === undefined) return undefined;
        viewport = parseViewport(size);
        if (viewport === undefined) return undefined;
        break;
      }
      case "--full":
        full = true;
        break;
      case "--out": {
        const file = args[++index];
        if (file === undefined) return undefined;
        out = file;
        break;
      }
      default:
        if (arg.startsWith("-") || path !== undefined) return undefined;
        path = arg;
    }
  }
  if (path === undefined) return undefined;
  return {
    request: {
      path: resolvePagePath(path, cwd, root),
      ...(root === undefined ? {} : { root }),
      ...(actions.length === 0 ? {} : { actions }),
      ...(viewport === undefined ? {} : { viewport }),
      ...(full ? { full } : {}),
      out: out ?? DEFAULT_OUT,
    },
    outPath: fromCwd(out ?? DEFAULT_OUT, cwd),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Done = { stdout: string; stderr: string; exitCode: number };

const done = (stdout: string): Done => ({ stdout, stderr: "", exitCode: 0 });
const failed = (stderr: string, exitCode = 1): Done => ({ stdout: "", stderr: `${stderr}\n`, exitCode });

/**
 * The command for a cell with eyes: one look per run, the PNG written
 * through `files` (the same rows the eyes rendered from, so the next
 * `read` of it is the picture) and the report returned as stdout.
 */
export function lookCommand(eyes: Eyes, files: FilesTable): Command {
  return defineCommand(LOOK_PROGRAM, async (args, ctx) => {
    const parsed = parseLookArgs(args, ctx.cwd);
    if (parsed === undefined) return failed(USAGE, 2);
    let result: LookResult;
    try {
      result = await eyes.look(parsed.request);
    } catch (error) {
      return failed(`look: ${messageOf(error).split("\n")[0]}`);
    }
    try {
      files.writeFile(parsed.outPath, result.png, { createParents: true });
    } catch (error) {
      return failed(`look: ${parsed.outPath}: ${messageOf(error).split("\n")[0]}`);
    }
    return done(result.report);
  });
}
