/**
 * The page (hill phases 1 and 2): one shell, Lit, drawn into the light DOM
 * so the one stylesheet (`hill.css`) styles all of it. The shell is the top
 * bar, the mark, the station's name and build, and sign out once seated;
 * under it, the gate or the flock (`flock-view.ts`). The shell owns the
 * address: a row's click pushes `/hill/s/<id>`, `popstate` returns, and a
 * reload or a pasted link opens the same view straight.
 *
 * Nothing here holds or sends a token: the flow asks the home through
 * `home.ts`, whose requests carry the browser's own cookie and no header of
 * the page's.
 */
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { FLOCK_PATH, type Route, routeOf } from "./flock.ts";
import "./flock-view.ts";
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
  static override properties = { landing: { state: true }, build: { state: true }, leaving: { state: true }, route: { state: true } };
  declare landing: Landing | undefined;
  declare build: string | null;
  declare leaving: boolean;
  declare route: Route;
  private readonly client = homeClient();
  private readonly name = stationName(location.hostname);
  private readonly onPop = (): void => {
    this.route = routeOf(location.pathname);
  };

  constructor() {
    super();
    this.landing = undefined;
    this.build = null;
    this.leaving = false;
    this.route = routeOf(location.pathname);
    this.addEventListener("hill-go", (event) => this.go((event as CustomEvent<string>).detail));
    this.addEventListener("hill-build", (event) => (this.build = buildLabel((event as CustomEvent<string>).detail)));
    // The seat gone while the page was open (signed out elsewhere, or thirty days): the gate, with no reason.
    this.addEventListener("hill-seatless", () => (this.landing = { seated: false, refused: null }));
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("popstate", this.onPop);
    document.title = `${this.name} · the hill`;
    void land(location.href, this.client, (address) => history.replaceState(history.state, "", address)).then(({ landing, build }) => {
      this.landing = landing;
      this.build = buildLabel(build);
    });
  }

  /** A view opened from the page: the address pushed, so the back button returns to where this was. */
  private go(address: string): void {
    if (address !== `${location.pathname}${location.search}`) history.pushState({ hill: true }, "", address);
    this.route = routeOf(location.pathname);
  }

  /** The station's name, seated: the flock, pushed. A click the browser should keep (a new tab) is left to it. */
  private toFlock(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    this.go(FLOCK_PATH);
  }

  /** `‹ flock`: back, when the flock is what this page came from; the flock pushed, when the sheep's address was opened straight. */
  private back(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if ((history.state as { hill?: boolean } | null)?.hill === true) history.back();
    else this.go(FLOCK_PATH);
  }

  private async leave(): Promise<void> {
    this.leaving = true;
    this.landing = await signOut(this.client);
    this.leaving = false;
  }

  protected override render(): TemplateResult {
    const seated = this.landing?.seated === true;
    const atSheep = seated && this.route.view === "sheep";
    return html`
      <header class="top ${atSheep ? "at-sheep" : ""}">
        <hill-mark scale="2"></hill-mark>
        ${atSheep ? html`<a class="back" href=${FLOCK_PATH} @click=${(event: MouseEvent) => this.back(event)}>‹ flock</a>` : nothing}
        ${seated
          ? html`<a class="name" href=${FLOCK_PATH} @click=${(event: MouseEvent) => this.toFlock(event)}>${this.name}</a>`
          : html`<span class="name">${this.name}</span>`}
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
    if (landing.seated) return html`<hill-flock .client=${this.client} .route=${this.route}></hill-flock>`;
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
