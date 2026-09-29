import { readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildComparison, type DepthCandidate } from "./classify.ts";
import type { AuditResultRecord, PlanCase, WeeklyPlan } from "./plan_types.ts";
import {
  assertCachedResultIdentity,
  assertResultIdentity,
  cacheKey,
  hasAttemptMarker,
  isUnavailableResult,
  promptHash,
  readGlobalAttemptMarker,
  readGlobalCache,
  readWeekResult,
} from "./result_store.ts";
import { readPlan } from "./plan_store.ts";
import { renderAuditReportHtml } from "./render_report.ts";
import {
  assertAuditRelativePathSafe,
  reportHtmlPath,
  reportJsonPath,
} from "./paths.ts";
import { readApproval } from "./approval_store.ts";
import { approvalsDir } from "./paths.ts";
import { assertRegularDir, readJsonFile } from "./state_io.ts";
import { defaultAuditorRole } from "./model_resolve.ts";

export type StratumSummary = {
  stratum: "random" | "risk";
  selected: number;
  held: number;
  unavailable: number;
  audited: number;
  independentAudited: number;
  comparableEffective: number;
  effectiveDisagreement: number;
  effectiveDisagreementRate?: number;
  comparableSuggested: number;
  suggestedDisagreement: number;
  suggestedDisagreementRate?: number;
  tooShallowEffective: number;
  tooDeepEffective: number;
  cacheExcluded: number;
};

export type AuditReport = {
  schemaVersion: 1;
  reportType: "jev-routing-depth-audit";
  generatedAt: string;
  period: { weekStart: string; weekEnd: string };
  auditor: {
    role: string;
    recordedModels: string[];
    mixedAuditors: boolean;
    promptHash: string;
  };
  counts: WeeklyPlan["counts"] & {
    held: number;
    needsPreflight: number;
    approvedPending: number;
    unavailable: number;
    audited: number;
    attemptedCalls: number;
    cacheHits: number;
    costUsd: "未計測";
  };
  cases: Array<{
    runId: string;
    stratum: PlanCase["stratum"];
    patchSha256Short: string;
    status: string;
    holdReason?: string;
    failureReason?: string;
    source: PlanCase["source"];
    effectiveLevel: number;
    suggestedLevel?: number;
    confidence?: number;
    jevReason: string;
    fallbackOrLowConfidence: boolean;
    contextImperfect: boolean;
    recordedAuditorModel?: string;
    recordedPromptHash?: string;
    resultStatus?: AuditResultRecord["status"];
    auditor?: AuditResultRecord["auditor"];
    comparison?: ReturnType<typeof buildComparison>;
    independent?: boolean;
    cachedFromWeek?: string;
    nonIndependentLabel?: string;
  }>;
  strata: StratumSummary[];
  cacheSummary?: {
    count: number;
    note: string;
  };
  weekOverWeek?: {
    available: boolean;
    reason?: string;
    effectiveDisagreementRateDelta?: number;
    suggestedDisagreementRateDelta?: number;
  };
  caveats: string[];
};

const shortHash = (h: string): string => h.slice(0, 16);

const isDisagreement = (
  c: DepthCandidate | "unavailable" | "not_available",
): boolean => c === "too_shallow_candidate" || c === "too_deep_candidate";

const rate = (num: number, den: number): number | undefined =>
  den > 0 ? num / den : undefined;

const summarizeStratum = (
  stratum: "random" | "risk",
  rows: AuditReport["cases"],
): StratumSummary => {
  const subset = rows.filter((r) => r.stratum === stratum);
  let comparableEffective = 0;
  let effectiveDisagreement = 0;
  let comparableSuggested = 0;
  let suggestedDisagreement = 0;
  let tooShallowEffective = 0;
  let tooDeepEffective = 0;
  let cacheExcluded = 0;
  let independentAudited = 0;
  for (const row of subset) {
    if (row.status === "audited" && row.independent === false) {
      cacheExcluded++;
    }
    if (row.status !== "audited" || row.independent === false) continue;
    independentAudited++;
    if (!row.comparison) continue;
    if (row.comparison.effectiveVsAuditor !== "unavailable") {
      comparableEffective++;
      if (isDisagreement(row.comparison.effectiveVsAuditor)) {
        effectiveDisagreement++;
      }
      if (row.comparison.effectiveVsAuditor === "too_shallow_candidate") {
        tooShallowEffective++;
      }
      if (row.comparison.effectiveVsAuditor === "too_deep_candidate") {
        tooDeepEffective++;
      }
    }
    const s = row.comparison.suggestedVsAuditor;
    if (s && s !== "not_available" && s !== "unavailable") {
      comparableSuggested++;
      if (isDisagreement(s)) suggestedDisagreement++;
    }
  }
  return {
    stratum,
    selected: subset.length,
    held: subset.filter((r) => r.status === "held").length,
    unavailable: subset.filter((r) => r.status === "unavailable").length,
    audited: subset.filter((r) => r.status === "audited").length,
    independentAudited,
    comparableEffective,
    effectiveDisagreement,
    effectiveDisagreementRate: rate(
      effectiveDisagreement,
      comparableEffective,
    ),
    comparableSuggested,
    suggestedDisagreement,
    suggestedDisagreementRate: rate(
      suggestedDisagreement,
      comparableSuggested,
    ),
    tooShallowEffective,
    tooDeepEffective,
    cacheExcluded,
  };
};

const countAttemptMarkersOnDisk = async (weekRoot: string): Promise<number> => {
  const resultsRoot = join(weekRoot, "results");
  try {
    const names = await readdir(resultsRoot);
    return names.filter((n) => n.endsWith(".attempt.json")).length;
  } catch {
    return 0;
  }
};

const recordedAuditorSummary = (
  caseStates: Array<{
    result?: AuditResultRecord;
    status: string;
  }>,
): { models: string[]; promptHashes: string[]; mixed: boolean } => {
  const models = new Set<string>();
  const promptHashes = new Set<string>();
  for (const state of caseStates) {
    if (state.status !== "audited" || !state.result) continue;
    if (state.result.independent !== true) continue;
    models.add(state.result.resolvedAuditorModel);
    promptHashes.add(state.result.promptHash);
  }
  const modelList = [...models].sort();
  const promptList = [...promptHashes].sort();
  return {
    models: modelList,
    promptHashes: promptList,
    mixed: modelList.length > 1 || promptList.length > 1,
  };
};

export const deriveCaseState = async (
  auditBase: string,
  weekStart: string,
  planCase: PlanCase,
): Promise<{
  planCase: PlanCase;
  status: string;
  result?: AuditResultRecord;
  reason?: string;
}> => {
  const approval = await readApproval(
    approvalsDir(join(auditBase, "weeks", weekStart)),
    planCase.runId,
  );

  const result = await readWeekResult(auditBase, weekStart, planCase.runId);
  if (result) {
    if (!approval) {
      return {
        planCase,
        status: "unavailable",
        reason: "missing_approval",
      };
    }
    try {
      if (result.status === "cached") {
        assertCachedResultIdentity(result, planCase, approval, weekStart);
      } else {
        assertResultIdentity(result, {
          runId: planCase.runId,
          weekStart,
          patchSha256: planCase.patchSha256,
          resolvedAuditorModel: approval.resolvedAuditorModel,
          promptHash: approval.promptHash,
        });
      }
    } catch {
      return {
        planCase,
        status: "unavailable",
        reason: "invalid_stored_result",
      };
    }
    if (isUnavailableResult(result)) {
      return {
        planCase,
        status: "unavailable",
        result,
        reason: result.failureReason,
      };
    }
    return { planCase, status: "audited", result };
  }
  if (await hasAttemptMarker(auditBase, weekStart, planCase.runId)) {
    return {
      planCase,
      status: "unavailable",
      reason: "prior_attempt_incomplete",
    };
  }
  if (!approval) {
    return { planCase, status: "needs_preflight" };
  }
  if (
    approval.patchSha256 !== planCase.patchSha256 ||
    approval.weekStart !== weekStart ||
    approval.runId !== planCase.runId
  ) {
    return { planCase, status: "held", reason: "approval_mismatch" };
  }
  if (approval.promptHash !== promptHash()) {
    return { planCase, status: "held", reason: "prompt_changed" };
  }
  const key = cacheKey(
    planCase.patchSha256,
    approval.resolvedAuditorModel,
  );
  const currentPromptHash = promptHash();
  const cached = await readGlobalCache(auditBase, key);
  if (
    cached &&
    cached.patchSha256 === planCase.patchSha256 &&
    cached.resolvedAuditorModel === approval.resolvedAuditorModel &&
    cached.promptHash === currentPromptHash &&
    (cached.status === "success" || cached.status === "failure")
  ) {
    return { planCase, status: "approved_pending" };
  }
  if (await readGlobalAttemptMarker(auditBase, key)) {
    return {
      planCase,
      status: "unavailable",
      reason: "global_attempt_incomplete",
    };
  }
  return { planCase, status: "approved_pending" };
};

const priorWeekStart = (weekStart: string): string => {
  const ms = Date.parse(`${weekStart}T00:00:00.000Z`) -
    7 * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
};

const validateStratumCounts = (prior: AuditReport): void => {
  for (const s of prior.strata) {
    const ints = [
      s.selected,
      s.held,
      s.unavailable,
      s.audited,
      s.independentAudited,
      s.comparableEffective,
      s.effectiveDisagreement,
      s.comparableSuggested,
      s.suggestedDisagreement,
      s.tooShallowEffective,
      s.tooDeepEffective,
      s.cacheExcluded,
    ];
    for (const n of ints) {
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        throw new Error("invalid prior stratum counts");
      }
    }
    if (s.effectiveDisagreement > s.comparableEffective) {
      throw new Error("invalid prior stratum counts");
    }
    if (s.suggestedDisagreement > s.comparableSuggested) {
      throw new Error("invalid prior stratum counts");
    }
  }
};

const validatePriorReport = (
  prior: AuditReport,
  expectedStart: string,
  expectedWeekEnd: string,
): void => {
  if (prior.schemaVersion !== 1) throw new Error("invalid prior");
  if (prior.reportType !== "jev-routing-depth-audit") {
    throw new Error("invalid prior");
  }
  if (prior.period.weekStart !== expectedStart) {
    throw new Error("prior period mismatch");
  }
  if (prior.period.weekEnd !== expectedWeekEnd) {
    throw new Error("prior period mismatch");
  }
  if (prior.auditor.mixedAuditors) throw new Error("prior mixed auditors");
  if (prior.auditor.recordedModels.length !== 1) {
    throw new Error("prior auditor model not singular");
  }
  validateStratumCounts(prior);
};

const finiteRate = (num: number, den: number): number | undefined => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) {
    return undefined;
  }
  if (num < 0 || num > den) return undefined;
  return num / den;
};

export const buildReport = async (options: {
  auditBase: string;
  weekRoot: string;
  plan: WeeklyPlan;
  caseStates: Array<{
    planCase: PlanCase;
    status: string;
    result?: AuditResultRecord;
    reason?: string;
  }>;
}): Promise<AuditReport> => {
  const { models, promptHashes, mixed } = recordedAuditorSummary(
    options.caseStates,
  );
  const recordedPromptHash = promptHashes.length === 1 ? promptHashes[0]! : "";

  const cases: AuditReport["cases"] = options.caseStates.map(
    ({ planCase, status, result, reason }) => {
      const auditor = result?.auditor;
      const comparison = auditor
        ? buildComparison(
          planCase.effectiveLevel,
          planCase.suggestedLevel,
          auditor,
        )
        : buildComparison(
          planCase.effectiveLevel,
          planCase.suggestedLevel,
          undefined,
        );
      const nonIndependentLabel = result?.independent === false
        ? (result.cachedFromWeek
          ? `cached from week ${result.cachedFromWeek}`
          : "non-independent reuse")
        : undefined;
      return {
        runId: planCase.runId,
        stratum: planCase.stratum,
        patchSha256Short: shortHash(planCase.patchSha256),
        status,
        holdReason: status === "held" ? reason : undefined,
        failureReason: status === "unavailable"
          ? (result?.failureReason ?? reason)
          : undefined,
        source: planCase.source,
        effectiveLevel: planCase.effectiveLevel,
        suggestedLevel: planCase.suggestedLevel,
        confidence: planCase.confidence,
        jevReason: planCase.reason,
        fallbackOrLowConfidence: planCase.source === "fallback" ||
          (planCase.confidence !== undefined && planCase.confidence < 0.8),
        contextImperfect: planCase.contextSha256 !== undefined,
        recordedAuditorModel: result?.resolvedAuditorModel,
        recordedPromptHash: result?.promptHash,
        resultStatus: result?.status,
        auditor,
        comparison,
        independent: result?.independent,
        cachedFromWeek: result?.cachedFromWeek,
        nonIndependentLabel,
      };
    },
  );

  const held = cases.filter((c) => c.status === "held").length;
  const needsPreflight =
    cases.filter((c) => c.status === "needs_preflight").length;
  const approvedPending =
    cases.filter((c) => c.status === "approved_pending").length;
  const unavailable = cases.filter((c) => c.status === "unavailable").length;
  const audited = cases.filter((c) => c.status === "audited").length;
  const cacheHits = cases.filter((c) => c.cachedFromWeek).length;
  const attemptMarkers = await countAttemptMarkersOnDisk(options.weekRoot);
  const completedIndependent = options.caseStates.filter(
    (s) => s.result?.independent === true,
  ).length;
  const attemptedCalls = Math.max(attemptMarkers, completedIndependent);

  const caveats = [
    "本レポートは Jev の深さ選択が「妥当か」を証明しません。独立監査人の許容レンジと effective / suggested の不一致候補を示すだけです。",
    "confidence は Jev が付けた分布の集中度指標であり、正しさの保証ではありません。",
    "too shallow / too deep は候補ラベルであり、正誤や見逃しバグの主張ではありません。",
    "監査入力はパッチのみです。contextSha256 がある履歴はルーティング当時の文脈と完全には比較できません。",
    "週次サンプルは requestedLevel=auto のみで、選択バイアスがあります。",
    "コスト・トークンは未計測です。",
    "過去レビュー済み履歴から自動的に外部送信を許可しません。各パッチは preflight approve が必要です。",
    "グローバルキャッシュ再利用は週次比較の分母から除外されます（cacheSummary 参照）。",
  ];

  const report: AuditReport = {
    schemaVersion: 1,
    reportType: "jev-routing-depth-audit",
    generatedAt: new Date().toISOString(),
    period: {
      weekStart: options.plan.weekStart,
      weekEnd: options.plan.weekEnd,
    },
    auditor: {
      role: defaultAuditorRole(),
      recordedModels: models,
      mixedAuditors: mixed,
      promptHash: recordedPromptHash,
    },
    counts: {
      ...options.plan.counts,
      held,
      needsPreflight,
      approvedPending,
      unavailable,
      audited,
      attemptedCalls,
      cacheHits,
      costUsd: "未計測",
    },
    cases,
    strata: [
      summarizeStratum("random", cases),
      summarizeStratum("risk", cases),
    ],
    cacheSummary: cacheHits > 0
      ? {
        count: cacheHits,
        note:
          "Cached audits are descriptive only and excluded from fresh weekly disagreement rates.",
      }
      : undefined,
    caveats,
  };

  const prevStart = priorWeekStart(options.plan.weekStart);
  const priorRoot = join(options.auditBase, "weeks", prevStart);
  try {
    if (mixed || models.length === 0) {
      report.weekOverWeek = {
        available: false,
        reason: mixed ? "mixed_auditors" : "no_valid_audits",
      };
    } else {
      const priorRaw = await readJsonFile(reportJsonPath(priorRoot));
      const prior = priorRaw as AuditReport;
      validatePriorReport(prior, prevStart, options.plan.weekStart);
      const priorPlan = await readPlan(options.auditBase, prevStart);
      const sameSampling = priorPlan !== undefined &&
        priorPlan.promptVersion === options.plan.promptVersion;
      const sameModel = prior.auditor.recordedModels[0] === models[0];
      const samePrompt = prior.auditor.promptHash !== "" &&
        prior.auditor.promptHash === report.auditor.promptHash;
      if (!sameModel || !samePrompt || !sameSampling) {
        report.weekOverWeek = {
          available: false,
          reason: !sameSampling
            ? "sampling_or_plan_version_changed"
            : "auditor_or_prompt_changed",
        };
      } else {
        const priorRandom = prior.strata.find((s) => s.stratum === "random");
        const nowRandom = report.strata.find((s) => s.stratum === "random");
        const priorEffRate = priorRandom
          ? finiteRate(
            priorRandom.effectiveDisagreement,
            priorRandom.comparableEffective,
          )
          : undefined;
        const nowEffRate = nowRandom
          ? finiteRate(
            nowRandom.effectiveDisagreement,
            nowRandom.comparableEffective,
          )
          : undefined;
        const priorSugRate = priorRandom
          ? finiteRate(
            priorRandom.suggestedDisagreement,
            priorRandom.comparableSuggested,
          )
          : undefined;
        const nowSugRate = nowRandom
          ? finiteRate(
            nowRandom.suggestedDisagreement,
            nowRandom.comparableSuggested,
          )
          : undefined;
        const wow: AuditReport["weekOverWeek"] = { available: false };
        if (
          priorEffRate !== undefined && nowEffRate !== undefined &&
          priorRandom && nowRandom &&
          priorRandom.comparableEffective > 0 &&
          nowRandom.comparableEffective > 0
        ) {
          wow.effectiveDisagreementRateDelta = (nowEffRate - priorEffRate) *
            100;
          wow.available = true;
        }
        if (
          priorSugRate !== undefined && nowSugRate !== undefined &&
          priorRandom && nowRandom &&
          priorRandom.comparableSuggested > 0 &&
          nowRandom.comparableSuggested > 0
        ) {
          wow.suggestedDisagreementRateDelta = (nowSugRate - priorSugRate) *
            100;
          wow.available = wow.available ||
            wow.suggestedDisagreementRateDelta !== undefined;
        }
        if (!wow.available) {
          wow.reason = "insufficient_comparable_cohort";
        }
        report.weekOverWeek = wow;
      }
    }
  } catch {
    report.weekOverWeek = { available: false, reason: "no_prior_week" };
  }

  return report;
};

export const writeReportAtomically = async (
  auditBase: string,
  weekStart: string,
  report: AuditReport,
): Promise<{ jsonPath: string; htmlPath: string }> => {
  const baseReal = await assertRegularDir(auditBase);
  await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", weekStart],
    "week directory",
  );
  const weekRoot = join(baseReal, "weeks", weekStart);
  const jsonTmp = await Deno.makeTempFile({
    dir: weekRoot,
    prefix: ".report-json-",
    suffix: ".tmp",
  });
  const htmlTmp = await Deno.makeTempFile({
    dir: weekRoot,
    prefix: ".report-html-",
    suffix: ".tmp",
  });
  await writeFile(jsonTmp, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  await writeFile(htmlTmp, renderAuditReportHtml(report), { mode: 0o600 });
  const jsonOut = reportJsonPath(weekRoot);
  const htmlOut = reportHtmlPath(weekRoot);
  await rename(jsonTmp, jsonOut);
  await rename(htmlTmp, htmlOut);
  return { jsonPath: jsonOut, htmlPath: htmlOut };
};

export const collectCaseStates = (
  auditBase: string,
  weekStart: string,
  plan: WeeklyPlan,
): Promise<
  Array<{
    planCase: PlanCase;
    status: string;
    result?: AuditResultRecord;
    reason?: string;
  }>
> =>
  Promise.all(
    plan.selected.map((planCase) =>
      deriveCaseState(auditBase, weekStart, planCase)
    ),
  );

export const refreshReportFromDisk = async (
  auditBase: string,
  weekStart: string,
  weekRoot: string,
): Promise<AuditReport> => {
  const plan = await readPlan(auditBase, weekStart);
  if (!plan) throw new Error("plan missing");
  const states = await collectCaseStates(auditBase, weekStart, plan);
  return buildReport({ auditBase, weekRoot, plan, caseStates: states });
};
