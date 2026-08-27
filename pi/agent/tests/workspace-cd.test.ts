import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import workspaceCd, {
  resolveWorkspacePath,
  switchWorkspaceSession,
  WORKSPACE_CD_COMMAND,
  WORKSPACE_CD_CONTINUE_COMMAND,
  WorkspacePathError,
} from "../extensions/workspace-cd.ts";

const makeTempDir = () => mkdtempSync(join(tmpdir(), "pi-workspace-cd-"));

const persistSessionHistory = (session: SessionManager) => {
  const timestamp = Date.now();
  session.appendMessage({
    role: "user",
    content: [{ type: "text", text: "seed user" }],
    timestamp,
  });
  session.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "seed assistant" }],
    timestamp,
    api: "openai-responses",
    provider: "openai",
    model: "test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
  });
  session.appendCustomEntry("test.history", { note: "history marker" });
};

type CommandHandler = (
  args: string,
  ctx: Record<string, unknown>,
) => Promise<void>;
type ToolExecute = (
  toolCallId: string,
  params: { path: string },
  signal: AbortSignal | undefined,
  onUpdate: unknown,
  ctx: Record<string, unknown>,
) => Promise<
  {
    content: Array<{ type: string; text?: string }>;
    details: unknown;
    terminate?: boolean;
  }
>;
type EventHandler = (
  event: unknown,
  ctx: Record<string, unknown>,
) => void;

function createFakePi(cwd: string) {
  const commands = new Map<string, CommandHandler>();
  const tools = new Map<string, ToolExecute>();
  const eventHandlers = new Map<string, EventHandler[]>();
  const sendCalls: Array<{ content: string; options?: unknown }> = [];
  const notifications: Array<{ message: string; level: string }> = [];
  let idle = true;

  const pi = {
    registerCommand(name: string, options: { handler: CommandHandler }) {
      commands.set(name, options.handler);
    },
    registerTool(tool: { name: string; execute: ToolExecute }) {
      tools.set(tool.name, tool.execute);
    },
    sendUserMessage(content: string, options?: unknown) {
      sendCalls.push({ content, options });
    },
    on(event: string, handler: EventHandler) {
      const handlers = eventHandlers.get(event) ?? [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
    },
  };

  workspaceCd(pi as never);

  const emit = (
    event: string,
    eventData: unknown,
    ctx: Record<string, unknown>,
  ) => {
    for (const handler of eventHandlers.get(event) ?? []) {
      handler(eventData, ctx);
    }
  };

  const makeCtx = (overrides?: Partial<Record<string, unknown>>) => ({
    cwd,
    hasUI: true,
    isIdle: () => idle,
    ui: {
      notify: (message: string, level: string) => {
        notifications.push({ message, level });
      },
    },
    sessionManager: {
      getSessionFile: () => "/tmp/source.jsonl",
    },
    switchSession: () => Promise.resolve({ cancelled: false }),
    ...overrides,
  });

  const flushTimers = () => new Promise((resolve) => setTimeout(resolve, 0));

  const makeSwitchSession = (
    sendCalls: string[],
    notifications: Array<{ message: string; level: string }>,
  ) =>
  (
    _path: string,
    options?: {
      withSession?: (
        ctx: {
          hasUI: boolean;
          ui: { notify: (message: string, level: string) => void };
          sendUserMessage: (message: string) => Promise<void>;
        },
      ) => Promise<void>;
    },
  ) => {
    if (options?.withSession) {
      return options.withSession({
        hasUI: true,
        ui: {
          notify: (message: string, level: string) => {
            notifications.push({ message, level });
          },
        },
        sendUserMessage: (message: string) => {
          sendCalls.push(message);
          return Promise.resolve();
        },
      }).then(() => ({ cancelled: false }));
    }
    return Promise.resolve({ cancelled: false });
  };

  return {
    commands,
    tools,
    sendCalls,
    notifications,
    makeCtx,
    makeSwitchSession,
    emit,
    flushTimers,
    setIdle: (value: boolean) => {
      idle = value;
    },
  };
}

Deno.test("resolveWorkspacePath resolves relative paths from cwd", () => {
  const root = makeTempDir();
  const nested = join(root, "nested");
  mkdirSync(nested);
  assertEquals(
    resolveWorkspacePath("nested", root),
    resolveWorkspacePath(nested, root),
  );
});

Deno.test("resolveWorkspacePath rejects missing paths", () => {
  const root = makeTempDir();
  assertThrows(
    () => resolveWorkspacePath(join(root, "missing"), root),
    WorkspacePathError,
    "Directory not found",
  );
});

Deno.test("resolveWorkspacePath rejects files", () => {
  const root = makeTempDir();
  const filePath = join(root, "file.txt");
  writeFileSync(filePath, "x");
  assertThrows(
    () => resolveWorkspacePath(filePath, root),
    WorkspacePathError,
    "Not a directory",
  );
});

Deno.test("resolveWorkspacePath rejects empty input", () => {
  const root = makeTempDir();
  assertThrows(
    () => resolveWorkspacePath("  ", root),
    WorkspacePathError,
    "Path is required",
  );
});

Deno.test("switchWorkspaceSession no-ops when target equals current cwd", async () => {
  const root = makeTempDir();
  let forkCalled = false;
  const outcome = await switchWorkspaceSession(
    {
      forkFrom: () => {
        forkCalled = true;
        throw new Error("forkFrom should not run");
      },
      switchSession: () => Promise.resolve({ cancelled: false }),
      getSessionFile: () => "/tmp/source.jsonl",
      getCwd: () => root,
    },
    root,
  );
  assertEquals(outcome.switched, false);
  assertEquals(outcome.targetPath, resolveWorkspacePath(".", root));
  assertEquals(forkCalled, false);
});

Deno.test("switchWorkspaceSession requires a persisted source session", async () => {
  const source = makeTempDir();
  const target = makeTempDir();
  await assertRejects(
    () =>
      switchWorkspaceSession(
        {
          forkFrom: SessionManager.forkFrom,
          switchSession: () => Promise.resolve({ cancelled: false }),
          getSessionFile: () => undefined,
          getCwd: () => source,
        },
        target,
      ),
    WorkspacePathError,
    "not persisted",
  );
});

Deno.test("switchWorkspaceSession forks into target cwd and preserves history", async () => {
  const sourceCwd = makeTempDir();
  const targetCwd = makeTempDir();
  const sessionDir = join(sourceCwd, "sessions");

  const source = SessionManager.create(sourceCwd, sessionDir);
  persistSessionHistory(source);
  const sourceFile = source.getSessionFile();
  if (!sourceFile) throw new Error("expected persisted source session");

  let switchedTo: string | undefined;
  const freshNotifications: Array<{ message: string; level: string }> = [];
  const continueMessages: string[] = [];

  const outcome = await switchWorkspaceSession(
    {
      forkFrom: SessionManager.forkFrom,
      switchSession: async (sessionPath, options) => {
        switchedTo = sessionPath;
        if (options?.withSession) {
          await options.withSession({
            hasUI: true,
            ui: {
              notify: (message: string, level: string) => {
                freshNotifications.push({ message, level });
              },
            },
            sendUserMessage: (message: string) => {
              continueMessages.push(message);
              return Promise.resolve();
            },
          } as never);
        }
        return { cancelled: false };
      },
      getSessionFile: () => sourceFile,
      getCwd: () => sourceCwd,
    },
    targetCwd,
    { autoContinue: true },
  );

  assertEquals(outcome.switched, true);
  assertEquals(outcome.targetPath, resolveWorkspacePath(targetCwd, sourceCwd));
  assertEquals(continueMessages.length, 1);
  assertEquals(freshNotifications, [{
    message: `Switched to ${resolveWorkspacePath(targetCwd, sourceCwd)}`,
    level: "info",
  }]);
  if (!outcome.sessionFile) throw new Error("expected forked session file");
  assertEquals(switchedTo, outcome.sessionFile);

  const forked = SessionManager.open(outcome.sessionFile, undefined, targetCwd);
  assertEquals(forked.getCwd(), targetCwd);
  assertEquals(forked.getEntries().length, source.getEntries().length);
});

Deno.test("switchWorkspaceSession uses forkFrom with source session file and target cwd", async () => {
  const sourceCwd = await mkdtemp(join(tmpdir(), "pi-ws-source-"));
  const targetCwd = await mkdtemp(join(tmpdir(), "pi-ws-target-"));
  const sessionDir = join(sourceCwd, "sessions");
  const source = SessionManager.create(sourceCwd, sessionDir);
  persistSessionHistory(source);
  const sourceFile = source.getSessionFile();
  if (!sourceFile) throw new Error("expected source session");

  let forkArgs: { sourcePath?: string; targetCwd?: string } = {};
  await switchWorkspaceSession(
    {
      forkFrom: (sourcePath, target) => {
        forkArgs = { sourcePath, targetCwd: target };
        return SessionManager.forkFrom(
          sourcePath,
          target,
          join(target, "sessions"),
        );
      },
      switchSession: () => Promise.resolve({ cancelled: false }),
      getSessionFile: () => sourceFile,
      getCwd: () => sourceCwd,
    },
    targetCwd,
  );

  assertEquals(forkArgs.sourcePath, sourceFile);
  assertEquals(forkArgs.targetCwd, resolveWorkspacePath(targetCwd, sourceCwd));
});

Deno.test("switchWorkspaceSession removes fork file when switch is cancelled", async () => {
  const sourceCwd = await mkdtemp(join(tmpdir(), "pi-ws-cancel-"));
  const targetCwd = await mkdtemp(join(tmpdir(), "pi-ws-cancel-target-"));
  const sessionDir = join(sourceCwd, "sessions");
  const source = SessionManager.create(sourceCwd, sessionDir);
  persistSessionHistory(source);
  const sourceFile = source.getSessionFile();
  if (!sourceFile) throw new Error("expected source session");

  let forkSessionFile: string | undefined;
  await assertRejects(
    () =>
      switchWorkspaceSession(
        {
          forkFrom: (sourcePath, target) => {
            const forked = SessionManager.forkFrom(
              sourcePath,
              target,
              join(target, "sessions"),
            );
            forkSessionFile = forked.getSessionFile();
            return forked;
          },
          switchSession: () => Promise.resolve({ cancelled: true }),
          getSessionFile: () => sourceFile,
          getCwd: () => sourceCwd,
        },
        targetCwd,
        { autoContinue: true },
      ),
    WorkspacePathError,
    "cancelled",
  );

  if (!forkSessionFile) throw new Error("expected fork session file");
  assertEquals(existsSync(forkSessionFile), false);
});

Deno.test("switch_workspace_cwd stores pending target and terminates without sendUserMessage", async () => {
  const root = makeTempDir();
  const target = join(root, "dest");
  mkdirSync(target);

  const fake = createFakePi(root);
  const execute = fake.tools.get("switch_workspace_cwd");
  if (!execute) throw new Error("tool not registered");

  const resolved = resolveWorkspacePath(target, root);
  const result = await execute(
    "call-1",
    { path: "dest" },
    undefined,
    undefined,
    {
      cwd: root,
      sessionManager: { getSessionFile: () => "/tmp/source.jsonl" },
    },
  );

  assertEquals(fake.sendCalls.length, 0);
  assertEquals(result.details, { path: resolved, scheduled: true });
  assertEquals(result.terminate, true);
});

Deno.test("switch_workspace_cwd dispatches continue command after agent_settled when idle", async () => {
  const root = makeTempDir();
  const target = join(root, "dest");
  mkdirSync(target);

  const fake = createFakePi(root);
  const execute = fake.tools.get("switch_workspace_cwd");
  if (!execute) throw new Error("tool not registered");

  const resolved = resolveWorkspacePath(target, root);
  await execute(
    "call-1",
    { path: "dest" },
    undefined,
    undefined,
    {
      cwd: root,
      sessionManager: { getSessionFile: () => "/tmp/source.jsonl" },
    },
  );

  assertEquals(fake.sendCalls.length, 0);
  fake.emit("agent_settled", {}, fake.makeCtx());
  await fake.flushTimers();

  assertEquals(fake.sendCalls, [{
    content: `/${WORKSPACE_CD_CONTINUE_COMMAND} ${
      encodeURIComponent(resolved)
    }`,
    options: { expandPromptTemplates: true },
  }]);
});

Deno.test("switch_workspace_cwd rejects non-persisted session before scheduling", () => {
  const root = makeTempDir();
  const target = join(root, "dest");
  mkdirSync(target);

  const fake = createFakePi(root);
  const execute = fake.tools.get("switch_workspace_cwd");
  if (!execute) throw new Error("tool not registered");

  assertThrows(
    () =>
      execute(
        "call-1",
        { path: "dest" },
        undefined,
        undefined,
        {
          cwd: root,
          sessionManager: { getSessionFile: () => undefined },
        },
      ),
    WorkspacePathError,
    "not persisted",
  );

  assertEquals(fake.sendCalls.length, 0);
  fake.emit("agent_settled", {}, fake.makeCtx());
});

Deno.test("session_shutdown clears pending workspace-cd dispatch", async () => {
  const root = makeTempDir();
  const target = join(root, "dest");
  mkdirSync(target);

  const fake = createFakePi(root);
  const execute = fake.tools.get("switch_workspace_cwd");
  if (!execute) throw new Error("tool not registered");

  await execute(
    "call-1",
    { path: "dest" },
    undefined,
    undefined,
    {
      cwd: root,
      sessionManager: { getSessionFile: () => "/tmp/source.jsonl" },
    },
  );

  fake.emit("agent_settled", {}, fake.makeCtx());
  fake.emit("session_shutdown", {}, fake.makeCtx());
  await fake.flushTimers();

  assertEquals(fake.sendCalls.length, 0);
});

Deno.test("switch_workspace_cwd throws WorkspacePathError for invalid path", () => {
  const root = makeTempDir();
  const fake = createFakePi(root);
  const execute = fake.tools.get("switch_workspace_cwd");
  if (!execute) throw new Error("tool not registered");

  assertThrows(
    () =>
      execute(
        "call-1",
        { path: join(root, "missing") },
        undefined,
        undefined,
        { cwd: root },
      ),
    WorkspacePathError,
  );
  assertEquals(fake.sendCalls.length, 0);
});

Deno.test("switch_workspace_cwd skips queue when already in target cwd", async () => {
  const root = makeTempDir();
  const fake = createFakePi(root);
  const execute = fake.tools.get("switch_workspace_cwd");
  if (!execute) throw new Error("tool not registered");

  const result = await execute("call-1", { path: "." }, undefined, undefined, {
    cwd: root,
  });

  assertEquals(fake.sendCalls.length, 0);
  assertEquals((result.details as { switched: boolean }).switched, false);
  assertEquals(result.terminate, undefined);
});

Deno.test("/workspace-cd-continue throws on cancelled switch without continuation", async () => {
  const source = makeTempDir();
  const target = makeTempDir();
  const sessionDir = join(source, "sessions");
  const sourceSession = SessionManager.create(source, sessionDir);
  persistSessionHistory(sourceSession);
  const sourceFile = sourceSession.getSessionFile();
  if (!sourceFile) throw new Error("expected source session");

  const fake = createFakePi(source);
  const continueHandler = fake.commands.get(WORKSPACE_CD_CONTINUE_COMMAND);
  if (!continueHandler) throw new Error("continue command not registered");

  const freshSendCalls: string[] = [];
  const resolvedTarget = resolveWorkspacePath(target, source);
  await assertRejects(
    () =>
      continueHandler(encodeURIComponent(resolvedTarget), {
        ...fake.makeCtx(),
        sessionManager: { getSessionFile: () => sourceFile },
        switchSession: () => Promise.resolve({ cancelled: true }),
      }),
    WorkspacePathError,
    "cancelled",
  );

  assertEquals(freshSendCalls.length, 0);
});

Deno.test("/workspace-cd-continue switches and sends continuation in fresh context", async () => {
  const source = makeTempDir();
  const target = makeTempDir();
  const sessionDir = join(source, "sessions");
  const sourceSession = SessionManager.create(source, sessionDir);
  persistSessionHistory(sourceSession);
  const sourceFile = sourceSession.getSessionFile();
  if (!sourceFile) throw new Error("expected source session");

  const fake = createFakePi(source);
  const continueHandler = fake.commands.get(WORKSPACE_CD_CONTINUE_COMMAND);
  if (!continueHandler) throw new Error("continue command not registered");

  const freshSendCalls: string[] = [];
  const resolvedTarget = resolveWorkspacePath(target, source);
  await continueHandler(encodeURIComponent(resolvedTarget), {
    ...fake.makeCtx(),
    sessionManager: { getSessionFile: () => sourceFile },
    switchSession: fake.makeSwitchSession(freshSendCalls, fake.notifications),
  });

  assertEquals(freshSendCalls.length, 1);
  assertEquals(
    fake.notifications.some((n) =>
      n.level === "info" && n.message === `Switched to ${resolvedTarget}`
    ),
    true,
  );
});

Deno.test("/workspace-cd manual switch does not send continuation", async () => {
  const source = makeTempDir();
  const target = makeTempDir();
  const sessionDir = join(source, "sessions");
  const sourceSession = SessionManager.create(source, sessionDir);
  persistSessionHistory(sourceSession);
  const sourceFile = sourceSession.getSessionFile();
  if (!sourceFile) throw new Error("expected source session");

  const fake = createFakePi(source);
  const handler = fake.commands.get(WORKSPACE_CD_COMMAND);
  if (!handler) throw new Error("command not registered");

  const resolvedTarget = resolveWorkspacePath(target, source);
  const freshSendCalls: string[] = [];
  await handler(resolvedTarget, {
    ...fake.makeCtx(),
    sessionManager: { getSessionFile: () => sourceFile },
    switchSession: fake.makeSwitchSession(freshSendCalls, fake.notifications),
  });

  assertEquals(freshSendCalls.length, 0);
  assertEquals(
    fake.notifications.some((n) =>
      n.level === "info" && n.message === `Switched to ${resolvedTarget}`
    ),
    true,
  );
});

Deno.test("/workspace-cd-continue without path fails clearly", async () => {
  const root = makeTempDir();
  const fake = createFakePi(root);
  const handler = fake.commands.get(WORKSPACE_CD_CONTINUE_COMMAND);
  if (!handler) throw new Error("continue command not registered");

  await assertRejects(
    () => handler("", fake.makeCtx()),
    WorkspacePathError,
  );
  assertEquals(fake.notifications.some((n) => n.level === "error"), true);
});

Deno.test("/workspace-cd rejects missing args with usage notification", async () => {
  const root = makeTempDir();
  const fake = createFakePi(root);
  const handler = fake.commands.get(WORKSPACE_CD_COMMAND);
  if (!handler) throw new Error("command not registered");

  await handler("", fake.makeCtx());

  assertEquals(fake.notifications, [{
    message: "Usage: /workspace-cd <path>",
    level: "warning",
  }]);
});
