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
import {
  saveAssessment,
  validateSnapshot,
} from "../../parallel-review/scripts/review_history.ts";
import {
  buildReport,
  type EvaluationReport,
  loadSelectedRuns,
} from "../scripts/evaluate_models.ts";
import { renderReportHtml } from "../scripts/render_report.ts";

const EVAL_SCRIPT = join(import.meta.dirname!, "../scripts/evaluate_models.ts");
const HISTORY_SCRIPT = join(
  import.meta.dirname!,
  "../../parallel-review/scripts/review_history.ts",
);
const ISO = "2026-09-25T06:00:00.000Z";
const ISO_END = "2026-09-25T06:05:00.000Z";
const ISO_MS1 = "2026-09-25T06:10:00.123Z";
const ISO_MS2 = "2026-09-25T06:20:00.456Z";

type ExecutionRecord = {
  id: string;
  backend: string;
  model: string;
  chunk: string;
  timeout: number;
  retryTimeout: number;
  maxAttempts: number;
  status: "pending" | "running" | "completed";
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  stdoutLog: string;
  stderrLog: string;
};

type Assessment = {
  actor: { kind: "agent" | "human"; id: string };
  reviews: Array<{
    executionId: string;
    verdict: "findings" | "no_findings" | "unparsed" | "unavailable";
    findings: Array<Record<string, unknown>>;
  }>;
};

const minimalExecution = (
  overrides: Partial<ExecutionRecord> = {},
): ExecutionRecord => ({
  id: "whole-r01",
  backend: "pi",
  model: "provider/model-a:high",
  chunk: "changes.patch",
  timeout: 600,
  retryTimeout: 600,
  maxAttempts: 2,
  status: "completed",
  startedAt: ISO,
  endedAt: ISO_END,
  exitCode: 0,
  stdoutLog: "logs/whole-r01.stdout.log",
  stderrLog: "logs/whole-r01.stderr.log",
  ...overrides,
});

const writeExecution = async (
  runDir: string,
  record: ExecutionRecord,
): Promise<void> => {
  await mkdir(join(runDir, "executions"), { recursive: true });
  await writeFile(
    join(runDir, "executions", `${record.id}.json`),
    JSON.stringify(record, null, 2),
    { mode: 0o600 },
  );
};

const childEnv = (home: string, xdg: string): Record<string, string> => ({
  HOME: home,
  XDG_DATA_HOME: xdg,
});

const runHistoryCli = async (
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--allow-read",
      "--allow-write",
      "--allow-env=HOME,XDG_DATA_HOME",
      HISTORY_SCRIPT,
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
    env: { ...Deno.env.toObject(), ...env },
  });
  const out = await cmd.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
};

type RunsEnv = { home: string; xdg: string };

const setupRunDir = async (
  env: RunsEnv,
  executions: ExecutionRecord[],
  level: 1 | 2 | 3 = 2,
) => {
  const initOut = await runHistoryCli([
    "init",
    "--repository",
    "/tmp/repo",
    "--revision",
    "abc123",
    "--level",
    String(level),
  ], childEnv(env.home, env.xdg));
  assert.equal(initOut.code, 0, initOut.stderr);
  const runDir = initOut.stdout.trim();
  const metadata = JSON.parse(
    await readFile(join(runDir, "metadata.json"), "utf8"),
  );
  const runId = metadata.runId as string;
  await writeFile(join(runDir, "changes.patch"), "diff content\n", {
    mode: 0o600,
  });
  await writeFile(join(runDir, "prompt.md"), "review prompt\n", {
    mode: 0o600,
  });
  await mkdir(join(runDir, "logs"), { recursive: true });
  for (const exec of executions) {
    await writeExecution(runDir, exec);
    await writeFile(join(runDir, exec.stdoutLog), "stdout\n", { mode: 0o600 });
    await writeFile(join(runDir, exec.stderrLog), "stderr\n", { mode: 0o600 });
  }
  return { runDir, metadata, runId };
};

const saveSnapshot = async (
  runDir: string,
  assessment: Assessment,
): Promise<string> => {
  const { snapshotPath } = await saveAssessment({ runDir, assessment });
  return snapshotPath;
};

const withTempRuns = async (
  fn: (ctx: { home: string; xdg: string; runsRoot: string }) => Promise<void>,
): Promise<void> => {
  const home = await mkdtemp(join(tmpdir(), "rme-home-"));
  const xdg = join(home, "xdg-data");
  const runsRoot = join(xdg, "parallel-review", "runs");
  await mkdir(runsRoot, { recursive: true, mode: 0o700 });
  try {
    await fn({ home, xdg, runsRoot });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
};

const runCli = async (
  args: string[],
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--allow-read",
      "--allow-write",
      "--allow-env=HOME,XDG_DATA_HOME",
      EVAL_SCRIPT,
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
    env: { ...Deno.env.toObject(), ...env },
  });
  const out = await cmd.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
};

const runEvalCliWithWatchdog = async (
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<
  { code: number; stdout: string; stderr: string; timedOut: boolean }
> => {
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--allow-read",
      "--allow-write",
      "--allow-env=HOME,XDG_DATA_HOME",
      EVAL_SCRIPT,
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
    env: { ...Deno.env.toObject(), ...env },
  }).spawn();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGKILL");
    } catch {
      // already exited
    }
  }, timeoutMs);

  try {
    const [status, stdout, stderr] = await Promise.all([
      child.status,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code: status.code, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
    if (!timedOut) {
      try {
        await child.status;
      } catch {
        // already reaped
      }
    }
  }
};

Deno.test("validateSnapshot rejects duplicate executions, missing reviews, runId mismatch", () => {
  const baseExec = {
    id: "whole-r01",
    backend: "pi",
    model: "provider/model-a:high",
    chunk: "changes.patch",
    timeout: 600,
    retryTimeout: 600,
    maxAttempts: 2,
    status: "completed",
    startedAt: ISO,
    endedAt: ISO_END,
    exitCode: 0,
    stdoutLog: "logs/whole-r01.stdout.log",
    stderrLog: "logs/whole-r01.stderr.log",
    files: {
      chunk: { path: "changes.patch", sha256: "a".repeat(64) },
      stdoutLog: { path: "logs/whole-r01.stdout.log", sha256: "b".repeat(64) },
      stderrLog: { path: "logs/whole-r01.stderr.log", sha256: "c".repeat(64) },
    },
  };
  const metadata = {
    schemaVersion: 1,
    runId: "00000000-0000-4000-8000-000000000001",
    createdAt: ISO_MS1,
    repository: "/tmp/repo",
    revision: "abc",
    level: 2,
  };
  const review = {
    executionId: "whole-r01",
    verdict: "no_findings",
    findings: [],
  };
  const snapshotBase = {
    schemaVersion: 1,
    runId: metadata.runId,
    savedAt: ISO_MS1,
    actor: { kind: "agent", id: "cursor/test:default" },
    metadata,
    files: {
      patch: { path: "changes.patch", sha256: "d".repeat(64) },
      prompt: { path: "prompt.md", sha256: "e".repeat(64) },
    },
    executions: [baseExec],
    reviews: [review],
  };

  validateSnapshot(snapshotBase);

  assert.throws(
    () =>
      validateSnapshot({
        ...snapshotBase,
        runId: "00000000-0000-4000-8000-000000000099",
      }),
    /snapshot\.runId must match metadata\.runId/,
  );

  assert.throws(
    () =>
      validateSnapshot({
        ...snapshotBase,
        executions: [baseExec, { ...baseExec }],
      }),
    /duplicate execution ids in snapshot/,
  );

  assert.throws(
    () =>
      validateSnapshot({
        ...snapshotBase,
        reviews: [],
      }),
    /missing execution review: whole-r01/,
  );
});

Deno.test("latest snapshot by savedAt supersedes earlier accepted with later rejected", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "findings",
        findings: [{
          id: "f1",
          issueKey: "auth-null",
          severity: "high",
          location: "src/auth.ts:42",
          original: "missing null check",
          decision: "accepted",
          reason: "confirmed",
        }],
      }],
    });

    const snapDir = join(runDir, "snapshots");
    for await (const entry of Deno.readDir(snapDir)) {
      await rm(join(snapDir, entry.name));
    }
    const { snapshotPath } = await saveAssessment({
      runDir,
      assessment: {
        actor: { kind: "agent", id: "cursor/integrator:default" },
        reviews: [{
          executionId: "whole-r01",
          verdict: "findings",
          findings: [{
            id: "f1",
            issueKey: "auth-null",
            severity: "high",
            location: "src/auth.ts:42",
            original: "missing null check",
            decision: "accepted",
            reason: "confirmed",
          }],
        }],
      },
    });
    const template = JSON.parse(await readFile(snapshotPath, "utf8"));
    await rm(snapshotPath);

    const early = structuredClone(template);
    early.savedAt = ISO_MS1;
    early.reviews[0].findings[0].decision = "accepted";
    const earlyPath = join(snapDir, "zzz-early.json");
    await writeFile(earlyPath, `${JSON.stringify(early, null, 2)}\n`, {
      mode: 0o600,
    });

    const later = structuredClone(early);
    later.savedAt = ISO_MS2;
    later.reviews[0].findings[0].decision = "rejected";
    later.reviews[0].findings[0].reason = "not reproducible";
    const laterPath = join(snapDir, "aaa-latest.json");
    await writeFile(laterPath, `${JSON.stringify(later, null, 2)}\n`, {
      mode: 0o600,
    });

    const { selected } = await loadSelectedRuns(runsRoot);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].snapshotPath, laterPath);
    assert.equal(selected[0].snapshot.savedAt, ISO_MS2);
    const issue = selected[0].snapshot.reviews[0].findings[0];
    assert.equal(issue.decision, "rejected");
    assert.notEqual(earlyPath, laterPath);
  });
});

Deno.test("deduplicates issueKey per model and keeps separate models and runs", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const execA = minimalExecution({
      id: "c001-r01",
      model: "provider/model-a:high",
    });
    const execB = minimalExecution({
      id: "c001-r02",
      model: "provider/model-a:xhigh",
    });
    const { runDir: run1 } = await setupRunDir({ home, xdg }, [execA, execB]);
    await saveSnapshot(run1, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [
        {
          executionId: "c001-r01",
          verdict: "findings",
          findings: [
            {
              id: "f1",
              issueKey: "shared-issue",
              severity: "medium",
              location: "a.ts:1",
              original: "issue in a",
              decision: "accepted",
              reason: "ok",
            },
            {
              id: "f2",
              issueKey: "shared-issue",
              severity: "medium",
              location: "a.ts:2",
              original: "duplicate chunk same key",
              decision: "accepted",
              reason: "dup",
            },
          ],
        },
        {
          executionId: "c001-r02",
          verdict: "findings",
          findings: [{
            id: "f1",
            issueKey: "shared-issue",
            severity: "medium",
            location: "b.ts:1",
            original: "issue in b",
            decision: "rejected",
            reason: "no",
          }],
        },
      ],
    });

    const exec2 = minimalExecution({ id: "whole-r01" });
    const { runDir: run2 } = await setupRunDir({ home, xdg }, [exec2]);
    await saveSnapshot(run2, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "findings",
        findings: [{
          id: "f1",
          issueKey: "shared-issue",
          severity: "low",
          location: "c.ts:1",
          original: "other run",
          decision: "deferred",
          reason: "later",
        }],
      }],
    });

    const loaded = await loadSelectedRuns(runsRoot);
    const report = buildReport(loaded, runsRoot);
    const modelAHigh = report.modelSummaries.find((s) =>
      s.model === "provider/model-a:high"
    );
    const modelAXhigh = report.modelSummaries.find((s) =>
      s.model === "provider/model-a:xhigh"
    );
    assert.ok(modelAHigh);
    assert.ok(modelAXhigh);
    assert.equal(modelAHigh!.issues.unique, 2);
    assert.equal(modelAHigh!.issues.rawFindings, 3);
    assert.notEqual(modelAHigh!.model, modelAXhigh!.model);
    assert.equal(modelAXhigh!.issues.unique, 1);
    assert.equal(report.cases.length, 3);
    assert.equal(report.cases.filter((c) => c.issueCount === 1).length, 3);
  });
});

Deno.test("conflicts excluded from rates; pending deferred unverified and accepted not fixed", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "findings",
        findings: [
          {
            id: "f1",
            issueKey: "conflict-decision",
            severity: "high",
            location: "a.ts:1",
            original: "x",
            decision: "accepted",
            reason: "a",
            verification: "confirmed",
            evidence: "yes",
            action: "unknown",
          },
          {
            id: "f2",
            issueKey: "conflict-decision",
            severity: "high",
            location: "a.ts:2",
            original: "y",
            decision: "rejected",
            reason: "b",
            verification: "contradicted",
            evidence: "no",
            action: "fixed",
            actionEvidence: "commit abc",
          },
          {
            id: "f3",
            issueKey: "pending-one",
            severity: "low",
            location: "b.ts:1",
            original: "p",
            decision: "pending",
          },
          {
            id: "f4",
            issueKey: "deferred-one",
            severity: "low",
            location: "b.ts:2",
            original: "d",
            decision: "deferred",
            reason: "wait",
          },
          {
            id: "f5",
            issueKey: "accepted-not-fixed",
            severity: "medium",
            location: "c.ts:1",
            original: "z",
            decision: "accepted",
            reason: "ok",
            action: "not_fixed",
          },
        ],
      }],
    });

    const loaded = await loadSelectedRuns(runsRoot);
    const report = buildReport(loaded, runsRoot);
    const summary = report.modelSummaries[0];
    assert.equal(summary.issues.decisions.conflict, 1);
    assert.equal(summary.issues.decisions.pending, 1);
    assert.equal(summary.issues.decisions.deferred, 1);
    assert.equal(summary.issues.verifications.not_checked, 3);
    assert.equal(summary.issues.verifications.conflict, 1);
    assert.equal(summary.adoption.numerator, 1);
    assert.equal(summary.adoption.denominator, 1);
    assert.equal(summary.adoption.rate, 1);
    assert.equal(summary.verificationConfirmation.numerator, 0);
    assert.equal(summary.verificationConfirmation.denominator, 0);
    assert.equal(summary.verificationConfirmation.rate, undefined);
    assert.equal(summary.actions.fixed, 0);
    assert.equal(summary.actions.not_fixed, 1);
    assert.equal(summary.actions.conflict, 1);
  });
});

Deno.test("execution stats distinguish timeout unfinished unparsed no_findings", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const executions: ExecutionRecord[] = [
      minimalExecution({ id: "whole-r01", exitCode: 0 }),
      minimalExecution({
        id: "whole-r02",
        model: "provider/model-b:xhigh",
        exitCode: 124,
        endedAt: "2026-09-25T06:02:00.000Z",
      }),
      minimalExecution({
        id: "whole-r03",
        model: "provider/model-c:max",
        status: "running",
        endedAt: undefined,
        exitCode: undefined,
      }),
    ];
    const { runDir } = await setupRunDir({ home, xdg }, executions);
    await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [
        { executionId: "whole-r01", verdict: "no_findings", findings: [] },
        { executionId: "whole-r02", verdict: "unavailable", findings: [] },
        {
          executionId: "whole-r03",
          verdict: "unavailable",
          findings: [],
        },
      ],
    });

    const execUnparsed = minimalExecution({
      id: "whole-r01",
      model: "provider/model-d:high",
    });
    const { runDir: unparsedRun } = await setupRunDir({ home, xdg }, [
      execUnparsed,
    ]);
    await saveSnapshot(unparsedRun, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "unparsed",
        findings: [],
      }],
    });

    const loaded = await loadSelectedRuns(runsRoot);
    const report = buildReport(loaded, runsRoot);
    const ops = report.modelSummaries.find((s) =>
      s.model === "provider/model-a:high"
    )!
      .executions;
    assert.equal(ops.completed, 1);
    assert.equal(ops.successful, 1);
    assert.equal(ops.no_findings, 1);

    const timeout =
      report.modelSummaries.find((s) => s.model === "provider/model-b:xhigh")!
        .executions;
    assert.equal(timeout.timeouts, 1);
    assert.equal(timeout.failed, 1);

    const unfinished =
      report.modelSummaries.find((s) => s.model === "provider/model-c:max")!
        .executions;
    assert.equal(unfinished.unfinished, 1);
    assert.equal(unfinished.completed, 0);
    assert.equal(unfinished.successRate, undefined);

    const unparsed = report.cases.find((c) =>
      c.model === "provider/model-d:high"
    );
    assert.ok(unparsed);
    assert.equal(unparsed!.completedParsed, false);
    assert.equal(
      report.modelSummaries.find((s) => s.model === "provider/model-d:high")!
        .executions
        .unparsed,
      1,
    );
  });
});

Deno.test("separates level actor backend effort and coverage comparability", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const baseline = {
      backend: "pi" as const,
      model: "provider/model-a:high",
      level: 2 as const,
      actor: { kind: "agent" as const, id: "cursor/integrator:default" },
    };
    const noFindings = [{
      executionId: "whole-r01",
      verdict: "no_findings" as const,
      findings: [],
    }];

    const { runDir: baselineRun } = await setupRunDir({ home, xdg }, [
      minimalExecution({ backend: baseline.backend, model: baseline.model }),
    ], baseline.level);
    await saveSnapshot(baselineRun, {
      actor: baseline.actor,
      reviews: noFindings,
    });

    const { runDir: backendRun } = await setupRunDir({ home, xdg }, [
      minimalExecution({ backend: "agy", model: baseline.model }),
    ], baseline.level);
    await saveSnapshot(backendRun, {
      actor: baseline.actor,
      reviews: noFindings,
    });

    const { runDir: effortRun } = await setupRunDir({ home, xdg }, [
      minimalExecution({
        backend: baseline.backend,
        model: "provider/model-a:xhigh",
      }),
    ], baseline.level);
    await saveSnapshot(effortRun, {
      actor: baseline.actor,
      reviews: noFindings,
    });

    const { runDir: modelRun } = await setupRunDir({ home, xdg }, [
      minimalExecution({
        backend: baseline.backend,
        model: "provider/model-b:high",
      }),
    ], baseline.level);
    await saveSnapshot(modelRun, {
      actor: baseline.actor,
      reviews: noFindings,
    });

    const { runDir: levelRun } = await setupRunDir({ home, xdg }, [
      minimalExecution({ backend: baseline.backend, model: baseline.model }),
    ], 1);
    await saveSnapshot(levelRun, {
      actor: baseline.actor,
      reviews: noFindings,
    });

    const { runDir: actorRun } = await setupRunDir({ home, xdg }, [
      minimalExecution({ backend: baseline.backend, model: baseline.model }),
    ], baseline.level);
    await saveSnapshot(actorRun, {
      actor: { kind: "human", id: "human/reviewer-1" },
      reviews: noFindings,
    });

    const loaded = await loadSelectedRuns(runsRoot);
    const report = buildReport(loaded, runsRoot);
    assert.equal(report.modelSummaries.length, 6);
    const keys = report.modelSummaries.map((s) =>
      JSON.stringify([s.backend, s.model, s.level, s.actorKind])
    ).sort();
    assert.deepEqual(keys, [
      JSON.stringify(["agy", "provider/model-a:high", 2, "agent"]),
      JSON.stringify(["pi", "provider/model-a:high", 1, "agent"]),
      JSON.stringify(["pi", "provider/model-a:high", 2, "agent"]),
      JSON.stringify(["pi", "provider/model-a:high", 2, "human"]),
      JSON.stringify(["pi", "provider/model-a:xhigh", 2, "agent"]),
      JSON.stringify(["pi", "provider/model-b:high", 2, "agent"]),
    ]);
    for (const c of report.cases) {
      assert.ok(c.coverageKey.length > 0);
      assert.equal(c.completedParsed, true);
      assert.equal(c.comparableForQuality, false);
    }
  });
});

Deno.test("invalid snapshot in same run excludes entire run without fallback", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    const goodPath = await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const good = JSON.parse(await readFile(goodPath, "utf8"));
    const snapDir = join(runDir, "snapshots");
    await writeFile(
      join(snapDir, "older-good.json"),
      `${JSON.stringify({ ...good, savedAt: ISO_MS1 }, null, 2)}\n`,
      { mode: 0o600 },
    );
    await writeFile(join(snapDir, "newer-bad.json"), "{not json", {
      mode: 0o600,
    });

    const loaded = await loadSelectedRuns(runsRoot);
    assert.equal(loaded.selected.length, 0);
    assert.equal(loaded.excludedRunDirs, 1);
    assert.equal(loaded.excludedSnapshots, 1);
    assert.ok(loaded.warnings.some((w) => w.includes("run excluded")));
  });
});

Deno.test("unsupported schemaVersion in same run excludes entire run", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    const goodPath = await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const good = JSON.parse(await readFile(goodPath, "utf8"));
    await writeFile(
      join(runDir, "snapshots", "unsupported.json"),
      `${
        JSON.stringify(
          { ...good, schemaVersion: 999, savedAt: ISO_MS2 },
          null,
          2,
        )
      }\n`,
      { mode: 0o600 },
    );

    const loaded = await loadSelectedRuns(runsRoot);
    assert.equal(loaded.selected.length, 0);
    assert.equal(loaded.excludedRunDirs, 1);
    assert.ok(loaded.excludedSnapshots >= 1);
  });
});

Deno.test("symlink snapshot in same run excludes entire run", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    const goodPath = await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const validSnapshot = await readFile(goodPath, "utf8");
    const external = join(runsRoot, "..", "external-snap.json");
    await writeFile(external, validSnapshot, { mode: 0o600 });
    await symlink(external, join(runDir, "snapshots", "linked.json"));

    const loaded = await loadSelectedRuns(runsRoot);
    assert.equal(loaded.selected.length, 0);
    assert.equal(loaded.excludedRunDirs, 1);
    assert.ok(loaded.excludedSnapshots >= 1);
    assert.ok(
      loaded.warnings.some((w) => w.includes("symlink snapshot skipped")),
    );
  });
});

Deno.test("comparableForQuality requires same-run peer with matching coverage", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const execA = minimalExecution({
      id: "c001-r01",
      model: "provider/model-a:high",
    });
    const execB = minimalExecution({
      id: "c001-r02",
      model: "provider/model-b:xhigh",
    });
    const execC = minimalExecution({
      id: "c002-r01",
      model: "provider/model-c:max",
      chunk: "part2.patch",
    });
    const execD = minimalExecution({
      id: "c003-r01",
      model: "provider/model-d:high",
      chunk: "d-only.patch",
    });
    const execD2 = minimalExecution({
      id: "c003-r02",
      model: "provider/model-e:xhigh",
      chunk: "d-only.patch",
      exitCode: 124,
      endedAt: "2026-09-25T06:02:00.000Z",
    });
    const { runDir } = await setupRunDir({ home, xdg }, [
      execA,
      execB,
      execC,
      execD,
      execD2,
    ]);
    await writeFile(join(runDir, "part2.patch"), "partial diff\n", {
      mode: 0o600,
    });
    await writeFile(join(runDir, "d-only.patch"), "d group diff\n", {
      mode: 0o600,
    });
    for (const id of ["c002-r01", "c003-r01", "c003-r02"]) {
      await writeFile(join(runDir, "logs", `${id}.stdout.log`), "stdout\n", {
        mode: 0o600,
      });
      await writeFile(join(runDir, "logs", `${id}.stderr.log`), "stderr\n", {
        mode: 0o600,
      });
    }
    await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [
        { executionId: "c001-r01", verdict: "no_findings", findings: [] },
        { executionId: "c001-r02", verdict: "no_findings", findings: [] },
        { executionId: "c002-r01", verdict: "no_findings", findings: [] },
        { executionId: "c003-r01", verdict: "no_findings", findings: [] },
        {
          executionId: "c003-r02",
          verdict: "unavailable",
          findings: [],
        },
      ],
    });

    const report = buildReport(await loadSelectedRuns(runsRoot), runsRoot);
    const byModel = new Map(report.cases.map((c) => [c.model, c]));
    assert.equal(
      byModel.get("provider/model-a:high")!.comparableForQuality,
      true,
    );
    assert.equal(
      byModel.get("provider/model-b:xhigh")!.comparableForQuality,
      true,
    );
    assert.equal(
      byModel.get("provider/model-c:max")!.comparableForQuality,
      false,
    );
    assert.equal(
      byModel.get("provider/model-d:high")!.comparableForQuality,
      false,
    );
    assert.equal(
      byModel.get("provider/model-e:xhigh")!.comparableForQuality,
      false,
    );
  });
});

Deno.test("corruption tie duplicate runId symlinks surfaced without stale fallback", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const healthyExec = minimalExecution();
    const { runDir: healthyRun, runId: healthyRunId } = await setupRunDir(
      { home, xdg },
      [healthyExec],
    );
    await saveSnapshot(healthyRun, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });

    const exec = minimalExecution();
    const { runDir: goodRunDir, runId, metadata } = await setupRunDir(
      { home, xdg },
      [exec],
    );
    const goodPath = await saveSnapshot(goodRunDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const goodSnap = JSON.parse(await readFile(goodPath, "utf8"));

    const ambiguousDir = join(runsRoot, "2026-09-25-ambiguous");
    await mkdir(ambiguousDir, { recursive: true, mode: 0o700 });
    await mkdir(join(ambiguousDir, "snapshots"), {
      recursive: true,
      mode: 0o700,
    });
    const tieRunId = "00000000-0000-4000-8000-000000009991";
    const tieA = structuredClone(goodSnap);
    tieA.runId = tieRunId;
    tieA.metadata = { ...metadata, runId: tieRunId };
    tieA.savedAt = ISO_MS1;
    tieA.reviews[0].verdict = "no_findings";
    await writeFile(
      join(ambiguousDir, "snapshots", "tie-a.json"),
      JSON.stringify(tieA, null, 2),
      { mode: 0o600 },
    );
    const tieB = structuredClone(tieA);
    tieB.reviews[0].verdict = "unparsed";
    await writeFile(
      join(ambiguousDir, "snapshots", "tie-b.json"),
      JSON.stringify(tieB, null, 2),
      { mode: 0o600 },
    );

    const corruptDir = join(runsRoot, "2026-09-25-corrupt");
    await mkdir(corruptDir, { recursive: true, mode: 0o700 });
    await mkdir(join(corruptDir, "snapshots"), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(join(corruptDir, "snapshots", "bad.json"), "{not json", {
      mode: 0o600,
    });

    const conflictDir = join(runsRoot, "2026-09-25-dup-conflict");
    await mkdir(conflictDir, { recursive: true, mode: 0o700 });
    await mkdir(join(conflictDir, "snapshots"), {
      recursive: true,
      mode: 0o700,
    });
    const conflictSnap = structuredClone(goodSnap);
    conflictSnap.runId = runId;
    conflictSnap.metadata = metadata;
    conflictSnap.reviews[0].verdict = "unparsed";
    await writeFile(
      join(conflictDir, "snapshots", "conflict-run.json"),
      JSON.stringify(conflictSnap, null, 2),
      { mode: 0o600 },
    );

    const linkDir = join(runsRoot, "2026-09-25-link");
    await symlink(goodRunDir, linkDir);

    const loaded = await loadSelectedRuns(runsRoot);
    assert.ok(loaded.warnings.some((w) => w.includes("ambiguous")));
    assert.ok(loaded.warnings.some((w) => w.includes("symlink")));
    assert.ok(
      loaded.warnings.some((w) =>
        w.includes("corrupt") || w.includes("invalid")
      ),
    );
    assert.ok(
      loaded.warnings.some((w) =>
        w.includes("duplicate runId") && w.includes("conflicting")
      ),
    );
    assert.equal(
      loaded.selected.filter((s) => s.snapshot.runId === runId).length,
      0,
    );
    assert.equal(
      loaded.selected.some((s) => s.snapshot.runId === tieRunId),
      false,
    );
    assert.equal(
      loaded.selected.some((s) => s.snapshot.runId === healthyRunId),
      true,
    );
  });
});

Deno.test("identical duplicate runId across directories counts once", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir, runId, metadata } = await setupRunDir({ home, xdg }, [
      exec,
    ]);
    const snapPath = await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const snap = JSON.parse(await readFile(snapPath, "utf8"));

    const dupDir = join(runsRoot, "2026-09-25-dup-identical");
    await mkdir(dupDir, { recursive: true, mode: 0o700 });
    await mkdir(join(dupDir, "snapshots"), { recursive: true, mode: 0o700 });
    const copy = structuredClone(snap);
    copy.runId = runId;
    copy.metadata = metadata;
    await writeFile(
      join(dupDir, "snapshots", "same-run.json"),
      JSON.stringify(copy, null, 2),
      { mode: 0o600 },
    );

    const loaded = await loadSelectedRuns(runsRoot);
    assert.equal(
      loaded.selected.filter((s) => s.snapshot.runId === runId).length,
      1,
    );
    assert.ok(
      loaded.warnings.some((w) =>
        w.includes("duplicate runId") && w.includes("identical")
      ),
    );
  });
});

Deno.test("empty history produces honest no-data report", async () => {
  await withTempRuns(async ({ runsRoot }) => {
    const loaded = await loadSelectedRuns(runsRoot);
    const report = buildReport(loaded, runsRoot);
    assert.equal(report.overview.hasData, false);
    assert.equal(report.modelSummaries.length, 0);
    const html = renderReportHtml(report);
    assert.match(html, /評価用の履歴がありません/);
  });
});

Deno.test("HTML escapes injection strings and omits finding original text", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution({
      model: "<script>alert(1)</script>",
    });
    const { runDir, metadata, runId } = await setupRunDir({ home, xdg }, [
      exec,
    ]);
    const snapPath = await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "findings",
        findings: [{
          id: "f1",
          issueKey: "xss-key",
          severity: "high",
          location: "<body>",
          original: "SECRET FINDING TEXT MUST NOT APPEAR",
          decision: "accepted",
          reason: "<script>evil</script>",
        }],
      }],
    });
    const snap = JSON.parse(await readFile(snapPath, "utf8"));
    snap.metadata = {
      ...metadata,
      repository: '"><img src=x onerror=alert(1)>',
    };
    await writeFile(snapPath, `${JSON.stringify(snap, null, 2)}\n`, {
      mode: 0o600,
    });
    validateSnapshot(JSON.parse(await readFile(snapPath, "utf8")));

    const loaded = await loadSelectedRuns(runsRoot);
    const report = buildReport(loaded, runsRoot);
    const html = renderReportHtml(report);
    assert.doesNotMatch(html, /SECRET FINDING TEXT MUST NOT APPEAR/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
    void runId;
  });
});

Deno.test("default CLI first invocation with missing history writes no-data report", async () => {
  const home = await mkdtemp(join(tmpdir(), "rme-first-"));
  const xdg = join(home, "data");
  try {
    const result = await runCli([], { HOME: home, XDG_DATA_HOME: xdg });
    assert.equal(result.code, 0, result.stderr);
    const cliJson = JSON.parse(result.stdout);
    assert.equal(cliJson.selectedRuns, 0);
    assert.equal(cliJson.modelGroups, 0);
    assert.ok(await Deno.stat(cliJson.jsonPath));
    assert.ok(await Deno.stat(cliJson.htmlPath));
    const report = JSON.parse(
      await readFile(cliJson.jsonPath, "utf8"),
    ) as EvaluationReport;
    assert.equal(report.overview.hasData, false);
    const html = await readFile(cliJson.htmlPath, "utf8");
    assert.match(html, /評価用の履歴がありません/);
    let runsExists = true;
    try {
      await Deno.stat(join(xdg, "parallel-review", "runs"));
    } catch {
      runsExists = false;
    }
    assert.equal(runsExists, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

Deno.test("CLI rejects dotdot-named child under runs and symlink alias into runs", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const patchBefore = await readFile(join(runDir, "changes.patch"));

    const dotdotChild = join(runsRoot, "..foo");
    await mkdir(dotdotChild, { recursive: true, mode: 0o700 });
    const badDotdot = await runCli([
      "--runs-dir",
      runsRoot,
      "--out",
      dotdotChild,
    ]);
    assert.notEqual(badDotdot.code, 0);
    assert.match(badDotdot.stderr, /under runs/i);

    const aliasBase = join(runsRoot, "..", "alias-base");
    await mkdir(aliasBase, { recursive: true, mode: 0o700 });
    const aliasTarget = join(aliasBase, "runs-alias");
    await symlink(runsRoot, aliasTarget);
    const badAlias = await runCli([
      "--runs-dir",
      runsRoot,
      "--out",
      join(aliasTarget, "nested-out"),
    ]);
    assert.notEqual(badAlias.code, 0);
    assert.match(badAlias.stderr, /under runs/i);

    const patchAfter = await readFile(join(runDir, "changes.patch"));
    assert.deepEqual(patchBefore, patchAfter);
  });
});

Deno.test("CLI rejects duplicate flags and flag used as value", async () => {
  await withTempRuns(async ({ runsRoot }) => {
    const dup = await runCli(["--runs-dir", runsRoot, "--runs-dir", runsRoot]);
    assert.notEqual(dup.code, 0);
    assert.match(dup.stderr, /duplicate --runs-dir/);

    const flagValue = await runCli(["--out", "--runs-dir"]);
    assert.notEqual(flagValue.code, 0);
    assert.match(flagValue.stderr, /--out requires a path/);
  });
});

Deno.test("CLI integration writes report refuses existing out and out-under-runs", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });

    const patchBefore = await readFile(join(runDir, "changes.patch"));
    const outDir = join(runsRoot, "..", "reports", "test-out");
    await mkdir(outDir, { recursive: true, mode: 0o700 });

    const badUnder = await runCli([
      "--runs-dir",
      runsRoot,
      "--out",
      join(runsRoot, "nested-out"),
    ]);
    assert.notEqual(badUnder.code, 0);
    assert.match(badUnder.stderr, /under runs/i);

    const badExisting = await runCli(["--runs-dir", runsRoot, "--out", outDir]);
    assert.notEqual(badExisting.code, 0);

    const good = await runCli([
      "--runs-dir",
      runsRoot,
      "--out",
      join(outDir, "fresh"),
    ]);
    assert.equal(good.code, 0);
    const cliJson = JSON.parse(good.stdout);
    assert.equal(cliJson.selectedRuns, 1);
    assert.equal(cliJson.modelGroups, 1);
    assert.ok(await Deno.stat(cliJson.jsonPath));
    assert.ok(await Deno.stat(cliJson.htmlPath));
    const report = JSON.parse(
      await readFile(cliJson.jsonPath, "utf8"),
    ) as EvaluationReport;
    assert.equal(report.reportType, "review-model-evaluation");
    const patchAfter = await readFile(join(runDir, "changes.patch"));
    assert.deepEqual(patchBefore, patchAfter);
  });
});

Deno.test("median elapsed omitted when no successful executions", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution({ exitCode: 124, endedAt: ISO_END });
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "unavailable",
        findings: [],
      }],
    });
    const report = buildReport(await loadSelectedRuns(runsRoot), runsRoot);
    assert.equal(
      report.modelSummaries[0].executions.medianElapsedSeconds,
      undefined,
    );
    const html = renderReportHtml(report);
    assert.match(html, /—/);
  });
});

Deno.test("FIFO snapshot candidate excludes run without hanging evaluation child", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir } = await setupRunDir({ home, xdg }, [exec]);
    await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const fifoPath = join(runDir, "snapshots", "blocked.json");
    const mkfifo = await new Deno.Command("mkfifo", {
      args: [fifoPath],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(mkfifo.code, 0, new TextDecoder().decode(mkfifo.stderr));

    const outDir = join(home, "fifo-eval-out");
    const result = await runEvalCliWithWatchdog(
      ["--runs-dir", runsRoot, "--out", outDir],
      childEnv(home, xdg),
      4000,
    );
    assert.equal(result.timedOut, false, result.stderr);
    assert.equal(result.code, 0, result.stderr);
    const cliJson = JSON.parse(result.stdout);
    assert.equal(cliJson.selectedRuns, 0);
    assert.equal(cliJson.warningCount >= 1, true);

    const report = JSON.parse(
      await readFile(cliJson.jsonPath, "utf8"),
    ) as EvaluationReport;
    assert.equal(report.overview.hasData, false);
    assert.equal(report.excluded.runDirs, 1);
    assert.ok(report.warnings.some((w) => w.includes("run excluded")));
  });
});

const metadataWithNested = (
  metadata: Record<string, unknown>,
): Record<string, unknown> => ({
  level: metadata.level,
  runId: metadata.runId,
  revision: metadata.revision,
  createdAt: metadata.createdAt,
  repository: metadata.repository,
  schemaVersion: metadata.schemaVersion,
  context: { tier: "standard", track: "main" },
});

const metadataWithNestedAltOrder = (
  metadata: Record<string, unknown>,
): Record<string, unknown> => ({
  context: { track: "main", tier: "standard" },
  schemaVersion: metadata.schemaVersion,
  repository: metadata.repository,
  createdAt: metadata.createdAt,
  revision: metadata.revision,
  runId: metadata.runId,
  level: metadata.level,
});

Deno.test("reordered metadata keys compare structurally for ties and duplicate runId", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir, runId, metadata } = await setupRunDir({ home, xdg }, [
      exec,
    ]);
    const snapPath = await saveSnapshot(runDir, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const canonical = JSON.parse(await readFile(snapPath, "utf8"));
    const snapDir = join(runDir, "snapshots");
    for await (const entry of Deno.readDir(snapDir)) {
      await rm(join(snapDir, entry.name));
    }

    const tieSavedAt = ISO_MS1;
    const metaA = metadataWithNested(metadata);
    const metaB = metadataWithNestedAltOrder(metadata);
    const tieA = {
      ...canonical,
      savedAt: tieSavedAt,
      metadata: metaA,
    };
    const tieB = {
      ...canonical,
      savedAt: tieSavedAt,
      metadata: metaB,
    };
    const tieAJson = `${JSON.stringify(tieA, null, 2)}\n`;
    const tieBJson = `${JSON.stringify(tieB, null, 2)}\n`;
    assert.notEqual(tieAJson, tieBJson);
    assert.deepEqual(tieA.metadata, tieB.metadata);

    await writeFile(join(snapDir, "tie-z.json"), tieAJson, { mode: 0o600 });
    await writeFile(join(snapDir, "tie-a.json"), tieBJson, { mode: 0o600 });

    const tieLoaded = await loadSelectedRuns(runsRoot);
    assert.equal(tieLoaded.selected.length, 1);
    assert.equal(tieLoaded.excludedRunDirs, 0);
    assert.equal(
      tieLoaded.selected[0].snapshotPath,
      join(snapDir, "tie-a.json"),
    );

    const dupDir = join(runsRoot, "2026-09-25-dup-reorder");
    await mkdir(join(dupDir, "snapshots"), { recursive: true, mode: 0o700 });
    await writeFile(
      join(dupDir, "snapshots", "copy.json"),
      tieAJson,
      { mode: 0o600 },
    );

    const dupLoaded = await loadSelectedRuns(runsRoot);
    assert.equal(
      dupLoaded.selected.filter((s) => s.snapshot.runId === runId).length,
      1,
    );
    assert.ok(
      dupLoaded.warnings.some((w) =>
        w.includes("duplicate runId") && w.includes("identical")
      ),
    );

    const conflictDir = join(runsRoot, "2026-09-25-dup-conflict-values");
    await mkdir(join(conflictDir, "snapshots"), {
      recursive: true,
      mode: 0o700,
    });
    const conflicting = structuredClone(tieA);
    conflicting.metadata = {
      ...metaA,
      revision: "conflicting-revision",
    };
    await writeFile(
      join(conflictDir, "snapshots", "conflict.json"),
      `${JSON.stringify(conflicting, null, 2)}\n`,
      { mode: 0o600 },
    );
    const conflictLoaded = await loadSelectedRuns(runsRoot);
    assert.equal(
      conflictLoaded.selected.filter((s) => s.snapshot.runId === runId).length,
      0,
    );
    assert.ok(
      conflictLoaded.warnings.some((w) =>
        w.includes("duplicate runId") && w.includes("conflicting")
      ),
    );
  });
});

Deno.test("valid snapshot symlink target still excluded while regular file loads", async () => {
  await withTempRuns(async ({ home, xdg, runsRoot }) => {
    const exec = minimalExecution();
    const { runDir: regularRun } = await setupRunDir({ home, xdg }, [exec]);
    const regularPath = await saveSnapshot(regularRun, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });

    const { runDir: symlinkRun } = await setupRunDir({ home, xdg }, [exec]);
    const ownSnapshotPath = await saveSnapshot(symlinkRun, {
      actor: { kind: "agent", id: "cursor/integrator:default" },
      reviews: [{
        executionId: "whole-r01",
        verdict: "no_findings",
        findings: [],
      }],
    });
    const ownSnapshot = await readFile(ownSnapshotPath, "utf8");
    const external = join(home, "external-valid.json");
    await writeFile(external, ownSnapshot, { mode: 0o600 });
    await symlink(external, join(symlinkRun, "snapshots", "linked.json"));

    const loaded = await loadSelectedRuns(runsRoot);
    assert.equal(loaded.selected.length, 1);
    assert.equal(loaded.selected[0].snapshotPath, regularPath);
    assert.equal(loaded.excludedRunDirs, 1);
    assert.ok(
      loaded.warnings.some((w) => w.includes("symlink snapshot skipped")),
    );
  });
});
