/**
 * モノレポ AGENTS.md / CLAUDE.md 遅延ローダー
 *
 * Pi の組み込みコンテキスト読み込みは、cwd とその親ディレクトリの
 * AGENTS.md/CLAUDE.md しか読まない。各パッケージが自身のコンテキストファイルを
 * 持つモノレポでは、別サブツリー（sibling subtree）の内容がすべて漏れてしまう。
 *
 * この拡張はそれらを遅延ロードする: エージェントが read/edit/write でファイルを
 * 触ると、そのファイルから repo root まで上に辿り、各祖先ディレクトリのコンテキスト
 * ファイル（共通の root 規約 + ローカル規約）を tool result に追記する。フロントを
 * 触ればフロントのファイルだけが載り、あとでバックを触ればバックの分が追加される
 * ——実際に使う部分のぶんだけコストを払う。各ファイルはセッション中に最大1回だけ注入する。
 *
 * 1ディレクトリに両方ある場合は AGENTS.md を優先し、1ファイルだけ採用する
 * （Pi 組み込みローダーおよび agents.md 規約と整合）。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  isEditToolResult,
  isReadToolResult,
  isWriteToolResult,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

// 1ディレクトリでの採用優先順（先頭が優先）。
const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md"];
const MAX_FILE_BYTES = 32 * 1024;

const isInside = (from: string, to: string) => {
  const rel = path.relative(from, to);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

const walkUpFrom = (startDir: string, visit: (dir: string) => boolean | void) => {
  let dir = startDir;
  while (true) {
    if (visit(dir)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
};

// VCS マーカーを上方向に探して探索範囲を区切る。見つからなければ cwd を使う。
const findRepoRoot = (start: string) => {
  let repoRoot = start;
  walkUpFrom(start, (dir) => {
    if (fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, ".jj"))) {
      repoRoot = dir;
      return true;
    }
  });
  return repoRoot;
};

// repo root からファイルのディレクトリまでの、祖先コンテキストファイルのパス。
// root-first（共通規約がローカル上書きより先）で返す。
// cwd→root チェーン上のディレクトリはスキップする（Pi の組み込みローダーが既に読むため）。
const ancestorContextFiles = (absFile: string, repoRoot: string, cwd: string) => {
  if (!isInside(repoRoot, absFile)) return [];

  const found: string[] = [];
  walkUpFrom(path.dirname(absFile), (dir) => {
    if (!isInside(dir, cwd)) {
      // 1ディレクトリ1ファイルだけ（AGENTS.md 優先）。
      for (const name of CONTEXT_FILES) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) {
          found.push(candidate);
          break;
        }
      }
    }
    return dir === repoRoot;
  });
  return found.reverse();
};

const readContextContent = (file: string): string => {
  const buf = fs.readFileSync(file);
  if (buf.length > MAX_FILE_BYTES) {
    return (
      buf.subarray(0, MAX_FILE_BYTES).toString("utf8").trimEnd() +
      "\n… (truncated, file exceeds 32KB)"
    );
  }
  return buf.toString("utf8").trimEnd();
};

export default function monorepoClaudeMd(pi: ExtensionAPI) {
  let repoRoot = "";
  let realRepoRoot = "";
  const injected = new Set<string>();

  pi.on("session_start", async (_event, ctx) => {
    repoRoot = findRepoRoot(ctx.cwd);
    try {
      realRepoRoot = fs.realpathSync(repoRoot);
    } catch {
      realRepoRoot = repoRoot;
    }
    injected.clear();
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) return;

    const rawPath =
      isReadToolResult(event) || isEditToolResult(event) || isWriteToolResult(event)
        ? event.input.path
        : undefined;
    if (typeof rawPath !== "string" || !rawPath) return;

    const absFile = path.resolve(ctx.cwd, rawPath);
    const blocks: string[] = [];

    for (const file of ancestorContextFiles(absFile, repoRoot, ctx.cwd)) {
      if (isReadToolResult(event) && path.resolve(file) === absFile) continue;

      let realCandidate: string;
      try {
        realCandidate = fs.realpathSync(file);
      } catch {
        continue;
      }
      if (!isInside(realRepoRoot, realCandidate)) continue;
      if (injected.has(realCandidate)) continue;

      try {
        const content = readContextContent(realCandidate);
        injected.add(realCandidate);
        const relPath = path.relative(repoRoot, file);
        blocks.push(
          `--- Directory guidance from ${relPath} ---\n${content}\n--- end guidance (${relPath}) ---`,
        );
      } catch {
        // 読めないファイルは黙ってスキップし、tool result はそのまま保つ。
      }
    }

    if (blocks.length === 0) return;

    return {
      content: [...event.content, { type: "text", text: `\n\n${blocks.join("\n\n")}` }],
    };
  });
}
