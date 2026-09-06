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
 */
import type { Context } from "@earendil-works/pi-agent-core";
import {
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
import type { Refused } from "@sheep/pen/protocol";
import { Bash } from "just-bash/browser";
import { posix } from "node:path";
import { Checkout, CheckoutInterrupted } from "../pen/checkout.ts";
import { type Isolate, IsolateEnded } from "../pen/isolate.ts";
import { ContainerRun, KillUnanswered, type RunEnd, RunInterrupted } from "../pen/run.ts";
import { CellFs } from "../workspace/cell-fs.ts";
import { type FileRow, FilesTable, FsError, isReadable, MAX_FILE_BYTES, normalizePath, TEMP_ROOT, WORKSPACE_ROOT } from "../workspace/files.ts";
import {
  annotateCommandNotFound,
  classify,
  fetchRefused,
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
    }
  }
  const cause = error instanceof Error ? error : new Error(String(error));
  return new FileError("unknown", cause.message, fallbackPath, cause);
}

function toFileInfo(row: FileRow): FileInfo {
  return { name: posix.basename(row.path) || "/", path: row.path, kind: row.kind, size: row.size, mtimeMs: row.mtimeMs };
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
}

/** How a command ended, before the capture is settled. */
type Outcome = { exitCode: number } | { error: ExecutionError };

/** A command's whole output, for the spill file, and how it ended. */
interface Ran {
  full: string;
  outcome: Outcome;
}

export class CellExecutionEnv implements ExecutionEnv {
  cwd: string;
  readonly files: FilesTable;
  readonly fs: CellFs;
  private readonly shellEnv: Record<string, string>;
  private readonly container: ContainerLease | undefined;
  private readonly containerUp: (() => boolean) | undefined;
  private readonly isolate: Isolate | undefined;
  private readonly killTimeoutMs: number | undefined;
  /** The checkout over the container socket most recently rented; one `Checkout` per socket. */
  private lease: { socket: WebSocket; checkout: Checkout } | undefined;
  private runs = 0;

  constructor(sql: SqlStorage, options: CellExecutionEnvOptions = {}) {
    this.cwd = options.cwd ?? WORKSPACE_ROOT;
    this.files = new FilesTable(sql, options.now);
    this.files.init();
    this.fs = new CellFs(this.files);
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

  private guard<T>(path: string, signal: AbortSignal | undefined, read: (resolved: string) => T): Result<T, FileError> {
    const resolved = this.resolvePath(path);
    if (signal?.aborted) return err(new FileError("aborted", "aborted", resolved));
    if (!isReadable(resolved)) {
      return err(new FileError("permission_denied", `outside ${WORKSPACE_ROOT} and ${TEMP_ROOT}`, resolved));
    }
    try {
      return ok(read(resolved));
    } catch (error) {
      return err(toFileError(error, resolved));
    }
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
    return this.guard(path, context.abortSignal, (resolved) => this.files.readText(resolved));
  }

  async readTextLines(path: string, options: { maxLines?: number } | undefined, context: Context): Promise<Result<string[], FileError>> {
    if (options?.maxLines !== undefined && options.maxLines <= 0) return ok([]);
    return this.guard(path, context.abortSignal, (resolved) => {
      const text = this.files.readText(resolved);
      const lines = text.split(/\r?\n/);
      if (text.endsWith("\n")) lines.pop();
      return options?.maxLines === undefined ? lines : lines.slice(0, options.maxLines);
    });
  }

  async readBinaryFile(path: string, context: Context): Promise<Result<Uint8Array, FileError>> {
    return this.guard(path, context.abortSignal, (resolved) => this.files.readFile(resolved));
  }

  async writeFile(path: string, content: string | Uint8Array, context: Context): Promise<Result<void, FileError>> {
    return this.guard(path, context.abortSignal, (resolved) => this.files.writeFile(resolved, content, { createParents: true }));
  }

  async appendFile(path: string, content: string | Uint8Array, context: Context): Promise<Result<void, FileError>> {
    return this.guard(path, context.abortSignal, (resolved) => this.files.appendFile(resolved, content, { createParents: true }));
  }

  async renameFile(sourcePath: string, destinationPath: string, context: Context): Promise<Result<void, FileError>> {
    const destination = this.resolvePath(destinationPath);
    return this.guard(sourcePath, context.abortSignal, (resolved) => this.files.rename(resolved, destination));
  }

  async fileInfo(path: string, context: Context): Promise<Result<FileInfo, FileError>> {
    return this.guard(path, context.abortSignal, (resolved) => toFileInfo(this.files.stat(resolved, false)));
  }

  async listDir(path: string, context: Context): Promise<Result<FileInfo[], FileError>> {
    return this.guard(path, context.abortSignal, (resolved) => this.files.readdir(resolved).map(toFileInfo));
  }

  async canonicalPath(path: string, context: Context): Promise<Result<string, FileError>> {
    return this.guard(path, context.abortSignal, (resolved) => {
      const canonical = this.files.resolve(resolved, true);
      if (this.files.get(canonical) === undefined) throw new FsError("ENOENT", "realpath", resolved);
      return canonical;
    });
  }

  async exists(path: string, context: Context): Promise<Result<boolean, FileError>> {
    const result = await this.fileInfo(path, context);
    if (result.ok) return ok(true);
    if (result.error.code === "not_found") return ok(false);
    return err(result.error);
  }

  async createDir(path: string, options: { recursive?: boolean } | undefined, context: Context): Promise<Result<void, FileError>> {
    return this.guard(path, context.abortSignal, (resolved) => this.files.mkdir(resolved, { recursive: options?.recursive ?? true }));
  }

  async remove(path: string, options: { recursive?: boolean; force?: boolean } | undefined, context: Context): Promise<Result<void, FileError>> {
    return this.guard(path, context.abortSignal, (resolved) =>
      this.files.rm(resolved, { recursive: options?.recursive ?? false, force: options?.force ?? false }),
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
    const cwdRow = this.files.get(cwd);
    if (cwdRow === undefined || cwdRow.kind !== "directory") {
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
      const classified = classify(command, home, (file) => this.isWorkspaceFile(file, cwd));
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
        ran = await this.runInShell(command, cwd, environment, options, signal, capture, home);
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

  /** Tier 0: just-bash over the rows, as the shell always ran it. */
  private async runInShell(
    command: string,
    cwd: string,
    environment: Record<string, string>,
    options: ShellExecOptions | undefined,
    signal: AbortSignal | undefined,
    capture: OutputCapture,
    home: Home,
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

    const bash = new Bash({
      fs: this.fs,
      cwd,
      env: { ...environment, PWD: cwd },
      executionLimits: EXECUTION_LIMITS,
    });

    try {
      let stdout = "";
      let stderr = "";
      let exitCode: number;
      try {
        const result = await bash.exec(command, { signal: controller.signal, cwd });
        stdout = result.stdout;
        stderr = annotateCommandNotFound(result.stderr, (program) => refusalSentence(program, home));
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

  /** The checkout over this socket, made once per socket. */
  private checkoutFor(socket: WebSocket): Checkout {
    if (this.lease?.socket !== socket) this.lease = { socket, checkout: new Checkout(socket, this.files) };
    return this.lease.checkout;
  }

  /**
   * Tier 2: rent, sync in, run with the output streamed into the capture
   * as it arrives, sync out, and name what the sync refused. The socket
   * closing at any point settles the command as interrupted, with the
   * output so far and no exit code, which is journey 3.
   */
  private async runInContainer(
    command: string,
    cwd: string,
    environment: Record<string, string>,
    options: ShellExecOptions | undefined,
    signal: AbortSignal | undefined,
    capture: OutputCapture,
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
    const checkout = this.checkoutFor(socket);
    try {
      const syncInStarted = Date.now();
      try {
        await checkout.syncIn();
      } catch (error) {
        if (error instanceof CheckoutInterrupted) return unavailable(error.message, error);
        return { full, outcome: { error: new ExecutionError("unknown", `the sync-in failed: ${messageOf(error)}`) } };
      }
      // Timings for the findings: what a sync-in costs for this workspace, and the run and sync-out after it.
      console.info(`[pen] sync-in ${Date.now() - syncInStarted} ms, ${this.files.manifest().length} entries`);

      // The container's own PATH and HOME win over the cell shell's stand-ins; the rest of the environment is what the shell would have seen.
      const { PATH: _path, HOME: _home, ...runEnv } = environment;
      const id = `run-${++this.runs}`;
      const run = new ContainerRun(
        socket,
        { id, command, cwd, env: { ...runEnv, PWD: cwd }, ...(options?.timeout === undefined ? {} : { timeout: options.timeout }) },
        {
          stdout: (data) => {
            full += data;
            capture.push(data);
          },
          stderr: (data) => {
            full += data;
            capture.push(data);
          },
        },
        this.killTimeoutMs === undefined ? {} : { killTimeoutMs: this.killTimeoutMs },
      );
      let timedOut = false;
      let aborted = false;
      const timeoutId = options?.timeout === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            run.kill("timeout");
          }, options.timeout * 1000);
      const onAbort = () => {
        aborted = true;
        run.kill("aborted");
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      let end: RunEnd;
      const runStarted = Date.now();
      try {
        end = await run.start();
        console.info(`[pen] run ${id} ${"exit" in end ? `exit ${end.exit}` : `killed (${end.killed})`} after ${Date.now() - runStarted} ms`);
      } catch (error) {
        if (error instanceof KillUnanswered) {
          // The container ignored the kill past its deadline: give it up, and say so instead of a fake exit code.
          container.discard?.(error.reason);
          return unavailable(killUnanswered(error.killReason, error.seconds), error);
        }
        if (error instanceof RunInterrupted) return unavailable(INTERRUPTED_DURING_RUN, error);
        return { full, outcome: { error: new ExecutionError("spawn_error", messageOf(error), error instanceof Error ? error : undefined) } };
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);
      }

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

      if (timedOut) return { full, outcome: { error: new ExecutionError("timeout", `timeout:${options?.timeout}`) } };
      if (aborted || signal?.aborted) return { full, outcome: { error: new ExecutionError("aborted", "aborted") } };
      if ("killed" in end) {
        // Ended by the container's own hand: its backstop timer, or a reason of its own.
        if (end.killed === "timeout") return { full, outcome: { error: new ExecutionError("timeout", `timeout:${options?.timeout}`) } };
        return { full, outcome: { error: new ExecutionError("unknown", `the container ended the command: ${end.killed}`) } };
      }
      return { full, outcome: { exitCode: end.exit } };
    } finally {
      container.idle();
    }
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

export { MAX_FILE_BYTES };
