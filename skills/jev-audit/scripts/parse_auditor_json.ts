import type { ReviewLevel } from "../../parallel-review/scripts/select_review_level.ts";

export type AuditorResponse = {
  minLevel: ReviewLevel;
  maxLevel: ReviewLevel;
  reason: string;
  concerns: string[];
};

const MAX_REASON = 2_000;
const MAX_CONCERN = 500;
const MAX_CONCERNS = 20;
/** Cap raw auditor response input passed to this parser (UTF-8 bytes before JSON.parse). */
const MAX_AUDITOR_RAW_UTF8_BYTES = 64 * 1024;

const isLevel = (value: unknown): value is ReviewLevel =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractJsonBlock = (text: string): string => {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
};

const assertAuditorRawWithinLimit = (raw: string) => {
  if (raw.length > MAX_AUDITOR_RAW_UTF8_BYTES) {
    throw new Error("auditor output too large");
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_AUDITOR_RAW_UTF8_BYTES) {
    throw new Error("auditor output too large");
  }
};

export const parseAuditorResponse = (raw: string): AuditorResponse => {
  assertAuditorRawWithinLimit(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonBlock(raw));
  } catch {
    throw new Error("auditor output is not valid JSON");
  }
  if (!isObject(parsed)) throw new Error("auditor output must be an object");
  if (!isLevel(parsed.minLevel) || !isLevel(parsed.maxLevel)) {
    throw new Error("auditor levels must be 1..5");
  }
  if (parsed.minLevel > parsed.maxLevel) {
    throw new Error("auditor minLevel must be <= maxLevel");
  }
  if (typeof parsed.reason !== "string" || parsed.reason.trim().length === 0) {
    throw new Error("auditor reason is required");
  }
  if (parsed.reason.length > MAX_REASON) {
    throw new Error("auditor reason too long");
  }
  if (!Array.isArray(parsed.concerns)) {
    throw new Error("auditor concerns must be an array");
  }
  const concerns: string[] = [];
  for (const item of parsed.concerns) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error("auditor concerns must be non-empty strings");
    }
    if (item.length > MAX_CONCERN) throw new Error("auditor concern too long");
    concerns.push(item);
    if (concerns.length > MAX_CONCERNS) {
      throw new Error("too many auditor concerns");
    }
  }
  return {
    minLevel: parsed.minLevel,
    maxLevel: parsed.maxLevel,
    reason: parsed.reason.trim(),
    concerns,
  };
};
