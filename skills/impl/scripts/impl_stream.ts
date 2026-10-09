/** Pi JSON stream parsing for isolated implementation runs (privacy-preserving). */

export const SCHEMA_VERSION = 1;
export const MAX_JSONL_LINE_BYTES = 1_048_576;
/** While skipping an oversize line, allow streaming discard up to this many bytes before failing. */
export const MAX_OVERSIZE_LINE_DISCARD_BYTES = 32 * 1024 * 1024;

export const IMPL_STREAM_ERRORS = {
  oversize: "impl stream: oversize line",
  malformed: "impl stream: malformed json line",
  protocol: "impl stream: invalid protocol line",
  utf8: "impl stream: invalid utf-8 line",
  overflow: "impl stream: frame buffer overflow",
} as const;

const IMPL_SUCCESS_STOP = new Set(["stop"]);
const KNOWN_STOP_REASONS = new Set([
  "stop",
  "length",
  "error",
  "aborted",
  "pending",
  "toolUse",
  "deferred",
  "unknown",
]);

const USAGE_NUMERIC_KEYS = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "cacheWrite1h",
  "reasoning",
  "totalTokens",
] as const;

const CORE_USAGE_METRICS = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
] as const;

const COST_NUMERIC_KEYS = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "total",
] as const;

const PI_EVENT_TYPES = new Set([
  "message_start",
  "message_update",
  "message_end",
  "message_error",
  "agent_start",
  "agent_end",
  "agent_settled",
  "session_start",
  "session_end",
  "turn_start",
  "turn_end",
  "tool_execution_start",
  "tool_execution_end",
  "compaction_end",
  "auto_retry_start",
  "auto_retry_end",
  "summarization_retry_scheduled",
]);

const ALLOWED_TOOLS = new Set(["read", "bash", "edit", "write"]);

export type ExecutionStatus = "running" | "completed" | "failed" | "incomplete";

export type UsageCoverage = "complete" | "partial" | "unknown";

export type UsageMetric =
  | "input"
  | "output"
  | "cacheRead"
  | "cacheWrite"
  | "cacheWrite1h"
  | "reasoning"
  | "totalTokens"
  | "estimatedCostUsd";

export type UsageTotals = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
  reasoning?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  coverage: UsageCoverage;
  sources: string[];
  expectedSlices: number;
  knownSlices: Partial<Record<UsageMetric, number>>;
};

export type ToolCounts = Record<string, number>;

export type ImplStreamTracker = {
  assistantMessageEnded: boolean;
  lastAuthoritativeTextBlocks: string[] | undefined;
  lastAuthoritativeStopReason: string | undefined;
  agentSettled: boolean;
  agentSettledAborted: boolean;
  agentSettledAbortExplicit: boolean;
};

export type ImplStreamState = {
  tracker: ImplStreamTracker;
  usage: UsageTotals;
  assistantResponseCount: number;
  toolCalls: ToolCounts;
  toolErrors: ToolCounts;
  retryCount: number;
  compactionCount: number;
  streamParseError: string | undefined;
};

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

const readBool = (value: unknown) =>
  typeof value === "boolean" ? value : undefined;

const concatBytes = (a: Uint8Array, b: Uint8Array) => {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

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

export const findByteIndex = (buf: Uint8Array, byte: number) => {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === byte) return i;
  }
  return -1;
};

export function splitJsonlByteFrames(
  chunk: Uint8Array,
  carryIn: Uint8Array,
): {
  lines: Uint8Array[];
  remainder: Uint8Array;
  discardedOversizeLines: number;
} {
  let buf = concatBytes(carryIn, chunk);
  const lines: Uint8Array[] = [];
  let discardedOversizeLines = 0;
  while (buf.length > 0) {
    const nl = findByteIndex(buf, 0x0a);
    if (nl === -1) return { lines, remainder: buf, discardedOversizeLines };
    let end = nl;
    if (end > 0 && buf[end - 1] === 0x0d) end -= 1;
    const line = buf.subarray(0, end);
    buf = buf.subarray(nl + 1);
    if (line.length > MAX_JSONL_LINE_BYTES) {
      discardedOversizeLines += 1;
      continue;
    }
    lines.push(line);
  }
  return { lines, remainder: new Uint8Array(), discardedOversizeLines };
}

export function noteImplStreamError(
  state: ImplStreamState,
  message: string,
) {
  if (state.streamParseError === undefined) state.streamParseError = message;
}

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

export function normalizeStopReason(
  stopReason: string | undefined,
): string | undefined {
  if (stopReason === undefined) return undefined;
  return KNOWN_STOP_REASONS.has(stopReason) ? stopReason : "unknown";
}

const emptyUsage = (): UsageTotals => ({
  coverage: "unknown",
  sources: [],
  expectedSlices: 0,
  knownSlices: {},
});

export function createImplStreamState(): ImplStreamState {
  return {
    tracker: {
      assistantMessageEnded: false,
      lastAuthoritativeTextBlocks: undefined,
      lastAuthoritativeStopReason: undefined,
      agentSettled: false,
      agentSettledAborted: false,
      agentSettledAbortExplicit: false,
    },
    usage: emptyUsage(),
    assistantResponseCount: 0,
    toolCalls: {},
    toolErrors: {},
    retryCount: 0,
    compactionCount: 0,
    streamParseError: undefined,
  };
}

const bumpCount = (map: ToolCounts, key: string) => {
  map[key] = (map[key] ?? 0) + 1;
};

const mapToolName = (name: string | undefined) =>
  name !== undefined && ALLOWED_TOOLS.has(name) ? name : "unknown";

const readToolName = (record: Record<string, unknown>) => {
  const direct = readString(record.toolName);
  if (direct !== undefined) return mapToolName(direct);
  const tool = readRecord(record.tool);
  return mapToolName(tool ? readString(tool.name) : readString(record.name));
};

function extractFinalTextBlocks(message: Record<string, unknown>): string[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  const blocks: string[] = [];
  for (const block of content) {
    const record = readRecord(block);
    if (!record || readString(record.type) !== "text") continue;
    const text = readString(record.text);
    if (text !== undefined && text.length > 0) blocks.push(text);
  }
  return blocks;
}

const bumpKnownSlice = (usage: UsageTotals, metric: UsageMetric) => {
  usage.knownSlices[metric] = (usage.knownSlices[metric] ?? 0) + 1;
};

const addUsageCostTotal = (
  usage: UsageTotals,
  slice: Record<string, unknown>,
) => {
  const cost = slice.cost;
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) return;
  const total = readFiniteNonNeg((cost as Record<string, unknown>).total);
  if (total === undefined) return;
  const prev = usage.estimatedCostUsd ?? 0;
  const sum = prev + total;
  if (!Number.isFinite(sum)) {
    delete usage.estimatedCostUsd;
    delete usage.knownSlices.estimatedCostUsd;
    return;
  }
  usage.estimatedCostUsd = sum;
  bumpKnownSlice(usage, "estimatedCostUsd");
};

const recordUsageObservations = (
  usage: UsageTotals,
  slice: ReturnType<typeof extractNumericUsage>,
) => {
  if (!slice) return;
  for (const key of USAGE_NUMERIC_KEYS) {
    const num = readFiniteNonNeg(slice[key]);
    if (num === undefined) continue;
    bumpKnownSlice(usage, key);
  }
};

const addUsageNumber = (
  usage: UsageTotals,
  key: (typeof USAGE_NUMERIC_KEYS)[number],
  num: number,
) => {
  const prev = usage[key];
  const prevNum = typeof prev === "number" ? prev : 0;
  const sum = prevNum + num;
  if (!Number.isFinite(sum)) {
    delete usage[key];
    delete usage.knownSlices[key];
    return;
  }
  usage[key] = sum;
};

const addUsageSlice = (
  usage: UsageTotals,
  slice: ReturnType<typeof extractNumericUsage>,
  source: string,
) => {
  usage.expectedSlices += 1;
  if (!usage.sources.includes(source)) usage.sources.push(source);
  recordUsageObservations(usage, slice);
  if (!slice) {
    recomputeUsageCoverage(usage);
    return;
  }
  for (const key of USAGE_NUMERIC_KEYS) {
    const num = readFiniteNonNeg(slice[key]);
    if (num === undefined) continue;
    addUsageNumber(usage, key, num);
  }
  addUsageCostTotal(usage, slice);
  recomputeUsageCoverage(usage);
};

function recomputeUsageCoverage(usage: UsageTotals) {
  if (usage.expectedSlices === 0 || usage.sources.length === 0) {
    usage.coverage = "unknown";
    return;
  }
  const anyCoreObserved = CORE_USAGE_METRICS.some(
    (metric) => (usage.knownSlices[metric] ?? 0) > 0,
  );
  if (!anyCoreObserved) {
    usage.coverage = "unknown";
    return;
  }
  const completeCore = CORE_USAGE_METRICS.every((metric) =>
    usage.knownSlices[metric] === usage.expectedSlices
  );
  usage.coverage = completeCore ? "complete" : "partial";
}

function degradeUsageOnStreamError(usage: UsageTotals) {
  if (usage.expectedSlices === 0) {
    usage.coverage = "unknown";
    return;
  }
  const anyCoreObserved = CORE_USAGE_METRICS.some(
    (metric) => (usage.knownSlices[metric] ?? 0) > 0,
  );
  usage.coverage = anyCoreObserved ? "partial" : "unknown";
}

function invalidateTerminalFlags(tracker: ImplStreamTracker) {
  tracker.assistantMessageEnded = false;
  tracker.lastAuthoritativeTextBlocks = undefined;
  tracker.lastAuthoritativeStopReason = undefined;
  tracker.agentSettled = false;
  tracker.agentSettledAborted = false;
  tracker.agentSettledAbortExplicit = false;
}

function handleAssistantMessageEnd(
  state: ImplStreamState,
  message: Record<string, unknown>,
  record: Record<string, unknown>,
) {
  const tracker = state.tracker;
  tracker.assistantMessageEnded = true;
  tracker.lastAuthoritativeStopReason = readString(message.stopReason);
  const blocks = extractFinalTextBlocks(message);
  tracker.lastAuthoritativeTextBlocks = blocks;
  state.assistantResponseCount += 1;
  const usage = extractNumericUsage(message.usage) ??
    extractNumericUsage(record.usage);
  addUsageSlice(state.usage, usage, "assistant_message_end");
}

function handleCompactionEnd(
  state: ImplStreamState,
  record: Record<string, unknown>,
) {
  state.compactionCount += 1;
  const result = readRecord(record.result);
  const usage = result ? extractNumericUsage(result.usage) : undefined;
  addUsageSlice(state.usage, usage, "compaction_end");
}

function handleToolExecutionEnd(
  state: ImplStreamState,
  record: Record<string, unknown>,
) {
  const name = readToolName(record);
  bumpCount(state.toolCalls, name);
  if (readBool(record.isError) === true) bumpCount(state.toolErrors, name);
}

function handleStreamRestart(
  state: ImplStreamState,
  eventType: string,
  record: Record<string, unknown>,
) {
  if (eventType === "agent_start") {
    invalidateTerminalFlags(state.tracker);
    return;
  }
  if (eventType !== "message_start") return;
  const message = readRecord(record.message);
  if (message && readString(message.role) === "assistant") {
    invalidateTerminalFlags(state.tracker);
  }
}

function applyPiEvent(state: ImplStreamState, record: Record<string, unknown>) {
  const eventType = readString(record.type);
  if (!eventType) return;
  handleStreamRestart(state, eventType, record);
  if (eventType === "auto_retry_start") {
    state.retryCount += 1;
    return;
  }
  if (eventType === "agent_settled") {
    state.tracker.agentSettled = true;
    const aborted = readBool(record.aborted);
    if (aborted !== undefined) {
      state.tracker.agentSettledAbortExplicit = true;
      state.tracker.agentSettledAborted = aborted;
    }
    return;
  }
  if (eventType === "compaction_end") {
    handleCompactionEnd(state, record);
    return;
  }
  if (eventType === "tool_execution_end") {
    handleToolExecutionEnd(state, record);
    return;
  }
  const message = readRecord(record.message);
  if (
    eventType === "message_end" && message &&
    readString(message.role) === "assistant"
  ) {
    handleAssistantMessageEnd(state, message, record);
  }
}

const lineByteLength = (line: string) => new TextEncoder().encode(line).length;

export function processImplJsonLine(
  line: string,
  state: ImplStreamState,
): { oversize?: boolean; parseError?: boolean } {
  if (lineByteLength(line) > MAX_JSONL_LINE_BYTES) {
    noteImplStreamError(state, IMPL_STREAM_ERRORS.oversize);
    return { oversize: true };
  }
  let parsed: unknown;
  try {
    const trimmed = line.trim();
    if (trimmed.length === 0) return {};
    parsed = JSON.parse(trimmed);
  } catch {
    noteImplStreamError(state, IMPL_STREAM_ERRORS.malformed);
    return { parseError: true };
  }
  const record = readRecord(parsed);
  if (!record) {
    noteImplStreamError(state, IMPL_STREAM_ERRORS.protocol);
    return { parseError: true };
  }
  applyPiEvent(state, record);
  return {};
}

function appendMessageLogFields(
  out: Record<string, unknown>,
  message: Record<string, unknown>,
) {
  const stop = normalizeStopReason(readString(message.stopReason));
  if (stop !== undefined) out.stopReason = stop;
  const usage = extractNumericUsage(message.usage);
  if (usage) out.usage = usage;
}

function appendToolLogFields(
  out: Record<string, unknown>,
  record: Record<string, unknown>,
) {
  out.toolName = readToolName(record);
  if (readBool(record.isError) === true) out.toolError = true;
  const dur = readFiniteNonNeg(record.durationMs);
  if (dur !== undefined) out.toolDurationMs = dur;
}

export function sanitizeImplEventForLog(
  raw: unknown,
  elapsedMs: number,
): Record<string, unknown> | undefined {
  const record = readRecord(raw);
  if (!record) return undefined;
  const eventType = readString(record.type);
  if (!eventType || !PI_EVENT_TYPES.has(eventType)) return undefined;
  const out: Record<string, unknown> = {
    kind: "pi_event",
    eventType,
    elapsedMs: Math.max(0, elapsedMs),
  };
  const message = readRecord(record.message);
  if (message) appendMessageLogFields(out, message);
  if (eventType === "tool_execution_end") appendToolLogFields(out, record);
  if (eventType === "agent_settled" && readBool(record.aborted) === true) {
    out.aborted = true;
  }
  return out;
}

export type FinalizeOutcome = {
  finalTextBlocks: string[];
  streamError: string | undefined;
  executionStatus: ExecutionStatus;
  stopReason: string | undefined;
};

const incompleteOutcome = (
  stopReason: string | undefined,
  message: string,
): FinalizeOutcome => ({
  finalTextBlocks: [],
  streamError: message,
  executionStatus: "incomplete",
  stopReason: normalizeStopReason(stopReason),
});

function finalizeStopReason(
  stopReason: string | undefined,
): FinalizeOutcome | undefined {
  const normalized = normalizeStopReason(stopReason);
  if (normalized === undefined || !IMPL_SUCCESS_STOP.has(normalized)) {
    const failed = normalized === "error" || normalized === "aborted";
    return {
      finalTextBlocks: [],
      streamError: failed
        ? "impl stream: assistant response failed"
        : "impl stream: incomplete assistant response",
      executionStatus: failed ? "failed" : "incomplete",
      stopReason: normalized,
    };
  }
  return undefined;
}

export function finalizeImplStream(state: ImplStreamState): FinalizeOutcome {
  const tracker = state.tracker;
  const stopReason = normalizeStopReason(tracker.lastAuthoritativeStopReason);
  if (state.streamParseError !== undefined) {
    degradeUsageOnStreamError(state.usage);
    return {
      finalTextBlocks: [],
      streamError: state.streamParseError,
      executionStatus: "failed",
      stopReason,
    };
  }
  if (
    !tracker.agentSettled || !tracker.agentSettledAbortExplicit ||
    tracker.agentSettledAborted
  ) {
    return {
      finalTextBlocks: [],
      streamError: "impl stream: agent not settled",
      executionStatus: tracker.agentSettledAborted ? "failed" : "incomplete",
      stopReason,
    };
  }
  if (!tracker.assistantMessageEnded) {
    return incompleteOutcome(
      stopReason,
      "impl stream: incomplete assistant response",
    );
  }
  const stopOutcome = finalizeStopReason(stopReason);
  if (stopOutcome) return stopOutcome;
  const blocks = tracker.lastAuthoritativeTextBlocks ?? [];
  return {
    finalTextBlocks: blocks,
    streamError: undefined,
    executionStatus: "completed",
    stopReason,
  };
}

export function resolveImplExitCode(
  streamError: string | undefined,
  executionStatus: ExecutionStatus,
  childCode: number | null,
  childSignal: string | null,
): number {
  if (childCode !== null && childCode !== 0) return childCode;
  if (streamError !== undefined || executionStatus !== "completed") return 1;
  if (childSignal !== null) return 128;
  return 0;
}

export function formatFinalStdout(blocks: string[]): Uint8Array {
  let out = "";
  for (const block of blocks) out += `${block}\n`;
  return new TextEncoder().encode(out);
}

export function decodeJsonlLine(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
