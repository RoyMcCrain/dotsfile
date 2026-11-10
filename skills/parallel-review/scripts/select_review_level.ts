import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const SCHEMA_VERSION = 1;
export type ReviewLevel = 1 | 2;
export type RequestedLevel = "auto" | ReviewLevel;
export type ChunkChoice = "none" | "12000";
export type ChunkDecision = {
  source: "fixed";
  reason: "explicit_level";
  choice: ChunkChoice;
};
export type LevelDecision = {
  schemaVersion: typeof SCHEMA_VERSION;
  requestedLevel: ReviewLevel;
  level: ReviewLevel;
  source: "explicit";
  reason: "explicit";
  patchSha256: string;
  chunking?: ChunkDecision;
};

export const FIXED_CHUNK_BYTE_THRESHOLD = 15_000;
export const FIXED_CHUNK_NEWLINE_THRESHOLD = 400;
const SHA256_RE = /^[a-f0-9]{64}$/;

export const countPatchNewlines = (data: Uint8Array): number => {
  let count = 0;
  for (const byte of data) if (byte === 0x0a) count++;
  return count;
};

export const computeFixedChunkChoice = (data: Uint8Array): ChunkChoice =>
  data.byteLength >= FIXED_CHUNK_BYTE_THRESHOLD ||
    countPatchNewlines(data) >= FIXED_CHUNK_NEWLINE_THRESHOLD
    ? "12000"
    : "none";

export const parseReviewLevelString = (raw: string): ReviewLevel => {
  if (raw === "auto" || raw === "1") return 1;
  if (raw === "2") return 2;
  throw new Error("level must be auto, 1, or 2");
};

export const sha256Bytes = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

export const buildExplicitDecision = (options: {
  level: ReviewLevel;
  patchSha256: string;
  patchBytes?: Uint8Array;
}): LevelDecision => {
  const decision: LevelDecision = {
    schemaVersion: SCHEMA_VERSION,
    requestedLevel: options.level,
    level: options.level,
    source: "explicit",
    reason: "explicit",
    patchSha256: options.patchSha256,
  };
  if (options.patchBytes) {
    decision.chunking = {
      source: "fixed",
      reason: "explicit_level",
      choice: computeFixedChunkChoice(options.patchBytes),
    };
  }
  return decision;
};

const validateDecisionKeys = (value: Record<string, unknown>): void => {
  const allowed = [
    "schemaVersion",
    "requestedLevel",
    "level",
    "source",
    "reason",
    "patchSha256",
    "chunking",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error("decision contains unknown fields");
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateChunking = (input: unknown): ChunkDecision | undefined => {
  if (input === undefined) return undefined;
  if (!isRecord(input)) throw new Error("invalid chunking decision");
  const keys = ["source", "reason", "choice"];
  if (Object.keys(input).some((key) => !keys.includes(key))) {
    throw new Error("invalid chunking decision");
  }
  if (input.source !== "fixed" || input.reason !== "explicit_level") {
    throw new Error("invalid chunking decision");
  }
  if (input.choice !== "none" && input.choice !== "12000") {
    throw new Error("invalid chunking decision");
  }
  return input as ChunkDecision;
};

const validateDecisionPatchHash = (value: unknown): string => {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error("invalid explicit level decision");
  }
  return value;
};

const validateDecisionEnvelope = (
  input: unknown,
): {
  value: Record<string, unknown>;
  level: ReviewLevel;
  patchSha256: string;
} => {
  if (!isRecord(input)) throw new Error("decision must be an object");
  validateDecisionKeys(input);
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("invalid explicit level decision");
  }
  if (input.level !== 1 && input.level !== 2) {
    throw new Error("invalid explicit level decision");
  }
  if (
    input.requestedLevel !== input.level || input.source !== "explicit" ||
    input.reason !== "explicit"
  ) throw new Error("invalid explicit level decision");
  return {
    value: input,
    level: input.level,
    patchSha256: validateDecisionPatchHash(input.patchSha256),
  };
};

export const validateLevelDecision = (input: unknown): LevelDecision => {
  const { value, level, patchSha256 } = validateDecisionEnvelope(input);
  const chunking = validateChunking(value.chunking);
  return {
    schemaVersion: SCHEMA_VERSION,
    requestedLevel: level,
    level,
    source: "explicit",
    reason: "explicit",
    patchSha256,
    ...(chunking ? { chunking } : {}),
  };
};

export const selectReviewLevel = (
  options: { patchBytes: Uint8Array; levelArg?: string },
): LevelDecision => {
  const level = parseReviewLevelString(options.levelArg ?? "auto");
  return buildExplicitDecision({
    level,
    patchSha256: sha256Bytes(options.patchBytes),
    patchBytes: options.patchBytes,
  });
};

export const readPatchFile = async (path: string): Promise<Uint8Array> => {
  if (!path) throw new Error("--input is required");
  return new Uint8Array(await readFile(path));
};

const HELP =
  `select_review_level.ts — offline parallel-review level selection\n\nUsage:\n  bun --config=/dev/null --no-env-file --no-install run select_review_level.ts \\\n    --input PATCH_FILE [--level auto|1|2]\n\nFlags:\n  --input  Path to the sanitized patch file (required)\n  --level  auto (default, equivalent to 1) or explicit 1 or 2\n`;
type ParsedCli = { input?: string; level?: string; help: boolean };
const parseValueFlag = (
  args: string[],
  index: number,
  out: ParsedCli,
  seen: Set<string>,
): number => {
  const flag = args[index];
  if (flag !== "--input" && flag !== "--level") {
    throw new Error(`unknown flag: ${flag}`);
  }
  if (seen.has(flag)) throw new Error(`duplicate flag: ${flag}`);
  seen.add(flag);
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`missing value for ${flag}`);
  }
  if (flag === "--input") out.input = value;
  else out.level = value;
  return index + 1;
};

const parseCliArgs = (args: string[]): ParsedCli => {
  const out: ParsedCli = { help: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--help" || args[index] === "-h") {
      if (seen.has("help")) throw new Error("duplicate flag: --help");
      seen.add("help");
      out.help = true;
    } else {
      index = parseValueFlag(args, index, out, seen);
    }
  }
  return out;
};
export const runCli = async (
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> => {
  try {
    const parsed = parseCliArgs(args);
    if (parsed.help) return { code: 0, stdout: HELP, stderr: "" };
    if (!parsed.input) throw new Error("--input is required");
    const decision = selectReviewLevel({
      patchBytes: await readPatchFile(parsed.input),
      levelArg: parsed.level,
    });
    validateLevelDecision(decision);
    return { code: 0, stdout: `${JSON.stringify(decision)}\n`, stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { code: 1, stdout: "", stderr: `${message}\n` };
  }
};
const main = async () => {
  const result = await runCli(process.argv.slice(2));
  if (result.code !== 0) {
    process.stderr.write(result.stderr);
    process.exitCode = 1;
  }
  if (result.stdout) process.stdout.write(result.stdout);
};
if (import.meta.main) main();
