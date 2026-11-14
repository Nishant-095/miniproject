import Notification from "../models/Notification.js";
import { emailConfigured } from "../services/emailService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { checkId } from "../utils/taskValidation.js";
import { httpError } from "../utils/httpError.js";
const fields = "task title dueAt readAt emailStatus sentAt createdAt";
export const listNotifications = asyncHandler(async (req, res) => {
  // Returns this account's reminders and unread count.
  const owner = {
    user: req.user._id,
    emailStatus: {
      $ne: "cancelled",
    },
  };
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(owner)
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .limit(20)
      .select(fields),
    Notification.countDocuments({
      ...owner,
      readAt: null,
    }),
  ]);
  res.json({
    notifications,
    unreadCount,
  });
});
export const reminderSettings = (_req, res) =>
  // Reports reminder setup without exposing credentials.
  res.json({
    emailConfigured: emailConfigured(),
    schedulerEnabled: process.env.REMINDERS_ENABLED !== "false",
  });
export const readAllNotifications = asyncHandler(async (req, res) => {
  // Marks every owned reminder as read.
  await Notification.updateMany(
    {
      user: req.user._id,
      readAt: null,
    },
    {
      $set: {
        readAt: new Date(),
      },
    },
  );
  res.json({
    message: "All reminders marked as read.",
  });
});
export const readNotification = asyncHandler(async (req, res) => {
  // Marks one owned reminder as read.
  checkId(req.body.id);
  const notification = await Notification.findOneAndUpdate(
    {
      _id: req.body.id,
      user: req.user._id,
    },
    {
      $set: {
        readAt: new Date(),
      },
    },
    {
      new: true,
    },
  ).select(fields);
  if (!notification) throw httpError(404, "Notification not found.");
  res.json({
    notification,
  });
});
