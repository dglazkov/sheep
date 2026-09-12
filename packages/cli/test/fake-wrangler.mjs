/**
 * A wrangler for `test/deploy.test.ts`: run under node in the real one's
 * place through `SHEEP_TEST_WRANGLER`. It appends one JSON line per call
 * to `SHEEP_TEST_WRANGLER_LOG` (its arguments, its stdin, its working
 * directory, and what its environment held: `CI`, the metrics switch,
 * whether the token and the account were there, and whether the token was
 * in any argument), and plays the account's side of a call through the
 * fake account API's `_fake` routes: `deploy` reads the derived config it
 * was given and registers the Worker and the container application it
 * names, and the KV namespaces its `pen` environment binds (stile phase 2,
 * the join store); `secret put` registers the secret's name on the Worker, which is
 * what the account's secrets listing answers with (stile phase 0);
 * `delete` removes the Worker. `SHEEP_TEST_WRANGLER_FAIL=deploy`
 * makes the deploy exit 1 with wrangler's kind of message, and
 * `secret:<NAME>` does the same to that one secret put, which is a deploy
 * that failed after the Worker went live.
 *
 * Station phase 4: `dev` plays the local home's daemon for
 * `test/local.test.ts`: it listens on `--port` until SIGTERM, answering
 * `sheep` at the door, `[]` at `/sessions`, and at `/home` a `container`
 * that is true exactly when `--env pen` was among its arguments, which is
 * how the test reads which environment the CLI chose, and `eyes: true`
 * either way (eyes phase 2), as the real local home answers.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const token = process.env.CLOUDFLARE_API_TOKEN;
const api = process.env.SHEEP_TEST_ACCOUNT_API;
const stdin = await new Promise((resolve) => {
  let text = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (text += chunk));
  process.stdin.on("end", () => resolve(text));
  process.stdin.resume();
});
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
appendFileSync(
  process.env.SHEEP_TEST_WRANGLER_LOG,
  `${JSON.stringify({
    args,
    stdin,
    cwd: process.cwd(),
    env: { CI: process.env.CI, WRANGLER_SEND_METRICS: process.env.WRANGLER_SEND_METRICS, token: Boolean(token), account: process.env.CLOUDFLARE_ACCOUNT_ID ?? null, tokenInArgs: Boolean(token) && args.some((arg) => arg.includes(token)) },
  })}\n`,
);
// The derived config is JSON; the checkout's `wrangler.jsonc`, which `dev` gets, is not, and `dev` never reads it.
const config = flag("--config") && args[0] !== "dev" ? JSON.parse(readFileSync(flag("--config"), "utf8")) : undefined;
if (args[0] === "dev") {
  const container = args.some((arg, i) => arg === "--env" && args[i + 1] === "pen");
  const server = createServer((request, response) => {
    if (request.url === "/home") {
      response.setHeader("content-type", "application/json");
      // Eyes phase 2: the local home always has eyes, whichever environment the daemon runs; the fake says so as the real one does.
      return response.end(JSON.stringify({ serverId: "fake-dev", container, eyes: true, build: undefined, image: null }));
    }
    if (request.url === "/sessions") {
      response.setHeader("content-type", "application/json");
      return response.end("[]");
    }
    response.end("sheep\n");
  });
  server.listen(Number(flag("--port")), "127.0.0.1");
  process.on("SIGTERM", () => process.exit(0));
} else if (args[0] === "deploy") {
  if (process.env.SHEEP_TEST_WRANGLER_FAIL === "deploy") {
    console.error("✘ [ERROR] A request to the Cloudflare API (/accounts/x/workers/scripts/y) failed.\n\n  the fake refused this deploy [code: 10000]");
    process.exit(1);
  }
  // `deploy-once` (station phase 4): the first deploy of the run uploads and then fails wrangler's way after a rollout; the
  // second succeeds. The log, appended above, says which this is.
  const deploysBefore = readFileSync(process.env.SHEEP_TEST_WRANGLER_LOG, "utf8").trim().split("\n").filter((line) => line && JSON.parse(line).args[0] === "deploy").length;
  if (process.env.SHEEP_TEST_WRANGLER_FAIL === "deploy-once" && deploysBefore === 1) {
    console.log(`Total Upload: 1234.56 KiB / gzip: 234.56 KiB\nUploaded ${config.env.pen.name} (2.34 sec)`);
    console.error("✘ [ERROR] Could not deploy container application as durable object was not found in list of bindings");
    process.exit(1);
  }
  const pen = config.env.pen;
  await fetch(`${api}/_fake/deploy`, { method: "POST", body: JSON.stringify({ name: pen.name, container: pen.containers[0].name, image: pen.containers[0].image, vars: args.filter((arg, i) => args[i - 1] === "--var"), kv: pen.kv_namespaces ?? [] }) });
  console.log(`Total Upload: 1234.56 KiB / gzip: 234.56 KiB\nUploaded ${pen.name} (2.34 sec)\nDeployed ${pen.name} triggers (1.23 sec)\n  https://${pen.name}.fake.workers.dev\nCurrent Version ID: 00000000-0000-0000-0000-000000000000`);
} else if (args[0] === "secret" && args[1] === "put") {
  if (process.env.SHEEP_TEST_WRANGLER_FAIL === `secret:${args[2]}`) {
    console.error(`✘ [ERROR] A request to the Cloudflare API (/accounts/x/workers/scripts/${config.env.pen.name}/secrets) failed.\n\n  the fake refused this secret [code: 10000]`);
    process.exit(1);
  }
  // The account's side of a secret put (stile phase 0): the Worker's secret names are what `deploy` reads when no model key
  // is kept here, so the listing has to be what the puts actually made rather than a fixture.
  await fetch(`${api}/_fake/secret`, { method: "POST", body: JSON.stringify({ name: config.env.pen.name, secret: args[2] }) });
  console.log(`🌀 Creating the secret for the Worker "${config.env.pen.name}" \n✨ Success! Uploaded secret ${args[2]}`);
} else if (args[0] === "delete") {
  await fetch(`${api}/_fake/delete`, { method: "POST", body: JSON.stringify({ name: config.env.pen.name }) });
  console.log(`Successfully deleted ${config.env.pen.name}`);
} else {
  console.error(`fake wrangler: unknown command ${args.join(" ")}`);
  process.exit(1);
}
