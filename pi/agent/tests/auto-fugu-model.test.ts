import { assertEquals } from "jsr:@std/assert@1.0";
import autoFuguModel from "../extensions/auto-fugu-model.ts";

const PROVIDER = "sakana-ai-console";

type Model = {
  provider: string;
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
};

type FakeContext = {
  model: Model;
  scopedModels: Array<{ model: Model; alias: string }>;
  hasUI: boolean;
  ui: { notify: (message: string, level?: string) => void };
  modelRegistry: {
    find: (provider: string, id: string) => Model | undefined;
  };
  isIdle: () => boolean;
};

type Handler = (event: unknown, ctx: FakeContext) => unknown;

const makeModel = (id: string): Model => ({
  provider: PROVIDER,
  id,
  name: id,
  contextWindow: 300_000,
  maxTokens: 8192,
});

function createFakePi() {
  const handlers = new Map<string, Handler[]>();
  const eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  const tools = new Map<string, { execute: (...args: unknown[]) => unknown }>();
  const commands = new Map<
    string,
    { handler: (...args: unknown[]) => unknown }
  >();
  const setModelCalls: Array<{ provider: string; id: string }> = [];
  let currentCtx: FakeContext | undefined;

  const pi = {
    on(type: string, handler: Handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
    },
    events: {
      on(name: string, cb: (payload: unknown) => void) {
        const set = eventHandlers.get(name) ?? new Set();
        set.add(cb);
        eventHandlers.set(name, set);
        return () => set.delete(cb);
      },
      emit(name: string, payload: unknown) {
        for (const cb of eventHandlers.get(name) ?? []) cb(payload);
      },
    },
    setModel(model: { provider: string; id: string }) {
      setModelCalls.push({ provider: model.provider, id: model.id });
      if (!currentCtx) return Promise.resolve(true);
      currentCtx.model = makeModel(model.id);
      const modelSelectHandlers = handlers.get("model_select") ?? [];
      return Promise.all(
        modelSelectHandlers.map((handler) =>
          handler(
            { model: currentCtx!.model, source: "set" },
            currentCtx!,
          )
        ),
      ).then(() => true);
    },
    registerTool(tool: {
      name: string;
      execute: (...args: unknown[]) => unknown;
    }) {
      tools.set(tool.name, tool);
    },
    registerCommand(
      name: string,
      spec: { handler: (...args: unknown[]) => unknown },
    ) {
      commands.set(name, spec);
    },
    sendUserMessage(_text: string) {},
  };

  const dispatch = async (
    type: string,
    event: unknown,
    ctx: FakeContext,
  ) => {
    currentCtx = ctx;
    for (const handler of handlers.get(type) ?? []) {
      await handler(event, ctx);
    }
  };

  const withCtx = <T>(ctx: FakeContext, fn: () => Promise<T> | T) => {
    currentCtx = ctx;
    return fn();
  };

  return {
    pi,
    dispatch,
    withCtx,
    tools,
    commands,
    setModelCalls,
  };
}

function createCtx(
  overrides?: {
    modelId?: string;
    scopedModelIds?: string[];
  },
): FakeContext {
  const modelId = overrides?.modelId ?? "fugu";
  const ui = {
    notify: (_message: string, _level?: string) => {},
  };
  return {
    model: makeModel(modelId),
    scopedModels: (overrides?.scopedModelIds ?? []).map((id: string) => ({
      model: makeModel(id),
      alias: id,
    })),
    hasUI: false,
    ui,
    modelRegistry: {
      find: (provider: string, id: string) => {
        if (provider !== PROVIDER) return undefined;
        if (id === "fugu" || id === "fugu-ultra") return makeModel(id);
        return undefined;
      },
    },
    isIdle: () => true,
  };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

Deno.test("escalate → settle → restore returns to fugu", async () => {
  const { pi, dispatch, tools, withCtx } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx();
  const escalate = tools.get("escalate_to_fugu_ultra")!;

  await withCtx(ctx, () =>
    escalate.execute(
      "tool-1",
      { reason: "high-stakes architecture decision" },
      undefined,
      undefined,
      ctx,
    ));
  assertEquals(ctx.model.id, "fugu-ultra");

  await dispatch("agent_settled", {}, ctx);
  assertEquals(ctx.model.id, "fugu");
});

Deno.test("manual model_select suppresses automatic routing", async () => {
  const { pi, dispatch } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx();
  ctx.model = makeModel("fugu-ultra");

  await dispatch(
    "model_select",
    { model: makeModel("fugu-ultra"), source: "set" },
    ctx,
  );

  await dispatch(
    "input",
    {
      source: "interactive",
      text: "PRを作って",
      streamingBehavior: "default",
    },
    ctx,
  );
  await dispatch("before_agent_start", { prompt: "PRを作って" }, ctx);

  assertEquals(ctx.model.id, "fugu-ultra");
});

Deno.test("struggle escalation after consecutive validation failures", async () => {
  const { pi, dispatch } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx();
  await dispatch("agent_start", {}, ctx);

  for (const toolCallId of ["bash-1", "bash-2"]) {
    await dispatch(
      "tool_execution_start",
      {
        toolName: "bash",
        toolCallId,
        args: { command: "deno test" },
      },
      ctx,
    );
    await dispatch(
      "tool_execution_end",
      { toolName: "bash", toolCallId, isError: true },
      ctx,
    );
  }

  assertEquals(ctx.model.id, "fugu-ultra");
});

Deno.test("scopedModels rejects ultra escalation", async () => {
  const { pi, tools, withCtx } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx({ scopedModelIds: ["fugu"] });
  const escalate = tools.get("escalate_to_fugu_ultra")!;

  await withCtx(ctx, () =>
    escalate.execute(
      "tool-1",
      { reason: "needs ultra" },
      undefined,
      undefined,
      ctx,
    ));
  assertEquals(ctx.model.id, "fugu");
});

Deno.test("enabled=false suppresses high-stakes routing", async () => {
  const { pi, dispatch, commands } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx();
  const command = commands.get("auto-fugu")!;

  await command.handler("off", ctx);

  await dispatch(
    "input",
    {
      source: "interactive",
      text: "認証フローを設計して",
      streamingBehavior: "default",
    },
    ctx,
  );
  await dispatch(
    "before_agent_start",
    { prompt: "認証フローを設計して" },
    ctx,
  );

  assertEquals(ctx.model.id, "fugu");
});

Deno.test("manual override is cleared by session_start", async () => {
  const { pi, dispatch } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx();
  ctx.model = makeModel("fugu-ultra");
  await dispatch(
    "model_select",
    { model: makeModel("fugu-ultra"), source: "set" },
    ctx,
  );

  // New session should re-enable automatic routing.
  await dispatch("session_start", {}, ctx);

  await dispatch(
    "input",
    {
      source: "interactive",
      text: "認証フローを設計して",
      streamingBehavior: "default",
    },
    ctx,
  );
  await dispatch("before_agent_start", { prompt: "認証フローを設計して" }, ctx);

  assertEquals(ctx.model.id, "fugu-ultra");
});

Deno.test("manual override is cleared by /auto-fugu on", async () => {
  const { pi, dispatch, commands } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx();
  ctx.model = makeModel("fugu");
  await dispatch(
    "model_select",
    { model: makeModel("fugu"), source: "set" },
    ctx,
  );

  await commands.get("auto-fugu")!.handler("on", ctx);

  await dispatch(
    "input",
    {
      source: "interactive",
      text: "認証フローを設計して",
      streamingBehavior: "default",
    },
    ctx,
  );
  await dispatch("before_agent_start", { prompt: "認証フローを設計して" }, ctx);

  assertEquals(ctx.model.id, "fugu-ultra");
});

Deno.test("model_select source=restore does not trigger manual override", async () => {
  const { pi, dispatch } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx();
  await dispatch(
    "model_select",
    { model: makeModel("fugu"), source: "restore" },
    ctx,
  );

  // Automatic routing should still work after a restore-sourced select.
  await dispatch(
    "input",
    {
      source: "interactive",
      text: "認証フローを設計して",
      streamingBehavior: "default",
    },
    ctx,
  );
  await dispatch("before_agent_start", { prompt: "認証フローを設計して" }, ctx);

  assertEquals(ctx.model.id, "fugu-ultra");
});

Deno.test("manual override suppresses struggle escalation", async () => {
  const { pi, dispatch } = createFakePi();
  autoFuguModel(pi as never);
  await flushMicrotasks();

  const ctx = createCtx();
  await dispatch(
    "model_select",
    { model: makeModel("fugu"), source: "set" },
    ctx,
  );
  await dispatch("agent_start", {}, ctx);

  for (const toolCallId of ["bash-1", "bash-2"]) {
    await dispatch(
      "tool_execution_start",
      { toolName: "bash", toolCallId, args: { command: "deno test" } },
      ctx,
    );
    await dispatch(
      "tool_execution_end",
      { toolName: "bash", toolCallId, isError: true },
      ctx,
    );
  }

  assertEquals(ctx.model.id, "fugu");
});
