import { actionRequest } from "./helpers/actionRequest.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import app from "../app.js";
import User from "../models/User.js";
import Expense from "../models/Expense.js";
import Budget from "../models/Budget.js";
import BudgetAlert from "../models/BudgetAlert.js";
import Activity from "../models/Activity.js";
import { csvCell } from "../services/expenseExportService.js";
import {
  enqueueBudgetAlerts,
  deliverBudgetEmails,
  startBudgetAlertScheduler,
} from "../services/budgetAlertService.js";
import { exportLimiter } from "../controllers/expenseController.js";
const dbName = `utilityhub_expenses_test_${randomUUID().replaceAll("-", "")}`;
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.CLIENT_URL = "http://localhost:5173";
process.env.REMINDERS_ENABLED = "false";
process.env.BUDGET_ALERTS_ENABLED = "false";
process.env.EMAIL_USER = "";
process.env.EMAIL_PASS = "";
process.env.EMAIL_FROM = "";
process.env.SMTP_HOST = "";
let server, base, user, other, token, otherToken, smtp;
const received = [];
const month = "2026-10";
async function request(action, { body, as = token, binary = false } = {}) {
  const response = await actionRequest(base, action, {
    body,
    headers: as ? { Authorization: `Bearer ${as}` } : {},
  });
  return {
    status: response.status,
    headers: response.headers,
    data: binary
      ? Buffer.from(await response.arrayBuffer())
      : await response.json(),
  };
}

async function expense(body = {}, as = token) {
  const result = await request("createExpense", {
    as,
    body: {
      amount: "10.00",
      category: "Food",
      date: `${month}-25`,
      note: "",
      paymentMethod: "upi",
      ...body,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.expense;
}
async function budget(overall = "100.00", categories = [], planMonth = month) {
  const result = await request("saveBudget", {
    body: {
      month: planMonth,
      overall,
      categories,
    },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.budget;
}
async function reset() {
  await Promise.all([
    Expense.deleteMany({}),
    Budget.deleteMany({}),
    BudgetAlert.deleteMany({}),
  ]);
}
const summary = async (value = month, as = token) =>
  (
    await request(
      {
        action: "expenseSummary",
        fields: {
          month: value,
        },
      },
      {
        as,
      },
    )
  ).data;
before(async () => {
  await mongoose.connect(
    process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017",
    {
      dbName,
      serverSelectionTimeoutMS: 5000,
    },
  );
  await Promise.all([
    User.init(),
    Expense.init(),
    Budget.init(),
    BudgetAlert.init(),
    Activity.init(),
  ]);
  [user, other] = await User.create([
    {
      name: "José Student",
      email: "student@example.test",
      password: "CollegeDemo#2026",
    },
    {
      name: "Other Student",
      email: "other@example.test",
      password: "CollegeDemo#2026",
    },
  ]);
  token = jwt.sign({}, process.env.JWT_SECRET, {
    subject: user.id,
  });
  otherToken = jwt.sign({}, process.env.JWT_SECRET, {
    subject: other.id,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/server`;
});
after(async () => {
  if (smtp) await new Promise((resolve) => smtp.close(resolve));
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});
test("Phase 4 expenses, budgets, exports, and email outbox", async (t) => {
  await t.test(
    "all expense, budget, report, and activity routes require login",
    async () => {
      for (const path of [
        {
          action: "listExpenses",
          fields: {
            month: "2026-10",
          },
        },
        {
          action: "expenseSummary",
          fields: {
            month: "2026-10",
          },
        },
        {
          action: "getBudget",
          fields: {
            month: "2026-10",
          },
        },
        {
          action: "exportExpenses",
          fields: {
            month: "2026-10",
          },
        },
        "recentActivity",
      ])
        assert.equal(
          (
            await request(path, {
              as: null,
            })
          ).status,
          401,
        );
    },
  );
  await t.test(
    "money uses exact integer paise instead of accumulating floating point errors",
    async () => {
      const first = await expense({
        amount: 0.1,
      });
      await expense({
        amount: "0.20",
      });
      assert.equal(first.amount, "0.10");
      assert.equal(first.amountPaise, 10);
      assert.equal((await summary()).totalPaise, 30);
      assert.equal((await Expense.findById(first._id)).amountPaise, 10);
      assert.equal(
        (
          await request({
            action: "getExpense",
            fields: {
              id: first._id,
            },
          })
        ).headers.get("cache-control"),
        "no-store",
      );
    },
  );
  await t.test(
    "invalid fields, precision, dates, categories, and note controls are rejected",
    async () => {
      const valid = {
        amount: "10",
        category: "Food",
        date: `${month}-25`,
      };
      for (const body of [
        null,
        [],
        {},
        {
          ...valid,
          amount: {},
        },
        {
          ...valid,
          amount: true,
        },
        {
          ...valid,
          amount: "-1",
        },
        {
          ...valid,
          amount: "0",
        },
        {
          ...valid,
          amount: "0.001",
        },
        {
          ...valid,
          amount: "1e3",
        },
        {
          ...valid,
          amount: "1,000",
        },
        {
          ...valid,
          amount: "10000000.01",
        },
        {
          ...valid,
          amountPaise: 1,
        },
        {
          ...valid,
          user: other.id,
        },
        {
          ...valid,
          category: "Wrong",
        },
        {
          ...valid,
          date: "2026-02-29",
        },
        {
          ...valid,
          date: "2026-10-25T00:00:00Z",
        },
        {
          ...valid,
          date: "2026-13-01",
        },
        {
          ...valid,
          paymentMethod: [],
        },
        {
          ...valid,
          note: {},
        },
        {
          ...valid,
          note: "x".repeat(301),
        },
        {
          ...valid,
          note: "x\n".repeat(9),
        },
        {
          ...valid,
          note: "bad\u0000text",
        },
      ])
        assert.equal(
          (
            await request("createExpense", {
              body,
            })
          ).status,
          400,
          JSON.stringify(body),
        );
      for (const value of [
        "2026-00",
        "2026-13",
        "1999-12",
        "2026-1",
        "2026-10-01",
      ])
        assert.equal(
          (
            await request({
              action: "listExpenses",
              fields: {
                month: value,
              },
            })
          ).status,
          400,
        );
      assert.equal(
        (
          await request({
            action: "listExpenses",
            fields: {
              month: {
                x: "2026-10",
              },
            },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request({
            action: "listExpenses",
            fields: {
              month: "2026-10",
              page: "0",
            },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "expenses, budgets, totals, and recent activity are private to their owner",
    async () => {
      const item = await expense({
        note: "Private own record",
      });
      for (const action of ["getExpense", "updateExpense", "deleteExpense"])
        assert.equal(
          (
            await request(action, {
              body: {
                id: item._id,
                ...(action.startsWith("update")
                  ? {
                      amount: "20",
                    }
                  : {}),
              },
              as: otherToken,
            })
          ).status,
          404,
        );
      assert.equal((await summary(month, otherToken)).totalPaise, 0);
      assert.equal(
        (
          await request(
            {
              action: "listExpenses",
              fields: {
                month: month,
              },
            },
            {
              as: otherToken,
            },
          )
        ).data.expenses.length,
        0,
      );
      assert.equal(
        (
          await request("recentActivity", {
            as: otherToken,
          })
        ).data.activities.length,
        0,
      );
      assert.equal(
        (
          await request({
            action: "getExpense",
            fields: {
              id: "invalid-id",
            },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "calendar month boundaries, leap dates, and zero-filled charts are correct",
    async () => {
      await reset();
      for (const date of [
        "2026-09-30",
        "2026-10-01",
        "2026-10-31",
        "2026-11-01",
        "2024-02-29",
      ])
        await expense({
          date,
          amount: "0.01",
        });
      const data = await summary();
      assert.equal(data.totalPaise, 2);
      assert.equal(data.count, 2);
      assert.equal(data.daily.length, 31);
      assert.equal(data.daily[0].totalPaise, 1);
      assert.equal(data.daily[30].totalPaise, 1);
      assert.equal(data.daily[1].totalPaise, 0);
      assert.equal(data.monthly.length, 12);
      assert.equal(data.monthly[0].month, "2025-11");
      assert.equal(data.monthly.at(-1).totalPaise, 2);
      assert.equal((await summary("2024-02")).daily.length, 29);
    },
  );
  await t.test(
    "partial edits, all fields, and moving an expense between months update totals",
    async () => {
      await reset();
      const item = await expense();
      const result = await request(
        {
          action: "updateExpense",
          fields: {
            id: item._id,
          },
        },
        {
          body: {
            amount: "25.55",
            category: "Education",
            date: "2026-09-30",
            paymentMethod: "cash",
            note: "Books\r\nSecond line",
          },
        },
      );
      assert.equal(result.status, 200);
      assert.equal(result.data.expense.amountPaise, 2555);
      assert.equal(result.data.expense.note, "Books\nSecond line");
      assert.equal((await summary()).totalPaise, 0);
      assert.equal((await summary("2026-09")).totalPaise, 2555);
      await request(
        {
          action: "updateExpense",
          fields: {
            id: item._id,
          },
        },
        {
          body: {
            amount: "30.10",
          },
        },
      );
      assert.equal((await summary("2026-09")).totalPaise, 3010);
      assert.equal(
        (
          await request(
            {
              action: "updateExpense",
              fields: {
                id: item._id,
              },
            },
            {
              body: {},
            },
          )
        ).status,
        400,
      );
    },
  );
  await t.test("pagination never limits whole-month chart totals", async () => {
    await reset();
    await Expense.insertMany(
      Array.from(
        {
          length: 21,
        },
        (_, index) => ({
          user: user._id,
          amountPaise: 1,
          category: "Food",
          date: `2026-10-${String(index + 1).padStart(2, "0")}`,
        }),
      ),
    );
    const rows = (
      await request({
        action: "listExpenses",
        fields: {
          month: month,
          page: "2",
          limit: "20",
        },
      })
    ).data;
    assert.equal(rows.expenses.length, 1);
    assert.equal(rows.pagination.total, 21);
    assert.equal(rows.pagination.pages, 2);
    assert.equal((await summary()).totalPaise, 21);
  });
  await t.test(
    "budgets validate supported unique categories, exact amounts, and optional limits",
    async () => {
      await reset();
      const valid = {
        month,
        overall: null,
        categories: [],
      };
      for (const body of [
        {
          ...valid,
          overall: "-1",
        },
        {
          ...valid,
          overall: true,
        },
        {
          ...valid,
          user: other.id,
        },
        {
          ...valid,
          categories: {},
        },
        {
          ...valid,
          categories: [
            {
              category: "Wrong",
              amount: 1,
            },
          ],
        },
        {
          ...valid,
          categories: [
            {
              category: "Food",
              amount: 1,
            },
            {
              category: "Food",
              amount: 2,
            },
          ],
        },
        {
          ...valid,
          categories: [
            {
              category: "Food",
              amount: "1.001",
            },
          ],
        },
      ])
        assert.equal(
          (
            await request("saveBudget", {
              body,
            })
          ).status,
          400,
        );
      const value = await budget(null, [
        {
          category: "Food",
          amount: "0",
        },
      ]);
      assert.equal(value.overallPaise, null);
      assert.equal(value.categories[0].limitPaise, 0);
      assert.equal(
        (
          await request(
            {
              action: "getBudget",
              fields: {
                month: month,
              },
            },
            {
              as: otherToken,
            },
          )
        ).data.budget.categories.length,
        0,
      );
    },
  );
  await t.test(
    "alerts switch exactly at 80% and strictly above 100%, including category budgets",
    async () => {
      await reset();
      await budget("100", [
        {
          category: "Food",
          amount: "100",
        },
      ]);
      const main = await expense({
        amount: "79.99",
      });
      assert.equal((await summary()).alerts.length, 0);
      const penny = await expense({
        amount: "0.01",
      });
      let data = await summary();
      assert.equal(data.alerts.length, 2);
      assert.ok(data.alerts.every((row) => row.level === "warning"));
      assert.equal(
        await BudgetAlert.countDocuments({
          emailStatus: "pending",
        }),
        2,
      );
      await request(
        {
          action: "updateExpense",
          fields: {
            id: main._id,
          },
        },
        {
          body: {
            amount: "99.99",
          },
        },
      );
      data = await summary();
      assert.equal(data.totalPaise, 10000);
      assert.ok(data.alerts.every((row) => row.level === "warning"));
      const extra = await expense({
        amount: "0.01",
      });
      data = await summary();
      assert.equal(data.remainingPaise, -1);
      assert.ok(data.alerts.every((row) => row.level === "exceeded"));
      assert.equal(
        await BudgetAlert.countDocuments({
          level: "warning",
          emailStatus: "cancelled",
        }),
        2,
      );
      await request(
        {
          action: "deleteExpense",
          fields: {
            id: extra._id,
          },
        },
        {},
      );
      assert.equal(
        await BudgetAlert.countDocuments({
          level: "warning",
          emailStatus: "pending",
        }),
        2,
      );
      await request(
        {
          action: "deleteExpense",
          fields: {
            id: penny._id,
          },
        },
        {},
      );
    },
  );
  await t.test(
    "zero budget means zero, and clearing a budget cancels queued emails",
    async () => {
      await reset();
      await budget("0");
      assert.equal((await summary()).alerts.length, 0);
      await expense({
        amount: "0.01",
      });
      const data = await summary();
      assert.equal(data.alerts[0].level, "exceeded");
      assert.equal(data.alerts[0].percent, null);
      assert.equal(data.remainingPaise, -1);
      await budget(null);
      assert.equal((await summary()).alerts.length, 0);
      assert.equal(
        await BudgetAlert.countDocuments({
          emailStatus: "pending",
        }),
        0,
      );
    },
  );
  await t.test(
    "moving or deleting an expense rechecks both affected months",
    async () => {
      await reset();
      await budget("100");
      await budget("50", [], "2026-09");
      const item = await expense({
        amount: "90",
      });
      await request(
        {
          action: "updateExpense",
          fields: {
            id: item._id,
          },
        },
        {
          body: {
            date: "2026-09-30",
          },
        },
      );
      assert.equal(
        await BudgetAlert.countDocuments({
          month,
          emailStatus: "pending",
        }),
        0,
      );
      assert.equal(
        await BudgetAlert.countDocuments({
          month: "2026-09",
          emailStatus: "pending",
          level: "exceeded",
        }),
        1,
      );
      assert.equal(
        (
          await request(
            {
              action: "deleteExpense",
              fields: {
                id: item._id,
              },
            },
            {},
          )
        ).status,
        200,
      );
      assert.equal(
        await BudgetAlert.countDocuments({
          emailStatus: "pending",
        }),
        0,
      );
      assert.equal(
        (
          await request({
            action: "getExpense",
            fields: {
              id: item._id,
            },
          })
        ).status,
        404,
      );
    },
  );
  await t.test(
    "missing email configuration keeps the outbox pending without false success",
    async () => {
      await reset();
      await budget("100");
      await expense({
        amount: "80",
      });
      assert.equal(await deliverBudgetEmails(), 0);
      const row = await BudgetAlert.findOne();
      assert.equal(row.emailStatus, "pending");
      assert.equal(row.emailAttempts, 0);
      assert.equal(row.sentAt, null);
      const data = await summary();
      assert.equal(data.emailConfigured, false);
      assert.equal(JSON.stringify(data).includes("emailClaimToken"), false);
    },
  );
  await t.test(
    "failed email attempts back off and remain retryable",
    async () => {
      const now = new Date();
      assert.equal(
        await deliverBudgetEmails({
          now,
          configured: true,
          send: async () => {
            throw Object.assign(new Error("Test outage"), {
              code: "ETEST",
            });
          },
        }),
        0,
      );
      const row = await BudgetAlert.findOne();
      assert.equal(row.emailAttempts, 1);
      assert.ok(row.nextAttemptAt > now);
      assert.equal(row.emailStatus, "pending");
      await deliverBudgetEmails({
        now,
        configured: true,
        send: async () => {
          throw new Error("Should not be retried early");
        },
      });
      assert.equal((await BudgetAlert.findById(row.id)).emailAttempts, 1);
    },
  );
  await t.test(
    "real Nodemailer delivers the budget email through a loopback SMTP server",
    async () => {
      smtp = new SMTPServer({
        authOptional: true,
        disabledCommands: ["AUTH", "STARTTLS"],
        logger: false,
        onData(stream, _session, callback) {
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            received.push(Buffer.concat(chunks));
            callback();
          });
        },
      });
      await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
      process.env.SMTP_HOST = "127.0.0.1";
      process.env.SMTP_PORT = String(smtp.server.address().port);
      process.env.SMTP_SECURE = "false";
      process.env.EMAIL_FROM = "utilityhub@example.test";
      await BudgetAlert.updateMany(
        {},
        {
          $set: {
            nextAttemptAt: new Date(Date.now() - 60000),
          },
        },
      );
      assert.equal(await deliverBudgetEmails(), 1);
      const mail = await simpleParser(received[0]);
      assert.equal(mail.to.value[0].address, user.email);
      assert.match(mail.subject, /warning: overall \(2026-10\)/);
      assert.match(mail.text, /at least 80%/);
      assert.match(mail.text, /80\.00/);
      assert.match(mail.text, /100\.00/);
      await enqueueBudgetAlerts(user._id, month);
      assert.equal(await deliverBudgetEmails(), 0);
    },
  );
  await t.test(
    "saving an identical budget does not rearm emails, but a changed limit does",
    async () => {
      const original = await Budget.findOne();
      await budget("100");
      assert.equal(
        (await Budget.findById(original.id)).revision,
        original.revision,
      );
      assert.equal(await deliverBudgetEmails(), 0);
      await budget("50");
      assert.equal(
        (await Budget.findById(original.id)).revision,
        original.revision + 1,
      );
      assert.equal(await deliverBudgetEmails(), 1);
      assert.equal(received.length, 2);
      const mail = await simpleParser(received[1]);
      assert.match(mail.subject, /exceeded/);
      assert.match(mail.text, /exceeded by/);
    },
  );
  await t.test(
    "concurrent evaluators and email workers avoid duplicate queue entries and sends",
    async () => {
      await reset();
      await budget("100");
      await expense({
        amount: "90",
      });
      await Promise.all([
        enqueueBudgetAlerts(user._id, month),
        enqueueBudgetAlerts(user._id, month),
      ]);
      assert.equal(await BudgetAlert.countDocuments(), 1);
      const result = await Promise.all([
        deliverBudgetEmails(),
        deliverBudgetEmails(),
        deliverBudgetEmails(),
      ]);
      assert.equal(
        result.reduce((sum, value) => sum + value, 0),
        1,
      );
      assert.equal(received.length, 3);
    },
  );
  await t.test(
    "expired email leases recover and stale alerts are rechecked before sending",
    async () => {
      await reset();
      await budget("100");
      const item = await expense({
        amount: "90",
      });
      await BudgetAlert.updateMany(
        {},
        {
          $set: {
            emailStatus: "sending",
            emailLockUntil: new Date(Date.now() - 60000),
            emailClaimToken: "crashed-worker",
          },
        },
      );
      assert.equal(await deliverBudgetEmails(), 1);
      assert.equal(received.length, 4);
      await budget("80"); // A new warning revision, still not exceeded at 90 -> exceeded.
      await Expense.updateOne(
        {
          _id: item._id,
        },
        {
          $set: {
            amountPaise: 100,
          },
        },
      );
      assert.equal(await deliverBudgetEmails(), 0);
      assert.equal(
        await BudgetAlert.countDocuments({
          emailStatus: "cancelled",
        }),
        1,
      );
    },
  );
  await t.test(
    "the scheduler catches up a missing outbox on startup and stops cleanly",
    async () => {
      await reset();
      await budget("100");
      await expense({
        amount: "80",
      });
      await BudgetAlert.deleteMany({});
      process.env.BUDGET_ALERTS_ENABLED = "true";
      const stop = startBudgetAlertScheduler();
      try {
        for (let index = 0; index < 40; index += 1) {
          if (
            await BudgetAlert.exists({
              emailStatus: "sent",
            })
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.equal(
          await BudgetAlert.countDocuments({
            emailStatus: "sent",
          }),
          1,
        );
      } finally {
        stop();
        process.env.BUDGET_ALERTS_ENABLED = "false";
      }
    },
  );
  await t.test(
    "each email claim gets a fresh lease even after a slow earlier delivery",
    async (sub) => {
      await reset();
      await budget("100", [
        {
          category: "Food",
          amount: "100",
        },
      ]);
      await expense({
        amount: "80",
      });
      let simulated = Date.now();
      sub.mock.method(Date, "now", () => simulated);
      const count = await deliverBudgetEmails({
        configured: true,
        send: async () => {
          const active = await BudgetAlert.findOne({
            emailStatus: "sending",
          }).select("+emailLockUntil");
          assert.ok(
            active.emailLockUntil.getTime() > simulated,
            "A new lease must not already be expired.",
          );
          simulated += 6 * 60000;
          return true;
        },
      });
      assert.equal(count, 2);
    },
  );
  await t.test(
    "CSV escapes quotes, line breaks, formula prefixes, and exports only the owner month",
    async () => {
      await reset();
      exportLimiter.resetKey("127.0.0.1");
      await expense({
        amount: "12.34",
        note: '=SUM(1,2)\nline,"quoted"',
      });
      await expense({
        date: "2026-09-30",
        note: "OTHER_MONTH_SECRET",
      });
      await expense(
        {
          note: "OTHER_USER_SECRET",
        },
        otherToken,
      );
      const file = await request(
        {
          action: "exportExpenses",
          fields: {
            month: month,
            format: "csv",
          },
        },
        {
          binary: true,
        },
      );
      assert.equal(file.status, 200);
      assert.match(file.headers.get("content-disposition"), /2026-10.csv/);
      assert.deepEqual([...file.data.subarray(0, 3)], [239, 187, 191]);
      const csv = file.data.toString("utf8");
      assert.match(csv, /"12\.34"/);
      assert.ok(csv.includes('"\'=SUM(1,2)\nline,""quoted"""'));
      assert.equal(csv.includes("SECRET"), false);
      for (const value of ["=SUM(1,2)", " +CMD", "\t@run", "\n-1", "＝1+1"])
        assert.ok(csvCell(value).startsWith("\"'"));
    },
  );
  await t.test(
    "PDF export wraps full notes, embeds rupees, repeats headings, and includes all pages",
    async () => {
      await reset();
      await Expense.insertMany(
        Array.from(
          {
            length: 80,
          },
          (_, index) => ({
            user: user._id,
            amountPaise: 12345,
            category: "Education",
            date: "2026-10-25",
            paymentMethod: "bank transfer",
            note: `Record ${String(index + 1).padStart(2, "0")}: ${"Long report note with wrapping. ".repeat(6)}\nFinal detail ${index + 1}.`,
          }),
        ),
      );
      const file = await request(
        {
          action: "exportExpenses",
          fields: {
            month: month,
            format: "pdf",
          },
        },
        {
          binary: true,
        },
      );
      assert.equal(file.status, 200);
      assert.match(file.headers.get("content-type"), /application\/pdf/);
      const doc = await PDFDocument.load(file.data);
      assert.ok(doc.getPageCount() > 2);
      const parser = new PDFParse({
        data: new Uint8Array(file.data),
      });
      try {
        const result = await parser.getText();
        assert.match(result.text, /Record 01/);
        assert.match(result.text, /Final detail 80/);
        assert.match(result.text, /9,876\.00/);
        assert.match(result.text, /José/);
        assert.match(result.text, /80 entries/);
      } finally {
        await parser.destroy();
      }
      assert.equal(
        (
          await request({
            action: "listExpenses",
            fields: {
              month: month,
            },
          })
        ).data.expenses.length,
        20,
      );
    },
  );
  await t.test(
    "empty exports work and unsupported PDF glyphs return an actionable error",
    async () => {
      await reset();
      const empty = await request(
        {
          action: "exportExpenses",
          fields: {
            month: month,
            format: "pdf",
          },
        },
        {
          binary: true,
        },
      );
      assert.equal(empty.status, 200);
      assert.equal((await PDFDocument.load(empty.data)).getPageCount(), 1);
      await expense({
        note: "A rocket 🚀",
      });
      const unsupported = await request({
        action: "exportExpenses",
        fields: {
          month: month,
          format: "pdf",
        },
      });
      assert.equal(unsupported.status, 422);
      assert.match(unsupported.data.message, /Export CSV/);
      const csv = await request(
        {
          action: "exportExpenses",
          fields: {
            month: month,
            format: "csv",
          },
        },
        {
          binary: true,
        },
      );
      assert.ok(csv.data.toString("utf8").includes("🚀"));
    },
  );
  await t.test(
    "invalid exports and row limits fail clearly instead of silently truncating",
    async () => {
      assert.equal(
        (
          await request({
            action: "exportExpenses",
            fields: {
              month: month,
              format: "exe",
            },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request({
            action: "exportExpenses",
            fields: {
              month: "bad",
              format: "pdf",
            },
          })
        ).status,
        400,
      );
      await reset();
      await Expense.insertMany(
        Array.from(
          {
            length: 5001,
          },
          () => ({
            user: user._id,
            amountPaise: 1,
            category: "Other",
            date: `${month}-01`,
          }),
        ),
      );
      assert.equal(
        (
          await request({
            action: "exportExpenses",
            fields: {
              month: month,
              format: "csv",
            },
          })
        ).status,
        413,
      );
    },
  );
  await t.test(
    "dashboard activity includes expenses, while task activity remains task-only",
    async () => {
      const activities = (await request("recentActivity")).data.activities;
      assert.ok(activities.some((row) => row.action.startsWith("expense_")));
      assert.ok(
        (
          await request("recentActivity", { body: { tasksOnly: true } })
        ).data.activities.every((row) => row.action.startsWith("task_")),
      );
      assert.ok(
        (
          await request("recentActivity", {
            as: otherToken,
          })
        ).data.activities.every((row) => row.title !== "OTHER_MONTH_SECRET"),
      );
    },
  );
  await t.test(
    "expenses pagination accepts JSON numbers and rejects invalid page values",
    async () => {
      const result = await request("listExpenses", {
        body: { month: "2026-10", page: 1, limit: 20 },
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.pagination.page, 1);
      for (const page of [0, -1, 1.5, true, null, [], {}]) {
        assert.equal(
          (
            await request("listExpenses", {
              body: { month: "2026-10", page, limit: 20 },
            })
          ).status,
          400,
        );
      }
    },
  );
});
