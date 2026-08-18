import { spawn } from "node:child_process";

export type RateLimitWindow = {
  usedPercent: number;
  windowDurationMins?: number;
  resetsAt?: number;
};

export type CodexRateLimitSnapshot = {
  planType?: string;
  primary?: RateLimitWindow;
  secondary?: RateLimitWindow;
};

export type FormatCodexUsageOptions = {
  locale?: string;
  timeZone?: string;
};

type JsonRecord = Record<string, unknown>;

export type CodexAppServer = {
  request: (method: string, params?: unknown) => Promise<unknown>;
  notify: (method: string) => void;
  close: () => Promise<void>;
};

export type CreateCodexAppServer = (options: {
  codexBin: string;
  timeoutMs: number;
  signal?: AbortSignal;
}) => CodexAppServer;

export type QueryCodexUsageOptions = {
  codexBin?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  createAppServer?: CreateCodexAppServer;
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_LOCALE = "en-US";

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseWindow = (value: unknown) => {
  if (!isRecord(value)) return undefined;
  if (typeof value.usedPercent !== "number") return undefined;
  if (!Number.isFinite(value.usedPercent)) return undefined;

  const window: RateLimitWindow = { usedPercent: value.usedPercent };
  if (
    typeof value.windowDurationMins === "number" &&
    Number.isFinite(value.windowDurationMins)
  ) {
    window.windowDurationMins = value.windowDurationMins;
  }
  if (typeof value.resetsAt === "number" && Number.isFinite(value.resetsAt)) {
    window.resetsAt = value.resetsAt;
  }
  return window;
};

const parseSnapshot = (value: unknown) => {
  if (!isRecord(value)) return undefined;

  const snapshot: CodexRateLimitSnapshot = {};
  if (typeof value.planType === "string") snapshot.planType = value.planType;

  const primary = parseWindow(value.primary);
  if (primary) snapshot.primary = primary;

  const secondary = parseWindow(value.secondary);
  if (secondary) snapshot.secondary = secondary;

  if (!snapshot.planType && !snapshot.primary && !snapshot.secondary) {
    return undefined;
  }
  return snapshot;
};

export const parseRateLimitsReadResponse = (message: unknown) => {
  if (!isRecord(message) || message.error !== undefined) return undefined;
  if (!isRecord(message.result)) return undefined;

  const buckets = message.result.rateLimitsByLimitId;
  if (isRecord(buckets)) {
    const codex = parseSnapshot(buckets.codex);
    if (codex) return codex;
  }

  return parseSnapshot(message.result.rateLimits);
};

export const formatWindowDurationMins = (minutes: number) => {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
};

export const formatResetAt = (
  unixSeconds: number,
  options?: FormatCodexUsageOptions,
) => {
  const parts = new Intl.DateTimeFormat(options?.locale ?? DEFAULT_LOCALE, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: options?.timeZone,
  }).formatToParts(new Date(unixSeconds * 1000));

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${getPart("month")}/${getPart("day")} ${getPart("hour")}:${
    getPart("minute")
  }`;
};

const formatPlan = (planType: string | undefined) => {
  const normalized = planType?.trim();
  if (!normalized) return "Codex";
  return `Codex ${normalized[0]?.toUpperCase()}${normalized.slice(1)}`;
};

const formatWindow = (
  window: RateLimitWindow | undefined,
  options?: FormatCodexUsageOptions,
) => {
  if (!window) return undefined;

  const duration = window.windowDurationMins === undefined
    ? undefined
    : formatWindowDurationMins(window.windowDurationMins);
  const percent = `${Math.round(window.usedPercent)}%`;
  const usage = duration ? `${duration} ${percent}` : percent;
  const reset = window.resetsAt === undefined
    ? ""
    : ` ↻${formatResetAt(window.resetsAt, options)}`;
  return `${usage}${reset}`;
};

export const formatCodexUsageStatus = (
  snapshot: CodexRateLimitSnapshot,
  options?: FormatCodexUsageOptions,
) => {
  const windows = [
    formatWindow(snapshot.primary, options),
    formatWindow(snapshot.secondary, options),
  ].filter((window): window is string => window !== undefined);

  const usage = windows.length > 0 ? ` ${windows.join(" · ")}` : "";
  return `${formatPlan(snapshot.planType)}${usage}`;
};

export const createJsonLineParser = (
  onMessage: (message: unknown) => void,
) => {
  const decoder = new TextDecoder();
  let buffer = "";

  const parseLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onMessage(JSON.parse(trimmed));
    } catch {
      // Ignore non-protocol output instead of breaking usage display.
    }
  };

  return {
    push: (chunk: Uint8Array | string) => {
      buffer += typeof chunk === "string"
        ? chunk
        : decoder.decode(chunk, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        parseLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    },
    end: () => {
      buffer += decoder.decode();
      parseLine(buffer);
      buffer = "";
    },
  };
};

const createCodexAppServer: CreateCodexAppServer = ({
  codexBin,
  timeoutMs,
  signal,
}) => {
  const child = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  let nextId = 0;
  let closing = false;
  let closed = false;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const stop = (error: Error) => {
    rejectPending(error);
    if (child.exitCode !== null || child.killed) return;
    child.kill("SIGKILL");
  };

  const parser = createJsonLineParser((message) => {
    if (!isRecord(message) || typeof message.id !== "number") return;
    const request = pending.get(message.id);
    if (!request) return;

    pending.delete(message.id);
    if (message.error !== undefined) {
      request.reject(new Error("Codex app-server request failed"));
      return;
    }
    request.resolve(message);
  });

  child.stdout.on("data", (chunk: Uint8Array) => parser.push(chunk));
  child.stdout.on("end", () => parser.end());
  child.stdin.on(
    "error",
    () => stop(new Error("Codex app-server stdin error")),
  );
  child.on("error", () => stop(new Error("Failed to start Codex app-server")));
  child.on("close", () => {
    closed = true;
    if (!closing) stop(new Error("Codex app-server exited"));
  });

  const timeout = setTimeout(
    () => stop(new Error("Codex app-server timed out")),
    timeoutMs,
  );
  const onAbort = () => stop(new Error("Codex usage refresh aborted"));
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();

  const write = (message: unknown) => {
    if (child.killed || child.exitCode !== null) {
      throw new Error("Codex app-server is not running");
    }
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  return {
    request: (method, params) => {
      const id = ++nextId;
      const response = new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      const message = params === undefined
        ? { id, method }
        : { id, method, params };
      try {
        write(message);
      } catch (error) {
        pending.delete(id);
        return Promise.reject(error);
      }
      return response;
    },
    notify: (method) => write({ method }),
    close: async () => {
      closing = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      rejectPending(new Error("Codex app-server closed"));

      if (closed) return;
      const didClose = new Promise<void>((resolve) =>
        child.once("close", resolve)
      );
      if (!child.killed && child.exitCode === null) child.kill("SIGKILL");
      await didClose;
    },
  };
};

export const queryCodexUsage = async (options?: QueryCodexUsageOptions) => {
  const server = (options?.createAppServer ?? createCodexAppServer)({
    codexBin: options?.codexBin ?? "codex",
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: options?.signal,
  });

  try {
    await server.request("initialize", {
      clientInfo: { name: "pi-codex-usage", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    server.notify("initialized");

    const response = await server.request("account/rateLimits/read");
    const snapshot = parseRateLimitsReadResponse(response);
    if (!snapshot) throw new Error("Codex rate limits response was malformed");
    return snapshot;
  } finally {
    await server.close();
  }
};
