import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  approvalsDir as approvalsDirPath,
  assertInsideBaseLstat,
} from "./paths.ts";
import type { ApprovalRecord } from "./plan_types.ts";
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
import { assertRegularDir, assertSafeRunId, readJsonFile } from "./state_io.ts";
import { validateApprovalRecord } from "./validate_state.ts";
import { promptHash } from "./result_store.ts";
const approvalPath = (dir: string, runId: string): string =>
  join(dir, `${runId}.json`);

export const readApproval = async (
  approvalsRoot: string,
  runId: string,
): Promise<ApprovalRecord | undefined> => {
  assertSafeRunId(runId);
  try {
    await assertRegularDir(approvalsRoot);
  } catch {
    return undefined;
  }
  try {
    const raw = await readJsonFile(approvalPath(approvalsRoot, runId));
    return validateApprovalRecord(raw);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
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

  const approvalsRoot = approvalsDirPath(options.weekRoot);
  await Deno.mkdir(approvalsRoot, { recursive: true, mode: 0o700 });
  const path = approvalPath(approvalsRoot, options.runId);
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return record;
};
