/**
 * vitest globalSetup: a smart-HTTP git server on 127.0.0.1:4180 serving a
 * bare fixture repository through `git http-backend`, with pushes allowed.
 * Runs in Node; the cell's tests reach it from workerd over fetch.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const GIT_SERVER_PORT = 4180;

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
      REMOTE_USER: "fixture",
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

export default async function setup(): Promise<() => Promise<void>> {
  const root = mkdtempSync(join(tmpdir(), "lamb-git-"));
  const bare = join(root, "fixture.git");
  execFileSync("git", ["init", "--bare", "-b", "main", bare]);
  execFileSync("git", ["-C", bare, "config", "http.receivepack", "true"]);
  const work = join(root, "seed");
  execFileSync("git", ["clone", "-q", bare, work]);
  writeFileSync(join(work, "README.md"), "# Fixture\n\nThis repositry has a typo.\n");
  writeFileSync(join(work, "notes.txt"), "one\ntwo\n");
  const author = ["-c", "user.name=Seed", "-c", "user.email=seed@example.com"];
  execFileSync("git", ["-C", work, "add", "-A"]);
  execFileSync("git", ["-C", work, ...author, "commit", "-q", "-m", "seed"]);
  execFileSync("git", ["-C", work, "push", "-q", "origin", "HEAD:main"]);

  const server = createServer((request, response) => cgi(root, request, response));
  await new Promise<void>((resolve) => server.listen(GIT_SERVER_PORT, "127.0.0.1", resolve));
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  };
}
