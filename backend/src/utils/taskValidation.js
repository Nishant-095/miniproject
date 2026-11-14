import mongoose from "mongoose";
import { httpError } from "./httpError.js";
export function checkId(id) {
  // Validates a MongoDB record ID.
  if (!mongoose.isObjectIdOrHexString(id)) throw httpError(400, "Invalid ID.");
}
export function parseDate(value, label = "Due date") {
  // Validates an ISO date with a timezone.
  // Require a timezone, so the server never guesses the user's local time.
  const match =
    typeof value === "string" &&
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    );
  const date = match && new Date(value);
  const days =
    match &&
    new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  if (
    !date ||
    !Number.isFinite(date.getTime()) ||
    Number(match[2]) < 1 ||
    Number(match[2]) > 12 ||
    Number(match[3]) < 1 ||
    Number(match[3]) > days
  ) {
    throw httpError(
      400,
      `${label} must be a valid ISO date and time with a timezone.`,
    );
  }
  return date;
}
export function validateTask(body, partial = false) {
  // Validates editable task fields and deadlines.
  const fields = [
    "title",
    "description",
    "priority",
    "category",
    "dueAt",
    "completed",
    "timeZone",
  ];
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        // Checks which items match the condition.
        !fields.includes(key),
    )
  ) {
    throw httpError(
      400,
      "Send only the supported task fields as a JSON object.",
    );
  }
  if (partial && Object.keys(body).length === 0)
    throw httpError(400, "Send at least one task field.");
  const values = {};
  for (const [key, max] of [
    ["title", 120],
    ["description", 2000],
    ["category", 40],
  ]) {
    if (body[key] === undefined && (partial || key !== "title")) continue;
    if (typeof body[key] !== "string" || body[key].trim().length > max) {
      throw httpError(
        400,
        `${key} must be text of ${max} characters or fewer.`,
      );
    }
    values[key] = body[key].trim();
    if (
      key === "title" &&
      (!values.title || /[\x00-\x1f\x7f]/.test(values.title))
    ) {
      throw httpError(400, "Enter a title on one line (1–120 characters).");
    }
    if (key === "category" && !values.category) values.category = "General";
  }
  if (body.priority !== undefined) {
    if (!["low", "medium", "high"].includes(body.priority))
      throw httpError(400, "Choose low, medium, or high priority.");
    values.priority = body.priority;
  }
  if (body.completed !== undefined) {
    if (typeof body.completed !== "boolean")
      throw httpError(400, "Completed must be true or false.");
    values.completed = body.completed;
  }
  if (body.dueAt !== undefined)
    values.dueAt = body.dueAt === null ? null : parseDate(body.dueAt);
  if (body.timeZone !== undefined) {
    if (typeof body.timeZone !== "string" || body.timeZone.length > 100)
      throw httpError(400, "Invalid timezone.");
    try {
      new Intl.DateTimeFormat("en", {
        timeZone: body.timeZone,
      }).format();
    } catch {
      throw httpError(400, "Choose a valid IANA timezone.");
    }
    values.timeZone = body.timeZone;
  }
  return values;
}
export function positiveInteger(value, fallback, max = 1000000) {
  // Checks a bounded positive integer.
  if (value === undefined) return fallback;
  const valid =
    typeof value === "number"
      ? Number.isSafeInteger(value)
      : typeof value === "string" && /^\d+$/.test(value);
  if (!valid || Number(value) < 1 || Number(value) > max) {
    throw httpError(400, `Enter a whole number from 1 to ${max}.`);
  }
  return Number(value);
}
