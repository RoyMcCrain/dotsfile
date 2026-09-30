/**
 * Privacy-preserving Pi JSON stream helper for parallel-review diagnostics.
 * EOF: a trailing line without LF is parsed once if valid JSON; otherwise fails.
 */

const SUCCESS_STOP_REASONS = new Set(["stop", "length"]);

const KNOWN_STOP_REASONS = new Set([
  "stop",
  "length",
  "error",
  "aborted",
  "pending",
  "toolUse",
]);

const USAGE_NUMERIC_KEYS = new Set([
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "cacheWrite1h",
  "reasoning",
  "totalTokens",
]);

const COST_NUMERIC_KEYS = new Set([
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "total",
]);

const PI_EVENT_TYPES = new Set([
  "message_start",
  "message_update",
  "message_end",
  "message_error",
  "agent_start",
  "agent_end",
  "session_start",
  "session_end",
  "session",
  "turn_start",
  "turn_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
]);

const MESSAGE_ROLES = new Set([
  "assistant",
  "user",
  "system",
  "tool",
  "toolResult",
]);

const ASSISTANT_MESSAGE_EVENT_TYPES = new Set([
  "thinking_start",
  "thinking_delta",
  "thinking_end",
  "text_start",
  "text_delta",
  "text_end",
  "toolcall_start",
  "toolcall_delta",
  "toolcall_end",
]);

export type StreamCategory =
  | "no_assistant_start"
  | "assistant_stream_start"
  | "thinking_started"
  | "text_started"
  | "completion";

export type SanitizedPiEvent = {
  kind: "pi_event";
  attempt: number;
  timestampMs: number;
  elapsedMs: number;
  eventType: string;
  streamCategory: StreamCategory;
  role?: string;
  assistantMessageEventType?: string;
  deltaChars?: number;
  stopReason?: string;
  usage?: Record<string, number | Record<string, number>>;
};

export type ParseOutcome = {
  finalTextBlocks: string[];
  streamError: string | undefined;
};

export type StreamTracker = {
  category: StreamCategory;
  lastAuthoritativeTextBlocks: string[] | undefined;
  lastAuthoritativeStopReason: string | undefined;
  assistantMessageEnded: boolean;
};

export type SanitizeContext = {
  attempt: number;
  attemptStartMs: number;
  tracker: StreamTracker;
};

export function createStreamTracker(): StreamTracker {
  return {
    category: "no_assistant_start",
    lastAuthoritativeTextBlocks: undefined,
    lastAuthoritativeStopReason: undefined,
    assistantMessageEnded: false,
  };
}

const readFiniteNonNeg = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const readString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const readRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const mapEnum = (value: string | undefined, allowed: Set<string>) => {
  if (value === undefined) return undefined;
  return allowed.has(value) ? value : "unknown";
};

const mapStopReason = (raw: string | undefined) => {
  if (raw === undefined) return undefined;
  return KNOWN_STOP_REASONS.has(raw) ? raw : "unknown";
};

function extractCost(value: unknown): Record<string, number> | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const out: Record<string, number> = {};
  for (const key of COST_NUMERIC_KEYS) {
    const num = readFiniteNonNeg(record[key]);
    if (num !== undefined) out[key] = num;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function extractNumericUsage(
  value: unknown,
): Record<string, number | Record<string, number>> | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const out: Record<string, number | Record<string, number>> = {};
  for (const key of USAGE_NUMERIC_KEYS) {
    const num = readFiniteNonNeg(record[key]);
    if (num !== undefined) out[key] = num;
  }
  const cost = extractCost(record.cost);
  if (cost) out.cost = cost;
  return Object.keys(out).length > 0 ? out : undefined;
}

const resetAuthoritativeFinal = (tracker: StreamTracker) => {
  tracker.assistantMessageEnded = false;
  tracker.lastAuthoritativeTextBlocks = undefined;
  tracker.lastAuthoritativeStopReason = undefined;
};

function extractFinalTextBlocks(message: Record<string, unknown>): string[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  const blocks: string[] = [];
  for (const block of content) {
    const record = readRecord(block);
    if (!record || readString(record.type) !== "text") continue;
    const text = readString(record.text);
    if (text !== undefined) blocks.push(text);
  }
  return blocks;
}

function advanceCategory(ctx: {
  tracker: StreamTracker;
  rawEventType: string;
  rawRole: string | undefined;
  rawAssistantType: string | undefined;
}): StreamCategory {
  const { tracker, rawEventType, rawRole, rawAssistantType } = ctx;
  if (rawEventType === "message_start" && rawRole === "assistant") {
    resetAuthoritativeFinal(tracker);
    tracker.category = "assistant_stream_start";
    return tracker.category;
  }
  if (
    rawEventType === "message_update" && rawAssistantType === "thinking_delta"
  ) {
    if (
      tracker.category !== "thinking_started" &&
      tracker.category !== "text_started" &&
      tracker.category !== "completion"
    ) {
      tracker.category = "thinking_started";
    }
    return tracker.category;
  }
  if (rawEventType === "message_update" && rawAssistantType === "text_delta") {
    if (
      tracker.category !== "text_started" && tracker.category !== "completion"
    ) {
      tracker.category = "text_started";
    }
    return tracker.category;
  }
  if (rawEventType === "message_end" && rawRole === "assistant") {
    tracker.category = "completion";
    return tracker.category;
  }
  return tracker.category;
}

export function sanitizePiRecord(
  raw: unknown,
  ctx: SanitizeContext,
): SanitizedPiEvent | undefined {
  const record = readRecord(raw);
  if (!record) return undefined;
  const rawEventType = readString(record.type);
  if (!rawEventType) return undefined;

  const message = readRecord(record.message);
  const rawRole = message ? readString(message.role) : readString(record.role);
  const assistantMessageEvent = readRecord(record.assistantMessageEvent);
  const rawAssistantType = assistantMessageEvent
    ? readString(assistantMessageEvent.type)
    : undefined;
  const delta = assistantMessageEvent
    ? readString(assistantMessageEvent.delta)
    : undefined;

  const category = advanceCategory({
    tracker: ctx.tracker,
    rawEventType,
    rawRole,
    rawAssistantType,
  });

  let stopReason: string | undefined;
  let usage: ReturnType<typeof extractNumericUsage>;
  if (message) {
    const rawStop = readString(message.stopReason);
    stopReason = mapStopReason(rawStop);
    if (rawEventType === "message_end" && rawRole === "assistant") {
      ctx.tracker.assistantMessageEnded = true;
      ctx.tracker.lastAuthoritativeStopReason = rawStop;
      const blocks = extractFinalTextBlocks(message);
      ctx.tracker.lastAuthoritativeTextBlocks = blocks.length > 0
        ? blocks
        : undefined;
      usage = extractNumericUsage(message.usage) ??
        extractNumericUsage(record.usage);
    }
  }

  const now = Date.now();
  const role = mapEnum(rawRole, MESSAGE_ROLES);
  const assistantMessageEventType = mapEnum(
    rawAssistantType,
    ASSISTANT_MESSAGE_EVENT_TYPES,
  );
  const deltaChars = delta !== undefined ? delta.length : undefined;
  const base: SanitizedPiEvent = {
    kind: "pi_event",
    attempt: ctx.attempt,
    timestampMs: now,
    elapsedMs: Math.max(0, now - ctx.attemptStartMs),
    eventType: mapEnum(rawEventType, PI_EVENT_TYPES)!,
    streamCategory: category,
  };
  if (role !== undefined) base.role = role;
  if (assistantMessageEventType !== undefined) {
    base.assistantMessageEventType = assistantMessageEventType;
  }
  if (deltaChars !== undefined) base.deltaChars = deltaChars;
  if (stopReason !== undefined) base.stopReason = stopReason;
  if (usage !== undefined) base.usage = usage;
  return base;
}

export function splitJsonlLines(
  buffer: string,
): { lines: string[]; remainder: string } {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer.charCodeAt(i) !== 0x0a) continue;
    let end = i;
    if (end > start && buffer.charCodeAt(end - 1) === 0x0d) end -= 1;
    lines.push(buffer.slice(start, end));
    start = i + 1;
  }
  return { lines, remainder: buffer.slice(start) };
}

export function parseJsonlLine(line: string): unknown {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;
  return JSON.parse(trimmed);
}

export function processPiJsonLine(
  line: string,
  ctx: SanitizeContext,
): { event?: SanitizedPiEvent; error?: string } {
  let parsed: unknown;
  try {
    parsed = parseJsonlLine(line);
  } catch {
    return { error: "pi review stream: malformed event line" };
  }
  if (parsed === undefined) return {};
  const event = sanitizePiRecord(parsed, ctx);
  return { event };
}

export function finalizeStreamOutcome(tracker: StreamTracker): ParseOutcome {
  const stopReason = tracker.lastAuthoritativeStopReason;
  if (!tracker.assistantMessageEnded) {
    return {
      finalTextBlocks: [],
      streamError: "pi review stream: incomplete assistant response",
    };
  }
  if (stopReason === undefined || !SUCCESS_STOP_REASONS.has(stopReason)) {
    const failed = stopReason !== undefined &&
      !SUCCESS_STOP_REASONS.has(stopReason);
    return {
      finalTextBlocks: [],
      streamError: failed
        ? "pi review stream: assistant response failed"
        : "pi review stream: incomplete assistant response",
    };
  }
  const blocks = tracker.lastAuthoritativeTextBlocks;
  if (!blocks || blocks.length === 0) {
    return {
      finalTextBlocks: [],
      streamError: "pi review stream: incomplete assistant response",
    };
  }
  return { finalTextBlocks: blocks, streamError: undefined };
}

export function resolveWrapperExitCode(
  streamError: string | undefined,
  childCode: number | null,
  childSignal: string | null,
): number {
  if (childCode !== null && childCode !== 0) return childCode;
  if (streamError !== undefined) return 1;
  if (childSignal !== null) return 128;
  return 0;
}

export function formatFinalStdout(blocks: string[]): Uint8Array {
  let out = "";
  for (const block of blocks) out += `${block}\n`;
  return new TextEncoder().encode(out);
}

async function writeAll(
  writer: { write(p: Uint8Array): Promise<number> },
  bytes: Uint8Array,
): Promise<boolean> {
  let offset = 0;
  while (offset < bytes.length) {
    const written = await writer.write(bytes.subarray(offset));
    if (written <= 0) return false;
    offset += written;
  }
  return true;
}

async function appendLogLine(
  file: Deno.FsFile,
  event: SanitizedPiEvent | Record<string, unknown>,
): Promise<boolean> {
  const bytes = new TextEncoder().encode(`${JSON.stringify(event)}\n`);
  try {
    return await writeAll(file, bytes);
  } catch {
    return false;
  }
}

function parseCliArgs(args: string[]): {
  eventsLog: string;
  attempt: number;
  command: string[];
} {
  let eventsLog = "";
  let attempt = 1;
  const command: string[] = [];
  let i = 0;
  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      i++;
      break;
    }
    if (arg === "--events-log") {
      eventsLog = args[++i] ?? "";
      continue;
    }
    if (arg === "--attempt") {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid --attempt");
      }
      attempt = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  for (; i < args.length; i++) command.push(args[i]);
  if (!eventsLog || command.length === 0) {
    throw new Error(
      "usage: pi_review_events.ts --events-log PATH --attempt N -- COMMAND...",
    );
  }
  return { eventsLog, attempt, command };
}

export async function runPiReviewEventsHelper(options: {
  eventsLog: string;
  attempt: number;
  command: string[];
}): Promise<number> {
  const attemptStartMs = Date.now();
  const tracker = createStreamTracker();
  let file: Deno.FsFile;
  try {
    file = await Deno.open(options.eventsLog, { write: true, append: true });
  } catch {
    console.error("pi review events: failed to open events log");
    return 1;
  }

  let logFailed = false;
  const lineCtx: SanitizeContext = {
    attempt: options.attempt,
    attemptStartMs,
    tracker,
  };

  const [bin, ...piArgs] = options.command;
  const proc = new Deno.Command(bin, {
    args: piArgs,
    stdin: "null",
    stdout: "piped",
    stderr: "inherit",
  }).spawn();

  const decoder = new TextDecoder();
  let carry = "";
  let streamError: string | undefined;

  const handleLine = async (line: string) => {
    if (streamError !== undefined) return;
    const result = processPiJsonLine(line, lineCtx);
    if (result.error) {
      streamError = result.error;
      return;
    }
    if (result.event && !logFailed) {
      const ok = await appendLogLine(file, result.event);
      if (!ok) {
        logFailed = true;
        streamError = "pi review events: failed to write events log";
      }
    }
  };

  try {
    const reader = proc.stdout.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      const split = splitJsonlLines(carry);
      carry = split.remainder;
      for (const line of split.lines) await handleLine(line);
    }
    carry += decoder.decode();
    if (carry.length > 0) {
      await handleLine(carry);
      carry = "";
    }
  } catch {
    console.error("pi review stream: failed while reading assistant output");
    streamError = streamError ??
      "pi review stream: failed while reading assistant output";
  }

  file.close();

  const status = await proc.status;
  const outcome = finalizeStreamOutcome(tracker);

  if (logFailed && streamError === undefined) {
    streamError = "pi review events: failed to write events log";
  }

  const err = streamError ?? outcome.streamError;
  if (status.code !== null && status.code !== 0) {
    if (err !== undefined) console.error(err);
    return status.code;
  }
  if (err !== undefined) {
    console.error(err);
    return resolveWrapperExitCode(err, status.code, status.signal);
  }
  const stdoutOk = await writeAll(
    Deno.stdout,
    formatFinalStdout(
      outcome.finalTextBlocks,
    ),
  );
  if (!stdoutOk) {
    console.error("pi review stream: failed while writing review output");
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs(Deno.args);
  } catch {
    console.error("pi review events: invalid command line");
    Deno.exit(1);
  }
  Deno.exit(await runPiReviewEventsHelper(parsed));
}

if (import.meta.main) {
  await main().catch(() => {
    console.error("pi review events: internal failure");
    Deno.exit(1);
  });
}
