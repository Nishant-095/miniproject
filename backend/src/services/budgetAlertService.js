import { randomUUID } from "node:crypto";
import cron from "node-cron";
import Budget from "../models/Budget.js";
import BudgetAlert from "../models/BudgetAlert.js";
import User from "../models/User.js";
import { monthTotals, assessBudgets } from "./expenseService.js";
import { emailConfigured, sendEmail } from "./emailService.js";
export async function enqueueBudgetAlerts(userId, month, now = new Date()) {
  // Queues current budget warnings without duplicates.
  const budget = await Budget.findOne({
    user: userId,
    month,
  });
  if (!budget) return;
  const totals = await monthTotals(userId, month);
  const active = assessBudgets(
    totals.totalPaise,
    totals.categories,
    budget,
  ).filter(
    (row) =>
      // Checks which items match the condition.
      row.level,
  );
  const keys = active.map((row) =>
    // Builds a value for each item.
    ({
      revision: budget.revision,
      scope: row.scope,
      level: row.level,
    }),
  );
  // Retire queued alerts made irrelevant by corrections, removals, or a new budget.
  await BudgetAlert.updateMany(
    {
      budget: budget._id,
      emailStatus: {
        $in: ["pending", "sending"],
      },
      ...(keys.length
        ? {
            $nor: keys,
          }
        : {}),
    },
    {
      $set: {
        emailStatus: "cancelled",
        emailClaimToken: "",
        emailLockUntil: null,
      },
    },
  );
  for (const alert of active) {
    const identity = {
      budget: budget._id,
      revision: budget.revision,
      scope: alert.scope,
      level: alert.level,
    };
    try {
      await BudgetAlert.updateOne(
        identity,
        {
          $setOnInsert: {
            user: userId,
            month,
            spentPaise: alert.spentPaise,
            limitPaise: alert.limitPaise,
            nextAttemptAt: now,
          },
        },
        {
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    // A cancelled unsent alert may become relevant again. A sent one stays sent.
    await BudgetAlert.updateOne(
      {
        ...identity,
        emailStatus: "cancelled",
      },
      {
        $set: {
          emailStatus: "pending",
          nextAttemptAt: now,
        },
      },
    );
    await BudgetAlert.updateOne(
      {
        ...identity,
        emailStatus: "pending",
      },
      {
        $set: {
          spentPaise: alert.spentPaise,
          limitPaise: alert.limitPaise,
        },
      },
    );
  }
}
let delivering = false;
const money = (paise) =>
  // Formats stored paise as Indian rupees.
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
export async function deliverBudgetEmails({
  now = new Date(),
  send = sendEmail,
  configured = emailConfigured(),
  limit = 20,
} = {}) {
  // Sends eligible budget alert emails with retries.
  if (!configured || delivering) return 0;
  delivering = true;
  let delivered = 0;
  const currentTime = () =>
    // Reads the current time for a worker lease.
    new Date(Math.max(now.getTime(), Date.now()));
  try {
    for (let index = 0; index < limit; index += 1) {
      const token = randomUUID();
      const claimTime = currentTime();
      const alert = await BudgetAlert.findOneAndUpdate(
        {
          $or: [
            {
              emailStatus: "pending",
              nextAttemptAt: {
                $lte: claimTime,
              },
            },
            {
              emailStatus: "sending",
              emailLockUntil: {
                $lte: claimTime,
              },
            },
          ],
        },
        {
          $set: {
            emailStatus: "sending",
            emailClaimToken: token,
            emailLockUntil: new Date(claimTime.getTime() + 300000),
          },
          $inc: {
            emailAttempts: 1,
          },
        },
        {
          new: true,
          sort: {
            nextAttemptAt: 1,
          },
        },
      );
      if (!alert) break;
      const claim = {
        _id: alert._id,
        emailStatus: "sending",
        emailClaimToken: token,
      };
      try {
        const budget = await Budget.findById(alert.budget);
        const user = budget && (await User.findById(alert.user));
        const totals = budget && (await monthTotals(alert.user, alert.month));
        const current =
          budget &&
          assessBudgets(totals.totalPaise, totals.categories, budget).find(
            (row) =>
              // Checks which items match the condition.
              row.scope === alert.scope && row.level === alert.level,
          );
        if (!user || budget.revision !== alert.revision || !current) {
          await BudgetAlert.updateOne(claim, {
            $set: {
              emailStatus: "cancelled",
              emailClaimToken: "",
              emailLockUntil: null,
            },
          });
          continue;
        }
        const label =
          alert.scope === "overall" ? "overall monthly" : alert.scope;
        const message =
          alert.level === "exceeded"
            ? `Your ${label} budget has been exceeded by ${money(current.spentPaise - current.limitPaise)}.`
            : `You have used at least 80% of your ${label} budget.`;
        const sent = await send({
          to: user.email,
          subject: `UtilityHub budget ${alert.level}: ${alert.scope} (${alert.month})`,
          text: `Hi ${user.name},\n\n${message}\nMonth: ${alert.month}\nSpent: ${money(current.spentPaise)}\nBudget: ${money(current.limitPaise)}\n\nOpen UtilityHub to review your expenses.`,
        });
        if (!sent) throw new Error("Email not configured.");
        await BudgetAlert.updateOne(claim, {
          $set: {
            emailStatus: "sent",
            sentAt: currentTime(),
            spentPaise: current.spentPaise,
            limitPaise: current.limitPaise,
            lastError: "",
            emailClaimToken: "",
            emailLockUntil: null,
          },
        });
        delivered += 1;
      } catch (error) {
        const delay =
          Math.min(60, 2 ** Math.min(alert.emailAttempts - 1, 6)) * 60000;
        await BudgetAlert.updateOne(claim, {
          $set: {
            emailStatus: "pending",
            nextAttemptAt: new Date(currentTime().getTime() + delay),
            lastError:
              "Email delivery failed. Check SMTP settings and recipient.",
            emailClaimToken: "",
            emailLockUntil: null,
          },
        });
        console.warn(
          `Budget email deferred (${error.code || "delivery error"}).`,
        );
      }
    }
  } finally {
    delivering = false;
  }
  return delivered;
}
export function startBudgetAlertScheduler() {
  // Schedules budget checks and pending email delivery.
  if (process.env.BUDGET_ALERTS_ENABLED === "false")
    return () => {
      // Runs the returned operation when called.
    };
  const report = () =>
    // Reports a scheduled budget-check failure.
    console.error("Budget alert check failed. It will retry next minute.");
  const run = async () => {
    // Runs one budget check without overlapping work.
    try {
      // A cursor scans all plans without silently ignoring older months or later users.
      for await (const budget of Budget.find().select("user month").cursor())
        await enqueueBudgetAlerts(budget.user, budget.month);
      void deliverBudgetEmails().catch(report);
    } catch {
      report();
    }
  };
  const job = cron.schedule("* * * * *", run, {
    timezone: "UTC",
    noOverlap: true,
  });
  void run();
  console.log(
    `Budget alerts enabled. Email ${emailConfigured() ? "configured" : "not configured"}.`,
  );
  return () => {
    // Stops the scheduled background check.
    job.stop();
    job.destroy();
  };
}
