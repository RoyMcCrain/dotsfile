import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
export const SCHEMA_VERSION = 1;
const HTTP_ERROR_MAX_RETRIES = 3;
const MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

const REVIEW_LEVELS = [1, 2, 3, 4, 5] as const;
export type ReviewLevel = (typeof REVIEW_LEVELS)[number];

export type RequestedLevel = "auto" | ReviewLevel;

export type LevelDecisionSource = "explicit" | "jev" | "fallback";

export type ChunkChoice = "none" | "12000" | "24000" | "48000";

export type ChunkDecisionSource = "jev" | "fallback" | "fixed";

export type ChunkDecision = {
  source: ChunkDecisionSource;
  reason: string;
  choice: ChunkChoice;
  minConfidence?: number;
  confidence?: number;
  suggestedChoice?: ChunkChoice;
  model?: string;
};

export type ReviewLevelProbabilityKey = "1" | "2" | "3" | "4" | "5";

export type ReviewLevelProbabilities = Record<
  ReviewLevelProbabilityKey,
  number
>;

const REVIEW_LEVEL_PROBABILITY_KEYS: ReviewLevelProbabilityKey[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
];

export type LevelDecision = {
  schemaVersion: typeof SCHEMA_VERSION;
  requestedLevel: RequestedLevel;
  level: ReviewLevel;
  source: LevelDecisionSource;
  reason: string;
  patchSha256: string;
  minConfidence?: number;
  model?: string;
  suggestedLevel?: ReviewLevel;
  confidence?: number;
  costUsd?: number;
  probabilities?: ReviewLevelProbabilities;
  chunking?: ChunkDecision;
  contextSha256?: string;
  httpStatuses?: number[];
};

type ChunkOptionalFields = Pick<
  ChunkDecision,
  "minConfidence" | "model" | "suggestedChoice" | "confidence"
>;
type LevelOptionalFields = Pick<
  LevelDecision,
  | "contextSha256"
  | "httpStatuses"
  | "minConfidence"
  | "model"
  | "suggestedLevel"
  | "confidence"
  | "costUsd"
  | "probabilities"
>;

const DECISION_KEYS = new Set([
  "schemaVersion",
  "requestedLevel",
  "level",
  "source",
  "reason",
  "patchSha256",
  "minConfidence",
  "model",
  "suggestedLevel",
  "confidence",
  "costUsd",
  "probabilities",
  "chunking",
  "contextSha256",
  "httpStatuses",
]);

const CHUNK_DECISION_KEYS = new Set([
  "source",
  "reason",
  "choice",
  "minConfidence",
  "confidence",
  "suggestedChoice",
  "model",
]);

const CHUNK_CHOICES = new Set<string>(["none", "12000", "24000", "48000"]);

export const FIXED_CHUNK_BYTE_THRESHOLD = 15_000;
export const FIXED_CHUNK_NEWLINE_THRESHOLD = 400;
export const JEV_NONE_MAX_PATCH_BYTES = 48_000;

const CHUNK_FIXED_REASON = "explicit_level";

const CHUNK_FALLBACK_REASONS = new Set([
  "missing_api_key",
  "missing_model",
  "empty_patch",
  "http_error",
  "redirect",
  "network_error",
  "timeout",
  "invalid_json",
  "invalid_schema",
  "invalid_choice",
  "invalid_confidence",
  "low_confidence",
  "error_envelope",
  "whole_patch_limit",
]);

const FALLBACK_REASONS = new Set([
  "missing_api_key",
  "missing_model",
  "empty_patch",
  "patch_too_large", // historical decision compatibility; auto selection no longer emits this
  "http_error",
  "redirect",
  "network_error",
  "timeout",
  "invalid_json",
  "invalid_schema",
  "invalid_choice",
  "invalid_confidence",
  "low_confidence",
  "error_envelope",
]);

const EXPLICIT_REASON = "explicit";
const JEV_REASON = "jev_ok";

export const REVIEW_CRITERIA: Record<string, string> = {
  "1":
    "Documentation, formatting, or trivial non-behavior changes only; no meaningful logic or runtime risk. " +
    "Example: fix a spelling error in a README with no policy or runtime effect.",
  "2":
    "Small, local, low-risk logic with narrow blast radius; unlikely to affect unrelated behavior. " +
    "Example: adjust validation messages in one CLI path with demonstrated narrow scope; no shared contracts or sensitive boundaries.",
  "3":
    "Normal behavior changes, refactors, or config updates; standard review depth or uncertain risk. " +
    "Example: a contained behavior change or config default update that needs ordinary review when impact is understood but not critical.",
  "4":
    "Cross-cutting behavior, integration, concurrency, or security-sensitive logic with broader impact. " +
    "Example: shared retry or concurrency integration affecting multiple callers; not necessarily credential or authorization boundary changes.",
  "5":
    "Critical auth/permission/credential boundaries, irreversible data migrations or deletion, money, production availability, or major architectural risk. " +
    "Example: authorization checks, credential storage, irreversible data deletion or migrations, or payment amount correctness.",
};

export const countPatchNewlines = (data: Uint8Array): number => {
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0x0a) count++;
  }
  return count;
};

export const computeFixedChunkChoice = (data: Uint8Array): ChunkChoice => {
  if (
    data.byteLength >= FIXED_CHUNK_BYTE_THRESHOLD ||
    countPatchNewlines(data) >= FIXED_CHUNK_NEWLINE_THRESHOLD
  ) {
    return "12000";
  }
  return "none";
};

const isChunkChoice = (value: unknown): value is ChunkChoice =>
  typeof value === "string" && CHUNK_CHOICES.has(value);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isReviewLevel = (value: unknown): value is ReviewLevel =>
  typeof value === "number" &&
  REVIEW_LEVELS.includes(value as ReviewLevel);

export const parseReviewLevelString = (raw: string): ReviewLevel => {
  if (raw === "auto") return 1;
  if (raw !== "1" && raw !== "2") {
    throw new Error("level must be auto, 1, or 2");
  }
  return Number(raw) as ReviewLevel;
};

export const sha256Bytes = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

export const parseReviewLevelProbabilities = (
  value: unknown,
): ReviewLevelProbabilities | undefined => {
  if (value === undefined) return undefined;
  if (!isObject(value)) return undefined;
  for (const key of Object.keys(value)) {
    if (
      !REVIEW_LEVEL_PROBABILITY_KEYS.includes(key as ReviewLevelProbabilityKey)
    ) {
      return undefined;
    }
  }
  const out = {} as ReviewLevelProbabilities;
  for (const key of REVIEW_LEVEL_PROBABILITY_KEYS) {
    const raw = value[key];
    if (
      typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1
    ) {
      return undefined;
    }
    out[key] = raw;
  }
  return out;
};

const PROBABILITIES_VALIDATION_ERROR =
  "decision.probabilities values must be finite numbers 0..1";

const validateReviewLevelProbabilities = (
  value: unknown,
): ReviewLevelProbabilities | undefined => {
  if (value === undefined) return undefined;
  const parsed = parseReviewLevelProbabilities(value);
  if (parsed === undefined) {
    throw new Error(PROBABILITIES_VALIDATION_ERROR);
  }
  return parsed;
};

export const buildFallbackDecision = (options: {
  requestedLevel: RequestedLevel;
  level?: ReviewLevel;
  reason: string;
  patchSha256: string;
  minConfidence: number;
  model?: string;
  suggestedLevel?: ReviewLevel;
  confidence?: number;
  costUsd?: number;
  probabilities?: ReviewLevelProbabilities;
}): LevelDecision => {
  if (options.requestedLevel !== "auto") {
    throw new Error("fallback requestedLevel must be auto");
  }
  if (!FALLBACK_REASONS.has(options.reason)) {
    throw new Error("invalid fallback reason");
  }
  const decision: LevelDecision = {
    schemaVersion: SCHEMA_VERSION,
    requestedLevel: "auto",
    level: options.level ?? 3,
    source: "fallback",
    reason: options.reason,
    patchSha256: options.patchSha256,
    minConfidence: options.minConfidence,
  };
  if (options.reason === "low_confidence") {
    if (options.confidence !== undefined) {
      decision.confidence = options.confidence;
    }
    if (options.suggestedLevel !== undefined) {
      decision.suggestedLevel = options.suggestedLevel;
    }
    if (options.model !== undefined) decision.model = options.model;
    if (options.costUsd !== undefined) decision.costUsd = options.costUsd;
    if (options.probabilities !== undefined) {
      decision.probabilities = options.probabilities;
    }
  }
  return decision;
};

export const buildFixedChunkDecision = (
  patchBytes: Uint8Array,
): ChunkDecision => ({
  source: "fixed",
  reason: CHUNK_FIXED_REASON,
  choice: computeFixedChunkChoice(patchBytes),
});

export const buildChunkFallbackDecision = (options: {
  reason: string;
  patchBytes: Uint8Array;
  minConfidence: number;
  confidence?: number;
  suggestedChoice?: ChunkChoice;
  model?: string;
}): ChunkDecision => {
  if (!CHUNK_FALLBACK_REASONS.has(options.reason)) {
    throw new Error("invalid chunk fallback reason");
  }
  const decision: ChunkDecision = {
    source: "fallback",
    reason: options.reason,
    choice: computeFixedChunkChoice(options.patchBytes),
    minConfidence: options.minConfidence,
  };
  if (
    options.reason === "low_confidence" ||
    options.reason === "whole_patch_limit"
  ) {
    if (options.confidence !== undefined) {
      decision.confidence = options.confidence;
    }
    if (options.suggestedChoice !== undefined) {
      decision.suggestedChoice = options.suggestedChoice;
    }
    if (options.model !== undefined) decision.model = options.model;
  }
  return decision;
};

export const buildChunkJevDecision = (options: {
  choice: ChunkChoice;
  patchBytes: Uint8Array;
  minConfidence: number;
  model: string;
  confidence: number;
}): ChunkDecision => {
  if (
    options.choice === "none" &&
    options.patchBytes.byteLength > JEV_NONE_MAX_PATCH_BYTES
  ) {
    return buildChunkFallbackDecision({
      reason: "whole_patch_limit",
      patchBytes: options.patchBytes,
      minConfidence: options.minConfidence,
      confidence: options.confidence,
      suggestedChoice: "none",
      model: options.model,
    });
  }
  return {
    source: "jev",
    reason: JEV_REASON,
    choice: options.choice,
    minConfidence: options.minConfidence,
    model: options.model,
    suggestedChoice: options.choice,
    confidence: options.confidence,
  };
};

export const buildExplicitDecision = (options: {
  level: ReviewLevel;
  patchSha256: string;
  patchBytes?: Uint8Array;
}): LevelDecision => {
  const decision: LevelDecision = {
    schemaVersion: SCHEMA_VERSION,
    requestedLevel: options.level,
    level: options.level,
    source: "explicit",
    reason: EXPLICIT_REASON,
    patchSha256: options.patchSha256,
  };
  if (options.patchBytes !== undefined) {
    decision.chunking = buildFixedChunkDecision(options.patchBytes);
  }
  return decision;
};

export const buildJevDecision = (options: {
  level: ReviewLevel;
  patchSha256: string;
  minConfidence: number;
  model: string;
  confidence: number;
  costUsd?: number;
  probabilities?: ReviewLevelProbabilities;
}): LevelDecision => ({
  schemaVersion: SCHEMA_VERSION,
  requestedLevel: "auto",
  level: options.level,
  source: "jev",
  reason: JEV_REASON,
  patchSha256: options.patchSha256,
  minConfidence: options.minConfidence,
  model: options.model,
  suggestedLevel: options.level,
  confidence: options.confidence,
  ...(options.costUsd !== undefined ? { costUsd: options.costUsd } : {}),
  ...(options.probabilities !== undefined
    ? { probabilities: options.probabilities }
    : {}),
});

const validateReason = (source: LevelDecisionSource, reason: string): void => {
  if (source === "explicit" && reason !== EXPLICIT_REASON) {
    throw new Error("explicit decision reason mismatch");
  }
  if (source === "jev" && reason !== JEV_REASON) {
    throw new Error("jev decision reason mismatch");
  }
  if (source === "fallback" && !FALLBACK_REASONS.has(reason)) {
    throw new Error("fallback decision reason invalid");
  }
};

const validateOptionalModel = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !MODEL_ID_RE.test(value)) {
    throw new Error("decision.model is invalid");
  }
  return value;
};

const validateConfidence = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    value > 1
  ) {
    throw new Error("decision.confidence is invalid");
  }
  return value;
};

const validateCostUsd = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("decision.costUsd is invalid");
  }
  return value;
};

const validateRequestedLevel = (value: unknown): RequestedLevel => {
  if (value === "auto") return "auto";
  if (isReviewLevel(value)) return value;
  throw new Error("decision.requestedLevel is invalid");
};

const validateChunkReason = (
  source: ChunkDecisionSource,
  reason: string,
): void => {
  if (source === "fixed" && reason !== CHUNK_FIXED_REASON) {
    throw new Error("fixed chunk decision reason mismatch");
  }
  if (source === "jev" && reason !== JEV_REASON) {
    throw new Error("jev chunk decision reason mismatch");
  }
  if (source === "fallback" && !CHUNK_FALLBACK_REASONS.has(reason)) {
    throw new Error("chunk fallback reason invalid");
  }
};

const validateFixedChunkFields = (fields: ChunkOptionalFields): void => {
  rejectExtraFields([
    { value: fields.minConfidence, label: "minConfidence" },
    { value: fields.model, label: "model" },
    { value: fields.suggestedChoice, label: "suggestedChoice" },
    { value: fields.confidence, label: "confidence" },
  ], "fixed chunk decision");
};

const validateLowConfidenceChunkFallback = (
  fields: ChunkOptionalFields & { minConfidence: number },
): void => {
  const { minConfidence, model, suggestedChoice, confidence } = fields;
  if (confidence === undefined) {
    throw new Error("chunk low_confidence fallback requires confidence");
  }
  if (confidence >= minConfidence) {
    throw new Error(
      "chunk low_confidence fallback requires confidence below minConfidence",
    );
  }
  if (model === undefined) {
    throw new Error("chunk low_confidence fallback requires model");
  }
  if (suggestedChoice === undefined) {
    throw new Error("chunk low_confidence fallback requires suggestedChoice");
  }
};

const validateWholePatchChunkFallback = (
  fields: ChunkOptionalFields & { minConfidence: number; choice: ChunkChoice },
): void => {
  const { minConfidence, choice, model, suggestedChoice, confidence } = fields;
  if (confidence === undefined) {
    throw new Error("whole_patch_limit chunk fallback requires confidence");
  }
  if (confidence < minConfidence) {
    throw new Error(
      "whole_patch_limit chunk fallback requires confidence at or above minConfidence",
    );
  }
  if (model === undefined) {
    throw new Error("whole_patch_limit chunk fallback requires model");
  }
  if (suggestedChoice !== "none") {
    throw new Error(
      "whole_patch_limit chunk fallback requires suggestedChoice none",
    );
  }
  if (choice !== "12000") {
    throw new Error(
      "whole_patch_limit chunk fallback requires effective choice 12000",
    );
  }
};

const validateFallbackChunkFields = (fields: {
  reason: string;
  choice: ChunkChoice;
  minConfidence: number | undefined;
  model: string | undefined;
  suggestedChoice: ChunkChoice | undefined;
  confidence: number | undefined;
}): void => {
  const { reason, choice, minConfidence, model, suggestedChoice, confidence } =
    fields;
  if (minConfidence === undefined) {
    throw new Error("chunk fallback decision requires minConfidence");
  }
  if (reason === "low_confidence") {
    validateLowConfidenceChunkFallback({
      minConfidence,
      model,
      suggestedChoice,
      confidence,
    });
    return;
  }
  if (reason === "whole_patch_limit") {
    validateWholePatchChunkFallback({
      minConfidence,
      choice,
      model,
      suggestedChoice,
      confidence,
    });
    return;
  }
  rejectExtraFields([
    { value: model, label: "model" },
    { value: suggestedChoice, label: "suggestedChoice" },
    { value: confidence, label: "confidence" },
  ], "chunk fallback decision");
};

const validateJevChunkFields = (
  fields: ChunkOptionalFields & { choice: ChunkChoice },
): void => {
  const { minConfidence, confidence, suggestedChoice, choice, model } = fields;
  if (minConfidence === undefined) {
    throw new Error("jev chunk decision requires minConfidence");
  }
  if (confidence === undefined) {
    throw new Error("jev chunk decision requires confidence");
  }
  if (confidence < minConfidence) {
    throw new Error("jev chunk decision confidence below minConfidence");
  }
  if (suggestedChoice === undefined || suggestedChoice !== choice) {
    throw new Error("jev chunk decision suggestedChoice must equal choice");
  }
  if (model === undefined) {
    throw new Error("jev chunk decision requires model");
  }
};

const validateChunkChoiceForSource = (
  source: ChunkDecisionSource,
  value: unknown,
): ChunkChoice => {
  if (!isChunkChoice(value)) {
    throw new Error("chunk decision choice is invalid");
  }
  if (
    (source === "fixed" || source === "fallback") &&
    value !== "none" && value !== "12000"
  ) {
    throw new Error("fixed/fallback chunk choice must be none or 12000");
  }
  return value;
};

const validateChunkDecisionShape = (
  value: unknown,
): {
  value: Record<string, unknown>;
  source: ChunkDecisionSource;
  reason: string;
  choice: ChunkChoice;
} => {
  if (!isObject(value)) throw new Error("chunk decision must be an object");
  for (const key of Object.keys(value)) {
    if (!CHUNK_DECISION_KEYS.has(key)) {
      throw new Error(`unknown chunk decision field: ${key}`);
    }
  }
  const source = value.source;
  if (source !== "jev" && source !== "fallback" && source !== "fixed") {
    throw new Error("chunk decision source is invalid");
  }
  if (typeof value.reason !== "string") {
    throw new Error("chunk decision reason is invalid");
  }
  validateChunkReason(source, value.reason);
  const choice = validateChunkChoiceForSource(source, value.choice);
  return { value, source, reason: value.reason, choice };
};

const validateChunkDecisionFields = (
  value: Record<string, unknown>,
): ChunkOptionalFields => {
  let minConfidence: number | undefined;
  if (value.minConfidence !== undefined) {
    minConfidence = validateConfidence(value.minConfidence);
  }
  const model = validateOptionalModel(value.model);
  let suggestedChoice: ChunkChoice | undefined;
  if (value.suggestedChoice !== undefined) {
    if (!isChunkChoice(value.suggestedChoice)) {
      throw new Error("chunk decision suggestedChoice is invalid");
    }
    suggestedChoice = value.suggestedChoice;
  }
  const confidence = validateConfidence(value.confidence);
  return { minConfidence, model, suggestedChoice, confidence };
};

export const validateChunkDecision = (input: unknown): ChunkDecision => {
  const { value, source, reason, choice } = validateChunkDecisionShape(input);
  const { minConfidence, model, suggestedChoice, confidence } =
    validateChunkDecisionFields(value);

  if (source === "fixed") {
    validateFixedChunkFields({
      minConfidence,
      model,
      suggestedChoice,
      confidence,
    });
  } else if (source === "fallback") {
    validateFallbackChunkFields({
      reason,
      choice,
      minConfidence,
      model,
      suggestedChoice,
      confidence,
    });
  } else {
    validateJevChunkFields({
      minConfidence,
      confidence,
      suggestedChoice,
      choice,
      model,
    });
  }

  const decision: ChunkDecision = {
    source,
    reason,
    choice,
  };
  if (minConfidence !== undefined) decision.minConfidence = minConfidence;
  if (model !== undefined) decision.model = model;
  if (suggestedChoice !== undefined) {
    decision.suggestedChoice = suggestedChoice;
  }
  if (confidence !== undefined) decision.confidence = confidence;
  return decision;
};

const rejectExtraFields = (
  fields: { value: unknown; label: string }[],
  prefix: string,
): void => {
  for (const { value: fieldValue, label } of fields) {
    if (fieldValue !== undefined) {
      throw new Error(`${prefix} must not include ${label}`);
    }
  }
};

const validateOptionalContextSha256 = (
  value: unknown,
): string | undefined => {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value !== "string" ||
    !SHA256_RE.test(value)
  ) {
    throw new Error("decision.contextSha256 is invalid");
  }
  return value;
};

const isValidHttpStatus = (status: unknown): boolean =>
  typeof status === "number" &&
  Number.isInteger(status) &&
  status >= 200 &&
  status <= 599;

const validateOptionalHttpStatuses = (
  value: unknown,
): number[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("decision.httpStatuses is invalid");
  }
  if (value.length > HTTP_ERROR_MAX_RETRIES + 1) {
    throw new Error("decision.httpStatuses is invalid");
  }
  if (!Array.from(value).every(isValidHttpStatus)) {
    throw new Error("decision.httpStatuses is invalid");
  }
  return value;
};

const validateExplicitLevelFields = (decision: LevelDecision): void => {
  if (decision.requestedLevel !== decision.level) {
    throw new Error("explicit requestedLevel must equal level");
  }
  rejectExtraFields([
    { value: decision.minConfidence, label: "minConfidence" },
    { value: decision.model, label: "model" },
    { value: decision.suggestedLevel, label: "suggestedLevel" },
    { value: decision.confidence, label: "confidence" },
    { value: decision.costUsd, label: "costUsd" },
    { value: decision.probabilities, label: "probabilities" },
    { value: decision.contextSha256, label: "contextSha256" },
    { value: decision.httpStatuses, label: "httpStatuses" },
  ], "explicit decision");
};

const validateLowConfidenceLevelFallback = (
  decision: LevelDecision,
  minConfidence: number,
): void => {
  const { model, suggestedLevel, confidence } = decision;
  if (confidence === undefined) {
    throw new Error("low_confidence fallback requires confidence");
  }
  if (confidence >= minConfidence) {
    throw new Error(
      "low_confidence fallback requires confidence below minConfidence",
    );
  }
  if (model === undefined) {
    throw new Error("low_confidence fallback requires model");
  }
  if (suggestedLevel === undefined) {
    throw new Error("low_confidence fallback requires suggestedLevel");
  }
};

const validateFallbackLevelFields = (decision: LevelDecision): void => {
  const {
    requestedLevel,
    level,
    reason,
    minConfidence,
    model,
    suggestedLevel,
    confidence,
    costUsd,
    probabilities,
  } = decision;
  if (requestedLevel !== "auto") {
    throw new Error("fallback requestedLevel must be auto");
  }
  if (level !== 3) {
    throw new Error("fallback decision level must be 3");
  }
  if (minConfidence === undefined) {
    throw new Error("fallback decision requires minConfidence");
  }
  if (reason === "low_confidence") {
    validateLowConfidenceLevelFallback(decision, minConfidence);
    return;
  }
  rejectExtraFields([
    { value: model, label: "model" },
    { value: suggestedLevel, label: "suggestedLevel" },
    { value: confidence, label: "confidence" },
    { value: costUsd, label: "costUsd" },
    { value: probabilities, label: "probabilities" },
  ], "fallback decision");
};

const validateJevLevelFields = (decision: LevelDecision): void => {
  const {
    requestedLevel,
    level,
    minConfidence,
    confidence,
    suggestedLevel,
    model,
  } = decision;
  if (requestedLevel !== "auto") {
    throw new Error("jev decision requestedLevel must be auto");
  }
  if (minConfidence === undefined) {
    throw new Error("jev decision requires minConfidence");
  }
  if (confidence === undefined) {
    throw new Error("jev decision requires confidence");
  }
  if (confidence < minConfidence) {
    throw new Error("jev decision confidence below minConfidence");
  }
  if (suggestedLevel === undefined || suggestedLevel !== level) {
    throw new Error("jev decision suggestedLevel must equal level");
  }
  if (model === undefined) {
    throw new Error("jev decision requires model");
  }
};

const validateLevelDecisionKeys = (input: Record<string, unknown>): void => {
  for (const key of Object.keys(input)) {
    if (!DECISION_KEYS.has(key)) {
      throw new Error(`unknown level decision field: ${key}`);
    }
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("unsupported level decision schemaVersion");
  }
};

const validateDecisionPatchSha256 = (value: unknown): string => {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error("decision.patchSha256 is invalid");
  }
  return value;
};

const validateLevelDecisionShape = (
  input: unknown,
): {
  value: Record<string, unknown>;
  requestedLevel: RequestedLevel;
  level: ReviewLevel;
  source: "explicit" | "jev" | "fallback";
  reason: string;
  patchSha256: string;
} => {
  if (!isObject(input)) throw new Error("level decision must be an object");
  validateLevelDecisionKeys(input);
  const requestedLevel = validateRequestedLevel(input.requestedLevel);
  if (!isReviewLevel(input.level)) throw new Error("decision.level is invalid");
  const source = input.source;
  if (source !== "explicit" && source !== "jev" && source !== "fallback") {
    throw new Error("decision.source is invalid");
  }
  if (typeof input.reason !== "string") {
    throw new Error("decision.reason is invalid");
  }
  validateReason(source, input.reason);
  const patchSha256 = validateDecisionPatchSha256(input.patchSha256);
  return {
    value: input,
    requestedLevel,
    level: input.level,
    source,
    reason: input.reason,
    patchSha256,
  };
};

const validateLevelDecisionFields = (
  value: Record<string, unknown>,
): LevelOptionalFields => {
  const contextSha256 = validateOptionalContextSha256(value.contextSha256);
  const httpStatuses = validateOptionalHttpStatuses(value.httpStatuses);
  let minConfidence: number | undefined;
  if (value.minConfidence !== undefined) {
    minConfidence = validateConfidence(value.minConfidence);
  }
  const model = validateOptionalModel(value.model);
  let suggestedLevel: ReviewLevel | undefined;
  if (value.suggestedLevel !== undefined) {
    if (!isReviewLevel(value.suggestedLevel)) {
      throw new Error("decision.suggestedLevel is invalid");
    }
    suggestedLevel = value.suggestedLevel;
  }
  const confidence = validateConfidence(value.confidence);
  const costUsd = validateCostUsd(value.costUsd);
  let probabilities: ReviewLevelProbabilities | undefined;
  if (value.probabilities !== undefined) {
    probabilities = validateReviewLevelProbabilities(value.probabilities);
  }
  return {
    minConfidence,
    model,
    suggestedLevel,
    confidence,
    costUsd,
    probabilities,
    contextSha256,
    httpStatuses,
  };
};

const validateLevelDecisionSource = (decision: LevelDecision): void => {
  if (decision.source === "explicit") {
    validateExplicitLevelFields(decision);
  } else if (decision.source === "fallback") {
    validateFallbackLevelFields(decision);
  } else {
    validateJevLevelFields(decision);
  }
};

const validateChunkingSourceForLevel = (
  levelSource: "explicit" | "jev" | "fallback",
  chunkSource: ChunkDecisionSource,
): void => {
  if (levelSource === "explicit" && chunkSource !== "fixed") {
    throw new Error("explicit level decision chunking must be fixed");
  }
  if (levelSource !== "explicit" && chunkSource === "fixed") {
    throw new Error("fixed chunking requires explicit level decision");
  }
};

const validateLevelChunking = (
  value: unknown,
  source: "explicit" | "jev" | "fallback",
  minConfidence: number | undefined,
): ChunkDecision | undefined => {
  if (value === undefined) return undefined;
  const chunking = validateChunkDecision(value);
  validateChunkingSourceForLevel(source, chunking.source);
  if (
    minConfidence !== undefined &&
    chunking.minConfidence !== undefined &&
    chunking.minConfidence !== minConfidence
  ) {
    throw new Error(
      "chunk minConfidence must match level decision minConfidence",
    );
  }
  return chunking;
};

export const validateLevelDecision = (input: unknown): LevelDecision => {
  const { value, requestedLevel, level, source, reason, patchSha256 } =
    validateLevelDecisionShape(input);
  const fields = validateLevelDecisionFields(value);
  const decision: LevelDecision = {
    schemaVersion: SCHEMA_VERSION,
    requestedLevel,
    level,
    source,
    reason,
    patchSha256,
  };
  const optionalFields = Object.fromEntries(
    Object.entries(fields).filter(([, field]) => field !== undefined),
  ) as LevelOptionalFields;
  Object.assign(decision, optionalFields);
  validateLevelDecisionSource(decision);
  const chunking = validateLevelChunking(
    value.chunking,
    source,
    fields.minConfidence,
  );
  if (chunking !== undefined) decision.chunking = chunking;
  return decision;
};

export const selectReviewLevel = (options: {
  patchBytes: Uint8Array;
  levelArg?: string;
}): LevelDecision => {
  const rawLevel = options.levelArg ?? "auto";
  const level = parseReviewLevelString(rawLevel);
  return buildExplicitDecision({
    level,
    patchSha256: sha256Bytes(options.patchBytes),
    patchBytes: options.patchBytes,
  });
};

export const readPatchFile = async (path: string): Promise<Uint8Array> => {
  if (!path) throw new Error("--input is required");
  return new Uint8Array(await readFile(path));
};

const HELP = `select_review_level.ts — offline parallel-review level selection

Usage:
  bun --config=/dev/null --no-env-file --no-install run select_review_level.ts \\
    --input PATCH_FILE [--level auto|1|2]

Flags:
  --input  Path to the sanitized patch file (required)
  --level  auto (default, equivalent to 1) or explicit 1 or 2
`;

type ParsedCli = { input?: string; level?: string; help: boolean };

const parseValueFlag = (
  args: string[],
  index: number,
  out: ParsedCli,
  seen: Set<string>,
): number => {
  const flag = args[index];
  if (flag !== "--input" && flag !== "--level") {
    throw new Error(`unknown flag: ${flag}`);
  }
  if (seen.has(flag)) throw new Error(`duplicate flag: ${flag}`);
  seen.add(flag);
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`missing value for ${flag}`);
  }
  if (flag === "--input") out.input = value;
  else out.level = value;
  return index + 1;
};

const parseCliArgs = (args: string[]): ParsedCli => {
  const out: ParsedCli = { help: false };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      if (seen.has("help")) throw new Error("duplicate flag: --help");
      seen.add("help");
      out.help = true;
    } else {
      i = parseValueFlag(args, i, out, seen);
    }
  }
  return out;
};

export const runCli = async (
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> => {
  try {
    const parsed = parseCliArgs(args);
    if (parsed.help) return { code: 0, stdout: HELP, stderr: "" };
    if (!parsed.input) throw new Error("--input is required");
    const decision = await selectReviewLevel({
      patchBytes: await readPatchFile(parsed.input),
      levelArg: parsed.level,
    });
    validateLevelDecision(decision);
    return { code: 0, stdout: `${JSON.stringify(decision)}\n`, stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { code: 1, stdout: "", stderr: `${message}\n` };
  }
};

const main = async () => {
  const result = await runCli(process.argv.slice(2));
  if (result.code !== 0) {
    process.stderr.write(result.stderr);
    process.exitCode = 1;
  }
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
};

if (import.meta.main) main();
