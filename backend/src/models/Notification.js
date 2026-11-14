import mongoose from "mongoose";
const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    reminderVersion: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 120,
    },
    dueAt: {
      type: Date,
      required: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    emailStatus: {
      type: String,
      enum: ["pending", "sending", "sent", "cancelled"],
      default: "pending",
    },
    emailAttempts: {
      type: Number,
      default: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
    },
    emailLockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    emailClaimToken: {
      type: String,
      default: "",
      select: false,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
      maxlength: 300,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);
notificationSchema.index(
  {
    task: 1,
    reminderVersion: 1,
  },
  {
    unique: true,
  },
);
notificationSchema.index({
  user: 1,
  createdAt: -1,
});
notificationSchema.index({
  emailStatus: 1,
  nextAttemptAt: 1,
});
export default mongoose.model("Notification", notificationSchema);
