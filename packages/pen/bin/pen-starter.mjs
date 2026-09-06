#!/usr/bin/env node
// The starter beside a celld node: pen phase 6's answer to "who starts the
// container" when there is no Containers binding. A small HTTP service on
// 127.0.0.1 that drives Docker on this machine and speaks the three verbs
// the cell's `ContainerStarter` has, one POST with a JSON body each:
//
//   POST /ensure  { session, cellUrl, token, env }  -> { started }
//   POST /renew   { session }                       -> { running }
//   POST /destroy { session }                       -> {}
//
// `ensure` runs `docker run -d --rm --name pen-<session> ... <image>` when no
// container for that session is running, else renews its idle clock. The
// idle stop is this program's own timer per session: after PEN_IDLE with no
// ensure or renew, `docker stop` (SIGTERM; the agent closes its socket with
// 1000 and exits). `destroy` is `docker kill`, the shepherd's hand made an
// endpoint. Nothing is reported to anyone: the cell's lease counts the
// minutes from its socket. The container dials the cell at `cellUrl` as the
// cell said it, or at --cell-origin's origin with the cell's path and query
// when this machine's Docker cannot reach the cell where the cell thinks it
// lives (a Mac with Docker Desktop: http://host.docker.internal:9876).
//
// Plain node, no dependencies; `docker` from DOCKER or PATH, so a test can
// put a stub in front of it. Listens on loopback only: whoever can reach
// this port can start containers.
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";

const USAGE = `pen-starter — start the pen image beside a celld node

usage: pen-starter [--port PORT] [--idle DURATION] [--image IMAGE] [--cell-origin URL]

  --port PORT          listen on 127.0.0.1:PORT (default 9877, or PEN_STARTER_PORT)
  --idle DURATION      stop a container this long after its last ensure or renew: "10m", "30s", "1h",
                       or seconds (default 10m, or PEN_IDLE)
  --image IMAGE        the image to run (default sheep-pen:dev, or PEN_IMAGE)
  --cell-origin URL    what the container dials in place of the origin the cell gave, keeping the cell's
                       path and query (PEN_CELL_ORIGIN); unset, the container dials the cell's URL as is
  -h, --help           this
`;

/** `"10m"`, `"30s"`, `"1h"`, or seconds; the cell's own grammar, so PEN_IDLE means the same on both sides. */
export function parseDuration(value, fallback) {
  const text = value === undefined || value === "" ? fallback : String(value);
  const match = /^(\d+)([smh])?$/.exec(text);
  if (match === null) throw new Error(`not a duration: ${text}`);
  const amount = Number(match[1]);
  return match[2] === "m" ? amount * 60 : match[2] === "h" ? amount * 3600 : amount;
}

export function parseArgs(argv, env) {
  const options = {
    port: Number(env.PEN_STARTER_PORT || 9877),
    idle: env.PEN_IDLE || "10m",
    image: env.PEN_IMAGE || "sheep-pen:dev",
    cellOrigin: env.PEN_CELL_ORIGIN || undefined,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === "--port") options.port = Number(next());
    else if (arg === "--idle") options.idle = next();
    else if (arg === "--image") options.image = next();
    else if (arg === "--cell-origin") options.cellOrigin = next();
    else if (arg === "-h" || arg === "--help") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error(`not a port: ${options.port}`);
  return options;
}

/** The container's name for a session; the session id is a UUID, and anything else is refused before it reaches Docker. */
const SESSION = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** What the starter sets itself; a cell's `env` may not override these. */
const RESERVED_ENV = new Set(["PEN_CELL_URL", "PEN_TOKEN", "PEN_HEALTH_PORT"]);

export function containerName(session) {
  return `pen-${session}`;
}

/** The address the container dials: the cell's URL, its origin replaced when --cell-origin says so. */
export function dialAddress(cellUrl, cellOrigin) {
  const url = new URL(cellUrl);
  if (cellOrigin === undefined) return url.toString();
  const origin = new URL(cellOrigin);
  url.protocol = origin.protocol;
  url.host = origin.host;
  return url.toString();
}

/** The `docker run` line for a session: detached, removed on exit, named, the agent's environment, no health port. */
export function runArgs({ session, cellUrl, token, env = {} }, options) {
  const args = ["run", "-d", "--rm", "--name", containerName(session)];
  args.push("-e", `PEN_CELL_URL=${dialAddress(cellUrl, options.cellOrigin)}`);
  args.push("-e", `PEN_TOKEN=${token}`);
  args.push("-e", "PEN_HEALTH_PORT=0");
  for (const [name, value] of Object.entries(env)) {
    if (!ENV_NAME.test(name) || RESERVED_ENV.has(name) || typeof value !== "string") continue;
    args.push("-e", `${name}=${value}`);
  }
  args.push(options.image);
  return args;
}

function docker(args, { log } = {}) {
  const binary = process.env.DOCKER || "docker";
  return new Promise((resolve) => {
    execFile(binary, args, { encoding: "utf8", maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      if (error) {
        log?.(`docker ${args[0]}: ${stderr.trim() || error.message}`);
        resolve({ ok: false, stdout, stderr: stderr.trim() || error.message });
      } else resolve({ ok: true, stdout, stderr });
    });
  });
}

/**
 * The starter over Docker. `timers` is all this process knows: the idle
 * timer per session it has started or renewed. Docker is the truth for
 * whether a container runs, so a container the shepherd killed is seen as
 * gone on the next ensure or renew, and one this process never started but
 * bears the name is renewed, not started twice.
 */
export function createStarter(options, log = () => {}) {
  const idleMs = parseDuration(options.idle, "10m") * 1000;
  const timers = new Map();

  const running = async (session) => {
    const result = await docker(["inspect", "--format", "{{.State.Running}}", containerName(session)]);
    return result.ok && result.stdout.trim() === "true";
  };

  const armIdle = (session) => {
    const existing = timers.get(session);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(async () => {
      timers.delete(session);
      log(`${session}: idle for ${options.idle}; stopping the container`);
      // SIGTERM; the agent closes its socket and exits. Docker's own SIGKILL follows after its default grace.
      await docker(["stop", containerName(session)], { log });
    }, idleMs);
    timer.unref?.();
    timers.set(session, timer);
  };

  const disarm = (session) => {
    const existing = timers.get(session);
    if (existing !== undefined) clearTimeout(existing);
    timers.delete(session);
  };

  return {
    async ensure(body) {
      if (await running(body.session)) {
        armIdle(body.session);
        log(`${body.session}: a container is running; renewed`);
        return { started: false };
      }
      const args = runArgs(body, options);
      const result = await docker(args, { log });
      if (!result.ok) {
        disarm(body.session);
        throw new Error(`docker run failed: ${result.stderr}`);
      }
      armIdle(body.session);
      log(`${body.session}: started ${containerName(body.session)} (${result.stdout.trim().slice(0, 12)}) from ${options.image}, dialing ${dialAddress(body.cellUrl, options.cellOrigin)}`);
      return { started: true };
    },
    async renew(body) {
      const up = await running(body.session);
      if (up) armIdle(body.session);
      else disarm(body.session);
      return { running: up };
    },
    async destroy(body) {
      disarm(body.session);
      const result = await docker(["kill", containerName(body.session)]);
      log(`${body.session}: destroy ${result.ok ? "killed the container" : `found none running (${result.stderr})`}`);
      return {};
    },
    /** For a clean exit: every idle timer cleared. Containers keep running; the cell's socket is their tether. */
    close() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let text = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      text += chunk;
      if (text.length > 1 << 16) reject(new Error("body too large"));
    });
    request.on("end", () => resolve(text));
    request.on("error", reject);
  });
}

/** One HTTP server over a starter. Resolves with the port once it listens. */
export function serve(starter, { port, host = "127.0.0.1", log = () => {} }) {
  const server = createServer(async (request, response) => {
    const answer = (status, body) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(`${JSON.stringify(body)}\n`);
    };
    const verb = request.url === "/ensure" ? "ensure" : request.url === "/renew" ? "renew" : request.url === "/destroy" ? "destroy" : undefined;
    if (request.method === "GET" && request.url === "/") return answer(200, { starter: "pen", verbs: ["ensure", "renew", "destroy"] });
    if (verb === undefined) return answer(404, { error: "not found; POST /ensure, /renew, or /destroy" });
    if (request.method !== "POST") return answer(405, { error: `POST /${verb}` });
    let body;
    try {
      body = JSON.parse((await readBody(request)) || "{}");
    } catch (error) {
      return answer(400, { error: `the body is not JSON: ${error.message}` });
    }
    if (typeof body !== "object" || body === null || typeof body.session !== "string" || !SESSION.test(body.session)) {
      return answer(400, { error: "session must be a string of letters, digits, dots, dashes, and underscores" });
    }
    if (verb === "ensure") {
      if (typeof body.cellUrl !== "string" || typeof body.token !== "string" || body.token === "") return answer(400, { error: "ensure needs cellUrl and token" });
      try {
        new URL(body.cellUrl);
      } catch {
        return answer(400, { error: `cellUrl is not a URL: ${body.cellUrl}` });
      }
      if (body.env !== undefined && (typeof body.env !== "object" || body.env === null)) return answer(400, { error: "env must be an object" });
    }
    try {
      return answer(200, await starter[verb](body));
    } catch (error) {
      log(`${body.session}: ${verb} failed: ${error.message}`);
      return answer(500, { error: error.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve({ port: server.address().port, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

const isMain = process.argv[1] !== undefined && new URL(import.meta.url).pathname === resolve(process.argv[1]);
if (isMain) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2), process.env);
  } catch (error) {
    process.stderr.write(`pen-starter: ${error.message}\n${USAGE}`);
    process.exit(2);
  }
  if (options.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const log = (line) => process.stdout.write(`[pen-starter] ${line}\n`);
  const starter = createStarter(options, log);
  const listening = await serve(starter, { port: options.port, log });
  log(
    `listening on http://127.0.0.1:${listening.port}; image ${options.image}, idle ${options.idle}` +
      (options.cellOrigin === undefined ? ", containers dial the cell's URL as given" : `, containers dial ${options.cellOrigin}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, async () => {
      log(`${signal}; exiting. Containers keep running until their cell's socket closes`);
      starter.close();
      await listening.close();
      process.exit(0);
    });
  }
}
