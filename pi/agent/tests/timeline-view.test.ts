import { test } from "bun:test";
import { deepEqual, equal } from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createTimelineView, projectActivity } from "../lib/timeline-view.ts";
import type { TimelineRecord } from "../lib/timeline.ts";

const at = (seconds: number) =>
  `2026-11-15T00:00:${String(seconds).padStart(2, "0")}.000Z`;

test("tool starts aggregate by exact ID and end timing retains zero duration", () => {
  const history: TimelineRecord[] = [
    { at: at(0), kind: "tool-start", toolId: "same-name-a", tool: "read" },
    { at: at(1), kind: "tool-start", toolId: "same-name-b", tool: "read" },
    {
      at: at(2),
      kind: "tool-end",
      toolId: "same-name-b",
      tool: "read",
      outcome: "ok",
      timing: { value: 0, label: "duration" },
    },
    {
      at: at(3),
      kind: "tool-end",
      toolId: "same-name-a",
      tool: "read",
      outcome: "error",
    },
  ];
  const rows = projectActivity(history, Date.parse(at(4)), new Map());
  equal(rows.length, 2);
  deepEqual(rows.map((row) => row.details[0]), [
    "ID: same-name-a",
    "ID: same-name-b",
  ]);
  equal(rows[1]!.title.includes("0ms 実行時間"), true);
  equal(rows[0]!.category, "failure");
});

test("plan activity reports snapshot changes instead of repeating unchanged tasks", () => {
  const tasks = [{ id: "one", title: "First", status: "pending" as const }];
  const history: TimelineRecord[] = [
    { at: at(0), kind: "plan", tasks },
    { at: at(1), kind: "plan", tasks },
    {
      at: at(2),
      kind: "plan",
      tasks: [{ ...tasks[0]!, title: "Renamed", status: "completed" }],
    },
    { at: at(3), kind: "plan", tasks: [] },
  ];
  const rows = projectActivity(history, Date.parse(at(4)), new Map());
  equal(rows.length, 3);
  equal(rows[0]!.details.some((line) => line.includes("First")), true);
  equal(rows[1]!.details.some((line) => line.includes("Renamed")), true);
  equal(rows[2]!.title, "計画をクリア");
});

test("execution filter includes failed calls, and same-time plans have stable distinct identities", () => {
  const tasks = [{ id: "a", title: "初期", status: "pending" as const }];
  const history: TimelineRecord[] = [
    { at: at(0), kind: "plan", tasks },
    { at: at(0), kind: "plan", tasks: [] },
    { at: at(1), kind: "tool-start", toolId: "failed", tool: "bash" },
    {
      at: at(2),
      kind: "tool-end",
      toolId: "failed",
      tool: "bash",
      outcome: "error",
    },
  ];
  const rows = projectActivity(history, Date.parse(at(3)), new Map());
  const plans = rows.filter((row) => row.category === "task");
  const failures = rows.filter((row) => row.category === "failure");
  equal(plans.length, 2);
  equal(new Set(plans.map((row) => row.key)).size, 2);
  equal(failures.length, 1);
  equal(failures[0]!.title.includes("2.45s"), false);
});

test("notes retain equal-time identity, chronological ordering, and plan-and-note filtering", () => {
  const history: TimelineRecord[] = [
    { at: at(1), kind: "plan", tasks: [] },
    { at: at(1), kind: "note", note: "first" },
    { at: at(1), kind: "note", note: "second" },
    {
      at: at(1),
      kind: "plan",
      tasks: [{ id: "after", title: "after notes", status: "pending" }],
    },
    { at: at(2), kind: "tool-end", toolId: "ok", tool: "read", outcome: "ok" },
    {
      at: at(3),
      kind: "tool-end",
      toolId: "bad",
      tool: "bash",
      outcome: "error",
    },
  ];
  const rows = projectActivity(history, Date.parse(at(4)), new Map());
  const notes = rows.filter((row) => row.category === "note");
  equal(notes.length, 2);
  equal(notes[0]!.title.includes("first"), true);
  equal(new Set(notes.map((row) => row.key)).size, 2);
  deepEqual(rows.slice(0, 4).map((row) => row.details[0]), [
    "計画をクリア",
    "first",
    "second",
    "+ after: after notes [pending]",
  ]);
  const view = createTimelineView({
    tui: { terminal: { rows: 10 }, requestRender() {} } as never,
    theme: { fg: (_style: string, text: string) => text } as never,
    keys: { matches: (data, key) => data === key },
    done() {},
    getTasks: () => [],
    getHistory: () => history,
    getLive: () => new Map(),
    now: () => Date.parse(at(4)),
  });
  view.handleInput("2");
  equal(view.render(60).some((line) => line.includes("✎ メモ")), true);
  equal(view.render(60).some((line) => line.includes("read")), false);
  view.handleInput("3");
  equal(view.render(60).some((line) => line.includes("✎ メモ")), false);
  equal(view.render(60).some((line) => line.includes("bash")), true);
});

test("expanded note details retain text beyond 256 characters at narrow width", () => {
  const note = `${"reason ".repeat(42)}UNIQUE_NOTE_TAIL`;
  const history: TimelineRecord[] = [{ at: at(1), kind: "note", note }];
  const view = createTimelineView({
    tui: { terminal: { rows: 6 }, requestRender() {} } as never,
    theme: { fg: (_style: string, text: string) => text } as never,
    keys: { matches: (data, key) => data === key },
    done() {},
    getTasks: () => [],
    getHistory: () => history,
    getLive: () => new Map(),
    now: () => Date.parse(at(2)),
  });
  view.render(20);
  view.handleInput("tui.select.confirm");
  for (let index = 0; index < 60; index++) {
    view.handleInput("tui.select.pageDown");
  }
  equal(
    view.render(20).some((line) => line.includes("UNIQUE_NOTE_TAIL")),
    true,
  );
});

test("wide panes stay independent and execution filter retains failures", () => {
  const history: TimelineRecord[] = [
    { at: at(1), kind: "tool-start", toolId: "bad", tool: "bash" },
    {
      at: at(2),
      kind: "tool-end",
      toolId: "bad",
      tool: "bash",
      outcome: "error",
    },
  ];
  const view = createTimelineView({
    tui: { terminal: { rows: 12 }, requestRender() {} } as never,
    theme: { fg: (_style: string, text: string) => text } as never,
    keys: { matches: (data, key) => data === key },
    done() {},
    getTasks: () => [{ id: "a", title: "日本語 😀", status: "pending" }],
    getHistory: () => history,
    getLive: () => new Map(),
    now: () => Date.parse(at(3)),
  });
  view.handleInput("3");
  const before = view.render(112);
  equal(
    before.some((line) => line.includes("bash") && line.includes("失敗")),
    true,
  );
  view.handleInput("tui.input.tab");
  const after = view.render(112);
  equal(
    after.some((line) => line.includes("bash") && line.includes("失敗")),
    true,
  );
  equal(after.every((line) => visibleWidth(line) <= 112), true);
  equal(after.some((line) => line.includes("│")), true);
});

test("expanded initial plan details remain reachable through page navigation", () => {
  const tasks = Array.from({ length: 50 }, (_, index) => ({
    id: `task-${index}`,
    title: index === 49 ? "UNIQUE_DETAIL_TAIL_50" : `Task ${index}`,
    status: "pending" as const,
  }));
  const history: TimelineRecord[] = [{ at: at(1), kind: "plan", tasks }];
  const view = createTimelineView({
    tui: { terminal: { rows: 12 }, requestRender() {} } as never,
    theme: { fg: (_style: string, text: string) => text } as never,
    keys: { matches: (data, key) => data === key },
    done() {},
    getTasks: () => tasks,
    getHistory: () => history,
    getLive: () => new Map(),
    now: () => Date.parse(at(2)),
  });
  view.render(60);
  view.handleInput("tui.select.confirm");
  for (let index = 0; index < 30; index++) {
    view.handleInput("tui.select.pageDown");
  }
  equal(
    view.render(60).some((line) => line.includes("UNIQUE_DETAIL_TAIL_50")),
    true,
  );
});

test("expanded long task title can be scrolled to its final wrapped line", () => {
  const tasks = [{
    id: "long",
    title: `${"詳細".repeat(52)}UNIQUE_END`,
    status: "pending" as const,
  }];
  const view = createTimelineView({
    tui: { terminal: { rows: 6 }, requestRender() {} } as never,
    theme: { fg: (_style: string, text: string) => text } as never,
    keys: { matches: (data, key) => data === key },
    done() {},
    getTasks: () => tasks,
    getHistory: () => [],
    getLive: () => new Map(),
    now: () => Date.parse(at(2)),
  });
  view.handleInput("tui.input.tab");
  view.handleInput("tui.select.confirm");
  for (let index = 0; index < 20; index++) {
    view.handleInput("tui.select.pageDown");
  }
  equal(view.render(20).some((line) => line.includes("UNIQUE_END")), true);
});

test("paused activity selection survives history shifts and resumes following at End", () => {
  let clock = Date.parse(at(3));
  let history: TimelineRecord[] = [0, 1, 2, 3].map((second) => ({
    at: at(second),
    kind: "tool-start",
    toolId: `tool-${second}`,
    tool: "read",
  }));
  const view = createTimelineView({
    tui: { terminal: { rows: 10 }, requestRender() {} } as never,
    theme: { fg: (_style: string, text: string) => text } as never,
    keys: { matches: (data, key) => data === key },
    done() {},
    getTasks: () => [],
    getHistory: () => history,
    getLive: () => new Map(),
    now: () => clock,
  });
  view.render(50);
  view.handleInput("tui.select.up");
  const selected = view.render(50).find((line) => line.includes("▶"));
  clock = Date.parse(at(4));
  equal(view.render(50).find((line) => line.includes("▶")), selected);
  history = [history[1]!, history[2]!, history[3]!, {
    at: at(4),
    kind: "tool-start",
    toolId: "tool-4",
    tool: "read",
  }];
  view.render(50);
  equal(view.render(50).find((line) => line.includes("▶")), selected);
  view.handleInput("\u001b[F");
  history = [...history, {
    at: at(5),
    kind: "tool-start",
    toolId: "tool-5",
    tool: "read",
  }];
  equal(
    view.render(50).some((line) =>
      line.includes("09:00:05") && line.includes("▶")
    ),
    true,
  );
});

test("late activity details start at their head, stay anchored on arrival, and End follows", () => {
  const specialTitles: Record<number, string> = {
    0: "DETAIL_HEAD",
    49: "DETAIL_TAIL",
  };
  const tasks = Array.from({ length: 50 }, (_, index) => ({
    id: `detail-${index}`,
    title: specialTitles[index] ?? `Task ${index}`,
    status: "pending" as const,
  }));
  let clock = Date.parse(at(12));
  let history: TimelineRecord[] = [
    ...Array.from({ length: 12 }, (_, second) => ({
      at: at(second),
      kind: "tool-end" as const,
      toolId: `ended-${second}`,
      tool: "read",
      outcome: "ok" as const,
    })),
    { at: at(12), kind: "plan", tasks },
  ];
  const view = createTimelineView({
    tui: { terminal: { rows: 12 }, requestRender() {} } as never,
    theme: { fg: (_style: string, text: string) => text } as never,
    keys: { matches: (data, key) => data === key },
    done() {},
    getTasks: () => tasks,
    getHistory: () => history,
    getLive: () => new Map(),
    now: () => clock,
  });
  view.render(60);
  view.handleInput("tui.select.confirm");
  const opened = view.render(60);
  equal(opened.some((line) => line.includes("DETAIL_HEAD")), true);
  equal(opened.some((line) => line.includes("DETAIL_TAIL")), false);
  const selectedHeader = opened.find((line) => line.includes("初期計画"));
  clock = Date.parse(at(13));
  history = [...history, {
    at: at(13),
    kind: "tool-start",
    toolId: "new-arrival",
    tool: "write",
  }];
  const anchored = view.render(60);
  equal(anchored.some((line) => line.includes("DETAIL_HEAD")), true);
  equal(anchored.find((line) => line.includes("初期計画")), selectedHeader);
  for (let index = 0; index < 10; index++) {
    view.handleInput("tui.select.pageDown");
  }
  equal(view.render(60).some((line) => line.includes("DETAIL_TAIL")), true);
  view.handleInput("\u001b[F");
  equal(
    view.render(60).some((line) =>
      line.includes("09:00:13") && line.includes("write")
    ),
    true,
  );
});

test("narrow frames retain their configured row count when details are short", () => {
  const view = createTimelineView({
    tui: { terminal: { rows: 6 }, requestRender() {} } as never,
    theme: { fg: (_style: string, text: string) => text } as never,
    keys: { matches: (data, key) => data === key },
    done() {},
    getTasks: () => [{ id: "one", title: "short", status: "pending" }],
    getHistory: () => [],
    getLive: () => new Map(),
    now: () => Date.parse(at(1)),
  });
  view.handleInput("tui.input.tab");
  view.handleInput("tui.select.confirm");
  equal(view.render(20).length, 6);
  equal(view.render(20).every((line) => visibleWidth(line) <= 20), true);
});

test("end-only retained span uses its exact tool identity and unknown duration", () => {
  const rows = projectActivity(
    [{
      at: at(2),
      kind: "tool-end",
      toolId: "ended",
      tool: "read",
      outcome: "ok",
    }],
    Date.parse(at(4)),
    new Map(),
  );
  equal(rows.length, 1);
  equal(rows[0]!.title.includes("時間不明"), true);
  equal(rows[0]!.key, "tool:ended");
});
