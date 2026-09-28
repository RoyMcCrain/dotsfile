import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, beforeEach, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionUrl = pathToFileURL(
  resolve(repoRoot, "pi/agent/extensions/openrouter-balance.ts"),
).href;
const libUrl = pathToFileURL(
  resolve(repoRoot, "pi/agent/lib/openrouter-balance.ts"),
).href;

const ENV_KEY = "OPEN_ROUTER_MANAGEMENT_KEY";
const CREDITS_URL = "https://openrouter.ai/api/v1/credits";

/** @type {typeof fetch | undefined} */
let snapshotFetch;
/** @type {string | undefined} */
let snapshotEnv;

beforeEach(() => {
  snapshotFetch = globalThis.fetch;
  snapshotEnv = process.env[ENV_KEY];
});

afterEach(() => {
  globalThis.fetch = snapshotFetch;
  if (snapshotEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = snapshotEnv;
});

const closeStallServer = (server) =>
  new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => (error ? reject(error) : resolve()));
  });

test("Node runtime has no Deno global", () => {
  assert.equal(typeof globalThis.Deno, "undefined");
});

test("extension command refreshes balance with mocked fetch", async () => {
  process.env[ENV_KEY] = "test-only-not-a-real-key";

  const { default: extension } = await import(extensionUrl);
  const commands = new Map();
  const statuses = new Map();
  const notifications = [];
  let requests = 0;

  globalThis.fetch = (url, init) => {
    requests += 1;
    assert.equal(url, CREDITS_URL);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    return Promise.resolve(
      new Response(
        JSON.stringify({ data: { total_credits: 20, total_usage: 7.66 } }),
      ),
    );
  };

  extension({
    on() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
  });

  assert.equal(requests, 0);
  await commands.get("openrouter-balance").handler("", {
    mode: "tui",
    hasUI: true,
    model: { provider: "openai-codex" },
    ui: {
      setStatus(key, text) {
        statuses.set(key, text);
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
      theme: {
        fg(_style, text) {
          return text;
        },
      },
    },
  });

  assert.equal(requests, 1);
  assert.equal(statuses.get("openrouter-balance"), "OpenRouter $12.34");
  assert.equal(notifications.at(-1)?.level, "info");
});

test("queryOpenRouterBalance uses explicit key without network when fetch is injected", async () => {
  let requests = 0;
  const { queryOpenRouterBalance } = await import(libUrl);
  const credits = await queryOpenRouterBalance({
    managementKey: "inline-key",
    fetch: (url) => {
      requests += 1;
      assert.equal(url, CREDITS_URL);
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: { total_credits: 10, total_usage: 4 } }),
          { status: 200 },
        ),
      );
    },
  });
  assert.equal(requests, 1);
  assert.equal(credits.remaining, 6);
});

test("queryOpenRouterBalance reads default env path in Node", async () => {
  process.env[ENV_KEY] = " node-env-key ";

  const { queryOpenRouterBalance } = await import(libUrl);
  let authorization;
  await queryOpenRouterBalance({
    fetch: (_url, init) => {
      const headers = init?.headers;
      authorization = headers instanceof Headers
        ? headers.get("Authorization")
        : headers?.Authorization;
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: { total_credits: 1, total_usage: 0 } }),
          { status: 200 },
        ),
      );
    },
  });
  assert.equal(authorization, "Bearer node-env-key");
});

test("queryOpenRouterBalance cancels body before throwing on HTTP error", async () => {
  const { queryOpenRouterBalance } = await import(libUrl);
  let cancelCalls = 0;
  await assert.rejects(
    () =>
      queryOpenRouterBalance({
        managementKey: "key",
        fetch: () =>
          Promise.resolve({
            ok: false,
            status: 500,
            body: {
              cancel() {
                cancelCalls += 1;
              },
            },
          }),
      }),
    /OpenRouter credits request failed/,
  );
  assert.equal(cancelCalls, 1);
});

test("queryOpenRouterBalance times out while reading stalled local body", async () => {
  const unhandled = [];
  /** @param {unknown} reason */
  const onUnhandledRejection = (reason) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandledRejection);

  const nativeFetch = globalThis.fetch;
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
    });
    res.write('{"data":{"total_credits":1');
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = /** @type {import("node:net").AddressInfo} */ (
    server.address()
  );
  const localUrl = `http://127.0.0.1:${port}/`;

  try {
    const { queryOpenRouterBalance } = await import(libUrl);
    await assert.rejects(
      () =>
        queryOpenRouterBalance({
          managementKey: "test-only-not-a-real-key",
          timeoutMs: 100,
          fetch: (url, init) => {
            assert.equal(url, CREDITS_URL);
            return nativeFetch(localUrl, init);
          },
        }),
      (error) => error instanceof DOMException && error.name === "AbortError",
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      unhandled.length,
      0,
      `expected no unhandled rejections, got: ${
        unhandled.map(String).join("; ")
      }`,
    );
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    await closeStallServer(server);
  }
});
