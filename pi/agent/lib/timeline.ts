export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";
export type TimelineTask = { id: string; title: string; status: TaskStatus };
export type TimelineRecord = {
  at: string;
  kind: "plan" | "note" | "tool-start" | "tool-end";
  tasks?: TimelineTask[];
  note?: string;
  toolId?: string;
  tool?: string;
  outcome?: "ok" | "error" | "interrupted";
  timing?: { value: number; label: "duration" | "elapsed" };
};
export const HISTORY_LIMIT = 200;
export const TITLE_LIMIT = 120;
export const NOTE_LIMIT = 320;
const displayTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export const sanitize = (value: string, limit = TITLE_LIMIT) =>
  // deno-lint-ignore no-control-regex -- security requires stripping terminal/control characters.
  value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(
    // deno-lint-ignore no-control-regex -- strip remaining C0/C1 controls.
    /[\u0000-\u001f\u007f-\u009f]/g,
    " ",
  ).replace(/\s+/g, " ").trim().slice(0, limit);

const validateTask = (value: unknown): TimelineTask | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const task = value as Record<string, unknown>;
  const validStatuses: TaskStatus[] = [
    "pending",
    "in_progress",
    "completed",
    "blocked",
  ];
  if (
    typeof task.id !== "string" || typeof task.title !== "string" ||
    !validStatuses.includes(task.status as TaskStatus)
  ) return undefined;
  const id = sanitize(task.id, 64);
  const title = sanitize(task.title);
  return id && title
    ? { id, title, status: task.status as TaskStatus }
    : undefined;
};

export const validateNote = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.length > NOTE_LIMIT) return undefined;
  return sanitize(value, NOTE_LIMIT) || undefined;
};

export const validateTasks = (value: unknown): TimelineTask[] | undefined => {
  if (!Array.isArray(value) || value.length > 50) return undefined;
  const ids = new Set<string>();
  const tasks: TimelineTask[] = [];
  for (const item of value) {
    const task = validateTask(item);
    if (!task || ids.has(task.id)) return undefined;
    ids.add(task.id);
    tasks.push(task);
  }
  return tasks;
};

export const appendRecord = (
  history: TimelineRecord[],
  record: TimelineRecord,
) => [...history, record].slice(-HISTORY_LIMIT);

export const markInterrupted = (history: TimelineRecord[]) => {
  const ended = new Set(
    history.filter((record) => record.kind === "tool-end").map((record) =>
      record.toolId
    ),
  );
  return history.map((record) =>
    record.kind === "tool-start" && record.toolId && !ended.has(record.toolId)
      ? { ...record, outcome: "interrupted" as const }
      : record
  );
};

export const summarize = (tasks: TimelineTask[]) => {
  const completed = tasks.filter((task) => task.status === "completed").length;
  return {
    completed,
    total: tasks.length,
    active: tasks.find((task) => task.status === "in_progress"),
    blocked: tasks.filter((task) => task.status === "blocked").length,
  };
};

const formatToolRecord = (record: TimelineRecord, time: string) => {
  let action = "終了";
  if (record.kind === "tool-start") {
    action = record.outcome === "interrupted" ? "中断/不明" : "開始";
  } else if (record.outcome === "error") action = "失敗";
  const timing = record.timing
    ? ` ${record.timing.value}ms ${record.timing.label}`
    : "";
  return [`${time} ${record.tool ?? "tool"} ${action}${timing}`];
};

export const formatRecord = (record: TimelineRecord) => {
  const time = displayTime.format(new Date(record.at));
  if (record.kind === "note") return [`${time} ✎ メモ ${record.note ?? ""}`];
  if (record.kind !== "plan") return formatToolRecord(record, time);
  if (!record.tasks?.length) return [`${time} 計画をクリア`];
  return record.tasks.map((task) => `${time} ${task.status} ${task.title}`);
};

const isValidTimingValue = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const parseTiming = (
  value: unknown,
): TimelineRecord["timing"] | null | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isValidTimingValue(raw.value)) return null;
  if (raw.label !== "duration" && raw.label !== "elapsed") return null;
  return { value: raw.value, label: raw.label };
};

const readNote = (
  value: Record<string, unknown>,
  at: string,
): TimelineRecord | undefined => {
  const note = validateNote(value.note);
  return note ? { at, kind: "note", note } : undefined;
};

const readPlan = (
  value: Record<string, unknown>,
  at: string,
): TimelineRecord | undefined => {
  const tasks = validateTasks(value.tasks);
  return tasks ? { at, kind: "plan", tasks } : undefined;
};

const readToolFields = (value: Record<string, unknown>) => {
  if (typeof value.toolId !== "string" || !value.toolId) return undefined;
  if (typeof value.tool !== "string") return undefined;
  const toolId = value.toolId;
  const tool = sanitize(value.tool, 64);
  return toolId && tool ? { toolId, tool } : undefined;
};

const readToolStart = (
  value: Record<string, unknown>,
  at: string,
): TimelineRecord | undefined => {
  const fields = readToolFields(value);
  if (!fields || value.outcome !== undefined) return undefined;
  const timing = parseTiming(value.timing);
  if (timing === null) return undefined;
  return { at, kind: "tool-start", ...fields, ...(timing ? { timing } : {}) };
};

const readToolEnd = (
  value: Record<string, unknown>,
  at: string,
): TimelineRecord | undefined => {
  const fields = readToolFields(value);
  if (!fields) return undefined;
  if (value.outcome !== "ok" && value.outcome !== "error") return undefined;
  const timing = parseTiming(value.timing);
  if (timing === null) return undefined;
  return {
    at,
    kind: "tool-end",
    ...fields,
    outcome: value.outcome,
    ...(timing ? { timing } : {}),
  };
};

const readToolRecord = (
  value: Record<string, unknown>,
  at: string,
): TimelineRecord | undefined => {
  if (value.kind === "tool-start") return readToolStart(value, at);
  if (value.kind === "tool-end") return readToolEnd(value, at);
  return undefined;
};

export const readRecord = (data: unknown): TimelineRecord | undefined => {
  if (!data || typeof data !== "object") return undefined;
  const value = data as Record<string, unknown>;
  if (typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at))) {
    return undefined;
  }
  const at = new Date(value.at).toISOString();
  if (value.kind === "plan") return readPlan(value, at);
  if (value.kind === "note") return readNote(value, at);
  return readToolRecord(value, at);
};
