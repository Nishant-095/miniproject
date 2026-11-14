export function toLocalDateTimeInput(value) {
  // Formats a deadline for a local datetime input.
  if (!value) return "";
  const date = new Date(value);
  const pad = (number) =>
    // Pads a date part to two digits.
    String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function dueInputToIso(value, original = null) {
  // Validates a local deadline and converts it to UTC.
  if (!value) return null;
  // Preserve the exact instant when an existing minute was not edited (including DST).
  if (original && toLocalDateTimeInput(original) === value) return original;
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    toLocalDateTimeInput(date) !== value
  ) {
    throw new Error(
      "Enter a valid local date and time. This time may not exist during a clock change.",
    );
  }
  return date.toISOString();
}
export function todayBounds(now = new Date()) {
  // Returns UTC boundaries for today's local date.
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
export function formatTaskDate(value) {
  // Formats a deadline for the user's timezone.
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "No deadline";
}
export function isOverdue(task, now = Date.now()) {
  // Checks whether an unfinished task is past due.
  return (
    !task.completed &&
    Boolean(task.dueAt) &&
    new Date(task.dueAt).getTime() < now
  );
}
