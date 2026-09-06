/**
 * pasture phase 0: the object, and the verbs, in workerd. The tree round-trips
 * a file through the routes and the object; a secret's value is readable by
 * the object over RPC and by no route; the directory refuses an unknown
 * pasture and, on this home with no container, a pasture with a repository,
 * each with the design's sentence held here as a literal; and a `sessions`
 * table from before this phase gains the two columns and keeps its rows.
 */
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Directory, noContainerForRepository, type SessionSummary, unknownPasture } from "../src/directory.ts";
import { Pasture, PASTURE_ROOT, treePath } from "../src/pasture.ts";
import { MAX_FILE_BYTES } from "../src/workspace/files.ts";

const headers = { authorization: "Bearer test-token" };

function home(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://sheep.test${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A value that looks like nothing else, so a search of every route's body for it is exact. */
const SECRET = "pasture-secret-3c9e1b7d5a2f4806-never-in-a-route";

describe("pasture phase 0: the object, and the verbs", () => {
  it("makes a pasture: the directory keeps the name, the object keeps the meta", async () => {
    const made = await home("/pastures", { method: "POST", body: JSON.stringify({ name: "docs", repo: "https://github.com/example/docs.git", branch: "trunk" }) });
    expect(made.status).toBe(201);
    expect(await made.json()).toMatchObject({ name: "docs", repo: "https://github.com/example/docs.git", branch: "trunk" });
    const again = await home("/pastures", { method: "POST", body: JSON.stringify({ name: "docs" }) });
    expect(again.status).toBe(409);
    const bare = await home("/pastures", { method: "POST", body: JSON.stringify({ name: "notes" }) });
    expect(bare.status).toBe(201);
    expect(await bare.json()).toMatchObject({ name: "notes", repo: null, branch: "main" });
    const listed = (await (await home("/pastures")).json()) as Array<{ name: string; createdAt: number }>;
    expect(listed.map((pasture) => pasture.name).sort()).toEqual(["docs", "notes"]);
    for (const bad of ["Docs", "a b", "a/b", "", "über"]) {
      const refused = await home("/pastures", { method: "POST", body: JSON.stringify({ name: bad }) });
      expect(refused.status).toBe(400);
      expect(await refused.text()).toContain("[a-z0-9-]+");
    }
    const view = await home("/p/docs");
    expect(view.status).toBe(200);
    expect(await view.json()).toMatchObject({ name: "docs", repo: "https://github.com/example/docs.git", branch: "trunk", herd: [] });
    const unknown = await home("/p/nowhere");
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe(unknownPasture("nowhere"));
  });

  it("round-trips a file through put, cat, rm, and the manifest, over the routes and in the object", async () => {
    await home("/pastures", { method: "POST", body: JSON.stringify({ name: "tree" }) });
    const brief = "# Brief\n\nThree lines about the layout.\n";
    const put = await home("/p/tree/tree/BRIEF.md", { method: "PUT", body: brief });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ path: "BRIEF.md", kind: "file", mode: 0o644, hash: await sha256(brief) });
    const nested = await home("/p/tree/tree/notes/typo.md", { method: "PUT", body: "branch: fix-typo\n" });
    expect(nested.status).toBe(200);

    const cat = await home("/p/tree/tree/BRIEF.md");
    expect(cat.status).toBe(200);
    expect(cat.headers.get("content-type")).toBe("application/octet-stream");
    expect(new TextDecoder().decode(await cat.arrayBuffer())).toBe(brief);
    expect((await home("/p/tree/tree/nothing.md")).status).toBe(404);
    expect((await home("/p/tree/tree/notes")).status).toBe(409);

    const manifest = (await (await home("/p/tree/tree")).json()) as Array<{ path: string; kind: string; hash: string | null }>;
    expect(manifest).toEqual([
      { path: "BRIEF.md", kind: "file", mode: 0o644, hash: await sha256(brief) },
      { path: "notes", kind: "directory", mode: 0o755, hash: null },
      { path: "notes/typo.md", kind: "file", mode: 0o644, hash: await sha256("branch: fix-typo\n") },
    ]);

    // The object's own face: the rows are at /pasture, and a file is fetchable by the hash the manifest names.
    await runInDurableObject(env.PASTURE.getByName("tree"), async (pasture: Pasture, state) => {
      const paths = state.storage.sql.exec<{ path: string }>("SELECT path FROM files ORDER BY path").toArray().map((row) => row.path);
      expect(paths).toEqual(["/", PASTURE_ROOT, `${PASTURE_ROOT}/BRIEF.md`, `${PASTURE_ROOT}/notes`, `${PASTURE_ROOT}/notes/typo.md`]);
      expect(new TextDecoder().decode(pasture.readByHash(await sha256(brief)))).toBe(brief);
      expect(pasture.readByHash("0".repeat(64))).toBeUndefined();
      expect(new TextDecoder().decode(pasture.read("notes/typo.md"))).toBe("branch: fix-typo\n");
      // Last write wins, whole.
      pasture.put("BRIEF.md", new TextEncoder().encode("shorter\n"));
      expect(pasture.manifest()[0]).toEqual({ path: "BRIEF.md", kind: "file", mode: 0o644, hash: await sha256("shorter\n") });
    });

    // A path that would leave the tree is refused, on the route and in the object.
    expect((await home("/p/tree/tree/..%2F..%2Fworkspace%2Fx", { method: "PUT", body: "x" })).status).toBe(400);
    expect(treePath("../x")).toBeUndefined();
    expect(treePath("a/../../x")).toBeUndefined();
    expect(treePath("")).toBeUndefined();
    expect(treePath("a/./b")).toBe(`${PASTURE_ROOT}/a/b`);
    // The per-file cap is the workspace's.
    const big = await home("/p/tree/tree/big.bin", { method: "PUT", body: new Uint8Array(MAX_FILE_BYTES + 1) });
    expect(big.status).toBe(413);

    expect((await home("/p/tree/tree/BRIEF.md", { method: "DELETE" })).status).toBe(204);
    expect((await home("/p/tree/tree/BRIEF.md", { method: "DELETE" })).status).toBe(404);
    expect((await home("/p/tree/tree/notes", { method: "DELETE" })).status).toBe(204);
    expect(await (await home("/p/tree/tree")).json()).toEqual([]);
    expect((await home("/p/tree/tree/BRIEF.md")).status).toBe(404);
  });

  it("keeps a secret: the object reads its value over RPC, and no route returns it", async () => {
    await home("/pastures", { method: "POST", body: JSON.stringify({ name: "vault", repo: "https://github.com/example/vault" }) });
    await home("/p/vault/tree/BRIEF.md", { method: "PUT", body: "a brief\n" });
    const set = await home("/p/vault/secrets/GIT_TOKEN", { method: "PUT", body: SECRET });
    expect(set.status).toBe(204);
    expect((await home("/p/vault/secrets/NPM_TOKEN", { method: "PUT", body: "other" })).status).toBe(204);
    expect((await home("/p/vault/secrets/not%20a%20name", { method: "PUT", body: "x" })).status).toBe(400);

    const names = await home("/p/vault/secrets");
    expect(names.status).toBe(200);
    expect(await names.json()).toEqual(["GIT_TOKEN", "NPM_TOKEN"]);

    await runInDurableObject(env.PASTURE.getByName("vault"), (pasture: Pasture) => {
      expect(pasture.secret("GIT_TOKEN")).toBe(SECRET);
      expect(pasture.secret("NPM_TOKEN")).toBe("other");
      expect(pasture.secret("NOTHING")).toBeUndefined();
      expect(pasture.secretNames()).toEqual(["GIT_TOKEN", "NPM_TOKEN"]);
    });

    // Every route a pasture has, and the home's, with every method: the value is in no body.
    const routes: Array<[string, string]> = [
      ["GET", "/p/vault"],
      ["GET", "/p/vault/tree"],
      ["GET", "/p/vault/tree/BRIEF.md"],
      ["GET", "/p/vault/secrets"],
      ["GET", "/p/vault/secrets/GIT_TOKEN"],
      ["POST", "/p/vault/secrets/GIT_TOKEN"],
      ["DELETE", "/p/vault/secrets/GIT_TOKEN"],
      ["GET", "/p/vault/secret/GIT_TOKEN"],
      ["GET", "/p/vault/GIT_TOKEN"],
      ["GET", "/pastures"],
      ["GET", "/sessions"],
      ["GET", "/home"],
    ];
    for (const [method, path] of routes) {
      const response = await home(path, { method });
      const body = new TextDecoder().decode(await response.arrayBuffer());
      expect(body, `${method} ${path}`).not.toContain(SECRET);
      if (path.includes("GIT_TOKEN")) expect(response.status, `${method} ${path}`).toBe(404);
    }
    // Nor a route the token does not open.
    const anonymous = await SELF.fetch("https://sheep.test/p/vault/secrets/GIT_TOKEN");
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).not.toContain(SECRET);
  });

  it("refuses a birth into an unknown pasture, and into a pasture with a repository on this home with no container", async () => {
    await home("/pastures", { method: "POST", body: JSON.stringify({ name: "src", repo: "https://github.com/example/src" }) });
    await home("/pastures", { method: "POST", body: JSON.stringify({ name: "plain" }) });
    const before = (await (await home("/sessions")).json()) as SessionSummary[];

    // Journey 4 step 3: the sentence, verbatim, the directory's, before any cell exists.
    const noContainer = await home("/sessions", { method: "POST", body: JSON.stringify({ name: "typo", pasture: "src" }) });
    expect(noContainer.status).toBe(409);
    expect(await noContainer.text()).toBe("pasture src has a repository, and this home has no container to clone it with; a pasture with no repository would work here");
    expect(noContainerForRepository("src")).toBe("pasture src has a repository, and this home has no container to clone it with; a pasture with no repository would work here");

    const unknown = await home("/sessions", { method: "POST", body: JSON.stringify({ pasture: "meadow" }) });
    expect(unknown.status).toBe(409);
    expect(await unknown.text()).toBe("no pasture named meadow at this home; `sheep pasture ls` lists the ones there are");
    expect(unknownPasture("meadow")).toBe("no pasture named meadow at this home; `sheep pasture ls` lists the ones there are");
    expect((await home("/sessions", { method: "POST", body: JSON.stringify({ pasture: "Not A Name" }) })).status).toBe(400);

    // No session was made.
    expect(await (await home("/sessions")).json()).toEqual(before);
    // The directory itself refuses too, not only the route.
    const directory = env.DIRECTORY.getByName("home");
    expect(await directory.refusal("src")).toBe(noContainerForRepository("src"));
    expect(await directory.refusal("meadow")).toBe(unknownPasture("meadow"));
    expect(await directory.refusal("plain")).toBeUndefined();
    await runInDurableObject(directory, (instance: Directory) => {
      expect(() => instance.create("x", "meadow")).toThrow(unknownPasture("meadow"));
    });

    // A pasture with no repository works here: a row with a column, and a herd of one.
    const born = await home("/sessions", { method: "POST", body: JSON.stringify({ name: "reader", pasture: "plain" }) });
    expect(born.status).toBe(201);
    const summary = (await born.json()) as SessionSummary;
    expect(summary).toMatchObject({ name: "reader", pasture: "plain", task: null, state: "idle" });
    const pastureless = (await (await home("/sessions", { method: "POST", body: JSON.stringify({ name: "lamb" }) })).json()) as SessionSummary;
    expect(pastureless).toMatchObject({ name: "lamb", pasture: null, task: null });
    const all = (await (await home("/sessions")).json()) as SessionSummary[];
    expect(all.find((session) => session.id === summary.id)).toMatchObject({ pasture: "plain", task: null });
    expect(all.find((session) => session.id === pastureless.id)).toMatchObject({ pasture: null, task: null });
    const herd = (await (await home("/sessions?pasture=plain")).json()) as SessionSummary[];
    expect(herd.map((session) => session.id)).toEqual([summary.id]);
    const view = (await (await home("/p/plain")).json()) as { herd: SessionSummary[] };
    expect(view.herd).toEqual(herd);
    expect((await (await home("/p/src")).json()) as { herd: SessionSummary[] }).toMatchObject({ herd: [] });
  });

  it("brings a sessions table from before this phase up to date, keeping its rows", async () => {
    await runInDurableObject(env.DIRECTORY.getByName("before-pasture"), (_directory, state) => {
      const sql = state.storage.sql;
      sql.exec("DROP TABLE sessions");
      sql.exec("DROP TABLE IF EXISTS pastures");
      // The table as pen left it: lamb's three columns and lamb phase 5's state.
      sql.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL, state TEXT)");
      sql.exec("INSERT INTO sessions (id, name, created_at, state) VALUES ('old-1', 'docs', 1000, 'idle')");
      sql.exec("INSERT INTO sessions (id, name, created_at, state) VALUES ('old-2', NULL, 2000, 'running')");
      const columnsBefore = sql.exec<{ name: string }>("PRAGMA table_info(sessions)").toArray().map((column) => column.name);
      expect(columnsBefore).toEqual(["id", "name", "created_at", "state"]);

      // A new incarnation's constructor is the migration.
      const directory = new Directory(state, env);

      const columnsAfter = sql.exec<{ name: string }>("PRAGMA table_info(sessions)").toArray().map((column) => column.name);
      expect(columnsAfter).toEqual(["id", "name", "created_at", "state", "pasture", "task"]);
      expect(directory.list()).toEqual([
        { id: "old-2", name: null, createdAt: 2000, state: "running", pasture: null, task: null },
        { id: "old-1", name: "docs", createdAt: 1000, state: "idle", pasture: null, task: null },
      ]);
      expect(directory.pastures()).toEqual([]);
      // Again is a no-op.
      new Directory(state, env);
      expect(sql.exec<{ name: string }>("PRAGMA table_info(sessions)").toArray().map((column) => column.name)).toEqual(columnsAfter);
      directory.setTask("old-1", "write the docs");
      expect(directory.list()[1]).toMatchObject({ id: "old-1", task: "write the docs" });
    });
  });
});
