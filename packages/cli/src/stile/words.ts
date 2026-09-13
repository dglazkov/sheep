/**
 * The words: what `?` opens under a step of the stile (stile phase 1), and
 * the one line each step asks with (the second cut).
 *
 * Four things per step, in this order, because a person at a terminal
 * being asked for a secret wants exactly these four and nothing else:
 * **what** this step is for, **where** to get what it asks for, what it
 * **costs**, and what **sheep** does with it — and, as much, what it does
 * not do. Nothing here is a value and nothing here is read from a
 * credential; these are constants.
 *
 * The rule is the journey's: at most eight lines with the words open,
 * wrapped as the screen wraps them into its panel at eighty columns. The
 * command ring holds every step to it through `wordsAt` in `screen.ts`.
 * The two secrets and the plan are held to seven, since a box or a link
 * sits under their words and the whole of it is still one screen; the
 * account step, which has to name seven permissions and a dashboard
 * address, is the one that has come nearest.
 *
 * `QUESTIONS` is what a step's row says while it waits for an answer, and
 * `UNDER_BOX` what sits under a secret's box: the address it is made at,
 * so the shepherd is not sent behind `?` for it.
 */
import { PERMISSIONS, PLAN } from "../deploy.js";

/** The seven steps of the stile, in the order the checklist draws them. */
export const STEPS = ["command", "where", "account", "plan", "station", "key", "next"] as const;

export type StepName = (typeof STEPS)[number];

/** One step's four things. A step whose explanation is missing one of these is not explained. */
export interface Words {
  /** What this step is for. */
  what: string;
  /** Where to get what it asks for; for a step that asks for nothing, where the thing it settles lives. */
  where: string;
  /** What it costs, in money or in time; `nothing` where it costs nothing. */
  cost: string;
  /** What sheep will and will not do with it; the panel's label is `sheep`, so the text starts with the verb. */
  does: string;
}

/** The four things, in the order they are shown. */
export const THINGS = ["what", "where", "cost", "does"] as const satisfies readonly (keyof Words)[];

/** The panel's label for each thing: `does` is drawn as `sheep`, and the text reads on from it. */
export const LABELS: Record<(typeof THINGS)[number], string> = { what: "what", where: "where", cost: "cost", does: "sheep" };

/** The dashboard page a token is made on, named in the account step's words and under its box. */
export const TOKENS_PAGE = "https://dash.cloudflare.com/?to=/:account/api-tokens";
/** Where container minutes are priced, named in the plan step's words. */
export const PRICING_PAGE = "https://developers.cloudflare.com/containers/pricing/";
/** Where an Anthropic key is made, named in the key step's words and under its box. */
export const KEYS_PAGE = "https://console.anthropic.com/settings/keys";

/** The credentials file, by name, for the words that say where a value is kept. */
export const CREDENTIALS_FILE = "~/.sheep/credentials";

/** An address as the screen shows it: without its scheme, which a link carries for it. */
export const shown = (url: string): string => url.replace(/^https?:\/\//, "");

/** What a step's row says while it waits for its answer, before it has said anything: one line, short enough for the row beside the hint. */
export const QUESTIONS: Record<StepName, string> = {
  command: "the command on this machine's PATH",
  where: "where should this machine keep its settings?",
  account: "the Cloudflare account your home lives on",
  plan: "the plan your home's containers need",
  station: "which station should this machine's sheep live on?",
  key: "the Anthropic key your sheep call the model with",
  next: "what is done, and the one sentence to say",
};

/** Under a secret's box: the address the value is made at, and for the key where it goes, said once. */
export const UNDER_BOX: Record<"account" | "key", { madeAt: string; note?: string }> = {
  account: { madeAt: TOKENS_PAGE },
  key: { madeAt: KEYS_PAGE, note: `kept in ${CREDENTIALS_FILE} and put on the home as its secret` },
};

export const WORDS: Record<StepName, Words> = {
  command: {
    what: "sheep is the one command your coding agent runs to herd other coding agents.",
    where: "npm install -g github:dglazkov/sheep#release, which this step does when it is missing.",
    cost: "nothing: one command on your PATH, and a runtime fetched once when a home first needs it.",
    does: "installs the command and nothing else here; it changes no shell file and no PATH.",
  },
  where: {
    what: "where this machine keeps its settings: everywhere on it, or this directory alone.",
    where: "everywhere puts them in ~/.sheep; this directory puts them in .sheep/ here, git-ignored.",
    cost: "nothing. Everywhere is the usual answer, and every directory without its own falls back to it.",
    does: "writes the skill your agent reads and, for this directory, an empty .sheep/; nothing else.",
  },
  account: {
    what: "the Cloudflare account your home lives on.",
    where: `made at ${shown(TOKENS_PAGE)} with ${PERMISSIONS.join(", ")}.`,
    cost: "free; the plan it needs is the next step.",
    does: `in ${CREDENTIALS_FILE}, mode 600; for Cloudflare only.`,
  },
  plan: {
    what: `${PLAN.name}, the plan your sheep's containers need.`,
    where: "turned on at the dashboard's plans page, printed here.",
    cost: `${PLAN.price}, and container minutes while a sheep works, at ${shown(PRICING_PAGE)}.`,
    does: "reads which plan the account is on and never changes it; that is yours, on the dashboard.",
  },
  station: {
    what: "your home: one Worker and its container application, on the account, where every sheep lives.",
    where: "deployed from this package by sheep itself, or one the account already has, joined; nothing to copy.",
    cost: "the plan above, and container minutes only while a sheep is working; an idle home costs nothing.",
    does: "deploys it, generates the home's own token, and keeps that token in this kennel's config, mode 600.",
  },
  key: {
    what: "the Anthropic key your sheep call the model with, held by the home as its own secret.",
    where: `made at ${shown(KEYS_PAGE)}.`,
    cost: "what your sheep spend at Anthropic's rates; sheep adds nothing to it.",
    does: `put on the home over Cloudflare's API, a copy kept in ${CREDENTIALS_FILE}, mode 600; never printed.`,
  },
  next: {
    what: "what is done, where it is kept, and the one sentence to say to your coding agent.",
    where: `the addresses and paths on this line; the two values are in ${CREDENTIALS_FILE} and nowhere else.`,
    cost: "nothing from here on: your agent runs sheep, and nothing asks you for a value again.",
    does: "asks you for nothing after this sitting; a rotated value is this same command, run again.",
  },
};

/** One step's words, unwrapped: the four things with the labels the panel draws, in the order `THINGS` names. The screen wraps them. */
export function explain(step: StepName): { label: string; text: string }[] {
  const words = WORDS[step];
  return THINGS.map((thing) => ({ label: LABELS[thing], text: words[thing] }));
}
