/**
 * The report: what the page said while it rendered, as text a sheep reads
 * in its own transcript. It is one pure function of what the look
 * gathered, so the shape can be asserted without a browser, and the
 * program that prints it (eyes phase 1) adds nothing of its own.
 *
 * Four short sections, in the order a sheep should read them. `errors` is
 * the page's uncaught exceptions and any request that failed, 404 or
 * aborted, one per line: the first thing worth knowing is whether the
 * page is broken. `console` is each message with its level. `tree` is
 * puppeteer's accessibility snapshot, indented one level per depth, the
 * roles and names and values; for "is the list rendered" it beats the
 * picture. Then one closing line naming the file the program writes, its
 * size, and how long the look took.
 *
 * A section with nothing in it says `none` rather than vanishing: that
 * the page threw nothing is the answer a sheep came for, and a report
 * whose shape does not move is one a sheep can skim. Nothing is truncated
 * but the tree, at two hundred lines with a line saying so.
 */

/** One console message as the page emitted it; `level` is puppeteer's `type()`, `log`, `warn`, `error`. */
export interface ConsoleLine {
  level: string;
  text: string;
}

/** One request the page made and what came of it. Kept for eyes phase 2; the report prints only the failures, under `errors`. */
export interface RequestLine {
  method: string;
  url: string;
  /** The status the eyes answered with, or another origin's. Absent when the request never got one. */
  status?: number;
  /** The browser's own text for a request that never finished, `net::ERR_…`. */
  failure?: string;
}

/** Puppeteer's `SerializedAXNode`, the part the tree prints. Declared here because puppeteer does not export the type. */
export interface AxNode {
  role: string;
  name?: string;
  value?: string | number;
  children?: AxNode[];
}

/** Everything one look gathered. The report is a function of this and nothing else. */
export interface Seen {
  /** Uncaught exceptions and failed requests, in the order they happened. */
  errors: string[];
  console: ConsoleLine[];
  requests: RequestLine[];
  tree: AxNode | null;
  /** The PNG's own width and height, read from its header, so `--full` reports what was written. */
  width: number;
  height: number;
  /** Wall time of the whole look, in milliseconds. */
  ms: number;
  /** The name the program writes the PNG under. The eyes only name it; the program writes the file. */
  out: string;
}

/**
 * The roles the eyes cut out of the whole snapshot, hoisting their
 * children up a level: layout nodes that say nothing about the page.
 */
export const PRUNED_ROLES: ReadonlySet<string> = new Set(["none", "generic", "InlineTextBox"]);

/**
 * The whole snapshot cut to the nodes that say something (eyes phase 1).
 * puppeteer's own pruning, `interestingOnly`, takes a page with no
 * focusable element for one leaf and reports its root alone: in its
 * `isLeafNode` a focusable node with a name is a leaf when nothing under
 * it is focusable, and Chrome marks the `RootWebArea` focusable. So the
 * eyes take the snapshot whole and cut it here, by two rules: a node
 * whose role is `none`, `generic`, or `InlineTextBox` is dropped and its
 * children hoisted a level, so the depth is the depth of what is said;
 * and a `StaticText` whose name only repeats the nearest kept ancestor's
 * name, or its value as a string, is dropped, so `heading "People"` is
 * not followed by `StaticText "People"` and `textbox "name" "Dolly"` not
 * by `StaticText "Dolly"`. Everything else stays: roles, names, values.
 * The root is never dropped. A pure function of the snapshot, so the
 * shape is asserted without a browser.
 */
export function pruneTree(node: AxNode | null): AxNode | null {
  if (node === null) return null;
  return kept(node);
}

/** `node` with its subtree pruned: its kept children are the pruned children of the whole subtree under it. */
function kept(node: AxNode): AxNode {
  const { children: _children, ...own } = node;
  const children = prunedChildren(node.children ?? [], node);
  return children.length === 0 ? own : { ...own, children };
}

/** Whether a text node only repeats what its nearest kept ancestor already says: its name, or its value. */
function repeats(text: AxNode, ancestor: AxNode): boolean {
  if (text.role !== "StaticText" || text.name === undefined || text.name === "") return false;
  return text.name === ancestor.name || (ancestor.value !== undefined && text.name === String(ancestor.value));
}

function prunedChildren(children: readonly AxNode[], ancestor: AxNode): AxNode[] {
  const out: AxNode[] = [];
  for (const child of children) {
    if (PRUNED_ROLES.has(child.role)) {
      // Hoisted: the children take this node's place, at its depth, under the same kept ancestor.
      out.push(...prunedChildren(child.children ?? [], ancestor));
      continue;
    }
    if (repeats(child, ancestor)) continue;
    out.push(kept(child));
  }
  return out;
}

/** The tree is cut here, and says so. Everything else in the report is whole. */
export const TREE_LINES = 200;

/** What an empty section says. */
export const NONE = "none";

export function report(seen: Seen): string {
  const sections = [
    section("errors", seen.errors),
    section(
      "console",
      seen.console.map((line) => `${line.level}: ${line.text}`),
    ),
    section("tree", cut(treeLines(seen.tree))),
  ];
  return `${sections.join("\n")}\n${closing(seen)}\n`;
}

/** The closing line: `wrote look.png 1024x768 in 2.3s`. */
export function closing(seen: Seen): string {
  return `wrote ${seen.out} ${seen.width}x${seen.height} in ${(seen.ms / 1000).toFixed(1)}s`;
}

function section(name: string, lines: readonly string[]): string {
  const body = lines.length === 0 ? [NONE] : lines;
  return `${name}:\n${body.map((line) => `  ${line}`).join("\n")}\n`;
}

function cut(lines: string[]): string[] {
  if (lines.length <= TREE_LINES) return lines;
  const kept = lines.slice(0, TREE_LINES);
  kept.push(`… ${lines.length - TREE_LINES} more lines of tree, not shown`);
  return kept;
}

/**
 * The snapshot flattened: one line per node, two spaces per level of
 * depth, `role "name" "value"`. A node with neither a name nor a value is
 * its role alone.
 */
export function treeLines(node: AxNode | null, depth = 0): string[] {
  if (node === null) return [];
  const parts = [node.role];
  if (node.name !== undefined && node.name !== "") parts.push(JSON.stringify(node.name));
  if (node.value !== undefined && node.value !== "") parts.push(JSON.stringify(String(node.value)));
  const lines = [`${"  ".repeat(depth)}${parts.join(" ")}`];
  for (const child of node.children ?? []) lines.push(...treeLines(child, depth + 1));
  return lines;
}

/**
 * A PNG's own width and height, from the IHDR that every PNG opens with:
 * eight bytes of signature, four of length, four of type, then the two
 * big-endian dimensions. Read from the bytes rather than taken from the
 * viewport, so `--full` and a device scale report what was written.
 */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  if (png.byteLength < 24) return { width: 0, height: 0 };
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
