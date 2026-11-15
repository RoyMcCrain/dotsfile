import { test } from "bun:test";
import {
  deepEqual as assertEquals,
  equal as assertEqual,
} from "node:assert/strict";
import timeline from "../extensions/timeline.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  formatRecord,
  markInterrupted,
  NOTE_LIMIT,
  readRecord,
  sanitize,
  type TimelineRecord,
  validateTasks,
} from "../lib/timeline.ts";

type FakeContext = {
  hasUI: boolean;
  mode: "tui" | "rpc";
  sessionManager: {
    getBranch: () => { type: string; customType?: string; data?: unknown }[];
  };
  ui: {
    setWidget: (key: string, value: unknown, options?: unknown) => void;
    notify: (message: string, level: string) => void;
    custom: (
      factory: (
        tui: FakeTui,
        theme: FakeTheme,
        keys: FakeKeys,
        done: () => void,
      ) => FakeScreen,
      options?: { overlay?: boolean },
    ) => Promise<void>;
  };
};
type FakeTui = { terminal: { rows: number }; requestRender: () => void };
type FakeTheme = { fg: (_style: string, text: string) => string };
type FakeKeys = { matches: (data: string, key: string) => boolean };
type FakeScreen = {
  render: (width: number) => string[];
  handleInput: (data: string) => void;
};
type Handler = (event: unknown, ctx: FakeContext) => unknown;
type Tool = {
  execute: (
    _id: string,
    params: { tasks?: unknown; note?: unknown },
    _signal: undefined,
    _update: undefined,
    ctx: FakeContext,
  ) => Promise<{ content: { text: string }[]; isError?: boolean }>;
};
type Command = (_args: string, ctx: FakeContext) => Promise<void>;

test("validation rejects invalid snapshots without mutating a plan and sanitizes controls", () => {
  assertEquals(
    validateTasks([{ id: "a", title: "ok", status: "pending" }, {
      id: "a",
      title: "bad",
      status: "completed",
    }]),
    undefined,
  );
  assertEquals(validateTasks([]), []);
  assertEqual(sanitize("進捗\u001b[31m\n作業"), "進捗 作業");
});

test("notes validate, sanitize, and ignore malformed persisted fields", () => {
  const note = readRecord({
    at: "2024-01-01T00:00:00Z",
    kind: "note",
    note: "決定\u001b[31m\n理由",
    extra: "not retained",
  });
  assertEquals(note, {
    at: "2024-01-01T00:00:00.000Z",
    kind: "note",
    note: "決定 理由",
  });
  assertEqual(
    readRecord({ at: "2024-01-01", kind: "note", note: "  " }),
    undefined,
  );
  assertEqual(
    readRecord({
      at: "2024-01-01",
      kind: "note",
      note: "x".repeat(NOTE_LIMIT + 1),
    }),
    undefined,
  );
});

test("history shows JST midnight without changing the stored UTC timestamp", () => {
  const record = {
    at: "2026-11-15T15:00:00.000Z",
    kind: "tool-end",
    toolId: "midnight",
    tool: "read",
    outcome: "ok",
  } satisfies TimelineRecord;

  assertEquals(formatRecord(record), ["00:00:00 read 終了"]);
  assertEqual(record.at, "2026-11-15T15:00:00.000Z");
});

test("RPC widget uses strings and plan/task rows remain reachable beyond capped history", async () => {
  const h = new Map<string, Handler[]>();
  let tool: Tool | undefined;
  let command: Command | undefined;
  const entries: { type: string; data: unknown }[] = [];
  let branch: ReturnType<FakeContext["sessionManager"]["getBranch"]> = [];
  let widget: unknown;
  let screen: FakeScreen | undefined;
  let focusedOverlay = false;
  const pi = {
    on: (type: string, fn: Handler) =>
      h.set(type, [...(h.get(type) ?? []), fn]),
    registerTool: (value: Tool) => {
      tool = value;
    },
    registerCommand: (_name: string, value: { handler: Command }) => {
      command = value.handler;
    },
    appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
  };
  timeline(pi as never);
  const tui: FakeTui = { terminal: { rows: 6 }, requestRender: () => {} };
  const ctx: FakeContext = {
    hasUI: true,
    mode: "rpc",
    sessionManager: { getBranch: () => branch },
    ui: {
      setWidget: (_key, value) => {
        widget = value;
      },
      notify: () => {},
      custom: (factory, options) => {
        focusedOverlay = options?.overlay === true;
        screen = factory(tui, { fg: (_style, text) => text }, {
          matches: (data, key) => data === key,
        }, () => {});
        return Promise.resolve();
      },
    },
  };
  const emit = async (type: string, event: unknown) => {
    for (const fn of h.get(type) ?? []) await fn(event, ctx);
  };
  const invoke = (params: { tasks?: unknown }) =>
    tool!.execute("id", params, undefined, undefined, ctx);
  await emit("session_start", {});
  const plan = Array.from({ length: 50 }, (_, i) => ({
    id: `task-${i}`,
    title: i === 49 ? "末尾" : `作業${i}`,
    status: i === 49 ? "blocked" : "pending",
  }));
  await invoke({ tasks: plan });
  assertEqual(Array.isArray(widget), true);
  for (let i = 0; i < 205; i++) {
    await emit("tool_execution_start", {
      toolCallId: `${i}`,
      toolName: "read",
      args: { path: "private" },
    });
  }
  branch = [
    {
      type: "custom",
      customType: "timeline",
      data: {
        at: "2024-01-01T00:00:00Z",
        kind: "plan",
        tasks: plan,
      },
    },
    ...Array.from(
      { length: 205 },
      (_, i) => ({
        type: "custom",
        customType: "timeline",
        data: {
          at: "2024-01-01T00:00:00Z",
          kind: "tool-end",
          toolId: `${i}`,
          tool: "read",
          outcome: "ok",
        },
      }),
    ),
  ];
  await emit("session_tree", {});
  ctx.mode = "tui";
  await command!("", ctx);
  assertEqual(focusedOverlay, true);
  assertEqual(
    screen!.render(20).some((line) => line.includes("末尾")),
    false,
  );
  screen!.handleInput("tui.input.tab");
  for (let page = 0; page < 50; page++) {
    screen!.handleInput("tui.select.down");
  }
  assertEqual(
    screen!.render(20).some((line) => line.includes("末尾")),
    true,
  );
  assertEqual(
    screen!.render(20).every((line) => visibleWidth(line) <= 20),
    true,
  );
  assertEqual(entries.length, 206);
});

test("timeline note-only and combined calls append in order and invalid notes are atomic", async () => {
  const handlers = new Map<string, Handler[]>();
  let tool: Tool | undefined;
  let command: Command | undefined;
  let screen: FakeScreen | undefined;
  const persisted: TimelineRecord[] = [];
  let branch: ReturnType<FakeContext["sessionManager"]["getBranch"]> = [];
  const pi = {
    on: (type: string, fn: Handler) =>
      handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    registerTool: (value: Tool) => tool = value,
    registerCommand: (_name: string, value: { handler: Command }) =>
      command = value.handler,
    appendEntry: (_type: string, data: unknown) =>
      persisted.push(data as TimelineRecord),
  };
  timeline(pi as never);
  const ctx: FakeContext = {
    hasUI: false,
    mode: "rpc",
    sessionManager: { getBranch: () => branch },
    ui: {
      setWidget: () => {},
      notify: () => {},
      custom: (factory) => {
        screen = factory(
          { terminal: { rows: 12 }, requestRender: () => {} },
          { fg: (_style, text) => text },
          { matches: (data, key) => data === key },
          () => {},
        );
        return Promise.resolve();
      },
    },
  };
  const emit = async (type: string) => {
    for (const fn of handlers.get(type) ?? []) await fn({}, ctx);
  };
  await emit("session_start");
  const tasks = [{ id: "one", title: "Plan", status: "pending" }];
  await tool!.execute(
    "n",
    { note: "  Start\nnow " },
    undefined,
    undefined,
    ctx,
  );
  assertEqual(persisted[0]!.note, "Start now");
  await tool!.execute("p", { tasks, note: "Next" }, undefined, undefined, ctx);
  const count = persisted.length;
  const result = await tool!.execute(
    "bad",
    { tasks: [{ ...tasks[0]!, status: "completed" }], note: "x".repeat(321) },
    undefined,
    undefined,
    ctx,
  );
  assertEqual(result.isError, true);
  assertEqual(persisted.length, count);
  assertEqual(
    (await tool!.execute("read", {}, undefined, undefined, ctx)).content[0]!
      .text,
    JSON.stringify(tasks),
  );
  await tool!.execute(
    "same",
    { tasks, note: "explicit" },
    undefined,
    undefined,
    ctx,
  );
  assertEquals(persisted.map((entry) => entry.kind), [
    "note",
    "plan",
    "note",
    "note",
  ]);
  branch = persisted.map((data) => ({
    type: "custom",
    customType: "timeline",
    data,
  }));
  await emit("session_tree");
  assertEqual(
    (await tool!.execute("read", {}, undefined, undefined, ctx)).content[0]!
      .text,
    JSON.stringify(tasks),
  );
  ctx.hasUI = true;
  ctx.mode = "tui";
  await command!("", ctx);
  const restored = screen!.render(80).join("\\n");
  assertEqual(restored.includes("✎ メモ"), true);
});

test("restoration preserves exact long IDs when matching interrupted tool spans", () => {
  const prefix = "x".repeat(128);
  const records = [
    readRecord({
      at: "2024-01-01T00:00:00Z",
      kind: "tool-start",
      toolId: `${prefix}A`,
      tool: "read",
    })!,
    readRecord({
      at: "2024-01-01T00:00:01Z",
      kind: "tool-start",
      toolId: `${prefix}B`,
      tool: "read",
    })!,
    readRecord({
      at: "2024-01-01T00:00:02Z",
      kind: "tool-end",
      toolId: `${prefix}B`,
      tool: "read",
      outcome: "ok",
    })!,
  ];
  assertEqual(records[0]!.toolId, `${prefix}A`);
  assertEqual(markInterrupted(records)[0]!.outcome, "interrupted");
});

test("malformed persisted records are ignored; timing zero and concurrent metadata are preserved", async () => {
  const h = new Map<string, Handler[]>();
  let tool: Tool | undefined;
  const persisted: unknown[] = [];
  const branch: { type: string; customType?: string; data?: unknown }[] = [
    {
      type: "custom",
      customType: "timeline",
      data: { at: "2024-01-01T00:00:00Z", kind: "plan", tasks: "bad" },
    },
    {
      type: "custom",
      customType: "timeline",
      data: { at: "oops", kind: "plan", tasks: [] },
    },
  ];
  const pi = {
    on: (type: string, fn: Handler) =>
      h.set(type, [...(h.get(type) ?? []), fn]),
    registerTool: (value: Tool) => {
      tool = value;
    },
    registerCommand: () => {},
    appendEntry: (_type: string, data: unknown) => persisted.push(data),
  };
  timeline(pi as never);
  const ctx: FakeContext = {
    hasUI: false,
    mode: "rpc",
    sessionManager: { getBranch: () => branch },
    ui: { setWidget: () => {}, notify: () => {}, custom: async () => {} },
  };
  const emit = async (type: string, event: unknown) => {
    for (const fn of h.get(type) ?? []) await fn(event, ctx);
  };
  await emit("session_start", {});
  assertEqual(
    (await tool!.execute("t", {}, undefined, undefined, ctx)).content[0]!.text,
    "[]",
  );
  await tool!.execute(
    "t",
    { tasks: [{ id: "x", title: "keep", status: "pending" }] },
    undefined,
    undefined,
    ctx,
  );
  const count = persisted.length;
  await tool!.execute(
    "t",
    { tasks: [{ id: "x", title: "", status: "pending" }] },
    undefined,
    undefined,
    ctx,
  );
  assertEqual(persisted.length, count);
  await emit("tool_execution_start", {
    toolCallId: "a",
    toolName: "bash",
    args: { command: "secret" },
  });
  await emit("tool_execution_start", {
    toolCallId: "b",
    toolName: "read",
    args: { path: "secret" },
  });
  await emit("tool_execution_end", {
    toolCallId: "a",
    toolName: "bash",
    isError: false,
    durationMs: 0,
  });
  await emit("tool_execution_end", {
    toolCallId: "b",
    toolName: "read",
    isError: false,
  });
  const records = persisted as TimelineRecord[];
  assertEqual(
    records.some((item) =>
      item.kind === "tool-end" && item.toolId === "a" &&
      item.timing?.value === 0
    ),
    true,
  );
  assertEqual(
    records.some((item) => JSON.stringify(item).includes("secret")),
    false,
  );
  assertEqual(
    records.some((item) => item.kind === "tool-end" && item.toolId === "b"),
    true,
  );

  branch.length = 0;
  await emit("session_start", {});
  assertEqual(
    (await tool!.execute("t", {}, undefined, undefined, ctx)).content[0]!.text,
    "[]",
  );
});

test("native widget fits narrow and normal widths while exposing width-based overflow", async () => {
  const handlers = new Map<string, Handler[]>();
  let widget: unknown;
  let taskTool: Tool | undefined;
  const pi = {
    on: (type: string, fn: Handler) =>
      handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    registerTool: (tool: Tool) => taskTool = tool,
    registerCommand: () => {},
    appendEntry: () => {},
  };
  timeline(pi as never);
  const ctx: FakeContext = {
    hasUI: true,
    mode: "tui",
    sessionManager: { getBranch: () => [] },
    ui: {
      setWidget: (_key, value) => widget = value,
      notify: () => {},
      custom: async () => {},
    },
  };
  const emit = async (type: string, event: unknown) => {
    for (const handler of handlers.get(type) ?? []) await handler(event, ctx);
  };
  await emit("session_start", {});
  assertEqual(widget, undefined);
  const longTitle = "長い作業タイトル 🧪 絵文字を含む説明".repeat(4);
  await taskTool!.execute(
    "plan",
    {
      tasks: [
        { id: "active", title: longTitle, status: "in_progress" },
        { id: "blocked", title: "保留", status: "blocked" },
      ],
    },
    undefined,
    undefined,
    ctx,
  );
  for (let index = 0; index < 5; index++) {
    await emit("tool_execution_start", {
      toolCallId: `call-${index}`,
      toolName: "同じ道具",
      args: { command: "must not render" },
    });
  }
  const factory = widget as unknown as (tui: FakeTui, theme: FakeTheme) => {
    render: (width: number) => string[];
    invalidate: () => void;
  };
  const component = factory(
    { terminal: { rows: 24 }, requestRender: () => {} },
    { fg: (_style, text) => `\u001b[2m${text}\u001b[0m` },
  );
  for (const width of [12, 40, 80]) {
    const lines = component.render(width);
    assertEqual(lines.length, 2);
    assertEqual(lines.every((line) => visibleWidth(line) <= width), true);
  }
  const normal = component.render(80).join("\n");
  assertEqual(normal.includes("0%"), true);
  assertEqual(normal.includes("0/2"), true);
  assertEqual(normal.includes("停滞1"), true);
  assertEqual(normal.includes("░"), true);
  assertEqual(normal.includes("●"), true);
  assertEqual(normal.includes("+2"), true);
  assertEqual(normal.includes("同じ道具 #2"), true);
  assertEqual(normal.includes("must not render"), false);
  for (let index = 0; index < 5; index++) {
    await emit("tool_execution_end", {
      toolCallId: `call-${index}`,
      toolName: "同じ道具",
      isError: false,
    });
  }
  await taskTool!.execute("plan", { tasks: [] }, undefined, undefined, ctx);
  assertEqual(widget, undefined);
});

test("shared timer follows live UI work and is cleared by restore and shutdown", async () => {
  const setDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "setInterval",
  );
  const clearDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "clearInterval",
  );
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  let unrefCount = 0;
  const timerHandles = new WeakMap<object, number>();
  Object.defineProperty(globalThis, "setInterval", {
    configurable: true,
    value: (callback: () => void) => {
      const id = ++nextTimer;
      timers.set(id, callback);
      const handle = { unref: () => unrefCount++ };
      timerHandles.set(handle, id);
      return handle;
    },
  });
  Object.defineProperty(globalThis, "clearInterval", {
    configurable: true,
    value: (handle: object) => {
      const id = timerHandles.get(handle);
      if (id !== undefined) timers.delete(id);
    },
  });
  try {
    const handlers = new Map<string, Handler[]>();
    const pi = {
      on: (type: string, fn: Handler) =>
        handlers.set(type, [...(handlers.get(type) ?? []), fn]),
      registerTool: () => {},
      registerCommand: () => {},
      appendEntry: () => {},
    };
    timeline(pi as never);
    assertEqual(timers.size, 0);
    let branch: ReturnType<FakeContext["sessionManager"]["getBranch"]> = [];
    const context = (hasUI: boolean): FakeContext => ({
      hasUI,
      mode: "rpc",
      sessionManager: { getBranch: () => branch },
      ui: { setWidget: () => {}, notify: () => {}, custom: async () => {} },
    });
    const ui = context(true);
    const headless = context(false);
    const emit = async (type: string, event: unknown, ctx: FakeContext) => {
      for (const handler of handlers.get(type) ?? []) await handler(event, ctx);
    };
    await emit("session_start", {}, ui);
    assertEqual(timers.size, 0);
    await emit("tool_execution_start", {
      toolCallId: "headless",
      toolName: "run",
    }, headless);
    assertEqual(timers.size, 0);
    await emit("tool_execution_end", {
      toolCallId: "headless",
      toolName: "run",
    }, headless);
    await emit(
      "tool_execution_start",
      { toolCallId: "a", toolName: "run" },
      ui,
    );
    await emit(
      "tool_execution_start",
      { toolCallId: "b", toolName: "run" },
      ui,
    );
    assertEqual(timers.size, 1);
    assertEqual(unrefCount, 1);
    await emit("tool_execution_end", { toolCallId: "a", toolName: "run" }, ui);
    assertEqual(timers.size, 1);
    await emit("tool_execution_end", { toolCallId: "b", toolName: "run" }, ui);
    assertEqual(timers.size, 0);
    await emit(
      "tool_execution_start",
      { toolCallId: "c", toolName: "run" },
      ui,
    );
    assertEqual(timers.size, 1);
    branch = [];
    await emit("session_tree", {}, ui);
    assertEqual(timers.size, 0);
    await emit("session_tree", {}, ui);
    await emit(
      "tool_execution_start",
      { toolCallId: "d", toolName: "run" },
      ui,
    );
    assertEqual(timers.size, 1);
    await emit("session_shutdown", {}, ui);
    assertEqual(timers.size, 0);
    await emit("session_shutdown", {}, ui);
    assertEqual(timers.size, 0);
  } finally {
    if (setDescriptor) {
      Object.defineProperty(globalThis, "setInterval", setDescriptor);
    }
    if (clearDescriptor) {
      Object.defineProperty(globalThis, "clearInterval", clearDescriptor);
    }
  }
});
