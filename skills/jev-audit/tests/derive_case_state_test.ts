import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deriveCaseState } from "../scripts/report.ts";
import { promptHash } from "../scripts/result_store.ts";
import type { PlanCase } from "../scripts/plan_types.ts";

const planCase = (overrides: Partial<PlanCase> = {}): PlanCase => ({
  runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patchSha256: "c".repeat(64),
  stratum: "random",
  createdAt: "2026-09-29T01:00:00.000Z",
  effectiveLevel: 3,
  source: "jev",
  reason: "r",
  ...overrides,
});

Deno.test("stored result without approval is unavailable not audited", async () => {
  const auditBase = await mkdtemp(join(tmpdir(), "jev-derive-noap-"));
  const week = "2026-09-28";
  const pc = planCase();
  const weekRoot = join(auditBase, "weeks", week);
  await mkdir(join(weekRoot, "results"), { recursive: true });
  await writeFile(
    join(weekRoot, "results", `${pc.runId}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        runId: pc.runId,
        weekStart: week,
        patchSha256: pc.patchSha256,
        resolvedAuditorModel: "mock/auditor",
        promptHash: promptHash(),
        status: "success",
        independent: true,
        auditor: {
          minLevel: 2,
          maxLevel: 4,
          reason: "ok",
          concerns: [],
        },
        attemptedAt: "2026-01-01T00:00:00.000Z",
      })
    }\n`,
  );
  const state = await deriveCaseState(auditBase, week, pc);
  assert.equal(state.status, "unavailable");
  assert.equal(state.reason, "missing_approval");
  await rm(auditBase, { recursive: true, force: true });
});

Deno.test("week-local cached copy with wrong runId fails identity", async () => {
  const auditBase = await mkdtemp(join(tmpdir(), "jev-derive-wrong-"));
  const week = "2026-09-28";
  const pc = planCase();
  const weekRoot = join(auditBase, "weeks", week);
  await mkdir(join(weekRoot, "approvals"), { recursive: true });
  await mkdir(join(weekRoot, "results"), { recursive: true });
  const ph = promptHash();
  await writeFile(
    join(weekRoot, "approvals", `${pc.runId}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        weekStart: week,
        runId: pc.runId,
        patchSha256: pc.patchSha256,
        resolvedAuditorModel: "mock/auditor",
        approvedAt: "2026-01-01T00:00:00.000Z",
        approvedInputSha256: pc.patchSha256,
        promptVersion: 1,
        promptHash: ph,
      })
    }\n`,
  );
  await writeFile(
    join(weekRoot, "results", `${pc.runId}.json`),
    `${
      JSON.stringify({
        schemaVersion: 1,
        runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        weekStart: week,
        patchSha256: pc.patchSha256,
        resolvedAuditorModel: "mock/auditor",
        promptHash: ph,
        status: "cached",
        independent: false,
        cachedFromWeek: "2026-09-14",
        auditor: {
          minLevel: 2,
          maxLevel: 4,
          reason: "ok",
          concerns: [],
        },
        attemptedAt: "2026-01-01T00:00:00.000Z",
      })
    }\n`,
  );
  const state = await deriveCaseState(auditBase, week, pc);
  assert.equal(state.status, "unavailable");
  assert.equal(state.reason, "invalid_stored_result");
  await rm(auditBase, { recursive: true, force: true });
});
