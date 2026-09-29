import { readFile, realpath } from "node:fs/promises";

export const SAFE_JSON_ERROR = "invalid state file";

export const RUN_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SHA256_RE = /^[0-9a-f]{64}$/;

export const assertSafeRunId = (runId: string): void => {
  if (!RUN_ID_RE.test(runId)) {
    throw new Error("invalid run id");
  }
};

export const assertRegularFile = async (path: string): Promise<void> => {
  const st = await Deno.lstat(path);
  if (st.isSymlink) throw new Error("state path must not be a symlink");
  if (!st.isFile) throw new Error("state path must be a regular file");
};

export const assertRegularDir = async (path: string): Promise<string> => {
  const st = await Deno.lstat(path);
  if (st.isSymlink) throw new Error("state directory must not be a symlink");
  if (!st.isDirectory) throw new Error("state path must be a directory");
  return realpath(path);
};

export const readJsonFile = async (
  path: string,
): Promise<unknown> => {
  await assertRegularFile(path);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(SAFE_JSON_ERROR);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(SAFE_JSON_ERROR);
  }
};

export const boundedString = (
  value: unknown,
  maxLen: number,
  label: string,
): string => {
  if (typeof value !== "string") throw new Error(`invalid ${label}`);
  if (value.length === 0 || value.length > maxLen) {
    throw new Error(`invalid ${label}`);
  }
  return value;
};
