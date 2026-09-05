/**
 * The cell's side of one `run`: send it, hand every `stdout` and `stderr`
 * frame on as it arrives, and settle on `exit` or `killed`. A `kill`
 * from the cell is answered by `killed`, or by the `exit` that was
 * already on its way; the cell takes either. The socket closing before
 * the end is the container going away, and the run settles as
 * interrupted with no exit code, which is journey 3.
 *
 * Frames that are not this run's pass by: the `Checkout` on the same
 * socket sees the sync frames, and this sees the run's.
 */
import { type CellFrame, type ContainerFrame, decodeFrame, encodeFrame } from "@lamb/pen/protocol";

/** The container went away while the command was running. Whatever ran, ran; no exit code exists. */
export class RunInterrupted extends Error {
  readonly code: number;
  readonly reason: string;
  constructor(code: number, reason: string) {
    super(`the container went away during the run (${code}${reason ? `: ${reason}` : ""})`);
    this.name = "RunInterrupted";
    this.code = code;
    this.reason = reason;
  }
}

/** The container could not run the command, and said so. */
export class RunFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunFailed";
  }
}

export type RunEnd = { exit: number } | { killed: string };

export interface RunRequest {
  id: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
  /** Seconds; absent for no limit. */
  timeout?: number;
}

export interface RunListeners {
  stdout(data: string): void;
  stderr(data: string): void;
}

export class ContainerRun {
  private readonly socket: WebSocket;
  private readonly request: RunRequest;
  private readonly listeners: RunListeners;
  private settled = false;
  private resolve: ((end: RunEnd) => void) | undefined;
  private reject: ((error: Error) => void) | undefined;
  private readonly onMessage = (event: MessageEvent) => this.receive(event.data);
  private readonly onClose = (event: CloseEvent) => this.fail(new RunInterrupted(event.code, event.reason));
  private readonly onError = (event: Event) => this.fail(new RunInterrupted(1006, String((event as { message?: string }).message ?? "socket error")));

  constructor(socket: WebSocket, request: RunRequest, listeners: RunListeners) {
    this.socket = socket;
    this.request = request;
    this.listeners = listeners;
  }

  /** Sends `run` and resolves at `exit` or `killed`; rejects when the container goes away or refuses. */
  start(): Promise<RunEnd> {
    return new Promise<RunEnd>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.socket.addEventListener("message", this.onMessage);
      this.socket.addEventListener("close", this.onClose);
      this.socket.addEventListener("error", this.onError);
      const frame: CellFrame = { type: "run", ...this.request };
      this.send(frame);
    });
  }

  /** Asks the container to end the run. The answer is `killed`, or the `exit` that beat it. */
  kill(reason: string): void {
    if (this.settled) return;
    this.send({ type: "kill", id: this.request.id, reason });
  }

  private send(frame: CellFrame): void {
    try {
      this.socket.send(encodeFrame(frame));
    } catch (error) {
      this.fail(new RunInterrupted(1006, error instanceof Error ? error.message : String(error)));
    }
  }

  private receive(data: unknown): void {
    if (typeof data !== "string") return;
    let frame: ContainerFrame;
    try {
      frame = decodeFrame(data) as ContainerFrame;
    } catch {
      return;
    }
    const id = this.request.id;
    switch (frame.type) {
      case "stdout":
        if (frame.id === id) this.listeners.stdout(frame.data);
        return;
      case "stderr":
        if (frame.id === id) this.listeners.stderr(frame.data);
        return;
      case "exit":
        if (frame.id === id) this.settle({ exit: frame.code });
        return;
      case "killed":
        if (frame.id === id) this.settle({ killed: frame.reason });
        return;
      case "error":
        if (frame.of === "run" || frame.of === "kill") this.fail(new RunFailed(`the container reported ${frame.code} on ${frame.of}: ${frame.message}`));
        return;
      default:
        return;
    }
  }

  private detach(): void {
    this.settled = true;
    this.socket.removeEventListener("message", this.onMessage);
    this.socket.removeEventListener("close", this.onClose);
    this.socket.removeEventListener("error", this.onError);
  }

  private settle(end: RunEnd): void {
    if (this.settled) return;
    this.detach();
    this.resolve?.(end);
  }

  private fail(error: Error): void {
    if (this.settled) return;
    this.detach();
    this.reject?.(error);
  }
}
