import process from "node:process";

export const OPEN_ROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
export const OPEN_ROUTER_MANAGEMENT_ENV = "OPEN_ROUTER_MANAGEMENT_KEY";

const DEFAULT_TIMEOUT_MS = 5000;

type JsonRecord = Record<string, unknown>;

export type OpenRouterCredits = {
  totalCredits: number;
  totalUsage: number;
  remaining: number;
};

export type QueryOpenRouterBalanceOptions = {
  managementKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const parseOpenRouterCreditsResponse = (
  value: unknown,
): OpenRouterCredits | undefined => {
  if (!isRecord(value) || !isRecord(value.data)) return undefined;

  const totalCredits = value.data.total_credits;
  const totalUsage = value.data.total_usage;
  if (!isNonNegativeFinite(totalCredits) || !isNonNegativeFinite(totalUsage)) {
    return undefined;
  }

  return {
    totalCredits,
    totalUsage,
    remaining: totalCredits - totalUsage,
  };
};

const formatUsd = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

export const formatOpenRouterBalanceStatus = (credits: OpenRouterCredits) =>
  `OpenRouter ${formatUsd(credits.remaining)}`;

export const formatOpenRouterBalanceNotify = (credits: OpenRouterCredits) =>
  `OpenRouter 残高: ${formatUsd(credits.remaining)} (利用 ${
    formatUsd(credits.totalUsage)
  } / 合計 ${formatUsd(credits.totalCredits)})`;

const readManagementKey = (override?: string) => {
  const key = override ?? process.env[OPEN_ROUTER_MANAGEMENT_ENV];
  const trimmed = key?.trim();
  return trimmed ? trimmed : undefined;
};

export const queryOpenRouterBalance = async (
  options?: QueryOpenRouterBalanceOptions,
) => {
  const managementKey = readManagementKey(options?.managementKey);
  if (!managementKey) {
    throw new Error(`${OPEN_ROUTER_MANAGEMENT_ENV} is not set`);
  }

  const fetchFn = options?.fetch ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);

  const onAbort = () => timeoutController.abort();
  options?.signal?.addEventListener("abort", onAbort, { once: true });
  if (options?.signal?.aborted) timeoutController.abort();

  try {
    const response = await fetchFn(OPEN_ROUTER_CREDITS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${managementKey}` },
      redirect: "error",
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("OpenRouter credits request failed");
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new Error("OpenRouter credits response was malformed");
    }

    const credits = parseOpenRouterCreditsResponse(json);
    if (!credits) {
      throw new Error("OpenRouter credits response was malformed");
    }
    return credits;
  } finally {
    clearTimeout(timeout);
    options?.signal?.removeEventListener("abort", onAbort);
  }
};
