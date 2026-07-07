import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { appendFile, chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const LOG_DIR = join(homedir(), ".pi", "agent", "compaction-logs");

const safeProjectLogName = (cwd: string) => {
  const base = basename(cwd) || "project";
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) ||
    "project";
  const hash = createHash("sha256").update(cwd).digest("hex").slice(0, 12);

  return `${safeBase}-${hash}.md`;
};

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  return String(error);
};

export default function saveCompactionLog(pi: ExtensionAPI) {
  pi.on("session_compact", async (event, ctx) => {
    const entry = event.compactionEntry;
    const logPath = join(LOG_DIR, safeProjectLogName(ctx.cwd));
    const summary = entry.summary.trimEnd();
    const content = [
      `## ${new Date(entry.timestamp).toISOString()} (${event.reason})`,
      "",
      `- cwd: ${ctx.cwd}`,
      `- firstKeptEntryId: ${entry.firstKeptEntryId}`,
      `- tokensBefore: ${entry.tokensBefore}`,
      "",
      summary,
      "",
      "---",
      "",
    ].join("\n");

    try {
      await mkdir(LOG_DIR, { recursive: true });
      await appendFile(logPath, content, { encoding: "utf8", mode: 0o600 });
      await chmod(logPath, 0o600).catch(() => {});

      if (ctx.hasUI) {
        ctx.ui.notify(`Compaction log saved: ${logPath}`, "info");
      }
    } catch (error) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Failed to save compaction log: ${errorMessage(error)}`,
          "error",
        );
      }
    }
  });
}
