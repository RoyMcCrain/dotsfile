#!/usr/bin/env bun
import { Database } from "bun:sqlite";

type Side = { remainingPercent?: number; unavailable?: string };
type Usage = { claude: Side; openai: Side };
type Decision = {
  role?: string;
  reason: string;
  claude?: number;
  openai?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSide = (value: unknown): Side | undefined => {
  if (!isRecord(value)) return undefined;
  const side = value;
  if (typeof side.remainingPercent === "number") {
    return Number.isFinite(side.remainingPercent) &&
        side.remainingPercent >= 0 &&
        side.remainingPercent <= 100
      ? { remainingPercent: side.remainingPercent }
      : undefined;
  }
  const allowed = ["unknown", "malformed", "auth", "unavailable"];
  return typeof side.unavailable === "string" &&
      allowed.includes(side.unavailable)
    ? { unavailable: side.unavailable }
    : undefined;
};

export const parseUsage = (value: unknown): Usage | undefined => {
  if (!isRecord(value)) return undefined;
  const usage = value;
  const claude = parseSide(usage.claude);
  const openai = parseSide(usage.openai);
  return claude && openai ? { claude, openai } : undefined;
};

const decideWithUnknown = (
  claude: number | undefined,
  openai: number | undefined,
): Decision => {
  if (claude === undefined && openai === undefined) {
    return { reason: "fallback", claude, openai };
  }
  if (claude === undefined) {
    return {
      role: openai === 0 ? "impl.haiku" : "impl.luna",
      reason: openai === 0
        ? "Claude unknown; Codex reference exhausted"
        : "Claude unknown; Codex reference",
      claude,
      openai,
    };
  }
  return {
    role: claude === 0 ? "impl.luna" : "impl.haiku",
    reason: claude === 0
      ? "Claude exhausted; Codex reference unknown"
      : "Codex reference unknown",
    claude,
    openai,
  };
};

export const decideRole = (usage: Usage): Decision => {
  const claude = usage.claude.remainingPercent;
  const openai = usage.openai.remainingPercent;
  if (claude === undefined || openai === undefined) {
    return decideWithUnknown(claude, openai);
  }
  if (claude === 0 && openai === 0) {
    return { reason: "exhausted", claude, openai };
  }
  if (claude === openai) return { reason: "fallback", claude, openai };
  return {
    role: claude > openai ? "impl.haiku" : "impl.luna",
    reason: "higher capacity",
    claude,
    openai,
  };
};

const allocateFallbackRole = (runsRoot: string) => {
  const databasePath = `${runsRoot}/.default-routing.sqlite`;
  const previousUmask = process.umask(0o077);
  let database: Database | undefined;
  try {
    database = new Database(databasePath, { create: true });
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec(
      "CREATE TABLE IF NOT EXISTS rotation (id INTEGER PRIMARY KEY, slot INTEGER NOT NULL)",
    );
    const row = database.query<{ slot: number }, []>(
      "INSERT INTO rotation VALUES (1, 0) ON CONFLICT(id) DO UPDATE SET slot = 1 - slot RETURNING slot",
    ).get();
    if (!row || (row.slot !== 0 && row.slot !== 1)) {
      throw new Error("invalid routing state");
    }
    return row.slot === 0 ? "impl.haiku" : "impl.luna";
  } finally {
    database?.close();
    process.umask(previousUmask);
  }
};

const main = () => {
  const runsRoot = Bun.argv[2];
  const usageText = Bun.argv[3];
  if (!runsRoot || !usageText) {
    console.error("select_impl_role.ts: expected runs-root and usage JSON");
    process.exitCode = 2;
    return;
  }
  let usage: Usage | undefined;
  try {
    usage = parseUsage(JSON.parse(usageText));
  } catch {
    usage = undefined;
  }
  if (!usage) {
    console.error("select_impl_role.ts: invalid usage snapshot");
    process.exitCode = 2;
    return;
  }
  const decision = decideRole(usage);
  if (decision.reason === "exhausted") {
    console.error(
      "Implementation quota unavailable: both observed windows are exhausted; refusing dispatch.",
    );
    process.exitCode = 1;
    return;
  }
  if (!decision.role) {
    try {
      decision.role = allocateFallbackRole(runsRoot);
    } catch {
      console.error(
        "select_impl_role.ts: unable to allocate fallback routing turn",
      );
      process.exitCode = 1;
      return;
    }
    decision.reason = "equal or unknown capacity; alternating fallback";
  }
  const format = (value: number | undefined) =>
    value === undefined ? "unknown" : `${value}%`;
  console.error(
    `Implementation routing: Claude ${
      format(decision.claude)
    }, Codex reference ${
      format(decision.openai)
    } remaining; chose ${decision.role} (${decision.reason}).`,
  );
  console.log(decision.role);
};

if (import.meta.main) main();
