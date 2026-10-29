import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import {
  buildChunkFallbackDecision,
  buildExplicitDecision,
  buildFallbackDecision,
  buildJevDecision,
  computeFixedChunkChoice,
  runCli,
  selectReviewLevel,
  sha256Bytes,
  validateChunkDecision,
  validateLevelDecision,
} from "../scripts/select_review_level.ts";

test("unspecified and auto select offline explicit L1", async () => {
  const patchBytes = new TextEncoder().encode("patch\n");
  for (const levelArg of [undefined, "auto", "1"]) {
    const decision = await selectReviewLevel({
      patchBytes,
      ...(levelArg ? { levelArg } : {}),
    });
    assert.deepEqual(decision, {
      schemaVersion: 1,
      requestedLevel: 1,
      level: 1,
      source: "explicit",
      reason: "explicit",
      patchSha256: sha256Bytes(patchBytes),
      chunking: { source: "fixed", reason: "explicit_level", choice: "none" },
    });
  }
});

test("fixed chunk selection uses raw bytes, newline thresholds and UTF-8 bytes", () => {
  assert.deepEqual(computeFixedChunkChoice(new Uint8Array(14_999)), "none");
  assert.deepEqual(computeFixedChunkChoice(new Uint8Array(15_000)), "12000");
  assert.deepEqual(computeFixedChunkChoice(new Uint8Array()), "none");
  assert.deepEqual(
    computeFixedChunkChoice(new TextEncoder().encode("\n".repeat(399))),
    "none",
  );
  assert.deepEqual(
    computeFixedChunkChoice(new TextEncoder().encode("\n".repeat(400))),
    "12000",
  );
  assert.deepEqual(
    computeFixedChunkChoice(new TextEncoder().encode("あ".repeat(5_000))),
    "12000",
  );
});

test("CLI accepts explicit L1/L2 and rejects Jev flags", async () => {
  const dir = await mkdtemp(join(tmpdir(), "select-review-"));
  const path = join(dir, "patch");
  try {
    await writeFile(path, new Uint8Array([0xff]));
    for (const level of ["1", "2"]) {
      const result = await runCli(["--input", path, "--level", level]);
      assert.equal(result.code, 0);
      assert.equal(JSON.parse(result.stdout).level, Number(level));
    }
    for (
      const flag of [
        "--model",
        "--min-confidence",
        "--approved-input",
        "--context-file",
      ]
    ) {
      const result = await runCli(["--input", path, flag, "value"]);
      assert.deepEqual(result.code, 1);
      assert.deepEqual(result.stdout, "");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI rejects numeric aliases, invalid levels, duplicates, and obsolete options", async () => {
  const dir = await mkdtemp(join(tmpdir(), "select-review-"));
  const path = join(dir, "patch");
  try {
    await writeFile(path, "patch");
    for (const level of ["01", "0", "6", "2.0"]) {
      assert.equal((await runCli(["--input", path, "--level", level])).code, 1);
    }
    assert.equal(
      (await runCli(["--input", path, "--level", "2", "--level", "3"])).code,
      1,
    );
    assert.equal(
      (await runCli(["--input", path, "--context-file", "x"])).code,
      1,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("offline CLI subprocess works with isolated environment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "select-review-"));
  const patch = join(dir, "patch");
  try {
    await writeFile(patch, "patch\n");
    const script =
      new URL("../scripts/select_review_level.ts", import.meta.url).pathname;
    const invoke = async (args: string[]) => {
      const child = Bun.spawn([
        process.execPath,
        "--config=/dev/null",
        "--no-env-file",
        "--no-install",
        script,
        ...args,
      ], {
        stdout: "pipe",
        stderr: "pipe",
        env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, XDG_DATA_HOME: dir },
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { code, stdout, stderr };
    };
    const help = await invoke(["--help"]);
    assert.equal(help.code, 0, help.stderr);
    assert.match(help.stdout, /select_review_level/);
    for (const level of [undefined, "auto", "1", "2"]) {
      const args = ["--input", patch];
      if (level) args.push("--level", level);
      const result = await invoke(args);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).level, level === "2" ? 2 : 1);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validateLevelDecision enforces fallback and explicit field rules", () => {
  const hash = "a".repeat(64).replaceAll("a", "b");
  const explicit = buildExplicitDecision({ level: 2, patchSha256: hash });
  validateLevelDecision(explicit);

  assert.throws(
    () =>
      validateLevelDecision({
        ...explicit,
        requestedLevel: 3,
      }),
    /explicit requestedLevel must equal level/,
  );

  const fallback = buildFallbackDecision({
    requestedLevel: "auto",
    reason: "missing_api_key",
    patchSha256: hash,
    minConfidence: 0.7,
  });
  validateLevelDecision(fallback);

  const historicalOversize = buildFallbackDecision({
    requestedLevel: "auto",
    reason: "patch_too_large",
    patchSha256: hash,
    minConfidence: 0.7,
  });
  validateLevelDecision(historicalOversize);

  assert.throws(
    () => validateLevelDecision({ ...fallback, level: 2 }),
    /fallback decision level must be 3/,
  );
  assert.throws(
    () =>
      validateLevelDecision({
        ...fallback,
        requestedLevel: 2,
      }),
    /fallback requestedLevel must be auto/,
  );
  assert.throws(
    () =>
      validateLevelDecision({
        ...fallback,
        minConfidence: undefined,
      }),
    /fallback decision requires minConfidence/,
  );
  assert.throws(
    () =>
      validateLevelDecision({
        ...explicit,
        minConfidence: 0.7,
      }),
    /explicit decision must not include minConfidence/,
  );

  const jev = buildJevDecision({
    level: 3,
    patchSha256: hash,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13-20260917",
    confidence: 0.8,
    costUsd: 0.001,
  });
  validateLevelDecision(jev);
  assert.throws(
    () =>
      validateLevelDecision({
        ...jev,
        confidence: 0.5,
      }),
    /confidence below minConfidence/,
  );
  assert.throws(
    () =>
      validateLevelDecision({
        ...jev,
        extra: "leak",
      }),
    /unknown level decision field/,
  );

  const lowConf = buildFallbackDecision({
    requestedLevel: "auto",
    reason: "low_confidence",
    patchSha256: hash,
    minConfidence: 0.71,
    confidence: 0.7,
    suggestedLevel: 2,
    model: "typesafe/jev-1.13-20260917",
    costUsd: 0.00001,
  });
  validateLevelDecision(lowConf);
  assert.throws(
    () =>
      validateLevelDecision({
        ...lowConf,
        confidence: 0.8,
      }),
    /low_confidence fallback requires confidence below minConfidence/,
  );
});

test("validateChunkDecision rejects unknown nested keys", () => {
  assert.throws(
    () =>
      validateChunkDecision({
        source: "fixed",
        reason: "explicit_level",
        choice: "none",
        extra: true,
      }),
    /unknown chunk decision field/,
  );
});

test("chunk schema invariants: fixed/fallback choice and cross-fields", () => {
  const hash = "a".repeat(64);
  const patchBytes = new TextEncoder().encode("x\n");
  const jevBase = buildJevDecision({
    level: 3,
    patchSha256: hash,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13",
    confidence: 0.9,
  });

  const cases: { label: string; run: () => void }[] = [
    {
      label: "fixed choice 24000",
      run: () =>
        validateChunkDecision({
          source: "fixed",
          reason: "explicit_level",
          choice: "24000",
        }),
    },
    {
      label: "fallback choice 48000",
      run: () =>
        validateChunkDecision({
          source: "fallback",
          reason: "http_error",
          choice: "48000",
          minConfidence: 0.7,
        }),
    },
    {
      label: "whole_patch_limit low confidence",
      run: () =>
        validateChunkDecision({
          source: "fallback",
          reason: "whole_patch_limit",
          choice: "12000",
          minConfidence: 0.7,
          confidence: 0.65,
          suggestedChoice: "none",
          model: "typesafe/jev-1.13",
        }),
    },
    {
      label: "whole_patch_limit wrong suggestedChoice",
      run: () =>
        validateChunkDecision({
          source: "fallback",
          reason: "whole_patch_limit",
          choice: "12000",
          minConfidence: 0.7,
          confidence: 0.9,
          suggestedChoice: "24000",
          model: "typesafe/jev-1.13",
        }),
    },
    {
      label: "explicit with jev chunking",
      run: () =>
        validateLevelDecision({
          ...buildExplicitDecision({
            level: 2,
            patchSha256: hash,
            patchBytes,
          }),
          chunking: {
            source: "jev",
            reason: "jev_ok",
            choice: "12000",
            minConfidence: 0.7,
            confidence: 0.9,
            suggestedChoice: "12000",
            model: "typesafe/jev-1.13",
          },
        }),
    },
    {
      label: "chunk minConfidence mismatch",
      run: () =>
        validateLevelDecision({
          ...jevBase,
          chunking: buildChunkFallbackDecision({
            reason: "low_confidence",
            patchBytes,
            minConfidence: 0.71,
            confidence: 0.5,
            suggestedChoice: "12000",
            model: "typesafe/jev-1.13",
          }),
        }),
    },
  ];
  for (const { label, run } of cases) {
    assert.throws(run, new RegExp(/.+/), label);
  }
});

test("legacy explicit decision without chunking still validates", () => {
  const hash = "a".repeat(64);
  validateLevelDecision(buildExplicitDecision({ level: 2, patchSha256: hash }));
});

test("validateLevelDecision rejects malformed persisted probabilities", () => {
  const hash = "a".repeat(64);
  const base = buildJevDecision({
    level: 3,
    patchSha256: hash,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13",
    confidence: 0.9,
    probabilities: { "1": 0, "2": 0, "3": 1, "4": 0, "5": 0 },
  });
  validateLevelDecision(base);

  const probError =
    /decision\.probabilities values must be finite numbers 0\.\.1/;
  for (
    const probabilities of [
      { "1": 0, "2": 0, "3": 1, "4": 0 },
      { "1": 0, "2": 0, "3": 1, "4": 0, "5": 0, extra: 1 },
      { "1": NaN, "2": 0, "3": 0, "4": 0, "5": 0 },
      { "1": Infinity, "2": 0, "3": 0, "4": 0, "5": 0 },
      { "1": null, "2": 0, "3": 0, "4": 0, "5": 0 },
      { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
      { "1": 0, "2": 0, "3": "1", "4": 0, "5": 0 },
      { "1": 0, "2": 0, "3": 1.1, "4": 0, "5": 0 },
      { "1": 0, "2": 0, "3": -0.01, "4": 0, "5": 0 },
      [0, 0, 1, 0, 0],
      null,
      "bad",
    ]
  ) {
    assert.throws(
      () => validateLevelDecision({ ...base, probabilities }),
      probError,
    );
  }
  assert.throws(
    () =>
      validateLevelDecision({
        ...buildExplicitDecision({ level: 2, patchSha256: hash }),
        probabilities: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 0 },
      }),
    /explicit decision must not include probabilities/,
  );
  assert.throws(
    () =>
      validateLevelDecision({
        ...buildFallbackDecision({
          requestedLevel: "auto",
          reason: "missing_api_key",
          patchSha256: hash,
          minConfidence: 0.7,
        }),
        probabilities: { "1": 0, "2": 0, "3": 1, "4": 0, "5": 0 },
      }),
    /fallback decision must not include probabilities/,
  );
});

test("validateLevelDecision contextSha256 rules", () => {
  const hash = "a".repeat(64);
  const ctxHash = "b".repeat(64);
  const jev = {
    ...buildJevDecision({
      level: 3,
      patchSha256: hash,
      minConfidence: 0.7,
      model: "typesafe/jev-1.13",
      confidence: 0.9,
    }),
    contextSha256: ctxHash,
  };
  validateLevelDecision(jev);
  assert.throws(
    () =>
      validateLevelDecision({
        ...buildExplicitDecision({ level: 2, patchSha256: hash }),
        contextSha256: ctxHash,
      }),
    /explicit decision must not include contextSha256/,
  );
  assert.throws(
    () =>
      validateLevelDecision({
        ...jev,
        contextSha256: "not-a-hash",
      }),
    /contextSha256 is invalid/,
  );
  assert.throws(
    () =>
      validateLevelDecision({
        ...jev,
        contextSha256: null,
      }),
    /contextSha256 is invalid/,
  );
});

test("validateLevelDecision httpStatuses rules", () => {
  const hash = "a".repeat(64);
  const jev = {
    ...buildJevDecision({
      level: 3,
      patchSha256: hash,
      minConfidence: 0.7,
      model: "typesafe/jev-1.13",
      confidence: 0.9,
    }),
    httpStatuses: [503, 200],
  };
  assert.deepEqual(validateLevelDecision(jev).httpStatuses, [503, 200]);

  const legacy = buildJevDecision({
    level: 3,
    patchSha256: hash,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13",
    confidence: 0.9,
  });
  const validatedLegacy = validateLevelDecision(legacy);
  assert.equal(validatedLegacy.httpStatuses, undefined);

  for (
    const httpStatuses of [
      null,
      Array(1),
      [],
      [200, 201, 202, 203, 204],
      [199],
      [600],
      [200.5],
      ["200"],
      [200, "oops"],
    ]
  ) {
    assert.throws(
      () => validateLevelDecision({ ...jev, httpStatuses }),
      /httpStatuses is invalid/,
    );
  }

  assert.throws(
    () =>
      validateLevelDecision({
        ...buildExplicitDecision({ level: 2, patchSha256: hash }),
        httpStatuses: [200],
      }),
    /explicit decision must not include httpStatuses/,
  );
});
