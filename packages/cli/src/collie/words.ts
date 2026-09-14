/**
 * The collie's sentences (collie phase 1), from its journeys: what a pass
 * handed over says, the switch both ways, the report, and a line of the
 * log. Every function here takes what the Worker answered and returns the
 * text; nothing is fetched or printed here.
 */
import type { LogLine, PassResult, Report, Room } from "./home.js";

/** What standing by costs (design.md, "The command"), said once when a canvas becomes a room. */
export const PRICE_LINE = "standing by costs one object awake, about four dollars a month at Cloudflare's list price, inside the plan's included duration for the first";

/** What `collie new --pass` and `collie pass` print for the Worker's answer. */
export function passWords(result: PassResult): string {
  if (result.kind === "agent") return `collie: now answers for ${result.agent} on "${result.room.title}"\n`;
  if (result.already) return `collie: already standing by on "${result.room.title}"\n`;
  return (
    `collie: standing by on "${result.room.title}" at ${result.room.address}, as ${result.owner}\n` +
    `${PRICE_LINE}\n` +
    `agents are added in the tray at ${result.room.address}\n` +
    "`collie log` follows what it does\n"
  );
}

/** Journey 5 step 2: a canvas on this machine's own isocan daemon, refused before a pass is minted; both homes named, and what would connect them. */
export function loopbackWords(title: string, origin: string, collie: string): string {
  return `the canvas "${title}" lives at ${origin}, this machine's own isocan daemon, which the collie at ${collie} cannot reach; no pass was minted — move the canvas to a home with an address, or use the rig`;
}

/** Titles as a sentence names them: `"A"`, `"A" and "B"`, `"A", "B", and "C"`. */
export function titles(rooms: Room[]): string {
  const quoted = rooms.map((room) => `"${room.title}"`);
  if (quoted.length <= 2) return quoted.join(" and ");
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted.at(-1)}`;
}

export function offWords(rooms: Room[]): string {
  // Journey 3 step 1's sentence, word for word.
  if (rooms.length === 0) return "collie: off — holds released; it stood by on no canvas; collie on resumes\n";
  return `collie: off — holds released; ${titles(rooms)} ${rooms.length === 1 ? "reads" : "read"} nobody listening; collie on resumes\n`;
}

export function onWords(rooms: Room[]): string {
  if (rooms.length === 0) return "collie: on, standing by on no canvas yet; `collie new` on a bound canvas gives it one\n";
  return `collie: standing by on ${titles(rooms)}\n`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `HH:MM:SS` in this machine's time zone. */
export function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "--:--:--";
  return `${pad2(at.getHours())}:${pad2(at.getMinutes())}:${pad2(at.getSeconds())}`;
}

/** `YYYY-MM-DD HH:MM` in this machine's time zone. */
export function when(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())} ${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
}

/** How long ago, as `3d 4h`, `3h 5m`, `12m`, or `under a minute`. */
export function ago(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return "a while";
  if (minutes < 1) return "under a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** One row of the narration: the clock, then the line as the rc said it. */
export function logWords(row: LogLine): string {
  return `${clock(row.at)}  ${row.line}\n`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Columns padded to the widest cell in each, the last left ragged. */
function columns(rows: string[][], indent: string): string {
  const widths = rows.reduce<number[]>((acc, row) => row.map((cell, i) => Math.max(acc[i] ?? 0, [...cell].length)), []);
  return rows.map((row) => `${indent}${row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!))).join("  ")}\n`).join("");
}

/** `collie`: whether it stands by and since when, the ceiling, then each room, whose word it takes, and each agent on it. */
export function reportWords(report: Report, now: number = Date.now()): string {
  const since = report.since === null ? "" : ` since ${when(report.since)} (${ago(report.since, now)})`;
  const canvases = report.rooms.length === 0 ? "no canvas" : count(report.rooms.length, "canvas", "canvases");
  let text = report.on ? `collie: standing by${since} on ${canvases}\n` : `collie: off${since}; \`collie on\` resumes standing by on ${canvases}\n`;
  if (report.rooms.length === 0) return `${text}no canvas has been handed to it; \`collie new\` on a bound canvas gives it one\n`;
  const { turnsPerHour, chain } = report.limits;
  text += `an agent here answers at most ${count(turnsPerHour, "turn")} an hour, and ${count(chain, "turn")} in a row with no person's word between\n`;
  for (const room of report.rooms) {
    text += `\n"${room.title}"  ${room.address}  taking ${room.owner}'s word\n`;
    if (room.agents.length === 0) {
      text += `  no agents yet; they are added in the tray at ${room.address}\n`;
      continue;
    }
    text += columns(
      room.agents.map((agent) => [
        agent.name,
        agent.sheep === null ? "no sheep yet" : `sheep ${agent.sheep}`,
        agent.sheep === null ? "" : (agent.lane ?? "lane unknown"),
        agent.came,
        `${agent.turnsLastHour} of ${turnsPerHour} turns in the last hour`,
      ]),
      "  ",
    );
  }
  return text;
}
