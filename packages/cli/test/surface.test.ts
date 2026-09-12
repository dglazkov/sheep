/**
 * The fence (stile phase 1): what a shepherd's surface may name.
 *
 * A **shepherd** sees `sheep setup`, the herd's verbs, `sheep home`,
 * `sheep home deploy` as the upgrade, and `sheep home delete`. A
 * **developer** of sheep also has the rig — the local home and its stop,
 * the scripted model, the container switch, `.dev.vars`, workerd, Docker,
 * and a fetched Chrome — and its words live in the README's developer half.
 * The design names the four documents a shepherd or their dog reads and
 * the words none of them may carry; this reads those four and asserts
 * each word's absence, so the fence is a guard and not a promise.
 *
 * It also walks every stop, the refusal that needs a person: the one
 * class that carries them, `Stop`, is constructed only inside `STOPS` in
 * `deploy.ts` (the source is read to prove it), so enumerating `STOPS` is
 * enumerating them all; each has the dog's line, the shepherd's
 * paragraph, `needs`, and the `--json` shape `cli.ts` prints. And no
 * sentence of any of it tells the shepherd to `export` a variable or
 * names their shell, which is the dog's voice for the shepherd to decode.
 *
 * Checkout ring: nothing is spawned; the words are imported and read.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Need, Stop, STOPS, stopJson, stopText } from "../src/deploy.js";
import { readGuide } from "../src/setup.js";
import { USAGE } from "../src/usage.js";

const repoRoot = new URL("../../../", import.meta.url).pathname;
const srcDir = new URL("../src/", import.meta.url).pathname;

/** The words of the rig, as the design lists them (journey 4 step 2). The list is the design's, and this test names it. */
const RIG_WORDS = ["home local", "home stop", "--faux", "--no-container", ".dev.vars", "workerd", "Docker", "Chrome"] as const;

/** The heading the README's developer half starts at; everything above it is the shepherd's. */
const DEVELOPER_HEADING = "## Developing sheep";

/** The shepherd's surface: the four documents the design names, by the name a reader of a failure would look for. */
function surface(): Record<string, string> {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const at = readme.indexOf(DEVELOPER_HEADING);
  return {
    "sheep --help (src/usage.ts)": USAGE,
    "sheep --agent-help (agent-guide.md)": readGuide(),
    "SKILL.md": readFileSync(join(repoRoot, "SKILL.md"), "utf8"),
    "README.md above its developer heading": at === -1 ? readme : readme.slice(0, at),
  };
}

/**
 * A sentence that tells the shepherd to set a variable in a shell, or
 * names their shell: `export NAME`, "your shell", "the shell ... runs
 * in", a shell's startup file. The verb `sheep export` is not one, nor
 * is the `bash` a sheep's tool is called.
 */
const SHELL_TALK: { name: string; pattern: RegExp }[] = [
  { name: "export of a variable", pattern: /\bexport\s+[A-Z_][A-Z0-9_]*\b/ },
  { name: "the shepherd's shell", pattern: /\b(?:your|their|the shepherd's) shell\b/i },
  { name: "a shell to run in", pattern: /\bthe shell\s+(?:`?sheep`?\s+)?(?:runs?|you run|I run)\s+in\b/i },
  { name: "in the shell", pattern: /\bin the shell\b/i },
  { name: "a shell's startup file", pattern: /\.(?:bashrc|zshrc|bash_profile|zprofile|profile)\b/ },
  { name: "source a file", pattern: /\bsource\s+\S+\.(?:env|sh)\b/ },
];

describe("the fence: the shepherd's surface names nothing of the rig", () => {
  it("reads four documents, and each is there and is not empty", () => {
    const documents = surface();
    expect(Object.keys(documents)).toHaveLength(4);
    for (const [name, text] of Object.entries(documents)) expect(text.length, name).toBeGreaterThan(500);
    // The README has a developer half, and the rig's words are in it: the fence moves words, it does not delete them.
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toContain(DEVELOPER_HEADING);
    const developer = readme.slice(readme.indexOf(DEVELOPER_HEADING));
    for (const word of ["home local", "home stop", "--faux", "--no-container", ".dev.vars", "Docker", "Chrome"]) expect(developer, `the developer half names ${word}`).toContain(word);
  });

  for (const word of RIG_WORDS) {
    it(`names no ${word}`, () => {
      for (const [name, text] of Object.entries(surface())) {
        const at = text.indexOf(word);
        expect(at, `${name} names the rig's "${word}": …${text.slice(Math.max(0, at - 60), at + 60)}…`).toBe(-1);
      }
    });
  }

  it("never tells the shepherd to export a variable, and names no shell", () => {
    for (const [name, text] of Object.entries(surface())) {
      for (const { name: what, pattern } of SHELL_TALK) {
        const found = pattern.exec(text);
        expect(found, `${name}: ${what}: …${found ? text.slice(Math.max(0, found.index - 60), found.index + 60) : ""}…`).toBeNull();
      }
    }
  });

  it("keeps `sheep home join`'s line in --help until stile phase 2 withdraws it", () => {
    expect(USAGE).toContain("  sheep home join <address> [--json]        a second machine's way in: the station's token is one line of stdin, piped,");
  });

  it("names sheep setup in every one of the four", () => {
    for (const [name, text] of Object.entries(surface())) expect(text, name).toContain("sheep setup");
  });
});

/** Every `.ts` file under `src`, for the scan that proves `STOPS` is every stop. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith(".ts") ? [path] : [];
  });
}

/** One of each stop, with a sample station name for the stops that take one. */
const EVERY_STOP: [string, Stop][] = Object.entries(STOPS).map(([name, make]) => [name, (make as (station: string) => Stop)("sheep-2")]);

describe("the stops: every exit 2 that needs a person has both parts", () => {
  it("constructs a Stop only inside STOPS, so walking STOPS walks them all", () => {
    const outside: string[] = [];
    let inside = 0;
    for (const path of sources(srcDir)) {
      const text = readFileSync(path, "utf8");
      const count = text.split("new Stop(").length - 1;
      if (count === 0) continue;
      if (!path.endsWith("/deploy.ts")) {
        outside.push(`${path}: ${count}`);
        continue;
      }
      // In deploy.ts, every construction is between `export const STOPS = {` and the `} as const;` that closes it.
      const start = text.indexOf("export const STOPS = {");
      const end = text.indexOf("} as const;", start);
      const within = text.slice(start, end).split("new Stop(").length - 1;
      inside = within;
      if (within !== count) outside.push(`${path}: ${count - within} outside STOPS`);
    }
    expect(outside).toEqual([]);
    expect(inside).toBe(EVERY_STOP.length);
    expect(EVERY_STOP.length).toBeGreaterThanOrEqual(4);
  });

  for (const [name, stop] of EVERY_STOP) {
    it(`${name}: the dog's line, the shepherd's paragraph, needs, and the --json shape`, () => {
      expect(stop).toBeInstanceOf(Stop);
      // The dog's line: third person, one line, what the command needed, and that nothing was made.
      expect(stop.message).toMatch(/^sheep home \w+ needs /);
      expect(stop.message).not.toContain("\n");
      expect(stop.message).toMatch(/nothing was (made|deleted)$/);
      expect(stop.message).not.toMatch(/\byou\b|\byour\b/i);
      // The shepherd's paragraph: second person, and the one command to type on a line of its own.
      expect(stop.shepherd).toMatch(/\byour?\b/);
      expect(stop.shepherd).toMatch(/\n {2}sheep (setup|home delete)\n/);
      // What it needs, from the three a stop can need.
      expect(stop.needs.length).toBeGreaterThan(0);
      for (const need of stop.needs) expect(["account", "key", "terminal"] satisfies Need[]).toContain(need);
      // Printed: the two parts, in order; as --json: exactly refused, needs, shepherd.
      expect(stopText(stop)).toBe(`sheep: ${stop.message}\nfor the shepherd: ${stop.shepherd}\n`);
      expect(JSON.parse(JSON.stringify(stopJson(stop)))).toEqual({ refused: stop.message, needs: stop.needs, shepherd: stop.shepherd });
      // And no shell talk in either part.
      for (const { name: what, pattern } of SHELL_TALK) {
        expect(pattern.test(stop.message), `${name}'s line: ${what}`).toBe(false);
        expect(pattern.test(stop.shepherd), `${name}'s paragraph: ${what}`).toBe(false);
      }
    });
  }
});
