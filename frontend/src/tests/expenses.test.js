import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidAmount,
  budgetPercent,
  amountInput,
  expenseDate,
  exportError,
  localToday,
  monthName,
  money,
  weeklySpending,
} from "../utils/expenses.js";

test("decimal entry validation rejects hidden precision, scientific notation, negatives, and limits", () => {
  for (const value of ["1", "0.01", "12.34", "10000000.00"])
    assert.equal(isValidAmount(value), true);
  for (const value of [
    "",
    "0",
    "-1",
    "1.234",
    "1e3",
    "1,000",
    "NaN",
    "10000000.01",
  ])
    assert.equal(isValidAmount(value), false);
  assert.equal(isValidAmount("0", true), true);
});
test("zero and missing budgets have different meanings", () => {
  assert.equal(amountInput(null), "");
  assert.equal(amountInput(0), "0.00");
  assert.equal(budgetPercent(1, 0), 100);
  assert.equal(budgetPercent(0, 0), 0);
  assert.equal(budgetPercent(1000, null), 0);
  assert.equal(budgetPercent(12000, 10000), 100);
});
test("rupee formatting retains paise and negative remaining budgets", () => {
  assert.match(money(12345), /123.45/);
  assert.match(money(-1), /-.*0.01/);
  assert.equal(amountInput(30), "0.30");
});
test("expense calendar dates display in the same month across timezone boundaries", () => {
  process.env.TZ = "America/Los_Angeles";
  assert.match(expenseDate("2026-10-01"), /1 Oct 2026/);
  assert.equal(monthName("2026-10"), "October 2026");
  process.env.TZ = "Asia/Kolkata";
  assert.equal(localToday(new Date("2026-09-30T20:00:00Z")), "2026-10-01");
});
test("export errors preserve the server explanation", async () => {
  assert.equal(
    await exportError(new Error("Use CSV for these characters.")),
    "Use CSV for these characters.",
  );
  assert.match(await exportError({}), /Could not export/);
});

test("weekly spending keeps paise precise at week boundaries and month end", () => {
  const daily = Array.from({ length: 31 }, (_, index) => ({ day: index + 1, totalPaise: 0 }));
  for (const [day, value] of [[1, 1], [7, 99], [8, 200], [14, 3], [28, 400], [29, 500], [31, 6]]) daily[day - 1].totalPaise = value;
  assert.deepEqual(weeklySpending(daily), [
    { label: "Wk 1", totalPaise: 100 },
    { label: "Wk 2", totalPaise: 203 },
    { label: "Wk 3", totalPaise: 0 },
    { label: "Wk 4", totalPaise: 400 },
    { label: "Wk 5", totalPaise: 506 },
  ]);
  assert.equal(weeklySpending(daily).reduce((sum, row) => sum + row.totalPaise, 0), daily.reduce((sum, row) => sum + row.totalPaise, 0));
  assert.equal(weeklySpending(daily.slice(0, 28)).length, 4);
  assert.deepEqual(weeklySpending([]), []);
});
