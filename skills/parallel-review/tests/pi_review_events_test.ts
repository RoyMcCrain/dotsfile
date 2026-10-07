import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  classifyProviderFailure,
  classifyWrapperError,
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
  errorMessage?: string,
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
  if (errorMessage !== undefined) message.errorMessage = errorMessage;
  return JSON.stringify({ type: "message_end", message });
}

const CANARY_TOKEN = "CANARY-SECRET-TOKEN-9f3e2a1b";
const CANARY_URL = "https://evil.example/leak?key=CANARY-URL";

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
  assert.match(
    outcome.streamError ?? "",
    /assistant response failed \(provider_error\)/,
  );
});

Deno.test("classifyProviderFailure maps auth and rate limit without leaking hints", () => {
  const auth = classifyProviderFailure({
    stopReason: "error",
    errorMessage: `401 Unauthorized ${CANARY_TOKEN} ${CANARY_URL}`,
  });
  assert.equal(auth.category, "authentication");
  assert.equal(auth.httpStatus, 401);

  const rate = classifyProviderFailure({
    stopReason: "error",
    errorMessage: `429 rate limit ${CANARY_TOKEN}`,
  });
  assert.equal(rate.category, "rate_limit");
  assert.equal(rate.httpStatus, 429);

  const rateTextOnly = classifyProviderFailure({
    stopReason: "error",
    errorMessage: `Rate limit exceeded ${CANARY_TOKEN}`,
  });
  assert.equal(rateTextOnly.category, "rate_limit");
  assert.equal(rateTextOnly.httpStatus, undefined);

  const auth403 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "403 forbidden",
  });
  assert.equal(auth403.category, "authentication");
  assert.equal(auth403.httpStatus, 403);

  const unknown = classifyProviderFailure({
    stopReason: "aborted",
    errorMessage: `something odd ${CANARY_TOKEN}`,
  });
  assert.equal(unknown.category, "unknown");
});

Deno.test("classifyProviderFailure ignores incidental digits without HTTP status context", () => {
  const requestId429 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "HTTP 500 internal server error; request id: 429",
  });
  assert.equal(requestId429.category, "provider_error");
  assert.equal(requestId429.httpStatus, undefined);

  const ms401 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "network timeout after 401 milliseconds",
  });
  assert.equal(ms401.category, "network");
  assert.equal(ms401.httpStatus, undefined);

  const ms401Prefix = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "401 milliseconds elapsed before network timeout",
  });
  assert.equal(ms401Prefix.category, "network");
  assert.equal(ms401Prefix.httpStatus, undefined);

  const url401 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: `fetch failed https://api.example/401/items ${CANARY_TOKEN}`,
  });
  assert.equal(url401.category, "network");
  assert.equal(url401.httpStatus, undefined);

  const urlStatus401 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "fetch failed https://api.example/status401/items",
  });
  assert.equal(urlStatus401.category, "network");
  assert.equal(urlStatus401.httpStatus, undefined);

  const incidentalReason = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "request id: 401 Unauthorized",
  });
  assert.equal(incidentalReason.httpStatus, undefined);
});

Deno.test("classifyProviderFailure regression: request id JSON must not override auth or network", () => {
  const networkTimeout429 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: 'network timeout; request id: 429 {"trace":"id"}',
  });
  assert.equal(networkTimeout429.category, "network");
  assert.equal(networkTimeout429.httpStatus, undefined);

  const authOverRequestId429 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: '401 Unauthorized; request id: 429 {"trace":"id"}',
  });
  assert.equal(authOverRequestId429.category, "authentication");
  assert.equal(authOverRequestId429.httpStatus, 401);
});

Deno.test("classifyProviderFailure prefers real HTTP status over incidental numbers", () => {
  const authOver429 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: `401 Unauthorized ${CANARY_TOKEN}; request id: 429`,
  });
  assert.equal(authOver429.category, "authentication");
  assert.equal(authOver429.httpStatus, 401);

  const sdk429 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: '429 {"error":{"message":"rate limit"}}',
  });
  assert.equal(sdk429.category, "rate_limit");
  assert.equal(sdk429.httpStatus, 429);

  const httpStatusMarker = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "status 403 access denied",
  });
  assert.equal(httpStatusMarker.category, "authentication");
  assert.equal(httpStatusMarker.httpStatus, 403);

  const statusCode429 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "status code: 429",
  });
  assert.equal(statusCode429.category, "rate_limit");
  assert.equal(statusCode429.httpStatus, 429);

  const httpVersion401 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "HTTP/1.1 401",
  });
  assert.equal(httpVersion401.category, "authentication");
  assert.equal(httpVersion401.httpStatus, 401);
});

Deno.test("classifyProviderFailure text-only auth and rate limit stay without httpStatus", () => {
  const oauthOnly = classifyProviderFailure({
    stopReason: "error",
    errorMessage: `OAuth token refresh failed ${CANARY_TOKEN}`,
  });
  assert.equal(oauthOnly.category, "authentication");
  assert.equal(oauthOnly.httpStatus, undefined);

  const badToken401 = classifyProviderFailure({
    stopReason: "error",
    errorMessage: "401 bad token expired",
  });
  assert.equal(badToken401.category, "authentication");
  assert.equal(badToken401.httpStatus, 401);
});

Deno.test("sanitizePiRecord adds safe errorCategory on failed assistant message_end", () => {
  const tracker = createStreamTracker();
  const event = sanitizePiRecord(
    JSON.parse(
      assistantEnd("x", "error", `403 forbidden oauth refresh ${CANARY_TOKEN}`),
    ),
    lineCtx(1, tracker),
  )!;
  assert.equal(event.errorCategory, "authentication");
  assert.equal(event.httpStatus, 403);
  assert.equal(JSON.stringify(event).includes(CANARY_TOKEN), false);
  assert.equal(JSON.stringify(event).includes(CANARY_URL), false);
});

Deno.test("runPiReviewEventsHelper logs rate_limit without canaries or partial final text", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "rate.events.jsonl");
  await touchEventsLog(eventsLog);
  const CANARY_BODY = "CANARY-BODY-SNIPPET-leak";
  const CANARY_PROMPT = "CANARY-PROMPT-leak";
  const fakePi = join(work, "rate_pi.sh");
  await writeFile(
    fakePi,
    `#!/usr/bin/env bash
printf '%s\\n' '${
      assistantEnd(
        `partial review ${CANARY_BODY}`,
        "error",
        `Rate limit exceeded token=${CANARY_TOKEN} url=${CANARY_URL} prompt=${CANARY_PROMPT}`,
      )
    }'
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

  assert.notEqual(proc.code, 0);
  const stdout = new TextDecoder().decode(proc.stdout);
  const stderr = new TextDecoder().decode(proc.stderr);
  assert.match(stderr, /assistant response failed \(rate_limit\)/);
  assert.equal(stdout.includes(CANARY_TOKEN), false);
  assert.equal(stdout.includes(CANARY_URL), false);
  assert.equal(stdout.includes(CANARY_BODY), false);
  assert.equal(stdout.includes(CANARY_PROMPT), false);
  assert.equal(stdout.includes("partial review"), false);
  assert.equal(stderr.includes(CANARY_TOKEN), false);
  assert.equal(stderr.includes(CANARY_URL), false);
  assert.equal(stderr.includes(CANARY_PROMPT), false);
  assert.equal(stderr.includes(CANARY_BODY), false);
  const log = await readFile(eventsLog, "utf8");
  assert.match(log, /"errorCategory":"rate_limit"/);
  assert.equal(log.includes('"httpStatus"'), false);
  assert.equal(log.includes(CANARY_TOKEN), false);
  assert.equal(log.includes(CANARY_URL), false);
  assert.equal(log.includes(CANARY_BODY), false);
  assert.equal(log.includes(CANARY_PROMPT), false);
  assert.equal(log.includes("partial review"), false);
});

Deno.test("runPiReviewEventsHelper logs auth category and stderr without canaries", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "auth.events.jsonl");
  await touchEventsLog(eventsLog);
  const fakePi = join(work, "auth_pi.sh");
  await writeFile(
    fakePi,
    `#!/usr/bin/env bash
printf '%s\\n' '${
      assistantEnd(
        "nope",
        "error",
        `401 bad token ${CANARY_TOKEN} ${CANARY_URL}`,
      )
    }'
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

  assert.notEqual(proc.code, 0);
  const stderr = new TextDecoder().decode(proc.stderr);
  assert.match(stderr, /assistant response failed \(authentication\)/);
  assert.equal(stderr.includes(CANARY_TOKEN), false);
  assert.equal(stderr.includes(CANARY_URL), false);
  const log = await readFile(eventsLog, "utf8");
  assert.match(log, /"errorCategory":"authentication"/);
  assert.equal(log.includes(CANARY_TOKEN), false);
});

Deno.test("classifyWrapperError maps permission and missing executable", () => {
  const perm = classifyWrapperError(
    new Deno.errors.NotCapable("Requires --allow-run permissions"),
  );
  assert.equal(perm.category, "permission_denied");

  const missing = classifyWrapperError(new Deno.errors.NotFound("missing"));
  assert.equal(missing.category, "executable_not_found");

  const internal = classifyWrapperError(new Error(`fail ${CANARY_TOKEN}`));
  assert.equal(internal.category, "internal_error");
  assert.equal(JSON.stringify(internal).includes(CANARY_TOKEN), false);
});

Deno.test("runPiReviewEventsHelper spawn denial logs wrapper_error without path canary", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "spawn.events.jsonl");
  await touchEventsLog(eventsLog);
  const secretDir = join(work, "CANARY-PATH-LEAK");
  await Deno.mkdir(secretDir, { recursive: true });
  const secretPath = join(secretDir, "pi.sh");
  await writeFile(secretPath, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });

  const proc = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--no-prompt",
      `--allow-write=${eventsLog}`,
      `--allow-run=${join(work, "allowed-only.sh")}`,
      fileURLToPath(new URL("../scripts/pi_review_events.ts", import.meta.url)),
      "--events-log",
      eventsLog,
      "--attempt",
      "2",
      "--",
      secretPath,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();

  assert.notEqual(proc.code, 0);
  const stderr = new TextDecoder().decode(proc.stderr);
  assert.match(stderr, /permission_denied/);
  assert.equal(stderr.includes("CANARY-PATH-LEAK"), false);
  const log = await readFile(eventsLog, "utf8");
  assert.match(log, /"kind":"wrapper_error"/);
  assert.match(log, /"errorCategory":"permission_denied"/);
  assert.match(log, /"phase":"spawn"/);
  assert.match(log, /"attempt":2/);
  assert.equal(log.includes("CANARY-PATH-LEAK"), false);
});

Deno.test("runPiReviewEventsHelper missing executable logs executable_not_found", async () => {
  const work = await mkdtemp(join(tmpdir(), "pi-events-"));
  const eventsLog = join(work, "missing.events.jsonl");
  await touchEventsLog(eventsLog);
  const missing = join(work, "no-such-pi-CANARY-NAME");

  const proc = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--no-prompt",
      `--allow-write=${eventsLog}`,
      `--allow-run=${missing}`,
      fileURLToPath(new URL("../scripts/pi_review_events.ts", import.meta.url)),
      "--events-log",
      eventsLog,
      "--attempt",
      "1",
      "--",
      missing,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();

  assert.notEqual(proc.code, 0);
  const stderr = new TextDecoder().decode(proc.stderr);
  assert.match(stderr, /executable_not_found/);
  assert.equal(stderr.includes("CANARY-NAME"), false);
  const log = await readFile(eventsLog, "utf8");
  assert.match(log, /"errorCategory":"executable_not_found"/);
  assert.equal(log.includes("CANARY-NAME"), false);
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

Deno.test("message_start clears stale error metadata from prior failed message_end", () => {
  const tracker = createStreamTracker();
  const ctx = lineCtx(1, tracker);
  processPiJsonLine(
    assistantEnd("fail", "error", "401 unauthorized"),
    ctx,
  );
  assert.equal(tracker.lastErrorCategory, "authentication");
  processPiJsonLine(
    '{"type":"message_start","message":{"role":"assistant"}}',
    ctx,
  );
  assert.equal(tracker.lastErrorCategory, undefined);
  assert.equal(tracker.lastHttpStatus, undefined);
});

Deno.test("successful assistant message_end after failed message_end clears error metadata", () => {
  const tracker = createStreamTracker();
  const ctx = lineCtx(1, tracker);
  const failEvent = sanitizePiRecord(
    JSON.parse(assistantEnd("partial leak", "error", "rate limit hit")),
    ctx,
  )!;
  assert.equal(failEvent.errorCategory, "rate_limit");
  assert.equal(failEvent.httpStatus, undefined);

  const okEvent = sanitizePiRecord(
    JSON.parse(assistantEnd("recovered", "stop")),
    ctx,
  )!;
  assert.equal(okEvent.errorCategory, undefined);
  assert.equal(okEvent.httpStatus, undefined);
  assert.equal("errorCategory" in okEvent, false);
  assert.equal("httpStatus" in okEvent, false);

  const outcome = finalizeStreamOutcome(tracker);
  assert.equal(outcome.streamError, undefined);
  assert.equal(outcome.finalTextBlocks[0], "recovered");
});

Deno.test("agent_end does not override authoritative assistant message_end state", () => {
  const tracker = createStreamTracker();
  const ctx = lineCtx(1, tracker);
  processPiJsonLine(assistantEnd("good", "stop"), ctx);
  sanitizePiRecord(
    {
      type: "agent_end",
      usage: { input: 999 },
      message: {
        role: "assistant",
        stopReason: "error",
        errorMessage: "401 hijack",
        content: [{ type: "text", text: "bad override" }],
      },
    },
    ctx,
  );
  assert.equal(tracker.lastErrorCategory, undefined);
  const outcome = finalizeStreamOutcome(tracker);
  assert.equal(outcome.streamError, undefined);
  assert.equal(outcome.finalTextBlocks[0], "good");
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
