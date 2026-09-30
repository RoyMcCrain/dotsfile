import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AUDITOR_PROMPT_VERSION } from "../scripts/auditor_prompt.ts";
import { parseAuditorResponse } from "../scripts/parse_auditor_json.ts";
import { readJsonFile, SAFE_JSON_ERROR } from "../scripts/state_io.ts";
import {
  validateApprovalRecord,
  validateAuditResultRecord,
  validateWeeklyPlan,
} from "../scripts/validate_state.ts";
import { periodFromWeekStart } from "../scripts/week_period.ts";

const SEED = "a".repeat(64);
const PATCH = "b".repeat(64);
const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROMPT_HASH = "c".repeat(64);
const ONE_MIB = 1 << 20;

/** ASCII JSON string literal whose UTF-8 size is exactly `totalBytes`. */
const asciiJsonStringPayload = (totalBytes: number) => {
  const innerLen = totalBytes - 2;
  assert.ok(innerLen >= 0);
  const payload = `"${"x".repeat(innerLen)}"`;
  assert.equal(new TextEncoder().encode(payload).byteLength, totalBytes);
  return payload;
};

const expectSafeJsonError = (e: Error) => {
  assert.equal(e.message, SAFE_JSON_ERROR);
  return true;
};

const baseCounts = () => ({
  historyDecisions: 1,
  eligibleUniquePatches: 1,
  duplicatePatchRuns: 0,
  excludedNotAuto: 0,
  excludedOutOfPeriod: 0,
  selectedTotal: 1,
  randomSelected: 1,
  riskSelected: 0,
});

const basePlanCase = (createdAt: string) => ({
  runId: RUN_ID,
  patchSha256: PATCH,
  stratum: "random" as const,
  createdAt,
  effectiveLevel: 3 as const,
  source: "jev" as const,
  reason: "r",
});

const baseWeeklyPlan = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  weekStart: "2020-09-28",
  weekEnd: "2020-10-05",
  seed: SEED,
  createdAt: "2026-01-15T12:00:00.000Z",
  runsDirCanonical: "/tmp/runs",
  promptVersion: AUDITOR_PROMPT_VERSION,
  counts: baseCounts(),
  selected: [basePlanCase("2020-09-29T12:00:00.000Z")],
  ...overrides,
});

const baseSuccessResult = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  runId: RUN_ID,
  weekStart: "2020-09-28",
  patchSha256: PATCH,
  resolvedAuditorModel: "mock/auditor",
  promptHash: PROMPT_HASH,
  status: "success" as const,
  independent: true,
  auditor: {
    minLevel: 2,
    maxLevel: 4,
    reason: "ok",
    concerns: [] as string[],
  },
  attemptedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

Deno.test("validateWeeklyPlan rejects non-array historyWarningCodes", () => {
  assert.throws(
    () =>
      validateWeeklyPlan(baseWeeklyPlan({
        counts: { ...baseCounts(), historyWarningCodes: "bad" },
      })),
    /historyWarningCodes/,
  );
});

Deno.test("validateWeeklyPlan accepts bounded historyWarningCodes array", () => {
  const plan = validateWeeklyPlan(baseWeeklyPlan({
    counts: {
      ...baseCounts(),
      selectedTotal: 0,
      randomSelected: 0,
      historyWarningCodes: ["duplicate_run_id:2"],
    },
    selected: [],
  }));
  assert.deepEqual(plan.counts.historyWarningCodes, ["duplicate_run_id:2"]);
});

Deno.test("validateWeeklyPlan rejects invalid plan createdAt timestamp", () => {
  assert.throws(
    () => validateWeeklyPlan(baseWeeklyPlan({ createdAt: "not-a-date" })),
    /createdAt/,
  );
});

Deno.test("validateWeeklyPlan allows plan createdAt outside sampling week", () => {
  const plan = validateWeeklyPlan(baseWeeklyPlan({
    createdAt: "2030-06-01T00:00:00.000Z",
  }));
  assert.equal(plan.createdAt, "2030-06-01T00:00:00.000Z");
});

Deno.test("validateWeeklyPlan rejects selected case createdAt before week", () => {
  assert.throws(
    () =>
      validateWeeklyPlan(baseWeeklyPlan({
        selected: [basePlanCase("2020-09-27T23:59:59.999Z")],
      })),
    /period|createdAt/,
  );
  assert.throws(
    () =>
      validateWeeklyPlan(baseWeeklyPlan({
        selected: [basePlanCase("2020-09-27T12:00:00.000Z")],
      })),
    /period|createdAt/,
  );
});

Deno.test("validateWeeklyPlan rejects selected case at weekEnd boundary", () => {
  const period = periodFromWeekStart("2020-09-28");
  assert.throws(
    () =>
      validateWeeklyPlan(baseWeeklyPlan({
        selected: [basePlanCase(period.weekEndIso)],
      })),
    /period|createdAt/,
  );
});

Deno.test("validateWeeklyPlan accepts selected case at weekStart and before weekEnd", () => {
  const period = periodFromWeekStart("2020-09-28");
  validateWeeklyPlan(baseWeeklyPlan({
    selected: [basePlanCase(period.weekStartIso)],
  }));
  validateWeeklyPlan(baseWeeklyPlan({
    selected: [basePlanCase("2020-10-04T23:59:59.999Z")],
  }));
});

Deno.test("validateWeeklyPlan accepts Date.parseable non-ISO selected createdAt in week", () => {
  validateWeeklyPlan(baseWeeklyPlan({
    selected: [basePlanCase("Mon, 28 Sep 2020 12:00:00 GMT")],
  }));
});

Deno.test("validateApprovalRecord rejects invalid approvedAt", () => {
  assert.throws(
    () =>
      validateApprovalRecord({
        schemaVersion: 1,
        weekStart: "2020-09-28",
        runId: RUN_ID,
        patchSha256: PATCH,
        resolvedAuditorModel: "m",
        approvedAt: "nope",
        approvedInputSha256: PATCH,
        promptVersion: AUDITOR_PROMPT_VERSION,
        promptHash: PROMPT_HASH,
      }),
    /approvedAt/,
  );
});

Deno.test("validateApprovalRecord accepts Date.parseable non-ISO approvedAt", () => {
  const record = validateApprovalRecord({
    schemaVersion: 1,
    weekStart: "2020-09-28",
    runId: RUN_ID,
    patchSha256: PATCH,
    resolvedAuditorModel: "m",
    approvedAt: "Mon, 15 Jan 2026 12:00:00 GMT",
    approvedInputSha256: PATCH,
    promptVersion: AUDITOR_PROMPT_VERSION,
    promptHash: PROMPT_HASH,
  });
  assert.equal(record.approvedAt, "Mon, 15 Jan 2026 12:00:00 GMT");
});

Deno.test("validateAuditResultRecord rejects invalid attemptedAt", () => {
  assert.throws(
    () =>
      validateAuditResultRecord(
        baseSuccessResult({ attemptedAt: "not-a-date" }),
      ),
    /attemptedAt/,
  );
});

Deno.test("validateAuditResultRecord accepts Date.parseable non-ISO attemptedAt", () => {
  const record = validateAuditResultRecord(baseSuccessResult({
    attemptedAt: "Wed, 01 Jan 2026 00:00:00 GMT",
  }));
  assert.equal(record.attemptedAt, "Wed, 01 Jan 2026 00:00:00 GMT");
});

Deno.test("validateAuditResultRecord rejects cachedFromWeek on success", () => {
  assert.throws(
    () =>
      validateAuditResultRecord(baseSuccessResult({
        cachedFromWeek: "2020-09-21",
      })),
    /cachedFromWeek/,
  );
});

Deno.test("validateAuditResultRecord rejects cachedFromWeek on failure", () => {
  assert.throws(
    () =>
      validateAuditResultRecord({
        schemaVersion: 1,
        runId: RUN_ID,
        weekStart: "2020-09-28",
        patchSha256: PATCH,
        resolvedAuditorModel: "mock/auditor",
        promptHash: PROMPT_HASH,
        status: "failure",
        independent: true,
        failureReason: "runner_failed",
        attemptedAt: "2026-01-01T00:00:00.000Z",
        cachedFromWeek: "2020-09-21",
      }),
    /cachedFromWeek/,
  );
});

Deno.test("validateAuditResultRecord allows cached backfill from newer sampling week", () => {
  const record = validateAuditResultRecord({
    schemaVersion: 1,
    runId: RUN_ID,
    weekStart: "2020-09-28",
    patchSha256: PATCH,
    resolvedAuditorModel: "mock/auditor",
    promptHash: PROMPT_HASH,
    status: "cached",
    independent: false,
    cachedFromWeek: "2020-10-05",
    auditor: {
      minLevel: 2,
      maxLevel: 3,
      reason: "ok",
      concerns: [],
    },
    attemptedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(record.cachedFromWeek, "2020-10-05");
});

Deno.test({
  name: "readJsonFile reads ordinary JSON",
  sanitizeResources: true,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-read-json-"));
    const path = join(root, "ok.json");
    try {
      await writeFile(path, '{"a":1}\n', { mode: 0o600 });
      assert.deepEqual(await readJsonFile(path), { a: 1 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test("readJsonFile missing file propagates not found", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-read-miss-"));
  const path = join(root, "missing.json");
  await assert.rejects(() => readJsonFile(path), Deno.errors.NotFound);
  await rm(root, { recursive: true, force: true });
});

Deno.test({
  name: "readJsonFile rejects invalid JSON with safe error",
  sanitizeResources: true,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-read-bad-"));
    const path = join(root, "bad.json");
    try {
      await writeFile(path, "{", { mode: 0o600 });
      await assert.rejects(() => readJsonFile(path), expectSafeJsonError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "readJsonFile rejects file larger than 1 MiB",
  sanitizeResources: true,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-read-big-"));
    const path = join(root, "big.json");
    try {
      const payload = asciiJsonStringPayload(ONE_MIB + 2);
      await writeFile(path, payload, { mode: 0o600 });
      await assert.rejects(() => readJsonFile(path), expectSafeJsonError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "readJsonFile rejects valid JSON at exactly 1 MiB plus one byte",
  sanitizeResources: true,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-read-max-plus-"));
    const path = join(root, "max-plus-one.json");
    try {
      await writeFile(path, asciiJsonStringPayload(ONE_MIB + 1), {
        mode: 0o600,
      });
      await assert.rejects(() => readJsonFile(path), expectSafeJsonError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "readJsonFile accepts valid JSON at exactly 1 MiB",
  sanitizeResources: true,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-read-bound-"));
    const path = join(root, "bound.json");
    try {
      const payload = asciiJsonStringPayload(ONE_MIB);
      await writeFile(path, payload, { mode: 0o600 });
      const parsed = await readJsonFile(path);
      assert.equal(typeof parsed, "string");
      assert.equal((parsed as string).length, ONE_MIB - 2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "readJsonFile completes JSON after legal short reads",
  sanitizeResources: true,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-read-short-"));
    const path = join(root, "chunked.json");
    const content = '{"ok":true,"n":42}';
    const origOpen = Deno.open;
    Deno.open = async (...args: Parameters<typeof Deno.open>) => {
      const file = await origOpen(...args);
      const read = file.read.bind(file);
      file.read = (buf: Uint8Array) => {
        const slice = buf.subarray(0, Math.min(3, buf.length));
        return read(slice);
      };
      return file;
    };
    try {
      await writeFile(path, content, { mode: 0o600 });
      assert.deepEqual(await readJsonFile(path), { ok: true, n: 42 });
    } finally {
      Deno.open = origOpen;
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test({
  name: "readJsonFile sanitizes open failures",
  sanitizeResources: true,
  fn: async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-read-open-"));
    const path = join(root, "locked.json");
    const origOpen = Deno.open;
    Deno.open = () => {
      throw new Deno.errors.PermissionDenied("mock open failure");
    };
    try {
      await writeFile(path, "{}", { mode: 0o600 });
      await assert.rejects(() => readJsonFile(path), expectSafeJsonError);
    } finally {
      Deno.open = origOpen;
      await rm(root, { recursive: true, force: true });
    }
  },
});

Deno.test("parseAuditorResponse rejects raw input over 64 KiB UTF-8", () => {
  const big = "x".repeat(64 * 1024 + 1);
  assert.throws(() => parseAuditorResponse(big), /large|long|size/i);
});

Deno.test("parseAuditorResponse rejects multibyte payload over 64 KiB UTF-8", () => {
  const pad = "あ".repeat(22_000);
  const raw = JSON.stringify({
    minLevel: 2,
    maxLevel: 3,
    reason: "ok",
    concerns: ["a"],
    extraWhitespace: `  ${pad}  `,
  });
  assert.ok(raw.length < 64 * 1024 + 500);
  assert.ok(
    new TextEncoder().encode(raw).byteLength > 64 * 1024,
  );
  assert.throws(() => parseAuditorResponse(raw), /large|long|size/i);
});

Deno.test("parseAuditorResponse rejects oversized fenced JSON", () => {
  const inner = JSON.stringify({
    minLevel: 2,
    maxLevel: 3,
    reason: "ok",
    concerns: ["a"],
  });
  const pad = " ".repeat(64 * 1024);
  const raw = `\`\`\`json\n${inner}\n\`\`\`${pad}`;
  assert.throws(() => parseAuditorResponse(raw), /large|long|size/i);
});

Deno.test("parseAuditorResponse still accepts valid small fenced JSON", () => {
  const raw =
    '```json\n{"minLevel":2,"maxLevel":4,"reason":"ok","concerns":["a"]}\n```';
  const parsed = parseAuditorResponse(raw);
  assert.equal(parsed.minLevel, 2);
});
