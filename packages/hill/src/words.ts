/**
 * The gate's words (hill phase 1), pure: what a browser with no seat reads,
 * and the names the top bar carries before any route behind the door has
 * answered. The two refusals are the Worker's own sentences
 * (`packages/cell/src/hill-words.ts`), read back into the storyboard's two
 * lines: the reason in red, the instruction under it.
 *
 * A backtick pair in a sentence marks a command, drawn in a monospace face.
 */
import { PASS_EXPIRED, PASS_USED } from "../../cell/src/hill-words.ts";

/** Why a pass was refused, as the page knows it. */
export type Refusal = "used" | "expired";

/** The gate as three lines: the refusal in red or none, the sentence, and the dim line under it. */
export interface GateWords {
  refused: string | null;
  say: string;
  keys: string;
}

/** The gate's sentence for a browser that came with no pass. */
export const CLIMB = "To climb the hill, run `sheep hill` at your terminal, or ask your agent to, and open the link it prints.";

/** The dim line under either sentence. */
export const KEYS = "The link works once and for two minutes. Your seat stays for thirty days.";

/** The words the flow's refusal is recognised by: the Worker's 403 body. Anything else refused is a pass already used. */
export function refusalOf(body: string): Refusal {
  return body.trim() === PASS_EXPIRED ? "expired" : "used";
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The Worker's sentence split where it turns from the reason to the instruction: `that pass expired; run sheep hill for another`. */
function halves(sentence: string): [string, string] {
  const at = sentence.indexOf("; ");
  return [sentence.slice(0, at), sentence.slice(at + 2)];
}

/** The gate for a refusal, or for none: the three lines the storyboard draws. */
export function gateWords(refused: Refusal | null): GateWords {
  if (refused === null) return { refused: null, say: CLIMB, keys: KEYS };
  const [reason, instruction] = halves(refused === "expired" ? PASS_EXPIRED : PASS_USED);
  return {
    refused: `${capital(reason)}.`,
    say: `${capital(instruction).replace("sheep hill", "`sheep hill`")} and open the link it prints.`,
    keys: KEYS,
  };
}

/** A sentence as runs of prose and command: the odd runs between backticks are the commands. */
export function runs(sentence: string): { text: string; code: boolean }[] {
  return sentence
    .split("`")
    .map((text, index) => ({ text, code: index % 2 === 1 }))
    .filter((run) => run.text !== "");
}

/** The station's name, with no route asked: a station is `<name>.<account>.workers.dev`; the local home has an address and no name. */
export function stationName(hostname: string): string {
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return "local home";
  return hostname.split(".")[0] ?? hostname;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The build as the top bar shows it, from the `x-sheep-build` header every
 * response carries: `<commit> <builtAt>` becomes `3b38f11 · 14 Sep`, a
 * checkout's bare commit stays as it is, and no header is no build.
 */
export function buildLabel(header: string | null): string | null {
  if (header === null || header.trim() === "") return null;
  const [commit, builtAt] = header.trim().split(/\s+/);
  const when = builtAt === undefined ? Number.NaN : Date.parse(builtAt);
  if (Number.isNaN(when)) return commit!;
  const date = new Date(when);
  return `${commit} · ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}
