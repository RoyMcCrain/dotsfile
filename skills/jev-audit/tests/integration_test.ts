import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";
import { isMissingPath } from "../scripts/state_io.ts";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");
import { runFixtureProcess } from "./fixture_process.ts";

const PATCH =
  "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n+hello\n";

const writeMockScripts = async (dir: string) => {
  const resolver = join(dir, "resolve-model.sh");
  await writeFile(
    resolver,
    "#!/usr/bin/env bash\n" +
      'if [[ "$1" == "--field" && "$2" == "id" ]]; then echo route/mock-review; exit 0; fi\n' +
      "echo mock/auditor-model\n",
    { mode: 0o700 },
  );
  const countFile = join(dir, "invoke.count");
  const pi = join(dir, "fake_pi.sh");
  await writeFile(
    pi,
    "#!/usr/bin/env bash\n" +
      'echo 1 >> "' + countFile.replaceAll('"', '\\"') + '"\n' +
      'for a in "$@"; do if [[ "$a" == *runId* ]]; then exit 2; fi; done\n' +
      'echo \'{"minLevel":2,"maxLevel":4,"reason":"mock","concerns":[]}\'\n',
    { mode: 0o700 },
  );
  return { resolver, pi, countFile };
};

const writeRun = async (
  runsDir: string,
  runId: string,
  createdAt: string,
  patch = PATCH,
) => {
  const patchSha256 = sha256Bytes(new TextEncoder().encode(patch));
  const dirName = `2020-09-29-${runId}`;
  const runDir = join(runsDir, dirName);
  await mkdir(runDir, { mode: 0o700 });
  const levelDecision = buildJevDecision({
    level: 3,
    patchSha256,
    minConfidence: 0.7,
    model: "route/mock-jev",
    confidence: 0.95,
  });
  await writeFile(
    join(runDir, "metadata.json"),
    `${
      JSON.stringify(
        {
          schemaVersion: 1,
          runId,
          createdAt,
          repository: "/tmp/repo",
          revision: "deadbeef",
          level: 3,
          levelScale: 5,
          levelDecision,
        },
        null,
        2,
      )
    }\n`,
    { mode: 0o600 },
  );
  await writeFile(join(runDir, "changes.patch"), patch, { mode: 0o600 });
  return { runDir, patchSha256 };
};

const readInvokeCount = async (countFile: string): Promise<number> => {
  try {
    return Number(await readFile(countFile, "utf8"));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return 0;
    }
    throw error;
  }
};

const assertNoSpendArtifacts = async (
  auditDir: string,
  week: string,
  runId: string,
): Promise<void> => {
  const weekRoot = join(auditDir, "weeks", week);
  const resultsDir = join(weekRoot, "results");
  let names: string[];
  try {
    names = await readdir(resultsDir);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    names = [];
  }
  assert.equal(names.filter((n) => n.endsWith(".attempt.json")).length, 0);
  assert.equal(names.includes(`${runId}.json`), false);
  const cacheAttempts = join(auditDir, "cache", "attempts");
  let globalAttempts: string[];
  try {
    globalAttempts = (await readdir(cacheAttempts)).filter((n) =>
      n.endsWith(".json")
    );
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    globalAttempts = [];
  }
  assert.equal(globalAttempts.length, 0);
  const cacheDir = join(auditDir, "cache");
  let cacheFiles: string[];
  try {
    cacheFiles = (await readdir(cacheDir)).filter((name) =>
      name.endsWith(".json")
    );
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    cacheFiles = [];
  }
  assert.equal(cacheFiles.length, 0);
};

const runAuditCli = async (
  env: Record<string, string>,
  args: string[],
): Promise<Record<string, unknown>> => {
  const out = await runFixtureProcess(["run", AUDIT_SCRIPT, ...args], {
    ...process.env,
    ...env,
  });
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
  return JSON.parse(out.stdoutText) as Record<string, unknown>;
};

test("auto-approve creates Codex provenance and is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-audit-auto-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  const mocks = await writeMockScripts(root);
  await writeFile(
    mocks.resolver,
    "#!/usr/bin/env bash\n" +
      'if [[ "$1" == "--field" ]]; then echo route/mock-review; else echo openai-codex/mock-auditor:high; fi\n',
    { mode: 0o700 },
  );
  await mkdir(runsDir, { recursive: true });
  const runId = "12121212-1212-4121-8121-121212121212";
  await writeRun(runsDir, runId, "2020-09-29T10:00:00.000Z");
  const week = "2020-09-28";
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH: process.env.JEV_AUDIT_BASH ?? "bash",
  };
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  const first = await runAuditCli(env, [
    "run",
    "--auto-approve",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  assert.equal((first.counts as { audited: number }).audited, 1);
  const approval = JSON.parse(
    await readFile(
      join(auditDir, "weeks", week, "approvals", `${runId}.json`),
      "utf8",
    ),
  ) as { approvalMode: string };
  assert.equal(approval.approvalMode, "automatic");
  assert.equal(await readInvokeCount(mocks.countFile), 1);
  await runAuditCli(env, [
    "run",
    "--auto-approve",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  assert.equal(await readInvokeCount(mocks.countFile), 1);
  await rm(root, { recursive: true, force: true });
});

const prepareUnsafeCase = async (patch: string) => {
  const root = await mkdtemp(join(tmpdir(), "jev-auto-held-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  const mocks = await writeMockScripts(root);
  await writeFile(
    mocks.resolver,
    '#!/usr/bin/env bash\nif [[ "$1" == "--field" ]]; then echo route/mock-review; else echo openai-codex/mock-auditor:high; fi\n',
    { mode: 0o700 },
  );
  await mkdir(runsDir, { recursive: true });
  const runId = "abababab-abab-4bab-8bab-abababababab";
  await writeRun(runsDir, runId, "2020-09-29T10:00:00.000Z", patch);
  const week = "2020-09-28";
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    PI_CODING_AGENT_DIR: join(root, "pi"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH: process.env.JEV_AUDIT_BASH ?? "bash",
  };
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  return { root, runsDir, auditDir, mocks, runId, week, env };
};

const assertHeldAutomatically = async (
  fixture: Awaited<ReturnType<typeof prepareUnsafeCase>>,
  approvalBytes?: Uint8Array,
): Promise<void> => {
  const { auditDir, env, mocks, runId, runsDir, week } = fixture;
  const output = await runAuditCli(env, [
    "run",
    "--auto-approve",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  assert.equal((output.counts as { held: number }).held, 1);
  assert.equal(await readInvokeCount(mocks.countFile), 0);
  await assertNoSpendArtifacts(auditDir, week, runId);
  const approvalPath = join(
    auditDir,
    "weeks",
    week,
    "approvals",
    `${runId}.json`,
  );
  if (approvalBytes) {
    assert.deepEqual(await readFile(approvalPath), approvalBytes);
  } else await assert.rejects(() => readFile(approvalPath));
};

const manuallyApprove = async (
  fixture: Awaited<ReturnType<typeof prepareUnsafeCase>>,
): Promise<Uint8Array> => {
  const { auditDir, env, runId, runsDir, week } = fixture;
  const inspected = await runAuditCli(env, [
    "inspect",
    "--run-id",
    runId,
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]) as { stagedPath: string };
  await runAuditCli(env, [
    "approve",
    "--run-id",
    runId,
    "--approved-input",
    inspected.stagedPath,
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  return await readFile(
    join(auditDir, "weeks", week, "approvals", `${runId}.json`),
  );
};

test("credential-only automatic input is held without approval or spend", async () => {
  const fixture = await prepareUnsafeCase(
    PATCH + "+const key = AKIA1234567890ABCDEF;\n",
  );
  try {
    await assertHeldAutomatically(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("PII-only automatic input is held without approval or spend", async () => {
  const fixture = await prepareUnsafeCase(
    PATCH + "+contact alice.private@gmail.com\n",
  );
  try {
    await assertHeldAutomatically(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("existing manual approval cannot bypass automatic safety scan", async () => {
  const fixture = await prepareUnsafeCase(
    PATCH + "+contact alice.private@gmail.com\n",
  );
  try {
    const bytes = await manuallyApprove(fixture);
    await assertHeldAutomatically(fixture, bytes);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("current non-Codex provider overrides existing manual approval", async () => {
  const fixture = await prepareUnsafeCase(PATCH);
  try {
    await writeFile(
      fixture.mocks.resolver,
      `#!/usr/bin/env bash\nif [[ "$1" == "--field" ]]; then echo route/mock-review; else echo mock/non-codex; fi\n`,
      { mode: 0o700 },
    );
    const bytes = await manuallyApprove(fixture);
    await assertHeldAutomatically(fixture, bytes);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("tampered selected patch is held before automatic approval", async () => {
  const fixture = await prepareUnsafeCase(PATCH);
  try {
    await writeFile(
      join(fixture.runsDir, `2020-09-29-${fixture.runId}`, "changes.patch"),
      PATCH + "+tampered\n",
    );
    await assertHeldAutomatically(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("provider drift during automatic approval publication is held", async () => {
  const fixture = await prepareUnsafeCase(PATCH);
  try {
    const count = join(fixture.root, "resolver.count");
    await writeFile(
      fixture.mocks.resolver,
      `#!/usr/bin/env bash\nif [[ "$1" == "--field" ]]; then echo route/mock-review; exit 0; fi\nif [[ ! -f "${count}" ]]; then echo 1 > "${count}"; echo openai-codex/mock-auditor:high; else echo mock/non-codex; fi\n`,
      { mode: 0o700 },
    );
    await assertHeldAutomatically(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("prepare -> inspect -> approve -> run mocked integration", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-audit-int-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  const mocks = await writeMockScripts(root);
  await mkdir(runsDir, { recursive: true });
  const runId = "11111111-1111-4111-8111-111111111111";
  await writeRun(runsDir, runId, "2020-09-29T10:00:00.000Z");
  const week = "2020-09-28";
  const weekRoot = join(auditDir, "weeks", week);

  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH: process.env.JEV_AUDIT_BASH ?? "bash",
  };

  const prepared = await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  assert.equal((prepared.counts as { selectedTotal: number }).selectedTotal, 1);

  const preRun = await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  assert.equal(
    (preRun.counts as { needsPreflight: number; audited: number })
      .needsPreflight,
    1,
  );
  assert.equal(
    (preRun.counts as { needsPreflight: number; audited: number }).audited,
    0,
  );
  const preReport = JSON.parse(
    await readFile(preRun.reportJson as string, "utf8"),
  ) as { cases: Array<{ status: string }> };
  assert.equal(preReport.cases[0]?.status, "needs_preflight");
  assert.equal(await readInvokeCount(mocks.countFile), 0);
  await assertNoSpendArtifacts(auditDir, week, runId);

  const inspected = await runAuditCli(env, [
    "inspect",
    "--run-id",
    runId,
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]) as { stagedPath: string };
  const stagedBytes = await readFile(inspected.stagedPath);
  assert.ok(stagedBytes.length > 0);

  await runAuditCli(env, [
    "approve",
    "--run-id",
    runId,
    "--approved-input",
    inspected.stagedPath,
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);

  const firstRun = await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  assert.equal(
    (firstRun.counts as { audited: number; needsPreflight: number }).audited,
    1,
  );
  assert.equal(
    (firstRun.counts as { audited: number; needsPreflight: number })
      .needsPreflight,
    0,
  );
  const report = JSON.parse(
    await readFile(firstRun.reportJson as string, "utf8"),
  ) as {
    cases: Array<{ status: string; independent?: boolean }>;
    counts: { audited: number };
  };
  assert.equal(report.counts.audited, 1);
  assert.equal(report.cases[0]?.status, "audited");
  assert.equal(report.cases[0]?.independent, true);
  const result = JSON.parse(
    await readFile(join(weekRoot, "results", `${runId}.json`), "utf8"),
  ) as { status: string; independent: boolean; auditor?: unknown };
  assert.equal(result.status, "success");
  assert.equal(result.independent, true);
  assert.ok(result.auditor);

  assert.equal(await readInvokeCount(mocks.countFile), 1);

  const reportBefore = JSON.parse(
    await readFile(firstRun.reportJson as string, "utf8"),
  ) as Record<string, unknown>;
  const { generatedAt: _beforeGen, ...stableBefore } = reportBefore;

  const secondRun = await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  assert.equal(await readInvokeCount(mocks.countFile), 1);
  const reportAfter = JSON.parse(
    await readFile(secondRun.reportJson as string, "utf8"),
  ) as Record<string, unknown>;
  const { generatedAt: _afterGen, ...stableAfter } = reportAfter;
  assert.deepEqual(stableAfter, stableBefore);

  await rm(root, { recursive: true, force: true });
});
