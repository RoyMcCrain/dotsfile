import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";
import { runSingleCase } from "../scripts/audit_run.ts";
import { indexRunDirs } from "../scripts/locate_run.ts";
import { ensurePrivateDir } from "../scripts/paths.ts";
import { promptHash } from "../scripts/result_store.ts";

const PATCH = "diff --git a/a b\n+1\n";
const patchSha = sha256Bytes(new TextEncoder().encode(PATCH));

const writeMetaRun = async (
  runsDir: string,
  dirName: string,
  runId: string,
  patchHash: string = patchSha,
) => {
  const runDir = join(runsDir, dirName);
  await mkdir(runDir, { recursive: true });
  await writeFile(
    join(runDir, "metadata.json"),
    `${
      JSON.stringify({
        schemaVersion: 1,
        runId,
        createdAt: "2026-09-29T10:00:00.000Z",
        repository: "/tmp/r",
        revision: "abc",
        level: 2,
        levelScale: 5,
        levelDecision: buildJevDecision({
          level: 2,
          patchSha256: patchHash,
          minConfidence: 0.7,
          model: "route/mock-jev",
          confidence: 0.9,
        }),
      })
    }\n`,
  );
  await writeFile(join(runDir, "changes.patch"), PATCH);
  return runDir;
};

Deno.test("duplicate runId excludes all dirs from index", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "jev-locate-dup-"));
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await writeMetaRun(runsDir, "2026-09-29-a", id);
  await writeMetaRun(runsDir, "2026-09-29-b", id);
  const index = await indexRunDirs(runsDir);
  assert.equal(index.byRunId.has(id), false);
  assert.ok(
    index.warnings.some((w) => w.reason === "duplicate_run_id"),
  );
  await rm(runsDir, { recursive: true, force: true });
});

Deno.test("symlink metadata.json is rejected", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "jev-locate-sym-"));
  const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const runDir = join(runsDir, "2026-09-29-c");
  await mkdir(runDir);
  const realMeta = join(runsDir, "outside-meta.json");
  await writeFile(realMeta, '{"schemaVersion":1}\n');
  await symlink(realMeta, join(runDir, "metadata.json"));
  const index = await indexRunDirs(runsDir);
  assert.equal(index.byRunId.has(id), false);
  assert.ok(index.warnings.some((w) => w.reason === "symlink_metadata"));
  await rm(runsDir, { recursive: true, force: true });
});

Deno.test("run rejects metadata patchSha256 mismatch with plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-run-meta-"));
  const runsDir = join(root, "runs");
  const auditBase = join(root, "audit");
  const week = "2026-09-28";
  const weekRoot = join(auditBase, "weeks", week);
  await ensurePrivateDir(auditBase);
  await mkdir(join(weekRoot, "approvals"), { recursive: true });
  const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await writeMetaRun(runsDir, "2026-09-29-d", id, "d".repeat(64));
  const ph = promptHash();
  await writeFile(
    join(weekRoot, "approvals", `${id}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        weekStart: week,
        runId: id,
        patchSha256: patchSha,
        resolvedAuditorModel: "mock/auditor",
        approvedAt: "2026-01-01T00:00:00.000Z",
        approvedInputSha256: patchSha,
        promptVersion: 1,
        promptHash: ph,
      })
    }\n`,
  );
  const outcome = await runSingleCase({
    auditBase,
    weekRoot,
    weekStart: week,
    planCase: {
      runId: id,
      patchSha256: patchSha,
      stratum: "random",
      createdAt: "2026-09-29T01:00:00.000Z",
      effectiveLevel: 2,
      source: "jev",
      reason: "r",
    },
    runsDir,
    resolvedAuditorModel: "mock/auditor",
  });
  assert.equal(outcome.status, "unavailable");
  if (outcome.status === "unavailable") {
    assert.equal(outcome.reason, "metadata_patch_mismatch");
  }
  await rm(root, { recursive: true, force: true });
});

Deno.test("invalid metadata.json is not indexed", async () => {
  const runsDir = await mkdtemp(join(tmpdir(), "jev-locate-bad-"));
  const runDir = join(runsDir, "2026-09-29-bad");
  await mkdir(runDir);
  await writeFile(join(runDir, "metadata.json"), '{"schemaVersion":99}\n');
  const index = await indexRunDirs(runsDir);
  assert.equal(index.byRunId.size, 0);
  assert.ok(index.warnings.some((w) => w.reason === "invalid_metadata"));
  await rm(runsDir, { recursive: true, force: true });
});
