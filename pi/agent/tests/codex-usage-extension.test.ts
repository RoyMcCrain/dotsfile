import { spyOn, test } from "bun:test";
import {
  deepEqual as assertEquals,
  ok as assertTrue,
} from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import codexUsage from "../extensions/codex-usage.ts";
import * as claude from "../lib/claude-usage.ts";
import * as codex from "../lib/codex-usage.ts";
import type { UsageRow } from "../lib/provider-usage.ts";

type WidgetFactory = (
  tui: unknown,
  theme: { fg: (_style: string, text: string) => string },
) => { render: (width: number) => string[] };

const snapshot = {
  planType: "pro",
  primary: { usedPercent: 18, windowDurationMins: 300 },
  secondary: { usedPercent: 36, windowDurationMins: 10_080 },
};

const claudeRow: UsageRow = {
  provider: "Claude",
  status: "ok",
  windows: [
    { label: "5h", remainingPercent: 77 },
    { label: "7d", remainingPercent: 44 },
  ],
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

// Spies on every collector so no test can read credentials or call a network.
const mockCollectors = (
  codexImpl: () => Promise<unknown> = () => Promise.resolve(snapshot),
  claudeImpl: () => Promise<UsageRow> = () => Promise.resolve(claudeRow),
) => ({
  codex: spyOn(codex, "queryCodexUsage").mockImplementation(
    codexImpl as never,
  ),
  claude: spyOn(claude, "queryClaudeUsage").mockImplementation(
    claudeImpl as never,
  ),
  restore() {
    this.codex.mockRestore();
    this.claude.mockRestore();
  },
});

const createFakePi = () => {
  const handlers = new Map<
    string,
    ((_event: unknown, ctx: unknown) => unknown)[]
  >();
  const commands = new Map<string, (args: string, ctx: unknown) => unknown>();
  const widgets = new Map<string, WidgetFactory | string[] | undefined>();
  const notifications: string[] = [];
  const pi = {
    on(type: string, handler: (_event: unknown, ctx: unknown) => unknown) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    registerCommand(
      name: string,
      spec: { handler: (args: string, ctx: unknown) => unknown },
    ) {
      commands.set(name, spec.handler);
    },
  };
  const createCtx = ({ provider, mode = "tui" }: {
    provider?: string;
    mode?: string;
  } = {}) => ({
    hasUI: mode === "tui",
    mode,
    model: provider ? { provider, id: "test-model" } : undefined,
    modelRegistry: { isUsingOAuth: () => false },
    ui: {
      setStatus: () => {},
      setWidget: (
        key: string,
        value: WidgetFactory | string[] | undefined,
      ) => widgets.set(key, value),
      notify: (message: string) => notifications.push(message),
      theme: { fg: (_style: string, text: string) => text },
    },
  });
  const dispatch = async (type: string, ctx: unknown) => {
    for (const handler of handlers.get(type) ?? []) await handler({}, ctx);
  };
  const run = async (name: string, ctx: unknown) =>
    await commands.get(name)?.("", ctx);
  const renderWidget = (width = 120) => {
    const widget = widgets.get("codex-usage");
    if (typeof widget !== "function") return [];
    return widget(undefined, { fg: (_style, text) => text }).render(width);
  };
  return {
    pi,
    widgets,
    notifications,
    createCtx,
    dispatch,
    run,
    renderWidget,
  };
};

test("widget shows every provider row regardless of the selected model", async () => {
  // Arrange
  const fake = createFakePi();
  const collectors = mockCollectors();
  try {
    codexUsage(fake.pi as never);

    // Act
    await fake.dispatch(
      "session_start",
      fake.createCtx({ provider: "anthropic" }),
    );
    await setImmediate();

    // Assert
    const lines = fake.renderWidget();
    assertEquals(lines.length, 1);
    assertTrue(
      lines[0]?.includes(
        "Codex 残り: 5h 82% · 7d 64% │ Claude 残り: 7d 44%",
      ),
    );
    assertTrue(!lines[0]?.includes("Claude 残り: 5h 77%"));
  } finally {
    collectors.restore();
  }
});

test("automatic Codex failure shows unavailable, keeps Claude, and respects the cooldown", async () => {
  // Arrange
  const fake = createFakePi();
  let fail = false;
  const collectors = mockCollectors(
    () =>
      fail
        ? Promise.reject(new Error("codex down"))
        : Promise.resolve(snapshot),
  );
  const now = spyOn(Date, "now").mockReturnValue(1_000_000);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx({ provider: "openai" });
    await fake.dispatch("session_start", ctx);
    await setImmediate();
    assertTrue(fake.renderWidget().join("\n").includes("Codex 残り: 5h 82%"));

    // Act & Assert
    now.mockReturnValue(1_300_000);
    fail = true;
    await fake.dispatch("agent_settled", ctx);
    await setImmediate();
    const failed = fake.renderWidget().join("\n");
    assertTrue(failed.includes("Codex 残り: 取得失敗"));
    assertTrue(!failed.includes("Codex 残り: 5h 82%"));
    assertTrue(failed.includes("Claude 残り: 7d 44%"));
    assertTrue(!failed.includes("5h 77%"));
    assertEquals(collectors.codex.mock.calls.length, 2);

    now.mockReturnValue(1_599_999);
    await fake.dispatch("agent_settled", ctx);
    await setImmediate();
    assertEquals(collectors.codex.mock.calls.length, 2);
    const cooling = fake.renderWidget().join("\n");
    assertTrue(cooling.includes("Codex 残り: 取得失敗"));
    assertTrue(!cooling.includes("Codex 残り: 5h 82%"));

    now.mockReturnValue(1_600_000);
    await fake.dispatch("agent_settled", ctx);
    assertEquals(collectors.codex.mock.calls.length, 3);
  } finally {
    now.mockRestore();
    collectors.restore();
  }
});

test("automatic refreshes respect the cooldown while manual refresh bypasses it", async () => {
  // Arrange
  const fake = createFakePi();
  const collectors = mockCollectors();
  const now = spyOn(Date, "now").mockReturnValue(1_000_000);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx({ provider: "openai" });
    await fake.dispatch("session_start", ctx);
    await setImmediate();

    // Act & Assert
    now.mockReturnValue(1_299_999);
    await fake.dispatch("agent_settled", ctx);
    assertEquals(collectors.codex.mock.calls.length, 1);

    now.mockReturnValue(1_300_000);
    await fake.dispatch("agent_settled", ctx);
    assertEquals(collectors.codex.mock.calls.length, 2);

    await fake.run("usage", ctx);
    assertEquals(collectors.codex.mock.calls.length, 3);
  } finally {
    now.mockRestore();
    collectors.restore();
  }
});

test("in-flight automatic events coalesce without aborting the refresh", async () => {
  // Arrange
  const fake = createFakePi();
  const pending = deferred<typeof snapshot>();
  const collectors = mockCollectors(() => pending.promise);
  const now = spyOn(Date, "now").mockReturnValue(1_000_000);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx();
    await fake.dispatch("session_start", ctx);
    now.mockReturnValue(1_300_000);

    // Act
    await fake.dispatch("model_select", ctx);
    await fake.dispatch("agent_settled", ctx);
    pending.resolve(snapshot);
    await setImmediate();

    // Assert
    assertEquals(collectors.codex.mock.calls.length, 1);
    assertEquals(collectors.codex.mock.calls[0]?.[0]?.signal?.aborted, false);
    assertTrue(fake.renderWidget().join("\n").includes("Codex 残り: 5h 82%"));
  } finally {
    now.mockRestore();
    collectors.restore();
  }
});

test("manual refresh supersedes automatic work and stale results cannot overwrite it", async () => {
  // Arrange
  const fake = createFakePi();
  const automatic = deferred<typeof snapshot>();
  const manual = deferred<typeof snapshot>();
  const collectors = mockCollectors(
    () => (collectors.codex.mock.calls.length === 1
      ? automatic.promise
      : manual.promise),
  );
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx();
    await fake.dispatch("session_start", ctx);

    // Act
    const command = fake.run("usage", ctx);
    manual.resolve({
      ...snapshot,
      primary: { usedPercent: 80, windowDurationMins: 300 },
    });
    await command;
    automatic.resolve(snapshot);
    await setImmediate();

    // Assert
    assertEquals(collectors.codex.mock.calls[0]?.[0]?.signal?.aborted, true);
    assertTrue(fake.renderWidget().join("\n").includes("Codex 残り: 5h 20%"));
  } finally {
    collectors.restore();
  }
});

test("session shutdown cancels in-flight work and clears the widget", async () => {
  // Arrange
  const fake = createFakePi();
  const pending = deferred<typeof snapshot>();
  const collectors = mockCollectors(() => pending.promise);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx();
    await fake.dispatch("session_start", ctx);

    // Act
    await fake.dispatch("session_shutdown", ctx);
    pending.resolve(snapshot);
    await setImmediate();

    // Assert
    assertEquals(collectors.codex.mock.calls[0]?.[0]?.signal?.aborted, true);
    assertEquals(fake.widgets.get("codex-usage"), undefined);
  } finally {
    collectors.restore();
  }
});

test("a non-TUI trigger cancels pending TUI work without repopulating the widget", async () => {
  const fake = createFakePi();
  const pending = deferred<typeof snapshot>();
  const collectors = mockCollectors(() => pending.promise);
  try {
    codexUsage(fake.pi as never);
    await fake.dispatch("session_start", fake.createCtx());

    await fake.dispatch("agent_settled", fake.createCtx({ mode: "print" }));
    pending.resolve(snapshot);
    await setImmediate();

    assertEquals(collectors.codex.mock.calls[0]?.[0]?.signal?.aborted, true);
    assertEquals(
      fake.renderWidget().join("\n").includes("Codex 残り: 5h 82%"),
      false,
    );
  } finally {
    collectors.restore();
  }
});

test("a non-TUI usage command cancels pending TUI work", async () => {
  const fake = createFakePi();
  const pending = deferred<typeof snapshot>();
  const collectors = mockCollectors(() => pending.promise);
  try {
    codexUsage(fake.pi as never);
    await fake.dispatch("session_start", fake.createCtx());

    await fake.run("usage", fake.createCtx({ mode: "print" }));
    pending.resolve(snapshot);
    await setImmediate();

    assertEquals(collectors.codex.mock.calls[0]?.[0]?.signal?.aborted, true);
    assertEquals(
      fake.renderWidget().join("\n").includes("Codex 残り: 5h 82%"),
      false,
    );
  } finally {
    collectors.restore();
  }
});

test("non-TUI sessions perform no collection", async () => {
  // Arrange
  const fake = createFakePi();
  const collectors = mockCollectors();
  try {
    codexUsage(fake.pi as never);

    // Act
    await fake.dispatch("session_start", fake.createCtx({ mode: "print" }));
    await fake.run("usage", fake.createCtx({ mode: "print" }));

    // Assert
    assertEquals(collectors.codex.mock.calls.length, 0);
    assertEquals(collectors.claude.mock.calls.length, 0);
  } finally {
    collectors.restore();
  }
});

test("codex-usage alias runs the same all-provider refresh", async () => {
  // Arrange
  const fake = createFakePi();
  const collectors = mockCollectors();
  try {
    codexUsage(fake.pi as never);

    // Act
    await fake.run("codex-usage", fake.createCtx());
    await setImmediate();

    // Assert
    assertEquals(collectors.codex.mock.calls.length, 1);
    assertEquals(collectors.claude.mock.calls.length, 1);
    assertTrue(fake.renderWidget().join("\n").includes("Claude 残り"));
  } finally {
    collectors.restore();
  }
});
