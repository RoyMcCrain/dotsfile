import assert from "node:assert/strict";
import {
  createImplStreamState,
  extractNumericUsage,
  finalizeImplStream,
  formatFinalStdout,
  MAX_JSONL_LINE_BYTES,
  normalizeStopReason,
  processImplJsonLine,
  resolveImplExitCode,
  sanitizeImplEventForLog,
  splitJsonlByteFrames,
  splitJsonlLines,
} from "../scripts/impl_stream.ts";

const CANARY = "CANARY-SECRET-9f3e2a1b";

function assistantEnd(
  text: string,
  stopReason = "stop",
  usage?: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      stopReason,
      content: [{ type: "text", text }],
      usage: usage ?? {
        input: 10,
        output: 5,
        reasoning: 2,
        cost: { total: 0.03, leak: 999 },
      },
      errorMessage: CANARY,
      thinking: CANARY,
    },
  });
}

Deno.test("splitJsonlLines splits LF not U+2028 inside JSON", () => {
  const payload =
    `{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"a\u2028b"}}\n`;
  const split = splitJsonlLines(payload);
  assert.equal(split.lines.length, 1);
});

Deno.test("splitJsonlByteFrames ignores U+2029 as line break", () => {
  const line = `{"x":1}\u2029\n`;
  const enc = new TextEncoder();
  const { lines } = splitJsonlByteFrames(enc.encode(line), new Uint8Array());
  assert.equal(lines.length, 1);
  assert.equal(new TextDecoder().decode(lines[0]), `{"x":1}\u2029`);
});

Deno.test("tool_execution_end counts write via toolName field", () => {
  const state = createImplStreamState();
  processImplJsonLine(
    JSON.stringify({
      type: "tool_execution_end",
      toolName: "write",
      isError: false,
    }),
    state,
  );
  assert.equal(state.toolCalls.write, 1);
  assert.equal(state.toolCalls.unknown, undefined);
});

Deno.test("retry count uses auto_retry_start not agent_end.error", () => {
  const state = createImplStreamState();
  processImplJsonLine(
    JSON.stringify({ type: "agent_end", error: "legacy" }),
    state,
  );
  assert.equal(state.retryCount, 0);
  processImplJsonLine(JSON.stringify({ type: "auto_retry_start" }), state);
  processImplJsonLine(JSON.stringify({ type: "auto_retry_end" }), state);
  processImplJsonLine(JSON.stringify({ type: "auto_retry_start" }), state);
  assert.equal(state.retryCount, 2);
});

Deno.test("two assistant ends: second without usage yields partial coverage", () => {
  const state = createImplStreamState();
  processImplJsonLine(
    assistantEnd("first", "stop", {
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
    }),
    state,
  );
  processImplJsonLine(
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "second" }],
      },
    }),
    state,
  );
  assert.equal(state.usage.expectedSlices, 2);
  assert.equal(state.usage.coverage, "partial");
  assert.equal(state.usage.knownSlices?.input, 1);
});

Deno.test("usage complete only when every slice reports core metrics", () => {
  const state = createImplStreamState();
  processImplJsonLine(
    assistantEnd("a", "stop", {
      input: 1,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      cost: { total: 0.01 },
    }),
    state,
  );
  assert.equal(state.usage.coverage, "complete");
  assert.equal(state.usage.knownSlices?.estimatedCostUsd, 1);
});

Deno.test("cost completeness independent from token coverage", () => {
  const state = createImplStreamState();
  processImplJsonLine(
    assistantEnd("a", "stop", {
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
    }),
    state,
  );
  assert.equal(state.usage.coverage, "complete");
  assert.equal(state.usage.knownSlices?.estimatedCostUsd, undefined);
});

Deno.test("compaction_end increments expectedSlices and usage", () => {
  const state = createImplStreamState();
  processImplJsonLine(assistantEnd("a"), state);
  processImplJsonLine(
    JSON.stringify({
      type: "compaction_end",
      result: {
        usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
      },
    }),
    state,
  );
  assert.equal(state.usage.expectedSlices, 2);
  assert.equal(state.usage.input, 11);
});

Deno.test("finalize requires agent_settled and stop reason stop", () => {
  const state = createImplStreamState();
  processImplJsonLine(assistantEnd("x", "length"), state);
  processImplJsonLine('{"type":"agent_settled","aborted":false}', state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "incomplete");
});

Deno.test("normalizeStopReason maps CANARY to unknown", () => {
  assert.equal(normalizeStopReason("CANARY_SECRET"), "unknown");
  assert.equal(normalizeStopReason("stop"), "stop");
});

Deno.test("finalize normalizes unknown stopReason in outcome", () => {
  const state = createImplStreamState();
  processImplJsonLine(assistantEnd("x", "CANARY_SECRET"), state);
  processImplJsonLine('{"type":"agent_settled","aborted":false}', state);
  const out = finalizeImplStream(state);
  assert.equal(out.stopReason, "unknown");
});

Deno.test("recovery after auto_retry still completes on settled stop", () => {
  const state = createImplStreamState();
  processImplJsonLine(JSON.stringify({ type: "auto_retry_start" }), state);
  processImplJsonLine(assistantEnd("ok"), state);
  processImplJsonLine('{"type":"agent_settled","aborted":false}', state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "completed");
  assert.equal(out.finalTextBlocks[0], "ok");
});

Deno.test("empty assistant text may still complete", () => {
  const state = createImplStreamState();
  processImplJsonLine(assistantEnd(""), state);
  processImplJsonLine('{"type":"agent_settled","aborted":false}', state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "completed");
  assert.equal(out.finalTextBlocks.length, 0);
});

Deno.test("message_start after settled invalidates stale completion", () => {
  const state = createImplStreamState();
  processImplJsonLine(assistantEnd("first"), state);
  processImplJsonLine('{"type":"agent_settled","aborted":false}', state);
  processImplJsonLine(
    '{"type":"message_start","message":{"role":"assistant"}}',
    state,
  );
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "incomplete");
});

Deno.test("child exit 0 with aborted settled is failed/incomplete exit code", () => {
  const state = createImplStreamState();
  processImplJsonLine(assistantEnd("x", "error"), state);
  processImplJsonLine('{"type":"agent_settled","aborted":true}', state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "failed");
  assert.equal(
    resolveImplExitCode(out.streamError, out.executionStatus, 0, null),
    1,
  );
});

Deno.test("resolveImplExitCode preserves nonzero child code when stream completed", () => {
  assert.equal(resolveImplExitCode(undefined, "completed", 17, null), 17);
});

Deno.test("sanitize strips secrets and uses toolName", () => {
  const raw = JSON.parse(
    JSON.stringify({
      type: "tool_execution_end",
      toolName: "write",
      isError: false,
      args: { CANARY },
      result: CANARY,
    }),
  );
  const event = sanitizeImplEventForLog(raw, 10);
  assert(event);
  const blob = JSON.stringify(event);
  assert.equal(blob.includes(CANARY), false);
  assert.equal(blob.includes("args"), false);
  assert.equal(event.toolName, "write");
});

Deno.test("sanitize assistant stopReason allowlist", () => {
  const raw = JSON.parse(assistantEnd("x", CANARY));
  const event = sanitizeImplEventForLog(raw, 1);
  assert(event);
  assert.equal(event.stopReason, "unknown");
  assert.equal(JSON.stringify(event).includes(CANARY), false);
});

Deno.test("extractNumericUsage keeps only known numeric keys", () => {
  const usage = extractNumericUsage({
    input: 1,
    output: 2,
    secret: 9,
    cost: { total: 0.1, extra: 1 },
  });
  assert(usage);
  assert.equal(usage.input, 1);
  assert.equal((usage.cost as Record<string, number>).total, 0.1);
  assert.equal("secret" in usage, false);
});

Deno.test("formatFinalStdout preserves assistant text", () => {
  const bytes = formatFinalStdout(["line1", "line2"]);
  assert.equal(new TextDecoder().decode(bytes), "line1\nline2\n");
});

Deno.test("oversize line marks stream invalid and blocks completion", () => {
  const state = createImplStreamState();
  const big = "x".repeat(MAX_JSONL_LINE_BYTES + 1);
  const r = processImplJsonLine(big, state);
  assert.equal(r.oversize, true);
  assert(state.streamParseError !== undefined);
  processImplJsonLine(assistantEnd("ok"), state);
  processImplJsonLine('{"type":"agent_settled","aborted":false}', state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "failed");
  assert.equal(
    resolveImplExitCode(out.streamError, out.executionStatus, 0, null),
    1,
  );
});

Deno.test("malformed line sets streamParseError and fails finalize", () => {
  const state = createImplStreamState();
  const r = processImplJsonLine("{not-json", state);
  assert.equal(r.parseError, true);
  assert(state.streamParseError !== undefined);
  processImplJsonLine(assistantEnd("ok"), state);
  processImplJsonLine('{"type":"agent_settled","aborted":false}', state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "failed");
});

Deno.test("unknown typed custom events are ignored without stream error", () => {
  const state = createImplStreamState();
  const r = processImplJsonLine(
    JSON.stringify({ type: "custom_telemetry", note: "ok" }),
    state,
  );
  assert.equal(r.parseError, undefined);
  assert.equal(state.streamParseError, undefined);
});

Deno.test("scalar and array JSON lines are invalid protocol", () => {
  for (const line of ['"scalar"', "[1,2]"]) {
    const state = createImplStreamState();
    const r = processImplJsonLine(line, state);
    assert.equal(r.parseError, true);
    assert(state.streamParseError !== undefined);
  }
});

Deno.test("malformed line after terminal events still fails completion", () => {
  const state = createImplStreamState();
  processImplJsonLine(assistantEnd("done"), state);
  processImplJsonLine('{"type":"agent_settled","aborted":false}', state);
  processImplJsonLine("{bad", state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "failed");
});

Deno.test("agent_settled without aborted is incomplete not completed", () => {
  const state = createImplStreamState();
  processImplJsonLine(assistantEnd("ok"), state);
  processImplJsonLine('{"type":"agent_settled"}', state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "incomplete");
});

Deno.test("usage slice without core metrics stays coverage unknown", () => {
  const state = createImplStreamState();
  processImplJsonLine(
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "only text" }],
      },
    }),
    state,
  );
  assert.equal(state.usage.expectedSlices, 1);
  assert.equal(state.usage.coverage, "unknown");
});

Deno.test("usage numeric overflow omits aggregate and known slice count", () => {
  const state = createImplStreamState();
  const huge = Number.MAX_VALUE;
  processImplJsonLine(
    assistantEnd("a", "stop", {
      input: huge,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
    }),
    state,
  );
  processImplJsonLine(
    assistantEnd("b", "stop", {
      input: huge,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
    }),
    state,
  );
  assert.equal(state.usage.input, undefined);
  assert.equal(state.usage.knownSlices?.input, undefined);
  assert.equal(state.usage.output, 4);
  assert.equal(state.usage.coverage, "partial");
});

Deno.test("stream parse error degrades usage coverage to partial when observed", () => {
  const state = createImplStreamState();
  processImplJsonLine(
    assistantEnd("a", "stop", {
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
    }),
    state,
  );
  processImplJsonLine("{bad", state);
  const out = finalizeImplStream(state);
  assert.equal(out.executionStatus, "failed");
  assert.equal(state.usage.coverage, "partial");
});

Deno.test("splitJsonlByteFrames splits multibyte UTF-8 across chunks", () => {
  const enc = new TextEncoder();
  const full = enc.encode('{"t":"ok"}\n');
  const part1 = full.subarray(0, full.length - 2);
  const part2 = full.subarray(full.length - 2);
  const first = splitJsonlByteFrames(part1, new Uint8Array());
  assert.equal(first.lines.length, 0);
  const second = splitJsonlByteFrames(part2, first.remainder);
  assert.equal(second.lines.length, 1);
  assert.equal(new TextDecoder().decode(second.lines[0]), '{"t":"ok"}');
});

Deno.test("splitJsonlByteFrames reports discarded oversize complete lines", () => {
  const enc = new TextEncoder();
  const line = "x".repeat(MAX_JSONL_LINE_BYTES + 1) + "\n";
  const split = splitJsonlByteFrames(enc.encode(line), new Uint8Array());
  assert.equal(split.lines.length, 0);
  assert.equal(split.discardedOversizeLines, 1);
});

Deno.test("splitJsonlByteFrames keeps partial frame until newline under byte limit", () => {
  const enc = new TextEncoder();
  const partial = enc.encode(" ".repeat(MAX_JSONL_LINE_BYTES));
  const split = splitJsonlByteFrames(partial, new Uint8Array());
  assert.equal(split.lines.length, 0);
  assert.equal(split.remainder.length, MAX_JSONL_LINE_BYTES);
  assert.equal(split.discardedOversizeLines, 0);
});
