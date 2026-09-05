/**
 * pi's `ExecutionEnv` for a cell: the `FileSystem` over the workspace
 * table, and the `Shell` over just-bash in the same isolate. Mirrors
 * `NodeExecutionEnv` method for method, minus the process plumbing a cell
 * does not have.
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
import { Bash } from "just-bash/browser";
import { posix } from "node:path";
import { CellFs } from "../workspace/cell-fs.ts";
import { type FileRow, FilesTable, FsError, isReadable, MAX_FILE_BYTES, normalizePath, TEMP_ROOT, WORKSPACE_ROOT } from "../workspace/files.ts";
import { createGitCommand, type GitOptions } from "./git.ts";
import { annotateCommandNotFound } from "./shell-notice.ts";

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

export interface CellExecutionEnvOptions {
  cwd?: string;
  /** Default variables the shell sees when `inheritEnv` is true. */
  shellEnv?: Record<string, string>;
  now?: () => number;
  /** Credentials and author for the shell's `git`. Absent means `git` still works, unauthenticated. */
  git?: GitOptions;
}

export class CellExecutionEnv implements ExecutionEnv {
  cwd: string;
  readonly files: FilesTable;
  readonly fs: CellFs;
  private readonly shellEnv: Record<string, string>;
  private readonly commands: ReturnType<typeof createGitCommand>[];

  constructor(sql: SqlStorage, options: CellExecutionEnvOptions = {}) {
    this.cwd = options.cwd ?? WORKSPACE_ROOT;
    this.files = new FilesTable(sql, options.now);
    this.files.init();
    this.fs = new CellFs(this.files);
    this.commands = [createGitCommand(this.files, options.git ?? { author: { name: "lamb", email: "lamb@localhost" } })];
    this.shellEnv = {
      HOME: WORKSPACE_ROOT,
      PATH: "/usr/local/bin:/usr/bin:/bin",
      TMPDIR: TEMP_ROOT,
      LAMB: "1",
      ...options.shellEnv,
    };
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

    const environment = options?.inheritEnv === false ? { ...options.env } : { ...this.shellEnv, ...options?.env };
    const bash = new Bash({
      fs: this.fs,
      cwd,
      env: { ...environment, PWD: cwd },
      executionLimits: EXECUTION_LIMITS,
      customCommands: this.commands,
    });

    try {
      let stdout = "";
      let stderr = "";
      let exitCode: number;
      try {
        const result = await bash.exec(command, { signal: controller.signal, cwd });
        stdout = result.stdout;
        stderr = annotateCommandNotFound(result.stderr);
        exitCode = result.exitCode;
      } catch (error) {
        // just-bash throws for its own bounds and for aborts; both are the command failing, not the env.
        const message = error instanceof Error ? error.message : String(error);
        stderr = `${message}\n`;
        exitCode = 1;
      }
      capture.push(stdout);
      capture.push(stderr);
      capture.finish();
      if (options?.capture?.spill && capture.truncated) {
        const spill = await this.createTempFile({ prefix: "pi-output-", suffix: ".log" }, context);
        if (spill.ok) {
          this.files.writeFile(spill.value, stdout + stderr);
          capture.setSpillPath(spill.value);
        }
      }
      capture.flush();
      if (callbackError) return err(callbackError);
      if (timedOut) return err(new ExecutionError("timeout", `timeout:${options?.timeout}`));
      if (signal?.aborted) return err(new ExecutionError("aborted", "aborted"));
      const output = capture.snapshot();
      return ok({
        exitCode,
        truncation: output.truncation,
        ...(output.spillPath === undefined ? {} : { spillPath: output.spillPath }),
        ...(output.lastLineBytes === undefined ? {} : { lastLineBytes: output.lastLineBytes }),
      });
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      capture.dispose();
    }
  }

  async cleanup(_context: Context): Promise<void> {
    // No processes to kill. The table stays; `/tmp` is truncated by the cell when the lane idles.
  }
}

export { MAX_FILE_BYTES };
