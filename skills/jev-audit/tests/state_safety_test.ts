import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readPlan } from "../scripts/plan_store.ts";
import { readApproval } from "../scripts/approval_store.ts";
import { readWeekResult } from "../scripts/result_store.ts";
import { SAFE_JSON_ERROR } from "../scripts/state_io.ts";

const AUDIT_SCRIPT = join(import.meta.dirname!, "../scripts/audit.ts");

Deno.test("corrupted plan JSON yields safe error without invoking runner", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-state-"));
  const weekRoot = join(root, "weeks", "2026-09-21");
  await mkdir(weekRoot, { recursive: true, mode: 0o700 });
  await writeFile(
    join(weekRoot, "plan.json"),
    '{"schemaVersion":1,"CANARY_LEAK":',
    { mode: 0o600 },
  );
  await assert.rejects(() => readPlan(root, "2026-09-21"), (e: Error) => {
    assert.equal(e.message, SAFE_JSON_ERROR);
    assert.equal(String(e.message).includes("CANARY"), false);
    return true;
  });
  const countPath = join(root, "invoke.count");
  const result = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "--no-config",
      AUDIT_SCRIPT,
      "run",
      "--audit-dir",
      root,
      "--week",
      "2026-09-21",
    ],
    env: {
      ...Deno.env.toObject(),
      HOME: root,
      PI_REVIEW_BIN: join(root, "missing-pi"),
      JEV_AUDIT_INVOKE_COUNT: countPath,
    },
    stderr: "piped",
  }).output();
  assert.equal(result.success, false);
  await assert.rejects(() => Deno.stat(countPath));
  await rm(root, { recursive: true, force: true });
});

Deno.test("symlink approval file is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-symlink-"));
  const approvals = join(root, "approvals");
  await mkdir(approvals, { recursive: true });
  const real = join(root, "real.json");
  await writeFile(real, "{}", { mode: 0o600 });
  await symlink(
    real,
    join(approvals, "11111111-1111-4111-8111-111111111111.json"),
  );
  await assert.rejects(
    () =>
      readApproval(
        approvals,
        "11111111-1111-4111-8111-111111111111",
      ),
    /symlink/,
  );
  await rm(root, { recursive: true, force: true });
});

Deno.test("traversal runId rejected at result read", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-runid-"));
  const weekRoot = join(root, "week");
  await mkdir(join(weekRoot, "results"), { recursive: true });
  await writeFile(
    join(weekRoot, "results", "../escape.json"),
    "{}",
  ).catch(() => undefined);
  await assert.rejects(
    () => readWeekResult(root, "2026-09-21", "../evil"),
    /invalid run id/,
  );
  await rm(root, { recursive: true, force: true });
});
