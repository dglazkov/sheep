/**
 * The cell's model runtime: pi-ai's `Models` with the provider the home's
 * secrets name. `pi-coding-agent`'s `ModelRuntime` reads `~/.pi`; the cell
 * has no home directory, so its auth context answers from the Worker's
 * environment and nothing else.
 */
import { type Api, type Context as Conversation, createModels, type Model, type Models, type SimpleStreamOptions } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { type FauxProviderHandle, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { AssistantMessage } from "@earendil-works/pi-ai";

export const DEFAULT_MODEL = "claude-sonnet-5";

export interface CellModels {
  models: Models;
  model: Model<Api>;
  /** Present only when the home runs the faux provider, for tests. */
  faux?: FauxProviderHandle;
}

/**
 * A scripted reply for the faux provider, decided from the conversation so
 * far rather than from call order, so it survives a reboot mid-turn.
 */
export type FauxScript = (conversation: Conversation, options: SimpleStreamOptions | undefined) => AssistantMessage;

/** Module-level so a test can set it once and every reboot's provider reads it. */
export let fauxScript: FauxScript = () => fauxAssistantMessage("ok");

export function setFauxScript(script: FauxScript): void {
  fauxScript = script;
}

/**
 * A faux script as data, for a home that a test drives from outside its
 * isolate (`wrangler dev`). Each user turn runs the steps from the start:
 * the nth step answers the nth model call since the last user message, and
 * the last step repeats. A step is a tool call or a text reply, after an
 * optional delay so a turn is observably running.
 */
export interface FauxStep {
  text?: string;
  tool?: { name: string; args: Record<string, unknown> };
  delayMs?: number;
}

export interface FauxProgram {
  steps: FauxStep[];
}

export function isFauxProgram(value: unknown): value is FauxProgram {
  if (typeof value !== "object" || value === null) return false;
  const steps = (value as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length === 0) return false;
  return steps.every((step: unknown) => {
    if (typeof step !== "object" || step === null) return false;
    const { text, tool, delayMs } = step as FauxStep;
    if (text !== undefined && typeof text !== "string") return false;
    if (delayMs !== undefined && (typeof delayMs !== "number" || delayMs < 0)) return false;
    if (tool !== undefined && (typeof tool !== "object" || tool === null || typeof tool.name !== "string" || typeof tool.args !== "object" || tool.args === null)) return false;
    return true;
  });
}

export async function answerFromProgram(program: FauxProgram, conversation: Conversation, options: SimpleStreamOptions | undefined): Promise<AssistantMessage> {
  const messages = conversation.messages;
  let sinceUser = 0;
  for (let i = messages.length - 1; i >= 0 && messages[i]!.role !== "user"; i--) {
    if (messages[i]!.role === "assistant") sinceUser++;
  }
  const step = program.steps[Math.min(sinceUser, program.steps.length - 1)]!;
  if (step.delayMs !== undefined && step.delayMs > 0) await delay(step.delayMs, options?.signal);
  if (step.tool !== undefined) return fauxAssistantMessage([fauxToolCall(step.tool.name, step.tool.args)], { stopReason: "toolUse" });
  return fauxAssistantMessage(step.text ?? "");
}

/** Waits `ms`, or until the provider call is aborted; the faux stream then settles the abort itself. */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

export interface CellModelHooks {
  onProviderCall?: () => Promise<void>;
  /** With the faux provider: the program this cell answers from, if one is set; otherwise the module-level script. */
  program?: () => Promise<FauxProgram | undefined>;
}

export function createCellModels(env: Env, hooks: CellModelHooks = {}): CellModels {
  if (env.LAMB_PROVIDER === "faux") {
    const faux = fauxProvider();
    // The faux provider consumes one queued step per call; one factory that
    // re-queues itself answers every call from the program or the script.
    const step = async (conversation: Conversation, options: SimpleStreamOptions | undefined): Promise<AssistantMessage> => {
      faux.appendResponses([step]);
      await hooks.onProviderCall?.();
      const program = await hooks.program?.();
      return program === undefined ? fauxScript(conversation, options) : answerFromProgram(program, conversation, options);
    };
    faux.setResponses([step]);
    const models = createModels();
    models.setProvider(faux.provider);
    return { models, model: faux.getModel(), faux };
  }
  const secrets: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: env.LAMB_ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY,
  };
  const models = createModels({
    authContext: {
      async env(name) {
        const value = secrets[name];
        return value && value.trim().length > 0 ? value : undefined;
      },
      async fileExists() {
        return false;
      },
    },
  });
  models.setProvider(anthropicProvider());
  const wanted = env.LAMB_MODEL ?? DEFAULT_MODEL;
  const model = models.getModel("anthropic", wanted) ?? models.getModels("anthropic")[0];
  if (model === undefined) throw new Error("No Anthropic model available");
  return { models, model };
}
