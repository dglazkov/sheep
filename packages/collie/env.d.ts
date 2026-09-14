declare namespace Cloudflare {
  interface Env {
    /** The collie: one object, by name `collie`, that holds every room (collie phase 1). */
    COLLIE: DurableObjectNamespace<import("./src/collie.ts").Collie>;
    /** The bearer every route but `GET /` requires; `collie setup` mints it, `collie local` writes it into `.dev.vars`. */
    COLLIE_TOKEN?: string;
    /** The station's address, where the collie's sheep live: the kennel's `home`. */
    COLLIE_SHEEP_HOME?: string;
    /** The station's bearer token: the kennel's `token`. */
    COLLIE_SHEEP_TOKEN?: string;
    /** How far ahead the alarm is armed while on, in ms; thirty seconds, a lap of the room's log watch. A test sets it long. */
    COLLIE_LAP_MS?: string;
  }
}
interface Env extends Cloudflare.Env {}
/**
 * The build stamp, defined into the released Worker by `scripts/bundle.mjs` through wrangler's `--define` as a JSON string
 * of `{ commit, builtAt }`, as `SHEEP_BUILD` is for the station. A checkout's `wrangler dev` and the test pool define
 * nothing, so it is undefined there and the header names `0.0.0-checkout`.
 */
declare const COLLIE_BUILD: string | undefined;
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
