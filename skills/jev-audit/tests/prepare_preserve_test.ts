import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";
import { promptHash } from "../scripts/result_store.ts";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");
const PATCH = "diff --git a/a b\n+1\n";

const runCli = async (
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

Deno.test("repeated prepare preserves unavailable failure state", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-prep-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  const runId = "22222222-2222-4222-8222-222222222222";
  const hash = sha256Bytes(new TextEncoder().encode(PATCH));
  const runDir = join(runsDir, `2020-09-29-${runId}`);
  await mkdir(runDir, { recursive: true });
  await writeFile(
    join(runDir, "metadata.json"),
    JSON.stringify({
      schemaVersion: 1,
      runId,
      createdAt: "2020-09-29T12:00:00.000Z",
      repository: "/r",
      revision: "abc",
      level: 2,
      levelScale: 5,
      levelDecision: buildJevDecision({
        level: 2,
        patchSha256: hash,
        minConfidence: 0.7,
        model: "route/mock-jev",
        confidence: 0.9,
      }),
    }),
  );
  await writeFile(join(runDir, "changes.patch"), PATCH);
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: join(import.meta.dirname!, "fixtures/resolve_mock.sh"),
  };
  const week = "2020-09-28";
  await runCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  const weekRoot = join(auditDir, "weeks", week);
  await mkdir(join(weekRoot, "approvals"), { recursive: true });
  await mkdir(join(weekRoot, "results"), { recursive: true });
  await writeFile(
    join(weekRoot, "approvals", `${runId}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        weekStart: week,
        runId,
        patchSha256: hash,
        resolvedAuditorModel: "mock/auditor",
        approvedAt: "2020-09-29T00:00:00.000Z",
        approvedInputSha256: hash,
        promptVersion: 1,
        promptHash: promptHash(),
      })
    }\n`,
  );
  await writeFile(
    join(weekRoot, "results", `${runId}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        runId,
        weekStart: week,
        patchSha256: hash,
        resolvedAuditorModel: "mock/auditor",
        promptHash: promptHash(),
        status: "failure",
        independent: true,
        failureReason: "runner_failed",
        attemptedAt: "2020-09-29T00:00:00.000Z",
      })
    }\n`,
  );
  const second = await runCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    week,
  ]);
  const report = JSON.parse(
    await readFile(second.reportJson as string, "utf8"),
  ) as { cases: Array<{ status: string; failureReason?: string }> };
  assert.equal(report.cases[0]?.status, "unavailable");
  assert.equal(report.cases[0]?.failureReason, "runner_failed");
  await rm(root, { recursive: true, force: true });
});
