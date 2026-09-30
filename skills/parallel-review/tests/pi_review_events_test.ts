import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  createStreamTracker,
  extractNumericUsage,
  finalizeStreamOutcome,
  formatFinalStdout,
  processPiJsonLine,
  resolveWrapperExitCode,
  runPiReviewEventsHelper,
  sanitizePiRecord,
  splitJsonlLines,
} from "../scripts/pi_review_events.ts";

function lineCtx(attempt = 1, tracker = createStreamTracker()) {
  return { attempt, attemptStartMs: Date.now(), tracker };
}

function assistantEnd(
  text: string | string[],
  stopReason?: string,
): string {
  const content = (Array.isArray(text) ? text : [text]).map((t) => ({
    type: "text",
    text: t,
  }));
  const message: Record<string, unknown> = {
    role: "assistant",
    usage: {
      input: 10,
      output: 5,
      cost: { input: 0.01, output: 0.02, leakUsd: 9 },
      secretFieldInKeyName: 1,
    },
    content,
  };
  if (stopReason !== undefined) message.stopReason = stopReason;
  return JSON.stringify({ type: "message_end", message });
}

async function touchEventsLog(path: string): Promise<void> {
  await writeFile(path, "", { mode: 0o600 });
}

Deno.test("splitJsonlLines splits on LF only with literal U+2028 and U+2029 inside JSON", () => {
  const sep2028 = "\u2028";
  const sep2029 = "\u2029";
  const payload =
    `{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"a${sep2028}b${sep2029}c"}}\n` +
    `{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"x"}}\r\n`;
  const split = splitJsonlLines(payload);
  assert.equal(split.lines.length, 2);
  const parsed = JSON.parse(split.lines[0]) as {
    assistantMessageEvent: { delta: string };
  };
  assert.equal(parsed.assistantMessageEvent.delta, `a${sep2028}b${sep2029}c`);
  assert.equal(split.remainder, "");
});

Deno.test("splitJsonlLines preserves partial UTF-8 remainder", () => {
  const bytes = new TextEncoder().encode('{"type":"session"}\n{"type":"agent');
  const partial = bytes.slice(0, bytes.length - 2);
  const split = splitJsonlLines(new TextDecoder().decode(partial));
  assert.equal(split.lines.length, 1);
  assert.equal(split.lines[0], '{"type":"session"}');
  assert(split.remainder.length > 0);
});

Deno.test("splitJsonlLines reassembles emoji split mid UTF-8 codepoint", () => {
  const fullStr = '{"type":"session"}\n{"emoji":"😀"}\n';
  const full = new TextEncoder().encode(fullStr);
  let cutAt = -1;
  for (let i = 0; i < full.length; i++) {
    if (full[i] === 0xf0) {
      cutAt = i + 1;
      break;
    }
  }
  assert(cutAt > 0);
  const decoder = new TextDecoder();
  const reassembled = decoder.decode(full.slice(0, cutAt), { stream: true }) +
    decoder.decode(full.slice(cutAt));
  assert.equal(reassembled, fullStr);
  const split = splitJsonlLines(reassembled);
  assert.equal(split.lines.length, 2);
  const emojiLine = JSON.parse(split.lines[1]) as { emoji: string };
  assert.equal(emojiLine.emoji, "😀");
  assert.equal(emojiLine.emoji.includes("\uFFFD"), false);
});

Deno.test("extractNumericUsage allowlists SDK keys and nested cost only", () => {
  const usage = extractNumericUsage({
    input: 1,
    output: 2,
    cacheRead: 3,
    inputTokens: 99,
    secretFieldInKeyName: 4,
    cost: { input: 0.1, total: 0.2, extra: 5 },
  });
  assert.equal(usage?.input, 1);
  assert.equal(usage?.output, 2);
  assert.equal(usage?.cacheRead, 3);
  assert.equal(usage?.inputTokens, undefined);
  assert.equal((usage?.cost as Record<string, number>)?.input, 0.1);
  assert.equal((usage?.cost as Record<string, number>)?.extra, undefined);
  assert.equal(JSON.stringify(usage).includes("secretField"), false);
});

Deno.test("sanitizePiRecord strips secrets and maps unknown raw enums to unknown", () => {
  const tracker = createStreamTracker();
  const raw = {
    type: "totally_unknown_event",
    message: { role: "mystery_role" },
    assistantMessageEvent: {
      type: "weird_assistant_event",
      delta: "SECRET reasoning about -----BEGIN PRIVATE KEY-----",
    },
    usage: { input: 3, output: 1 },
    prompt: "do not log",
    patch: "diff --git",
    errorMessage: "provider blew up",
    environment: { API_KEY: "x" },
    argv: ["--bad"],
    signature: "deadbeef",
  };
  const event = sanitizePiRecord(raw, lineCtx(1, tracker))!;
  const serialized = JSON.stringify(event);
  assert.equal(event.eventType, "unknown");
  assert.equal(event.role, "unknown");
  assert.equal(event.assistantMessageEventType, "unknown");
  assert.match(serialized, /deltaChars/);
  assert.equal(serialized.includes("SECRET"), false);
  assert.equal(serialized.includes("PRIVATE KEY"), false);
  assert.equal(serialized.includes("prompt"), false);
  assert.equal(serialized.includes("errorMessage"), false);
  assert.equal(serialized.includes("secretField"), false);
  assert.equal(serialized.includes("signature"), false);
  assert.equal(serialized.includes("usage"), false);
});

Deno.test("sanitizePiRecord maps unrecognized stopReason to unknown", () => {
  const tracker = createStreamTracker();
  const endEvent = sanitizePiRecord(
    JSON.parse(assistantEnd("x", "providerTimeoutSecret")),
    lineCtx(1, tracker),
  )!;
  assert.equal(endEvent.stopReason, "unknown");
});

Deno.test("sanitizePiRecord preserves known failed stopReason values in metadata", () => {
  for (const reason of ["error", "aborted", "pending", "toolUse"] as const) {
    const tracker = createStreamTracker();
    const event = sanitizePiRecord(
      JSON.parse(assistantEnd("x", reason)),
      lineCtx(1, tracker),
    )!;
    assert.equal(event.stopReason, reason, reason);
  }
});

Deno.test("sanitizePiRecord omits stopReason when absent on message_end", () => {
  const tracker = createStreamTracker();
  const event = sanitizePiRecord(
    JSON.parse(assistantEnd("x")),
    lineCtx(1, tracker),
  )!;
  assert.equal("stopReason" in event, false);
  assert.equal(JSON.stringify(event).includes("stopReason"), false);
});

Deno.test("sanitizePiRecord emits usage only on assistant message_end", () => {
  const tracker = createStreamTracker();
  const update = sanitizePiRecord(
    {
      type: "message_update",
      message: { role: "assistant" },
      usage: { input: 99, output: 1 },
      assistantMessageEvent: { type: "text_delta", delta: "x" },
    },
    lineCtx(1, tracker),
  )!;
  assert.equal(update.usage, undefined);
  const agentEnd = sanitizePiRecord(
    {
      type: "agent_end",
      usage: { input: 77, output: 2 },
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "dup" }],
      },
    },
    lineCtx(1, tracker),
  )!;
  assert.equal(agentEnd.usage, undefined);
});

Deno.test("finalizeStreamOutcome rejects provider error stopReason", () => {
  const tracker = createStreamTracker();
  processPiJsonLine(assistantEnd("ignored", "error"), lineCtx(1, tracker));
  const outcome = finalizeStreamOutcome(tracker);
  assert.equal(
    outcome.streamError,
    "pi review stream: assistant response failed",
  );
});

Deno.test("finalizeStreamOutcome rejects aborted pending and toolUse", () => {
  for (const reason of ["aborted", "pending", "toolUse"] as const) {
    const tracker = createStreamTracker();
    processPiJsonLine(assistantEnd("t", reason), lineCtx(1, tracker));
    const outcome = finalizeStreamOutcome(tracker);
    assert.equal(outcome.streamError?.includes("failed"), true, reason);
  }
});

Deno.test("finalizeStreamOutcome rejects missing stopReason as incomplete", () => {
  const tracker = createStreamTracker();
  processPiJsonLine(assistantEnd("t"), lineCtx(1, tracker));
  const outcome = finalizeStreamOutcome(tracker);
  assert.equal(outcome.streamError?.includes("incomplete"), true);
});

Deno.test("finalizeStreamOutcome rejects unrecognized stopReason", () => {
  const tracker = createStreamTracker();
  processPiJsonLine(assistantEnd("t", "deferred"), lineCtx(1, tracker));
  const outcome = finalizeStreamOutcome(tracker);
  assert.equal(outcome.streamError?.includes("failed"), true);
});

Deno.test("finalizeStreamOutcome accepts stop and length", () => {
  for (const reason of ["stop", "length"]) {
    const tracker = createStreamTracker();
    processPiJsonLine(
      assistantEnd(`ok-${reason}`, reason),
      lineCtx(1, tracker),
    );
    const outcome = finalizeStreamOutcome(tracker);
    assert.equal(outcome.streamError, undefined, reason);
    assert.equal(outcome.finalTextBlocks[0], `ok-${reason}`);
  }
});

Deno.test("finalizeStreamOutcome emits all text blocks", () => {
  const tracker = createStreamTracker();
  processPiJsonLine(
    assistantEnd(["block-a", "block-b"], "stop"),
    lineCtx(1, tracker),
  );
  const outcome = finalizeStreamOutcome(tracker);
  assert.deepEqual(outcome.finalTextBlocks, ["block-a", "block-b"]);
  const stdout = new TextDecoder().decode(
    formatFinalStdout(outcome.finalTextBlocks),
  );
  assert.equal(stdout, "block-a\nblock-b\n");
});

Deno.test("new assistant message_start clears stale completed text", () => {
  const tracker = createStreamTracker();
  const ctx = lineCtx(1, tracker);
  processPiJsonLine(assistantEnd("stale", "stop"), ctx);
  processPiJsonLine(
    '{"type":"message_start","message":{"role":"assistant"}}',
    ctx,
  );
  const outcome = finalizeStreamOutcome(tracker);
  assert.equal(outcome.streamError?.includes("incomplete"), true);
});

Deno.test("malformed JSON line fails visibly", () => {
  const result = processPiJsonLine("{not json", lineCtx());
  assert.equal(result.error, "pi review stream: malformed event line");
});

Deno.test("resolveWrapperExitCode prefers child nonzero over stream error", () => {
  assert.equal(
    resolveWrapperExitCode("pi review stream: malformed event line", 42, null),
    42,
  );
});

Deno.test("runPiReviewEventsHelper with fake Pi emits metadata-only log and final stdout", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "run.events.jsonl");
  await touchEventsLog(eventsLog);
  const fakePi = join(work, "fake_pi.sh");
  const script = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' '{"type":"message_start","message":{"role":"assistant"}}'
printf '%s\\n' '{"type":"message_update","assistantMessageEvent":{"type":"thinking_delta","delta":"think"}}'
printf '%s\\n' '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"review "}}'
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","usage":{"input":1,"output":2},"content":[{"type":"text","text":"review complete"}]}}'
exit 0
`;
  await writeFile(fakePi, script, { mode: 0o755 });

  const proc = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--no-prompt",
      `--allow-write=${eventsLog}`,
      `--allow-run=${fakePi}`,
      fileURLToPath(new URL("../scripts/pi_review_events.ts", import.meta.url)),
      "--events-log",
      eventsLog,
      "--attempt",
      "1",
      "--",
      fakePi,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();

  assert.equal(proc.code, 0, new TextDecoder().decode(proc.stderr));
  const stdout = new TextDecoder().decode(proc.stdout);
  assert.equal(stdout, "review complete\n");

  const log = await readFile(eventsLog, "utf8");
  assert.match(log, /thinking_started/);
  assert.match(log, /text_started/);
  assert.equal(log.includes("SECRET-thought"), false);
  assert.equal(log.includes("review complete"), false);
  const usageLines = log.split("\n").filter((l) => l.includes('"usage"'));
  assert.equal(usageLines.length, 1);
});

Deno.test("runPiReviewEventsHelper ignores agent_end duplicate final message for stdout and usage", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "dup.events.jsonl");
  await touchEventsLog(eventsLog);
  const fakePi = join(work, "dup_pi.sh");
  await writeFile(
    fakePi,
    `#!/usr/bin/env bash
printf '%s\\n' '{"type":"message_start","message":{"role":"assistant"}}'
printf '%s\\n' '${assistantEnd("authoritative", "stop")}'
printf '%s\\n' '{"type":"agent_end","usage":{"input":999},"message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"duplicate"}]}}'
`,
    { mode: 0o755 },
  );

  const proc = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--no-prompt",
      `--allow-write=${eventsLog}`,
      `--allow-run=${fakePi}`,
      fileURLToPath(new URL("../scripts/pi_review_events.ts", import.meta.url)),
      "--events-log",
      eventsLog,
      "--attempt",
      "1",
      "--",
      fakePi,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();

  assert.equal(proc.code, 0, new TextDecoder().decode(proc.stderr));
  assert.equal(new TextDecoder().decode(proc.stdout), "authoritative\n");
  const log = await readFile(eventsLog, "utf8");
  assert.equal(log.includes("duplicate"), false);
  const usageLines = log.split("\n").filter((l) => l.includes('"usage"'));
  assert.equal(usageLines.length, 1);
  assert.match(usageLines[0], /"input":10/);
});

Deno.test("runPiReviewEventsHelper fails on exit0 assistant error stopReason", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "err.events.jsonl");
  await touchEventsLog(eventsLog);
  const fakePi = join(work, "fake_pi_err.sh");
  await writeFile(
    fakePi,
    `#!/usr/bin/env bash
printf '%s\\n' '${assistantEnd("nope", "error")}'
`,
    { mode: 0o755 },
  );

  const code = await runPiReviewEventsHelper({
    eventsLog,
    attempt: 1,
    command: [fakePi],
  });
  assert.equal(code, 1);
});

Deno.test("runPiReviewEventsHelper returns child 42 with empty stdout", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "empty.events.jsonl");
  await touchEventsLog(eventsLog);
  const fakePi = join(work, "exit42.sh");
  await writeFile(fakePi, "#!/usr/bin/env bash\nexit 42\n", { mode: 0o755 });

  const code = await runPiReviewEventsHelper({
    eventsLog,
    attempt: 1,
    command: [fakePi],
  });
  assert.equal(code, 42);
});

Deno.test("runPiReviewEventsHelper fails when events log is missing", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "missing.events.jsonl");
  const fakePi = join(work, "noop.sh");
  await writeFile(fakePi, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });

  const code = await runPiReviewEventsHelper({
    eventsLog,
    attempt: 1,
    command: [fakePi],
  });
  assert.equal(code, 1);
});

Deno.test(
  "runPiReviewEventsHelper drains pipe after malformed line without leaking canaries",
  async () => {
    const work = await mkdtemp(join(tmpdir(), "pi-events-"));
    const eventsLog = join(work, "drain.events.jsonl");
    await touchEventsLog(eventsLog);
    const fakePi = join(work, "big_pipe.sh");
    const filler = "x".repeat(140_000);
    const script = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' 'not-json'
printf '%s\\n' '{"type":"message_start","message":{"role":"assistant"}}'
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","stopReason":"stop","usage":{"input":1},"content":[{"type":"text","text":"${filler}-CANARY"}]}}'
exit 0
`;
    await writeFile(fakePi, script, { mode: 0o755 });

    const run = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-config",
        "--no-prompt",
        `--allow-write=${eventsLog}`,
        `--allow-run=${fakePi}`,
        fileURLToPath(
          new URL("../scripts/pi_review_events.ts", import.meta.url),
        ),
        "--events-log",
        eventsLog,
        "--attempt",
        "1",
        "--",
        fakePi,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();

    assert.notEqual(run.code, 0);
    const log = await readFile(eventsLog, "utf8");
    assert.equal(log.includes("CANARY"), false);
    assert.equal(log.includes(filler), false);
  },
);

Deno.test("runPiReviewEventsHelper emits multiple final text blocks", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "multi.events.jsonl");
  await touchEventsLog(eventsLog);
  const fakePi = join(work, "multi.sh");
  await writeFile(
    fakePi,
    `#!/usr/bin/env bash
printf '%s\\n' '{"type":"message_start","message":{"role":"assistant"}}'
printf '%s\\n' '${assistantEnd(["alpha", "beta"], "stop")}'
`,
    { mode: 0o755 },
  );

  const proc = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--no-prompt",
      `--allow-write=${eventsLog}`,
      `--allow-run=${fakePi}`,
      fileURLToPath(new URL("../scripts/pi_review_events.ts", import.meta.url)),
      "--events-log",
      eventsLog,
      "--attempt",
      "1",
      "--",
      fakePi,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();

  assert.equal(proc.code, 0, new TextDecoder().decode(proc.stderr));
  assert.equal(new TextDecoder().decode(proc.stdout), "alpha\nbeta\n");
});
