/**
 * The program: `look`, a just-bash custom command in the shell of a sheep
 * whose home has eyes, and nothing in the shell of one whose home has
 * none, where `look` is just-bash's not-found line annotated with the
 * sentence `programs.ts` keeps for it. It is tier 0 because just-bash has
 * it: no row in the table, and no change to the table's paragraph.
 *
 * One verb, two shapes. The first is eyes': `look <path> [--root <dir>]
 * [--click <selector>]… [--fill <selector> <text>]… [--viewport <w>x<h>]
 * [--full] [--out <file>]`, a page read from the rows. The second is
 * serve phase 1's: `look --serve '<command>' [--port <n>] [<path>]` and
 * the same trailing flags, a page read from a server the container runs
 * for the length of this one look. The flags map onto a `LookRequest` one
 * for one, in the order they were given; the program resolves the paths
 * and hands the rest to the eyes. The PNG that comes back is written to
 * `--out`, `look.png` in the working directory unless told otherwise,
 * overwritten, its parents made, through the files table directly so no
 * byte is decoded on the way; the report is stdout, byte for byte what
 * `report.ts` made, nothing added and nothing reordered.
 *
 * The two shapes differ in what `<path>` is, and that is the whole of the
 * difference here. At the rows it is a workspace file, resolved against
 * the working directory and the root; on a server it is a path on that
 * server, `/` unless said, with a leading slash added, and no root to
 * resolve it against — so `--root` with `--serve` is a usage fault rather
 * than a question the eyes could answer. Everything the rental does — the
 * container, the run, the port, the kill — is `execution-env.ts`'s, and
 * this program only asks for it and prints what comes back.
 *
 * What the eyes check, the program does not check again: a path that is
 * not in the workspace, one outside the root, a selector that matched
 * nothing, come back as a `LookError`; a browser that could not be had or
 * a page that never went idle as a plain Error. Both are one line on
 * stderr, `look: <message>`, and exit 1, the command's own `{stdout,
 * stderr, exitCode}`, since just-bash swallows thrown shapes. A server
 * that ended before its port answered, or never answered at all, is the
 * same one line with the tail of what it printed after it. A usage fault
 * — a flag it does not know, a flag missing its argument, no path or two,
 * a viewport that is not `<w>x<h>` of positive integers, a port that is
 * not a number, `--root` with `--serve` — is the usage line and exit 2,
 * like `pasture`.
 */
import { type Command, defineCommand } from "just-bash/browser";
import { posix } from "node:path";
import { DEFAULT_OUT, type Eyes, type LookAction, type LookRequest, type LookResult, type Origin, RowsOrigin } from "../eyes/eyes.ts";
import { report, type ServedBy } from "../eyes/report.ts";
import { type FilesTable, normalizePath, WORKSPACE_ROOT } from "../workspace/files.ts";

/** The program's name: the one name a sighted cell's shell has that just-bash's registry does not. */
export const LOOK_PROGRAM = "look";

/** The names the router counts as tier 0 in a cell with eyes, beside just-bash's own. */
export const LOOK_PROGRAMS: ReadonlySet<string> = new Set([LOOK_PROGRAM]);

/** Where a served look's command listens when `--port` says nothing; Vite's own default, and the number `PORT` carries. */
export const DEFAULT_PORT = 5173;

const TRAILING = "[--click <selector>]... [--fill <selector> <text>]... [--viewport <w>x<h>] [--full] [--out <file>]";

export const USAGE = [`usage: look <path> [--root <dir>] ${TRAILING}`, `       look --serve '<command>' [--port <n>] [<path>] ${TRAILING}`].join("\n");

/** The line a `--serve` gets on a home with eyes and no container, where there is nowhere to run the command. */
export const SERVE_NEEDS_CONTAINER = "--serve needs a container; this home has none";

/** What one served look came to: what `during` returned, or the one line that says why nothing did. */
export interface Served<T> {
  /** What `during` returned; absent when the server never answered, and then `error` says why. */
  value?: T;
  /** The tail of what the server printed to either stream, oldest first. */
  output: string[];
  /** Milliseconds from the run's start to the port's first answer; absent when it never answered. */
  readyMs?: number;
  /**
   * Milliseconds from the run's start to the end of the rental, the wait
   * for the port and the look both inside it; absent when there was no
   * look. The rental holds the clock because it is the only thing here
   * that saw the whole of a served look: the eyes' own `ms` starts after
   * the port answered, so a closing line that used it would say the look
   * took less time than the wait inside it. One clock, one line.
   */
  totalMs?: number;
  /** The message the program prints after `look: `, with the output after it; absent when the look was taken. */
  error?: string;
}

/**
 * The cell's side of a served look, as this program asks for it: rent a
 * container, run the command on its lane with `PORT` set, wait for the
 * port, hand `during` an origin over the forward, and stop the server
 * whatever happens. `CellExecutionEnv` is the one that implements it; the
 * program is given it only on a home that has a container.
 */
export interface ServeRental {
  rentServer<T>(command: string, port: number, cwd: string, during: (origin: Origin) => Promise<T>, signal?: AbortSignal): Promise<Served<T>>;
}

/** The flags, parsed: the request the eyes take, the absolute path the PNG is written to, and the server when there is one. */
export interface ParsedLook {
  request: LookRequest;
  /** Where the PNG goes, absolute; `request.out` is the name the closing line says, as the sheep gave it. */
  outPath: string;
  /** `--serve`: the command the container runs and the port it is expected on. Absent for a look at the rows. */
  serve?: { command: string; port: number };
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

/**
 * `<path>` on a server: `/` unless said, and a leading slash added to
 * anything else, so `look --serve … about` and `look --serve … /about`
 * are one page. Nothing else is done to it — the query and the case are
 * the server's business, not the shell's.
 */
export function serverPath(path: string | undefined): string {
  if (path === undefined || path === "") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

/** `<w>x<h>` of positive integers, or nothing. */
export function parseViewport(text: string): { width: number; height: number } | undefined {
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (match === null) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/** `--port`: a port a server can listen on, or nothing. */
export function parsePort(text: string): number | undefined {
  if (!/^\d+$/.test(text)) return undefined;
  const port = Number(text);
  return port > 0 && port < 65_536 ? port : undefined;
}

/** The arguments as `LookRequest` and an output path; `undefined` for anything the usage line refuses. */
export function parseLookArgs(args: readonly string[], cwd: string): ParsedLook | undefined {
  let path: string | undefined;
  let root: string | undefined;
  let serve: string | undefined;
  let port: number | undefined;
  let viewport: { width: number; height: number } | undefined;
  let full = false;
  let out: string | undefined;
  const actions: LookAction[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    switch (arg) {
      case "--serve": {
        const command = args[++index];
        if (command === undefined) return undefined;
        serve = command;
        break;
      }
      case "--port": {
        const number = args[++index];
        if (number === undefined) return undefined;
        port = parsePort(number);
        if (port === undefined) return undefined;
        break;
      }
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
  // A page on a server is not a workspace file: there is no root to read it against, and `--port` says nothing without a server to say it of.
  if (serve !== undefined && root !== undefined) return undefined;
  if (serve === undefined && (port !== undefined || path === undefined)) return undefined;
  const rest = {
    ...(actions.length === 0 ? {} : { actions }),
    ...(viewport === undefined ? {} : { viewport }),
    ...(full ? { full } : {}),
    out: out ?? DEFAULT_OUT,
  };
  return {
    request:
      serve === undefined
        ? { path: resolvePagePath(path!, cwd, root), ...(root === undefined ? {} : { root }), ...rest }
        : { path: serverPath(path), ...rest },
    outPath: fromCwd(out ?? DEFAULT_OUT, cwd),
    ...(serve === undefined ? {} : { serve: { command: serve, port: port ?? DEFAULT_PORT } }),
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
 * `rental` is the cell's container, given only on a home that has one;
 * without it `--serve` is one line and exit 1, since there is nowhere for
 * the command to run.
 */
export function lookCommand(eyes: Eyes, files: FilesTable, rental?: ServeRental): Command {
  return defineCommand(LOOK_PROGRAM, async (args, ctx) => {
    const parsed = parseLookArgs(args, ctx.cwd);
    if (parsed === undefined) return failed(USAGE, 2);
    const { serve } = parsed;

    let result: LookResult;
    /** What served, when one did: the tail and the two numbers the report's own section and closing line are made of. */
    let server: ServedBy | undefined;
    /** The whole served look on the rental's clock, which is what `in …` says when a server served it. */
    let servedMs: number | undefined;
    try {
      if (serve === undefined) {
        // The rows are this program's other origin, built here: the page is the files the sheep wrote, under the root it named.
        result = await eyes.look(parsed.request, new RowsOrigin(files, normalizePath(parsed.request.root ?? WORKSPACE_ROOT)));
      } else {
        if (rental === undefined) return failed(`look: ${SERVE_NEEDS_CONTAINER}`);
        const served = await rental.rentServer(serve.command, serve.port, ctx.cwd, (origin) => eyes.look(parsed.request, origin), ctx.signal);
        if (served.value === undefined || served.readyMs === undefined || served.totalMs === undefined) {
          // The server ended before its port answered, or never answered: one line, and the last of what it printed after it.
          return failed([`look: ${served.error ?? "the server did not answer"}`, ...served.output].join("\n"));
        }
        result = served.value;
        server = { command: serve.command, port: serve.port, readyMs: served.readyMs, output: served.output };
        servedMs = served.totalMs;
      }
    } catch (error) {
      return failed(`look: ${messageOf(error).split("\n")[0]}`);
    }
    try {
      files.writeFile(parsed.outPath, result.png, { createParents: true });
    } catch (error) {
      return failed(`look: ${parsed.outPath}: ${messageOf(error).split("\n")[0]}`);
    }
    // The eyes made the report before the server was stopped, so a served look's is made again here, with what the server said in it
    // and on the rental's clock: `in …` is the whole served look, `ready in …` the part of it that was waiting for the port.
    return done(server === undefined || servedMs === undefined ? result.report : report({ ...result.seen, ms: servedMs, server }));
  });
}
