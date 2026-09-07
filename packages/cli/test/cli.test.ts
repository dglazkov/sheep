import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const bin = new URL("../bin/sheep.js", import.meta.url).pathname;

describe("sheep", () => {
  it("prints its version: no build stamp in a checkout", async () => {
    const { stdout } = await run(process.execPath, [bin, "--version"]);
    expect(stdout).toBe("sheep 0.0.0-checkout\n");
  });

  it("resolves the home from the kennel's config, the environment, and --home in that order, and names the kennel", async () => {
    // The config is the working directory's kennel, and HOME is that directory too, so the fallback is the same empty place.
    const dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-")));
    const kennel = join(dir, ".sheep");
    await mkdir(kennel);
    await writeFile(join(kennel, "config"), JSON.stringify({ home: "https://file.example", token: "secret" }));
    const env = { ...process.env, HOME: dir, SHEEP_HOME: "", SHEEP_TOKEN: "" };
    delete env.SHEEP_HOME;
    delete env.SHEEP_TOKEN;
    const options = { env, cwd: dir };

    const fromFile = await run(process.execPath, [bin, "config"], options);
    expect(fromFile.stdout).toBe(`home: https://file.example\ntoken: set\nkennel: ${kennel}\n`);

    const fromEnv = await run(process.execPath, [bin, "config"], { ...options, env: { ...env, SHEEP_HOME: "https://env.example" } });
    expect(fromEnv.stdout).toBe(`home: https://env.example\ntoken: set\nkennel: ${kennel}\n`);

    const fromFlag = await run(process.execPath, [bin, "--home", "https://flag.example", "config"], {
      ...options,
      env: { ...env, SHEEP_HOME: "https://env.example" },
    });
    expect(fromFlag.stdout).toBe(`home: https://flag.example\ntoken: set\nkennel: ${kennel}\n`);
  });
});
