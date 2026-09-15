/**
 * The flow on load (hill phase 1), pure over the address, the home's
 * answers, and a way to replace the address, so it runs in Node.
 *
 * With `?pass=` in the address, the seat is asked for first, and then the
 * address is replaced with the same path and no pass, whatever the answer,
 * so the pass leaves the bar and the history on a refusal too: a 204 is
 * the seated shell, a 403 the gate with its reason. With no pass, `GET
 * /home` decides: a 200 is the seated shell, anything else the gate.
 */
import type { Answer, HomeClient } from "./home.ts";
import { type Refusal, refusalOf } from "./words.ts";

export type Landing = { seated: true } | { seated: false; refused: Refusal | null };

/** The pass in an address, or `null` when it carries none; an empty `?pass=` is a pass, and the home refuses it. */
export function passIn(href: string): string | null {
  return new URL(href).searchParams.get("pass");
}

/** The address with the pass taken out: the path, any other query, and the hash, as `history.replaceState` takes it. */
export function withoutPass(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("pass");
  const query = url.searchParams.toString();
  return `${url.pathname}${query === "" ? "" : `?${query}`}${url.hash}`;
}

/** What the load came to: the view, and the build the first answer carried. */
export interface Landed {
  landing: Landing;
  build: string | null;
}

const gate = (refused: Refusal | null): Landing => ({ seated: false, refused });

export async function land(href: string, client: HomeClient, replace: (address: string) => void): Promise<Landed> {
  const pass = passIn(href);
  if (pass !== null) {
    let answer: Answer | undefined;
    try {
      answer = await client.seat(pass);
    } catch {
      // no answer: the gate with no reason, and the pass out of the bar all the same
    } finally {
      replace(withoutPass(href));
    }
    if (answer === undefined) return { landing: gate(null), build: null };
    if (answer.status === 204) return { landing: { seated: true }, build: answer.build };
    if (answer.status === 403) return { landing: gate(refusalOf(answer.text)), build: answer.build };
    return { landing: gate(null), build: answer.build };
  }
  try {
    const answer = await client.home();
    return { landing: answer.status === 200 ? { seated: true } : gate(null), build: answer.build };
  } catch {
    return { landing: gate(null), build: null };
  }
}

/** Sign out: the seat given up, then the gate with no reason, whatever the home said. */
export async function signOut(client: HomeClient): Promise<Landing> {
  try {
    await client.leave();
  } catch {
    // the gate regardless: a page that shows a seat after sign out is the bug
  }
  return gate(null);
}
