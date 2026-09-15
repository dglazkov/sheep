/**
 * The flock drawn (hill phase 2): `<hill-flock>`, in the light DOM like the
 * shell, owning the poll and the two reads, and drawing what `flock.ts`
 * makes of them: the home's line and the rows at `/hill/`, and at
 * `/hill/s/<id>` the rows narrowed to a column beside that sheep's head, the
 * head drawn from the row with no request of its own. The transcript under
 * the head is the next project's part of the page, so the space is empty.
 *
 * It asks nothing but `GET /sessions` and `GET /home`, through `home.ts`,
 * and tells the shell three things by event: `hill-seatless` when either
 * read is a 401, `hill-build` when an answer carries the build header, and
 * `hill-go` with the address a row or a link opens. The shell owns the
 * address; this owns the flock.
 */
import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { repeat } from "lit/directives/repeat.js";
import { FLOCK_PATH, type HomeFacts, homeLine, idParts, Poller, type Route, readFlock, type RowModel, rowModels, type SessionRow, sheepPath } from "./flock.ts";
import type { HomeClient, SheepClient } from "./home.ts";
import "./sheep-view.ts";

/** A click the browser should keep: a new tab, a new window, a download, or not the main button. */
function browserKeeps(event: MouseEvent): boolean {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export class HillFlock extends LitElement {
  static override properties = {
    route: { attribute: false },
    rows: { state: true },
    report: { state: true },
    silent: { state: true },
    now: { state: true },
  };
  declare route: Route;
  declare rows: SessionRow[] | undefined;
  declare report: HomeFacts | undefined;
  declare silent: boolean;
  declare now: number;
  client: (HomeClient & SheepClient) | undefined;
  /** The sheep this page has shown, and those it has heard are gone: a shown sheep the flock stops listing was ended. */
  readonly #shown = new Set<string>();
  readonly #gone = new Set<string>();

  #poller: Poller | undefined;
  #tick: ReturnType<typeof setInterval> | undefined;
  readonly #onVisibility = (): void => this.#seen();

  constructor() {
    super();
    this.route = { view: "flock" };
    this.rows = undefined;
    this.report = undefined;
    this.silent = false;
    this.now = Date.now();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("hill-gone", this.#onGone);
    this.#poller = new Poller(() => this.#read());
    document.addEventListener("visibilitychange", this.#onVisibility);
    this.#seen();
  }

  readonly #onGone = (event: Event): void => {
    const id = (event as CustomEvent<string | undefined>).detail;
    if (id === undefined) return;
    this.#gone.add(id);
    this.requestUpdate();
  };

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("hill-gone", this.#onGone);
    document.removeEventListener("visibilitychange", this.#onVisibility);
    this.#poller?.stop();
    this.#poller = undefined;
    this.#stopTick();
  }

  /** The tab's visibility, told to the poll and to the second hand; hidden stops both, visible starts both at once. */
  #seen(): void {
    const visible = document.visibilityState === "visible";
    this.#poller?.visible(visible);
    if (!visible) {
      this.#stopTick();
      return;
    }
    this.now = Date.now();
    // The second hand: ages and a running setup move from the rows already held, without asking the home again.
    this.#tick ??= setInterval(() => (this.now = Date.now()), 1_000);
  }

  #stopTick(): void {
    if (this.#tick !== undefined) clearInterval(this.#tick);
    this.#tick = undefined;
  }

  async #read(): Promise<void> {
    const client = this.client;
    if (client === undefined) return;
    const [sessions, home] = await Promise.all([client.sessions().catch(() => undefined), client.home().catch(() => undefined)]);
    const reading = readFlock(sessions, home);
    if (reading.kind === "seatless") {
      this.#poller?.stop();
      this.dispatchEvent(new CustomEvent("hill-seatless", { bubbles: true, detail: reading.build }));
      return;
    }
    if (reading.kind === "silent") {
      this.silent = true;
      return;
    }
    this.rows = reading.rows;
    this.report = reading.report;
    this.silent = false;
    this.now = Date.now();
    if (reading.build !== null) this.dispatchEvent(new CustomEvent("hill-build", { bubbles: true, detail: reading.build }));
  }

  #go(event: MouseEvent, address: string): void {
    if (browserKeeps(event)) return;
    event.preventDefault();
    this.dispatchEvent(new CustomEvent("hill-go", { bubbles: true, detail: address }));
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    // The meter's fill through the CSSOM: the page's policy refuses a `style` attribute, and a property set in script is not one.
    const fill = this.querySelector<HTMLElement>(".meter i");
    if (fill !== null && this.report !== undefined) fill.style.width = `${Math.round((homeLine(this.report, 0).fill ?? 0) * 100)}%`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const rows = this.rows;
    const report = this.report;
    if (rows === undefined || report === undefined) {
      return this.silent ? html`<p class="silent alone">The home did not answer. Asking again.</p>` : nothing;
    }
    const models = rowModels(rows, this.now);
    const route = this.route;
    if (route.view === "flock") {
      return html`
        ${this.#homeLine(report, models.length)}
        ${this.silent ? html`<p class="silent">The home did not answer. Showing what it last said; asking again.</p>` : nothing}
        <section class="flock wide" aria-label="the flock">${this.#rows(models, null)}</section>
      `;
    }
    const at = models.findIndex((model) => model.id === route.id);
    if (at !== -1 && !this.#gone.has(route.id)) this.#shown.add(route.id);
    const gone = this.#gone.has(route.id) || (at === -1 && this.#shown.has(route.id));
    return html`
      <div class="split">
        <section class="flock col" aria-label="the flock">${this.#rows(models, route.id)}</section>
        <section class="sheep" aria-label="a sheep">
          ${this.silent ? html`<p class="silent">The home did not answer. Showing what it last said; asking again.</p>` : nothing}
          ${gone
            ? this.#gonePage(route.id)
            : at === -1
              ? this.#notHere(route.id)
              : keyed(route.id, html`<hill-sheep .client=${this.client} .row=${rows[at]} .model=${models[at]} .now=${this.now}></hill-sheep>`)}
        </section>
      </div>
    `;
  }

  #homeLine(report: HomeFacts, sheep: number): TemplateResult {
    const line = homeLine(report, sheep);
    const yes = (on: boolean): TemplateResult => html`<b class=${on ? "ok" : "no"}>${on ? "yes" : "no"}</b>`;
    return html`
      <div class="homeline">
        <span>container ${yes(line.container)}</span>
        <span>eyes ${yes(line.eyes)}</span>
        <span
          ><span class="longer">container </span>minutes <b class=${line.spent ? "bad" : ""}>${line.minutes}</b>${line.budget === null
            ? nothing
            : html` of ${line.budget}<span class="meter" role="meter" aria-valuemin="0" aria-valuemax=${line.budget} aria-valuenow=${line.minutes}><i class=${line.spent ? "bad" : ""}></i></span>`}</span
        >
        <span class="count">${line.sheep} sheep</span>
      </div>
    `;
  }

  #rows(models: RowModel[], selected: string | null): TemplateResult {
    if (models.length === 0) {
      return html`<div class="unmet"><p>No sheep at this home yet.</p><p class="hint"><code>sheep new</code> mints one.</p></div>`;
    }
    return html`
      <div class="thead">
        <span class="wide-cell"></span><span class="wide-cell">sheep</span><span class="wide-cell">name</span><span class="wide-cell">state</span><span class="wide-cell">pasture</span
        ><span class="wide-cell">secrets</span><span class="wide-cell">born</span><span class="wide-cell">task</span><span class="wide-cell">setup</span>
        <span class="fold-cell">${models.length} sheep</span>
      </div>
      ${repeat(
        models,
        (model) => model.id,
        (model) => html`
          <a
            class="row ${model.id === selected ? "sel" : ""}"
            href=${sheepPath(model.id)}
            aria-current=${model.id === selected ? "page" : "false"}
            @click=${(event: MouseEvent) => this.#go(event, sheepPath(model.id))}
          >
            <span class="dot ${model.dot}" title=${model.dot === "failed" ? "setup failed" : model.state}></span>
            <span class="id wide-cell" title=${model.id}><span class="lead">${model.lead}</span><span class="mark">${model.mark}</span></span>
            <span class="name wide-cell">${model.name}</span>
            <span class="state wide-cell ${model.state}">${model.state}</span>
            <span class="pasture wide-cell">${model.pasture}</span>
            <span class="secrets wide-cell" title=${model.secrets}>${model.secrets}</span>
            <span class="age wide-cell" title=${model.bornIso}>${model.age}</span>
            <span class="task wide-cell" title=${model.task}>${model.task}</span>
            <span class="setup wide-cell ${model.setupTone}">${model.setup}</span>
            <span class="fid fold-cell" title=${model.id}>${model.short}${model.name === "" ? nothing : html` <span class="name">${model.name}</span>`}</span>
            <span class="age fold-cell" title=${model.bornIso}>${model.ageShort}</span>
            <span class="sub fold-cell ${model.subIsSetup ? `setup ${model.setupTone}` : ""}" title=${model.sub}>${model.sub}</span>
          </a>
        `,
      )}
    `;
  }

  /** The storyboard's third phone: a sheep ended while its page was open. */
  #gonePage(id: string): TemplateResult {
    return html`
      <div class="gone">
        <hill-mark scale="4"></hill-mark>
        <p><b><code title=${id}>${idParts(id).short}</code> is gone.</b></p>
        <p>It was ended with <code>sheep rm</code>.</p>
        <p><a href=${FLOCK_PATH} @click=${(event: MouseEvent) => this.#go(event, FLOCK_PATH)}>Back to the flock</a></p>
      </div>
    `;
  }

  #notHere(id: string): TemplateResult {
    return html`
      <div class="gone">
        <hill-mark scale="4"></hill-mark>
        <p><b><code title=${id}>${idParts(id).short}</code> is not at this home.</b></p>
        <p><a href=${FLOCK_PATH} @click=${(event: MouseEvent) => this.#go(event, FLOCK_PATH)}>Back to the flock</a></p>
      </div>
    `;
  }
}

customElements.define("hill-flock", HillFlock);
