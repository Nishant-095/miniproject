import { randomUUID } from "node:crypto";
import cron from "node-cron";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { emailConfigured, sendEmail } from "./emailService.js";
export { sendEmail } from "./emailService.js";

// Older task documents have no version. Treat those as version zero.
export function versionFilter(version) {
  // Matches the correct task reminder version.
  return version === 0
    ? {
        $or: [
          {
            reminderVersion: 0,
          },
          {
            reminderVersion: {
              $exists: false,
            },
          },
        ],
      }
    : {
        reminderVersion: version,
      };
}
export async function enqueueDueReminders({
  now = new Date(),
  userId,
  limit = 100,
} = {}) {
  // Queues due task reminders without duplicates.
  const tasks = await Task.find({
    ...(userId
      ? {
          user: userId,
        }
      : {}),
    completed: false,
    reminderQueued: {
      $ne: true,
    },
    dueAt: {
      $lte: now,
      $ne: null,
    },
  })
    .sort({
      dueAt: 1,
    })
    .limit(limit)
    .select("+reminderVersion")
    .lean();
  for (const task of tasks) {
    const version = task.reminderVersion || 0;
    let notification;
    try {
      notification = await Notification.findOneAndUpdate(
        {
          task: task._id,
          reminderVersion: version,
        },
        {
          $setOnInsert: {
            user: task.user,
            title: task.title,
            dueAt: task.dueAt,
            nextAttemptAt: now,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      if (error.code === 11000) continue; // Another worker created the same reminder.
      throw error;
    }
    // Do not queue a stale reminder if the task changed during the upsert.
    const result = await Task.updateOne(
      {
        _id: task._id,
        completed: false,
        dueAt: task.dueAt,
        ...versionFilter(version),
      },
      {
        $set: {
          reminderQueued: true,
        },
      },
      {
        timestamps: false,
      },
    );
    if (result.matchedCount === 0) {
      await Notification.updateOne(
        {
          _id: notification._id,
        },
        {
          $set: {
            emailStatus: "cancelled",
            readAt: now,
          },
        },
      );
    }
  }
  return tasks.length;
}
export async function dismissTaskReminders(taskId, keepVersion = null) {
  // Cancels reminders for a completed or deleted task.
  const filter = {
    task: taskId,
    ...(keepVersion === null
      ? {}
      : {
          reminderVersion: {
            $ne: keepVersion,
          },
        }),
  };
  await Notification.updateMany(
    {
      ...filter,
      readAt: null,
    },
    {
      $set: {
        readAt: new Date(),
      },
    },
  );
  await Notification.updateMany(
    {
      ...filter,
      emailStatus: {
        $in: ["pending", "sending"],
      },
    },
    {
      $set: {
        emailStatus: "cancelled",
        emailClaimToken: "",
        emailLockUntil: null,
      },
    },
  );
}
function escapeHtml(value) {
  // Escapes text before inserting it into HTML.
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      // Replaces characters with safe HTML entities.
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}
let delivering = false;
export async function deliverPendingEmails({
  now = new Date(),
  send = sendEmail,
  configured = emailConfigured(),
  limit = 20,
} = {}) {
  // Sends due task emails and retries failures.
  if (!configured || delivering) return 0;
  delivering = true;
  let delivered = 0;
  const currentTime = () =>
    // Reads the current time for a worker lease.
    new Date(Math.max(now.getTime(), Date.now()));
  try {
    for (let i = 0; i < limit; i += 1) {
      const token = randomUUID();
      const claimTime = currentTime();
      // A database lease also protects against a second server instance.
      const note = await Notification.findOneAndUpdate(
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
            emailLockUntil: new Date(claimTime.getTime() + 5 * 60000),
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
      if (!note) break;
      const claim = {
        _id: note._id,
        emailStatus: "sending",
        emailClaimToken: token,
      };
      try {
        const task = await Task.findOne({
          _id: note.task,
          user: note.user,
          completed: false,
          dueAt: {
            $lte: now,
          },
          ...versionFilter(note.reminderVersion),
        });
        const user = task && (await User.findById(note.user));
        if (!task || !user || task.dueAt.getTime() !== note.dueAt.getTime()) {
          await Notification.updateOne(claim, {
            $set: {
              emailStatus: "cancelled",
              readAt: now,
              emailLockUntil: null,
              emailClaimToken: "",
            },
          });
          continue;
        }
        const due = new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: task.timeZone,
        }).format(task.dueAt);
        const sent = await send({
          to: user.email,
          subject: `UtilityHub reminder: ${task.title}`,
          text: `Hi ${user.name},\n\nYour task “${task.title}” is due.\nDue: ${due} (${task.timeZone})${task.description ? `\n\n${task.description}` : ""}\n\nOpen UtilityHub to review your tasks.`,
          html: `<p>Hi ${escapeHtml(user.name)},</p><p>Your task <strong>${escapeHtml(task.title)}</strong> is due.</p><p>Due: ${escapeHtml(due)} (${escapeHtml(task.timeZone)})</p>${task.description ? `<p style="white-space:pre-wrap">${escapeHtml(task.description)}</p>` : ""}<p>Open UtilityHub to review your tasks.</p>`,
        });
        if (!sent) throw new Error("Email is not configured.");
        await Notification.updateOne(claim, {
          $set: {
            emailStatus: "sent",
            sentAt: currentTime(),
            lastError: "",
            emailLockUntil: null,
            emailClaimToken: "",
          },
        });
        delivered += 1;
      } catch (error) {
        // Keep failures queued. Back off from one minute to at most one hour.
        const minutes = Math.min(60, 2 ** Math.min(note.emailAttempts - 1, 6));
        await Notification.updateOne(claim, {
          $set: {
            emailStatus: "pending",
            nextAttemptAt: new Date(currentTime().getTime() + minutes * 60000),
            lastError:
              "Email delivery failed. Check the SMTP settings and recipient.",
            emailLockUntil: null,
            emailClaimToken: "",
          },
        });
        console.warn(
          `Reminder email deferred (${error.code || "delivery error"}).`,
        );
      }
    }
  } finally {
    delivering = false;
  }
  return delivered;
}
export async function runReminderCycle(options = {}) {
  // Queues due reminders and delivers pending emails.
  await enqueueDueReminders(options);
  return deliverPendingEmails(options);
}
export function startReminderScheduler() {
  // Schedules regular task reminder checks.
  if (process.env.REMINDERS_ENABLED === "false")
    return () => {
      // Runs the returned operation when called.
    };
  const reportFailure = () =>
    // Reports a scheduled reminder-check failure.
    console.error("Reminder cycle failed. It will retry next minute.");
  const run = async () => {
    // Runs one reminder check without overlapping work.
    try {
      await enqueueDueReminders();
      // Slow SMTP delivery must not stop next minute's in-app reminder check.
      void deliverPendingEmails().catch(reportFailure);
    } catch {
      reportFailure();
    }
  };
  const job = cron.schedule("* * * * *", run, {
    timezone: "UTC",
    noOverlap: true,
  });
  void run(); // Catch overdue tasks after a restart as well as on each minute.
  console.log(
    `Task reminders enabled. Email ${emailConfigured() ? "configured" : "not configured; in-app reminders still work"}.`,
  );
  return () => {
    // Stops the scheduled background check.
    job.stop();
    job.destroy();
  };
}
