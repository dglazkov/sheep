import puppeteer, { type Browser } from "@cloudflare/puppeteer";
import { look, type Look } from "./look.ts";

interface Env {
  BROWSER: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response("eyes\n");
    if (url.pathname === "/limits") return Response.json({ limits: await puppeteer.limits(env.BROWSER), sessions: await puppeteer.sessions(env.BROWSER) });
    const t0 = Date.now();
    // Session reuse: connect to an idle session when one exists, else launch with keep_alive.
    let browser: Browser;
    let reused = false;
    let launchMs = 0;
    if (url.searchParams.has("reuse")) {
      const sessions = await puppeteer.sessions(env.BROWSER);
      const free = sessions.find((s) => !s.connectionId);
      if (free) {
        browser = await puppeteer.connect(env.BROWSER, free.sessionId);
        reused = true;
      } else {
        browser = await puppeteer.launch(env.BROWSER, { keep_alive: 600_000 });
      }
    } else {
      browser = await puppeteer.launch(env.BROWSER);
    }
    launchMs = Date.now() - t0;
    try {
      const result = await look(browser, url.searchParams.get("path") ?? "/index.html", {
        click: url.searchParams.get("click") ?? undefined,
      });
      result.timings.launch = launchMs;
      result.timings.wall = Date.now() - t0;
      if (url.pathname === "/shot.png") return new Response(result.png, { headers: { "content-type": "image/png", "x-timings": JSON.stringify(result.timings) } });
      const body: Look = { ...result, reused, png: btoa(String.fromCharCode(...result.png)) };
      return Response.json(body);
    } finally {
      if (reused || url.searchParams.has("reuse")) browser.disconnect();
      else await browser.close();
    }
  },
};
