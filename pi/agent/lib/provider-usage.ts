import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import {
  type CodexRateLimitSnapshot,
  formatResetAt,
  formatWindowDurationMins,
  type RateLimitWindow,
} from "./codex-usage.ts";

export type ProviderName = "Codex" | "Claude";

export type UsageWindow = {
  label: string;
  remainingPercent: number;
  resetsAt?: number;
};

export type UsageRow =
  | { provider: ProviderName; status: "ok"; windows: UsageWindow[] }
  | {
    provider: ProviderName;
    status: "pending" | "unknown" | "auth" | "not-configured" | "unavailable";
  };

export type DimTheme = { fg: (style: "dim", text: string) => string };

export type JsonResult =
  | { state: "ok"; json: unknown }
  | { state: "auth" }
  | { state: "failed" };

const DEFAULT_TIMEOUT_MS = 5000;
// Date can represent only ±8.64e15 ms; larger reset values would throw when formatted.
const MAX_EPOCH_MS = 8.64e15;

const LABELS: Record<ProviderName, string> = {
  Codex: "Codex 残り",
  Claude: "Claude 残り",
};

const STATE_TEXT: Record<
  Exclude<UsageRow["status"], "ok">,
  string
> = {
  pending: "取得中…",
  unknown: "不明",
  auth: "認証エラー",
  "not-configured": "未設定",
  unavailable: "取得失敗",
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isValidPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 &&
  value <= 100;

export const toResetSeconds = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.abs(value * 1000) <= MAX_EPOCH_MS ? value : undefined;
};

export const toUsageWindow = (
  label: string,
  usedPercent: unknown,
  resetsAt: unknown,
): UsageWindow | undefined => {
  if (!isValidPercent(usedPercent)) return undefined;
  const window: UsageWindow = { label, remainingPercent: 100 - usedPercent };
  const reset = toResetSeconds(resetsAt);
  if (reset !== undefined) window.resetsAt = reset;
  return window;
};

export const toWindowRow = (
  provider: "Codex" | "Claude",
  windows: readonly (UsageWindow | undefined)[],
): UsageRow => {
  const valid = windows.filter((window): window is UsageWindow =>
    window !== undefined
  );
  return valid.length === 0
    ? { provider, status: "unknown" }
    : { provider, status: "ok", windows: valid };
};

const toCodexWindow = (window: RateLimitWindow | undefined) => {
  if (!window) return undefined;
  const label = window.windowDurationMins === undefined
    ? "窓"
    : formatWindowDurationMins(window.windowDurationMins);
  return toUsageWindow(label, window.usedPercent, window.resetsAt);
};

export const toCodexRow = (snapshot: CodexRateLimitSnapshot): UsageRow =>
  toWindowRow("Codex", [
    toCodexWindow(snapshot.primary),
    toCodexWindow(snapshot.secondary),
  ]);

const describeWindow = (window: UsageWindow) => {
  const reset = window.resetsAt === undefined
    ? ""
    : ` ↻${formatResetAt(window.resetsAt)}`;
  return `${window.label} ${Math.round(window.remainingPercent)}%${reset}`;
};

export const describeUsageRow = (row: UsageRow): string =>
  row.status === "ok"
    ? `${LABELS[row.provider]}: ${row.windows.map(describeWindow).join(" · ")}`
    : `${LABELS[row.provider]}: ${STATE_TEXT[row.status]}`;

export const renderUsageLines = (
  rows: readonly UsageRow[],
  width: number,
  theme: DimTheme,
) =>
  rows.flatMap((row) =>
    wrapTextWithAnsi(theme.fg("dim", describeUsageRow(row)), width)
  );

// Caps each request by timeout and the caller's signal; dispose clears both.
export const linkedTimeoutSignal = (
  timeoutMs: number,
  parent?: AbortSignal,
) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  parent?.addEventListener("abort", abort, { once: true });
  if (parent?.aborted) abort();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
};

const cancelBody = (response: Response) =>
  response.body?.cancel().catch(() => undefined);

// redirect: "error" keeps bearer tokens from being replayed to another host.
export const requestAuthenticatedJson = async (options: {
  url: string;
  headers: Record<string, string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<JsonResult> => {
  const request = linkedTimeoutSignal(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options.signal,
  );
  try {
    const response = await (options.fetch ?? fetch)(options.url, {
      method: "GET",
      headers: options.headers,
      redirect: "error",
      signal: request.signal,
    });
    if (response.status === 401 || response.status === 403) {
      await cancelBody(response);
      return { state: "auth" };
    }
    if (!response.ok) {
      await cancelBody(response);
      return { state: "failed" };
    }
    return { state: "ok", json: await response.json() };
  } catch {
    return { state: "failed" };
  } finally {
    request.dispose();
  }
};
