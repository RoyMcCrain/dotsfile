import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

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
  summary?: string;
  evidence?: string[];
}

interface IntentRequirement {
  id: string;
  title: string;
  description: string;
  kind: "must" | "constraint" | "non-goal";
}

interface IntentInfo {
  summary: string;
  source: string;
  requirements: IntentRequirement[];
}

interface AcceptanceEvidence {
  file: string;
  location?: string;
  explanation: string;
}

interface AcceptanceCheck {
  requirementId: string;
  status:
    | "satisfied"
    | "partial"
    | "missing"
    | "contradicted"
    | "unverified";
  explanation: string;
  evidence: AcceptanceEvidence[];
}

interface AcceptanceInfo {
  verdict: "pass" | "needs-confirmation" | "fail";
  summary: string;
  checks: AcceptanceCheck[];
  extras: Array<{ title: string; explanation: string; files: string[] }>;
  validations: Array<{
    command: string;
    status: "passed" | "failed" | "not-run";
    summary: string;
  }>;
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

interface ReviewInfo {
  performed: boolean;
  overview?: string;
}

type RepositoryChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed";

interface RepositoryChange {
  path: string;
  status: RepositoryChangeStatus;
  previousPath?: string;
}

interface RepositoryInfo {
  name: string;
  trackedFiles: string[];
  changes: RepositoryChange[];
}

interface ReviewReport {
  reportId?: string;
  title?: string;
  target?: string;
  overview?: string;
  intent?: IntentInfo;
  acceptance?: AcceptanceInfo;
  repository?: RepositoryInfo;
  review?: ReviewInfo;
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
const VALID_CHANGE_STATUSES = new Set<string>([
  "added",
  "modified",
  "deleted",
  "renamed",
]);
const VALID_REQUIREMENT_KINDS = new Set([
  "must",
  "constraint",
  "non-goal",
]);
const VALID_CHECK_STATUSES = new Set([
  "satisfied",
  "partial",
  "missing",
  "contradicted",
  "unverified",
]);
const VALID_ACCEPTANCE_VERDICTS = new Set([
  "pass",
  "needs-confirmation",
  "fail",
]);
const VALID_VALIDATION_STATUSES = new Set([
  "passed",
  "failed",
  "not-run",
]);
const EVIDENCE_REQUIRED_CHECK_STATUSES = new Set([
  "satisfied",
  "partial",
  "contradicted",
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
  options: { unique?: boolean; requireNonEmpty?: boolean } = {},
) => {
  const { unique = false, requireNonEmpty = false } = options;
  if (!Array.isArray(paths)) {
    errors.push(`${fieldPath} must be an array`);
    return;
  }
  if (requireNonEmpty && paths.length === 0) {
    errors.push(`${fieldPath} must be a non-empty array`);
  }
  const seen = new Set<string>();
  paths.forEach((path, index) => {
    const p = `${fieldPath}[${index}]`;
    if (!requireNonEmptyString(path, p, errors)) return;
    const text = path as string;
    if (isSecretPath(text)) {
      errors.push(`${p} references a secret path and must not be included`);
    }
    if (unique) {
      if (seen.has(text)) {
        errors.push(`duplicate tracked file path: ${text}`);
      } else {
        seen.add(text);
      }
    }
  });
};

const validateRepository = (repository: unknown, errors: string[]) => {
  if (repository === undefined || repository === null) return;
  if (!isRecord(repository)) {
    errors.push("repository must be an object");
    return;
  }

  requireNonEmptyString(repository.name, "repository.name", errors);
  validatePathList(
    repository.trackedFiles,
    "repository.trackedFiles",
    errors,
    { unique: true, requireNonEmpty: true },
  );

  const changes = repository.changes;
  if (!Array.isArray(changes)) {
    errors.push("repository.changes must be an array");
    return;
  }

  const changePaths = new Set<string>();
  changes.forEach((change, index) => {
    const prefix = `repository.changes[${index}]`;
    if (!isRecord(change)) {
      errors.push(`${prefix} must be an object`);
      return;
    }

    if (!requireNonEmptyString(change.path, `${prefix}.path`, errors)) {
      return;
    }
    const path = change.path as string;
    if (isSecretPath(path)) {
      errors.push(
        `${prefix}.path references a secret path and must not be included`,
      );
    }
    if (changePaths.has(path)) {
      errors.push(`duplicate change path: ${path}`);
    } else {
      changePaths.add(path);
    }

    const status = change.status;
    if (
      typeof status !== "string" || !VALID_CHANGE_STATUSES.has(status)
    ) {
      errors.push(
        `${prefix}.status must be one of ${[...VALID_CHANGE_STATUSES].sort()}`,
      );
    }

    if (status === "renamed") {
      if (
        !requireNonEmptyString(
          change.previousPath,
          `${prefix}.previousPath`,
          errors,
        )
      ) {
        errors.push(
          `${prefix} status=renamed requires a non-empty previousPath`,
        );
      } else if (isSecretPath(change.previousPath)) {
        errors.push(
          `${prefix}.previousPath references a secret path and must not be included`,
        );
      }
    } else {
      requireString(change.previousPath, `${prefix}.previousPath`, errors);
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

const isReviewPerformed = (report: Record<string, unknown>): boolean => {
  const review = report.review;
  if (review === undefined || review === null) return true;
  if (!isRecord(review)) return true;
  return review.performed !== false;
};

const implementationGroupIdentity = (group: unknown) => {
  if (!isRecord(group)) return group;
  return {
    id: group.id,
    title: group.title,
    intent: group.intent,
    needsImprovement: group.needsImprovement,
    improvementReason: group.improvementReason,
    files: group.files,
    diffs: group.diffs,
  };
};

const implementationReportIdentity = (report: Record<string, unknown>) => ({
  title: report.title,
  target: report.target,
  overview: report.overview,
  intent: report.intent,
  acceptance: report.acceptance,
  diagrams: report.diagrams,
  groups: Array.isArray(report.groups)
    ? report.groups.map(implementationGroupIdentity)
    : report.groups,
});

const isValidCheckRecord = (
  check: unknown,
): check is Record<string, unknown> => {
  if (!isRecord(check)) return false;
  const status = check.status;
  return typeof status === "string" && VALID_CHECK_STATUSES.has(status);
};

const isValidValidationRecord = (
  validation: unknown,
): validation is Record<string, unknown> => {
  if (!isRecord(validation)) return false;
  const status = validation.status;
  return typeof status === "string" && VALID_VALIDATION_STATUSES.has(status);
};

const evidenceReferencePath = (reference: string) => {
  const trimmed = reference.trim();
  const colon = trimmed.lastIndexOf(":");
  if (colon <= 0) return trimmed;
  return trimmed.slice(0, colon);
};

export const computeAcceptanceVerdict = (
  checks: unknown[],
  validations: unknown[],
  extras: unknown[],
): "pass" | "needs-confirmation" | "fail" => {
  for (const check of checks) {
    if (!isValidCheckRecord(check)) continue;
    const status = check.status;
    if (status === "missing" || status === "contradicted") {
      return "fail";
    }
  }
  for (const validation of validations) {
    if (!isValidValidationRecord(validation)) continue;
    if (validation.status === "failed") return "fail";
  }
  for (const check of checks) {
    if (!isValidCheckRecord(check)) return "needs-confirmation";
  }
  for (const validation of validations) {
    if (!isValidValidationRecord(validation)) return "needs-confirmation";
  }
  for (const check of checks) {
    if (!isValidCheckRecord(check)) continue;
    if (check.status === "partial" || check.status === "unverified") {
      return "needs-confirmation";
    }
  }
  if (extras.length > 0) return "needs-confirmation";
  for (const validation of validations) {
    if (!isValidValidationRecord(validation)) continue;
    if (validation.status === "not-run") return "needs-confirmation";
  }
  if (validations.length === 0) return "needs-confirmation";
  return "pass";
};

const validateAcceptanceEvidence = (
  evidence: unknown,
  fieldPath: string,
  errors: string[],
) => {
  if (!Array.isArray(evidence)) {
    errors.push(`${fieldPath} must be an array`);
    return;
  }
  evidence.forEach((item, index) => {
    const prefix = `${fieldPath}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!requireNonEmptyString(item.file, `${prefix}.file`, errors)) return;
    const filePath = item.file as string;
    if (isSecretPath(filePath)) {
      errors.push(
        `${prefix}.file references a secret path and must not be included`,
      );
    }
    requireString(item.location, `${prefix}.location`, errors);
    requireNonEmptyString(item.explanation, `${prefix}.explanation`, errors);
  });
};

const validateIntent = (intent: unknown, errors: string[]) => {
  if (!isRecord(intent)) {
    errors.push("intent must be an object");
    return null;
  }
  requireNonEmptyString(intent.summary, "intent.summary", errors);
  requireNonEmptyString(intent.source, "intent.source", errors);
  const requirements = intent.requirements;
  if (!Array.isArray(requirements)) {
    errors.push("intent.requirements must be an array");
    return null;
  }
  if (requirements.length === 0) {
    errors.push("intent.requirements must be a non-empty array");
  }
  const requirementIds = new Set<string>();
  requirements.forEach((requirement, index) => {
    const prefix = `intent.requirements[${index}]`;
    if (!isRecord(requirement)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    checkUniqueId(
      requirement.id,
      requirementIds,
      "duplicate intent requirement id: {}",
      `${prefix}.id`,
      errors,
    );
    requireNonEmptyString(requirement.title, `${prefix}.title`, errors);
    requireNonEmptyString(
      requirement.description,
      `${prefix}.description`,
      errors,
    );
    const kind = requirement.kind;
    if (typeof kind !== "string" || !VALID_REQUIREMENT_KINDS.has(kind)) {
      errors.push(
        `${prefix}.kind must be one of ${[...VALID_REQUIREMENT_KINDS].sort()}`,
      );
    }
  });
  return requirementIds;
};

const validateAcceptance = (
  acceptance: unknown,
  requirementIds: Set<string>,
  errors: string[],
) => {
  if (!isRecord(acceptance)) {
    errors.push("acceptance must be an object");
    return;
  }
  const verdict = acceptance.verdict;
  if (
    typeof verdict !== "string" || !VALID_ACCEPTANCE_VERDICTS.has(verdict)
  ) {
    errors.push(
      `acceptance.verdict must be one of ${
        [...VALID_ACCEPTANCE_VERDICTS].sort()
      }`,
    );
  }
  requireNonEmptyString(acceptance.summary, "acceptance.summary", errors);

  const checks = acceptance.checks;
  if (!Array.isArray(checks)) {
    errors.push("acceptance.checks must be an array");
  } else {
    const seenRequirementIds = new Set<string>();
    checks.forEach((check, index) => {
      const prefix = `acceptance.checks[${index}]`;
      if (!isRecord(check)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (
        !requireNonEmptyString(
          check.requirementId,
          `${prefix}.requirementId`,
          errors,
        )
      ) {
        return;
      }
      const requirementId = check.requirementId as string;
      if (!requirementIds.has(requirementId)) {
        errors.push(
          `${prefix}.requirementId references unknown requirement: ${requirementId}`,
        );
      }
      if (seenRequirementIds.has(requirementId)) {
        errors.push(
          `duplicate acceptance check for requirement id: ${requirementId}`,
        );
      } else {
        seenRequirementIds.add(requirementId);
      }
      const status = check.status;
      if (typeof status !== "string" || !VALID_CHECK_STATUSES.has(status)) {
        errors.push(
          `${prefix}.status must be one of ${[...VALID_CHECK_STATUSES].sort()}`,
        );
      }
      requireNonEmptyString(check.explanation, `${prefix}.explanation`, errors);
      const evidence = check.evidence;
      if (!Array.isArray(evidence)) {
        errors.push(`${prefix}.evidence must be an array`);
      } else if (
        EVIDENCE_REQUIRED_CHECK_STATUSES.has(status as string) &&
        evidence.length === 0
      ) {
        errors.push(
          `${prefix}.evidence must be a non-empty array when status=${status}`,
        );
      } else {
        validateAcceptanceEvidence(evidence, `${prefix}.evidence`, errors);
      }
    });
    requirementIds.forEach((id) => {
      if (!seenRequirementIds.has(id)) {
        errors.push(`missing acceptance check for requirement id: ${id}`);
      }
    });
  }

  const extras = acceptance.extras;
  if (!Array.isArray(extras)) {
    errors.push("acceptance.extras must be an array");
  } else {
    extras.forEach((extra, index) => {
      const prefix = `acceptance.extras[${index}]`;
      if (!isRecord(extra)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      requireNonEmptyString(extra.title, `${prefix}.title`, errors);
      requireNonEmptyString(extra.explanation, `${prefix}.explanation`, errors);
      validatePathList(extra.files, `${prefix}.files`, errors);
    });
  }

  const validations = acceptance.validations;
  if (!Array.isArray(validations)) {
    errors.push("acceptance.validations must be an array");
  } else {
    validations.forEach((validation, index) => {
      const prefix = `acceptance.validations[${index}]`;
      if (!isRecord(validation)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      requireNonEmptyString(validation.command, `${prefix}.command`, errors);
      const validationStatus = validation.status;
      if (
        typeof validationStatus !== "string" ||
        !VALID_VALIDATION_STATUSES.has(validationStatus)
      ) {
        errors.push(
          `${prefix}.status must be one of ${
            [...VALID_VALIDATION_STATUSES].sort()
          }`,
        );
      }
      requireNonEmptyString(validation.summary, `${prefix}.summary`, errors);
    });
  }

  const allChecksValid = Array.isArray(checks) &&
    checks.every(isValidCheckRecord);
  const allValidationsValid = Array.isArray(validations) &&
    validations.every(isValidValidationRecord);
  if (
    allChecksValid && allValidationsValid &&
    typeof verdict === "string" && VALID_ACCEPTANCE_VERDICTS.has(verdict)
  ) {
    const expected = computeAcceptanceVerdict(
      checks,
      validations,
      Array.isArray(extras) ? extras : [],
    );
    if (verdict !== expected) {
      errors.push(
        `acceptance.verdict must be ${expected} based on checks/validations/extras (got ${verdict})`,
      );
    }
  }
};

export const defaultReportId = (report: Record<string, unknown>) => {
  if (report.reportId) {
    return String(report.reportId);
  }
  const seed = stableStringify(implementationReportIdentity(report));
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
      const hasIntent = report.intent !== undefined && report.intent !== null;
      const hasAcceptance = report.acceptance !== undefined &&
        report.acceptance !== null;
      if (hasIntent && hasAcceptance && diagrams.length > 2) {
        errors.push(
          "diagrams must contain at most 2 items for acceptance reports",
        );
      }
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
        requireString(diagram.summary, `${prefix}.summary`, errors);
        if (diagram.evidence !== undefined && diagram.evidence !== null) {
          if (!Array.isArray(diagram.evidence)) {
            errors.push(`${prefix}.evidence must be an array`);
          } else {
            diagram.evidence.forEach((item, evidenceIndex) => {
              const evidencePath = `${prefix}.evidence[${evidenceIndex}]`;
              if (typeof item !== "string" || !item.trim()) {
                errors.push(`${evidencePath} must be a non-empty string`);
                return;
              }
              const filePath = evidenceReferencePath(item);
              if (isSecretPath(filePath)) {
                errors.push(
                  `${evidencePath} references a secret path and must not be included`,
                );
              }
            });
          }
        }
      });
    }
  }

  const hasIntent = report.intent !== undefined && report.intent !== null;
  const hasAcceptance = report.acceptance !== undefined &&
    report.acceptance !== null;
  if (hasIntent !== hasAcceptance) {
    if (hasIntent) {
      errors.push("acceptance is required when intent is present");
    } else {
      errors.push("intent is required when acceptance is present");
    }
  } else if (hasIntent && hasAcceptance) {
    const requirementIds = validateIntent(report.intent, errors) ??
      new Set<string>();
    validateAcceptance(report.acceptance, requirementIds, errors);
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

  const review = report.review;
  if (review !== undefined && review !== null) {
    if (!isRecord(review)) {
      errors.push("review must be an object");
    } else {
      if (!("performed" in review)) {
        errors.push("review missing required field: performed");
      } else if (typeof review.performed !== "boolean") {
        errors.push("review.performed must be a boolean");
      }
      requireString(review.overview, "review.overview", errors);
    }
  }

  const performed = isReviewPerformed(report);

  validateRepository(report.repository, errors);

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

    const requiredFields = performed
      ? [
        "id",
        "title",
        "intent",
        "risk",
        "riskReason",
        "files",
        "diffs",
        "findings",
      ] as const
      : ["id", "title", "intent", "files", "diffs"] as const;

    for (const field of requiredFields) {
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

    requireNonEmptyString(group.title, `${prefix}.title`, errors);
    requireNonEmptyString(group.intent, `${prefix}.intent`, errors);

    if (performed) {
      requireNonEmptyString(group.riskReason, `${prefix}.riskReason`, errors);

      const risk = group.risk;
      if (typeof risk !== "string" || !VALID_RISKS.has(risk)) {
        errors.push(
          `${prefix}.risk must be one of ${[...VALID_RISKS].sort()}`,
        );
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
    } else {
      if ("risk" in group) {
        const risk = group.risk;
        if (typeof risk !== "string" || !VALID_RISKS.has(risk)) {
          errors.push(
            `${prefix}.risk must be one of ${[...VALID_RISKS].sort()}`,
          );
        }
      }

      if ("riskReason" in group) {
        requireNonEmptyString(group.riskReason, `${prefix}.riskReason`, errors);
      }

      if ("riskScore" in group) {
        let score: unknown = group.riskScore ?? 0;
        if (score === null) score = 0;
        if (typeof score === "boolean") {
          errors.push(`${prefix}.riskScore must be numeric`);
        } else if (!isFiniteNumber(score)) {
          errors.push(`${prefix}.riskScore must be a finite number`);
        } else if (score < 0 || score > 100) {
          errors.push(`${prefix}.riskScore must be between 0 and 100`);
        }
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

      if ("findings" in group) {
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
  });

  const verifications = report.verifications;
  if (!performed) {
    if (verifications !== undefined && verifications !== null) {
      if (!Array.isArray(verifications)) {
        errors.push("verifications must be an array");
      } else if (verifications.length > 0) {
        errors.push(
          "verifications must be absent or empty when review.performed is false",
        );
      }
    }
    return errors;
  }

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
        if (
          !requireNonEmptyString(item.findingId, `${prefix}.findingId`, errors)
        ) {
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

  const reviewInput = normalized.review;
  let performed = true;
  let reviewOverview: string | undefined;
  if (
    reviewInput !== undefined && reviewInput !== null && isRecord(reviewInput)
  ) {
    performed = reviewInput.performed !== false;
    if (typeof reviewInput.overview === "string") {
      reviewOverview = reviewInput.overview;
    }
  }
  normalized.review = reviewOverview !== undefined
    ? { performed, overview: reviewOverview }
    : { performed };

  const groups = (normalized.groups as Record<string, unknown>[] | undefined) ??
    [];
  normalized.groups = groups.map((group) => {
    const g: Record<string, unknown> = { ...group };
    if (g.files === undefined) g.files = [];
    if (g.diffs === undefined) g.diffs = [];
    if (performed) {
      if (g.riskScore === undefined) g.riskScore = 0;
      g.findings = sortFindings(
        (g.findings as Record<string, unknown>[]) ?? [],
      );
    } else if (g.findings === undefined) {
      g.findings = [];
    }
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

const HTML_TEMPLATE = readFileSync(
  new URL("../assets/report.html", import.meta.url),
  "utf8",
);

export const renderHtml = (report: Record<string, unknown>) => {
  const normalized = normalizeReport(report);
  const payload = escapeJsonForScript(normalized);
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
    const text = await readFile(input, "utf8");
    report = JSON.parse(text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
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
    await writeFile(outPath, html);
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
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
