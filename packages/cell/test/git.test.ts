import { BACKGROUND_CONTEXT, createBashTool, getOrThrow } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CellExecutionEnv } from "../src/env/execution-env.ts";

const REMOTE = "http://127.0.0.1:4180/fixture.git";
const context = BACKGROUND_CONTEXT;
const invocation = { invocationId: "inv", operationId: "op", turnId: "turn", async getMemo() { return undefined; }, async setMemo() {} };
const bashTool = createBashTool();

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.flatMap((part) => (part.type === "text" ? [part.text ?? ""] : [])).join("\n");
}

function inCell<T>(name: string, body: (cell: CellExecutionEnv) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`git:${name}`), (_instance, state) =>
    body(new CellExecutionEnv(state.storage.sql, { git: { token: env.LAMB_GITHUB_TOKEN, author: { name: "Lamb", email: "lamb@example.com" } } })),
  );
}

async function bash(cell: CellExecutionEnv, command: string): Promise<string> {
  return text(await bashTool.execute("call", { command }, () => {}, { env: cell }, invocation, context));
}

describe("journey 5: a repository in, the work out", { timeout: 60_000 }, () => {
  it("clones, branches, edits, commits, pushes, and the push is what a fresh clone sees", async () => {
    const branch = `fix-typo-${Date.now()}`;
    await inCell("nadia", async (cell) => {
      // 1. clone and describe
      expect(await bash(cell, `git clone ${REMOTE}`)).toContain("Cloning into 'fixture'");
      const tree = await bash(cell, "cd fixture && find . -path ./.git -prune -o -type f -print | sort");
      expect(tree.trim().split("\n").sort()).toEqual(["./README.md", "./notes.txt"]);
      expect(await bash(cell, "cd fixture && git log --oneline")).toMatch(/^[0-9a-f]{7} seed/);

      // 2. a branch, a fix, status and diff
      expect(await bash(cell, `cd fixture && git checkout -b ${branch}`)).toContain(`Switched to a new branch '${branch}'`);
      await bash(cell, "cd fixture && sed -i 's/repositry/repository/' README.md");
      const status = await bash(cell, "cd fixture && git status");
      expect(status).toContain(`On branch ${branch}`);
      expect(status).toContain("modified:   README.md");
      const diff = await bash(cell, "cd fixture && git diff");
      expect(diff).toContain("-This repositry has a typo.");
      expect(diff).toContain("+This repository has a typo.");

      // 3. commit and push
      await bash(cell, "cd fixture && git add README.md");
      expect(await bash(cell, "cd fixture && git status")).toContain("Changes to be committed");
      expect(await bash(cell, 'cd fixture && git commit -m "Fix typo in README"')).toMatch(new RegExp(`\\[${branch} [0-9a-f]{7}\\] Fix typo in README`));
      expect(await bash(cell, `cd fixture && git push -u origin ${branch}`)).toContain(`${branch} -> ${branch}`);
      expect(await bash(cell, "cd fixture && git log --oneline")).toMatch(/Fix typo in README\n[0-9a-f]{7} seed/);

      // 5. an unavailable verb says so
      await expect(bash(cell, "cd fixture && git rebase -i HEAD~1")).rejects.toThrow("git: rebase is not available in this shell");

      // The credential is nowhere the model can see it.
      expect(await bash(cell, "env")).not.toContain("secret-git-credential");
      expect(cell.files.allPaths().every((path) => !path.includes("secret"))).toBe(true);
      const config = getOrThrow(await cell.readTextFile("fixture/.git/config", context));
      expect(config).not.toContain("secret-git-credential");
    });

    // 4. what Nadia's laptop `git fetch` would show: a fresh clone in another cell has the branch and the fix.
    await inCell("theo", async (cell) => {
      await bash(cell, `git clone ${REMOTE} again`);
      await bash(cell, `cd again && git checkout ${branch}`).catch(async () => {
        // A fresh clone may not have a local ref for the branch yet; fetch by pulling the remote branch.
        await bash(cell, `cd again && git pull origin ${branch}`);
      });
      const readme = getOrThrow(await cell.readTextFile("again/README.md", context));
      expect(readme).toContain("This repository has a typo.");
      expect(await bash(cell, "cd again && git log --oneline -n 1")).toContain("Fix typo in README");
    });
  });

  it("refuses a clone whole when a file exceeds the per-file limit", async () => {
    await inCell("cap", async (cell) => {
      // Files above the limit cannot exist in the fixture; exercise the refusal path through a direct write instead.
      const big = new Uint8Array(8 * 1024 * 1024 + 1);
      const refused = await cell.writeFile("big.bin", big, context);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.message).toContain(String(8 * 1024 * 1024));
      // And a file just under it round-trips through the chunked rows.
      const large = new Uint8Array(3 * 1024 * 1024 + 7).map((_, index) => index % 251);
      getOrThrow(await cell.writeFile("large.bin", large, context));
      const back = getOrThrow(await cell.readBinaryFile("large.bin", context));
      expect(back.byteLength).toBe(large.byteLength);
      expect(back[large.byteLength - 1]).toBe(large[large.byteLength - 1]);
      expect((await bash(cell, "wc -c < large.bin")).trim()).toBe(String(large.byteLength));
    });
  });
});
