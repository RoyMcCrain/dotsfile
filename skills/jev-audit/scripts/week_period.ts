const MONDAY_UTC_RE = /^\d{4}-\d{2}-\d{2}$/;

export type UtcWeekPeriod = {
  weekStart: string;
  weekEnd: string;
  weekStartIso: string;
  weekEndIso: string;
};

const utcDateParts = (d: Date): { y: number; m: number; day: number } => ({
  y: d.getUTCFullYear(),
  m: d.getUTCMonth() + 1,
  day: d.getUTCDate(),
});

const pad2 = (n: number): string => String(n).padStart(2, "0");

export const formatUtcDate = (d: Date): string => {
  const { y, m, day } = utcDateParts(d);
  return `${y}-${pad2(m)}-${pad2(day)}`;
};

export const parseUtcDate = (value: string): Date => {
  if (!MONDAY_UTC_RE.test(value)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const parts = value.split("-").map((p) => Number(p));
  const y = parts[0]!;
  const m = parts[1]!;
  const day = parts[2]!;
  const d = new Date(Date.UTC(y, m - 1, day));
  if (formatUtcDate(d) !== value) throw new Error("invalid UTC date");
  return d;
};

export const isMondayUtc = (value: string): boolean => {
  const d = parseUtcDate(value);
  return d.getUTCDay() === 1;
};

export const assertMondayUtc = (value: string): void => {
  if (!isMondayUtc(value)) {
    throw new Error("--week must be a Monday (UTC)");
  }
};

export const periodFromWeekStart = (weekStart: string): UtcWeekPeriod => {
  assertMondayUtc(weekStart);
  const start = parseUtcDate(weekStart);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    weekStart,
    weekEnd: formatUtcDate(end),
    weekStartIso: start.toISOString(),
    weekEndIso: end.toISOString(),
  };
};

export const defaultPreviousUtcWeek = (now = new Date()): UtcWeekPeriod => {
  const today = formatUtcDate(now);
  const todayDate = parseUtcDate(today);
  const dow = todayDate.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(
    todayDate.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000,
  );
  const prevMonday = new Date(
    thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  return periodFromWeekStart(formatUtcDate(prevMonday));
};

export const createdAtInPeriod = (
  createdAt: string,
  period: UtcWeekPeriod,
): boolean => {
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return false;
  const start = Date.parse(period.weekStartIso);
  const end = Date.parse(period.weekEndIso);
  return ms >= start && ms < end;
};
