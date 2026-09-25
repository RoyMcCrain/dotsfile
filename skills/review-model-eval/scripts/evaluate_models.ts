import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  getRunsBaseDir,
  parseLevel,
  validateSnapshot,
} from "../../parallel-review/scripts/review_history.ts";
import { renderReportHtml } from "./render_report.ts";

type Snapshot = ReturnType<typeof validateSnapshot>;
type Decision = "accepted" | "rejected" | "deferred" | "pending" | "conflict";
type Verification =
  | "confirmed"
  | "contradicted"
  | "inconclusive"
  | "not_checked"
  | "conflict";
type Action = "fixed" | "not_fixed" | "unknown" | "conflict";

export type SelectedRun = {
  runDir: string;
  snapshotPath: string;
  snapshotSha256: string;
  snapshot: Snapshot;
};

export type LoadResult = {
  selected: SelectedRun[];
  warnings: string[];
  excludedRunDirs: number;
  excludedSnapshots: number;
};

type DimensionCounts<T extends string> = Record<T, number>;

export type ModelSummary = {
  backend: string;
  model: string;
  level: 1 | 2 | 3;
  actorKind: "agent" | "human";
  actorIds: string[];
  distinctBenchmarks: number;
  runs: number;
  cases: number;
  issues: {
    unique: number;
    rawFindings: number;
    decisions: DimensionCounts<Decision>;
    verifications: DimensionCounts<Verification>;
    actions: DimensionCounts<Action>;
  };
  adoption: { numerator: number; denominator: number; rate?: number };
  verificationConfirmation: {
    numerator: number;
    denominator: number;
    rate?: number;
    label: string;
  };
  verificationCoverage: {
    numerator: number;
    denominator: number;
    rate?: number;
  };
  actions: DimensionCounts<"fixed" | "not_fixed" | "unknown" | "conflict">;
  executions: {
    total: number;
    completed: number;
    successful: number;
    failed: number;
    timeouts: number;
    unfinished: number;
    no_findings: number;
    unparsed: number;
    successRate?: number;
    failureRate?: number;
    timeoutRate?: number;
    medianElapsedSeconds?: number;
  };
};

export type CaseRow = {
  runId: string;
  runDir: string;
  snapshotPath: string;
  repository: string;
  revision: string;
  level: 1 | 2 | 3;
  actorKind: "agent" | "human";
  actorId: string;
  backend: string;
  model: string;
  createdAt: string;
  savedAt: string;
  patchSha256: string;
  promptSha256: string;
  chunkHashes: string[];
  coverageKey: string;
  completedParsed: boolean;
  comparableForQuality: boolean;
  issueCount: number;
  executionCount: number;
  issues: {
    unique: number;
    decisions: DimensionCounts<Decision>;
    verifications: DimensionCounts<Verification>;
    actions: DimensionCounts<Action>;
  };
  adoption: { numerator: number; denominator: number; rate?: number };
};

export type EvaluationReport = {
  schemaVersion: 1;
  reportType: "review-model-evaluation";
  generatedAt: string;
  inputDirectory: string;
  sources: Array<{
    runId: string;
    runDir: string;
    snapshotPath: string;
    snapshotSha256: string;
    savedAt: string;
  }>;
  excluded: { runDirs: number; snapshots: number };
  warnings: string[];
  overview: {
    hasData: boolean;
    selectedRuns: number;
    modelGroups: number;
    warningCount: number;
  };
  modelSummaries: ModelSummary[];
  cases: CaseRow[];
  methodology: {
    notes: string[];
  };
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const sha256Bytes = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const rate = (numerator: number, denominator: number): number | undefined =>
  denominator > 0 ? numerator / denominator : undefined;

const median = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const savedAtMs = (savedAt: string): number => Date.parse(savedAt);

const consolidate = (
  values: string[],
  defaultValue: string,
): string | "conflict" => {
  const normalized = values.map((v) => v || defaultValue);
  const unique = new Set(normalized);
  if (unique.size === 1) return [...unique][0];
  return "conflict";
};

const isNotFoundError = (error: unknown): boolean => {
  if (error instanceof Deno.errors.NotFound) return true;
  if (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  ) {
    return true;
  }
  return false;
};

const isPathInside = (parent: string, child: string): boolean => {
  const rel = relative(parent, child);
  return rel === "" ||
    (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel));
};

const resolveExistingPath = async (path: string): Promise<string> => {
  let remaining = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try {
      await lstat(remaining);
      const resolved = await realpath(remaining);
      return suffix.length === 0
        ? resolved
        : join(resolved, ...suffix.reverse());
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      suffix.push(basename(remaining));
      const parent = dirname(remaining);
      if (parent === remaining) return resolve(path);
      remaining = parent;
    }
  }
};

const parseArgs = (
  args: string[],
): { runsDir?: string; outDir?: string; help: boolean } => {
  let runsDir: string | undefined;
  let outDir: string | undefined;
  let sawRunsDir = false;
  let sawOut = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--runs-dir") {
      if (sawRunsDir) throw new Error("duplicate --runs-dir");
      sawRunsDir = true;
      runsDir = args[++i];
      if (!isNonEmptyString(runsDir) || runsDir.startsWith("-")) {
        throw new Error("--runs-dir requires a path");
      }
      continue;
    }
    if (arg === "--out") {
      if (sawOut) throw new Error("duplicate --out");
      sawOut = true;
      outDir = args[++i];
      if (!isNonEmptyString(outDir) || outDir.startsWith("-")) {
        throw new Error("--out requires a path");
      }
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return { runsDir, outDir, help: false };
};

const defaultOutDir = (): string => {
  const runsBase = getRunsBaseDir();
  const reportsBase = join(runsBase, "..", "reports");
  const date = new Date().toISOString().slice(0, 10);
  return join(reportsBase, `${date}-${randomUUID()}`);
};

const readSnapshotFile = async (
  runDir: string,
  fileName: string,
): Promise<{ snapshot: Snapshot; sha256: string; path: string } | null> => {
  const path = join(runDir, "snapshots", fileName);
  try {
    const lstat = await Deno.lstat(path);
    if (lstat.isSymlink) return null;
    if (!lstat.isFile) return null;
    const content = await readFile(path);
    const parsed = validateSnapshot(
      JSON.parse(new TextDecoder().decode(content)),
    );
    return { snapshot: parsed, sha256: sha256Bytes(content), path };
  } catch {
    return null;
  }
};

const selectLatestInRun = (
  runDir: string,
  candidates: Array<{ snapshot: Snapshot; sha256: string; path: string }>,
): { selected?: SelectedRun; warning?: string } => {
  if (candidates.length === 0) {
    return { warning: `${runDir}: no valid snapshots` };
  }
  const maxMs = Math.max(
    ...candidates.map((c) => savedAtMs(c.snapshot.savedAt)),
  );
  const atMax = candidates.filter((c) =>
    savedAtMs(c.snapshot.savedAt) === maxMs
  );
  if (atMax.length === 1) {
    const one = atMax[0];
    return {
      selected: {
        runDir,
        snapshotPath: one.path,
        snapshotSha256: one.sha256,
        snapshot: one.snapshot,
      },
    };
  }
  const allEqual = atMax.every((c) =>
    isDeepStrictEqual(c.snapshot, atMax[0].snapshot)
  );
  if (allEqual) {
    const one = atMax.sort((a, b) => a.path.localeCompare(b.path))[0];
    return {
      selected: {
        runDir,
        snapshotPath: one.path,
        snapshotSha256: one.sha256,
        snapshot: one.snapshot,
      },
    };
  }
  return {
    warning: `${runDir}: ambiguous latest snapshot tie at savedAt ${
      atMax[0].snapshot.savedAt
    }`,
  };
};

export const loadSelectedRuns = async (
  runsDir: string,
): Promise<LoadResult> => {
  const warnings: string[] = [];
  let excludedRunDirs = 0;
  let excludedSnapshots = 0;

  let entries: string[];
  try {
    entries = (await readdir(runsDir)).sort();
  } catch (error) {
    if (isNotFoundError(error)) {
      return { selected: [], warnings, excludedRunDirs, excludedSnapshots };
    }
    if (error instanceof Deno.errors.PermissionDenied) {
      throw new Error(`runs directory unreadable: ${runsDir}`);
    }
    throw error;
  }

  const perRun: SelectedRun[] = [];

  for (const name of entries) {
    const runDir = join(runsDir, name);
    let lstat: Deno.FileInfo;
    try {
      lstat = await Deno.lstat(runDir);
    } catch {
      warnings.push(`${runDir}: unreadable run directory`);
      excludedRunDirs++;
      continue;
    }
    if (lstat.isSymlink) {
      warnings.push(`${runDir}: symlink run directory skipped`);
      excludedRunDirs++;
      continue;
    }
    if (!lstat.isDirectory) continue;

    const snapshotsDir = join(runDir, "snapshots");
    let snapLstat: Deno.FileInfo | null = null;
    try {
      snapLstat = await Deno.lstat(snapshotsDir);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        warnings.push(`${runDir}: no snapshots directory`);
        excludedRunDirs++;
        continue;
      }
      warnings.push(`${runDir}: unreadable snapshots directory`);
      excludedRunDirs++;
      continue;
    }
    if (snapLstat.isSymlink) {
      warnings.push(`${runDir}: snapshots directory is symlink`);
      excludedRunDirs++;
      continue;
    }

    let snapFiles: string[];
    try {
      snapFiles = (await readdir(snapshotsDir)).filter((f) =>
        f.endsWith(".json")
      ).sort();
    } catch {
      warnings.push(`${runDir}: unreadable snapshots`);
      excludedRunDirs++;
      continue;
    }
    if (snapFiles.length === 0) {
      warnings.push(`${runDir}: no snapshot files`);
      excludedRunDirs++;
      continue;
    }

    const valid: Array<{ snapshot: Snapshot; sha256: string; path: string }> =
      [];
    let invalidInRun = false;
    for (const fileName of snapFiles) {
      const filePath = join(snapshotsDir, fileName);
      try {
        const fileLstat = await Deno.lstat(filePath);
        if (fileLstat.isSymlink) {
          warnings.push(`${filePath}: symlink snapshot skipped`);
          excludedSnapshots++;
          invalidInRun = true;
          continue;
        }
      } catch {
        warnings.push(`${filePath}: unreadable snapshot`);
        excludedSnapshots++;
        invalidInRun = true;
        continue;
      }
      const parsed = await readSnapshotFile(runDir, fileName);
      if (!parsed) {
        warnings.push(`${filePath}: invalid or corrupt snapshot`);
        excludedSnapshots++;
        invalidInRun = true;
        continue;
      }
      valid.push(parsed);
    }

    if (invalidInRun) {
      warnings.push(`${runDir}: run excluded due to invalid snapshot(s)`);
      excludedRunDirs++;
      continue;
    }

    const runIds = new Set(valid.map((v) => v.snapshot.runId));
    if (runIds.size > 1) {
      warnings.push(
        `${runDir}: multiple runIds in snapshots (${
          [...runIds].sort().join(", ")
        }); run excluded`,
      );
      excludedRunDirs++;
      continue;
    }

    const pick = selectLatestInRun(runDir, valid);
    if (pick.warning) {
      warnings.push(pick.warning);
      excludedRunDirs++;
      continue;
    }
    if (pick.selected) perRun.push(pick.selected);
  }

  const byRunId = new Map<string, SelectedRun[]>();
  for (const item of perRun) {
    const list = byRunId.get(item.snapshot.runId) ?? [];
    list.push(item);
    byRunId.set(item.snapshot.runId, list);
  }

  const selected: SelectedRun[] = [];
  for (
    const [runId, items] of [...byRunId.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )
  ) {
    if (items.length === 1) {
      selected.push(items[0]);
      continue;
    }
    const allEqual = items.every((i) =>
      isDeepStrictEqual(i.snapshot, items[0].snapshot)
    );
    if (allEqual) {
      const one = items.sort((a, b) => a.runDir.localeCompare(b.runDir))[0];
      selected.push(one);
      warnings.push(
        `duplicate runId ${runId} in ${items.length} folders; identical content counted once`,
      );
      continue;
    }
    warnings.push(
      `duplicate runId ${runId} with conflicting snapshots; all excluded`,
    );
    excludedRunDirs += items.length;
  }

  selected.sort((a, b) => {
    const byRun = a.snapshot.runId.localeCompare(b.snapshot.runId);
    if (byRun !== 0) return byRun;
    return a.runDir.localeCompare(b.runDir);
  });

  return { selected, warnings, excludedRunDirs, excludedSnapshots };
};

const buildCasesForRun = (item: SelectedRun): CaseRow[] => {
  const { snapshot, runDir, snapshotPath } = item;
  const metadata = snapshot.metadata;
  const level = parseLevel(metadata.level);
  const createdAt = metadata.createdAt as string;
  const repository = metadata.repository as string;
  const revision = metadata.revision as string;
  const reviewByExec = new Map(
    snapshot.reviews.map((review) => [review.executionId, review]),
  );

  const modelExecs = new Map<string, typeof snapshot.executions>();
  for (const exec of snapshot.executions) {
    const key = `${exec.backend}\0${exec.model}`;
    const list = modelExecs.get(key) ?? [];
    list.push(exec);
    modelExecs.set(key, list);
  }

  const rows: CaseRow[] = [];
  for (
    const [key, execs] of [...modelExecs.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )
  ) {
    const [backend, model] = key.split("\0");
    const chunkHashes = [...new Set(execs.map((e) => e.files.chunk.sha256))]
      .sort();
    const coverageKey = chunkHashes.join(",");
    let completedParsed = true;
    let hasParsed = false;
    for (const exec of execs) {
      const review = reviewByExec.get(exec.id)!;
      const failed = exec.status !== "completed" || exec.exitCode !== 0;
      if (failed || review.verdict === "unavailable") {
        completedParsed = false;
        continue;
      }
      if (review.verdict === "unparsed") completedParsed = false;
      if (review.verdict === "findings" || review.verdict === "no_findings") {
        hasParsed = true;
      }
    }
    if (!hasParsed) completedParsed = false;

    const issueSummary = summarizeIssues(dedupeIssues(item, backend, model));

    rows.push({
      runId: snapshot.runId,
      runDir,
      snapshotPath,
      repository,
      revision,
      level,
      actorKind: snapshot.actor.kind,
      actorId: snapshot.actor.id,
      backend,
      model,
      createdAt,
      savedAt: snapshot.savedAt,
      patchSha256: snapshot.files.patch.sha256,
      promptSha256: snapshot.files.prompt.sha256,
      chunkHashes,
      coverageKey,
      completedParsed,
      comparableForQuality: false,
      issueCount: issueSummary.unique,
      executionCount: execs.length,
      issues: {
        unique: issueSummary.unique,
        decisions: issueSummary.decisions,
        verifications: issueSummary.verifications,
        actions: issueSummary.actions,
      },
      adoption: issueSummary.adoption,
    });
  }
  return rows;
};

type DedupedIssue = {
  runId: string;
  backend: string;
  model: string;
  issueKey: string;
  decision: Decision;
  verification: Verification;
  action: Action;
  rawFindings: number;
};

const dedupeIssues = (
  item: SelectedRun,
  backend: string,
  model: string,
): DedupedIssue[] => {
  const { snapshot } = item;
  const execById = new Map(snapshot.executions.map((e) => [e.id, e]));
  const grouped = new Map<
    string,
    Array<(typeof snapshot.reviews)[0]["findings"][0]>
  >();

  for (const review of snapshot.reviews) {
    const exec = execById.get(review.executionId);
    if (!exec || exec.backend !== backend || exec.model !== model) continue;
    for (const finding of review.findings) {
      const list = grouped.get(finding.issueKey) ?? [];
      list.push(finding);
      grouped.set(finding.issueKey, list);
    }
  }

  const issues: DedupedIssue[] = [];
  for (
    const [issueKey, findings] of [...grouped.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )
  ) {
    const decision = consolidate(
      findings.map((f) => f.decision),
      "pending",
    ) as Decision;
    const verification = consolidate(
      findings.map((f) => f.verification ?? "not_checked"),
      "not_checked",
    ) as Verification;
    const action = consolidate(
      findings.map((f) => f.action ?? "unknown"),
      "unknown",
    ) as Action;
    issues.push({
      runId: snapshot.runId,
      backend,
      model,
      issueKey,
      decision,
      verification,
      action,
      rawFindings: findings.length,
    });
  }
  return issues;
};

const emptyDecisionCounts = (): DimensionCounts<Decision> => ({
  accepted: 0,
  rejected: 0,
  deferred: 0,
  pending: 0,
  conflict: 0,
});

const emptyVerificationCounts = (): DimensionCounts<Verification> => ({
  confirmed: 0,
  contradicted: 0,
  inconclusive: 0,
  not_checked: 0,
  conflict: 0,
});

const emptyActionCounts = (): DimensionCounts<Action> => ({
  fixed: 0,
  not_fixed: 0,
  unknown: 0,
  conflict: 0,
});

const summarizeIssues = (issues: DedupedIssue[]) => {
  const decisions = emptyDecisionCounts();
  const verifications = emptyVerificationCounts();
  const actions = emptyActionCounts();
  for (const issue of issues) {
    decisions[issue.decision]++;
    verifications[issue.verification]++;
    actions[issue.action]++;
  }
  const adoptionNum = decisions.accepted;
  const adoptionDen = decisions.accepted + decisions.rejected;
  return {
    unique: issues.length,
    decisions,
    verifications,
    actions,
    adoption: {
      numerator: adoptionNum,
      denominator: adoptionDen,
      rate: rate(adoptionNum, adoptionDen),
    },
  };
};

const applyComparableForQuality = (cases: CaseRow[]): void => {
  const byRun = new Map<string, CaseRow[]>();
  for (const c of cases) {
    const list = byRun.get(c.runId) ?? [];
    list.push(c);
    byRun.set(c.runId, list);
  }
  for (const runCases of byRun.values()) {
    for (const c of runCases) {
      if (!c.completedParsed) {
        c.comparableForQuality = false;
        continue;
      }
      c.comparableForQuality = runCases.some(
        (other) =>
          other !== c &&
          other.completedParsed &&
          other.coverageKey === c.coverageKey &&
          (other.backend !== c.backend || other.model !== c.model),
      );
    }
  }
};

export const buildReport = (
  loaded: LoadResult,
  inputDirectory: string,
): EvaluationReport => {
  const selectedByRunDir = new Map(
    loaded.selected.map((item) => [item.runDir, item]),
  );
  const allCases: CaseRow[] = [];
  for (const item of loaded.selected) {
    allCases.push(...buildCasesForRun(item));
  }
  applyComparableForQuality(allCases);
  allCases.sort((a, b) => {
    const k = `${a.runId}\0${a.backend}\0${a.model}`.localeCompare(
      `${b.runId}\0${b.backend}\0${b.model}`,
    );
    return k;
  });

  type GroupKey = string;
  const groupIssues = new Map<GroupKey, DedupedIssue[]>();
  const groupCases = new Map<GroupKey, CaseRow[]>();
  const groupActorIds = new Map<GroupKey, Set<string>>();
  const groupBenchmarks = new Map<GroupKey, Set<string>>();
  const groupRuns = new Map<GroupKey, Set<string>>();

  for (const c of allCases) {
    const gk = JSON.stringify([c.backend, c.model, c.level, c.actorKind]);
    const cases = groupCases.get(gk) ?? [];
    cases.push(c);
    groupCases.set(gk, cases);
    const actors = groupActorIds.get(gk) ?? new Set<string>();
    actors.add(c.actorId);
    groupActorIds.set(gk, actors);
    const benchmarks = groupBenchmarks.get(gk) ?? new Set<string>();
    benchmarks.add(`${c.patchSha256}:${c.promptSha256}`);
    groupBenchmarks.set(gk, benchmarks);
    const runs = groupRuns.get(gk) ?? new Set<string>();
    runs.add(c.runId);
    groupRuns.set(gk, runs);

    const item = selectedByRunDir.get(c.runDir)!;
    const issues = dedupeIssues(item, c.backend, c.model);
    const existing = groupIssues.get(gk) ?? [];
    existing.push(...issues);
    groupIssues.set(gk, existing);
  }

  const modelSummaries: ModelSummary[] = [];
  for (
    const [gk, cases] of [...groupCases.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )
  ) {
    const [backend, model, level, actorKind] = JSON.parse(gk) as [
      string,
      string,
      1 | 2 | 3,
      "agent" | "human",
    ];
    const issues = groupIssues.get(gk) ?? [];
    let rawFindings = 0;
    for (const issue of issues) rawFindings += issue.rawFindings;
    const summary = summarizeIssues(issues);
    const { decisions, verifications, actions } = summary;
    const adoptionNum = summary.adoption.numerator;
    const adoptionDen = summary.adoption.denominator;
    const verConfNum = verifications.confirmed;
    const verConfDen = verifications.confirmed + verifications.contradicted;
    const verCovNum = verifications.confirmed + verifications.contradicted;

    const execStats = {
      total: 0,
      completed: 0,
      successful: 0,
      failed: 0,
      timeouts: 0,
      unfinished: 0,
      no_findings: 0,
      unparsed: 0,
      elapsed: [] as number[],
    };

    for (const item of loaded.selected) {
      for (const exec of item.snapshot.executions) {
        if (exec.backend !== backend || exec.model !== model) continue;
        if (parseLevel(item.snapshot.metadata.level) !== level) continue;
        if (item.snapshot.actor.kind !== actorKind) continue;

        execStats.total++;
        const review = item.snapshot.reviews.find((r) =>
          r.executionId === exec.id
        )!;
        if (exec.status === "pending" || exec.status === "running") {
          execStats.unfinished++;
          continue;
        }
        execStats.completed++;
        if (exec.exitCode === 0) {
          execStats.successful++;
          if (exec.startedAt && exec.endedAt) {
            execStats.elapsed.push(
              (Date.parse(exec.endedAt) - Date.parse(exec.startedAt)) / 1000,
            );
          }
        } else {
          execStats.failed++;
          if (exec.exitCode === 124) execStats.timeouts++;
        }
        if (review.verdict === "no_findings") execStats.no_findings++;
        if (review.verdict === "unparsed") execStats.unparsed++;
      }
    }

    modelSummaries.push({
      backend,
      model,
      level,
      actorKind: actorKind as "agent" | "human",
      actorIds: [...(groupActorIds.get(gk) ?? [])].sort(),
      distinctBenchmarks: groupBenchmarks.get(gk)?.size ?? 0,
      runs: groupRuns.get(gk)?.size ?? 0,
      cases: cases.length,
      issues: {
        unique: issues.length,
        rawFindings,
        decisions,
        verifications,
        actions,
      },
      adoption: {
        numerator: adoptionNum,
        denominator: adoptionDen,
        rate: rate(adoptionNum, adoptionDen),
      },
      verificationConfirmation: {
        numerator: verConfNum,
        denominator: verConfDen,
        rate: rate(verConfNum, verConfDen),
        label: "裏取り済み指摘の確認率",
      },
      verificationCoverage: {
        numerator: verCovNum,
        denominator: issues.length,
        rate: rate(verCovNum, issues.length),
      },
      actions,
      executions: {
        total: execStats.total,
        completed: execStats.completed,
        successful: execStats.successful,
        failed: execStats.failed,
        timeouts: execStats.timeouts,
        unfinished: execStats.unfinished,
        no_findings: execStats.no_findings,
        unparsed: execStats.unparsed,
        successRate: rate(execStats.successful, execStats.completed),
        failureRate: rate(execStats.failed, execStats.completed),
        timeoutRate: rate(execStats.timeouts, execStats.completed),
        medianElapsedSeconds: median(execStats.elapsed),
      },
    });
  }

  return {
    schemaVersion: 1,
    reportType: "review-model-evaluation",
    generatedAt: new Date().toISOString(),
    inputDirectory,
    sources: loaded.selected.map((s) => ({
      runId: s.snapshot.runId,
      runDir: s.runDir,
      snapshotPath: s.snapshotPath,
      snapshotSha256: s.snapshotSha256,
      savedAt: s.snapshot.savedAt,
    })),
    excluded: {
      runDirs: loaded.excludedRunDirs,
      snapshots: loaded.excludedSnapshots,
    },
    warnings: loaded.warnings,
    overview: {
      hasData: loaded.selected.length > 0,
      selectedRuns: loaded.selected.length,
      modelGroups: modelSummaries.length,
      warningCount: loaded.warnings.length,
    },
    modelSummaries,
    cases: allCases,
    methodology: {
      notes: [
        "採用率は accepted / (accepted + rejected)。pending / deferred / conflict は分母外。",
        "確認率は confirmed / (confirmed + contradicted)。未検証は false ではない。",
        "accepted と fixed は独立。action=fixed は記録値のみ。",
        "comparableForQuality は同一 run 内で coverageKey が一致する別 backend/model ペアが completedParsed の場合のみ true。",
        "run 間でタスク coverage が混在する all-history 率は記述的のみ。",
        "未 spawn の plan chunk は snapshot から検出不可。",
        "median 成功実行時間は内部リトライを含み、maxAttempts 実測ではない。",
        "actor.kind は snapshot 全体の判断源。finding 単位の人間承認は示さない。",
        "低サンプルや outcome selection bias ではランキングを支持しない。",
        "accuracy / recall / コスト / トークンは測定していない。",
      ],
    },
  };
};

const writePrivateFile = async (
  path: string,
  content: string,
): Promise<void> => {
  await writeFile(path, content, { mode: 0o600, flag: "wx" });
};

const prepareOutputDir = async (outDir: string): Promise<void> => {
  const parent = dirname(outDir);
  if (parent !== outDir) {
    await mkdir(parent, { recursive: true, mode: 0o700 });
  }
  await mkdir(outDir, { recursive: false, mode: 0o700 });
};

export const evaluateModels = async (options: {
  runsDir: string;
  outDir: string;
}): Promise<{
  htmlPath: string;
  jsonPath: string;
  selectedRuns: number;
  modelGroups: number;
  warningCount: number;
}> => {
  const runsDir = resolve(options.runsDir);
  const outDir = resolve(options.outDir);

  const runsDirResolved = await resolveExistingPath(runsDir);
  const outDirResolved = await resolveExistingPath(outDir);
  if (isPathInside(runsDirResolved, outDirResolved)) {
    throw new Error(`output directory must not be under runs tree: ${outDir}`);
  }

  const loaded = await loadSelectedRuns(runsDir);
  const report = buildReport(loaded, runsDir);
  await prepareOutputDir(outDir);

  const jsonPath = join(outDir, "model-evaluation.json");
  const htmlPath = join(outDir, "model-evaluation.html");
  await writePrivateFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writePrivateFile(htmlPath, renderReportHtml(report));

  return {
    htmlPath,
    jsonPath,
    selectedRuns: report.overview.selectedRuns,
    modelGroups: report.overview.modelGroups,
    warningCount: report.overview.warningCount,
  };
};

const printHelp = (): void => {
  console.log(`Usage: evaluate_models.ts [--runs-dir PATH] [--out PATH]

Offline model evaluation from parallel-review snapshot histories.
Default runs-dir: getRunsBaseDir()
Default out: parallel-review/reports/<UTC-date>-<uuid>`);
};

if (import.meta.main) {
  try {
    const parsed = parseArgs(Deno.args);
    if (parsed.help) {
      printHelp();
      Deno.exit(0);
    }
    const runsDir = resolve(parsed.runsDir ?? getRunsBaseDir());
    const outDir = resolve(parsed.outDir ?? defaultOutDir());
    const result = await evaluateModels({ runsDir, outDir });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
