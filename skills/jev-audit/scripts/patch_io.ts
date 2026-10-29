import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { assertAuditRelativePathSafe } from "./paths.ts";
import { assertRegularDir, replacePrivateFileAtomic } from "./state_io.ts";

const PATCH_REL = "changes.patch";
const GENERIC_PATCH_NAME = "input.patch";

export const sha256Bytes = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

export const readPatchFromRun = async (
  runDir: string,
  expectedSha256: string,
): Promise<Uint8Array> => {
  const runReal = await realpath(runDir);
  const patchPath = join(runDir, PATCH_REL);
  const patchLstat = await lstat(patchPath);
  if (patchLstat.isSymbolicLink()) {
    throw new Error("patch must not be a symlink");
  }
  if (!patchLstat.isFile()) throw new Error("patch missing");
  const patchReal = await realpath(patchPath);
  const rel = relative(runReal, patchReal);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error("patch escapes run directory");
  }
  const content = await readFile(patchReal);
  const hash = sha256Bytes(content);
  if (hash !== expectedSha256) {
    throw new Error("patch hash mismatch");
  }
  return content;
};

export const stagePrivatePatch = async (
  auditBase: string,
  weekStart: string,
  runId: string,
  content: Uint8Array,
): Promise<string> => {
  const baseReal = await assertRegularDir(auditBase);
  const dir = await assertAuditRelativePathSafe(
    baseReal,
    ["weeks", weekStart, "staging", runId],
    "staging directory",
  );
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const path = join(dir, GENERIC_PATCH_NAME);
  await replacePrivateFileAtomic(path, content);
  return path;
};

const resolveBash = (): string => process.env["JEV_AUDIT_BASH"] ?? "bash";

export const validatePatchFileLocal = async (
  patchPath: string,
): Promise<void> => {
  const script = join(
    import.meta.dirname!,
    "validate_patch.sh",
  );
  const cmd = Bun.spawn([resolveBash(), script, patchPath], {
    stdin: "ignore", stdout: "ignore", stderr: "ignore",
  });
  if (await cmd.exited !== 0) throw new Error("patch validation failed");
};

export const conservativeTokenScan = (content: Uint8Array): void => {
  const text = new TextDecoder().decode(content);
  if (
    /-----BEGIN (?:ENCRYPTED |RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/m.test(
      text,
    )
  ) {
    throw new Error("private key marker in patch");
  }
  if (/\bsk-[A-Za-z0-9]{20,}\b/.test(text)) {
    throw new Error("credential-like token in patch");
  }
  if (/\bsk-proj-[A-Za-z0-9_-]{20,}\b/.test(text)) {
    throw new Error("credential-like token in patch");
  }
  if (/\bsk-ant-api03-[A-Za-z0-9_-]{20,}\b/.test(text)) {
    throw new Error("credential-like token in patch");
  }
  if (/\bghp_[A-Za-z0-9]{20,}\b/.test(text)) {
    throw new Error("credential-like token in patch");
  }
  if (/\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(text)) {
    throw new Error("credential-like token in patch");
  }
};

export const loadCheckedPatch = async (options: {
  runDir: string;
  expectedSha256: string;
  auditBase: string;
  weekStart: string;
  runId: string;
}): Promise<{ stagedPath: string; sha256: string }> => {
  const content = await readPatchFromRun(
    options.runDir,
    options.expectedSha256,
  );
  conservativeTokenScan(content);
  const stagedPath = await stagePrivatePatch(
    options.auditBase,
    options.weekStart,
    options.runId,
    content,
  );
  await validatePatchFileLocal(stagedPath);
  const stagedReal = await realpath(stagedPath);
  const stagedContent = await readFile(stagedReal);
  const sha256 = sha256Bytes(stagedContent);
  if (sha256 !== options.expectedSha256) {
    throw new Error("staged patch hash mismatch");
  }
  return { stagedPath: stagedReal, sha256 };
};

export const genericPatchFileName = (): string => GENERIC_PATCH_NAME;
