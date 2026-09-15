/**
 * The page (hill phase 1): one shell, Lit, drawn into the light DOM so the
 * one stylesheet (`hill.css`) styles all of it. The shell is the top bar,
 * the mark, the station's name and build, and sign out once seated; under
 * it, the gate or the seated panel. The flock and a sheep's page are hill
 * phases 2 and 3; seated, this phase shows one dim line saying so.
 *
 * Nothing here holds or sends a token: the flow asks the home through
 * `home.ts`, whose requests carry the browser's own cookie and no header of
 * the page's.
 */
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { type Landing, land, signOut } from "./flow.ts";
import { homeClient } from "./home.ts";
import { paintMark } from "./mark.ts";
import { buildLabel, gateWords, runs, stationName } from "./words.ts";

/** The pixel sheep at a scale: `<hill-mark scale="6">`. */
class HillMark extends LitElement {
  static override properties = { scale: { type: Number } };
  declare scale: number;

  constructor() {
    super();
    this.scale = 2;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<canvas class="mark" role="img" aria-label="a sheep"></canvas>`;
  }

  protected override updated(): void {
    const canvas = this.querySelector("canvas");
    if (canvas !== null) paintMark(canvas, this.scale);
  }
}

/** The shell. */
class HillApp extends LitElement {
  static override properties = { landing: { state: true }, build: { state: true }, leaving: { state: true } };
  declare landing: Landing | undefined;
  declare build: string | null;
  declare leaving: boolean;
  private readonly client = homeClient();
  private readonly name = stationName(location.hostname);

  constructor() {
    super();
    this.landing = undefined;
    this.build = null;
    this.leaving = false;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.title = `${this.name} · the hill`;
    void land(location.href, this.client, (address) => history.replaceState(history.state, "", address)).then(({ landing, build }) => {
      this.landing = landing;
      this.build = buildLabel(build);
    });
  }

  private async leave(): Promise<void> {
    this.leaving = true;
    this.landing = await signOut(this.client);
    this.leaving = false;
  }

  protected override render(): TemplateResult {
    const seated = this.landing?.seated === true;
    return html`
      <header class="top">
        <hill-mark scale="2"></hill-mark>
        <span class="name">${this.name}</span>
        ${this.build === null ? nothing : html`<span class="build">${this.build}</span>`}
        <span class="spacer"></span>
        ${seated ? html`<button type="button" class="out" ?disabled=${this.leaving} @click=${() => void this.leave()}>sign out</button>` : nothing}
      </header>
      <main class="view">${this.view()}</main>
    `;
  }

  private view(): TemplateResult | typeof nothing {
    const landing = this.landing;
    if (landing === undefined) return nothing;
    if (landing.seated) return html`<section class="empty"><p>The flock arrives in hill phase 2.</p></section>`;
    const words = gateWords(landing.refused);
    return html`
      <section class="gate">
        <hill-mark scale="6"></hill-mark>
        ${words.refused === null ? nothing : html`<p class="refused" role="alert">${words.refused}</p>`}
        <p class="say">${runs(words.say).map((run) => (run.code ? html`<code>${run.text}</code>` : run.text))}</p>
        <p class="keys">${words.keys}</p>
      </section>
    `;
  }
}

customElements.define("hill-mark", HillMark);
customElements.define("hill-app", HillApp);
