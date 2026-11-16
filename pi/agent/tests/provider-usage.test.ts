import { test } from "bun:test";
import {
  deepEqual as assertEquals,
  ok as assertTrue,
} from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { formatResetAt } from "../lib/codex-usage.ts";
import {
  describeUsageRow,
  renderUsageLines,
  requestAuthenticatedJson,
  toCodexRow,
  type UsageRow,
} from "../lib/provider-usage.ts";

const theme = { fg: (_style: "dim", text: string) => text };

// Resolves only when the signal aborts, mimicking a hung network request.
const hangingFetch = (seen: { signal?: AbortSignal }) =>
  ((_url: string, init: RequestInit) => {
    seen.signal = init.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
      );
    });
  }) as unknown as typeof globalThis.fetch;

test("remaining percentages subtract valid used percentages and round only for display", () => {
  // Arrange
  const row = toCodexRow({
    planType: "pro",
    primary: { usedPercent: 17.6, windowDurationMins: 300 },
    secondary: { usedPercent: 36, windowDurationMins: 10_080 },
  });

  // Act
  const text = describeUsageRow(row);

  // Assert
  assertEquals(text, "Codex 残り: 5h 82% · 7d 64%");
});

test("invalid utilization windows are omitted and plan-only snapshots stay unknown", () => {
  // Arrange
  const outOfRange = toCodexRow({
    primary: { usedPercent: 101, windowDurationMins: 300 },
  });
  const planOnly = toCodexRow({ planType: "pro" });
  const partlyValid = toCodexRow({
    primary: { usedPercent: 10, windowDurationMins: 300 },
    secondary: { usedPercent: -1, windowDurationMins: 10_080 },
  });

  // Act & Assert
  assertEquals(outOfRange, { provider: "Codex", status: "unknown" });
  assertEquals(planOnly, { provider: "Codex", status: "unknown" });
  assertEquals(describeUsageRow(partlyValid), "Codex 残り: 5h 90%");
});

test("a window that is fully used reports zero remaining rather than unknown", () => {
  // Arrange
  const row = toCodexRow({
    primary: { usedPercent: 100, windowDurationMins: 300 },
  });

  // Act
  const text = describeUsageRow(row);

  // Assert
  assertEquals(text, "Codex 残り: 5h 0%");
});

test("unrepresentable reset times are omitted instead of throwing", () => {
  // Arrange
  const row = toCodexRow({
    primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1e20 },
  });

  // Act
  const text = describeUsageRow(row);

  // Assert
  assertEquals(text, "Codex 残り: 5h 75%");
});

test("each window shows its own known reset time", () => {
  // Arrange
  const primaryReset = 1_763_340_000;
  const secondaryReset = 1_763_900_000;
  const row = toCodexRow({
    primary: {
      usedPercent: 18,
      windowDurationMins: 300,
      resetsAt: primaryReset,
    },
    secondary: {
      usedPercent: 36,
      windowDurationMins: 10_080,
      resetsAt: secondaryReset,
    },
  });

  // Act
  const text = describeUsageRow(row);

  // Assert
  assertEquals(
    text,
    `Codex 残り: 5h 82% ↻${formatResetAt(primaryReset)} · 7d 64% ↻${
      formatResetAt(secondaryReset)
    }`,
  );
});

test("every provider stays visible and no line exceeds a narrow width", () => {
  // Arrange
  const rows: UsageRow[] = [
    toCodexRow({
      primary: { usedPercent: 18, windowDurationMins: 300 },
      secondary: { usedPercent: 36, windowDurationMins: 10_080 },
    }),
    {
      provider: "Claude",
      status: "ok",
      windows: [{ label: "5h", remainingPercent: 77 }],
    },
  ];

  // Act
  const lines = renderUsageLines(rows, 24, theme);

  // Assert
  assertTrue(lines.every((line) => visibleWidth(line) <= 24));
  const plain = lines.join("");
  assertTrue(plain.includes("Codex 残り"));
  assertTrue(plain.includes("Claude 残り"));
});

test("a hung authenticated request fails once its timeout elapses", async () => {
  // Arrange
  const seen: { signal?: AbortSignal } = {};

  // Act
  const result = await requestAuthenticatedJson({
    url: "https://example.invalid/usage",
    headers: {},
    fetch: hangingFetch(seen),
    timeoutMs: 5,
  });

  // Assert
  assertEquals(result, { state: "failed" });
  assertEquals(seen.signal?.aborted, true);
});

test("aborting the parent signal cancels a hung authenticated request", async () => {
  // Arrange
  const seen: { signal?: AbortSignal } = {};
  const parent = new AbortController();

  // Act
  const pending = requestAuthenticatedJson({
    url: "https://example.invalid/usage",
    headers: {},
    fetch: hangingFetch(seen),
    signal: parent.signal,
  });
  parent.abort();
  const result = await pending;

  // Assert
  assertEquals(result, { state: "failed" });
  assertEquals(seen.signal?.aborted, true);
});
