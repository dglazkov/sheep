/**
 * A wrangler for `test/deploy.test.ts`: run under node in the real one's
 * place through `SHEEP_TEST_WRANGLER`. It appends one JSON line per call
 * to `SHEEP_TEST_WRANGLER_LOG` (its arguments, its stdin, its working
 * directory, and what its environment held: `CI`, the metrics switch,
 * whether the token and the account were there, and whether the token was
 * in any argument), and plays the account's side of a call through the
 * fake account API's `_fake` routes: `deploy` reads the derived config it
 * was given and registers the Worker and the container application it
 * names; `delete` removes the Worker. `SHEEP_TEST_WRANGLER_FAIL=deploy`
 * makes the deploy exit 1 with wrangler's kind of message.
 */
import { appendFileSync, readFileSync } from "node:fs";

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
const config = flag("--config") ? JSON.parse(readFileSync(flag("--config"), "utf8")) : undefined;
if (args[0] === "deploy") {
  if (process.env.SHEEP_TEST_WRANGLER_FAIL === "deploy") {
    console.error("✘ [ERROR] A request to the Cloudflare API (/accounts/x/workers/scripts/y) failed.\n\n  the fake refused this deploy [code: 10000]");
    process.exit(1);
  }
  const pen = config.env.pen;
  await fetch(`${api}/_fake/deploy`, { method: "POST", body: JSON.stringify({ name: pen.name, container: pen.containers[0].name, image: pen.containers[0].image, vars: args.filter((arg, i) => args[i - 1] === "--var") }) });
  console.log(`Total Upload: 1234.56 KiB / gzip: 234.56 KiB\nUploaded ${pen.name} (2.34 sec)\nDeployed ${pen.name} triggers (1.23 sec)\n  https://${pen.name}.fake.workers.dev\nCurrent Version ID: 00000000-0000-0000-0000-000000000000`);
} else if (args[0] === "secret" && args[1] === "put") {
  console.log(`🌀 Creating the secret for the Worker "${config.env.pen.name}" \n✨ Success! Uploaded secret ${args[2]}`);
} else if (args[0] === "delete") {
  await fetch(`${api}/_fake/delete`, { method: "POST", body: JSON.stringify({ name: config.env.pen.name }) });
  console.log(`Successfully deleted ${config.env.pen.name}`);
} else {
  console.error(`fake wrangler: unknown command ${args.join(" ")}`);
  process.exit(1);
}
