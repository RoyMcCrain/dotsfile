import { test } from "bun:test";
import {
  deepEqual as assertEquals,
  ok as assertTrue,
} from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { queryClaudeUsage } from "../lib/claude-usage.ts";

const SYNTHETIC_TOKEN = "synthetic-claude-token";

const withConfigDir = async (
  run: (dir: string) => Promise<void>,
) => {
  const dir = await mkdtemp(join(tmpdir(), "claude-usage-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const credentialJson = (token: string) =>
  JSON.stringify({ claudeAiOauth: { accessToken: token } });

test("missing credentials report not-configured without any HTTP request", async () => {
  // Arrange
  await withConfigDir(async (dir) => {
    let requested = false;
    const fetch = (() => {
      requested = true;
      return Promise.reject(new Error("unexpected"));
    }) as unknown as typeof globalThis.fetch;

    // Act
    const row = await queryClaudeUsage({
      env: { CLAUDE_CONFIG_DIR: dir },
      fetch,
      readKeychain: () => Promise.resolve(undefined),
    });

    // Assert
    assertEquals(row, { provider: "Claude", status: "not-configured" });
    assertEquals(requested, false);
  });
});

test("custom config dir never falls back to the default keychain", async () => {
  // Arrange
  await withConfigDir(async (dir) => {
    let keychainRead = false;

    // Act
    const row = await queryClaudeUsage({
      env: { CLAUDE_CONFIG_DIR: dir },
      readKeychain: () => {
        keychainRead = true;
        return Promise.resolve(credentialJson(SYNTHETIC_TOKEN));
      },
      fetch: (() => Promise.reject(new Error("unexpected"))) as never,
    });

    // Assert
    assertEquals(row.status, "not-configured");
    assertEquals(keychainRead, false);
  });
});

test("aborting during a keychain lookup forwards the signal and makes no HTTP request", async () => {
  // Arrange
  await withConfigDir(async (dir) => {
    const controller = new AbortController();
    let observed: AbortSignal | undefined;
    let requested = false;
    const lookupStarted = deferred<void>();
    const readKeychain = (signal?: AbortSignal) => {
      observed = signal;
      lookupStarted.resolve();
      return new Promise<string | undefined>((resolve) => {
        signal?.addEventListener(
          "abort",
          () => resolve(credentialJson(SYNTHETIC_TOKEN)),
        );
      });
    };

    // Act
    const pending = queryClaudeUsage({
      env: { HOME: dir },
      readKeychain,
      fetch: (() => {
        requested = true;
        return Promise.reject(new Error("unexpected"));
      }) as unknown as typeof globalThis.fetch,
      signal: controller.signal,
    });
    await lookupStarted.promise;
    controller.abort();
    const row = await pending;

    // Assert
    assertTrue(observed === controller.signal);
    assertEquals(row.status, "unavailable");
    assertEquals(requested, false);
  });
});

test("a pre-aborted query performs no credential lookup or HTTP request", async () => {
  // Arrange
  await withConfigDir(async (dir) => {
    await writeFile(
      join(dir, ".credentials.json"),
      credentialJson(SYNTHETIC_TOKEN),
    );
    let lookedUp = false;
    let requested = false;
    const controller = new AbortController();
    controller.abort();

    // Act
    const row = await queryClaudeUsage({
      env: { CLAUDE_CONFIG_DIR: dir },
      readKeychain: () => {
        lookedUp = true;
        return Promise.resolve(undefined);
      },
      fetch: (() => {
        requested = true;
        return Promise.reject(new Error("unexpected"));
      }) as unknown as typeof globalThis.fetch,
      signal: controller.signal,
    });

    // Assert
    assertEquals(row.status, "unavailable");
    assertEquals(lookedUp, false);
    assertEquals(requested, false);
  });
});

test("usage windows convert used percentages to remaining with reset times", async () => {
  // Arrange
  await withConfigDir(async (dir) => {
    await writeFile(
      join(dir, ".credentials.json"),
      credentialJson(SYNTHETIC_TOKEN),
    );
    const fetch = ((url: string, init: RequestInit) => {
      assertEquals(url, "https://api.anthropic.com/api/oauth/usage");
      assertEquals(init.redirect, "error");
      assertEquals(
        (init.headers as Record<string, string>).authorization,
        `Bearer ${SYNTHETIC_TOKEN}`,
      );
      return Promise.resolve(Response.json({
        five_hour: { utilization: 23, resets_at: "2026-11-17T02:00:00Z" },
        seven_day: { utilization: 56, resets_at: "not a date" },
      }));
    }) as unknown as typeof globalThis.fetch;

    // Act
    const row = await queryClaudeUsage({
      env: { CLAUDE_CONFIG_DIR: dir },
      fetch,
    });

    // Assert
    assertEquals(row.status, "ok");
    assertTrue(row.status === "ok" && "windows" in row);
    if (row.status === "ok" && "windows" in row) {
      assertEquals(row.windows.map((w) => w.label), ["5h", "7d"]);
      assertEquals(row.windows[0]?.remainingPercent, 77);
      assertEquals(
        row.windows[0]?.resetsAt,
        Date.parse("2026-11-17T02:00:00Z") / 1000,
      );
      assertEquals(row.windows[1]?.remainingPercent, 44);
      assertEquals(row.windows[1]?.resetsAt, undefined);
    }
  });
});

test("401 responses are reported as auth without leaking the response body", async () => {
  // Arrange
  await withConfigDir(async (dir) => {
    await writeFile(
      join(dir, ".credentials.json"),
      credentialJson(SYNTHETIC_TOKEN),
    );
    const fetch = (() =>
      Promise.resolve(
        new Response(`bad token ${SYNTHETIC_TOKEN}`, { status: 401 }),
      )) as unknown as typeof globalThis.fetch;

    // Act
    const row = await queryClaudeUsage({
      env: { CLAUDE_CONFIG_DIR: dir },
      fetch,
    });

    // Assert
    assertEquals(row, { provider: "Claude", status: "auth" });
  });
});
