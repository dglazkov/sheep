/**
 * The container protocol: every message that crosses the one WebSocket
 * between a cell and the container it rented. The container is the
 * client. It opens `PEN_CELL_URL` with the cell's token as the `token`
 * query parameter (the same shape as lamb's own socket address), and
 * from then on everything is frames on that socket.
 *
 * A frame is one JSON object per text message with a `type` field. Blob
 * bytes travel as base64 in the `data` field for now; a later phase may
 * move them to binary messages. Manifest paths are relative to the
 * checkout root (`src/a.txt`, never `/workspace/src/a.txt` and never a
 * leading slash), so the cell's `/workspace` and the container's
 * `/workspace` are the same tree by construction. Directories carry no
 * hash; files and symlinks carry SHA-256 of their bytes (a symlink's
 * bytes are its target), lowercase hex.
 *
 * This file must run anywhere: it is imported by the cell (workerd) and
 * by the agent (node). No `node:*`, no globals beyond JSON, TextEncoder,
 * atob and btoa.
 */

/** Names of the environment variables the agent reads on start. */
export const CELL_URL_ENV = "PEN_CELL_URL";
export const TOKEN_ENV = "PEN_TOKEN";
/** The query parameter the token travels in. */
export const TOKEN_PARAM = "token";

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

/** Frames the cell sends to the container. */
export type CellFrame =
  | { type: "ping"; id?: string }
  /** The whole workspace, sorted by path. Anything not in it is deleted from the checkout. */
  | { type: "manifest"; entries: ManifestEntry[] }
  | { type: "blob"; hash: string; data: string }
  | { type: "run"; id: string; command: string; cwd: string; env: Record<string, string>; /** seconds */ timeout: number }
  /** The diff the container sent under this run id has been written to the rows. */
  | { type: "synced"; id: string }
  | { type: "credential"; id: string; value: string; /** epoch ms */ expires: number };

/** Frames the container sends to the cell. */
export type ContainerFrame =
  | { type: "pong"; id?: string }
  | { type: "need"; hashes: string[] }
  | { type: "stdout"; id: string; data: string }
  | { type: "stderr"; id: string; data: string }
  | { type: "exit"; id: string; code: number }
  | { type: "killed"; id: string; reason: string }
  /** What the run changed: new and changed entries, and paths no longer there. */
  | { type: "changed"; id: string; entries: ManifestEntry[]; deleted: string[] }
  | { type: "blob"; hash: string; data: string }
  | { type: "credential"; id: string; kind: "git"; scope: string }
  /** The agent could not act on a frame. `of` names the frame's type. */
  | { type: "error"; code: "unsupported" | "malformed"; of: string; message: string };

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

/** Bytes to the base64 a `blob` frame carries. */
export function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function decodeBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
