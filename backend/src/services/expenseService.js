import Expense from "../models/Expense.js";
import Budget from "../models/Budget.js";
import {
  monthFilter,
  shiftMonth,
  validateMonth,
} from "../utils/expenseValidation.js";
export function publicBudget(budget, month) {
  // Formats budget limits without internal fields.
  return {
    month,
    overallPaise: budget?.overallPaise ?? null,
    categories:
      budget?.categories?.map((row) =>
        // Builds a value for each item.
        ({
          category: row.category,
          limitPaise: row.limitPaise,
        }),
      ) || [],
  };
}
export function publicExpense(expense) {
  // Formats an expense without internal fields.
  const data = expense.toObject
    ? expense.toObject()
    : {
        ...expense,
      };
  delete data.__v;
  data.amount = (data.amountPaise / 100).toFixed(2);
  return data;
}
export function budgetLevel(spent, limit) {
  // Determines normal, warning, or exceeded spending.
  if (limit === null || limit === undefined) return null;
  if (spent > limit) return "exceeded";
  if (limit > 0 && spent * 5 >= limit * 4) return "warning";
  return null;
}
export function assessBudgets(totalPaise, categories, budget) {
  // Calculates overall and category budget progress.
  const limits = [];
  if (budget?.overallPaise !== null && budget?.overallPaise !== undefined)
    limits.push({
      scope: "overall",
      spentPaise: totalPaise,
      limitPaise: budget.overallPaise,
    });
  for (const row of budget?.categories || [])
    limits.push({
      scope: row.category,
      spentPaise:
        categories.find(
          (group) =>
            // Checks which items match the condition.
            group.category === row.category,
        )?.totalPaise || 0,
      limitPaise: row.limitPaise,
    });
  return limits.map((row) =>
    // Builds a value for each item.
    ({
      ...row,
      level: budgetLevel(row.spentPaise, row.limitPaise),
      percent:
        row.limitPaise > 0 ? (row.spentPaise / row.limitPaise) * 100 : null,
    }),
  );
}
export async function monthTotals(userId, month) {
  // Adds up every expense in the selected month.
  const groups = await Expense.aggregate([
    {
      $match: {
        user: userId,
        date: monthFilter(month),
      },
    },
    {
      $group: {
        _id: "$category",
        totalPaise: {
          $sum: "$amountPaise",
        },
        count: {
          $sum: 1,
        },
      },
    },
    {
      $sort: {
        totalPaise: -1,
        _id: 1,
      },
    },
  ]);
  const categories = groups.map((row) =>
    // Builds a value for each item.
    ({
      category: row._id,
      totalPaise: row.totalPaise,
      count: row.count,
    }),
  );
  return {
    totalPaise: categories.reduce(
      (sum, row) =>
        // Combines the items into one value.
        sum + row.totalPaise,
      0,
    ),
    count: categories.reduce(
      (sum, row) =>
        // Combines the items into one value.
        sum + row.count,
      0,
    ),
    categories,
  };
}
export async function expenseSummary(userId, month) {
  // Builds monthly totals, charts, and budget progress.
  validateMonth(month);
  const firstMonth = shiftMonth(month, -11);
  const [totals, budget, days, months] = await Promise.all([
    monthTotals(userId, month),
    Budget.findOne({
      user: userId,
      month,
    }),
    Expense.aggregate([
      {
        $match: {
          user: userId,
          date: monthFilter(month),
        },
      },
      {
        $group: {
          _id: "$date",
          totalPaise: {
            $sum: "$amountPaise",
          },
        },
      },
    ]),
    Expense.aggregate([
      {
        $match: {
          user: userId,
          date: {
            $gte: `${firstMonth}-01`,
            $lt: `${shiftMonth(month, 1)}-01`,
          },
        },
      },
      {
        $group: {
          _id: {
            $substrBytes: ["$date", 0, 7],
          },
          totalPaise: {
            $sum: "$amountPaise",
          },
        },
      },
    ]),
  ]);
  const [year, number] = month.split("-").map(Number);
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const daily = Array.from(
    {
      length,
    },
    (_, index) => {
      // Includes every day in the monthly chart.
      const date = `${month}-${String(index + 1).padStart(2, "0")}`;
      return {
        date,
        day: index + 1,
        totalPaise:
          days.find(
            (row) =>
              // Checks which items match the condition.
              row._id === date,
          )?.totalPaise || 0,
      };
    },
  );
  const monthly = Array.from(
    {
      length: 12,
    },
    (_, index) => {
      // Includes every month in the annual chart.
      const item = shiftMonth(firstMonth, index);
      return {
        month: item,
        totalPaise:
          months.find(
            (row) =>
              // Checks which items match the condition.
              row._id === item,
          )?.totalPaise || 0,
      };
    },
  );
  const progress = assessBudgets(totals.totalPaise, totals.categories, budget);
  return {
    month,
    ...totals,
    budget: publicBudget(budget, month),
    remainingPaise:
      budget?.overallPaise === null || !budget
        ? null
        : budget.overallPaise - totals.totalPaise,
    daily,
    monthly,
    progress,
    alerts: progress.filter(
      (row) =>
        // Checks which items match the condition.
        row.level,
    ),
  };
}
