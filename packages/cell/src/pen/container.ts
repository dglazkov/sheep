/**
 * The Durable Object the Containers binding attaches a container to: one
 * per cell at most, named by the session id, holding the container's
 * lifecycle and nothing else. The cell calls `ensure` to start it with
 * the cell's address and a minted token in its environment, or to renew
 * its idle clock when one is already running; the container's own
 * `sleepAfter` (`PEN_IDLE`, default ten minutes) stops it, and the cell
 * learns of the stop from its socket. The cell never fetches into the
 * container: the container is a client of the cell.
 *
 * The container's minutes are reported here, from `onStart` and `onStop`,
 * because they are what the platform bills and they fire whether or not
 * the cell that rented the container is still in memory.
 *
 * The author of the container's commits is the home's configuration
 * (`PEN_GIT_AUTHOR_NAME`, `PEN_GIT_AUTHOR_EMAIL`), given to the container
 * as the four variables git reads without any config file, so no file in
 * the checkout or the image carries an identity. Journey 2 step 4.
 */
import { Container } from "@cloudflare/containers";
import { CELL_URL_ENV, TOKEN_ENV } from "@lamb/pen/protocol";

export const DEFAULT_IDLE = "10m";
/** Who commits when the home says nothing: a name that is plainly nobody's, so a commit never fails for want of one. */
export const DEFAULT_AUTHOR = { name: "lamb", email: "lamb@example.invalid" } as const;

/** The author and committer as git reads them from the environment. */
export function authorEnv(env: { PEN_GIT_AUTHOR_NAME?: string | undefined; PEN_GIT_AUTHOR_EMAIL?: string | undefined }): Record<string, string> {
  const name = env.PEN_GIT_AUTHOR_NAME?.trim() || DEFAULT_AUTHOR.name;
  const email = env.PEN_GIT_AUTHOR_EMAIL?.trim() || DEFAULT_AUTHOR.email;
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
}

export class PenContainer extends Container<Env> {
  /** The agent's health port: `start()` returns once it listens, so "started" means the agent process is up. */
  override defaultPort = 8080;
  override sleepAfter: string | number = DEFAULT_IDLE;

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.sleepAfter = env.PEN_IDLE !== undefined && env.PEN_IDLE !== "" ? env.PEN_IDLE : DEFAULT_IDLE;
  }

  private get sessionId(): string {
    return this.ctx.id.name ?? "?";
  }

  private get running(): boolean {
    return this.ctx.container?.running === true;
  }

  /** Starts the container for this cell when none runs; renews the idle clock when one does. */
  async ensure(args: { cellUrl: string; token: string }): Promise<{ started: boolean }> {
    if (this.running) {
      this.renewActivityTimeout();
      return { started: false };
    }
    // The cell's address and the minted token, and the author; never a home secret: the helper asks for those, one at a time.
    await this.start({ envVars: { [CELL_URL_ENV]: args.cellUrl, [TOKEN_ENV]: args.token, ...authorEnv(this.env) }, enableInternet: true });
    return { started: true };
  }

  /** Renews the idle clock of a running container; starts nothing. */
  async renew(): Promise<{ running: boolean }> {
    const running = this.running;
    if (running) this.renewActivityTimeout();
    return { running };
  }

  override onStart(): void {
    console.info(`[pen ${this.sessionId}] container started`);
    this.env.DIRECTORY.getByName("home")
      .containerOpened(this.sessionId, Date.now())
      .catch((error: unknown) => console.error(`[pen ${this.sessionId}] could not report the start:`, error instanceof Error ? error.message : error));
  }

  override onStop(params: { exitCode: number; reason: string }): void {
    console.info(`[pen ${this.sessionId}] container stopped (${params.reason}, exit ${params.exitCode})`);
    this.env.DIRECTORY.getByName("home")
      .containerClosed(this.sessionId, Date.now())
      .catch((error: unknown) => console.error(`[pen ${this.sessionId}] could not report the stop:`, error instanceof Error ? error.message : error));
  }

  override async onActivityExpired(): Promise<void> {
    console.info(`[pen ${this.sessionId}] idle for ${this.sleepAfter}; stopping the container`);
    await super.onActivityExpired();
  }

  override onError(error: unknown): void {
    console.error(`[pen ${this.sessionId}] container error:`, error instanceof Error ? error.message : error);
  }
}
