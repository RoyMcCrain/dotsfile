import { lstat, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  getRunsBaseDir,
  validateMetadata,
} from "../../parallel-review/scripts/review_history.ts";
import { validateLevelDecision } from "../../parallel-review/scripts/select_review_level.ts";

const isMissingDir = (error: unknown): boolean => {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT";
};

export type RunDirIndex = {
  byRunId: Map<string, string>;
  warnings: Array<{ runDir: string; reason: string }>;
};

export const indexRunDirs = async (
  runsDir?: string,
): Promise<RunDirIndex> => {
  const runsRoot = resolve(runsDir ?? getRunsBaseDir());
  const byRunId = new Map<string, string>();
  const duplicateRunIds = new Set<string>();
  const warnings: RunDirIndex["warnings"] = [];

  let entries: string[];
  try {
    const rootLstat = await lstat(runsRoot);
    if (rootLstat.isSymbolicLink()) {
      warnings.push({ runDir: runsRoot, reason: "symlink_runs_root" });
      return { byRunId, warnings };
    }
    entries = await readdir(runsRoot);
  } catch (error) {
    if (isMissingDir(error)) return { byRunId, warnings };
    throw error;
  }

  for (const name of entries.sort()) {
    const runDir = join(runsRoot, name);
    try {
      const childLstat = await lstat(runDir);
      if (childLstat.isSymbolicLink()) {
        warnings.push({ runDir, reason: "symlink_run_dir" });
        continue;
      }
      if (!childLstat.isDirectory()) continue;

      const metadataPath = join(runDir, "metadata.json");
      const metaLstat = await lstat(metadataPath);
      if (metaLstat.isSymbolicLink()) {
        warnings.push({ runDir, reason: "symlink_metadata" });
        continue;
      }
      if (!metaLstat.isFile()) {
        warnings.push({ runDir, reason: "invalid_metadata" });
        continue;
      }
      let metadata: Record<string, unknown>;
      try {
        metadata = validateMetadata(
          JSON.parse(await readFile(metadataPath, "utf8")),
        );
      } catch {
        warnings.push({ runDir, reason: "invalid_metadata" });
        continue;
      }
      const runId = String(metadata.runId);
      if (duplicateRunIds.has(runId)) {
        warnings.push({ runDir, reason: "duplicate_run_id" });
        continue;
      }
      if (byRunId.has(runId)) {
        byRunId.delete(runId);
        duplicateRunIds.add(runId);
        warnings.push({ runDir, reason: "duplicate_run_id" });
        continue;
      }
      byRunId.set(runId, runDir);
    } catch {
      warnings.push({ runDir, reason: "unreadable_run_dir" });
    }
  }

  return { byRunId, warnings };
};

export const locateRunDir = (
  index: RunDirIndex,
  runId: string,
): string | undefined => index.byRunId.get(runId);

export const metadataPatchSha256Matches = async (
  runDir: string,
  expectedPatchSha256: string,
): Promise<boolean> => {
  try {
    const metadataPath = join(runDir, "metadata.json");
    const metaLstat = await lstat(metadataPath);
    if (metaLstat.isSymbolicLink() || !metaLstat.isFile()) return false;
    const metadata = validateMetadata(
      JSON.parse(await readFile(metadataPath, "utf8")),
    );
    const decision = validateLevelDecision(metadata.levelDecision);
    return decision.patchSha256 === expectedPatchSha256;
  } catch {
    return false;
  }
};
