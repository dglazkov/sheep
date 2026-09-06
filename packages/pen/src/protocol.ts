/**
 * The container protocol: every message that crosses the one WebSocket
 * between a cell and the container it rented. The container is the
 * client. It opens `PEN_CELL_URL` with the cell's token as the `token`
 * query parameter (the same shape as the cell's own socket address), and
 * from then on everything is frames on that socket.
 *
 * A frame is one JSON object per text message with a `type` field. Blob
 * bytes travel as one binary message immediately after the `blob` text
 * frame that names their hash and size; nothing is base64. Manifest
 * paths are relative to the checkout root (`src/a.txt`, never
 * `/workspace/src/a.txt` and never a leading slash), so the cell's
 * `/workspace` and the container's `/workspace` are the same tree by
 * construction. Directories carry no hash; files and symlinks carry
 * SHA-256 of their bytes (a symlink's bytes are its target), lowercase
 * hex.
 *
 * A run is `run` from the cell, `stdout` and `stderr` frames from the
 * container as they happen, `exit` or `killed` at the end, and then the
 * container describes what the run changed, as `changed`, without being
 * asked. `kill` from the cell ends a run early and `killed` answers it.
 *
 * The two syncs are one dance in two directions. Sync in: `manifest`
 * from the cell, `need` from the container, one `blob` per needed hash
 * from the cell, `checkout` from the container once the tree is written.
 * Sync out: `changed` from the container, `need` from the cell (only
 * what it will accept), one `blob` per hash from the container, `synced`
 * from the cell with what it refused. Whoever holds the newer tree
 * describes it; the other side asks for the bytes it lacks.
 *
 * A credential is asked for from the container's side, by a program git
 * spawned: the helper reaches the agent over a Unix socket and the agent
 * sends `credential {id, kind, scope}` up the one WebSocket. The cell's
 * broker answers `credential {id, username, value, expires}` from the
 * home, or `error {of: "credential", id}` when the home has nothing for
 * that scope. The value crosses once, is handed to the program that
 * asked, and is kept by no one: not the agent, not the cell, not a row,
 * and never a `stdout` or `stderr` frame.
 *
 * This file must run anywhere: it is imported by the cell (workerd) and
 * by the agent (node). No `node:*`, no globals beyond JSON.
 */

/** Names of the environment variables the agent reads on start. */
export const CELL_URL_ENV = "PEN_CELL_URL";
export const TOKEN_ENV = "PEN_TOKEN";
/** The query parameter the token travels in. */
export const TOKEN_PARAM = "token";
/** Where the agent listens for the helper inside the container: a Unix socket path. */
export const HELPER_SOCKET_ENV = "PEN_HELPER_SOCKET";
export const DEFAULT_HELPER_SOCKET = "/tmp/pen-agent.sock";

/**
 * What the helper sends the agent, one JSON line on the Unix socket:
 * git's `protocol`, `host`, and `path` (when git gives one), as they came
 * from git's own `key=value` lines. The agent's `scope` is
 * `${protocol}://${host}` plus `/${path}` when there is a path.
 */
export interface HelperRequest {
  kind: "git";
  protocol: string;
  host: string;
  path?: string;
}

/** The agent's one JSON line back: what git gets, or `{}` when there is nothing. */
export interface HelperAnswer {
  username?: string;
  value?: string;
}

/** A credential request as the agent carries it: `scope` is a URL prefix the value is for. */
export interface CredentialRequest {
  kind: "git";
  scope: string;
}

/** The cell's answer, from the home; `username` when the host wants one (`x-access-token` for GitHub). */
export interface CredentialAnswer {
  username?: string;
  value: string;
  /** Epoch ms after which the value should not be relied on. */
  expires: number;
}

export type EntryKind = "file" | "directory" | "symlink";

export interface ManifestEntry {
  /** Relative to the checkout root, `/`-separated, no leading slash. */
  path: string;
  kind: EntryKind;
  /** Permission bits, as in the cell's rows (`0o644`, `0o755`). */
  mode: number;
  /** SHA-256 over the bytes, lowercase hex; `null` for a directory. */
  hash: string | null;
}

/** An entry in `changed`: the size lets the cell refuse before the bytes move. */
export interface ChangedEntry extends ManifestEntry {
  /** Bytes; 0 for a directory. */
  size: number;
}

/** A file the cell would not take, named for the tool result. */
export interface Refused {
  path: string;
  size: number;
}

/** Announces one binary message, the bytes, which follows it immediately. */
export interface BlobFrame {
  type: "blob";
  hash: string;
  size: number;
}

/** Asks for the bytes behind these hashes, each sent as one `blob`. Empty when nothing is missing. */
export interface NeedFrame {
  type: "need";
  /** The `manifest` or `changed` this answers. */
  id: string;
  hashes: string[];
}

/** Frames the cell sends to the container. */
export type CellFrame =
  | { type: "ping"; id?: string }
  /** The whole workspace, sorted by path. Anything not in it is deleted from the checkout, except what the cache rule keeps. */
  | { type: "manifest"; id: string; entries: ManifestEntry[] }
  | BlobFrame
  | NeedFrame
  /** Runs `command` through the container's own bash under `cwd`; `stdout` and `stderr` frames follow as they happen, then `exit` or `killed`, then `changed`. */
  | { type: "run"; id: string; command: string; cwd: string; env: Record<string, string>; /** seconds; absent for no limit */ timeout?: number }
  /** Ends the run under this id early; `killed` answers it. A kill for a run that has already ended is ignored. */
  | { type: "kill"; id: string; reason: string }
  /** Asks the container to describe what changed since the last sync, as `changed` under this id. */
  | { type: "sync"; id: string }
  /** The diff the container sent under this id has been written to the rows, except the files named. */
  | { type: "synced"; id: string; refused: Refused[] }
  /** The home's answer to the container's `credential` under this id. Handed to the program that asked; kept nowhere. */
  | ({ type: "credential"; id: string } & CredentialAnswer)
  /** The cell could not act on a frame; `of` names the frame's type and `id` the frame, when it had one. A `credential` gets `refused`. */
  | { type: "error"; code: "refused" | "unsupported"; of: string; id?: string; message: string };

/** Frames the container sends to the cell. */
export type ContainerFrame =
  | { type: "pong"; id?: string }
  | NeedFrame
  /** The manifest under this id is on disk: every blob written, modes set, the rest deleted. */
  | { type: "checkout"; id: string }
  /** A chunk of the run's output as it happened; the two streams keep their arrival order on the one socket. */
  | { type: "stdout"; id: string; data: string }
  | { type: "stderr"; id: string; data: string }
  /** The run ended on its own with this code. `changed` follows. */
  | { type: "exit"; id: string; code: number }
  /** The run was ended early, by `kill` or by the agent's own backstop timer; no exit code exists. `changed` follows. */
  | { type: "killed"; id: string; reason: string }
  /** What changed since the last sync: new and changed entries, and paths no longer there. */
  | { type: "changed"; id: string; entries: ChangedEntry[]; deleted: string[] }
  | BlobFrame
  /** A program in the container asked the helper for a credential; the cell answers `credential` or `error` under this id. */
  | ({ type: "credential"; id: string } & CredentialRequest)
  /**
   * The agent could not act on a frame; `of` names the frame's type. A
   * sync the error lands in is over: `unsupported` and `malformed` are the
   * frame's fault, `mismatch` a blob whose bytes are not its hash,
   * `failed` the disk's.
   */
  | { type: "error"; code: "unsupported" | "malformed" | "mismatch" | "failed"; of: string; message: string };

export type Frame = CellFrame | ContainerFrame;

export function encodeFrame(frame: Frame): string {
  return JSON.stringify(frame);
}

/** Parses one text message. Throws on anything that is not an object with a string `type`. */
export function decodeFrame(text: string): Frame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("frame is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || typeof (parsed as { type?: unknown }).type !== "string") {
    throw new Error("frame has no type");
  }
  return parsed as Frame;
}

/**
 * The bytes of a binary message, whichever shape the runtime hands over:
 * workerd gives an ArrayBuffer, Node's WebSocket a Blob unless told
 * otherwise, and a test may pass a view. `undefined` for anything else.
 */
export async function messageBytes(data: unknown): Promise<Uint8Array | undefined> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const tag = Object.prototype.toString.call(data);
  if (tag === "[object ArrayBuffer]") return new Uint8Array(data as ArrayBuffer);
  if (tag === "[object Blob]") return new Uint8Array(await (data as Blob).arrayBuffer());
  return undefined;
}

/**
 * The cache rule's built-in half: names that stay in the container at
 * any depth, before the checkout's own `.gitignore` is read.
 */
export const BUILT_IN_IGNORES = ["node_modules", ".venv", "dist", "build", "__pycache__"] as const;
