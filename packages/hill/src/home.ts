/**
 * The page's client for the home (hill phase 1): `fetch` at the page's own
 * origin, and nothing else. It has no token and sends none: no
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

/** The routes the page reads this phase. Each is one request with no header of the page's own. */
export interface HomeClient {
  /** `GET /hill/seat?pass=`: a 204 and the cookie, or a 403 and the gate's sentence. */
  seat(pass: string): Promise<Answer>;
  /** `GET /home`: a 200 for a seat that stands, the 401 for none. */
  home(): Promise<Answer>;
  /** `DELETE /hill/seat`: sign out. */
  leave(): Promise<Answer>;
}

export function homeClient(fetcher: Fetcher = (input, init) => fetch(input, init)): HomeClient {
  const ask = async (method: "GET" | "DELETE", path: string): Promise<Answer> => {
    const response = await fetcher(path, { method, credentials: "same-origin", cache: "no-store" });
    return { status: response.status, text: await response.text(), build: response.headers.get("x-sheep-build") };
  };
  return {
    seat: (pass) => ask("GET", `/hill/seat?pass=${encodeURIComponent(pass)}`),
    home: () => ask("GET", "/home"),
    leave: () => ask("DELETE", "/hill/seat"),
  };
}
