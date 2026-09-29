import { isMondayUtc, parseUtcDate } from "./week_period.ts";
import { assertSafeRunId, boundedString, SHA256_RE } from "./state_io.ts";
import type {
  ApprovalRecord,
  AuditResultRecord,
  PlanCase,
  WeeklyPlan,
} from "./plan_types.ts";
import { AUDITOR_PROMPT_VERSION } from "./auditor_prompt.ts";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const reviewLevel = (v: unknown, label: string): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) {
    throw new Error(`invalid ${label}`);
  }
  return v;
};

const planCount = (c: Record<string, unknown>, key: string): number => {
  const n = c[key];
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 1_000_000) {
    throw new Error("invalid plan count");
  }
  return n;
};

const expectedWeekEnd = (weekStart: string): string => {
  const ms = Date.parse(`${weekStart}T00:00:00.000Z`) +
    7 * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
};

export const validatePlanCase = (value: unknown): PlanCase => {
  if (!isRecord(value)) throw new Error("invalid plan case");
  const runId = boundedString(value.runId, 64, "runId");
  assertSafeRunId(runId);
  const patchSha256 = boundedString(value.patchSha256, 64, "patchSha256");
  if (!SHA256_RE.test(patchSha256)) throw new Error("invalid patchSha256");
  const stratum = value.stratum;
  if (stratum !== "random" && stratum !== "risk") {
    throw new Error("invalid stratum");
  }
  const createdAt = boundedString(value.createdAt, 64, "createdAt");
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("invalid createdAt");
  const effectiveLevel = reviewLevel(value.effectiveLevel, "effectiveLevel");
  const suggestedLevel = value.suggestedLevel === undefined
    ? undefined
    : reviewLevel(value.suggestedLevel, "suggestedLevel");
  const source = value.source;
  if (source !== "jev" && source !== "fallback") {
    throw new Error("invalid source");
  }
  const reason = boundedString(value.reason, 4096, "reason");
  let confidence: number | undefined;
  if (value.confidence !== undefined) {
    if (
      typeof value.confidence !== "number" || value.confidence < 0 ||
      value.confidence > 1
    ) throw new Error("invalid confidence");
    confidence = value.confidence;
  }
  let contextSha256: string | undefined;
  if (value.contextSha256 !== undefined) {
    contextSha256 = boundedString(value.contextSha256, 64, "contextSha256");
    if (!SHA256_RE.test(contextSha256)) {
      throw new Error("invalid contextSha256");
    }
  }
  const jevModel = value.jevModel === undefined
    ? undefined
    : boundedString(value.jevModel, 256, "jevModel");
  return {
    runId,
    patchSha256,
    stratum,
    createdAt,
    effectiveLevel: effectiveLevel as PlanCase["effectiveLevel"],
    suggestedLevel: suggestedLevel as PlanCase["suggestedLevel"],
    source: source as PlanCase["source"],
    confidence,
    reason,
    contextSha256,
    jevModel,
  };
};

export const validateWeeklyPlan = (value: unknown): WeeklyPlan => {
  if (!isRecord(value)) throw new Error("invalid plan");
  if (value.schemaVersion !== 1) throw new Error("invalid plan schema");
  const weekStart = boundedString(value.weekStart, 10, "weekStart");
  const weekEnd = boundedString(value.weekEnd, 10, "weekEnd");
  if (!isMondayUtc(weekStart)) throw new Error("invalid weekStart");
  parseUtcDate(weekStart);
  parseUtcDate(weekEnd);
  if (weekEnd !== expectedWeekEnd(weekStart)) {
    throw new Error("invalid weekEnd");
  }
  const seed = boundedString(value.seed, 64, "seed");
  if (!SHA256_RE.test(seed)) throw new Error("invalid seed");
  boundedString(value.createdAt, 64, "createdAt");
  const runsDirCanonical = boundedString(
    value.runsDirCanonical,
    4096,
    "runsDirCanonical",
  );
  if (value.promptVersion !== AUDITOR_PROMPT_VERSION) {
    throw new Error("invalid promptVersion");
  }
  if (!isRecord(value.counts)) throw new Error("invalid plan counts");
  const c = value.counts;
  if (!Array.isArray(value.selected) || value.selected.length > 10) {
    throw new Error("invalid selected");
  }
  const selected = value.selected.map(validatePlanCase);
  const seenRun = new Set<string>();
  const seenPatch = new Set<string>();
  for (const item of selected) {
    if (seenRun.has(item.runId)) throw new Error("duplicate runId in plan");
    if (seenPatch.has(item.patchSha256)) {
      throw new Error("duplicate patch in plan");
    }
    seenRun.add(item.runId);
    seenPatch.add(item.patchSha256);
  }
  const randomSelected = planCount(c, "randomSelected");
  const riskSelected = planCount(c, "riskSelected");
  const selectedTotal = planCount(c, "selectedTotal");
  if (randomSelected > 5 || riskSelected > 5) {
    throw new Error("invalid stratum selection count");
  }
  if (selectedTotal !== selected.length) {
    throw new Error("invalid selectedTotal");
  }
  if (randomSelected + riskSelected !== selectedTotal) {
    throw new Error("invalid stratum counts");
  }
  if (
    randomSelected !== selected.filter((s) => s.stratum === "random").length
  ) {
    throw new Error("invalid randomSelected");
  }
  if (riskSelected !== selected.filter((s) => s.stratum === "risk").length) {
    throw new Error("invalid riskSelected");
  }
  const historyWarningCodes = Array.isArray(c.historyWarningCodes)
    ? c.historyWarningCodes.map((x) =>
      boundedString(x, 64, "historyWarningCodes")
    )
    : undefined;
  return {
    schemaVersion: 1,
    weekStart,
    weekEnd,
    seed,
    createdAt: String(value.createdAt),
    runsDirCanonical,
    promptVersion: AUDITOR_PROMPT_VERSION,
    counts: {
      historyDecisions: planCount(c, "historyDecisions"),
      eligibleUniquePatches: planCount(c, "eligibleUniquePatches"),
      duplicatePatchRuns: planCount(c, "duplicatePatchRuns"),
      excludedNotAuto: planCount(c, "excludedNotAuto"),
      excludedOutOfPeriod: planCount(c, "excludedOutOfPeriod"),
      selectedTotal,
      randomSelected,
      riskSelected,
      duplicateRunIdWarnings: c.duplicateRunIdWarnings === undefined
        ? undefined
        : planCount(c, "duplicateRunIdWarnings"),
      historyWarningCodes,
    },
    selected,
  };
};

export const validateApprovalRecord = (value: unknown): ApprovalRecord => {
  if (!isRecord(value)) throw new Error("invalid approval");
  if (value.schemaVersion !== 1) throw new Error("invalid approval schema");
  const weekStart = boundedString(value.weekStart, 10, "weekStart");
  if (!isMondayUtc(weekStart)) throw new Error("invalid weekStart");
  const runId = boundedString(value.runId, 64, "runId");
  assertSafeRunId(runId);
  const patchSha256 = boundedString(value.patchSha256, 64, "patchSha256");
  if (!SHA256_RE.test(patchSha256)) throw new Error("invalid patchSha256");
  const resolvedAuditorModel = boundedString(
    value.resolvedAuditorModel,
    256,
    "resolvedAuditorModel",
  );
  boundedString(value.approvedAt, 64, "approvedAt");
  const approvedInputSha256 = boundedString(
    value.approvedInputSha256,
    64,
    "approvedInputSha256",
  );
  if (!SHA256_RE.test(approvedInputSha256)) throw new Error("invalid hash");
  if (approvedInputSha256 !== patchSha256) {
    throw new Error("approval input hash must match plan patch hash");
  }
  if (value.promptVersion !== AUDITOR_PROMPT_VERSION) {
    throw new Error("invalid promptVersion");
  }
  const promptHash = boundedString(value.promptHash, 64, "promptHash");
  if (!SHA256_RE.test(promptHash)) throw new Error("invalid promptHash");
  return {
    schemaVersion: 1,
    weekStart,
    runId,
    patchSha256,
    resolvedAuditorModel,
    approvedAt: String(value.approvedAt),
    approvedInputSha256,
    promptVersion: AUDITOR_PROMPT_VERSION,
    promptHash,
  };
};

export const validateAuditResultRecord = (
  value: unknown,
): AuditResultRecord => {
  if (!isRecord(value)) throw new Error("invalid result");
  if (value.schemaVersion !== 1) throw new Error("invalid result schema");
  const runId = boundedString(value.runId, 64, "runId");
  assertSafeRunId(runId);
  const weekStart = boundedString(value.weekStart, 10, "weekStart");
  if (!isMondayUtc(weekStart)) throw new Error("invalid weekStart");
  const patchSha256 = boundedString(value.patchSha256, 64, "patchSha256");
  if (!SHA256_RE.test(patchSha256)) throw new Error("invalid patchSha256");
  const resolvedAuditorModel = boundedString(
    value.resolvedAuditorModel,
    256,
    "model",
  );
  const promptHash = boundedString(value.promptHash, 64, "promptHash");
  if (!SHA256_RE.test(promptHash)) throw new Error("invalid promptHash");
  const status = value.status;
  if (status !== "success" && status !== "failure" && status !== "cached") {
    throw new Error("invalid result status");
  }
  if (typeof value.independent !== "boolean") {
    throw new Error("invalid independent flag");
  }
  boundedString(value.attemptedAt, 64, "attemptedAt");
  let auditor: AuditResultRecord["auditor"];
  if (value.auditor !== undefined) {
    if (!isRecord(value.auditor)) throw new Error("invalid auditor");
    const minLevel = reviewLevel(value.auditor.minLevel, "minLevel") as
      | 1
      | 2
      | 3
      | 4
      | 5;
    const maxLevel = reviewLevel(value.auditor.maxLevel, "maxLevel") as
      | 1
      | 2
      | 3
      | 4
      | 5;
    if (minLevel > maxLevel) throw new Error("invalid auditor level range");
    if (!Array.isArray(value.auditor.concerns)) {
      throw new Error("invalid concerns");
    }
    if (value.auditor.concerns.length > 32) {
      throw new Error("invalid concerns");
    }
    auditor = {
      minLevel,
      maxLevel,
      reason: boundedString(value.auditor.reason, 4096, "auditor reason"),
      concerns: value.auditor.concerns.map((item) =>
        boundedString(item, 512, "concern")
      ),
    };
  }
  const failureReason = value.failureReason === undefined
    ? undefined
    : boundedString(value.failureReason, 256, "failureReason");
  const cachedFromWeek = value.cachedFromWeek === undefined
    ? undefined
    : boundedString(value.cachedFromWeek, 10, "cachedFromWeek");

  if (status === "success") {
    if (!value.independent) throw new Error("invalid success independent");
    if (!auditor) throw new Error("success requires auditor");
    if (failureReason) throw new Error("success must not have failureReason");
  } else if (status === "failure") {
    if (!value.independent) throw new Error("invalid failure independent");
    if (!failureReason) throw new Error("failure requires failureReason");
    if (auditor) throw new Error("failure must not have auditor");
  } else {
    if (value.independent) throw new Error("cached must not be independent");
    if (!cachedFromWeek || !isMondayUtc(cachedFromWeek)) {
      throw new Error("cached requires valid cachedFromWeek");
    }
    parseUtcDate(cachedFromWeek);
    const hasAuditor = auditor !== undefined;
    const hasFailure = failureReason !== undefined;
    if (hasAuditor === hasFailure) {
      throw new Error("cached requires auditor xor failureReason");
    }
  }

  return {
    schemaVersion: 1,
    runId,
    weekStart,
    patchSha256,
    resolvedAuditorModel,
    promptHash,
    status,
    independent: value.independent,
    auditor,
    failureReason,
    cachedFromWeek,
    attemptedAt: String(value.attemptedAt),
  };
};
