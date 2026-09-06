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
 *
 * Pasture phase 3 adds the one lookup the design names: for a sheep in a
 * pasture, `pastureMinter` reads the pasture's `GIT_TOKEN` from its object
 * at the moment of the request and hands that over, the home's
 * `PEN_GIT_TOKEN` after it when the pasture has none; the host is the
 * repository's when the pasture has one. The frame, the hand-over, and
 * the minute are pen's, unchanged. This is the function a GitHub App's
 * mint will replace.
 */
import { type CellFrame, type ContainerFrame, type CredentialAnswer, type CredentialRequest, decodeFrame, encodeFrame } from "@sheep/pen/protocol";
import type { PastureMeta } from "../pasture.ts";

export const DEFAULT_GIT_HOST = "github.com";
/** What GitHub wants beside a token; the fixture in the tests wants the same. */
export const GIT_USERNAME = "x-access-token";
/** How long a handed-over value is said to be good for: this push, not the next day. */
export const CREDENTIAL_TTL_MS = 60_000;
/** The pasture secret the broker looks for; every other name is setup's (pasture phase 4). */
export const PASTURE_GIT_TOKEN = "GIT_TOKEN";

/** The home's secrets, as the Worker's environment holds them. Read at each request, never copied. */
export interface HomeSecrets {
  gitToken?: string | undefined;
  gitHost?: string | undefined;
}

/** What the minter asks of a pasture's object, over RPC, at each request: its meta and one secret's value. The `Pasture` stub is one. */
export interface PastureSecrets {
  meta(): Promise<PastureMeta | undefined>;
  secret(name: string): Promise<string | undefined>;
}

/** A hand-over says where the value came from, for the log line and nothing else. */
export type Minted = { answer: CredentialAnswer; from?: string } | { refused: string };
/** A mint may wait: the pasture's is a hop away. */
export type Mint = (request: CredentialRequest) => Minted | Promise<Minted>;

/** The host a scope is for, for the log and the refusal; never the token. */
export function hostOf(scope: string): string {
  try {
    return new URL(scope).host;
  } catch {
    return scope;
  }
}

/** The one credential on offer for a request: its value, the host it is for, and, for the log line, where it is from when that is worth saying. */
interface Offer {
  from?: string;
  token: string;
  host: string;
}

/** The mint proper: the request against what is on offer. The refusal names hosts and variables, never a value. */
function mintFrom(request: CredentialRequest, offer: Offer | undefined, nothing: (host: string) => string, now: () => number): Minted {
  if (request.kind !== "git") return { refused: `the home mints no ${String(request.kind)} credential` };
  let asked: URL;
  try {
    asked = new URL(request.scope);
  } catch {
    return { refused: `the scope ${request.scope} is not a URL` };
  }
  if (offer === undefined) return { refused: nothing(asked.host) };
  const wanted = offer.host.toLowerCase();
  if (asked.host.toLowerCase() !== wanted && asked.hostname.toLowerCase() !== wanted) {
    return { refused: `the home has no credential for ${asked.host}; its token is for ${offer.host}` };
  }
  const answer: CredentialAnswer = { username: GIT_USERNAME, value: offer.token, expires: now() + CREDENTIAL_TTL_MS };
  return offer.from === undefined ? { answer } : { answer, from: offer.from };
}

/** The home's offer: `PEN_GIT_TOKEN` for `PEN_GIT_HOST`, or nothing when the token is unset. Unnamed: the home's line is pen's, unchanged. */
function homeOffer(home: HomeSecrets): Offer | undefined {
  const token = home.gitToken;
  if (token === undefined || token === "") return undefined;
  return { token, host: (home.gitHost ?? "").trim() || DEFAULT_GIT_HOST };
}

/**
 * The home as a minter: one git token for one host. The refusal names the
 * host asked for and the host configured, and never the token.
 */
export function homeMinter(home: HomeSecrets, now: () => number = Date.now): Mint {
  return (request) => mintFrom(request, homeOffer(home), (host) => `the home has no PEN_GIT_TOKEN, so nothing can be minted for ${host}`, now);
}

/**
 * The pasture as a minter, the home behind it: the pasture's `GIT_TOKEN`
 * first, the home's `PEN_GIT_TOKEN` after, both read at the request and
 * kept nowhere; the host is the repository's when the pasture has one,
 * else `PEN_GIT_HOST`. The refusal names the pasture, the variables, and
 * the hosts, never a value.
 */
export function pastureMinter(name: string, pasture: PastureSecrets, home: HomeSecrets, now: () => number = Date.now): Mint {
  return async (request) => {
    const meta = await pasture.meta();
    const repoHost = meta?.repo == null ? undefined : hostOf(meta.repo);
    const own = await pasture.secret(PASTURE_GIT_TOKEN);
    let offer: Offer | undefined;
    if (own !== undefined && own !== "") offer = { from: `pasture ${name}`, token: own, host: repoHost ?? ((home.gitHost ?? "").trim() || DEFAULT_GIT_HOST) };
    else {
      const fallback = homeOffer(home);
      offer = fallback === undefined ? undefined : { ...fallback, from: "the home", host: repoHost ?? fallback.host };
    }
    return mintFrom(request, offer, (host) => `pasture ${name} has no ${PASTURE_GIT_TOKEN} and the home has no PEN_GIT_TOKEN, so nothing can be minted for ${host}`, now);
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
    void this.answer(socket, frame);
  }

  /** One request, minted now and answered once; a mint that throws is a refusal that names the failure, never a value. */
  private async answer(socket: WebSocket, frame: Extract<ContainerFrame, { type: "credential" }>): Promise<void> {
    const host = hostOf(frame.scope);
    let minted: Minted;
    try {
      minted = await this.mint({ kind: frame.kind, scope: frame.scope });
    } catch (error) {
      minted = { refused: `the credential for ${host} could not be looked up: ${error instanceof Error ? error.message : String(error)}` };
    }
    let reply: CellFrame;
    if ("refused" in minted) {
      this.log(`credential ${frame.id} for ${host} refused: ${minted.refused}`);
      reply = { type: "error", code: "refused", of: "credential", id: frame.id, message: minted.refused };
    } else {
      this.log(`credential ${frame.id} for ${host} handed over${minted.from === undefined ? "" : ` from ${minted.from}`}, good for ${Math.round(CREDENTIAL_TTL_MS / 1000)} s`);
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
