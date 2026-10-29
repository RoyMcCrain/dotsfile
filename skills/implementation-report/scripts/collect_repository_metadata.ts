import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { realpath, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
const execFileAsync = promisify(execFile);
import { isSecretPath } from "../../review-report/scripts/render_report.ts";
import {
  classifyChanges,
  parseGitNameStatus,
  parseJjTemplateStatus,
  type PathChange,
  toPublicChange,
} from "./filter_secret_paths.ts";

const JJ_STATUS_TEMPLATE =
  'self.status() ++ "\\t" ++ self.source().path() ++ "\\t" ++ self.target().path() ++ "\\n"';

export interface RepositoryMetadata {
  name: string;
  trackedFiles: string[];
  changes: PathChange[];
}

export const uniqueNonSecretPaths = (paths: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    const text = path.replace(/\r$/, "");
    if (!text || seen.has(text) || isSecretPath(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
};

export const runCommand = async (
  bin: string,
  args: string[],
  cwd: string,
): Promise<string> => {
  try {
    const result = await execFileAsync(bin, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: Infinity,
    });
    return result.stdout;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    const stderr = failure.stderr?.trim();
    throw new Error(
      `${bin} ${args.join(" ")} failed: ${stderr || `exit ${failure.code ?? "unknown"}`}`,
    );
  }
};

const detectVcs = async (repo: string): Promise<"jj" | "git"> => {
  try {
    const info = await stat(`${repo}/.jj`);
    if (info.isDirectory()) return "jj";
  } catch {
    // fall through to git
  }
  try {
    await stat(`${repo}/.git`);
    return "git";
  } catch {
    throw new Error(`no .jj or .git directory in ${repo}`);
  }
};

const listTrackedFiles = async (
  repo: string,
  vcs: "jj" | "git",
): Promise<string[]> => {
  const text = vcs === "jj"
    ? await runCommand("jj", ["--color=never", "file", "list"], repo)
    : await runCommand("git", ["ls-files", "-z"], repo);
  const paths = vcs === "jj"
    ? text.split("\n").map((line) => line.replace(/\r$/, ""))
    : text.split("\0");
  return uniqueNonSecretPaths(paths).sort();
};

const listChanges = async (
  repo: string,
  vcs: "jj" | "git",
): Promise<PathChange[]> => {
  const parsed = vcs === "jj"
    ? parseJjTemplateStatus(
      await runCommand("jj", [
        "--color=never",
        "diff",
        "-T",
        JJ_STATUS_TEMPLATE,
      ], repo),
    )
    : parseGitNameStatus(
      await runCommand("git", [
        "--no-pager",
        "-c",
        "core.quotePath=false",
        "diff",
        "--name-status",
        "-z",
        "-M",
        "--no-color",
        "HEAD",
      ], repo),
    );
  const { allowed } = classifyChanges(parsed);
  return allowed.map(toPublicChange);
};

export const collectRepositoryMetadata = async (
  repo: string,
): Promise<RepositoryMetadata> => {
  const resolved = await realpath(repo);
  const vcs = await detectVcs(resolved);
  const [trackedFiles, changes] = await Promise.all([
    listTrackedFiles(resolved, vcs),
    listChanges(resolved, vcs),
  ]);
  if (trackedFiles.length === 0) {
    throw new Error("no non-secret tracked files found");
  }
  return {
    name: basename(resolved),
    trackedFiles,
    changes,
  };
};

const usage = () => {
  console.error(
    "usage: collect_repository_metadata.ts --repo ROOT -o repository.json",
  );
};

export const main = async (argv: string[]) => {
  let repo: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") {
      repo = argv[++i];
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

  if (!repo || !output) {
    usage();
    return 1;
  }

  let metadata: RepositoryMetadata;
  try {
    metadata = await collectRepositoryMetadata(repo);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  try {
    await writeFile(output, `${JSON.stringify(metadata, null, 2)}\n`);
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
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
