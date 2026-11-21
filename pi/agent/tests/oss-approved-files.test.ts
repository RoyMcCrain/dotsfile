import { expect, test } from "bun:test";
import { linkSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../oss-dev/approved-files.ts";

test("OSS file guard allows only canonical approved paths", async () => {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "oss-guard-")));
  const work = path.join(root, "work");
  const files = path.join(work, "src");
  mkdirSync(files, { recursive: true });
  const approvedFile = path.join(files, "allowed.ts");
  const deniedFile = path.join(files, "denied.ts");
  const linkedDir = path.join(work, "linked");
  writeFileSync(approvedFile, "approved");
  writeFileSync(deniedFile, "denied");
  symlinkSync(files, linkedDir, "dir");
  const manifest = path.join(root, "manifest.json");
  writeFileSync(manifest, JSON.stringify([realpathSync(approvedFile)]));
  const previous = process.env.PI_OSS_APPROVED_FILES;
  process.env.PI_OSS_APPROVED_FILES = manifest;
  const handlers = new Map<string, (event: { toolName: string; input: Record<string, unknown> }, ctx: { cwd: string }) => Promise<unknown> | unknown>();
  const registeredTools: string[] = [];
  const api = {
    on: (name: string, handler: (event: never, ctx: { cwd: string }) => Promise<unknown> | unknown) => handlers.set(name, handler as never),
    registerTool: ({ name }: { name: string }) => registeredTools.push(name),
  } as unknown as ExtensionAPI;
  try {
    extension(api);
    const guard = handlers.get("tool_call");
    expect(guard).toBeDefined();
    const allow = await guard!({ toolName: "read", input: { path: "src/allowed.ts" } }, { cwd: work });
    expect(allow).toBeUndefined();
    const deny = await guard!({ toolName: "read", input: { path: "src/denied.ts" } }, { cwd: work });
    expect(deny).toMatchObject({ block: true });
    const parentLink = await guard!({ toolName: "read", input: { path: "linked/allowed.ts" } }, { cwd: work });
    expect(parentLink).toMatchObject({ block: true });
    const wrongTool = await guard!({ toolName: "bash", input: { path: approvedFile } }, { cwd: work });
    expect(wrongTool).toMatchObject({ block: true });
    linkSync(approvedFile, path.join(files, "hardlink.ts"));
    expect(await guard!({ toolName: "read", input: { path: approvedFile } }, { cwd: work })).toMatchObject({ block: true });

    const toolCount = registeredTools.length;
    writeFileSync(manifest, "[]");
    extension(api);
    expect(toolCount).toBeGreaterThan(0);
    expect(registeredTools).toHaveLength(toolCount);
  } finally {
    if (previous === undefined) delete process.env.PI_OSS_APPROVED_FILES;
    else process.env.PI_OSS_APPROVED_FILES = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
