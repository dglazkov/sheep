/**
 * A sheep's page drawn (hill phase 3): `<hill-sheep>`, in the light DOM like
 * the shell, beside the narrowed flock at `/hill/s/<id>`. The head is the
 * row the flock already polls (so a sheep being born shows its setup running
 * at once), with the tool the sheep is on once the cell has answered; under
 * it, the blocks `sheep log` prints, oldest first, drawn to the storyboard:
 * prompts in cyan, the sheep's words in green, each tool call in mono with
 * its result folded under it, the `[setup]` block where it happened, and the
 * tool running now pulsing at the bottom.
 *
 * It owns the transcript loop (`sheep.ts`'s `TranscriptFollow`) and starts
 * it only when the row says something has been asked of the sheep, stops it
 * when it leaves the page, and tells it the tab's visibility. It tells the
 * flock two things by event: `hill-gone` when the home has no such sheep,
 * and `hill-seatless` when the seat is gone.
 */
import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { type Block, type Part, type ResultBlock, setupEnding, type ToolPart } from "../../cli/src/blocks.ts";
import { elapsed } from "../../cli/src/setup-words.ts";
import type { RowModel, SessionRow } from "./flock.ts";
import type { SheepClient } from "./home.ts";
import { argSummary, asksCell, atBottom, CELL_SILENT, foldKey, foldLabel, Held, type Operation, openTool, quietWords, type Reading, resultLines, type Scroll, scrollAfter, TranscriptFollow } from "./sheep.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number): string => String(n).padStart(2, "0");

/** `14 Sep 20:14:03`, in the viewer's own time: when a block happened. */
function when(at: number): string {
  const date = new Date(at);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

export class HillSheep extends LitElement {
  static override properties = {
    model: { attribute: false },
    row: { attribute: false },
    now: { attribute: false },
    operation: { state: true },
    silent: { state: true },
    version: { state: true },
  };
  declare model: RowModel;
  declare row: SessionRow;
  declare now: number;
  declare operation: Operation | null;
  declare silent: boolean;
  /** Bumped when the held copy changes, so Lit draws it again; the copy itself is not a reactive property, and never copied. */
  declare version: number;
  client: SheepClient | undefined;

  readonly #held = new Held();
  readonly #open = new Set<string>();
  #follow: TranscriptFollow | undefined;
  /** Where the scroller was just before the page was last drawn. */
  #before: Scroll | undefined;
  readonly #onVisibility = (): void => this.#follow?.visible(document.visibilityState === "visible");

  constructor() {
    super();
    this.now = Date.now();
    this.operation = null;
    this.silent = false;
    this.version = 0;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this.#onVisibility);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this.#onVisibility);
    this.#follow?.stop();
    this.#follow = undefined;
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    // The wake rule, asked on every row the flock hands down: the loop starts the first time the row says the sheep was asked something.
    if (this.#follow === undefined && this.client !== undefined && this.row !== undefined && this.isConnected && asksCell(this.row)) {
      this.#follow = new TranscriptFollow(this.client, this.row.id, (reading) => this.#landed(reading));
      this.#follow.visible(document.visibilityState === "visible");
    }
    const scroller = this.querySelector<HTMLElement>(".blocks");
    this.#before = scroller === null ? undefined : { top: scroller.scrollTop, height: scroller.scrollHeight, client: scroller.clientHeight };
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    // Following the bottom: a reader at the bottom before this drawing is at the new bottom after it; one scrolled up is left where they are.
    const scroller = this.querySelector<HTMLElement>(".blocks");
    if (scroller === null) return;
    const before = this.#before ?? { top: 0, height: 0, client: scroller.clientHeight };
    if (!atBottom(before)) return;
    const top = scrollAfter(before, { height: scroller.scrollHeight, client: scroller.clientHeight });
    if (top !== scroller.scrollTop) scroller.scrollTop = top;
  }

  #landed(reading: Reading): void {
    switch (reading.kind) {
      case "cell":
        this.operation = reading.operation;
        this.silent = false;
        break;
      case "view":
        this.operation = reading.view.operation;
        this.silent = false;
        if (this.#held.take(reading.view, this.row?.setup ?? null, Date.now())) this.version++;
        break;
      case "silent":
        this.silent = true;
        break;
      case "gone":
        this.dispatchEvent(new CustomEvent("hill-gone", { bubbles: true, detail: this.row?.id }));
        break;
      case "seatless":
        this.dispatchEvent(new CustomEvent("hill-seatless", { bubbles: true }));
        break;
    }
  }

  #toggle(key: string): void {
    if (this.#open.has(key)) this.#open.delete(key);
    else this.#open.add(key);
    this.requestUpdate();
  }

  protected override render(): TemplateResult {
    const model = this.model;
    const blocks = this.#held.blocks;
    const tool = openTool(blocks, this.operation);
    const quiet = quietWords(this.row, this.#held.view, blocks.length);
    return html`
      <div class="head">
        <span class="id" title=${model.id}><span class="lead">${model.lead}</span><span class="fold">${model.short}</span><span class="mark">${model.mark}</span></span>
        ${model.name === "" ? nothing : html`<span class="name">${model.name}</span>`}
        <span class="now"
          ><span class="dot ${model.dot}"></span><b class="state ${model.state}">${model.state}</b>${tool === undefined ? nothing : html` · tool <code>${tool.part.name}</code>`}${this.operation?.status === "aborting"
            ? html` · <b class="aborting">aborting</b>`
            : nothing}${model.pasture === "" ? nothing : html` · pasture <code>${model.pasture}</code>`}${model.secrets === "" ? nothing : html` · secrets <code>${model.secrets}</code>`} · setup
          <span class="setup ${model.setupTone}">${model.setup}</span></span
        >
      </div>
      ${this.silent ? html`<p class="silent">${CELL_SILENT}</p>` : nothing}
      <div class="blocks">
        ${quiet === null ? nothing : html`<p class="quiet">${quiet}</p>`}
        ${repeat(
          blocks,
          (block) => block.id,
          (block) => this.#block(block, tool?.part),
        )}
      </div>
    `;
  }

  #block(block: Block, live: ToolPart | undefined): TemplateResult | typeof nothing {
    const stamp = `${block.id} · ${new Date(block.at).toISOString()}`;
    switch (block.kind) {
      case "prompt":
        return html`<div class="blk prompt"><span class="who" title=${stamp}>prompt</span><div class="body">${block.parts.map((part) => this.#prose(part))}</div></div>`;
      case "reply":
        return html`${this.#reply(block, live, stamp)}`;
      case "result":
        // A result a call claimed is drawn under that call; one no call in this transcript claims stands alone.
        if (block.paired) return nothing;
        return html`<div class="blk tool"><span class="who" title=${stamp}>result</span><div class="body tool"><span class="fn">${block.toolName}</span>${this.#fold(block, block.callId || block.id, block)}</div></div>`;
      case "setup": {
        const ending = block.running ? setupEnding(block.record, this.row?.setup ?? null, this.now) : { ending: block.ending, running: false };
        const tone = ending.running ? "run" : /^exit 0( |$)/.test(ending.ending) ? "ok" : "bad";
        return html`<div class="blk setup">
          <span class="who" title=${stamp}>setup</span>
          <div class="body"><span class="k">[setup]</span> ${block.record.id} · ${when(block.at)} · <span class="setup ${tone}">${ending.ending}</span>${block.lines.length === 0 ? nothing : html`<pre class="res">${block.lines.join("\n")}</pre>`}</div>
        </div>`;
      }
      case "message":
        return html`<div class="blk note"><span class="who" title=${stamp}>${block.role}</span><div class="body mono">${block.json}</div></div>`;
      case "compaction":
        return html`<div class="blk note"><span class="who" title=${stamp}>compacted</span><div class="body">${block.summary}</div></div>`;
      case "branch_summary":
        return html`<div class="blk note"><span class="who" title=${stamp}>branch</span><div class="body">${block.summary}</div></div>`;
      case "custom":
        return html`<div class="blk note"><span class="who" title=${stamp}>${block.customType}</span><div class="body mono">${block.data ?? ""}</div></div>`;
    }
  }

  /** A prompt's or a reply's words: text as it was written, a thinking line dim, anything else named. */
  #prose(part: Part): TemplateResult | typeof nothing {
    if (part.kind === "text") return part.text.trim() === "" ? nothing : html`<div class="text">${part.text.replace(/\n$/, "")}</div>`;
    if (part.kind === "thinking") return html`<div class="think">${part.line}</div>`;
    if (part.kind === "other") return html`<div class="think">[${part.type}]</div>`;
    return nothing;
  }

  /** A reply: its words in runs under `sheep`, each tool call on its own line with its result folded under it, and its error or abort last. */
  #reply(block: Extract<Block, { kind: "reply" }>, live: ToolPart | undefined, stamp: string): TemplateResult[] {
    const rows: TemplateResult[] = [];
    let words: Part[] = [];
    const flush = (): void => {
      const drawn = words.filter((part) => !(part.kind === "text" && part.text.trim() === ""));
      if (drawn.length > 0) rows.push(html`<div class="blk reply"><span class="who" title=${stamp}>sheep</span><div class="body">${drawn.map((part) => this.#prose(part))}</div></div>`);
      words = [];
    };
    for (const part of block.parts) {
      if (part.kind !== "tool") {
        words.push(part);
        continue;
      }
      flush();
      const running = part === live;
      rows.push(html`<div class="blk tool">
        <span class="who" title=${stamp}>tool</span>
        <div class="body tool">
          <span class="fn">${part.name}</span> <span class="arg" title=${part.args}>${argSummary(part)}</span>
          ${running
            ? html`<div class="live"><span class="dot running"></span>running · ${elapsed(this.now - block.at)}</div>`
            : part.result === null
              ? html`<div class="nofold">no result</div>`
              : this.#fold(block, part.callId, part.result)}
        </div>
      </div>`);
    }
    flush();
    if (block.error !== null) {
      rows.push(
        block.aborted
          ? html`<div class="blk abort"><span class="who" title=${stamp}>aborted</span><div class="body">The turn was aborted. <span class="why">${block.error}</span></div></div>`
          : html`<div class="blk error"><span class="who" title=${stamp}>error</span><div class="body">${block.error}</div></div>`,
      );
    }
    return rows;
  }

  #fold(block: Pick<Block, "id">, callId: string, result: ResultBlock): TemplateResult {
    const key = foldKey(block, callId);
    const open = this.#open.has(key);
    return html`<button type="button" class="fold ${open ? "open" : ""} ${result.isError ? "bad" : ""}" aria-expanded=${open ? "true" : "false"} @click=${() => this.#toggle(key)}>${foldLabel(result)}</button>${open
        ? html`<pre class="res ${result.isError ? "bad" : ""}">${resultLines(result).join("\n")}</pre>`
        : nothing}`;
  }
}

customElements.define("hill-sheep", HillSheep);
