/**
 * The release manifest, held as a literal: its dependencies are exactly
 * the packages pi's own bundle keeps external, and nothing that npm's git
 * installer reads as "needs preparation" (isocan #47). A bundle that
 * starts leaking an import, or a build tool that creeps into the tree,
 * is a red line here and not `ERR_MODULE_NOT_FOUND` on a user's laptop.
 * Collar phase 0.
 */
import { describe, expect, it } from "vitest";
// The script is plain ESM at the repository root; vitest loads it as is.
// @ts-expect-error no declarations for the release script
import { BIN_SHEEP_JS, expectedReleaseFiles, IMAGE_REPOSITORY, PREPARATION_KEYS, releaseManifest, SKILL_FILE } from "../../../scripts/release.mjs";
// @ts-expect-error no declarations for the bundle script
import { imageReference, shippedConfig } from "../../../scripts/bundle.mjs";

const STAMP = { commit: "194656e", builtAt: "2026-09-07T17:00:00Z", wrangler: "4.129.0" };
const ROOT_PACKAGE = { name: "sheep", private: true, type: "module", packageManager: "pnpm@10.33.0", scripts: { build: "pnpm -r build", test: "pnpm -r test", release: "node scripts/release.mjs" }, devDependencies: { esbuild: "^0.28.0" } };

describe("the release manifest", () => {
  const manifest = releaseManifest(ROOT_PACKAGE, STAMP) as Record<string, unknown>;

  it("depends on exactly the packages pi's bundle keeps external, chord inside", () => {
    expect(manifest.dependencies).toEqual({
      "@silvia-odwyer/photon-node": "0.3.4",
      jiti: "2.7.0",
    });
    expect(manifest.optionalDependencies).toEqual({
      bufferutil: "^4.0.1",
      "utf-8-validate": ">=5.0.2",
      "supports-color": "^10.0.0",
      "@mariozechner/clipboard": "0.3.9",
    });
    const all = { ...(manifest.dependencies as object), ...(manifest.optionalDependencies as object) };
    for (const tool of ["esbuild", "wrangler", "workerd", "@earendil-works/chord", "typescript", "vitest"]) expect(all).not.toHaveProperty(tool);
    expect(manifest).not.toHaveProperty("devDependencies");
    expect(manifest).not.toHaveProperty("peerDependencies");
  });

  it("carries nothing pacote reads as needs-preparation, and none of the checkout's keys", () => {
    expect(manifest).not.toHaveProperty("scripts");
    expect(manifest).not.toHaveProperty("workspaces");
    expect(manifest).not.toHaveProperty("private");
    expect(manifest).not.toHaveProperty("packageManager");
    for (const key of PREPARATION_KEYS as string[]) {
      const [top, sub] = key.split(".") as [string, string | undefined];
      if (sub === undefined) expect(manifest).not.toHaveProperty(top);
      else expect((manifest[top] as Record<string, unknown> | undefined)?.[sub]).toBeUndefined();
    }
  });

  it("names the command, the Node floor, and the build stamp under a sheep key", () => {
    expect(manifest.name).toBe("sheep");
    expect(manifest.type).toBe("module");
    expect(manifest.bin).toEqual({ sheep: "bin/sheep.js" });
    expect(manifest.engines).toEqual({ node: ">=22.19" });
    expect(manifest.sheep).toEqual(STAMP);
    expect(manifest).not.toHaveProperty("commit");
    expect(BIN_SHEEP_JS).toMatch(/^#!\/usr\/bin\/env node\nimport \{ main \} from "\.\.\/dist\/sheep\.mjs";\n/);
  });

  it("lists the guide beside the bundle and the skill at the root, and refuses a build without either", () => {
    const built = [{ file: "dist/sheep.mjs" }, { file: "dist/pi-client.mjs" }, { file: "dist/agent-guide.md" }, { file: "home/worker.mjs" }, { file: "home/wrangler.jsonc" }];
    const skill = [SKILL_FILE];
    expect(expectedReleaseFiles(built, skill)).toEqual(["LICENSE", "README.md", "SKILL.md", "bin/sheep.js", "dist/agent-guide.md", "dist/pi-client.mjs", "dist/sheep.mjs", "home/worker.mjs", "home/wrangler.jsonc", "package.json"]);
    expect(() => expectedReleaseFiles(built.filter((file) => file.file !== "dist/agent-guide.md"), skill)).toThrow(/agent-guide/);
    expect(() => expectedReleaseFiles(built, [])).toThrow(/SKILL\.md/);
  });

  it("ships the pen environment with the image at the stamp's commit, no build context, and no container name (station phase 0)", () => {
    const cell = {
      $schema: "node_modules/wrangler/config-schema.json",
      name: "sheep",
      main: "src/index.ts",
      compatibility_date: "2026-08-22",
      env: {
        pen: {
          name: "sheep-pen",
          containers: [{ name: "sheep-pen", image: "../pen/Dockerfile", image_build_context: "../pen", class_name: "PenContainer", instance_type: "basic", max_instances: 3 }],
          vars: { PEN_IDLE: "10m" },
        },
      },
    };
    expect(IMAGE_REPOSITORY).toBe("docker.io/dglazkov2/sheep-pen");
    expect(imageReference(STAMP.commit)).toBe("docker.io/dglazkov2/sheep-pen:194656e");
    const released = shippedConfig(cell, STAMP) as { env: { pen: Record<string, unknown> } } & Record<string, unknown>;
    expect(released).not.toHaveProperty("$schema");
    expect(released).toMatchObject({ name: "sheep", main: "worker.mjs", no_bundle: true, compatibility_date: "2026-08-22" });
    expect(released.env.pen).toEqual({
      name: "sheep-pen",
      containers: [{ image: "docker.io/dglazkov2/sheep-pen:194656e", class_name: "PenContainer", instance_type: "basic", max_instances: 3 }],
      vars: { PEN_IDLE: "10m" },
    });
    // No stamp: a checkout build keeps the Dockerfile line, context and name included.
    const checkout = shippedConfig(cell, undefined) as { env: { pen: { containers: unknown[] } } };
    expect(checkout.env.pen.containers).toEqual(cell.env.pen.containers);
    expect(() => shippedConfig({ ...cell, env: { pen: { ...cell.env.pen, containers: [] } } }, STAMP)).toThrow(/exactly one container/);
  });

  it("refuses a stamp with a piece missing", () => {
    expect(() => releaseManifest(ROOT_PACKAGE, { commit: "194656e", builtAt: "2026-09-07T17:00:00Z" })).toThrow(/wrangler/);
    expect(() => releaseManifest(ROOT_PACKAGE, undefined)).toThrow(/commit/);
  });
});
