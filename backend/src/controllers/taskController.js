import Task from "../models/Task.js";
import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import {
  checkId,
  parseDate,
  positiveInteger,
  validateTask,
} from "../utils/taskValidation.js";
import {
  dismissTaskReminders,
  enqueueDueReminders,
} from "../services/reminderService.js";
function publicTask(task) {
  // Removes internal reminder fields from task responses.
  const value = task.toObject();
  delete value.reminderVersion;
  delete value.reminderQueued;
  delete value.__v;
  return value;
}
async function recordActivity(task, action) {
  // Records a task change without blocking its save.
  // Logging should not turn a successful task change into a failed request.
  try {
    await Activity.create({
      user: task.user,
      task: task._id,
      title: task.title,
      action,
    });
  } catch {
    console.error("Could not save task activity.");
  }
}
async function ownedTask(req) {
  // Finds a task belonging to this account.
  checkId(req.body.id);
  const task = await Task.findOne({
    _id: req.body.id,
    user: req.user._id,
  }).select("+reminderVersion");
  if (!task) throw httpError(404, "Task not found.");
  return task;
}
export const listTasks = asyncHandler(async (req, res) => {
  // Searches, filters, and paginates owned tasks.
  const { status = "all", q = "" } = req.body;
  if (!["all", "pending", "completed", "overdue"].includes(status))
    throw httpError(400, "Choose all, pending, completed, or overdue.");
  if (typeof q !== "string" || q.length > 100)
    throw httpError(400, "Search must be text of 100 characters or fewer.");
  const page = positiveInteger(req.body.page, 1);
  const limit = positiveInteger(req.body.limit, 20, 100);
  const owner = {
    user: req.user._id,
  };
  const now = new Date();
  const overdue = {
    ...owner,
    completed: false,
    dueAt: {
      $lt: now,
      $ne: null,
    },
  };
  const filter = {
    ...owner,
  };
  if (status === "pending") filter.completed = false;
  if (status === "completed") filter.completed = true;
  if (status === "overdue") Object.assign(filter, overdue);
  const search = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (search)
    filter.$or = ["title", "description", "category"].map((field) =>
      // Builds a value for each item.
      ({
        [field]: {
          $regex: search,
          $options: "i",
        },
      }),
    );
  const [tasks, total, all, pending, completed, late] = await Promise.all([
    Task.find(filter)
      .sort({
        completed: 1,
        dueAt: 1,
        createdAt: -1,
        _id: 1,
      })
      .skip((page - 1) * limit)
      .limit(limit),
    Task.countDocuments(filter),
    Task.countDocuments(owner),
    Task.countDocuments({
      ...owner,
      completed: false,
    }),
    Task.countDocuments({
      ...owner,
      completed: true,
    }),
    Task.countDocuments(overdue),
  ]);
  res.json({
    tasks: tasks.map(publicTask),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
    counts: {
      all,
      pending,
      completed,
      overdue: late,
    },
  });
});
export const getTask = asyncHandler(async (req, res) =>
  // Returns one owned task.
  res.json({
    task: publicTask(await ownedTask(req)),
  }),
);
export const createTask = asyncHandler(async (req, res) => {
  // Validates and saves a new task.
  const { offlineId, ...body } = req.body;
  if (offlineId) {
    checkId(offlineId);
    const existing = await Task.findOne({ _id: offlineId, user: req.user._id });
    if (existing) return res.json({ task: publicTask(existing) });
  }
  const values = validateTask(body);
  const task = await Task.create({
    ...values,
    ...(offlineId ? { _id: offlineId } : {}),
    user: req.user._id,
    completedAt: values.completed ? new Date() : null,
  });
  await recordActivity(task, "task_created");
  await enqueueDueReminders({
    userId: req.user._id,
  }).catch(() =>
    // Handles a failed operation.
    console.error("Reminder will be retried by the scheduler."),
  );
  res.status(201).json({
    task: publicTask(task),
  });
});
export const updateTask = asyncHandler(async (req, res) => {
  // Updates a task and manages reminder changes.
  const { id, ...fields } = req.body;
  const values = validateTask(fields, true);
  const task = await ownedTask(req);
  const wasCompleted = task.completed;
  const dueChanged =
    values.dueAt !== undefined &&
    (values.dueAt?.getTime() ?? null) !== (task.dueAt?.getTime() ?? null);
  const reopened = wasCompleted && values.completed === false;
  if (values.completed === true && !wasCompleted)
    values.completedAt = new Date();
  if (reopened) values.completedAt = null;
  task.set(values);
  if (dueChanged || reopened) {
    task.$inc("reminderVersion", 1);
    task.reminderQueued = false;
  }
  try {
    await task.save();
  } catch (error) {
    if (error.name === "VersionError")
      throw httpError(
        409,
        "This task changed in another window. Refresh and try again.",
      );
    throw error;
  }
  if (dueChanged || reopened || task.completed)
    await dismissTaskReminders(
      task._id,
      task.completed ? null : task.reminderVersion,
    );
  await recordActivity(
    task,
    reopened
      ? "task_reopened"
      : !wasCompleted && task.completed
        ? "task_completed"
        : "task_updated",
  );
  await enqueueDueReminders({
    userId: req.user._id,
  }).catch(() =>
    // Handles a failed operation.
    console.error("Reminder will be retried by the scheduler."),
  );
  res.json({
    task: publicTask(task),
  });
});
export const deleteTask = asyncHandler(async (req, res) => {
  // Deletes a task and its reminders.
  const task = await ownedTask(req);
  await Task.deleteOne({
    _id: task._id,
    user: req.user._id,
  });
  await Notification.deleteMany({
    task: task._id,
    user: req.user._id,
  });
  await recordActivity(task, "task_deleted");
  res.json({
    message: "Task deleted.",
  });
});
export const todaySummary = asyncHandler(async (req, res) => {
  // Returns tasks and completion counts for today.
  let start;
  let end;
  if (req.body.start !== undefined || req.body.end !== undefined) {
    start = parseDate(req.body.start, "Start");
    end = parseDate(req.body.end, "End");
    if (end <= start || end - start > 48 * 3600000)
      throw httpError(400, "Choose a day range of at most 48 hours.");
  } else {
    start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    end = new Date(start.getTime() + 86400000);
  }
  const owner = {
    user: req.user._id,
  };
  const due = {
    ...owner,
    completed: false,
    dueAt: {
      $gte: start,
      $lt: end,
    },
  };
  const [tasks, dueToday, completedToday, overdue] = await Promise.all([
    Task.find(due)
      .sort({
        dueAt: 1,
        _id: 1,
      })
      .limit(8),
    Task.countDocuments(due),
    Task.countDocuments({
      ...owner,
      completed: true,
      completedAt: {
        $gte: start,
        $lt: end,
      },
    }),
    Task.countDocuments({
      ...owner,
      completed: false,
      dueAt: {
        $lt: new Date(),
        $ne: null,
      },
    }),
  ]);
  res.json({
    tasks: tasks.map(publicTask),
    dueToday,
    completedToday,
    overdue,
    start,
    end,
  });
});
export const recentActivity = asyncHandler(async (req, res) => {
  // Returns the account's latest recorded changes.
  const filter = {
    user: req.user._id,
  };
  if (req.body?.tasksOnly === true)
    filter.action = {
      $regex: "^task_",
    };
  const activities = await Activity.find(filter)
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(10)
    .select("action title task createdAt");
  res.json({
    activities,
  });
});
