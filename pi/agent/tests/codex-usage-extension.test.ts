import { spyOn, test } from "bun:test";
import { deepEqual as assertEquals } from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import codexUsage from "../extensions/codex-usage.ts";
import * as usage from "../lib/codex-usage.ts";

const snapshot = {
  planType: "pro",
  primary: { usedPercent: 12, windowDurationMins: 10_080 },
};

type FakeContext = {
  hasUI: boolean;
  model?: { provider: string; id: string };
  modelRegistry: { isUsingOAuth: () => boolean };
  ui: {
    setStatus: (key: string, value: string | undefined) => void;
    notify: (message: string) => void;
    theme: { fg: (_style: string, text: string) => string };
  };
};

type ContextOptions = { provider?: string; oauth?: boolean; hasUI?: boolean };

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const createFakePi = () => {
  const handlers = new Map<
    string,
    ((_event: unknown, ctx: FakeContext) => unknown)[]
  >();
  let command: ((_args: string, ctx: FakeContext) => unknown) | undefined;
  const statuses = new Map<string, string | undefined>();
  const notifications: string[] = [];
  const pi = {
    on(type: string, handler: (_event: unknown, ctx: FakeContext) => unknown) {
      const registered = handlers.get(type) ?? [];
      registered.push(handler);
      handlers.set(type, registered);
    },
    registerCommand(_name: string, spec: { handler: typeof command }) {
      command = spec.handler;
    },
  };
  const createCtx = (
    { provider, oauth = false, hasUI = true }: ContextOptions = {},
  ) => ({
    hasUI,
    model: provider ? { provider, id: "gpt-test" } : undefined,
    modelRegistry: { isUsingOAuth: () => oauth },
    ui: {
      setStatus: (key, value) => statuses.set(key, value),
      notify: (message) => notifications.push(message),
      theme: { fg: (_style: string, text: string) => text },
    },
  } satisfies FakeContext);
  const dispatch = async (type: string, ctx: FakeContext) => {
    for (const handler of handlers.get(type) ?? []) await handler({}, ctx);
  };
  const runCommand = async (ctx: FakeContext) => await command?.("", ctx);

  return { pi, statuses, notifications, createCtx, dispatch, runCommand };
};

test("unified OpenAI OAuth displays usage and supports manual refresh", async () => {
  const fake = createFakePi();
  const query = spyOn(usage, "queryCodexUsage").mockResolvedValue(snapshot);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx({ provider: "openai", oauth: true });

    await fake.dispatch("session_start", ctx);
    assertEquals(fake.statuses.get("codex-usage")?.includes("Codex Pro"), true);

    await fake.runCommand(ctx);
    assertEquals(query.mock.calls.length, 2);
    assertEquals(fake.notifications, ["Codex usage: Codex Pro 7d 12%"]);
  } finally {
    query.mockRestore();
  }
});

test("automatic lifecycle refreshes are throttled while manual refresh bypasses the interval", async () => {
  const fake = createFakePi();
  const query = spyOn(usage, "queryCodexUsage").mockResolvedValue(snapshot);
  const now = spyOn(Date, "now").mockReturnValue(1_000_000);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx({ provider: "openai", oauth: true });
    await fake.dispatch("session_start", ctx);
    await fake.dispatch("agent_settled", ctx);
    assertEquals(query.mock.calls.length, 1);
    assertEquals(fake.statuses.get("codex-usage")?.includes("Codex Pro"), true);

    now.mockReturnValue(1_299_999);
    await fake.dispatch("agent_settled", ctx);
    assertEquals(query.mock.calls.length, 1);

    now.mockReturnValue(1_300_000);
    await fake.dispatch("agent_settled", ctx);
    assertEquals(query.mock.calls.length, 2);

    now.mockReturnValue(1_300_001);
    await fake.runCommand(ctx);
    assertEquals(query.mock.calls.length, 3);
  } finally {
    now.mockRestore();
    query.mockRestore();
  }
});

test("cancelling an automatic refresh permits a fresh attempt when support returns", async () => {
  const fake = createFakePi();
  const pending = deferred<typeof snapshot>();
  const query = spyOn(usage, "queryCodexUsage")
    .mockImplementationOnce(() => pending.promise as never)
    .mockResolvedValueOnce(snapshot);
  const now = spyOn(Date, "now").mockReturnValue(2_000_000);
  try {
    codexUsage(fake.pi as never);
    const supported = fake.createCtx({ provider: "openai", oauth: true });
    await fake.dispatch("session_start", supported);
    assertEquals(query.mock.calls.length, 1);

    await fake.dispatch("model_select", fake.createCtx({ provider: "anthropic" }));
    assertEquals(query.mock.calls[0]?.[0]?.signal?.aborted, true);
    await fake.dispatch("model_select", supported);
    await setImmediate();

    assertEquals(query.mock.calls.length, 2);
    assertEquals(fake.statuses.get("codex-usage")?.includes("Codex Pro"), true);
  } finally {
    now.mockRestore();
    query.mockRestore();
  }
});

test("unsupported context clears status and supported OAuth restores cached status", async () => {
  const fake = createFakePi();
  const query = spyOn(usage, "queryCodexUsage").mockResolvedValue(snapshot);
  const now = spyOn(Date, "now").mockReturnValue(2_000_000);
  try {
    codexUsage(fake.pi as never);
    const supported = fake.createCtx({ provider: "openai", oauth: true });
    await fake.dispatch("session_start", supported);
    const unsupported = fake.createCtx({ provider: "anthropic" });
    await fake.dispatch("model_select", unsupported);
    assertEquals(fake.statuses.get("codex-usage"), undefined);
    await fake.dispatch("model_select", supported);
    assertEquals(query.mock.calls.length, 1);
    assertEquals(fake.statuses.get("codex-usage")?.includes("Codex Pro"), true);
  } finally {
    now.mockRestore();
    query.mockRestore();
  }
});

test("in-flight automatic lifecycle events coalesce without aborting the query", async () => {
  const fake = createFakePi();
  const pending = deferred<typeof snapshot>();
  const query = spyOn(usage, "queryCodexUsage").mockReturnValue(pending.promise as never);
  const now = spyOn(Date, "now").mockReturnValue(1_000_000);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx({ provider: "openai", oauth: true });
    await fake.dispatch("session_start", ctx);
    now.mockReturnValue(1_300_000);
    await fake.dispatch("agent_settled", ctx);
    assertEquals(query.mock.calls.length, 1);
    assertEquals(query.mock.calls[0]?.[0]?.signal?.aborted, false);
    pending.resolve(snapshot);
    await setImmediate();
    assertEquals(fake.statuses.get("codex-usage")?.includes("Codex Pro"), true);
  } finally {
    now.mockRestore();
    query.mockRestore();
  }
});

test("failed attempts cool down without resurrecting a stale successful status", async () => {
  const fake = createFakePi();
  const query = spyOn(usage, "queryCodexUsage").mockResolvedValue(snapshot);
  const now = spyOn(Date, "now").mockReturnValue(3_000_000);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx({ provider: "openai", oauth: true });
    await fake.dispatch("session_start", ctx);
    now.mockReturnValue(3_300_000);
    query.mockRejectedValueOnce(new Error("offline"));
    await fake.dispatch("agent_settled", ctx);
    assertEquals(fake.statuses.get("codex-usage"), undefined);
    await fake.dispatch("agent_settled", ctx);
    assertEquals(query.mock.calls.length, 2);
    assertEquals(fake.statuses.get("codex-usage"), undefined);
  } finally {
    now.mockRestore();
    query.mockRestore();
  }
});

test("manual refresh supersedes automatic work and stale completion cannot overwrite it", async () => {
  const fake = createFakePi();
  const automatic = deferred<typeof snapshot>();
  const manual = deferred<typeof snapshot>();
  const query = spyOn(usage, "queryCodexUsage").mockImplementationOnce(() => automatic.promise as never).mockImplementationOnce(() => manual.promise as never);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx({ provider: "openai", oauth: true });
    await fake.dispatch("session_start", ctx);
    const command = fake.runCommand(ctx);
    assertEquals(query.mock.calls[0]?.[0]?.signal?.aborted, true);
    manual.resolve({ ...snapshot, primary: { usedPercent: 80, windowDurationMins: 10_080 } });
    await command;
    automatic.resolve(snapshot);
    await setImmediate();
    assertEquals(fake.statuses.get("codex-usage")?.includes("80%"), true);
  } finally {
    query.mockRestore();
  }
});

const cancellationCases = [
  {
    name: "unsupported model",
    event: "model_select",
    options: { provider: "anthropic" },
  },
  {
    name: "no UI",
    event: "model_select",
    options: { provider: "openai", oauth: true, hasUI: false },
  },
  {
    name: "session shutdown",
    event: "session_shutdown",
    options: { provider: "openai", oauth: true },
  },
] as const;

for (const { name, event, options } of cancellationCases) {
  test(`${name} cancellation prevents status resurrection`, async () => {
    const fake = createFakePi();
    const pending = deferred<typeof snapshot>();
    const query = spyOn(usage, "queryCodexUsage").mockReturnValue(pending.promise as never);
    try {
      codexUsage(fake.pi as never);
      const ctx = fake.createCtx({ provider: "openai", oauth: true });
      await fake.dispatch("session_start", ctx);
      await fake.dispatch(event, fake.createCtx(options));
      assertEquals(query.mock.calls[0]?.[0]?.signal?.aborted, true);
      pending.resolve(snapshot);
      await setImmediate();
      assertEquals(fake.statuses.get("codex-usage"), undefined);
    } finally {
      query.mockRestore();
    }
  });
}

test("legacy Codex OAuth remains supported", async () => {
  const fake = createFakePi();
  const query = spyOn(usage, "queryCodexUsage").mockResolvedValue(snapshot);
  try {
    codexUsage(fake.pi as never);
    const ctx = fake.createCtx({ provider: "openai-codex" });

    await fake.runCommand(ctx);
    assertEquals(query.mock.calls.length, 1);
    assertEquals(fake.statuses.get("codex-usage"), "Codex Pro 7d 12%");
    assertEquals(fake.notifications, ["Codex usage: Codex Pro 7d 12%"]);
  } finally {
    query.mockRestore();
  }
});

test("OpenAI API key and unsupported or absent models are rejected safely", async () => {
  const fake = createFakePi();
  const query = spyOn(usage, "queryCodexUsage").mockResolvedValue(snapshot);
  try {
    codexUsage(fake.pi as never);
    const oauthContext = fake.createCtx({ provider: "openai", oauth: true });
    await fake.runCommand(oauthContext);
    assertEquals(fake.statuses.get("codex-usage")?.includes("Codex Pro"), true);

    const apiKeyContext = fake.createCtx({ provider: "openai" });
    await fake.dispatch("model_select", apiKeyContext);
    assertEquals(fake.statuses.get("codex-usage"), undefined);
    await fake.runCommand(apiKeyContext);
    await fake.runCommand(
      fake.createCtx({ provider: "anthropic", oauth: true }),
    );
    await fake.runCommand(fake.createCtx({ oauth: true }));
    await fake.runCommand(
      fake.createCtx({ provider: "openai", oauth: true, hasUI: false }),
    );

    assertEquals(query.mock.calls.length, 1);
    assertEquals(fake.notifications, [
      "Codex usage: Codex Pro 7d 12%",
      "Codex usage is shown only for ChatGPT OAuth models",
      "Codex usage is shown only for ChatGPT OAuth models",
      "Codex usage is shown only for ChatGPT OAuth models",
    ]);
  } finally {
    query.mockRestore();
  }
});
