import type { Browser } from "@cloudflare/puppeteer";
import { WORKSPACE } from "./workspace.ts";

interface Env {
  BROWSER: Fetcher;
}

/** The origin the sheep's workspace is mounted at inside the browser. Nothing serves it; interception does. */
export const ORIGIN = "http://sheep.invalid";

export interface Look {
  timings: Record<string, number>;
  console: string[];
  errors: string[];
  requests: string[];
  tree: unknown;
  png: string; // base64
  reused?: boolean;
}

/** Render `path` from the workspace in the given browser and report what the eyes saw. */
export async function look(browser: Browser, path: string, opts: { click?: string; width?: number; height?: number } = {}): Promise<Omit<Look, "png"> & { png: Uint8Array }> {
  const t: Record<string, number> = {};
  const started = Date.now();
  const page = await browser.newPage();
  t.newPage = Date.now() - started;
  await page.setViewport({ width: opts.width ?? 800, height: opts.height ?? 600 });
  const logs: string[] = [];
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("console", (message) => logs.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== ORIGIN) return void request.abort("blockedbyclient");
    const file = WORKSPACE[url.pathname];
    if (!file) return void request.respond({ status: 404, contentType: "text/plain", body: `not in the workspace: ${url.pathname}` });
    return void request.respond({ status: 200, contentType: file.type, body: file.body });
  });
  const t1 = Date.now();
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0", timeout: 15000 });
  t.goto = Date.now() - t1;
  if (opts.click) {
    await page.click(opts.click);
    await page.click(opts.click);
  }
  const t2 = Date.now();
  const png = await page.screenshot({ type: "png" });
  t.screenshot = Date.now() - t2;
  const t3 = Date.now();
  const tree = await page.accessibility.snapshot();
  t.tree = Date.now() - t3;
  await page.close();
  t.total = Date.now() - started;
  return { timings: t, console: logs, errors, requests, tree, png: png as Uint8Array };
}

