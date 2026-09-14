/**
 * What `collie` says as it ends (collie phase 1): the tip's notice and the
 * skew line, each once, on stderr, exactly as `sheep` says them through
 * `sayAtExit` in `../tip.ts`, and through the same said file,
 * `~/.sheep/tip.json`. The package is one, so the notice is one: a tip
 * `sheep` already announced is not announced again here, and the other way
 * round. The skew line compares the collie Worker's `x-collie-build` with
 * this command's build, by `skewLine`'s own rule (both stamped, the times
 * differ, not one clean commit), in the collie's words: `collie deploy` is
 * the fix for an older Worker, the install for an older command.
 *
 * The pair it was last said for is kept under `collieSkew`, beside
 * `sheep`'s `skew`, so the station's line and the collie's never take each
 * other's turn; `readSaid` keeps both, so neither command's write erases
 * the other's.
 */
import { type BuildSide, cliBuild, describeBuild, skewLine } from "../local.js";
import { noticeLine, readSaid, type Said, saidPath, tipUrl, underCi, writeSaid } from "../tip.js";

/** The collie's skew line, or nothing: `skewLine`'s rule, the collie's words. */
export function collieSkewLine(worker: BuildSide, cli: BuildSide): string | undefined {
  if (skewLine(worker, cli, false) === undefined) return undefined;
  if (worker.builtAt! < cli.builtAt!) return `collie: the collie's build ${describeBuild(worker)} is older than this command's ${describeBuild(cli)}; \`collie deploy\` from this package updates it\n`;
  return `collie: this command's build ${describeBuild(cli)} is older than the collie's ${describeBuild(worker)}; \`npm install -g github:dglazkov/sheep#release\` updates it\n`;
}

/** The text for stderr as the command ends, and the said file brought up to date. Nothing under `CI`. */
export function sayAtCollieExit(worker: BuildSide | undefined, path: string = saidPath()): string {
  if (underCi()) return "";
  const cli = cliBuild();
  const said = readSaid(path);
  const marks: Pick<Said, "noticed" | "collieSkew"> = {};
  let text = "";
  const notice = tipUrl() === undefined ? undefined : noticeLine(cli, said);
  if (notice !== undefined) {
    text += notice.replace(/^sheep: /, "collie: ");
    marks.noticed = said.tip!.commit;
  }
  if (worker !== undefined) {
    const skew = collieSkewLine(worker, cli);
    const pair = `${worker.commit}:${cli.commit}`;
    if (skew !== undefined && said.collieSkew !== pair) {
      text += skew;
      marks.collieSkew = pair;
    }
  }
  // Over the file as it is now, read again right before the write: a tip a child renamed in meanwhile is kept.
  if (text !== "") writeSaid({ ...readSaid(path), ...marks }, path);
  return text;
}
