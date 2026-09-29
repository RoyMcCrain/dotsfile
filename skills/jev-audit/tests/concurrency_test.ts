import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");
const PATCH = "diff --git a/x b/x\n+2\n";

const writeRun = async (
  runsDir: string,
  runId: string,
  createdAt: string,
  hash: string,
) => {
  const runDir = join(runsDir, `${createdAt.slice(0, 10)}-${runId}`);
  await mkdir(runDir, { recursive: true });
  const levelDecision = buildJevDecision({
    level: 3,
    patchSha256: hash,
    minConfidence: 0.7,
    model: "route/mock-jev",
    confidence: 0.9,
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
  );
  await writeFile(join(runDir, "changes.patch"), PATCH);
};

Deno.test("parallel run across weeks performs at most one Pi invocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-conc-"));
  const runsDir = join(root, "runs");
  const auditDir = join(root, "audit");
  const resolver = join(root, "resolve-model.sh");
  await writeFile(
    resolver,
    "#!/usr/bin/env bash\n" +
      'if [[ "$1" == "--field" && "$2" == "id" ]]; then echo route/mock-review; exit 0; fi\n' +
      "echo mock/auditor-model\n",
    { mode: 0o700 },
  );
  const countFile = join(root, "invoke.count");
  const pi = join(root, "fake_pi.sh");
  await writeFile(
    pi,
    "#!/usr/bin/env bash\n" +
      'echo 1 >> "' + countFile.replaceAll('"', '\\"') + '"\n' +
      'echo \'{"minLevel":2,"maxLevel":4,"reason":"mock","concerns":[]}\'\n',
    { mode: 0o700 },
  );
  const hash = sha256Bytes(new TextEncoder().encode(PATCH));
  const runA = "44444444-4444-4444-8444-444444444444";
  const runB = "55555555-5555-4555-8555-555555555555";
  await writeRun(runsDir, runA, "2026-09-16T10:00:00.000Z", hash);
  await writeRun(runsDir, runB, "2026-09-23T10:00:00.000Z", hash);
  const env = {
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    MODEL_RESOLVER: resolver,
    PI_REVIEW_BIN: pi,
    JEV_AUDIT_BASH: "bash",
  };
  const approveWeek = async (week: string, runId: string) => {
    await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--no-config",
        AUDIT_SCRIPT,
        "prepare",
        "--runs-dir",
        runsDir,
        "--audit-dir",
        auditDir,
        "--week",
        week,
      ],
      env: { ...Deno.env.toObject(), ...env },
    }).output();
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
    }).output();
    assert.equal(
      inspectOut.success,
      true,
      new TextDecoder().decode(inspectOut.stderr),
    );
    const staged = JSON.parse(new TextDecoder().decode(inspectOut.stdout))
      .stagedPath as string;
    const approved = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--no-config",
        AUDIT_SCRIPT,
        "approve",
        "--run-id",
        runId,
        "--approved-input",
        staged,
        "--runs-dir",
        runsDir,
        "--audit-dir",
        auditDir,
        "--week",
        week,
      ],
      env: { ...Deno.env.toObject(), ...env },
      stderr: "piped",
    }).output();
    assert.equal(
      approved.success,
      true,
      new TextDecoder().decode(approved.stderr),
    );
  };
  await approveWeek("2026-09-14", runA);
  await approveWeek("2026-09-21", runB);
  const p1 = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "--no-config",
      AUDIT_SCRIPT,
      "run",
      "--runs-dir",
      runsDir,
      "--audit-dir",
      auditDir,
      "--week",
      "2026-09-14",
    ],
    env: { ...Deno.env.toObject(), ...env },
  }).spawn();
  const p2 = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "--no-config",
      AUDIT_SCRIPT,
      "run",
      "--runs-dir",
      runsDir,
      "--audit-dir",
      auditDir,
      "--week",
      "2026-09-21",
    ],
    env: { ...Deno.env.toObject(), ...env },
  }).spawn();
  await Promise.all([p1.status, p2.status]);
  const count = Number(await readFile(countFile, "utf8"));
  assert.equal(count, 1);
  await rm(root, { recursive: true, force: true });
});
