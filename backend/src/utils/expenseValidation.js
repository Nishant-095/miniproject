import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  MAX_AMOUNT_PAISE,
} from "../config/expenseConfig.js";
import { httpError } from "./httpError.js";
export function validateMonth(month) {
  // Checks the supported calendar month format.
  if (typeof month !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
    throw httpError(400, "Choose a month from 2000-01 to 2099-12 (YYYY-MM).");
  return month;
}
export function shiftMonth(month, offset) {
  // Moves a stored month by an offset.
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function monthFilter(month) {
  // Builds date bounds for a calendar month.
  validateMonth(month);
  return {
    $gte: `${month}-01`,
    $lt: `${shiftMonth(month, 1)}-01`,
  };
}
export function validateExpenseDate(value) {
  // Checks that an expense date is real.
  if (
    typeof value !== "string" ||
    !/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)
  )
    throw httpError(400, "Choose a date from 2000 to 2099 (YYYY-MM-DD).");
  const date = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw httpError(400, "Enter a real calendar date.");
  return value;
}
export function toPaise(value, allowZero = false) {
  // Converts a valid decimal amount to whole paise.
  if (
    !["string", "number"].includes(typeof value) ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    throw httpError(
      400,
      "Amount must be a number with at most two decimal places.",
    );
  const text = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(text))
    throw httpError(
      400,
      "Use a positive amount with at most two decimal places, without commas.",
    );
  const [rupees, decimals = ""] = text.split(".");
  const amount = Number(rupees) * 100 + Number(decimals.padEnd(2, "0"));
  if (amount < (allowZero ? 0 : 1) || amount > MAX_AMOUNT_PAISE)
    throw httpError(
      400,
      "Amount must be within INR 1,00,00,000; expenses must be greater than zero.",
    );
  return amount;
}
function objectFields(body, allowed) {
  // Rejects unsupported fields and invalid object input.
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        // Checks which items match the condition.
        !allowed.includes(key),
    )
  )
    throw httpError(400, "Send only the supported fields as a JSON object.");
}
export function validateExpense(body, partial = false) {
  // Validates editable expense fields.
  objectFields(body, ["amount", "category", "date", "note", "paymentMethod"]);
  if (!Object.keys(body).length) throw httpError(400, "Enter expense details.");
  const values = {};
  if (!partial || body.amount !== undefined)
    values.amountPaise = toPaise(body.amount);
  if (!partial || body.category !== undefined) {
    if (!EXPENSE_CATEGORIES.includes(body.category))
      throw httpError(400, "Choose a supported expense category.");
    values.category = body.category;
  }
  if (!partial || body.date !== undefined)
    values.date = validateExpenseDate(body.date);
  if (body.note !== undefined) {
    if (typeof body.note !== "string")
      throw httpError(400, "Note must be text.");
    values.note = body.note.replace(/\r\n?/g, "\n").trim();
    if (
      values.note.length > 300 ||
      values.note.split("\n").length > 8 ||
      /[\x00-\x08\x0b-\x1f\x7f]/.test(values.note)
    )
      throw httpError(
        400,
        "Use a note of at most 300 characters and eight lines, without control characters.",
      );
  }
  if (body.paymentMethod !== undefined) {
    if (!PAYMENT_METHODS.includes(body.paymentMethod))
      throw httpError(400, "Choose a supported payment method.");
    values.paymentMethod = body.paymentMethod;
  }
  return values;
}
export function validateBudget(body) {
  // Validates overall and category budget limits.
  objectFields(body, ["month", "overall", "categories"]);
  const month = validateMonth(body.month);
  if (
    body.overall === undefined ||
    !Array.isArray(body.categories) ||
    body.categories.length > EXPENSE_CATEGORIES.length
  )
    throw httpError(
      400,
      "Provide overall (amount or null) and a list of category budgets.",
    );
  const seen = new Set();
  const categories = body.categories
    .map((row) => {
      // Builds a value for each item.
      objectFields(row, ["category", "amount"]);
      if (!EXPENSE_CATEGORIES.includes(row.category) || seen.has(row.category))
        throw httpError(400, "Choose each supported category at most once.");
      seen.add(row.category);
      return {
        category: row.category,
        limitPaise: toPaise(row.amount, true),
      };
    })
    .sort((a, b) =>
      // Compares items for display order.
      a.category.localeCompare(b.category),
    );
  return {
    month,
    overallPaise: body.overall === null ? null : toPaise(body.overall, true),
    categories,
  };
}
