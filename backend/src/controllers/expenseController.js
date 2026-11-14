import rateLimit from "express-rate-limit";
import Expense from "../models/Expense.js";
import Budget from "../models/Budget.js";
import BudgetAlert from "../models/BudgetAlert.js";
import Activity from "../models/Activity.js";
import { MAX_EXPORT_ROWS } from "../config/expenseConfig.js";
import {
  validateMonth,
  monthFilter,
  validateExpense,
  validateBudget,
} from "../utils/expenseValidation.js";
import { checkId, positiveInteger } from "../utils/taskValidation.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import {
  publicExpense,
  publicBudget,
  expenseSummary,
} from "../services/expenseService.js";
import { enqueueBudgetAlerts } from "../services/budgetAlertService.js";
import { emailConfigured } from "../services/emailService.js";
import { expensesCsv, expensesPdf } from "../services/expenseExportService.js";
export const exportLimiter = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Please wait a minute before exporting again.",
  },
});
const queue = (userId, month) =>
  // Queues budget alerts for the changed month.
  enqueueBudgetAlerts(userId, month).catch(() =>
    // Handles a failed operation.
    console.error("Budget alert will be retried by the scheduler."),
  );
async function logExpense(expense, action) {
  // Records an expense change in account activity.
  try {
    await Activity.create({
      user: expense.user,
      action,
      title: `${expense.category}: INR ${(expense.amountPaise / 100).toFixed(2)}`,
    });
  } catch {
    console.error("Could not save expense activity.");
  }
}
async function ownedExpense(req) {
  // Finds an expense belonging to this account.
  checkId(req.body.id);
  const expense = await Expense.findOne({
    _id: req.body.id,
    user: req.user._id,
  });
  if (!expense) throw httpError(404, "Expense not found.");
  return expense;
}
export const listExpenses = asyncHandler(async (req, res) => {
  // Lists this account's monthly expenses.
  const month = validateMonth(req.body.month);
  const page = positiveInteger(req.body.page, 1);
  const limit = positiveInteger(req.body.limit, 20, 100);
  const filter = {
    user: req.user._id,
    date: monthFilter(month),
  };
  const [expenses, total] = await Promise.all([
    Expense.find(filter)
      .sort({
        date: -1,
        createdAt: -1,
        _id: -1,
      })
      .skip((page - 1) * limit)
      .limit(limit),
    Expense.countDocuments(filter),
  ]);
  res.json({
    month,
    expenses: expenses.map(publicExpense),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});
export const getExpense = asyncHandler(async (req, res) =>
  // Returns one owned expense.
  res.json({
    expense: publicExpense(await ownedExpense(req)),
  }),
);
export const getSummary = asyncHandler(async (req, res) => {
  // Returns monthly totals, charts, and budget alerts.
  const month = validateMonth(req.body.month);
  const summary = await expenseSummary(req.user._id, month);
  const budget = await Budget.findOne({
    user: req.user._id,
    month,
  });
  const deliveries = budget
    ? await BudgetAlert.find({
        budget: budget._id,
        revision: budget.revision,
      }).select("scope level emailStatus")
    : [];
  summary.alerts = summary.alerts.map((row) =>
    // Builds a value for each item.
    ({
      ...row,
      emailStatus:
        deliveries.find(
          (item) =>
            // Checks which items match the condition.
            item.scope === row.scope && item.level === row.level,
        )?.emailStatus || "pending",
    }),
  );
  res.json({
    ...summary,
    emailConfigured: emailConfigured(),
    schedulerEnabled: process.env.BUDGET_ALERTS_ENABLED !== "false",
  });
});
export const createExpense = asyncHandler(async (req, res) => {
  // Validates and saves a new expense.
  const { offlineId, ...body } = req.body;
  if (offlineId) {
    checkId(offlineId);
    const existing = await Expense.findOne({ _id: offlineId, user: req.user._id });
    if (existing) return res.json({ expense: publicExpense(existing) });
  }
  const expense = await Expense.create({
    ...validateExpense(body),
    ...(offlineId ? { _id: offlineId } : {}),
    user: req.user._id,
  });
  await logExpense(expense, "expense_created");
  await queue(req.user._id, expense.date.slice(0, 7));
  res.status(201).json({
    expense: publicExpense(expense),
  });
});
export const updateExpense = asyncHandler(async (req, res) => {
  // Updates an owned expense and rechecks budgets.
  const { id, ...fields } = req.body;
  const values = validateExpense(fields, true);
  const original = await ownedExpense(req);
  const expense = await Expense.findOneAndUpdate(
    {
      _id: original._id,
      user: req.user._id,
    },
    {
      $set: values,
    },
    {
      new: true,
      runValidators: true,
    },
  );
  if (!expense) throw httpError(404, "Expense not found.");
  await logExpense(expense, "expense_updated");
  for (const month of new Set([
    original.date.slice(0, 7),
    expense.date.slice(0, 7),
  ]))
    await queue(req.user._id, month);
  res.json({
    expense: publicExpense(expense),
  });
});
export const deleteExpense = asyncHandler(async (req, res) => {
  // Deletes an owned expense and rechecks budgets.
  const expense = await ownedExpense(req);
  await Expense.deleteOne({
    _id: expense._id,
    user: req.user._id,
  });
  await logExpense(expense, "expense_deleted");
  await queue(req.user._id, expense.date.slice(0, 7));
  res.json({
    message: "Expense deleted.",
  });
});
export const getBudget = asyncHandler(async (req, res) => {
  // Returns the selected month's budget.
  const month = validateMonth(req.body.month);
  res.json({
    budget: publicBudget(
      await Budget.findOne({
        user: req.user._id,
        month,
      }),
      month,
    ),
  });
});
export const setBudget = asyncHandler(async (req, res) => {
  // Validates and saves monthly budget limits.
  const values = validateBudget(req.body);
  let budget = await Budget.findOne({
    user: req.user._id,
    month: values.month,
  });
  const before = budget && JSON.stringify(publicBudget(budget, values.month));
  const next = JSON.stringify(values);
  if (!budget)
    budget = new Budget({
      ...values,
      user: req.user._id,
    });
  else if (before !== next) {
    budget.set(values);
    budget.revision += 1;
  }
  try {
    await budget.save();
  } catch (error) {
    if (error.code === 11000 || error.name === "VersionError")
      throw httpError(
        409,
        "This budget changed in another window. Reload it and try again.",
      );
    throw error;
  }
  await queue(req.user._id, values.month);
  res.json({
    budget: publicBudget(budget, values.month),
  });
});
export const exportExpenses = asyncHandler(async (req, res) => {
  // Creates a CSV or PDF expense report.
  const month = validateMonth(req.body.month);
  const format = req.body.format || "csv";
  if (!["csv", "pdf"].includes(format))
    throw httpError(400, "Choose csv or pdf export.");
  const expenses = await Expense.find({
    user: req.user._id,
    date: monthFilter(month),
  })
    .sort({
      date: 1,
      _id: 1,
    })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  if (expenses.length > MAX_EXPORT_ROWS)
    throw httpError(
      413,
      `Exports support at most ${MAX_EXPORT_ROWS} expenses per month.`,
    );
  let content;
  if (format === "csv") content = expensesCsv(expenses);
  else {
    const summary = await expenseSummary(req.user._id, month);
    // The report total always matches the exact rows being exported.
    summary.totalPaise = expenses.reduce(
      (sum, row) =>
        // Combines the items into one value.
        sum + row.amountPaise,
      0,
    );
    summary.remainingPaise =
      summary.budget.overallPaise === null
        ? null
        : summary.budget.overallPaise - summary.totalPaise;
    content = await expensesPdf(expenses, req.user, summary);
  }
  res.set({
    "Content-Type":
      format === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
    "Content-Disposition": `attachment; filename="utilityhub-expenses-${month}.${format}"`,
    "Cache-Control": "no-store",
  });
  res.send(content);
});
