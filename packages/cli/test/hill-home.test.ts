/**
 * Hill phase 1, journey 4 steps 1 and 2 in the home ring: a real `wrangler
 * dev` home over the checkout's config, whose `HILL` binding serves the
 * page `scripts/test.mjs` built. `/hill/` and `/hill/anything` answer
 * `index.html` with the page's headers to a request with no seat and no
 * bearer; `/` is a 302 to `/hill/` for an `Accept` naming `text/html` and
 * `sheep\n` for `*\/*`, as every command has heard it; and `sheep hill`,
 * the built command, prints a link whose pass `fetch` takes for a 204 and a
 * cookie named for the home (`sheep-seat-` and 12 hex of its serverId's
 * sha256, another home's beside it ignored), and the cookie alone reads the
 * home and writes nothing. The
 * browser's half is the conductor's walk.
 *
 * Hill phase 2 adds the flock's two reads: with the cookie alone, `GET
 * /sessions` and `GET /home` answer what the bearer gets, and a sheep the
 * built command mints with `sheep new --detach` is in the next answer, at
 * the top, `idle`.
 *
 * Hill phase 3 adds a sheep's page's reads, with the cookie alone: a faux
 * turn's transcript read the page's way (`?wait=25000&tip=`, one request at
 * a time) during and after the turn, the ids in the order `sheep attach
 * --json` printed them; a turn the dog aborts, its transcript's blocks
 * printing exactly what `sheep log` prints; a write with the cookie refused;
 * and a removed sheep's transcript the 404 and its sentence.
 */
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { blocksOf, textOf } from "../src/blocks.js";
import type { SetupRecord, TranscriptView } from "../src/home.js";
import { runSheep, scriptFaux, startHome, stopHome, streamSheep } from "./local-home.js";

const TOKEN = "hill-home-token";

const home = await startHome(TOKEN);
// Written to stderr directly: the runner swallows console output while it collects tests.
if (typeof home === "string") process.stderr.write(`hill home skipped: ${home}\n`);

function url(): string {
  if (typeof home === "string") throw new Error(home);
  return home.url;
}

describe.skipIf(typeof home === "string")("hill phase 1: the page from a real wrangler dev", () => {
  afterAll(async () => {
    if (typeof home !== "string") await stopHome(home);
  });

  it("serves index.html at /hill/ and at any path under it, before the door, with the page's headers", { timeout: 60_000 }, async () => {
    const pages: string[] = [];
    for (const path of ["/hill/", "/hill/anything", "/hill/s/8c1f2a4e-3b9d-4f0a-9c2e-1d7b5e6a2f31"]) {
      const response = await fetch(`${url()}${path}`, { redirect: "manual" });
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toMatch(/^text\/html/);
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(response.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("content-security-policy"), path).toBe("default-src 'self'; frame-ancestors 'none'");
      const html = await response.text();
      expect(html, path).toContain('<script type="module" src="/hill/hill.js"></script>');
      pages.push(html);
    }
    expect(new Set(pages).size).toBe(1);
    // The files the page names are there, and none of its bytes carries a bearer or the word token.
    for (const file of ["/hill/hill.js", "/hill/hill.css", "/hill/mark.svg"]) {
      const response = await fetch(`${url()}${file}`);
      expect(response.status, file).toBe(200);
      expect(await response.text(), file).not.toMatch(/Bearer|token/);
    }
  });

  it("sends a browser at / to /hill/, and answers sheep to anything else", async () => {
    const browser = await fetch(`${url()}/`, { redirect: "manual", headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" } });
    expect(browser.status).toBe(302);
    expect(browser.headers.get("location")).toBe("/hill/");
    await browser.body?.cancel();
    const command = await fetch(`${url()}/`, { redirect: "manual", headers: { accept: "*/*" } });
    expect(command.status).toBe(200);
    expect(await command.text()).toBe("sheep\n");
  });

  it("sheep hill prints a link at this home that fetch takes for a seat, and the seat reads and does not write", { timeout: 60_000 }, async () => {
    if (typeof home === "string") throw new Error(home);
    const printed = await runSheep(home, ["hill"]);
    expect(printed.code, printed.stderr).toBe(0);
    expect(printed.stderr).toBe("");
    const link = /^(http:\/\/127\.0\.0\.1:\d+\/hill\/\?pass=([0-9a-f]{64}))\n$/.exec(printed.stdout);
    expect(link, printed.stdout).not.toBeNull();
    expect(link![1]!.startsWith(`${home.url}/hill/?pass=`)).toBe(true);

    // The link opens the page, as a browser's first request would, and the page's script takes the pass.
    const page = await fetch(link![1]!, { redirect: "manual" });
    expect(page.status).toBe(200);
    await page.body?.cancel();
    const taken = await fetch(`${home.url}/hill/seat?pass=${link![2]}`);
    expect(taken.status).toBe(204);
    const cookie = taken.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^sheep-seat-[0-9a-f]{12}=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=2592000$/);
    const seat = cookie.split(";")[0]!;

    // The cookie alone reads; a write with it is the bare 401; the same pass again is the gate's sentence.
    const read = await fetch(`${home.url}/home`, { headers: { cookie: seat } });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ build: { commit: "0.0.0-checkout" } });
    const write = await fetch(`${home.url}/sessions`, { method: "POST", headers: { cookie: seat, "content-type": "application/json" }, body: "{}" });
    expect(write.status).toBe(401);
    expect(await write.text()).toBe("bad or missing token");
    const again = await fetch(`${home.url}/hill/seat?pass=${link![2]}`);
    expect(again.status).toBe(403);
    expect(await again.text()).toBe("that pass was already used; run sheep hill for another");
  });

  it("the seat cookie is named for this home, and another home's on the same host is ignored beside it and refused alone", { timeout: 60_000 }, async () => {
    if (typeof home === "string") throw new Error(home);
    const standing = await seat();
    const { serverId } = (await (await fetch(`${home.url}/home`, { headers: { authorization: `Bearer ${home.token}` } })).json()) as { serverId: string };
    const name = `sheep-seat-${createHash("sha256").update(serverId).digest("hex").slice(0, 12)}`;
    expect(standing.startsWith(`${name}=`), standing).toBe(true);
    expect((await seat()).startsWith(`${name}=`)).toBe(true);
    const other = `sheep-seat-000000000000=${"c".repeat(64)}`;
    for (const cookie of [`${other}; ${standing}`, `${standing}; ${other}`]) {
      expect((await fetch(`${home.url}/sessions`, { headers: { cookie } })).status, cookie).toBe(200);
    }
    const alone = await fetch(`${home.url}/sessions`, { headers: { cookie: other } });
    expect(alone.status).toBe(401);
    expect(await alone.text()).toBe("bad or missing token");
  });

  it("the flock's two reads with the cookie alone answer what the bearer gets, and a sheep minted with sheep new --detach is in the next", { timeout: 60_000 }, async () => {
    if (typeof home === "string") throw new Error(home);
    const minted = await runSheep(home, ["hill"]);
    expect(minted.code, minted.stderr).toBe(0);
    const pass = /\?pass=([0-9a-f]{64})$/.exec(minted.stdout.trim())?.[1];
    expect(pass, minted.stdout).toBeDefined();
    const taken = await fetch(`${home.url}/hill/seat?pass=${pass}`);
    expect(taken.status).toBe(204);
    const seat = (taken.headers.get("set-cookie") ?? "").split(";")[0]!;
    const bearer = { authorization: `Bearer ${home.token}` };

    const both = async (path: string): Promise<{ cookie: unknown; bearer: unknown }> => {
      const bySeat = await fetch(`${home.url}${path}`, { headers: { cookie: seat } });
      const byBearer = await fetch(`${home.url}${path}`, { headers: bearer });
      expect(bySeat.status, `${path} with the cookie`).toBe(200);
      expect(byBearer.status, `${path} with the bearer`).toBe(200);
      return { cookie: await bySeat.json(), bearer: await byBearer.json() };
    };

    // A sheep before, so the flock is not empty and the order is something to keep.
    const first = await runSheep(home, ["new", "--detach", "--name", "first"]);
    expect(first.code, first.stderr).toBe(0);
    const firstId = first.stdout.trim();

    const before = await both("/sessions");
    expect(before.cookie).toEqual(before.bearer);
    const report = await both("/home");
    expect(report.cookie).toEqual(report.bearer);
    expect(report.cookie).toMatchObject({ container: expect.any(Boolean), eyes: expect.any(Boolean), containerMinutes: expect.any(Number) });

    const second = await runSheep(home, ["new", "--detach", "--name", "second"]);
    expect(second.code, second.stderr).toBe(0);
    const secondId = second.stdout.trim();
    expect(secondId).toMatch(/^[0-9a-f-]{36}$/);

    const after = await both("/sessions");
    expect(after.cookie).toEqual(after.bearer);
    const rows = after.cookie as { id: string; name: string | null; state: string }[];
    expect(rows[0]).toMatchObject({ id: secondId, name: "second", state: "idle" });
    expect(rows.findIndex((row) => row.id === firstId)).toBeGreaterThan(0);
    expect(rows.slice(1)).toEqual(before.cookie);
  });
  /** A seat for this home: `sheep hill`'s pass taken with `fetch`, the cookie as a request sends it. */
  async function seat(): Promise<string> {
    if (typeof home === "string") throw new Error(home);
    const printed = await runSheep(home, ["hill"]);
    expect(printed.code, printed.stderr).toBe(0);
    const pass = /\?pass=([0-9a-f]{64})$/.exec(printed.stdout.trim())?.[1];
    expect(pass, printed.stdout).toBeDefined();
    const taken = await fetch(`${home.url}/hill/seat?pass=${pass}`);
    expect(taken.status).toBe(204);
    return (taken.headers.get("set-cookie") ?? "").split(";")[0]!;
  }

  /** One transcript read the page's way, with the cookie alone. */
  async function transcript(cookie: string, id: string, tip: string | null): Promise<{ status: number; view?: TranscriptView & { operation: unknown }; text: string }> {
    const response = await fetch(`${url()}/s/${encodeURIComponent(id)}/transcript?wait=25000&tip=${encodeURIComponent(tip ?? "")}`, { headers: { cookie } });
    const text = await response.text();
    return response.status === 200 ? { status: 200, view: JSON.parse(text) as TranscriptView, text } : { status: response.status, text };
  }

  /** One JSON line with its keys sorted at every depth: the wire's entry and the stored one differ only in key order (bell). */
  function canonical(value: unknown): string {
    const sort = (held: unknown): unknown => {
      if (Array.isArray(held)) return held.map(sort);
      if (typeof held !== "object" || held === null) return held;
      return Object.fromEntries(Object.entries(held as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([key, inner]) => [key, sort(inner)]));
    };
    return JSON.stringify(sort(value));
  }

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  it("hill phase 3: a faux turn's transcript read with the cookie alone, during and after the turn, in attach --json's order", { timeout: 180_000 }, async () => {
    if (typeof home === "string") throw new Error(home);
    const cookie = await seat();
    const minted = await runSheep(home, ["new", "--detach", "--name", "watched"]);
    expect(minted.code, minted.stderr).toBe(0);
    const id = minted.stdout.trim();
    const REPLY_MS = 6_000;
    expect(await scriptFaux(home, `/s/${id}/faux`, { steps: [{ tool: { name: "bash", args: { command: "echo hill > note.txt && cat note.txt" } } }, { text: "the note is written", delayMs: REPLY_MS }] })).toBe(200);

    // The page's loop, beside the dog's held turn: one request open at a time, resting a quarter second when no turn is open.
    let turnEnded = false;
    const order: string[] = [];
    const readsDuringTurn: { entries: number; tool: boolean }[] = [];
    const statuses = new Set<number>();
    const reading = (async () => {
      let tip: string | null = null;
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const ended = turnEnded;
        const read = await transcript(cookie, id, tip);
        statuses.add(read.status);
        if (read.view === undefined) return;
        for (const entry of read.view.entries) if (!order.includes(entry.id)) order.push(entry.id);
        if (read.view.operation !== null) {
          const tool = read.view.entries.some((entry) => entry.type === "message" && entry.message.role === "assistant" && JSON.stringify(entry.message.content).includes('"toolCall"'));
          readsDuringTurn.push({ entries: read.view.entries.length, tool });
        }
        tip = read.view.tipId;
        if (ended && read.view.operation === null) return;
        if (read.view.operation === null) await sleep(250);
      }
    })();
    const held = await streamSheep(home, ["attach", id, "--json", "--", "write the note"]);
    turnEnded = true;
    await reading;
    expect(held.code, held.stderr).toBe(0);
    expect([...statuses]).toEqual([200]);

    // During: a read with the turn open already held the tool call, while the reply was still seconds away.
    expect(readsDuringTurn.some((read) => read.tool), JSON.stringify(readsDuringTurn)).toBe(true);
    // After: every entry the dog heard, in the order it heard them, and the page's copy is the log's.
    const streamed = held.lines.map((line) => JSON.parse(line.text) as { id: string });
    expect(order).toEqual(streamed.map((entry) => entry.id));
    const after = await transcript(cookie, id, null);
    expect(after.view!.operation).toBeNull();
    expect(after.view!.entries.map(canonical)).toEqual(streamed.map(canonical));
    const bearer = await fetch(`${home.url}/s/${id}/transcript`, { headers: { authorization: `Bearer ${home.token}` } });
    expect(canonical(((await bearer.json()) as TranscriptView).entries)).toBe(canonical(after.view!.entries));
  });

  it("hill phase 3: an aborted turn's blocks print what sheep log prints; the cookie cannot abort; a removed sheep is the 404", { timeout: 180_000 }, async () => {
    if (typeof home === "string") throw new Error(home);
    const cookie = await seat();
    const minted = await runSheep(home, ["new", "--detach", "--name", "aborted"]);
    expect(minted.code, minted.stderr).toBe(0);
    const id = minted.stdout.trim();
    expect(await scriptFaux(home, `/s/${id}/faux`, { steps: [{ tool: { name: "bash", args: { command: "echo before the abort" } } }, { text: "never said", delayMs: 90_000 }] })).toBe(200);
    expect(await runSheep(home, ["attach", id, "--detach", "--", "run until aborted"])).toEqual({ code: 0, stdout: `${id}\n`, stderr: "" });

    // The turn is open, as the cookie reads it.
    let open = false;
    for (const deadline = Date.now() + 60_000; Date.now() < deadline && !open; ) {
      const read = await transcript(cookie, id, null);
      open = read.view?.operation !== null && read.view?.entries.some((entry) => entry.type === "message" && entry.message.role === "toolResult") === true;
      if (!open) await sleep(250);
    }
    expect(open).toBe(true);

    // The seat reads and never writes: an abort with the cookie alone is the bare 401, and the turn is still open.
    const refused = await fetch(`${home.url}/s/${id}/abort`, { method: "POST", headers: { cookie } });
    expect(refused.status).toBe(401);
    expect(await refused.text()).toBe("bad or missing token");
    expect((await transcript(cookie, id, null)).view?.operation).not.toBeNull();

    const aborted = await runSheep(home, ["abort", id]);
    expect(aborted.code, aborted.stderr).toBe(0);
    const view = (await transcript(cookie, id, null)).view!;
    expect(view.operation).toBeNull();
    const last = view.entries.at(-1)!;
    // An abort in pi's entries: the model call it cut off ends as an assistant entry with no content, `stopReason:
    // "aborted"`, and pi's `errorMessage`, which sheep log prints as the block's `[error]` line and the page as the abort.
    expect(last).toMatchObject({ type: "message", message: { role: "assistant", content: [], stopReason: "aborted", errorMessage: "Request was aborted" } });
    const blocks = blocksOf(view.entries, (view.setups ?? []) as SetupRecord[], null, Date.now());
    const reply = blocks.at(-1)!;
    expect(reply.kind).toBe("reply");
    expect(reply.kind === "reply" && reply.error !== null && reply.aborted).toBe(true);
    const logged = await runSheep(home, ["log", id]);
    expect(logged.code, logged.stderr).toBe(0);
    expect(textOf(blocks)).toBe(logged.stdout);

    const removed = await runSheep(home, ["rm", id]);
    expect(removed).toEqual({ code: 0, stdout: `${id}\tended\n`, stderr: "" });
    const gone = await transcript(cookie, id, null);
    expect(gone.status).toBe(404);
    expect(gone.text).toBe(`no session ${id} at this home; \`sheep ls\` lists the ones there are`);
  });
});
