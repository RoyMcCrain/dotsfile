import { join } from "node:path";
import {
  createImplStreamState,
  decodeJsonlLine,
  type ExecutionStatus,
  finalizeImplStream,
  findByteIndex,
  formatFinalStdout,
  IMPL_STREAM_ERRORS,
  MAX_JSONL_LINE_BYTES,
  MAX_OVERSIZE_LINE_DISCARD_BYTES,
  noteImplStreamError,
  processImplJsonLine,
  resolveImplExitCode,
  sanitizeImplEventForLog,
  SCHEMA_VERSION,
  splitJsonlByteFrames,
  type UsageTotals,
} from "./impl_stream.ts";

export type ParentValidationStatus =
  | "unverified"
  | "passed"
  | "failed"
  | "not-run";

export type CodeProvenance = {
  repositoryPath: string;
  startRevision?: string;
  revisionKind: "jj" | "git" | "unknown";
  comparable: boolean;
};

export type RunMetadata = {
  schemaVersion: typeof SCHEMA_VERSION;
  runId: string;
  role: string;
  resolvedModel: string;
  startedAt: string;
  finishedAt?: string;
  elapsedMs?: number;
  exitCode?: number;
  executionStatus: ExecutionStatus;
  stopReason?: string;
  promptSha256: string;
  systemPromptSha256: string;
  codeProvenance: CodeProvenance;
  usage: UsageTotals;
  assistantResponseCount: number;
  toolCalls: Record<string, number>;
  toolErrors: Record<string, number>;
  retryCount: number;
  compactionCount: number;
  parentValidationStatus: ParentValidationStatus;
};

const HEX_HASH = /^[0-9a-f]{64}$/i;
const FULL_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

async function sha256File(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function runCommand(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string }> {
  try {
    const proc = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      cwd,
      stdout: "piped",
      stderr: "null",
      stdin: "null",
      env: env ? { ...Deno.env.toObject(), ...env } : undefined,
    });
    const out = await proc.output();
    return {
      code: out.code ?? 1,
      stdout: new TextDecoder().decode(out.stdout).trim(),
    };
  } catch {
    return { code: 1, stdout: "" };
  }
}

const validRevision = (value: string) => FULL_REVISION.test(value);

export async function resolveCodeProvenance(
  repositoryPath: string,
): Promise<CodeProvenance> {
  const base: CodeProvenance = {
    repositoryPath,
    revisionKind: "unknown",
    comparable: false,
  };
  try {
    const jj = await runCommand(
      [
        "jj",
        "log",
        "-r",
        "@",
        "-T",
        "commit_id",
        "--no-graph",
      ],
      repositoryPath,
      { JJ_EDITOR: "true" },
    );
    const jjId = jj.stdout.split(/\s+/)[0] ?? "";
    if (jj.code === 0 && jjId.length > 0 && validRevision(jjId)) {
      base.revisionKind = "jj";
      base.startRevision = jjId.toLowerCase();
      base.comparable = true;
      return base;
    }
    const gitDir = await runCommand(
      ["git", "rev-parse", "--git-dir"],
      repositoryPath,
    );
    if (gitDir.code !== 0) return base;
    const head = await runCommand(["git", "rev-parse", "HEAD"], repositoryPath);
    if (head.code !== 0 || !validRevision(head.stdout)) return base;
    base.revisionKind = "git";
    base.startRevision = head.stdout.toLowerCase();
    const dirty = await runCommand(
      ["git", "status", "--porcelain"],
      repositoryPath,
    );
    base.comparable = dirty.code === 0 && dirty.stdout.length === 0;
  } catch {
    /* safe unknown provenance */
  }
  return base;
}

export async function prepareRunDirectory(
  runsRoot: string,
): Promise<{ runDir: string; runId: string }> {
  await Deno.mkdir(runsRoot, { recursive: true, mode: 0o700 });
  const runId = crypto.randomUUID();
  const runDir = await Deno.makeTempDir({ dir: runsRoot, prefix: `${runId}-` });
  await Deno.chmod(runDir, 0o700);
  return { runDir, runId };
}

async function writeJsonAtomic(path: string, value: unknown) {
  const tmp = `${path}.tmp`;
  await Deno.writeTextFile(tmp, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await Deno.rename(tmp, path);
  await Deno.chmod(path, 0o600);
}

async function ensureEmptyEventsFile(eventsPath: string) {
  await Deno.writeTextFile(eventsPath, "", { mode: 0o600 });
  await Deno.chmod(eventsPath, 0o600);
}

async function appendEventLine(
  eventsPath: string,
  event: Record<string, unknown>,
) {
  const line = `${JSON.stringify(event)}\n`;
  await Deno.writeTextFile(eventsPath, line, { append: true, mode: 0o600 });
}

export type RunImplEventsOptions = {
  runsRoot: string;
  role: string;
  resolvedModel: string;
  promptPath: string;
  systemPromptPath: string;
  repositoryPath: string;
  command: string[];
};

const elapsedSince = (started: number) =>
  Math.max(0, Math.round(performance.now() - started));

async function logSanitizedLine(
  line: string,
  state: ReturnType<typeof createImplStreamState>,
  eventsPath: string,
  startedMono: number,
) {
  const lineResult = processImplJsonLine(line, state);
  if (lineResult.oversize || lineResult.parseError) return;
  const elapsedMs = elapsedSince(startedMono);
  let parsed: unknown;
  try {
    parsed = line.trim().length > 0 ? JSON.parse(line.trim()) : undefined;
  } catch {
    return;
  }
  const sanitized = sanitizeImplEventForLog(parsed, elapsedMs);
  if (sanitized) await appendEventLine(eventsPath, sanitized);
}

type StdoutDrainCtx = {
  carry: Uint8Array;
  discardingOversize: boolean;
  discardedWithoutNl: number;
};

async function processJsonlFrames(
  frames: Uint8Array[],
  state: ReturnType<typeof createImplStreamState>,
  eventsPath: string,
  startedMono: number,
) {
  for (const frame of frames) {
    try {
      const line = decodeJsonlLine(frame);
      await logSanitizedLine(line, state, eventsPath, startedMono);
    } catch {
      noteImplStreamError(state, IMPL_STREAM_ERRORS.utf8);
    }
  }
}

async function advanceOversizeDiscard(
  proc: Deno.ChildProcess,
  state: ReturnType<typeof createImplStreamState>,
  chunk: Uint8Array,
  ctx: StdoutDrainCtx,
): Promise<Uint8Array | undefined> {
  const nlAt = findByteIndex(chunk, 0x0a);
  if (nlAt === -1) {
    ctx.discardedWithoutNl += chunk.length;
    if (ctx.discardedWithoutNl > MAX_OVERSIZE_LINE_DISCARD_BYTES) {
      noteImplStreamError(state, IMPL_STREAM_ERRORS.overflow);
      await terminateOwnedChild(proc);
    }
    return undefined;
  }
  ctx.discardedWithoutNl = 0;
  ctx.discardingOversize = false;
  const rest = chunk.subarray(nlAt + 1);
  return rest.length > 0 ? new Uint8Array(rest) : new Uint8Array();
}

function applySplitToDrainCtx(
  split: ReturnType<typeof splitJsonlByteFrames>,
  state: ReturnType<typeof createImplStreamState>,
  ctx: StdoutDrainCtx,
) {
  ctx.carry = new Uint8Array(split.remainder);
  if (split.discardedOversizeLines > 0) {
    noteImplStreamError(state, IMPL_STREAM_ERRORS.oversize);
  }
  if (ctx.carry.length > MAX_JSONL_LINE_BYTES) {
    noteImplStreamError(state, IMPL_STREAM_ERRORS.oversize);
    ctx.discardingOversize = true;
    ctx.discardedWithoutNl = ctx.carry.length;
    ctx.carry = new Uint8Array();
  }
}

async function finalizePiStdoutCarry(
  ctx: StdoutDrainCtx,
  state: ReturnType<typeof createImplStreamState>,
  eventsPath: string,
  startedMono: number,
) {
  if (ctx.discardingOversize) {
    noteImplStreamError(state, IMPL_STREAM_ERRORS.oversize);
    return;
  }
  if (ctx.carry.length === 0) return;
  try {
    const line = decodeJsonlLine(ctx.carry);
    await logSanitizedLine(line, state, eventsPath, startedMono);
  } catch {
    noteImplStreamError(state, IMPL_STREAM_ERRORS.utf8);
  }
}

async function terminateOwnedChild(proc: Deno.ChildProcess) {
  try {
    proc.kill("SIGTERM");
  } catch { /* already exited */ }
  try {
    await proc.status;
  } catch { /* ignore */ }
}

async function drainPiStdout(
  proc: Deno.ChildProcess,
  state: ReturnType<typeof createImplStreamState>,
  eventsPath: string,
  startedMono: number,
) {
  const ctx: StdoutDrainCtx = {
    carry: new Uint8Array(),
    discardingOversize: false,
    discardedWithoutNl: 0,
  };
  const reader = proc.stdout.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    let chunk: Uint8Array = value;
    if (ctx.discardingOversize) {
      const next = await advanceOversizeDiscard(proc, state, chunk, ctx);
      if (!next) continue;
      chunk = next;
    }
    const split = splitJsonlByteFrames(chunk, ctx.carry);
    applySplitToDrainCtx(split, state, ctx);
    await processJsonlFrames(split.lines, state, eventsPath, startedMono);
  }
  await finalizePiStdoutCarry(ctx, state, eventsPath, startedMono);
}

function buildInitialMetadata(
  ctx: {
    runId: string;
    role: string;
    resolvedModel: string;
    startedWallMs: number;
    promptSha256: string;
    systemPromptSha256: string;
    codeProvenance: CodeProvenance;
  },
): RunMetadata {
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: ctx.runId,
    role: ctx.role,
    resolvedModel: ctx.resolvedModel,
    startedAt: new Date(ctx.startedWallMs).toISOString(),
    executionStatus: "running",
    promptSha256: ctx.promptSha256,
    systemPromptSha256: ctx.systemPromptSha256,
    codeProvenance: ctx.codeProvenance,
    usage: {
      coverage: "unknown",
      sources: [],
      expectedSlices: 0,
      knownSlices: {},
    },
    assistantResponseCount: 0,
    toolCalls: {},
    toolErrors: {},
    retryCount: 0,
    compactionCount: 0,
    parentValidationStatus: "unverified",
  };
}

async function finishRun(
  ctx: {
    metadataPath: string;
    startedMono: number;
    startedWallMs: number;
    state: ReturnType<typeof createImplStreamState>;
    initial: RunMetadata;
    proc: Deno.ChildProcess;
  },
): Promise<number> {
  const status = await ctx.proc.status;
  const childCode = status.code;
  const outcome = finalizeImplStream(ctx.state);
  const streamError = outcome.streamError;
  const exitCode = resolveImplExitCode(
    streamError,
    outcome.executionStatus,
    childCode,
    status.signal,
  );
  await finalizeMetadata({
    metadataPath: ctx.metadataPath,
    startedMono: ctx.startedMono,
    startedWallMs: ctx.startedWallMs,
    state: ctx.state,
    childCode: childCode ?? exitCode,
    streamError,
    initial: ctx.initial,
    outcome,
  });
  if (exitCode !== 0) {
    if (streamError) console.error(streamError);
    return exitCode;
  }
  const stdoutOk = await writeAll(
    Deno.stdout,
    formatFinalStdout(outcome.finalTextBlocks),
  );
  if (!stdoutOk) {
    console.error("impl stream: failed while writing stdout");
    return 1;
  }
  return 0;
}

export async function runImplEventsHelper(
  options: RunImplEventsOptions,
): Promise<number> {
  const startedWallMs = Date.now();
  const startedMono = performance.now();
  let runDir = "";
  let runId = "";
  let metadataPath = "";
  let eventsPath = "";
  let initial: RunMetadata | undefined;
  let proc: Deno.ChildProcess | undefined;

  try {
    const prep = await prepareRunDirectory(options.runsRoot);
    runDir = prep.runDir;
    runId = prep.runId;
    metadataPath = join(runDir, "metadata.json");
    eventsPath = join(runDir, "events.jsonl");

    console.error(`run_impl.sh: run log directory: ${runDir}`);

    const [promptSha256, systemPromptSha256, codeProvenance] = await Promise
      .all([
        sha256File(options.promptPath),
        sha256File(options.systemPromptPath),
        resolveCodeProvenance(options.repositoryPath),
      ]);

    if (!HEX_HASH.test(promptSha256) || !HEX_HASH.test(systemPromptSha256)) {
      console.error("impl events: invalid prompt hash");
      return 1;
    }

    initial = buildInitialMetadata({
      runId,
      role: options.role,
      resolvedModel: options.resolvedModel,
      startedWallMs,
      promptSha256,
      systemPromptSha256,
      codeProvenance,
    });
    await writeJsonAtomic(metadataPath, initial);
    await ensureEmptyEventsFile(eventsPath);

    const state = createImplStreamState();
    const [bin, ...piArgs] = options.command;
    try {
      proc = new Deno.Command(bin, {
        args: piArgs,
        stdin: "null",
        stdout: "piped",
        stderr: "inherit",
      }).spawn();
    } catch {
      console.error("impl events: failed to spawn pi");
      await finalizeMetadata({
        metadataPath,
        startedMono,
        startedWallMs,
        state,
        childCode: 1,
        streamError: "impl events: spawn failed",
        initial,
      });
      return 1;
    }

    await drainPiStdout(proc, state, eventsPath, startedMono);
    return await finishRun({
      metadataPath,
      startedMono,
      startedWallMs,
      state,
      initial,
      proc,
    });
  } catch (err) {
    console.error("impl events: internal failure");
    if (err instanceof Deno.errors.NotCapable) {
      console.error("impl events: permission denied");
    }
    if (proc) await terminateOwnedChild(proc);
    if (metadataPath && initial) {
      try {
        await finalizeMetadata({
          metadataPath,
          startedMono,
          startedWallMs,
          state: createImplStreamState(),
          childCode: 1,
          streamError: "impl events: internal failure",
          initial,
        });
      } catch { /* best effort */ }
    }
    return 1;
  }
}

type FinalizeParams = {
  metadataPath: string;
  startedMono: number;
  startedWallMs: number;
  state: ReturnType<typeof createImplStreamState>;
  childCode: number;
  streamError: string | undefined;
  initial: RunMetadata;
  outcome?: ReturnType<typeof finalizeImplStream>;
};

async function finalizeMetadata(params: FinalizeParams) {
  const finishedWallMs = Date.now();
  const outcome = params.outcome ?? finalizeImplStream(params.state);
  let executionStatus = outcome.executionStatus;
  if (params.childCode !== 0) executionStatus = "failed";
  else if (params.streamError && executionStatus === "completed") {
    executionStatus = "failed";
  }
  const meta: RunMetadata = {
    ...params.initial,
    finishedAt: new Date(finishedWallMs).toISOString(),
    elapsedMs: elapsedSince(params.startedMono),
    exitCode: params.childCode,
    executionStatus,
    stopReason: outcome.stopReason,
    usage: params.state.usage,
    assistantResponseCount: params.state.assistantResponseCount,
    toolCalls: params.state.toolCalls,
    toolErrors: params.state.toolErrors,
    retryCount: params.state.retryCount,
    compactionCount: params.state.compactionCount,
    parentValidationStatus: "unverified",
  };
  await writeJsonAtomic(params.metadataPath, meta);
}

async function writeAll(
  writer: { write(p: Uint8Array): Promise<number | null> },
  bytes: Uint8Array,
): Promise<boolean> {
  let offset = 0;
  while (offset < bytes.length) {
    const written = await writer.write(bytes.subarray(offset));
    if (written === null || written <= 0) return false;
    offset += written;
  }
  return true;
}

const CLI_OPTION_KEYS: Record<string, keyof RunImplEventsOptions> = {
  "--runs-root": "runsRoot",
  "--role": "role",
  "--model": "resolvedModel",
  "--prompt-path": "promptPath",
  "--system-prompt-path": "systemPromptPath",
  "--repository-path": "repositoryPath",
};

function missingRequiredOptions(options: RunImplEventsOptions): boolean {
  const paths = [
    options.runsRoot,
    options.role,
    options.resolvedModel,
    options.promptPath,
    options.systemPromptPath,
    options.repositoryPath,
  ];
  return paths.some((value) => value.length === 0) ||
    options.command.length === 0;
}

function parseCliArgs(args: string[]): RunImplEventsOptions {
  const values: Partial<RunImplEventsOptions> = { command: [] };
  let i = 0;
  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      i++;
      break;
    }
    const key = CLI_OPTION_KEYS[arg];
    if (!key) throw new Error(`unknown argument: ${arg}`);
    (values as Record<string, string>)[key] = args[++i] ?? "";
  }
  for (; i < args.length; i++) values.command!.push(args[i]);
  const required = values as RunImplEventsOptions;
  if (missingRequiredOptions(required)) {
    throw new Error(
      "usage: run_impl_events.ts --runs-root PATH ... -- COMMAND",
    );
  }
  return required;
}

async function main() {
  let parsed: RunImplEventsOptions;
  try {
    parsed = parseCliArgs(Deno.args);
  } catch {
    console.error("impl events: invalid command line");
    Deno.exit(1);
  }
  Deno.exit(await runImplEventsHelper(parsed));
}

if (import.meta.main) {
  await main();
}
