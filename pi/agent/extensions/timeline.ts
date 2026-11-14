import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  appendRecord,
  markInterrupted,
  NOTE_LIMIT,
  readRecord,
  sanitize,
  summarize,
  type TimelineRecord,
  type TimelineTask,
  validateNote,
  validateTasks,
} from "../lib/timeline.ts";
import { createTimelineView } from "../lib/timeline-view.ts";
import { formatTimelineWidget } from "../lib/timeline-widget.ts";

const ENTRY = "timeline";
const WIDGET = "timeline";
const stamp = () => new Date().toISOString();
type Running = { tool: string; started: number };
type TaskParams = { tasks?: unknown; note?: unknown };
const validateRequest = (params: TaskParams) => {
  const tasks = params.tasks === undefined
    ? undefined
    : validateTasks(params.tasks);
  const note = params.note === undefined
    ? undefined
    : validateNote(params.note);
  if (
    (params.tasks !== undefined && !tasks) ||
    (params.note !== undefined && !note)
  ) return undefined;
  return { tasks, note };
};

export default function timeline(pi: ExtensionAPI) {
  let tasks: TimelineTask[] = [];
  let history: TimelineRecord[] = [];
  let running = new Map<string, Running>();
  let refresh: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let uiContext: ExtensionContext | undefined;

  const record = (item: TimelineRecord) => {
    history = appendRecord(history, item);
    pi.appendEntry(ENTRY, item);
    refresh?.();
  };
  const updateWidget = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const info = summarize(tasks);
    if (!tasks.length && !running.size) {
      ctx.ui.setWidget(WIDGET, undefined);
      return;
    }
    const lines = formatTimelineWidget({
      title: info.active?.title,
      completed: info.completed,
      total: info.total,
      blocked: info.blocked,
      running: running.values(),
      now: Date.now(),
    }, 100);
    if (ctx.mode !== "tui") {
      ctx.ui.setWidget(WIDGET, lines, { placement: "aboveEditor" });
      return;
    }
    ctx.ui.setWidget(WIDGET, (_tui, theme) => ({
      render(width: number) {
        return formatTimelineWidget({
          title: info.active?.title,
          completed: info.completed,
          total: info.total,
          blocked: info.blocked,
          running: running.values(),
          now: Date.now(),
        }, width).map((line) => theme.fg("dim", line));
      },
      invalidate() {},
    }), { placement: "aboveEditor" });
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  const syncTimer = (ctx: ExtensionContext) => {
    uiContext = ctx.hasUI ? ctx : undefined;
    if (!ctx.hasUI || !running.size) {
      stopTimer();
      return;
    }
    if (!timer) {
      timer = setInterval(() => {
        if (!running.size || !uiContext?.hasUI) {
          stopTimer();
          return;
        }
        updateWidget(uiContext);
        refresh?.();
      }, 1000);
      timer.unref?.();
    }
  };
  const restore = (ctx: ExtensionContext) => {
    stopTimer();
    tasks = [];
    history = [];
    running = new Map();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== ENTRY) continue;
      const item = readRecord(entry.data);
      if (!item) continue;
      history = appendRecord(history, item);
      if (item.kind === "plan" && item.tasks) tasks = item.tasks;
    }
    history = markInterrupted(history);
    updateWidget(ctx);
  };

  pi.registerTool({
    name: "timeline_tasks",
    label: "Timeline Tasks",
    executionMode: "sequential",
    description:
      "Read or replace the current flat task plan and append a public progress note.",
    promptSnippet:
      "Track multi-step work and significant public progress notes with timeline_tasks",
    promptGuidelines: [
      "Use timeline_tasks for genuinely multi-step work; give truthful status updates. Omitted tasks leave the plan, [] clears it, and completed tasks remain until omitted.",
      "At significant milestones, proactively call timeline_tasks(note=...) with one or two concise public sentences explaining what changed, why, and what is next: initial plan, meaningful approach change/decision, and validation outcome. Include tasks when useful; use note-only otherwise. Avoid per-tool/redundant notes. Never record private reasoning/thinking streams, secrets, full prompts, commands, or copied tool output.",
    ],
    parameters: Type.Object({
      tasks: Type.Optional(Type.Array(Type.Object({
        id: Type.String(),
        title: Type.String(),
        status: Type.Union([
          Type.Literal("pending"),
          Type.Literal("in_progress"),
          Type.Literal("completed"),
          Type.Literal("blocked"),
        ]),
      }))),
      note: Type.Optional(Type.String({ maxLength: NOTE_LIMIT })),
    }),
    // deno-lint-ignore require-await
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const input = validateRequest(params);
      if (!input) {
        return {
          content: [{
            type: "text",
            text: "Invalid task list or note; plan unchanged.",
          }],
          details: {},
          isError: true,
        };
      }
      if (params.tasks === undefined && params.note === undefined) {
        return {
          content: [{ type: "text", text: JSON.stringify(tasks) }],
          details: {},
        };
      }
      if (
        input.tasks && JSON.stringify(input.tasks) !== JSON.stringify(tasks)
      ) {
        tasks = input.tasks;
        record({ at: stamp(), kind: "plan", tasks });
        updateWidget(ctx);
      }
      if (input.note) record({ at: stamp(), kind: "note", note: input.note });
      return {
        content: [{ type: "text", text: JSON.stringify(tasks) }],
        details: {},
      };
    },
  });
  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("tool_execution_start", (event, ctx) => {
    if (event.toolName === "timeline_tasks") return;
    const name = sanitize(event.toolName, 64) || "tool";
    running.set(event.toolCallId, { tool: name, started: Date.now() });
    record({
      at: stamp(),
      kind: "tool-start",
      toolId: event.toolCallId,
      tool: name,
    });
    updateWidget(ctx);
    syncTimer(ctx);
  });
  pi.on("tool_execution_end", (event, ctx) => {
    if (event.toolName === "timeline_tasks") return;
    const start = running.get(event.toolCallId);
    running.delete(event.toolCallId);
    const actual = (event as typeof event & { durationMs?: number }).durationMs;
    let timing: TimelineRecord["timing"];
    if (typeof actual === "number" && Number.isFinite(actual) && actual >= 0) {
      timing = { value: actual, label: "duration" };
    } else if (start) {
      timing = {
        value: Math.max(0, Date.now() - start.started),
        label: "elapsed",
      };
    }
    record({
      at: stamp(),
      kind: "tool-end",
      toolId: event.toolCallId,
      tool: sanitize(event.toolName, 64) || "tool",
      outcome: event.isError ? "error" : "ok",
      ...(timing ? { timing } : {}),
    });
    updateWidget(ctx);
    syncTimer(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    running.clear();
    stopTimer();
    refresh = undefined;
    uiContext = undefined;
    if (ctx.hasUI) ctx.ui.setWidget(WIDGET, undefined);
  });
  pi.registerCommand("timeline", {
    description: "Show task and tool timeline",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          `進捗 ${summarize(tasks).completed}/${tasks.length}`,
          "info",
        );
        return;
      }
      try {
        await ctx.ui.custom((tui, theme, keys, done) => {
          refresh = () => tui.requestRender();
          return createTimelineView({
            tui,
            theme,
            keys,
            done,
            getTasks: () => tasks,
            getHistory: () => history,
            getLive: () => running,
            now: Date.now,
          });
        }, {
          overlay: true,
          overlayOptions: { width: "100%", maxHeight: "100%", margin: 0 },
        });
      } finally {
        refresh = undefined;
      }
    },
  });
}
