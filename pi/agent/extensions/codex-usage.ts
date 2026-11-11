import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { formatCodexUsageStatus, queryCodexUsage } from "../lib/codex-usage.ts";

const CODEX_PROVIDER = "openai-codex";
const STATUS_KEY = "codex-usage";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const isCodexUsageSupported = (ctx: ExtensionContext) => {
  const model = ctx.model;
  return !!model && (
    model.provider === CODEX_PROVIDER ||
    (model.provider === "openai" && ctx.modelRegistry.isUsingOAuth(model))
  );
};

export default function codexUsage(pi: ExtensionAPI) {
  let refreshId = 0;
  let controller: AbortController | undefined;
  let lastAttemptAt: number | undefined;
  let cachedStatus: string | undefined;

  const clearStatus = (ctx: ExtensionContext) => {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  };

  const cancelRefresh = () => {
    refreshId++;
    if (controller) {
      lastAttemptAt = undefined;
      controller.abort();
      controller = undefined;
    }
  };

  const fetchUsage = async (ctx: ExtensionContext, notify = false) => {
    lastAttemptAt = Date.now();
    const currentId = refreshId;
    const currentController = new AbortController();
    controller = currentController;

    try {
      const snapshot = await queryCodexUsage({ signal: currentController.signal });
      if (currentId !== refreshId) return;
      const status = formatCodexUsageStatus(snapshot);
      cachedStatus = status;
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", status));
      if (notify) ctx.ui.notify(`Codex usage: ${status}`, "info");
    } catch {
      if (currentId !== refreshId) return;
      cachedStatus = undefined;
      clearStatus(ctx);
      if (notify) ctx.ui.notify("Codex usage refresh failed", "warning");
    } finally {
      if (currentId === refreshId) controller = undefined;
    }
  };

  const scheduleRefresh = (ctx: ExtensionContext) => {
    if (!ctx.hasUI || !isCodexUsageSupported(ctx)) {
      cancelRefresh();
      clearStatus(ctx);
      return;
    }
    if (cachedStatus) ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", cachedStatus));
    if (controller || (lastAttemptAt !== undefined && Date.now() - lastAttemptAt < REFRESH_INTERVAL_MS)) return;
    void fetchUsage(ctx);
  };

  pi.on("session_start", (_event, ctx) => {
    cancelRefresh();
    lastAttemptAt = undefined;
    cachedStatus = undefined;
    scheduleRefresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    scheduleRefresh(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => {
    scheduleRefresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    cancelRefresh();
    cachedStatus = undefined;
    clearStatus(ctx);
  });

  pi.registerCommand("codex-usage", {
    description: "Refresh ChatGPT Codex plan usage shown in the footer",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI || !isCodexUsageSupported(ctx)) {
        cancelRefresh();
        clearStatus(ctx);
        if (ctx.hasUI) {
          ctx.ui.notify(
            "Codex usage is shown only for ChatGPT OAuth models",
            "warning",
          );
        }
        return;
      }

      cancelRefresh();
      await fetchUsage(ctx, true);
    },
  });
}
