/**
 * The collie's fakes (collie phase 1): an isocan home and a station, each a
 * `handle(request, signal)` over web `Request` and `Response` and nothing
 * else, so the same file serves the workerd suite (through `installFetch`,
 * which puts both in place of the global `fetch` the object calls) and the
 * rig walked by hand (a Node server in front of `handle`).
 *
 * Both are scripted per case and both can fail: the isocan home refuses a
 * spent, expired, or unknown pass in isocan's own sentences, refuses a park
 * or a hold for an actor the badge does not hold, answers 401 to a request
 * with no badge (so the door is knocked on), and refuses connections while
 * `down`; the station answers 401 without its token, sends its build header
 * (an old one, when told), lacks the row route when told, and holds a turn
 * open until the case ends it when `turn` is `"hold"`.
 */

export interface Actor {
  id: string;
  name: string;
}

export interface Handler {
  readonly origin: string;
  handle(request: Request, signal?: AbortSignal): Promise<Response>;
  /** Refuses every connection, as a home that is not there. */
  down: boolean;
}

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });

/** Puts the fakes in place of the global `fetch`, by origin; returns what puts the original back. */
export function installFetch(...handlers: Handler[]): () => void {
  const original = globalThis.fetch;
  const byOrigin = Object.fromEntries(handlers.map((handler) => [handler.origin, handler]));
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request && init === undefined ? input : new Request(input, init);
    const origin = new URL(request.url).origin;
    const handler = byOrigin[origin];
    if (handler === undefined) throw new TypeError(`fetch failed: nothing answers at ${origin}`);
    if (handler.down) throw new TypeError("fetch failed");
    return handler.handle(request, init?.signal ?? undefined);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Resolves when `ready()` holds, `ms` pass, or `signal` aborts (reported as `"aborted"`). It polls rather than being woken:
 * in workerd a promise resolved from another request's context (a case appending to the log) would continue in that
 * context, and the object's I/O refuses to be done on behalf of it.
 */
function waitFor(ms: number, ready: () => boolean, signal?: AbortSignal): Promise<"ready" | "time" | "aborted"> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve("aborted");
    const deadline = Date.now() + ms;
    let done = false;
    const finish = (how: "ready" | "time" | "aborted") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(how);
    };
    const onAbort = () => finish("aborted");
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (ready()) return finish("ready");
      if (Date.now() >= deadline) return finish("time");
      timer = setTimeout(tick, 15);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    tick();
  });
}

interface LogEntry {
  seq: number;
  envelope: { actor: Actor; op: Record<string, unknown> & { type: string }; ts: string };
}

interface PassRow {
  id: string;
  secret: string;
  canvasId: string;
  mintedBy: string;
  actorId?: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt?: string;
  redeemedBy?: string;
}

/** An isocan home with one canvas: its log, roster and threads, the badges, the passes, the parks, the presence, the holds. */
export class FakeIsocan implements Handler {
  readonly origin: string;
  readonly canvas: { id: string; title: string };
  readonly owner: Actor;
  down = false;
  log: LogEntry[] = [];
  agents: Record<string, { actor: Actor; writtenBy: Actor }> = {};
  threads: Record<string, { id: string; createdBy: Actor; comments: { id: string; body: string; author: Actor }[] }> = {};
  badges = new Map<string, { secret: string; holds: Set<string>; killed: boolean }>();
  /** Session key → actor, as the claims registry keeps them. */
  keys = new Map<string, Actor>();
  passes = new Map<string, PassRow>();
  parks = new Map<string, { parkId: string; cursor: number; delivered: number }>();
  presence = new Map<string, { actor: Actor; harness?: string; kind?: string; updates: Record<string, unknown>[] }>();
  ended: string[] = [];
  asks: { askId: string; name: string; from: Actor }[] = [];
  holdsStarted = 0;
  openHolds = 0;
  /** Every request, `METHOD /path`, in order. */
  calls: string[] = [];
  /** How long a hold or a log watch is held at most before it answers empty. */
  holdCapMs = 400;
  private next = 1;

  constructor(options: { origin: string; canvas: { id: string; title: string }; owner: Actor }) {
    this.origin = options.origin;
    this.canvas = options.canvas;
    this.owner = options.owner;
  }

  get tip(): number {
    return this.log.length;
  }

  /** A pass minted by the owner's own machine: for `actorId` (the owner by default), `expired` already. Returns its address. */
  issuePass(options: { actorId?: string; expired?: boolean } = {}): { address: string; token: string } {
    const id = `pass_${this.next++}`;
    const secret = `S${crypto.randomUUID().replace(/-/g, "")}`;
    const now = Date.now();
    this.passes.set(id, {
      id,
      secret,
      canvasId: this.canvas.id,
      mintedBy: "badge_laptop",
      actorId: options.actorId ?? this.owner.id,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(options.expired ? now - 60_000 : now + 15 * 60_000).toISOString(),
    });
    const token = `${id}.${secret}`;
    return { address: `${this.origin}/p/${this.canvas.id}#${token}`, token };
  }

  /** Spends a pass as another machine would have. */
  spend(token: string): void {
    const row = this.passes.get(token.split(".")[0]!);
    if (row) {
      row.redeemedAt = new Date().toISOString();
      row.redeemedBy = "badge_elsewhere";
    }
  }

  /** The tray's "add an agent": an ask the next hold carries. */
  ask(name: string, from: Actor = this.owner): void {
    this.asks.push({ askId: `ask_${this.next++}`, name, from });
  }

  /** A comment by `by` on a new thread, mentioning `about`. */
  mention(by: Actor, about: Actor, body: string): string {
    const threadId = `thr_${this.next++}`;
    this.append(by, { type: "thread.create", threadId, x: 0, y: 0, comment: { id: `cmt_${this.next++}`, body, mentions: [about.id] } });
    return threadId;
  }

  withdraw(agent: Actor, by: Actor = this.owner): void {
    delete this.agents[agent.id];
    this.append(by, { type: "agent.withdraw", actorId: agent.id });
  }

  /** The entry as `POST /api/oplog/watch` serves it, JSON and all: what a summons carries. */
  served(entry: LogEntry): unknown {
    return JSON.parse(JSON.stringify({ ...entry, canvasId: this.canvas.id, canvasTitle: this.canvas.title }));
  }

  append(actor: Actor, op: Record<string, unknown> & { type: string }): LogEntry {
    const entry: LogEntry = { seq: this.log.length + 1, envelope: { actor, op, ts: new Date().toISOString() } };
    this.log.push(entry);
    if (op.type === "agent.enroll") {
      const agent = op.agent as Actor;
      this.agents[agent.id] = { actor: agent, writtenBy: actor };
    }
    if (op.type === "thread.create" || op.type === "thread.reply") {
      const threadId = op.threadId as string;
      const comment = op.comment as { id: string; body: string };
      const thread = (this.threads[threadId] ??= { id: threadId, createdBy: actor, comments: [] });
      thread.comments.push({ id: comment.id, body: comment.body, author: actor });
    }
    return entry;
  }

  private badgeOf(request: Request): { id: string; holds: Set<string> } | undefined {
    const match = /^Bearer ([^.\s]+)\.(\S+)$/.exec(request.headers.get("authorization") ?? "");
    if (!match) return undefined;
    const badge = this.badges.get(match[1]!);
    if (!badge || badge.killed || badge.secret !== match[2]) return undefined;
    return { id: match[1]!, holds: badge.holds };
  }

  private notYourActor(actorId: string): Response {
    return json({ error: `this badge does not speak for ${actorId} — claim that actor first`, code: "not-your-actor" }, 400);
  }

  private snapshot(): unknown {
    return {
      project: { id: this.canvas.id, title: this.canvas.title },
      canvas: { agents: structuredClone(this.agents), threads: structuredClone(this.threads), items: {}, trash: [] },
      lastSeq: this.tip,
      colors: {},
      names: {},
    };
  }

  async handle(request: Request, signal?: AbortSignal): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    this.calls.push(`${method} ${path}`);
    const body = method === "GET" || method === "DELETE" ? {} : ((await request.json().catch(() => ({}))) as Record<string, any>);
    if (method === "POST" && path === "/api/door") {
      const id = `badge_${this.next++}`;
      const secret = `B${crypto.randomUUID().replace(/-/g, "")}`;
      this.badges.set(id, { secret, holds: new Set(), killed: false });
      return json({ badgeId: id, secret });
    }
    const badge = this.badgeOf(request);
    if (badge === undefined) return json({ error: "a badge is required — ask the door for one", code: "badge-required" }, 401);
    const canvasRoute = /^\/api\/projects\/([^/]+)(\/.*)?$/.exec(path);
    if (method === "POST" && path === "/api/passes/redeem") {
      const [passId, secret] = String(body.token ?? "").split(".");
      const row = passId ? this.passes.get(passId) : undefined;
      if (!row || row.secret !== secret) {
        return json({ error: "no such pass — check the address you were given, or ask for a fresh one (a pass is single-use and short-lived, so an old command will not do)", code: "unknown-pass" }, 404);
      }
      if (Date.parse(row.expiresAt) < Date.now()) {
        return json({ error: `this pass expired at ${row.expiresAt} — passes are good for 15 minutes. Ask the surface that minted it for another`, code: "pass-expired" }, 410);
      }
      if (row.redeemedAt) {
        return json({ error: `this pass was already redeemed at ${row.redeemedAt} — a pass is single-use, so the surface that used it is already enrolled. Mint another if you need a second one`, code: "pass-spent" }, 409);
      }
      row.redeemedAt = new Date().toISOString();
      row.redeemedBy = badge.id;
      let actor: Actor | undefined;
      if (row.actorId) {
        badge.holds.add(row.actorId);
        actor = row.actorId === this.owner.id ? this.owner : this.agents[row.actorId]?.actor;
      }
      return json({ canvasId: row.canvasId, ...(actor ? { actor } : {}) });
    }
    if (method === "POST" && path === "/api/ops") {
      const op = body.op as Record<string, any>;
      if (op?.type === "actor.claim") {
        const known = this.keys.get(op.sessionKey);
        if (op.as !== undefined) {
          if (known?.id !== op.as) return json({ error: "that name is somebody else's", code: "name-taken" }, 400);
          badge.holds.add(op.as);
          return json({ seq: 0, envelope: { actor: known, op, ts: new Date().toISOString() } });
        }
        const actor = known ?? { id: `act_${String(op.name).toLowerCase()}_${this.next++}`, name: String(op.name) };
        this.keys.set(op.sessionKey, actor);
        badge.holds.add(actor.id);
        return json({ seq: 0, envelope: { actor, op, ts: new Date().toISOString() } });
      }
      const actor = body.actor as Actor;
      if (!actor.id.startsWith("sys_") && !badge.holds.has(actor.id)) return this.notYourActor(actor.id);
      const entry = this.append(actor, op as LogEntry["envelope"]["op"]);
      return json({ seq: entry.seq, envelope: entry.envelope });
    }
    if (method === "GET" && path === "/api/actors") return json([]);
    if (method === "DELETE" && path.startsWith("/api/badges/")) {
      const id = decodeURIComponent(path.slice("/api/badges/".length));
      const target = this.badges.get(id);
      if (!target || target.killed) return json({ error: "not one of your surfaces", code: "unknown-badge" }, 404);
      target.killed = true;
      return json({ killed: { badgeId: id }, swept: { badges: [] } });
    }
    if (method === "POST" && path === "/api/oplog/watch") {
      if (!body.cursors) return json({ entries: [], cursors: { [this.canvas.id]: this.tip } });
      const from = Number(body.cursors[this.canvas.id] ?? 0);
      if (this.tip <= from) {
        const how = await waitFor(Math.min(Number(body.waitMs ?? 30_000), this.holdCapMs), () => this.tip > from, signal);
        if (how === "aborted") throw new DOMException("aborted", "AbortError");
      }
      const entries = this.log.filter((entry) => entry.seq > from).map((entry) => this.served(entry));
      return json({ entries, cursors: { [this.canvas.id]: this.tip } });
    }
    if (method === "POST" && path === "/api/park/claim") {
      if (!badge.holds.has(body.actorId)) return this.notYourActor(body.actorId);
      const existing = this.parks.get(body.actorId);
      const parkId = `park_${this.next++}`;
      if (existing) {
        const redeliverUpTo = existing.delivered > existing.cursor ? existing.delivered : null;
        this.parks.set(body.actorId, { ...existing, parkId });
        return json({ parkId, cursor: existing.cursor, redeliverUpTo });
      }
      const cursor = typeof body.seedAt === "number" ? body.seedAt : 0;
      this.parks.set(body.actorId, { parkId, cursor, delivered: cursor });
      return json({ parkId, cursor, redeliverUpTo: null });
    }
    if (method === "POST" && (path === "/api/park/delivered" || path === "/api/park/advance")) {
      const park = this.parks.get(body.actorId);
      if (!park || park.parkId !== body.parkId) return json({ error: "another park adopted this cursor", code: "park-adopted" }, 409);
      if (path === "/api/park/delivered") park.delivered = Math.max(park.delivered, Number(body.tip));
      else park.cursor = Math.max(park.cursor, Number(body.to));
      return json({ ok: true });
    }
    if (method === "POST" && path === "/api/rc/hold") {
      for (const actorId of body.actorIds as string[]) if (!badge.holds.has(actorId)) return this.notYourActor(actorId);
      this.holdsStarted++;
      this.openHolds++;
      try {
        if (this.asks.length === 0) {
          const how = await waitFor(Math.min(Number(body.waitMs ?? 10_000), this.holdCapMs), () => this.asks.length > 0, signal);
          if (how === "aborted") throw new DOMException("aborted", "AbortError");
        }
        return json({ ok: true, asks: this.asks.splice(0) });
      } finally {
        this.openHolds--;
      }
    }
    if (canvasRoute) {
      const canvasId = decodeURIComponent(canvasRoute[1]!);
      const rest = canvasRoute[2] ?? "";
      if (canvasId !== this.canvas.id) return json({ error: `no canvas ${canvasId}`, code: "unknown-canvas" }, 404);
      if (method === "GET" && rest === "/canvas") return json(this.snapshot());
      if (method === "GET" && rest === "/oplog") return json(this.log.filter((entry) => entry.seq > Number(url.searchParams.get("since") ?? 0)));
      if (method === "POST" && rest === "/passes") {
        if (body.actorId && !badge.holds.has(body.actorId)) return this.notYourActor(body.actorId);
        const id = `pass_${this.next++}`;
        const secret = `M${crypto.randomUUID().replace(/-/g, "")}`;
        const row: PassRow = { id, secret, canvasId, mintedBy: badge.id, ...(body.actorId ? { actorId: body.actorId } : {}), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
        this.passes.set(id, row);
        const { secret: _secret, ...pass } = row;
        return json({ pass, token: `${id}.${secret}` });
      }
      const passRead = /^\/passes\/([^/]+)$/.exec(rest);
      if (method === "GET" && passRead) {
        const row = this.passes.get(decodeURIComponent(passRead[1]!));
        if (!row || row.mintedBy !== badge.id) return json({ error: "no such pass", code: "unknown-pass" }, 404);
        const { secret: _secret, ...pass } = row;
        return json({ pass });
      }
      if (method === "POST" && rest === "/sessions") {
        const sessionId = `ses_${this.next++}`;
        this.presence.set(sessionId, { actor: body.actor, ...(body.harness ? { harness: body.harness } : {}), ...(body.kind ? { kind: body.kind } : {}), updates: [] });
        return json({ sessionId, ttlMs: 300_000 });
      }
      const session = /^\/sessions\/([^/]+)$/.exec(rest);
      if (session) {
        const sessionId = decodeURIComponent(session[1]!);
        const held = this.presence.get(sessionId);
        if (method === "PUT") {
          if (!held) return json({ error: "no such session", code: "unknown-session" }, 404);
          held.updates.push(body);
          return json({ ok: true });
        }
        if (method === "DELETE") {
          this.presence.delete(sessionId);
          this.ended.push(sessionId);
          return json({ ok: true });
        }
      }
    }
    return json({ error: `the fake isocan has no route ${method} ${path}`, code: "no-route" }, 404);
  }
}

interface Entry {
  id: string;
  parentId: string | null;
  timestamp: number;
  type: "message";
  message: { role: "user" | "assistant"; content: unknown[]; stopReason?: string; errorMessage?: string };
}

interface Cell {
  entries: Entry[];
  operation: { id: string; kind: string; startedAt: number } | null;
  queued: Entry[];
}

interface StationRow {
  id: string;
  name: string | null;
  createdAt: number;
  state: "idle" | "running" | "waiting";
  pasture: string | null;
  task: string | null;
  secrets: string[];
  setup: { state: string; at: number; ms?: number } | null;
}

/** A station: the directory's rows, the pastures with their trees and secrets, and one cell per sheep with a transcript. */
export class FakeStation implements Handler {
  readonly origin: string;
  readonly token: string;
  down = false;
  /** The `x-sheep-build` every answer carries; null sends none, as a station from before shear. */
  build: string | null = "f00d001 2026-09-14T00:00:00Z";
  /** A station from before bleat: `GET /sessions/<id>` is its router's bare 404. */
  lacksRowRoute = false;
  /** `"auto"`: a turn calls one tool and replies at once; `"hold"`: the turn runs until `endTurn`. */
  turn: "auto" | "hold" = "auto";
  /** A setup runs in the sheep's container for the length of its first turn, as a birth's does (bleat's row). */
  setupOnFirstTurn = false;
  /** The tool call and the reply an automatic turn makes. */
  reply = { tool: { name: "bash", arguments: { command: 'isocan comment reply thr "on it"' } }, text: "Replied on the thread." };
  rows = new Map<string, StationRow>();
  /** Each sheep's secrets with their values, as the test reads them; the station's routes never answer a value. */
  secretValues = new Map<string, Record<string, string>>();
  pastures = new Map<string, { createdAt: number; files: Map<string, string>; secrets: Map<string, string> }>();
  cells = new Map<string, Cell>();
  prompts: { id: string; text: string }[] = [];
  requests: string[] = [];
  private next = 1;

  constructor(options: { origin: string; token: string }) {
    this.origin = options.origin;
    this.token = options.token;
  }

  private entry(role: "user" | "assistant", content: unknown[], cell: Cell, extra: Partial<Entry["message"]> = {}): Entry {
    return { id: `e${this.next++}`, parentId: cell.entries.at(-1)?.id ?? null, timestamp: Date.now(), type: "message", message: { role, content, ...extra } };
  }

  private push(id: string, entry: Entry): void {
    this.cells.get(id)!.entries.push(entry);
  }

  /** The running turn's tool call and reply, and its end; a queued prompt is taken up after. */
  endTurn(id: string, options: { stopReason?: string; errorMessage?: string } = {}): void {
    const cell = this.cells.get(id);
    if (!cell || cell.operation === null) return;
    this.push(id, this.entry("assistant", [{ type: "toolCall", id: `call${this.next++}`, name: this.reply.tool.name, arguments: this.reply.tool.arguments }], cell, { stopReason: "toolUse" }));
    this.push(id, this.entry("assistant", [{ type: "text", text: this.reply.text }], cell, { stopReason: options.stopReason ?? "stop", ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}) }));
    const queued = cell.queued.shift();
    if (queued) {
      this.push(id, queued);
      if (this.turn === "auto") setTimeout(() => this.endTurn(id), 20);
      return;
    }
    cell.operation = null;
    const row = this.rows.get(id)!;
    row.state = "idle";
    if (row.setup?.state === "running") row.setup = { state: "ok", at: row.setup.at, ms: Date.now() - row.setup.at };
  }

  /** Whether a turn is running in the sheep's cell. */
  running(id: string): boolean {
    return this.cells.get(id)?.operation != null;
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    this.requests.push(`${method} ${path}`);
    const headers: Record<string, string> = this.build === null ? {} : { "x-sheep-build": this.build };
    const text = (body: string, status: number) => new Response(body, { status, headers });
    const answer = (value: unknown, status = 200) => json(value, status, headers);
    if (request.headers.get("authorization") !== `Bearer ${this.token}`) return text("unauthorized", 401);
    const unknown = (id: string) => text(`no session ${id} at this home; \`sheep ls\` lists the ones there are`, 404);
    if (method === "GET" && path === "/sessions") return answer([...this.rows.values()]);
    if (method === "POST" && path === "/sessions") {
      const body = (await request.json()) as { name?: string; pasture?: string; secrets?: Record<string, string> };
      const id = `sheep-${String(this.next++).padStart(4, "0")}`;
      const row: StationRow = { id, name: body.name ?? null, createdAt: Date.now(), state: "idle", pasture: body.pasture ?? null, task: null, secrets: Object.keys(body.secrets ?? {}).sort(), setup: null };
      this.rows.set(id, row);
      this.secretValues.set(id, { ...(body.secrets ?? {}) });
      this.cells.set(id, { entries: [], operation: null, queued: [] });
      return answer(row, 201);
    }
    const one = /^\/sessions\/([^/]+)$/.exec(path);
    if (method === "GET" && one) {
      if (this.lacksRowRoute) return text("not found", 404);
      const row = this.rows.get(decodeURIComponent(one[1]!));
      return row ? answer(row) : unknown(decodeURIComponent(one[1]!));
    }
    if (method === "GET" && path === "/pastures") return answer([...this.pastures.entries()].map(([name, pasture]) => ({ name, createdAt: pasture.createdAt })));
    if (method === "POST" && path === "/pastures") {
      const body = (await request.json()) as { name: string };
      if (this.pastures.has(body.name)) return text(`a pasture named ${body.name} is already at this home`, 409);
      this.pastures.set(body.name, { createdAt: Date.now(), files: new Map(), secrets: new Map() });
      return answer({ name: body.name, repo: null, branch: "main", createdAt: Date.now() }, 201);
    }
    const grazing = /^\/p\/([^/]+)\/(tree|secrets)\/(.+)$/.exec(path);
    if (grazing && method === "PUT") {
      const pasture = this.pastures.get(decodeURIComponent(grazing[1]!));
      if (!pasture) return text(`no pasture ${grazing[1]} at this home`, 404);
      const key = grazing[3]!.split("/").map(decodeURIComponent).join("/");
      if (grazing[2] === "tree") {
        pasture.files.set(key, await request.text());
        return answer({ path: key, kind: "file", mode: 0o644, hash: null });
      }
      pasture.secrets.set(key, await request.text());
      return new Response(null, { status: 204, headers });
    }
    const cellRoute = /^\/s\/([^/]+)(\/[a-z]*)?$/.exec(path);
    if (cellRoute) {
      const id = decodeURIComponent(cellRoute[1]!);
      const cell = this.cells.get(id);
      const row = this.rows.get(id);
      if (!cell || !row) return unknown(id);
      const rest = cellRoute[2] ?? "";
      if (method === "GET" && rest === "/transcript") {
        const since = url.searchParams.get("tip");
        const wait = Math.min(Number(url.searchParams.get("wait") ?? "0"), 25_000);
        const view = () => ({ id, tipId: cell.entries.at(-1)?.id ?? null, operation: cell.operation, entries: cell.entries });
        if (view().tipId === since && cell.operation !== null && wait > 0) await waitFor(wait, () => view().tipId !== since || cell.operation === null || this.down);
        // A station that went down while a long poll was held cuts it, as a restart closes the socket.
        if (this.down) throw new TypeError("fetch failed");
        return answer(JSON.parse(JSON.stringify(view())));
      }
      if (method === "POST" && rest === "/prompt") {
        const body = (await request.json()) as { text: string };
        this.prompts.push({ id, text: body.text });
        const entry = this.entry("user", [{ type: "text", text: body.text }], cell);
        if (cell.operation !== null) {
          cell.queued.push(entry);
          return answer({ accepted: true, entryId: entry.id, error: null });
        }
        cell.operation = { id: `op${this.next++}`, kind: "prompt", startedAt: Date.now() };
        if (this.setupOnFirstTurn && row.setup === null) row.setup = { state: "running", at: Date.now() };
        row.state = "running";
        row.task ??= body.text.split("\n")[0]!;
        this.push(id, entry);
        if (this.turn === "auto") setTimeout(() => this.endTurn(id), 20);
        return answer({ accepted: true, operationId: cell.operation.id, error: null });
      }
      if (method === "POST" && rest === "/abort") {
        const aborted = cell.operation !== null;
        if (aborted) this.endTurn(id, { stopReason: "aborted" });
        return answer({ aborted });
      }
      if (method === "DELETE" && rest === "") {
        const aborted = cell.operation !== null;
        this.rows.delete(id);
        this.cells.delete(id);
        return answer({ ended: true, aborted });
      }
    }
    return text("not found", 404);
  }
}
