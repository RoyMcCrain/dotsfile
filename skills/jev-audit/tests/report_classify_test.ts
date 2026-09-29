import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildComparison, classifyAgainstRange } from "../scripts/classify.ts";
import { buildReport } from "../scripts/report.ts";
import type { PlanCase, WeeklyPlan } from "../scripts/plan_types.ts";

const planCase = (overrides: Partial<PlanCase> = {}): PlanCase => ({
  runId: "r1",
  patchSha256: "a".repeat(64),
  stratum: "random",
  createdAt: "2026-09-29T01:00:00.000Z",
  effectiveLevel: 3,
  suggestedLevel: 2,
  source: "jev",
  confidence: 0.9,
  reason: "jev_ok",
  ...overrides,
});

Deno.test("effective vs suggested denominators and strata separation", async () => {
  const comparison = buildComparison(5, undefined, {
    minLevel: 2,
    maxLevel: 4,
    reason: "r",
    concerns: [],
  });
  assert.equal(comparison.suggestedVsAuditor, "not_available");
  assert.equal(comparison.effectiveVsAuditor, "too_deep_candidate");
  assert.equal(
    classifyAgainstRange(1, { minLevel: 2, maxLevel: 4 }),
    "too_shallow_candidate",
  );
  assert.equal(
    classifyAgainstRange(2, { minLevel: 2, maxLevel: 4 }),
    "aligned",
  );
  assert.equal(
    classifyAgainstRange(4, { minLevel: 2, maxLevel: 4 }),
    "aligned",
  );

  const auditBase = await mkdtemp(join(tmpdir(), "jev-resolver-"));

  const plan: WeeklyPlan = {
    schemaVersion: 1,
    weekStart: "2026-09-28",
    weekEnd: "2026-10-05",
    seed: "a".repeat(64),
    createdAt: "2026-01-01T00:00:00.000Z",
    runsDirCanonical: "/tmp/runs",
    promptVersion: 1,
    counts: {
      historyDecisions: 1,
      eligibleUniquePatches: 1,
      duplicatePatchRuns: 0,
      excludedNotAuto: 0,
      excludedOutOfPeriod: 0,
      selectedTotal: 2,
      randomSelected: 1,
      riskSelected: 1,
    },
    selected: [
      planCase({
        stratum: "random",
        runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      planCase({
        stratum: "risk",
        runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        suggestedLevel: 4,
      }),
    ],
  };
  try {
    const report = await buildReport({
      auditBase,
      weekRoot: join(auditBase, "weeks", plan.weekStart),
      plan,
      caseStates: [
        {
          planCase: plan.selected[0],
          status: "audited",
          result: {
            schemaVersion: 1,
            runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            weekStart: plan.weekStart,
            patchSha256: plan.selected[0].patchSha256,
            resolvedAuditorModel: "mock/auditor-model",
            promptHash: "a".repeat(64),
            status: "success",
            independent: true,
            auditor: { minLevel: 2, maxLevel: 4, reason: "ok", concerns: [] },
            attemptedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        { planCase: plan.selected[1], status: "needs_preflight" },
      ],
    });
    const random = report.strata.find((s) => s.stratum === "random");
    const risk = report.strata.find((s) => s.stratum === "risk");
    assert.equal(random?.comparableEffective, 1);
    assert.equal(risk?.comparableEffective, 0);
    assert.equal(report.weekOverWeek?.available, false);
    assert.deepEqual(report.auditor.recordedModels, ["mock/auditor-model"]);
  } finally {
    // temp cleaned by OS
  }
});
