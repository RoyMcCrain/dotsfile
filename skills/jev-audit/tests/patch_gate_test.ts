import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readPatchFromRun } from "../scripts/patch_io.ts";
import { runSingleCase } from "../scripts/audit_run.ts";
import type { PlanCase, WeeklyPlan } from "../scripts/plan_types.ts";
import { writePlanImmutable } from "../scripts/plan_store.ts";

Deno.test("patch hash mismatch rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-patch-"));
  const runDir = join(root, "run");
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "changes.patch"), "diff\n", { mode: 0o600 });
  const hash = "b".repeat(64);
  await assert.rejects(
    () => readPatchFromRun(runDir, hash),
    /mismatch/,
  );
  await rm(root, { recursive: true, force: true });
});

Deno.test("no runner without approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-noap-"));
  await mkdir(root, { recursive: true, mode: 0o700 });
  const weekStart = "2026-09-28";
  const weekRoot = join(root, "weeks", weekStart);
  await mkdir(weekRoot, { recursive: true, mode: 0o700 });
  const plan: WeeklyPlan = {
    schemaVersion: 1,
    weekStart,
    weekEnd: "2026-10-05",
    seed: "a".repeat(64),
    createdAt: "2026-01-01T00:00:00.000Z",
    runsDirCanonical: "/tmp/runs",
    promptVersion: 1,
    counts: {
      historyDecisions: 0,
      eligibleUniquePatches: 0,
      duplicatePatchRuns: 0,
      excludedNotAuto: 0,
      excludedOutOfPeriod: 0,
      selectedTotal: 1,
      randomSelected: 1,
      riskSelected: 0,
    },
    selected: [{
      runId: "66666666-6666-4666-8666-666666666666",
      patchSha256: "a".repeat(64),
      stratum: "random",
      createdAt: "2026-09-29T01:00:00.000Z",
      effectiveLevel: 3,
      source: "jev",
      reason: "jev_ok",
    }],
  };
  await writePlanImmutable(root, weekStart, plan);
  Deno.env.set(
    "MODEL_RESOLVER",
    join(import.meta.dirname!, "fixtures/resolve_mock.sh"),
  );
  try {
    const state = await runSingleCase({
      auditBase: root,
      weekRoot,
      weekStart: plan.weekStart,
      planCase: plan.selected[0] as PlanCase,
    });
    assert.equal(state.status, "needs_preflight");
  } finally {
    Deno.env.delete("MODEL_RESOLVER");
  }
  await rm(root, { recursive: true, force: true });
});
