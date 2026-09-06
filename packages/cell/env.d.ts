declare namespace Cloudflare {
  interface Env {
    SESSION_CELL: DurableObjectNamespace<import("./src/cell.ts").SessionCell>;
    DIRECTORY: DurableObjectNamespace<import("./src/directory.ts").Directory>;
    /** Pen: the Containers binding, bound only in the `pen` environment. Absent, this home has no container. */
    PEN_CONTAINER?: DurableObjectNamespace<import("./src/pen/container.ts").PenContainer>;
    /** Pen phase 5: the Worker Loader, tier 1. Absent, `node` has no isolate and the table says so. */
    LOADER?: WorkerLoader;
    /** Bearer token every request must carry. */
    SHEEP_TOKEN?: string;
    /** "1" allows requests with no token, for local use only. */
    SHEEP_ALLOW_ANONYMOUS?: string;
    /** "faux" runs pi-ai's scripted provider instead of a real one. */
    SHEEP_PROVIDER?: string;
    SHEEP_MODEL?: string;
    SHEEP_ANTHROPIC_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    /** Pen: this home's own origin, which a container dials back to (`https://sheep-pen.<you>.workers.dev`; locally `http://host.docker.internal:8787`). */
    PEN_CELL_ORIGIN?: string;
    /** Pen: how long a container stays up after its last activity, `"10m"`, `"30s"`, `"1h"`. Default ten minutes. */
    PEN_IDLE?: string;
    /** Pen: seconds a started container has to dial in. Default 90. */
    PEN_START_TIMEOUT?: string;
    /** Pen: seconds a container has to answer `kill` before it is given up. Default 10. */
    PEN_KILL_TIMEOUT?: string;
    /** Pen: this home's container budget in minutes. Unset, no budget. */
    PEN_BUDGET_MINUTES?: string;
    /** Pen phase 5: the CPU one tier-1 run may spend, in ms. Default 10000. Enforced by the platform's runtime, not the local one. */
    PEN_ISOLATE_CPU_MS?: string;
    /**
     * Pen: the home's git credential, a secret. The container's helper asks the cell for it at push time and the
     * broker hands it over once per request; it is in no row, no frame the model sees, and no file. Unset, a push is
     * refused by name. A fine-grained token to one repository, contents read and write, is enough.
     */
    PEN_GIT_TOKEN?: string;
    /** Pen: the one host `PEN_GIT_TOKEN` is for. Default `github.com`. */
    PEN_GIT_HOST?: string;
    /** Pen: who the container's commits are by. Defaults `sheep` and `sheep@example.invalid`. */
    PEN_GIT_AUTHOR_NAME?: string;
    PEN_GIT_AUTHOR_EMAIL?: string;
  }
}
interface Env extends Cloudflare.Env {}
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
