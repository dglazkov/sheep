/**
 * The credential broker: the cell's side of `credential`. A program in
 * the container asked its helper, the helper asked the agent, and the
 * agent sent `credential {id, kind, scope}` up the socket. The broker
 * listens on the container's socket for that frame (frames not its own
 * pass by, as `ContainerRun`'s and `Checkout`'s do) and answers from the
 * home: `credential {id, username, value, expires}` when the home has a
 * value for that scope, `error {refused}` naming the host when it does
 * not. The value is read from the home's secret at the moment of the
 * request and sent once; the broker keeps nothing, logs the id and the
 * host only, and the model never sees the frame, since it is not a
 * `stdout` or `stderr` of any run.
 *
 * What the home has today is one fine-grained token for one host
 * (`PEN_GIT_TOKEN`, scoped by `PEN_GIT_HOST`, default `github.com`). A
 * fine-grained token cannot be minted per request, so the "mint" is the
 * hand-over: the same value, said to be good for a minute, so that
 * whoever reads `expires` treats it as a thing for this push and not a
 * thing to keep. A GitHub App that mints per push is Identity's.
 */
import { type CellFrame, type ContainerFrame, type CredentialAnswer, type CredentialRequest, decodeFrame, encodeFrame } from "@sheep/pen/protocol";

export const DEFAULT_GIT_HOST = "github.com";
/** What GitHub wants beside a token; the fixture in the tests wants the same. */
export const GIT_USERNAME = "x-access-token";
/** How long a handed-over value is said to be good for: this push, not the next day. */
export const CREDENTIAL_TTL_MS = 60_000;

/** The home's secrets, as the Worker's environment holds them. Read at each request, never copied. */
export interface HomeSecrets {
  gitToken?: string | undefined;
  gitHost?: string | undefined;
}

export type Minted = { answer: CredentialAnswer } | { refused: string };
export type Mint = (request: CredentialRequest) => Minted;

/** The host a scope is for, for the log and the refusal; never the token. */
export function hostOf(scope: string): string {
  try {
    return new URL(scope).host;
  } catch {
    return scope;
  }
}

/**
 * The home as a minter: one git token for one host. The refusal names the
 * host asked for and the host configured, and never the token.
 */
export function homeMinter(home: HomeSecrets, now: () => number = Date.now): Mint {
  return (request) => {
    const configured = (home.gitHost ?? "").trim() || DEFAULT_GIT_HOST;
    if (request.kind !== "git") return { refused: `the home mints no ${String(request.kind)} credential` };
    let asked: URL;
    try {
      asked = new URL(request.scope);
    } catch {
      return { refused: `the scope ${request.scope} is not a URL` };
    }
    const wanted = configured.toLowerCase();
    if (asked.host.toLowerCase() !== wanted && asked.hostname.toLowerCase() !== wanted) {
      return { refused: `the home has no credential for ${asked.host}; its token is for ${configured}` };
    }
    const token = home.gitToken;
    if (token === undefined || token === "") return { refused: `the home has no PEN_GIT_TOKEN, so nothing can be minted for ${asked.host}` };
    return { answer: { username: GIT_USERNAME, value: token, expires: now() + CREDENTIAL_TTL_MS } };
  };
}

export class CredentialBroker {
  private readonly mint: Mint;
  private readonly log: (line: string) => void;

  constructor(mint: Mint, log: (line: string) => void = () => {}) {
    this.mint = mint;
    this.log = log;
  }

  /** Listens on a container's socket for `credential` frames until the returned function is called or the socket closes. */
  attach(socket: WebSocket): () => void {
    const onMessage = (event: MessageEvent) => this.receive(socket, event.data);
    socket.addEventListener("message", onMessage);
    return () => socket.removeEventListener("message", onMessage);
  }

  private receive(socket: WebSocket, data: unknown): void {
    if (typeof data !== "string") return;
    let frame: ContainerFrame;
    try {
      frame = decodeFrame(data) as ContainerFrame;
    } catch {
      return;
    }
    if (frame.type !== "credential") return;
    const host = hostOf(frame.scope);
    const minted = this.mint({ kind: frame.kind, scope: frame.scope });
    let reply: CellFrame;
    if ("refused" in minted) {
      this.log(`credential ${frame.id} for ${host} refused: ${minted.refused}`);
      reply = { type: "error", code: "refused", of: "credential", id: frame.id, message: minted.refused };
    } else {
      this.log(`credential ${frame.id} for ${host} handed over, good for ${Math.round(CREDENTIAL_TTL_MS / 1000)} s`);
      reply = { type: "credential", id: frame.id, ...minted.answer };
    }
    try {
      socket.send(encodeFrame(reply));
    } catch (error) {
      // The container went away between asking and being answered; the run that asked settles on the close.
      this.log(`credential ${frame.id} for ${host} could not be sent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
