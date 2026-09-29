import { resolve } from "node:path";
import {
  assertInsideBaseLstat,
  ensurePrivateDir,
  getAuditBaseDir,
  globalLockPath,
  resolveEffectiveRunsCanonical,
  weekDir,
} from "./paths.ts";
import {
  assertMondayUtc,
  defaultPreviousUtcWeek,
  parseUtcDate,
  periodFromWeekStart,
} from "./week_period.ts";
import { ensureWeeklyPlan } from "./prepare_plan.ts";
import { assertPlanRunsDir, readPlan } from "./plan_store.ts";
import { approveCase } from "./approval_store.ts";
import { runSingleCase, stageCaseForInspect } from "./audit_run.ts";
import {
  buildReport,
  collectCaseStates,
  refreshReportFromDisk,
  writeReportAtomically,
} from "./report.ts";
import { acquireGlobalAuditLock, lockRecoveryNote } from "./lock.ts";
import type { AuditResultRecord } from "./plan_types.ts";
import { isUnavailableResult, readWeekResult } from "./result_store.ts";
import { defaultAuditorRole, resolveModelRole } from "./model_resolve.ts";

type GlobalOpts = {
  auditDir?: string;
  runsDir?: string;
  week?: string;
};

const parseGlobal = (
  args: string[],
): { cmd: string; rest: string[]; opts: GlobalOpts } => {
  const opts: GlobalOpts = {};
  const seenGlobal = new Set<string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--audit-dir") {
      if (seenGlobal.has("audit-dir")) throw new Error("duplicate --audit-dir");
      seenGlobal.add("audit-dir");
      const val = args[++i];
      if (!val || val.startsWith("--") || val.trim().length === 0) {
        throw new Error("--audit-dir requires a path");
      }
      opts.auditDir = resolve(val);
      continue;
    }
    if (arg === "--runs-dir") {
      if (seenGlobal.has("runs-dir")) throw new Error("duplicate --runs-dir");
      seenGlobal.add("runs-dir");
      const val = args[++i];
      if (!val || val.startsWith("--") || val.trim().length === 0) {
        throw new Error("--runs-dir requires a path");
      }
      opts.runsDir = resolve(val);
      continue;
    }
    if (arg === "--week") {
      if (seenGlobal.has("week")) throw new Error("duplicate --week");
      seenGlobal.add("week");
      const val = args[++i];
      if (!val || val.startsWith("--") || val.trim().length === 0) {
        throw new Error("--week requires YYYY-MM-DD");
      }
      opts.week = val;
      continue;
    }
    positional.push(arg);
  }
  const [cmd = "prepare", ...tail] = positional;
  return { cmd, rest: tail, opts };
};

const resolvePeriod = (week?: string) => {
  if (week) {
    parseUtcDate(week);
    assertMondayUtc(week);
    return periodFromWeekStart(week);
  }
  return defaultPreviousUtcWeek();
};

const resolveAuditBase = async (
  override?: string,
  runsDir?: string,
): Promise<string> => {
  const candidate = override ?? getAuditBaseDir();
  return await ensurePrivateDir(candidate, runsDir);
};

const parseInspectFlags = (rest: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  let i = 0;
  while (i < rest.length) {
    const arg = rest[i];
    if (arg !== "--run-id") throw new Error(`unexpected inspect flag: ${arg}`);
    if (map.has("run-id")) throw new Error("duplicate --run-id");
    i++;
    const val = rest[i];
    if (val === undefined || val.startsWith("--") || val.trim().length === 0) {
      throw new Error("missing value for --run-id");
    }
    map.set("run-id", val);
    i++;
  }
  return map;
};

const parseFlagArgs = (rest: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  let i = 0;
  while (i < rest.length) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (map.has(key)) throw new Error(`duplicate flag: ${arg}`);
    i++;
    const val = rest[i];
    if (val === undefined || val.startsWith("--") || val.trim().length === 0) {
      throw new Error(`missing value for ${arg}`);
    }
    map.set(key, val);
    i++;
  }
  return map;
};

const rejectExtraRest = (cmd: string, rest: string[]) => {
  if (rest.length > 0) {
    throw new Error(`unexpected argument for ${cmd}`);
  }
};

const cmdPrepare = async (opts: GlobalOpts) => {
  const period = resolvePeriod(opts.week);
  const auditBase = await resolveAuditBase(opts.auditDir, opts.runsDir);
  const lock = await acquireGlobalAuditLock(
    auditBase,
    globalLockPath(auditBase),
  );
  try {
    const { weekRoot, plan } = await ensureWeeklyPlan({
      auditBase,
      period,
      runsDir: opts.runsDir,
    });
    const states = await collectCaseStates(
      auditBase,
      period.weekStart,
      plan,
    );
    const report = await buildReport({
      auditBase,
      weekRoot,
      plan,
      caseStates: states,
    });
    const paths = await writeReportAtomically(
      auditBase,
      period.weekStart,
      report,
    );
    const out = {
      command: "prepare",
      period,
      weekRoot,
      planPath: `${weekRoot}/plan.json`,
      reportJson: paths.jsonPath,
      reportHtml: paths.htmlPath,
      counts: report.counts,
    };
    await Deno.stdout.write(
      new TextEncoder().encode(`${JSON.stringify(out)}\n`),
    );
  } finally {
    await lock.release();
  }
};

const cmdApprove = async (opts: GlobalOpts, rest: string[]) => {
  const flags = parseFlagArgs(rest);
  const runId = flags.get("run-id");
  const approvedInput = flags.get("approved-input");
  if (!runId || !approvedInput) {
    throw new Error(
      "usage: audit.ts approve --run-id ID --approved-input PATH",
    );
  }
  for (const key of flags.keys()) {
    if (key !== "run-id" && key !== "approved-input") {
      throw new Error(`unknown approve flag: --${key}`);
    }
  }
  const period = resolvePeriod(opts.week);
  const auditBase = await resolveAuditBase(opts.auditDir, opts.runsDir);
  const lock = await acquireGlobalAuditLock(
    auditBase,
    globalLockPath(auditBase),
  );
  try {
    const weekRoot = weekDir(auditBase, period.weekStart);
    const plan = await readPlan(auditBase, period.weekStart);
    if (!plan) throw new Error("weekly plan missing; run prepare first");
    const runsCanonical = await resolveEffectiveRunsCanonical(opts.runsDir);
    assertPlanRunsDir(plan, runsCanonical);
    const planCase = plan.selected.find((c) => c.runId === runId);
    if (!planCase) throw new Error("runId not in weekly plan");
    const inputPath = await assertInsideBaseLstat(
      auditBase,
      resolve(approvedInput),
      "approved input",
    );
    const record = await approveCase({
      auditBase,
      weekRoot,
      weekStart: period.weekStart,
      runId,
      patchSha256: planCase.patchSha256,
      approvedInputPath: inputPath,
      runsDir: opts.runsDir,
      jevModel: planCase.jevModel,
    });
    await Deno.stdout.write(
      new TextEncoder().encode(`${JSON.stringify({ approved: record })}\n`),
    );
  } finally {
    await lock.release();
  }
};

const cmdInspect = async (opts: GlobalOpts, rest: string[]) => {
  const flags = parseInspectFlags(rest);
  const runId = flags.get("run-id");
  if (!runId) {
    throw new Error("usage: audit.ts inspect --run-id ID");
  }
  const period = resolvePeriod(opts.week);
  const auditBase = await resolveAuditBase(opts.auditDir, opts.runsDir);
  const lock = await acquireGlobalAuditLock(
    auditBase,
    globalLockPath(auditBase),
  );
  try {
    const { plan } = await ensureWeeklyPlan({
      auditBase,
      period,
      runsDir: opts.runsDir,
    });
    const planCase = plan.selected.find((c) => c.runId === runId);
    if (!planCase) throw new Error("runId not in weekly plan");
    const staged = await stageCaseForInspect({
      auditBase,
      weekStart: period.weekStart,
      planCase,
      runsDir: opts.runsDir,
    });
    if ("error" in staged) {
      throw new Error(staged.error);
    }
    await Deno.stdout.write(
      new TextEncoder().encode(
        `${
          JSON.stringify({
            runId,
            stagedPath: staged.stagedPath,
            patchSha256: staged.patchSha256,
          })
        }\n`,
      ),
    );
  } finally {
    await lock.release();
  }
};

const cmdRun = async (opts: GlobalOpts) => {
  const period = resolvePeriod(opts.week);
  const auditBase = await resolveAuditBase(opts.auditDir, opts.runsDir);
  const lock = await acquireGlobalAuditLock(
    auditBase,
    globalLockPath(auditBase),
  );
  try {
    const { weekRoot, plan } = await ensureWeeklyPlan({
      auditBase,
      period,
      runsDir: opts.runsDir,
    });
    let resolvedAuditor: string | undefined;
    try {
      resolvedAuditor = await resolveModelRole(defaultAuditorRole());
    } catch {
      resolvedAuditor = undefined;
    }
    const states: Array<{
      planCase: (typeof plan.selected)[number];
      status: string;
      result?: AuditResultRecord;
      reason?: string;
    }> = [];
    for (const planCase of plan.selected) {
      let outcome;
      try {
        outcome = await runSingleCase({
          auditBase,
          weekRoot,
          weekStart: period.weekStart,
          planCase,
          runsDir: opts.runsDir,
          resolvedAuditorModel: resolvedAuditor,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "run failed";
        throw new Error(message);
      }
      if (outcome.status === "needs_preflight") {
        states.push({ planCase, status: "needs_preflight" });
      } else if (outcome.status === "approved_pending") {
        states.push({ planCase, status: "approved_pending" });
      } else if (outcome.status === "held") {
        states.push({ planCase, status: "held", reason: outcome.reason });
      } else if (outcome.status === "unavailable") {
        const existing = await readWeekResult(
          auditBase,
          period.weekStart,
          planCase.runId,
        );
        states.push({
          planCase,
          status: "unavailable",
          reason: outcome.reason,
          result: existing,
        });
      } else {
        states.push({
          planCase,
          status: isUnavailableResult(outcome.result)
            ? "unavailable"
            : "audited",
          result: outcome.result,
          reason: isUnavailableResult(outcome.result)
            ? outcome.result.failureReason
            : undefined,
        });
      }
    }
    const report = await buildReport({
      auditBase,
      weekRoot,
      plan,
      caseStates: states,
    });
    const paths = await writeReportAtomically(
      auditBase,
      period.weekStart,
      report,
    );
    await Deno.stdout.write(
      new TextEncoder().encode(
        `${
          JSON.stringify({
            command: "run",
            period,
            weekRoot,
            reportJson: paths.jsonPath,
            counts: report.counts,
            lockRecovery: lockRecoveryNote(),
          })
        }\n`,
      ),
    );
  } finally {
    await lock.release();
  }
};

const cmdReport = async (opts: GlobalOpts) => {
  const period = resolvePeriod(opts.week);
  const auditBase = await resolveAuditBase(opts.auditDir, opts.runsDir);
  const weekRoot = weekDir(auditBase, period.weekStart);
  const lock = await acquireGlobalAuditLock(
    auditBase,
    globalLockPath(auditBase),
  );
  try {
    const report = await refreshReportFromDisk(
      auditBase,
      period.weekStart,
      weekRoot,
    );
    const paths = await writeReportAtomically(
      auditBase,
      period.weekStart,
      report,
    );
    await Deno.stdout.write(
      new TextEncoder().encode(
        `${JSON.stringify({ reportJson: paths.jsonPath })}\n`,
      ),
    );
  } finally {
    await lock.release();
  }
};

const printHelp = () => {
  const text = `jev-audit audit.ts [prepare|inspect|approve|run|report]\n` +
    `  --audit-dir PATH  default XDG .../parallel-review/jev-audit\n` +
    `  --runs-dir PATH   parallel-review runs (read-only)\n` +
    `  --week YYYY-MM-DD UTC Monday; default previous completed UTC week\n` +
    `prepare  offline plan + report (preserves on-disk case states)\n` +
    `inspect  --run-id ID  stage selected patch under audit tree for offline read\n` +
    `approve  --run-id ID --approved-input PATH (after inspecting staged patch)\n` +
    `run      audit approved cases only\n` +
    `report   regenerate report from disk state\n`;
  return text;
};

const main = async () => {
  const args = Deno.args;
  if (args.includes("--help") || args.includes("-h")) {
    await Deno.stdout.write(new TextEncoder().encode(printHelp()));
    return;
  }
  const { cmd, rest, opts } = parseGlobal(args);
  if (cmd === "prepare" || cmd === "run" || cmd === "report") {
    rejectExtraRest(cmd, rest);
  } else if (
    rest.some((t) =>
      !t.startsWith("--") && cmd !== "approve" && cmd !== "inspect"
    )
  ) {
    throw new Error(`unexpected argument for ${cmd}`);
  }
  if (cmd === "prepare") await cmdPrepare(opts);
  else if (cmd === "inspect") await cmdInspect(opts, rest);
  else if (cmd === "approve") await cmdApprove(opts, rest);
  else if (cmd === "run") await cmdRun(opts);
  else if (cmd === "report") await cmdReport(opts);
  else throw new Error(`unknown command: ${cmd}`);
};

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "audit failed");
    Deno.exit(1);
  });
}
