/**
 * Shear phase 0: the said file, the day-old rule, and the notice, as pure
 * functions over scratch paths. Nothing is fetched and nothing is spawned;
 * `shear.test.ts` drives the same rules through the built command.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { noticeLine, readSaid, type Said, TIP_FRESH_MS, TIP_URL, tipDue, tipUrl, underCi, writeSaid } from "../src/tip.js";

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "sheep-tip-"));
  made.push(dir);
  return dir;
}

const COMMAND = { commit: "a2b17e7", builtAt: "2026-09-13T18:14:51Z" };
const NEWER = { commit: "5511bf9", builtAt: "2026-09-13T18:26:23Z", at: "2026-09-13T19:00:00.000Z" };

describe("the said file", () => {
  it("reads back what was written, whole, creating ~/.sheep when it is not there", () => {
    const path = join(scratch(), ".sheep", "tip.json");
    const said: Said = { tip: NEWER, noticed: "5511bf9", skew: "a2b17e7:5511bf9" };
    writeSaid(said, path);
    expect(readSaid(path)).toEqual(said);
    writeSaid({ noticed: "9e9e9e9" }, path);
    expect(readSaid(path)).toEqual({ noticed: "9e9e9e9" });
  });

  it("is empty when missing, unreadable, not JSON, or not an object; a field of the wrong shape is dropped alone", () => {
    const dir = scratch();
    expect(readSaid(join(dir, "none.json"))).toEqual({});
    mkdirSync(join(dir, "a-directory.json"));
    expect(readSaid(join(dir, "a-directory.json"))).toEqual({});
    writeFileSync(join(dir, "torn.json"), '{"tip": {"commit": "55');
    expect(readSaid(join(dir, "torn.json"))).toEqual({});
    writeFileSync(join(dir, "null.json"), "null");
    expect(readSaid(join(dir, "null.json"))).toEqual({});
    writeFileSync(join(dir, "mixed.json"), JSON.stringify({ tip: { commit: "5511bf9", builtAt: 7 }, noticed: 3, skew: "a:b" }));
    expect(readSaid(join(dir, "mixed.json"))).toEqual({ skew: "a:b" });
  });

  it("swallows a write it cannot make", () => {
    const dir = scratch();
    writeFileSync(join(dir, "file"), "");
    expect(() => writeSaid({ noticed: "x" }, join(dir, "file", "tip.json"))).not.toThrow();
  });
});

describe("the day-old rule", () => {
  const at = Date.parse(NEWER.at);
  it("fetches when no tip is kept, or the kept one is a day old or more, or its time does not parse", () => {
    expect(tipDue({}, at)).toBe(true);
    expect(tipDue({ tip: NEWER }, at + TIP_FRESH_MS)).toBe(true);
    expect(tipDue({ tip: NEWER }, at + 3 * TIP_FRESH_MS)).toBe(true);
    expect(tipDue({ tip: { ...NEWER, at: "yesterday" } }, at)).toBe(true);
  });

  it("does not fetch while the kept tip is less than a day old", () => {
    expect(tipDue({ tip: NEWER }, at)).toBe(false);
    expect(tipDue({ tip: NEWER }, at + TIP_FRESH_MS - 1)).toBe(false);
  });
});

describe("noticeLine", () => {
  it("says the line for a newer tip not yet noticed", () => {
    expect(noticeLine(COMMAND, { tip: NEWER })).toBe(
      "sheep: a newer build 5511bf9 (2026-09-13T18:26:23Z) is out; this command is a2b17e7 (2026-09-13T18:14:51Z); `npm install -g github:dglazkov/sheep#release` updates it\n",
    );
    expect(noticeLine(COMMAND, { tip: NEWER, noticed: "0000000" })).toBeDefined();
  });

  it("says nothing for an equal tip, an older one, one already noticed, this command's own commit, or a command with no time", () => {
    expect(noticeLine(COMMAND, { tip: { ...COMMAND, at: NEWER.at } })).toBeUndefined();
    expect(noticeLine(COMMAND, { tip: { commit: "1234567", builtAt: COMMAND.builtAt, at: NEWER.at } })).toBeUndefined();
    expect(noticeLine(COMMAND, { tip: { commit: "1234567", builtAt: "2026-09-12T00:00:00Z", at: NEWER.at } })).toBeUndefined();
    expect(noticeLine(COMMAND, { tip: NEWER, noticed: NEWER.commit })).toBeUndefined();
    expect(noticeLine(COMMAND, { tip: { ...NEWER, commit: COMMAND.commit } })).toBeUndefined();
    expect(noticeLine({ commit: "0.0.0-checkout", builtAt: null }, { tip: NEWER })).toBeUndefined();
    expect(noticeLine(COMMAND, {})).toBeUndefined();
  });
});

describe("the switches", () => {
  it("fetches the release branch's manifest unless SHEEP_TIP names another URL, and nothing at all for SHEEP_TIP=0", () => {
    expect(TIP_URL).toBe("https://raw.githubusercontent.com/dglazkov/sheep/release/package.json");
    expect(tipUrl({})).toBe(TIP_URL);
    expect(tipUrl({ SHEEP_TIP: "" })).toBe(TIP_URL);
    expect(tipUrl({ SHEEP_TIP: "http://127.0.0.1:1/tip.json" })).toBe("http://127.0.0.1:1/tip.json");
    expect(tipUrl({ SHEEP_TIP: "0" })).toBeUndefined();
  });

  it("reads CI as set for anything but empty, 0, or false", () => {
    expect(underCi({})).toBe(false);
    for (const value of ["", "0", "false", "FALSE"]) expect(underCi({ CI: value }), value).toBe(false);
    for (const value of ["1", "true", "github"]) expect(underCi({ CI: value }), value).toBe(true);
  });
});
