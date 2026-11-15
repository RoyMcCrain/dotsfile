import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { sanitize } from "./timeline.ts";

type LiveTool = { tool: string; started: number };

type WidgetState = {
  title?: string;
  completed: number;
  total: number;
  blocked: number;
  running: Iterable<LiveTool>;
  now: number;
};

export const formatTimelineWidget = (
  state: WidgetState,
  width: number,
) => {
  const safeWidth = Math.max(0, width);
  const percent = state.total
    ? Math.round(100 * state.completed / state.total)
    : 0;
  const filled = Math.round(percent / 10);
  const bar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
  const metrics = ` ${bar} ${percent}% ${state.completed}/${state.total}${
    state.blocked ? ` 停滞${state.blocked}` : ""
  }`;
  const title = state.title ? `● ${sanitize(state.title)}` : "進捗";
  const titleWidth = Math.max(0, safeWidth - visibleWidth(metrics));
  const first = `${truncateToWidth(title, titleWidth)}${
    truncateToWidth(metrics, safeWidth)
  }`;
  const live = [...state.running];
  const second = formatLiveTools(live, state.now, safeWidth);
  return [truncateToWidth(first, safeWidth), second];
};

const formatLiveTools = (
  tools: LiveTool[],
  now: number,
  width: number,
) => {
  if (!tools.length) {
    return truncateToWidth("/timeline · 完了率は申告ステータス", width);
  }
  const prefix = `実行中 (${tools.length}) `;
  const items = tools.map((tool, index) => {
    const elapsed = Math.max(0, now - tool.started);
    const duration = elapsed < 1000
      ? `${elapsed}ms`
      : `${(elapsed / 1000).toFixed(1)}s`;
    return `${sanitize(tool.tool, 32)}${
      index ? ` #${index + 1}` : ""
    } ${duration}`;
  });
  const shown: string[] = [];
  for (const item of items) {
    const remaining = items.length - shown.length - 1;
    const overflow = remaining ? ` +${remaining}` : "";
    const candidate = `${prefix}${
      [...shown, item].join(" · ")
    }${overflow} · /timeline`;
    if (truncateToWidth(candidate, width) !== candidate) break;
    shown.push(item);
  }
  const overflow = items.length - shown.length;
  const line = `${prefix}${shown.join(" · ")}${
    overflow ? `${shown.length ? " ·" : ""} +${overflow}` : ""
  } · /timeline`;
  return truncateToWidth(line, width);
};
