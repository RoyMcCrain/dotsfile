import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { auditorPromptFingerprint } from "./auditor_prompt.ts";
import type {
  ApprovalRecord,
  AuditResultRecord,
  PlanCase,
} from "./plan_types.ts";
import {
  assertRegularDir,
  assertSafeRunId,
  publishPrivateFileAtomic,
  readJsonFile,
} from "./state_io.ts";
import { validateAuditResultRecord } from "./validate_state.ts";
import { assertAuditRelativePathSafe } from "./paths.ts";

export const promptHash = (): string =>
  createHash("sha256").update(auditorPromptFingerprint()).digest("hex");

export const cacheKey = (
  patchSha256: string,
  model: string,
): string =>
  createHash("sha256").update(`${patchSha256}\0${model}\0${promptHash()}`)
    .digest("hex");

const globalAttemptsDir = (auditBase: string): string =>
  join(auditBase, "cache", "attempts");

export const readGlobalCache = async (
  auditBase: string,
  key: string,
): Promise<AuditResultRecord | undefined> => {
  const baseReal = await assertRegularDir(auditBase);
  const path = await assertAuditRelativePathSafe(
    baseReal,
    ["cache", `${key}.json`],
    "global cache",
  );
  try {
    const raw = await readJsonFile(path);
    return validateAuditResultRecord(raw);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return undefined;
    }
    if (
      error instanceof Error &&
      error.message === "state path must be a regular file"
    ) {
      return undefined;
    }
    if (error instanceof Error && error.message === "invalid state file") {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("state path")) {
      throw error;
    }
    throw error;
  }
};

export const writeGlobalCache = async (
  auditBase: string,
  key: string,
  record: AuditResultRecord,
): Promise<void> => {
  const baseReal = await assertRegularDir(auditBase);
  await assertAuditRelativePathSafe(baseReal, ["cache"], "cache directory");
  const cacheRoot = join(baseReal, "cache");
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  await Deno.chmod(cacheRoot, 0o700);
  const path = join(cacheRoot, `${key}.json`);
  await publishPrivateFileAtomic(path, `${JSON.stringify(record, null, 2)}\n`, {
    ifExists: "ignore",
  });
};

export const writeGlobalAttemptMarker = async (
  auditBase: string,
  key: string,
  meta: { runId: string; weekStart: string },
): Promise<"created" | "exists"> => {
  assertSafeRunId(meta.runId);
  const baseReal = await assertRegularDir(auditBase);
  await assertAuditRelativePathSafe(
    baseReal,
    ["cache", "attempts"],
    "global attempts",
  );
  const attemptsRoot = globalAttemptsDir(baseReal);
  await mkdir(attemptsRoot, { recursive: true, mode: 0o700 });
  await Deno.chmod(attemptsRoot, 0o700);
  const path = join(attemptsRoot, `${key}.json`);
  const outcome = await publishPrivateFileAtomic(
    path,
    `${
      JSON.stringify({
        key,
        runId: meta.runId,
        weekStart: meta.weekStart,
        at: new Date().toISOString(),
      })
    }\n`,
    { ifExists: "ignore" },
  );
  return outcome;
};

export const readGlobalAttemptMarker = async (
  auditBase: string,
  key: string,
): Promise<boolean> => {
  const baseReal = await assertRegularDir(auditBase);
  const path = await assertAuditRelativePathSafe(
    baseReal,
    ["cache", "attempts", `${key}.json`],
    "global attempt marker",
  );
  try {
    await readJsonFile(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
};

export const readWeekResult = async (
  auditBase: string,
  weekStart: string,
  runId: string,
): Promise<AuditResultRecord | undefined> => {
  assertSafeRunId(runId);
  const baseReal = await assertRegularDir(auditBase);
  const path = await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", weekStart, "results", `${runId}.json`],
    "week result",
  );
  try {
    const raw = await readJsonFile(path);
    return validateAuditResultRecord(raw);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return undefined;
    }
    if (
      error instanceof Error &&
      error.message === "state path must be a regular file"
    ) {
      return undefined;
    }
    throw error;
  }
};

export const writeWeekResult = async (
  auditBase: string,
  weekStart: string,
  record: AuditResultRecord,
): Promise<void> => {
  const baseReal = await assertRegularDir(auditBase);
  await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", weekStart, "results"],
    "results directory",
  );
  const resultsPath = join(baseReal, "weeks", weekStart, "results");
  await mkdir(resultsPath, { recursive: true, mode: 0o700 });
  await Deno.chmod(resultsPath, 0o700);
  const path = join(resultsPath, `${record.runId}.json`);
  await publishPrivateFileAtomic(path, `${JSON.stringify(record, null, 2)}\n`, {
    ifExists: "fail",
  });
};

export const writeAttemptMarker = async (
  auditBase: string,
  weekStart: string,
  runId: string,
): Promise<"created" | "exists"> => {
  assertSafeRunId(runId);
  const baseReal = await assertRegularDir(auditBase);
  await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", weekStart, "results"],
    "results directory",
  );
  const resultsPath = join(baseReal, "weeks", weekStart, "results");
  await mkdir(resultsPath, { recursive: true, mode: 0o700 });
  const path = join(resultsPath, `${runId}.attempt.json`);
  const outcome = await publishPrivateFileAtomic(
    path,
    `${JSON.stringify({ runId, at: new Date().toISOString() })}\n`,
    { ifExists: "ignore" },
  );
  return outcome;
};

export const hasAttemptMarker = async (
  auditBase: string,
  weekStart: string,
  runId: string,
): Promise<boolean> => {
  const baseReal = await assertRegularDir(auditBase);
  const path = await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", weekStart, "results", `${runId}.attempt.json`],
    "attempt marker",
  );
  try {
    await readJsonFile(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return false;
    }
    if (error instanceof Error && error.message.includes("must not be")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("missing path")) {
      return false;
    }
    throw error;
  }
};

export const assertResultIdentity = (
  record: AuditResultRecord,
  expected: {
    runId: string;
    weekStart: string;
    patchSha256: string;
    resolvedAuditorModel: string;
    promptHash: string;
  },
): void => {
  if (
    record.runId !== expected.runId ||
    record.weekStart !== expected.weekStart ||
    record.patchSha256 !== expected.patchSha256 ||
    record.resolvedAuditorModel !== expected.resolvedAuditorModel ||
    record.promptHash !== expected.promptHash
  ) {
    throw new Error("result identity mismatch");
  }
};

export const assertCachedResultIdentity = (
  record: AuditResultRecord,
  planCase: PlanCase,
  approval: ApprovalRecord,
  weekStart: string,
): void => {
  if (
    record.runId !== planCase.runId ||
    record.weekStart !== weekStart ||
    record.patchSha256 !== planCase.patchSha256 ||
    record.resolvedAuditorModel !== approval.resolvedAuditorModel ||
    record.promptHash !== approval.promptHash
  ) {
    throw new Error("cached result identity mismatch");
  }
};

export const isUnavailableResult = (record: AuditResultRecord): boolean =>
  record.status === "failure" ||
  (record.status === "cached" && record.failureReason !== undefined);
