/**
 * Hill phase 1: the gate's three sentences as pure functions, and the names
 * the top bar carries before any route behind the door has answered. The
 * refusals are drawn from the Worker's own constants, so a sentence changed
 * there changes here, and this names the words the storyboard shows.
 */
import { describe, expect, it } from "vitest";
import { PASS_EXPIRED, PASS_USED } from "../../cell/src/hill-words.ts";
import { buildLabel, gateWords, refusalOf, runs, stationName } from "../src/words.ts";

describe("the gate's words", () => {
  it("with no pass: the sentence to climb by, and the dim line", () => {
    expect(gateWords(null)).toEqual({
      refused: null,
      say: "To climb the hill, run `sheep hill` at your terminal, or ask your agent to, and open the link it prints.",
      keys: "The link works once and for two minutes. Your seat stays for thirty days.",
    });
  });

  it("a pass used: the reason in red, and the instruction under it, from the Worker's sentence", () => {
    expect(gateWords("used")).toEqual({
      refused: "That pass was already used.",
      say: "Run `sheep hill` for another and open the link it prints.",
      keys: "The link works once and for two minutes. Your seat stays for thirty days.",
    });
  });

  it("a pass expired: the other reason, the same instruction", () => {
    expect(gateWords("expired")).toEqual({
      refused: "That pass expired.",
      say: "Run `sheep hill` for another and open the link it prints.",
      keys: "The link works once and for two minutes. Your seat stays for thirty days.",
    });
  });

  it("knows a refusal by the Worker's body, and reads anything else refused as a pass used", () => {
    expect(refusalOf(PASS_USED)).toBe("used");
    expect(refusalOf(PASS_EXPIRED)).toBe("expired");
    expect(refusalOf(`${PASS_EXPIRED}\n`)).toBe("expired");
    expect(refusalOf("forbidden")).toBe("used");
  });

  it("marks the command in a sentence as code", () => {
    expect(runs(gateWords("used").say)).toEqual([
      { text: "Run ", code: false },
      { text: "sheep hill", code: true },
      { text: " for another and open the link it prints.", code: false },
    ]);
  });
});

describe("the top bar's names", () => {
  it("the station's name is its address's first label; the local home has none", () => {
    expect(stationName("sheep-2.glazkov.workers.dev")).toBe("sheep-2");
    expect(stationName("127.0.0.1")).toBe("local home");
    expect(stationName("localhost")).toBe("local home");
  });

  it("the build from the header: a release's commit and day, a checkout's commit, and nothing for no header", () => {
    expect(buildLabel("3b38f11 2026-09-14T18:02:11Z")).toBe("3b38f11 · 14 Sep");
    expect(buildLabel("0.0.0-checkout")).toBe("0.0.0-checkout");
    expect(buildLabel(null)).toBeNull();
    expect(buildLabel("")).toBeNull();
  });
});
