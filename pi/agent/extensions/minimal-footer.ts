import { sep } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// Local intersection: getSettings exists at runtime in Pi 1.5.2+ but not in the
// 0.83 dev dependency types. Read on every render so /settings toggles apply.
type FooterPi = Pick<ExtensionAPI, "getThinkingLevel"> & {
  getSettings?: () => { compaction?: { enabled?: boolean } };
};

type FooterDeps = {
  ctx: ExtensionContext;
  pi: FooterPi;
  theme: Theme;
  footerData: ReadonlyFooterDataProvider;
};

const MIN_GAP = 2;

const formatWindow = (tokens: number) => {
  if (tokens < 1_000) return `${tokens}`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
};

const formatCwd = (cwd: string, home: string | undefined) => {
  if (!home) return cwd;
  if (cwd === home) return "~";
  return cwd.startsWith(home + sep) ? `~${cwd.slice(home.length)}` : cwd;
};

const renderHeader = (
  width: number,
  { ctx, theme, footerData }: FooterDeps,
) => {
  let text = formatCwd(ctx.sessionManager.getCwd(), process.env.HOME);
  const branch = footerData.getGitBranch();
  if (branch) text += ` (${branch})`;
  const sessionName = ctx.sessionManager.getSessionName();
  if (sessionName) text += ` • ${sessionName}`;
  return truncateToWidth(theme.fg("dim", text), width, theme.fg("dim", "..."));
};

const contextColor = (
  percent: number | null,
): "error" | "warning" | undefined => {
  if (percent === null) return undefined;
  if (percent > 90) return "error";
  if (percent > 70) return "warning";
  return undefined;
};

const formatPercent = (percent: number | null) =>
  percent === null ? "?" : `${percent.toFixed(1)}%`;

const formatContext = (
  percent: number | null,
  windowTokens: number,
  autoCompact: boolean,
) => {
  const suffix = autoCompact ? " (auto)" : "";
  return `${formatPercent(percent)}/${formatWindow(windowTokens)}${suffix}`;
};

const renderContext = ({ ctx, theme }: FooterDeps, autoCompact: boolean) => {
  const usage = ctx.getContextUsage();
  const percent = usage?.percent ?? null;
  const windowTokens = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const text = formatContext(percent, windowTokens, autoCompact);
  return theme.fg(contextColor(percent) ?? "dim", text);
};

const modelText = ({ ctx, pi }: FooterDeps) => {
  const name = ctx.model?.id ?? "no-model";
  if (!ctx.model?.reasoning) return name;
  const level = pi.getThinkingLevel() || "off";
  return `${name} • ${level === "off" ? "thinking off" : level}`;
};

// Provider is shown only with several providers, and dropped before the model
// text when the full label would not fit in the space left on the right.
const renderModel = (deps: FooterDeps, budget: number) => {
  const { ctx, footerData, theme } = deps;
  const text = modelText(deps);
  const provider = ctx.model?.provider;
  const withProvider = provider && footerData.getAvailableProviderCount() > 1
    ? `(${provider}) ${text}`
    : text;
  const fits = visibleWidth(withProvider) <= budget;
  return theme.fg("dim", fits ? withProvider : text);
};

const joinSides = (left: string, right: string, width: number) => {
  const gap = Math.max(
    MIN_GAP,
    width - visibleWidth(left) - visibleWidth(right),
  );
  return truncateToWidth(left + " ".repeat(gap) + right, width);
};

const sanitizeStatus = (text: string) =>
  text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();

const renderStatuses = (
  width: number,
  { theme, footerData }: FooterDeps,
) => {
  const statuses = [...footerData.getExtensionStatuses()];
  if (statuses.length === 0) return undefined;
  const line = statuses
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => sanitizeStatus(text))
    .join(" ");
  return truncateToWidth(line, width, theme.fg("dim", "..."));
};

const renderFooter = (width: number, deps: FooterDeps) => {
  const settings = deps.pi.getSettings?.();
  const autoCompact = settings !== undefined &&
    settings.compaction?.enabled !== false;
  const context = renderContext(deps, autoCompact);
  const modelBudget = width - visibleWidth(context) - MIN_GAP;
  const lines = [
    renderHeader(width, deps),
    joinSides(context, renderModel(deps, modelBudget), width),
  ];
  const statusLine = renderStatuses(width, deps);
  if (statusLine !== undefined) lines.push(statusLine);
  return lines;
};

export default function minimalFooter(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
      return {
        dispose: unsubscribe,
        invalidate() {},
        render: (width: number) =>
          renderFooter(width, { ctx, pi, theme, footerData }),
      };
    });
  });
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setFooter(undefined);
  });
}
