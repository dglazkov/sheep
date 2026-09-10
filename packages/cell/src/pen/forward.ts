/**
 * The cell's side of the forward: one request the browser made during a
 * look, carried to a server the container is running and answered back.
 * `fetch` out, `response` and its bytes in, one pair per request, all on
 * the socket the container already opened.
 *
 * The container is a client of the cell and stays one. The platform has a
 * port binding a Durable Object could fetch through, and the eyes design
 * named it, but the fake container the workerd suite runs against cannot
 * answer a port, so the proof would be the walk; and pen's rule that
 * nothing connects into the container is worth more than the line of code
 * it would save.
 *
 * A `Forward` is the third reader on the socket, after `Checkout` and
 * `ContainerRun`, and sees only its own frames. Many requests are in
 * flight at once, kept apart by id, because a page asks for its module
 * graph all at once and a page whose requests queue is a page that does
 * not render like the shepherd's. Frames that are not the forward's pass
 * by, and so do bytes that were not announced to it: `Checkout` is as
 * forgiving of the forward's, and the bug worth catching is not a stray
 * binary message but two announcers waiting for the same one, which is
 * what `BinaryGuard` throws on.
 */
import { type CellFrame, type ContainerFrame, decodeFrame, encodeFrame, messageBytes } from "@sheep/pen/protocol";

/** One request to forward: `url` is the path and query, the loopback address is the agent's to add. */
export interface ForwardRequest {
  /** The port the server listens on inside the container. */
  port: number;
  method: string;
  /** The path and query, as the browser asked for it. */
  url: string;
  headers: Record<string, string>;
  /** The request's body, when it has one. */
  body?: Uint8Array;
}

/** What the server answered, as the browser is to be given it. Status `0` is a fetch the container could not make. */
export interface ForwardResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** The container went away with requests still out. Every one of them is over; the look is not necessarily. */
export class ForwardInterrupted extends Error {
  readonly code: number;
  readonly reason: string;
  constructor(code: number, reason: string) {
    super(`the container went away during a look (${code}${reason ? `: ${reason}` : ""})`);
    this.name = "ForwardInterrupted";
    this.code = code;
    this.reason = reason;
  }
}

/** The container said something the forward does not allow. */
export class ForwardProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForwardProtocolError";
  }
}

/**
 * Whose the next binary message on a socket is. Bytes belong to the text
 * frame that announced them and to nothing else, so at most one
 * announcement may stand: a `blob` during a sync, a `response` during a
 * look. A sync and a look never overlap — the look is a run, and a sync
 * happens before and after one — so a second announcer is not a race to
 * be sorted out but a lane that has been crossed, and the reader that
 * finds it says so rather than taking bytes that may be someone else's.
 */
export class BinaryGuard {
  private announcer: string | null = null;

  /** Registers that `who`'s bytes are next. Throws when someone else is already waiting for a binary message. */
  announce(who: string): void {
    if (this.announcer !== null) {
      throw new ForwardProtocolError(`${who} announced a binary message while ${this.announcer} is still waiting for one`);
    }
    this.announcer = who;
  }

  /** The bytes arrived, or the reader gave up on them. Quiet when nothing was announced. */
  release(): void {
    this.announcer = null;
  }
}

/**
 * The one guard for a socket. `Checkout` and `Forward` are built apart and
 * never see each other, so the socket they share is what they are keyed
 * on; a socket that is gone takes its guard with it.
 */
const guards = new WeakMap<WebSocket, BinaryGuard>();

export function binaryGuard(socket: WebSocket): BinaryGuard {
  const found = guards.get(socket);
  if (found !== undefined) return found;
  const fresh = new BinaryGuard();
  guards.set(socket, fresh);
  return fresh;
}

export interface ForwardOptions {
  /** Ids for the `fetch` frames; deterministic by default so transcripts compare. */
  nextId?: () => string;
}

/** One request out, waiting on its `response`. */
interface Pending {
  resolve: (response: ForwardResponse) => void;
  reject: (error: Error) => void;
  frame: Extract<ContainerFrame, { type: "response" }> | null;
}

export class Forward {
  private readonly socket: WebSocket;
  private readonly guard: BinaryGuard;
  private readonly nextId: () => string;
  private readonly pending = new Map<string, Pending>();
  /** The `response` whose bytes are next, by id; `null` for bytes nobody is waiting for, which are read and dropped. */
  private expecting: { id: string | null; size: number } | null = null;
  private interrupted: ForwardInterrupted | null = null;
  private tail = Promise.resolve();

  constructor(socket: WebSocket, options: ForwardOptions = {}) {
    this.socket = socket;
    this.guard = binaryGuard(socket);
    let counter = 0;
    this.nextId = options.nextId ?? (() => `fetch-${++counter}`);
    socket.addEventListener("message", (event) => {
      this.tail = this.tail.then(() => this.receive(event.data)).catch(() => {});
    });
    const close = (code: number, reason: string) => {
      if (this.interrupted !== null) return;
      this.interrupted = new ForwardInterrupted(code, reason);
      this.failAll(this.interrupted);
    };
    socket.addEventListener("close", (event) => close(event.code, event.reason));
    socket.addEventListener("error", (event) => close(1006, String((event as { message?: string }).message ?? "socket error")));
  }

  /**
   * One request forwarded. The frame and the body's bytes go back to back
   * with nothing awaited between them, so the bytes are the next message
   * after their frame; the answer comes back the same way, and resolves
   * this. A container that goes away rejects it; a server that is not
   * there answers it with status `0`, which is a response, not a failure,
   * and the caller decides what to make of it.
   */
  fetch(request: ForwardRequest): Promise<ForwardResponse> {
    return new Promise<ForwardResponse>((resolve, reject) => {
      if (this.interrupted !== null) {
        reject(this.interrupted);
        return;
      }
      const id = this.nextId();
      this.pending.set(id, { resolve, reject, frame: null });
      const body = request.body;
      try {
        this.send({
          type: "fetch",
          id,
          port: request.port,
          method: request.method,
          url: request.url,
          headers: request.headers,
          size: body === undefined ? 0 : body.byteLength,
        });
        if (body !== undefined && body.byteLength > 0) this.sendRaw(body);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private send(frame: CellFrame): void {
    this.sendRaw(encodeFrame(frame));
  }

  /** A send that fails is a socket that is gone: every request out is over, whatever the runtime's wording. */
  private sendRaw(data: string | Uint8Array): void {
    if (this.interrupted !== null) throw this.interrupted;
    try {
      this.socket.send(data);
    } catch (error) {
      this.interrupted = new ForwardInterrupted(1006, error instanceof Error ? error.message : String(error));
      this.failAll(this.interrupted);
      throw this.interrupted;
    }
  }

  private async receive(data: unknown): Promise<void> {
    if (typeof data === "string") {
      let frame: ContainerFrame;
      try {
        frame = decodeFrame(data) as ContainerFrame;
      } catch {
        // Not a frame at all; the readers that own the sync say so.
        return;
      }
      if (frame.type !== "response") return;
      this.answer(frame);
      return;
    }
    const announced = this.expecting;
    // Bytes the forward never announced belong to a sync, and `Checkout` is waiting for them.
    if (announced === null) return;
    this.expecting = null;
    this.guard.release();
    const bytes = await messageBytes(data);
    const id = announced.id;
    if (id === null) return;
    const pending = this.pending.get(id);
    if (pending === undefined || pending.frame === null) return;
    this.pending.delete(id);
    if (bytes === undefined) {
      pending.reject(new ForwardProtocolError("a binary message the cell cannot read"));
      return;
    }
    if (bytes.byteLength !== announced.size) {
      pending.reject(new ForwardProtocolError(`response ${announced.id} announced ${announced.size} bytes and carried ${bytes.byteLength}`));
      return;
    }
    pending.resolve({ status: pending.frame.status, headers: pending.frame.headers, body: bytes });
  }

  /**
   * A `response` frame. With no bytes it settles the request now; with
   * bytes it books the binary message that follows, and the guard is
   * where a sync's blob and a look's body meeting on one socket is caught.
   */
  private answer(frame: Extract<ContainerFrame, { type: "response" }>): void {
    const pending = this.pending.get(frame.id);
    if (frame.size === 0) {
      if (pending === undefined) return;
      this.pending.delete(frame.id);
      pending.resolve({ status: frame.status, headers: frame.headers, body: EMPTY });
      return;
    }
    try {
      this.guard.announce(`response ${frame.id}`);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (pending !== undefined) {
        this.pending.delete(frame.id);
        pending.reject(failure);
      }
      return;
    }
    // A response nobody is waiting for still owns the bytes behind it; they are read and dropped, not handed to a sync.
    if (pending === undefined) {
      this.expecting = { id: null, size: frame.size };
      return;
    }
    pending.frame = frame;
    this.expecting = { id: frame.id, size: frame.size };
  }

  private failAll(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    if (this.expecting !== null) {
      this.expecting = null;
      this.guard.release();
    }
    for (const one of pending) one.reject(error);
  }
}

const EMPTY = new Uint8Array(0);
