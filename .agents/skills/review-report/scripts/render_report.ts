import { createHash } from "node:crypto";

type Risk = "critical" | "high" | "medium" | "low";
type FindingSource = "blind" | "plan-aware" | "both";

interface PlanInfo {
  provided: boolean;
  label: string;
}

interface DiffSnippet {
  file: string;
  location?: string;
  explanation?: string;
  patch?: string;
  needsImprovement?: boolean;
  improvementReason?: string;
}

interface Finding {
  id: string;
  source: FindingSource;
  severity: Risk;
  title: string;
  problem: string;
  evidence: string;
  suggestion: string;
  location?: string;
  planOnly?: boolean;
}

interface ReviewGroup {
  id: string;
  title: string;
  intent: string;
  risk: Risk;
  riskScore?: number;
  riskReason: string;
  needsImprovement?: boolean;
  improvementReason?: string;
  initialComment?: string;
  files: string[];
  diffs: DiffSnippet[];
  findings: Finding[];
}

interface ReviewReport {
  reportId?: string;
  title?: string;
  target?: string;
  initialComment?: string;
  plan?: PlanInfo;
  groups: ReviewGroup[];
}

const RISK_ORDER: Record<Risk, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const VALID_RISKS = new Set<string>(Object.keys(RISK_ORDER));
const VALID_SEVERITIES = VALID_RISKS;
const VALID_SOURCES = new Set(["blind", "plan-aware", "both"]);

const SECRET_COMPONENTS = new Set(["id_rsa", "id_ed25519", ".envrc"]);
const SECRET_SUFFIXES = [".pem", ".key", ".p12", ".pfx"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isSecretPath = (path: unknown) => {
  const text = String(path ?? "").replace(/\\/g, "/");
  if (!text) return false;
  const parts = text.split("/").filter(Boolean);
  const basename = parts.length ? parts[parts.length - 1] : text;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (SECRET_COMPONENTS.has(lower)) return true;
    if (lower.startsWith(".env")) return true;
    if (lower.startsWith("credentials") || lower.startsWith("secrets")) {
      return true;
    }
  }
  const lowerBase = basename.toLowerCase();
  return SECRET_SUFFIXES.some((suffix) => lowerBase.endsWith(suffix));
};

const requireNonEmptyString = (
  value: unknown,
  fieldPath: string,
  errors: string[],
) => {
  if (typeof value !== "string") {
    errors.push(`${fieldPath} must be a string`);
    return false;
  }
  if (!value.trim()) {
    errors.push(`${fieldPath} must be a non-empty string`);
    return false;
  }
  return true;
};

const requireString = (value: unknown, fieldPath: string, errors: string[]) => {
  if (value !== undefined && value !== null && typeof value !== "string") {
    errors.push(`${fieldPath} must be a string`);
    return false;
  }
  return true;
};

const requireBool = (value: unknown, fieldPath: string, errors: string[]) => {
  if (value !== undefined && value !== null && typeof value !== "boolean") {
    errors.push(`${fieldPath} must be a boolean`);
    return false;
  }
  return true;
};

const checkUniqueId = (
  value: unknown,
  idSet: Set<string>,
  duplicateMsg: string,
  fieldPath: string,
  errors: string[],
) => {
  if (!requireNonEmptyString(value, fieldPath, errors)) return;
  const id = value as string;
  if (idSet.has(id)) {
    errors.push(duplicateMsg.replace("{}", id));
  } else {
    idSet.add(id);
  }
};

const validatePathList = (
  paths: unknown,
  fieldPath: string,
  errors: string[],
) => {
  if (!Array.isArray(paths)) {
    errors.push(`${fieldPath} must be an array`);
    return;
  }
  paths.forEach((path, index) => {
    const p = `${fieldPath}[${index}]`;
    if (!requireNonEmptyString(path, p, errors)) return;
    if (isSecretPath(path)) {
      errors.push(`${p} references a secret path and must not be included`);
    }
  });
};

const validateDiff = (diff: unknown, fieldPath: string, errors: string[]) => {
  if (!isRecord(diff)) {
    errors.push(`${fieldPath} must be an object`);
    return;
  }

  const filePath = diff.file;
  if (filePath === undefined) {
    errors.push(`${fieldPath} missing required field: file`);
  } else if (!requireNonEmptyString(filePath, `${fieldPath}.file`, errors)) {
    // continue validating optional fields
  } else if (isSecretPath(filePath)) {
    errors.push(
      `${fieldPath}.file references a secret path and must not be included`,
    );
  }

  for (
    const optional of [
      "location",
      "explanation",
      "patch",
      "improvementReason",
    ] as const
  ) {
    requireString(diff[optional], `${fieldPath}.${optional}`, errors);
  }
  requireBool(diff.needsImprovement, `${fieldPath}.needsImprovement`, errors);

  const needsImprovement = diff.needsImprovement === true;
  const explanation = diff.explanation;
  const improvementReason = diff.improvementReason;

  if (needsImprovement) {
    if (
      !requireNonEmptyString(
        improvementReason,
        `${fieldPath}.improvementReason`,
        errors,
      )
    ) {
      errors.push(
        `${fieldPath} needsImprovement=true requires a non-empty improvementReason`,
      );
    }
  } else if (typeof explanation !== "string" || !explanation.trim()) {
    errors.push(`${fieldPath}.explanation must be a non-empty string`);
  }
};

const validateFinding = (
  finding: unknown,
  fieldPath: string,
  errors: string[],
  findingIds: Set<string>,
) => {
  if (!isRecord(finding)) {
    errors.push(`${fieldPath} must be an object`);
    return;
  }

  for (
    const field of [
      "id",
      "source",
      "severity",
      "title",
      "problem",
      "evidence",
      "suggestion",
    ] as const
  ) {
    if (!(field in finding)) {
      errors.push(`${fieldPath} missing required field: ${field}`);
    }
  }

  checkUniqueId(
    finding.id,
    findingIds,
    "duplicate finding id: {}",
    `${fieldPath}.id`,
    errors,
  );

  const source = finding.source;
  if (typeof source !== "string" || !VALID_SOURCES.has(source)) {
    errors.push(
      `${fieldPath}.source must be one of ${[...VALID_SOURCES].sort()}`,
    );
  }

  const severity = finding.severity;
  if (typeof severity !== "string" || !VALID_SEVERITIES.has(severity)) {
    errors.push(
      `${fieldPath}.severity must be one of ${[...VALID_SEVERITIES].sort()}`,
    );
  }

  for (const field of ["title", "problem", "evidence", "suggestion"] as const) {
    requireNonEmptyString(finding[field], `${fieldPath}.${field}`, errors);
  }

  requireString(finding.location, `${fieldPath}.location`, errors);
  requireBool(finding.planOnly, `${fieldPath}.planOnly`, errors);

  if (finding.planOnly === true && source !== "plan-aware") {
    errors.push(
      `${fieldPath}.planOnly=true is only allowed when source=plan-aware`,
    );
  }
};

const stableStringify = (value: unknown): string => {
  if (
    value === null || typeof value === "boolean" || typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${
      keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(
        ",",
      )
    }}`;
  }
  return "null";
};

export const defaultReportId = (report: Record<string, unknown>) => {
  if (report.reportId) {
    return String(report.reportId);
  }
  const payload = { ...report };
  delete payload.reportId;
  const seed = stableStringify(payload);
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `review-report-${digest}`;
};

export const validateReport = (report: unknown): string[] => {
  const errors: string[] = [];
  if (!isRecord(report)) {
    return ["report must be a JSON object"];
  }

  for (
    const field of ["reportId", "title", "target", "initialComment"] as const
  ) {
    requireString(report[field], `report.${field}`, errors);
  }

  const plan = report.plan;
  if (plan !== undefined && plan !== null) {
    if (!isRecord(plan)) {
      errors.push("plan must be an object");
    } else {
      if (!("provided" in plan)) {
        errors.push("plan missing required field: provided");
      } else if (typeof plan.provided !== "boolean") {
        errors.push("plan.provided must be a boolean");
      }
      if (!("label" in plan)) {
        errors.push("plan missing required field: label");
      } else if (typeof plan.label !== "string") {
        errors.push("plan.label must be a string");
      }
    }
  }

  const groups = report.groups;
  if (groups === undefined) {
    errors.push("missing required field: groups");
    return errors;
  }
  if (!Array.isArray(groups)) {
    errors.push("groups must be an array");
    return errors;
  }

  const groupIds = new Set<string>();
  const findingIds = new Set<string>();

  groups.forEach((group, index) => {
    const prefix = `groups[${index}]`;
    if (!isRecord(group)) {
      errors.push(`${prefix} must be an object`);
      return;
    }

    for (
      const field of [
        "id",
        "title",
        "intent",
        "risk",
        "riskReason",
        "files",
        "diffs",
        "findings",
      ] as const
    ) {
      if (!(field in group)) {
        errors.push(`${prefix} missing required field: ${field}`);
      }
    }

    checkUniqueId(
      group.id,
      groupIds,
      "duplicate group id: {}",
      `${prefix}.id`,
      errors,
    );

    for (const field of ["title", "intent", "riskReason"] as const) {
      requireNonEmptyString(group[field], `${prefix}.${field}`, errors);
    }

    const risk = group.risk;
    if (typeof risk !== "string" || !VALID_RISKS.has(risk)) {
      errors.push(`${prefix}.risk must be one of ${[...VALID_RISKS].sort()}`);
    }

    let score: unknown = group.riskScore ?? 0;
    if (score === null) score = 0;
    if (typeof score === "boolean") {
      errors.push(`${prefix}.riskScore must be numeric`);
    } else if (!isFiniteNumber(score)) {
      errors.push(`${prefix}.riskScore must be a finite number`);
    } else if (score < 0 || score > 100) {
      errors.push(`${prefix}.riskScore must be between 0 and 100`);
    }

    requireBool(group.needsImprovement, `${prefix}.needsImprovement`, errors);
    requireString(
      group.improvementReason,
      `${prefix}.improvementReason`,
      errors,
    );
    requireString(group.initialComment, `${prefix}.initialComment`, errors);

    if (group.needsImprovement === true) {
      if (
        !requireNonEmptyString(
          group.improvementReason,
          `${prefix}.improvementReason`,
          errors,
        )
      ) {
        errors.push(
          `${prefix} needsImprovement=true requires a non-empty improvementReason`,
        );
      }
    }

    validatePathList(group.files, `${prefix}.files`, errors);

    const diffs = group.diffs;
    if (!Array.isArray(diffs)) {
      errors.push(`${prefix}.diffs must be an array`);
    } else {
      diffs.forEach((diff, dIndex) =>
        validateDiff(diff, `${prefix}.diffs[${dIndex}]`, errors)
      );
    }

    const findings = group.findings;
    if (!Array.isArray(findings)) {
      errors.push(`${prefix}.findings must be an array`);
    } else {
      findings.forEach((finding, fIndex) =>
        validateFinding(
          finding,
          `${prefix}.findings[${fIndex}]`,
          errors,
          findingIds,
        )
      );
    }
  });

  return errors;
};

export const sortFindings = <T extends Record<string, unknown>>(
  findings: T[],
) => {
  const indexed = findings.map((finding, index) => ({ index, finding }));
  indexed.sort((a, b) => {
    const aRank = RISK_ORDER[a.finding.severity as Risk] ?? 99;
    const bRank = RISK_ORDER[b.finding.severity as Risk] ?? 99;
    return aRank - bRank || a.index - b.index;
  });
  return indexed.map(({ finding }) => finding);
};

export const sortGroups = <T extends Record<string, unknown>>(groups: T[]) => {
  const indexed = groups.map((group, index) => ({ index, group }));
  indexed.sort((a, b) => {
    const aRank = RISK_ORDER[a.group.risk as Risk] ?? 99;
    const bRank = RISK_ORDER[b.group.risk as Risk] ?? 99;
    const aScore = (a.group.riskScore as number) || 0;
    const bScore = (b.group.riskScore as number) || 0;
    return aRank - bRank || bScore - aScore || a.index - b.index;
  });
  return indexed.map(({ group }) => group);
};

export const normalizeReport = (
  report: Record<string, unknown>,
): ReviewReport => {
  const normalized: Record<string, unknown> = { ...report };
  if (normalized.title === undefined) normalized.title = "Large diff review";
  if (normalized.target === undefined) normalized.target = "";
  if (normalized.plan === undefined) {
    normalized.plan = { provided: false, label: "" };
  }

  const groups = (normalized.groups as Record<string, unknown>[] | undefined) ??
    [];
  normalized.groups = groups.map((group) => {
    const g: Record<string, unknown> = { ...group };
    if (g.riskScore === undefined) g.riskScore = 0;
    if (g.files === undefined) g.files = [];
    if (g.diffs === undefined) g.diffs = [];
    g.findings = sortFindings((g.findings as Record<string, unknown>[]) ?? []);
    return g;
  });
  normalized.reportId = defaultReportId(normalized);
  return normalized as unknown as ReviewReport;
};

export const escapeJsonForScript = (payload: unknown) => {
  const text = JSON.stringify(payload);
  return text
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
};

export type DiffLineKind = "meta" | "hunk" | "add" | "del" | "context";

export interface ParsedDiffLine {
  kind: DiffLineKind;
  text: string;
  oldNum: number | null;
  newNum: number | null;
}

export interface PatchStats {
  additions: number;
  deletions: number;
}

const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

export const splitPatchLines = (patch: string): string[] => {
  if (!patch) return [];
  const normalized = patch.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (
    normalized.endsWith("\n") && lines.length > 0 &&
    lines[lines.length - 1] === ""
  ) {
    lines.pop();
  }
  return lines;
};

const parseHunkHeader = (line: string) => {
  const match = HUNK_HEADER_RE.exec(line);
  if (!match) return null;
  const oldStart = Number(match[1]);
  const oldCount = match[2] === undefined ? 1 : Number(match[2]);
  const newStart = Number(match[3]);
  const newCount = match[4] === undefined ? 1 : Number(match[4]);
  return { oldStart, oldCount, newStart, newCount };
};

export const parseUnifiedDiff = (patch: string): ParsedDiffLine[] => {
  const lines = splitPatchLines(patch);
  const result: ParsedDiffLine[] = [];
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining: number | null = null;
  let newRemaining: number | null = null;

  const finishHunkIfComplete = () => {
    if (oldRemaining === 0 && newRemaining === 0) {
      inHunk = false;
    }
  };

  const degradeCounters = () => {
    oldRemaining = null;
    newRemaining = null;
  };

  const startHunk = (
    header: ParsedDiffLine,
    counts: ReturnType<typeof parseHunkHeader>,
  ) => {
    inHunk = true;
    result.push(header);
    if (!counts) {
      oldRemaining = null;
      newRemaining = null;
      return;
    }
    oldLine = counts.oldStart;
    newLine = counts.newStart;
    oldRemaining = counts.oldCount;
    newRemaining = counts.newCount;
    finishHunkIfComplete();
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      startHunk(
        { kind: "hunk", text: line, oldNum: null, newNum: null },
        parseHunkHeader(line),
      );
      continue;
    }

    if (!inHunk) {
      result.push({ kind: "meta", text: line, oldNum: null, newNum: null });
      continue;
    }

    if (line === "\\ No newline at end of file") {
      result.push({ kind: "meta", text: line, oldNum: null, newNum: null });
      continue;
    }

    const prefix = line.charAt(0);
    const countersKnown = oldRemaining !== null && newRemaining !== null;

    if (prefix === "+") {
      let newNum: number | null = null;
      if (countersKnown) {
        if (newRemaining! > 0) {
          newNum = newLine;
          newLine++;
          newRemaining!--;
        } else {
          degradeCounters();
        }
      }
      result.push({ kind: "add", text: line, oldNum: null, newNum });
      if (oldRemaining !== null && newRemaining !== null) {
        finishHunkIfComplete();
      }
      continue;
    }

    if (prefix === "-") {
      let oldNum: number | null = null;
      if (countersKnown) {
        if (oldRemaining! > 0) {
          oldNum = oldLine;
          oldLine++;
          oldRemaining!--;
        } else {
          degradeCounters();
        }
      }
      result.push({ kind: "del", text: line, oldNum, newNum: null });
      if (oldRemaining !== null && newRemaining !== null) {
        finishHunkIfComplete();
      }
      continue;
    }

    if (prefix === " ") {
      let oldNum: number | null = null;
      let newNum: number | null = null;
      if (countersKnown) {
        if (oldRemaining! > 0 && newRemaining! > 0) {
          oldNum = oldLine;
          newNum = newLine;
          oldLine++;
          newLine++;
          oldRemaining!--;
          newRemaining!--;
        } else {
          degradeCounters();
        }
      }
      result.push({ kind: "context", text: line, oldNum, newNum });
      if (oldRemaining !== null && newRemaining !== null) {
        finishHunkIfComplete();
      }
      continue;
    }

    result.push({ kind: "meta", text: line, oldNum: null, newNum: null });
  }

  return result;
};

export const countPatchStats = (lines: ParsedDiffLine[]): PatchStats => {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.kind === "add") additions++;
    else if (line.kind === "del") deletions++;
  }
  return { additions, deletions };
};

const htmlEscape = (text: unknown) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const HTML_TEMPLATE = String.raw`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>__TITLE__</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #d1d5db;
      --accent: #2563eb;
      --critical: #b91c1c;
      --high: #c2410c;
      --medium: #b45309;
      --low: #047857;
      --badge-bg: #eef2ff;
      --needs-bg: #fef2f2;
      --needs-border: #fca5a5;
      --diff-gutter-bg: #f3f4f6;
      --diff-meta-bg: #f9fafb;
      --diff-hunk-bg: #eff6ff;
      --diff-hunk-fg: #1d4ed8;
      --diff-add-bg: #ecfdf5;
      --diff-add-fg: #047857;
      --diff-del-bg: #fef2f2;
      --diff-del-fg: #b91c1c;
      --diff-context-bg: #ffffff;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --border: #374151;
        --accent: #60a5fa;
        --critical: #f87171;
        --high: #fb923c;
        --medium: #fbbf24;
        --low: #34d399;
        --badge-bg: #1e293b;
        --needs-bg: #450a0a;
        --needs-border: #991b1b;
        --diff-gutter-bg: #1f2937;
        --diff-meta-bg: #111827;
        --diff-hunk-bg: #1e3a5f;
        --diff-hunk-fg: #93c5fd;
        --diff-add-bg: #064e3b;
        --diff-add-fg: #6ee7b7;
        --diff-del-bg: #450a0a;
        --diff-del-fg: #fca5a5;
        --diff-context-bg: #0f172a;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Yu Gothic", Meiryo, sans-serif;
      font-size: 16px;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      letter-spacing: 0.015em;
      text-rendering: optimizeLegibility;
    }
    header, main, footer { max-width: 1100px; margin: 0 auto; padding: 1rem 1.25rem; }
    header {
      border-bottom: 1px solid var(--border);
      background: var(--panel);
    }
    h1 {
      margin: 0 0 0.25rem;
      font-size: clamp(1.6rem, 3vw, 1.9rem);
      line-height: 1.3;
      font-weight: 700;
      letter-spacing: 0.01em;
      overflow-wrap: anywhere;
      border-left: 3px solid var(--accent);
      padding-left: 0.65rem;
    }
    .meta { color: var(--muted); font-size: 0.9rem; }
    .summary {
      display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem;
    }
    .stat {
      background: var(--badge-bg);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
      min-width: 7rem;
    }
    .stat strong { display: block; font-size: 1.25rem; }
    .group {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .group-header {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.75rem 1rem;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
    }
    .group-header h2 {
      margin: 0;
      font-size: 1.15rem;
      line-height: 1.4;
      font-weight: 700;
      letter-spacing: 0.01em;
      overflow-wrap: anywhere;
      flex: 1;
    }
    .risk-badge {
      font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
      padding: 0.15rem 0.5rem; border-radius: 999px; color: #fff;
      line-height: 1.3;
    }
    .risk-critical { background: var(--critical); }
    .risk-high { background: var(--high); }
    .risk-medium { background: var(--medium); }
    .risk-low { background: var(--low); }
    .group-body { padding: 1rem; display: none; }
    .group.expanded .group-body { display: block; }
    .intent, .files, .risk-reason { margin: 0 0 0.9rem; line-height: 1.75; }
    .intent strong, .files strong, .risk-reason strong {
      display: block;
      margin-bottom: 0.2rem;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .files code { font-size: 0.85rem; letter-spacing: 0; }
    .diff-block { margin: 1rem 0; }
    .explanation { margin-bottom: 0.35rem; color: var(--muted); line-height: 1.65; }
    .needs-label {
      display: inline-block;
      background: var(--needs-bg);
      border: 1px solid var(--needs-border);
      color: var(--critical);
      font-weight: 700;
      padding: 0.25rem 0.5rem;
      border-radius: 0.35rem;
      margin-bottom: 0.35rem;
      line-height: 1.3;
    }
    .diff-card {
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      background: var(--panel);
      margin-top: 0.35rem;
    }
    .diff-summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      list-style: none;
      border-bottom: 1px solid var(--border);
    }
    .diff-summary::-webkit-details-marker { display: none; }
    .diff-summary::marker { content: ''; }
    .diff-summary::before {
      content: '▸';
      display: inline-block;
      color: var(--muted);
      transition: transform 0.15s ease;
    }
    .diff-card[open] > .diff-summary::before { transform: rotate(90deg); }
    .diff-file { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; font-weight: 600; letter-spacing: 0; }
    .diff-location { color: var(--muted); font-size: 0.8rem; }
    .diff-stats { margin-left: auto; display: flex; gap: 0.5rem; font-size: 0.75rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0; }
    .diff-stat-add { color: var(--diff-add-fg); }
    .diff-stat-del { color: var(--diff-del-fg); }
    .diff-body { padding: 0.5rem 0.75rem 0.75rem; }
    .diff-controls { display: flex; gap: 0.35rem; margin-bottom: 0.5rem; }
    .diff-mode-btn {
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      padding: 0.2rem 0.55rem;
      border-radius: 0.35rem;
      cursor: pointer;
      font-size: 0.75rem;
      line-height: 1.3;
    }
    .diff-mode-btn.active {
      border-color: var(--accent);
      background: var(--badge-bg);
      font-weight: 600;
    }
    .diff-viewport {
      max-height: 24rem;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 0.35rem;
    }
    .diff-table {
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.82rem;
      line-height: 1.55;
      letter-spacing: 0;
      table-layout: auto;
    }
    .diff-table col.gutter { width: 3rem; }
    .diff-table col.code { width: auto; }
    .diff-table td {
      padding: 0;
      vertical-align: top;
      white-space: pre;
    }
    .diff-gutter {
      text-align: right;
      padding: 0 0.45rem;
      color: var(--muted);
      user-select: none;
      border-right: 1px solid var(--border);
      background: var(--diff-gutter-bg);
    }
    .diff-code { padding: 0 0.6rem; }
    .diff-row-meta td { background: var(--diff-meta-bg); color: var(--muted); }
    .diff-row-hunk td { background: var(--diff-hunk-bg); color: var(--diff-hunk-fg); font-weight: 600; }
    .diff-row-add td { background: var(--diff-add-bg); }
    .diff-row-add .diff-gutter-new { color: var(--diff-add-fg); }
    .diff-row-del td { background: var(--diff-del-bg); }
    .diff-row-del .diff-gutter-old { color: var(--diff-del-fg); }
    .diff-row-context td { background: var(--diff-context-bg); }
    .diff-empty {
      padding: 0.75rem;
      color: var(--muted);
      font-size: 0.85rem;
      font-style: italic;
    }
    .finding {
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.75rem;
      margin: 0.75rem 0;
      line-height: 1.65;
    }
    .finding-head { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.4rem; }
    .finding-title {
      font-weight: 700;
      line-height: 1.45;
      letter-spacing: 0.01em;
      overflow-wrap: anywhere;
      flex: 1;
    }
    .badge {
      font-size: 0.7rem; font-weight: 600;
      padding: 0.1rem 0.45rem; border-radius: 999px;
      background: var(--badge-bg); border: 1px solid var(--border);
      line-height: 1.3;
    }
    .badge-plan-only { color: var(--high); border-color: var(--high); }
    .decisions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .decisions button {
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      padding: 0.25rem 0.6rem;
      border-radius: 0.35rem;
      cursor: pointer;
      font-size: 0.8rem;
      line-height: 1.3;
    }
    .decisions button.active { border-color: var(--accent); background: var(--badge-bg); }
    .comment-box { width: 100%; min-height: 4rem; margin-top: 0.75rem; }
    textarea, .feedback-output {
      width: 100%;
      font-family: inherit;
      font-size: 0.9rem;
      line-height: 1.65;
      letter-spacing: 0.01em;
      padding: 0.6rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      background: var(--panel);
      color: var(--text);
    }
    footer {
      border-top: 1px solid var(--border);
      background: var(--panel);
      margin-bottom: 2rem;
    }
    footer h2 {
      font-size: 1.15rem;
      line-height: 1.4;
      font-weight: 700;
      letter-spacing: 0.01em;
      border-left: 3px solid var(--accent);
      padding-left: 0.55rem;
      margin: 1.25rem 0 0.5rem;
    }
    footer h2:first-of-type { margin-top: 0; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.75rem 0; }
    .actions button {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      font-size: 0.9rem;
      line-height: 1.3;
    }
    .actions button.secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .hidden-copy { position: absolute; left: -9999px; }
    #copy-status { min-height: 1.25rem; color: var(--muted); font-size: 0.85rem; margin-top: 0.35rem; }
    @media (max-width: 640px) {
      header, main, footer { padding-left: 0.75rem; padding-right: 0.75rem; }
      h1 { font-size: clamp(1.45rem, 4vw, 1.6rem); }
      .group-header h2 { font-size: 1.05rem; }
      footer h2 { font-size: 1.05rem; }
    }
  </style>
</head>
<body>
  <header>
    <h1 id="report-title"></h1>
    <div class="meta" id="report-meta"></div>
    <div class="summary" id="summary"></div>
  </header>
  <main id="groups"></main>
  <footer>
    <h2>全体コメント</h2>
    <textarea id="global-comment" class="comment-box" placeholder="レビュー全体へのコメント"></textarea>
    <h2>フィードバック生成</h2>
    <p class="meta">採用された指摘と人間コメントを、元の作業セッションへ渡す Markdown にまとめます。</p>
    <div class="actions">
      <button type="button" id="generate-feedback">フィードバックを生成</button>
      <button type="button" id="copy-feedback" class="secondary">クリップボードにコピー</button>
    </div>
    <div id="copy-status" aria-live="polite"></div>
    <textarea id="feedback-output" class="feedback-output" readonly rows="14" placeholder="採用された指摘とコメントから Markdown を生成します"></textarea>
    <textarea id="hidden-copy" class="hidden-copy" aria-hidden="true"></textarea>
  </footer>
  <script type="application/json" id="report-data">__REPORT_JSON__</script>
  <script>
    const REPORT = JSON.parse(document.getElementById('report-data').textContent);
    const STORAGE_KEY = 'review-report:' + REPORT.reportId;
    const RISK_CLASS = { critical: 'risk-critical', high: 'risk-high', medium: 'risk-medium', low: 'risk-low' };
    const DECISIONS = ['accepted', 'rejected', 'pending'];
    const DECISION_LABELS = { accepted: '採用', rejected: '却下', pending: '未判定' };
    const SEVERITY_LABELS = { critical: '[重大]', high: '[警告]', medium: '[注意]', low: '[情報]' };
    const findingCards = new Map();

    function createInitialState() {
      const state = {
        findings: Object.create(null),
        groupComments: Object.create(null),
        globalComment: '',
      };
      if (typeof REPORT.initialComment === 'string') {
        state.globalComment = REPORT.initialComment;
      }
      REPORT.groups.forEach(function(group) {
        if (typeof group.initialComment === 'string') {
          state.groupComments[group.id] = group.initialComment;
        }
      });
      return state;
    }

    function normalizeState(raw) {
      const state = createInitialState();
      if (!raw || typeof raw !== 'object') return state;
      if (raw.findings && typeof raw.findings === 'object' && !Array.isArray(raw.findings)) {
        Object.keys(raw.findings).forEach(function(id) {
          const decision = raw.findings[id];
          if (DECISIONS.indexOf(decision) !== -1) {
            state.findings[id] = decision;
          }
        });
      }
      if (raw.groupComments && typeof raw.groupComments === 'object' && !Array.isArray(raw.groupComments)) {
        Object.keys(raw.groupComments).forEach(function(id) {
          if (Object.prototype.hasOwnProperty.call(raw.groupComments, id) && typeof raw.groupComments[id] === 'string') {
            state.groupComments[id] = raw.groupComments[id];
          }
        });
      }
      if (Object.prototype.hasOwnProperty.call(raw, 'globalComment') && typeof raw.globalComment === 'string') {
        state.globalComment = raw.globalComment;
      }
      return state;
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return normalizeState(null);
        return normalizeState(JSON.parse(raw));
      } catch (_) {
        return normalizeState(null);
      }
    }

    function saveState(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
    }

    let state = loadState();

    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null) node.textContent = text;
      return node;
    }

    var HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

    function splitPatchLines(patch) {
      if (!patch) return [];
      var normalized = patch.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      var lines = normalized.split('\n');
      if (normalized.endsWith('\n') && lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      return lines;
    }

    function parseHunkHeader(line) {
      var match = HUNK_HEADER_RE.exec(line);
      if (!match) return null;
      return {
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
      };
    }

    function parseUnifiedDiff(patch) {
      var lines = splitPatchLines(patch);
      var result = [];
      var inHunk = false;
      var oldLine = 0;
      var newLine = 0;
      var oldRemaining = null;
      var newRemaining = null;

      function finishHunkIfComplete() {
        if (oldRemaining === 0 && newRemaining === 0) {
          inHunk = false;
        }
      }

      function degradeCounters() {
        oldRemaining = null;
        newRemaining = null;
      }

      function startHunk(header, counts) {
        inHunk = true;
        result.push(header);
        if (!counts) {
          oldRemaining = null;
          newRemaining = null;
          return;
        }
        oldLine = counts.oldStart;
        newLine = counts.newStart;
        oldRemaining = counts.oldCount;
        newRemaining = counts.newCount;
        finishHunkIfComplete();
      }

      lines.forEach(function(line) {
        if (line.indexOf('@@') === 0) {
          startHunk(
            { kind: 'hunk', text: line, oldNum: null, newNum: null },
            parseHunkHeader(line),
          );
          return;
        }
        if (!inHunk) {
          result.push({ kind: 'meta', text: line, oldNum: null, newNum: null });
          return;
        }
        if (line === '\\ No newline at end of file') {
          result.push({ kind: 'meta', text: line, oldNum: null, newNum: null });
          return;
        }
        var prefix = line.charAt(0);
        var countersKnown = oldRemaining !== null && newRemaining !== null;
        if (prefix === '+') {
          var newNum = null;
          if (countersKnown) {
            if (newRemaining > 0) {
              newNum = newLine;
              newLine++;
              newRemaining--;
            } else {
              degradeCounters();
            }
          }
          result.push({ kind: 'add', text: line, oldNum: null, newNum: newNum });
          if (oldRemaining !== null && newRemaining !== null) {
            finishHunkIfComplete();
          }
          return;
        }
        if (prefix === '-') {
          var oldNum = null;
          if (countersKnown) {
            if (oldRemaining > 0) {
              oldNum = oldLine;
              oldLine++;
              oldRemaining--;
            } else {
              degradeCounters();
            }
          }
          result.push({ kind: 'del', text: line, oldNum: oldNum, newNum: null });
          if (oldRemaining !== null && newRemaining !== null) {
            finishHunkIfComplete();
          }
          return;
        }
        if (prefix === ' ') {
          var ctxOldNum = null;
          var ctxNewNum = null;
          if (countersKnown) {
            if (oldRemaining > 0 && newRemaining > 0) {
              ctxOldNum = oldLine;
              ctxNewNum = newLine;
              oldLine++;
              newLine++;
              oldRemaining--;
              newRemaining--;
            } else {
              degradeCounters();
            }
          }
          result.push({
            kind: 'context',
            text: line,
            oldNum: ctxOldNum,
            newNum: ctxNewNum,
          });
          if (oldRemaining !== null && newRemaining !== null) {
            finishHunkIfComplete();
          }
          return;
        }
        result.push({ kind: 'meta', text: line, oldNum: null, newNum: null });
      });
      return result;
    }

    function countPatchStats(lines) {
      var additions = 0;
      var deletions = 0;
      lines.forEach(function(line) {
        if (line.kind === 'add') additions++;
        else if (line.kind === 'del') deletions++;
      });
      return { additions: additions, deletions: deletions };
    }

    function formatGutterNum(num) {
      return num === null || num === undefined ? '' : String(num);
    }

    function diffRowClass(kind) {
      if (kind === 'hunk') return 'diff-row-hunk';
      if (kind === 'add') return 'diff-row-add';
      if (kind === 'del') return 'diff-row-del';
      if (kind === 'context') return 'diff-row-context';
      return 'diff-row-meta';
    }

    function renderDiffTableBody(tbody, parsedLines, changesOnly) {
      tbody.replaceChildren();
      parsedLines.forEach(function(line) {
        if (changesOnly && line.kind === 'context') return;
        var tr = el('tr', diffRowClass(line.kind));
        var oldGutter = el('td', 'diff-gutter diff-gutter-old', formatGutterNum(line.oldNum));
        var newGutter = el('td', 'diff-gutter diff-gutter-new', formatGutterNum(line.newNum));
        var codeCell = el('td', 'diff-code');
        codeCell.textContent = line.text;
        tr.appendChild(oldGutter);
        tr.appendChild(newGutter);
        tr.appendChild(codeCell);
        tbody.appendChild(tr);
      });
    }

    function setDiffMode(card, mode) {
      var changesOnly = mode === 'changes';
      card.dataset.diffMode = mode;
      card.querySelectorAll('.diff-mode-btn').forEach(function(btn) {
        var active = btn.dataset.mode === mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      var tbody = card.querySelector('.diff-table tbody');
      if (tbody && card._parsedLines) {
        renderDiffTableBody(tbody, card._parsedLines, changesOnly);
      }
    }

    function renderDiffCard(diff) {
      var details = el('details', 'diff-card');
      details.open = true;

      var summary = el('summary', 'diff-summary');
      summary.appendChild(el('span', 'diff-file', diff.file || ''));
      if (diff.location) {
        summary.appendChild(el('span', 'diff-location', diff.location));
      }

      var hasPatch = typeof diff.patch === 'string' && diff.patch.length > 0;
      var parsedLines = hasPatch ? parseUnifiedDiff(diff.patch) : [];
      details._parsedLines = parsedLines;

      if (hasPatch) {
        var stats = countPatchStats(parsedLines);
        var statsBox = el('span', 'diff-stats');
        statsBox.appendChild(el('span', 'diff-stat-add', '+' + stats.additions));
        statsBox.appendChild(el('span', 'diff-stat-del', '-' + stats.deletions));
        summary.appendChild(statsBox);
      }

      details.appendChild(summary);

      var body = el('div', 'diff-body');
      if (!hasPatch) {
        body.appendChild(el('div', 'diff-empty', 'パッチなし'));
        details.appendChild(body);
        return details;
      }

      var controls = el('div', 'diff-controls');
      var btnFull = el('button', 'diff-mode-btn active', '全文表示');
      btnFull.type = 'button';
      btnFull.dataset.mode = 'full';
      btnFull.setAttribute('aria-pressed', 'true');
      var btnChanges = el('button', 'diff-mode-btn', '差分のみ');
      btnChanges.type = 'button';
      btnChanges.dataset.mode = 'changes';
      btnChanges.setAttribute('aria-pressed', 'false');
      btnFull.addEventListener('click', function(ev) {
        ev.preventDefault();
        setDiffMode(details, 'full');
      });
      btnChanges.addEventListener('click', function(ev) {
        ev.preventDefault();
        setDiffMode(details, 'changes');
      });
      controls.appendChild(btnFull);
      controls.appendChild(btnChanges);
      body.appendChild(controls);

      var viewport = el('div', 'diff-viewport');
      var table = el('table', 'diff-table');
      var colgroup = document.createElement('colgroup');
      colgroup.appendChild(el('col', 'gutter'));
      colgroup.appendChild(el('col', 'gutter'));
      colgroup.appendChild(el('col', 'code'));
      table.appendChild(colgroup);
      var tbody = document.createElement('tbody');
      renderDiffTableBody(tbody, parsedLines, false);
      table.appendChild(tbody);
      viewport.appendChild(table);
      body.appendChild(viewport);
      details.appendChild(body);
      details.dataset.diffMode = 'full';
      return details;
    }

    function setDecision(findingId, decision) {
      state.findings[findingId] = decision;
      saveState(state);
      updateSummary();
      const card = findingCards.get(findingId);
      if (card) {
        card.querySelectorAll('.decisions button').forEach(function(btn) {
          btn.classList.toggle('active', btn.dataset.decision === decision);
        });
      }
    }

    function updateSummary() {
      let accepted = 0, rejected = 0, pending = 0, comments = 0;
      REPORT.groups.forEach(function(group) {
        (group.findings || []).forEach(function(f) {
          const d = state.findings[f.id] || 'pending';
          if (d === 'accepted') accepted++;
          else if (d === 'rejected') rejected++;
          else pending++;
        });
        if ((state.groupComments[group.id] || '').trim()) comments++;
      });
      if ((state.globalComment || '').trim()) comments++;
      const summary = document.getElementById('summary');
      summary.replaceChildren();
      [
        ['採用', accepted],
        ['却下', rejected],
        ['未判定', pending],
        ['コメント', comments],
      ].forEach(function(pair) {
        const box = el('div', 'stat');
        box.appendChild(el('strong', null, String(pair[1])));
        box.appendChild(document.createTextNode(pair[0]));
        summary.appendChild(box);
      });
    }

    function renderGroups() {
      const root = document.getElementById('groups');
      root.replaceChildren();
      findingCards.clear();
      REPORT.groups.forEach(function(group) {
        const section = el('section', 'group');
        if (group.risk === 'critical' || group.risk === 'high') section.classList.add('expanded');

        const header = el('div', 'group-header');
        header.appendChild(el('span', 'risk-badge ' + (RISK_CLASS[group.risk] || ''), group.risk));
        header.appendChild(el('span', 'badge', 'スコア: ' + (group.riskScore != null ? group.riskScore : 0)));
        header.appendChild(el('h2', null, group.title));
        header.addEventListener('click', function() { section.classList.toggle('expanded'); });
        section.appendChild(header);

        const body = el('div', 'group-body');
        const intent = el('p', 'intent');
        intent.appendChild(el('strong', null, '意図: '));
        intent.appendChild(document.createTextNode(group.intent || ''));
        body.appendChild(intent);

        if (group.needsImprovement) {
          const label = el('div', 'needs-label', '要改善: ' + (group.improvementReason || ''));
          body.appendChild(label);
        }

        const reason = el('p', 'risk-reason');
        reason.appendChild(el('strong', null, 'リスク根拠: '));
        reason.appendChild(document.createTextNode(group.riskReason || ''));
        body.appendChild(reason);

        if (group.files && group.files.length) {
          const files = el('p', 'files');
          files.appendChild(el('strong', null, '関連ファイル: '));
          group.files.forEach(function(file, idx) {
            if (idx) files.appendChild(document.createTextNode(', '));
            files.appendChild(el('code', null, file));
          });
          body.appendChild(files);
        }

        (group.diffs || []).forEach(function(diff) {
          const block = el('div', 'diff-block');
          if (diff.explanation) {
            block.appendChild(el('div', 'explanation', diff.explanation));
          }
          if (diff.needsImprovement) {
            const labelText = diff.improvementReason
              ? '要改善: ' + diff.improvementReason
              : '要改善';
            block.appendChild(el('div', 'needs-label', labelText));
          }
          block.appendChild(renderDiffCard(diff));
          body.appendChild(block);
        });

        (group.findings || []).forEach(function(finding) {
          const card = el('div', 'finding');
          findingCards.set(finding.id, card);
          const head = el('div', 'finding-head');
          head.appendChild(el('span', 'finding-title', finding.title));
          head.appendChild(el('span', 'badge', finding.severity));
          head.appendChild(el('span', 'badge', finding.source));
          if (finding.planOnly) head.appendChild(el('span', 'badge badge-plan-only', 'plan-only'));
          card.appendChild(head);

          if (finding.location) card.appendChild(el('div', null, '場所: ' + finding.location));
          if (finding.problem) {
            const p = el('div', null);
            p.appendChild(el('strong', null, '指摘: '));
            p.appendChild(document.createTextNode(finding.problem));
            card.appendChild(p);
          }
          if (finding.evidence) {
            const p = el('div', null);
            p.appendChild(el('strong', null, '根拠: '));
            p.appendChild(document.createTextNode(finding.evidence));
            card.appendChild(p);
          }
          if (finding.suggestion) {
            const p = el('div', null);
            p.appendChild(el('strong', null, '改善案: '));
            p.appendChild(document.createTextNode(finding.suggestion));
            card.appendChild(p);
          }

          const decisions = el('div', 'decisions');
          DECISIONS.forEach(function(decision) {
            const btn = el('button', null, DECISION_LABELS[decision]);
            btn.type = 'button';
            btn.dataset.decision = decision;
            const current = state.findings[finding.id] || 'pending';
            if (current === decision) btn.classList.add('active');
            btn.addEventListener('click', function(ev) {
              ev.stopPropagation();
              setDecision(finding.id, decision);
            });
            decisions.appendChild(btn);
          });
          card.appendChild(decisions);
          body.appendChild(card);
        });

        const groupComment = el('textarea', 'comment-box');
        groupComment.placeholder = 'このグループへのコメント';
        groupComment.value = state.groupComments[group.id] || '';
        groupComment.addEventListener('input', function() {
          state.groupComments[group.id] = groupComment.value;
          saveState(state);
          updateSummary();
        });
        body.appendChild(groupComment);

        section.appendChild(body);
        root.appendChild(section);
      });
    }

    function generateFeedbackMarkdown() {
      const lines = ['# レビューフィードバック', ''];
      lines.push('## 依頼');
      lines.push('- 以下の指摘が忖度なしで妥当かどうか精査してください。妥当でないものは指摘してください。');
      lines.push('- 対応方針に迷う点があれば、実装前に確認してください。');
      lines.push('- 却下・未判定の指摘は対応対象外です。');
      lines.push('');
      if (REPORT.target) lines.push('対象: ' + REPORT.target);
      if (REPORT.plan && REPORT.plan.provided) {
        lines.push('Plan: ' + (REPORT.plan.label || ''));
      }
      lines.push('');

      const acceptedFindings = [];
      REPORT.groups.forEach(function(group) {
        (group.findings || []).forEach(function(f) {
          if ((state.findings[f.id] || 'pending') === 'accepted') {
            acceptedFindings.push({ finding: f, group: group });
          }
        });
      });

      let hasComments = false;
      REPORT.groups.forEach(function(group) {
        if ((state.groupComments[group.id] || '').trim()) hasComments = true;
      });
      if ((state.globalComment || '').trim()) hasComments = true;

      if (acceptedFindings.length) {
        lines.push('## 指摘');
        lines.push('');
        acceptedFindings.forEach(function(item, idx) {
          const f = item.finding;
          const group = item.group;
          const n = idx + 1;
          const severityLabel = SEVERITY_LABELS[f.severity] || SEVERITY_LABELS.low;
          lines.push('### ' + n + '. ' + severityLabel + ' ' + f.title);
          if (f.location) lines.push('- 場所: ' + f.location);
          lines.push('- 変更グループの意図: ' + (group.intent || ''));
          if (f.planOnly === true) {
            lines.push('- 備考: plan を読まないと判定できない指摘です。');
          } else if (f.source === 'both') {
            lines.push('- 備考: blind レビューと plan 照合の両方で検出。');
          } else if (f.source === 'plan-aware') {
            lines.push('- 備考: plan 照合で検出。');
          }
          if (f.problem) lines.push('- 指摘: ' + f.problem);
          if (f.evidence) lines.push('- 根拠: ' + f.evidence);
          if (f.suggestion) lines.push('- 改善案: ' + f.suggestion);
          lines.push('');
        });
      }

      if (hasComments) {
        lines.push('## コメント');
        lines.push('');
        REPORT.groups.forEach(function(group) {
          const comment = (state.groupComments[group.id] || '').trim();
          if (comment) {
            lines.push('### ' + group.title + '（グループコメント）');
            lines.push(comment);
            lines.push('');
          }
        });
        const globalComment = (state.globalComment || '').trim();
        if (globalComment) {
          lines.push('### 全体コメント');
          lines.push(globalComment);
          lines.push('');
        }
      }

      return lines.join('\n').trim() + '\n';
    }

    function setCopyStatus(message) {
      document.getElementById('copy-status').textContent = message;
    }

    function fallbackCopy(text) {
      try {
        const hidden = document.getElementById('hidden-copy');
        hidden.value = text;
        hidden.focus();
        hidden.select();
        return document.execCommand('copy');
      } catch (_) {
        return false;
      }
    }

    function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(function() {
          setCopyStatus('クリップボードにコピーしました');
        }).catch(function() {
          if (fallbackCopy(text)) {
            setCopyStatus('クリップボードにコピーしました（フォールバック）');
            return;
          }
          setCopyStatus('コピーに失敗しました。テキストエリアから手動でコピーしてください');
          throw new Error('copy failed');
        });
      }
      if (fallbackCopy(text)) {
        setCopyStatus('クリップボードにコピーしました');
        return Promise.resolve();
      }
      setCopyStatus('コピーに失敗しました。テキストエリアから手動でコピーしてください');
      return Promise.reject(new Error('copy failed'));
    }

    document.getElementById('report-title').textContent = REPORT.title || 'Large diff review';
    const metaParts = [];
    if (REPORT.target) metaParts.push('Target: ' + REPORT.target);
    if (REPORT.plan && REPORT.plan.provided) metaParts.push('Plan: ' + (REPORT.plan.label || 'provided'));
    document.getElementById('report-meta').textContent = metaParts.join(' | ');

    const globalCommentEl = document.getElementById('global-comment');
    globalCommentEl.value = state.globalComment || '';
    globalCommentEl.addEventListener('input', function() {
      state.globalComment = globalCommentEl.value;
      saveState(state);
      updateSummary();
    });

    renderGroups();
    updateSummary();

    document.getElementById('generate-feedback').addEventListener('click', function() {
      document.getElementById('feedback-output').value = generateFeedbackMarkdown();
    });

    document.getElementById('copy-feedback').addEventListener('click', function() {
      const text = generateFeedbackMarkdown();
      document.getElementById('feedback-output').value = text;
      copyText(text).catch(function() {});
    });
  </script>
</body>
</html>
`;

export const renderHtml = (report: Record<string, unknown>) => {
  const normalized = normalizeReport(report);
  const sorted = {
    ...normalized,
    groups: sortGroups(
      normalized.groups as unknown as Record<string, unknown>[],
    ),
  };
  const payload = escapeJsonForScript(sorted);
  let html = HTML_TEMPLATE;
  html = html.replace(
    "<title>__TITLE__</title>",
    `<title>${htmlEscape(normalized.title)}</title>`,
  );
  html = html.replace(
    '<script type="application/json" id="report-data">__REPORT_JSON__</script>',
    `<script type="application/json" id="report-data">${payload}</script>`,
  );
  return html;
};

const replaceExtension = (path: string, ext: string) => {
  const lastDot = path.lastIndexOf(".");
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastDot > lastSlash) {
    return path.slice(0, lastDot) + ext;
  }
  return path + ext;
};

export const main = async (argv: string[]) => {
  let input: string | undefined;
  let output: string | undefined;
  let validateOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--validate-only") {
      validateOnly = true;
    } else if (arg === "-o" || arg === "--output") {
      output = argv[++i];
      if (!output) {
        console.error("missing output path");
        return 1;
      }
    } else if (arg.startsWith("-")) {
      console.error(`unknown option: ${arg}`);
      return 1;
    } else if (!input) {
      input = arg;
    } else {
      console.error(`unexpected argument: ${arg}`);
      return 1;
    }
  }

  if (!input) {
    console.error("input JSON path required");
    return 1;
  }

  let report: unknown;
  try {
    const text = await Deno.readTextFile(input);
    report = JSON.parse(text);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.error(`file not found: ${input}`);
      return 1;
    }
    if (error instanceof SyntaxError) {
      console.error(`invalid JSON: ${error.message}`);
      return 1;
    }
    console.error(
      `read error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  const errors = validateReport(report);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    return 1;
  }

  if (validateOnly) {
    console.log("valid");
    return 0;
  }

  const outPath = output ?? replaceExtension(input, ".html");
  try {
    const html = renderHtml(report as Record<string, unknown>);
    await Deno.writeTextFile(outPath, html);
  } catch (error) {
    console.error(
      `write error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  console.log(outPath);
  return 0;
};

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
