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
) => {
  const patchSha256 = sha256Bytes(new TextEncoder().encode(PATCH));
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
  await writeFile(join(runDir, "changes.patch"), PATCH, { mode: 0o600 });
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
};

const runAuditCli = async (
  env: Record<string, string>,
  args: string[],
): Promise<Record<string, unknown>> => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-config", AUDIT_SCRIPT, ...args],
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
  return JSON.parse(new TextDecoder().decode(out.stdout)) as Record<
    string,
    unknown
  >;
};

Deno.test("prepare -> inspect -> approve -> run mocked integration", async () => {
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
    JEV_AUDIT_BASH: Deno.env.get("JEV_AUDIT_BASH") ?? "bash",
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
