import { test } from "bun:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import monorepoClaudeMd from "../extensions/monorepo-claude-md.ts";

type ToolResult = { content: { type: string; text: string }[] };

const resultText = (result: unknown) => {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = result.content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => typeof block === "object" && block && "text" in block ? String(block.text) : "").join("\n");
};

const fixture = () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "monorepo-context-"));
  const repo = path.join(temp, "repo");
  const pkg = path.join(repo, "pkg");
  const code = path.join(pkg, "sub", "src", "code.ts");
  fs.mkdirSync(path.dirname(code), { recursive: true });
  fs.mkdirSync(path.join(repo, ".git"));
  fs.writeFileSync(code, "code");
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "root guidance");
  fs.writeFileSync(path.join(repo, "CLAUDE.md"), "root alternate");
  fs.writeFileSync(path.join(pkg, "CLAUDE.md"), "package alternate");
  const guidance = path.join(pkg, "AGENTS.md");
  fs.writeFileSync(guidance, "package-specific guidance");
  fs.writeFileSync(path.join(pkg, "sub", "AGENTS.md"), "nested guidance");
  type Handler = (event: unknown, ctx: unknown) => unknown;
  const handlers = new Map<string, Handler[]>();
  const pi = { on: (name: string, handler: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]) };
  const ctx = { cwd: repo };
  monorepoClaudeMd(pi as never);
  const dispatch = async (name: string, event: unknown = {}) => {
    let result: unknown;
    for (const handler of handlers.get(name) ?? []) result = await handler(event, ctx);
    return result;
  };
  const read = async (file: string, input: Record<string, unknown> = {}, options: Record<string, unknown> = {}) => await dispatch("tool_result", {
    type: "tool_result", toolName: "read", input: { path: file, ...input }, details: options,
    isError: false, content: [{ type: "text", text: "file contents" }],
  }) as ToolResult | undefined;
  return { temp, code, guidance, dispatch, read };
};

test("injects child AGENTS guidance once and resets each session", async () => {
  const f = fixture();
  try {
    await f.dispatch("session_start");
    const text = resultText(await f.read(f.code));
    assert.ok(text.includes("package-specific guidance"));
    assert.ok(text.includes("nested guidance"));
    assert.ok(text.indexOf("package-specific guidance") < text.indexOf("nested guidance"));
    assert.ok(!text.includes("package alternate"));
    assert.ok(!text.includes("root guidance"));
    assert.equal(await f.read(f.code), undefined);
    await f.dispatch("session_start");
    assert.ok(resultText(await f.read(f.code)).includes("package-specific guidance"));
  } finally {
    fs.rmSync(f.temp, { recursive: true, force: true });
  }
});

test("full explicit reads and actual loaded symlink aliases are not reinjected", async () => {
  const f = fixture();
  try {
    await f.dispatch("session_start");
    await f.read(f.guidance);
    const result = resultText(await f.read(f.code));
    assert.ok(result.includes("nested guidance"));
    assert.ok(!result.includes("package-specific guidance"));
    await f.dispatch("session_start");
    const alias = path.join(f.temp, "loaded-AGENTS.md");
    fs.symlinkSync(f.guidance, alias);
    await f.dispatch("before_agent_start", { systemPromptOptions: { contextFiles: [{ path: alias, content: "package-specific guidance" }] } });
    const aliasResult = resultText(await f.read(f.code));
    assert.ok(aliasResult.includes("nested guidance"));
    assert.ok(!aliasResult.includes("package-specific guidance"));
  } finally {
    fs.rmSync(f.temp, { recursive: true, force: true });
  }
});

test("CLAUDE.md fallback uses package and nested guidance but excludes the repository root", async () => {
  const f = fixture();
  try {
    fs.rmSync(f.guidance);
    await f.dispatch("session_start");
    const text = resultText(await f.read(f.code));
    assert.ok(text.includes("package alternate"));
    assert.ok(text.includes("nested guidance"));
    assert.ok(!text.includes("root alternate"));
  } finally {
    fs.rmSync(f.temp, { recursive: true, force: true });
  }
});

test("partial, truncated, and failed guidance reads remain eligible for later injection", async () => {
  const f = fixture();
  try {
    await f.dispatch("session_start");
    assert.equal(await f.read(f.guidance, { offset: 2 }), undefined);
    assert.ok(resultText(await f.read(f.code)).includes("package-specific guidance"));
    await f.dispatch("session_start");
    assert.equal(await f.read(f.guidance, { limit: 1 }), undefined);
    assert.ok(resultText(await f.read(f.code)).includes("package-specific guidance"));
    await f.dispatch("session_start");
    await f.read(f.guidance, {}, { truncation: { truncated: true } });
    assert.ok(resultText(await f.read(f.code)).includes("package-specific guidance"));
    await f.dispatch("session_start");
    await f.dispatch("tool_result", { type: "tool_result", toolName: "read", input: { path: f.guidance }, isError: true, content: [] });
    assert.ok(resultText(await f.read(f.code)).includes("package-specific guidance"));
  } finally {
    fs.rmSync(f.temp, { recursive: true, force: true });
  }
});

test("guidance symlinks escaping the repository are never injected", async () => {
  const f = fixture();
  try {
    fs.rmSync(f.guidance);
    fs.symlinkSync(path.join(f.temp, "outside.md"), f.guidance);
    fs.writeFileSync(path.join(f.temp, "outside.md"), "outside secret guidance");
    await f.dispatch("session_start");
    const text = resultText(await f.read(f.code));
    assert.ok(text.includes("nested guidance"));
    assert.ok(!text.includes("outside secret guidance"));
  } finally {
    fs.rmSync(f.temp, { recursive: true, force: true });
  }
});
