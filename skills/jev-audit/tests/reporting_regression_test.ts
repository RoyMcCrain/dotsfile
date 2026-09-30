import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildReport, deriveCaseState } from "../scripts/report.ts";
import { promptHash } from "../scripts/result_store.ts";
import { AUDITOR_PROMPT_VERSION } from "../scripts/auditor_prompt.ts";
import type { PlanCase, WeeklyPlan } from "../scripts/plan_types.ts";

const planCase = (overrides: Partial<PlanCase> = {}): PlanCase => ({
  runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patchSha256: "c".repeat(64),
  stratum: "random",
  createdAt: "2020-09-29T01:00:00.000Z",
  effectiveLevel: 3,
  source: "jev",
  reason: "r",
  ...overrides,
});

const validApproval = (
  pc: PlanCase,
  week: string,
  ph: string,
) => ({
  schemaVersion: 1 as const,
  weekStart: week,
  runId: pc.runId,
  patchSha256: pc.patchSha256,
  resolvedAuditorModel: "mock/auditor",
  approvedAt: "2020-01-01T00:00:00.000Z",
  approvedInputSha256: pc.patchSha256,
  promptVersion: 1,
  promptHash: ph,
});

const validAuditor = {
  minLevel: 2 as const,
  maxLevel: 4 as const,
  reason: "ok",
  concerns: [] as string[],
};

Deno.test("deriveCaseState rejects mismatched approval bindings", async () => {
  const week = "2020-09-28";
  const ph = promptHash();
  const pc = planCase();
  const mismatchCases: Array<{
    label: string;
    approvalPatch: Partial<ReturnType<typeof validApproval>>;
    resultStatus: "success" | "cached";
    resultPatch: Record<string, unknown>;
  }> = [
    {
      label: "runId",
      approvalPatch: { runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      resultStatus: "success",
      resultPatch: {},
    },
    {
      label: "weekStart",
      approvalPatch: { weekStart: "2020-09-21" },
      resultStatus: "success",
      resultPatch: {},
    },
    {
      label: "patchSha256",
      approvalPatch: {
        patchSha256: "b".repeat(64),
        approvedInputSha256: "b".repeat(64),
      },
      resultStatus: "success",
      resultPatch: {},
    },
    {
      label: "runId cached",
      approvalPatch: { runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      resultStatus: "cached",
      resultPatch: { cachedFromWeek: "2020-09-21", independent: false },
    },
    {
      label: "weekStart cached",
      approvalPatch: { weekStart: "2020-09-21" },
      resultStatus: "cached",
      resultPatch: { cachedFromWeek: "2020-09-21", independent: false },
    },
    {
      label: "patchSha256 cached",
      approvalPatch: {
        patchSha256: "b".repeat(64),
        approvedInputSha256: "b".repeat(64),
      },
      resultStatus: "cached",
      resultPatch: { cachedFromWeek: "2020-09-21", independent: false },
    },
  ];

  for (const mismatch of mismatchCases) {
    const auditBase = await mkdtemp(join(tmpdir(), "jev-report-appr-"));
    const weekRoot = join(auditBase, "weeks", week);
    await mkdir(join(weekRoot, "approvals"), { recursive: true });
    await mkdir(join(weekRoot, "results"), { recursive: true });
    const approval = {
      ...validApproval(pc, week, ph),
      ...mismatch.approvalPatch,
    };
    await writeFile(
      join(weekRoot, "approvals", `${pc.runId}.json`),
      `${JSON.stringify(approval, null, 2)}\n`,
    );
    await writeFile(
      join(weekRoot, "results", `${pc.runId}.json`),
      `${
        JSON.stringify(
          {
            schemaVersion: 1,
            runId: pc.runId,
            weekStart: week,
            patchSha256: pc.patchSha256,
            resolvedAuditorModel: "mock/auditor",
            promptHash: ph,
            status: mismatch.resultStatus,
            independent: mismatch.resultStatus === "success",
            auditor: validAuditor,
            attemptedAt: "2020-01-01T00:00:00.000Z",
            ...mismatch.resultPatch,
          },
          null,
          2,
        )
      }\n`,
    );
    const state = await deriveCaseState(auditBase, week, pc);
    assert.equal(state.status, "held", mismatch.label);
    assert.equal(state.reason, "approval_mismatch", mismatch.label);
    await rm(auditBase, { recursive: true, force: true });
  }
});

Deno.test("deriveCaseState rejects approval promptHash mismatch against stored result", async () => {
  const auditBase = await mkdtemp(join(tmpdir(), "jev-report-appr-ph-"));
  const week = "2020-09-28";
  const pc = planCase();
  const weekRoot = join(auditBase, "weeks", week);
  await mkdir(join(weekRoot, "approvals"), { recursive: true });
  await mkdir(join(weekRoot, "results"), { recursive: true });
  const ph = promptHash();
  const stalePrompt = "d".repeat(64);
  await writeFile(
    join(weekRoot, "approvals", `${pc.runId}.json`),
    `${JSON.stringify(validApproval(pc, week, stalePrompt), null, 2)}\n`,
  );
  await writeFile(
    join(weekRoot, "results", `${pc.runId}.json`),
    `${
      JSON.stringify(
        {
          schemaVersion: 1,
          runId: pc.runId,
          weekStart: week,
          patchSha256: pc.patchSha256,
          resolvedAuditorModel: "mock/auditor",
          promptHash: ph,
          status: "success",
          independent: true,
          auditor: validAuditor,
          attemptedAt: "2020-01-01T00:00:00.000Z",
        },
        null,
        2,
      )
    }\n`,
  );
  const state = await deriveCaseState(auditBase, week, pc);
  assert.equal(state.status, "unavailable");
  assert.equal(state.reason, "invalid_stored_result");
  await rm(auditBase, { recursive: true, force: true });
});

Deno.test("deriveCaseState keeps historical audited result when approval prompt differs from live prompt", async () => {
  const auditBase = await mkdtemp(join(tmpdir(), "jev-report-hist-"));
  const week = "2020-09-28";
  const pc = planCase();
  const weekRoot = join(auditBase, "weeks", week);
  await mkdir(join(weekRoot, "approvals"), { recursive: true });
  await mkdir(join(weekRoot, "results"), { recursive: true });
  const historicalPrompt = "d".repeat(64);
  assert.notEqual(historicalPrompt, promptHash());
  await writeFile(
    join(weekRoot, "approvals", `${pc.runId}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        weekStart: week,
        runId: pc.runId,
        patchSha256: pc.patchSha256,
        resolvedAuditorModel: "mock/auditor",
        approvedAt: "2020-01-01T00:00:00.000Z",
        approvedInputSha256: pc.patchSha256,
        promptVersion: 1,
        promptHash: historicalPrompt,
      })
    }\n`,
  );
  await writeFile(
    join(weekRoot, "results", `${pc.runId}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        runId: pc.runId,
        weekStart: week,
        patchSha256: pc.patchSha256,
        resolvedAuditorModel: "mock/auditor",
        promptHash: historicalPrompt,
        status: "success",
        independent: true,
        auditor: {
          minLevel: 2,
          maxLevel: 4,
          reason: "ok",
          concerns: [],
        },
        attemptedAt: "2020-01-01T00:00:00.000Z",
      })
    }\n`,
  );
  const state = await deriveCaseState(auditBase, week, pc);
  assert.equal(state.status, "audited");
  await rm(auditBase, { recursive: true, force: true });
});

const basePlan = (): WeeklyPlan => ({
  schemaVersion: 1,
  weekStart: "2020-09-28",
  weekEnd: "2020-10-05",
  seed: "a".repeat(64),
  createdAt: "2020-01-01T00:00:00.000Z",
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
  selected: [planCase()],
});

Deno.test("buildReport uses no_prior_week only when prior report is absent", async () => {
  const auditBase = await mkdtemp(join(tmpdir(), "jev-report-prior-miss-"));
  const plan = basePlan();
  const ph = promptHash();
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
        promptHash: ph,
        status: "success",
        independent: true,
        auditor: {
          minLevel: 2,
          maxLevel: 4,
          reason: "ok",
          concerns: [],
        },
        attemptedAt: "2020-01-01T00:00:00.000Z",
      },
    }],
  });
  assert.equal(report.weekOverWeek?.available, false);
  assert.equal(report.weekOverWeek?.reason, "no_prior_week");
  await rm(auditBase, { recursive: true, force: true });
});

Deno.test("buildReport marks invalid_prior_report when prior report is corrupt", async () => {
  const auditBase = await mkdtemp(join(tmpdir(), "jev-report-prior-bad-"));
  const plan = basePlan();
  const priorRoot = join(auditBase, "weeks", "2020-09-21");
  await mkdir(priorRoot, { recursive: true });
  await writeFile(join(priorRoot, "report.json"), "{\n", { mode: 0o600 });
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
        promptHash: promptHash(),
        status: "success",
        independent: true,
        auditor: {
          minLevel: 2,
          maxLevel: 4,
          reason: "ok",
          concerns: [],
        },
        attemptedAt: "2020-01-01T00:00:00.000Z",
      },
    }],
  });
  assert.equal(report.weekOverWeek?.available, false);
  assert.equal(report.weekOverWeek?.reason, "invalid_prior_report");
  await rm(auditBase, { recursive: true, force: true });
});
