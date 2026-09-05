declare namespace Cloudflare {
  interface Env {
    SESSION_CELL: DurableObjectNamespace<import("./src/index.ts").SessionCell>;
  }
}
interface Env extends Cloudflare.Env {}
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
