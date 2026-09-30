import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { genericPatchFileName, loadCheckedPatch } from "./patch_io.ts";
import {
  indexRunDirs,
  locateRunDir,
  metadataPatchSha256Matches,
} from "./locate_run.ts";
import type { AuditResultRecord, PlanCase } from "./plan_types.ts";
import { approvalMatchesPlan, readPlanCaseApproval } from "./approval_store.ts";
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
  writeAttemptMarker,
  writeGlobalAttemptMarker,
  writeGlobalCache,
  writeWeekResult,
} from "./result_store.ts";
import {
  assertAuditorIndependent,
  defaultAuditorRole,
  resolveModelRole,
} from "./model_resolve.ts";
import { parseAuditorResponse } from "./parse_auditor_json.ts";
import {
  AUDITOR_TIMEOUT_SECONDS,
  invokeRunner,
  prepareIsolatedRun,
} from "./runner_invoke.ts";

export type CaseRunState =
  | { status: "needs_preflight" }
  | { status: "approved_pending" }
  | { status: "held"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "audited"; result: AuditResultRecord };

const identityExpected = (
  planCase: PlanCase,
  weekStart: string,
  approval: {
    resolvedAuditorModel: string;
    promptHash: string;
  },
) => ({
  runId: planCase.runId,
  weekStart,
  patchSha256: planCase.patchSha256,
  resolvedAuditorModel: approval.resolvedAuditorModel,
  promptHash: approval.promptHash,
});

const auditorPayloadEqual = (
  a: AuditResultRecord["auditor"],
  b: AuditResultRecord["auditor"],
): boolean => {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.minLevel === b.minLevel &&
    a.maxLevel === b.maxLevel &&
    a.reason === b.reason &&
    JSON.stringify(a.concerns) === JSON.stringify(b.concerns)
  );
};

const globalCacheMatchesRecord = (
  cached: AuditResultRecord,
  record: AuditResultRecord,
): boolean =>
  cached.patchSha256 === record.patchSha256 &&
  cached.resolvedAuditorModel === record.resolvedAuditorModel &&
  cached.promptHash === record.promptHash &&
  cached.status === record.status &&
  cached.runId === record.runId &&
  cached.weekStart === record.weekStart &&
  cached.attemptedAt === record.attemptedAt &&
  cached.independent === record.independent &&
  (cached.status !== "failure" ||
    cached.failureReason === record.failureReason) &&
  (cached.status !== "success" ||
    auditorPayloadEqual(cached.auditor, record.auditor));

const reconstructGlobalCacheIfMissing = async (
  auditBase: string,
  key: string,
  record: AuditResultRecord,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  if (record.independent !== true) return { ok: true };
  if (record.status !== "success" && record.status !== "failure") {
    return { ok: true };
  }
  let existing: AuditResultRecord | undefined;
  try {
    existing = await readGlobalCache(auditBase, key);
  } catch {
    return { ok: false, reason: "global_cache_unreadable" };
  }
  if (existing) {
    if (!globalCacheMatchesRecord(existing, record)) {
      return { ok: false, reason: "global_cache_conflict" };
    }
    return { ok: true };
  }
  try {
    await writeGlobalCache(auditBase, key, record);
  } catch {
    return { ok: false, reason: "global_cache_write_failed" };
  }
  return { ok: true };
};

export const runSingleCase = async (options: {
  auditBase: string;
  weekRoot: string;
  weekStart: string;
  planCase: PlanCase;
  runsDir?: string;
  resolvedAuditorModel?: string;
}): Promise<CaseRunState> => {
  const approvalRead = await readPlanCaseApproval(
    options.auditBase,
    options.weekStart,
    options.planCase.runId,
  );
  if (
    approvalRead.ok === false &&
    approvalRead.reason === "invalid_approval_state"
  ) {
    return { status: "unavailable", reason: "invalid_approval_state" };
  }
  const approval = approvalRead.ok ? approvalRead.approval : undefined;

  if (!approval) return { status: "needs_preflight" };
  if (!approvalMatchesPlan(approval, options.planCase, options.weekStart)) {
    return { status: "held", reason: "approval_mismatch" };
  }
  if (approval.promptHash !== promptHash()) {
    return { status: "held", reason: "prompt_changed" };
  }

  let existingWeek: AuditResultRecord | undefined;
  try {
    existingWeek = await readWeekResult(
      options.auditBase,
      options.weekStart,
      options.planCase.runId,
    );
  } catch {
    return { status: "unavailable", reason: "invalid_stored_result" };
  }
  if (existingWeek) {
    try {
      if (existingWeek.status === "cached") {
        assertCachedResultIdentity(
          existingWeek,
          options.planCase,
          approval,
          options.weekStart,
        );
      } else {
        assertResultIdentity(
          existingWeek,
          identityExpected(options.planCase, options.weekStart, approval),
        );
      }
    } catch {
      return { status: "unavailable", reason: "invalid_stored_result" };
    }
    const key = cacheKey(
      options.planCase.patchSha256,
      approval.resolvedAuditorModel,
    );
    const cacheRepair = await reconstructGlobalCacheIfMissing(
      options.auditBase,
      key,
      existingWeek,
    );
    if (!cacheRepair.ok) {
      return { status: "unavailable", reason: cacheRepair.reason };
    }
    if (isUnavailableResult(existingWeek)) {
      return {
        status: "unavailable",
        reason: existingWeek.failureReason ?? "cached_failure",
      };
    }
    return { status: "audited", result: existingWeek };
  }
  if (
    await hasAttemptMarker(
      options.auditBase,
      options.weekStart,
      options.planCase.runId,
    )
  ) {
    return { status: "unavailable", reason: "prior_attempt_incomplete" };
  }

  let resolvedNow = options.resolvedAuditorModel;
  if (!resolvedNow) {
    try {
      resolvedNow = await resolveModelRole(defaultAuditorRole());
    } catch {
      return { status: "held", reason: "model_resolution_failed" };
    }
  }
  if (approval.resolvedAuditorModel !== resolvedNow) {
    return { status: "held", reason: "auditor_model_changed" };
  }

  const currentPromptHash = promptHash();
  const key = cacheKey(options.planCase.patchSha256, resolvedNow);
  const cached = await readGlobalCache(options.auditBase, key);
  if (
    cached &&
    cached.patchSha256 === options.planCase.patchSha256 &&
    cached.resolvedAuditorModel === resolvedNow &&
    cached.promptHash === currentPromptHash
  ) {
    if (cached.status === "failure") {
      const record: AuditResultRecord = {
        ...cached,
        runId: options.planCase.runId,
        weekStart: options.weekStart,
        status: "cached",
        independent: false,
        cachedFromWeek: cached.weekStart,
      };
      await writeWeekResult(options.auditBase, options.weekStart, record);
      return {
        status: "unavailable",
        reason: cached.failureReason ?? "cached_failure",
      };
    }
    if (cached.status === "success" && cached.auditor) {
      const record: AuditResultRecord = {
        ...cached,
        runId: options.planCase.runId,
        weekStart: options.weekStart,
        status: "cached",
        independent: false,
        cachedFromWeek: cached.weekStart,
      };
      await writeWeekResult(options.auditBase, options.weekStart, record);
      return { status: "audited", result: record };
    }
  }

  if (await readGlobalAttemptMarker(options.auditBase, key)) {
    return { status: "unavailable", reason: "global_attempt_incomplete" };
  }

  const index = await indexRunDirs(options.runsDir);
  const runDir = locateRunDir(index, options.planCase.runId);
  if (!runDir) {
    return { status: "unavailable", reason: "run_not_found" };
  }
  if (
    !(await metadataPatchSha256Matches(
      runDir,
      options.planCase.patchSha256,
    ))
  ) {
    return { status: "unavailable", reason: "metadata_patch_mismatch" };
  }

  let stagedPath: string;
  try {
    ({ stagedPath } = await loadCheckedPatch({
      runDir,
      expectedSha256: options.planCase.patchSha256,
      auditBase: options.auditBase,
      weekStart: options.weekStart,
      runId: options.planCase.runId,
    }));
  } catch {
    return { status: "unavailable", reason: "patch_validation_failed" };
  }

  try {
    await assertAuditorIndependent(
      resolvedNow,
      options.planCase.jevModel,
    );
  } catch {
    return { status: "held", reason: "auditor_not_independent" };
  }

  let cwd: string;
  let promptPath: string;
  let inputInCwd: string;
  let cleanup: (() => Promise<void>) | undefined;
  try {
    ({ cwd, promptPath, cleanup } = await prepareIsolatedRun());
    inputInCwd = join(cwd, genericPatchFileName());
    await copyFile(stagedPath, inputInCwd);
    await Deno.chmod(inputInCwd, 0o600);
  } catch {
    if (cleanup) await cleanup();
    return { status: "unavailable", reason: "run_preparation_failed" };
  }

  try {
    const globalAttempt = await writeGlobalAttemptMarker(
      options.auditBase,
      key,
      { runId: options.planCase.runId, weekStart: options.weekStart },
    );
    if (globalAttempt === "exists") {
      return { status: "unavailable", reason: "global_attempt_in_progress" };
    }

    const weekAttempt = await writeAttemptMarker(
      options.auditBase,
      options.weekStart,
      options.planCase.runId,
    );
    if (weekAttempt === "exists") {
      return { status: "unavailable", reason: "prior_attempt_incomplete" };
    }

    const outcome = await invokeRunner({
      model: resolvedNow,
      promptPath,
      inputPath: inputInCwd,
      cwd,
      timeoutSeconds: AUDITOR_TIMEOUT_SECONDS,
    });
    if (!outcome.ok) {
      const failure: AuditResultRecord = {
        schemaVersion: 1,
        runId: options.planCase.runId,
        weekStart: options.weekStart,
        patchSha256: options.planCase.patchSha256,
        resolvedAuditorModel: resolvedNow,
        promptHash: currentPromptHash,
        status: "failure",
        independent: true,
        failureReason: outcome.reason,
        attemptedAt: new Date().toISOString(),
      };
      await writeWeekResult(options.auditBase, options.weekStart, failure);
      await writeGlobalCache(options.auditBase, key, failure);
      return { status: "unavailable", reason: outcome.reason };
    }
    let auditor;
    try {
      auditor = parseAuditorResponse(outcome.stdout);
    } catch {
      const failure: AuditResultRecord = {
        schemaVersion: 1,
        runId: options.planCase.runId,
        weekStart: options.weekStart,
        patchSha256: options.planCase.patchSha256,
        resolvedAuditorModel: resolvedNow,
        promptHash: currentPromptHash,
        status: "failure",
        independent: true,
        failureReason: "invalid_auditor_json",
        attemptedAt: new Date().toISOString(),
      };
      await writeWeekResult(options.auditBase, options.weekStart, failure);
      await writeGlobalCache(options.auditBase, key, failure);
      return { status: "unavailable", reason: "invalid_auditor_json" };
    }
    const success: AuditResultRecord = {
      schemaVersion: 1,
      runId: options.planCase.runId,
      weekStart: options.weekStart,
      patchSha256: options.planCase.patchSha256,
      resolvedAuditorModel: resolvedNow,
      promptHash: currentPromptHash,
      status: "success",
      independent: true,
      auditor,
      attemptedAt: new Date().toISOString(),
    };
    await writeWeekResult(options.auditBase, options.weekStart, success);
    await writeGlobalCache(options.auditBase, key, success);
    return { status: "audited", result: success };
  } finally {
    if (cleanup) await cleanup();
  }
};

export const stageCaseForInspect = async (options: {
  auditBase: string;
  weekStart: string;
  planCase: PlanCase;
  runsDir?: string;
}): Promise<
  { stagedPath: string; patchSha256: string } | { error: string }
> => {
  const index = await indexRunDirs(options.runsDir);
  const runDir = locateRunDir(index, options.planCase.runId);
  if (!runDir) return { error: "run_not_found" };
  try {
    const { stagedPath, sha256 } = await loadCheckedPatch({
      runDir,
      expectedSha256: options.planCase.patchSha256,
      auditBase: options.auditBase,
      weekStart: options.weekStart,
      runId: options.planCase.runId,
    });
    return { stagedPath, patchSha256: sha256 };
  } catch {
    return { error: "patch_unavailable" };
  }
};
