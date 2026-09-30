import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { readDecisionHistory } from "../../parallel-review/scripts/review_history.ts";
import { createdAtInPeriod, type UtcWeekPeriod } from "./week_period.ts";
import {
  buildWeeklySelection,
  dedupeByPatch,
  type EligiblePatch,
} from "./sampling.ts";
import type { PlanCase, WeeklyPlan } from "./plan_types.ts";
import {
  assertPlanRunsDir,
  readPlan,
  writePlanImmutable,
} from "./plan_store.ts";
import {
  assertAuditRelativePathSafe,
  ensurePrivateDir,
  resolveEffectiveRunsCanonical,
} from "./paths.ts";
import { AUDITOR_PROMPT_VERSION } from "./auditor_prompt.ts";
const planCaseFromEligible = (
  item: EligiblePatch & { stratum: "random" | "risk" },
): PlanCase => ({
  runId: item.runId,
  patchSha256: item.patchSha256,
  stratum: item.stratum,
  createdAt: item.createdAt,
  effectiveLevel: item.levelDecision.level,
  suggestedLevel: item.levelDecision.suggestedLevel,
  source: item.levelDecision.source,
  confidence: item.levelDecision.confidence,
  reason: item.levelDecision.reason,
  contextSha256: item.levelDecision.contextSha256,
  jevModel: item.levelDecision.model,
});

export const weeklySeed = (weekStart: string): string =>
  createHash("sha256").update(`jev-audit-week:${weekStart}`).digest("hex");

export const assertWeekPeriodCompleted = (
  period: UtcWeekPeriod,
  now = new Date(),
): void => {
  const endMs = Date.parse(period.weekEndIso);
  if (Number.isNaN(endMs)) throw new Error("invalid week period");
  if (now.getTime() < endMs) {
    throw new Error("week period not yet completed");
  }
};

const summarizeHistoryWarnings = (
  warnings: Array<{ runDir: string; reason: string }>,
): { duplicateRunIdWarnings: number; historyWarningCodes: string[] } => {
  const counts = new Map<string, number>();
  for (const w of warnings) {
    counts.set(w.reason, (counts.get(w.reason) ?? 0) + 1);
  }
  return {
    duplicateRunIdWarnings: counts.get("duplicate_run_id") ?? 0,
    historyWarningCodes: [...counts.entries()].map(([code, count]) =>
      `${code}:${count}`
    ),
  };
};

export const buildPlanFromHistory = async (options: {
  period: UtcWeekPeriod;
  runsDir?: string;
  runsDirCanonical: string;
}): Promise<WeeklyPlan> => {
  const { decisions, warnings } = await readDecisionHistory({
    runsDir: options.runsDir,
  });
  const warnSummary = summarizeHistoryWarnings(warnings);
  let excludedOutOfPeriod = 0;
  let excludedNotAuto = 0;
  const inPeriodAuto: typeof decisions = [];
  for (const entry of decisions) {
    if (!createdAtInPeriod(entry.createdAt, options.period)) {
      excludedOutOfPeriod++;
      continue;
    }
    if (entry.levelDecision.requestedLevel !== "auto") {
      excludedNotAuto++;
      continue;
    }
    if (
      entry.levelDecision.source !== "jev" &&
      entry.levelDecision.source !== "fallback"
    ) {
      excludedNotAuto++;
      continue;
    }
    inPeriodAuto.push(entry);
  }
  const { unique, duplicateRuns } = dedupeByPatch(inPeriodAuto);
  const seed = weeklySeed(options.period.weekStart);
  const selected = buildWeeklySelection(unique, seed);
  const randomSelected = selected.filter((s) => s.stratum === "random").length;
  const riskSelected = selected.filter((s) => s.stratum === "risk").length;
  return {
    schemaVersion: 1,
    weekStart: options.period.weekStart,
    weekEnd: options.period.weekEnd,
    seed,
    createdAt: new Date().toISOString(),
    runsDirCanonical: options.runsDirCanonical,
    promptVersion: AUDITOR_PROMPT_VERSION,
    counts: {
      historyDecisions: decisions.length,
      eligibleUniquePatches: unique.length,
      duplicatePatchRuns: duplicateRuns,
      excludedNotAuto,
      excludedOutOfPeriod,
      selectedTotal: selected.length,
      randomSelected,
      riskSelected,
      duplicateRunIdWarnings: warnSummary.duplicateRunIdWarnings,
      historyWarningCodes: warnSummary.historyWarningCodes,
    },
    selected: selected.map(planCaseFromEligible),
  };
};

export const ensureWeeklyPlan = async (options: {
  auditBase: string;
  period: UtcWeekPeriod;
  runsDir?: string;
}): Promise<{ weekRoot: string; plan: WeeklyPlan; created: boolean }> => {
  assertWeekPeriodCompleted(options.period);
  const runsDirCanonical = await resolveEffectiveRunsCanonical(options.runsDir);
  const base = await ensurePrivateDir(options.auditBase, options.runsDir);
  const root = await assertAuditRelativePathSafe(
    base,
    ["weeks", options.period.weekStart],
    "week directory",
  );
  await assertAuditRelativePathSafe(
    base,
    ["weeks", options.period.weekStart, "plan.json"],
    "plan",
  );
  const existing = await readPlan(base, options.period.weekStart);
  if (existing) {
    if (
      existing.weekStart !== options.period.weekStart ||
      existing.weekEnd !== options.period.weekEnd
    ) {
      throw new Error("existing plan week mismatch");
    }
    assertPlanRunsDir(existing, runsDirCanonical);
    if (existing.promptVersion !== AUDITOR_PROMPT_VERSION) {
      throw new Error("plan prompt version mismatch");
    }
    return { weekRoot: root, plan: existing, created: false };
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  await Deno.chmod(root, 0o700);
  const plan = await buildPlanFromHistory({
    period: options.period,
    runsDir: options.runsDir,
    runsDirCanonical,
  });
  await writePlanImmutable(base, options.period.weekStart, plan);
  return { weekRoot: root, plan, created: true };
};
