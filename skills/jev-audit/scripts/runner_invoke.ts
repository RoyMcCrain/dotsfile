import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildAuditorSystemPrompt,
  buildAuditorUserPrompt,
} from "./auditor_prompt.ts";

export type RunnerOutcome =
  | { ok: true; stdout: string }
  | { ok: false; reason: string };

export type RunnerInvoke = (options: {
  model: string;
  promptPath: string;
  inputPath: string;
  cwd: string;
  timeoutSeconds: number;
}) => Promise<RunnerOutcome>;

const resolveBash = (): string => process.env["JEV_AUDIT_BASH"] ?? "bash";

export const invokeRunner: RunnerInvoke = async (options) => {
  const script = join(
    import.meta.dirname!,
    "../../parallel-review/scripts/run_pi_review.sh",
  );
  const cmd = Bun.spawn([
    resolveBash(), script, "--model", options.model, "--prompt", options.promptPath,
    "--input", options.inputPath, "--timeout", String(options.timeoutSeconds),
    "--attempts", "1", "--cwd", options.cwd,
  ], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    cwd: options.cwd,
    env: { ...process.env },
  });
  const status = await cmd.exited;
  if (status !== 0) {
    return { ok: false, reason: "runner_failed" };
  }
  return { ok: true, stdout: await new Response(cmd.stdout).text() };
};

export const prepareIsolatedRun = async (): Promise<{
  cwd: string;
  promptPath: string;
  cleanup: () => Promise<void>;
}> => {
  const cwd = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "jev-audit-cwd-"));
  const removeCwd = async (): Promise<void> => {
    try {
      await rm(cwd, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };
  try {
    await chmod(cwd, 0o700);
    const promptPath = join(cwd, "prompt.md");
    const system = buildAuditorSystemPrompt();
    const user = buildAuditorUserPrompt();
    await writeFile(
      promptPath,
      `${system}\n\n${user}\n`,
      { mode: 0o600 },
    );
    return { cwd, promptPath, cleanup: removeCwd };
  } catch (error) {
    await removeCwd();
    throw error;
  }
};

export const AUDITOR_TIMEOUT_SECONDS = 120;
