#!/usr/bin/env node
// The git credential helper in the image: `credential.helper = pen`, so git
// spawns `git-credential-pen <action>` with its request on stdin. `get`
// asks the agent over its Unix socket (PEN_HELPER_SOCKET, default
// /tmp/pen-agent.sock) and prints what comes back for git; `store` and
// `erase` do nothing, so nothing is ever kept. Plain node, no dependencies:
// the image and a test on a laptop run this same file. Nothing here writes
// to disk, and the answer goes to git's stdin pipe and nowhere else.
import { connect } from "node:net";

const SOCKET = process.env.PEN_HELPER_SOCKET || "/tmp/pen-agent.sock";
/** Longer than the agent's own wait for the cell, so the agent's `{}` arrives first. */
const TIMEOUT_MS = 15_000;

function readStdin() {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
    });
    process.stdin.on("end", () => resolve(text));
    process.stdin.on("error", () => resolve(text));
  });
}

/** git's `key=value` lines up to the blank line. */
function parse(text) {
  const fields = {};
  for (const line of text.split("\n")) {
    if (line === "") break;
    const equals = line.indexOf("=");
    if (equals < 0) continue;
    fields[line.slice(0, equals)] = line.slice(equals + 1);
  }
  return fields;
}

function ask(request) {
  return new Promise((resolve) => {
    let done = false;
    let buffered = "";
    const finish = (answer) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(answer);
    };
    const timer = setTimeout(() => {
      process.stderr.write("git-credential-pen: no answer from the agent\n");
      finish({});
    }, TIMEOUT_MS);
    const socket = connect(SOCKET);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => {
      buffered += chunk;
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      try {
        finish(JSON.parse(buffered.slice(0, newline)));
      } catch {
        finish({});
      }
    });
    socket.on("error", (error) => {
      process.stderr.write(`git-credential-pen: ${error.message}\n`);
      finish({});
    });
    socket.on("close", () => finish({}));
  });
}

const action = process.argv[2];
if (action !== "get") {
  // `store` and `erase`: git offers the value; nothing keeps it.
  process.exit(0);
}
const fields = parse(await readStdin());
if (!fields.host || !fields.protocol) process.exit(0);
const request = { kind: "git", protocol: fields.protocol, host: fields.host };
if (fields.path) request.path = fields.path;
const answer = await ask(request);
if (typeof answer.value === "string") {
  process.stdout.write(`username=${answer.username ?? "x-access-token"}\npassword=${answer.value}\n`);
}
