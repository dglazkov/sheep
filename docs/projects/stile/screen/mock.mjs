// Mockups for issue #9: the stile as a TUI. One source, two renderings:
// frames.ans for the terminal (`cat`), stile-mockups.html for the storyboard.
// Only SGR 16-colour, bold, dim and inverse are used, so nothing here promises
// what a terminal cannot draw.
import { writeFileSync } from "node:fs";

const E = "\x1b[";
const R = `${E}0m`;
const s = (code, t) => `${E}${code}m${t}${R}`;
const bold = (t) => s("1", t);
const dim = (t) => s("2", t);
const accent = (t) => s("33", t);        // amber: the cursor, the thing to look at
const accentB = (t) => s("1;33", t);
const ok = (t) => s("32", t);            // green: settled
const err = (t) => s("31", t);           // red: refused
const link = (t) => s("4;36", t);        // cyan underline: an address
const wool = (t) => s("1;37", t);
const face = (t) => s("90", t);
const nose = (t) => s("35", t);
const inv = (t) => s("7", t);

const W = 80, H = 24;
const vis = (t) => t.replace(/\x1b\[[0-9;]*m/g, "").length;
const pad = (t, w = W) => t + " ".repeat(Math.max(0, w - vis(t)));
const right = (left, hint) => left + " ".repeat(Math.max(2, W - vis(left) - vis(hint))) + hint;

// ---------- sheep candidates ----------
// Round four. The emoji is a picture, so it is drawn as one: a 40x14 pixel
// canvas rasterised from shapes, printed two pixels per cell with the
// half-block glyphs (foreground for the top pixel, background for the bottom),
// 256 colours. The wool is shaded by height with a highlight on the shoulder.
// A terminal without colour cannot show pixels, so the line-art sheep stands
// in for it there. Nothing here needs more than pi-tui and chalk can emit.
const c256 = (n) => `${E}38;5;${n}m`;
const b256 = (n) => `${E}48;5;${n}m`;
const PAINT = {
  w: c256(255), W: c256(253), x: c256(251), y: c256(248), v: c256(245),
  f: c256(240), F: c256(237), e: c256(231), p: c256(217), P: c256(211),
  l: c256(240), g: c256(70), G: c256(64), _: "",
};
const seg = (row) => row.map(([k, t]) => (PAINT[k] ? `${PAINT[k]}${t}${R}` : t)).join("");
const SHEEP_W = 35;

/** A pixel canvas: 0 is transparent, anything else a 256-colour index. */
function canvas(w, h) { return { w, h, px: Array.from({ length: h }, () => new Array(w).fill(0)) }; }
function ellipse(cv, cx, cy, rx, ry, color) {
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) cv.px[y][x] = typeof color === "function" ? color(x, y) : color;
  }
}
function rect(cv, x0, y0, x1, y1, color) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cv.px[y][x] = typeof color === "function" ? color(x, y) : color; }
/** Cells from pixels: two rows of pixels per row of cells. */
function cells(cv) {
  const out = [];
  for (let r = 0; r < cv.h; r += 2) {
    let line = "";
    for (let c = 0; c < cv.w; c++) {
      const t = cv.px[r][c], b = cv.px[r + 1]?.[c] ?? 0;
      if (!t && !b) line += " ";
      else if (t && !b) line += `${c256(t)}▀${R}`;
      else if (!t && b) line += `${c256(b)}▄${R}`;
      else if (t === b) line += `${c256(t)}█${R}`;
      else line += `${c256(t)}${b256(b)}▀${R}`;
    }
    out.push(line);
  }
  return out;
}

/** The sheep, from the emoji: body, head, tuft, ears, eyes, nose, legs, grass. */
function pixelSheep({ eyes = "two", tuft = true } = {}) {
  const cv = canvas(SHEEP_W, 14);
  // Wool: light on top, a shoulder highlight, shadow toward the belly and the back.
  const wool = (x, y) => (y <= 3 ? 255 : y <= 5 ? (x < 25 ? 255 : 253) : y <= 7 ? 253 : y <= 9 ? 251 : 248);
  // The body, a chunky one: a slab with bumps along the top and the bottom, and rounded ends.
  rect(cv, 16, 4, 31, 9, wool);
  for (const cx of [17.5, 23.5, 29.5]) ellipse(cv, cx, 3.8, 3.9, 3.4, wool);
  for (const cx of [20.5, 26.5]) ellipse(cv, cx, 9.6, 3.4, 2.6, wool);
  ellipse(cv, 15.5, 6.8, 3.4, 3.8, wool);
  ellipse(cv, 31.5, 6.8, 3.2, 3.8, wool);
  // Legs, under the belly, before the head so nothing of them crosses it.
  for (const x of [18, 23, 27, 31]) rect(cv, x, 11, x + 1, 12, 240);
  // The head at the front, dark, looking at you; the tuft of wool on top; the ears out to the sides, pink inside.
  ellipse(cv, 9, 6, 4.6, 4.4, 237);
  if (tuft) ellipse(cv, 9, 2.2, 2.6, 2.4, 255);
  rect(cv, 3, 5, 4, 6, 240); rect(cv, 4, 5, 4, 5, 217);
  rect(cv, 14, 5, 15, 6, 240); rect(cv, 14, 5, 14, 5, 217);
  // Eyes, and a pink nose.
  if (eyes === "two") { rect(cv, 7, 6, 7, 6, 231); rect(cv, 11, 6, 11, 6, 231); }
  rect(cv, 8, 9, 9, 9, 211);
  // Grass.
  rect(cv, 0, 13, 34, 13, (x) => ([3, 9, 19, 27, 33].includes(x) ? 64 : 70));
  return cells(cv);
}

const SHEEP = {
  L: { name: "L · the emoji, in pixels", rows: pixelSheep() },
  J: { name: "J · in lines, for NO_COLOR", rows: [
    [["_", "    "], ["w", ",-."], ["_", "      "], ["w", ",-''-.,-''-.,-''-."]],
    [["_", "  "], ["p", "~"], ["f", "(     )"], ["p", "~"], ["_", " "], ["w", ",'"], ["W", "                 "], ["w", "`."]],
    [["_", "  "], ["f", "("], ["_", " "], ["e", "o"], ["_", "   "], ["e", "o"], ["_", " "], ["f", ")"], ["w", "("], ["x", "   ~   ~   ~   ~    "], ["w", ")"]],
    [["_", "   "], ["f", "`."], ["P", "v"], ["f", ".'"], ["_", "  "], ["y", "`."], ["y", "                  "], ["y", ",'"]],
    [["_", "     "], ["l", "|"], ["_", "      "], ["v", "`-.,-''-.,-''-.,-'"]],
    [["_", "     "], ["l", "|"], ["_", "       "], ["l", "||"], ["_", "  "], ["l", "||"], ["_", "  "], ["l", "||"], ["_", "  "], ["l", "||"]],
    [["g", "  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁"]],
  ].map(seg) },
};
for (const v of Object.values(SHEEP)) v.rows = v.rows.map((r) => pad(r, SHEEP_W));
let SHEEP_PICK = "L";

// ---------- the sheet ----------
const STEPS = ["command", "where", "account", "plan", "station", "key", "next"];
const NAME_W = 8;

for (const [k, v] of Object.entries(SHEEP)) for (const r of v.rows) if (vis(r) > SHEEP_W || v.rows.length !== 7) throw new Error(`sheep ${k}: row ${JSON.stringify(r)} is ${vis(r)} wide, ${v.rows.length} rows`);
/** Seven rows: the sheep on its grass, the name and the line beside it, and the grass is the rule under the banner. */
function banner(sheep = SHEEP[SHEEP_PICK]) {
  const title = ["", "", `${accentB("sheep")}`, `${dim("a home for agents that herd agents")}`, "", "", ""];
  return sheep.rows.map((r, i) => ` ${r} ${title[i]}`);
}

// state: { done: {step: value}, cursor, text, hint, under: [lines], finished }
function sheet(state, sheep) {
  const out = [...banner(sheep), ""];
  const at = state.finished ? STEPS.length : STEPS.indexOf(state.cursor);
  STEPS.forEach((step, i) => {
    const name = step.padEnd(NAME_W);
    if (i < at) out.push(`  ${ok("✓")} ${dim(name)}  ${state.done[step] ?? ""}`);
    else if (i === at) {
      const left = `  ${accent("›")} ${accentB(name)}  ${state.text ?? ""}`;
      out.push(state.hint ? right(left, dim(state.hint)) : left);
      for (const l of state.under ?? []) out.push(l);
    } else out.push(`    ${dim(name)}`);
  });
  // The screen is 24 rows. When what is under the cursor fills it (the words open on a step with choices), the blank
  // line under the grass is the one that gives way, and it comes back when the words close.
  if (out.length > H) out.splice(7, 1);
  if (state.foot) { while (out.length < H - 1) out.push(""); out.push(state.foot); }
  while (out.length < H) out.push("");
  return out.slice(0, H).map((l) => pad(l));
}

const IND = " ".repeat(14);
const sel = (label, desc) => IND + accentB("❯ ") + bold(label.padEnd(30)) + dim(desc);
const unsel = (label, desc) => IND + "  " + label.padEnd(30) + dim(desc);
function wrap(text, width) {
  const out = []; let line = "";
  for (const w of text.split(/\s+/)) { if (!line) line = w; else if (line.length + 1 + w.length <= width) line += " " + w; else { out.push(line); line = w; } }
  if (line) out.push(line); return out;
}
const PANEL_W = W - 14 - 2 - 7;
const panel = (things) => things.flatMap(([k, v]) => wrap(v, PANEL_W).map((l, i) => IND + dim("│ ") + bold((i === 0 ? k : "").padEnd(6)) + " " + l));
const box = (lines, w = W - 16) => [
  IND + dim("╭" + "─".repeat(w) + "╮"),
  ...lines.map((l) => IND + dim("│") + " " + pad(l, w - 2) + " " + dim("│")),
  IND + dim("╰" + "─".repeat(w) + "╯"),
];
const keys = (t) => dim(t);

const done1 = { command: `sheep 8118ac5, on PATH` };

const frames = [];
const frame = (id, title, why, lines) => frames.push({ id, title, why, lines });

frame("open", "The first thing on screen", "The sheep sits beside its name, the one done step is green, the step you are on is the one thing in colour, and the two answers are a real list with the default already chosen. Enter takes it.",
  sheet({ done: done1, cursor: "where", text: "where should this machine keep its settings?", hint: "? explain",
    under: [sel("everywhere on this machine", "~/.sheep, the usual answer"), unsel("this directory", ".sheep/ here, git-ignored")],
    foot: keys("  ↑↓ choose   Enter take   ? explain   Ctrl-C leave") }));

frame("words", "? opens the words", "The four things under the step as a panel with a rule down its side, labels bold, so it reads as an aside and not as more checklist. The hint flips to `? close`. With the words open the screen is full, so the key line at the bottom and the blank line under the grass give way until they close.",
  sheet({ done: done1, cursor: "where", text: "where should this machine keep its settings?", hint: "? close",
    under: [
      ...panel([
        ["what", "where this machine keeps its settings: everywhere on it, or this directory alone."],
        ["where", "everywhere puts them in ~/.sheep; this directory puts them in .sheep/ here, git-ignored."],
        ["cost", "nothing. Everywhere is the usual answer, and every directory without its own falls back to it."],
        ["sheep", "writes the skill your agent reads and, for this directory, an empty .sheep/; nothing else."],
      ]),
      sel("everywhere on this machine", "~/.sheep, the usual answer"), unsel("this directory", ".sheep/ here, git-ignored")] }));

frame("secret", "A secret, typed", "The prompt is a box, as Claude Code draws its own. A dot per character and, past sixteen, the count, so you can see the paste landed and nothing else. The address to make the token at is right there, not hidden behind `?`.",
  sheet({ done: { ...done1, where: "everywhere on this machine" }, cursor: "account", text: "the Cloudflare account your home lives on", hint: "? explain",
    under: [
      ...box([`${dim("Cloudflare API token")}  ${accent("••••••••••••••••")} ${dim("41")}${accent("▌")}`]),
      IND + dim("made at ") + link("dash.cloudflare.com/?to=/:account/api-tokens"),
    ],
    foot: keys("  Enter send   ? explain   Ctrl-C leave") }));

frame("refused", "A token refused", "The reason is red under the step and the box is back, empty. The count says the step is being asked a second time; nothing typed is anywhere on the screen.",
  sheet({ done: { ...done1, where: "everywhere on this machine" }, cursor: "account", text: "the Cloudflare account your home lives on", hint: "? explain",
    under: [
      IND + err("✗ ") + err("Cloudflare did not accept it: authentication error (code 10000)"),
      IND + dim("check it has the six permissions, or make a new one; asking again"),
      ...box([`${dim("Cloudflare API token")}  ${accent("▌")}`]),
    ],
    foot: keys("  Enter send   ? explain   Ctrl-C leave") }));

frame("plan", "Not on the plan yet", "The plans page is the one address on the screen, and the one action is spelled out as the selected row. Enter re-checks and the same screen fills in.",
  sheet({ done: { ...done1, where: "everywhere on this machine", account: "Dimitri's Account" }, cursor: "plan", text: "Workers Paid, 5 USD a month, is not on this account yet", hint: "? explain",
    under: [
      IND + dim("turn it on at ") + link("dash.cloudflare.com/…/workers/plans") + dim(" and come back"),
      "",
      sel("turned on at the dashboard; check again", ""),
    ],
    foot: keys("  Enter check again   ? explain   Ctrl-C leave") }));

frame("deploy", "The deploy, while it runs", "A spinner, the stage the deploy is at, and the clock. The stages deploy already narrates become a small checklist of their own, so a two-minute wait reads as progress and not as silence.",
  sheet({ done: { ...done1, where: "everywhere on this machine", account: "Dimitri's Account", plan: "Workers Paid, 5 USD a month" }, cursor: "station", text: "deploying " + bold("sheep-2") + " to Dimitri's Account",
    under: [
      IND + ok("✓") + " account checked, plan Workers Paid",
      IND + ok("✓") + " join store " + dim("sheep-2-join") + " made",
      IND + ok("✓") + " worker deployed as " + link("https://sheep-2.glazkov.workers.dev"),
      IND + accent("⠹") + " waiting for a container instance to be healthy  " + dim("1m 12s"),
      IND + dim("  rollout step 2: 0 healthy, 1 starting, 0 scheduling"),
    ],
    foot: keys("  the first container takes a minute or two   Ctrl-C leaves it deploying") }));

frame("key", "The key", "Same box as the token, so the second secret feels like the first. Where it goes is said once, under it.",
  sheet({ done: { ...done1, where: "everywhere on this machine", account: "Dimitri's Account", plan: "Workers Paid, 5 USD a month", station: link("https://sheep-2.glazkov.workers.dev") }, cursor: "key", text: "the Anthropic key your sheep call the model with", hint: "? explain",
    under: [
      ...box([`${dim("Anthropic API key")}  ${accent("••••••••••••••••")} ${dim("108")}${accent("▌")}`]),
      IND + dim("made at ") + link("console.anthropic.com/settings/keys"),
      IND + dim("kept in ~/.sheep/credentials and put on the home as its secret"),
    ],
    foot: keys("  Enter send   ? explain   Ctrl-C leave") }));

frame("finish", "The finish", "Seven green rows, then the three places things are, then the one sentence to say, in a box so it is the last thing the eye lands on. No path breaks mid-token; nothing prints twice.",
  (() => {
    const out = sheet({ finished: true, done: { ...done1, where: "everywhere on this machine", account: "Dimitri's Account", plan: "Workers Paid, 5 USD a month", station: link("https://sheep-2.glazkov.workers.dev"), key: "put on the home as its secret", next: "done, in 3m 40s" } });
    const tail = [
      "",
      `  ${dim("credentials")}  ~/.sheep/credentials ${dim("(mode 600, the two values and nothing else)")}`,
      `  ${dim("config     ")}  ~/.sheep/config`,
      `  ${dim("skill      ")}  ~/.agents/skills/sheep`,
      "",
      ...[
        `  ${dim("╭" + "─".repeat(76) + "╮")}`,
        `  ${dim("│")} ${pad(accentB("say to your agent"), 74)} ${dim("│")}`,
        `  ${dim("│")} ${pad(bold("sheep is set up on this machine; run `sheep --agent-help` and herd."), 74)} ${dim("│")}`,
        `  ${dim("╰" + "─".repeat(76) + "╯")}`,
      ],
    ];
    const head = out.slice(0, 8 + STEPS.length);
    return [...head, ...tail].concat(Array(H).fill("")).slice(0, H).map((l) => pad(l));
  })());

// NO_COLOR: the first frame with every SGR stripped. The glyphs carry the meaning.
frame("nocolor", "The same, under NO_COLOR", "Every escape stripped, nothing else changed. ✓ › ❯ and the rule still say which step is done, which is current, and which answer is chosen; that is what the tests should check, not the colour.",
  frames[0].lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "")));

// ---------- terminal output ----------
let ans = "";
ans += `${bold("sheep candidates")}\n\n`;
for (const k of Object.keys(SHEEP)) {
  ans += `  ${dim(SHEEP[k].name)}\n`;
  for (const r of SHEEP[k].rows) ans += `  ${r}\n`;
  ans += "\n";
}
for (const f of frames) {
  ans += `\n${bold(f.title)}  ${dim(f.id)}\n${dim("─".repeat(W))}\n`;
  ans += f.lines.join("\n") + "\n";
}
writeFileSync(new URL("./frames.ans", import.meta.url), ans);

// ---------- html ----------
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const HEX = (n) => { if (n < 16) return ["#000","#c33","#3c3","#cc3","#33c","#c3c","#3cc","#ccc","#666","#f66","#6f6","#ff6","#66f","#f6f","#6ff","#fff"][n]; if (n < 232) { const i = n - 16, r = Math.floor(i / 36), g = Math.floor(i / 6) % 6, b = i % 6, v = (k) => (k ? 55 + k * 40 : 0); return `rgb(${v(r)},${v(g)},${v(b)})`; } const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; };
function toHtml(line) {
  let out = "", st = { b: 0, d: 0, i: 0, u: 0, fg: "", bg: "" };
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0, m;
  const span = (t) => {
    if (!t) return "";
    const cls = [st.b && "b", st.d && "d", st.i && "i", st.u && "u", /^\d+$/.test(st.fg) && `c${st.fg}`].filter(Boolean).join(" ");
    const style = [st.fg.startsWith("x") && `color:${HEX(+st.fg.slice(1))}`, st.bg && `background:${HEX(+st.bg)}`].filter(Boolean).join(";");
    return cls || style ? `<span${cls ? ` class="${cls}"` : ""}${style ? ` style="${style}"` : ""}>${esc(t)}</span>` : esc(t);
  };
  while ((m = re.exec(line))) {
    out += span(line.slice(last, m.index));
    last = m.index + m[0].length;
    for (const c of (m[1] || "0").split(";")) {
      if (c === "0") st = { b: 0, d: 0, i: 0, u: 0, fg: "", bg: "" };
      else if (c === "1") st.b = 1; else if (c === "2") st.d = 1; else if (c === "7") st.i = 1; else if (c === "4") st.u = 1;
      else if (/^(3[0-7]|9[0-7])$/.test(c)) st.fg = c;
    }
    for (const mm of m[1].matchAll(/(38|48);5;(\d+)/g)) { if (mm[1] === "38") st.fg = `x${mm[2]}`; else st.bg = mm[2]; }
  }
  return out + span(line.slice(last));
}
const term = (lines) => `<pre class="term">${lines.map(toHtml).join("\n")}</pre>`;

const sheepCards = Object.entries(SHEEP).map(([k, v]) => `
  <figure class="sheep">
    <pre class="term small">${v.rows.map(toHtml).join("\n")}</pre>
    <figcaption><b>${esc(v.name)}</b></figcaption>
  </figure>`).join("");

const frameBlocks = frames.map((f, n) => `
  <section class="frame" id="${f.id}">
    <div class="note">
      <div class="k">${String(n + 1).padStart(2, "0")} · ${esc(f.id)}</div>
      <h2>${esc(f.title)}</h2>
      <p>${esc(f.why)}</p>
    </div>
    ${term(f.lines)}
  </section>`).join("");

const html = `<title>Stile Mockups</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root{
  --bg:#f3f1ec; --ink:#1d1c19; --mute:#6b675e; --rule:#d9d5cc; --card:#fbfaf7;
  --t-bg:#15171d; --t-fg:#d7dae1; --t-dim:#7d8492; --t-am:#e7a93c; --t-gr:#7dcc7a; --t-rd:#ec6c6c; --t-cy:#6fc7dc; --t-mg:#e08ab8; --t-wh:#f6f7fa; --t-bk:#8d93a1;
  --accent:#b8791e;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ --bg:#1b1d23; --ink:#e6e6e2; --mute:#9a9a93; --rule:#33363e; --card:#22252c; --accent:#e7a93c; } }
:root[data-theme="dark"]{ --bg:#1b1d23; --ink:#e6e6e2; --mute:#9a9a93; --rule:#33363e; --card:#22252c; --accent:#e7a93c; }
body{background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:15px;line-height:1.5;padding-inline:clamp(16px,4vw,48px);padding-block:40px 80px}
main{max-width:1180px;margin:0 auto}
h1{font-size:1.9rem;font-weight:600;letter-spacing:-.01em;margin:0 0 .25rem;text-wrap:balance}
.lede{color:var(--mute);max-width:62ch;margin:0 0 2.5rem}
h2{font-size:1.15rem;font-weight:600;margin:.25rem 0 .5rem;text-wrap:balance}
.k{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.sheep-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin:0 0 3rem}
figure.sheep{margin:0}
figcaption{font-size:.85rem;color:var(--mute);margin-top:.4rem}
.frame{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:24px;align-items:start;padding-block:28px;border-top:1px solid var(--rule)}
.note p{color:var(--mute);margin:0;max-width:40ch}
pre.term{background:var(--t-bg);color:var(--t-fg);font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:13px;line-height:1;margin:0;padding:14px 16px;border-radius:6px;overflow-x:auto;white-space:pre;tab-size:4;box-shadow:0 1px 0 rgba(0,0,0,.25),0 8px 24px -12px rgba(0,0,0,.5)}
pre.term.small{display:block;font-size:16px}
.b{font-weight:700}.d{color:var(--t-dim)}.u{text-decoration:underline}.i{background:var(--t-fg);color:var(--t-bg)}
.cx255{color:#f6f6f4}.cx253{color:#dedeDC}.cx251{color:#c6c6c4}.cx248{color:#a8a8a6}.cx245{color:#8a8a88}.cx240{color:#585858}.cx237{color:#3a3a3a}.cx231{color:#fff}.cx217{color:#ffafaf}.cx211{color:#ff87af}.cx70{color:#5faf00}.cx64{color:#5f8700}
.c33{color:var(--t-am)}.c32{color:var(--t-gr)}.c31{color:var(--t-rd)}.c36{color:var(--t-cy)}.c35{color:var(--t-mg)}.c37{color:var(--t-wh)}.c90{color:var(--t-bk)}
.d.c33,.d.c32{opacity:.8}
.pal{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 2.5rem}
.sw{display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--mute)}
.sw i{width:18px;height:18px;border-radius:3px;display:inline-block;border:1px solid rgba(0,0,0,.2)}
.how{font-size:.9rem;color:var(--mute);margin-top:3rem;border-top:1px solid var(--rule);padding-top:1rem;max-width:70ch}
code{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.85em}
@media (max-width:760px){.frame{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<main>
<div class="k">issue #9 · sheep setup at a terminal</div>
<h1>Stile Mockups</h1>
<p class="lede">Every screen of the first sitting, drawn at 80×24 with the sixteen ANSI colours plus bold and dim, which is all a terminal is promised. Round four: the emoji drawn as the picture it is, two pixels per cell with the half-block glyphs in 256 colours, shaded by height. The line-art one stands in where there is no colour. The frames below wear candidate ${SHEEP_PICK}.</p>

<div class="k">the sheep</div>
<h2>Two candidates</h2>
<div class="sheep-row">${sheepCards}</div>

<div class="k">the palette</div>
<h2>Six meanings, six colours</h2>
<div class="pal">
  <span class="sw"><i style="background:var(--t-am)"></i>amber · the step you are on, the chosen row, the cursor</span>
  <span class="sw"><i style="background:var(--t-gr)"></i>green · settled</span>
  <span class="sw"><i style="background:var(--t-rd)"></i>red · refused</span>
  <span class="sw"><i style="background:var(--t-cy)"></i>cyan · an address</span>
  <span class="sw"><i style="background:var(--t-dim)"></i>dim · steps not reached, hints, paths</span>
  <span class="sw"><i style="background:var(--t-wh)"></i>bold white · wool, and the sentence to say</span>
</div>

${frameBlocks}

<p class="how">To see the same frames in your own terminal, with its real colours and font: <code>cat scratchpad/mock/frames.ans</code> from this session's scratchpad. The HTML above is the terminal's escape codes converted to spans, nothing more.</p>
</main>
`;
writeFileSync(new URL("./stile-mockups.html", import.meta.url), html);
console.log(`wrote ${frames.length} frames`);
for (const f of frames) { const bad = f.lines.filter((l) => vis(l) > W); if (bad.length) console.log(`  ${f.id}: ${bad.length} line(s) over ${W}: ${vis(bad[0])}`); if (f.lines.length !== H) console.log(`  ${f.id}: ${f.lines.length} rows`); }
