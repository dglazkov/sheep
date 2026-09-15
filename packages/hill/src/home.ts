/**
 * The page's client for the home (hill phases 1 to 3): `fetch` at the
 * page's own origin, and nothing else. The flock reads `GET /home` and `GET
 * /sessions`, and a sheep's page `GET /s/<id>/` and `GET
 * /s/<id>/transcript?wait=25000&tip=`, the routes the dog and the collie
 * already read, and adds none. It has no token and sends none: no
 * `authorization` header, no `?token=`. The browser adds the seat's cookie
 * itself, since every route is same-origin; the cookie is `HttpOnly`, so no
 * script here can read it, and this one never tries.
 */

/** What an answer is to the flow: its status, its body as text, and the build header the Worker stamps on every response. */
export interface Answer {
  status: number;
  text: string;
  build: string | null;
}

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** How long a transcript read asks the cell to hold it open: the cell's own ceiling, the collie's `FOLLOW_WAIT_MS`. */
export const TRANSCRIPT_WAIT_MS = 25_000;

/** The routes the page asks. Each is one request with no header of the page's own. */
export interface HomeClient {
  /** `GET /hill/seat?pass=`: a 204 and the cookie, or a 403 and the gate's sentence. */
  seat(pass: string): Promise<Answer>;
  /** `GET /home`: a 200 for a seat that stands, the 401 for none. */
  home(): Promise<Answer>;
  /** `DELETE /hill/seat`: sign out. */
  leave(): Promise<Answer>;
  /** `GET /sessions` (hill phase 2): every sheep at the home, newest first, as `sheep ls` reads them. */
  sessions(): Promise<Answer>;
}

/** A sheep's page's two reads (hill phase 3), each abandoned by its signal when the page leaves the sheep. */
export interface SheepClient {
  /** `GET /s/<id>/`: the cell's state, whose `operation` is the turn open now. */
  cell(id: string, signal?: AbortSignal): Promise<Answer>;
  /** `GET /s/<id>/transcript?wait=25000&tip=<tip>`: the whole view, when the tip moves past `tip`, the turn ends, or the wait does. */
  transcript(id: string, tip: string | null, signal?: AbortSignal): Promise<Answer>;
}

export function homeClient(fetcher: Fetcher = (input, init) => fetch(input, init)): HomeClient & SheepClient {
  const ask = async (method: "GET" | "DELETE", path: string, signal?: AbortSignal): Promise<Answer> => {
    const response = await fetcher(path, signal === undefined ? { method, credentials: "same-origin", cache: "no-store" } : { method, credentials: "same-origin", cache: "no-store", signal });
    return { status: response.status, text: await response.text(), build: response.headers.get("x-sheep-build") };
  };
  return {
    seat: (pass) => ask("GET", `/hill/seat?pass=${encodeURIComponent(pass)}`),
    home: () => ask("GET", "/home"),
    leave: () => ask("DELETE", "/hill/seat"),
    sessions: () => ask("GET", "/sessions"),
    cell: (id, signal) => ask("GET", `/s/${encodeURIComponent(id)}/`, signal),
    transcript: (id, tip, signal) => ask("GET", `/s/${encodeURIComponent(id)}/transcript?wait=${TRANSCRIPT_WAIT_MS}&tip=${encodeURIComponent(tip ?? "")}`, signal),
  };
}
