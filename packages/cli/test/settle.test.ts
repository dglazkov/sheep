/**
 * The guard on the account ring's settle wait (serve phase 2, `s2`).
 *
 * The account ring itself spends on the shepherd's account and is run by
 * hand, so the one part of it that can be wrong quietly — the wait that
 * decides whether a served look is taken into a rollout — is proved here
 * against a scripted account API instead.
 *
 * What `settleStation` is for: `sheep home deploy` returns as soon as the
 * rollout's last step is under way, and while the platform finishes it a
 * container it starts is one it will replace. Replacing it is a SIGTERM
 * to the container's PID 1, which the pen agent answers by closing the
 * socket (`1000: SIGTERM`), and a run open on that socket — which is what
 * a served look holds, across a browser render — ends as "the container
 * went away during the run". So the ring waits for the platform to say
 * the rollout is completed and the application configured with the image,
 * and the cases below say that it waits for exactly that: it does not
 * shorten the wait, does not retry the look, and does not pass a station
 * that never settled.
 *
 * This lives in the CLI's suite for the same reason the ring guard and
 * the release manifest's guard do: the package that ships the command is
 * where the repository's own rules are checked.
 */
import { describe, expect, it } from "vitest";
import { settleStation } from "../../../scripts/hermetic.mjs";

const IMAGE = "docker.io/dglazkov/sheep-pen:newer";
const OLDER = "docker.io/dglazkov/sheep-pen:older";
const STATION = { account: { id: "0123456789abcdef" }, name: "sheep-hermetic-abc1234", image: IMAGE };

/** The ring's `fail`, which throws with the step and the command on it; the real one is `Ring.fail` in `scripts/hermetic.mjs`. */
const ring = {
  fail(step: string, command: string, result: { stdout: string; stderr: string; code: number }): never {
    const error: Error & { ring?: unknown } = new Error(`${step}: ${command}`);
    error.ring = { step, command, result };
    throw error;
  },
};

/** An account API that answers each round from a script; `rollouts` is whatever that round says, and a round may throw instead. */
function scripted(rounds: { image?: string | null; rollouts?: unknown[]; throws?: string }[]) {
  const asked: number[] = [];
  let round = -1;
  const at = () => rounds[Math.min(round, rounds.length - 1)]!;
  return {
    asked,
    api: {
      async application(_accountId: string, name: string) {
        round++;
        asked.push(round);
        if (at().throws !== undefined) throw new Error(at().throws);
        return { id: "app-1", name, image: at().image ?? null };
      },
      async rollouts() {
        return at().rollouts ?? [];
      },
    },
  };
}

const rolling = { id: "r1", status: "progressing", targetImage: IMAGE, steps: [{ status: "completed", percentage: 34 }, { status: "progressing", percentage: 100 }] };
const completed = { id: "r1", status: "completed", targetImage: IMAGE, steps: [{ status: "completed", percentage: 34 }, { status: "completed", percentage: 100 }] };
/** Milliseconds, so the whole wait runs inside a test; the ring passes none of these and uses 5 s, 300 s, 30 s. */
const fast = { step: "s2", pollMs: 1, budgetMs: 2_000, sayMs: 10_000, say: () => {} };

describe("the account ring's settle wait", () => {
  it("returns at once when the rollout completed and the application is configured with the image", async () => {
    const { api, asked } = scripted([{ image: IMAGE, rollouts: [completed] }]);
    const settled = await settleStation(ring, api, STATION, fast);
    expect(settled.waited).toBe(false);
    expect(settled.rounds).toBe(0);
    expect(asked.length).toBe(1);
    expect(settled.line).toContain("settled before this step");
    expect(settled.line).toContain(IMAGE);
  });

  it("waits while the platform is still rolling, and returns once it is not", async () => {
    const { api, asked } = scripted([
      { image: OLDER, rollouts: [rolling] },
      { image: OLDER, rollouts: [rolling] },
      { image: IMAGE, rollouts: [rolling] },
      { image: IMAGE, rollouts: [completed] },
    ]);
    const said: string[] = [];
    const settled = await settleStation(ring, api, STATION, { ...fast, sayMs: 0, say: (line: string) => said.push(line) });
    expect(settled.waited).toBe(true);
    expect(settled.rounds).toBe(3);
    expect(asked.length).toBe(4);
    // The rollout still rolling is not settled even once the configuration names the image: the third round waited too.
    expect(said.filter((line) => line.includes("waiting for the station to settle")).length).toBe(3);
    expect(said.at(-1)).toContain("settled after");
  });

  it("does not call a station settled while the application is still configured with the older image", async () => {
    // The rollout says completed and the configuration has not caught up; `deploy` waits for both, and so does this.
    const { api } = scripted([{ image: OLDER, rollouts: [completed] }]);
    await expect(settleStation(ring, api, STATION, { ...fast, budgetMs: 20 })).rejects.toThrow("s2: GET /accounts/012345…/containers/applications[/<id>/rollouts]");
  });

  it("ignores a rollout that targets some other image", async () => {
    const { api } = scripted([{ image: IMAGE, rollouts: [{ ...rolling, targetImage: "docker.io/someone/else:1" }] }]);
    const settled = await settleStation(ring, api, STATION, fast);
    expect(settled.waited).toBe(false);
    expect(settled.line).toContain("no rollout to wait for");
  });

  it("fails the step on a rollout that will not complete, saying so, rather than waiting out the budget", async () => {
    for (const status of ["failed", "reverted", "rolled_back"]) {
      const { api, asked } = scripted([{ image: OLDER, rollouts: [{ ...rolling, status }] }]);
      let thrown: (Error & { ring?: { result?: { stderr?: string } } }) | undefined;
      await settleStation(ring, api, STATION, fast).catch((error: Error) => {
        thrown = error;
      });
      expect(thrown, `a ${status} rollout did not fail the step`).toBeDefined();
      expect(thrown!.message).toContain("s2: GET /accounts/012345…");
      // The word the platform used, and why it matters — not the budget's line, which would mean this was found by waiting it out.
      expect(thrown!.ring?.result?.stderr).toContain(`${status}; the station never took the image this ring deployed`);
      expect(asked.length, "the step waited instead of failing on the first answer").toBe(1);
    }
  });

  it("fails the step when the budget runs out with the rollout still going, and never returns settled", async () => {
    const { api, asked } = scripted([{ image: OLDER, rollouts: [rolling] }]);
    let thrown: (Error & { ring?: { result?: { stderr?: string; stdout?: string } } }) | undefined;
    await settleStation(ring, api, STATION, { ...fast, budgetMs: 30 }).catch((error: Error) => {
      thrown = error;
    });
    expect(thrown, "the wait returned instead of failing the step").toBeDefined();
    expect(thrown!.ring?.result?.stderr).toContain("1000: SIGTERM");
    expect(thrown!.ring?.result?.stdout).toContain("progressing");
    expect(asked.length).toBeGreaterThan(1);
  });

  it("takes an account API that throws as another round, not as settled", async () => {
    const { api, asked } = scripted([{ throws: "GET /accounts: 500" }, { throws: "GET /accounts: 500" }, { image: IMAGE, rollouts: [completed] }]);
    const settled = await settleStation(ring, api, STATION, fast);
    expect(settled.waited).toBe(true);
    expect(asked.length).toBe(3);
  });

  it("says what it was still waiting for when the budget ran out", async () => {
    const { api } = scripted([{ image: OLDER, rollouts: [rolling] }]);
    let thrown: (Error & { ring?: { result?: { stdout?: string } } }) | undefined;
    await settleStation(ring, api, STATION, { ...fast, budgetMs: 10 }).catch((error: Error) => {
      thrown = error;
    });
    expect(thrown!.ring?.result?.stdout).toContain(`the rollout to ${IMAGE} is progressing`);
    expect(thrown!.ring?.result?.stdout).toContain(`configured with ${OLDER}`);
  });
});
