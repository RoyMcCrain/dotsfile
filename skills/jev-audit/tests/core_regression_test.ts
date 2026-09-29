import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertAuditBaseSeparateFromRuns } from "../scripts/paths.ts";
import { validateWeeklyPlan } from "../scripts/validate_state.ts";
import { type AuditReport, buildReport } from "../scripts/report.ts";
import { promptHash } from "../scripts/result_store.ts";
import type { WeeklyPlan } from "../scripts/plan_types.ts";
import {
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";
import { AUDITOR_PROMPT_VERSION } from "../scripts/auditor_prompt.ts";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");

Deno.test("rejects audit-dir when symlink ancestor aliases into runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-symlink-runs-"));
  const runs = join(root, "runs");
  await mkdir(runs, { recursive: true });
  const alias = join(root, "alias");
  await symlink(runs, alias);
  const auditCandidate = join(alias, "jev-audit");
  await assert.rejects(
    () => assertAuditBaseSeparateFromRuns(auditCandidate, runs),
    /must not live under runs/,
  );
  await rm(root, { recursive: true, force: true });
});

Deno.test("validateWeeklyPlan preserves historyWarningCodes under counts", () => {
  const plan = validateWeeklyPlan({
    schemaVersion: 1,
    weekStart: "2026-09-28",
    weekEnd: "2026-10-05",
    seed: "a".repeat(64),
    createdAt: "2026-01-01T00:00:00.000Z",
    runsDirCanonical: "/tmp/runs",
    promptVersion: AUDITOR_PROMPT_VERSION,
    counts: {
      historyDecisions: 1,
      eligibleUniquePatches: 1,
      duplicatePatchRuns: 0,
      excludedNotAuto: 0,
      excludedOutOfPeriod: 0,
      selectedTotal: 0,
      randomSelected: 0,
      riskSelected: 0,
      historyWarningCodes: ["duplicate_run_id:2"],
    },
    selected: [],
  });
  assert.deepEqual(plan.counts.historyWarningCodes, ["duplicate_run_id:2"]);
});

Deno.test("buildReport week-over-week uses recorded models not live resolver", async () => {
  const auditBase = await mkdtemp(join(tmpdir(), "jev-wow-"));
  const model = "recorded/auditor-v1";
  const ph = promptHash();
  const basePlan = (): WeeklyPlan => ({
    schemaVersion: 1,
    weekStart: "2026-09-14",
    weekEnd: "2026-09-21",
    seed: "a".repeat(64),
    createdAt: "2026-01-01T00:00:00.000Z",
    runsDirCanonical: "/tmp/runs",
    promptVersion: AUDITOR_PROMPT_VERSION,
    counts: {
      historyDecisions: 1,
      eligibleUniquePatches: 1,
      duplicatePatchRuns: 0,
      excludedNotAuto: 0,
      excludedOutOfPeriod: 0,
      selectedTotal: 1,
      randomSelected: 1,
      riskSelected: 0,
    },
    selected: [{
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patchSha256: "a".repeat(64),
      stratum: "random",
      createdAt: "2026-09-15T01:00:00.000Z",
      effectiveLevel: 3,
      source: "jev",
      reason: "r",
    }],
  });
  const mkReport = (
    weekStart: string,
    weekEnd: string,
    effDis: number,
  ): AuditReport => ({
    schemaVersion: 1,
    reportType: "jev-routing-depth-audit",
    generatedAt: "2026-01-01T00:00:00.000Z",
    period: { weekStart, weekEnd },
    auditor: {
      role: "review.codex",
      recordedModels: [model],
      mixedAuditors: false,
      promptHash: ph,
    },
    counts: {
      ...basePlan().counts,
      held: 0,
      needsPreflight: 0,
      approvedPending: 0,
      unavailable: 0,
      audited: 1,
      attemptedCalls: 1,
      cacheHits: 0,
      costUsd: "未計測",
    },
    cases: [],
    strata: [{
      stratum: "random",
      selected: 1,
      held: 0,
      unavailable: 0,
      audited: 1,
      independentAudited: 1,
      comparableEffective: 4,
      effectiveDisagreement: effDis,
      effectiveDisagreementRate: effDis / 4,
      comparableSuggested: 0,
      suggestedDisagreement: 0,
      tooShallowEffective: 0,
      tooDeepEffective: 0,
      cacheExcluded: 0,
    }, {
      stratum: "risk",
      selected: 0,
      held: 0,
      unavailable: 0,
      audited: 0,
      independentAudited: 0,
      comparableEffective: 0,
      effectiveDisagreement: 0,
      comparableSuggested: 0,
      suggestedDisagreement: 0,
      tooShallowEffective: 0,
      tooDeepEffective: 0,
      cacheExcluded: 0,
    }],
    caveats: [],
  });
  const priorRoot = join(auditBase, "weeks", "2026-09-14");
  await mkdir(priorRoot, { recursive: true });
  const priorPlanBody = {
    ...basePlan(),
    weekStart: "2026-09-14",
    weekEnd: "2026-09-21",
  };
  await writeFile(
    join(priorRoot, "plan.json"),
    `${JSON.stringify(priorPlanBody)}\n`,
  );
  await writeFile(
    join(priorRoot, "report.json"),
    `${JSON.stringify(mkReport("2026-09-14", "2026-09-21", 0))}\n`,
  );
  const plan = {
    ...basePlan(),
    weekStart: "2026-09-21",
    weekEnd: "2026-09-28",
  };
  const report = await buildReport({
    auditBase,
    weekRoot: join(auditBase, "weeks", "2026-09-21"),
    plan,
    caseStates: [{
      planCase: plan.selected[0],
      status: "audited",
      result: {
        schemaVersion: 1,
        runId: plan.selected[0].runId,
        weekStart: plan.weekStart,
        patchSha256: plan.selected[0].patchSha256,
        resolvedAuditorModel: model,
        promptHash: ph,
        status: "success",
        independent: true,
        auditor: {
          minLevel: 2,
          maxLevel: 4,
          reason: "ok",
          concerns: [],
        },
        attemptedAt: "2026-01-01T00:00:00.000Z",
      },
    }],
  });
  assert.equal(report.weekOverWeek?.available, true);
  assert.equal(report.weekOverWeek?.effectiveDisagreementRateDelta, 0);
  await rm(auditBase, { recursive: true, force: true });
});

Deno.test("CLI rejects unknown prepare flags", async () => {
  const home = await mkdtemp(join(tmpdir(), "jev-cli-flag-"));
  const out = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "--no-config",
      AUDIT_SCRIPT,
      "prepare",
      "--unknown-flag",
    ],
    env: {
      ...Deno.env.toObject(),
      HOME: home,
      XDG_DATA_HOME: join(home, "xdg"),
    },
    stderr: "piped",
  }).output();
  assert.equal(out.success, false);
  await rm(home, { recursive: true, force: true });
});

Deno.test("buildReport auditor promptHash uses recorded result not live prompt", async () => {
  const auditBase = await mkdtemp(join(tmpdir(), "jev-recorded-ph-"));
  const storedPrompt = "f".repeat(64);
  const plan: WeeklyPlan = {
    schemaVersion: 1,
    weekStart: "2026-09-28",
    weekEnd: "2026-10-05",
    seed: "a".repeat(64),
    createdAt: "2026-01-01T00:00:00.000Z",
    runsDirCanonical: "/tmp/runs",
    promptVersion: AUDITOR_PROMPT_VERSION,
    counts: {
      historyDecisions: 1,
      eligibleUniquePatches: 1,
      duplicatePatchRuns: 0,
      excludedNotAuto: 0,
      excludedOutOfPeriod: 0,
      selectedTotal: 1,
      randomSelected: 1,
      riskSelected: 0,
    },
    selected: [{
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patchSha256: "a".repeat(64),
      stratum: "random",
      createdAt: "2026-09-29T01:00:00.000Z",
      effectiveLevel: 3,
      source: "jev",
      reason: "r",
    }],
  };
  const report = await buildReport({
    auditBase,
    weekRoot: join(auditBase, "weeks", plan.weekStart),
    plan,
    caseStates: [{
      planCase: plan.selected[0],
      status: "audited",
      result: {
        schemaVersion: 1,
        runId: plan.selected[0].runId,
        weekStart: plan.weekStart,
        patchSha256: plan.selected[0].patchSha256,
        resolvedAuditorModel: "mock/auditor",
        promptHash: storedPrompt,
        status: "success",
        independent: true,
        auditor: {
          minLevel: 2,
          maxLevel: 4,
          reason: "ok",
          concerns: [],
        },
        attemptedAt: "2026-01-01T00:00:00.000Z",
      },
    }],
  });
  assert.equal(report.auditor.promptHash, storedPrompt);
  assert.notEqual(report.auditor.promptHash, promptHash());
  await rm(auditBase, { recursive: true, force: true });
});

Deno.test("cached failure stays unavailable on repeated run", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-cached-fail-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  const PATCH = "diff --git a/a b\n+1\n";
  const hash = sha256Bytes(new TextEncoder().encode(PATCH));
  const runId = "33333333-3333-4333-8333-333333333333";
  const runDir = join(runsDir, `2026-09-29-${runId}`);
  await mkdir(runDir, { recursive: true });
  await writeFile(
    join(runDir, "metadata.json"),
    JSON.stringify({
      schemaVersion: 1,
      runId,
      createdAt: "2026-09-29T12:00:00.000Z",
      repository: "/r",
      revision: "abc",
      level: 2,
      levelScale: 5,
      levelDecision: buildJevDecision({
        level: 2,
        patchSha256: hash,
        minConfidence: 0.7,
        model: "route/mock-jev",
        confidence: 0.9,
      }),
    }),
  );
  await writeFile(join(runDir, "changes.patch"), PATCH);
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: join(import.meta.dirname!, "fixtures/resolve_mock.sh"),
    PI_REVIEW_BIN: join(root, "missing-pi"),
  };
  const week = "2026-09-28";
  const prep = async () => {
    await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--no-config",
        AUDIT_SCRIPT,
        "prepare",
        "--runs-dir",
        runsDir,
        "--audit-dir",
        auditDir,
        "--week",
        week,
      ],
      env: { ...Deno.env.toObject(), ...env },
    }).output();
  };
  await prep();
  const weekRoot = join(auditDir, "weeks", week);
  await mkdir(join(weekRoot, "results"), { recursive: true });
  await writeFile(
    join(weekRoot, "results", `${runId}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        runId,
        weekStart: week,
        patchSha256: hash,
        resolvedAuditorModel: "mock/auditor",
        promptHash: promptHash(),
        status: "cached",
        independent: false,
        cachedFromWeek: "2026-09-14",
        failureReason: "runner_failed",
        attemptedAt: "2026-01-01T00:00:00.000Z",
      })
    }\n`,
  );
  await prep();
  const report = JSON.parse(
    await readFile(join(weekRoot, "report.json"), "utf8"),
  ) as { cases: Array<{ status: string }> };
  assert.equal(report.cases[0]?.status, "unavailable");
  await rm(root, { recursive: true, force: true });
});
