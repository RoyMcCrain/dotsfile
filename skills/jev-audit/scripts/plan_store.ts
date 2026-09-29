import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WeeklyPlan } from "./plan_types.ts";
import { assertAuditRelativePathSafe } from "./paths.ts";
import { assertRegularDir, readJsonFile } from "./state_io.ts";
import { validateWeeklyPlan } from "./validate_state.ts";

export const readPlan = async (
  auditBase: string,
  weekStart: string,
): Promise<WeeklyPlan | undefined> => {
  const baseReal = await assertRegularDir(auditBase);
  const path = await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", weekStart, "plan.json"],
    "plan",
  );
  try {
    const raw = await readJsonFile(path);
    return validateWeeklyPlan(raw);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return undefined;
    }
    if (error instanceof Error && error.message === "invalid state file") {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("state path")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("missing path")) {
      return undefined;
    }
    if (
      error instanceof Error &&
      error.message === "state path must be a regular file"
    ) {
      return undefined;
    }
    throw error;
  }
};

export const writePlanImmutable = async (
  auditBase: string,
  weekStart: string,
  plan: WeeklyPlan,
): Promise<void> => {
  const baseReal = await assertRegularDir(auditBase);
  await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", weekStart],
    "week directory",
  );
  const weekRoot = join(baseReal, "weeks", weekStart);
  await Deno.mkdir(weekRoot, { recursive: true, mode: 0o700 });
  await Deno.chmod(weekRoot, 0o700);
  const path = join(weekRoot, "plan.json");
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
};

export const assertPlanRunsDir = (
  plan: WeeklyPlan,
  runsDirCanonical: string,
): void => {
  if (plan.runsDirCanonical !== runsDirCanonical) {
    throw new Error("plan runs directory mismatch; use matching --runs-dir");
  }
};
