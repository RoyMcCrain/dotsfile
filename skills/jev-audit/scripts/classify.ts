import type { ReviewLevel } from "../../parallel-review/scripts/select_review_level.ts";
import type { AuditorResponse } from "./parse_auditor_json.ts";

export type DepthCandidate =
  | "aligned"
  | "too_shallow_candidate"
  | "too_deep_candidate";

export const classifyAgainstRange = (
  level: ReviewLevel,
  range: Pick<AuditorResponse, "minLevel" | "maxLevel">,
): DepthCandidate => {
  if (level < range.minLevel) return "too_shallow_candidate";
  if (level > range.maxLevel) return "too_deep_candidate";
  return "aligned";
};

export type ComparisonRow = {
  effectiveLevel: ReviewLevel;
  suggestedLevel?: ReviewLevel;
  effectiveVsAuditor: DepthCandidate | "unavailable";
  suggestedVsAuditor?: DepthCandidate | "not_available" | "unavailable";
};

export const buildComparison = (
  effectiveLevel: ReviewLevel,
  suggestedLevel: ReviewLevel | undefined,
  auditor: AuditorResponse | undefined,
): ComparisonRow => {
  if (!auditor) {
    return {
      effectiveLevel,
      suggestedLevel,
      effectiveVsAuditor: "unavailable",
      suggestedVsAuditor: suggestedLevel === undefined
        ? "not_available"
        : "unavailable",
    };
  }
  return {
    effectiveLevel,
    suggestedLevel,
    effectiveVsAuditor: classifyAgainstRange(effectiveLevel, auditor),
    suggestedVsAuditor: suggestedLevel === undefined
      ? "not_available"
      : classifyAgainstRange(suggestedLevel, auditor),
  };
};
