import { createHash } from "node:crypto";
import type { LevelDecision } from "../../parallel-review/scripts/select_review_level.ts";
import type { DecisionHistoryEntry } from "../../parallel-review/scripts/review_history.ts";

export type PlanStratum = "random" | "risk";

export type EligiblePatch = {
  runId: string;
  createdAt: string;
  patchSha256: string;
  levelDecision: LevelDecision;
};

export type SamplingCounts = {
  eligibleUniquePatches: number;
  duplicatePatchRuns: number;
  excludedNotAuto: number;
  excludedOutOfPeriod: number;
};

const RISK_CONFIDENCE_THRESHOLD = 0.8;

export const isRiskFocused = (decision: LevelDecision): boolean =>
  decision.source === "fallback" ||
  (decision.confidence !== undefined &&
    decision.confidence < RISK_CONFIDENCE_THRESHOLD);

export const dedupeByPatch = (
  entries: DecisionHistoryEntry[],
): { unique: EligiblePatch[]; duplicateRuns: number } => {
  const byPatch = new Map<string, EligiblePatch>();
  let duplicateRuns = 0;
  for (const entry of entries) {
    const patchSha256 = entry.levelDecision.patchSha256;
    const existing = byPatch.get(patchSha256);
    if (!existing) {
      byPatch.set(patchSha256, {
        runId: entry.runId,
        createdAt: entry.createdAt,
        patchSha256,
        levelDecision: entry.levelDecision,
      });
      continue;
    }
    duplicateRuns++;
    const keepExisting = entry.createdAt.localeCompare(existing.createdAt) > 0
      ? false
      : entry.createdAt.localeCompare(existing.createdAt) === 0
      ? entry.runId.localeCompare(existing.runId) > 0
      : true;
    if (!keepExisting) {
      byPatch.set(patchSha256, {
        runId: entry.runId,
        createdAt: entry.createdAt,
        patchSha256,
        levelDecision: entry.levelDecision,
      });
    }
  }
  const unique = [...byPatch.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) ||
    a.runId.localeCompare(b.runId)
  );
  return { unique, duplicateRuns };
};

const rankKey = (seed: string, patchSha256: string): string =>
  createHash("sha256").update(`${seed}\0${patchSha256}`).digest("hex");

export const selectRandomSample = (
  candidates: EligiblePatch[],
  seed: string,
  limit: number,
): EligiblePatch[] =>
  [...candidates]
    .sort((a, b) =>
      rankKey(seed, a.patchSha256).localeCompare(
        rankKey(seed, b.patchSha256),
      ) || a.runId.localeCompare(b.runId)
    )
    .slice(0, limit);

export const selectRiskSample = (
  candidates: EligiblePatch[],
  limit: number,
): EligiblePatch[] => {
  const risk = candidates.filter((c) => isRiskFocused(c.levelDecision));
  return [...risk]
    .sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.runId.localeCompare(b.runId)
    )
    .slice(0, limit);
};

export type SelectedCase = EligiblePatch & { stratum: PlanStratum };

export const buildWeeklySelection = (
  eligible: EligiblePatch[],
  seed: string,
): SelectedCase[] => {
  const random = selectRandomSample(eligible, seed, 5);
  const randomIds = new Set(random.map((r) => r.patchSha256));
  const remaining = eligible.filter((e) => !randomIds.has(e.patchSha256));
  const risk = selectRiskSample(remaining, 5);
  return [
    ...random.map((r) => ({ ...r, stratum: "random" as const })),
    ...risk.map((r) => ({ ...r, stratum: "risk" as const })),
  ];
};
