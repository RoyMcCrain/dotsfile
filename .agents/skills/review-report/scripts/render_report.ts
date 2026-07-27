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

interface ReportDiagram {
  id?: string;
  title?: string;
  mermaid: string;
}

type VerificationVerdict =
  | "confirmed"
  | "contradicted"
  | "partial"
  | "inconclusive";

interface FindingVerification {
  findingId: string;
  verdict: VerificationVerdict;
  summary: string;
  evidence: string;
}

interface ReviewReport {
  reportId?: string;
  title?: string;
  target?: string;
  overview?: string;
  diagrams?: ReportDiagram[];
  verifications?: FindingVerification[];
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
const VALID_VERDICTS = new Set([
  "confirmed",
  "contradicted",
  "partial",
  "inconclusive",
]);

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
    const field of [
      "reportId",
      "title",
      "target",
      "overview",
      "initialComment",
    ] as const
  ) {
    requireString(report[field], `report.${field}`, errors);
  }

  const diagrams = report.diagrams;
  if (diagrams !== undefined && diagrams !== null) {
    if (!Array.isArray(diagrams)) {
      errors.push("diagrams must be an array");
    } else {
      diagrams.forEach((diagram, index) => {
        const prefix = `diagrams[${index}]`;
        if (!isRecord(diagram)) {
          errors.push(`${prefix} must be an object`);
          return;
        }
        requireString(diagram.id, `${prefix}.id`, errors);
        requireString(diagram.title, `${prefix}.title`, errors);
        if (!("mermaid" in diagram)) {
          errors.push(`${prefix} missing required field: mermaid`);
        } else {
          requireNonEmptyString(diagram.mermaid, `${prefix}.mermaid`, errors);
        }
      });
    }
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

  const verifications = report.verifications;
  if (verifications !== undefined && verifications !== null) {
    if (!Array.isArray(verifications)) {
      errors.push("verifications must be an array");
    } else {
      const seenFindingIds = new Set<string>();
      verifications.forEach((item, index) => {
        const prefix = `verifications[${index}]`;
        if (!isRecord(item)) {
          errors.push(`${prefix} must be an object`);
          return;
        }
        if (!requireNonEmptyString(item.findingId, `${prefix}.findingId`, errors)) {
          // continue
        } else {
          const findingId = item.findingId as string;
          if (!findingIds.has(findingId)) {
            errors.push(
              `${prefix}.findingId references unknown finding: ${findingId}`,
            );
          }
          if (seenFindingIds.has(findingId)) {
            errors.push(`duplicate verification for finding id: ${findingId}`);
          } else {
            seenFindingIds.add(findingId);
          }
        }
        const verdict = item.verdict;
        if (typeof verdict !== "string" || !VALID_VERDICTS.has(verdict)) {
          errors.push(
            `${prefix}.verdict must be one of ${[...VALID_VERDICTS].sort()}`,
          );
        }
        requireNonEmptyString(item.summary, `${prefix}.summary`, errors);
        requireNonEmptyString(item.evidence, `${prefix}.evidence`, errors);
      });
    }
  }

  return errors;
};

export const mergeVerifications = (
  report: Record<string, unknown>,
  incoming: unknown,
): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...report };
  let list: unknown[] = [];
  if (Array.isArray(incoming)) {
    list = incoming;
  } else if (isRecord(incoming) && Array.isArray(incoming.verifications)) {
    list = incoming.verifications;
  } else {
    throw new Error(
      "verification input must be an array or { verifications: [] }",
    );
  }

  const byId = new Map<string, Record<string, unknown>>();
  const existing = Array.isArray(next.verifications) ? next.verifications : [];
  existing.forEach((item) => {
    if (isRecord(item) && typeof item.findingId === "string") {
      byId.set(item.findingId, { ...item });
    }
  });
  list.forEach((item) => {
    if (isRecord(item) && typeof item.findingId === "string") {
      byId.set(item.findingId, { ...item });
    }
  });
  next.verifications = [...byId.values()];
  return next;
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
  if (normalized.verifications === undefined) {
    normalized.verifications = [];
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
      color-scheme: light;
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
    .overview {
      margin-top: 1rem;
      padding: 0.9rem 1rem;
      background: var(--badge-bg);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
    }
    .overview h2 {
      margin: 0 0 0.5rem;
      font-size: 1.05rem;
      line-height: 1.4;
      font-weight: 700;
      letter-spacing: 0.01em;
      border-left: 3px solid var(--accent);
      padding-left: 0.55rem;
    }
    .overview-text {
      margin: 0 0 0.75rem;
      line-height: 1.7;
      white-space: pre-wrap;
    }
    .overview-stats {
      display: flex; flex-wrap: wrap; gap: 0.5rem;
      margin: 0 0 0.75rem;
    }
    .overview-stat {
      font-size: 0.85rem;
      line-height: 1.4;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: var(--panel);
      border: 1px solid var(--border);
    }
    .overview-groups {
      margin: 0;
      padding-left: 1.2rem;
      line-height: 1.65;
    }
    .overview-groups > li { margin: 0.35rem 0; }
    .overview-group-title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      font-weight: 600;
    }
    .overview-findings {
      margin: 0.25rem 0 0;
      padding-left: 1.1rem;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .overview-findings li { margin: 0.15rem 0; }
    .overview-empty { margin: 0; color: var(--muted); font-size: 0.9rem; }
    .diagrams { margin-top: 0.9rem; display: grid; gap: 0.75rem; }
    .diagram-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.75rem;
      overflow-x: auto;
    }
    .diagram-card h3 {
      margin: 0 0 0.5rem;
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .diagram-card .mermaid {
      display: flex;
      justify-content: center;
      margin: 0;
      overflow-x: auto;
    }
    .diagram-card .mermaid svg { max-width: 100%; height: auto; }
    .diagram-fallback {
      margin: 0;
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--muted);
    }
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
    .finding-location { margin: 0 0 0.55rem; }
    .finding-location strong,
    .finding-field strong {
      display: block;
      margin-bottom: 0.15rem;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .finding-location code {
      display: inline-block;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.85rem;
      letter-spacing: 0;
      overflow-wrap: anywhere;
      padding: 0.15rem 0.4rem;
      border-radius: 0.3rem;
      background: var(--badge-bg);
      border: 1px solid var(--border);
    }
    .finding-field { margin: 0 0 0.45rem; }
    .badge {
      font-size: 0.7rem; font-weight: 600;
      padding: 0.1rem 0.45rem; border-radius: 999px;
      background: var(--badge-bg); border: 1px solid var(--border);
      line-height: 1.3;
    }
    .badge-plan-only { color: var(--high); border-color: var(--high); }
    .verdict-badge {
      font-size: 0.7rem; font-weight: 700;
      padding: 0.1rem 0.45rem; border-radius: 999px;
      border: 1px solid var(--border);
      line-height: 1.3;
    }
    .verdict-confirmed { color: var(--low); border-color: var(--low); background: #ecfdf5; }
    .verdict-contradicted { color: var(--critical); border-color: var(--critical); background: var(--needs-bg); }
    .verdict-partial { color: var(--medium); border-color: var(--medium); background: #fffbeb; }
    .verdict-inconclusive { color: var(--muted); border-color: var(--border); background: var(--badge-bg); }
    .verification-box {
      margin: 0.5rem 0 0.65rem;
      padding: 0.55rem 0.65rem;
      border-radius: 0.4rem;
      border: 1px solid var(--border);
      background: var(--badge-bg);
      line-height: 1.55;
      font-size: 0.9rem;
    }
    .verification-box strong {
      display: block;
      margin-bottom: 0.15rem;
      font-size: 0.8rem;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .packet-scope {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin: 0.5rem 0 0.75rem;
      font-size: 0.9rem;
    }
    .packet-scope label { display: inline-flex; gap: 0.3rem; align-items: center; cursor: pointer; }
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
      .overview h2 { font-size: 1rem; }
      .group-header h2 { font-size: 1.05rem; }
      footer h2 { font-size: 1.05rem; }
    }
  </style>
</head>
<body>
  <header>
    <h1 id="report-title"></h1>
    <div class="meta" id="report-meta"></div>
    <section class="overview" id="overview" aria-labelledby="overview-heading"></section>
    <div class="summary" id="summary"></div>
  </header>
  <main id="groups"></main>
  <footer>
    <h2>全体コメント</h2>
    <textarea id="global-comment" class="comment-box" placeholder="レビュー全体へのコメント"></textarea>
    <h2>裏取りパケット</h2>
    <p class="meta">指摘の事実確認用パケットです。人間の採用/却下/要調査は含めません。コピーして対象リポジトリの Cursor で「裏取りして」と一緒に貼ると、review-verify skill が検証→マージ→HTML再生成まで行います。</p>
    <div class="packet-scope" id="verification-scope">
      <span>対象:</span>
      <label><input type="radio" name="verification-scope" value="accepted-investigate-pending" checked> 採用 + 要調査 + 未判定</label>
      <label><input type="radio" name="verification-scope" value="accepted-investigate"> 採用 + 要調査</label>
      <label><input type="radio" name="verification-scope" value="investigate"> 要調査のみ</label>
      <label><input type="radio" name="verification-scope" value="accepted"> 採用のみ</label>
      <label><input type="radio" name="verification-scope" value="pending"> 未判定のみ</label>
      <label><input type="radio" name="verification-scope" value="all"> すべて</label>
    </div>
    <div class="actions">
      <button type="button" id="generate-verification-packet">裏取りパケットを生成</button>
      <button type="button" id="copy-verification-packet" class="secondary">パケットをコピー</button>
    </div>
    <textarea id="verification-output" class="feedback-output" readonly rows="10" placeholder="裏取り用 JSON パケットを生成します"></textarea>
    <h2>フィードバック生成</h2>
    <p class="meta">採用された指摘と人間コメントを、元の作業セッションへ渡す Markdown にまとめます。裏取り結果があれば併記します。</p>
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
    const DECISIONS = ['accepted', 'investigate', 'rejected', 'pending'];
    const DECISION_LABELS = {
      accepted: '採用',
      investigate: '要調査',
      rejected: '却下',
      pending: '未判定',
    };
    const SEVERITY_LABELS = { critical: '[重大]', high: '[警告]', medium: '[注意]', low: '[情報]' };
    const RISK_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
    const VERDICT_LABELS = {
      confirmed: '事実:確認',
      contradicted: '事実:誤り',
      partial: '事実:一部',
      inconclusive: '事実:不明',
    };
    const findingCards = new Map();
    const verificationByFindingId = (function() {
      const map = Object.create(null);
      (REPORT.verifications || []).forEach(function(item) {
        if (item && typeof item.findingId === 'string') {
          map[item.findingId] = item;
        }
      });
      return map;
    })();

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

    function countByRisk(items, key) {
      const counts = { critical: 0, high: 0, medium: 0, low: 0 };
      items.forEach(function(item) {
        const risk = item[key];
        if (Object.prototype.hasOwnProperty.call(counts, risk)) counts[risk]++;
      });
      return counts;
    }

    function formatCountChips(counts, totalLabel) {
      const parts = [];
      var total = 0;
      ['critical', 'high', 'medium', 'low'].forEach(function(risk) {
        total += counts[risk];
        if (counts[risk] > 0) {
          parts.push(RISK_LABELS[risk] + ' ' + counts[risk]);
        }
      });
      return totalLabel + ' ' + total + (parts.length ? '（' + parts.join(' / ') + '）' : '');
    }

    function mermaidEscapeLabel(text, maxLen) {
      var label = String(text || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/"/g, "'")
        .replace(/[\[\]{}|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      var limit = maxLen || 42;
      if (label.length > limit) label = label.slice(0, limit - 1) + '…';
      return label || '(untitled)';
    }

    function buildOverviewMermaid(groups) {
      var lines = ['flowchart TB'];
      var riskBuckets = { critical: [], high: [], medium: [], low: [] };
      groups.forEach(function(group, groupIndex) {
        var risk = Object.prototype.hasOwnProperty.call(riskBuckets, group.risk)
          ? group.risk
          : 'low';
        riskBuckets[risk].push({ group: group, groupIndex: groupIndex });
      });

      ['critical', 'high', 'medium', 'low'].forEach(function(risk) {
        var bucket = riskBuckets[risk];
        if (!bucket.length) return;
        var subgraphId = 'risk_' + risk;
        lines.push('  subgraph ' + subgraphId + '["' + RISK_LABELS[risk] + '"]');
        lines.push('    direction TB');
        bucket.forEach(function(entry) {
          var groupNode = 'G' + entry.groupIndex;
          lines.push(
            '    ' + groupNode + '["' + mermaidEscapeLabel(entry.group.title, 36) + '"]',
          );
          (entry.group.findings || []).forEach(function(finding, findingIndex) {
            var findingNode = groupNode + 'F' + findingIndex;
            var findingLabel =
              (SEVERITY_LABELS[finding.severity] || SEVERITY_LABELS.low) +
              ' ' +
              mermaidEscapeLabel(finding.title, 34);
            lines.push('    ' + findingNode + '["' + findingLabel + '"]');
            lines.push('    ' + groupNode + ' --> ' + findingNode);
          });
        });
        lines.push('  end');
      });

      return lines.join(String.fromCharCode(10));
    }

    function appendDiagramCard(container, title, mermaidSource) {
      var card = el('div', 'diagram-card');
      if (title) card.appendChild(el('h3', null, title));
      var pre = el('pre', 'mermaid');
      pre.textContent = mermaidSource;
      card.appendChild(pre);
      container.appendChild(card);
      return card;
    }

    function collectDiagrams(groups) {
      var diagrams = [];
      if (groups.length) {
        diagrams.push({
          title: '変更グループと指摘の関係',
          mermaid: buildOverviewMermaid(groups),
        });
      }
      (REPORT.diagrams || []).forEach(function(diagram, index) {
        if (!diagram || typeof diagram.mermaid !== 'string' || !diagram.mermaid.trim()) return;
        diagrams.push({
          title: diagram.title || ('図 ' + (index + 1)),
          mermaid: diagram.mermaid.trim(),
        });
      });
      return diagrams;
    }

    function loadMermaid() {
      if (window.mermaid) return Promise.resolve(window.mermaid);
      return new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js';
        script.async = true;
        script.onload = function() {
          if (window.mermaid) resolve(window.mermaid);
          else reject(new Error('mermaid global missing'));
        };
        script.onerror = function() {
          reject(new Error('failed to load mermaid'));
        };
        document.head.appendChild(script);
      });
    }

    function renderMermaidDiagrams() {
      var nodes = Array.prototype.slice.call(document.querySelectorAll('.diagram-card .mermaid'));
      if (!nodes.length) return Promise.resolve();
      return loadMermaid().then(function(mermaid) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'default',
          flowchart: { htmlLabels: false, curve: 'basis' },
        });
        return mermaid.run({ nodes: nodes });
      }).catch(function() {
        nodes.forEach(function(node) {
          node.classList.remove('mermaid');
          node.classList.add('diagram-fallback');
        });
      });
    }

    function renderOverview() {
      const root = document.getElementById('overview');
      root.replaceChildren();
      const heading = el('h2', null, '概要');
      heading.id = 'overview-heading';
      root.appendChild(heading);

      const overviewText = typeof REPORT.overview === 'string' ? REPORT.overview.trim() : '';
      if (overviewText) {
        root.appendChild(el('p', 'overview-text', overviewText));
      }

      const groups = REPORT.groups || [];
      const allFindings = [];
      groups.forEach(function(group) {
        (group.findings || []).forEach(function(finding) {
          allFindings.push(finding);
        });
      });

      const groupCounts = countByRisk(groups, 'risk');
      const findingCounts = countByRisk(allFindings, 'severity');
      const stats = el('div', 'overview-stats');
      stats.appendChild(el('span', 'overview-stat', formatCountChips(groupCounts, '変更グループ')));
      stats.appendChild(el('span', 'overview-stat', formatCountChips(findingCounts, '指摘')));
      root.appendChild(stats);

      var diagrams = collectDiagrams(groups);
      if (diagrams.length) {
        var diagramsRoot = el('div', 'diagrams');
        diagrams.forEach(function(diagram) {
          appendDiagramCard(diagramsRoot, diagram.title, diagram.mermaid);
        });
        root.appendChild(diagramsRoot);
      }

      if (!groups.length) {
        root.appendChild(el('p', 'overview-empty', '変更グループはありません。'));
        return;
      }

      const list = el('ol', 'overview-groups');
      groups.forEach(function(group) {
        const item = el('li', null);
        const title = el('div', 'overview-group-title');
        title.appendChild(el('span', 'risk-badge ' + (RISK_CLASS[group.risk] || ''), group.risk));
        title.appendChild(document.createTextNode(group.title || ''));
        item.appendChild(title);

        const findings = group.findings || [];
        if (findings.length) {
          const findingList = el('ul', 'overview-findings');
          findings.forEach(function(finding) {
            const findingItem = el('li', null);
            const severity = SEVERITY_LABELS[finding.severity] || SEVERITY_LABELS.low;
            findingItem.appendChild(document.createTextNode(severity + ' ' + (finding.title || '')));
            findingList.appendChild(findingItem);
          });
          item.appendChild(findingList);
        } else {
          item.appendChild(el('div', 'overview-empty', '指摘なし'));
        }
        list.appendChild(item);
      });
      root.appendChild(list);
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
      let accepted = 0, investigate = 0, rejected = 0, pending = 0, comments = 0;
      let verified = 0, contradicted = 0, unverified = 0;
      REPORT.groups.forEach(function(group) {
        (group.findings || []).forEach(function(f) {
          const d = state.findings[f.id] || 'pending';
          if (d === 'accepted') accepted++;
          else if (d === 'investigate') investigate++;
          else if (d === 'rejected') rejected++;
          else pending++;
          const verification = verificationByFindingId[f.id];
          if (!verification) unverified++;
          else if (verification.verdict === 'confirmed') verified++;
          else if (verification.verdict === 'contradicted') contradicted++;
        });
        if ((state.groupComments[group.id] || '').trim()) comments++;
      });
      if ((state.globalComment || '').trim()) comments++;
      const summary = document.getElementById('summary');
      summary.replaceChildren();
      [
        ['採用', accepted],
        ['要調査', investigate],
        ['却下', rejected],
        ['未判定', pending],
        ['事実確認', verified],
        ['事実誤り', contradicted],
        ['未裏取り', unverified],
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
          const verification = verificationByFindingId[finding.id];
          if (verification && verification.verdict) {
            const verdictClass = 'verdict-badge verdict-' + verification.verdict;
            const verdictLabel = VERDICT_LABELS[verification.verdict] || verification.verdict;
            head.appendChild(el('span', verdictClass, verdictLabel));
          }
          card.appendChild(head);

          if (finding.location) {
            const loc = el('div', 'finding-location');
            loc.appendChild(el('strong', null, '場所'));
            loc.appendChild(el('code', null, finding.location));
            card.appendChild(loc);
          }
          if (finding.problem) {
            const p = el('div', 'finding-field');
            p.appendChild(el('strong', null, '指摘'));
            p.appendChild(document.createTextNode(finding.problem));
            card.appendChild(p);
          }
          if (finding.evidence) {
            const p = el('div', 'finding-field');
            p.appendChild(el('strong', null, '根拠'));
            p.appendChild(document.createTextNode(finding.evidence));
            card.appendChild(p);
          }
          if (finding.suggestion) {
            const p = el('div', 'finding-field');
            p.appendChild(el('strong', null, '改善案'));
            p.appendChild(document.createTextNode(finding.suggestion));
            card.appendChild(p);
          }
          if (verification) {
            const box = el('div', 'verification-box');
            box.appendChild(el('strong', null, '裏取り'));
            const verdictLabel = VERDICT_LABELS[verification.verdict] || verification.verdict;
            box.appendChild(document.createTextNode(verdictLabel + ' — ' + (verification.summary || '')));
            if (verification.evidence) {
              box.appendChild(document.createElement('br'));
              box.appendChild(document.createTextNode(verification.evidence));
            }
            card.appendChild(box);
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

    function getVerificationScope() {
      const checked = document.querySelector('input[name="verification-scope"]:checked');
      return checked && checked.value ? checked.value : 'accepted-investigate-pending';
    }

    function findingMatchesScope(decision, scope) {
      if (scope === 'all') return true;
      if (scope === 'accepted') return decision === 'accepted';
      if (scope === 'investigate') return decision === 'investigate';
      if (scope === 'pending') return decision === 'pending';
      if (scope === 'accepted-investigate') {
        return decision === 'accepted' || decision === 'investigate';
      }
      // accepted-investigate-pending (default)
      return (
        decision === 'accepted' ||
        decision === 'investigate' ||
        decision === 'pending'
      );
    }

    function appendFindingMarkdown(lines, f, group, n, prefix) {
      const severityLabel = SEVERITY_LABELS[f.severity] || SEVERITY_LABELS.low;
      lines.push('### ' + n + '. ' + severityLabel + ' ' + f.title);
      if (prefix) lines.push('- 判定: ' + prefix);
      if (f.location) lines.push('- 場所: ' + f.location);
      lines.push('- 変更グループの意図: ' + (group.intent || ''));
      if (f.planOnly === true) {
        lines.push('- 備考: plan を読まないと判定できない指摘です。');
      } else if (f.source === 'both') {
        lines.push('- 備考: blind レビューと plan 照合の両方で検出。');
      } else if (f.source === 'plan-aware') {
        lines.push('- 備考: plan 照合で検出。');
      }
      const verification = verificationByFindingId[f.id];
      if (verification) {
        const verdictLabel = VERDICT_LABELS[verification.verdict] || verification.verdict;
        lines.push('- 裏取り: ' + verdictLabel + ' — ' + (verification.summary || ''));
        if (verification.evidence) {
          lines.push('- 裏取り根拠: ' + verification.evidence);
        }
      } else {
        lines.push('- 裏取り: 未実施');
      }
      if (f.problem) lines.push('- 指摘: ' + f.problem);
      if (f.evidence) lines.push('- 根拠: ' + f.evidence);
      if (f.suggestion) lines.push('- 改善案: ' + f.suggestion);
      lines.push('');
    }

    function generateVerificationPacket() {
      const scope = getVerificationScope();
      const findings = [];
      REPORT.groups.forEach(function(group) {
        (group.findings || []).forEach(function(f) {
          const decision = state.findings[f.id] || 'pending';
          if (!findingMatchesScope(decision, scope)) return;
          findings.push({
            id: f.id,
            title: f.title,
            severity: f.severity,
            source: f.source,
            planOnly: f.planOnly === true,
            location: f.location || '',
            problem: f.problem,
            evidence: f.evidence,
            suggestion: f.suggestion,
            groupId: group.id,
            groupTitle: group.title,
            groupIntent: group.intent,
            files: group.files || [],
          });
        });
      });
      return JSON.stringify({
        packetType: 'verification-request',
        reportId: REPORT.reportId || '',
        title: REPORT.title || '',
        target: REPORT.target || '',
        scope: scope,
        note: '人間の採用/却下/要調査は意図的に含めていません。事実確認のみ行ってください。',
        findings: findings,
      }, null, 2) + '\n';
    }

    function generateFeedbackMarkdown() {
      const lines = ['# レビューフィードバック', ''];
      lines.push('## 依頼');
      lines.push('- 以下の指摘が忖度なしで妥当かどうか精査してください。妥当でないものは指摘してください。');
      lines.push('- 対応方針に迷う点があれば、実装前に確認してください。');
      lines.push('- 「指摘」セクションだけが実装対象です。却下・未判定は対応対象外です。');
      lines.push('- 「要調査」は実装せず、事実確認・追加調査だけ行ってください。');
      lines.push('- 裏取り結果が「事実:誤り」の採用指摘は、実装前に再確認してください。');
      lines.push('');
      if (REPORT.target) lines.push('対象: ' + REPORT.target);
      if (REPORT.plan && REPORT.plan.provided) {
        lines.push('Plan: ' + (REPORT.plan.label || ''));
      }
      lines.push('');

      const acceptedFindings = [];
      const investigateFindings = [];
      REPORT.groups.forEach(function(group) {
        (group.findings || []).forEach(function(f) {
          const decision = state.findings[f.id] || 'pending';
          if (decision === 'accepted') {
            acceptedFindings.push({ finding: f, group: group });
          } else if (decision === 'investigate') {
            investigateFindings.push({ finding: f, group: group });
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
          appendFindingMarkdown(lines, item.finding, item.group, idx + 1, null);
        });
      }

      if (investigateFindings.length) {
        lines.push('## 要調査');
        lines.push('');
        lines.push('実装対象外。事実関係の確認・追加調査のみ行ってください。');
        lines.push('');
        investigateFindings.forEach(function(item, idx) {
          appendFindingMarkdown(lines, item.finding, item.group, idx + 1, '要調査');
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

    renderOverview();
    renderGroups();
    updateSummary();
    renderMermaidDiagrams();

    document.getElementById('generate-feedback').addEventListener('click', function() {
      document.getElementById('feedback-output').value = generateFeedbackMarkdown();
    });

    document.getElementById('copy-feedback').addEventListener('click', function() {
      const text = generateFeedbackMarkdown();
      document.getElementById('feedback-output').value = text;
      copyText(text).catch(function() {});
    });

    document.getElementById('generate-verification-packet').addEventListener('click', function() {
      document.getElementById('verification-output').value = generateVerificationPacket();
      setCopyStatus('裏取りパケットを生成しました');
    });

    document.getElementById('copy-verification-packet').addEventListener('click', function() {
      const text = generateVerificationPacket();
      document.getElementById('verification-output').value = text;
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
