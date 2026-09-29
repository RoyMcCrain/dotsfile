import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

export const REVIEW_CONTEXT_SCHEMA_VERSION = 1;
export const MAX_CONTEXT_RAW_BYTES = 16 * 1024;
export const MAX_CONTEXT_NORMALIZED_BYTES = 16 * 1024;
export const MAX_FACT_SUMMARY_CHARS = 1000;
export const MAX_EVIDENCE_ENTRIES = 5;
export const MAX_EVIDENCE_CHARS = 300;

export type ContextFact =
  | "unknown"
  | { summary: string; evidence: string[] };

export type ReviewContext = {
  schemaVersion: typeof REVIEW_CONTEXT_SCHEMA_VERSION;
  intent: ContextFact;
  runtime: ContextFact;
  impact: ContextFact;
  dataAndPermissions: ContextFact;
  rollback: ContextFact;
  tests: ContextFact;
};

export const REVIEW_CONTEXT_FACT_KEYS = [
  "intent",
  "runtime",
  "impact",
  "dataAndPermissions",
  "rollback",
  "tests",
] as const;

export type ReviewContextFactKey = (typeof REVIEW_CONTEXT_FACT_KEYS)[number];

const REVIEW_CONTEXT_TOP_KEYS = new Set<string>([
  "schemaVersion",
  ...REVIEW_CONTEXT_FACT_KEYS,
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validateFact = (
  field: ReviewContextFactKey,
  value: unknown,
): ContextFact => {
  if (value === "unknown") return "unknown";
  if (!isObject(value)) {
    throw new Error(`review context field ${field} is invalid`);
  }
  const keys = Object.keys(value);
  if (
    keys.length !== 2 || !keys.includes("summary") ||
    !keys.includes("evidence")
  ) {
    throw new Error(`review context field ${field} is invalid`);
  }
  if (!isNonBlankString(value.summary)) {
    throw new Error(`review context field ${field} summary is invalid`);
  }
  if (value.summary.length > MAX_FACT_SUMMARY_CHARS) {
    throw new Error(`review context field ${field} summary exceeds limit`);
  }
  if (!Array.isArray(value.evidence)) {
    throw new Error(`review context field ${field} evidence is invalid`);
  }
  if (
    value.evidence.length < 1 || value.evidence.length > MAX_EVIDENCE_ENTRIES
  ) {
    throw new Error(`review context field ${field} evidence is invalid`);
  }
  const evidence: string[] = [];
  for (const item of value.evidence) {
    if (!isNonBlankString(item)) {
      throw new Error(`review context field ${field} evidence is invalid`);
    }
    if (item.length > MAX_EVIDENCE_CHARS) {
      throw new Error(`review context field ${field} evidence exceeds limit`);
    }
    evidence.push(item);
  }
  return { summary: value.summary, evidence };
};

export const validateReviewContext = (value: unknown): ReviewContext => {
  if (!isObject(value)) {
    throw new Error("review context must be an object");
  }
  for (const key of Object.keys(value)) {
    if (!REVIEW_CONTEXT_TOP_KEYS.has(key)) {
      throw new Error("review context contains unsupported field");
    }
  }
  if (value.schemaVersion !== REVIEW_CONTEXT_SCHEMA_VERSION) {
    throw new Error("unsupported review context schemaVersion");
  }
  for (const key of REVIEW_CONTEXT_FACT_KEYS) {
    if (!(key in value)) {
      throw new Error("review context missing required field");
    }
  }
  const validated: ReviewContext = {
    schemaVersion: REVIEW_CONTEXT_SCHEMA_VERSION,
    intent: validateFact("intent", value.intent),
    runtime: validateFact("runtime", value.runtime),
    impact: validateFact("impact", value.impact),
    dataAndPermissions: validateFact(
      "dataAndPermissions",
      value.dataAndPermissions,
    ),
    rollback: validateFact("rollback", value.rollback),
    tests: validateFact("tests", value.tests),
  };
  const serialized = JSON.stringify(validated);
  if (
    new TextEncoder().encode(serialized).byteLength >
      MAX_CONTEXT_NORMALIZED_BYTES
  ) {
    throw new Error("review context exceeds size limit");
  }
  return validated;
};

export const hashReviewContext = (ctx: ReviewContext) =>
  createHash("sha256")
    .update(JSON.stringify(validateReviewContext(ctx)))
    .digest("hex");

const REGULAR_FILE_ERROR = "review context file must be a regular file";

const readBoundedContextBytes = async (
  handle: Awaited<ReturnType<typeof open>>,
  maxBytes: number,
): Promise<Uint8Array> => {
  const readLimit = maxBytes + 1;
  const buffer = Buffer.alloc(readLimit);
  let offset = 0;
  while (offset < readLimit) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      readLimit - offset,
      null,
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return buffer.subarray(0, offset);
};

export const readReviewContextFile = async (
  path: string,
): Promise<ReviewContext> => {
  if (!path || path.trim().length === 0) {
    throw new Error("--context-file path is required");
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    } catch {
      throw new Error(REGULAR_FILE_ERROR);
    }
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(REGULAR_FILE_ERROR);
    }
    const raw = await readBoundedContextBytes(handle, MAX_CONTEXT_RAW_BYTES);
    if (raw.byteLength > MAX_CONTEXT_RAW_BYTES) {
      throw new Error("review context file exceeds size limit");
    }
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      throw new Error("review context file must be valid UTF-8");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      throw new Error("review context file must be valid JSON");
    }
    return validateReviewContext(parsed);
  } finally {
    if (handle !== undefined) {
      await handle.close();
    }
  }
};
