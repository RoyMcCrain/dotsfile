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
  const dirName = `2026-09-29-${runId}`;
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

const runAuditCli = async (
  env: Record<string, string>,
  args: string[],
): Promise<Record<string, unknown>> => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-config", AUDIT_SCRIPT, ...args],
    env: { ...Deno.env.toObject(), ...env },
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  const text = new TextDecoder().decode(out.stdout);
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr) || text);
  }
  return JSON.parse(text) as Record<string, unknown>;
};

Deno.test("prepare -> inspect -> approve -> run mocked integration", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-audit-int-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  const mocks = await writeMockScripts(root);
  await mkdir(runsDir, { recursive: true });
  const runId = "11111111-1111-4111-8111-111111111111";
  await writeRun(runsDir, runId, "2026-09-29T10:00:00.000Z");

  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: mocks.resolver,
    PI_REVIEW_BIN: mocks.pi,
    JEV_AUDIT_BASH: "bash",
  };

  const prepared = await runAuditCli(env, [
    "prepare",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    "2026-09-28",
  ]);
  assert.equal((prepared.counts as { selectedTotal: number }).selectedTotal, 1);

  const inspected = await runAuditCli(env, [
    "inspect",
    "--run-id",
    runId,
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    "2026-09-28",
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
    "2026-09-28",
  ]);

  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    "2026-09-28",
  ]);

  const count = Number(await readFile(mocks.countFile, "utf8"));
  assert.equal(count, 1);

  await runAuditCli(env, [
    "run",
    "--runs-dir",
    runsDir,
    "--audit-dir",
    auditDir,
    "--week",
    "2026-09-28",
  ]);
  const countAgain = Number(await readFile(mocks.countFile, "utf8"));
  assert.equal(countAgain, 1);

  await rm(root, { recursive: true, force: true });
});
