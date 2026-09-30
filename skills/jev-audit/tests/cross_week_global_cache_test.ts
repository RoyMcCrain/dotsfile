import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");

const PATCH =
  "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n+shared\n";

const writeMockScripts = async (dir: string, piBody: string) => {
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
      piBody,
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
  const runDir = join(runsDir, `2020-run-${runId.slice(0, 8)}`);
  await mkdir(runDir, { mode: 0o700 });
  await writeFile(
    join(runDir, "metadata.json"),
    `${
      JSON.stringify({
        schemaVersion: 1,
        runId,
        createdAt,
        repository: "/tmp/repo",
        revision: "deadbeef",
        level: 3,
        levelScale: 5,
        levelDecision: buildJevDecision({
          level: 3,
          patchSha256,
          minConfidence: 0.7,
          model: "route/mock-jev",
          confidence: 0.95,
        }),
      })
    }\n`,
    { mode: 0o600 },
  );
  await writeFile(join(runDir, "changes.patch"), PATCH, { mode: 0o600 });
  return { patchSha256 };
};

const runAuditCli = async (
  env: Record<string, string>,
  args: string[],
): Promise<void> => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-config", AUDIT_SCRIPT, ...args],
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
};

const approveAndRunWeek = async (
  env: Record<string, string>,
  runsDir: string,
  auditDir: string,
  week: string,
  runId: string,
) => {
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  const inspected = JSON.parse(
    new TextDecoder().decode(
      (
        await new Deno.Command(Deno.execPath(), {
          args: [
            "run",
            "-A",
            "--no-config",
            AUDIT_SCRIPT,
            "inspect",
            "--run-id",
            runId,
            "--runs-dir",
            runsDir,
            "--audit-dir",
            auditDir,
            "--week",
            week,
          ],
          env: { ...Deno.env.toObject(), ...env },
          stdout: "piped",
        }).output()
      ).stdout,
    ),
  ) as { stagedPath: string };
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
  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
};

Deno.test("cross-week success cache reuses global result despite attempt marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-xweek-ok-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const runId1 = "11111111-1111-4111-8111-111111111111";
  const runId2 = "22222222-2222-4222-8222-222222222222";
  await writeRun(runsDir, runId1, "2020-09-22T10:00:00.000Z");
  await writeRun(runsDir, runId2, "2020-09-29T10:00:00.000Z");
  const mocks = await writeMockScripts(
    root,
    'echo \'{"minLevel":2,"maxLevel":4,"reason":"mock","concerns":[]}\'\n',
  );
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH: Deno.env.get("JEV_AUDIT_BASH") ?? "bash",
  };
  await approveAndRunWeek(env, runsDir, auditDir, "2020-09-21", runId1);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  await approveAndRunWeek(env, runsDir, auditDir, "2020-09-28", runId2);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  const week2Result = JSON.parse(
    await readFile(
      join(auditDir, "weeks", "2020-09-28", "results", `${runId2}.json`),
      "utf8",
    ),
  ) as { status: string; cachedFromWeek?: string };
  assert.equal(week2Result.status, "cached");
  assert.equal(week2Result.cachedFromWeek, "2020-09-21");
  await rm(root, { recursive: true, force: true });
});

Deno.test("cross-week failure cache stays unavailable without second invoke", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-xweek-fail-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const runId1 = "33333333-3333-4333-8333-333333333333";
  const runId2 = "44444444-4444-4444-8444-444444444444";
  await writeRun(runsDir, runId1, "2020-09-22T10:00:00.000Z");
  await writeRun(runsDir, runId2, "2020-09-29T10:00:00.000Z");
  const mocks = await writeMockScripts(root, "exit 3\n");
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH: Deno.env.get("JEV_AUDIT_BASH") ?? "bash",
  };
  await approveAndRunWeek(env, runsDir, auditDir, "2020-09-21", runId1);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  await approveAndRunWeek(env, runsDir, auditDir, "2020-09-28", runId2);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  await runAuditCli(env, [
    "report",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    "2020-09-28",
  ]);
  const report = JSON.parse(
    await readFile(
      join(auditDir, "weeks", "2020-09-28", "report.json"),
      "utf8",
    ),
  ) as { cases: Array<{ status: string }> };
  assert.equal(report.cases[0]?.status, "unavailable");
  await rm(root, { recursive: true, force: true });
});
