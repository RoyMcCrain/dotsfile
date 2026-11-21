import {
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { lstatSync, realpathSync, readFileSync } from "node:fs";
import path from "node:path";

export default function (pi: ExtensionAPI) {
  const manifestPath = process.env.PI_OSS_APPROVED_FILES;
  let approved = new Set<string>();
  try {
    if (!manifestPath) throw new Error("approval manifest missing");
    const entries: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!Array.isArray(entries) || entries.length === 0 || entries.some((entry) => typeof entry !== "string")) throw new Error("invalid approval manifest");
    approved = new Set(entries as string[]);
    if (approved.size !== entries.length) throw new Error("duplicate approval manifest path");
  } catch {
    approved.clear();
  }
  const valid = (input: unknown, cwd: string): string | undefined => {
    if (typeof input !== "string" || approved.size === 0) return;
    const candidate = path.isAbsolute(input) ? input : path.resolve(cwd, input);
    try {
      const stat = lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) return;
      const canonical = realpathSync(candidate);
      return candidate === canonical && approved.has(canonical) ? canonical : undefined;
    } catch { return; }
  };
  const block = (message: string) => ({ block: true, reason: message });
  pi.on("tool_call", async (event, ctx) => {
    if (!approved.size) return block("Approval manifest is invalid.");
    if (!["read", "edit", "write"].includes(event.toolName)) return block("Tool is not allowed in OSS implementation mode.");
    const input = event.input as Record<string, unknown>;
    const canonical = valid(input.path, ctx.cwd);
    if (!canonical) return block("File is not an approved regular file.");
    input.path = canonical;
    return;
  });
  // The launcher disables built-in tools, so failure to load this guard exposes none.
  if (!approved.size) return;
  const cwd = process.cwd();
  pi.registerTool(createReadToolDefinition(cwd));
  pi.registerTool(createEditToolDefinition(cwd));
  pi.registerTool(createWriteToolDefinition(cwd));
}
