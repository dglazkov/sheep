/**
 * The lease: pen phase 3's `ContainerLease` over a container the home
 * starts. The cell never connects to the container. `rent()` mints a
 * token, asks the starter to start a container with the cell's address
 * and that token in its environment, and waits for the container to dial
 * `GET /s/<id>/pen?token=…`; the cell's `fetch` hands the upgrade to
 * `admit()`, which checks the token against the one outstanding mint,
 * accepts the pair, and resolves the rent with the server end. The token
 * is spent on use. A second `rent()` while the socket is open returns the
 * same socket and renews the container's idle clock; while a command runs
 * the clock is renewed on a ticker, so a long `pnpm test` is not stopped
 * as idle. `idle()` is a log line: the container's own `sleepAfter` stops
 * it, the socket's close is how the lease learns, and the next `rent()`
 * starts anew.
 *
 * On Cloudflare the starter is the `PenContainer` binding
 * (`container.ts`); in workerd's tests it is a stub that dials the same
 * route with the fake. The ledger is the Directory's minutes: the budget
 * is asked before a command is routed, not here, and a spent budget
 * empties the table's tier-2 column for that command. Reporting the
 * minutes is the starter's business: the binding reports from its own
 * `onStart` and `onStop`.
 */
import type { ContainerLease } from "../env/execution-env.ts";
import { DISCARDED_CLOSE_CODE } from "./run.ts";

/** Whoever starts the container: the Containers binding on Cloudflare, a stub in tests. */
export interface ContainerStarter {
  /** Starts a container with the cell's address and the token in its environment when none runs; renews the idle clock when one does. */
  ensure(args: { cellUrl: string; token: string }): Promise<{ started: boolean }>;
  /** Renews the idle clock of a running container; starts nothing. */
  renew(): Promise<{ running: boolean }>;
  /** Ends the container now. Its socket, if any, closes as a consequence. */
  destroy(): Promise<void>;
}

/** The home's container minutes, kept by the Directory. */
export interface ContainerLedger {
  spent(): Promise<boolean>;
}

export interface PenLeaseOptions {
  sessionId: string;
  /** What the container dials: the home's origin plus `/s/<id>/pen`. Unset, every rent is refused with a clear error. */
  cellUrl: string | undefined;
  starter: ContainerStarter;
  ledger?: ContainerLedger;
  /** Milliseconds a started container has to dial in before the rent fails. */
  startTimeoutMs: number;
  /** Milliseconds between renewals of the container's idle clock while a command runs. */
  renewEveryMs: number;
  /** Pen phase 4: attached to each admitted socket, to answer the container's `credential` frames from the home. */
  broker?: { attach(socket: WebSocket): void };
  log?: (line: string) => void;
  now?: () => number;
}

interface Pending {
  token: string;
  resolve(socket: WebSocket): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  since: number;
}

export class PenLease implements ContainerLease {
  private readonly options: PenLeaseOptions;
  private readonly log: (line: string) => void;
  private readonly now: () => number;
  /** The cell's end of the socket to the container that is up, if one is. */
  private live: WebSocket | undefined;
  private openedAt = 0;
  /** A rent waiting for the container to dial in, holding the one token that opens the door. */
  private pending: Pending | undefined;
  private starting: Promise<WebSocket> | undefined;
  private renewing: ReturnType<typeof setInterval> | undefined;
  /** How long the last start took, first `rent()` to socket open; for the findings. */
  lastStartMs: number | undefined;

  constructor(options: PenLeaseOptions) {
    this.options = options;
    this.log = options.log ?? (() => {});
    this.now = options.now ?? Date.now;
  }

  /** The socket to the container that is up, for tests and for the state route. */
  get socket(): WebSocket | undefined {
    return this.live;
  }

  /** Whether a rent is waiting for a container to dial in. */
  get connecting(): boolean {
    return this.pending !== undefined;
  }

  async rent(): Promise<WebSocket> {
    const live = this.live;
    if (live !== undefined) {
      this.keepAlive();
      void this.options.starter.renew().then(
        (state) => {
          if (!state.running) this.log("the container is not running, but its socket is still open; the close will follow");
        },
        (error: unknown) => this.log(`renew failed: ${messageOf(error)}`),
      );
      return live;
    }
    this.starting ??= this.start().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private start(): Promise<WebSocket> {
    const cellUrl = this.options.cellUrl;
    if (cellUrl === undefined) {
      return Promise.reject(new Error("PEN_CELL_ORIGIN is not set, so the container would have no address for this cell"));
    }
    const token = crypto.randomUUID();
    const since = this.now();
    const seconds = this.options.startTimeoutMs / 1000;
    const admitted = new Promise<WebSocket>((resolve, reject) => {
      this.pending = {
        token,
        resolve,
        reject,
        since,
        timer: setTimeout(() => this.fail(new Error(`the container did not connect within ${seconds} s`)), this.options.startTimeoutMs),
      };
    });
    this.log(`starting a container for ${cellUrl}`);
    this.options.starter.ensure({ cellUrl, token }).then(
      (state) => this.log(state.started ? `the container was started` : `a container was already running; waiting for it to dial in`),
      (error: unknown) => this.fail(new Error(`the container could not be started: ${messageOf(error)}`)),
    );
    return admitted.then((socket) => {
      this.keepAlive();
      return socket;
    });
  }

  /**
   * The cell's `GET /pen` upgrade: the token must be the one outstanding
   * mint. On a match the pair is made, the server end becomes the lease's
   * socket, the waiting rent resolves, and the token is spent. The client
   * end is returned for the 101; `undefined` is the 403.
   */
  admit(token: string): WebSocket | undefined {
    const pending = this.pending;
    if (pending === undefined || token === "" || pending.token !== token) return undefined;
    clearTimeout(pending.timer);
    this.pending = undefined;
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.live = server;
    this.openedAt = this.now();
    this.lastStartMs = this.openedAt - pending.since;
    server.addEventListener("close", (event) => this.closed(server, event.code, event.reason));
    server.addEventListener("error", (event) => this.closed(server, 1006, String((event as { message?: string }).message ?? "socket error")));
    // The broker listens for the socket's lifetime: a credential may be asked for in any run on it.
    this.options.broker?.attach(server);
    this.log(`the container connected ${this.lastStartMs} ms after the rent`);
    pending.resolve(server);
    return client;
  }

  idle(): void {
    this.stopKeepAlive();
    this.log(`the lane idled; the container stops on its own after its idle period`);
  }

  /** Gives the container up: the socket is closed, the starter told to destroy it, and the next rent starts anew. */
  discard(reason: string): void {
    const socket = this.live;
    this.live = undefined;
    this.stopKeepAlive();
    if (socket !== undefined) {
      try {
        socket.close(DISCARDED_CLOSE_CODE, reason);
      } catch {
        // Already closed.
      }
    }
    this.log(`discarding the container: ${reason}`);
    void this.options.starter.destroy().catch((error: unknown) => this.log(`destroy failed: ${messageOf(error)}`));
  }

  async budgetSpent(): Promise<boolean> {
    return this.options.ledger === undefined ? false : this.options.ledger.spent();
  }

  private closed(socket: WebSocket, code: number, reason: string): void {
    if (this.live !== socket) return;
    this.live = undefined;
    this.stopKeepAlive();
    this.log(`the container's socket closed (${code}${reason ? `: ${reason}` : ""}) after ${Math.round((this.now() - this.openedAt) / 1000)} s`);
  }

  private fail(error: Error): void {
    const pending = this.pending;
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending = undefined;
    this.log(`no container: ${error.message}`);
    pending.reject(error);
  }

  /** While a command runs, the container's idle clock is renewed on a ticker. */
  private keepAlive(): void {
    if (this.renewing !== undefined) return;
    this.renewing = setInterval(() => {
      if (this.live === undefined) {
        this.stopKeepAlive();
        return;
      }
      void this.options.starter.renew().catch((error: unknown) => this.log(`renew failed: ${messageOf(error)}`));
    }, this.options.renewEveryMs);
  }

  private stopKeepAlive(): void {
    if (this.renewing !== undefined) clearInterval(this.renewing);
    this.renewing = undefined;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `"10m"`, `"30s"`, `"1h"`, or seconds as a number; the Container class's own grammar. */
export function parseDuration(value: string | number | undefined, fallback: string): number {
  const text = value === undefined || value === "" ? fallback : String(value);
  const match = /^(\d+)([smh])?$/.exec(text);
  if (match === null) throw new Error(`not a duration: ${text}`);
  const amount = Number(match[1]);
  switch (match[2]) {
    case "m":
      return amount * 60;
    case "h":
      return amount * 3600;
    default:
      return amount;
  }
}
