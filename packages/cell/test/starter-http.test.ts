/**
 * pen phase 6: the HTTP starter, the cell's side of a starter beside a
 * celld node, in workerd. The endpoint is a `fetch` the test injects into
 * the starter (workerd cannot listen, and the Worker has no route to play
 * a starter): it receives exactly the request the starter built, records
 * the verb and the body, and answers as `pen-starter` does. On `ensure` it
 * dials the cell's real door with the minted token and serves the fake on
 * what comes back, the way the image's agent would, so everything past the
 * starter is the real thing: the lease, the door, the socket, and the
 * Directory's minutes, which this lease reports itself, since the starter
 * is a program that knows nothing of the Directory. The starter program's
 * own side, what each call does to Docker, is proved in Node in
 * `packages/pen/test/starter.test.ts`.
 */
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SessionCell } from "../src/cell.ts";
import { authorEnv } from "../src/pen/container.ts";
import { HttpStarter, httpStarterFor } from "../src/pen/starter-http.ts";
import { type FakeContainer, serveFakeOn } from "./fake-container.ts";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await sleep(20);
  }
}

interface Call {
  method: string;
  url: string;
  contentType: string | null;
  body: Record<string, unknown>;
}

interface Fake {
  fake: Omit<FakeContainer, "socket">;
  stopped: boolean;
}

interface Endpoint {
  calls: Call[];
  fakes: Fake[];
  dials: number[];
  fetch: typeof fetch;
}

interface EndpointOptions {
  /** Answer `ensure` with this status and body instead of starting. */
  refuse?: { status: number; body: string };
  /** Never answer; reject when the starter gives up. */
  hang?: boolean;
  /** Throw, as a fetch to nothing listening does. */
  unreachable?: boolean;
}

/** The starter's endpoint as an injected `fetch`: records what the starter sent, answers as `pen-starter` would, dials the door on `ensure`. */
function endpoint(options: EndpointOptions = {}): Endpoint {
  const point: Endpoint = {
    calls: [],
    fakes: [],
    dials: [],
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (options.unreachable) throw new TypeError("connect ECONNREFUSED 127.0.0.1:9877");
      if (options.hang) {
        return new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted", "AbortError")));
        });
      }
      const body = (await request.json()) as Record<string, unknown>;
      const verb = new URL(request.url).pathname.slice(1);
      point.calls.push({ method: request.method, url: request.url, contentType: request.headers.get("content-type"), body });
      if (verb === "ensure") {
        if (options.refuse !== undefined) return new Response(options.refuse.body, { status: options.refuse.status });
        void (async () => {
          await sleep(10);
          const response = await SELF.fetch(`${body.cellUrl as string}?token=${encodeURIComponent(body.token as string)}`, { headers: { upgrade: "websocket" } });
          point.dials.push(response.status);
          if (response.status !== 101) return;
          const socket = response.webSocket!;
          socket.accept();
          const entry: Fake = { fake: serveFakeOn(socket, {}), stopped: false };
          void entry.fake.closed.then(() => {
            entry.stopped = true;
          });
          point.fakes.push(entry);
        })();
        return Response.json({ started: true });
      }
      if (verb === "renew") return Response.json({ running: point.fakes.some((fake) => !fake.stopped) });
      if (verb === "destroy") {
        point.fakes.at(-1)?.fake.stop("destroyed");
        return Response.json({});
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch,
  };
  return point;
}

/** A session whose cell rents through an `HttpStarter` over the endpoint. Set before the cell's first boot, so `leaseFor()` sees the starter's kind. */
async function sessionWith(name: string, options: EndpointOptions = {}, timeoutMs?: number): Promise<{ id: string; point: Endpoint }> {
  const { id } = await env.DIRECTORY.getByName("home").create(name);
  const point = endpoint(options);
  await runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => {
    cell.test.starter = new HttpStarter({
      url: "http://starter.test/",
      sessionId: id,
      env: authorEnv(env),
      fetch: point.fetch,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  });
  return { id, point };
}

function inCell<T>(id: string, body: (cell: SessionCell) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(id), (cell: SessionCell) => body(cell));
}

/** How many containers the Directory counts as running now: a minute later, each adds one minute. */
async function runningNow(): Promise<number> {
  const directory = env.DIRECTORY.getByName("home");
  const at = Date.now();
  return Math.round((await directory.containerMinutes(at + 60_000)) - (await directory.containerMinutes(at)));
}

describe("the HTTP starter", () => {
  it("is chosen by PEN_STARTER_URL and carries the author; unset, there is none", () => {
    expect(httpStarterFor({}, "s")).toBeUndefined();
    expect(httpStarterFor({ PEN_STARTER_URL: "  " }, "s")).toBeUndefined();
    const starter = httpStarterFor({ PEN_STARTER_URL: "http://127.0.0.1:9877/", PEN_GIT_AUTHOR_NAME: "Pen Home", PEN_GIT_AUTHOR_EMAIL: "pen@example.invalid" }, "s");
    expect(starter).toBeInstanceOf(HttpStarter);
    expect(starter!.url).toBe("http://127.0.0.1:9877");
  });

  it("ensure, renew, and destroy are three POSTs with JSON bodies; the lease reports the minutes from the socket's open and close", async () => {
    const { id, point } = await sessionWith("three");
    expect(await runningNow()).toBe(0);
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      const lease = runtime.lease!;
      expect(runtime.env.home).toEqual({ container: true, isolate: true, containerUp: false });

      const socket = await lease.rent();
      expect(socket).toBe(lease.socket);
      expect(point.calls.length).toBe(1);
      const ensure = point.calls[0]!;
      expect(ensure.method).toBe("POST");
      expect(ensure.url).toBe("http://starter.test/ensure");
      expect(ensure.contentType).toBe("application/json");
      expect(ensure.body).toEqual({
        session: id,
        cellUrl: `https://lamb.test/s/${id}/pen`,
        token: expect.stringMatching(/^[0-9a-f-]{36}$/),
        env: { GIT_AUTHOR_NAME: "Pen Home", GIT_AUTHOR_EMAIL: "pen@example.invalid", GIT_COMMITTER_NAME: "Pen Home", GIT_COMMITTER_EMAIL: "pen@example.invalid" },
      });
      await until(() => point.dials.length === 1);
      expect(point.dials).toEqual([101]);
      // The lease reported the start when the socket opened: one container running for this home.
      await until(async () => (await runningNow()) === 1);

      // A second rent: the same socket, and a renew, `{ session }` and nothing else.
      expect(await lease.rent()).toBe(socket);
      await until(() => point.calls.some((call) => call.url === "http://starter.test/renew"));
      expect(point.calls.find((call) => call.url === "http://starter.test/renew")!.body).toEqual({ session: id });
      expect(point.calls.filter((call) => call.url === "http://starter.test/ensure").length).toBe(1);
      lease.idle();

      // The container stops on its own: the socket closes, and the lease reports the stop.
      const minutesBefore = await env.DIRECTORY.getByName("home").containerMinutes();
      point.fakes[0]!.fake.stop("stopped as idle");
      await until(() => lease.socket === undefined);
      await until(async () => (await runningNow()) === 0);
      expect(await env.DIRECTORY.getByName("home").containerMinutes()).toBeGreaterThanOrEqual(minutesBefore - 0.001);

      // A new rent starts anew with a new token; a discard is a destroy, and the stop is reported too.
      await lease.rent();
      const ensures = point.calls.filter((call) => call.url === "http://starter.test/ensure");
      expect(ensures.length).toBe(2);
      expect(ensures[1]!.body.token).not.toBe(ensures[0]!.body.token);
      await until(async () => (await runningNow()) === 1);
      lease.discard("the test is done");
      await until(() => point.calls.some((call) => call.url === "http://starter.test/destroy"));
      expect(point.calls.find((call) => call.url === "http://starter.test/destroy")!.body).toEqual({ session: id });
      await until(async () => (await runningNow()) === 0);
      await until(() => point.fakes[1]!.stopped);
    });
  });

  it("a refused start is the lease's error, with the starter's status and words; nothing is reported", async () => {
    const { id, point } = await sessionWith("refused", { refuse: { status: 500, body: '{"error":"docker run failed: Unable to find image \'sheep-pen:dev\' locally"}' } });
    await inCell(id, async (cell) => {
      const runtime = await cell.runtime();
      await expect(runtime.lease!.rent()).rejects.toThrow(
        `the container could not be started: the starter at http://starter.test answered 500 to ensure: {"error":"docker run failed: Unable to find image 'sheep-pen:dev' locally"}`,
      );
      expect(point.calls.length).toBe(1);
      expect(point.dials).toEqual([]);
      expect(runtime.lease!.socket).toBeUndefined();
    });
    expect(await runningNow()).toBe(0);
  });

  it("a starter that does not answer fails the rent at the starter's timeout, and one that cannot be reached fails it at once", async () => {
    const hung = await sessionWith("hung", { hang: true }, 300);
    await inCell(hung.id, async (cell) => {
      const runtime = await cell.runtime();
      const started = Date.now();
      await expect(runtime.lease!.rent()).rejects.toThrow("the container could not be started: the starter at http://starter.test did not answer ensure within 0.3 s");
      expect(Date.now() - started).toBeGreaterThanOrEqual(250);
      expect(Date.now() - started).toBeLessThan(1_900);
    });
    const down = await sessionWith("down", { unreachable: true });
    await inCell(down.id, async (cell) => {
      const runtime = await cell.runtime();
      await expect(runtime.lease!.rent()).rejects.toThrow(
        "the container could not be started: the starter at http://starter.test could not be reached for ensure: connect ECONNREFUSED 127.0.0.1:9877",
      );
    });
  });
});
