/**
 * The words: what `?` opens under a step of the stile (stile phase 1).
 *
 * Four things per step, in this order, because a person at a terminal
 * being asked for a secret wants exactly these four and nothing else:
 * **what** this step is for, **where** to get what it asks for, what it
 * **costs**, and what sheep **does** with it — and, as much, what it does
 * not do. Nothing here is a value and nothing here is read from a
 * credential; these are constants.
 *
 * The rule is the journey's: at most eight lines with the words open,
 * wrapped as the screen wraps them at eighty columns. The command ring
 * holds every step to it through `wordsAt` in `screen.ts`, and the account
 * step, which has to name six permissions and a dashboard address, is the
 * one that has come nearest.
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
  /** What sheep will and will not do with it. */
  does: string;
}

/** The four things, in the order they are shown. */
export const THINGS = ["what", "where", "cost", "does"] as const satisfies readonly (keyof Words)[];

/** The dashboard page a token is made on, named in the account step's words. */
export const TOKENS_PAGE = "https://dash.cloudflare.com/?to=/:account/api-tokens";
/** Where container minutes are priced, named in the plan step's words. */
export const PRICING_PAGE = "https://developers.cloudflare.com/containers/pricing/";
/** Where an Anthropic key is made, named in the key step's words. */
export const KEYS_PAGE = "https://console.anthropic.com/settings/keys";

/** The credentials file, by name, for the words that say where a value is kept. */
export const CREDENTIALS_FILE = "~/.sheep/credentials";

export const WORDS: Record<StepName, Words> = {
  command: {
    what: "sheep is the one command your coding agent runs to herd other coding agents.",
    where: "npm install -g github:dglazkov/sheep#release, which this step does when it is missing.",
    cost: "nothing: one command on your PATH, and a runtime fetched once when a home first needs it.",
    does: "sheep installs the command and nothing else here; it changes no shell file and no PATH.",
  },
  where: {
    what: "where this machine keeps its settings: everywhere on it, or this directory alone.",
    where: "everywhere puts them in ~/.sheep; this directory puts them in .sheep/ here, git-ignored.",
    cost: "nothing. Everywhere is the usual answer, and every directory without its own falls back to it.",
    does: "sheep writes the skill your agent reads and, for this directory, an empty .sheep/; nothing else.",
  },
  account: {
    what: "the Cloudflare account your home is deployed on, proved by an API token.",
    where: `made at ${TOKENS_PAGE}, with: ${PERMISSIONS.join(", ")}.`,
    cost: "the account is free; the plan it needs is the next step.",
    does: `sheep keeps it in ${CREDENTIALS_FILE}, mode 600, and sends it to Cloudflare alone; never printed, logged, or an argument.`,
  },
  plan: {
    what: `the ${PLAN.name} plan, which the containers your sheep work in need.`,
    where: "turned on at your Cloudflare dashboard's Workers plans page, which this step prints.",
    cost: `${PLAN.price}, and a container's minutes while a sheep is using one, at the rate on ${PRICING_PAGE}.`,
    does: "sheep reads which plan the account is on and never changes it; that is yours to do, on the dashboard.",
  },
  station: {
    what: "your home: one Worker and its container application, on the account, where every sheep lives.",
    where: "deployed from this package by sheep itself; nothing to fetch and nothing to copy.",
    cost: "the plan above, and container minutes only while a sheep is working; an idle home costs nothing.",
    does: "sheep deploys it, generates the home's own token, and keeps that token in this kennel's config, mode 600.",
  },
  key: {
    what: "the Anthropic key your sheep call the model with, held by the home as its own secret.",
    where: `made at ${KEYS_PAGE}.`,
    cost: "what your sheep spend at Anthropic's rates; sheep adds nothing to it.",
    does: `sheep puts it on the home over Cloudflare's API and keeps a copy in ${CREDENTIALS_FILE}, mode 600; it is never printed or passed as an argument.`,
  },
  next: {
    what: "what is done, where it is kept, and the one sentence to say to your coding agent.",
    where: `the addresses and paths on this line; the two values are in ${CREDENTIALS_FILE} and nowhere else.`,
    cost: "nothing from here on: your agent runs sheep, and nothing asks you for a value again.",
    does: "sheep asks you for nothing after this sitting; a rotated value is this same command, run again.",
  },
};

/** One step's words as lines, unwrapped: four, in the order `THINGS` names. The screen wraps them. */
export function explain(step: StepName): string[] {
  const words = WORDS[step];
  return [`what:  ${words.what}`, `where: ${words.where}`, `cost:  ${words.cost}`, `sheep: ${words.does}`];
}
