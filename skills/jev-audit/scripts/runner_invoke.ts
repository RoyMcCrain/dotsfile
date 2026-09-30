import { writeFile } from "node:fs/promises";
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

const resolveBash = (): string => Deno.env.get("JEV_AUDIT_BASH") ?? "bash";

export const invokeRunner: RunnerInvoke = async (options) => {
  const script = join(
    import.meta.dirname!,
    "../../parallel-review/scripts/run_pi_review.sh",
  );
  const cmd = new Deno.Command(resolveBash(), {
    args: [
      script,
      "--model",
      options.model,
      "--prompt",
      options.promptPath,
      "--input",
      options.inputPath,
      "--timeout",
      String(options.timeoutSeconds),
      "--attempts",
      "1",
      "--cwd",
      options.cwd,
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "null",
    cwd: options.cwd,
  });
  const out = await cmd.output();
  if (!out.success) {
    return { ok: false, reason: "runner_failed" };
  }
  return { ok: true, stdout: new TextDecoder().decode(out.stdout) };
};

export const prepareIsolatedRun = async (): Promise<{
  cwd: string;
  promptPath: string;
  cleanup: () => Promise<void>;
}> => {
  const cwd = await Deno.makeTempDir({ prefix: "jev-audit-cwd-" });
  const removeCwd = async (): Promise<void> => {
    try {
      await Deno.remove(cwd, { recursive: true });
    } catch {
      // ignore
    }
  };
  try {
    await Deno.chmod(cwd, 0o700);
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
