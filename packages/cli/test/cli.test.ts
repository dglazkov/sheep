import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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

  it("prints the usage for --help or -h after any verb, and asks nothing of the home or the account", async () => {
    // `sheep home deploy --help` once deployed a station. A kennel names a home that counts what it is asked; HOME is the
    // same empty directory, and no account token is in the environment, so a verb that ran anyway would be seen, not paid.
    const dir = realpathSync(await mkdtemp(join(tmpdir(), "sheep-help-")));
    const asked: string[] = [];
    const server = createServer((request, response) => {
      asked.push(`${request.method} ${request.url}`);
      response.writeHead(500).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      await mkdir(join(dir, ".sheep"));
      await writeFile(join(dir, ".sheep", "config"), JSON.stringify({ home: `http://127.0.0.1:${port}`, token: "secret" }));
      const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("SHEEP_") && !name.startsWith("CLOUDFLARE_")));
      const options = { env: { ...env, HOME: dir, SHEEP_TIP: "0" }, cwd: dir };
      const { stdout: usage } = await run(process.execPath, [bin, "--help"], options);
      for (const words of [
        ["home", "deploy", "--help"],
        ["home", "deploy", "-h"],
        ["home", "delete", "--help"],
        ["home", "local", "--help"],
        ["new", "--detach", "--help"],
        ["--help", "new"],
        ["rm", "01a0a1e2-41f4-720d-8f25-c026d1203f6e", "--help"],
        ["pasture", "new", "herd", "-h"],
      ]) {
        const ran = await run(process.execPath, [bin, ...words], options);
        expect({ words, stdout: ran.stdout, stderr: ran.stderr }).toEqual({ words, stdout: usage, stderr: "" });
      }
      // After `--` the words are a prompt, and a flag's value is a value: neither asks for help.
      await expect(run(process.execPath, [bin, "sh", "nosuch", "--", "ls", "--help"], options)).rejects.toMatchObject({ stdout: "" });
      expect(asked.length).toBeGreaterThan(0);
      asked.length = 0;
      const valued = await run(process.execPath, [bin, "--home", `http://127.0.0.1:${port}`, "config", "--name", "-h"], options);
      expect(valued.stdout).not.toBe(usage);
      expect(asked).toEqual([]);
    } finally {
      server.close();
    }
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
