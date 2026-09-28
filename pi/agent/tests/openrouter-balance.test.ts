import { assertEquals, assertRejects } from "jsr:@std/assert@1.0";
import openRouterBalance from "../extensions/openrouter-balance.ts";
import {
  formatOpenRouterBalanceStatus,
  parseOpenRouterCreditsResponse,
  queryOpenRouterBalance,
} from "../lib/openrouter-balance.ts";

const ENV_KEY = "OPEN_ROUTER_MANAGEMENT_KEY";
const CREDITS_URL = "https://openrouter.ai/api/v1/credits";

type JsonRecord = Record<string, unknown>;

const withEnv = <T>(
  key: string,
  value: string | undefined,
  fn: () => Promise<T> | T,
): Promise<T> | T => {
  const previous = Deno.env.get(key);
  if (value === undefined) Deno.env.delete(key);
  else Deno.env.set(key, value);

  const restore = () => {
    if (previous === undefined) Deno.env.delete(key);
    else Deno.env.set(key, previous);
  };

  try {
    const result = fn();
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
};

const samplePayload = (totalCredits: number, totalUsage: number) => ({
  data: { total_credits: totalCredits, total_usage: totalUsage },
});

Deno.test("parseOpenRouterCreditsResponse accepts normal balance", () => {
  assertEquals(parseOpenRouterCreditsResponse(samplePayload(20, 7.66)), {
    totalCredits: 20,
    totalUsage: 7.66,
    remaining: 12.34,
  });
});

Deno.test("parseOpenRouterCreditsResponse accepts zero remaining", () => {
  assertEquals(parseOpenRouterCreditsResponse(samplePayload(10, 10)), {
    totalCredits: 10,
    totalUsage: 10,
    remaining: 0,
  });
});

Deno.test("parseOpenRouterCreditsResponse preserves negative remaining", () => {
  assertEquals(parseOpenRouterCreditsResponse(samplePayload(5, 8.5)), {
    totalCredits: 5,
    totalUsage: 8.5,
    remaining: -3.5,
  });
});

Deno.test("parseOpenRouterCreditsResponse rejects malformed payloads", () => {
  assertEquals(parseOpenRouterCreditsResponse(undefined), undefined);
  assertEquals(parseOpenRouterCreditsResponse(null), undefined);
  assertEquals(parseOpenRouterCreditsResponse({}), undefined);
  assertEquals(parseOpenRouterCreditsResponse({ data: null }), undefined);
  assertEquals(
    parseOpenRouterCreditsResponse({ data: { total_credits: "1" } }),
    undefined,
  );
  assertEquals(
    parseOpenRouterCreditsResponse({
      data: { total_credits: 1, total_usage: Number.NaN },
    }),
    undefined,
  );
  assertEquals(
    parseOpenRouterCreditsResponse({
      data: { total_credits: Infinity, total_usage: 0 },
    }),
    undefined,
  );
  assertEquals(
    parseOpenRouterCreditsResponse({
      data: { total_credits: -1, total_usage: 0 },
    }),
    undefined,
  );
  assertEquals(
    parseOpenRouterCreditsResponse({
      data: { total_credits: 0, total_usage: -0.01 },
    }),
    undefined,
  );
});

Deno.test("formatOpenRouterBalanceStatus formats USD with two decimals", () => {
  assertEquals(
    formatOpenRouterBalanceStatus({
      totalCredits: 20,
      totalUsage: 7.66,
      remaining: 12.34,
    }),
    "OpenRouter $12.34",
  );
  assertEquals(
    formatOpenRouterBalanceStatus({
      totalCredits: 5,
      totalUsage: 8.5,
      remaining: -3.5,
    }),
    "OpenRouter -$3.50",
  );
});

const drainAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

const readAuthorization = (init?: RequestInit) => {
  const headers = init?.headers;
  if (headers instanceof Headers) return headers.get("Authorization");
  if (typeof headers === "object" && headers !== null) {
    return (headers as Record<string, string>).Authorization;
  }
  return undefined;
};

const fetchUntilAbort = (init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

Deno.test("queryOpenRouterBalance uses GET credits endpoint and headers", async () => {
  const calls: JsonRecord[] = [];
  await queryOpenRouterBalance({
    managementKey: "mgmt-test-key",
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method,
        redirect: init?.redirect,
        authorization: readAuthorization(init),
        signal: init?.signal !== undefined,
      });
      return Promise.resolve(
        new Response(JSON.stringify(samplePayload(10, 1)), { status: 200 }),
      );
    },
  });

  assertEquals(calls, [{
    url: CREDITS_URL,
    method: "GET",
    redirect: "error",
    authorization: "Bearer mgmt-test-key",
    signal: true,
  }]);
});

Deno.test("queryOpenRouterBalance rejects HTTP errors and malformed JSON", async () => {
  await assertRejects(
    () =>
      queryOpenRouterBalance({
        managementKey: "key",
        fetch: () => Promise.resolve(new Response("nope", { status: 403 })),
      }),
    Error,
    "OpenRouter credits request failed",
  );

  await assertRejects(
    () =>
      queryOpenRouterBalance({
        managementKey: "key",
        fetch: () => Promise.resolve(new Response("not-json", { status: 200 })),
      }),
    Error,
  );

  await assertRejects(
    () =>
      queryOpenRouterBalance({
        managementKey: "key",
        fetch: () =>
          Promise.resolve(
            new Response(JSON.stringify({ data: { total_credits: 1 } }), {
              status: 200,
            }),
          ),
      }),
    Error,
    "OpenRouter credits response was malformed",
  );
});

Deno.test("queryOpenRouterBalance propagates abort without leaking details", async () => {
  const controller = new AbortController();

  const pending = queryOpenRouterBalance({
    managementKey: "key",
    fetch: (_input, init) => fetchUntilAbort(init),
    signal: controller.signal,
  });

  controller.abort();

  await assertRejects(() => pending, DOMException);
});

Deno.test("queryOpenRouterBalance times out", async () => {
  await assertRejects(
    () =>
      queryOpenRouterBalance({
        managementKey: "key",
        timeoutMs: 20,
        fetch: (_input, init) => fetchUntilAbort(init),
      }),
    DOMException,
  );
});

Deno.test("queryOpenRouterBalance requires management key", async () => {
  await withEnv(ENV_KEY, undefined, async () => {
    await assertRejects(
      () => queryOpenRouterBalance({ managementKey: "" }),
      Error,
      "OPEN_ROUTER_MANAGEMENT_KEY is not set",
    );
  });
});

Deno.test("queryOpenRouterBalance reads management key from environment", async () => {
  await withEnv(ENV_KEY, " env-key ", async () => {
    let authorization: string | undefined;
    await queryOpenRouterBalance({
      fetch: (_input, init) => {
        authorization = readAuthorization(init) ?? undefined;
        return Promise.resolve(
          new Response(JSON.stringify(samplePayload(3, 1)), { status: 200 }),
        );
      },
    });
    assertEquals(authorization, "Bearer env-key");
  });
});

Deno.test("queryOpenRouterBalance cancels body on HTTP error", async () => {
  let cancelCalls = 0;
  await assertRejects(
    () =>
      queryOpenRouterBalance({
        managementKey: "key",
        fetch: () =>
          Promise.resolve({
            ok: false,
            status: 403,
            body: {
              cancel: () => {
                cancelCalls += 1;
              },
            },
          } as Response),
      }),
    Error,
    "OpenRouter credits request failed",
  );
  assertEquals(cancelCalls, 1);
});

Deno.test("queryOpenRouterBalance times out while reading response body", async () => {
  await assertRejects(
    () =>
      queryOpenRouterBalance({
        managementKey: "key",
        timeoutMs: 20,
        fetch: (_input, init) =>
          Promise.resolve({
            ok: true,
            status: 200,
            body: { cancel: () => {} },
            json: () =>
              new Promise((_resolve, reject) => {
                const signal = init?.signal;
                if (!signal) return;
                if (signal.aborted) {
                  reject(new DOMException("Aborted", "AbortError"));
                  return;
                }
                signal.addEventListener(
                  "abort",
                  () => reject(new DOMException("Aborted", "AbortError")),
                  { once: true },
                );
              }),
          } as Response),
      }),
    DOMException,
  );
});

type Handler = (_event: unknown, _ctx: unknown) => unknown;

type FakeContext = {
  mode: string;
  hasUI: boolean;
  model?: { provider: string; id: string };
  ui: {
    setStatus: (key: string, value: string | undefined) => void;
    notify: (message: string, level?: string) => void;
    theme: { fg: (style: string, text: string) => string };
  };
};

function createFakePi() {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<
    string,
    { handler: (...args: unknown[]) => unknown }
  >();
  const statuses = new Map<string, string | undefined>();
  const notifications: Array<{ message: string; level?: string }> = [];

  const pi = {
    on(type: string, handler: Handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
    },
    registerCommand(
      name: string,
      spec: { handler: (...args: unknown[]) => unknown },
    ) {
      commands.set(name, spec);
    },
  };

  const dispatch = async (type: string, ctx: FakeContext) => {
    for (const handler of handlers.get(type) ?? []) {
      await handler({}, ctx);
    }
  };

  const createCtx = (overrides?: Partial<FakeContext>): FakeContext => ({
    mode: "tui",
    hasUI: true,
    model: { provider: "openai-codex", id: "gpt-5" },
    ui: {
      setStatus: (key, value) => statuses.set(key, value),
      notify: (message, level) => notifications.push({ message, level }),
      theme: { fg: (_style, text) => text },
    },
    ...overrides,
  });

  return {
    pi,
    dispatch,
    commands,
    statuses,
    notifications,
    createCtx,
  };
}

let originalFetch: typeof fetch;

function stubFetch(
  impl: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
}

function restoreFetch() {
  if (originalFetch) globalThis.fetch = originalFetch;
}

Deno.test("extension skips network without management key", async () => {
  await withEnv(ENV_KEY, undefined, async () => {
    const fake = createFakePi();
    let fetchCalled = false;
    stubFetch(() => {
      fetchCalled = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx();
      await fake.dispatch("session_start", ctx);
      assertEquals(fetchCalled, false);
      assertEquals(fake.statuses.get("openrouter-balance"), undefined);
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension skips network outside TUI even with UI", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    const fake = createFakePi();
    let fetchCalled = false;
    stubFetch(() => {
      fetchCalled = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx({ mode: "rpc" });
      await fake.dispatch("session_start", ctx);
      assertEquals(fetchCalled, false);
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension skips network in all non-TUI modes and without UI", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    for (const mode of ["print", "json", "rpc"] as const) {
      const fake = createFakePi();
      let fetchCalled = false;
      stubFetch(() => {
        fetchCalled = true;
        return Promise.resolve(new Response("{}", { status: 200 }));
      });
      try {
        openRouterBalance(fake.pi as never);
        await fake.dispatch("session_start", fake.createCtx({ mode }));
        assertEquals(fetchCalled, false, mode);
      } finally {
        restoreFetch();
      }
    }

    const fake = createFakePi();
    let fetchCalled = false;
    stubFetch(() => {
      fetchCalled = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    try {
      openRouterBalance(fake.pi as never);
      await fake.dispatch(
        "session_start",
        fake.createCtx({ mode: "tui", hasUI: false }),
      );
      assertEquals(fetchCalled, false);
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension shows balance independent of provider on startup", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    const fake = createFakePi();
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify(samplePayload(20, 7.66)), { status: 200 }),
      )
    );
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx({
        model: { provider: "anthropic", id: "claude" },
      });
      await fake.dispatch("session_start", ctx);
      await drainAsync();
      assertEquals(
        fake.statuses.get("openrouter-balance"),
        "OpenRouter $12.34",
      );
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension refreshes on agent_settled", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    const fake = createFakePi();
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      const remaining = calls === 1 ? 10 : 5;
      return Promise.resolve(
        new Response(
          JSON.stringify(samplePayload(remaining + 1, 1)),
          { status: 200 },
        ),
      );
    });
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx();
      await fake.dispatch("session_start", ctx);
      await drainAsync();
      await fake.dispatch("agent_settled", ctx);
      await drainAsync();
      assertEquals(calls, 2);
      assertEquals(fake.statuses.get("openrouter-balance"), "OpenRouter $5.00");
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension manual refresh notifies missing key in Japanese", async () => {
  await withEnv(ENV_KEY, undefined, async () => {
    const fake = createFakePi();
    openRouterBalance(fake.pi as never);
    const ctx = fake.createCtx();
    const command = fake.commands.get("openrouter-balance");
    await command!.handler([], ctx);
    assertEquals(fake.notifications.length, 1);
    assertEquals(fake.notifications[0]?.level, "warning");
    assertEquals(
      fake.notifications[0]?.message.includes("OPEN_ROUTER_MANAGEMENT_KEY"),
      true,
    );
  });
});

Deno.test("extension manual refresh notifies sanitized failure", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    const fake = createFakePi();
    stubFetch(() => Promise.resolve(new Response("denied", { status: 403 })));
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx();
      const command = fake.commands.get("openrouter-balance");
      await command!.handler([], ctx);
      assertEquals(fake.notifications[0]?.level, "warning");
      assertEquals(
        fake.notifications[0]?.message,
        "OpenRouter 残高の取得に失敗しました。",
      );
      assertEquals(fake.notifications[0]?.message.includes("denied"), false);
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension manual refresh notifies success", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    const fake = createFakePi();
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify(samplePayload(20, 7.66)), { status: 200 }),
      )
    );
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx();
      const command = fake.commands.get("openrouter-balance");
      await command!.handler([], ctx);
      assertEquals(fake.notifications.length, 1);
      assertEquals(fake.notifications[0]?.level, "info");
      assertEquals(
        fake.notifications[0]?.message.includes("OpenRouter 残高:"),
        true,
      );
      assertEquals(fake.notifications[0]?.message.includes("$12.34"), true);
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension automatic failure clears stale status quietly", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    const fake = createFakePi();
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(samplePayload(10, 2)), { status: 200 }),
        );
      }
      return Promise.resolve(new Response("fail", { status: 500 }));
    });
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx();
      await fake.dispatch("session_start", ctx);
      await drainAsync();
      assertEquals(fake.statuses.get("openrouter-balance"), "OpenRouter $8.00");
      await fake.dispatch("agent_settled", ctx);
      await drainAsync();
      assertEquals(fake.statuses.get("openrouter-balance"), undefined);
      assertEquals(fake.notifications.length, 0);
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension ignores superseded late responses", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    const fake = createFakePi();
    const first = deferred<Response>();
    const second = deferred<Response>();
    let call = 0;
    stubFetch(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx();
      void fake.dispatch("session_start", ctx);
      await fake.dispatch("agent_settled", ctx);
      second.resolve(
        new Response(JSON.stringify(samplePayload(100, 90)), { status: 200 }),
      );
      await drainAsync();
      assertEquals(
        fake.statuses.get("openrouter-balance"),
        "OpenRouter $10.00",
      );
      first.resolve(
        new Response(JSON.stringify(samplePayload(100, 0)), { status: 200 }),
      );
      await drainAsync();
      assertEquals(
        fake.statuses.get("openrouter-balance"),
        "OpenRouter $10.00",
      );
    } finally {
      restoreFetch();
    }
  });
});

Deno.test("extension session_shutdown aborts and blocks late UI updates", async () => {
  await withEnv(ENV_KEY, "secret-key", async () => {
    const fake = createFakePi();
    const pending = deferred<Response>();
    let refreshSignal: AbortSignal | undefined;
    stubFetch((_input, init) => {
      refreshSignal = init?.signal ?? undefined;
      return pending.promise;
    });
    try {
      openRouterBalance(fake.pi as never);
      const ctx = fake.createCtx();
      void fake.dispatch("session_start", ctx);
      await drainAsync();
      assertEquals(refreshSignal?.aborted, false);
      await fake.dispatch("session_shutdown", ctx);
      assertEquals(refreshSignal?.aborted, true);
      pending.resolve(
        new Response(JSON.stringify(samplePayload(50, 0)), { status: 200 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      assertEquals(fake.statuses.get("openrouter-balance"), undefined);
    } finally {
      restoreFetch();
    }
  });
});
