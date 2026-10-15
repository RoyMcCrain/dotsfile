import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const loaderPath = process.env.PI_PROMPT_LOADER;
assert.ok(
  loaderPath,
  "set PI_PROMPT_LOADER to the installed Pi prompt-templates.js path",
);
const { loadPromptTemplates, expandPromptTemplate } = await import(
  pathToFileURL(resolve(loaderPath)).href
);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const promptDir = resolve(repoRoot, "skills/explainer/prompts");
const loaded = await loadPromptTemplates({
  cwd: repoRoot,
  agentDir: tmpdir(),
  promptPaths: [promptDir],
  includeDefaults: false,
});
assert.deepEqual(loaded.diagnostics, []);
const template = loaded.templates.find(({ name }) => name === "explain");
assert.ok(template, "the shared /explain prompt is registered");
assert.equal(template.argumentHint, "[対象・重点]");
const defaultExpansion = expandPromptTemplate("/explain", loaded.templates);
assert.notEqual(defaultExpansion, "/explain");
assert.ok(!defaultExpansion.includes("$ARGUMENTS"));
assert.ok(
  expandPromptTemplate("/explain src/auth.ts", loaded.templates).includes(
    "src/auth.ts",
  ),
);
const quotedExpansion = expandPromptTemplate(
  '/explain "src/a file.ts" エラー時の流れ',
  loaded.templates,
);
assert.ok(quotedExpansion.includes("src/a file.ts"));
assert.ok(quotedExpansion.includes("エラー時の流れ"));
const canonical = await realpath(resolve(promptDir, "explain.md"));
const alias = await realpath(resolve(repoRoot, "claude/commands/explain.md"));
assert.equal(alias, canonical, "Claude command resolves to the shared prompt");
console.log("registered: /explain [対象・重点]");
console.log("expanded: no arguments, src/auth.ts, quoted path + focus");
console.log("Claude alias: same canonical file");
