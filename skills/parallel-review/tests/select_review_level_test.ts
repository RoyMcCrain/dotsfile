import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildExplicitDecision,
  buildFallbackDecision,
  buildJevDecision,
  buildJevRequestBody,
  decodeUtf8Strict,
  DEFAULT_MIN_CONFIDENCE,
  JEV_ENDPOINT,
  RESPONSE_MAX_BYTES,
  runCli,
  selectAutoLevel,
  selectReviewLevel,
  sha256Bytes,
  validateLevelDecision,
} from "../scripts/select_review_level.ts";

const SCRIPT_PATH = join(
  import.meta.dirname!,
  "../scripts/select_review_level.ts",
);
const SKILL_PATH = join(import.meta.dirname!, "../SKILL.md");

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

const validJevBody = (choice: string, confidence: number) =>
  JSON.stringify({
    model: "typesafe/jev-1.13-20260917",
    answers: {
      review_level: {
        type: "choice",
        choice,
        confidence,
        probabilities: { "1": 0, "2": 0, "3": 1, "4": 0, "5": 0 },
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

  const decision = await selectAutoLevel({
    patchText: patch,
    patchSha256: sha256Bytes(new TextEncoder().encode(patch)),
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
  const base = {
    patchText: "d\n",
    patchSha256: sha256Bytes(new TextEncoder().encode("d\n")),
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
  const opts = {
    patchText: "d\n",
    patchSha256: sha256Bytes(new TextEncoder().encode("d\n")),
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
  const opts = {
    patchText: "d\n",
    patchSha256: sha256Bytes(new TextEncoder().encode("d\n")),
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
  const opts = {
    patchText: "d\n",
    patchSha256: sha256Bytes(new TextEncoder().encode("d\n")),
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
