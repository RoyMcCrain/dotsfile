import assert from "node:assert/strict";
import { renderAuditReportHtml } from "../scripts/render_report.ts";
import type { AuditReport } from "../scripts/report.ts";
import { buildComparison } from "../scripts/classify.ts";

const baseReport = (): AuditReport => ({
  schemaVersion: 1,
  reportType: "jev-routing-depth-audit",
  generatedAt: "2026-01-01T00:00:00.000Z",
  period: { weekStart: "2026-09-21", weekEnd: "2026-09-28" },
  auditor: {
    role: "review.codex",
    recordedModels: ["mock/auditor"],
    mixedAuditors: false,
    promptHash: "a".repeat(64),
  },
  counts: {
    historyDecisions: 1,
    eligibleUniquePatches: 1,
    duplicatePatchRuns: 0,
    excludedNotAuto: 0,
    excludedOutOfPeriod: 0,
    selectedTotal: 1,
    randomSelected: 1,
    riskSelected: 0,
    held: 0,
    needsPreflight: 0,
    approvedPending: 0,
    unavailable: 0,
    audited: 1,
    attemptedCalls: 1,
    cacheHits: 0,
    costUsd: "未計測",
  },
  cases: [{
    runId: "11111111-1111-4111-8111-111111111111",
    stratum: "random",
    patchSha256Short: "abc",
    status: "audited",
    source: "jev",
    effectiveLevel: 3,
    suggestedLevel: 2,
    confidence: 0.9,
    jevReason: "test<script>alert(1)</script>",
    fallbackOrLowConfidence: false,
    contextImperfect: true,
    recordedAuditorModel: "mock/auditor",
    auditor: {
      minLevel: 2,
      maxLevel: 4,
      reason: "ok&bad",
      concerns: ["c<1>"],
    },
    comparison: buildComparison(3, 2, {
      minLevel: 2,
      maxLevel: 4,
      reason: "ok&bad",
      concerns: ["c<1>"],
    }),
    independent: true,
  }],
  strata: [{
    stratum: "random",
    selected: 1,
    held: 0,
    unavailable: 0,
    audited: 1,
    independentAudited: 1,
    comparableEffective: 1,
    effectiveDisagreement: 0,
    effectiveDisagreementRate: 0,
    comparableSuggested: 1,
    suggestedDisagreement: 1,
    suggestedDisagreementRate: 1,
    tooShallowEffective: 0,
    tooDeepEffective: 0,
    cacheExcluded: 0,
  }],
  caveats: ["note"],
});

Deno.test("HTML includes structured reasons and escapes hostile text", () => {
  const html = renderAuditReportHtml(baseReport());
  assert.match(html, /Jev reason/);
  assert.match(html, /監査 reason/);
  assert.match(html, /concerns/);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /ok&amp;bad/);
  assert.match(html, /c&lt;1&gt;/);
  assert.match(html, /test&lt;script&gt;/);
});
