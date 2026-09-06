import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const bin = new URL("../bin/sheep.js", import.meta.url).pathname;

describe("sheep", () => {
  it("prints its version", async () => {
    const { stdout } = await run(process.execPath, [bin, "--version"]);
    expect(stdout).toMatch(/^sheep \d+\.\d+\.\d+\n$/);
  });

  it("resolves the home from the config file, the environment, and --home in that order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sheep-"));
    const config = join(dir, "config");
    await writeFile(config, JSON.stringify({ home: "https://file.example", token: "secret" }));
    const env = { ...process.env, SHEEP_CONFIG: config, SHEEP_HOME: "", SHEEP_TOKEN: "" };
    delete env.SHEEP_HOME;
    delete env.SHEEP_TOKEN;

    const fromFile = await run(process.execPath, [bin, "config"], { env });
    expect(fromFile.stdout).toBe("home: https://file.example\ntoken: set\n");

    const fromEnv = await run(process.execPath, [bin, "config"], { env: { ...env, SHEEP_HOME: "https://env.example" } });
    expect(fromEnv.stdout).toBe("home: https://env.example\ntoken: set\n");

    const fromFlag = await run(process.execPath, [bin, "--home", "https://flag.example", "config"], {
      env: { ...env, SHEEP_HOME: "https://env.example" },
    });
    expect(fromFlag.stdout).toBe("home: https://flag.example\ntoken: set\n");
  });
});
