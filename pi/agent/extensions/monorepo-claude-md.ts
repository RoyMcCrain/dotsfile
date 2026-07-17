/**
 * Monorepo CLAUDE.md lazy loader
 *
 * Pi's built-in context loading only reads CLAUDE.md/AGENTS.md from the cwd and
 * its parent directories. In a monorepo where each package has its own
 * CLAUDE.md, that misses everything in sibling subtrees.
 *
 * This extension loads those files lazily: when the agent touches a file via
 * read/edit/write, it walks up from that file to the repo root and appends the
 * CLAUDE.md of every ancestor directory (shared root conventions + local rules)
 * to the tool result. So working on the frontend loads only the frontend's
 * CLAUDE.md, and touching the backend later adds the backend's — you only pay
 * for the parts you actually use. Each file is injected at most once per session.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  isEditToolResult,
  isReadToolResult,
  isWriteToolResult,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const CONTEXT_FILE = "CLAUDE.md";
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

// Walk up for a VCS marker to bound the upward search; fall back to cwd.
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

// Ancestor CLAUDE.md paths from repo root down to the file's directory.
// Root-first so shared conventions precede local overrides.
// Skips directories on the cwd→root chain (already loaded by Pi's built-in loader).
const ancestorContextFiles = (absFile: string, repoRoot: string, cwd: string) => {
  if (!isInside(repoRoot, absFile)) return [];

  const found: string[] = [];
  walkUpFrom(path.dirname(absFile), (dir) => {
    if (!isInside(dir, cwd)) {
      const candidate = path.join(dir, CONTEXT_FILE);
      if (fs.existsSync(candidate)) found.push(candidate);
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
        // Unreadable file: skip silently, keep the tool result intact.
      }
    }

    if (blocks.length === 0) return;

    return {
      content: [...event.content, { type: "text", text: `\n\n${blocks.join("\n\n")}` }],
    };
  });
}
