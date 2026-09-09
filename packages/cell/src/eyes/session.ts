/**
 * The session: the cell's browser on the platform, one row in the cell's
 * own SQLite. A browser is worth more warm than the ten idle minutes
 * cost, so a look never launches when the last one left a browser behind:
 * it connects to the kept session by id, and launches with `keep_alive`
 * at ten minutes only when there is no id or the connect fails, which is
 * what a session that idled out looks like from here.
 *
 * After every look the browser is **disconnected**, never closed. Closing
 * would hand the platform back a browser the next look has to pay three
 * to ten seconds to launch again; disconnecting leaves it idle with its
 * keep-alive running, and the next look reaches it in under half a
 * second. Nothing here closes a browser: a session ends by idling out.
 */
import puppeteer, { type Browser } from "@cloudflare/puppeteer";

/** Ten minutes, the platform's maximum, in milliseconds. */
export const KEEP_ALIVE_MS = 600_000;

/** The one row: `key` is always `session`, so the table holds at most one. */
const KEY = "session";

export class EyesSession {
  /**
   * The table is made here rather than in an `init` the caller must
   * remember: it is one idempotent statement, and a cell that never looks
   * pays one `CREATE TABLE IF NOT EXISTS` for a table it never reads.
   */
  constructor(
    private readonly binding: Fetcher,
    private readonly sql: SqlStorage,
  ) {
    this.sql.exec("CREATE TABLE IF NOT EXISTS eyes_session (key TEXT PRIMARY KEY, session_id TEXT NOT NULL)");
  }

  /** The browser this cell last looked through, or `undefined` before its first look. */
  id(): string | undefined {
    return this.sql.exec<{ session_id: string }>("SELECT session_id FROM eyes_session WHERE key = ?", KEY).toArray()[0]?.session_id;
  }

  /**
   * A browser to look through: the kept session when it is still there,
   * a fresh one when it is not. The id that comes back is written down
   * either way, so the next look connects to what this look used.
   */
  async open(): Promise<Browser> {
    const kept = this.id();
    if (kept !== undefined) {
      try {
        return this.remember(await puppeteer.connect(this.binding, kept));
      } catch {
        // The session idled out, or the platform took it back. Launch another.
      }
    }
    return this.remember(await puppeteer.launch(this.binding, { keep_alive: KEEP_ALIVE_MS }));
  }

  /** Hand the browser back, warm, at the end of a look. */
  async release(browser: Browser): Promise<void> {
    await browser.disconnect();
  }

  private remember(browser: Browser): Browser {
    this.sql.exec("INSERT INTO eyes_session (key, session_id) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET session_id = excluded.session_id", KEY, browser.sessionId());
    return browser;
  }
}
