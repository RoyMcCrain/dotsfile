import assert from "node:assert/strict";
import {
  buildFallbackDecision,
  buildJevDecision,
  sha256Bytes,
} from "../../parallel-review/scripts/select_review_level.ts";
import { buildWeeklySelection, dedupeByPatch } from "../scripts/sampling.ts";
import type { DecisionHistoryEntry } from "../../parallel-review/scripts/review_history.ts";
import { weeklySeed } from "../scripts/prepare_plan.ts";

const entry = (
  runId: string,
  createdAt: string,
  patch: string,
  overrides: Partial<ReturnType<typeof buildJevDecision>> = {},
): DecisionHistoryEntry => {
  const patchSha256 = sha256Bytes(new TextEncoder().encode(patch));
  const levelDecision = buildJevDecision({
    level: 3,
    patchSha256,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13",
    confidence: 0.9,
    ...overrides,
  });
  return {
    runId,
    createdAt,
    repository: "/repo",
    revision: "abc",
    levelDecision,
  };
};

Deno.test("dedupe, <=5 random + <=5 risk, stable plan", () => {
  const patchA = "diff --git a/foo b/foo\n";
  const entries: DecisionHistoryEntry[] = [];
  for (let i = 0; i < 12; i++) {
    entries.push(
      entry(`run-${i}`, `2026-09-29T0${i % 9}:00:00.000Z`, `${patchA}${i}`),
    );
  }
  for (let i = 0; i < 8; i++) {
    const patch = `diff risk ${i}\n`;
    const patchSha256 = sha256Bytes(new TextEncoder().encode(patch));
    entries.push({
      runId: `risk-${i}`,
      createdAt: `2026-09-30T0${i}:00:00.000Z`,
      repository: "/repo",
      revision: "abc",
      levelDecision: buildFallbackDecision({
        requestedLevel: "auto",
        level: 3,
        patchSha256,
        reason: "timeout",
        minConfidence: 0.7,
      }),
    });
  }
  entries.push(
    entry("dup-1", "2026-09-29T08:00:00.000Z", patchA),
    entry("dup-2", "2026-09-29T09:00:00.000Z", patchA),
  );
  const { unique, duplicateRuns } = dedupeByPatch(entries);
  assert.equal(duplicateRuns, 1);
  const seed = weeklySeed("2026-09-28");
  const first = buildWeeklySelection(unique, seed);
  const second = buildWeeklySelection(unique, seed);
  assert.deepEqual(first, second);
  assert.equal(first.length, 10);
  assert.equal(first.filter((s) => s.stratum === "random").length, 5);
  assert.equal(first.filter((s) => s.stratum === "risk").length, 5);
  const patches = new Set(first.map((f) => f.patchSha256));
  assert.equal(patches.size, first.length);
});
