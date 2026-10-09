import { basename, dirname, join, resolve } from "node:path";
import { type ExecutionStatus, SCHEMA_VERSION } from "./impl_stream.ts";
import type {
  CodeProvenance,
  ParentValidationStatus,
  RunMetadata,
} from "./run_impl_events.ts";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const HEX_HASH = /^[0-9a-f]{64}$/i;
const FULL_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const TOOL_KEYS = new Set(["read", "bash", "edit", "write", "unknown"]);
const CORE_USAGE_METRICS = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
] as const;
const EXECUTION_STATUSES = new Set<ExecutionStatus>([
  "running",
  "completed",
  "failed",
  "incomplete",
]);
const PARENT_STATUSES = new Set<ParentValidationStatus>([
  "unverified",
  "passed",
  "failed",
  "not-run",
]);
const SETTABLE_PARENT = new Set(["passed", "failed", "not-run"]);
const USAGE_COVERAGE = new Set(["complete", "partial", "unknown"]);
const USAGE_SOURCES = new Set([
  "assistant_message_end",
  "compaction_end",
]);
const STOP_REASONS = new Set([
  "stop",
  "length",
  "error",
  "aborted",
  "pending",
  "toolUse",
  "deferred",
  "unknown",
]);
const USAGE_METRICS = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "cacheWrite1h",
  "reasoning",
  "totalTokens",
  "estimatedCostUsd",
] as const;
type UsageMetric = (typeof USAGE_METRICS)[number];

const METADATA_KEYS = new Set([
  "schemaVersion",
  "runId",
  "role",
  "resolvedModel",
  "startedAt",
  "finishedAt",
  "elapsedMs",
  "exitCode",
  "executionStatus",
  "stopReason",
  "promptSha256",
  "systemPromptSha256",
  "codeProvenance",
  "usage",
  "assistantResponseCount",
  "toolCalls",
  "toolErrors",
  "retryCount",
  "compactionCount",
  "parentValidationStatus",
]);

type LoadResult = {
  records: RunMetadata[];
  excluded: { path: string; reason: string }[];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const readString = (v: unknown) => typeof v === "string" ? v : undefined;

const readNonEmptyString = (v: unknown) => {
  const s = readString(v);
  return s !== undefined && s.length > 0 ? s : undefined;
};

const readFiniteNonNeg = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

const readInt = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) ? v : undefined;

const readUtcIso = (v: unknown) => {
  const s = readString(v);
  if (!s || Number.isNaN(Date.parse(s))) return undefined;
  if (!/Z$/i.test(s) && !/\+00:00$/.test(s)) return undefined;
  return s;
};

const readNonNegInt = (v: unknown) => {
  const n = readInt(v);
  return n !== undefined && n >= 0 ? n : undefined;
};

const rejectUnknownKeys = (raw: Record<string, unknown>, label: string) => {
  for (const key of Object.keys(raw)) {
    if (!METADATA_KEYS.has(key)) return `${label}: unknown field`;
  }
  return undefined;
};

const validRevision = (value: string) => FULL_REVISION.test(value);

const provenanceIsMatched = (p: RunMetadata["codeProvenance"]) =>
  p.comparable === true &&
  (p.revisionKind === "jj" || p.revisionKind === "git") &&
  p.startRevision !== undefined &&
  validRevision(p.startRevision);

const validateToolCounts = (raw: unknown, label: string) => {
  if (!isRecord(raw)) return `${label}: invalid object`;
  for (const key of Object.keys(raw)) {
    if (!TOOL_KEYS.has(key)) return `${label}: unknown tool`;
    const n = readInt(raw[key]);
    if (n === undefined || n < 0) return `${label}: invalid count`;
  }
  return undefined;
};

const validateKnownSlices = (
  raw: unknown,
  expectedSlices: number,
): { ok?: Record<string, number>; reason?: string } => {
  if (!isRecord(raw)) return { reason: "usage.knownSlices invalid" };
  const out: Record<string, number> = {};
  for (const key of Object.keys(raw)) {
    if (!USAGE_METRICS.includes(key as UsageMetric)) {
      return { reason: "usage.knownSlices unknown metric" };
    }
    const n = readInt(raw[key]);
    if (n === undefined || n < 0 || n > expectedSlices) {
      return { reason: "usage.knownSlices out of range" };
    }
    out[key] = n;
  }
  return { ok: out };
};

const USAGE_FIELD_KEYS = new Set<string>([
  "coverage",
  "sources",
  "expectedSlices",
  "knownSlices",
  ...USAGE_METRICS,
]);

const validateUsageSources = (raw: Record<string, unknown>) => {
  if (!Array.isArray(raw.sources)) return "usage.sources invalid";
  for (const s of raw.sources) {
    if (typeof s !== "string" || !USAGE_SOURCES.has(s)) {
      return "usage.sources invalid entry";
    }
  }
  return undefined;
};

const readUsageNumericFields = (raw: Record<string, unknown>) => {
  const nums: Record<string, number> = {};
  for (const metric of USAGE_METRICS) {
    if (raw[metric] === undefined) continue;
    const n = readFiniteNonNeg(raw[metric]);
    if (n === undefined) return { reason: `usage.${metric} invalid` };
    nums[metric] = n;
  }
  return { nums };
};

type ParsedUsage = {
  coverage: string;
  sources: string[];
  expectedSlices: number;
  knownSlices: Record<string, number>;
} & Record<string, number | string | string[] | Record<string, number>>;

const usageMetricKnown = (known: Record<string, number>, metric: string) =>
  known[metric] ?? 0;

const deriveUsageCoverage = (
  expectedSlices: number,
  sources: string[],
  knownSlices: Record<string, number>,
  nums: Record<string, number>,
) => {
  const anyCoreKnown = CORE_USAGE_METRICS.some((m) =>
    usageMetricKnown(knownSlices, m) > 0
  );
  const hasCoreNumeric = CORE_USAGE_METRICS.some((m) => nums[m] !== undefined);
  const unknown = expectedSlices === 0 || sources.length === 0 ||
    (!anyCoreKnown && !hasCoreNumeric);
  const complete = expectedSlices > 0 &&
    CORE_USAGE_METRICS.every((m) =>
      usageMetricKnown(knownSlices, m) === expectedSlices
    );
  return { unknown, complete };
};

const validateUsageExpectedCount = (
  expectedSlices: number,
  assistantResponseCount: number,
  compactionCount: number,
) =>
  expectedSlices !== assistantResponseCount + compactionCount
    ? "usage.expectedSlices mismatch"
    : undefined;

const validateUsageZeroExpected = (
  expectedSlices: number,
  knownSlices: Record<string, number>,
  coverage: string,
) => {
  if (expectedSlices !== 0) return undefined;
  for (const key of Object.keys(knownSlices)) {
    if (knownSlices[key]! > 0) return "usage.knownSlices with zero expected";
  }
  return coverage === "complete" ? "usage.coverage invalid" : undefined;
};

const validateUsageMetricPairs = (
  expectedSlices: number,
  knownSlices: Record<string, number>,
  nums: Record<string, number>,
) => {
  for (const metric of USAGE_METRICS) {
    const known = usageMetricKnown(knownSlices, metric);
    if (known < 0 || known > expectedSlices) {
      return "usage.knownSlices out of range";
    }
    const hasValue = nums[metric] !== undefined;
    if (known > 0 && !hasValue) return `usage.${metric} missing`;
    if (hasValue && known === 0) return `usage.knownSlices.${metric} missing`;
  }
  return undefined;
};

const validateUsageCoverageTag = (
  coverage: string,
  expectedSlices: number,
  sources: string[],
  knownSlices: Record<string, number>,
  nums: Record<string, number>,
) => {
  const derived = deriveUsageCoverage(
    expectedSlices,
    sources,
    knownSlices,
    nums,
  );
  if (coverage === "complete" && !derived.complete) {
    return "usage.coverage invalid";
  }
  if (coverage === "unknown" && !derived.unknown) {
    return "usage.coverage invalid";
  }
  if (coverage === "partial" && derived.unknown) {
    return "usage.coverage invalid";
  }
  return undefined;
};

const validateUsageConsistency = (
  usage: ParsedUsage,
  assistantResponseCount: number,
  compactionCount: number,
): string | undefined => {
  const { coverage, expectedSlices, knownSlices, sources } = usage;
  const nums = usage as Record<string, number>;
  return validateUsageExpectedCount(
    expectedSlices,
    assistantResponseCount,
    compactionCount,
  ) ?? validateUsageZeroExpected(expectedSlices, knownSlices, coverage) ??
    (expectedSlices > 0 && sources.length === 0
      ? "usage.sources invalid"
      : undefined) ??
    validateUsageMetricPairs(expectedSlices, knownSlices, nums) ??
    validateUsageCoverageTag(
      coverage,
      expectedSlices,
      sources,
      knownSlices,
      nums,
    );
};

const validateUsageAllowedKeys = (raw: Record<string, unknown>) => {
  for (const key of Object.keys(raw)) {
    if (!USAGE_FIELD_KEYS.has(key)) return "usage unknown field";
  }
  return undefined;
};

const validateUsageCore = (raw: Record<string, unknown>) => {
  const coverage = readString(raw.coverage);
  if (!coverage || !USAGE_COVERAGE.has(coverage)) {
    return { reason: "usage.coverage invalid" };
  }
  const sourcesErr = validateUsageSources(raw);
  if (sourcesErr) return { reason: sourcesErr };
  const expectedSlices = readNonNegInt(raw.expectedSlices);
  if (expectedSlices === undefined) {
    return { reason: "usage.expectedSlices invalid" };
  }
  return { coverage, expectedSlices };
};

const validateUsage = (
  raw: unknown,
  assistantResponseCount: number,
  compactionCount: number,
) => {
  if (!isRecord(raw)) return { reason: "usage invalid" };
  const keysErr = validateUsageAllowedKeys(raw);
  if (keysErr) return { reason: keysErr };
  const core = validateUsageCore(raw);
  if (core.reason) return { reason: core.reason };
  const known = validateKnownSlices(raw.knownSlices, core.expectedSlices!);
  if (known.reason) return { reason: known.reason };
  const nums = readUsageNumericFields(raw);
  if (nums.reason) return { reason: nums.reason };
  const parsed: ParsedUsage = {
    coverage: core.coverage!,
    sources: raw.sources as string[],
    expectedSlices: core.expectedSlices!,
    knownSlices: known.ok ?? {},
    ...nums.nums,
  };
  const consistency = validateUsageConsistency(
    parsed,
    assistantResponseCount,
    compactionCount,
  );
  if (consistency) return { reason: consistency };
  return { ok: parsed as RunMetadata["usage"] };
};

const PROVENANCE_KEYS = new Set([
  "repositoryPath",
  "startRevision",
  "revisionKind",
  "comparable",
]);

const validateRevisionKind = (revisionKind: string) =>
  revisionKind === "jj" || revisionKind === "git" ||
  revisionKind === "unknown";

const validateComparableProvenance = (
  comparable: boolean,
  revisionKind: string,
  startRevision: string | undefined,
) => {
  if (!comparable) return undefined;
  if (revisionKind === "unknown" || !startRevision) {
    return "codeProvenance not verifiable";
  }
  return undefined;
};

const validateProvenanceKeys = (raw: Record<string, unknown>) => {
  for (const key of Object.keys(raw)) {
    if (!PROVENANCE_KEYS.has(key)) {
      return "codeProvenance unknown field";
    }
  }
  return undefined;
};

const readProvenanceScalars = (raw: Record<string, unknown>) => {
  const repositoryPath = readNonEmptyString(raw.repositoryPath);
  const revisionKind = readString(raw.revisionKind);
  if (!repositoryPath || !revisionKind) {
    return { reason: "codeProvenance missing fields" };
  }
  if (!validateRevisionKind(revisionKind)) {
    return { reason: "codeProvenance.revisionKind invalid" };
  }
  if (typeof raw.comparable !== "boolean") {
    return { reason: "codeProvenance.comparable invalid" };
  }
  const startRevision = readString(raw.startRevision);
  if (startRevision !== undefined && !validRevision(startRevision)) {
    return { reason: "codeProvenance.startRevision invalid" };
  }
  return {
    repositoryPath,
    revisionKind,
    comparable: raw.comparable,
    startRevision,
  };
};

const validateCodeProvenance = (raw: unknown) => {
  if (!isRecord(raw)) return { reason: "codeProvenance invalid" };
  const keysErr = validateProvenanceKeys(raw);
  if (keysErr) return { reason: keysErr };
  const scalars = readProvenanceScalars(raw);
  if (scalars.reason) return { reason: scalars.reason };
  const comparableErr = validateComparableProvenance(
    scalars.comparable!,
    scalars.revisionKind!,
    scalars.startRevision,
  );
  if (comparableErr) return { reason: comparableErr };
  const provenance: CodeProvenance = {
    repositoryPath: scalars.repositoryPath!,
    revisionKind: scalars.revisionKind as CodeProvenance["revisionKind"],
    comparable: scalars.comparable!,
    ...(scalars.startRevision ? { startRevision: scalars.startRevision } : {}),
  };
  return { ok: provenance };
};

const completedCrossCheck = (
  exitCode: number | undefined,
  stopReason: string | undefined,
) => {
  if (exitCode !== 0) return "completed requires exitCode 0";
  if (stopReason !== "stop") return "completed requires stopReason stop";
  return undefined;
};

const validateExecutionCross = (
  status: ExecutionStatus,
  exitCode: number | undefined,
  stopReason: string | undefined,
  parent: ParentValidationStatus,
) => {
  if (parent === "passed" && status !== "completed") {
    return "passed parent validation requires completed run";
  }
  if (status === "completed") {
    return completedCrossCheck(exitCode, stopReason);
  }
  if (status === "running") {
    if (
      exitCode !== undefined || stopReason !== undefined
    ) {
      return "running must not include finished exit/stop";
    }
  }
  return undefined;
};

type HeaderFields = {
  runId: string;
  role: string;
  resolvedModel: string;
  startedAt: string;
  status: ExecutionStatus;
  promptSha256: string;
  systemPromptSha256: string;
  parent: ParentValidationStatus;
};

type IdentityFields = {
  runId: string;
  role: string;
  resolvedModel: string;
  startedAt: string;
  executionStatus: string;
  promptSha256: string;
  systemPromptSha256: string;
};

const readMetadataIdentity = (
  raw: Record<string, unknown>,
): { ok?: IdentityFields; reason?: string } => {
  const runId = readNonEmptyString(raw.runId);
  const role = readNonEmptyString(raw.role);
  const resolvedModel = readNonEmptyString(raw.resolvedModel);
  const startedAt = readUtcIso(raw.startedAt);
  const executionStatus = readString(raw.executionStatus);
  const promptSha256 = readString(raw.promptSha256);
  const systemPromptSha256 = readString(raw.systemPromptSha256);
  if (
    !runId || !role || !resolvedModel || !startedAt || !executionStatus ||
    !promptSha256 || !systemPromptSha256
  ) {
    return { reason: "missing required fields" };
  }
  return {
    ok: {
      runId,
      role,
      resolvedModel,
      startedAt,
      executionStatus,
      promptSha256,
      systemPromptSha256,
    },
  };
};

const readMetadataHeader = (
  raw: Record<string, unknown>,
): { ok?: HeaderFields; reason?: string } => {
  const unknown = rejectUnknownKeys(raw, "metadata");
  if (unknown) return { reason: unknown };
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    return { reason: "unsupported schemaVersion" };
  }
  const identity = readMetadataIdentity(raw);
  if (identity.reason) return { reason: identity.reason };
  const id = identity.ok!;
  if (!EXECUTION_STATUSES.has(id.executionStatus as ExecutionStatus)) {
    return { reason: "invalid executionStatus" };
  }
  if (
    !HEX_HASH.test(id.promptSha256) || !HEX_HASH.test(id.systemPromptSha256)
  ) {
    return { reason: "invalid content hash" };
  }
  const parentRaw = raw.parentValidationStatus ?? "unverified";
  if (!PARENT_STATUSES.has(parentRaw as ParentValidationStatus)) {
    return { reason: "invalid parentValidationStatus" };
  }
  return {
    ok: {
      runId: id.runId,
      role: id.role,
      resolvedModel: id.resolvedModel,
      startedAt: id.startedAt,
      status: id.executionStatus as ExecutionStatus,
      promptSha256: id.promptSha256,
      systemPromptSha256: id.systemPromptSha256,
      parent: parentRaw as ParentValidationStatus,
    },
  };
};

type NestedFields = {
  codeProvenance: CodeProvenance;
  usage: RunMetadata["usage"];
  assistantResponseCount: number;
  toolCalls: Record<string, number>;
  toolErrors: Record<string, number>;
  retryCount: number;
  compactionCount: number;
};

const readMetadataNested = (
  raw: Record<string, unknown>,
): { ok?: NestedFields; reason?: string } => {
  const prov = validateCodeProvenance(raw.codeProvenance);
  if (prov.reason) return { reason: prov.reason };
  const assistantResponseCount = readNonNegInt(raw.assistantResponseCount);
  const retryCount = readNonNegInt(raw.retryCount);
  const compactionCount = readNonNegInt(raw.compactionCount);
  if (
    assistantResponseCount === undefined || retryCount === undefined ||
    compactionCount === undefined
  ) {
    return { reason: "invalid counters" };
  }
  const usage = validateUsage(
    raw.usage,
    assistantResponseCount,
    compactionCount,
  );
  if (usage.reason) return { reason: usage.reason };
  const toolCallsErr = validateToolCounts(raw.toolCalls, "toolCalls");
  if (toolCallsErr) return { reason: toolCallsErr };
  const toolErrorsErr = validateToolCounts(raw.toolErrors, "toolErrors");
  if (toolErrorsErr) return { reason: toolErrorsErr };
  return {
    ok: {
      codeProvenance: prov.ok!,
      usage: usage.ok! as RunMetadata["usage"],
      assistantResponseCount,
      toolCalls: raw.toolCalls as Record<string, number>,
      toolErrors: raw.toolErrors as Record<string, number>,
      retryCount,
      compactionCount,
    },
  };
};

type TimingFields = {
  finishedAt?: string;
  elapsedMs?: number;
  exitCode?: number;
  stopReason?: string;
};

const readStopReason = (raw: Record<string, unknown>) => {
  if (raw.stopReason === undefined || raw.stopReason === null) return {};
  const sr = readString(raw.stopReason);
  if (!sr) return { reason: "invalid stopReason" };
  return { stopReason: STOP_REASONS.has(sr) ? sr : "unknown" };
};

const readFinishedTiming = (raw: Record<string, unknown>) => {
  const finishedAt = readUtcIso(raw.finishedAt);
  const elapsedMs = readFiniteNonNeg(raw.elapsedMs);
  const exitCode = readNonNegInt(raw.exitCode);
  if (!finishedAt || elapsedMs === undefined || exitCode === undefined) {
    return { reason: "invalid finished metrics" };
  }
  return { finishedAt, elapsedMs, exitCode };
};

const readRunningTiming = (raw: Record<string, unknown>) => {
  const hasFinished = raw.finishedAt !== undefined && raw.finishedAt !== null;
  const hasElapsed = raw.elapsedMs !== undefined && raw.elapsedMs !== null;
  const hasExit = raw.exitCode !== undefined && raw.exitCode !== null;
  const hasStop = raw.stopReason !== undefined && raw.stopReason !== null;
  if (hasFinished || hasElapsed || hasExit || hasStop) {
    return { reason: "running must not include finished metrics" };
  }
  return { ok: {} as TimingFields };
};

const readFinishedRunTiming = (raw: Record<string, unknown>) => {
  const hasFinished = raw.finishedAt !== undefined && raw.finishedAt !== null;
  const hasElapsed = raw.elapsedMs !== undefined && raw.elapsedMs !== null;
  const hasExit = raw.exitCode !== undefined && raw.exitCode !== null;
  if (!hasFinished || !hasElapsed || !hasExit) {
    return { reason: "finished run missing timing fields" };
  }
  const finished = readFinishedTiming(raw);
  if (finished.reason) return { reason: finished.reason };
  const stop = readStopReason(raw);
  if (stop.reason) return { reason: stop.reason };
  return {
    ok: {
      finishedAt: finished.finishedAt,
      elapsedMs: finished.elapsedMs!,
      exitCode: finished.exitCode!,
      ...(stop.stopReason ? { stopReason: stop.stopReason } : {}),
    },
  };
};

const readMetadataTiming = (
  raw: Record<string, unknown>,
  status: ExecutionStatus,
): { ok?: TimingFields; reason?: string } =>
  status === "running" ? readRunningTiming(raw) : readFinishedRunTiming(raw);

export function validateRunMetadata(
  raw: unknown,
): { ok: RunMetadata; reason?: undefined } | {
  ok?: undefined;
  reason: string;
} {
  if (!isRecord(raw)) return { reason: "not an object" };
  const header = readMetadataHeader(raw);
  if (header.reason) return { reason: header.reason };
  const nested = readMetadataNested(raw);
  if (nested.reason) return { reason: nested.reason };
  const timing = readMetadataTiming(raw, header.ok!.status);
  if (timing.reason) return { reason: timing.reason };
  const cross = validateExecutionCross(
    header.ok!.status,
    timing.ok!.exitCode,
    timing.ok!.stopReason,
    header.ok!.parent,
  );
  if (cross) return { reason: cross };
  const h = header.ok!;
  const n = nested.ok!;
  const t = timing.ok!;
  return {
    ok: {
      schemaVersion: SCHEMA_VERSION,
      runId: h.runId,
      role: h.role,
      resolvedModel: h.resolvedModel,
      startedAt: h.startedAt,
      executionStatus: h.status,
      promptSha256: h.promptSha256,
      systemPromptSha256: h.systemPromptSha256,
      parentValidationStatus: h.parent,
      codeProvenance: n.codeProvenance,
      usage: n.usage,
      assistantResponseCount: n.assistantResponseCount,
      toolCalls: n.toolCalls,
      toolErrors: n.toolErrors,
      retryCount: n.retryCount,
      compactionCount: n.compactionCount,
      ...(t.finishedAt ? { finishedAt: t.finishedAt } : {}),
      ...(t.elapsedMs !== undefined ? { elapsedMs: t.elapsedMs } : {}),
      ...(t.exitCode !== undefined ? { exitCode: t.exitCode } : {}),
      ...(t.stopReason ? { stopReason: t.stopReason } : {}),
    },
  };
}

const isSymlink = async (path: string) => {
  try {
    const st = await Deno.lstat(path);
    return st.isSymlink;
  } catch {
    return false;
  }
};

const readRunMetadataFile = async (metaPath: string) => {
  if (await isSymlink(metaPath)) {
    return { excluded: { path: metaPath, reason: "symlink metadata" } };
  }
  let text: string;
  try {
    text = await Deno.readTextFile(metaPath);
  } catch {
    return { excluded: { path: metaPath, reason: "metadata missing" } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { excluded: { path: metaPath, reason: "invalid json" } };
  }
  const validated = validateRunMetadata(parsed);
  if (!validated.ok) {
    return { excluded: { path: metaPath, reason: validated.reason } };
  }
  return { record: validated.ok };
};

const ingestRunDirectory = async (runsRoot: string, name: string) => {
  const runDir = join(runsRoot, name);
  if (await isSymlink(runDir)) {
    return { excluded: { path: runDir, reason: "symlink run directory" } };
  }
  return readRunMetadataFile(join(runDir, "metadata.json"));
};

export async function loadRunMetadataFromRoot(
  runsRoot: string,
): Promise<LoadResult> {
  const records: RunMetadata[] = [];
  const excluded: { path: string; reason: string }[] = [];
  if (await isSymlink(runsRoot)) {
    return {
      records: [],
      excluded: [{ path: runsRoot, reason: "symlink runs root" }],
    };
  }
  try {
    for await (const entry of Deno.readDir(runsRoot)) {
      if (!entry.isDirectory) continue;
      const result = await ingestRunDirectory(runsRoot, entry.name);
      if (result.excluded) excluded.push(result.excluded);
      if (result.record) records.push(result.record);
    }
  } catch {
    return {
      records: [],
      excluded: [{ path: runsRoot, reason: "runs root unreadable" }],
    };
  }
  return { records, excluded };
}

type MetricDisplay = number | "unknown";

type ModelAgg = {
  resolvedModel: string;
  runs: number;
  completed: number;
  failed: number;
  incomplete: number;
  running: number;
  elapsedKnown: number;
  elapsedMedianMs?: number;
  elapsedMeanMs?: number;
  usageRunsWithInput: number;
  inputSum?: number;
  outputSum?: number;
  cacheReadSum?: number;
  cacheWriteSum?: number;
  inputDisplay: MetricDisplay;
  outputDisplay: MetricDisplay;
  cacheReadDisplay: MetricDisplay;
  cacheWriteDisplay: MetricDisplay;
  costSubtotalUsd?: number;
  costKnownSlices: number;
  costExpectedSlices: number;
  costLabel: string;
  costFullRuns: number;
  costExpectedRuns: number;
  inputKnownRuns: number;
  outputKnownRuns: number;
  cacheReadKnownRuns: number;
  cacheWriteKnownRuns: number;
  inputKnownSlices: number;
  inputExpectedSlices: number;
  outputKnownSlices: number;
  outputExpectedSlices: number;
  cacheReadKnownSlices: number;
  cacheReadExpectedSlices: number;
  cacheWriteKnownSlices: number;
  cacheWriteExpectedSlices: number;
  parent: Record<ParentValidationStatus, number>;
  _elapsed?: number[];
};

const median = (values: number[]) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid];
};

const mean = (values: number[]) =>
  values.length === 0
    ? undefined
    : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

const metricKnown = (
  usage: RunMetadata["usage"],
  metric: UsageMetric,
): boolean => (usage.knownSlices?.[metric] ?? 0) > 0;

const bumpMetricSum = (
  current: number | undefined,
  add: number | undefined,
) => {
  if (current === undefined && add === undefined) return undefined;
  const sum = (current ?? 0) + (add ?? 0);
  return Number.isFinite(sum) ? sum : undefined;
};

const displayMetric = (
  sum: number | undefined,
  knownCount: number,
): MetricDisplay => knownCount > 0 && sum !== undefined ? sum : "unknown";

const bumpParent = (agg: ModelAgg, status: ParentValidationStatus) => {
  agg.parent[status] = (agg.parent[status] ?? 0) + 1;
};

const newModelAgg = (key: string): ModelAgg => ({
  resolvedModel: key,
  runs: 0,
  completed: 0,
  failed: 0,
  incomplete: 0,
  running: 0,
  elapsedKnown: 0,
  usageRunsWithInput: 0,
  inputDisplay: "unknown",
  outputDisplay: "unknown",
  cacheReadDisplay: "unknown",
  cacheWriteDisplay: "unknown",
  costKnownSlices: 0,
  costExpectedSlices: 0,
  costLabel: "unknown",
  costFullRuns: 0,
  costExpectedRuns: 0,
  inputKnownRuns: 0,
  outputKnownRuns: 0,
  cacheReadKnownRuns: 0,
  cacheWriteKnownRuns: 0,
  inputKnownSlices: 0,
  inputExpectedSlices: 0,
  outputKnownSlices: 0,
  outputExpectedSlices: 0,
  cacheReadKnownSlices: 0,
  cacheReadExpectedSlices: 0,
  cacheWriteKnownSlices: 0,
  cacheWriteExpectedSlices: 0,
  parent: { unverified: 0, passed: 0, failed: 0, "not-run": 0 },
});

const applyExecutionStatus = (agg: ModelAgg, status: ExecutionStatus) => {
  if (status === "completed") agg.completed += 1;
  else if (status === "failed") agg.failed += 1;
  else if (status === "running") agg.running += 1;
  else agg.incomplete += 1;
};

type CoreMetric = (typeof CORE_USAGE_METRICS)[number];

const bumpSliceDenominators = (
  agg: ModelAgg,
  usage: RunMetadata["usage"],
  metric: CoreMetric,
) => {
  const sliceKnown = usage.knownSlices?.[metric] ?? 0;
  const expected = usage.expectedSlices;
  if (metric === "input") {
    agg.inputKnownSlices += sliceKnown;
    agg.inputExpectedSlices += expected;
  } else if (metric === "output") {
    agg.outputKnownSlices += sliceKnown;
    agg.outputExpectedSlices += expected;
  } else if (metric === "cacheRead") {
    agg.cacheReadKnownSlices += sliceKnown;
    agg.cacheReadExpectedSlices += expected;
  } else {
    agg.cacheWriteKnownSlices += sliceKnown;
    agg.cacheWriteExpectedSlices += expected;
  }
};

const bumpKnownMetric = (
  agg: ModelAgg,
  usage: RunMetadata["usage"],
  metric: CoreMetric,
) => {
  bumpSliceDenominators(agg, usage, metric);
  if (!metricKnown(usage, metric)) return;
  if (metric === "input") {
    agg.usageRunsWithInput += 1;
    agg.inputKnownRuns += 1;
    agg.inputSum = bumpMetricSum(agg.inputSum, usage.input);
  } else if (metric === "output") {
    agg.outputKnownRuns += 1;
    agg.outputSum = bumpMetricSum(agg.outputSum, usage.output);
  } else if (metric === "cacheRead") {
    agg.cacheReadKnownRuns += 1;
    agg.cacheReadSum = bumpMetricSum(agg.cacheReadSum, usage.cacheRead);
  } else {
    agg.cacheWriteKnownRuns += 1;
    agg.cacheWriteSum = bumpMetricSum(agg.cacheWriteSum, usage.cacheWrite);
  }
};

const applyUsageCost = (
  agg: ModelAgg,
  usage: RunMetadata["usage"],
  executionStatus: ExecutionStatus,
) => {
  const expected = usage.expectedSlices;
  const costKnown = usage.knownSlices?.estimatedCostUsd ?? 0;
  agg.costExpectedSlices += expected;
  agg.costKnownSlices += costKnown;
  if (expected > 0) agg.costExpectedRuns += 1;
  const runCostFull = executionStatus === "completed" && expected > 0 &&
    costKnown === expected;
  if (runCostFull) agg.costFullRuns += 1;
  if (usage.estimatedCostUsd !== undefined && costKnown > 0) {
    agg.costSubtotalUsd = bumpMetricSum(
      agg.costSubtotalUsd,
      usage.estimatedCostUsd,
    );
  }
};

const applyUsageTotals = (agg: ModelAgg, r: RunMetadata) => {
  const usage = r.usage;
  for (const metric of CORE_USAGE_METRICS) {
    bumpKnownMetric(agg, usage, metric);
  }
  applyUsageCost(agg, usage, r.executionStatus);
};

const refreshUsageDisplays = (agg: ModelAgg) => {
  agg.inputDisplay = displayMetric(agg.inputSum, agg.inputKnownRuns);
  agg.outputDisplay = displayMetric(agg.outputSum, agg.outputKnownRuns);
  agg.cacheReadDisplay = displayMetric(
    agg.cacheReadSum,
    agg.cacheReadKnownRuns,
  );
  agg.cacheWriteDisplay = displayMetric(
    agg.cacheWriteSum,
    agg.cacheWriteKnownRuns,
  );
  if (
    agg.costExpectedRuns > 0 &&
    agg.costFullRuns === agg.costExpectedRuns &&
    agg.costKnownSlices === agg.costExpectedSlices
  ) {
    agg.costLabel = "full-estimate-subtotal";
  } else if (agg.costSubtotalUsd !== undefined) {
    agg.costLabel = "partial-estimate-subtotal";
  } else {
    agg.costLabel = "unknown";
  }
};

const applyRecordToAgg = (agg: ModelAgg, r: RunMetadata) => {
  agg.runs += 1;
  applyExecutionStatus(agg, r.executionStatus);
  const elapsed = readFiniteNonNeg(r.elapsedMs);
  if (r.executionStatus !== "running" && elapsed !== undefined) {
    agg.elapsedKnown += 1;
    const list = agg._elapsed ??= [];
    list.push(elapsed);
  }
  applyUsageTotals(agg, r);
  bumpParent(agg, r.parentValidationStatus ?? "unverified");
};

const finalizeModelAgg = (agg: ModelAgg) => {
  const list = agg._elapsed ?? [];
  agg.elapsedMedianMs = median(list);
  agg.elapsedMeanMs = mean(list);
  delete agg._elapsed;
  refreshUsageDisplays(agg);
};

const aggregateByModel = (records: RunMetadata[]): ModelAgg[] => {
  const map = new Map<string, ModelAgg>();
  for (const r of records) {
    const key = r.resolvedModel;
    let agg = map.get(key);
    if (!agg) {
      agg = newModelAgg(key);
      map.set(key, agg);
    }
    applyRecordToAgg(agg, r);
  }
  const out = [...map.values()];
  for (const agg of out) finalizeModelAgg(agg);
  return out.sort((a, b) => a.resolvedModel.localeCompare(b.resolvedModel));
};

type CaseModelSummary = {
  resolvedModel: string;
  runs: number;
  elapsedMedianMs?: number;
};

type CaseGroup = {
  caseKey: string;
  displayLabel: string;
  promptSha256: string;
  systemPromptSha256: string;
  matched: boolean;
  models: string[];
  runCount: number;
  modelSummaries?: CaseModelSummary[];
};

const caseGroupKey = (r: RunMetadata, matched: boolean) =>
  matched
    ? `${r.promptSha256}:${r.systemPromptSha256}:${r.codeProvenance.revisionKind}:${
      r.codeProvenance.startRevision ?? ""
    }:${r.codeProvenance.repositoryPath}`
    : `hetero:${r.promptSha256}:${r.systemPromptSha256}:${r.runId}`;

const displayCaseLabel = (caseKey: string) =>
  caseKey.length <= 24
    ? caseKey
    : `${caseKey.slice(0, 10)}…${caseKey.slice(-10)}`;

const summarizeModelsInCase = (
  records: RunMetadata[],
): CaseModelSummary[] | undefined => {
  const byModel = new Map<string, number[]>();
  for (const r of records) {
    if (r.executionStatus === "running") continue;
    const elapsed = readFiniteNonNeg(r.elapsedMs);
    if (elapsed === undefined) continue;
    const list = byModel.get(r.resolvedModel) ?? [];
    list.push(elapsed);
    byModel.set(r.resolvedModel, list);
  }
  if (byModel.size < 2) return undefined;
  return [...byModel.entries()].map(([resolvedModel, elapsed]) => ({
    resolvedModel,
    runs: elapsed.length,
    elapsedMedianMs: median(elapsed),
  })).sort((a, b) => a.resolvedModel.localeCompare(b.resolvedModel));
};

const buildCaseGroups = (records: RunMetadata[]): CaseGroup[] => {
  const map = new Map<string, { group: CaseGroup; records: RunMetadata[] }>();
  for (const r of records) {
    const matched = provenanceIsMatched(r.codeProvenance);
    const key = caseGroupKey(r, matched);
    let entry = map.get(key);
    if (!entry) {
      entry = {
        group: {
          caseKey: key,
          displayLabel: displayCaseLabel(key),
          promptSha256: r.promptSha256,
          systemPromptSha256: r.systemPromptSha256,
          matched,
          models: [],
          runCount: 0,
        },
        records: [],
      };
      map.set(key, entry);
    }
    entry.group.runCount += 1;
    entry.records.push(r);
    if (!entry.group.models.includes(r.resolvedModel)) {
      entry.group.models.push(r.resolvedModel);
    }
  }
  return [...map.values()].map(({ group, records: rs }) => {
    if (group.matched && group.models.length >= 2) {
      group.modelSummaries = summarizeModelsInCase(rs);
    }
    return group;
  });
};

export type ImplReport = {
  generatedAt: string;
  runsRoot: string;
  hasData: boolean;
  excluded: { path: string; reason: string }[];
  modelSummaries: ModelAgg[];
  caseGroups: CaseGroup[];
  warnings: string[];
};

export function buildReport(runsRoot: string, loaded: LoadResult): ImplReport {
  const warnings: string[] = [
    "グローバル集計は異質ランの混合であり、品質比較ではありません。",
  ];
  if (loaded.excluded.length > 0) {
    warnings.push(`除外された記録: ${loaded.excluded.length} 件`);
  }
  const matchedGroups = buildCaseGroups(loaded.records).filter((g) =>
    g.matched
  );
  for (const g of matchedGroups) {
    if (g.models.length < 2) {
      warnings.push(
        `一致ケース ${g.caseKey}: モデル数が少なく比較には不十分です`,
      );
    }
  }
  const unverified =
    loaded.records.filter((r) => r.parentValidationStatus === "unverified")
      .length;
  if (unverified > 0) {
    warnings.push(
      `親検証未記録の run が ${unverified} 件あります（passed/failed/not-run は手動記録）`,
    );
  }
  return {
    generatedAt: new Date().toISOString(),
    runsRoot,
    hasData: loaded.records.length > 0,
    excluded: loaded.excluded,
    modelSummaries: aggregateByModel(loaded.records),
    caseGroups: buildCaseGroups(loaded.records),
    warnings,
  };
}

const formatMetric = (value: MetricDisplay) =>
  value === "unknown" ? "unknown" : String(value);

export function renderReportHtml(report: ImplReport): string {
  const noData = !report.hasData
    ? `<p class="no-data">実装履歴がありません</p>`
    : "";
  const warn = report.warnings.length > 0
    ? `<section><h2>注意</h2><ul>${
      report.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")
    }</ul></section>`
    : "";
  const modelRows = report.modelSummaries.map((m) =>
    `<tr>
      <td>${escapeHtml(m.resolvedModel)}</td>
      <td>${m.runs}</td>
      <td>${m.completed}</td>
      <td>${m.failed}</td>
      <td>${m.incomplete}</td>
      <td>${m.running}</td>
      <td>${
      m.elapsedKnown > 0 ? (m.elapsedMedianMs ?? "unknown") : "unknown"
    }</td>
      <td>${m.elapsedKnown}/${m.runs}</td>
      <td>${
      formatMetric(m.inputDisplay)
    } (${m.inputKnownSlices}/${m.inputExpectedSlices} slices, ${m.inputKnownRuns}/${m.runs} runs)</td>
      <td>${
      formatMetric(m.outputDisplay)
    } (${m.outputKnownSlices}/${m.outputExpectedSlices} slices, ${m.outputKnownRuns}/${m.runs} runs)</td>
      <td>${
      formatMetric(m.cacheReadDisplay)
    } (${m.cacheReadKnownSlices}/${m.cacheReadExpectedSlices} slices, ${m.cacheReadKnownRuns}/${m.runs} runs)</td>
      <td>${
      formatMetric(m.cacheWriteDisplay)
    } (${m.cacheWriteKnownSlices}/${m.cacheWriteExpectedSlices} slices, ${m.cacheWriteKnownRuns}/${m.runs} runs)</td>
      <td>${
      escapeHtml(m.costLabel)
    } (${m.costKnownSlices}/${m.costExpectedSlices} slices)</td>
      <td>${
      m.costSubtotalUsd === undefined ? "unknown" : m.costSubtotalUsd.toFixed(4)
    }</td>
      <td>${m.parent.passed}/${m.parent.failed}/${
      m.parent["not-run"]
    }/${m.parent.unverified}</td>
    </tr>`
  ).join("");
  const caseRows = report.caseGroups.map((c) => {
    const perModel = c.modelSummaries?.map((ms) =>
      `${escapeHtml(ms.resolvedModel)}:${ms.elapsedMedianMs ?? "unknown"}ms`
    ).join("; ") ?? "";
    return `<tr>
      <td title="${escapeHtml(c.caseKey)}">${escapeHtml(c.displayLabel)}</td>
      <td>${c.matched ? "一致" : "異質"}</td>
      <td>${c.runCount}</td>
      <td>${c.models.length}</td>
      <td>${escapeHtml(c.models.join(", "))}</td>
      <td>${escapeHtml(perModel)}</td>
    </tr>`;
  }).join("");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<title>実装モデル比較レポート</title>
<style>
body{font-family:system-ui,sans-serif;margin:1.5rem;line-height:1.5}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border:1px solid #ccc;padding:.4rem .6rem;text-align:left;font-size:.9rem}
th{background:#f4f4f4}
.no-data{color:#666}
.note{font-size:.85rem;color:#444}
</style>
</head>
<body>
<h1>実装モデル比較レポート（オフライン）</h1>
<p class="note">コストは観測できたスライスの推定 USD 小計であり、全スライス未観測時は unknown、実際のサブスクリプション請求ではありません。勝者判定や正確性評価は行いません。</p>
<p>生成: ${escapeHtml(report.generatedAt)}</p>
<p>履歴: ${escapeHtml(report.runsRoot)}</p>
${warn}
${noData}
<section>
<h2>モデル別集計（全体・異質混合）</h2>
<table>
<tr><th>モデル</th><th>runs</th><th>completed</th><th>failed</th><th>incomplete</th><th>running</th>
<th>elapsed中央値ms</th><th>elapsed既知</th><th>input</th><th>output</th><th>cacheRead</th><th>cacheWrite</th><th>cost区分</th><th>推定USD小計</th><th>親検証 p/f/n/u</th></tr>
${modelRows}
</table>
</section>
<section>
<h2>タスク / ケースグループ</h2>
<table>
<tr><th>キー</th><th>区分</th><th>runs</th><th>モデル数</th><th>モデル</th><th>一致群内 per-model elapsed中央値</th></tr>
${caseRows}
</table>
</section>
</body>
</html>`;
}

export const toReportArtifact = (report: ImplReport) => ({
  generatedAt: report.generatedAt,
  runsRoot: report.runsRoot,
  hasData: report.hasData,
  excluded: report.excluded.map((e) => ({ path: e.path, reason: e.reason })),
  modelSummaries: report.modelSummaries.map((m) => ({
    resolvedModel: m.resolvedModel,
    runs: m.runs,
    completed: m.completed,
    failed: m.failed,
    incomplete: m.incomplete,
    running: m.running,
    elapsedKnown: m.elapsedKnown,
    elapsedMedianMs: m.elapsedMedianMs,
    elapsedMeanMs: m.elapsedMeanMs,
    inputDisplay: m.inputDisplay,
    outputDisplay: m.outputDisplay,
    cacheReadDisplay: m.cacheReadDisplay,
    cacheWriteDisplay: m.cacheWriteDisplay,
    inputKnownSlices: m.inputKnownSlices,
    inputExpectedSlices: m.inputExpectedSlices,
    inputKnownRuns: m.inputKnownRuns,
    outputKnownSlices: m.outputKnownSlices,
    outputExpectedSlices: m.outputExpectedSlices,
    outputKnownRuns: m.outputKnownRuns,
    cacheReadKnownSlices: m.cacheReadKnownSlices,
    cacheReadExpectedSlices: m.cacheReadExpectedSlices,
    cacheReadKnownRuns: m.cacheReadKnownRuns,
    cacheWriteKnownSlices: m.cacheWriteKnownSlices,
    cacheWriteExpectedSlices: m.cacheWriteExpectedSlices,
    cacheWriteKnownRuns: m.cacheWriteKnownRuns,
    costLabel: m.costLabel,
    costSubtotalUsd: m.costSubtotalUsd,
    costKnownSlices: m.costKnownSlices,
    costExpectedSlices: m.costExpectedSlices,
    parent: m.parent,
  })),
  caseGroups: report.caseGroups.map((c) => ({
    caseKey: c.caseKey,
    displayLabel: c.displayLabel,
    promptSha256: c.promptSha256,
    systemPromptSha256: c.systemPromptSha256,
    matched: c.matched,
    models: c.models,
    runCount: c.runCount,
    modelSummaries: c.modelSummaries,
  })),
  warnings: report.warnings,
});

const expandHome = (path: string) => {
  if (!path.startsWith("~/")) return path;
  const home = Deno.env.get("HOME") ?? "";
  return join(home, path.slice(2));
};

export const resolveDefaultRunsDir = () => {
  const impl = Deno.env.get("IMPL_RUNS_DIR");
  if (impl !== undefined && impl !== "") {
    return resolve(expandHome(impl));
  }
  const xdg = Deno.env.get("XDG_DATA_HOME");
  const home = Deno.env.get("HOME") ?? "";
  const base = xdg !== undefined && xdg !== ""
    ? expandHome(xdg)
    : join(home, ".local/share");
  return join(base, "impl", "runs");
};

const realPathIfExists = async (path: string) => {
  try {
    return await Deno.realPath(path);
  } catch {
    return resolve(path);
  }
};

const assertOutputOutsideRuns = async (outDir: string, runsRoot: string) => {
  const outAbs = resolve(outDir);
  const runsAbs = await realPathIfExists(runsRoot);
  const outReal = await realPathIfExists(dirname(outAbs));
  const outLeaf = basename(outAbs);
  const combined = resolve(outReal, outLeaf);
  if (combined === runsAbs || combined.startsWith(`${runsAbs}/`)) {
    throw new Error("output must not be inside runs tree");
  }
};

const assertOutputParentReady = async (parent: string) => {
  const parentStat = await Deno.lstat(parent).catch((e) => {
    if (e instanceof Deno.errors.NotFound) {
      throw new Error("output parent directory missing");
    }
    throw e;
  });
  if (!parentStat.isDirectory || parentStat.isSymlink) {
    throw new Error("output parent invalid");
  }
};

const assertOutputLeafAvailable = async (outDir: string) => {
  try {
    const existing = await Deno.lstat(outDir);
    if (existing.isSymlink) throw new Error("output path is symlink");
    throw new Error("output directory already exists");
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return;
    throw e;
  }
};

const assertExclusiveOutputDir = async (outDir: string) => {
  const leaf = basename(outDir);
  if (!leaf || leaf === "." || leaf === "..") {
    throw new Error("invalid output directory");
  }
  await assertOutputParentReady(dirname(outDir));
  await assertOutputLeafAvailable(outDir);
};

export async function writeReport(
  outDir: string,
  report: ImplReport,
  runsRoot = report.runsRoot,
) {
  await assertOutputOutsideRuns(outDir, runsRoot);
  await assertExclusiveOutputDir(outDir);
  const parent = dirname(outDir);
  const leaf = basename(outDir);
  await Deno.mkdir(join(parent, leaf), { recursive: false, mode: 0o700 });
  const artifact = toReportArtifact(report);
  await Deno.writeTextFile(
    join(outDir, "report.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
    { mode: 0o600, createNew: true },
  );
  await Deno.writeTextFile(
    join(outDir, "report.html"),
    renderReportHtml(report),
    { mode: 0o600, createNew: true },
  );
}

export function assertSetValidationStatus(
  status: string,
): asserts status is Exclude<ParentValidationStatus, "unverified"> {
  if (!SETTABLE_PARENT.has(status)) {
    throw new Error("invalid parent validation status");
  }
}

export async function setValidationStatus(
  runDir: string,
  status: Exclude<ParentValidationStatus, "unverified">,
) {
  assertSetValidationStatus(status);
  const metaPath = join(runDir, "metadata.json");
  const text = await Deno.readTextFile(metaPath);
  const parsed = JSON.parse(text) as unknown;
  const validated = validateRunMetadata(parsed);
  if (!validated.ok) throw new Error("invalid metadata");
  if (status === "passed" && validated.ok.executionStatus !== "completed") {
    throw new Error("cannot mark non-completed run as passed");
  }
  validated.ok.parentValidationStatus = status;
  const recheck = validateRunMetadata(validated.ok);
  if (!recheck.ok) throw new Error("invalid metadata after update");
  const tmp = join(runDir, `.metadata.${crypto.randomUUID()}.tmp`);
  try {
    await Deno.writeTextFile(tmp, `${JSON.stringify(recheck.ok, null, 2)}\n`, {
      mode: 0o600,
      createNew: true,
    });
    await Deno.rename(tmp, metaPath);
    await Deno.chmod(metaPath, 0o600);
  } catch (e) {
    try {
      await Deno.remove(tmp);
    } catch { /* ignore */ }
    throw e;
  }
}

async function cmdReport(runsDir: string, outDir: string) {
  const loaded = await loadRunMetadataFromRoot(runsDir);
  const report = buildReport(runsDir, loaded);
  await writeReport(outDir, report, runsDir);
}

async function cmdSetValidation(runPath: string, status: string) {
  assertSetValidationStatus(status);
  await setValidationStatus(runPath, status);
}

const readFlag = (args: string[], flag: string) => {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--") || value.length === 0) {
    throw new Error(`missing value for ${flag}`);
  }
  return value;
};

const assertOnlyKnownFlags = (args: string[], allowed: string[]) => {
  const allowedSet = new Set(allowed);
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      throw new Error("unexpected argument");
    }
    if (!allowedSet.has(arg)) throw new Error(`unknown flag: ${arg}`);
    if (seen.has(arg)) throw new Error(`duplicate flag: ${arg}`);
    seen.add(arg);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--") || value.length === 0) {
      throw new Error(`missing value for ${arg}`);
    }
    i += 1;
  }
};

const cliFail = (message: string): never => {
  console.error(message);
  Deno.exit(1);
};

export function parseReportCliArgs(rest: string[]) {
  assertOnlyKnownFlags(rest, ["--runs-dir", "--out"]);
  const outDir = readFlag(rest, "--out");
  if (!outDir) {
    throw new Error(
      "usage: impl_history.ts report [--runs-dir PATH] --out PATH",
    );
  }
  const runsDir = readFlag(rest, "--runs-dir") ?? resolveDefaultRunsDir();
  return { outDir, runsDir };
}

async function mainReport(rest: string[]) {
  try {
    const { outDir, runsDir } = parseReportCliArgs(rest);
    await cmdReport(runsDir, outDir);
  } catch (e) {
    cliFail(e instanceof Error ? e.message : "invalid arguments");
  }
}

async function mainSetValidation(rest: string[]) {
  try {
    assertOnlyKnownFlags(rest, ["--run", "--status"]);
  } catch (e) {
    cliFail(e instanceof Error ? e.message : "invalid arguments");
  }
  const runPath = readFlag(rest, "--run");
  const status = readFlag(rest, "--status");
  if (!runPath || !status) {
    cliFail(
      "usage: impl_history.ts set-validation --run PATH --status passed|failed|not-run",
    );
  }
  await cmdSetValidation(runPath!, status!);
}

async function main() {
  const [sub, ...rest] = Deno.args;
  if (sub === "report") {
    await mainReport(rest);
    return;
  }
  if (sub === "set-validation") {
    await mainSetValidation(rest);
    return;
  }
  cliFail("unknown subcommand");
}

if (import.meta.main) {
  await main().catch((err) => {
    console.error(err instanceof Error ? err.message : "impl_history failed");
    Deno.exit(1);
  });
}
