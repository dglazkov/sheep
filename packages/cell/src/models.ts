/**
 * The cell's model runtime: pi-ai's `Models` with the provider the home's
 * secrets name. `pi-coding-agent`'s `ModelRuntime` reads `~/.pi`; the cell
 * has no home directory, so its auth context answers from the Worker's
 * environment and nothing else.
 */
import { type Api, type Context as Conversation, createModels, type Model, type Models, type SimpleStreamOptions } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { type FauxProviderHandle, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
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

export function createCellModels(env: Env, hooks: { onProviderCall?: () => Promise<void> } = {}): CellModels {
  if (env.LAMB_PROVIDER === "faux") {
    const faux = fauxProvider();
    // The faux provider consumes one queued step per call; one factory that
    // re-queues itself answers every call from the module-level script.
    const step = async (conversation: Conversation, options: SimpleStreamOptions | undefined): Promise<AssistantMessage> => {
      faux.appendResponses([step]);
      await hooks.onProviderCall?.();
      return fauxScript(conversation, options);
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
