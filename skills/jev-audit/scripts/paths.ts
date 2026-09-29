import { mkdir } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { getRunsBaseDir } from "../../parallel-review/scripts/review_history.ts";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const getAuditBaseDir = (): string => {
  const home = Deno.env.get("HOME");
  if (!isNonEmptyString(home)) throw new Error("HOME is required");
  const homeAbs = resolve(home);
  const xdg = Deno.env.get("XDG_DATA_HOME");
  const dataHome = isNonEmptyString(xdg)
    ? (() => {
      if (!isAbsolute(xdg)) throw new Error("XDG_DATA_HOME must be absolute");
      return resolve(xdg);
    })()
    : join(homeAbs, ".local", "share");
  return resolve(dataHome, "parallel-review", "jev-audit");
};

export const effectiveRunsBaseDir = (runsDir?: string): string =>
  resolve(runsDir ?? getRunsBaseDir());

const isMissingPath = (error: unknown): boolean =>
  error instanceof Deno.errors.NotFound ||
  (typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT");

/** Resolve symlinks for existing ancestors; missing leaf stays lexical (evaluate_models pattern). */
export const resolveExistingPath = async (path: string): Promise<string> => {
  let remaining = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try {
      await lstat(remaining);
      const resolved = await realpath(remaining);
      return suffix.length === 0
        ? resolved
        : join(resolved, ...suffix.reverse());
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      suffix.push(basename(remaining));
      const parent = dirname(remaining);
      if (parent === remaining) return resolve(path);
      remaining = parent;
    }
  }
};

export const resolveEffectiveRunsCanonical = (
  runsDir?: string,
): Promise<string> => resolveExistingPath(effectiveRunsBaseDir(runsDir));

export const assertAuditBaseSeparateFromRuns = async (
  auditBaseCandidate: string,
  runsDir?: string,
): Promise<void> => {
  const auditCanonical = await resolveExistingPath(resolve(auditBaseCandidate));
  const runsResolved = await resolveEffectiveRunsCanonical(runsDir);
  if (
    auditCanonical === runsResolved ||
    isPathInside(runsResolved, auditCanonical)
  ) {
    throw new Error("audit data must not live under runs directory");
  }
};

const unsafeSegment = (seg: string): boolean =>
  seg === "" || seg === "." || seg === ".." || seg.includes("/") ||
  seg.includes("\\");

/** Walk from audit canonical root; reject symlink components; allow missing final leaf. */
export const assertAuditRelativePathSafe = async (
  auditBaseReal: string,
  segments: string[],
  label: string,
): Promise<string> => {
  let current = auditBaseReal;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (unsafeSegment(seg)) {
      throw new Error(`${label}: invalid path segment`);
    }
    const next = join(current, seg);
    let st: Deno.FileInfo;
    try {
      st = await Deno.lstat(next);
    } catch (error) {
      if (isMissingPath(error)) {
        const parentReal = await realpath(current);
        const absTail = resolve(next, ...segments.slice(i + 1));
        if (!isPathInside(parentReal, absTail)) {
          throw new Error(`${label} escapes audit data directory`);
        }
        return absTail;
      }
      throw error;
    }
    if (st.isSymlink) {
      throw new Error(`${label} must not be a symlink`);
    }
    if (i === segments.length - 1) {
      const targetReal = st.isDirectory
        ? await realpath(next)
        : await realpath(next);
      if (!isPathInside(auditBaseReal, targetReal)) {
        throw new Error(`${label} escapes audit data directory`);
      }
      return targetReal;
    }
    if (!st.isDirectory) {
      throw new Error(`${label}: not a directory`);
    }
    current = await realpath(next);
  }
  return current;
};

export const ensurePrivateDir = async (
  path: string,
  runsDir?: string,
): Promise<string> => {
  await assertAuditBaseSeparateFromRuns(path, runsDir);
  const abs = resolve(path);
  await mkdir(abs, { recursive: true, mode: 0o700 });
  const resolved = await realpath(abs);
  const st = await Deno.lstat(resolved);
  if (st.isSymlink) {
    throw new Error("audit directory must not be a symlink");
  }
  if (!st.isDirectory) {
    throw new Error("audit path must be a directory");
  }
  await Deno.chmod(resolved, 0o700);
  return resolved;
};

export const isPathInside = (parent: string, child: string): boolean => {
  const rel = relative(parent, child);
  return rel === "" ||
    (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel));
};

export const assertInsideBase = async (
  baseDir: string,
  targetPath: string,
  label: string,
): Promise<string> => {
  const baseReal = await realpath(baseDir);
  const targetReal = await realpath(resolve(targetPath));
  if (!isPathInside(baseReal, targetReal)) {
    throw new Error(`${label} escapes audit data directory`);
  }
  return targetReal;
};

export const assertInsideBaseLstat = async (
  baseDir: string,
  targetPath: string,
  label: string,
): Promise<string> => {
  const baseReal = await realpath(baseDir);
  const abs = resolve(targetPath);
  const st = await Deno.lstat(abs);
  if (st.isSymlink) throw new Error(`${label} must not be a symlink`);
  const targetReal = await realpath(abs);
  if (!isPathInside(baseReal, targetReal)) {
    throw new Error(`${label} escapes audit data directory`);
  }
  return targetReal;
};

export const weekDir = (auditBase: string, weekStart: string): string =>
  join(auditBase, "weeks", weekStart);

export const planPath = (weekRoot: string): string =>
  join(weekRoot, "plan.json");

export const approvalsDir = (weekRoot: string): string =>
  join(weekRoot, "approvals");

export const resultsDir = (weekRoot: string): string =>
  join(weekRoot, "results");

export const stagingDir = (weekRoot: string): string =>
  join(weekRoot, "staging");

export const reportJsonPath = (weekRoot: string): string =>
  join(weekRoot, "report.json");

export const reportHtmlPath = (weekRoot: string): string =>
  join(weekRoot, "report.html");

export const globalLockPath = (auditBase: string): string =>
  join(auditBase, ".audit.lock");

export const inspectStagingPath = (
  weekRoot: string,
  runId: string,
): string => join(stagingDir(weekRoot), runId, "input.patch");
