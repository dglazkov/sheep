/**
 * Hill phase 1, journey 4 step 3: the page's own logic with no browser and
 * no home. The address rewrite (journey 1 step 2: the browser is at
 * `/hill/` with no pass in the address, on a refusal too), the load flow
 * as a function of the home's answers, sign out, and the client, which
 * sends no token because it has none.
 */
import { describe, expect, it } from "vitest";
import { PASS_EXPIRED, PASS_USED } from "../../cell/src/hill-words.ts";
import { land, passIn, signOut, withoutPass } from "../src/flow.ts";
import { type Answer, type HomeClient, homeClient } from "../src/home.ts";

const PASS = "9f3c5e1d7b2a4c6e8f0a1b3c5d7e9f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8e2a1";
const STATION = "https://sheep-2.glazkov.workers.dev";
const BUILD = "3b38f11 2026-09-14T18:02:11Z";

/** A home that answers each route as given, and remembers what was asked in order. */
function fakeHome(answers: Partial<Record<"seat" | "home" | "leave" | "sessions", Answer | Error>>): HomeClient & { asked: string[] } {
  const asked: string[] = [];
  const answer = async (route: "seat" | "home" | "leave" | "sessions", said: string): Promise<Answer> => {
    asked.push(said);
    const given = answers[route];
    if (given === undefined) throw new Error(`the flow asked ${said}, which this case does not answer`);
    if (given instanceof Error) throw given;
    return given;
  };
  return { asked, seat: (pass) => answer("seat", `seat ${pass}`), home: () => answer("home", "home"), leave: () => answer("leave", "leave"), sessions: () => answer("sessions", "sessions") };
}

describe("the address rewrite", () => {
  it("takes the pass out and keeps the path, a deep one included, and anything else the address carried", () => {
    expect(withoutPass(`${STATION}/hill/?pass=${PASS}`)).toBe("/hill/");
    expect(withoutPass(`${STATION}/hill/s/8c1f2a4e?pass=${PASS}`)).toBe("/hill/s/8c1f2a4e");
    expect(withoutPass(`${STATION}/hill/?view=wide&pass=${PASS}#top`)).toBe("/hill/?view=wide#top");
    expect(withoutPass(`${STATION}/hill/`)).toBe("/hill/");
  });

  it("finds the pass, an empty one included, and none where there is none", () => {
    expect(passIn(`${STATION}/hill/?pass=${PASS}`)).toBe(PASS);
    expect(passIn(`${STATION}/hill/?pass=`)).toBe("");
    expect(passIn(`${STATION}/hill/`)).toBeNull();
  });
});

describe("the flow on load", () => {
  it("a pass taken: the seat asked for first, then the address replaced with no pass in it, and the seated shell", async () => {
    const home = fakeHome({ seat: { status: 204, text: "", build: BUILD } });
    const replaced: string[] = [];
    const landed = await land(`${STATION}/hill/?pass=${PASS}`, home, (address) => {
      replaced.push(address);
      home.asked.push(`replace ${address}`);
    });
    expect(landed).toEqual({ landing: { seated: true }, build: BUILD });
    expect(home.asked).toEqual([`seat ${PASS}`, "replace /hill/"]);
    expect(replaced).toEqual(["/hill/"]);
  });

  it("a pass refused: the address replaced all the same, and the gate with the reason the home's sentence names", async () => {
    for (const [body, refused] of [
      [PASS_USED, "used"],
      [PASS_EXPIRED, "expired"],
    ] as const) {
      const home = fakeHome({ seat: { status: 403, text: body, build: BUILD } });
      const replaced: string[] = [];
      const landed = await land(`${STATION}/hill/s/8c1f2a4e?pass=${PASS}`, home, (address) => replaced.push(address));
      expect(landed).toEqual({ landing: { seated: false, refused }, build: BUILD });
      expect(replaced).toEqual(["/hill/s/8c1f2a4e"]);
    }
  });

  it("a seat that cannot be asked for: the pass still leaves the address, and the gate says nothing it does not know", async () => {
    const home = fakeHome({ seat: new TypeError("Failed to fetch") });
    const replaced: string[] = [];
    expect(await land(`${STATION}/hill/?pass=${PASS}`, home, (address) => replaced.push(address))).toEqual({ landing: { seated: false, refused: null }, build: null });
    expect(replaced).toEqual(["/hill/"]);
  });

  it("no pass: GET /home decides, a 200 the seated shell and a 401 the gate with no reason, and the address is left alone", async () => {
    const replaced: string[] = [];
    const seated = fakeHome({ home: { status: 200, text: "{}", build: BUILD } });
    expect(await land(`${STATION}/hill/`, seated, (address) => replaced.push(address))).toEqual({ landing: { seated: true }, build: BUILD });
    const cold = fakeHome({ home: { status: 401, text: "bad or missing token", build: BUILD } });
    expect(await land(`${STATION}/hill/`, cold, (address) => replaced.push(address))).toEqual({ landing: { seated: false, refused: null }, build: BUILD });
    expect(seated.asked).toEqual(["home"]);
    expect(cold.asked).toEqual(["home"]);
    expect(replaced).toEqual([]);
  });

  it("sign out: the seat given up, then the gate, even when the home did not answer", async () => {
    const home = fakeHome({ leave: { status: 204, text: "", build: BUILD } });
    expect(await signOut(home)).toEqual({ seated: false, refused: null });
    expect(home.asked).toEqual(["leave"]);
    expect(await signOut(fakeHome({ leave: new TypeError("Failed to fetch") }))).toEqual({ seated: false, refused: null });
  });
});

describe("the client", () => {
  it("asks the four routes at the page's own origin with no header of its own: no authorization, no token anywhere", async () => {
    const asked: { input: string; init: RequestInit }[] = [];
    const client = homeClient(async (input, init) => {
      asked.push({ input, init });
      const body = input === "/home" ? "{}" : input === "/sessions" ? "[]" : null;
      return new Response(body, { status: body === null ? 204 : 200, headers: { "x-sheep-build": BUILD } });
    });
    expect(await client.seat(PASS)).toEqual({ status: 204, text: "", build: BUILD });
    expect(await client.home()).toEqual({ status: 200, text: "{}", build: BUILD });
    expect(await client.leave()).toEqual({ status: 204, text: "", build: BUILD });
    expect(await client.sessions()).toEqual({ status: 200, text: "[]", build: BUILD });
    expect(asked.map(({ input, init }) => `${init.method} ${input}`)).toEqual([`GET /hill/seat?pass=${PASS}`, "GET /home", "DELETE /hill/seat", "GET /sessions"]);
    for (const { input, init } of asked) {
      expect(init.headers).toBeUndefined();
      expect(init.credentials).toBe("same-origin");
      expect(`${input} ${JSON.stringify(init)}`.toLowerCase()).not.toMatch(/token|bearer|authorization/);
    }
  });
});
