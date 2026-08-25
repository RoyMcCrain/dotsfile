import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type ExecFn,
  fetchCmuxWorkspaceCustomTitle,
} from "../lib/cmux-session-name.ts";

export type SyncCmuxSessionNameDeps = {
  getSessionName: () => string | undefined;
  setSessionName: (name: string) => void;
  exec: ExecFn;
  env?: Record<string, string | undefined>;
  autoName?: string;
};

export const syncCmuxSessionName = async (
  deps: SyncCmuxSessionNameDeps,
): Promise<string | undefined> => {
  const autoName = deps.autoName;
  const currentName = deps.getSessionName()?.trim();

  if (currentName && currentName !== autoName) {
    return autoName;
  }

  const env = deps.env ?? process.env;
  const workspaceId = env.CMUX_WORKSPACE_ID?.trim();
  if (!workspaceId) return autoName;

  const name = await fetchCmuxWorkspaceCustomTitle({
    workspaceId,
    exec: deps.exec,
    env,
  });
  if (!name) return autoName;

  const afterLookup = deps.getSessionName()?.trim();
  if (afterLookup && afterLookup !== autoName) {
    return autoName;
  }

  if (afterLookup !== name) {
    deps.setSessionName(name);
  }

  return name;
};

const extensionDrains = new WeakMap<object, () => Promise<void>>();

/** Test-only: await queued sync operations for a registered extension instance. */
export const drainCmuxSessionNameSyncsForTest = (
  pi: object,
): Promise<void> => extensionDrains.get(pi)?.() ?? Promise.resolve();

export default function cmuxSessionName(pi: ExtensionAPI) {
  let autoName: string | undefined;
  let startupScheduled = false;
  let settledUsed = false;
  let pendingSyncs: Promise<void> = Promise.resolve();
  let queue: Promise<void> = Promise.resolve();

  extensionDrains.set(pi, () => pendingSyncs);

  const shouldSkipLookup = (): boolean => {
    const current = pi.getSessionName()?.trim();
    return Boolean(current && current !== autoName);
  };

  const enqueueSync = (): void => {
    queue = queue.then(async () => {
      try {
        autoName = await syncCmuxSessionName({
          getSessionName: () => pi.getSessionName(),
          setSessionName: (name) => pi.setSessionName(name),
          exec: (command, args, options) => pi.exec(command, args, options),
          autoName,
        });
      } catch {
        // convenience integration: swallow errors
      }
    });
    pendingSyncs = queue;
  };

  pi.on("session_start", () => {
    if (startupScheduled) return;
    startupScheduled = true;
    if (shouldSkipLookup()) return;
    enqueueSync();
  });

  pi.on("agent_settled", () => {
    if (settledUsed) return;
    settledUsed = true;
    if (shouldSkipLookup()) return;
    enqueueSync();
  });
}
