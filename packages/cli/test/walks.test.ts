/**
 * The guard on the account ring's walks (draft phase 0). `scripts/walks.mjs`
 * writes down which steps each walk runs, because a table is readable and
 * the script is 6000 lines; this keeps the table honest by reading the
 * script for the steps it prints and comparing.
 *
 * Two ways it can go wrong, and both fail here rather than on the
 * shepherd's account an hour later: a walk naming a step the script lacks
 * (a step renamed, or never moved into its walk), and the script printing a
 * step no walk names (a step added to the ring and left out of the table,
 * so no walk would run it). Beside those, the names: eleven walks, every
 * station name under the platform's length, and the sibling rule setting a
 * sibling aside while a leftover of the walk's own is still found.
 *
 * This lives in the CLI's suite because the rings' guard does too: the
 * package that ships the command is where the repository's own rules are
 * checked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RINGS } from "../../../scripts/rings.mjs";
import { DOG_RING_STEPS, EVERY_WALK, importedBeside, JOBS_DEFAULT, lackingOf, leftovers, notCheckedIn, readOutcome, reportLines, setOf, listText, needsOf, ownNames, PACKAGE_RING_STEPS, prefixOf, rerunLine, SHARED_STEPS, siblingsAside, stationName, stepsInScript, stepsOf, WALK_NAMES, WALKS, walksOf } from "../../../scripts/walks.mjs";

const root = new URL("../../../", import.meta.url).pathname;
const script = readFileSync(join(root, "scripts", "hermetic.mjs"), "utf8");

/** A 7-character sha, as the ring cuts one for a station's name. */
const sha7 = "0123abc";

describe("the account ring's walks", () => {
  it("is the eleven, in the design's order", () => {
    expect(WALK_NAMES).toEqual(["upgrade", "station", "second", "pasture", "fold", "spool", "bleat", "bell", "tether", "stile", "collie"]);
    expect(Object.keys(WALKS).sort()).toEqual([...WALK_NAMES].sort());
    for (const name of WALK_NAMES) {
      expect(WALKS[name].steps.length, `${name} names no steps`).toBeGreaterThan(0);
      expect(typeof WALKS[name].about, `${name} has no sentence`).toBe("string");
      expect(WALKS[name].minutes, `${name} has no estimate`).toBeGreaterThan(0);
      expect(needsOf(name).length).toBeGreaterThan(0);
    }
  });

  it("is in the checkout ring, by name", () => {
    expect(RINGS.checkout).toContain("packages/cli/test/walks.test.ts");
  });

  it("names, in every walk, only steps the script prints", () => {
    const printed = stepsInScript(script);
    const missing = WALK_NAMES.flatMap((name) => stepsOf(name).filter((step) => !printed.has(step)).map((step) => `${name}: ${step}`));
    expect(missing, `these walks name steps scripts/hermetic.mjs never prints (ring.ok/fail/skip, or a step given by name): ${missing.join(", ")}`).toEqual([]);
  });

  it("puts every step the script prints, the package and dog rings' aside, in a walk", () => {
    const printed = [...stepsInScript(script)].filter((step) => !PACKAGE_RING_STEPS.includes(step) && !DOG_RING_STEPS.includes(step));
    expect(printed.length).toBeGreaterThan(30);
    const orphans = printed.filter((step) => walksOf(step).length === 0);
    expect(orphans, `scripts/hermetic.mjs prints these steps and no walk in scripts/walks.mjs names them: ${orphans.join(", ")}`).toEqual([]);
  });

  it("gives each journey's step to exactly one walk, and names the shared ones", () => {
    const shared = Object.keys(SHARED_STEPS);
    const everywhere = WALK_NAMES.flatMap((name) => stepsOf(name));
    const twice = [...new Set(everywhere)].filter((step) => walksOf(step).length > 1 && !shared.includes(step));
    expect(twice, `these steps are in more than one walk and not written down as shared: ${twice.join(", ")}`).toEqual([]);
    for (const step of shared) expect(walksOf(step).length, `${step} is written down as shared but is in ${walksOf(step).length} walk(s)`).toBeGreaterThan(1);
    // Within one walk, a step once: the order is the order it runs.
    for (const name of WALK_NAMES) expect(new Set(stepsOf(name)).size, `${name} names a step twice`).toBe(stepsOf(name).length);
    expect(EVERY_WALK).toEqual(["walk"]);
  });

  it("keeps the package ring's names to itself", () => {
    // Those names the guard must set aside are printed by the script, else the list is stale.
    const printed = stepsInScript(script);
    const stale = PACKAGE_RING_STEPS.filter((step) => !printed.has(step));
    expect(stale, `PACKAGE_RING_STEPS names steps the script no longer prints: ${stale.join(", ")}`).toEqual([]);
    expect(DOG_RING_STEPS).toEqual([]);
  });

  it("names every station under the platform's length, with a 7-character sha", () => {
    // Cloudflare refuses a Worker name past 63 characters; the collie's `<station>-t-collie` is the longest this project makes.
    for (const name of WALK_NAMES) {
      const station = stationName(sha7, name);
      // The collie's is -c: its Worker's address has to fit the stile's 80-column screen, off which co3 reads it whole.
      expect(station).toBe(`sheep-hermetic-${sha7}-${name === "collie" ? "c" : name}`);
      const names = ownNames(station, name);
      for (const made of [...names.workers, ...names.namespaces]) {
        expect(made.length, `${made} is ${made.length} characters`).toBeLessThanOrEqual(63);
        expect(made.startsWith(prefixOf(sha7)), `${made} is not under the sibling prefix`).toBe(true);
      }
    }
    expect(ownNames(stationName(sha7, "bell"), "bell")).toEqual({ workers: [`sheep-hermetic-${sha7}-bell`], namespaces: [`sheep-hermetic-${sha7}-bell-join`] });
    expect(ownNames(stationName(sha7, "stile"), "stile")).toEqual({ workers: [`sheep-hermetic-${sha7}-stile-t`], namespaces: [`sheep-hermetic-${sha7}-stile-t-join`] });
    expect(ownNames(stationName(sha7, "collie"), "collie")).toEqual({ workers: [`sheep-hermetic-${sha7}-c-t`, `sheep-hermetic-${sha7}-c-t-collie`], namespaces: [`sheep-hermetic-${sha7}-c-t-join`] });
    // The collie's Worker's address on the stile's screen: 80 columns, and the step line has 15 of them before the address.
    expect(`https://sheep-hermetic-${sha7}-c-t-collie.dglazkov.workers.dev`.length).toBeLessThanOrEqual(80 - 15);
  });

  it("sets siblings aside, keeps a stranger, and still finds a leftover of the walk's own", () => {
    const station = stationName(sha7, "bell");
    const listing = {
      workers: ["sheep-2", `sheep-hermetic-${sha7}-fold`, `sheep-hermetic-${sha7}-stile-t`, `sheep-hermetic-${sha7}-collie-t-collie`, station, "sheep-hermetic-9999999-bell"].sort(),
      applications: [
        { name: "sheep-2", id: "app-2" },
        { name: `sheep-hermetic-${sha7}-fold`, id: "app-fold" },
        { name: station, id: "app-bell" },
      ],
      namespaces: ["sheep-2-join", `sheep-hermetic-${sha7}-fold-join`, `${station}-join`].sort(),
    };
    // The sibling rule: every name under the prefix gone, the walk's own included; the stranger and another release's walk kept.
    expect(siblingsAside(listing, sha7)).toEqual({
      workers: ["sheep-2", "sheep-hermetic-9999999-bell"],
      applications: [{ name: "sheep-2", id: "app-2" }],
      namespaces: ["sheep-2-join"],
    });
    // Two listings that differ only in siblings compare equal under the rule; one that gained a stranger does not.
    const before = { workers: ["sheep-2"], applications: [{ name: "sheep-2", id: "app-2" }], namespaces: ["sheep-2-join"] };
    expect(JSON.stringify(siblingsAside(listing, sha7))).not.toBe(JSON.stringify(siblingsAside(before, sha7)));
    const onlySiblings = { ...listing, workers: listing.workers.filter((worker) => worker !== "sheep-hermetic-9999999-bell") };
    expect(JSON.stringify(siblingsAside(onlySiblings, sha7))).toBe(JSON.stringify(siblingsAside(before, sha7)));
    // The leftover: the walk's own names are still found, exactly, and a sibling's are not.
    expect(leftovers(listing, ownNames(station, "bell"))).toEqual([`Worker ${station}`, `container application ${station} (app-bell)`, `KV namespace ${station}-join`]);
    expect(leftovers(before, ownNames(station, "bell"))).toEqual([]);
    expect(leftovers(listing, ownNames(stationName(sha7, "spool"), "spool"))).toEqual([]);
  });

  it("has every file the script imports from beside itself copied into the containers", () => {
    // The second walk found this on the account (draft phase 0): the script had begun importing walks.mjs, and every build
    // context copied the script alone. copyScriptInto derives its copies from the imports; the Dockerfile has to name each.
    const beside = importedBeside(script);
    expect(beside).toContain("walks.mjs");
    const dockerfile = readFileSync(join(root, "scripts", "hermetic", "Dockerfile"), "utf8");
    const notCopied = beside.filter((name) => !dockerfile.includes(`COPY ${name} /ring/${name}`));
    expect(notCopied, `scripts/hermetic/Dockerfile must COPY these beside hermetic.mjs: ${notCopied.join(", ")}`).toEqual([]);
  });

  it("prints a rerun line the shepherd's allow rule matches", () => {
    expect(rerunLine("bell", "refs/remotes/origin/release")).toBe("pnpm hermetic --ring account --walk bell --yes refs/remotes/origin/release");
    expect(rerunLine("upgrade", "refs/heads/release", ["--older", "abc1234"])).toBe("pnpm hermetic --ring account --walk upgrade --yes --older abc1234 refs/heads/release");
    for (const name of WALK_NAMES) expect(rerunLine(name, "x").startsWith("pnpm hermetic --ring account ")).toBe(true);
  });

  it("holds, in the set, every walk the machine can run, from each combination of what it has", () => {
    // The five needs, with and without --collie: sixty-four machines. A walk is a member exactly when it lacks nothing;
    // the collie only when asked for; every walk is either a member or left out with why, in the table's order.
    for (let bits = 0; bits < 32; bits++) {
      const has = { docker: Boolean(bits & 1), env: bits & 2 ? ["LAMB_PLAYGROUND_TOKEN"] : [], key: Boolean(bits & 4), harness: Boolean(bits & 8), isocan: Boolean(bits & 16) };
      for (const collie of [false, true]) {
        const { members, leftOut } = setOf({ ...has, collie });
        const named = [...members, ...leftOut.map(({ walk }) => walk)];
        expect(named.sort()).toEqual([...WALK_NAMES].sort());
        expect(WALK_NAMES.filter((walk) => members.includes(walk))).toEqual(members);
        for (const walk of members) expect(lackingOf(walk, has), `${walk} is a member but lacks`).toEqual([]);
        for (const { walk, why } of leftOut) {
          if (walk === "collie" && !collie) expect(why).toContain("not named");
          else {
            expect(lackingOf(walk, has).length, `${walk} left out with nothing lacking`).toBeGreaterThan(0);
            for (const lack of lackingOf(walk, has)) expect(why).toContain(lack);
          }
        }
        expect(members.includes("second")).toBe(has.docker && has.harness);
        expect(members.includes("pasture")).toBe(has.env.length === 1);
        expect(members.includes("stile")).toBe(has.key && has.harness);
        expect(members.includes("collie")).toBe(collie && has.key && has.harness && has.isocan);
        for (const walk of ["upgrade", "station", "fold", "spool", "bleat", "bell", "tether"]) expect(members).toContain(walk);
      }
    }
    expect(JOBS_DEFAULT).toBe(4);
  });

  it("narrows the set to the walks named, the collie among them only when named or asked for", () => {
    const everything = { docker: true, env: ["LAMB_PLAYGROUND_TOKEN"], key: true, harness: true, isocan: true };
    expect(setOf({ ...everything, named: ["bell", "stile"] }).members).toEqual(["bell", "stile"]);
    expect(setOf({ ...everything, named: ["stile", "bell"] }).members).toEqual(["bell", "stile"]);
    expect(setOf({ ...everything, named: ["bell", "collie"] }).members).toEqual(["bell", "collie"]);
    expect(setOf({ ...everything, named: ["bell"], collie: true }).members).toEqual(["bell", "collie"]);
    expect(setOf({ ...everything, collie: true }).members).toEqual(WALK_NAMES);
    // A named walk the machine cannot run is left out, with why, and the rest run.
    const { members, leftOut } = setOf({ ...everything, docker: false, named: ["second", "fold"] });
    expect(members).toEqual(["fold"]);
    expect(leftOut).toEqual([{ walk: "second", why: "this machine lacks Docker" }]);
    expect(setOf({ ...everything, named: ["bell"] }).leftOut).toEqual([]);
  });

  it("reads a child's outcome from its last line, and a refusal from its first", () => {
    expect(readOutcome("ok    d1  …\n\naccount ring: ok (the bell walk, 12 lines held, 133s)\n", 0)).toEqual({ walk: "bell", status: "held", lines: 12, seconds: 133 });
    expect(readOutcome("FAIL  a8: git push (exit 1)\naccount ring: FAILED at a8 (the pasture walk, 91s)\npasture walk: failed at a8; …\n", 1)).toEqual({ walk: "pasture", status: "failed", step: "a8", seconds: 91 });
    expect(readOutcome("hermetic: the pasture walk needs LAMB_PLAYGROUND_TOKEN in the environment, and this machine lacks:\n  - …\n", 2)).toEqual({ status: "failed", step: "preflight", why: "the pasture walk needs LAMB_PLAYGROUND_TOKEN in the environment, and this machine lacks:" });
    expect(readOutcome("", 1)).toEqual({ status: "failed", step: "preflight", why: "exit 1 with no last line" });
    // A held line with a nonzero exit is not held: the exit code is the child's word.
    expect(readOutcome("account ring: ok (the bell walk, 12 lines held, 133s)\n", 1).status).toBe("failed");
  });

  it("reads the not-checked items out of a child's log", () => {
    const log = "ok    a6  …\n\nnot checked by the account ring:\n  - journey 1 step 2: a real key\n  - the other walks, each run alone: …\n\naccount ring: ok (the fold walk, 8 lines held, 214s)\n";
    expect(notCheckedIn(log)).toEqual(["journey 1 step 2: a real key", "the other walks, each run alone: …"]);
    expect(notCheckedIn("nothing here")).toEqual([]);
  });

  it("reports a mix of held, failed, and left-out walks, with the rerun line for each failure", () => {
    const outcomes = {
      upgrade: { walk: "upgrade", status: "held", lines: 14, seconds: 341 },
      station: { walk: "station", status: "failed", step: "s2", seconds: 120 },
      second: { walk: "second", status: "left out", why: "this machine lacks Docker" },
      pasture: { walk: "pasture", status: "failed", step: "a8", seconds: 91 },
      bell: { walk: "bell", status: "held", lines: 12, seconds: 133 },
      collie: { walk: "collie", status: "left out", why: "not named" },
    };
    const lines = reportLines(outcomes, (walk) => rerunLine(walk, "refs/remotes/origin/release"));
    expect(lines).toEqual([
      "  upgrade  held  14 lines  341s",
      "  station  FAILED at s2  120s",
      "  second   left out: this machine lacks Docker",
      "  pasture  FAILED at a8  91s",
      "  bell     held  12 lines  133s",
      "  collie   left out: not named",
      "run again, alone, each:",
      "  pnpm hermetic --ring account --walk station --yes refs/remotes/origin/release",
      "  pnpm hermetic --ring account --walk pasture --yes refs/remotes/origin/release",
    ]);
    expect(reportLines({ bell: outcomes.bell }, () => "")).toEqual(["  bell     held  12 lines  133s"]);
  });

  it("lists every walk with its steps and what it needs", () => {
    const text = listText();
    for (const name of WALK_NAMES) {
      expect(text).toContain(`  ${name}`);
      expect(text).toContain(WALKS[name].steps.join(" "));
      expect(text).toContain(`needs ${needsOf(name)}`);
    }
    expect(needsOf("second")).toContain("Docker");
    expect(needsOf("pasture")).toContain("LAMB_PLAYGROUND_TOKEN");
    expect(needsOf("collie")).toContain("dev.isocan.io");
    expect(needsOf("fold")).toBe("nothing");
  });
});
