import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildChunkFallbackDecision,
  buildExplicitDecision,
  buildFallbackDecision,
  buildJevDecision,
  buildJevRequestBody,
  computeFixedChunkChoice,
  countPatchNewlines,
  decodeUtf8Strict,
  DEFAULT_MIN_CONFIDENCE,
  FIXED_CHUNK_BYTE_THRESHOLD,
  JEV_ENDPOINT,
  JEV_NONE_MAX_PATCH_BYTES,
  RESPONSE_MAX_BYTES,
  REVIEW_CRITERIA,
  runCli,
  selectAutoLevel,
  selectReviewLevel,
  sha256Bytes,
  validateChunkDecision,
  validateLevelDecision,
} from "../scripts/select_review_level.ts";
import {
  hashReviewContext,
  REVIEW_CONTEXT_SCHEMA_VERSION,
  validateReviewContext,
} from "../scripts/review_context.ts";

const baseUnknownContextInput = () => ({
  schemaVersion: REVIEW_CONTEXT_SCHEMA_VERSION,
  intent: "unknown" as const,
  runtime: "unknown" as const,
  impact: "unknown" as const,
  dataAndPermissions: "unknown" as const,
  rollback: "unknown" as const,
  tests: "unknown" as const,
});

const allUnknownContext = () =>
  validateReviewContext(baseUnknownContextInput());

const SCRIPT_PATH = join(
  import.meta.dirname!,
  "../scripts/select_review_level.ts",
);
const SKILL_PATH = join(import.meta.dirname!, "../SKILL.md");
const ROUTING_CONTEXT_GUIDE_PATH = join(
  import.meta.dirname!,
  "../references/routing-context.md",
);
const REPO_ROOT = join(import.meta.dirname!, "../../..");
const APPEND_SYSTEM_PATH = join(REPO_ROOT, "pi/agent/APPEND_SYSTEM.md");
const INJECTION_DEFENSE_PATH = join(
  REPO_ROOT,
  "claude/rules/injection-defense.md",
);
const PI_AGENTS_PATH = join(REPO_ROOT, "pi/agent/AGENTS.md");
const PI_README_PATH = join(REPO_ROOT, "pi/README.md");

const runSelectLevelSubprocess = async (
  args: string[],
  permissions: string[],
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--no-prompt",
      ...permissions,
      SCRIPT_PATH,
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
    env: env ? { ...Deno.env.toObject(), ...env } : undefined,
  });
  const out = await cmd.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
};

const defaultDepthProbabilities = {
  "1": 0,
  "2": 0,
  "3": 1,
  "4": 0,
  "5": 0,
} as const;

const validJevBody = (
  choice: string,
  confidence: number,
  chunkChoice = "none",
  chunkConfidence = confidence,
  depthProbabilities: unknown = { ...defaultDepthProbabilities },
) =>
  JSON.stringify({
    model: "typesafe/jev-1.13-20260917",
    answers: {
      review_level: {
        type: "choice",
        choice,
        confidence,
        probabilities: depthProbabilities,
      },
      chunk_size: {
        type: "choice",
        choice: chunkChoice,
        confidence: chunkConfidence,
        probabilities: { none: 1, "12000": 0, "24000": 0, "48000": 0 },
      },
    },
    usage: { cost: 0.00001 },
  });

Deno.test("explicit levels 1..5: no env, no network", async () => {
  const patch = new TextEncoder().encode("diff --git a/x b/x\n");
  const hash = sha256Bytes(patch);
  for (const level of [1, 2, 3, 4, 5] as const) {
    let fetchCalled = false;
    const decision = await selectReviewLevel({
      patchBytes: patch,
      levelArg: String(level),
      approvedInput: false,
      minConfidence: DEFAULT_MIN_CONFIDENCE,
      apiKey: "secret-should-not-matter",
      fetchImpl: () => {
        fetchCalled = true;
        return Promise.resolve(new Response("{}"));
      },
    });
    assert.equal(fetchCalled, false);
    assert.equal(decision.source, "explicit");
    assert.equal(decision.level, level);
    assert.equal(decision.patchSha256, hash);
    assert.equal(decision.chunking?.source, "fixed");
    assert.equal(decision.chunking?.choice, "none");
    validateLevelDecision(decision);
  }
});

Deno.test("noncanonical numeric level strings rejected at CLI and API", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-patch-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "x\n");
  try {
    for (const bad of ["01", "1.0", "1e0", "0x1", " 1 "]) {
      const out = await runCli(["--input", patchPath, "--level", bad]);
      assert.equal(out.code, 1, bad);
      assert.match(out.stderr, /level must be auto or 1\.\.5/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("empty or whitespace --min-confidence rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-patch-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "x\n");
  try {
    for (const raw of ["", "   ", "\t"]) {
      const out = await runCli([
        "--input",
        patchPath,
        "--approved-input",
        "--min-confidence",
        raw,
      ], { getOpenRouterApiKey: () => "k" });
      assert.equal(out.code, 1, JSON.stringify(raw));
      assert.match(out.stderr, /min-confidence/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("duplicate boolean --approved-input rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-patch-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "x\n");
  try {
    const out = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--approved-input",
    ], { getOpenRouterApiKey: () => "k" });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /duplicate flag/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("CLI invalid level, duplicate flag, unknown flag", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-patch-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "x\n");
  try {
    const badLevel = await runCli([
      "--input",
      patchPath,
      "--level",
      "9",
      "--approved-input",
    ]);
    assert.equal(badLevel.code, 1);
    assert.match(badLevel.stderr, /level must be auto or 1\.\.5/);

    const dup = await runCli([
      "--input",
      patchPath,
      "--level",
      "3",
      "--level",
      "3",
    ]);
    assert.equal(dup.code, 1);
    assert.match(dup.stderr, /duplicate flag/);

    const unknown = await runCli([
      "--input",
      patchPath,
      "--level",
      "3",
      "--nope",
      "1",
    ]);
    assert.equal(unknown.code, 1);
    assert.match(unknown.stderr, /unknown flag/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("auto without --approved-input is hard error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-patch-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "x\n");
  try {
    const out = await runCli(["--input", patchPath, "--level", "auto"], {
      getOpenRouterApiKey: () => "k",
    });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /approved-input is required/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("invalid --min-confidence rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-patch-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "x\n");
  try {
    const out = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--min-confidence",
      "1.5",
    ], { getOpenRouterApiKey: () => "k" });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /min-confidence/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("invalid UTF-8 patch hard error for auto", async () => {
  const invalid = new Uint8Array([0xff, 0xfe, 0xfd]);
  await assert.rejects(
    () =>
      selectReviewLevel({
        patchBytes: invalid,
        levelArg: "auto",
        approvedInput: true,
        minConfidence: 0.7,
        model: "typesafe/jev-1.13",
        apiKey: "k",
        fetchImpl: () => Promise.resolve(new Response("{}")),
      }),
    /valid UTF-8/,
  );
  const explicit = await selectReviewLevel({
    patchBytes: invalid,
    levelArg: "2",
    approvedInput: false,
    minConfidence: 0.7,
  });
  assert.equal(explicit.source, "explicit");
  assert.equal(explicit.patchSha256, sha256Bytes(invalid));
});

Deno.test("invalid UTF-8 with missing creds falls back before strict decode", async () => {
  const invalid = new Uint8Array([0x2b, 0xff, 0x66, 0x69, 0x78]); // "+...fix" with bad byte
  const hash = sha256Bytes(invalid);
  let calls = 0;
  const fetchImpl = () => {
    calls++;
    return Promise.resolve(new Response(validJevBody("2", 0.9)));
  };

  const noModel = await selectReviewLevel({
    patchBytes: invalid,
    levelArg: "auto",
    approvedInput: true,
    minConfidence: 0.7,
    apiKey: "synthetic-key",
    fetchImpl,
  });
  assert.equal(calls, 0);
  assert.equal(noModel.source, "fallback");
  assert.equal(noModel.reason, "missing_model");
  assert.equal(noModel.level, 3);
  assert.equal(noModel.patchSha256, hash);
  validateLevelDecision(noModel);

  calls = 0;
  const noKey = await selectReviewLevel({
    patchBytes: invalid,
    levelArg: "auto",
    approvedInput: true,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13",
    fetchImpl,
  });
  assert.equal(calls, 0);
  assert.equal(noKey.source, "fallback");
  assert.equal(noKey.reason, "missing_api_key");
  assert.equal(noKey.level, 3);
  assert.equal(noKey.patchSha256, hash);
  validateLevelDecision(noKey);

  calls = 0;
  const bothMissing = await selectReviewLevel({
    patchBytes: invalid,
    levelArg: "auto",
    approvedInput: true,
    minConfidence: 0.7,
    fetchImpl,
  });
  assert.equal(calls, 0);
  assert.equal(bothMissing.reason, "missing_model");
  assert.equal(bothMissing.patchSha256, hash);
  validateLevelDecision(bothMissing);

  calls = 0;
  await assert.rejects(
    () =>
      selectReviewLevel({
        patchBytes: invalid,
        levelArg: "auto",
        approvedInput: true,
        minConfidence: 0.7,
        model: "typesafe/jev-1.13",
        apiKey: "synthetic-key",
        fetchImpl,
      }),
    /valid UTF-8/,
  );
  assert.equal(calls, 0);
});

Deno.test("missing key and model fall back to L3 without fetch", async () => {
  const patch = new TextEncoder().encode("+fix bug\n");
  const hash = sha256Bytes(patch);
  let calls = 0;
  const fetchImpl = () => {
    calls++;
    return Promise.resolve(new Response(validJevBody("2", 0.9)));
  };

  const noKey = await selectReviewLevel({
    patchBytes: patch,
    levelArg: "auto",
    approvedInput: true,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13",
    fetchImpl,
  });
  assert.equal(calls, 0);
  assert.equal(noKey.source, "fallback");
  assert.equal(noKey.reason, "missing_api_key");
  assert.equal(noKey.level, 3);
  assert.equal(noKey.patchSha256, hash);

  calls = 0;
  const noModel = await selectReviewLevel({
    patchBytes: patch,
    levelArg: "auto",
    approvedInput: true,
    minConfidence: 0.7,
    apiKey: "key",
    fetchImpl,
  });
  assert.equal(calls, 0);
  assert.equal(noModel.reason, "missing_model");
});

Deno.test("empty patch: L3 fallback, no network", async () => {
  let calls = 0;
  const fetchImpl = () => {
    calls++;
    return Promise.resolve(new Response("{}"));
  };
  const empty = await selectAutoLevel({
    patchText: "",
    patchSha256: sha256Bytes(new Uint8Array()),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl,
  });
  assert.equal(calls, 0);
  assert.equal(empty.reason, "empty_patch");
});

Deno.test("large ASCII patch (64KiB): single Jev call with full patch", async () => {
  const big = "a".repeat(64 * 1024);
  const bigBytes = new TextEncoder().encode(big);
  assert.equal(bigBytes.byteLength, 64 * 1024);
  const hash = sha256Bytes(bigBytes);
  let calls = 0;
  let seenPatch: string | undefined;
  const decision = await selectAutoLevel({
    patchText: big,
    patchSha256: hash,
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: (input, init) => {
      calls++;
      const req = new Request(input, init);
      return req.text().then((text) => {
        seenPatch = (JSON.parse(text) as { state: { patch: string } }).state
          .patch;
        return new Response(validJevBody("3", 0.9));
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(seenPatch, big);
  assert.equal(decision.source, "jev");
  assert.equal(decision.patchSha256, hash);
  validateLevelDecision(decision);
});

const UTF8_BOM_BYTES = new Uint8Array([0xef, 0xbb, 0xbf]);

Deno.test("raw UTF-8 BOM patch: BOM preserved in Jev state", async () => {
  const payload = new TextEncoder().encode("+" + "a".repeat(100) + "\n");
  const patchBytes = new Uint8Array(UTF8_BOM_BYTES.length + payload.length);
  patchBytes.set(UTF8_BOM_BYTES, 0);
  patchBytes.set(payload, UTF8_BOM_BYTES.length);
  const hash = sha256Bytes(patchBytes);
  let seenPatch: string | undefined;
  const decision = await selectReviewLevel({
    patchBytes,
    levelArg: "auto",
    approvedInput: true,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13",
    apiKey: "k",
    fetchImpl: (input, init) => {
      const req = new Request(input, init);
      return req.text().then((text) => {
        seenPatch = (JSON.parse(text) as { state: { patch: string } }).state
          .patch;
        return new Response(validJevBody("3", 0.9));
      });
    },
  });
  assert.equal(decision.patchSha256, hash);
  assert.equal(decision.source, "jev");
  assert.ok(seenPatch?.startsWith("\uFEFF"));
  assert.equal(seenPatch, decodeUtf8Strict(patchBytes));
});

Deno.test("raw UTF-8 BOM patch over 64KiB: full patch sent, BOM and hash preserved", async () => {
  const fillLen = 64 * 1024 - UTF8_BOM_BYTES.length + 1;
  const fill = new Uint8Array(fillLen);
  fill.fill(0x61);
  const patchBytes = new Uint8Array(UTF8_BOM_BYTES.length + fill.length);
  patchBytes.set(UTF8_BOM_BYTES, 0);
  patchBytes.set(fill, UTF8_BOM_BYTES.length);
  assert.ok(patchBytes.byteLength > 64 * 1024);
  const hash = sha256Bytes(patchBytes);
  let calls = 0;
  let seenPatch: string | undefined;
  const decision = await selectReviewLevel({
    patchBytes,
    levelArg: "auto",
    approvedInput: true,
    minConfidence: 0.7,
    model: "typesafe/jev-1.13",
    apiKey: "k",
    fetchImpl: (input, init) => {
      calls++;
      const req = new Request(input, init);
      return req.text().then((text) => {
        seenPatch = (JSON.parse(text) as { state: { patch: string } }).state
          .patch;
        return new Response(validJevBody("3", 0.9));
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(decision.patchSha256, hash);
  assert.equal(decision.source, "jev");
  assert.ok(seenPatch?.startsWith("\uFEFF"));
  assert.equal(seenPatch, decodeUtf8Strict(patchBytes));
});

Deno.test("large multibyte UTF-8 patch: single call with full text and exact hash", async () => {
  const patchText = "+" + "🙂".repeat(8_000);
  const patchBytes = new TextEncoder().encode(patchText);
  assert.ok(patchBytes.byteLength > 24_000);
  const hash = sha256Bytes(patchBytes);
  let calls = 0;
  let seenPatch: string | undefined;
  const decision = await selectReviewLevel({
    patchBytes,
    levelArg: "auto",
    approvedInput: true,
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: (input, init) => {
      calls++;
      const req = new Request(input, init);
      return req.text().then((text) => {
        seenPatch = (JSON.parse(text) as { state: { patch: string } }).state
          .patch;
        return new Response(validJevBody("4", 0.85));
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(seenPatch, patchText);
  assert.equal(decision.source, "jev");
  assert.equal(decision.level, 4);
  assert.equal(decision.patchSha256, hash);
});

Deno.test("Jev request: endpoint, schema, auth, redirect:error", async () => {
  const patch = "+change\n";
  let seenAuth = "";
  let seenRedirect: RequestRedirect | undefined;
  let seenBody: Record<string, unknown> | undefined;
  const fetchImpl: typeof fetch = (input, init) => {
    seenRedirect = init?.redirect;
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    const req = new Request(url, init);
    assert.equal(req.method, "POST");
    assert.equal(req.url, JEV_ENDPOINT);
    seenAuth = req.headers.get("Authorization") ?? "";
    return req.text().then((text) => {
      seenBody = JSON.parse(text);
      return new Response(validJevBody("4", 0.85), { status: 200 });
    });
  };

  const patchBytes = new TextEncoder().encode(patch);
  const decision = await selectAutoLevel({
    patchText: patch,
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "test-key-123",
    minConfidence: 0.7,
    fetchImpl,
  });

  assert.equal(seenAuth, "Bearer test-key-123");
  assert.equal(seenRedirect, "error");
  assert.deepEqual(seenBody, buildJevRequestBody("typesafe/jev-1.13", patch));
  assert.equal(decision.source, "jev");
  assert.equal(decision.level, 4);
  assert.equal(decision.confidence, 0.85);
  validateLevelDecision(decision);
});

Deno.test("all valid Jev choices 1..5", async () => {
  for (const choice of ["1", "2", "3", "4", "5"]) {
    const decision = await selectAutoLevel({
      patchText: "diff\n",
      patchSha256: sha256Bytes(new TextEncoder().encode("diff\n")),
      model: "typesafe/jev-1.13",
      apiKey: "k",
      minConfidence: 0.7,
      fetchImpl: () => Promise.resolve(new Response(validJevBody(choice, 0.9))),
    });
    assert.equal(decision.level, Number(choice));
    validateLevelDecision(decision);
  }
});

Deno.test("confidence threshold boundary and low confidence", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const base = {
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    fetchImpl: () => Promise.resolve(new Response(validJevBody("2", 0.7))),
  };
  const at = await selectAutoLevel({ ...base, minConfidence: 0.7 });
  assert.equal(at.source, "jev");

  const below = await selectAutoLevel({
    ...base,
    minConfidence: 0.71,
  });
  assert.equal(below.source, "fallback");
  assert.equal(below.reason, "low_confidence");
  assert.equal(below.confidence, 0.7);
  assert.equal(below.suggestedLevel, 2);
  assert.equal(below.model, "typesafe/jev-1.13-20260917");
  assert.equal(below.minConfidence, 0.71);
  validateLevelDecision(below);
});

Deno.test("invalid choice, confidence, schema, error envelope", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const opts = {
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
  };
  const badChoice = await selectAutoLevel({
    ...opts,
    fetchImpl: () => Promise.resolve(new Response(validJevBody("6", 0.9))),
  });
  assert.equal(badChoice.reason, "invalid_choice");

  const badConf = await selectAutoLevel({
    ...opts,
    fetchImpl: () =>
      Promise.resolve(
        new Response(JSON.stringify({
          model: "typesafe/jev-1.13-20260917",
          answers: {
            review_level: { type: "choice", choice: "2", confidence: null },
          },
        })),
      ),
  });
  assert.equal(badConf.reason, "invalid_confidence");

  const wrongType = await selectAutoLevel({
    ...opts,
    fetchImpl: () =>
      Promise.resolve(
        new Response(JSON.stringify({
          model: "typesafe/jev-1.13-20260917",
          answers: { review_level: { type: "score", choice: "2" } },
        })),
      ),
  });
  assert.equal(wrongType.reason, "invalid_schema");

  const envelope = await selectAutoLevel({
    ...opts,
    fetchImpl: () =>
      Promise.resolve(new Response(JSON.stringify({ error: "nope" }))),
  });
  assert.equal(envelope.reason, "error_envelope");
});

Deno.test("HTTP error and oversized body cancel response stream", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const opts = {
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
  };
  let httpCancelled = false;
  await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      const stream = new ReadableStream({
        cancel() {
          httpCancelled = true;
        },
        start(controller) {
          controller.enqueue(new TextEncoder().encode("leak"));
        },
      });
      return Promise.resolve(new Response(stream, { status: 500 }));
    },
  });
  assert.equal(httpCancelled, true);

  let hugeCancelled = false;
  const huge = "x".repeat(RESPONSE_MAX_BYTES + 1);
  await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      const stream = new ReadableStream({
        cancel() {
          hugeCancelled = true;
        },
        start(controller) {
          controller.enqueue(new TextEncoder().encode(huge));
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    },
  });
  assert.equal(hugeCancelled, true);
});

Deno.test("HTTP errors, malformed JSON, network, timeout, bounded body", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const opts = {
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
  };

  for (const status of [401, 429, 500]) {
    const res = await selectAutoLevel({
      ...opts,
      fetchImpl: () => Promise.resolve(new Response("secret-echo", { status })),
    });
    assert.equal(res.reason, "http_error");
  }

  const badJson = await selectAutoLevel({
    ...opts,
    fetchImpl: () => Promise.resolve(new Response("{not-json")),
  });
  assert.equal(badJson.reason, "invalid_json");

  const network = await selectAutoLevel({
    ...opts,
    fetchImpl: () => Promise.reject(new Error("ECONNRESET")),
  });
  assert.equal(network.reason, "network_error");

  const redirect = await selectAutoLevel({
    ...opts,
    fetchImpl: () => Promise.reject(new Error("redirect mode error")),
  });
  assert.equal(redirect.reason, "redirect");

  const timeout = await selectAutoLevel({
    ...opts,
    timeoutMs: 5,
    fetchImpl: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  });
  assert.equal(timeout.reason, "timeout");

  const huge = "x".repeat(64 * 1024 + 1);
  const bounded = await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(huge));
          controller.close();
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    },
  });
  assert.equal(bounded.reason, "invalid_schema");

  const stalledBody = await selectAutoLevel({
    ...opts,
    timeoutMs: 20,
    fetchImpl: (_input, init) => {
      const stream = new ReadableStream({
        pull(_controller) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    },
  });
  assert.equal(stalledBody.reason, "timeout");
});

Deno.test("validateLevelDecision enforces fallback and explicit field rules", () => {
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

Deno.test("subprocess: explicit and help need no env or net permissions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-sub-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  try {
    const help = await runSelectLevelSubprocess(["--help"], ["--allow-read"]);
    assert.equal(help.code, 0, help.stderr);
    assert.match(help.stdout, /select_review_level/);

    const explicit = await runSelectLevelSubprocess(
      ["--input", patchPath, "--level", "1"],
      ["--allow-read"],
    );
    assert.equal(explicit.code, 0, explicit.stderr);
    const parsed = JSON.parse(explicit.stdout);
    assert.equal(parsed.source, "explicit");
    assert.equal(parsed.level, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("subprocess: invalid UTF-8 missing key falls back without decode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-sub-"));
  const patchPath = join(dir, "invalid.patch");
  const patchBytes = new Uint8Array([0x2b, 0xff, 0x6c]);
  await writeFile(patchPath, patchBytes);
  try {
    // Override any key inherited from the parent test process.
    const envNoKey = { OPEN_ROUTER_API_KEY: "" };
    const out = await runSelectLevelSubprocess(
      [
        "--input",
        patchPath,
        "--approved-input",
        "--model",
        "typesafe/jev-1.13",
      ],
      ["--allow-read", "--allow-env=OPEN_ROUTER_API_KEY"],
      envNoKey,
    );
    assert.equal(out.code, 0, out.stderr);
    const fb = JSON.parse(out.stdout);
    assert.equal(fb.source, "fallback");
    assert.equal(fb.reason, "missing_api_key");
    assert.equal(fb.level, 3);
    assert.equal(fb.patchSha256, sha256Bytes(patchBytes));
    validateLevelDecision(fb);
    assert.doesNotMatch(out.stderr, /valid UTF-8/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("subprocess: auto missing key with scoped env only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-sub-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  try {
    const out = await runSelectLevelSubprocess(
      [
        "--input",
        patchPath,
        "--approved-input",
        "--model",
        "typesafe/jev-1.13",
      ],
      ["--allow-read", "--allow-env=OPEN_ROUTER_API_KEY"],
      { OPEN_ROUTER_API_KEY: "" },
    );
    assert.equal(out.code, 0, out.stderr);
    const fb = JSON.parse(out.stdout);
    assert.equal(fb.reason, "missing_api_key");
    assert.doesNotMatch(out.stderr, /NotCapable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("subprocess: canonical key recognized offline without network", async () => {
  const SYNTH_KEY = "test-synthetic-open-router-key-offline-only";
  const dir = await mkdtemp(join(tmpdir(), "pr-sub-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  try {
    const out = await runSelectLevelSubprocess(
      [
        "--input",
        patchPath,
        "--approved-input",
        "--model",
        "typesafe/jev-1.13",
      ],
      [
        "--allow-read",
        "--allow-env=OPEN_ROUTER_API_KEY",
        "--deny-net",
      ],
      { OPEN_ROUTER_API_KEY: SYNTH_KEY },
    );
    assert.equal(out.code, 0, out.stderr);
    const fb = JSON.parse(out.stdout);
    assert.equal(fb.source, "fallback");
    assert.equal(fb.reason, "network_error");
    assert.equal(fb.level, 3);
    validateLevelDecision(fb);
    assert.doesNotMatch(out.stderr, new RegExp(SYNTH_KEY));
    assert.doesNotMatch(out.stdout, new RegExp(SYNTH_KEY));
    assert.doesNotMatch(out.stderr, /missing_api_key/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("Jev request includes independent chunk_size question", () => {
  const body = buildJevRequestBody("typesafe/jev-1.13", "patch\n");
  const questions = body.questions as Record<string, unknown>;
  assert.ok(questions.review_level);
  assert.ok(questions.chunk_size);
  assert.notEqual(questions.review_level, questions.chunk_size);
});

Deno.test("all four Jev chunk size choices accepted", async () => {
  for (const chunkChoice of ["none", "12000", "24000", "48000"] as const) {
    const patchBytes = new TextEncoder().encode("diff\n");
    const decision = await selectAutoLevel({
      patchText: "diff\n",
      patchSha256: sha256Bytes(patchBytes),
      model: "typesafe/jev-1.13",
      apiKey: "k",
      minConfidence: 0.7,
      fetchImpl: () =>
        Promise.resolve(
          new Response(validJevBody("3", 0.9, chunkChoice, 0.9)),
        ),
    });
    assert.equal(decision.chunking?.source, "jev");
    assert.equal(decision.chunking?.choice, chunkChoice);
    validateLevelDecision(decision);
  }
});

Deno.test("independent confidence: low depth with high chunk", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const decision = await selectAutoLevel({
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.71,
    fetchImpl: () =>
      Promise.resolve(new Response(validJevBody("2", 0.7, "24000", 0.9))),
  });
  assert.equal(decision.source, "fallback");
  assert.equal(decision.reason, "low_confidence");
  assert.equal(decision.chunking?.source, "jev");
  assert.equal(decision.chunking?.choice, "24000");
  validateLevelDecision(decision);
});

Deno.test("independent confidence: high depth with low chunk", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const decision = await selectAutoLevel({
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.71,
    fetchImpl: () =>
      Promise.resolve(new Response(validJevBody("4", 0.9, "12000", 0.5))),
  });
  assert.equal(decision.source, "jev");
  assert.equal(decision.level, 4);
  assert.equal(decision.chunking?.source, "fallback");
  assert.equal(decision.chunking?.reason, "low_confidence");
  assert.equal(decision.chunking?.suggestedChoice, "12000");
  assert.equal(decision.chunking?.model, "typesafe/jev-1.13-20260917");
  validateLevelDecision(decision);
});

Deno.test("invalid chunk choice falls back chunk only", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const decision = await selectAutoLevel({
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () =>
      Promise.resolve(new Response(validJevBody("3", 0.9, "99999", 0.9))),
  });
  assert.equal(decision.source, "jev");
  assert.equal(decision.chunking?.source, "fallback");
  assert.equal(decision.chunking?.reason, "invalid_choice");
  validateLevelDecision(decision);
});

Deno.test("missing chunk_size answer falls back chunk only", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const body = JSON.stringify({
    model: "typesafe/jev-1.13-20260917",
    answers: {
      review_level: { type: "choice", choice: "3", confidence: 0.9 },
    },
  });
  const decision = await selectAutoLevel({
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () => Promise.resolve(new Response(body)),
  });
  assert.equal(decision.source, "jev");
  assert.equal(decision.chunking?.source, "fallback");
  assert.equal(decision.chunking?.reason, "invalid_schema");
  validateLevelDecision(decision);
});

Deno.test("fixed chunk thresholds bytes and newlines", () => {
  const underBytes = new Uint8Array(FIXED_CHUNK_BYTE_THRESHOLD - 1);
  assert.equal(computeFixedChunkChoice(underBytes), "none");
  const atBytes = new Uint8Array(FIXED_CHUNK_BYTE_THRESHOLD);
  assert.equal(computeFixedChunkChoice(atBytes), "12000");

  const lines399 = new TextEncoder().encode("x\n".repeat(399));
  assert.equal(countPatchNewlines(lines399), 399);
  assert.equal(computeFixedChunkChoice(lines399), "none");
  const lines400 = new TextEncoder().encode("x\n".repeat(400));
  assert.equal(countPatchNewlines(lines400), 400);
  assert.equal(computeFixedChunkChoice(lines400), "12000");
});

Deno.test("fixed chunk uses UTF-8 byte length for multibyte", () => {
  const patchText = "🙂".repeat(4000);
  const patchBytes = new TextEncoder().encode(patchText);
  assert.ok(patchBytes.byteLength >= FIXED_CHUNK_BYTE_THRESHOLD);
  assert.equal(computeFixedChunkChoice(patchBytes), "12000");
});

Deno.test("invalid UTF-8 explicit uses raw byte thresholds for chunking", async () => {
  const invalid = new Uint8Array(FIXED_CHUNK_BYTE_THRESHOLD);
  invalid.fill(0xff);
  const decision = await selectReviewLevel({
    patchBytes: invalid,
    levelArg: "2",
    approvedInput: false,
    minConfidence: 0.7,
  });
  assert.equal(decision.chunking?.source, "fixed");
  assert.equal(decision.chunking?.choice, "12000");
});

Deno.test("Jev none accepted at 48000 bytes, whole_patch_limit at 48001", async () => {
  const at = new Uint8Array(JEV_NONE_MAX_PATCH_BYTES);
  at.fill(0x61);
  const atText = new TextDecoder().decode(at);
  const atDecision = await selectAutoLevel({
    patchText: atText,
    patchSha256: sha256Bytes(at),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () => Promise.resolve(new Response(validJevBody("3", 0.9))),
  });
  assert.equal(atDecision.chunking?.source, "jev");
  assert.equal(atDecision.chunking?.choice, "none");

  const over = new Uint8Array(JEV_NONE_MAX_PATCH_BYTES + 1);
  over.fill(0x61);
  const overText = new TextDecoder().decode(over);
  const overDecision = await selectAutoLevel({
    patchText: overText,
    patchSha256: sha256Bytes(over),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () => Promise.resolve(new Response(validJevBody("3", 0.9))),
  });
  assert.equal(overDecision.chunking?.source, "fallback");
  assert.equal(overDecision.chunking?.reason, "whole_patch_limit");
  assert.equal(overDecision.chunking?.suggestedChoice, "none");
  assert.equal(overDecision.chunking?.confidence, 0.9);
  validateLevelDecision(overDecision);
});

Deno.test("common HTTP failure falls back depth and chunk", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const decision = await selectAutoLevel({
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () =>
      Promise.resolve(httpErrorResponse("secret", 500, { "Retry-After": "0" })),
  });
  assert.equal(decision.source, "fallback");
  assert.equal(decision.reason, "http_error");
  assert.equal(decision.chunking?.source, "fallback");
  assert.equal(decision.chunking?.reason, "http_error");
  assert.doesNotMatch(JSON.stringify(decision), /secret/);
  validateLevelDecision(decision);
});

const autoHttpRetryOpts = () => {
  const patchBytes = new TextEncoder().encode("d\n");
  return {
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
  };
};

const httpErrorResponse = (
  body = "",
  status = 502,
  headers?: Record<string, string>,
) =>
  new Response(body, {
    status,
    headers: headers ? new Headers(headers) : undefined,
  });

const totalHttpAttempts = 4;

Deno.test("auto http_error retries: success and exhaustion", async () => {
  const opts = autoHttpRetryOpts();

  let successCalls = 0;
  const firstOk = await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      successCalls++;
      return Promise.resolve(
        new Response(validJevBody("2", 0.9, "24000", 0.88)),
      );
    },
  });
  assert.equal(successCalls, 1);
  assert.equal(firstOk.source, "jev");
  assert.equal(firstOk.level, 2);
  assert.equal(firstOk.chunking?.source, "jev");
  assert.equal(firstOk.chunking?.choice, "24000");

  let errThenOkCalls = 0;
  const recovered = await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      errThenOkCalls++;
      if (errThenOkCalls === 1) {
        return Promise.resolve(httpErrorResponse("secret-body", 502, {
          "Retry-After": "0",
        }));
      }
      return Promise.resolve(
        new Response(validJevBody("4", 0.85, "12000", 0.9)),
      );
    },
  });
  assert.equal(errThenOkCalls, 2);
  assert.equal(recovered.source, "jev");
  assert.equal(recovered.level, 4);
  assert.equal(recovered.chunking?.choice, "12000");
  assert.doesNotMatch(JSON.stringify(recovered), /secret-body/);

  let lateCalls = 0;
  const lateOk = await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      lateCalls++;
      if (lateCalls < totalHttpAttempts) {
        return Promise.resolve(
          httpErrorResponse("", 429, { "Retry-After": "0" }),
        );
      }
      return Promise.resolve(new Response(validJevBody("3", 0.9)));
    },
  });
  assert.equal(lateCalls, totalHttpAttempts);
  assert.equal(lateOk.source, "jev");
  assert.equal(lateOk.level, 3);

  let exhaustedCalls = 0;
  const exhausted = await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      exhaustedCalls++;
      return Promise.resolve(httpErrorResponse("leak-502", 502, {
        "Retry-After": "0",
      }));
    },
  });
  assert.equal(exhaustedCalls, totalHttpAttempts);
  assert.equal(exhausted.source, "fallback");
  assert.equal(exhausted.reason, "http_error");
  assert.equal(exhausted.level, 3);
  assert.equal(exhausted.chunking?.source, "fallback");
  assert.equal(exhausted.chunking?.reason, "http_error");
  assert.doesNotMatch(JSON.stringify(exhausted), /leak-502/);
  validateLevelDecision(exhausted);
});

Deno.test("auto http_error retries: cancel failed bodies before next fetch", async () => {
  const opts = autoHttpRetryOpts();
  const cancelLog: number[] = [];
  let fetchCalls = 0;

  await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      assert.equal(cancelLog.length, fetchCalls);
      fetchCalls++;
      const id = fetchCalls;
      const stream = new ReadableStream({
        cancel() {
          cancelLog.push(id);
        },
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`err-${id}`));
        },
      });
      return Promise.resolve(
        new Response(stream, {
          status: 500,
          headers: { "Retry-After": "0" },
        }),
      );
    },
  });

  assert.equal(fetchCalls, totalHttpAttempts);
  assert.deepEqual(cancelLog, [1, 2, 3, 4]);
});

Deno.test("auto http_error retries: preserve request; non-http stays single-attempt", async () => {
  const patch = "\uFEFFdiff --git a/x b/x\n+\u3042\n";
  const ctx = validateReviewContext({
    schemaVersion: REVIEW_CONTEXT_SCHEMA_VERSION,
    intent: {
      summary: "Retry preserves routing context in shared payload",
      evidence: [
        "skills/parallel-review/tests/select_review_level_test.ts:retry",
      ],
    },
    runtime: "unknown",
    impact: "unknown",
    dataAndPermissions: "unknown",
    rollback: "unknown",
    tests: "unknown",
  });
  const patchSha256 = sha256Bytes(new TextEncoder().encode(patch));
  const contextSha256 = hashReviewContext(ctx);
  const expectedBody = buildJevRequestBody("typesafe/jev-1.13", patch, ctx);
  let retryCalls = 0;
  const bodies: unknown[] = [];
  let seenAuth = "";
  let seenRedirect: RequestRedirect | undefined;

  const retried = await selectAutoLevel({
    patchText: patch,
    patchSha256,
    model: "typesafe/jev-1.13",
    apiKey: "retry-key",
    minConfidence: 0.7,
    reviewContext: ctx,
    fetchImpl: (input, init) => {
      retryCalls++;
      seenRedirect = init?.redirect;
      const req = new Request(input, init);
      seenAuth = req.headers.get("Authorization") ?? "";
      return req.text().then((text) => {
        bodies.push(JSON.parse(text));
        if (retryCalls === 1) {
          return httpErrorResponse("", 503, { "Retry-After": "0" });
        }
        return new Response(validJevBody("2", 0.9));
      });
    },
  });

  assert.equal(retried.source, "jev");
  assert.equal(retried.patchSha256, patchSha256);
  assert.equal(retried.contextSha256, contextSha256);
  assert.equal(retryCalls, 2);
  assert.equal(seenAuth, "Bearer retry-key");
  assert.equal(seenRedirect, "error");
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], expectedBody);
  assert.deepEqual(bodies[1], expectedBody);

  const single = autoHttpRetryOpts();
  let netCalls = 0;
  await selectAutoLevel({
    ...single,
    fetchImpl: () => {
      netCalls++;
      return Promise.reject(new Error("ECONNRESET"));
    },
  });
  assert.equal(netCalls, 1);

  let httpThenJson = 0;
  const badJson = await selectAutoLevel({
    ...single,
    fetchImpl: () => {
      httpThenJson++;
      if (httpThenJson === 1) {
        return Promise.resolve(
          httpErrorResponse("", 500, { "Retry-After": "0" }),
        );
      }
      return Promise.resolve(new Response("{bad"));
    },
  });
  assert.equal(httpThenJson, 2);
  assert.equal(badJson.reason, "invalid_json");

  let httpThenLow = 0;
  const lowConf = await selectAutoLevel({
    ...single,
    fetchImpl: () => {
      httpThenLow++;
      if (httpThenLow === 1) {
        return Promise.resolve(
          httpErrorResponse("", 401, { "Retry-After": "0" }),
        );
      }
      return Promise.resolve(new Response(validJevBody("5", 0.2)));
    },
  });
  assert.equal(httpThenLow, 2);
  assert.equal(lowConf.reason, "low_confidence");
});

Deno.test("auto http_error retries: shared deadline stops further attempts", async () => {
  const opts = autoHttpRetryOpts();
  let fetchCalls = 0;
  const decision = await selectAutoLevel({
    ...opts,
    timeoutMs: 25,
    fetchImpl: (_input, init) => {
      fetchCalls++;
      const stream = new ReadableStream({
        cancel() {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        },
        start(controller) {
          controller.enqueue(new TextEncoder().encode("err"));
        },
      });
      return Promise.resolve(
        new Response(stream, {
          status: 500,
          headers: { "Retry-After": "0" },
        }),
      );
    },
  });
  assert.equal(decision.reason, "timeout");
  assert.equal(fetchCalls, 1);
});

Deno.test("auto http_error retries: timeout on second attempt shares AbortSignal", async () => {
  const opts = autoHttpRetryOpts();
  let fetchCalls = 0;
  let firstSignal: AbortSignal | undefined;
  let secondSignal: AbortSignal | undefined;

  const decision = await selectAutoLevel({
    ...opts,
    timeoutMs: 15,
    fetchImpl: (_input, init) => {
      fetchCalls++;
      const signal = init?.signal ?? undefined;
      if (fetchCalls === 1) {
        firstSignal = signal;
        return Promise.resolve(
          httpErrorResponse("", 502, { "Retry-After": "0" }),
        );
      }
      secondSignal = signal;
      if (signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
  });

  assert.equal(decision.reason, "timeout");
  assert.equal(fetchCalls, 2);
  assert.ok(firstSignal);
  assert.strictEqual(firstSignal, secondSignal);
});

Deno.test("auto http_error: request build failure uses network_error and clears timer", async () => {
  const opts = autoHttpRetryOpts();
  const stringify = JSON.stringify;
  const clear = globalThis.clearTimeout;
  let clears = 0;
  let fetchCalls = 0;
  JSON.stringify = ((value: unknown) => {
    if (typeof value === "object" && value !== null && "questions" in value) {
      throw new Error("synthetic payload serialization failure");
    }
    return stringify(value);
  }) as typeof JSON.stringify;
  globalThis.clearTimeout = ((id?: number) => {
    clears++;
    clear(id);
  }) as typeof clearTimeout;

  try {
    const decision = await selectAutoLevel({
      ...opts,
      timeoutMs: 50,
      fetchImpl: () => {
        fetchCalls++;
        throw new Error("fetch must not be called");
      },
    });
    assert.equal(decision.source, "fallback");
    assert.equal(decision.reason, "network_error");
    assert.equal(clears, 1);
    assert.equal(fetchCalls, 0);
  } finally {
    JSON.stringify = stringify;
    globalThis.clearTimeout = clear;
  }
});

Deno.test("auto http_error retries: default backoff delays between attempts", async () => {
  const opts = autoHttpRetryOpts();
  const delays: number[] = [];
  let lastAt = Date.now();
  let fetchCalls = 0;

  const decision = await selectAutoLevel({
    ...opts,
    fetchImpl: () => {
      const at = Date.now();
      if (fetchCalls > 0) delays.push(at - lastAt);
      lastAt = at;
      fetchCalls++;
      return Promise.resolve(httpErrorResponse("", 503));
    },
  });
  assert.equal(decision.reason, "http_error");
  assert.equal(fetchCalls, totalHttpAttempts);
  assert.equal(delays.length, 3);
  const expected = [250, 500, 1000];
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      delays[i] >= expected[i] - 40,
      `delay ${i}: ${delays[i]} vs min ${expected[i]}`,
    );
  }
});

Deno.test("auto http_error retries: Retry-After delta, date, invalid, and budget", async () => {
  const opts = autoHttpRetryOpts();

  {
    let deltaCalls = 0;
    let deltaAt = Date.now();
    const deltaOk = await selectAutoLevel({
      ...opts,
      fetchImpl: () => {
        deltaCalls++;
        if (deltaCalls === 1) {
          deltaAt = Date.now();
          return Promise.resolve(
            httpErrorResponse("", 429, { "Retry-After": "2" }),
          );
        }
        const gap = Date.now() - deltaAt;
        assert.ok(gap >= 1900, `delta gap ${gap}`);
        return Promise.resolve(new Response(validJevBody("2", 0.9)));
      },
    });
    assert.equal(deltaOk.source, "jev");
    assert.equal(deltaCalls, 2);
  }

  {
    const past = new Date(Date.now() - 60_000).toUTCString();
    let pastCalls = 0;
    const pastOk = await selectAutoLevel({
      ...opts,
      fetchImpl: () => {
        pastCalls++;
        if (pastCalls === 1) {
          return Promise.resolve(
            httpErrorResponse("", 429, { "Retry-After": past }),
          );
        }
        return Promise.resolve(new Response(validJevBody("3", 0.9)));
      },
    });
    assert.equal(pastOk.source, "jev");
    assert.equal(pastCalls, 2);
  }

  for (const kind of ["imf", "asctime"] as const) {
    const canonical = new Date(Date.now() + 2000).toUTCString();
    const expectedDelay = Math.max(0, Date.parse(canonical) - Date.now());
    const [weekday, day, month, year, time] = canonical.split(" ");
    const retryHeader = kind === "imf"
      ? canonical
      : `${weekday.slice(0, 3)} ${month} ${
        String(Number(day)).padStart(2, " ")
      } ${time} ${year}`;
    let futureCalls = 0;
    let waitStartedAt = Date.now();
    const futureOk = await selectAutoLevel({
      ...opts,
      timeoutMs: 15_000,
      fetchImpl: () => {
        futureCalls++;
        if (futureCalls === 1) {
          waitStartedAt = Date.now();
          return Promise.resolve(
            httpErrorResponse("", 429, { "Retry-After": retryHeader }),
          );
        }
        const gap = Date.now() - waitStartedAt;
        assert.ok(
          gap >= expectedDelay - 100,
          `future HTTP-date ${retryHeader} gap ${gap} vs min ${expectedDelay}`,
        );
        return Promise.resolve(new Response(validJevBody("2", 0.9)));
      },
    });
    assert.equal(futureOk.source, "jev");
    assert.equal(futureCalls, 2);
  }

  for (
    const malformed of [
      "+1",
      "2001-01-01",
      "9".repeat(307),
      "9".repeat(400),
    ]
  ) {
    let malformedCalls = 0;
    let lastAt = Date.now();
    const malformedOk = await selectAutoLevel({
      ...opts,
      fetchImpl: () => {
        malformedCalls++;
        if (malformedCalls === 1) {
          lastAt = Date.now();
          return Promise.resolve(
            httpErrorResponse("", 429, { "Retry-After": malformed }),
          );
        }
        const gap = Date.now() - lastAt;
        assert.ok(
          gap >= 200,
          `malformed Retry-After ${malformed} gap ${gap}`,
        );
        return Promise.resolve(new Response(validJevBody("2", 0.9)));
      },
    });
    assert.equal(malformedOk.source, "jev");
    assert.equal(malformedCalls, 2);
  }

  {
    let invalidCalls = 0;
    let lastAt = Date.now();
    const invalidOk = await selectAutoLevel({
      ...opts,
      fetchImpl: () => {
        invalidCalls++;
        if (invalidCalls === 1) {
          lastAt = Date.now();
          return Promise.resolve(
            httpErrorResponse("", 429, { "Retry-After": "-1" }),
          );
        }
        const gap = Date.now() - lastAt;
        assert.ok(gap >= 200, `invalid Retry-After gap ${gap}`);
        return Promise.resolve(new Response(validJevBody("2", 0.9)));
      },
    });
    assert.equal(invalidOk.source, "jev");
    assert.equal(invalidCalls, 2);
  }

  {
    let decimalCalls = 0;
    let lastAt = Date.now();
    await selectAutoLevel({
      ...opts,
      fetchImpl: () => {
        decimalCalls++;
        if (decimalCalls === 1) {
          lastAt = Date.now();
          return Promise.resolve(
            httpErrorResponse("", 429, { "Retry-After": "1.5" }),
          );
        }
        const gap = Date.now() - lastAt;
        assert.ok(gap >= 200, `decimal Retry-After gap ${gap}`);
        return Promise.resolve(new Response(validJevBody("2", 0.9)));
      },
    });
  }

  let hugeCalls = 0;
  const huge = await selectAutoLevel({
    ...opts,
    timeoutMs: 500,
    fetchImpl: () => {
      hugeCalls++;
      return Promise.resolve(
        httpErrorResponse("", 429, { "Retry-After": "999999" }),
      );
    },
  });
  assert.equal(huge.reason, "http_error");
  assert.equal(hugeCalls, 1);
});

Deno.test("auto http_error retries: abort during wait skips further fetch", async () => {
  const opts = autoHttpRetryOpts();
  let fetchCalls = 0;
  let captured: AbortController | undefined;
  const RealAbortController = globalThis.AbortController;
  class CapturingAbortController extends RealAbortController {
    constructor() {
      super();
      captured = this;
    }
  }
  const realClearTimeout = globalThis.clearTimeout;
  let clearCount = 0;
  globalThis.clearTimeout = ((id?: number) => {
    clearCount++;
    return realClearTimeout(id);
  }) as typeof clearTimeout;

  try {
    globalThis.AbortController =
      CapturingAbortController as typeof AbortController;
    const promise = selectAutoLevel({
      ...opts,
      timeoutMs: 15_000,
      fetchImpl: () => {
        fetchCalls++;
        return Promise.resolve(
          httpErrorResponse("", 429, { "Retry-After": "1" }),
        );
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(captured);
    captured!.abort();
    const decision = await promise;
    assert.equal(decision.reason, "timeout");
    assert.equal(fetchCalls, 1);
    assert.ok(clearCount >= 2, `expected wait and main timers cleared`);
  } finally {
    globalThis.AbortController = RealAbortController;
    globalThis.clearTimeout = realClearTimeout;
  }
});

Deno.test("auto http_error retries: shared deadline not reset across waits", async () => {
  const opts = autoHttpRetryOpts();
  let fetchCalls = 0;
  let firstSignal: AbortSignal | undefined;
  let secondSignal: AbortSignal | undefined;

  const decision = await selectAutoLevel({
    ...opts,
    timeoutMs: 400,
    fetchImpl: (_input, init) => {
      fetchCalls++;
      const signal = init?.signal ?? undefined;
      if (fetchCalls === 1) {
        firstSignal = signal;
        return Promise.resolve(httpErrorResponse("", 503));
      }
      secondSignal = signal;
      if (signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
  });

  assert.equal(decision.reason, "timeout");
  assert.equal(fetchCalls, 2);
  assert.ok(firstSignal);
  assert.strictEqual(firstSignal, secondSignal);
});

Deno.test("validateChunkDecision rejects unknown nested keys", () => {
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

Deno.test("chunk schema invariants: fixed/fallback choice and cross-fields", () => {
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

Deno.test("chunk parse independence: invalid depth with valid chunk and reverse", async () => {
  const patchText = "d\n";
  const patchSha256 = sha256Bytes(new TextEncoder().encode(patchText));
  const badDepth = await selectAutoLevel({
    patchText,
    patchSha256,
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () =>
      Promise.resolve(new Response(validJevBody("9", 0.9, "24000", 0.9))),
  });
  assert.equal(badDepth.source, "fallback");
  assert.equal(badDepth.reason, "invalid_choice");
  assert.equal(badDepth.chunking?.source, "jev");
  assert.equal(badDepth.chunking?.choice, "24000");

  const badChunk = await selectAutoLevel({
    patchText,
    patchSha256,
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () =>
      Promise.resolve(
        new Response(validJevBody("3", 0.9, "12000", Number.NaN)),
      ),
  });
  assert.equal(badChunk.source, "jev");
  assert.equal(badChunk.chunking?.source, "fallback");
  assert.equal(badChunk.chunking?.reason, "invalid_confidence");
});

Deno.test("legacy explicit decision without chunking still validates", () => {
  const hash = "a".repeat(64);
  validateLevelDecision(buildExplicitDecision({ level: 2, patchSha256: hash }));
});

Deno.test("subprocess: auto without approval fails without env permission", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-sub-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  try {
    const out = await runSelectLevelSubprocess(
      ["--input", patchPath, "--level", "auto"],
      ["--allow-read"],
    );
    assert.equal(out.code, 1);
    assert.match(out.stderr, /approved-input is required/);
    assert.doesNotMatch(out.stderr, /NotCapable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("SKILL documents select_review_level deno permissions", async () => {
  const skill = await Deno.readTextFile(SKILL_PATH);
  const block = skill.slice(skill.indexOf("LEVEL_DECISION_JSON=$("));
  const denoLine =
    block.split("\n").find((line) => line.includes("deno run")) ??
      "";
  assert.match(denoLine, /--allow-net=openrouter\.ai:443/);
  assert.match(denoLine, /--allow-env=OPEN_ROUTER_API_KEY/);
  assert.match(denoLine, /--no-prompt/);
});

Deno.test("doc policy: parallel-review standing permission and routing", async () => {
  const skill = await Deno.readTextFile(SKILL_PATH);
  const append = await Deno.readTextFile(APPEND_SYSTEM_PATH);
  const injection = await Deno.readTextFile(INJECTION_DEFENSE_PATH);
  const piAgents = await Deno.readTextFile(PI_AGENTS_PATH);
  const piReadme = await Deno.readTextFile(PI_README_PATH);

  assert.match(skill, /## レビュー外部送信の常時許可/);
  const skillStandingLine =
    skill.split("\n").find((line) => line.includes("常時許可（個人設定）")) ??
      "";
  assert.ok(skillStandingLine.length > 0);
  assert.match(
    skillStandingLine,
    /Jev.*routing context|最小 routing context|schemaVersion.*1/s,
  );
  assert.match(skillStandingLine, /reviewer.*patch のみ|patch のみ.*reviewer/s);
  assert.match(
    skill,
    /preflight 成功後.*即時.*parallel-review|即時.*preflight/s,
  );
  assert.match(skill, /Jev.*常時許可|OpenRouter.*常時許可/s);
  assert.match(skill, /Muse Contributor.*常時許可/s);
  assert.match(
    skill,
    /--approved-input.*preflight 成功.*常時許可|常時許可.*--approved-input/s,
  );
  assert.match(skill, /8\..*Jev|常時許可.*節/s);
  assert.match(skill, /秘密.*停止|Muse\/Jev 送信の撤回/);
  assert.match(skill, /silently 省略|別 provider へ切り替え/);

  assert.match(append, /当該ターン.*レビューを依頼.*外部送信要件を充足/s);
  assert.match(
    append,
    /都度確認はしない|preflight 成功後に即時.*parallel-review/s,
  );
  assert.match(append, /Jev と Muse Contributor.*常時許可/s);

  assert.match(
    injection,
    /parallel-review.*レビューを依頼|レビューを依頼.*parallel-review/s,
  );
  assert.match(injection, /Muse.*Jev|Jev.*Muse/);
  assert.match(injection, /秘密|撤回|制限/);

  assert.match(piAgents, /execute immediately|immediate execution/i);
  assert.match(piAgents, /Jev.*standing permission|standing permission.*Jev/i);
  const piStandingClause = piAgents.match(
    /\*\*Standing permission \(personal setup\)\*\*:.*?(?=\*\*Exceptions\*\*)/,
  )?.[0] ?? "";
  assert.ok(piStandingClause.length > 0);
  assert.match(
    piStandingClause,
    /routing context|routing context JSON|minimal routing context/i,
  );
  assert.match(
    piStandingClause,
    /patch only.*reviewer|reviewer.*patch only/i,
  );

  assert.match(piReadme, /\/reload/);
  assert.match(piReadme, /Muse\/Jev.*再確認不要/);
  assert.match(skill, /review-context\.json/);
  assert.match(skill, /--context-file/);
  assert.match(skill, /Jev.*routing context|routing context.*Jev/s);
  assert.match(
    append,
    /Jev.*routing context|routing context.*Jev|patch.*routing context/s,
  );
  assert.match(
    injection,
    /Jev.*routing context|routing context.*Jev|patch.*routing context/s,
  );
  assert.match(piAgents, /routing context.*Jev|Jev.*routing context/s);
  assert.match(piReadme, /routing context.*Jev|Jev.*routing context/s);
});

Deno.test("CLI integration explicit and auto fallback without live network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-cli-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  try {
    const explicit = await runCli([
      "--input",
      patchPath,
      "--level",
      "2",
    ], { getOpenRouterApiKey: () => "must-not-be-used" });
    assert.equal(explicit.code, 0);
    const parsed = JSON.parse(explicit.stdout);
    assert.equal(parsed.source, "explicit");
    assert.equal(parsed.level, 2);

    const autoFallback = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--model",
      "typesafe/jev-1.13",
    ], { getOpenRouterApiKey: () => "" });
    assert.equal(autoFallback.code, 0);
    const fb = JSON.parse(autoFallback.stdout);
    assert.equal(fb.source, "fallback");
    assert.equal(fb.reason, "missing_api_key");
    assert.match(autoFallback.stderr, /^$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("jev accept and low_confidence preserve valid depth probabilities", async () => {
  const patch = "+line\n";
  const probs = { "1": 0.05, "2": 0.1, "3": 0.2, "4": 0.35, "5": 0.3 };
  const accepted = await selectAutoLevel({
    patchText: patch,
    patchSha256: sha256Bytes(new TextEncoder().encode(patch)),
    model: "typesafe/jev-1.13-20260917",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () =>
      Promise.resolve(
        new Response(validJevBody("4", 0.85, "none", 0.85, probs)),
      ),
  });
  assert.equal(accepted.source, "jev");
  assert.deepEqual(accepted.probabilities, probs);
  validateLevelDecision(accepted);

  const low = await selectAutoLevel({
    patchText: patch,
    patchSha256: sha256Bytes(new TextEncoder().encode(patch)),
    model: "typesafe/jev-1.13-20260917",
    apiKey: "k",
    minConfidence: 0.71,
    fetchImpl: () =>
      Promise.resolve(new Response(validJevBody("2", 0.7, "none", 0.9, probs))),
  });
  assert.equal(low.source, "fallback");
  assert.equal(low.reason, "low_confidence");
  assert.deepEqual(low.probabilities, probs);
  validateLevelDecision(low);
});

Deno.test("invalid optional depth probabilities omitted without changing selection", async () => {
  const patch = "+line\n";
  const base = {
    patchText: patch,
    patchSha256: sha256Bytes(new TextEncoder().encode(patch)),
    model: "typesafe/jev-1.13-20260917",
    apiKey: "k",
    minConfidence: 0.7,
  };
  const badProbs = { "1": 0, "2": 0, "3": "1", "4": 0, "5": 0 };
  const missingKey = { "1": 0, "2": 0, "3": 1, "4": 0 };
  for (
    const depthProbabilities of [
      badProbs,
      missingKey,
      { "1": 0, "2": 0, "3": 1, "4": 0, "5": 0, "6": 0 },
      { none: 1 },
      { "1": NaN, "2": 0, "3": 0, "4": 0, "5": 0 },
      { "1": Infinity, "2": 0, "3": 0, "4": 0, "5": 0 },
      { "1": null, "2": 0, "3": 0, "4": 0, "5": 0 },
      { "1": 0, "2": 0, "3": 1.2, "4": 0, "5": 0 },
      [0, 0, 1, 0, 0],
    ]
  ) {
    const decision = await selectAutoLevel({
      ...base,
      fetchImpl: () =>
        Promise.resolve(
          new Response(validJevBody("3", 0.9, "none", 0.9, depthProbabilities)),
        ),
    });
    assert.equal(decision.source, "jev");
    assert.equal(decision.level, 3);
    assert.equal(decision.probabilities, undefined);
  }
});

Deno.test("validateLevelDecision rejects malformed persisted probabilities", () => {
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

Deno.test("transport and explicit fallbacks omit depth probabilities", async () => {
  const patch = "+line\n";
  const hash = sha256Bytes(new TextEncoder().encode(patch));
  const missingKey = await selectAutoLevel({
    patchText: patch,
    patchSha256: hash,
    model: "typesafe/jev-1.13-20260917",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () =>
      Promise.resolve(httpErrorResponse("{}", 500, { "Retry-After": "0" })),
  });
  assert.equal(missingKey.probabilities, undefined);

  const explicit = buildExplicitDecision({ level: 2, patchSha256: hash });
  assert.equal(explicit.probabilities, undefined);
});

Deno.test("DEFAULT_MIN_CONFIDENCE default is 0.5", () => {
  assert.equal(DEFAULT_MIN_CONFIDENCE, 0.5);
});

Deno.test("CLI help documents default min-confidence 0.5", async () => {
  const out = await runCli(["--help"]);
  assert.equal(out.code, 0);
  assert.match(out.stdout, /default 0\.5/);
});

Deno.test("auto with default threshold: 0.49 falls back, 0.5 and 0.65 accepted raw", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const base = {
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: DEFAULT_MIN_CONFIDENCE,
  };

  const atThreshold = await selectAutoLevel({
    ...base,
    fetchImpl: () => Promise.resolve(new Response(validJevBody("2", 0.5))),
  });
  assert.equal(atThreshold.source, "jev");
  assert.equal(atThreshold.confidence, 0.5);

  const mid = await selectAutoLevel({
    ...base,
    fetchImpl: () => Promise.resolve(new Response(validJevBody("3", 0.65))),
  });
  assert.equal(mid.source, "jev");
  assert.equal(mid.level, 3);
  assert.equal(mid.confidence, 0.65);

  const below = await selectAutoLevel({
    ...base,
    fetchImpl: () => Promise.resolve(new Response(validJevBody("4", 0.49))),
  });
  assert.equal(below.source, "fallback");
  assert.equal(below.reason, "low_confidence");
  assert.equal(below.level, 3);
  assert.equal(below.confidence, 0.49);
  assert.equal(below.suggestedLevel, 4);
});

Deno.test("explicit min-confidence 0.7 still rejects 0.65", async () => {
  const patchBytes = new TextEncoder().encode("d\n");
  const decision = await selectAutoLevel({
    patchText: "d\n",
    patchSha256: sha256Bytes(patchBytes),
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    fetchImpl: () => Promise.resolve(new Response(validJevBody("2", 0.65))),
  });
  assert.equal(decision.source, "fallback");
  assert.equal(decision.reason, "low_confidence");
  assert.equal(decision.confidence, 0.65);
  assert.equal(decision.minConfidence, 0.7);
});

Deno.test("runCli auto omits min-confidence and uses default threshold with mock fetch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-default-min-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  const baseArgs = [
    "--input",
    patchPath,
    "--approved-input",
    "--model",
    "typesafe/jev-1.13",
  ];
  const cases = [
    {
      name: "0.49 below default -> L3 fallback",
      extraArgs: [] as string[],
      jevLevel: "4",
      jevConfidence: 0.49,
      expect: {
        source: "fallback" as const,
        reason: "low_confidence",
        level: 3,
        minConfidence: 0.5,
        confidence: 0.49,
      },
    },
    {
      name: "0.5 at default threshold accepted",
      extraArgs: [],
      jevLevel: "2",
      jevConfidence: 0.5,
      expect: {
        source: "jev" as const,
        reason: undefined,
        level: 2,
        minConfidence: 0.5,
        confidence: 0.5,
      },
    },
    {
      name: "0.65 above default accepted raw",
      extraArgs: [],
      jevLevel: "3",
      jevConfidence: 0.65,
      expect: {
        source: "jev" as const,
        reason: undefined,
        level: 3,
        minConfidence: 0.5,
        confidence: 0.65,
      },
    },
    {
      name: "CLI --min-confidence 0.7 rejects 0.65",
      extraArgs: ["--min-confidence", "0.7"],
      jevLevel: "2",
      jevConfidence: 0.65,
      expect: {
        source: "fallback" as const,
        reason: "low_confidence",
        level: 3,
        minConfidence: 0.7,
        confidence: 0.65,
      },
    },
  ] as const;
  try {
    for (const c of cases) {
      const out = await runCli([...baseArgs, ...c.extraArgs], {
        getOpenRouterApiKey: () => "k",
        fetchImpl: () =>
          Promise.resolve(
            new Response(validJevBody(c.jevLevel, c.jevConfidence)),
          ),
      });
      assert.equal(out.code, 0, `${c.name}: ${out.stderr}`);
      const decision = JSON.parse(out.stdout);
      assert.equal(decision.source, c.expect.source, c.name);
      if (c.expect.reason !== undefined) {
        assert.equal(decision.reason, c.expect.reason, c.name);
      }
      assert.equal(decision.level, c.expect.level, c.name);
      assert.equal(decision.minConfidence, c.expect.minConfidence, c.name);
      assert.equal(decision.confidence, c.expect.confidence, c.name);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("Jev request rubric includes level examples and evidence guidance", () => {
  const reviewLevel = (buildJevRequestBody("m", "p").questions as {
    review_level: { instructions: string; criteria: Record<string, string> };
  }).review_level;
  for (const key of ["1", "2", "3", "4", "5"] as const) {
    assert.match(REVIEW_CRITERIA[key], /[Ee]xample:/);
    assert.equal(reviewLevel.criteria[key], REVIEW_CRITERIA[key]);
  }
  const instr = reviewLevel.instructions;
  assert.match(instr, /evidence-backed runtime/i);
  assert.match(instr, /caller scope/i);
  assert.match(instr, /data\/permission\/money/i);
  assert.match(instr, /reversib/i);
  assert.match(instr, /observed validation/i);
  assert.match(instr, /unknown means missing information/i);
  assert.match(instr, /not absence of risk/i);
  assert.match(instr, /Passing tests do not remove/i);
  assert.match(instr, /Markdown|policy|agent instructions/i);
  assert.doesNotMatch(instr, /0\.7|0\.8|target confidence/i);
  const body = buildJevRequestBody("m", "patch");
  assert.deepEqual(Object.keys(body.questions as object).sort(), [
    "chunk_size",
    "review_level",
  ]);
  assert.equal((body.state as { patch: string }).patch, "patch");
});

Deno.test("SKILL and routing-context guide document evidence-backed context", async () => {
  const skill = await Deno.readTextFile(SKILL_PATH);
  assert.match(skill, /references\/routing-context\.md/);
  assert.match(skill, /--min-confidence`（既定[\s\S]{0,40}\*\*0\.5\*\*/);
  assert.match(skill, /0\.7.*0\.8|0\.7–0\.8/);
  assert.match(skill, /評価.*目標|未検証/);

  const guide = await Deno.readTextFile(ROUTING_CONTEXT_GUIDE_PATH);
  for (
    const key of [
      "intent",
      "runtime",
      "impact",
      "dataAndPermissions",
      "rollback",
      "tests",
    ] as const
  ) {
    assert.match(guide, new RegExp(`\\*\\*${key}\\*\\*`));
  }
  assert.match(guide, /Unknown is valid/i);
  assert.match(guide, /not.*no risk|unconfirmed/i);
  assert.match(guide, /executed command.*observed|observed outcome/i);
  assert.match(guide, /test file.*not a passing test|not a passing test/i);
  assert.match(guide, /not downgraded by tests/i);
  assert.match(guide, /size caps|validation|no extra fields/i);
  assert.match(guide, /not.*opened automatically|not automatically/i);
  assert.match(guide, /recommended levels|risk scores|confidence targets/i);
  assert.match(guide, /invent.*no external send|invent “no external send”/s);
  assert.match(guide, /"tests": "unknown"/);
  assert.match(guide, /"dataAndPermissions": "unknown"/);
  assert.match(guide, /paste private review history/i);
});

Deno.test("buildJevRequestBody includes context when provided and preserves patch", () => {
  const patch = "diff --git a/x b/x\n+line\n";
  const ctx = allUnknownContext();
  const body = buildJevRequestBody("typesafe/jev-1.13", patch, ctx);
  const state = body.state as { patch: string; context?: unknown };
  assert.equal(state.patch, patch);
  assert.ok(state.context);
  assert.deepEqual(
    body.questions,
    buildJevRequestBody("m", "p").questions,
  );
  assert.equal(
    JSON.stringify(buildJevRequestBody("m", patch).state),
    JSON.stringify({ patch }),
  );
});

Deno.test("buildJevRequestBody rejects invalid context through validateReviewContext", () => {
  const CANARY = "pr-jev-body-canary-field-q1";
  assert.throws(
    () =>
      buildJevRequestBody("m", "p", {
        ...baseUnknownContextInput(),
        [CANARY]: true,
      }),
    /unsupported field/,
  );
  assert.throws(() => buildJevRequestBody("m", "p", null), /must be an object/);
  assert.throws(
    () =>
      buildJevRequestBody("m", "p", {
        ...baseUnknownContextInput(),
        intent: { summary: "ok", evidence: [] },
      }),
    /intent evidence is invalid/,
  );
  const hugeSummary = "x".repeat(1001);
  assert.throws(
    () =>
      buildJevRequestBody("m", "p", {
        ...baseUnknownContextInput(),
        intent: { summary: hugeSummary, evidence: ["e"] },
      }),
    /intent summary exceeds limit/,
  );
});

Deno.test("selectAutoLevel rejects invalid reviewContext before fetch", async () => {
  let fetchCalled = false;
  await assert.rejects(
    () =>
      selectAutoLevel({
        patchText: "d\n",
        patchSha256: sha256Bytes(new TextEncoder().encode("d\n")),
        model: "typesafe/jev-1.13",
        apiKey: "k",
        minConfidence: 0.7,
        reviewContext: { bad: true },
        fetchImpl: () => {
          fetchCalled = true;
          return Promise.resolve(new Response("{}"));
        },
      }),
    /review context/,
  );
  assert.equal(fetchCalled, false);
});

Deno.test("auto with context attaches contextSha256 on jev and fallbacks", async () => {
  const ctx = allUnknownContext();
  const ctxHash = hashReviewContext(ctx);
  const patch = "+line\n";
  const hash = sha256Bytes(new TextEncoder().encode(patch));

  const jev = await selectAutoLevel({
    patchText: patch,
    patchSha256: hash,
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    reviewContext: ctx,
    fetchImpl: () => Promise.resolve(new Response(validJevBody("3", 0.9))),
  });
  assert.equal(jev.contextSha256, ctxHash);
  validateLevelDecision(jev);

  const fb = await selectAutoLevel({
    patchText: patch,
    patchSha256: hash,
    model: "typesafe/jev-1.13",
    minConfidence: 0.7,
    reviewContext: ctx,
  });
  assert.equal(fb.reason, "missing_api_key");
  assert.equal(fb.contextSha256, ctxHash);
  validateLevelDecision(fb);
});

Deno.test("explicit level ignores context path and omits contextSha256", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-explicit-"));
  const patchPath = join(dir, "p.patch");
  const ctxPath = join(dir, "missing-context.json");
  await writeFile(patchPath, "+line\n");
  try {
    const decision = await selectReviewLevel({
      patchBytes: new TextEncoder().encode("+line\n"),
      levelArg: "2",
      approvedInput: false,
      minConfidence: 0.7,
      apiKey: "secret",
      reviewContext: allUnknownContext(),
    });
    assert.equal(decision.source, "explicit");
    assert.equal(decision.contextSha256, undefined);

    const out = await runCli([
      "--input",
      patchPath,
      "--level",
      "2",
      "--context-file",
      ctxPath,
    ], { getOpenRouterApiKey: () => "must-not-be-used" });
    assert.equal(out.code, 0);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.contextSha256, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("auto invalid context fails before missing_api_key fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-bad-"));
  const patchPath = join(dir, "p.patch");
  const ctxPath = join(dir, "bad.json");
  await writeFile(patchPath, "+line\n");
  const CANARY = "pr-bad-context-canary-88ee";
  await writeFile(ctxPath, `{${CANARY}`);
  try {
    const out = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--context-file",
      ctxPath,
    ], { getOpenRouterApiKey: () => "" });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /valid JSON/);
    assert.doesNotMatch(out.stderr, /missing_api_key/);
    assert.doesNotMatch(out.stderr, new RegExp(CANARY));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("runCli reads context file on auto and attaches contextSha256", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-cli-"));
  const patchPath = join(dir, "p.patch");
  const ctxPath = join(dir, "review-context.json");
  await writeFile(patchPath, "+line\n");
  await writeFile(ctxPath, JSON.stringify(allUnknownContext()));
  const ctxHash = hashReviewContext(allUnknownContext());
  try {
    const out = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--context-file",
      ctxPath,
      "--model",
      "typesafe/jev-1.13",
    ], { getOpenRouterApiKey: () => "" });
    assert.equal(out.code, 0);
    const decision = JSON.parse(out.stdout);
    assert.equal(decision.reason, "missing_api_key");
    assert.equal(decision.contextSha256, ctxHash);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("selectReviewLevel auto sends validated context in single mocked fetch", async () => {
  const ctx = validateReviewContext({
    ...baseUnknownContextInput(),
    intent: {
      summary: "Add schema validation on Jev routing context builder",
      evidence: ["skills/parallel-review/scripts/review_context.ts:89"],
    },
    tests: {
      summary: "Ran review_context_test before wiring buildJevRequestBody",
      evidence: ["skills/parallel-review/tests/review_context_test.ts:1"],
    },
  });
  const patch = "\uFEFFdiff --git a/x b/x\n+\u3042line\n";
  let calls = 0;
  let seenBody: Record<string, unknown> | undefined;
  const decision = await selectReviewLevel({
    patchBytes: new TextEncoder().encode(patch),
    levelArg: "auto",
    approvedInput: true,
    model: "typesafe/jev-1.13",
    apiKey: "k",
    minConfidence: 0.7,
    reviewContext: ctx,
    fetchImpl: (input, init) => {
      calls++;
      const req = new Request(input, init);
      return req.text().then((text) => {
        seenBody = JSON.parse(text);
        return new Response(validJevBody("4", 0.85));
      });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(
    seenBody,
    buildJevRequestBody("typesafe/jev-1.13", patch, ctx),
  );
  const state = seenBody!.state as {
    patch: string;
    context: ReturnType<typeof validateReviewContext>;
  };
  assert.equal(state.patch, patch);
  assert.deepEqual(state.context.intent, ctx.intent);
  assert.deepEqual(state.context.tests, ctx.tests);
  assert.equal(decision.contextSha256, hashReviewContext(ctx));
  assert.ok((seenBody!.questions as Record<string, unknown>).review_level);
  assert.ok((seenBody!.questions as Record<string, unknown>).chunk_size);
});

Deno.test("validateLevelDecision contextSha256 rules", () => {
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

Deno.test("CLI --context-file flag parsing and empty path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-cli-flags-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  try {
    const missingVal = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--context-file",
    ]);
    assert.equal(missingVal.code, 1);
    assert.match(missingVal.stderr, /missing value for --context-file/);

    const dup = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--context-file",
      join(dir, "a.json"),
      "--context-file",
      join(dir, "b.json"),
    ]);
    assert.equal(dup.code, 1);
    assert.match(dup.stderr, /duplicate flag: --context-file/);

    const emptyPath = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--context-file",
      "",
    ]);
    assert.equal(emptyPath.code, 1);
    assert.match(emptyPath.stderr, /context-file path is required/);

    const wsPath = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--context-file",
      "   ",
    ]);
    assert.equal(wsPath.code, 1);
    assert.match(wsPath.stderr, /context-file path is required/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("invalid context rejects before api key getter on auto CLI", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-key-"));
  const patchPath = join(dir, "p.patch");
  const ctxPath = join(dir, "bad.json");
  await writeFile(patchPath, "+line\n");
  await writeFile(ctxPath, '{"schemaVersion":1}');
  let keyCalls = 0;
  try {
    const out = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--context-file",
      ctxPath,
    ], {
      getOpenRouterApiKey: () => {
        keyCalls++;
        return "k";
      },
    });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /missing required field/);
    assert.equal(keyCalls, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("auto without approval fails before throwing key getter or missing context", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-approve-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  let keyCalls = 0;
  try {
    const out = await runCli([
      "--input",
      patchPath,
      "--context-file",
      join(dir, "missing-context.json"),
    ], {
      getOpenRouterApiKey: () => {
        keyCalls++;
        throw new Error("key getter must not run");
      },
    });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /approved-input is required/);
    assert.equal(keyCalls, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("explicit level ignores missing context file and never calls key getter", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pr-ctx-explicit-key-"));
  const patchPath = join(dir, "p.patch");
  await writeFile(patchPath, "+line\n");
  let keyCalls = 0;
  try {
    const out = await runCli([
      "--input",
      patchPath,
      "--level",
      "2",
      "--context-file",
      join(dir, "does-not-exist.json"),
    ], {
      getOpenRouterApiKey: () => {
        keyCalls++;
        throw new Error("key getter must not run");
      },
    });
    assert.equal(out.code, 0);
    assert.equal(keyCalls, 0);
    assert.equal(JSON.parse(out.stdout).source, "explicit");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Deno.test("selectAutoLevel invalid reviewContext does not invoke fetch", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      selectAutoLevel({
        patchText: "+x\n",
        patchSha256: sha256Bytes(new TextEncoder().encode("+x\n")),
        model: "typesafe/jev-1.13",
        apiKey: "k",
        minConfidence: 0.7,
        reviewContext: { schemaVersion: 1 },
        fetchImpl: () => {
          fetchCalls++;
          return Promise.resolve(new Response("{}"));
        },
      }),
    /missing required field/,
  );
  assert.equal(fetchCalls, 0);
});

Deno.test("stderr does not echo patch content on UTF-8 decode errors", async () => {
  const CANARY = "pr-canary-marker-7f3a9b2c-do-not-leak";
  const dir = await mkdtemp(join(tmpdir(), "pr-sub-"));
  const patchPath = join(dir, "bad.patch");
  const prefix = new TextEncoder().encode(CANARY);
  const patchBytes = new Uint8Array(prefix.length + 1);
  patchBytes.set(prefix, 0);
  patchBytes[prefix.length] = 0xff;
  await writeFile(patchPath, patchBytes);
  try {
    const out = await runSelectLevelSubprocess(
      [
        "--input",
        patchPath,
        "--approved-input",
        "--model",
        "typesafe/jev-1.13",
      ],
      ["--allow-read", "--allow-env=OPEN_ROUTER_API_KEY"],
      { OPEN_ROUTER_API_KEY: "test-synthetic-key-no-live-calls" },
    );
    assert.equal(out.code, 1, out.stdout);
    assert.match(out.stderr, /valid UTF-8/);
    assert.doesNotMatch(out.stderr, new RegExp(CANARY));
    assert.doesNotMatch(out.stdout, new RegExp(CANARY));
    assert.doesNotMatch(out.stderr, /ENOENT/);
    assert.doesNotMatch(out.stderr, /approved-input is required/);
    assert.doesNotMatch(out.stderr, /missing_api_key/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
