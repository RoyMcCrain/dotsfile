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
import { assertAuditorIndependent } from "../scripts/model_resolve.ts";
import { cacheKey, readGlobalCache } from "../scripts/result_store.ts";
import { runSingleCase } from "../scripts/audit_run.ts";
import type { PlanCase } from "../scripts/plan_types.ts";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");

const JEV_AUDIT_BASH = Deno.env.get("JEV_AUDIT_BASH") ?? "bash";

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

const PATCH_A =
  "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n+hello-a\n";
const PATCH_B =
  "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n+shared-b\n";

const writeRun = async (
  runsDir: string,
  runId: string,
  createdAt: string,
  patch: string = PATCH_A,
) => {
  const patchSha256 = sha256Bytes(new TextEncoder().encode(patch));
  const runDir = join(runsDir, `2020-run-${runId.slice(0, 8)}`);
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
  return { patchSha256 };
};

const runAuditCli = async (
  env: Record<string, string>,
  args: string[],
  expectOk = true,
) => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-config", AUDIT_SCRIPT, ...args],
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (expectOk && !out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
  return out;
};

const approveCaseCli = async (
  env: Record<string, string>,
  runsDir: string,
  auditDir: string,
  week: string,
  runId: string,
) => {
  const inspectOut = await new Deno.Command(Deno.execPath(), {
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
    stderr: "piped",
  }).output();
  if (!inspectOut.success) {
    throw new Error(new TextDecoder().decode(inspectOut.stderr));
  }
  const inspected = JSON.parse(
    new TextDecoder().decode(inspectOut.stdout),
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
};

Deno.test("run continues after corrupt peer result and writes honest report", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-exec-stale-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const id1 = "11111111-1111-4111-8111-111111111111";
  const id2 = "22222222-2222-4222-8222-222222222222";
  await writeRun(runsDir, id1, "2020-09-29T10:00:00.000Z", PATCH_A);
  await writeRun(runsDir, id2, "2020-09-29T11:00:00.000Z", PATCH_B);
  const mocks = await writeMockScripts(
    root,
    'echo \'{"minLevel":2,"maxLevel":4,"reason":"mock","concerns":[]}\'\n',
  );
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH,
  };
  const week = "2020-09-28";
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  await approveCaseCli(env, runsDir, auditDir, week, id1);
  await approveCaseCli(env, runsDir, auditDir, week, id2);
  const weekRoot = join(auditDir, "weeks", week);
  await mkdir(join(weekRoot, "results"), { recursive: true });
  await writeFile(join(weekRoot, "results", `${id2}.json`), "{");
  const out = await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  assert.equal(out.code, 0);
  const first = JSON.parse(
    await readFile(join(weekRoot, "results", `${id1}.json`), "utf8"),
  ) as { status: string };
  assert.equal(first.status, "success");
  const report = JSON.parse(
    await readFile(join(weekRoot, "report.json"), "utf8"),
  ) as { counts: { audited: number; unavailable: number } };
  assert.equal(report.counts.audited, 1);
  assert.equal(report.counts.unavailable, 1);
  await rm(root, { recursive: true, force: true });
});

const assertNoAttemptMarkers = async (
  auditDir: string,
  weekRoot: string,
  runId: string,
) => {
  const resultsDir = join(weekRoot, "results");
  let attemptFiles: string[] = [];
  try {
    attemptFiles = (await readdir(resultsDir)).filter((n) =>
      n.endsWith(".attempt.json")
    );
  } catch {
    attemptFiles = [];
  }
  assert.equal(attemptFiles.length, 0);
  const cacheAttempts = join(auditDir, "cache", "attempts");
  let globalAttempts: string[] = [];
  try {
    globalAttempts = (await readdir(cacheAttempts)).filter((n) =>
      n.endsWith(".json")
    );
  } catch {
    globalAttempts = [];
  }
  assert.equal(globalAttempts.length, 0);
  assert.equal(
    attemptFiles.some((n) => n.startsWith(`${runId}.`)),
    false,
  );
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

const assertRepairedGlobalCacheMatchesSource = (
  repaired: Awaited<ReturnType<typeof readGlobalCache>>,
  source: Record<string, unknown>,
) => {
  assert.ok(repaired);
  assert.equal(repaired!.runId, source.runId);
  assert.equal(repaired!.weekStart, source.weekStart);
  assert.equal(repaired!.patchSha256, source.patchSha256);
  assert.equal(repaired!.resolvedAuditorModel, source.resolvedAuditorModel);
  assert.equal(repaired!.promptHash, source.promptHash);
  assert.equal(repaired!.status, source.status);
  assert.equal(repaired!.independent, source.independent);
  assert.equal(repaired!.attemptedAt, source.attemptedAt);
  assert.equal(repaired!.failureReason, source.failureReason);
  assert.deepEqual(repaired!.auditor, source.auditor);
};

const runSingleCaseReady = async (
  runsDir: string,
  auditDir: string,
  week: string,
  runId: string,
  patchSha256: string,
  env: Record<string, string>,
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
  await approveCaseCli(env, runsDir, auditDir, week, runId);
  const weekRoot = join(auditDir, "weeks", week);
  const planCase: PlanCase = {
    runId,
    patchSha256,
    stratum: "random",
    createdAt: "2020-09-29T10:00:00.000Z",
    effectiveLevel: 3,
    source: "jev",
    reason: "r",
  };
  return { weekRoot, planCase };
};

Deno.test("isolated preparation fault leaves no attempt markers and retries once", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-exec-prepfail-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const runId = "88888888-8888-4888-8888-888888888888";
  const { patchSha256 } = await writeRun(
    runsDir,
    runId,
    "2020-09-29T10:00:00.000Z",
  );
  const mocks = await writeMockScripts(
    root,
    'echo \'{"minLevel":2,"maxLevel":4,"reason":"mock","concerns":[]}\'\n',
  );
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH,
  };
  const week = "2020-09-28";
  const { weekRoot, planCase } = await runSingleCaseReady(
    runsDir,
    auditDir,
    week,
    runId,
    patchSha256,
    env,
  );
  const prevEnv: Record<string, string | undefined> = {
    HOME: Deno.env.get("HOME"),
    XDG_DATA_HOME: Deno.env.get("XDG_DATA_HOME"),
    MODEL_RESOLVER: Deno.env.get("MODEL_RESOLVER"),
    PI_REVIEW_BIN: Deno.env.get("PI_REVIEW_BIN"),
    JEV_AUDIT_BASH: Deno.env.get("JEV_AUDIT_BASH"),
  };
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const restoreEnv = () => {
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  };
  const origMakeTempDir = Deno.makeTempDir;
  Deno.makeTempDir = (options) => {
    if (options?.prefix === "jev-audit-cwd-") {
      return Promise.reject(new Error("injected isolated cwd failure"));
    }
    return origMakeTempDir.call(Deno, options);
  };
  try {
    const failed = await runSingleCase({
      auditBase: auditDir,
      weekRoot,
      weekStart: week,
      planCase,
      runsDir,
      resolvedAuditorModel: "mock/auditor-model",
    });
    assert.equal(failed.status, "unavailable");
    assert.equal(failed.reason, "run_preparation_failed");
    await assertNoAttemptMarkers(auditDir, weekRoot, runId);
    assert.equal(await readInvokeCount(mocks.countFile), 0);
  } finally {
    Deno.makeTempDir = origMakeTempDir;
    restoreEnv();
  }
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  try {
    const retry = await runSingleCase({
      auditBase: auditDir,
      weekRoot,
      weekStart: week,
      planCase,
      runsDir,
      resolvedAuditorModel: "mock/auditor-model",
    });
    assert.equal(retry.status, "audited");
    assert.equal(await readInvokeCount(mocks.countFile), 1);
  } finally {
    restoreEnv();
  }
  await rm(root, { recursive: true, force: true });
});

Deno.test("marker creation failure cleans isolated cwd and leaves no attempt markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-exec-markfail-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const runId = "99999999-9999-4999-8999-999999999999";
  const { patchSha256 } = await writeRun(
    runsDir,
    runId,
    "2020-09-29T10:00:00.000Z",
  );
  const mocks = await writeMockScripts(
    root,
    'echo \'{"minLevel":2,"maxLevel":4,"reason":"mock","concerns":[]}\'\n',
  );
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH,
  };
  const week = "2020-09-28";
  const { weekRoot, planCase } = await runSingleCaseReady(
    runsDir,
    auditDir,
    week,
    runId,
    patchSha256,
    env,
  );
  const prevEnv: Record<string, string | undefined> = {
    HOME: Deno.env.get("HOME"),
    XDG_DATA_HOME: Deno.env.get("XDG_DATA_HOME"),
    MODEL_RESOLVER: Deno.env.get("MODEL_RESOLVER"),
    PI_REVIEW_BIN: Deno.env.get("PI_REVIEW_BIN"),
    JEV_AUDIT_BASH: Deno.env.get("JEV_AUDIT_BASH"),
  };
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const restoreEnv = () => {
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  };
  let isolatedCwd: string | undefined;
  let isolatedCwdCreates = 0;
  const origMakeTempDir = Deno.makeTempDir;
  Deno.makeTempDir = (options) => {
    if (options?.prefix === "jev-audit-cwd-") {
      isolatedCwdCreates++;
      return origMakeTempDir.call(Deno, options).then(async (cwd) => {
        isolatedCwd = cwd;
        await mkdir(join(auditDir, "cache"), { recursive: true });
        await writeFile(join(auditDir, "cache", "attempts"), "block", {
          mode: 0o600,
        });
        return cwd;
      });
    }
    return origMakeTempDir.call(Deno, options);
  };
  try {
    await assert.rejects(
      () =>
        runSingleCase({
          auditBase: auditDir,
          weekRoot,
          weekStart: week,
          planCase,
          runsDir,
          resolvedAuditorModel: "mock/auditor-model",
        }),
      /EEXIST: file already exists.*\/cache\/attempts/,
    );
    assert.equal(isolatedCwdCreates, 1);
    assert.ok(isolatedCwd);
    let isolatedStillPresent = false;
    try {
      await Deno.stat(isolatedCwd!);
      isolatedStillPresent = true;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    assert.equal(isolatedStillPresent, false);
    await assertNoAttemptMarkers(auditDir, weekRoot, runId);
    assert.equal(await readInvokeCount(mocks.countFile), 0);
    await rm(join(auditDir, "cache", "attempts"));
    await mkdir(join(auditDir, "cache", "attempts"), { recursive: true });
  } finally {
    Deno.makeTempDir = origMakeTempDir;
    restoreEnv();
  }
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  try {
    const retry = await runSingleCase({
      auditBase: auditDir,
      weekRoot,
      weekStart: week,
      planCase,
      runsDir,
      resolvedAuditorModel: "mock/auditor-model",
    });
    assert.equal(retry.status, "audited");
    assert.equal(await readInvokeCount(mocks.countFile), 1);
  } finally {
    restoreEnv();
  }
  await rm(root, { recursive: true, force: true });
});

Deno.test("run_not_found leaves no attempt markers before spend", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-exec-nomarker-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const runId = "33333333-3333-4333-8333-333333333333";
  const { patchSha256 } = await writeRun(
    runsDir,
    runId,
    "2020-09-29T10:00:00.000Z",
  );
  const mocks = await writeMockScripts(root, "exit 0\n");
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH,
  };
  const week = "2020-09-28";
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  await approveCaseCli(env, runsDir, auditDir, week, runId);
  await rm(runsDir, { recursive: true, force: true });
  await mkdir(runsDir, { recursive: true });
  const weekRoot = join(auditDir, "weeks", week);
  const planCase: PlanCase = {
    runId,
    patchSha256,
    stratum: "random",
    createdAt: "2020-09-29T10:00:00.000Z",
    effectiveLevel: 3,
    source: "jev",
    reason: "r",
  };
  const outcome = await runSingleCase({
    auditBase: auditDir,
    weekRoot,
    weekStart: week,
    planCase,
    runsDir,
    resolvedAuditorModel: "mock/auditor-model",
  });
  assert.equal(outcome.status, "unavailable");
  assert.equal(outcome.reason, "run_not_found");
  const resultsDir = join(weekRoot, "results");
  let attemptFiles: string[] = [];
  try {
    attemptFiles = (await readdir(resultsDir)).filter((n) =>
      n.endsWith(".attempt.json")
    );
  } catch {
    attemptFiles = [];
  }
  assert.equal(attemptFiles.length, 0);
  const cacheAttempts = join(auditDir, "cache", "attempts");
  let globalAttempts: string[] = [];
  try {
    globalAttempts = (await readdir(cacheAttempts)).filter((n) =>
      n.endsWith(".json")
    );
  } catch {
    globalAttempts = [];
  }
  assert.equal(globalAttempts.length, 0);
  await rm(root, { recursive: true, force: true });
});

Deno.test("reconstructs missing global cache from independent week result", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-exec-cachefix-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const sharedPatch = PATCH_A;
  const patchSha256 = sha256Bytes(new TextEncoder().encode(sharedPatch));
  const id1 = "44444444-4444-4444-8444-444444444444";
  const id2 = "55555555-5555-4555-8555-555555555555";
  await writeRun(runsDir, id1, "2020-09-22T10:00:00.000Z", sharedPatch);
  await writeRun(runsDir, id2, "2020-09-29T10:00:00.000Z", sharedPatch);
  const mocks = await writeMockScripts(
    root,
    'echo \'{"minLevel":2,"maxLevel":3,"reason":"mock","concerns":[]}\'\n',
  );
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH,
  };
  const week1 = "2020-09-21";
  const week2 = "2020-09-28";
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week1,
  ]);
  await approveCaseCli(env, runsDir, auditDir, week1, id1);
  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week1,
  ]);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  const key = cacheKey(patchSha256, "mock/auditor-model");
  const week1ResultPath = join(
    auditDir,
    "weeks",
    week1,
    "results",
    `${id1}.json`,
  );
  const week1Source = JSON.parse(await readFile(week1ResultPath, "utf8"));
  await rm(join(auditDir, "cache", `${key}.json`), { force: true });
  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week1,
  ]);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  const repaired = await readGlobalCache(auditDir, key);
  assertRepairedGlobalCacheMatchesSource(repaired, week1Source);
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week2,
  ]);
  await approveCaseCli(env, runsDir, auditDir, week2, id2);
  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week2,
  ]);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  const week2Result = JSON.parse(
    await readFile(
      join(auditDir, "weeks", week2, "results", `${id2}.json`),
      "utf8",
    ),
  ) as { status: string; cachedFromWeek?: string };
  assert.equal(week2Result.status, "cached");
  assert.equal(week2Result.cachedFromWeek, week1);
  await rm(root, { recursive: true, force: true });
});

Deno.test("reconstructs missing global cache for independent failure week result", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-exec-cachefail-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const sharedPatch = PATCH_A;
  const patchSha256 = sha256Bytes(new TextEncoder().encode(sharedPatch));
  const id1 = "66666666-6666-4666-8666-666666666666";
  const id2 = "77777777-7777-4777-8777-777777777777";
  await writeRun(runsDir, id1, "2020-09-22T10:00:00.000Z", sharedPatch);
  await writeRun(runsDir, id2, "2020-09-29T10:00:00.000Z", sharedPatch);
  const mocks = await writeMockScripts(root, "exit 3\n");
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH,
  };
  const week1 = "2020-09-21";
  const week2 = "2020-09-28";
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week1,
  ]);
  await approveCaseCli(env, runsDir, auditDir, week1, id1);
  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week1,
  ]);
  const key = cacheKey(patchSha256, "mock/auditor-model");
  const week1ResultPath = join(
    auditDir,
    "weeks",
    week1,
    "results",
    `${id1}.json`,
  );
  const week1Source = JSON.parse(await readFile(week1ResultPath, "utf8"));
  await rm(join(auditDir, "cache", `${key}.json`), { force: true });
  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week1,
  ]);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  const repaired = await readGlobalCache(auditDir, key);
  assertRepairedGlobalCacheMatchesSource(repaired, week1Source);
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week2,
  ]);
  await approveCaseCli(env, runsDir, auditDir, week2, id2);
  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week2,
  ]);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  const week2Result = JSON.parse(
    await readFile(
      join(auditDir, "weeks", week2, "results", `${id2}.json`),
      "utf8",
    ),
  ) as { status: string };
  assert.equal(week2Result.status, "cached");
  await rm(root, { recursive: true, force: true });
});

Deno.test("conflicting global success cache blocks reuse without model calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-exec-cacheconflict-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  await mkdir(runsDir, { recursive: true });
  const sharedPatch = PATCH_A;
  const patchSha256 = sha256Bytes(new TextEncoder().encode(sharedPatch));
  const id1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await writeRun(runsDir, id1, "2020-09-22T10:00:00.000Z", sharedPatch);
  const mocks = await writeMockScripts(
    root,
    'echo \'{"minLevel":2,"maxLevel":4,"reason":"mock","concerns":[]}\'\n',
  );
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH,
  };
  const week1 = "2020-09-21";
  await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week1,
  ]);
  await approveCaseCli(env, runsDir, auditDir, week1, id1);
  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week1,
  ]);
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  const key = cacheKey(patchSha256, "mock/auditor-model");
  const source = JSON.parse(
    await readFile(
      join(auditDir, "weeks", week1, "results", `${id1}.json`),
      "utf8",
    ),
  );
  await writeFile(
    join(auditDir, "cache", `${key}.json`),
    `${
      JSON.stringify(
        {
          ...source,
          auditor: {
            minLevel: 1,
            maxLevel: 1,
            reason: "conflict",
            concerns: ["x"],
          },
        },
        null,
        2,
      )
    }\n`,
    { mode: 0o600 },
  );
  const weekRoot = join(auditDir, "weeks", week1);
  const planCase: PlanCase = {
    runId: id1,
    patchSha256,
    stratum: "random",
    createdAt: "2020-09-22T10:00:00.000Z",
    effectiveLevel: 3,
    source: "jev",
    reason: "r",
  };
  const blocked = await runSingleCase({
    auditBase: auditDir,
    weekRoot,
    weekStart: week1,
    planCase,
    runsDir,
    resolvedAuditorModel: "mock/auditor-model",
  });
  assert.equal(blocked.status, "unavailable");
  assert.equal(blocked.reason, "global_cache_conflict");
  assert.equal(Number(await readFile(mocks.countFile, "utf8")), 1);
  await rm(root, { recursive: true, force: true });
});

Deno.test("assertAuditorIndependent fail-closed and historical jev checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-model-resolve-"));
  const noRoute = join(root, "no-route.sh");
  await writeFile(
    noRoute,
    '#!/usr/bin/env bash\nif [[ "${1:-}" == "--field" ]]; then exit 1; fi\necho mock/auditor-role\n',
    { mode: 0o700 },
  );
  const prev = Deno.env.get("MODEL_RESOLVER");
  Deno.env.set("MODEL_RESOLVER", noRoute);
  Deno.env.set("HOME", root);
  try {
    await assert.rejects(
      () => assertAuditorIndependent("mock/auditor-role", undefined),
      /cannot be verified/,
    );
    await assert.rejects(
      () => assertAuditorIndependent("mock/auditor-role", "mock/auditor-role"),
      /must differ/,
    );
    await assertAuditorIndependent(
      "mock/auditor-role",
      "route/known-jev-model",
    );
  } finally {
    if (prev === undefined) Deno.env.delete("MODEL_RESOLVER");
    else Deno.env.set("MODEL_RESOLVER", prev);
  }
  await rm(root, { recursive: true, force: true });
});
