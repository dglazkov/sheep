/**
 * Tier 1: the fresh isolate. Pen phase 5. A `node <file> [args…]` line
 * when no container is up runs in a dynamic worker from the Worker
 * Loader binding, loaded anew for every run (`load`, never `get`, so
 * nothing is cached and nothing carries over), with `globalOutbound:
 * null` so `fetch` and `connect` throw, the cell's own compatibility
 * date, a CPU limit, and an empty `env`: no secret, no stub, no binding
 * of the cell's. The workspace is the worker's modules.
 *
 * Every workspace file goes in as a `data` module under its own
 * relative path, and the runtime shows the modules under `/bundle`,
 * which is where a module is evaluated with its working directory, so
 * the script reads the workspace with `node:fs` by relative path as it
 * would on a disk. It cannot write there: `/bundle` is read-only, and
 * the `/tmp` a module's evaluation sees is a throwaway of its own that
 * no handler shares. Tier 1 is a script that reads and prints. Only the
 * script and the files it reaches by static import are `js`, `cjs`, or
 * `json` modules, found by walking their relative specifiers: the loader
 * compiles every such module at start, so a workspace file that is not
 * JavaScript, or is JavaScript with a mistake in it, would fail every
 * run if it were one.
 *
 * The CPU limit is the runtime's to enforce, and the local runtime does
 * not: a script that loops without yielding freezes local workerd, the
 * cell's timers included, until the process is killed. The race against
 * pi's timeout and the cell's own wall clock is kept for the deployed
 * runtime, where the isolate has a thread of its own, and is not proved
 * here.
 */
import { posix } from "node:path";
import { ENTRY_MODULE, ENTRY_SOURCE } from "./isolate-entry.ts";

/** The cell's own compatibility date, `wrangler.jsonc`'s; the isolate is loaded with the same one. */
export const COMPATIBILITY_DATE = "2026-08-22";

/** The CPU the isolate may spend on one run, in ms, when `PEN_ISOLATE_CPU_MS` is unset. */
export const DEFAULT_CPU_MS = 10_000;

export interface IsolateRequest {
  /** The script, relative to the workspace root. */
  file: string;
  args: string[];
  /** Every workspace file, bytes by path relative to the root. */
  files: Record<string, Uint8Array>;
  /** Milliseconds of wall clock after which the run is given up. */
  wallMs: number;
  signal?: AbortSignal;
}

export interface IsolateResult {
  stdout: string;
  stderr: string;
  /** Both, in the order they were written. */
  output: string;
  exitCode: number;
}

/** The run did not end by itself: pi's timeout, the turn's abort, or the cell's wall clock. */
export class IsolateEnded extends Error {
  constructor(readonly reason: "timeout" | "aborted" | "wall") {
    super(`the isolate was ended: ${reason}`);
    this.name = "IsolateEnded";
  }
}

export type LoaderModule = { js: string } | { cjs: string } | { json: unknown } | { data: ArrayBuffer };

const SPECIFIER = /(?:\bimport\s*(?:[^'"()]*?\bfrom\s*)?|\bexport\s+[^'"]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
const ESM_SYNTAX = /^\s*(?:import\s*[\w{*'"]|export\s+(?:default|const|let|var|function|class|async|\{|\*))/m;

const decoder = new TextDecoder();

/** Node's rule for a `.js` file: the nearest package.json's `type`, else what the file's own syntax says. */
export function moduleKind(file: string, source: string, files: Record<string, Uint8Array>): "js" | "cjs" {
  if (file.endsWith(".mjs")) return "js";
  if (file.endsWith(".cjs")) return "cjs";
  let dir = posix.dirname(file);
  for (;;) {
    const manifest = files[dir === "." ? "package.json" : `${dir}/package.json`];
    if (manifest !== undefined) {
      try {
        const type = (JSON.parse(decoder.decode(manifest)) as { type?: unknown }).type;
        if (type === "module") return "js";
        if (type === "commonjs") return "cjs";
      } catch {
        // Not JSON; node would say so too, and fall through to the syntax.
      }
      break;
    }
    if (dir === ".") break;
    dir = posix.dirname(dir);
  }
  return ESM_SYNTAX.test(source) ? "js" : "cjs";
}

/** What a relative specifier from `from` names in the workspace, resolved as node would: exact, then the extensions, then an index. */
function resolveSpecifier(from: string, specifier: string, files: Record<string, Uint8Array>): string | undefined {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (base.startsWith("../") || base === "..") return undefined;
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`, `${base}/index.js`, `${base}/index.mjs`, `${base}/index.cjs`];
  return candidates.find((candidate) => files[candidate] !== undefined);
}

/** The files the script reaches by relative static specifiers, itself first, each with the kind node would give it. */
export function reached(file: string, files: Record<string, Uint8Array>): Map<string, "js" | "cjs" | "json"> {
  const kinds = new Map<string, "js" | "cjs" | "json">();
  const queue = [file];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (kinds.has(current)) continue;
    const bytes = files[current];
    if (bytes === undefined) continue;
    if (current.endsWith(".json")) {
      kinds.set(current, "json");
      continue;
    }
    const source = decoder.decode(bytes);
    kinds.set(current, moduleKind(current, source, files));
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[1]!;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;
      const resolved = resolveSpecifier(current, specifier, files);
      if (resolved !== undefined) queue.push(resolved);
    }
  }
  return kinds;
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * The modules the isolate is loaded with: the entry, and every workspace
 * file under its own path; the script and what it reaches as code, the
 * rest as bytes. A specifier that names no workspace file is left to the
 * runtime, which says "No such module".
 */
export function modulesFor(file: string, files: Record<string, Uint8Array>): Record<string, LoaderModule> {
  const modules: Record<string, LoaderModule> = { [ENTRY_MODULE]: { js: ENTRY_SOURCE } };
  const code = reached(file, files);
  for (const [path, bytes] of Object.entries(files)) {
    if (path === ENTRY_MODULE) continue;
    const kind = code.get(path);
    if (kind === undefined) {
      modules[path] = { data: asBuffer(bytes) };
    } else if (kind === "json") {
      try {
        modules[path] = { json: JSON.parse(decoder.decode(bytes)) };
      } catch {
        modules[path] = { data: asBuffer(bytes) };
      }
    } else {
      const source = decoder.decode(bytes);
      modules[path] = kind === "js" ? { js: source } : { cjs: source };
    }
  }
  return modules;
}

export interface IsolateOptions {
  cpuMs?: number;
  /** The wall clock a run may take when pi's command has no timeout of its own; default six times the CPU limit, at least thirty seconds. */
  wallMs?: number;
  compatibilityDate?: string;
}

interface RunStub {
  run(file: string, args: string[]): Promise<IsolateResult>;
  [Symbol.dispose]?(): void;
}

export class Isolate {
  readonly cpuMs: number;
  readonly wallMs: number;
  private readonly compatibilityDate: string;

  constructor(
    private readonly loader: WorkerLoader,
    options: IsolateOptions = {},
  ) {
    this.cpuMs = options.cpuMs ?? DEFAULT_CPU_MS;
    this.wallMs = options.wallMs ?? Math.max(this.cpuMs * 6, 30_000);
    this.compatibilityDate = options.compatibilityDate ?? COMPATIBILITY_DATE;
  }

  /** The code a run is loaded with; exported so a test can see what the isolate is given and nothing more. */
  code(request: Pick<IsolateRequest, "file" | "files">): WorkerLoaderWorkerCode {
    return {
      compatibilityDate: this.compatibilityDate,
      mainModule: ENTRY_MODULE,
      modules: modulesFor(request.file, request.files),
      env: {},
      globalOutbound: null,
      limits: { cpuMs: this.cpuMs, subRequests: 0 },
    };
  }

  /**
   * One run in a worker loaded for it alone. The RPC is raced against
   * pi's abort and the wall clock; when either wins the stub is disposed
   * and `IsolateEnded` says which. A load error, which is how a syntax
   * error in the script or a module it imports arrives, is the script
   * failing: exit 1 with the runtime's message on stderr.
   */
  async run(request: IsolateRequest): Promise<IsolateResult> {
    if (request.signal?.aborted) throw new IsolateEnded("aborted");
    const worker = this.loader.load(this.code(request));
    const stub = worker.getEntrypoint() as unknown as RunStub;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const ended = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new IsolateEnded("wall")), request.wallMs);
      onAbort = () => reject(new IsolateEnded("aborted"));
      request.signal?.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const call = stub.run(request.file, request.args);
      // A rejection after the race is settled is nobody's; keep it from being unhandled.
      call.catch(() => undefined);
      return await Promise.race([call, ended]);
    } catch (error) {
      if (error instanceof IsolateEnded) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const stderr = `${message.replace(/^Failed to start Worker:\s*/, "")}\n`;
      return { stdout: "", stderr, output: stderr, exitCode: 1 };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort !== undefined) request.signal?.removeEventListener("abort", onAbort);
      try {
        stub[Symbol.dispose]?.();
      } catch {
        // Already gone.
      }
    }
  }
}
