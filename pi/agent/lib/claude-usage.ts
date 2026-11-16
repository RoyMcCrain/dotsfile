import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import {
  isRecord,
  requestAuthenticatedJson,
  toResetSeconds,
  toUsageWindow,
  toWindowRow,
  type UsageRow,
} from "./provider-usage.ts";

export const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const KEYCHAIN_TIMEOUT_MS = 3000;

export type QueryClaudeUsageOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  readKeychain?: (signal?: AbortSignal) => Promise<string | undefined>;
};

export const tokenFromCredential = (text: string) => {
  try {
    const parsed: unknown = JSON.parse(text);
    const oauth = isRecord(parsed) ? parsed.claudeAiOauth : undefined;
    const token = isRecord(oauth) ? oauth.accessToken : undefined;
    return typeof token === "string" && token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
};

// Keychain access is limited to the default config dir so a custom account
// never silently falls back to whichever account the default keychain holds.
const readKeychainText = (signal?: AbortSignal) =>
  new Promise<string | undefined>((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      {
        timeout: KEYCHAIN_TIMEOUT_MS,
        killSignal: "SIGKILL",
        encoding: "utf8",
        signal,
      },
      (error, stdout) => resolve(error ? undefined : stdout),
    );
  });

// Keychain is only consulted on macOS; other platforms have no `security` tool.
const defaultReadKeychain = (signal?: AbortSignal) =>
  process.platform === "darwin"
    ? readKeychainText(signal)
    : Promise.resolve(undefined);

const readCredentialFile = async (file: string, signal?: AbortSignal) => {
  try {
    return tokenFromCredential(
      await readFile(file, { encoding: "utf8", signal }),
    );
  } catch {
    return undefined;
  }
};

const customConfigDir = (env: NodeJS.ProcessEnv) =>
  env.PI_CLAUDE_CODE_CONFIG_DIR || env.CLAUDE_CONFIG_DIR || undefined;

const defaultConfigDir = (
  env: NodeJS.ProcessEnv,
  homeDir: string | undefined,
) => join(env.HOME || homeDir || homedir(), ".claude");

const readKeychainToken = async (
  readKeychain: (signal?: AbortSignal) => Promise<string | undefined>,
  signal?: AbortSignal,
) => {
  const text = await readKeychain(signal);
  return text ? tokenFromCredential(text) : undefined;
};

const readClaudeToken = async (options: QueryClaudeUsageOptions) => {
  const env = options.env ?? process.env;
  const custom = customConfigDir(env);
  const dir = custom ?? defaultConfigDir(env, options.homeDir);
  const token = await readCredentialFile(
    join(dir, ".credentials.json"),
    options.signal,
  );
  if (token || custom || options.signal?.aborted) return token;
  return readKeychainToken(
    options.readKeychain ?? defaultReadKeychain,
    options.signal,
  );
};

const parseWindow = (
  label: string,
  value: unknown,
) => {
  if (!isRecord(value)) return undefined;
  return toUsageWindow(
    label,
    value.utilization,
    toIsoSeconds(value.resets_at),
  );
};

const toIsoSeconds = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  return toResetSeconds(Date.parse(value) / 1000);
};

export const parseClaudeUsageRow = (json: unknown): UsageRow => {
  if (!isRecord(json)) return { provider: "Claude", status: "unavailable" };
  return toWindowRow("Claude", [
    parseWindow("5h", json.five_hour),
    parseWindow("7d", json.seven_day),
  ]);
};

export const queryClaudeUsage = async (
  options: QueryClaudeUsageOptions = {},
): Promise<UsageRow> => {
  const aborted = { provider: "Claude", status: "unavailable" } as const;
  if (options.signal?.aborted) return aborted;
  const token = await readClaudeToken(options);
  // A cancelled query must not issue HTTP even if a credential arrived late.
  if (options.signal?.aborted) return aborted;
  if (!token) return { provider: "Claude", status: "not-configured" };

  const result = await requestAuthenticatedJson({
    url: CLAUDE_USAGE_URL,
    headers: {
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
  if (result.state === "auth") return { provider: "Claude", status: "auth" };
  if (result.state === "failed") {
    return { provider: "Claude", status: "unavailable" };
  }
  return parseClaudeUsageRow(result.json);
};
