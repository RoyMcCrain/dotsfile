import { spyOn, test } from "bun:test";
import { deepEqual as assertEquals } from "node:assert/strict";
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

type ContextOptions = { provider?: string; oauth?: boolean };

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
    { provider, oauth = false }: ContextOptions = {},
  ) => ({
    hasUI: true,
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
