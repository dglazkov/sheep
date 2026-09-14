/**
 * The floors (collie phase 1): two values the collie carries, moved by
 * hand. This file imports nothing, on purpose: the command reads it in
 * Node and the collie's Worker (`packages/collie`) reads it in workerd,
 * so nothing here may reach for either runtime.
 */

/**
 * The `builtAt` of the oldest station whose routes the collie speaks, an
 * ISO time, read against the station's `x-sheep-build` header the way
 * `OLDEST_HOME` in `../home.ts` is read against it by `sheep` (shear phase
 * 1), with its own value. It is the release that first carried bleat's
 * `GET /sessions/<id>`, one sheep's Directory row with its setup state
 * (bleat phase 0, main 1b31346, release c4b2089 built 2026-09-12T03:08:08Z):
 * the collie's `SheepCommands.session`. Moved when the collie starts to
 * need a station route or answer shape newer than this.
 */
export const OLDEST_SHEEP_HOME = "2026-09-12T03:08:08Z";

/**
 * The isocan commit the brain is pinned at: the `isocan` dependency of
 * `packages/collie`, a release commit (collie phase 0's finding: the
 * module's `browser` condition names a bundle built on `release` only).
 * Moved with the pin, which `/isocan-bump` does and says so.
 */
export const ISOCAN_PIN = "2f15360e";
