/**
 * pi's `ExecutionEnv` for a cell: the `FileSystem` over the workspace
 * table, and the `Shell` that routes a command line to the tier that has
 * every program in it. Mirrors `NodeExecutionEnv` method for method,
 * minus the process plumbing a cell does not have.
 *
 * `exec` is the seam. With no container configured it does not route at
 * all: the line runs in just-bash over the rows exactly as it did before pen,
 * and the table's sentence reaches the output the way it always did,
 * appended by `annotateCommandNotFound` to just-bash's own not-found
 * line. That is journey 6, byte for byte. With a container, the table is
 * consulted: a line whose programs are all tier 0 still runs in
 * just-bash; a line that names a program the shell lacks runs whole in
 * the container, rented, synced in, streamed, synced out; a line that
 * names a program the table marks absent from the image is refused up
 * front with the sentence for that program. Pen phase 5 adds one line
 * the shell takes on any home with the loader: `node <file> [args…]`
 * alone, while no container is up, runs in the fresh isolate.
 *
 * Pasture phase 1: with a `pasture`, a path under `/pasture` is served by
 * the mount (`workspace/mount.ts`) from the pasture's object, live per tool
 * call, and every write there is refused with `EROFS` and the design's
 * sentence. Without one, no method here routes and the env is lamb's.
 * Pasture phase 2: with a `pastureProgram`, the shell of each run is made
 * with the `pasture` command (`env/pasture-command.ts`) over that run's
 * mount, and the router counts the name as tier 0. Without one, just-bash
 * is made as it always was and `pasture` is its not-found line.
 * Pasture phase 4: with a pasture whose tree has `setup.sh`, the container
 * path runs it once per container, after the sync-in and before the
 * command, with the pasture's other secrets in that run alone.
 */
import type { Context } from "@earendil-works/pi-agent-core";
import {
  BACKGROUND_CONTEXT,
  type ExecutionEnv,
  ExecutionError,
  err,
  FileError,
  type FileInfo,
  ok,
  OutputCapture,
  type Result,
  type ShellExecOptions,
  type ShellExecResult,
} from "@earendil-works/pi-agent-core";
import type { ManifestEntry, Refused } from "@sheep/pen/protocol";
import { Bash } from "just-bash/browser";
import { posix } from "node:path";
import { Checkout, CheckoutInterrupted } from "../pen/checkout.ts";
import { type Isolate, IsolateEnded } from "../pen/isolate.ts";
import { ContainerRun, KillUnanswered, type RunEnd, RunInterrupted } from "../pen/run.ts";
import { CellFs } from "../workspace/cell-fs.ts";
import { type FileRow, FilesTable, FsError, isReadable, MAX_FILE_BYTES, normalizePath, TEMP_ROOT, WORKSPACE_ROOT } from "../workspace/files.ts";
import { annotateReadOnly, isPasturePath, PASTURE_ROOT, PastureCall, type PastureRow, type PastureSource, readOnly } from "../workspace/mount.ts";
import { PASTURE_PROGRAMS, type PastureProgram, pastureCommand } from "./pasture-command.ts";
import {
  annotateCommandNotFound,
  BUDGET_SPENT_NOTICE,
  classify,
  fetchRefused,
  hasContainer,
  type Home,
  isolateReadOnly,
  isolateScopeRefused,
  INTERRUPTED_DURING_RUN,
  interruptedDuringSyncOut,
  killUnanswered,
  refusalLine,
  refusalSentence,
  type Route,
} from "./programs.ts";

const MAX_TIMEOUT_MS = 2_147_483_647;

/** The sentence a line run whole in the container gets on a home that has none. */
export const NO_CONTAINER_NOTICE = "this home has no container";

/** How a setup run ended (pasture phase 4): the script's exit code, or the sentence when it could not run to one. */
export type SetupEnd = { exit: number } | { error: string };

/** What a line run whole in the container came to (pasture phase 3): the output's tail, bounded, and how it ended. */
export interface ContainerLineResult {
  /** The tail of the output, within the caller's limits. */
  output: string;
  /** Whether the whole output was more than the tail. */
  truncated: boolean;
  end: { exit: number } | { error: string };
  /** How setup ended when it ran after the line (pasture phase 4); absent when it did not run. */
  setup?: SetupEnd;
}

/** When setup runs around a line in the container: before it, as a tool's line has it; after it, as a birth's clone does; or not at all. */
export type SetupWhen = "before" | "after" | "none";

export interface ContainerLineOptions {
  cwd?: string;
  /** Seconds. */
  timeout?: number;
  /** The tail to keep: lines and bytes. */
  maxLines?: number;
  maxBytes?: number;
  /** Default `before`. */
  setup?: SetupWhen;
}

/** Pasture phase 4: the setup script's path in the tree, and the line that runs it in `/workspace` of a fresh container. */
export const SETUP_PATH = "setup.sh";
export const SETUP_COMMAND = `sh ${PASTURE_ROOT}/${SETUP_PATH}`;
/** Seconds a setup run may take before it is killed; a warm-up that needs longer is a finding. */
export const SETUP_TIMEOUT_S = 10 * 60;

/** The first line of a tool result when setup failed before the command; setup's output follows it. */
export function setupFailedLine(exit: number): string {
  return `setup.sh failed (exit ${exit}); the command did not run:`;
}

/** The line before setup's output in a birth's entry when it failed after the clone. */
export function setupFailedAfterLine(exit: number): string {
  return `setup.sh failed (exit ${exit}) after the clone:`;
}

/** just-bash's bounds for one command. Generous for real work, fatal for `while true`. */
const EXECUTION_LIMITS = {
  maxCommandCount: 200_000,
  maxLoopIterations: 100_000,
  maxCallDepth: 200,
};

function toFileError(error: unknown, fallbackPath: string): FileError {
  if (error instanceof FileError) return error;
  if (error instanceof FsError) {
    const cause = error;
    switch (error.code) {
      case "ENOENT": return new FileError("not_found", error.message, error.path, cause);
      case "EACCES": return new FileError("permission_denied", error.message, error.path, cause);
      case "ENOTDIR": return new FileError("not_directory", error.message, error.path, cause);
      case "EISDIR": return new FileError("is_directory", error.message, error.path, cause);
      case "EEXIST":
      case "ENOTEMPTY":
      case "EFBIG":
      case "ELOOP":
      case "EINVAL":
        return new FileError("invalid", error.message, error.path, cause);
      case "EROFS":
        return new FileError("permission_denied", error.message, error.path, cause);
    }
  }
  const cause = error instanceof Error ? error : new Error(String(error));
  return new FileError("unknown", cause.message, fallbackPath, cause);
}

function toFileInfo(row: Pick<FileRow, "path" | "kind" | "size" | "mtimeMs">): FileInfo {
  return { name: posix.basename(row.path) || "/", path: row.path, kind: row.kind, size: row.size, mtimeMs: row.mtimeMs };
}

function byPath(a: FileInfo, b: FileInfo): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Tier 2, as the home provides it. `rent()` gives the cell's end of the
 * socket to a container for this lane, starting one when none is up;
 * the same socket again while it is up. `idle()` says a run has ended
 * and nothing is running, so the home may stop the container after its
 * idle period; the next `rent()` cancels that. Pen phase 3 gives it the
 * Containers binding (`pen/lease.ts`); the tests give it a function that
 * starts a fake. The two optional members are pen phase 3's: `discard()`
 * gives up a container that ignored `kill`, and `budgetSpent()` asks
 * whether the home's container budget is spent, which empties the tier-2
 * column for the command about to run.
 */
export interface ContainerLease {
  rent(): Promise<WebSocket>;
  idle(): void;
  discard?(reason: string): void;
  budgetSpent?(): Promise<boolean>;
}

/** What setup asks of the pasture's object at the moment of its run (pasture phase 4): every secret but `GIT_TOKEN`, name to value. The `Pasture` stub is one. */
export interface SetupSecrets {
  secrets(): Promise<Record<string, string>>;
}

export interface CellExecutionEnvOptions {
  cwd?: string;
  /** Default variables the shell sees when `inheritEnv` is true. */
  shellEnv?: Record<string, string>;
  now?: () => number;
  /** Tier 2. Absent, this home has no container: the table's tier-2 column is empty and the shell is just-bash over the rows. */
  container?: ContainerLease;
  /** Milliseconds a container has to answer `kill` before it is given up; absent, the cell waits. */
  killTimeoutMs?: number;
  /** Whether a container is up right now, socket open; absent, never. Tier 1 is chosen only when none is. */
  containerUp?: () => boolean;
  /** Tier 1. Absent, this home has no Worker Loader: `node` is the container's or nobody's, and the table says so. */
  isolate?: Isolate;
  /** The pasture this sheep was born into, as the cell reaches its object. Absent, there is no `/pasture`, no second backing, and no setup. */
  pasture?: PastureSource & SetupSecrets;
  /** The program's needs, for a sheep with a pasture: its name, this sheep's id, the object, and the directory's herd. Absent, the shell has no `pasture`. */
  pastureProgram?: PastureProgram;
}

/** How a command ended, before the capture is settled. */
type Outcome = { exitCode: number } | { error: ExecutionError };

/** A command's whole output, for the spill file, and how it ended; with `setup`, how the setup after it ended (pasture phase 4). */
interface Ran {
  full: string;
  outcome: Outcome;
  setup?: SetupEnd;
}

/** How a setup run went: nothing to run, or how it ended, with the `Ran` a tool call returns in the command's place when it did not exit 0. */
type Warmed = { skipped: true } | { skipped: false; end: SetupEnd; failed?: Ran };

/** The record for one container socket: its checkout, and whether setup has run on it. Per container, never in the rows. */
interface Lease {
  socket: WebSocket;
  checkout: Checkout;
  warmed: boolean;
}

export class CellExecutionEnv implements ExecutionEnv {
  cwd: string;
  readonly files: FilesTable;
  /** The shell's file system over the rows alone; a shell run with a pasture gets a `CellFs` of its own, with that call's mount. */
  readonly fs: CellFs;
  /** The second backing, or `undefined` for a pastureless cell, which has none anywhere. */
  readonly pasture: (PastureSource & SetupSecrets) | undefined;
  /** The program, or `undefined` for a pastureless cell, whose shell is made without it. */
  readonly pastureProgram: PastureProgram | undefined;
  private readonly shellEnv: Record<string, string>;
  private readonly container: ContainerLease | undefined;
  private readonly containerUp: (() => boolean) | undefined;
  private readonly isolate: Isolate | undefined;
  private readonly killTimeoutMs: number | undefined;
  /** The record for the container socket most recently rented; one per socket, so per container. */
  private lease: Lease | undefined;
  private runs = 0;

  constructor(sql: SqlStorage, options: CellExecutionEnvOptions = {}) {
    this.cwd = options.cwd ?? WORKSPACE_ROOT;
    this.files = new FilesTable(sql, options.now);
    this.files.init();
    this.fs = new CellFs(this.files);
    this.pasture = options.pasture;
    this.pastureProgram = options.pastureProgram;
    this.container = options.container;
    this.containerUp = options.containerUp;
    this.isolate = options.isolate;
    this.killTimeoutMs = options.killTimeoutMs;
    this.shellEnv = {
      HOME: WORKSPACE_ROOT,
      PATH: "/usr/local/bin:/usr/bin:/bin",
      TMPDIR: TEMP_ROOT,
      SHEEP: "1",
      ...options.shellEnv,
    };
  }

  /** What this home has, as the table sees it: the static half, without asking about the budget. */
  get home(): Home {
    return { container: this.container !== undefined, isolate: this.isolate !== undefined, containerUp: this.containerUp?.() === true };
  }

  /** What this home has right now: the static half plus the budget, asked of the lease. */
  async homeNow(): Promise<Home> {
    if (this.container?.budgetSpent === undefined) return this.home;
    return { ...this.home, budgetSpent: await this.container.budgetSpent() };
  }

  /**
   * Whether `file`, as the shell would resolve it, is a file in the
   * workspace: what tier 1 can be given. Only from the workspace root:
   * the isolate evaluates a script with the root as its working directory
   * whatever the shell's is, and pi's shell never leaves the root.
   */
  private isWorkspaceFile(file: string, cwd: string): boolean {
    if (cwd !== WORKSPACE_ROOT) return false;
    try {
      const resolved = normalizePath(posix.isAbsolute(file) ? file : posix.resolve(cwd, file));
      return resolved.startsWith(`${WORKSPACE_ROOT}/`) && this.files.stat(resolved).kind === "file";
    } catch {
      return false;
    }
  }

  private resolvePath(path: string): string {
    let normalized = path;
    if (normalized === "~") normalized = WORKSPACE_ROOT;
    else if (normalized.startsWith("~/")) normalized = posix.join(WORKSPACE_ROOT, normalized.slice(2));
    else if (normalized.startsWith("file://")) normalized = decodeURIComponent(normalized.slice("file://".length));
    return normalizePath(posix.isAbsolute(normalized) ? normalized : posix.resolve(this.cwd, normalized));
  }

  /**
   * Resolves, fences, and runs a read over the rows; with a pasture, a
   * path under `/pasture` runs `mounted` instead, over a `PastureCall` made
   * here. This is the call boundary for pi's file tools: one tool call is
   * one env method, one call, one manifest hop, forgotten on return.
   */
  private async guard<T>(
    path: string,
    signal: AbortSignal | undefined,
    read: (resolved: string) => T,
    mounted: (resolved: string, call: PastureCall) => Promise<T>,
  ): Promise<Result<T, FileError>> {
    const resolved = this.resolvePath(path);
    if (signal?.aborted) return err(new FileError("aborted", "aborted", resolved));
    if (this.pasture !== undefined && isPasturePath(resolved)) {
      try {
        return ok(await mounted(resolved, new PastureCall(this.pasture)));
      } catch (error) {
        return err(toFileError(error, resolved));
      }
    }
    if (!isReadable(resolved)) {
      return err(new FileError("permission_denied", `outside ${WORKSPACE_ROOT} and ${TEMP_ROOT}`, resolved));
    }
    try {
      return ok(read(resolved));
    } catch (error) {
      return err(toFileError(error, resolved));
    }
  }

  /**
   * The refusal every writing method makes under `/pasture`. Thrown, not
   * returned: pi's edit tool reports only a returned error's code, and the
   * sentence must reach the model from `edit` as it does from `write` and
   * from the shell. A pastureless cell returns at once.
   */
  private refuseWrite(path: string, syscall: string): void {
    if (this.pasture === undefined) return;
    const resolved = this.resolvePath(path);
    if (isPasturePath(resolved)) throw readOnly(syscall, resolved);
  }

  private static rowInfo(row: PastureRow): FileInfo {
    return toFileInfo(row);
  }

  async absolutePath(path: string, _context: Context): Promise<Result<string, FileError>> {
    try {
      return ok(this.resolvePath(path));
    } catch (error) {
      return err(toFileError(error, path));
    }
  }

  async joinPath(parts: string[], _context: Context): Promise<Result<string, FileError>> {
    return ok(posix.join(...parts));
  }

  async readTextFile(path: string, context: Context): Promise<Result<string, FileError>> {
    return this.guard(
      path,
      context.abortSignal,
      (resolved) => this.files.readText(resolved),
      (resolved, call) => call.readText(resolved),
    );
  }

  async readTextLines(path: string, options: { maxLines?: number } | undefined, context: Context): Promise<Result<string[], FileError>> {
    if (options?.maxLines !== undefined && options.maxLines <= 0) return ok([]);
    const lines = (text: string): string[] => {
      const all = text.split(/\r?\n/);
      if (text.endsWith("\n")) all.pop();
      return options?.maxLines === undefined ? all : all.slice(0, options.maxLines);
    };
    return this.guard(
      path,
      context.abortSignal,
      (resolved) => lines(this.files.readText(resolved)),
      async (resolved, call) => lines(await call.readText(resolved)),
    );
  }

  async readBinaryFile(path: string, context: Context): Promise<Result<Uint8Array, FileError>> {
    return this.guard(
      path,
      context.abortSignal,
      (resolved) => this.files.readFile(resolved),
      (resolved, call) => call.readFile(resolved),
    );
  }

  async writeFile(path: string, content: string | Uint8Array, context: Context): Promise<Result<void, FileError>> {
    this.refuseWrite(path, "open");
    return this.guard(path, context.abortSignal, (resolved) => this.files.writeFile(resolved, content, { createParents: true }), never);
  }

  async appendFile(path: string, content: string | Uint8Array, context: Context): Promise<Result<void, FileError>> {
    this.refuseWrite(path, "open");
    return this.guard(path, context.abortSignal, (resolved) => this.files.appendFile(resolved, content, { createParents: true }), never);
  }

  async renameFile(sourcePath: string, destinationPath: string, context: Context): Promise<Result<void, FileError>> {
    this.refuseWrite(sourcePath, "rename");
    this.refuseWrite(destinationPath, "rename");
    const destination = this.resolvePath(destinationPath);
    return this.guard(sourcePath, context.abortSignal, (resolved) => this.files.rename(resolved, destination), never);
  }

  async fileInfo(path: string, context: Context): Promise<Result<FileInfo, FileError>> {
    return this.guard(
      path,
      context.abortSignal,
      (resolved) => toFileInfo(this.files.stat(resolved, false)),
      async (resolved, call) => CellExecutionEnv.rowInfo(await call.stat(resolved)),
    );
  }

  async listDir(path: string, context: Context): Promise<Result<FileInfo[], FileError>> {
    const rows = (resolved: string): FileInfo[] => this.files.readdir(resolved).map(toFileInfo);
    if (this.pasture === undefined) return this.guard(path, context.abortSignal, rows, never);
    const pasture = this.pasture;
    const result = await this.guard(path, context.abortSignal, rows, async (resolved, call) => (await call.readdir(resolved)).map(CellExecutionEnv.rowInfo));
    if (!result.ok || this.resolvePath(path) !== "/") return result;
    // `/` lists the mount beside the rows' roots; its row is the pasture's, so the listing has its date.
    const root = await new PastureCall(pasture).stat(PASTURE_ROOT);
    return ok([...result.value, CellExecutionEnv.rowInfo(root)].sort(byPath));
  }

  async canonicalPath(path: string, context: Context): Promise<Result<string, FileError>> {
    return this.guard(
      path,
      context.abortSignal,
      (resolved) => {
        const canonical = this.files.resolve(resolved, true);
        if (this.files.get(canonical) === undefined) throw new FsError("ENOENT", "realpath", resolved);
        return canonical;
      },
      async (resolved, call) => {
        if ((await call.get(resolved)) === undefined) throw new FsError("ENOENT", "realpath", resolved);
        return resolved;
      },
    );
  }

  async exists(path: string, context: Context): Promise<Result<boolean, FileError>> {
    const result = await this.fileInfo(path, context);
    if (result.ok) return ok(true);
    if (result.error.code === "not_found") return ok(false);
    return err(result.error);
  }

  async createDir(path: string, options: { recursive?: boolean } | undefined, context: Context): Promise<Result<void, FileError>> {
    this.refuseWrite(path, "mkdir");
    return this.guard(path, context.abortSignal, (resolved) => this.files.mkdir(resolved, { recursive: options?.recursive ?? true }), never);
  }

  async remove(path: string, options: { recursive?: boolean; force?: boolean } | undefined, context: Context): Promise<Result<void, FileError>> {
    this.refuseWrite(path, "rm");
    return this.guard(
      path,
      context.abortSignal,
      (resolved) => this.files.rm(resolved, { recursive: options?.recursive ?? false, force: options?.force ?? false }),
      never,
    );
  }

  async createTempDir(prefix: string | undefined, context: Context): Promise<Result<string, FileError>> {
    const path = posix.join(TEMP_ROOT, `${prefix ?? "tmp-"}${crypto.randomUUID()}`);
    const result = await this.createDir(path, { recursive: true }, context);
    return result.ok ? ok(path) : err(result.error);
  }

  async createTempFile(options: { prefix?: string; suffix?: string } | undefined, context: Context): Promise<Result<string, FileError>> {
    const dir = await this.createTempDir("tmp-", context);
    if (!dir.ok) return dir;
    const path = posix.join(dir.value, `${options?.prefix ?? ""}${crypto.randomUUID()}${options?.suffix ?? ""}`);
    const result = await this.writeFile(path, "", context);
    return result.ok ? ok(path) : err(result.error);
  }

  async exec(command: string, options: ShellExecOptions | undefined, context: Context): Promise<Result<ShellExecResult, ExecutionError>> {
    const signal = context.abortSignal;
    if (signal?.aborted) return err(new ExecutionError("aborted", "aborted"));
    if (options?.timeout !== undefined) {
      if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
        return err(new ExecutionError("timeout", "Invalid timeout: must be a finite number of seconds"));
      }
      if (options.timeout * 1000 > MAX_TIMEOUT_MS) {
        return err(new ExecutionError("timeout", `Invalid timeout: maximum is ${MAX_TIMEOUT_MS / 1000} seconds`));
      }
    }
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.cwd;
    // The call boundary for the shell: one bash tool call, one `PastureCall`, dropped when the command ends. Its one
    // manifest hop happens at the first touch of `/pasture`, so a command that never looks there never pays it.
    const call = this.pasture === undefined ? undefined : new PastureCall(this.pasture);
    const cwdKind = call !== undefined && isPasturePath(cwd) ? (await call.get(cwd))?.kind : this.files.get(cwd)?.kind;
    if (cwdKind !== "directory") {
      return err(new ExecutionError("spawn_error", `Working directory does not exist: ${cwd}\nCannot execute bash commands.`));
    }

    let callbackError: ExecutionError | undefined;
    let capture: OutputCapture;
    try {
      capture = new OutputCapture(options?.capture, context, {
        onUpdate: options?.onUpdate,
        onError: (error: unknown) => {
          const cause = error instanceof Error ? error : new Error(String(error));
          callbackError ??= new ExecutionError("callback_error", cause.message, cause);
        },
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(new ExecutionError("unknown", cause.message, cause));
    }

    // No container: the shell of a home with no container, line for line; just-bash's own not-found line, annotated, is the refusal.
    // The one exception, on a home with the loader, is the tier-1 line, which the table is asked for either way.
    const home = this.container === undefined ? this.home : await this.homeNow();
    let route: Route = { tier: 0, programs: [] };
    if (this.container !== undefined || this.isolate !== undefined) {
      // The program is tier 0 in a pastured cell: a line of `pasture put …` stays in just-bash on a home with a container too.
      const classified = classify(command, home, (file) => this.isWorkspaceFile(file, cwd), this.pastureProgram === undefined ? undefined : PASTURE_PROGRAMS);
      if (this.container !== undefined || ("tier" in classified && classified.tier === 1)) route = classified;
    }
    const environment = options?.inheritEnv === false ? { ...options.env } : { ...this.shellEnv, ...options?.env };

    try {
      let ran: Ran;
      if ("refused" in route) {
        const line = refusalLine(route.refused, home);
        capture.push(line);
        ran = { full: line, outcome: { exitCode: 127 } };
      } else if (route.tier === 0) {
        ran = await this.runInShell(command, cwd, environment, options, signal, capture, home, call === undefined ? this.fs : new CellFs(this.files, call));
      } else if (route.tier === 1) {
        ran = await this.runInIsolate(route.file, route.args, cwd, options, signal, capture, home);
      } else {
        ran = await this.runInContainer(command, cwd, environment, options, signal, capture);
      }
      capture.finish();
      await this.spill(capture, ran.full, options, context);
      capture.flush();
      if (callbackError) return err(callbackError);
      if ("error" in ran.outcome) return err(ran.outcome.error);
      if (signal?.aborted) return err(new ExecutionError("aborted", "aborted"));
      const output = capture.snapshot();
      return ok({
        exitCode: ran.outcome.exitCode,
        truncation: output.truncation,
        ...(output.spillPath === undefined ? {} : { spillPath: output.spillPath }),
        ...(output.lastLineBytes === undefined ? {} : { lastLineBytes: output.lastLineBytes }),
      });
    } finally {
      capture.dispose();
    }
  }

  /**
   * Tier 0: just-bash over the rows, as the shell always ran it; `fs`
   * carries this call's mount when the cell has a pasture, and then, and
   * only then, just-bash is made with the `pasture` command over it. A
   * pastureless cell's just-bash is made exactly as before.
   */
  private async runInShell(
    command: string,
    cwd: string,
    environment: Record<string, string>,
    options: ShellExecOptions | undefined,
    signal: AbortSignal | undefined,
    capture: OutputCapture,
    home: Home,
    fs: CellFs,
  ): Promise<Ran> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = options?.timeout === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options.timeout * 1000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    const program = this.pastureProgram;
    const bash = new Bash({
      fs,
      cwd,
      env: { ...environment, PWD: cwd },
      executionLimits: EXECUTION_LIMITS,
      ...(program === undefined || fs.pasture === undefined ? {} : { customCommands: [pastureCommand(program, fs.pasture)] }),
    });

    try {
      let stdout = "";
      let stderr = "";
      let exitCode: number;
      try {
        const result = await bash.exec(command, { signal: controller.signal, cwd });
        stdout = result.stdout;
        stderr = annotateCommandNotFound(result.stderr, (program) => refusalSentence(program, home));
        if (fs.pasture !== undefined) stderr = annotateReadOnly(stderr, fs.pasture.refusals);
        exitCode = result.exitCode;
      } catch (error) {
        // just-bash throws for its own bounds and for aborts; both are the command failing, not the env.
        stderr = `${messageOf(error)}\n`;
        exitCode = 1;
      }
      capture.push(stdout);
      capture.push(stderr);
      const full = stdout + stderr;
      if (timedOut) return { full, outcome: { error: new ExecutionError("timeout", `timeout:${options?.timeout}`) } };
      if (signal?.aborted) return { full, outcome: { error: new ExecutionError("aborted", "aborted") } };
      return { full, outcome: { exitCode } };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  /** Every workspace file as the isolate receives it: bytes by path relative to the root; a link to a file is the file, a link to a directory is left out. */
  private workspaceFiles(): Record<string, Uint8Array> {
    const files: Record<string, Uint8Array> = {};
    for (const entry of this.files.manifest()) {
      if (entry.kind === "directory") continue;
      try {
        files[entry.path] = this.files.readFile(posix.join(WORKSPACE_ROOT, entry.path));
      } catch {
        // A dangling link, or one to a directory: nothing a module can be.
      }
    }
    return files;
  }

  /**
   * Tier 1: the script in a fresh isolate over a copy of the rows, its
   * output pushed whole when it ends. The runtime's own lines for what
   * the isolate lacks are replaced by the table's sentences, which name
   * tier 1: a refused `fetch`, an operation a module's top level cannot
   * do, and a write to the read-only workspace.
   */
  private async runInIsolate(
    file: string,
    args: string[],
    cwd: string,
    options: ShellExecOptions | undefined,
    signal: AbortSignal | undefined,
    capture: OutputCapture,
    home: Home,
  ): Promise<Ran> {
    const isolate = this.isolate;
    if (isolate === undefined) throw new Error("runInIsolate without an isolate");
    const resolved = normalizePath(posix.isAbsolute(file) ? file : posix.resolve(cwd, file));
    const started = Date.now();
    const files = this.workspaceFiles();
    const count = Object.keys(files).length;
    const wallMs = options?.timeout === undefined ? isolate.wallMs : options.timeout * 1000;
    let result;
    try {
      result = await isolate.run({ file: posix.relative(WORKSPACE_ROOT, resolved), args, files, wallMs, ...(signal === undefined ? {} : { signal }) });
    } catch (error) {
      if (error instanceof IsolateEnded) {
        console.info(`[pen] isolate ${file} ended (${error.reason}) after ${Date.now() - started} ms, ${count} files`);
        if (error.reason === "aborted") return { full: "", outcome: { error: new ExecutionError("aborted", "aborted") } };
        if (error.reason === "timeout" || options?.timeout !== undefined) return { full: "", outcome: { error: new ExecutionError("timeout", `timeout:${options?.timeout}`) } };
        const line = `pen: the script ran for ${Math.round(wallMs / 1000)} s without ending and was given up; nothing it printed came back\n`;
        capture.push(line);
        return { full: line, outcome: { exitCode: 1 } };
      }
      throw error;
    }
    const output = result.output
      .replace(/This worker is not permitted to access the internet[^\n]*/g, fetchRefused(home))
      .replace(/Disallowed operation called within global scope\.[^\n]*/g, isolateScopeRefused(home))
      .replace(/^(\w*Error: operation not permitted)$/gm, `$1 (${isolateReadOnly(home)})`);
    capture.push(output);
    console.info(`[pen] isolate ${file} exit ${result.exitCode} after ${Date.now() - started} ms, ${count} files`);
    if (signal?.aborted) return { full: output, outcome: { error: new ExecutionError("aborted", "aborted") } };
    return { full: output, outcome: { exitCode: result.exitCode } };
  }

  /** The record for this socket, made once per socket: its checkout, with the pasture's tree as the manifest's second root (pasture phase 3), and whether setup ran on it (pasture phase 4). */
  private leaseFor(socket: WebSocket): Lease {
    if (this.lease?.socket !== socket) {
      this.lease = { socket, checkout: new Checkout(socket, this.files, this.pasture === undefined ? {} : { pasture: this.pasture }), warmed: false };
    }
    return this.lease;
  }

  /**
   * One line in the container, whole, outside any tool call: pasture phase
   * 3's birth, `git clone` before the first prompt. Rented, synced in, run,
   * synced out, as a tool's tier-2 line is; the output is kept as a bounded
   * tail rather than streamed, and how it ended is said instead of thrown.
   * A home with no container, or one whose budget is spent, is an `error`
   * that says so. Setup (pasture phase 4) runs as it would for a tool's
   * line unless `setup` says otherwise: the birth asks for `after`, so the
   * script runs on the clone, and how it ended is said in `setup`.
   */
  async containerLine(command: string, options: ContainerLineOptions = {}): Promise<ContainerLineResult> {
    const home = await this.homeNow();
    if (!hasContainer(home)) return { output: "", truncated: false, end: { error: home.container ? BUDGET_SPENT_NOTICE : NO_CONTAINER_NOTICE } };
    const capture = new OutputCapture(
      { limits: { maxBytes: options.maxBytes ?? 16 * 1024, maxLines: options.maxLines ?? 40, retain: "tail" } },
      BACKGROUND_CONTEXT,
      { onError: () => {} },
    );
    try {
      const ran = await this.runInContainer(
        command,
        options.cwd ?? WORKSPACE_ROOT,
        this.shellEnv,
        options.timeout === undefined ? undefined : { timeout: options.timeout },
        undefined,
        capture,
        options.setup ?? "before",
      );
      capture.finish();
      const view = capture.snapshot();
      return {
        output: view.text,
        truncated: view.truncation.truncated,
        end: "error" in ran.outcome ? { error: ran.outcome.error.message } : { exit: ran.outcome.exitCode },
        ...(ran.setup === undefined ? {} : { setup: ran.setup }),
      };
    } finally {
      capture.dispose();
    }
  }

  /**
   * Tier 2: rent, sync in, run with the output streamed into the capture
   * as it arrives, sync out, and name what the sync refused. The socket
   * closing at any point settles the command as interrupted, with the
   * output so far and no exit code, which is journey 3. With a pasture
   * whose tree has `setup.sh`, the script runs after the sync-in into a
   * container that has not run it and before the command, or after the
   * command for a birth's clone; a setup that fails is returned in the
   * command's place (pasture phase 4).
   */
  private async runInContainer(
    command: string,
    cwd: string,
    environment: Record<string, string>,
    options: ShellExecOptions | undefined,
    signal: AbortSignal | undefined,
    capture: OutputCapture,
    setup: SetupWhen = "before",
  ): Promise<Ran> {
    const container = this.container;
    if (container === undefined) throw new Error("runInContainer without a container");
    let full = "";
    const unavailable = (message: string, cause?: Error): Ran => ({ full, outcome: { error: new ExecutionError("shell_unavailable", message, cause) } });

    let socket: WebSocket;
    try {
      socket = await container.rent();
    } catch (error) {
      return unavailable(`no container could be rented: ${messageOf(error)}`, error instanceof Error ? error : undefined);
    }
    const lease = this.leaseFor(socket);
    const { checkout } = lease;
    try {
      const syncInStarted = Date.now();
      let tree: ManifestEntry[] | undefined;
      try {
        tree = await checkout.syncIn();
      } catch (error) {
        if (error instanceof CheckoutInterrupted) return unavailable(error.message, error);
        return { full, outcome: { error: new ExecutionError("unknown", `the sync-in failed: ${messageOf(error)}`) } };
      }
      // Timings for the findings: what a sync-in costs for this workspace, and the run and sync-out after it.
      console.info(`[pen] sync-in ${Date.now() - syncInStarted} ms, ${this.files.manifest().length} entries`);

      // Setup, before this container's first command: a failure is the tool result, and the command does not run.
      if (setup === "before") {
        const warmed = await this.warm(lease, tree, signal, capture, setupFailedLine);
        if (!warmed.skipped && warmed.failed !== undefined) return warmed.failed;
      }

      // The container's own PATH and HOME win over the cell shell's stand-ins; the rest of the environment is what the shell would have seen.
      const { PATH: _path, HOME: _home, ...runEnv } = environment;
      const id = `run-${++this.runs}`;
      const frame = await this.runFrame(
        socket,
        { id, command, cwd, env: { ...runEnv, PWD: cwd }, ...(options?.timeout === undefined ? {} : { timeout: options.timeout }) },
        signal,
        (data) => {
          full += data;
          capture.push(data);
        },
        () => full,
      );
      if ("failed" in frame) return frame.failed;
      const { end } = frame;

      let refused: Refused[];
      const syncOutStarted = Date.now();
      try {
        refused = await checkout.syncOut(id);
        console.info(`[pen] sync-out ${Date.now() - syncOutStarted} ms, ${refused.length} refused`);
      } catch (error) {
        if (error instanceof CheckoutInterrupted) return unavailable(interruptedDuringSyncOut(end), error);
        return { full, outcome: { error: new ExecutionError("unknown", `the sync-out failed: ${messageOf(error)}`) } };
      }
      for (const entry of refused) {
        const line = `pen: ${entry.path} (${entry.size} bytes) is over the per-file limit and was not synced\n`;
        full += line;
        capture.push(line);
      }

      if (frame.timedOut) return { full, outcome: { error: new ExecutionError("timeout", `timeout:${options?.timeout}`) } };
      if (frame.aborted || signal?.aborted) return { full, outcome: { error: new ExecutionError("aborted", "aborted") } };
      if ("killed" in end) {
        // Ended by the container's own hand: its backstop timer, or a reason of its own.
        if (end.killed === "timeout") return { full, outcome: { error: new ExecutionError("timeout", `timeout:${options?.timeout}`) } };
        return { full, outcome: { error: new ExecutionError("unknown", `the container ended the command: ${end.killed}`) } };
      }

      // Setup after the line, for a birth: on the clone, in the same container; how it ended is said beside the clone's.
      if (setup === "after" && end.exit === 0) {
        const warmed = await this.warm(lease, tree, signal, capture, setupFailedAfterLine);
        if (!warmed.skipped) {
          if (warmed.failed !== undefined) full += warmed.failed.full;
          return { full, outcome: { exitCode: end.exit }, setup: warmed.end };
        }
      }
      return { full, outcome: { exitCode: end.exit } };
    } finally {
      container.idle();
    }
  }

  /**
   * One `run` frame on the socket: sent, its output handed on as it
   * arrives, settled on `exit` or `killed`. A timeout or an abort kills
   * it; the container ignoring the kill past its deadline, or going away,
   * is a `failed` `Ran` for the caller to return as the command's.
   */
  private async runFrame(
    socket: WebSocket,
    request: { id: string; command: string; cwd: string; env: Record<string, string>; timeout?: number },
    signal: AbortSignal | undefined,
    output: (data: string) => void,
    full: () => string,
  ): Promise<{ end: RunEnd; timedOut: boolean; aborted: boolean } | { failed: Ran }> {
    const container = this.container;
    if (container === undefined) throw new Error("runFrame without a container");
    const run = new ContainerRun(socket, request, { stdout: output, stderr: output }, this.killTimeoutMs === undefined ? {} : { killTimeoutMs: this.killTimeoutMs });
    let timedOut = false;
    let aborted = false;
    const timeoutId = request.timeout === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          run.kill("timeout");
        }, request.timeout * 1000);
    const onAbort = () => {
      aborted = true;
      run.kill("aborted");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const started = Date.now();
    try {
      const end = await run.start();
      console.info(`[pen] run ${request.id} ${"exit" in end ? `exit ${end.exit}` : `killed (${end.killed})`} after ${Date.now() - started} ms`);
      return { end, timedOut, aborted };
    } catch (error) {
      const unavailable = (message: string, cause: Error): Ran => ({ full: full(), outcome: { error: new ExecutionError("shell_unavailable", message, cause) } });
      if (error instanceof KillUnanswered) {
        // The container ignored the kill past its deadline: give it up, and say so instead of a fake exit code.
        container.discard?.(error.reason);
        return { failed: unavailable(killUnanswered(error.killReason, error.seconds), error) };
      }
      if (error instanceof RunInterrupted) return { failed: unavailable(INTERRUPTED_DURING_RUN, error) };
      return { failed: { full: full(), outcome: { error: new ExecutionError("spawn_error", messageOf(error), error instanceof Error ? error : undefined) } } };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Setup (pasture phase 4): `sh /pasture/setup.sh` in `/workspace`, once
   * per container, when the tree the sync-in just sent has the script and
   * this socket's record says it has not run. Its `run` frame carries the
   * pasture's secrets, all but `GIT_TOKEN`, read from the object now; no
   * other frame does. Its output is buffered, not streamed: on exit 0 it
   * goes nowhere but a log line with the duration, and the record is
   * marked; otherwise it becomes the `failed` `Ran`, `line(exit)` first,
   * pushed into the capture for the caller to return. The run is synced
   * out like any other, so what setup wrote to the checkout is rows.
   */
  private async warm(lease: Lease, tree: ManifestEntry[] | undefined, signal: AbortSignal | undefined, capture: OutputCapture, line: (exit: number) => string): Promise<Warmed> {
    const pasture = this.pasture;
    if (lease.warmed || pasture === undefined) return { skipped: true };
    if (!tree?.some((entry) => entry.path === SETUP_PATH && entry.kind === "file")) return { skipped: true };
    const { checkout } = lease;
    let output = "";
    const failed = (outcome: Outcome): Ran => {
      const full = "error" in outcome ? output : `${line(outcome.exitCode)}\n${output}`;
      capture.push(full);
      return { full, outcome };
    };
    const unavailable = (message: string, cause?: Error): Warmed => ({ skipped: false, end: { error: message }, failed: failed({ error: new ExecutionError("shell_unavailable", message, cause) }) });

    let secrets: Record<string, string>;
    try {
      secrets = await pasture.secrets();
    } catch (error) {
      const message = `the pasture's secrets could not be read for setup: ${messageOf(error)}`;
      return { skipped: false, end: { error: message }, failed: failed({ error: new ExecutionError("unknown", message) }) };
    }
    const { PATH: _path, HOME: _home, ...runEnv } = this.shellEnv;
    const id = `setup-${++this.runs}`;
    const started = Date.now();
    const frame = await this.runFrame(
      lease.socket,
      { id, command: SETUP_COMMAND, cwd: WORKSPACE_ROOT, env: { ...runEnv, ...secrets, PWD: WORKSPACE_ROOT }, timeout: SETUP_TIMEOUT_S },
      signal,
      (data) => {
        output += data;
      },
      () => output,
    );
    if ("failed" in frame) {
      const { outcome } = frame.failed;
      return { skipped: false, end: "error" in outcome ? { error: outcome.error.message } : { exit: outcome.exitCode }, failed: failed(outcome) };
    }
    const { end } = frame;
    try {
      await checkout.syncOut(id);
    } catch (error) {
      if (error instanceof CheckoutInterrupted) return unavailable(interruptedDuringSyncOut(end), error);
      const message = `the sync-out after setup failed: ${messageOf(error)}`;
      return { skipped: false, end: { error: message }, failed: failed({ error: new ExecutionError("unknown", message) }) };
    }
    if (frame.aborted || signal?.aborted) return { skipped: false, end: { error: "aborted" }, failed: failed({ error: new ExecutionError("aborted", "aborted") }) };
    if ("killed" in end) {
      const message = end.killed === "timeout" ? `setup ran for ${SETUP_TIMEOUT_S} s without ending and was killed` : `the container ended setup: ${end.killed}`;
      return { skipped: false, end: { error: message }, failed: failed({ error: new ExecutionError(end.killed === "timeout" ? "timeout" : "unknown", message) }) };
    }
    console.info(`[pen] setup exit ${end.exit} after ${Date.now() - started} ms, ${output.length} bytes of output`);
    if (end.exit !== 0) return { skipped: false, end: { exit: end.exit }, failed: failed({ exitCode: end.exit }) };
    lease.warmed = true;
    return { skipped: false, end: { exit: 0 } };
  }

  /** The whole output to a file under `/tmp` when the view was truncated, as pi's bash renderer expects. */
  private async spill(capture: OutputCapture, full: string, options: ShellExecOptions | undefined, context: Context): Promise<void> {
    if (!options?.capture?.spill || !capture.truncated) return;
    const spill = await this.createTempFile({ prefix: "pi-output-", suffix: ".log" }, context);
    if (!spill.ok) return;
    try {
      this.files.writeFile(spill.value, full);
      capture.setSpillPath(spill.value);
    } catch {
      // Over the per-file cap: the bounded view stands on its own.
    }
  }

  async cleanup(_context: Context): Promise<void> {
    // No processes to kill. The table stays; `/tmp` is truncated by the cell when the lane idles.
  }
}

/** The mounted branch of a writing method: unreachable, since `refuseWrite` threw first. */
function never(resolved: string): Promise<never> {
  return Promise.reject(readOnly("open", resolved));
}

export { MAX_FILE_BYTES };
