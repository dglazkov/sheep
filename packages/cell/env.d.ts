declare namespace Cloudflare {
  interface Env {
    SESSION_CELL: DurableObjectNamespace<import("./src/cell.ts").SessionCell>;
    DIRECTORY: DurableObjectNamespace<import("./src/directory.ts").Directory>;
    /** Bearer token every request must carry. */
    LAMB_TOKEN?: string;
    /** "1" allows requests with no token, for local use only. */
    LAMB_ALLOW_ANONYMOUS?: string;
    /** "faux" runs pi-ai's scripted provider instead of a real one. */
    LAMB_PROVIDER?: string;
    LAMB_MODEL?: string;
    LAMB_ANTHROPIC_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
  }
}
interface Env extends Cloudflare.Env {}
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
