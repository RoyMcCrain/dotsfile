import { createHash, randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  readdir,
  readFile,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const SCHEMA_VERSION = 1;
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const ACTOR_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/:-]{0,127}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const EXECUTION_STATUSES = new Set(["pending", "running", "completed"]);
const BACKENDS = new Set(["pi", "agy"]);
const VERDICTS = new Set([
  "findings",
  "no_findings",
  "unparsed",
  "unavailable",
]);
const DECISIONS = new Set(["accepted", "rejected", "deferred", "pending"]);
const SEVERITIES = new Set(["high", "medium", "low"]);
const VERIFICATIONS = new Set([
  "confirmed",
  "contradicted",
  "inconclusive",
  "not_checked",
]);
const ACTIONS = new Set(["fixed", "not_fixed", "unknown"]);
const ACTOR_KINDS = new Set(["agent", "human"]);

const IMMUTABLE_FINDING_FIELDS = [
  "issueKey",
  "severity",
  "location",
  "original",
] as const;

const EXEC_IDENTITY_FIELDS = [
  "backend",
  "model",
  "chunk",
  "timeout",
  "retryTimeout",
  "maxAttempts",
  "startedAt",
  "stdoutLog",
  "stderrLog",
] as const;

type ExecutionStatus = "pending" | "running" | "completed";

type ExecutionRecord = {
  id: string;
  backend: string;
  model: string;
  chunk: string;
  timeout: number;
  retryTimeout: number;
  maxAttempts: number;
  status: ExecutionStatus;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  stdoutLog: string;
  stderrLog: string;
};

type FindingDecision = "accepted" | "rejected" | "deferred" | "pending";
type FindingVerification =
  | "confirmed"
  | "contradicted"
  | "inconclusive"
  | "not_checked";
type FindingAction = "fixed" | "not_fixed" | "unknown";

type AssessmentFinding = {
  id: string;
  issueKey: string;
  severity: "high" | "medium" | "low";
  location: string;
  original: string;
  decision: FindingDecision;
  reason?: string;
  verification?: FindingVerification;
  evidence?: string;
  action?: FindingAction;
  actionEvidence?: string;
};

type AssessmentVerdict =
  | "findings"
  | "no_findings"
  | "unparsed"
  | "unavailable";

type AssessmentReview = {
  executionId: string;
  verdict: AssessmentVerdict;
  findings: AssessmentFinding[];
};

type Assessment = {
  actor: { kind: "agent" | "human"; id: string };
  reviews: AssessmentReview[];
};

type FileHashRef = { path: string; sha256: string };

type ExecutionSnapshot = ExecutionRecord & {
  files: {
    chunk: FileHashRef;
    stdoutLog: FileHashRef;
    stderrLog: FileHashRef;
  };
};

type Snapshot = {
  schemaVersion: number;
  runId: string;
  savedAt: string;
  actor: Assessment["actor"];
  metadata: Record<string, unknown>;
  files: { patch: FileHashRef; prompt: FileHashRef };
  executions: ExecutionSnapshot[];
  reviews: AssessmentReview[];
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isMissingDir = (error: unknown): boolean => {
  if (error instanceof Deno.errors.NotFound) return true;
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT";
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseLevel = (value: unknown): 1 | 2 | 3 => {
  if (value === 1 || value === 2 || value === 3) return value;
  if (value === "1" || value === "2" || value === "3") {
    return Number(value) as 1 | 2 | 3;
  }
  throw new Error("level must be 1, 2, or 3");
};

const validateId = (value: unknown, label: string): string => {
  if (!isNonEmptyString(value) || !ID_RE.test(value)) {
    throw new Error(`${label} must be a safe id`);
  }
  return value;
};

const validateActorId = (value: unknown, label: string): string => {
  if (!isNonEmptyString(value) || !ACTOR_ID_RE.test(value)) {
    throw new Error(`${label} must be a safe actor id`);
  }
  return value;
};

const validateEnum = (
  value: unknown,
  allowed: Set<string>,
  label: string,
): string => {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
};

const validateIsoDate = (value: unknown, label: string): string => {
  if (!isNonEmptyString(value) || !ISO_UTC_RE.test(value)) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp`);
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp`);
  }
  return value;
};

const validatePositiveFinite = (value: unknown, label: string): number => {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
  return value;
};

const validatePositiveInt = (value: unknown, label: string): number => {
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
};

const validateExitCode = (value: unknown, label: string): number => {
  if (
    !isFiniteNumber(value) || !Number.isInteger(value) || value < 0 ||
    value > 255
  ) {
    throw new Error(`${label} must be an integer from 0 to 255`);
  }
  return value;
};

const validateRunRelativePath = (value: unknown, label: string): string => {
  if (!isNonEmptyString(value)) throw new Error(`${label} is required`);
  if (value.startsWith("/") || value.startsWith("\\")) {
    throw new Error(`${label} must be run-relative`);
  }
  const normalized = value.split(/\\/g).join("/");
  if (
    normalized === ".." || normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`${label} must be run-relative`);
  }
  return normalized;
};

const validateMetadata = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new Error("metadata must be an object");
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("unsupported metadata schemaVersion");
  }
  validateId(value.runId, "metadata.runId");
  validateIsoDate(value.createdAt, "metadata.createdAt");
  if (!isNonEmptyString(value.repository)) {
    throw new Error("metadata.repository is required");
  }
  if (!isNonEmptyString(value.revision)) {
    throw new Error("metadata.revision is required");
  }
  parseLevel(value.level);
  return value;
};

const validateExecutionRecord = (value: unknown): ExecutionRecord => {
  if (!isObject(value)) throw new Error("execution must be an object");
  const id = validateId(value.id, "execution.id");
  const backend = validateEnum(value.backend, BACKENDS, "execution.backend");
  if (!isNonEmptyString(value.model)) {
    throw new Error("execution.model is required");
  }
  const chunk = validateRunRelativePath(value.chunk, "execution.chunk");
  const timeout = validatePositiveFinite(value.timeout, "execution.timeout");
  const retryTimeout = validatePositiveFinite(
    value.retryTimeout,
    "execution.retryTimeout",
  );
  const maxAttempts = validatePositiveInt(
    value.maxAttempts,
    "execution.maxAttempts",
  );
  const status = validateEnum(
    value.status,
    EXECUTION_STATUSES,
    "execution.status",
  ) as ExecutionStatus;
  const startedAt = validateIsoDate(value.startedAt, "execution.startedAt");
  const stdoutLog = validateRunRelativePath(
    value.stdoutLog,
    "execution.stdoutLog",
  );
  const stderrLog = validateRunRelativePath(
    value.stderrLog,
    "execution.stderrLog",
  );

  const hasEndedAt = value.endedAt !== undefined && value.endedAt !== null;
  const hasExitCode = value.exitCode !== undefined && value.exitCode !== null;

  if (status === "completed") {
    if (!hasEndedAt || !hasExitCode) {
      throw new Error(
        `execution ${id} completed requires endedAt and exitCode`,
      );
    }
    const endedAt = validateIsoDate(value.endedAt, "execution.endedAt");
    validateExitCode(value.exitCode, "execution.exitCode");
    if (Date.parse(endedAt) < Date.parse(startedAt)) {
      throw new Error(`execution ${id} endedAt must be >= startedAt`);
    }
  } else if (hasEndedAt || hasExitCode) {
    throw new Error(
      `execution ${id} ${status} must not include endedAt or exitCode`,
    );
  }

  const record: ExecutionRecord = {
    id,
    backend,
    model: value.model,
    chunk,
    timeout,
    retryTimeout,
    maxAttempts,
    status,
    startedAt,
    stdoutLog,
    stderrLog,
  };
  if (status === "completed") {
    record.endedAt = value.endedAt as string;
    record.exitCode = validateExitCode(value.exitCode, "execution.exitCode");
  }
  return record;
};

const validateFinding = (
  value: unknown,
  executionId: string,
  seenIds: Set<string>,
): AssessmentFinding => {
  if (!isObject(value)) {
    throw new Error(`finding must be an object for ${executionId}`);
  }
  const id = validateId(value.id, `finding id for ${executionId}`);
  if (seenIds.has(id)) {
    throw new Error(`duplicate finding id within ${executionId}: ${id}`);
  }
  seenIds.add(id);

  const issueKey = validateId(value.issueKey, `${executionId}/${id}.issueKey`);
  const severity = validateEnum(
    value.severity,
    SEVERITIES,
    `${executionId}/${id}.severity`,
  ) as AssessmentFinding["severity"];
  if (!isNonEmptyString(value.location)) {
    throw new Error(`location is required for ${executionId}/${id}`);
  }
  if (!isNonEmptyString(value.original)) {
    throw new Error(`original is required for ${executionId}/${id}`);
  }
  const decision = validateEnum(
    value.decision,
    DECISIONS,
    `${executionId}/${id}.decision`,
  ) as FindingDecision;

  const finding: AssessmentFinding = {
    id,
    issueKey,
    severity,
    location: value.location,
    original: value.original,
    decision,
  };

  if (decision !== "pending" && !isNonEmptyString(value.reason)) {
    throw new Error(`reason is required for ${executionId}/${id}`);
  }
  if (isNonEmptyString(value.reason)) finding.reason = value.reason;

  if (value.verification !== undefined && value.verification !== null) {
    finding.verification = validateEnum(
      value.verification,
      VERIFICATIONS,
      `${executionId}/${id}.verification`,
    ) as FindingVerification;
  }
  if (value.evidence !== undefined && value.evidence !== null) {
    if (!isNonEmptyString(value.evidence)) {
      throw new Error(`evidence must be non-empty for ${executionId}/${id}`);
    }
    finding.evidence = value.evidence;
  }
  if (
    (finding.verification === "confirmed" ||
      finding.verification === "contradicted") &&
    !isNonEmptyString(finding.evidence)
  ) {
    throw new Error(`evidence is required for ${executionId}/${id}`);
  }

  if (value.action !== undefined && value.action !== null) {
    finding.action = validateEnum(
      value.action,
      ACTIONS,
      `${executionId}/${id}.action`,
    ) as FindingAction;
  }
  if (value.actionEvidence !== undefined && value.actionEvidence !== null) {
    if (!isNonEmptyString(value.actionEvidence)) {
      throw new Error(
        `actionEvidence must be non-empty for ${executionId}/${id}`,
      );
    }
    finding.actionEvidence = value.actionEvidence;
  }
  if (finding.action === "fixed" && !isNonEmptyString(finding.actionEvidence)) {
    throw new Error(`actionEvidence is required for ${executionId}/${id}`);
  }

  return finding;
};

const validateReview = (
  value: unknown,
  executionById: Map<string, ExecutionRecord>,
  seenReviews: Set<string>,
): AssessmentReview => {
  if (!isObject(value)) throw new Error("review must be an object");
  const executionId = validateId(value.executionId, "review.executionId");
  if (seenReviews.has(executionId)) {
    throw new Error(`duplicate execution review: ${executionId}`);
  }
  seenReviews.add(executionId);

  const execution = executionById.get(executionId);
  if (!execution) {
    throw new Error(`unknown execution review: ${executionId}`);
  }

  const verdict = validateEnum(
    value.verdict,
    VERDICTS,
    `review.verdict for ${executionId}`,
  ) as AssessmentVerdict;
  if (!Array.isArray(value.findings)) {
    throw new Error(`review findings must be an array for ${executionId}`);
  }

  const failed = isTerminalFailure(execution);
  if (failed && verdict !== "unavailable") {
    throw new Error(
      `execution ${executionId} requires verdict unavailable (status=${execution.status}, exitCode=${
        execution.exitCode ?? "missing"
      })`,
    );
  }
  if (!failed && verdict === "unavailable") {
    throw new Error(
      `execution ${executionId} completed successfully; unavailable is invalid`,
    );
  }
  if (
    (verdict === "no_findings" || verdict === "findings") &&
    execution.exitCode !== 0
  ) {
    throw new Error(
      `execution ${executionId} exitCode must be 0 for verdict ${verdict}`,
    );
  }
  if (verdict === "findings" && value.findings.length === 0) {
    throw new Error(
      `findings verdict requires at least one finding: ${executionId}`,
    );
  }
  if (verdict !== "findings" && value.findings.length > 0) {
    throw new Error(
      `findings must be empty for verdict ${verdict}: ${executionId}`,
    );
  }

  const seenFindingIds = new Set<string>();
  const findings = value.findings.map((finding) =>
    validateFinding(finding, executionId, seenFindingIds)
  );

  return { executionId, verdict, findings };
};

const validateAssessment = (
  value: unknown,
  executionById: Map<string, ExecutionRecord>,
): Assessment => {
  if (!isObject(value)) throw new Error("assessment must be an object");
  if (!isObject(value.actor)) throw new Error("assessment.actor is required");
  const kind = validateEnum(
    value.actor.kind,
    ACTOR_KINDS,
    "assessment.actor.kind",
  ) as Assessment["actor"]["kind"];
  const actorId = validateActorId(value.actor.id, "assessment.actor.id");
  if (!Array.isArray(value.reviews)) {
    throw new Error("assessment.reviews must be an array");
  }

  const seenReviews = new Set<string>();
  const reviews = value.reviews.map((review) =>
    validateReview(review, executionById, seenReviews)
  );

  for (const execution of executionById.values()) {
    if (!seenReviews.has(execution.id)) {
      throw new Error(`missing execution review: ${execution.id}`);
    }
  }

  return { actor: { kind, id: actorId }, reviews };
};

const validateFileHashRef = (
  value: unknown,
  label: string,
): FileHashRef => {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  validateRunRelativePath(value.path, `${label}.path`);
  if (
    !isNonEmptyString(value.sha256) || !/^[a-f0-9]{64}$/.test(value.sha256)
  ) {
    throw new Error(`${label}.sha256 is invalid`);
  }
  return { path: value.path as string, sha256: value.sha256 };
};

const validateExecutionSnapshot = (value: unknown): ExecutionSnapshot => {
  const record = validateExecutionRecord(value);
  if (!isObject(value) || !isObject(value.files)) {
    throw new Error(`execution ${record.id} files must be an object`);
  }
  return {
    ...record,
    files: {
      chunk: validateFileHashRef(value.files.chunk, `${record.id}.files.chunk`),
      stdoutLog: validateFileHashRef(
        value.files.stdoutLog,
        `${record.id}.files.stdoutLog`,
      ),
      stderrLog: validateFileHashRef(
        value.files.stderrLog,
        `${record.id}.files.stderrLog`,
      ),
    },
  };
};

export const validateSnapshot = (value: unknown): Snapshot => {
  if (!isObject(value)) throw new Error("snapshot must be an object");
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("unsupported snapshot schemaVersion");
  }
  const runId = validateId(value.runId, "snapshot.runId");
  validateIsoDate(value.savedAt, "snapshot.savedAt");
  if (!isObject(value.actor)) throw new Error("snapshot.actor is required");
  validateEnum(value.actor.kind, ACTOR_KINDS, "snapshot.actor.kind");
  validateActorId(value.actor.id, "snapshot.actor.id");
  const metadata = validateMetadata(value.metadata);
  if (runId !== metadata.runId) {
    throw new Error("snapshot.runId must match metadata.runId");
  }
  if (!isObject(value.files)) throw new Error("snapshot.files is required");
  const patch = validateFileHashRef(value.files.patch, "snapshot.files.patch");
  const prompt = validateFileHashRef(
    value.files.prompt,
    "snapshot.files.prompt",
  );
  if (!Array.isArray(value.executions)) {
    throw new Error("snapshot.executions must be an array");
  }
  if (!Array.isArray(value.reviews)) {
    throw new Error("snapshot.reviews must be an array");
  }
  const executions = value.executions.map(validateExecutionSnapshot);
  if (executions.length === 0) {
    throw new Error("snapshot.executions must not be empty");
  }
  const executionIds = executions.map((execution) => execution.id);
  if (new Set(executionIds).size !== executionIds.length) {
    throw new Error("duplicate execution ids in snapshot");
  }
  const executionById = new Map(executions.map((e) => [e.id, e]));
  const seenReviews = new Set<string>();
  const reviews = value.reviews.map((review) =>
    validateReview(review, executionById, seenReviews)
  );
  for (const execution of executionById.values()) {
    if (!seenReviews.has(execution.id)) {
      throw new Error(`missing execution review: ${execution.id}`);
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    runId,
    savedAt: value.savedAt as string,
    actor: {
      kind: value.actor.kind as Assessment["actor"]["kind"],
      id: value.actor.id as string,
    },
    metadata,
    files: { patch, prompt },
    executions,
    reviews,
  };
};

export const getRunsBaseDir = (): string => {
  const home = Deno.env.get("HOME");
  if (!isNonEmptyString(home)) throw new Error("HOME is required");
  const homeAbs = resolve(home);
  const xdg = Deno.env.get("XDG_DATA_HOME");
  const dataHome = isNonEmptyString(xdg)
    ? (() => {
      if (!isAbsolute(xdg)) {
        throw new Error("XDG_DATA_HOME must be absolute");
      }
      return resolve(xdg);
    })()
    : join(homeAbs, ".local", "share");
  return resolve(dataHome, "parallel-review", "runs");
};

const utcDatePrefix = (): string => new Date().toISOString().slice(0, 10);

const snapshotTimestamp = (): string =>
  new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const sha256Bytes = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const writePrivateFile = async (
  path: string,
  content: string,
  options?: { flag?: "w" | "wx" },
): Promise<void> => {
  await writeFile(path, content, { mode: 0o600, flag: options?.flag ?? "w" });
};

const isEexist = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: string }).code === "EEXIST";

const createOwnedSnapshotTemp = async (snapshotsDir: string) => {
  const tempPath = await Deno.makeTempFile({
    dir: snapshotsDir,
    prefix: ".snap-",
    suffix: ".tmp",
  });
  await Deno.chmod(tempPath, 0o600);
  return tempPath;
};

const publishSnapshotFile = async (
  snapshotsDir: string,
  snapshotName: string,
  content: string,
): Promise<string> => {
  const tempPath = await createOwnedSnapshotTemp(snapshotsDir);
  const snapshotPath = join(snapshotsDir, snapshotName);
  try {
    await writePrivateFile(tempPath, content);
    try {
      await link(tempPath, snapshotPath);
    } catch (error) {
      if (isEexist(error)) {
        throw new Error(`snapshot already exists: ${snapshotName}`);
      }
      throw error;
    }
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // process kill during publish may leave our non-json temp behind
    }
  }
  return snapshotPath;
};

const ensurePrivateDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true, mode: 0o700 });
};

export const initRun = async (options: {
  repository: string;
  revision: string;
  level: number;
}) => {
  if (!isNonEmptyString(options.repository)) {
    throw new Error("repository is required");
  }
  if (!isNonEmptyString(options.revision)) {
    throw new Error("revision is required");
  }
  const level = parseLevel(options.level);
  const runId = randomUUID();
  const runDir = resolve(getRunsBaseDir(), `${utcDatePrefix()}-${runId}`);
  await ensurePrivateDir(runDir);
  const metadata = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    createdAt: new Date().toISOString(),
    repository: options.repository,
    revision: options.revision,
    level,
  };
  await writePrivateFile(
    join(runDir, "metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return { runDir, runId, metadata };
};

const resolveRunRelativePath = async (
  runDir: string,
  relPath: string,
): Promise<string> => {
  const normalized = validateRunRelativePath(relPath, "path");
  const candidate = resolve(runDir, normalized);
  const runReal = await realpath(runDir);
  const candidateLstat = await Deno.lstat(candidate).catch((error) => {
    if (isMissingDir(error)) throw error;
    throw error;
  });
  if (candidateLstat.isSymlink) {
    throw new Error(`path escapes run dir: ${relPath}`);
  }
  const candidateReal = await realpath(candidate);
  const rel = relative(runReal, candidateReal);
  if (rel === ".." || rel.startsWith(`..${"/"}`)) {
    throw new Error(`path escapes run dir: ${relPath}`);
  }
  return candidateReal;
};

const readRegularFileInRun = async (
  runDir: string,
  relPath: string,
) => {
  const absPath = await resolveRunRelativePath(runDir, relPath);
  const stat = await Deno.stat(absPath);
  if (!stat.isFile) throw new Error(`not a regular file: ${relPath}`);
  const content = await readFile(absPath);
  return { absPath, content };
};

const readJsonInRun = async (
  runDir: string,
  relPath: string,
): Promise<unknown> => {
  const { content } = await readRegularFileInRun(runDir, relPath);
  return JSON.parse(new TextDecoder().decode(content));
};

const listJsonInSubdir = async (
  runDir: string,
  subdir: string,
  label: string,
): Promise<string[]> => {
  const dirPath = join(runDir, subdir);
  try {
    const dirLstat = await Deno.lstat(dirPath);
    if (dirLstat.isSymlink) {
      throw new Error(`${label} directory must not be a symlink`);
    }
    return (await readdir(dirPath)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (isMissingDir(error)) return [];
    throw error;
  }
};

const loadMetadata = async (runDir: string) =>
  validateMetadata(await readJsonInRun(runDir, "metadata.json"));

const loadExecutions = async (runDir: string): Promise<ExecutionRecord[]> => {
  const names = await listJsonInSubdir(runDir, "executions", "executions");
  const records = [];
  for (const name of names.sort()) {
    records.push(
      validateExecutionRecord(
        await readJsonInRun(runDir, `executions/${name}`),
      ),
    );
  }
  const ids = records.map((record) => record.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("duplicate execution ids in run dir");
  }
  return records;
};

const isTerminalFailure = (record: ExecutionRecord): boolean =>
  record.status === "pending" ||
  record.status === "running" ||
  record.exitCode === undefined ||
  record.exitCode !== 0;

const loadPriorSnapshots = async (runDir: string): Promise<Snapshot[]> => {
  const names = await listJsonInSubdir(runDir, "snapshots", "snapshots");
  const snapshots = [];
  for (const name of names.sort()) {
    snapshots.push(
      validateSnapshot(await readJsonInRun(runDir, `snapshots/${name}`)),
    );
  }
  return snapshots;
};

const assertPriorSnapshotsCompatible = (
  priors: Snapshot[],
  current: Snapshot,
): void => {
  for (const prior of priors) {
    if (!isDeepStrictEqual(prior.metadata, current.metadata)) {
      throw new Error("metadata changed across snapshots");
    }
    if (prior.files.patch.sha256 !== current.files.patch.sha256) {
      throw new Error("patch hash changed across snapshots");
    }
    if (prior.files.prompt.sha256 !== current.files.prompt.sha256) {
      throw new Error("prompt hash changed across snapshots");
    }

    const currentExecById = new Map(
      current.executions.map((execution) => [execution.id, execution]),
    );
    const currentReviewById = new Map(
      current.reviews.map((review) => [review.executionId, review]),
    );

    for (const priorExec of prior.executions) {
      const currExec = currentExecById.get(priorExec.id);
      if (!currExec) {
        throw new Error(`prior execution removed: ${priorExec.id}`);
      }

      if (priorExec.status === "completed") {
        const priorBody = { ...priorExec, files: priorExec.files };
        const currBody = { ...currExec, files: currExec.files };
        if (!isDeepStrictEqual(priorBody, currBody)) {
          throw new Error(`completed execution ${priorExec.id} changed`);
        }
      } else {
        if (priorExec.status === "running" && currExec.status === "pending") {
          throw new Error(`execution ${priorExec.id} status regressed`);
        }
        for (const field of EXEC_IDENTITY_FIELDS) {
          if (priorExec[field] !== currExec[field]) {
            throw new Error(`execution ${priorExec.id} ${field} changed`);
          }
        }
        if (
          priorExec.files.chunk.sha256 !== currExec.files.chunk.sha256 ||
          priorExec.files.stdoutLog.path !== currExec.files.stdoutLog.path ||
          priorExec.files.stderrLog.path !== currExec.files.stderrLog.path
        ) {
          throw new Error(`execution ${priorExec.id} file identity changed`);
        }
      }
    }

    for (const priorReview of prior.reviews) {
      const currReview = currentReviewById.get(priorReview.executionId);
      if (!currReview) {
        throw new Error(`prior review removed: ${priorReview.executionId}`);
      }
      for (const priorFinding of priorReview.findings) {
        const currFinding = currReview.findings.find((f) =>
          f.id === priorFinding.id
        );
        if (!currFinding) {
          throw new Error(
            `prior finding removed: ${priorReview.executionId}/${priorFinding.id}`,
          );
        }
        for (const field of IMMUTABLE_FINDING_FIELDS) {
          if (priorFinding[field] !== currFinding[field]) {
            throw new Error(
              `immutable finding ${field} changed for ${priorReview.executionId}/${priorFinding.id}`,
            );
          }
        }
      }
    }
  }
};

export const saveAssessment = async (options: {
  runDir: string;
  assessment: unknown;
}) => {
  const { runDir } = options;
  if (!isNonEmptyString(runDir)) throw new Error("runDir is required");

  const metadata = await loadMetadata(runDir);
  const executions = await loadExecutions(runDir);
  if (executions.length === 0) {
    throw new Error("no executions recorded");
  }

  const executionById = new Map(
    executions.map((record) => [record.id, record]),
  );
  const assessment = validateAssessment(options.assessment, executionById);
  const priors = await loadPriorSnapshots(runDir);

  const patch = await readRegularFileInRun(runDir, "changes.patch");
  const prompt = await readRegularFileInRun(runDir, "prompt.md");
  const patchSha256 = sha256Bytes(patch.content);
  const promptSha256 = sha256Bytes(prompt.content);

  const executionSnapshots: ExecutionSnapshot[] = [];
  for (const record of executions) {
    const chunkFile = await readRegularFileInRun(runDir, record.chunk);
    const stdout = await readRegularFileInRun(runDir, record.stdoutLog);
    const stderr = await readRegularFileInRun(runDir, record.stderrLog);
    executionSnapshots.push({
      ...record,
      files: {
        chunk: { path: record.chunk, sha256: sha256Bytes(chunkFile.content) },
        stdoutLog: {
          path: record.stdoutLog,
          sha256: sha256Bytes(stdout.content),
        },
        stderrLog: {
          path: record.stderrLog,
          sha256: sha256Bytes(stderr.content),
        },
      },
    });
  }

  const snapshot: Snapshot = {
    schemaVersion: SCHEMA_VERSION,
    runId: metadata.runId as string,
    savedAt: new Date().toISOString(),
    actor: assessment.actor,
    metadata,
    files: {
      patch: { path: "changes.patch", sha256: patchSha256 },
      prompt: { path: "prompt.md", sha256: promptSha256 },
    },
    executions: executionSnapshots,
    reviews: assessment.reviews,
  };

  assertPriorSnapshotsCompatible(priors, snapshot);

  const snapshotsDir = join(runDir, "snapshots");
  await ensurePrivateDir(snapshotsDir);
  const snapshotsLstat = await Deno.lstat(snapshotsDir);
  if (snapshotsLstat.isSymlink) {
    throw new Error("snapshots directory must not be a symlink");
  }
  const snapshotName = `${snapshotTimestamp()}-${randomUUID()}.json`;
  const snapshotPath = await publishSnapshotFile(
    snapshotsDir,
    snapshotName,
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  return { snapshotPath };
};

const parseArgs = (args: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (!key) throw new Error("empty flag");
    i++;
    if (i >= args.length || args[i].startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    if (map.has(key)) throw new Error(`duplicate flag: --${key}`);
    map.set(key, args[i]);
    i++;
  }
  return map;
};

const rejectUnknownFlags = (
  parsed: Map<string, string>,
  allowed: Set<string>,
): void => {
  for (const key of parsed.keys()) {
    if (!allowed.has(key)) throw new Error(`unknown flag: --${key}`);
  }
};

const cmdInit = async (args: string[]) => {
  const parsed = parseArgs(args);
  rejectUnknownFlags(
    parsed,
    new Set(["repository", "revision", "level"]),
  );
  const repository = parsed.get("repository");
  const revision = parsed.get("revision");
  const levelRaw = parsed.get("level");
  if (!repository || !revision || !levelRaw) {
    throw new Error(
      "usage: review_history.ts init --repository PATH --revision REV --level N",
    );
  }
  const { runDir } = await initRun({
    repository,
    revision,
    level: parseLevel(levelRaw),
  });
  await Deno.stdout.write(new TextEncoder().encode(`${runDir}\n`));
};

const cmdSave = async (args: string[]) => {
  const parsed = parseArgs(args);
  rejectUnknownFlags(parsed, new Set(["dir", "input"]));
  const runDir = parsed.get("dir");
  const input = parsed.get("input");
  if (!runDir || !input) {
    throw new Error(
      "usage: review_history.ts save --dir RUN_DIR --input ASSESSMENT.json",
    );
  }
  const raw = await readFile(input, "utf8");
  const { snapshotPath } = await saveAssessment({
    runDir,
    assessment: JSON.parse(raw),
  });
  await Deno.stdout.write(new TextEncoder().encode(`${snapshotPath}\n`));
};

const main = async () => {
  const [command, ...rest] = Deno.args;
  if (command === "init") {
    await cmdInit(rest);
    return;
  }
  if (command === "save") {
    await cmdSave(rest);
    return;
  }
  throw new Error("usage: review_history.ts <init|save> ...");
};

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}
