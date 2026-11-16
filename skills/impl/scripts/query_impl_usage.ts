#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { queryCodexUsage } from "../../../pi/agent/lib/codex-usage.ts";

type Side = { remainingPercent?: number; unavailable?: string };
export type ImplUsage = { claude: Side; openai: Side };
type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const remaining = (windows: unknown[]) => {
  const values = windows.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 &&
    value <= 100
  );
  return values.length ? 100 - Math.max(...values) : undefined;
};

export const parseClaudeUsage = (value: unknown): Side => {
  if (!isRecord(value)) return { unavailable: "malformed" };
  return sideFromWindows([value.five_hour, value.seven_day]);
};

const sideFromWindows = (windows: unknown[]): Side => {
  const percentages = windows.flatMap((window) => {
    if (!isRecord(window)) return [];
    const value = window.utilization;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 &&
        value <= 100
      ? [value]
      : [];
  });
  const score = remaining(percentages);
  return score === undefined
    ? { unavailable: "unknown" }
    : { remainingPercent: score };
};

export const parseCodexUsage = (value: unknown): Side => {
  if (!isRecord(value)) return { unavailable: "unknown" };
  const percentages = [value.primary, value.secondary].flatMap((window) => {
    if (!isRecord(window)) return [];
    return [window.usedPercent];
  });
  const score = remaining(percentages);
  return score === undefined
    ? { unavailable: "unknown" }
    : { remainingPercent: score };
};

const tokenFromCredential = (text: string) => {
  try {
    const parsed: unknown = JSON.parse(text);
    const oauth = isRecord(parsed) && isRecord(parsed.claudeAiOauth)
      ? parsed.claudeAiOauth
      : undefined;
    return typeof oauth?.accessToken === "string" &&
        oauth.accessToken.length > 0
      ? oauth.accessToken
      : undefined;
  } catch {
    return undefined;
  }
};

const readKeychainToken = async () => {
  try {
    const proc = Bun.spawn([
      "security",
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-w",
    ], { stdout: "pipe", stderr: "ignore", env: process.env });
    const timer = setTimeout(() => proc.kill("SIGKILL"), 3000);
    try {
      const output = await new Response(proc.stdout).text();
      const status = await proc.exited;
      return status === 0 ? tokenFromCredential(output) : undefined;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return undefined;
  }
};

const readClaudeFileToken = async (credentialFile: string) => {
  try {
    return tokenFromCredential(await readFile(credentialFile, "utf8"));
  } catch {
    return undefined;
  }
};

const readClaudeCredential = async () => {
  const defaultConfigDir = join(process.env.HOME || homedir(), ".claude");
  const customConfigDir = process.env.PI_CLAUDE_CODE_CONFIG_DIR ||
    process.env.CLAUDE_CONFIG_DIR;
  const configDir = customConfigDir || defaultConfigDir;
  const token = await readClaudeFileToken(join(configDir, ".credentials.json"));
  if (token) return { token };
  if (customConfigDir) return { unavailable: "auth" };
  const keychainToken = await readKeychainToken();
  return keychainToken ? { token: keychainToken } : { unavailable: "auth" };
};

export const queryClaudeUsage = async (): Promise<Side> => {
  const credential = await readClaudeCredential();
  if (!("token" in credential)) return { unavailable: credential.unavailable };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(
        "https://api.anthropic.com/api/oauth/usage",
        {
          headers: {
            authorization: `Bearer ${credential.token}`,
            "anthropic-beta": "oauth-2025-04-20",
          },
          redirect: "error",
          signal: controller.signal,
        },
      );
      if (response.status === 401) return { unavailable: "auth" };
      if (!response.ok) return { unavailable: "unavailable" };
      return parseClaudeUsage(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { unavailable: "unavailable" };
  }
};

export const collectImplUsage = async (): Promise<ImplUsage> => {
  const [claude, codex] = await Promise.all([
    queryClaudeUsage(),
    queryCodexUsage({ timeoutMs: 5000 }).catch(() => undefined),
  ]);
  return {
    claude,
    openai: codex ? parseCodexUsage(codex) : { unavailable: "unavailable" },
  };
};

if (import.meta.main) {
  collectImplUsage().then((usage) => console.log(JSON.stringify(usage))).catch(
    () => {
      console.log(JSON.stringify(
        {
          claude: { unavailable: "unavailable" },
          openai: { unavailable: "unavailable" },
        } satisfies ImplUsage,
      ));
    },
  );
}
