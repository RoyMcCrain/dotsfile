import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertAuditRelativePathSafe, assertInsideBaseLstat } from "./paths.ts";
import type { ApprovalRecord, PlanCase } from "./plan_types.ts";
import {
  readPatchFromRun,
  sha256Bytes,
  validatePatchFileLocal,
} from "./patch_io.ts";
import { AUDITOR_PROMPT_VERSION } from "./auditor_prompt.ts";
import {
  assertAuditorIndependent,
  defaultAuditorRole,
  resolveModelRole,
} from "./model_resolve.ts";
import {
  indexRunDirs,
  locateRunDir,
  metadataPatchSha256Matches,
} from "./locate_run.ts";
import {
  assertRegularDir,
  assertSafeRunId,
  isMissingPath,
  publishPrivateFileAtomic,
  readJsonFile,
} from "./state_io.ts";
import { validateApprovalRecord } from "./validate_state.ts";
import { promptHash } from "./result_store.ts";
import { approvalsDir } from "./paths.ts";

const approvalPath = (dir: string, runId: string): string =>
  join(dir, `${runId}.json`);

export const readApproval = async (
  approvalsRoot: string,
  runId: string,
): Promise<ApprovalRecord | undefined> => {
  assertSafeRunId(runId);
  try {
    await assertRegularDir(approvalsRoot);
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
  try {
    const raw = await readJsonFile(approvalPath(approvalsRoot, runId));
    return validateApprovalRecord(raw);
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
};

export const approvalMatchesPlan = (
  approval: ApprovalRecord,
  planCase: PlanCase,
  weekStart: string,
): boolean =>
  approval.runId === planCase.runId &&
  approval.weekStart === weekStart &&
  approval.patchSha256 === planCase.patchSha256 &&
  approval.approvedInputSha256 === planCase.patchSha256;

export const readPlanCaseApproval = async (
  auditBase: string,
  weekStart: string,
  runId: string,
): Promise<
  | { ok: true; approval: ApprovalRecord }
  | { ok: false; reason: "missing" | "invalid_approval_state" }
> => {
  try {
    const approval = await readApproval(
      approvalsDir(join(auditBase, "weeks", weekStart)),
      runId,
    );
    if (!approval) return { ok: false, reason: "missing" };
    return { ok: true, approval };
  } catch {
    return { ok: false, reason: "invalid_approval_state" };
  }
};

export const approveCase = async (options: {
  auditBase: string;
  weekRoot: string;
  weekStart: string;
  runId: string;
  patchSha256: string;
  approvedInputPath: string;
  runsDir?: string;
  jevModel?: string;
}): Promise<ApprovalRecord> => {
  assertSafeRunId(options.runId);
  const baseReal = await assertRegularDir(options.auditBase);
  const approvalsRoot = await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", options.weekStart, "approvals"],
    "approvals directory",
  );
  const inputReal = await assertInsideBaseLstat(
    options.auditBase,
    options.approvedInputPath,
    "approved input",
  );
  const inputStat = await Deno.lstat(inputReal);
  if (!inputStat.isFile) {
    throw new Error("approved input must be a regular file");
  }
  const inputBytes = await readFile(inputReal);
  const approvedInputSha256 = sha256Bytes(inputBytes);
  if (approvedInputSha256 !== options.patchSha256) {
    throw new Error("approved input hash does not match plan patch hash");
  }
  await validatePatchFileLocal(inputReal);

  const index = await indexRunDirs(options.runsDir);
  const runDir = locateRunDir(index, options.runId);
  if (!runDir) throw new Error("run not found");
  if (
    !(await metadataPatchSha256Matches(runDir, options.patchSha256))
  ) {
    throw new Error("run metadata patch does not match plan");
  }
  await readPatchFromRun(runDir, options.patchSha256);

  const resolvedAuditorModel = await resolveModelRole(defaultAuditorRole());
  await assertAuditorIndependent(
    resolvedAuditorModel,
    options.jevModel,
  );

  const currentPromptHash = promptHash();
  const record: ApprovalRecord = {
    schemaVersion: 1,
    weekStart: options.weekStart,
    runId: options.runId,
    patchSha256: options.patchSha256,
    resolvedAuditorModel,
    approvedAt: new Date().toISOString(),
    approvedInputSha256,
    promptVersion: AUDITOR_PROMPT_VERSION,
    promptHash: currentPromptHash,
  };

  await Deno.mkdir(approvalsRoot, { recursive: true, mode: 0o700 });
  await Deno.chmod(approvalsRoot, 0o700);
  const path = approvalPath(approvalsRoot, options.runId);
  await publishPrivateFileAtomic(
    path,
    `${JSON.stringify(record, null, 2)}\n`,
    { ifExists: "fail" },
  );
  return record;
};
