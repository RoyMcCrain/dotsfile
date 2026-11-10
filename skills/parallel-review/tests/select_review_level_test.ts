import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import {
  buildExplicitDecision,
  computeFixedChunkChoice,
  runCli,
  selectReviewLevel,
  sha256Bytes,
  validateLevelDecision,
} from "../scripts/select_review_level.ts";

test("auto defaults to offline explicit L1 and retains current decision shape", () => {
  const patchBytes = new TextEncoder().encode("patch\n");
  assert.deepEqual(selectReviewLevel({ patchBytes }), {
    schemaVersion: 1,
    requestedLevel: 1,
    level: 1,
    source: "explicit",
    reason: "explicit",
    patchSha256: sha256Bytes(patchBytes),
    chunking: { source: "fixed", reason: "explicit_level", choice: "none" },
  });
});

test("only levels 1 and 2 are selectable", () => {
  for (const levelArg of ["3", "4", "5"]) {
    assert.throws(() =>
      selectReviewLevel({ patchBytes: new Uint8Array(), levelArg })
    );
  }
  assert.equal(
    selectReviewLevel({ patchBytes: new Uint8Array(), levelArg: "2" }).level,
    2,
  );
});

test("fixed chunk selection uses byte and newline thresholds", () => {
  assert.equal(computeFixedChunkChoice(new Uint8Array(14_999)), "none");
  assert.equal(computeFixedChunkChoice(new Uint8Array(15_000)), "12000");
  assert.equal(computeFixedChunkChoice(new Uint8Array(399).fill(10)), "none");
  assert.equal(computeFixedChunkChoice(new Uint8Array(400).fill(10)), "12000");
});

test("level decisions reject retired routing and unknown fields", () => {
  const decision = buildExplicitDecision({
    level: 2,
    patchSha256: "a".repeat(64),
  });
  assert.deepEqual(validateLevelDecision(decision), decision);
  assert.throws(() => validateLevelDecision({ ...decision, level: 3 }));
  assert.throws(() => validateLevelDecision({ ...decision, model: "retired" }));
  assert.throws(() => validateLevelDecision({ ...decision, source: "jev" }));
});

test("CLI rejects levels above 2", async () => {
  const directory = await mkdtemp(join(tmpdir(), "select-level-"));
  try {
    const input = join(directory, "patch.diff");
    await writeFile(input, "patch\n");
    for (const level of ["3", "4", "5"]) {
      const result = await runCli(["--input", input, "--level", level]);
      assert.equal(result.code, 1);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
