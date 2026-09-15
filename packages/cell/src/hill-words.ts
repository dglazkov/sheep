/**
 * The words the hill's page and the Worker share (hill phase 1). This file
 * imports nothing: the Worker answers these sentences from `GET
 * /hill/seat`, and the page (`packages/hill`, bundled by esbuild for a
 * browser) imports the same constants to recognise the answer and to draw
 * the gate's refusal from them, so the two can never say different things.
 * `directory.ts` re-exports them, where hill phase 0 put them.
 */

/** The gate's sentence for a pass whose row is gone: taken already, or never minted (hill phase 0). */
export const PASS_USED = "that pass was already used; run sheep hill for another";

/** The gate's sentence for a pass older than two minutes (hill phase 0). */
export const PASS_EXPIRED = "that pass expired; run sheep hill for another";

/**
 * The gate a checkout with no build serves at `/hill/` (hill phase 1), in
 * place of a 404 that would read as the home being down: the page's files
 * are built by `pnpm build`, and until then the assets binding has no
 * `index.html` to hand back.
 */
export const NO_BUILD = "The hill has not been built here. Run pnpm build in this checkout, then reload.";
