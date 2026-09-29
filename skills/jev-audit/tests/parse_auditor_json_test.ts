import assert from "node:assert/strict";
import { parseAuditorResponse } from "../scripts/parse_auditor_json.ts";
import { renderAuditReportHtml } from "../scripts/render_report.ts";
import type { AuditReport } from "../scripts/report.ts";

Deno.test("schema rejects invalid auditor JSON", () => {
  assert.throws(() => parseAuditorResponse("not json"), /JSON/);
  assert.throws(
    () =>
      parseAuditorResponse(
        '{"minLevel":3,"maxLevel":2,"reason":"x","concerns":[]}',
      ),
    /minLevel/,
  );
  assert.throws(
    () =>
      parseAuditorResponse(
        '{"minLevel":3,"maxLevel":4,"reason":"","concerns":[]}',
      ),
    /reason/,
  );
});

Deno.test("accepts fenced JSON block", () => {
  const raw =
    '```json\n{"minLevel":2,"maxLevel":4,"reason":"ok","concerns":["a"]}\n```';
  const parsed = parseAuditorResponse(raw);
  assert.equal(parsed.minLevel, 2);
  assert.equal(parsed.maxLevel, 4);
  assert.throws(() => parseAuditorResponse(`prose\n${raw}`), /JSON/);
  assert.throws(() => parseAuditorResponse(`${raw}\n${raw}`), /JSON/);
});

Deno.test("HTML escaping", () => {
  const report: AuditReport = {
    schemaVersion: 1,
    reportType: "jev-routing-depth-audit",
    generatedAt: "2026-01-01T00:00:00.000Z",
    period: { weekStart: "2026-09-29", weekEnd: "2026-10-06" },
    auditor: {
      role: "review.codex",
      recordedModels: [],
      mixedAuditors: false,
      promptHash: "abc",
    },
    counts: {
      historyDecisions: 0,
      eligibleUniquePatches: 0,
      duplicatePatchRuns: 0,
      excludedNotAuto: 0,
      excludedOutOfPeriod: 0,
      selectedTotal: 0,
      randomSelected: 0,
      riskSelected: 0,
      held: 0,
      needsPreflight: 0,
      approvedPending: 0,
      unavailable: 0,
      audited: 0,
      attemptedCalls: 0,
      cacheHits: 0,
      costUsd: "未計測",
    },
    cases: [],
    strata: [],
    caveats: ["<script>alert(1)</script>"],
  };
  const html = renderAuditReportHtml(report);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
});
