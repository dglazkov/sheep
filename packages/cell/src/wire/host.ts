/**
 * pi-server's `ServerHost` for a cell. The server-scoped services
 * (directory, management, presentation plugins) come from pi's own
 * provider over the home's Directory; the session-scoped ones (transcript,
 * agent controller, models) come from pi's worker-services factory, which
 * here runs in-process over the cell's lane instead of in a child process.
 */
import { BACKGROUND_CONTEXT, type Context, type SessionMetadata } from "@earendil-works/pi-agent-core";
import { createExperimentalServerServices } from "@earendil-works/pi-coding-agent/experimental/services/server";
import { createSessionWorkerServices, type WorkerServiceScope } from "@earendil-works/pi-coding-agent/experimental/services/worker";
import type { AgentLane } from "@earendil-works/pi-agent-core";
import type { ServiceProviderUpdate } from "@earendil-works/chord";
import type { RoutedSessionAttachment, RoutedSessionHandle, ServerHost } from "@earendil-works/pi-server";
import { SessionNotFoundError } from "@earendil-works/pi-server";
import type { SessionSummary } from "../directory.ts";

const EMPTY_PRESENTATION_PLUGINS = { presentationFacetBundles: [] };

export interface CellHostOptions {
  serverId: string;
  sessionId: string;
  metadata: SessionMetadata;
  lane: AgentLane;
  directory: {
    list(): Promise<SessionSummary[]>;
    create(name: string | null): Promise<SessionSummary>;
  };
}

type Publish = (subscriptionId: string, update: ServiceProviderUpdate, context: Context) => void | Promise<void>;

export async function createCellHost(options: CellHostOptions): Promise<{ host: ServerHost; dispose(): Promise<void> }> {
  const summarize = (session: SessionSummary) => ({ serverId: options.serverId, sessionId: session.id, createdAt: session.createdAt });
  const serverServices = await createExperimentalServerServices({
    list: async () => (await options.directory.list()).map(summarize),
    create: async (createOptions) => {
      if (createOptions.id !== undefined && createOptions.id !== options.sessionId) {
        throw new Error("A cell creates only its own session; ask the home for a new one");
      }
      const existing = (await options.directory.list()).find((session) => session.id === options.sessionId);
      return summarize(existing ?? (await options.directory.create(null)));
    },
    remove: async () => {
      throw new Error("Removing sessions is not available in this leg");
    },
    prepareSessionPlugins: async () => ({ packagePaths: [], presentationPlugins: EMPTY_PRESENTATION_PLUGINS }),
    reloadPresentationPlugins: async () => EMPTY_PRESENTATION_PLUGINS,
  });

  const publishers = new Map<string, Publish>();
  const scopeKey = (scope: WorkerServiceScope): string => `${scope.serverConnectionId}\0${scope.attachmentId}`;
  const sessionServices = await createSessionWorkerServices({
    lane: options.lane,
    modelRuntime: undefined,
    async publish(scope, subscriptionId, update) {
      const publish = publishers.get(scopeKey(scope));
      if (publish === undefined) return;
      // pi's tool progress can carry `details: undefined`, which pi's strict codec refuses to encode and
      // pi-server answers by dropping the connection. Absent and undefined mean the same to the replica.
      await publish(subscriptionId, toStrictJson(update), BACKGROUND_CONTEXT);
    },
  });

  const handle: RoutedSessionHandle = {
    async attachClient(): Promise<RoutedSessionAttachment> {
      const scope: WorkerServiceScope = { serverConnectionId: "cell", attachmentId: crypto.randomUUID() };
      const key = scopeKey(scope);
      return {
        async invokeService(call, publish, context) {
          publishers.set(key, publish);
          // The same rule for an invoke's result as for a publish: a client that attaches while a container
          // command streams hydrates from a snapshot carrying the live bash update, `details: { truncation: undefined }`
          // inside, and the strict codec would drop the connection on it (pen phase 3, journey 1's `sheep wait`).
          return toStrictJson(await sessionServices.invoke(call, scope, context));
        },
        release() {
          publishers.delete(key);
          sessionServices.removeSubscriptions((candidate) => scopeKey(candidate) === key);
        },
      };
    },
    async close() {},
  };

  const host: ServerHost = {
    serverServices: serverServices.host,
    async resolveSession(sessionId) {
      if (sessionId !== options.sessionId) throw new SessionNotFoundError(`This cell holds session ${options.sessionId}, not ${sessionId}`);
      return options.metadata;
    },
    async openSession() {
      return handle;
    },
  };
  return {
    host,
    async dispose() {
      await Promise.allSettled([sessionServices.dispose(), serverServices.dispose()]);
    },
  };
}

function toStrictJson<T>(value: T): T {
  // A void result (`requestAbort`, `attach`) is not JSON at all and passes as it is.
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
