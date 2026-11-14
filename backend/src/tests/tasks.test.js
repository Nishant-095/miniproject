import { actionRequest } from "./helpers/actionRequest.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import app from "../app.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import Activity from "../models/Activity.js";
import {
  enqueueDueReminders,
  deliverPendingEmails,
  runReminderCycle,
  startReminderScheduler,
} from "../services/reminderService.js";
const databaseName = `utilityhub_tasks_test_${randomUUID().replaceAll("-", "")}`;
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.REMINDERS_ENABLED = "false";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.EMAIL_USER = "";
process.env.EMAIL_PASS = "";
process.env.SMTP_HOST = "";
process.env.EMAIL_FROM = "";
let server, base, user, other, token, otherToken, smtp;
const received = [];
const future = () => new Date(Date.now() + 3600000).toISOString();
const past = () => new Date(Date.now() - 3600000).toISOString();
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

async function create(body = {}) {
  const result = await request("createTask", {
    body: {
      title: "Submit assignment",
      dueAt: future(),
      ...body,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.task;
}
before(async () => {
  await mongoose.connect(
    process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017",
    {
      dbName: databaseName,
      serverSelectionTimeoutMS: 5000,
    },
  );
  await Promise.all([
    User.init(),
    Task.init(),
    Notification.init(),
    Activity.init(),
  ]);
  [user, other] = await User.create([
    {
      name: "Test Student",
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
    assert.equal(mongoose.connection.name, databaseName);
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});
test("Phase 3 private tasks, notifications, and reminder delivery", async (t) => {
  let task;
  await t.test("all task and reminder APIs require login", async () => {
    for (const path of [
      "listTasks",
      "todayTasks",
      "recentActivity",
      "listNotifications",
      "reminderSettings",
    ]) {
      assert.equal(
        (
          await request(path, {
            as: null,
          })
        ).status,
        401,
      );
    }
  });
  await t.test(
    "creates a complete task and hides reminder internals",
    async () => {
      task = await create({
        title: "  Finish project [v1]  ",
        description: "Test the PDF tools",
        priority: "high",
        category: "College",
        timeZone: "Asia/Kolkata",
      });
      assert.equal(task.title, "Finish project [v1]");
      assert.equal(task.user, user.id);
      assert.equal(task.completed, false);
      assert.equal(task.reminderVersion, undefined);
      assert.equal(task.reminderQueued, undefined);
      assert.equal(task.completedAt, null);
    },
  );
  await t.test(
    "rejects invalid fields, types, dates, and timezone injection",
    async () => {
      for (const body of [
        null,
        [],
        {},
        {
          title: " ",
        },
        {
          title: {},
        },
        {
          title: "a".repeat(121),
        },
        {
          title: "bad\nheader",
        },
        {
          title: "x",
          description: {},
        },
        {
          title: "x",
          category: [],
        },
        {
          title: "x",
          priority: "urgent",
        },
        {
          title: "x",
          user: other.id,
        },
        {
          title: "x",
          reminderVersion: 2,
        },
        {
          title: "x",
          completed: "true",
        },
        {
          title: "x",
          dueAt: "2026-02-30T10:00:00Z",
        },
        {
          title: "x",
          dueAt: "2026-01-01T10:00:00",
        },
        {
          title: "x",
          dueAt: "",
        },
        {
          title: "x",
          dueAt: "2026-10-25T24:00:00Z",
        },
        {
          title: "x",
          timeZone: "not/a/zone",
        },
      ])
        assert.equal(
          (
            await request("createTask", {
              body,
            })
          ).status,
          400,
          JSON.stringify(body),
        );
      assert.equal(
        (
          await request(
            {
              action: "updateTask",
              fields: {
                id: task._id,
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
  await t.test(
    "private ownership applies to read, edit, delete, and activity",
    async () => {
      for (const action of ["getTask", "updateTask", "deleteTask"]) {
        assert.equal(
          (
            await request(action, {
              body: {
                id: task._id,
                ...(action.startsWith("update")
                  ? {
                      title: "Taken over",
                    }
                  : {}),
              },
              as: otherToken,
            })
          ).status,
          404,
        );
      }
      assert.equal(
        (
          await request("listTasks", {
            as: otherToken,
          })
        ).data.tasks.length,
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
            action: "getTask",
            fields: {
              id: "not-an-id",
            },
          })
        ).status,
        400,
      );
    },
  );
  await t.test("search treats regex characters as literal text", async () => {
    assert.equal(
      (
        await request({
          action: "listTasks",
          fields: {
            q: "[v1]",
          },
        })
      ).data.tasks.length,
      1,
    );
    assert.equal(
      (
        await request({
          action: "listTasks",
          fields: {
            q: ".*",
          },
        })
      ).data.tasks.length,
      0,
    );
    assert.equal(
      (
        await request({
          action: "listTasks",
          fields: {
            q: "pdf",
          },
        })
      ).data.tasks.length,
      1,
    );
    assert.equal(
      (
        await request({
          action: "listTasks",
          fields: {
            q: "college",
          },
        })
      ).data.tasks.length,
      1,
    );
    for (const path of [
      {
        action: "listTasks",
        fields: {
          status: "bad",
        },
      },
      {
        action: "listTasks",
        fields: {
          page: "0",
        },
      },
      {
        action: "listTasks",
        fields: {
          limit: "101",
        },
      },
      {
        action: "listTasks",
        fields: {
          q: {
            x: "1",
          },
        },
      },
      {
        action: "listTasks",
        fields: {
          q: "x".repeat(101),
        },
      },
    ])
      assert.equal((await request(path)).status, 400);
  });
  await t.test(
    "edits every field, supports clearing a deadline, and keeps the owner",
    async () => {
      const changed = await request(
        {
          action: "updateTask",
          fields: {
            id: task._id,
          },
        },
        {
          body: {
            title: "Updated assignment",
            description: "Read chapter 2",
            priority: "low",
            category: "Study",
            dueAt: null,
            timeZone: "UTC",
          },
        },
      );
      assert.equal(changed.status, 200);
      assert.equal(changed.data.task.dueAt, null);
      assert.equal(changed.data.task.priority, "low");
      assert.equal(changed.data.task.category, "Study");
      assert.equal(changed.data.task.user, user.id);
      assert.equal(changed.data.task.reminderVersion, undefined);
    },
  );
  await t.test(
    "completion timestamps survive edits, and reopening clears them",
    async () => {
      const done = await request(
        {
          action: "updateTask",
          fields: {
            id: task._id,
          },
        },
        {
          body: {
            completed: true,
          },
        },
      );
      assert.ok(done.data.task.completedAt);
      const edited = await request(
        {
          action: "updateTask",
          fields: {
            id: task._id,
          },
        },
        {
          body: {
            title: "Done assignment",
          },
        },
      );
      assert.equal(edited.data.task.completedAt, done.data.task.completedAt);
      const reopened = await request(
        {
          action: "updateTask",
          fields: {
            id: task._id,
          },
        },
        {
          body: {
            completed: false,
          },
        },
      );
      assert.equal(reopened.data.task.completedAt, null);
    },
  );
  await t.test(
    "filters and paginates without silently dropping tasks",
    async () => {
      await create({
        title: "Completed item",
        completed: true,
        dueAt: past(),
      });
      await create({
        title: "Overdue item",
        dueAt: past(),
      });
      const overdue = await request({
        action: "listTasks",
        fields: {
          status: "overdue",
        },
      });
      assert.equal(overdue.data.tasks.length, 1);
      assert.equal(overdue.data.counts.all, 3);
      assert.equal(overdue.data.counts.completed, 1);
      const pending = await request({
        action: "listTasks",
        fields: {
          status: "pending",
          limit: "1",
          page: "2",
        },
      });
      assert.equal(pending.data.pagination.total, 2);
      assert.equal(pending.data.pagination.pages, 2);
      assert.equal(pending.data.tasks.length, 1);
    },
  );
  await t.test(
    "today summary respects client day bounds and actual completion time",
    async () => {
      const start = new Date("2028-10-24T18:30:00.000Z");
      const end = new Date("2028-10-25T18:30:00.000Z");
      await Task.create([
        {
          user: user._id,
          title: "At start",
          dueAt: start,
        },
        {
          user: user._id,
          title: "Before end",
          dueAt: new Date(end - 1),
        },
        {
          user: user._id,
          title: "At end",
          dueAt: end,
        },
        {
          user: user._id,
          title: "Really finished today",
          completed: true,
          completedAt: start,
        },
        {
          user: user._id,
          title: "Edited today, finished before",
          completed: true,
          completedAt: new Date(start - 1),
        },
      ]);
      const summary = await request({
        action: "todayTasks",
        fields: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      });
      assert.equal(summary.status, 200);
      assert.equal(summary.data.dueToday, 2);
      assert.equal(summary.data.completedToday, 1);
      assert.equal(
        (
          await request({
            action: "todayTasks",
            fields: {
              start: end.toISOString(),
              end: start.toISOString(),
            },
          })
        ).status,
        400,
      );
      await Task.deleteMany({
        title: {
          $in: [
            "At start",
            "Before end",
            "At end",
            "Really finished today",
            "Edited today, finished before",
          ],
        },
      });
    },
  );
  await t.test(
    "catches overdue tasks without email configuration and creates only one bell item",
    async () => {
      await Notification.deleteMany({});
      await Task.updateMany(
        {},
        {
          $set: {
            reminderQueued: false,
          },
        },
      );
      await Promise.all([
        enqueueDueReminders(),
        enqueueDueReminders(),
        enqueueDueReminders(),
      ]);
      assert.equal(await Notification.countDocuments(), 1);
      assert.equal(await deliverPendingEmails(), 0);
      const note = await Notification.findOne();
      assert.equal(note.emailStatus, "pending");
      assert.equal(note.emailAttempts, 0);
      const list = await request("listNotifications");
      assert.equal(list.data.unreadCount, 1);
      assert.equal(list.data.notifications[0].emailClaimToken, undefined);
      assert.equal(list.data.notifications[0].lastError, undefined);
    },
  );
  await t.test("notification read state is private and persists", async () => {
    const note = await Notification.findOne();
    assert.equal(
      (
        await request("listNotifications", {
          as: otherToken,
        })
      ).data.unreadCount,
      0,
    );
    assert.equal(
      (
        await request(
          {
            action: "readNotification",
            fields: {
              id: note.id,
            },
          },
          {
            as: otherToken,
          },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          {
            action: "readNotification",
            fields: {
              id: note.id,
            },
          },
          {},
        )
      ).status,
      200,
    );
    assert.equal((await request("listNotifications")).data.unreadCount, 0);
    await Notification.updateOne(
      {
        _id: note._id,
      },
      {
        $set: {
          readAt: null,
        },
      },
    );
    await request("readAllNotifications", {});
    assert.equal((await request("listNotifications")).data.unreadCount, 0);
  });
  await t.test(
    "rescheduling cancels the old email and creates a new reminder at its new deadline",
    async () => {
      const old = await Notification.findOne();
      await request(
        {
          action: "updateTask",
          fields: {
            id: old.task,
          },
        },
        {
          body: {
            dueAt: future(),
          },
        },
      );
      assert.equal(
        (await Notification.findById(old.id)).emailStatus,
        "cancelled",
      );
      assert.equal(
        (await request("listNotifications")).data.notifications.length,
        0,
      );
      const newDue = new Date(Date.now() - 1000).toISOString();
      const updated = await request(
        {
          action: "updateTask",
          fields: {
            id: old.task,
          },
        },
        {
          body: {
            dueAt: newDue,
          },
        },
      );
      assert.equal(updated.status, 200, JSON.stringify(updated.data));
      const notes = await Notification.find({
        task: old.task,
      }).sort({
        reminderVersion: 1,
      });
      assert.equal(notes.length, 2);
      assert.ok(notes[1].reminderVersion > old.reminderVersion);
      assert.equal(notes[1].emailStatus, "pending");
    },
  );
  await t.test(
    "completion cancels a queued email; reopening rearms one reminder",
    async () => {
      const note = await Notification.findOne({
        emailStatus: "pending",
      });
      await request(
        {
          action: "updateTask",
          fields: {
            id: note.task,
          },
        },
        {
          body: {
            completed: true,
          },
        },
      );
      assert.equal(
        (await Notification.findById(note.id)).emailStatus,
        "cancelled",
      );
      await request(
        {
          action: "updateTask",
          fields: {
            id: note.task,
          },
        },
        {
          body: {
            completed: false,
          },
        },
      );
      assert.equal(
        await Notification.countDocuments({
          task: note.task,
          emailStatus: "pending",
        }),
        1,
      );
      await enqueueDueReminders();
      assert.equal(
        await Notification.countDocuments({
          task: note.task,
          emailStatus: "pending",
        }),
        1,
      );
    },
  );
  await t.test(
    "SMTP failure is retained and retried instead of marked sent",
    async () => {
      const now = new Date();
      const send = async () => {
        throw Object.assign(new Error("Local test outage"), {
          code: "ETEST",
        });
      };
      assert.equal(
        await deliverPendingEmails({
          now,
          send,
          configured: true,
        }),
        0,
      );
      const note = await Notification.findOne({
        emailStatus: "pending",
      }).select("+lastError");
      assert.equal(note.emailAttempts, 1);
      assert.ok(note.nextAttemptAt > now);
      assert.equal(note.sentAt, null);
      assert.match(note.lastError, /failed/);
      assert.equal(
        await deliverPendingEmails({
          now,
          configured: true,
          send,
        }),
        0,
      );
      assert.equal((await Notification.findById(note.id)).emailAttempts, 1);
    },
  );
  await t.test(
    "real Nodemailer SMTP delivery has escaped HTML and the correct recipient",
    async () => {
      await Task.deleteMany({});
      await Notification.deleteMany({});
      const reminder = await create({
        title: "Review <script> & chapter",
        description: "<img src=x onerror=bad()>",
        dueAt: past(),
      });
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
      process.env.EMAIL_FROM = "utilityhub@example.test";
      process.env.SMTP_SECURE = "false";
      assert.equal(await deliverPendingEmails(), 1);
      assert.equal(received.length, 1);
      const message = await simpleParser(received[0]);
      assert.equal(message.to.value[0].address, user.email);
      assert.match(message.subject, /Review <script> & chapter/);
      assert.match(message.html, /&lt;script&gt; &amp; chapter/);
      assert.match(message.html, /&lt;img src=x onerror=bad\(\)&gt;/);
      assert.match(message.text, /Asia\/Kolkata/);
      assert.equal(
        (
          await Notification.findOne({
            task: reminder._id,
          })
        ).emailStatus,
        "sent",
      );
      await runReminderCycle();
      assert.equal(received.length, 1);
      const settings = await request("reminderSettings");
      assert.equal(settings.data.emailConfigured, true);
      assert.equal(
        JSON.stringify(settings.data).includes("example.test"),
        false,
      );
    },
  );
  await t.test(
    "concurrent delivery does not send the same queued email twice",
    async () => {
      await create({
        title: "One email only",
        dueAt: past(),
      });
      const counts = await Promise.all([
        deliverPendingEmails(),
        deliverPendingEmails(),
        deliverPendingEmails(),
      ]);
      assert.equal(
        counts.reduce((a, b) => a + b, 0),
        1,
      );
      assert.equal(received.length, 2);
    },
  );
  await t.test(
    "an expired worker lease is recoverable after a process crash",
    async () => {
      const reminder = await create({
        title: "Recover reminder",
        dueAt: past(),
      });
      await Notification.updateOne(
        {
          task: reminder._id,
        },
        {
          $set: {
            emailStatus: "sending",
            emailLockUntil: new Date(Date.now() - 60000),
            emailClaimToken: "old-worker",
          },
        },
      );
      assert.equal(await deliverPendingEmails(), 1);
      assert.equal(received.length, 3);
    },
  );
  await t.test(
    "delivery rechecks the task and skips completed or deleted tasks",
    async () => {
      const a = await create({
        title: "Already finished",
        dueAt: past(),
      });
      const b = await create({
        title: "Already deleted",
        dueAt: past(),
      });
      await Task.updateOne(
        {
          _id: a._id,
        },
        {
          $set: {
            completed: true,
          },
        },
      );
      await Task.deleteOne({
        _id: b._id,
      });
      assert.equal(await deliverPendingEmails(), 0);
      assert.equal(received.length, 3);
      assert.equal(
        await Notification.countDocuments({
          task: {
            $in: [a._id, b._id],
          },
          emailStatus: "cancelled",
        }),
        2,
      );
    },
  );
  await t.test(
    "delete removes task notifications and preserves a private activity record",
    async () => {
      const reminder = await create({
        title: "Remove me",
        dueAt: past(),
      });
      assert.equal(
        (
          await request(
            {
              action: "deleteTask",
              fields: {
                id: reminder._id,
              },
            },
            {},
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request({
            action: "getTask",
            fields: {
              id: reminder._id,
            },
          })
        ).status,
        404,
      );
      assert.equal(
        await Notification.countDocuments({
          task: reminder._id,
        }),
        0,
      );
      const activities = (await request("recentActivity")).data.activities;
      assert.equal(activities[0].action, "task_deleted");
      assert.equal(activities[0].title, "Remove me");
    },
  );
  await t.test(
    "scheduler starts, processes startup backlog, and stops cleanly",
    async () => {
      const due = await create({
        title: "Startup catch-up",
        dueAt: past(),
      });
      process.env.REMINDERS_ENABLED = "true";
      const stop = startReminderScheduler();
      try {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const note = await Notification.findOne({
            task: due._id,
          });
          if (note?.emailStatus === "sent") break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.equal(
          (
            await Notification.findOne({
              task: due._id,
            })
          ).emailStatus,
          "sent",
        );
      } finally {
        stop();
        process.env.REMINDERS_ENABLED = "false";
      }
    },
  );
  await t.test(
    "tasks pagination accepts JSON numbers and rejects invalid page values",
    async () => {
      const result = await request("listTasks", {
        body: { page: 1, limit: 20 },
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.pagination.page, 1);
      for (const page of [0, -1, 1.5, true, null, [], {}]) {
        assert.equal(
          (await request("listTasks", { body: { page, limit: 20 } })).status,
          400,
        );
      }
    },
  );
});
