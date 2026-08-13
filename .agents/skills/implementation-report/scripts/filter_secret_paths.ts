import { isSecretPath } from "../../review-report/scripts/render_report.ts";

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export interface PathChange {
  path: string;
  status: ChangeStatus;
  previousPath?: string;
}

export const isSecretChange = (change: PathChange) =>
  isSecretPath(change.path) || isSecretPath(change.previousPath);

export const classifyChanges = (changes: PathChange[]) => {
  const allowed: PathChange[] = [];
  const excluded: PathChange[] = [];
  for (const change of changes) {
    if (isSecretChange(change)) {
      excluded.push(change);
    } else {
      allowed.push(change);
    }
  }
  return { allowed, excluded };
};

export const toPublicChange = (change: PathChange): PathChange => {
  if (change.status === "renamed") {
    return {
      path: change.path,
      status: "renamed",
      previousPath: change.previousPath,
    };
  }
  return { path: change.path, status: change.status };
};

export const parseGitNameStatus = (text: string): PathChange[] => {
  if (text.includes("\0")) {
    const tokens = text.split("\0").filter((token) => token.length > 0);
    const changes: PathChange[] = [];
    for (let i = 0; i < tokens.length;) {
      const code = tokens[i++] ?? "";
      if (code.startsWith("R") || code.startsWith("C")) {
        const previousPath = tokens[i++] ?? "";
        const path = tokens[i++] ?? "";
        if (!path) continue;
        changes.push(
          code.startsWith("R")
            ? { path, status: "renamed", previousPath }
            : { path, status: "added", previousPath },
        );
        continue;
      }
      const path = tokens[i++] ?? "";
      if (!path) continue;
      if (code.startsWith("A")) {
        changes.push({ path, status: "added" });
      } else if (code.startsWith("D")) {
        changes.push({ path, status: "deleted" });
      } else {
        changes.push({ path, status: "modified" });
      }
    }
    return changes;
  }

  const changes: PathChange[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0] ?? "";
    if ((code.startsWith("R") || code.startsWith("C")) && parts.length >= 3) {
      const previousPath = parts[1] ?? "";
      const path = parts[2] ?? "";
      if (!path) continue;
      changes.push(
        code.startsWith("R")
          ? { path, status: "renamed", previousPath }
          : { path, status: "added", previousPath },
      );
      continue;
    }
    const path = parts[1] ?? "";
    if (!path) continue;
    if (code.startsWith("A")) {
      changes.push({ path, status: "added" });
    } else if (code.startsWith("D")) {
      changes.push({ path, status: "deleted" });
    } else {
      changes.push({ path, status: "modified" });
    }
  }
  return changes;
};

export const parseJjTemplateStatus = (text: string): PathChange[] => {
  const changes: PathChange[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    const [status, source = "", target = ""] = line.split("\t");
    if (status === "renamed") {
      if (!target) continue;
      changes.push({ path: target, status: "renamed", previousPath: source });
    } else if (status === "copied") {
      if (!target) continue;
      changes.push({ path: target, status: "added", previousPath: source });
    } else if (status === "removed") {
      const path = source || target;
      if (!path) continue;
      changes.push({ path, status: "deleted" });
    } else if (status === "added") {
      const path = target || source;
      if (!path) continue;
      changes.push({ path, status: "added" });
    } else if (status === "modified") {
      const path = target || source;
      if (!path) continue;
      changes.push({ path, status: "modified" });
    } else {
      throw new Error(`unknown jj status: ${status}`);
    }
  }
  return changes;
};

export const currentPaths = (changes: PathChange[]) => {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const change of changes) {
    if (!change.path || seen.has(change.path)) continue;
    seen.add(change.path);
    paths.push(change.path);
  }
  return paths;
};

export const relatedPaths = (changes: PathChange[]) => {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const change of changes) {
    for (const path of [change.path, change.previousPath]) {
      if (!path || seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
  }
  return paths;
};

const writeLines = (path: string, lines: string[]) => {
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  Deno.writeTextFileSync(path, body);
};

const usage = () => {
  console.error(
    "usage: filter_secret_paths.ts --format git|jj --input FILE --allowed FILE --excluded FILE",
  );
};

export const main = (argv: string[]) => {
  let format: string | undefined;
  let input: string | undefined;
  let allowedPath: string | undefined;
  let excludedPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format") {
      format = argv[++i];
    } else if (arg === "--input") {
      input = argv[++i];
    } else if (arg === "--allowed") {
      allowedPath = argv[++i];
    } else if (arg === "--excluded") {
      excludedPath = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      usage();
      return 0;
    } else {
      console.error(`unknown argument: ${arg}`);
      usage();
      return 1;
    }
  }

  if (!format || !input || !allowedPath || !excludedPath) {
    usage();
    return 1;
  }
  if (format !== "git" && format !== "jj") {
    console.error("--format must be git or jj");
    return 1;
  }

  let text: string;
  try {
    text = Deno.readTextFileSync(input);
  } catch (error) {
    console.error(
      `read error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  const parsed = format === "git"
    ? parseGitNameStatus(text)
    : parseJjTemplateStatus(text);
  const { allowed, excluded } = classifyChanges(parsed);
  writeLines(allowedPath, relatedPaths(allowed));
  writeLines(excludedPath, relatedPaths(excluded));
  return 0;
};

if (import.meta.main) {
  Deno.exit(main(Deno.args));
}
