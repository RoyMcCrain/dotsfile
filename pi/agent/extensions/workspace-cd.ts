import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { lstatSync, realpathSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

export const WORKSPACE_CD_COMMAND = "workspace-cd";
export const WORKSPACE_CD_CONTINUE_COMMAND = "workspace-cd-continue";

const CONTINUE_MESSAGE =
  "(workspace-cd) jj workspace のセットアップが完了しました。このディレクトリで元のタスクを続けてください。";

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

export const resolveWorkspacePath = (input: string, cwd: string): string => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new WorkspacePathError("Path is required");
  }

  const absolute = resolve(cwd, trimmed);
  let canonical: string;
  try {
    canonical = realpathSync.native(absolute);
  } catch {
    throw new WorkspacePathError(`Directory not found: ${trimmed}`);
  }

  try {
    if (!lstatSync(canonical).isDirectory()) {
      throw new WorkspacePathError(`Not a directory: ${trimmed}`);
    }
  } catch (error) {
    if (error instanceof WorkspacePathError) throw error;
    throw new WorkspacePathError(`Directory not found: ${trimmed}`);
  }

  return canonical;
};

export type SwitchWorkspaceDeps = {
  forkFrom: typeof SessionManager.forkFrom;
  switchSession: ExtensionCommandContext["switchSession"];
  getSessionFile: () => string | undefined;
  getCwd: () => string;
};

export const switchWorkspaceSession = async (
  deps: SwitchWorkspaceDeps,
  targetPath: string,
  options?: { autoContinue?: boolean },
) => {
  const currentPath = resolveWorkspacePath(".", deps.getCwd());
  const resolvedTarget = resolveWorkspacePath(targetPath, deps.getCwd());
  if (resolvedTarget === currentPath) {
    return { switched: false as const, targetPath: resolvedTarget };
  }

  const sourceSession = deps.getSessionFile();
  if (!sourceSession) {
    throw new WorkspacePathError(
      "Current session is not persisted; cannot fork across cwd",
    );
  }

  const forked = deps.forkFrom(sourceSession, resolvedTarget);
  const targetSessionFile = forked.getSessionFile();
  if (!targetSessionFile) {
    throw new WorkspacePathError("Failed to create forked session file");
  }

  const result = await deps.switchSession(targetSessionFile, {
    withSession: async (freshCtx) => {
      if (freshCtx.hasUI) {
        freshCtx.ui.notify(`Switched to ${resolvedTarget}`, "info");
      }
      if (options?.autoContinue) {
        await freshCtx.sendUserMessage(CONTINUE_MESSAGE);
      }
    },
  });

  if (result.cancelled) {
    try {
      unlinkSync(targetSessionFile);
    } catch {
      // best-effort cleanup of the fork file we just created
    }
    throw new WorkspacePathError("Session switch was cancelled");
  }

  return {
    switched: true as const,
    targetPath: resolvedTarget,
    sessionFile: targetSessionFile,
  };
};

const notifyError = (
  ctx: ExtensionCommandContext,
  message: string,
) => {
  if (ctx.hasUI) ctx.ui.notify(message, "error");
};

const makeSwitchDeps = (
  ctx: ExtensionCommandContext,
): SwitchWorkspaceDeps => ({
  forkFrom: SessionManager.forkFrom,
  switchSession: (sessionPath, options) =>
    ctx.switchSession(sessionPath, options),
  getSessionFile: () => ctx.sessionManager.getSessionFile(),
  getCwd: () => ctx.cwd,
});

export default function workspaceCd(pi: ExtensionAPI) {
  let pendingTarget: string | undefined;
  let dispatchTimer: ReturnType<typeof setTimeout> | undefined;

  const clearDispatchTimer = () => {
    if (dispatchTimer !== undefined) {
      clearTimeout(dispatchTimer);
      dispatchTimer = undefined;
    }
  };

  const scheduleContinueDispatch = (ctx: ExtensionContext) => {
    clearDispatchTimer();
    dispatchTimer = setTimeout(() => {
      dispatchTimer = undefined;
      const target = pendingTarget;
      if (!target) return;
      try {
        if (!ctx.isIdle()) return;
        pendingTarget = undefined;
        pi.sendUserMessage(
          `/${WORKSPACE_CD_CONTINUE_COMMAND} ${encodeURIComponent(target)}`,
          // Runtime 0.84 supports command dispatch; deno.lock types are still 0.83.
          { expandPromptTemplates: true } as Parameters<
            typeof pi.sendUserMessage
          >[1],
        );
      } catch {
        // reload / shutdown で ctx/pi が無効化されても落とさない
      }
    }, 0);
  };

  pi.on("agent_settled", (_event, ctx) => {
    if (!pendingTarget) return;
    scheduleContinueDispatch(ctx);
  });

  pi.on("session_shutdown", () => {
    pendingTarget = undefined;
    clearDispatchTimer();
  });

  const runSwitch = async (
    ctx: ExtensionCommandContext,
    rawPath: string,
    autoContinue: boolean,
  ) => {
    const resolved = resolveWorkspacePath(rawPath, ctx.cwd);
    const outcome = await switchWorkspaceSession(
      makeSwitchDeps(ctx),
      resolved,
      { autoContinue },
    );

    if (!outcome.switched && ctx.hasUI) {
      ctx.ui.notify(`Already in ${resolved}`, "info");
    }
  };

  pi.registerCommand(WORKSPACE_CD_COMMAND, {
    description:
      "Fork the current session and switch Pi cwd to another directory",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        if (ctx.hasUI) {
          ctx.ui.notify("Usage: /workspace-cd <path>", "warning");
        }
        return;
      }

      await runSwitch(ctx, trimmed, false);
    },
  });

  pi.registerCommand(WORKSPACE_CD_CONTINUE_COMMAND, {
    description: "Internal: fork session into destination cwd and continue",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        const message = "Destination path is required";
        notifyError(ctx, message);
        throw new WorkspacePathError(message);
      }

      let decoded: string;
      try {
        decoded = decodeURIComponent(trimmed);
      } catch {
        decoded = trimmed;
      }

      await runSwitch(ctx, decoded, true);
    },
  });

  pi.registerTool({
    name: "switch_workspace_cwd",
    label: "Switch Workspace CWD",
    description:
      "After jj workspace setup completes, fork this session into the destination directory and continue the original task there. Must be the final tool call in the current session.",
    parameters: Type.Object({
      path: Type.String({
        description: "Destination jj workspace directory path",
      }),
    }),
    execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolved = resolveWorkspacePath(params.path, ctx.cwd);
      const currentPath = resolveWorkspacePath(".", ctx.cwd);
      if (resolved === currentPath) {
        return Promise.resolve({
          content: [{
            type: "text",
            text: `Already in ${resolved}; no switch needed.`,
          }],
          details: { switched: false, path: resolved },
        });
      }

      if (!ctx.sessionManager.getSessionFile()) {
        throw new WorkspacePathError(
          "Current session is not persisted; cannot fork across cwd",
        );
      }

      pendingTarget = resolved;

      return Promise.resolve({
        content: [{
          type: "text",
          text:
            `Scheduled session switch to ${resolved}. Do not call any more tools in this session; work will continue automatically in the new cwd after settlement.`,
        }],
        details: { path: resolved, scheduled: true },
        terminate: true,
      });
    },
  });
}
