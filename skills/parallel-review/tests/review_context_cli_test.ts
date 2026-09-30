import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildJevRequestBody,
  runCli,
  selectReviewLevel,
  sha256Bytes,
  validateLevelDecision,
} from "../scripts/select_review_level.ts";
import {
  hashReviewContext,
  REVIEW_CONTEXT_SCHEMA_VERSION,
  validateReviewContext,
} from "../scripts/review_context.ts";

const SYNTH_MODEL = "test/jev";
const SYNTH_RESPONSE_MODEL = "test/jev-response";

const baseUnknownInput = () => ({
  schemaVersion: REVIEW_CONTEXT_SCHEMA_VERSION,
  intent: "unknown" as const,
  runtime: "unknown" as const,
  impact: "unknown" as const,
  dataAndPermissions: "unknown" as const,
  rollback: "unknown" as const,
  tests: "unknown" as const,
});

const synthJevResponseBody = (
  reviewLevel: string,
  reviewConfidence: number,
  chunkChoice: string,
  chunkConfidence: number,
) =>
  JSON.stringify({
    model: SYNTH_RESPONSE_MODEL,
    answers: {
      review_level: {
        type: "choice",
        choice: reviewLevel,
        confidence: reviewConfidence,
        probabilities: { "1": 0, "2": 0, "3": 1, "4": 0, "5": 0 },
      },
      chunk_size: {
        type: "choice",
        choice: chunkChoice,
        confidence: chunkConfidence,
        probabilities: { none: 0, "12000": 1, "24000": 0, "48000": 0 },
      },
    },
    usage: { cost: 0.00001 },
  });

const routingContextWithCanary = (canary: string) =>
  validateReviewContext({
    ...baseUnknownInput(),
    intent: {
      summary: "Synthetic routing intent for CLI integration test",
      evidence: [
        canary,
        "skills/parallel-review/tests/review_context_cli_test.ts:1",
      ],
    },
    tests: {
      summary: "Table-driven selectReviewLevel context hash coverage",
      evidence: ["skills/parallel-review/tests/review_context_cli_test.ts:2"],
    },
  });

Deno.test("runCli auto end-to-end with http_error retry: temp files, mocked global fetch, context in Jev state", async () => {
  const CONTEXT_CANARY = "pr-cli-context-canary-sent-not-echoed-k3";
  const patch = "\uFEFFdiff --git a/x b/x\n+\u3042line\n";
  const ctx = routingContextWithCanary(CONTEXT_CANARY);
  const ctxHash = hashReviewContext(ctx);
  const patchHash = sha256Bytes(new TextEncoder().encode(patch));

  const dir = await mkdtemp(join(tmpdir(), "pr-cli-e2e-"));
  const patchPath = join(dir, "p.patch");
  const ctxPath = join(dir, "review-context.json");
  await writeFile(patchPath, patch);
  await writeFile(
    ctxPath,
    JSON.stringify({
      ...baseUnknownInput(),
      intent: {
        summary: "Synthetic routing intent for CLI integration test",
        evidence: [
          CONTEXT_CANARY,
          "skills/parallel-review/tests/review_context_cli_test.ts:1",
        ],
      },
      tests: {
        summary: "Table-driven selectReviewLevel context hash coverage",
        evidence: ["skills/parallel-review/tests/review_context_cli_test.ts:2"],
      },
    }),
  );

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let seenBody: Record<string, unknown> | undefined;
  let keyCalls = 0;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls++;
    const req = new Request(input, init);
    return req.text().then((text) => {
      seenBody = JSON.parse(text);
      if (fetchCalls === 1) {
        return new Response("synthetic-gateway-error", {
          status: 502,
          headers: { "Retry-After": "0" },
        });
      }
      return new Response(
        synthJevResponseBody("4", 0.88, "12000", 0.91),
        { status: 200 },
      );
    });
  }) as typeof fetch;

  try {
    const out = await runCli([
      "--input",
      patchPath,
      "--approved-input",
      "--context-file",
      ctxPath,
      "--model",
      SYNTH_MODEL,
    ], {
      getOpenRouterApiKey: () => {
        keyCalls++;
        return "synthetic-openrouter-key";
      },
    });

    assert.equal(out.code, 0, out.stderr);
    assert.equal(fetchCalls, 2);
    assert.equal(keyCalls, 1);

    assert.deepEqual(
      seenBody,
      buildJevRequestBody(SYNTH_MODEL, patch, ctx),
    );
    const state = seenBody!.state as {
      patch: string;
      context: ReturnType<typeof validateReviewContext>;
    };
    assert.deepEqual(state, { patch, context: ctx });
    assert.ok((seenBody!.questions as Record<string, unknown>).review_level);
    assert.ok((seenBody!.questions as Record<string, unknown>).chunk_size);

    const sentJson = JSON.stringify(seenBody);
    assert.match(sentJson, new RegExp(CONTEXT_CANARY));

    assert.doesNotMatch(out.stdout, new RegExp(CONTEXT_CANARY));
    assert.doesNotMatch(out.stderr, new RegExp(CONTEXT_CANARY));

    const decision = JSON.parse(out.stdout);
    validateLevelDecision(decision);
    assert.equal(decision.source, "jev");
    assert.equal(decision.level, 4);
    assert.equal(decision.patchSha256, patchHash);
    assert.equal(decision.contextSha256, ctxHash);
    assert.equal(decision.model, SYNTH_RESPONSE_MODEL);
    assert.equal(decision.chunking?.source, "jev");
    assert.equal(decision.chunking?.choice, "12000");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

type MatrixRow = {
  name: string;
  patch: string;
  model?: string;
  apiKey?: string;
  reviewContext?: ReturnType<typeof validateReviewContext>;
  fetchStatus?: number;
  jev?: { level: string; conf: number; chunk: string; chunkConf: number };
  expectedReason: string;
  expectedFetchCalls: number;
  expectContextSha256: boolean;
};

Deno.test("selectReviewLevel context hash matrix (mocked fetch)", async () => {
  const ctx = routingContextWithCanary("pr-matrix-context-canary-m1");
  const ctxHash = hashReviewContext(ctx);
  const patch = "+matrix\n";

  const rows: MatrixRow[] = [
    {
      name: "accepted",
      patch,
      model: SYNTH_MODEL,
      apiKey: "k",
      reviewContext: ctx,
      jev: { level: "3", conf: 0.95, chunk: "24000", chunkConf: 0.92 },
      expectedReason: "jev_ok",
      expectedFetchCalls: 1,
      expectContextSha256: true,
    },
    {
      name: "low_confidence",
      patch,
      model: SYNTH_MODEL,
      apiKey: "k",
      reviewContext: ctx,
      jev: { level: "5", conf: 0.2, chunk: "none", chunkConf: 0.99 },
      expectedReason: "low_confidence",
      expectedFetchCalls: 1,
      expectContextSha256: true,
    },
    {
      name: "http_error",
      patch,
      model: SYNTH_MODEL,
      apiKey: "k",
      reviewContext: ctx,
      fetchStatus: 502,
      expectedReason: "http_error",
      expectedFetchCalls: 4,
      expectContextSha256: true,
    },
    {
      name: "missing_model",
      patch,
      apiKey: "k",
      reviewContext: ctx,
      expectedReason: "missing_model",
      expectedFetchCalls: 0,
      expectContextSha256: true,
    },
    {
      name: "missing_api_key",
      patch,
      model: SYNTH_MODEL,
      reviewContext: ctx,
      expectedReason: "missing_api_key",
      expectedFetchCalls: 0,
      expectContextSha256: true,
    },
    {
      name: "empty_patch",
      patch: "",
      model: SYNTH_MODEL,
      apiKey: "k",
      reviewContext: ctx,
      expectedReason: "empty_patch",
      expectedFetchCalls: 0,
      expectContextSha256: true,
    },
    {
      name: "context_absent",
      patch,
      model: SYNTH_MODEL,
      apiKey: "k",
      jev: { level: "2", conf: 0.9, chunk: "none", chunkConf: 0.9 },
      expectedReason: "jev_ok",
      expectedFetchCalls: 1,
      expectContextSha256: false,
    },
  ];

  for (const row of rows) {
    let calls = 0;
    const bytes = new TextEncoder().encode(row.patch);
    const patchHash = sha256Bytes(bytes);
    const decision = await selectReviewLevel({
      patchBytes: bytes,
      levelArg: "auto",
      approvedInput: true,
      minConfidence: 0.7,
      model: row.model,
      apiKey: row.apiKey,
      reviewContext: row.reviewContext,
      fetchImpl: () => {
        calls++;
        if (row.fetchStatus !== undefined) {
          return Promise.resolve(
            new Response("err", {
              status: row.fetchStatus,
              headers: { "Retry-After": "0" },
            }),
          );
        }
        const jev = row.jev ??
          { level: "3", conf: 0.9, chunk: "none", chunkConf: 0.9 };
        return Promise.resolve(
          new Response(
            synthJevResponseBody(
              jev.level,
              jev.conf,
              jev.chunk,
              jev.chunkConf,
            ),
          ),
        );
      },
    });

    assert.equal(calls, row.expectedFetchCalls, row.name);
    validateLevelDecision(decision);
    assert.equal(decision.reason, row.expectedReason, row.name);
    assert.equal(decision.patchSha256, patchHash, row.name);

    if (row.expectContextSha256) {
      assert.equal(decision.contextSha256, ctxHash, row.name);
    } else {
      assert.equal("contextSha256" in decision, false, row.name);
    }
  }

  let invalidFetchCalls = 0;
  await assert.rejects(
    () =>
      selectReviewLevel({
        patchBytes: new TextEncoder().encode(patch),
        levelArg: "auto",
        approvedInput: true,
        minConfidence: 0.7,
        model: SYNTH_MODEL,
        apiKey: "k",
        reviewContext: { schemaVersion: 1, intent: { nope: true } },
        fetchImpl: () => {
          invalidFetchCalls++;
          return Promise.resolve(new Response("{}"));
        },
      }),
    /review context/,
  );
  assert.equal(invalidFetchCalls, 0);
});
