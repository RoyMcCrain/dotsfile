import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Keybinding,
  matchesKey,
  truncateToWidth,
  type TUI,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
  sanitize,
  summarize,
  type TimelineRecord,
  type TimelineTask,
} from "./timeline.ts";

type Span = { key: string; start?: TimelineRecord; end?: TimelineRecord };
type Activity = {
  key: string;
  at: string;
  category: "task" | "note" | "tool" | "failure";
  color: "success" | "error" | "warning" | "accent" | "dim";
  title: string;
  details: string[];
};
type LiveTool = { tool: string; started: number };

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const displayTime = (at: string) => timeFormat.format(new Date(at));
const toolKey = (id: string) => `tool:${id}`;

const addToolRecord = (
  record: TimelineRecord,
  spans: Span[],
  starts: Map<string, Span>,
) => {
  if (!record.toolId) return;
  let span = starts.get(record.toolId);
  if (record.kind === "tool-start") {
    if (!span || span.start) {
      span = { key: toolKey(record.toolId), start: record };
      spans.push(span);
      starts.set(record.toolId, span);
    }
    return;
  }
  if (record.kind !== "tool-end") return;
  if (span && !span.end) span.end = record;
  else {
    span = { key: toolKey(record.toolId), end: record };
    spans.push(span);
    starts.set(record.toolId, span);
  }
};

export const projectSpans = (history: TimelineRecord[]): Span[] => {
  const spans: Span[] = [];
  const starts = new Map<string, Span>();
  for (const record of history) addToolRecord(record, spans, starts);
  return spans;
};

const initialPlanChanges = (tasks: TimelineTask[]) =>
  tasks.length
    ? [
      `初期計画 (${tasks.length}件)`,
      ...tasks.map((task) => `+ ${task.id}: ${task.title} [${task.status}]`),
    ]
    : ["計画をクリア"];
const changedTask = (old: TimelineTask | undefined, task: TimelineTask) => {
  if (!old) return [`+ ${task.id}: ${task.title} [${task.status}]`];
  const changes: string[] = [];
  if (old.title !== task.title) {
    changes.push(`✎ ${task.id}: ${old.title} → ${task.title}`);
  }
  if (old.status !== task.status) {
    changes.push(`${old.status} → ${task.status}: ${task.title}`);
  }
  return changes;
};
const diffPlan = (previous: TimelineTask[], next: TimelineTask[]) => {
  if (!next.length && previous.length) return ["計画をクリア"];
  const oldById = new Map(previous.map((task) => [task.id, task]));
  const nextById = new Set(next.map((task) => task.id));
  const removed = previous.filter((task) => !nextById.has(task.id)).map((
    task,
  ) => `− ${task.id}: ${task.title}`);
  return [
    ...removed,
    ...next.flatMap((task) => changedTask(oldById.get(task.id), task)),
  ];
};
const recordIdentity = new WeakMap<TimelineRecord, number>();
let nextRecordIdentity = 0;
const identityFor = (record: TimelineRecord) => {
  let identity = recordIdentity.get(record);
  if (identity === undefined) {
    identity = ++nextRecordIdentity;
    recordIdentity.set(record, identity);
  }
  return identity;
};
const planEvent = (record: TimelineRecord, changes: string[]): Activity => ({
  key: `plan:${identityFor(record)}`,
  at: record.at,
  category: "task",
  color: "accent",
  title: changes[0]?.startsWith("初期計画 (")
    ? changes[0]
    : changes.length === 1
    ? changes[0]!
    : `計画変更 (${changes.length})`,
  details: changes,
});
const noteEvent = (record: TimelineRecord): Activity => ({
  key: `note:${identityFor(record)}`,
  at: record.at,
  category: "note",
  color: "accent",
  title: `✎ メモ ${sanitize(record.note ?? "")}`,
  details: [record.note ?? ""],
});
const planChanges = (history: TimelineRecord[]): Activity[] => {
  let previous: TimelineTask[] | undefined;
  const events: Activity[] = [];
  for (const record of history) {
    if (record.kind === "note") {
      events.push(noteEvent(record));
      continue;
    }
    if (record.kind !== "plan") continue;
    const next = record.tasks ?? [];
    const changes = previous
      ? diffPlan(previous, next)
      : initialPlanChanges(next);
    previous = next;
    if (changes.length) events.push(planEvent(record, changes));
  }
  return events;
};

const isLiveSpan = (span: Span, live: Map<string, LiveTool>) =>
  !!span.start && !span.end && live.has(span.start.toolId ?? "");
const toolStatus = (span: Span, live: Map<string, LiveTool>) => {
  if (span.start?.outcome === "interrupted") return "中断/不明";
  if (isLiveSpan(span, live)) return "実行中";
  const statuses: Record<string, string> = { error: "失敗", ok: "成功" };
  if (span.end) return statuses[span.end.outcome ?? ""] ?? "成功";
  return span.start ? "終了記録なし" : "開始記録なし";
};
const formatDuration = (value: number) => {
  if (value === 0) return "0ms";
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${Number(seconds.toFixed(2))}s`;
  return `${Math.floor(seconds / 60)}m ${Number((seconds % 60).toFixed(1))}s`;
};
const timingLabel = (span: Span, live: Map<string, LiveTool>, now: number) => {
  const timing = span.end?.timing ?? span.start?.timing;
  if (timing) {
    const labels = { duration: "実行時間", elapsed: "経過時間" };
    return `${formatDuration(timing.value)} ${labels[timing.label]}`;
  }
  const start = span.start;
  if (!isLiveSpan(span, live) || !start) return "時間不明";
  return `${formatDuration(Math.max(0, now - Date.parse(start.at)))} 経過時間`;
};
const statusPresentation = (
  status: string,
  outcome: TimelineRecord["outcome"],
) => {
  const colors: Record<string, Activity["color"]> = {
    "実行中": "accent",
    "中断/不明": "warning",
    "成功": "success",
  };
  const symbols: Record<string, string> = {
    "成功": "✓",
    "失敗": "✕",
    "実行中": "●",
    "中断/不明": "!",
  };
  const color: Activity["color"] = outcome === "error"
    ? "error"
    : colors[status] ?? "dim";
  return { color, symbol: symbols[status] ?? "○" };
};
const activityCategory = (
  outcome: TimelineRecord["outcome"],
): Activity["category"] => outcome === "error" ? "failure" : "tool";
const toolActivity = (
  span: Span,
  now: number,
  live: Map<string, LiveTool>,
): Activity | undefined => {
  const source = span.start ?? span.end;
  if (!source) return undefined;
  const status = toolStatus(span, live);
  const timing = timingLabel(span, live, now);
  const name = sanitize(source.tool ?? "tool", 64);
  const outcome = span.end?.outcome ?? span.start?.outcome;
  const { color, symbol } = statusPresentation(status, outcome);
  return {
    key: span.key,
    at: source.at,
    category: activityCategory(outcome),
    color,
    title: `${symbol} ${name} · ${status} · ${timing}`,
    details: [
      `ID: ${sanitize(source.toolId ?? "", 96)}`,
      `状態: ${status}`,
      `時間: ${timing}`,
    ],
  };
};
export const projectActivity = (
  history: TimelineRecord[],
  now: number,
  live: Map<string, LiveTool>,
) => {
  const tools = projectSpans(history).map((span) =>
    toolActivity(span, now, live)
  ).filter((item): item is Activity => !!item);
  return [...planChanges(history), ...tools].sort((a, b) =>
    a.at.localeCompare(b.at)
  );
};

export type TimelineViewOptions = {
  tui: TUI;
  theme: Theme;
  keys: { matches: (data: string, key: Keybinding) => boolean };
  done: (result?: unknown) => void;
  getTasks: () => TimelineTask[];
  getHistory: () => TimelineRecord[];
  getLive: () => Map<string, LiveTool>;
  now: () => number;
};
type ViewState = {
  pane: "activity" | "tasks";
  filter: number;
  follow: boolean;
  selectedKey?: string;
  taskIndex: number;
  expanded?: string;
  detailOffset: number;
};
const matchesFilter = (item: Activity, filter: number) => {
  if (filter === 1) return true;
  if (filter === 2) return item.category === "task" || item.category === "note";
  if (filter === 3) {
    return item.category === "tool" || item.category === "failure";
  }
  return item.category === "failure";
};
const padVisible = (line: string, width: number) => {
  const clipped = truncateToWidth(line, width);
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
};
const taskSymbol = (status: TimelineTask["status"]) =>
  ({ completed: "✓", in_progress: "●", blocked: "!", pending: "○" })[status];
const taskStatusLabel = (status: TimelineTask["status"]) =>
  ({
    completed: "完了",
    in_progress: "実行中",
    blocked: "停滞",
    pending: "未着手",
  })[status];
const taskColor = (status: TimelineTask["status"]) => {
  const colors: Record<TimelineTask["status"], Activity["color"]> = {
    completed: "success",
    in_progress: "accent",
    blocked: "error",
    pending: "dim",
  };
  return colors[status];
};
const progressText = (tasks: TimelineTask[], liveCount: number) => {
  const summary = summarize(tasks);
  const percent = summary.total
    ? Math.round(100 * summary.completed / summary.total)
    : 0;
  const filled = Math.round(percent / 10);
  return `${summary.completed}/${summary.total} ${percent}% ${
    "█".repeat(filled)
  }${"░".repeat(10 - filled)} · 実行 ${liveCount} · 停滞 ${summary.blocked}`;
};

type TimelineData = { tasks: TimelineTask[]; items: Activity[] };
type RenderContext = Pick<
  TimelineViewOptions,
  "tui" | "theme" | "getHistory" | "getLive" | "now"
>;

const detailText = (lines: string[], width: number) =>
  lines.flatMap((line) =>
    wrapTextWithAnsi(sanitize(line, line.length), Math.max(1, width - 2)).map((
      part,
    ) => `  ${part}`)
  );
const visibleTaskRows = (
  tasks: TimelineTask[],
  state: ViewState,
  width: number,
) => {
  const task = tasks[state.taskIndex];
  if (!task || state.expanded !== `task:${task.id}`) return undefined;
  const header = themeTask(state, task, taskStatusLabel(task.status), width);
  const details = detailText([sanitize(task.title)], width);
  state.detailOffset = Math.min(
    state.detailOffset,
    Math.max(0, details.length - 1),
  );
  return [header, ...details.slice(state.detailOffset)];
};
const themeTask = (
  state: ViewState,
  task: TimelineTask,
  status: string,
  width: number,
) =>
  `${state.pane === "tasks" ? "▶" : " "} ${taskSymbol(task.status)} ${status} ${
    truncateToWidth(sanitize(task.title), width)
  }`;
const visibleActivityRows = (
  items: Activity[],
  state: ViewState,
  width: number,
) => {
  const item = items.find((entry) =>
    entry.key === state.expanded && entry.key === state.selectedKey
  );
  if (!item) return undefined;
  const header = `${displayTime(item.at)} ${item.title}`;
  const details = detailText(item.details, width);
  state.detailOffset = Math.min(
    state.detailOffset,
    Math.max(0, details.length - 1),
  );
  return [header, ...details.slice(state.detailOffset)];
};
const themeActivity = (
  item: Activity,
  state: ViewState,
  theme: Theme,
  header: string,
  width: number,
) =>
  theme.fg(
    item.color,
    truncateToWidth(
      `${
        state.pane === "activity" && item.key === state.selectedKey ? "▶" : " "
      } ${header}`,
      width,
    ),
  );
const taskRows = (
  tasks: TimelineTask[],
  state: ViewState,
  theme: Theme,
  width: number,
) => {
  const expanded = visibleTaskRows(tasks, state, width);
  if (expanded) {
    return expanded.map((line) =>
      theme.fg(
        taskColor(tasks[state.taskIndex]!.status),
        truncateToWidth(line, width),
      )
    );
  }
  return tasks.map((task, index) => {
    const line = `${
      index === state.taskIndex && state.pane === "tasks" ? "▶" : " "
    } ${taskSymbol(task.status)} ${taskStatusLabel(task.status)} ${
      sanitize(task.title)
    }`;
    return theme.fg(taskColor(task.status), truncateToWidth(line, width));
  });
};
const activityRows = (
  items: Activity[],
  state: ViewState,
  theme: Theme,
  width: number,
) => {
  const expanded = visibleActivityRows(items, state, width);
  if (expanded) {
    const item = items.find((entry) => entry.key === state.expanded);
    return expanded.map((line, index) =>
      index === 0 && item
        ? themeActivity(item, state, theme, line, width)
        : line
    );
  }
  return items.map((item) =>
    themeActivity(
      item,
      state,
      theme,
      `${displayTime(item.at)} ${item.title}`,
      width,
    )
  );
};
const paneRows = (lines: string[], selected: number, height: number) => {
  const start = Math.max(0, Math.min(selected, lines.length - height));
  return lines.slice(start, start + height);
};
type ScreenLayout = {
  width: number;
  innerWidth: number;
  bodyHeight: number;
  rows: number;
  border: boolean;
};
const wideBody = (
  data: TimelineData,
  context: RenderContext,
  state: ViewState,
  layout: ScreenLayout,
) => {
  const { theme } = context;
  const leftWidth = Math.floor((layout.innerWidth - 3) * 0.42);
  const rightWidth = Math.max(1, layout.innerWidth - leftWidth - 3);
  const left = [
    theme.fg(
      state.pane === "tasks" ? "accent" : "dim",
      truncateToWidth(`計画 (${data.tasks.length})`, leftWidth),
    ),
    ...taskRows(data.tasks, state, theme, leftWidth),
  ];
  const label = ["全て", "計画・メモ", "実行", "失敗"][state.filter - 1];
  const right = [
    theme.fg(
      state.pane === "activity" ? "accent" : "dim",
      truncateToWidth(`活動 · ${label}`, rightWidth),
    ),
    ...activityRows(data.items, state, theme, rightWidth),
  ];
  const leftSelected = state.expanded?.startsWith("task:")
    ? 0
    : state.taskIndex + 1;
  const leftVisible = paneRows(left, leftSelected, layout.bodyHeight);
  const selected = state.expanded && state.expanded === state.selectedKey
    ? 0
    : Math.max(
      1,
      data.items.findIndex((item) => item.key === state.selectedKey) + 1,
    );
  const rightVisible = paneRows(right, selected, layout.bodyHeight);
  return Array.from(
    { length: layout.bodyHeight },
    (_, index) =>
      `${padVisible(leftVisible[index] ?? "", leftWidth)} │ ${
        padVisible(rightVisible[index] ?? "", rightWidth)
      }`,
  );
};
const narrowBody = (
  data: TimelineData,
  context: RenderContext,
  state: ViewState,
  layout: ScreenLayout,
) => {
  const { theme } = context;
  const heading = state.pane === "tasks"
    ? `計画 (${data.tasks.length})`
    : `活動 · ${["全て", "計画・メモ", "実行", "失敗"][state.filter - 1]}`;
  const lines = state.pane === "tasks"
    ? taskRows(data.tasks, state, theme, layout.innerWidth)
    : activityRows(data.items, state, theme, layout.innerWidth);
  const selected = state.pane === "tasks" ? state.taskIndex + 1 : Math.max(
    1,
    data.items.findIndex((item) => item.key === state.selectedKey) + 1,
  );
  const selectedRow = state.expanded ? 0 : selected;
  const visible = paneRows(
    [theme.fg("accent", heading), ...lines],
    selectedRow,
    layout.bodyHeight,
  );
  return [
    ...visible,
    ...Array(Math.max(0, layout.bodyHeight - visible.length)).fill(""),
  ];
};
const screenFrame = (
  lines: string[],
  title: string,
  controls: string,
  filters: string,
  layout: ScreenLayout,
) => {
  const frame = (line: string) =>
    layout.border
      ? `│${padVisible(line, layout.innerWidth)}│`
      : truncateToWidth(line, layout.width);
  if (!layout.border) {
    return [title, ...lines, controls, filters].slice(0, layout.rows);
  }
  return [
    `╭${"─".repeat(Math.max(0, layout.width - 2))}╮`,
    frame(title),
    ...lines.map(frame),
    frame(controls),
    frame(filters),
    `╰${"─".repeat(Math.max(0, layout.width - 2))}╯`,
  ].slice(0, layout.rows);
};
const composeScreen = (
  width: number,
  data: TimelineData,
  context: RenderContext,
  state: ViewState,
) => {
  const rows = Math.max(1, context.tui.terminal.rows);
  const border = width >= 34 && rows >= 7;
  const innerWidth = Math.max(1, width - (border ? 2 : 0));
  const compactChrome = rows >= 5 ? 3 : 2;
  const layout: ScreenLayout = {
    width,
    innerWidth,
    rows,
    border,
    bodyHeight: Math.max(1, rows - (border ? 5 : compactChrome)),
  };
  const live = context.getLive();
  const failures =
    projectActivity(context.getHistory(), context.now(), live).filter((item) =>
      item.category === "failure"
    ).length;
  const title = truncateToWidth(
    `Timeline JST · ${
      progressText(data.tasks, live.size)
    } · 履歴内失敗 ${failures}`,
    innerWidth,
  );
  const pane = state.pane === "tasks" ? "計画" : "活動";
  const controls = `${pane} · 追従 ${
    state.follow ? "ON" : "OFF"
  } · Esc 閉じる · Enter 詳細/戻る`;
  const filters = `Tab ↑↓/PgUp/PgDn · 1全て 2計画・メモ 3実行 4失敗 · Home/End`;
  const body = width >= 90
    ? wideBody(data, context, state, layout)
    : narrowBody(data, context, state, layout);
  return screenFrame(body, title, controls, filters, layout).map((line) =>
    truncateToWidth(line, width)
  );
};
const moveActivity = (items: Activity[], state: ViewState, delta: number) => {
  const index = items.findIndex((item) => item.key === state.selectedKey);
  const next = Math.max(
    0,
    Math.min(items.length - 1, (index < 0 ? items.length - 1 : index) + delta),
  );
  state.selectedKey = items[next]?.key;
  state.follow = false;
  state.expanded = undefined;
};
type NavigationAction = {
  up: boolean;
  down: boolean;
  pageUp: boolean;
  pageDown: boolean;
  confirm: boolean;
};
const navigationAction = (
  data: string,
  keys: TimelineViewOptions["keys"],
): NavigationAction => ({
  up: keys.matches(data, "tui.select.up"),
  down: keys.matches(data, "tui.select.down"),
  pageUp: keys.matches(data, "tui.select.pageUp"),
  pageDown: keys.matches(data, "tui.select.pageDown"),
  confirm: keys.matches(data, "tui.select.confirm"),
});
const detailMovement = (action: NavigationAction, page: number) => {
  if (action.pageUp) return -page;
  if (action.pageDown) return page;
  if (action.up) return -1;
  return 1;
};
const moveDetail = (
  state: ViewState,
  action: NavigationAction,
  page: number,
) => {
  if (
    !state.expanded ||
    !(action.up || action.down || action.pageUp || action.pageDown)
  ) return false;
  state.detailOffset = Math.max(
    0,
    state.detailOffset + detailMovement(action, page),
  );
  return true;
};
const navigateTasks = (
  tasks: TimelineTask[],
  state: ViewState,
  action: NavigationAction,
  page: number,
) => {
  if (action.up) state.taskIndex -= 1;
  else if (action.down) state.taskIndex += 1;
  else if (action.pageUp) state.taskIndex -= page;
  else if (action.pageDown) state.taskIndex += page;
  state.taskIndex = Math.max(0, Math.min(tasks.length - 1, state.taskIndex));
  if (!action.confirm || !tasks[state.taskIndex]) return;
  const key = `task:${tasks[state.taskIndex]!.id}`;
  state.expanded = state.expanded === key ? undefined : key;
  state.detailOffset = 0;
};
const navigateActivity = (
  items: Activity[],
  state: ViewState,
  action: NavigationAction,
  page: number,
) => {
  if (action.up) moveActivity(items, state, -1);
  else if (action.down) moveActivity(items, state, 1);
  else if (action.pageUp) moveActivity(items, state, -page);
  else if (action.pageDown) moveActivity(items, state, page);
  else if (action.confirm) {
    state.expanded = state.expanded === state.selectedKey
      ? undefined
      : state.selectedKey;
    if (state.expanded) state.follow = false;
    state.detailOffset = 0;
  }
};
type NavigationContext = {
  tasks: TimelineTask[];
  items: Activity[];
  state: ViewState;
  keys: TimelineViewOptions["keys"];
  page: number;
};
const navigate = (data: string, context: NavigationContext) => {
  const { tasks, items, state, keys, page } = context;
  const action = navigationAction(data, keys);
  if (moveDetail(state, action, page)) return;
  if (state.pane === "tasks") {
    navigateTasks(tasks, state, action, page);
    return;
  }
  navigateActivity(items, state, action, page);
};
const filteredItems = (context: RenderContext, state: ViewState) =>
  projectActivity(context.getHistory(), context.now(), context.getLive())
    .filter((item) => matchesFilter(item, state.filter));
const clampExpanded = (
  tasks: TimelineTask[],
  items: Activity[],
  state: ViewState,
) => {
  if (state.expanded?.startsWith("task:")) {
    if (!tasks.some((task) => `task:${task.id}` === state.expanded)) {
      state.expanded = undefined;
    }
  } else if (
    state.expanded && !items.some((item) => item.key === state.expanded)
  ) {
    state.expanded = undefined;
  }
  if (!state.expanded) state.detailOffset = 0;
};
const clampSelection = (
  tasks: TimelineTask[],
  items: Activity[],
  state: ViewState,
) => {
  state.taskIndex = Math.max(0, Math.min(tasks.length - 1, state.taskIndex));
  if (!items.some((item) => item.key === state.selectedKey)) {
    state.selectedKey = items.at(-1)?.key;
  }
  clampExpanded(tasks, items, state);
};
const closeInput = (data: string, options: TimelineViewOptions) => {
  if (
    !options.keys.matches(data, "tui.select.cancel") &&
    !matchesKey(data, "ctrl+c")
  ) return false;
  options.done();
  return true;
};
const paneInput = (
  data: string,
  state: ViewState,
  keys: TimelineViewOptions["keys"],
) => {
  if (!keys.matches(data, "tui.input.tab")) return false;
  state.pane = state.pane === "activity" ? "tasks" : "activity";
  state.expanded = undefined;
  state.detailOffset = 0;
  return true;
};
const filterInput = (data: string, state: ViewState) => {
  if (!/^[1-4]$/.test(data)) return false;
  state.filter = Number(data);
  state.selectedKey = undefined;
  state.follow = false;
  state.expanded = undefined;
  state.detailOffset = 0;
  return true;
};
const jumpInput = (
  data: string,
  context: RenderContext,
  state: ViewState,
) => {
  if (!matchesKey(data, "home") && !matchesKey(data, "end")) return false;
  const items = filteredItems(context, state);
  const toEnd = matchesKey(data, "end");
  state.selectedKey = toEnd ? items.at(-1)?.key : items[0]?.key;
  state.follow = toEnd;
  state.expanded = undefined;
  state.detailOffset = 0;
  return true;
};
export const createTimelineView = (options: TimelineViewOptions) => {
  const { tui, keys } = options;
  const context: RenderContext = options;
  const state: ViewState = {
    pane: "activity",
    filter: 1,
    follow: true,
    taskIndex: 0,
    detailOffset: 0,
  };
  return {
    render(width: number) {
      const tasks = options.getTasks();
      const items = filteredItems(context, state);
      clampSelection(tasks, items, state);
      if (state.follow && state.pane === "activity" && items.length) {
        state.selectedKey = items.at(-1)!.key;
      }
      const data = { tasks, items };
      return composeScreen(width, data, context, state);
    },
    handleInput(data: string) {
      if (closeInput(data, options)) return;
      if (paneInput(data, state, keys)) {
        tui.requestRender();
        return;
      }
      if (filterInput(data, state) || jumpInput(data, context, state)) {
        tui.requestRender();
        return;
      }
      navigate(data, {
        tasks: options.getTasks(),
        items: filteredItems(context, state),
        state,
        keys,
        page: Math.max(1, tui.terminal.rows - 6),
      });
      tui.requestRender();
    },
    invalidate() {},
  };
};
