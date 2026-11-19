import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/authMiddleware.js";
import { getMe, login, register } from "./authController.js";
import * as tasks from "./taskController.js";
import * as notes from "./noteController.js";
import * as expenses from "./expenseController.js";
import * as notifications from "./notificationController.js";
import Task from "../models/Task.js";
import Note from "../models/Note.js";
import Expense from "../models/Expense.js";
import Budget from "../models/Budget.js";
import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
const signInLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many sign-in attempts. Please try again in 15 minutes.",
  },
});

// Every React request names an action. The functions below handle the work.
// Private actions always check the signed-in account before accessing MongoDB.
const actions = {
  serverHealth: [
    (_req, res) => {
      // Reports the server and database status.
      const connected = mongoose.connection.readyState === 1;
      res.status(connected ? 200 : 503).json({
        status: connected ? "ok" : "unavailable",
        service: "UtilityHub server",
        database: connected ? "connected" : "disconnected",
      });
    },
  ],
  register: [signInLimit, register],
  login: [signInLimit, login],
  getAccount: [protect, getMe],
  offlineSnapshot: [protect, async (req, res, next) => {
    try {
      const owner = { user: req.user._id };
      const [tasks, notes, expenses, budgets, activities, notifications] = await Promise.all([
        Task.find(owner).lean(), Note.find(owner).lean(), Expense.find(owner).lean(),
        Budget.find(owner).lean(), Activity.find(owner).sort({ createdAt: -1 }).limit(100).lean(),
        Notification.find(owner).sort({ createdAt: -1 }).limit(100).lean(),
      ]);
      res.json({ tasks, notes, expenses, budgets, activities, notifications });
    } catch (error) { next(error); }
  }],
  listTasks: [protect, tasks.listTasks],
  getTask: [protect, tasks.getTask],
  createTask: [protect, tasks.createTask],
  updateTask: [protect, tasks.updateTask],
  deleteTask: [protect, tasks.deleteTask],
  todayTasks: [protect, tasks.todaySummary],
  recentActivity: [protect, tasks.recentActivity],
  listNotifications: [protect, notifications.listNotifications],
  reminderSettings: [protect, notifications.reminderSettings],
  readNotification: [protect, notifications.readNotification],
  readAllNotifications: [protect, notifications.readAllNotifications],
  listExpenses: [protect, expenses.listExpenses],
  getExpense: [protect, expenses.getExpense],
  createExpense: [protect, expenses.createExpense],
  updateExpense: [protect, expenses.updateExpense],
  deleteExpense: [protect, expenses.deleteExpense],
  getBudget: [protect, expenses.getBudget],
  saveBudget: [protect, expenses.setBudget],
  expenseSummary: [protect, expenses.getSummary],
  exportExpenses: [protect, expenses.exportLimiter, expenses.exportExpenses],
  listNotes: [protect, notes.listNotes],
  createNote: [protect, notes.createNote],
  updateNote: [protect, notes.updateNote],
  deleteNote: [protect, notes.deleteNote],
  programStatus: [(_req, res) => res.json({ fileProcessing: "client", uploads: false })],
};
export function handleAction(req, res, next) {
  // Selects a named action and runs its checks.
  const name = req.query.action;
  if (typeof name !== "string" || !Object.hasOwn(actions, name)) {
    return res.status(400).json({
      message: "Choose a valid server action.",
    });
  }
  res.set("Cache-Control", "no-store");
  // Normal actions receive their fields directly in req.body.
  // Multer fills req.body and req.file/req.files for uploaded documents.
  if (
    req.is("application/json") &&
    (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
  ) {
    return res.status(400).json({
      message: "Send action fields as an object.",
    });
  }
  req.body ||= {};
  const steps = actions[name];
  let index = 0;
  function run(error) {
    // Runs the next action check or handler.
    if (error) return next(error);
    const step = steps[index++];
    if (!step) return next();
    try {
      step(req, res, run);
    } catch (err) {
      next(err);
    }
  }
  run();
}
