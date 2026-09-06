/**
 * A smart-HTTP git server for the tests: lamb's fifty lines of `git
 * http-backend` as CGI in Node, revived for pen phase 4, on a free port,
 * serving one bare fixture repository seeded with a typo in two files.
 * A push (`git-receive-pack`, the ref advertisement and the pack alike)
 * needs `Authorization: Basic` of `x-access-token:<token>`; without it
 * the answer is 401 with `WWW-Authenticate: Basic`, which is what makes
 * real git ask its credential helper. A clone needs nothing.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GitServer {
  /** The fixture repository's URL, `http://127.0.0.1:<port>/fixture.git`. */
  url: string;
  /** `http://127.0.0.1:<port>`, what git names as the host in a credential request. */
  origin: string;
  /** What a push must carry as the password beside the username `x-access-token`. */
  token: string;
  /** The bare repository on disk. */
  bare: string;
  /** Every request, in order: what git asked for and whether it carried the token. */
  requests: Array<{ method: string; path: string; authorized: boolean; status: number }>;
  close(): Promise<void>;
}

/** The typo the fixture seeds, in two files, for journey 2 step 2's "across the docs". */
export const TYPO = "repositry";
export const SEEDED = {
  "README.md": `# Fixture\n\nThis ${TYPO} has a typo.\n`,
  "docs/guide.md": `# Guide\n\nClone the ${TYPO} first.\n`,
  "notes.txt": "one\ntwo\n",
} as const;

function cgi(root: string, request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://localhost");
  const child = spawn("git", ["http-backend"], {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: root,
      GIT_HTTP_EXPORT_ALL: "1",
      GATEWAY_INTERFACE: "CGI/1.1",
      SERVER_PROTOCOL: "HTTP/1.1",
      REQUEST_METHOD: request.method ?? "GET",
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      CONTENT_TYPE: request.headers["content-type"] ?? "",
      CONTENT_LENGTH: request.headers["content-length"] ?? "",
      HTTP_CONTENT_ENCODING: request.headers["content-encoding"] ?? "",
      REMOTE_ADDR: "127.0.0.1",
      REMOTE_USER: "x-access-token",
    },
  });
  request.pipe(child.stdin);
  const chunks: Buffer[] = [];
  let headersDone = false;
  child.stdout.on("data", (chunk: Buffer) => {
    if (headersDone) {
      response.write(chunk);
      return;
    }
    chunks.push(chunk);
    const joined = Buffer.concat(chunks);
    const split = joined.indexOf("\r\n\r\n");
    if (split < 0) return;
    headersDone = true;
    const head = joined.subarray(0, split).toString("utf8");
    let status = 200;
    for (const line of head.split("\r\n")) {
      const [name, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (name === undefined) continue;
      if (name.toLowerCase() === "status") status = Number(value.split(" ")[0]);
      else response.setHeader(name, value);
    }
    response.writeHead(status);
    response.write(joined.subarray(split + 4));
  });
  child.stdout.on("end", () => response.end());
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(`[git http-backend] ${chunk}`));
}

/** A push is the receive-pack service, asked for as the advertisement (`GET …?service=git-receive-pack`) or the pack (`POST …/git-receive-pack`). */
function isPush(request: IncomingMessage): boolean {
  const url = new URL(request.url ?? "/", "http://localhost");
  return url.searchParams.get("service") === "git-receive-pack" || url.pathname.endsWith("/git-receive-pack");
}

export async function startGitServer(): Promise<GitServer> {
  const root = mkdtempSync(join(tmpdir(), "pen-git-"));
  const bare = join(root, "fixture.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  execFileSync("git", ["-C", bare, "config", "http.receivepack", "true"]);
  const work = join(root, "seed");
  execFileSync("git", ["clone", "-q", bare, work], { stdio: "ignore" });
  for (const [path, content] of Object.entries(SEEDED)) {
    mkdirSync(join(work, path, ".."), { recursive: true });
    writeFileSync(join(work, path), content);
  }
  const author = ["-c", "user.name=Seed", "-c", "user.email=seed@example.com"];
  execFileSync("git", ["-C", work, "add", "-A"]);
  execFileSync("git", ["-C", work, ...author, "commit", "-q", "-m", "seed"]);
  execFileSync("git", ["-C", work, "push", "-q", "origin", "HEAD:main"], { stdio: "ignore" });

  // The token is the fixture's own, made here, and looks like nothing else in a transcript.
  const token = `fixture-${randomBytes(18).toString("hex")}`;
  const expected = `Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  const requests: GitServer["requests"] = [];
  const server = createServer((request, response) => {
    const authorized = request.headers.authorization === expected;
    const entry = { method: request.method ?? "GET", path: request.url ?? "/", authorized, status: 200 };
    requests.push(entry);
    if (isPush(request) && !authorized) {
      entry.status = 401;
      response.writeHead(401, { "WWW-Authenticate": 'Basic realm="pen fixture"', "Content-Type": "text/plain" });
      response.end("a push needs the token\n");
      request.resume();
      return;
    }
    cgi(root, request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  return {
    url: `${origin}/fixture.git`,
    origin,
    token,
    bare,
    requests,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
    },
  };
}
