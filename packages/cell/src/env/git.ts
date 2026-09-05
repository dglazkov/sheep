/**
 * `git` as a command in the shell: a thin set of verbs over isomorphic-git
 * against the workspace rows, output shaped like git's. Credentials come
 * from the home's secrets through `onAuth` and never touch the workspace,
 * the environment the shell exposes, or the transcript.
 */
import { createTwoFilesPatch } from "diff";
import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { defineCommand } from "just-bash/browser";
import { posix } from "node:path";
import { createNodeFsPromises } from "../workspace/cell-fs.ts";
import { type FilesTable, FsError, MAX_FILE_BYTES } from "../workspace/files.ts";

export interface GitOptions {
  /** Bearer credential for HTTPS remotes; sent as the password with username `x-access-token`. */
  token?: string;
  author: { name: string; email: string };
}

const SUPPORTED = ["clone", "status", "add", "commit", "log", "diff", "checkout", "branch", "push", "pull", "remote", "init"] as const;

interface Result {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const ok = (stdout = ""): Result => ({ stdout, stderr: "", exitCode: 0 });
const fail = (stderr: string, exitCode = 1): Result => ({ stdout: "", stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`, exitCode });

const utf8 = new TextDecoder();

export function createGitCommand(files: FilesTable, options: GitOptions) {
  const fs = { promises: createNodeFsPromises(files) };
  const onAuth = options.token === undefined ? undefined : () => ({ username: "x-access-token", password: options.token });

  /** The repository root at or above `cwd`. */
  const findRoot = async (cwd: string): Promise<string | undefined> => {
    let dir = cwd;
    for (;;) {
      if (files.get(posix.join(dir, ".git"))?.kind === "directory") return dir;
      if (dir === "/") return undefined;
      dir = posix.dirname(dir);
    }
  };
  const requireRoot = async (cwd: string): Promise<string> => {
    const root = await findRoot(cwd);
    if (root === undefined) throw new Error("fatal: not a git repository (or any of the parent directories): .git");
    return root;
  };

  const verbs: Record<(typeof SUPPORTED)[number], (args: string[], cwd: string) => Promise<Result>> = {
    async init(args, cwd) {
      const dir = posix.resolve(cwd, args[0] ?? ".");
      files.mkdir(dir, { recursive: true });
      await git.init({ fs, dir, defaultBranch: "main" });
      return ok(`Initialized empty Git repository in ${dir}/.git/\n`);
    },

    async clone(args, cwd) {
      // `--depth N` consumes the following token as its value; `--depth=N` carries it inline.
      // Track the consumed value index so it is not mistaken for the url or directory positional.
      const depthIndex = args.indexOf("--depth");
      const inlineDepth = args.find((arg) => arg.startsWith("--depth="));
      const depthValueIndex = depthIndex >= 0 ? depthIndex + 1 : -1;
      const depthRaw = inlineDepth !== undefined ? inlineDepth.slice("--depth=".length) : depthIndex >= 0 ? args[depthValueIndex] : undefined;
      const depthRequested = depthIndex >= 0 || inlineDepth !== undefined;
      if (depthRequested && (depthRaw === undefined || !/^\d+$/.test(depthRaw) || Number(depthRaw) < 1)) {
        return fail(`fatal: --depth expects a positive integer`, 128);
      }
      const depth = depthRaw === undefined ? undefined : Number(depthRaw);
      const positional = args.filter((arg, index) => !arg.startsWith("-") && index !== depthValueIndex);
      const url = positional[0];
      if (url === undefined) return fail("usage: git clone <url> [<directory>]");
      const name = positional[1] ?? posix.basename(url).replace(/\.git$/, "");
      const dir = posix.resolve(cwd, name);
      if (files.get(dir) !== undefined && files.readdir(dir).length > 0) {
        return fail(`fatal: destination path '${name}' already exists and is not an empty directory.`, 128);
      }
      try {
        await git.clone({ fs, http, dir, url, onAuth, ...(depth === undefined ? {} : { depth }), singleBranch: depth !== undefined });
      } catch (error) {
        files.rm(dir, { recursive: true, force: true });
        if (error instanceof FsError && error.code === "EFBIG") {
          return fail(`fatal: clone refused: ${error.path} exceeds the per-file limit of ${MAX_FILE_BYTES} bytes; nothing was written`, 128);
        }
        return fail(`fatal: ${error instanceof Error ? error.message : String(error)}`, 128);
      }
      return ok(`Cloning into '${name}'...\n`);
    },

    async status(_args, cwd) {
      const dir = await requireRoot(cwd);
      const branch = (await git.currentBranch({ fs, dir })) ?? "(detached)";
      const lines = [`On branch ${branch}`];
      const matrix = await git.statusMatrix({ fs, dir });
      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];
      // statusMatrix rows are [HEAD, WORKDIR, STAGE]: 0 absent; 1 same as HEAD;
      // 2 same as WORKDIR (for STAGE) or different from HEAD (for WORKDIR); 3 different from both.
      for (const [file, head, workdir, stage] of matrix) {
        if (head === 1 && workdir === 1 && stage === 1) continue;
        if (head === 0 && workdir === 2 && stage === 0) untracked.push(file);
        else if (head === 0 && workdir === 2 && stage === 2) staged.push(`new file:   ${file}`);
        else if (head === 0 && workdir === 2 && stage === 3) staged.push(`new file:   ${file}`), unstaged.push(`modified:   ${file}`);
        else if (head === 1 && workdir === 0 && stage === 0) staged.push(`deleted:    ${file}`);
        else if (head === 1 && workdir === 0 && stage === 1) unstaged.push(`deleted:    ${file}`);
        else if (head === 1 && workdir === 2 && stage === 1) unstaged.push(`modified:   ${file}`);
        else if (head === 1 && workdir === 2 && stage === 2) staged.push(`modified:   ${file}`);
        else if (head === 1 && workdir === 2 && stage === 3) staged.push(`modified:   ${file}`), unstaged.push(`modified:   ${file}`);
      }
      if (staged.length > 0) lines.push("", "Changes to be committed:", ...staged.map((line) => `\t${line}`));
      if (unstaged.length > 0) lines.push("", "Changes not staged for commit:", ...unstaged.map((line) => `\t${line}`));
      if (untracked.length > 0) lines.push("", "Untracked files:", ...untracked.map((line) => `\t${line}`));
      if (staged.length + unstaged.length + untracked.length === 0) lines.push("", "nothing to commit, working tree clean");
      return ok(`${lines.join("\n")}\n`);
    },

    async add(args, cwd) {
      const dir = await requireRoot(cwd);
      const all = args.includes("-A") || args.includes("--all") || args.includes(".");
      const paths = args.filter((arg) => !arg.startsWith("-") && arg !== ".");
      const matrix = await git.statusMatrix({ fs, dir });
      const relative = (path: string): string => posix.relative(dir, posix.resolve(cwd, path));
      const wanted = new Set(paths.map(relative));
      for (const [file, , workdir, stage] of matrix) {
        const selected = all || wanted.has(file) || [...wanted].some((prefix) => file.startsWith(`${prefix}/`));
        if (!selected) continue;
        if (workdir === 0) await git.remove({ fs, dir, filepath: file });
        else if (workdir === 2 && stage !== 2) await git.add({ fs, dir, filepath: file });
      }
      return ok();
    },

    async commit(args, cwd) {
      const dir = await requireRoot(cwd);
      const messageIndex = args.indexOf("-m");
      const message = messageIndex >= 0 ? args[messageIndex + 1] : undefined;
      if (!message) return fail("error: commit needs -m <message> in this shell");
      if (args.includes("-a") || args.includes("-am")) await verbs.add(["-A"], cwd);
      const sha = await git.commit({ fs, dir, message, author: options.author });
      const branch = (await git.currentBranch({ fs, dir })) ?? "HEAD";
      return ok(`[${branch} ${sha.slice(0, 7)}] ${message.split("\n")[0]}\n`);
    },

    async log(args, cwd) {
      const dir = await requireRoot(cwd);
      const limitIndex = args.findIndex((arg) => /^-n$|^--max-count$/.test(arg));
      const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : args.find((arg) => /^-\d+$/.test(arg)) ? Number(args.find((arg) => /^-\d+$/.test(arg))!.slice(1)) : 20;
      const oneline = args.includes("--oneline");
      const commits = await git.log({ fs, dir, depth: limit });
      const lines = commits.map((entry) => {
        if (oneline) return `${entry.oid.slice(0, 7)} ${entry.commit.message.split("\n")[0]}`;
        const when = new Date(entry.commit.author.timestamp * 1000).toISOString();
        return `commit ${entry.oid}\nAuthor: ${entry.commit.author.name} <${entry.commit.author.email}>\nDate:   ${when}\n\n    ${entry.commit.message.trim().split("\n").join("\n    ")}\n`;
      });
      return ok(lines.join("\n") + (oneline ? "\n" : ""));
    },

    async diff(args, cwd) {
      const dir = await requireRoot(cwd);
      const cached = args.includes("--cached") || args.includes("--staged");
      const matrix = await git.statusMatrix({ fs, dir });
      const patches: string[] = [];
      for (const [file, head, workdir, stage] of matrix) {
        // Unstaged: the working tree differs from the index. Cached: the index differs from HEAD.
        const changed = cached ? stage !== 1 && !(head === 0 && stage === 0) : workdir === 2 ? stage !== 2 : workdir === 0 ? stage !== 0 : false;
        if (!changed) continue;
        const headText = head === 0 ? "" : await readAtHead(dir, file);
        const stagedText = stage === 0 ? "" : stage === 1 ? headText : await readStaged(dir, file);
        const worktreeText = workdir === 0 ? "" : utf8.decode(files.readFile(posix.join(dir, file)));
        const before = cached ? headText : stagedText;
        const after = cached ? stagedText : worktreeText;
        if (before === after) continue;
        // Shape the hunks like git: a `diff --git` header, a mode line for adds and deletes,
        // and `/dev/null` on the absent side. `createTwoFilesPatch` emits an `===` separator
        // and the `---`/`+++` lines; keep those (with /dev/null where a side is empty) and drop
        // the separator, then prepend git's own header.
        const oldName = before === "" ? "/dev/null" : `a/${file}`;
        const newName = after === "" ? "/dev/null" : `b/${file}`;
        const body = createTwoFilesPatch(oldName, newName, before, after, undefined, undefined, { context: 3 }).replace(/^={3,}\n/m, "");
        const modeLine = before === "" ? "new file mode 100644\n" : after === "" ? "deleted file mode 100644\n" : "";
        patches.push(`diff --git a/${file} b/${file}\n${modeLine}${body}`);
      }
      return ok(patches.join(""));
    },

    async checkout(args, cwd) {
      const dir = await requireRoot(cwd);
      const create = args.includes("-b");
      const ref = args.filter((arg) => !arg.startsWith("-")).at(-1);
      if (ref === undefined) return fail("usage: git checkout [-b] <branch>");
      if (create) {
        await git.branch({ fs, dir, ref, checkout: true });
        return ok(`Switched to a new branch '${ref}'\n`);
      }
      await git.checkout({ fs, dir, ref });
      return ok(`Switched to branch '${ref}'\n`);
    },

    async branch(args, cwd) {
      const dir = await requireRoot(cwd);
      const name = args.find((arg) => !arg.startsWith("-"));
      if (name !== undefined) {
        await git.branch({ fs, dir, ref: name });
        return ok();
      }
      const current = await git.currentBranch({ fs, dir });
      const branches = await git.listBranches({ fs, dir });
      return ok(branches.map((branch) => `${branch === current ? "* " : "  "}${branch}\n`).join(""));
    },

    async remote(args, cwd) {
      const dir = await requireRoot(cwd);
      if (args[0] === "add" && args[1] && args[2]) {
        await git.addRemote({ fs, dir, remote: args[1], url: args[2] });
        return ok();
      }
      const remotes = await git.listRemotes({ fs, dir });
      const verbose = args.includes("-v");
      return ok(remotes.map((entry) => (verbose ? `${entry.remote}\t${entry.url} (fetch)\n${entry.remote}\t${entry.url} (push)\n` : `${entry.remote}\n`)).join(""));
    },

    async push(args, cwd) {
      const dir = await requireRoot(cwd);
      const positional = args.filter((arg) => !arg.startsWith("-"));
      const remote = positional[0] ?? "origin";
      const ref = positional[1] ?? (await git.currentBranch({ fs, dir })) ?? undefined;
      const result = await git.push({ fs, http, dir, remote, ref, remoteRef: ref, onAuth, force: args.includes("-f") || args.includes("--force") });
      if (!result.ok) return fail(`error: push rejected: ${result.error ?? "unknown"}`);
      if (args.includes("-u") || args.includes("--set-upstream")) {
        await git.setConfig({ fs, dir, path: `branch.${ref}.remote`, value: remote });
        await git.setConfig({ fs, dir, path: `branch.${ref}.merge`, value: `refs/heads/${ref}` });
      }
      const remoteUrl = (await git.listRemotes({ fs, dir })).find((entry) => entry.remote === remote)?.url ?? remote;
      return ok(`To ${remoteUrl}\n * [new branch]      ${ref} -> ${ref}\n`);
    },

    async pull(args, cwd) {
      const dir = await requireRoot(cwd);
      const positional = args.filter((arg) => !arg.startsWith("-"));
      const ref = positional[1] ?? (await git.currentBranch({ fs, dir })) ?? undefined;
      await git.pull({ fs, http, dir, ref, singleBranch: true, onAuth, author: options.author });
      return ok("Already up to date.\n");
    },
  };

  async function readAtHead(dir: string, file: string): Promise<string> {
    try {
      const oid = await git.resolveRef({ fs, dir, ref: "HEAD" });
      const { blob } = await git.readBlob({ fs, dir, oid, filepath: file });
      return utf8.decode(blob);
    } catch {
      return "";
    }
  }

  /** The index's content for a file. Stage 2 means it equals the working tree; stage 3 is approximated by it too. */
  async function readStaged(dir: string, file: string): Promise<string> {
    return utf8.decode(files.readFile(posix.join(dir, file)));
  }

  return defineCommand("git", async (args, ctx) => {
    const verb = args[0];
    if (verb === undefined || verb === "--help" || verb === "-h") {
      return ok(`usage: git <${SUPPORTED.join("|")}> ...\nThis shell's git runs inside the session over isomorphic-git; other verbs are not available.\n`);
    }
    if (!(SUPPORTED as readonly string[]).includes(verb)) {
      return fail(`git: ${verb} is not available in this shell (available: ${SUPPORTED.join(", ")})`, 2);
    }
    try {
      return await verbs[verb as (typeof SUPPORTED)[number]](args.slice(1), ctx.cwd);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 128);
    }
  });
}
