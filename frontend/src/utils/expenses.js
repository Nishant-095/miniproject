export const categories = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Education",
  "Health",
  "Entertainment",
  "Other",
];
export const paymentMethods = [
  ["upi", "UPI"],
  ["cash", "Cash"],
  ["card", "Card"],
  ["bank transfer", "Bank transfer"],
  ["other", "Other"],
];
export const categoryColors = {
  Food: "#148f80",
  Transport: "#6ba5c3",
  Shopping: "#ce937c",
  Bills: "#c8aa66",
  Education: "#88b89c",
  Health: "#c88883",
  Entertainment: "#7c9aab",
  Other: "#9eafa7",
};

// Weeks are consecutive seven-day groups within the selected month.
export function weeklySpending(daily) {
  const weeks = [];
  for (const row of daily) {
    const index = Math.floor((row.day - 1) / 7);
    if (!weeks[index]) weeks[index] = { label: `Wk ${index + 1}`, totalPaise: 0 };
    weeks[index].totalPaise += row.totalPaise;
  }
  return weeks;
}
export const money = (paise) =>
  // Formats stored paise as Indian rupees.
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(paise / 100);
export const amountInput = (paise) =>
  // Formats paise for a decimal amount input.
  paise === null || paise === undefined ? "" : (paise / 100).toFixed(2);
export function localToday(now = new Date()) {
  // Returns today's local calendar date.
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export const currentMonth = () =>
  // Returns the current local month.
  localToday().slice(0, 7);
export function monthName(month) {
  // Formats a stored month for display.
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}
export function expenseDate(date) {
  // Formats an expense date without changing its day.
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function isValidAmount(value, allowZero = false) {
  // Checks the allowed decimal amount format.
  return (
    /^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value.trim()) &&
    Number(value) <= 10000000 &&
    (allowZero ? Number(value) >= 0 : Number(value) > 0)
  );
}
export function budgetPercent(spent, limit) {
  // Calculates progress toward a budget limit.
  if (limit === 0) return spent ? 100 : 0;
  return limit ? Math.min(100, (spent / limit) * 100) : 0;
}
export async function exportError(error) {
  // Returns a readable expense export error.
  return (
    error.message ||
    "Could not export expenses. Check your connection and try again."
  );
}
