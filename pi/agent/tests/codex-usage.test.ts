import { assertEquals, assertRejects } from "jsr:@std/assert@1.0";
import {
  createJsonLineParser,
  formatCodexUsageStatus,
  parseRateLimitsReadResponse,
  queryCodexUsage,
} from "../lib/codex-usage.ts";

const RESET_AT = Date.UTC(2025, 0, 25, 0, 0) / 1000;
const SECONDARY_RESET_AT = Date.UTC(2025, 0, 26, 12, 0) / 1000;
const UTC = { timeZone: "UTC" } as const;
const sampleSnapshot = {
  planType: "pro",
  primary: {
    usedPercent: 0,
    windowDurationMins: 10_080,
    resetsAt: RESET_AT,
  },
};

Deno.test("parseRateLimitsReadResponse prefers the codex bucket", () => {
  assertEquals(
    parseRateLimitsReadResponse({
      id: 2,
      result: {
        rateLimits: {
          planType: "plus",
          primary: { usedPercent: 99, windowDurationMins: 60 },
        },
        rateLimitsByLimitId: { codex: sampleSnapshot },
      },
    }),
    sampleSnapshot,
  );
});

Deno.test("parseRateLimitsReadResponse falls back to rateLimits", () => {
  assertEquals(
    parseRateLimitsReadResponse({
      id: 2,
      result: { rateLimits: sampleSnapshot },
    }),
    sampleSnapshot,
  );
});

Deno.test(
  "parseRateLimitsReadResponse falls back when codex bucket is missing",
  () => {
    assertEquals(
      parseRateLimitsReadResponse({
        id: 2,
        result: {
          rateLimits: sampleSnapshot,
          rateLimitsByLimitId: { other: { planType: "plus" } },
        },
      }),
      sampleSnapshot,
    );
  },
);

Deno.test("parseRateLimitsReadResponse rejects malformed payloads", () => {
  assertEquals(parseRateLimitsReadResponse(undefined), undefined);
  assertEquals(
    parseRateLimitsReadResponse({ id: 2, error: { message: "nope" } }),
    undefined,
  );
  assertEquals(
    parseRateLimitsReadResponse({ id: 2, result: { rateLimits: "bad" } }),
    undefined,
  );
});

Deno.test("formatCodexUsageStatus formats one window and reset", () => {
  assertEquals(
    formatCodexUsageStatus(sampleSnapshot, UTC),
    "Codex Pro 7d 0% ↻01/25 00:00",
  );
});

Deno.test("formatCodexUsageStatus formats two windows compactly", () => {
  assertEquals(
    formatCodexUsageStatus(
      {
        ...sampleSnapshot,
        secondary: { usedPercent: 15, windowDurationMins: 300 },
      },
      UTC,
    ),
    "Codex Pro 7d 0% ↻01/25 00:00 · 5h 15%",
  );
});

Deno.test("formatCodexUsageStatus shows each window reset time", () => {
  assertEquals(
    formatCodexUsageStatus(
      {
        ...sampleSnapshot,
        secondary: {
          usedPercent: 15,
          windowDurationMins: 300,
          resetsAt: SECONDARY_RESET_AT,
        },
      },
      UTC,
    ),
    "Codex Pro 7d 0% ↻01/25 00:00 · 5h 15% ↻01/26 12:00",
  );
});

Deno.test("formatCodexUsageStatus handles missing duration and reset", () => {
  assertEquals(
    formatCodexUsageStatus({
      planType: "pro",
      primary: { usedPercent: 42 },
    }),
    "Codex Pro 42%",
  );
});

Deno.test("createJsonLineParser handles split chunks and malformed lines", () => {
  const messages: unknown[] = [];
  const parser = createJsonLineParser((message) => messages.push(message));

  parser.push('{"id":');
  parser.push('1}\nnot-json\n{"id":2}\n{"id"');
  parser.push(":3}");
  parser.end();

  assertEquals(messages, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

Deno.test("queryCodexUsage performs the app-server handshake", async () => {
  const events: string[] = [];

  const snapshot = await queryCodexUsage({
    createAppServer: () => ({
      request: (method, params) => {
        events.push(`request:${method}`);
        if (method === "initialize") {
          assertEquals(params, {
            clientInfo: { name: "pi-codex-usage", version: "0.1.0" },
            capabilities: { experimentalApi: true },
          });
          return Promise.resolve({ id: 1, result: {} });
        }
        return Promise.resolve({
          id: 2,
          result: { rateLimitsByLimitId: { codex: sampleSnapshot } },
        });
      },
      notify: (method) => {
        events.push(`notify:${method}`);
      },
      close: () => {
        events.push("close");
        return Promise.resolve();
      },
    }),
  });

  assertEquals(snapshot, sampleSnapshot);
  assertEquals(events, [
    "request:initialize",
    "notify:initialized",
    "request:account/rateLimits/read",
    "close",
  ]);
});

Deno.test("queryCodexUsage rejects when Codex CLI is unavailable", async () => {
  await assertRejects(
    () =>
      queryCodexUsage({
        codexBin: "__missing_codex_for_test__",
        timeoutMs: 100,
      }),
    Error,
  );
});

Deno.test("queryCodexUsage closes after initialize rejection", async () => {
  const events: string[] = [];

  await assertRejects(
    () =>
      queryCodexUsage({
        createAppServer: () => ({
          request: (method) => {
            events.push(`request:${method}`);
            if (method === "initialize") {
              return Promise.reject(new Error("initialize failed"));
            }
            return Promise.resolve({ id: 2, result: {} });
          },
          notify: (method) => {
            events.push(`notify:${method}`);
          },
          close: () => {
            events.push("close");
            return Promise.resolve();
          },
        }),
      }),
    Error,
    "initialize failed",
  );

  assertEquals(events, ["request:initialize", "close"]);
});

Deno.test("queryCodexUsage closes after malformed responses", async () => {
  let closed = false;

  await assertRejects(
    () =>
      queryCodexUsage({
        createAppServer: () => ({
          request: (method) => {
            if (method === "initialize") {
              return Promise.resolve({ id: 1, result: {} });
            }
            return Promise.resolve({ id: 2, result: "bad" });
          },
          notify: () => {},
          close: () => {
            closed = true;
            return Promise.resolve();
          },
        }),
      }),
    Error,
    "Codex rate limits response was malformed",
  );

  assertEquals(closed, true);
});
