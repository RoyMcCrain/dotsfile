import {
  defaultReportId,
  validateReport,
} from "../../review-report/scripts/render_report.ts";

const IMPLEMENTATION_GROUP_KEYS = [
  "id",
  "title",
  "intent",
  "files",
  "diffs",
  "needsImprovement",
  "improvementReason",
  "initialComment",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pickImplementationGroup = (
  group: unknown,
): Record<string, unknown> => {
  const source = isRecord(group) ? group : {};
  const next: Record<string, unknown> = {};
  for (const key of IMPLEMENTATION_GROUP_KEYS) {
    if (key in source) next[key] = source[key];
  }
  if (!Array.isArray(next.files)) next.files = [];
  if (!Array.isArray(next.diffs)) next.diffs = [];
  return next;
};

export interface AssembleOptions {
  repository?: unknown;
  omitRepository?: boolean;
  title?: string;
  target?: string;
}

export const assembleReport = (
  stage0: unknown,
  options: AssembleOptions = {},
): Record<string, unknown> => {
  if (!isRecord(stage0)) {
    throw new Error("stage0 must be a JSON object");
  }

  const title = options.title ??
    (typeof stage0.title === "string" && stage0.title.trim()
      ? stage0.title
      : "Implementation report");
  const target = options.target ??
    (typeof stage0.target === "string" ? stage0.target : "@");
  const overview = typeof stage0.overview === "string" ? stage0.overview : "";
  const groups = Array.isArray(stage0.groups)
    ? stage0.groups.map(pickImplementationGroup)
    : [];

  const report: Record<string, unknown> = {
    title,
    target,
    overview,
    review: { performed: false, overview: "" },
    groups,
  };

  if (typeof stage0.initialComment === "string") {
    report.initialComment = stage0.initialComment;
  }
  if (stage0.diagrams !== undefined) report.diagrams = stage0.diagrams;

  if (typeof stage0.reportId === "string" && stage0.reportId.trim()) {
    report.reportId = stage0.reportId;
  } else {
    report.reportId = defaultReportId(report);
  }

  if (!options.omitRepository && options.repository !== undefined) {
    report.repository = options.repository;
  }

  const errors = validateReport(report);
  if (errors.length > 0) {
    throw new Error(`invalid report: ${errors.join("; ")}`);
  }
  return report;
};

const usage = () => {
  console.error(
    "usage: assemble_report.ts --stage0 result.json [--repository repository.json] [--omit-repository] [--title TITLE] [--target TARGET] -o report.json",
  );
};

const readJson = async (path: string): Promise<unknown> => {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text);
};

export const main = async (argv: string[]) => {
  let stage0Path: string | undefined;
  let repositoryPath: string | undefined;
  let output: string | undefined;
  let omitRepository = false;
  let title: string | undefined;
  let target: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--stage0") {
      stage0Path = argv[++i];
    } else if (arg === "--repository") {
      repositoryPath = argv[++i];
    } else if (arg === "--omit-repository") {
      omitRepository = true;
    } else if (arg === "--title") {
      title = argv[++i];
    } else if (arg === "--target") {
      target = argv[++i];
    } else if (arg === "-o" || arg === "--output") {
      output = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      usage();
      return 0;
    } else {
      console.error(`unknown argument: ${arg}`);
      usage();
      return 1;
    }
  }

  if (!stage0Path || !output) {
    usage();
    return 1;
  }
  if (omitRepository && repositoryPath) {
    console.error("use either --repository or --omit-repository");
    return 1;
  }
  if (!omitRepository && !repositoryPath) {
    console.error("specify --repository or --omit-repository");
    return 1;
  }

  let stage0: unknown;
  let repository: unknown;
  try {
    stage0 = await readJson(stage0Path);
    if (repositoryPath) {
      repository = await readJson(repositoryPath);
    }
  } catch (error) {
    console.error(
      `read/parse error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 1;
  }

  let report: Record<string, unknown>;
  try {
    report = assembleReport(stage0, {
      repository,
      omitRepository,
      title,
      target,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  try {
    await Deno.writeTextFile(output, `${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    console.error(
      `write error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  console.log(output);
  return 0;
};

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
