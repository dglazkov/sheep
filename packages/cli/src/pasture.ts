/**
 * The dog's pasture verbs: `sheep pasture new|ls|cat|put|rm|secret`, and
 * the bare `sheep pasture <name>` for the meta and the herd. Each is one or
 * two requests to the home and exits. Nothing local is uploaded by
 * `--repo .`: the CLI reads the checkout's `origin` and stores the URL. A
 * secret's value is read from stdin and never taken as an argument, so it
 * is in no shell history and no `ps`.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { Output } from "./herd.js";
import type { Home, SessionSummary } from "./home.js";

/** A pasture's name is a Durable Object name and a column the herd view prints, so it is plain. */
export const PASTURE_NAME = /^[a-z0-9-]+$/;
export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const NO_ORIGIN = "no `origin` remote here, so --repo . names no repository; pass --repo <url>, or run this in a checkout that has one";
export const VALUE_NOT_AN_ARGUMENT = "a secret's value is read from stdin, never taken as an argument: pipe it in";

const run = promisify(execFile);

function fail(output: Output, message: string): number {
  output.err(`sheep: ${message}\n`);
  return 2;
}

/** `git remote get-url origin` where the CLI stands; the sentence, not a guess, when there is none. */
export async function originOf(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", ["remote", "get-url", "origin"], { cwd });
    const url = stdout.trim();
    return url.length > 0 ? url : undefined;
  } catch {
    return undefined;
  }
}

async function readStdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

export interface PastureArgs {
  /** The words after `pasture`. */
  rest: string[];
  repo?: string;
  branch?: string;
}

/** One line per sheep of the herd: id, name, state, born, task; the columns `sheep ls` has, less the pasture, which is the heading. */
export function herdLine(session: SessionSummary): string {
  return `${session.id}\t${session.name ?? ""}\t${session.state}\t${new Date(session.createdAt).toISOString()}\t${session.task ?? ""}`;
}

export async function runPasture(home: Home, args: PastureArgs, output: Output): Promise<number> {
  const [verb, ...words] = args.rest;
  if (verb === undefined) return fail(output, "pasture needs a verb: new, ls, cat, put, rm, secret, or a pasture's name");
  switch (verb) {
    case "new": {
      const name = words[0];
      if (name === undefined) return fail(output, "pasture new needs a name");
      if (!PASTURE_NAME.test(name)) return fail(output, `a pasture's name is [a-z0-9-]+, not ${JSON.stringify(name)}`);
      let repo = args.repo;
      if (repo === ".") {
        repo = await originOf(process.cwd());
        if (repo === undefined) return fail(output, NO_ORIGIN);
      }
      const meta = await home.createPasture({ name, ...(repo === undefined ? {} : { repo }), ...(args.branch === undefined ? {} : { branch: args.branch }) });
      if (output.json) output.out(`${JSON.stringify(meta)}\n`);
      else output.out(`${meta.name}\t${meta.repo ?? ""}\t${meta.branch}\n`);
      return 0;
    }
    case "ls": {
      const name = words[0];
      if (name === undefined) {
        const pastures = await home.pastures();
        if (output.json) output.out(`${JSON.stringify(pastures)}\n`);
        else for (const pasture of pastures) output.out(`${pasture.name}\t${new Date(pasture.createdAt).toISOString()}\n`);
        return 0;
      }
      // The tree, or one directory of it: every entry under the path, one per line, a directory with its slash.
      const under = (words[1] ?? "").replace(/^\/+|\/+$/g, "");
      const prefix = under === "" ? "" : `${under}/`;
      const entries = (await home.tree(name)).filter((entry) => entry.path.startsWith(prefix));
      if (output.json) output.out(`${JSON.stringify(entries)}\n`);
      else for (const entry of entries) output.out(`${entry.path}${entry.kind === "directory" ? "/" : ""}\n`);
      return 0;
    }
    case "cat": {
      const [name, path] = words;
      if (name === undefined || path === undefined) return fail(output, "pasture cat needs a pasture and a path");
      process.stdout.write(await home.cat(name, path));
      return 0;
    }
    case "put": {
      const [name, path, file] = words;
      if (name === undefined || path === undefined) return fail(output, "pasture put needs a pasture and a path; the content is a file, or stdin");
      const content = file === undefined ? await readStdin() : new Uint8Array(await readFile(file));
      const entry = await home.put(name, path, content);
      if (output.json) output.out(`${JSON.stringify(entry)}\n`);
      else output.out(`${name}\t${entry.path}\t${content.byteLength}\n`);
      return 0;
    }
    case "rm": {
      const [name, path] = words;
      if (name === undefined || path === undefined) return fail(output, "pasture rm needs a pasture and a path");
      await home.rm(name, path);
      return 0;
    }
    case "secret": {
      const [action, name, key, extra] = words;
      if (action === "set") {
        if (name === undefined || key === undefined) return fail(output, "pasture secret set needs a pasture and a KEY; the value is stdin");
        if (extra !== undefined) return fail(output, VALUE_NOT_AN_ARGUMENT);
        if (!SECRET_NAME.test(key)) return fail(output, `a secret's name is an environment variable's, not ${JSON.stringify(key)}`);
        // One trailing newline is `echo`'s, not the value's.
        const value = Buffer.from(await readStdin()).toString("utf8").replace(/\r?\n$/, "");
        if (value.length === 0) return fail(output, "the value on stdin is empty");
        await home.setSecret(name, key, value);
        output.out(`${name}\t${key}\n`);
        return 0;
      }
      if (action === "ls") {
        if (name === undefined) return fail(output, "pasture secret ls needs a pasture");
        const names = await home.secretNames(name);
        if (output.json) output.out(`${JSON.stringify(names)}\n`);
        else for (const secret of names) output.out(`${secret}\n`);
        return 0;
      }
      return fail(output, "pasture secret needs set or ls");
    }
    default: {
      // The bare form: `sheep pasture <name>`, the meta and the herd.
      if (!PASTURE_NAME.test(verb)) return fail(output, `unknown pasture verb: ${verb}`);
      const view = await home.pasture(verb);
      if (output.json) {
        output.out(`${JSON.stringify(view)}\n`);
        return 0;
      }
      output.out(`name: ${view.name}\nrepo: ${view.repo ?? "(none)"}\nbranch: ${view.branch}\ncreated: ${new Date(view.createdAt).toISOString()}\n`);
      for (const session of view.herd) output.out(`${herdLine(session)}\n`);
      return 0;
    }
  }
}
