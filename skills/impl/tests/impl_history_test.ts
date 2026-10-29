import assert from "node:assert/strict";
import { test } from "bun:test";
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildReport,
  loadRunMetadataFromRoot,
  parseReportCliArgs,
  renderReportHtml,
  resolveDefaultRunsDir,
  setValidationStatus,
  toReportArtifact,
  validateRunMetadata,
  writeReport,
} from "../scripts/impl_history.ts";
import type { RunMetadata } from "../scripts/run_impl_events.ts";

const CANARY = "impl-report-secret-canary-field-x9k2";
const REVISION_40 = "abc12345".padEnd(40, "0");

const usageComplete = () => ({
  input: 10,
  output: 5,
  cacheRead: 1,
  cacheWrite: 2,
  coverage: "complete" as const,
  sources: ["assistant_message_end"],
  expectedSlices: 1,
  knownSlices: {
    input: 1,
    output: 1,
    cacheRead: 1,
    cacheWrite: 1,
    estimatedCostUsd: 1,
  },
  estimatedCostUsd: 0.001,
});

const baseMeta = (over: Partial<RunMetadata> = {}): RunMetadata => ({
  schemaVersion: 1,
  runId: "r1",
  role: "impl.default",
  resolvedModel: "openai-codex/gpt-6-luna:high",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:01:00.000Z",
  elapsedMs: 60000,
  exitCode: 0,
  executionStatus: "completed",
  stopReason: "stop",
  promptSha256: "a".repeat(64),
  systemPromptSha256: "b".repeat(64),
  codeProvenance: {
    repositoryPath: "/tmp/repo",
    revisionKind: "jj",
    startRevision: REVISION_40,
    comparable: true,
  },
  usage: usageComplete(),
  assistantResponseCount: 1,
  toolCalls: {},
  toolErrors: {},
  retryCount: 0,
  compactionCount: 0,
  parentValidationStatus: "unverified",
  ...over,
});

async function writeRun(root: string, id: string, meta: unknown) {
  const dir = join(root, id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(
    join(dir, "metadata.json"),
    JSON.stringify(meta, null, 2),
    { mode: 0o600 },
  );
}

const testTempRoot = () => {
  const root = process.env.IMPL_TEST_ROOT;
  if (!root) {
    throw new Error("IMPL_TEST_ROOT is required for impl history tests");
  }
  return root;
};

/** Symlink regression cases run when explicitly enabled in the test environment. */
const symlinkTestsEnabled = () => process.env.IMPL_TEST_SYMLINK === "1";

test("regression: conservative coverage on failed stream is accepted", () => {
  const meta = baseMeta({
    executionStatus: "failed",
    usage: { ...usageComplete(), coverage: "partial" },
  });
  assert.ok(validateRunMetadata(meta).ok);
});

test("regression: overflowing aggregate remains unknown, not zero", () => {
  const meta = baseMeta({ usage: { ...usageComplete(), input: 1e308 } });
  assert.equal(
    buildReport("/tmp/fixture", { records: [meta, meta], excluded: [] })
      .modelSummaries[0]?.inputDisplay,
    "unknown",
  );
});

test("report no-data is honest", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  const loaded = await loadRunMetadataFromRoot(root);
  const report = buildReport(root, loaded);
  assert.equal(report.hasData, false);
  const html = renderReportHtml(report);
  assert(html.includes("実装履歴がありません"));
});

test("invalid schemaVersion is excluded", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "bad", { ...baseMeta(), schemaVersion: 99 });
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 0);
  assert.equal(loaded.excluded.length, 1);
});

test("secret canary unknown field excludes record and report artifact", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "canary", { ...baseMeta(), [CANARY]: "leak" });
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 0);
  const report = buildReport(root, loaded);
  const artifact = toReportArtifact(report);
  const json = JSON.stringify(artifact);
  assert.equal(json.includes(CANARY), false);
});

test("completed with exit 17 is excluded", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "bad-exit", { ...baseMeta(), exitCode: 17 });
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 0);
});

test("invalid executionStatus enum is excluded", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "bad-status", {
    ...baseMeta(),
    executionStatus: "passed",
  });
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 0);
});

test("negative elapsedMs is excluded", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "neg", { ...baseMeta(), elapsedMs: -1 });
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 0);
});

test("invalid prompt hash is excluded", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "hash", { ...baseMeta(), promptSha256: "not-hex" });
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 0);
});

test("parent passed without completed is excluded", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "pv", {
    ...baseMeta(),
    executionStatus: "failed",
    exitCode: 1,
    parentValidationStatus: "passed",
  });
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 0);
});

test("HTML escapes untrusted model names even when record invalid", () => {
  const evil = "evil<script>alert(1)</script>";
  const html = renderReportHtml(
    buildReport("/tmp/x", {
      records: [],
      excluded: [{ path: "/x/m/metadata.json", reason: "unknown field" }],
    }),
  );
  assert.equal(html.includes("<script>"), false);
  const validHtml = renderReportHtml(
    buildReport("/tmp/x", {
      records: [baseMeta({ resolvedModel: evil })],
      excluded: [],
    }),
  );
  assert(validHtml.includes("&lt;script&gt;"));
});

test("elapsed omits running placeholder and shows median", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "done", baseMeta({ elapsedMs: 10000 }));
  await writeRun(root, "done2", {
    ...baseMeta(),
    runId: "r2",
    elapsedMs: 30000,
  });
  await writeRun(root, "run", {
    ...baseMeta(),
    runId: "r3",
    executionStatus: "running",
    finishedAt: undefined,
    elapsedMs: undefined,
    exitCode: undefined,
    stopReason: undefined,
  });
  const report = buildReport(root, await loadRunMetadataFromRoot(root));
  const luna = report.modelSummaries.find((m) =>
    m.resolvedModel.includes("luna")
  );
  assert(luna);
  assert.equal(luna.elapsedMedianMs, 20000);
  assert.equal(luna.elapsedKnown, 2);
  const html = renderReportHtml(report);
  assert(html.includes("20000"));
});

test("usage shows unknown not zero for missing metrics", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "u", {
    ...baseMeta(),
    usage: {
      coverage: "partial",
      sources: ["assistant_message_end"],
      expectedSlices: 1,
      knownSlices: { input: 1, output: 1 },
      input: 0,
      output: 3,
    },
  });
  const report = buildReport(root, await loadRunMetadataFromRoot(root));
  const m = report.modelSummaries[0];
  assert.equal(m.inputSum, 0);
  assert.equal(m.cacheReadDisplay, "unknown");
  const html = renderReportHtml(report);
  assert(html.includes("unknown"));
});

test("matched case uses unique keys and per-model summaries", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  const prov = baseMeta().codeProvenance;
  await writeRun(root, "a", baseMeta());
  await writeRun(root, "b", {
    ...baseMeta(),
    runId: "r2",
    resolvedModel: "opencode-go/deepseek-v4.1-flash:high",
  });
  await writeRun(root, "other-prompt", {
    ...baseMeta(),
    runId: "r3",
    promptSha256: "c".repeat(64),
    codeProvenance: prov,
  });
  const report = buildReport(root, await loadRunMetadataFromRoot(root));
  const matched = report.caseGroups.filter((g) => g.matched);
  assert(matched.length >= 1);
  const dual = matched.find((g) => g.models.length >= 2);
  assert(dual);
  assert.equal(dual.caseKey.includes("a".repeat(64)), true);
  assert(dual.displayLabel.length <= dual.caseKey.length);
  assert(dual.modelSummaries && dual.modelSummaries.length >= 2);
  assert(report.warnings.some((w) => w.includes("品質") || w.includes("比較")));
});

test("unknown provenance never matched", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "u", {
    ...baseMeta(),
    codeProvenance: {
      repositoryPath: "/tmp/r",
      revisionKind: "unknown",
      comparable: false,
    },
  });
  const report = buildReport(root, await loadRunMetadataFromRoot(root));
  assert(report.caseGroups.every((g) => !g.matched));
});

test("writeReport refuses existing output directory", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  const out = join(root, "out");
  await mkdir(out);
  const report = buildReport(root, { records: [], excluded: [] });
  await assert.rejects(() => writeReport(out, report));
});

test.skipIf(!symlinkTestsEnabled())("writeReport refuses output inside runs via symlink alias", async () => {
    const root = await mkdtemp(join(testTempRoot(), "test-"));
    const runs = join(root, "runs");
    const outside = join(root, "outside");
    await mkdir(runs, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink("../runs", join(outside, "alias"));
    const out = join(outside, "alias", "report-out");
    const report = buildReport(runs, { records: [], excluded: [] });
    await assert.rejects(() => writeReport(out, report, runs));
});

test("writeReport creates private files exclusively", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  const runs = join(root, "runs");
  const outParent = join(root, "reports");
  await mkdir(runs, { recursive: true });
  await mkdir(outParent, { recursive: true });
  const out = join(outParent, "r1");
  const report = buildReport(runs, { records: [], excluded: [] });
  await writeReport(out, report, runs);
  const st = await stat(out);
  assert.equal(st.mode & 0o777, 0o700);
  const jsonMode = (await stat(join(out, "report.json"))).mode &
    0o777;
  assert.equal(jsonMode, 0o600);
});

test("set-validation passed requires completed execution", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  const meta = {
    ...baseMeta(),
    executionStatus: "failed" as const,
    exitCode: 1,
  };
  await writeRun(root, "run1", meta);
  const runDir = join(root, "run1");
  await assert.rejects(() => setValidationStatus(runDir, "passed"));
});

test("set-validation rejects corrupted completed exit 17", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  const raw = { ...baseMeta(), exitCode: 17 };
  await writeRun(root, "run1", raw);
  const runDir = join(root, "run1");
  await assert.rejects(() => setValidationStatus(runDir, "failed"));
});

test("set-validation rejects invalid status at runtime", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "run1", baseMeta());
  const runDir = join(root, "run1");
  await assert.rejects(() =>
    setValidationStatus(runDir, "unverified" as "passed")
  );
});

test("validateRunMetadata returns fixed reason not exception text", () => {
  const r = validateRunMetadata({ schemaVersion: 1, bad: true });
  assert.equal(r.ok, undefined);
  assert(r.reason && !r.reason.includes("stack"));
});

test("resolveDefaultRunsDir honors IMPL_RUNS_DIR and XDG", () => {
  const home = process.env.HOME ?? "";
  const prevImpl = process.env.IMPL_RUNS_DIR;
  const prevXdg = process.env.XDG_DATA_HOME;
  try {
    process.env.IMPL_RUNS_DIR = "~/custom-impl-runs";
    delete process.env.XDG_DATA_HOME;
    assert(resolveDefaultRunsDir().endsWith("custom-impl-runs"));
    delete process.env.IMPL_RUNS_DIR;
    process.env.XDG_DATA_HOME = join(home, "xdg-test");
    assert(resolveDefaultRunsDir().includes("xdg-test/impl/runs"));
  } finally {
    if (prevImpl === undefined) delete process.env.IMPL_RUNS_DIR;
    else process.env.IMPL_RUNS_DIR = prevImpl;
    if (prevXdg === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = prevXdg;
  }
});

test("running metadata without timing loads and round-trips", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  const running = {
    ...baseMeta(),
    runId: "running-1",
    executionStatus: "running",
    finishedAt: undefined,
    elapsedMs: undefined,
    exitCode: undefined,
    stopReason: undefined,
  };
  await writeRun(root, "running-1", running);
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 1);
  const rec = loaded.records[0]!;
  assert.equal(rec.elapsedMs, undefined);
  assert.equal(rec.exitCode, undefined);
  assert.equal(rec.finishedAt, undefined);
  const again = validateRunMetadata(rec);
  assert(again.ok);
  assert.equal(again.ok.elapsedMs, undefined);
  const report = buildReport(root, loaded);
  assert.equal(report.hasData, true);
  const artifact = toReportArtifact(report);
  assert.equal(artifact.modelSummaries[0]?.inputKnownSlices, 1);
});

test("running with elapsedMs is rejected on load", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "bad-run", {
    ...baseMeta(),
    executionStatus: "running",
    finishedAt: undefined,
    exitCode: undefined,
    elapsedMs: 100,
  });
  const loaded = await loadRunMetadataFromRoot(root);
  assert.equal(loaded.records.length, 0);
});

test("fractional retryCount is rejected", () => {
  const bad = validateRunMetadata({ ...baseMeta(), retryCount: 1.5 });
  assert.equal(bad.ok, undefined);
});

test("toolCalls count zero is accepted", () => {
  const ok = validateRunMetadata({
    ...baseMeta(),
    toolCalls: { read: 0, bash: 0 },
  });
  assert(ok.ok);
});

test("toolCalls unknown tool key is rejected", () => {
  const bad = validateRunMetadata({
    ...baseMeta(),
    toolCalls: { evilTool: 1 },
  });
  assert.equal(bad.ok, undefined);
});

test("non-hex provenance revision is rejected", () => {
  const bad = validateRunMetadata({
    ...baseMeta(),
    codeProvenance: {
      ...baseMeta().codeProvenance,
      startRevision: CANARY,
    },
  });
  assert.equal(bad.ok, undefined);
});

test("usage input without knownSlices is rejected", () => {
  const bad = validateRunMetadata({
    ...baseMeta(),
    usage: {
      ...usageComplete(),
      knownSlices: {
        output: 1,
        cacheRead: 1,
        cacheWrite: 1,
        estimatedCostUsd: 1,
      },
    },
  });
  assert.equal(bad.ok, undefined);
});

test("usage knownSlices without numeric is rejected", () => {
  const usage = { ...usageComplete() };
  delete (usage as { input?: number }).input;
  const bad = validateRunMetadata({
    ...baseMeta(),
    usage,
  });
  assert.equal(bad.ok, undefined);
});

test("fake usage complete coverage is rejected", () => {
  const bad = validateRunMetadata({
    ...baseMeta(),
    usage: {
      coverage: "complete",
      sources: ["assistant_message_end"],
      expectedSlices: 2,
      knownSlices: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
    },
    assistantResponseCount: 2,
    compactionCount: 0,
  });
  assert.equal(bad.ok, undefined);
});

test("report artifact includes slice denominators", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "u", baseMeta());
  const report = buildReport(root, await loadRunMetadataFromRoot(root));
  const artifact = toReportArtifact(report);
  const m = artifact.modelSummaries[0]!;
  assert.equal(m.inputKnownSlices, 1);
  assert.equal(m.inputExpectedSlices, 1);
  assert.equal(m.costKnownSlices, 1);
  const html = renderReportHtml(report);
  assert(html.includes("1/1 slices"));
});

test("set-validation on running allows not-run and failed", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  const running = {
    ...baseMeta(),
    executionStatus: "running",
    finishedAt: undefined,
    elapsedMs: undefined,
    exitCode: undefined,
    stopReason: undefined,
  };
  await writeRun(root, "run1", running);
  const runDir = join(root, "run1");
  await setValidationStatus(runDir, "not-run");
  await setValidationStatus(runDir, "failed");
});

test("set-validation passed refuses running execution", async () => {
  const root = await mkdtemp(join(testTempRoot(), "test-"));
  await writeRun(root, "run1", {
    ...baseMeta(),
    executionStatus: "running",
    finishedAt: undefined,
    elapsedMs: undefined,
    exitCode: undefined,
    stopReason: undefined,
  });
  await assert.rejects(() => setValidationStatus(join(root, "run1"), "passed"));
});

test("CLI rejects duplicate flags and positional args", () => {
  assert.throws(() =>
    parseReportCliArgs(["--out", "/tmp/x", "--out", "/tmp/y"])
  );
  assert.throws(() => parseReportCliArgs(["extra", "--out", "/tmp/x"]));
});

test.skipIf(!symlinkTestsEnabled())("load skips symlink run dir and metadata", async () => {
    const root = await mkdtemp(join(testTempRoot(), "test-"));
    const real = join(root, "real-run");
    await mkdir(real, { recursive: true });
    await writeFile(
      join(real, "metadata.json"),
      JSON.stringify(baseMeta()),
    );
    await symlink("../real-run", join(root, "linked-run"));
    const outside = join(root, "outside-meta.json");
    await writeFile(outside, JSON.stringify(baseMeta({ runId: "x" })));
    const linkMetaRun = join(root, "link-meta-run");
    await mkdir(linkMetaRun);
    await symlink(
      "../outside-meta.json",
      join(linkMetaRun, "metadata.json"),
    );
    const loaded = await loadRunMetadataFromRoot(root);
    assert.equal(loaded.records.length, 1);
    assert(
      loaded.excluded.some((e) => e.reason.toLowerCase().includes("symlink")),
    );
});
