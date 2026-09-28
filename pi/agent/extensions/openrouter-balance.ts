import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import process from "node:process";
import {
  formatOpenRouterBalanceNotify,
  formatOpenRouterBalanceStatus,
  OPEN_ROUTER_MANAGEMENT_ENV,
  queryOpenRouterBalance,
} from "../lib/openrouter-balance.ts";

const STATUS_KEY = "openrouter-balance";

const shouldShowBalance = (ctx: ExtensionContext) =>
  ctx.mode === "tui" && ctx.hasUI;

export default function openRouterBalance(pi: ExtensionAPI) {
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
    if (!shouldShowBalance(ctx)) {
      clearStatus(ctx);
      return;
    }

    const managementKey = process.env[OPEN_ROUTER_MANAGEMENT_ENV]?.trim();
    if (!managementKey) {
      clearStatus(ctx);
      if (options?.notify && ctx.hasUI) {
        ctx.ui.notify(
          `${OPEN_ROUTER_MANAGEMENT_ENV} が設定されていません。` +
            "Bitwarden の open-router-management-key を sync-key で読み込み、" +
            "その fish シェルから Pi を再起動してください。",
          "warning",
        );
      }
      return;
    }

    const currentId = refreshId;
    const currentController = new AbortController();
    controller = currentController;

    try {
      const credits = await queryOpenRouterBalance({
        managementKey,
        signal: currentController.signal,
      });
      if (currentId !== refreshId) return;

      const status = formatOpenRouterBalanceStatus(credits);
      if (shouldShowBalance(ctx)) {
        ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", status));
        if (options?.notify) {
          ctx.ui.notify(formatOpenRouterBalanceNotify(credits), "info");
        }
      }
    } catch {
      if (currentId !== refreshId) return;
      clearStatus(ctx);
      if (options?.notify && ctx.hasUI) {
        ctx.ui.notify("OpenRouter 残高の取得に失敗しました。", "warning");
      }
    } finally {
      if (currentId === refreshId) controller = undefined;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    void refresh(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => {
    void refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    cancelRefresh();
    clearStatus(ctx);
  });

  pi.registerCommand("openrouter-balance", {
    description: "Refresh OpenRouter prepaid balance shown in the status bar",
    handler: async (_args, ctx) => {
      await refresh(ctx, { notify: true });
    },
  });
}
