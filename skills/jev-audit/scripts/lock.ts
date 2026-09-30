import { mkdir, unlink, writeFile } from "node:fs/promises";

export type RunLock = {
  path: string;
  release: () => Promise<void>;
};

const tryAcquireLockFile = async (lockFile: string): Promise<boolean> => {
  const payload = `${Deno.pid}\n${new Date().toISOString()}\n`;
  try {
    await writeFile(lockFile, payload, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as { code: string }).code === "EEXIST"
    ) {
      return false;
    }
    throw error;
  }
};

export const acquireRunLock = async (
  weekRoot: string,
  lockFile: string,
): Promise<RunLock> => {
  await mkdir(weekRoot, { recursive: true, mode: 0o700 });
  const acquired = await tryAcquireLockFile(lockFile);
  if (!acquired) {
    throw new Error("audit run already in progress");
  }
  return {
    path: lockFile,
    release: async () => {
      try {
        await unlink(lockFile);
      } catch {
        // best effort
      }
    },
  };
};

export const acquireGlobalAuditLock = async (
  auditBase: string,
  lockFile: string,
): Promise<RunLock> => {
  await mkdir(auditBase, { recursive: true, mode: 0o700 });
  const acquired = await tryAcquireLockFile(lockFile);
  if (!acquired) {
    throw new Error("audit operation already in progress");
  }
  return {
    path: lockFile,
    release: async () => {
      try {
        await unlink(lockFile);
      } catch {
        // best effort
      }
    },
  };
};

export const lockRecoveryNote = (): string =>
  "If .audit.lock remains after a verified stop, remove that lock file manually (do not rm -rf the audit tree).";
