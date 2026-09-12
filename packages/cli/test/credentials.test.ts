/**
 * The credentials, as a rule rather than as a command (stile phase 0): the
 * precedence — a kennel's `.sheep/credentials` over `~/.sheep/credentials`,
 * and the environment over both — the mode of the file the stile writes,
 * and that a write keeps the key it is not setting. The only knobs are the
 * working directory and `HOME`, as kennel phase 0 left them; there is no
 * variable that moves either. The command reading these is proved through
 * `bin/sheep.js` in `deploy.test.ts`, in the command ring.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { credentialsLine, credentialsReport, kennelCredentialsPath, machineCredentialsPath, readCredentials, writeCredentials } from "../src/credentials.js";

const cwdBefore = process.cwd();
const homeBefore = process.env.HOME;

let root: string;
/** `<root>/home` is HOME, `<root>/blog` a kennel, `<root>/blog/posts` a directory under it. */
let home: string;
let blog: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "sheep-credentials-")));
  home = join(root, "home");
  blog = join(root, "blog");
  mkdirSync(join(home, ".sheep"), { recursive: true });
  mkdirSync(join(blog, ".sheep"), { recursive: true });
  mkdirSync(join(blog, "posts"), { recursive: true });
  process.env.HOME = home;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  process.chdir(blog);
});

afterEach(() => {
  process.chdir(cwdBefore);
  if (homeBefore === undefined) delete process.env.HOME;
  else process.env.HOME = homeBefore;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  rmSync(root, { recursive: true, force: true });
});

const write = (path: string, values: Record<string, string>) => writeFileSync(path, JSON.stringify(values));

describe("where a credential comes from", () => {
  it("is nothing at all when no file and no variable holds one", () => {
    expect(readCredentials()).toEqual({});
    expect(credentialsLine()).toBe("credentials: account token none kept; model key none kept");
    expect(credentialsReport()).toEqual({ cloudflare: null, anthropic: null });
  });

  it("is ~/.sheep/credentials, which every directory without one of its own falls through to", () => {
    write(machineCredentialsPath(), { cloudflare: "machine-token", anthropic: "machine-key" });
    expect(readCredentials()).toEqual({
      cloudflare: { value: "machine-token", from: "machine", path: join(home, ".sheep", "credentials") },
      anthropic: { value: "machine-key", from: "machine", path: join(home, ".sheep", "credentials") },
    });
    // A directory under the kennel reads the same, since the kennel's file holds nothing.
    process.chdir(join(blog, "posts"));
    expect(readCredentials().cloudflare?.value).toBe("machine-token");
  });

  it("is the kennel's own file where there is one, key by key, for the rare second account", () => {
    write(machineCredentialsPath(), { cloudflare: "machine-token", anthropic: "machine-key" });
    write(kennelCredentialsPath(), { cloudflare: "kennel-token" });
    expect(kennelCredentialsPath()).toBe(join(blog, ".sheep", "credentials"));
    const found = readCredentials();
    // The kennel's token shadows the machine's; the key, which the kennel's file does not name, is still the machine's.
    expect(found.cloudflare).toEqual({ value: "kennel-token", from: "kennel", path: join(blog, ".sheep", "credentials") });
    expect(found.anthropic).toEqual({ value: "machine-key", from: "machine", path: join(home, ".sheep", "credentials") });
    // The walk up is the kennel's: a subdirectory of blog reads blog's, as it reads blog's config.
    process.chdir(join(blog, "posts"));
    expect(readCredentials().cloudflare?.value).toBe("kennel-token");
    expect(credentialsLine()).toBe(`credentials: account token kept in ${join(blog, ".sheep", "credentials")}; model key kept in ${join(home, ".sheep", "credentials")}`);
  });

  it("is the environment over both, which is what the rings and CI set, and nothing requires it", () => {
    write(machineCredentialsPath(), { cloudflare: "machine-token", anthropic: "machine-key" });
    write(kennelCredentialsPath(), { cloudflare: "kennel-token", anthropic: "kennel-key" });
    process.env.CLOUDFLARE_API_TOKEN = "environment-token";
    const found = readCredentials();
    expect(found.cloudflare).toEqual({ value: "environment-token", from: "environment", path: null });
    // Only the one that is set: the other is still the kennel's.
    expect(found.anthropic?.value).toBe("kennel-key");
    expect(credentialsLine()).toContain("account token from CLOUDFLARE_API_TOKEN in the environment");
    expect(credentialsReport().cloudflare).toEqual({ from: "environment", path: null });
    // A variable set to nothing is not a value: the file stands.
    process.env.CLOUDFLARE_API_TOKEN = "";
    expect(readCredentials().cloudflare?.value).toBe("kennel-token");
  });

  it("ignores a file that is missing, unreadable, or not the shape, rather than failing the command", () => {
    writeFileSync(machineCredentialsPath(), "not json at all");
    expect(readCredentials()).toEqual({});
    write(machineCredentialsPath(), { cloudflare: "" });
    expect(readCredentials()).toEqual({});
    writeFileSync(machineCredentialsPath(), JSON.stringify({ cloudflare: 7, anthropic: "a-key" }));
    expect(readCredentials()).toEqual({ anthropic: { value: "a-key", from: "machine", path: machineCredentialsPath() } });
  });
});

describe("writing them", () => {
  it("writes ~/.sheep/credentials alone, mode 600, and keeps the key it does not set", () => {
    const path = writeCredentials({ cloudflare: "a-token" });
    expect(path).toBe(join(home, ".sheep", "credentials"));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ cloudflare: "a-token" });

    // The second value joins the first, and rotating one leaves the other alone.
    writeCredentials({ anthropic: "a-key" });
    expect(readCredentials()).toMatchObject({ cloudflare: { value: "a-token" }, anthropic: { value: "a-key" } });
    writeCredentials({ anthropic: "another-key" });
    expect(readCredentials()).toMatchObject({ cloudflare: { value: "a-token" }, anthropic: { value: "another-key" } });

    // The kennel's file is never written here, whatever the working directory: the stile keeps the machine's alone.
    expect(() => statSync(kennelCredentialsPath())).toThrow();
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("makes ~/.sheep when there is none, as the machine's directory for tools and credentials alike", () => {
    rmSync(join(home, ".sheep"), { recursive: true, force: true });
    const path = writeCredentials({ anthropic: "a-key" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readCredentials().anthropic?.from).toBe("machine");
  });
});
