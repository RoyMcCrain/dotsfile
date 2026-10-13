import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { formatCodexUsageStatus, queryCodexUsage } from "../lib/codex-usage.ts";

const CODEX_PROVIDER = "openai-codex";
const STATUS_KEY = "codex-usage";

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

  const clearStatus = (ctx: ExtensionContext) => {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  };

  const cancelRefresh = () => {
    refreshId++;
    controller?.abort();
    controller = undefined;
  };

  const refresh = async (
    ctx: ExtensionContext,
    options?: { notify?: boolean },
  ) => {
    cancelRefresh();
    if (!ctx.hasUI) {
      clearStatus(ctx);
      return;
    }
    if (!isCodexUsageSupported(ctx)) {
      clearStatus(ctx);
      return;
    }

    const currentId = refreshId;
    const currentController = new AbortController();
    controller = currentController;

    try {
      const snapshot = await queryCodexUsage({
        signal: currentController.signal,
      });
      if (currentId !== refreshId) return;

      const status = formatCodexUsageStatus(snapshot);
      if (ctx.hasUI) {
        ctx.ui.setStatus(
          STATUS_KEY,
          ctx.ui.theme.fg("dim", status),
        );
        if (options?.notify) {
          ctx.ui.notify(`Codex usage: ${status}`, "info");
        }
      }
    } catch {
      if (currentId !== refreshId) return;
      clearStatus(ctx);
      if (options?.notify && ctx.hasUI) {
        ctx.ui.notify("Codex usage refresh failed", "warning");
      }
    } finally {
      if (currentId === refreshId) controller = undefined;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    void refresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    void refresh(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => {
    void refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    cancelRefresh();
    clearStatus(ctx);
  });

  pi.registerCommand("codex-usage", {
    description: "Refresh ChatGPT Codex plan usage shown in the footer",
    handler: async (_args, ctx) => {
      if (!isCodexUsageSupported(ctx)) {
        clearStatus(ctx);
        if (ctx.hasUI) {
          ctx.ui.notify(
            "Codex usage is shown only for ChatGPT OAuth models",
            "warning",
          );
        }
        return;
      }

      await refresh(ctx, { notify: true });
    },
  });
}
