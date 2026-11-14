import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dueInputToIso,
  todayBounds,
  toLocalDateTimeInput,
  isOverdue,
} from "../utils/taskDates.js";

test("Indian local input round-trips to UTC without shifting a deadline", () => {
  process.env.TZ = "Asia/Kolkata";
  assert.equal(dueInputToIso("2026-10-25T09:30"), "2026-10-25T04:00:00.000Z");
  assert.equal(
    toLocalDateTimeInput("2026-10-25T04:00:00Z"),
    "2026-10-25T09:30",
  );
  assert.deepEqual(todayBounds(new Date("2026-10-25T02:00:00Z")), {
    start: "2026-10-24T18:30:00.000Z",
    end: "2026-10-25T18:30:00.000Z",
  });
});
test("clearing a deadline returns null and invalid dates are rejected", () => {
  assert.equal(dueInputToIso(""), null);
  assert.throws(() => dueInputToIso("not-a-date"), /valid local/);
  assert.throws(() => dueInputToIso("2026-02-30T10:00"), /valid local/);
});
test("local day bounds include 23- and 25-hour daylight saving days", () => {
  process.env.TZ = "America/New_York";
  const spring = todayBounds(new Date("2026-03-08T16:00:00Z"));
  const autumn = todayBounds(new Date("2026-11-01T16:00:00Z"));
  assert.equal(new Date(spring.end) - new Date(spring.start), 23 * 3600000);
  assert.equal(new Date(autumn.end) - new Date(autumn.start), 25 * 3600000);
  assert.throws(() => dueInputToIso("2026-03-08T02:30"), /valid local/);
});
test("editing an unchanged repeated DST minute preserves the exact original instant", () => {
  process.env.TZ = "America/New_York";
  const second = "2026-11-01T06:30:45.000Z";
  assert.equal(toLocalDateTimeInput(second), "2026-11-01T01:30");
  assert.equal(dueInputToIso("2026-11-01T01:30", second), second);
});
test("overdue excludes completed and undated tasks", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  assert.equal(
    isOverdue({ dueAt: "2026-10-25T11:00:00Z", completed: false }, now),
    true,
  );
  assert.equal(
    isOverdue({ dueAt: "2026-10-25T11:00:00Z", completed: true }, now),
    false,
  );
  assert.equal(isOverdue({ dueAt: null, completed: false }, now), false);
});
