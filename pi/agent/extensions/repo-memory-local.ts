import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { complete } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const STATE_ROOT = join(homedir(), ".local", "state", "pi-repo-memory");
const MAX_MEMORY_BYTES = 12 * 1024;
const MAX_MEMORY_ITEM_CHARS = 220;
const INDEX_MAX_BYTES = 1024;
const LARGE_MEMORY_BYTES = 8 * 1024;

const REVIEW_SYSTEM = `You consolidate a repository memory file into a clean, durable markdown list.

Rules:
- Merge duplicates and near-duplicates into one clear note.
- Drop obsolete, trivial, one-off, or generic-advice items; keep durable repo-specific facts (gotchas, commands that worked, design decisions, conventions, non-obvious paths).
- Group items under ## <topic> markdown headings when a natural topic exists; otherwise a single ## general group.
- Each item is a markdown bullet "- <note>", max 220 characters, no timestamps.
- Output ONLY the resulting markdown (no preamble, no code fences).`;

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const walkUpFrom = (startDir: string, visit: (dir: string) => boolean | void) => {
  let dir = startDir;
  while (true) {
    if (visit(dir)) break;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
};

const findRepoRoot = (start: string) => {
  let repoRoot = start;
  walkUpFrom(start, (dir) => {
    if (existsSync(join(dir, ".git")) || existsSync(join(dir, ".jj"))) {
      repoRoot = dir;
      return true;
    }
  });
  return repoRoot;
};

const safeRepoName = (repoRoot: string) => {
  const base = basename(repoRoot) || "repo";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "repo";
};

const memoryFilePathFor = (repoRoot: string) => {
  const hash = createHash("sha256").update(repoRoot).digest("hex").slice(0, 12);
  return join(STATE_ROOT, `${safeRepoName(repoRoot)}-${hash}`, "memory.md");
};

const tailBytes = (text: string, maxBytes: number) => {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  let start = buf.length - maxBytes;
  while (start < buf.length && (buf[start]! & 0xc0) === 0x80) start++;
  return buf.subarray(start).toString("utf8");
};

const normalizeMemory = (text: string) => text.trim().toLowerCase();

// Strip the "- <ISO> [topic] " prefix to compare only the note text.
const bulletNoteText = (line: string) =>
  line.replace(/^-\s*\S+\s*(?:\[[^\]]*\]\s*)?/, "").trim();

const readMemoryText = async (memoryPath: string) => {
  try {
    const raw = await readFile(memoryPath, "utf8");
    return raw.trim() || undefined;
  } catch {
    return undefined;
  }
};

const filterBulletLines = (text: string, query: string) => {
  const needle = query.toLowerCase();
  return text
    .split("\n")
    .filter((line) => line.trimStart().startsWith("-") && line.toLowerCase().includes(needle))
    .join("\n");
};

const countBullets = (text: string) =>
  text.split("\n").filter((line) => line.trimStart().startsWith("-")).length;

const buildMemoryIndex = (text: string | undefined): string => {
  if (!text?.trim()) {
    return "## Repo memory (on-demand)\nNo repo memory saved yet. Use the remember tool to save durable repo-specific notes.";
  }

  const bullets = text.split("\n").filter((line) => line.trimStart().startsWith("-"));
  let index =
    `## Repo memory (on-demand)\n${bullets.length} notes saved. Use recall_memory to read them; use remember to add.`;

  const topicCounts = new Map<string, number>();
  for (const line of bullets) {
    const match = line.match(/\[([^\]]+)\]/);
    if (match) {
      const topic = match[1]!;
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  if (topicCounts.size > 0) {
    const topics = [...topicCounts.entries()].map(([topic, count]) => `${topic}(${count})`).join(", ");
    index += `\nTopics: ${topics}`;
  }

  if (Buffer.byteLength(text, "utf8") > LARGE_MEMORY_BYTES) {
    index += "\nMemory is large — consider running /repo-memory-review to consolidate.";
  }

  return tailBytes(index, INDEX_MAX_BYTES);
};

export default function repoMemoryLocal(pi: ExtensionAPI) {
  let memoryPath = "";
  let indexSnapshot = "";

  pi.on("session_start", async (_event, ctx) => {
    const repoRoot = findRepoRoot(ctx.cwd);
    memoryPath = memoryFilePathFor(repoRoot);
    const text = await readMemoryText(memoryPath);
    indexSnapshot = buildMemoryIndex(text);
  });

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${indexSnapshot}`,
  }));

  pi.registerTool({
    name: "recall_memory",
    label: "Recall Repo Memory",
    description:
      "Returns locally stored, repo-specific notes from prior sessions in this repository.",
    promptSnippet: "Load repo-specific notes saved from prior sessions in this repo",
    promptGuidelines: [
      "Use recall_memory near the start of a non-trivial task to load repo-specific gotchas, commands, and decisions saved from prior sessions.",
      "Treat recall_memory output as hints; current code and project instructions still win.",
    ],
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({ description: "Optional substring to filter memory bullet lines" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const text = await readMemoryText(memoryPath);
      if (!text) {
        return { content: [{ type: "text", text: "No repo memory saved yet." }] };
      }

      if (params.query?.trim()) {
        const filtered = filterBulletLines(text, params.query.trim());
        if (!filtered) {
          return {
            content: [
              {
                type: "text",
                text: `No repo memory lines match query "${params.query.trim()}".`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: tailBytes(filtered, MAX_MEMORY_BYTES) }],
        };
      }

      return {
        content: [{ type: "text", text: tailBytes(text, MAX_MEMORY_BYTES) }],
      };
    },
  });

  pi.registerTool({
    name: "remember",
    label: "Remember (Repo Memory)",
    description:
      "Saves one durable, repo-specific note to local memory for future sessions in this repository.",
    promptSnippet:
      "Save a durable repo-specific note (gotcha, command, decision) for future sessions",
    promptGuidelines: [
      "Use remember when you learn a durable repo-specific fact worth reusing later: a non-obvious command that worked, a gotcha, a design decision, or a repo convention.",
      "Do not use remember for secrets, credentials, one-off progress, or generic advice.",
    ],
    parameters: Type.Object({
      note: Type.String({ description: "Durable repo-specific note to save" }),
      topic: Type.Optional(Type.String({ description: "Optional topic tag for the note" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const note = params.note.trim().slice(0, MAX_MEMORY_ITEM_CHARS);
      if (!note) {
        return { content: [{ type: "text", text: "Nothing to save (note was empty)." }] };
      }

      const existingText = (await readMemoryText(memoryPath)) ?? "";
      const normalized = normalizeMemory(note);
      // Compare against each existing bullet's note text (not raw substring of
      // the whole file) so a shorter note is not wrongly skipped as a substring
      // of a longer one.
      const alreadySaved = existingText
        .split("\n")
        .filter((line) => line.trimStart().startsWith("-"))
        .some((line) => normalizeMemory(bulletNoteText(line)) === normalized);
      if (normalized && alreadySaved) {
        return { content: [{ type: "text", text: "Already remembered." }] };
      }

      const stamp = new Date().toISOString();
      const topic = params.topic?.trim();
      const line = topic
        ? `- ${stamp} [${topic}] ${note}\n`
        : `- ${stamp} ${note}\n`;

      try {
        await mkdir(join(memoryPath, ".."), { recursive: true });
        await appendFile(memoryPath, line, { encoding: "utf8", mode: 0o600 });
        await chmod(memoryPath, 0o600).catch(() => {});
        // Reflect the new note in the current session's injected index.
        indexSnapshot = buildMemoryIndex(await readMemoryText(memoryPath));
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to save repo memory: ${errorMessage(error)}`,
            },
          ],
        };
      }

      if (ctx.hasUI) {
        ctx.ui.notify("Repo memory saved", "info");
      }

      return { content: [{ type: "text", text: "Saved to repo memory." }] };
    },
  });

  pi.registerCommand("repo-memory-review", {
    description: "Consolidate repo memory via one LLM pass (dedupe, prune, regroup)",
    handler: async (_args, ctx) => {
      let rawContent: string;
      try {
        rawContent = await readFile(memoryPath, "utf8");
      } catch {
        ctx.ui.notify("No repo memory to review.", "info");
        return;
      }

      const text = rawContent.trim();
      if (!text) {
        ctx.ui.notify("No repo memory to review.", "info");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("No model selected", "warning");
        return;
      }

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
      if (!auth.ok || !auth.apiKey) {
        ctx.ui.notify(auth.error ?? "API key not available", "warning");
        return;
      }

      if (ctx.hasUI) {
        ctx.ui.notify("Reviewing repo memory...", "info");
      }

      const response = await complete(
        ctx.model,
        {
          systemPrompt: REVIEW_SYSTEM,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: `<memory>${text}</memory>` }],
              timestamp: Date.now(),
            },
          ],
        },
        { apiKey: auth.apiKey, headers: auth.headers, env: auth.env },
      );

      const curated = response.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();

      if (!curated) {
        ctx.ui.notify("Review produced no output.", "warning");
        return;
      }

      const beforeCount = countBullets(text);
      const afterCount = countBullets(curated);

      if (ctx.hasUI) {
        const confirmed = await ctx.ui.confirm(
          "Apply memory review?",
          `Before: ${beforeCount} notes → After: ${afterCount} notes. Overwrite memory.md? A .bak backup is kept.`,
        );
        if (!confirmed) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }
      }

      try {
        await mkdir(join(memoryPath, ".."), { recursive: true });
        await writeFile(`${memoryPath}.bak`, rawContent, { encoding: "utf8", mode: 0o600 });
        const curatedText = curated.endsWith("\n") ? curated : `${curated}\n`;
        await writeFile(memoryPath, curatedText, { encoding: "utf8", mode: 0o600 });
        await chmod(memoryPath, 0o600).catch(() => {});

        indexSnapshot = buildMemoryIndex(curated);

        if (ctx.hasUI) {
          ctx.ui.notify(
            `Repo memory reviewed: ${beforeCount} → ${afterCount} notes (.bak saved)`,
            "info",
          );
        }
      } catch (error) {
        ctx.ui.notify(`Failed to review repo memory: ${errorMessage(error)}`, "error");
      }
    },
  });
}
