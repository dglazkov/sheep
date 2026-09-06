/**
 * The entry module of the fresh isolate: the one module of the cell's
 * own that a tier-1 worker is loaded with, as source text, since the
 * loader takes code as strings. It is plain JavaScript inside a string,
 * so nothing here is typechecked; `test/isolate.test.ts` is what checks
 * it, in workerd, through the loader.
 *
 * It exports a `WorkerEntrypoint` with one method, `run(file, args)`,
 * which captures `console` and `process.stdout`/`stderr` into strings,
 * sets `process.argv` as node would, imports the script, and returns
 * what it printed and how it ended. The workspace is not put anywhere
 * by this module: it arrives as the worker's own modules, which the
 * runtime shows under `/bundle`, read-only, and `/bundle` is the working
 * directory a module is evaluated in. That is the only place the
 * script's top level can see. Workerd evaluates a module outside any
 * request: `/tmp` there is a throwaway of its own, `cwd` is `/bundle`
 * whatever a handler set, and there are no timers, no random values,
 * and no I/O. A file written from the handler is invisible to the
 * script, which is why the workspace is modules and not `node:fs`.
 */
export const ENTRY_MODULE = "__pen_entry.mjs";

/** Where the workspace is inside the isolate: the bundle, which is the working directory of a module's evaluation. */
export const ISOLATE_WORKSPACE = "/bundle";

export const ENTRY_SOURCE = String.raw`
import { WorkerEntrypoint } from "cloudflare:workers";
import process from "node:process";
import { format } from "node:util";

const ROOT = ${JSON.stringify(ISOLATE_WORKSPACE)};

class Exit extends Error {
  constructor(code) {
    super("process.exit(" + code + ")");
    this.code = code;
  }
}

export default class extends WorkerEntrypoint {
  async run(file, args) {
    let stdout = "";
    let stderr = "";
    let output = "";
    const out = (text) => {
      stdout += text;
      output += text;
    };
    const err = (text) => {
      stderr += text;
      output += text;
    };
    const line = (sink) => (...parts) => sink(format(...parts) + "\n");
    console.log = line(out);
    console.info = line(out);
    console.debug = line(out);
    console.warn = line(err);
    console.error = line(err);
    console.trace = line(err);
    const chunkText = (chunk) => (typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    try {
      process.stdout.write = (chunk) => (out(chunkText(chunk)), true);
      process.stderr.write = (chunk) => (err(chunkText(chunk)), true);
    } catch {
      // Then only console is captured; the test says which.
    }
    process.exit = (code) => {
      throw new Exit(code === undefined ? Number(process.exitCode ?? 0) : Number(code));
    };
    process.argv = ["node", ROOT + "/" + file, ...args];
    try {
      process.exitCode = undefined;
    } catch {
      // A fresh isolate has none set anyway.
    }

    let exitCode = 0;
    try {
      await import("./" + file);
      exitCode = Number(process.exitCode ?? 0);
    } catch (error) {
      if (error instanceof Exit) {
        exitCode = error.code;
      } else {
        exitCode = 1;
        const text = error instanceof Error ? (error.stack && error.stack.includes(error.message) ? error.stack : error.name + ": " + error.message) : String(error);
        err(text + "\n");
      }
    }
    return { stdout, stderr, output, exitCode };
  }
}
`;
