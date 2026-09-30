import type { LevelDecisionSource } from "../../parallel-review/scripts/select_review_level.ts";
import type { ReviewLevel } from "../../parallel-review/scripts/select_review_level.ts";
import type { PlanStratum } from "./sampling.ts";

export type PlanCase = {
  runId: string;
  patchSha256: string;
  stratum: PlanStratum;
  createdAt: string;
  effectiveLevel: ReviewLevel;
  suggestedLevel?: ReviewLevel;
  source: LevelDecisionSource;
  confidence?: number;
  reason: string;
  contextSha256?: string;
  jevModel?: string;
};

export type WeeklyPlan = {
  schemaVersion: 1;
  weekStart: string;
  weekEnd: string;
  seed: string;
  createdAt: string;
  runsDirCanonical: string;
  promptVersion: number;
  counts: {
    historyDecisions: number;
    eligibleUniquePatches: number;
    duplicatePatchRuns: number;
    excludedNotAuto: number;
    excludedOutOfPeriod: number;
    selectedTotal: number;
    randomSelected: number;
    riskSelected: number;
    duplicateRunIdWarnings?: number;
    historyWarningCodes?: string[];
  };
  selected: PlanCase[];
};

export type ApprovalRecord = {
  schemaVersion: 1;
  weekStart: string;
  runId: string;
  patchSha256: string;
  resolvedAuditorModel: string;
  approvedAt: string;
  approvedInputSha256: string;
  promptVersion: number;
  promptHash: string;
};

export type AuditResultStatus = "success" | "failure" | "cached";

export type AuditResultRecord = {
  schemaVersion: 1;
  runId: string;
  weekStart: string;
  patchSha256: string;
  resolvedAuditorModel: string;
  promptHash: string;
  status: AuditResultStatus;
  independent: boolean;
  cachedFromWeek?: string;
  auditor?: {
    minLevel: ReviewLevel;
    maxLevel: ReviewLevel;
    reason: string;
    concerns: string[];
  };
  failureReason?: string;
  attemptedAt: string;
};
