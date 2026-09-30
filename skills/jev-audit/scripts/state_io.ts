import { randomUUID } from "node:crypto";
import { link, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SAFE_JSON_ERROR = "invalid state file";

/** Maximum bytes read from a local JSON state file (bounded read, not stat-only). */
const MAX_JSON_FILE_BYTES = 1 << 20;

export const isMissingPath = (error: unknown): boolean =>
  error instanceof Deno.errors.NotFound ||
  (typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT");

const isEexist = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: string }).code === "EEXIST";

/** Complete write to a same-directory temp file, then hard-link publish (wx semantics). */
export const publishPrivateFileAtomic = async (
  finalPath: string,
  content: string | Uint8Array,
  options?: { ifExists?: "fail" | "ignore" },
): Promise<"created" | "exists"> => {
  const ifExists = options?.ifExists ?? "fail";
  try {
    const st = await Deno.lstat(finalPath);
    if (st.isSymlink) {
      throw new Error("state path must not be a symlink");
    }
    if (!st.isFile) {
      throw new Error("state path must be a regular file");
    }
    if (ifExists === "ignore") return "exists";
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  const dir = dirname(finalPath);
  const tmpPath = join(dir, `.jev-pub-${randomUUID()}.tmp`);
  try {
    await writeFile(tmpPath, content, { flag: "wx", mode: 0o600 });
    const handle = await Deno.open(tmpPath, { write: true });
    try {
      await handle.sync();
    } finally {
      handle.close();
    }
    try {
      await link(tmpPath, finalPath);
    } catch (error) {
      if (ifExists === "ignore" && isEexist(error)) return "exists";
      throw error;
    }
    return "created";
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
};

/** Replace a regular staging leaf atomically; rejects symlinks and hard links. */
export const replacePrivateFileAtomic = async (
  finalPath: string,
  content: string | Uint8Array,
): Promise<void> => {
  try {
    const st = await Deno.lstat(finalPath);
    if (st.isSymlink) {
      throw new Error("staging file must not be a symlink");
    }
    if (!st.isFile) {
      throw new Error("staging path must be a regular file");
    }
    if ((st.nlink ?? 1) > 1) {
      throw new Error("staging file must not be hard linked");
    }
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  const dir = dirname(finalPath);
  const tmpPath = join(dir, `.jev-repl-${randomUUID()}.tmp`);
  try {
    await writeFile(tmpPath, content, { flag: "wx", mode: 0o600 });
    const handle = await Deno.open(tmpPath, { write: true });
    try {
      await handle.sync();
    } finally {
      handle.close();
    }
    await Deno.rename(tmpPath, finalPath);
    await Deno.chmod(finalPath, 0o600);
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
};

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
  let handle: Deno.FsFile | undefined;
  try {
    handle = await Deno.open(path, { read: true });
    const buf = new Uint8Array(MAX_JSON_FILE_BYTES + 1);
    let total = 0;
    while (total < buf.length) {
      const n = await handle.read(buf.subarray(total));
      if (n === null) break;
      total += n;
    }
    if (total === 0 || total > MAX_JSON_FILE_BYTES) {
      throw new Error(SAFE_JSON_ERROR);
    }
    const raw = new TextDecoder().decode(buf.subarray(0, total));
    return JSON.parse(raw);
  } catch {
    throw new Error(SAFE_JSON_ERROR);
  } finally {
    handle?.close();
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
