import assert from "node:assert/strict";
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";
import { approveCase, readApproval } from "../scripts/approval_store.ts";
import {
  conservativeTokenScan,
  stagePrivatePatch,
} from "../scripts/patch_io.ts";
import { ensureWeeklyPlan } from "../scripts/prepare_plan.ts";
import {
  formatUtcDate,
  parseUtcDate,
  periodFromWeekStart,
} from "../scripts/week_period.ts";
import { writePlanImmutable } from "../scripts/plan_store.ts";
import type { WeeklyPlan } from "../scripts/plan_types.ts";
import { publishPrivateFileAtomic } from "../scripts/state_io.ts";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const COMPLETED_WEEK = "2020-09-28";

const restoreEnv = (key: string, previous: string | undefined): void => {
  if (previous === undefined) Deno.env.delete(key);
  else Deno.env.set(key, previous);
};

const assertOwnedTempLeaf = async (path: string): Promise<void> => {
  const st = await Deno.lstat(path);
  const uid = (st as Deno.FileInfo & { uid?: number }).uid;
  if (uid !== undefined && uid !== Deno.uid()) {
    throw new Error(`refusing to clean foreign-owned temp: ${path}`);
  }
};

const listJevPubTemps = async (dir: string): Promise<string[]> => {
  const names = await readdir(dir);
  return names.filter((name) =>
    name.startsWith(".jev-pub-") && name.endsWith(".tmp")
  );
};

Deno.test("stagePrivatePatch rejects pre-existing input.patch symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-stage-symlink-"));
  const outside = join(root, "outside");
  const audit = join(root, "audit");
  const victim = join(outside, "victim.txt");
  await mkdir(outside, { recursive: true });
  await mkdir(audit, { recursive: true, mode: 0o700 });
  await writeFile(victim, "KEEP", { mode: 0o600 });
  const staging = join(audit, "weeks", COMPLETED_WEEK, "staging", RUN_ID);
  await mkdir(staging, { recursive: true, mode: 0o700 });
  await symlink(victim, join(staging, "input.patch"));
  const content = new TextEncoder().encode("diff --git a/a b/a\n");
  await assert.rejects(
    () => stagePrivatePatch(audit, COMPLETED_WEEK, RUN_ID, content),
    /symlink|regular file/,
  );
  assert.equal(await readFile(victim, "utf8"), "KEEP");
  await rm(root, { recursive: true, force: true });
});

Deno.test("stagePrivatePatch rejects hard-linked outside inode", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-stage-hardlink-"));
  const audit = join(root, "audit");
  const outside = join(root, "outside.txt");
  await mkdir(audit, { recursive: true, mode: 0o700 });
  await writeFile(outside, "outside", { mode: 0o600 });
  const staging = join(audit, "weeks", COMPLETED_WEEK, "staging", RUN_ID);
  await mkdir(staging, { recursive: true, mode: 0o700 });
  await link(outside, join(staging, "input.patch"));
  await assert.rejects(
    () =>
      stagePrivatePatch(
        audit,
        COMPLETED_WEEK,
        RUN_ID,
        new TextEncoder().encode("diff\n"),
      ),
    /hard link|nlink|regular file/,
  );
  await rm(root, { recursive: true, force: true });
});

Deno.test("approveCase rejects approvals directory symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-approval-symlink-"));
  const audit = join(root, "audit");
  const outside = join(root, "outside");
  const weekRoot = join(audit, "weeks", COMPLETED_WEEK);
  await mkdir(outside, { recursive: true });
  await mkdir(join(weekRoot, "staging"), { recursive: true, mode: 0o700 });
  await symlink(outside, join(weekRoot, "approvals"));
  const patch =
    "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n";
  const patchSha256 = sha256Bytes(new TextEncoder().encode(patch));
  const staged = join(weekRoot, "staging", RUN_ID, "input.patch");
  await mkdir(join(weekRoot, "staging", RUN_ID), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(staged, patch, { mode: 0o600 });
  const runs = join(root, "runs");
  const runDir = join(runs, `2020-09-29-${RUN_ID}`);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "changes.patch"), patch, { mode: 0o600 });
  await writeFile(
    join(runDir, "metadata.json"),
    JSON.stringify({
      schemaVersion: 1,
      runId: RUN_ID,
      createdAt: "2020-09-29T00:00:00.000Z",
      repository: "/synthetic",
      revision: "synthetic",
      level: 3,
      levelScale: 5,
      levelDecision: buildJevDecision({
        level: 3,
        patchSha256,
        minConfidence: 0.7,
        model: "mock/router",
        confidence: 0.9,
      }),
    }),
  );
  const prevModel = Deno.env.get("MODEL_RESOLVER");
  const prevBash = Deno.env.get("JEV_AUDIT_BASH");
  Deno.env.set(
    "MODEL_RESOLVER",
    join(import.meta.dirname!, "fixtures/resolve_mock.sh"),
  );
  try {
    await assert.rejects(
      () =>
        approveCase({
          auditBase: audit,
          weekRoot,
          weekStart: COMPLETED_WEEK,
          runId: RUN_ID,
          patchSha256,
          approvedInputPath: staged,
          runsDir: runs,
        }),
      /symlink|approvals/,
    );
    await assert.rejects(() => Deno.stat(join(outside, `${RUN_ID}.json`)));
  } finally {
    restoreEnv("MODEL_RESOLVER", prevModel);
    restoreEnv("JEV_AUDIT_BASH", prevBash);
  }
  await rm(root, { recursive: true, force: true });
});

Deno.test("readApproval propagates non-missing approvals root errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-read-approval-"));
  const bad = join(root, "not-a-dir");
  await writeFile(bad, "file", { mode: 0o600 });
  await assert.rejects(
    () => readApproval(bad, RUN_ID),
    /directory/,
  );
  await rm(root, { recursive: true, force: true });
});

Deno.test("ensureWeeklyPlan rejects weeks symlink before outside mkdir", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-prepare-weeks-link-"));
  const auditLink = join(root, "audit-link");
  const outside = join(root, "outside");
  await mkdir(auditLink, { recursive: true, mode: 0o700 });
  await mkdir(outside, { recursive: true });
  await symlink(outside, join(auditLink, "weeks"));
  const period = periodFromWeekStart("2020-09-21");
  await assert.rejects(
    () =>
      ensureWeeklyPlan({
        auditBase: auditLink,
        period,
        runsDir: join(root, "runs"),
      }),
    /symlink|week/,
  );
  await assert.rejects(() => Deno.stat(join(outside, "2020-09-21")));
  await rm(root, { recursive: true, force: true });
});

Deno.test("ensureWeeklyPlan rejects current and future UTC weeks", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-prepare-future-"));
  const audit = join(root, "audit");
  await mkdir(join(root, "runs"), { recursive: true });
  const now = new Date();
  const todayDate = parseUtcDate(formatUtcDate(now));
  const dow = todayDate.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(
    todayDate.getTime() - daysSinceMonday * 86400000,
  );
  const mondayStr = formatUtcDate(thisMonday);
  const currentPeriod = periodFromWeekStart(mondayStr);
  await assert.rejects(
    () =>
      ensureWeeklyPlan({
        auditBase: audit,
        period: currentPeriod,
        runsDir: join(root, "runs"),
      }),
    /not yet completed|completed/,
  );
  const futureMonday = new Date(thisMonday.getTime() + 7 * 86400000);
  const futurePeriod = periodFromWeekStart(formatUtcDate(futureMonday));
  await assert.rejects(
    () =>
      ensureWeeklyPlan({
        auditBase: audit,
        period: futurePeriod,
        runsDir: join(root, "runs"),
      }),
    /not yet completed|completed/,
  );
  await rm(root, { recursive: true, force: true });
});

Deno.test("immutable JSON publish leaves no partial file on link failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-atomic-pub-"));
  const weekRoot = join(root, "weeks", COMPLETED_WEEK);
  await mkdir(weekRoot, { recursive: true, mode: 0o700 });
  const finalPath = join(weekRoot, "plan.json");
  await writeFile(finalPath, '{"blocked":true}\n', { mode: 0o600 });
  const minimalPlan: WeeklyPlan = {
    schemaVersion: 1,
    weekStart: COMPLETED_WEEK,
    weekEnd: "2020-10-05",
    seed: "a".repeat(64),
    createdAt: "2020-10-06T00:00:00.000Z",
    runsDirCanonical: join(root, "runs"),
    promptVersion: 1,
    counts: {
      historyDecisions: 0,
      eligibleUniquePatches: 0,
      duplicatePatchRuns: 0,
      excludedNotAuto: 0,
      excludedOutOfPeriod: 0,
      selectedTotal: 0,
      randomSelected: 0,
      riskSelected: 0,
    },
    selected: [],
  };
  await assert.rejects(
    () => writePlanImmutable(root, COMPLETED_WEEK, minimalPlan),
    /EEXIST|exist/,
  );
  const raw = await readFile(finalPath, "utf8");
  assert.equal(raw, '{"blocked":true}\n');
  await rm(root, { recursive: true, force: true });
});

Deno.test("conservativeTokenScan detects modern token prefixes", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  assert.throws(
    () => conservativeTokenScan(enc("token sk-proj-" + "a".repeat(40))),
    /credential/,
  );
  assert.throws(
    () => conservativeTokenScan(enc("x sk-ant-api03-" + "b".repeat(40))),
    /credential/,
  );
  assert.throws(
    () => conservativeTokenScan(enc("github_pat_" + "c".repeat(40))),
    /credential/,
  );
  assert.throws(
    () => conservativeTokenScan(enc("ghp_" + "d".repeat(36))),
    /credential/,
  );
  assert.doesNotThrow(() =>
    conservativeTokenScan(enc("sk-proj-like but not a token"))
  );
  assert.doesNotThrow(() =>
    conservativeTokenScan(enc("mention github_pat_ in docs only"))
  );
});

Deno.test("repeated stagePrivatePatch replaces regular file safely", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-stage-repeat-"));
  const audit = join(root, "audit");
  await mkdir(audit, { recursive: true, mode: 0o700 });
  const staging = join(audit, "weeks", COMPLETED_WEEK, "staging", RUN_ID);
  await mkdir(staging, { recursive: true, mode: 0o700 });
  const stagedPath = join(staging, "input.patch");
  await writeFile(stagedPath, "diff --git a/a b/a\n+0\n", { mode: 0o644 });
  const first = new TextEncoder().encode("diff --git a/a b/a\n+1\n");
  const second = new TextEncoder().encode("diff --git a/a b/a\n+2\n");
  const p1 = await stagePrivatePatch(audit, COMPLETED_WEEK, RUN_ID, first);
  const p2 = await stagePrivatePatch(audit, COMPLETED_WEEK, RUN_ID, second);
  assert.equal(p1, p2);
  assert.equal(await readFile(p2, "utf8"), new TextDecoder().decode(second));
  const st = await Deno.lstat(p2);
  assert.equal(st.mode! & 0o777, 0o600);
  await rm(root, { recursive: true, force: true });
});

Deno.test("publishPrivateFileAtomic creates private mode and no-overwrite leaf", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-pub-mode-"));
  const dir = join(root, "dir");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const finalPath = join(dir, "leaf.json");
  const outcome = await publishPrivateFileAtomic(finalPath, '{"ok":true}\n', {
    ifExists: "fail",
  });
  assert.equal(outcome, "created");
  const st = await Deno.lstat(finalPath);
  assert.equal(st.mode! & 0o777, 0o600);
  await assert.rejects(
    () => publishPrivateFileAtomic(finalPath, '{"other":true}\n'),
    /EEXIST|exist/,
  );
  assert.equal(await readFile(finalPath, "utf8"), '{"ok":true}\n');
  await rm(root, { recursive: true, force: true });
});

Deno.test("publishPrivateFileAtomic cleans up after sync failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-pub-sync-fail-"));
  const dir = join(root, "dir");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const finalPath = join(dir, "leaf.json");
  const kept = '{"keep":true}\n';
  await writeFile(finalPath, kept, { mode: 0o600 });
  const originalOpen = Deno.open;
  Deno.open = async (path, options) => {
    const handle = await originalOpen(path, options);
    const pathStr = typeof path === "string"
      ? path
      : path instanceof URL
      ? path.pathname
      : String(path);
    if (pathStr.includes(".jev-pub-") && pathStr.endsWith(".tmp")) {
      await assertOwnedTempLeaf(pathStr);
      handle.sync = () => Promise.reject(new Error("sync interrupted"));
    }
    return handle;
  };
  try {
    await assert.rejects(
      () =>
        publishPrivateFileAtomic(finalPath, '{"new":true}\n', {
          ifExists: "fail",
        }),
      /sync interrupted/,
    );
    assert.equal(await readFile(finalPath, "utf8"), kept);
    assert.equal((await listJevPubTemps(dir)).length, 0);

    const freshPath = join(dir, "fresh.json");
    await assert.rejects(
      () => publishPrivateFileAtomic(freshPath, '{"x":1}\n'),
      /sync interrupted/,
    );
    await assert.rejects(() => Deno.stat(freshPath));
    assert.equal((await listJevPubTemps(dir)).length, 0);
  } finally {
    Deno.open = originalOpen;
    await rm(root, { recursive: true, force: true });
  }
});
