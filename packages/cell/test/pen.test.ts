/**
 * pen phase 0: the agent answers over a socket pair in workerd, and the
 * workspace table carries a hash per row so the manifest is one query.
 */
import { BACKGROUND_CONTEXT, createEditTool, createWriteTool, getOrThrow } from "@earendil-works/pi-agent-core";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CellExecutionEnv } from "../src/env/execution-env.ts";
import { CHUNK_BYTES, FilesTable } from "../src/workspace/files.ts";
import { ask, startFakeContainer } from "./fake-container.ts";

const context = BACKGROUND_CONTEXT;
const noUpdate = () => {};
const invocation = {
  invocationId: "inv",
  operationId: "op",
  turnId: "turn",
  async getMemo() {
    return undefined;
  },
  async setMemo() {},
};
const tools = { write: createWriteTool(), edit: createEditTool() };

/** An independent SHA-256, so the table's hash is checked against WebCrypto and not against itself. */
async function sha256(content: string | Uint8Array): Promise<string> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function inCell<T>(name: string, body: (cell: CellExecutionEnv, sql: SqlStorage) => Promise<T>): Promise<T> {
  return runInDurableObject(env.SESSION_CELL.getByName(`pen:${name}`), (_instance, state) =>
    body(new CellExecutionEnv(state.storage.sql), state.storage.sql),
  );
}

describe("the fake container is the agent over a socket pair", () => {
  it("answers ping with pong, and types what it cannot do yet", async () => {
    const container = startFakeContainer();
    expect(await ask(container.socket, { type: "ping", id: "a" })).toEqual({ type: "pong", id: "a" });
    expect(await ask(container.socket, { type: "ping" })).toEqual({ type: "pong" });
    expect(await ask(container.socket, { type: "credential", id: "c", value: "x", expires: 0 })).toMatchObject({ type: "error", code: "unsupported", of: "credential" });
    container.stop();
    await container.closed;
  });

  it("can be stopped from the test, and the cell's end sees the close", async () => {
    const container = startFakeContainer();
    const closed = new Promise<CloseEvent>((resolve) => container.socket.addEventListener("close", resolve));
    container.stop("the shepherd's hand");
    const event = await closed;
    expect(event.code).toBe(1012);
    expect(event.reason).toBe("the shepherd's hand");
  });
});

describe("the manifest: every workspace row with its hash", () => {
  it("is what lamb's tools wrote, hashed; an edit changes the hash; a directory has none", async () => {
    await inCell("manifest", async (cell) => {
      await tools.write.execute("w", { path: "src/a.txt", content: "alpha\nbeta\n" }, noUpdate, { env: cell }, invocation, context);
      getOrThrow(await cell.writeFile("/tmp/scratch.txt", "not in the manifest", context));
      const before = cell.files.manifest();
      expect(before).toEqual([
        { path: "src", kind: "directory", mode: 0o755, hash: null },
        { path: "src/a.txt", kind: "file", mode: 0o644, hash: await sha256("alpha\nbeta\n") },
      ]);

      await tools.edit.execute("e", { path: "src/a.txt", edits: [{ oldText: "beta", newText: "gamma" }] }, noUpdate, { env: cell }, invocation, context);
      const after = cell.files.manifest();
      expect(after[1]).toEqual({ path: "src/a.txt", kind: "file", mode: 0o644, hash: await sha256("alpha\ngamma\n") });
      expect(after[1]!.hash).not.toBe(before[1]!.hash);

      cell.files.symlink("a.txt", "/workspace/src/link");
      cell.files.chmod("/workspace/src/a.txt", 0o755);
      cell.files.rename("/workspace/src/a.txt", "/workspace/src/b.txt");
      expect(cell.files.manifest()).toEqual([
        { path: "src", kind: "directory", mode: 0o755, hash: null },
        { path: "src/b.txt", kind: "file", mode: 0o755, hash: await sha256("alpha\ngamma\n") },
        { path: "src/link", kind: "symlink", mode: 0o777, hash: await sha256("a.txt") },
      ]);
    });
  });

  it("hashes a file over one chunk across all of its chunks", async () => {
    await inCell("chunks", async (cell, sql) => {
      const content = "0123456789".repeat((CHUNK_BYTES * 1.5) / 10);
      expect(content.length).toBeGreaterThan(CHUNK_BYTES);
      await tools.write.execute("w", { path: "big.txt", content }, noUpdate, { env: cell }, invocation, context);
      const chunks = sql.exec<{ n: number }>("SELECT count(*) AS n FROM file_chunks WHERE path = '/workspace/big.txt'").one().n;
      expect(chunks).toBe(1);
      const head = sql.exec<{ len: number }>("SELECT length(content) AS len FROM files WHERE path = '/workspace/big.txt'").one().len;
      expect(head).toBe(CHUNK_BYTES);
      expect(cell.files.manifest()).toEqual([{ path: "big.txt", kind: "file", mode: 0o644, hash: await sha256(content) }]);
      expect(await sha256(content)).not.toBe(await sha256(content.slice(0, CHUNK_BYTES)));

      getOrThrow(await cell.appendFile("big.txt", "tail", context));
      expect(cell.files.manifest()[0]!.hash).toBe(await sha256(`${content}tail`));
    });
  });

  it("migrates a table from before pen: adds the column and backfills every row from its chunks", async () => {
    await runInDurableObject(env.SESSION_CELL.getByName("pen:migration"), async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec("DROP TABLE IF EXISTS files");
      sql.exec("DROP TABLE IF EXISTS file_chunks");
      sql.exec(`CREATE TABLE files (
        path     TEXT PRIMARY KEY,
        kind     TEXT NOT NULL,
        content  BLOB,
        size     INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        mode     INTEGER NOT NULL DEFAULT 420
      )`);
      sql.exec(`CREATE TABLE file_chunks (
        path    TEXT NOT NULL,
        idx     INTEGER NOT NULL,
        content BLOB NOT NULL,
        PRIMARY KEY (path, idx)
      )`);
      for (const dir of ["/", "/workspace", "/tmp", "/workspace/old"]) {
        sql.exec("INSERT INTO files (path, kind, content, size, mtime_ms, mode) VALUES (?, 'directory', NULL, 0, 1, 493)", dir);
      }
      const small = new TextEncoder().encode("from before pen\n");
      sql.exec("INSERT INTO files (path, kind, content, size, mtime_ms, mode) VALUES (?, 'file', ?, ?, 1, 420)", "/workspace/old/small.txt", small, small.byteLength);
      const big = new Uint8Array(CHUNK_BYTES + 100);
      for (let index = 0; index < big.length; index++) big[index] = index % 251;
      sql.exec("INSERT INTO files (path, kind, content, size, mtime_ms, mode) VALUES (?, 'file', ?, ?, 1, 420)", "/workspace/old/big.bin", big.subarray(0, CHUNK_BYTES), big.byteLength);
      sql.exec("INSERT INTO file_chunks (path, idx, content) VALUES (?, 1, ?)", "/workspace/old/big.bin", big.subarray(CHUNK_BYTES));
      const target = new TextEncoder().encode("small.txt");
      sql.exec("INSERT INTO files (path, kind, content, size, mtime_ms, mode) VALUES (?, 'symlink', ?, ?, 1, 511)", "/workspace/old/link", target, target.byteLength);
      sql.exec("INSERT INTO files (path, kind, content, size, mtime_ms, mode) VALUES (?, 'file', ?, ?, 1, 420)", "/tmp/spill.log", small, small.byteLength);
      const columnsBefore = sql.exec<{ name: string }>("PRAGMA table_info(files)").toArray().map((column) => column.name);
      expect(columnsBefore).not.toContain("hash");

      const files = new FilesTable(sql);
      files.init();

      const columnsAfter = sql.exec<{ name: string }>("PRAGMA table_info(files)").toArray().map((column) => column.name);
      expect(columnsAfter).toContain("hash");
      expect(files.manifest()).toEqual([
        { path: "old", kind: "directory", mode: 0o755, hash: null },
        { path: "old/big.bin", kind: "file", mode: 0o644, hash: await sha256(big) },
        { path: "old/link", kind: "symlink", mode: 0o777, hash: await sha256("small.txt") },
        { path: "old/small.txt", kind: "file", mode: 0o644, hash: await sha256("from before pen\n") },
      ]);
      expect(files.get("/tmp/spill.log")?.hash).toBe(await sha256("from before pen\n"));
      expect(sql.exec<{ n: number }>("SELECT count(*) AS n FROM files WHERE hash IS NULL AND kind != 'directory'").one().n).toBe(0);
      expect(files.readText("/workspace/old/small.txt")).toBe("from before pen\n");

      // Running init again is a no-op: the column stays, the hashes stay.
      new FilesTable(sql).init();
      expect(files.manifest()[1]!.hash).toBe(await sha256(big));
    });
  });
});
