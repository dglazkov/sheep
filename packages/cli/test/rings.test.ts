/**
 * The guard on the inner rings. `scripts/rings.mjs` writes down which ring
 * every test file is in, because a list is readable and a regex is not; this
 * keeps the list honest by reading the files it names and comparing what they
 * say with what they do.
 *
 * Three ways it can go wrong, and all three fail here rather than on a slow
 * runner three commits later: a new test file in no ring at all, so a ring
 * would quietly not run it; a file in the wrong ring, so `--ring checkout`
 * starts a `wrangler dev`; and a file that grew a `startHome` or a `spawn`
 * where it had none, which is the drift that put four-second journey walks
 * under a five-second timeout in the first place.
 *
 * This lives in the CLI's suite because the release manifest's guard does
 * too: the package that ships the command is where the repository's own
 * rules are checked.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { audit, CI_RINGS, RING_NAMES, RING_ON_CI, RINGS, ringOf } from "../../../scripts/rings.mjs";

const root = new URL("../../../", import.meta.url).pathname;

/** Every test file in the repository, found the way a person would find them. */
function everyTestFile(): string[] {
  const found: string[] = [];
  for (const pkg of readdirSync(join(root, "packages"))) {
    const dir = join(root, "packages", pkg, "test");
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) if (entry.endsWith(".test.ts")) found.push(`packages/${pkg}/test/${entry}`);
  }
  return found.sort();
}

describe("the inner rings", () => {
  const files = everyTestFile();

  it("finds every test file in the repository, and there are some", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain("packages/cell/test/eyes.test.ts");
    expect(files).toContain("packages/cli/test/journey5.test.ts");
    expect(files).toContain("packages/pen/test/git.test.ts");
  });

  it("puts every test file in exactly one ring", () => {
    const missing = files.filter((file) => ringOf(file) === undefined);
    expect(missing, `these test files are in no ring; add each to scripts/rings.mjs: ${missing.join(", ")}`).toEqual([]);

    const declared = RING_NAMES.flatMap((ring) => RINGS[ring]);
    expect(new Set(declared).size, "a file is listed in more than one ring").toBe(declared.length);
  });

  it("names no file that is not there", () => {
    const declared = RING_NAMES.flatMap((ring) => RINGS[ring]);
    const gone = declared.filter((file) => !files.includes(file));
    expect(gone, `scripts/rings.mjs names files that do not exist: ${gone.join(", ")}`).toEqual([]);
  });

  it("agrees with what each file actually does", () => {
    const wrong = audit(root, files)
      .filter((row) => row.declared !== row.evidenced)
      .map((row) => `${row.file}: listed under ${row.declared}, but its source needs ${row.evidenced}`);
    expect(wrong, `move these in scripts/rings.mjs:\n  ${wrong.join("\n  ")}`).toEqual([]);
  });

  it("makes every ring say whether CI runs it, so silence never means no", () => {
    // A ring added later without an entry here would be left out of CI's run
    // by omission rather than by decision. This is the line that stops that.
    for (const ring of RING_NAMES) expect(RING_ON_CI[ring], `add ${ring} to RING_ON_CI in scripts/rings.mjs`).toBeTypeOf("boolean");
    expect(Object.keys(RING_ON_CI).sort()).toEqual([...RING_NAMES].sort());
  });

  it("keeps the home ring out of CI, and everything else in it", () => {
    // The workflow runs `pnpm test --ci`, which is exactly CI_RINGS. If that
    // changes, it changes here first, with a reason in the commit.
    expect(CI_RINGS).toEqual(["checkout", "command"]);
    expect(RING_ON_CI.home).toBe(false);
  });

  it("keeps the home ring small, since each of its files starts a wrangler dev", () => {
    // Not a style rule: every file here costs a home start, and the ring's
    // whole point is that the cost is visible. If this needs raising, raise it
    // deliberately and say why in the commit.
    expect(RINGS.home.length).toBeLessThanOrEqual(4);
  });
});
