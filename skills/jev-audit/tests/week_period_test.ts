import assert from "node:assert/strict";
import {
  assertMondayUtc,
  createdAtInPeriod,
  defaultPreviousUtcWeek,
  parseUtcDate,
  periodFromWeekStart,
} from "../scripts/week_period.ts";

Deno.test("UTC week boundaries and Monday validation", () => {
  assert.throws(() => parseUtcDate("2026-02-30"), /invalid UTC date/);
  assert.throws(() => assertMondayUtc("2026-09-29"), /Monday/);
  assert.doesNotThrow(() => assertMondayUtc("2026-09-28"));
  const period = periodFromWeekStart("2026-09-28");
  assert.equal(period.weekEnd, "2026-10-05");
  assert.equal(
    createdAtInPeriod("2026-09-28T00:00:00.000Z", period),
    true,
  );
  assert.equal(
    createdAtInPeriod("2026-10-05T00:00:00.000Z", period),
    false,
  );
});

Deno.test("default previous UTC week is stable for fixed now", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");
  const period = defaultPreviousUtcWeek(now);
  assert.equal(period.weekStart, "2026-09-28");
});
