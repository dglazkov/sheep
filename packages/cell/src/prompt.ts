/**
 * The system prompt. `systemPrompt(home)` is the cell's own, as lamb built
 * it and as it was at commit 1b4a42d, byte for byte: a pastureless sheep's
 * prompt is this and nothing more, and a test holds it as a literal.
 *
 * For a sheep born into a pasture, `cellSystemPrompt` appends the pasture
 * paragraph (its name, its repository and branch when it has one,
 * `/pasture` read-only, and the program's three verbs), then `BRIEF.md`
 * whole when the tree has one, then the skills. Built at every model call
 * over one `PastureCall`, the way the home line is built at every call:
 * the dog can change the brief while a sheep runs, and its next turn has
 * it.
 *
 * Skills are pi's format, read the way pi's resource loader reads a disk:
 * each `skills/<name>/SKILL.md` is parsed with pi's `parseFrontmatter` and
 * listed in the block pi's `formatSkillsForPrompt` makes, under its
 * `/pasture` path, so the model reads one with `read` as pi's prompt tells
 * it to. A malformed one is a line naming the file and the fault, not a
 * crash.
 *
 * pi's pieces reach the cell by path into its built files: the package's
 * root export is a Node bundle (a terminal, child processes) a Worker
 * cannot load. `parseFrontmatter`, `createSyntheticSourceInfo`, and, since
 * pasture phase 4's fork commit, `formatSkillsForPrompt` are leaf modules
 * and are imported: the formatter's old home, `core/skills.js`, imports
 * pi's `config.js`, whose top level runs `fileURLToPath(import.meta.url)`,
 * and a Worker has no `import.meta.url`, so a bundle that carried it
 * failed to boot; `core/skills-prompt.js` is the formatter and the `Skill`
 * it lists, and nothing else.
 */
import { formatSkillsForPrompt, type Skill } from "../../../vendor/pi/packages/coding-agent/dist/core/skills-prompt.js";
import { createSyntheticSourceInfo } from "../../../vendor/pi/packages/coding-agent/dist/core/source-info.js";
import { parseFrontmatter } from "../../../vendor/pi/packages/coding-agent/dist/utils/frontmatter.js";
import { type Home, shellSystemPromptLine } from "./env/programs.ts";
import { DEFAULT_BRANCH } from "./pasture.ts";
import { PASTURE_ROOT, PastureCall, type PastureSource } from "./workspace/mount.ts";

/** The prompt the cell built before pasture: lamb's lines, and pen's home line, resolved at every call. */
export function systemPrompt(home: Home): string {
  return [
    "You are a coding agent working in a session that lives in a cell, not on a machine.",
    "Working directory: /workspace",
    "Use the read, write, edit, and bash tools to inspect and change files.",
    shellSystemPromptLine(home),
    "Keep answers short and technical.",
  ].join("\n");
}

/** The pasture a cell was born into, as the prompt builder needs it. */
export interface CellPasture {
  name: string;
  source: PastureSource;
}

/** The whole prompt: the cell's own lines, and the pasture's after them when there is one. */
export async function cellSystemPrompt(home: Home, pasture: CellPasture | undefined): Promise<string> {
  const own = systemPrompt(home);
  if (pasture === undefined) return own;
  // The call boundary for the prompt: one `PastureCall` per model call, its snapshot fetched now and dropped after.
  return `${own}\n${await pasturePrompt(pasture.name, new PastureCall(pasture.source))}`;
}

/** The paragraph that names the pasture: where this sheep is, what `/pasture` is, and the three verbs. */
export function pastureParagraph(name: string, repo: string | null, branch: string): string {
  const where = repo === null ? "which has no repository" : `whose repository is ${repo} on branch ${branch}`;
  return (
    `This session was born into the pasture ${name}, ${where}. ` +
    `The pasture's tree is at /pasture, beside the workspace, and it is read-only: read it with the read tool and the shell, and expect a write there to be refused. ` +
    `The pasture program in the shell has three verbs: \`pasture\` prints the herd, the sheep born into this pasture and what each was asked; ` +
    `\`pasture put <path> [file]\` writes a workspace file, or stdin, to /pasture/<path>, whole; and \`pasture rm <path>\` removes one.`
  );
}

export const BRIEF_PATH = `${PASTURE_ROOT}/BRIEF.md`;
const SKILL_PATH = /^skills\/([^/]+)\/SKILL\.md$/;

/** The line the prompt carries for a `SKILL.md` it could not list. */
export function skillFault(path: string, fault: string): string {
  return `The skill at ${path} is not listed: ${fault}.`;
}

/** The pasture's part of the prompt: the paragraph, the brief, the skills, and the faults, from one call. */
export async function pasturePrompt(name: string, call: PastureCall): Promise<string> {
  const meta = await call.meta();
  const paragraph = pastureParagraph(name, meta?.repo ?? null, meta?.branch ?? DEFAULT_BRANCH);
  const brief = (await call.get(BRIEF_PATH))?.kind === "file" ? await call.readText(BRIEF_PATH) : undefined;
  const skills: Skill[] = [];
  const faults: string[] = [];
  for (const row of await call.rows()) {
    if (row.kind !== "file" || !SKILL_PATH.test(row.path.slice(PASTURE_ROOT.length + 1))) continue;
    const parsed = parseSkill(await call.readText(row.path), row.path);
    if ("skill" in parsed) skills.push(parsed.skill);
    else faults.push(skillFault(row.path, parsed.fault));
  }
  // pi's own block, as the Agent Skills standard has it: the guidance for `read` and `<available_skills>`, or nothing when no skill may be listed.
  return paragraph + (brief === undefined ? "" : `\n\n${brief}`) + formatSkillsForPrompt(skills, "read") + (faults.length === 0 ? "" : `\n\n${faults.join("\n")}`);
}

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

/** pi's rules for a skill's name, from the Agent Skills spec its loader follows; the fault in pi's words, or nothing. */
export function skillNameFault(name: string): string | undefined {
  if (name.length > MAX_NAME_LENGTH) return `name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`;
  if (!/^[a-z0-9-]+$/.test(name)) return "name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)";
  if (name.startsWith("-") || name.endsWith("-")) return "name must not start or end with a hyphen";
  if (name.includes("--")) return "name must not contain consecutive hyphens";
  return undefined;
}

/** A `SKILL.md`'s text as pi's `Skill`, at its `/pasture` path, or the fault that keeps it out of the prompt. */
export function parseSkill(text: string, filePath: string): { skill: Skill } | { fault: string } {
  let frontmatter: Record<string, unknown>;
  try {
    ({ frontmatter } = parseFrontmatter(text));
  } catch (error) {
    // One line: the YAML parser's message quotes the offending lines, and a fault is a line naming the file and the fault.
    return { fault: `its frontmatter does not parse (${(error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim()})` };
  }
  const name = frontmatter.name;
  if (typeof name !== "string" || name.trim() === "") return { fault: "its frontmatter has no name" };
  const nameFault = skillNameFault(name);
  if (nameFault !== undefined) return { fault: nameFault };
  const description = frontmatter.description;
  if (typeof description !== "string" || description.trim() === "") return { fault: "its frontmatter has no description" };
  if (description.length > MAX_DESCRIPTION_LENGTH) return { fault: `description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})` };
  const baseDir = filePath.slice(0, filePath.lastIndexOf("/"));
  return {
    skill: {
      name,
      description,
      filePath,
      baseDir,
      sourceInfo: createSyntheticSourceInfo(filePath, { source: "pasture", baseDir }),
      disableModelInvocation: frontmatter["disable-model-invocation"] === true,
    },
  };
}
