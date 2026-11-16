import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { queryClaudeUsage } from "../lib/claude-usage.ts";
import { queryCodexUsage } from "../lib/codex-usage.ts";
import {
  type ProviderName,
  renderUsageLines,
  toCodexRow,
  type UsageRow,
} from "../lib/provider-usage.ts";

const WIDGET_KEY = "codex-usage";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const PROVIDERS: readonly ProviderName[] = ["Codex", "Claude"];

// Each collector converts its own failures to an unavailable row so one
// provider's error never hides the others.
const collectors: Record<
  ProviderName,
  (signal: AbortSignal) => Promise<UsageRow>
> = {
  Codex: (signal) =>
    queryCodexUsage({ signal }).then(toCodexRow, () => ({
      provider: "Codex",
      status: "unavailable",
    })),
  Claude: (signal) =>
    queryClaudeUsage({ signal }).catch(() => ({
      provider: "Claude",
      status: "unavailable",
    })),
};

const rowFor = (
  rows: ReadonlyMap<ProviderName, UsageRow>,
  provider: ProviderName,
): UsageRow => rows.get(provider) ?? { provider, status: "pending" };

export default function codexUsage(pi: ExtensionAPI) {
  let generation = 0;
  let inFlight: AbortController | undefined;
  let lastAttemptAt: number | undefined;
  const rows = new Map<ProviderName, UsageRow>();

  const render = (ctx: ExtensionContext) => {
    // Plain rows are captured; the theme is applied only inside render.
    const snapshot = PROVIDERS.map((provider) => rowFor(rows, provider));
    ctx.ui.setWidget(
      WIDGET_KEY,
      (_tui, theme) => ({
        render: (width: number) => renderUsageLines(snapshot, width, theme),
        invalidate() {},
      }),
      { placement: "belowEditor" },
    );
  };

  const clearUi = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(WIDGET_KEY, undefined);
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  };

  const cancelRefresh = () => {
    generation++;
    if (inFlight) {
      lastAttemptAt = undefined;
      inFlight.abort();
      inFlight = undefined;
    }
  };

  const cooldownActive = () =>
    lastAttemptAt !== undefined &&
    Date.now() - lastAttemptAt < REFRESH_INTERVAL_MS;

  const applyRow = (ctx: ExtensionContext, current: number, row: UsageRow) => {
    if (current !== generation) return;
    rows.set(row.provider, row);
    render(ctx);
  };

  const runRefresh = async (ctx: ExtensionContext, manual: boolean) => {
    cancelRefresh();
    const current = generation;
    const controller = new AbortController();
    inFlight = controller;
    lastAttemptAt = Date.now();
    render(ctx);

    await Promise.all(
      PROVIDERS.map((provider) =>
        collectors[provider](controller.signal).then((row) =>
          applyRow(ctx, current, row)
        )
      ),
    );
    if (current !== generation) return;
    inFlight = undefined;
    if (manual) ctx.ui.notify("Usage refreshed", "info");
  };

  // Automatic triggers coalesce with in-flight work and respect the cooldown;
  // manual refresh always supersedes older work.
  const refresh = (ctx: ExtensionContext, manual = false) => {
    if (ctx.mode !== "tui") {
      cancelRefresh();
      return;
    }
    if (!manual && (inFlight || cooldownActive())) return;
    void runRefresh(ctx, manual);
  };

  pi.on("session_start", (_event, ctx) => {
    cancelRefresh();
    rows.clear();
    lastAttemptAt = undefined;
    refresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    cancelRefresh();
    rows.clear();
    clearUi(ctx);
  });

  const usageCommand = {
    description:
      "Refresh remaining Codex and Claude usage shown below the editor",
    // Returns a promise because Pi's command handler type requires one; the
    // refresh itself runs in the background so the command returns promptly.
    handler: (_args: string, ctx: ExtensionContext) => {
      refresh(ctx, true);
      return Promise.resolve();
    },
  };
  pi.registerCommand("usage", usageCommand);
  pi.registerCommand("codex-usage", usageCommand);
}
